import {
  STUDIO_MODULE_LABEL,
  imageGroupOf,
  imageSlotNumbers,
  isValidLayoutGroup,
  layoutGroupsOf,
  type LayoutRecognizeStep,
  type ProgressPayload,
  type StudioModuleId,
} from '@lumen/ir-schema';
import type { ProviderGateway } from '@lumen/provider-gateway';
import { logger } from '../lib/logger.js';
import { parseModelJson } from '../lib/model-reply.js';
import { billedGateway } from './billed-gateway.js';
import { validateSkeleton } from './studio-layout.service.js';

/**
 * 从一张参考图识别一份版式骨架。
 *
 * ## 只产出骨架，不落库
 *
 * 识别流**不写库**。它吐出来的是一份候选骨架，用户在界面上看过样机、改过名字与分组、
 * 点了保存，才走 `POST /studio/layouts` 落库（那条会**再校验一遍**）。
 * 理由：识别是模型产出的，一次可能不合口味；先落库再让用户删，库里会攒一堆没人要的骨架，
 * 而删掉的那些 id 已经花出去了。识别是**只读**的，重跑多少次都不留痕。
 *
 * ## 两步
 *
 * `read`（看图写骨架）与 `check`（校验）是两步，**但只有一次模型调用**。
 * 骨架不合规时会让模型带着问题重写一版，那一次**仍然报 `check`**、只换 label——
 * 阶段序必须单调前进，报成 `read → check → read` 的话阶段徽标会往回退，
 * 看着像卡住又重来。
 *
 * ## 提示词为什么写得这么啰嗦
 *
 * 骨架的三条硬约束（只用 CSS 变量、图位写法、裁切方式）是这次最容易失败的地方。
 * 模型默认就会写死十六进制色值、给 `<img>` 加 `object-fit`——而这两样恰好会被
 * `lintMockHtml` 判死、或在真渲染时被带 `!important` 的样式表压掉。
 * 所以约束要**逐条复述**，不能指望它从「用变量」三个字里推出来。
 *
 * ## 图位那两条按模块分岔，不能共用
 *
 * 两个库的图位约定**正好相反**，写一份共用的提示词必然把其中一个说反：
 *
 * - **人物排版**：图位标 `data-lumen-cutout="head|half"`，且**不许**写 `object-fit`
 *   （页面样式表里有一条 `contain !important`，写了会静默失效）。
 * - **图文排版**：图位**不许**标 `data-lumen-cutout`（标了就变成从人像库取图，
 *   一页图阵里会冒出十几张人像），而且**必须**写 `object-fit:cover` 把照片裁满格子。
 */

/* ---------------- 提示词 ---------------- */

/**
 * 骨架的硬约束。**按模块取**——图位那两条两个库正好相反，见文件头。
 *
 * 共用的那几条（配色、静态标签、画布尺寸、占位文案）只写一遍，
 * 分岔的插在中间，免得改一条要改两处。
 */
function systemFor(moduleId: StudioModuleId): string {
  /*
    **界面排版不走这条路。** 另外三个库的骨架是「版面的样子」，从参考图抽象得出来；
    界面骨架不是——它里面嵌着**我们自己的设备渲染图**、屏幕四角的 `matrix3d`、
    以及姿态溶解时序，这三样都是从 three.js 渲染算出来的（见 `ui-skeletons.ts`）。
    让识别器照参考图写一份，写出来的设备不会是我们的那一台。

    显式抛错而不是落到下面那个「普通图位」的兜底分支：兜底会让识别器写出一份
    **没有设备**的骨架，而它看起来是正常的、能被保存、能出现在功能库里——
    要到生成时才会发现「这一页没有设备」。宁可在这里明确失败。

    真要做「照参考图铺开界面版式」，得改成「参考图只提供版面构图，设备那一块
    照抄我们给的一段模板」——那是另一件事，见 `ui-layouts.ts` 顶部。
  */
  if (moduleId === 'ui-layouts') {
    throw new Error('界面排版的骨架由设备渲染生成（ui-skeletons.ts），不走「识别参考图」这条路');
  }
  const slotRules = moduleId === 'people-layouts'
    ? [
      '2. **人像位写成 `<img data-lumen-image="1" data-lumen-cutout="half">`**，',
      '   **不写 `src`**（真图由下游按顺序填进去），编号从 1 起、连续不跳号。',
      '   `data-lumen-cutout` 的值**按参考图里那个位置画的是什么来标**，只有两个取值：',
      '   `"head"`——画的是**头肩**（头像、圆形头像、小方块头像）；',
      '   `"half"`——画的是**头到腰 / 头到胯**（半身像、单人主视觉、竖条里的立像）。',
      '   标错就会出现「头像位里放了一张头到膝盖的图」。',
      '3. **不要给 `<img>` 写 `object-fit`，也不要写放大裁切。**',
      '   素材库的人像本身就是对的取景，页面样式表里有一条带 `!important` 的 `contain` 规则',
      '   会自动按图位高度撑满——写了 `object-fit` 会被它压掉，等于没写；',
      '   而 `width:350%;margin:…` 那套大幅放大是照「全身站姿」调的，套在已经裁好的半身像上会把头切掉。',
    ]
    : moduleId === 'chart-layouts'
      ? [
        '2. **图表区写成「图表槽」**：一个 `<div>`，带 `data-lumen-chart="宽x高"` 属性，',
        '   属性值是那个区域的实际像素尺寸（例如 `data-lumen-chart="1680x520"`），',
        '   **与你在这个 `<div>` 的样式里写的 `width`/`height` 逐字一致**——对不上出图会变形。',
        '   这个 `<div>` 里**只放一段 JSON**，形如：',
        '   `{"kind":"bar","categories":["第一季度","第二季度"],"series":[{"name":"营收","values":[128,164]}]}`。',
        '   `kind` 写参考图里那种图：柱状图 `bar`、条形图 `barH`、折线图 `line`、面积图 `area`、',
        '   饼图 `pie`、雷达图 `radar`、散点图 `scatter`、桑基图 `sankey`、漏斗图 `funnel`、',
        '   热力图 `heatmap`、树状图 `treemap`、流程图 `flowchart` 等。',
        '   数据用参考图上的数字；看不清就写合理的示例值，**条数按参考图来**。',
        '   **JSON 里一个颜色都不要写**——配色由渲染层按风格填，写死色值换风格就不跟着变了。',
        '3. **不要自己用 CSS 或 SVG 画图表**：柱子、折线、扇区全部由渲染层出图，',
        '   你只负责版面，以及槽里那份数据。',
      ]
      : [
      '2. **图位写成 `<img data-lumen-image="1">`**，**不写 `src`**（真图由下游按顺序填进去），',
      '   编号从 1 起、连续不跳号。**一页最多 12 个图位。**',
      '',
      '   **绝对不要写 `data-lumen-cutout`**——那个标记是给「透明底人像」用的，',
      '   写了这个图位就会从**人像库**取图，一页图阵里冒出十几张人像。这一页要的是普通照片。',
      '3. **照片要裁满格子**：外层容器写 `overflow:hidden`，里面的 `img` 写',
      '   `.ph{overflow:hidden} .ph img{width:100%;height:100%;object-fit:cover;display:block}`。',
      '   **不要用容器放大位移去裁**（`width:350%;margin:…` 那套）——那是给抠图用的，照片不需要。',
    ];

  return [
    '你是资深演示文稿版面设计师。我给你一张演示文稿某一页的设计稿，',
    '请把它**抽象成一份可复用的 HTML 骨架**：保留版面的结构与比例，去掉具体内容。',
    '',
    '只输出 JSON，不要任何解释：',
    '{',
    '  "name": "这份版式的名字（8 个字以内，说清是什么排法，如「左图右文对角」「三列等高卡」）",',
    '  "brief": "一句话说清它长什么样、适合放什么内容（不少于 8 个字）",',
    '  "group": "分组，只能取下面给的候选值之一",',
    '  "skeleton": "骨架 HTML，一个完整的 <div> 根节点（含它内部的 <style>）"',
    '}',
    '',
    '骨架必须满足下面每一条，**这些是硬约束，违反了这份骨架就没法用**：',
    '',
    '1. **配色一律走 CSS 变量**，一个十六进制色值都不许写。能用的变量只有这些：',
    '   `var(--bg)` `var(--surface)` `var(--text)` `var(--muted)` `var(--accent)` `var(--brand)` `var(--border)`。',
    '   不要写 `#RRGGBB`、不要写 `rgb(...)`、不要写 `rgba(...)`。深浅变化用 `opacity`，',
    '   不要自己调一个 rgba 出来。',
    ...slotRules,
    '4. 只用 `<div>` `<style>` `<img>` `<span>` `<p>` 这些静态标签。',
    '   **不要 `<script>`、不要 `<a>`、不要外链字体或图片。**',
    '5. 根 `<div>` 上写死画布尺寸 `width:1920px;height:1080px`，并且 `position:relative`，',
    '   内部一律绝对定位或 flex 布局，比例照参考图。',
    '6. 文字用占位内容（人名、职位、标题这类示例文字），**尺寸与疏密要照参考图**——',
    '   写具体一点，让版式的松紧看得出来。',
    '',
    '骨架会被直接塞进生成提示词当示例，所以**它自己长什么样，以后每一页就长什么样**：',
    '排版要经得起复用，不要为这一页的偶然内容做特例。',
  ].join('\n');
}

/** 重试时追加的一段。把上一版的具体问题原样报回去，比让它自己猜有效得多 */
const RETRY_HEAD = [
  '',
  '---',
  '',
  '你上一版骨架有下面这些问题，**请重写一版，逐条改掉**：',
].join('\n');

/* ---------------- 类型 ---------------- */

export interface LayoutRecognitionInput {
  moduleId: StudioModuleId;
  /** 参考图，data URL 形式 */
  imageUrls: string[];
  tenantId: string;
  userId: string;
  /**
   * 演示用的注入点，测试里换成假的网关。不传就自己建一个（路由走这条）。
   *
   * 默认值取 `billedGateway` 而不是 `buildGateway`——后者不落账。这条流真花钱。
   */
  gateway?: ProviderGateway;
}

/** 识别出来的骨架。**还没落库**，等用户在界面上确认 */
export interface RecognizedLayout {
  name: string;
  brief: string;
  group: string;
  skeleton: string;
  /** 图位数。多图排版才有，由服务端从骨架里数出来，不采信模型自报 */
  slots?: number;
}

export type LayoutRecognitionEvent =
  | { event: 'progress'; data: ProgressPayload<LayoutRecognizeStep> }
  | { event: 'skeleton'; data: RecognizedLayout }
  | { event: 'error'; data: { message: string } };

/* ---------------- 主流程 ---------------- */

export async function* runLayoutRecognition(
  input: LayoutRecognitionInput,
): AsyncGenerator<LayoutRecognitionEvent> {
  const gateway = input.gateway ?? billedGateway(input.tenantId, input.userId);
  // 库名只从 `STUDIO_MODULE_LABEL` 取。早先这里各写了一份「人物排版 / 多图排版」的三元式，
  // 改名时要改三处，漏一处界面与报错的口径就不一致
  const what = STUDIO_MODULE_LABEL[input.moduleId];

  try {
    if (input.imageUrls.length === 0) {
      yield { event: 'error', data: { message: '没有参考图，没法识别版式' } };
      return;
    }

    yield { event: 'progress', data: { step: 'read', label: '正在看这张设计稿', done: 0, total: 1 } };
    let draft = await readLayout(gateway, input.moduleId, input.imageUrls);
    yield { event: 'progress', data: { step: 'read', label: '已经写出一版骨架', done: 1, total: 1 } };

    let issues = validateSkeleton(input.moduleId, draft.skeleton);
    yield {
      event: 'progress',
      data: {
        step: 'check',
        label: issues.length === 0 ? '骨架合规' : `有 ${issues.length} 处不合规，正在重写`,
        done: issues.length === 0 ? 1 : 0,
        total: 1,
      },
    };

    if (issues.length > 0) {
      // 带问题重写一版。识别是只读的，重试没有副作用，值得多花一次调用
      draft = await readLayout(gateway, input.moduleId, input.imageUrls, issues);
      issues = validateSkeleton(input.moduleId, draft.skeleton);
      yield {
        event: 'progress',
        data: {
          step: 'check',
          label: issues.length === 0 ? '骨架合规' : '重写后仍有问题',
          done: 1,
          total: 1,
        },
      };
    }

    if (issues.length > 0) {
      /**
       * **两次都不合规就不给骨架。** 把一份坏骨架交给用户保存，他会存进去，
       * 然后每次拿它换排版都生成出一页被判不合规、重试、最后降级——
       * 报错时用户至少知道是这张参考图读不出来。
       */
      yield { event: 'error', data: { message: `这份参考图没能识别成可用的${what}骨架：${issues.join('；')}` } };
      return;
    }

    yield { event: 'skeleton', data: normalize(draft, input.moduleId) };
  } catch (err) {
    logger.warn('版式识别失败', { err: err instanceof Error ? err.message : String(err) });
    yield { event: 'error', data: { message: err instanceof Error ? err.message : String(err) } };
  }
}

/* ---------------- 分步实现 ---------------- */

interface Draft {
  name: string;
  brief: string;
  group: string;
  skeleton: string;
}

/** 一次模型调用：看图 → 一版骨架。`problems` 非空时是重试，把上一版的问题一并报回去 */
async function readLayout(
  gateway: ProviderGateway,
  moduleId: StudioModuleId,
  images: string[],
  problems: string[] = [],
): Promise<Draft> {
  const groups = layoutGroupsOf(moduleId);
  const groupList = groups.map((g) => `\`${g.key}\`（${g.label}）`).join('、');
  const ask = [
    `这是一张演示文稿设计稿，请把它抽象成一份「${STUDIO_MODULE_LABEL[moduleId]}」骨架。`,
    '',
    /*
      图文排版的分组是**按图位张数**算出来的，不是模型判断出来的——所以不问它。
      问了它也只会在 `feature`/`multi` 之间瞎猜，猜错就存下一份「声明一个图位、
      骨架里有六个」的记录，而分组决定它在功能库里落在哪一节。
    */
    moduleId === 'people-layouts'
      ? `\`group\` 只能取其中一个：${groupList}。`
      : '`group` 不用你判断（系统按骨架里的图位张数算），给一个字符串占位即可。',
    problems.length > 0 ? `${RETRY_HEAD}\n${problems.map((p) => `- ${p}`).join('\n')}` : '',
  ].filter(Boolean).join('\n');

  const res = await gateway.text({
    taskType: 'style_recognize',
    json: true,
    // 骨架本身一两千 token，但模型会先推演版面再写，预算给宽一点
    maxTokens: 16000,
    temperature: 0.3,
    system: systemFor(moduleId),
    messages: [{ role: 'user', content: ask, images }],
  });

  const raw = parseModelJson<Record<string, unknown>>(res.text) ?? {};
  return {
    name: typeof raw.name === 'string' ? raw.name.trim() : '',
    brief: typeof raw.brief === 'string' ? raw.brief.trim() : '',
    group: typeof raw.group === 'string' ? raw.group.trim() : '',
    skeleton: typeof raw.skeleton === 'string' ? raw.skeleton.trim() : '',
  };
}

/**
 * 把模型的一版草稿收成一份能用的骨架。
 *
 * 只在**已经过了校验**之后调用，所以这里处理的都是「模型没明说、但有个合理默认」的字段：
 * 名字空了给个兜底名，分组认不出就落到该模块的第一个分组（界面上下拉框本来就能改，
 * 这里给个合法值是为了别让保存那一步因为一个空字段被打回来）。
 *
 * **图文排版的分组不看模型给的值**，由骨架里的图位张数算——见 `imageGroupOf`。
 */
function normalize(draft: Draft, moduleId: StudioModuleId): RecognizedLayout {
  if (moduleId === 'image-layouts') {
    const slots = imageSlotNumbers(draft.skeleton).length;
    return {
      name: draft.name || '识别的图文版式',
      brief: draft.brief,
      group: imageGroupOf(slots),
      skeleton: draft.skeleton,
      slots,
    };
  }
  return {
    name: draft.name || '识别的人物版式',
    brief: draft.brief,
    group: isValidLayoutGroup(moduleId, draft.group) ? draft.group : (layoutGroupsOf(moduleId)[0]?.key ?? ''),
    skeleton: draft.skeleton,
  };
}
