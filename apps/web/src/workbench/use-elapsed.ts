import { useEffect, useState } from 'react';

/**
 * 从某个时刻起过了多少秒。`since` 为空时回 0，也不起定时器。
 *
 * 「已经等了 N 秒」是长任务里**唯一诚实的进度**：模型那边一次调用要几十秒，
 * 中间没有任何可报的阶段。没有这个数字，界面上只有一个转圈，看不出是慢还是死了。
 *
 * 出页面与出图两处都要用它，所以单独放一个文件——复制第二份的那天，
 * 两边就会开始各改各的（一边记得清定时器、另一边忘了）。
 */
export function useElapsed(since: number | undefined): number {
  const [, tick] = useState(0);
  useEffect(() => {
    if (since === undefined) return;
    const timer = window.setInterval(() => tick((n) => n + 1), 1000);
    return () => window.clearInterval(timer);
  }, [since]);
  return since === undefined ? 0 : Math.max(0, Math.round((Date.now() - since) / 1000));
}
