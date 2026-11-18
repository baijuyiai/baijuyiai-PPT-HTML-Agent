/**
 * 纯色彩换算。**没有任何 import**——主入口要保持浏览器可用，而 `palette.ts`
 * 顶部引了 `./png.js`（node:zlib），所以这几个函数得单独放一处。
 *
 * 原先它们定义在 `palette.ts` 里。搬到这儿之后那边 re-export 回去，
 * 既有的 `import { toHsl } from './palette.js'` 一处都不用改。
 */

export interface Rgb { r: number; g: number; b: number }
export interface Hsl { h: number; s: number; l: number }

export function toHex({ r, g, b }: Rgb): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

export function fromHex(hex: string): Rgb {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  let s = m[1]!;
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
}

export function toHsl({ r, g, b }: Rgb): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s, l };
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/**
 * 互补色：色相转 180°。**用途是讲解光标**——它要压在主色调铺的版面上，
 * 同色系会糊在一起，所以取主色的互补。
 *
 * **明度与饱和度要拉到能看清的区间，不是照搬原值。** 深色品牌色（深海军蓝 L≈15%）
 * 的互补色是深黄，压在深色版面上等于没有；浅米色（L≈85%）的互补色是浅紫，
 * 压在浅色版面上同样糊。互补只管色相，「看不看得清」是另一件事。
 *
 * 认不出的输入（`var(--brand-500)`、空串）按黑处理，照常回一个合法颜色——
 * 上游传进来的未必是十六进制，而光标少画一次比抛错强。
 */
export function complementOf(
  hex: string,
  opts: { minL?: number; maxL?: number; minS?: number } = {},
): string {
  const { minL = 0.52, maxL = 0.72, minS = 0.5 } = opts;
  const hsl = toHsl(fromHex(hex));
  // 无彩色（灰）没有色相可言，转了还是灰；给个固定的高对比色相，至少看得见
  const h = hsl.s < 0.06 ? 190 : (hsl.h + 180) % 360;
  const l = Math.min(maxL, Math.max(minL, hsl.l));
  const s = Math.max(minS, hsl.s);
  return toHex(hslToRgb({ h, s, l }));
}
