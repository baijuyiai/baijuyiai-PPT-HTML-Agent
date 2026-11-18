import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeImage } from '@lumen/style-engine/png';
import { decodePng, encodePng, type RgbaImage } from './png-codec.js';

/**
 * 落盘素材的 PNG 编解码。
 *
 * 这个模块的产物是**要提交进仓库、并随仓库分发**的图，所以两件事必须钉死：
 * 1. **编完能原样解回来**——编码器用 Paeth 滤波，解错一步整张图就是花的。
 * 2. **别人也解得开**——`stock:add` 走的是 `@lumen/style-engine` 的解码器，
 *    不是这里这个。两边只要有一个不认 Paeth，入库那一步就会炸。
 */

/** 造一张有梯度、有透明区的图：纯色图测不出滤波的错误 */
function makeImage(w: number, h: number): RgbaImage {
  const data = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      data[i] = (x * 7 + y * 3) & 0xff;
      data[i + 1] = (x * 2 + y * 11) & 0xff;
      data[i + 2] = (x * 13 + y * 5) & 0xff;
      // 左半边透明、右半边不透明，中间留一条半透明过渡
      data[i + 3] = x < w / 3 ? 0 : x < (2 * w) / 3 ? 128 : 255;
    }
  }
  return { width: w, height: h, data };
}

test('编完解回来，像素逐个一致', () => {
  const img = makeImage(37, 23); // 故意取非 2 的幂，露不出对齐的巧合
  const back = decodePng(encodePng(img));
  assert.equal(back.width, img.width);
  assert.equal(back.height, img.height);
  assert.deepEqual(back.data, img.data, '往返之后像素变了');
});

test('style-engine 的解码器也解得开——入库那一步走的是它', () => {
  const img = makeImage(64, 48);
  const png = encodePng(img);
  const decoded = decodeImage(`data:image/png;base64,${png.toString('base64')}`);
  assert.equal(decoded.width, 64);
  assert.equal(decoded.height, 48);
  // 抽查几个点：两边取的通道顺序也得一致
  for (const [x, y] of [[0, 0], [30, 10], [63, 47]] as const) {
    const i = (y * 64 + x) * 4;
    assert.equal(decoded.data[i], img.data[i], `(${x},${y}) 的 R 对不上`);
    assert.equal(decoded.data[i + 3], img.data[i + 3], `(${x},${y}) 的 A 对不上`);
  }
});

test('滤波真的在干活——同一张图比不压缩小得多', () => {
  const img = makeImage(128, 128);
  const raw = img.width * img.height * 4;
  assert.ok(encodePng(img).length < raw / 2, '压缩没起作用，滤波多半没生效');
});

test('只认 8 位 RGBA 非交错，别的直接报错而不是解出错图', () => {
  const bad = Buffer.alloc(40);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bad);
  bad.writeUInt32BE(4, 16);
  bad.writeUInt32BE(4, 20);
  bad[24] = 16; // 16 位
  bad[25] = 6;
  assert.throws(() => decodePng(bad), /只认 8 位 RGBA/);
});
