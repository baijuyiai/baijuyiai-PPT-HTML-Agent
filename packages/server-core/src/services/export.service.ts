import { all, get, insertRow, updateRow } from '../db/client.js';
import { newId } from '../lib/crypto.js';
import { conflict, notFound } from '../lib/errors.js';
import { createStorage } from '@lumen/storage';
import { EXPORT_NOTES, type ExportFormat, type ExportJob } from '@lumen/ir-schema';
import { requireProject, listPages } from './project.service.js';
import { apiQueue } from './task.service.js';

export interface ExportRow {
  exportId: string;
  tenantId: string;
  projectId: string;
  format: string;
  status: string;
  progress: number;
  artifactKey: string;
  pageCount: number;
  error: string;
  createdAt: number;
  finishedAt: number | null;
}

function toJob(r: ExportRow): ExportJob {
  return {
    exportId: r.exportId,
    tenantId: r.tenantId,
    projectId: r.projectId,
    format: r.format as ExportFormat,
    status: r.status as ExportJob['status'],
    progress: r.progress,
    artifactKey: r.artifactKey,
    artifactUrl: toArtifactUrl(r.artifactKey),
    pageCount: r.pageCount,
    error: r.error,
    createdAt: r.createdAt,
    finishedAt: r.finishedAt,
  };
}

/**
 * 把存储 key 转成可下载地址。
 * worker 可能写入的是 key，也可能写入的已经是 URL，两种都要兼容，否则前端下载链接会失效。
 */
export function toArtifactUrl(key: string): string {
  if (!key) return '';
  if (/^https?:\/\//i.test(key) || key.startsWith('/')) return key;
  try {
    return createStorage().url(key);
  } catch {
    return key;
  }
}

/** 各格式对应的导出任务类型 */
const TASK_KIND: Record<ExportFormat, 'export_pdf' | 'export_pptx' | 'export_html' | 'video_render'> = {
  pdf: 'export_pdf',
  pptx: 'export_pptx',
  'pptx-editable': 'export_pptx',
  html: 'export_html',
  mp4: 'video_render',
};

export function exportNote(format: ExportFormat): string {
  return EXPORT_NOTES[format];
}

/**
 * 发起导出。导出前校验全部页就绪（PRD §5.8 验收）。
 * 未就绪时明确报错，不静默导出半成品。
 */
export function createExport(projectId: string, tenantId: string, format: ExportFormat): ExportJob {
  const project = requireProject(projectId, tenantId);
  const pages = listPages(projectId);
  if (pages.length === 0) throw conflict('项目还没有任何页面，无法导出');

  const pending = pages.filter((p) => p.status !== 'ready');
  if (pending.length > 0) {
    throw conflict(`还有 ${pending.length} 页未生成完成，请等待全部页就绪后再导出`);
  }

  const exportId = newId('exp');
  insertRow('export_jobs', {
    exportId,
    tenantId,
    projectId,
    format,
    status: 'queued',
    progress: 0,
    artifactKey: '',
    pageCount: pages.length,
    error: '',
    createdAt: Date.now(),
    finishedAt: null,
  });

  apiQueue().enqueue({
    tenantId,
    projectId,
    kind: TASK_KIND[format],
    idemKey: `export:${exportId}`,
    payload: { exportId, format, title: project.title },
    maxAttempts: 2,
  });

  return toJob(get<ExportRow>('SELECT * FROM export_jobs WHERE exportId = ?', exportId)!);
}

export function requireExport(exportId: string, tenantId: string): ExportRow {
  const row = get<ExportRow>('SELECT * FROM export_jobs WHERE exportId = ?', exportId);
  if (!row) throw notFound('导出任务不存在');
  if (row.tenantId !== tenantId) throw notFound('导出任务不存在');
  return row;
}

export function getExportJob(exportId: string, tenantId: string): ExportJob {
  return toJob(requireExport(exportId, tenantId));
}

export function listExports(projectId: string, tenantId: string): ExportJob[] {
  requireProject(projectId, tenantId);
  return all<ExportRow>(
    'SELECT * FROM export_jobs WHERE projectId = ? ORDER BY createdAt DESC LIMIT 50',
    projectId,
  ).map(toJob);
}

/** worker 回写进度与产物 */
export function updateExport(
  exportId: string,
  patch: Partial<Pick<ExportRow, 'status' | 'progress' | 'artifactKey' | 'pageCount' | 'error'>> & { finished?: boolean },
): void {
  const { finished, ...rest } = patch;
  updateRow('export_jobs', 'exportId', exportId, {
    ...rest,
    ...(finished ? { finishedAt: Date.now() } : {}),
  });
}

export function exportById(exportId: string): ExportRow | undefined {
  return get<ExportRow>('SELECT * FROM export_jobs WHERE exportId = ?', exportId);
}
