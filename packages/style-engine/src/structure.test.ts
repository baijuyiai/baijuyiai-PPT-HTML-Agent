import test from 'node:test';
import assert from 'node:assert/strict';
import type { DecodedImage } from './png.js';
import { detectSlideBoxes, structureFromImage, structuresFromImage } from './structure.js';

/**
 * 结构提取的测试语料。
 *
 * 每一张稿都是**真值已知**的：画的时候就知道眉标在第几行、卡片带占多高，
 * 断言直接比这些数字。用合成稿而不是真实截图当夹具，是因为真实截图没有真值，
 * 只能靠肉眼判断「像不像」，那样的测试挡不住回归。
 *
 * 语料里刻意放了三种会把朴素算法打垮的输入：渐变底、压缩噪声、装饰竖条。
 * 它们各自对应一个真实场景，也各自是一条曾经踩过的坑。
 */

const W = 1440;
const H = 810;

/* ---------------- 画布 ---------------- */

class Sheet {
  readonly img: DecodedImage;

  constructor(bg: [number, number, number]) {
    this.img = {
      width: W,
      height: H,
      data: new Uint8Array(W * H * 4),
    };
    for (let p = 0; p < W * H; p += 1) {
      const i = p * 4;
      this.img.data[i] = bg[0];
      this.img.data[i + 1] = bg[1];
      this.img.data[i + 2] = bg[2];
      this.img.data[i + 3] = 255;
    }
  }

  private px(x: number, y: number, c: [number, number, number]): void {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 4;
    this.img.data[i] = c[0];
    this.img.data[i + 1] = c[1];
    this.img.data[i + 2] = c[2];
    this.img.data[i + 3] = 255;
  }

  rect(x: number, y: number, w: number, h: number, c: [number, number, number], r = 0): this {
    for (let j = 0; j < h; j += 1) {
      for (let i = 0; i < w; i += 1) {
        if (r > 0) {
          const dx = i < r ? r - i : i >= w - r ? i - (w - r - 1) : 0;
          const dy = j < r ? r - j : j >= h - r ? j - (h - r - 1) : 0;
          if (dx * dx + dy * dy > r * r) continue;
        }
        this.px(x + i, y + j, c);
      }
    }
    return this;
  }

  /** 模拟一行文字：一串短横。对投影分析来说和真字一样 */
  text(x: number, baseline: number, len: number, thickness: number, c: [number, number, number]): this {
    for (let cx = x; cx < x + len; cx += 14) {
      this.rect(cx, baseline - thickness, Math.min(9, x + len - cx), thickness, c);
    }
    return this;
  }

  /** 对角渐变。用来验证「底色是单一颜色」这个前提不成立时算法还站不站得住 */
  gradient(from: [number, number, number], to: [number, number, number]): this {
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const t = (x / W + y / H) / 2;
        this.px(x, y, [
          Math.round(from[0] + (to[0] - from[0]) * t),
          Math.round(from[1] + (to[1] - from[1]) * t),
          Math.round(from[2] + (to[2] - from[2]) * t),
        ]);
      }
    }
    return this;
  }

  /**
   * 叠一层「照片底纹」：逐像素的随机扰动。
   *
   * 与 noise() 的区别是幅度大得多（20~40），模拟深色稿常拿一张有颗粒的照片当底。
   * 这种底纹的局部对比与卡片边界同一个量级，会把「内容」铺满整页——
   * 实测真实设计稿上就是这么塌掉的。
   */
  texture(amp: number, seed = 987654): this {
    let s = seed;
    const next = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        const d = Math.round((next() - 0.5) * 2 * amp);
        const i = (y * W + x) * 4;
        for (let k = 0; k < 3; k += 1) {
          this.img.data[i + k] = Math.max(0, Math.min(255, this.img.data[i + k]! + d));
        }
      }
    }
    return this;
  }

  /**
   * 叠压缩噪声。用固定种子的线性同余，保证测试可复现——
   * 用 Math.random 会让「噪声下能不能量出结构」这件事每次跑的结果都不一样。
   */
  noise(amp: number, seed = 12345): this {
    let s = seed;
    const next = () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
    for (let p = 0; p < W * H; p += 1) {
      const d = Math.round((next() - 0.5) * 2 * amp);
      const i = p * 4;
      for (let k = 0; k < 3; k += 1) {
        this.img.data[i + k] = Math.max(0, Math.min(255, this.img.data[i + k]! + d));
      }
    }
    return this;
  }
}

const INK: [number, number, number] = [242, 242, 245];
const DIM: [number, number, number] = [138, 138, 148];
const CARD: [number, number, number] = [20, 24, 33];
const BRAND: [number, number, number] = [199, 185, 255];

/** 三卡指标页。真值：眉标 / 标题(2 行) / 副标题 / 卡片(3 栏) / 页脚 */
function metricsSlide(withAccent: boolean): Sheet {
  const s = new Sheet([11, 14, 20]);
  if (withAccent) s.rect(96, 96, 6, 132, BRAND);
  s.text(128, 118, 130, 18, DIM);            // 眉标
  s.text(128, 212, 500, 58, INK);            // 标题第 1 行
  s.text(128, 280, 560, 58, INK);            // 标题第 2 行
  s.text(128, 324, 340, 24, DIM);            // 副标题
  for (let i = 0; i < 3; i += 1) {
    const x = 96 + i * 416;
    s.rect(x, 420, 380, 190, CARD, 16);
    s.text(x + 32, 510, 150, 56, BRAND);
    s.text(x + 32, 560, 110, 20, DIM);
  }
  s.text(96, 746, 90, 16, DIM);              // 页脚
  return s;
}

/** 居中封面 */
function coverSlide(): Sheet {
  const s = new Sheet([16, 16, 20]);
  s.text(600, 300, 240, 22, DIM);
  s.text(360, 400, 720, 70, INK);
  s.text(480, 480, 480, 70, INK);
  s.text(520, 560, 400, 26, DIM);
  s.text(96, 746, 90, 16, DIM);
  return s;
}

/** 图左文右。真值：图与文并排，应在同一条带内分 2 栏 */
function splitSlide(): Sheet {
  const s = new Sheet([11, 14, 20]);
  s.rect(96, 140, 600, 520, [27, 32, 41], 20);
  s.text(760, 220, 380, 44, INK);
  s.text(760, 300, 520, 20, DIM);
  s.text(760, 336, 500, 20, DIM);
  s.text(760, 372, 540, 20, DIM);
  s.text(96, 746, 90, 16, DIM);
  return s;
}

/** 找一条带：按角色，或按栏数 */
const byRole = (s: ReturnType<typeof structureFromImage>, role: string) => s.bands.find((b) => b.role === role);
const near = (a: number, b: number, tol = 0.015) => Math.abs(a - b) <= tol;

/* ---------------- 基本结构 ---------------- */

test('三卡指标页：眉标 / 标题块 / 三卡 / 页脚 的位置与栏数都对得上', () => {
  const s = structureFromImage(metricsSlide(false).img);
  assert.equal(s.ok, true, s.note);

  const roles = s.bands.map((b) => b.role);
  for (const want of ['eyebrow', 'title', 'metrics', 'footer']) {
    assert.ok(roles.includes(want as never), `角色里应有 ${want}，实际 ${roles.join(',')}`);
  }

  const title = byRole(s, 'title')!;
  const metrics = byRole(s, 'metrics')!;

  // 真值：标题块从 154/810 起（标题两行与副标题算同一块，见下方说明），
  // 卡片带 420/810 起、190/810 高、三栏
  assert.ok(near(title.topRatio, 154 / 810, 0.02), `标题块顶 ${title.topRatio.toFixed(3)}`);
  assert.ok(near(metrics.topRatio, 420 / 810, 0.02), `卡片带顶 ${metrics.topRatio.toFixed(3)}`);
  assert.ok(near(metrics.heightRatio, 190 / 810, 0.03), `卡片带高 ${metrics.heightRatio.toFixed(3)}`);
  assert.equal(metrics.columns, 3, `卡片带应分 3 栏，实际 ${metrics.columns}`);
  assert.ok(near(s.contentBox.left, 96 / 1440, 0.015), `左边距 ${s.contentBox.left.toFixed(3)}`);
});

/**
 * 标题与副标题**合并成一条带**是预期行为，不是缺陷：
 * 它们在视觉上就是一个标题块，间距比行距大不了多少，按像素分不开。
 * 硬要拆开会让渲染层把副标题放到错误的位置，反而不像原稿。
 */
test('标题与副标题合成一个标题块，不做无谓的拆分', () => {
  const s = structureFromImage(metricsSlide(false).img);
  const title = byRole(s, 'title')!;
  const sub = byRole(s, 'subtitle');
  assert.equal(sub, undefined, '副标题不应单独成带，它属于标题块');
  // 标题块应覆盖到副标题的底边（324/810）
  assert.ok(title.topRatio + title.heightRatio >= 324 / 810 - 0.02,
    `标题块底 ${(title.topRatio + title.heightRatio).toFixed(3)} 未覆盖副标题`);
});

test('标题块的字号明显大于眉标——这是判角色的依据', () => {
  const s = structureFromImage(metricsSlide(false).img);
  const title = byRole(s, 'title')!;
  const eyebrow = byRole(s, 'eyebrow')!;
  const titleLine = title.heightRatio / title.lines;
  const eyebrowLine = eyebrow.heightRatio / eyebrow.lines;
  assert.ok(titleLine > eyebrowLine * 1.5,
    `标题行高 ${titleLine.toFixed(4)} 未显著大于眉标 ${eyebrowLine.toFixed(4)}`);
});

/* ---------------- 装饰件 ---------------- */

test('装饰竖条不污染它所在带的对齐与栏数，并单独记进 accents', () => {
  const plain = structureFromImage(metricsSlide(false).img);
  const accent = structureFromImage(metricsSlide(true).img);

  assert.equal(accent.bands.length, plain.bands.length,
    '加了竖条后带的条数不应变化——竖条不是内容');
  assert.ok(accent.accents.some((a) => a.kind === 'vrule'), '竖条应被记成 vrule 装饰件');

  const e1 = byRole(plain, 'eyebrow')!;
  const e2 = byRole(accent, 'eyebrow')!;
  assert.equal(e2.columns, e1.columns, '竖条不该把单栏带变成多栏');
  assert.equal(e2.align, e1.align, '竖条不该改变对齐判定');
  assert.ok(near(e2.leftRatio, e1.leftRatio, 0.02),
    `竖条把眉标带的左边界从 ${e1.leftRatio.toFixed(3)} 带偏到 ${e2.leftRatio.toFixed(3)}`);
});

/* ---------------- 对齐 ---------------- */

test('居中封面：文字带全部判为居中', () => {
  const s = structureFromImage(coverSlide().img);
  assert.equal(s.ok, true, s.note);
  const textBands = s.bands.filter((b) => b.role !== 'footer');
  assert.ok(textBands.length >= 2, `居中封面应至少有 2 条文字带，实际 ${textBands.length}`);
  for (const b of textBands) {
    assert.equal(b.align, 'center', `${b.role} 带应判为居中，实际 ${b.align}`);
  }
  assert.equal(s.align, 'center');
});

test('图左文右：图与文落在同一条带内，且判出 2 栏', () => {
  const s = structureFromImage(splitSlide().img);
  assert.equal(s.ok, true, s.note);
  const wide = s.bands.reduce((a, b) => (b.widthRatio > a.widthRatio ? b : a), s.bands[0]!);
  assert.equal(wide.columns, 2, `图文并排应判 2 栏，实际 ${wide.columns}`);
  assert.ok(near(wide.topRatio, 140 / 810), `主带顶 ${wide.topRatio.toFixed(3)}`);
  assert.ok(wide.heightRatio > 0.5, `主带应覆盖图区高度，实际 ${wide.heightRatio.toFixed(3)}`);
});

/* ---------------- 三种曾经打垮朴素算法的输入 ---------------- */

test('渐变底：不能塌成一条满高的带', () => {
  const s = new Sheet([0, 0, 0]).gradient([12, 16, 38], [46, 24, 72]);
  s.text(600, 300, 240, 22, [201, 198, 224]);
  s.text(360, 400, 720, 70, [255, 255, 255]);
  s.text(480, 480, 480, 70, [255, 255, 255]);
  s.text(520, 560, 400, 26, [201, 198, 224]);
  const r = structureFromImage(s.img);

  assert.equal(r.ok, true, `渐变底不该判失败：${r.note}`);
  assert.ok(r.bands.length >= 2, `渐变底应检出至少 2 条文字带，实际 ${r.bands.length}`);
  assert.ok(r.bands.every((b) => b.heightRatio < 0.5), '渐变底不该把整页判成一条带');
});

test('压缩噪声：不能塌成一条满高的带', () => {
  const r = structureFromImage(splitSlide().noise(6).img);
  assert.equal(r.ok, true, `带噪声的截图不该判失败：${r.note}`);
  assert.ok(r.bands.length >= 2, `应检出至少 2 条带，实际 ${r.bands.length}`);
  const wide = r.bands.reduce((a, b) => (b.widthRatio > a.widthRatio ? b : a), r.bands[0]!);
  assert.equal(wide.columns, 2, `噪声下仍应判出 2 栏，实际 ${wide.columns}`);
});

test('噪声底被量出来，阈值随之抬高', () => {
  const clean = structureFromImage(splitSlide().img);
  // 用 ±20 的重噪声：±6 那种轻噪声低于阈值下限，量出来也不会抬高阈值，
  // 那正是下限存在的意义。要验证「自适应」这件事，噪声得够大。
  const noisy = structureFromImage(splitSlide().noise(20).img);

  assert.ok(noisy.noiseFloor > clean.noiseFloor,
    `带噪图的噪声底 ${noisy.noiseFloor} 应高于干净图 ${clean.noiseFloor}`);
  assert.ok(noisy.inkThreshold > clean.inkThreshold,
    `重噪声应把 ink 阈值从 ${clean.inkThreshold} 抬高，实际 ${noisy.inkThreshold}`);

  // 抬高阈值之后结构仍要能量出来，不能因为噪声就整个放弃
  assert.equal(noisy.ok, true, `重噪声下不该判失败：${noisy.note}`);
  assert.ok(noisy.bands.length >= 2, `重噪声下应仍有至少 2 条带，实际 ${noisy.bands.length}`);
});

test('满幅纹理底：栅格信号退化时退回只用 ink，文字分带仍能量出来', () => {
  // 深色稿拿一张有颗粒的照片当底，是真实设计里很常见的一种
  const s = new Sheet([18, 20, 26]).texture(26);
  s.text(128, 260, 500, 58, [245, 245, 250]);   // 标题块
  s.text(128, 300, 420, 58, [245, 245, 250]);
  s.text(128, 470, 340, 24, [180, 180, 195]);   // 副标题
  const r = structureFromImage(s.img);

  assert.equal(r.ok, true, `满幅纹理底不该判失败：${r.note}`);
  assert.ok(r.bands.length >= 2, `应检出至少 2 条带，实际 ${r.bands.length}`);
  assert.ok(r.bands.every((b) => b.heightRatio < 0.5),
    `不该把整页判成一条带：${r.bands.map((b) => b.heightRatio.toFixed(2)).join(',')}`);

  // 标题块应该落在它真正所在的位置（y 202..300 → 25%~37%）
  const title = r.bands.find((b) => b.role === 'title');
  assert.ok(title, `应判出一条标题带，实际 ${r.bands.map((b) => b.role).join(',')}`);
  assert.ok(near(title.topRatio, 202 / 810, 0.06), `标题带顶 ${title.topRatio.toFixed(3)}`);
});

/* ---------------- 拼图切分 ---------------- */

/** 一页里竖排两张 16:9 的幻灯片，外面套一圈浅色页边——用户常发的就是这种拼图 */
function collage(): Sheet {
  const s = new Sheet([232, 232, 238]);
  const cards: [number, number][] = [[104, 464], [468, 828]];
  for (const [top, bottom] of cards) {
    s.rect(24, top, 624, bottom - top, [16, 18, 24], 12);
    s.text(96, top + 90, 300, 40, [245, 245, 250]);
    s.text(96, top + 150, 420, 18, [170, 170, 182]);
    s.text(96, bottom - 60, 140, 14, [140, 140, 152]);
  }
  return s;
}

test('拼图：切出两张幻灯片，各自量结构', () => {
  const img = collage().img;
  const boxes = detectSlideBoxes(img);
  assert.equal(boxes.length, 2, `应切出 2 张，实际 ${boxes.length}`);

  // 真值：两张卡片的上下边界分别在 104..464 与 468..828
  const tops = boxes.map((b) => b.y0).sort((a, b) => a - b);
  assert.ok(Math.abs(tops[0]! - 104) < 24, `第一张顶 ${tops[0]}`);
  assert.ok(Math.abs(tops[1]! - 468) < 24, `第二张顶 ${tops[1]}`);
  // 切出来的框应该是横向铺满的 16:9 卡片
  for (const b of boxes) {
    const aspect = (b.x1 - b.x0) / (b.y1 - b.y0);
    assert.ok(aspect > 1.4 && aspect < 2.1, `长宽比 ${aspect.toFixed(2)} 不像 16:9`);
  }

  const set = structuresFromImage(img);
  assert.equal(set.split, true);
  assert.equal(set.pages.length, 2);
  for (const page of set.pages) {
    assert.equal(page.ok, true, page.note);
    assert.ok(page.bands.length >= 2, `切出来的每页都应有分带，实际 ${page.bands.length}`);
  }
});

test('单页稿不会被误切：一页里的三张指标卡不是三张幻灯片', () => {
  const set = structuresFromImage(metricsSlide(false).img);
  assert.equal(set.split, false, '三张卡片不该被当成三张幻灯片');
  assert.equal(set.pages.length, 1);
});

/* ---------------- 量不出时必须明说 ---------------- */

test('整幅图区：显式判「量不出」，不产出垃圾结构', () => {
  const s = new Sheet([11, 14, 20]);
  s.rect(0, 0, W, H, [40, 46, 58]);
  const r = structureFromImage(s.img);
  assert.equal(r.ok, false, '整页一块纯色面应判不可测');
  assert.ok(r.note.length > 0, '判不可测时必须给出原因');
  assert.equal(r.bands.length, 0, '判不可测时不应给出任何带');
});

test('纯色图：显式判「量不出」', () => {
  const r = structureFromImage(new Sheet([30, 30, 34]).img);
  assert.equal(r.ok, false);
  assert.ok(r.note.includes('横带') || r.note.includes('提取失败'), r.note);
});

test('尺寸过小：不崩，给出明确说明', () => {
  const r = structureFromImage({ width: 8, height: 8, data: new Uint8Array(8 * 8 * 4) });
  assert.equal(r.ok, false);
  assert.ok(r.note.includes('太小'), r.note);
});
