/**
 * 落盘前把抠图缩到指定长边。
 *
 * 物件与人物两条链路都要这一步，所以抽出来共用——两份实现漂了的话，
 * 一边干净一边有黑边，而这种事在缩略图上根本看不出来。
 */
import type { RgbaImage } from '../../packages/stock-library/src/png-codec.ts';

/**
 * 把长边缩到 `max` 以内，短边按比例走。
 *
 * **按 alpha 加权平均，不是直接平均 RGB。** 透明像素的 RGB 通常是 0（黑），
 * 直接平均会让主体边缘一圈混进黑色——缩完看过去像描了一道脏边，而抠图素材的卖点
 * 恰恰是边缘干净。加权后要再除回去（un-premultiply），否则颜色会被 alpha 压暗。
 */
export function fitLongSide(img: RgbaImage, max: number): RgbaImage {
  const long = Math.max(img.width, img.height);
  if (long <= max) return img;
  const k = max / long;
  const w = Math.max(1, Math.round(img.width * k));
  const h = Math.max(1, Math.round(img.height * k));
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * img.height) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * img.height) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * img.width) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * img.width) / w));
      let r = 0; let g = 0; let b = 0; let aSum = 0; let n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * img.width + sx) * 4;
          const al = img.data[i + 3]!;
          r += img.data[i]! * al;
          g += img.data[i + 1]! * al;
          b += img.data[i + 2]! * al;
          aSum += al;
          n += 1;
        }
      }
      const o = (y * w + x) * 4;
      // aSum 为 0 说明这一格全是透明的，RGB 无所谓，留 0
      if (aSum > 0) {
        out[o] = Math.round(r / aSum);
        out[o + 1] = Math.round(g / aSum);
        out[o + 2] = Math.round(b / aSum);
      }
      out[o + 3] = Math.round(aSum / n);
    }
  }
  return { width: w, height: h, data: out };
}
