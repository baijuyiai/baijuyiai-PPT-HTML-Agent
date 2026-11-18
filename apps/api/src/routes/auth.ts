import { Router } from 'express';
import { z } from 'zod';
import { clientIp, parseBody } from '@lumen/server-core';
import { ok } from '@lumen/server-core';
import { requireAuth } from '@lumen/server-core';
import { ACCESS_COOKIE, REFRESH_TTL_MS } from '@lumen/server-core';
import { env } from '@lumen/server-core';
import * as authService from '@lumen/server-core';

export const authRouter = Router();

/**
 * 刷新令牌走 httpOnly cookie，作用域限定在 /api/auth，降低被脚本读取的风险。
 */
function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: env.isProduction,
    path: '/api/auth',
    maxAge: REFRESH_TTL_MS,
  };
}

function setRefreshCookie(res: Parameters<typeof ok>[0], token: string): void {
  res.cookie(ACCESS_COOKIE, token, refreshCookieOptions());
}

function clearRefreshCookie(res: Parameters<typeof ok>[0]): void {
  res.clearCookie(ACCESS_COOKIE, { ...refreshCookieOptions(), maxAge: undefined });
}

const LoginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post('/login', async (req, res) => {
  const body = parseBody(LoginSchema, req);
  const session = await authService.login({ ...body, ip: clientIp(req) });
  setRefreshCookie(res, session.refreshToken);
  ok(res, {
    user: session.user,
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
  });
});

const RegisterSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  email: z.string().optional(),
});

authRouter.post('/register', async (req, res) => {
  const body = parseBody(RegisterSchema, req);
  const session = await authService.register({ ...body, ip: clientIp(req) });
  setRefreshCookie(res, session.refreshToken);
  ok(res, {
    user: session.user,
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
  }, 201);
});

authRouter.post('/refresh', async (req, res) => {
  const raw = (req.cookies?.[ACCESS_COOKIE] as string | undefined) ?? '';
  const session = await authService.refresh(raw, clientIp(req));
  setRefreshCookie(res, session.refreshToken);
  ok(res, {
    user: session.user,
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
  });
});

authRouter.post('/logout', (req, res) => {
  const raw = (req.cookies?.[ACCESS_COOKIE] as string | undefined) ?? '';
  authService.logout(raw);
  clearRefreshCookie(res);
  ok(res, { loggedOut: true });
});

const ChangePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(1),
});

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const body = parseBody(ChangePasswordSchema, req);
  const session = await authService.changePassword(
    req.auth!.sub, body.oldPassword, body.newPassword, clientIp(req),
  );
  setRefreshCookie(res, session.refreshToken);
  ok(res, {
    user: session.user,
    accessToken: session.accessToken,
    expiresIn: session.expiresIn,
  });
});

/** 会话自检：需要登录的接口在这里统一给出 401，不泄露更多信息 */
authRouter.get('/session', requireAuth, (req, res) => {
  ok(res, { userId: req.auth!.sub, tenantId: req.auth!.tid, role: req.auth!.role });
});
