import { all, count, get, insertRow } from '../db/client.js';
import { newId } from '../lib/crypto.js';
import { mergeCostBuckets, type CostBucket, type UsageKind, type UsageRecord, type UsageSummary } from '@lumen/ir-schema';

export interface UsageInput {
  tenantId: string;
  userId?: string;
  projectId?: string;
  taskType: string;
  kind: UsageKind;
  providerId?: string;
  model?: string;
  amount?: number;
  inputTokens?: number;
  outputTokens?: number;
  cost?: number;
  currency?: string;
  latencyMs?: number;
  ok?: boolean;
  degradeReason?: string;
}

/**
 * 每次模型调用都落一条用量。文本按 token、图片按张数分别计量（PRD §8）。
 * 失败调用也记录，便于统计成功率与降级原因。
 */
export function recordUsage(input: UsageInput): void {
  insertRow('usage_records', {
    usageId: newId('usg'),
    tenantId: input.tenantId,
    userId: input.userId ?? '',
    projectId: input.projectId ?? '',
    taskType: input.taskType,
    kind: input.kind,
    providerId: input.providerId ?? '',
    model: input.model ?? '',
    amount: input.amount ?? 0,
    inputTokens: input.inputTokens ?? 0,
    outputTokens: input.outputTokens ?? 0,
    cost: input.cost ?? 0,
    currency: input.currency ?? 'CNY',
    latencyMs: input.latencyMs ?? 0,
    ok: input.ok === false ? 0 : 1,
    degradeReason: input.degradeReason ?? '',
    createdAt: Date.now(),
  });
}

interface UsageRow {
  usageId: string;
  tenantId: string;
  userId: string;
  projectId: string;
  taskType: string;
  kind: string;
  providerId: string;
  model: string;
  amount: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  currency: string;
  latencyMs: number;
  ok: number;
  degradeReason: string;
  createdAt: number;
}

function toRecord(r: UsageRow): UsageRecord {
  return {
    usageId: r.usageId,
    tenantId: r.tenantId,
    userId: r.userId,
    projectId: r.projectId,
    taskType: r.taskType,
    kind: r.kind as UsageKind,
    providerId: r.providerId,
    model: r.model,
    amount: r.amount,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    cost: r.cost,
    currency: r.currency,
    latencyMs: r.latencyMs,
    ok: r.ok === 1,
    degradeReason: r.degradeReason,
    createdAt: r.createdAt,
  };
}

export interface UsageQuery {
  tenantId?: string;
  userId?: string;
  projectId?: string;
  kind?: UsageKind;
  providerId?: string;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}

export function listUsage(q: UsageQuery): { items: UsageRecord[]; total: number } {
  const where: string[] = ['1 = 1'];
  const params: unknown[] = [];
  if (q.tenantId) { where.push('tenantId = ?'); params.push(q.tenantId); }
  if (q.userId) { where.push('userId = ?'); params.push(q.userId); }
  if (q.projectId) { where.push('projectId = ?'); params.push(q.projectId); }
  if (q.kind) { where.push('kind = ?'); params.push(q.kind); }
  if (q.providerId) { where.push('providerId = ?'); params.push(q.providerId); }
  if (q.from) { where.push('createdAt >= ?'); params.push(q.from); }
  if (q.to) { where.push('createdAt <= ?'); params.push(q.to); }
  const clause = where.join(' AND ');
  const limit = Math.min(Math.max(q.limit ?? 100, 1), 1000);
  const offset = Math.max(q.offset ?? 0, 0);
  const total = count(`SELECT COUNT(*) AS n FROM usage_records WHERE ${clause}`, ...params);
  const items = all<UsageRow>(
    `SELECT * FROM usage_records WHERE ${clause} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
    ...params, limit, offset,
  ).map(toRecord);
  return { items, total };
}

export type { UsageSummary };

/**
 * 按 Provider / 任务类型聚合，供 admin 用量面板使用（PRD §5.11 按 Provider 统计调用量与费用）。
 * 费用一律以 (分组键, 币种) 两列为粒度查出来，再在内存里合成每组的桶数组。
 */
export function usageSummary(q: Omit<UsageQuery, 'limit' | 'offset'>): UsageSummary {
  const where: string[] = ['1 = 1'];
  const params: unknown[] = [];
  if (q.tenantId) { where.push('tenantId = ?'); params.push(q.tenantId); }
  if (q.userId) { where.push('userId = ?'); params.push(q.userId); }
  if (q.projectId) { where.push('projectId = ?'); params.push(q.projectId); }
  if (q.from) { where.push('createdAt >= ?'); params.push(q.from); }
  if (q.to) { where.push('createdAt <= ?'); params.push(q.to); }
  const clause = where.join(' AND ');

  const totals = get<{ tokens: number; images: number; calls: number; failures: number; degraded: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN kind = 'text'  THEN inputTokens + outputTokens ELSE 0 END), 0) AS tokens,
       COALESCE(SUM(CASE WHEN kind = 'image' THEN amount ELSE 0 END), 0) AS images,
       COUNT(*) AS calls,
       COALESCE(SUM(CASE WHEN ok = 0 THEN 1 ELSE 0 END), 0) AS failures,
       COALESCE(SUM(CASE WHEN degradeReason <> '' THEN 1 ELSE 0 END), 0) AS degraded
     FROM usage_records WHERE ${clause}`,
    ...params,
  );

  const costs = mergeCostBuckets(
    all<CostBucket>(
      `SELECT currency, COALESCE(SUM(cost), 0) AS amount
       FROM usage_records WHERE ${clause} GROUP BY currency`,
      ...params,
    ),
  );

  const byProvider = groupWithCosts<{ providerId: string }>(
    'providerId', clause, params,
    `SELECT providerId, COUNT(*) AS calls,
       COALESCE(SUM(CASE WHEN kind = 'text'  THEN inputTokens + outputTokens ELSE 0 END), 0) AS tokens,
       COALESCE(SUM(CASE WHEN kind = 'image' THEN amount ELSE 0 END), 0) AS images
     FROM usage_records WHERE ${clause} GROUP BY providerId ORDER BY calls DESC`,
  );

  const byTaskType = groupWithCosts<{ taskType: string }>(
    'taskType', clause, params,
    `SELECT taskType, COUNT(*) AS calls,
       COALESCE(SUM(CASE WHEN kind = 'text'  THEN inputTokens + outputTokens ELSE 0 END), 0) AS tokens,
       COALESCE(SUM(CASE WHEN kind = 'image' THEN amount ELSE 0 END), 0) AS images
     FROM usage_records WHERE ${clause} GROUP BY taskType ORDER BY calls DESC`,
  );

  return {
    tokens: totals?.tokens ?? 0,
    images: totals?.images ?? 0,
    costs,
    calls: totals?.calls ?? 0,
    failures: totals?.failures ?? 0,
    degraded: totals?.degraded ?? 0,
    byProvider,
    byTaskType,
  };
}

/** 查一组「键 + 计数」，再按同一个键把各币种费用并上去 */
function groupWithCosts<K extends Record<string, string>>(
  key: keyof K & string,
  clause: string,
  params: unknown[],
  sql: string,
): (K & { calls: number; tokens: number; images: number; costs: CostBucket[] })[] {
  const rows = all<K & { calls: number; tokens: number; images: number }>(sql, ...params);
  const costRows = all<{ k: string; currency: string; amount: number }>(
    `SELECT ${key} AS k, currency, COALESCE(SUM(cost), 0) AS amount
     FROM usage_records WHERE ${clause} GROUP BY ${key}, currency`,
    ...params,
  );
  const byKey = new Map<string, CostBucket[]>();
  for (const c of costRows) {
    const list = byKey.get(c.k) ?? [];
    list.push({ currency: c.currency, amount: c.amount });
    byKey.set(c.k, list);
  }
  return rows.map((r) => ({ ...r, costs: mergeCostBuckets(byKey.get(r[key]) ?? []) }));
}

/** 用户侧只读用量（PRD §5.11 用户侧只读展示当前所用模型） */
export function userUsage(userId: string, tenantId: string): UsageSummary {
  return usageSummary({ userId, tenantId });
}
