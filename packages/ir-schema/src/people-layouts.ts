import { imageSlotNumbers } from './html-doc.js';
import { isHiddenLayout } from './hidden-layouts.js';
import { PEOPLE_SKELETONS } from './people-skeletons.js';

/**
 * 人物页的版式库。
 *
 * 人物页有几十种排法（单人特写、头像行、斜切飘带、六边形网格……），让模型每次自由发挥
 * 是排不出该有的样子的。这里把每种排法写成一份**骨架**，生成时按这一页的内容筛出
 * 几个候选给模型挑，它照着排。
 *
 * ## 骨架从哪来
 *
 * 全部由 `scripts/recognize-people-layouts.ts` 从一批参考图识别出来，写在
 * `people-skeletons.ts`（生成文件）。**每份自包含**（自带 `<style>` + 根 `<div class="page">`），
 * 不共用底座——所以各份之间的字号与留白是各自照参考图定的，横向摆在一起并不一致。
 *
 * ## 骨架为什么能跨风格复用
 *
 * 骨架只用 `buildPageDocument` 注入的那几个 CSS 变量取色
 * （`--bg` / `--surface` / `--text` / `--muted` / `--accent` / `--brand` / `--border`）
 * 与三个字体角色（`--font-sans` / `--font-display` / `--font-script`，见 `html-doc.ts` 的
 * `fontVars`），所以换一套风格自动跟着变，不需要每套风格各写一份。
 * **骨架里写死任何色值或字体栈都会同时坏掉两件事**：`lintMockHtml` 会把非配色的 hex
 * 判成 error，而且换风格它不跟着变。
 *
 * 字体那三个角色是分开的：正文走 `--font-sans`，衬线大标题走 `--font-display`，
 * 签名与引言这类手写体走 `--font-script`。参考图里「衬线大标题配黑体正文 + 一处手写签名」
 * 是很常见的组合，一个字体栈表达不了。
 *
 * ## 骨架为什么是 HTML 而不是一句描述
 *
 * 只给一句「左文右像」，模型排出来的东西仍然每次都不一样。给一份能跑的骨架当示例，
 * 版式一致性高得多——`derivePrompts` 拿已有提示词当 few-shot 是同一个道理。
 *
 * ## 骨架里的三条硬约束
 *
 * 1. **只用 CSS 变量取色**（上面那条）。
 * 2. **人像位写 `<img data-lumen-image="n" data-lumen-cutout="head">`，不写 `src`。**
 *    编号从 1 起、同一份骨架里连续——`fillImageSlots` 按下标取图，跳号会把后面的格子挪过来。
 *
 *    `data-lumen-cutout` 的取值是**取景**，只有 `"head"`（头肩）与 `"half"`（头到腰/胯）两个。
 *    它决定配图时从哪个池子取图（`@lumen/stock-library` 的 `peoplePoolOf`），
 *    标错就会出现「头像位里放了一张头到膝盖的图」。老页面写的 `"1"` 仍能渲染，
 *    取景按 `half` 兜底。
 * 3. **不要写放大裁切。** 素材库的人像本身就是对的取景（`head` 的图天生是头肩、
 *    `half` 的图天生是头到腰/胯，都按「包围盒占满画框」归一化过），
 *    而 `html-doc.ts` 里那条 `img[data-lumen-cutout=…]{object-fit:contain !important}`
 *    会自动按图位高度撑满。**大幅放大只会把头切掉**——那套 `width:350%` 的偏移
 *    是照早年「全身站姿」的素材调的，早就没用了。
 *
 *    要按图位的形状微调（圆形头像、六边形）仍然只能用容器裁，写成
 *    `.avatar{overflow:hidden} > .avatar img{width:130%;height:130%;margin:-15% 0 0 -15%}`，
 *    幅度控制在 100%–140%。**不能给 img 写 `object-fit: cover`**：那条 `!important`
 *    的样式表规则压得过内联样式，写了会静默失效，页面上是「整个人缩在圆圈里」。
 */
export type PeopleGroup = 'solo' | 'multi';

/** 界面与提示词里的排列顺序 */
export const PEOPLE_GROUP_ORDER: PeopleGroup[] = ['solo', 'multi'];

const GROUP_LABEL: Record<PeopleGroup, string> = {
  solo: '单人',
  multi: '多人',
};

export function peopleGroupLabel(g: PeopleGroup): string {
  return GROUP_LABEL[g];
}

export interface PeopleLayout {
  /** 形如 `people/row-hex-team@v1` */
  id: string;
  /** 中文名，界面与提示词都用它 */
  name: string;
  /** 一句话：适合什么内容。模型据此在候选里挑 */
  brief: string;
  group: PeopleGroup;
  /** HTML 片段：`<style>` + 一个根 `<div>`。约束见模块顶部注释 */
  skeleton: string;
}

export const PEOPLE_LAYOUTS: PeopleLayout[] = PEOPLE_SKELETONS;

/** 候选池：**排除下架的**。下架只影响挑版式，`PEOPLE_LAYOUTS` 本身仍是全量，功能库要列出下架的供恢复 */
const byGroup = (g: PeopleGroup) =>
  PEOPLE_LAYOUTS.filter((l) => l.group === g && !isHiddenLayout(l.id));

/**
 * 「一位主角」这一类。
 *
 * 必须有这一条，**不能只靠人数**：人物简介这类页常常既没有要点也没有视觉形式
 * （教案还没跑、或模型没写），人数就估不出来，只靠 `n <= 1` 会掉到多人那一组去。
 */
const SOLO_RE = /创始人|致辞|专访|个人简介|人物简介|主讲|演讲人|履历/;

const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
};

/**
 * 从文本里估这一页有几个人。抓不到回 `null`。
 *
 * **回 `null` 而不是 0**：0 表示「确实是零个人」，`null` 表示「估不出来」，
 * 两者在 `peopleLayoutCandidates` 里走不同的分支。
 */
function estimatePeople(text: string): number | null {
  const m = /([一二两三四五六七八九十]|\d+)\s*(?:位|个|名|人)/.exec(text);
  if (!m) return null;
  const raw = m[1]!;
  const n = /^\d+$/.test(raw) ? Number(raw) : CN_NUM[raw];
  return n === undefined ? null : n;
}

/**
 * 一组最多给几个候选。
 *
 * **必须封顶**：两组方案下「多人」那一组有四十多份，整组塞进提示词是两百多 KB。
 * 但也不能压得太狠——候选一多模型就不挑了、每页都用同一个，太少又挑不开。
 *
 * 取 **4** 是量出来的：每份骨架自包含（自带 `<style>`，约 3.2KB），
 * 6 份时这一段 12–20KB，是原来那套共用底座的骨架（约 9KB）的两倍多，
 * 而人物页每生成一页都要带上它。4 份压回 8–14KB，与原来同一个量级。
 * 组内已经按「图位数离估计人数最近」排过序，所以前四个就是最贴的四个。
 */
const MAX_CANDIDATES = 4;

/**
 * 组内排序：图位数离估计人数越近越靠前。
 *
 * **一组被下架光了就退回全组**：候选函数承诺非空，而空组会让这段提示词整个被抽掉、
 * 人物页退回自由发挥——那比多给几个用户不想要的候选差得多。下架是「别再自动挑中」，
 * 不是「这一组不许用」。
 */
function pickInGroup(group: PeopleGroup, n: number | null): PeopleLayout[] {
  const pool = byGroup(group);
  const usable = pool.length > 0 ? pool : PEOPLE_LAYOUTS.filter((l) => l.group === group);
  if (n === null) return usable.slice(0, MAX_CANDIDATES);
  return usable
    .map((l) => ({ l, d: Math.abs(imageSlotNumbers(l.skeleton).length - n) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, MAX_CANDIDATES)
    .map((x) => x.l);
}

/**
 * 按这一页的内容筛出候选版式。**返回的数组一定非空。**
 *
 * 非空这件事靠的是**生成骨架那一步**：`scripts/recognize-people-layouts.ts --emit`
 * 会在任一组为空时报错退出（空组会让这段提示词整个被抽掉，人物页就退回自由发挥）。
 *
 * 规则是**猜的**——判据用的是标题、主张、要点与视觉形式这些现成的文本，实测之后
 * 可能要调。所以它单独成函数、单独测，调的时候不用碰骨架。
 */
export function peopleLayoutCandidates(input: {
  title: string; claim: string; points: string[]; visualForm: string;
}): PeopleLayout[] {
  const all = [input.title, input.claim, input.visualForm, ...input.points].join(' ');
  /**
   * 估人数时只看 `visualForm` 与要点：标题里常有「三大优势」这种与人数无关的数字。
   *
   * **注意 `points` 最多 5 条**（`OutlinePage` 里是 `.max(5)`），所以「人数 ≥ 6」
   * 只能由 `visualForm` 得出——那是数据本身的边界，不是规则写漏了。
   */
  const n = estimatePeople(input.visualForm) ?? (input.points.length || null);

  /*
    两组的判据只有这一条。

    原来分五组时这里是一串「画像 / 一组人 / 一位主角」的正则接力，现在只剩单人那一组
    需要靠词判断：**多人是兜底**，估不出人数、也没命中单人词的，一律按多人排——
    人物页最常见的本来就是一组人，而那一组版式也最多，模型挑得开的余地最大。
  */
  const solo = (n !== null && n <= 1) || SOLO_RE.test(all);
  return pickInGroup(solo ? 'solo' : 'multi', n);
}

/**
 * 拼成提示词里的那一段。
 *
 * 骨架用 ```html 围栏包着：模型对围栏里的内容会更当成「示例」而不是「正文」，
 * 而且围栏能挡住骨架里的缩进被当成正文缩进。
 */
export function peopleLayoutBlock(candidates: PeopleLayout[]): string {
  const items = candidates.map((l) =>
    `【${l.name}】${l.brief}\n\n\`\`\`html\n${l.skeleton}\n\`\`\``,
  );
  return [
    '这一页是人物页。人物页有多种版式，**按这一页的内容挑一种**，不要每页都用同一个。',
    '下面是适合这一页的几个候选：',
    '',
    ...items,
    '',
    '挑一个，然后用**这套风格**的视觉语言把它写出来。',
    '**骨架里的人名、职位、机构名、简介全是示例**（写具体是为了让版式的疏密看得出来），',
    '一律换成这一页的实际内容，一个都不要照抄。骨架的配色一律走 CSS 变量，不要写死色值。',
  ].join('\n');
}
