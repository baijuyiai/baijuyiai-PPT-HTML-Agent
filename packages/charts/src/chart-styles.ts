import {
  CHART_STYLE_IDS, DEFAULT_CHART_STYLE_ID, type ChartStyleId,
} from '@lumen/ir-schema';
import type { ChartUsageSpec } from './types.js';

/**
 * 图表视觉风格：**命名预设**，决定图表长什么样（配色、圆角、渐变、标记、网格……）。
 *
 * ## 为什么是预设，而不是散在 StyleDoc 里的几个字段
 *
 * 一套「看起来是对的」图表风格是**十几个决定合在一起**的结果：只把圆角调大、
 * 网格调淡，但没换色板，出来的是四不像。打包成命名预设，用户挑的是「哪一种」，
 * 而不是自己拧十几个旋钮——这也是 `DECORATION_BY_PAGE_TYPE`、动效 preset
 * 在这套代码里一贯的做法（一张表定一个视觉维度）。
 *
 * ## 与页面风格的关系
 *
 * 图表风格**独立于页面风格**：页面风格给的是底色、文字色、字体（`StyleDoc.palette`），
 * 图表风格给的是「图怎么画」。所以同一个页面风格下可以换图表风格，
 * 反过来也一样。`classic` 会去用页面的配色，`dashboard` 自带一套。
 *
 * ## 加新预设时的两条
 *
 * 1. **`usage` 写全，不用 `Partial`**。继承一半的预设最难查：某天改了默认值，
 *    只有一半的预设跟着变。
 * 2. **`chartStyleOf` 必须回这里这一份对象**，不能每次现造。调用方（`HtmlMock`）
 *    拿它进 `useMemo` 依赖，现造对象会把 memo 打穿、iframe 反复重载。
 */

export { CHART_STYLE_IDS, type ChartStyleId };

export interface ChartStyle {
  id: ChartStyleId;
  /** 界面上的名字 */
  name: string;
  /** 一句话说清它长什么样 */
  brief: string;
  /** 分类色板。**不给就按页面配色派生**（`paletteFromPalette`） */
  colors?: string[];
  usage: ChartUsageSpec;
}

/**
 * 参考图（用户给的四张仪表盘卡片）里那套色板。
 *
 * 靛紫 / 青 / 绿 / 琥珀 / 玫红，第六个是灰蓝兜底色——序列多于五条时循环取用，
 * 有一个中性色垫底比让第一色再轮一遍更像样。
 */
const DASHBOARD_COLORS = [
  '#6366F1', // 靛紫
  '#22D3EE', // 青
  '#22C55E', // 绿
  '#F5A524', // 琥珀
  '#F43F5E', // 玫红
  '#94A3B8', // 灰蓝（兜底）
];

/**
 * 「数据看板」那套画法：圆角柱、渐变面积、折线带点标记、圆头环图、极淡横向网格
 * 不画轴线、最高一根柱标数值、一条虚线标均值。
 *
 * `dashboard` 与 `brand` **共用这一份**，两者差的只是色板从哪来。
 * 与文件头那条「usage 写全、不用 Partial」不冲突：那条防的是「继承默认值继承了一半」，
 * 而这两套本来就是同一套画法——改画法时它们本来就该一起变。
 */
const DASHBOARD_USAGE: ChartUsageSpec = {
  palette: 'categorical',
  gridLines: true,
  axisTone: 'muted',
  barRadius: 10,
  lineWidth: 2,
  areaFill: true,
  // 参考图是「一根实色、其余变淡」，不是「最大值换色」——后者在同类色里看不出高亮
  emphasis: 'focus-max',
  gridTone: 'faint',
  axisLine: false,
  areaGradient: true,
  lineMarkers: true,
  donutCap: 'round',
  barLabels: true,
  averageLine: true,
};

export const CHART_STYLES: ChartStyle[] = [
  {
    id: 'dashboard',
    name: '数据看板',
    brief: '五色分类色板、圆角柱、渐变面积、折线带点标记、圆头环图；只有极淡的横向网格，不画轴线；最高的一根柱标出数值，另有一条虚线标出均值。现代 SaaS 仪表盘的样子。',
    colors: DASHBOARD_COLORS,
    usage: DASHBOARD_USAGE,
  },
  {
    id: 'classic',
    name: '经典',
    brief: '跟着页面配色走，直角柱、平铺面积、无点标记、直角环图，轴线与网格线都画。克制、不抢版面——一页里图表只是配角时用它。',
    // 不给自己那套色板：从页面配色派生，图表与整本 deck 一个调子
    usage: {
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
    },
  },
  {
    id: 'brand',
    name: '品牌色',
    brief: '画法与「数据看板」完全相同，但色板跟着页面配色走——红黑风格下就是一组红。想要现代仪表盘的手感、又要图表与整本 deck 一个调子时用它。',
    // 不给自己那套色板：走 `paletteFromPalette`，红黑风格派生出来是「品牌红 + 亮红」
    usage: DASHBOARD_USAGE,
  },
];

/** 默认用的那一套。新建项目、以及认不出风格名时都落它 */
export const DEFAULT_CHART_STYLE: ChartStyleId = DEFAULT_CHART_STYLE_ID;

/**
 * 按 id 取预设。**没传、或者认不出，都回默认那一套。**
 *
 * 认不出时也可以回 `classic`（「今天的样子」），但那样有两个分支要想：
 * 「没指定」与「指定了一个不认识的 id」在这里的处理其实一样——
 * 都是「用户没给出一个有效的选择」，那就给默认。少一个分支少一处意外。
 *
 * 返回的**一定是 `CHART_STYLES` 里那一份对象**，不是新造的：
 * 调用方拿它进 `useMemo` 依赖，现造会把 memo 打穿。
 */
export function chartStyleOf(id: string | null | undefined): ChartStyle {
  return CHART_STYLES.find((s) => s.id === id)
    ?? CHART_STYLES.find((s) => s.id === DEFAULT_CHART_STYLE)!;
}
