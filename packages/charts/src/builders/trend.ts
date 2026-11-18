import type { TrendKind } from '@lumen/ir-schema/chart-kind';
import { lighten } from '../palette.js';
import {
  cartesianAxes, categoryAxis, multiSeriesLegend, seriesColor,
  type BuildContext, type KindBuilder,
} from './context.js';
import { cartesianSeries } from './cartesian.js';

/** 趋势类：面积图、折线图、股价图、热力图 */

/** 面积图。折线 + 填充，看的是「累积量随时间怎么走」 */
function area(ctx: BuildContext): Record<string, unknown> {
  const categories = ctx.spec.categories ?? [];
  return {
    ...cartesianAxes(ctx, categories, { boundaryGap: false }),
    ...multiSeriesLegend(ctx),
    series: cartesianSeries(ctx, 'area'),
  };
}

/** 折线图。`boundaryGap: false` 让折线从画布左缘起、右缘止，不要两头各留半格 */
function line(ctx: BuildContext): Record<string, unknown> {
  const categories = ctx.spec.categories ?? [];
  return {
    ...cartesianAxes(ctx, categories, { boundaryGap: false }),
    ...multiSeriesLegend(ctx),
    series: cartesianSeries(ctx, 'line'),
  };
}

/**
 * 股价图（K 线）。
 *
 * 涨用主色、跌用第二个色（没有就取主色提亮一档）。**不用红绿**：
 * 这套图表要吃风格包的色板，写死红绿会跟整套配色打架，
 * 而且红绿对色觉障碍读者不友好——靠深浅区分比靠色相更稳。
 */
function candlestick(ctx: BuildContext): Record<string, unknown> {
  const ohlc = ctx.spec.ohlc ?? [];
  const categories = ohlc.map((o) => o.name);
  const up = seriesColor(ctx, 0);
  const down = ctx.palette.length > 1 ? seriesColor(ctx, 1) : lighten(up, 0.5);

  return {
    ...cartesianAxes(ctx, categories, { boundaryGap: true }),
    series: [{
      name: ctx.spec.title ?? '价格',
      type: 'candlestick',
      data: ohlc.map((o) => o.values.slice(0, 4)),
      itemStyle: {
        color: up, color0: down,
        borderColor: up, borderColor0: down,
      },
    }],
  };
}

/**
 * 热力图。
 *
 * **`visualMap` 是必填的**——ECharts 的 HeatmapView 在没有 visualMap 时直接
 * `throw new Error('Heatmap must use with visualMap')`，整页 SSR 会失败。
 * 色阶从主色提亮到原色：浅处几乎融进底色、深处是实色，深浅差就是它唯一的读数。
 */
function heatmap(ctx: BuildContext): Record<string, unknown> {
  const m = ctx.spec.matrix;
  const rows = m?.rows ?? [];
  const cols = m?.cols ?? [];
  const values = m?.values ?? [];
  const flat = values.flat();
  const min = flat.length > 0 ? Math.min(...flat) : 0;
  const max = flat.length > 0 ? Math.max(...flat) : 1;
  const base = seriesColor(ctx, 0);

  const data: [number, number, number][] = [];
  for (const [r, row] of values.entries()) {
    for (const [c, v] of row.entries()) data.push([c, r, v]);
  }

  return {
    // 用公共的类目轴写法：轴线画不画、网格多淡都由规范决定，
    // 各图自己写一份就会漏掉「仪表盘那套不画轴线」
    xAxis: categoryAxis(ctx, cols, true),
    yAxis: categoryAxis(ctx, rows, true),
    visualMap: {
      min, max,
      calculable: false,
      orient: 'horizontal',
      left: 'center',
      bottom: 0,
      itemWidth: 12,
      itemHeight: 90,
      textStyle: { color: ctx.spec.theme.muted },
      inRange: { color: [lighten(base, 0.88), base] },
    },
    series: [{
      type: 'heatmap',
      data,
      label: { show: false },
      itemStyle: { borderColor: ctx.spec.theme.background, borderWidth: 2 },
      emphasis: { itemStyle: { shadowBlur: 0 } },
    }],
  };
}

export const TREND_BUILDERS: Record<TrendKind, KindBuilder> = {
  area,
  line,
  candlestick,
  heatmap,
};
