// 必须排在最前：它给全局装上 React，供经典 JSX 编译产物使用
import './jsx-runtime.js';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { Slide, NewChainAvatar, NewChainDecoration } from '@lumen/slides';
import { buildSlideContext } from '@lumen/render-engine';
import { buildPageDocument, fontStacksOf, imageOverridesOf } from '@lumen/ir-schema';
import { readStockFile } from '@lumen/stock-library/node';
import { readFontFile } from '@lumen/ir-schema/node';
import { logger } from '@lumen/server-core';
import { stockImagesFor, stockPaletteOf } from '@lumen/stock-library';
import { makeChartRenderer } from '@lumen/charts';
import type { BrandSlot, PageIR, StyleDoc, StylePack } from '@lumen/ir-schema';
import { encodePlaceholderPng } from './png.js';

/**
 * 导出共用的渲染工具。
 *
 * 三条导出链路（HTML / PDF / PPTX）都要把 Page IR 渲染成静态标记，
 * 并且都要把图片内联成 data URL，所以统一放在这里，避免三份实现漂移。
 */

/** 画布尺寸，与 design-system 的 canvas 保持一致 */
export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

const require = createRequire(import.meta.url);

/** 图片读不到时的兜底：一张极小的占位 PNG，保证产物里绝不出现外链 */
const FALLBACK_IMAGE_DATA_URL = `data:image/png;base64,${encodePlaceholderPng(8, 8).toString('base64')}`;

/**
 * 读取 slides 包的动效 CSS 原文。
 * 导出必须内联一切（PRD §5.10），所以这里读真值文件，而不是把 keyframes 抄一份。
 */
export function loadMotionCss(): string {
  try {
    return readFileSync(require.resolve('@lumen/slides/styles.css'), 'utf8');
  } catch {
    // 打包或发布后子路径不可解析时，退回仓库内相对路径
    return readFileSync(new URL('../../../packages/slides/src/styles.css', import.meta.url), 'utf8');
  }
}

/** HTML 转义，用于标题等直接拼进文档的文本 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 单页 Slide 的静态标记（画布 1920x1080，scale=1，动效在导出模式下降级为静态） */
export function renderPageMarkup(page: PageIR, pack: StylePack): string {
  const ctx = buildSlideContext(page, pack, { mode: 'export' });
  return renderToStaticMarkup(<Slide ctx={ctx} scale={1} />);
}

/**
 * 一页的标记。带 HTML 的走 iframe，旧页走 React 渲染。
 *
 * **为什么必须用 iframe 而不是把 HTML 直接拼进来**：模型给每一页写的 `<style>` 是
 * 全局的，而各页用的类名高度重合（`.stage` / `.title` / `.card` 这类）。
 * 直接拼进同一个文档，后一页的 `.title{font-size:48px}` 会把前一页的
 * `.title{font-size:120px}` 覆盖掉——导出的整本册子里，所有同名的元素都用最后一条规则。
 * iframe 自带样式隔离，各页互不干扰。
 *
 * 尺寸固定 1920×1080，与外层 `.lumen-fit` 的 transform 缩放天然配合：
 * 缩放外层就把 iframe 一起缩了，翻页脚本一行都不用改。
 */
export function pageMarkup(
  page: PageIR,
  pack: StylePack,
  doc: StyleDoc | null,
  /**
   * 项目品牌。不传就是「没有品牌」。
   *
   * 调用方**必须**传 `brandOf(project)` 的返回值，不能拿 `hasBrand` 去筛：
   * `brandOf` 永远返回一个 `BrandSlot`（五列全空时是 `{ name:'', tagline:'' }`），
   * `fillBrandSlots` 据此把没有值的槽位元素**整条删掉**——「清空品牌」之后页眉上
   * 那些空壳槽位才会消失。传 `undefined` 的话 `if (opts.brand)` 那一步根本不执行，
   * 空壳就留在页眉上，用户看到的是每页多一个空方块。
   * （`hasBrand` 是生成侧判断「提示词提不提槽位」用的，与这里不是一个问题。）
   */
  brand?: BrandSlot,
  /**
   * 图表视觉风格（`@lumen/charts` 的 `CHART_STYLE_IDS`）。不传就用默认那一套。
   *
   * 与 `brand` 同一个路数：**项目级、渲染期**的东西，由调用方从项目行取出来传进来。
   * 放在最后一个可选参数上，老调用点一个字都不用改。
   */
  chartStyle?: string,
): string {
  if (page.html.trim().length > 0 && doc) {
    // 图位要配图，且配的必须与工作台里看到的是同一套——两边都从配图库按色板挑，
    // 挑法确定，所以同一页每次拿到同样的图。
    // **图位调整也要一起带上**：用户在图位面板上换过、删过的图，导出与截图必须一致，
    // 少传这一份就会出现「编辑器里换掉了、导出来还是原来那张」
    const images = stockImagesFor(page.html, stockPaletteOf(doc.palette, doc.theme === 'dark'), page.pageType);
    const inner = buildPageDocument(page.html, {
      palette: doc.palette,
      ...fontStacksOf(doc),
      images,
      title: page.title.main,
      // **导出要的是落点那一帧**：页面里可能带着逐个进场的动画，
      // 不按死的话截图会拍在一排元素半透明地停在半路上的样子
      motion: 'none',
      /*
        图表槽由 `@lumen/charts` 出图。**这一行与 `HtmlMock` 里那一行必须一致**——
        漏掉的话导出件里的图表全变成占位块，而编辑器里看着是好的。
        色板同样从 `doc.palette` 派生（它已经是深色模式那一份），不从 tokens 取。
        `chartStyle` 是项目级旋钮，由调用方从项目行取出来传进来——
        漏传的症状是「编辑器里是数据看板、导出件里是经典」。
      */
      renderChart: makeChartRenderer({ palette: doc.palette, ...(chartStyle ? { style: chartStyle } : {}) }),
      ...(brand ? { brand } : {}),
      overrides: imageOverridesOf(page.overrides),
    });
    // srcdoc 是属性值，转义后整个文档塞进一个双引号里
    const frame = `<iframe class="lumen-html" srcdoc="${escapeHtml(inner)}"></iframe>`;
    // 装饰件叠在 iframe 之上，与页面内容同一个 1920×1080 坐标系。
    // 用的是与工作台、演示态同一个组件，取同一份页类型映射——两处各挑一次就会出现
    // 「编辑器里有、导出来没有」
    const decoration = renderToStaticMarkup(
      <>
        <NewChainDecoration
          pageType={page.pageType}
          palette={doc.palette}
          isDark={doc.theme === 'dark'}
          fontFamily={doc.fontFamily}
          pageNo={page.footer.pageNo}
        />
        {/* 数字人是页面的一部分，导出里也得有——工作台上开着、导出来没了
            是最容易被当成 bug 报上来的那种不一致。光标不导：它是播讲时的东西，
            静帧里停在那儿只会挡字 */}
        <NewChainAvatar avatar={page.avatar} />
      </>,
    );
    return `<div class="lumen-pagebox">${frame}${decoration}</div>`;
  }
  return renderPageMarkup(page, pack);
}

/** iframe 页在容器里的尺寸。与画布一致，靠外层 transform 缩放 */
export const HTML_PAGE_CSS = [
  '.lumen-html { width: 1920px; height: 1080px; border: 0; display: block; }',
  // 装饰件的绝对定位要以它为准，所以这一层必须是定位祖先，且尺寸等于画布。
  // **名字不能叫 `.lumen-page`**：那个类名已经被单文件 HTML 的整页 section 占了，
  // 那边的规则是 `position:absolute; inset:0; display:none`，撞上就会把整页藏起来
  '.lumen-pagebox { position: relative; width: 1920px; height: 1080px; overflow: hidden; }',
].join('\n');

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

/** 按扩展名推断 MIME，未知一律按二进制流处理 */
export function mimeForKey(key: string): string {
  const dot = key.lastIndexOf('.');
  const ext = dot >= 0 ? key.slice(dot + 1).toLowerCase() : '';
  return MIME_BY_EXT[ext] ?? 'application/octet-stream';
}

/**
 * 把 HTML 里所有外链引用换成 data URL，彻底消除外链。
 * 覆盖两种写法：`<img src="...">` 与 `background-image: url("...")`。
 * 读不到对象时退回占位图，绝不保留原始外链。
 *
 * 要处理三种前缀：
 * - `/files/<key>` —— 用户上传的图，从对象存储读；
 * - `/stock/<file>` —— 样机配图库，随仓库分发，从配图包里读。
 *   漏掉它的话，**样机上好看，导出的成品里全是破图**——而导出才是用户会发出去的东西。
 * - `/fonts/<file>` —— 随仓库分发的拉丁字体。漏掉它不会「破图」，但会**静默退回
 *   Georgia**：成品在别人机器上打开时字形完全变了，而这件事在导出日志里一个字都没有。
 */
export async function inlineFileUrls(
  html: string,
  readFile: (key: string) => Promise<Buffer>,
): Promise<string> {
  const files = new Set<string>();
  const stock = new Set<string>();
  const fonts = new Set<string>();
  for (const m of html.matchAll(/\/files\/([A-Za-z0-9._/-]+)/g)) if (m[1]) files.add(m[1]);
  for (const m of html.matchAll(/\/stock\/([A-Za-z0-9._/-]+)/g)) if (m[1]) stock.add(m[1]);
  for (const m of html.matchAll(/\/fonts\/([A-Za-z0-9._-]+)/g)) if (m[1]) fonts.add(m[1]);

  let out = html;
  for (const key of files) {
    let dataUrl = FALLBACK_IMAGE_DATA_URL;
    try {
      const buf = await readFile(key);
      dataUrl = `data:${mimeForKey(key)};base64,${buf.toString('base64')}`;
    } catch {
      // 对象缺失时用占位图兜底，保证产物仍是单文件
    }
    out = out.split(`/files/${key}`).join(dataUrl);
  }
  for (const file of stock) {
    let dataUrl = FALLBACK_IMAGE_DATA_URL;
    try {
      const buf = await readStockFile(file);
      dataUrl = `data:${mimeForKey(file)};base64,${buf.toString('base64')}`;
    } catch {
      // 清单里有、磁盘上没有时同样兜底，不让导出整条挂掉
    }
    out = out.split(`/stock/${file}`).join(dataUrl);
  }
  for (const file of fonts) {
    /*
      字体读不到时**什么都不换**，不回退成占位图——字体没有「占位」这一说，
      换成一个空 data URL 反而会让整条 `src` 失效、连后面的系统字体都不试。
      留着原地址，浏览器在能联网时会去取，取不到就按字体栈往下落。
    */
    try {
      const buf = await readFontFile(file);
      out = out.split(`/fonts/${file}`).join(`data:font/woff2;base64,${buf.toString('base64')}`);
    } catch {
      logger.warn('字体文件读不到，导出里会退回系统字体', { file });
    }
  }
  return out;
}

/* ---------------- 单文件 HTML（可交互演示） ---------------- */

const DECK_CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; height: 100%; background: #0f1115; overflow: hidden; }
body { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif; }
.lumen-page { position: absolute; inset: 0; display: none; align-items: center; justify-content: center; }
.lumen-page.is-active { display: flex; }
.lumen-fit { width: ${CANVAS_WIDTH}px; height: ${CANVAS_HEIGHT}px; transform: scale(var(--lumen-fit, 1)); transform-origin: center center; }
.lumen-progress { position: fixed; left: 0; right: 0; bottom: 0; height: 3px; background: rgba(255, 255, 255, 0.14); z-index: 20; }
.lumen-progress > i { display: block; height: 100%; width: 0; background: #6d4aff; transition: width 0.2s ease; }
.lumen-pageNo { position: fixed; right: 14px; bottom: 12px; z-index: 20; color: rgba(255, 255, 255, 0.72); font-size: 14px; letter-spacing: 0.04em; font-variant-numeric: tabular-nums; }

${HTML_PAGE_CSS}`;

/** 翻页脚本：键盘方向键、点击左右半屏、触摸滑动三种方式 */
const DECK_SCRIPT = `
(function () {
  var pages = Array.prototype.slice.call(document.querySelectorAll('.lumen-page'));
  var total = pages.length;
  var current = 0;
  var bar = document.querySelector('.lumen-progress > i');
  var label = document.querySelector('.lumen-pageNo');
  var suppressClick = false;
  function show(index) {
    if (total === 0) return;
    if (index < 0) index = 0;
    if (index > total - 1) index = total - 1;
    current = index;
    for (var i = 0; i < total; i += 1) {
      pages[i].classList.toggle('is-active', i === current);
    }
    if (bar) bar.style.width = ((current + 1) / total * 100) + '%';
    if (label) label.textContent = (current + 1) + ' / ' + total;
  }
  function next() { show(current + 1); }
  function prev() { show(current - 1); }
  function fit() {
    var scale = Math.min(window.innerWidth / ${CANVAS_WIDTH}, window.innerHeight / ${CANVAS_HEIGHT});
    document.documentElement.style.setProperty('--lumen-fit', String(scale));
  }
  document.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault(); next();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault(); prev();
    } else if (e.key === 'Home') {
      show(0);
    } else if (e.key === 'End') {
      show(total - 1);
    }
  });
  document.addEventListener('click', function (e) {
    if (suppressClick) { suppressClick = false; return; }
    var ratio = e.clientX / Math.max(1, window.innerWidth);
    if (ratio < 0.5) prev(); else next();
  });
  var startX = 0;
  var startY = 0;
  document.addEventListener('touchstart', function (e) {
    var t = e.changedTouches[0];
    startX = t.clientX; startY = t.clientY;
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    var t = e.changedTouches[0];
    var dx = t.clientX - startX;
    var dy = t.clientY - startY;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      suppressClick = true;
      if (dx < 0) next(); else prev();
    }
  });
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', fit);
  fit();
  show(0);
})();
`;

export interface SelfContainedHtmlInput {
  title: string;
  pages: PageIR[];
  pack: StylePack;
  /** 新链路的风格文档。页面自带 HTML 时要用它的配色与字体栈装配；缺省则全走旧渲染 */
  doc?: StyleDoc | null;
  /** 读取 /files/<key> 对应对象，默认从 ctx.storage 读；缺省时图片会退回占位图 */
  readFile?: (key: string) => Promise<Buffer>;
  /** 内联的动效 CSS，默认读 slides/styles.css */
  motionCss?: string;
  /** 项目品牌。不传就是「没有品牌」 */
  brand?: BrandSlot;
  /** 图表视觉风格。不传就用默认那一套 */
  chartStyle?: string;
}

/**
 * 单文件自包含 HTML：所有页叠在一起，只显示当前页；
 * 键盘方向键、点击左右半屏、触摸滑动都能翻页；含页码与进度条。
 * 产物不引用任何外部资源，微信内置浏览器可直接打开。
 */
export async function buildSelfContainedHtml(input: SelfContainedHtmlInput): Promise<string> {
  const motionCss = input.motionCss ?? loadMotionCss();
  const sections = input.pages
    .map((page, i) => `<section class="lumen-page" data-page="${i}"><div class="lumen-fit">${pageMarkup(page, input.pack, input.doc ?? null, input.brand, input.chartStyle)}</div></section>`)
    .join('\n');

  const html = [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    `<title>${escapeHtml(input.title)}</title>`,
    '<style>',
    motionCss,
    DECK_CSS,
    '</style>',
    '</head>',
    '<body>',
    '<div class="lumen-deck">',
    sections,
    '</div>',
    '<div class="lumen-progress"><i></i></div>',
    '<div class="lumen-pageNo"></div>',
    `<script>${DECK_SCRIPT}</script>`,
    '</body>',
    '</html>',
  ].join('\n');

  const readFile = input.readFile ?? (async () => {
    throw new Error('未提供对象读取函数');
  });
  return inlineFileUrls(html, readFile);
}

/* ---------------- 单页 HTML（供截图与打印） ---------------- */

const SINGLE_PAGE_CSS = `html, body { margin: 0; padding: 0; background: #ffffff; } * { box-sizing: border-box; } ${HTML_PAGE_CSS}`;

/** 单页 HTML：画布恰好 1920x1080，无外边距，供 Playwright 截图 */
export async function buildSinglePageHtml(
  page: PageIR,
  pack: StylePack,
  readFile: (key: string) => Promise<Buffer>,
  doc?: StyleDoc | null,
  brand?: BrandSlot,
  chartStyle?: string,
): Promise<string> {
  const html = [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    '<style>',
    loadMotionCss(),
    SINGLE_PAGE_CSS,
    '</style>',
    '</head>',
    '<body>',
    pageMarkup(page, pack, doc ?? null, brand, chartStyle),
    '</body>',
    '</html>',
  ].join('\n');
  return inlineFileUrls(html, readFile);
}
