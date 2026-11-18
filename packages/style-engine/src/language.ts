import {
  DesignLanguage, PageType, StyleRules, StyleTokens,
  type LayoutVariantSpec, type StyleFamily,
} from '@lumen/ir-schema';
import { directiveGuidance } from './directives.js';

/**
 * 从风格包已有的东西反推出一套设计语言。
 *
 * 为什么要反推而不是让每个风格族手写全量：设计语言字段有几十个，
 * 五个族各写一遍必然漂移，而且大部分字段本来就能从色板/版式/规则推出来
 * （边框色就是中性 300，图片比例就是这套版式允许的比例）。
 * 各族只需要覆盖真正属于「调性」的那几项。
 */

/** 部分覆盖用的深合并 */
type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[] ? T[K]
    : T[K] extends object ? DeepPartial<T[K]>
      : T[K];
};

function merge<T extends Record<string, unknown>>(base: T, patch: DeepPartial<T> | undefined): T {
  if (!patch) return base;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const cur = out[k];
    if (Array.isArray(v)) out[k] = v;
    else if (v && typeof v === 'object' && cur && typeof cur === 'object' && !Array.isArray(cur)) {
      out[k] = merge(cur as Record<string, unknown>, v as DeepPartial<Record<string, unknown>>);
    } else out[k] = v;
  }
  return out as T;
}

/** 每种页类型的默认配方。族级覆盖只改真正影响调性的那几项 */
const DEFAULT_RECIPES: Record<PageType, {
  background: 'plain' | 'tinted' | 'gradient' | 'image-overlay' | 'grid';
  decoration: 'none' | 'accent-bar' | 'corner-block' | 'numbered-badge' | 'rule' | 'dots';
  spacing: 'tight' | 'normal' | 'airy';
  requiredSlots: string[];
  optionalSlots: string[];
}> = {
  cover: {
    background: 'tinted', decoration: 'accent-bar', spacing: 'airy',
    requiredSlots: ['title'], optionalSlots: ['sub', 'eyebrow', 'image'],
  },
  toc: {
    background: 'plain', decoration: 'rule', spacing: 'normal',
    requiredSlots: ['title', 'toc'], optionalSlots: ['eyebrow'],
  },
  section: {
    background: 'tinted', decoration: 'numbered-badge', spacing: 'airy',
    requiredSlots: ['title'], optionalSlots: ['sub', 'eyebrow'],
  },
  text: {
    background: 'plain', decoration: 'none', spacing: 'normal',
    requiredSlots: ['title'], optionalSlots: ['sub', 'bullets', 'paragraph'],
  },
  imageText: {
    background: 'plain', decoration: 'none', spacing: 'normal',
    requiredSlots: ['title', 'image'], optionalSlots: ['paragraph', 'bullets'],
  },
  gallery: {
    background: 'plain', decoration: 'none', spacing: 'normal',
    requiredSlots: ['title', 'image'], optionalSlots: ['sub', 'caption'],
  },
  people: {
    background: 'plain', decoration: 'none', spacing: 'normal',
    requiredSlots: ['title', 'image'], optionalSlots: ['sub', 'caption'],
  },
  chart: {
    background: 'plain', decoration: 'none', spacing: 'normal',
    requiredSlots: ['title', 'chart'], optionalSlots: ['bullets'],
  },
  // 图解页的旧槽位渲染器里**没有 diagram 这一槽**。若把 diagram 写成必需槽位，
  // 旧路径永远凑不齐，页页判不合格。它们的内容本来就来自提示词而不是槽位，
  // 所以这里只留最小必需项 title，让旧路径至少不会因此失败。
  architecture: {
    background: 'plain', decoration: 'none', spacing: 'normal',
    requiredSlots: ['title'], optionalSlots: ['paragraph', 'bullets'],
  },
  ui: {
    // 界面页：设备模型加屏内界面，画面已经很满，背景与装饰都留白
    background: 'plain', decoration: 'none', spacing: 'normal',
    requiredSlots: ['title'], optionalSlots: ['paragraph', 'image'],
  },
  mindMap: {
    background: 'plain', decoration: 'none', spacing: 'normal',
    requiredSlots: ['title'], optionalSlots: ['paragraph', 'bullets'],
  },
  metrics: {
    background: 'plain', decoration: 'none', spacing: 'normal',
    requiredSlots: ['title', 'metrics'], optionalSlots: ['paragraph'],
  },
  end: {
    background: 'tinted', decoration: 'rule', spacing: 'airy',
    requiredSlots: ['title'], optionalSlots: ['sub', 'paragraph'],
  },
};

// gallery 此前被漏在这里：DEFAULT_RECIPES 有它的配方，但本表没列它，
// 于是 deriveLanguage 从来不给图片排版页配页型配方（recipeFor 只能退回默认）。
// 一并补齐，并把两个图解页也加进来。
//
// **这张表与 `PageType` 枚举是两份手抄的清单**，加页类型时编译器不会报——
// 漏了的症状只是「这一页拿不到配方」，页面上看不出来。加页类型时记得同步这里。
const ALL_PAGE_TYPES: PageType[] = [
  'cover', 'toc', 'section', 'text', 'imageText', 'gallery', 'people', 'ui', 'chart', 'architecture', 'mindMap', 'metrics', 'end',
];

/**
 * 各族的设计语言差异。
 * 只写真正属于调性的部分：圆角软硬、标记形状、装饰件、图表强调方式、说明文字。
 */
const FAMILY_LANGUAGE: Record<StyleFamily, DeepPartial<DesignLanguage>> = {
  'business-classic': {
    gui: {
      radius: { control: 6, card: 8, inner: 4, pill: 4 },
      shadow: 'sm',
      card: { surface: 'outlined', padding: '30px 28px' },
      listRow: { marker: 'dash', markerSize: 3, markerColor: 'brand', gap: 18 },
      badge: { tone: 'outline', radius: 4, size: 12 },
      divider: 'hairline',
      eyebrow: { letterSpacingEm: 0.16, transform: 'none' },
    },
    iconography: { style: 'line', strokeWidth: 1.25, size: 26, container: 'none', containerTone: 'none' },
    chart: { palette: 'brand-first', gridLines: true, axisTone: 'muted', barRadius: 0, lineWidth: 2, areaFill: false, emphasis: 'none' },
    imagery: { treatment: 'framed', radius: 4, captionPlacement: 'below' },
    pageRecipes: [
      { pageType: 'cover', background: 'tinted', decoration: 'accent-bar', spacing: 'airy' },
      { pageType: 'section', background: 'tinted', decoration: 'rule', spacing: 'airy' },
      { pageType: 'end', background: 'tinted', decoration: 'rule', spacing: 'airy' },
    ] as never,
    guidance: {
      cover: '封面只放一个主张。标题控制在两行内，眉标写场合与年份，不要出现部门和作者以外的信息。',
      section: '章节页靠留白与一条细线立住，不要加图标或色块。',
      toc: '目录按章节顺序列出，条目与页码两端对齐。条目数控制在 8 条以内，超过就分成两列。',
      text: '一页一个主张。正文用短段落，结论放第一句，不要写过渡性的客套话。',
      imageText: '图片给结论做证，不是装饰。正文只写图片说明不了的那部分。',
      chart: '图表只讲一件事。标题直接写结论（如「需求两年增长 210%」），不要写「增长趋势」。',
      metrics: '一页最多三个数字，其中一个是主指标。每个数字都要带口径与来源。',
      end: '封底收敛到一句话加联系方式，不要重复前面的内容。',
      icon: '线宽 1.25，不装容器，图标只用于标识类别，不参与装饰。',
      chartUse: '网格线用细虚线，轴标签走中性色；柱形不加圆角，不用渐变填充。',
      imageUse: '图片一律加细边框，比例保持 16:9 或 4:3，不加圆角。',
    },
  },
  'academic-rigor': {
    gui: {
      radius: { control: 4, card: 6, inner: 3, pill: 4 },
      shadow: 'none',
      card: { surface: 'flat', padding: '26px 24px' },
      listRow: { marker: 'number', markerSize: 12, markerColor: 'text', gap: 14 },
      badge: { tone: 'outline', radius: 4, size: 12 },
      divider: 'hairline',
      eyebrow: { letterSpacingEm: 0.10, transform: 'none' },
    },
    iconography: { style: 'line', strokeWidth: 1.25, size: 24, container: 'none', containerTone: 'none' },
    chart: { palette: 'mono-ramp', gridLines: true, axisTone: 'text', barRadius: 0, lineWidth: 1.5, areaFill: false, emphasis: 'none' },
    imagery: { treatment: 'plain', radius: 0, captionPlacement: 'below' },
    pageRecipes: [
      { pageType: 'cover', background: 'plain', decoration: 'rule', spacing: 'normal' },
      { pageType: 'section', background: 'plain', decoration: 'numbered-badge', spacing: 'normal' },
      { pageType: 'end', background: 'plain', decoration: 'rule', spacing: 'normal' },
    ] as never,
    guidance: {
      cover: '封面写清题目、作者与单位，不加装饰。',
      section: '章节页标出编号与标题，其余留白。',
      toc: '目录按论文章节列出，条目与页码两端对齐。',
      text: '结论要有依据。方法、数据、局限分开写，不要混在一段里。',
      imageText: '图片必须是可引用的图，带图号与来源。',
      chart: '图表标清坐标轴与单位，图注写明数据来源与样本量。',
      metrics: '数字必须附统计口径与置信区间。',
      end: '封底列参考文献与致谢，不要放口号。',
      icon: '只在必要时用线性图标，线宽 1.25，不装容器。',
      chartUse: '优先单色系，网格线实线且淡，避免任何装饰性渐变。',
      imageUse: '图片不加圆角与阴影，一律带图注与来源。',
    },
  },
  'tech-minimal': {
    gui: {
      radius: { control: 8, card: 12, inner: 6, pill: 999 },
      shadow: 'none',
      card: { surface: 'tinted', padding: '24px 22px' },
      listRow: { marker: 'square', markerSize: 6, markerColor: 'brand', gap: 16 },
      badge: { tone: 'soft', radius: 999, size: 12 },
      divider: 'dashed',
      eyebrow: { letterSpacingEm: 0.14, transform: 'uppercase' },
    },
    iconography: { style: 'line', strokeWidth: 1.5, size: 28, container: 'squircle', containerTone: 'brand-soft' },
    chart: { palette: 'brand-first', gridLines: true, axisTone: 'muted', barRadius: 4, lineWidth: 2, areaFill: true, emphasis: 'primary-series' },
    imagery: { treatment: 'rounded', radius: 12, captionPlacement: 'below' },
    pageRecipes: [
      { pageType: 'cover', background: 'gradient', decoration: 'corner-block', spacing: 'airy' },
      { pageType: 'section', background: 'plain', decoration: 'numbered-badge', spacing: 'normal' },
      { pageType: 'end', background: 'tinted', decoration: 'none', spacing: 'normal' },
    ] as never,
    guidance: {
      cover: '封面给一句技术判断，眉标写版本或场景。可以用一处强调色，不要铺满。',
      section: '章节页用大编号，其余保持干净。',
      toc: '目录按模块顺序列出，条目与页码两端对齐。',
      text: '结构优先：先给结论，再给约束，最后给取舍。少用形容词。',
      imageText: '图片优先用架构图或流程图，避免装饰性配图。',
      chart: '图表标题写结论，标注单位；趋势用折线，比较用柱状。',
      metrics: '数字用等宽字体，标注单位和统计口径。',
      end: '封底给仓库地址或文档链接。',
      icon: '图标装方圆形容器，底色用品牌浅色，线宽 1.5。',
      chartUse: '允许面积填充与柱形圆角，主序列用品牌色强调，其余降饱和。',
      imageUse: '图片统一 12px 圆角，不加边框。',
    },
  },
  'brand-design': {
    gui: {
      radius: { control: 12, card: 16, inner: 8, pill: 999 },
      shadow: 'md',
      card: { surface: 'glass', padding: '28px 26px' },
      listRow: { marker: 'dot', markerSize: 6, markerColor: 'accent', gap: 18 },
      badge: { tone: 'solid', radius: 999, size: 12 },
      divider: 'accent',
      eyebrow: { letterSpacingEm: 0.20, transform: 'uppercase' },
    },
    iconography: { style: 'duotone', strokeWidth: 1.5, size: 32, container: 'circle', containerTone: 'accent-soft' },
    chart: { palette: 'categorical', gridLines: false, axisTone: 'muted', barRadius: 8, lineWidth: 3, areaFill: true, emphasis: 'primary-series' },
    imagery: { treatment: 'full-bleed', radius: 16, captionPlacement: 'overlay' },
    pageRecipes: [
      { pageType: 'cover', background: 'image-overlay', decoration: 'none', spacing: 'airy' },
      { pageType: 'section', background: 'gradient', decoration: 'corner-block', spacing: 'airy' },
      { pageType: 'end', background: 'gradient', decoration: 'corner-block', spacing: 'airy' },
    ] as never,
    guidance: {
      cover: '封面靠一张主视觉说话，标题压在图上，控制在两行内。',
      section: '章节页用色块或渐变铺底，标题居左，留出呼吸感。',
      toc: '目录排印要讲究，条目与页码两端对齐，条目间距拉开。',
      text: '文字要少而准。一页一个主张，其余交给留白。',
      imageText: '图片是主角，文字只做注解，注意压字处的可读性。',
      chart: '图表要经得起放大：去掉多余网格线，用色阶区分序列。',
      metrics: '数字放大到视觉主体，单位缩小，标签用中性色。',
      end: '封底可以放 Logo 与联系方式，保持与封面呼应。',
      icon: '图标用双色，装圆形底色容器，尺寸可以放大到 32。',
      chartUse: '去掉网格线，柱形允许 8px 圆角，用多色区分序列。',
      imageUse: '图片整幅出血或大圆角，题注压在图上并加渐变遮罩。',
    },
  },
  'friendly-premium': {
    gui: {
      radius: { control: 10, card: 18, inner: 10, pill: 999 },
      shadow: 'md',
      card: { surface: 'glass', padding: '28px 24px' },
      listRow: { marker: 'check', markerSize: 16, markerColor: 'brand', gap: 16 },
      badge: { tone: 'soft', radius: 999, size: 13 },
      divider: 'none',
      eyebrow: { letterSpacingEm: 0.08, transform: 'none' },
    },
    iconography: { style: 'duotone', strokeWidth: 1.75, size: 32, container: 'circle', containerTone: 'brand-soft' },
    chart: { palette: 'categorical', gridLines: false, axisTone: 'muted', barRadius: 10, lineWidth: 3, areaFill: true, emphasis: 'max-bar' },
    imagery: { treatment: 'rounded', radius: 18, captionPlacement: 'below' },
    pageRecipes: [
      { pageType: 'cover', background: 'gradient', decoration: 'dots', spacing: 'airy' },
      { pageType: 'section', background: 'tinted', decoration: 'numbered-badge', spacing: 'airy' },
      { pageType: 'end', background: 'tinted', decoration: 'dots', spacing: 'airy' },
    ] as never,
    guidance: {
      cover: '封面可以温暖一点，但不要幼稚。标题给一个具体的承诺。',
      section: '章节页用圆角编号与浅色底，保持亲和。',
      toc: '目录条目间距拉开，读起来轻松。',
      text: '说人话。用具体场景替代抽象概念，避免行业黑话。',
      imageText: '图片选有温度的实拍，避免生硬的素材图。',
      chart: '图表简化到一眼能懂，去掉网格线，用颜色区分。',
      metrics: '数字要带一个人话解释，说明它意味着什么。',
      end: '封底给明确的下一步动作。',
      icon: '图标用双色并装圆形底色容器，线宽 1.75，可以活泼但不能卡通。',
      chartUse: '去掉网格线，柱形 10px 圆角，最大值用强调色标出。',
      imageUse: '图片 18px 大圆角，不加边框。',
    },
  },

  /* ---- 下面四族带创作指令模板，全局字段来自 directives.ts ---- */

  'swiss-minimal': {
    gui: {
      radius: { control: 2, card: 4, inner: 2, pill: 2 },
      shadow: 'none',
      card: { surface: 'flat', padding: '32px 30px', gap: 16 },
      listRow: { marker: 'square', markerSize: 6, markerColor: 'brand', gap: 20 },
      badge: { tone: 'outline', radius: 2, size: 11 },
      divider: 'hairline',
      eyebrow: { letterSpacingEm: 0.20, transform: 'uppercase' },
    },
    iconography: { style: 'line', strokeWidth: 1.5, size: 24, container: 'none', containerTone: 'none' },
    chart: { palette: 'mono-ramp', gridLines: true, axisTone: 'muted', barRadius: 0, lineWidth: 2, areaFill: false, emphasis: 'max-bar' },
    imagery: { treatment: 'plain', radius: 0, captionPlacement: 'below' },
    pageRecipes: [
      { pageType: 'cover', background: 'plain', decoration: 'accent-bar', spacing: 'airy' },
      { pageType: 'section', background: 'plain', decoration: 'rule', spacing: 'airy' },
      { pageType: 'end', background: 'plain', decoration: 'rule', spacing: 'airy' },
    ] as never,
    guidance: {
      cover: '封面只放一个主张。标题直接写结论，两行以内，眉标写场合与年份。',
      section: '章节页靠一条细线和一个编号立住，不加图标与色块。',
      toc: '目录按章节顺序列出，条目与页码两端对齐，条目控制在 8 条以内。',
      text: '一页一个结论。标题就是那句结论，正文只放 1—3 条证据，并注明来源段落。',
      imageText: '图片给结论做证。每页最多一张，图下放一句说明。',
      chart: '图表只讲一件事，标题直接写结论（如「需求两年增长 210%」）。',
      metrics: '一页最多三个数字，其中一个是主指标，每个都带口径。',
      end: '封底给下一步行动，不要重复前面的内容。',
      icon: '线宽 1.5，不装容器。图标只用于标识类别，不参与装饰。',
      chartUse: '网格线用细虚线，轴标签走中性色，柱形不加圆角也不用渐变。',
      imageUse: '图片保持 16:9 或 4:3，不加圆角与边框。',
      ...directiveGuidance('swiss-minimal'),
    } as never,
  },

  'editorial-magazine': {
    gui: {
      radius: { control: 4, card: 0, inner: 0, pill: 0 },
      shadow: 'none',
      card: { surface: 'flat', padding: '0px', gap: 24 },
      listRow: { marker: 'number', markerSize: 14, markerColor: 'accent', gap: 22 },
      badge: { tone: 'solid', radius: 0, size: 12 },
      divider: 'hairline',
      eyebrow: { letterSpacingEm: 0.14, transform: 'uppercase' },
    },
    iconography: { style: 'line', strokeWidth: 1.5, size: 26, container: 'none', containerTone: 'none' },
    chart: { palette: 'brand-first', gridLines: false, axisTone: 'muted', barRadius: 0, lineWidth: 2.5, areaFill: true, emphasis: 'max-bar' },
    imagery: { treatment: 'full-bleed', radius: 0, captionPlacement: 'below' },
    pageRecipes: [
      { pageType: 'cover', background: 'image-overlay', decoration: 'none', spacing: 'airy' },
      { pageType: 'section', background: 'tinted', decoration: 'corner-block', spacing: 'airy' },
      { pageType: 'end', background: 'tinted', decoration: 'corner-block', spacing: 'airy' },
    ] as never,
    guidance: {
      cover: '封面走杂志感：大标题压在图上，标题占顶部四分之一，其余留给画面。',
      section: '章节页用一个大色块或大编号切开，不要居中排。',
      toc: '目录用编号加引导线，条目之间拉开行距，读起来像杂志的目录页。',
      text: '正文左对齐，不要居中。关键数据用大字号单独成块，不要混在段落里。',
      imageText: '每页最多一张图，图与观点强相关，图下放一句说明。',
      chart: '数据优先用图表，不用大段文字。图表去掉网格线，用颜色区分系列。',
      metrics: '数字用超大字号，配一句人话解释它意味着什么。',
      end: '封底给一个明确的下一步，可以带联系方式。',
      icon: '线宽 1.5，不装容器，能不用图标就不用。',
      chartUse: '去掉网格线，用面积或色块表达量级，强调值用强调色。',
      imageUse: '图片整幅出血，不加圆角与边框，压字时加一层暗角遮罩。',
      ...directiveGuidance('editorial-magazine'),
    } as never,
  },

  'academic-report': {
    gui: {
      radius: { control: 3, card: 4, inner: 2, pill: 4 },
      shadow: 'none',
      card: { surface: 'outlined', padding: '24px 22px', gap: 10 },
      listRow: { marker: 'dash', markerSize: 4, markerColor: 'text', gap: 14 },
      badge: { tone: 'outline', radius: 3, size: 12 },
      divider: 'hairline',
      eyebrow: { letterSpacingEm: 0.08, transform: 'none' },
    },
    iconography: { style: 'line', strokeWidth: 1.25, size: 22, container: 'none', containerTone: 'none' },
    chart: { palette: 'mono-ramp', gridLines: true, axisTone: 'text', barRadius: 0, lineWidth: 1.5, areaFill: false, emphasis: 'none' },
    imagery: { treatment: 'framed', radius: 2, captionPlacement: 'below' },
    pageRecipes: [
      { pageType: 'cover', background: 'plain', decoration: 'rule', spacing: 'normal' },
      { pageType: 'section', background: 'plain', decoration: 'numbered-badge', spacing: 'normal' },
      { pageType: 'end', background: 'plain', decoration: 'rule', spacing: 'normal' },
    ] as never,
    guidance: {
      cover: '封面写题目、汇报人和日期就行，不用装饰。组会看的是内容不是封面。',
      section: '章节页就一个编号加标题，说清这一部分要回答什么问题。',
      toc: '目录按「背景 → 问题 → 方法 → 结果 → 结论与不足」列，别改这个顺序。',
      text: '结论要有依据。方法、数据、局限分开写，不要混在一段里。数字必须能在材料里找到出处。',
      imageText: '图要标图号与来源。示意图要注明是示意，不要当成实测结果。',
      chart: '坐标轴写清含义与单位，误差范围要画出来。别用彩虹配色区分系列。',
      metrics: '关键结果给数值、样本量与置信区间，缺一个就标【待确认】。',
      end: '封底写致谢与下一步计划，可以列参考文献入口。',
      icon: '线宽 1.25，能不用就不用。',
      chartUse: '单色阶配色，网格线细而浅，不要用彩虹色区分系列。',
      imageUse: '图片加细边框，标图号与来源。',
      ...directiveGuidance('academic-report'),
    } as never,
  },

  'consulting-report': {
    gui: {
      radius: { control: 2, card: 2, inner: 2, pill: 2 },
      shadow: 'sm',
      card: { surface: 'outlined', padding: '26px 24px', gap: 12 },
      listRow: { marker: 'square', markerSize: 5, markerColor: 'brand', gap: 16 },
      badge: { tone: 'solid', radius: 2, size: 11 },
      divider: 'hairline',
      eyebrow: { letterSpacingEm: 0.18, transform: 'uppercase' },
    },
    iconography: { style: 'line', strokeWidth: 1.5, size: 24, container: 'none', containerTone: 'none' },
    chart: { palette: 'brand-first', gridLines: true, axisTone: 'muted', barRadius: 0, lineWidth: 2, areaFill: false, emphasis: 'max-bar' },
    imagery: { treatment: 'framed', radius: 2, captionPlacement: 'below' },
    pageRecipes: [
      { pageType: 'cover', background: 'tinted', decoration: 'rule', spacing: 'airy' },
      { pageType: 'section', background: 'tinted', decoration: 'numbered-badge', spacing: 'airy' },
      { pageType: 'end', background: 'tinted', decoration: 'rule', spacing: 'airy' },
    ] as never,
    guidance: {
      cover: '封面给出核心论点，不是标题。标题就是这一页的结论。',
      section: '章节页用线性编号导航，标出这一章要回答的问题。',
      toc: '目录用线性导航，条目即各页论点，读下来就是一条论证链。',
      text: '结论先行。每一页只传递 1 个核心观点，标题就是本页论点，下面挂 3 条以内的支撑。',
      imageText: '图与论点强相关，不要放氛围图。',
      chart: '柱状折线图主深蓝，红色警示、绿色乐观，图表干净简约。',
      metrics: '数字配一句结论式解读，不要只摆数字。',
      end: '封底收敛到核心论点加下一步建议。',
      icon: '减少图标使用。要生成图标就全部用简约线性 icon，线宽统一 1.5。',
      chartUse: '主深蓝色，红色警示、绿色乐观；去掉多余网格线与装饰。',
      imageUse: '图片加细边框，保持 16:9，不加圆角。',
      ...directiveGuidance('consulting-report'),
    } as never,
  },
};

/** 从版式里收集出现过的图片比例，作为图片规范的默认值 */
function aspectsFromLayouts(layouts: LayoutVariantSpec[]): string[] {
  const seen = new Set<string>();
  for (const l of layouts) for (const r of l.imageRatios) seen.add(r);
  return seen.size > 0 ? [...seen] : ['16:9', '4:3'];
}

export interface DeriveInput {
  family: StyleFamily;
  tokens: StyleTokens;
  layouts: LayoutVariantSpec[];
  rules: StyleRules;
}

/**
 * 反推一套完整的设计语言。
 * 顺序：页面配方默认值 → 通用默认（从色板/版式推）→ 族级覆盖。
 */
export function deriveLanguage(input: DeriveInput): DesignLanguage {
  const base = DesignLanguage.parse({
    pageRecipes: ALL_PAGE_TYPES.map((pageType) => ({ pageType, ...DEFAULT_RECIPES[pageType] })),
    gui: { border: { color: input.tokens.neutral300 } },
    imagery: { aspect: aspectsFromLayouts(input.layouts) },
  });

  const withFamily = merge(
    base as unknown as Record<string, unknown>,
    FAMILY_LANGUAGE[input.family] as DeepPartial<Record<string, unknown>>,
  );

  // 页面配方在族级是「按页类型打补丁」，不是整表替换
  const familyRecipes = FAMILY_LANGUAGE[input.family].pageRecipes;
  if (Array.isArray(familyRecipes) && familyRecipes.length > 0) {
    const byType = new Map(familyRecipes.map((r) => [r.pageType, r]));
    withFamily.pageRecipes = ALL_PAGE_TYPES.map((pageType) => ({
      ...(base.pageRecipes.find((r) => r.pageType === pageType) ?? { pageType }),
      ...(byType.get(pageType) ?? {}),
    }));
  }

  return DesignLanguage.parse(withFamily);
}
