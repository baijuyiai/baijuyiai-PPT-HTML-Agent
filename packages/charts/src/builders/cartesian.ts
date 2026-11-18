import type { ChartSpec } from '../types.js';
import { alpha, lighten } from '../palette.js';
import {
  accentOf, emphasisColor, type BuildContext,
} from './context.js';

/**
 * 直角坐标系系列的公共写法：柱 / 折线 / 面积 / 散点。
 *
 * 这四种的差别只在「形状怎么画」，配色、强调、线宽那一套完全一样，
 * 各写一遍必然漂——以前 `area` 的 `areaStyle` 就是特判进 `cartesianSeries` 的，
 * 加图表时很容易忘了带上它。
 */

/** 柱子上该圆哪两个角：纵向圆上面两个，横向圆右面两个（下/左贴轴，圆了会显得柱子浮起来） */
function barRadiusCorners(radius: number, horizontal: boolean): [number, number, number, number] {
  return horizontal
    ? [0, radius, radius, 0]
    : [radius, radius, 0, 0];
}

/** 均值线左端那个药丸上的数字。留一位小数就够，多了反而像没处理过 */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * 均值线：一条横贯的水平虚线，左端挂一个深色圆角药丸写「均值 N」。
 *
 * 参考图里那个药丸是**深色底 + 页面底色文字**——它要在一堆浅色柱子上跳出来，
 * 用弱化色的细字反而会被柱子盖住。
 *
 * 横向条形图里这条线要竖过来（`xAxis` 而不是 `yAxis`），否则它横穿一排柱子，
 * 看着像网格线。
 */
function averageMarkLine(ctx: BuildContext, values: number[], horizontal: boolean): Record<string, unknown> {
  const nums = values.filter((v) => Number.isFinite(v));
  if (nums.length === 0) return {};
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;

  return {
    markLine: {
      silent: true,
      symbol: 'none',
      animation: false,
      /*
        **淡化用 `alpha()` 调色，不要用 `opacity`。** markLine 的 `opacity` 会连
        标签一起带上——实测那个深色药丸被压成半透明，白底上一块灰印子，
        而参考图里它是实心的。给线单独调色，标签就还是实心。
      */
      lineStyle: { type: 'dashed', color: alpha(ctx.spec.theme.text, 0.55), width: 1 },
      label: {
        show: true,
        position: horizontal ? 'insideEndTop' : 'insideStartTop',
        formatter: `均值 ${round1(avg)}`,
        color: ctx.spec.theme.background,
        backgroundColor: ctx.spec.theme.text,
        padding: [4, 8],
        borderRadius: 8,
        fontSize: 12,
      },
      data: [horizontal ? { xAxis: avg } : { yAxis: avg }],
    },
  };
}

export function cartesianSeries(
  ctx: BuildContext,
  kind: Extract<ChartSpec['kind'], 'bar' | 'line' | 'area' | 'scatter'>,
  opts: { horizontal?: boolean; negateFrom?: number } = {},
): Record<string, unknown>[] {
  const { usage, spec } = ctx;
  const horizontal = opts.horizontal ?? false;
  // `area` 在 ECharts 里就是带 `areaStyle` 的折线，没有独立的 series type
  const type = kind === 'area' ? 'line' : kind;

  return (spec.series ?? []).map((s, i) => {
    const color = emphasisColor(ctx, i);
    // 分向条形图：从 `negateFrom` 起的那几条取负值，与前面的背向排开
    const negate = opts.negateFrom !== undefined && i >= opts.negateFrom;
    const values = negate ? s.values.map((v) => -v) : s.values;

    const item: Record<string, unknown> = { name: s.name, type, data: values, itemStyle: { color } };

    if (kind === 'area' || (kind === 'line' && usage.areaFill)) {
      /*
        渐变填充用**声明式写法**，不引 `echarts.graphic.LinearGradient`——
        builders 这一层刻意不 import echarts 运行时（`buildOption` 是纯 option 对象）。
        `colorStops` 里要 `rgba`：八位 hex 在 zrender 的部分颜色路径上不被认。
      */
      item.areaStyle = usage.areaGradient
        ? {
          color: {
            type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: alpha(color, 0.35) },
              { offset: 1, color: alpha(color, 0) },
            ],
          },
        }
        : { opacity: 0.15 };
    }
    if (kind === 'line' || kind === 'area') {
      item.smooth = false;
      item.lineStyle = { width: usage.lineWidth, color };
      if (usage.lineMarkers) {
        item.symbol = 'circle';
        item.symbolSize = 8;
        item.showSymbol = true;
      }
    }
    if (kind === 'bar') {
      /*
        柱子上限按**类目宽度的百分比**给，不写死像素。

        原来写死 36px：一张 1040px 宽的图里只放两个类目时，每类占 520px，
        那两根柱子细得像两根针（用户报「柱状图宽度增加」）。改成百分比之后，
        两个类目时柱子有 230px 左右，十二个类目时又自动收窄到三十几像素——
        两种场合都成立，不用为类别数分档。
      */
      item.barMaxWidth = '46%';
      if (usage.barRadius > 0) {
        item.itemStyle = { color, borderRadius: barRadiusCorners(usage.barRadius, horizontal) };
      }
      if (usage.barLabels) {
        item.label = {
          show: true,
          // 横向条标签在右端，纵向柱在顶上——写死 'top' 会让横向图的字压在柱子上
          position: horizontal ? 'right' : 'top',
          color: ctx.spec.theme.muted,
          fontSize: 12,
        };
      }
    }
    if (kind === 'scatter') {
      item.symbolSize = 8;
      item.itemStyle = { color };
    }

    /*
      把「哪一根最要紧」说出来。两种口径，**要的是不同的东西**：

      - `max-bar`：最大值那根**换成强调色**，其余不动。适合强调色与主色差得开的风格。
      - `focus-max`：最大值那根保持原色，**其余变淡**。参考图（仪表盘那套）用的就是这个
        ——实测踩过：拿 `max-bar` 配一套强调色与品牌色都是蓝的风格，高亮的那根
        几乎看不出来，等于白做。

      两种都会连带把标签加重，否则数值和别的柱子一样淡。
    */
    const focus = usage.emphasis === 'max-bar' || usage.emphasis === 'focus-max';
    if (kind === 'bar' && focus) {
      const max = Math.max(...values);
      const maxIndex = values.indexOf(max);
      if (maxIndex >= 0) {
        const focusColor = usage.emphasis === 'max-bar' ? accentOf(ctx) : color;
        const corner = usage.barRadius > 0 ? barRadiusCorners(usage.barRadius, horizontal) : undefined;
        item.data = values.map((v, idx) => {
          if (idx === maxIndex) {
            return {
              value: v,
              itemStyle: { color: focusColor, ...(corner ? { borderRadius: corner } : {}) },
              ...(usage.barLabels ? { label: { color: focusColor, fontWeight: 'bold' } } : {}),
            };
          }
          // focus-max 才压其余柱；max-bar 只管那一根
          if (usage.emphasis === 'focus-max') {
            return {
              value: v,
              itemStyle: { color: lighten(color, 0.82), ...(corner ? { borderRadius: corner } : {}) },
            };
          }
          return v;
        });
      }
    }

    // 均值线只挂在第一条序列上：几条序列各画一条均值线会变成一堆平行虚线
    if (i === 0 && usage.averageLine && (kind === 'bar' || kind === 'line' || kind === 'area')) {
      Object.assign(item, averageMarkLine(ctx, values, horizontal));
    }

    return item;
  });
}
