import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { recordAudit } from '../lib/audit.js';
import { clientIp } from './validate.js';

export interface ApiOk<T> {
  ok: true;
  data: T;
}
export interface ApiErr {
  ok: false;
  error: { code: string; message: string; details?: unknown };
}

export function ok<T>(res: Response, data: T, status = 200): void {
  res.status(status).json({ ok: true, data } satisfies ApiOk<T>);
}

/**
 * 越权一律留痕（PRD §5.1 / §5.12 验收：403 并审计）。
 * 放在统一错误出口而不是各个路由里，是因为 403 来自租户校验、角色校验等多条路径，
 * 分散记录必然会漏。审计失败不能影响响应本身。
 */
function auditForbidden(req: Request, err: AppError): void {
  if (err.code !== 'FORBIDDEN' || !req.auth) return;
  try {
    recordAudit({
      tenantId: req.auth.tid,
      userId: req.auth.sub,
      action: 'forbidden',
      // 用 originalUrl 而不是 path：在挂载的子路由里 path 是相对路径，记下来会缺前缀
      target: `${req.method} ${req.originalUrl}`,
      meta: { reason: err.message },
      ip: clientIp(req),
    });
  } catch (auditErr) {
    logger.warn('越权审计写入失败', {
      path: req.path,
      message: auditErr instanceof Error ? auditErr.message : String(auditErr),
    });
  }
}

/** 统一错误出口。所有路由抛出的 AppError / ZodError 都在这里转成标准错误体。 */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    if (err.status >= 500) logger.error('请求失败', { path: req.path, code: err.code, message: err.message });
    else logger.debug('请求被拒', { path: req.path, code: err.code, message: err.message });
    auditForbidden(req, err);
    res.status(err.status).json(err.toJSON());
    return;
  }

  if (err instanceof ZodError) {
    const details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    res.status(400).json({
      ok: false,
      error: { code: 'VALIDATION', message: '请求参数不合法', details },
    } satisfies ApiErr);
    return;
  }

  const message = err instanceof Error ? err.message : String(err);
  logger.error('未处理的服务端错误', { path: req.path, message, stack: err instanceof Error ? err.stack : '' });
  res.status(500).json({
    ok: false,
    error: { code: 'INTERNAL', message: '服务器内部错误' },
  } satisfies ApiErr);
}

/** 未匹配到任何路由 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    ok: false,
    error: { code: 'NOT_FOUND', message: `接口不存在：${req.method} ${req.path}` },
  } satisfies ApiErr);
}
