import {
  fontIdOfStack,
  fontStackOf,
  fontStacksOf,
  PAGE_TYPE_LABEL,
  PAGE_TYPE_ORDER,
  PROMPT_SECTIONS,
  StyleDoc,
  StyleSpec,
  specBlock,
  type PageType,
  type ProgressPayload,
  type SpecDeviation,
  type SpecFontRole,
  type StylePagePrompt,
  type UnifyStep,
} from '@lumen/ir-schema';
import type { ProviderGateway } from '@lumen/provider-gateway';
import { isMockPlaceholder, type TextMessage } from '@lumen/provider-gateway';
import type { ZodError } from 'zod';
import { mapLimit, mapLimitStream } from '../lib/concurrency.js';
import { MODEL_LIMITER, watchThrottle } from '../lib/model-limiter.js';
import { invalid } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { parseModelJson } from '../lib/model-reply.js';
import { generateMock, str } from './page-prompt-kit.js';
import { publicRedrawMessage } from './redraw-page.service.js';
import { resolveStyleDoc, saveStyleDoc } from './style-doc.service.js';

/**
 * 风格规范与一键统一。
 *
 * ## 要解决的问题
 *
 * 识别时是**逐页**写提示词的，每一页各写各的：实测同一套风格里文字页的标题 44px 用 `--brand`、
 * 数字页 46px 用 `--text`，装饰条一个在标题下方、一个在上方，封面角标是竖条而正文页是圆角方块。
 * 单独看每一页都成立，一张一张翻过去就散了。库里五套风格全是这么来的。
 *
 * ## 四步
 *
 * 1. **提炼规范**：把各页提示词里的「视觉与排版要求」那一段收上来，让模型提炼出一份
 *    全篇共用的规范（`StyleSpec`）。
 * 2. **改写提示词**：照规范逐页改写，只动系统性细节。
 * 3. **重出样机**：改过的那几页重新跑一次样机。
 * 4. **自检**：比对规范与**产物**，把仍不一致的地方列出来。
 *
 * ## 两段长尾都并起来了
 *
 * 实测（十二页一套）：
 *
 * - **第 2、3 步流水线跑**：改写改好一批就立刻开跑那几页的样机，不等其余批次。
 *   原先两段串着跑，改写那六分钟机器是空的；现在两段重叠，这一段取两者里慢的那个
 *   （实测改写十一分钟、样机十三分钟，合起来十三分钟）。
 *   改写本身仍按批串行（一批两页，见 `REWRITE_BATCH`）——再往上并没有收益，
 *   样机才是这一段的长尾。
 * - **第 4 步并发跑**：六批三路（见 `CHECK_CONCURRENCY`）。串行时它要十五分钟，
 *   是整条链路最后一段长尾，而六批之间互不相干。
 *
 * 两处加起来，一套从半小时压到二十分钟上下。第 4 步的顺序不能颠倒：
 * 自检查的是重出之后的样机，放在第 3 步之前查的是旧产物。
 *
 * ## 两条边界
 *
 * - **手改过的页一律跳过**（`edited: true`）。与单页重识别那条「手改过的不被覆盖」是同一条规矩，
 *   跳过之后要如实报出来，不能悄悄跳过。
 * - **自检只报不改**。改不改由用户决定，自动改会把用户认可过的页面又动一遍。
 */

export interface UnifyInput {
  styleId: string;
  /** **必传**。路由用 `billedGateway()` 建，测试里换假的 —— 与 `fillMissingPageTypes` 同口径 */
  gateway: ProviderGateway;
}

export type UnifyEvent =
  | { event: 'progress'; data: ProgressPayload<UnifyStep> }
  | { event: 'spec'; data: StyleSpec }
  | { event: 'page'; data: { pageType: PageType; prompt: string } }
  | { event: 'done'; data: { doc: StyleDoc; spec: StyleSpec; rewritten: PageType[]; skippedEdited: PageType[]; unrewritten: PageType[]; deviations: SpecDeviation[]; checked: boolean; issues: { pageType: string; message: string }[] } }
  | { event: 'error'; data: { message: string } };

/**
 * 出样机的并发。
 *
 * 比识别与补齐的 3 高：那两处一次只跑几张、且和别的步骤串着，这三处是这条链路
 * 唯一的长尾。原先取 3 是因为「调用最贵」——但一张样机线上要跑四分钟，十二张就是
 * 四十八分钟的活，三路并行也要十六分钟，而识别那两处并着跑没出过限流。
 *
 * 取 6 是折中：再往上翻倍，长尾缩短有限（十二张六路已经两轮跑完），
 * 撞限流的概率却跟着涨，撞一次要重发整批，反而更慢。
 *
 * **现在用的是共享的 `MODEL_LIMITER`**（起始 6、下限 2，会自己降档）——
 * 上面这套「取 6 是折中」的推理没错，错的是「写死」：限流按 API key 算，
 * 这一条链路、生成页面、识别用的是同一个 key，各写各的加起来照样打爆。
 * 见 `lib/model-limiter.ts`。
 */
const MOCK_CONCURRENCY = MODEL_LIMITER;

/**
 * 改写一次的批量。**一页一批**。
 *
 * 这一段的产出是**整条提示词**，一条三四千字。历史是 3 → 2 → 1：
 *
 * - **3**：输出超过两万 token 被截断，JSON 解析不出来、整批白跑
 *   （症状是日志里三批连着「没拿到可用结果」而界面上报「已统一 2 页」）。
 * - **2**：以为留足余量了，实测**还是不够**。「浅紫玻璃流光风」跑统一时，
 *   toc 与 architecture 两页一批，改出来的提示词缺段落，被下面那句
 *   `PROMPT_SECTIONS.every` 直接跳过——**那两页等于一个字都没改**，
 *   自检报出 42 条偏差、其中 37 条全落在这两页上（偏差的「实际」一侧全是旧样式，
 *   页眉页脚都还是缺的）。
 * - **1**：输出短、写得完。代价是调用次数翻倍（12 页从 6 批变 12 批），
 *   但统一一轮本来就要十几分钟，多这几次不显著；而**一页没改上是静默的**——
 *   用户看到「统一完成」，那两页却还是老样子。
 */
const REWRITE_BATCH = 1;

/**
 * 自检的批量。**一页一批**。
 *
 * 原先两页一批，理由是「一次读两页就够省调用了」。但实测这个任务的瓶颈不在调用次数，
 * 而在**推理预算**：`deepseek-v4.1-flash` 比对两页样机时会稳定产出十万字上下的
 * `reasoning_content`，把 32000 的 max_tokens 全烧光、正文一个字不出——
 * 八套里四套的自检因此整轮没有结果。
 *
 * 一次只喂一页，输入减半、要推理的东西也跟着减半。代价是调用次数翻倍（十二批而不是六批），
 * 但自检是并发跑的（见 `CHECK_CONCURRENCY`），轮次只从两轮变成四轮，
 * 比「一半的概率拿不到结果」划算得多。
 */
const CHECK_BATCH = 1;

/**
 * 自检的并发。
 *
 * 这一步是整条链路**最后一段长尾**：十二页六批，串行跑实测要十五分钟，
 * 而它和前面几步没有依赖，六批之间也互不相干。取 3 是折中——再高收益有限
 * （六批三路两轮就完），撞限流要重发整批反而更慢。
 *
 * 批内仍然是两页（见 `CHECK_BATCH`）：并发改的是「几批同时在跑」，不是批的大小。
 *
 * **现在用的是共享的 `MODEL_LIMITER`**：自检跑在出样机之后，那一刻没有别的活，
 * 但配额是全局的——它开多大照样算在同一个 API key 上。见 `lib/model-limiter.ts`。
 */
const CHECK_CONCURRENCY = MODEL_LIMITER;

/**
 * 取提示词里「视觉与排版要求」那一段。
 *
 * 只喂这一段而不是整条提示词：`角色` 与 `代码要求` 两段各页本来就大同小异，
 * 喂进去只是白花 token 并把模型往「整条重写」上带；要提炼的那些细节全在第三段里。
 * 段名缺失时退回整条——宁可多喂，也不能因为一段标题没写对就把这一页漏掉。
 */
function visualSection(prompt: string): string {
  const start = prompt.indexOf('视觉与排版要求：');
  if (start < 0) return prompt;
  const end = prompt.indexOf('代码要求（非常重要）：', start);
  return end < 0 ? prompt.slice(start) : prompt.slice(start, end);
}

const EXTRACT_SYSTEM = [
  '你是资深视觉设计总监。下面是同一套演示文稿风格里**各页类型**的排版要求。',
  '它们由不同批次写成，细节上有出入——同一个「页标题」在不同页里字号、颜色、对齐都可能不一样。',
  '',
  '请提炼出一份**全篇统一**的视觉规范。要求：',
  '- **不是取多数票，是取最能代表这套风格的那一个**。三页写 A、两页写 B 时，',
  '  判断哪个才是这套风格的主张，而不是数票数。',
  '- 每一项都要给一个具体值，不要写「视情况而定」。',
  '- 颜色只写语义名：brand / accent / text / muted / border。**不要写色值**，色值已经由配色单独管住了。',
  '- **枚举字段只能取下面示例里给出的那几个值**，照抄，不要自己发明：',
  '  `title.rule.position` 只有 above / below / none；`header.kind` 只有 bar / block / wordmark / none；',
  '  `title.align` 只有 left / center；`header.position` 与 `footer.pageNoPosition` 只有 left / center / right；',
  '  `header.textTransform` 只有 none / uppercase；',
  '  `footer.pageNoFormat` 只有 plain（写成 `1`）/ padded（`01`）/ of-total（`1 / 12`）/ chinese（`第 1 页`）；',
  '  `effects[].kind` 只有 gradient / glass / glow / neon。',
  '- **四档字级要分别给**，不要拿一个比例去推：`title`（页标题）、`subtitle`（标题下方那句说明）、',
  '  `body`（正文）、`numeric`（指标值、大号序号这类数字）。实测这四档经常不按比例——',
  '  有的风格标题 96px 而副标题只有 15px，靠巨大的落差做气质，写成一个缩放比例反而失真。',
  '  某一档在提示词里找不到时，按这套风格的调性给一个合理的值，不要留空。',
  '  `body` 还要给 `lineHeight`：正文的行高与字号一样是风格的辨识度。',
  '  正文的字号各页写法不一致时（14 / 15 / 16px 都出现过），**取那个反复出现的**，不要取最小的。',
  '- **页眉与页码的位置、格式要认准**，这两项在实测里最散：',
  '  页眉的品牌标识靠哪边（`header.position`）、页眉那一行字多大、什么颜色、是不是全大写；',
  '  页码靠页脚的哪边（`footer.pageNoPosition`）、写成长什么样（`footer.pageNoFormat`）。',
  '  提示词里没写页码格式时，看它举的例子（写了 `01` 就是 padded、写了 `第 3 页` 就是 chinese）。',
  '  `header.textSizePx` 填 0 表示这套风格不写页眉字。',
  '- **不要输出 `fonts` 这一段**。字体由系统按这套风格原有的字体栈填，你从文字里猜不准。',
  '- **`effects` 要认出这套风格真正用到的视觉效果**，只看这四类：gradient（渐变）/ glass（毛玻璃）/',
  '  glow（发光）/ neon（霓虹）。**它比字号更决定这套风格长什么样**——同样的底色同样的字号，',
  '  有毛玻璃和没毛玻璃是两套东西。所以出现了的不能漏，没出现的不要编。',
  '  `note` 写「用在哪儿 + 怎么做」，要具体到能照着写出来：',
  '  「卡片底用 135° 的 brand→accent 线性渐变、按钮悬停加一层同色外发光」这种，',
  '  而不是「用了渐变」。各页写法不一致时，同样取最能代表这套风格的那一个。',
  '  只有整套风格确实是纯色块排版、一点效果都没有时，才给空数组。',
  '  **`note` 里的颜色一律写语义名，不要写十六进制**。参考稿上量到的 `#CBF6DA`',
  '  这类值写进去没有用：样机的契约明令「不出现字面色值、一律引用变量」，',
  '  照着规范写反而会撞上那条禁令。要表达「比 accent 更浅的一档」就写',
  '  「accent 的浅色变体（`color-mix(in srgb, var(--accent) 60%, white)`）」。',
  '  **`note` 里也不要出现「每页」「所有页」这类全称断言**，要把效果挂到它所属的那个元素上：',
  '  写「亮块主卡用 135° 的 accent 渐变」，不要写「每页唯一的亮块主卡用…」。',
  '  原因：效果是「该用到的页必须做出来」，而一页里未必有这个元素——写成全称之后，',
  '  自检会拿它去要求每一页，没有亮块主卡的页全被报成偏差（实测一套里刷了八条）。',
  '- `intro` 用一两句说清这套风格的**视觉主张**（底色、表面、线条、留白、强调色怎么用），',
  '  不要复述它适合什么场合——那是另一件事。',
  '',
  '只输出 JSON，不要任何解释：',
  '{"intro":"","title":{"sizePx":44,"weight":700,"color":"brand","align":"left",',
  '"rule":{"position":"above","widthPx":72,"heightPx":6,"color":"accent"}},',
  '"subtitle":{"sizePx":28,"weight":500,"color":"muted"},',
  '"body":{"sizePx":16,"weight":400,"color":"text","lineHeight":1.8},',
  '"numeric":{"sizePx":64,"weight":700,"color":"brand"},',
  '"header":{"kind":"block","sizePx":34,"color":"brand","heightPx":88,"position":"left",',
  '"textSizePx":13,"textColor":"muted","textTransform":"uppercase"},',
  '"footer":{"heightPx":100,"showPageNo":true,"pageNoPosition":"right","pageNoFormat":"padded",',
  '"pageNoSizePx":13,"pageNoColor":"muted"},',
  '"marginPx":56,',
  '"radius":{"card":14,"inner":8},"decoration":["1px 细线","圆角方块"],',
  '"effects":[{"kind":"gradient","note":"卡片底用 135° 的 brand→accent 线性渐变"},',
  '{"kind":"glow","note":"按钮与关键数字带一圈 brand 色外发光"}]}',
].join('\n');

/** 最多调几次。一次原始 + 两次带修正——实测有「JSON 抖动」与「枚举越界」两种失败 */
const EXTRACT_ATTEMPTS = 3;

/**
 * 把 zod 的报错翻成给模型看的一段话。**必须带字段路径**，否则它不知道该改哪一项。
 */
function correctionBlock(error: ZodError): string {
  const lines = error.issues.slice(0, 10).map((i) => {
    const at = i.path.length > 0 ? i.path.join('.') : '(根)';
    return `- ${at}：${i.message}`;
  });
  return [
    '你上一次输出的 JSON 有以下问题，请改正后**重新输出完整的那一份 JSON**：',
    ...lines,
    '',
    '注意：枚举字段只能取契约里给出的那几个值，**不要自己发明**——',
    '比如 `title.rule.position` 只有 above / below / none，没有 left / right；',
    '`header.kind` 只有 bar / block / wordmark / none；',
    '`header.position` 与 `footer.pageNoPosition` 只有 left / center / right；',
    '`header.textTransform` 只有 none / uppercase；',
    '`footer.pageNoFormat` 只有 plain / padded / of-total / chinese。',
    '字段名与层级不要改，只把不合契约的值换成合法的，其余部分原样保留。',
    '只输出 JSON，不要任何解释。',
  ].join('\n');
}

/**
 * 把四个字体角色填上。
 *
 * ## 不让模型填这一项
 *
 * 它只能从提示词的文字里读「大标题用衬线展示体」这种描述，猜不准是哪一个衬线；
 * 而 `StyleDoc` 里那三套栈是识别阶段就定下的真值，反查一下就知道是哪套。
 * 数字那一档按大标题走——大号指标值跟标题一个字体是常态。
 *
 * ## 已经定过的那几档原样保留
 *
 * 这是**用户在界面上点出来的选择**（见 `setSpecFonts`），重新统一不该把它按风格原有的栈
 * 再推一遍。实测踩过：把正文切成系统等宽、再点一次「重新统一」，那一档悄悄变回 Montserrat——
 * 用户看到的是「我的设置自己没了」，而重新统一本来是个可以随便点的动作。
 *
 * 反查不出（这套风格用的是自己写的栈）就留空串，表示「不指定、按原样」。
 * 那几套栈本身仍会照常注入到提示词里，不会被这一层抹掉。
 */
function withDocFonts(spec: StyleSpec, doc: StyleDoc): StyleSpec {
  const kept = doc.spec?.fonts;
  const pick = (role: SpecFontRole, fallback: string) => kept?.[role] || fallback;

  const display = pick('display', fontIdOfStack(doc.fontDisplay) || fontIdOfStack(doc.fontFamily));
  return {
    ...spec,
    fonts: {
      display,
      body: pick('body', fontIdOfStack(doc.fontFamily)),
      script: pick('script', fontIdOfStack(doc.fontScript)),
      numeric: pick('numeric', '') || display,
    },
  };
}

/**
 * 提炼规范。模型返回的东西不合契约就抛——**这一步没有合理的兜底**：
 * 一份瞎猜的规范会把下面每一页都改坏，比不统一更糟。
 *
 * 但失败有三种，不能一视同仁：
 * - **没吐出 JSON**：抖动，重发一次就好（实测有整条回复不是 JSON 的情况）。
 * - **结构对、某个枚举越界**：实测 `rule.position` 给了 `left`，而契约只认
 *   above / below / none。这**不是瞎猜，是模型自己发明了一个值**——把错误原样发回去
 *   让它自己改，比我们替它猜一个位置诚实，也比让用户白等一轮再看到技术报错好得多。
 * - **试到上限仍不合契约**：才抛。到这一步说明它确实理解不了这份契约，兜不了。
 */
export async function extractStyleSpec(gateway: ProviderGateway, doc: StyleDoc): Promise<StyleSpec> {
  const covered = PAGE_TYPE_ORDER.filter((t) => doc.pagePrompts[t]);
  const sample = covered
    .map((t) => `【${PAGE_TYPE_LABEL[t]}】\n${visualSection(doc.pagePrompts[t]!.prompt)}`)
    .join('\n\n---\n\n');

  const messages: TextMessage[] = [{
    role: 'user',
    content: [
      `这套风格的配色（颜色写语义名时指的就是这几个）：`,
      `--bg: ${doc.palette.bg}; --surface: ${doc.palette.surface}; --text: ${doc.palette.text};`,
      `--muted: ${doc.palette.muted}; --accent: ${doc.palette.accent}; --brand: ${doc.palette.brand};`,
      `--border: ${doc.palette.border};`,
      '',
      `画布固定 1920×1080。共 ${covered.length} 个页类型。`,
      '',
      sample,
    ].join('\n'),
  }];

  let lastRaw = '';
  for (let attempt = 0; attempt < EXTRACT_ATTEMPTS; attempt += 1) {
    const res = await gateway.text({
      taskType: 'html_codegen',
      json: true,
      maxTokens: 8000,
      system: EXTRACT_SYSTEM,
      messages,
    });
    lastRaw = res.text;

    const parsed = parseModelJson<Record<string, unknown>>(res.text);
    if (!parsed) {
      logger.warn('提炼规范没拿到 JSON，重发一次', {
        styleId: doc.styleId, attempt, raw: res.text.slice(0, 200),
      });
      messages.push(
        { role: 'assistant', content: res.text },
        { role: 'user', content: '你上一次的回复不是可解析的 JSON。请**只输出 JSON**，不要任何解释、不要 Markdown 围栏。' },
      );
      continue;
    }

    const spec = StyleSpec.safeParse({ ...parsed, intro: str(parsed.intro) });
    if (spec.success) return withDocFonts(spec.data, doc);

    logger.warn('提炼规范的结构不合契约，带错误重发', {
      styleId: doc.styleId,
      attempt,
      issues: spec.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`),
    });
    // 带上它自己的上一次输出：只说「错了」它看不到错在哪，改不动
    messages.push(
      { role: 'assistant', content: res.text },
      { role: 'user', content: correctionBlock(spec.error) },
    );
  }

  throw new Error(
    `提炼规范：试了 ${EXTRACT_ATTEMPTS} 次仍不合契约（最后一次的回复：${lastRaw.slice(0, 120)}）`,
  );
}

/**
 * 把模型回填的页名归一成页类型。
 *
 * 请求正文里每一页写的是中文标签（`【文字页】`），系统提示里提到破格页时用的也是中文，
 * 所以模型经常直接回「文字页」而不是 `text`。**这是它的合理反应，不该当成答非所问丢掉**——
 * 实测在系统提示里加了一段提到「封面、封底、转折页」的规则之后，整批回填全变成中文名，
 * 一页都收不上来，而内容其实改得完全对。
 *
 * `allowed` 是这一批的页类型，中文名也只在这批里找，答非所问的照样丢掉。
 */
function toPageType(raw: string, allowed: readonly PageType[]): PageType | null {
  if ((allowed as readonly string[]).includes(raw)) return raw as PageType;
  return allowed.find((t) => PAGE_TYPE_LABEL[t] === raw) ?? null;
}

const REWRITE_SYSTEM = [
  '你是资深前端工程师兼视觉设计师。下面给你**一份全篇统一的视觉规范**和**某一页现有的提示词**，',
  '请把这条提示词改成符合规范的样子。',
  '',
  '要求：',
  '- **正文里现有的数字与颜色，与规范对不上的一律改成规范的。这是这一步最容易做错的地方**：',
  '  提示词正文往往已经把「44px/800 的标题」「96px 宽的短横线」「亮蓝色方块」写得很具体，',
  '  你会倾向于照抄它。但**正文里那些数字正是这一轮要统一的东西**——它们本来就是各页各写各的',
  '  才有的出入。所以规范里的每一项都要**逐项核对**：',
  '  · 四档字级（页标题 / 副标题 / 正文 / 数字）各自的字号、字重、颜色，正文还有行高；',
  '  · 标题强调条的位置与宽高与颜色；',
  '  · 页眉品牌标识的形态、尺寸、颜色，以及**它靠哪一边**；',
  '  · 页眉那一行字（「目录 / CONTENTS」这类）的字号、颜色、是不是全大写；',
  '  · 页脚高度、**页码靠哪一边、写成长什么样**（`01` 与 `第 1 页` 是两种气质）；',
  '  · 左右安全边距、圆角、允许出现的装饰语言。',
  '  正文里对不上的就地改掉；连形容颜色、形容尺寸的那句话也要一起改，',
  '  不要留下「写着 34px 但正文说成 8×56px 竖条」这种自相矛盾。',
  '- **规范里有、正文里压根没提的，要补写进去**。「逐项核对」不只是「把写错的改对」——',
  '  实测最容易漏的是**页脚与页码**：规范里写着「页脚高 48px、页码靠右写成 01」，',
  '  而改写后的正文里一个字都没提，出样机时模型自然就不画。',
  '  同理，规范里列出的视觉效果如果这一页该有、正文里没有，也要按规范的参数补一段。',
  '  **每一条规范都要能在正文里找到对应的一句话**，找不到就是漏了。',
  '- **字体只写变量名**：规范里点名的那些字体，正文里对应的角色要写成 `var(--font-display)` /',
  '  `var(--font-sans)` / `var(--font-script)` / `var(--font-numeric)`，**不要写字面字体名**，',
  '  也不要自己另起一个字体栈——变量由渲染层按规范定义，写死了就切不动了。',
  '- **视觉效果要逐项落实**：规范里列出的那些效果（渐变、毛玻璃、发光、霓虹），这一页该用到的',
  '  必须写进提示词，写清**用在哪、参数多少**；正文里有、但规范里没列的，删掉。',
  '  **这一条最容易漏**：效果往往只散在正文的某一句话里，改写时容易只盯着字号和颜色把它略过，',
  '  漏掉之后这一页就从「有辨识度」掉成「一个普通版式」。',
  '- **例外**：封面、封底、转折页的**整个标题区**（页标题、副标题、数字的字号/字重/颜色/对齐、',
  '  标题强调条）与**整个页眉区**（品牌标识的位置与尺寸、页眉字、页眉高）本来就是有意破格',
  '  （标题比正文页大得多、居中、页眉挪到另一边），这些**保持原样**，',
  '  不要把封面的 132px 标题压成页标题的字号。页脚同理（破格页不放页码）。',
  '  但这几页仍要按规范统一的四样是：**品牌标识的形态与颜色角色**（竖条还是方块、用哪个语义色，',
  '  那是这套风格的签名）、**四个字体角色**、**圆角**、**装饰语言与效果语言**。',
  '- **这一页自己的视觉创意一律保留**：它画什么图、卡片长什么样、内容怎么组织，',
  '  都是这一页的事，不要动。更不要把它改成另一个页类型。',
  '- 四个小节（角色 / 任务 / 视觉与排版要求 / 代码要求（非常重要））必须原样保留，',
  '  顺序与名称都不能改。改动集中在第三段。',
  '- 颜色一律引用规范与配色里的变量名，不要写死色值。',
  '',
  '只输出 JSON，不要任何解释：{"pages":[{"pageType":"...","prompt":"..."}]}',
].join('\n');

/**
 * 照规范改写提示词，**改好一批就吐一批**。
 *
 * 之所以是生成器而不是「返回一张全改完的表」：吐出来的每一页可以立刻拿去出样机，
 * 改写与出样机并行跑。出样机一张四分钟、改写一批一分钟，串起来跑白白浪费六分钟
 * （见 `mapLimitStream` 的注释）。调用方用 `mapLimitStream` 接这个流即可。
 *
 * 吐出来的只有**成功改写的那些页**：模型漏写、或改出来的东西不合四段契约的，
 * 一律不吐，由调用方保留原提示词。**宁可这一页没被统一，也不能落一条坏提示词**——
 * 坏提示词会把这一页之后每次生成都带偏，比不统一糟得多。
 *
 * 降级到内置 Mock 时**重发一次**：走到 Mock 说明主模型这一次失败了（实测偶发），
 * 而它给的是一段占位说明、不是提示词，静默收下会让整批悄悄不改，界面上却报「统一完成」。
 * 两次都降级才抛——抛出去会让整轮统一变成 error，这是对的：半途落库会让库里
 * 一部分页是新的一批是旧的，比整轮失败更难收拾。
 */
export async function* streamRewritesToSpec(
  gateway: ProviderGateway,
  doc: StyleDoc,
  spec: StyleSpec,
  pageTypes: PageType[],
): AsyncGenerator<{ pageType: PageType; prompt: string }> {
  for (let i = 0; i < pageTypes.length; i += REWRITE_BATCH) {
    const batch = pageTypes.slice(i, i + REWRITE_BATCH);
    const body = batch
      .map((t) => `【${PAGE_TYPE_LABEL[t]}】\n${doc.pagePrompts[t]!.prompt}`)
      .join('\n\n---\n\n');

    const ask = async () => {
      const res = await gateway.text({
        taskType: 'html_codegen',
        json: true,
        maxTokens: 32000,
        system: REWRITE_SYSTEM,
        messages: [{
          role: 'user',
          content: [
            '全篇统一的视觉规范：',
            specBlock(spec),
            '',
            '---',
            `要改的这几页（共 ${batch.length} 页，逐页返回）：`,
            body,
          ].join('\n'),
        }],
      });
      if (isMockPlaceholder(res.text)) {
        throw new Error(res.degraded
          ? `改写提示词降级到了内置 Mock（${res.degradeReason}）`
          : '改写提示词的路由指向内置 Mock，它给不出提示词');
      }
      return parseModelJson<{ pages?: unknown }>(res.text);
    };

    let parsed: { pages?: unknown } | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        parsed = await ask();
        break;
      } catch (err) {
        if (attempt === 1) throw err;
        logger.warn('改写提示词没拿到真回复，重发一次', {
          batch: batch.join(','), err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const list = Array.isArray(parsed?.pages) ? parsed.pages : [];
    let taken = 0;
    for (const item of list as Record<string, unknown>[]) {
      const t = toPageType(String(item.pageType ?? ''), batch);
      const prompt = str(item.prompt);
      // 页类型必须在这一批里（模型偶尔答非所问），四个小节一个都不能少
      if (!t) continue;
      if (!PROMPT_SECTIONS.every((s) => prompt.includes(s))) continue;
      yield { pageType: t, prompt };
      taken += 1;
    }
    /**
     * **模型根本没给出东西**（空列表、JSON 解析不出来）就抛，不静默跳过。
     *
     * 静默跳过的后果是「统一跑完了、只改了 2 页」——用户看到「已统一 2 页」会以为
     * 其余几页本来就不需要改，而它们一个字都没动。实测踩过：三批连着被 maxTokens
     * 截断，界面上却报成功。
     *
     * 注意**已经吐出去的那几批不会因此回滚**：调用方那边可能已经跑上样机了。
     * 这是有意的——整轮失败时那些样机跟着作废，但白跑的只是这一批之后的钱，
     * 比「为了回滚把已完成的也丢掉」划算。
     *
     * ## 为什么「给了但不合契约」不算在这里
     *
     * 这两种情形**必须分开**，因为 `REWRITE_BATCH` 是 1——一批就一页，
     * 「全批不合格」与「这一页不合格」成了同一件事。再按「整批空就抛」处理的话，
     * **任何一页写坏都会让整轮统一失败**，而它的后果（那一页保留原提示词、
     * 其余页照常统一）比整轮失败轻得多。
     *
     * 所以：模型没给东西 = 这一步坏了，抛；给了但缺段落 = 这一页写得不好，
     * 跳过并如实记进 `unrewritten`，由调用方报给用户。
     */
    if (list.length === 0) {
      throw new Error(`改写提示词：这一批（${batch.join('、')}）模型没给出任何提示词`);
    }
    if (taken === 0) {
      logger.warn('改写这一批一条都不合契约，整批跳过、保留原提示词', {
        batch: batch.join(','), returned: list.length,
      });
    }
  }
}

const CHECK_SYSTEM = [
  '你是资深视觉设计总监，在做设计验收。下面给你**一份全篇统一的视觉规范**和**某几页样机的 HTML**。',
  '',
  '请逐页比对，**只报对不上的地方**：四档字级（页标题 / 副标题 / 正文 / 数字）各自的',
  '字号、字重、颜色，正文的行高；标题强调条；页眉品牌标识的形态、尺寸、颜色与**它靠哪边**；',
  '页眉那一行字的字号、颜色、大小写；页脚高度与**页码靠哪边、写成长什么样**；',
  '安全边距、圆角、有没有出现规范之外的装饰；',
  '以及**规范里列出的视觉效果有没有在这一页做出来**。',
  '',
  '**视觉效果要重点查**：它是这套风格的辨识度所在，也最容易在产物里丢掉——',
  '模型图省事时会把毛玻璃写成实心色块、把外发光去掉、把渐变拉平成纯色。',
  '规范里有、而 HTML 里找不到对应写法的，报出来（`field` 写成 `effects.glass` 这种）。',
  '这一项封面、封底、转折页也不例外，每一页都要查。',
  '',
  '- **视觉效果只看「那件事有没有做出来」，色值写法不同不算**：规范里的十六进制',
  '  （`#CBF6DA` 这类）是从参考稿上量到的，而产物的契约明令「不出现字面色值、',
  '  一律引用变量」，两者永远不会逐字相等。要判的是**结构**——渐变的方向与档数、',
  '  有没有外发光、有没有 `backdrop-filter`、毛玻璃上有没有内高光细线。',
  '  结构在、只是颜色用变量表达的，**不要报**；那件事压根没做，才报。',
  '  （实测踩过：同一条「亮块主卡用 135° accent 浅青渐变」，八页全被报成偏差，',
  '  其中一半只是色值写法不同——一条真问题被八条噪音埋了。）',
  '- **效果是挂在元素上的，先看那个元素在本页有没有**：规范写「亮块主卡用 135° 渐变」，',
  '  而这一页压根没有亮块主卡（整页就是四张卡片、三层结构图这类），**不要报**——',
  '  效果的口径是「该用到的页必须做出来」，不是「每一页都要有」。',
  '  元素在、效果没做出来，才报。',
  '',
  '- **封面、封底、转折页的破格是有意为之**：这几页的整个标题区（页标题、副标题、数字的',
  '  字号/字重/颜色/对齐、标题强调条）与整个页眉区（品牌标识的位置与尺寸、页眉字、页眉高）',
  '  本来就和正文页不同，页脚也不放页码——**这些一概不要报**。',
  '  这几页仍要遵守、也该报的是：**品牌标识的形态与颜色角色**、**四个字体角色**、',
  '  **圆角**、**装饰语言与效果语言**。',
  '- 对得上的不要报。报的时候说清「规范要求什么」与「这一页实际是什么」，',
  '  比如 expected: "44px"、found: "46px"。',
  '- **只报你从 HTML 里能确证的**，看不出来就不要猜。',
  '',
  '只输出 JSON，不要任何解释：{"deviations":[{"pageType":"text","field":"title.sizePx","expected":"44px","found":"46px"}]}',
  '没有任何不一致时输出 {"deviations":[]}。',
].join('\n');

/**
 * 一致性自检：比对规范与**产物**。
 *
 * 查的是样机 HTML 而不是提示词——提示词写得对不代表跑出来就对，用户要的是
 * 「哪里还没拉齐」这个结论，而结论只能从产物上读。
 *
 * 查不动不算失败：自检是最后一步的参考信息，它挂了不该把前面已经统一好的结果作废，
 * 所以这里吞掉异常返回空列表，由调用方如实标注「自检没跑成」。
 */
export async function checkSpecConformance(
  gateway: ProviderGateway,
  doc: StyleDoc,
  spec: StyleSpec,
): Promise<SpecDeviation[]> {
  const covered = PAGE_TYPE_ORDER.filter((t) => doc.pagePrompts[t]?.mockHtml);

  const batches: PageType[][] = [];
  for (let i = 0; i < covered.length; i += CHECK_BATCH) batches.push(covered.slice(i, i + CHECK_BATCH));

  const checkBatch = async (batch: PageType[]): Promise<SpecDeviation[]> => {
    const body = batch
      .map((t) => `【${PAGE_TYPE_LABEL[t]}】(pageType=${t})\n${doc.pagePrompts[t]!.mockHtml}`)
      .join('\n\n---\n\n');

    const ask = async () => {
      const res = await gateway.text({
        taskType: 'html_codegen',
        json: true,
        maxTokens: 32000,
        system: CHECK_SYSTEM,
        messages: [{
          role: 'user',
          content: ['全篇统一的视觉规范：', specBlock(spec), '', '---', body].join('\n'),
        }],
      });
      // 降级到内置 Mock 时**抛**，不返回空列表：空列表到了界面上是「0 处不一致」，
      // 而用户看到这句话会以为已经全对齐了。抛出去由调用方标成「自检没跑成」。
      if (isMockPlaceholder(res.text)) {
        throw new Error(res.degraded
          ? `一致性自检降级到了内置 Mock（${res.degradeReason}）`
          : '一致性自检的路由指向内置 Mock，它给不出比对结果');
      }
      return parseModelJson<{ deviations?: unknown }>(res.text);
    };

    /**
     * 这一批重发一次。
     *
     * **原先不重发，理由是「为它多等一次主模型超时不值」——那个判断在串行时成立，
     * 现在不成立了。** 自检改成六批三路并发之后，重发一批只多等一批的时间，
     * 不进整轮的关键路径；而失败的代价没变：一批挂了整轮就没有清单。
     *
     * 实测这条不是纸上推演：八套里四套的自检没跑成，全是
     * `deepseek-v4.1-flash` 把 32000 预算烧在推理上、正文为空。而挂掉的批次下标
     * 每套都不一样（0、1、2、3 都出现过），说明是随机抽风、不是某一页的 HTML 特别难比。
     * 抽风重发一次多半就过了，而丢掉整份清单是实打实的损失。
     */
    let parsed: { deviations?: unknown } | null = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        parsed = await ask();
        break;
      } catch (err) {
        if (attempt === 1) throw err;
        logger.warn('一致性自检这一批没拿到结果，重发一次', {
          batch: batch.join(','), err: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const list = Array.isArray(parsed?.deviations) ? parsed.deviations : [];
    const out: SpecDeviation[] = [];
    for (const item of list as Record<string, unknown>[]) {
      const t = toPageType(String(item.pageType ?? ''), batch);
      if (!t) continue;
      out.push({
        pageType: t,
        field: str(item.field),
        expected: str(item.expected),
        found: str(item.found),
      });
    }
    return out;
  };

  /**
   * 六批**并发跑**，三路。串行跑实测要十五分钟，是整条链路最后一段长尾。
   *
   * `mapLimit` 会把抛了的那一批换成 `null`，所以这里要自己把 null 翻回错误——
   * **不能静默当成「这批没问题」**：那会让「自检没跑成」伪装成「0 处不一致」，
   * 而用户看到后者会以为已经全对齐了。
   */
  const out: SpecDeviation[] = [];
  for await (const r of mapLimit(batches, CHECK_CONCURRENCY, checkBatch)) {
    if (!r) throw new Error('一致性自检有一批没跑成，这一次没有完整的比对结果');
    out.push(...r);
  }
  return out;
}

/**
 * 换某个字体角色用哪套字体。
 *
 * ## 为什么不用重跑一轮统一
 *
 * 四个角色在页面里走 `--font-sans` / `--font-display` / `--font-script` / `--font-numeric`
 * 四个 CSS 变量，**换字体就是换变量值**——全篇每一页同时跟着变，这正是「一键切换、
 * 全风格统一」要的效果。而重跑一轮统一要十来分钟、还会把手改过的页跳过，
 * 为了换个字体付这个代价没有道理。
 *
 * 提示词里写的是变量名而不是字体名（`REWRITE_SYSTEM` 与 `fontBlock` 都这么要求），
 * 所以提示词一个字都不用动。
 *
 * ## 只收要改的那几项
 *
 * 与 `replacePagePrompt` 同一条理由：让客户端回传整份 doc，中间任何一个字段丢了
 * 都会被静默写掉。这里只收 `{display?: id, body?: id, ...}`，其余从库里读出来原样带过。
 */
export function setSpecFonts(
  styleId: string,
  patch: Partial<Record<SpecFontRole, string>>,
): StyleDoc {
  // 认不出的 id 挡在这里。放进去的话渲染层只会静默落回原字体，
  // 用户看到的是「点了没反应」，比一句「认不出这个字体」难查得多
  for (const [role, id] of Object.entries(patch)) {
    if (id && !fontStackOf(id)) throw invalid(`认不出的字体「${id}」（${role} 这一档）`);
  }

  const doc = resolveStyleDoc(styleId);
  if (!doc.spec) {
    throw invalid('这套风格还没提炼过视觉规范，先跑一次「提炼并统一」再来换字体');
  }

  const next = StyleDoc.parse({
    ...doc,
    spec: { ...doc.spec, fonts: { ...doc.spec.fonts, ...patch } },
  });
  const result = saveStyleDoc(next);
  if (!result.ok) throw invalid('这套风格没有可用的提示词，没有保存');
  return resolveStyleDoc(styleId);
}

/**
 * 一键统一。四步，边跑边报进度。
 *
 * 失败不抛，转成 `error` 事件——调用方是 SSE 路由，抛出去只会变成一个断掉的连接，
 * 用户看不到原因，也不知道是白等还是真失败。与 `fillMissingPageTypes` 同一个理由。
 */
export async function* unifyStyle(input: UnifyInput): AsyncGenerator<UnifyEvent> {
  // 包一层：撞限流要喂给共享的并发上限。**在入口包一次**，四步都走它
  const gateway = watchThrottle(input.gateway);
  // 出错时日志要能说清死在哪一步
  let step: UnifyStep = 'spec';
  try {
    const doc = resolveStyleDoc(input.styleId);

    /* ---- 1. 提炼规范 ---- */
    yield { event: 'progress', data: { step, label: '提炼视觉规范', done: 0, total: 1 } };
    const spec = await extractStyleSpec(gateway, doc);
    yield { event: 'spec', data: spec };
    yield { event: 'progress', data: { step, label: '规范已提炼', done: 1, total: 1 } };

    /* ---- 2+3. 照规范改写提示词，改好一批就开跑它的样机 ---- */
    step = 'rewrite';
    // 手改过的不动。如实报出来——悄悄跳过的话，用户以为全统一了，其实那几页还是旧的
    const editable = PAGE_TYPE_ORDER.filter((t) => doc.pagePrompts[t] && !doc.pagePrompts[t]!.edited);
    const skippedEdited = PAGE_TYPE_ORDER.filter((t) => doc.pagePrompts[t]?.edited);
    yield {
      event: 'progress',
      data: {
        step,
        label: `照规范改写 ${editable.length} 页的提示词，改好一页就开跑它的样机`,
        done: 0,
        total: editable.length,
      },
    };

    const entries: Record<string, StylePagePrompt> = {};
    const rewritten = new Map<PageType, string>();
    let mocked = 0;
    /** 改写那一段跑完了没有。用于给进度事件选一个诚实的步骤名 */
    let rewritesDone = false;

    /**
     * 把改写的产出包一层，顺手记进 `rewritten`。
     *
     * **两段现在是并行的**：`mapLimitStream` 从这一头拉一项就起一个样机任务，
     * 拉取本身受并发上限约束，所以改写不会被甩开太远，样机也不会一下子全发出去。
     * `finally` 里置位的那面旗子给进度事件用——并行跑的时候「当前在哪一步」不再是
     * 一个事实，只能按「改写还吐不吐得出东西」来判断。
     */
    const source = (async function* () {
      try {
        for await (const r of streamRewritesToSpec(gateway, doc, spec, editable)) {
          rewritten.set(r.pageType, r.prompt);
          yield r;
        }
      } finally {
        rewritesDone = true;
      }
    })();

    // 必须传 doc.fontFamily：与识别、补齐一个口径。不注入的话模型会自己发明字体栈。
    // **也必须传 spec**：不传的话样机只受那一条提示词约束，系统性细节（页脚页码、
    // 页眉、效果语言）会被略过——「统一」就只统一了提示词、没统一产物。
    for await (const m of mapLimitStream(source, MOCK_CONCURRENCY, async (r) => ({
      pageType: r.pageType,
      ...(await generateMock(gateway, r.prompt, doc.palette, fontStacksOf(doc), spec, r.pageType)),
    }))) {
      mocked += 1;
      yield {
        event: 'progress',
        data: {
          step: rewritesDone ? 'mock' : 'rewrite',
          label: rewritesDone
            ? `已出样机 ${mocked}/${editable.length} 页`
            : `改写与出样机并行：${rewritten.size}/${editable.length} 页已改写、${mocked} 页已出样机`,
          done: mocked,
          total: editable.length,
        },
      };
      if (!m) continue;
      entries[m.pageType] = {
        pageType: m.pageType,
        prompt: rewritten.get(m.pageType)!,
        mockHtml: m.html,
        // 改写过的页在这一层上仍算「推导」：它不是在参考图里读到的
        source: doc.pagePrompts[m.pageType]!.source,
        /*
          版式绑定照原样带过。**今天这里恒为空串**——绑了骨架的页一定是 `edited`，
          而 `editable` 上面那条就把 `edited` 滤掉了。写成「读旧值」而不是写死空串，
          是为了将来那条过滤规则一改，绑定不会无声无息地掉。
        */
        layoutId: doc.pagePrompts[m.pageType]?.layoutId ?? '',
        issues: m.issues,
        edited: false,
      };
    }

    // 契约里的 page 事件照旧发（客户端目前只认 progress / done，但别让它悄悄消失）
    for (const [t, prompt] of rewritten) yield { event: 'page', data: { pageType: t, prompt } };

    const targets = [...rewritten.keys()];
    // 样机没出来的页也要把**改写后的提示词**留下：提示词是这一步的主要产物，
    // 因为样机失败就把它丢掉，等于这一页白改
    for (const t of targets) {
      if (entries[t]) continue;
      entries[t] = {
        pageType: t, prompt: rewritten.get(t)!, mockHtml: '',
        source: doc.pagePrompts[t]!.source, layoutId: doc.pagePrompts[t]?.layoutId ?? '',
        issues: [], edited: false,
      };
    }
    // 该改却没改上的页。必须报出来：用户看到「已统一 N 页」时，得知道剩下那几页
    // 是这一轮没改上，而不是本来就不需要改
    const unrewritten = editable.filter((t) => !rewritten.has(t));

    /* ---- 4. 自检 ---- */
    step = 'check';
    yield { event: 'progress', data: { step, label: '比对规范与样机', done: 0, total: 1 } };
    // 自检用**合并之后**的文档：样机没出来的页在合并后是空样机，自检那边会自动跳过
    const merged = StyleDoc.parse({
      ...doc,
      spec,
      pagePrompts: { ...doc.pagePrompts, ...entries },
    });
    let deviations: SpecDeviation[] = [];
    let checked = true;
    try {
      deviations = await checkSpecConformance(gateway, merged, spec);
    } catch (err) {
      // 自检挂了不该把前面已经统一好的结果作废——它是参考信息，不是产物。
      // 但**必须如实说没跑成**：报一句「0 处不一致」等于告诉用户已经全对齐了
      checked = false;
      logger.warn('一致性自检失败，统一结果照常落库', {
        styleId: input.styleId, err: err instanceof Error ? err.message : String(err),
      });
    }
    yield {
      event: 'progress',
      data: {
        step,
        label: checked ? `自检完成，${deviations.length} 处仍不一致` : '自检没跑成，这一次没有比对结果',
        done: 1,
        total: 1,
      },
    };

    /* ---- 5. 落库 ---- */
    // **单次 spread**，与 `fillMissingPageTypes` / `replacePagePrompt` 同形：
    // palette / fontFamily / meta（含 reviewed）/ deckPrompt 一律原样带过
    const result = saveStyleDoc(merged);

    yield {
      event: 'done',
      data: {
        doc: resolveStyleDoc(input.styleId),
        spec,
        rewritten: targets,
        skippedEdited,
        unrewritten,
        deviations,
        checked,
        issues: result.issues,
      },
    };
  } catch (err) {
    logger.warn('统一风格失败', {
      styleId: input.styleId, step,
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    yield { event: 'error', data: { message: publicRedrawMessage(err) } };
  }
}
