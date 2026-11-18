import type { MeasuredPage, RecognizeResult, StylePack, StyleTokens } from '@lumen/ir-schema';
import { BUILTIN_STYLE_PACKS } from './builtin/index.js';
import { analyzeUrl, isDarkLeaning, type UrlSignals } from './from-url.js';
import { analyzeDescription, mentionedHues, wantsDark } from './from-text.js';
import {
  classifyPalette, paletteFromDataUrl, toHsl, votePalettes, type ColorBucket,
} from './palette.js';
import {
  applyFingerprint, fingerprintFromDataUrl, mergeFingerprints, NOT_MEASURABLE, notMeasurableClause,
} from './fingerprint.js';
import { decodeImage, type DecodedImage } from './png.js';
import { measurePages } from './measure.js';
import { deriveMeasuredLayout } from './measured-layout.js';
import { buildLayouts } from './variant-set.js';

/**
 * 风格识别：网页 URL / 多张图片 / 文字描述，可组合（PRD §5.2）。
 *
 * 流程：逐源解析 → 归一化 → 聚类投票 → 冲突消解（描述 > 多数 > 异常值）→ 输出风格包 + 置信度 + 待确认项。
 */

export interface RecognizeInput {
  url?: string;
  /** 图片 data URL 列表 */
  images?: string[];
  description?: string;
  fetchImpl?: typeof fetch;
}

const HUE_NAME: [string, number][] = [
  ['红', 0], ['橙', 30], ['黄', 55], ['绿', 120], ['青', 175], ['蓝', 220], ['紫', 275], ['粉', 330],
];

function hueNameOf(hex: string): string {
  const { h, s, l } = toHsl(hexToRgb(hex));
  if (s < 0.15) return l > 0.6 ? '白' : '黑';
  let best = HUE_NAME[0]!;
  let bestDist = 999;
  for (const [name, deg] of HUE_NAME) {
    const d = Math.min(Math.abs(h - deg), 360 - Math.abs(h - deg));
    if (d < bestDist) {
      bestDist = d;
      best = [name, deg];
    }
  }
  return best[0];
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  const s = m[1]!;
  return { r: parseInt(s.slice(0, 2), 16), g: parseInt(s.slice(2, 4), 16), b: parseInt(s.slice(4, 6), 16) };
}

/** 从取色结果反推风格族（描述缺失时的兜底依据） */
function familyFromPalette(colors: ColorBucket[], dark: boolean): string {
  const chromatic = colors.map((c) => ({ c, hsl: toHsl(c.rgb) })).filter((x) => x.hsl.s >= 0.18);
  const top = chromatic[0];
  if (!top) return dark ? 'tech-minimal' : 'business-classic';
  const hue = top.hsl.h;
  const saturation = top.hsl.s;
  const lightness = top.hsl.l;

  if (saturation > 0.6 && lightness > 0.4 && lightness < 0.72 && (hue > 300 || hue < 20)) return 'friendly-premium';
  if (saturation > 0.5 && hue > 240 && hue < 300) return 'brand-design';
  if (hue >= 160 && hue <= 220) return dark ? 'tech-minimal' : 'business-classic';
  if (hue > 120 && hue < 175) return 'academic-rigor';
  if (saturation < 0.3) return 'brand-design';
  return 'business-classic';
}

function packFor(family: string): StylePack {
  return BUILTIN_STYLE_PACKS.find((p) => p.family === family) ?? BUILTIN_STYLE_PACKS[0]!;
}

function paletteToTokens(p: ReturnType<typeof classifyPalette>, base: StyleTokens): StyleTokens {
  return {
    ...base,
    brand500: p.brand500,
    brand600: p.brand600,
    brand100: p.brand100,
    accent500: p.accent500,
    accent100: p.accent100,
    neutral900: p.neutral900,
    neutral700: p.neutral700,
    neutral500: p.neutral500,
    neutral300: p.neutral300,
    neutral100: p.neutral100,
    neutral0: p.neutral0,
  };
}

export async function recognizeStyle(input: RecognizeInput): Promise<RecognizeResult> {
  const conflicts: RecognizeResult['conflicts'] = [];
  const pendingConfirm: RecognizeResult['pendingConfirm'] = [];

  /* ---- 1. 逐源解析 ---- */
  const textSignals = input.description ? analyzeDescription(input.description) : [];
  let urlSignals: UrlSignals | null = null;
  if (input.url) {
    urlSignals = await analyzeUrl(input.url, input.fetchImpl ?? fetch);
    if (!urlSignals.ok && urlSignals.note) {
      pendingConfirm.push({
        field: 'url', question: `网页解析未取得有效信号：${urlSignals.note}`, candidates: [], resolved: '',
      });
    }
  }

  const imagePalettes: ColorBucket[][] = [];
  for (const img of input.images ?? []) {
    try {
      const p = paletteFromDataUrl(img, 8);
      if (p.length > 0) imagePalettes.push(p);
    } catch (err) {
      pendingConfirm.push({
        field: 'images',
        question: `有图片无法解析（${err instanceof Error ? err.message : String(err)}），请改用 PNG 或直接填写描述`,
        candidates: [],
        resolved: '',
      });
    }
  }
  const mergedImageColors = votePalettes(imagePalettes);

  /* ---- 2. 归一化与聚类投票 ---- */
  const urlColors = urlSignals?.colors ?? [];
  const sourceCount = [textSignals.length > 0, urlColors.length > 0, mergedImageColors.length > 0]
    .filter(Boolean).length;

  if (sourceCount === 0) {
    return {
      source: 'text',
      confidence: 0,
      stylePack: packFor('business-classic'),
      pendingConfirm: [
        ...pendingConfirm,
        { field: 'family', question: '没有取得任何有效信号，请至少提供网页地址、图片或文字描述', candidates: [], resolved: '' },
      ],
      conflicts: [],
      // 一条信号都没有，自然也没有量到的页
      measuredPages: [],
      modelAssisted: false,
      modelNote: '',
    };
  }

  /* ---- 3. 冲突消解：描述 > 多数 > 异常值 ---- */
  const dark = (input.description ? wantsDark(input.description) : false)
    || (urlColors.length > 0 ? isDarkLeaning(urlColors) : isDarkLeaning(mergedImageColors));

  let family: string;
  let familyReason: string;
  if (textSignals.length > 0 && (textSignals[0]?.score ?? 0) >= 3) {
    family = textSignals[0]!.family;
    familyReason = `依据文字描述中的「${textSignals[0]!.matched.slice(0, 4).join('、')}」判定`;
  } else if (mergedImageColors.length > 0) {
    family = familyFromPalette(mergedImageColors, dark);
    familyReason = '依据图片取色的色相与饱和度推断';
  } else if (urlColors.length > 0) {
    family = familyFromPalette(urlColors, dark);
    familyReason = '依据网页取色的色相与饱和度推断';
  } else {
    family = textSignals[0]?.family ?? 'business-classic';
    familyReason = '信号不足，回落到默认风格族';
  }

  const basePack = packFor(family);

  /* ---- 4. 取色：URL 与图片不一致时按「多数」并用描述裁决 ---- */
  let chosenColors: ColorBucket[] = [];
  let colorSource: 'url' | 'images' | 'none' = 'none';

  if (urlColors.length > 0 && mergedImageColors.length > 0) {
    const urlTop = urlColors[0]!;
    const imgTop = mergedImageColors[0]!;
    const sameHue = hueNameOf(urlTop.hex) === hueNameOf(imgTop.hex);
    if (sameHue) {
      chosenColors = votePalettes([urlColors, mergedImageColors]);
      colorSource = 'url';
      conflicts.push({
        field: 'palette',
        values: [urlTop.hex, imgTop.hex],
        winner: urlTop.hex,
        reason: '两个来源色相一致，合并后以网页信号为主（网页通常更接近品牌真值）',
      });
    } else {
      // 描述提到的色相可以裁决
      const mentioned = input.description ? mentionedHues(input.description) : [];
      const urlHue = hueNameOf(urlTop.hex);
      const imgHue = hueNameOf(imgTop.hex);
      const urlWins = mentioned.length > 0 ? mentioned.includes(urlHue) : true;
      chosenColors = urlWins ? urlColors : mergedImageColors;
      colorSource = urlWins ? 'url' : 'images';
      conflicts.push({
        field: 'palette',
        values: [urlTop.hex, imgTop.hex],
        winner: urlWins ? urlTop.hex : imgTop.hex,
        reason: mentioned.length > 0
          ? `描述中提到「${mentioned.join('、')}」，与${urlWins ? '网页' : '图片'}取色一致`
          : '两个来源色相不一致，按「网页优先」取网页信号',
      });
      pendingConfirm.push({
        field: 'palette',
        question: `网页与图片的主色不一致（${urlTop.hex} vs ${imgTop.hex}），已默认采用${urlWins ? '网页' : '图片'}取色，可手动切换`,
        candidates: [urlTop.hex, imgTop.hex],
        resolved: urlWins ? urlTop.hex : imgTop.hex,
      });
    }
  } else if (urlColors.length > 0) {
    chosenColors = urlColors;
    colorSource = 'url';
  } else if (mergedImageColors.length > 0) {
    chosenColors = mergedImageColors;
    colorSource = 'images';
  }

  /* ---- 5. 组装风格包 ---- */
  const classified = chosenColors.length > 0 ? classifyPalette(chosenColors) : null;
  const tokens = classified
    ? paletteToTokens(classified, basePack.base.tokens)
    : basePack.base.tokens;

  const typography = urlSignals && urlSignals.fonts.length > 0
    ? {
      ...basePack.base.typography,
      pairs: [{ heading: urlSignals.fonts[0]!, body: urlSignals.fonts[1] ?? urlSignals.fonts[0]!, numeric: basePack.base.typography.pairs[0]?.numeric ?? 'monospace' }],
      roles: basePack.base.typography.roles.map((r) => ({
        ...r,
        family: r.role === 'mono' || r.role === 'metric'
          ? (basePack.base.typography.pairs[0]?.numeric ?? 'monospace')
          : (r.role === 'body' || r.role === 'caption' ? (urlSignals!.fonts[1] ?? urlSignals!.fonts[0]!) : urlSignals!.fonts[0]!),
      })),
    }
    : basePack.base.typography;

  /**
   * 设计指纹：从设计稿像素里量出能可靠量到的那些维度（疏密、图表色板、网格线、
   * 卡片表面、圆角档位），覆盖到基准族的设计语言上。
   * 量不到的项照抄基准族并写进 pendingConfirm——详见 fingerprint.ts 的说明。
   */
  const fingerprints = (input.images ?? []).map((img) => fingerprintFromDataUrl(img));
  const merged = fingerprints.length > 0 ? mergeFingerprints(fingerprints) : null;
  const fp = merged ? applyFingerprint(basePack.base.language, merged) : null;
  if (fp) {
    pendingConfirm.push(...fp.pending);
  }

  /**
   * 版式结构：从每张设计稿量出「这一页怎么排」，反推成容量画像与每页类型的几何。
   *
   * 这一步是「换个风格排版就变」的来源。在这之前，`base.layouts` 直接抄基准族，
   * 任何风格都套同一副骨架——那正是「只有色彩，没有排版」的结构性原因。
   *
   * 拼图会先被切分成单页（用户传上来的常常是一页里排好几张幻灯片）。
   * 接看图模型的那条路会用模型给的裁切框重跑同一套量测，见 measure.ts。
   */
  const decoded: DecodedImage[] = [];
  for (let i = 0; i < (input.images?.length ?? 0); i += 1) {
    try {
      decoded.push(decodeImage(input.images![i]!));
    } catch (err) {
      console.warn('[recognize] 第', i + 1, '张图解不开，跳过：',
        err instanceof Error ? err.message : String(err));
    }
  }
  const { measuredPages, measured, splitNote } = measurePages(decoded, basePack);
  pendingConfirm.push(...measured.pending);
  const hasMeasuredLayout = Object.keys(measured.byPageType).length > 0;

  const stylePack: StylePack = {
    ...basePack,
    // 识别就是「新建」，所以 id 必须每次都不一样：写死成 `${family}-recognized`
    // 的话，第二次识别会静默盖掉第一次的结果，用户以为存了两套其实只剩一套。
    styleId: `${family}-recognized-${Date.now().toString(36)}`,
    version: '1.0',
    name: `${basePack.name}（识别）`,
    description: [
      `${familyReason}；取色来源：${colorSource === 'url' ? '网页' : colorSource === 'images' ? '图片' : '风格族默认'}。`,
      splitNote ? `${splitNote}。` : '',
      fp && fp.applied.length > 0 ? `设计语言按设计稿实测覆盖：${fp.applied.join('；')}。` : '',
      measured.applied.length > 0 ? `版式按原稿实测：${measured.applied.join('；')}。` : '',
      fp && fp.applied.length > 0 ? notMeasurableClause(NOT_MEASURABLE) : '',
    ].filter(Boolean).join(''),
    base: {
      ...basePack.base,
      tokens,
      typography,
      // 网格与深浅都是设计语言的事实，从设计稿量出来的比基准族的值更可信，一律覆盖
      language: {
        ...(fp ? fp.language : basePack.base.language),
        grid: measured.grid,
        theme: dark ? 'dark' : 'light',
      },
      // 没量到结构时保持基准族的版式不动——用一份默认画像重建会把基准族的设计改坏
      layouts: hasMeasuredLayout ? buildLayouts(measured.capacity, measured.byPageType) : basePack.base.layouts,
      rules: measured.marginRatio !== null
        ? { ...basePack.base.rules, marginRatio: measured.marginRatio }
        : basePack.base.rules,
    },
    meta: { builtin: false, reviewed: false, createdAt: Date.now(), updatedAt: Date.now() },
  };

  /* ---- 6. 置信度 ---- */
  // 三路信号各自的上限。图片给得比网页高：一张真设计稿能直接量出疏密、面板层数、
  // 细线、圆角档位与色板，比从 HTML 里抠 CSS 更接近「看到的画面」。
  const sourceWeight = { text: 0.4, url: 0.35, images: 0.45 } as const;
  // 取色质量决定「颜色这一路信号」值多少分：源图没有可直接用的主色时，别给出虚高的置信度
  const colorWeight = classified ? Math.max(0.2, classified.strength) : 0;
  let confidence = 0;
  if (textSignals.length > 0) confidence += sourceWeight.text * Math.min(1, (textSignals[0]?.score ?? 0) / 6);
  if (urlColors.length > 0) confidence += sourceWeight.url * colorWeight;
  if (mergedImageColors.length > 0) {
    // 第一张图就该拿满这一路的权重。多图只是降方差（中位数已在 mergeFingerprints 里取过），
    // 不该当及格线——之前乘了 min(1, n/3)，等于传一张设计稿永远只能拿到个位数置信度，
    // 明明量出来了一整套语言，界面上却报红。
    confidence += sourceWeight.images * colorWeight;
  }
  if (colorSource === 'none') confidence *= 0.6;
  if (textSignals.length > 0 && urlColors.length > 0) {
    const descHue = mentionedHues(input.description ?? '');
    const urlHue = hueNameOf(urlColors[0]!.hex);
    if (descHue.length > 0 && !descHue.includes(urlHue)) {
      confidence *= 0.7;
      conflicts.push({
        field: 'hue', values: [descHue.join('、'), urlHue], winner: '描述',
        reason: `描述提到的色系（${descHue.join('、')}）与网页取色（${urlHue}）不一致，置信度下调`,
      });
    }
  }
  confidence = Math.max(0, Math.min(1, Number(confidence.toFixed(2))));

  if (confidence < 0.7 && !pendingConfirm.some((p) => p.field === 'family')) {
    pendingConfirm.push({
      field: 'family',
      question: `识别置信度 ${(confidence * 100).toFixed(0)}%，建议确认风格族是否为「${basePack.name}」`,
      candidates: BUILTIN_STYLE_PACKS.map((p) => p.name),
      resolved: basePack.name,
    });
  }

  const primarySource = textSignals.length > 0 ? 'text' : urlColors.length > 0 ? 'url' : 'images';
  // 规则版识别不调模型；模型精修由 server-core 的 recognize.service 在路由层叠加
  return {
    source: primarySource, confidence, stylePack, pendingConfirm, conflicts,
    measuredPages, modelAssisted: false, modelNote: '',
  };
}
