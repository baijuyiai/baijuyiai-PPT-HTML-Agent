import test from 'node:test';
import assert from 'node:assert/strict';
import { decodePng, encodePng, type DecodedImage } from './png.js';
import { cropNormalized, cropForMeasure, normalizeCropBox, upscaleTo, MEASURE_WIDTH } from './image-ops.js';

/** 一张 W×H 的图，每个像素带上可辨认的坐标色 */
function makeImage(w: number, h: number): DecodedImage {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const o = (y * w + x) * 4;
      data[o] = x % 256;
      data[o + 1] = y % 256;
      data[o + 2] = (x + y) % 256;
      data[o + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

const pixelAt = (img: DecodedImage, x: number, y: number) => {
  const o = (y * img.width + x) * 4;
  return [img.data[o], img.data[o + 1], img.data[o + 2]];
};

/* ---------------- PNG 编码 ---------------- */

test('PNG 编码能原样解回来——编解码闭环', () => {
  const src = makeImage(37, 21);
  const back = decodePng(encodePng(src));
  assert.equal(back.width, 37);
  assert.equal(back.height, 21);
  assert.deepEqual([...back.data], [...src.data], '像素应逐个一致');
});

test('PNG 编码能处理超过一个 deflate 块的图（>65535 字节）', () => {
  // 200×200×4 = 160000 字节，跨 3 个 stored 块；块边界写错的话这里会解码失败
  const src = makeImage(200, 200);
  const back = decodePng(encodePng(src));
  assert.equal(back.width, 200);
  assert.deepEqual([...back.data.subarray(0, 4000)], [...src.data.subarray(0, 4000)]);
  assert.deepEqual([...back.data.subarray(back.data.length - 4000)], [...src.data.subarray(src.data.length - 4000)]);
});

/* ---------------- 裁剪与放大 ---------------- */

test('按归一化坐标裁剪：取到的是对应那一块', () => {
  const src = makeImage(100, 80);
  const c = cropNormalized(src, { x0: 0.2, y0: 0.25, x1: 0.6, y1: 0.75 });
  assert.equal(c.width, 40);
  assert.equal(c.height, 40);
  // 左上角应等于原图 (20,20) 那个像素
  assert.deepEqual(pixelAt(c, 0, 0), pixelAt(src, 20, 20));
  assert.deepEqual(pixelAt(c, 39, 39), pixelAt(src, 59, 59));
});

test('裁剪：越界的框被夹回图内，不会算出零尺寸', () => {
  const src = makeImage(100, 80);
  const c = cropNormalized(src, { x0: -0.5, y0: -1, x1: 2, y1: 3 });
  assert.equal(c.width, 100);
  assert.equal(c.height, 80);
});

test('放大：最近邻放大后像素成块，不引入新的中间色', () => {
  const src = makeImage(10, 10);
  const up = upscaleTo(src, 40);
  assert.equal(up.width, 40);
  assert.equal(up.height, 40);
  // 2×2 的块内应完全同色（最近邻），插值的话这里会各不相同
  assert.deepEqual(pixelAt(up, 0, 0), pixelAt(up, 1, 1));
  assert.deepEqual(pixelAt(up, 4, 4), pixelAt(src, 1, 1));
});

test('放大：已经够宽就原样返回，不做无谓重采样', () => {
  const src = makeImage(MEASURE_WIDTH, 100);
  assert.equal(upscaleTo(src, MEASURE_WIDTH), src, '同一张图的引用应原样返回');
});

test('裁一页并放大：小图会被抬到量结构用的宽度', () => {
  const src = makeImage(675, 900);
  // 拼图里的一张小页，只有 300px 宽
  const c = cropForMeasure(src, { x0: 0.04, y0: 0.55, x1: 0.48, y1: 0.72 });
  assert.equal(c.width, MEASURE_WIDTH, `小页应被放大到 ${MEASURE_WIDTH}，实际 ${c.width}`);
});

/* ---------------- 模型给的框 ---------------- */

test('收拾模型给的框：0–1 的坐标原样接住', () => {
  const b = normalizeCropBox({ x0: 0.04, y0: 0.15, x1: 0.96, y1: 0.55 }, 675, 900);
  assert.deepEqual(b, { x0: 0.04, y0: 0.15, x1: 0.96, y1: 0.55 });
});

test('收拾模型给的框：给成像素值时按图幅换算', () => {
  const b = normalizeCropBox({ x0: 27, y0: 135, x1: 648, y1: 495 }, 675, 900);
  assert.ok(b);
  assert.ok(Math.abs(b!.x0 - 0.04) < 0.001, `x0 ${b!.x0}`);
  assert.ok(Math.abs(b!.y1 - 0.55) < 0.001, `y1 ${b!.y1}`);
});

test('收拾模型给的框：两个角写反也能归一', () => {
  const b = normalizeCropBox({ x0: 0.96, y0: 0.55, x1: 0.04, y1: 0.15 }, 675, 900);
  assert.deepEqual(b, { x0: 0.04, y0: 0.15, x1: 0.96, y1: 0.55 });
});

test('收拾模型给的框：越界的夹回 [0,1]', () => {
  const b = normalizeCropBox({ x0: -0.2, y0: -0.3, x1: 1.4, y1: 1.9 }, 675, 900);
  assert.deepEqual(b, { x0: 0, y0: 0, x1: 1, y1: 1 });
});

test('收拾模型给的框：又小又扁的丢掉——那是把页内元素当成了整页', () => {
  assert.equal(normalizeCropBox({ x0: 0.1, y0: 0.1, x1: 0.15, y1: 0.9 }, 675, 900), null, '太窄');
  assert.equal(normalizeCropBox({ x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.13 }, 675, 900), null, '太扁');
});

test('收拾模型给的框：缺字段或非数字时丢掉，不猜', () => {
  assert.equal(normalizeCropBox({ x0: 0.1, y0: 0.1, x1: 0.9 }, 675, 900), null);
  assert.equal(normalizeCropBox({ x0: '0.1', y0: 0.1, x1: 0.9, y1: 0.9 }, 675, 900), null);
  assert.equal(normalizeCropBox({}, 675, 900), null);
});
