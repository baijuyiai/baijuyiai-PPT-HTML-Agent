import { hueFamily, isOnFontLadder, parseHex, type LintIssue, type StylePack } from '@lumen/ir-schema';
import { CANONICAL_VARIANT_IDS } from './variant-set.js';

/** 允许的字重（PRD §3.4）。导出是因为识别那边也要把模型给的字重吸附过来 */
export const ALLOWED_WEIGHTS = [400, 500, 600, 700];

/** 相对亮度（WCAG 2.1） */
function luminance(hex: string): number | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b);
}

/** WCAG 对比度，1 到 21 */
export function contrastRatio(fg: string, bg: string): number | null {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  if (l1 === null || l2 === null) return null;
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 风格包一致性校验。
 * 覆盖 PRD §3.1 品质基线、§3.3 色彩规则、§3.4 排印规则、§3.6 图标规范、§8 可访问性。
 */
export function lintStylePack(pack: StylePack): LintIssue[] {
  const issues: LintIssue[] = [];
  const { base } = pack;
  const push = (rule: string, severity: LintIssue['severity'], message: string, path = '') =>
    issues.push({ rule, severity, message, path });

  /* --- 色彩：单屏色相不超过 4 个 --- */
  // 只统计主色与辅助色。语义色（成功/警告/错误/信息）不属于「主色 + 辅助色 + 中性色」口径（PRD §3.1）。
  const hues = new Set<string>();
  for (const key of ['brand500', 'brand600', 'accent500'] as const) {
    const fam = hueFamily(base.tokens[key]);
    if (fam) hues.add(fam);
  }
  if (hues.size > base.rules.maxHueFamilies) {
    push(
      'color/hue-families',
      'error',
      `色相族数量 ${hues.size} 超过上限 ${base.rules.maxHueFamilies}（PRD §3.1 克制）`,
      'base.tokens',
    );
  }

  /* --- 色彩：辅助色面积上限 --- */
  if (base.rules.maxAccentAreaRatio > 0.10) {
    push('color/accent-area', 'error', `辅助色面积上限 ${base.rules.maxAccentAreaRatio} 超过 10%（PRD §3.3）`, 'base.rules');
  }

  /* --- 可访问性：正文与背景对比度达到 AA --- */
  const ratio = contrastRatio(base.tokens.neutral900, base.tokens.neutral0);
  if (ratio !== null && ratio < 4.5) {
    push('a11y/contrast', 'error', `正文对背景对比度 ${ratio.toFixed(2)} 低于 AA 要求的 4.5（PRD §8）`, 'base.tokens');
  }

  /* --- 排印：字号必须在阶梯内 --- */
  for (const role of base.typography.roles) {
    if (!isOnFontLadder(role.sizePx)) {
      push('type/size-ladder', 'error', `角色 ${role.role} 字号 ${role.sizePx}px 不在字阶内（PRD §3.4）`, `base.typography.roles.${role.role}`);
    }
    if (role.sizePx < base.rules.minFontSize) {
      push('type/min-size', 'error', `角色 ${role.role} 字号 ${role.sizePx}px 低于下限 ${base.rules.minFontSize}px`, `base.typography.roles.${role.role}`);
    }
    if (!ALLOWED_WEIGHTS.includes(role.weight)) {
      push('type/weight', 'error', `角色 ${role.role} 字重 ${role.weight} 非法，仅允许 400/500/600/700（PRD §3.4）`, `base.typography.roles.${role.role}`);
    }
    if (role.lineHeight <= 0) {
      push('type/line-height', 'error', `角色 ${role.role} 行高必须为正数`, `base.typography.roles.${role.role}`);
    }
  }

  const requiredRoles = ['display', 'title', 'subtitle', 'body', 'caption', 'metric', 'mono'];
  for (const r of requiredRoles) {
    if (!base.typography.roles.some((x) => x.role === r)) {
      push('type/missing-role', 'error', `缺少字体角色 ${r}`, 'base.typography.roles');
    }
  }

  /* --- 标题模板数量 6–12 --- */
  const tplCount = base.titleGrammar.templates.length;
  if (tplCount < 6 || tplCount > 12) {
    push('title/template-count', 'error', `标题 composition 模板数量 ${tplCount} 不在 6–12 之间（PRD §5.2）`, 'base.titleGrammar.templates');
  }
  const tplIds = new Set(base.titleGrammar.templates.map((t) => t.id));
  if (tplIds.size !== tplCount) {
    push('title/duplicate-id', 'error', '标题模板 id 存在重复', 'base.titleGrammar.templates');
  }

  /* --- 版式：必须实现全部规范变体 --- */
  const layoutIds = new Set(base.layouts.map((l) => l.id));
  for (const id of CANONICAL_VARIANT_IDS) {
    if (!layoutIds.has(id)) {
      push('layout/missing-variant', 'error', `缺少规范版式 ${id}`, 'base.layouts');
    }
  }

  /* --- 要点上限 --- */
  if (base.rules.maxBullets > 5) {
    push('content/bullets', 'error', `一页要点上限 ${base.rules.maxBullets} 超过 5（PRD §5.3）`, 'base.rules');
  }
  for (const l of base.layouts) {
    if (l.maxBullets > 5) {
      push('content/bullets', 'error', `版式 ${l.id} 的要点上限 ${l.maxBullets} 超过 5`, `base.layouts.${l.id}`);
    }
  }

  /* --- 留白 --- */
  if (base.rules.marginRatio < 0.05) {
    push('layout/margin', 'error', `页面边距比例 ${base.rules.marginRatio} 低于画布宽 5%（PRD §3.1）`, 'base.rules');
  }

  /* --- 动效白名单 --- */
  if (base.motionWhitelist.length === 0) {
    push('motion/whitelist-empty', 'error', '动效白名单为空，页面将无法选择入场动效', 'base.motionWhitelist');
  }

  /* --- 数字人与光标组件 --- */
  const cur = base.components.cursor;
  if (cur.opacity < 0.4 || cur.opacity > 0.6) {
    push('cursor/opacity', 'error', `光标透明度 ${cur.opacity} 超出 40%–60% 区间（PRD §5.14）`, 'base.components.cursor');
  }
  if (cur.moveEaseMs < 300 || cur.moveEaseMs > 500) {
    push('cursor/move-ease', 'error', `光标段间移动缓动 ${cur.moveEaseMs}ms 超出 300–500ms（PRD §5.14）`, 'base.components.cursor');
  }
  const fs = base.components.avatar.fullscreen;
  if (fs.pptOpacity < 0 || fs.pptOpacity > 0.5) {
    push('avatar/ppt-opacity', 'error', `全屏模式 PPT 透明度 ${fs.pptOpacity} 过高，会盖住数字人`, 'base.components.avatar');
  }

  return issues;
}

/** 全部风格包是否都通过校验 */
export function lintAllStylePacks(packs: StylePack[]): LintIssue[] {
  return packs.flatMap((p) =>
    lintStylePack(p).map((i) => ({ ...i, path: `${p.styleId}@${p.version} ${i.path}`.trim() })),
  );
}
