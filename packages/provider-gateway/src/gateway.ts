import type { Provider, TaskRoute } from '@lumen/ir-schema';
import { MockClient } from './mock.js';
import { OpenAICompatibleClient } from './openai.js';
import { fallbackChain, resolveRoute } from './router.js';
import type {
  GatewayConfig,
  ImageRequest,
  ImageResult,
  ProviderClient,
  SpeechRequest,
  SpeechResult,
  TextRequest,
  TextResult,
  UsageRecord,
} from './types.js';

/** 模型网关：按任务路由取降级链，逐个尝试，并记录每一次用量。 */
export interface ProviderGateway {
  text(req: TextRequest): Promise<TextResult>;
  image(req: ImageRequest): Promise<ImageResult>;
  speech(req: SpeechRequest): Promise<SpeechResult>;
}

interface AttemptOptions<Res> {
  route: TaskRoute;
  kind: 'text' | 'image';
  /** 成功时的用量口径：文本按次计 1，图片按张计 n */
  amount: number;
  /** 从结果里取 token 用量；图片没有 token，返回 0 */
  tokens: (res: Res) => { inputTokens: number; outputTokens: number };
  call: (client: ProviderClient, model: string, provider: Provider) => Promise<Res>;
  /**
   * 调用方给的总时限（绝对时间戳）。**降级链上的每个 Provider 都共享它**——
   * 否则「主模型 15 分钟 + 备用模型 15 分钟」会叠加，最上面那层给的预算就形同虚设。
   */
  deadline?: number;
}

/**
 * 创建网关。
 *
 * 本函数不读环境变量、不连数据库：Provider 配置、路由、密钥解密与用量落库
 * 全部由调用方注入，因此 api 与 worker 可以共用同一套逻辑，也能脱离数据库单测。
 */
export function createGateway(cfg: GatewayConfig): ProviderGateway {
  // 客户端按 providerId 缓存，避免每次调用都重建
  const cache = new Map<string, ProviderClient>();

  function resolveClient(providerId: string, provider: Provider): ProviderClient {
    const injected = cfg.clients?.[providerId];
    if (injected) return injected;
    const cached = cache.get(providerId);
    if (cached) return cached;
    let client: ProviderClient;
    if (provider.isMock) {
      client = new MockClient(providerId);
    } else {
      const apiKey = provider.apiKeyRef && cfg.decryptKey ? cfg.decryptKey(provider.apiKeyRef) : '';
      client = new OpenAICompatibleClient({
        providerId,
        apiKey,
        ...(cfg.fetchImpl ? { fetchImpl: cfg.fetchImpl } : {}),
      });
    }
    cache.set(providerId, client);
    return client;
  }

  /**
   * 按 Provider 配置的单价算费用。
   * 单价未配置（全 0）时返回 0——宁可显示「未配置单价」也不猜一个数字出来。
   * 币种跟着 Provider 走，不做汇率换算。
   */
  function costOf(
    provider: Provider | undefined,
    kind: 'text' | 'image',
    amount: number,
    tokens: { inputTokens: number; outputTokens: number },
  ): { cost: number; currency: string } {
    const price = provider?.pricing;
    if (!price) return { cost: 0, currency: 'CNY' };
    const imageCost = kind === 'image' ? price.perImage * amount : 0;
    const textCost = kind === 'text'
      ? (tokens.inputTokens / 1_000_000) * price.inputPerMTokens
        + (tokens.outputTokens / 1_000_000) * price.outputPerMTokens
      : 0;
    return {
      cost: Math.round((imageCost + textCost) * 1e6) / 1e6,
      currency: price.currency,
    };
  }

  function record(e: UsageRecord): void {
    cfg.usage?.record(e);
  }

  async function run<Res extends { degraded: boolean; degradeReason: string }>(
    opts: AttemptOptions<Res>,
  ): Promise<Res> {
    const { route, kind, amount, deadline } = opts;
    const chain = fallbackChain(route);
    const primary = chain[0]!;
    const failures: string[] = [];
    /** 首选失败的原因，用于拼出降级说明 */
    let firstFailure = '';
    const outOfBudget = '超出这次调用的时间预算';

    for (let i = 0; i < chain.length; i++) {
      /**
       * 预算用完就**整条链停手**，不再往下换 Provider。
       *
       * 换一家是「再等一次」，而预算里已经没有可等的时间了——继续试只会让
       * 最上面那层以为「还在跑」，实际是在超时之后又空耗一轮。
       */
      if (deadline !== undefined && Date.now() >= deadline) {
        failures.push(`剩余 ${chain.length - i} 个 Provider 未尝试：${outOfBudget}`);
        if (!firstFailure) firstFailure = outOfBudget;
        break;
      }
      const entry = chain[i]!;
      const provider = cfg.getProvider(entry.providerId);
      if (!provider) {
        // 配置缺失不是异常，跳到链上下一个
        const reason = `未找到 Provider 配置：${entry.providerId}`;
        failures.push(`${entry.providerId}/${entry.model}：${reason}`);
        if (!firstFailure) firstFailure = reason;
        record({
          taskType: route.taskType,
          kind,
          providerId: entry.providerId,
          model: entry.model,
          amount: 0,
          inputTokens: 0,
          outputTokens: 0,
          cost: 0,
          currency: 'CNY',
          latencyMs: 0,
          ok: false,
          degradeReason: reason,
        });
        continue;
      }

      const started = Date.now();
      try {
        const client = resolveClient(entry.providerId, provider);
        const res = await opts.call(client, entry.model, provider);
        const latencyMs = Date.now() - started;
        const tokens = opts.tokens(res);
        // 首选成功：不算降级；其后成功：写明主模型为什么失败
        const degradeReason =
          i === 0 ? '' : `主模型 ${primary.providerId}/${primary.model} 失败：${firstFailure || '未知原因'}`;
        const { cost, currency } = costOf(provider, kind, amount, tokens);
        record({
          taskType: route.taskType,
          kind,
          providerId: entry.providerId,
          model: entry.model,
          amount,
          inputTokens: tokens.inputTokens,
          outputTokens: tokens.outputTokens,
          cost,
          currency,
          latencyMs,
          ok: true,
          degradeReason,
        });
        return { ...res, degraded: i > 0, degradeReason };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        failures.push(`${entry.providerId}/${entry.model}：${message}`);
        if (!firstFailure) firstFailure = message;
        // 失败也记一条：费用为 0，但币种跟着 Provider，免得同一家的行币种互相打架
        const failed = costOf(provider, kind, 0, { inputTokens: 0, outputTokens: 0 });
        record({
          taskType: route.taskType,
          kind,
          providerId: entry.providerId,
          model: entry.model,
          amount: 0,
          inputTokens: 0,
          outputTokens: 0,
          cost: failed.cost,
          currency: failed.currency,
          latencyMs: Date.now() - started,
          ok: false,
          degradeReason: message,
        });
      }
    }

    throw new Error(
      `ALL_PROVIDERS_FAILED：任务 ${route.taskType} 的全部 Provider 均失败；${failures.join('；')}`,
    );
  }

  return {
    async text(req: TextRequest): Promise<TextResult> {
      const route = resolveRoute(cfg, req.taskType);
      return run<TextResult>({
        route,
        kind: 'text',
        amount: 1,
        tokens: (res) => res.usage,
        call: (client, model, provider) => client.text(req, model, provider),
        ...(req.deadline === undefined ? {} : { deadline: req.deadline }),
      });
    },
    async image(req: ImageRequest): Promise<ImageResult> {
      const route = resolveRoute(cfg, req.taskType);
      const result = await run<ImageResult>({
        route,
        kind: 'image',
        amount: req.n,
        tokens: () => ({ inputTokens: 0, outputTokens: 0 }),
        call: (client, model, provider) => client.image(req, model, provider),
      });
      return result;
    },
    async speech(req: SpeechRequest): Promise<SpeechResult> {
      const route = resolveRoute(cfg, req.taskType);
      /**
       * 用量记 `kind: 'text'`，**不是**新造一个 'audio'。
       *
       * 语音合成在接口上就是一次 chat/completion，按 token 计费、一次调用算一笔，
       * 与文本完全同构；而新造 kind 要连带改 UsageKind、UsageRecord、usage.service
       * 里两处 SQL CASE、后台用量页的筛选与徽标——为一个标签铺这么宽不划算。
       * 代价是音频 token 会算进用量页的「文本 Token」口径里，可接受。
       * 任务类型是 tts，所以 `byTaskType` 里仍能单看出这一项花了多少。
       */
      return run<SpeechResult>({
        route,
        kind: 'text',
        amount: 1,
        tokens: (res) => res.usage,
        call: (client, model, provider) => client.speech(req, model, provider),
      });
    },
  };
}
