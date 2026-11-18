import { isHiddenLayout } from './hidden-layouts.js';
import {
  CHART_KIND_LABEL, chartGroupOf,
  type ChartGroup, type ChartKind,
} from './chart-kind.js';
import { CHART_SKELETONS } from './chart-skeletons.js';

/**
 * 图表页（`chart`）的版式库。
 *
 * ## 为什么要有它
 *
 * `chart` 此前一份骨架都没有：`moduleOfPageType('chart')` 返回 `null`，
 * 生成时版式块是空串，模型只拿到「一个图表加一段结论」就自由发挥——
 * 实际产出是**用 CSS 画的柱子和方块**，雷达图、桑基图、小提琴图这类根本画不出来。
 *
 * ## 与图文 / 人物排版的根本不同
 *
 * 那两个库的骨架是「版面的样子」，图由素材库按图位填进去；这个库的骨架里除了版面，
 * 还带一个**图表槽**——写清用哪种图、数据什么形状，出图交给 `@lumen/charts` 渲染成 SVG。
 *
 * 所以每种图只有一份骨架（20 种图表 = 20 份），分组就是用户给的五个分类：
 * 比较 / 分布 / 趋势 / 构成 / 流程。
 *
 * ## 挑候选的判据是「教案里写的那张图」
 *
 * `LESSON_TYPE_RULE.chart` 已经要求教案写明画什么图（折线/柱状/环形/散点…），
 * 所以按中文关键词认出种类，再给那一组的候选。认不出来兜底给比较类——
 * 那是演示文稿里最常用的一类。
 */

export interface ChartLayout {
  /** 形如 `chart/bar-column@v1` */
  id: string;
  /** 中文名，界面与提示词都用它 */
  name: string;
  /** 一句话：适合什么内容 */
  brief: string;
  group: ChartGroup;
  /**
   * 这份骨架画的是哪种图。
   *
   * **必须与骨架里图表槽的 `kind` 一致**，单测钉住这一条——两者对不上的症状是
   * 「界面卡片上写着折线图、生成出来是柱状图」，而没有任何一处会报错。
   */
  kind: ChartKind;
  /** HTML 片段：`<style>` + 一个根 `<div>` + 一个图表槽。约束见 `checkLayoutSkeleton` */
  skeleton: string;
}

export const CHART_LAYOUTS: ChartLayout[] = CHART_SKELETONS;

/**
 * 教案里的说法 → 图表种类。
 *
 * **顺序即优先级**，从具体到宽泛：「分向条形图」必须排在「条形图」前面，
 * 否则前者永远匹配到后者。「条形图」是横向的（`barH`）、「柱状图」是纵向的（`bar`），
 * 这是中文里的通行分法。
 */
const KIND_KEYWORDS: [RegExp, ChartKind][] = [
  [/分向|蝴蝶图|龙卷风|背向/, 'barDiverging'],
  [/小提琴/, 'violin'],
  [/箱线|箱型|盒须|盒式/, 'boxplot'],
  [/直方/, 'histogram'],
  [/散点|点阵/, 'scatter'],
  [/雷达|蜘蛛网/, 'radar'],
  [/热力|热度图/, 'heatmap'],
  [/K\s*线|蜡烛|股价|阴阳线/i, 'candlestick'],
  [/桑基/, 'sankey'],
  [/和弦/, 'chord'],
  [/漏斗/, 'funnel'],
  [/分解树/, 'decompTree'],
  [/旭日|太阳图/, 'sunburst'],
  [/树状图|矩形树|矩形式/, 'treemap'],
  [/流程图|流程示意|节点图|关系图/, 'flowchart'],
  [/饼图|环形图|圆环图|甜甜圈|扇形/, 'pie'],
  [/面积/, 'area'],
  [/折线|曲线|走势/, 'line'],
  [/条形图|横向柱|横条/, 'barH'],
  [/柱状图|柱形图|条形|柱图/, 'bar'],
];

/**
 * 从教案的视觉形式里认出要画哪种图。认不出回 `null`。
 *
 * 只看 `visualForm`：标题里常有「三大趋势」这种与图表种类无关的词，
 * 拿它当判据会把文字页也认成图表。
 */
export function estimateChartKind(visualForm: string): ChartKind | null {
  for (const [re, kind] of KIND_KEYWORDS) {
    if (re.test(visualForm)) return kind;
  }
  return null;
}

/**
 * 一组最多给几个候选。
 *
 * 每组本来就只有 4 份（一类 4 种图），所以这个数实际就是「整组给全」。
 * 留着它是为了让上界显式——以后某组扩到十几种时，不至于整组塞进提示词。
 */
const MAX_CANDIDATES = 4;

/**
 * 按这一页的内容筛出候选版式。**返回的数组一定非空。**
 *
 * 命中的那一种排在最前：模型有很强的「用第一个」的倾向，而教案已经说清了要画什么，
 * 把它埋在候选里等于让模型重新猜一次。
 *
 * **一组被下架光了就退回全组**（与图文排版同一条规矩）：候选函数承诺非空，
 * 而空组会让这段提示词整个被抽掉、图表页退回自由发挥。下架是「别再自动挑中」，
 * 不是「这一组不许用」。
 */
export function chartLayoutCandidates(
  input: { visualForm: string; points: string[] },
): ChartLayout[] {
  const kind = estimateChartKind(input.visualForm)
    ?? estimateChartKind(input.points.join(' '));
  const group: ChartGroup = kind ? chartGroupOf(kind) : 'compare';

  const pool = CHART_LAYOUTS.filter((l) => l.group === group && !isHiddenLayout(l.id));
  const usable = pool.length > 0 ? pool : CHART_LAYOUTS.filter((l) => l.group === group);

  const matched = kind ? usable.filter((l) => l.kind === kind) : [];
  const rest = usable.filter((l) => l.kind !== kind);
  return [...matched, ...rest].slice(0, MAX_CANDIDATES);
}

/**
 * 拼成提示词里的那一段。
 *
 * 与图文 / 人物排版的候选块是同一个口径，只多一段讲图表槽的话：
 * **槽原样留着、只换数据、字段名不要改、一个色值都不要写**。
 *
 * 最后那条最容易漏：模型看到槽里那份示例 JSON 是纯数据，往往就顺手补一句
 * `"color": "#3B82F6"` 进去——那样换一套风格图还是那个颜色。
 */
export function chartLayoutBlock(candidates: ChartLayout[], pageLabel: string): string {
  const items = candidates.map((l) =>
    `【${l.name}】${l.brief}\n\n\`\`\`html\n${l.skeleton}\n\`\`\``,
  );
  return [
    `这一页是${pageLabel}。${pageLabel}有多种版式，**按这一页的内容挑一种**，不要每页都用同一个。`,
    '下面是适合这一页的几个候选：',
    '',
    ...items,
    '',
    '挑一个，**照它的版式结构排**：标题在哪、图占多大、结论与来源注放哪，都按骨架来。',
    '**骨架里的文字、数字、图注全是示例**（写具体是为了让版式的疏密看得出来），',
    '一律换成这一页的实际内容，一个都不要照抄。骨架的配色一律走 CSS 变量，不要写死色值。',
    '',
    '**图表那一块是一个「图表槽」，照原样留着**：',
    `它长这样 —— \`<div class="…" style="…" data-lumen-chart="宽x高">\` 后面跟一段 JSON，再 \`</div>\` 收尾。`,
    `JSON 里的 \`kind\`（${CHART_KIND_LABEL[candidates[0]?.kind ?? 'bar']}这一类）说明画的是哪种图，`,
    '**不要改 kind，也不要改字段名与结构**；要改的是里面的数字与文字——',
    '把它们换成这一页的真实数据，条数按实际内容来（多了少了都行）。',
    '**绝对不要往 JSON 里写颜色**：配色由渲染层按当前风格填，写死色值换风格就不跟着变了。',
    '槽外面的 `data-lumen-chart="宽x高"` 是出图尺寸，也不要动。',
  ].join('\n');
}
