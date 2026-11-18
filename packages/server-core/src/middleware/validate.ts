import type { Request } from 'express';
import type { z } from 'zod';
import { invalid } from '../lib/errors.js';

/** 校验 body，失败抛 VALIDATION（由全局错误中间件转成 400） */
export function parseBody<T extends z.ZodTypeAny>(schema: T, req: Request): z.infer<T> {
  const r = schema.safeParse(req.body);
  if (!r.success) {
    throw invalid('请求参数不合法', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return r.data;
}

export function parseQuery<T extends z.ZodTypeAny>(schema: T, req: Request): z.infer<T> {
  const r = schema.safeParse(req.query);
  if (!r.success) {
    throw invalid('查询参数不合法', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return r.data;
}

export function parseParams<T extends z.ZodTypeAny>(schema: T, req: Request): z.infer<T> {
  const r = schema.safeParse(req.params);
  if (!r.success) {
    throw invalid('路径参数不合法', r.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })));
  }
  return r.data;
}

/** 取客户端 IP，兼容反向代理 */
export function clientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length > 0) return fwd.split(',')[0]!.trim();
  return req.ip ?? req.socket.remoteAddress ?? '';
}
