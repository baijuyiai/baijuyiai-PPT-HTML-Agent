import type { LayoutVariantSpec, PageType, StylePack, VariantGeometry } from '@lumen/ir-schema';

/**
 * 规范化版式变体集。
 *
 * 关键不变式：**所有风格族必须定义完全相同的 variant id 集合**，差异只体现在容量数值与视觉处理上。
 * 这样渲染引擎可以用一张注册表处理所有风格，避免「某风格缺某个版式」导致的运行期崩溃。
 * 风格族标识由 Deck 的 styleId 携带，不编码进 variant id。
 */

/** 容量画像：决定一套版式的疏密程度 */
export interface CapacityProfile {
  /** 基准标题可容纳字数 */
  titleChars: number;
  /** 基准正文字数 */
  bodyChars: number;
  /** 疏密系数。学术偏密（<1），品牌偏疏（>1） */
  density: number;
}

interface VariantShape {
  id: string;
  pageType: PageType;
  titleChars: number;
  titleLines: number;
  bodyChars: number;
  blocks: number;
  bullets: number;
  metrics: number;
  imageRatios?: string[];
  imageCounts?: number[];
}

/** 21 个变体的容量骨架，数值为「标准疏密」下的取值 */
export const VARIANT_SHAPES: VariantShape[] = [
  // 封面
  { id: 'cover/centered@v1', pageType: 'cover', titleChars: 54, titleLines: 3, bodyChars: 60, blocks: 2, bullets: 0, metrics: 0 },
  { id: 'cover/left-aligned@v1', pageType: 'cover', titleChars: 48, titleLines: 3, bodyChars: 80, blocks: 3, bullets: 0, metrics: 0 },
  { id: 'cover/full-bleed@v1', pageType: 'cover', titleChars: 36, titleLines: 2, bodyChars: 40, blocks: 2, bullets: 0, metrics: 0, imageRatios: ['16:9'], imageCounts: [1] },
  // 目录页
  // 目录的正文容量要按「能列多少条」估：一条标题约 14 字，两列版式给到十条上下
  { id: 'toc/columns@v1', pageType: 'toc', titleChars: 24, titleLines: 2, bodyChars: 220, blocks: 2, bullets: 0, metrics: 0 },
  { id: 'toc/numbered@v1', pageType: 'toc', titleChars: 22, titleLines: 2, bodyChars: 170, blocks: 2, bullets: 0, metrics: 0 },
  // 章节页
  { id: 'section/numbered@v1', pageType: 'section', titleChars: 30, titleLines: 2, bodyChars: 80, blocks: 3, bullets: 3, metrics: 0 },
  { id: 'section/minimal@v1', pageType: 'section', titleChars: 36, titleLines: 2, bodyChars: 50, blocks: 2, bullets: 0, metrics: 0 },
  // 纯文本
  { id: 'text/one-column@v1', pageType: 'text', titleChars: 28, titleLines: 2, bodyChars: 320, blocks: 6, bullets: 5, metrics: 3 },
  { id: 'text/two-column@v1', pageType: 'text', titleChars: 28, titleLines: 2, bodyChars: 380, blocks: 7, bullets: 5, metrics: 4 },
  { id: 'text/bullets@v1', pageType: 'text', titleChars: 26, titleLines: 2, bodyChars: 200, blocks: 6, bullets: 5, metrics: 3 },
  // 图文
  { id: 'imageText/left-right@v1', pageType: 'imageText', titleChars: 26, titleLines: 2, bodyChars: 160, blocks: 4, bullets: 4, metrics: 2, imageRatios: ['4:3', '3:4', '1:1'], imageCounts: [1] },
  { id: 'imageText/right-left@v1', pageType: 'imageText', titleChars: 26, titleLines: 2, bodyChars: 160, blocks: 4, bullets: 4, metrics: 2, imageRatios: ['4:3', '3:4', '1:1'], imageCounts: [1] },
  { id: 'imageText/full-bleed-overlay@v1', pageType: 'imageText', titleChars: 22, titleLines: 2, bodyChars: 90, blocks: 3, bullets: 2, metrics: 1, imageRatios: ['16:9'], imageCounts: [1] },
  { id: 'imageText/two-up@v1', pageType: 'imageText', titleChars: 24, titleLines: 2, bodyChars: 120, blocks: 5, bullets: 3, metrics: 2, imageRatios: ['4:3', '1:1'], imageCounts: [2] },
  { id: 'imageText/three-up@v1', pageType: 'imageText', titleChars: 24, titleLines: 2, bodyChars: 90, blocks: 5, bullets: 3, metrics: 3, imageRatios: ['4:3', '1:1'], imageCounts: [3] },
  { id: 'imageText/four-grid@v1', pageType: 'imageText', titleChars: 22, titleLines: 2, bodyChars: 80, blocks: 5, bullets: 3, metrics: 4, imageRatios: ['1:1', '4:3'], imageCounts: [4] },
  // 图表
  { id: 'chart/full@v1', pageType: 'chart', titleChars: 28, titleLines: 2, bodyChars: 120, blocks: 3, bullets: 3, metrics: 2, imageRatios: [], imageCounts: [] },
  { id: 'chart/side-by-side@v1', pageType: 'chart', titleChars: 26, titleLines: 2, bodyChars: 140, blocks: 4, bullets: 3, metrics: 2, imageRatios: [], imageCounts: [] },
  // 指标
  { id: 'metrics/hero-metric@v1', pageType: 'metrics', titleChars: 24, titleLines: 2, bodyChars: 80, blocks: 3, bullets: 0, metrics: 1 },
  { id: 'metrics/three-card@v1', pageType: 'metrics', titleChars: 24, titleLines: 2, bodyChars: 90, blocks: 4, bullets: 0, metrics: 3 },
  { id: 'metrics/four-card@v1', pageType: 'metrics', titleChars: 22, titleLines: 2, bodyChars: 80, blocks: 5, bullets: 0, metrics: 4 },
  // 结尾
  { id: 'end/centered@v1', pageType: 'end', titleChars: 30, titleLines: 2, bodyChars: 80, blocks: 3, bullets: 0, metrics: 0 },
  { id: 'end/contact@v1', pageType: 'end', titleChars: 24, titleLines: 2, bodyChars: 160, blocks: 4, bullets: 3, metrics: 0 },
];

/** 所有风格族都必须实现的 variant id 集合 */
export const CANONICAL_VARIANT_IDS: readonly string[] = VARIANT_SHAPES.map((v) => v.id);

/**
 * 版式几何：23 个版式各自怎么排。
 *
 * 放在这里、紧挨着容量骨架，是刻意的——**几何与容量必须同步**。
 * 溢出适配（render-engine 的 fitPage）与 lint 的 capacity/* 都是纯计算，
 * 只比容量数字、不看像素。几何改了而容量没跟上，两边会一起说谎：
 * 页面已经装不下，系统却认为一切正常。
 *
 * 从 buildLayouts 生成，风格包因此可以带自己的几何——识别出来的风格
 * 才有可能真的按原稿排版，而不是所有风格都套同一副骨架。
 */
const G = (partial: Partial<VariantGeometry>): VariantGeometry => ({
  kind: 'left-stack',
  align: 'left',
  titleStep: 0,
  subUnderTitle: true,
  gapRatio: 0.06,
  mediaRatio: 0.46,
  needsMedia: false,
  captionPlacement: 'below',
  ...partial,
});

export const DEFAULT_VARIANT_GEOMETRY: Record<string, VariantGeometry> = {
  'cover/centered@v1': G({ kind: 'centered', align: 'center', titleStep: 1, gapRatio: 0.08 }),
  'cover/left-aligned@v1': G({ titleStep: 1, gapRatio: 0.08 }),
  'cover/full-bleed@v1': G({ kind: 'overlay', titleStep: 1, needsMedia: true, mediaRatio: 1, captionPlacement: 'none' }),

  'toc/columns@v1': G({ kind: 'toc-grid' }),
  'toc/numbered@v1': G({ kind: 'toc-list', titleStep: 1, gapRatio: 0.07 }),

  'section/numbered@v1': G({ kind: 'numbered', titleStep: 1, gapRatio: 0.05 }),
  'section/minimal@v1': G({ kind: 'minimal', titleStep: 1, gapRatio: 0.04 }),

  'text/one-column@v1': G({}),
  'text/two-column@v1': G({ kind: 'two-column', gapRatio: 0.05 }),
  'text/bullets@v1': G({ gapRatio: 0.05 }),

  'imageText/left-right@v1': G({ kind: 'media-left', needsMedia: true }),
  'imageText/right-left@v1': G({ kind: 'media-right', needsMedia: true }),
  'imageText/full-bleed-overlay@v1': G({ kind: 'overlay', needsMedia: true, mediaRatio: 1, captionPlacement: 'none' }),
  'imageText/two-up@v1': G({ kind: 'grid-2', needsMedia: true, mediaRatio: 1, gapRatio: 0.05 }),
  'imageText/three-up@v1': G({ kind: 'grid-3', needsMedia: true, mediaRatio: 1, gapRatio: 0.05 }),
  'imageText/four-grid@v1': G({ kind: 'grid-4', needsMedia: true, mediaRatio: 1, gapRatio: 0.04 }),

  'chart/full@v1': G({ kind: 'chart-full', gapRatio: 0.05 }),
  'chart/side-by-side@v1': G({ kind: 'chart-split', mediaRatio: 0.62, gapRatio: 0.05 }),

  'metrics/hero-metric@v1': G({ kind: 'hero-metric', gapRatio: 0.06 }),
  'metrics/three-card@v1': G({ kind: 'cards-3', gapRatio: 0.06 }),
  'metrics/four-card@v1': G({ kind: 'cards-4', gapRatio: 0.05 }),

  'end/centered@v1': G({ kind: 'centered', align: 'center', titleStep: 1, gapRatio: 0.08 }),
  'end/contact@v1': G({ gapRatio: 0.06 }),
};

/**
 * 取某个版式的几何。
 *
 * 优先读风格包自带的 geometry；老包里没有这一项，回落到规范表；
 * 连规范表里也没有（版式 id 不认识）时回落到文本版式，避免渲染期崩溃。
 */
export function geometryFor(variant: { id: string; geometry?: VariantGeometry }): VariantGeometry {
  if (variant.geometry) return variant.geometry;
  return DEFAULT_VARIANT_GEOMETRY[variant.id] ?? DEFAULT_VARIANT_GEOMETRY['text/one-column@v1']!;
}

/**
 * 按容量画像生成一套版式定义。
 *
 * 一条要紧的区分：**字数按疏密缩放，数量不缩放**。
 *
 * 疏密（density）说的是「同样的版面能塞下多少字」，所以 titleChars / bodyChars 要乘上它。
 * 但要点数、块数、指标数是**布局里有多少个槽位**，是版式自身的结构，
 * 跟这套风格疏还是密没有关系——同一个版式画几个卡片，换个风格不会变。
 *
 * 早先这里把数量也乘了疏密系数，后果是系统性的：商务经典的疏密系数约 1.45，
 * 五个要点版式的 maxBullets 被压到 3，而内容引擎按品质基线给到 5 条要点，
 * 于是几乎每一页都被判定「溢出」，白降两档字号再拆页。实测十页的 deck 有六页被降了字号。
 */
export function buildLayouts(
  profile: CapacityProfile,
  /** 按页类型覆盖几何。识别出来的风格靠它按原稿排布 */
  geometryByPageType: Partial<Record<PageType, Partial<VariantGeometry>>> = {},
): LayoutVariantSpec[] {
  const { titleChars, bodyChars, density } = profile;
  const titleScale = titleChars / 24;
  const bodyScale = bodyChars / 220;
  const dens = 1 / density;

  // 字数的下限是 1：一个版式不可能「一个字都放不下」
  const round = (n: number) => Math.max(1, Math.round(n));
  const cap = (n: number, max: number) => Math.min(round(n), max);
  // 槽位数的下限是 0：封面就是不放大指标，声明 0 就该是 0。
  // 用上面的 round 会把 0 抬成 1，于是封面被算成「能放一个指标卡」，
  // 样机里凭空多出一个数字——这是实测发现的。
  const slots = (n: number, max: number) => Math.min(Math.max(0, Math.round(n)), max);

  return VARIANT_SHAPES.map((s) => ({
    id: s.id,
    pageType: s.pageType,
    // 封面/章节页的标题可以显著更长，用各自的骨架值放大
    maxTitleChars: cap(s.titleChars * titleScale * dens, 80),
    maxTitleLines: s.titleLines,
    maxBodyChars: cap(s.bodyChars * bodyScale * dens, 900),
    maxBlocks: slots(s.blocks, 9),
    // 一页要点上限受品质基线硬约束（PRD §3.1 / §5.3）
    maxBullets: slots(s.bullets, 5),
    maxMetrics: slots(s.metrics, 6),
    imageRatios: s.imageRatios ?? [],
    imageCounts: s.imageCounts ?? [],
    columns: 12,
    // 几何与容量在同一次遍历里一起写出去，这是「两者不许漂移」的实现方式
    geometry: {
      ...(DEFAULT_VARIANT_GEOMETRY[s.id] ?? G({})),
      ...(geometryByPageType[s.pageType] ?? {}),
    },
  }));
}

/** 取某风格包中指定 id 的版式；找不到抛错而不是静默回退 */
export function findVariant(pack: StylePack, variantId: string): LayoutVariantSpec {
  const found = pack.base.layouts.find((l) => l.id === variantId);
  if (!found) throw new Error(`风格包 ${pack.styleId}@${pack.version} 缺少版式 ${variantId}`);
  return found;
}

/** 取某页类型下的全部可用版式 */
export function variantsForPageType(pack: StylePack, pageType: PageType): LayoutVariantSpec[] {
  return pack.base.layouts.filter((l) => l.pageType === pageType);
}

/** 按内容量挑一个该页类型下容量最合适的版式（容量够用者中取最小的） */
export function pickVariant(
  pack: StylePack,
  pageType: PageType,
  need: { titleChars: number; bodyChars: number; blocks: number; bullets: number; metrics: number },
): LayoutVariantSpec {
  const candidates = variantsForPageType(pack, pageType);
  if (candidates.length === 0) throw new Error(`风格包 ${pack.styleId} 没有 ${pageType} 类型的版式`);
  const fits = candidates.filter(
    (l) =>
      l.maxTitleChars >= need.titleChars &&
      l.maxBodyChars >= need.bodyChars &&
      l.maxBlocks >= need.blocks &&
      l.maxBullets >= need.bullets &&
      l.maxMetrics >= need.metrics,
  );
  const pool = fits.length > 0 ? fits : candidates;
  // 够用的里面选容量最小的，避免小内容配大版式显得空
  return pool.reduce((best, cur) => (cur.maxBodyChars < best.maxBodyChars ? cur : best), pool[0]!);
}
