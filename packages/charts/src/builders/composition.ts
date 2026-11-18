import type { CompositionKind } from '@lumen/ir-schema/chart-kind';
import { seriesColor, type BuildContext, type KindBuilder } from './context.js';

/** 构成类：树状图、饼图、分解树、旭日图 */

/**
 * 树状图。面积就是占比，不需要额外说明。
 *
 * 关掉面包屑与漫游：那是交互态的东西，静态图里面包屑只是压在图上的一条灰带。
 */
function treemap(ctx: BuildContext): Record<string, unknown> {
  const hierarchy = ctx.spec.hierarchy;
  const bg = ctx.spec.theme.background;

  return {
    series: [{
      type: 'treemap',
      data: hierarchy ? [hierarchy] : [],
      roam: false,
      nodeClick: false,
      breadcrumb: { show: false },
      width: '100%',
      height: '100%',
      top: 8, bottom: 8, left: 8, right: 8,
      label: {
        show: true,
        formatter: '{b}',
        color: ctx.spec.theme.background,
        fontSize: 15,
      },
      upperLabel: { show: false },
      itemStyle: { borderColor: bg, borderWidth: 3, gapWidth: 3 },
      levels: [
        { itemStyle: { borderColor: bg, borderWidth: 3, gapWidth: 3 } },
        { itemStyle: { borderColor: bg, borderWidth: 2, gapWidth: 2 } },
      ],
    }],
  };
}

/**
 * 饼图（环形）。取首个 series，类目当扇区名。
 *
 * 环心留空：中间那块是这类版面唯一能放「总计」的地方，
 * 画成实心饼等于把版面最贵的一块面积涂掉了。
 *
 * `donutCap: 'round'` 时扇区端点是圆头、环也更粗（参考图那套）——
 * 圆头要留出边距，不然相邻扇区的圆角会叠在一起，所以半径区间跟着收窄。
 */
function pie(ctx: BuildContext): Record<string, unknown> {
  const first = ctx.spec.series?.[0];
  const values = first?.values ?? [];
  const data = (ctx.spec.categories ?? []).map((name, i) => ({ name, value: values[i] ?? 0 }));
  const round = ctx.usage.donutCap === 'round';

  return {
    series: [{
      name: first?.name ?? '',
      type: 'pie',
      radius: round ? ['52%', '76%'] : ['45%', '70%'],
      data,
      color: ctx.palette,
      itemStyle: {
        // 扇区之间用页面底色留缝。圆头时缝要宽一点，否则相邻的圆角会咬在一起
        borderColor: ctx.spec.theme.background,
        borderWidth: round ? 3 : 1,
        ...(round ? { borderRadius: 8 } : {}),
      },
      label: { show: true, formatter: '{b} {d}%', color: ctx.spec.theme.text },
      labelLine: { show: true },
    }],
  };
}

/**
 * 分解树。每个节点上标着它的数值，一层层拆下去看「这个大数由什么构成」。
 *
 * **`initialTreeDepth: -1` 必须给**：ECharts 的 `tree` 默认只展开两层，
 * 更深的节点直接不画——SSR 出来就是一棵缺枝的树，而且不报错。
 */
function decompTree(ctx: BuildContext): Record<string, unknown> {
  const hierarchy = ctx.spec.hierarchy;
  return {
    series: [{
      type: 'tree',
      data: hierarchy ? [hierarchy] : [],
      orient: 'LR',
      layout: 'orthogonal',
      initialTreeDepth: -1,
      expandAndCollapse: false,
      roam: false,
      symbol: 'emptyCircle',
      symbolSize: 8,
      left: 40, right: 140, top: 24, bottom: 24,
      lineStyle: { color: ctx.spec.theme.grid, width: 1.5 },
      itemStyle: { color: seriesColor(ctx, 0), borderColor: seriesColor(ctx, 0) },
      label: {
        position: 'top',
        align: 'center',
        verticalAlign: 'middle',
        color: ctx.spec.theme.text,
        fontSize: 14,
        // 节点名 + 数值。只有名字的话看不出「拆到这一步还剩多少」
        formatter: (p: { name?: string; value?: number }) =>
          (p.value === undefined || p.value === null ? `${p.name ?? ''}` : `${p.name ?? ''} ${p.value}`),
      },
      leaves: { label: { position: 'right', align: 'left' } },
    }],
  };
}

/**
 * 旭日图。构成类里唯一能同时看到「一层层占比」和「总量」的图。
 *
 * 环上写标签要跟着弧走（`rotate: 'radial'`），并且给小扇区设 `minAngle` 下限——
 * 没有下限时细扇区的标签会挤成一团黑块。
 */
function sunburst(ctx: BuildContext): Record<string, unknown> {
  const hierarchy = ctx.spec.hierarchy;
  return {
    series: [{
      type: 'sunburst',
      data: hierarchy ? [hierarchy] : [],
      radius: ['18%', '92%'],
      center: ['50%', '52%'],
      sort: undefined,
      nodeClick: false,
      emphasis: { focus: 'none' },
      itemStyle: { borderColor: ctx.spec.theme.background, borderWidth: 2 },
      label: {
        rotate: 'radial',
        minAngle: 18,
        color: ctx.spec.theme.background,
        fontSize: 12,
      },
    }],
  };
}

export const COMPOSITION_BUILDERS: Record<CompositionKind, KindBuilder> = {
  treemap,
  pie,
  decompTree,
  sunburst,
};
