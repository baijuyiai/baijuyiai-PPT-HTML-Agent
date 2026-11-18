/**
 * 从一批参考图里**批量识别界面版式骨架**，并把结果生成为内置骨架库。
 *
 * ## 与图文 / 人物排版最大的不同：骨架里没有设备
 *
 * 那两个库，模型照参考图把版面写出来就行——照片由素材库填。界面排版不行：
 * 参考图里那台手机是**我们自己渲的**，让模型照参考图画一台出来只会是另一台
 * （比例、厚度、屏幕倾角全不对），而屏幕四角的坐标变换更是算出来的、画不出来。
 *
 * 所以这里分两步走：
 *
 * 1. 模型只写**版面**，在设备该在的位置留一个空框 `<div class="ui-dev-slot" data-device="phone" …>`；
 * 2. 生成骨架时把这个空框换成真设备——外壳转动图 + 屏幕 `matrix3d` + 悬停时序。
 *    这一步在 `scripts/lib/ui-device.ts`，与识别无关，重渲设备不用重花钱识别。
 *
 * **缓存里存的是带空框的那一版**，不是注入后的。设备重渲一次，所有骨架跟着更新。
 *
 * ## 跑法（仓库根目录）
 *
 * ```
 * node --import tsx scripts/recognize-ui-layouts.ts --limit 3     # 试点几张
 * node --import tsx scripts/recognize-ui-layouts.ts               # 全跑（缓存续跑）
 * node --import tsx scripts/recognize-ui-layouts.ts --emit        # 注入设备、生成骨架文件
 * ```
 *
 * ## 产物
 *
 * - `scripts/.cache/ui-layouts/<slug>-<hash>.json` —— 每张图的原始识别结果（**不进版本库**）
 * - `scripts/.cache/ui-layouts/report.json` —— 成功/失败/丢弃原因/花费
 * - `packages/ir-schema/src/ui-skeletons.ts` —— `--emit` 时写（**生成文件，不要手改**）
 */
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { validateSkeleton } from '../packages/server-core/src/services/studio-layout.service.ts';
import {
  CJK_RE, ROOT, asTemplate, arg, dedupe, flag, runRecognition, stripFontFamily,
  type Draft, type Skeleton,
} from './lib/recognize-layouts.ts';
import { DEVICE_OF_GROUP, injectDevices, slotsIn } from './lib/ui-device.ts';

const CACHE_DIR = path.join(ROOT, 'scripts/.cache/ui-layouts');
const SKELETONS_FILE = path.join(ROOT, 'packages/ir-schema/src/ui-skeletons.ts');
const DEFAULT_DIR = 'C:/Users/41945/Desktop/HTML-PPT/界面排版';

const DIR = arg('dir') ?? DEFAULT_DIR;

/* ---------------- 提示词 ---------------- */

/**
 * 骨架的硬约束那几条**必须逐条复述**，不能指望模型从「用变量」三个字里推出来：
 * 它默认就会写死十六进制色值、给 `<img>` 加 `object-fit`，而这两样恰好会被
 * `lintMockHtml` 判死、或在真渲染时被带 `!important` 的样式表压掉。
 */
const SYSTEM = [
  '你是资深演示文稿版面设计师。我给你一张**界面展示类**的设计稿：',
  '一台 3D 设备（手机 / 笔记本 / 显示器）摆在画面里，设备的屏幕里嵌着一张产品界面截图，',
  '旁边配着标题与说明文字。请把它抽象成一份可复用的 HTML 骨架。',
  '',
  '只输出 JSON，不要任何解释、不要 Markdown 围栏：',
  '{"layouts":[',
  '  {"name":"版式名（8 字以内，说清是什么排法，如「左文右机」）",',
  '   "slug":"kebab-case 的英文短名",',
  '   "brief":"一句话说清它长什么样、适合放什么内容（不少于 8 个字）",',
  '   "group":"phone 或 laptop 或 display",',
  '   "skeleton":"骨架 HTML"}',
  ']}',
  '',
  '## 一张图通常就是一份版式',
  '参考图是**一个完整的页面构图**，所以通常只列一条。',
  '只有当图里明显并排摆着好几份互不相同的完整构图时，才列多条；',
  '不要图里有什么小部件就列一条。',
  '',
  '## 参考图什么比例都有，而演示页是固定的 1920×1080 横版',
  '请**重新构图**，不要拉伸、不要照抄参考图自己的画布比例：',
  '- 竖着堆的元素改成**左右分栏**或**横向并列**；上下关系可以改成左右关系，',
  '  但**信息层级、疏密节奏、哪块大哪块小要保住**；',
  '- 设备**占画面的比例**照参考图来：这类设计稿里设备通常占掉一半以上、甚至顶到边，',
  '  不要因为换了画布比例就把它缩成角落里的一小块。',
  '',
  '## 设备的**位置**与**台数**必须照参考图',
  '这两条最容易被忽略，也最影响「像不像」：',
  '- **参考图里设备在左边就放左边、在右边就放右边、居中就居中。**',
  '  不要一律摆到右边——那样每一份版式看起来都是同一个排法，参考图之间的差别就全丢了。',
  '- **参考图里有几台设备就放几个空框。** 两台手机就两个 `ui-dev-slot`，三台就三个；',
  '  一台笔记本配一台手机就是两个框（一台 `laptop` + 一台 `phone`）。',
  '  参考图里那几台设备之间怎么错落、谁压着谁、谁大谁小，也照做。',
  '- 同理，**文字块在参考图的哪一侧、是压在设备上还是避开设备**，也照参考图来。',
  '',
  '## 设备不要画，留一个空框（这是这份骨架最要紧的一条）',
  '设备是我们在构建期用 three.js 渲出来的图。你照参考图画一台出来只会是另一台——',
  '比例、厚度、屏幕倾角全不对，而且屏幕里那张界面还要靠算出来的坐标贴上去。',
  '所以**位置与大小由你定，机身本身由我们填**。',
  '',
  '在设备该在的地方留一个空框，**就这一行，里面什么都不要放**：',
  '<div class="ui-dev-slot" data-device="phone" style="position:absolute;left:120px;top:60px;width:560px;height:960px"></div>',
  '',
  '- `data-device` 按参考图里那台设备来：`phone`（手机）/ `laptop`（笔记本）/ `display`（显示器）。',
  '  同时把 JSON 里的 `group` 写成同一个值。',
  '- 样式里**必须有 `position:absolute`，以及写死 px 的 `width` 和 `height`**，',
  '  位置用 `left` / `top` / `right` / `bottom` 定。少了尺寸这一份就用不了。',
  '- **框的长宽比要接近那台设备**，不然设备会在框里留白（设备是等比缩放塞进框、居中的）：',
  '  `phone` 宽高比约 1:2（如 560×960）；`laptop` 约 1.6:1（如 900×570）；`display` 约 1.45:1（如 900×620）。',
  '  框比设备略大一点没关系。',
  '- 框里**不要背景色、不要边框、不要圆角，也不要 `overflow:hidden`**：',
  '  设备自己带机身，加了框会从机身后面透出来；`overflow:hidden` 会把设备转出去的那部分切掉。',
  '- 参考图里设备是斜的（3/4 角、带旋转）。**你不要去写任何旋转**：我们渲好的设备正面朝前，',
  '  鼠标滑上去自己会转。按**正面朝前**来构图。',
  '',
  '## 这类版式一半的观感在**背景**上，不能省',
  '参考图之所以好看，很大一部分不在设备上。下面这几样**必须在骨架里做出来**：',
  '',
  '**① 毛玻璃（半透明 + 模糊）。** 参考图里大量出现压在设备上或旁边的半透明胶囊、',
  '小面板、标签——它们底下透出背景和设备的颜色，边缘发虚。写法：',
  '```css',
  '.chip{background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border-radius:999px;border:1px solid color-mix(in srgb,var(--border) 70%,transparent)}',
  '```',
  '- **必须带 `backdrop-filter:blur(...)`**。只写半透明背景会变成一块灰扑扑的色块，',
  '  完全不是毛玻璃——这是最容易漏的一条。',
  '- 背景色用 `color-mix(...)` 配 `transparent` 调透明度，**不要写 `rgba(255,255,255,.6)`**',
  '  （写死色值会被判不合规）。',
  '- 这类胶囊常用来放导航项（About / Branding / Dashboard 那种一排）、',
  '  悬浮标签（指着设备说「Smart living」那种）、或者底部一条压边的信息带。',
  '',
  '**② 压在设备后面的大字。** 参考图里常有一个巨大的词标（品牌名或标题的一两个词）',
  '横在画面里，设备压在它上面，字被挡住一截、或者用了很低的对比度。',
  '这是这类版式最出效果的一招，**照做**：一个 `font-size` 150–260px 的大字，',
  '颜色用 `var(--text)` 配 `opacity:.10` 到 `.22`，`z-index` 压在设备下面。',
  '',
  '**③ 光晕。** 用 `radial-gradient` 配 `var(--accent)` 与 `transparent` 做几团，',
  '`opacity` 在 `.12`–`.25`，铺在设备背后。参考图里那层「设备在发光」的感觉就是它。',
  '',
  '**④ 底部那条模糊带。** 有的参考图底部压着一条通栏的模糊区域（渐变或毛玻璃），',
  '上面放说明文字。有就照做：`linear-gradient` 从 `transparent` 到 `var(--bg)`，',
  '或者 `backdrop-filter:blur(...)` 的一条通栏。',
  '',
  '## 除了设备，页面上别的地方不许出现图片',
  '**一个 `<img>` 都不要写。** 界面页只配一张图，就是设备屏幕里那张。',
  '参考图里的 logo、勾选图标、小方块图标这类，用 CSS 画（小方块、边框、圆点、字符）',
  '或者干脆不画——**绝对不要用 `<img>`**。',
  '',
  '## 骨架的硬约束（违反了这份骨架就用不了）',
  '1. **配色一律走 CSS 变量**，一个十六进制色值都不许写，也不要用 `white`/`black` 这类具名颜色。',
  '   **整个 `<style>` 里一个 `#` 都不许出现，也不要用 `rgb(` / `hsl(`。**',
  '   能用的变量只有：`var(--bg)` `var(--surface)` `var(--text)` `var(--muted)` `var(--accent)` `var(--brand)` `var(--border)`。',
  '   **这七个变量由系统注入，不要自己写 `:root` 去定义它们**（值对不上会被判不合规），',
  '   也不要在 `<style>` 里定义任何别的颜色变量。直接用 `var(--accent)` 这样取，',
  '   深浅变化用 `opacity`。',
  '2. 只用 `<div>` `<style>` `<span>` `<p>` `<h1>` `<h2>` `<h3>` `<ul>` `<li>` 这些静态标签。',
  '   **不要 `<script>`、不要 `<a>`、不要 `<img>`、不要外链字体、不要内联 `on*`。**',
  '3. 根 `<div>` 上写死 `width:1920px;height:1080px`、`position:relative`，',
  '   内部一律绝对定位或 flex。**不要 `position:fixed`、不要 `vh` 单位。**',
  '',
  '## 占位文案一律用英文',
  '骨架里的文字是**示例**，生成真页面时会被换掉。但它读起来像什么，模型以后就照着写什么——',
  '写「产品功能介绍」这种 PPT 腔，出来的每一页都是 PPT 腔。所以照参考图的语气写：',
  '- **大标题**：短、有态度，像产品发布页。如「NFT WEBSITE UI KIT」「DESIGN SYSTEM」「SHIP FASTER」。',
  '  **不要「PRODUCT INTRODUCTION」「FEATURE OVERVIEW」这类。**',
  '- **小字 kicker**：一行栏目 / 品牌 / 版本，全大写。如「V2.4 / DESIGN SYSTEM」「30+ SCREENS」。',
  '- **说明短句**：15–30 个英文词，写**具体的功能点**。',
  '  写「Drag a component onto the canvas and it snaps to the grid」，不要「Powerful and easy to use」。',
  '- **标签 / 要点**：短句，如「Fully Customizable」「Dark Mode」。',
  '',
  '**大标题与说明短句必须全英文，一个汉字都不要出现。**',
  '其余占位文案也一律英文——整页就是整页英文，不要中英混排。',
  '（用户自己的内容当然可以是中文，那是生成真页面时替换进来的，与骨架无关。）',
  '',
  '## 字体：只许写 `var(--font-*)`，一个具体字体名都不许写',
  '页面渲染时会注入**三个字体角色**，骨架里要挑字体只能挑这三个：',
  '- `var(--font-sans)`——正文、要点、说明。**默认就是它，不写也行。**',
  '- `var(--font-display)`——大标题、需要衬线/宋体的展示字。',
  '- `var(--font-script)`——签名、引言、装饰性小字这类**手写体**。**一份骨架最多用一处。**',
  '',
  '**绝对不要写 `font-family:Georgia,serif` 这种具体的字体栈**，',
  '**根 `<div>` 的内联样式里也不许写**。内联样式压得过注入的规则，写了会把这套风格的字体',
  '整条盖掉，而且换风格它不跟着变。',
  '',
  '**字形的轻重缓急靠下面这几样做出来，不是靠换字体**：',
  '- **字重要有对比**：同一页里既要有 800/900 的巨字，也要有 300/400 的小字。**不要通篇 700。**',
  '- **字距跟着字号走**：小标签用 `letter-spacing:.3em` 以上的宽字距；',
  '  巨字用负字距（`-.02em` 到 `-.04em`）把字咬紧。',
  '- **拉丁标签一律大写**：`text-transform:uppercase` 配宽字距，是最省事的「设计感」。',
  '- **字号要拉开**：一页里最大与最小至少差 8 倍（如标题 140px 对注释 17px）。',
  '- **行高跟着字号走**：巨字收到 0.92–1.0，正文 1.5–1.7。',
  '',
  '4. **参考图里那种背景光晕、渐隐、斜切色块要保住**——它们是这类版式一半的观感。',
  '   用 `radial-gradient` / `linear-gradient` 配 `var(--accent)` 加 `transparent` 做，',
  '   **不要写死色值**（`transparent` 可以用）。',
  '5. **不要 emoji**。CSS 里不写注释、不写多余换行。',
  '',
  '骨架会被直接塞进生成提示词当示例，**它自己长什么样，以后每一页就长什么样**：',
  '排版要经得起复用，不要为这一页的偶然内容做特例。',
].join('\n');

const ASK = [
  '这是一张界面展示类的设计稿，请把它抽象成一份「界面排版」骨架。',
  '记住这几件事：',
  '① **重构成 1920×1080 的横版**；',
  '② 设备**不要画**，只留 `<div class="ui-dev-slot" data-device="…" style="position:absolute;…;width:…px;height:…px"></div>` 空框；',
  '③ 设备的**左右位置**与**台数**照参考图来，不要一律摆到右边、也不要把两台并成一台；',
  '④ 参考图里的**毛玻璃胶囊/面板**（`backdrop-filter:blur(...)`）、压在设备后面的**大字**、**光晕**都要做出来；',
  '⑤ 除了那些空框，**页面上一个 `<img>` 都不许有**。',
].join('\n');

/* ---------------- 校验 ---------------- */

/**
 * 骨架**内容**上的那几条硬规矩。`accept` 与 `emit` 都要过这一关。
 *
 * ## 为什么 emit 也要查一遍
 *
 * `--emit` 是直接从缓存读骨架的，**不会再走 accept**。所以缓存里存着的是
 * 「当时那套规则下收进来的」——规则后来收紧了，存量那几份照样会被写进生成文件。
 * 实测就是这样：加了「不许自绘设备」这条之后，缓存里还留着四份自绘了 `.ui-shell` /
 * `.ui-stage` 的骨架，`--emit` 一声不响地把它们写了出去。
 *
 * 所以规则抽在这里，两边共用；`emit` 发现不合规就**抛错**，逼着重跑识别，
 * 而不是跳过——跳过会让库里凭空少几份版式，而报告上只显示「已写入 N 份」。
 */
function contentIssues(html: string): string[] {
  const issues: string[] = [];
  if (CJK_RE.test(html)) issues.push('占位文案里出现了汉字，必须全部改成英文（大标题、说明短句一个都不能留）');

  /*
    **模型会「顺手帮忙」把设备画出来。** 实测有两份骨架自己写了
    `.ui-shell{background-image:url(/stock/devices/phone.png)}`——路径是它猜的，
    取不到图，而它又盖在真设备上面，页面上是**一台空白设备挡住另一台**。
    提示词里说了不要画，但说了不等于不会做，所以这里堵死。
  */
  if (/\/stock\//i.test(html)) {
    issues.push('骨架里出现了 `/stock/…` 路径。设备的机身图由我们注入，你不要自己写 `url(…)`');
  }
  /*
    这几个类名是注入设备时用的。模型自己写一份 `.ui-shell` 就会盖在真设备上面。
    `ui-dev-slot` 要放行——那是它**该**写的空框。
  */
  if (/\bui-(dev(?!-slot)|stage|screen|shell)\b/i.test(html)) {
    issues.push('骨架里出现了 `ui-dev` / `ui-stage` / `ui-screen` / `ui-shell` 这些类名——'
      + '那是我们注入设备时用的，设备不要自己画，只留 `ui-dev-slot` 那个空框');
  }
  return issues;
}

/** 把模型的一份草稿收成一份能用的骨架。不合规的返回问题清单 */
function accept(d: Draft, fallbackSlug: string): Skeleton | string[] {
  const issues: string[] = [];
  if (d.name.length === 0) issues.push('name 是空的');
  if (d.brief.length < 8) issues.push('brief 少于 8 个字');
  if (d.skeleton.length === 0) issues.push('skeleton 是空的');
  const { html, stripped } = stripFontFamily(d.skeleton);

  issues.push(...contentIssues(html));

  const slots = slotsIn(html);
  if (slots.length === 0) {
    issues.push('没有设备空框。设备**不要自己画**，只在它该在的位置留一行：'
      + '<div class="ui-dev-slot" data-device="phone" style="position:absolute;left:…px;top:…px;width:…px;height:…px"></div>');
  }
  for (const [i, s] of slots.entries()) {
    const at = `第 ${i + 1} 个设备空框`;
    if (!DEVICE_OF_GROUP[s.device]) {
      issues.push(`${at} 的 data-device 只能是 phone / laptop / display，收到「${s.device || '空'}」`);
      continue;
    }
    if (!/position\s*:\s*absolute/i.test(s.style)) issues.push(`${at} 的样式里要写 position:absolute`);
    if (!/(?:^|;)\s*width\s*:\s*[\d.]+px/i.test(s.style) || !/(?:^|;)\s*height\s*:\s*[\d.]+px/i.test(s.style)) {
      issues.push(`${at} 的样式里要写死 width 与 height（px）——设备按它缩放，没尺寸就塞不进去`);
    }
    if (/overflow\s*:\s*hidden/i.test(s.style)) {
      issues.push(`${at} 不要写 overflow:hidden——设备悬停时会转出去，会被切掉`);
    }
  }

  if (issues.length === 0) {
    try {
      // 结构校验跑在**注入之后**：`checkLayoutSkeleton` 查的是「转动图在不在、矩阵在不在」，
      // 而那两样正是注入加进去的。跑在注入前的话，每一份都会被判缺图缺矩阵
      const { html: injected } = injectDevices(html);
      issues.push(...validateSkeleton('ui-layouts', injected));
    } catch (e) {
      issues.push(`注入设备时出错：${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (issues.length > 0) return issues;

  return {
    name: d.name,
    slug: d.slug || fallbackSlug,
    brief: d.brief,
    // **分组以空框为准，不采信模型自报的 group**：真正渲出来的是空框里那台设备
    group: slots[0]!.device,
    skeleton: html,
    slots: slots.length,
    stripped,
  };
}

/* ---------------- 生成骨架文件 ---------------- */

function emit(all: Skeleton[]): void {
  /*
    **写文件之前先按当前规则复查一遍缓存。** 缓存是「当时那套规则下收进来的」，
    规则收紧之后 `--emit` 不会再走 accept，于是存量那几份会被原样写出去。
    实测踩过：加了「不许自绘设备」这条之后，缓存里还留着四份自绘了 `.ui-shell` 的骨架。
  */
  const stale = all
    .map((s) => ({ s, issues: contentIssues(s.skeleton) }))
    .filter((x) => x.issues.length > 0);
  if (stale.length > 0) {
    throw new Error(
      `缓存里有 ${stale.length} 份骨架不合规（多半是校验规则收紧后没重跑）：\n`
      + stale.map((x) => `  ${x.s.slug}「${x.s.name}」：${x.issues.join('；')}`).join('\n')
      + '\n\n按缓存文件名里的图号用 --only <片段> --fresh 重跑那几张，再 emit。',
    );
  }

  const usedIds = new Set<string>();
  const entries = dedupe(all).map((s) => {
    let slug = s.slug || 'layout';
    let n = 2;
    while (usedIds.has(slug)) slug = `${s.slug}-${n++}`;
    usedIds.add(slug);
    const { html, devices } = injectDevices(s.skeleton);
    return {
      id: `ui/${slug}@v1`,
      name: s.name,
      brief: s.brief,
      group: devices[0]?.group ?? s.group,
      scene: devices[0]?.scene ?? 'iphone',
      skeleton: html,
    };
  });

  /*
    **三组都得有货。** `uiLayoutCandidates` 按设备挑候选，某一组为空时那一类界面页
    就一个候选都拿不到——而候选块为空时提示词里那段会被整个抽掉，
    表现是「界面页生成出来不像界面页」，没有任何报错。
  */
  for (const g of Object.keys(DEVICE_OF_GROUP)) {
    const n = entries.filter((e) => e.group === g).length;
    if (n === 0) console.warn(`警告：「${g}」这一组一份骨架都没有，那一类界面页将拿不到候选`);
    else console.log(`  ${g}：${n} 份`);
  }

  const body = entries.map((e) => [
    '  {',
    `    id: ${JSON.stringify(e.id)},`,
    `    name: ${JSON.stringify(e.name)},`,
    `    group: ${JSON.stringify(e.group)},`,
    `    scene: ${JSON.stringify(e.scene)},`,
    `    brief: ${JSON.stringify(e.brief)},`,
    `    skeleton: \`${asTemplate(e.skeleton)}\`,`,
    '  },',
  ].join('\n')).join('\n');

  const header = `import type { UiLayout } from './ui-layouts.js';

/**
 * 界面页的版式骨架。**这是生成文件，不要手改**。
 *
 * 由 \`scripts/recognize-ui-layouts.ts --emit\` 从参考图识别出来并写入：
 * 版面是模型照参考图认的，设备那一块是生成时注入的（\`scripts/lib/ui-device.ts\`）。
 * 改版面要改识别提示词再重跑，改设备要重跑渲染再 emit——**手改会在下一次被覆盖**。
 *
 * 每份骨架里嵌着**算出来的**三样东西：外壳转动图路径、屏幕四角的 \`matrix3d\`、
 * 悬停时的步进时序。手抄的话，改了取景或姿态角就会留下一份悄悄过期的副本——
 * 症状是「设备转了、屏幕没跟着转」，看着像 CSS 写错了。
 *
 * 约束（只用 CSS 变量取色、三个字体角色、**不许有别的 \`<img>\`**）见 \`ui-layouts.ts\` 顶部。
 * 共 ${entries.length} 份。
 */
export const UI_SKELETONS: UiLayout[] = [
${body}
];
`;
  writeFileSync(SKELETONS_FILE, header, 'utf8');
  console.log(`\n已写入 ${path.relative(ROOT, SKELETONS_FILE)}：${entries.length} 份`);
}

/* ---------------- 跑 ---------------- */

await runRecognition({
  dir: DIR,
  cacheDir: CACHE_DIR,
  label: '界面排版',
  system: SYSTEM,
  ask: ASK,
  accept,
  emit,
});
