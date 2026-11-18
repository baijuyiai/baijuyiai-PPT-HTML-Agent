import type { ChartKind } from '@lumen/ir-schema/chart-kind';
import type { KindBuilder } from './context.js';
import { COMPARISON_BUILDERS } from './comparison.js';
import { DISTRIBUTION_BUILDERS } from './distribution.js';
import { TREND_BUILDERS } from './trend.js';
import { COMPOSITION_BUILDERS } from './composition.js';
import { FLOW_BUILDERS } from './flow.js';

/**
 * 20 种图表的构建器。**五张表摊开合成一张全量表。**
 *
 * 每张表标的是 `Record<某一组, KindBuilder>`（不是 `Partial`），所以这里
 * 少摊一组、或某一组里少写一种，TS 会在这行报「缺属性」。加新图表时
 * 编译器会拦住你——不用等到渲染出一张空图才发现。
 */
export const BUILDERS: Record<ChartKind, KindBuilder> = {
  ...COMPARISON_BUILDERS,
  ...DISTRIBUTION_BUILDERS,
  ...TREND_BUILDERS,
  ...COMPOSITION_BUILDERS,
  ...FLOW_BUILDERS,
};

export { GRID_INSET, DEFAULT_USAGE, usageOf, resolvePalette } from './context.js';
export type { BuildContext, KindBuilder } from './context.js';
