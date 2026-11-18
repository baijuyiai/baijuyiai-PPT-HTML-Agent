import { isHiddenLayout } from './hidden-layouts.js';
import { IMAGE_SKELETONS } from './image-skeletons.js';

/**
 * 图文排版页（`gallery`）的版式库。
 *
 * ## 为什么要有它
 *
 * `gallery` 是「图片成组铺开、以图为主」的页类型，此前只有一条按风格写的提示词，
 * 版式由模型自由发挥——同一套风格每次排出来的不一样，也排不出「弧形卡扇」「斜切面板」
 * 「拍立得散落」这类有明确形态的东西。
 *
 * ## 与人物排版的三个不同
 *
 * 1. **图从普通池取**（照片），不是人物池。所以图位**不写 `data-lumen-cutout`**
 *    ——写了会被当抠图位、从人物池取人像，一页图阵里冒出十几张人像不是配图。
 * 2. **槽位数封顶 12**：普通池按明暗硬筛（`stock-library/src/index.ts` 的 `toneMatched`），
 *    深色风格单页只能拿到 13 张，超出的图位会退化成占位块。
 * 3. **决定版式的量是张数**，不是人数。所以候选规则按 `slots` 与估计张数的距离排序。
 *
 * ## 两组按图位张数分
 *
 * - `feature` **图文排版**：一个图位配一段文字。
 * - `multi` **多图排版**：两个及以上图位。
 *
 * 分组由识别脚本按骨架里实际的图位数算出来（`recognize-image-layouts.ts` 的 `groupOf`），
 * 不由模型自报——张数是从骨架里数出来的，多一个能对不上的字段只会添乱。
 */
export type ImageGroup = 'feature' | 'multi';

/** 界面与提示词里的排列顺序 */
export const IMAGE_GROUP_ORDER: ImageGroup[] = ['feature', 'multi'];

const GROUP_LABEL: Record<ImageGroup, string> = {
  feature: '图文排版',
  multi: '多图排版',
};

export function imageGroupLabel(g: ImageGroup): string {
  return GROUP_LABEL[g];
}

/**
 * 按图位张数定分组。**唯一的判据**，识别脚本与在线识别流都走这里。
 *
 * 不从模型那里问：张数是从骨架里数出来的，让它自报只会多一个能对不上的字段
 * （声明 1 个图位、骨架里 6 个），而分组决定这份骨架落在功能库的哪一节。
 */
export function imageGroupOf(slots: number): ImageGroup {
  return slots <= 1 ? 'feature' : 'multi';
}

export interface ImageLayout {
  /** 形如 `gallery/mosaic-fullbleed@v1` */
  id: string;
  /** 中文名，界面与提示词都用它 */
  name: string;
  /** 一句话：适合什么内容 */
  brief: string;
  group: ImageGroup;
  /**
   * 这份骨架里有几个图位。**由识别脚本从骨架里数出来写死**，不靠运行时解析。
   * 候选规则要按张数排序，而「从产物反推约束」在骨架改一格忘同步时会静默放一个
   * 填不满的版式进来。单测钉住它等于骨架里实际的图位数。
   */
  slots: number;
  /** HTML 片段：`<style>` + 一个根 `<div>`。约束见模块顶部注释 */
  skeleton: string;
}

export const IMAGE_LAYOUTS: ImageLayout[] = IMAGE_SKELETONS;

const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9,
};

/**
 * 中文数词 → 阿拉伯数字。支持「十」「十二」「二十」「二十三」。
 *
 * 人物排版那份只认单个汉字（`people-layouts.ts` 的 `CN_NUM`），因为它抓的量词是
 * 位/个/名/人，很少写成「十二位」。图片排版页写「十二张」很自然，所以这里要认。
 */
function cnNumber(raw: string): number | undefined {
  const m = /^([一二两三四五六七八九])?十([一二三四五六七八九])?$/.exec(raw);
  if (m) {
    const tens = m[1] ? CN_NUM[m[1]]! : 1;
    const ones = m[2] ? CN_NUM[m[2]]! : 0;
    return tens * 10 + ones;
  }
  return CN_NUM[raw];
}

/**
 * 估这一页要几张图。抓不到回 `null`。
 *
 * **回 `null` 而不是 0**：0 表示「确实没有图」，`null` 表示「估不出来」，
 * 两者在 `imageLayoutCandidates` 里走不同的分支。
 *
 * 只看 `visualForm` 与 `points`：标题里常有「三大优势」这种与图片张数无关的数字。
 * 这也意味着「三张图」里那个量词必须是 张/幅/格/个——「三大优势」不算。
 */
export function estimateImageCount(visualForm: string, points: string[]): number | null {
  /**
   * 十位的可选前缀**必须在最前面**：写成 `(十[一二三四五六七八九]?|[一二两三四五六七八九]|\d+)`
   * 时，「二十张图」会从「十」那一格开始匹配、解析成 10 而不是 20——正则会从能匹配的
   * 最左位置起算，而不是最长的那个。
   */
  const m = /((?:[一二两三四五六七八九])?十[一二三四五六七八九]?|[一二两三四五六七八九]|\d+)\s*(?:张|幅|格|个)\s*(?:图|照片|图片|画面)?/.exec(visualForm);
  if (m) {
    const raw = m[1]!;
    const n = /^\d+$/.test(raw) ? Number(raw) : cnNumber(raw);
    if (n !== undefined) return n;
  }
  return points.length > 0 ? points.length : null;
}

/**
 * 页类型 → 它适用的图位区间。
 *
 * 图文页与图片排版页**共用同一个版式库**，但能挑的范围不一样。不设区间的话，
 * 图文页会挑到十二个图位的骨架——排出来与「以文字为主」的内容直接打架，
 * 而且普通图池按明暗硬筛之后单页根本给不满那么多张。
 *
 * **两张的那几份两边都在**（闭区间）：两张图的版面既可以是「图文」也可以是「多图」，
 * 该按内容定，不该由页类型替用户决定。
 *
 * 只有 `image-layouts` 用得上——人物排版决定版式的量是人数，骨架里没有 `slots`。
 *
 * **放这里而不是 `studio-layouts.ts`**：生成时筛候选（`imageLayoutCandidates`）
 * 也要用它，而 `studio-layouts` 依赖本模块，反过来 import 会成环。
 */
export const IMAGE_SLOT_RANGE: Record<string, { min: number; max: number }> = {
  imageText: { min: 1, max: 2 },
  gallery: { min: 2, max: 12 },
};

/**
 * 一组最多给几个候选。
 *
 * **必须封顶**：两组方案下「多图」那一组会有几十份，整组塞进提示词是几十 KB，
 * 而且候选一多模型就不挑了。与人物排版同一个数、同一条理由。
 */
const MAX_CANDIDATES = 4;

const byGroup = (g: ImageGroup) =>
  IMAGE_LAYOUTS.filter((l) => l.group === g && !isHiddenLayout(l.id));

/**
 * 组内排序：图位数离估计张数越近越靠前。
 *
 * `feature` 那一组每份都只有 1 个图位，没有可排的信号——按骨架顺序给前几个即可。
 *
 * **一组被下架光了就退回全组**：候选函数承诺非空，而空组会让这段提示词整个被抽掉、
 * 图片排版页退回自由发挥。下架是「别再自动挑中」，不是「这一组不许用」。
 */
function pickInGroup(group: ImageGroup, n: number | null): ImageLayout[] {
  const pool = byGroup(group);
  const usable = pool.length > 0 ? pool : IMAGE_LAYOUTS.filter((l) => l.group === group);
  if (n === null) return usable.slice(0, MAX_CANDIDATES);
  return usable
    .map((l) => ({ l, d: Math.abs(l.slots - n) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, MAX_CANDIDATES)
    .map((x) => x.l);
}

/**
 * 按这一页的内容筛出候选版式。**返回的数组一定非空。**
 *
 * 判据只有一条：**这一页要几张图**。1 张（或估不出来但只有零星几张）走 `feature`，
 * 其余走 `multi`——早先那套「按内容形态命中六个正则」的口径随六组合并成两组一起废掉了，
 * 它治的是「模型排不出弧形、斜切这些形态」，而形态现在由骨架本身保证。
 *
 * 规则是**猜的**，靠实测校准。所以它单独成函数、单独测，调的时候不用碰骨架。
 */
/**
 * 估不出张数时兜底到哪一组。
 *
 * **必须认页类型**。图文页（`imageText`）的定位是「一张图配一段文字」，兜到 `multi`
 * 会给出「九张照片墙」这类图片排版页的样子——而同一段提示词开头刚说过「这一页是图文页」。
 * 自相矛盾的结果是模型干脆整段骨架都不用，退回自由发挥，这一页就和没有版式库时一样。
 *
 * 判据取区间上限：图文页封顶 2，图片排版页放到 12。
 */
function fallbackGroup(pageType: string): ImageGroup {
  const range = IMAGE_SLOT_RANGE[pageType];
  return range !== undefined && range.max <= 2 ? 'feature' : 'multi';
}

export function imageLayoutCandidates(
  input: { title: string; claim: string; points: string[]; visualForm: string },
  /**
   * 页类型。**只在估不出张数时**用来决定兜底到哪一组（见 `fallbackGroup`）；
   * 估得出张数时按张数走，与页类型无关。不传则沿用旧行为（兜到多图那一组）。
   */
  pageType = '',
): ImageLayout[] {
  const n = estimateImageCount(input.visualForm, input.points);
  let group: ImageGroup;
  if (n === null) group = fallbackGroup(pageType);
  else group = n <= 1 ? 'feature' : 'multi';
  return pickInGroup(group, n);
}

/**
 * 拼成提示词里的那一段。
 *
 * 骨架用 ```html 围栏包着：模型对围栏里的内容会更当成「示例」而不是「正文」，
 * 而且围栏能挡住骨架里的缩进被当成正文缩进。
 *
 * **页类型名字从外面传进来。** 这个库同时服务「图文页」与「图片排版页」两个页类型，
 * 写死一个的话另一边的提示词会把页类型叫错——而页类型叫错会直接影响模型怎么取舍内容
 * （图文页以文字为主、图片排版页以图为主）。`peopleLayoutBlock` 没有这个参数，
 * 因为它只服务人物页，写死是对的。
 */
export function imageLayoutBlock(candidates: ImageLayout[], pageLabel: string): string {
  const items = candidates.map((l) =>
    `【${l.name}】${l.brief}\n\n\`\`\`html\n${l.skeleton}\n\`\`\``,
  );
  return [
    `这一页是${pageLabel}。${pageLabel}有多种版式，**按这一页的内容挑一种**，不要每页都用同一个。`,
    '下面是适合这一页的几个候选：',
    '',
    ...items,
    '',
    '挑一个，**照它的版式结构排**：几张图、怎么摆、谁大谁小、有没有弧形或斜切，都按骨架来，',
    '不要退回成普通的等宽网格——那样这一页和没有版式库时没有区别。',
    '**骨架里的图片说明文字、标签、编号全是示例**（写具体是为了让版式的疏密看得出来），',
    '一律换成这一页的实际内容，一个都不要照抄。骨架的配色一律走 CSS 变量，不要写死色值。',
  ].join('\n');
}
