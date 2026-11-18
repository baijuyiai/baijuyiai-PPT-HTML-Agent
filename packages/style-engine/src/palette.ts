import { decodeImage, type DecodedImage } from './png.js';
import { fromHex, hslToRgb, toHex, toHsl, type Hsl, type Rgb } from './color.js';

/**
 * 取色与调色板归一化。
 * 用中位切分（median cut）量化，再按色相/明度把结果归到品牌色、辅助色、中性色三个角色上。
 *
 * 纯色彩换算（`toHex` / `fromHex` / `toHsl` / `hslToRgb` / `complementOf`）住在
 * `color.ts`：主入口要保持浏览器可用，而这个文件顶部引了 `./png.js`（node:zlib）。
 * 这里转出去，既有的 `import { toHsl } from './palette.js'` 不用改。
 */
export { fromHex, hslToRgb, toHex, toHsl, type Hsl, type Rgb } from './color.js';

function luminance({ r, g, b }: Rgb): number {
  const ch = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export interface ColorBucket {
  hex: string;
  rgb: Rgb;
  /** 该桶覆盖的像素数 */
  count: number;
}

/**
 * 中位切分量化。返回按像素数降序的色桶。
 * 采样步长自适应，避免大图逐像素遍历。
 */
export function quantize(img: DecodedImage, maxColors = 8): ColorBucket[] {
  const total = img.width * img.height;
  const step = Math.max(1, Math.floor(Math.sqrt(total / 20000)));
  const pixels: Rgb[] = [];
  for (let y = 0; y < img.height; y += step) {
    for (let x = 0; x < img.width; x += step) {
      const i = (y * img.width + x) * 4;
      const a = img.data[i + 3]!;
      if (a < 128) continue; // 跳过透明像素
      pixels.push({ r: img.data[i]!, g: img.data[i + 1]!, b: img.data[i + 2]! });
    }
  }
  if (pixels.length === 0) return [];

  let buckets: Rgb[][] = [pixels];
  while (buckets.length < maxColors) {
    // 选出跨度最大的桶继续切
    let targetIdx = -1;
    let targetRange = -1;
    let targetChannel: keyof Rgb = 'r';
    buckets.forEach((bucket, i) => {
      if (bucket.length < 2) return;
      for (const ch of ['r', 'g', 'b'] as const) {
        const values = bucket.map((p) => p[ch]);
        const range = Math.max(...values) - Math.min(...values);
        if (range > targetRange) {
          targetRange = range;
          targetIdx = i;
          targetChannel = ch;
        }
      }
    });
    if (targetIdx < 0 || targetRange <= 0) break;
    const bucket = buckets[targetIdx]!;
    bucket.sort((a, b) => a[targetChannel] - b[targetChannel]);
    const mid = Math.floor(bucket.length / 2);
    buckets = [...buckets.slice(0, targetIdx), bucket.slice(0, mid), bucket.slice(mid), ...buckets.slice(targetIdx + 1)];
  }

  return buckets
    .filter((b) => b.length > 0)
    .map((b) => {
      const rgb = {
        r: b.reduce((n, p) => n + p.r, 0) / b.length,
        g: b.reduce((n, p) => n + p.g, 0) / b.length,
        b: b.reduce((n, p) => n + p.b, 0) / b.length,
      };
      return { hex: toHex(rgb), rgb, count: b.length };
    })
    .sort((a, b) => b.count - a.count);
}

/** 合并肉眼接近的颜色，避免同一色被拆成多个桶 */
export function mergeSimilar(buckets: ColorBucket[], threshold = 26): ColorBucket[] {
  const out: ColorBucket[] = [];
  for (const b of buckets) {
    const near = out.find((o) =>
      Math.abs(o.rgb.r - b.rgb.r) + Math.abs(o.rgb.g - b.rgb.g) + Math.abs(o.rgb.b - b.rgb.b) < threshold);
    if (near) near.count += b.count;
    else out.push({ ...b });
  }
  return out.sort((a, b) => b.count - a.count);
}

/** 从 data URL 提取主色 */
export function paletteFromDataUrl(dataUrl: string, maxColors = 8): ColorBucket[] {
  const img = decodeImage(dataUrl);
  return mergeSimilar(quantize(img, maxColors * 2), 26).slice(0, maxColors);
}

export interface RolePalette {
  brand500: string;
  brand600: string;
  brand100: string;
  accent500: string;
  accent100: string;
  neutral900: string;
  neutral700: string;
  neutral500: string;
  neutral300: string;
  neutral100: string;
  neutral0: string;
  /** 该结果有多少依据（0–1），用于置信度加权 */
  strength: number;
}

const FALLBACK: Omit<RolePalette, 'strength'> = {
  brand500: '#6D4AFF', brand600: '#5A38E6', brand100: '#EFEAFE',
  accent500: '#FF7A1A', accent100: '#FFF0E6',
  neutral900: '#0F1115', neutral700: '#4A4F5A', neutral500: '#8A8F99',
  neutral300: '#E6E8EC', neutral100: '#F7F8FA', neutral0: '#FFFFFF',
};

function adjustLightness(rgb: Rgb, delta: number): Rgb {
  const hsl = toHsl(rgb);
  const l = Math.max(0, Math.min(1, hsl.l + delta));
  return hslToRgb({ ...hsl, l });
}

/**
 * 把一组主色归到设计角色上。
 * 规则：饱和度足够高的主色分列品牌色与辅助色（取出现最多的两个不同色相），
 * 其余按明度铺成中性色阶。
 */
/**
 * 主色是不是「能当主色」。
 *
 * 只看出现频率会选错：插画和截图里面积最大的彩色往往是浅色底纹，
 * 拿它当品牌色，按钮会白成一片、强调词浮不起来——识别出来的设计语言直接不可用。
 * 所以这里既看覆盖度，也看它落在不在可用区间。
 */
function brandUsability(hsl: Hsl): number {
  const s = Math.min(1, hsl.s / 0.45);
  const l = hsl.l < 0.28
    ? Math.max(0, hsl.l / 0.28)
    : hsl.l > 0.78
      ? Math.max(0, 1 - (hsl.l - 0.78) / 0.22)
      : 1;
  return s * l;
}

/** 已经能当主色的颜色原样保留；明显不能的，保住色相拉到可用区间 */
function toUsableBrand(rgb: Rgb): { rgb: Rgb; normalized: boolean } {
  const hsl = toHsl(rgb);
  if (hsl.s >= 0.35 && hsl.l >= 0.30 && hsl.l <= 0.72) return { rgb, normalized: false };
  return {
    rgb: hslToRgb({ h: hsl.h, s: Math.max(hsl.s, 0.62), l: Math.min(0.58, Math.max(0.44, hsl.l)) }),
    normalized: true,
  };
}

/**
 * 正文色亮度上限。
 * 数值按内置风格包的实测对比度反推：五个内置包的正文字色对比度都在 16–18，
 * 识别出来的包如果只有 6 出头，同一份 deck 换个风格就显得灰扑扑，level 就参差了。
 */
const TEXT_MAX_L = 0.18;
/** 底色亮度下限。低于它就不是「底」了，深色文字压上去读不出来。 */
const BG_MIN_L = 0.92;

/** 保住色相，把亮度压到能当正文色 */
function ensureDark(rgb: Rgb): Rgb {
  const hsl = toHsl(rgb);
  if (hsl.l <= TEXT_MAX_L) return rgb;
  // 极浅的源图连色相都不可信，直接给中性近黑，不要染上一个没根据的颜色
  const s = hsl.s < 0.12 ? 0 : Math.min(hsl.s, 0.22);
  return hslToRgb({ h: hsl.h, s, l: TEXT_MAX_L });
}

/** 保住色相，把亮度提到能当底色 */
function ensureLight(rgb: Rgb): Rgb {
  const hsl = toHsl(rgb);
  if (hsl.l >= BG_MIN_L) return rgb;
  const s = hsl.s < 0.12 ? 0 : Math.min(hsl.s, 0.18);
  return hslToRgb({ h: hsl.h, s, l: BG_MIN_L });
}

/**
 * 浅色底纹（选中态、标签底）。
 * 亮度封顶在 0.94：推成纯白就丢了品牌色相，界面上「品牌浅底」这个层级就没了。
 */
function softTint(rgb: Rgb): Rgb {
  const hsl = toHsl(rgb);
  return hslToRgb({ h: hsl.h, s: Math.max(hsl.s, 0.30), l: Math.min(0.94, hsl.l + 0.42) });
}

/** 次要文字与分隔线用的中间调，对齐内置包 neutral700 的对比度水平（约 8:1） */
function ensureMid(rgb: Rgb): Rgb {
  const hsl = toHsl(rgb);
  if (hsl.l >= 0.26 && hsl.l <= 0.40) return rgb;
  return hslToRgb({ h: hsl.h, s: Math.min(hsl.s, 0.16), l: 0.32 });
}

export function classifyPalette(buckets: ColorBucket[]): RolePalette {
  if (buckets.length === 0) return { ...FALLBACK, strength: 0 };

  const total = buckets.reduce((n, b) => n + b.count, 0);
  const chromatic = buckets
    .map((b) => ({ ...b, hsl: toHsl(b.rgb), lum: luminance(b.rgb) }))
    .filter((b) => b.hsl.s >= 0.18 && b.hsl.l > 0.06 && b.hsl.l < 0.94);

  const achromatic = buckets
    .map((b) => ({ ...b, hsl: toHsl(b.rgb), lum: luminance(b.rgb) }))
    .sort((a, b) => b.lum - a.lum);

  const coverage = (b?: ColorBucket) => (b && total > 0 ? b.count / total : 0);

  // 主色 = 覆盖度 × 可用性 最高者；辅助色 = 色相离它最远的那一个
  const ranked = chromatic
    .map((c) => ({ c, score: coverage(c) * brandUsability(c.hsl) }))
    .sort((a, b) => b.score - a.score);
  const picked = ranked[0]?.c;
  const brand = picked ? toUsableBrand(picked.rgb) : null;
  const accentPicked = picked
    ? chromatic
      .filter((c) => c !== picked)
      .map((c) => ({ c, dist: Math.min(Math.abs(c.hsl.h - picked.hsl.h), 360 - Math.abs(c.hsl.h - picked.hsl.h)) }))
      .sort((a, b) => b.dist - a.dist)[0]?.c
    : undefined;
  const accent = accentPicked ? toUsableBrand(accentPicked.rgb) : null;

  const neutralLightRaw = achromatic[0]?.rgb ?? fromHex('#FFFFFF');
  const neutralDarkRaw = achromatic[achromatic.length - 1]?.rgb ?? fromHex('#0F1115');
  // 文字色与底色必须有对比度底线：源图整体偏浅时，最深的颜色也当不了正文色，
  // 直接拿它铺上去正文会糊在背景里。所以两头都加护栏，只借它的色相。
  const neutralDark = ensureDark(neutralDarkRaw);
  const neutralLight = ensureLight(neutralLightRaw);
  // 中间调（次要文字、分隔线）同理，落在两端的过渡带上
  const mid = ensureMid(achromatic[Math.floor(achromatic.length / 2)]?.rgb ?? adjustLightness(neutralDark, 0.35));

  // 需要规整说明源图没有可直接用的主色，信号强度要打折，免得界面给出虚高的置信度
  const penalty = (brand?.normalized ? 0.6 : 1) * (accent && accent.normalized ? 0.85 : 1);
  const strength = Math.min(
    1,
    (coverage(picked) * 3 + coverage(accentPicked) * 2 + (chromatic.length > 0 ? 0.4 : 0)) * penalty,
  );

  return {
    brand500: brand ? toHex(brand.rgb) : FALLBACK.brand500,
    brand600: brand ? toHex(adjustLightness(brand.rgb, -0.12)) : FALLBACK.brand600,
    brand100: brand ? toHex(softTint(brand.rgb)) : FALLBACK.brand100,
    accent500: accent ? toHex(accent.rgb) : FALLBACK.accent500,
    accent100: accent ? toHex(softTint(accent.rgb)) : FALLBACK.accent100,
    neutral900: toHex(neutralDark),
    neutral700: toHex(mid),
    neutral500: toHex(adjustLightness(mid, 0.14)),
    neutral300: toHex(adjustLightness(neutralLight, -0.09)),
    neutral100: toHex(adjustLightness(neutralLight, -0.03)),
    neutral0: toHex(neutralLight),
    strength,
  };
}

/** 从多张图各自取色后投票合并（PRD §5.2 聚类投票） */
export function votePalettes(palettes: ColorBucket[][]): ColorBucket[] {
  const merged: ColorBucket[] = [];
  for (const p of palettes) {
    for (const b of p) {
      const near = merged.find((m) =>
        Math.abs(m.rgb.r - b.rgb.r) + Math.abs(m.rgb.g - b.rgb.g) + Math.abs(m.rgb.b - b.rgb.b) < 34);
      if (near) near.count += b.count;
      else merged.push({ ...b });
    }
  }
  return merged.sort((a, b) => b.count - a.count);
}
