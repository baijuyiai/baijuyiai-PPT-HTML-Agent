/**
 * 从一批参考图里**批量识别人物版式骨架**，并把结果生成为内置骨架库。
 *
 * ## 为什么单独一个脚本，而不是走那条识别流
 *
 * 线上那条识别流（`recognize-layout.service.ts`）是**一次一张图、出一份骨架**的口径，
 * 而这里要的是：一张图里往往装着 2–8 份版式、要一次全认出来，而且参考图是竖版、
 * 得重构成 16:9 横版。需求不同，所以另写一份提示词。
 *
 * 识别流是**只读**的，这个脚本也一样：结果先落缓存，再由 `--emit` 生成骨架文件，
 * 中途断掉重跑不会白花钱。
 *
 * 跑批、缓存、报告、写文件那一套在 `scripts/lib/recognize-layouts.ts`——与图文排版共用。
 * 这个文件只剩**这个库真正不同的三样**：提示词、校验规则、产出形状。
 *
 * ## 跑法（仓库根目录）
 *
 * ```
 * node --import tsx scripts/recognize-people-layouts.ts --limit 5      # 试点几张
 * node --import tsx scripts/recognize-people-layouts.ts                # 全跑（缓存续跑）
 * node --import tsx scripts/recognize-people-layouts.ts --fresh        # 全部重跑
 * node --import tsx scripts/recognize-people-layouts.ts --emit         # 生成骨架文件
 * ```
 *
 * ## 产物
 *
 * - `scripts/.cache/people-layouts/<slug>-<hash>.json` —— 每张图的原始识别结果（**不进版本库**）
 * - `scripts/.cache/people-layouts/report.json` —— 成功/失败/丢弃原因/花费
 * - `packages/ir-schema/src/people-skeletons.ts` —— `--emit` 时写（**生成文件，不要手改**）
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { validateSkeleton } from '../packages/server-core/src/services/studio-layout.service.ts';
import { imageSlotNumbers } from '../packages/ir-schema/src/index.ts';
import {
  CJK_RE, ROOT, asTemplate, arg, dedupe, flag, runRecognition, stripFontFamily,
  unskewImagesInSkewedFrames,
  type Draft, type Skeleton,
} from './lib/recognize-layouts.ts';

const CACHE_DIR = path.join(ROOT, 'scripts/.cache/people-layouts');
const SKELETONS_FILE = path.join(ROOT, 'packages/ir-schema/src/people-skeletons.ts');
const DEFAULT_DIR = 'C:/Users/41945/Desktop/HTML-PPT/人物排版';

const DIR = arg('dir') ?? DEFAULT_DIR;

/* ---------------- 提示词 ---------------- */

/**
 * 骨架的硬约束那几条**必须逐条复述**，不能指望模型从「用变量」三个字里推出来：
 * 它默认就会写死十六进制色值、给 `<img>` 加 `object-fit`，而这两样恰好会被
 * `lintMockHtml` 判死、或在真渲染时被带 `!important` 的样式表压掉。
 */
const SYSTEM = [
  '你是资深演示文稿版面设计师。我给你一张**竖版**的设计稿合集，里面排着**若干份互不相同的版式**。',
  '请把其中每一份都抽象成一份可复用的 HTML 骨架。',
  '',
  '只输出 JSON，不要任何解释、不要 Markdown 围栏：',
  '{"layouts":[',
  '  {"name":"版式名（8 字以内，说清是什么排法，如「左像右文斜带」）",',
  '   "slug":"kebab-case 的英文短名",',
  '   "brief":"一句话说清它长什么样、适合放什么内容（不少于 8 个字）",',
  '   "group":"solo 或 multi",',
  '   "skeleton":"骨架 HTML"}',
  ']}',
  '',
  '## 怎么拆',
  '- 这张图里有几份版式就列几条，**一份一个元素**。同一份不要拆成两条，也不要把两份合成一条。',
  '- 「一份版式」指的是**一个完整的页面构图**（有标题、有人像、有信息块，能单独当一页用），',
  '  不是图里的某个小部件。',
  '- `group`：只画**一个人**的写 `solo`，两个及以上的写 `multi`。',
  '',
  '## 竖版要重构成横版',
  '参考图是竖的，而演示页是**固定的 1920×1080 横版**。请**重新构图**，不要拉伸、不要原样竖排：',
  '- 竖着堆的元素改成**左右分栏**或**横向并列**；',
  '- 上下关系可以改成左右关系，**信息层级与留白节奏保持不变**；',
  '- 单人页尤其适合「左像右文」或「右像左文」。',
  '',
  '## 骨架的硬约束（违反了这份骨架就用不了）',
  '1. **配色一律走 CSS 变量**，一个十六进制色值都不许写，也不要用 `white`/`black` 这类具名颜色。',
  '   **整个 `<style>` 里一个 `#` 都不许出现，也不要用 `rgb(` / `hsl(`。**',
  '   能用的变量只有：`var(--bg)` `var(--surface)` `var(--text)` `var(--muted)` `var(--accent)` `var(--brand)` `var(--border)`。',
  '   **这七个变量由系统注入，不要自己写 `:root` 去定义它们**（值对不上会被判不合规），',
  '   也不要在 `<style>` 里定义任何别的颜色变量。直接用 `var(--accent)` 这样取，',
  '   深浅变化用 `opacity`。',
  '2. **人像位写成 `<img data-lumen-image="1" data-lumen-cutout="head">`**，编号从 1 起、连续不跳号，',
  '   **不写 `src`**（真图由下游按顺序填进去）。',
  '',
  '   `data-lumen-cutout` 的值**必须按参考图里那个位置画的是什么来标**，只有两个取值：',
  '   - `"head"`——画的是**头肩**（头像、圆形头像、小方块头像）。',
  '   - `"half"`——画的是**头到腰 / 头到胯**（半身像、单人主视觉、竖条里的立像）。',
  '',
  '   **这个标记决定配图时从哪个池子取图**，标错就会出现「头像位里放了一张头到膝盖的图」。',
  '',
  '3. **不要写放大裁切。** 素材库的人像**本身就是对的取景**：标 `head` 的图天生是头肩，',
  '   标 `half` 的图天生是头到腰/胯，而且都按「人物包围盒占满画框」归一化过。',
  '   页面样式表里有一条带 `!important` 的 `object-fit:contain`，人像会自动按图位高度撑满——',
  '   **骨架一个像素都不用裁**。',
  '',
  '   **特别是不要写** `.box img{width:350%;margin:-35% 0 0 -125%}` 那种大幅放大：',
  '   那套偏移是照「全身站姿」调的，套在已经裁好的半身像上会把头切掉。',
  '   真要按图位的形状微调，也只在 100%–140% 之间，别更大。',
  '',
  '   **绝对不要给 `<img>` 写 `object-fit`**——那条 `contain !important` 压得过内联样式，写了会静默失效。',
  '4. 只用 `<div>` `<style>` `<img>` `<span>` `<p>` 这些静态标签。',
  '   **不要 `<script>`、不要 `<a>`、不要外链字体或图片、不要内联 `on*`。**',
  '5. 根 `<div>` 上写死 `width:1920px;height:1080px`、`position:relative`，',
  '   内部一律绝对定位或 flex。**不要 `position:fixed`、不要 `vh` 单位。**',
  '',
  '## 占位文案一律用英文',
  '骨架里的文字是**示例**，生成真页面时会被换掉。但它读起来像什么，模型以后就照着写什么——',
  '写「四人平均型团队介绍」这种 PPT 腔，出来的每一页都是 PPT 腔。所以照参考图的语气写：',
  '- **大标题**：短、有态度，能当封面用。如「AFTER IMAGE」「LOOK EASY」「WHO WALKS WITH US」。',
  '  **不要「TEAM INTRODUCTION」「PROJECT REPORT」这类。**',
  '- **人名**：英文名，像真名。如「HANA MORI」「AKIRA KATO」「LEE JUN」。',
  '  **不要「Person A」「Name 1」这种占位感的东西。**',
  '- **身份**：英文，如「Documentary Photographer」「Chief Scientist」。',
  '- **短介**：15–30 个英文词，写**具体的细节**。',
  '  写「Workers haul the last crate ashore at three in the afternoon」，',
  '  不要「Experienced and responsible」这种空话。',
  '- **小字 kicker**：一行栏目 / 期号 / 机构，全大写。如「ASIAN PHOTOGRAPHY / 2026」「PORTRAIT SERIES」。',
  '- **可核对的细节**：年份、地点、数字。如「SEOUL / 2026」「12 DEC 2026」。',
  '',
  '**大标题、人名、短介这三样必须全英文，一个汉字都不要出现。**',
  '其余占位文案（kicker、标签、机构名）也一律英文——整页就是整页英文，不要中英混排。',
  '（用户自己的内容当然可以是中文，那是生成真页面时替换进来的，与骨架无关。）',
  '',
  '## 字体：只许写 `var(--font-*)`，一个具体字体名都不许写',
  '页面渲染时会注入**三个字体角色**，骨架里要挑字体只能挑这三个：',
  '- `var(--font-sans)`——正文、要点、说明。**默认就是它，不写也行。**',
  '- `var(--font-display)`——大标题、需要衬线/宋体的展示字。',
  '  参考图里那种「衬线大标题配黑体正文」的对比就靠它。',
  '- `var(--font-script)`——签名、引言、装饰性小字这类**手写体**。',
  '  **一份骨架最多用一处**，用多了像贴纸。',
  '',
  '**绝对不要写 `font-family:Georgia,serif` 这种具体的字体栈**，',
  '**根 `<div>` 的内联样式里也不许写**。内联样式压得过注入的规则，写了会把这套风格的字体',
  '整条盖掉，而且换风格它不跟着变。别处若写了「用系统字体栈」之类的要求，以本条为准。',
  '',
  '**字形的轻重缓急靠下面这几样做出来，不是靠换字体**：',
  '- **字重要有对比**：同一页里既要有 900 的巨字，也要有 300 / 400 的小字。',
  '  **不要通篇 700**——那样整页是平的，看着就像普通 PPT。',
  '- **字距跟着字号走**：小标签用 `letter-spacing:.3em` 以上的宽字距；',
  '  巨字用负字距（`-.02em` 到 `-.04em`）把字咬紧。',
  '- **拉丁标签一律大写**：`text-transform:uppercase` 配宽字距，是最省事的「设计感」。',
  '- **字号要拉开**：一页里最大与最小至少差 8 倍（如标题 240px 对注释 18px）。',
  '  中间那一档（60–90px）最没用，宁可不要。',
  '- **行高跟着字号走**：巨字收到 0.9–1.0，正文 1.5–1.7。',
  '- 中文大标题可以竖排（`writing-mode:vertical-rl`），参考图里就有，是很出效果的一招。',
  '',
  '6. 文字用占位内容（人名、职位、标题这类示例文字），**字号与疏密要照参考图**——',
  '   写具体一点，让版式的松紧看得出来。',
  '7. **不要 emoji**。CSS 里不写注释、不写多余换行。',
  '',
  '骨架会被直接塞进生成提示词当示例，**它自己长什么样，以后每一页就长什么样**：',
  '排版要经得起复用，不要为这一页的偶然内容做特例。',
].join('\n');

const ASK = [
  '这是一张竖版的设计稿合集，请把它里面的每一份版式都抽象成一份「人物排版」骨架。',
  '记住：**每一份都要重构成 1920×1080 的横版**，不要拉伸、不要原样竖排。',
].join('\n');

/* ---------------- 校验 ---------------- */

/** 把模型的一份草稿收成一份能用的骨架。不合规的返回问题清单 */
function accept(d: Draft, fallbackSlug: string): Skeleton | string[] {
  const issues: string[] = [];
  if (d.name.length === 0) issues.push('name 是空的');
  if (d.brief.length < 8) issues.push('brief 少于 8 个字');
  if (d.group !== 'solo' && d.group !== 'multi') issues.push(`group 只能是 solo 或 multi，收到「${d.group}」`);
  if (d.skeleton.length === 0) issues.push('skeleton 是空的');
  const { html, stripped } = stripFontFamily(d.skeleton);
  /*
    **占位文案里不许出现汉字。** 这条是用户直接提的要求（大标题、人名、短介一律英文），
    而提示词光说一遍模型会漏——加进校验里，漏了就带问题重发一次，改不掉才丢。
    `name` / `brief` 是给界面与候选列表看的中文，不在这一条里。
  */
  if (CJK_RE.test(html)) issues.push('占位文案里出现了汉字，必须全部改成英文（大标题、人名、短介一个都不能留）');
  if (issues.length === 0) issues.push(...validateSkeleton('people-layouts', html));
  if (issues.length > 0) return issues;

  return {
    name: d.name,
    slug: d.slug || fallbackSlug,
    brief: d.brief,
    group: d.group,
    skeleton: html,
    slots: imageSlotNumbers(html).length,
    stripped,
  };
}

/* ---------------- 生成骨架文件 ---------------- */

function emit(all: Skeleton[]): void {
  const byGroup = new Map<string, Skeleton[]>();
  const usedIds = new Set<string>();
  /*
    归一化放在**写文件这一步**，不放 `accept()` 里。

    缓存存的是 accept 之后的骨架，而 `--emit` 是直接从缓存读的、不会再走一遍 accept。
    放 accept 里就只有重跑识别（要花钱）才生效，存量那 73 份永远补不上。放这里则
    每次 emit 都会过一遍，而这一步是幂等的（已经补过反向斜切的规则会被跳过），
    反复 emit 不会叠加。
  */
  const entries = dedupe(all).map((s) => {
    let slug = s.slug || 'layout';
    let n = 2;
    while (usedIds.has(slug)) slug = `${s.slug}-${n++}`;
    usedIds.add(slug);
    byGroup.set(s.group, [...(byGroup.get(s.group) ?? []), s]);
    return { ...s, skeleton: unskewImagesInSkewedFrames(s.skeleton).html, id: `people/${slug}@v1` };
  });

  for (const g of ['solo', 'multi']) {
    const n = byGroup.get(g)?.length ?? 0;
    if (n === 0) throw new Error(`「${g}」这一组一份都没有。候选池按组取，空组会让人物页那段提示词整个被抽掉`);
  }

  const body = entries.map((e) => [
    '  {',
    `    id: ${JSON.stringify(e.id)},`,
    `    name: ${JSON.stringify(e.name)},`,
    `    group: ${JSON.stringify(e.group)},`,
    `    brief: ${JSON.stringify(e.brief)},`,
    `    skeleton: \`${asTemplate(e.skeleton)}\`,`,
    '  },',
  ].join('\n')).join('\n');

  const header = `import type { PeopleLayout } from './people-layouts.js';

/**
 * 人物页的版式骨架。**这是生成文件，不要手改**。
 *
 * 由 \`scripts/recognize-people-layouts.ts --emit\` 从参考图识别出来并写入。
 * 改版式要改识别提示词再重跑，手改会在下一次生成时被覆盖。
 *
 * 每份都是**自包含**的（\`<style>\` + 一个根 \`<div>\`），不共用任何底座——
 * 所以各份之间的字号与留白是各自照参考图定的，横向摆在一起不必一致。
 *
 * 约束（只用 CSS 变量取色与三个字体角色、人像位标 \`head\`/\`half\` 声明取景、
 * **不写放大裁切**）见 \`people-layouts.ts\` 顶部的说明。共 ${entries.length} 份。
 */
export const PEOPLE_SKELETONS: PeopleLayout[] = [
${body}
];
`;
  writeFileSync(SKELETONS_FILE, header, 'utf8');
  console.log(`\n已写入 ${path.relative(ROOT, SKELETONS_FILE)}：${entries.length} 份`);
  for (const g of ['solo', 'multi']) console.log(`  ${g}：${byGroup.get(g)?.length ?? 0} 份`);
}

/* ---------------- 跑 ---------------- */

await runRecognition({
  dir: DIR,
  cacheDir: CACHE_DIR,
  label: '人物排版',
  system: SYSTEM,
  ask: ASK,
  accept,
  emit,
});
