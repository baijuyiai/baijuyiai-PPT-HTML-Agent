/**
 * 「页面设计」屏顶上那条状态条的判据与文案格式——**纯函数，所以可以直接测**。
 *
 * 与组件分开，理由和 `swarm/plan.ts` 对着 `swarm/engine.ts` 一样：状态条上真正会出错的
 * 不是那几行 JSX，而是**「这一刻算什么状态」**。判据错一格，整条状态条就会在生成
 * 跑到一半时说「全部完成」，或者在一页都没有时说「还有 3 页没出来」。
 */

export type PageDesignStage = 'no-outline' | 'idle' | 'running' | 'partial' | 'done';

export interface StageInput {
  /** 大纲条数。它是「一共要做多少页」的唯一来源 */
  outlineCount: number;
  readyCount: number;
  failedCount: number;
  /** 整本那条生成流在跑。**单页重生成不置它** */
  generating: boolean;
  /** 服务端说此刻正在写的页数（含单页重生成那一条路） */
  liveCount: number;
}

/**
 * 这一刻是五态里的哪一态。
 *
 * 顺序就是优先级，两条容易写错的：
 *
 * - **`running` 排在 `done` 之前**：整本跑到最后一页时 `readyCount === outlineCount`
 *   还可能成立（那一页刚落库、流还没收尾），先判 `done` 会在还在跑的时候说「全部完成」。
 * - **`running` 也看 `liveCount`**：`generating` 只代表整本那条流。用户单独重跑一页时
 *   它是 false，而确实有一页在写——只看它，那一刻状态条会显示「全部完成」。
 */
export function pageDesignStage(i: StageInput): PageDesignStage {
  if (i.outlineCount === 0) return 'no-outline';
  if (i.generating || i.liveCount > 0) return 'running';
  if (i.readyCount + i.failedCount === 0) return 'idle';
  if (i.readyCount === i.outlineCount) return 'done';
  return 'partial';
}

/** 「48 秒」/「3 分 20 秒」/「1 小时 4 分」。整分整时不拖一个「0 秒」 */
export function duration(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s} 秒`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 === 0 ? `${m} 分` : `${m} 分 ${s % 60} 秒`;
  const h = Math.floor(m / 60);
  return m % 60 === 0 ? `${h} 小时` : `${h} 小时 ${m % 60} 分`;
}
