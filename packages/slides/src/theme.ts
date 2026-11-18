import type { StylePack, TypographyRoleName } from '@lumen/ir-schema';
import type { SlideRenderContext } from '@lumen/render-engine';

/** 画布上的取色与排印助手。所有取值来自风格包，模板不得硬编码。 */
export interface SurfaceColors {
  isDark: boolean;
  bg: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  brand: string;
  brandSoft: string;
  accent: string;
  accentSoft: string;
}

/**
 * 深色模式把中性色阶反转。
 * 风格包只定义一套（浅色）中性色，深色由渲染层按固定规则映射，保证五个风格族表现一致。
 */
export function surfaceColors(ctx: SlideRenderContext): SurfaceColors {
  const t = ctx.pack.base.tokens;
  if (ctx.theme === 'dark') {
    return {
      isDark: true,
      bg: '#16181D',
      surface: '#1E2128',
      text: t.neutral100,
      textMuted: t.neutral500,
      border: t.neutral300,
      brand: t.brand500,
      brandSoft: t.brand100,
      accent: t.accent500,
      accentSoft: t.accent100,
    };
  }
  return {
    isDark: false,
    bg: t.neutral0,
    surface: t.neutral100,
    text: t.neutral900,
    textMuted: t.neutral500,
    border: t.neutral300,
    brand: t.brand500,
    brandSoft: t.brand100,
    accent: t.accent500,
    accentSoft: t.accent100,
  };
}

/* ---------------- 颜色工具 ---------------- */

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 两色线性混合。t=0 取 a，t=1 取 b。任一侧不是 6 位 hex 时原样返回 a。 */
export function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  const c = ca.map((v, i) => Math.round(v + (cb[i]! - v) * t));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * 新链路用的取色：从 StyleDoc 的语义色板凑出 `SurfaceColors`。
 *
 * 新链路的页面只有 StyleDoc（七项语义色），没有风格包的 token 阶梯，
 * 而装饰件那套组件认的是 `SurfaceColors`。**两套软的色在这里接上**，
 * 而不是让装饰件再写一套取色逻辑。
 */
export function surfaceColorsFromPalette(
  palette: { bg: string; surface: string; text: string; muted: string; accent: string; brand: string; border: string },
  isDark: boolean,
): SurfaceColors {
  return {
    isDark,
    bg: palette.bg,
    surface: palette.surface,
    text: palette.text,
    textMuted: palette.muted,
    border: palette.border,
    brand: palette.brand,
    brandSoft: mix(palette.bg, palette.brand, 0.12),
    accent: palette.accent,
    accentSoft: mix(palette.bg, palette.accent, 0.12),
  };
}

/** 取某字体角色的规格 */
export function role(pack: StylePack, name: TypographyRoleName) {
  const found = pack.base.typography.roles.find((r) => r.role === name);
  if (!found) throw new Error(`风格包 ${pack.styleId} 缺少字体角色 ${name}`);
  return found;
}

/** 字号按溢出降档缩放后取值 */
export function fontSize(ctx: SlideRenderContext, name: TypographyRoleName, step = 0): number {
  const spec = role(ctx.pack, name);
  const base = ctx.fontScale >= 1 ? spec.sizePx : Math.max(12, Math.round(spec.sizePx * ctx.fontScale));
  return base + step;
}

export function fontWeight(ctx: SlideRenderContext, name: TypographyRoleName): number {
  return role(ctx.pack, name).weight;
}

export function fontFamily(ctx: SlideRenderContext, name: TypographyRoleName): string {
  return role(ctx.pack, name).family;
}

export function lineHeight(ctx: SlideRenderContext, name: TypographyRoleName): number {
  return role(ctx.pack, name).lineHeight;
}

export function letterSpacing(ctx: SlideRenderContext, name: TypographyRoleName): string {
  return `${role(ctx.pack, name).letterSpacing}px`;
}

/** 数字一律等宽，保证多页之间对齐（PRD §3.4） */
export function numericStyle(ctx: SlideRenderContext, sizePx?: number): React.CSSProperties {
  const spec = role(ctx.pack, 'mono');
  return {
    fontFamily: spec.family,
    fontVariantNumeric: 'tabular-nums',
    fontSize: sizePx ?? spec.sizePx,
    fontWeight: spec.weight,
    lineHeight: spec.lineHeight,
  };
}

/** 画布尺寸（固定 16:9） */
export function canvasSize(ctx: SlideRenderContext) {
  return { w: ctx.canvas.w, h: ctx.canvas.h, margin: ctx.canvas.marginPx };
}
