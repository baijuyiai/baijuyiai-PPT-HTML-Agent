import type { LayoutVariantSpec, PageIR } from '@lumen/ir-schema';

/** 一页的内容量度量 */
export interface ContentLoad {
  titleChars: number;
  bodyChars: number;
  blocks: number;
  bullets: number;
  metrics: number;
  /** 图片数量 */
  images: number;
  /** 图表数量 */
  charts: number;
}

export function measureContent(page: PageIR): ContentLoad {
  let bodyChars = 0;
  let bullets = 0;
  let metrics = 0;
  let images = 0;
  let charts = 0;

  for (const b of page.blocks) {
    switch (b.type) {
      case 'paragraph':
        bodyChars += b.text.length;
        break;
      case 'bullets':
        bullets += b.items.length;
        bodyChars += b.items.reduce((n, s) => n + s.length, 0);
        break;
      case 'metric':
        metrics += 1;
        bodyChars += b.value.length + b.label.length;
        break;
      case 'image':
        images += 1;
        break;
      case 'chart':
        charts += 1;
        break;
      // 目录条目只算正文体量，不算要点——它们不受「一页要点 ≤5 条」约束
      case 'toc':
        bodyChars += b.items.reduce((n, i) => n + i.title.length, 0);
        break;
    }
  }

  return {
    titleChars: page.title.main.length + page.title.sub.length + page.title.eyebrow.length,
    bodyChars,
    blocks: page.blocks.length,
    bullets,
    metrics,
    images,
    charts,
  };
}

/**
 * 计算内容负载比。> 1 表示超出该版式容量。
 * 各项取最大值而非平均，因为任一维度溢出都会破坏版式。
 */
export function computeLoad(load: ContentLoad, variant: LayoutVariantSpec): number {
  const ratios = [
    load.titleChars / Math.max(variant.maxTitleChars, 1),
    load.bodyChars / Math.max(variant.maxBodyChars, 1),
    load.blocks / Math.max(variant.maxBlocks, 1),
    load.bullets / Math.max(variant.maxBullets, 1),
    load.metrics / Math.max(variant.maxMetrics, 1),
  ];
  if (variant.imageCounts.length > 0 && load.images > 0) {
    const maxImages = Math.max(...variant.imageCounts);
    ratios.push(load.images / maxImages);
  }
  return Math.max(...ratios);
}

export interface DensityVerdict {
  load: ContentLoad;
  ratio: number;
  overflow: boolean;
  /** 建议拆成几页（至少 2 才值得拆） */
  suggestedPages: number;
  reason: string;
}

/** 密度判定：超阈值触发拆页建议（PRD §5.3） */
export function assessDensity(page: PageIR, variant: LayoutVariantSpec, threshold = 1): DensityVerdict {
  const load = measureContent(page);
  const ratio = computeLoad(load, variant);
  const overflow = ratio > threshold;
  const suggestedPages = overflow ? Math.min(4, Math.ceil(ratio)) : 1;

  let reason = '';
  if (overflow) {
    const parts: string[] = [];
    if (load.titleChars > variant.maxTitleChars) parts.push(`标题 ${load.titleChars}/${variant.maxTitleChars} 字`);
    if (load.bodyChars > variant.maxBodyChars) parts.push(`正文 ${load.bodyChars}/${variant.maxBodyChars} 字`);
    if (load.blocks > variant.maxBlocks) parts.push(`块数 ${load.blocks}/${variant.maxBlocks}`);
    if (load.bullets > variant.maxBullets) parts.push(`要点 ${load.bullets}/${variant.maxBullets} 条`);
    if (load.metrics > variant.maxMetrics) parts.push(`指标 ${load.metrics}/${variant.maxMetrics} 个`);
    reason = `内容超出 ${variant.id} 容量：${parts.join('，')}；建议拆为 ${suggestedPages} 页`;
  }

  return { load, ratio, overflow, suggestedPages, reason };
}

/**
 * 把一页的超量内容均分成若干页（用于拆页）。
 * 只拆正文/要点，标题保留在主页并加「（续）」。
 */
export function splitContent<T>(items: T[], pages: number): T[][] {
  const n = Math.max(1, Math.min(pages, items.length));
  const size = Math.ceil(items.length / n);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out.length > 0 ? out : [[]];
}
