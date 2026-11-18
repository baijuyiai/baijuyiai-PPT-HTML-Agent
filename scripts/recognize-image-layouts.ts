/**
 * 从一批参考图里**批量识别图文排版骨架**，并把结果生成为内置骨架库。
 *
 * ## 与人物排版识别的关系
 *
 * 跑批、缓存、报告、写文件那一套共用 `scripts/lib/recognize-layouts.ts`。
 * 这个文件只剩三样不同的：提示词、校验规则、产出形状。
 *
 * ## 与人物骨架最要紧的三处不同
 *
 * 1. **图位不写 `data-lumen-cutout`**。写了会被 `fillImageSlots` 当抠图位、
 *    从**人物池**取人像——一页多图排版里冒出十几张人像不是配图。
 * 2. **照片就该裁满**：容器 `overflow:hidden` + `img{width:100%;height:100%;object-fit:cover}`。
 *    人像那套是反的（抠图不许裁，只能容器溢出裁）。
 * 3. **槽位封顶 12**：普通照片池按明暗硬筛（`stock-library/src/index.ts` 的 `toneMatched`），
 *    深色风格单页只拿得到 13 张，超出的图位会退化成占位块。
 *
 * ## 分组由脚本算，不由模型报
 *
 * 两组按**图位张数**分：1 个图位 → `feature`（图文排版），2 个及以上 → `multi`（多图排版）。
 * 张数是从骨架里数出来的，让模型自报只会多一个能对不上的字段。
 *
 * ## 跑法（仓库根目录）
 *
 * ```
 * node --import tsx scripts/recognize-image-layouts.ts --limit 5     # 试点几张
 * node --import tsx scripts/recognize-image-layouts.ts               # 全跑（缓存续跑）
 * node --import tsx scripts/recognize-image-layouts.ts --fresh       # 全部重跑
 * node --import tsx scripts/recognize-image-layouts.ts --emit        # 生成骨架文件
 * ```
 *
 * ## 产物
 *
 * - `scripts/.cache/image-layouts/<slug>-<hash>.json` —— 原始识别结果（**不进版本库**）
 * - `scripts/.cache/image-layouts/report.json` —— 成功/失败/丢弃原因/花费
 * - `packages/ir-schema/src/image-skeletons.ts` —— `--emit` 时写（**生成文件，不要手改**）
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { validateSkeleton } from '../packages/server-core/src/services/studio-layout.service.ts';
import { imageGroupOf, imageSlotNumbers } from '../packages/ir-schema/src/index.ts';
import {
  CJK_RE, ROOT, asTemplate, arg, dedupe, runRecognition, stripFontFamily,
  type Draft, type Skeleton,
} from './lib/recognize-layouts.ts';

const CACHE_DIR = path.join(ROOT, 'scripts/.cache/image-layouts');
const SKELETONS_FILE = path.join(ROOT, 'packages/ir-schema/src/image-skeletons.ts');
const DEFAULT_DIR = 'C:/Users/41945/Desktop/HTML-PPT/多图排版';

const DIR = arg('dir') ?? DEFAULT_DIR;

/** 单页最多几个图位。见文件头「槽位封顶 12」 */
const MAX_SLOTS = 12;

/* ---------------- 提示词 ---------------- */

const SYSTEM = [
  '你是资深演示文稿版面设计师。我给你一张**竖版**的设计稿合集，里面排着**若干份互不相同的版式**。',
  '请把其中每一份都抽象成一份可复用的 HTML 骨架。',
  '',
  '只输出 JSON，不要任何解释、不要 Markdown 围栏：',
  '{"layouts":[',
  '  {"name":"版式名（8 字以内，说清是什么排法，如「左文右六格」）",',
  '   "slug":"kebab-case 的英文短名",',
  '   "brief":"一句话说清它长什么样、适合放什么内容（不少于 8 个字）",',
  '   "skeleton":"骨架 HTML"}',
  ']}',
  '',
  '## 怎么拆',
  '- 这张图里有几份版式就列几条，**一份一个元素**。同一份不要拆成两条，也不要把两份合成一条。',
  '- 「一份版式」指的是**一个完整的页面构图**（能单独当一页用），不是图里的某个小部件。',
  '- **图文版式也要认**：一张图配一段文字的那种，图位只有 1 个，同样算一份完整版式。',
  '',
  '## 竖版要重构成横版',
  '参考图是竖的，而演示页是**固定的 1920×1080 横版**。请**重新构图**，不要拉伸、不要原样竖排：',
  '- 竖着堆的元素改成**左右分栏**或**横向并列**；',
  '- 上下关系可以改成左右关系，**信息层级与留白节奏保持不变**。',
  '',
  '## 骨架的硬约束（违反了这份骨架就用不了）',
  '1. **配色一律走 CSS 变量**，一个十六进制色值都不许写，也不要用 `white`/`black` 这类具名颜色。',
  '   **整个 `<style>` 里一个 `#` 都不许出现，也不要用 `rgb(` / `hsl(`。**',
  '   能用的变量只有：`var(--bg)` `var(--surface)` `var(--text)` `var(--muted)` `var(--accent)` `var(--brand)` `var(--border)`。',
  '   **这七个变量由系统注入，不要自己写 `:root` 去定义它们**（值对不上会被判不合规），',
  '   也不要在 `<style>` 里定义任何别的颜色变量。深浅变化用 `opacity`。',
  '2. **图位写成 `<img data-lumen-image="1">`**，编号从 1 起、连续不跳号，**不写 `src`**',
  '   （真图由下游按顺序填进去）。**一页最多 12 个图位。**',
  '',
  '   **绝对不要写 `data-lumen-cutout`**——那个标记是给「透明底人像」用的，写了这个图位',
  '   就会从**人像库**取图，一页图阵里冒出十几张人像。这一页要的是普通照片。',
  '',
  '3. **照片要裁满格子**：外层容器 `overflow:hidden`，里面的 `img` 写',
  '   `.ph{overflow:hidden} .ph img{width:100%;height:100%;object-fit:cover;display:block}`。',
  '   **不要用容器放大位移去裁**（`width:350%;margin:…` 那套）——那是给抠图用的，照片不需要。',
  '4. 只用 `<div>` `<style>` `<img>` `<span>` `<p>` `<h1>` `<h2>` `<h3>` 这些静态标签。',
  '   **不要 `<script>`、不要 `<a>`、不要外链字体或图片、不要内联 `on*`。**',
  '5. 根 `<div>` 上写死 `width:1920px;height:1080px`、`position:relative`，',
  '   内部一律绝对定位或 grid/flex。**不要 `position:fixed`、不要 `vh` 单位。**',
  '',
  '## 占位文案一律用英文',
  '骨架里的文字是**示例**，生成真页面时会被换掉。但它读起来像什么，模型以后就照着写什么——',
  '写「项目成果展示」这种 PPT 腔，出来的每一页都是 PPT 腔。所以照参考图的语气写：',
  '- **大标题**：短、有态度。如「SELECTED WORKS」「THE LONG READ」「OUR WORKS」。',
  '  **不要「PROJECT OVERVIEW」「IMAGE GALLERY」这类。**',
  '- **图注 / 标签**：具体。如「Brick Courtyard, 2026」「Milan / Spring」。不要「Image 1」。',
  '- **小字 kicker**：一行栏目 / 期号，全大写。如「PORTFOLIO / 2026」「SELECTED SERIES」。',
  '- **短说明**：15–30 个英文词，写**具体的细节**，不要「Beautiful and inspiring」这种空话。',
  '- **可核对的细节**：年份、地点、数字。如「MILAN / 2025」「12 DEC 2026」。',
  '',
  '**全部占位文案都用英文，一个汉字都不要出现**，也不要中英混排。',
  '（用户自己的内容当然可以是中文，那是生成真页面时替换进来的，与骨架无关。）',
  '',
  '## 字体：只许写 `var(--font-*)`，一个具体字体名都不许写',
  '页面渲染时会注入**三个字体角色**，骨架里要挑字体只能挑这三个：',
  '- `var(--font-sans)`——正文、图注、说明。**默认就是它，不写也行。**',
  '- `var(--font-display)`——大标题、需要衬线/宋体的展示字。',
  '- `var(--font-script)`——签名、引言这类**手写体**。**一份骨架最多用一处**，用多了像贴纸。',
  '',
  '**绝对不要写 `font-family:Georgia,serif` 这种具体的字体栈**，',
  '**根 `<div>` 的内联样式里也不许写**。内联样式压得过注入的规则，写了会把这套风格的字体',
  '整条盖掉，而且换风格它不跟着变。别处若写了「用系统字体栈」之类的要求，以本条为准。',
  '',
  '**字形的轻重缓急靠下面这几样做出来，不是靠换字体**：',
  '- **字重要有对比**：同一页里既要有 900 的巨字，也要有 300 / 400 的小字。',
  '  **不要通篇 700**——那样整页是平的。',
  '- **字距跟着字号走**：小标签用 `letter-spacing:.3em` 以上的宽字距；巨字用负字距把字咬紧。',
  '- **拉丁标签一律大写**：`text-transform:uppercase` 配宽字距，是最省事的「设计感」。',
  '- **字号要拉开**：一页里最大与最小至少差 8 倍。中间那一档（60–90px）最没用，宁可不要。',
  '- **行高跟着字号走**：巨字收到 0.9–1.0，正文 1.5–1.7。',
  '',
  '6. **不要 emoji**。CSS 里不写注释、不写多余换行。',
  '',
  '骨架会被直接塞进生成提示词当示例，**它自己长什么样，以后每一页就长什么样**：',
  '排版要经得起复用，不要为这一页的偶然内容做特例。',
].join('\n');

const ASK = [
  '这是一张竖版的设计稿合集，请把它里面的每一份版式都抽象成一份「图文排版」骨架。',
  '记住三件事：**每一份都要重构成 1920×1080 的横版**；**图位不写 `data-lumen-cutout`**；',
  '**照片用 `object-fit:cover` 裁满格子**。',
].join('\n');

/* ---------------- 校验 ---------------- */

/** 把模型的一份草稿收成一份能用的骨架。不合规的返回问题清单 */
function accept(d: Draft, fallbackSlug: string): Skeleton | string[] {
  const issues: string[] = [];
  if (d.name.length === 0) issues.push('name 是空的');
  if (d.brief.length < 8) issues.push('brief 少于 8 个字');
  if (d.skeleton.length === 0) issues.push('skeleton 是空的');
  const { html, stripped } = stripFontFamily(d.skeleton);
  const slots = imageSlotNumbers(html).length;
  // 占位文案一律英文，见提示词那一节。`name` / `brief` 是给界面看的中文，不在此列
  if (CJK_RE.test(html)) issues.push('占位文案里出现了汉字，必须全部改成英文');
  // 图位标了 cutout 就会从人像库取图，一页图阵里冒出十几张人像
  if (/data-lumen-cutout/i.test(html)) {
    issues.push('图位写了 data-lumen-cutout——那是透明底人像的标记，图阵里不能有，要从人像库取图的');
  }
  if (slots > MAX_SLOTS) {
    issues.push(`图位有 ${slots} 个，超过 ${MAX_SLOTS}——普通图池按明暗硬筛后单页最多给到 12 张，多的会变成占位块`);
  }
  if (issues.length === 0) issues.push(...validateSkeleton('image-layouts', html));
  if (issues.length > 0) return issues;

  return {
    name: d.name,
    slug: d.slug || fallbackSlug,
    brief: d.brief,
    group: imageGroupOf(slots),
    skeleton: html,
    slots,
    stripped,
  };
}

/* ---------------- 生成骨架文件 ---------------- */

function emit(all: Skeleton[]): void {
  const byGroup = new Map<string, Skeleton[]>();
  const usedIds = new Set<string>();
  const entries = dedupe(all).map((s) => {
    let slug = s.slug || 'layout';
    let n = 2;
    while (usedIds.has(slug)) slug = `${s.slug}-${n++}`;
    usedIds.add(slug);
    byGroup.set(s.group, [...(byGroup.get(s.group) ?? []), s]);
    return { ...s, id: `gallery/${slug}@v1` };
  });

  for (const g of ['feature', 'multi']) {
    const n = byGroup.get(g)?.length ?? 0;
    if (n === 0) throw new Error(`「${g}」这一组一份都没有。候选池按组取，空组会让图片排版页那段提示词整个被抽掉`);
  }

  const body = entries.map((e) => [
    '  {',
    `    id: ${JSON.stringify(e.id)},`,
    `    name: ${JSON.stringify(e.name)},`,
    `    group: ${JSON.stringify(e.group)},`,
    `    brief: ${JSON.stringify(e.brief)},`,
    `    slots: ${e.slots},`,
    `    skeleton: \`${asTemplate(e.skeleton)}\`,`,
    '  },',
  ].join('\n')).join('\n');

  const header = `import type { ImageLayout } from './image-layouts.js';

/**
 * 图文排版页的版式骨架。**这是生成文件，不要手改**。
 *
 * 由 \`scripts/recognize-image-layouts.ts --emit\` 从参考图识别出来并写入。
 * 改版式要改识别提示词再重跑，手改会在下一次生成时被覆盖。
 *
 * 两组按**图位张数**分：1 个图位是 \`feature\`（图文排版），2 个及以上是 \`multi\`（多图排版）。
 *
 * 每份都是**自包含**的（\`<style>\` + 一个根 \`<div>\`），不共用任何底座——
 * 所以各份之间的字号与留白是各自照参考图定的，横向摆在一起不必一致。
 *
 * 约束（只用 CSS 变量取色与三个字体角色、图位**不写** \`data-lumen-cutout\`、
 * 照片用 \`object-fit:cover\` 裁满）见 \`image-layouts.ts\` 顶部的说明。共 ${entries.length} 份。
 */
export const IMAGE_SKELETONS: ImageLayout[] = [
${body}
];
`;
  writeFileSync(SKELETONS_FILE, header, 'utf8');
  console.log(`\n已写入 ${path.relative(ROOT, SKELETONS_FILE)}：${entries.length} 份`);
  for (const g of ['feature', 'multi']) console.log(`  ${g}：${byGroup.get(g)?.length ?? 0} 份`);
}

/* ---------------- 跑 ---------------- */

await runRecognition({
  dir: DIR,
  cacheDir: CACHE_DIR,
  label: '图文排版',
  system: SYSTEM,
  ask: ASK,
  accept,
  emit,
});
