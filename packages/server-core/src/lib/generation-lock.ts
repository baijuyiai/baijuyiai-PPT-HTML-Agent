import { conflict } from './errors.js';
import { logger } from './logger.js';

/**
 * 一个项目同一时刻：**至多一把「整本那类」的写权**（逐页出 HTML、出提纲、出教案——
 * 它们写的是全书、会重排页表），**外加若干「手动单页」的写权**（重跑这一页、生成这一页，
 * 每个大纲槽位至多一条）。
 *
 * ## 为什么手动单页要能从整本底下穿过去
 *
 * 原先只有一把项目级的锁，整本全程占着，于是**用户对着失败的那一页点重试必然被拒**——
 * 而那一页恰恰是他在等的那一页。他要的是「失败的页面可以并发生成，不会因为其他页面
 * 生成而影响当前页面的选择」。
 *
 * 两类写者的危险程度本来就不一样：整本按大纲顺序铺页、还重写大纲，跟任何别的写者并存
 * 都会挤位；而手动单页只写自己那一格。所以互斥按**类**分：整本跟整本互斥，手动单页
 * 只跟**同一格**的另一条手动单页互斥。
 *
 * 整本仍然独占「重排页表」这件事，它的触发路径很日常：**客户端的「生成中」是本地状态，
 * 刷新即清零**，而服务端的流刻意在断连后继续跑。于是「生成到一半刷新、再点一次」
 * 曾必然叠出第二条流——用户越觉得卡住了想重来，越容易把数据跑坏。
 *
 * ## 手动赢：整本不许盖回用户刚手动生成的那一页
 *
 * 两边都写同一格时，谁后落谁赢是随机的——而整本落得晚会把用户刚看到的新页盖回旧的，
 * 他只当是 bug。所以整本这一轮期间被手动碰过的槽位都记在 `manualSlots` 里，
 * 整本落库时跳过它们（见 `generate-html.service` 的 `persist` / `work`）。
 *
 * **判据是「这一轮被碰过」，不是「此刻正在跑」**：手动那页可能早就落完、租约也放了，
 * 整本才轮到它——按「正在跑」判就会漏掉，于是又把用户的新页盖回去。
 *
 * 放在进程内而不是库里：写内容只发生在 API 进程，进程重启时旧流随之消失，
 * 不存在需要跨进程互斥的场景。
 *
 * **光有 `finally` 不够，还要一道租期。** `finally` 只在那段异步函数被唤醒时才跑得起来，
 * 而一个卡在永不落定的 await 上的运行既不抛也不返回，`finally` 永远等不到——
 * 项目就此再也生成不了，用户看到的是「一直转圈、点不动」，正是要避免的那种卡死。
 * 实测踩过：一把锁被占着近一小时，期间一次模型调用都没有，而取锁那几处的
 * `try/finally` 本身挑不出毛病。
 *
 * 所以每个运行在**要花时间的动作之前**续租（`beatGeneration`），超过 `LEASE_MS`
 * 没续的当作已经死了，后来者直接接管并记进日志。判据选「有没有进展」而不是
 * 「跑了多久」：一本 30 页的书跑 20 分钟是正常的，而它每隔几分钟就落一次页。
 */
const LEASE_MS = 15 * 60 * 1000;

type LeaseKind = 'bulk' | 'page';

interface Lease {
  /** `bulk` 写全书、独占；`page` 只写自己那一格 */
  kind: LeaseKind;
  /** 报错与界面上显示的中文名，比如「生成整本页面」「重跑这一页」 */
  label: string;
  /** 取租的时刻，用来在报错里说「已经跑了 N 分钟」 */
  startedAt: number;
  /** 最后一次有进展的时刻 */
  beatAt: number;
  /** 手动单页写的是哪个大纲槽位；整本那类不给 */
  slot?: number;
}

const leases = new Map<string, Lease[]>();

/** 这一轮整本期间被手动碰过的槽位。整本租约一放就清掉 */
const manualSlots = new Map<string, Set<number>>();

const EMPTY_SLOTS: ReadonlySet<number> = new Set();

const minutes = (ms: number): number => Math.max(1, Math.round(ms / 60_000));

const alive = (lease: Lease): boolean => Date.now() - lease.beatAt < LEASE_MS;

/** 只读地问一句，**不改状态**——`isGenerating` 会被进度接口高频调用 */
const liveOf = (projectId: string): Lease[] => (leases.get(projectId) ?? []).filter(alive);

const describe = (lease: Lease): string =>
  lease.kind === 'bulk' ? lease.label : `手动重生成第 ${(lease.slot ?? 0) + 1} 页`;

const busy = (lease: Lease): string =>
  `这个项目正在生成中（${describe(lease)}，已 ${minutes(Date.now() - lease.startedAt)} 分钟），等它跑完再点一次`;

/**
 * 摘掉过期的，并留下接管痕迹。**只在取锁的路径上调**——读路径不该改状态。
 */
function pruneExpired(projectId: string): Lease[] {
  const all = leases.get(projectId) ?? [];
  const live: Lease[] = [];
  for (const l of all) {
    if (alive(l)) {
      live.push(l);
      continue;
    }
    logger.warn('上一个生成任务超过租期没有任何进展，接管它的写权', {
      projectId, label: l.label, kind: l.kind, slot: l.slot,
      silentMs: Date.now() - l.beatAt, ranMs: Date.now() - l.startedAt,
    });
  }
  if (live.length === 0) leases.delete(projectId); else leases.set(projectId, live);
  return live;
}

function push(projectId: string, lease: Lease): void {
  leases.set(projectId, [...(leases.get(projectId) ?? []), lease]);
}

/**
 * 整本那类还能不能开。
 *
 * **只看同类**：手动单页在跑不拦——用户点几页重试之后当然还想点整本。
 * 那几格会被播种进 `manualSlots`（见 `acquireGeneration`），整本不会盖掉它们。
 */
export function assertGenerationFree(projectId: string): void {
  const held = liveOf(projectId).find((l) => l.kind === 'bulk');
  if (held) throw conflict(busy(held));
}

/** 手动单页那条流开流前的预检：只挡住同一格重复点 */
export function assertPageFree(projectId: string, slot: number): void {
  const same = liveOf(projectId).find((l) => l.kind === 'page' && l.slot === slot);
  if (same) throw conflict(`第 ${slot + 1} 页正在生成中，等它跑完再点一次`);
}

/**
 * 取「整本那类」的写权。`label` 会进报错文案，写清楚是哪条链路在跑。
 *
 * 已经在跑就抛 `conflict`——**不排队**。排队看着更友好，实际更糟：第二条流会等第一条
 * 跑完再从头跑一遍，用户等了两倍的时间、多花一倍的模型钱，而他想要的只是「别卡住」。
 */
export function acquireGeneration(projectId: string, label: string): void {
  pruneExpired(projectId);
  assertGenerationFree(projectId);
  // 新一轮开始，上一次遗留的叫停标记要清掉——留着的话这一轮一进循环就收手
  stopRequests.delete(projectId);
  /*
    上一轮的「手动碰过」不能留到这一轮，否则那几格会永远被跳过。
    但**此刻正在跑的手动单页要重新播种**：它在这一轮里同样是用户明确要的那一版。
  */
  const live = liveOf(projectId);
  const touched = new Set<number>();
  for (const l of live) if (l.kind === 'page' && l.slot !== undefined) touched.add(l.slot);
  if (touched.size === 0) manualSlots.delete(projectId); else manualSlots.set(projectId, touched);
  push(projectId, { kind: 'bulk', label, startedAt: Date.now(), beatAt: Date.now() });
}

/**
 * 取某一格的手动写权。
 *
 * **不看整本那把锁**——那正是要允许的并存。也**不碰叫停标记**：整本正被叫停时，
 * 用户重跑一页不该把「停止」悄悄撤销掉。
 */
export function acquirePageGeneration(projectId: string, slot: number, label: string): void {
  pruneExpired(projectId);
  assertPageFree(projectId, slot);
  push(projectId, { kind: 'page', label, slot, startedAt: Date.now(), beatAt: Date.now() });
  const touched = manualSlots.get(projectId) ?? new Set<number>();
  touched.add(slot);
  manualSlots.set(projectId, touched);
}

/** 放掉某一格的手动写权。**不清它碰过的标记**——那个要活到整本这一轮结束 */
export function releasePageGeneration(projectId: string, slot: number): void {
  const next = (leases.get(projectId) ?? []).filter((l) => !(l.kind === 'page' && l.slot === slot));
  if (next.length === 0) leases.delete(projectId); else leases.set(projectId, next);
}

export function releaseGeneration(projectId: string): void {
  const next = (leases.get(projectId) ?? []).filter((l) => l.kind !== 'bulk');
  if (next.length === 0) leases.delete(projectId); else leases.set(projectId, next);
  stopRequests.delete(projectId);
  manualSlots.delete(projectId);
}

/**
 * 续租。**在要花时间的动作之前调**：每一次模型调用、每一轮重试。
 *
 * 没取到租的项目上调用是空操作，所以调用点不必先判断自己有没有锁——
 * 这让 `generatePageHtml` 这类被三条链路共用的函数不必知道自己的调用者是谁。
 *
 * `slot` 决定打在谁身上：不给就打整本那把，给了就打那一格的手动租约。
 * **不能一律打给「这个项目」**——那会让一条卡死的整本被隔壁手动页的心跳一直续着，
 * 租期就白设了。
 */
export function beatGeneration(projectId: string, slot?: number): void {
  const now = Date.now();
  for (const l of leases.get(projectId) ?? []) {
    if (l.kind === 'bulk' && slot === undefined) l.beatAt = now;
    if (l.kind === 'page' && slot !== undefined && l.slot === slot) l.beatAt = now;
  }
}

/** 这一轮整本期间被手动碰过的槽位。整本落库前问一句 */
export function manuallyTouchedSlots(projectId: string): ReadonlySet<number> {
  return manualSlots.get(projectId) ?? EMPTY_SLOTS;
}

/** 此刻被手动单页占着的格数——整本的并发要减掉它们（让一格给它） */
export function manualLeaseCount(projectId: string): number {
  return liveOf(projectId).filter((l) => l.kind === 'page').length;
}

/**
 * 「叫停」标记。
 *
 * 生成**不再跟着连接走**：客户端断开（刷新页面、关标签页、断网）只是没人听了，
 * 这一轮自己跑完——用户刷新回来还能看见「正在写第 N 页」，而不是回来发现
 * 「怎么停在半路、也不知道停在哪」。
 *
 * 真想停下只有一条路：显式调 `requestStop`，「停止」按钮走的就是它。
 * 这样「刷新走人」与「点停止」终于是两件事——它们本来就不该是一件事。
 *
 * 放在进程内、与租约同生共死：进程重启时旧运行随之消失，不存在跨进程的场景。
 */
const stopRequests = new Set<string>();

/**
 * 叫停这个项目正在跑的那一轮。**只对整本那类有意义**：手动单页短、单条流，
 * 停的是它自己那条连接（用户切走就等于不再听了）。
 *
 * **返回有没有真的叫到**：没在跑整本的时候调用方该如实说「没在生成」，
 * 而不是给一个假装成功的按钮。
 */
export function requestStop(projectId: string): boolean {
  const hasBulk = (leases.get(projectId) ?? []).some((l) => l.kind === 'bulk' && alive(l));
  if (!hasBulk) return false;
  stopRequests.add(projectId);
  return true;
}

/**
 * 这一轮该不该收手。生成器每一轮都要问一次。
 *
 * **已经在跑的那几次模型调用拦不住**（请求早发出去了），所以收手不是「立刻断」，
 * 而是「不再往下做、把已经拿到手的落库」——见 `runHtmlGenerationInner` 的收尾。
 */
export function isStopRequested(projectId: string): boolean {
  return stopRequests.has(projectId);
}

/**
 * 只读地问一句「在跑吗」。**手动单页也算在跑**——进度接口靠它答「这个项目在不在生成」，
 * 而用户此刻确实在等一页出来。
 */
export function isGenerating(projectId: string): boolean {
  return liveOf(projectId).length > 0;
}

/**
 * 这个项目此刻在跑的是**哪一类**。
 *
 * 两类在界面上的分量完全不同：整本要摆出「已完成 N 页」那一整套，手动单页只是某一格
 * 里在转。刷新回来的界面据此决定要接哪一种班——接错了就是「只重跑了一页，整本却显示
 * 正在生成」这种对不上的状态。
 */
export function generationKind(projectId: string): 'bulk' | 'page' | null {
  const live = liveOf(projectId);
  if (live.some((l) => l.kind === 'bulk')) return 'bulk';
  return live.length > 0 ? 'page' : null;
}
