/**
 * 管理后台的 API 客户端。
 *
 * 与 apps/web 的同名模块保持同一套约定：访问令牌只存内存、刷新令牌走 httpOnly cookie、
 * 401 自动刷新一次后重放。额外提供 download()，因为用户导出是 CSV 而非 JSON。
 */

const BASE = '/api';

export interface ApiErrorBody {
  code: string;
  message: string;
  details?: unknown;
}

export class ApiFailure extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = 'ApiFailure';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

interface Envelope<T> {
  ok: boolean;
  data?: T;
  error?: ApiErrorBody;
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let body: Envelope<T>;
  try {
    body = text ? (JSON.parse(text) as Envelope<T>) : { ok: false };
  } catch {
    throw new ApiFailure(res.status, { code: 'INTERNAL', message: '服务端返回了非 JSON 响应' });
  }
  if (!res.ok || !body.ok) {
    throw new ApiFailure(res.status, body.error ?? { code: 'INTERNAL', message: `请求失败（HTTP ${res.status}）` });
  }
  return body.data as T;
}

async function tryRefresh(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' });
        if (!res.ok) return false;
        const data = await parse<{ accessToken: string }>(res);
        accessToken = data.accessToken;
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => {
          refreshInFlight = null;
        }, 0);
      }
    })();
  }
  return refreshInFlight;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);

  const res = await fetch(BASE + path, { ...init, headers, credentials: 'include' });

  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    if (await tryRefresh()) return request<T>(path, init, false);
    onUnauthorized?.();
  }
  return parse<T>(res);
}

function jsonBody(body: unknown): BodyInit | undefined {
  return body === undefined ? undefined : JSON.stringify(body);
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: jsonBody(body) }),
  put: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PUT', body: jsonBody(body) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body: jsonBody(body) }),
  del: <T>(path: string, body?: unknown) => request<T>(path, { method: 'DELETE', body: jsonBody(body) }),
};

/** 触发浏览器下载（CSV 等非 JSON 响应） */
export async function download(path: string, filename: string): Promise<void> {
  const headers = new Headers();
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  const res = await fetch(BASE + path, { headers, credentials: 'include' });
  if (!res.ok) {
    throw new ApiFailure(res.status, { code: 'DOWNLOAD_FAILED', message: `下载失败（HTTP ${res.status}）` });
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 轮询直到条件满足，用于等待后台任务完成 */
export async function pollUntil<T>(
  fn: () => Promise<T>,
  done: (v: T) => boolean,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<T> {
  const interval = opts.intervalMs ?? 1200;
  const deadline = Date.now() + (opts.timeoutMs ?? 5 * 60 * 1000);
  for (;;) {
    const value = await fn();
    if (done(value)) return value;
    if (Date.now() > deadline) return value;
    await new Promise((r) => setTimeout(r, interval));
  }
}
