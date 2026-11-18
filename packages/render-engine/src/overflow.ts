import { iconForText, type Block, type LintIssue, type PageIR, type StylePack } from '@lumen/ir-schema';
import { measureContent, type ContentLoad } from '@lumen/content-engine';
import { getFontScale, setFontScale } from './context.js';

/**
 * 溢出策略，严格按 PRD §5.4 的顺序执行：
 *   换 variant → 重排块 → 降字号（阶梯内 1–2 档）→ 拆页（标「续」）→ 摘要（原文可回溯）
 * 每一步之后都重新计算负载，一旦装得下就停止。
 */

export type OverflowStep =
  | 'none'
  | 'variant-switch'
  | 'reflow'
  | 'font-down'
  | 'split'
  | 'summarize';

/** 版式容量（已按当前字号缩放折算） */
export interface EffectiveCapacity {
  maxTitleChars: number;
  maxBodyChars: number;
  maxBlocks: number;
  maxBullets: number;
  maxMetrics: number;
}

/**
 * 版式在给定字号缩放下的有效容量。
 *
 * 字号缩小后同一区域能放下的字数按面积增长（近似 1/scale²），这是「降字号」这一步
 * 能救回溢出的依据。**fitPage 与 lintPage 必须共用这一个口径**——两边各算一套的话，
 * 会出现「适配器认为装得下、Lint 判它超限」，页面被标成失败但内容其实是好的。
 */
export function effectiveCapacity(
  variant: { maxTitleChars: number; maxBodyChars: number; maxBlocks: number; maxBullets: number; maxMetrics: number },
  fontScale = 1,
): EffectiveCapacity {
  const gain = 1 / (Math.min(Math.max(fontScale, 0.5), 1) ** 2);
  return {
    maxTitleChars: variant.maxTitleChars * gain,
    maxBodyChars: variant.maxBodyChars * gain,
    // 块数/要点数/指标数是「几个」而不是「多大」，缩小字号不会让它们变多
    maxBlocks: variant.maxBlocks,
    maxBullets: variant.maxBullets,
    maxMetrics: variant.maxMetrics,
  };
}

export interface FitResult {
  /** 可能被拆成多页，第一页沿用原 pageId */
  pages: PageIR[];
  /** 实际执行过的步骤，按执行顺序 */
  applied: OverflowStep[];
  /** 执行前的负载比 */
  initialRatio: number;
  /** 执行后的负载比 */
  finalRatio: number;
  issues: LintIssue[];
}

/** 版式容量排序用的标量：正文容量为主，块数为辅 */
function capacityScore(load: ContentLoad, pack: StylePack, variantId: string, fontScale = 1): number {
  const v = pack.base.layouts.find((l) => l.id === variantId);
  if (!v) return Number.POSITIVE_INFINITY;
  const cap = effectiveCapacity(v, fontScale);
  const ratios = [
    load.titleChars / Math.max(cap.maxTitleChars, 1),
    load.bodyChars / Math.max(cap.maxBodyChars, 1),
    load.blocks / Math.max(cap.maxBlocks, 1),
    load.bullets / Math.max(cap.maxBullets, 1),
    load.metrics / Math.max(cap.maxMetrics, 1),
  ];
  return Math.max(...ratios);
}

/** 在同一页类型下挑一个容量更大的版式 */
function pickLargerVariant(page: PageIR, pack: StylePack): string | null {
  const load = measureContent(page);
  const current = capacityScore(load, pack, page.layoutVariant);
  if (current <= 1) return null;

  const candidates = pack.base.layouts
    .filter((l) => l.pageType === page.pageType && l.id !== page.layoutVariant)
    .map((l) => ({ id: l.id, score: capacityScore(load, pack, l.id) }))
    .filter((c) => c.score < current)
    .sort((a, b) => a.score - b.score);

  return candidates[0]?.id ?? null;
}

/**
 * 重排块：裁掉超出上限的要点与指标，丢弃多余的非关键块。
 * **不截断正文**——截断属于「摘要」步骤，必须晚于拆页发生（PRD §5.4 的既定顺序）。
 */
function reflowBlocks(page: PageIR, pack: StylePack): { page: PageIR; changed: boolean } {
  const v = pack.base.layouts.find((l) => l.id === page.layoutVariant);
  if (!v) return { page, changed: false };
  let changed = false;

  const blocks: Block[] = [];
  let metricCount = 0;
  for (const b of page.blocks) {
    if (b.type === 'bullets' && b.items.length > v.maxBullets) {
      blocks.push({ ...b, items: b.items.slice(0, v.maxBullets) });
      changed = true;
      continue;
    }
    if (b.type === 'metric') {
      metricCount += 1;
      if (metricCount > v.maxMetrics) {
        changed = true;
        continue;
      }
      blocks.push(b);
      continue;
    }
    blocks.push(b);
  }

  // 块数超限时从尾部丢弃非关键块（保留主指标）
  if (blocks.length > v.maxBlocks) {
    const primaryIdx = blocks.findIndex((b) => b.type === 'metric' && b.primary);
    const kept = blocks.slice(0, v.maxBlocks);
    if (primaryIdx >= v.maxBlocks && primaryIdx >= 0) {
      kept[v.maxBlocks - 1] = blocks[primaryIdx]!;
    }
    return { page: { ...page, blocks: kept }, changed: true };
  }

  return { page: { ...page, blocks }, changed };
}

/** 降字号：阶梯内最多降两档，且不得低于品质基线下限 */
function tryFontDown(page: PageIR, pack: StylePack): { page: PageIR; ok: boolean } {
  const current = getFontScale(page);
  const next = current >= 1 ? 0.9 : current >= 0.9 ? 0.85 : 0;
  if (next === 0) return { page, ok: false };
  const minSize = pack.base.rules.minFontSize;
  const scaledBody = pack.base.typography.roles.find((r) => r.role === 'body')!.sizePx * next;
  if (scaledBody < minSize) return { page, ok: false };
  return { page: setFontScale(page, next), ok: true };
}

/** 可再分配的最小内容单元 */
interface Unit {
  block: Block;
  weight: number;
}

/**
 * 把块拆成最小单元。
 * 长段落必须按句拆开，否则「一个超长段落」这种最常见的溢出场景无法通过拆页解决。
 */
function explodeUnits(blocks: Block[]): Unit[] {
  const units: Unit[] = [];
  for (const b of blocks) {
    if (b.type === 'paragraph') {
      const sentences = b.text.split(/(?<=[。！？；])/).map((s) => s.trim()).filter((s) => s.length > 0);
      if (sentences.length <= 1) {
        units.push({ block: b, weight: b.text.length });
        continue;
      }
      for (const s of sentences) units.push({ block: { ...b, id: '', text: s }, weight: s.length });
    } else if (b.type === 'bullets') {
      for (const item of b.items) units.push({ block: { ...b, id: '', items: [item] }, weight: item.length });
    } else if (b.type === 'metric') {
      units.push({ block: b, weight: b.value.length + b.label.length });
    } else {
      // 图片与图表按固定权重计，且不会被拆散
      units.push({ block: b, weight: 60 });
    }
  }
  return units;
}

/** 把单元重新组装成块：连续的正文单元并成一段，连续的要点单元并成一个列表 */
function unitsToBlocks(units: Unit[]): Block[] {
  const blocks: Block[] = [];
  let textBuf: string[] = [];
  let bulletBuf: string[] = [];

  const flushText = () => {
    if (textBuf.length > 0) {
      blocks.push({ id: '', type: 'paragraph', text: textBuf.join('') });
      textBuf = [];
    }
  };
  const flushBullets = () => {
    if (bulletBuf.length > 0) {
      const items = bulletBuf.slice(0, 5);
      blocks.push({ id: '', type: 'bullets', items, icons: items.map((t) => iconForText(t) ?? '') });
      bulletBuf = [];
    }
  };

  for (const u of units) {
    if (u.block.type === 'paragraph') {
      flushBullets();
      textBuf.push(u.block.text);
    } else if (u.block.type === 'bullets') {
      flushText();
      bulletBuf.push(...u.block.items);
    } else {
      flushText();
      flushBullets();
      blocks.push(u.block);
    }
  }
  flushText();
  flushBullets();
  return blocks;
}

/** 拆页：把正文类内容均分到多页，后续页标题加「（续）」；图片与图表只留在第一页 */
function splitPage(page: PageIR, pages: number): PageIR[] {
  const media = page.blocks.filter((b) => b.type === 'image' || b.type === 'chart');
  const textish = page.blocks.filter((b) => b.type !== 'image' && b.type !== 'chart');
  const units = explodeUnits(textish);
  if (units.length === 0) return [page];

  const total = units.reduce((n, u) => n + u.weight, 0);
  const target = total / pages;
  const groups: Unit[][] = [];
  let cur: Unit[] = [];
  let acc = 0;

  for (const u of units) {
    if (cur.length > 0 && acc + u.weight > target && groups.length < pages - 1) {
      groups.push(cur);
      cur = [];
      acc = 0;
    }
    cur.push(u);
    acc += u.weight;
  }
  if (cur.length > 0) groups.push(cur);
  if (groups.length <= 1) return [page];

  return groups.map((group, i) => ({
    ...page,
    pageId: i === 0 ? page.pageId : `${page.pageId}-r${i}`,
    title: i === 0
      ? page.title
      : { ...page.title, main: `${page.title.main}（续）` },
    blocks: i === 0 ? [...media, ...unitsToBlocks(group)] : unitsToBlocks(group),
    footer: { ...page.footer, pageNo: page.footer.pageNo + i },
  }));
}

/** 摘要：截断正文并把原文存入 overrides 供回溯 */
function summarize(page: PageIR, pack: StylePack): PageIR {
  const v = pack.base.layouts.find((l) => l.id === page.layoutVariant);
  const limit = v ? Math.max(40, Math.floor(v.maxBodyChars * 0.8)) : 200;
  const original = page.blocks
    .filter((b) => b.type === 'paragraph')
    .map((b) => (b.type === 'paragraph' ? b.text : ''))
    .join('\n');

  const blocks = page.blocks.map((b) => {
    if (b.type !== 'paragraph') return b;
    if (b.text.length <= limit) return b;
    const head = b.text.slice(0, limit);
    const cut = head.lastIndexOf('。');
    const text = cut > limit * 0.5 ? head.slice(0, cut + 1) : `${head}…`;
    return { ...b, text };
  });

  return {
    ...page,
    blocks,
    overrides: { ...page.overrides, summarized: true, originalText: original },
  };
}

/**
 * 让一页内容适配其版式。返回一页或多页（拆页时）。
 */
export function fitPage(page: PageIR, pack: StylePack): FitResult {
  const applied: OverflowStep[] = [];
  const issues: LintIssue[] = [];
  let current = page;

  const ratioOf = (p: PageIR) => capacityScore(measureContent(p), pack, p.layoutVariant, getFontScale(p));
  const initialRatio = ratioOf(page);
  let ratio = initialRatio;

  if (ratio <= 1) {
    return { pages: [page], applied: ['none'], initialRatio, finalRatio: ratio, issues };
  }

  // 1. 换 variant
  const larger = pickLargerVariant(current, pack);
  if (larger) {
    current = { ...current, layoutVariant: larger };
    applied.push('variant-switch');
    ratio = ratioOf(current);
    if (ratio <= 1) return finish();
  }

  // 2. 重排块
  const reflowed = reflowBlocks(current, pack);
  if (reflowed.changed) {
    current = reflowed.page;
    applied.push('reflow');
    ratio = ratioOf(current);
    if (ratio <= 1) return finish();
  }

  // 3. 降字号（阶梯内最多两档）
  for (let i = 0; i < 2; i++) {
    const down = tryFontDown(current, pack);
    if (!down.ok) break;
    current = down.page;
    applied.push('font-down');
    ratio = ratioOf(current);
    if (ratio <= 1) return finish();
  }

  // 4. 拆页
  const pages = Math.min(4, Math.max(2, Math.ceil(ratio)));
  const split = splitPage(current, pages);
  if (split.length > 1) {
    applied.push('split');
    const worst = Math.max(...split.map(ratioOf));
    if (worst <= 1) {
      return { pages: split, applied, initialRatio, finalRatio: worst, issues };
    }
    current = split[0]!;
    ratio = worst;
    // 拆页后仍超限：对每一页做摘要兜底
    applied.push('summarize');
    const finalPages = split.map((p) => summarize(p, pack));
    const finalWorst = Math.max(...finalPages.map(ratioOf));
    issues.push({
      rule: 'overflow/summarized',
      severity: 'warning',
      message: `内容量超出该版式容量，已按策略摘要处理；原文保留在 overrides.originalText 可回溯`,
      path: `pages.${page.pageId}`,
    });
    return { pages: finalPages, applied, initialRatio, finalRatio: finalWorst, issues };
  }

  // 5. 摘要
  applied.push('summarize');
  const summarized = summarize(current, pack);
  issues.push({
    rule: 'overflow/summarized',
    severity: 'warning',
    message: '内容量超出该版式容量，已摘要处理；原文保留在 overrides.originalText 可回溯',
    path: `pages.${page.pageId}`,
  });
  return { pages: [summarized], applied, initialRatio, finalRatio: ratioOf(summarized), issues };

  function finish(): FitResult {
    return { pages: [current], applied, initialRatio, finalRatio: ratio, issues };
  }
}

/** 批量适配整份 deck，并重排页码 */
export function fitDeck(pages: PageIR[], pack: StylePack): { pages: PageIR[]; issues: LintIssue[] } {
  const out: PageIR[] = [];
  const issues: LintIssue[] = [];
  for (const page of pages) {
    const r = fitPage(page, pack);
    out.push(...r.pages);
    issues.push(...r.issues);
  }
  return {
    pages: out.map((p, i) => ({ ...p, footer: { ...p.footer, pageNo: i + 1 } })),
    issues,
  };
}
