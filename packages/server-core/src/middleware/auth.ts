import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@lumen/ir-schema';
import { verifyAccess, type AccessClaims } from '../lib/jwt.js';
import { forbidden, unauthorized } from '../lib/errors.js';
import { get, run } from '../db/client.js';
import { clientIp } from './validate.js';
import { recordAudit } from '../lib/audit.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessClaims;
      /** 当前请求的租户，一律来自令牌，绝不接受客户端传入 */
      tenantId?: string;
    }
  }
}

function bearer(req: Request): string | null {
  const h = req.header('authorization');
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1]!.trim() : null;
}

/**
 * 解析令牌并校验用户当前状态。
 * 用户被禁用或删除后，已签发的访问令牌立即失效（PRD §5.1 验收）。
 */
async function resolve(req: Request): Promise<AccessClaims> {
  const token = bearer(req);
  if (!token) throw unauthorized();
  let claims: AccessClaims;
  try {
    claims = await verifyAccess(token);
  } catch {
    throw unauthorized('登录已过期，请重新登录');
  }
  const row = get<{ status: string; role: string }>('SELECT status, role FROM users WHERE userId = ?', claims.sub);
  if (!row) throw unauthorized('账号不存在');
  if (row.status !== 'active') throw unauthorized('账号已被禁用');
  // 角色以数据库为准，避免改角色后旧令牌仍持有旧权限
  return { ...claims, role: row.role as Role };
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const claims = await resolve(req);
    req.auth = claims;
    req.tenantId = claims.tid;
    next();
  } catch (err) {
    next(err);
  }
}

/** 允许匿名，但带令牌时解析出身份 */
export async function optionalAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!bearer(req)) return next();
    const claims = await resolve(req);
    req.auth = claims;
    req.tenantId = claims.tid;
    next();
  } catch {
    next();
  }
}

/**
 * 仅管理员。非 admin 一律 403 并写审计（PRD §5.12 入口与硬隔离）。
 */
export async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const claims = await resolve(req);
    if (claims.role !== 'admin') {
      recordAudit({
        tenantId: claims.tid,
        userId: claims.sub,
        action: 'forbidden',
        target: req.originalUrl,
        meta: { method: req.method, role: claims.role },
        ip: clientIp(req),
      });
      throw forbidden('该功能仅管理员可用');
    }
    req.auth = claims;
    req.tenantId = claims.tid;
    next();
  } catch (err) {
    next(err);
  }
}

/** 首次登录强制改密：除改密与登出外，其他接口一律拦下 */
export function requirePasswordChanged(req: Request, _res: Response, next: NextFunction): void {
  if (req.auth?.mcp) {
    next(forbidden('首次登录必须先修改密码'));
    return;
  }
  next();
}

/** 退出登录：撤销该用户全部刷新令牌 */
export function revokeAllRefreshTokens(userId: string): void {
  run('UPDATE refresh_tokens SET revoked = 1 WHERE userId = ?', userId);
}
