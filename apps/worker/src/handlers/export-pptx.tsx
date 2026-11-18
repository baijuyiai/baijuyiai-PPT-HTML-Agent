import PptxGenJSImport from 'pptxgenjs';
import { chromium } from 'playwright';
import { exportById, listPages, pageIR, requireProject, updateExport } from '@lumen/server-core';
import { objectKey } from '@lumen/storage';
import { brandOf } from '@lumen/ir-schema';
import { CANVAS_HEIGHT, CANVAS_WIDTH, buildSinglePageHtml } from '../render.js';
import { docForProject, packForProject, requireString } from '../util.js';
import type { TaskHandler } from './index.js';

/**
 * PPTX 导出（PptxGenJS）。
 *
 * `pptx`：逐页截图铺满，视觉 100% 还原，但文字不可编辑。
 * `pptx-editable`（默认）：**从渲染后的 DOM 里把文字抽出来**，藏掉原文字再截一张背景图，
 * 然后用真实文本框把文字铺回去。文字能选中能改。
 *
 * 为什么不用 Page IR 重建文本框：那条路只读 `blocks`，而新链路的页面 `blocks` 是空的、
 * 内容全在模型写的 HTML 里，等于没做。从渲染后的 DOM 抽则两条链路一视同仁，
 * 而且拿到的位置是**真的渲染位置**，不是按版式近似推算的。
 *
 * 代价（界面上要如实说）：字体在打开端缺失时会被替换；文字换行由 PowerPoint 重新排，
 * 与背景图上原本的位置可能有细微出入。
 */

/**
 * pptxgenjs 3.12 的 .d.ts 把类与命名空间合并后用 `export default` 导出，
 * 在 NodeNext 解析下拿不到构造签名（上游声明文件的已知问题）。
 * 运行时 CJS 导出就是构造函数本身，所以这里按实际用到的 API 声明最小接口再收窄。
 */
interface PptxSlide {
  addImage(options: Record<string, unknown>): void;
  addText(text: string, options: Record<string, unknown>): void;
}

interface PptxPresentation {
  layout: string;
  defineLayout(layout: { name: string; width: number; height: number }): void;
  addSlide(): PptxSlide;
  write(props?: { outputType?: string }): Promise<unknown>;
}

type PptxConstructor = new () => PptxPresentation;

const PptxGenJS = PptxGenJSImport as unknown as PptxConstructor;

/** 16:9 版式，单位英寸：13.333 x 7.5 与 1920x1080 同比 */
export const LUMEN_LAYOUT = { name: 'LUMEN_16_9', width: 13.333, height: 7.5 } as const;

/** 注册并启用 16:9 版式 */
export function defineLumenLayout(pptx: PptxPresentation): void {
  pptx.defineLayout({ name: LUMEN_LAYOUT.name, width: LUMEN_LAYOUT.width, height: LUMEN_LAYOUT.height });
  pptx.layout = LUMEN_LAYOUT.name;
}

/**
 * 从渲染后的 DOM 里抽出来的一个文本框。
 *
 * 位置与尺寸是**画布比例**（0–1），与版式单位无关；字号是画布像素。
 * 转成版式单位与磅值由 `textBoxOptions` 负责，那一步是纯函数、可测。
 */
export interface ExtractedTextBox {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 画布像素，不是磅 */
  fontSize: number;
  bold: boolean;
  color: string;
  align: 'left' | 'center' | 'right';
  /** computed font-family 的第一个族名。取不到就交给 PowerPoint 兜底 */
  fontFace: string;
}

/** 画布像素 → 磅。版式宽 13.333in = 960pt，画布 1920px，所以 1px = 0.5pt */
export function canvasPxToPt(px: number): number {
  return (px * LUMEN_LAYOUT.width * 72) / CANVAS_WIDTH;
}

/** 把抽出来的框转成 PptxGenJS 的 addText 选项 */
export function textBoxOptions(box: ExtractedTextBox): Record<string, unknown> {
  return {
    x: box.x * LUMEN_LAYOUT.width,
    y: box.y * LUMEN_LAYOUT.height,
    // 宽给一点点余量：PowerPoint 重新换行时比浏览器更容易多折一行，
    // 卡得刚刚好会折出框外。高度同理，多给半行
    w: box.w * LUMEN_LAYOUT.width * 1.02,
    h: box.h * LUMEN_LAYOUT.height + canvasPxToPt(box.fontSize) / 72 * 0.6,
    fontSize: Math.max(6, Math.round(canvasPxToPt(box.fontSize) * 10) / 10),
    bold: box.bold,
    color: cssColorToHex(box.color),
    align: box.align,
    valign: 'top',
    // 边距清零：浏览器里那点 padding 已经算进 rect 了，再留边距文字会整体偏移
    margin: 0,
    wrap: true,
    shrinkText: false,
    ...(box.fontFace ? { fontFace: box.fontFace } : {}),
  };
}

/**
 * CSS 颜色 → `RRGGBB`。
 *
 * computed 值在现代浏览器里一律是 `rgb(r, g, b)` / `rgba(r, g, b, a)`，
 * 但老引擎可能回 `#rgb` 或颜色名，所以三条都要认。认不出来就回深灰，
 * 不抛错——一个字色不对，不该让整份导出失败。
 */
export function cssColorToHex(color: string): string {
  const s = color.trim();
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(s);
  if (rgb) {
    return [1, 2, 3]
      .map((i) => Math.max(0, Math.min(255, Math.round(Number(rgb[i])))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
  }
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (hex) {
    const h = hex[1]!;
    return (h.length === 3 ? h.split('').map((c) => c + c).join('') : h).toUpperCase();
  }
  return '111111';
}

/**
 * 在页面里跑的抽取脚本。**必须是字符串**：worker 不引入 DOM lib
 * （会让 tts 包的 WebSocket 类型失配），所以这里不能写成箭头函数。
 *
 * ## 得先钻进 iframe
 *
 * 新链路的整页裹在 `iframe.lumen-html` 的 `srcdoc` 里（`render.tsx` 的 `pageMarkup`，
 * 为了隔离每页自己那份 `<style>`）。**文字全在里面**——只扫外层文档的话，
 * `document.body.querySelectorAll('*')` 只看到 `.lumen-pagebox` 与那个 iframe 两个元素，
 * 一个字都抽不到，于是文本框一个都铺不回去，整份导出退化成「每页一张图」。
 * `srcdoc` 的 iframe 继承父页 origin，`contentDocument` 取得回来（它没有 `sandbox` 属性）。
 *
 * 旧链路的页是平铺的，那时 `doc` 就是外层文档，两边一视同仁。
 *
 * 跳过三类东西，每一类都有具体理由：
 * - `<svg>` 子树：图形不是文字，抽出来是一串没有意义的路径名
 * - 图标字体（font-family 里带 icon / symbol / material）：那些字形是**连字**，
 *   原文是 `arrow_forward` 这种记号，抽出来在 PPT 里就是一串乱码
 * - `background-clip: text` 的渐变字：颜色被藏掉之后会留一个透明的洞
 *
 * 藏文字用 `visibility` 而不是 `display:none`——后者会把元素从布局里拿掉，
 * 背景图的排版跟着变，抽出来的坐标就对不上了。样式要插进**文字所在的那个文档**，
 * 插错地方等于没藏，背景图上会带着原文，铺回去就是重影。
 */
export const EXTRACT_TEXT_SCRIPT = `(function () {
  var W = ${CANVAS_WIDTH}, H = ${CANVAS_HEIGHT};
  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TITLE: 1, HEAD: 1, META: 1, LINK: 1 };
  var frame = (typeof document.querySelector === 'function') ? document.querySelector('iframe.lumen-html') : null;
  var doc = (frame && frame.contentDocument) ? frame.contentDocument : document;
  var win = doc.defaultView || null;
  // 取计算样式要用**文字所在那个文档**的 window。测试里没有 window，就用注入进来的那个
  var gcs = function (el) { return win ? win.getComputedStyle(el) : getComputedStyle(el); };
  var offX = 0, offY = 0;
  if (doc !== document && frame) {
    // iframe 里的 rect 是相对它自己的视口的。这里按 1:1 摆在 (0,0)，加上偏移是为了
    // 将来改外边距或位置时坐标不会整体偏掉
    var fr = frame.getBoundingClientRect();
    offX = fr.left;
    offY = fr.top;
  }
  var out = [];
  var els = doc.body ? doc.body.querySelectorAll('*') : [];
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    if (SKIP[el.tagName]) continue;
    if (el.closest && el.closest('svg')) continue;
    var text = '';
    for (var n = 0; n < el.childNodes.length; n++) {
      var node = el.childNodes[n];
      if (node.nodeType === 3) text += node.nodeValue;
    }
    text = text.replace(/\\s+/g, ' ').trim();
    if (!text) continue;
    var cs = gcs(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    if (parseFloat(cs.opacity) < 0.05) continue;
    if (cs.webkitBackgroundClip === 'text' || cs.backgroundClip === 'text') continue;
    var ff = cs.fontFamily || '';
    if (/icon|symbol|material/i.test(ff)) continue;
    var first = (ff.split(',')[0] || '').replace(/^["']|["']$/g, '').trim();
    // 通用族名（sans-serif / system-ui 这类）不是字体名，写进 typeface 只会让
    // PowerPoint 去找一个不存在的字体。空着，交给它自己的默认值
    if (/^(sans-serif|serif|monospace|cursive|fantasy|system-ui|ui-sans-serif|ui-serif|ui-monospace|-apple-system|inherit|initial)$/i.test(first)) first = '';
    var r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    out.push({
      text: text,
      x: (r.left + offX) / W,
      y: (r.top + offY) / H,
      w: r.width / W,
      h: r.height / H,
      fontSize: parseFloat(cs.fontSize) || 16,
      bold: (parseInt(cs.fontWeight, 10) || 400) >= 600,
      color: cs.color,
      align: cs.textAlign === 'center' ? 'center' : (cs.textAlign === 'right' || cs.textAlign === 'end') ? 'right' : 'left',
      fontFace: first
    });
    el.setAttribute('data-lumen-text', '1');
  }
  var st = doc.createElement('style');
  st.textContent = '[data-lumen-text], [data-lumen-text] * { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; }';
  doc.head.appendChild(st);
  return out;
})()`;

/** 可注入的截图渲染器：测试时可换成替身，避免真的起浏览器 */
export interface PptxShotRenderer {
  screenshot(html: string, options: { width: number; height: number }): Promise<Buffer>;
  /**
   * 可编辑版专用：抽出一页里所有可见文字，把原文字藏掉，再截一张**没有文字的背景图**。
   *
   * **抽取与截图必须在同一次加载里做**：分两次加载的话，两次的排版可能因为字体
   * 就绪时机不同而差一点，坐标就对不上了。
   */
  editablePage(
    html: string,
    options: { width: number; height: number },
  ): Promise<{ background: Buffer; boxes: ExtractedTextBox[] }>;
  close(): Promise<void>;
}

/**
 * iframe 里那份文档的字体。
 *
 * 外层 `document.fonts.ready` **管不到它**：srcdoc 的 iframe 是独立文档，自带一份
 * `FontFaceSet`，而页面的字体是 @font-face 内联在它自己的 `<style>` 里的。
 * 不等它，量出来的 rect 是兜底字体的，字号与行高都不对。
 */
const AWAIT_FRAME_FONTS = `(function () {
  var f = document.querySelector('iframe.lumen-html');
  var d = f && f.contentDocument;
  if (!d || !d.fonts || !d.fonts.ready) return Promise.resolve(null);
  return d.fonts.ready;
})()`;

const RAF = 'new Promise(function (r) { requestAnimationFrame(function () { r(null); }); })';

/** 等字体就绪再动手。字体没落位时量出来的 rect 是兜底字体的，字号与行高都不对 */
const SETTLE = ['document.fonts.ready', AWAIT_FRAME_FONTS, RAF];

/** Playwright 实现：1920x1080、deviceScaleFactor 1，逐页出 PNG */
export async function createPlaywrightShotRenderer(): Promise<PptxShotRenderer> {
  const browser = await chromium.launch({ headless: true });
  const openPage = async (html: string, options: { width: number; height: number }) => {
    const context = await browser.newContext({
      viewport: { width: options.width, height: options.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    // 字符串表达式而非箭头函数：worker 不引入 DOM lib（会让 tts 包的 WebSocket 类型失配）
    for (const expr of SETTLE) await page.evaluate(expr);
    return { context, page };
  };
  return {
    async screenshot(html, options) {
      const { context, page } = await openPage(html, options);
      try {
        return await page.screenshot({ type: 'png' });
      } finally {
        await context.close();
      }
    },
    async editablePage(html, options) {
      const { context, page } = await openPage(html, options);
      try {
        const boxes = (await page.evaluate(EXTRACT_TEXT_SCRIPT)) as ExtractedTextBox[];
        // 藏完文字要再等一帧：样式刚插进去，合成还没跟上，直接截会截到带文字的旧帧
        await page.evaluate(RAF);
        const background = await page.screenshot({ type: 'png' });
        return { background, boxes };
      } finally {
        await context.close();
      }
    },
    async close() {
      await browser.close();
    },
  };
}

/** PptxGenJS 的 write 可能返回 string / ArrayBuffer / Blob / Uint8Array，统一收成 Buffer */
export function toBuffer(out: unknown): Buffer {
  if (typeof out === 'string') return Buffer.from(out, 'base64');
  if (out instanceof Uint8Array) return Buffer.from(out);
  if (out instanceof ArrayBuffer) return Buffer.from(out);
  throw new Error('PPTX 输出类型不受支持');
}

export const exportPptx: TaskHandler = async (task, ctx) => {
  const exportId = requireString(task.payload.exportId, 'exportId');
  const format = typeof task.payload.format === 'string' ? task.payload.format : 'pptx';
  const editable = format === 'pptx-editable';

  const job = exportById(exportId);
  if (!job) throw new Error(`导出任务不存在：${exportId}`);

  const project = requireProject(job.projectId, job.tenantId);
  const pack = packForProject(project.styleId);
  // 渲染侧用 `brandOf`（永远返回一个 BrandSlot），**不是** `hasBrand`——理由见 render.tsx 的 pageMarkup
  const brand = brandOf(project);
  const pages = listPages(job.projectId)
    .filter((row) => row.status === 'ready')
    .map((row) => pageIR(row));
  if (pages.length === 0) throw new Error('项目没有就绪的页面，无法导出');

  const renderer = await createPlaywrightShotRenderer();
  try {
    const pptx = new PptxGenJS();
    defineLumenLayout(pptx);

    for (const page of pages) {
      const html = await buildSinglePageHtml(
        page, pack, (key) => ctx.storage.get(key),
        docForProject(project.styleId), brand, project.chartStyle,
      );
      const slide = pptx.addSlide();

      if (editable) {
        // 先抽文字、藏掉、截一张没文字的背景，再把文字用真文本框铺回去。
        // **顺序不能反**：先截再抽的话背景图上带着原文字，铺回去就是重影
        const { background, boxes } = await renderer.editablePage(html, {
          width: CANVAS_WIDTH, height: CANVAS_HEIGHT,
        });
        slide.addImage({
          data: `data:image/png;base64,${background.toString('base64')}`,
          x: 0, y: 0, w: LUMEN_LAYOUT.width, h: LUMEN_LAYOUT.height,
        });
        for (const box of boxes) slide.addText(box.text, textBoxOptions(box));
      } else {
        const shot = await renderer.screenshot(html, { width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
        slide.addImage({
          data: `data:image/png;base64,${shot.toString('base64')}`,
          x: 0,
          y: 0,
          w: LUMEN_LAYOUT.width,
          h: LUMEN_LAYOUT.height,
        });
      }
    }

    const buffer = toBuffer(await pptx.write({ outputType: 'nodebuffer' }));
    const key = objectKey(job.tenantId, job.projectId, 'exports', `${exportId}.pptx`);
    await ctx.storage.put(
      key,
      buffer,
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    );
    updateExport(exportId, {
      status: 'succeeded',
      progress: 1,
      artifactKey: key,
      pageCount: pages.length,
      finished: true,
    });
    return editable
      ? { degradeReason: '文字可编辑，但字体在打开端缺失时会被替换，复杂排版可能错位' }
      : {};
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateExport(exportId, { status: 'failed', error: message, finished: true });
    throw err;
  } finally {
    await renderer.close();
  }
};
