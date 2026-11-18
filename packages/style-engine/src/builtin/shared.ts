import type {
  AudienceTag, AvatarComponentStyle, CursorComponentStyle, FontPair, MotionName,
  StyleFamily, StylePack, StyleRules, StyleTokensInput, TitleTemplate, TypographyRole,
  TypographyRoleName,
} from '@lumen/ir-schema';
import { StyleTokens } from '@lumen/ir-schema';
import { buildLayouts, type CapacityProfile } from '../variant-set.js';
import { deriveLanguage } from '../language.js';

/**
 * 风格族画像。五个风格族共用同一套构建流程，差异只在画像里体现。
 * 这样能保证「所有风格共享同一品质基线，差异只在调性，不在 level」（PRD §5.2）。
 */
export interface FamilyProfile {
  styleId: string;
  family: StyleFamily;
  version: string;
  name: string;
  description: string;
  audienceFit: AudienceTag[];
  toneKeywords: string[];
  /** 语义色 success/warning/error/info 有默认值，可不填 */
  tokens: StyleTokensInput;
  fonts: { heading: string; body: string; numeric: string };
  /** 各角色字号，必须落在 12/14/16/20/24/32/40/56 阶梯内 */
  sizes: Record<TypographyRoleName, number>;
  weights: Record<TypographyRoleName, number>;
  lineHeights: Record<TypographyRoleName, number>;
  letterSpacing?: Partial<Record<TypographyRoleName, number>>;
  capacity: CapacityProfile;
  motionWhitelist: MotionName[];
  avatar: AvatarComponentStyle;
  cursor: CursorComponentStyle;
  rules?: Partial<StyleRules>;
  examples?: string[];
}

const ROLE_ORDER: TypographyRoleName[] = ['display', 'title', 'subtitle', 'body', 'caption', 'metric', 'mono'];

/** 标题 composition 模板骨架。每个风格族都会实例化全部 8 个，容量按画像缩放。 */
const TEMPLATE_SHAPES: {
  key: string;
  name: string;
  composition: TitleTemplate['composition'];
  eyebrowStyle: TitleTemplate['eyebrowStyle'];
  accentUsage: TitleTemplate['accentUsage'];
  slots: TitleTemplate['slots'];
  /** 相对基准标题字数的倍数 */
  scale: number;
  lines: number;
}[] = [
  { key: 'statement', name: '左对齐主张', composition: 'left-aligned', eyebrowStyle: 'caps', accentUsage: 'word', slots: ['eyebrow', 'main', 'accentWords', 'sub'], scale: 1.0, lines: 2 },
  { key: 'declaration', name: '居中宣告', composition: 'centered', eyebrowStyle: 'none', accentUsage: 'underline', slots: ['main', 'accentWords', 'sub'], scale: 1.1, lines: 2 },
  { key: 'contrast', name: '左右对比', composition: 'split', eyebrowStyle: 'accent-bar', accentUsage: 'block', slots: ['eyebrow', 'main', 'sub'], scale: 0.95, lines: 2 },
  { key: 'stacked', name: '上下叠层', composition: 'stacked', eyebrowStyle: 'accent-bar', accentUsage: 'word', slots: ['eyebrow', 'main', 'accentWords', 'sub'], scale: 1.0, lines: 3 },
  { key: 'overlay', name: '图上压字', composition: 'overlay', eyebrowStyle: 'none', accentUsage: 'word', slots: ['main', 'accentWords'], scale: 0.85, lines: 2 },
  { key: 'chapter', name: '编号章节', composition: 'numbered', eyebrowStyle: 'dotted', accentUsage: 'none', slots: ['eyebrow', 'main', 'sub'], scale: 0.9, lines: 2 },
  { key: 'banner', name: '色块横幅', composition: 'banner', eyebrowStyle: 'caps', accentUsage: 'block', slots: ['eyebrow', 'main'], scale: 0.9, lines: 2 },
  { key: 'quiet', name: '克制极简', composition: 'minimal', eyebrowStyle: 'none', accentUsage: 'none', slots: ['main', 'sub'], scale: 0.95, lines: 2 },
];

function buildTitleTemplates(profile: FamilyProfile): TitleTemplate[] {
  const base = Math.round(profile.capacity.titleChars * 1.2);
  return TEMPLATE_SHAPES.map((s) => ({
    id: `${profile.styleId}/${s.key}`,
    name: s.name,
    composition: s.composition,
    eyebrowStyle: s.eyebrowStyle,
    accentUsage: s.accentUsage,
    maxTitleChars: Math.max(8, Math.round(base * s.scale)),
    maxTitleLines: s.lines,
    slots: [...s.slots],
  }));
}

function buildTypography(profile: FamilyProfile): TypographyRole[] {
  return ROLE_ORDER.map((role) => ({
    role,
    family: role === 'mono' || role === 'metric' ? profile.fonts.numeric : (role === 'body' || role === 'caption' ? profile.fonts.body : profile.fonts.heading),
    sizePx: profile.sizes[role],
    weight: profile.weights[role],
    lineHeight: profile.lineHeights[role],
    letterSpacing: profile.letterSpacing?.[role] ?? 0,
  }));
}

function buildFontPairs(profile: FamilyProfile): FontPair[] {
  return [{ heading: profile.fonts.heading, body: profile.fonts.body, numeric: profile.fonts.numeric }];
}

const BASE_RULES: StyleRules = {
  maxHueFamilies: 4,
  maxAccentAreaRatio: 0.10,
  maxBullets: 5,
  minFontSize: 12,
  marginRatio: 0.05,
};

/** 由画像构建一个完整的风格包 */
export function buildPack(profile: FamilyProfile): StylePack {
  const layouts = buildLayouts(profile.capacity);
  return {
    styleId: profile.styleId,
    family: profile.family,
    version: profile.version,
    name: profile.name,
    description: profile.description,
    audienceFit: [...profile.audienceFit],
    toneKeywords: [...profile.toneKeywords],
    base: {
      // 解析一次补齐语义色等默认值，保证风格包内的色板是完整真值
      tokens: StyleTokens.parse(profile.tokens),
      typography: {
        roles: buildTypography(profile),
        pairs: buildFontPairs(profile),
      },
      titleGrammar: {
        templates: buildTitleTemplates(profile),
      },
      layouts,
      components: {
        avatar: profile.avatar,
        cursor: profile.cursor,
      },
      // 设计语言：能推的从色板/版式推，推不出的按族覆盖（见 language.ts）
      language: deriveLanguage({
        family: profile.family,
        tokens: StyleTokens.parse(profile.tokens),
        layouts,
        rules: { ...BASE_RULES, ...(profile.rules ?? {}) },
      }),
      rules: { ...BASE_RULES, ...(profile.rules ?? {}) },
      motionWhitelist: [...profile.motionWhitelist],
    },
    variants: {},
    overrides: {},
    examples: [...(profile.examples ?? [])],
    meta: { builtin: true, reviewed: true, createdAt: 0, updatedAt: 0 },
  };
}
