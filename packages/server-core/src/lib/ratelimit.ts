/**
 * 进程内滑动窗口限流。
 * 单机自包含形态下够用；换成多实例部署时把这里替换为 Redis 实现即可。
 */

interface Bucket {
  /** 窗口内已发生的次数 */
  hits: number;
  /** 窗口起点 */
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** 窗口重置的毫秒时间戳 */
  resetAt: number;
}

/**
 * 计数并判定。
 * @param key 限流键，如 `signup:1.2.3.4`
 * @param max 窗口内允许的最大次数
 * @param windowMs 窗口长度
 */
export function hit(key: string, max: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.windowStart >= windowMs) {
    buckets.set(key, { hits: 1, windowStart: now });
    return { allowed: true, remaining: max - 1, resetAt: now + windowMs };
  }
  b.hits += 1;
  return {
    allowed: b.hits <= max,
    remaining: Math.max(max - b.hits, 0),
    resetAt: b.windowStart + windowMs,
  };
}

/** 只读查询，不计数 */
export function peek(key: string, windowMs: number): number {
  const b = buckets.get(key);
  if (!b) return 0;
  if (Date.now() - b.windowStart >= windowMs) return 0;
  return b.hits;
}

export function reset(key: string): void {
  buckets.delete(key);
}

/** 测试与运维用：清空全部计数 */
export function resetAll(): void {
  buckets.clear();
}

/** 定期清理过期桶，避免长期运行内存增长 */
const CLEAN_INTERVAL_MS = 10 * 60 * 1000;
let cleaner: NodeJS.Timeout | null = null;

export function startRateLimitCleaner(windowMs = 60 * 60 * 1000): void {
  if (cleaner) return;
  cleaner = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) {
      if (now - b.windowStart >= windowMs) buckets.delete(k);
    }
  }, CLEAN_INTERVAL_MS);
  cleaner.unref();
}

export function stopRateLimitCleaner(): void {
  if (cleaner) {
    clearInterval(cleaner);
    cleaner = null;
  }
}
