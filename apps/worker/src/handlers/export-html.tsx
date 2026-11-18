import { exportById, listPages, pageIR, requireProject, updateExport } from '@lumen/server-core';
import { objectKey } from '@lumen/storage';
import { brandOf } from '@lumen/ir-schema';
import { buildSelfContainedHtml } from '../render.js';
import { asString, docForProject, packForProject, requireString } from '../util.js';
import type { TaskHandler } from './index.js';

/**
 * HTML 单文件导出。
 *
 * 产物必须自包含：无 CDN、无外链字体、图片全部转 data URL，
 * 微信内置浏览器可直接打开（PRD §5.7 / §5.8）。
 */
export const exportHtml: TaskHandler = async (task, ctx) => {
  const exportId = requireString(task.payload.exportId, 'exportId');
  const job = exportById(exportId);
  if (!job) throw new Error(`导出任务不存在：${exportId}`);

  const project = requireProject(job.projectId, job.tenantId);
  const pack = packForProject(project.styleId);

  // 只导出就绪页，按 pageIndex 升序（listPages 已按 pageIndex 排序）
  const pages = listPages(job.projectId)
    .filter((row) => row.status === 'ready')
    .map((row) => pageIR(row));
  if (pages.length === 0) throw new Error('项目没有就绪的页面，无法导出');

  const title = asString(task.payload.title) ?? project.title;
  // 渲染侧用 `brandOf`（永远返回一个 BrandSlot），**不是** `hasBrand`——理由见 render.tsx 的 pageMarkup
  const brand = brandOf(project);
  const html = await buildSelfContainedHtml({
    title,
    pages,
    pack,
    doc: docForProject(project.styleId),
    brand,
    // 图表风格是项目级旋钮：导出件必须与编辑器里看到的是同一套
    chartStyle: project.chartStyle,
    readFile: (key) => ctx.storage.get(key),
  });

  const key = objectKey(job.tenantId, job.projectId, 'exports', `${exportId}.html`);
  await ctx.storage.put(key, Buffer.from(html, 'utf8'), 'text/html; charset=utf-8');
  updateExport(exportId, {
    status: 'succeeded',
    progress: 1,
    artifactKey: key,
    pageCount: pages.length,
    finished: true,
  });
  return {};
};
