import { Router } from 'express';
import { z } from 'zod';
import { ok } from '@lumen/server-core';
import { requireAdmin } from '@lumen/server-core';
import { clientIp, parseBody, parseParams, parseQuery } from '@lumen/server-core';
import { userIdOf } from '@lumen/server-core';
import { recordAudit } from '@lumen/server-core';
import { invalid, notFound } from '@lumen/server-core';
import { formatCostBuckets, passwordPolicyError, Role, UserStatus } from '@lumen/ir-schema';
import {
  aggregatesFor, createUser, findById, listUsers, requireById, toPublic, updateUser,
} from '@lumen/server-core';
import {
  disableUser, enableUser, forceLogout, resetPassword,
} from '@lumen/server-core';
import { listAudit } from '@lumen/server-core';
import { listUsage, usageSummary } from '@lumen/server-core';

export const adminUsersRouter = Router();
adminUsersRouter.use(requireAdmin);

const UserIdParam = z.object({ userId: z.string().min(1) });

adminUsersRouter.get('/', (req, res) => {
  const q = parseQuery(z.object({
    q: z.string().optional(),
    role: z.string().optional(),
    status: z.string().optional(),
    source: z.string().optional(),
    createdFrom: z.coerce.number().int().optional(),
    createdTo: z.coerce.number().int().optional(),
    limit: z.coerce.number().int().optional(),
    offset: z.coerce.number().int().optional(),
  }), req);
  ok(res, listUsers(q));
});

/** 导出用户与用量 CSV（仅 admin） */
adminUsersRouter.get('/export.csv', (req, res) => {
  const { items } = listUsers({ limit: 500 });
  const header = ['用户名', '邮箱', '角色', '状态', '来源', '创建时间', '最近登录', '项目数', '累计页数', '累计费用'];
  const rows = items.map((u) => [
    u.username,
    u.email,
    u.role,
    u.status,
    u.source === 'self_signup' ? '自助注册' : u.source === 'admin_created' ? '管理员创建' : '系统内置',
    new Date(u.createdAt).toISOString(),
    u.lastLoginAt ? new Date(u.lastLoginAt).toISOString() : '',
    String(u.projectCount),
    String(u.pageCount),
    formatCostBuckets(u.costs, ''),
  ]);
  const csv = [header, ...rows]
    .map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="lumen-users.csv"');
  // BOM 让 Excel 正确识别 UTF-8
  res.send(`﻿${csv}`);
  recordAudit({ tenantId: 'tn_admin', userId: userIdOf(req), action: 'export', target: 'users.csv', ip: clientIp(req) });
});

adminUsersRouter.post('/', (req, res) => {
  const body = parseBody(z.object({
    username: z.string().min(3).max(64),
    email: z.string().optional(),
    password: z.string().min(1),
    role: Role.default('user'),
    mustChangePassword: z.boolean().default(true),
  }), req);

  const pwErr = passwordPolicyError(body.password);
  if (pwErr) throw invalid(pwErr);

  const user = createUser({
    username: body.username,
    ...(body.email ? { email: body.email } : {}),
    password: body.password,
    role: body.role,
    source: 'admin_created',
    createdBy: userIdOf(req),
    mustChangePassword: body.mustChangePassword,
  });
  recordAudit({
    tenantId: user.tenantId, userId: userIdOf(req), action: 'create_user',
    target: user.userId, meta: { username: user.username, role: user.role }, ip: clientIp(req),
  });
  ok(res, toPublic(user), 201);
});

adminUsersRouter.get('/:userId', (req, res) => {
  const { userId } = parseParams(UserIdParam, req);
  const user = findById(userId);
  if (!user) throw notFound('用户不存在');
  const { items: tasks } = listAudit({ tenantId: user.tenantId, userId, limit: 50 });
  ok(res, {
    user: { ...toPublic(user), ...aggregatesFor(userId) },
    usage: usageSummary({ userId, tenantId: user.tenantId }),
    audit: tasks,
  });
});

adminUsersRouter.patch('/:userId', (req, res) => {
  const { userId } = parseParams(UserIdParam, req);
  const body = parseBody(z.object({
    email: z.string().optional(),
    role: Role.optional(),
    quota: z.object({
      maxProjects: z.coerce.number().int().min(0),
      maxConcurrency: z.coerce.number().int().min(0),
      maxTokens: z.coerce.number().int().min(0),
      maxImages: z.coerce.number().int().min(0),
    }).optional(),
    password: z.string().optional(),
  }), req);

  if (body.password !== undefined) {
    const pwErr = passwordPolicyError(body.password);
    if (pwErr) throw invalid(pwErr);
    resetPassword(userId, body.password, userIdOf(req), clientIp(req));
  }
  const patch = {
    ...(body.email !== undefined ? { email: body.email } : {}),
    ...(body.role !== undefined ? { role: body.role } : {}),
    ...(body.quota !== undefined ? { quota: body.quota } : {}),
  };
  const updated = Object.keys(patch).length > 0 ? updateUser(userId, patch) : requireById(userId);
  if (body.quota) {
    recordAudit({
      tenantId: updated.tenantId, userId: userIdOf(req), action: 'quota_change',
      target: userId, meta: body.quota, ip: clientIp(req),
    });
  }
  ok(res, toPublic(updated));
});

adminUsersRouter.post('/:userId/status', (req, res) => {
  const { userId } = parseParams(UserIdParam, req);
  const body = parseBody(z.object({ status: UserStatus }), req);
  if (body.status === 'disabled') disableUser(userId, userIdOf(req), clientIp(req));
  else enableUser(userId, userIdOf(req), clientIp(req));
  ok(res, toPublic(requireById(userId)));
});

adminUsersRouter.post('/:userId/force-logout', (req, res) => {
  const { userId } = parseParams(UserIdParam, req);
  forceLogout(userId, userIdOf(req), clientIp(req));
  ok(res, { forced: true });
});

/* ---------------- 审计与用量 ---------------- */

export const adminAuditRouter = Router();
adminAuditRouter.use(requireAdmin);

adminAuditRouter.get('/', (req, res) => {
  const q = parseQuery(z.object({
    userId: z.string().optional(),
    action: z.string().optional(),
    from: z.coerce.number().int().optional(),
    to: z.coerce.number().int().optional(),
    limit: z.coerce.number().int().optional(),
    offset: z.coerce.number().int().optional(),
  }), req);
  // 管理员视角可跨租户查看，这里以管理员自身租户为默认边界，指定 userId 时放开
  ok(res, listAudit({ tenantId: 'tn_admin', ...q }));
});

export const adminUsageRouter = Router();
adminUsageRouter.use(requireAdmin);

adminUsageRouter.get('/', (req, res) => {
  const q = parseQuery(z.object({
    userId: z.string().optional(),
    projectId: z.string().optional(),
    kind: z.enum(['text', 'image']).optional(),
    providerId: z.string().optional(),
    from: z.coerce.number().int().optional(),
    to: z.coerce.number().int().optional(),
    limit: z.coerce.number().int().optional(),
    offset: z.coerce.number().int().optional(),
  }), req);
  ok(res, { summary: usageSummary(q), records: listUsage(q) });
});
