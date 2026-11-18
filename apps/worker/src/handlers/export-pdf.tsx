import { chromium } from 'playwright';
import { exportById, listPages, pageIR, requireProject, updateExport } from '@lumen/server-core';
import { objectKey } from '@lumen/storage';
import { brandOf } from '@lumen/ir-schema';
import type { BrandSlot, PageIR, StyleDoc, StylePack } from '@lumen/ir-schema';
import {
  CANVAS_HEIGHT, CANVAS_WIDTH, HTML_PAGE_CSS, escapeHtml, inlineFileUrls, loadMotionCss, pageMarkup,
} from '../render.js';
import { docForProject, packForProject, requireString } from '../util.js';
import type { TaskHandler } from './index.js';

/**
 * PDF 导出（Playwright）。
 *
 * 决策记录：不做「逐页产单页 PDF 再合并」——那需要额外引入 PDF 合并库。
 * 改成一次 setContent 装载整份文档、用 CSS `page-break-after: always` 让 Chromium
 * 自己分页、一次 page.pdf() 出整份，更简单也更可靠。
 */

const PRINT_CSS = `
html, body { margin: 0; padding: 0; background: #ffffff; }
* { box-sizing: border-box; }
.lumen-print-page { width: ${CANVAS_WIDTH}px; height: ${CANVAS_HEIGHT}px; overflow: hidden; page-break-after: always; break-after: page; }
.lumen-print-page:last-child { page-break-after: auto; break-after: auto; }
${HTML_PAGE_CSS}
`;

/** 打印用 HTML：全部页装进一个文档，靠 CSS 分页 */
export async function buildPrintHtml(input: {
  title: string;
  pages: PageIR[];
  pack: StylePack;
  /** 新链路的风格文档。页面自带 HTML 时用它装配，缺省则全走旧渲染 */
  doc?: StyleDoc | null;
  /** 项目品牌。不传就是「没有品牌」 */
  brand?: BrandSlot;
  /** 图表视觉风格。不传就用默认那一套 */
  chartStyle?: string;
  readFile: (key: string) => Promise<Buffer>;
}): Promise<string> {
  const body = input.pages
    .map((page) => `<section class="lumen-print-page">${pageMarkup(page, input.pack, input.doc ?? null, input.brand, input.chartStyle)}</section>`)
    .join('\n');

  const html = [
    '<!DOCTYPE html>',
    '<html lang="zh-CN">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(input.title)}</title>`,
    '<style>',
    loadMotionCss(),
    PRINT_CSS,
    '</style>',
    '</head>',
    '<body>',
    body,
    '</body>',
    '</html>',
  ].join('\n');

  return inlineFileUrls(html, input.readFile);
}

/** 校验渲染出的页数与 deck 一致；不一致时抛出可读错误 */
export function assertPageCount(expected: number, actual: number): void {
  if (expected !== actual) {
    throw new Error(`PDF 页数与 deck 不一致：期望 ${expected} 页，实际 ${actual} 页`);
  }
}

/** 可注入的渲染器：测试时可换成替身，避免真的起浏览器 */
export interface PdfRenderer {
  render(html: string, options: { width: number; height: number }): Promise<{ buffer: Buffer; pageCount: number }>;
  close(): Promise<void>;
}

/** Playwright 实现：一次性装载整份文档，交给 Chromium 分页 */
export async function createPlaywrightPdfRenderer(): Promise<PdfRenderer> {
  const browser = await chromium.launch({ headless: true });
  return {
    async render(html, options) {
      const page = await browser.newPage();
      try {
        await page.setViewportSize({ width: options.width, height: options.height });
        await page.setContent(html, { waitUntil: 'load' });
        // 等字体就绪与一次 rAF，避免截到字体回退态或首帧。
        // 这里用字符串表达式而不是箭头函数：worker 不引入 DOM lib（会让 tts 包的 WebSocket 类型失配）。
        await page.evaluate('document.fonts.ready');
        await page.evaluate('new Promise(function (r) { requestAnimationFrame(function () { r(null); }); })');
        const pageCount = await page.locator('.lumen-print-page').count();
        const pdf = await page.pdf({
          width: `${options.width}px`,
          height: `${options.height}px`,
          printBackground: true,
        });
        return { buffer: Buffer.from(pdf), pageCount };
      } finally {
        await page.close();
      }
    },
    async close() {
      await browser.close();
    },
  };
}

export const exportPdf: TaskHandler = async (task, ctx) => {
  const exportId = requireString(task.payload.exportId, 'exportId');
  const job = exportById(exportId);
  if (!job) throw new Error(`导出任务不存在：${exportId}`);

  const project = requireProject(job.projectId, job.tenantId);
  const pack = packForProject(project.styleId);
  const pages = listPages(job.projectId)
    .filter((row) => row.status === 'ready')
    .map((row) => pageIR(row));
  if (pages.length === 0) throw new Error('项目没有就绪的页面，无法导出');

  // 渲染侧用 `brandOf`（永远返回一个 BrandSlot），**不是** `hasBrand`——理由见 render.tsx 的 pageMarkup
  const brand = brandOf(project);
  const html = await buildPrintHtml({
    title: project.title,
    pages,
    pack,
    doc: docForProject(project.styleId),
    brand,
    chartStyle: project.chartStyle,
    readFile: (key) => ctx.storage.get(key),
  });

  const renderer = await createPlaywrightPdfRenderer();
  try {
    const { buffer, pageCount } = await renderer.render(html, { width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
    assertPageCount(pages.length, pageCount);
    const key = objectKey(job.tenantId, job.projectId, 'exports', `${exportId}.pdf`);
    await ctx.storage.put(key, buffer, 'application/pdf');
    updateExport(exportId, {
      status: 'succeeded',
      progress: 1,
      artifactKey: key,
      pageCount,
      finished: true,
    });
    return {};
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateExport(exportId, { status: 'failed', error: message, finished: true });
    throw err;
  } finally {
    // 浏览器用完必须关，失败路径也要关
    await renderer.close();
  }
};
