import { buildGateway, createQueueFor, createStorage, recordUsage } from '@lumen/server-core';
import type { ProviderGateway, UsageSink } from '@lumen/provider-gateway';
import type { StorageAdapter } from '@lumen/storage';
import type { TaskQueue, TaskRecord } from '@lumen/task-client';

/** 网关用量回调的入参类型，与 provider-gateway 的 UsageSink 保持同源 */
type GatewayUsage = Parameters<UsageSink['record']>[0];

/** worker 运行所需的全部依赖：队列、对象存储、模型网关、worker 标识 */
export interface WorkerContext {
  queue: TaskQueue;
  storage: StorageAdapter;
  gateway: ProviderGateway;
  owner: string;
}

/**
 * 当前正在执行的任务。
 *
 * 网关的用量回调只拿得到模型维度信息（provider / model / token / 降级原因），
 * 缺 tenantId 与 projectId，因此由执行循环在处理每个任务前写入这里补齐归属字段。
 * 执行是串行的（每次 claim(1) 只领一条），所以单个变量就足够，不需要并发隔离。
 */
let activeTask: TaskRecord | null = null;

/** 由执行循环调用：标记当前任务，供用量回调补齐归属字段 */
export function setActiveTask(task: TaskRecord | null): void {
  activeTask = task;
}

/**
 * 组装 worker 上下文。
 * api 与 worker 共用 server-core 的数据访问与网关装配，这里只做装配，不重复实现业务逻辑。
 */
export function createWorkerContext(owner: string): WorkerContext {
  const gateway = buildGateway({
    onUsage: {
      record: (e: GatewayUsage) => recordUsage({
        // tenantId / projectId 不在网关回调里，从当前任务上下文补
        tenantId: activeTask?.tenantId ?? '',
        projectId: activeTask?.projectId ?? undefined,
        taskType: e.taskType,
        kind: e.kind,
        providerId: e.providerId,
        model: e.model,
        amount: e.amount,
        inputTokens: e.inputTokens,
        outputTokens: e.outputTokens,
        cost: e.cost,
        currency: e.currency,
        latencyMs: e.latencyMs,
        ok: e.ok,
        degradeReason: e.degradeReason,
      }),
    },
  });

  return {
    queue: createQueueFor(owner),
    storage: createStorage(),
    gateway,
    owner,
  };
}
