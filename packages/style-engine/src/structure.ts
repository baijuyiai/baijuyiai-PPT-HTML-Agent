import type { PageType } from '@lumen/ir-schema';
import { decodeImage, type DecodedImage } from './png.js';
import { cropForMeasure, upscaleTo, MEASURE_WIDTH } from './image-ops.js';

/**
 * 排版结构提取：从一张设计稿的像素里量出「这一页怎么排」。
 *
 * 与 fingerprint.ts 的分工：那边量的是**全图统计量**（疏密、色相族数、细线数量、
 * 圆角档位），回答「这套设计什么调性」；这边量的是**东西在哪**（内容分几条横带、
 * 每条带的上下位置与高度占比、左对齐还是居中、带内分几栏、装饰件压在哪），
 * 回答「这一页怎么排」。后者才是「换个风格排版就变」的前提。
 *
 * ## 核心判据：两个尺度的模糊相减
 *
 * `d = |blurSmall − blurLarge|`，超过阈值即为内容。这一个式子同时解决四件事：
 *
 * - **渐变底**：线性渐变在任意尺度的局部均值都等于中心值，`d ≈ 0`。
 *   这是前一版用「与众数底色之差」时整页塌成一条带的根因。
 * - **压缩噪声**：`blurSmall` 把噪声平均掉，`blurLarge` 更是几乎无噪，
 *   所以 `d` 的噪声底远小于原始噪声，阈值可以压得很低。
 * - **深色稿上的卡片**：卡片面与底色的通道差常常只有 10~20
 *   （实测 #141821 对 #0B0E14 差 13），低于为压噪声而设的文字阈值，
 *   单一阈值下整块卡片会凭空消失。用大半径模糊时，卡片内部对「局部底色」
 *   的偏离接近满幅对比，就分得开了。
 * - **整幅图片**：同理，是内容。
 *
 * 之前那版「平面区域连通块 + 面积最大的那块是底」的机制因此可以整块去掉：
 * `d > T` 已经把底排除掉了，不需要再回头找哪个是底。
 *
 * ## 装饰件
 *
 * 细竖条（强调线）会污染它所在带的 bbox 与栏数——实测加一条 6px 竖条会把
 * 眉标带从「1 栏左对齐」变成「2 栏」。所以对内容连通块按长宽比摘出「高而窄」
 * 与「宽而薄」的，单独记进 accents，不参与带分割。
 */

/* ---------------- 输出类型 ---------------- */

export type BandRole =
  | 'eyebrow' | 'title' | 'subtitle' | 'body'
  | 'visual' | 'metrics' | 'footer' | 'unknown';

export type BandKind = 'text' | 'surface' | 'chart' | 'mixed';

export interface StructureBand {
  role: BandRole;
  /** 带顶相对画布高的比例 */
  topRatio: number;
  heightRatio: number;
  /** 带内内容的左右边界，相对画布宽 */
  leftRatio: number;
  widthRatio: number;
  /** 带内文字行数 */
  lines: number;
  kind: BandKind;
  /** 带内「墨」的密度。实心卡片接近 0，文字带明显更高 */
  inkDensity: number;
  /** 带内分几栏 */
  columns: number;
  /** 每栏的横向范围（相对画布宽）。算栏距与网格对齐要用 */
  spans: { left: number; width: number }[];
  /** 有几栏是实心面。用来区分指标卡（每栏都是面）与图文页（一栏面一栏字） */
  surfaceSpans: number;
  align: 'left' | 'center' | 'n/a';
}

export interface StructureAccent {
  kind: 'vrule' | 'hrule';
  leftRatio: number;
  topRatio: number;
  widthRatio: number;
  heightRatio: number;
}

export interface PageStructure {
  ok: boolean;
  /** 量不出时说明为什么，界面照实转达 */
  note: string;
  canvas: { w: number; h: number };
  /** 内容框 */
  contentBox: { left: number; right: number; top: number; bottom: number };
  columns: number;
  align: 'left' | 'center';
  bands: StructureBand[];
  accents: StructureAccent[];
  /** 量到的噪声底与两个阈值，调参时要看 */
  noiseFloor: number;
  barrierThreshold: number;
  inkThreshold: number;
}

const EMPTY: PageStructure = {
  ok: false,
  note: '',
  canvas: { w: 0, h: 0 },
  contentBox: { left: 0, right: 0, top: 0, bottom: 0 },
  columns: 1,
  align: 'left',
  bands: [],
  accents: [],
  noiseFloor: 0,
  barrierThreshold: 0,
  inkThreshold: 0,
};

/* ---------------- 参数 ---------------- */

/** 工作分辨率上限。上传的图客户端已压到长边 900，这里只是兜底 */
const MAX_EDGE = 1200;
/** 小半径：保留文字的高频，同时把逐像素噪声平均掉 */
const SMALL_RADIUS_RATIO = 0.004;
/** 栅格格子边长（像素）。越小定位越准，越大抗噪越强 */
const GRID_CELL = 4;
/** 判边界时比的邻居距离，单位是格。隔两格比隔一格更稳：单格可能正好落在抗锯齿的过渡上 */
const BARRIER_STEP = 2;
/** 边界格要连成多长的一条线才作数。散乱的纹理过不了这一关 */
const LINE_MIN_RUN = 3;
/** 文字阈值下限 */
const MIN_INK_THRESHOLD = 14;
/** 行覆盖达到画布宽多少算「这一行有内容」 */
const BAND_ROW_THRESHOLD = 0.02;
/**
 * 栏间距的最小宽度占比。
 *
 * 取 0.8% 而不是更大的值：边界栅格有两格厚，它会从两侧各吃掉约 8px，
 * 设计稿上 2.5% 的栏间距（三卡指标页实测）到了掩膜上只剩 1.1%。
 * 阈值卡在 2% 会把三栏判成一栏。
 *
 * 卡到这么小不会误判词间距——判据是「这一列自上而下基本都是底」，
 * 而词间距不会在每一行都对齐到同一列上。
 */
const MIN_COLUMN_GAP = 0.006;
/** 面积小于此值的连通块当噪点丢掉，占总像素的比例 */
const MIN_COMPONENT_AREA = 0.00002;

/* ---------------- 像素工具 ---------------- */

/** 等比降采样。结构只关心位置，point sampling 足够 */
function shrink(img: DecodedImage, maxEdge: number): DecodedImage {
  const scale = Math.max(img.width, img.height) / maxEdge;
  if (scale <= 1) return img;
  const w = Math.max(1, Math.floor(img.width / scale));
  const h = Math.max(1, Math.floor(img.height / scale));
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const sy = Math.min(img.height - 1, Math.floor(y * scale));
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(img.width - 1, Math.floor(x * scale));
      const s = (sy * img.width + sx) * 4;
      const d = (y * w + x) * 4;
      data[d] = img.data[s]!;
      data[d + 1] = img.data[s + 1]!;
      data[d + 2] = img.data[s + 2]!;
      data[d + 3] = img.data[s + 3]!;
    }
  }
  return { width: w, height: h, data };
}

/**
 * 相邻像素差的中位数，用来定文字阈值。
 * 用中位数而不是均值：文字边缘的差很大但只占少数像素，中位数由大片平坦区决定。
 */
function estimateNoiseFloor(img: DecodedImage): number {
  const { width, height, data } = img;
  const diffs: number[] = [];
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x + 1 < width; x += 2) {
      const i = (y * width + x) * 4;
      const j = i + 4;
      diffs.push(Math.max(
        Math.abs(data[i]! - data[j]!),
        Math.abs(data[i + 1]! - data[j + 1]!),
        Math.abs(data[i + 2]! - data[j + 2]!),
      ));
    }
  }
  if (diffs.length === 0) return 0;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)]!;
}

/** 盒式模糊，走积分图，耗时与半径无关 */
function boxBlur(img: DecodedImage, radius: number): Uint8Array {
  const { width: w, height: h, data } = img;
  const stride = w + 1;
  const sumR = new Uint32Array(stride * (h + 1));
  const sumG = new Uint32Array(stride * (h + 1));
  const sumB = new Uint32Array(stride * (h + 1));

  for (let y = 0; y < h; y += 1) {
    let rowR = 0, rowG = 0, rowB = 0;
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4;
      rowR += data[i]!; rowG += data[i + 1]!; rowB += data[i + 2]!;
      const p = (y + 1) * stride + (x + 1);
      sumR[p] = sumR[p - stride]! + rowR;
      sumG[p] = sumG[p - stride]! + rowG;
      sumB[p] = sumB[p - stride]! + rowB;
    }
  }

  const out = new Uint8Array(w * h * 3);
  for (let y = 0; y < h; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(h - 1, y + radius);
    for (let x = 0; x < w; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(w - 1, x + radius);
      const a = y0 * stride + x0;
      const b = y0 * stride + (x1 + 1);
      const c = (y1 + 1) * stride + x0;
      const d = (y1 + 1) * stride + (x1 + 1);
      const n = (y1 - y0 + 1) * (x1 - x0 + 1);
      const o = (y * w + x) * 3;
      out[o] = (sumR[d]! - sumR[b]! - sumR[c]! + sumR[a]!) / n;
      out[o + 1] = (sumG[d]! - sumG[b]! - sumG[c]! + sumG[a]!) / n;
      out[o + 2] = (sumB[d]! - sumB[b]! - sumB[c]! + sumB[a]!) / n;
    }
  }
  return out;
}

/* ---------------- 栅格背景估计 ---------------- */

/** 栅格：每格一个众数色。cell 越小定位越准，越大抗噪越强 */
interface Grid {
  gw: number;
  gh: number;
  cell: number;
  /** 每格三通道的众数色 */
  mode: Uint8Array;
}

/**
 * 把图画成栅格，每格取**众数色**而不是均值。
 *
 * 用众数而不是均值：一格横跨文字与底色时，均值会给出一个谁都不是的中间色，
 * 众数会给出占多数的那一个。这是「局部底色」能被估出来的前提。
 *
 * 众数本身也顺带消掉了压缩噪声——一格 36 个像素里，噪声让它多几个计数，
 * 但众数仍然落在真实颜色上。
 */
function toGrid(data: Uint8Array, w: number, h: number, cell: number): Grid {
  const gw = Math.max(1, Math.ceil(w / cell));
  const gh = Math.max(1, Math.ceil(h / cell));
  const mode = new Uint8Array(gw * gh * 3);

  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      // 量化到 4 位/通道：16³ = 4096 个桶，足以区分卡片与底色（差 13）
      const counts = new Map<number, number>();
      const sums = new Map<number, [number, number, number]>();
      const x1 = Math.min(w, (gx + 1) * cell);
      const y1 = Math.min(h, (gy + 1) * cell);
      for (let y = gy * cell; y < y1; y += 1) {
        for (let x = gx * cell; x < x1; x += 1) {
          const i = (y * w + x) * 3;
          const key = ((data[i]! >> 4) << 8) | ((data[i + 1]! >> 4) << 4) | (data[i + 2]! >> 4);
          counts.set(key, (counts.get(key) ?? 0) + 1);
          const acc = sums.get(key);
          if (acc) { acc[0] += data[i]!; acc[1] += data[i + 1]!; acc[2] += data[i + 2]!; }
          else sums.set(key, [data[i]!, data[i + 1]!, data[i + 2]!]);
        }
      }
      let bestKey = -1;
      let bestN = -1;
      for (const [k, n] of counts) if (n > bestN) { bestN = n; bestKey = k; }
      const acc = sums.get(bestKey);
      const o = (gy * gw + gx) * 3;
      if (acc) {
        mode[o] = acc[0] / bestN;
        mode[o + 1] = acc[1] / bestN;
        mode[o + 2] = acc[2] / bestN;
      }
    }
  }
  return { gw, gh, cell, mode };
}

/**
 * 边界栅格：某格与**隔两格的邻居**颜色差得明显，就是一条边界。
 *
 * 为什么比的是邻格而不是邻域中位数：中位数版本只在「窗口里内外各占一半」的那一圈
 * 才有反应，量出来是**一格厚**的边界，圆角处一漏，漫水就灌进卡片内部——
 * 实测图片区整块没被填上，只剩上下两条边框成了带。
 *
 * 比邻格则天然给出两格厚（边界两侧各一格）。渐变也不会误判：渐变在 12px 上的
 * 步进通常不到 1，而卡片与底色的差是 13 起。噪声更不成问题——格子取的是众数，
 * 一格 36 个像素里的噪声已经被消掉了。
 */
function barrierGrid(g: Grid, step: number, threshold: number): Uint8Array {
  const { gw, gh, mode } = g;
  const out = new Uint8Array(gw * gh);
  const diff = (a: number, b: number) => Math.max(
    Math.abs(mode[a]! - mode[b]!),
    Math.abs(mode[a + 1]! - mode[b + 1]!),
    Math.abs(mode[a + 2]! - mode[b + 2]!),
  );

  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      const o = (gy * gw + gx) * 3;
      let worst = 0;
      if (gx - step >= 0) worst = Math.max(worst, diff(o, (gy * gw + gx - step) * 3));
      if (gx + step < gw) worst = Math.max(worst, diff(o, (gy * gw + gx + step) * 3));
      if (gy - step >= 0) worst = Math.max(worst, diff(o, ((gy - step) * gw + gx) * 3));
      if (gy + step < gh) worst = Math.max(worst, diff(o, ((gy + step) * gw + gx) * 3));
      if (worst > threshold) out[gy * gw + gx] = 1;
    }
  }
  return out;
}

/**
 * 只保留「成线」的边界格。
 *
 * 为什么必须过这一道：满幅摄影底的深色稿上，照片纹理的相邻格步进
 * 与卡片边界是同一个量级（实测都在 10~20），靠阈值分不开。但两者形状不同——
 * 真实的边界是**又长又直**的，纹理是散乱的。于是只保留横向或纵向上
 * 连续够长的边界格，纹理就被滤掉了。
 *
 * 这一步是「满幅图片的稿子也能量出文字结构」的关键：滤掉纹理之后，
 * 整页不再被边界填满，漫水能铺开，于是「被围住的面」只剩真正的卡片与图区，
 * 而文字由 ink 掩膜单独负责。
 */
function keepLines(barrier: Uint8Array, gw: number, gh: number, minRun: number): Uint8Array {
  const out = new Uint8Array(barrier.length);
  const flushH = (y: number, from: number, to: number) => {
    if (to - from < minRun) return;
    for (let x = from; x < to; x += 1) out[y * gw + x] = 1;
  };
  for (let y = 0; y < gh; y += 1) {
    let run = 0;
    for (let x = 0; x <= gw; x += 1) {
      if (x < gw && barrier[y * gw + x] === 1) run += 1;
      else { flushH(y, x - run, x); run = 0; }
    }
  }
  for (let x = 0; x < gw; x += 1) {
    let run = 0;
    for (let y = 0; y <= gh; y += 1) {
      if (y < gh && barrier[y * gw + x] === 1) run += 1;
      else {
        if (run >= minRun) for (let k = y - run; k < y; k += 1) out[k * gw + x] = 1;
        run = 0;
      }
    }
  }
  return out;
}

/**
 * 从页边漫水填充，能走到的格子就是**底**。
 *
 * 走不到、又不是边界的格子 = 被围在某个闭合轮廓内部 = 内容。
 * 这正是「卡片」的定义：它与底色的差可能只有 13，单看颜色分不开，
 * 但它的四条边围起来了，围住的那些格子就是卡片本身。
 */
function floodBackground(barrier: Uint8Array, gw: number, gh: number): Uint8Array {
  const reached = new Uint8Array(gw * gh);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    const p = y * gw + x;
    if (barrier[p] === 1 || reached[p] === 1) return;
    reached[p] = 1;
    stack.push(p);
  };
  for (let x = 0; x < gw; x += 1) { push(x, 0); push(x, gh - 1); }
  for (let y = 0; y < gh; y += 1) { push(0, y); push(gw - 1, y); }

  while (stack.length > 0) {
    const p = stack.pop()!;
    const x = p % gw;
    const y = (p - x) / gw;
    if (x > 0) push(x - 1, y);
    if (x + 1 < gw) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y + 1 < gh) push(x, y + 1);
  }
  return reached;
}

/* ---------------- 连通块 ---------------- */

interface Component {
  area: number;
  minX: number; maxX: number; minY: number; maxY: number;
}

/**
 * 四连通标记。用显式栈而不是递归——一张 1200×675 的图递归会爆栈。
 */
function labelComponents(mask: Uint8Array, w: number, h: number): { comps: Component[]; label: Int32Array } {
  const label = new Int32Array(w * h).fill(-1);
  const comps: Component[] = [];
  const stack = new Int32Array(w * h);
  let sp = 0;

  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] === 0 || label[start] !== -1) continue;
    const id = comps.length;
    const comp: Component = { area: 0, minX: w, maxX: -1, minY: h, maxY: -1 };
    // 手写栈：入栈要写成「先放再自增」，`stack[sp += 1] = x` 会跳过索引 0，
    // 弹栈时读到 undefined，结果是每个像素各自成一个连通块
    stack[sp] = start;
    sp += 1;
    label[start] = id;

    while (sp > 0) {
      sp -= 1;
      const p = stack[sp]!;
      const x = p % w;
      const y = (p - x) / w;
      comp.area += 1;
      if (x < comp.minX) comp.minX = x;
      if (x > comp.maxX) comp.maxX = x;
      if (y < comp.minY) comp.minY = y;
      if (y > comp.maxY) comp.maxY = y;

      if (x > 0 && mask[p - 1] === 1 && label[p - 1] === -1) { label[p - 1] = id; stack[sp] = p - 1; sp += 1; }
      if (x + 1 < w && mask[p + 1] === 1 && label[p + 1] === -1) { label[p + 1] = id; stack[sp] = p + 1; sp += 1; }
      if (y > 0 && mask[p - w] === 1 && label[p - w] === -1) { label[p - w] = id; stack[sp] = p - w; sp += 1; }
      if (y + 1 < h && mask[p + w] === 1 && label[p + w] === -1) { label[p + w] = id; stack[sp] = p + w; sp += 1; }
    }
    comps.push(comp);
  }
  return { comps, label };
}

/* ---------------- 带分割 ---------------- */

/** 取分位数。用来从 |I − 模糊| 的分布里定文字阈值 */
function percentileOf(values: Float64Array, q: number): number {
  const sorted = Array.from(values).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]!;
}

/** 把连续为真的区间按「短空档也算连续」合并成段 */
function runs(flags: Float64Array, minLen: number, maxGap: number, threshold: number): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  let gap = 0;
  for (let i = 0; i < flags.length; i += 1) {
    if (flags[i]! > threshold) {
      if (start < 0) start = i;
      gap = 0;
    } else if (start >= 0) {
      gap += 1;
      if (gap > maxGap) {
        const end = i - gap;
        if (end - start + 1 >= minLen) out.push([start, end]);
        start = -1;
        gap = 0;
      }
    }
  }
  if (start >= 0) {
    const end = flags.length - 1 - gap;
    if (end - start + 1 >= minLen) out.push([start, end]);
  }
  return out;
}

/* ---------------- 主流程 ---------------- */

export function structureFromImage(input: DecodedImage): PageStructure {
  const img = shrink(input, MAX_EDGE);
  const { width: w, height: h } = img;
  if (w < 16 || h < 16) {
    return { ...EMPTY, note: '图片太小，量不出排版结构', canvas: { w, h } };
  }

  const noiseFloor = estimateNoiseFloor(img);
  const inkThreshold = Math.max(MIN_INK_THRESHOLD, noiseFloor * 3);
  // 边界阈值：卡面与底色的差可能只有 13，所以要低于它；噪声在格子众数里已被消掉，
  // 阈值可以压到 8 而不误判
  const barrierThreshold = Math.max(8, noiseFloor * 2);

  /**
   * 进栅格之前先做一次小半径模糊。
   *
   * 格子取众数**不会**平均噪声——一格 16 个像素里挑出现最多的那个值，
   * 等于随机取了一个样本，噪声原封不动。实测 ±20 的重噪声下，
   * 每格的众数色各自偏 ±20，相邻格随机地互相差 40，边界图变成一片噪点，
   * 整个结构提取塌成一条带。模糊之后噪声降到 ±4 上下，众数才有意义。
   *
   * 只在噪声确实大时才模糊：干净的设计稿上，模糊会把卡片边界抹软，
   * 两格厚的边界出现缺口，漫水漏进卡片内部——卡片只剩一圈细边，
   * 反而被当成一堆装饰线。实测踩过这个坑。
   */
  const denoiseRadius = noiseFloor > 5 ? Math.max(1, Math.round(w * 0.002)) : 0;
  const grid = toGrid(boxBlur(img, denoiseRadius), w, h, GRID_CELL);
  const barrierRaw = barrierGrid(grid, BARRIER_STEP, barrierThreshold);
  // 只保留成线的边界：照片纹理与卡片边界步进同量级，只能靠形状分开
  const barrier = keepLines(barrierRaw, grid.gw, grid.gh, LINE_MIN_RUN);
  // 膨胀一格只服务于漫水：圆角处可能漏出一格缝隙，不补上水会灌进卡片内部。
  // 但它会把卡片之间的间隙吃掉，所以**量版式用的是未膨胀的 barrierRaw**
  const background = floodBackground(barrier, grid.gw, grid.gh);

  /**
   * 栅格信号可不可信：看它判出的内容是不是铺满了整页。
   *
   * 满幅摄影底的稿子上，照片的大尺度结构在格子尺度上同样是「步进」，
   * 边界会铺得很开、围住的面积也很大，于是「内容」覆盖了每一行。
   * 这时候栅格给不出任何分带信息，再拿它当内容就是一坨。
   *
   * 判据取「内容覆盖了 85% 以上的行」：一张正常排版的页面总有成片的留白，
   * 铺到 85% 就说明信号已经退化，退回只用 ink 掩膜。
   */
  const contentGrid = new Uint8Array(grid.gw * grid.gh);
  for (let p = 0; p < contentGrid.length; p += 1) {
    contentGrid[p] = barrier[p] === 1 || background[p] === 0 ? 1 : 0;
  }
  let coveredRows = 0;
  for (let gy = 0; gy < grid.gh; gy += 1) {
    let n = 0;
    for (let gx = 0; gx < grid.gw; gx += 1) if (contentGrid[gy * grid.gw + gx] === 1) n += 1;
    if (n / grid.gw > BAND_ROW_THRESHOLD) coveredRows += 1;
  }
  const gridUsable = coveredRows / grid.gh <= 0.85;
  if (!gridUsable) contentGrid.fill(0);
  const content0 = new Uint8Array(w * h);
  for (let gy = 0; gy < grid.gh; gy += 1) {
    const y1 = Math.min(h, (gy + 1) * grid.cell);
    for (let gx = 0; gx < grid.gw; gx += 1) {
      if (contentGrid[gy * grid.gw + gx] === 0) continue;
      const x1 = Math.min(w, (gx + 1) * grid.cell);
      for (let y = gy * grid.cell; y < y1; y += 1) {
        for (let x = gx * grid.cell; x < x1; x += 1) content0[y * w + x] = 1;
      }
    }
  }

  /**
   * 墨：与局部细节的差。它同时承担两件事——区分「这条带是文字还是实心面」，
   * 以及在栅格信号退化时**独自**承担分带。
   *
   * 阈值取自适应：先用固定下限压住逐像素噪声，再按 |I − 模糊| 自身的分布
   * 取一个高分位数。这一步是为了照片底纹——深色稿常拿一张有颗粒的照片当底，
   * 纹理的局部对比能到 20~40，比下限 14 高，于是整页被判成「全是内容」，
   * 分带彻底失效（实测那张深色封面每行的内容覆盖都在 67% 以上）。
   * 而文字与底纹的对比度差着一个量级，取分位数正好把它们分开。
   */
  const small = boxBlur(img, Math.max(2, Math.round(w * SMALL_RADIUS_RATIO)));
  const detail = new Float64Array(w * h);
  for (let p = 0; p < w * h; p += 1) {
    const i = p * 4;
    const o = p * 3;
    detail[p] = Math.max(
      Math.abs(img.data[i]! - small[o]!),
      Math.abs(img.data[i + 1]! - small[o + 1]!),
      Math.abs(img.data[i + 2]! - small[o + 2]!),
    );
  }
  const inkCut = Math.max(inkThreshold, percentileOf(detail, 0.6));
  const ink = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p += 1) if (detail[p]! > inkCut) ink[p] = 1;

  /**
   * 内容 = 栅格判出的面 ∪ ink 掩膜。
   *
   * 两者缺一不可：ink 负责文字与锐利图形（它在满幅摄影底的稿子上照样管用，
   * 因为模糊过的照片局部细节很低），栅格负责卡片与图区这类大块实心面
   * （它们的内部没有细节，ink 完全看不见）。只留栅格会丢掉文字，
   * 只留 ink 会丢掉卡片。
   */
  for (let p = 0; p < content0.length; p += 1) if (ink[p] === 1) content0[p] = 1;

  // 装饰件按长宽比摘出来，剩下的才是内容
  const { comps, label } = labelComponents(content0, w, h);
  const total = w * h;
  const accents: StructureAccent[] = [];
  const accentIds = new Set<number>();
  for (let i = 0; i < comps.length; i += 1) {
    const c = comps[i]!;
    if (c.area < total * MIN_COMPONENT_AREA) { accentIds.add(i); continue; }
    // 用「去掉边界栅格厚度」的核心尺寸判形状，而不是 bbox。
    // 边界有两格厚，它会把每个连通块的 bbox 向四周各撑开约 8px——
    // 一条 6px 宽的强调竖条，bbox 量出来是 21px 宽，就过不了「够窄」这一关了。
    const shrinkPx = 2 * BARRIER_STEP * grid.cell;
    const bw = Math.max(1, c.maxX - c.minX + 1 - shrinkPx);
    const bh = Math.max(1, c.maxY - c.minY + 1 - shrinkPx);
    const wr = bw / w;
    const hr = bh / h;
    // 竖条要「高」：一条真正的强调竖条会占画布一成以上的高度。
    // 阈值放到 5% 会把大字号标题的第一个笔画误判成竖条——实测踩过。
    if (wr <= 0.015 && hr >= 0.10) {
      accents.push({ kind: 'vrule', leftRatio: c.minX / w, topRatio: c.minY / h, widthRatio: wr, heightRatio: hr });
      accentIds.add(i);
    } else if (hr <= 0.02 && wr >= 0.12) {
      accents.push({ kind: 'hrule', leftRatio: c.minX / w, topRatio: c.minY / h, widthRatio: wr, heightRatio: hr });
      accentIds.add(i);
    }
  }

  // 背景与「被围住的实心区域」都还原成像素掩膜，量栏数时要用
  const bgPixel = new Uint8Array(w * h);
  const solidPixel = new Uint8Array(w * h);
  for (let gy = 0; gy < grid.gh; gy += 1) {
    const y1 = Math.min(h, (gy + 1) * grid.cell);
    for (let gx = 0; gx < grid.gw; gx += 1) {
      const gp = gy * grid.gw + gx;
      // 被围住、又不是边界 = 一块实心面（卡片内部、图区内部）
      if (gridUsable && background[gp] === 0 && barrier[gp] === 0) {
        const sx1 = Math.min(w, (gx + 1) * grid.cell);
        for (let y = gy * grid.cell; y < y1; y += 1) {
          for (let x = gx * grid.cell; x < sx1; x += 1) solidPixel[y * w + x] = 1;
        }
      }
      if (background[gp] === 0) continue;
      const x1 = Math.min(w, (gx + 1) * grid.cell);
      for (let y = gy * grid.cell; y < y1; y += 1) {
        for (let x = gx * grid.cell; x < x1; x += 1) bgPixel[y * w + x] = 1;
      }
    }
  }

  const content = new Uint8Array(w * h);
  for (let p = 0; p < content.length; p += 1) {
    if (content0[p] === 0) continue;
    const id = label[p]!;
    if (id < 0 || accentIds.has(id)) continue;
    content[p] = 1;
  }

  /**
   * 分栏专用的掩膜：**墨 ∪ 被围住的实心区**，不含边界环。
   *
   * 边界环是这套方法自己的产物（两格厚），不是设计稿上的真实内容。
   * 卡片之间 23px 的间隙会被它从两侧各吃掉 8px，只剩六七个像素，
   * 于是三张卡片被判成一栏（实测真实设计稿上就是这样把指标页误判成正文页的）。
   * 去掉边界环之后间隙恢复到 39px，判得干净。
   */
  const core = new Uint8Array(w * h);
  for (let p = 0; p < core.length; p += 1) {
    if (ink[p] === 1 || solidPixel[p] === 1) core[p] = 1;
  }
  const { comps: coreComps } = labelComponents(core, w, h);

  // 行覆盖 → 横带
  const rowCover = new Float64Array(h);
  for (let y = 0; y < h; y += 1) {
    let n = 0;
    for (let x = 0; x < w; x += 1) if (content[y * w + x] === 1) n += 1;
    rowCover[y] = n / w;
  }
  const bandRuns = runs(rowCover, 3, Math.round(h * 0.012), BAND_ROW_THRESHOLD);

  if (bandRuns.length === 0) {
    return {
      ...EMPTY, note: '整页没有检出任何内容横带，可能是一张纯色图或整幅图片',
      canvas: { w, h }, noiseFloor, barrierThreshold, inkThreshold,
    };
  }

  /**
   * 守卫：一条带占满九成以上高度 ⇒ 判「量不出」。
   *
   * 一张正常排版的幻灯片不可能整页只有一条带。出现这种情况几乎一定是提取失败了。
   * 必须显式报错让上层回落基准族，而不是把「一条 0%–100% 的带」当成合法排版
   * 交给渲染层——那会生成一坨垃圾，比明说「没量出来」糟糕得多。
   */
  if (bandRuns.length === 1) {
    const [y0, y1] = bandRuns[0]!;
    if ((y1 - y0 + 1) / h > 0.9) {
      return {
        ...EMPTY,
        note: `整页只有一条内容带，多半是渐变底、整幅图片或压缩噪声导致的提取失败，本页结构未采信`,
        canvas: { w, h }, noiseFloor, barrierThreshold, inkThreshold,
      };
    }
  }

  const bands: StructureBand[] = bandRuns.map(([y0, y1]) => {
    let minX = w, maxX = -1, contentN = 0, inkN = 0;
    for (let y = y0; y <= y1; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const p = y * w + x;
        if (content[p] === 0) continue;
        contentN += 1;
        if (ink[p] === 1) inkN += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    const bw = maxX - minX + 1;
    const bh = y1 - y0 + 1;
    const area = bw * bh;

    // 行数：带内「墨」的行剖面上的高峰段
    const inkRows = new Float64Array(bh);
    for (let k = 0; k < bh; k += 1) {
      let n = 0;
      for (let x = 0; x < w; x += 1) if (ink[(y0 + k) * w + x] === 1) n += 1;
      inkRows[k] = n / w;
    }
    const inkMax = Math.max(...inkRows);
    const lineFlags = new Float64Array(bh);
    for (let k = 0; k < bh; k += 1) lineFlags[k] = inkRows[k]! > Math.max(inkMax * 0.5, 0.004) ? 1 : 0;
    const lines = runs(lineFlags, 1, 1, 0.5).length;

    /**
     * 栏：把带内的内容块按 x 区间合并，合不到一起的就是不同的栏。
     *
     * 之前试过两条路，都不行：数内容里的空档会被边界栅格的厚度吃掉
     * （三卡之间的 30px 间隙，两侧各被吃掉 8px 就过不了宽度阈值，三栏判成一栏）；
     * 数「贯通整条带的背景通道」则被圆角附近被围住的小口袋搅乱，
     * 图文之间的通道实测背景占比只有 0.14。按内容块合并没有这些问题——
     * 它只看「这两块东西在横向上分不分得开」。
     *
     * 合并间距取「一倍边界栅格厚度」：必须小于设计稿上真实栏间距在掩膜上剩下的宽度。
     * 三卡之间 36px 的间距，两侧各被边界栅格吃掉约 8px，只剩约 17px（1200 画布上），
     * 取两倍厚度（16px）就刚好把它吃掉，所以只能取一倍。
     */
    // 合并间距取画布宽的 2%。下限由「一行大标题里的词间距」定——
    // 62px 的标题在 900 画布上词间距能到 14px，卡不住就会把一句话拆成两栏；
    // 上限由「卡片之间的栏间距」定，那个通常在 4% 以上，留了一倍余量。
    const mergeGap = Math.max(BARRIER_STEP * grid.cell, Math.round(w * 0.02));
    const spans: [number, number][] = [];
    for (const c of coreComps) {
      if (c.maxY < y0 || c.minY > y1) continue;
      spans.push([c.minX, c.maxX]);
    }
    spans.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const sp of spans) {
      const last = merged[merged.length - 1];
      if (last && sp[0] - last[1] <= mergeGap) last[1] = Math.max(last[1], sp[1]);
      else merged.push([sp[0], sp[1]]);
    }
    const inkDensity = inkN / area;
    const fillRatio = contentN / area;
    // 0.20 而不是 0.10：卡片带里往往有大号数字（那是墨），
    // 但整条带的主体仍是实心面。阈值卡太紧会把指标页判成正文页
    const kind: BandKind = fillRatio > 0.55 && inkDensity < 0.20 ? 'surface'
      : inkDensity >= 0.06 ? 'text'
        : 'mixed';

    /**
     * 单行的**文字**带不分栏：一行大标题里的词间距也能到 12px 以上，
     * 会把一句话拆成两栏。一行字本来也无所谓分栏。
     *
     * 但实心面不受这条限制——卡片行里的文字往往只有一行（一个大数字），
     * 而三张卡片确实就是三栏。实测真实设计稿上这条守卫把三栏卡片判成了一栏，
     * 进而把指标页误判成正文页。
     */
    const columns = (lines >= 2 || kind === 'surface') ? Math.max(1, merged.length) : 1;

    /**
     * 每栏里「被围住的实心区域」占多少。
     *
     * 用它区分「三张指标卡」（每栏内部都是被围住的实心面）与
     * 「图左文右」（一栏是图、一栏是字）。试过用墨密度，分不开——
     * 卡片带里的墨密度 0.15，文字栏 0.24，区间太窄，阈值稍偏就判反。
     * 实心面占比的差距则很大：卡片栏七成以上，文字栏接近零。
     */
    let surfaceSpans = 0;
    for (const [sx0, sx1] of merged) {
      let solid = 0;
      let n = 0;
      for (let y = y0; y <= y1; y += 1) {
        for (let x = sx0; x <= sx1; x += 1) {
          n += 1;
          if (solidPixel[y * w + x] === 1) solid += 1;
        }
      }
      if (n > 0 && solid / n > 0.3) surfaceSpans += 1;
    }

    return {
      role: 'unknown' as BandRole,
      topRatio: y0 / h,
      heightRatio: bh / h,
      leftRatio: minX / w,
      widthRatio: bw / w,
      lines: Math.max(1, lines),
      kind,
      inkDensity,
      columns,
      spans: merged.map(([a, b]) => ({ left: a / w, width: (b - a + 1) / w })),
      // 多栏带的 bbox 天然横跨整幅，量出来永远是「居中」，所以对齐只在单栏带上有意义
      align: columns > 1 ? 'n/a' : Math.abs((minX + maxX) / 2 - w / 2) < w * 0.025 ? 'center' : 'left',
      surfaceSpans,
    };
  });

  assignRoles(bands);

  /**
   * 内容框 = **所有**带的并集。
   *
   * 早先只统计「左对齐的单栏文字带」，结果右边距量成了 60%——
   * 标题只占四成宽，就被当成了「内容到四成宽为止」。内容能铺多宽，
   * 看的是最宽的那条带，不是最窄的。
   */
  const contentBox = {
    left: Math.min(...bands.map((b) => b.leftRatio)),
    right: 1 - Math.max(...bands.map((b) => b.leftRatio + b.widthRatio)),
    top: Math.min(...bands.map((b) => b.topRatio)),
    bottom: 1 - Math.max(...bands.map((b) => b.topRatio + b.heightRatio)),
  };

  const widest = bands.reduce((a, b) => (b.columns > a.columns ? b : a), bands[0]!);

  return {
    ok: true,
    note: '',
    canvas: { w, h },
    contentBox,
    columns: widest.columns,
    align: bands.find((b) => b.role === 'title')?.align === 'center' ? 'center' : 'left',
    bands,
    accents,
    noiseFloor,
    barrierThreshold,
    inkThreshold,
  };
}

/**
 * 给每条带判角色。
 *
 * 判据刻意保守：判不出来就留 `unknown`，让上层回落到基准族，
 * 而不是硬猜一个角色把内容塞进错的槽位。
 */
function assignRoles(bands: StructureBand[]): void {
  if (bands.length === 0) return;

  // 标题：上半页里「字号最大」的那条单栏文字带。字号用带高/行数估
  const lineHeight = (b: StructureBand) => b.heightRatio / b.lines;
  const single = bands.filter((b) => b.kind === 'text' && b.columns === 1);
  const upper = single.filter((b) => b.topRatio < 0.6);
  const titleBand = (upper.length > 0 ? upper : single)
    .reduce<StructureBand | null>((best, b) => (!best || lineHeight(b) > lineHeight(best) ? b : best), null);

  // 每栏都是实心面 + 多栏 = 指标卡；有面也有字 = 图文页；单个实心面 = 图区
  const freeRole = (b: StructureBand): BandRole => {
    if (b.columns > 1) return b.surfaceSpans >= b.columns ? 'metrics' : 'visual';
    return b.kind === 'surface' ? 'visual' : 'body';
  };

  if (!titleBand) {
    for (const b of bands) b.role = freeRole(b);
    return;
  }
  titleBand.role = 'title';
  const ti = bands.indexOf(titleBand);

  // 页脚：最底部贴边的小带
  const last = bands[bands.length - 1]!;
  if (last !== titleBand && last.topRatio > 0.85 && last.heightRatio < 0.06) last.role = 'footer';

  // 眉标：标题上方最近的短带
  const free = (b: StructureBand) => b.role === 'unknown';
  const above = bands.slice(0, ti).filter((b) => free(b) && b.heightRatio < 0.08 && b.kind === 'text');
  if (above.length > 0) above[above.length - 1]!.role = 'eyebrow';

  // 副标题：标题正下方最近的短带。必须排除已经定过角色的带，
  // 否则页脚会被这条规则抢走——实测过这个覆盖
  const below = bands.slice(ti + 1).filter((b) => free(b) && b.heightRatio < 0.08 && b.kind === 'text');
  if (below.length > 0) below[0]!.role = 'subtitle';

  for (const b of bands) {
    if (b.role !== 'unknown') continue;
    b.role = freeRole(b);
  }
}

/* ---------------- 拼图切分 ---------------- */

export interface SlideBox { x0: number; y0: number; x1: number; y1: number }

/**
 * 找出图里的「幻灯片」。
 *
 * 用户传上来的常常不是单页导出，而是一张**拼图**——营销稿、作品集封面，
 * 一页里竖排好几张幻灯片，外面还套着页眉页脚。拿整张图做「每页版式」提取没有意义，
 * 得先把里面的幻灯片找出来，一张一张量。
 *
 * 判据是「与画布底色的差」而不是「被围住的实心区」：拼图的画布本身是平的
 * （浅灰、纯白一类），一张幻灯片整体与它的差很大，直接就能分出块来。
 * 先前用「围住 + 膨胀」试过，两张幻灯片之间的留白一旦只有几个像素，
 * 膨胀就会把它们连成一张（实测合成语料上间距 4px 就翻了车）。
 *
 * 长宽比与尺寸这两道关是为了不把「一页里的三张指标卡」当成三张幻灯片：
 * 卡片的宽只占画布四分之一，够不着 0.4 的下限。
 */
export function detectSlideBoxes(input: DecodedImage): SlideBox[] {
  const img = shrink(input, MAX_EDGE);
  const { width: w, height: h } = img;
  if (w < 32 || h < 32) return [];

  const noiseFloor = estimateNoiseFloor(img);
  const denoiseRadius = noiseFloor > 5 ? Math.max(1, Math.round(w * 0.002)) : 0;
  const grid = toGrid(boxBlur(img, denoiseRadius), w, h, GRID_CELL);
  const { gw, gh, mode } = grid;

  /**
   * 画布底色 = **贴边一圈**的格色众数，不是全图众数。
   *
   * 全图众数在拼图上会取错：一张 675×900 的拼图里两张幻灯片占了七成面积，
   * 出现最多的颜色是幻灯片本身，于是「与底色差得远」判不出任何东西（实测翻过车）。
   * 贴边那一圈必然是画布，无论里面的幻灯片占多大。
   */
  const tally = new Map<number, number>();
  const isBorder = (gx: number, gy: number) => gx < 2 || gy < 2 || gx >= gw - 2 || gy >= gh - 2;
  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      if (!isBorder(gx, gy)) continue;
      const o = (gy * gw + gx) * 3;
      const key = ((mode[o]! >> 4) << 8) | ((mode[o + 1]! >> 4) << 4) | (mode[o + 2]! >> 4);
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
  }
  let bgKey = -1;
  let bgN = -1;
  for (const [k, n] of tally) if (n > bgN) { bgN = n; bgKey = k; }
  const bg: [number, number, number] = [(bgKey >> 8) << 4, ((bgKey >> 4) & 15) << 4, (bgKey & 15) << 4];

  const tol = Math.max(20, noiseFloor * 4);
  const cardCells = new Uint8Array(gw * gh);
  for (let g = 0; g < gw * gh; g += 1) {
    const o = g * 3;
    const diff = Math.max(
      Math.abs(mode[o]! - bg[0]), Math.abs(mode[o + 1]! - bg[1]), Math.abs(mode[o + 2]! - bg[2]),
    );
    if (diff > tol) cardCells[g] = 1;
  }
  const { comps } = labelComponents(cardCells, gw, gh);

  const scale = input.width / w;

  /**
   * 判一个像素是不是海报底色。
   * 阈值与分块时用的是同一个，所以「块内」与「块外」在这里是自洽的。
   */
  const bgLike = (x: number, y: number): boolean => {
    const o = (y * w + x) * 4;
    return Math.max(
      Math.abs(img.data[o]! - bg[0]),
      Math.abs(img.data[o + 1]! - bg[1]),
      Math.abs(img.data[o + 2]! - bg[2]),
    ) <= tol;
  };

  /**
   * 把框收到幻灯片的真实边缘。
   *
   * 连通块的 bbox 天生比幻灯片大一圈——海报里幻灯片四周常有投影与抗锯齿的过渡带，
   * 它们与底色的差超过容差，于是被算进了块里。实测这一圈有 15~20px。
   * 拿它去裁页会把海报底色一起带进来，而底色是一大块平色，
   * 量结构时「幻灯片边界」会变成全页最强的内容边缘，把页内的横带结构整个压平。
   */
  const trim = (x0: number, y0: number, x1: number, y1: number) => {
    const rowIsBg = (y: number) => {
      let n = 0;
      for (let x = x0; x < x1; x += 1) if (bgLike(x, y)) n += 1;
      return n / (x1 - x0) > 0.9;
    };
    const colIsBg = (x: number) => {
      let n = 0;
      for (let y = y0; y < y1; y += 1) if (bgLike(x, y)) n += 1;
      return n / (y1 - y0) > 0.9;
    };
    while (y0 < y1 - 8 && rowIsBg(y0)) y0 += 1;
    while (y1 > y0 + 8 && rowIsBg(y1 - 1)) y1 -= 1;
    while (x0 < x1 - 8 && colIsBg(x0)) x0 += 1;
    while (x1 > x0 + 8 && colIsBg(x1 - 1)) x1 -= 1;
    return { x0, y0, x1, y1 };
  };

  const boxes: SlideBox[] = [];
  for (const c of comps) {
    const bw = c.maxX - c.minX + 1;
    const bh = c.maxY - c.minY + 1;
    const wr = bw / gw;
    const hr = bh / gh;
    const aspect = bw / bh;
    if (wr < 0.4 || hr < 0.15) continue;
    if (aspect < 1.1 || aspect > 2.5) continue;
    // 0.05 而不是 0.08：两栏四宫格里的单张小页占画布约 7~8%，
    // 卡在 0.08 上会时灵时不灵，整格漏检
    if ((bw * bh) / (gw * gh) < 0.05) continue;

    const t = trim(
      c.minX * grid.cell, c.minY * grid.cell,
      Math.min(w, (c.maxX + 1) * grid.cell), Math.min(h, (c.maxY + 1) * grid.cell),
    );
    // 留 1px：裁得太贴会把幻灯片自己的边缘线切掉
    const pad = 1 * scale;
    boxes.push({
      x0: Math.max(0, Math.round(t.x0 * scale - pad)),
      y0: Math.max(0, Math.round(t.y0 * scale - pad)),
      x1: Math.min(input.width, Math.round(t.x1 * scale + pad)),
      y1: Math.min(input.height, Math.round(t.y1 * scale + pad)),
    });
  }

  // 至少要两块——只有一块的话那就是单页输入，走的是另一条路
  if (boxes.length < 2) return [];

  /**
   * 去掉「被另一块包住」的框。
   *
   * 拼图里常有一张通栏大封面配几张两栏小页（实测的营销稿就是这样），
   * 尺寸天然差一倍。早先按「尺寸接近中位数」过滤，大封面直接被丢掉——
   * 用户传的封面就永远识别不出来。改成按包含关系去重：真幻灯片之间不会互相包住，
   * 被包住的框是页内某个大色块误检出来的。
   */
  const kept = boxes.filter((b) => !boxes.some((o) => o !== b && encloses(o, b)));
  if (kept.length < 2) return [];
  // 阅读顺序：先上后下、再左后右。界面按这个顺序展示，用户核对起来才顺
  return kept.sort((a, b) => (a.y0 - b.y0) || (a.x0 - b.x0));
}

/** o 是否把 i 整个包住（面积严格更大，避免互相判成包含而双双被删） */
function encloses(o: SlideBox, i: SlideBox): boolean {
  const inside = o.x0 <= i.x0 && o.y0 <= i.y0 && o.x1 >= i.x1 && o.y1 >= i.y1;
  return inside && (o.x1 - o.x0) * (o.y1 - o.y0) > (i.x1 - i.x0) * (i.y1 - i.y0);
}

export interface StructureSet {
  /** 每张幻灯片一份。没检出多页时就是整张图一份 */
  pages: PageStructure[];
  /**
   * 每页在原图里的**归一化**裁切框，顺序与 `pages` 一致。
   * 界面靠它显示「这一页在原图里对应的那一块」，而不是整张拼图。
   * 没切分时就是整张图（0,0,1,1）。
   */
  boxes: CropBox[];
  /** 是否做了切分，界面要如实说明 */
  split: boolean;
  note: string;
}

export interface CropBox { x0: number; y0: number; x1: number; y1: number }

/**
 * 识别用的入口：拼图先切分，再一张一张量结构。
 *
 * 单页输入走的是同一条路，只是切不出多块，`split` 为 false。
 */
export function structuresFromImage(input: DecodedImage): StructureSet {
  const boxes = detectSlideBoxes(input);
  if (boxes.length === 0) {
    return {
      pages: [structureFromImage(upscaleTo(input, MEASURE_WIDTH))],
      boxes: [{ x0: 0, y0: 0, x1: 1, y1: 1 }],
      split: false,
      note: '',
    };
  }
  return {
    // 裁完必须放大再量：单页在拼图里往往只有三百来像素宽，
    // 拿那个尺寸直接量，绝对像素的阈值会把文字整个吞掉（见 image-ops.ts）
    pages: boxes.map((b) => structureFromImage(cropForMeasure(input, {
      x0: b.x0 / input.width, y0: b.y0 / input.height,
      x1: b.x1 / input.width, y1: b.y1 / input.height,
    }))),
    boxes: boxes.map((b) => ({
      x0: b.x0 / input.width, y0: b.y0 / input.height,
      x1: b.x1 / input.width, y1: b.y1 / input.height,
    })),
    split: true,
    note: `这张图里检出了 ${boxes.length} 张幻灯片，已分别量结构`,
  };
}

/**
 * 猜这一页是哪一类页。
 *
 * 判据刻意保守，判不准就落到 text——识别结果里用户可以手动改，
 * 猜错一个的成本远低于把内容塞进错的槽位。
 */
export function classifyPageType(s: PageStructure): PageType {
  if (!s.ok || s.bands.length === 0) return 'text';
  const widest = s.bands.reduce((a, b) => (b.columns > a.columns ? b : a), s.bands[0]!);
  const hasCards = s.bands.some((b) => b.columns >= 2 && b.surfaceSpans >= b.columns);
  const hasSplit = s.bands.some((b) => b.columns >= 2);
  const textBands = s.bands.filter((b) => b.kind === 'text').length;

  // 居中、带数少、没有分栏——封面与封底长这样。两者分不开，一律当封面
  if (s.align === 'center' && s.bands.length <= 4 && widest.columns === 1) return 'cover';
  // 多栏且每栏都是实心面 = 指标卡
  if (hasCards) return 'metrics';
  // 多栏但栏里有字 = 图文页
  if (hasSplit) return 'imageText';
  // 条目多且都是单栏短带 = 目录
  if (textBands >= 4 && s.bands.length >= 5) return 'toc';
  return 'text';
}

export function structureFromDataUrl(dataUrl: string): PageStructure {
  try {
    return structureFromImage(decodeImage(dataUrl));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ...EMPTY, note: `图片解码失败：${message.slice(0, 120)}` };
  }
}
