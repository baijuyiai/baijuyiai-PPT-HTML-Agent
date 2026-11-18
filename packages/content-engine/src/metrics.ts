import { iconForText, type MetricBlock } from '@lumen/ir-schema';

/**
 * 指标抽取：规则优先，模型兜底（PRD §5.3）。
 * 这里实现规则部分。每条结果都带原文与出处，允许后续改主指标。
 */

export type MetricKind = 'percent' | 'money' | 'multiple' | 'rank' | 'trend' | 'plain';

export interface MetricCandidate {
  /** 展示值，如 '87%' */
  value: string;
  /** 指标名称，取自上下文 */
  label: string;
  /** 变化，如 '+12%' */
  trend: string;
  /** 原文片段，可回溯 */
  source: string;
  kind: MetricKind;
  /** 排序权重，越大越可能成为主指标 */
  score: number;
}

interface Pattern {
  kind: MetricKind;
  re: RegExp;
  /** 基础分：百分比与倍数最能体现成果 */
  base: number;
  /** 从匹配中提取展示值 */
  value: (m: RegExpExecArray) => string;
}

const PATTERNS: Pattern[] = [
  {
    kind: 'trend',
    re: /(增长|提升|上升|提高|下降|降低|减少|缩减)\s*(?:了|至|到)?\s*(\d+(?:\.\d+)?)\s*(%|％|个百分点|倍)/g,
    base: 100,
    value: (m) => `${m[1]} ${m[2]}${m[3] === '％' ? '%' : m[3]}`,
  },
  {
    kind: 'percent',
    re: /(\d+(?:\.\d+)?)\s*(%|％|个百分点)/g,
    base: 90,
    value: (m) => `${m[1]}%`,
  },
  {
    kind: 'multiple',
    re: /(\d+(?:\.\d+)?)\s*倍/g,
    base: 85,
    value: (m) => `${m[1]} 倍`,
  },
  {
    kind: 'money',
    re: /(?:人民币|RMB|¥|￥|\$|USD)?\s*(\d+(?:\.\d+)?)\s*(亿元|万元|亿|万|元)/g,
    base: 80,
    value: (m) => `${m[1]}${m[2]}`,
  },
  {
    kind: 'money',
    re: /(?:¥|￥|\$)\s*(\d+(?:\.\d+)?)/g,
    base: 75,
    value: (m) => `¥${m[1]}`,
  },
  {
    kind: 'rank',
    re: /(?:第\s*(\d+)\s*(?:名|位)|TOP\s*(\d+)|前\s*(\d+))/gi,
    base: 70,
    value: (m) => (m[1] ? `第 ${m[1]} 名` : m[2] ? `TOP ${m[2]}` : `前 ${m[3]}`),
  },
  {
    kind: 'plain',
    re: /(\d+(?:,\d{3})+|\d{3,})\s*(?:家|个|人|条|项|次|款|台|套)/g,
    base: 50,
    value: (m) => `${m[1]}${m[0]!.replace(m[1]!, '').trim()}`,
  },
];

/** 取出匹配所在的句子作为原文出处 */
function sentenceAround(text: string, index: number, length: number): string {
  const startBoundary = /[。！？!?；;\n]/;
  let start = index;
  while (start > 0 && !startBoundary.test(text[start - 1]!)) start--;
  let end = index + length;
  while (end < text.length && !startBoundary.test(text[end]!)) end++;
  const sentence = text.slice(start, end).trim();
  return sentence.length > 120 ? `${sentence.slice(0, 117)}...` : sentence;
}

/** 指标名尾部的动词与介词，剥掉后剩下的才是名词短语 */
const TRAILING_VERB_RE = /(增长了?|提升了?|上升了?|提高了?|下降了?|降低了?|减少了?|缩减了?|达到|增至|至|到|为|是|约|近|超过?|突破|实现|占比|同比|环比|分别)+$/;

/**
 * 从出处句子中提取指标名。
 * 数值通常出现在名称之后（「转化率提升到 34%」），因此取数值**之前**的名词短语。
 */
function labelFrom(sentence: string, value: string): string {
  const idx = sentence.indexOf(value);
  const before = idx > 0 ? sentence.slice(0, idx) : sentence;
  let cleaned = before.replace(/[，。；、：:,.!?！？（）()【】[\]"“”\s]/g, '');
  let prev = '';
  while (prev !== cleaned) {
    prev = cleaned;
    cleaned = cleaned.replace(TRAILING_VERB_RE, '');
  }
  const label = cleaned.slice(-10);
  if (label.length >= 2) return label;

  // 数值在句首时（「87% 的用户」）改用数值之后的词
  const after = sentence.slice(idx + value.length).replace(/[，。；、：:,.!?！？（）()【】[\]"“”\s]/g, '');
  const fallback = after.slice(0, 10);
  return fallback.length >= 2 ? fallback : '关键指标';
}

/**
 * 抽取指标候选，按分数降序。
 * 同一数值只保留一条（不同模式可能命中同一处）。
 */
export function extractMetrics(text: string, limit = 8): MetricCandidate[] {
  if (!text) return [];
  const found: MetricCandidate[] = [];
  const seen = new Set<string>();

  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = p.re.exec(text)) !== null) {
      const value = p.value(m);
      const key = `${value}@${m.index}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const source = sentenceAround(text, m.index, m[0].length);
      // 位置越靠前越可能是核心数字，给一点微弱的加分
      const positionBonus = Math.max(0, 8 - Math.floor(m.index / 200));
      found.push({
        value,
        label: labelFrom(source, value),
        trend: p.kind === 'trend' ? value : '',
        source,
        kind: p.kind,
        score: p.base + positionBonus,
      });
      if (m[0].length === 0) p.re.lastIndex++;
    }
  }

  // 按数值去重，保留分最高的那条
  const byValue = new Map<string, MetricCandidate>();
  for (const c of found) {
    const prev = byValue.get(c.value);
    if (!prev || c.score > prev.score) byValue.set(c.value, c);
  }

  return [...byValue.values()].sort((a, b) => b.score - a.score).slice(0, limit);
}

/** 转成 Page IR 的 metric 块。primary 标记主指标，可一键改选。 */
export function toMetricBlocks(candidates: MetricCandidate[], maxCount = 4): MetricBlock[] {
  return candidates.slice(0, maxCount).map((c, i) => ({
    id: '',
    type: 'metric' as const,
    value: c.value,
    label: c.label,
    trend: c.trend,
    source: c.source,
    primary: i === 0,
    // 图标从标签文本推。推不出就不给——硬塞一个通用图标会让每张指标卡长得一样
    icon: iconForText(`${c.label}${c.trend}`),
  }));
}

/** 改选主指标：只允许一页有一个 primary */
export function setPrimaryMetric(blocks: MetricBlock[], index: number): MetricBlock[] {
  return blocks.map((b, i) => ({ ...b, primary: i === index }));
}

/** 是否含核心数字（用于判断该页要不要用 metrics 版式） */
export function hasCoreMetric(text: string): boolean {
  return extractMetrics(text, 1).length > 0;
}
