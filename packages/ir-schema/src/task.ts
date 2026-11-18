import { z } from 'zod';

/** 任务粒度：项目 → 页 → 子任务（PRD §5.6） */
export const TaskKind = z.enum([
  'page_generate',   // 页级内容 + 版式 + 代码生成
  'image_generate',  // 图片生成（GPT Image 2）
  'script_generate', // 逐页讲稿
  'tts',             // 语音合成
  'export_pdf',
  'export_pptx',
  'export_html',
  'video_render',    // Remotion 分段渲染
  'avatar_render',   // 数字人口型合成
]);
export type TaskKind = z.infer<typeof TaskKind>;

/** 任务种类的中文名，任务库与后台共用 */
export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  page_generate: '页级生成',
  image_generate: '图片生成',
  script_generate: '讲稿生成',
  tts: '语音合成',
  export_pdf: '导出 PDF',
  export_pptx: '导出 PPTX',
  export_html: '导出 HTML',
  video_render: '视频渲染',
  avatar_render: '数字人合成',
};

/** 库里存的任务种类未必都在枚举内（历史数据、手工插入），取不到就原样显示 */
export function taskKindLabel(kind: string): string {
  return (TASK_KIND_LABEL as Record<string, string>)[kind] ?? kind;
}


/**
 * 任务状态。
 *
 * `paused` 只出现在「批量任务被用户暂停」时：它是 queued 的子集，`claim()` 不会领，
 * 「继续」再把它们放回 queued。**不做成 queued + 一个标志位**，是因为那样每次
 * claim、列表、统计都得额外判一次，漏一处就是「暂停了还在跑」。
 */
export const TaskStatus = z.enum(['queued', 'running', 'succeeded', 'failed', 'dead', 'paused']);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const Task = z.object({
  taskId: z.string(),
  tenantId: z.string(),
  projectId: z.string().nullable().default(null),
  pageId: z.string().nullable().default(null),
  kind: TaskKind,
  /** 幂等键。同键重复入队返回既有任务。 */
  idemKey: z.string(),
  /** 按组限流键，形如 `{tenantId}/{projectId}`，慢租户不阻塞他人 */
  groupKey: z.string(),
  payload: z.record(z.unknown()).default(() => ({})),
  status: TaskStatus.default('queued'),
  attempts: z.number().int().min(0).default(0),
  maxAttempts: z.number().int().min(1).default(3),
  leaseOwner: z.string().nullable().default(null),
  leaseUntil: z.number().int().nullable().default(null),
  heartbeatAt: z.number().int().nullable().default(null),
  priority: z.number().int().default(0),
  error: z.string().default(''),
  /** 降级原因，任务库可见（PRD §5.11） */
  degradeReason: z.string().default(''),
  createdAt: z.number().int(),
  startedAt: z.number().int().nullable().default(null),
  finishedAt: z.number().int().nullable().default(null),
});
export type Task = z.infer<typeof Task>;

/** 任务库的类型统计（成功率与 P95） */
export const TaskKindStats = z.object({
  kind: TaskKind,
  total: z.number().int().default(0),
  succeeded: z.number().int().default(0),
  failed: z.number().int().default(0),
  dead: z.number().int().default(0),
  successRate: z.number().default(0),
  p95Ms: z.number().int().default(0),
  degraded: z.number().int().default(0),
});
export type TaskKindStats = z.infer<typeof TaskKindStats>;

/** 队列运行态 */
export const QueueStats = z.object({
  queued: z.number().int().default(0),
  running: z.number().int().default(0),
  dead: z.number().int().default(0),
  byKind: z.array(TaskKindStats).default(() => []),
});
export type QueueStats = z.infer<typeof QueueStats>;
