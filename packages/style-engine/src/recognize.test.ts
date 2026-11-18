import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import type { DecodedImage } from './png.js';
import { recognizeStyle } from './recognize.js';
import { layoutSpecFor } from './layout-spec.js';

/**
 * 识别整条链路的测试。
 *
 * 这个文件的存在理由很具体：`recognizeStyle` 是**浏览器里唯一走的那条路**，
 * 而它内部是个大 try/catch——任何一步抛错都会退化成「识别成功、但没有量到任何页」，
 * 界面上表现为「什么都没发生」。曾经就出过一次（横带落栏时 `grid` 还没初始化，
 * TDZ 报错被 catch 吞掉），类型检查查不出（闭包里的 TDZ 不在 TS 的检查范围内），
 * 单元测试也查不出（每个模块单测都是好的）。只有从入口跑一遍才挡得住。
 */

/* ---------------- 最小 PNG 编码器 ---------------- */

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** 识别入口吃的是 data URL，所以测试必须真的编出一张 PNG，不能塞原始像素 */
function pngDataUrl(img: DecodedImage): string {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(img.width, 0);
  ihdr.writeUInt32BE(img.height, 4);
  ihdr[8] = 8; // 位深
  ihdr[9] = 6; // 色彩类型：RGBA
  const stride = img.width * 4;
  const raw = Buffer.alloc((stride + 1) * img.height);
  for (let y = 0; y < img.height; y += 1) {
    raw[y * (stride + 1)] = 0; // 滤波：无
    Buffer.from(img.data.subarray(y * stride, (y + 1) * stride)).copy(raw, y * (stride + 1) + 1);
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}

/* ---------------- 画一张真值已知的指标页 ---------------- */

const W = 1440;
const H = 810;
const INK: [number, number, number] = [242, 242, 245];
const DIM: [number, number, number] = [138, 138, 148];
const CARD: [number, number, number] = [20, 24, 33];
const BRAND: [number, number, number] = [199, 185, 255];

function sheet(bg: [number, number, number]): DecodedImage {
  const img: DecodedImage = { width: W, height: H, data: new Uint8Array(W * H * 4) };
  for (let p = 0; p < W * H; p += 1) {
    img.data[p * 4] = bg[0];
    img.data[p * 4 + 1] = bg[1];
    img.data[p * 4 + 2] = bg[2];
    img.data[p * 4 + 3] = 255;
  }
  return img;
}

function rect(img: DecodedImage, x: number, y: number, w: number, h: number, c: [number, number, number], r = 0): void {
  for (let j = 0; j < h; j += 1) {
    for (let i = 0; i < w; i += 1) {
      if (r > 0) {
        const dx = i < r ? r - i : i >= w - r ? i - (w - r - 1) : 0;
        const dy = j < r ? r - j : j >= h - r ? j - (h - r - 1) : 0;
        if (dx * dx + dy * dy > r * r) continue;
      }
      const px = x + i;
      const py = y + j;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const o = (py * W + px) * 4;
      img.data[o] = c[0];
      img.data[o + 1] = c[1];
      img.data[o + 2] = c[2];
    }
  }
}

/** 一串短横当文字行。对投影分析来说和真字一样 */
function text(img: DecodedImage, x: number, baseline: number, len: number, thickness: number, c: [number, number, number]): void {
  for (let cx = x; cx < x + len; cx += 14) {
    rect(img, cx, baseline - thickness, Math.min(9, x + len - cx), thickness, c);
  }
}

/** 三卡指标页：眉标 / 两行大标题 / 副标题 / 三张卡片 / 页脚 */
function metricsSlide(): DecodedImage {
  const img = sheet([11, 14, 20]);
  rect(img, 96, 96, 6, 132, BRAND);
  text(img, 128, 118, 200, 18, DIM);
  text(img, 128, 196, 700, 62, INK);
  text(img, 128, 268, 640, 62, INK);
  text(img, 128, 322, 480, 24, DIM);
  for (let i = 0; i < 3; i += 1) {
    const x = 96 + i * 416;
    rect(img, x, 420, 380, 190, CARD, 16);
    text(img, x + 32, 512, 120, 56, BRAND);
    text(img, x + 32, 566, 140, 20, DIM);
  }
  text(img, 96, 752, 160, 16, DIM);
  return img;
}

/* ---------------- 断言 ---------------- */

test('识别一整张设计稿：量到的页要出门，横带要落到栏上', async () => {
  const res = await recognizeStyle({ images: [pngDataUrl(metricsSlide())] });

  assert.equal(res.measuredPages.length, 1, '一张单页设计稿应量出 1 页');
  const page = res.measuredPages[0]!;
  assert.equal(page.ok, true, `没量到结构：${page.note}`);
  assert.ok(page.bands.length >= 3, `横带太少：${page.bands.length}`);

  // 每一条带都必须在网格里，不能出现第 0 栏或越界
  const cols = res.stylePack.base.language.grid.columns;
  assert.ok(cols >= 1, `栏数 ${cols}`);
  for (const b of page.bands) {
    assert.ok(b.colStart >= 1, `${b.role} 带落在第 ${b.colStart} 栏`);
    assert.ok(b.colStart + b.colSpan - 1 <= cols, `${b.role} 带超出第 ${cols} 栏`);
    assert.ok(b.rowSpan >= 1, `${b.role} 带行数为 ${b.rowSpan}`);
  }

  // 卡片那一排是三栏并排
  assert.equal(page.bands.find((b) => b.columns > 1)?.columns, 3, '三张卡片应量成 3 栏并排');
});

test('识别一整张设计稿：几何真的进了风格包，不只是颜色', async () => {
  const res = await recognizeStyle({ images: [pngDataUrl(metricsSlide())] });
  const page = res.measuredPages[0]!;

  const variant = res.stylePack.base.layouts.find((l) => l.pageType === page.pageType);
  assert.ok(variant, `风格包里没有 ${page.pageType} 这一类版式`);
  assert.ok(
    (variant.geometry?.bands?.length ?? 0) > 0,
    '版式几何没写进风格包——那样渲染出来还是基准族的老骨架，等于只换了颜色',
  );

  // 描述里要说清版式是按原稿实测的，用户才知道该信什么
  assert.ok(res.stylePack.description.includes('版式按原稿实测'), res.stylePack.description);
});

test('识别一整张设计稿：每一类量到的页都能给出 HTML 规格', async () => {
  const res = await recognizeStyle({ images: [pngDataUrl(metricsSlide())] });
  const page = res.measuredPages[0]!;

  const spec = layoutSpecFor(page.pageType, res.stylePack);
  assert.ok(spec, `${page.pageType} 页没给出规格`);
  const all = spec.lines.join('\n');
  assert.ok(all.includes('按设计稿实测'), all);
  assert.ok(/grid-template-columns: repeat\(\d+, 1fr\)/.test(all), `规格里缺 CSS 网格：${all}`);
  assert.ok(all.includes('栏距'), all);
});

test('量不出结构时如实说，不编一份版式出来', async () => {
  // 纯色空白页：没有任何内容，量不出横带
  const res = await recognizeStyle({ images: [pngDataUrl(sheet([250, 250, 250]))] });
  const page = res.measuredPages[0]!;
  assert.equal(page.ok, false, '空白页不该声称量到了结构');
  // 没量到就沿用基准族的版式，绝不能拿一份默认画像去重建
  assert.equal(
    res.stylePack.base.layouts.some((l) => l.geometry?.bands?.length),
    false,
    '没量到结构却给版式塞了横带',
  );
});

test('深色设计稿识别出来的包是深色的', async () => {
  const res = await recognizeStyle({ images: [pngDataUrl(metricsSlide())] });
  assert.equal(
    res.stylePack.base.language.theme,
    'dark',
    '深色稿识别成了浅色——样机会渲染成白底，跟用户传的稿子对不上',
  );
});

test('浅色设计稿识别出来的包是浅色的', async () => {
  const light = sheet([250, 250, 250]);
  rect(light, 96, 96, 6, 132, BRAND);
  text(light, 128, 196, 700, 62, [16, 20, 24]);
  text(light, 128, 268, 640, 62, [16, 20, 24]);
  for (let i = 0; i < 3; i += 1) {
    const x = 96 + i * 416;
    rect(light, x, 420, 380, 190, [235, 238, 244], 16);
    text(light, x + 32, 512, 120, 56, BRAND);
  }
  const res = await recognizeStyle({ images: [pngDataUrl(light)] });
  assert.equal(res.stylePack.base.language.theme, 'light', '浅色稿不该被识别成深色');
});
