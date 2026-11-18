import * as echarts from 'echarts/core';
import {
  BarChart, BoxplotChart, CandlestickChart, ChordChart, CustomChart, FunnelChart,
  GraphChart, HeatmapChart, LineChart, PieChart, RadarChart, SankeyChart,
  ScatterChart, SunburstChart, TreeChart, TreemapChart,
} from 'echarts/charts';
import {
  GraphicComponent, GridComponent, LegendComponent, MarkLineComponent,
  MatrixComponent, RadarComponent, TitleComponent, VisualMapComponent,
} from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { CHART_DATA_FIELDS } from '@lumen/ir-schema/chart-kind';
import type { ChartSpec } from './types.js';
import { EChartsRenderer } from './echarts.js';

let registered = false;
function ensureRegistered(): void {
  if (registered) return;
  echarts.use([
    SVGRenderer,
    // 20 种图表用到的全部系列。按需注册是 ECharts 的摇树方式，
    // 漏注册某一种的症状是「那种图渲染出来是空白」而不是报错，所以宁可多注册
    BarChart, LineChart, PieChart, ScatterChart, RadarChart,
    BoxplotChart, CandlestickChart, HeatmapChart, CustomChart,
    TreemapChart, SunburstChart, TreeChart,
    FunnelChart, SankeyChart, ChordChart, GraphChart,
    GridComponent, LegendComponent, RadarComponent, TitleComponent,
    // 热力图**没有 visualMap 会直接抛异常**（HeatmapView 里写死的）
    VisualMapComponent,
    // 均值线走 markLine。漏注册的症状是那条虚线**静默不画**，页面上少了它但不报错
    MarkLineComponent,
    MatrixComponent, GraphicComponent,
  ]);
  registered = true;
}

const renderer = new EChartsRenderer();

export interface RenderChartOptions {
  width: number;
  height: number;
  transparent?: boolean;
  responsive?: boolean;
}

/**
 * 这份规格里有没有可画的数据。
 *
 * **按种类看该看哪个字段。** 原先只看 `categories` 与 `series` 空不空，
 * 而树状图 / 旭日图 / 分解树的数据在 `hierarchy`、桑基图 / 流程图在 `links`、
 * 热力图 / 和弦图在 `matrix`——照旧那条判据会把它们**静默丢成空白**，
 * 而且返回的是空串，调用方连占位块都画不出来。
 */
function hasData(spec: ChartSpec): boolean {
  const record = spec as unknown as Record<string, unknown>;
  for (const field of CHART_DATA_FIELDS[spec.kind] ?? []) {
    const v = record[field];
    if (Array.isArray(v)) {
      if (v.length > 0) return true;
    } else if (v !== null && typeof v === 'object') {
      // hierarchy / matrix 是对象，里面空不空由构建器兜底
      return true;
    }
  }
  return false;
}

/**
 * 把 zrender 自动生成的类名归一化。
 *
 * zrender 给每个图元分配的类名带一个**进程级自增计数**：同一份数据第一次渲染是
 * `zr30-cls-109`，第二次就变成 `zr31-cls-112`——几何一模一样，字节却不同。
 * 后果不是「看着不一样」，而是同一页两次渲染出的 HTML 不相等：缓存命中不了、
 * diff 里全是噪声、导出件与编辑器里的也对不上。
 *
 * 按**首次出现顺序**重新编号，于是同一份数据的输出逐字节可复现。
 * 类名只在同一次渲染内部互相引用，重编号不影响任何东西。
 */
function stableClassNames(svg: string): string {
  const assigned = new Map<string, string>();
  return svg.replace(/zr\d+-cls-\d+/g, (name) => {
    let next = assigned.get(name);
    if (next === undefined) {
      next = `zr-cls-${assigned.size}`;
      assigned.set(name, next);
    }
    return next;
  });
}

export function renderChartSvg(spec: ChartSpec, options: RenderChartOptions): string {
  if (!hasData(spec)) return '';

  ensureRegistered();
  const option = renderer.buildOption(spec);
  if (options.transparent !== false) option.backgroundColor = 'transparent';

  // ssr 模式下 init 的宿主传 null：不创建 DOM，只借用渲染管线
  const chart = echarts.init(null, null, {
    renderer: 'svg', ssr: true, width: options.width, height: options.height,
  });
  try {
    chart.setOption(option);
    const svg = stableClassNames(chart.renderToSVGString());
    if (!options.responsive) return svg;
    return svg.replace(/^<svg width="\d+" height="\d+"/, '<svg width="100%" height="100%"');
  } finally {
    chart.dispose();
  }
}
