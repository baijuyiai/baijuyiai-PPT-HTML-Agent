/**
 * 图表种类的**唯一真值来源**。
 *
 * ## 为什么单独一个文件、而且不引 zod
 *
 * 这份清单有两个消费者，分居两个包：
 * - `packages/ir-schema/src/page.ts` 的 `ChartBlock.kind`（要 zod）
 * - `packages/charts/src/types.ts` 的 `ChartSpec['kind']`（**不能**被 zod 拖进来）
 *
 * `@lumen/charts` 依赖 `@lumen/ir-schema`，反过来不行，所以 IR 这边只能给一个
 * 干净的、没有 zod 的类型模块，让图表包按子路径 `@lumen/ir-schema/chart-kind` 取。
 * 两边各写一份联合类型的话，加了新图表而漏改一边，症状是「模型写出了某种图、
 * 但校验层说不认识它」——那种错要到生成时才炸。
 *
 * ## 分组
 *
 * 五类就是用户在分类图上给的：比较 / 分布 / 趋势 / 构成 / 流程。它同时是功能库页里
 * 那一节的分组标题，也是生成时筛候选的依据。
 */

export const CHART_KINDS = [
  // 比较类
  'bar', 'barH', 'radar', 'barDiverging',
  // 分布类
  'boxplot', 'histogram', 'scatter', 'violin',
  // 趋势类
  'area', 'line', 'candlestick', 'heatmap',
  // 构成类
  'treemap', 'pie', 'decompTree', 'sunburst',
  // 流程类
  'funnel', 'sankey', 'chord', 'flowchart',
] as const;

export type ChartKind = (typeof CHART_KINDS)[number];

export type ChartGroup = 'compare' | 'distribution' | 'trend' | 'composition' | 'flow';

/** 界面与提示词里的排列顺序 */
export const CHART_GROUP_ORDER: ChartGroup[] = [
  'compare', 'distribution', 'trend', 'composition', 'flow',
];

const GROUP_LABEL: Record<ChartGroup, string> = {
  compare: '比较类',
  distribution: '分布类',
  trend: '趋势类',
  composition: '构成类',
  flow: '流程类',
};

export function chartGroupLabel(g: ChartGroup): string {
  return GROUP_LABEL[g];
}

/** 每种图表落在哪一组。**加新图表时这里漏了编译器会报**（Record 写全了） */
export const CHART_KIND_GROUP: Record<ChartKind, ChartGroup> = {
  bar: 'compare', barH: 'compare', radar: 'compare', barDiverging: 'compare',
  boxplot: 'distribution', histogram: 'distribution', scatter: 'distribution', violin: 'distribution',
  area: 'trend', line: 'trend', candlestick: 'trend', heatmap: 'trend',
  treemap: 'composition', pie: 'composition', decompTree: 'composition', sunburst: 'composition',
  funnel: 'flow', sankey: 'flow', chord: 'flow', flowchart: 'flow',
};

export function chartGroupOf(kind: ChartKind): ChartGroup {
  return CHART_KIND_GROUP[kind];
}

/*
  按组切开的种类联合。渲染器一个组一个文件，各自把导出的构建表标成
  `Record<某一组, KindBuilder>`——**不是 Partial**。这样 `builders/index.ts`
  把五张表摊开合成 `Record<ChartKind, KindBuilder>` 时，少写任何一种图
  TS 会在那一行直接报「缺属性」，而不是等到运行时渲染出一张空图。
*/
export type CompareKind = 'bar' | 'barH' | 'radar' | 'barDiverging';
export type DistributionKind = 'boxplot' | 'histogram' | 'scatter' | 'violin';
export type TrendKind = 'area' | 'line' | 'candlestick' | 'heatmap';
export type CompositionKind = 'treemap' | 'pie' | 'decompTree' | 'sunburst';
export type FlowKind = 'funnel' | 'sankey' | 'chord' | 'flowchart';

/** 五组拼起来必须刚好等于 `ChartKind`：少了哪种图、或多出没归组的种类，这行会报类型错 */
type AllGroupedKinds = CompareKind | DistributionKind | TrendKind | CompositionKind | FlowKind;
type _GroupsMatchKinds = [
  ChartKind extends AllGroupedKinds ? true : false,
  AllGroupedKinds extends ChartKind ? true : false,
];
const _groupsMatchKinds: _GroupsMatchKinds = [true, true];
void _groupsMatchKinds;

/** 中文名。界面上的卡片标题、提示词里对模型的说明都用它 */
export const CHART_KIND_LABEL: Record<ChartKind, string> = {
  bar: '柱状图',
  barH: '条形图',
  radar: '雷达图',
  barDiverging: '分向条形图',
  boxplot: '箱线图',
  histogram: '直方图',
  scatter: '散点图',
  violin: '小提琴图',
  area: '面积图',
  line: '折线图',
  candlestick: '股价图',
  heatmap: '热力图',
  treemap: '树状图',
  pie: '饼图',
  decompTree: '分解树',
  sunburst: '旭日图',
  funnel: '漏斗图',
  sankey: '桑基图',
  chord: '和弦图',
  flowchart: '流程图',
};

export function isChartKind(v: unknown): v is ChartKind {
  return typeof v === 'string' && (CHART_KINDS as readonly string[]).includes(v);
}

/* ---------------- 数据结构 ---------------- */

/** 层级图（树状图 / 旭日图 / 分解树）的节点 */
export interface HierarchyNode {
  name: string;
  value?: number;
  children?: HierarchyNode[];
}

/** 关系图（桑基图 / 流程图 / 和弦图）的一条边 */
export interface ChartLink {
  source: string;
  target: string;
  value?: number;
}

/** 二维矩阵（热力图 / 和弦图）：`values[r][c]` */
export interface ChartMatrix {
  rows: string[];
  cols: string[];
  values: number[][];
}

/** 一组原始观测值。箱线图 / 小提琴图 / 直方图从它算出各自的形态 */
export interface ChartSamples {
  name: string;
  values: number[];
}

/** 一根 K 线：`[开, 收, 低, 高]` */
export interface ChartOhlc {
  name: string;
  values: number[];
}

/**
 * 散点图的一组点：每条序列一组 `[x, y]`。
 *
 * **不复用宽表**：散点图要的是两个数值轴上的点对，类目轴画出来只是「每个类目一个点」，
 * 那是对不上号的——「广告投入与销售额的关系」这种图根本表达不了。
 */
export interface ChartPoints {
  name?: string;
  values: number[][];
}

/**
 * 图表槽里那份 JSON 的形状——**模型要写的东西**。
 *
 * 它是 `ChartSpec` 去掉「长什么样」之后剩下的那半：只有**图表种类 + 数据**，
 * 没有色板、没有主题、没有规范。配色由服务端按当前风格填，模型一个色值都不许碰
 * ——同一份数据换一套风格要能跟着变，写死颜色就变不了了。
 *
 * 字段按种类取用，没有的留空。哪种图要哪些字段由 `chart-slot.ts` 的 zod 校验
 * 逐种把关，不在这里用联合类型表达——模型是一段一段写 JSON 的，
 * 判别联合对它来说不好写也不好报错。
 */
export interface ChartSlotData {
  kind: ChartKind;
  /** 直角坐标系与类目类图的类目轴 */
  categories?: string[];
  /** 宽表：每条序列一个数值数组，下标与 `categories` 对齐 */
  series?: { name: string; values: number[] }[];
  /** 数值单位后缀，如「%」「万元」 */
  unit?: string;
  /** 图表自带的标题。多数骨架不用它——标题由版面自己排 */
  title?: string;
  hierarchy?: HierarchyNode;
  links?: ChartLink[];
  matrix?: ChartMatrix;
  samples?: ChartSamples[];
  ohlc?: ChartOhlc[];
  points?: ChartPoints[];
}

/**
 * 这种图的数据住在哪个字段上。
 *
 * 空数组守卫要用它：`renderChartSvg` 原先只看 `categories` 与 `series` 空不空，
 * 而树状图 / 旭日图 / 桑基图 / 和弦图 / 流程图的数据全在别的字段里——
 * 照旧那条判据会把它们**静默丢成空白**，页面上就是一块什么都没有的区域。
 */
export const CHART_DATA_FIELDS: Record<ChartKind, (keyof ChartSlotData)[]> = {
  bar: ['categories', 'series'],
  barH: ['categories', 'series'],
  radar: ['categories', 'series'],
  barDiverging: ['categories', 'series'],
  scatter: ['points'],
  area: ['categories', 'series'],
  line: ['categories', 'series'],
  pie: ['categories', 'series'],
  funnel: ['categories', 'series'],
  boxplot: ['samples'],
  violin: ['samples'],
  histogram: ['samples'],
  candlestick: ['ohlc'],
  heatmap: ['matrix'],
  chord: ['matrix'],
  treemap: ['hierarchy'],
  sunburst: ['hierarchy'],
  decompTree: ['hierarchy'],
  sankey: ['links'],
  flowchart: ['links'],
};
