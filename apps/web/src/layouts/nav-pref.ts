/**
 * 左栏收起的偏好：一个布尔，记在 localStorage。
 *
 * **为什么不是会话内状态**：收起左栏是为了让画布更宽，是用户的长期习惯，
 * 不是一次浏览里的临时动作。每次打开页面都要重新收一遍的话，那个开关等于没有。
 *
 * **为什么不做服务端字段**：这是「我这台机器上想怎么看」，不是需要跨设备一致的事实。
 * 换台机器想换回来只是点一下，为它加一列 + 一次迁移不划算。（`seen.ts` 对
 * 「上次打开时间」做了同一个取舍，理由也一样。）
 *
 * `store` 与 `seen.ts` 一样可注入：`apps/web` 没有 DOM 环境，真 `localStorage`
 * 在测试里根本不存在。
 */
import type { StorageLike } from '../workbench/seen.js';

const KEY = 'lumen.nav.collapsed';

/** 没记过时回 `false`（展开）——默认状态应该是那个信息完整的样子 */
export function readNavCollapsed(store: StorageLike = localStorage): boolean {
  try {
    return store.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function writeNavCollapsed(collapsed: boolean, store: StorageLike = localStorage): void {
  try {
    store.setItem(KEY, collapsed ? '1' : '0');
  } catch {
    // 隐私模式 / 配额满时 setItem 会抛。收起状态丢了不影响任何功能，不该往上冒
  }
}
