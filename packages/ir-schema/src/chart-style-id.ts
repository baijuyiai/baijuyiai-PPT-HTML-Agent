/**
 * 图表视觉风格的 **id 清单**。
 *
 * ## 为什么 id 在 IR 这边，而「长什么样」在 `@lumen/charts`
 *
 * `projects.chartStyle` 是一个**持久化的列**，所以它的取值域属于 IR 的词汇表
 * ——与 `PageType`、`StudioModuleId`、`CHART_KINDS` 同一类东西。
 * 而每个预设的色板与规范（`ChartUsageSpec`）住在 `@lumen/charts`：
 * 那部分依赖 echarts，不该被 API 服务拖进来（它只要一个 zod enum）。
 *
 * 这与 `chart-kind.ts` 是同一个分法：**能持久化的名字放这边，画法放那边**。
 *
 * ## 加新风格时
 *
 * 1. 这里加一个 id
 * 2. `@lumen/charts` 的 `CHART_STYLES` 里补一条预设
 *
 * 漏了第 2 步的症状是「界面里能选中它，但画出来还是默认那套」——
 * `charts.test.ts` 里有一条用例钉住两边对得上。
 */

export const CHART_STYLE_IDS = ['dashboard', 'classic', 'brand'] as const;
export type ChartStyleId = (typeof CHART_STYLE_IDS)[number];

/** 新建项目、以及认不出风格名时落的那一套 */
export const DEFAULT_CHART_STYLE_ID: ChartStyleId = 'dashboard';

export function isChartStyleId(v: unknown): v is ChartStyleId {
  return typeof v === 'string' && (CHART_STYLE_IDS as readonly string[]).includes(v);
}
