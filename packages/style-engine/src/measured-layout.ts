import {
  FONT_SIZE_LADDER,
  type LayoutGrid,
  type MeasuredPage,
  type PageType,
  type PendingConfirmItem,
  type StylePack,
  type VariantGeometry,
} from '@lumen/ir-schema';
import type { CapacityProfile } from './variant-set.js';
import { placeOnGrid } from './grid.js';

/**
 * 把「从设计稿量出来的结构」变成「风格包能用的版式与容量」。
 *
 * ## 为什么容量必须跟着几何一起推
 *
 * 溢出适配（render-engine 的 fitPage）与 lint 的 capacity/* 都是**纯计算**，
 * 只比 maxTitleChars / maxBodyChars 这些数字，完全不看像素。
 * 如果只把几何换成原稿的百分比、容量却沿用基准族，两边会一起说谎：
 * 页面已经装不下，系统却认为一切正常，于是静默溢出——这是整个改造里最大的风险点。
 *
 * ## 换算链
 *
 * 设计稿上量到的是**像素高度**，而 measureContent 累加的是**字数**，中间要过三关：
 *
 *   行数     = floor(带高 / (字号 × 行高))
 *   每行字数 = floor(内容宽 / (字号 × 字宽比))
 *   容量     = 行数 × 每行字数
 *
 * 字号取自风格包自己的排印角色，并先吸附到字号阶梯（12/14/16/20/24/32/40/56）。
 * 吸附一律**向下取整**：渲染字号比原稿小，能塞下的字更多，是安全的方向。
 */

/** 画布尺寸。与 design-system 的 tokens 一致 */
const CANVAS_W = 1920;
const CANVAS_H = 1080;

/**
 * 平均字宽与字号之比。
 *
 * 中文全角约 1.0，英文约 0.55。这套系统以中文稿为主，取 0.9 留一点余量。
 * 这个值直接影响 maxBodyChars 的量级，所以配套的容量区间要卡住下限，
 * 避免稿子偏英文时算出一个虚高一倍的容量。
 */
const CHAR_EM = 0.9;

export interface MeasuredLayout {
  /** 从设计稿量出来的版式网格。写进设计语言，渲染与规格都按它来 */
  grid: LayoutGrid;
  /** 反推出来的容量画像，交给 buildLayouts 生成整套版式 */
  capacity: CapacityProfile;
  /** 每个页类型量出来的几何覆盖 */
  byPageType: Partial<Record<PageType, Partial<VariantGeometry>>>;
  /** 量到的页边距，写回 rules.marginRatio */
  marginRatio: number | null;
  /** 量到了哪些项，界面上如实说明 */
  applied: string[];
  /** 量不出的项 */
  pending: PendingConfirmItem[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 把字号吸附到阶梯上，**向下**取整——渲染字号小一点是安全方向 */
function snapDown(px: number): number {
  let best: number = FONT_SIZE_LADDER[0]!;
  for (const step of FONT_SIZE_LADDER) if (step <= px) best = step;
  return best;
}

function roleOf(pack: StylePack, name: string) {
  return pack.base.typography.roles.find((r) => r.role === name);
}

const median = (xs: number[]): number => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

/** 一条带按给定字号能装下多少字 */
function charsIn(band: { heightRatio: number; widthRatio: number }, sizePx: number, lineHeight: number): number {
  const bandPx = band.heightRatio * CANVAS_H;
  const widthPx = band.widthRatio * CANVAS_W;
  const lineBox = sizePx * lineHeight;
  if (lineBox <= 0) return 0;
  // 带里不全是文字，上下各有留白。取七成是保守估计，宁可少算也不静默溢出
  const lines = Math.floor((bandPx * 0.7) / lineBox);
  const perLine = Math.floor(widthPx / (sizePx * CHAR_EM));
  return Math.max(0, lines) * Math.max(0, perLine);
}

/**
 * 反推整套版式与容量。
 *
 * 容量取**所有量出结构的页的中位数**，而不是逐页类型各推一套：
 * buildLayouts 是按一个画像生成全部版式的，逐页类型各推一套要改动它的结构，
 * 收益与风险不成比例。逐页类型的差异体现在几何（对齐、横带）上，
 * 那是用户看得见的部分。
 */
export function deriveMeasuredLayout(
  pages: MeasuredPage[],
  pack: StylePack,
  /** 从完整结构量出来的网格。缺省时沿用风格包自己的 */
  measuredGrid?: LayoutGrid,
): MeasuredLayout {
  const grid: LayoutGrid = measuredGrid ?? pack.base.language.grid;
  const applied: string[] = [];
  const pending: PendingConfirmItem[] = [];
  // 一条带都没有的结构不带任何信息，别拿它去覆盖几何——那只会把 align 之类的字段
  // 改成一个没有依据的默认值
  const ok = pages.filter((p) => p.ok && p.bands.length > 0);

  const titleRole = roleOf(pack, 'title');
  const bodyRole = roleOf(pack, 'body');
  const byPageType: Partial<Record<PageType, Partial<VariantGeometry>>> = {};

  if (ok.length === 0 || !titleRole || !bodyRole) {
    pending.push({
      field: 'layouts',
      question: ok.length === 0
        ? '没有一页能量出排版结构（多半是满幅图片、渐变底或纯色页），版式沿用基准族'
        : '风格包缺少 title / body 排印角色，容量无法反推，沿用基准族',
      candidates: [],
      resolved: '',
    });
    return {
      grid,
      capacity: { titleChars: 24, bodyChars: 200, density: 1 },
      byPageType,
      marginRatio: null,
      applied,
      pending,
    };
  }

  const titleSize = snapDown(titleRole.sizePx);
  const bodySize = snapDown(bodyRole.sizePx);

  /* ---- 容量：标题取标题带，正文取最高的那条文字带 ---- */
  const titleCharsList: number[] = [];
  const bodyCharsList: number[] = [];
  for (const page of ok) {
    const title = page.bands.find((b) => b.role === 'title');
    if (title) titleCharsList.push(charsIn(title, titleSize, titleRole.lineHeight));
    const bodyBands = page.bands.filter((b) => b.role === 'body' || b.role === 'subtitle');
    const tallest = bodyBands.reduce<typeof bodyBands[number] | null>(
      (best, b) => (!best || b.heightRatio > best.heightRatio ? b : best), null,
    );
    if (tallest) bodyCharsList.push(charsIn(tallest, bodySize, bodyRole.lineHeight));
  }

  const measuredTitle = median(titleCharsList);
  const measuredBody = median(bodyCharsList);

  /* ---- 疏密：文字带高之和占内容框的比例 ---- */
  /**
   * 只累加**文字带**。
   *
   * 图区带可以和文字带纵向重叠（「右侧整列照片」那种版式就是一条满高的图区带
   * 叠在文字带旁边），把它的高度也加进来，占比会超过 100%，疏密被判成「偏密」，
   * 于是容量被压低——明明版面很松，生成出来的文字却被挤成一团。
   */
  const coverageList = ok.map((page) => {
    const boxH = 1 - page.contentBox.top - page.contentBox.bottom;
    const sum = page.bands
      .filter((b) => b.role !== 'visual')
      .reduce((n, b) => n + b.heightRatio, 0);
    return boxH > 0.1 ? Math.min(1, sum / boxH) : 0.5;
  });
  const coverage = median(coverageList);
  // density 越大越疏（brand-design 1.15 / academic-rigor 0.85），与 buildLayouts 的语义一致
  const density = coverage > 0.62 ? 0.9 : coverage < 0.35 ? 1.15 : 1.0;

  /**
   * 把量到的字数换算成「画像值」。
   *
   * buildLayouts 里 maxTitleChars = 版式自身骨架值 × (profile.titleChars / 24) × (1/density)，
   * 所以要让 text/one-column（骨架 28）正好落在量到的容量上，画像值要除回这两项。
   */
  const dens = 1 / density;
  const capacity: CapacityProfile = {
    titleChars: measuredTitle > 0
      ? clamp(Math.round((measuredTitle * 24) / (28 * dens)), 12, 80)
      : 24,
    bodyChars: measuredBody > 0
      ? clamp(Math.round((measuredBody * 220) / (320 * dens)), 80, 700)
      : 200,
    density,
  };
  applied.push(`容量：标题 ${capacity.titleChars} 字 / 正文 ${capacity.bodyChars} 字（按原稿带高与字号反推，向下取整）`);
  applied.push(`疏密：内容占内容框 ${(coverage * 100).toFixed(0)}% → ${density < 1 ? '偏密' : density > 1 ? '偏疏' : '标准'}`);

  /* ---- 每页类型的几何 ---- */
  for (const page of ok) {
    const { pageType } = page;
    const geometry: Partial<VariantGeometry> = {
      align: page.align,
      bands: page.bands.map((b) => ({
        role: b.role,
        topRatio: +b.topRatio.toFixed(4),
        heightRatio: +b.heightRatio.toFixed(4),
        leftRatio: +b.leftRatio.toFixed(4),
        widthRatio: +b.widthRatio.toFixed(4),
        columns: b.columns,
        align: b.align,
        // 落到网格上：横向对栏线，纵向按基线记行位
        ...placeOnGrid(b, grid, page.contentBox),
      })),
    };

    // 带与带之间的留白 → gapRatio。这是原稿纵向节奏的直接体现。
    // 同样只看文字带：满高的图区带会横跨整条链，把每一段的间隙都算成负数
    const sorted = [...page.bands.filter((b) => b.role !== 'visual')].sort((a, b) => a.topRatio - b.topRatio);
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i += 1) {
      const gap = sorted[i]!.topRatio - (sorted[i - 1]!.topRatio + sorted[i - 1]!.heightRatio);
      if (gap > 0) gaps.push(gap);
    }
    if (gaps.length > 0) geometry.gapRatio = +clamp(median(gaps), 0.02, 0.12).toFixed(4);

    // 图区占比：最宽的那条实心带（不是满幅时）
    const surface = page.bands
      .filter((b) => b.role === 'visual' || b.role === 'metrics')
      .reduce<typeof page.bands[number] | null>(
        (best, b) => (!best || b.widthRatio > best.widthRatio ? b : best), null,
      );
    if (surface && surface.widthRatio < 0.8) geometry.mediaRatio = +surface.widthRatio.toFixed(4);

    byPageType[pageType] = geometry;
  }
  applied.push(`版式：${Object.keys(byPageType).length} 类页面按原稿的横带结构排布`);

  /* ---- 页边距 ---- */
  // 居中排布的页面量不出页边距：它的内容框就是文字本身的宽度，
  // 拿它当页边距会把留白算得远小于实际。这类页面直接跳过，让调用方保留基准值
  /**
   * 取左右两侧**较小的那个**，不取平均。
   *
   * 平均只在版面左右对称时才等于页边距。一旦内容只占半幅（左文右图的稿子很常见），
   * 平均会把「文字到右边那条分隔线」的距离也算成留白，量出一个大得多的数——
   * 实测半幅文字栏能把 5% 的边距算成 25%。页边距的语义是「内容离最近的页面边缘多远」，
   * 那就是两侧间隙里小的那个。
   */
  const margins = ok
    .filter((page) => page.align === 'left')
    .map((page) => Math.min(page.contentBox.left, page.contentBox.right))
    .filter((m) => m > 0);
  /**
   * 下限取 0.05 而不是 0.03。
   *
   * 设计 Lint 要求边距 ≥ 画布宽 5%（PRD §3.1），这里夹到 0.03 的话，
   * 量出一份 3% 边距的稿子会得到一个**存不进去**的风格包——保存接口校验不过就 400。
   * 两边必须同一个下限，否则「能识别、不能保存」这种状态会一直挂着。
   * 真量到低于下限时抬到 5% 并写进待确认项，不假装没这回事。
   */
  const rawMargin = margins.length > 0 ? median(margins) : null;
  const marginRatio = rawMargin !== null ? +clamp(rawMargin, 0.05, 0.12).toFixed(4) : null;
  if (rawMargin !== null && rawMargin < 0.05) {
    pending.push({
      field: 'margin',
      question: `量到的页边距只有 ${(rawMargin * 100).toFixed(1)}%，低于设计系统下限 5%，已抬到 5%。`
        + '留白会比原稿窄一些，可以在这里调回去。',
      candidates: [],
      resolved: '5%',
    });
  }
  if (marginRatio !== null) applied.push(`页边距：量到 ${(marginRatio * 100).toFixed(1)}%`);

  /* ---- 没量到的页类型要明说 ---- */
  const covered = new Set(Object.keys(byPageType));
  const ALL: PageType[] = ['cover', 'toc', 'section', 'text', 'imageText', 'chart', 'metrics', 'end'];
  const missing = ALL.filter((t) => !covered.has(t));
  if (missing.length > 0) {
    pending.push({
      field: 'layouts',
      question: `没有设计稿覆盖这几类页面：${missing.join('、')}。它们的版式沿用基准族`,
      candidates: ALL,
      resolved: [...covered].join('、'),
    });
  }

  applied.push(
    `网格：${grid.columns} 栏 · 栏距 ${grid.gutter}px · 基线 ${grid.baseline}px`,
  );

  return { grid, capacity, byPageType, marginRatio, applied, pending };
}
