/** 浏览器 matchMedia 的最小结构，避免依赖 DOM 类型 */
interface MatchMediaResult {
  matches: boolean;
}

interface MinimalWindow {
  matchMedia?: (query: string) => MatchMediaResult;
}

/**
 * 是否偏好减弱动效。
 * 浏览器里读 window.matchMedia('(prefers-reduced-motion: reduce)')；
 * Node / SSR 下安全返回 false，不抛错。
 */
export function prefersReducedMotion(): boolean {
  const g = globalThis as { window?: MinimalWindow };
  const w = g.window;
  if (!w || typeof w.matchMedia !== 'function') return false;
  try {
    return w.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
  } catch {
    return false;
  }
}
