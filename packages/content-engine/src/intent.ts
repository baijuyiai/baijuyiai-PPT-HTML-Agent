import type { IntentKind, IntentResult } from '@lumen/ir-schema';

/**
 * 意图识别：已有完整内容 / 仅大纲 / 仅想法 / 混合（PRD §5.3）。
 *
 * 纯规则实现，不依赖模型。理由是意图识别决定了后续整条链路的分支，
 * 用模型判断会引入不确定性且成本不划算；规则对四类输入的判别已经足够稳定。
 */

/** 显式结构标记：编号、Markdown 标题、项目符号 */
const HEADING_RE = /^\s*(?:\d+[.、)]\s*|#{1,6}\s+|[-*+]\s+|[一二三四五六七八九十]+[、.]\s*)/;
/** 顶层结构标记：编号标题与中文序号标题。用于把子项归入所属章节 */
const TOP_HEADING_RE = /^\s*(?:\d+[.、)]\s*|#{1,3}\s+|[一二三四五六七八九十]+[、.]\s*)/;
/** 句末标点 */
const SENTENCE_END_RE = /[。！？!?；;]/;

export interface IntentSignals {
  charCount: number;
  lineCount: number;
  /** 带显式结构标记的行数 */
  structureLines: number;
  /** 正文（非结构行）的字符数。比总字数更能反映「有没有真内容」 */
  bodyChars: number;
  /** 句子数 */
  sentenceCount: number;
  /** 平均句长（字符） */
  avgSentenceLength: number;
  /** 段落数（空行分隔） */
  paragraphCount: number;
}

export function analyzeSignals(text: string): IntentSignals {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  const lines = normalized.split('\n').filter((l) => l.trim().length > 0);
  const sentences = normalized.split(SENTENCE_END_RE).map((s) => s.trim()).filter((s) => s.length > 0);
  const paragraphs = normalized.split(/\n\s*\n/).filter((p) => p.trim().length > 0);
  const structureLines = lines.filter((l) => HEADING_RE.test(l)).length;
  const bodyChars = lines
    .filter((l) => !HEADING_RE.test(l))
    .reduce((n, l) => n + l.replace(/\s/g, '').length, 0);
  const charCount = normalized.replace(/\s/g, '').length;
  return {
    charCount,
    lineCount: lines.length,
    structureLines,
    bodyChars,
    sentenceCount: sentences.length,
    avgSentenceLength: sentences.length > 0 ? Math.round(charCount / sentences.length) : charCount,
    paragraphCount: paragraphs.length,
  };
}

/**
 * 判定意图类型。
 * 判据优先级：结构化程度 > 内容体量。
 */
export function detectIntent(text: string): IntentResult {
  const s = analyzeSignals(text);

  if (s.charCount === 0) {
    return { kind: 'idea_only', confidence: 1, reason: '输入为空，按仅想法处理', contentSegments: 0 };
  }

  const structured = s.structureLines >= 2;
  // 「有真内容」看正文体量而非总字数：结构行本身也会贡献字数，容易把纯大纲误判成完整内容
  const substantial = s.charCount >= 400 || s.bodyChars >= 250;
  const veryShort = s.charCount < 200 && s.lineCount <= 5;

  let kind: IntentKind;
  let reason: string;
  let confidence: number;

  if (structured && substantial) {
    kind = 'has_content';
    reason = `检测到 ${s.structureLines} 行结构标记，正文 ${s.bodyChars} 字，判定为已有完整内容`;
    confidence = 0.9;
  } else if (structured) {
    kind = 'outline_only';
    reason = `检测到 ${s.structureLines} 行结构标记但正文仅 ${s.bodyChars} 字，判定为仅有大纲`;
    confidence = 0.82;
  } else if (veryShort) {
    kind = 'idea_only';
    reason = `正文仅 ${s.charCount} 字且无结构标记，判定为仅想法`;
    confidence = 0.88;
  } else if (substantial && s.paragraphCount >= 3) {
    kind = 'has_content';
    reason = `正文 ${s.charCount} 字、${s.paragraphCount} 段，虽无显式标记但内容完整，判定为已有内容`;
    confidence = 0.75;
  } else if (s.paragraphCount >= 2 && s.charCount >= 150) {
    kind = 'mixed';
    reason = `正文 ${s.charCount} 字、${s.paragraphCount} 段，部分结构化，判定为混合输入`;
    confidence = 0.7;
  } else {
    kind = 'idea_only';
    reason = `正文 ${s.charCount} 字、结构松散，判定为仅想法`;
    confidence = 0.68;
  }

  return { kind, confidence, reason, contentSegments: structured ? s.structureLines : s.paragraphCount };
}

/** 按意图类型给出建议的默认页数区间，供大纲生成参考 */
export function suggestedPageRange(kind: IntentKind, signals: IntentSignals): { min: number; max: number } {
  switch (kind) {
    case 'has_content':
      // 已有内容时页数由内容量决定：约每 300 字一页
      return { min: 3, max: Math.max(4, Math.min(24, Math.ceil(signals.charCount / 300) + 2)) };
    case 'outline_only':
      return { min: signals.structureLines + 2, max: signals.structureLines * 2 + 2 };
    case 'mixed':
      return { min: 5, max: 14 };
    case 'idea_only':
    default:
      return { min: 6, max: 12 };
  }
}

/**
 * 从已有内容中切分出可分配的段落块。
 * 优先按**顶层**标题切（子项目符号归入所属章节）；没有顶层标题时按任意结构行切；
 * 再没有则按空行段落切；最后按句子聚合。
 */
export function segmentContent(text: string, maxSegments = 40): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const lines = normalized.split('\n');
  const topHeadings = lines.filter((l) => TOP_HEADING_RE.test(l)).length;
  const anyStructure = lines.filter((l) => HEADING_RE.test(l)).length >= 2;

  if (topHeadings >= 2 || anyStructure) {
    // 以顶层标题为界切块；若没有顶层标题，退化为以任意结构行为界
    const boundary = topHeadings >= 2 ? TOP_HEADING_RE : HEADING_RE;
    const blocks: string[] = [];
    let current: string[] = [];
    for (const line of lines) {
      const t = line.trim();
      if (t.length === 0) continue;
      if (boundary.test(line) && current.length > 0) {
        blocks.push(current.join('\n'));
        current = [t];
      } else {
        current.push(t);
      }
    }
    if (current.length > 0) blocks.push(current.join('\n'));
    return blocks.slice(0, maxSegments);
  }

  const paragraphs = normalized.split(/\n\s*\n/).map((p) => p.trim()).filter((p) => p.length > 0);
  if (paragraphs.length >= 2) return paragraphs.slice(0, maxSegments);

  const sentences = normalized.split(SENTENCE_END_RE).map((s) => s.trim()).filter((s) => s.length > 0);
  // 每 3 句聚合成一段，避免一页塞一句话
  const grouped: string[] = [];
  for (let i = 0; i < sentences.length; i += 3) {
    grouped.push(sentences.slice(i, i + 3).join('。') + '。');
  }
  return grouped.slice(0, maxSegments);
}
