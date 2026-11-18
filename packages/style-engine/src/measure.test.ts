import test from 'node:test';
import assert from 'node:assert/strict';
import type { DecodedImage } from './png.js';
import { BUILTIN_STYLE_PACKS } from './builtin/index.js';
import { measurePages } from './measure.js';

/**
 * 这一层管的是「用哪套框切页」。
 *
 * 两条入口必须走同一套量测：像素自己切（没接看图模型），以及用模型给的框切。
 * 分开实现过一次，结果是「界面预览用的框」与「版式用的框」不是同一批，
 * 样机与原图对不上，而两边各自看起来都没错——所以这里钉住的是这个一致性。
 */

const PACK = BUILTIN_STYLE_PACKS.find((p) => p.styleId === 'business-classic')!;
const W = 900;
const H = 500;

/** 一张拼图：上面一条深色带，下面左右两块浅色块。每块里都排了几行「文字」 */
function collage(): DecodedImage {
  const data = new Uint8Array(W * H * 4);
  const put = (x0: number, y0: number, x1: number, y1: number, c: [number, number, number]) => {
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const o = (y * W + x) * 4;
        data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
      }
    }
  };
  // 一排短横当文字行。对投影分析来说和真字一样
  const line = (x: number, y: number, len: number, th: number, c: [number, number, number]) => {
    for (let cx = x; cx < x + len; cx += 12) put(cx, y - th, Math.min(8, x + len - cx), th, c);
  };
  put(0, 0, W, H, [245, 245, 247]);
  put(40, 40, 860, 240, [22, 34, 70]);
  put(40, 280, 430, 460, [30, 60, 120]);
  put(470, 280, 860, 460, [40, 90, 150]);

  // 上面那条带：眉标 + 两行大标题
  line(70, 90, 180, 14, [150, 170, 210]);
  line(70, 150, 620, 40, [255, 255, 255]);
  line(70, 205, 540, 40, [255, 255, 255]);
  // 左下块：标题 + 三行正文
  line(70, 330, 300, 26, [255, 255, 255]);
  line(70, 380, 320, 14, [190, 205, 230]);
  line(70, 405, 300, 14, [190, 205, 230]);
  line(70, 430, 260, 14, [190, 205, 230]);
  // 右下块：三张并排的小卡
  for (let i = 0; i < 3; i += 1) {
    line(500 + i * 118, 340, 96, 30, [255, 255, 255]);
    line(500 + i * 118, 385, 88, 12, [180, 200, 225]);
  }
  return { width: W, height: H, data };
}

test('不传框时自己切分，并把切出来的框带出去', () => {
  const { measuredPages, splitNote } = measurePages([collage()], PACK);
  assert.ok(measuredPages.length >= 2, `应切出多页，实际 ${measuredPages.length}`);
  assert.ok(splitNote.includes('张幻灯片'), splitNote);
  for (const p of measuredPages) {
    assert.ok(p.cropBox.x1 > p.cropBox.x0, '裁切框不能是空的');
    assert.ok(p.cropBox.x1 <= 1 && p.cropBox.y1 <= 1, '裁切框应是归一化的');
  }
});

test('传了框就用它切——页数与框数一致，且框原样带回来', () => {
  const boxes = [
    { x0: 0.04, y0: 0.08, x1: 0.96, y1: 0.48 },
    { x0: 0.04, y0: 0.56, x1: 0.48, y1: 0.92 },
    { x0: 0.52, y0: 0.56, x1: 0.96, y1: 0.92 },
  ];
  const { measuredPages } = measurePages([collage()], PACK, [boxes]);
  assert.equal(measuredPages.length, 3, '框有几个就该量出几页');
  assert.deepEqual(measuredPages.map((p) => p.cropBox), boxes);
  assert.deepEqual(measuredPages.map((p) => p.imageIndex), [0, 0, 0]);
});

test('传了框就不再自己切分——不然界面预览与版式会用到两批不同的页', () => {
  const boxes = [{ x0: 0.04, y0: 0.08, x1: 0.96, y1: 0.48 }];
  const { measuredPages, splitNote } = measurePages([collage()], PACK, [boxes]);
  assert.equal(measuredPages.length, 1);
  assert.equal(splitNote, '', '给了框就不该再说「检出了几张」');
});

test('把自动切出来的框再喂回去，量出的结果必须完全一致', () => {
  // 这条钉的是两个入口的等价性：像素自己切，与用（模型给的）框切，
  // 走的是同一套量测。不等价的话，「界面预览用的框」与「版式用的框」
  // 就不是同一批，样机与原图会错位，而两边各自看起来都没错
  const auto = measurePages([collage()], PACK);
  assert.ok(auto.measuredPages.length >= 1);
  const boxes = auto.measuredPages.map((p) => p.cropBox);
  const redo = measurePages([collage()], PACK, [boxes]);

  assert.equal(redo.measuredPages.length, auto.measuredPages.length);
  assert.deepEqual(
    redo.measuredPages.map((p) => [p.pageType, p.ok, p.bands]),
    auto.measuredPages.map((p) => [p.pageType, p.ok, p.bands]),
  );
});

test('某张图的框是空数组时回退到像素切分，而不是把这张图丢掉', () => {
  // 模型对某张图一张页都没读出来（图太糊、内容不熟）时，宁可让像素去猜，
  // 也不能让用户传的图整个消失在结果里
  const { measuredPages, splitNote } = measurePages([collage()], PACK, [[]]);
  assert.ok(measuredPages.length >= 1, '这张图不能被丢掉');
  assert.ok(splitNote.includes('张幻灯片'), '回退时仍要说明是像素切出来的');
});

test('整页量测：显式给整幅框时就是 1 页', () => {
  const { measuredPages } = measurePages([collage()], PACK, [[{ x0: 0, y0: 0, x1: 1, y1: 1 }]]);
  assert.equal(measuredPages.length, 1);
  assert.deepEqual(measuredPages[0]!.cropBox, { x0: 0, y0: 0, x1: 1, y1: 1 });
});

test('多张图各自按自己的框切，imageIndex 指回来源', () => {
  const img = collage();
  const { measuredPages } = measurePages([img, img], PACK, [
    [{ x0: 0.04, y0: 0.08, x1: 0.96, y1: 0.48 }],
    [{ x0: 0.04, y0: 0.56, x1: 0.48, y1: 0.92 }, { x0: 0.52, y0: 0.56, x1: 0.96, y1: 0.92 }],
  ]);
  assert.equal(measuredPages.length, 3);
  assert.deepEqual(measuredPages.map((p) => p.imageIndex), [0, 1, 1]);
});
