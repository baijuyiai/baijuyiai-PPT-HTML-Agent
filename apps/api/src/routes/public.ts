import { Router } from 'express';
import { ok } from '@lumen/server-core';
import { publicSettings } from '@lumen/server-core';

/** 无需登录的公开信息。登录页据此决定是否展示「注册」入口。 */
export const publicRouter = Router();

publicRouter.get('/settings', (_req, res) => {
  ok(res, publicSettings());
});
