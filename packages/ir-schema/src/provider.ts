import { z } from 'zod';

/** Provider 类型（PRD §5.11） */
export const ProviderType = z.enum(['openai-compatible', 'anthropic', 'deepseek', 'custom']);
export type ProviderType = z.infer<typeof ProviderType>;

/**
 * 图片接口的调用方式。
 * - sync：一次请求直接返回图片（OpenAI 官方 /images/generations 的经典形态）
 * - task：先提交拿任务 id，再轮询到完成（ToAPIs 的 gpt-image-2.5 系列）
 * 两者请求参数与响应结构都不同，靠这个字段区分，而不是靠猜响应形状。
 */
export const ImageApiMode = z.enum(['sync', 'task']);
export type ImageApiMode = z.infer<typeof ImageApiMode>;

/**
 * 图片尺寸参数的写法。
 * - pixels：`1536x1024`，OpenAI 系
 * - ratio：`16:9` 另配 resolution 档位，ToAPIs 普通版
 * 页面里的图片槽位是按像素比例算出来的，所以交给客户端做一次换算。
 */
export const ImageSizeFormat = z.enum(['pixels', 'ratio']);
export type ImageSizeFormat = z.infer<typeof ImageSizeFormat>;

/**
 * 计费币种。单价按供应商账单的原始币种填写，不做汇率换算——
 * 换算需要汇率，而汇率会过期，猜一个数字比不显示更糟。
 * 于是费用按币种分桶展示，而不是相加成一个数。
 */
export const Currency = z.enum(['CNY', 'USD']);
export type Currency = z.infer<typeof Currency>;

export const CURRENCY_SYMBOL: Record<Currency, string> = { CNY: '¥', USD: '$' };

/** 计费单价。0 表示未配置，此时用量记录里的费用保持 0，不做任何猜测。 */
export const ProviderPricing = z.object({
  /** 该 Provider 账单使用的币种 */
  currency: Currency.default('CNY'),
  /** 每百万输入 token 的价格 */
  inputPerMTokens: z.number().min(0).default(0),
  /** 每百万输出 token 的价格 */
  outputPerMTokens: z.number().min(0).default(0),
  /** 每张图片的价格 */
  perImage: z.number().min(0).default(0),
});
export type ProviderPricing = z.infer<typeof ProviderPricing>;

export const DEFAULT_PRICING: ProviderPricing = {
  currency: 'CNY', inputPerMTokens: 0, outputPerMTokens: 0, perImage: 0,
};

/** 一个币种下的费用小计 */
export const CostBucket = z.object({
  currency: z.string().default('CNY'),
  amount: z.number().default(0),
});
export type CostBucket = z.infer<typeof CostBucket>;

/** 把同一币种的桶合并，供各聚合口径复用。 */
export function mergeCostBuckets(buckets: CostBucket[]): CostBucket[] {
  const byCurrency = new Map<string, number>();
  for (const b of buckets) {
    if (!b.amount) continue;
    byCurrency.set(b.currency, (byCurrency.get(b.currency) ?? 0) + b.amount);
  }
  return [...byCurrency.entries()]
    .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 1e6) / 1e6 }))
    .sort((a, b) => b.amount - a.amount);
}

/** 单个币种的金额写法，如 ¥0.3200 / $0.0800 */
export function formatAmount(amount: number, currency: string): string {
  const symbol = CURRENCY_SYMBOL[currency as Currency] ?? `${currency} `;
  return `${symbol}${amount.toFixed(4)}`;
}

/** 多币种金额拼成一行：`¥0.3200 + $0.0800`。没有金额时返回占位符而不是 ¥0。 */
export function formatCostBuckets(buckets: CostBucket[], empty = '未产生费用'): string {
  const merged = mergeCostBuckets(buckets);
  if (merged.length === 0) return empty;
  return merged.map((b) => formatAmount(b.amount, b.currency)).join(' + ');
}

/**
 * Provider 配置。apiKey 一律以密文形式存储，对外响应只返回掩码。
 * 见 apps/api/src/lib/crypto.ts 的 encryptSecret / decryptSecret。
 */
export const Provider = z.object({
  providerId: z.string(),
  name: z.string(),
  type: ProviderType,
  baseUrl: z.string(),
  /** 密文引用，形如 'v1:<iv>:<tag>:<ct>'；绝不出现在响应中 */
  apiKeyRef: z.string().default(''),
  pathPrefix: z.string().default('/v1'),
  headers: z.record(z.string()).default(() => ({})),
  models: z.object({
    text: z.array(z.string()).default(() => []),
    image: z.array(z.string()).default(() => []),
    /** 语音合成模型（如 gpt-audio-1.5-official）。路由页的模型下拉从这里取 */
    audio: z.array(z.string()).default(() => []),
  }).default(() => ({ text: [], image: [], audio: [] })),
  timeoutMs: z.number().int().positive().default(60000),
  maxRetries: z.number().int().min(0).default(2),
  concurrency: z.number().int().positive().default(5),
  /** 0 表示不限 */
  costLimitTokens: z.number().int().min(0).default(0),
  costLimitImages: z.number().int().min(0).default(0),
  pricing: ProviderPricing.default(() => ({ ...DEFAULT_PRICING })),
  /** 图片接口的调用方式，见 ImageApiMode */
  imageApi: ImageApiMode.default('sync'),
  /** 图片尺寸参数写法，见 ImageSizeFormat */
  imageSizeFormat: ImageSizeFormat.default('pixels'),
  /** imageSizeFormat='ratio' 时附带的清晰度档位，如 1K / 2K / 4K */
  imageResolution: z.string().default('2K'),
  /**
   * task 模式下的轮询上限（毫秒）。
   * 必须显著大于 timeoutMs——ToAPIs 单张 1K 图实测约 150 秒，
   * 用同步接口那套 60 秒超时会把本来会成功的任务判死。
   */
  imagePollTimeoutMs: z.number().int().positive().default(420000),
  /** 传给图片接口的额外固定参数，如 { seed: 7 }。**不要用它求透明底**——见 `cutout.service` */
  imageExtraParams: z.record(z.unknown()).default(() => ({})),
  enabled: z.boolean().default(true),
  /** 内置 Mock Provider 标记，用于 UI 提示与费用口径 */
  isMock: z.boolean().default(false),
  createdAt: z.number().int().default(0),
  updatedAt: z.number().int().default(0),
});
export type Provider = z.infer<typeof Provider>;

/** 对外展示的 Provider（Key 打码） */
export const ProviderPublic = Provider.omit({ apiKeyRef: true }).extend({
  apiKeyMasked: z.string().default(''),
  hasApiKey: z.boolean().default(false),
});
export type ProviderPublic = z.infer<typeof ProviderPublic>;

/** 任务类型路由（PRD §5.11 任务级路由表） */
export const TaskType = z.enum([
  'outline',         // 大纲生成
  'page_content',    // 页级内容生成
  'html_codegen',    // HTML/React 代码生成（锁定默认）
  'script',          // 逐页讲稿生成
  'image',           // 图片生成（锁定默认）
  'remotion_config', // Remotion 配置
  'style_recognize', // 风格识别：把文字描述映射到风格族与人群
  'logo_redraw',     // 品牌 logo 重绘：看图 → 写 SVG
  'tts',             // 讲解语音合成：文字 → 音频
]);
export type TaskType = z.infer<typeof TaskType>;

/** 任务类型的中文名。admin 与 web 共用一份，避免两端各抄一遍后叫法不一致。 */
export const TASK_TYPE_LABEL: Record<TaskType, string> = {
  outline: '大纲生成',
  page_content: '页级内容生成',
  html_codegen: 'HTML 代码生成',
  script: '逐页讲稿生成',
  image: '图片生成',
  remotion_config: '视频配置生成',
  style_recognize: '风格识别',
  logo_redraw: '品牌重绘',
  tts: '语音合成',
};

/** 路由表里的任务类型未必都在枚举内，取不到就原样显示 */
export function taskTypeLabel(taskType: string): string {
  return (TASK_TYPE_LABEL as Record<string, string>)[taskType] ?? taskType;
}

export const RouteEntry = z.object({
  providerId: z.string(),
  model: z.string(),
});
export type RouteEntry = z.infer<typeof RouteEntry>;

export const TaskRoute = z.object({
  routeId: z.string(),
  taskType: TaskType,
  primary: RouteEntry,
  /** 降级链：主模型失败自动切备用并记录原因 */
  fallbacks: z.array(RouteEntry).default(() => []),
  /** 锁定路由：默认锁定，需 admin 显式切换 */
  locked: z.boolean().default(false),
});
export type TaskRoute = z.infer<typeof TaskRoute>;

/** 路由锁定策略（PRD §5.11 / §10 决策记录） */
export const DEFAULT_LOCKED_ROUTES: TaskType[] = ['html_codegen', 'image'];

/** 文本模型默认路由 */
export const DEFAULT_TEXT_MODEL = 'deepseek-v4';
/** 图片模型默认路由 */
export const DEFAULT_IMAGE_MODEL = 'gpt-image-2';
/** 语音合成模型默认路由 */
export const DEFAULT_AUDIO_MODEL = 'gpt-audio-1.5-official';

/** 测试连接结果 */
export const TestConnectionResult = z.object({
  ok: z.boolean(),
  kind: z.enum(['text', 'image']),
  latencyMs: z.number().int().default(0),
  model: z.string().default(''),
  /** 失败时的明确错误码 */
  code: z.string().default(''),
  message: z.string().default(''),
});
export type TestConnectionResult = z.infer<typeof TestConnectionResult>;
