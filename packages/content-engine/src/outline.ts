import type { AudienceTag, IntentResult, OutlinePage, PageType } from '@lumen/ir-schema';
import { analyzeSignals, detectIntent, segmentContent, suggestedPageRange } from './intent.js';
import { extractMetrics } from './metrics.js';

/**
 * 大纲生成（PRD §5.3）。
 *
 * 结构由规则决定（页数、页类型序列、内容分配），措辞可由模型润色。
 * 无模型时也能产出完整可用的大纲——这是「无 Key 全链路可跑」的前提。
 */

export interface OutlineInput {
  title: string;
  brief: string;
  audienceTag: AudienceTag;
  /** 用户指定页数；不传则由内容量推导 */
  targetPages?: number;
}

/**
 * 按目标人群给出默认叙事结构。每项是（页类型, 主张模板）。
 *
 * **表里不要写 `end`**：封面、目录、封底由 `buildOutline` 统一补，模板描述的是**正文**。
 * `general` / `scholar` / `brand` 的末项原先都写成 `end`，于是骨架末尾出现两个封底
 * （实测：`…text, end, end`）。写 `text` 才是它们本来的意思——「下一步行动」是一页正文，
 * 不是封底。
 */
const NARRATIVES: Record<AudienceTag, { pageType: PageType; claim: string; title: string }[]> = {
  founder: [
    { pageType: 'section', claim: '我们要解决的问题', title: '问题' },
    { pageType: 'text', claim: '市场存在明确且正在扩大的缺口', title: '市场机会' },
    { pageType: 'imageText', claim: '我们的方案直接命中该缺口', title: '解决方案' },
    { pageType: 'metrics', claim: '关键指标已验证方向正确', title: '验证数据' },
    { pageType: 'chart', claim: '增长趋势清晰且可持续', title: '增长路径' },
    { pageType: 'text', claim: '我们比现有玩家更懂这件事', title: '竞争壁垒' },
    { pageType: 'people', claim: '这支团队做过同类的事', title: '团队' },
    { pageType: 'metrics', claim: '本轮融资将把验证变成规模', title: '融资需求' },
  ],
  executive: [
    { pageType: 'section', claim: '本次汇报的核心结论', title: '结论前置' },
    { pageType: 'metrics', claim: '整体经营指标达成预期', title: '经营概览' },
    { pageType: 'chart', claim: '核心业务保持稳健增长', title: '业务表现' },
    { pageType: 'text', claim: '当前面临三个关键挑战', title: '主要挑战' },
    { pageType: 'imageText', claim: '我们已有明确的应对路径', title: '应对举措' },
    { pageType: 'metrics', claim: '下阶段目标可量化可追踪', title: '下阶段目标' },
    { pageType: 'text', claim: '需要决策层支持的事项', title: '决策请求' },
  ],
  scholar: [
    { pageType: 'section', claim: '研究背景与问题提出', title: '研究背景' },
    { pageType: 'text', claim: '既有研究存在明确空白', title: '文献综述' },
    { pageType: 'text', claim: '本文采用的方法与数据', title: '研究方法' },
    { pageType: 'chart', claim: '实验结果支持研究假设', title: '实验结果' },
    { pageType: 'imageText', claim: '机制解释与理论贡献', title: '结果讨论' },
    { pageType: 'text', claim: '研究的局限与未来方向', title: '局限与展望' },
    { pageType: 'text', claim: '结论与致谢', title: '结论' },
  ],
  'tech-lead': [
    { pageType: 'section', claim: '本次评审的目标与范围', title: '背景与目标' },
    { pageType: 'text', claim: '现有架构的约束与痛点', title: '现状分析' },
    { pageType: 'imageText', claim: '目标架构的核心设计', title: '方案设计' },
    { pageType: 'chart', claim: '关键路径的性能与容量评估', title: '性能评估' },
    { pageType: 'text', claim: '数据一致性与容错策略', title: '可靠性设计' },
    { pageType: 'metrics', claim: '关键指标与验收口径', title: '验收指标' },
    { pageType: 'text', claim: '实施计划与风险', title: '落地计划' },
  ],
  brand: [
    { pageType: 'section', claim: '品牌要解决的问题', title: '命题' },
    { pageType: 'imageText', claim: '我们要传递的核心印象', title: '品牌主张' },
    { pageType: 'imageText', claim: '视觉语言的构成与规则', title: '视觉体系' },
    { pageType: 'imageText', claim: '在不同场景下的一致表达', title: '应用延展' },
    { pageType: 'text', claim: '排印与色彩的规范细则', title: '规范细则' },
    { pageType: 'text', claim: '下一步与分工', title: '下一步' },
  ],
  general: [
    { pageType: 'section', claim: '本次分享的主线', title: '概览' },
    { pageType: 'text', claim: '我们观察到的关键现象', title: '现状' },
    { pageType: 'imageText', claim: '现象背后的原因', title: '分析' },
    { pageType: 'metrics', claim: '数据印证了判断', title: '数据' },
    { pageType: 'text', claim: '由此得出的结论', title: '结论' },
    { pageType: 'text', claim: '下一步行动', title: '行动' },
  ],
};

/** 从已有内容推断每页的主张：取该段首句，去掉编号前缀 */
function claimFromSegment(segment: string, fallback: string): string {
  const first = segment.split(/[。！？\n]/)[0]?.trim() ?? '';
  const cleaned = first.replace(/^\s*(?:\d+[.、)]\s*|#{1,6}\s+|[-*+]\s+|[一二三四五六七八九十]+[、.]\s*)/, '').trim();
  if (cleaned.length < 4) return fallback;
  return cleaned.length > 40 ? `${cleaned.slice(0, 38)}...` : cleaned;
}

function titleFromClaim(claim: string, fallback: string): string {
  const cleaned = claim.replace(/[。！？，,；;：:]/g, ' ').trim();
  const words = cleaned.split(/\s+/).filter((w) => w.length > 0);
  const title = words.slice(0, 2).join('');
  return title.length >= 2 ? title.slice(0, 16) : fallback;
}

/**
 * 造一页大纲。
 *
 * 「视觉形式 / 设计说明 / 人工痕迹」这三个字段规则层不产生——它们是教案阶段
 * 由模型填的、以及用户手改时打的标记。这里显式补成空值，让规则层的产物是**完整的**
 * 一页（读取侧因此可以少一层 `?? ''`），也把「这三个字段从哪来」写在一处。
 */
function outlinePage(p: Omit<OutlinePage, 'visualForm' | 'designNote' | 'edited'>): OutlinePage {
  return { ...p, visualForm: '', designNote: '', edited: false };
}

/** 讲「人」的字眼 */
const PEOPLE_RE = /团队|成员|创始人|合伙人|嘉宾|讲者|阵容|班底|顾问|董事|高管|主持人|演讲人|人物介绍|核心班底/;

/**
 * 「团队怎么样」而不是「团队是谁」的字眼。
 *
 * 这些出现时 `PEOPLE_RE` 命中的那个词是**定语**，这一页讲的是能力/效率，不是人：
 * 「团队执行力强，交付周期从 30 天降到 12 天」判成人物页，模型就得给一个没有人的
 * 人物页排版——只能编人，或者留一堆空头像框。宁可漏判，也不能误判。
 *
 * 这是一份**已知的坑清单**，不是穷举：写在这里是为了让下一个人知道
 * 「为什么命中关键词还不够」，而不是假装这个判据很准。
 */
const CAPABILITY_RE = /执行力|能力|协作|效率|文化|氛围|凝聚力|战斗力|士气|配合|机制/;

/**
 * 这一段是不是在讲**人**。是的话这一页判成「人物页」——它有一整套版式库
 * （头像行、单人主视觉、斜切飘带……），比当普通文字页排出来贴题得多。
 *
 * 两条判据，满足一条即可：
 * 1. 关键词落在**首句**且首句不是在讲能力（那是这一页的主张，等于把「这一页在讲人」
 *    写在标题上）；
 * 2. 这一段是**名册式的**（有项目符号，一行一个人）。
 */
function isPeopleSegment(segment: string): boolean {
  if (!PEOPLE_RE.test(segment)) return false;
  const firstSentence = segment.split(/[。！？\n]/)[0] ?? '';
  if (PEOPLE_RE.test(firstSentence) && !CAPABILITY_RE.test(firstSentence)) return true;
  return extractExplicitBullets(segment).length >= 2;
}

/**
 * 用户要的总页数换算成「内容页能有几页」。
 *
 * 总数 = 内容页 + 封面 + 结尾，内容页够多时还会插一页目录。**目录那一页也要算进去**，
 * 否则设 12 页会得到 13 页——用户数的是整本，不是正文。
 */
function contentSlotsFor(target: number): number {
  const slots = Math.max(1, target - 2);
  return slots >= MIN_CHAPTERS_FOR_TOC ? slots - 1 : slots;
}

/**
 * 把段落并成至多 `maxCount` 组。
 *
 * 尽量均分：余数分给靠前的组，最后一组不会只剩一句。**并起来不是砍掉**——
 * 组内的原文按顺序拼在一起，下游照旧拿得到全部事实与数字。
 */
function mergeSegments(segments: string[], maxCount: number): string[] {
  if (maxCount <= 0 || segments.length <= maxCount) return segments;
  const base = Math.floor(segments.length / maxCount);
  const extra = segments.length % maxCount;
  const out: string[] = [];
  let cursor = 0;
  for (let i = 0; i < maxCount; i += 1) {
    const take = base + (i < extra ? 1 : 0);
    out.push(segments.slice(cursor, cursor + take).join('\n'));
    cursor += take;
  }
  return out;
}

/**
 * 由输入构建大纲。纯规则，不依赖模型。
 */
export function buildOutline(input: OutlineInput): { outline: OutlinePage[]; intent: IntentResult } {
  const intent = detectIntent(input.brief);
  const signals = analyzeSignals(input.brief);
  const range = suggestedPageRange(intent.kind, signals);
  const target = Math.max(3, Math.min(input.targetPages ?? Math.round((range.min + range.max) / 2), 30));

  const pages: OutlinePage[] = [];
  let index = 0;

  // 封面
  pages.push(outlinePage({
    index: index++,
    pageType: 'cover',
    claim: input.title,
    title: input.title,
    points: [],
    section: '',
    notes: '',
  }));

  if (intent.kind === 'has_content' || intent.kind === 'mixed') {
    /**
     * **用户设了页数就按用户的来**：段落多于页位时把相邻段落并起来。
     *
     * 「不丢内容」靠的是合并，不是无视页数。原先这里完全不看 `targetPages`，
     * 于是页数输入框是个摆设——设 3 页、设 30 页，出来都一样多（实测踩到）。
     *
     * 段数**少于**页位时不硬凑：规则层造不出没有的内容，多出来的页只能由模型补，
     * 这里如实给出内容撑得起的那几页。
     */
    const segments = segmentContent(input.brief, 30);
    const slots = input.targetPages === undefined ? segments.length : contentSlotsFor(target);
    const groups = mergeSegments(segments, slots);
    for (const seg of groups) {
      const claim = claimFromSegment(seg, '本节要点');
      const metrics = extractMetrics(seg, 3);
      const hasNumbers = metrics.length > 0;
      /**
       * 人物页优先于指标页。
       *
       * 「团队 12 人，平均从业 8 年」这种段落两边都沾：它有数字，但它讲的是**人**，
       * 用头像行排出来才对（人像 + 数字注解），当指标页排就把人丢了。反过来，
       * 真正的指标页里不会出现「团队/成员/嘉宾」这类词，所以这个顺序不会误伤它。
       */
      const pageType: PageType = isPeopleSegment(seg)
        ? 'people'
        : hasNumbers && metrics.length >= 2 ? 'metrics' : 'text';
      pages.push(outlinePage({
        index: index++,
        pageType,
        claim,
        title: titleFromClaim(claim, `第 ${index} 节`),
        // 只取显式项目符号；散文段落交给正文渲染，避免同一内容既出要点又出段落
        points: extractExplicitBullets(seg),
        section: '',
        // **整段存，不截断**：合并过的页要能靠它把并起来的原文完整交回下游
        // （`alignSources` 优先读这里）。截断就等于把并起来的后半段丢了
        notes: seg,
      }));
    }
  } else {
    // 仅想法 / 仅大纲：套用该人群的默认叙事结构
    const narrative = NARRATIVES[input.audienceTag] ?? NARRATIVES.general;
    const wanted = Math.max(3, target - 2);
    const picked = narrative.slice(0, wanted);
    // 大纲输入时，把用户给出的结构行直接作为页主张
    const provided = intent.kind === 'outline_only' ? segmentContent(input.brief, wanted) : [];
    picked.forEach((n, i) => {
      const userLine = provided[i];
      // 标题要从**主张**派生，不能拿整段原文去截——那样会得到
      // 「一、市场现状过去两年企业级」这种把标题和正文粘在一起的结果。
      const claim = userLine ? claimFromSegment(userLine, n.claim) : n.claim;
      /**
       * 页类型以模板为准，**但用户自己写的那一行讲了人就改成人物页**。
       *
       * 这一支（仅想法 / 仅大纲）没有正文可判，模板给的是一套通用的叙事骨架。
       * 用户在大纲里明确写了「团队介绍」，却因为模板那一格是 `text` 就排成普通
       * 文字页，那是把用户已经说清楚的事又丢了。判据与内容那一支是同一个
       * `isPeopleSegment`，所以「团队执行力」这种定语照样不会误判。
       */
      const pageType: PageType = userLine && isPeopleSegment(userLine) ? 'people' : n.pageType;
      pages.push(outlinePage({
        index: index++,
        pageType,
        claim,
        title: userLine ? titleFromClaim(claim, n.title) : n.title,
        points: userLine ? extractExplicitBullets(userLine) : [],
        section: '',
        notes: '',
      }));
    });
  }

  /**
   * 结尾页。
   *
   * **末尾已经是 `end` 就不再追加**——模板是数据，改一次就可能把 `end` 写回来，
   * 判据放在这里比指望模板自觉可靠（实测踩到过两个「谢谢」）。
   */
  if (pages[pages.length - 1]?.pageType !== 'end') {
    pages.push(outlinePage({
      index: index++,
      pageType: 'end',
      claim: '结束',
      title: '谢谢',
      points: [],
      section: '',
      notes: '',
    }));
  }

  return { outline: withToc(pages), intent };
}

/**
 * 在封面之后插入目录页。
 *
 * 目录列的是全篇的章节——即除封面/目录/封底之外的所有页。
 * 门槛定在四章：三章的 deck 一共才五页，目录要占掉五分之一，是负担不是帮助。
 *
 * 这里**不把章节标题写进 points**：OutlinePage.points 受「一页要点 ≤5 条」约束，
 * 一个八章的 deck 目录会被卡掉三条。目录条目在构建页 IR 时从大纲的章节推导
 * （见 buildPageIR 的 sections 入参），大纲这边只标记「此处有目录」。
 */
/** 至少这么多章才值得单独占一页目录 */
export const MIN_CHAPTERS_FOR_TOC = 4;

export function withToc(pages: OutlinePage[]): OutlinePage[] {
  const chapters = pages.filter((p) => p.pageType !== 'cover' && p.pageType !== 'end' && p.pageType !== 'toc');
  if (chapters.length < MIN_CHAPTERS_FOR_TOC) return pages;

  const toc: OutlinePage = outlinePage({
    index: 0,
    pageType: 'toc',
    claim: '本报告的结构',
    title: '目录',
    points: [],
    section: '',
    notes: '',
  });

  const ordered = pages.reduce<OutlinePage[]>((acc, p) => {
    acc.push(p);
    if (p.pageType === 'cover') acc.push(toc);
    return acc;
  }, []);

  return ordered.map((p, i) => ({ ...p, index: i }));
}

/** 顶层结构标记（编号标题、Markdown 标题、中文序号） */
const TOP_HEADING_RE = /^\s*(?:\d+[.、)]\s*|#{1,3}\s+|[一二三四五六七八九十]+[、.]\s*)/;
/** 项目符号或子编号 */
const BULLET_RE = /^\s*(?:[-*+]\s+|\d+\.\d+[.、)]?\s*)/;

/** 剥掉段落自身的标题行——它不是要点，只是这一节的名称 */
function stripOwnHeading(text: string): string[] {
  const lines = text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length > 1 && TOP_HEADING_RE.test(lines[0]!)) return lines.slice(1);
  return lines;
}

/**
 * 只抽显式项目符号。没有符号时返回空数组，让调用方按散文处理。
 * 用它而不是 extractPoints，可以避免把散文句子也变成要点、与正文段落重复渲染。
 */
export function extractExplicitBullets(text: string, limit = 5): string[] {
  const lines = stripOwnHeading(text);
  const items = lines
    .filter((l) => BULLET_RE.test(l))
    .map((l) => l.replace(BULLET_RE, '').trim())
    .filter((l) => l.length >= 1);
  return items.slice(0, limit);
}

/** 从段落里抽要点：优先项目符号行，其次按句拆，最多 5 条 */
export function extractPoints(text: string, limit = 5): string[] {
  const bulleted = extractExplicitBullets(text, limit);
  if (bulleted.length > 0) return bulleted;

  const body = stripOwnHeading(text).join('\n');
  const sentences = body.split(/[。！？；;]/).map((s) => s.trim()).filter((s) => s.length >= 6);
  if (sentences.length >= 2) return sentences.slice(0, limit).map((s) => (s.length > 48 ? `${s.slice(0, 46)}...` : s));

  return [];
}

/** 重排大纲：拖拽排序后重算 index */
export function reindexOutline(pages: OutlinePage[]): OutlinePage[] {
  return pages.map((p, i) => ({ ...p, index: i }));
}

/** 改页类型；封面与结尾不允许改 */
export function changePageType(pages: OutlinePage[], index: number, pageType: PageType): OutlinePage[] {
  return pages.map((p) => {
    if (p.index !== index) return p;
    if (p.pageType === 'cover' || p.pageType === 'end') return p;
    return { ...p, pageType };
  });
}

/** 增页：插到指定位置之后 */
export function insertPage(pages: OutlinePage[], afterIndex: number, page: Omit<OutlinePage, 'index'>): OutlinePage[] {
  const next = [...pages];
  const at = next.findIndex((p) => p.index === afterIndex);
  const insertAt = at < 0 ? next.length : at + 1;
  next.splice(insertAt, 0, { ...page, index: insertAt });
  return reindexOutline(next);
}

/** 删页：封面与结尾不可删 */
export function removePage(pages: OutlinePage[], index: number): OutlinePage[] {
  const target = pages.find((p) => p.index === index);
  if (!target || target.pageType === 'cover' || target.pageType === 'end') return pages;
  return reindexOutline(pages.filter((p) => p.index !== index));
}

/** 改标题 */
export function renamePage(pages: OutlinePage[], index: number, title: string): OutlinePage[] {
  return pages.map((p) => (p.index === index ? { ...p, title } : p));
}
