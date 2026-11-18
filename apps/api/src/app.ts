import express, { type Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { resolve } from 'node:path';
import { STOCK_ASSETS_DIR } from '@lumen/stock-library/node';
import { FONT_ASSETS_DIR } from '@lumen/ir-schema/node';
import { env, dataDir } from '@lumen/server-core';
import { errorHandler, notFoundHandler } from '@lumen/server-core';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/public.js';
import { meRouter } from './routes/me.js';
import { projectsRouter, pagesRouter } from './routes/projects.js';
import { stylesRouter } from './routes/styles.js';
import { studioRouter } from './routes/studio.js';
import { tasksRouter } from './routes/tasks.js';
import { exportsRouter } from './routes/exports.js';
import { sharesRouter, presentRouter } from './routes/shares.js';
import { uploadsRouter } from './routes/uploads.js';
import {
  adminUsersRouter, adminAuditRouter, adminUsageRouter,
} from './routes/admin/users.js';
import {
  adminProvidersRouter, adminRoutesRouter, adminStylesRouter, adminSettingsRouter,
} from './routes/admin/providers.js';
import { adminTasksRouter } from './routes/admin/tasks.js';
import { adminStockRouter } from './routes/admin/stock.js';
import { adminProjectsRouter } from './routes/admin/projects.js';
import { startRateLimitCleaner } from '@lumen/server-core';
import { logger } from '@lumen/server-core';

/** 允许的来源：web 与 admin 的开发端口，以及同源访问 */
function allowedOrigins(): string[] {
  return [
    `http://localhost:${env.LUMEN_WEB_PORT}`,
    `http://127.0.0.1:${env.LUMEN_WEB_PORT}`,
    `http://localhost:${env.LUMEN_ADMIN_PORT}`,
    `http://127.0.0.1:${env.LUMEN_ADMIN_PORT}`,
    env.LUMEN_PUBLIC_BASE_URL,
  ];
}

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', true);

  app.use(cors({ origin: allowedOrigins(), credentials: true }));
  app.use(express.json({ limit: '4mb' }));
  app.use(express.urlencoded({ extended: false }));
  app.use(cookieParser());

  // 轻量请求日志（脱敏由 logger 负责）
  app.use((req, _res, next) => {
    if (req.path !== '/api/health') logger.debug('请求', { method: req.method, path: req.path });
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, data: { status: 'up', time: Date.now() } });
  });

  app.use('/api/public', publicRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/me', meRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/pages', pagesRouter);
  app.use('/api/styles', stylesRouter);
  app.use('/api/studio', studioRouter);
  app.use('/api/tasks', tasksRouter);
  app.use('/api/exports', exportsRouter);
  app.use('/api/shares', sharesRouter);
  app.use('/api/present', presentRouter);
  app.use('/api/uploads', uploadsRouter);

  // admin 分区：前端路由守卫 + 后端 403 + 审计，双重隔离（PRD §5.12）
  app.use('/api/admin/users', adminUsersRouter);
  app.use('/api/admin/providers', adminProvidersRouter);
  app.use('/api/admin/routes', adminRoutesRouter);
  app.use('/api/admin/styles', adminStylesRouter);
  app.use('/api/admin/audit', adminAuditRouter);
  app.use('/api/admin/usage', adminUsageRouter);
  app.use('/api/admin/tasks', adminTasksRouter);
  app.use('/api/admin/stock', adminStockRouter);
  app.use('/api/admin/projects', adminProjectsRouter);
  app.use('/api/admin/settings', adminSettingsRouter);

  // 对象存储的本地落地目录，按 /{tenantId}/{projectId}/ 分区。
  // 始终挂载：目录可能要到首次上传/导出时才被创建，若此时才挂载会导致重启前一直 404。
  const objectsDir = resolve(dataDir, 'objects');
  app.use('/files', express.static(objectsDir, { fallthrough: true, index: false, dotfiles: 'deny' }));

  // 样机配图库。这些图随仓库分发（开源可商用），不是用户上传的，所以不走对象存储。
  // web 与 admin 都把它反代到这里，于是浏览器里 `/stock/x.jpg` 只有一个真身
  app.use('/stock', express.static(STOCK_ASSETS_DIR, { fallthrough: true, index: false, dotfiles: 'deny' }));

  /*
    随仓库分发的拉丁字体（Cormorant Garamond / Montserrat）。

    **与 `/stock` 走同一条路，而不是把字体内联进页面文档**：功能库那一页要同时渲染
    一百多个 iframe，每个文档里塞一份 base64 就是十几 MB；走静态托管的话
    浏览器只下载一次、所有 iframe 共用一份缓存。

    导出是另一条路：worker 的 `inlineFileUrls` 会把这里的地址换成 data URL，
    成品照样自包含。
  */
  app.use('/fonts', express.static(FONT_ASSETS_DIR, { fallthrough: true, index: false, dotfiles: 'deny' }));

  app.use(notFoundHandler);
  app.use(errorHandler);

  startRateLimitCleaner();
  return app;
}
