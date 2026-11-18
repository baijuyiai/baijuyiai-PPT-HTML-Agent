import {
  type DesignLanguage,
  type PageType,
  type PendingConfirmItem,
  type RecipeSpacing,
} from '@lumen/ir-schema';
import { decodeImage, type DecodedImage } from './png.js';
import { mergeSimilar, quantize, toHsl, type Rgb } from './palette.js';

/**
 * 设计指纹：从设计稿像素里量出能可靠量到的那些维度。
 *
 * 诚实边界（这是这个文件最重要的部分）：
 *
 * **能直接量到**——底色明暗、留白占比、色相族数、彩色饱和度分布、细线（分隔线/网格线）数量、
 * 面板圆角的近似档位。
 *
 * **量不到**——阴影（截图里阴影只是几个像素的渐变，和抗锯齿分不开）、
 * 字体族（只能判衬线/无衬线，且中文截图上不可靠）、图标体系、页类型配方、
 * 以及所有 `guidance` 说明文字（那是人的判断，不是像素的属性）。
 *
 * 量不到的项**照抄基准族**，并写进 `pendingConfirm` 让人确认。
 * 假装能量到、把猜测当成识别结果，比明说「这项没量到」糟糕得多。
 */

export interface FingerprintSignals {
  ok: boolean;
  note: string;
  width: number;
  height: number;
  /** 出现最多的颜色，视为页面底色 */
  background: string;
  darkLeaning: boolean;
  /**
   * 边缘密度：与右邻或下邻差异明显的像素占比。
   *
   * 用它而不是「与底色接近的像素占比」量疏密：后者在密集深色仪表盘上会给出 0.74，
   * 因为那里占比最大的颜色是面板色而不是「空」——它量的是主导表面，不是疏密。
   * 边缘密度不依赖「哪个颜色算背景」，文字、线条、卡片边界都会计入。
   */
  edgeDensity: number;
  /** 覆盖率 ≥1.5% 的近似中性色数量，含底色。多层浅底意味着卡片是 tinted/glass */
  surfaceLevels: number;
  /** 色相族数量 */
  hueFamilies: number;
  /** 检出的细线数量（分隔线、表格线、图表网格线） */
  hairlines: number;
  /** 最大面板区域的圆角估计，单位是原图像素。量不到为 null */
  radiusPx: number | null;
}

const EMPTY: FingerprintSignals = {
  ok: false,
  note: '',
  width: 0,
  height: 0,
  background: '#FFFFFF',
  darkLeaning: false,
  edgeDensity: 0,
  surfaceLevels: 0,
  hueFamilies: 0,
  hairlines: 0,
  radiusPx: null,
};

/* ---------------- 像素工具 ---------------- */

interface Sample {
  w: number;
  h: number;
  /** 每格一个 RGB，采样后尺寸 */
  px: Uint8Array;
  /** 采样步长。把采样网格上的长度换算回原图长度要用它 */
  stride: number;
}

/** 等比降采样到长边不超过 maxEdge，既省时间又不影响统计类判断 */
function sample(img: { width: number; height: number; data: Uint8Array }, maxEdge = 200): Sample {
  const stride = Math.max(1, Math.ceil(Math.max(img.width, img.height) / maxEdge));
  const w = Math.max(1, Math.floor(img.width / stride));
  const h = Math.max(1, Math.floor(img.height / stride));
  const px = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const src = ((y * stride) * img.width + (x * stride)) * 4;
      const dst = (y * w + x) * 3;
      px[dst] = img.data[src]!;
      px[dst + 1] = img.data[src + 1]!;
      px[dst + 2] = img.data[src + 2]!;
    }
  }
  return { w, h, px, stride };
}

function at(s: Sample, x: number, y: number): Rgb {
  const i = (y * s.w + x) * 3;
  return { r: s.px[i]!, g: s.px[i + 1]!, b: s.px[i + 2]! };
}

function luma({ r, g, b }: Rgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 通道最大差。用它判断两色是否「看起来一样」，比欧氏距离更贴近人眼 */
function channelDiff(a: Rgb, b: Rgb): number {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b));
}

function toHex({ r, g, b }: Rgb): string {
  // 色桶给的是均值，是小数。不取整会拼出 '#18.ca3d70a3d70a1b...' 这种垃圾 hex
  return `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
}

/* ---------------- 细线检测 ---------------- */

/**
 * 细线：一整行（或一整列）与它上下各若干像素明显不同，且这一行自身是均匀的。
 *
 * 为什么看「自身均匀」：文字行的像素分布是乱的，细线的像素分布几乎恒定。
 * 这一条把「一行字」和「一条分隔线」分开了——只看对比度会把每行文字都算成线。
 */
function countHairlines(s: Sample, background: Rgb): number {
  const GAP = 3;
  const DIFF = 22;
  const UNIFORM = 14;
  let count = 0;
  let y = GAP;
  while (y < s.h - GAP) {
    if (isLineRow(s, y, background, GAP, DIFF, UNIFORM)) {
      count += 1;
      // 2px 的线会被相邻两行同时命中，跳过下一行避免数成两条
      y += 2;
    } else {
      y += 1;
    }
  }
  return count;
}

function isLineRow(s: Sample, y: number, background: Rgb, gap: number, diff: number, uniform: number): boolean {
  let uniformVotes = 0;
  let contrastVotes = 0;
  let total = 0;
  let min = 255;
  let max = 0;
  for (let x = 0; x < s.w; x += 1) {
    const c = at(s, x, y);
    const l = luma(c);
    if (l < min) min = l;
    if (l > max) max = l;
  }
  if (max - min > uniform) return false;
  const mid = (min + max) / 2;
  for (let x = 0; x < s.w; x += 1) {
    total += 1;
    const c = at(s, x, y);
    const above = at(s, x, Math.max(0, y - gap));
    const below = at(s, x, Math.min(s.h - 1, y + gap));
    // 该行相对上下邻域有可见差异
    if (Math.abs(luma(c) - mid) < uniform) uniformVotes += 1;
    if (channelDiff(c, above) > diff || channelDiff(c, below) > diff) contrastVotes += 1;
    if (channelDiff(c, background) < 8 && channelDiff(above, background) < 8) return false;
  }
  return uniformVotes / total > 0.85 && contrastVotes / total > 0.6;
}

/* ---------------- 圆角估计 ---------------- */

/**
 * 圆角。做法：找出覆盖率最高的非底色面板色，取它的包围盒，
 * 再看包围盒左上角 k×k 方块里有多少像素属于这个面板色。
 *
 * 直角时这块方块全是面板色；圆角越大，被底色吃掉的越多。关系是精确的：
 * 被吃掉的部分 = r²(1 − π/4)，所以 r = k·√((1 − fill) / (1 − π/4))。
 * 用公式而不是查表，是因为查表要把 fill 阈值和采样步长绑死，换个图尺寸就失准。
 *
 * 只有当面板「填满了自己的包围盒」（是个实心矩形）时才相信这个估计——
 * 否则说明这个颜色是散落分布的（比如一片文字），量出来的值没有意义。
 * 返回值单位是**原图像素**。
 */
function estimateRadius(s: Sample, panel: Rgb, background: Rgb, coverage: number): number | null {
  if (coverage < 0.06) return null;
  /**
   * 判定「这个像素属于面板」不能只看与面板色的距离：浅色面板与浅色底之间
   * 的差距常常不到 20，用固定阈值会把整张底也算成面板，量出的填充率恒为 1、圆角恒为 0。
   * 改成比「离面板近还是离底色近」——这是个最近质心分类，浅色对浅色也分得开。
   */
  const isPanel = (c: Rgb) => channelDiff(c, panel) <= 22 && channelDiff(c, panel) < channelDiff(c, background);
  let minX = s.w;
  let minY = s.h;
  let maxX = -1;
  let maxY = -1;
  let inside = 0;
  for (let y = 0; y < s.h; y += 1) {
    for (let x = 0; x < s.w; x += 1) {
      if (!isPanel(at(s, x, y))) continue;
      inside += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;
  if (boxW < 20 || boxH < 12) return null;
  // 面板色在包围盒里的填充率。散落分布时这个值很低，估计不可信
  // 门槛取 0.6：面板被内容切碎时（仪表盘上每一格都有文字与分隔线），
  // 包围盒会大到把缝隙也算进来，此时这个估计没有意义，宁可不给
  if (inside / (boxW * boxH) < 0.6) return null;

  const k = Math.min(20, Math.floor(Math.min(boxW, boxH) / 4));
  if (k < 5) return null;
  let panelPixels = 0;
  for (let y = minY; y < minY + k; y += 1) {
    for (let x = minX; x < minX + k; x += 1) {
      if (isPanel(at(s, x, y))) panelPixels += 1;
    }
  }
  const fill = panelPixels / (k * k);
  const CORNER = 1 - Math.PI / 4;
  // 圆角大到把整个 k×k 方块都卷进去时，公式不再成立，只能给个下界
  const rSampled = fill <= CORNER
    ? k
    : k * Math.sqrt((1 - fill) / CORNER);
  // 抗锯齿会让直角也吃掉不到一个像素，所以两个采样像素以内一律算直角
  const rOriginal = rSampled * s.stride;
  return rOriginal < 2.5 ? 0 : Math.round(rOriginal);
}

/* ---------------- 主入口 ---------------- */

export function fingerprintFromDataUrl(dataUrl: string): FingerprintSignals {
  let img;
  try {
    img = decodeImage(dataUrl);
  } catch (err) {
    return { ...EMPTY, note: err instanceof Error ? err.message : String(err) };
  }
  return fingerprintFromImage(img);
}

export function fingerprintFromImage(img: DecodedImage): FingerprintSignals {
  if (img.width < 32 || img.height < 32) return { ...EMPTY, note: '图片太小，量不出可靠的统计量' };

  const s = sample(img);
  // 先量化再合并相近色，否则同一块面板被拆成好几个桶，会把「面板层数」数多
  const buckets = mergeSimilar(quantize(img, 16), 26);
  const pixelTotal = buckets.reduce((n, b) => n + b.count, 0) || 1;
  const coverageOf = (b: { count: number }) => b.count / pixelTotal;
  const total = s.w * s.h;

  const top = buckets[0];
  if (!top) return { ...EMPTY, note: '图片里没有可统计的颜色' };

  const background = top.rgb;
  const darkLeaning = luma(background) < 128;

  // 边缘密度：与右邻或下邻差异明显的像素占比
  let edgePixels = 0;
  for (let y = 0; y < s.h; y += 1) {
    for (let x = 0; x < s.w - 1; x += 1) {
      const c = at(s, x, y);
      const right = at(s, x + 1, y);
      const below = y + 1 < s.h ? at(s, x, y + 1) : right;
      if (channelDiff(c, right) > 24 || channelDiff(c, below) > 24) edgePixels += 1;
    }
  }
  const edgeDensity = edgePixels / total;

  const hueFamilies = countHueFamilies(s);

  // 近似中性的、有一定覆盖率的面板色层数（含底色）
  const surfaceLevels = buckets.filter((b) => coverageOf(b) >= 0.015 && toHsl(b.rgb).s < 0.20).length;

  const panel = buckets.find((b, i) => i > 0 && coverageOf(b) >= 0.06 && toHsl(b.rgb).s < 0.30) ?? null;
  // 圆角另跑一遍更细的采样：全局统计用粗网格够快，但圆弧在粗网格上的锯齿
  // 会把「角上被吃掉的面积」算多，圆角估计系统性偏大。面板色与底色与分辨率无关，
  // 所以细网格这一次只需要重算几何量。
  const fine = sample(img, 512);
  const radiusPx = panel ? estimateRadius(fine, panel.rgb, background, coverageOf(panel)) : null;

  return {
    ok: true,
    note: '',
    width: img.width,
    height: img.height,
    background: toHex(background),
    darkLeaning,
    edgeDensity,
    surfaceLevels,
    hueFamilies,
    hairlines: countHairlines(s, background),
    radiusPx,
  };
}

/**
 * 数设计里用了多少族色相。
 *
 * 逐像素统计而不是统计量化桶：中位切分在小面积纯色上表现很差——
 * 一块彩色数据条只占几个百分点时，它的像素会被并进旁边的中性桶，
 * 均值一平均饱和度就掉到阈值以下，于是整族色相凭空消失。
 *
 * 判据：饱和度够、明度不贴两端（近黑近白没有色相可言），按 30° 分桶，
 * 单桶占比不到 0.3% 的当噪声丢掉，最后把环形相邻的桶并成一族。
 */
function countHueFamilies(s: Sample): number {
  const bins = new Array<number>(12).fill(0);
  let total = 0;
  for (let y = 0; y < s.h; y += 1) {
    for (let x = 0; x < s.w; x += 1) {
      const c = at(s, x, y);
      total += 1;
      const hsl = toHsl(c);
      if (hsl.s < 0.25 || hsl.l < 0.12 || hsl.l > 0.92) continue;
      const bin = Math.round(hsl.h / 30) % 12;
      bins[bin] = (bins[bin] ?? 0) + 1;
    }
  }
  if (total === 0) return 0;
  const floor = total * 0.003;
  const used = bins.map((n, i) => ({ n, i })).filter((b) => b.n >= floor).map((b) => b.i);
  if (used.length === 0) return 0;

  // 环形相邻合并：色相是环，340° 与 10° 属于同一族
  let families = used.length;
  for (let i = 0; i < used.length; i += 1) {
    const cur = used[i]!;
    const next = used[(i + 1) % used.length]!;
    const gap = i === used.length - 1 ? (next + 12 - cur) : (next - cur);
    if (gap === 1) families -= 1;
  }
  return Math.max(1, families);
}

/* ---------------- 指纹 → 设计语言 ---------------- */

export interface FingerprintResult {
  language: DesignLanguage;
  pending: PendingConfirmItem[];
  /** 实际覆盖了哪些项，用于在界面上说明「量到了什么」 */
  applied: string[];
}

/**
 * 用指纹覆盖基准族的设计语言。
 *
 * 只有判定「信号足够明确」时才覆盖；模棱两可时保留基准族的值，
 * 因为基准族的值是设计过的，而一个不可靠的测量结果只会更差。
 */
export function applyFingerprint(base: DesignLanguage, signals: FingerprintSignals): FingerprintResult {
  const applied: string[] = [];
  const pending: PendingConfirmItem[] = [];
  const language: DesignLanguage = structuredClone(base);

  if (!signals.ok) {
    pending.push({
      field: 'fingerprint',
      question: `没能从图片量出设计指纹（${signals.note}），当前沿用基准族的完整设计语言，请确认各项是否符合预期`,
      candidates: [], resolved: '',
    });
    return { language, pending, applied };
  }

  /* --- 疏密：边缘密度是直接测量，最可信的一项 --- */
  const spacing: RecipeSpacing | null = signals.edgeDensity <= 0.06 ? 'airy'
    : signals.edgeDensity >= 0.30 ? 'tight' : null;
  if (spacing) {
    for (const recipe of language.pageRecipes) recipe.spacing = spacing;
    applied.push(`疏密：边缘密度 ${(signals.edgeDensity * 100).toFixed(1)}% → ${spacing}`);
  } else {
    // 中间地带说不准，保留基准族的疏密，别拿一个勉强够格的测量去覆盖设计过的取值
    pending.push({
      field: 'pageRecipes.spacing',
      question: `边缘密度 ${(signals.edgeDensity * 100).toFixed(1)}% 落在中间地带，疏密沿用基准族，可手动改`,
      candidates: ['tight', 'normal', 'airy'],
      resolved: language.pageRecipes[0]?.spacing ?? 'normal',
    });
  }

  /* --- 图表色板：看设计里用了多少族色相 --- */
  if (signals.hueFamilies >= 3) {
    language.chart.palette = 'categorical';
    applied.push(`图表色板：设计里出现 ${signals.hueFamilies} 族色相 → 多色系`);
  } else if (signals.hueFamilies === 1) {
    language.chart.palette = 'mono-ramp';
    applied.push('图表色板：只有一族色相 → 单色系');
  } else {
    language.chart.palette = 'brand-first';
    applied.push(`图表色板：${signals.hueFamilies} 族色相 → 主色优先`);
  }

  /* --- 网格线：细线数量 --- */
  if (signals.hairlines >= 8) {
    language.chart.gridLines = true;
    applied.push(`图表网格线：检出 ${signals.hairlines} 条细线 → 有网格`);
  } else if (signals.hairlines === 0) {
    language.chart.gridLines = false;
    language.gui.divider = 'none';
    applied.push('图表网格线：没有细线 → 无网格、无分隔线');
  } else {
    language.chart.gridLines = false;
    applied.push(`图表网格线：细线较少（${signals.hairlines} 条）→ 按无网格处理`);
  }

  /* --- 卡片表面：中性面板层数 --- */
  if (signals.surfaceLevels >= 4) {
    language.gui.card.surface = 'tinted';
    applied.push(`卡片表面：${signals.surfaceLevels} 层中性面 → 浅底卡片`);
  } else if (signals.surfaceLevels <= 2) {
    language.gui.card.surface = 'flat';
    applied.push(`卡片表面：只有 ${signals.surfaceLevels} 层中性面 → 无底色卡片`);
  }

  /* --- 圆角：近似估计，只用于把档位对齐到最近的整数档 --- */
  if (signals.radiusPx !== null) {
    // 量到的是原图像素，先按「设计稿高 : 1080」折算到画布，再对齐到整数档
    const r = Math.round(signals.radiusPx * (1080 / (signals.height || 1080)));
    const card = r >= 18 ? 18 : r >= 14 ? 14 : r >= 10 ? 10 : r >= 6 ? 8 : r >= 3 ? 6 : 4;
    language.gui.radius.card = card;
    language.gui.radius.control = Math.max(4, card - 4);
    language.gui.radius.inner = Math.max(2, Math.round(card / 2));
    applied.push(`圆角：估计 ${r}px → 卡片 ${card}px`);
    pending.push({
      field: 'gui.radius',
      question: `圆角是从面板拐角像素估出来的（约 ${r}px），可能受抗锯齿影响，请确认`,
      candidates: ['4', '6', '8', '10', '14', '18'],
      resolved: String(card),
    });
  } else {
    pending.push({
      field: 'gui.radius',
      question: '图片里找不到一块足够完整的面板，圆角无法测量，当前沿用基准族的圆角',
      candidates: ['4', '6', '8', '10', '14', '18'],
      resolved: String(language.gui.radius.card),
    });
  }

  /* --- 量不到的项：明说没量到，别假装 --- */
  pending.push(
    {
      field: 'gui.shadow',
      question: '阴影在截图里与抗锯齿混在一起，无法可靠测量，当前沿用基准族',
      candidates: ['none', 'sm', 'md', 'lg'],
      resolved: language.gui.shadow,
    },
    {
      field: 'iconography.container',
      question: '图标容器无法从一张设计稿判定，当前沿用基准族',
      candidates: ['none', 'circle', 'squircle', 'square'],
      resolved: language.iconography.container,
    },
    {
      field: 'guidance',
      question: '使用说明是对「怎么用这套语言」的判断，像素里没有这个信息，当前沿用基准族的说明文字，建议按你的偏好改写',
      candidates: [],
      resolved: '',
    },
  );

  return { language, pending, applied };
}

/** 多张图取中位数后再套用，避免某一张截歪了把整包带跑 */
export function mergeFingerprints(list: FingerprintSignals[]): FingerprintSignals {
  const ok = list.filter((f) => f.ok);
  if (ok.length === 0) return { ...EMPTY, note: list[0]?.note ?? '没有可用的图片' };
  if (ok.length === 1) return ok[0]!;
  const median = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)]!;
  };
  const radii = ok.map((f) => f.radiusPx).filter((r): r is number => r !== null);
  return {
    ok: true,
    note: `${ok.length} 张图取中位数`,
    width: median(ok.map((f) => f.width)),
    height: median(ok.map((f) => f.height)),
    background: ok[0]!.background,
    darkLeaning: ok.filter((f) => f.darkLeaning).length * 2 > ok.length,
    edgeDensity: median(ok.map((f) => f.edgeDensity)),
    surfaceLevels: Math.round(median(ok.map((f) => f.surfaceLevels))),
    hueFamilies: Math.round(median(ok.map((f) => f.hueFamilies))),
    hairlines: Math.round(median(ok.map((f) => f.hairlines))),
    radiusPx: radii.length > 0 ? median(radii) : null,
  };
}

/** 页类型列表，供 UI 展示「这套语言覆盖了哪些页」 */
export const FINGERPRINT_PAGE_TYPES: PageType[] = [
  'cover', 'toc', 'section', 'text', 'imageText', 'chart', 'metrics', 'end',
];

/** 未被指纹覆盖、必然来自基准族的字段，界面要如实标出来 */
export const NOT_MEASURABLE = ['阴影', '字体族', '图标体系', '页类型配方', '使用说明'] as const;

/**
 * 接上看图模型之后，这些「像素量不出来」的项就补上了。
 *
 * 分成两组的理由是这句话要能跟着实际跑没跑模型变：
 * 没接模型时说「字体族沿用基准族」是对的，接了模型还这么说就是撒谎。
 */
export const VISION_COVERED: string[] = ['字体族', '页类型配方', '使用说明'];

/**
 * 「未能测量的项」那句话。哪些项仍缺由调用方说了算——
 * 两端用同一个函数生成，替换时才不会因为措辞对不上而漏改。
 */
export function notMeasurableClause(missing: readonly string[]): string {
  return missing.length > 0 ? `未能测量的项（${missing.join('、')}）沿用基准族，请确认。` : '';
}
