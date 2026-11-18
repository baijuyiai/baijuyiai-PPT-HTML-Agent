import test from 'node:test';
import assert from 'node:assert/strict';
import type { BandSpec, MeasuredPage, PageType } from '@lumen/ir-schema';
import { BUILTIN_STYLE_PACKS } from './builtin/index.js';
import { deriveMeasuredLayout } from './measured-layout.js';

/**
 * 这一层只做一件事：把「设计稿上量到的像素比例」翻成「风格包能用的容量与几何」。
 * 测试直接喂人造结构，不经过像素——像素那一层由 structure.test.ts 负责。
 */

const PACK = BUILTIN_STYLE_PACKS.find((p) => p.styleId === 'business-classic')!;

function band(partial: Partial<BandSpec> & { role: BandSpec['role'] }): BandSpec {
  return {
    topRatio: 0.2, heightRatio: 0.1, leftRatio: 0.07, widthRatio: 0.6,
    columns: 1, align: 'left', colStart: 1, colSpan: 1, rowStart: 0, rowSpan: 1,
    ...partial,
  };
}

function page(pageType: PageType, bands: BandSpec[], over: Partial<MeasuredPage> = {}): MeasuredPage {
  return {
    pageType, imageIndex: 0, ok: true, note: '', align: 'left',
    cropBox: { x0: 0, y0: 0, x1: 1, y1: 1 },
    contentBox: { left: 0.067, right: 0.067, top: 0.12, bottom: 0.06 },
    bands,
    ...over,
  };
}

const TEXT_PAGE: PageType = 'text';

test('反推出的容量落在合理区间，且写进了每条版式的几何', () => {
  const pages = [page(TEXT_PAGE, [
    band({ role: 'title', topRatio: 0.19, heightRatio: 0.16 }),
    band({ role: 'body', topRatio: 0.45, heightRatio: 0.25 }),
  ])];

  const m = deriveMeasuredLayout(pages, PACK);
  assert.ok(m.capacity.titleChars >= 12 && m.capacity.titleChars <= 60, `标题容量 ${m.capacity.titleChars}`);
  assert.ok(m.capacity.bodyChars >= 80 && m.capacity.bodyChars <= 700, `正文容量 ${m.capacity.bodyChars}`);
  assert.ok(m.capacity.density >= 0.85 && m.capacity.density <= 1.15, `疏密 ${m.capacity.density}`);

  const geom = m.byPageType[TEXT_PAGE]!;
  assert.equal(geom.bands?.length, 2, '几何里应带上量到的横带');
  assert.equal(geom.bands?.[0]?.role, 'title');
  assert.ok(m.applied.some((a) => a.includes('容量')), m.applied.join(' / '));
});

test('容量跟着几何走：正文带越高，反推出的正文容量越大', () => {
  const make = (heightRatio: number) => deriveMeasuredLayout(
    [page(TEXT_PAGE, [
      band({ role: 'title', topRatio: 0.19, heightRatio: 0.16 }),
      band({ role: 'body', topRatio: 0.45, heightRatio }),
    ])],
    PACK,
  ).capacity.bodyChars;

  const small = make(0.12);
  const large = make(0.4);
  assert.ok(large > small,
    `正文带高的应该推出更大的容量，实际 高带 ${large} / 矮带 ${small}`);
});

test('页边距量出来并写回 marginRatio；对齐与图区占比也进几何', () => {
  const pages = [
    page('imageText', [
      band({ role: 'title', topRatio: 0.1, heightRatio: 0.1, leftRatio: 0.08, widthRatio: 0.4 }),
      band({ role: 'visual', topRatio: 0.3, heightRatio: 0.5, leftRatio: 0.08, widthRatio: 0.42 }),
    ], { contentBox: { left: 0.08, right: 0.08, top: 0.1, bottom: 0.05 } }),
  ];
  const m = deriveMeasuredLayout(pages, PACK);
  assert.equal(m.marginRatio, 0.08);
  assert.equal(m.byPageType.imageText?.align, 'left');
  assert.equal(m.byPageType.imageText?.mediaRatio, 0.42, '图区占比应取自量到的那条实心带');
});

test('没量到的页类型要明说，不能假装覆盖了', () => {
  const m = deriveMeasuredLayout([page('cover', [band({ role: 'title' })])], PACK);
  const pending = m.pending.find((p) => p.question.includes('没有设计稿覆盖'));
  assert.ok(pending, `应给出未覆盖页类型的提示：${JSON.stringify(m.pending)}`);
  assert.ok(pending.question.includes('toc'), pending.question);
  assert.ok(!pending.question.includes('cover'), '已覆盖的页类型不该出现在未覆盖清单里');
});

test('一页都量不出时如实说明，并让调用方保留基准族', () => {
  const m = deriveMeasuredLayout([page(TEXT_PAGE, [], { ok: false, note: '量不出' })], PACK);
  assert.equal(Object.keys(m.byPageType).length, 0, '不该给出任何几何覆盖');
  assert.equal(m.marginRatio, null);
  assert.ok(m.pending.some((p) => p.question.includes('没有一页能量出')), JSON.stringify(m.pending));
});

test('纯色封面这类「一条带都没有」的页面不会污染结果', () => {
  const m = deriveMeasuredLayout([page('cover', [])], PACK);
  assert.equal(Object.keys(m.byPageType).length, 0);
});

/* ---------------- 与设计 Lint 的一致性 ---------------- */

test('量出的边距不得低于 Lint 的下限——否则这个包存不进去', () => {
  // 设计 Lint 要求边距 ≥ 画布宽 5%（PRD §3.1）。这里夹到 0.03 的话，
  // 一份 3% 边距的稿子会识别成功、却卡在保存接口上（校验不过就 400）。
  // 两边必须同一个下限，否则「能识别、不能保存」会一直挂着。
  const tight = [page('text', [band({ role: 'title' })], {
    contentBox: { left: 0.02, right: 0.03, top: 0.1, bottom: 0.05 },
  })];
  const m = deriveMeasuredLayout(tight, PACK);
  assert.ok(m.marginRatio !== null);
  assert.ok(m.marginRatio! >= 0.05, `边距 ${m.marginRatio} 低于 Lint 下限`);
  // 抬上去了就要说清楚，不能假装量到的是 5%。
  // 原值报 2.0% 而不是两侧的平均 2.5%：页边距的语义是「内容离最近的页面边缘多远」，
  // 取两侧间隙里小的那个。半幅文字栏（左文右图）取平均会把「文字到分隔线」的
  // 距离也算成留白，实测能把 5% 的边距算成 25%。
  const pending = m.pending.find((p) => p.field === 'margin');
  assert.ok(pending, `抬下限时应留下待确认项：${JSON.stringify(m.pending)}`);
  assert.ok(pending.question.includes('2.0%'), `应写明量到的原值：${pending.question}`);
});

test('取两侧间隙里小的那个，不被半幅文字栏骗出大边距', () => {
  // 左文右图：文字只占左边一半，右边是满高的图。真值边距就是左边那 5%
  const halfWidth = [page('imageText', [band({ role: 'title', leftRatio: 0.05, widthRatio: 0.5 })], {
    contentBox: { left: 0.05, right: 0.45, top: 0.1, bottom: 0.05 },
  })];
  const m = deriveMeasuredLayout(halfWidth, PACK);
  assert.equal(m.marginRatio, 0.05, '应取 5% 而不是两侧平均的 25%');
  assert.equal(m.pending.find((p) => p.field === 'margin'), undefined, '在区间内不该挂待确认项');
});

test('满高的图区带不计入疏密——它是并排的，不是叠在文字上的', () => {
  // 「右侧整列照片」的版式：图区带 topRatio 0 / heightRatio 1，与文字带纵向重叠。
  // 把它也累加进疏密，占比会从 0.48 虚涨到 2.48，疏密被误判成「偏密」，
  // 于是容量被无端压低——版面明明很松，生成出来的文字却被挤成一团
  const bands = [
    band({ role: 'visual', topRatio: 0, heightRatio: 1, leftRatio: 0.55, widthRatio: 0.45 }),
    band({ role: 'title', topRatio: 0.15, heightRatio: 0.12 }),
    band({ role: 'body', topRatio: 0.35, heightRatio: 0.12 }),
  ];
  const box = { left: 0.05, right: 0.45, top: 0.15, bottom: 0.35 };
  const m = deriveMeasuredLayout([page('imageText', bands, { contentBox: box })], PACK);

  // 文字带 0.24 / 内容框 0.5 = 0.48 → 落在 0.35~0.62 之间，疏密为标准
  assert.equal(m.capacity.density, 1, `疏密被图区带带偏了：${m.applied.join('；')}`);

  // 同一个版面，把图区带拿掉，结论必须一样——图区本来就不该参与这个判断
  const withoutVisual = deriveMeasuredLayout(
    [page('imageText', bands.filter((b) => b.role !== 'visual'), { contentBox: box })], PACK,
  );
  assert.equal(withoutVisual.capacity.density, m.capacity.density);
  assert.equal(withoutVisual.capacity.titleChars, m.capacity.titleChars);
});

test('边距本来就在区间内时不产生待确认项', () => {
  const roomy = [page('text', [band({ role: 'title' })], {
    contentBox: { left: 0.08, right: 0.08, top: 0.1, bottom: 0.05 },
  })];
  const m = deriveMeasuredLayout(roomy, PACK);
  assert.equal(m.marginRatio, 0.08);
  assert.equal(m.pending.find((p) => p.field === 'margin'), undefined);
});
