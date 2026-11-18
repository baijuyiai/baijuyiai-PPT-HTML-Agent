import { z } from 'zod';
import { fontStackOf, SYSTEM_SCRIPT_STACK } from './font-choices.js';
import { LintIssue } from './lint.js';
import { PageType } from './page.js';
import type { RecipeDecoration } from './style.js';
import { StyleSpec } from './style-spec.js';

/**
 * 风格 = 每个页类型一条「HTML 生成提示词」+ 它真跑出来的样机。
 *
 * ## 为什么不是一套设计 token + 版式几何
 *
 * 上一版把风格提取成色板、字号阶梯、横带几何、容量数字，再由渲染器按这些参数画页。
 * 问题是**渲染器只有一套排布方式**——量得再准，落到画面上仍然是那二十几个固定骨架，
 * 换风格只是换颜色和字体。真正决定「像不像原稿」的那些东西（文字怎么交叠、
 * 空心描边字怎么压在大字上、四角微字怎么贴边）根本表达不出来。
 *
 * 现在改成：识别时直接让模型为每一页写一条**可直接发给模型的提示词**，
 * 这条提示词就是风格的载体。用这套风格生成页面时，把提示词和该页内容一起发出去，
 * 模型产出 HTML。风格的表现力上限因此等于模型的能力，而不是渲染器的骨架数量。
 *
 * ## 提示词的形状
 *
 * 固定四段，顺序与标题都不能变（`PROMPT_SECTIONS`）：
 * `角色` / `任务` / `视觉与排版要求` / `代码要求（非常重要）`。
 * 前两段定调子，第三段说版式与视觉，第四段说代码约束（`:root` 变量、定位方式、
 * 响应式、不用外部字体）。校验见 `lintStylePrompt`。
 */

/** 提示词必须含有的四个小节标题，顺序即此处顺序 */
export const PROMPT_SECTIONS = ['角色：', '任务：', '视觉与排版要求：', '代码要求（非常重要）：'] as const;

/**
 * 图片位占位属性。
 *
 * 提示词里要求模型把图片位写成 `<img data-lumen-image="1">`（**不写 src**）。
 * 这样一条提示词才能脱离具体图片复用：渲染时把第 n 张图填进去即可。
 * 若模型直接把某个 URL 写死进 HTML，换一套图就得改提示词。
 */
export const IMAGE_SLOT_ATTR = 'data-lumen-image';

/** 页类型的展示名与推荐顺序。顺序就是大纲里常见的出场次序 */
export const PAGE_TYPE_ORDER: PageType[] = [
  'cover', 'toc', 'section', 'text', 'imageText', 'gallery', 'people', 'ui', 'metrics', 'chart', 'architecture', 'mindMap', 'end',
];

export const PAGE_TYPE_LABEL: Record<PageType, string> = {
  cover: '封面',
  toc: '目录页',
  section: '转折页',
  text: '文字页',
  imageText: '图文页',
  gallery: '图片排版页',
  ui: '界面页',
  people: '人物页',
  metrics: '数字页',
  chart: '图表页',
  architecture: '架构图',
  mindMap: '思维导图',
  end: '封底',
};

/** 一句话说清这个页类型该长什么样，写提示词与推导缺失页类型时都要用 */
export const PAGE_TYPE_BRIEF: Record<PageType, string> = {
  cover: '整本的封面。标题与副标题之外通常还有一块主视觉（配图、插画、3D 元素或几何构成），视觉冲击最强',
  toc: '目录页。列出各章节标题与页码，条目之间要能一眼看出层级',
  section: '章节之间的转折页。通常有一个章节序号、章节名，以及一块起停顿作用的主视觉',
  text: '文字页。以正文或要点为主，一到两栏，没有配图或配图很小',
  imageText: '图文页。一到两张配图，**以文字为主**，图是辅助',
  gallery: '图片排版页。**多张图成组铺开、以图为主**，文字只作标题与题注',
  /*
    **这一条必须说清「设备由骨架提供」，不能只说「有一台设备」。**
    界面页的提示词是由这一句展开写的（`derivePrompts` 拿它当页类型说明），
    只写「画面里有一台 3D 设备」的话，模型会老老实实描述「机身层用 var(--surface)
    画一个圆角矩形、屏幕层内缩 32px」——那是**它自己画一台**，而真页面里
    设备是由版式骨架注入的（外壳转动图 + 屏幕的 matrix3d）。两样撞在一起，
    页面上就是两台设备叠着，或者模型把骨架里那台删掉。
  */
  ui: '界面页。画面里摆一台 3D 设备（手机 / 笔记本 / 显示器），屏幕里嵌着一张 App 界面截图，配标题与说明。'
    + '**设备本身不用你画、也不要描述怎么画**——它由版式骨架提供（机身图与屏幕的透视变换都在骨架里），'
    + '这一页的提示词只描述**文字怎么排、背景的光晕与毛玻璃怎么做**这类风格化的部分',
  people: '人物页。一到三位人物的透明底抠图，配名字、职位与一句话介绍。人像位是**竖向**的，人物脚下要落在同一条基线上，不要让人物悬在版面正中',
  metrics: '数字页。三个左右的指标数字，数字是主角，配一句说明',
  chart: '图表页。一个图表加一段结论，图表占主要面积',
  architecture: '架构图页。用分层或分区的方块画出系统组件与它们之间的连线，连线带箭头并标出关系；文字是块名与关系标签，不要写成普通正文页',
  mindMap: '思维导图页。中心一个主题节点向外发散若干分支，分支上再挂二级节点，用曲线或折线连接；文字是短词而不是整句。**中心主题节点必须与左右两列分支节点的垂直中线对齐**（在同一条水平线上），不要让它偏到分支列的上方或下方',
  end: '封底。收束全篇，通常只有一句结语与联系方式',
};

/**
 * 页类型 → 装饰件。**新链路**的页面用这张表决定叠哪一种装饰。
 *
 * 旧链路走的是「风格包里的页类型配方」，那张表是识别时从设计稿量出来的，
 * 每套风格可以不同；新链路只有 StyleDoc，没有配方，所以按页类型给一个固定的对应。
 *
 * **故意不是每类都有**：装饰件是「让同色板的不同页长得不一样」用的，
 * 图形页（架构图、思维导图）与图片排版页自己已经够满，再叠一层是添乱。
 * 表类型写全 `Record<PageType, ...>`，将来加页类型时漏了编译器会报。
 *
 * ## 装饰件只能锚在角落，不能横穿版面
 *
 * 这一条是 `text` 从 `rule` 改成 `none` 换来的教训。`rule` 画的是**一条横贯版面、
 * 固定在画布 30% 高处**的细线——那是给旧渲染器的固定版式配的：那边标题一定在 30% 之上、
 * 正文一定在之下，这条线正好当分隔。新链路里版式是模型自己写的，30% 落到哪儿全看它心情。
 *
 * 实测一本 30 页的书：9 张文字页里有 6 张这条线**压在正文上**——穿过卡片标题、穿过
 * 段落、穿过「01」这种序号。用户看到的就是「中间有一根莫名其妙的灰线，好几页都有」。
 *
 * 留下的三种（accent-bar 贴左上边、numbered-badge 右上角、dots 右下角）都锚在
 * **角落或页边**，不参与版面，所以不会撞上任何内容。
 * 以后再加装饰件，同样只许往边上放。
 *
 * **`cover` 从 `corner-block` 改成 `none` 是用户报出来的。** `corner-block` 画的是
 * 右下角一个大圆，底色取 `mix(bg, accent, .22)`——在浅色底上就是**白色掺两成红**，
 * 即一块 `rgb(246,209,215)` 的粉白雾。它铺在封面右下角的图片上，把图片连同上面的
 * 文字一起洗白，用户连报四次「白色光晕去掉」。
 * 它又叠在 iframe 之上（见 `pageMarkup`），改提示词、改页面 CSS 都碰不到它——
 * 所以前面几轮一直在错的层里找。
 */
export const DECORATION_BY_PAGE_TYPE: Record<PageType, RecipeDecoration> = {
  cover: 'none',
  toc: 'numbered-badge',
  section: 'accent-bar',
  text: 'none',
  imageText: 'none',
  gallery: 'none',
  ui: 'none',
  people: 'none',
  metrics: 'dots',
  chart: 'dots',
  architecture: 'none',
  mindMap: 'none',
  end: 'none',
};

/**
 * 一条页类型的提示词 + 样机。
 *
 * `mockHtml` 是**用 `prompt` 真跑一次**得到的 HTML 片段，不是另画的示意图。
 * 它有两个作用：库里的卡片要显示样机；以及生成真页面失败时作为回落，
 * 保证「这一页至少有东西」而不是空白。
 */
export const StylePagePrompt = z.object({
  pageType: PageType,
  /** 完整提示词，可直接发给模型 */
  prompt: z.string(),
  /** 样机 HTML 片段（渲染时填进 1920×1080 的容器） */
  mockHtml: z.string().default(''),
  /** 参考图里有这一页就读出来，没有就让模型推导 */
  source: z.enum(['reference', 'derived', 'manual']).default('derived'),
  /**
   * 这一页**绑定**的版式骨架 id（形如 `people/row-hex-team@v1`）。空串 = 没绑定。
   *
   * 与 `mockHtml` 是两件事：样机是「这一页长什么样」的示例，绑定是「以后生成这一页
   * 就按这一种版面排」。绑上之后生成走 `forcedLayoutBlock`（只给这一种、不给候选），
   * 所以样机与真页面是同一套骨架。
   *
   * **只记 id，不把骨架抄进提示词**：抄进去的话生成时那条自动候选块还会照常拼上来，
   * 两段互相打架；而且骨架改版、下架之后那份抄本也对不上了。id 由生成链路现查
   * （`resolveLayoutForPrompt`），查不到就退回自动候选，不会把这一页卡住。
   */
  layoutId: z.string().default(''),
  /** 样机生成时留下的非致命问题，界面上如实显示 */
  issues: z.array(LintIssue).default(() => []),
  /** 用户改过。重识别时不被覆盖 */
  edited: z.boolean().default(false),
});
export type StylePagePrompt = z.infer<typeof StylePagePrompt>;

/**
 * 风格配色。对应提示词 `:root` 里那几个变量，也用于库卡片上的色板条。
 *
 * 用语义名而不是 `brand500` 这种刻度名：新链路里颜色是被模型直接写进 CSS 的，
 * 不再经过「tokens → 组件」那一层，刻度名没有意义了。
 */
export const StylePalette = z.object({
  /** 页面底色 */
  bg: z.string(),
  /** 卡片、色块等浮在底色上的表面色 */
  surface: z.string(),
  /** 正文色 */
  text: z.string(),
  /** 次要文字色 */
  muted: z.string(),
  /** 强调色。标题里的重点、数字、装饰件 */
  accent: z.string(),
  /** 品牌色。与强调色常常是同一个，分开是为了有的稿子两者不同 */
  brand: z.string(),
  /** 分隔线、边框 */
  border: z.string(),
});
export type StylePalette = z.infer<typeof StylePalette>;

export const StyleDocMeta = z.object({
  builtin: z.boolean().default(false),
  reviewed: z.boolean().default(false),
  /** 用户改过。内置包被改过之后，启动时不再用代码里的真值覆盖它 */
  customized: z.boolean().default(false),
  createdAt: z.number().default(() => Date.now()),
  updatedAt: z.number().default(() => Date.now()),
});
export type StyleDocMeta = z.infer<typeof StyleDocMeta>;

/**
 * 正文的默认栈：**自带的无衬线排在最前**。
 *
 * `Montserrat` 是随仓库分发的那一份（见 `html-doc.ts` 的 `BUNDLED_FACES`）。
 * 放在最前是**这一版的重点**：以前这一串全是系统字体名，同一个产品在 mac 与 Windows
 * 上排出来不一样，而英文的「高级不高级」全在字形上。自带一份之后落点是确定的。
 *
 * 后面那串系统字体负责**中文**——Montserrat 一个汉字都没有，中文会顺着往下落到
 * `PingFang SC` / `Microsoft YaHei`。所以这一串不能删，删了中文就没字体了。
 */
export const DEFAULT_FONT_SANS = 'Montserrat, system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif';

/**
 * 展示字体的默认栈：**衬线优先**。
 *
 * 参考图里的大标题大量用宋体/衬线做「杂志感」，正文才是黑体。只给一个字体栈时
 * 这个对比表达不出来——识别出来的骨架里有 13 处自己写了 `Georgia,serif`，
 * 因为模型确实需要一个衬线字体，而系统一个都不给。
 *
 * 现在自带了一份 `Cormorant Garamond`，排在最前。后面几个中文宋体仍然留着：
 * 这套字体没有汉字，**中文大标题得靠它们接手**——在 Windows 上那几个名字都装不到，
 * 会继续往后落到 `Georgia`（也没有汉字）再到通用 `serif`，由系统的字体回退兜底。
 */
export const DEFAULT_FONT_DISPLAY = '"Cormorant Garamond","Songti SC","STSong","Noto Serif SC",Georgia,"Times New Roman",serif';

/**
 * 手写体的默认栈。
 *
 * 参考图里的签名、引言、装饰小字常常是手写体。**`cursive` 只当最后兜底**：
 * 这个通用族在 Windows 上会落到 Comic Sans，很难看，所以先把几个系统自带的手写体列出来
 * （Windows 有前两个，macOS 有后两个）。
 *
 * **这一档没有自带字体**：手写体只在签名、引言这类装饰处出现（图文排版那 41 份里
 * 只有 9 份用到），为它再带一份字体不划算。`Segoe Script` 在 Windows 上都有。
 *
 * 值来自 `font-choices.ts`，**不是在这里另写一份**：两处各写一份的话，
 * `fontIdOfStack` 会因为一个字不一样而认不出，表现是「八套风格的手写体全是未指定」。
 */
export const DEFAULT_FONT_SCRIPT = SYSTEM_SCRIPT_STACK;

export const StyleDoc = z.object({
  styleId: z.string().min(1),
  version: z.string().default('1.0'),
  name: z.string().min(1),
  description: z.string().default(''),
  theme: z.enum(['light', 'dark']).default('light'),
  palette: StylePalette,
  /** 字体栈。只用自带字体 + 系统字体，不外链（提示词的「代码要求」里也这么要求模型） */
  fontFamily: z.string().default(DEFAULT_FONT_SANS),
  /**
   * 展示字体栈：大标题、衬线标题用。**空串表示「不单设，跟正文一套」**。
   *
   * 与 `fontFamily` 是**两个角色**，不是两个备选：一套风格可以正文黑体、标题宋体。
   * 页面里分别取 `var(--font-sans)` 与 `var(--font-display)`，都注入在 `:root` 上。
   */
  fontDisplay: z.string().default(DEFAULT_FONT_DISPLAY),
  /** 手写体栈：签名、引言、装饰性小字用。空串表示「跟展示字体一套」 */
  fontScript: z.string().default(DEFAULT_FONT_SCRIPT),
  /**
   * 数字栈：指标值、大号序号、页码用。**空串表示「跟展示字体一套」**。
   *
   * 与另外三档不同，它有个第二落点：提炼出视觉规范之后，用户在界面上点选的那一档
   * 存在 `spec.fonts.numeric` 里，优先级更高（见 `fontStacksOf`）。
   * 这一份是**识别阶段从参考图里读出来的**——那时还没有规范，得有地方放。
   */
  fontNumeric: z.string().default(''),
  /** 每个页类型一条。键必须是合法的页类型 */
  pagePrompts: z.record(z.string(), StylePagePrompt).default(() => ({})),
  /** 整本的创作指令：这套风格在内容组织上的讲究，生成大纲与逐页时都要注入 */
  deckPrompt: z.string().default(''),
  /**
   * 视觉规范：跨页应当统一的那些系统性细节（标题层级、角标、页脚、边距、圆角、装饰语言）。
   *
   * `null` 表示还没提炼过——识别是逐页写的，没有这一层时各页各写各的，
   * 单独看都成立、一张张翻过去就散了。提炼与统一走「一键统一风格」那条链路。
   */
  spec: StyleSpec.nullable().default(null),
  meta: StyleDocMeta.default(() => StyleDocMeta.parse({})),
});
export type StyleDoc = z.infer<typeof StyleDoc>;

/**
 * 四个字体角色。`fontFamily` 必有，另外三个空了就落回上一个角色
 * （与 `html-doc.ts` 的 `fontVars` 是同一套回落）。
 *
 * 字段名**故意与 `PageDocumentOptions` 对齐**：这样一个 `fontStacksOf(doc)` 既能直接
 * 摊进 `buildPageDocument` 的选项，也能喂给写提示词的 `fontBlock`，不必维护两份映射。
 */
export interface FontStacks {
  fontFamily: string;
  fontDisplay?: string | undefined;
  fontScript?: string | undefined;
  /** 数字：指标值、大号序号。空串表示跟展示字体一套 */
  fontNumeric?: string | undefined;
}

/**
 * 从风格里取出四个字体角色。页面渲染与写提示词两处都要，取法必须一致。
 *
 * ## 规范里点了名就以规范为准
 *
 * `spec.fonts` 存的是字体 id（见 `font-choices.ts`），是用户在界面上**一键切换**的结果；
 * `doc.fontFamily` 那三套栈是识别阶段定下的。两者冲突时以规范为准——用户刚点的那一下
 * 必须立刻生效，否则界面显示「已切到衬线」而画布纹丝不动。
 *
 * 数字那一档的优先级是三级：**界面上点选的**（`spec.fonts.numeric`）> **识别时从参考图
 * 读出来的**（`doc.fontNumeric`）> 跟展示字体一套。前两档与另外三个角色是同一种关系，
 * 只是它多了一档——因为识别阶段还没有规范，得先有个地方存。
 *
 * `spec` 与 `fontNumeric` 都是**可选**参数，不是漏写：好些调用点（工作台里几个面板）
 * 手里只有调色板与字体，拿不到整份风格。它们照样能用，只是不参与这一层覆盖。
 */
export function fontStacksOf(
  doc: Pick<StyleDoc, 'fontFamily' | 'fontDisplay' | 'fontScript'> & {
    spec?: StyleSpec | null;
    fontNumeric?: string | null;
  },
): FontStacks {
  const picked = doc.spec?.fonts;
  const fontDisplay = fontStackOf(picked?.display) || doc.fontDisplay;
  return {
    fontFamily: fontStackOf(picked?.body) || doc.fontFamily,
    fontDisplay,
    fontScript: fontStackOf(picked?.script) || doc.fontScript,
    fontNumeric: fontStackOf(picked?.numeric) || doc.fontNumeric || fontDisplay,
  };
}

/** 'family@version' 形式的引用，与旧风格包保持一致，项目表里存的就是它 */
export function styleRef(doc: Pick<StyleDoc, 'styleId' | 'version'>): string {
  return `${doc.styleId}@${doc.version}`;
}

/**
 * 列表项。
 *
 * **不带全部样机 HTML**：一页样机 3~8KB，九个页类型就是几十 KB，
 * 一屏二十张卡片全带上会让列表接口变成几百 KB。卡片只要前几张做预览，
 * 要看全部时按 id 取单条。
 */
export const StyleDocSummary = z.object({
  styleId: z.string(),
  version: z.string(),
  name: z.string(),
  description: z.string().default(''),
  theme: z.enum(['light', 'dark']),
  palette: StylePalette,
  fontFamily: z.string().default(''),
  /** 与 `fontFamily` 同属三个字体角色。卡片要渲染样机，少一个就与详情页长得不一样 */
  fontDisplay: z.string().default(''),
  fontScript: z.string().default(''),
  /**
   * 第四个角色：识别时从参考图里读出来的数字字体栈。**空串是常态**——
   * 识别没读出数字那一档，或者规范里已经点了名（`spec.fonts.numeric` 优先）。
   */
  fontNumeric: z.string().default(''),
  /**
   * 视觉规范。**卡片也要带上**：四个字体角色的选择在 `spec.fonts` 里，
   * `fontStacksOf` 拿它盖过上面那三套栈。不带的话，用户在详情页切了字体、
   * 卡片上还是旧字体——同一套风格在列表与详情里长得不一样。
   *
   * 整份规范不到 1KB，与 `previewHtml` 那几十 KB 比可以忽略。
   */
  spec: StyleSpec.nullable().default(null),
  /** 这套风格覆盖了哪几个页类型 */
  pageTypes: z.array(PageType).default(() => []),
  /** 有几个页类型已经出了样机 */
  mockedCount: z.number().default(0),
  /** 卡片上的预览样机，只带前几张 */
  previewHtml: z.array(z.string()).default(() => []),
  builtin: z.boolean().default(false),
  reviewed: z.boolean().default(false),
  customized: z.boolean().default(false),
  updatedAt: z.number(),
});
export type StyleDocSummary = z.infer<typeof StyleDocSummary>;

/** 取某个页类型的提示词。没写过这一页返回 null，调用方要显式处理 */
export function pagePromptOf(doc: StyleDoc, pageType: PageType): StylePagePrompt | null {
  const found = doc.pagePrompts[pageType];
  if (!found) return null;
  return found.pageType === pageType ? found : { ...found, pageType };
}

/** 这套风格覆盖了哪些页类型，按推荐顺序 */
export function coveredPageTypes(doc: StyleDoc): PageType[] {
  return PAGE_TYPE_ORDER.filter((t) => Boolean(doc.pagePrompts[t]));
}

/** 还缺哪些页类型——推导缺失页类型时要按这个列表来 */
export function missingPageTypes(doc: StyleDoc): PageType[] {
  return PAGE_TYPE_ORDER.filter((t) => !doc.pagePrompts[t]);
}

export interface PromptIssue {
  rule: string;
  message: string;
}

/**
 * 提示词的结构校验。
 *
 * 四段标题一个都不能少、顺序不能变：下游是把提示词**原样**发给模型的，
 * 少了「代码要求」那段，生成出来的 HTML 就不会用 `:root` 变量，
 * 换主题时整套风格散架；少了「角色」那段，模型会按通用网页的写法来，
 * 而不是按海报排版的写法。
 *
 * 这里只查结构，不查内容好坏——「这条提示词写得够不够具体」是模型的事，
 * 用规则去判它只会误伤。
 */
export function lintStylePrompt(prompt: string): PromptIssue[] {
  const issues: PromptIssue[] = [];
  if (prompt.trim().length === 0) {
    issues.push({ rule: 'prompt/empty', message: '提示词为空' });
    return issues;
  }

  let cursor = -1;
  for (const section of PROMPT_SECTIONS) {
    const at = prompt.indexOf(section);
    if (at < 0) {
      issues.push({ rule: 'prompt/missing-section', message: `缺少「${section}」这一段` });
      continue;
    }
    if (at < cursor) {
      issues.push({ rule: 'prompt/section-order', message: `「${section}」的次序不对` });
    }
    cursor = at;
  }

  // 图片位必须用占位属性而不是写死 src，否则这条提示词换不了图
  if (/<img\b[^>]*\bsrc\s*=/i.test(prompt)) {
    issues.push({
      rule: 'prompt/hardcoded-img-src',
      message: `提示词里写死了 img 的 src。图片位要写成 <img ${IMAGE_SLOT_ATTR}="1">，不写 src，渲染时才填图`,
    });
  }

  return issues;
}

/** 提示词是否可用（结构完整） */
export function isPromptUsable(prompt: string): boolean {
  return lintStylePrompt(prompt).length === 0;
}
