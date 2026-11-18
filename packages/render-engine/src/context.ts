import type {
  LayoutVariantSpec, MotionName, PageIR, PageType, StylePack, TitleTemplate,
} from '@lumen/ir-schema';
import { canvas, fontSize as ladder } from '@lumen/design-system';
import { packCssVars, pickTitleTemplate } from '@lumen/style-engine';
import { measureContent } from '@lumen/content-engine';
import { resolveMotion } from '@lumen/motion';

/** 渲染用途。导出时降级动效，编辑态显示骨架。 */
export type RenderMode = 'edit' | 'present' | 'export';

/**
 * 交给 slides 渲染的上下文。
 * 关键约束：配色 / 字体 / 间距 / 动效全部来自这里，slides 模板不得自行决定（PRD §5.15）。
 */
export interface SlideRenderContext {
  page: PageIR;
  pack: StylePack;
  variant: LayoutVariantSpec;
  titleTemplate: TitleTemplate;
  /** CSS 变量，直接铺到画布根节点 */
  cssVars: Record<string, string>;
  /** 页面这一层的进入动效。逐块进场时它是 `stagger`，映射成整页淡入 */
  motion: MotionName;
  /**
   * 元素逐块进场的种子。`null` = 不逐块。
   * `Slide` 据此在根节点挂方向、在内容块上排序号（见 `styles.css`）。
   */
  staggerSeed: number | null;
  theme: 'light' | 'dark';
  mode: RenderMode;
  /** 画布尺寸与边距 */
  canvas: { w: number; h: number; marginPx: number };
  /** 字号缩放（溢出降档时 < 1），slides 需按此缩放全部字号 */
  fontScale: number;
  /** 页脚页码文本 */
  pageNoText: string;
}

const FONT_SCALE_KEY = 'fontScale';

/** 读取溢出降档写入的字号缩放，默认 1 */
export function getFontScale(page: PageIR): number {
  const v = (page.overrides as Record<string, unknown>)[FONT_SCALE_KEY];
  return typeof v === 'number' && v > 0 && v <= 1 ? v : 1;
}

export function setFontScale(page: PageIR, scale: number): PageIR {
  return { ...page, overrides: { ...page.overrides, [FONT_SCALE_KEY]: scale } };
}

/**
 * 把缩放后的字号吸附到 12/14/16/20/24/32/40/56 阶梯上。
 * 降字号必须在阶梯内进行（PRD §5.4），不能随意取 17px 这种值。
 */
export function scaledFontSize(sizePx: number, scale: number): number {
  if (scale >= 1) return sizePx;
  const target = sizePx * scale;
  const steps = Object.values(ladder) as number[];
  let best = steps[0]!;
  for (const s of steps) {
    if (s <= target) best = s;
  }
  // 不低于阶梯最小值（也是品质基线下限）
  return Math.max(best, steps[0]!);
}

/** 取该页应有的版式；页面声明的版式不存在时按页类型回落，避免渲染期崩溃 */
export function resolveVariant(page: PageIR, pack: StylePack): LayoutVariantSpec {
  const exact = pack.base.layouts.find((l) => l.id === page.layoutVariant);
  if (exact) return exact;
  const sameType = pack.base.layouts.filter((l) => l.pageType === page.pageType);
  if (sameType.length > 0) return sameType[0]!;
  const fallback = pack.base.layouts.find((l) => l.pageType === 'text');
  if (!fallback) throw new Error(`风格包 ${pack.styleId} 没有任何可用版式`);
  return fallback;
}

export interface BuildContextOptions {
  theme?: 'light' | 'dark';
  mode?: RenderMode;
  /**
   * 直接指定页面级动效，不走 `page.motion.enter`。
   *
   * 演示态与风格库单页预览用它：那边整页的进出由**翻页层**负责，内层再动一次就是双份位移。
   * 唯一要留给内层的只有 `stagger`——它动的是页内元素，翻页层管不到。
   */
  motion?: MotionName;
  /** 元素逐块进场的种子。与 `motion` 配套传，见 `resolveMotion` 的返回值 */
  staggerSeed?: number | null;
}

export function buildSlideContext(page: PageIR, pack: StylePack, opts: BuildContextOptions = {}): SlideRenderContext {
  const variant = resolveVariant(page, pack);
  const load = measureContent(page);
  const titleTemplate = pickTitleTemplate(pack, {
    mainChars: page.title.main.length,
    hasSub: page.title.sub.length > 0,
    hasEyebrow: page.title.eyebrow.length > 0,
    imageLed: page.blocks.some((b) => b.type === 'image') || variant.id.includes('full-bleed'),
  });
  const fontScale = getFontScale(page);
  const marginPx = Math.round(canvas.width * pack.base.rules.marginRatio);

  // 动效要在这里解析成具体名：slides 只认具体动效名。种子用页码——
  // 这条路上拿不到 deck 下标，而页码稳定、确定，同一页每次渲染都拿到同一个动效。
  // 调用方显式传了的以调用方为准（演示态整页的进出归翻页层管，内层只能逐块）
  const resolved = resolveMotion(page.motion, page.footer.pageNo);

  return {
    page,
    pack,
    variant,
    titleTemplate,
    cssVars: packCssVars(pack),
    motion: opts.motion ?? resolved.page,
    staggerSeed: opts.staggerSeed !== undefined ? opts.staggerSeed : resolved.staggerSeed,
    // 深色优先取调用方指定的（编辑器里用户手动切主题），没指定就用设计语言自带的：
    // 深色设计稿识别出来的包，默认就该渲染成深色，否则预览与参考图对不上
    theme: opts.theme ?? pack.base.language.theme,
    mode: opts.mode ?? 'edit',
    canvas: { w: canvas.width, h: canvas.height, marginPx },
    fontScale,
    pageNoText: page.footer.pageNo > 0 ? String(page.footer.pageNo) : '',
  };
}

/** 该页是否需要渲染数字人图层 */
export function needsAvatar(page: PageIR): boolean {
  return page.avatar.enabled && page.avatar.mode !== 'off';
}

/** 该页是否处于全屏数字人模式（PPT 降为衬底） */
export function isAvatarFullscreen(page: PageIR): boolean {
  return page.avatar.enabled && page.avatar.mode === 'fullscreen';
}

/** 导出时动效一律降级为静态（PRD §5.10） */
export function motionForMode(mode: RenderMode, motion: MotionName): MotionName {
  return mode === 'export' ? 'none' : motion;
}

/** 页类型 → 默认版式，供大纲新增页时使用 */
export const DEFAULT_VARIANT_BY_TYPE: Record<PageType, string> = {
  cover: 'cover/centered@v1',
  toc: 'toc/numbered@v1',
  section: 'section/minimal@v1',
  text: 'text/one-column@v1',
  imageText: 'imageText/left-right@v1',
  gallery: 'imageText/four-grid@v1',
  people: 'imageText/left-right@v1',
  chart: 'chart/full@v1',
  // 图解页没有对应的旧版式。这里必须给一个**真实存在于内置包里的版式 id**
  // （render-engine.test.ts 会遍历本表逐个断言它在包里），所以退回 chart/full@v1。
  // 注意：这只服务于旧渲染器。当前的 HTML 生成链路根本不读这张表——它按该页类型的
  // 提示词直接产出 HTML，这个值只在旧路径兜底时才用得上。
  architecture: 'chart/full@v1',
  mindMap: 'chart/full@v1',
  // 界面页同理：旧渲染器没有「设备模型」这种版式，退回最接近的「左图右文」
  ui: 'imageText/left-right@v1',
  metrics: 'metrics/three-card@v1',
  end: 'end/centered@v1',
};
