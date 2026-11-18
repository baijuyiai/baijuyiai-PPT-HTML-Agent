import type { NextFunction, Request, Response } from 'express';
import { forbidden } from '../lib/errors.js';

/**
 * 租户边界守卫。
 * 约定：所有仓储层查询必须显式带 tenantId，且 tenantId 只能来自 req.tenantId（令牌派生），
 * 绝不接受客户端传入的 tenantId / ownerId 覆盖。这里提供工具函数统一出口。
 */

/** 取出当前租户，缺失即 401/403 */
export function tenantOf(req: Request): string {
  const tid = req.tenantId ?? req.auth?.tid;
  if (!tid) throw forbidden('缺少租户上下文');
  return tid;
}

export function userIdOf(req: Request): string {
  const uid = req.auth?.sub;
  if (!uid) throw forbidden('缺少用户上下文');
  return uid;
}

/**
 * 断言资源归属当前租户，否则 403。
 * 各资源路由在读取单条记录后调用。
 */
export function assertTenant(req: Request, resourceTenantId: string, what = '资源'): void {
  if (resourceTenantId !== tenantOf(req)) throw forbidden(`无权访问该${what}`);
}

/** 每个请求都要求已登录且已改密（除白名单路由外） */
export function requireTenant(req: Request, _res: Response, next: NextFunction): void {
  try {
    tenantOf(req);
    next();
  } catch (err) {
    next(err);
  }
}
