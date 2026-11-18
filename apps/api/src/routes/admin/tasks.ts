import { Router } from 'express';
import { z } from 'zod';
import { ok } from '@lumen/server-core';
import { requireAdmin } from '@lumen/server-core';
import { parseParams, parseQuery } from '@lumen/server-core';
import { notFound } from '@lumen/server-core';
import { apiQueue } from '@lumen/server-core';
import { TaskKind, TaskStatus } from '@lumen/ir-schema';

/**
 * 管理后台的任务监控。
 *
 * 与 /api/tasks 的差别是**不按租户过滤**——运维视角要能看到所有租户的队列，
 * 否则「某个租户的任务堆积」这类问题在后台完全看不见。写操作仍然只有重试一种，
 * 且不改动任务内容，只重置状态。
 */
export const adminTasksRouter = Router();
adminTasksRouter.use(requireAdmin);

const TaskKindEnum = z.enum([
  'page_generate', 'image_generate', 'script_generate', 'tts',
  'export_pdf', 'export_pptx', 'export_html', 'video_render', 'avatar_render',
]);
const TaskStatusEnum = z.enum(['queued', 'running', 'succeeded', 'failed', 'dead']);

adminTasksRouter.get('/', (req, res) => {
  const q = parseQuery(z.object({
    tenantId: z.string().optional(),
    projectId: z.string().optional(),
    kind: TaskKindEnum.optional(),
    status: TaskStatusEnum.optional(),
    limit: z.coerce.number().int().optional(),
    offset: z.coerce.number().int().optional(),
  }), req);
  ok(res, apiQueue().list({
    ...(q.tenantId ? { tenantId: q.tenantId } : {}),
    ...(q.projectId ? { projectId: q.projectId } : {}),
    ...(q.kind ? { kind: q.kind as TaskKind } : {}),
    ...(q.status ? { status: q.status as TaskStatus } : {}),
    ...(q.limit ? { limit: q.limit } : {}),
    ...(q.offset ? { offset: q.offset } : {}),
  }));
});

adminTasksRouter.get('/stats', (_req, res) => {
  ok(res, apiQueue().stats());
});

adminTasksRouter.get('/dlq', (req, res) => {
  const q = parseQuery(z.object({
    tenantId: z.string().optional(),
    limit: z.coerce.number().int().optional(),
    offset: z.coerce.number().int().optional(),
  }), req);
  ok(res, apiQueue().dlqList(q));
});

adminTasksRouter.get('/:taskId', (req, res) => {
  const { taskId } = parseParams(z.object({ taskId: z.string() }), req);
  const task = apiQueue().get(taskId);
  if (!task) throw notFound('任务不存在');
  ok(res, task);
});

adminTasksRouter.post('/:taskId/retry', (req, res) => {
  const { taskId } = parseParams(z.object({ taskId: z.string() }), req);
  const task = apiQueue().get(taskId);
  if (!task) throw notFound('任务不存在');
  ok(res, { retried: apiQueue().retry(taskId) });
});
