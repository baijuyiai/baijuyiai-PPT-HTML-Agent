import type { BandSpec, PageType, StylePack } from '@lumen/ir-schema';

/**
 * 版式规格：把量出来的网格与横带翻成 **HTML 能理解的那份描述**。
 *
 * 两个去处：识别结果界面上逐条给用户核对；生成页面时注入提示词，
 * 让模型知道这一页该怎么排——而不是只给它内容、版式全靠系统兜底。
 *
 * 之所以要把 CSS 也写进去：模型对 `grid-template-columns: repeat(3, 1fr)`
 * 这类写法比对「三栏并排」这种自然语言更不容易理解偏。两样都给，互相印证。
 *
 * 这一层是**纯派生**的：真值在风格包的 `language.grid` 与 `variant.geometry.bands`，
 * 这里只负责把它读出来，不另存一份，免得两边漂移。
 */

const CANVAS_W = 1920;
const CANVAS_H = 1080;

const ROLE_LABEL: Record<BandSpec['role'], string> = {
  eyebrow: '眉标',
  title: '标题',
  subtitle: '副标题',
  body: '正文',
  visual: '图区',
  metrics: '指标',
  footer: '页脚',
  unknown: '内容',
};

const PAGE_LABEL: Record<PageType, string> = {
  cover: '封面', toc: '目录', section: '转折页', text: '正文页',
  imageText: '图文页', gallery: '图片排版页', people: '人物页', chart: '图表页',
  ui: '界面页',
  architecture: '架构图', mindMap: '思维导图', metrics: '指标页', end: '封底',
};

export interface PageLayoutSpec {
  pageType: PageType;
  /** 逐行规格，界面上按行展示 */
  lines: string[];
  /** 压成一段，直接进提示词 */
  text: string;
}

/** 一条带的网格坐标描述 */
function bandLine(b: BandSpec, columns: number): string {
  const label = ROLE_LABEL[b.role];
  const pos = `顶 ${(b.topRatio * 100).toFixed(1)}% 高 ${(b.heightRatio * 100).toFixed(1)}%`;
  const row = `第 ${b.rowStart + 1}–${b.rowStart + b.rowSpan} 行`;
  // 居中的带不落栏。居中页本来就没有分栏，硬写「第 2 栏」会让生成端把内容塞到右半边，
  // 与原稿完全不像——这种「看起来精确、实则误导」的描述比不写更糟
  if (b.align === 'center') return `- ${label}带：居中 / ${row}（${pos}）`;

  const col = columns > 1 && b.colSpan > 1
    ? `第 ${b.colStart}–${b.colStart + b.colSpan - 1} 栏`
    : `第 ${b.colStart} 栏`;
  const align = b.align === 'n/a' ? '多栏并排' : '左对齐';
  const multi = b.columns > 1 ? `，${b.columns} 栏并排` : '';
  return `- ${label}带：${col} / ${row}（${pos}）${align}${multi}`;
}

/**
 * 生成某一类页面的版式规格。没有量到结构的页类型返回 null——
 * 界面据此明说「这一类沿用基准族」，而不是编一份出来。
 */
export function layoutSpecFor(pageType: PageType, pack: StylePack): PageLayoutSpec | null {
  const variant = pack.base.layouts.find((l) => l.pageType === pageType && l.geometry?.bands?.length);
  const bands = variant?.geometry?.bands;
  if (!bands || bands.length === 0) return null;

  const grid = pack.base.language.grid;
  const marginX = Math.round(grid.marginX * CANVAS_W);
  const marginY = Math.round(grid.marginY * CANVAS_H);
  const pad = `${marginY}px ${marginX}px`;

  /**
   * 整页居中的时候，栏与栏距都不适用——那是给左右分栏的页面用的。
   * 封面、封底、转折页基本都是这一类，对它们讲「第几栏」只会把生成端带偏。
   */
  const centered = bands.every((b) => b.align === 'center');
  const gridLine = centered
    ? `居中排布，不分栏；纵向基线 ${grid.baseline}px`
    : `网格 ${grid.columns} 栏，栏距 ${grid.gutter}px，基线 ${grid.baseline}px`;
  const containerLine = centered
    ? `容器：display:flex; flex-direction:column; align-items:center;`
      + ` row-gap:${grid.baseline}px; padding:${pad};`
    : `容器：display:grid; grid-template-columns: repeat(${grid.columns}, 1fr);`
      + ` column-gap:${grid.gutter}px; padding:${pad};`;

  const ordered = bands.slice().sort((a, b) => a.topRatio - b.topRatio);
  const lines = [
    `版式规格（${PAGE_LABEL[pageType]} · 按设计稿实测）`,
    `画布 ${CANVAS_W}×${CANVAS_H}，内容框内缩 ${marginX}px / ${marginY}px`,
    gridLine,
    containerLine,
    ...ordered.map((b) => bandLine(b, grid.columns)),
  ];

  return {
    pageType,
    lines,
    text: [
      `【${PAGE_LABEL[pageType]}版式】按参考设计稿实测，请照着排：`,
      `- ${gridLine}，内容框内缩 ${marginX}px/${marginY}px`,
      ...ordered.map((b) => bandLine(b, grid.columns)),
    ].join('\n'),
  };
}

/** 这一类页面有没有量到结构 */
export function hasMeasuredLayout(pageType: PageType, pack: StylePack): boolean {
  return Boolean(pack.base.layouts.find((l) => l.pageType === pageType && l.geometry?.bands?.length));
}

/** 整套风格里量到结构的页类型 */
export function measuredPageTypes(pack: StylePack): PageType[] {
  const out = new Set<PageType>();
  for (const l of pack.base.layouts) {
    if (l.geometry?.bands?.length) out.add(l.pageType);
  }
  return [...out];
}
