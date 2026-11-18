import {
  PageAnalysis as PageAnalysisSchema,
  snapToFontLadder,
  type BandRead, type BandSpec, type LayoutGrid,
  type MeasuredPage, type PageAnalysis, type PageRecipe, type PageType,
  type RecognizeResult, type StylePack, type TypographyRoleName,
} from '@lumen/ir-schema';
import {
  cropForMeasure, decodeImage, measurePages, normalizeCropBox, toDataUrl,
  NOT_MEASURABLE, VISION_COVERED, notMeasurableClause,
  type CropBox, type DecodedImage,
} from '@lumen/style-engine/server';
import { ALLOWED_WEIGHTS, buildLayouts, deriveMeasuredLayout, placeOnGrid } from '@lumen/style-engine';
import { logger } from '../lib/logger.js';
import type { ProviderGateway } from '@lumen/provider-gateway';
import { buildGateway, requireRoute } from './provider.service.js';
import { recordUsage } from './usage.service.js';

/**
 * 用**看图模型**读设计稿，补上像素量不出来的那一半。
 *
 * 分工是刻意的，两边各管各的：
 *
 * - **像素**给客观事实：底色、品牌色的精确值，横带的位置与高度，栏数、对齐、网格。
 *   这些是数得出来的，模型的目测反而不如它准。
 * - **模型**给语义：这是封面还是图表页、版式怎么排、字体族是什么、字号多大、
 *   这一页该配什么图。这些**本质上不是像素问题**——像素里没有「字体族」这个概念，
 *   300px 宽的缩略图上连 6px 的字都糊成一团，靠行距反推字号只能猜个量级。
 *
 * 这也是「真实找到每个页面」的答案：模型能一眼看出拼图里排了五张幻灯片、
 * 哪张是封面，而像素法只能按「与底色差得远」的连通块去猜，遇到通栏大封面
 * 配两栏小页的版式就会漏掉封面。
 *
 * 与 `refineRecognitionWithModel` 一样的原则：模型不可用、超时、返回不合法时
 * **静默退回像素结果**，绝不因为模型的问题让识别失败。
 */

/** 一次识别的模型调用上限，防止用户传十几张图时打爆账单 */
const MAX_VISION_PAGES = 12;
/** 并发读页数。太高会被服务端限流，太低则整次识别拖到一分钟以上 */
const PAGE_CONCURRENCY = 3;

/**
 * 看图模型能返回的页类型。
 *
 * 这一份是**唯一真值**：下面两个提示词里的页类型枚举都由它拼出来，分页结果的校验也用它。
 * 以前三处各写一份字面量，加页类型时漏一处就会出现「提示词提供了、校验却不收」或
 * 「校验收了、提示词没提」——模型要么标不出这个类型、要么标出来后被静默降级成正文页，
 * 于是这一页本该承载的版式就丢了，而且只留一行 warn，极难查。
 */
const PAGE_TYPES: PageType[] = [
  'cover', 'toc', 'section', 'text', 'imageText', 'gallery', 'people', 'ui', 'chart', 'architecture', 'mindMap', 'metrics', 'end',
];

/** 页类型的中文名，提示词里用它，比英文 id 更不容易被模型理解偏 */
const PAGE_LABEL: Record<PageType, string> = {
  cover: '封面', toc: '目录', section: '转折页', text: '正文页',
  imageText: '图文页', gallery: '图片排版页', people: '人物页', chart: '图表页',
  ui: '界面页',
  architecture: '架构图', mindMap: '思维导图', metrics: '指标页', end: '封底',
};

/** 分页提示词。页类型枚举由 PAGE_TYPES 拼出，与校验口径同源 */
export const SPLIT_PROMPT = [
  '这张图里排了好几张幻灯片（也可能只有一张）。请找出每一张幻灯片。',
  '坐标用归一化值：左上角是 (0,0)，右下角是 (1,1)，x 向右、y 向下。',
  `pageType 只能取：${PAGE_TYPES.map((t) => `${t}(${PAGE_LABEL[t]})`).join(' ')}。`,
  '只输出 JSON，不要任何解释：{"slides":[{"pageType":"cover","x0":0.04,"y0":0.15,"x1":0.96,"y1":0.55}]}',
  '按从上到下、从左到右的顺序排列。图中如果只有一张幻灯片，就只返回一项。',
].join('\n');

/** 读解提示词。JSON 例子里的 pageType 取值由 PAGE_TYPES 拼出，与校验口径同源 */
export const READ_PROMPT = [
  '你是顶级平面设计总监。这是从一份演示文稿里裁出来的一页，请读解它的设计。',
  '字号请折算到 1920×1080 的画布上给出。坐标一律用归一化值：左上 (0,0)，右下 (1,1)。',
  '只输出 JSON，不要任何解释：',
  '{',
  `  "pageType": "${PAGE_TYPES.join('|')}",`,
  '  "designStyle": "这套设计风格叫什么（给一个具体的名字，如「瑞士极简」「杂志编辑风」「深色科技风」）",',
  '  "background": "底色的中文描写（是不是渐变、有没有大图或光斑、具体是什么颜色）",',
  '  "layout": "内容布局的中文描写：几条横向区域、每块放什么、左对齐还是居中、有没有分栏",',
  '  "hierarchy": "信息分层：一眼看过去先看到什么、其次什么、最后什么，以及靠什么手段拉开层次（字号/色块/位置）",',
  '  "columns": 主内容区分几栏（整数）,',
  '  "bands": [{"role":"eyebrow|title|subtitle|body|visual|metrics|footer","topRatio":0.0,"heightRatio":0.15,'
    + '"leftRatio":0.05,"widthRatio":0.9,"columns":1,"note":"这条带放什么"}],',
  '  "typography": [{"role":"display|title|subtitle|body|caption|metric|mono","sample":"这一行实际显示的文字",'
    + '"family":"最接近的字体族，给具体名字如 Inter / Helvetica Neue / 思源黑体","serif":false,'
    + '"sizePx":108,"weight":700,"letterSpacingEm":0,"color":"#RRGGBB"}],',
  '  "card": {"radius":12,"surface":"flat|tinted|glass|outlined","border":true,"shadow":"none|sm|md|lg"},',
  '  "palette": {"background":"#RRGGBB","text":"#RRGGBB","brand":"#RRGGBB","accent":"#RRGGBB"},',
  '  "imagePrompt": "这一页若要用 AI 生成配图该给什么提示词（中文，说清主体、风格、色调、构图、留白，不含文字/logo/真人）"',
  '}',
  '',
  'bands 是这一页的**区域划分**，要如实描述，不要套模板：',
  '- 主体文字按从上到下排列：首条 topRatio 接近 0，末条 topRatio + heightRatio 接近 1。',
  '- role：eyebrow 眉标、title 标题、subtitle 副标题、body 正文或要点、visual 图区、metrics 指标卡、footer 页脚。',
  '- 一条带里如果有并列的多块（三张卡片、图左文右），columns 填栏数，leftRatio/widthRatio 填整条带的范围。',
  '- **左右分区要各自成带**：一侧是一整块（满高的照片、色块、装饰图形）时，把它单独给一条带——'
    + 'topRatio 填 0、heightRatio 填 1，leftRatio/widthRatio 填它占的那一侧；文字那一侧照常按上面几条排。'
    + '这样两条带在横向上并排、纵向上重叠，那正是「并排」的意思，不要为了不重叠而把它压成一条底部的横带。',
  '- **整页铺满一张实拍图当底**（杂志封面那种：照片满铺，文字压在上面）时，也要给它一条 visual 带——'
    + 'topRatio 0、heightRatio 1、leftRatio 0、widthRatio 1，并在 note 里写「满铺底图」。'
    + '不要因为「它是背景」就不给带，那样这张照片在别处就没有着落了。',
  '- 除了上面两种「整块」与「满铺底图」，其余各带之间不留空隙也不重叠。',
  '- 只有整页真的只有一块内容时才给一条带。',
  '',
  'typography 的 role 是**另一套**，只能取 display / title / subtitle / body / caption / metric / mono，',
  '不要把它和上面 bands 的 role 混用（bands 里才用 eyebrow / visual / metrics / footer）。',
].join('\n');

interface SlideRef { pageType: PageType; box: CropBox }

export interface VisionInput {
  /** 上传的设计稿 data URL，顺序与识别时一致 */
  imageUrls: string[];
  /** 像素量出来的结果，作为底座 */
  baseline: RecognizeResult;
  tenantId: string;
  userId: string;
}

/**
 * 返回补全后的结果；模型不可用或结果不合法时原样返回 baseline。
 */
export async function analyzeDesignWithVision(input: VisionInput): Promise<RecognizeResult> {
  const { imageUrls, baseline } = input;
  if (imageUrls.length === 0) return baseline;

  /**
   * 先确认配的模型真的能看图。
   *
   * 不看这一关的话，文本模型会**照着提示词编**一份分页与字体出来——不报错、
   * 结果看着还挺像，但全是假的。识别结果里混进假数据比明说「这一步没跑」糟糕得多，
   * 所以宁可保守：名字不像能看图的就不试，并在结果里说清为什么没跑。
   */
  let model = '';
  try {
    model = requireRoute('style_recognize').primary.model;
  } catch {
    return baseline;
  }
  if (!modelLikelySupportsVision(model)) {
    return {
      ...baseline,
      modelNote: `当前文本模型 ${model} 不支持看图，版式与排印沿用像素测量结果`,
    };
  }

  let gateway: ProviderGateway;
  try {
    gateway = buildGateway({
      // 看图读设计稿同样是真花钱的调用，一样要落账
      onUsage: {
        record: (e) => recordUsage({
          tenantId: input.tenantId,
          userId: input.userId,
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
  } catch (err) {
    return degrade(baseline, err);
  }

  let decoded: DecodedImage[];
  try {
    decoded = imageUrls.map((u) => decodeImage(u));
  } catch (err) {
    return degrade(baseline, err);
  }

  try {
    /* ---- 1. 每张图切分：模型给框与页类型 ---- */
    const perImage: SlideRef[][] = [];
    for (const [i, img] of decoded.entries()) {
      perImage.push(await splitSlides(gateway, imageUrls[i]!, img));
    }
    const found = perImage.reduce((n, s) => n + s.length, 0);
    if (found === 0) {
      logger.info('看图模型没有给出分页，沿用像素切分');
      return {
        ...baseline,
        modelAssisted: true,
        modelNote: '看图模型没有给出分页，版式沿用像素测量结果',
      };
    }

    /* ---- 2. 用模型给的框重跑像素量测 ---- */
    // 关键：预览用的框与量版式用的框必须是**同一个**。分开切两次的话，
    // 差一点点就够让样机与原图错位，用户看着「像不像」时无从判断是谁的问题
    const boxes: CropBox[][] = perImage.map((slides) => slides.map((s) => s.box));
    const { measuredPages, measured, splitNote } = measurePages(decoded, baseline.stylePack, boxes);

    // 模型判的页类型优先——它看得到整页，像素只能按横带形状猜
    const typed: MeasuredPage[] = measuredPages.map((p, i) => {
      const t = perImage[p.imageIndex]?.[indexInImage(perImage, i, p.imageIndex)]?.pageType;
      return t ? { ...p, pageType: t } : p;
    });

    /* ---- 3. 逐页读解 ---- */
    const capped = typed.slice(0, MAX_VISION_PAGES);
    const analyses = await mapLimit(capped, PAGE_CONCURRENCY, async (p) => {
      const img = decoded[p.imageIndex];
      if (!img) return null;
      return readPage(gateway, toDataUrl(cropForMeasure(img, p.cropBox)));
    });

    /**
     * 横带结构以**模型的读解**为准，像素的横带退居兜底。
     *
     * 这是实测逼出来的：照片满幅 + 浅底的稿子上，像素法会塌成一条大带
     * （同一张稿，像素给出「标题带高 79%」，模型给出「标题 9–41% / 正文 41–72%」，
     * 后者才对得上原稿）。像素的强项是色彩与跨页聚合出来的网格（栏距、基线、边距），
     * 单页横带位置在三百来像素宽的缩略图上本来就不牢靠。
     *
     * 模型没读出来（调用失败、只给了文字没给带）时保留像素的那一份，绝不把页面清空。
     */
    const withBands: MeasuredPage[] = typed.map((p, i) => {
      const a = i < capped.length ? analyses[i] : null;
      const reads = a?.bands ?? [];
      if (reads.length === 0) return a ? { ...p, analysis: a } : p;

      const box = contentBoxOf(reads);
      return {
        ...p,
        analysis: a!,
        // 模型读出来了就采信：像素那份在这里是「量不出」或「塌成一条」，比没有更糟
        ok: true,
        note: '',
        contentBox: box,
        align: alignOf(reads),
        bands: bandsFromRead(reads, measured.grid, box),
      };
    });

    const remeasured = deriveMeasuredLayout(withBands, baseline.stylePack, measured.grid);
    const withAnalysis = withBands;

    const read = withAnalysis.filter((p) => p.analysis).length;

    /* ---- 4. 合并进风格包 ---- */
    const stylePack = mergeIntoPack(baseline.stylePack, withAnalysis, remeasured);

    /**
     * 待确认项与描述都要**跟着这一趟重算**。
     *
     * 像素那趟是按它自己切出来的页量的，它会把没覆盖到的页类型写进待确认项
     * （「没有设计稿覆盖 chart、metrics…」）。模型这一趟常常切出更多的页
     * （实测同一张拼图：像素切 4 页、模型切 5 页），那句提示就变成假的了——
     * 用户看着一条明确说错的提示，没法判断到底该信哪边。
     */
    const pendingConfirm = [
      ...baseline.pendingConfirm.filter((p) => p.field !== 'layouts'),
      ...remeasured.pending,
    ];

    const stillMissing = NOT_MEASURABLE.filter((x) => !VISION_COVERED.includes(x));
    const appliedClause = remeasured.applied.length > 0
      ? `版式按原稿实测：${remeasured.applied.join('；')}。`
      : '';
    const description = baseline.stylePack.description
      // 整段换掉而不是只换句尾：容量、疏密、页边距、网格都跟着这一趟的测量变了
      .replace(/版式按原稿实测：[^。]*。/, appliedClause)
      .replace(notMeasurableClause(NOT_MEASURABLE), notMeasurableClause(stillMissing))
      + (read > 0 ? `字体族、字号、版式意图与配图提示词由看图模型逐页读出（${read} 页）。` : '');

    /**
     * 用模型读出的风格名给包命名。
     *
     * 原来一律叫「<基准族名>（识别）」，识别几套下来列表里全是「商务经典（识别）」，
     * 用户根本分不清哪套是哪个。模型读出来的「浅色科技商务风」比基准族名有用得多。
     */
    const styleName = designStyleOf(withAnalysis);
    const named = styleName ? `「${styleName}」（识别）` : baseline.stylePack.name;
    return {
      ...baseline,
      stylePack: { ...stylePack, name: named, description },
      measuredPages: withAnalysis,
      pendingConfirm,
      modelAssisted: true,
      modelNote: [
        `看图模型分页：${perImage.map((s, i) => `第${i + 1}张 ${s.length} 页`).join('，')}`,
        splitNote,
        read > 0 ? `读解了 ${read} 页的版式、排印与配图提示词` : '',
        '色彩与几何以像素测量为准，版式语义与排印以看图模型为准',
      ].filter(Boolean).join('；'),
    };
  } catch (err) {
    return degrade(baseline, err);
  }
}

/** 第 i 页是它所在那张图里的第几页——重排过之后下标不能直接拿来用 */
function indexInImage(perImage: SlideRef[][], flatIndex: number, imageIndex: number): number {
  let at = 0;
  for (let k = 0; k < imageIndex; k += 1) at += perImage[k]!.length;
  return flatIndex - at;
}

/**
 * 把模型给的分页页类型收进枚举。拼错、幻觉出来的名字一律降级为正文页，
 * 但枚举里真实存在的类型一个都不能降级——「设计稿里真有架构图，却被标成正文页」
 * 正是这条路径最隐蔽的失败模式。单独抽出来是为了能直接测这道关卡。
 */
export function slidePageType(raw: unknown): PageType {
  const t = typeof raw === 'string' ? raw : '';
  return (PAGE_TYPES as string[]).includes(t) ? (t as PageType) : 'text';
}

async function splitSlides(gateway: ProviderGateway, imageUrl: string, img: DecodedImage): Promise<SlideRef[]> {
  const res = await gateway.text({
    taskType: 'style_recognize',
    json: true,
    system: '你是演示文稿版面分析师。只输出 JSON，不要任何解释文字。',
    messages: [{ role: 'user', content: SPLIT_PROMPT, images: [imageUrl] }],
    // 推理模型会把预算先花在 reasoning 上，给小了正文就是空的
    maxTokens: 6000,
    temperature: 0.1,
  });

  const parsed = parseJson(res.text) as { slides?: unknown } | null;
  const raw = Array.isArray(parsed?.slides) ? parsed.slides : [];
  const out: SlideRef[] = [];
  for (const item of raw) {
    const o = item as Record<string, unknown>;
    const box = normalizeCropBox(o, img.width, img.height);
    if (!box) continue;
    out.push({ pageType: slidePageType(o['pageType']), box });
  }
  return out;
}

const TYPO_ROLES = new Set(['display', 'title', 'subtitle', 'body', 'caption', 'metric', 'mono']);
const BAND_ROLES = new Set(['eyebrow', 'title', 'subtitle', 'body', 'visual', 'metrics', 'footer']);

/**
 * 模型偶尔会把两套 role 混着写——实测它把横带的 `eyebrow` 写进了 `typography`。
 *
 * 这不是「错到要丢掉整页」的程度：一处枚举不对就让 safeParse 整个失败，
 * 连已经读对的横带一起被扔掉，表现是「有些页准、有些页不准」，很难查。
 * 所以先就近映射，映射不上的才丢掉那一行——一个坏字段只该损失一行。
 */
const TYPO_ROLE_ALIAS: Record<string, string> = {
  eyebrow: 'caption', footnote: 'caption', label: 'caption', note: 'caption',
  heading: 'title', headline: 'title', h1: 'display', h2: 'title',
  lead: 'subtitle', text: 'body', paragraph: 'body', number: 'metric', data: 'metric',
};
const BAND_ROLE_ALIAS: Record<string, string> = {
  header: 'eyebrow', heading: 'title', headline: 'title', text: 'body', paragraph: 'body',
  image: 'visual', figure: 'visual', media: 'visual', metric: 'metrics', cards: 'metrics',
  pagefooter: 'footer', pagination: 'footer', foot: 'footer',
};

/** 解析前先把明显的枚举问题收拾掉，别让一处小毛病废掉整页的读解 */
export function sanitizeAnalysis(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const o = { ...(raw as Record<string, unknown>) };

  if (Array.isArray(o['typography'])) {
    o['typography'] = (o['typography'] as unknown[]).flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const t = { ...(item as Record<string, unknown>) };
      const role = String(t['role'] ?? '').trim().toLowerCase();
      const fixed = TYPO_ROLES.has(role) ? role : TYPO_ROLE_ALIAS[role];
      if (!fixed) return [];
      t['role'] = fixed;
      return [t];
    });
  }

  if (Array.isArray(o['bands'])) {
    o['bands'] = (o['bands'] as unknown[]).flatMap((item) => {
      if (!item || typeof item !== 'object') return [];
      const b = { ...(item as Record<string, unknown>) };
      const role = String(b['role'] ?? '').trim().toLowerCase();
      const fixed = BAND_ROLES.has(role) ? role : BAND_ROLE_ALIAS[role];
      if (!fixed) return [];
      b['role'] = fixed;
      return [b];
    });
  }

  return o;
}

async function readPage(gateway: ProviderGateway, cropDataUrl: string): Promise<PageAnalysis | null> {
  const res = await gateway.text({
    taskType: 'style_recognize',
    json: true,
    system: '你是顶级平面设计总监。只输出 JSON，不要任何解释文字。',
    messages: [{ role: 'user', content: READ_PROMPT, images: [cropDataUrl] }],
    // 这份 JSON 现在有 7 个字段，其中 bands 与 typography 都是数组。推理模型会先花
    // 一大半预算在 reasoning 上（实测 5600/6591），给小了正文会被截断成半截 JSON，
    // 解析失败后静默退回像素横带——表现是「有些页准、有些页不准」，很难查
    maxTokens: 12000,
    temperature: 0.1,
  });
  const parsed = parseJson(res.text);
  if (!parsed) {
    logger.warn('一页的读解不是合法 JSON，退回像素横带', { preview: res.text.slice(0, 160) });
    return null;
  }
  const out = PageAnalysisSchema.safeParse(sanitizeAnalysis(parsed));
  if (!out.success) {
    logger.warn('一页的读解不符合 schema，退回像素横带', { issue: out.error.issues[0]?.message ?? '' });
    return null;
  }
  return out.data;
}

/**
 * 把读解合并进风格包。
 *
 * 排印取各页的中位数：同一个角色在不同页上不会完全一样，取中位数比取第一页
 * 或取平均都稳——平均值会被封面那种极端字号（108px）拽跑。
 */
function mergeIntoPack(
  pack: StylePack,
  pages: MeasuredPage[],
  measured: ReturnType<typeof measurePages>['measured'],
): StylePack {
  const reads = pages.flatMap((p) => p.analysis?.typography ?? []);

  const byRole = new Map<TypographyRoleName, typeof reads>();
  for (const r of reads) {
    const list = byRole.get(r.role) ?? [];
    list.push(r);
    byRole.set(r.role, list);
  }

  const roles = pack.base.typography.roles.map((role) => {
    const list = byRole.get(role.role);
    if (!list || list.length === 0) return role;
    const family = mode(list.map((r) => r.family).filter(Boolean));
    /**
     * 字号要**吸附到阶梯上**、字重要在允许的档位里。
     *
     * 不吸附的话整包存不进去：设计 Lint 会把「字号不在字阶内」「字重非法」判成
     * error，而保存接口是校验不过就 400 的。实测模型给的是 64/36/22/18/15/72 与
     * 800——一个都过不了。这里吸附而不是放弃模型的值，是因为它给的相对关系是对的
     * （标题明显大于正文），只是不落在设计系统的刻度上。
     */
    const sizePx = snapToFontLadder(
      clampInt(median(list.map((r) => r.sizePx).filter((v) => v > 0)) ?? role.sizePx, 10, 220),
    );
    const weight = nearestWeight(
      median(list.map((r) => r.weight).filter((v) => v >= 100)) ?? role.weight,
    );
    // 模型按设计惯例给的是 em，而角色的字距字段是 px（渲染时直接拼 `${v}px`），
    // 所以要乘字号换算一次——差这一下，1em 的字距会变成 1px，标题会挤成一团
    const spacingEm = median(list.map((r) => r.letterSpacingEm));
    return {
      ...role,
      // 模型给的族名排在最前，原族的其余回退项留着——模型也可能只说对一半
      ...(family ? { family: `${family}, ${role.family}` } : {}),
      sizePx,
      weight,
      letterSpacing: spacingEm === null
        ? role.letterSpacing
        : Math.max(-8, Math.min(16, +(spacingEm * sizePx).toFixed(2))),
    };
  });

  /* ---- 卡片风格：把模型读出的容器规格落到 GUI 规范上 ---- */
  /**
   * 卡片是「这套设计有没有质感」最直接的体现，而像素几乎量不出来——
   * 深色稿上卡片面与底色的通道差只有十几个单位，量到的永远是一片平。
   * 所以交给模型读，读出来的也是**结构化的值**（圆角数值、表面处理、有没有边框、阴影档位），
   * 而不是「圆角柔和」这种落不到渲染参数上的形容词。
   */
  const cards = pages
    .map((p) => p.analysis?.card)
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  const gui = cards.length > 0
    ? {
      ...pack.base.language.gui,
      radius: {
        ...pack.base.language.gui.radius,
        card: clampInt(median(cards.map((c) => c.radius)) ?? pack.base.language.gui.radius.card, 0, 40),
      },
      card: {
        ...pack.base.language.gui.card,
        surface: (mode(cards.map((c) => c.surface)) ?? pack.base.language.gui.card.surface) as typeof pack.base.language.gui.card.surface,
      },
      shadow: (mode(cards.map((c) => c.shadow)) ?? pack.base.language.gui.shadow) as typeof pack.base.language.gui.shadow,
      border: {
        ...pack.base.language.gui.border,
        // 过半的页有边框才算「这套风格有边框」。取众数而不是「有一页有就算」
        style: (cards.filter((c) => c.border).length * 2 > cards.length ? 'solid' : 'none') as 'solid' | 'none',
      },
    }
    : pack.base.language.gui;

  /* ---- 页类型配方：把模型读出的配图提示词与版式说明写进去 ---- */
  const recipes: PageRecipe[] = [];
  for (const type of PAGE_TYPES) {
    const forType = pages.filter((p) => p.pageType === type && p.analysis);
    if (forType.length === 0) continue;
    const existing = pack.base.language.pageRecipes.find((r) => r.pageType === type)
      ?? ({ pageType: type } as PageRecipe);
    const prompt = mode(forType.map((p) => p.analysis!.imagePrompt).filter(Boolean)) ?? '';
    recipes.push({ ...existing, ...(prompt ? { imagePrompt: prompt } : {}) });
  }
  const pageRecipes = [
    ...pack.base.language.pageRecipes.filter((r) => !recipes.some((n) => n.pageType === r.pageType)),
    ...recipes,
  ];

  /* ---- 使用说明：版式与信息分层都写进 guidance ---- */
  // 两条都要写进去：版式说的是「东西在哪」，分层说的是「先看什么」。
  // 只给版式，模型排得对但主次不分，出来就是一张排得整齐却没有重点的页
  /**
   * guidance 里只有这八个页类型键（`gallery` 还没有对应字段），
   * 而且这几个键的值都是字符串——另几个键（avoid / checklist）是数组，不能一起遍历。
   */
  const GUIDANCE_PAGE_KEYS = ['cover', 'toc', 'section', 'text', 'imageText', 'chart', 'metrics', 'end'] as const;
  const guidance = { ...pack.base.language.guidance };
  for (const type of GUIDANCE_PAGE_KEYS) {
    const p = pages.find((x) => x.pageType === type && x.analysis);
    const parts = [p?.analysis?.layout, p?.analysis?.hierarchy].filter(Boolean);
    if (parts.length > 0) guidance[type] = parts.join(' ');
  }

  /* ---- 设计风格的名字进调性词 ---- */
  const styleName = designStyleOf(pages);
  const toneKeywords = styleName && !pack.toneKeywords.includes(styleName)
    ? [styleName, ...pack.toneKeywords].slice(0, 6)
    : pack.toneKeywords;

  return {
    ...pack,
    toneKeywords,
    base: {
      ...pack.base,
      typography: { ...pack.base.typography, roles },
      language: {
        ...pack.base.language,
        gui,
        pageRecipes,
        guidance,
      },
      /**
       * 版式几何要**跟着这一轮的测量重推**，不能沿用底座那一份。
       *
       * 底座是按像素切出来的页量的；模型切出来的页数与位置可能不同
       * （实测同一张拼图，像素切 4 页、模型切 5 页）。沿用旧的那份，
       * 界面上就会出现「预览的页」与「版式的页」不是同一批的情况。
       */
      layouts: Object.keys(measured.byPageType).length > 0
        ? buildLayouts(measured.capacity, measured.byPageType)
        : pack.base.layouts,
      rules: measured.marginRatio !== null
        ? { ...pack.base.rules, marginRatio: measured.marginRatio }
        : pack.base.rules,
    },
  };
}

/* ---------------- 小工具 ---------------- */

/** 模型读出的横带 → 内容框（所有带的并集，与像素那边同一个口径） */
/**
 * 内容框：**只由文字带算**，图区带不参与。
 *
 * 页边距量的是「文字离页面边缘多远」，而满幅或半幅的图区天生贴边
 * （`leftRatio: 0` / `widthRatio: 1` 这种）。把它算进去，内容框就被撑到整页，
 * 页边距量成 0，再被下限抬到 5% 并挂一条「量到的页边距偏低」的待确认项——
 * 明明量得出来却说量不出。这条在允许「侧边整块」成带之后更要紧：
 * 那种带 topRatio 0、heightRatio 1，一进来就把上下边距也吃光。
 *
 * 全是图区带（纯图页）时才退回用全部带，否则内容框无从谈起。
 */
function contentBoxOf(reads: BandRead[]) {
  const text = reads.filter((b) => b.role !== 'visual');
  const use = text.length > 0 ? text : reads;
  const left = Math.min(...use.map((b) => b.leftRatio));
  const right = 1 - Math.max(...use.map((b) => b.leftRatio + b.widthRatio));
  const top = Math.min(...use.map((b) => b.topRatio));
  const bottom = 1 - Math.max(...use.map((b) => b.topRatio + b.heightRatio));
  return {
    left: +clamp01(left).toFixed(4),
    right: +clamp01(right).toFixed(4),
    top: +clamp01(top).toFixed(4),
    bottom: +clamp01(bottom).toFixed(4),
  };
}

/** 整页对齐：标题带居中就算居中。多栏的标题带横跨整幅，看不出对齐，一律按左 */
function alignOf(reads: BandRead[]): 'left' | 'center' {
  const title = reads.find((b) => b.role === 'title');
  if (!title || title.columns > 1) return 'left';
  return Math.abs(title.leftRatio + title.widthRatio / 2 - 0.5) < 0.04 ? 'center' : 'left';
}

/**
 * 模型读出的横带 → 渲染层认的 BandSpec。
 *
 * 每一条都夹回画布内：模型给的是目测值，偶尔会越界或给出 0 高度，
 * 直接交给渲染层会算出负宽度的块，页面上一片空白还找不到原因。
 */
function bandsFromRead(
  reads: BandRead[],
  grid: LayoutGrid,
  box: { left: number; right: number; top: number; bottom: number },
): BandSpec[] {
  return [...reads]
    .filter((b) => b.heightRatio > 0.005)
    .sort((a, b) => a.topRatio - b.topRatio)
    .map((b) => {
      const left = clamp01(b.leftRatio);
      const top = clamp01(b.topRatio);
      const width = Math.min(1 - left, Math.max(0.02, b.widthRatio));
      const height = Math.min(1 - top, Math.max(0.01, b.heightRatio));
      const columns = Math.max(1, Math.round(b.columns));
      const align: BandSpec['align'] = columns > 1
        ? 'n/a'
        : (Math.abs(left + width / 2 - 0.5) < 0.04 ? 'center' : 'left');
      return {
        role: b.role,
        topRatio: +top.toFixed(4),
        heightRatio: +height.toFixed(4),
        leftRatio: +left.toFixed(4),
        widthRatio: +width.toFixed(4),
        columns,
        align,
        // 横向对栏线、纵向按基线记行位——网格仍用像素量出来的那一套
        ...placeOnGrid({ leftRatio: left, widthRatio: width, topRatio: top, heightRatio: height }, grid, box),
      };
    });
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

/** 把字重收到允许的档位里。取最近的一档，平手时取更粗的——标题粗一点不会难看 */
function nearestWeight(w: number): number {
  let best = ALLOWED_WEIGHTS[0]!;
  let bestGap = Infinity;
  for (const step of ALLOWED_WEIGHTS) {
    const gap = Math.abs(step - w);
    if (gap < bestGap || (gap === bestGap && step > best)) {
      best = step;
      bestGap = gap;
    }
  }
  return best;
}

function parseJson(text: string): unknown | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.search(/[[{]/);
  if (start < 0) return null;
  const open = candidate[start];
  const end = candidate.lastIndexOf(open === '{' ? '}' : ']');
  if (end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

/**
 * 模型给这套风格起的名字，收拾成能上卡片、也能当包名的一小串字。
 *
 * 模型爱给「经典企业蓝渐变（Corporate Blue Gradient 路线图风）」这种带括号的长名字，
 * 而它要同时用在两个地方：调性词标签（太长了在卡片上会挤成两行）与风格包名。
 * 去掉括号与英文副名再截断，两处共用同一份，免得名字对不上。
 */
function designStyleOf(pages: MeasuredPage[]): string | null {
  return mode(pages.map((p) => p.analysis?.designStyle).filter((x): x is string => Boolean(x)))
    ?.replace(/[（(][^）)]*[）)]/g, '').trim().slice(0, 12) || null;
}

/** 出现次数最多的那个。平手时取更长的——更具体的描述通常更有用 */
function mode(xs: string[]): string | null {
  if (xs.length === 0) return null;
  const tally = new Map<string, number>();
  for (const x of xs) tally.set(x, (tally.get(x) ?? 0) + 1);
  let best: string | null = null;
  let bestN = -1;
  for (const [k, n] of tally) {
    if (n > bestN || (n === bestN && best !== null && k.length > best.length)) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

const clampInt = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(v)));

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const i = next;
      next += 1;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

function degrade(baseline: RecognizeResult, err: unknown): RecognizeResult {
  const message = err instanceof Error ? err.message : String(err);
  logger.warn('看图读设计稿失败，退回像素结果', { message });
  return {
    ...baseline,
    modelAssisted: true,
    modelNote: `看图模型不可用，版式沿用像素测量结果：${message.slice(0, 120)}`,
  };
}

/** 供测试与调用方判断：这个模型名值不值得试着看图 */
export function modelLikelySupportsVision(model: string): boolean {
  return /vl|vision|omni|gpt-4|gpt-5|claude|gemini|glm-4v|qwen.*-v|internvl|step-1v|deepseek-v\d/i.test(model);
}
