import { all, count, get, insertRow, parseJson, run, updateRow } from '../db/client.js';
import { decryptSecret, encryptSecret, maskSecret, newId } from '../lib/crypto.js';
import { conflict, invalid, notFound, notConfigured, providerError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { createGateway, type GatewayConfig, type ProviderGateway, type ProviderClient } from '@lumen/provider-gateway';
import {
  DEFAULT_LOCKED_ROUTES, DEFAULT_PRICING, Provider, TaskRoute,
  type ProviderPublic, type RouteEntry, type TaskType, type TestConnectionResult,
} from '@lumen/ir-schema';

export interface ProviderRow {
  providerId: string;
  name: string;
  type: string;
  baseUrl: string;
  apiKeyRef: string;
  pathPrefix: string;
  headers: string;
  models: string;
  timeoutMs: number;
  maxRetries: number;
  concurrency: number;
  costLimitTokens: number;
  costLimitImages: number;
  pricing: string;
  imageApi: string;
  imageSizeFormat: string;
  imageResolution: string;
  imagePollTimeoutMs: number;
  imageExtraParams: string;
  enabled: number;
  isMock: number;
  createdAt: number;
  updatedAt: number;
}

export function toProvider(row: ProviderRow): Provider {
  return Provider.parse({
    providerId: row.providerId,
    name: row.name,
    type: row.type,
    baseUrl: row.baseUrl,
    apiKeyRef: row.apiKeyRef,
    pathPrefix: row.pathPrefix,
    headers: parseJson<Record<string, string>>(row.headers, {}),
    models: parseJson<{ text: string[]; image: string[]; audio: string[] }>(
      row.models,
      { text: [], image: [], audio: [] },
    ),
    timeoutMs: row.timeoutMs,
    maxRetries: row.maxRetries,
    concurrency: row.concurrency,
    costLimitTokens: row.costLimitTokens,
    costLimitImages: row.costLimitImages,
    pricing: parseJson<Record<string, number>>(row.pricing, {}),
    imageApi: row.imageApi,
    imageSizeFormat: row.imageSizeFormat,
    imageResolution: row.imageResolution,
    imagePollTimeoutMs: row.imagePollTimeoutMs,
    imageExtraParams: parseJson<Record<string, unknown>>(row.imageExtraParams, {}),
    enabled: row.enabled === 1,
    isMock: row.isMock === 1,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

/** 对外响应：Key 只给掩码，绝不出明文（PRD §5.11） */
export function toPublicProvider(row: ProviderRow): ProviderPublic {
  const p = toProvider(row);
  const plain = row.apiKeyRef ? decryptSecret(row.apiKeyRef) : '';
  const { apiKeyRef, ...rest } = p;
  void apiKeyRef;
  return {
    ...rest,
    apiKeyMasked: plain ? maskSecret(plain) : '',
    hasApiKey: plain.length > 0,
  };
}

export function listProviders(): ProviderRow[] {
  return all<ProviderRow>('SELECT * FROM providers ORDER BY isMock ASC, createdAt ASC');
}

export function requireProvider(providerId: string): ProviderRow {
  const row = get<ProviderRow>('SELECT * FROM providers WHERE providerId = ?', providerId);
  if (!row) throw notFound('Provider 不存在');
  return row;
}

export interface ProviderInput {
  name: string;
  type: Provider['type'];
  baseUrl: string;
  apiKey?: string;
  pathPrefix?: string;
  headers?: Record<string, string>;
  models?: { text: string[]; image: string[]; audio: string[] };
  timeoutMs?: number;
  maxRetries?: number;
  concurrency?: number;
  costLimitTokens?: number;
  costLimitImages?: number;
  /**
   * 计费单价。**写进来时可以是半份**（后台表单可能只改其中一项），
   * 落库后由 `Provider.parse` 补上默认值——所以这里收 `Partial`。
   *
   * 收成完整的那一份是编译不过的：路由那条 zod schema 里四个字段都是 `.optional()`
   * （表单就是这么发的），而 `Provider['pricing']` 是**输出**类型、四个字段全必填。
   */
  pricing?: Partial<Provider['pricing']>;
  imageApi?: Provider['imageApi'];
  imageSizeFormat?: Provider['imageSizeFormat'];
  imageResolution?: string;
  imagePollTimeoutMs?: number;
  imageExtraParams?: Record<string, unknown>;
  enabled?: boolean;
}

export function createProvider(input: ProviderInput): ProviderRow {
  if (!input.name.trim()) throw invalid('Provider 名称不能为空');
  if (!input.baseUrl.trim()) throw invalid('Base URL 不能为空');
  const providerId = newId('prv');
  const now = Date.now();
  insertRow('providers', {
    providerId,
    name: input.name.trim(),
    type: input.type,
    baseUrl: input.baseUrl.trim(),
    // 明文只在写入这一刻存在，落库一律密文
    apiKeyRef: input.apiKey ? encryptSecret(input.apiKey) : '',
    pathPrefix: input.pathPrefix ?? '/v1',
    headers: JSON.stringify(input.headers ?? {}),
    models: JSON.stringify(input.models ?? { text: [], image: [], audio: [] }),
    timeoutMs: input.timeoutMs ?? 60000,
    maxRetries: input.maxRetries ?? 2,
    concurrency: input.concurrency ?? 5,
    costLimitTokens: input.costLimitTokens ?? 0,
    costLimitImages: input.costLimitImages ?? 0,
    pricing: JSON.stringify(input.pricing ?? DEFAULT_PRICING),
    imageApi: input.imageApi ?? 'sync',
    imageSizeFormat: input.imageSizeFormat ?? 'pixels',
    imageResolution: input.imageResolution ?? '2K',
    imagePollTimeoutMs: input.imagePollTimeoutMs ?? 420000,
    imageExtraParams: JSON.stringify(input.imageExtraParams ?? {}),
    enabled: input.enabled === false ? 0 : 1,
    isMock: 0,
    createdAt: now,
    updatedAt: now,
  });
  return requireProvider(providerId);
}

export function updateProvider(providerId: string, input: Partial<ProviderInput>): ProviderRow {
  const row = requireProvider(providerId);
  const patch: Record<string, unknown> = { updatedAt: Date.now() };
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.type !== undefined) patch.type = input.type;
  if (input.baseUrl !== undefined) patch.baseUrl = input.baseUrl.trim();
  // 传空字符串表示清除 Key；不传表示保持不变
  if (input.apiKey !== undefined) patch.apiKeyRef = input.apiKey ? encryptSecret(input.apiKey) : '';
  if (input.pathPrefix !== undefined) patch.pathPrefix = input.pathPrefix;
  if (input.headers !== undefined) patch.headers = JSON.stringify(input.headers);
  if (input.models !== undefined) patch.models = JSON.stringify(input.models);
  if (input.timeoutMs !== undefined) patch.timeoutMs = input.timeoutMs;
  if (input.maxRetries !== undefined) patch.maxRetries = input.maxRetries;
  if (input.concurrency !== undefined) patch.concurrency = input.concurrency;
  if (input.costLimitTokens !== undefined) patch.costLimitTokens = input.costLimitTokens;
  if (input.costLimitImages !== undefined) patch.costLimitImages = input.costLimitImages;
  if (input.pricing !== undefined) patch.pricing = JSON.stringify(input.pricing);
  if (input.imageApi !== undefined) patch.imageApi = input.imageApi;
  if (input.imageSizeFormat !== undefined) patch.imageSizeFormat = input.imageSizeFormat;
  if (input.imageResolution !== undefined) patch.imageResolution = input.imageResolution;
  if (input.imagePollTimeoutMs !== undefined) patch.imagePollTimeoutMs = input.imagePollTimeoutMs;
  if (input.imageExtraParams !== undefined) patch.imageExtraParams = JSON.stringify(input.imageExtraParams);
  if (input.enabled !== undefined) patch.enabled = input.enabled ? 1 : 0;
  updateRow('providers', 'providerId', providerId, patch);
  void row;
  return requireProvider(providerId);
}

export function deleteProvider(providerId: string): void {
  const row = requireProvider(providerId);
  if (row.isMock === 1) throw conflict('内置 Mock Provider 不可删除');
  const used = count('SELECT COUNT(*) AS n FROM task_routes WHERE primaryRef LIKE ? OR fallbacks LIKE ?', `%${providerId}%`, `%${providerId}%`);
  if (used > 0) throw conflict('该 Provider 仍被任务路由引用，请先切换路由');
  run('DELETE FROM providers WHERE providerId = ?', providerId);
}

/* ---------------- 任务路由 ---------------- */

export interface RouteRow {
  routeId: string;
  taskType: string;
  primaryRef: string;
  fallbacks: string;
  locked: number;
  updatedAt: number;
}

export function toRoute(row: RouteRow): TaskRoute {
  return TaskRoute.parse({
    routeId: row.routeId,
    taskType: row.taskType,
    primary: parseJson<RouteEntry>(row.primaryRef, { providerId: '', model: '' }),
    fallbacks: parseJson<RouteEntry[]>(row.fallbacks, []),
    locked: row.locked === 1,
  });
}

export function listRoutes(): TaskRoute[] {
  return all<RouteRow>('SELECT * FROM task_routes ORDER BY taskType').map(toRoute);
}

export function requireRoute(taskType: TaskType): TaskRoute {
  const row = get<RouteRow>('SELECT * FROM task_routes WHERE taskType = ?', taskType);
  if (!row) throw notFound(`任务路由未配置：${taskType}`);
  return toRoute(row);
}

/**
 * 切换路由。锁定路由（html_codegen / image）只有 admin 能改（PRD §5.11）。
 */
export function updateRoute(
  taskType: TaskType,
  patch: { primary?: RouteEntry; fallbacks?: RouteEntry[]; locked?: boolean },
  actorRole: 'admin' | 'user' | 'guest',
): TaskRoute {
  const current = requireRoute(taskType);
  const isLocked = patch.locked ?? current.locked;
  const changingTarget = patch.primary !== undefined || patch.fallbacks !== undefined;
  if (changingTarget && current.locked && actorRole !== 'admin') {
    throw conflict(`路由 ${taskType} 已锁定，仅管理员可切换`);
  }
  if (patch.primary) {
    const p = requireProvider(patch.primary.providerId);
    if (p.enabled !== 1) throw conflict('目标 Provider 已停用');
  }
  updateRow('task_routes', 'taskType', taskType, {
    ...(patch.primary ? { primaryRef: JSON.stringify(patch.primary) } : {}),
    ...(patch.fallbacks ? { fallbacks: JSON.stringify(patch.fallbacks) } : {}),
    ...(patch.locked !== undefined ? { locked: isLocked ? 1 : 0 } : {}),
    updatedAt: Date.now(),
  });
  return requireRoute(taskType);
}

/** 默认锁定路由（PRD §10 决策记录） */
export function defaultLocked(taskType: TaskType): boolean {
  return DEFAULT_LOCKED_ROUTES.includes(taskType);
}

/* ---------------- 网关装配 ---------------- */

export interface GatewayDeps {
  /** 用量落库回调，由调用方注入，避免本服务依赖 usage 表结构 */
  onUsage?: GatewayConfig['usage'];
  fetchImpl?: typeof fetch;
}

/** 组装 Provider 网关。api 与 worker 都通过它拿到同一套路由与降级逻辑。 */
export function buildGateway(deps: GatewayDeps = {}): ProviderGateway {
  const cfg: GatewayConfig = {
    getProvider: (providerId) => {
      const row = get<ProviderRow>('SELECT * FROM providers WHERE providerId = ?', providerId);
      return row ? toProvider(row) : undefined;
    },
    getRoute: (taskType) => {
      const row = get<RouteRow>('SELECT * FROM task_routes WHERE taskType = ?', taskType);
      return row ? toRoute(row) : undefined;
    },
    decryptKey: (ref) => decryptSecret(ref),
    ...(deps.onUsage ? { usage: deps.onUsage } : {}),
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
  };
  return createGateway(cfg);
}

/** 测试连接：对文本与图片各发一个最小请求（PRD §5.11） */
export async function testConnection(providerId: string, kind: 'text' | 'image'): Promise<TestConnectionResult> {
  const row = requireProvider(providerId);
  const provider = toProvider(row);
  const started = Date.now();

  if (provider.isMock) {
    return { ok: true, kind, latencyMs: 1, model: 'mock', code: '', message: '内置 Mock Provider 无需连接' };
  }
  if (!provider.baseUrl) {
    return { ok: false, kind, latencyMs: 0, model: '', code: 'NOT_CONFIGURED', message: '未填写 Base URL' };
  }
  if (!decryptSecret(row.apiKeyRef)) {
    return { ok: false, kind, latencyMs: 0, model: '', code: 'NOT_CONFIGURED', message: '未配置 API Key' };
  }

  const model = kind === 'text' ? provider.models.text[0] : provider.models.image[0];
  if (!model) {
    return { ok: false, kind, latencyMs: 0, model: '', code: 'NOT_CONFIGURED', message: `未配置${kind === 'text' ? '文本' : '图片'}模型` };
  }

  const client: ProviderClient = {
    providerId,
    isMock: false,
    text: async (req, m, cfg) => {
      const { OpenAICompatibleClient } = await import('@lumen/provider-gateway');
      return new OpenAICompatibleClient({ providerId, apiKey: decryptSecret(cfg.apiKeyRef) }).text(req, m, cfg);
    },
    image: async (req, m, cfg) => {
      const { OpenAICompatibleClient } = await import('@lumen/provider-gateway');
      return new OpenAICompatibleClient({ providerId, apiKey: decryptSecret(cfg.apiKeyRef) }).image(req, m, cfg);
    },
    // 目前测试连接只测文本与图片；语音这一步留着完整实现，
    // 将来把 kind 放宽到 audio 时不必再补
    speech: async (req, m, cfg) => {
      const { OpenAICompatibleClient } = await import('@lumen/provider-gateway');
      return new OpenAICompatibleClient({ providerId, apiKey: decryptSecret(cfg.apiKeyRef) }).speech(req, m, cfg);
    },
  };

  try {
    if (kind === 'text') {
      // 预算不能抠：推理模型把 token 花在 reasoning 上，给 8 个 token 会得到一个
      // 空正文，于是「连接正常」被误报成失败
      await client.text(
        {
          taskType: 'page_content',
          messages: [{ role: 'user', content: '只回复两个字：正常' }],
          maxTokens: 2000,
        },
        model,
        provider,
      );
    } else {
      // size 与 ratio 都给上：像素方言用前者，比例方言用后者
      await client.image(
        { taskType: 'image', prompt: '一张纯色背景的极简测试图，不要任何文字', size: '1024x1024', ratio: '1:1', quality: 'low', n: 1 },
        model,
        provider,
      );
    }
    return { ok: true, kind, latencyMs: Date.now() - started, model, code: '', message: '连接成功' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('Provider 测试连接失败', { providerId, kind, message });
    return {
      ok: false,
      kind,
      latencyMs: Date.now() - started,
      model,
      code: message.includes('PROVIDER_ERROR') ? 'PROVIDER_ERROR' : 'INTERNAL',
      message,
    };
  }
}

export function assertGatewayReady(taskType: TaskType): void {
  const route = requireRoute(taskType);
  const provider = get<ProviderRow>('SELECT * FROM providers WHERE providerId = ?', route.primary.providerId);
  if (!provider) throw notConfigured(`路由 ${taskType} 指向的 Provider 不存在`);
  if (provider.enabled !== 1) throw providerError(`路由 ${taskType} 指向的 Provider 已停用`);
}
