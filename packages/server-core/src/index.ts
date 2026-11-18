/**
 * 服务端共享层。
 *
 * api 与 worker 两个进程共用同一份数据访问、队列、模型网关与业务服务，
 * 避免把同一套逻辑抄两遍导致行为漂移（例如队列语义或降级规则不一致）。
 * 这里不含任何 HTTP 路由装配——那是 apps/api 的职责。
 */

export * from './env.js';

// 对象存储适配器：api 与 worker 都直接用它读写产物
export * from '@lumen/storage';

export * from './db/client.js';
export * from './db/migrate.js';

export * from './lib/crypto.js';
export * from './lib/jwt.js';
export * from './lib/logger.js';
export * from './lib/errors.js';
export * from './lib/audit.js';
export * from './lib/quota.js';
export * from './lib/ratelimit.js';
export * from './lib/generation-lock.js';
export * from './lib/generation-progress.js';

export * from './middleware/error.js';
export * from './middleware/validate.js';
export * from './middleware/auth.js';
export * from './middleware/tenant.js';

export * from './services/user.service.js';
export * from './services/auth.service.js';
export * from './services/settings.service.js';
export * from './services/seed.service.js';
export * from './services/project.service.js';
export * from './services/brand-logo.service.js';
export * from './services/style.service.js';
export * from './services/provider.service.js';
export * from './services/billed-gateway.js';
export * from './services/task.service.js';
export * from './services/stock-admin.service.js';
export * from './services/share.service.js';
export * from './services/export.service.js';
export * from './services/usage.service.js';
export * from './services/generate.service.js';
export * from './services/generate-html.service.js';
export * from './services/script.service.js';
export * from './services/recognize.service.js';
export * from './services/design-vision.service.js';
export * from './services/recognize-doc.service.js';
export * from './services/redraw-page.service.js';
export * from './services/style-doc.service.js';
export * from './services/fill-missing.service.js';
export * from './services/style-spec.service.js';
export * from './services/deck-plan.service.js';
export * from './services/cutout.service.js';
export * from './services/narration.service.js';
export * from './services/narration-dispatch.service.js';
export * from './services/studio-layout.service.js';
export * from './services/recognize-layout.service.js';
