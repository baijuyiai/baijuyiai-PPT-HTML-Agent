import { Router } from 'express';
import { z } from 'zod';
import { ok } from '@lumen/server-core';
import { requireAdmin } from '@lumen/server-core';
import { parseQuery } from '@lumen/server-core';
import { all, count, parseJson } from '@lumen/server-core';
import { mergeCostBuckets, type CostBucket } from '@lumen/ir-schema';

/**
 * 跨租户的项目总览。
 *
 * 与 /api/projects 的差别是不按 ownerId 过滤——运维要看的是「平台上现在有哪些演示、
 * 卡在哪一步」，而不是「我自己的项目」。写操作一个都不提供：这里是观察窗口，
 * 改内容仍然要走用户侧接口，避免运维在不知情的情况下替用户改了稿子。
 */
export const adminProjectsRouter = Router();
adminProjectsRouter.use(requireAdmin);

interface ProjectRow {
  projectId: string;
  tenantId: string;
  ownerId: string;
  title: string;
  brief: string;
  audienceTag: string;
  scene: string;
  styleId: string | null;
  status: string;
  avatarEnabled: number;
  createdAt: number;
  updatedAt: number;
}

adminProjectsRouter.get('/', (req, res) => {
  const q = parseQuery(z.object({
    q: z.string().optional(),
    status: z.string().optional(),
    tenantId: z.string().optional(),
    limit: z.coerce.number().int().optional(),
    offset: z.coerce.number().int().optional(),
  }), req);

  const where: string[] = ['1 = 1'];
  const params: unknown[] = [];
  if (q.q) { where.push('(p.title LIKE ? OR p.brief LIKE ?)'); params.push(`%${q.q}%`, `%${q.q}%`); }
  if (q.status) { where.push('p.status = ?'); params.push(q.status); }
  if (q.tenantId) { where.push('p.tenantId = ?'); params.push(q.tenantId); }
  const clause = where.join(' AND ');
  const limit = Math.min(Math.max(q.limit ?? 30, 1), 200);
  const offset = Math.max(q.offset ?? 0, 0);

  const total = count(`SELECT COUNT(*) AS n FROM projects p WHERE ${clause}`, ...params);
  const rows = all<ProjectRow>(
    `SELECT * FROM projects p WHERE ${clause} ORDER BY p.updatedAt DESC LIMIT ? OFFSET ?`,
    ...params, limit, offset,
  );

  const items = rows.map((r) => {
    const pageStats = all<{ status: string; n: number }>(
      'SELECT status, COUNT(*) AS n FROM pages WHERE projectId = ? GROUP BY status',
      r.projectId,
    );
    const byStatus = Object.fromEntries(pageStats.map((s) => [s.status, s.n]));
    const pages = pageStats.reduce((n, s) => n + s.n, 0);
    const owner = all<{ username: string; email: string }>(
      'SELECT username, email FROM users WHERE userId = ?', r.ownerId,
    )[0];
    const usage = all<{ calls: number }>(
      'SELECT COUNT(*) AS calls FROM usage_records WHERE projectId = ?',
      r.projectId,
    )[0];
    const costs = mergeCostBuckets(
      all<CostBucket>(
        `SELECT currency, COALESCE(SUM(cost), 0) AS amount
         FROM usage_records WHERE projectId = ? GROUP BY currency`,
        r.projectId,
      ),
    );
    return {
      projectId: r.projectId,
      tenantId: r.tenantId,
      title: r.title,
      ownerName: owner?.username ?? r.ownerId,
      ownerEmail: owner?.email ?? '',
      audienceTag: r.audienceTag,
      scene: r.scene,
      styleId: r.styleId ?? '',
      status: r.status,
      pages,
      readyPages: byStatus['ready'] ?? 0,
      failedPages: byStatus['failed'] ?? 0,
      pendingPages: (byStatus['pending'] ?? 0) + (byStatus['generating'] ?? 0),
      calls: usage?.calls ?? 0,
      costs,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  });

  ok(res, { items, total });
});

/** 单个项目的页面清单，用于排查「某一页为什么失败」 */
adminProjectsRouter.get('/:projectId', (req, res) => {
  const { projectId } = req.params as { projectId: string };
  const rows = all<{ pageId: string; pageIndex: number; pageType: string; layoutVariant: string; status: string; ir: string }>(
    'SELECT pageId, pageIndex, pageType, layoutVariant, status, ir FROM pages WHERE projectId = ? ORDER BY pageIndex',
    projectId,
  );
  ok(res, {
    pages: rows.map((r) => {
      const ir = parseJson<{ title?: { main?: string }; degradeReason?: string }>(r.ir, {});
      return {
        pageId: r.pageId,
        pageIndex: r.pageIndex,
        pageType: r.pageType,
        layoutVariant: r.layoutVariant,
        status: r.status,
        title: ir.title?.main ?? '',
        degradeReason: ir.degradeReason ?? '',
      };
    }),
  });
});
