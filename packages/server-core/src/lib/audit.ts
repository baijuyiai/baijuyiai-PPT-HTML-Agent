import { all, count, insertRow, parseJson } from '../db/client.js';
import { newId } from './crypto.js';
import type { AuditAction, AuditEvent } from '@lumen/ir-schema';

export interface AuditInput {
  tenantId: string;
  userId?: string;
  action: AuditAction;
  target?: string;
  meta?: Record<string, unknown>;
  ip?: string;
}

interface AuditRow {
  auditId: string;
  tenantId: string;
  userId: string;
  action: string;
  target: string;
  meta: string;
  ip: string;
  createdAt: number;
}

/** 写审计。注册、登录、创建用户、改密、禁用、导出、分享、模型配置变更等都必须留痕。 */
export function recordAudit(input: AuditInput): void {
  insertRow('audit_events', {
    auditId: newId('aud'),
    tenantId: input.tenantId,
    userId: input.userId ?? '',
    action: input.action,
    target: input.target ?? '',
    meta: JSON.stringify(input.meta ?? {}),
    ip: input.ip ?? '',
    createdAt: Date.now(),
  });
}

export interface AuditQuery {
  tenantId: string;
  userId?: string;
  action?: string;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}

export function listAudit(q: AuditQuery): { items: AuditEvent[]; total: number } {
  const where: string[] = ['tenantId = ?'];
  const params: unknown[] = [q.tenantId];
  if (q.userId) {
    where.push('userId = ?');
    params.push(q.userId);
  }
  if (q.action) {
    where.push('action = ?');
    params.push(q.action);
  }
  if (q.from) {
    where.push('createdAt >= ?');
    params.push(q.from);
  }
  if (q.to) {
    where.push('createdAt <= ?');
    params.push(q.to);
  }
  const clause = where.join(' AND ');
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 500);
  const offset = Math.max(q.offset ?? 0, 0);

  const total = count(`SELECT COUNT(*) AS n FROM audit_events WHERE ${clause}`, ...params);
  const rows = all<AuditRow>(
    `SELECT * FROM audit_events WHERE ${clause} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
    ...params, limit, offset,
  );
  return {
    items: rows.map((r) => ({
      auditId: r.auditId,
      tenantId: r.tenantId,
      userId: r.userId,
      action: r.action as AuditAction,
      target: r.target,
      meta: parseJson<Record<string, unknown>>(r.meta, {}),
      ip: r.ip,
      createdAt: r.createdAt,
    })),
    total,
  };
}
