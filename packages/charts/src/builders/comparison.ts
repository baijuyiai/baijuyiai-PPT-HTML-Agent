import type { CompareKind } from '@lumen/ir-schema/chart-kind';
import {
  cartesianAxes, categoryAxis, legend, labelColor, multiSeriesLegend, valueAxis,
  type BuildContext, type KindBuilder,
} from './context.js';
import { cartesianSeries } from './cartesian.js';

/** 比较类：柱状图、条形图、雷达图、分向条形图 */

/** 柱状图。类目在横轴，数值在纵轴 */
function bar(ctx: BuildContext): Record<string, unknown> {
  const categories = ctx.spec.categories ?? [];
  return {
    ...cartesianAxes(ctx, categories),
    ...multiSeriesLegend(ctx),
    series: cartesianSeries(ctx, 'bar'),
  };
}

/** 条形图。柱状图转 90°：类目在纵轴，数值在横轴，横向的条更好读长名字 */
function barH(ctx: BuildContext): Record<string, unknown> {
  const categories = ctx.spec.categories ?? [];
  return {
    ...cartesianAxes(ctx, categories, { horizontal: true }),
    ...multiSeriesLegend(ctx),
    series: cartesianSeries(ctx, 'bar', { horizontal: true }),
  };
}

/**
 * 分向条形图（蝴蝶图 / 龙卷风图）。
 *
 * 横向排：类目在纵轴，两条序列从中间零点背向伸出去。第一条向右（正值）、
 * 第二条向左（取负）——靠 `stack: 'total'` 让它们各自从 0 出发。不加 stack 的话
 * 两条会并排站成普通的双系列柱状图，看不出「分向」。
 *
 * 轴标签取**绝对值**：轴上写着 −30 会让人以为那是个负指标，
 * 而它表达的其实是「另一组有 30」。这是分向图的通行画法。
 */
function barDiverging(ctx: BuildContext): Record<string, unknown> {
  const categories = ctx.spec.categories ?? [];
  const unit = ctx.spec.unit ?? '';
  const value = valueAxis(ctx, unit);
  const absAxis = {
    ...value,
    axisLabel: {
      color: labelColor(ctx),
      formatter: (v: number) => `${Math.abs(v)}${unit}`,
    },
  };

  return {
    yAxis: categoryAxis(ctx, categories, true),
    xAxis: absAxis,
    legend: legend(ctx),
    series: cartesianSeries(ctx, 'bar', { horizontal: true, negateFrom: 1 })
      .map((s) => ({ ...s, stack: 'total' })),
  };
}

/**
 * 雷达图。指标上限取该维度所有序列的最大值。
 *
 * 上限取最大值而不是固定 100：不同风格的指标体系量纲差得远（百分比、人数、金额），
 * 写死 100 会让「都是个位数」的那组缩成一团看不见。
 */
function radar(ctx: BuildContext): Record<string, unknown> {
  const { spec } = ctx;
  const categories = spec.categories ?? [];
  const series = spec.series ?? [];

  const indicator = categories.map((name, i) => {
    const max = Math.max(1, ...series.map((s) => s.values[i] ?? 0));
    return { name, max };
  });

  return {
    radar: {
      indicator,
      axisLine: { lineStyle: { color: spec.theme.grid } },
      splitLine: { lineStyle: { color: spec.theme.grid } },
      axisName: { color: spec.theme.muted },
    },
    legend: legend(ctx),
    series: [{ type: 'radar', data: series.map((s) => ({ name: s.name, value: s.values })) }],
  };
}

export const COMPARISON_BUILDERS: Record<CompareKind, KindBuilder> = {
  bar,
  barH,
  radar,
  barDiverging,
};
