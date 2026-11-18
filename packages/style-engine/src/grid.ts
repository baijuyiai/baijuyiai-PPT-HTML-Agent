import type { LayoutGrid } from '@lumen/ir-schema';
import type { PageStructure } from './structure.js';

/**
 * 版式网格的测量与落位。
 *
 * 网格是「高级排版」的共同底子：栏与栏之间怎么分、跨页的元素怎么对齐、
 * 纵向的呼吸节奏是多少——这些都得先有一套网格，页面才不是各排各的。
 * 只按百分比硬凑的话，每一页都是孤立的，换个内容量就散了。
 *
 * 这里量的是**设计稿实际用到的那套网格**，不是套一个「12 栏」的通用假设：
 * 栏数取所有横带里出现过的最大栏数（三张卡片就是 3 栏，不是硬说 12 栏），
 * 栏距取相邻栏之间空档的中位数，基线取文字行距的中位数。
 */

const CANVAS_W = 1920;
const CANVAS_H = 1080;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

/** 吸附到 2px 的倍数。基线上出现 7.3px 这种数没有意义 */
const snap2 = (v: number) => Math.max(2, Math.round(v / 2) * 2);

export interface MeasuredGrid extends LayoutGrid {
  /** 量到了几页、几条多栏带，界面上如实说明可信度 */
  evidence: { pages: number; multiColumnBands: number; textBands: number };
}

export function measureGrid(structures: PageStructure[]): MeasuredGrid {
  const ok = structures.filter((s) => s.ok && s.bands.length > 0);
  const bands = ok.flatMap((s) => s.bands);

  /* ---- 栏距：相邻两栏之间的空档 ---- */
  const gaps: number[] = [];
  const columnCounts: number[] = [];
  let multiColumnBands = 0;
  for (const b of bands) {
    if (b.spans.length < 2) continue;
    multiColumnBands += 1;
    columnCounts.push(b.spans.length);
    for (let i = 1; i < b.spans.length; i += 1) {
      const prev = b.spans[i - 1]!;
      const cur = b.spans[i]!;
      const gap = (cur.left - (prev.left + prev.width)) * CANVAS_W;
      if (gap > 0) gaps.push(gap);
    }
  }

  /* ---- 基线：文字行距的中位数。取偏小的那一半，量到的是正文节奏而不是大标题 ---- */
  const lineHeights: number[] = [];
  for (const b of bands) {
    if (b.kind !== 'text' || b.lines < 1) continue;
    lineHeights.push((b.heightRatio * CANVAS_H) / b.lines);
  }
  const lowerHalf = lineHeights.filter((v) => v <= median(lineHeights));

  /* ---- 边距：所有页内容框的中位数 ---- */
  const marginsX = ok.map((s) => (s.contentBox.left + s.contentBox.right) / 2);
  const marginsY = ok.map((s) => (s.contentBox.top + s.contentBox.bottom) / 2);

  return {
    columns: columnCounts.length > 0 ? clamp(Math.max(...columnCounts), 1, 12) : 1,
    gutter: Math.round(clamp(median(gaps), 4, 200)),
    baseline: lineHeights.length > 0 ? snap2(clamp(median(lowerHalf), 4, 80)) : 8,
    marginX: +clamp(median(marginsX), 0.02, 0.15).toFixed(4),
    marginY: +clamp(median(marginsY), 0.02, 0.15).toFixed(4),
    evidence: { pages: ok.length, multiColumnBands, textBands: lineHeights.length },
  };
}

export interface GridPlacement {
  colStart: number;
  colSpan: number;
  rowStart: number;
  rowSpan: number;
}

/**
 * 把一条横带落到网格上。
 *
 * 横向按栏落位（这才是「网格化」的实质：元素对到栏线上，而不是各自算百分比）；
 * 纵向按基线算行位，**但渲染时仍用测到的百分比定位**——测到的位置就是原稿的位置，
 * 为了凑基线把它挪开反而更不像。行位是给「HTML 规格」用的，让生成端知道纵向节奏。
 */
export function placeOnGrid(
  band: { leftRatio: number; widthRatio: number; topRatio: number; heightRatio: number },
  grid: LayoutGrid,
  contentBox: { left: number; right: number; top: number; bottom: number },
): GridPlacement {
  const contentLeft = contentBox.left * CANVAS_W;
  const contentW = (1 - contentBox.left - contentBox.right) * CANVAS_W;
  const columns = Math.max(1, grid.columns);
  const gutter = grid.gutter;

  // 栏宽 + 栏距 = 栏距步长；只有一栏时整个内容宽就是一栏
  const pitch = columns > 1 ? (contentW + gutter) / columns : contentW;
  const bandLeft = band.leftRatio * CANVAS_W;
  const bandW = band.widthRatio * CANVAS_W;

  const colStart = clamp(Math.round((bandLeft - contentLeft) / pitch) + 1, 1, columns);
  const colSpan = clamp(Math.round((bandW + gutter) / pitch), 1, columns - colStart + 1);

  const contentTop = contentBox.top * CANVAS_H;
  const baseline = Math.max(2, grid.baseline);
  const rowStart = Math.max(0, Math.round(((band.topRatio * CANVAS_H) - contentTop) / baseline));
  const rowSpan = Math.max(1, Math.round((band.heightRatio * CANVAS_H) / baseline));

  return { colStart, colSpan, rowStart, rowSpan };
}
