import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ObsoleteSubjectError, env, logger } from '@lumen/server-core';
import type { TaskRecord } from '@lumen/task-client';
import { createWorkerContext, setActiveTask, type WorkerContext } from './context.js';
import { HANDLERS, type TaskHandler } from './handlers/index.js';

/**
 * worker 轮询主循环。
 *
 * 设计要点：
 * - 单任务异常绝不外溢：handler 抛错只影响该任务，进程继续跑。
 * - 每个任务起心跳定时器续租；续租失败说明租约已被别人拿走，不再写终态。
 * - 收到 SIGINT / SIGTERM 后停止领取新任务，等在途任务跑完再退出。
 */

/** 空闲退避：没有任务时等待的毫秒数 */
const IDLE_DELAY_MS = 800;

export interface RunWorkerOptions {
  /** worker 标识，默认 `worker-<pid>` */
  owner?: string;
  /** 空闲退避毫秒数 */
  idleDelayMs?: number;
  /** 跑完这么多轮循环就退出，仅用于测试；不传则一直运行 */
  maxIterations?: number;
  /** 处理表，默认用 HANDLERS；测试可注入替身 */
  handlers?: Record<string, TaskHandler>;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, ms);
  });
}

/**
 * 处理单个任务：起心跳、调 handler、写回终态。
 * 任何异常都在这里被吞掉并落成任务失败，绝不冒泡到主循环。
 */
export async function processTask(
  task: TaskRecord,
  ctx: WorkerContext,
  handlers: Record<string, TaskHandler>,
  leaseMs: number,
): Promise<void> {
  const startedAt = Date.now();
  const handler = handlers[task.kind];
  if (!handler) {
    ctx.queue.fail(task.taskId, `未实现的任务类型：${task.kind}`);
    logger.error('任务类型没有对应 handler', { taskId: task.taskId, kind: task.kind });
    return;
  }

  // 心跳：租约 1/3 周期续租一次；返回 false 说明租约已丢，停止续租
  let leaseLost = false;
  const heartbeatTimer = setInterval(() => {
    if (leaseLost) return;
    if (!ctx.queue.heartbeat(task.taskId)) {
      leaseLost = true;
      logger.warn('任务租约已丢失，停止续租', { taskId: task.taskId, kind: task.kind });
    }
  }, Math.max(1, Math.floor(leaseMs / 3)));
  // 不让心跳定时器拖住进程退出
  if (typeof heartbeatTimer.unref === 'function') heartbeatTimer.unref();

  setActiveTask(task);
  try {
    const result = await handler(task, ctx);
    if (leaseLost) {
      // 租约已易主，别人可能正在跑同一条任务，这里不再写终态
      logger.warn('任务完成时租约已丢失，跳过终态写入', { taskId: task.taskId, kind: task.kind });
      return;
    }
    ctx.queue.complete(task.taskId, result.degradeReason);
    logger.info('任务完成', {
      taskId: task.taskId,
      kind: task.kind,
      ms: Date.now() - startedAt,
      degradeReason: result.degradeReason ?? '',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (leaseLost) {
      // 租约已易主，终态由新的持有者写
    } else if (err instanceof ObsoleteSubjectError) {
      // 目标（页面/项目）已被删除，任务作废而不是失败。
      // 若按失败处理会耗尽重试进入死信，把真正需要人介入的失败淹没掉。
      ctx.queue.complete(task.taskId, `任务已作废：${message}`);
      logger.info('任务作废（目标已删除）', { taskId: task.taskId, kind: task.kind, reason: message });
    } else {
      ctx.queue.fail(task.taskId, message);
      logger.error('任务失败', {
        taskId: task.taskId,
        kind: task.kind,
        ms: Date.now() - startedAt,
        error: message,
      });
    }
  } finally {
    clearInterval(heartbeatTimer);
    setActiveTask(null);
  }
}

/** 轮询主循环：启动先回收僵尸任务，然后 claim → 执行 → 退避 */
export async function runWorker(options: RunWorkerOptions = {}): Promise<void> {
  const ctx = createWorkerContext(options.owner ?? `worker-${process.pid}`);
  const handlers = options.handlers ?? HANDLERS;
  const idleDelayMs = options.idleDelayMs ?? IDLE_DELAY_MS;
  const leaseMs = env.LUMEN_QUEUE_LEASE_MS;

  const recovered = ctx.queue.recoverStale();
  logger.info('worker 启动，已回收过期租约任务', { owner: ctx.owner, recovered });

  let stopping = false;
  const onSignal = (signal: NodeJS.Signals): void => {
    if (stopping) return;
    stopping = true;
    logger.info('收到退出信号：停止领取新任务，等待在途任务结束', { signal });
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    let iterations = 0;
    while (!stopping) {
      const tasks = ctx.queue.claim(1);
      for (const task of tasks) {
        await processTask(task, ctx, handlers, leaseMs);
      }
      // 有任务时立即继续；空闲时退避，避免忙等
      if (tasks.length === 0) await delay(idleDelayMs);
      iterations += 1;
      if (options.maxIterations !== undefined && iterations >= options.maxIterations) break;
    }
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
  }

  logger.info('worker 退出', { owner: ctx.owner });
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;

if (isMain) {
  runWorker().catch((err: unknown) => {
    logger.error('worker 异常退出', { error: err instanceof Error ? err.message : String(err) });
    process.exitCode = 1;
  });
}
