import type { Provider, TaskRoute, TaskType } from '@lumen/ir-schema';

/** 一条对话消息 */
export interface TextMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  /**
   * 随消息一起发出去的图片（data URL）。**只有支持看图的模型才认得**，
   * 不支持时服务端会忽略它们或直接报错——所以调用方必须自己判断模型能不能看图。
   * 风格识别靠它读设计稿：像素量得出色彩与几何，量不出字体族与设计意图。
   */
  images?: string[];
}

/** Mock 需要知道该产出什么形状的结构化内容；真实客户端忽略此字段 */
export type MockShape = 'outline' | 'page' | 'script' | 'html' | 'remotion' | 'vision-split' | 'vision-page' | 'plain';

/** 文本生成请求 */
export interface TextRequest {
  taskType: TaskType;
  system?: string;
  messages: TextMessage[];
  /** 要求返回 JSON */
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  /**
   * 这次调用的**总时限**（绝对时间戳，`Date.now()` 口径）。
   *
   * 给了就以它为准：单次请求的超时取 `min(供应商 timeoutMs, 剩余时间)`，
   * 供应商级重试与降级链上后续的 Provider 也一并受它约束——预算用完就停手。
   *
   * 为什么需要它：一个请求的最坏耗时是三层重试乘出来的（供应商 `maxRetries+1` 次
   * × 每次 `timeoutMs`，外面还有页级与降级链两层）。按实测配置就是
   * 3 × 300 秒 = 15 分钟，再乘上外层两层能到一个小时。**只有把预算从最上面
   * 贯到最下面，这个乘积才收得住**。
   */
  deadline?: number;
  /** 仅 Mock 使用 */
  mockShape?: MockShape;
  /** 传给 Mock 的上下文，如 { pageType, title, points } */
  mockContext?: Record<string, unknown>;
}

/** 文本生成结果 */
export interface TextResult {
  text: string;
  providerId: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  degraded: boolean;
  degradeReason: string;
  latencyMs: number;
}

/** 图片生成请求 */
export interface ImageRequest {
  taskType: TaskType;
  prompt: string;
  /** 如 '1536x1024'。pixels 写法的 Provider 直接用这个 */
  size: string;
  /** 如 '16:9'。ratio 写法的 Provider 用这个，避免客户端从像素反推时丢精度 */
  ratio?: string;
  /** 'high' | 'medium' | 'low' */
  quality: string;
  n: number;
}

/** 图片生成结果 */
export interface ImageResult {
  images: { buffer: Buffer; mime: string }[];
  providerId: string;
  model: string;
  degraded: boolean;
  degradeReason: string;
  latencyMs: number;
}

/** 语音合成请求 */
export interface SpeechRequest {
  taskType: TaskType;
  /** 要朗读的文本 */
  text: string;
  /** 音色标识，如 'alloy' */
  voice: string;
  /** 语气。作为 system 提示词发给模型，模型据此调整读法 */
  tone?: string;
  /** 输出音频格式，默认 mp3 */
  format?: 'mp3' | 'wav';
}

/** 语音合成结果 */
export interface SpeechResult {
  audio: { buffer: Buffer; mime: string };
  /**
   * 模型回写的转写文本。用来核对它实际读出来的内容——
   * 与传入的 text 有出入时（模型自作主张改词）能发现。
   */
  transcript: string;
  providerId: string;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  degraded: boolean;
  degradeReason: string;
  latencyMs: number;
}

/** 单个 Provider 的客户端实现。Mock 与真实实现同接口，网关不区分。 */
export interface ProviderClient {
  readonly providerId: string;
  readonly isMock: boolean;
  text(req: TextRequest, model: string, cfg: Provider): Promise<TextResult>;
  image(req: ImageRequest, model: string, cfg: Provider): Promise<ImageResult>;
  speech(req: SpeechRequest, model: string, cfg: Provider): Promise<SpeechResult>;
}

/**
 * 用量记录。调用方（api / worker）在这里落库，网关本身不碰数据库。
 * amount 的口径：文本按调用次数计 1，图片按张数计 n。
 */
export interface UsageRecord {
  taskType: string;
  kind: 'text' | 'image';
  providerId: string;
  model: string;
  amount: number;
  inputTokens: number;
  outputTokens: number;
  /** 按 Provider 配置的单价算出的费用；未配置单价时为 0 */
  cost: number;
  /** cost 的币种，来自 Provider 的定价配置 */
  currency: string;
  latencyMs: number;
  ok: boolean;
  degradeReason: string;
}

/** 用量回调。调用方在这里落库。 */
export interface UsageSink {
  record(e: UsageRecord): void;
}

/** 网关配置。全部依赖由调用方注入，本包不读环境变量、不连数据库。 */
export interface GatewayConfig {
  /** 按 providerId 取 Provider 配置 */
  getProvider(providerId: string): Provider | undefined;
  /** 取某任务类型的路由；未配置返回 undefined */
  getRoute(taskType: TaskType): TaskRoute | undefined;
  usage?: UsageSink;
  /** 注入的客户端实现，默认内置 mock + openai-compatible */
  clients?: Record<string, ProviderClient>;
  /** 密钥解密函数：把 Provider.apiKeyRef 解成明文。不传则视为无 Key。 */
  decryptKey?: (apiKeyRef: string) => string;
  fetchImpl?: typeof fetch;
}
