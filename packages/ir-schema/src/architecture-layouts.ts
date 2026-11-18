import { isHiddenLayout } from './hidden-layouts.js';
import { ARCHITECTURE_SKELETONS } from './architecture-skeletons.js';

/**
 * 架构页（架构图 / 逻辑框架图）的版式库。
 *
 * 架构图有几十种画法（分层堆叠、模块矩阵、中枢辐条、同心环、流程链路、屋架底座……），
 * 让模型每次自由发挥是画不出该有的样子的——它最容易画出「一堆圆角矩形加箭头」。
 * 这里把每种画法写成一份**骨架**，生成时按这一页的教案筛出几个候选给模型挑，它照着画。
 *
 * ## 骨架从哪来
 *
 * 全部由 `scripts/recognize-architecture-layouts.ts` 从一批参考图识别出来，写在
 * `architecture-skeletons.ts`（生成文件）。**每份自包含**（自带 `<style>` + 一个根 `<div>`），
 * 不共用底座——各份之间的字号与留白是各自照参考图定的。
 *
 * ## 与其他三个库最要紧的一处分叉：占位文案是中文
 *
 * 人物 / 图文 / 界面那三套的骨架里占位文案一律英文（大标题、人名、简介），那是照它们的
 * 参考图定的。**架构图相反**：参考图里的模块名、层名、流程标签本来就是中文
 * （「数据接入层」「计算引擎」「权限校验」「采集 → 清洗 → 入库」），而生成真页面时
 * 这些位置换成本页的实际内容——中文占位更贴、模型照抄的腔调也更对。
 * 所以识别脚本**不做「不许出现汉字」那条校验**（另三个脚本都有）。
 *
 * ## 骨架里的两条硬约束
 *
 * 1. **只用 CSS 变量取色**（`--bg` / `--surface` / `--text` / `--muted` / `--accent` /
 *    `--brand` / `--border`，由 `buildPageDocument` 注入）与三个字体角色
 *    （`--font-sans` / `--font-display` / `--font-script`）。写死任何色值或字体栈都会同时坏掉
 *    两件事：`lintMockHtml` 把非配色的 hex 判成 error，而且换风格它不跟着变。
 *    **投影也只能走变量**（`box-shadow: 0 40px 80px color-mix(in srgb,var(--text) 22%,transparent)`），
 *    参考图里那种 `rgba(0,0,0,.3)` 会被判成写死色值。
 * 2. **架构图不占图位**：整份骨架里**没有 `<img>`**，连线、箭头、图标一律用 CSS 画
 *    （细 `div` + `border` 三角 + 虚线）。图标组件另有一套（`ui-skeletons.ts` 的设备），
 *    架构页不配照片，所以 `imageSlotNumbers` 恒为 0——`checkLayoutSkeleton` 里有一条
 *    early-return 专门放行这一条，否则会落到底部「一个图位都没有」那条上被判死。
 *
 * ## `data-lumen-arch-node`
 *
 * 会被换成本页真实内容的块（模块名、层名、节点、标签）都标这个属性：
 * `<div class="…" data-lumen-arch-node>数据接入层</div>`。连线、箭头、纯装饰不标。
 * 生成提示词与骨架校验都认它：一份里少于两个就不是一份能用的架构骨架（`checkLayoutSkeleton` 拦）。
 */
export type ArchitectureGroup = 'layer' | 'matrix' | 'radial' | 'flow' | 'frame';

/**
 * 界面与提示词里的排列顺序。
 *
 * **按结构分，不按「平面 / 立体」分**：平面与立体是画法，同一页要「分层」时两种都该进候选。
 * 立体那类落在 `layer`，`brief` 里点明（「等距四层台」）。
 */
export const ARCHITECTURE_GROUP_ORDER: ArchitectureGroup[] = ['layer', 'matrix', 'radial', 'flow', 'frame'];

const GROUP_LABEL: Record<ArchitectureGroup, string> = {
  layer: '分层架构',
  matrix: '模块矩阵',
  radial: '中心辐射',
  flow: '流程链路',
  frame: '框架底座',
};

export function architectureGroupLabel(g: ArchitectureGroup): string {
  return GROUP_LABEL[g];
}

/** 「这一页画的是哪种结构」的全部说法，教案与候选筛选共用一份，加组时不用回来改文案 */
export const ARCHITECTURE_GROUP_NAMES = ARCHITECTURE_GROUP_ORDER.map((g) => GROUP_LABEL[g]).join(' / ');

export interface ArchitectureLayout {
  /** 形如 `arch/iso-four-tier@v1` */
  id: string;
  /** 中文名，界面与提示词都用它 */
  name: string;
  /** 一句话：长什么样、适合画什么结构。模型据此在候选里挑 */
  brief: string;
  group: ArchitectureGroup;
  /** HTML 片段：`<style>` + 一个根 `<div>`。约束见模块顶部注释 */
  skeleton: string;
}

export const ARCHITECTURE_LAYOUTS: ArchitectureLayout[] = ARCHITECTURE_SKELETONS;

/** 候选池：**排除下架的**。下架只影响自动挑版式，`ARCHITECTURE_LAYOUTS` 仍是全量，功能库要列出下架的供恢复 */
const byGroup = (g: ArchitectureGroup) =>
  ARCHITECTURE_LAYOUTS.filter((l) => l.group === g && !isHiddenLayout(l.id));

/**
 * 从教案的文字里认这一页是哪种结构。认不出回 `null`。
 *
 * 与 `ui-layouts.ts` 的 `estimateUiGroup`、`chart-layouts.ts` 的 `estimateChartKind`
 * 是同一个路子：教案那一句话由 `LESSON_TYPE_RULE.architecture` 要求写清结构名，
 * 这里按关键词对回组。**顺序有语义**——`layer` 的词写在最前，因为「分层」是架构图里
 * 最常被顺带提到的词（「分三层，每层有若干模块」这种句子里 `matrix` 的词也在），
 * 先认结构更强的那个。
 */
const GROUP_KEYWORDS: [RegExp, ArchitectureGroup][] = [
  /*
    **别写光秃秃的「台」**：教案里「数据中台」「业务平台」远比「台子」常见，
    一个「台」字会把「中心是数据中台，向外辐射六个能力」这种句子判成分层。
    层数用 `[一二三四五六七八九十\d]+\s*层` 抓，不要逐个列「三层」「四层」。
  */
  [/分层|层级|层次|[一二三四五六七八九十\d]+\s*层|堆叠|层叠|叠层|台面|台子|盘子|漏斗|金字塔/, 'layer'],
  [/辐条|辐射|放射|中枢|中心|同心|环状|环形|轮盘|发散|向外/, 'radial'],
  [/流程|步骤|阶段|时间轴|时序|链路|流水|递进|先后|箭头|走向|因果/, 'flow'],
  [/屋|房型|屋顶|顶棚|拱|支柱|柱子|柱式|底座|地基|信息屋|支撑/, 'frame'],
  [/矩阵|网格|并列|分区|卡片|模块化|板块|面板|宫格|[一二三四五六七八九十\d]+\s*[块栏列]/, 'matrix'],
];

export function estimateArchitectureGroup(text: string): ArchitectureGroup | null {
  for (const [re, group] of GROUP_KEYWORDS) if (re.test(text)) return group;
  return null;
}

/**
 * 一组最多给几个候选。
 *
 * **必须封顶**：一份架构骨架自包含（自带 `<style>`，约 2–4KB），而架构图那份提示词
 * 本身已经很长。取 3 与图表 / 界面两库同口径——候选一多模型就不挑了、每页都用同一个。
 */
const MAX_CANDIDATES = 3;

/**
 * 从这一组的第几个开始取。
 *
 * **不能取前三个。** 库里的顺序是「参考图按文件名排下来」的顺序，与这一页的内容无关；
 * 固定取前三个的话，凡是判到同一组的页都会拿到同样三份骨架，整本看下来一个样。
 * 按内容做偏移，同一组里也能转开。
 */
function offsetOf(seed: string, n: number): number {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.codePointAt(0)!) % 100003;
  return n === 0 ? 0 : h % n;
}

/**
 * 按这一页的教案筛出候选版式。**返回的数组一定非空。**
 *
 * 非空这件事靠的是**生成骨架那一步**：`scripts/recognize-architecture-layouts.ts --emit`
 * 会在任一组为空时报错退出（空组会让那段提示词整个被抽掉，架构页就退回自由发挥）。
 * 判据本身是猜的，所以单独成函数、单独测，调的时候不用碰骨架。
 */
export function architectureLayoutCandidates(input: { visualForm: string; points: string[] }): ArchitectureLayout[] {
  const group = estimateArchitectureGroup(input.visualForm)
    ?? estimateArchitectureGroup(input.points.join(' '))
    // 认不出就兜「分层」：架构图里最常见的就是分层，而且那一组版式最多，模型挑得开的余地最大
    ?? 'layer';

  const pool = byGroup(group);
  // 一组被下架光了就退回全组：候选函数承诺非空，空组比多给几个不想要的候选差得多
  const usable = pool.length > 0 ? pool : ARCHITECTURE_LAYOUTS.filter((l) => l.group === group);
  const list = usable.length > 0 ? usable : ARCHITECTURE_LAYOUTS;

  const n = Math.min(MAX_CANDIDATES, list.length);
  const start = offsetOf(`${input.visualForm}|${input.points.join('|')}`, list.length);
  return Array.from({ length: n }, (_, i) => list[(start + i) % list.length]!);
}

/**
 * 拼成提示词里的那一段。
 *
 * 骨架用 ```html 围栏包着：模型对围栏里的内容会更当成「示例」而不是「正文」。
 * 末尾那两句与另外三个库同一个口径——骨架里的示例内容必须整批换掉、配色必须走变量。
 * 这里多一句讲 `data-lumen-arch-node`：它是新东西，不说一句模型会把标记一起丢掉，
 * 而那是「哪些块该换」的唯一线索。
 */
export function architectureLayoutBlock(candidates: ArchitectureLayout[], pageLabel: string): string {
  const items = candidates.map((l) =>
    `【${l.name}】${l.brief}\n\n\`\`\`html\n${l.skeleton}\n\`\`\``,
  );
  return [
    `这一页是${pageLabel}。${pageLabel}有多种版式，**按这一页要画的哪种结构挑一种**，不要每页都用同一个。`,
    '下面是适合这一页的几个候选：',
    '',
    ...items,
    '',
    '挑一个，然后用**这套风格**的视觉语言把它画出来。',
    '**骨架里的层名、模块名、节点名、流程标签全是示例**，一律换成这一页的实际内容，一个都不要照抄；',
    '标了 `data-lumen-arch-node` 的块就是「会被换成真实内容的位置」，连线与箭头保持原样。',
    '骨架的配色一律走 CSS 变量，不要写死色值。',
  ].join('\n');
}
