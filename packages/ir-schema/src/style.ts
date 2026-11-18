import { z } from 'zod';
import { MotionName, PageType, AvatarMode } from './page.js';

/** 风格族与人群映射（PRD §5.2） */
export const StyleFamily = z.enum([
  'business-classic', // 商务经典 · 老板、高管
  'academic-rigor',   // 学术严谨 · 学者、研究人员
  'tech-minimal',     // 科技极简 · 技术总监、架构师
  'brand-design',     // 品牌设计 · 品牌/设计负责人
  'friendly-premium', // 可爱/宠物/电商 · 特定行业与个人品牌
  // 下面四族对应四套成熟的创作指令模板（见 builtin/directives.ts）。
  // 它们与上面五族的差别不在「更好看」，而在**内容怎么组织**：
  // 瑞士极简要求一页一结论，咨询报告要求金字塔结构与 MECE，
  // 学术组会要求不得编造材料外的数据。这些是写作规矩，逐页说明管不到
  'swiss-minimal',      // 瑞士极简 · 商务汇报、季度复盘
  'editorial-magazine', // 杂志创意 · 品牌提案、作品集
  'academic-report',    // 学术组会 · 论文答辩、课程展示
  'consulting-report',  // 咨询报告 · 行研、战略分析
]);
export type StyleFamily = z.infer<typeof StyleFamily>;

/** 风格包内的一套完整色板。各风格族可不同，但都必须满足品质基线。 */
export const StyleTokens = z.object({
  brand500: z.string(),
  brand600: z.string(),
  brand100: z.string(),
  accent500: z.string(),
  accent100: z.string(),
  neutral900: z.string(),
  neutral700: z.string(),
  neutral500: z.string(),
  neutral300: z.string(),
  neutral100: z.string(),
  neutral0: z.string(),
  success: z.string().default('#22A06B'),
  warning: z.string().default('#F5A524'),
  error: z.string().default('#E5484D'),
  info: z.string().default('#3B82F6'),
});
export type StyleTokens = z.infer<typeof StyleTokens>;
/** 语义色有默认值，构造风格包时可不填 */
export type StyleTokensInput = z.input<typeof StyleTokens>;

export const TypographyRoleName = z.enum([
  'display', 'title', 'subtitle', 'body', 'caption', 'metric', 'mono',
]);
export type TypographyRoleName = z.infer<typeof TypographyRoleName>;

/** 字体角色：字号必须落在 12/14/16/20/24/32/40/56 阶梯内（设计 Lint 校验） */
export const TypographyRole = z.object({
  role: TypographyRoleName,
  /** CSS font-family 栈 */
  family: z.string(),
  sizePx: z.number().int(),
  weight: z.number().int(),
  lineHeight: z.number(),
  letterSpacing: z.number().default(0),
});
export type TypographyRole = z.infer<typeof TypographyRole>;

export const FontPair = z.object({
  heading: z.string(),
  body: z.string(),
  numeric: z.string(),
});
export type FontPair = z.infer<typeof FontPair>;

/** 标题 composition 模板。每风格 6–12 个，生成时只允许从中选择，禁止临场拼凑。 */
export const TitleComposition = z.enum([
  'left-aligned', 'centered', 'split', 'stacked', 'overlay', 'numbered', 'banner', 'minimal',
]);
export type TitleComposition = z.infer<typeof TitleComposition>;

export const TitleTemplate = z.object({
  id: z.string(),
  name: z.string(),
  composition: TitleComposition,
  eyebrowStyle: z.enum(['none', 'caps', 'accent-bar', 'dotted']).default('none'),
  accentUsage: z.enum(['none', 'word', 'underline', 'block']).default('word'),
  maxTitleChars: z.number().int(),
  maxTitleLines: z.number().int(),
  slots: z.array(z.enum(['eyebrow', 'main', 'accentWords', 'sub']))
    .default((): ('eyebrow' | 'main' | 'accentWords' | 'sub')[] => ['eyebrow', 'main', 'sub']),
});
export type TitleTemplate = z.infer<typeof TitleTemplate>;

/** 版式骨架的种类。渲染引擎按它分发到对应的排布分支 */
export const LayoutKind = z.enum([
  'centered', 'left-stack', 'two-column', 'media-left', 'media-right', 'overlay',
  'grid-2', 'grid-3', 'grid-4', 'numbered', 'minimal', 'banner',
  'chart-full', 'chart-split', 'hero-metric', 'cards-3', 'cards-4',
  'toc-list', 'toc-grid',
]);
export type LayoutKind = z.infer<typeof LayoutKind>;

/**
 * 内容带：识别时从设计稿上量出来的一条横向内容区，相对画布的比例。
 *
 * 有了它，渲染层就能按原稿的百分比排布，而不是套用 19 个固定骨架之一。
 * 只带渲染真正用得上的字段——行数、墨密度那些是量测过程的中间量，不必进包。
 */
export const BandSpec = z.object({
  role: z.enum(['eyebrow', 'title', 'subtitle', 'body', 'visual', 'metrics', 'footer', 'unknown']),
  topRatio: z.number(),
  heightRatio: z.number(),
  leftRatio: z.number(),
  widthRatio: z.number(),
  columns: z.number().int().default(1),
  align: z.enum(['left', 'center', 'n/a']).default('left'),
  /** 在网格里的栏位（从 1 起）。渲染时按它落栏，而不是按百分比硬凑 */
  colStart: z.number().int().default(1),
  colSpan: z.number().int().default(1),
  /** 在基线网格里的行位（以基线为单位，从内容框顶算起） */
  rowStart: z.number().int().default(0),
  rowSpan: z.number().int().default(1),
});
export type BandSpec = z.infer<typeof BandSpec>;

/**
 * 版式网格。
 *
 * 一套风格一套网格：栏数、栏距、基线节奏、页边距。识别时从设计稿上量出来，
 * 渲染时按它落位，生成时作为「HTML 规格」写进提示词。
 *
 * 之所以要把它显式量出来而不是让每个横带各排各的：网格是「高级排版」的共同底子——
 * 跨页对齐、栏与栏之间的呼吸感都来自它。只按百分比硬凑，每一页都是孤立的，
 * 换个内容量就散了。
 */
export const LayoutGrid = z.object({
  columns: z.number().int().min(1).max(12).default(12),
  /** 栏间距，画布像素 */
  gutter: z.number().default(24),
  /** 基线节奏，画布像素 */
  baseline: z.number().default(8),
  /** 左右边距占画布宽的比例 */
  marginX: z.number().default(0.05),
  /** 上下边距占画布高的比例 */
  marginY: z.number().default(0.05),
});
export type LayoutGrid = z.infer<typeof LayoutGrid>;

/**
 * 版式几何：这一类页面怎么排。
 *
 * 与容量（maxTitleChars 那几个）放在同一个对象上，是因为两者必须同步——
 * 溢出适配与 lint 都只认容量数字、不看像素，几何改了而容量没跟上，
 * 两边会一起说谎：页面已经装不下，系统却认为一切正常。
 *
 * 缺省用 optional 而不是给默认值：库里已有的风格包没有这一项，
 * 给默认值会让它们全部渲染成 left-stack。缺失时由 style-engine 的
 * geometryFor() 按 variant id 回落到规范表。
 */
export const VariantGeometry = z.object({
  kind: LayoutKind,
  /** 标题水平对齐 */
  align: z.enum(['left', 'center']).default('left'),
  /** 标题字号相对 title 角色的档位偏移（0 = 标准，1 = 升一档） */
  titleStep: z.number().int().default(0),
  /** 副标题是否显示在标题正下方（false 时随正文区） */
  subUnderTitle: z.boolean().default(true),
  /** 内容区与标题区的间距，画布比例 */
  gapRatio: z.number().default(0.06),
  /** 媒体区占比（0–1），仅 media-* / overlay / chart-split 用 */
  mediaRatio: z.number().default(0.46),
  /** 是否需要图片 */
  needsMedia: z.boolean().default(false),
  captionPlacement: z.enum(['below', 'overlay', 'none']).default('below'),
  /**
   * 从设计稿量出来的横带结构。非空时渲染层走「按横带排布」这条路径，
   * 而不是套 kind 对应的固定骨架。
   */
  bands: z.array(BandSpec).optional(),
});
export type VariantGeometry = z.infer<typeof VariantGeometry>;

/** 版式变体容量模型：填充前据此计算 contentLoad（PRD §5.4） */
export const LayoutVariantSpec = z.object({
  /** 形如 'imageText/left-right@v1' */
  id: z.string(),
  pageType: PageType,
  maxTitleChars: z.number().int(),
  maxTitleLines: z.number().int(),
  maxBodyChars: z.number().int(),
  maxBlocks: z.number().int(),
  maxBullets: z.number().int(),
  maxMetrics: z.number().int(),
  /** 允许的图片比例，如 ['16:9','4:3'] */
  imageRatios: z.array(z.string()).default(() => []),
  /** 允许的图片数量，如 [1,2,3,4] */
  imageCounts: z.array(z.number().int()).default(() => []),
  columns: z.number().int().default(12),
  /** 这一类页面怎么排。缺失时由 style-engine 的 geometryFor() 按 id 回落 */
  geometry: VariantGeometry.optional(),
});
export type LayoutVariantSpec = z.infer<typeof LayoutVariantSpec>;

/** 数字人组件样式，纳入风格包（PRD §5.13） */
export const AvatarComponentStyle = z.object({
  pip: z.object({
    border: z.string().default('none'),
    shadow: z.string().default('md'),
    background: z.string().default('var(--surface-0)'),
  }),
  fullscreen: z.object({
    background: z.string().default('var(--surface-0)'),
    pptOpacity: z.number().min(0).max(1).default(0.18),
    transitionMs: z.number().int().default(250),
  }),
});
export type AvatarComponentStyle = z.infer<typeof AvatarComponentStyle>;

/** 讲解光标组件样式（PRD §5.14） */
export const CursorComponentStyle = z.object({
  shape: z.enum(['dot', 'halo', 'arrow', 'laser']).default('halo'),
  color: z.string().default('var(--accent-500)'),
  /** 透明度 40%–60% 可调 */
  opacity: z.number().min(0.4).max(0.6).default(0.5),
  size: z.number().int().default(48),
  pulseMs: z.number().int().default(1200),
  /** 段间移动缓动 300–500ms */
  moveEaseMs: z.number().int().min(300).max(500).default(400),
});
export type CursorComponentStyle = z.infer<typeof CursorComponentStyle>;

/** 品质基线规则，所有风格共享（PRD §3.1） */
export const StyleRules = z.object({
  maxHueFamilies: z.number().int().default(4),
  maxAccentAreaRatio: z.number().default(0.10),
  maxBullets: z.number().int().default(5),
  minFontSize: z.number().int().default(12),
  marginRatio: z.number().default(0.05),
});
export type StyleRules = z.infer<typeof StyleRules>;

/* ---------------- 设计语言 ---------------- */

/**
 * 设计语言：把「风格」从一块色板撑成一套可执行的设计规范。
 *
 * 一条硬规矩：**能驱动渲染的字段才进这里**。每个数值与枚举都必须有渲染落点，
 * 否则它会退化成没人读的文档，然后腐烂。纯说明文字单独放 `guidance`，
 * 而且会被注入生成提示词——让「说明」真的影响产出，而不是挂在界面上给人看。
 *
 * 整块默认空对象，老风格包不填也能 parse；缺省值由 style-engine 的
 * deriveLanguage() 从 tokens/typography/rules/layouts 反推。
 */

/** 页面底纹 */
export const RecipeBackground = z.enum(['plain', 'tinted', 'gradient', 'image-overlay', 'grid']);
/** 页面装饰件 */
export const RecipeDecoration = z.enum(['none', 'accent-bar', 'corner-block', 'numbered-badge', 'rule', 'dots']);
export type RecipeDecoration = z.infer<typeof RecipeDecoration>;
/** 疏密：折算成版式 gapRatio 的乘子 */
export const RecipeSpacing = z.enum(['tight', 'normal', 'airy']);
export type RecipeSpacing = z.infer<typeof RecipeSpacing>;

export const SPACING_MULTIPLIER: Record<z.infer<typeof RecipeSpacing>, number> = {
  tight: 0.75, normal: 1, airy: 1.35,
};

/** 页面配方：这类页面怎么排。封面与封底靠它立住，目录页靠它成形 */
export const PageRecipe = z.object({
  pageType: PageType,
  background: RecipeBackground.default('plain'),
  decoration: RecipeDecoration.default('none'),
  spacing: RecipeSpacing.default('normal'),
  /** 这页必须有哪些内容槽位，缺了就是不合格的页面 */
  requiredSlots: z.array(z.string()).default(() => []),
  optionalSlots: z.array(z.string()).default(() => []),
  /**
   * 这类页面配图的生成提示词。
   *
   * 像素量不出「这一页该配什么图」——那是对画面的语义理解。识别时由看图模型
   * 从参考稿读出来，生成页面时直接用它，而不是套一句通用的占位话术。
   */
  imagePrompt: z.string().default(''),
});
export type PageRecipe = z.infer<typeof PageRecipe>;

/** 圆角体系 */
export const GuiRadius = z.object({
  control: z.number().default(8),
  card: z.number().default(12),
  inner: z.number().default(6),
  pill: z.number().default(999),
});

export const GuiBorder = z.object({
  width: z.number().default(1),
  /** CSS 颜色或 var()，如 'var(--neutral-300)' */
  color: z.string().default('var(--neutral-300)'),
  style: z.enum(['solid', 'none', 'subtle']).default('solid'),
});

/** 卡片容器：内边距、表面处理、内部间距 */
const GuiCardSpec = z.object({
  padding: z.string().default('28px 26px'),
  surface: z.enum(['flat', 'tinted', 'glass', 'outlined']).default('outlined'),
  gap: z.number().default(12),
});

/** 列表行：标记形状、大小、颜色来源、行间距 */
const GuiListRowSpec = z.object({
  marker: z.enum(['square', 'dot', 'dash', 'number', 'check', 'none']).default('square'),
  markerSize: z.number().default(8),
  markerColor: z.enum(['brand', 'accent', 'text']).default('brand'),
  gap: z.number().default(16),
});

/** 徽标/胶囊 */
const GuiBadgeSpec = z.object({
  tone: z.enum(['soft', 'solid', 'outline']).default('soft'),
  radius: z.number().default(999),
  size: z.number().default(12),
});

/** 眉标排印 */
const GuiEyebrowSpec = z.object({
  letterSpacingEm: z.number().default(0.12),
  transform: z.enum(['none', 'uppercase']).default('none'),
});

/** GUI 组件规格。渲染层一律从这里取，不再硬编码 */
export const GuiSpec = z.object({
  radius: GuiRadius.default(() => GuiRadius.parse({})),
  border: GuiBorder.default(() => GuiBorder.parse({})),
  shadow: z.enum(['none', 'sm', 'md', 'lg']).default('sm'),
  card: GuiCardSpec.default(() => GuiCardSpec.parse({})),
  listRow: GuiListRowSpec.default(() => GuiListRowSpec.parse({})),
  badge: GuiBadgeSpec.default(() => GuiBadgeSpec.parse({})),
  divider: z.enum(['none', 'hairline', 'dashed', 'accent']).default('hairline'),
  eyebrow: GuiEyebrowSpec.default(() => GuiEyebrowSpec.parse({})),
});
export type GuiSpec = z.infer<typeof GuiSpec>;

/** 图标规范。驱动 IconTile：图标怎么画、装不装容器 */
export const IconSpec = z.object({
  style: z.enum(['line', 'solid', 'duotone']).default('line'),
  strokeWidth: z.number().default(1.5),
  size: z.number().default(28),
  container: z.enum(['none', 'circle', 'squircle', 'square']).default('none'),
  containerTone: z.enum(['brand-soft', 'accent-soft', 'outline', 'none']).default('none'),
});
export type IconSpec = z.infer<typeof IconSpec>;

/**
 * 图表规范。驱动 ECharts option 的网格、轴、柱形圆角、强调方式。
 *
 * **这份定义与 `@lumen/charts` 的 `ChartUsageSpec` 是手抄的两份**（跨包不能互相
 * import：charts 依赖本包）。加字段时两边都要改，`charts.test.ts` 里有一条
 * 「字段集合相等」的用例钉住这件事——那份断言就是为这里存在的。
 *
 * 后 7 个字段是「图表视觉风格」那一层加的，**默认值一律取加它们之前的行为**：
 * 九套内置风格包（`style-engine/src/language.ts`）与旧渲染链路一个字都不用改。
 */
export const ChartUsage = z.object({
  palette: z.enum(['brand-first', 'categorical', 'mono-ramp']).default('brand-first'),
  gridLines: z.boolean().default(true),
  axisTone: z.enum(['muted', 'text']).default('muted'),
  barRadius: z.number().default(0),
  lineWidth: z.number().default(2),
  areaFill: z.boolean().default(false),
  emphasis: z.enum(['none', 'primary-series', 'max-bar', 'focus-max']).default('none'),
  /** 网格线的深浅。`faint` 是仪表盘那套用的极淡一档 */
  gridTone: z.enum(['normal', 'faint']).default('normal'),
  /** 画不画轴线。仪表盘那套不画轴线也不画刻度，只剩横向网格 */
  axisLine: z.boolean().default(true),
  /** 面积图用垂直渐变（顶部有色、底部透明）而不是平铺一块半透明色 */
  areaGradient: z.boolean().default(false),
  /** 折线/面积的数据点上画实心圆点 */
  lineMarkers: z.boolean().default(false),
  /** 环图扇区的端点是否圆头 */
  donutCap: z.enum(['butt', 'round']).default('butt'),
  /** 柱顶标数值 */
  barLabels: z.boolean().default(false),
  /** 画一条水平虚线标出均值，并在左端挂一个深色药丸标签 */
  averageLine: z.boolean().default(false),
});
export type ChartUsage = z.infer<typeof ChartUsage>;

/** 压字遮罩：图片上叠一层渐变，保证标题可读 */
const ScrimSpec = z.object({
  enabled: z.boolean().default(false),
  gradient: z.string().default('linear-gradient(180deg, rgba(0,0,0,.10), rgba(0,0,0,.62))'),
});

/** 图片规范。驱动 ImageSlot 的圆角、裁切、压字遮罩、题注位置 */
export const ImagerySpec = z.object({
  treatment: z.enum(['plain', 'rounded', 'framed', 'full-bleed', 'duotone']).default('rounded'),
  radius: z.number().default(12),
  aspect: z.array(z.string()).default(() => ['16:9', '4:3']),
  scrim: ScrimSpec.default(() => ScrimSpec.parse({})),
  captionPlacement: z.enum(['below', 'overlay', 'none']).default('below'),
});
export type ImagerySpec = z.infer<typeof ImagerySpec>;

/**
 * 使用说明。给人读，也**注入生成提示词**——所以它不是装饰，
 * 写在这里的规则会实际改变模型产出的内容。
 *
 * 分两层：上面 8 个按页类型给「这一页怎么写」，下面几个是**整篇的创作指令**——
 * 核心任务、版式与配色约束、明确不要什么、以及交付前的自检清单。
 * 后者是从「万能高级感 PPT 指令模板」那类实践中固化下来的：
 * 它们管的是全局一致性，逐页说明管不到。
 */
export const DesignGuidance = z.object({
  cover: z.string().default(''),
  section: z.string().default(''),
  toc: z.string().default(''),
  text: z.string().default(''),
  imageText: z.string().default(''),
  chart: z.string().default(''),
  metrics: z.string().default(''),
  end: z.string().default(''),
  icon: z.string().default(''),
  chartUse: z.string().default(''),
  imageUse: z.string().default(''),

  /** 核心任务与内容要求：这份稿子是给谁看的、要达成什么、内容上守什么规矩 */
  brief: z.string().default(''),
  /** 版式约束：栅格、标题占比、对齐方式、关键数据怎么处理 */
  layoutRules: z.string().default(''),
  /** 配色约束：主色几个、能不能用渐变、强调怎么用 */
  colorRules: z.string().default(''),
  /**
   * 明确**不要**什么。
   *
   * 实测「告诉模型不要什么」比「要什么」有效得多：不加这一条，
   * 它很容易掏出渐变、光效、粒子、3D 图表那一套，一眼就是模板味。
   */
  avoid: z.array(z.string()).default(() => []),
  /** 交付前逐条自检的清单。也给用户当验收标准用 */
  checklist: z.array(z.string()).default(() => []),
});
export type DesignGuidance = z.infer<typeof DesignGuidance>;

export const DesignLanguage = z.object({
  version: z.string().default('1.0'),
  /**
   * 这套设计语言的底色是深是浅。
   *
   * 这是**设计语言本身的事实**，不是渲染期的偏好：从深色设计稿识别出来的风格，
   * 渲染时就该是深色的。以前深色只由渲染调用方指定，导致深色参考图识别出来的包
   * 预览成浅色稿——量得再准，用户看到的也不是那张稿子。
   */
  theme: z.enum(['light', 'dark']).default('light'),
  pageRecipes: z.array(PageRecipe).default(() => []),
  /** 版式网格。老包不填也能 parse，缺省由 deriveLanguage() 从边距反推 */
  grid: LayoutGrid.default(() => LayoutGrid.parse({})),
  gui: GuiSpec.default(() => GuiSpec.parse({})),
  iconography: IconSpec.default(() => IconSpec.parse({})),
  chart: ChartUsage.default(() => ChartUsage.parse({})),
  imagery: ImagerySpec.default(() => ImagerySpec.parse({})),
  guidance: DesignGuidance.default(() => DesignGuidance.parse({})),
});
export type DesignLanguage = z.infer<typeof DesignLanguage>;

/** 取某页类型的配方；没配就按页类型给一份保守默认 */
export function recipeFor(language: DesignLanguage, pageType: PageType): PageRecipe {
  return language.pageRecipes.find((r) => r.pageType === pageType) ?? PageRecipe.parse({ pageType });
}

/** 风格包五层结构（PRD §5.2 / §6） */
export const StylePack = z.object({
  styleId: z.string(),
  family: StyleFamily,
  /** 形如 '1.2' */
  version: z.string().regex(/^\d+\.\d+(\.\d+)?$/),
  name: z.string(),
  description: z.string().default(''),
  audienceFit: z.array(z.enum(['executive', 'scholar', 'founder', 'tech-lead', 'brand', 'general'])).default(() => []),
  toneKeywords: z.array(z.string()).default(() => []),
  base: z.object({
    tokens: StyleTokens,
    typography: z.object({
      roles: z.array(TypographyRole),
      pairs: z.array(FontPair).default(() => []),
    }),
    titleGrammar: z.object({
      templates: z.array(TitleTemplate),
    }),
    layouts: z.array(LayoutVariantSpec),
    components: z.object({
      avatar: AvatarComponentStyle,
      cursor: CursorComponentStyle,
    }),
    /** 设计语言。老包不填也能 parse，缺省值由 deriveLanguage() 反推 */
    language: DesignLanguage.default(() => DesignLanguage.parse({})),
    rules: StyleRules.default(() => ({
      maxHueFamilies: 4, maxAccentAreaRatio: 0.10, maxBullets: 5,
      minFontSize: 12, marginRatio: 0.05,
    })),
    motionWhitelist: z.array(MotionName),
  }),
  variants: z.record(z.unknown()).default(() => ({})),
  overrides: z.record(z.unknown()).default(() => ({})),
  examples: z.array(z.string()).default(() => []),
  /** 版本化元信息 */
  meta: z.object({
    builtin: z.boolean().default(false),
    reviewed: z.boolean().default(false),
    createdAt: z.number().int().default(0),
    updatedAt: z.number().int().default(0),
  }).default(() => ({ builtin: false, reviewed: false, createdAt: 0, updatedAt: 0 })),
});
export type StylePack = z.infer<typeof StylePack>;

/** 'family@version' 形式的风格标识 */
export const StyleRef = z.string().regex(/^[a-z0-9-]+@\d+\.\d+(\.\d+)?$/);
export type StyleRef = z.infer<typeof StyleRef>;

/** 风格识别结果：风格包 + 置信度 + 待确认项（PRD §5.2） */
export const RecognizeSource = z.enum(['url', 'images', 'text']);
export type RecognizeSource = z.infer<typeof RecognizeSource>;

export const PendingConfirmItem = z.object({
  field: z.string(),
  question: z.string(),
  candidates: z.array(z.string()).default(() => []),
  resolved: z.string().default(''),
});
export type PendingConfirmItem = z.infer<typeof PendingConfirmItem>;

/**
 * 从一张设计稿上量出来的一页。
 *
 * 只带渲染与容量反推真正用得上的字段：量测过程中的中间量（墨密度、连通块、
 * 噪声底）留在 style-engine 里，不进包也不出接口。
 *
 * 它同时是「识别结果 → 界面」的载体：界面上要拿原图与重绘的样机并排给用户看，
 * 并且允许用户改这一页属于哪一类页——改完要能在**客户端**重新推一遍版式，
 * 所以这一份数据必须完整到够用。
 */
/**
 * 看图模型对一页的读解。
 *
 * 这些东西**像素量不出来**：字体族、字号（像素只能从行距反推一个粗略值）、
 * 版式的语义、以及这一页该配什么图。所以由看图模型读出来，与像素测量并排存在，
 * 各管各的那一半——色彩与几何以像素为准，语义与排印以模型为准。
 */
export const PageTypeRead = z.object({
  role: TypographyRoleName,
  /** 这一行实际显示的文字，界面上拿它让用户核对字号对不对 */
  sample: z.string().default(''),
  /** 最接近的字体族 */
  family: z.string().default(''),
  serif: z.boolean().default(false),
  /** 折算到 1920×1080 画布上的字号 */
  sizePx: z.number().default(0),
  weight: z.number().default(400),
  letterSpacingEm: z.number().default(0),
  color: z.string().default(''),
});
export type PageTypeRead = z.infer<typeof PageTypeRead>;

/**
 * 看图模型读出的**横带结构**。
 *
 * 为什么要让模型给几何：像素法在**照片满幅 + 浅底**的稿子上会塌成一条大带
 * （实测同一张稿，像素给出「标题带高 79%」，模型给出「标题 9–41% / 正文 41–72%」，
 * 后者才对得上原稿）。像素的强项是**色彩与跨页聚合出来的网格**（栏距、基线、边距），
 * 单页横带位置在三百来像素宽的缩略图上本来就不牢靠。
 *
 * 所以分工是：模型给每页的横带，像素给色板与网格；模型没给出来时才退回像素的横带。
 */
export const BandRead = z.object({
  role: z.enum(['eyebrow', 'title', 'subtitle', 'body', 'visual', 'metrics', 'footer']),
  topRatio: z.number(),
  heightRatio: z.number(),
  leftRatio: z.number().default(0),
  widthRatio: z.number().default(1),
  columns: z.number().default(1),
  /** 这条带放什么。给人核对用，不进渲染 */
  note: z.string().default(''),
});
export type BandRead = z.infer<typeof BandRead>;

export const PageAnalysis = z.object({
  pageType: PageType,
  /** 这套设计风格叫什么（如「瑞士极简」「杂志编辑风」）。用来给风格包起名与定调 */
  designStyle: z.string().default(''),
  /** 底色与背景的描写（是不是渐变、有没有大图或光斑） */
  background: z.string().default(''),
  /** 内容布局的中文描写：几条横向区域、每块放什么、对齐、有没有分栏 */
  layout: z.string().default(''),
  /**
   * 信息分层：一眼看过去先看到什么、其次什么、最后什么。
   *
   * 这是排版里最难量、也最要紧的一件事——字号阶梯只是手段，
   * 「读者第一眼该落在哪」才是目的。像素测得出字号差，测不出主次关系。
   */
  hierarchy: z.string().default(''),
  columns: z.number().default(1),
  /** 横带结构。渲染这一页时按它排，见 BandRead 的说明 */
  bands: z.array(BandRead).default(() => []),
  typography: z.array(PageTypeRead).default(() => []),
  /**
   * 卡片/容器风格。给的是**可映射到 GUI 规格的结构化值**，
   * 而不是一句「圆角柔和」——后者没法落到渲染参数上。
   */
  card: z.object({
    radius: z.number().default(0),
    surface: z.enum(['flat', 'tinted', 'glass', 'outlined']).default('outlined'),
    border: z.boolean().default(true),
    shadow: z.enum(['none', 'sm', 'md', 'lg']).default('sm'),
  }).optional(),
  palette: z.object({
    background: z.string().default(''),
    text: z.string().default(''),
    brand: z.string().default(''),
    accent: z.string().default(''),
  }).default(() => ({ background: '', text: '', brand: '', accent: '' })),
  /** 这一页若要用 AI 生成配图，该给什么提示词 */
  imagePrompt: z.string().default(''),
});
export type PageAnalysis = z.infer<typeof PageAnalysis>;

export const MeasuredPage = z.object({
  pageType: PageType,
  /** 来自第几张上传的图。拼图会被切成多页，所以一页要记住自己的来源 */
  imageIndex: z.number().int().default(0),
  /**
   * 这一页在**原图里**的归一化裁切框。
   *
   * 用户传的常是拼图（一张图里排好几张幻灯片），界面上要显示「这一页对应的那一块」
   * 而不是整张拼图；缺了它，预览里的原图永远是同一张，看不出哪块对应哪页。
   */
  cropBox: z.object({
    x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number(),
  }).default(() => ({ x0: 0, y0: 0, x1: 1, y1: 1 })),
  /** 这一页有没有量出结构。false 时 note 说明为什么 */
  ok: z.boolean(),
  note: z.string().default(''),
  align: z.enum(['left', 'center']).default('left'),
  contentBox: z.object({
    left: z.number(), right: z.number(), top: z.number(), bottom: z.number(),
  }),
  bands: z.array(BandSpec).default(() => []),
  /** 看图模型对这一页的读解；没接模型或模型没给出时为空 */
  analysis: PageAnalysis.optional(),
});
export type MeasuredPage = z.infer<typeof MeasuredPage>;

export const RecognizeResult = z.object({
  source: RecognizeSource,
  confidence: z.number().min(0).max(1),
  stylePack: StylePack,
  pendingConfirm: z.array(PendingConfirmItem).default(() => []),
  /** 从每张设计稿上量出来的页。界面据此做「原图 ↔ 重绘样机」并排与页类型改写 */
  measuredPages: z.array(MeasuredPage).default(() => []),
  /** 冲突消解记录：描述 > 多数 > 异常值 */
  conflicts: z.array(z.object({
    field: z.string(),
    values: z.array(z.string()),
    winner: z.string(),
    reason: z.string(),
  })).default(() => []),
  /** 是否调用过模型做精修。规则版识别为 false。 */
  modelAssisted: z.boolean().default(false),
  /** 模型精修的说明（判定的风格族、理由，或退回规则的原因） */
  modelNote: z.string().default(''),
});
export type RecognizeResult = z.infer<typeof RecognizeResult>;

/** 数字人预设形象 */
export const AvatarPreset = z.object({
  modelId: z.string(),
  name: z.string(),
  description: z.string().default(''),
  /** 矢量肖像定义（SVG），保证任意放大不糊 */
  svg: z.string(),
  defaultMode: AvatarMode.default('pip'),
});
export type AvatarPreset = z.infer<typeof AvatarPreset>;
