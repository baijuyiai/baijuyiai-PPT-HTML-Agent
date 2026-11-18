/**
 * 正在写的那几页，以及各自走到哪一步了。
 *
 * ## 为什么要有这份进程内的登记
 *
 * 进度原先只走 SSE：服务端把「第 3 页正在调用模型写这一页」推给当时那条连接，
 * 推完就没了。**用户刷新一下，界面上关于「正在生成」的一切就归零**——而生成并没有停
 * （它不跟着连接走了），于是他面对的是几页不动的大纲行，不知道是卡住了还是在跑、跑到哪了。
 *
 * 所以在这里登一份，随查询接口一起给出去：前端进项目时问一次，就能把
 * 「第 N 页正在写、已等 M 秒」接着显示下去。
 *
 * ## 只活一轮
 *
 * 一轮结束（或被叫停）就整份清掉。留着的话，下一轮还没推第一条进度的那几秒里，
 * 界面上会显示上一轮留下的旧话，看着像「刚刚还在写第 7 页、怎么又从头开始了」。
 *
 * ## 不做持久化
 *
 * 它描述的是「此刻有几个请求在天上」，进程一重启就什么都不剩——而那时任务也确实没了
 * （生成只发生在 API 进程内）。落库反而会留下一份永远清不掉的僵尸进度。
 */

export interface LivePage {
  /** 大纲下标 */
  index: number;
  /** 一句中文，直接给界面显示，比如「正在调用模型写这一页」 */
  label: string;
  /** 这一句话是什么时候开始说的。界面拿它算「已等 N 秒」 */
  at: number;
  /**
   * **这一页**是从什么时候开始生成的。界面拿它算揭示层画到第几块。
   *
   * 与 `at` 分开是因为两者管的事不同：`at` 是「这句文案说了多久」（换一句就刷新），
   * 而画到第几块要按「这一页跑了多久」——拿 `at` 当起点的话，每次换文案
   * 揭示层都会从头重画一遍。
   *
   * 只在**第一次**登记这一页时写，后续更新文案不动它。
   */
  startedAt: number;
}

const live = new Map<string, Map<number, LivePage>>();

/**
 * 登记一页的进度，**返回登记后的这一条**。
 *
 * 返回它而不是只写不吐：调用方（整本那条流）要把 `startedAt` 一起发给客户端，
 * 而起点是这里定的——让调用方自己再取一次时间，两边就会差出几十毫秒并向后漂。
 */
export function setLivePage(projectId: string, index: number, label: string): LivePage {
  const pages = live.get(projectId) ?? new Map<number, LivePage>();
  const now = Date.now();
  // 已经在写的那一页要保持原来的起点，只有新开的那一页才用 `now`
  const page: LivePage = { index, label, at: now, startedAt: pages.get(index)?.startedAt ?? now };
  pages.set(index, page);
  live.set(projectId, pages);
  return page;
}

export function clearLivePage(projectId: string, index: number): void {
  live.get(projectId)?.delete(index);
}

export function clearLivePages(projectId: string): void {
  live.delete(projectId);
}

/** 按大纲下标排好——界面要的是「第 3 页排在 第 4 页前面」这种稳定顺序 */
export function livePagesOf(projectId: string): LivePage[] {
  return [...(live.get(projectId)?.values() ?? [])].sort((a, b) => a.index - b.index);
}
