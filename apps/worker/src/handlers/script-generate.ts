import {
  PageIR,
  type AudienceTag,
  type Block,
  type PageIR as Page,
  type SceneTag,
  type Segment,
} from '@lumen/ir-schema';
import { narrationBrief } from '@lumen/content-engine';
import { listPages, pageIR, requireProject, savePage } from '@lumen/server-core';
import { isMockPlaceholder } from '@lumen/provider-gateway';
import { asNumber, requireString, requireTaskPage } from '../util.js';
import type { TaskHandler } from './index.js';

/**
 * 逐页讲稿生成（PRD §5.9 路径 A）。
 *
 * 分两路：
 * - 模型：负责「话怎么说」——口语化、有过渡句。这是规则写不出来的部分。
 * - 规则：负责「话说到哪」——分段与锚点坐标。模型不知道版式，规则知道。
 * 所以先让规则算出一份完整讲稿当底座，再拿模型写的正文替换掉文字部分，锚点沿用。
 * 模型不可用、被 Mock 兜底、或返回得太短时，整份退回规则版，任务照样成功。
 */

/** 每字估算时长（毫秒），与 mock TTS 的中文权重一致 */
const MS_PER_CJK_CHAR = 220;

/** 补句号，保证每句读起来完整 */
function ensureSentence(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length === 0) return '';
  return /[。！？；.!?;]$/.test(trimmed) ? trimmed : `${trimmed}。`;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** 一句话及其来源块 */
interface Sentence {
  text: string;
  block?: Block;
  /**
   * 新链路：这句话对应页面上哪一段文字。浏览器按它在页面里找位置——
   * 服务端没有版式，量不出坐标。
   */
  anchorSnippet?: string;
}

/**
 * 从页面 HTML 里抠出「一段段能讲的文字」。
 *
 * **新链路页面的 `page.blocks` 是空的**——内容全在 `html` 里。所以讲稿原先只拿得到标题：
 * 实测那个 30 页的项目，每页都是**1 段**、锚点全是 `(0.50, 0.22)`，讲解光标从头到尾
 * 停在一个点上，压根不会动。
 *
 * 规则：块级闭合标签切行 → **去掉标签（换成空串，不是空格）** → 去实体 → 过滤 →
 * 丢掉「包含别的块」的外层容器。
 *
 * 标签换成空串这一步是有讲究的：换成空格的话 `来源可查 ：Palantir` 会比浏览器里
 * `textContent` 的 `来源可查：Palantir` 多一个空格，前端按文字找元素就找不着了。
 *
 * 不做真正的 HTML 解析：这段 HTML 是模型写的、结构可控，为它引一个解析器不划算。
 */
/** 页眉页脚所在的整块 HTML */
const CHROME_RE = /<(header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi;

/**
 * 页眉页脚里的装饰文字：页码、标签条、装饰英文。念出来只是噪音。
 *
 * **判据只对页眉页脚里的块用**——正文里带间隔号的标题（「角色分化 · 三条路线」）是内容。
 * 而且偏保守：认不出来的一律当内容留着，少念一句标签好过把正文删了。
 */
function isChrome(text: string): boolean {
  /**
   * 页码要**锚在开头**判。实测踩到过：正文里「六项能力对应第 20 页的四级能力标准……」
   * 这种句子中间带「第 N 页」，不锚定就整句被当成页码删了。
   */
  if (/^第\s*\d+\s*页/.test(text)) return true; // 第 2 页，共 30 页 / 第 12 页共 30 页
  if (/^\d+\s*\/\s*\d+$/.test(text)) return true; // 07 / 30
  if (/^共\s*\d+\s*页$/.test(text)) return true; // 共 30 页
  // 「FDE · 目录」「MIND MAP · 能力地图」——拿间隔号当分隔、又不含句读的，是标签条
  if (text.includes('·') && !/[，。！？；：、]/.test(text)) return true;
  // 纯英文小标：Contents / TEXT / Architecture
  if (!/[一-龥]/.test(text) && text.length < 20) return true;
  return false;
}

/** 把 HTML 切成一行行候选文字块，去标签与实体，但还没做任何取舍 */
function splitBlocks(html: string): string[] {
  return html
    .replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(
      /<\/(p|div|li|h[1-6]|section|article|figure|figcaption|td|th|blockquote|header|aside|main|nav|footer)\s*>/gi,
      '\n',
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .split('\n')
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length >= 4);
}

export function htmlTextBlocks(html: string): string[] {
  // 页眉页脚里的装饰要单独判一遍——但只丢装饰，成句的导语得留下（见 isChrome）
  const chrome = new Set(splitBlocks((html.match(CHROME_RE) ?? []).join('\n')));
  const lines = splitBlocks(html).filter((s) => !(chrome.has(s) && isChrome(s)));

  // 外层容器会把内层几块的文字串在一起，量出来的是半个页面的中心——丢掉「包含别的块」的那些
  return lines.filter((s) => !lines.some((o) => o !== s && o.length < s.length && s.includes(o)));
}

/**
 * 锚点里带的那一小段文字。
 *
 * **开头那几个编号要剥掉**：页面上 `01` 常在一个独立的 `<span>` 里，而服务端按块级标签
 * 切出来的那一块会把编号一起带上（`01来源可查：…`），前端拿它去 `textContent` 里找就
 * 找不着。剥掉之后两边才对得上。
 */
function snippetOf(text: string): string {
  return text.replace(/^[\s\d.、·•\-—]+/, '').slice(0, 14).trim();
}

/** 一块文字太长时按句切开，免得一段讲稿念太久、光标一直停在同一个地方 */
const MAX_SENTENCE_CHARS = 60;

function htmlSentences(html: string): Sentence[] {
  const out: Sentence[] = [];
  for (const block of htmlTextBlocks(html)) {
    const snippet = snippetOf(block);
    const pieces = block.length <= MAX_SENTENCE_CHARS
      ? [block]
      : block.split(/(?<=[。！？!?；;])/).map((s) => s.trim()).filter(Boolean);
    for (const piece of pieces) {
      out.push({
        text: ensureSentence(piece),
        ...(snippet ? { anchorSnippet: snippet } : {}),
      });
    }
  }
  return out;
}

/** 把一页的内容串成有序句子：标题 → 副标题 → 正文块 */
function sentencesOf(page: Page): Sentence[] {
  /**
   * 新链路页面走 HTML。**不再另外补一句「这一页讲的是…」**——标题本来就在 HTML 里，
   * 补了就是同一句话说两遍。
   */
  if (page.blocks.length === 0 && page.html.trim()) return htmlSentences(page.html);

  const out: Sentence[] = [];
  const main = page.title.main.trim();
  if (main) out.push({ text: `这一页讲的是「${main}」。` });
  const sub = page.title.sub.trim();
  if (sub) out.push({ text: ensureSentence(sub) });

  for (const block of page.blocks) {
    if (block.type === 'paragraph' && block.text.trim()) {
      out.push({ text: ensureSentence(block.text), block });
    } else if (block.type === 'bullets') {
      for (const item of block.items) {
        if (item.trim()) out.push({ text: ensureSentence(item), block });
      }
    } else if (block.type === 'metric') {
      const trend = block.trend.trim();
      out.push({ text: `${block.label}是${block.value}${trend ? `，${trend}` : ''}。`, block });
    }
  }
  return out;
}

/** 段内优先锚到指标块，其次锚到内容块 */
function pickAnchorBlock(group: Sentence[]): Block | undefined {
  const metric = group.find((s) => s.block?.type === 'metric');
  if (metric?.block) return metric.block;
  for (let i = group.length - 1; i >= 0; i -= 1) {
    const block = group[i]?.block;
    if (block) return block;
  }
  return undefined;
}

/** 锚点目标 id：指标块用 `block.id || metric-N`，其余块用 `block.id || block-N` */
function targetIdFor(page: Page, block: Block | undefined): string {
  if (!block) return 'title';
  if (block.type === 'metric') {
    const metrics = page.blocks.filter((b) => b.type === 'metric');
    return block.id || `metric-${metrics.indexOf(block)}`;
  }
  return block.id || `block-${page.blocks.indexOf(block)}`;
}

/** 该块在版式中的大致归一化坐标（0–1）。取近似值即可，用于讲解光标定位。 */
function anchorPositionFor(page: Page, block: Block | undefined): { x: number; y: number } {
  if (!block) return { x: 0.5, y: 0.22 };
  switch (block.type) {
    case 'metric': {
      const metrics = page.blocks.filter((b) => b.type === 'metric');
      const index = Math.max(0, metrics.indexOf(block));
      const count = Math.max(1, metrics.length);
      return { x: clamp01((index + 0.5) / count), y: 0.52 };
    }
    case 'bullets':
      return { x: 0.3, y: 0.62 };
    case 'paragraph':
      return { x: 0.3, y: 0.55 };
    case 'image':
      return { x: 0.72, y: 0.5 };
    case 'chart':
      return { x: 0.5, y: 0.55 };
    default:
      return { x: 0.5, y: 0.5 };
  }
}

/** 规则模板：句子 → 讲稿正文与分段 */
export function buildScript(page: Page, perCharMs = MS_PER_CJK_CHAR): { text: string; segments: Segment[] } {
  const sentences = sentencesOf(page);
  const text = sentences.map((s) => s.text).join('');
  const segments: Segment[] = [];

  let t = 0;
  for (let i = 0; i < sentences.length; i += 2) {
    // 每 1–2 句为一段
    const group = sentences.slice(i, i + 2);
    const segText = group.map((s) => s.text).join('');
    const anchorBlock = pickAnchorBlock(group);
    const position = anchorPositionFor(page, anchorBlock);
    /**
     * 新链路的锚点带的是**页面上那段文字**（`html:` 前缀），坐标由浏览器量——
     * 服务端没有版式。`x` / `y` 仍给一份粗略值当兜底：前端找不到那段文字时用它，
     * 总比让光标跳回原点强。约定见 `apps/web` 的 `resolveAnchor`。
     */
    const snippet = group.find((s) => s.anchorSnippet)?.anchorSnippet;
    segments.push({
      t,
      text: segText,
      anchor: snippet
        ? { targetId: `html:${snippet}`, x: position.x, y: position.y }
        : { targetId: targetIdFor(page, anchorBlock), x: position.x, y: position.y },
      cursor: true,
    });
    // 时间轴按字数推进，速率可注入以便测试
    t += Math.max(1, Math.round(segText.length * perCharMs));
  }

  return { text, segments };
}

/**
 * 把模型写好的讲稿切回原来的分段数，锚点沿用规则版。
 * 段落数由规则版决定（它知道页面上有几块内容），模型只管每段说什么。
 */
export function resegment(text: string, anchors: Segment[], perCharMs = MS_PER_CJK_CHAR): Segment[] {
  if (anchors.length === 0) return [];
  const sentences = text.split(/(?<=[。！？!?；;])/).map((s) => s.trim()).filter(Boolean);
  if (sentences.length === 0) return anchors;

  const per = Math.ceil(sentences.length / anchors.length);
  const groups: string[][] = anchors.map(() => []);
  sentences.forEach((s, i) => {
    groups[Math.min(anchors.length - 1, Math.floor(i / per))]!.push(s);
  });

  let t = 0;
  return anchors.map((a, i) => {
    const segText = groups[i]!.join('');
    const seg: Segment = {
      t,
      text: segText,
      cursor: a.cursor,
      ...(a.anchor ? { anchor: a.anchor } : {}),
    };
    t += Math.max(1, Math.round(segText.length * perCharMs));
    return seg;
  });
}

/**
 * 交给模型的页面内容：只给可讲的东西，不给版式细节。
 *
 * **新链路的页面 `blocks` 是空的，内容全在 `html` 里。** 原先这里只遍历 `blocks`，
 * 于是模型对 HTML 页只拿到一行标题，等于在盲写——这是讲稿写得空泛的根因，
 * 不是模型不行。所以新链路要走 `htmlTextBlocks` 把真正的正文抠出来。
 */
export function scriptPrompt(page: Page): string {
  const lines: string[] = [`页面标题：${page.title.main}`];
  if (page.title.sub.trim()) lines.push(`副标题：${page.title.sub.trim()}`);

  if (page.blocks.length === 0 && page.html.trim()) {
    for (const block of htmlTextBlocks(page.html)) lines.push(`正文：${block}`);
    return lines.join('\n');
  }

  for (const block of page.blocks) {
    if (block.type === 'paragraph' && block.text.trim()) lines.push(`正文：${block.text.trim()}`);
    else if (block.type === 'bullets') {
      for (const item of block.items) if (item.trim()) lines.push(`要点：${item.trim()}`);
    } else if (block.type === 'metric') {
      lines.push(`指标：${block.label} ${block.value}${block.trend.trim() ? `（${block.trend.trim()}）` : ''}`);
    }
  }
  return lines.join('\n');
}

/**
 * 上一页讲过什么，用来让这一页接得上。
 *
 * **优先用上一页已生成的讲稿，没有就退到它的内容摘录。** 讲稿是逐页并发生成的
 * （队列的 `groupConcurrency` 默认 3），上一页的讲稿常常已经落地，接得上真实语气；
 * 但不能当成硬依赖——取不到就退到内容，再取不到就当第一页处理，绝不能因此失败。
 */
function previousNarration(projectId: string, pageIndex: number): string {
  try {
    const prev = listPages(projectId).find((r) => r.pageIndex === pageIndex - 1);
    if (!prev) return '';
    const prevPage = pageIR(prev);
    return prevPage.script.text.trim() || scriptPrompt(prevPage);
  } catch {
    return '';
  }
}

/**
 * 把 O-P-E-N 落到具体段数。
 *
 * **OPEN 是组织方式，不是四段固定模板。** 一页讲稿通常 30~90 秒，四段硬写会撑爆。
 * `O`（这一页要解决什么）与 `N`（所以你能拿它做什么）是骨架，必须有；
 * `E`（类比/例子）在段落不够时并进 `P`。段数由规则版定，短页天然段少，自动压缩。
 */
function openGuideFor(segments: number): string {
  if (segments <= 1) return '并成一段：一句话说清这一页在讲什么、结论是什么、能用来做什么。';
  if (segments === 2) {
    return '第一段讲「这一页要解决什么 + 结论」，第二段用类比或例子说明，并落到「所以能拿它做什么」。';
  }
  if (segments === 3) {
    return '第一段讲「这一页要解决什么 + 结论」，第二段用类比或例子说明，第三段落到「所以能拿它做什么」。';
  }
  return '按 目标 → 要点 → 举例 → 下一步 的顺序展开，段落不够时可以合并，但「目标」与「下一步」不能省。';
}

/**
 * 从模型回的 JSON 里取出恰好 `expected` 段。
 *
 * 段数不符或解不出来都返回 `null`，交给上层重发或退回规则版。
 * **要求模型直接给分段、而不是写自由正文再靠 `resegment` 去猜**：分段数一旦对上，
 * 锚点就能原样沿用规则版那一套，演示端的光标定位不会错位。
 */
export function parseScriptDraft(raw: string, expected: number): string[] | null {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const segments = (parsed as { segments?: unknown }).segments;
  if (!Array.isArray(segments)) return null;
  const cleaned = segments
    .filter((s): s is string => typeof s === 'string')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  return cleaned.length === expected ? cleaned : null;
}

/** 讲稿的 system 提示词。受众与场合决定「怎么讲」，这一段是共性的写法约束 */
const SCRIPT_SYSTEM = [
  '你是演示文稿的口播稿撰稿人。把页面内容写成主讲人张口就能念的讲稿。',
  '要求：',
  '- 口语化，像人在台上讲话；不要书面语，不要罗列条目；',
  '- 第一句顺着上一页已经讲过的内容往下说，不要重复它；没有上一页就直接进入；',
  '- 每出现一个抽象概念或数字，配一个听众熟悉的类比（像……／好比……／相当于……）；',
  '- 不念「这一页」「如图所示」「我们看下面」这类词，也不念编号；',
  '- 只输出 JSON，不要解释、不要 Markdown 围栏。',
].join('\n');

export const scriptGenerate: TaskHandler = async (task, ctx) => {
  const pageId = requireString(task.payload.pageId ?? task.pageId, 'pageId');
  const row = requireTaskPage(pageId, task.tenantId);
  const page = pageIR(row);

  const perCharMs = asNumber(task.payload.perCharMs) ?? MS_PER_CJK_CHAR;
  const ruled = buildScript(page, perCharMs);
  // 段数由规则版定：模型必须按这个数回，锚点才能原样沿用
  const expected = ruled.segments.length;

  const project = requireProject(row.projectId, task.tenantId);
  const brief = narrationBrief(project.audienceTag as AudienceTag, project.scene as SceneTag);
  const prev = previousNarration(row.projectId, row.pageIndex);

  const userPrompt = [
    '【听众与场合】',
    brief,
    '',
    '【上一页刚讲过】',
    prev || '（这是第一页，没有上文）',
    '',
    '【这一页的内容】',
    scriptPrompt(page),
    '',
    '【怎么讲】',
    openGuideFor(expected),
    '这是组织方式，不是让你输出「目标」「要点」这类小标题。',
    '',
    '【输出】',
    `严格返回 ${expected} 段，JSON 形如：{"segments":["第1段","第2段"]}`,
  ].join('\n');

  let text = ruled.text;
  let segments: Segment[] = ruled.segments;
  let degradeReason = '';

  try {
    /**
     * 段数不符就带抱怨重发一次。
     *
     * 「理解错了」与「手滑少写一段」是两回事，一次重发能把后者捞回来；
     * 两次都不对就说明它确实做不到，退回规则版——不能无限重发。
     */
    let draft: string[] | null = null;
    let complaint = '';
    for (let attempt = 0; attempt < 2 && draft === null; attempt += 1) {
      const result = await ctx.gateway.text({
        taskType: 'script',
        system: SCRIPT_SYSTEM,
        messages: [{
          role: 'user',
          content: complaint === '' ? userPrompt : `${userPrompt}\n\n【上一次的问题】${complaint}`,
        }],
        json: true,
        /**
         * **实测踩到的**：给 2000 时，`deepseek-v4.1-flash` 每次要产出 3200~3400 字的
         * reasoning，预算被推理耗尽、正文为空，网关直接抛错兜底到 Mock——
         * 于是整页讲稿退回规则版，变成页面文字的罗列。
         * 页面上文字越多、要回的段数越多，越容易踩到，所以目录页最先暴露。
         */
        maxTokens: 8000,
        temperature: 0.6,
      });

      const raw = result.text.trim();
      if (isMockPlaceholder(raw)) {
        /**
         * 落到 Mock 有两种：压根没配真实模型，和配了但调用失败。
         * **后者的原因必须带出来**——原先一律报「未接入真实模型」，把真正的错因吞了，
         * 只能去翻 usage 表才知道是 max_tokens 被推理耗尽。
         */
        degradeReason = result.degradeReason === ''
          ? '讲稿环节未接入真实模型，已使用规则版讲稿'
          : `讲稿模型不可用，已使用规则版讲稿：${result.degradeReason.slice(0, 160)}`;
        break;
      }
      draft = parseScriptDraft(raw, expected);
      if (draft === null) {
        complaint = `上一次返回的不是 ${expected} 段（或不是合法 JSON）。请严格返回 ${expected} 段。`;
      }
    }

    if (draft !== null) {
      // 正文与分段由同一份数组生成，天然 1:1——不用再靠 `resegment` 去猜怎么切
      text = draft.join('');
      segments = ruled.segments.map((seg, i) => ({ ...seg, text: draft[i]! }));
    } else if (degradeReason === '') {
      degradeReason = `模型两次都没按 ${expected} 段返回，已使用规则版讲稿`;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    degradeReason = `讲稿模型不可用，已使用规则版讲稿：${message.slice(0, 120)}`;
  }

  const next = PageIR.parse({
    ...page,
    script: { cursorEnabled: true, text, segments, edited: false },
  });
  savePage(row.projectId, row.tenantId, next, row.pageIndex);
  return degradeReason ? { degradeReason } : {};
};
