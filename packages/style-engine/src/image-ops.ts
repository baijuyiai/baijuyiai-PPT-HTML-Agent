import type { DecodedImage } from './png.js';

/**
 * 图片的裁剪与缩放。
 *
 * 这两件事在识别链路里是连在一起的：从拼图里裁出一页之后**必须放大再量**。
 *
 * 原因是像素测量里有一批**绝对像素**的常量——`GRID_CELL = 4`、
 * `LINE_MIN_RUN = 3`（格）、去噪模糊半径——而拼图里的单页往往只有 300 来像素宽。
 * 拿 300px 的图直接量，等于用一把相对粗四倍的尺子：6px 的文字笔画不到两格，
 * 在「取格内众数色」那一步就被底色淹掉。实测同一张稿，原尺寸量出 1 条无用的带，
 * 放大到 1280 后能分出 6 条真实的带。
 *
 * 放大用的是最近邻：这套方法靠「模糊差分」找边缘，插值出来的软过渡反而会
 * 把边缘抹平。最近邻不创造信息，但它让绝对像素的尺子重新变得合适。
 */

/** 量结构时统一放到的宽度。低于这个宽度的一页会被放大，高于的保持原样。
 *  取 1200 是为了和 `structure.ts` 的 `MAX_EDGE` 对齐——不然放大完又被缩回去，白重采样一次 */
export const MEASURE_WIDTH = 1200;

/** 按归一化坐标（左上 0,0，右下 1,1）从原图裁一块出来 */
export function cropNormalized(
  img: DecodedImage,
  box: { x0: number; y0: number; x1: number; y1: number },
): DecodedImage {
  const x0 = clampInt(Math.round(box.x0 * img.width), 0, img.width - 1);
  const y0 = clampInt(Math.round(box.y0 * img.height), 0, img.height - 1);
  const x1 = clampInt(Math.round(box.x1 * img.width), x0 + 1, img.width);
  const y1 = clampInt(Math.round(box.y1 * img.height), y0 + 1, img.height);
  return cropPixels(img, x0, y0, x1, y1);
}

export function cropPixels(img: DecodedImage, x0: number, y0: number, x1: number, y1: number): DecodedImage {
  const w = x1 - x0;
  const h = y1 - y0;
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const s = ((y0 + y) * img.width + (x0 + x)) * 4;
      const d = (y * w + x) * 4;
      data[d] = img.data[s]!;
      data[d + 1] = img.data[s + 1]!;
      data[d + 2] = img.data[s + 2]!;
      data[d + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

/** 放大到指定宽度（最近邻）。已经够宽就原样返回 */
export function upscaleTo(img: DecodedImage, targetW: number): DecodedImage {
  if (img.width >= targetW) return img;
  const k = targetW / img.width;
  const w = Math.round(img.width * k);
  const h = Math.round(img.height * k);
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const sy = Math.min(img.height - 1, Math.floor(y / k));
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(img.width - 1, Math.floor(x / k));
      const s = (sy * img.width + sx) * 4;
      const d = (y * w + x) * 4;
      data[d] = img.data[s]!;
      data[d + 1] = img.data[s + 1]!;
      data[d + 2] = img.data[s + 2]!;
      data[d + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

/** 裁一页并放大到量结构的合适宽度 */
export function cropForMeasure(
  img: DecodedImage,
  box: { x0: number; y0: number; x1: number; y1: number },
): DecodedImage {
  return upscaleTo(cropNormalized(img, box), MEASURE_WIDTH);
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * 把「看图模型给的框」收拾成一个能用的归一化裁切框。
 *
 * 模型给的是**目测**坐标，三种毛病都见过，所以三样都得接住：
 * - 给成像素值而不是 0–1（0–675 这种）。数值明显大于 1 就按像素换算。
 * - 两个角写反（x1 < x0）。按 min/max 归一，不假设顺序。
 * - 越界或给出一个又小又扁的框——那是把页内某个元素当成了整页，直接丢掉。
 *
 * 放在这里而不是服务层：这是纯粹的几何处理，跟模型怎么调没有关系，
 * 而且它错起来很隐蔽（框差一点，裁出来的图就多带一圈海报底色）。
 */
export function normalizeCropBox(
  raw: Record<string, unknown>,
  width: number,
  height: number,
): { x0: number; y0: number; x1: number; y1: number } | null {
  const nums = ['x0', 'y0', 'x1', 'y1'].map((k) => {
    const v = raw[k];
    return typeof v === 'number' && Number.isFinite(v) ? v : NaN;
  });
  if (nums.some((v) => Number.isNaN(v))) return null;

  /**
   * 判是归一化坐标还是像素坐标。
   *
   * 阈值取 ±2 而不是「大于 1」：模型偶尔会给出**越界**的归一化值
   * （1.4、1.9 这种，把幻灯片边缘多圈了一点）。拿「大于 1.5 就当像素」去判，
   * 这种框会被除以图幅变成一个针尖大的框，然后被当成误检丢掉——
   * 实测踩过：一张明明切得好好的拼图，因为封面框 y1 写了 1.9，整个封面消失。
   * 反过来，675 宽的海报上，一个真实的像素框 x1 必然在几百这个量级，
   * 所以「全部落在 ±2 内」是个干净的判据。
   */
  const asPixels = !nums.every((v) => v >= -2 && v <= 2);
  const [x0r, y0r, x1r, y1r] = asPixels
    ? [nums[0]! / width, nums[1]! / height, nums[2]! / width, nums[3]! / height]
    : (nums as [number, number, number, number]);

  const x0 = clamp01(Math.min(x0r, x1r));
  const y0 = clamp01(Math.min(y0r, y1r));
  const x1 = clamp01(Math.max(x0r, x1r));
  const y1 = clamp01(Math.max(y0r, y1r));
  // 太窄或太扁的框多半是把页内某个元素当成了整页
  if (x1 - x0 < 0.12 || y1 - y0 < 0.08) return null;
  return { x0, y0, x1, y1 };
}
