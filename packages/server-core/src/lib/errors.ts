export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'LOCKED_OUT'
  | 'PROVIDER_ERROR'
  | 'NOT_CONFIGURED'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  QUOTA_EXCEEDED: 402,
  RATE_LIMITED: 429,
  LOCKED_OUT: 423,
  PROVIDER_ERROR: 502,
  NOT_CONFIGURED: 501,
  INTERNAL: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
  }

  toJSON() {
    return {
      ok: false as const,
      error: { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) },
    };
  }
}

export const unauthorized = (msg = '未登录或登录已失效') => new AppError('UNAUTHORIZED', msg);
export const forbidden = (msg = '无权访问') => new AppError('FORBIDDEN', msg);
export const notFound = (msg = '资源不存在') => new AppError('NOT_FOUND', msg);
export const invalid = (msg: string, details?: unknown) => new AppError('VALIDATION', msg, details);
export const conflict = (msg: string) => new AppError('CONFLICT', msg);
export const quotaExceeded = (msg: string) => new AppError('QUOTA_EXCEEDED', msg);
export const rateLimited = (msg = '请求过于频繁') => new AppError('RATE_LIMITED', msg);
export const lockedOut = (msg: string) => new AppError('LOCKED_OUT', msg);
export const providerError = (msg: string, details?: unknown) => new AppError('PROVIDER_ERROR', msg, details);
export const notConfigured = (msg: string) => new AppError('NOT_CONFIGURED', msg);

/**
 * 任务的目标已经不存在（页面或项目被删除）。
 *
 * 这不是失败：用户删掉项目后，队列里尚未执行的图片/语音任务理应作废，
 * 若按普通失败处理会耗尽重试次数进入死信，把真正需要人介入的失败淹没掉。
 * worker 见到这个错误会把任务标记为完成并附带降级原因，而不是 fail。
 */
export class ObsoleteSubjectError extends Error {
  constructor(message = '任务目标已不存在') {
    super(message);
    this.name = 'ObsoleteSubjectError';
  }
}
