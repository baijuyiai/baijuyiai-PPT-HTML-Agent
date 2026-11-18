import type { DistributionKind } from '@lumen/ir-schema/chart-kind';
import { fiveNumber, histogram, kde } from '../stats.js';
import {
  cartesianAxes, categoryAxis, multiSeriesLegend, seriesColor, valueAxis,
  type BuildContext, type KindBuilder,
} from './context.js';

/** 分布类：箱线图、直方图、散点图、小提琴图 */

/** custom series 的 renderItem 收窄成我们真正用到的那几个方法，不引 echarts 的类型进来 */
interface RenderParams { dataIndex: number }
interface RenderApi {
  coord(p: [number, number]): [number, number];
  size(p: [number, number]): [number, number];
}

/**
 * 箱线图。五数概括在 `stats.ts` 里算好，直接喂给 `boxplot` 系列。
 *
 * **不用 ECharts 的 `boxplot` dataset transform**：那要多注册 `DatasetComponent`
 * 与 `TransformComponent`，而且分位数口径随版本变——自己算的每次都一样，测试断言得住。
 *
 * 须（上下四分位外的细线）不画：演示文稿的尺度下须和离群点都看不见，
 * 画上去只是把五根线变成七根线。
 */
function boxplot(ctx: BuildContext): Record<string, unknown> {
  const samples = ctx.spec.samples ?? [];
  const categories = samples.map((s) => s.name);
  const color = seriesColor(ctx, 0);

  return {
    ...cartesianAxes(ctx, categories),
    series: [{
      name: ctx.spec.title ?? '分布',
      type: 'boxplot',
      data: samples.map((s) => fiveNumber(s.values)),
      itemStyle: { color, borderColor: color, borderWidth: 1.5 },
      boxWidth: ['20%', '45%'],
    }],
  };
}

/**
 * 直方图。
 *
 * 多组共用**同一套分箱边界**：各分各的箱，几组的柱子就错位了，
 * 看着像不同量纲的东西摆在一起。
 *
 * 组只有一组时就是一列柱子——这是直方图最常见的样子。
 */
function histogramBuilder(ctx: BuildContext): Record<string, unknown> {
  const samples = ctx.spec.samples ?? [];
  const pooled = samples.flatMap((s) => s.values);
  const bins = histogram(pooled);
  if (bins.length === 0) return { ...cartesianAxes(ctx, []), series: [] };

  const lo = bins[0]!.start;
  const hi = bins[bins.length - 1]!.end;
  const width = (hi - lo) / bins.length;
  const labels = bins.map((b, i) => (i === bins.length - 1 ? `${b.start}–${b.end}` : `${b.start}`));

  const series = samples.map((s, i) => {
    const counts = new Array<number>(bins.length).fill(0);
    for (const v of s.values) {
      const idx = Math.min(bins.length - 1, Math.max(0, Math.floor((v - lo) / width)));
      counts[idx] = (counts[idx] ?? 0) + 1;
    }
    return {
      name: s.name,
      type: 'bar',
      data: counts,
      itemStyle: { color: seriesColor(ctx, i) },
      barMaxWidth: 40,
    };
  });

  return {
    ...cartesianAxes(ctx, labels, { boundaryGap: true }),
    ...multiSeriesLegend(ctx, samples.length),
    series,
  };
}

/**
 * 散点图。两个数值轴上的点对，`points` 里直接给 `[x, y]`。
 *
 * 不复用类目轴那套：类目轴上画出来的是「每个类目一个点」，
 * 「广告投入与销售额的关系」这种要看趋势的图表达不了。
 */
function scatter(ctx: BuildContext): Record<string, unknown> {
  const points = ctx.spec.points ?? [];
  const x = valueAxis(ctx);
  const y = valueAxis(ctx, ctx.spec.unit);

  return {
    xAxis: { ...x, name: ctx.spec.categories?.[0] ?? '' },
    yAxis: { ...y, name: ctx.spec.categories?.[1] ?? '' },
    ...multiSeriesLegend(ctx, points.length),
    series: points.map((p, i) => ({
      name: p.name ?? `第 ${i + 1} 组`,
      type: 'scatter',
      symbolSize: 9,
      data: p.values.filter((v) => v.length === 2).map((v) => [v[0], v[1]]),
      itemStyle: { color: seriesColor(ctx, i), opacity: 0.85 },
    })),
  };
}

/**
 * 小提琴图。
 *
 * ECharts 没有这个图，自己用 `custom` 系列画：每个类目一组观测值 → 算核密度 →
 * 沿纵轴采样成左右对称的多边形。再叠一层细箱线标出中位数与四分位——
 * 只看轮廓读不出中位数在哪，那是小提琴图最容易挨骂的地方。
 *
 * **全部是确定性计算**：带宽、采样点数、坐标都固定（见 `stats.ts`）。
 * 用 `Math.random` 抖动点的做法在这里不成立——SSR 出的 SVG 要逐字节可复现。
 */
function violin(ctx: BuildContext): Record<string, unknown> {
  const samples = ctx.spec.samples ?? [];
  const categories = samples.map((s) => s.name);
  const densities = samples.map((s) => kde(s.values));
  const maxDensity = Math.max(1e-9, ...densities.map((d) => Math.max(...d.y)));

  // 纵轴范围要盖住核密度的尾巴（它比原始数据两头各多出约 3 倍带宽），
  // 只按原始值定范围的话，两端会被裁平，看着像被切了一刀
  const lows = densities.map((d) => d.x[0] ?? 0);
  const highs = densities.map((d) => d.x[d.x.length - 1] ?? 1);
  const yMin = lows.length > 0 ? Math.min(...lows) : 0;
  const yMax = highs.length > 0 ? Math.max(...highs) : 1;

  const color = seriesColor(ctx, 0);

  const renderItem = (params: RenderParams, api: RenderApi) => {
    const d = densities[params.dataIndex];
    if (!d || d.x.length === 0) return { type: 'group', children: [] };
    // 一个类目占多少像素。小提琴最胖处占它的 76%，留出间距
    const halfW = api.size([1, 0])[0] * 0.38;

    const right: [number, number][] = [];
    const left: [number, number][] = [];
    for (let k = 0; k < d.x.length; k += 1) {
      const c = api.coord([params.dataIndex, d.x[k]!]);
      const w = (d.y[k]! / maxDensity) * halfW;
      right.push([c[0] + w, c[1]]);
      left.push([c[0] - w, c[1]]);
    }
    return {
      type: 'polygon',
      shape: { points: [...right, ...left.reverse()] },
      style: { fill: color, fillOpacity: 0.5, stroke: color, lineWidth: 1 },
    };
  };

  return {
    xAxis: categoryAxis(ctx, categories, true),
    yAxis: { ...valueAxis(ctx, ctx.spec.unit), min: yMin, max: yMax },
    series: [
      {
        type: 'custom',
        renderItem,
        data: samples.map((_, i) => i),
        silent: true,
        z: 1,
      },
      {
        type: 'boxplot',
        data: samples.map((s) => fiveNumber(s.values)),
        boxWidth: ['8%', '14%'],
        itemStyle: { color: 'transparent', borderColor: ctx.spec.theme.text, borderWidth: 1.5 },
        z: 2,
      },
    ],
  };
}

export const DISTRIBUTION_BUILDERS: Record<DistributionKind, KindBuilder> = {
  boxplot,
  histogram: histogramBuilder,
  scatter,
  violin,
};
