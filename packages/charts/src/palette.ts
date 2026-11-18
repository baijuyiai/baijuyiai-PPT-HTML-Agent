import type { StyleTokens } from '@lumen/ir-schema';
import type { ChartSpec } from './types.js';

/**
 * 从风格包色板派生图表色板。
 * 取色顺序固定：brand500、accent500、brand600、info、success、warning、neutral500、error。
 * 同一颜色可能被多个 token 复用，这里按首次出现顺序去重。
 */
export function paletteFromStyle(tokens: StyleTokens): string[] {
  const ordered = [
    tokens.brand500,
    tokens.accent500,
    tokens.brand600,
    tokens.info,
    tokens.success,
    tokens.warning,
    tokens.neutral500,
    tokens.error,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const color of ordered) {
    if (!seen.has(color)) {
      seen.add(color);
      out.push(color);
    }
  }
  return out;
}

/** 页面解析后的配色。`style-doc.ts` 的 `StylePalette` 就这几个字段 */
export interface ResolvedPalette {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  brand: string;
  border: string;
}

/**
 * 从**页面配色**派生图表色板——新链路走的是这一条，不是 `paletteFromStyle`。
 *
 * 新链路的 `StyleDoc` 只有解析后的 7 色 `palette`，**没有 `tokens`**
 * （`brand500`/`info`/`success` 那一套只在旧链路的 `StylePack` 上）。
 * 所以序列色板只能从品牌色与强调色派生：两色交替、逐级提亮，
 * 六色以内彼此分得开，够绝大多数演示文稿用。
 *
 * **不写死 info/success/warning 那几个语义色的默认值**：它们是蓝绿橙红，
 * 套在一套暖米白或墨绿的风格上会非常突兀。宁可同色系，也不要撞色。
 */
export function paletteFromPalette(p: ResolvedPalette): string[] {
  const brand = p.brand || p.accent || '#3B82F6';
  const accent = p.accent && p.accent !== brand ? p.accent : lighten(brand, 0.45);
  return [
    brand,
    accent,
    lighten(brand, 0.35),
    lighten(accent, 0.35),
    lighten(brand, 0.62),
    lighten(accent, 0.62),
  ];
}

/** 图表主题：文字、弱化文字、网格线、背景。**从解析后的页面配色取，不从 tokens 取** */
export function chartThemeFromPalette(p: ResolvedPalette): ChartSpec['theme'] {
  return {
    text: p.text,
    muted: p.muted,
    grid: p.border,
    // 页面底色。SVG 自己是透明的，这个值只用来画格子之间的缝、树状图的间隔——
    // 用页面底色才对，用 'transparent' 那些缝会看不见
    background: p.bg,
    accent: p.accent,
  };
}

/** 图表主题：文字、弱化文字、网格线、背景（背景透传，交给页面底色） */
export function chartTheme(tokens: StyleTokens): ChartSpec['theme'] {
  return {
    text: tokens.neutral900,
    muted: tokens.neutral500,
    grid: tokens.neutral300,
    background: 'transparent',
    accent: tokens.accent500,
  };
}

/* ---------------- 颜色工具 ---------------- */

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

/** 向白色靠拢。非 6 位 hex 原样返回，让调用方不必先判断 */
export function lighten(hex: string, t: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  return toHex(c.map((v) => v + (255 - v) * t) as [number, number, number]);
}

/**
 * 给颜色加透明度，输出 `rgba(...)`。
 *
 * **ECharts 的渐变写法要的是 `rgba`**（`colorStops` 里的 `color` 走 zrender 的
 * 颜色解析，`#RRGGBBAA` 那种八位 hex 在部分路径上不被认）。所以这里不输出 hex8。
 *
 * 认不出的颜色（`rgb(...)`、命名色、已经是 `rgba(...)`）原样返回——
 * 调用方不必先判断，代价只是这一处渐变会退化成实色。
 */
export function alpha(hex: string, a: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  const [r, g, b] = c;
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}

/**
 * 单色系阶梯：从基色出发，逐级向白色靠拢。
 * 学术严谨族用它——多色会让人觉得结论有主次之分，而单色系只表达「同类的几组」。
 */
export function monoRamp(base: string, n: number): string[] {
  if (n <= 1) return [base];
  const out: string[] = [];
  // 从 0 到 0.6，避免最后一级浅到看不见
  for (let i = 0; i < n; i += 1) out.push(i === 0 ? base : lighten(base, (i / (n - 1)) * 0.6));
  return out;
}
