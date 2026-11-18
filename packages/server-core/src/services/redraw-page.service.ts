import {
  fontStacksOf, lintStylePrompt, StyleDoc,
  type PageType, type ProgressPayload, type PromptIssue, type RedrawStep, type StylePagePrompt,
} from '@lumen/ir-schema';
import { lintMockHtml } from '@lumen/render-engine';
// 归一化裁切框直接用 style-engine 那个。**不要在 server-core 里另起一份**——
// `cropNormalized` 收的就是它，重定义会变成第三个同形异名的声明
import { cropNormalized, decodeImage, toDataUrl, type CropBox } from '@lumen/style-engine/server';
import type { ProviderGateway } from '@lumen/provider-gateway';
import { invalid } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { generateMock, splitSlides, writePagePrompt } from './page-prompt-kit.js';
import { resolveStyleDoc, saveStyleDoc } from './style-doc.service.js';

/**
 * 单页重识别：改一套风格里某一个页类型的提示词与样机。
 *
 * 与全量识别（`recognize-doc.service`）共用同一套模型原语，区别在流程：
 * 全量识别一次读整本稿子、定配色、补齐九个页类型；这里只处理用户指定的那一页，
 * 配色与字体沿用已有的那套——换的是版式与视觉语言，不是这套风格的调子。
 *
 * 分两步而不是一步：先分页让用户挑（`splitForPick`），再按挑中的框重识别
 * （`redrawPage`）。中间隔一次用户点击，所以第二步**传框而不是传下标**——
 * 模型调用不是确定性的，第二次分页可能切出不一样的框，用户挑的那一页就会
 * 与真正识别的那一页对不上，而且这种错配是静默的。
 */

export interface PickSlide {
  /** **过滤后**的位置，不是「模型眼里的第几页」：`splitSlides` 会把 `normalizeCropBox`
   *  拒掉的框丢掉，模型给三个框、中间那个不合法，第三个就变成 index 1。
   *  拿它当 React key 没问题，当页码就错了 */
  index: number;
  pageType: PageType;
  box: CropBox;
  /** 这一页是兜底（模型一个框都没给出，整张图当一页），不是模型真找出来的。
   *  客户端据此如实告知用户——两种情况的框逐位相同，不标出来就分不清 */
  fallback?: true;
}

/**
 * 分页，给用户挑一页。
 *
 * 不返回缩略图：前端手上已经有用户刚上传的那张图，把 `box` 按百分比画成可点的矩形
 * 叠上去就行。服务端裁一遍再编码成 PNG 传回来，一张 900px 的稿子动辄几百 KB。
 *
 * @param imageUrl **必须是 data URL**。`decodeImage` 只解 PNG，传 `/files/x.png`
 *   或 http 地址会得到一句「不是合法的 PNG 数据」。调用方先过 `resolveImages`。
 */
export async function splitForPick(
  imageUrl: string,
  gateway: ProviderGateway,
): Promise<PickSlide[]> {
  const img = decodeImage(imageUrl);
  const refs = await splitSlides(gateway, imageUrl, img);
  return refs.map((ref, index) => ({
    index, pageType: ref.pageType, box: ref.box,
    // 只在真的是兜底时才带上这个键：写成 `fallback: ref.fallback` 会得到
    // `{fallback: undefined}`，序列化后虽然没了，但对象形状在两处调用点不一致
    ...(ref.fallback ? { fallback: true as const } : {}),
  }));
}

export type RedrawEvent =
  | { event: 'progress'; data: ProgressPayload<RedrawStep> }
  | { event: 'done'; data: { prompt: string; mockHtml: string; issues: string[]; promptIssues: PromptIssue[] } }
  | { event: 'error'; data: { message: string } };

export interface RedrawInput {
  styleId: string;
  pageType: PageType;
  /** data URL。`decodeImage` 只解 PNG，调用方先过 `resolveImages` */
  imageUrl: string;
  box: CropBox;
  /** **必传**。路由那边用 `billedGateway()` 建，测试里换假的。
   *  不给默认值——默认值会让「忘了挂 onUsage」变成静默的记账缺口 */
  gateway: ProviderGateway;
}

/**
 * 提示词符不符合契约——**直接用契约自己的校验器**，不要另写一份子集。
 *
 * 原先这里只查「四个小节在不在」，而 `lintStylePrompt` 还查**小节顺序**与
 * **有没有写死 img 的 src**。用子集的后果是端到端静默的：顺序错或写死 src 的提示词
 * 既不重试、`done` 事件里也不报，而落库那一步只认 `saveStyleDoc` 的 `ok`
 * （那个字段只有整个 doc 一条提示词都没有时才为 false）——这个问题从重试到落库
 * 没有任何一个环节会露面。
 */
function promptProblems(prompt: string): PromptIssue[] {
  return lintStylePrompt(prompt);
}

/**
 * 把内部错误翻成能给用户看的话。
 *
 * `decodeImage` 失败时抛的是 `PNG_DECODE_FAILED: 不是合法的 PNG 数据` 这种带哨兵前缀的
 * 内部报文——原样送出去，用户看到的是一句他既看不懂也无从下手的话。
 * 认得出的翻成中文，认不出的**原样透传**（`风格不存在：x`、`模型没写出提示词`
 * 本来就是能照做的中文，一律换成「服务器内部错误」反而更难排查）。
 *
 * 两条路由（分页的 POST 与重识别的 SSE）共用这一份——同一个失败给两种待遇是错的。
 */
export function publicRedrawMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.startsWith('PNG_DECODE_FAILED')) return '这张图读不了，请用 PNG（前端上传时会自动转）';
  return raw;
}

/**
 * 按框重识别一页。
 *
 * 失败不抛，转成 `error` 事件——调用方是 SSE 路由，抛出去只会变成一个断掉的连接，
 * 用户看不到原因。
 */
export async function* redrawPage(input: RedrawInput): AsyncGenerator<RedrawEvent> {
  const { gateway } = input;
  // 出错时日志要能说清死在哪一步——一条通用的网关报错，不写这个分不出是死在
  // 写提示词还是出样机
  let step: 'crop' | 'read' | 'mock' = 'crop';
  try {
    const doc = resolveStyleDoc(input.styleId);

    yield { event: 'progress', data: { step, label: '正在裁出这一页', done: 0, total: 3 } };
    const img = decodeImage(input.imageUrl);
    const pageImage = toDataUrl(cropNormalized(img, input.box));

    step = 'read';
    yield { event: 'progress', data: { step, label: '正在写提示词', done: 1, total: 3 } };
    let prompt = await writePagePrompt(gateway, pageImage, input.pageType, { palette: doc.palette, fonts: fontStacksOf(doc) });
    let problems = promptProblems(prompt);
    if (problems.length > 0) {
      // 连 prompt.length 一起记：若失败源于输出被截断，「代码要求」排在最后一段，
      // 第二次会在同一位置再截断，那次调用就是白花的——长度能让人看出这个信号
      logger.warn('写出来的提示词不合契约，带问题重试一次', {
        styleId: input.styleId, pageType: input.pageType,
        problems: problems.map((p) => p.message), promptLength: prompt.length,
      });
      prompt = await writePagePrompt(gateway, pageImage, input.pageType, {
        palette: doc.palette,
        fonts: fontStacksOf(doc),
        problems: problems.map((p) => p.message),
      });
      problems = promptProblems(prompt);
    }

    step = 'mock';
    yield { event: 'progress', data: { step, label: '正在出样机', done: 2, total: 3 } };
    const { html, issues } = await generateMock(gateway, prompt, doc.palette, fontStacksOf(doc), doc.spec, input.pageType);

    yield {
      event: 'done',
      data: {
        prompt,
        mockHtml: html,
        issues: issues.map((i) => i.message),
        promptIssues: problems,
      },
    };
  } catch (err) {
    logger.warn('单页重识别失败', {
      styleId: input.styleId, pageType: input.pageType, step,
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    yield { event: 'error', data: { message: publicRedrawMessage(err) } };
  }
}

export interface ReplaceInput {
  styleId: string;
  pageType: PageType;
  prompt: string;
  mockHtml: string;
  /**
   * 这一页绑定的版式骨架 id。**不传 = 不动原来的绑定，传空串 = 解绑。**
   *
   * 三个调用点要的语义不同，所以不能用「缺省即空」：
   * - 直接改这一页（挪元素）：绑定留着——它管的是生成，与样机上挪了几像素无关；
   * - 换版式（风格库）：传新的 id；
   * - 传参考图重做：整页重来，传空串解绑。
   *
   * 「不传 = 不动」这件事在这里收口，而不是让客户端每次都把现值回传：
   * 回传要求客户端先读到那份 id，而它多半是几秒前拉的，中途改了就被静默写回旧的。
   */
  layoutId?: string;
}

/**
 * 永久替换一个页类型的提示词与样机。
 *
 * 单独开一条路而不是复用 `saveStyleDoc` 那条（它要整个 doc 原样传回来）：
 * 客户端得先拉全量、改一格、再回传，中间**任何一个字段丢了都会被静默写掉**。
 * 这里只收要改的两项，其余从库里读出来原样带过，出错面小一个量级。
 *
 * `issues` 是**派生数据**，服务端拿这套风格的配色重跑一遍 lint 算出来。
 * 让客户端传回来是错的——它算不了，传回来也只能原样存。
 */
export interface ReplaceResult {
  doc: StyleDoc;
  /** **只报这一页**的契约问题（缺小节 / 顺序错 / 写死 img src）。
   *  **不阻断保存**——与样机一个口径；但必须带出去给界面看：丢掉它，
   *  这个问题就从重试、到 SSE 事件、到落库全程没有任何一个环节会露面。
   *
   *  范围是「这一页」而不是「整本」：这次操作只动了这一页，返回别的页早已存在的问题
   *  会让用户以为是自己刚改坏的。整本的风格体检挂在 GET 详情上 */
  issues: { pageType: string; message: string }[];
}

export function replacePagePrompt(input: ReplaceInput): ReplaceResult {
  const doc = resolveStyleDoc(input.styleId);
  const page: StylePagePrompt = {
    pageType: input.pageType,
    prompt: input.prompt,
    mockHtml: input.mockHtml,
    layoutId: input.layoutId ?? doc.pagePrompts[input.pageType]?.layoutId ?? '',
    source: 'manual',
    issues: lintMockHtml(input.mockHtml, doc.palette),
    edited: true,
  };
  const next = StyleDoc.parse({
    ...doc,
    pagePrompts: { ...doc.pagePrompts, [input.pageType]: page },
  });
  const result = saveStyleDoc(next);
  // 抛 invalid 而不是普通 Error：这是**用户输入**的问题（整份 doc 一条非空提示词都没有），
  // 该由 4xx 表达。抛普通 Error 会被错误中间件映射成 500，而那正是用户的问题被说成
  // 「服务器内部错误」的由来——把这条语义挂在路由那层的 zod 修饰符上是脆的，service 自己说清
  if (!result.ok) throw invalid('这一条提示词不合规，没有保存');
  return {
    doc: resolveStyleDoc(input.styleId),
    issues: result.issues.filter((i) => i.pageType === input.pageType),
  };
}
