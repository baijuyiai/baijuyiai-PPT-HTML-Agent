/**
 * API 客户端。
 *
 * 设计要点：
 * - 访问令牌只存内存（不落 localStorage），刷新令牌走 httpOnly cookie，降低 XSS 风险。
 * - 401 时自动尝试刷新一次并重放原请求，失败则抛出，由上层跳登录页。
 * - SSE 用 fetch + ReadableStream 手写解析，因为 EventSource 无法带 Authorization 头。
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
  /**
   * 服务端在错误状态码上**特意带回来的数据**（响应是 `{ok:true, data}` 但 HTTP 不是 2xx）。
   *
   * 有些接口的「失败」本身是有内容的：删风格被项目占用时，409 里带着占用它的项目清单
   * 与推荐的替代风格，前端要拿它显示「把这几个项目改到「X」再删」。
   * 不把这份数据传出来，界面就只剩「请求失败（HTTP 409）」，用户没有任何下一步可走。
   * 普通错误（`{ok:false, error}`）没有这个字段。
   */
  readonly payload: unknown;

  constructor(status: number, body: ApiErrorBody, payload?: unknown) {
    super(body.message);
    this.name = 'ApiFailure';
    this.status = status;
    this.code = body.code;
    this.details = body.details;
    this.payload = payload;
  }
}

let accessToken: string | null = null;
let refreshInFlight: Promise<boolean> | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** 会话彻底失效时的回调（跳登录页） */
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
    // 服务端有意在错误码上带回数据时（ok:true 但状态码非 2xx），把数据一并抛出去
    const payload = body.ok ? body.data : undefined;
    throw new ApiFailure(
      res.status,
      body.error ?? { code: 'INTERNAL', message: `请求失败（HTTP ${res.status}）` },
      payload,
    );
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
        // 让同一批并发请求共用一次刷新，稍后释放
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

/**
 * 取二进制响应（讲解音频这类）。
 *
 * **不能用 `<audio src="/api/...">`**：访问令牌只在内存里，媒体元素自己发的请求
 * 带不上 Authorization 头，结果是一个 401 的静音。所以用 fetch 取回来再交给播放器。
 * 401 的处理与 `request` 一致——刷新一次后重放。
 */
export async function fetchBlob(path: string, retry = true): Promise<Blob> {
  const headers = new Headers();
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);

  const res = await fetch(BASE + path, { headers, credentials: 'include' });

  if (res.status === 401 && retry) {
    if (await tryRefresh()) return fetchBlob(path, false);
    onUnauthorized?.();
  }
  if (!res.ok) {
    // 出错时响应体仍是 JSON 信封，尽量把服务端那句话取出来
    const message = serverMessage(await res.text().catch(() => ''))
      ?? `请求失败（HTTP ${res.status}）`;
    throw new Error(message);
  }
  return res.blob();
}

/* ---------------- SSE ---------------- */

export interface SseHandlers {
  onEvent: (event: string, data: unknown) => void;
  onError?: (err: Error) => void;
  onClose?: () => void;
}

/**
 * 流**没连上**（而不是连上之后断了）。
 *
 * 两者对用户是两件事：连不上时服务端已经把原因说清了（生成锁被占着、项目不存在、
 * 登录过期），界面该把那句话原样摆出来；连着断了才是真的「网络出问题」。
 * 混成一句「事件流断开」，用户看到的就只剩一个没有下一步的报错——
 * 实测踩过：生成锁冲突（409「这个项目正在生成中（重跑这一页，已 1 分钟）」）
 * 被报成「事件流断开」，用户只会以为是自己网络坏了，反复重试。
 */
export class SseConnectError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'SseConnectError';
    this.status = status;
  }
}

/** 从错误响应体里取出服务端那句人话。取不到返回 null */
function serverMessage(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } };
    return parsed.error?.message ?? null;
  } catch {
    return null;
  }
}

/**
 * 订阅服务端事件流，返回取消函数。
 * 客户端断开后服务端已落库的页不受影响（生成与视图解耦）。
 */
export function streamSse(path: string, handlers: SseHandlers): () => void {
  const controller = new AbortController();
  let closed = false;

  void (async () => {
    try {
      const headers = new Headers({ accept: 'text/event-stream' });
      if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
      const res = await fetch(BASE + path, { headers, credentials: 'include', signal: controller.signal });
      if (!res.ok || !res.body) {
        const detail = await res.text().catch(() => '');
        throw new SseConnectError(
          res.status,
          serverMessage(detail) ?? `事件流连接失败（HTTP ${res.status}）`,
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE 以空行分隔事件
        let idx = buffer.indexOf('\n\n');
        while (idx >= 0) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          const evt = parseChunk(chunk);
          if (evt) handlers.onEvent(evt.event, evt.data);
          idx = buffer.indexOf('\n\n');
        }
      }
      if (!closed) handlers.onClose?.();
    } catch (err) {
      if (!closed && !(err instanceof DOMException && err.name === 'AbortError')) {
        handlers.onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    }
  })();

  return () => {
    closed = true;
    controller.abort();
  };
}

function parseChunk(chunk: string): { event: string; data: unknown } | null {
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of chunk.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  const raw = dataLines.join('\n');
  try {
    return { event, data: JSON.parse(raw) };
  } catch {
    return { event, data: raw };
  }
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
