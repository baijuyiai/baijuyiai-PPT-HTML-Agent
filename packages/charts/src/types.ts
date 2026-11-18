/**
 * 渲染器中立的图表规格。
 * 本文件刻意不引入 echarts / antv 的类型，保证 IR 与具体渲染库解耦。
 */

import type { ChartSlotData } from '@lumen/ir-schema/chart-kind';

export type {
  ChartKind, ChartGroup, ChartSlotData,
  HierarchyNode, ChartLink, ChartMatrix, ChartSamples, ChartOhlc,
} from '@lumen/ir-schema/chart-kind';

/**
 * 图表使用规范，来自风格包的 design language。
 * 这里重述一遍字段而不是 import @lumen/ir-schema 的 ChartUsage：
 * charts 包对 IR 只依赖 StyleTokens，多一个反向依赖会让 IR 改字段时图表包也跟着编译失败。
 *
 * **两份定义必须同步**（`ir-schema/src/style.ts` 的 `ChartUsage` 是另一份）。
 * 跨包不能互相 import，所以靠 `charts.test.ts` 里那条「字段集合相等」的用例钉住。
 *
 * 后 7 个字段是「图表视觉风格」那一层加的，**默认值一律取加它们之前的行为**——
 * 这样旧链路（`packages/slides` 走 `langOf(ctx).chart`）与九套内置风格包
 * 一个字都不用改，行为逐字不变。
 */
export interface ChartUsageSpec {
  palette: 'brand-first' | 'categorical' | 'mono-ramp';
  gridLines: boolean;
  axisTone: 'muted' | 'text';
  barRadius: number;
  lineWidth: number;
  areaFill: boolean;
  emphasis: 'none' | 'primary-series' | 'max-bar' | 'focus-max';

  /** 网格线的深浅。`faint` 是仪表盘那套用的极淡一档 */
  gridTone: 'normal' | 'faint';
  /** 画不画轴线。仪表盘那套不画轴线也不画刻度，只剩横向网格 */
  axisLine: boolean;
  /** 面积图用垂直渐变（顶部有色、底部透明）而不是平铺一块半透明色 */
  areaGradient: boolean;
  /** 折线/面积的数据点上画实心圆点 */
  lineMarkers: boolean;
  /** 环图扇区的端点是否圆头 */
  donutCap: 'butt' | 'round';
  /** 柱顶标数值 */
  barLabels: boolean;
  /** 画一条水平虚线标出均值，并在左端挂一个深色药丸标签 */
  averageLine: boolean;
}

/**
 * 交给渲染器的完整规格：**数据**（`ChartSlotData`）+ **长什么样**。
 *
 * 数据那一半的类型直接继承过来，不重抄一遍——`categories` / `hierarchy` / `links`
 * 这些字段是模型在图表槽里写的东西，两个包各写一份迟早会漂。
 * 风格那一半（`palette` / `theme` / `usage`）由调用方按当前风格填进来。
 */
export interface ChartSpec extends ChartSlotData {
  /** 风格包提供的色板，按顺序取用 */
  palette: string[];
  /** 文字色、网格线色、背景色。accent 用于强调色（最大值柱、主序列） */
  theme: { text: string; muted: string; grid: string; background: string; accent?: string };
  /** 风格包的图表规范。缺省时按保守默认渲染 */
  usage?: Partial<ChartUsageSpec>;
}

export interface ChartRenderer {
  readonly name: 'echarts' | 'antv';
  /** 把中立规格编译成该渲染器可消费的配置对象 */
  buildOption(spec: ChartSpec): Record<string, unknown>;
}
