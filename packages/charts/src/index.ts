export * from './types.js';
export * from './chart-styles.js';
export * from './palette.js';
export * from './echarts.js';
export * from './antv.js';
export * from './render.js';
export * from './renderer.js';
export * from './stats.js';
export * from './layout.js';
export * from './builders/index.js';

import type { ChartSpec, ChartRenderer } from './types.js';
import { EChartsRenderer } from './echarts.js';
import { AntVRenderer } from './antv.js';

/** 支持的渲染器名 */
export type RendererName = 'echarts' | 'antv';

const RENDERERS: Record<RendererName, ChartRenderer> = {
  echarts: new EChartsRenderer(),
  antv: new AntVRenderer(),
};

/** 按名取渲染器（默认调用方可传 'echarts'） */
export function getRenderer(name: RendererName): ChartRenderer {
  return RENDERERS[name];
}

/** 一步编译：中立规格 + 渲染器名 → 该渲染器的配置对象 */
export function buildChartOption(
  spec: ChartSpec,
  rendererName: RendererName,
): Record<string, unknown> {
  return getRenderer(rendererName).buildOption(spec);
}
