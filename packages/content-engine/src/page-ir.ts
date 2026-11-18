import {
  DEFAULT_AVATAR, DEFAULT_MOTION, DEFAULT_SCRIPT, iconForText, isMotionMode,
  type AudienceTag, type Block, type ChartBlock, type ImageBlock, type MotionName,
  type OutlinePage, type PageIR, type PageType, type StylePack,
} from '@lumen/ir-schema';
import { pickVariant } from '@lumen/style-engine';
import { extractMetrics, toMetricBlocks } from './metrics.js';

/** 数字与单位（87%、3 倍、1.2 亿）与引号内术语作为强调词 */
const NUMERIC_RE = /(?:\d+(?:\.\d+)?\s*(?:%|％|个百分点|倍|亿元|万元|亿|万|元|家|个|人))|(?:\d{2,})/g;
const QUOTED_RE = /[「『《"“]([^」』》"”]{2,12})[」』》"”]/g;

export function extractAccentWords(text: string, limit = 3): string[] {
  const words: string[] = [];
  const seen = new Set<string>();

  for (const m of text.matchAll(QUOTED_RE)) {
    const w = m[1]!.trim();
    if (w && !seen.has(w)) {
      seen.add(w);
      words.push(w);
    }
  }
  for (const m of text.matchAll(NUMERIC_RE)) {
    const w = m[0].replace(/\s+/g, ' ').trim();
    if (w && !seen.has(w)) {
      seen.add(w);
      words.push(w);
    }
  }
  return words.slice(0, limit);
}

/** 图表数据抽取：识别「类别 数值」成对出现的行 */
const CHART_ROW_RE = /([^\s\d:：,，、]{1,12})\s*[:：]?\s*(-?\d+(?:\.\d+)?)\s*(%|％|万|亿|元)?/g;

export interface ChartData {
  categories: string[];
  series: { name: string; values: number[] }[];
  unit: string;
}

export function buildChartData(text: string): ChartData | null {
  if (!text) return null;
  const categories: string[] = [];
  const values: number[] = [];
  const units = new Set<string>();

  for (const line of text.split(/[\n。；;]/)) {
    CHART_ROW_RE.lastIndex = 0;
    const rows = [...line.matchAll(CHART_ROW_RE)].filter((m) => {
      const label = m[1]!.trim();
      // 过滤掉「第 1 名」这类纯序数标签
      return label.length >= 2 && !/^\d+$/.test(label);
    });
    if (rows.length === 0) continue;
    for (const r of rows) {
      const label = r[1]!.trim();
      if (categories.includes(label)) continue;
      categories.push(label);
      values.push(Number(r[2]));
      if (r[3]) units.add(r[3] === '％' ? '%' : r[3]);
    }
  }

  if (categories.length < 3) return null;
  return { categories, series: [{ name: '数值', values }], unit: units.size === 1 ? [...units][0]! : '' };
}

/** 需要正文的页类型。封面/章节页/封底只有标题，塞正文进去是凭空造内容 */
const WANTS_BODY = new Set<PageType>(['text', 'imageText', 'chart', 'metrics', 'toc']);

/** 图表类型推断：趋势词多则折线，否则柱状 */
export function inferChartKind(text: string): ChartBlock['kind'] {
  const trendHits = (text.match(/增长|上升|提升|趋势|逐|同比|环比|走势/g) ?? []).length;
  return trendHits >= 2 ? 'line' : 'bar';
}

/**
 * 图片提示词。
 * 强制约束（PRD §5.15）：不生成文字、不生成 Logo、不生成可识别真人肖像。
 *
 * 这里**不接风格包的图片使用说明**：那套说明讲的是边框、圆角、比例、题注位置，
 * 全是版式要求，塞进画面提示词只会污染生成结果。它该去的地方是页级文案提示词
 * （见 server-core 的 styleGuidanceLines），因为图片怎么用会影响这一页的文字怎么写。
 */
export function buildImagePrompt(title: string, claim: string, toneKeywords: string[]): string {
  const subject = claim || title;
  const tone = toneKeywords.slice(0, 3).join('、');
  return [
    subject.slice(0, 60),
    tone ? `${tone}的视觉调性` : '极简商务视觉',
    '抽象几何构图，柔和渐变，大面积留白，高级质感',
    '画面中不要出现任何文字、字母、数字、水印、Logo',
    '不要出现可识别的真人肖像',
  ].join('，');
}

function makeImageBlock(id: string, prompt: string): ImageBlock {
  return {
    id,
    type: 'image',
    source: 'ai',
    src: '',
    prompt,
    genParams: { provider: 'openai-compatible', model: 'gpt-image-2', size: '1536x1024', quality: 'high' },
    status: 'pending',
    ratio: '16:9',
    caption: '',
    focus: 'center',
    placeholderReason: '',
  };
}

/**
 * 按风格包的白名单挑一个入场动效。
 *
 * 默认给 `auto`：整本用同一个动效是「一页一页翻」的机械感，轮换才是默认；
 * 调用方要固定某个动效就显式传 `prefer`。
 */
export function pickMotion(pack: StylePack, prefer: MotionName = 'auto'): MotionName {
  // 模式（auto / stagger）不受白名单约束——白名单管的是「具体动效」，
  // 拿模式去 `includes` 永远是 false，会被下面那句改写成第一个具体动效
  if (isMotionMode(prefer)) return prefer;
  const list = pack.base.motionWhitelist;
  if (list.includes(prefer)) return prefer;
  return list.find((m) => m !== 'none') ?? 'none';
}

/** 该页类型是否需要图片 */
function needsImage(pageType: PageType, variantId: string): boolean {
  if (pageType === 'imageText') return true;
  if (pageType === 'cover' && variantId.includes('full-bleed')) return true;
  return false;
}

/** 段落自带的结构标题行不是正文，渲染前剥掉 */
function stripLeadingHeading(text: string): string {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length > 1 && /^\s*(?:\d+[.、)]\s*|#{1,3}\s+|[一二三四五六七八九十]+[、.]\s*)/.test(lines[0]!)) {
    return lines.slice(1).join('\n');
  }
  return text;
}

export interface BuildPageInput {
  pageId: string;
  outline: OutlinePage;
  pack: StylePack;
  pageIndex: number;
  totalPages: number;
  /** 该页对应的原始内容，用于抽指标与要点 */
  sourceText?: string;
  avatarEnabled?: boolean;
  audienceTag?: AudienceTag;
  /**
   * 整份大纲的章节清单，供目录页使用。
   * 目录要的是「全篇有哪几章」，单页入参给不了，所以由调用方从大纲里收集后传进来。
   */
  sections?: { title: string; pageNo: number }[];
}

/**
 * 由大纲页构建 Page IR。
 * 版式一律从风格包挑选，配色/字体/间距全部来自风格包（PRD §5.15）。
 */
export function buildPageIR(input: BuildPageInput): PageIR {
  const { outline, pack, pageIndex } = input;
  const sourceText = input.sourceText ?? outline.notes ?? '';
  const haystack = `${outline.title}\n${outline.claim}\n${outline.points.join('\n')}\n${sourceText}`;

  const metrics = extractMetrics(haystack, 4);
  const chartData = outline.pageType === 'chart' ? buildChartData(haystack) : null;

  // 声明为图表页但没有可用数据时降级为文本页，避免渲染出空图
  let pageType: PageType = outline.pageType;
  let degradeReason = '';
  if (pageType === 'chart' && !chartData) {
    pageType = metrics.length >= 2 ? 'metrics' : 'text';
    degradeReason = '原始内容中没有可解析的成组数值，图表页降级';
  }

  const blocks: Block[] = [];
  const bulletItems = outline.points.slice(0, pack.base.rules.maxBullets);

  // 目录页：条目来自整份大纲的章节，不从正文抽
  if (pageType === 'toc') {
    const sections = input.sections ?? [];
    if (sections.length > 0) {
      blocks.push({
        id: `${input.pageId}-toc`,
        type: 'toc',
        items: sections.map((s) => ({ title: s.title, pageNo: s.pageNo })),
      });
    } else {
      // 没有章节可列时降级为文本页，避免渲染出一张空目录
      pageType = 'text';
      degradeReason = '大纲里没有章节页，目录页降级';
    }
  }

  if (chartData) {
    blocks.push({
      id: `${input.pageId}-chart`,
      type: 'chart',
      kind: inferChartKind(haystack),
      data: { categories: chartData.categories, series: chartData.series },
      renderer: 'echarts',
      option: {},
    });
  }

  // 指标卡只在页类型确实是「指标」时使用。
  // 文本页即便正文里有数字也应保留散文——否则会把整段叙述换成几个数字，丢信息。
  if (pageType === 'metrics') {
    if (metrics.length > 0) {
      blocks.push(...toMetricBlocks(metrics, 4));
    } else {
      // 指标页抽不出指标就降级成文本页。
      // 不降级的话会留下一个「指标页」却一张指标卡都没有，hero-metric 版式空着大半张纸。
      pageType = 'text';
      if (!degradeReason) degradeReason = '原始内容里没有可解析的指标，指标页降级';
    }
  }

  if (bulletItems.length > 0) {
    blocks.push({
      id: `${input.pageId}-bullets`,
      type: 'bullets',
      items: bulletItems,
      icons: bulletItems.map((t) => iconForText(t) ?? ''),
    });
  }

  // 兜底段落。两个限制条件：
  // 一是只给「需要正文」的页类型——封面/章节页/封底本来就是标题页，
  //   给它们塞一段正文等于凭空多出一块内容；
  // 二是内容与标题不同——大纲输入时 sourceText 为空，兜底会取到 claim，
  //   而 claim 常常就等于标题，那样渲染出来就是标题重复一遍。
  let fallbackParagraph = false;
  if (blocks.length === 0 && WANTS_BODY.has(pageType)) {
    const paragraph = stripLeadingHeading((sourceText || outline.claim).trim());
    if (paragraph && paragraph !== outline.title.trim()) {
      blocks.push({ id: `${input.pageId}-para`, type: 'paragraph', text: paragraph.slice(0, 600) });
      fallbackParagraph = true;
    }
  }

  const variant = pickVariant(pack, pageType, {
    titleChars: outline.title.length + outline.claim.length,
    bodyChars: blocks.reduce((n, b) => {
      if (b.type === 'paragraph') return n + b.text.length;
      if (b.type === 'bullets') return n + b.items.reduce((k, s) => k + s.length, 0);
      if (b.type === 'metric') return n + b.value.length + b.label.length;
      return n;
    }, 0),
    blocks: blocks.length + (needsImage(pageType, '') ? 1 : 0),
    bullets: bulletItems.length,
    metrics: blocks.filter((b) => b.type === 'metric').length,
  });

  if (needsImage(pageType, variant.id)) {
    blocks.unshift(makeImageBlock(
      `${input.pageId}-img`,
      buildImagePrompt(outline.title, outline.claim, pack.toneKeywords),
    ));
  }

  const sub = outline.claim && outline.claim !== outline.title ? outline.claim : '';
  const avatarOn = input.avatarEnabled === true;

  return {
    pageId: input.pageId,
    pageType,
    layoutVariant: variant.id,
    // 旧链路按 blocks 排版，不产 HTML；新链路（generate-html.service）才写这一项
    html: '',
    title: {
      eyebrow: outline.section,
      main: outline.title,
      accentWords: extractAccentWords(`${outline.title} ${outline.claim}`, 3),
      sub,
    },
    blocks,
    motion: { ...DEFAULT_MOTION, enter: pickMotion(pack) },
    script: { ...DEFAULT_SCRIPT },
    avatar: {
      ...DEFAULT_AVATAR,
      enabled: avatarOn,
      // 封面、目录与结尾页默认不出现数字人，避免遮挡主张
      mode: avatarOn && pageType !== 'cover' && pageType !== 'toc' && pageType !== 'end' ? 'pip' : 'off',
    },
    footer: { source: '', pageNo: pageIndex + 1 },
    /**
     * 兜底正文标记。它的作用是让模型润色知道自己面对的是占位散文而不是用户的正文：
     * 模型给出要点之后，这段占位就该让位——两者都留着，一页装不下，
     * 溢出流水线会把每节拆成「原文一页 + 要点一页」，一份四节的 deck 变成十二页。
     */
    overrides: fallbackParagraph ? { fallbackParagraph: true } : {},
    status: 'pending',
    degradeReason,
    // 功能库的骨架只作用于新链路（页面就是一段 HTML），旧链路按 blocks 排，没有这个概念
    studioLayoutId: '',
  };
}
