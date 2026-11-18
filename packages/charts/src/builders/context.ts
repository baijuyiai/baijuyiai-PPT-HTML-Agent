import type { ChartSpec, ChartUsageSpec } from '../types.js';
import { alpha, lighten, monoRamp } from '../palette.js';

/**
 * 各个图表构建器共用的东西：合并后的规范、解析后的色板、轴与网格的公共写法。
 *
 * 20 种图各写一份轴配置的话，改一处「网格线用虚线」要改十几遍，而且必然漏几处——
 * 那是这套库以前只有 6 种时就已经在发生的事（`area` 的 `areaStyle` 是特判进去的）。
 */

export interface BuildContext {
  spec: ChartSpec;
  usage: ChartUsageSpec;
  /** 解析后的色板：mono-ramp 时已经从基色拉成阶梯 */
  palette: string[];
}

export type KindBuilder = (ctx: BuildContext) => Record<string, unknown>;

/**
 * 克制网格：留白固定，避免图表贴边，含轴标签占位。
 * echarts 6 弃用了 `containLabel`，官方给出的等价写法是
 * `{ outerBoundsMode: 'same', outerBoundsContain: 'axisLabel' }`——这里直接用它，
 * 免得为了一个旧字段去引 LegacyGridContainLabel 垫片。
 */
export const GRID_INSET = {
  left: 48, right: 24, top: 32, bottom: 40,
  outerBoundsMode: 'same' as const,
  outerBoundsContain: 'axisLabel' as const,
};

/**
 * 风格包没给规范时的保守取值：有网格、细线、不填充、不强调。
 *
 * **后 7 个字段一律取「加它们之前的行为」**——这样旧链路与九套内置风格包
 * 什么都不用改，画出来与从前逐字一致。
 */
export const DEFAULT_USAGE: ChartUsageSpec = {
  palette: 'brand-first',
  gridLines: true,
  axisTone: 'muted',
  barRadius: 0,
  lineWidth: 2,
  areaFill: false,
  emphasis: 'none',
  gridTone: 'normal',
  axisLine: true,
  areaGradient: false,
  lineMarkers: false,
  donutCap: 'butt',
  barLabels: false,
  averageLine: false,
};

export function usageOf(spec: ChartSpec): ChartUsageSpec {
  return { ...DEFAULT_USAGE, ...(spec.usage ?? {}) };
}

/**
 * 解析最终色板。
 * brand-first 用原色板；categorical 也用原色板（差异体现在规范里其他项上，
 * 色板本身已经是多色）；mono-ramp 则从基色拉一条单色阶梯。
 */
export function resolvePalette(spec: ChartSpec, usage: ChartUsageSpec): string[] {
  const base = spec.palette.length > 0 ? spec.palette : ['#3B82F6'];
  const count = Math.max(1, spec.series?.length ?? 1);
  if (usage.palette === 'mono-ramp') return monoRamp(base[0]!, count);
  return base;
}

/** 第 i 条序列的颜色。序列多于色板时循环取用 */
export function seriesColor(ctx: BuildContext, i: number): string {
  return ctx.palette[i % ctx.palette.length]!;
}

/** 强调色。风格包没给就用色板第一个 */
export function accentOf(ctx: BuildContext): string {
  return ctx.spec.theme.accent ?? ctx.palette[0]!;
}

/**
 * 主序列强调：第一条保持原色，其余降饱和。
 * 让读者一眼看出哪条是要看的——比较类图表里这是唯一要传达的信息。
 */
export function emphasisColor(ctx: BuildContext, i: number): string {
  const base = seriesColor(ctx, i);
  return ctx.usage.emphasis === 'primary-series' && i > 0 ? lighten(base, 0.45) : base;
}

/** 虚线网格线样式 */
export function dashed(color: string): { color: string; type: 'dashed' } {
  return { color, type: 'dashed' };
}

/**
 * 网格线的颜色。`faint` 把主题里的网格色压到四成——
 * 仪表盘那套里网格是「几乎看不见但又能对齐」的一档，用原色会抢柱子的注意力。
 */
export function gridColor(ctx: BuildContext): string {
  return ctx.usage.gridTone === 'faint' ? alpha(ctx.spec.theme.grid, 0.4) : ctx.spec.theme.grid;
}

/** 轴标签颜色：`axisTone` 决定用正文色还是弱化色 */
export function labelColor(ctx: BuildContext): string {
  return ctx.usage.axisTone === 'text' ? ctx.spec.theme.text : ctx.spec.theme.muted;
}

/** 数值轴：无刻度线，横向虚线网格，带单位时拼到标签上 */
export function valueAxis(ctx: BuildContext, unit?: string): Record<string, unknown> {
  return {
    type: 'value',
    axisLine: { show: ctx.usage.axisLine, lineStyle: { color: gridColor(ctx) } },
    axisTick: { show: false },
    splitLine: ctx.usage.gridLines
      ? { lineStyle: dashed(gridColor(ctx)) }
      : { show: false },
    axisLabel: unit
      ? { color: labelColor(ctx), formatter: `{value}${unit}` }
      : { color: labelColor(ctx) },
  };
}

/** 类目轴：标签不重叠（hideOverlap + interval auto），纵向网格线关闭以保持克制 */
export function categoryAxis(
  ctx: BuildContext,
  data: string[],
  boundaryGap: boolean,
): Record<string, unknown> {
  return {
    type: 'category',
    data,
    boundaryGap,
    axisLine: { show: ctx.usage.axisLine, lineStyle: { color: gridColor(ctx) } },
    axisTick: { show: false },
    splitLine: { show: false },
    axisLabel: { hideOverlap: true, interval: 'auto', color: labelColor(ctx) },
  };
}

/** 图例：贴在顶部，字色用弱化色 */
export function legend(ctx: BuildContext): Record<string, unknown> {
  return { top: 0, textStyle: { color: ctx.spec.theme.muted } };
}

/**
 * 图例，**只在有多条序列时才给**。
 *
 * 一条序列的图上，图例里那一条就是标题的复述，白占一行版面——
 * 实测截图上「各季度营收」正上方孤零零挂着一个「营收」。
 * ECharts 自己不会加图例，是我们主动加的，所以这里要自己判。
 *
 * `count` 用来覆盖「序列不在 `spec.series` 里」的图（散点看 `points`、直方图看 `samples`）。
 */
export function multiSeriesLegend(ctx: BuildContext, count?: number): Record<string, unknown> {
  const n = count ?? ctx.spec.series?.length ?? 0;
  return n > 1 ? { legend: legend(ctx) } : {};
}

/**
 * 直角坐标系（柱 / 折线 / 面积 / 散点 / K 线 / 箱线）的公共部分：
 * 网格 + 类目轴 + 数值轴。`barH` 把两者对调。
 *
 * `unit` 不传就取 `spec.unit`——规格里写的单位本来就该落到数值轴上，
 * 每个调用点各传一遍迟早会漏（漏了的表现是「设置了单位但轴上没有」）。
 */
export function cartesianAxes(
  ctx: BuildContext,
  categories: string[],
  opts: { horizontal?: boolean; boundaryGap?: boolean; unit?: string } = {},
): Record<string, unknown> {
  const cat = categoryAxis(ctx, categories, opts.boundaryGap ?? true);
  const val = valueAxis(ctx, opts.unit ?? ctx.spec.unit);
  return opts.horizontal
    ? { yAxis: cat, xAxis: val }
    : { xAxis: cat, yAxis: val };
}
