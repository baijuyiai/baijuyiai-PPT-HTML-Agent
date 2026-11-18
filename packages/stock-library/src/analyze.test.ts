import test from 'node:test';
import assert from 'node:assert/strict';
import { encodePng } from '@lumen/style-engine/png';
import { analyzePng, averageLuminance, dominantColors, kindFromFilename, looksTransparent } from './analyze.js';

/**
 * 素材入库的分析。全是纯函数，直接喂像素数组，不用真读文件。
 */

/** 造一张图：底色 + 可选的一块透明区 */
function makeImage(
  w: number,
  h: number,
  rgba: [number, number, number, number],
  clear?: { x0: number; y0: number; x1: number; y1: number },
) {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inside = clear && x >= clear.x0 && x < clear.x1 && y >= clear.y0 && y < clear.y1;
      data[i] = rgba[0];
      data[i + 1] = rgba[1];
      data[i + 2] = rgba[2];
      data[i + 3] = inside ? 0 : rgba[3];
    }
  }
  return { width: w, height: h, data };
}

test('又扁又宽的主体也算抠图——判据不能只看「不透明像素占多少」', () => {
  // 实测踩到的：一座斜拉桥，桥面又细又长、桥塔细高，不透明像素只占画幅 3.8%。
  // 原先的判据要求不透明像素 > 5%，于是它被判成「不透明」——后果不是难看而已：
  // 它进不了 `OBJECT_POOL`（判据是 `transparent === true`），却会掉进普通配图池，
  // 被当成照片配到 16:9 的图位上，透明底 + `object-fit: cover`，页面上浮着一座桥。
  const w = 100;
  const h = 100;
  const img = makeImage(w, h, [255, 255, 255, 0]);
  const put = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * w + x) * 4;
        img.data[i] = 160; img.data[i + 1] = 160; img.data[i + 2] = 165; img.data[i + 3] = 255;
      }
    }
  };
  put(0, 50, 100, 52); // 桥面：横贯全宽，只有 2 像素厚
  put(24, 34, 28, 66); // 两座桥塔
  put(72, 34, 76, 66);
  assert.equal(looksTransparent(img), true, '又扁又宽的主体该算抠图');
});

test('细高的主体也算抠图——包围盒判据会在这里出错', () => {
  // 实测踩到的：一枚火箭，主体只占画幅宽度的 20%、高度的 92%。
  // 中途试过「要求主体包围盒两个方向都横跨 20%」的判据，它正好卡在线上被判成不透明。
  // **包围盒是形状相关的量**，拿它当阈值就必然对某一类形状不公平。占比不看形状
  const img = makeImage(100, 100, [255, 255, 255, 0]);
  for (let y = 4; y < 96; y++) {
    for (let x = 40; x < 60; x++) {
      const i = (y * 100 + x) * 4;
      img.data[i + 3] = 255;
    }
  }
  assert.equal(looksTransparent(img), true, '细高的主体该算抠图');
});

test('主体只占画幅一角也算抠图——判据看的是「有没有主体」，不是「占多大」', () => {
  const img = makeImage(100, 100, [255, 255, 255, 0]);
  for (let y = 40; y < 60; y++) {
    for (let x = 40; x < 60; x++) {
      const i = (y * 100 + x) * 4;
      img.data[i + 3] = 255;
    }
  }
  assert.equal(looksTransparent(img), true, '画面正中一个小主体，仍是抠图');
});

test('有相当一部分透明、又有相当一部分不透明才算抠图', () => {
  const w = 100;
  const h = 100;
  // 四角全透明、中间实心：典型抠图
  assert.equal(looksTransparent(makeImage(w, h, [255, 0, 0, 255], { x0: 0, y0: 0, x1: 40, y1: 40 })), true);
  // 整张不透明
  assert.equal(looksTransparent(makeImage(w, h, [255, 0, 0, 255])), false);
  // 整张全透明：空文件不是抠图
  assert.equal(looksTransparent(makeImage(w, h, [255, 0, 0, 0])), false);
  // 只有极小的一个透明角（不到 5%）：不当抠图，那是描边没对齐之类的杂点
  assert.equal(looksTransparent(makeImage(w, h, [255, 0, 0, 255], { x0: 0, y0: 0, x1: 10, y1: 10 })), false);
});

test('主色取出现最多的那几桶，跳过全透明像素', () => {
  const img = makeImage(60, 60, [200, 30, 30, 255]);
  // 右下角一小块蓝，不该盖过红
  for (let y = 50; y < 60; y++) {
    for (let x = 50; x < 60; x++) {
      const i = (y * 60 + x) * 4;
      img.data[i] = 20;
      img.data[i + 1] = 30;
      img.data[i + 2] = 200;
    }
  }
  const colors = dominantColors(img, 2);
  assert.equal(colors.length, 2);
  assert.match(colors[0]!, /^#C8/); // 200 = 0xC8 左右的红
  assert.match(colors[1]!, /^#1/);  // 深蓝
  // 全透明的图没有主色，不该返回一个假的黑色
  assert.deepEqual(dominantColors(makeImage(10, 10, [0, 0, 0, 0])), []);
});

test('明度只看不透明像素，0.5 是明暗分界', () => {
  assert.equal(averageLuminance(makeImage(20, 20, [255, 255, 255, 255])), 1);
  assert.equal(averageLuminance(makeImage(20, 20, [0, 0, 0, 255])), 0);
  // 一半透明（黑）一半不透明白：只看不透明的那半，结果是 1 而不是 0.5
  const half = makeImage(20, 20, [255, 255, 255, 255], { x0: 0, y0: 0, x1: 20, y1: 10 });
  assert.equal(averageLuminance(half), 1);
  // 全透明时没有可看的像素，给中间值而不是 0（0 会被判成深色，是个没有依据的结论）
  assert.equal(averageLuminance(makeImage(10, 10, [0, 0, 0, 0])), 0.5);
});

/**
 * 题材从文件名前缀认。
 *
 * **不能有兜底值。** 这里原先 `analyzePng` 把 `kind` 硬编码成 `people`——
 * 加物件素材之前它是对的（本仓的 PNG 只有人物抠图），加了之后 12 张物件会被
 * 全打成人物：它们会掉进 `PEOPLE_POOL`（判据是 `kind === 'people'`），
 * 而 `OBJECT_POOL`（`kind !== 'people'`）一张都收不到。症状是「配了物件却一个都不出现」，
 * 页面上不报错。
 */
test('题材从文件名前缀认，认不出回 null 而不是硬塞一个', () => {
  assert.equal(kindFromFilename('people-asian-m-1.png'), 'people');
  assert.equal(kindFromFilename('object-tower.png'), 'object');
  assert.equal(kindFromFilename('tower.png'), null, '没有前缀的不能猜');
  assert.equal(kindFromFilename('object-.png'), 'object', '前缀在就算，后缀空不空不归它管');
});

test('analyzePng 走完编码解码往返，产出一条可用的清单项', () => {
  const png = encodePng(makeImage(40, 40, [30, 30, 30, 255], { x0: 0, y0: 0, x1: 30, y1: 30 }));
  const entry = analyzePng('people-caucasian-f-1.png', png, 'people');
  assert.equal(entry.file, 'people-caucasian-f-1.png');
  assert.equal(entry.kind, 'people');
  assert.equal(entry.transparent, true);
  assert.equal(entry.tone, 'dark');
  assert.ok(entry.palette.length > 0 && entry.palette[0]!.startsWith('#'));
  // 出处一类的事实脚本不编造，留空让人填
  assert.equal(entry.author, '');
  assert.equal(entry.source, '');
  assert.equal(entry.license, '');
  assert.deepEqual(entry.tags, []);
});

test('题材由调用方给，analyzePng 自己不改写它', () => {
  const png = encodePng(makeImage(20, 20, [240, 240, 235, 255]));
  assert.equal(analyzePng('object-tower.png', png, 'object').kind, 'object');
});

test('浅色图判成 light，深色图判成 dark', () => {
  const light = analyzePng('a.png', encodePng(makeImage(20, 20, [240, 240, 235, 255])), 'people');
  const dark = analyzePng('b.png', encodePng(makeImage(20, 20, [20, 22, 26, 255])), 'people');
  assert.equal(light.tone, 'light');
  assert.equal(dark.tone, 'dark');
  // 纯色图没有透明区，不该被当成抠图
  assert.equal(light.transparent, false);
});

test('解不开的字节要抛错，让调用方去跳过这一张', () => {
  assert.throws(() => analyzePng('bad.png', new Uint8Array([1, 2, 3, 4]), 'people'), /PNG_DECODE_FAILED/);
});
