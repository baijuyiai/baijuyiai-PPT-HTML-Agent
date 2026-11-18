import test from 'node:test';
import assert from 'node:assert/strict';
import { pngHasAlpha } from './png.js';

/**
 * 「这张 PNG 有没有 alpha」。
 *
 * 从 `@lumen/provider-gateway` 搬过来的：原先它只服务于网关里那道
 * 「要了透明底必须真拿到透明底」的检查，那条路删掉之后，使用者换成了抠图服务
 * ——同一件事：**要了透明底却没拿到，必须当场报出来**。
 */

/** 拼一个只有签名与 IHDR 的最小 PNG，够 pngHasAlpha 判色彩类型 */
function fakePng(colorType: number): Buffer {
  const buf = Buffer.alloc(26);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'latin1');
  buf[25] = colorType;
  return buf;
}

test('ct=6（RGBA）与 ct=4（灰度+alpha）算有 alpha', () => {
  assert.equal(pngHasAlpha(fakePng(6)), true);
  assert.equal(pngHasAlpha(fakePng(4)), true);
});

test('ct=2（RGB）与 ct=0（灰度）算没有 alpha——实测图片模型返回的就是 ct=2', () => {
  assert.equal(pngHasAlpha(fakePng(2)), false);
  assert.equal(pngHasAlpha(fakePng(0)), false);
});

test('ct=3（调色板）当它有——调色板可以靠 tRNS 带透明，不值得为此再解一遍', () => {
  assert.equal(pngHasAlpha(fakePng(3)), true);
});

test('不是 PNG、或太短，一律当没有', () => {
  assert.equal(pngHasAlpha(Buffer.from('not a png at all, definitely not')), false);
  assert.equal(pngHasAlpha(Buffer.alloc(4)), false);
});

test('签名对但第一个块不是 IHDR，当没有', () => {
  const buf = fakePng(6);
  buf.write('IDAT', 12, 'latin1');
  assert.equal(pngHasAlpha(buf), false);
});

test('真图上也判得对——一张 ct=6 的 1×1 与一张 ct=2 的 1×1', () => {
  const rgba = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const rgb = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPgEpEDAABoAD1UCKP3AAAAAElFTkSuQmCC',
    'base64',
  );
  assert.equal(pngHasAlpha(rgba), true);
  assert.equal(pngHasAlpha(rgb), false);
});
