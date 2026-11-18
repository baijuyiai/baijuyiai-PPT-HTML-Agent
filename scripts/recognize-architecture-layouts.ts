/**
 * 从一批参考图里**批量识别架构图版式骨架**，并把结果生成为内置骨架库。
 *
 * ## 为什么要单独一份，而不是改人物那份
 *
 * 批处理、缓存、重试、报告都在 `scripts/lib/recognize-layouts.ts`，与人物 / 图文 / 界面共用。
 * 这个文件只剩**这个库真正不同的四样**：提示词、校验规则、产出形状，以及**分组**。
 *
 * ## 与另外三个库最要紧的一处分叉
 *
 * 人物 / 图文 / 界面三份都有一条「占位文案里不许出现汉字」的校验，架构这份**故意不加**：
 * 架构图的模块名、层名、流程标签本来就是中文（参考图里全是「数据接入层」「计算引擎」这种），
 * 而生成真页面时这些位置要换成这一页的实际内容——中文占位更贴、模型照抄的腔调也更对。
 * 详见 `packages/ir-schema/src/architecture-layouts.ts` 顶部注释。
 *
 * ## 分组按「结构」分，不按「平面 / 立体」分
 *
 * 平面与立体是**画法**，不是结构。用户要判的是「我这一页是什么结构」；而同一页要「分层」时，
 * 平面与等距立体两种都该进候选。所以立体那类统一落在 `layer`，只在 `brief` 里点明
 * （「等距四层台」），用户一眼看得到。
 *
 * ## 跑法（仓库根目录）
 *
 * ```
 * node --import tsx scripts/recognize-architecture-layouts.ts --limit 3   # 试点几张
 * node --import tsx scripts/recognize-architecture-layouts.ts             # 全跑（缓存续跑）
 * node --import tsx scripts/recognize-architecture-layouts.ts --fresh     # 全部重跑
 * node --import tsx scripts/recognize-architecture-layouts.ts --emit      # 生成骨架文件
 * ```
 *
 * ## 产物
 *
 * - `scripts/.cache/architecture-layouts/<slug>-<hash>.json` —— 每张图的原始识别结果（**不进版本库**）
 * - `scripts/.cache/architecture-layouts/report.json` —— 成功/失败/丢弃原因/花费
 * - `packages/ir-schema/src/architecture-skeletons.ts` —— `--emit` 时写（**生成文件，不要手改**）
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { validateSkeleton } from '../packages/server-core/src/services/studio-layout.service.ts';
import { imageSlotNumbers } from '../packages/ir-schema/src/index.ts';
import {
  ROOT, asTemplate, arg, dedupe, runRecognition, stripFontFamily,
  type Draft, type Skeleton,
} from './lib/recognize-layouts.ts';

const CACHE_DIR = path.join(ROOT, 'scripts/.cache/architecture-layouts');
const SKELETONS_FILE = path.join(ROOT, 'packages/ir-schema/src/architecture-skeletons.ts');
const DEFAULT_DIR = 'C:/Users/41945/Desktop/HTML-PPT/架构排版';

const DIR = arg('dir') ?? DEFAULT_DIR;

/* ---------------- 提示词 ---------------- */

/**
 * 骨架的硬约束那几条**必须逐条复述**，不能指望模型从「用变量」三个字里推出来：
 * 它默认就会写死十六进制色值、拿 `rgba(0,0,0,.3)` 做投影、把参考图里的图标换成 `<img>`，
 * 这三样恰好都会被 `lintMockHtml` 判死。
 */
const SYSTEM = [
  '你是资深演示文稿版面设计师，专做**架构图 / 逻辑框架图**。我给你一张**竖版**的设计稿合集，',
  '里面排着**若干份互不相同的架构版式**。请把其中每一份都抽象成一份可复用的 HTML 骨架。',
  '',
  '只输出 JSON，不要任何解释、不要 Markdown 围栏：',
  '{"layouts":[',
  '  {"name":"版式名（8 字以内，说清是什么排法，如「等距四层台」「中枢八辐条」）",',
  '   "slug":"kebab-case 的英文短名",',
  '   "brief":"一句话说清它长什么样、适合画什么结构（不少于 8 个字）",',
  '   "group":"layer 或 matrix 或 radial 或 flow 或 frame",',
  '   "skeleton":"骨架 HTML"}',
  ']}',
  '',
  '## 怎么拆',
  '- 这张图里有几份版式就列几条，**一份一个元素**。同一份不要拆成两条，也不要把两份合成一条。',
  '- 「一份版式」指的是**一个完整的页面构图**（有标题区、有一张图、能单独当一页用），',
  '  不是图里的某个小部件、不是缩略图、不是一张说明卡。',
  '- 参考图常常是「一张图拼好几份样例」（一边摆着四五种画法）：**每一个独立样例各算一份**。',
  '- 参考图里那台手机 / 浏览器截图、那个终端窗口，**不算一份版式**，跳过。',
  '',
  '## group：这一份是哪种结构（只能填这五个之一）',
  '- `layer` **分层架构**：**上下分层**的堆叠——横向的层带 / 圆盘一层压一层，或等距立体的分层台、',
  '  锥形、漏斗。层与层是上下关系。参考图里那种「三四个盘子摞起来」全归这里。',
  '- `matrix` **模块矩阵**：页面被切成**并列**的若干模块 / 卡片 / 分区面板，没有明显的上下分层。',
  '- `radial` **中心辐射**：有一个**中心**向外发散——中枢加辐条、同心环、环状协作、双圆交汇。',
  '- `flow` **流程链路**：**有方向**——流程、步骤、阶段带、时间轴、树状分支、带箭头的因果链。',
  '- `frame` **框架底座**：**屋架式**——有顶棚（屋顶 / 拱）、支柱、底座的那种（信息屋、房型）。',
  '一份骨架只画**一种**结构，不要在一份里同时塞分层和流程。',
  '',
  '## 竖版要重构成横版',
  '参考图是竖的，而演示页是**固定的 1920×1080 横版**。请**重新构图**，不要拉伸、不要原样竖排：',
  '- 竖着堆的元素改成**左右分栏**或**横向并列**；上下关系可以改成左右关系，**信息层级与留白节奏保持不变**；',
  '- 一张横版画不下十几层时，**把层做宽、把文字放小、削掉装饰**，而不是缩成一小坨居中。',
  '',
  '## 标题区要留出自己的一条',
'标题**不许被色块、层、连线压住**：最上面留出约 110–160px 给标题区（一个标题 + 一行小字），',
'任何色块、分层台、连线都从它下面开始，标题与图形之间也要留白、不要贴在一起。',
'参考图里常有「标题压在色块上」的写法，**不要照抄**——缩略图里看着大气，真页面上那行字会看不清。',
'（标题文字也要标 `data-lumen-arch-node`。）',
'',
'## 骨架的硬约束（违反了这份骨架就用不了）',
  '1. 必须有 `<style>` 和**一个根 `<div>`**；根 `<div>` 上写死 `width:1920px;height:1080px`、',
  '   `position:relative`，内部一律绝对定位或 flex。**不要 `position:fixed`、不要 `vh` 单位、',
  '   不要 `<html>` / `<body>` 整文档。**',
  '2. **配色一律走 CSS 变量**，一个十六进制色值都不许写，也不要用 `white` / `black` 这类具名颜色。',
  '   **整个 `<style>` 里一个 `#` 都不许出现，也不要用 `rgb(` / `rgba(` / `hsl(`。**',
  '   能用的变量只有：`var(--bg)` `var(--surface)` `var(--text)` `var(--muted)` `var(--accent)`',
  '   `var(--brand)` `var(--border)`。**这七个由系统注入，不要自己写 `:root` 去定义它们**，',
  '   也不要在 `<style>` 里定义别的颜色变量。深浅变化靠 `opacity`，半透明靠',
  '   `color-mix(in srgb,var(--x) 60%,transparent)`。',
  '   **投影也只能用它**：`box-shadow:0 40px 80px color-mix(in srgb,var(--text) 22%,transparent)`。',
  '   **绝对不要写 `rgba(0,0,0,.3)` 这种阴影色**（会被判成写死色值）。',
  '3. **不要任何 `<img>` / `<svg>` / `<canvas>`**。架构图是一张图解、不配照片（系统不会往里填图），',
  '   参考图里的图标用小方块、圆点、边框或一个字符画出来。不要外链、不要 `<script>`、不要 `<a>`、',
  '   不要内联 `on*`。',
  '4. **每个会被换成真实内容的块都要标 `data-lumen-arch-node`**：模块 / 层名 / 节点 / 标签写成',
  '   `<div class="…" data-lumen-arch-node>数据接入层</div>`。一份里**至少两个**，一个都不标这份就用不了。',
  '   **只标「块」，连线、箭头、纯装饰色块不标。**',
  '',
  '## 占位文字：写中文的**方向性占位**，不要写成某份具体方案',
  '骨架里的文字是**示例**，生成真页面时会整批换掉。它写的是什么，模型以后就照着写什么：',
  '- **模块 / 层名**：「数据接入层」「计算引擎」「存储服务」「平台底座」「业务中台」「能力开放」「数据源」「模型层」。',
  '- **子模块 / 条目**：「用户管理」「权限校验」「实时同步」「批处理」「监控告警」「配置中心」。',
  '- **流程标签 / 关系**：「采集 → 清洗 → 入库」「调用」「回写」「上报」「同步」。',
  '- **标题**：这个主题的画法名，如「系统分层架构」「数据平台逻辑关系」「能力矩阵」。',
  '- **编号 / 序号**：`01` `02` `03`、`L1`–`L4`。',
  '**不要**写「某公司 2026 年数字化转型解决方案」这种具体项目名，也不要写「模块 A」「Node 1」这种',
  '占位感的东西——要像真的架构词，只是不指向某一个真实系统。文字**长短照参考图的疏密**给，',
  '让版式的松紧看得出来。',
  '',
  '## 连线与箭头：用 CSS 画',
  '- 一条线：一个 1–2px 的 `div`，`background:var(--border)`（强调线用 `var(--accent)`）。',
  '- 箭头：用 `border` 三角画的小方块（`width:0;height:0;border-left:8px solid var(--border)` 那种），',
  '  或一个小色块，放在线末端。',
  '- 层间 / 辐条间的**虚线**：`border-top:2px dashed var(--border)`。',
  '- 分区的**虚线大框**：`border:2px dashed var(--border);border-radius:…`。',
  '- 强调块用 `var(--accent)` 或 `var(--brand)` 做底，块里的文字色要能看清（见下面那条）。',
  '',
  '## 等距立体的分层台怎么用 CSS 复现',
  '参考图里有那种「椭圆台子一层叠一层、带厚度与投影」的画法，**照做**，用这几样就够：',
  '- **台面**：一个 `div` 写 `border-radius:50%`，宽高比约 3:1（如 `width:900px;height:300px`），',
  '  `background:var(--surface)`；层与层之间压一层稍暗的 `var(--bg)`。',
  '- **厚度 / 侧壁**：在台面下压一个同样大的椭圆，`background:var(--brand)` 配 `opacity:.25`；',
  '  再用上面那条 `box-shadow` 做投影——一块台子就有立体感了。',
  '- **倾斜**：想更斜一点用 `transform:skewX(-8deg)` 或 `rotate(-3deg)`。**不要**加 `perspective` /',
  '  `rotate3d` 做整场景（缩放后容易错位、看着糊）。各层**保持同一条垂直中轴**。',
  '- **层间细柱 / 小节点**：1–3px 的竖线加一个小方块，放在两层之间（参考图里都有）。',
  '- 从上到下**一层比一层宽**（金字塔感）或**一样宽**都行，照参考图；每层文字压在台面**中央或左端**。',
  '',
  '## 字体：只许写 `var(--font-*)`',
  '页面渲染时会注入**三个字体角色**，骨架里要挑字体只能挑这三个：',
  '- `var(--font-sans)`——正文、标签、条目。**默认就是它，不写也行。**',
  '- `var(--font-display)`——大标题、层名这类需要分量的展示字。',
  '- `var(--font-script)`——只在少数构图里用一处做点缀。',
  '**绝对不要写 `font-family:微软雅黑,sans-serif` 这种具体的字体栈，根 `<div>` 的内联样式里也不许写**',
  '（内联会压过注入的规则）。**不要用等宽字体**——终端风那种等宽字形这套里没有，别照抄。',
  '轻重缓急靠这几样：**字重要有对比**（大层名 700–900、小标签 400）；**字距跟着字号走**',
  '（小标签 `letter-spacing:.2em` 以上，巨字负字距）；**字号要拉开**（最大与最小差 5 倍以上）；',
  '**行高跟着字号走**（大标题 0.95–1.05、正文 1.4–1.6）。',
  '',
  '## 文字对比度（这是硬规则）',
  '**深色底必须配浅色字、浅色底必须配深色字。** 参考图里有大量「黑底上一行很淡的灰字」，',
  '**不要照抄那种几乎看不见的灰**：只要一个块的底色与里面文字的反差不够，整份骨架会被判不合规。',
  '拿不准就让文字走 `var(--text)`。**整页铺深色底时，页面上所有文字（标题、层名、标签）都要换成浅色**，',
  '不能只换一半。',
  '',
  '5. **不要 emoji**。CSS 里不写注释、不写多余换行。',
  '',
  '骨架会被直接塞进生成提示词当示例，**它自己长什么样，以后每一页就长什么样**：',
  '画法要经得起复用，不要为参考图里的偶然内容做特例。',
].join('\n');

const ASK = [
  '这是一张竖版的设计稿合集，里面是若干份**架构图 / 逻辑框架图**的版式样例。',
  '请把里面的每一份都抽象成一份「架构排版」骨架。记住几件事：',
  '① **每一份都要重构成 1920×1080 的横版**，不要拉伸、不要原样竖排；',
  '② **配色一律走 CSS 变量**，一个 `#` / `rgb(` / `rgba(` 都不许有；',
  '③ **不要任何 `<img>` / `<svg>` / `<canvas>`**，连线与箭头用 CSS 画；',
  '④ **每个会被替换的块都要标 `data-lumen-arch-node`**，一份里至少两个；',
  '⑤ `group` 只能填 `layer` / `matrix` / `radial` / `flow` / `frame` 之一；',
  '⑥ 占位文字写**中文的架构词**（数据接入层 / 计算引擎 / 权限校验），不要写具体项目名。',
].join('\n');

/* ---------------- 校验 ---------------- */

const ARCH_GROUPS = ['layer', 'matrix', 'radial', 'flow', 'frame'] as const;

/** 把模型的一份草稿收成一份能用的骨架。不合规的返回问题清单 */
function accept(d: Draft, fallbackSlug: string): Skeleton | string[] {
  const issues: string[] = [];
  if (d.name.length === 0) issues.push('name 是空的');
  if (d.brief.length < 8) issues.push('brief 少于 8 个字');
  if (!(ARCH_GROUPS as readonly string[]).includes(d.group)) {
    issues.push(`group 只能是 layer/matrix/radial/flow/frame 之一，收到「${d.group}」`);
  }
  if (d.skeleton.length === 0) issues.push('skeleton 是空的');
  const { html, stripped } = stripFontFamily(d.skeleton);

  /*
    **`CJK_RE` 那条故意不查。** 另三个库都是「占位文案一律英文」，架构图反过来：
    占位就是中文的架构词（模块名、层名、流程标签），参考图与生成出来的真页面都是中文。
    这是本库与另外三版最要紧的一处分叉，见文件头注释。
  */
  if (/data-lumen-image/i.test(html)) {
    issues.push('架构图不占图位，不要写 data-lumen-image——这一页不配照片');
  }
  if (/<img|<svg|<canvas/i.test(html)) {
    issues.push('架构图里不要有 <img> / <svg> / <canvas>，图标与连线用 CSS 画');
  }
  const nodes = (html.match(/data-lumen-arch-node/gi) ?? []).length;
  if (nodes < 2) {
    issues.push(`标出的可替换块只有 ${nodes} 个，至少要 2 个：每个模块 / 层 / 节点都要写 data-lumen-arch-node`);
  }
  if (issues.length === 0) issues.push(...validateSkeleton('architecture-layouts', html));
  if (issues.length > 0) return issues;

  return {
    name: d.name,
    slug: d.slug || fallbackSlug,
    brief: d.brief,
    group: d.group,
    skeleton: html,
    // 架构图没有图位，这个数恒为 0；仍然从骨架里数出来，不采信模型自报
    slots: imageSlotNumbers(html).length,
    stripped,
  };
}

/* ---------------- 生成骨架文件 ---------------- */

/** 份数目标区间：低于下限说明有图没认出来，高于上限说明该回去精挑 */
const WANT_MIN = 15;
const WANT_MAX = 25;

function emit(all: Skeleton[]): void {
  const byGroup = new Map<string, Skeleton[]>();
  const usedIds = new Set<string>();
  const entries = dedupe(all).map((s) => {
    let slug = s.slug || 'layout';
    let n = 2;
    while (usedIds.has(slug)) slug = `${s.slug}-${n++}`;
    usedIds.add(slug);
    byGroup.set(s.group, [...(byGroup.get(s.group) ?? []), s]);
    return { ...s, id: `arch/${slug}@v1` };
  });

  /*
    空组**抛错**，与人物那版的 `solo`/`multi` 同款：候选池按组取，空组会让那一类结构
    整批拿不到候选（判到那一组的页会退回自由发挥），而报告上只显示「已写入 N 份」，看不出来。
  */
  for (const g of ARCH_GROUPS) {
    const n = byGroup.get(g)?.length ?? 0;
    if (n === 0) throw new Error(`「${g}」这一组一份都没有。候选池按组取，空组会让这一类结构整批拿不到候选`);
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

  const header = `import type { ArchitectureLayout } from './architecture-layouts.js';

/**
 * 架构页的版式骨架。**这是生成文件，不要手改**。
 *
 * 由 \`scripts/recognize-architecture-layouts.ts --emit\` 从参考图识别出来并写入。
 * 改版式要改识别提示词再重跑，手改会在下一次生成时被覆盖。
 *
 * 每份都是**自包含**的（\`<style>\` + 一个根 \`<div>\`），不共用任何底座——
 * 所以各份之间的字号与留白是各自照参考图定的，横向摆在一起不必一致。
 *
 * 约束（只用 CSS 变量取色与三个字体角色、**不占图位**、会被换成真实内容的块标
 * \`data-lumen-arch-node\`）见 \`architecture-layouts.ts\` 顶部的说明。共 ${entries.length} 份。
 */
export const ARCHITECTURE_SKELETONS: ArchitectureLayout[] = [
${body}
];
`;
  writeFileSync(SKELETONS_FILE, header, 'utf8');
  console.log(`\n已写入 ${path.relative(ROOT, SKELETONS_FILE)}：${entries.length} 份`);
  for (const g of ARCH_GROUPS) console.log(`  ${g}：${byGroup.get(g)?.length ?? 0} 份`);
  if (entries.length < WANT_MIN) {
    console.warn(`\n⚠ 只有 ${entries.length} 份（目标 ${WANT_MIN}–${WANT_MAX}）：可能有参考图没认出来，去看 report.json 里每张图出了几份`);
  } else if (entries.length > WANT_MAX) {
    console.warn(`\n⚠ ${entries.length} 份（目标 ${WANT_MIN}–${WANT_MAX}）：跑完看 report.json，把明显不贴参考的删掉再 emit`);
  }
}

/* ---------------- 跑 ---------------- */

await runRecognition({
  dir: DIR,
  cacheDir: CACHE_DIR,
  label: '架构排版',
  system: SYSTEM,
  ask: ASK,
  accept,
  emit,
});
