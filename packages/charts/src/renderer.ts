import type { ChartSlotData } from '@lumen/ir-schema/chart-kind';
import type { ChartRenderFn } from '@lumen/ir-schema';
import type { ChartUsageSpec } from './types.js';
import {
  chartThemeFromPalette, paletteFromPalette, type ResolvedPalette,
} from './palette.js';
import { chartStyleOf, DEFAULT_CHART_STYLE } from './chart-styles.js';
import { renderChartSvg } from './render.js';

/**
 * 造一个「数据 → SVG」的渲染函数，交给 `buildPageDocument` 的 `renderChart`。
 *
 * **填槽本身不在这里**——它住在 `@lumen/ir-schema` 的 `chart-fill.ts`（本包依赖它，
 * 反向 import 会成环）。这个文件只负责把「一份数据 + 一套风格」变成一个 SVG 字符串。
 */

export interface ChartRendererOptions {
  /** 页面解析后的配色。**深色模式要传深色那一份**，否则会画出深色底上的深色文字 */
  palette: ResolvedPalette;
  /**
   * 图表风格预设的 id（`CHART_STYLES` 里的那些）。不传就用默认那一套。
   *
   * 传 **id 字符串**而不是预设对象：调用方（`HtmlMock`）要把它放进 `useMemo` 依赖，
   * 字符串是稳定的，对象得靠调用方自己保证引用不变。
   */
  style?: string;
  /** 显式覆盖序列色板。一般不用——预设自带，或从页面配色派生 */
  colors?: string[];
  /** 显式覆盖规范。一般不用——预设里已经写全了 */
  usage?: Partial<ChartUsageSpec>;
}

/**
 * 色板、主题、规范在这里**一次性算好**（不是每次渲染再算）：同一页里的几个图表槽
 * 必须用同一套配色，而派生过程要是每次重跑，改一处派生规则就可能让同页两张图不一致。
 *
 * 色板的取值优先级：显式 `colors` > 预设自带 > 从页面配色派生。
 * `dashboard` 自带五色板（它要的就是那套色）；`classic` 与 `brand` 都不带，
 * 跟着页面配色走——前者连画法也保守，后者沿用看板那套画法，只换配色。
 */
export function makeChartRenderer(opts: ChartRendererOptions): ChartRenderFn {
  const style = chartStyleOf(opts.style ?? DEFAULT_CHART_STYLE);

  const colors = opts.colors && opts.colors.length > 0
    ? opts.colors
    : style.colors && style.colors.length > 0
      ? style.colors
      : paletteFromPalette(opts.palette);

  const theme = chartThemeFromPalette(opts.palette);
  const usage: ChartUsageSpec = { ...style.usage, ...(opts.usage ?? {}) };

  return (data: ChartSlotData, size: { width: number; height: number }) =>
    renderChartSvg(
      { ...data, palette: colors, theme, usage },
      // responsive：根 <svg> 写成 100%/100% 铺满槽容器，viewBox 保留真实尺寸。
      // 这样槽的像素尺寸与渲染尺寸只要宽高比一致就不会变形
      { width: size.width, height: size.height, responsive: true },
    );
}
