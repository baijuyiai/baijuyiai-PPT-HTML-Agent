import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_STYLE_PACKS, buildLayouts } from './index.js';
import { measureGrid, placeOnGrid } from './grid.js';
import { layoutSpecFor, measuredPageTypes } from './layout-spec.js';
import type { PageStructure, StructureBand } from './structure.js';

const PACK = BUILTIN_STYLE_PACKS.find((p) => p.styleId === 'business-classic')!;

function band(partial: Partial<StructureBand> & { role: StructureBand['role'] }): StructureBand {
  return {
    topRatio: 0.2, heightRatio: 0.1, leftRatio: 0.067, widthRatio: 0.866,
    lines: 2, kind: 'text', inkDensity: 0.5, columns: 1, align: 'left', surfaceSpans: 0,
    spans: [{ left: 0.067, width: 0.866 }],
    ...partial,
  };
}

/** 一页：三张卡片并排，卡片间留 36px（画布 1920 上）*/
function cardPage(): PageStructure {
  const cardW = 380 / 1440;
  const gap = 36 / 1440;
  const left = 96 / 1440;
  return {
    ok: true, note: '',
    canvas: { w: 1440, h: 810 },
    contentBox: { left, right: left, top: 0.12, bottom: 0.06 },
    columns: 3, align: 'left',
    bands: [
      band({ role: 'title', topRatio: 0.19, heightRatio: 0.16, lines: 2, widthRatio: 0.4 }),
      band({
        role: 'metrics', topRatio: 0.52, heightRatio: 0.23, columns: 3, align: 'n/a', kind: 'surface',
        leftRatio: left, widthRatio: cardW * 3 + gap * 2,
        spans: [
          { left, width: cardW },
          { left: left + cardW + gap, width: cardW },
          { left: left + (cardW + gap) * 2, width: cardW },
        ],
      }),
    ],
    accents: [], noiseFloor: 0, barrierThreshold: 8, inkThreshold: 14,
  };
}

test('量出的网格：栏数取最大栏数，栏距取相邻栏空档', () => {
  const g = measureGrid([cardPage()]);
  assert.equal(g.columns, 3, `栏数应取 3，实际 ${g.columns}`);
  // 空档 36/1440 × 1920 = 48px
  assert.ok(Math.abs(g.gutter - 48) <= 2, `栏距应约 48px，实际 ${g.gutter}`);
  assert.equal(g.evidence.multiColumnBands, 1);
});

test('量出的网格：边距与基线来自内容框与行距', () => {
  const g = measureGrid([cardPage()]);
  assert.ok(Math.abs(g.marginX - 96 / 1440) < 0.01, `左边距 ${g.marginX}`);
  // 标题带 0.16×1080 = 172.8px 两行 → 每行 86.4px，吸附到 2 的倍数
  assert.ok(g.baseline >= 4 && g.baseline <= 80, `基线 ${g.baseline}`);
  assert.equal(g.baseline % 2, 0, '基线应吸附到 2 的倍数');
});

test('量不出结构时不硬编一个网格', () => {
  const empty: PageStructure = { ...cardPage(), ok: false, bands: [] };
  const g = measureGrid([empty]);
  assert.equal(g.columns, 1, '一条带都没有时不该声称有 3 栏');
  assert.equal(g.evidence.pages, 0);
});

test('落栏：贴着内容框左边、铺满内容宽的一条带落在第 1 栏且跨满', () => {
  const g = measureGrid([cardPage()]);
  const p = placeOnGrid(
    { leftRatio: 0.067, widthRatio: 0.866, topRatio: 0.19, heightRatio: 0.16 },
    g,
    { left: 0.067, right: 0.067, top: 0.12, bottom: 0.06 },
  );
  assert.equal(p.colStart, 1);
  assert.equal(p.colSpan, g.columns, `铺满内容宽应跨 ${g.columns} 栏，实际 ${p.colSpan}`);
  assert.ok(p.rowSpan >= 1);
});

test('落栏：越界的带会被夹回网格内，不会算出第 0 栏或超出末栏', () => {
  const g = measureGrid([cardPage()]);
  const p = placeOnGrid(
    { leftRatio: -0.1, widthRatio: 1.4, topRatio: 0.1, heightRatio: 0.1 },
    g,
    { left: 0.067, right: 0.067, top: 0.12, bottom: 0.06 },
  );
  assert.ok(p.colStart >= 1, `colStart ${p.colStart}`);
  assert.ok(p.colStart + p.colSpan - 1 <= g.columns, `超出末栏：${p.colStart}+${p.colSpan}`);
});

/* ---------------- HTML 规格 ---------------- */

/** 造一个带量出来的横带的包 */
function packWithBands() {
  const base = PACK.base.language.grid;
  return {
    ...PACK,
    base: {
      ...PACK.base,
      language: { ...PACK.base.language, grid: { ...base, columns: 3, gutter: 48, baseline: 32 } },
      layouts: buildLayouts(
        { titleChars: 24, bodyChars: 200, density: 1 },
        {
          metrics: {
            align: 'left',
            bands: [
              { role: 'title', topRatio: 0.19, heightRatio: 0.16, leftRatio: 0.067, widthRatio: 0.4, columns: 1, align: 'left', colStart: 1, colSpan: 2, rowStart: 2, rowSpan: 5 },
              { role: 'metrics', topRatio: 0.52, heightRatio: 0.23, leftRatio: 0.067, widthRatio: 0.866, columns: 3, align: 'n/a', colStart: 1, colSpan: 3, rowStart: 13, rowSpan: 8 },
            ],
          },
        },
      ),
    },
  } as typeof PACK;
}

test('HTML 规格：写清网格、内容框与 CSS，并逐条列出横带', () => {
  const spec = layoutSpecFor('metrics', packWithBands());
  assert.ok(spec, '有横带就该出规格');
  const all = spec.lines.join('\n');
  assert.ok(all.includes('3 栏'), all);
  assert.ok(all.includes('栏距 48px'), all);
  assert.ok(all.includes('grid-template-columns: repeat(3, 1fr)'), `缺 CSS 行：${all}`);
  assert.ok(all.includes('标题带：第 1–2 栏'), `标题带的栏位没写对：${all}`);
  assert.ok(all.includes('指标带：第 1–3 栏'), `指标带的栏位没写对：${all}`);
  assert.ok(all.includes('3 栏并排'), `多栏带的栏数没写出来：${all}`);
  // 提示词用的那一段要和逐行规格同源
  assert.ok(spec.text.includes('按参考设计稿实测'), spec.text);
  assert.ok(spec.text.includes('栏距 48px'), spec.text);
});

test('HTML 规格：没量到结构的页类型返回 null，不编一份出来', () => {
  assert.equal(layoutSpecFor('cover', packWithBands()), null);
  assert.deepEqual(measuredPageTypes(packWithBands()), ['metrics']);
});

test('HTML 规格：横带按纵向顺序列出，读起来是自上而下的一页', () => {
  const spec = layoutSpecFor('metrics', packWithBands())!;
  const titleAt = spec.lines.findIndex((l) => l.includes('标题带'));
  const metricsAt = spec.lines.findIndex((l) => l.includes('指标带'));
  assert.ok(titleAt > 0 && metricsAt > titleAt, '标题带应排在指标带前面');
});

/* ---------------- 居中页 ---------------- */

/** 造一个整页居中的包（封面/封底/转折页都是这一类）*/
function centeredPack() {
  const g = PACK.base.language.grid;
  const center = (role: 'title' | 'subtitle', topRatio: number, heightRatio: number) => ({
    role, topRatio, heightRatio,
    leftRatio: 0.27, widthRatio: 0.46, columns: 1, align: 'center' as const,
    colStart: 1, colSpan: 2, rowStart: Math.round(topRatio * 1080 / 32), rowSpan: 3,
  });
  return {
    ...PACK,
    base: {
      ...PACK.base,
      language: { ...PACK.base.language, grid: { ...g, columns: 2, gutter: 41, baseline: 32 } },
      layouts: buildLayouts(
        { titleChars: 24, bodyChars: 200, density: 1 },
        { cover: { align: 'center', bands: [center('title', 0.44, 0.12), center('subtitle', 0.64, 0.05)] } },
      ),
    },
  } as typeof PACK;
}

test('HTML 规格：整页居中时不讲「第几栏」，只讲居中与行位', () => {
  const spec = layoutSpecFor('cover', centeredPack())!;
  const all = spec.lines.join('\n');
  // 居中页没有分栏，写「第 2 栏」会让生成端把内容塞到右半边
  assert.ok(!/第 \d+ 栏/.test(all), `居中页不该出现栏位：${all}`);
  assert.ok(all.includes('居中排布，不分栏'), all);
  assert.ok(all.includes('标题带：居中'), all);
  assert.ok(all.includes('副标题带：居中'), all);
  // 容器也不该是 grid——居中页是纵向堆叠后整体居中
  assert.ok(all.includes('align-items:center'), all);
  assert.ok(!all.includes('grid-template-columns'), `居中页不该给网格容器：${all}`);
  // 提示词那一段与逐行规格同源
  assert.ok(spec.text.includes('居中排布，不分栏'), spec.text);
  assert.ok(!/第 \d+ 栏/.test(spec.text), spec.text);
});

test('HTML 规格：左右分栏的页仍然讲栏位，不被居中规则误伤', () => {
  const all = layoutSpecFor('metrics', packWithBands())!.lines.join('\n');
  assert.ok(all.includes('grid-template-columns'), all);
  assert.ok(all.includes('第 1–2 栏'), all);
});
