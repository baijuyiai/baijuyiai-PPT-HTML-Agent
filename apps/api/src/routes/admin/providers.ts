import { Router } from 'express';
import { z } from 'zod';
import { ok } from '@lumen/server-core';
import { requireAdmin } from '@lumen/server-core';
import { clientIp, parseBody, parseParams, parseQuery } from '@lumen/server-core';
import { userIdOf } from '@lumen/server-core';
import { recordAudit } from '@lumen/server-core';
import {
  createProvider, deleteProvider, listProviders, listRoutes, requireProvider, testConnection,
  toPublicProvider, updateProvider, updateRoute,
} from '@lumen/server-core';
import { listStyleDocs, reviewStyleDoc } from '@lumen/server-core';
import {
  allowSelfSignup, encryptSecret, koukoutuApiKeySet, maxConcurrency, narrationTone, narrationVoice,
  setSetting, SETTING_KEYS, signupPerHour,
} from '@lumen/server-core';
import { ProviderType, TaskType } from '@lumen/ir-schema';

/* ---------------- Provider 配置 ---------------- */

export const adminProvidersRouter = Router();
adminProvidersRouter.use(requireAdmin);

const ProviderIdParam = z.object({ providerId: z.string().min(1) });

adminProvidersRouter.get('/', (_req, res) => {
  ok(res, listProviders().map(toPublicProvider));
});

const ProviderSchema = z.object({
  name: z.string().min(1).max(80),
  type: ProviderType,
  baseUrl: z.string().min(1),
  apiKey: z.string().optional(),
  pathPrefix: z.string().optional(),
  headers: z.record(z.string()).optional(),
  models: z.object({
    text: z.array(z.string()),
    image: z.array(z.string()),
    audio: z.array(z.string()),
  }).optional(),
  timeoutMs: z.coerce.number().int().positive().optional(),
  maxRetries: z.coerce.number().int().min(0).optional(),
  concurrency: z.coerce.number().int().positive().optional(),
  costLimitTokens: z.coerce.number().int().min(0).optional(),
  costLimitImages: z.coerce.number().int().min(0).optional(),
  /** 计费单价与图片接口形态。后台表单一直在发这几个字段，schema 里缺了就会被静默丢掉 */
  pricing: z.object({
    currency: z.enum(['CNY', 'USD']).optional(),
    inputPerMTokens: z.number().min(0).optional(),
    outputPerMTokens: z.number().min(0).optional(),
    perImage: z.number().min(0).optional(),
  }).optional(),
  imageApi: z.enum(['sync', 'task']).optional(),
  imageSizeFormat: z.enum(['pixels', 'ratio']).optional(),
  imageResolution: z.string().optional(),
  imagePollTimeoutMs: z.coerce.number().int().positive().optional(),
  imageExtraParams: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

adminProvidersRouter.post('/', (req, res) => {
  const body = parseBody(ProviderSchema, req);
  const row = createProvider(body);
  recordAudit({
    tenantId: 'tn_admin', userId: userIdOf(req), action: 'provider_change',
    target: row.providerId, meta: { op: 'create', name: row.name }, ip: clientIp(req),
  });
  ok(res, toPublicProvider(row), 201);
});

adminProvidersRouter.patch('/:providerId', (req, res) => {
  const { providerId } = parseParams(ProviderIdParam, req);
  const body = parseBody(ProviderSchema.partial(), req);
  const row = updateProvider(providerId, body);
  recordAudit({
    tenantId: 'tn_admin', userId: userIdOf(req), action: 'provider_change',
    // 只记录改了哪些字段，绝不记录 Key 本身
    target: providerId, meta: { op: 'update', fields: Object.keys(body) }, ip: clientIp(req),
  });
  ok(res, toPublicProvider(row));
});

adminProvidersRouter.delete('/:providerId', (req, res) => {
  const { providerId } = parseParams(ProviderIdParam, req);
  requireProvider(providerId);
  deleteProvider(providerId);
  recordAudit({
    tenantId: 'tn_admin', userId: userIdOf(req), action: 'provider_change',
    target: providerId, meta: { op: 'delete' }, ip: clientIp(req),
  });
  ok(res, { deleted: true });
});

/** 测试连接：对文本与图片各发一个最小请求（PRD §5.11 验收） */
adminProvidersRouter.post('/:providerId/test', async (req, res) => {
  const { providerId } = parseParams(ProviderIdParam, req);
  const body = parseBody(z.object({ kind: z.enum(['text', 'image']).default('text') }), req);
  const result = await testConnection(providerId, body.kind);
  recordAudit({
    tenantId: 'tn_admin', userId: userIdOf(req), action: 'test_connection',
    target: providerId, meta: { kind: body.kind, ok: result.ok, code: result.code }, ip: clientIp(req),
  });
  ok(res, result, result.ok ? 200 : 400);
});

/* ---------------- 任务路由 ---------------- */

export const adminRoutesRouter = Router();
adminRoutesRouter.use(requireAdmin);

adminRoutesRouter.get('/', (_req, res) => {
  ok(res, listRoutes());
});

adminRoutesRouter.patch('/:taskType', (req, res) => {
  const { taskType } = parseParams(z.object({ taskType: TaskType }), req);
  const body = parseBody(z.object({
    primary: z.object({ providerId: z.string(), model: z.string() }).optional(),
    fallbacks: z.array(z.object({ providerId: z.string(), model: z.string() })).optional(),
    locked: z.boolean().optional(),
  }), req);
  const route = updateRoute(taskType, body, 'admin');
  recordAudit({
    tenantId: 'tn_admin', userId: userIdOf(req), action: 'route_change',
    target: taskType, meta: { primary: route.primary, fallbacks: route.fallbacks, locked: route.locked },
    ip: clientIp(req),
  });
  ok(res, route);
});

/* ---------------- 风格库审核 ---------------- */

export const adminStylesRouter = Router();
adminStylesRouter.use(requireAdmin);

/**
 * 风格列表。
 *
 * 读的是新链路的 `style_docs`（每页一条 HTML 生成提示词 + 样机），
 * 不再是旧的 `style_packs`（设计 token + 版式几何）。字段跟着换了：
 * 旧的「系列 / 基调关键词」在新模型里没有对应物，换成「覆盖页型 / 样机数」——
 * 审核时真正要看的是「这套风格能撑起几页、出了几张样机」。
 */
adminStylesRouter.get('/', (req, res) => {
  const q = parseQuery(z.object({
    q: z.string().optional(),
    limit: z.coerce.number().int().optional(),
    offset: z.coerce.number().int().optional(),
  }), req);
  ok(res, listStyleDocs(q));
});

adminStylesRouter.post('/:styleId/review', (req, res) => {
  const { styleId } = parseParams(z.object({ styleId: z.string() }), req);
  const body = parseBody(z.object({ reviewed: z.boolean() }), req);
  const result = reviewStyleDoc(decodeURIComponent(styleId), body.reviewed);
  recordAudit({
    tenantId: 'tn_admin', userId: userIdOf(req), action: 'style_review',
    target: result.styleId, meta: { reviewed: body.reviewed }, ip: clientIp(req),
  });
  ok(res, result);
});

/* ---------------- 全局设置 ---------------- */

export const adminSettingsRouter = Router();
adminSettingsRouter.use(requireAdmin);

/**
 * 读取全局设置。
 * 一律返回**当前生效值**（DB 覆盖值优先，否则是环境变量默认值），
 * 而不是「未设置时给 0」——前端要拿它做表单初值，0 既不是合法输入也不代表实际并发。
 */
function currentSettings() {
  return {
    allowSelfSignup: allowSelfSignup(),
    signupMaxPerHour: signupPerHour(),
    maxConcurrency: maxConcurrency(),
    /**
     * 抠图密钥**只回「配没配」，不回明文**——它是密钥，回明文等于每次打开设置页
     * 都把它往浏览器里送一趟。前端拿这个布尔值决定输入框的占位文案。
     */
    koukoutuApiKeySet: koukoutuApiKeySet(),
    /**
     * 讲解音色与语气。**全局一套**，不随项目走：一份演示的讲解就该是一个人的声音，
     * 逐项目配只会让同一套内容在不同项目里听起来像两个人。
     * 这两项不是敏感项，直接回明文给表单当初值。
     */
    narrationVoice: narrationVoice(),
    narrationTone: narrationTone(),
  };
}

adminSettingsRouter.get('/', (_req, res) => {
  ok(res, currentSettings());
});

adminSettingsRouter.patch('/', (req, res) => {
  const body = parseBody(z.object({
    allowSelfSignup: z.boolean().optional(),
    signupMaxPerHour: z.coerce.number().int().min(1).max(1000).optional(),
    maxConcurrency: z.coerce.number().int().min(1).max(64).optional(),
    /** 空串表示「清掉」，不传表示「不动」 */
    koukoutuApiKey: z.string().max(200).optional(),
    /** 音色留空时回落到默认音色，见 `narrationVoice` */
    narrationVoice: z.string().max(80).optional(),
    /** 语气留空是合法的，表示不加语气提示 */
    narrationTone: z.string().max(500).optional(),
  }), req);

  if (body.allowSelfSignup !== undefined) setSetting(SETTING_KEYS.allowSelfSignup, String(body.allowSelfSignup));
  if (body.signupMaxPerHour !== undefined) setSetting(SETTING_KEYS.signupPerHour, String(body.signupMaxPerHour));
  if (body.maxConcurrency !== undefined) setSetting(SETTING_KEYS.maxConcurrency, String(body.maxConcurrency));
  if (body.koukoutuApiKey !== undefined) {
    setSetting(
      SETTING_KEYS.koukoutuApiKey,
      body.koukoutuApiKey.trim() ? encryptSecret(body.koukoutuApiKey.trim()) : '',
    );
  }
  if (body.narrationVoice !== undefined) setSetting(SETTING_KEYS.narrationVoice, body.narrationVoice.trim());
  if (body.narrationTone !== undefined) setSetting(SETTING_KEYS.narrationTone, body.narrationTone.trim());

  recordAudit({
    tenantId: 'tn_admin', userId: userIdOf(req), action: 'provider_change',
    // 密钥本身不进审计：`meta` 会原样落库，记进去等于明文存了一份
    target: 'settings',
    meta: { ...body, ...(body.koukoutuApiKey === undefined ? {} : { koukoutuApiKey: '（已改，不记明文）' }) },
    ip: clientIp(req),
  });
  ok(res, currentSettings());
});
