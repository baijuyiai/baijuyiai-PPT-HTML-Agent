import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { QueueStats, TaskKind, TaskKindStats, TaskStatus } from '@lumen/ir-schema';
import type {
  DlqFilters,
  EnqueueInput,
  EnqueueResult,
  GroupFilters,
  ListFilters,
  ListResult,
  QueueOptions,
  TaskQueue,
  TaskRecord,
} from './types.js';

/** SQLite 可接受的绑定值：布尔转 0/1，undefined 转 null，对象转 JSON 字符串 */
export type SqlValue = null | number | bigint | string | Uint8Array;

/**
 * 把任意 JS 值转换为 node:sqlite 可绑定的值。
 * node:sqlite 不接受布尔、undefined 与对象，必须在这里归一。
 */
export function toSqlValue(v: unknown): SqlValue {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'string') return v;
  if (v instanceof Uint8Array) return v;
  return JSON.stringify(v);
}

/** tasks 表的一行（列名与 001_init.sql 完全对齐） */
interface TaskRow {
  taskId: string;
  tenantId: string;
  projectId: string | null;
  pageId: string | null;
  kind: string;
  idemKey: string;
  groupKey: string;
  payload: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  leaseOwner: string | null;
  leaseUntil: number | null;
  heartbeatAt: number | null;
  priority: number;
  error: string;
  degradeReason: string;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

/** task_dlq 表的一行 */
interface DlqRow {
  taskId: string;
  tenantId: string;
  projectId: string | null;
  kind: string;
  payload: string;
  error: string;
  attempts: number;
  createdAt: number;
  movedAt: number;
}

/** 解析 payload JSON 文本，失败或非对象时回退为 {} */
function parsePayload(text: string): Record<string, unknown> {
  if (!text) return {};
  try {
    const v: unknown = JSON.parse(text);
    return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** tasks 行映射为 TaskRecord */
function rowToTask(row: TaskRow): TaskRecord {
  return {
    taskId: row.taskId,
    tenantId: row.tenantId,
    projectId: row.projectId,
    pageId: row.pageId,
    kind: row.kind as TaskKind,
    idemKey: row.idemKey,
    groupKey: row.groupKey,
    payload: parsePayload(row.payload),
    status: row.status as TaskStatus,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    leaseOwner: row.leaseOwner,
    leaseUntil: row.leaseUntil,
    heartbeatAt: row.heartbeatAt,
    priority: row.priority,
    error: row.error,
    degradeReason: row.degradeReason,
    createdAt: row.createdAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
  };
}

/** task_dlq 行映射为 TaskRecord 形状，缺失字段用合理默认补齐 */
function dlqRowToTask(row: DlqRow): TaskRecord {
  const projectId = row.projectId;
  return {
    taskId: row.taskId,
    tenantId: row.tenantId,
    projectId,
    pageId: null,
    kind: row.kind as TaskKind,
    idemKey: '',
    groupKey: `${row.tenantId}/${projectId ?? '-'}`,
    payload: parsePayload(row.payload),
    status: 'dead',
    attempts: row.attempts,
    maxAttempts: Math.max(1, row.attempts),
    leaseOwner: null,
    leaseUntil: null,
    heartbeatAt: null,
    priority: 0,
    error: row.error,
    degradeReason: '',
    createdAt: row.createdAt,
    startedAt: null,
    finishedAt: row.movedAt,
  };
}

/** 用 BEGIN IMMEDIATE 包住一段写操作，异常时回滚 */
function inTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // 回滚失败（例如事务已被自动结束）时忽略，抛出原始错误
    }
    throw err;
  }
}

/** 统计单行单列计数 */
function count(db: DatabaseSync, sql: string, ...params: SqlValue[]): number {
  const row = db.prepare(sql).get(...params) as { c?: number | bigint } | undefined;
  return row?.c === undefined ? 0 : Number(row.c);
}

/**
 * `pauseGroup` / `resumeGroup` / `stopGroup` 共用的 WHERE 条件。
 *
 * `statusSql` 是原样拼进去的 SQL 片段（不是参数）——三处只有这几段字面量不同，
 * 抽出来是为了它们的 group/kind 过滤不会各写各的、漏掉一处。
 */
function groupClause(
  f: GroupFilters,
  statusSql: string,
): { sql: string; params: SqlValue[] } {
  const parts = ['groupKey = ?'];
  const params: SqlValue[] = [toSqlValue(f.groupKey)];
  if (f.kind !== undefined) {
    parts.push('kind = ?');
    params.push(toSqlValue(f.kind));
  }
  parts.push(statusSql);
  return { sql: parts.join(' AND '), params };
}

/**
 * 创建一个任务队列门面。
 * 传入的 db 由调用方负责生命周期（api 与 worker 各自持有自己的连接）。
 */
export function createQueue(db: DatabaseSync, opts: QueueOptions): TaskQueue {
  const owner = opts.owner;
  const leaseMs = opts.leaseMs ?? 60_000;
  const maxConcurrency = opts.maxConcurrency ?? 6;
  const groupConcurrency = opts.groupConcurrency ?? 2;
  const now = opts.now ?? Date.now;

  const getRow = (taskId: string): TaskRow | undefined =>
    db.prepare('SELECT * FROM tasks WHERE taskId = ?').get(toSqlValue(taskId)) as unknown as TaskRow | undefined;

  /** 单个 kind 的统计 */
  function kindStats(kind: string): TaskKindStats {
    const rows = db
      .prepare('SELECT status, degradeReason, startedAt, finishedAt FROM tasks WHERE kind = ?')
      .all(toSqlValue(kind)) as unknown as Array<{
      status: string;
      degradeReason: string;
      startedAt: number | null;
      finishedAt: number | null;
    }>;

    let total = 0;
    let succeeded = 0;
    let failed = 0;
    let dead = 0;
    let degraded = 0;
    const durations: number[] = [];

    for (const r of rows) {
      total += 1;
      if (r.status === 'succeeded') succeeded += 1;
      else if (r.status === 'failed') failed += 1;
      else if (r.status === 'dead') dead += 1;
      if (r.degradeReason) degraded += 1;
      // 已完成任务：有 startedAt 与 finishedAt
      if (r.startedAt !== null && r.finishedAt !== null) durations.push(r.finishedAt - r.startedAt);
    }

    durations.sort((a, b) => a - b);
    const p95Ms =
      durations.length > 0 ? (durations[Math.ceil(0.95 * durations.length) - 1] ?? 0) : 0;
    const successRate = total > 0 ? succeeded / total : 0;

    return { kind: kind as TaskKind, total, succeeded, failed, dead, successRate, p95Ms, degraded };
  }

  return {
    enqueue(input: EnqueueInput): EnqueueResult {
      const ts = now();
      const groupKey = input.groupKey ?? `${input.tenantId}/${input.projectId ?? '-'}`;
      const taskId = randomUUID();
      const payload = input.payload ?? {};
      const maxAttempts = input.maxAttempts ?? 3;
      const priority = input.priority ?? 0;

      // ON CONFLICT DO NOTHING：竞态下不会抛唯一约束错，靠回查取既有任务
      const res = db
        .prepare(
          `INSERT INTO tasks (
             taskId, tenantId, projectId, pageId, kind, idemKey, groupKey, payload,
             status, attempts, maxAttempts, leaseOwner, leaseUntil, heartbeatAt,
             priority, error, degradeReason, createdAt, startedAt, finishedAt
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, NULL, NULL, NULL, ?, '', '', ?, NULL, NULL)
           ON CONFLICT(idemKey) DO NOTHING`,
        )
        .run(
          toSqlValue(taskId),
          toSqlValue(input.tenantId),
          toSqlValue(input.projectId ?? null),
          toSqlValue(input.pageId ?? null),
          toSqlValue(input.kind),
          toSqlValue(input.idemKey),
          toSqlValue(groupKey),
          toSqlValue(JSON.stringify(payload)),
          toSqlValue(maxAttempts),
          toSqlValue(priority),
          toSqlValue(ts),
        );

      const created = Number(res.changes) > 0;
      const row = db
        .prepare('SELECT * FROM tasks WHERE idemKey = ?')
        .get(toSqlValue(input.idemKey)) as unknown as TaskRow | undefined;
      if (!row) throw new Error(`enqueue 后回查失败：idemKey=${input.idemKey}`);
      return { task: rowToTask(row), created };
    },

    claim(limit: number): TaskRecord[] {
      if (limit <= 0) return [];
      return inTransaction(db, () => {
        const ts = now();

        // 活跃 running：租约仍有效（含 leaseUntil 为 NULL 的异常态，保守计入）
        const activeRunning = count(
          db,
          "SELECT COUNT(*) AS c FROM tasks WHERE status = 'running' AND (leaseUntil IS NULL OR leaseUntil > ?)",
          toSqlValue(ts),
        );
        const globalSlots = maxConcurrency - activeRunning;
        if (globalSlots <= 0) return [];

        // 每个 group 的活跃 running 数
        const groupRows = db
          .prepare(
            "SELECT groupKey, COUNT(*) AS c FROM tasks WHERE status = 'running' AND (leaseUntil IS NULL OR leaseUntil > ?) GROUP BY groupKey",
          )
          .all(toSqlValue(ts)) as unknown as Array<{ groupKey: string; c: number | bigint }>;
        const groupUsed = new Map<string, number>();
        for (const g of groupRows) groupUsed.set(g.groupKey, Number(g.c));

        // 候选：queued 且无有效租约，或 running 但租约已过期（僵尸可回收）
        const candidates = db
          .prepare(
            `SELECT * FROM tasks
             WHERE (status = 'queued' AND (leaseUntil IS NULL OR leaseUntil <= ?))
                OR (status = 'running' AND leaseUntil <= ?)
             ORDER BY priority DESC, createdAt ASC, taskId ASC`,
          )
          .all(toSqlValue(ts), toSqlValue(ts)) as unknown as TaskRow[];

        const claimStmt = db.prepare(
          `UPDATE tasks
           SET status = 'running', leaseOwner = ?, leaseUntil = ?, heartbeatAt = ?,
               startedAt = COALESCE(startedAt, ?), attempts = attempts + 1
           WHERE taskId = ? AND (status = 'queued' OR status = 'running')`,
        );

        const claimed: TaskRow[] = [];
        for (const row of candidates) {
          if (claimed.length >= limit) break;
          if (claimed.length >= globalSlots) break;
          const used = groupUsed.get(row.groupKey) ?? 0;
          if (used >= groupConcurrency) continue;

          const leaseUntil = ts + leaseMs;
          claimStmt.run(
            toSqlValue(owner),
            toSqlValue(leaseUntil),
            toSqlValue(ts),
            toSqlValue(ts),
            toSqlValue(row.taskId),
          );

          groupUsed.set(row.groupKey, used + 1);
          claimed.push({
            ...row,
            status: 'running',
            leaseOwner: owner,
            leaseUntil,
            heartbeatAt: ts,
            startedAt: row.startedAt ?? ts,
            attempts: row.attempts + 1,
          });
        }

        return claimed.map(rowToTask);
      });
    },

    heartbeat(taskId: string): boolean {
      const ts = now();
      const res = db
        .prepare(
          "UPDATE tasks SET leaseUntil = ?, heartbeatAt = ? WHERE taskId = ? AND leaseOwner = ? AND status = 'running'",
        )
        .run(toSqlValue(ts + leaseMs), toSqlValue(ts), toSqlValue(taskId), toSqlValue(owner));
      return Number(res.changes) > 0;
    },

    complete(taskId: string, degradeReason?: string): void {
      const ts = now();
      db.prepare(
        `UPDATE tasks
         SET status = 'succeeded', finishedAt = ?, leaseOwner = NULL, leaseUntil = NULL,
             heartbeatAt = NULL, degradeReason = ?
         WHERE taskId = ?`,
      ).run(toSqlValue(ts), toSqlValue(degradeReason ?? ''), toSqlValue(taskId));
    },

    fail(taskId: string, error: string, degradeReason?: string): void {
      const ts = now();
      inTransaction(db, () => {
        const row = getRow(taskId);
        if (!row) return;

        if (row.attempts < row.maxAttempts) {
          // 还有重试额度：回到 queued，清空租约，保留 error 供下次排查
          db.prepare(
            `UPDATE tasks
             SET status = 'queued', leaseOwner = NULL, leaseUntil = NULL, heartbeatAt = NULL,
                 error = ?, degradeReason = ?
             WHERE taskId = ?`,
          ).run(toSqlValue(error), toSqlValue(degradeReason ?? ''), toSqlValue(taskId));
          return;
        }

        // 额度耗尽：同一事务内移入 DLQ 并置 dead
        db.prepare(
          `INSERT OR REPLACE INTO task_dlq (taskId, tenantId, projectId, kind, payload, error, attempts, createdAt, movedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          toSqlValue(row.taskId),
          toSqlValue(row.tenantId),
          toSqlValue(row.projectId),
          toSqlValue(row.kind),
          toSqlValue(row.payload),
          toSqlValue(error),
          toSqlValue(row.attempts),
          toSqlValue(row.createdAt),
          toSqlValue(ts),
        );

        db.prepare(
          `UPDATE tasks
           SET status = 'dead', finishedAt = ?, leaseOwner = NULL, leaseUntil = NULL,
               heartbeatAt = NULL, error = ?, degradeReason = ?
           WHERE taskId = ?`,
        ).run(toSqlValue(ts), toSqlValue(error), toSqlValue(degradeReason ?? ''), toSqlValue(taskId));
      });
    },

    recoverStale(): number {
      const ts = now();
      const res = db
        .prepare(
          `UPDATE tasks
           SET status = 'queued', leaseOwner = NULL, leaseUntil = NULL, heartbeatAt = NULL
           WHERE status = 'running' AND leaseUntil IS NOT NULL AND leaseUntil <= ?`,
        )
        .run(toSqlValue(ts));
      return Number(res.changes);
    },

    stats(): QueueStats {
      const queued = count(db, "SELECT COUNT(*) AS c FROM tasks WHERE status = 'queued'");
      const running = count(db, "SELECT COUNT(*) AS c FROM tasks WHERE status = 'running'");
      const dead = count(db, "SELECT COUNT(*) AS c FROM tasks WHERE status = 'dead'");

      const kindRows = db
        .prepare('SELECT DISTINCT kind FROM tasks ORDER BY kind')
        .all() as unknown as Array<{ kind: string }>;
      const byKind = kindRows.map((k) => kindStats(k.kind));

      return { queued, running, dead, byKind };
    },

    list(filters: ListFilters): ListResult {
      const where: string[] = [];
      const params: SqlValue[] = [];
      if (filters.tenantId !== undefined) {
        where.push('tenantId = ?');
        params.push(toSqlValue(filters.tenantId));
      }
      if (filters.projectId !== undefined) {
        where.push('projectId = ?');
        params.push(toSqlValue(filters.projectId));
      }
      if (filters.kind !== undefined) {
        where.push('kind = ?');
        params.push(toSqlValue(filters.kind));
      }
      if (filters.status !== undefined) {
        where.push('status = ?');
        params.push(toSqlValue(filters.status));
      }
      const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

      const total = count(db, `SELECT COUNT(*) AS c FROM tasks ${whereSql}`, ...params);

      const limit = filters.limit ?? 50;
      const offset = filters.offset ?? 0;
      const rows = db
        .prepare(
          `SELECT * FROM tasks ${whereSql} ORDER BY createdAt DESC, taskId ASC LIMIT ? OFFSET ?`,
        )
        .all(...params, toSqlValue(limit), toSqlValue(offset)) as unknown as TaskRow[];

      return { items: rows.map(rowToTask), total };
    },

    get(taskId: string): TaskRecord | undefined {
      const row = getRow(taskId);
      return row ? rowToTask(row) : undefined;
    },

    retry(taskId: string): boolean {
      return inTransaction(db, () => {
        const row = getRow(taskId);
        if (!row) return false;
        if (row.status !== 'dead' && row.status !== 'failed') return false;

        db.prepare(
          `UPDATE tasks
           SET status = 'queued', attempts = 0, error = '', degradeReason = '',
               leaseOwner = NULL, leaseUntil = NULL, heartbeatAt = NULL, finishedAt = NULL
           WHERE taskId = ?`,
        ).run(toSqlValue(taskId));

        // 重新入队的任务不应再留在 DLQ
        db.prepare('DELETE FROM task_dlq WHERE taskId = ?').run(toSqlValue(taskId));
        return true;
      });
    },

    /**
     * 挂起排着队的任务。**已经在跑的不动**——中断它们既拿不回已经花掉的合成时间，
     * 也没法保证 worker 不会把半截结果写进库；让它们跑完更干净。
     */
    pauseGroup(filters: GroupFilters): number {
      const { sql, params } = groupClause(filters, "status = 'queued'");
      const res = db.prepare(`UPDATE tasks SET status = 'paused' WHERE ${sql}`).run(...params);
      return Number(res.changes);
    },

    /** 把挂起的放回队列，接着跑 */
    resumeGroup(filters: GroupFilters): number {
      const { sql, params } = groupClause(filters, "status = 'paused'");
      const res = db.prepare(`UPDATE tasks SET status = 'queued' WHERE ${sql}`).run(...params);
      return Number(res.changes);
    },

    /**
     * 停掉这一批：排队中与已挂起的都删掉。
     * 留着只会让下次 `list` 把它们当成「还没跑完」，进度条一直停在那儿。
     */
    stopGroup(filters: GroupFilters): number {
      const { sql, params } = groupClause(filters, "status IN ('queued', 'paused')");
      const res = db.prepare(`DELETE FROM tasks WHERE ${sql}`).run(...params);
      return Number(res.changes);
    },

    dlqList(filters: DlqFilters): ListResult {
      const where: string[] = [];
      const params: SqlValue[] = [];
      if (filters.tenantId !== undefined) {
        where.push('tenantId = ?');
        params.push(toSqlValue(filters.tenantId));
      }
      const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

      const total = count(db, `SELECT COUNT(*) AS c FROM task_dlq ${whereSql}`, ...params);

      const limit = filters.limit ?? 50;
      const offset = filters.offset ?? 0;
      const rows = db
        .prepare(
          `SELECT * FROM task_dlq ${whereSql} ORDER BY movedAt DESC, taskId ASC LIMIT ? OFFSET ?`,
        )
        .all(...params, toSqlValue(limit), toSqlValue(offset)) as unknown as DlqRow[];

      return { items: rows.map(dlqRowToTask), total };
    },
  };
}
