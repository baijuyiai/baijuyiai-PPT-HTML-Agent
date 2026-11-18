import { Router } from 'express';
import { z } from 'zod';
import { ok, requirePasswordChanged } from '@lumen/server-core';
import { requireAuth } from '@lumen/server-core';
import { requireTenant, tenantOf, userIdOf } from '@lumen/server-core';
import { clientIp, parseBody, parseParams, parseQuery } from '@lumen/server-core';
import { recordAudit } from '@lumen/server-core';
import { createShare, listShares, resolveShare, revokeShare } from '@lumen/server-core';
import { pageIR, requireProject, listPages } from '@lumen/server-core';
import { resolveAnyStyle } from '@lumen/server-core';
import { env } from '@lumen/server-core';

export const sharesRouter = Router();
sharesRouter.use(requireAuth, requirePasswordChanged, requireTenant);

sharesRouter.get('/', (req, res) => {
  const q = parseQuery(z.object({ projectId: z.string().min(1) }), req);
  ok(res, listShares(q.projectId, tenantOf(req)));
});

sharesRouter.post('/', (req, res) => {
  const body = parseBody(z.object({
    projectId: z.string().min(1),
    /** 有效期天数，0 表示不过期 */
    ttlDays: z.coerce.number().int().min(0).max(365).default(30),
  }), req);
  const share = createShare(body.projectId, tenantOf(req), userIdOf(req), body.ttlDays * 24 * 60 * 60 * 1000);
  recordAudit({
    tenantId: tenantOf(req), userId: userIdOf(req), action: 'share',
    target: body.projectId, ip: clientIp(req),
  });
  ok(res, {
    ...share,
    /** 微信可直接打开的分享地址 */
    url: `${env.LUMEN_PUBLIC_BASE_URL.replace(/\/$/, '')}/api/present/${share.token}`,
  }, 201);
});

sharesRouter.delete('/:shareId', (req, res) => {
  const { shareId } = parseParams(z.object({ shareId: z.string() }), req);
  revokeShare(shareId, tenantOf(req));
  ok(res, { revoked: true });
});

/* ---------------- 公开只读访问（无鉴权，靠签名 token 与过期控制） ---------------- */

export const presentRouter = Router();

presentRouter.get('/:token', (req, res) => {
  const { token } = parseParams(z.object({ token: z.string().min(1) }), req);
  const share = resolveShare(token);
  const project = requireProject(share.projectId, share.tenantId);
  const pages = listPages(share.projectId)
    .filter((p) => p.status === 'ready')
    .map((p) => pageIR(p));

  // 分享是只读的：只返回渲染所需数据，不含任何可写字段。
  //
  // 风格**两条链路都可能**：旧的是风格包，新的是风格文档。原先只 `resolveStyle`
  // 取包，StyleDoc 项目会在这里抛错——整条分享链接 500，访客看到的是一句
  // 「分享链接无效」。用 `resolveAnyStyle` 两条都认，各自下发自己那份。
  const style = project.styleId ? resolveAnyStyle(project.styleId) : null;

  ok(res, {
    title: project.title,
    styleId: project.styleId,
    stylePack: style?.kind === 'pack' ? style.pack : null,
    styleDoc: style?.kind === 'doc' ? style.doc : null,
    expiresAt: share.expiresAt,
    pages,
  });
});
