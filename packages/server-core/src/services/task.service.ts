import { getDb } from '../db/client.js';
import { env } from '../env.js';
import { createQueue, type TaskQueue } from '@lumen/task-client';

/**
 * 队列装配。api 负责入队，worker 负责领取；两者共用同一份 task-client 逻辑与同一个 SQLite 文件。
 */

export function createQueueFor(owner: string): TaskQueue {
  return createQueue(getDb(), {
    owner,
    leaseMs: env.LUMEN_QUEUE_LEASE_MS,
    maxConcurrency: env.LUMEN_MAX_CONCURRENCY,
    groupConcurrency: 3,
  });
}

let cachedApiQueue: TaskQueue | null = null;

/** API 侧的入队句柄（不用于领取任务） */
export function apiQueue(): TaskQueue {
  if (!cachedApiQueue) cachedApiQueue = createQueueFor(`api-${process.pid}`);
  return cachedApiQueue;
}

/**
 * 队列分组键。口径必须与 `createQueue` 里 enqueue 的默认值一致
 * （`${tenantId}/${projectId ?? '-'}`）——暂停/继续/停止靠它找任务，差一个字就找不到。
 */
export function groupKeyOf(tenantId: string, projectId: string | null): string {
  return `${tenantId}/${projectId ?? '-'}`;
}
