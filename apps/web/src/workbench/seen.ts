/**
 * 「我上次打开这个项目是什么时候」，以及由它推出来的「它变了吗」。
 *
 * 存在 localStorage，**按 userId 分开**——同一个浏览器上换账号不会串。
 *
 * **为什么是 localStorage 而不是建表**：这是「我看过没有」的本地偏好，不是需要跨设备
 * 一致的事实；建表要多一次迁移 + 一个端点 + 每次打开项目一次写。
 *
 * **已知代价（实测过，方向容易记反）**：换浏览器、换设备或清缓存之后，
 * **所有项目都不再显示「有新变更」**——包括真的被改过的那些，因为「没记录」按「不算变」处理
 * （反过来处理的话，第一次打开项目库会满屏都是标记）。所以代价是**漏报**，不是误报。
 * 要跨设备一致就得建 `project_views(userId, projectId, seenAt)` 表。
 */

/** 只要这两个方法，不要整个 `Storage`——测试传一个内存 Map 就够了 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const keyOf = (userId: string) => `lumen.seen.${userId}`;

function read(userId: string, store: StorageLike): Record<string, number> {
  try {
    const raw = store.getItem(keyOf(userId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    // 存的是个对象、不是数组也不是字符串。坏数据按「没记过」处理——
    // 它不该让整个项目库白屏
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, number>;
  } catch {
    return {};
  }
}

/**
 * 记下「现在看过这个项目了」。
 *
 * `now` 是个注入点，只为让测试能写死时间；生产代码不传。
 */
export function markSeen(
  userId: string,
  projectId: string,
  store: StorageLike = localStorage,
  now: number = Date.now(),
): void {
  const all = read(userId, store);
  all[projectId] = now;
  try {
    store.setItem(keyOf(userId), JSON.stringify(all));
  } catch {
    // 隐私模式 / 配额满时 setItem 会抛。这个标记丢了不影响任何功能，不该往上冒
  }
}

/** 没记过回 `null`。**不要回 0**——`updatedAt` 一定大于 0，回 0 等于把所有项目都标成有变更 */
export function seenAt(userId: string, projectId: string, store: StorageLike = localStorage): number | null {
  const v = read(userId, store)[projectId];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * 这个项目在上次打开之后被改过吗。
 *
 * `seen` 为 `null`（从没打开过）时回 `false`：那个标记表达的是「我上次看过之后它变了」，
 * 没看过就谈不上「变了」；按 true 处理的话，第一次打开项目库会满屏都是「有新变更」，
 * 那个标记也就废了。
 */
export function hasChanged(updatedAt: number, seen: number | null): boolean {
  return seen !== null && updatedAt > seen;
}
