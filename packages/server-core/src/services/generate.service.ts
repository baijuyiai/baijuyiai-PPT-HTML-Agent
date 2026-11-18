import { createHash } from 'node:crypto';
import { get, insertRow, run, updateRow, parseJson } from '../db/client.js';
import { newId } from '../lib/crypto.js';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { buildPageIR, buildOutline, detectIntent, segmentContent } from '@lumen/content-engine';
import { fitPage, lintPage } from '@lumen/render-engine';
import { BUILTIN_STYLE_PACKS, layoutSpecFor, recommendForAudience, styleRef } from '@lumen/style-engine';
import {
  PageIR, iconForText, type IntentResult, type OutlinePage, type PageIR as Page, type Script, type StylePack,
} from '@lumen/ir-schema';
import {
  deleteSplitContinuations, listPages, pageIR, pageVersionId, refreshProjectCounts,
  requireProject, savePageGroup,
} from './project.service.js';
import { ensureBuiltinStyles, listStyles, resolveStyle, toPack } from './style.service.js';
import { apiQueue } from './task.service.js';
import { buildGateway } from './provider.service.js';
import { recordUsage } from './usage.service.js';
import type { UsageSink } from '@lumen/provider-gateway';

/** 网关用量回调的入参类型，与 provider-gateway 的 UsageSink 保持同源 */
type GatewayUsage = Parameters<UsageSink['record']>[0];

/** SSE 事件协议（PRD §5.4 逐页流式生成） */
export type GenerateEvent =
  | { event: 'outline'; data: { outline: OutlinePage[]; intent: IntentResult } }
  | { event: 'style'; data: { styleId: string; styleName: string } }
  | { event: 'page-start'; data: { pageId: string; index: number } }
  /**
   * 某一页走到哪一步了，一句中文，直接给界面显示。
   *
   * 并发生成时**这一条是「看得见」的几乎全部来源**：落库要按大纲顺序来，
   * 卡住的那一页会把后面已完成的页全压住，而进度事件不走那条路——谁在跑就报谁，
   * 用户于是能看见「第 3 页正在调用模型（已等 40 秒）」，而不是一格不动的转圈。
   *
   * 同一页的同一句只发一次（服务端去重过），前端按 `index` 记下它、自己算已等秒数。
   *
   * `startedAt` 是**这一页**开始生成的那一刻，不随文案变化。界面上那块逐块点亮的画
   * 靠它算画到第几块——拿「这一句是什么时候说的」当起点的话，每换一句文案，画面就
   * 从头重画一遍。
   */
  | { event: 'page-progress'; data: { index: number; label: string; startedAt: number } }
  | { event: 'page-ready'; data: { pageId: string; index: number; page: Page } }
  /**
   * `page` 是**可选**的：走降级的那条路（页落了库、只是没通过校验）会把它一起发，
   * 界面据此把失败原因摆出来。另一种失败是连页都没造出来（生成时直接抛了），
   * 那种没有 page 可发。
   */
  | { event: 'page-failed'; data: { pageId: string; index: number; error: string; degradeReason: string; page?: Page } }
  /**
   * `skipped` = 这一轮里跳过没重做的页（已经有内容、且还挂在原位上）。
   * 「续跑半本书」时它是主角：界面上要能分清「这轮真的生成了几页」与
   * 「本来就有几页」——不加这个数，续跑完成时报「成功 8 页」会让人
   * 以为又花了 8 页的钱。
   */
  | { event: 'done'; data: { total: number; succeeded: number; failed: number; skipped?: number } }
  | { event: 'error'; data: { code: string; message: string } };

export interface GenerateOptions {
  projectId: string;
  tenantId: string;
  userId: string;
  /** 清空已有页面后全量重生成 */
  regenerate?: boolean;
}

/** 让出事件循环，保证 SSE 事件能被及时刷出 */
const flush = () => new Promise<void>((r) => setImmediate(r));

/* ---------------- 风格与大纲 ---------------- */

/** 未锁定风格时按人群推荐并锁定（PRD §4.3 核心流程） */
export function ensureStyle(projectId: string, tenantId: string): StylePack {
  ensureBuiltinStyles();
  const project = requireProject(projectId, tenantId);
  if (project.styleId) return resolveStyle(project.styleId);

  /**
   * 推荐只在「库里看得见的风格」里挑，不写死那五个内置 id。
   *
   * 两个原因：一是用户删掉的内置风格不该再被自动派给新项目；
   * 二是用户自己识别或改出来的风格本来就应该有资格被推荐——
   * 写死 id 的话，他精心调出来的那一套永远轮不到。
   */
  const visible = listStyles({ limit: 300 }).items.filter((r) => r.hidden === 0).map(toPack);
  const pool = visible.length > 0 ? visible : [...BUILTIN_STYLE_PACKS];
  const picked = recommendForAudience(project.audienceTag as never, pool)[0]!;
  updateRow('projects', 'projectId', projectId, { styleId: styleRef(picked), updatedAt: Date.now() });
  return picked;
}

interface DeckMeta {
  outline?: OutlinePage[];
  intent?: IntentResult;
  goal?: string;
}

export function readDeckMeta(projectId: string): DeckMeta {
  const row = get<{ meta: string }>('SELECT meta FROM decks WHERE projectId = ?', projectId);
  return parseJson<DeckMeta>(row?.meta, {});
}

function writeDeck(projectId: string, tenantId: string, title: string, styleId: string, meta: DeckMeta): void {
  const existing = get<{ deckId: string }>('SELECT deckId FROM decks WHERE projectId = ?', projectId);
  if (existing) {
    updateRow('decks', 'deckId', existing.deckId, {
      title, styleId, meta: JSON.stringify(meta), updatedAt: Date.now(),
    });
    return;
  }
  insertRow('decks', {
    deckId: newId('dck'),
    projectId,
    tenantId,
    title,
    styleId,
    audienceTag: 'general',
    canvas: JSON.stringify({ w: 1920, h: 1080 }),
    meta: JSON.stringify(meta),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
}

/** 生成（或读取既有）大纲 */
export function planOutline(
  projectId: string,
  tenantId: string,
  targetPages?: number,
): { outline: OutlinePage[]; intent: IntentResult } {
  const project = requireProject(projectId, tenantId);
  const cached = readDeckMeta(projectId);
  if (cached.outline && cached.outline.length > 0 && targetPages === undefined) {
    return { outline: cached.outline, intent: cached.intent ?? detectIntent(project.brief) };
  }
  /**
   * 没显式传就**沿用项目上存着的**。
   *
   * 漏了这一步的代价实测过：新建时填了 15 页，一进项目页数就变回 9——进项目拉的是
   * `GET /projects/:id`，它调这里时一个参数都不传，于是 `buildOutline` 按内容长度
   * 自己算了一份约 9 页的大纲**并落了库**。用户设过的页数被一个他看不见的默认值盖掉，
   * 而工作台左栏那个框读的是 `project.targetPages`，还显示着 15，两处对不上。
   *
   * `plan/outline/stream` 那条路早就读 `project.targetPages` 了，只有这里漏了——
   * 同一个「取页数」的规则写了两份，漂的又是没被测试盯着的那一份。
   */
  const wanted = targetPages ?? project.targetPages ?? undefined;

  /**
   * 设了页数、又还没有提纲：**规则层不建**，留给模型。
   *
   * 规则层是按内容长度排的，段数不够时明确「不硬凑」（见 `content-engine/outline.ts`）——
   * 一份八个要点的需求设 15 页，它只会给 9 页。而这一份又会**落库**，于是用户填了 15、
   * 进去看到 9，读起来就是系统没听他的。
   *
   * 按页数扩展或收缩要的是「对需求思考」，那是模型的事：`plan/outline/stream` 把页数
   * 当硬要求，页数不对会带着抱怨重发，直到正好 N 页。所以这里如实回空，
   * 工作台进去看到空大纲就知道该跑那条流（见 `Workbench.tsx` 的 `autoPlannedRef`）。
   *
   * **只在还没有提纲时让路**：已经有提纲又要显式重排的，是调用方自己带着页数来的，
   * 那条路照旧走规则层。
   */
  if (wanted !== undefined && (cached.outline?.length ?? 0) === 0) {
    return { outline: [], intent: cached.intent ?? detectIntent(project.brief) };
  }

  const built = buildOutline({
    title: project.title,
    brief: project.brief,
    audienceTag: project.audienceTag as never,
    ...(wanted !== undefined ? { targetPages: wanted } : {}),
  });
  writeDeck(projectId, tenantId, project.title, project.styleId ?? '', {
    outline: built.outline,
    intent: built.intent,
    goal: project.brief.slice(0, 200),
  });
  return built;
}

export function saveOutline(projectId: string, tenantId: string, outline: OutlinePage[]): void {
  const project = requireProject(projectId, tenantId);
  const meta = readDeckMeta(projectId);
  writeDeck(projectId, tenantId, project.title, project.styleId ?? '', { ...meta, outline });

  /**
   * **大纲决定这一本有多少页**，超出去的页行是孤儿，一起删掉。
   *
   * 原先这里只写 `decks.meta`，`pages` 表一个字节都不动。于是把页数改小、重出提纲之后，
   * 库里还留着第 21~30 页那些行——而客户端的 `pageSlots` 会按 DB 里最大的 `pageIndex`
   * 把页数**补回去**，界面上就还是原来的页数。用户的原话：
   * 「当页数改少了之后…还是原来的页数」。
   *
   * 删掉**不可逆**：之后把页数改大，那几页要重新生成。这是有意的——
   * 「这一本只有 20 页」就该真的只有 20 页，留着十页谁也看不见的旧内容只是垃圾。
   */
  run('DELETE FROM pages WHERE projectId = ? AND pageIndex >= ?', projectId, outline.length);
  // 项目行上缓存着「共几页 / 就绪几页」，删完要重算，否则列表页那张卡片还是旧数字
  refreshProjectCounts(projectId);
}

/**
 * 只改大纲里某一页的页类型。**一个页行都不碰。**
 *
 * 与 `saveOutline` 的区别恰恰在这里：那一个是「大纲决定这一本有多少页」，
 * 写完会把 `pageIndex >= outline.length` 的页行当孤儿删掉。而工作台的
 * 「转成图文页」只是想给这一页换个类型，**不该顺手删掉别的页**。
 *
 * 实测踩过：转换时图省事调了 `saveOutline`，一个 13 页的项目（大纲 8 条）
 * 当场被删到 6 页——7 个页行连同内容一起没了，且 `saveOutline` 的删除是
 * 有意设计成不可逆的。转换只该动它自己那一页。
 */
export function setOutlinePageType(
  projectId: string,
  tenantId: string,
  outlineIndex: number,
  pageType: OutlinePage['pageType'],
): void {
  const project = requireProject(projectId, tenantId);
  const meta = readDeckMeta(projectId);
  const outline = meta.outline ?? [];
  const target = outline[outlineIndex];
  if (!target) throw new AppError('NOT_FOUND', `大纲里没有第 ${outlineIndex + 1} 页`);
  if (target.pageType === pageType) return;
  outline[outlineIndex] = { ...target, pageType };
  writeDeck(projectId, tenantId, project.title, project.styleId ?? '', { ...meta, outline });
}

/* ---------------- 页级生成 ---------------- */

/**
 * 把风格包的设计语言说明转成提示词行。
 *
 * 这一步是「使用说明不是装饰」的兑现方式：`guidance` 里的文字写给人看，
 * 但它同时是模型改写这一页时必须遵守的规则。改了说明，产出就会跟着变。
 *
 * 只取与当前页真正相关的几条——把十一条说明全塞进去会稀释重点，
 * 而且模型对「与你无关的规则」的遵守程度会拉低对相关规则的遵守。
 */
export function styleGuidanceLines(page: Page, pack: StylePack): string[] {
  const g = pack.base.language.guidance;
  const lines: string[] = [];

  const byPageType: Record<string, string> = {
    cover: g.cover, section: g.section, toc: g.toc, text: g.text,
    imageText: g.imageText, chart: g.chart, metrics: g.metrics, end: g.end,
  };
  const own = byPageType[page.pageType];
  if (own) lines.push(`风格要求（${pack.name}·${page.pageType}）：${own}`);

  if (page.blocks.some((b) => b.type === 'chart') && g.chartUse) lines.push(`图表规范：${g.chartUse}`);
  if (page.blocks.some((b) => b.type === 'image') && g.imageUse) lines.push(`图片规范：${g.imageUse}`);

  return lines;
}

/**
 * 整篇创作指令。
 *
 * 逐页说明管「这一页怎么写」，这一层管「这份稿子按什么规矩组织」：
 * 核心任务、版式与配色约束、明确不要什么。**每一页都带上它**——
 * 整篇的一致性靠的就是每一页都守同一套规矩，而不是各页各写各的。
 *
 * 自检清单（checklist）不在这里注入：那是给人验收用的，
 * 塞进生成提示词只会占预算，对产出没有帮助。
 */
export function directiveLines(pack: StylePack): string[] {
  const g = pack.base.language.guidance;
  const out: string[] = [];
  if (g.brief) out.push(`本次创作的核心任务：${g.brief}`);
  if (g.layoutRules) out.push(`版式约束：${g.layoutRules}`);
  if (g.colorRules) out.push(`配色约束：${g.colorRules}`);
  if (g.avoid.length > 0) out.push(`明确不要：${g.avoid.join('；')}`);
  return out;
}

/**
 * 把这一页版式的容量告诉模型。
 *
 * 不告诉它的后果实测过：模型按自己的节奏写要点，一条四十来字带括号口径，
 * 一页写三条就超出版式容量，于是溢出流水线降字号、做摘要、最后拆页，
 * 十三页的 deck 里冒出四组「（续）」页。把预算写进提示词，模型就能一次写对。
 */
/**
 * 把这一页的版式规格告诉模型。
 *
 * 识别出来的风格带一套从设计稿量出的网格与横带结构，那是「这一页怎么排」的真值。
 * 只给模型内容和风格说明、不给版式，它写出来的东西会和版式对不上——
 * 该短的段落写长、该并列的写成罗列，最后靠溢出流水线降字号补救。
 */
export function layoutSpecLines(page: Page, pack: StylePack): string[] {
  const spec = layoutSpecFor(page.pageType, pack);
  return spec ? [spec.text] : [];
}

export function capacityLines(page: Page, pack: StylePack): string[] {
  const variant = pack.base.layouts.find((l) => l.id === page.layoutVariant);
  if (!variant) return [];
  const bullets = Math.max(1, Math.min(variant.maxBullets, pack.base.rules.maxBullets));
  // 要点要跟标题、可能的正文段落分享这一页的正文预算，所以单条按总量的 60% 摊
  const perBullet = Math.max(8, Math.floor((variant.maxBodyChars * 0.6) / bullets));
  return [
    `本页版式容量（超出会被降字号或拆页，务必遵守）：`
      + `标题不超过 ${Math.min(variant.maxTitleChars, 20)} 字；`
      + `正文总量不超过 ${variant.maxBodyChars} 字；`
      + `要点不超过 ${bullets} 条，每条不超过 ${perBullet} 字。`,
  ];
}

/**
 * 若 page_content 路由指向真实模型，让模型润色标题与主张。
 * 失败或指向 Mock 时保留规则结果并记录降级原因——绝不因为模型问题导致整页生成失败。
 */
async function polishWithModel(
  page: Page,
  opts: { tenantId: string; userId: string; projectId: string; pack: StylePack },
): Promise<{ page: Page; degradeReason: string }> {
  let route;
  try {
    const row = get<{ primaryRef: string }>('SELECT primaryRef FROM task_routes WHERE taskType = ?', 'page_content');
    route = row ? parseJson<{ providerId: string; model: string }>(row.primaryRef, { providerId: '', model: '' }) : null;
  } catch {
    route = null;
  }
  if (!route?.providerId) return { page, degradeReason: '' };
  const provider = get<{ isMock: number }>('SELECT isMock FROM providers WHERE providerId = ?', route.providerId);
  if (!provider || provider.isMock === 1) return { page, degradeReason: '' };

  const gateway = buildGateway({
    onUsage: {
      record: (e: GatewayUsage) => recordUsage({
        tenantId: opts.tenantId,
        userId: opts.userId,
        projectId: opts.projectId,
        taskType: e.taskType,
        kind: e.kind,
        providerId: e.providerId,
        model: e.model,
        amount: e.amount,
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        cost: e.cost,
        currency: e.currency,
        latencyMs: e.latencyMs,
        ok: e.ok,
        degradeReason: e.degradeReason,
      }),
    },
  });

  try {
    const result = await gateway.text({
      taskType: 'page_content',
      json: true,
      mockShape: 'page',
      system: '你是资深演示文稿撰稿人。只输出 JSON，不要任何解释文字。语言为简体中文。',
      messages: [{
        role: 'user',
        content: [
          `页面主张：${page.title.sub || page.title.main}`,
          `当前标题：${page.title.main}`,
          `已有要点：${page.blocks.filter((b) => b.type === 'bullets').flatMap((b) => (b.type === 'bullets' ? b.items : [])).join('；')}`,
          ...directiveLines(opts.pack),
          ...styleGuidanceLines(page, opts.pack),
          ...layoutSpecLines(page, opts.pack),
          ...capacityLines(page, opts.pack),
          '请输出 JSON：{"main":"标题(不超过20字)","sub":"一句话主张","points":["要点1","要点2"]}',
        ].join('\n'),
      }],
      // 给足预算：推理模型（如 deepseek-v4.1-flash）会先用 reasoning_content 吃掉额度，
      // 预算不够时正文直接为空，页面标题就会莫名其妙地不更新
      maxTokens: 4000,
    });
    const parsed = JSON.parse(result.text) as { main?: string; sub?: string; points?: string[] };
    return { page: applyPolish(page, parsed), degradeReason: result.degraded ? result.degradeReason : '' };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn('页级模型润色失败，回退规则结果', { pageId: page.pageId, reason });
    return { page, degradeReason: `模型润色失败，已回退规则生成：${reason.slice(0, 120)}` };
  }
}

/**
 * 把模型返回的标题与要点并回页面 IR。
 *
 * 单独成一个纯函数，是因为这里有两条容易写错的规则：
 * 一是模型没给某项时保留原值（空字符串不该把标题清空）；
 * 二是**兜底散文要给要点让位**——兜底段落只是「这页还没内容」的占位，
 * 不是用户写的正文，模型给出要点后两者并存会撑爆一页，
 * 溢出流水线就把每节拆成「原文一页 + 要点一页」，四节的 deck 变成十二页。
 */
export function applyPolish(page: Page, parsed: { main?: string; sub?: string; points?: string[] }): Page {
  const points = Array.isArray(parsed.points)
    ? parsed.points.filter((p): p is string => typeof p === 'string' && p.trim().length > 0).slice(0, 5)
    : [];
  const replaced = points.length > 0;
  const dropFallback = replaced && page.overrides.fallbackParagraph === true;

  const blocks = replaced
    ? [
      ...page.blocks.filter((b) => b.type !== 'bullets' && !(dropFallback && b.type === 'paragraph')),
      { id: '', type: 'bullets' as const, items: points, icons: points.map((t) => iconForText(t) ?? '') },
    ]
    : page.blocks;

  return PageIR.parse({
    ...page,
    title: {
      ...page.title,
      main: typeof parsed.main === 'string' && parsed.main.trim() ? parsed.main.trim().slice(0, 40) : page.title.main,
      sub: typeof parsed.sub === 'string' && parsed.sub.trim() ? parsed.sub.trim().slice(0, 80) : page.title.sub,
    },
    overrides: dropFallback ? { ...page.overrides, fallbackParagraph: false } : page.overrides,
    blocks,
  });
}

/**
 * 从大纲里收集章节清单，供目录页使用。
 * 章节 = 除封面/目录/封底之外的所有页；页码取大纲序号 +1（目录是按结构索引，不是按落库位置）。
 */
export function sectionsOf(outline: { pageType: string; title: string }[]): { title: string; pageNo: number }[] {
  return outline
    .map((p, i) => ({ title: p.title, pageNo: i + 1, pageType: p.pageType }))
    .filter((p) => p.pageType !== 'cover' && p.pageType !== 'toc' && p.pageType !== 'end')
    .map((p) => ({ title: p.title, pageNo: p.pageNo }));
}

/** 生成单页：构建 IR → 溢出适配 → 设计 Lint → 落库 → 派发图片任务 */
export async function generateOnePage(input: {
  projectId: string;
  tenantId: string;
  userId: string;
  outline: OutlinePage;
  pack: StylePack;
  pageIndex: number;
  totalPages: number;
  sourceText?: string;
  avatarEnabled: boolean;
  audienceTag: string;
  pageId?: string;
  /**
   * 这组页面在项目里的落位序号。默认与 pageIndex 相同。
   * 两者分开是因为拆页会让后续页顺延：第 2 页拆成两页后，第 3 页应该落在序号 3 而不是 2。
   */
  saveIndex?: number;
  /**
   * 该页原有的讲稿。带 edited 标记时原样保留——
   * 重生成页面是为了改内容，不该顺手把逐字稿也冲掉。
   */
  existingScript?: Script;
  /** 整份大纲，供目录页取章节清单 */
  outlineAll?: { pageType: string; title: string }[];
}): Promise<{ pages: Page[]; issues: ReturnType<typeof lintPage> }> {
  const built = buildPageIR({
    pageId: input.pageId ?? newId('pg'),
    outline: input.outline,
    pack: input.pack,
    pageIndex: input.pageIndex,
    totalPages: input.totalPages,
    sourceText: input.sourceText ?? input.outline.notes,
    avatarEnabled: input.avatarEnabled,
    audienceTag: input.audienceTag as never,
    ...(input.outlineAll ? { sections: sectionsOf(input.outlineAll) } : {}),
  });

  /**
   * 结构页不交给模型润色。
   * 封面标题就是用户给的 deck 标题，目录页的标题与条目是结构本身——
   * 让模型改写会把「目录」改成一句主张，还会顺手塞进一个跟目录无关的要点块。
   */
  const structural = built.pageType === 'cover' || built.pageType === 'toc' || built.pageType === 'end';
  const polished = structural
    ? { page: built, degradeReason: '' }
    : await polishWithModel(built, {
      tenantId: input.tenantId,
      userId: input.userId,
      projectId: input.projectId,
      pack: input.pack,
    });
  const withDegrade = polished.degradeReason
    ? PageIR.parse({ ...polished.page, degradeReason: polished.degradeReason })
    : polished.page;

  const fitted = fitPage(withDegrade, input.pack);
  const issues = [...fitted.issues];
  const pages: Page[] = [];

  for (const p of fitted.pages) {
    const pageIssues = lintPage(p, input.pack, { lenientTypography: true });
    issues.push(...pageIssues);
    // 有阻断级问题时按同一套规则再适配一次，仍不行则标记失败
    const blocked = pageIssues.some((i) => i.severity === 'error');
    pages.push(PageIR.parse({ ...p, status: blocked ? 'failed' : 'ready' }));
  }

  // 人工改过的讲稿跟着首屏走。续页是新内容，讲稿照常由规则重算。
  const keptScript = input.existingScript?.edited ? input.existingScript : null;
  if (keptScript && pages[0]) pages[0] = PageIR.parse({ ...pages[0], script: keptScript });

  // 整组一次写入：拆页产出的续页必须排在主页之后并让后续页顺延
  const rows = savePageGroup(
    input.projectId,
    input.tenantId,
    pages,
    input.saveIndex ?? input.pageIndex,
    input.pageIndex,
  );
  for (const row of rows) {
    const saved = pageIR(row);
    dispatchImageTasks(saved, input);
    dispatchScriptTask(saved, input);
  }

  return { pages, issues };
}

/** 把 AI 图片块派发到队列（PRD §5.15 图片生成触发） */
function dispatchImageTasks(page: Page, input: { projectId: string; tenantId: string; pageId?: string }): void {
  for (const block of page.blocks) {
    if (block.type !== 'image' || block.source !== 'ai') continue;
    apiQueue().enqueue({
      tenantId: input.tenantId,
      projectId: input.projectId,
      pageId: page.pageId,
      kind: 'image_generate',
      // 幂等键含提示词，改提示词后才会重新生成
      idemKey: `img:${page.pageId}:${block.id || '0'}:${block.prompt.slice(0, 40)}`,
      payload: {
        pageId: page.pageId,
        blockId: block.id,
        prompt: block.prompt,
        size: block.genParams.size,
        ratio: block.ratio,
        quality: block.genParams.quality,
      },
      maxAttempts: 2,
    });
  }
}

/**
 * 派发逐页讲稿任务（PRD §5.9 路径 A）。
 * 幂等键含内容摘要：内容变了才重算，同一份内容不会重复排队。
 * 人工改过的讲稿不派发——那是用户的稿子，不是待生成的空位。
 *
 * 新链路（`generate-html.service.ts`）也调它——那条链原先没有这一步，
 * 于是新链生成出来的页面**一个讲稿任务都没排**。
 */
export function dispatchScriptTask(page: Page, input: { projectId: string; tenantId: string }): void {
  if (page.script.edited) return;
  apiQueue().enqueue({
    tenantId: input.tenantId,
    projectId: input.projectId,
    pageId: page.pageId,
    kind: 'script_generate',
    idemKey: `script:${page.pageId}:${contentDigest(page)}`,
    payload: { pageId: page.pageId },
    maxAttempts: 2,
  });
}

/** 页面可讲内容的摘要，用来判断讲稿是否需要重算 */
function contentDigest(page: Page): string {
  const material = JSON.stringify({
    title: page.title,
    blocks: page.blocks.map((b) => (b.type === 'image' ? { type: b.type } : b)),
  });
  return createHash('sha1').update(material).digest('hex').slice(0, 12);
}

/* ---------------- 流式生成 ---------------- */

/**
 * 把原始内容的段落对齐到大纲页。
 *
 * 关键点：大纲里的封面与结尾页不对应任何内容段落，直接按下标取会导致整体错位一页。
 * 因此只在「内容页」上按顺序分配段落。
 */
export function alignSources(
  brief: string,
  outline: OutlinePage[],
  kind: IntentResult['kind'],
): (string | undefined)[] {
  const texts: (string | undefined)[] = outline.map(() => undefined);
  // 仅想法输入没有可对齐的原文，页内容完全来自叙事模板
  if (kind !== 'has_content' && kind !== 'mixed') return texts;

  const segments = segmentContent(brief, 30);
  let si = 0;
  for (let i = 0; i < outline.length; i++) {
    const page = outline[i]!;
    // 封面、目录、封底不对应正文段落——目录若也吃一段原文，后面每页都会错位一格
    if (page.pageType === 'cover' || page.pageType === 'toc' || page.pageType === 'end') continue;
    /**
     * **大纲自己记着这一页吃哪段原文，就用它。**
     *
     * 用户改过页数之后（比如把 5 页并成 3 页），段落数与页数对不上，
     * 按位置重新切会切错——合并过的那一页只会拿到第一段，并进来的后半段整段丢掉。
     * 落到这里时 `si` 不动：带 notes 的页不占用「按位置兜底」那份游标。
     */
    const own = (page.notes ?? '').trim();
    if (own) {
      texts[i] = own;
      continue;
    }
    if (si < segments.length) texts[i] = segments[si++]!;
  }
  return texts;
}

/**
 * 逐页生成并以事件流返回。
 *
 * 关键决策：页级内容生成是本地规则计算（毫秒级），因此在 API 内联执行并即时推送，
 * 天然形成「逐页落地」的观感；图片、语音、视频等慢任务才入队交给 worker。
 * 这样即使 worker 未启动，内容生成链路也是完整可用的。
 */
export async function* runGeneration(opts: GenerateOptions): AsyncGenerator<GenerateEvent> {
  const project = requireProject(opts.projectId, opts.tenantId);
  const pack = ensureStyle(opts.projectId, opts.tenantId);
  yield { event: 'style', data: { styleId: styleRef(pack), styleName: pack.name } };

  const { outline, intent } = planOutline(opts.projectId, opts.tenantId);
  yield { event: 'outline', data: { outline, intent } };

  if (opts.regenerate) {
    // 全量重生成会换掉所有 pageId，旧页面的排队任务已经失去目标，一并清掉，
    // 否则它们会在 worker 里逐个报「页面不存在」并耗尽重试进入死信
    run("DELETE FROM tasks WHERE projectId = ? AND status IN ('queued', 'running')", opts.projectId);
    run('DELETE FROM pages WHERE projectId = ?', opts.projectId);
    refreshProjectCounts(opts.projectId);
  } else {
    const existing = listPages(opts.projectId);
    if (existing.length > 0 && existing.every((p) => p.status === 'ready')) {
      for (const [i, row] of existing.entries()) {
        yield {
          event: 'page-ready',
          data: { pageId: row.pageId, index: i, page: PageIR.parse(parseJson<unknown>(row.ir, {})) },
        };
        await flush();
      }
      yield { event: 'done', data: { total: existing.length, succeeded: existing.length, failed: 0 } };
      return;
    }
  }

  const sourceTexts = alignSources(project.brief, outline, intent.kind);
  let succeeded = 0;
  let failed = 0;
  // 拆页会让后续页顺延，因此落位序号要跟着实际写入的页数走，不能直接用大纲下标
  let saveIndex = 0;

  for (const [index, outlinePage] of outline.entries()) {
    yield { event: 'page-start', data: { pageId: `pending-${index}`, index } };
    await flush();

    try {
      const { pages } = await generateOnePage({
        projectId: opts.projectId,
        tenantId: opts.tenantId,
        userId: opts.userId,
        outline: outlinePage,
        pack,
        pageIndex: index,
        saveIndex,
        totalPages: outline.length,
        sourceText: sourceTexts[index],
        avatarEnabled: project.avatarEnabled === 1,
        audienceTag: project.audienceTag,
        outlineAll: outline,
      });
      saveIndex += pages.length;
      for (const page of pages) {
        if (page.status === 'ready') {
          succeeded += 1;
          yield { event: 'page-ready', data: { pageId: page.pageId, index, page } };
        } else {
          failed += 1;
          yield {
            event: 'page-failed',
            data: {
              pageId: page.pageId,
              index,
              error: '页面未通过设计校验',
              degradeReason: page.degradeReason,
              page,
            },
          };
        }
      }
    } catch (err) {
      failed += 1;
      const message = err instanceof Error ? err.message : String(err);
      logger.error('页生成失败', { projectId: opts.projectId, index, message });
      // 单页失败不影响其他页（PRD §5.6 验收）
      yield {
        event: 'page-failed',
        data: { pageId: `failed-${index}`, index, error: message, degradeReason: '' },
      };
    }
    await flush();
  }

  refreshProjectCounts(opts.projectId);
  yield { event: 'done', data: { total: outline.length, succeeded, failed } };
}

/** 单页重生成（右栏「重新生成本页」）。幂等键含内容版本，同版本不会重复入队。 */
export async function regeneratePage(pageId: string, tenantId: string, userId: string): Promise<Page> {
  const row = get<{ projectId: string; pageIndex: number; ir: string; tenantId: string }>(
    'SELECT projectId, pageIndex, ir, tenantId FROM pages WHERE pageId = ?', pageId,
  );
  if (!row || row.tenantId !== tenantId) throw new AppError('NOT_FOUND', '页面不存在');

  const project = requireProject(row.projectId, tenantId);
  const pack = ensureStyle(row.projectId, tenantId);
  const meta = readDeckMeta(row.projectId);
  const outlinePage = meta.outline?.[row.pageIndex];
  if (!outlinePage) throw new AppError('CONFLICT', '该页不在当前大纲中，无法重生成');

  // 上一次拆页留下的续页要先清掉，否则重新适配后不拆页时它们会变成孤儿页
  deleteSplitContinuations(pageId);

  const { pages } = await generateOnePage({
    projectId: row.projectId,
    tenantId,
    userId,
    outline: outlinePage,
    pack,
    pageIndex: row.pageIndex,
    saveIndex: row.pageIndex,
    totalPages: meta.outline?.length ?? 1,
    avatarEnabled: project.avatarEnabled === 1,
    audienceTag: project.audienceTag,
    pageId,
    // 重生成是为了换内容，人工改过的讲稿要原样留着
    existingScript: PageIR.parse(parseJson<unknown>(row.ir, {})).script,
    outlineAll: meta.outline ?? [],
  });
  refreshProjectCounts(row.projectId);
  return pages[0]!;
}

/** 供路由使用的幂等键，便于测试与排查 */
export function idemKeyOf(page: Page): string {
  return pageVersionId(page);
}

/**
 * 按大纲序号生成单页（工作台骨架屏上的「优先生成」，PRD §5.5）。
 *
 * 与 regeneratePage 的区别：那一页已经存在，这一页还没有。
 * 所以要先算出它该插在哪——数出排在它前面的页数即可。
 */
export async function generatePageAt(
  projectId: string,
  tenantId: string,
  userId: string,
  outlineIndex: number,
): Promise<Page> {
  const project = requireProject(projectId, tenantId);
  const pack = ensureStyle(projectId, tenantId);
  const meta = readDeckMeta(projectId);
  const outline = meta.outline ?? [];
  const outlinePage = outline[outlineIndex];
  if (!outlinePage) throw new AppError('CONFLICT', `大纲里没有第 ${outlineIndex + 1} 页`);

  const insertAt = outlineIndicesOf(listPages(projectId), outline)
    .filter((from) => from < outlineIndex).length;

  const { pages } = await generateOnePage({
    projectId,
    tenantId,
    userId,
    outline: outlinePage,
    pack,
    pageIndex: outlineIndex,
    saveIndex: insertAt,
    totalPages: outline.length,
    sourceText: alignSources(project.brief, outline, 'mixed')[outlineIndex],
    avatarEnabled: project.avatarEnabled === 1,
    audienceTag: project.audienceTag,
    outlineAll: outline,
  });
  refreshProjectCounts(projectId);
  return pages[0]!;
}

/**
 * 每页归属哪条大纲。
 *
 * 优先用落库时记下的 outlineIndex；老数据没有这个字段，就按标题与大纲对齐推断——
 * 拆页产出的续页标题是「原标题（续）」，识别得到就归到同一条大纲上。
 * 推断不出来时退回页在 deck 里的位置，至少不会把页插到更前面去。
 */
export function outlineIndicesOf(
  rows: { ir: string; outlineIndex?: number | null }[],
  outline: { title: string }[],
): number[] {
  const titles = outline.map((o) => o.title.trim());
  let cursor = 0;
  return rows.map((row, i) => {
    if (typeof row.outlineIndex === 'number') {
      cursor = row.outlineIndex;
      return row.outlineIndex;
    }
    // 只取标题：这里不需要整份 IR 合法，一页 IR 有问题不该让「优先生成」连带失败
    const ir = parseJson<{ title?: { main?: unknown } }>(row.ir, {});
    const pageTitle = typeof ir.title?.main === 'string' ? ir.title.main.trim() : '';
    const base = pageTitle.replace(/（续）$/, '').trim();
    // 续页归上一条大纲；否则从当前位置往后找标题对得上的那一条
    if (base !== pageTitle && titles[cursor] === base) return cursor;
    const found = titles.indexOf(base, cursor);
    if (found >= 0) {
      cursor = found;
      return found;
    }
    return Math.min(i, Math.max(0, titles.length - 1));
  });
}
