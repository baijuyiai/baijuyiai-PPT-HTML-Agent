import type { TaskKind } from '@lumen/ir-schema';
import type { TaskRecord } from '@lumen/task-client';
import type { WorkerContext } from '../context.js';
import { imageGenerate } from './image-generate.js';
import { scriptGenerate } from './script-generate.js';
import { ttsHandler } from './tts.js';
import { exportHtml } from './export-html.js';
import { exportPdf } from './export-pdf.js';
import { exportPptx } from './export-pptx.js';

/**
 * 统一的任务处理签名。
 * 正常返回可带一个降级原因（写进任务库）；抛错表示本次执行失败，由队列决定重试或进 DLQ。
 */
export type TaskHandler = (task: TaskRecord, ctx: WorkerContext) => Promise<{ degradeReason?: string }>;

/** 占位 handler：明确抛错，避免未实现的类型被静默当成成功 */
function notImplemented(kind: TaskKind): TaskHandler {
  return async () => {
    throw new Error(`未实现的任务类型：${kind}`);
  };
}

/** 全部任务类型的处理表，键必须覆盖 TaskKind 的每一个取值 */
export const HANDLERS: Record<TaskKind, TaskHandler> = {
  page_generate: notImplemented('page_generate'),
  image_generate: imageGenerate,
  script_generate: scriptGenerate,
  tts: ttsHandler,
  export_pdf: exportPdf,
  export_pptx: exportPptx,
  export_html: exportHtml,
  video_render: notImplemented('video_render'),
  avatar_render: notImplemented('avatar_render'),
};
