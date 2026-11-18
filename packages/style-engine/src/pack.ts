import type { AudienceTag, SceneTag, StyleFamily, StylePack, StyleRef, TitleTemplate } from '@lumen/ir-schema';

/** 'family@version' 形式的风格标识 */
export function styleRef(pack: Pick<StylePack, 'styleId' | 'version'>): StyleRef {
  return `${pack.styleId}@${pack.version}`;
}

export function parseStyleRef(ref: string): { styleId: string; version: string } {
  const at = ref.lastIndexOf('@');
  if (at <= 0) throw new Error(`风格标识格式非法：${ref}，应为 family@version`);
  return { styleId: ref.slice(0, at), version: ref.slice(at + 1) };
}

/** 场景 → 目标人群映射，用于新建项目时的风格推荐 */
export const SCENE_AUDIENCE: Record<SceneTag, AudienceTag> = {
  pitch: 'founder',
  strategy: 'executive',
  annual: 'executive',
  academic: 'scholar',
  defense: 'scholar',
  board: 'executive',
  review: 'executive',
  tech: 'tech-lead',
  brand: 'brand',
  general: 'general',
};

/** 人群 → 风格族偏好顺序 */
export const AUDIENCE_FAMILY_ORDER: Record<AudienceTag, StyleFamily[]> = {
  executive: ['business-classic', 'academic-rigor', 'tech-minimal'],
  founder: ['business-classic', 'brand-design', 'tech-minimal'],
  scholar: ['academic-rigor', 'tech-minimal', 'business-classic'],
  'tech-lead': ['tech-minimal', 'academic-rigor', 'business-classic'],
  brand: ['brand-design', 'friendly-premium', 'business-classic'],
  general: ['business-classic', 'friendly-premium', 'tech-minimal'],
};

/** 按人群推荐风格包，顺序即推荐优先级 */
export function recommendForAudience(audience: AudienceTag, packs: StylePack[]): StylePack[] {
  const order = AUDIENCE_FAMILY_ORDER[audience] ?? AUDIENCE_FAMILY_ORDER.general;
  return [...packs].sort((a, b) => {
    const ai = order.indexOf(a.family);
    const bi = order.indexOf(b.family);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
}

export function recommendForScene(scene: SceneTag, packs: StylePack[]): StylePack[] {
  return recommendForAudience(SCENE_AUDIENCE[scene] ?? 'general', packs);
}

/** 把风格包色板转成 CSS 变量，供画布与导出复用同一份真值 */
export function packCssVars(pack: StylePack): Record<string, string> {
  const t = pack.base.tokens;
  const roles = pack.base.typography.roles;
  const byRole = (r: string) => roles.find((x) => x.role === r);
  const vars: Record<string, string> = {
    '--brand-500': t.brand500,
    '--brand-600': t.brand600,
    '--brand-100': t.brand100,
    '--accent-500': t.accent500,
    '--accent-100': t.accent100,
    '--neutral-900': t.neutral900,
    '--neutral-700': t.neutral700,
    '--neutral-500': t.neutral500,
    '--neutral-300': t.neutral300,
    '--neutral-100': t.neutral100,
    '--neutral-0': t.neutral0,
    '--success': t.success,
    '--warning': t.warning,
    '--error': t.error,
    '--info': t.info,
    '--text-1': t.neutral900,
    '--text-2': t.neutral700,
    '--text-3': t.neutral500,
    '--border': t.neutral300,
    '--page-bg': t.neutral100,
    '--surface-0': t.neutral0,
  };
  for (const role of ['display', 'title', 'subtitle', 'body', 'caption', 'metric', 'mono'] as const) {
    const spec = byRole(role);
    if (!spec) continue;
    vars[`--fs-${role}`] = `${spec.sizePx}px`;
    vars[`--fw-${role}`] = String(spec.weight);
    vars[`--lh-${role}`] = String(spec.lineHeight);
    vars[`--ff-${role}`] = spec.family;
  }

  // 设计语言里的数值也铺成变量：导出的 HTML 里写 var(--radius-card) 才能与画布同源，
  // 否则改一次圆角要同时改渲染层和导出的 CSS，迟早对不上。
  const lang = pack.base.language;
  vars['--radius-control'] = `${lang.gui.radius.control}px`;
  vars['--radius-card'] = `${lang.gui.radius.card}px`;
  vars['--radius-inner'] = `${lang.gui.radius.inner}px`;
  vars['--radius-pill'] = `${lang.gui.radius.pill}px`;
  vars['--border-width'] = `${lang.gui.border.width}px`;
  vars['--card-padding'] = lang.gui.card.padding;
  vars['--card-gap'] = `${lang.gui.card.gap}px`;
  vars['--list-gap'] = `${lang.gui.listRow.gap}px`;
  vars['--list-marker'] = `${lang.gui.listRow.markerSize}px`;
  vars['--badge-size'] = `${lang.gui.badge.size}px`;
  vars['--eyebrow-tracking'] = `${lang.gui.eyebrow.letterSpacingEm}em`;
  vars['--icon-size'] = `${lang.iconography.size}px`;
  vars['--icon-stroke'] = String(lang.iconography.strokeWidth);
  vars['--img-radius'] = `${lang.imagery.radius}px`;
  vars['--scrim'] = lang.imagery.scrim.gradient;
  vars['--chart-bar-radius'] = `${lang.chart.barRadius}px`;
  vars['--chart-line-width'] = String(lang.chart.lineWidth);
  return vars;
}

/** 把 CSS 变量对象序列化成 style 属性字符串 */
export function cssVarsToStyle(vars: Record<string, string>): string {
  return Object.entries(vars).map(([k, v]) => `${k}: ${v}`).join('; ');
}

export interface TitlePickInput {
  /** 主标题字数 */
  mainChars: number;
  /** 是否有副标题 */
  hasSub: boolean;
  /** 是否有眉标 */
  hasEyebrow: boolean;
  /** 该页是否以图为主（图上压字场景优先 overlay） */
  imageLed: boolean;
}

/**
 * 按内容挑选标题模板。
 * 约束：只能从风格包的模板库里选，禁止临场拼凑（PRD §3.4）。
 */
export function pickTitleTemplate(pack: StylePack, input: TitlePickInput): TitleTemplate {
  const templates = pack.base.titleGrammar.templates;
  if (templates.length === 0) throw new Error(`风格包 ${pack.styleId} 没有标题模板`);

  const preferredComposition: TitleTemplate['composition'][] = input.imageLed
    ? ['overlay', 'minimal', 'left-aligned']
    : input.mainChars <= 12
      ? ['centered', 'minimal', 'left-aligned']
      : ['left-aligned', 'stacked', 'split', 'minimal'];

  const byComposition = (order: string[]) =>
    templates
      .filter((t) => order.includes(t.composition))
      .sort((a, b) => order.indexOf(a.composition) - order.indexOf(b.composition));

  const candidates = byComposition(preferredComposition);
  const pool = candidates.length > 0 ? candidates : templates;

  // 在可用模板里选能容纳标题、且槽位与内容匹配的那个
  const fitting = pool.filter((t) => t.maxTitleChars >= input.mainChars);
  const finalPool = fitting.length > 0 ? fitting : pool;

  const slotScore = (t: TitleTemplate) =>
    (input.hasEyebrow === t.slots.includes('eyebrow') ? 0 : 1) +
    (input.hasSub === t.slots.includes('sub') ? 0 : 1);

  return finalPool.reduce((best, cur) => (slotScore(cur) < slotScore(best) ? cur : best), finalPool[0]!);
}

/** 人群标签的中文名，供 UI 展示 */
export const AUDIENCE_LABEL: Record<AudienceTag, string> = {
  executive: '企业高管',
  scholar: '学者与研究人员',
  founder: '老板与创始人',
  'tech-lead': '技术总监与架构师',
  brand: '品牌与设计负责人',
  general: '通用',
};

/** 场景标签的中文名 */
export const SCENE_LABEL: Record<SceneTag, string> = {
  pitch: '融资路演',
  strategy: '战略发布',
  annual: '年会演讲',
  academic: '学术汇报',
  defense: '课题答辩',
  board: '董事会汇报',
  review: '经营分析',
  tech: '技术方案与架构评审',
  brand: '品牌提案与视觉汇报',
  general: '通用',
};
