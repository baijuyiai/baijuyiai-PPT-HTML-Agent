import { decodeImage } from '@lumen/style-engine/png';
import type { StockKind } from './index.js';

/**
 * 把一张 PNG 算成清单里的一条。
 *
 * 清单原先是一份手写的 JSON，加一张图要手抄色板与明暗。这里把**能算的那部分**算出来；
 * 算不出来的（作者、来源、许可、标签）一律留空——脚本不去编造出处。
 *
 * 只认 PNG：抠图是透明底的，JPEG 存不了 alpha。
 */

/** 抽样上限。抠图素材常有几千像素见方，逐像素统计没必要 */
const SAMPLE_BUDGET = 40000;

/**
 * 一张图里有没有真正的透明像素——也就是「是不是抠图」。
 *
 * 判两条，两条都是**像素占比**、与主体形状无关：
 * 1. **透明像素占 5% 以上**——没有透明区的图就是普通照片。
 * 2. **不透明像素占 1% 以上**——挡的是整张全透明的空文件、以及只有几个噪点的废图。
 *
 * **第 2 条的阈值必须是 1% 这种量级，不能是 5%。** 原先两条都写 5%，那是按人像
 * 抠图定的——人像在画框里占一大块。实测踩到的：一座斜拉桥不透明像素只占 3.8%，
 * 一枚火箭只占 9.7% 但主体细长……后者其实过得了 5%，前者过不了。后果不只是难看：
 * 它进不了 `OBJECT_POOL`（判据是 `transparent === true`），却会掉进普通配图池，
 * 被当成照片配到 16:9 的图位上——透明底 + `object-fit: cover`，页面上浮着一座桥。
 *
 * **试过改成「看主体的包围盒」**（要求两个方向都横跨画幅 20% 以上），理由是
 * 它对「又扁又宽」的桥更宽容。但那只是把问题挪了个位置：火箭的包围盒是
 * 20%×92%，宽度正好卡在线上；灯塔 29%、机器人 39%，也都贴着。**包围盒是
 * 形状相关的量，拿它当阈值就必然对某一类形状不公平。** 占比才是形状无关的那个。
 */
export function looksTransparent(img: { width: number; height: number; data: Uint8Array }): boolean {
  const total = img.width * img.height;
  if (total === 0) return false;
  let clear = 0;
  let solid = 0;
  for (let i = 3; i < img.data.length; i += 4) {
    if (img.data[i]! < 8) clear += 1;
    else if (img.data[i]! > 200) solid += 1;
  }
  // 两条都要满足：整体半透明的图（柔光之类）不是抠图，整张全透明的空文件也不是
  return clear / total > 0.05 && solid / total > 0.01;
}

/** 量化到每通道 32 级后取出现最多的几桶，再各自取桶内均值 */
export function dominantColors(
  img: { width: number; height: number; data: Uint8Array },
  count = 3,
): string[] {
  const total = img.width * img.height;
  if (total === 0) return [];
  const step = Math.max(1, Math.floor(total / SAMPLE_BUDGET));
  const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let p = 0; p < total; p += step) {
    const i = p * 4;
    if (img.data[i + 3]! < 128) continue;
    const r = img.data[i]!;
    const g = img.data[i + 1]!;
    const b = img.data[i + 2]!;
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const cur = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    cur.n += 1;
    cur.r += r;
    cur.g += g;
    cur.b += b;
    buckets.set(key, cur);
  }
  return [...buckets.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map((c) => `#${[c.r, c.g, c.b]
      .map((v) => Math.round(v / c.n).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()}`);
}

/** 不透明部分的平均明度（Rec.601）。0.5 是明暗分界，与清单里那些照片同一口径 */
export function averageLuminance(img: { width: number; height: number; data: Uint8Array }): number {
  const total = img.width * img.height;
  if (total === 0) return 0.5;
  const step = Math.max(1, Math.floor(total / SAMPLE_BUDGET));
  let sum = 0;
  let n = 0;
  for (let p = 0; p < total; p += step) {
    const i = p * 4;
    if (img.data[i + 3]! < 128) continue;
    sum += (0.299 * img.data[i]! + 0.587 * img.data[i + 1]! + 0.114 * img.data[i + 2]!) / 255;
    n += 1;
  }
  return n === 0 ? 0.5 : sum / n;
}

/** 清单里的一条。作者、来源、许可、标签留给人工填 */
export interface AnalyzedStock {
  file: string;
  kind: StockKind;
  author: string;
  source: string;
  license: string;
  tone: 'light' | 'dark';
  transparent: boolean;
  palette: string[];
  tags: string[];
}

/**
 * 从文件名前缀认题材。认不出回 `null`。
 *
 * **刻意没有兜底值。** 这里原先由 `analyzePng` 硬编码成 `people`——在本仓的 PNG
 * 只有人物抠图时它是对的，加了物件素材之后 12 张物件会被全打成人物：它们会掉进
 * `PEOPLE_POOL`（判据是 `kind === 'people'`），而 `OBJECT_POOL`（`kind !== 'people'`）
 * 一张都收不到。症状是「配了物件却一个都不出现」，页面上不报错。
 *
 * 前缀就是素材的命名约定（`people-*` / `object-*`），是这张图上唯一能读出题材的信号——
 * 像素里读不出「这是人还是大厦」。所以宁可认不出时停下报错，也不猜。
 */
export function kindFromFilename(file: string): StockKind | null {
  if (file.startsWith('people-')) return 'people';
  if (file.startsWith('object-')) return 'object';
  return null;
}

/**
 * 从 PNG 字节算出一条清单项。解不开就抛，由调用方决定是跳过还是中止整批。
 *
 * `kind` 由调用方给（`stock-add` 用 `kindFromFilename` 从文件名推）：这个函数的职责是
 * **量像素**，题材是语义，不是它能在像素里看出来的东西。
 *
 * 作者、来源、许可、标签算不出来，一律留空——脚本不编造出处，由调用方补。
 */
export function analyzePng(file: string, bytes: Uint8Array, kind: StockKind): AnalyzedStock {
  const img = decodeImage(`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`);
  return {
    file,
    kind,
    author: '',
    source: '',
    license: '',
    tone: averageLuminance(img) < 0.5 ? 'dark' : 'light',
    transparent: looksTransparent(img),
    palette: dominantColors(img),
    tags: [],
  };
}
