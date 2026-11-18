import { deflateSync } from 'node:zlib';
import { iconForText, type Block, type PageType, type Provider } from '@lumen/ir-schema';
import type {
  ImageRequest,
  ImageResult,
  MockShape,
  ProviderClient,
  SpeechRequest,
  SpeechResult,
  TextRequest,
  TextResult,
} from './types.js';

/**
 * 内置 Mock 客户端。
 *
 * 两条硬性要求：
 * 1. 文本完全确定性——同样输入必得同样输出（连 latencyMs 都由输入派生），
 *    便于测试断言与问题复现，也让离线演示可重复。
 * 2. 图片确定性——由 prompt 哈希派生的柔和几何色块 PNG，不依赖任何第三方图像库，
 *    画面里绝不出现文字或字母。
 */

/* ---------------- 文案素材（简体中文，像真实商务汇报） ---------------- */

const CLAIMS = [
  '以产品力驱动增长',
  '把复杂问题拆成可执行的动作',
  '用数据校准每一次决策',
  '以客户成功定义我们的成功',
  '让交付节奏变得可预期',
];

const HEADINGS = [
  '市场洞察与机会判断',
  '三条增长路径',
  '产品力是增长的底座',
  '经营指标回顾',
  '风险与应对',
];

const SECTIONS = ['市场洞察', '增长路径', '产品能力', '经营结果', '风险应对'];

const POINT_SETS: string[][] = [
  ['聚焦高价值场景，减少无效投入', '把交付节奏前置，缩短回款周期', '用月度复盘校准资源投放'],
  ['明确三个季度的里程碑', '每个里程碑配一名负责人', '复盘结论当月同步到全员'],
  ['把客户反馈前置到需求评审', '用统一口径衡量产品健康度', '把改进项写进季度目标'],
  ['收入结构保持均衡', '毛利水平稳中有升', '现金流覆盖两个季度支出'],
  ['识别三类主要风险', '为每类风险准备预案', '按季度更新风险台账'],
];

const SCRIPT_LINES = [
  '这一页先回答一个问题：增长究竟从哪里来。',
  '我们把答案拆成三条可以验证的路径，每条都配了明确的负责人。',
  '第一条路径聚焦高价值场景，把资源集中到回报最确定的地方。',
  '第二条路径把交付节奏前置，让回款周期和客户满意度同时改善。',
  '最后强调一点，所有路径都用同一套指标衡量，避免各说各话。',
];

const NARRATIONS = [
  '开场先点明全年主线，控制在二十秒以内。',
  '展开三条增长路径，每条约用三十秒。',
  '用一张图说明结构，再用一句话解释它对业务的意义。',
  '收尾落到下一步行动，给出明确的时间点。',
];

const MIDDLE_CYCLE: PageType[] = ['section', 'text', 'imageText', 'metrics', 'chart'];
// Mock 能构造的页类型。图解页加进来是为了「真实链路生成失败时退回 Mock」这条兜底路：
// 那时 pageType 已经是 architecture/mindMap，若这里不收，asPageType 会把它悄悄降级成 text，
// 退回的页面类型就错了。注意只加进「能构造」，不加进 MIDDLE_CYCLE——大纲该不该排图解页
// 是内容策略问题（见 outline.ts 的边界），不在本次改动范围内。
const PAGE_TYPES: PageType[] = ['cover', 'section', 'text', 'imageText', 'chart', 'ui', 'architecture', 'mindMap', 'metrics', 'end'];

/* ---------------- 小工具 ---------------- */

function clampInt(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function asText(v: unknown, fallback: string): string {
  return typeof v === 'string' && v.trim().length > 0 ? v : fallback;
}

function asPageType(v: unknown, fallback: PageType): PageType {
  return typeof v === 'string' && (PAGE_TYPES as string[]).includes(v) ? (v as PageType) : fallback;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 按字符估算 token：中文 1 字约 1 token，英文 4 字符约 1 token。
 * 这是粗估，只为让 Mock 的用量数字有量级意义，不代表任何真实分词器。
 */
export function estimateTokens(text: string): number {
  let cjk = 0;
  let other = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    const isCjk = (cp >= 0x3000 && cp <= 0x9fff) || (cp >= 0xf900 && cp <= 0xfaff);
    if (isCjk) cjk += 1;
    else other += 1;
  }
  return cjk + Math.ceil(other / 4);
}

/** 由输入派生的确定性"耗时"，保证 Mock 结果整体可复现。 */
function mockLatency(seed: number): number {
  return 40 + (Math.abs(seed) % 60);
}

/* ---------------- 文本构造 ---------------- */

interface PageFragment {
  pageId: string;
  pageType: PageType;
  layoutVariant: string;
  title: { eyebrow: string; main: string; accentWords: string[]; sub: string };
  blocks: Block[];
}

const LAYOUT_VARIANT: Record<PageType, string> = {
  cover: 'hero',
  toc: 'toc-list',
  section: 'divider',
  text: 'one-column',
  imageText: 'left-right',
  gallery: 'four-grid',
  // 界面页也没有对应的旧版式，同样取个语义名（见下面图解页那条注释）
  ui: 'device-shot',
  people: 'people-row',
  metrics: 'metric-row',
  chart: 'chart-right',
  // 图解页没有对应的旧版式，取个语义名即可——Mock 的 layoutVariant 只是拼给下游看的字符串，
  // 不校验它是否真存在于风格包（真实版式由 HTML 链路按提示词产出）。
  architecture: 'layered',
  mindMap: 'radial',
  end: 'closing',
};

function blocksFor(pageType: PageType): Block[] {
  switch (pageType) {
    case 'toc':
      return [
        {
          id: 'toc1',
          type: 'toc',
          items: [
            { title: '问题与背景', pageNo: 3 },
            { title: '方案设计', pageNo: 5 },
            { title: '验证数据', pageNo: 7 },
            { title: '落地计划', pageNo: 9 },
          ],
        },
      ];
    case 'cover':
      return [
        {
          id: 'b1',
          type: 'paragraph',
          text: '把复杂问题拆成可执行的动作，用数据校准每一次决策。',
        },
      ];
    case 'section':
      return [
        {
          id: 'b1',
          type: 'paragraph',
          text: '这一部分回答增长从哪里来，以及我们准备怎么把它做扎实。',
        },
      ];
    case 'text':
      return [
        {
          id: 'b1',
          type: 'paragraph',
          text: '我们把增长拆成三条可验证的路径，每条都配了明确的负责人与复盘节奏。',
        },
        {
          id: 'b2',
          type: 'bullets',
          items: MOCK_BULLETS_GROWTH,
          icons: MOCK_BULLETS_GROWTH.map((t) => iconForText(t) ?? ''),
        },
      ];
    case 'imageText':
      return [
        {
          id: 'b1',
          type: 'image',
          source: 'ai',
          src: '',
          prompt: '极简商务风格的几何构成，柔和的品牌色块，画面中不含任何文字',
          genParams: { provider: 'openai-compatible', model: 'gpt-image-2', size: '1536x1024', quality: 'high' },
          status: 'pending',
          ratio: '16:9',
          caption: '结构示意图',
          focus: 'center',
          placeholderReason: '',
        },
        {
          id: 'b2',
          type: 'paragraph',
          text: '用一张图说明结构，再配一句话解释它对业务意味着什么。',
        },
      ];
    case 'people':
      // 人物页：人像抠图 + 名字职位，图上不写文字（文字是块，不是画进图里的）
      return [
        {
          id: 'b1',
          type: 'image',
          source: 'ai',
          src: '',
          prompt: '极简商务风格的几何构成，柔和的品牌色块，画面中不含任何文字',
          genParams: { provider: 'openai-compatible', model: 'gpt-image-2', size: '1536x1024', quality: 'high' },
          status: 'pending',
          ratio: '16:9',
          caption: '人物',
          focus: 'center',
          placeholderReason: '',
        },
        {
          id: 'b2',
          type: 'paragraph',
          text: '一位人物的介绍，配上名字与职位。',
        },
      ];
    case 'gallery':
      // 图片排版页：多图成组、以图为主，文字只作标题与题注
      return [1, 2, 3, 4].map((n) => ({
        id: `img${n}`,
        type: 'image' as const,
        source: 'ai' as const,
        src: '',
        prompt: '抽象几何构成，不要出现任何文字，不要出现可识别的真人肖像',
        genParams: { provider: 'openai-compatible', model: 'gpt-image-2', size: '1024x1024', quality: 'high' },
        status: 'pending' as const,
        ratio: '1:1',
        caption: `图 ${n}`,
        focus: 'center',
        placeholderReason: '',
      }));
    case 'ui':
      /*
        界面页：一台 3D 设备的模型，屏幕里嵌一张界面截图。

        旧链路的块模型里**没有「设备」这个概念**，所以这里用一张图代表屏内界面。
        这个 Mock 只在没有 Key 的机器上把链路跑通用，不追求长得像——
        真页面走 HTML 链路，由模型按提示词写。
      */
      return [
        {
          id: 'shot1',
          type: 'image',
          source: 'ai',
          src: '',
          prompt: 'App 界面截图，扁平化，不要出现任何文字标题，不要出现可识别的真人肖像',
          genParams: { provider: 'openai-compatible', model: 'gpt-image-2', size: '1024x1024', quality: 'high' },
          status: 'pending',
          ratio: '9:19.5',
          caption: '界面截图',
          focus: 'center',
          placeholderReason: '',
        },
        { id: 'b2', type: 'paragraph', text: '一段说明：这套界面解决了什么问题。' },
      ];
    case 'metrics':
      return [
        {
          id: 'b1',
          type: 'metric',
          value: '38%',
          label: '营业收入同比增长',
          trend: '+12pt',
          source: '2026 年度经营月报',
          primary: true,
        },
        { id: 'b2', type: 'metric', value: '92%', label: '客户续约率', trend: '+4pt', source: '客户成功台账', primary: false },
        { id: 'b3', type: 'metric', value: '21 天', label: '平均交付周期', trend: '-6 天', source: '项目交付看板', primary: false },
      ];
    case 'chart':
      return [
        {
          id: 'b1',
          type: 'chart',
          kind: 'bar',
          data: {
            categories: ['一季度', '二季度', '三季度', '四季度'],
            series: [{ name: '营业收入（百万元）', values: [18, 24, 31, 38] }],
          },
          renderer: 'echarts',
          option: {},
        },
      ];
    case 'architecture':
    case 'mindMap':
      // 图解页的内容是节点与连线，旧渲染器的块模型里没有对应块型。
      // 这里只给一句占位说明，保证不返回空数组（provider-gateway.test 断言每页至少一块）。
      // 真正出图走的是 HTML 链路，不看这个函数。
      return [
        {
          id: 'b1',
          type: 'paragraph',
          text: '这一页是图解页，内容由该页类型的提示词直接产出。',
        },
      ];
    case 'end':
      return [
        {
          id: 'b1',
          type: 'bullets',
          items: MOCK_BULLETS_NEXT,
          icons: MOCK_BULLETS_NEXT.map((t) => iconForText(t) ?? ''),
        },
      ];
  }
}

const MOCK_BULLETS_GROWTH = ['聚焦高价值场景，减少无效投入', '把交付节奏前置，缩短回款周期', '用月度复盘校准资源投放'];
const MOCK_BULLETS_NEXT = ['锁定三条增长路径的季度目标', '下周完成资源与排期的对齐', '每月十号同步一次复盘结论'];

function buildOutline(ctx: Record<string, unknown>): { title: string; pages: unknown[] } {
  const pageCount = clampInt(ctx.pageCount, 8, 1, 24);
  const title = asText(ctx.title, '2026 年度业务汇报');
  const pages: unknown[] = [];
  for (let i = 0; i < pageCount; i++) {
    const isCover = i === 0;
    const isEnd = i === pageCount - 1 && pageCount > 1;
    const mid = i - 1;
    const pageType: PageType = isCover ? 'cover' : isEnd ? 'end' : MIDDLE_CYCLE[mid % MIDDLE_CYCLE.length]!;
    pages.push({
      index: i,
      pageType,
      claim: isCover ? CLAIMS[0] : isEnd ? '下一步行动' : CLAIMS[mid % CLAIMS.length]!,
      title: isCover ? title : isEnd ? '谢谢观看' : HEADINGS[mid % HEADINGS.length]!,
      points: isCover || isEnd ? [] : [...POINT_SETS[mid % POINT_SETS.length]!],
      section: isCover ? '' : SECTIONS[mid % SECTIONS.length]!,
      notes: isCover
        ? '开场用一句话点明全年主线，控制在二十秒以内。'
        : `第 ${i + 1} 页，围绕主张展开，语速保持平稳。`,
    });
  }
  return { title, pages };
}

function buildPage(ctx: Record<string, unknown>): PageFragment {
  const pageId = asText(ctx.pageId, 'page-0001');
  const pageType = asPageType(ctx.pageType, 'text');
  const main = asText(ctx.title, CLAIMS[0]!);
  return {
    pageId,
    pageType,
    layoutVariant: `${pageType}/${LAYOUT_VARIANT[pageType]}@v1`,
    title: {
      eyebrow: asText(ctx.eyebrow, '增长战略'),
      main,
      accentWords: [main.slice(0, 3)],
      sub: asText(ctx.sub, '2026 年度业务汇报'),
    },
    blocks: blocksFor(pageType),
  };
}

function buildScript(ctx: Record<string, unknown>): { text: string; segments: unknown[] } {
  const count = clampInt(ctx.segmentCount, 4, 3, 5);
  const segments: { t: number; text: string; cursor: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    segments.push({ t: i * 2000, text: SCRIPT_LINES[i % SCRIPT_LINES.length]!, cursor: true });
  }
  return { text: segments.map((s) => s.text).join(''), segments };
}

function buildHtml(ctx: Record<string, unknown>): string {
  const heading = escapeHtml(asText(ctx.title, CLAIMS[0]!));
  const lede = escapeHtml(asText(ctx.claim, '把复杂问题拆成可执行的动作，用数据校准每一次决策。'));
  return [
    '<section class="lumen-page">',
    '  <p class="lumen-eyebrow">增长战略</p>',
    `  <h1 class="lumen-title">${heading}</h1>`,
    `  <p class="lumen-lede">${lede}</p>`,
    '  <div class="lumen-metric">',
    '    <span class="lumen-metric-value">38%</span>',
    '    <span class="lumen-metric-label">营业收入同比增长</span>',
    '  </div>',
    '</section>',
    '<style>',
    '  .lumen-page { background: var(--surface-0); color: var(--ink-900); padding: var(--space-8); }',
    '  .lumen-eyebrow { color: var(--brand-500); letter-spacing: 0.08em; font-size: var(--text-sm); }',
    '  .lumen-title { color: var(--ink-900); font-size: var(--text-4xl); line-height: 1.15; }',
    '  .lumen-lede { color: var(--ink-600); max-width: 46ch; }',
    '  .lumen-metric-value { color: var(--brand-600); font-size: var(--text-5xl); }',
    '  .lumen-metric-label { color: var(--ink-500); }',
    '</style>',
  ].join('\n');
}

function buildRemotion(ctx: Record<string, unknown>): unknown {
  const firstPageId = asText(ctx.pageId, 'page-0001');
  const sceneCount = clampInt(ctx.sceneCount, 3, 1, 12);
  const scenes: unknown[] = [];
  for (let i = 0; i < sceneCount; i++) {
    scenes.push({
      pageId: i === 0 ? firstPageId : `page-${String(i + 1).padStart(4, '0')}`,
      durationInFrames: 150,
      narration: NARRATIONS[i % NARRATIONS.length]!,
    });
  }
  return { fps: 30, width: 1920, height: 1080, scenes };
}

/**
 * Mock 兜底文案的标记句。
 * 调用方据此判断「这条结果不是模型写的」——有些环节（比如讲稿）宁可退回规则实现，
 * 也不该把这段占位文字当成模型产出展示给用户。
 */
export const MOCK_PLACEHOLDER_MARKER = '本回复由内置 Mock 网关生成';

/** 这条文本是不是 Mock 的兜底占位 */
export function isMockPlaceholder(text: string): boolean {
  return text.includes(MOCK_PLACEHOLDER_MARKER);
}

function buildPlain(req: TextRequest): string {
  const shape: MockShape | 'unspecified' = req.mockShape ?? 'unspecified';
  return [
    `已收到${req.taskType}任务，共 ${req.messages.length} 条消息，期望形状为 ${shape}。`,
    `${MOCK_PLACEHOLDER_MARKER}，用于在尚未接入真实模型时保持整条链路可用。`,
    '接入真实 Provider 后，请把该任务的路由指向真实模型，Mock 只作为最后一道兜底。',
  ].join('');
}

function renderMockText(req: TextRequest): string {
  const ctx = req.mockContext ?? {};
  switch (req.mockShape) {
    case 'outline':
      return JSON.stringify(buildOutline(ctx));
    case 'page':
      return JSON.stringify(buildPage(ctx));
    case 'script':
      return JSON.stringify(buildScript(ctx));
    case 'html':
      return buildHtml(ctx);
    case 'remotion':
      return JSON.stringify(buildRemotion(ctx));
    /**
     * 看图类任务在 Mock 下**故意返回空结果**，而不是编一份像样的分析。
     *
     * 编出来的字体族、字号、配图提示词会一路流到界面上，用户看到的是
     * 「识别成功了，但内容是假的」——比明说「这一步没跑」糟糕得多。
     * 返回空数组/空对象，调用方会照常退回像素测量的结果，链路仍然完整可走。
     */
    case 'vision-split':
      return JSON.stringify({ slides: [] });
    case 'vision-page':
      return JSON.stringify({});
    default:
      return buildPlain(req);
  }
}

/* ---------------- 确定性 PNG 编码 ---------------- */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Mock 图片最长边上限，避免测试与演示时生成过大的位图 */
const MAX_EDGE = 256;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    const idx = (c ^ (buf[i] ?? 0)) & 0xff;
    c = ((CRC_TABLE[idx] ?? 0) ^ (c >>> 8)) >>> 0;
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** 写一个 PNG chunk：长度(4) + 类型(4) + 数据 + CRC(4) */
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((((h % 360) + 360) % 360) / 60);
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) {
    r = c;
    g = x;
  } else if (hp < 2) {
    r = x;
    g = c;
  } else if (hp < 3) {
    g = c;
    b = x;
  } else if (hp < 4) {
    g = x;
    b = c;
  } else if (hp < 5) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const m = l - c / 2;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * 把请求尺寸换算成 Mock 实际绘制的尺寸：最长边限制到 MAX_EDGE 再等比缩放。
 * 说明：这是 mock 的降采样，返回结果里不做任何尺寸声明，调用方按原请求尺寸处理。
 */
export function targetImageSize(size: string): { width: number; height: number } {
  const m = /^(\d+)\s*[xX*]\s*(\d+)$/.exec(size.trim());
  let w = m?.[1] ? Number(m[1]) : 1536;
  let h = m?.[2] ? Number(m[2]) : 1024;
  if (!Number.isFinite(w) || w <= 0) w = 1536;
  if (!Number.isFinite(h) || h <= 0) h = 1024;
  const longest = Math.max(w, h);
  if (longest > MAX_EDGE) {
    const scale = MAX_EDGE / longest;
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
  }
  return { width: w, height: h };
}

interface SoftShape {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  color: [number, number, number];
  alpha: number;
  rot: number;
}

/** 由 prompt 哈希派生的柔和几何色块，绝不绘制文字。 */
function buildPng(prompt: string, width: number, height: number): Buffer {
  const seed = hash32(prompt);
  const rand = mulberry32(seed);
  const baseHue = seed % 360;

  const bgTop = hslToRgb(baseHue, 0.26, 0.95);
  const bgBottom = hslToRgb(baseHue + 28, 0.32, 0.84);

  const shapeCount = 3 + Math.floor(rand() * 3);
  const shapes: SoftShape[] = [];
  for (let i = 0; i < shapeCount; i++) {
    shapes.push({
      cx: 0.15 + rand() * 0.7,
      cy: 0.15 + rand() * 0.7,
      rx: 0.16 + rand() * 0.28,
      ry: 0.16 + rand() * 0.28,
      color: hslToRgb(baseHue + 40 + i * 26, 0.3 + rand() * 0.22, 0.56 + rand() * 0.28),
      alpha: 0.3 + rand() * 0.32,
      rot: rand() * Math.PI,
    });
  }

  const channels = 3;
  const stride = width * channels;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // 过滤方法：None
    const ny = height > 1 ? y / (height - 1) : 0;
    for (let x = 0; x < width; x++) {
      const nx = width > 1 ? x / (width - 1) : 0;
      const g = Math.min(1, Math.max(0, (nx + ny) / 2));
      let r = bgTop[0] + (bgBottom[0] - bgTop[0]) * g;
      let gg = bgTop[1] + (bgBottom[1] - bgTop[1]) * g;
      let b = bgTop[2] + (bgBottom[2] - bgTop[2]) * g;
      for (const s of shapes) {
        const dx = nx - s.cx;
        const dy = ny - s.cy;
        const cos = Math.cos(-s.rot);
        const sin = Math.sin(-s.rot);
        const ex = (dx * cos - dy * sin) / s.rx;
        const ey = (dx * sin + dy * cos) / s.ry;
        const cov = 1 - smoothstep(0.72, 1, Math.hypot(ex, ey));
        if (cov <= 0) continue;
        const a = cov * s.alpha;
        r += (s.color[0] - r) * a;
        gg += (s.color[1] - gg) * a;
        b += (s.color[2] - b) * a;
      }
      const o = rowStart + 1 + x * channels;
      raw[o] = clampByte(r);
      raw[o + 1] = clampByte(gg);
      raw[o + 2] = clampByte(b);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 位深
  ihdr[9] = 2; // 颜色类型：真彩 RGB（透明底不走这条路，见 `cutoutImage`）
  ihdr[10] = 0; // 压缩方法
  ihdr[11] = 0; // 过滤方法
  ihdr[12] = 0; // 逐行扫描

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------------- 语音 ---------------- */

/** 静音 WAV 的采样率：24kHz、16-bit、单声道 */
const WAV_SAMPLE_RATE = 24000;
const WAV_BYTES_PER_SAMPLE = 2;

/**
 * 朗读时长估算：中文每字 220ms，其余每字符 60ms。
 * 与讲稿分段（`script-generate.ts`）的估算口径保持一致——
 * 两边不一致的话，演示端按比例定位光标会整体偏移。
 */
function estimateSpeechMs(text: string): number {
  let ms = 0;
  for (const ch of text) {
    if (/\s/.test(ch)) continue;
    // 方括号里依次是：CJK 统一表意文字（U+4E00-9FFF）、扩展 A（3400-4DBF）、兼容表意文字（F900-FAFF）
    ms += /[一-鿿㐀-䶿豈-﫿]/.test(ch) ? 220 : 60;
  }
  return Math.max(300, Math.round(ms));
}

/** 44 字节 RIFF 头 + 全零采样数据。不依赖 ffmpeg */
function buildSilentWav(durationMs: number): Buffer {
  const samples = Math.max(1, Math.round((WAV_SAMPLE_RATE * durationMs) / 1000));
  const dataSize = samples * WAV_BYTES_PER_SAMPLE;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataSize, 4); // 文件总长减 8
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // fmt 子块大小（PCM 固定 16）
  header.writeUInt16LE(1, 20); // 1 = PCM
  header.writeUInt16LE(1, 22); // 单声道
  header.writeUInt32LE(WAV_SAMPLE_RATE, 24);
  header.writeUInt32LE(WAV_SAMPLE_RATE * WAV_BYTES_PER_SAMPLE, 28); // byteRate
  header.writeUInt16LE(WAV_BYTES_PER_SAMPLE, 32); // blockAlign
  header.writeUInt16LE(16, 34); // 位深
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, Buffer.alloc(dataSize)]);
}

/* ---------------- 客户端 ---------------- */

export class MockClient implements ProviderClient {
  readonly providerId: string;
  readonly isMock = true;

  constructor(providerId: string) {
    this.providerId = providerId;
  }

  async text(req: TextRequest, model: string, _cfg: Provider): Promise<TextResult> {
    const text = renderMockText(req);
    const prompt = [req.system ?? '', ...req.messages.map((m) => m.content)].join('\n');
    const inputTokens = estimateTokens(prompt);
    const outputTokens = estimateTokens(text);
    return {
      text,
      providerId: this.providerId,
      model,
      usage: { inputTokens, outputTokens },
      degraded: false,
      degradeReason: '',
      latencyMs: mockLatency(inputTokens + outputTokens),
    };
  }

  async image(req: ImageRequest, model: string, _cfg: Provider): Promise<ImageResult> {
    const { width, height } = targetImageSize(req.size);
    const buffer = buildPng(req.prompt, width, height);
    const count = Math.max(1, Math.floor(req.n));
    const images = Array.from({ length: count }, () => ({ buffer, mime: 'image/png' }));
    return {
      images,
      providerId: this.providerId,
      model,
      degraded: false,
      degradeReason: '',
      latencyMs: mockLatency(buffer.length),
    };
  }

  /**
   * 静音 WAV，时长按字数估。
   *
   * 有意做成「有长度但没有声音」：演示端的自动翻页与光标跟随是靠音频时钟驱动的，
   * 离线、单测、CI 里跑 mock 时如果给 0 秒音频，那两条逻辑会立刻走完或者根本不走，
   * 看起来像功能没做。给它一段等长的静音，整条链路就按正常节奏跑。
   */
  async speech(req: SpeechRequest, model: string, _cfg: Provider): Promise<SpeechResult> {
    const buffer = buildSilentWav(estimateSpeechMs(req.text));
    return {
      audio: { buffer, mime: 'audio/wav' },
      transcript: req.text,
      providerId: this.providerId,
      model,
      usage: { inputTokens: estimateTokens(`${req.tone ?? ''}\n${req.text}`), outputTokens: 0 },
      degraded: false,
      degradeReason: '',
      latencyMs: mockLatency(buffer.length),
    };
  }
}
