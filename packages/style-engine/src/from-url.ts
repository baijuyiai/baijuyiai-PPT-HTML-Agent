import { fromHex, toHsl, type ColorBucket, type Rgb } from './palette.js';

/**
 * 网页风格信号提取。
 * 只做静态解析：抓取 HTML，从 <style>、内联 style 与 <link> 指向的样式表里提取色值、字体与字号。
 * 不执行脚本——执行页面脚本会带来安全与性能问题，而设计语言信号绝大多数存在于静态样式里。
 */

export interface UrlSignals {
  /** 按出现次数加权的主色 */
  colors: ColorBucket[];
  /** 按出现频次排序的字体族 */
  fonts: string[];
  /** 出现过的字号 */
  fontSizes: number[];
  /** 是否成功取到有效样式 */
  ok: boolean;
  /** 解析失败的说明 */
  note: string;
}

const HEX_RE = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
const RGB_RE = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*([\d.]+)\s*)?\)/g;
const FONT_FAMILY_RE = /font-family\s*:\s*([^;}"']+)/gi;
const FONT_SIZE_RE = /font-size\s*:\s*(\d+(?:\.\d+)?)\s*(px|rem|em)/gi;
const STYLE_BLOCK_RE = /<style[^>]*>([\s\S]*?)<\/style>/gi;
const LINK_RE = /<link[^>]+rel\s*=\s*["']?stylesheet["']?[^>]*href\s*=\s*["']([^"']+)["']/gi;
const INLINE_STYLE_RE = /style\s*=\s*["']([^"']+)["']/gi;

function pushColor(map: Map<string, number>, rgb: Rgb, weight = 1): void {
  const key = `${Math.round(rgb.r)},${Math.round(rgb.g)},${Math.round(rgb.b)}`;
  map.set(key, (map.get(key) ?? 0) + weight);
}

function extractFromCss(css: string, colors: Map<string, number>, fonts: Map<string, number>, sizes: Map<number, number>): void {
  for (const m of css.matchAll(HEX_RE)) {
    pushColor(colors, fromHex(m[0]!));
  }
  for (const m of css.matchAll(RGB_RE)) {
    const alpha = m[4] === undefined ? 1 : Number(m[4]);
    // 透明色是装饰性蒙层，不代表设计主色
    if (alpha < 0.5) continue;
    pushColor(colors, { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) });
  }
  for (const m of css.matchAll(FONT_FAMILY_RE)) {
    const families = (m[1] ?? '')
      .split(',')
      .map((f) => f.trim().replace(/^["']|["']$/g, ''))
      .filter((f) => f.length > 0 && !/^(inherit|initial|unset|sans-serif|serif|monospace|system-ui)$/i.test(f));
    for (const f of families) fonts.set(f, (fonts.get(f) ?? 0) + 1);
  }
  for (const m of css.matchAll(FONT_SIZE_RE)) {
    const value = Number(m[1]);
    const unit = m[2]!;
    const px = unit === 'px' ? value : value * 16; // rem/em 按 16px 基准换算
    if (px >= 10 && px <= 120) sizes.set(Math.round(px), (sizes.get(Math.round(px)) ?? 0) + 1);
  }
}

export async function analyzeUrl(url: string, fetchImpl: typeof fetch = fetch): Promise<UrlSignals> {
  const colors = new Map<string, number>();
  const fonts = new Map<string, number>();
  const sizes = new Map<number, number>();
  let note = '';

  let html = '';
  try {
    const res = await fetchImpl(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; LumenDeckStyleBot/1.0)' },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return { colors: [], fonts: [], fontSizes: [], ok: false, note: `抓取失败：HTTP ${res.status}` };
    }
    html = await res.text();
  } catch (err) {
    return {
      colors: [], fonts: [], fontSizes: [], ok: false,
      note: `抓取失败：${err instanceof Error ? err.message : String(err)}`,
    };
  }

  for (const m of html.matchAll(STYLE_BLOCK_RE)) extractFromCss(m[1] ?? '', colors, fonts, sizes);
  for (const m of html.matchAll(INLINE_STYLE_RE)) extractFromCss(m[1] ?? '', colors, fonts, sizes);
  // 页面上直接写的 hex（例如 SVG 内联）也算信号
  for (const m of html.matchAll(HEX_RE)) pushColor(colors, fromHex(m[0]!));

  // 外部样式表：最多拉取前 3 个，避免抓取失控
  const links = [...html.matchAll(LINK_RE)].slice(0, 3);
  for (const link of links) {
    const href = link[1]!;
    try {
      const abs = new URL(href, url).href;
      const res = await fetchImpl(abs, { signal: AbortSignal.timeout(10000) });
      if (res.ok) extractFromCss(await res.text(), colors, fonts, sizes);
    } catch {
      // 单个样式表失败不影响整体识别
    }
  }

  const buckets: ColorBucket[] = [...colors.entries()]
    .map(([key, count]) => {
      const [r, g, b] = key.split(',').map(Number) as [number, number, number];
      return {
        hex: `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`.toUpperCase(),
        rgb: { r, g, b },
        count,
      };
    })
    .sort((a, b) => b.count - a.count);

  const ok = buckets.length > 0;
  if (!ok) note = '页面中没有解析到静态色值，可能是纯脚本渲染的站点';

  return {
    colors: buckets,
    fonts: [...fonts.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f),
    fontSizes: [...sizes.entries()].sort((a, b) => b[1] - a[1]).map(([s]) => s),
    ok,
    note,
  };
}

/** 判断取到的色是否整体偏暗（用于推荐深色友好的风格族） */
export function isDarkLeaning(buckets: ColorBucket[]): boolean {
  if (buckets.length === 0) return false;
  const total = buckets.reduce((n, b) => n + b.count, 0);
  const dark = buckets
    .filter((b) => toHsl(b.rgb).l < 0.35)
    .reduce((n, b) => n + b.count, 0);
  return dark / total > 0.5;
}
