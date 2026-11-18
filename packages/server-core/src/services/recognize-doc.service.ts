import {
  DEFAULT_FONT_SANS,
  FONT_CHOICES,
  fontStackOf,
  lintStylePrompt,
  PAGE_TYPE_ORDER,
  StyleDoc,
  type FontStacks,
  type PageType,
  type ProgressPayload,
  type RecognizeStep,
  type StylePagePrompt,
  type StylePalette,
} from '@lumen/ir-schema';
import { cropNormalized, decodeImage, toDataUrl } from '@lumen/style-engine/server';
import type { ProviderGateway } from '@lumen/provider-gateway';
import { mapLimit } from '../lib/concurrency.js';
import { MODEL_LIMITER, watchThrottle } from '../lib/model-limiter.js';
import { logger } from '../lib/logger.js';
import { parseModelJson } from '../lib/model-reply.js';
import { billedGateway } from './billed-gateway.js';
import { derivePrompts, generateMock, splitSlides, str, writePagePrompt } from './page-prompt-kit.js';

/**
 * 从参考图识别出一套风格。
 *
 * ## 产出的是什么
 *
 * 不是色板加版式参数，是**每个页类型一条可以直接发给模型的 HTML 生成提示词**，
 * 外加用那条提示词真跑一次得到的样机 HTML。理由见 `style-doc.ts` 的说明：
 * 上一版把风格压成参数交给固定渲染器，表现力被渲染器的骨架数量封顶了。
 *
 * ## 四步
 *
 * 1. **分页**：模型在整张图上找出每一张幻灯片的位置，按框裁开。
 *    参考图常常是拼图（一张图里排好几页），不裁开的话每页看到的内容都一样。
 * 2. **逐页写提示词**：模型看着这一页，按固定四段（角色/任务/视觉与排版要求/代码要求）
 *    写出一条提示词。
 * 3. **综合风格**：从这些页里提炼出风格名、配色、明暗、整本创作指令。
 *    放在读页之后而不是之前，是因为配色要从整本稿子看，单看一页容易被某一页的
 *    大面积色块带偏。
 * 4. **补齐与出样机**：参考图里没有的页类型由模型推导（一次调用，把已写好的几条
 *    当范例给它，保证补齐的几条是同一套语言）；然后每个页类型各调一次，用提示词
 *    生成样机 HTML。
 *
 * 一轮大约 20 次模型调用、3~6 分钟。所以走 SSE 流式返回进度，不能让请求干等着。
 */

/* ---------------- 提示词 ---------------- */

/**
 * 提示词里给模型看的字体清单。
 *
 * **从 `FONT_CHOICES` 生成，不手写一份**：手写的话以后往清单里加字体就会忘了同步，
 * 表现是「新加的那款永远识别不出来」，而且不报错——模型只是照旧从旧清单里挑。
 */
const FONT_OPTION_LINES = FONT_CHOICES.map((f) => `  - ${f.id}：${f.label}`).join('\n');

/** 综合出风格名、配色、明暗、字体与整本创作指令 */
const SYNTH_SYSTEM = [
  '你是资深视觉设计总监。我给你一份演示文稿的若干页设计稿，请提炼出**这套风格的整体设定**。',
  '只输出 JSON，不要任何解释：',
  '{',
  '  "name": "这套风格的名字（8 个字以内，具体，如「暖调纸感编辑风」「深色流光科技风」）",',
  '  "description": "一句话说清这套风格长什么样、适合什么场合（40 字以内）",',
  '  "theme": "light|dark",',
  '  "palette": {',
  '    "bg": "#RRGGBB 页面底色",',
  '    "surface": "#RRGGBB 浮在底色上的表面色（卡片、色块）",',
  '    "text": "#RRGGBB 正文色",',
  '    "muted": "#RRGGBB 次要文字色",',
  '    "accent": "#RRGGBB 强调色（标题重点、数字、装饰件）",',
  '    "brand": "#RRGGBB 品牌色",',
  '    "border": "#RRGGBB 分隔线与边框"',
  '  },',
  '  "fonts": {',
  '    "display": "大标题、展示性大字用哪个 id",',
  '    "body": "正文、说明文字用哪个 id",',
  '    "script": "手写体（签名、引言、装饰小字）用哪个 id；参考图里没有手写体就给空串",',
  '    "numeric": "指标数字、大号序号、页码用哪个 id；与正文同一套就给空串"',
  '  },',
  '  "fontNote": "参考图里这几档字体实际长什么样（40 字以内），如「大标题极粗无衬线、正文细黑、数字等宽」",',
  '  "deckPrompt": "这套风格在内容组织上的讲究（60 字以内）。比如「一页一个结论」「数字必须带口径与来源」「不要用形容词堆砌」这类，只写这一套风格特有的，不要写通用建议"',
  '}',
  '',
  '配色要**从整本稿子看**，不要被某一页的大面积色块带偏。',
  '所有色值必须是六位十六进制。',
  '',
  '`fonts` 的四个值只能从下面这份清单里挑，写别的 id 一律作废：',
  FONT_OPTION_LINES,
  '',
  '判字体**看字形特征，不要猜字体名**。看这几处：',
  '- 笔画末端有没有装饰性的小脚（衬线）→ 有就是 `cormorant` / `system-serif`，没有就是无衬线',
  '- 字重是不是**极粗**、字腔是不是几何正圆（几何无衬线）→ 大标题常见这种，是 `montserrat`',
  '- 笔画粗细是不是完全一致、字宽是不是均等（等宽）→ 是 `system-mono`，数字尤其明显',
  '- 有没有连笔、像手写 → 是 `system-script`',
  '- 上面几条都不突出、就是普通的电脑字 → 是 `system-sans`',
  '**最容易判错的是粗体无衬线**：参考图里的大标题又粗又大，容易被当成衬线体。',
  '衬线的判据只有一个——**笔画末端有没有小脚**。没有小脚，再粗也不是衬线体。',
].join('\n');

/* ---------------- 类型 ---------------- */

export interface DocRecognitionInput {
  /** 参考图，data URL 形式 */
  imageUrls: string[];
  tenantId: string;
  userId: string;
  /**
   * 演示用的注入点，测试里换成假的网关。不传就自己建一个（路由走这条）。
   *
   * 与 `generate-html.service.ts` 的 `input.gateway` 同一个路数。**默认值必须是
   * `billedGateway` 而不是 `buildGateway`**——后者不落账，这一处的记账缺口
   * 正是上一轮才补上的，别在加注入点时又漏回去。
   */
  gateway?: ProviderGateway;
}

export type DocRecognitionEvent =
  | { event: 'progress'; data: ProgressPayload<RecognizeStep> }
  | { event: 'page'; data: { pageType: PageType; prompt: string; source: 'reference' | 'derived' } }
  | { event: 'mock'; data: { pageType: PageType; issues: string[] } }
  | { event: 'done'; data: StyleDoc }
  | { event: 'error'; data: { message: string } };

/**
 * 逐页写提示词、出样机这两步的并发，都用共享的 `MODEL_LIMITER`。
 *
 * 这里原先各写死 3（注释是「模型侧对并发敏感」「样机最贵容易被限流」）——
 * 顾虑是对的，但**写死一个数解决不了**：限流按 API key 算，识别、生成页面、
 * 统一用的是同一个 key，各写各的加起来照样打爆。交给限流器自己找稳态。
 * 见 `lib/model-limiter.ts`。
 */

/* ---------------- 主流程 ---------------- */

export async function* runDocRecognition(input: DocRecognitionInput): AsyncGenerator<DocRecognitionEvent> {
  // 包一层：撞限流要喂给并发上限。**在入口包一次**，下面所有调用都走它
  const gateway = watchThrottle(input.gateway ?? billedGateway(input.tenantId, input.userId));
  const pages: { pageType: PageType; prompt: string; source: 'reference' | 'derived'; image?: string }[] = [];
  let palette: StylePalette | null = null;

  try {
    /* ---- 1. 分页并裁开 ---- */
    const total = input.imageUrls.length;
    let done = 0;
    const cropped: { pageType: PageType; dataUrl: string }[] = [];
    for (const url of input.imageUrls) {
      yield { event: 'progress', data: { step: 'split', label: '正在找出每一页', done, total } };
      const img = decodeImage(url);
      const refs = await splitSlides(gateway, url, img);
      for (const ref of refs) {
        // splitSlides 已经把框收拾干净了，这里直接用
        cropped.push({ pageType: ref.pageType, dataUrl: toDataUrl(cropNormalized(img, ref.box)) });
      }
      done += 1;
    }
    yield { event: 'progress', data: { step: 'split', label: `找出 ${cropped.length} 页`, done: total, total } };

    if (cropped.length === 0) {
      yield { event: 'error', data: { message: '没能从参考图里找出任何一页，请换一张更清晰的图' } };
      return;
    }

    /* ---- 2. 逐页写提示词 ---- */
    let read = 0;
    for await (const r of mapLimit(cropped, MODEL_LIMITER, async (page) => {
      /**
       * 写完要**校验四段全不全，不合契约就带问题重试一次**。
       *
       * 与 `redrawPage` 同一个口径——那边一直是这么做的，这条路原先漏了：
       * 直接 `writePagePrompt(...)` 拿回来就用，模型漏写「代码要求」那一段也没人管。
       * 实测「红黑极简提案风」一轮下来 cover / toc / metrics / imageText 四页缺段
       * （metrics 甚至四段全缺），落库时 `saveStyleDoc` 如实报了一串结构警告，
       * 而这几页生成出来的页面不会用 `:root` 变量，换主题就散架。
       *
       * **重试后仍不合规不抛**：那一页的提示词仍然能用，只是不完整；
       * 抛出去会让整轮识别失败，比留一条有瑕疵的提示词糟得多。
       */
      let prompt = await writePagePrompt(gateway, page.dataUrl, page.pageType);
      const problems = lintStylePrompt(prompt);
      if (problems.length > 0) {
        logger.warn('识别写出的提示词不合契约，带问题重试一次', {
          pageType: page.pageType,
          problems: problems.map((p) => p.message),
          promptLength: prompt.length,
        });
        prompt = await writePagePrompt(gateway, page.dataUrl, page.pageType, {
          problems: problems.map((p) => p.message),
        });
      }
      return { pageType: page.pageType, prompt, dataUrl: page.dataUrl };
    })) {
      read += 1;
      yield {
        event: 'progress',
        data: { step: 'read', label: `已读 ${read}/${cropped.length} 页`, done: read, total: cropped.length },
      };
      if (!r) continue;
      // 同一种页类型在参考图里出现多次时，取第一条——版式以第一张为准
      if (pages.some((p) => p.pageType === r.pageType)) continue;
      pages.push({ pageType: r.pageType, prompt: r.prompt, source: 'reference', image: r.dataUrl });
      yield { event: 'page', data: { pageType: r.pageType, prompt: r.prompt, source: 'reference' } };
    }

    /* ---- 3. 综合风格 ---- */
    yield { event: 'progress', data: { step: 'synth', label: '正在提炼配色与风格名', done: 0, total: 1 } };
    const synth = await synthesizeStyle(gateway, cropped.slice(0, 4).map((c) => c.dataUrl));
    palette = synth.palette;
    yield { event: 'progress', data: { step: 'synth', label: '配色与风格名已定', done: 1, total: 1 } };

    /* ---- 4. 补齐参考图里没有的页类型 ---- */
    const missing = PAGE_TYPE_ORDER.filter((t) => !pages.some((p) => p.pageType === t));
    if (missing.length > 0) {
      yield {
        event: 'progress',
        data: { step: 'derive', label: `推导另外 ${missing.length} 类页面`, done: 0, total: missing.length },
      };
      const derived = await derivePrompts(gateway, pages, missing, palette);
      for (const d of derived) {
        pages.push({ pageType: d.pageType, prompt: d.prompt, source: 'derived' });
        yield { event: 'page', data: { pageType: d.pageType, prompt: d.prompt, source: 'derived' } };
      }
      yield {
        event: 'progress',
        data: { step: 'derive', label: '缺失页类型已补齐', done: missing.length, total: missing.length },
      };
    }

    /* ---- 5. 出样机 ---- */
    // 样机要按**读出来的**字体出。识别只把字体写进 `StyleDoc` 是不够的：
    // 样机是在这一步真跑出来的，不传字体的话模型自己发明一套栈，
    // 于是「库里写着粗无衬线、卡片样机却是衬线」——字体识别等于白做。
    const mockFonts: FontStacks = {
      // 正文那一档必有：`fontBlock` 拿它当 `--font-sans`，空串会让整页落到浏览器默认的 Times
      fontFamily: fontStackOf(synth.fonts.body) || DEFAULT_FONT_SANS,
      fontDisplay: fontStackOf(synth.fonts.display) || undefined,
      fontScript: fontStackOf(synth.fonts.script) || undefined,
      fontNumeric: fontStackOf(synth.fonts.numeric) || undefined,
    };
    const mocks: Record<string, StylePagePrompt> = {};
    const promptOf = new Map(pages.map((p) => [p.pageType, p]));
    let mocked = 0;
    for await (const m of mapLimit(pages, MODEL_LIMITER, async (p) => {
      const r = await generateMock(gateway, p.prompt, palette!, mockFonts, undefined, p.pageType);
      return { pageType: p.pageType, ...r };
    })) {
      mocked += 1;
      yield {
        event: 'progress',
        data: { step: 'mock', label: `已出样机 ${mocked}/${pages.length} 页`, done: mocked, total: pages.length },
      };
      if (!m) continue;
      const src = promptOf.get(m.pageType)!;
      mocks[m.pageType] = {
        pageType: m.pageType,
        prompt: src.prompt,
        mockHtml: m.html,
        // 识别是从参考图里读版面，读出来的就是这套风格自己的样子，不绑任何骨架库
        layoutId: '',
        source: src.source,
        issues: m.issues,
        edited: false,
      };
      yield { event: 'mock', data: { pageType: m.pageType, issues: m.issues.map((i) => i.message) } };
    }

    // 样机没出来的页也要留一条，只有提示词没有样机，界面上如实显示「样机未生成」
    for (const p of pages) {
      if (mocks[p.pageType]) continue;
      mocks[p.pageType] = {
        pageType: p.pageType, prompt: p.prompt, mockHtml: '', layoutId: '',
        source: p.source, issues: [], edited: false,
      };
    }

    const doc = StyleDoc.parse({
      styleId: `${slug(synth.name) || 'recognized'}-${Date.now().toString(36)}`,
      version: '1.0',
      name: synth.name,
      description: synth.description,
      theme: synth.theme,
      palette: synth.palette,
      // 从参考图里读出来的四个字体角色。**展开而不是逐字段写**：读不出来的那几档
      // 直接不出现，`StyleDoc` 的默认值接手——见 `fontOverrides` 的说明
      ...fontOverrides(synth.fonts),
      pagePrompts: mocks,
      deckPrompt: synth.deckPrompt,
      meta: { builtin: false, reviewed: false, customized: false, createdAt: Date.now(), updatedAt: Date.now() },
    });
    yield { event: 'done', data: doc };
  } catch (err) {
    logger.warn('风格识别失败', { err: err instanceof Error ? err.message : String(err) });
    yield { event: 'error', data: { message: err instanceof Error ? err.message : String(err) } };
  }
}

/* ---------------- 分步实现 ---------------- */

/** 识别出的四个字体角色，值是 `FONT_CHOICES` 的 id（认不出的已滤成空串） */
interface RecognizedFonts {
  display: string;
  body: string;
  script: string;
  numeric: string;
}

interface StyleSynthesis {
  name: string;
  description: string;
  theme: 'light' | 'dark';
  palette: StylePalette;
  fonts: RecognizedFonts;
  /** 模型对参考图里字体的一段描述。**只用于日志与排查**，不落库 */
  fontNote: string;
  deckPrompt: string;
}

async function synthesizeStyle(gateway: ProviderGateway, images: string[]): Promise<StyleSynthesis> {
  const res = await gateway.text({
    taskType: 'style_recognize',
    json: true,
    maxTokens: 4000,
    system: SYNTH_SYSTEM,
    messages: [{ role: 'user', content: '请提炼这套风格的整体设定。', images }],
  });
  const raw = parseModelJson<Record<string, unknown>>(res.text) ?? {};
  const paletteRaw = (raw.palette ?? {}) as Record<string, unknown>;
  const hex = (v: unknown, fallback: string) =>
    (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim()) ? v.trim().toUpperCase() : fallback);

  const palette: StylePalette = {
    bg: hex(paletteRaw.bg, '#FFFFFF'),
    surface: hex(paletteRaw.surface, '#F5F5F5'),
    text: hex(paletteRaw.text, '#1A1A1A'),
    muted: hex(paletteRaw.muted, '#6B6B6B'),
    accent: hex(paletteRaw.accent, hex(paletteRaw.brand, '#2B6CB0')),
    brand: hex(paletteRaw.brand, hex(paletteRaw.accent, '#2B6CB0')),
    border: hex(paletteRaw.border, '#E2E2E2'),
  };

  // 只认清单里的 id。模型写出别的（字体名、编的 id、空串）一律当「没读出来」，
  // 由 `fontOverrides` 决定是回落默认值还是保留不覆盖——**不在这一层猜**
  const fontsRaw = (raw.fonts ?? {}) as Record<string, unknown>;
  const fontId = (v: unknown) => {
    const id = str(v).trim();
    return id && fontStackOf(id) ? id : '';
  };
  const fonts: RecognizedFonts = {
    display: fontId(fontsRaw.display),
    body: fontId(fontsRaw.body),
    script: fontId(fontsRaw.script),
    numeric: fontId(fontsRaw.numeric),
  };
  // 一个都没读出来要说一声：不报错（回落到默认值仍然能用），但排查时得看得到
  if (!fonts.display && !fonts.body && !fonts.script && !fonts.numeric) {
    logger.warn('识别没读出字体，四个角色都回落默认值', { rawFonts: JSON.stringify(raw.fonts ?? null) });
  }

  return {
    name: str(raw.name) || '识别风格',
    description: str(raw.description),
    theme: raw.theme === 'dark' ? 'dark' : 'light',
    palette,
    fonts,
    fontNote: str(raw.fontNote),
    deckPrompt: str(raw.deckPrompt),
  };
}

/**
 * 识别出的字体 id → `StyleDoc` 上的覆盖项。
 *
 * **读不出来的不写进去**，让 `StyleDoc` 自己的默认值生效：写一个空串进去的话
 * `fontFamily` 会变成空栈，页面上一个字体名都没有，整页落到浏览器默认的 Times。
 * 手写体的默认值（`DEFAULT_FONT_SCRIPT`）也是这个道理——没读出签名体不代表这套风格
 * 没有手写体，只是这一版没看见。
 */
function fontOverrides(
  fonts: RecognizedFonts,
): Partial<Pick<StyleDoc, 'fontFamily' | 'fontDisplay' | 'fontScript' | 'fontNumeric'>> {
  const out: Partial<Pick<StyleDoc, 'fontFamily' | 'fontDisplay' | 'fontScript' | 'fontNumeric'>> = {};
  const body = fontStackOf(fonts.body);
  if (body) out.fontFamily = body;
  const display = fontStackOf(fonts.display);
  if (display) out.fontDisplay = display;
  const script = fontStackOf(fonts.script);
  if (script) out.fontScript = script;
  const numeric = fontStackOf(fonts.numeric);
  if (numeric) out.fontNumeric = numeric;
  return out;
}

/* ---------------- 工具 ---------------- */

/** styleId 只允许小写字母数字与短横 */
function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
}
