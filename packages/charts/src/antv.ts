import type { ChartKind } from '@lumen/ir-schema/chart-kind';
import type { ChartSpec, ChartRenderer } from './types.js';

/**
 * AntV G2 渲染器。
 *
 * ## 这份实现目前没有生产调用点
 *
 * `renderChartSvg` 写死了 ECharts，`getRenderer('antv')` 全仓只有测试在用
 * （工作台的图表块编辑器里有个 antv 选项，但选它不影响渲染）。
 * 保留它是因为 `ChartBlock.renderer` 是**持久化在 IR 里的字段**，删掉等于做 schema 迁移。
 *
 * ## 20 种之后改成「支持一部分 + 显式降级」
 *
 * 原来 `MARK_BY_KIND` 是 `Record<kind, string>`——加一种图就必须在这里补一条，
 * 而 G2 根本表达不了桑基图、和弦图、旭日图这些。**不给死代码补十几条假映射**：
 * 真支持的那几种留在 `MARK_BY_KIND`，其余落进 `DEGRADE`，用最接近的标记近似。
 * `supports()` 让调用方能问出「这种图你是不是只能画个近似」。
 */

/** 长表一行：一个类目 x 一个 series 的取值 */
interface Row {
  category: string;
  series: string;
  value: number;
}

/** G2 真正有对应标记的那些图 */
const MARK_BY_KIND: Partial<Record<ChartKind, string>> = {
  bar: 'interval',
  barH: 'interval',
  barDiverging: 'interval',
  histogram: 'interval',
  funnel: 'interval',
  line: 'line',
  area: 'area',
  candlestick: 'line',
  scatter: 'point',
  pie: 'theta',
  radar: 'radar',
};

/** 表达不了的那些，用一个最接近的标记近似 */
const DEGRADE: Partial<Record<ChartKind, string>> = {
  boxplot: 'interval',
  violin: 'area',
  heatmap: 'cell',
  treemap: 'rect',
  sunburst: 'rect',
  decompTree: 'tree',
  sankey: 'link',
  chord: 'arc',
  flowchart: 'link',
};

/**
 * 把宽表（categories + series[]）摊平成 G2 惯用的长表。
 * 外层循环类目、内层循环 series，保证类目顺序与每个 series 的取值一一对应。
 */
function longForm(spec: ChartSpec): Row[] {
  const categories = spec.categories ?? [];
  const series = spec.series ?? [];
  const rows: Row[] = [];
  for (let i = 0; i < categories.length; i++) {
    const category = categories[i] ?? '';
    for (const s of series) {
      rows.push({ category, series: s.name, value: s.values[i] ?? 0 });
    }
  }
  return rows;
}

/** 饼图数据：取首个 series，与 ECharts 侧同源 */
function pieData(spec: ChartSpec): { name: string; value: number }[] {
  const first = spec.series?.[0];
  const values = first ? first.values : [];
  return (spec.categories ?? []).map((name, i) => ({ name, value: values[i] ?? 0 }));
}

/** AntV G2 渲染器：输出 { type, data, encode, scale, axis, legend } 风格的 spec */
export class AntVRenderer implements ChartRenderer {
  readonly name = 'antv' as const;

  /** 这种图有没有原生对应的标记。false 表示 `buildOption` 给的是个近似 */
  supports(kind: ChartKind): boolean {
    return kind in MARK_BY_KIND;
  }

  buildOption(spec: ChartSpec): Record<string, unknown> {
    const { theme } = spec;
    const option: Record<string, unknown> = {
      type: MARK_BY_KIND[spec.kind] ?? DEGRADE[spec.kind] ?? 'interval',
      scale: { color: { range: spec.palette } },
      legend: { color: { position: 'top' } },
    };
    if (spec.title) option.title = spec.title;

    if (spec.kind === 'pie') {
      option.data = pieData(spec);
      option.encode = { y: 'value', color: 'name' };
      option.coordinate = { type: 'theta', innerRadius: 0.45, outerRadius: 0.7 };
      option.labels = [{ text: 'name', position: 'outside' }];
      return option;
    }

    option.data = longForm(spec);
    option.encode = { x: 'category', y: 'value', color: 'series' };

    if (spec.kind === 'radar') {
      option.coordinate = { type: 'polar' };
      option.axis = { x: { labelFill: theme.muted }, y: { grid: true, gridStroke: theme.grid } };
      return option;
    }

    const yAxis: Record<string, unknown> = {
      labelFill: theme.muted,
      grid: true,
      gridStroke: theme.grid,
      gridLineDash: [4, 4],
    };
    if (spec.unit) {
      yAxis.labelFormatter = (v: number) => `${v}${spec.unit}`;
    }
    option.axis = {
      x: { labelAutoHide: true, labelFill: theme.muted, lineStroke: theme.grid, tick: false },
      y: yAxis,
    };
    return option;
  }
}
