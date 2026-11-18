import { setTimeout as sleep } from 'node:timers/promises';
import {
  PageIR,
  pagePromptOf,
  pageTextOf,
  specBlock,
  type LintIssue,
  type OutlinePage,
  type PageIR as Page,
  type PageText,
  type PageType,
  type Script,
  type StyleDoc,
} from '@lumen/ir-schema';
import { brandOf, hasBrand, type BrandSlot } from '@lumen/ir-schema';
import {
  CHART_SLOT_ATTR,
  PAGE_TYPE_LABEL, chartLayoutBlock, chartLayoutCandidates, forcedLayoutBlock,
  architectureLayoutBlock, architectureLayoutCandidates,
  uiLayoutBlock, uiLayoutCandidates,
  imageLayoutBlock, imageLayoutCandidates, moduleOfPageType,
  peopleLayoutBlock, peopleLayoutCandidates,
  type StudioLayout,
} from '@lumen/ir-schema';
import { isMockHtmlAcceptable, lintMockHtml } from '@lumen/render-engine';
import { isMockPlaceholder, type ProviderGateway } from '@lumen/provider-gateway';
import { run, get, all } from '../db/client.js';
import { conflict, notFound } from '../lib/errors.js';
import { newId } from '../lib/crypto.js';
import { logger } from '../lib/logger.js';
import { mapLimit, type SlotSource } from '../lib/concurrency.js';
import { MODEL_LIMITER, watchThrottle } from '../lib/model-limiter.js';
import {
  acquireGeneration, acquirePageGeneration, beatGeneration, isStopRequested, manualLeaseCount,
  manuallyTouchedSlots, releaseGeneration, releasePageGeneration,
} from '../lib/generation-lock.js';
import { clearLivePage, clearLivePages, setLivePage, type LivePage } from '../lib/generation-progress.js';
import { stripHtmlReply } from '../lib/model-reply.js';
import { billedGateway } from './billed-gateway.js';
import {
  deleteSplitContinuations, listPages, pageIR, refreshProjectCounts, requireProject, savePageGroup,
  type PageRow,
} from './project.service.js';
import {
  alignSources, dispatchScriptTask, outlineIndicesOf, planOutline, readDeckMeta, type GenerateEvent,
} from './generate.service.js';
import { ensureStyleDoc } from './style-doc.service.js';
import { syncHiddenLayouts, resolveLayoutForPrompt } from './studio-layout.service.js';

/**
 * 逐页生成 HTML。
 *
 * 与旧链路的区别：旧的是「规则先搭出 PageIR → 模型只改标题与要点 → 渲染器按版式排」，
 * 新的是「把该页类型的风格提示词 + 这一页的内容发给模型 → 模型直接产出这一页的 HTML」。
 *
 * 因此**溢出适配与页面 lint 都没有对象了**：旧链路要 `fitPage` 把装不下的内容拆到下一页，
 * 要 `lintPage` 检查容量，都是因为渲染器是固定的、内容必须迁就版式。
 * 新链路里版式由模型按内容写，它自己会取舍。
 *
 * 保留下来的是 `lintMockHtml`——它管的是「这段 HTML 能不能安全地渲染」，
 * 与内容多少无关：不许写脚本、不许引外部资源、配色只能来自这套风格、
 * 不许用会破坏固定画布的 `position: fixed`。
 */

const PAGE_SYSTEM = [
  '你是前端工程师兼视觉设计师。照着用户给的风格提示词，写出这一页的 HTML。',
  '只输出可直接运行的 HTML 片段（一个 <style> 加若干 <div>），',
  '不要任何解释，不要 Markdown 代码围栏，不要 <html>/<body> 骨架。',
  // 画布缩放由外层容器负责，页面里的脚本不会被执行（iframe 不开 allow-scripts）
  '**不要写 <script>**：画布缩放由外层容器负责，页面里不需要任何脚本。',
  '',
  /**
   * **定位一律相对画布，别用负偏移去「补」父容器的位移。**
   *
   * 风格提示词里给的坐标（left:48px、top:150px 这类）都是**相对 1920×1080 画布**的。
   * 模型常把几个区块先塞进一个自己造的容器（`.body-area` 之类）里，那个容器自己也带
   * left/top，于是它再给子元素写负偏移去抵消——**这一步算错就整块跑出画布**。
   *
   * 实测：一本 30 页的书里第 19 页的标题被写成
   * `<div class="title-group" style="position:absolute;left:-48px;top:-168px">`，
   * 它想抵消的父容器在 left:48px、top:318px。top 那一半算对了（318−168=150，正是提示词要的），
   * left 那一半把 0 写成了 −48，标题于是落到 x=0、贴死画布左缘，
   * 而同一页别的元素都在 48px——就是用户看到的「大标题错位」。
   *
   * 与其让模型去做这道减法，不如直接告诉它别做：要挪一个块，把它写成画布的直接子元素。
   */
  '画布是 1920×1080 的固定画布，**所有坐标都相对画布本身**。',
  '要挪一个块，就把它写成画布的直接子元素、直接写画布坐标；',
  '**不要把它塞进另一个已经偏移过的容器里、再用负偏移把位置补回来**——',
  '那样补错一个数字，整块就会贴到画布外面去。',
  '',
  /**
   * 图位的两种性质。**模型能明确控制的那条判据就是这个标记**——渲染层认它，也认
   * 样式里的 `object-fit: contain`（后者是给存量页面兜底的，新写的页面靠这一条）。
   * 标了才会去要透明底的主体图，没标就当普通照片。写漏了不会报错，只会在该配
   * 透明底主体图的地方配成一张普通照片——实测暖调纸感那套风格的封面就是这么坏的。
   */
  '图位要的是**透明底的主体图**时（画面里一个独立的主体，背景要能透出去；人物页的人像位也算这一类），',
  '标签要写成 `<img data-lumen-image="n" data-lumen-cutout="1">`；',
  '骨架或示例里已经这么写了的（比如人物页骨架给的人像位）照抄，不要摘掉；',
  '其余图位按普通照片写，不要加这个标记。',
  '',
  /**
   * 图表页的槽。**这一条是「模型拿 CSS 手搓柱子和方块」的唯一解药**——
   * 版式库里 20 份骨架的槽都由 `@lumen/charts` 出图，模型只要保住槽、换掉数据。
   */
  '图表页会给你一个**图表槽**：一段 `<div class="…" style="…" data-lumen-chart="宽x高">`，',
  '里面包着一段 JSON，`</div>` 收尾。',
  '**这个槽要原样留着**——图表由渲染层画，不要自己用 CSS 或 SVG 手搓柱子和方块。',
  'JSON 里的 `kind` 说明画的是哪种图，**不要改 `kind`，也不要改字段名与结构**；',
  '要改的只是里面的数字与文字，换成这一页的真实数据，条数按实际内容来（多了少了都行）。',
  '**绝对不要往 JSON 里写颜色**：配色由渲染层按当前风格填，写死色值换风格就不跟着变了。',
  '槽外面的 `data-lumen-chart="宽x高"` 是出图尺寸，也不要动。',
  '',
  '内容是用户给的，**一个字都不要改**：标题就用标题、要点就用要点，不要自己另编内容。',
  '但版式要好看——把该页类型的视觉特点做出来，该留白的地方留白，该突出的地方突出。',
].join('\n');

/**
 * 版式库对产出的**结构要求**。空数组表示没问题。
 *
 * 与 `lintMockHtml` 分开：那是「这一页合不合规」（配色、脚本、标签开合配对），
 * 住在 `@lumen/render-engine` 里、**不知道页类型**；这一条是「这一页有没有按它
 * 的版式库来写」，只有生成侧知道页类型。
 *
 * 目前只有一条：**图表页必须留图表槽**。模型很容易觉得「我自己用 CSS 画柱子更快」
 * 就把槽丢掉，丢了的后果不是报错，而是页面上出现一堆手搓的方块——
 * 版式库里 20 种图一种都用不上，用户看到的是「说好的雷达图变成了几个圆」。
 */
function layoutIssues(html: string, pageType: PageType, fellBack: boolean): LintIssue[] {
  // 降级到别的页类型时这一页已经不是图表页了，不该再要求图表槽
  if (pageType !== 'chart' || fellBack) return [];
  if (new RegExp(CHART_SLOT_ATTR, 'i').test(html)) return [];
  return [{
    rule: 'layout/missing-chart-slot',
    severity: 'error',
    message: '图表页必须留一个图表槽（<div data-lumen-chart="宽x高"> 里放数据 JSON），'
      + '不要自己用 CSS 或 SVG 画图表',
    path: 'html',
  }];
}

/**
 * 「上一版被截断」的判据。**两种失败路径都要用它**，所以抽成函数而不是各写一份正则。
 *
 * 截断有两条路会撞上：
 * - **lint 判定**：HTML 写完了但标签没闭合（`lintMockHtml` 报「这些标签没有闭合」），
 *   走 `produce` 里「带问题重写」那一次；
 * - **模型抛错**：网关那边直接报截断，走 `retryHint`。
 *
 * 一开始只补了后者，前者才是实测用户报的那条（第十页连续两次回半截 HTML），
 * 于是提示词一个字没变、重试照样再断一次。
 */
function isTruncated(issue: { message: string }): boolean {
  return /没有闭合|被截断/.test(issue.message);
}

/**
 * 截断重试要**换个说法**——原样再发一遍只会再断一次。
 *
 * 对策与「推理吃光预算」同源：**让它少写**。截断说明内容超了输出预算，
 * 而不是模型不会写；所以要点明「比上一轮少一些元素」，不能只说「重写一遍」。
 */
const TRUNCATED_HINT = [
  '另外：上一轮你的输出**写到一半就断了**，HTML 里有标签没有闭合，这一页用不了。',
  '这一轮务必**写得短一些**：只保留版式必需的骨架，元素数量比上一轮少一些，',
  '去掉可以省的装饰层与嵌套。宁可少几个元素，也不要写不完。',
  '写完之后**回头检查一遍**所有开标签都有对应的闭标签。',
].join('\n');

/**
 * 一页的时间预算：十二分钟。
 *
 * **这个数要装得下「一次完整调用 + 一次补救重写」。** 单次调用自己的上限是供应商
 * 那条 `timeoutMs`（实测配置 300 秒），而一页常常要跑两次——第一次的稿被截断了、
 * 或有不合规的地方，得带着问题重写一遍。
 *
 * 原先这里定的是**六分钟**，正好等于单次耗时的 p99（360 秒），结果实测下来
 * **重写几乎永远拿不到预算**：日志里连着几条「重写这一版没回来，改用第一版」，
 * 那页于是带着截断的 HTML 落库、判成失败，用户看到的是
 * 「本页生成失败：这些标签没有闭合（片段像是被截断了）」——明明差一步就能救回来。
 * 修「一直转圈」不能顺手把「重试」也一起掐掉。
 *
 * 十二分钟 ≈ 两次 300 秒上限 + 一点余量。它仍然是硬上限（这正是它存在的理由：
 * 没有上限的话，四层重试相乘最坏能跑到一小时），只是把正常页那两次调用装进去了。
 *
 * 它也**不再等于「让用户干等」**：生成期间界面上每秒报一次
 * 「第 N 页 · 正在调用模型写这一页（已等 M 秒）」，底栏常驻「停止」。
 *
 * **只对整本生成生效**（单页重生成不传 `budgetMs`）：那条路上用户正盯着这一页，
 * 也随时能点停止，掐掉它反而会把一次快要成功的生成白白扔掉。
 */
export const PAGE_BUDGET_MS = 12 * 60 * 1000;

/**
 * 预算耗尽时的那句话。
 *
 * 它会作为 `degradeReason` 一路走到工作台上（那一格会把它直接摆出来），
 * 所以是句人话、并且说清下一步——用户看到「失败」时最想知道的就是「这页该怎么办」。
 */
const OUT_OF_BUDGET = '这一页等太久了，先跳过它；稍后可以单独重生成';

export interface PageHtmlInput {
  projectId: string;
  tenantId: string;
  userId: string;
  outline: OutlinePage;
  /** 这套风格。提示词从它的 pagePrompts 里取 */
  doc: StyleDoc;
  pageIndex: number;
  totalPages: number;
  /** 从项目原文里切给这一页的段落 */
  sourceText?: string;
  /** 整份大纲，目录页要拿它列章节 */
  outlineAll?: { pageType: string; title: string }[];
  /** 重新生成已有页时传，沿用同一个 pageId */
  pageId?: string;
  /** 该页原有的讲稿。带 edited 标记时原样保留 */
  existingScript?: Script;
  /** 演示用的注入点，测试里换成假的网关 */
  gateway?: ProviderGateway;
  /** 项目品牌。不传就是「没有品牌」，提示词里一个字都不提 */
  brand?: BrandSlot;
  /**
   * 走到哪一步了，一句中文，直接给界面显示。
   *
   * 一页要跑几十秒到几分钟，这期间没有任何东西可看，界面只能一直转圈——
   * 用户分不清「在跑」和「卡死了」。单页重生成因此改成了流式，回调就挂在这里。
   */
  onProgress?: (label: string) => void;
  /**
   * 这一页的时间预算（毫秒），默认 `PAGE_BUDGET_MS`。
   *
   * 给整本生成用：它并发跑若干页，某页卡住时整本都出不来，所以**一页必须有硬上限**。
   * 预算耗尽那页按「没生成出来」落库并写明原因，整本继续往下走——用户能单独重生成它，
   * 而不是干等一个不知何时结束的转圈。
   *
   * 测试里也用它把「等六分钟」压成毫秒级。
   */
  budgetMs?: number;
  /**
   * 这一页占的是哪个大纲槽位，用来把续租打在**正确的租约**上。
   *
   * 手动单页那两条路（重跑这一页 / 优先生成）要传：它们拿的是那一格的手动租约。
   * 整本生成**不传**——它拿的是整本那把，心跳该打在那儿。
   *
   * 分得清才有用：一律打给「这个项目」的话，一条卡死的整本会被隔壁手动页的心跳
   * 一直续着，15 分钟的租期就永远到不了点（见 `generation-lock.ts` 顶部的说明）。
   */
  leaseSlot?: number;
  /**
   * 指定这一页用哪一份版式骨架，不走候选筛选。工作台的「换排版」用它。
   *
   * **只有这一条路会传**：整本生成与「优先生成本页」都不传，行为逐字不变。
   * 用户手动套上去的骨架**不参与自动挑版式**（见 `studio-layout.service.ts` 顶部的铁律），
   * 所以这里必须显式传进来，而不是让生成链路自己去库里找。
   */
  forcedLayout?: StudioLayout;
  /**
   * 这一页上现有的文字，**换排版 / 转图文页时拿它当内容源**，替掉教案那一份
   * （见 `contentBrief` 与下面 `title` 的构造）。取自 `pageTextOf(page)`。
   *
   * 只在带 `forcedLayout` 的那条路上传：普通重生成是「按教案重写这一页」，
   * 该用教案的内容；而换排版的承诺是「文字、要点、讲稿都不变，只换版面结构」。
   */
  keepText?: PageText;
}

export interface PageHtmlResult {
  page: Page;
  issues: LintIssue[];
  /** 非空表示走了回退路径，页面上会如实标出来 */
  degradeReason: string;
}

/**
 * 这套风格给这个页类型**绑定**了哪一份骨架（风格库里「换默认版式」的产物）。没有就回 undefined。
 *
 * **只认这一页类型自己那条提示词**，不做降级：`promptFor` 降级到文字页时，那条提示词的
 * `layoutId` 是给文字页挑的，套到图表页上排出来是个四不像——与「页类型降级时不给骨架」
 * 同一条理由。`pagePrompts` 是 Record，取不到就是没绑。
 *
 * 认不出的 id（骨架被删了、自建的被删了）回 undefined 而不是抛：绑定的作用只是
 * 「别自动挑、就用这一份」，它失效了最该发生的是退回自动候选，而不是让这一页生成不出来。
 */
function boundLayoutOf(doc: StyleDoc, pageType: PageType): StudioLayout | undefined {
  const id = doc.pagePrompts[pageType]?.layoutId ?? '';
  return id ? resolveLayoutForPrompt(id) ?? undefined : undefined;
}

export async function generatePageHtml(input: PageHtmlInput): Promise<PageHtmlResult> {
  /**
   * **兜底网关必须计费。**
   *
   * 这里原先回落到 `buildGateway()`——它不带 `onUsage`，于是所有**没显式传网关**的
   * 调用点都静默不记账。而没传网关的恰恰是最常用的两个入口：单页重生成与
   * 「优先生成本页」（见 `routes/projects.ts`）。实测踩过：一页重跑成功落库、
   * `pages` 里躺着新内容，`usage_records` 里一条都没有。
   *
   * 出页面是全链路最贵的一类调用（一页两三千 token 输入、一两万输出），
   * 漏记不会报错，只会让整类开销从账上消失。默认值就取 `billedGateway`，
   * 这样新加的调用点想漏也漏不掉；`input.gateway` 只在测试里注入假网关。
   */
  const gateway = watchThrottle(input.gateway ?? billedGateway(input.tenantId, input.userId));
  /**
   * 这一页的截止时刻。**在进任何一次模型调用之前就算好**，整个 `generatePageHtml`
   * （包括下面那两层重试）共用它——分次算的话，每层各自「再加六分钟」，
   * 预算就不是上限了。
   */
  const deadline = input.budgetMs === undefined ? undefined : Date.now() + input.budgetMs;
  const pageType = input.outline.pageType;
  const chosen = promptFor(input.doc, pageType);

  if (!chosen) {
    // 这套风格一个页类型都没写过提示词，没法生成。与其产出一页空白，
    // 不如明确报出来——空白的页面用户看不出哪里错了
    return degrade(
      input, `这套风格还没有写过任何页类型的提示词，无法生成「${pageType}」`,
    );
  }

  const brief = contentBrief(input);
  let html = '';
  let issues: LintIssue[] = [];
  let degradeReason = chosen.fellBack
    ? `这套风格没有写「${pageType}」的提示词，按「${chosen.used}` + '」的版式生成'
    : '';

  /**
   * 人物页与图片排版页各有十几种版式，让模型每次自由发挥是排不出该有的样子的。
   * 这里按这一页的内容筛出几个候选（规则见各自的 `*LayoutCandidates`），
   * 把它们的骨架当示例塞进提示词。
   *
   * **只带候选组，不带全部**：一次多带约 4–8KB，而不是 16–32KB。
   * **不多一次模型调用**——挑版式与写 HTML 是同一次调用里的两件事。
   *
   * 用户在工作台手动指定了版式时（`forcedLayout`）走另一条：只带那一份，
   * 措辞也从「挑一个」换成「就这一种」。两者是同一个位置上的互斥分支。
   */
  const layoutInput = {
    title: input.outline.title,
    claim: input.outline.claim,
    points: input.outline.points,
    // `visualForm` 在 `OutlinePage` 上是 optional（老数据运行时是 undefined），
    // 而规则函数要的是 `string`——这里收一下，不要往规则里塞 undefined
    visualForm: input.outline.visualForm ?? '',
  };
  /*
    候选池要排除已下架的内置版式。名单在库里，而候选函数在 `@lumen/ir-schema`
    里、拿不到库句柄，所以每次生成前灌一次（`hidden_builtin_layouts` 只有几十行）。
    **用户手动指定的那份不受影响**——`forcedLayout` 那条分支不查名单，
    下架只是「别再自动挑中」，不是「这一份不许用」。
  */
  syncHiddenLayouts();
  /*
    **按 `moduleOfPageType` 选库，不再写死页类型字符串。**
    同一个映射写两份的代价已经吃过一次：弹窗那份走 `moduleOfPageType`，这里当初写的是
    `=== 'gallery'`，于是图文页能手动换排版、生成时却拿不到版式库，而没有任何报错——
    只是模型又回到每次自由发挥。以后加页类型只动 `STUDIO_MODULE_PAGE_TYPE`。

    页类型名字要传进说明块：这个库同时服务图文页与图片排版页，叫错会直接影响
    模型怎么取舍内容（图文页以文字为主、图片排版页以图为主）。

    页类型也要传进候选函数。它平时按估计张数分组，估不出张数时才看页类型——
    而教案没写张数时就是估不出。这时图文页必须兜到「一张图配一段文字」那一组：
    兜到多图会给出一堆「九张照片墙」，与同一段提示词开头那句「这一页是图文页」
    自相矛盾，模型索性整段骨架都不用，这一页退回自由发挥。
  */
  const pageLabel = PAGE_TYPE_LABEL[pageType];
  const moduleId = moduleOfPageType(pageType);
  /**
   * 这一页用哪一份骨架。**用户当场指定的压过风格里绑定的**：
   * 工作台的「换排版」是「就这一次换成这份」，风格库的「换默认版式」是「以后都按这份」，
   * 前者更近、更明确，所以它优先。都没有才走自动候选。
   *
   * `input.forcedLayout` 那条路还会带上 `keepText`（文字不动、只换版面），
   * 绑定这条路不带——整本生成时这一页本来就没有「现有文字」可言。
   */
  const boundLayout = input.forcedLayout ?? boundLayoutOf(input.doc, pageType);
  const layoutBlock = boundLayout
    ? forcedLayoutBlock(boundLayout, pageLabel)
    /*
      **页类型降级时不给版式骨架。** 风格没写这个页类型的提示词时，
      `promptFor` 会退到文字页的提示词——这时再塞一份「图表页 / 人物页 / 图片排版页」
      的骨架，等于一边让模型写文字页、一边给它一张完全对不上的版面，
      它会写出个四不像。降级本身就是「这一页按别的版式来」，骨架跟着一起降才对。

      用户手挑的那份（`forcedLayout`）与风格里绑定的那份都不受影响：
      前者是他明确要的，后者只可能挂在这一页类型自己的提示词上（见 `boundLayoutOf`）。
    */
    : chosen.fellBack
      ? ''
      : moduleId === 'people-layouts'
        ? peopleLayoutBlock(peopleLayoutCandidates(layoutInput))
        : moduleId === 'image-layouts'
          ? imageLayoutBlock(imageLayoutCandidates(layoutInput, pageType), pageLabel)
          : moduleId === 'chart-layouts'
            // 图表页按「教案说画哪种图」挑候选，不看张数——它没有图位
            ? chartLayoutBlock(chartLayoutCandidates(layoutInput), pageLabel)
            : moduleId === 'ui-layouts'
              // 界面页按「教案说用哪台设备」挑候选；教案里那句话由 LESSON_TYPE_RULE.ui 要求
              ? uiLayoutBlock(uiLayoutCandidates(layoutInput), pageLabel)
              : moduleId === 'architecture-layouts'
                // 架构页按「教案说是哪种结构」挑候选；教案里那句话由 LESSON_TYPE_RULE.architecture 要求
                ? architectureLayoutBlock(architectureLayoutCandidates(layoutInput), pageLabel)
                : '';

  /**
   * 一次模型调用，**套上这一页的最后期限**。
   *
   * 光把 `deadline` 传给网关不够：那是「请求方与执行方之间的约定」，守约的是网关实现，
   * 而这一层等不起一个不守约的实现（测试里的假网关，或以后换一家）。所以这里再包一道
   * race——到点就抛，页面层立刻收场落库，那个请求随它去（真网关那头自己也会超时断开）。
   *
   * 有了它，「一页最多跑多久」这句话才在**这一层**成立，而不是依赖下面的配合。
   */
  const guarded = async (ask: string): Promise<string> => {
    const p = callModel(gateway, chosen.prompt, input.doc, ask, input.brand, layoutBlock, deadline);
    if (deadline === undefined) return p;
    const left = deadline - Date.now();
    if (left <= 0) throw new Error(OUT_OF_BUDGET);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        p,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(OUT_OF_BUDGET)), left);
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      // 这一路不等它了，但它还在天上——先挂个 catch，免得变成 unhandled rejection
      void p.catch(() => undefined);
    }
  };

  /**
   * 出一次稿：调模型 → lint → 不合规就带着问题重写一次。
   *
   * **只负责出稿，不负责重试**：抛出来的错误（模型空转、网络断）由下面的循环决定重不重试。
   * 这样「重试」这件事只有一处，两种失败（抛错、不合规）不会各写一套。
   */
  const produce = async (hint = ''): Promise<{ html: string; issues: LintIssue[] }> => {
    const ask = hint ? `${brief}\n\n---\n${hint}` : brief;
    // 一次模型调用可以跑五分钟，这是这条链路上最长的一段等待。续租点就放在这里：
    // 一个真在跑的运行每隔几分钟必有一次，而卡死的那种一次都不会有
    beatGeneration(input.projectId, input.leaseSlot);
    input.onProgress?.('正在调用模型写这一页');
    const first = await guarded(ask);
    const firstIssues = [...lintMockHtml(first, input.doc.palette), ...layoutIssues(first, pageType, chosen.fellBack)];
    if (isMockHtmlAcceptable(firstIssues)) return { html: first, issues: firstIssues };

    // 带问题重试一次。生成一页要花不少时间，一次不合规就放弃太浪费
    const errors = firstIssues.filter((i) => i.severity === 'error');
    const complaints = errors.map((i) => `- ${i.message}`).join('\n');
    // 截断的那一次不能只把原话再发一遍——模型会照着同样的篇幅再断一次，
    // 于是这一页永远出不来。得额外告诉它「写短些」（见 `TRUNCATED_HINT`）
    const truncation = errors.some(isTruncated) ? `\n\n${TRUNCATED_HINT}` : '';
    beatGeneration(input.projectId, input.leaseSlot);
    input.onProgress?.('上一版有不合规的地方，正在重写');
    /**
     * **重写这一轮失败不能把第一次的稿一起丢掉。**
     *
     * 走到这里说明第一版已经拿到手了，只是有几处不合规。而重写这一步最容易
     * 撞上的就是时间预算见底——那时手上明明有一份完整的 HTML，却因为「重写没回来」
     * 整页判失败，白等一场。所以这里吞掉重写的异常，退回第一版：
     * 它带着那几条 error 落库，页面标 `failed` 并写明哪里不合规，用户可以单独重生成。
     */
    let retry = '';
    let retryIssues: LintIssue[] = [];
    try {
      retry = await guarded(`${ask}\n\n---\n上一版有这些问题，请重写：\n${complaints}${truncation}`);
      retryIssues = [...lintMockHtml(retry, input.doc.palette), ...layoutIssues(retry, pageType, chosen.fellBack)];
    } catch (err) {
      logger.warn('重写这一版没回来，改用第一版', {
        projectId: input.projectId,
        pageType,
        err: err instanceof Error ? err.message : String(err),
      });
    }
    // 两次都不合规时留第二次的：问题可能更少，且它是模型在知道问题之后写的。
    // 第二次回的是空串时留第一次的——空串连 lint 都过不了，留着只会变成空白页
    return retry.trim().length > 0 ? { html: retry, issues: retryIssues } : { html: first, issues: firstIssues };
  };

  /**
   * 上一轮空转时，第二次要**换一种问法**，不能原样再发一遍。
   *
   * 原样再发只是再抽一次签。而「推理吃光预算」这个失败是有明确对策的：
   * 模型把预算花在推演版式上，那就直接告诉它别推演——提示词里尺寸已经给全了，
   * 它不需要自己权衡。仓库里 `style-spec.service.ts` 撞过同一款失败
   * （「只产出了 43368 字推理内容，正文为空」），当时的解法是缩小输入；
   * 这里输入缩不了（一页就这么多内容），改从「让它少想」入手。
   */
  const retryHint = (err: string): string => {
    if (/推理内容|正文为空|max_tokens/i.test(err)) {
      return [
        '上一轮你花了太多篇幅推演版式，把输出预算耗光了，正文一个字都没写出来。',
        '这一轮**直接写 HTML**：不要逐条推演尺寸、不要比较方案、不要复述要求，',
        '照着上面给的数值写出来就行。把预算留给 HTML 本身。',
      ].join('\n');
    }
    /**
     * **输出被截断**（标签或样式表没闭合）。
     *
     * 这一条是补上的，原先漏了——`retryHint` 只认「正文为空」那一种，
     * 而截断的报错是「这些标签没有闭合（片段像是被截断了）」，**不匹配**，
     * 于是重试拿的是**一模一样的提示词**，模型自然再截断一次，
     * 一页就永远卡在那里生成不出来。实测用户报的「第十页生成失败后就很难往下继续」
     * 就是这个：那一页连着两次都回了一截没写完的 HTML。
     *
     * 这条路径（模型**抛错**）和 lint 判定那条（走 `produce` 的重写）用的是同一段提示，
     * 所以文案在 `TRUNCATED_HINT` 里，不在这里再抄一份。
     */
    if (/没有闭合|被截断/i.test(err)) return TRUNCATED_HINT;
    return '';
  };

  /**
   * **模型空转是随机的，再试一次比直接判失败划算。**
   *
   * 实测同一页连着重跑两次：一次回的是半截 HTML（写到 `<style>…html,body` 就断了），
   * 一次推理把预算全吃光、正文是空串（网关报「模型只产出了 127656 字推理内容，正文为空」）。
   * 两次失败都不带任何「这一页有问题」的信息——纯粹是模型这一轮抽到了什么。
   * 这种失败重试一次的成功率不低，而直接判失败要用户自己再点一次「重新生成」，白等五分钟。
   *
   * **不增加最坏情况的调用次数**：第一次就抛错的话，那次「不合规重写」根本没跑到，
   * 所以「2 次调用」这个上界和改动前一样。
   */
  let produced: { html: string; issues: LintIssue[] } | null = null;
  let lastError = '';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      if (attempt > 1) input.onProgress?.('模型这一轮没写出东西，换个说法重试一次');
      produced = await produce(attempt === 1 ? '' : retryHint(lastError));
      break;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      // 限流（整条降级链都挂了的那种）由 `watchThrottle` 在网关外层认，
      // 这里拿到的错已经转手过一层，判不准。见 `lib/model-limiter.ts`
      logger.warn(attempt === 1 ? '逐页生成失败，重试一次' : '逐页生成失败', {
        projectId: input.projectId, pageType, attempt, err: lastError,
      });
    }
  }
  if (!produced) return degrade(input, `生成失败（试了两次）：${lastError}`);
  html = produced.html;
  issues = produced.issues;

  if (html.trim().length === 0) {
    return degrade(input, '模型没有产出内容');
  }

  const blocked = issues.some((i) => i.severity === 'error');
  // 降级原因要在构造页面**之前**算好——放在之后的话，落库的那一份不带它，
  // 工作台上只显示「失败」却不说为什么
  if (blocked) {
    const errors = issues.filter((i) => i.severity === 'error');
    degradeReason = `生成的内容有 ${errors.length} 处不合规：${errors.slice(0, 2).map((i) => i.message).join('；')}`;
  }

  const page = PageIR.parse({
    pageId: input.pageId ?? newId('pg'),
    pageType,
    // 版式由模型写死在 HTML 里，这里留空——旧渲染器读它，新链路不读
    layoutVariant: '',
    /*
      用户在「功能库」挑的那份骨架要**记在页面上**：画布上生成中的那条动画要画
      「这一页将要长成的框架」，刷新之后也得答得出来用的是哪份（挑的时候它只进提示词）。
      没挑就是空串；**下一次不带强制骨架的生成会把它清掉**——那时这一页用的
      是风格里绑定的那份，留着它就是在说一件不再成立的事。见 `PageIR.studioLayoutId`。
    */
    studioLayoutId: input.forcedLayout?.id ?? '',
    /**
     * 换排版时 `title` 也要跟着换成**页面上现有的那一份**。
     *
     * 只换 HTML 不换这里的话，右栏头部显示的是教案的标题、画布上是页面的标题——
     * 实测转完之后右栏写着「关键数字」、画布上写着「FDE做什么：从模糊诉求到可复用能力」，
     * 两处对不上，用户不知道信哪个。
     */
    title: {
      main: input.keepText?.main || input.outline.title,
      sub: input.keepText?.sub || input.outline.claim,
      eyebrow: input.keepText?.eyebrow || input.outline.section,
      accentWords: [],
    },
    blocks: [],
    html,
    footer: { source: '', pageNo: input.pageIndex + 1 },
    status: blocked ? 'failed' : 'ready',
    ...(input.existingScript?.edited ? { script: input.existingScript } : {}),
    ...(degradeReason ? { degradeReason } : {}),
  });

  return { page, issues, degradeReason };
}

/* ---------------- 内部 ---------------- */

interface ChosenPrompt {
  prompt: string;
  used: PageType;
  fellBack: boolean;
}

/**
 * 取这一页要用的提示词。
 *
 * 这套风格没写过这个页类型时，退到 `text`——文字页的版式最通用，
 * 装标题加要点不会太离谱。连 `text` 都没有就返回 null，由调用方明确报错。
 */
function promptFor(doc: StyleDoc, pageType: PageType): ChosenPrompt | null {
  const exact = pagePromptOf(doc, pageType);
  if (exact) return { prompt: exact.prompt, used: pageType, fellBack: false };
  const fallback = pagePromptOf(doc, 'text');
  if (fallback) return { prompt: fallback.prompt, used: 'text', fellBack: true };
  return null;
}

/**
 * 把这一页要写的内容拼成一段文本。
 *
 * 只给内容、不给版式——版式在那条风格提示词里。这样两件事各管各的：
 * 换风格只换提示词，换内容只换这段。
 */
function contentBrief(input: PageHtmlInput): string {
  const { outline, pageIndex, totalPages } = input;
  const lines: string[] = ['本页内容：', `- 页码：第 ${pageIndex + 1} 页，共 ${totalPages} 页`];

  if (outline.section) lines.push(`- 所属章节：${outline.section}`);

  /**
   * 换排版 / 转图文页时用**页面上现有的文字**，不用教案那一份。
   *
   * 两者经常对不上：实测一个项目里，第 5 页的页面上写着「FDE做什么：从模糊诉求到
   * 可复用能力」加两条要点，而教案第 5 条写的是「关键数字」、要点为空——拿教案当
   * 内容源，转换后页面上原有的字会全部消失，而那正是用户要留下的东西。
   * 换排版的承诺既然是「文字不变、只换版面结构」，就得拿页面上真实的文字去排。
   */
  if (input.keepText && (input.keepText.main || input.keepText.lines.length > 0)) {
    lines.push('- 这一页现有的文字（**一条都不能少、不能改、不能合并**）：');
    const keep = [
      input.keepText.eyebrow, input.keepText.main, input.keepText.sub, ...input.keepText.lines,
    ];
    for (const t of keep) {
      if (t) lines.push(`  · ${t}`);
    }
  } else {
    lines.push(`- 标题：${outline.title}`);
    if (outline.claim) lines.push(`- 这一页要讲清的一句话：${outline.claim}`);
    if (outline.points.length > 0) {
      lines.push('- 要点：');
      for (const p of outline.points) lines.push(`  · ${p}`);
    }
  }

  // 教案给的视觉形式是**明确要求**，不是让模型自己猜版式
  if (outline.visualForm) lines.push(`- 视觉形式：${outline.visualForm}`);
  // `designNote` **不注入**：那是写给人看的「为什么这么排」，注进去只会稀释真正的要求

  // 目录页的条目来自整份大纲，不是这一页自己的要点
  if (outline.pageType === 'toc' && input.outlineAll) {
    lines.push('- 目录条目（照这个顺序列，页码用括号里的）：');
    for (const [i, s] of input.outlineAll.entries()) {
      if (s.pageType === 'cover' || s.pageType === 'end' || s.pageType === 'toc') continue;
      lines.push(`  · ${s.title}（第 ${i + 1} 页）`);
    }
  }

  if (input.sourceText) {
    /**
     * 原文的要求是**两条，不是一条**：既要不漏，又不要照抄。
     *
     * 原先只写了后半句（「不要整段照搬」），读起来像是「随便挑点用用」——于是详细
     * 需求里的细节会被整段略过，而用户是照着那份需求提的，漏了就等于没做。
     * 但反过来只要求「全用上」也不行：一页放不下那么多字，而且 PPT 不该是文档摘抄。
     * 所以把两条并排写死，让它去压缩而不是去省略。
     */
    lines.push(
      '',
      '这一页对应的原文。**里面的具体事实、数字、专有名词、结论都要用上，一条都不要漏**——'
      + '用户是照着它提的需求，漏掉就等于这一页没写。',
      '但**不要整段照抄**：按这一页的版式重新组织措辞，该拆成要点的拆成要点、'
      + '该压成一句话的压成一句话。要压缩，不要省略。',
      input.sourceText,
    );
  }
  lines.push('', '请按上面的风格提示词，把这段内容排成这一页的 HTML。');
  return lines.join('\n');
}

/**
 * 品牌槽位那一段提示词。**只在项目确实有品牌时才拼进去**——没传 logo 也没填名字时
 * 一个字都不提，生成结果与改动前逐字一致。
 *
 * 而且**只说那些真有值的槽位**：`fillBrandSlots` 会把没有值的槽位元素**整条删掉**
 * （`slotValue` 返回 `null` 那一支），所以让模型为一个「等下会被删掉」的元素留位置，
 * 等于让它按三格排版、最后只剩两格。只提有的那几个，模型排出来的版才和成品一致。
 *
 * 说「留空即可」而不是「写上品牌名」：内容由渲染时注入（见 `fillBrandSlots`），
 * 模型自己写一遍只会产生第二份真相，用户改了名字它不会跟着变。
 */
function brandBlock(brand: BrandSlot): string {
  const slots = [
    brand.svg || brand.imageSrc
      ? '- 标识位置：<span class="brand-mark" data-lumen-brand="logo"></span>'
      : '',
    brand.name ? '- 品牌名：<span class="brand-name" data-lumen-brand="name"></span>' : '',
    brand.tagline ? '- 标语：<span class="brand-sub" data-lumen-brand="tagline"></span>' : '',
  ].filter((line) => line !== '');

  return [
    '---',
    '这一本有品牌标识，页眉必须按下面来写：',
    '',
    ...slots,
    '',
    '**上面这些位置不要自己画图形、不要写 <img>、不要填文字**，留空即可，系统会填进去。',
    '页眉的几何：高度与标识尺寸按上面「视觉规范」里那条页眉品牌标识来；',
    '规范里没写、或写着「不用页眉」时，按高 88px、标识 34px、左右边距 96px 来。',
  ].join('\n');
}

/**
 * 版式骨架与风格提示词的**优先级声明**。
 *
 * 每套风格的页类型提示词本身就是一份完整版式规格——12 列网格、每张跨几列、
 * 像素级位置、连 `figure`/`figcaption` 的结构都写死了。版式库是另一份。两份都给，
 * 模型会挑更具体的那个：**实测过，喂了三个候选（拱形带 / 斜切条 / 等距屏幕），
 * 产出仍是一套普通的等宽网格，候选的结构特征一个都没出现**。
 *
 * 光把措辞从「用这套风格的视觉语言写出来」改成「照版式结构排」不够——那是劝，
 * 不是规则。这里把话说死：版面结构让位给骨架，风格提示词的其余部分照旧。
 * 不写这一句，版式库等于白注入。
 *
 * **判据只能按「描述的是什么」，不能指名小节。** 早先写的是「风格提示词里的
 * 『版面分区 / 画面分区 / 网格』那一节，按候选来」——而识别出来的风格提示词通篇是
 * 编号的「视觉与排版要求」，没有哪一节叫这个名字，那句话指不到任何东西。
 * 实测：一页图文页拿到了四份单图位骨架，产出的 HTML 里一个图位都没有，
 * 整页照着风格提示词里那套「左文字 52% + 右球体 + 底部三栏卡」排了下来。
 *
 * 放在这里而不是各自拼进 `*LayoutBlock`：两份规格是在这个函数里碰面的，
 * 优先级就该写在碰面的地方，以后再加第三个版式库也不用各写一遍。
 */
const LAYOUT_PRECEDENCE = [
  '**这一页的版面结构以下面这份骨架为准。**',
  '风格提示词里凡是描述版面结构的——分区、栏数、跨列数、各块的位置与尺寸——一律以骨架为准；',
  '骨架说几张图、怎么摆、谁大谁小、有没有弧形或斜切，就照那个排。',
  '配色、字体、质感、文案语气、语义结构仍然完全照风格提示词来。',
].join('\n');

async function callModel(
  gateway: ProviderGateway,
  prompt: string,
  doc: StyleDoc,
  content: string,
  brand?: BrandSlot,
  layoutBlock = '',
  deadline?: number,
): Promise<string> {
  const res = await gateway.text({
    taskType: 'html_codegen',
    /**
     * 预算要**够推理 + 正文**，因为 max_tokens 管的是两者之和。
     *
     * **这个数已经顶到超时允许的上限了，不要再往上调。** 实测供应商那边
     * 139 token/秒、`timeoutMs` 300 秒，两者相乘约 4.2 万——40000 正好卡在这个位置。
     * 抬到 64000 的话，一次调用要 460 秒，会在 300 秒被 `AbortSignal.timeout` 掐掉，
     * 把「干净地回一个空正文、还能重试」变成「超时中止、白等五分钟」。
     * 真要抬预算，得**同时**把供应商的 `timeoutMs` 放宽（管理后台「模型」那一页可以改）。
     *
     * 所以这一页那种「推理吃光预算」的失败改从**提示词**下手：重试时明确叫它别推演版式，
     * 见 `retryHint`。仓库里 `style-spec.service.ts` 撞过同一款失败，当时的解法是
     * 缩小输入让模型少想——同一条思路。
     */
    maxTokens: 40000,
    temperature: 0.4,
    system: PAGE_SYSTEM,
    // 这一页的时间上限，一路贯到供应商的重试与降级链上。没给就是「不限时」
    ...(deadline === undefined ? {} : { deadline }),
    messages: [{
      role: 'user',
      content: [
        prompt,
        '',
        '---',
        paletteBlockOf(doc),
        // 视觉规范与配色并列注入。**这是「统一」真正落地的地方**——
        // 只改写提示词的话，统一只对存量样机生效，之后生成的页又会各写各的
        ...(doc.spec ? ['', '---', specBlock(doc.spec)] : []),
        ...(layoutBlock ? ['', '---', LAYOUT_PRECEDENCE, '', layoutBlock] : []),
        ...(brand ? ['', brandBlock(brand)] : []),
        '',
        '---',
        content,
      ].join('\n'),
    }],
  });

  /**
   * **降级到内置 Mock 时拿到的是它的占位说明文字，不是一页 HTML。**
   *
   * 内置 Mock 对 `html_codegen` 的兜底是一段约一百四十字的说明（含固定标记句），
   * 它**过得了 `lintMockHtml`**——没有色值、没有 script、没有外部资源，
   * 只差一条 `no-tokens` 的 warning，而 warning 不算阻断。
   * 不加这道判据，它会一路当成真页面落库、还标成 `ready`：
   * 界面上那一格看着是绿的，打开来是一段「本回复由内置 Mock 网关生成」。
   * 实测踩过，一个项目 15 页里有 3 页是这么来的。
   *
   * **不重试**：走到 Mock 说明网关已经把主模型与整条降级链都试过一遍了，
   * 紧接着再发一次只是再等一个主模型的超时（实测一次六分钟），
   * 换回来的还是同一段占位文字。这里抛出去，由调用方按「这一页没生成出来」
   * 如实处理——页面标成 `failed` 并写明原因，用户能单独重生成，
   * 而不是拿到一页看着成功、其实是占位说明的东西。
   */
  if (isMockPlaceholder(res.text)) {
    throw new Error(
      res.degraded
        ? `主模型失败后降级到了内置 Mock（${res.degradeReason}）`
        : '当前 html_codegen 路由指向内置 Mock，它给不出一页 HTML',
    );
  }

  /**
   * 主模型 429、降级到备用模型才拿到结果——这是并发压到上限的信号，
   * 由 `watchThrottle` 包在网关外层统一观察，这里不用管。见 `lib/model-limiter.ts`。
   */

  const html = stripHtmlReply(res.text);

  /**
   * 一页 HTML 至少要有一个标签。
   *
   * 上面那条挡的是内置 Mock 那一段；这一条挡的是**任何**「回了一段散文而不是页面」
   * 的情形——换供应商、换路由、模型抽风，都可能给回一段纯文字。
   * 判据故意定得很松（只要有一个标签就算过），它拦的不是排版问题，
   * 是「这根本不是一页」。
   */
  if (!/<[a-z][^>]*>/i.test(html)) {
    throw new Error(`模型没有产出 HTML（回的是：${html.slice(0, 60)}）`);
  }

  return html;
}

/**
 * 把配色明写出来。
 *
 * 与识别那边同理：提示词里不一定写了色值（尤其是推导出来的那几条只写「沿用已有配色」），
 * 不在这里钉死，同一本 deck 的页面会各是各的调子。
 */
function paletteBlockOf(doc: StyleDoc): string {
  const p = doc.palette;
  return [
    '这套风格的配色，必须严格使用（写在 :root 里，页面里所有颜色都引用这些变量）：',
    `--bg: ${p.bg}; --surface: ${p.surface}; --text: ${p.text}; --muted: ${p.muted};`,
    `--accent: ${p.accent}; --brand: ${p.brand}; --border: ${p.border};`,
    '底色必须是 --bg，不要引入这套配色之外的颜色。',
  ].join('\n');
}

/** 生成不出来时给一页「说清楚为什么」的占位，而不是空白 */
function degrade(input: PageHtmlInput, reason: string): PageHtmlResult {
  const page = PageIR.parse({
    pageId: input.pageId ?? newId('pg'),
    pageType: input.outline.pageType,
    layoutVariant: '',
    // 与正常那条路同一口径：换排版时标题用页面上现有的，不用教案的
    title: {
      main: input.keepText?.main || input.outline.title,
      sub: input.keepText?.sub || input.outline.claim,
      eyebrow: input.keepText?.eyebrow || input.outline.section,
      accentWords: [],
    },
    blocks: [],
    footer: { source: '', pageNo: input.pageIndex + 1 },
    status: 'failed',
    degradeReason: reason,
  });
  return { page, issues: [], degradeReason: reason };
}

/* ---------------- 整本生成 ---------------- */

/** 让出事件循环，保证 SSE 事件能被及时刷出 */
const flush = () => new Promise<void>((r) => setImmediate(r));

/**
 * 并发跑的时候多久往客户端报一次进度。
 *
 * 一秒是「够勤」与「够省」的交界：用户能看着秒数往下走，而一本 30 页的书跑
 * 二十分钟也只多出千余条小事件（每条几十字节，且同一页同一句只发一次）。
 */
const PROGRESS_TICK_MS = 1000;

/**
 * 逐页生成的并发度（**页**，不是模型调用）。
 *
 * 数字与理由都在 `MODEL_LIMITER` 上——**限流是按 API key 算的**，
 * 生成页面、写提示词、出样机、自检用的是同一个 key，所以并发上限全局只有一个，
 * 不能每处各拿一个。见 `lib/model-limiter.ts`。
 *
 * 这里曾经是本文件自己的一个常量（3，后来 6），改成共享的之后，
 * 其余几条链路撞限流也会让页面生成跟着收敛——这是对的，配额本来就那么大。
 */

export interface HtmlGenerateOptions {
  projectId: string;
  tenantId: string;
  userId: string;
  /** 清空已有页面后全量重生成 */
  regenerate?: boolean;
  /**
   * 一页的时间预算，默认 `PAGE_BUDGET_MS`（十二分钟）。
   *
   * 只在测试里改：把「等六分钟」压成毫秒级，才验得动「卡住的那页到点就落库、
   * 让后面已完成的页涌出来」这条行为。
   */
  budgetMs?: number;
  /** 测试用的注入点 */
  gateway?: ProviderGateway;
}

/**
 * 整本生成。与旧 `runGeneration` 同一套事件，只是逐页产出的是 HTML。
 *
 * 三处与旧链路不同：
 * - 风格取 `StyleDoc`（每页一条提示词），不是旧的 `StylePack`；
 * - **没有拆页**：旧链路靠 `fitPage` 把装不下的内容拆到下一页，是因为渲染器固定、
 *   内容必须迁就版式。现在版式由模型按内容写，它自己取舍，所以一页大纲就是一页；
 * - 单页失败不中断整本（沿用旧约定），失败的那页照样落库并带 `degradeReason`，
 *   用户能在工作台上看到是哪一页、为什么。
 *
 * 外面这层只管生成权，跑完（或被关掉）就放掉；生成本身在 `runHtmlGenerationInner`。
 */
export async function* runHtmlGeneration(opts: HtmlGenerateOptions): AsyncGenerator<GenerateEvent> {
  acquireGeneration(opts.projectId, '生成整本页面');
  try {
    yield* runHtmlGenerationInner(opts);
  } finally {
    releaseGeneration(opts.projectId);
    // 进程里那份进度跟着这一轮走：留着的话，下一轮的头几秒会显示上一轮的旧话
    clearLivePages(opts.projectId);
  }
}

async function* runHtmlGenerationInner(opts: HtmlGenerateOptions): AsyncGenerator<GenerateEvent> {
  const project = requireProject(opts.projectId, opts.tenantId);
  const doc = ensureStyleDoc(opts.projectId, opts.tenantId);
  yield { event: 'style', data: { styleId: doc.styleId, styleName: doc.name } };


  const { outline, intent } = planOutline(opts.projectId, opts.tenantId);
  yield { event: 'outline', data: { outline, intent } };

  /**
   * 全量重生成会先把 `pages` 清空，用户在图位面板上做过的调整（换过的图、加过的图、
   * 删掉的图位、字号缩放…）就跟着没了。**按页序先收一份快照**，落到新页上再还回去。
   *
   * 按页序而不是按 pageId：重生成本来就会换掉所有 pageId（见下面的注释）。
   * 页序变了的项目里，「第 5 页的图」仍然落到第 5 页——这是用户最可能的意思。
   */
  const overridesBefore = opts.regenerate ? overridesByIndex(opts.projectId) : new Map<number, Record<string, unknown>>();

  if (opts.regenerate) {
    // 全量重生成会换掉所有 pageId，旧页面的排队任务失去目标，一并清掉，
    // 否则它们会在 worker 里逐个报「页面不存在」并耗尽重试进入死信
    run("DELETE FROM tasks WHERE projectId = ? AND status IN ('queued', 'running')", opts.projectId);
    run('DELETE FROM pages WHERE projectId = ?', opts.projectId);
    refreshProjectCounts(opts.projectId);
  } else {
    /**
     * 已经生成过就原样吐一遍、不再重复计费。
     *
     * **判据必须带上「大纲有几分之几落了库」**：只看「已有的页全都 ready」的话，
     * 一本跑了两页就中断的书同样成立——于是再点生成会被拦在这里，报「已生成 2 页」
     * 然后什么都不做，剩下的七页永远补不出来。用户看到的就是「卡住了、点不动」。
     *
     * 现在要求已有页数**不少于大纲页数**才算齐活；少页的一律往下走，只补缺口
     * （下面每个 index 落库前会跳过该位已存在且 ready 的页）。
     */
    const existing = listPages(opts.projectId);
    const allReady = existing.length > 0 && existing.every((p) => p.status === 'ready');
    if (allReady && existing.length >= outline.length) {
      for (const [i, row] of existing.entries()) {
        yield { event: 'page-ready', data: { pageId: row.pageId, index: i, page: pageIR(row) } };
        await flush();
      }
      // **全记在 `skipped` 上，`succeeded` 为 0**：这一轮一次模型都没调，
      // 报「成功 N 页」是骗人的，用户会以为又花了 N 页的钱。
      // 界面据 `skipped` 说「这本已经生成过，没有重做」。
      yield {
        event: 'done',
        data: { total: existing.length, succeeded: 0, failed: 0, skipped: existing.length },
      };
      return;
    }
  }

  const sourceTexts = alignSources(project.brief, outline, intent.kind);
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  /**
   * 已经生成好、还留在原位的页。**只读一次**。
   *
   * 这一轮开头读一次就够：下面这条路径是「先把待生成的挑出来、再并发生成、最后按大纲
   * 顺序落库」，中途不会有第二个**整本**写者（两条整本流互斥）。上面那条「已经生成过
   * 就原样吐一遍」的早退只管「全都齐了」的情形，半本书走的是这条路：已成的页要跳过，
   * 不能重新生成（重新生成会重复计费，也会把用户手改过的内容冲掉）。
   *
   * **但手动单页会**——用户随时可以对某一页点重试。那几格由 `manualSlots` 单独管着：
   * 领活时跳过、落库时跳过（见 `work` 与 `persist`）。
   */
  const alreadyDone = new Map<number, PageRow>();
  /**
   * 上一轮没成功的页（`status` 不是 `ready`）。**位子占着、内容没用。**
   *
   * 续跑重做这一位时要**沿用它的 pageId**，让 `savePageGroup` 原地覆盖。
   * 换个新 pageId 的话，旧的那一行不属于「本页组」，会被当作邻居整体推到页组后面——
   * 重做 N 页就多出 N 行失败的残页，全书页数翻倍，而且那些残页永远补不掉
   * （它们没在大纲里，谁也点不到）。实测踩过：29 页的书续跑一轮变成 39 页。
   */
  const stubs = new Map<number, PageRow[]>();
  for (const row of listPages(opts.projectId)) {
    const idx = outlineIndicesOf([row], outline)[0];
    if (typeof idx !== 'number') continue;
    if (row.status === 'ready') alreadyDone.set(idx, row);
    else stubs.set(idx, [...(stubs.get(idx) ?? []), row]);
  }

  /** 待生成的大纲下标，按大纲顺序排好——落库要按这个顺序来 */
  const pending: number[] = [];
  for (const index of outline.keys()) {
    const done = alreadyDone.get(index);
    if (done) {
      skipped += 1;
      yield { event: 'page-ready', data: { pageId: done.pageId, index, page: pageIR(done) } };
      await flush();
      continue;
    }
    pending.push(index);
  }

  /** 一页的活的结果。**永远带下标**——报失败时也得说清是哪一页 */
  type JobOutcome =
    | { index: number; ok: true; page: Page; degradeReason: string }
    | { index: number; ok: false; error: string }
    /**
     * 这一格归手动那一路了：**整本不为它落库，也不计成功/失败**，只记一次 `skipped`。
     * 用户对着这一页点了重试，他此刻要的是那一版（见 `acquirePageGeneration` 的说明）。
     */
    | { index: number; ok: false; error: string; takenOver: true };

  /**
   * 这一本的品牌，**在循环外算一次**——`project` 上面已经取过（`:425`），
   * 逐页再查一遍是白花的查询。
   *
   * 没有品牌就**必须**给 `undefined`：`brandOf` 永远返回真值（渲染侧需要这样，
   * 清空品牌时才删得掉空壳槽位），直接用它会把品牌块塞进每一个老项目的提示词里，
   * 模型于是会在每页页眉留一个空槽位——等于把所有老项目的版式都改了。
   */
  const brand = hasBrand(project) ? brandOf(project) : undefined;

  /**
   * 一页的活：**只生成，不落库**。
   *
   * 落库留在下面按大纲顺序做，不放进并发里——`savePageGroup` 是按位置排页的，
   * 并发写会各自读到同一份现状、把彼此挤位（实测能挤出两条 `outlineIndex` 相同的页）。
   * 慢的是模型那一段（实测单次平均 85 秒），把它并发掉就够了；
   * 落库是同步的本地写，串着做花不了时间。
   *
   * **不抛**：失败也当成一个正常结果带回来。`mapLimit` 的 null 兜底会把下标丢掉，
   * 而这里必须知道是**哪一页**失败了，才好发 `page-failed`。
   */
  /**
   * 各页的进度，`index → 最新一句中文`。由 `work` 写、由下面的主循环转发成 SSE。
   *
   * **并发时 `work` 回不了头去 yield**——它是个普通 async 函数，而主循环在等
   * `mapLimit` 的产出。没有这个邮箱的话，整本生成这一路上「正在调用模型写这一页」
   * 全都丢掉：单页重生成那条路是把它接出来的（所以右栏能看到「已等 N 秒」），
   * 整本这条路一个字都收不到，用户看到的就是一格不动的转圈。
   */
  const mailbox = new Map<number, LivePage>();
  /** 已经发出去的那一句。只在变化时发，免得一页跑五分钟就发三百条一样的事件 */
  const lastSent = new Map<number, string>();

  const work = async (index: number): Promise<JobOutcome> => {
    /*
      领到活时这一格可能已经归手动那一路了——用户在这轮整本跑到它之前，对着这一页
      点了重试。**这时一次模型都不该调**：`persist` 反正不会落整本这一份，调了就是
      白花一次调用、白占一格并发，还挤着别的页。
    */
    if (manuallyTouchedSlots(opts.projectId).has(index)) {
      return { index, ok: false, error: '', takenOver: true };
    }
    try {
      const result = await generatePageHtml({
        projectId: opts.projectId,
        tenantId: opts.tenantId,
        userId: opts.userId,
        outline: outline[index]!,
        doc,
        pageIndex: index,
        totalPages: outline.length,
        ...(sourceTexts[index] ? { sourceText: sourceTexts[index]! } : {}),
        outlineAll: outline,
        // 上一轮在同一位置留下的失败页：沿用它的 pageId，落库时原地覆盖掉它。
        // 不沿用的话旧行会被 `savePageGroup` 当成邻居推到页组后面——
        // 重做几页就多出几行残页（见上面 `stubs` 的说明）
        ...(stubs.get(index)?.[0] ? { pageId: stubs.get(index)![0]!.pageId } : {}),
        ...(opts.gateway ? { gateway: opts.gateway } : {}),
        // 没有品牌就必须给 undefined——见上面那个局部变量的说明
        brand,
        /*
          一页必须有硬上限。不给的话，一页的最坏耗时是「页级两轮 × 每轮两次调用
          × 网关三轮重试 × 每次五分钟」，乘出来一个小时——整本卡在某一页上，
          界面几十分钟不动一下，用户只能刷新。给了预算，卡住的那页到点就落库成
          「没生成出来」，位置让给后面早跑完的页。
        */
        budgetMs: opts.budgetMs ?? PAGE_BUDGET_MS,
        onProgress: (label) => {
          // 同一句话也登到进程里一份：用户刷新之后，界面上的「正在写第 N 页」就靠它接上
          mailbox.set(index, setLivePage(opts.projectId, index, label));
        },
      });
      return { index, ok: true, page: result.page, degradeReason: result.degradeReason };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error('页生成失败', { projectId: opts.projectId, index, message });
      return { index, ok: false, error: message };
    }
  };

  /**
   * 并发生成、**结果一到就落库**，同时**每秒把手上的进度吐出去**。
   *
   * 页是并发跑的，谁先跑完谁先落库——**不等前面那几页**（见下面那圈扫描里
   * 「跳过」那一段：这是「卡死」那条报障的正解）。唯一要守的是写入必须
   * **按大纲升序**，那是 `savePageGroup` 的落点算法要求的。
   *
   * 这里不再直接 `for await` 迭代 `mapLimit`，而是让「取出下一页的结果」和
   * 「一秒一次的滴答」赛跑：滴答赢了就把邮箱里的进度发出去，一条都不压着——
   * 否则并发跑的时候用户只能看着一个不动的转圈。
   */
  const buffered = new Map<number, JobOutcome>();
  /**
   * 落库游标：`pending` 里推到第几格了。
   *
   * **必须一格一格往前，不能跳过去先落后面那一页。** 跳过去之后前面那页终究要落，
   * 而那是一次「回填」——`savePageGroup` 按「这个位置之前已经有多少页」推算落点，
   * 回填时它会把后面已落的页整段重排；中间一旦空着（被跳过的那格），后面的页就被挤错位
   * （推演过的例子：已落 1@1、3@3 之后再落第 0 页，第 3 页会被挤到 2）。
   *
   * 所以「卡住那页挡不挡路」交给**时间预算**解，不靠打乱落库顺序：它最多占位六分钟，
   * 到点就落成「没生成出来」，后面早跑完的页随即涌出。
   */
  let cursor = 0;
  /**
   * 整本这条循环的并发上限 = 模型限流器当前档位 **减去正在跑的手动单页数**。
   *
   * 「让一格给它」就是这里：用户在某一页点了重生成，那一页立刻开始（它不排队、
   * 也不经过 `mapLimit`），整本这边少开一路，天上的总额还是配额那么多。
   *
   * 写成现算的读数而**不是** `reserve()`/`release()`：后者要配对，漏一次（或在 release
   * 之前抛了）就永久少一格。而「此刻有几个手动单页」这件事，锁里已经有一个带租期、
   * 带 `finally`、带自动让位的真相源——手动那页租约一放，格子立刻自己回来。
   *
   * **下限 1**：让位不能让到 0，整本彻底停下等，正是用户要避免的那种卡死。
   *
   * 只作用于这一条循环：让位表达的是**这一本**里用户的优先级。识别、出样机、风格自检
   * 虽然共用同一把 `MODEL_LIMITER`（限流按 API key 算，见 `model-limiter.ts`），
   * 但它们是别的链路、往往是别的项目在跑，不该因为某本书里点了一下重生成而一起降速。
   */
  const bookSlots: SlotSource = {
    get current() {
      return Math.max(1, MODEL_LIMITER.current - manualLeaseCount(opts.projectId));
    },
  };
  const iter = mapLimit(pending, bookSlots, work)[Symbol.asyncIterator]();
  /**
   * 已经取出、还没消费的那一次 `next()`。
   *
   * **只建一次、反复参与赛跑**，不能每轮重建——重建等于把 `mapLimit` 往前推了一格，
   * 那一次的结果就丢了（`mapLimitStream` 的注释里踩过同一个坑）。
   */
  let nextItem = iter.next();

  /**
   * 一页有结果了：落库、排讲稿、把这一页该发的事件造出来。
   *
   * **造出来而不是就地 `yield`**，因为它要在两个地方用：主循环里发出去，
   * 以及流断开的 `finally` 里把已完成的页落掉——那儿是普通函数，yield 不了。
   */
  const persist = (index: number, done: JobOutcome): GenerateEvent[] => {
    // 这一页有结果了，它那一行「正在调用模型」就没有意义了（前端与进程里那份登记按同一个口径清）
    mailbox.delete(index);
    clearLivePage(opts.projectId, index);
    if (!done.ok) {
      // 只是把这一格让给了手动那一路：不是这一轮的产出，如实记 skipped，不报失败
      if ('takenOver' in done) {
        skipped += 1;
        return [];
      }
      failed += 1;
      return [{ event: 'page-failed', data: { pageId: `failed-${index}`, index, error: done.error, degradeReason: '' } }];
    }
    /*
      整本跑到这一格时，它已经被手动重生成过了——**不落整本这一份**。

      手动那一版是用户此刻明确要的、也是更新的；整本落得晚会把它盖回旧的，他只当是 bug。
      判据是「这一轮整本期间被手动碰过」而**不是**「此刻正在手动跑」：手动那页可能早就
      落完、租约也放了，整本才轮到它，按「正在跑」判就会漏掉，于是又盖回去。

      模型那一次调用已经花过了，这里只是不写库。手动那版还没落库时**什么都不发**——
      它自己那条流会发 `page-ready`，这里抢报只会报出一个还不存在的页。
    */
    if (manuallyTouchedSlots(opts.projectId).has(index)) {
      skipped += 1;
      const landed = listPages(opts.projectId).find((r) => r.outlineIndex === index);
      return landed
        ? [{ event: 'page-ready', data: { pageId: landed.pageId, index, page: pageIR(landed) } }]
        : [];
    }
    // 一页大纲一页，不拆页，所以落位序号就是大纲下标
    savePageGroup(
      opts.projectId, opts.tenantId,
      [carryOverrides(done.page, overridesBefore.get(index) ?? {})],
      index, index,
    );
    /**
     * 讲稿跟着页面走。
     *
     * 这一步**原先只有旧链有**（`generate.service.ts`），新链生成出来的页面一个
     * 讲稿任务都没排——所以「生成完就有讲稿」在新链上从来没成立过。
     * 开关是项目级的（`narrationScriptEnabled`），关掉就不排；
     * 配音不在这里排，那是用户在内容确认之后单独点的事。
     */
    if (project.narrationScriptEnabled === 1) {
      dispatchScriptTask(done.page, { projectId: opts.projectId, tenantId: opts.tenantId });
    }
    // 同一位置若攒下了好几行失败页（旧版本续跑留下的），只留刚落进去的这一行
    for (const extra of stubs.get(index)?.slice(1) ?? []) {
      run('DELETE FROM pages WHERE pageId = ?', extra.pageId);
    }
    // 画布跟着落地的页走。并发之后没有「当前正在写的那一页」了，
    // 与其停在某一页不动，不如让它一页页往前跟
    const events: GenerateEvent[] = [{ event: 'page-start', data: { pageId: `pending-${index}`, index } }];
    if (done.page.status === 'ready') {
      succeeded += 1;
      events.push({ event: 'page-ready', data: { pageId: done.page.pageId, index, page: done.page } });
    } else {
      failed += 1;
      events.push({
        event: 'page-failed',
        data: {
          pageId: done.page.pageId,
          index,
          error: '页面未通过校验',
          degradeReason: done.degradeReason,
          // 连这一页一起发出去。它是**落过库的**（一行 failed），界面据此把原因摆出来；
          // 只发一个下标的话，工作台上那一格是空的，用户看不到「为什么」
          page: done.page,
        },
      });
    }
    return events;
  };

  /** 把游标能推到的页全落掉，返回这一批该发的事件。落库顺序因此天然是大纲升序 */
  const landReady = (): GenerateEvent[] => {
    const events: GenerateEvent[] = [];
    while (cursor < pending.length) {
      const index = pending[cursor]!;
      const done = buffered.get(index);
      if (!done) break; // 还没轮到它跑完，后面的先攒着
      buffered.delete(index);
      cursor += 1;
      events.push(...persist(index, done));
    }
    return events;
  };

  try {
    for (;;) {
      /**
       * 「停止」按下了就收手。
       *
       * **已经在天上那几次模型调用拦不住**（请求早发出去了），所以这不是「立刻断」，
       * 而是「不再往下做」：跳出循环，`finally` 把手上已经拿到结果的页落库——
       * 那几页已经花过钱了，扔掉才是真的浪费。
       */
      if (isStopRequested(opts.projectId)) break;

      const raced = await Promise.race([
        nextItem.then((v) => ({ kind: 'item' as const, v })),
        // `ref: false`：这个滴答只是给这一轮计时用的，不该拖着进程不退出
        sleep(PROGRESS_TICK_MS, null, { ref: false }).then(() => ({ kind: 'tick' as const })),
      ]);

      /*
        把邮箱里**有变化**的进度发出去。

        **必须排在落库前面**：这一页的「正在调用模型」要出现在它的结果之前，
        否则用户看到的顺序是「第 3 页好了」然后又冒出一句「第 3 页正在写」。
        同一页的同一条文案只发一次——一页跑五分钟会推上来很多次，
        每次都发等于每秒一条一模一样的事件，前端也只是重复显示。
      */
      for (const [index, live] of mailbox) {
        if (lastSent.get(index) === live.label) continue;
        lastSent.set(index, live.label);
        yield { event: 'page-progress', data: { index, label: live.label, startedAt: live.startedAt } };
        await flush();
      }

      if (raced.kind === 'item') {
        const { value: outcome, done } = raced.v;
        if (done) break;
        nextItem = iter.next();

        if (outcome) {
          buffered.set(outcome.index, outcome);
          for (const evt of landReady()) {
            yield evt;
            await flush();
          }
        }
      }
    }
  } finally {
    /**
     * 客户端断开时，上层 `routes/projects.ts` 那圈循环 `break` → 这个 generator 收到
     * `return()`，走的是异常退出的那条路，`break` 那一行根本到不了。这里兜底把
     * `mapLimit` 也收尾。
     *
     * 收尾时顺手把游标能推到的页落掉。**别指望它兜住多少**：游标卡在某一页上时
     * 它一页都推不动（那正是「等前面那页」的意思），所以它不是补救——
     * 补救是时间预算那一条（卡住那页到点落库，位置让给后面）。
     */
    await iter.return?.(null);
    landReady();
  }

  refreshProjectCounts(opts.projectId);
  yield { event: 'done', data: { total: outline.length, succeeded, failed, skipped } };
}

/* ---------------- 单页 ---------------- */

/**
 * 重生成一页（工作台右栏的「重新生成本页」）。
 *
 * 与整本生成的区别只在「用哪条大纲」和「落回哪个位置」：这里页已存在，
 * 位置不动，只换内容。人工改过的讲稿原样保留——重生成是为了换内容，
 * 不该顺手把逐字稿也冲掉。
 */
/**
 * 把**用户在页面上手动做过的调整**带进新生成的那一页。
 *
 * 这些调整全部住在 `page.overrides` 里（见 `ir-schema` 的 `ImageOverrides`）：
 * 换过／加过的图（`images[n].src`）、删掉的图位（`hidden`）、图位的位移缩放旋转、
 * 这一页的字号缩放（`fontScale`）……它们是用户在**这一页**上的选择，跟页面 HTML
 * 是重生成出来的还是原来的无关。
 *
 * 原先重生成只带讲稿（`existingScript`），overrides 一律丢掉——用户「换一张图」
 * 之后只要点一次「重跑这一页」，那页的图就被换回素材库自动配的那张，等于白选。
 * 这是用户报的「人为修改过的部分迭代一下就没了」。
 *
 * **用户的选择优先**：新页面自己带出来的同名键不覆盖旧的。
 */
function carryOverrides<T extends Page>(next: T, prevOverrides: Record<string, unknown>): T {
  if (Object.keys(prevOverrides).length === 0) return next;
  return PageIR.parse({ ...next, overrides: { ...next.overrides, ...prevOverrides } }) as T;
}

/** 按页序收一份 `overrides` 快照，全量重生成前用——那一步会先把 pages 清空 */
function overridesByIndex(projectId: string): Map<number, Record<string, unknown>> {
  const out = new Map<number, Record<string, unknown>>();
  for (const r of all<{ pageIndex: number; ir: string }>(
    'SELECT pageIndex, ir FROM pages WHERE projectId = ? AND pageIndex >= 0', projectId,
  )) {
    const ov = pageIR({ ir: r.ir } as never).overrides;
    if (Object.keys(ov).length > 0) out.set(r.pageIndex, ov);
  }
  return out;
}

export async function regeneratePageHtml(
  pageId: string,
  tenantId: string,
  userId: string,
  /** 演示用的注入点，测试里换成假的网关 */
  gateway?: ProviderGateway,
  /** 走到哪一步了，透传给流式路由显示 */
  onProgress?: (label: string) => void,
  /** 指定这一页用哪一份版式骨架（工作台的「换排版」）。不传就是照旧自动挑 */
  forcedLayout?: StudioLayout,
): Promise<Page> {
  const row = get<{ projectId: string; pageIndex: number; ir: string; tenantId: string }>(
    'SELECT projectId, pageIndex, ir, tenantId FROM pages WHERE pageId = ?', pageId,
  );
  if (!row || row.tenantId !== tenantId) throw notFound('页面不存在');

  /**
   * 这条拿的是**这一格**的手动写权，不是整本那把——所以整本正在跑时它照样能开。
   *
   * 原先它跟整本抢同一把项目级锁，结果是「整本生成到一半、某一页没出来、想单独重跑
   * 那一下」必然被 409 挡回去，而那恰恰是用户此刻最想点的。见 `generation-lock.ts` 顶部。
   *
   * 它同时把这一格记进 `manualSlots`：整本这一轮跑到这一格时会**跳过它**，
   * 不把用户刚重跑出来的这一版盖回旧的。
   */
  const slot = row.pageIndex;
  acquirePageGeneration(row.projectId, slot, '重跑这一页');
  /*
    也登一份进程内的进度。原先只有整本那条路登，于是**单页重生成刷一下页面，
    「正在写第 N 页」就没了**——回来看到一格不动的转圈，分不清在跑还是死了。
    起点由 `setLivePage` 保持为第一次登记那一刻，揭示层靠它算画到第几块。
  */
  setLivePage(row.projectId, slot, '正在重画这一页');
  try {
    return await regeneratePageHtmlInner(
      pageId, tenantId, userId, row, gateway,
      (label) => { setLivePage(row.projectId, slot, label); onProgress?.(label); },
      forcedLayout,
    );
  } finally {
    clearLivePage(row.projectId, slot);
    releasePageGeneration(row.projectId, slot);
  }
}

async function regeneratePageHtmlInner(
  pageId: string,
  tenantId: string,
  userId: string,
  row: { projectId: string; pageIndex: number; ir: string; tenantId: string },
  gateway?: ProviderGateway,
  onProgress?: (label: string) => void,
  forcedLayout?: StudioLayout,
): Promise<Page> {

  const doc = ensureStyleDoc(row.projectId, tenantId);
  const meta = readDeckMeta(row.projectId);
  const outlinePage = meta.outline?.[row.pageIndex];
  if (!outlinePage) throw conflict('该页不在当前大纲中，无法重生成');

  // 旧链路拆页留下的续页要先清掉：新链路不拆页，留着它们就是孤儿
  deleteSplitContinuations(pageId);

  const project = requireProject(row.projectId, tenantId);
  const currentPage = pageIR({ ...row, ir: row.ir } as never);
  /**
   * 这一页对应的**需求原文**。
   *
   * **重生成也必须带上它。** 原先这条路径只给大纲的标题/要点，于是「重新生成这一页」
   * 会把用户写进需求里的细节全部丢掉——那一页只剩大纲那三行重新写一遍。整本生成
   * 与「优先生成本页」都带了原文，只有这里漏了。
   */
  const sourceText = alignSources(project.brief, meta.outline ?? [], 'mixed')[row.pageIndex];
  const result = await generatePageHtml({
    projectId: row.projectId,
    tenantId,
    userId,
    outline: outlinePage,
    doc,
    pageIndex: row.pageIndex,
    // 续租要打在「这一格的手动租约」上，不是整本那把
    leaseSlot: row.pageIndex,
    totalPages: meta.outline?.length ?? 1,
    pageId,
    existingScript: currentPage.script,
    outlineAll: meta.outline ?? [],
    /**
     * 换排版 / 转图文页时，内容源是**页面上现有的文字**（`contentBrief` 会拿它替掉
     * 教案那一份）；普通重生成则用**这一页对应的需求原文**。
     *
     * 两者不能同时给：转换的承诺是「文字一字不动、只换版面」，再掺一份原文进去，
     * 模型就会拿原文改写页面上已有的字，等于没保留。
     */
    ...(forcedLayout
      ? { keepText: pageTextOf(currentPage) }
      : (sourceText ? { sourceText } : {})),
    ...(gateway ? { gateway } : {}),
    // 没有品牌就必须给 undefined：`brandOf` 永远返回真值，直接用它会把品牌块
    // 塞进每一个老项目的提示词里
    brand: hasBrand(project) ? brandOf(project) : undefined,
    ...(onProgress ? { onProgress } : {}),
    ...(forcedLayout ? { forcedLayout } : {}),
  });
  // 落盘的才是这一页最终的样子（overrides 是刚还回去的），返回它而不是生成器给的那份——
  // 否则调用方（路由 → 前端）看到的是一份「没有用户改动」的页面，界面上看着像没保存上
  const [saved] = savePageGroup(
    row.projectId, tenantId,
    [carryOverrides(result.page, currentPage.overrides)],
    row.pageIndex, row.pageIndex,
  );
  refreshProjectCounts(row.projectId);
  return pageIR(saved!);
}

/**
 * 按大纲序号生成单页（工作台骨架屏上的「优先生成」）。
 *
 * 与 regeneratePageHtml 的区别：这一页还不存在，要先算出它该插在哪——
 * 数出排在它前面的页数即可。
 */
export async function generatePageHtmlAt(
  projectId: string,
  tenantId: string,
  userId: string,
  outlineIndex: number,
  /** 演示用的注入点，测试里换成假的网关 */
  gateway?: ProviderGateway,
): Promise<Page> {
  // 拿的是这一格的手动写权（不是整本那把）：整本正在跑时，这一页照样能开
  acquirePageGeneration(projectId, outlineIndex, '生成这一页');
  setLivePage(projectId, outlineIndex, '正在生成这一页');
  try {
    return await generatePageHtmlAtInner(projectId, tenantId, userId, outlineIndex, gateway);
  } finally {
    clearLivePage(projectId, outlineIndex);
    releasePageGeneration(projectId, outlineIndex);
  }
}

async function generatePageHtmlAtInner(
  projectId: string,
  tenantId: string,
  userId: string,
  outlineIndex: number,
  gateway?: ProviderGateway,
): Promise<Page> {
  const project = requireProject(projectId, tenantId);
  const doc = ensureStyleDoc(projectId, tenantId);
  const meta = readDeckMeta(projectId);
  const outline = meta.outline ?? [];
  const outlinePage = outline[outlineIndex];
  if (!outlinePage) throw conflict(`大纲里没有第 ${outlineIndex + 1} 页`);

  const sourceTexts = alignSources(project.brief, outline, 'mixed');
  const result = await generatePageHtml({
    projectId,
    tenantId,
    userId,
    outline: outlinePage,
    doc,
    pageIndex: outlineIndex,
    leaseSlot: outlineIndex,
    totalPages: outline.length,
    ...(sourceTexts[outlineIndex] ? { sourceText: sourceTexts[outlineIndex]! } : {}),
    outlineAll: outline,
    ...(gateway ? { gateway } : {}),
    // 没有品牌就必须给 undefined：`brandOf` 永远返回真值，直接用它会把品牌块
    // 塞进每一个老项目的提示词里
    brand: hasBrand(project) ? brandOf(project) : undefined,
    onProgress: (label) => setLivePage(projectId, outlineIndex, label),
  });

  /*
    落点**算在 `await` 之后、紧贴下面那次同步的 `savePageGroup`**。

    这不是可有可无的讲究：`savePageGroup` 读→算→写全在一个同步事务里，两次调用之间
    绝不可能交错；而落点一旦算在 `await` 之前，等模型那几分钟里整本可能已经落了好几页，
    这个数就是过期的——`outlineIndex` 没有唯一约束，落错格会留下两条同槽位的行，
    真正空着的那一格永远补不上（见 `generation-lock.ts` 开头记的那场事故）。

    **这两行之间不许再插任何 `await`**，插了就重新打开了那个时间窗。
  */
  const landed = listPages(projectId);
  /*
    等模型这段时间里，这一格可能已被整本（或另一次手动）填上。有行就**沿用它的
    `pageId` 原地覆盖**，别插出第二条同槽位的行——那正是「页数对不上大纲、项目卡在
    生成中」的成因（同一个坑在整本的 `stubs` 里记过）。
  */
  const twin = landed.find((r) => r.outlineIndex === outlineIndex);
  const insertAt = outlineIndicesOf(landed, outline).filter((from) => from < outlineIndex).length;
  const [saved] = savePageGroup(
    projectId, tenantId,
    [twin ? { ...result.page, pageId: twin.pageId } : result.page],
    insertAt, outlineIndex,
  );
  refreshProjectCounts(projectId);
  // 返回落过库的那一行，不是生成器给的那份：沿用 `twin.pageId` 覆盖时，生成器那份的
  // `pageId` 压根没有对应的行，交给调用方（路由 → 前端）就成了一个点不开的页面
  return pageIR(saved!);
}
