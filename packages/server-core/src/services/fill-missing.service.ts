import {
  fontStacksOf, forcedLayoutBlock, missingPageTypes, PAGE_TYPE_LABEL, PAGE_TYPE_ORDER, StyleDoc,
  type FillMissingStep, type PageType, type ProgressPayload, type StylePagePrompt,
} from '@lumen/ir-schema';
import type { ProviderGateway } from '@lumen/provider-gateway';
import { mapLimit } from '../lib/concurrency.js';
import { MODEL_LIMITER, watchThrottle } from '../lib/model-limiter.js';
import { logger } from '../lib/logger.js';
import { derivePrompts, generateMock } from './page-prompt-kit.js';
import { publicRedrawMessage } from './redraw-page.service.js';
import { resolveLayoutForPrompt } from './studio-layout.service.js';
import { resolveStyleDoc, saveStyleDoc } from './style-doc.service.js';

/**
 * 补齐一套**已存风格**缺的页类型。
 *
 * 页类型是会长的：识别链路认识的页类型从九个加到十一个（新增 `architecture` / `mindMap`），
 * 新识别的风格自动带上它们，而**已经存进库的那些只有九个**。用户看库里那套风格的详情时，
 * 架构图与思维导图两格是空的，生成到那两页就没有提示词可用。
 *
 * 做成服务而不是一次性脚本：下次再加页类型，这条路原样能跑，不用再写一个补数脚本。
 *
 * 与全量识别（`recognize-doc.service`）的区别在于**只碰缺的那几类**：配色、字体、
 * 已有的页类型一个都不动。所以它必须先把「缺哪些」算清楚——一类不缺时
 * 一个模型调用都不发，直接把原样返回去。否则「补齐」会变成「重跑一遍」，
 * 用户等十几分钟、白花一轮调用的钱，还把他的风格重新洗一遍。
 */

export interface FillMissingInput {
  styleId: string;
  /** **必传**。路由用 `billedGateway()` 建，测试里换假的 —— 与 `redrawPage` 同口径 */
  gateway: ProviderGateway;
  /**
   * 新补的页类型要绑的版式（`pageType → layoutId`）。
   *
   * **补页与绑版式必须一次做完。** 版式是写在页提示词上的（`pagePrompts[t].layoutId`），
   * 而补页之前那条提示词还不存在——所以没法「先绑再补」。分开做的话还有第二个坑：
   * 样机是在补页那一步生成的，绑版式发生在之后，样机就没带上骨架——
   * 风格库里显示的是模型自由发挥的那一版，与真生成出来的对不上。
   *
   * 认不出的 id 会被忽略（`resolveLayoutForPrompt` 回 null），那一页就不带骨架，
   * 与没绑时一样——绑定失效最该发生的是退回自动候选，而不是让补页整个失败。
   */
  bindLayouts?: Partial<Record<PageType, string>>;
}

export type FillMissingEvent =
  | { event: 'progress'; data: ProgressPayload<FillMissingStep> }
  | { event: 'page'; data: { pageType: PageType; prompt: string } }
  | { event: 'done'; data: { doc: StyleDoc; filled: PageType[]; issues: { pageType: string; message: string }[] } }
  | { event: 'error'; data: { message: string } };

/**
 * 出样机的并发，用共享的 `MODEL_LIMITER`。
 *
 * 原先写死 3（「一张样机要跑四分钟，必须并发；但最贵，三是个折中」）——
 * 顾虑对，但**写死解决不了**：限流按 API key 算，补齐、识别、生成页面用的是同一个 key。
 * 交给限流器自己找稳态。见 `lib/model-limiter.ts`。
 */

/**
 * 补齐缺失的页类型，边跑边报进度。
 *
 * 失败不抛，转成 `error` 事件——调用方是 SSE 路由，抛出去只会变成一个断掉的连接，
 * 用户看不到原因，也不知道是白等还是真失败。与 `redrawPage` 同一个理由。
 */
export async function* fillMissingPageTypes(input: FillMissingInput): AsyncGenerator<FillMissingEvent> {
  // 包一层：撞限流要喂给共享的并发上限。**在入口包一次**，下面所有调用都走它
  const gateway = watchThrottle(input.gateway);
  // 出错时日志要能说清死在哪一步——一条通用的网关报错，不写这个分不出是死在
  // 推导提示词还是出样机
  let step: 'derive' | 'mock' = 'derive';
  try {
    const doc = resolveStyleDoc(input.styleId);
    const missing = missingPageTypes(doc);

    // 一类不缺就到此为止：**这里必须零模型调用**。走成「重跑一遍」的后果是
    // 用户等十几分钟、白花一轮钱，还把已有的页类型重新洗一遍——而他要的只是补上缺的两格
    if (missing.length === 0) {
      yield { event: 'done', data: { doc, filled: [], issues: [] } };
      return;
    }

    // 已有页类型按推荐顺序取。`derivePrompts` 只拿前三条当 few-shot，
    // 顺序定了它取到的就是稳定那三条，不受库里键的插入顺序影响
    const existing = PAGE_TYPE_ORDER
      .filter((t) => doc.pagePrompts[t])
      .map((t) => ({ pageType: t, prompt: doc.pagePrompts[t]!.prompt }));

    /* ---- 1. 照着已有的几条推导缺的提示词 ---- */
    step = 'derive';
    yield { event: 'progress', data: { step, label: `推导另外 ${missing.length} 类页面`, done: 0, total: missing.length } };
    // derivePrompts 保证每个请求的页类型都有返回（模型漏写的用兜底模板补），
    // 所以 derived 与 missing 一一对应；它只对**某一条**不合法降级，网关本身报错才抛
    const derived = await derivePrompts(gateway, existing, missing, doc.palette);
    yield { event: 'progress', data: { step, label: '缺失页类型已推导完', done: missing.length, total: missing.length } };
    for (const d of derived) {
      yield { event: 'page', data: { pageType: d.pageType, prompt: d.prompt } };
    }

    /* ---- 2. 给每一条推导出来的提示词出样机 ---- */
    step = 'mock';
    const entries: Record<string, StylePagePrompt> = {};
    const promptOf = new Map(derived.map((d) => [d.pageType, d.prompt]));
    let mocked = 0;
    // 必须传 doc.fontFamily：与 `redrawPage` 一个口径。不注入的话模型会自己发明字体栈，
    // 与这套风格已有的页摆在一起就是两种字体。
    // **`doc.spec` 也要传**：补齐出来的页与已有页摆在一起，页脚页码、页眉、效果语言
    // 得是同一套；不传的话新补的这几页天生就与其余的页对不上
    for await (const m of mapLimit(derived, MODEL_LIMITER, async (d) => {
      /*
        绑了版式的页，样机也要照那份骨架出——与真生成同一个口径。
        不带的话，风格库里显示的是模型自由发挥的那一版，而实际生成出来是骨架那一版，
        用户照着样机验收会落空。
      */
      const boundId = input.bindLayouts?.[d.pageType];
      const bound = boundId ? resolveLayoutForPrompt(boundId) : null;
      const layoutBlock = bound ? forcedLayoutBlock(bound, PAGE_TYPE_LABEL[d.pageType]) : '';
      const r = await generateMock(gateway, d.prompt, doc.palette, fontStacksOf(doc), doc.spec, d.pageType, layoutBlock);
      return { pageType: d.pageType, boundId: bound ? bound.id : '', ...r };
    })) {
      mocked += 1;
      yield { event: 'progress', data: { step, label: `已出样机 ${mocked}/${derived.length} 页`, done: mocked, total: derived.length } };
      if (!m) continue;
      entries[m.pageType] = {
        pageType: m.pageType,
        prompt: promptOf.get(m.pageType)!,
        mockHtml: m.html,
        layoutId: m.boundId,
        source: 'derived',
        issues: m.issues,
        edited: false,
      };
    }
    // 样机没出来的页也要留一条，只有提示词没有样机，界面上如实显示「样机未生成」——
    // 与全量识别同一个口径，也保证推导出来的提示词不会因为样机失败就丢掉。
    // **版式照绑**：样机没出是模型的问题，不该把已经定好的版式一起丢掉
    for (const d of derived) {
      if (entries[d.pageType]) continue;
      const boundId = input.bindLayouts?.[d.pageType] ?? '';
      entries[d.pageType] = {
        pageType: d.pageType, prompt: d.prompt, mockHtml: '', layoutId: boundId,
        source: 'derived', issues: [], edited: false,
      };
    }

    /* ---- 3. 合并落库 ---- */
    // **单次 spread**，与 `replacePagePrompt` 同形：只把新页类型并进去，
    // palette / fontFamily / meta（含 reviewed）/ deckPrompt 以及已有的页类型
    // 一律原样带过。写成「重造一份 doc」的话，任何一处漏抄都会被静默写掉
    const next = StyleDoc.parse({
      ...doc,
      pagePrompts: { ...doc.pagePrompts, ...entries },
    });
    const result = saveStyleDoc(next);

    // 重新读一遍再返回，与 `replacePagePrompt` 一致：`saveStyleDoc` 会重算 meta.updatedAt，
    // 手上这份 next 是落库前的，直接返回会与库里对不上
    yield {
      event: 'done',
      data: {
        doc: resolveStyleDoc(input.styleId),
        filled: derived.map((d) => d.pageType),
        issues: result.issues,
      },
    };
  } catch (err) {
    logger.warn('补齐缺失页类型失败', {
      styleId: input.styleId, step,
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    yield { event: 'error', data: { message: publicRedrawMessage(err) } };
  }
}
