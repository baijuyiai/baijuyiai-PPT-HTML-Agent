import type { Provider } from '@lumen/ir-schema';
import type {
  ImageRequest,
  ImageResult,
  ProviderClient,
  SpeechRequest,
  SpeechResult,
  TextRequest,
  TextResult,
} from './types.js';

/**
 * OpenAI 兼容协议的客户端实现。
 *
 * 只依赖注入的 fetch，不读环境变量、不落库；密钥由调用方解密后传入，
 * 且保证绝不出现在任何抛出的错误信息里。
 */

/** 重试退避基数（毫秒），按 2 的幂次递增 */
const RETRY_BASE_MS = 300;
/** 错误信息里保留的响应体片段上限 */
const DETAIL_LIMIT = 200;

export interface OpenAICompatibleOptions {
  providerId: string;
  /** 已解密的明文密钥；为空表示该 Provider 不带鉴权头 */
  apiKey: string;
  fetchImpl?: typeof fetch;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string; reasoning_content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * 语音模型（gpt-audio 系）的对话响应。
 * 音频以 base64 挂在 `choices[0].message.audio.data`，`content` 通常是空的——
 * 所以**不能复用 text() 那条「content 为空就报错」的检查**。
 */
interface ChatAudioResponse {
  choices?: {
    message?: {
      audio?: { data?: string; format?: string; transcript?: string };
    };
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

interface ImageGenResponse {
  data?: { b64_json?: string; url?: string }[];
  /** task 模式提交后的返回 */
  id?: string;
  status?: string;
  progress?: number;
  error?: unknown;
  result?: { data?: { b64_json?: string; url?: string }[] };
}

/** ratio 写法下服务端接受的画面比例，顺序即优先级 */
const SUPPORTED_RATIOS = ['16:9', '9:16', '1:1', '3:2', '2:3', '4:3', '3:4', '5:4', '4:5', '21:9'];

/** 语音模型回的 audio.format → mime。取不到时按 mp3 兜底 */
const AUDIO_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  pcm: 'audio/wav',
  opus: 'audio/ogg',
  aac: 'audio/aac',
  flac: 'audio/flac',
};

/** task 模式的轮询间隔 */
const POLL_INTERVAL_MS = 5000;

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * 把像素尺寸换算成画面比例。
 * 页面里的图片槽位是按像素比例算出来的，而 ratio 写法的接口只收 '16:9' 这种形式，
 * 换算放这里做一次，内容侧不必为不同 Provider 维护两套尺寸。
 */
export function toRatio(ratio: string | undefined, size: string | undefined): string {
  if (ratio && SUPPORTED_RATIOS.includes(ratio)) return ratio;
  const m = /^(\d+)\s*x\s*(\d+)$/i.exec((size ?? '').trim());
  if (m) {
    const w = Number(m[1]);
    const h = Number(m[2]);
    if (w > 0 && h > 0) {
      const g = gcd(w, h);
      const derived = `${w / g}:${h / g}`;
      if (SUPPORTED_RATIOS.includes(derived)) return derived;
      // 不是常见比例（如 1536x1000）时按宽高比就近取 16:9 / 9:16 / 1:1
      const ar = w / h;
      if (ar > 1.2) return '16:9';
      if (ar < 0.83) return '9:16';
      return '1:1';
    }
  }
  return '16:9';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 拼接 baseUrl 与各段路径，去掉多余的斜杠。
 *
 * 特别处理「baseUrl 里已经带了路径前缀」的情况：服务商给的接入地址常常是
 * `https://host/v1`，而路径前缀字段默认也是 `/v1`，直接拼会得到 `/v1/v1/...`，
 * 表现为一个 404 page not found，很难一眼看出是重复拼接。两边写法都放行。
 */
function joinUrl(base: string, ...parts: string[]): string {
  let out = base.replace(/\/+$/, '');
  for (const p of parts) {
    if (!p) continue;
    const seg = p.startsWith('/') ? p : `/${p}`;
    // 该段已作为 out 的后缀存在时不重复拼接
    if (out === seg || out.endsWith(seg)) continue;
    out += seg;
  }
  return out;
}

/**
 * 朗读指令。**这条不能省。**
 *
 * `gpt-audio` 走的是 /chat/completions，是对话模型：只丢一段文本进去，它会当成
 * 对话输入然后生成一段**回应**，而不是把这段文本读出来。实测把 1034 字的讲稿直接
 * 塞进 user 消息，回来的是 233 字的「好的，让我们先翻到第三页……你觉得这样的导读
 * 节奏可以吗？」，音频只有该有的四分之一长，讲稿根本没被念。
 */
const READ_ALOUD_INSTRUCTION =
  '把用户给出的文本逐字朗读出来，一字不改、不增删、不总结、不回应、不解释。你只负责朗读这段文本。';

/**
 * 朗读指令本身，导出给缓存键用。
 *
 * **它必须进合成结果的缓存键**：指令变了，同一段文本合成出来的音频就完全不同
 * （有指令是 1956 KB 的全文朗读，没指令是 411 KB 的对话式回应），但讲稿、音色、
 * 路由都没变——不把它算进去，改了指令却一直命中旧音频。
 */
export const SPEECH_PROMPT = READ_ALOUD_INSTRUCTION;

/** system = 朗读指令 + 可选语气。语气只调读法，不能顶掉「朗读」这件事本身 */
function readAloudSystem(tone: string | undefined): string {
  const t = tone?.trim() ?? '';
  return t === '' ? READ_ALOUD_INSTRUCTION : `${READ_ALOUD_INSTRUCTION}\n${t}`;
}

export class OpenAICompatibleClient implements ProviderClient {
  readonly providerId: string;
  readonly isMock = false;
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;

  constructor(opts: OpenAICompatibleOptions) {
    this.providerId = opts.providerId;
    this.#apiKey = opts.apiKey ?? '';
    this.#fetch = opts.fetchImpl ?? fetch;
  }

  /** 合并自定义头并补上鉴权头 */
  #headers(cfg: Provider): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...cfg.headers };
    if (this.#apiKey) headers['Authorization'] = `Bearer ${this.#apiKey}`;
    return headers;
  }

  /** 兜底清洗：任何情况下都不让明文密钥出现在错误信息里 */
  #sanitize(message: string): string {
    let out = message;
    if (this.#apiKey) out = out.split(this.#apiKey).join('***');
    return out;
  }

  async #safeText(res: Response): Promise<string> {
    try {
      const text = await res.text();
      return text.slice(0, DETAIL_LIMIT);
    } catch {
      return '';
    }
  }

  /**
   * 带超时与指数退避重试的请求。失败时统一抛 PROVIDER_ERROR。
   * 重试次数取 cfg.maxRetries（默认 2），即最多发起 maxRetries + 1 次请求。
   *
   * `deadline` 是调用方给的总时限（绝对时间戳）。给了之后这里是**双重约束**：
   * 单次请求的超时取 `min(cfg.timeoutMs, 剩余时间)`，退避与后续重试也先看剩余时间——
   * 预算不够就不发下一次了。没有它的话，`maxRetries` 会把最坏耗时直接乘成
   * 3 × 300 秒，而调用方在外面还看得见「这一页已经跑了五分钟」，两边对不上。
   */
  async #request(url: string, init: RequestInit, cfg: Provider, deadline?: number): Promise<Response> {
    const attempts = Math.max(1, Math.floor(cfg.maxRetries) + 1);
    let last = '未知错误';
    for (let attempt = 0; attempt < attempts; attempt++) {
      const left = deadline === undefined ? cfg.timeoutMs : Math.min(cfg.timeoutMs, deadline - Date.now());
      if (left <= 0) {
        last = `PROVIDER_ERROR 超出这次调用的时间预算，放弃第 ${attempt + 1} 次尝试`;
        break;
      }
      try {
        const res = await this.#fetch(url, { ...init, signal: AbortSignal.timeout(left) });
        if (!res.ok) {
          const detail = await this.#safeText(res);
          last = `PROVIDER_ERROR ${res.status} ${url}${detail ? `：${detail}` : ''}`;
        } else {
          return res;
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        last = message.startsWith('PROVIDER_ERROR') ? message : `PROVIDER_ERROR ${message}`;
      }
      if (attempt < attempts - 1) {
        const backoff = RETRY_BASE_MS * 2 ** attempt;
        // 退避之后就没预算了，这一轮重试发不发出去都一样，不如省下这段干等
        if (deadline !== undefined && Date.now() + backoff >= deadline) {
          last = `PROVIDER_ERROR 超出这次调用的时间预算，放弃重试`;
          break;
        }
        await delay(backoff);
      }
    }
    throw new Error(this.#sanitize(last));
  }

  async text(req: TextRequest, model: string, cfg: Provider): Promise<TextResult> {
    const started = Date.now();
    const url = joinUrl(cfg.baseUrl, cfg.pathPrefix, '/chat/completions');

    const messages: { role: string; content: unknown }[] = [];
    if (req.system) messages.push({ role: 'system', content: req.system });
    for (const m of req.messages) {
      /**
       * 带图的消息走 OpenAI 的多模态 parts 写法。纯文本消息仍发字符串——
       * 有些兼容端对 parts 数组里的纯文本条目处理得不如字符串稳，
       * 没必要为了统一写法把所有请求都改成 parts。
       */
      if (m.images && m.images.length > 0) {
        messages.push({
          role: m.role,
          content: [
            { type: 'text', text: m.content },
            ...m.images.map((url) => ({ type: 'image_url', image_url: { url } })),
          ],
        });
      } else {
        messages.push({ role: m.role, content: m.content });
      }
    }

    const body: Record<string, unknown> = { model, messages };
    if (typeof req.temperature === 'number') body['temperature'] = req.temperature;
    if (typeof req.maxTokens === 'number') body['max_tokens'] = req.maxTokens;
    if (req.json) body['response_format'] = { type: 'json_object' };

    const res = await this.#request(
      url,
      { method: 'POST', headers: this.#headers(cfg), body: JSON.stringify(body) },
      cfg,
      req.deadline,
    );
    const data = (await res.json()) as ChatCompletionResponse;
    const message = data.choices?.[0]?.message;
    const text = message?.content ?? '';

    // 推理模型（如 deepseek-v4.1-flash）会把预算先花在 reasoning_content 上，
    // 预算不够时正文是空字符串但 HTTP 仍是 200。放过去的话调用方会拿空内容
    // 生成出空白页，还以为是模型「正常返回」——所以这里必须显式失败。
    if (text.trim() === '') {
      const reasoning = (message?.reasoning_content ?? '').length;
      const hint = reasoning > 0
        ? `模型只产出了 ${reasoning} 字推理内容，正文为空，通常是 max_tokens 被推理耗尽`
        : '模型返回了空内容';
      throw new Error(this.#sanitize(`PROVIDER_ERROR ${hint}（model=${model}）`));
    }

    return {
      text,
      providerId: this.providerId,
      model,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
      degraded: false,
      degradeReason: '',
      latencyMs: Date.now() - started,
    };
  }

  /**
   * 语音合成。走的是同一个 /chat/completions，只是多带 `modalities:['text','audio']`，
   * 音频以 base64 挂在 `message.audio.data`。
   *
   * 语气作为 system 提示词发出去——这是这类模型唯一能控「怎么读」的入口，
   * 它没有 Azure 那种 `mstts:express-as` 风格枚举。
   */
  async speech(req: SpeechRequest, model: string, cfg: Provider): Promise<SpeechResult> {
    const started = Date.now();
    const url = joinUrl(cfg.baseUrl, cfg.pathPrefix, '/chat/completions');

    const messages: { role: string; content: string }[] = [
      { role: 'system', content: readAloudSystem(req.tone) },
      { role: 'user', content: req.text },
    ];

    const format = req.format ?? 'mp3';
    const res = await this.#request(
      url,
      {
        method: 'POST',
        headers: this.#headers(cfg),
        body: JSON.stringify({
          model,
          modalities: ['text', 'audio'],
          audio: { voice: req.voice, format },
          messages,
        }),
      },
      cfg,
    );

    const data = (await res.json()) as ChatAudioResponse;
    const audio = data.choices?.[0]?.message?.audio;
    const encoded = audio?.data ?? '';
    if (encoded === '') {
      throw new Error(this.#sanitize(`PROVIDER_ERROR 语音模型没有返回音频（model=${model}）`));
    }
    // Buffer.from 对非法 base64 不抛错，只丢掉认不出的字符——所以长度还要再判一次
    const buffer = Buffer.from(encoded, 'base64');
    if (buffer.length === 0) {
      throw new Error(this.#sanitize(`PROVIDER_ERROR 语音模型返回的音频解不开（model=${model}）`));
    }

    const got = (audio?.format ?? format).toLowerCase();
    return {
      audio: { buffer, mime: AUDIO_MIME[got] ?? 'audio/mpeg' },
      transcript: audio?.transcript ?? '',
      providerId: this.providerId,
      model,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
      degraded: false,
      degradeReason: '',
      latencyMs: Date.now() - started,
    };
  }

  /** 按 Provider 的方言拼图片请求参数 */
  #imageParams(req: ImageRequest, cfg: Provider): Record<string, unknown> {
    // `imageExtraParams` 是管理员显式写死的附加参数，排在最后展开——他改的就该赢
    const extra = cfg.imageExtraParams ?? {};
    if (cfg.imageSizeFormat === 'ratio') {
      // ratio 方言用清晰度档位计价，且 quality 字段被服务端固定为 high、传别的值只会被忽略，
      // 所以不传，免得管理员以为调低 quality 能省钱
      return { size: toRatio(req.ratio, req.size), resolution: cfg.imageResolution, ...extra };
    }
    return { size: req.size, quality: req.quality, ...extra };
  }

  /** 从响应里取出可用的图片项（b64 或 url），兼容 task 模式的 result.data 包装 */
  #imageItems(payload: ImageGenResponse): { b64_json?: string; url?: string }[] {
    const direct = payload.data ?? [];
    if (direct.length > 0) return direct;
    return payload.result?.data ?? [];
  }

  /** 把图片项落成 Buffer；url 形式会再发一次下载请求 */
  async #collectImages(
    items: { b64_json?: string; url?: string }[],
    cfg: Provider,
  ): Promise<{ buffer: Buffer; mime: string }[]> {
    const images: { buffer: Buffer; mime: string }[] = [];
    for (const item of items) {
      if (typeof item.b64_json === 'string' && item.b64_json) {
        images.push({ buffer: Buffer.from(item.b64_json, 'base64'), mime: 'image/png' });
      } else if (typeof item.url === 'string' && item.url) {
        const imgRes = await this.#fetch(item.url, { signal: AbortSignal.timeout(cfg.timeoutMs) });
        if (!imgRes.ok) {
          throw new Error(this.#sanitize(`PROVIDER_ERROR ${imgRes.status} 图片下载失败：${item.url}`));
        }
        const buffer = Buffer.from(await imgRes.arrayBuffer());
        images.push({ buffer, mime: imgRes.headers.get('content-type') ?? 'image/png' });
      }
    }
    return images;
  }

  /**
   * 提交式图片接口：先拿任务 id，再轮询到完成。
   *
   * ToAPIs 的 gpt-image-2.5 走这条路——单张 1K 图实测约 150 秒，
   * 用同步接口那套超时会把本来会成功的任务判死，所以轮询上限单独配（imagePollTimeoutMs）。
   */
  async #imageViaTask(
    req: ImageRequest,
    model: string,
    cfg: Provider,
    started: number,
  ): Promise<ImageResult> {
    const endpoint = joinUrl(cfg.baseUrl, cfg.pathPrefix, '/images/generations');
    const body = {
      model,
      prompt: req.prompt,
      ...this.#imageParams(req, cfg),
      n: req.n,
    };

    const submit = await this.#request(
      endpoint,
      { method: 'POST', headers: this.#headers(cfg), body: JSON.stringify(body) },
      cfg,
    );
    const created = (await submit.json()) as ImageGenResponse;
    const taskId = created.id ?? (created as { data?: { id?: string } }).data?.id;
    if (!taskId) {
      throw new Error(this.#sanitize('PROVIDER_ERROR 图片任务提交后没有返回任务 id'));
    }

    const deadline = started + cfg.imagePollTimeoutMs;
    for (;;) {
      if (Date.now() > deadline) {
        const secs = Math.round(cfg.imagePollTimeoutMs / 1000);
        throw new Error(this.#sanitize(`PROVIDER_ERROR 图片任务超过 ${secs} 秒仍未完成（taskId=${taskId}）`));
      }
      await delay(POLL_INTERVAL_MS);

      const poll = await this.#request(
        `${endpoint}/${taskId}`,
        { method: 'GET', headers: this.#headers(cfg) },
        cfg,
      );
      const state = (await poll.json()) as ImageGenResponse;

      if (state.status === 'failed') {
        const detail = typeof state.error === 'string'
          ? state.error
          : JSON.stringify(state.error ?? {});
        throw new Error(this.#sanitize(`PROVIDER_ERROR 图片任务失败：${detail}`));
      }
      if (state.status === 'completed') {
        const images = await this.#collectImages(this.#imageItems(state), cfg);
        if (images.length === 0) {
          throw new Error(this.#sanitize('PROVIDER_ERROR 图片任务已完成但响应里没有图片'));
        }
        return {
          images,
          providerId: this.providerId,
          model,
          degraded: false,
          degradeReason: '',
          latencyMs: Date.now() - started,
        };
      }
      // pending / queued / in_progress 继续等
    }
  }

  async image(req: ImageRequest, model: string, cfg: Provider): Promise<ImageResult> {
    const started = Date.now();
    if (cfg.imageApi === 'task') {
      return this.#imageViaTask(req, model, cfg, started);
    }

    const url = joinUrl(cfg.baseUrl, cfg.pathPrefix, '/images/generations');
    const body = { model, prompt: req.prompt, ...this.#imageParams(req, cfg), n: req.n };

    const res = await this.#request(
      url,
      { method: 'POST', headers: this.#headers(cfg), body: JSON.stringify(body) },
      cfg,
    );
    const data = (await res.json()) as ImageGenResponse;

    const images = await this.#collectImages(this.#imageItems(data), cfg);
    if (images.length === 0) {
      throw new Error('PROVIDER_ERROR 图片响应中既没有 b64_json 也没有 url');
    }

    return {
      images,
      providerId: this.providerId,
      model,
      degraded: false,
      degradeReason: '',
      latencyMs: Date.now() - started,
    };
  }
}
