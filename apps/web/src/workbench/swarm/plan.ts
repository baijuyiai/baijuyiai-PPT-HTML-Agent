/**
 * 「一群光标把这一页搭出来」的时间轴。
 *
 * ## 为什么时间轴要是**纯函数**
 *
 * 用户要求切页、刷新之后「到哪个内容的生成了，就可以看到继续的内容」。所以「现在该
 * 画第几块、这一块打了几个字」必须是 `f(已经跑了多久)`，不能是「这次挂载播到哪了」——
 * 后者一刷新就从第一块重来。
 *
 * 光标自己的位置不在此列：那是实时物理（见 `engine.ts`），刷新回来它们会重新飞过去。
 * 只要**任务与文字的位置对得上**，读起来就是「它们接着在干」。
 *
 * ## 每个光标一条队列
 *
 * 块按 `i % 光标数` 分给各个光标，每个光标按顺序做完自己的那几块，中间留一段
 * 「飞过去」的空档。这样天然保证一个光标同一时刻只干一件事，不必再写抢占逻辑——
 * 而「同时有 n 个地方在动」是靠**多个光标各自的队列错开开始的**（`LEAD_MS`）得到的，
 * 不是让一个光标同时干几件事。
 */

/** 拖一个框要多久 */
export const DRAW_MS = 640;
/** 做完一块到开始下一块之间留的空档——那是光标飞过去的时间 */
export const GAP_MS = 280;
/** 每个光标比前一个晚多久开工。**不同步启动**是这套效果像「一群人在干」的关键 */
export const LEAD_MS = 150;
/** 一个字的基准耗时 */
export const CHAR_MS = 62;
const MIN_TYPE_MS = 460;
const MAX_TYPE_MS = 3_400;

/**
 * 循环时，一页全画完之后停多久再从头来。
 *
 * 不留这一下的话「搭完了」那一帧一闪而过——用户看到的永远是一群光标在忙，
 * 看不到它忙出来的结果。
 */
export const LOOP_HOLD_MS = 900;

export interface SwarmBlock {
  /** DOM 里的第几块（0 是页眉） */
  index: number;
  /** 归哪个光标管 */
  cursor: number;
  chars: number;
  /** 开始拖框 / 开始打字 / 打完（都相对这一轮的开场） */
  drawAt: number;
  typeAt: number;
  doneAt: number;
  /** 每个字各占多久 */
  charMs: number[];
}

export interface SwarmPlan {
  blocks: SwarmBlock[];
  cursorCount: number;
  /** 全部做完要多久 */
  totalMs: number;
}

/**
 * 第 i 个字比基准慢多少倍。
 *
 * **确定性的伪随机**：同一个字永远是同一个值——时间轴是纯函数，这里不能真摇色子。
 * 不匀速是刻意的：匀速打字一眼就看得出是机器在放动画。
 */
function charUnit(i: number): number {
  const h = Math.abs(Math.imul(i + 7, 2654435761) | 0) % 997;
  return 0.55 + (h / 997) * 1.05;
}

const clamp = (lo: number, hi: number, v: number): number => Math.min(hi, Math.max(lo, v));

export function planSwarm(charCounts: number[], cursorCount: number): SwarmPlan {
  const n = Math.max(1, cursorCount);
  /** 每个光标自己那只钟：上一块做完 + 飞过去的空档 */
  const clocks = Array.from({ length: n }, (_, c) => c * LEAD_MS);
  const blocks: SwarmBlock[] = [];

  charCounts.forEach((chars, index) => {
    const cursor = index % n;
    const raw = Array.from({ length: chars }, (_, i) => CHAR_MS * charUnit(i));
    const total = raw.reduce((a, b) => a + b, 0);
    // 长段落把每个字压低、短标题把每个字拉长：总时长落在一个看得下去的区间里
    const scale = chars === 0 ? 0 : clamp(MIN_TYPE_MS, MAX_TYPE_MS, total) / total;
    const charMs = raw.map((m) => m * scale);
    const drawAt = clocks[cursor]!;
    const typeAt = drawAt + DRAW_MS;
    const doneAt = typeAt + charMs.reduce((a, b) => a + b, 0);
    blocks.push({ index, cursor, chars, drawAt, typeAt, doneAt, charMs });
    clocks[cursor] = doneAt + GAP_MS;
  });

  return {
    blocks,
    cursorCount: n,
    totalMs: blocks.length === 0 ? 0 : Math.max(...blocks.map((b) => b.doneAt)) + GAP_MS,
  };
}

export type BlockPhase = 'waiting' | 'drawing' | 'typing' | 'done';

export interface BlockState {
  phase: BlockPhase;
  /** 框画到几成（0–1）。1 表示框已经画完 */
  box: number;
  /** 已经打出来的字数 */
  typed: number;
}

/** 这一块在 `t` 时刻的样子。**纯函数**——切页、刷新回来算出来的是同一个 */
export function stateOf(b: SwarmBlock, t: number): BlockState {
  if (t < b.drawAt) return { phase: 'waiting', box: 0, typed: 0 };
  if (t < b.typeAt) {
    return { phase: 'drawing', box: clamp(0, 1, (t - b.drawAt) / DRAW_MS), typed: 0 };
  }
  if (t >= b.doneAt) return { phase: 'done', box: 1, typed: b.chars };
  let acc = b.typeAt;
  for (let i = 0; i < b.chars; i += 1) {
    acc += b.charMs[i]!;
    if (t < acc) return { phase: 'typing', box: 1, typed: i };
  }
  return { phase: 'typing', box: 1, typed: b.chars };
}

/**
 * 拖框时十字准星走到框的哪个位置（0–1，沿上边→右边那条折线）。
 *
 * 前七成走完上边、后三成沿右边下来——真拖一个框就是这么走的，两条边等速反而像在描点。
 */
export function dragPoint(progress: number): { u: number; v: number } {
  const p = clamp(0, 1, progress);
  // 夹一道：`(1 - 0.7) / 0.3` 在浮点下是 1.0000000000000002，会让「拖完了」的判定差一丁点
  if (p <= 0.7) return { u: clamp(0, 1, p / 0.7), v: 0 };
  return { u: 1, v: clamp(0, 1, (p - 0.7) / 0.3) };
}

/** 一条块上光标同一时刻只在做这一件事 */
export function activeBlockOf(plan: SwarmPlan, cursor: number, t: number): SwarmBlock | null {
  for (const b of plan.blocks) {
    if (b.cursor !== cursor) continue;
    if (t < b.drawAt) return null;          // 队列是有序的，它还没轮到这一块
    if (t < b.doneAt + GAP_MS) return b;
  }
  return null;
}

/** 循环一圈的时间：把这一页搭完 + 停一下 */
export function cycleOf(plan: SwarmPlan): number {
  return plan.totalMs + LOOP_HOLD_MS;
}

/**
 * 从「这一页已经跑了多久」换算成时间轴上的位置。
 *
 * **循环就是这一条取模**，没有别的复位逻辑：`stateOf` 是纯函数，引擎那边又只在
 * 「值变了」的时候才写 DOM——`t` 一回到 0，文字自然回到零个字、框自然重新画。
 *
 * 一页要跑几十秒到几分钟，而这条动画只有五到十秒。不循环的话，剩下那几分钟画面上
 * 没有任何东西在动，看着像卡死了（用户报的就是这个）。
 *
 * 非循环时**原样返回**：揭幕那一遍要走到 `totalMs` 就结束，不能绕回去。
 */
export function timelineAt(plan: SwarmPlan, rawMs: number, loop: boolean): number {
  const raw = Math.max(0, rawMs);
  return loop ? raw % cycleOf(plan) : raw;
}

/** 这一轮放完了没有（只在非循环时有意义） */
export function playedOut(plan: SwarmPlan, rawMs: number): boolean {
  return rawMs >= plan.totalMs;
}
