import type { DatabaseSync } from 'node:sqlite';
import type { QueueStats, TaskKind, TaskStatus } from '@lumen/ir-schema';

export interface EnqueueInput {
  tenantId: string;
  projectId?: string | null;
  pageId?: string | null;
  kind: TaskKind;
  /** 幂等键。同键重复入队返回既有任务，不新建。 */
  idemKey: string;
  /** 按组限流键，默认 `${tenantId}/${projectId ?? '-'}` */
  groupKey?: string;
  payload?: Record<string, unknown>;
  maxAttempts?: number;
  priority?: number;
}

export interface TaskRecord {
  taskId: string; tenantId: string; projectId: string | null; pageId: string | null;
  kind: TaskKind; idemKey: string; groupKey: string;
  payload: Record<string, unknown>;
  status: TaskStatus; attempts: number; maxAttempts: number;
  leaseOwner: string | null; leaseUntil: number | null; heartbeatAt: number | null;
  priority: number; error: string; degradeReason: string;
  createdAt: number; startedAt: number | null; finishedAt: number | null;
}

export interface QueueOptions {
  /** Worker 标识，用于租约归属 */
  owner: string;
  /** 租约时长，毫秒，默认 60000 */
  leaseMs?: number;
  /** 全局并发上限，默认 6 */
  maxConcurrency?: number;
  /** 同一 groupKey 允许的并发数，默认 2 */
  groupConcurrency?: number;
  /** 注入时钟，便于测试，默认 Date.now */
  now?: () => number;
}

/** enqueue 的返回：既有任务或新建任务，以及本次是否真的新建 */
export interface EnqueueResult {
  task: TaskRecord;
  created: boolean;
}

/** list 的筛选条件 */
export interface ListFilters {
  tenantId?: string;
  projectId?: string;
  kind?: TaskKind;
  status?: TaskStatus;
  limit?: number;
  offset?: number;
}

/** dlqList 的筛选条件 */
export interface DlqFilters {
  tenantId?: string;
  limit?: number;
  offset?: number;
}

/** 列表类查询的统一返回 */
export interface ListResult {
  items: TaskRecord[];
  total: number;
}

/** 批量暂停/继续/停止的范围 */
export interface GroupFilters {
  groupKey: string;
  /** 只动这一类任务。不传则动整组——同组里讲稿与配音往往同时在跑，误伤一片 */
  kind?: TaskKind;
}

/** 队列门面：api 与 worker 两个进程共用同一份逻辑 */
export interface TaskQueue {
  enqueue(input: EnqueueInput): EnqueueResult;
  claim(limit: number): TaskRecord[];
  heartbeat(taskId: string): boolean;
  complete(taskId: string, degradeReason?: string): void;
  fail(taskId: string, error: string, degradeReason?: string): void;
  recoverStale(): number;
  stats(): QueueStats;
  list(filters: ListFilters): ListResult;
  get(taskId: string): TaskRecord | undefined;
  retry(taskId: string): boolean;
  dlqList(filters: DlqFilters): ListResult;
  /** 把排着队的任务挂起（`claim` 不再领）。已经在跑的不动，跑完算跑完 */
  pauseGroup(filters: GroupFilters): number;
  /** 把挂起的放回队列，接着跑 */
  resumeGroup(filters: GroupFilters): number;
  /** 删掉排队中与已挂起的。正在跑的那几条不受影响 */
  stopGroup(filters: GroupFilters): number;
}

/** 便于外部引用数据库句柄类型 */
export type { DatabaseSync };
