import { z } from 'zod';
import {
  DEPTH_BRIEF,
  PAGE_TYPE_BRIEF,
  PAGE_TYPE_LABEL,
  PAGE_TYPE_ORDER,
  PageType,
  estimateImageCount,
  moduleOfPageType,
  type DeckDepth,
  type OutlinePage,
  type PlanStep,
  type ProgressPayload,
} from '@lumen/ir-schema';
import { ARCHITECTURE_GROUP_NAMES, CHART_KIND_LABEL, estimateChartKind } from '@lumen/ir-schema';import { isMockPlaceholder, type ProviderGateway, type TextMessage } from '@lumen/provider-gateway';
import { buildOutline, detectIntent } from '@lumen/content-engine';
import { logger } from '../lib/logger.js';
import { parseModelJson } from '../lib/model-reply.js';
import { mapLimit } from '../lib/concurrency.js';
import { acquireGeneration, beatGeneration, releaseGeneration } from '../lib/generation-lock.js';
import { alignSources, readDeckMeta, saveOutline } from './generate.service.js';
import { requireProject } from './project.service.js';

/**
 * 三段内容链路的前两段：**提纲**与**教案**。
 *
 * 第三段（出页面）不在这里——它走 `generate-html.service.ts` 那条已有的路，
 * 这一版只改了它读的内容（见那边的 `contentBrief`）。
 *
 * 两段的共同规矩：
 *
 * - **规则先给确定性结果，模型只做语义精修**。与风格识别那条链路同一套做法
 *   （`recognize.service.ts`）。理由不是保守：`buildOutline` 的分页是
 *   `segmentContent` 的确定性切分，验收清单里「已有内容 100% 正确分页」那条硬要求
 *   靠的就是它，模型做不到 100%。
 * - **模型不可用时不抛**，原样返回规则结果并标降级。用户看到的应当是
 *   「这次没走模型，这是规则骨架」，而不是一个报错弹窗。
 * - **人工改过的页原样保留**，并在结果里如实报出跳过了几页。与
 *   `StylePagePrompt.edited` 是同一条规矩：机器重跑不该把人的手改冲掉。
 */

/** 模型调用最多试几次。一次原始 + 两次带纠正 */
const ATTEMPTS = 3;

/** 教案的并发度。一页教案几百字，没有截断风险，可以并发 */
const LESSON_CONCURRENCY = 3;

export interface PlanEvent {
  event: 'progress' | 'outline' | 'page' | 'done' | 'error';
  data: unknown;
}

export type PlanDone = {
  outline: OutlinePage[];
  succeeded: number;
  failed: number;
  /** 有人工痕迹、这一轮没动的页数。**提纲**那一档用 */
  skippedEdited: number;
  /**
   * 这一轮**覆盖掉**的手改页数。**教案**那一档用。
   *
   * 与 `skippedEdited` 是一对反义，两档的口径故意不同：提纲跳过手改（那是人定的措辞，
   * 重跑该保留），教案整本覆盖手改（用户按的就是「整本」）。覆盖了必须说出来，
   * 不然用户回头发现自己调过的那页被冲了，却不知道是什么时候的事。
   */
  overwrittenEdited: number;
  degraded: boolean;
};

/* ---------------- 契约 ---------------- */

/** 提纲阶段模型要回的东西。**页数由骨架定死，这里只收措辞** */
const OutlineDraft = z.object({
  pages: z.array(z.object({
    index: z.number().int().min(0),
    title: z.string().min(1),
    claim: z.string().default(''),
    points: z.array(z.string()).max(5).default(() => []),
    pageType: PageType.optional(),
  })).min(1),
});

/** 教案阶段模型要回的东西：在提纲的基础上写实 */
const LessonDraft = z.object({
  title: z.string().min(1),
  claim: z.string().default(''),
  points: z.array(z.string()).max(5).default(() => []),
  visualForm: z.string().default(''),
  designNote: z.string().default(''),
});

/* ---------------- 提示词 ---------------- */

const OUTLINE_SYSTEM = [
  '你是资深演示文稿策划。用户会给你一段需求原文，以及一份**规则层切好的页骨架**。',
  '',
  '页数、页序、页类型**由骨架定死**：你要在骨架上重写每一页的措辞，**不要增删页、不要改页序**。',
  '骨架里已有的页类型可以改（比如把一页从「纯文本」改成「图表」更合适），但总数不能变。',
  '',
  '只输出 JSON，不要任何解释、不要 Markdown 围栏。',
].join('\n');

const LESSON_SYSTEM = [
  '你是资深演示文稿策划。用户会给你整本的提纲，以及**其中一页**的原始材料。',
  '你要把这一页写实——写到「照着它就能直接做这一页」的程度。',
  '',
  '硬性要求：',
  '- 要点必须**带具体数字或具体措辞**。不要写「增长显著」「效果良好」这类空话；',
  '  原文里有数字就用原文的数字，原文没给数字就写清是什么、多少、和谁比。',
  '- 内容只来自用户给的原文与提纲，**不要自己编事实**。原文确实没写的地方，宁可写得概括。',
  '- 视觉形式要具体到能被执行：是配图还是图表、图在左还是在右、几条要点、什么版式。',
  '- **视觉形式必须照着这一页的页类型写。** 页类型决定了版面的结构，写偏了生成出来的',
  '  就不是那个样子——图片排版页要交代每一张图画什么，图表页要交代画什么图、轴是什么。',
  '',
  '只输出 JSON，不要任何解释、不要 Markdown 围栏。',
].join('\n');

/**
 * 每个页类型在**教案**这一层必须交代到哪一步。
 *
 * 与 `PAGE_TYPE_BRIEF` 分工不同：那条讲的是「这一页该长什么样」，给的是画面；
 * 这条讲的是「写教案时必须说清哪几件事」，管的是内容够不够撑起那个画面。
 *
 * 为什么必须逐类型写：**有些页类型的版面会反过来约束内容**。最典型的是图片排版页——
 * 版式是按张数筛的（`imageLayoutCandidates` → `estimateImageCount`），
 * 教案不写明几张、每张画什么，挑版式那一步就只能拿要点条数去猜，
 * 猜出来的版式和内容对不上。这类信息只说「视觉形式要具体」是逼不出来的。
 *
 * 表写全 `Record<PageType, ...>`：将来加页类型时漏了编译器会报。
 */
/**
 * 20 种图表的中文名，拼成一句话。
 *
 * 从 `CHART_KIND_LABEL` 生成而不是手抄：手抄的话加一种图表就要记得回来改两处
 * （提示词里一处、校验报错里一处），而漏改的症状是「模型永远选不到那种新图」。
 */
const CHART_KIND_NAMES = Object.values(CHART_KIND_LABEL).join('、');

const LESSON_TYPE_RULE: Record<PageType, string> = {
  cover: '封面只有标题、副标题与主视觉。**要点留空**，视觉形式写主视觉是什么。',
  toc: '目录页的条目就是各章节标题，按顺序列全、每条带上页码。不要另写正文。',
  section: '转折页只有章节序号、章节名与主视觉。**要点留空**。',
  text: '文字页以要点为主，不配图或配图很小。视觉形式交代分栏与文字层级即可，不用交代图。',
  imageText: '图文页是**以文字为主**的：视觉形式里必须写明配几张图（一到两张）、每张画什么，'
    + '以及图在左还是在右。要点写正文，不要写成图片说明。',
  gallery: '图片排版页是**以图为主**的：视觉形式里必须写明**几张图、每一张分别画什么**，'
    + '按顺序列出来（例如「四张图：…／…／…／…」），张数与版面容量相符（三到八张）。'
    + '要点写这一组图共同说明的事或图与图之间的关系，不要写成四段独立正文。',
  people: '人物页的视觉形式必须写明**几个人、分别是谁、各自的职位与一句话介绍**，'
    + '人像位是竖向的。要点写这个团队/这组人的共同点。',
  ui: '界面页的视觉形式必须写明**用哪台设备**（手机 / 笔记本 / 显示器）、'
    + '**屏幕里是什么界面**（首页 / 列表 / 详情 / 看板…）以及设备摆在版面的哪一侧。'
    + '要点写这套界面解决了什么问题，不要写成一份功能清单。',
  metrics: '数字页的要点就是那几个指标数字，**每条都要带具体数值与单位**，'
    + '并写明数字之间在比什么。视觉形式交代几个数字、怎么排。',
  /*
    图表页的种类名要**逐个列出来**：版式库按教案里写的图名挑骨架，
    写「用图表展示」这种含糊说法就认不出是哪一种，只能兜底给最常用的一类。
    清单从 `CHART_KIND_LABEL` 取，加新图表时不用回来改这段文案。
  */
  chart: `图表页的视觉形式必须写明**画哪种图**，从这几个里挑一个说：${CHART_KIND_NAMES}。`
    + '还要写明横轴纵轴各是什么、几条数据系列；要点写图上能读出来的结论。',
  /*
    架构图的**结构名要逐个列出来**：版式库按教案里写的结构挑骨架，
    「视觉形式交代分层的画法与连线的走向」这种含糊说法认不出是哪一组，只能兜底给分层。
    清单从 `ARCHITECTURE_GROUP_NAMES` 取，加新分组时不用回来改这段文案（与图表页同款）。
  */
  architecture: '架构图页的要点要写清**分几层（或几块）、每层有哪些块、块与块之间是什么关系**；'
    + `视觉形式必须写明**这是哪种结构**，从这几个里挑一个说：${ARCHITECTURE_GROUP_NAMES}，`
    + '并交代连线或箭头的走向。',
  mindMap: '思维导图页的要点写中心主题与各条分支，**每条是短词而不是整句**。',
  end: '封底只有一句结语与联系方式。**要点留空**。',
};

/* ---------------- 提纲 ---------------- */

export interface PlanOutlineInput {
  projectId: string;
  tenantId: string;
  userId: string;
  /** 不传 = 由内容决定 */
  targetPages?: number;
  depth: DeckDepth;
  gateway: ProviderGateway;
}

/**
 * 生成提纲。
 *
 * 流程是「规则出骨架 → 模型在骨架上重写 → 合并人工痕迹 → 落库」。
 * 每一步都有存在的理由，别省：
 *
 * - 骨架保证不丢内容，且模型挂了也有东西可用；
 * - 合并人工痕迹保证重跑不冲掉手改；
 * - 落库放在最后一步，中途失败不会留下半份大纲。
 */
export async function* planDeckOutline(input: PlanOutlineInput): AsyncGenerator<PlanEvent> {
  // 与出页面共用同一把锁：三条链路写的是同一份东西，两条同时跑白花一倍的模型钱
  acquireGeneration(input.projectId, '生成提纲');
  try {
    const project = requireProject(input.projectId, input.tenantId);

    yield progress('outline', '正在搭叙事骨架', 0, 1);

    const skeleton = buildOutline({
      title: project.title,
      brief: project.brief,
      audienceTag: project.audienceTag as never,
      ...(input.targetPages !== undefined ? { targetPages: input.targetPages } : {}),
    });

    // 规则骨架先落库：模型那一段要跑几十秒，中途断掉时库里不该是空的
    const existing = readDeckMeta(input.projectId).outline ?? [];
    const editedIndex = new Set(existing.filter((p) => p.edited).map((p) => p.index));
    saveOutline(input.projectId, input.tenantId, skeleton.outline);

    yield progress('outline', `骨架 ${skeleton.outline.length} 页，正在让模型深入思考`, 0, 1);

    const rewritten = await rewriteOutline(
      input.gateway, project.brief, skeleton.outline, input.depth, input.targetPages, input.projectId,
    );

    // 模型没给出可用的东西：原样返回规则骨架，如实标降级
    if (rewritten === null) {
      const outline = withEditedKept(skeleton.outline, existing, editedIndex);
      saveOutline(input.projectId, input.tenantId, outline);
      yield { event: 'outline', data: { outline, degraded: true } };
      yield {
        event: 'done',
        data: {
          outline,
          succeeded: outline.length,
          failed: 0,
          skippedEdited: editedIndex.size,
          overwrittenEdited: 0,
          degraded: true,
        } satisfies PlanDone,
      };
      return;
    }

    const outline = withEditedKept(rewritten, existing, editedIndex);
    saveOutline(input.projectId, input.tenantId, outline);
    yield progress('outline', '提纲已就绪', 1, 1);
    yield { event: 'outline', data: { outline, degraded: false } };
    yield {
      event: 'done',
      data: {
        outline,
        succeeded: outline.length,
        failed: 0,
        skippedEdited: editedIndex.size,
        overwrittenEdited: 0,
        degraded: false,
      } satisfies PlanDone,
    };
  } catch (err) {
    // 抛出去只会断连，客户端什么都看不到。转成一条 error 事件由界面如实显示
    yield { event: 'error', data: { message: err instanceof Error ? err.message : String(err) } };
  } finally {
    releaseGeneration(input.projectId);
  }
}

/**
 * 让模型在骨架上重写。
 *
 * 返回 `null` 表示**这次没拿到可用的东西**——模型不可用、或试到上限仍不合契约。
 * 两种情况都不抛：调用方原样保留规则骨架并标降级，比让用户看一个报错弹窗好。
 */
async function rewriteOutline(
  gateway: ProviderGateway,
  brief: string,
  skeleton: OutlinePage[],
  depth: DeckDepth,
  targetPages: number | undefined,
  /** 只用来续租：这一段最多会连发三次模型调用，是取锁方最长的一段静默 */
  projectId: string,
): Promise<OutlinePage[] | null> {
  const skeletonText = skeleton
    .map((p, i) => `第 ${i + 1} 页 [${PAGE_TYPE_LABEL[p.pageType]}] 标题：${p.title}`
      + (p.claim ? ` | 主张：${p.claim}` : '')
      + (p.points.length > 0 ? ` | 已有要点：${p.points.join('；')}` : ''))
    .join('\n');

  /**
   * 用户设了页数，页数就是**要求**，不是参考。
   *
   * 不把这一条说清楚，模型只会照着骨架的页数回——而骨架是规则层切的，
   * 「仅想法」的输入被写死的人群模板卡住（`general` 只有 6 条），
   * 「已有内容」的输入又完全按段落数算，两边都不会听用户的。
   */
  const pageRule = targetPages === undefined
    ? [`规则层切出的骨架，共 ${skeleton.length} 页。页数与页序由它定死：`, skeletonText]
    : [
      `这一本要 **${targetPages} 页**（含封面与结尾），页数由用户指定。`,
      '',
      `规则层先切出一份骨架，共 ${skeleton.length} 页，作为内容的底子：`,
      skeletonText,
      '',
      `请把它重新组织成 ${targetPages} 页：骨架里的事实与数字**一句都不能丢**，`,
      '页数不够就把内容拆细、把主张铺开，页数多了就把相邻的并起来。',
    ];

  const messages: TextMessage[] = [{
    role: 'user',
    content: [
      '用户写的需求原文：',
      brief.trim() || '（用户没有写正文，只有标题）',
      '',
      ...pageRule,
      '',
      '这一档要想到什么程度：',
      DEPTH_BRIEF[depth],
      '',
      '对每一页给出：',
      '- index：页码下标，从 0 开始，**连续且与页数一致**',
      '- title：这一页的标题（短、具体。不要「本节要点」这种）',
      '- claim：这一页要讲清的一句话',
      '- points：2~4 条要点，每条一句完整的话',
      `- pageType：从这些里选一个最合适的——${PAGE_TYPE_ORDER.join(' / ')}`,
      '',
      '只输出 JSON，形状为：',
      '{"pages":[{"index":0,"title":"...","claim":"...","points":["..."],"pageType":"cover"}]}',
    ].join('\n'),
  }];

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    // 每一轮尝试都续一次租。三次连着超时是取锁方最长的一段静默（约十五分钟），
    // 不续的话一个真在跑的提纲会被当成卡死
    beatGeneration(projectId);
    let raw: string;
    try {
      const res = await gateway.text({
        taskType: 'outline',
        json: true,
        maxTokens: 12000,
        system: OUTLINE_SYSTEM,
        messages,
      });
      raw = res.text;
    } catch (err) {
      /**
       * **网关自己报错也走降级，不当失败。**
       *
       * 网络抖动、限流、Provider 全挂——这些都是「模型这一轮不可用」，
       * 与「模型回了一堆看不懂的东西」是同一类处境，收场也该一样：
       * 用规则骨架顶上、如实标降级。让它冒到最外层变成一条 error 事件，
       * 用户看到的是「生成提纲中断」，而其实骨架早就落库了、完全可用。
       */
      logger.warn('提纲这一步的模型调用失败，退回规则骨架', {
        attempt, err: err instanceof Error ? err.message : String(err),
      });
      return null;
    }

    // 内置 Mock 的占位说明**过得了 JSON 解析**（它就是一段带标记的文字），
    // 不先拦掉会被当成正常回复，一路把骨架覆盖成空
    if (isMockPlaceholder(raw)) {
      logger.warn('提纲这一步没有可用的模型', { attempt });
      return null;
    }

    const parsed = parseModelJson<unknown>(raw);
    if (!parsed) {
      logger.warn('提纲没拿到 JSON，重发一次', { attempt, raw: raw.slice(0, 200) });
      messages.push(
        { role: 'assistant', content: raw },
        { role: 'user', content: '你上一次的回复不是可解析的 JSON。请**只输出 JSON**，不要任何解释、不要 Markdown 围栏。' },
      );
      continue;
    }

    const draft = OutlineDraft.safeParse(parsed);
    if (draft.success) {
      /**
       * 页数**只有在用户设了的时候**才是硬要求。
       *
       * 没设页数时页数由骨架定，模型少给几页就按骨架补齐、多给就丢掉——
       * 那种情况它是来改措辞的，为页数对不上而整轮降级不划算。
       * 设了页数则是另一回事：用户要 12 页、回 9 页等于没设，必须重发。
       */
      if (targetPages === undefined || draft.data.pages.length === targetPages) {
        return mergeDraft(draft.data.pages, skeleton, targetPages);
      }
      logger.warn('提纲页数不对，带抱怨重发', {
        attempt, got: draft.data.pages.length, expected: targetPages,
      });
      messages.push(
        { role: 'assistant', content: raw },
        { role: 'user', content: `你给了 ${draft.data.pages.length} 页，但这一本要 **${targetPages} 页**。请重排成 ${targetPages} 页，内容一句都不能丢。只输出 JSON。` },
      );
      continue;
    }

    logger.warn('提纲结构不合契约，带错误重发', {
      attempt,
      issues: draft.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    messages.push(
      { role: 'assistant', content: raw },
      { role: 'user', content: correctionBlock(draft.error.issues.map((i) => `${i.path.join('.') || '(根)'}：${i.message}`)) },
    );
  }

  return null;
}

/**
 * 把模型给的东西合回大纲。
 *
 * 分两种情形，**判据是用户有没有设页数**：
 *
 * - **设了页数**：页数是用户的要求，模型排几页就是几页（调用方已校验过与目标一致）。
 *   骨架那份 `notes`（这一页吃哪段原文）随之失效——页数变了，段落与页的对应关系
 *   也变了，**清掉交给 `alignSources` 重算**，留着反而是错的。
 * - **没设页数**：页数由骨架定，模型只改措辞。多给的页丢掉、少给的页留骨架原样，
 *   骨架的 `notes` 照旧有效，一并留着。
 */
function mergeDraft(
  pages: { index: number; title: string; claim: string; points: string[]; pageType?: PageType }[],
  skeleton: OutlinePage[],
  targetPages?: number,
): OutlinePage[] {
  // 用户设了页数：页数是要求，模型排几页就是几页（上面已经校验过与目标一致）
  if (targetPages !== undefined) {
    return [...pages]
      .sort((a, b) => a.index - b.index)
      .map((d, i) => ({
        index: i,
        pageType: d.pageType ?? 'text',
        title: d.title,
        claim: d.claim,
        points: d.points,
        section: '',
        notes: '',
        visualForm: '',
        designNote: '',
        edited: false,
      }));
  }

  // 没设页数：页数由骨架定，模型只改措辞
  const byIndex = new Map(pages.map((d) => [d.index, d]));
  return skeleton.map((page, i) => {
    const d = byIndex.get(i);
    if (!d) return page;
    return {
      ...page,
      title: d.title,
      claim: d.claim,
      points: d.points,
      pageType: d.pageType ?? page.pageType,
    };
  });
}

/**
 * 把人工改过的页换回原样。
 *
 * 按位置换，**不要求页数一致**：用户把页数从 9 改成 12 时，能对上的那 9 个位置
 * 照旧保留他改过的内容，多出来的页用模型的。原先页数一变就整份退回旧大纲，
 * 等于「改了页数就不生成」——那比位置略有偏移更糟。
 */
function withEditedKept(
  next: OutlinePage[],
  existing: OutlinePage[],
  editedIndex: Set<number>,
): OutlinePage[] {
  if (editedIndex.size === 0) return next;
  const byIndex = new Map(existing.map((p) => [p.index, p]));
  return next.map((page, i) => (editedIndex.has(i) ? (byIndex.get(i) ?? page) : page));
}

/* ---------------- 教案 ---------------- */

export interface PlanLessonsInput {
  projectId: string;
  tenantId: string;
  userId: string;
  gateway: ProviderGateway;
  /** 只重跑这几页；不传 = 全部 */
  only?: number[];
}

/**
 * 生成教案：逐页把提纲写实。
 *
 * **并发 3，每页的上下文是「整本提纲 + 这一页的原文」。**
 *
 * 设计文档里还写了「带上前两页的教案」，但那条与并发互相矛盾——第 N 页要读
 * 第 N-1、N-2 页的**产出**，是严格串行依赖，并发时那两页根本还没出来。
 * 这里取并发、放弃邻居教案：整本提纲已经把叙事主线给全了（每页标题与主张都在），
 * 邻居教案只是锦上添花；而串行跑一本 9 页要多花好几分钟。
 */
export async function* planLessons(input: PlanLessonsInput): AsyncGenerator<PlanEvent> {
  acquireGeneration(input.projectId, '生成教案');
  try {
    const project = requireProject(input.projectId, input.tenantId);
    const meta = readDeckMeta(input.projectId);
    const outline = meta.outline ?? [];
    if (outline.length === 0) throw new Error('还没有提纲，先生成提纲');

    const intent = meta.intent ?? detectIntent(project.brief);
    const sourceTexts = alignSources(project.brief, outline, intent.kind);

    /**
     * **整本重写一页不落，包括人改过的页。**
     *
     * 原先这里会跳过 `edited` 的页，理由与提纲那边一样（机器重跑不该把人的手改冲掉）。
     * 但这条在教案这一档弊大于利，实测踩到了：一页被标上「已手改」之后，
     * 「生成整本教案」就再也写不到它——用户明明设了 30 页、按的也是「整本」，
     * 却只写出 4 页。而那个标记本身还会被误打（见 `PUT /outline` 那边的注释），
     * 误标一次，这一页的教案就永远不再跟着整本更新。
     *
     * 单页重写（传 `only`）本来就是覆盖意图，现在两档口径一致了。
     * 覆盖掉的手改要如实报出来（`overwrittenEdited`），不能悄悄冲掉。
     */
    const editedIndex = new Set(outline.filter((p) => p.edited).map((p) => p.index));
    const targets = (input.only ?? outline.map((_, i) => i))
      .filter((i) => Number.isInteger(i) && i >= 0 && i < outline.length);

    const outlineText = outline
      .map((p, i) => `第 ${i + 1} 页 [${PAGE_TYPE_LABEL[p.pageType]}] ${p.title}`
        + (p.claim ? `——${p.claim}` : ''))
      .join('\n');

    let done = 0;
    yield progress('lessons', `共 ${targets.length} 页`, 0, targets.length);

    /** 一页的活。**不抛**：失败也要带回下标，好让界面说清是哪一页 */
    const work = async (index: number): Promise<{ index: number; page: OutlinePage | null }> => {
      try {
        beatGeneration(input.projectId);
        const page = await writeLesson(input.gateway, outline, outlineText, index, sourceTexts[index]);
        return { index, page };
      } catch (err) {
        logger.warn('这一页教案没写出来', {
          projectId: input.projectId, index, err: err instanceof Error ? err.message : String(err),
        });
        return { index, page: null };
      }
    };

    // 每页写出来就落一次库：中途断掉时已经写好的那些不会白跑
    const next = [...outline];
    let succeeded = 0;
    let failed = 0;

    for await (const r of mapLimit(targets, LESSON_CONCURRENCY, work)) {
      if (!r) continue;
      if (r.page) {
        next[r.index] = r.page;
        succeeded += 1;
      } else {
        failed += 1;
      }
      done += 1;
      yield { event: 'page', data: { index: r.index, page: r.page } };
      yield progress('lessons', `已写 ${done}/${targets.length} 页`, done, targets.length);
    }

    saveOutline(input.projectId, input.tenantId, next);
    yield {
      event: 'done',
      data: {
        outline: next,
        succeeded,
        failed,
        // 教案这一档不跳页，`skippedEdited` 恒为 0；覆盖了几页手改才是要报的那个数。
        // 单页重写本来就是覆盖意图，不报
        skippedEdited: 0,
        overwrittenEdited: input.only === undefined ? editedIndex.size : 0,
        degraded: false,
      } satisfies PlanDone,
    };
  } catch (err) {
    yield { event: 'error', data: { message: err instanceof Error ? err.message : String(err) } };
  } finally {
    releaseGeneration(input.projectId);
  }
}

/** 写一页教案。拿不到合契约的 JSON 就抛，由 `work` 兜住 */
async function writeLesson(
  gateway: ProviderGateway,
  outline: OutlinePage[],
  outlineText: string,
  index: number,
  sourceText: string | undefined,
): Promise<OutlinePage> {
  const page = outline[index]!;
  const messages: TextMessage[] = [{
    role: 'user',
    content: [
      '整本的提纲（这是这条叙事线，你写的这一页要接得上）：',
      outlineText,
      '',
      `现在写**第 ${index + 1} 页，共 ${outline.length} 页**。`,
      `- 这一页的页类型：${PAGE_TYPE_LABEL[page.pageType]}——${PAGE_TYPE_BRIEF[page.pageType]}`,
      `- 这个页类型对教案的要求：${LESSON_TYPE_RULE[page.pageType]}`,
      `- 规则层给的标题：${page.title}`,
      ...(page.claim ? [`- 规则层给的主张：${page.claim}`] : []),
      ...(page.points.length > 0 ? [`- 规则层给的要点：${page.points.join('；')}`] : []),
      ...(sourceText
        ? ['', '这一页对应的原文（可以引用其中的事实与数字，但不要整段照搬）：', sourceText]
        : ['', '（这一页没有对应的原文段落，内容从整本提纲推）']),
      '',
      '给出：title / claim / points（2~4 条，带数字）/ visualForm / designNote。',
      '只输出 JSON：{"title":"...","claim":"...","points":["..."],"visualForm":"...","designNote":"..."}',
    ].join('\n'),
  }];

  for (let attempt = 0; attempt < ATTEMPTS; attempt += 1) {
    const res = await gateway.text({
      taskType: 'page_content',
      json: true,
      maxTokens: 4000,
      system: LESSON_SYSTEM,
      messages,
    });

    if (isMockPlaceholder(res.text)) throw new Error('模型不可用（当前指向内置 Mock）');

    const parsed = parseModelJson<unknown>(res.text);
    if (!parsed) {
      messages.push(
        { role: 'assistant', content: res.text },
        { role: 'user', content: '你上一次的回复不是可解析的 JSON。请**只输出 JSON**。' },
      );
      continue;
    }

    const draft = LessonDraft.safeParse(parsed);
    if (draft.success) {
      const problems = lessonProblems(page.pageType, draft.data);
      if (problems.length === 0) {
        return {
          ...page,
          title: draft.data.title,
          claim: draft.data.claim,
          points: draft.data.points,
          visualForm: draft.data.visualForm,
          designNote: draft.data.designNote,
        };
      }
      // 合了 JSON 的契约，但没交代清这个页类型该交代的事——同一条纠正回路再走一轮
      messages.push(
        { role: 'assistant', content: res.text },
        { role: 'user', content: correctionBlock(problems) },
      );
      continue;
    }
    messages.push(
      { role: 'assistant', content: res.text },
      { role: 'user', content: correctionBlock(draft.error.issues.map((i) => `${i.path.join('.') || '(根)'}：${i.message}`)) },
    );
  }

  throw new Error(`第 ${index + 1} 页的教案试了 ${ATTEMPTS} 次仍不合契约`);
}

/**
 * 教案里**光靠提示词管不住**的那几条，写完之后再查一遍。
 *
 * 只查「查得准」的：图片排版页的版式是按张数筛的（`imageLayoutCandidates` 读
 * `estimateImageCount`），教案里看不出张数时那一步就只能拿要点条数去猜。
 * 提示词里已经要求写了，但模型漏掉时只有这里拦得住。
 *
 * **不查措辞**。「写得够不够具体」没有可靠的判据，硬查只会把好教案打回去重写，
 * 白花一次模型调用。
 */
function lessonProblems(pageType: PageType, d: z.infer<typeof LessonDraft>): string[] {
  const out: string[] = [];
  /*
    **图文页与图片排版页共用这一个版式库**（`moduleOfPageType`），所以这条校验也要覆盖两者。
    写死 `=== 'gallery'` 的话图文页漏检，而漏检的后果很实在：候选是按张数筛的
    （`imageLayoutCandidates` → `estimateImageCount`），教案不写张数就只能拿要点条数去猜，
    猜出来的版式和内容对不上。
  */
  if (moduleOfPageType(pageType) === 'image-layouts') {
    // 传空要点：要看的就是**视觉形式自己**有没有写张数，别让要点条数把这一条兜过去
    const n = estimateImageCount(d.visualForm, []);
    /*
      **只要求写清张数，不要求「至少几张」。** 早先卡过三张，理由是「一张图的版面
      就是图文页」——那会儿这个库整个叫「多图排版」，只有多图一组。现在库里分了两组，
      而且图文页本来就只放一到两张图，卡张数会让其中一组永远挑不到。

      上界也不卡：「十张」这类说法没错，版式筛的时候自己会按张数取够用的那几个。
    */
    if (n === null) {
      out.push(`visualForm：这是${PAGE_TYPE_LABEL[pageType]}，视觉形式里必须写明**几张图**（例如「四张图：…」），现在看不出来`);
    }
  }

  /*
    **图表页必须写明画哪种图。**
    与上面那条同构：版式库按教案里写的图名挑骨架（`chartLayoutCandidates` →
    `estimateChartKind`），写「用图表展示」这种含糊说法就认不出是哪一种，
    只能兜底给最常用的一类——而那很可能不是这一页该用的图。

    只查「认不认得出来」，不查措辞够不够具体。认出种类之后横轴纵轴那些
    由提示词约束，硬查同样会把好教案打回去重写。
  */
  if (moduleOfPageType(pageType) === 'chart-layouts') {
    if (estimateChartKind(d.visualForm) === null) {
      out.push(
        `visualForm：这是${PAGE_TYPE_LABEL[pageType]}，视觉形式里必须写明**画哪种图**，`
        + `从这几个里挑一个说：${CHART_KIND_NAMES}（现在看不出来）`,
      );
    }
  }
  return out;
}

/* ---------------- 工具 ---------------- */

function progress(step: PlanStep, label: string, done: number, total: number): PlanEvent {
  return { event: 'progress', data: { step, label, done, total } satisfies ProgressPayload<PlanStep> };
}

function correctionBlock(lines: string[]): string {
  return [
    '你上一次输出的 JSON 有以下问题，请改正后**重新输出完整的那一份 JSON**：',
    ...lines.slice(0, 10).map((l) => `- ${l}`),
    '',
    '字段名与层级不要改，只把不合契约的值换成合法的，其余部分原样保留。',
    '只输出 JSON，不要任何解释。',
  ].join('\n');
}
