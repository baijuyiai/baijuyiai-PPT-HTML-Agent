import {
  CHART_KIND_LABEL,
  CHART_KINDS,
  CHART_SLOT_ATTR,
  CHART_SLOT_RE,
  IMAGE_SLOT_ATTR,
  PAGE_TYPE_BRIEF,
  PAGE_TYPE_LABEL,
  PAGE_TYPE_ORDER,
  PROMPT_SECTIONS,
  parseChartSlot,
  parseChartSlotSize,
  specBlock,
  type FontStacks,
  type PageType,
  type StylePalette,
  type StyleSpec,
} from '@lumen/ir-schema';
import { lintMockHtml } from '@lumen/render-engine';
import { normalizeCropBox, type CropBox } from '@lumen/style-engine/server';
import { isMockPlaceholder, type ProviderGateway } from '@lumen/provider-gateway';
import { logger } from '../lib/logger.js';
import { parseModelJson, stripFences, stripHtmlReply } from '../lib/model-reply.js';

/**
 * 与模型交互的四个原语：分页、写提示词、出样机、推导缺失的页类型。
 *
 * 抽出来是因为几条链路都要用：全量识别（`recognize-doc.service`）与单页重识别
 * （`redraw-page.service`）各取所需——前三条两边都用，`derivePrompts` 眼下只有
 * 全量识别在用。它们在这里只做「调模型、收拾返回值」这一件事，不含任何业务流程——
 * 谁调用、结果怎么用，都由调用方决定。
 *
 * 四条各自的行事方式**并不统一**，读之前先看清，别照着某一条去改另一条：
 *
 * - `splitSlides`：模型一个框都给不出时兜底成「整张图当一页」，不抛。
 *   兜底的那一页带 `fallback: true`，调用方可据此**如实告知用户**「没能找出幻灯片，
 *   已按整张图处理」——不标出来的话，用户分不清「模型真找到了这一页」与
 *   「模型什么都没找到」，而这两种情况在界面上长得一模一样。
 *   但网关本身报错（网络、限流）会原样抛出去，由调用方决定是跳过还是整批失败。
 * - `writePagePrompt`：模型没写出东西就**抛**。没有提示词就没有可交付的东西，
 *   这里没有合理的兜底，由调用方转成它能表达的失败（SSE 的 error 事件）。
 * - `generateMock`：lint 不过时**内部自己再调一次**（所以调用次数不保证是 1），
 *   仍不过就带着 issues 返回。与 `splitSlides` 一样，网关本身报错会原样抛出去；
 *   **降级到内置 Mock 拿回一段占位说明文字时也抛**——那不是样机（见函数内的注释）。
 * - `derivePrompts`：模型漏写的页类型**兜底成模板**，不抛（和 `splitSlides` 一路），
 *   但它比前三条多几层自己的讲究：
 *   - **按三条一批**发出去，不是一次要全部。一次要八条完整提示词，正文三千多字，
 *     模型会把 token 全花在思考上、正文一个字不出——实测踩过，八条全部退化成
 *     兜底模板，等于这一步白做。
 *   - **返回的条数与请求的页类型一一对应**：某批没拿到、或拿到的结构不合规，
 *     最后都用 `fallbackPrompt` 补齐，绝不缺项——缺项就是那个页类型在库里是空的。
 *   - **收下一条要同时满足两个条件**：页类型必须在这一批里（模型偶尔答非所问、
 *     多吐别的页类型），且四个小节（`PROMPT_SECTIONS`）一个都不能少。
 *   网关本身报错同样原样抛出去；但**某一条**不合规只是被丢掉、由兜底补上，
 *   不会让整批失败。
 *
 * 别处的近亲实现**有意不同，不要顺手统一**：`design-vision.service.ts` 自己那份
 * `splitSlides` 走像素兜底、预算与温度都不同；`generate-html.service.ts` 的
 * `paletteBlockOf` 用途相同但少一层说明。合并它们会改行为。
 */

/* ---------------- 提示词 ---------------- */

/**
 * 提示词里给模型看的图表种类清单。
 *
 * **从 `CHART_KINDS` 生成，不手写一份**：手写的话往版式库里加一种图就会忘了同步，
 * 表现是「新图永远选不到」——而且不报错，模型只是照旧从旧清单里挑。
 *
 * ## 为什么非列出来不可
 *
 * 原先三处提示词（写提示词、推导、出样机）都只给了 JSON 的**形状**
 * （`{"kind":"bar",…}`），没给 `kind` 的**取值**。实测九套风格的图表页重出样机，
 * 三套重试之后仍然是 `图表数据不合规：kind Required`——模型不知道有哪些值可写，
 * 换了一次写法还是缺这个字段。清单明写出来，模型才有得挑。
 */
const CHART_KIND_LINES = CHART_KINDS.map((k) => `${k}（${CHART_KIND_LABEL[k]}）`).join('、');

/**
 * 让模型为「这一页」写一条 HTML 生成提示词。
 *
 * 四个小节的名字与顺序必须原样保留——下游是把这条提示词**原样**发给模型的，
 * 少了「代码要求」，生成出来的 HTML 就不会用 `:root` 变量，换主题时整套散架。
 */
const WRITE_SYSTEM = [
  '你是资深视觉设计总监。我会给你一页演示文稿的设计稿。',
  '你要做的是**为这一页写一条「HTML 生成提示词」**——这条提示词将来会被原样发给一个前端模型，让它照着生成这一页的 HTML。',
  '',
  '输出必须严格是下面这个结构（中文），四个小标题一个都不能少、顺序不能变、名称不能改：',
  '',
  '角色：你是一个资深的前端工程师和视觉设计师，精通现代 CSS 排版和……（说清这套风格的美学取向）',
  '任务：请帮我用单文件（HTML + 内联 CSS）写一个……的模板。',
  '视觉与排版要求：',
  '1. 背景：……',
  '2. 主视觉：……',
  '3. ……',
  '代码要求（非常重要）：',
  '1. 在 :root 中定义 CSS 变量（列出具体变量名与建议取值）……',
  '2. ……',
  '',
  '硬性要求：',
  '- 「视觉与排版要求」要**具体到这一页**：底色是什么、分成几个区域、每块放什么、对齐方式、',
  '  字号层级关系、有没有分栏/交叠/穿透元素、留白比例。不要写「简洁大方」「高级感」这类形容词。',
  /**
   * **字号要写下限，而且不能小。**
   *
   * 实测 12 套风格里有 8 套的最小字号落在 12~16px——画布是 1920×1080，
   * 15px 只占宽度的 0.78%，投到屏幕上正文和页码根本看不清。用户报的是
   * 「最小的字号有点太小了，很多还是正文部分」。
   *
   * 根因是模型**从参考图估字号估不准**：一张缩略图上看不出「这是 15px 还是 24px」，
   * 于是普遍往小了写。光靠它自觉没用，得把下限写死。
   */
  '- **字号必须给具体数值，而且正文不小于 22px、页眉/页码/脚注不小于 18px。**',
  '  画布是 1920×1080：15px 只占宽度的 0.78%，投到屏幕或投影上正文就是看不清。',
  '  参考图是缩略图，照着它估出来的字号会系统性偏小——按上面的下限写，不要照抄观感。',
  '- **主视觉必须写出来，这是这一页设计感的主要来源。** 先看清参考图上「除文字以外还有什么」，',
  '  再按它的实际形态选一种实现方式，两种都要写清位置、尺寸、与文字的层叠关系：',
  '  1) 参考图里是**照片、插画、3D 渲染、产品图**这类具象画面 —— 写成图片位（见下面图片位的写法），',
  '     并说明它在版式里占哪一块、多大、有没有遮罩/裁切/圆角/叠加色。',
  '  2) 参考图里是**几何构成、渐变球体、线条网格、色块拼贴、发光粒子、纹理**这类抽象图形 ——',
  '     **用 CSS/SVG 画出来**，写清形状、位置、尺寸、颜色、透明度、模糊半径、旋转角度。',
  '  封面、封底、转折页几乎一定有一块主视觉（常见的是右侧或背景一大块画面）。',
  '  **只有参考图确实通篇是文字、连一块图形都没有时，才可以不写主视觉**——不要因为偷懒而省掉它。',
  '- **把这一页用到的视觉效果逐条写清楚**，尤其是下面四类——它们是这套风格的辨识度所在，',
  '  同样的底色同样的字号，加了毛玻璃和没加完全是两套东西：',
  '  ① 渐变——线性/径向/锥形，从哪个色到哪个色、什么角度、用在哪（底色、卡片、按钮、文字）；',
  '  ② 毛玻璃——`backdrop-filter: blur(...)` 的半径、半透明底的透明度、有没有 1px 亮边；',
  '  ③ 发光——`box-shadow` / `text-shadow` 的光晕颜色、模糊半径、有没有扩散；',
  '  ④ 霓虹——亮色描边加外发光（通常在暗底上），描边宽度与光晕颜色。',
  '  写清**用在哪、参数多少**。只写「有渐变」「有发光」等于没写：将来要照着这条提示词',
  '  重建这一页，缺了参数就重建不出来。参考图里没有的效果不要编。',
  '- 「代码要求」必须包含：在 :root 定义 CSS 变量（给出变量名与取值）、用 Flexbox 或 absolute',
  '  定位的具体做法、响应式的处理、不使用任何外部字体库（只用系统无衬线字体栈）。',
  '- 「视觉与排版要求」里要交代**文字与底色的关系**：深色底配浅色字、浅色底配深色字。',
  '  **整页底色也算一层**：整页铺的不是 `--bg` 而是品牌深色时，要写明「整页所有文字改用浅色」；',
  '  有深色卡片/色块时，写明它上面的文字用哪个色——不写的话模型会沿用整页正文色，在深底上就看不清了。',
  '- 页面是**固定 1920×1080 的单屏画布**，不许出现滚动条。不要用 `position: fixed`，',
  '  不要用 `vh` 单位（画布会被整体缩放，vh 在缩放后不等于画布高度）。',
  '- 提示词里**不要写具体文案**（标题写什么、要点写什么，生成时会另外给），只描述版式与视觉。',
  `- 图片位写成 <img ${IMAGE_SLOT_ATTR}="1">（第二张是 "2"，依次往后），**不要写 src**——`,
  '  这样这条提示词换一套图还能用。没有图片位的版面就不用写 img（用 CSS/SVG 画的主视觉不算图片位）。',
  `- **人像位**（团队、讲者、人物风采）写成 <img ${IMAGE_SLOT_ATTR}="1" data-lumen-cutout="1">，`,
  '  编号与普通图片位共用同一个序列。系统会往这一格放人物抠图，按 contain 摆放不裁切——',
  '  所以人像位要留竖向的空间，并让人物脚下落在同一条基线上。',
  /**
   * **把「必须写出来」说死**。只描述「这一页有配图」是不够的：
   * 实测识别出来的提示词写的是「一到三位人物的透明底抠图」这种散文，
   * 一个属性名都没有——照着它出的样机自然一个槽都没有。
   */
  `  **人物页、图文页、图片排版页的提示词里必须把这个写法原样写进去**（<img ${IMAGE_SLOT_ATTR}="1"> 或带 cutout 的那种），`,
  '  不能只写「配一张照片」「放一张人物抠图」这种散文——照着那种提示词出图时，',
  '  模型会自己画一个色块顶上，看着像有图，实际换不了内容。',
  `- **图表位**写成 <div ${CHART_SLOT_ATTR}="宽x高">{…JSON…}</div>：属性值是这个区域的实际`,
  '  像素尺寸（要与样式里的 width/height 一致），里面只放一段数据 JSON，形如',
  '  `{"kind":"bar","categories":["A","B"],"series":[{"name":"系列","values":[12,18]}]}`。',
  `  JSON 的**第一个字段固定叫 \`kind\`**（不是 \`type\`、不是 \`chartType\`），值只能从这些里挑一个：${CHART_KIND_LINES}。`,
  '  `series` 是**对象数组**，每项有 `name` 与 `values`，不是一串名字。',
  '  **不要用 CSS 或 SVG 自己画图表**，也不要往 JSON 里写颜色——出图与配色都由渲染层负责。',
  '- 提示词要能**脱离这张图独立使用**：不能出现「如图所示」「左上方那张图」「本参考图」这类指代。',
  '- 直接输出提示词本身，不要加任何前言、解释或 Markdown 代码围栏。',
].join('\n');

/** 用提示词生成样机 HTML */
const MOCK_SYSTEM = [
  '你是前端工程师。严格照着用户给的提示词写这一页的 HTML。',
  '只输出可直接运行的 HTML 片段（一个 <style> 加若干 <div>），',
  '不要任何解释，不要 Markdown 代码围栏，不要 <html>/<body> 骨架。',
  // 模型很爱加一段画布适配脚本，而这段 HTML 会被放进不开脚本的容器里，写了也不执行，
  // 只会让样机被 lint 打回重试一次。明说比事后剥干净。
  '**不要写 <script>**：画布缩放由外层容器负责，页面里不需要任何脚本。',
  '',
  /**
   * **根元素就是整页，不要画板套画板。**
   *
   * 实测踩过：模型爱在外面套一层「画板」（`--artboard-w:1740px` 之类）再加一层
   * 画布外底色（`--page-outer`），于是成品四周一圈白边、或者整页只占画布的四分之一。
   * 容器本身就是 1920×1080，页面再缩一次就是双重缩放。
   */
  '**根元素就是一个 1920×1080 的 div，铺满整页**：不要在外面再套画板或缩放容器，',
  '也不要画布外底色——容器本身就是画布，你写的东西直接铺满它。',
  '',
  /**
   * 槽属性是渲染层的抓手，模型改写时容易顺手丢掉。丢了的表现是「这一格没有图」，
   * 或者人物页的人像变成矢量画的小人——页面看着是完整的，不专门说一句很容易漏过去。
   */
  '提示词里写了 `data-lumen-*` 属性的元素（图片位、人像位、图表槽），**属性必须原样保留**：',
  '那几格由渲染层填内容，不要自己画图形、也不要删掉属性。',
  '',
  /**
   * **正面的要求也要说一遍**，不能只说「保留」。
   *
   * 「保留」的前提是提示词里已经写了槽；而实测四套风格的提示词都只写了散文
   * （「配一张人物照片」「透明底抠图」），没写属性——模型于是自己画了个色块顶上，
   * 页面看着是完整的，渲染层却一格都填不上。用户报的「没图 / 没人物」全是这么来的。
   */
  `**需要图片的页面必须自己把槽写出来**：图片位 \`<img ${IMAGE_SLOT_ATTR}="1">\`（第二张 "2"，依次往后），`,
  `人像位 \`<img ${IMAGE_SLOT_ATTR}="1" data-lumen-cutout="1">\`——**都不要写 src**。`,
  '人物页必须有人像位；图文页、图片排版页必须有图片位。**不要用 CSS 或 SVG 自己画照片、画人**，',
  '画得再像也只是一张画死的图，渲染层换不了内容。',
  '',
  /**
   * 图表槽那一段 JSON 是**在这一步真写出来的**（提示词只描述「要有一个槽」），
   * 所以 `kind` 的取值必须在这里也说一遍。
   *
   * 原先只说「属性必须原样保留」，没说槽里该放什么。实测九套风格重出图表页样机，
   * 三套反复重试仍是 `kind Required`——模型照着提示词把槽的 div 写出来了，
   * 里面的 JSON 却是自己编的形状。**这一步才是落笔的那一步**，缺什么就在这里补什么。
   */
  `图表槽里的 JSON 必须**严格 JSON**（键与字符串都用双引号、不能有尾逗号），`,
  /**
   * 字段名要**明着否定一次**。
   *
   * 实测九套风格重出图表页样机，六套卡在 `kind Required`，六套无一例外写的是
   * `"type":"bar"` / `"type":"line"`——`type` 是 ECharts、Chart.js 里的叫法，
   * 模型的手比提示词快。只给正面示例（`{"kind":"bar",…}`）挡不住它，
   * 得把「不是 `type`」写出来。
   *
   * 同一批里还有三套**自创种类**（`gantt`、`combo`、`bar-line-combo`），
   * 所以取值清单也得摆在这儿——这是真正落笔写 JSON 的那一步。
   */
  `**第一个字段固定叫 \`kind\`**——写成 \`type\` 或 \`chartType\` 一律作废。\`kind\` 只能从这些里挑一个：${CHART_KIND_LINES}。`,
  /**
   * **给整行骨架，不只给 JSON**。
   *
   * 只写 JSON 长什么样，模型会把 JSON 塞进属性值里
   * （`data-lumen-chart="{"kind":…}"`，引号在 `{` 处就断了）——
   * 「重工蓝白工业风」就是这么连着两次不合格的。把 `<div …>…</div>` 整行摆出来，
   * 「引号里是尺寸、JSON 在里面」这件事才落得下来。
   */
  '整行照这个骨架写，**属性引号里只放尺寸，JSON 放在标签里面**：',
  '`<div data-lumen-chart="1180x560">{"kind":"bar","categories":["A","B"],"series":[{"name":"系列","values":[12,18]}]}</div>`',
  '`categories` 与每条的 `values` 长度要对齐，`series` 是**对象数组**而不是一串名字。',
  '**不要在 JSON 里写颜色**（没有 `colors` 字段），配色由渲染层负责。',
  '',
  /*
    **样机上的文字要写成方向性占位，不能写成有真实感的内容。**

    样机有两处用途，两处都不该带具体内容：风格库里那张卡片是「这套风格的这一页长什么样」
    的示例，而生成中那张画布拿它当**通用框架**（见 `GenerationReveal`）。
    原先这里写的是「填上合适的示例文字」，于是 156 张样机里写满了「企业年报 / ANNUAL
    REPORT」「汇报人：李承远」「2024.12.18」——一张样机只配得上一个项目，谈不上通用。

    存量那 156 张由 `scripts/rewrite-mock-copy.ts` 按文本节点改写（不重跑模型，
    版式一个像素不动）；这一句管的是**以后新出的样机**，所以两处都要改。
  */
  '内容你自己安排——**这一页要好看**：标题、正文、数字、图片位都要填满，把版面撑满，',
  '让版式的特点看得出来，不要留一片空白。但**填的是方向性占位文字，不是有真实感的内容**：',
  '标题写「这里主要讲解的核心内容」、副标题写「一句话说清这一页要讲什么」、',
  '正文写「这里主要讲解……这一块放具体的说明文字」、人名字段写「姓名」、日期写「日期」、',
  '机构写「单位」、栏目写「栏目 / SECTION」、指标数字写成 `00` / `00%` 这种形状。',
  '**不要写任何像真事的字**：公司名、人名、具体的年月日、真实统计数据、英文专有名词，',
  '一律不要出现——这些位置写得越具体，这张样机就越只能配一个项目。',
  '**占位的长度要跟这个位置原本该有的篇幅相当**（该长的长、该短的短），版式才撑得住。',
  '',
  /**
   * 对比度这条要**明写**，而且要**分两层**写。
   *
   * 模型写 `.card{background:var(--surface);color:var(--text)}` 时想的是
   * 「卡片用表面色、字用正文色」，完全没考虑这两个色放在一起是什么效果——
   * 用户一次报了六套风格的「文字看不清」，全是这么来的。
   *
   * 而**整页那一层**必须单独点名：实测「红黑极简提案风」的文字页把 `.stage`
   * 铺成 `--brand` 深红渐变，页眉、正文、页码却照旧用 `--text`（近黑）——
   * 它把整页底色当成了「这套风格本来就长这样」，压根没意识到那也是一层底色。
   * 只说「卡片」，它就只去改卡片。
   */
  '**文字色永远要跟它所在的底色相反**：深色底配浅色字、浅色底配深色字。要分两层检查：',
  '1. **整页底色**——`.stage` / `.slide` 这一层铺的是什么？铺 `--bg`（浅色）时，正文照常用 `--text`、'
    + '次要文字用 `--muted`；**铺 `--brand` / `--accent` / `--text` 这类深色时，整页所有文字都要换成浅色**'
    + '（白色，或 `--on-brand` 那种浅色变量），页眉、页脚、页码、正文、标题一个都不能漏。',
  '2. **局部色块**——卡片、标签、按钮的底色和它上面的字要相反。深色卡片上写 `color:var(--text)`（近黑）、'
    + '浅色底上写白字，都会看不清。',
  '拿不准就给那块底配一个明确的对色变量（如 `--on-surface`），别沿用整页的正文色。',
  /**
   * **辅助色偏淡**是另一类「看不清」，形状和上面两种都不同。
   *
   * `--muted` / `--accent` 这些色在浅底上常常只有 2.5~2.8:1。麻烦的是模型收到
   * 「对比度不足」的反馈后**不知道该拿什么替代**——配色里就这几个色，
   * 于是要么硬着头皮再用一次，要么改用 `--text` 把层次做没了。实测「蔚蓝科技商务风」
   * 和「暖调纸感编辑风」就是这样卡住的。
   *
   * 所以这里直接把**手法**写给它：不是换个色，而是把同一个色**压暗再用**。
   */
  '`--muted` / `--accent` 这类辅助色常常偏淡，直接当文字色可能只有 2.5~2.8:1。',
  '要让它们达标就**压暗再用**：`color-mix(in srgb, var(--muted) 72%, var(--text))`——'
    + '既保住色相又够清楚。不要因为「配色里只有这几个色」就把偏淡的那个直接拿来当文字色。',
  '',
  /**
   * 纸纹那条是实测踩出来的：规范里写着「极淡纸纹」，模型拿 `feTurbulence` 画了一张
   * 颗粒图，还叠了 `mix-blend-mode: multiply`——**乘上去会把整页压暗**，
   * 而且在留白多的地方（思维导图那种）一眼就是一片灰色噪点。
   */
  '**纸纹、颗粒这类纹理要极淡，而且不要用 `mix-blend-mode` 叠加**：',
  '乘法混合会把整页压暗，留白多的地方会显出一片灰点。用低不透明度的直接覆盖就够了（不超过 0.03），',
  '或者干脆不做纹理——留白干净比有噪点好。',
  '',
  /**
   * 绝对定位堆叠文字块时最容易出的一种错：只按「上边距」排，没算字号与行数。
   */
  '**用 absolute 堆叠文字块时，要按「字号 × 行高 × 行数」留够高度**：',
  '标题 `top` 与下一块 `top` 之间的差，必须大于标题实际占的高度，否则标题会压到副标题上。',
  '算不准就让文字参与常规流（flex 纵向排列），别硬写 `top`。',
].join('\n');

/** 参考图里没有的页类型，由模型推导 */
const DERIVE_SYSTEM = [
  '你是资深视觉设计总监。我给你一套演示文稿风格里**已经写好的若干页提示词**，',
  '请照着同样的写法与语言，为**还没有的那些页类型**补上提示词。',
  '',
  '要求：',
  '- 补出来的每一条，都必须和已有的那几条是**同一套风格**：同样的配色、同样的字体处理、',
  '  同样的排版讲究。不要引入已有的几条里没出现过的新颜色。',
  '- **已有的那几条里写到的视觉效果要沿用**：渐变、毛玻璃、发光、霓虹，参数照抄',
  '  （模糊半径、光晕颜色、渐变角度与色标）。只抄了配色和字号、把效果丢掉的补法不算数——',
  '  效果才是这套风格辨识度所在。',
  '- 每条提示词都必须是固定四段（角色 / 任务 / 视觉与排版要求 / 代码要求（非常重要）），',
  '  顺序与名称不能改。',
  '- 每条的「角色」与「代码要求」两段可以和已有的一致（那是同一套风格），',
  '  但「视觉与排版要求」必须**针对这个页类型**重新写，不能照抄别的页类型。',
  '- 页面是固定 1920×1080 的单屏画布，不许出现滚动条；不要用 position: fixed 与 vh 单位。',
  `- 图片位写成 <img ${IMAGE_SLOT_ATTR}="1"> 这种形式，不要写 src。`,
  `- 人像位写成 <img ${IMAGE_SLOT_ATTR}="1" data-lumen-cutout="1">：这一格会放人物抠图，`,
  '  按 contain 摆放不裁切，所以要留竖向空间。',
  /**
   * 与 `WRITE_SYSTEM` 同一条要求：**属性名要落进提示词文本里**。
   * 补出来的这几条里，人物页 / 图文页 / 图片排版页最容易漏——
   * 它们最容易被写成「放一张人物照片」这种散文，而那样一个槽都不会有。
   */
  `- **人物页、图文页、图片排版页的提示词里必须原样写出这个写法**（\`<img ${IMAGE_SLOT_ATTR}="1">\` 或带 cutout 的那种），`,
  '  不能只写「配一张照片」这种散文——照着那种提示词出图时模型会自己画一个色块顶上。',
  `- 图表位写成 <div ${CHART_SLOT_ATTR}="宽x高">{…JSON…}</div>，JSON 里**第一个字段固定叫 \`kind\`**`,
  `  （不是 \`type\`），值只能从这些里挑一个：${CHART_KIND_LINES}。`,
  '  **不要写颜色，也不要用 CSS/SVG 自己画图表**——出图与配色都由渲染层负责。',
  '- 「视觉与排版要求」里要交代**文字与底色的关系**：深色底配浅色字、浅色底配深色字。',
  '  **整页底色也算一层**：整页铺的不是 `--bg` 而是品牌深色时，写明「整页所有文字改用浅色」；',
  '  有深色卡片/色块时写明它上面的文字用哪个色，别让模型沿用整页正文色。',
  '',
  '只输出 JSON，不要任何解释：{"pages":[{"pageType":"...","prompt":"..."}]}',
].join('\n');

/**
 * 把配色**明写**给生成样机的调用。
 *
 * 只靠提示词里那句「沿用这套风格的配色」是不够的：参考图里读出来的那几条提示词
 * 里确实写了色值，但**推导出来的那几条没写过**——它们只被告知「沿用已有的」，
 * 而「已有的」是什么，模型看不到。实测八条推导页各自发明了一套深色，
 * 跟参考图读出来的暖米白封面摆在一起，同一套风格里两种调子。
 *
 * 所以配色不靠提示词传递，由这里直接钉死。顺带也让「换主题」有了单一入口：
 * 改 `palette` 一处，九页一起变。
 */
export function paletteBlock(palette: StylePalette): string {
  return [
    '这套风格的配色，必须严格使用（写在 :root 里，页面里所有颜色都引用这些变量）：',
    `--bg: ${palette.bg};        /* 页面底色 */`,
    `--surface: ${palette.surface}; /* 浮在底色上的表面色 */`,
    `--text: ${palette.text};      /* 正文色 */`,
    `--muted: ${palette.muted};     /* 次要文字色 */`,
    `--accent: ${palette.accent};    /* 强调色 */`,
    `--brand: ${palette.brand};     /* 品牌色 */`,
    `--border: ${palette.border};    /* 分隔线与边框 */`,
    '',
    '底色必须是 --bg，不要用深色或其它颜色替换；不要引入这套配色之外的颜色。',
  ].join('\n');
}

/**
 * 把字体**明写**给调用。与 `paletteBlock` 同属「可选注入」，但理由不一样。
 *
 * 「字体由渲染层注入 `--font-sans`，模型不用管」这个判断是**错的**（headless Chrome 实测证伪）：
 * `buildPageDocument` 把注入的 `body { font-family: var(--font-sans) }` 写在 `<head>`，
 * 而模型片段（连同它自己的 `<style>`）落在 `<body>`——片段的 `body{font-family:…}` 与注入那条
 * **同优先级**、又排在后面，于是片段赢，风格字体被整条丢掉。45 份样机里 28 份写死了自己的字体栈。
 *
 * `WRITE_SYSTEM` 里那句「不使用任何外部字体库（只用系统无衬线字体栈）」正是模型自己发明字体栈的
 * 来源；所以字体必须和配色一样在这里说死，且要明说压过别处的系统字体栈要求。
 */
export function fontBlock(fonts: FontStacks): string {
  const lines = [
    '这套风格的字体，必须严格使用，页面里**不要声明任何具体的字体名**：',
    `--font-sans: ${fonts.fontFamily};`,
  ];
  if (fonts.fontDisplay?.trim()) lines.push(`--font-display: ${fonts.fontDisplay};`);
  if (fonts.fontScript?.trim()) lines.push(`--font-script: ${fonts.fontScript};`);
  if (fonts.fontNumeric?.trim()) lines.push(`--font-numeric: ${fonts.fontNumeric};`);
  lines.push(
    '',
    '- 需要指定字体的地方一律引用变量——渲染时会注入到 `:root` 上，其余元素靠继承即可。',
    '  **不要写 `font-family: Georgia, serif` 这种具体的字体栈**，只写 `var(--font-*)`。',
    '- **也不要自己在 `:root` 里再定义 `--font-sans` / `--font-display` / `--font-script` /',
    '  `--font-numeric`**。上面那几行是给你看「这几个变量各自是什么」的，不是让你抄进 CSS。',
    '  渲染层会注入它们，你写一份就把它盖住了（同优先级下后写的赢），而那一份是死的：',
    '  用户在界面上换字体时它不会跟着变，那一页就永远停在你抄下来的这套字体上。',
    '  下面「代码要求」里如果写着「在 :root 中定义 --font-*」，**以这一段为准，不要定义**。',
    '- 四个角色分别用在哪儿：',
    '  - `var(--font-sans)`：正文、要点、说明。**默认就是它，不写也行。**',
    '  - `var(--font-display)`：大标题、需要衬线/宋体的展示字。',
    '  - `var(--font-script)`：签名、引言、装饰性小字这类手写体。**一页最多用一处**，',
    '    用多了像贴纸。',
    '  - `var(--font-numeric)`：指标值、大号序号这类数字。**不写就跟展示字体一套**，',
    '    所以只有确实想让数字换个字形时才用。',
    '- **不要写 `body { font-family: … }` 这类系统字体栈**：它与注入的那条同优先级又排在后面，',
    '  会把本风格的字体整条盖掉。别处（系统要求、提示词、参考图）若写了',
    '  「只用系统无衬线字体栈」之类的要求，一律以本条为准。',
  );
  return lines.join('\n');
}

/* ---------------- 类型 ---------------- */

interface SlideRef {
  pageType: PageType;
  /** 归一化裁切框 */
  box: CropBox;
  /**
   * 这一页不是模型给的，是「一个框都给不出」时的兜底（整张图当一页）。
   *
   * 标出来是为了让调用方能如实说：不标的话，用户上传一张单页导出图时，
   * 模型如实返回整画布封面与兜底**逐位相同**，客户端无论怎么启发式都分不出这两种情况——
   * 而误报（把正例说成兜底）比静默更糟。
   */
  fallback?: true;
}

/* ---------------- 分步实现 ---------------- */

const SPLIT_SYSTEM = [
  '这张图里排了好几张幻灯片（也可能只有一张）。请找出每一张幻灯片。',
  '坐标用归一化值：左上角是 (0,0)，右下角是 (1,1)，x 向右、y 向下。',
  `pageType 只能取：${PAGE_TYPE_ORDER.map((t) => `${t}(${PAGE_TYPE_LABEL[t]})`).join(' ')}。`,
  '只输出 JSON，不要任何解释：{"slides":[{"pageType":"cover","x0":0.04,"y0":0.15,"x1":0.96,"y1":0.55}]}',
  '按从上到下、从左到右的顺序排列。图中如果只有一张幻灯片，就只返回一项。',
].join('\n');

export async function splitSlides(gateway: ProviderGateway, imageUrl: string, img: { width: number; height: number }): Promise<SlideRef[]> {
  const res = await gateway.text({
    taskType: 'style_recognize',
    json: true,
    maxTokens: 3000,
    system: SPLIT_SYSTEM,
    messages: [{ role: 'user', content: '找出这张图里的每一张幻灯片。', images: [imageUrl] }],
  });
  const parsed = parseModelJson<{ slides?: unknown }>(res.text);
  const raw = Array.isArray(parsed?.slides) ? parsed.slides : [];
  const out: SlideRef[] = [];
  for (const s of raw as Record<string, unknown>[]) {
    // 模型给的是目测坐标，像素/归一化写反、两角颠倒、越界都见过，交给它统一收拾；
    // 收拾不了（框太小太扁，多半是把页内某个元素当成了整页）就丢掉
    const box = normalizeCropBox(s, img.width, img.height);
    if (!box) continue;
    const t = String(s.pageType ?? '');
    out.push({
      pageType: (PAGE_TYPE_ORDER as string[]).includes(t) ? (t as PageType) : 'text',
      box,
    });
  }
  // 模型没给出可用结果时，整张图当一页——总比一页都没有强。
  // 带 `fallback` 标记，让调用方能把这句「没找着，按整张图处理了」如实说给用户
  if (out.length === 0) out.push({ pageType: 'cover', box: { x0: 0, y0: 0, x1: 1, y1: 1 }, fallback: true });
  return out;
}

export interface WritePromptOptions {
  /** 给了就把这套配色明写进调用。单页重识别用，全量识别不传 */
  palette?: StylePalette;
  /** 给了就把这套字体明写进调用。与 `palette` 同一路可选注入，同样只有单页重识别会传 */
  fonts?: FontStacks;
  /**
   * 这套风格已经提炼过的视觉规范。给了就一并注入——单页重识别是从参考图**重新写**一条提示词，
   * 不注入规范的话，重写出来的这一页会跟其余十页的标题层级、角标形态对不上。
   */
  spec?: StyleSpec | null;
  /** 上一版有哪几个问题，重试时列给模型。传的是 `lintStylePrompt` 给出的 message 原文 */
  problems?: string[];
}

/**
 * 可选参数是为单页重识别准备的：那条路的配色与字体都是现成的，不注入的话模型会照着参考图
 * 写「背景用深蓝」、写死自己的系统字体栈，跟这套风格的实际底色与字体打架。
 * 全量识别写提示词时配色还没提炼出来（字体也一样），什么都不传，行为与从前逐字节一致。
 */
export async function writePagePrompt(
  gateway: ProviderGateway,
  pageImage: string,
  pageType: PageType,
  opts: WritePromptOptions = {},
): Promise<string> {
  const parts = [
    `这一页是【${PAGE_TYPE_LABEL[pageType]}】（${PAGE_TYPE_BRIEF[pageType]}）。请写出它的 HTML 生成提示词。`,
  ];

  if (opts.palette) {
    parts.push(
      '',
      '---',
      paletteBlock(opts.palette),
      '',
      '参考图只用来定版式与视觉语言。**参考图里的颜色不要照搬**——上面这套配色才是这一页要用的，',
      '提示词里写到颜色时一律引用这些变量名。',
    );
  }

  if (opts.fonts) {
    parts.push(
      '',
      '---',
      fontBlock(opts.fonts),
    );
  }

  if (opts.spec) {
    parts.push('', '---', specBlock(opts.spec));
  }

  if (opts.problems && opts.problems.length > 0) {
    parts.push(
      '',
      '---',
      '上一版有这些问题，请重写一遍：',
      ...opts.problems.map((p) => `- ${p}`),
      '',
      '四个小节一个都不能少、顺序不能变、名称不能改。',
    );
  }

  const res = await gateway.text({
    taskType: 'html_codegen',
    maxTokens: 8000,
    system: WRITE_SYSTEM,
    messages: [{ role: 'user', content: parts.join('\n'), images: [pageImage] }],
  });
  const prompt = stripFences(res.text);
  if (prompt.trim().length === 0) throw new Error('模型没写出提示词');
  return prompt;
}

/** 出样机的 token 预算。实测推理要吃掉一万多，给小了会返回空正文 */
const MOCK_MAX_TOKENS = 40000;

/**
 * 哪几种页类型**必须有图片位**，以及要的是哪一种。
 *
 * ## 为什么要这张表
 *
 * 这几类页面的存在理由就是「有图」：图文页没图、图片排版页没图、人物页没人物，
 * 页面在界面上看着是完整的（模型会自己画个色块顶上），但**渲染层一格都填不上**。
 *
 * 实测：用户一次报了四处「没图 / 没人物」，四套不同风格，**图片位都是 0 个**——
 * 连从参考图里读出来的那条提示词（暖橙渐变的图文页）也没写槽约定。
 * 所以这不是某一条提示词写得不好，是**这条路根本没人在管**。
 *
 * 判据与 `chartSlotIssues` 同一个路数：不看提示词怎么说，**看样机里有没有槽**。
 *
 * ## 为什么只有这三类
 *
 * `cover` 的主视觉可以是几何构成（`PAGE_TYPE_BRIEF` 里就写着「配图、插画、
 * 3D 元素**或几何构成**」），用 CSS/SVG 画是合理的，逼它留槽反而会毁掉
 * 「大字海报」那类封面。`text` / `metrics` / `section` 之类同理——
 * 它们本来就该用排版和图形说话。
 */
const IMAGE_SLOT_REQUIRED: Partial<Record<PageType, 'photo' | 'cutout'>> = {
  // 一到三位的透明底抠图，人像位
  people: 'cutout',
  // 一到两张配图（以文字为主，但图得有）
  imageText: 'photo',
  // 多张图成组铺开、以图为主
  gallery: 'photo',
  // 设备屏幕里的那张界面截图。没有它这一页就是一台空屏设备，等于没做
  ui: 'photo',
};

/**
 * 这一页的图片位有什么问题。空数组表示没问题。
 *
 * 判据是**样机里有没有 `data-lumen-image` 槽**，不是提示词里提没提——
 * 提示词写了散文（「配一张人物照片」）而没写属性，模型照样会自己画。
 * 见 `IMAGE_SLOT_REQUIRED` 的说明。
 */
function imageSlotIssues(html: string, pageType: PageType | undefined): string[] {
  const need = pageType ? IMAGE_SLOT_REQUIRED[pageType] : undefined;
  if (!need) return [];

  // 人像位是图片位的一种（多带一个 data-lumen-cutout），所以两种都要数
  const slots = [...html.matchAll(new RegExp(`<img[^>]*\\b${IMAGE_SLOT_ATTR}\\b[^>]*>`, 'gi'))];
  const cutouts = slots.filter((m) => /data-lumen-cutout/i.test(m[0]));

  if (need === 'cutout') {
    if (cutouts.length === 0) {
      return [
        '人物页必须留**人像位**：写成 `<img data-lumen-image="1" data-lumen-cutout="1">`（第二、三位依次用 "2"、"3"），'
        + '**不要写 src、也不要自己画人形**。渲染层会往这一格放透明底人物抠图，'
        + `按 contain 摆放不裁切——所以人像位要留竖向空间，人物脚下落在同一条基线上。`
        + `现在这一版有 ${slots.length} 个图片位、0 个人像位`,
      ];
    }
    return [];
  }

  // photo：图文页与图片排版页。图片排版页要的是「成组」，一张不够
  const least = pageType === 'gallery' ? 2 : 1;
  if (slots.length < least) {
    return [
      `${PAGE_TYPE_LABEL[pageType!]}必须有图片位：写成 \`<img data-lumen-image="1">\`（第二张 "2"，依次往后），`
      + '**不要写 src、也不要用 CSS/SVG 自己画图**。这一格由渲染层填真实图片。'
      + `现在只有 ${slots.length} 个图片位，至少要有 ${least} 个`,
    ];
  }
  return [];
}

/**
 * 这一页的图表槽有什么问题。空数组表示没问题。
 *
 * ## 为什么要在这里查
 *
 * **真正生成页面那条路本来就查**：`generate-html.service` 有一条
 * `layout/missing-chart-slot` 的 lint 规则，不过就带着问题重发一次。
 * 而**出样机这条路一直没有**——于是识别与统一出来的图表页，模型爱怎么写就怎么写。
 * 实测九套风格，只有一套的图表槽是对的，其余分三种坏法：
 *
 * - **压根没有槽**（六套）：提示词里没交代，模型就自己用 CSS/SVG 手绘一张图。
 *   看着像有图，其实那是一张画死的 SVG——版式库里二十种图一种都用不上。
 * - **JSON 写成了 JS 对象字面量**（暖橙）：`{kind:'bar', categories:[…]}`，
 *   单引号、键不加引号，`JSON.parse` 直接失败。
 * - **字段形状不对**（橙红）：写成 `{"kind":"line","data":[{"name":…,"value":…}]}`，
 *   而折线图要的是 `categories` + `series`。报出来的就是用户看到的那句
 *   「折线图要有 categories（类目轴上的名字）」。
 *
 * ## 判据来自出图侧，不另写一份
 *
 * `parseChartSlot` 就是渲染时用的那一个：它说能出图，页面才真出得来。
 * 它给的那句 `problem` 直接当重试理由回给模型——**具体到「哪里不对」**，
 * 比笼统说一句「图表数据有问题」有用得多。
 */
function chartSlotIssues(html: string, pageType: PageType | undefined): string[] {
  // 只有图表页才要求有槽。别的页类型带一张小图不算——那种页面本来就该用 SVG 画
  if (pageType !== 'chart') return [];

  const slots = [...html.matchAll(new RegExp(CHART_SLOT_RE.source, 'gi'))];
  if (slots.length === 0) {
    return [
      '图表页必须留一个图表槽：写成 <div data-lumen-chart="宽x高">{ 一段严格 JSON }</div>，'
      + '属性值是这个区域的实际像素尺寸（要与样式里的 width/height 一致）。'
      + '**不要用 CSS 或 SVG 自己画图表**——出图由渲染层负责，手绘的图在版式库里一种都用不上',
    ];
  }
  for (const m of slots) {
    const sizeText = m[2] ?? '';
    if (!parseChartSlotSize(sizeText)) {
      /**
       * 这里要**给完整骨架**，不能只说「要写成宽x高」。
       *
       * 实测「重工蓝白工业风」重试两次都卡在这一条，模型写的是
       * `<div data-lumen-chart="{"kind":"bar",…}">`——**把 JSON 塞进了属性值**，
       * 属性里的引号在第一个 `{` 处就断了，取出来只剩一个 `{`。
       * 只报「现在写的是「{」」等于没说，得把整行该怎么写摆出来。
       */
      return [
        '图表槽的尺寸属性写错了：`data-lumen-chart` 的引号里**只放尺寸**，写成「宽x高」'
        + `（如 "1180x560"），JSON 放在标签**里面**。现在引号里是「${sizeText.slice(0, 40)}」`,
        '完整写法：`<div data-lumen-chart="1180x560">{"kind":"bar","categories":["A","B"],"series":[{"name":"系列","values":[12,18]}]}</div>`',
      ];
    }
    const parsed = parseChartSlot(m[3] ?? '');
    if (!parsed.ok) {
      /**
       * **把模型自己写的那一段回显给它。**
       *
       * 原先只说 `kind Required`，模型看不到自己写的是 `"type":"bar"`——
       * 它会以为是数据没给全，于是换个数据再写一遍，字段名照旧。实测六套风格
       * 重试后仍是同一条错，就是这个缘故。回显之后它才可能发现是字段名的问题。
       *
       * 只截前 160 字符：字段名在最前面，后面那些长数据不用占位置。
       */
      const raw = (m[3] ?? '').trim();
      return [
        `${parsed.problem}。你这一版写的是：${raw.slice(0, 160)}`,
        'JSON 必须是**严格 JSON**（键与字符串都用双引号、不能有尾逗号），'
        + '直角坐标系与类目类的图一律是 `{"kind":"…","categories":[…],"series":[{"name":"…","values":[…]}]}`，'
        + '`categories` 与每条的 `values` 长度要对齐，`series` 是**对象数组**而不是一串名字',
        `**第一个字段固定叫 \`kind\`**（不是 \`type\`、不是 \`chartType\`），只能从这些里挑一个：${CHART_KIND_LINES}`,
      ];
    }
  }
  return [];
}

/**
 * `fontFamily` 是可选的，与 `writePagePrompt` 走同一路注入：全量识别在这时也还没定字体，
 * 不传就与从前逐字节一致。`palette` 之所以是必填，是因为 lint 要用它；字体只进指令、不参与 lint，
 * 所以能可选。
 *
 * ## `spec` 必须传（有的话）
 *
 * 视觉规范是**跨页统一**的那一层：页脚页码、页眉品牌标识、标题层级、安全边距、
 * 以及渐变/毛玻璃/发光这些效果语言。**不注入的话，样机只受那一条提示词约束**——
 * 而提示词是逐页写的散文，模型照着写时很容易把「整页要有一层 158° 渐变底」
 * 「页脚右侧放页码」这类系统性细节略过去。
 *
 * 实测踩过：统一之后的样机自检，偏差全落在这些系统性项上（某套 32 条里大半是
 * 「无页脚页码，页码被放到右上角」「整页该是渐变却纯色满铺」「卡片该毛玻璃却是实心」），
 * 而**真正生成页面的那条路（`generate-html.service`）是注入规范的**。
 * 两条路不一致，样机就比真页松一档，「统一」也就只统一了提示词、没统一产物。
 *
 * ## `pageType` 传了才查图表槽
 *
 * 见 `chartSlotIssues`。不传就是不查——老调用点一个字都不用改。
 */
export async function generateMock(
  gateway: ProviderGateway,
  prompt: string,
  palette: StylePalette,
  fonts?: FontStacks,
  spec?: StyleSpec | null,
  pageType?: PageType,
  /**
   * 这一页绑定的版式骨架块（`forcedLayoutBlock`）。不传就是没有绑定，拼法逐字节不变。
   *
   * **样机与真页必须用同一份版式。** 真生成（`generate-html.service`）在绑了版式时
   * 会带上这一块；样机不带的话，风格库里显示的是「模型照提示词自由发挥」的那一版，
   * 而实际生成出来是骨架那一版——两者对不上，用户照着样机验收会落空。
   * 界面页尤其明显：样机里是一台 CSS 画的假设备，真页里是我们渲出来的那台。
   */
  layoutBlock = '',
): Promise<{ html: string; issues: ReturnType<typeof lintMockHtml> }> {
  // 不传字体时拼法逐字节不变——全量识别那条路一点没动
  const font = fonts ? `\n\n---\n${fontBlock(fonts)}` : '';
  // 与 `generate-html.service` 同一个措辞、同一个位置：配色之后、正文之前
  const specText = spec ? `\n\n---\n${specBlock(spec)}` : '';
  const layoutText = layoutBlock ? `\n\n---\n${layoutBlock}` : '';
  const call = async (extra: string) => {
    const res = await gateway.text({
      taskType: 'html_codegen',
      maxTokens: MOCK_MAX_TOKENS,
      temperature: 0.3,
      system: MOCK_SYSTEM,
      messages: [{ role: 'user', content: `${prompt}\n\n---\n${paletteBlock(palette)}${font}${specText}${layoutText}\n\n---\n${extra}` }],
    });
    /**
     * **降级到内置 Mock 时拿到的是它的占位说明文字，不是样机。**
     *
     * 内置 Mock 对 `html_codegen` 的兜底是一段约一百四十字的说明（含固定标记句），
     * 而不是一页 HTML。它**过得了 lint**——没有色值、没有 script，只差一条
     * `no-tokens` 的 warning——所以不加这道判据，它会一路当成真样机落库：
     * 界面上那一格显示的是一段说明文字，而整轮报的是成功。实测踩过，
     * 蔚蓝的架构图页与深色紫调的思维导图页就是这么来的。
     *
     * **不重试**：走到 Mock 说明网关已经把主模型与整条降级链都试过一遍了，
     * 紧接着再发一次只是再等一个主模型的超时（实测一次六分钟），
     * 换回来的还是同一段占位文字。这里抛出去，由调用方按「这一页没出样机」
     * 如实处理——全量识别与补齐会把它落成空样机，界面显示「样机未生成」；
     * 单页重识别会变成一个 error 事件，用户看到的是失败而不是一段假样机。
     */
    if (isMockPlaceholder(res.text)) {
      throw new Error(
        res.degraded
          ? `模型没有产出样机：主模型失败后降级到了内置 Mock（${res.degradeReason}）`
          : '模型没有产出样机：当前 html_codegen 路由指向内置 Mock，它给不出这一页的 HTML',
      );
    }
    return stripHtmlReply(res.text);
  };

  /**
   * 一条样机要过两道关：**lint**（色值、脚本、契约）与**图表槽**（能不能真出图）。
   *
   * 合成一份清单一起回给模型，不分开重试：两道关各自重发一次的话，改好色值又可能
   * 把图表槽写坏，来回两轮反而更慢。一次说清「这些地方都要改」。
   */
  const complaintsOf = (h: string, lintIssues: ReturnType<typeof lintMockHtml>): string[] => [
    ...lintIssues.filter((i) => i.severity === 'error').map((i) => i.message),
    ...imageSlotIssues(h, pageType),
    ...chartSlotIssues(h, pageType),
  ];

  let html = await call('请照着上面的提示词写出这一页的 HTML。');
  let issues = lintMockHtml(html, palette);
  let complaints = complaintsOf(html, issues);
  if (complaints.length > 0) {
    // 带问题重试一次。样机是要给人看的，一份过不了关的 HTML 宁可多花一次调用
    logger.warn('样机第一版没过检查，将重试一次', { complaints });
    html = await call(`上一版有这些问题，请重写：\n${complaints.map((c) => `- ${c}`).join('\n')}`);
    issues = lintMockHtml(html, palette);
    complaints = complaintsOf(html, issues);
    if (complaints.length > 0) {
      // 重试后仍不过就如实记一笔。**不抛**：这是「这一页的图表槽写得不好」，
      // 不是「这一页没有样机」——抛出去会让整页的样机被丢掉，而它其余部分是好的
      logger.warn('样机重试后仍有问题，照常返回', { complaints });
    }
  }
  return { html, issues };
}

/**
 * 参考图里没有的页类型，由模型照着已有的几条推导。
 *
 * **分批**而不是一次要全部：一次要八条完整提示词，正文就有三千多字，
 * 加上推理预算，模型会把 token 全花在思考上、正文一个字不出——
 * 实测踩过，八条全部退化成兜底模板，等于这一步白做。每批三条稳得多。
 */
export async function derivePrompts(
  gateway: ProviderGateway,
  existing: { pageType: PageType; prompt: string }[],
  missing: PageType[],
  palette: StylePalette,
  /** 已经提炼过的视觉规范。补出来的页类型也要守它，否则补齐的这几页会跟其余的对不上 */
  spec?: StyleSpec | null,
): Promise<{ pageType: PageType; prompt: string }[]> {
  const sample = existing.slice(0, 3)
    .map((p) => `【${PAGE_TYPE_LABEL[p.pageType]}】\n${p.prompt}`)
    .join('\n\n---\n\n');

  const out: { pageType: PageType; prompt: string }[] = [];
  /**
   * **一批一页，不要贪多。**
   *
   * 原先一批三页。实测两套风格连着栽在这上面：「红黑极简提案风」的
   * cover / toc / metrics / imageText 四页、「红调科技商务风」的 chart / metrics 两页，
   * 推出来的提示词都缺段落（chart 甚至四段全缺），被下面那句 `PROMPT_SECTIONS.every`
   * 判为不合规丢掉，落到兜底模板上——那几页的提示词里一点这套风格的信息都没有。
   *
   * 原因不是模型不会写：**一页提示词三四千字符，三页叠一起就上万**，再加上样本
   * （前三条已有提示词，也是一万多字符），`deepseek-v4.1-flash` 在长上下文里会把
   * 预算大量烧在 reasoning 上，正文写不完——而「代码要求」排在四段的最后，
   * 最先被丢。一次一页，输出短、写得完。
   *
   * 代价是调用次数：缺 11 类就是 11 次而不是 4 次，识别一轮从 20 次变 27 次。
   * 一轮本来就要五到十分钟，多这几次不显著；而提示词不合规是**长期**问题——
   * 缺「代码要求」的那几页生成出来的页面不会用 `:root` 变量，换主题就散架。
   */
  for (const batch of chunk(missing, 1)) {
    const want = batch.map((t) => `- ${t}（${PAGE_TYPE_LABEL[t]}）：${PAGE_TYPE_BRIEF[t]}`).join('\n');
    const res = await gateway.text({
      taskType: 'html_codegen',
      json: true,
      maxTokens: 20000,
      system: DERIVE_SYSTEM,
      messages: [{
        role: 'user',
        content: `已写好的页类型：\n\n${sample}\n\n---\n${paletteBlock(palette)}`
          + (spec ? `\n\n---\n${specBlock(spec)}` : '')
          + `\n\n---\n请补上这几类：\n${want}`,
      }],
    });
    const parsed = parseModelJson<{ pages?: unknown }>(res.text);
    const list = Array.isArray(parsed?.pages) ? parsed.pages : [];
    if (list.length === 0) {
      logger.warn('推导页类型没拿到可用结果，本批退化为兜底模板', {
        batch: batch.join(','), raw: res.text.slice(0, 200),
      });
    }
    for (const item of list as Record<string, unknown>[]) {
      const t = String(item.pageType ?? '');
      const prompt = str(item.prompt);
      if (!(batch as string[]).includes(t)) continue;
      if (!PROMPT_SECTIONS.every((s) => prompt.includes(s))) continue;
      out.push({ pageType: t as PageType, prompt });
    }
  }

  // 模型漏掉的（或结构不合规的）也要有兜底，否则这个页类型在库里是空的
  for (const t of missing) {
    if (out.some((o) => o.pageType === t)) continue;
    out.push({ pageType: t, prompt: fallbackPrompt(t) });
  }
  return out;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/* ---------------- 工具 ---------------- */

/** 推导失败时的兜底提示词：结构完整、能用，只是不如模型写的具体 */
function fallbackPrompt(pageType: PageType): string {
  return [
    `角色：你是一个资深的前端工程师和视觉设计师，精通现代 CSS 排版。`,
    `任务：请帮我用单文件（HTML + 内联 CSS）写一个演示文稿【${PAGE_TYPE_LABEL[pageType]}】的模板。`,
    `视觉与排版要求：`,
    `1. ${PAGE_TYPE_BRIEF[pageType]}。`,
    `2. 沿用这套风格已有的配色与字体处理，不要引入新颜色。`,
    `3. 固定 1920×1080 单屏，不留滚动条。`,
    `代码要求（非常重要）：`,
    `1. 在 :root 中定义 CSS 变量（--bg / --text / --muted / --accent / --brand / --border），所有色值都引用变量。`,
    `2. 用 Flexbox 或 absolute 定位排版，不要用 position: fixed 与 vh 单位。`,
    `3. 只用系统无衬线字体栈，不引用任何外部字体或资源。`,
  ].join('\n');
}

/**
 * 把模型给的字段收拾成去空白的字符串。
 *
 * 导出是因为 `recognize-doc.service` 提炼风格时也要用同一份——两边各留一份
 * 迟早会漂移。放在这里而不是 `lib/`：它收拾的正是本文件这几条调用拿回来的字段。
 */
export function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}
