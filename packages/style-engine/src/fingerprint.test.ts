import test from 'node:test';
import assert from 'node:assert/strict';
import type { DecodedImage } from './png.js';
import { BUILTIN_STYLE_PACKS } from './builtin/index.js';
import {
  applyFingerprint, fingerprintFromImage, mergeFingerprints, NOT_MEASURABLE,
} from './fingerprint.js';

/** 造一张 RGBA 图。painter 返回 null 表示用底色 */
function mkImage(
  w: number,
  h: number,
  bg: [number, number, number],
  painter: (x: number, y: number) => [number, number, number] | null = () => null,
): DecodedImage {
  const data = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const c = painter(x, y) ?? bg;
      const i = (y * w + x) * 4;
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
  }
  return { width: w, height: h, data };
}

/** 圆角矩形：角上落在圆外则返回 null，露出底色 */
function roundedRect(
  x0: number, y0: number, x1: number, y1: number, r: number, color: [number, number, number],
) {
  return (x: number, y: number): [number, number, number] | null => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return null;
    const cx = x < x0 + r ? x0 + r : x > x1 - r ? x1 - r : x;
    const cy = y < y0 + r ? y0 + r : y > y1 - r ? y1 - r : y;
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy > r * r ? null : color;
  };
}

const WHITE: [number, number, number] = [255, 255, 255];
const DARK: [number, number, number] = [16, 18, 22];
const PANEL: [number, number, number] = [240, 241, 243];
const GRAY_LINE: [number, number, number] = [72, 76, 84];
const BLUE: [number, number, number] = [46, 104, 220];
const ORANGE: [number, number, number] = [235, 140, 40];
const GREEN: [number, number, number] = [40, 170, 110];

/**
 * 密集深色仪表盘：六块面板铺满大部分画面，面板里放三色数据条，
 * 每 12 像素一条横贯全宽的细线。
 *
 * 画细线时故意压在所有内容之上——这样这一行才「自身均匀」，
 * 符合细线检测的前提；否则一条线穿过面板与缝隙时会因明暗不一而被判成文字行。
 */
function denseDashboard(): DecodedImage {
  const cols: [number, number][] = [[16, 124], [140, 248], [264, 372]];
  const rows: [number, number][] = [[16, 140], [156, 280]];
  const bars: [number, number, number][] = [BLUE, ORANGE, GREEN];
  return mkImage(400, 300, DARK, (x, y) => {
    if (y % 12 === 0) return GRAY_LINE;
    const col = cols.findIndex(([a, b]) => x >= a && x <= b);
    const row = rows.findIndex(([a, b]) => y >= a && y <= b);
    if (col < 0 || row < 0) return null;
    // 每块面板下半部分放一条彩色数据条
    const [, y1] = rows[row]!;
    const [x0, x1] = cols[col]!;
    if (y > y1 - 46 && y < y1 - 16 && x > x0 + 12 && x < x1 - 12) {
      return bars[(col + row) % 3]!;
    }
    return [34, 38, 46];
  });
}

test('留白多、无细线的疏朗设计 → 边缘密度低、无网格线', () => {
  // 白底 + 一块小面板，其余全是留白
  const img = mkImage(400, 300, WHITE, roundedRect(120, 120, 280, 190, 12, PANEL));
  const f = fingerprintFromImage(img);
  assert.ok(f.ok);
  assert.equal(f.darkLeaning, false);
  assert.ok(f.edgeDensity <= 0.06, `疏朗设计的边缘密度应很低，实际 ${f.edgeDensity}`);
  assert.equal(f.hairlines, 0, '不该检出细线');
});

test('密集深色仪表盘 → 留白少、检出网格线、多族色相', () => {
  const f = fingerprintFromImage(denseDashboard());
  assert.ok(f.ok);
  assert.equal(f.darkLeaning, true, '深色底应判为暗调');
  assert.ok(f.hairlines >= 8, `应检出多条细线，实际 ${f.hairlines}`);
  assert.ok(f.edgeDensity >= 0.30, `密集设计的边缘密度应很高，实际 ${f.edgeDensity}`);
  assert.ok(f.hueFamilies >= 3, `应识别出多族色相，实际 ${f.hueFamilies}`);
});

test('圆角从面板拐角量出来，直角与圆角能分开', () => {
  const square = fingerprintFromImage(mkImage(400, 300, WHITE, roundedRect(60, 60, 340, 240, 0, PANEL)));
  const rounded = fingerprintFromImage(mkImage(400, 300, WHITE, roundedRect(60, 60, 340, 240, 12, PANEL)));
  const veryRound = fingerprintFromImage(mkImage(400, 300, WHITE, roundedRect(60, 60, 340, 240, 28, PANEL)));
  assert.equal(square.radiusPx, 0, '直角应量成 0');
  // 圆弧在像素网格上是锯齿状的，量出的值会略偏大，这是档位估计而不是精确测量
  assert.ok(rounded.radiusPx !== null && Math.abs(rounded.radiusPx - 12) <= 6, `圆角 12 应量到 12 上下，实际 ${rounded.radiusPx}`);
  assert.ok(veryRound.radiusPx !== null && veryRound.radiusPx > rounded.radiusPx!, '更大的圆角应量出更大的值');
});

test('散落分布的颜色不会被当成面板去量圆角', () => {
  // 满屏均匀散布的小点：包围盒几乎是整张图，但填充率极低
  const img = mkImage(400, 300, WHITE, (x, y) => (x % 7 === 0 && y % 7 === 0 ? PANEL : null));
  const f = fingerprintFromImage(img);
  assert.ok(f.ok);
  assert.equal(f.radiusPx, null, '散落分布时应拒绝给出圆角估计');
});

test('图片太小或没有可统计颜色时如实报「量不到」', () => {
  const tiny = fingerprintFromImage(mkImage(16, 16, WHITE));
  assert.equal(tiny.ok, false);
  assert.ok(tiny.note.length > 0, '应说明为什么量不到');
});

test('指纹覆盖基准族：疏密、图表色板、网格线、圆角都跟着设计稿走', () => {
  const base = BUILTIN_STYLE_PACKS.find((p) => p.styleId === 'business-classic')!.base.language;
  const f = fingerprintFromImage(denseDashboard());
  const { language, applied, pending } = applyFingerprint(base, f);

  assert.equal(language.chart.gridLines, true, '检出细线应开启网格线');
  assert.equal(language.chart.palette, 'categorical', '多族色相应走多色系');
  assert.ok(language.pageRecipes.every((r) => r.spacing === 'tight'), '密集稿应把全部页类型设为 tight');
  assert.ok(language.chart.gridLines === true, '密集稿应开启网格线');
  assert.ok(applied.length >= 3, '应报告实际覆盖了哪几项');
  assert.ok(pending.some((p) => p.field === 'gui.shadow'), '阴影量不到，必须写进待确认');
});

test('量不到的项一条不落地写进待确认，而不是悄悄沿用基准族', () => {
  const base = BUILTIN_STYLE_PACKS[0]!.base.language;
  const f = fingerprintFromImage(mkImage(400, 300, WHITE, roundedRect(60, 60, 340, 240, 8, PANEL)));
  const { pending } = applyFingerprint(base, f);
  const fields = pending.map((p) => p.field);
  assert.ok(fields.includes('guidance'), '使用说明量不到，应列出');
  assert.ok(fields.includes('iconography.container'), '图标容器量不到，应列出');
  assert.ok(fields.includes('gui.radius'), '圆角是估计值，也应列出让人确认');
  assert.ok(NOT_MEASURABLE.length > 0);
});

test('指纹不可用时整包沿用基准族，并说明原因', () => {
  const base = BUILTIN_STYLE_PACKS[0]!.base.language;
  const bad = fingerprintFromImage(mkImage(16, 16, WHITE));
  const { language, pending, applied } = applyFingerprint(base, bad);
  assert.deepEqual(language, base, '量不到时不该改动设计语言');
  assert.equal(applied.length, 0);
  assert.ok(pending[0]!.question.includes('没能从图片量出'));
});

test('多张图取中位数，单张歪掉的截图不会把整包带跑', () => {
  const airy = fingerprintFromImage(mkImage(400, 300, WHITE, roundedRect(120, 120, 280, 190, 4, PANEL)));
  const dense = fingerprintFromImage(mkImage(400, 300, DARK, (x, y) => (y % 12 === 0 ? GRAY_LINE : null)));
  const merged = mergeFingerprints([airy, dense, airy]);
  assert.ok(merged.ok);
  assert.ok(merged.edgeDensity >= Math.min(airy.edgeDensity, dense.edgeDensity));
  assert.ok(merged.edgeDensity <= Math.max(airy.edgeDensity, dense.edgeDensity));
  assert.ok(merged.note.includes('3 张图'));
});

test('一张图都没有时 mergeFingerprints 明确报错，不编造结果', () => {
  const merged = mergeFingerprints([]);
  assert.equal(merged.ok, false);
  assert.ok(merged.note.length > 0);
});
