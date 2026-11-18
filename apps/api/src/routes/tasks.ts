import { Router } from 'express';
import { z } from 'zod';
import { ok, requirePasswordChanged } from '@lumen/server-core';
import { requireAuth } from '@lumen/server-core';
import { requireTenant, tenantOf } from '@lumen/server-core';
import { parseParams, parseQuery } from '@lumen/server-core';
import { notFound } from '@lumen/server-core';
import { apiQueue } from '@lumen/server-core';
import { TaskKind, TaskStatus } from '@lumen/ir-schema';

export const tasksRouter = Router();
tasksRouter.use(requireAuth, requirePasswordChanged, requireTenant);

const TaskKindEnum = z.enum([
  'page_generate', 'image_generate', 'script_generate', 'tts',
  'export_pdf', 'export_pptx', 'export_html', 'video_render', 'avatar_render',
]);
const TaskStatusEnum = z.enum(['queued', 'running', 'succeeded', 'failed', 'dead']);

tasksRouter.get('/', (req, res) => {
  const q = parseQuery(z.object({
    projectId: z.string().optional(),
    kind: TaskKindEnum.optional(),
    status: TaskStatusEnum.optional(),
    limit: z.coerce.number().int().optional(),
    offset: z.coerce.number().int().optional(),
  }), req);
  const result = apiQueue().list({
    tenantId: tenantOf(req),
    ...(q.projectId ? { projectId: q.projectId } : {}),
    ...(q.kind ? { kind: q.kind as TaskKind } : {}),
    ...(q.status ? { status: q.status as TaskStatus } : {}),
    ...(q.limit ? { limit: q.limit } : {}),
    ...(q.offset ? { offset: q.offset } : {}),
  });
  ok(res, result);
});

/** 队列运行态：按类型看成功率与 P95（PRD §5.11 可观测） */
tasksRouter.get('/stats', (req, res) => {
  const queue = apiQueue();
  ok(res, queue.stats());
});

tasksRouter.get('/dlq', (req, res) => {
  const q = parseQuery(z.object({
    limit: z.coerce.number().int().optional(),
    offset: z.coerce.number().int().optional(),
  }), req);
  ok(res, apiQueue().dlqList({ tenantId: tenantOf(req), ...q }));
});

tasksRouter.get('/:taskId', (req, res) => {
  const { taskId } = parseParams(z.object({ taskId: z.string() }), req);
  const task = apiQueue().get(taskId);
  if (!task || task.tenantId !== tenantOf(req)) throw notFound('任务不存在');
  ok(res, task);
});

tasksRouter.post('/:taskId/retry', (req, res) => {
  const { taskId } = parseParams(z.object({ taskId: z.string() }), req);
  const task = apiQueue().get(taskId);
  if (!task || task.tenantId !== tenantOf(req)) throw notFound('任务不存在');
  const okRetry = apiQueue().retry(taskId);
  ok(res, { retried: okRetry });
});
