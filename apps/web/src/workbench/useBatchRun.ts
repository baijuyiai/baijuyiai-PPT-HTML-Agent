import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { TaskKind } from '@lumen/ir-schema';
import { api } from '../api/client.js';
import type { TaskSummary } from '../api/types.js';

/**
 * 批量任务的进度轮询。
 *
 * **点完只弹一条会自己消失的 toast 是不够的**：那个接口只是把任务排进队列（回一个
 * `queued` 数），真正跑在 worker 里，一页几秒、整本几分钟。用户看不到跑到哪、
 * 还剩几页、是不是卡住了。所以记下「排了几页、什么时候排的」，拿任务列表轮询着
 * 把「跑完几页」报出来，显示在按钮上。
 *
 * 讲稿与配音共用这一套——两者都是「接口入队、worker 干活」，形状完全一样，
 * 抄第二份只会让下次改轮询逻辑时要改两处。
 */
export interface BatchRun {
  /** 已跑完的页数。没在跑时为 null */
  done: number | null;
  /** 这一轮一共排了几页。没在跑时为 0 */
  total: number;
  /** 其中被用户挂起的页数。>0 说明正暂停着 */
  paused: number;
  /** 接口返回 `queued` 之后调它开始计时。`queued` 为 0 时什么也不做 */
  start: (queued: number) => void;
  /** 暂停/继续/停止之后立刻重取一次，不用等下一个 2 秒 */
  refresh: () => void;
  /** 结束这一轮（停止之后调，把按钮复位） */
  reset: () => void;
}

/**
 * 「跑完」= `succeeded` / `failed` / `dead`。
 * **失败也算跑完**：不算的话进度会永远差那么几页，按钮一直转下去。
 * **`paused` 不算**：它还在队列里等着，算进去进度条就会假装跑完了。
 */
function finishedCount(items: TaskSummary[], run: { total: number; since: number }): number {
  return items.filter(
    (t) => t.createdAt >= run.since
      && t.status !== 'queued' && t.status !== 'running' && t.status !== 'paused',
  ).length;
}

export function useBatchRun(projectId: string, kind: TaskKind): BatchRun {
  const qc = useQueryClient();
  const [run, setRun] = useState<{ total: number; since: number } | null>(null);

  const progress = useQuery({
    queryKey: [`batch-${kind}`, projectId, run?.since ?? 0],
    enabled: run !== null,
    queryFn: () => api.get<{ items: TaskSummary[] }>(
      `/tasks?${new URLSearchParams({ projectId, kind, limit: '200' }).toString()}`,
    ),
    // 全跑完就停止轮询。`refetchInterval` 收到的是 query 本身，进度得从它的 data 里算
    refetchInterval: (query) => {
      const items = (query.state.data as { items: TaskSummary[] } | undefined)?.items;
      if (!run || !items) return 2000;
      return finishedCount(items, run) >= run.total ? false : 2000;
    },
  });

  const done = run && progress.data ? finishedCount(progress.data.items, run) : null;

  /**
   * **刷新页面后把这一轮接回来。**
   *
   * `run` 是组件内 state，页面一刷就没了。平时无所谓（跑完就结束了），但**暂停是例外**：
   * 队列里挂着的任务不会自己动，而按钮已经退回「配音」——用户再点一次等于又排一遍，
   * 挂起的那些就永远躺在库里了。所以在没有本地 run 时查一次，发现还有排队/挂起/
   * 正在跑的任务，就把这一轮接上。
   */
  const recovered = useQuery({
    queryKey: [`batch-${kind}-recover`, projectId],
    queryFn: () => api.get<{ items: TaskSummary[] }>(
      `/tasks?${new URLSearchParams({ projectId, kind, limit: '200' }).toString()}`,
    ),
    enabled: run === null,
    refetchInterval: run === null ? 5000 : false,
  });

  useEffect(() => {
    if (run !== null || !recovered.data) return;
    const active = recovered.data.items.filter(
      (t) => t.status === 'queued' || t.status === 'running' || t.status === 'paused',
    );
    const earliest = active.reduce<number | null>(
      (min, t) => (min === null || t.createdAt < min ? t.createdAt : min),
      null,
    );
    if (earliest === null) return;
    const total = recovered.data.items.filter((t) => t.createdAt >= earliest).length;
    setRun({ total, since: earliest - 2000 });
  }, [run, recovered.data]);

  // 跑完了把项目拉回来，稍后把按钮复位——不然它会一直停在「12/12」
  useEffect(() => {
    if (!run || done === null || done < run.total) return;
    void qc.invalidateQueries({ queryKey: ['project', projectId] });
    const t = window.setTimeout(() => setRun(null), 3000);
    return () => window.clearTimeout(t);
  }, [run, done, projectId, qc]);

  const paused = run && progress.data
    ? progress.data.items.filter((t) => t.createdAt >= run.since && t.status === 'paused').length
    : 0;

  return {
    done,
    total: run?.total ?? 0,
    paused,
    start: (queued) => {
      if (queued <= 0) return;
      // `since` 往前留 2 秒：`createdAt` 由服务端打，与浏览器的 `Date.now()` 有偏差，
      // 卡得太死会把刚排进去的那几条漏掉
      setRun({ total: queued, since: Date.now() - 2000 });
    },
    refresh: () => { void progress.refetch(); },
    reset: () => {
      setRun(null);
      /**
       * **必须把「接回来」那个查询的缓存一起清掉。** 只 setRun(null) 的话，
       * 恢复查询的 enabled 变回 true，但它手里还是停止前的旧数据（一堆 paused），
       * useEffect 立刻又把这一轮接回来——按钮永远回不到「配音」。
       */
      qc.removeQueries({ queryKey: [`batch-${kind}-recover`, projectId] });
    },
  };
}
