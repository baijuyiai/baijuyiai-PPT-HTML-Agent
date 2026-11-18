import { create } from 'zustand';
import type { OutlinePage, PageIR, ProjectDetail, ProjectSummary } from '../api/types.js';

export type PageStatus = 'pending' | 'generating' | 'ready' | 'failed';

/**
 * 提纲 / 教案这一轮跑到哪了。
 *
 * `done` / `total` 是**服务端报的页数**（`deck-plan.service.ts` 每写完一页发一次），
 * 留着它们才画得出确定进度条——只留 `label` 的话，界面上只有一句「已写 3/9 页」，
 * 用户得自己读文字才知道走到哪了。
 */
export interface PlanProgress {
  step: 'outline' | 'lessons';
  label: string;
  done: number;
  total: number;
}

/** 这一轮是谁点的：整本（提纲+教案）还是只重写当前页 */
export type PlanScope = 'one' | 'all';

/**
 * 并发生成时某一页推到哪一步了。
 *
 * **落库要按大纲顺序，进度事件不走那条路**——卡住的那一页会把后面已完成的页
 * 全压住（服务端那圈循环的注释写了为什么），所以卡住的时候界面上唯一能看的
 * 就是它。`at` 是这一句话收到的时刻，用来算「已等 N 秒」；服务端只在文案变化时
 * 才推同一条，所以这个时刻就是「这一句是从什么时候开始说的」。
 */
export interface PageProgress {
  index: number;
  label: string;
  at: number;
  /**
   * 这一页**开始生成**的时刻，服务端给的。
   *
   * 与 `at` 分开：`at` 是「这一句文案说了多久」（换一句就刷新），这个是整页只定一次。
   * 画布上那块逐块点亮的画按它算画到第几块——拿 `at` 当起点的话，模型每换一句进度话，
   * 那一页就从头重画一遍。刷页面也靠它接上（服务端那份登记不跟着连接走）。
   */
  startedAt: number;
}

interface WorkbenchState {
  project: ProjectSummary | null;
  /** 与 outline 一一对应；null 表示该页尚未生成 */
  pages: (PageIR | null)[];
  statuses: PageStatus[];
  outline: OutlinePage[];
  activeIndex: number;
  generating: boolean;
  /**
   * 正在跑的那几页各自到哪一步了，按大纲下标存。
   *
   * 整本生成一页要跑几十秒到几分钟，客户端这边**只有它能证明「还在动」**：
   * 落库是攒着按顺序发的，卡住那页会一直压着，光看「已完成 N 页」的话
   * 那 N 会在几十分钟里纹丝不动，看着就是死了。
   */
  genProgress: Record<number, PageProgress>;
  styleId: string;
  styleName: string;
  /** 有降级标记的页数，用于顶部提示 */
  degradedPages: number;
  /**
   * 本地大纲有没有**还没保存**的改动。
   *
   * 大纲的写入口是「保存大纲」那一个按钮，所以在点它之前，本地这一份是唯一的真相：
   * 新加的页、改过的标题、换过的页类型，服务端都还不知道。
   *
   * 而 `hydrate` 原本是无条件把服务端那一份整份换上——于是「加一页 → 切去项目库看一眼
   * 再切回来」这种再普通不过的动作，就能让刚加的那一行**无声消失**（实测复现：
   * 30 页 → 点「+」→ 31 页 → 离开再回来 → 30 页）。用户看到的是「加不上」，
   * 而且此时点保存，存下去的正是那份没有新页的旧大纲，于是又变成「存了也没用」。
   *
   * 所以脏的时候 `hydrate` 不动大纲。清掉它的只有两条路：保存大纲成功，
   * 或服务端自己重写了整份大纲（生成提纲，走 `setOutline`）。
   */
  outlineDirty: boolean;
  /**
   * 页**内容**被本地改过、还没落盘的页（记 `pageId`，不是格子号）。
   *
   * 页内容有两条录入路径——右栏检查器的 `patch`、画布上拖图位的 `moveSlot`，
   * 两者最后都走 `updatePage`，所以脏名单记在这里，自动保存盯一处就够。
   *
   * **记 id 而不是下标**：左栏拖一下顺序，`moveOutline` 会把 `pages` 整段挪位，
   * 按下标记的话脏名单里那一格已经换成别的页了，自动保存会把这一页的内容存到那一页上去。
   *
   * 它同时是「本地这份比服务端新」的凭据：`hydrate` / `syncPages` 拿服务端那份
   * 整份换 `pages` 时，名单上的页要保住本地那份——生成期间的定时对账每几秒来一次，
   * 不保的话用户正在改的那一页会被服务端那份反复盖掉。
   */
  dirtyPages: string[];
  /** 每次 `updatePage` 自增。自动保存的防抖挂在它上面：只有人真的在改才重置计时 */
  editSeq: number;
  /** 同上，大纲那一路。两次改动之间没变化就不该把计时器重置掉 */
  outlineEditSeq: number;
  /** 这一页的内容确实存进服务端了，从脏名单里摘掉 */
  markPageSaved: (pageId: string) => void;

  hydrate: (detail: ProjectDetail) => void;
  /**
   * 只把「哪些页已经好了」对齐到服务端，**不动大纲、不动当前页**。
   *
   * 生成中是定时对账用的：`hydrate` 会把 `outline` 整份换成服务端那一份，
   * 用户此刻正在左栏改标题的话就被冲掉了。而对账要的只是页与状态。
   */
  syncPages: (detail: ProjectDetail) => void;
  setOutline: (outline: OutlinePage[]) => void;
  /** 保存大纲成功后调用，把「本地有未保存改动」这个标记清掉 */
  markOutlineSaved: () => void;
  setActiveIndex: (index: number) => void;
  setGenerating: (v: boolean) => void;
  /**
   * 某一页又往前推了一步。同一页新的一句会把旧的换掉，`at` 跟着刷新。
   *
   * `startedAt` 由服务端给（进度事件与 `/generate/progress` 都带着）；不给就沿用
   * 这一页已有的那个，都没有才取当下——**换文案时绝不许刷新起点**。
   */
  setPageProgress: (index: number, label: string, startedAt?: number) => void;
  /**
   * **刚挑、还没生成完**的那份排版骨架，按 `pageId` 记。
   *
   * 挑骨架是「点一下就重排这一页」——状态条上那条生成动画要在**这一次**就画出那份骨架，
   * 而骨架 id 要等这一页生成完才落库（`page.studioLayoutId`）。中间那几十秒里
   * 页面这一份还是空的，动画就会退回去画风格样机——用户刚点的正是骨架，画面上却是别的，
   * 那一下最容易被当成「点了没反应」。
   *
   * 所以挑的那一刻先记在这儿：`CenterCanvas` 取「页面上的骨架 id，没有就用这份待定的」。
   * 这一页生成完（拿到服务端那一份）或这一轮结束时清掉，之后以页面上的为准。
   */
  pendingLayouts: Record<string, string>;
  setPendingLayout: (pageId: string, layoutId: string) => void;
  clearPendingLayout: (pageId: string) => void;
  /**
   * 用服务端那份登记**整份换掉**本地的逐页进度。
   *
   * 为什么是「换掉」而不是「逐条合并」：服务端那份就是这个项目此刻**全部**在写的页，
   * 换掉之后自然会把已经不在写的那几页清干净——合并的话，一条丢掉的 `page-ready`
   * 就能让某一格永远停在「正在写第 N 页」。
   *
   * 它与 `setPageProgress`（SSE 逐条推）写的是同一份数据，两条来源对着同一份服务端真相，
   * 所以谁先谁后都不会打架。
   */
  syncLiveProgress: (pages: { index: number; label: string; startedAt?: number }[]) => void;
  clearProgress: () => void;
  setStyleInfo: (styleId: string, styleName: string) => void;
  upsertPage: (index: number, page: PageIR | null, status: PageStatus) => void;
  updatePage: (index: number, patch: Partial<PageIR>) => void;
  moveOutline: (from: number, to: number) => void;
  insertOutline: (afterIndex: number, page: OutlinePage) => void;
  removeOutline: (index: number) => void;
  renameOutline: (index: number, title: string) => void;
  changePageType: (index: number, pageType: PageIR['pageType']) => void;
  /** 改教案的字段。会打上人工痕迹，重跑提纲时不再被覆盖 */
  patchOutline: (index: number, patch: Partial<OutlinePage>) => void;
  /** 模型写好的教案落回这一页。**不打人工痕迹**——那是机器写的，不是人改的 */
  applyLesson: (index: number, page: OutlinePage) => void;
  progressText: (readyCount: number) => string;
}

/**
 * 走了降级路径的页数。
 *
 * **`failed` 的不算**：它们也有 `degradeReason`（那是失败原因），但已经由顶栏的
 * 「N 页降级」讲的是另一件事——排出来了但少了东西。混在一起会让十页失败显示成
 * 「十页降级」，看着像全都生成出来了。
 */
const degradedOf = (pages: (PageIR | null)[]): number =>
  pages.filter((p) => p?.degradeReason && p.status !== 'failed').length;

/** 把服务端详情摆成「一节大纲对应一格页」的两个数组。`hydrate` 与 `syncPages` 共用 */
function pageSlots(detail: ProjectDetail): { pages: (PageIR | null)[]; statuses: PageStatus[] } {
  const pages: (PageIR | null)[] = (detail.outline ?? []).map(() => null);
  const statuses: PageStatus[] = (detail.outline ?? []).map(() => 'pending');
  for (const entry of detail.pages) {
    const i = entry.pageIndex;
    if (i < 0) continue;
    /**
     * **页数由大纲定**，超出去的行不算。
     *
     * 原先这里是「服务端页数多于大纲时按实际页补齐，避免丢页」。那条本意是好的，
     * 但它让「页数改小」看起来没生效：大纲缩到 20 页了，库里还留着第 21~30 页那些行，
     * 界面照旧显示 30 页。实测这个项目就是大纲 30 页、库里 31 行——顶栏写「31 页已就绪」、
     * 大纲列表写「共 30 页」，两个数字对不上。
     *
     * 孤儿行由服务端在写大纲时删掉（见 `saveOutline`），这里只是不再替它们兜底。
     */
    if (i >= pages.length) continue;
    pages[i] = entry.page;
    statuses[i] = entry.status;
  }
  return { pages, statuses };
}

/**
 * 服务端那份 `pages` 换上之前，先把本地改过还没落盘的页换回来。
 *
 * 生成期间是每几秒对一次账的（`syncPages`），而用户这时候很可能正在改某一页的文字。
 * 不护住的话，那一页会在下一次对账时被服务端那份无声盖掉——用户看到的是
 * 「打着字突然跳回去了」，而且自动保存还没来得及把本地那份发出去。
 *
 * 按 `pageId` 找位置而不是按下标：中间可能刚发生过一次排序。
 */
function keepDirtyLocal(
  fromServer: (PageIR | null)[],
  local: (PageIR | null)[],
  dirtyPages: string[],
): (PageIR | null)[] {
  if (dirtyPages.length === 0) return fromServer;
  const mine = new Map<string, PageIR>();
  for (const p of local) if (p && dirtyPages.includes(p.pageId)) mine.set(p.pageId, p);
  if (mine.size === 0) return fromServer;
  return fromServer.map((p) => (p && mine.has(p.pageId) ? mine.get(p.pageId)! : p));
}

/**
 * 脏名单里可能有已经不在页面里的页——大纲一保存，`pageIndex >= 大纲条数` 的页行会被服务端删掉，
 * 而本地那份脏名单还记着它们。留着的话自动保存会一直往一个不存在的页面发请求、永远 404。
 */
function pruneDirty(dirtyPages: string[], pages: (PageIR | null)[]): string[] {
  if (dirtyPages.length === 0) return dirtyPages;
  const alive = new Set(pages.map((p) => p?.pageId).filter(Boolean));
  const kept = dirtyPages.filter((id) => alive.has(id));
  return kept.length === dirtyPages.length ? dirtyPages : kept;
}

export const useWorkbench = create<WorkbenchState>((set, get) => ({
  project: null,
  pages: [],
  statuses: [],
  outline: [],
  activeIndex: 0,
  generating: false,
  genProgress: {},
  pendingLayouts: {},
  styleId: '',
  styleName: '',
  degradedPages: 0,
  outlineDirty: false,
  dirtyPages: [],
  editSeq: 0,
  outlineEditSeq: 0,

  hydrate(detail) {
    const outline = detail.outline ?? [];
    const { pages: serverPages, statuses } = pageSlots(detail);
    const pages = keepDirtyLocal(serverPages, get().pages, get().dirtyPages);
    /**
     * 本地有未保存的大纲改动时，**只刷新项目与风格这两块元信息**。
     *
     * 大纲连同按它排出来的 `pages` / `statuses` 一律不动——服务端那份里没有用户刚加的那一页，
     * 换上就等于把人的改动抹掉。生成过程中的页状态由 `syncPages` 那条对账负责，
     * 不靠这里。
     */
    if (get().outlineDirty) {
      set({
        project: detail.project,
        styleId: detail.project.styleId ?? detail.style?.styleId ?? '',
        styleName: detail.style?.name ?? '',
      });
      return;
    }
    set({
      project: detail.project,
      outline,
      pages,
      statuses,
      // 以项目行上的 ref 为准：它对两条链路都成立，而 `style` 那块在风格取不到时是 null
      styleId: detail.project.styleId ?? detail.style?.styleId ?? '',
      styleName: detail.style?.name ?? '',
      degradedPages: degradedOf(pages),
      activeIndex: Math.min(get().activeIndex, Math.max(pages.length - 1, 0)),
      dirtyPages: pruneDirty(get().dirtyPages, pages),
    });
  },

  syncPages(detail) {
    const { pages: serverPages, statuses } = pageSlots(detail);
    const pages = keepDirtyLocal(serverPages, get().pages, get().dirtyPages);
    set({ pages, statuses, degradedPages: degradedOf(pages), dirtyPages: pruneDirty(get().dirtyPages, pages) });
  },

  setOutline: (outline) => set((s) => {
    const pages = outline.map((_, i) => s.pages[i] ?? null);
    const statuses = outline.map((_, i) => s.statuses[i] ?? 'pending');
    // 服务端刚重写了整份大纲（生成提纲那条流），本地那份已经没有意义，脏标记跟着清掉
    // 页内容同理：格子重新按新大纲排过，旧的脏名单已经对不上号了
    return { outline, pages, statuses, outlineDirty: false, dirtyPages: [] };
  }),

  markOutlineSaved: () => set({ outlineDirty: false }),

  setActiveIndex: (index) => set((s) => ({
    activeIndex: Math.max(0, Math.min(index, Math.max(s.pages.length - 1, 0))),
  })),

  /**
   * 收尾时把进度一并清掉。
   *
   * 留在那儿的话，下次生成开始的头几秒（新首页的进度还没到）界面会显示上一轮
   * 留下的旧文案，看着像「刚刚还在写第 7 页，怎么又从头开始了」。
   */
  setGenerating: (v) => set(v ? { generating: v } : { generating: v, genProgress: {} }),

  setPendingLayout: (pageId, layoutId) => set((s) => ({
    pendingLayouts: { ...s.pendingLayouts, [pageId]: layoutId },
  })),

  clearPendingLayout: (pageId) => set((s) => {
    if (!(pageId in s.pendingLayouts)) return s;
    const next = { ...s.pendingLayouts };
    delete next[pageId];
    return { pendingLayouts: next };
  }),

  setPageProgress: (index, label, startedAt) => set((s) => ({
    genProgress: {
      ...s.genProgress,
      [index]: {
        index,
        label,
        at: Date.now(),
        // 起点只定一次：同一页换一句进度文案时保住它，否则揭示层会从头重画
        startedAt: startedAt ?? s.genProgress[index]?.startedAt ?? Date.now(),
      },
    },
  })),

  syncLiveProgress: (pages) => set((s) => {
    const now = Date.now();
    const next: Record<number, PageProgress> = {};
    for (const p of pages) {
      const prev = s.genProgress[p.index];
      next[p.index] = {
        index: p.index,
        label: p.label,
        // 同一句话还是从上一刻算起，换了文案才从此刻算起
        at: prev && prev.label === p.label ? prev.at : now,
        startedAt: p.startedAt ?? prev?.startedAt ?? now,
      };
    }
    return { genProgress: next };
  }),

  clearProgress: () => set((s) => ({
    pages: s.outline.map(() => null),
    statuses: s.outline.map(() => 'pending' as PageStatus),
    dirtyPages: [],
    genProgress: {},
  })),

  setStyleInfo: (styleId, styleName) => set({ styleId, styleName }),

  upsertPage: (index, page, status) => set((s) => {
    const pages = [...s.pages];
    const statuses = [...s.statuses];
    while (pages.length <= index) {
      pages.push(null);
      statuses.push('pending');
    }
    pages[index] = page ?? pages[index] ?? null;
    statuses[index] = status;
    // 这一页有结果了（成或败），它那一行「正在调用模型」就没有意义了
    const genProgress = { ...s.genProgress };
    delete genProgress[index];
    return {
      pages,
      statuses,
      genProgress,
      degradedPages: degradedOf(pages),
      // 服务端刚把这一页换掉了，本地那份不再是「更新的」——留着脏标记只会把旧内容再发回去
      dirtyPages: page ? s.dirtyPages.filter((id) => id !== page.pageId) : s.dirtyPages,
    };
  }),

  updatePage: (index, patch) => set((s) => {
    const current = s.pages[index];
    if (!current) return {};
    const pages = [...s.pages];
    const next = { ...current, ...patch } as PageIR;
    pages[index] = next;
    return {
      pages,
      degradedPages: degradedOf(pages),
      dirtyPages: s.dirtyPages.includes(next.pageId) ? s.dirtyPages : [...s.dirtyPages, next.pageId],
      editSeq: s.editSeq + 1,
    };
  }),

  markPageSaved: (pageId) => set((s) => ({ dirtyPages: s.dirtyPages.filter((id) => id !== pageId) })),

  moveOutline: (from, to) => set((s) => {
    if (from === to || from < 0 || to < 0 || from >= s.outline.length || to >= s.outline.length) return {};
    const outline = [...s.outline];
    const pages = [...s.pages];
    const statuses = [...s.statuses];
    const [o] = outline.splice(from, 1);
    const [p] = pages.splice(from, 1);
    const [st] = statuses.splice(from, 1);
    outline.splice(to, 0, o!);
    pages.splice(to, 0, p!);
    statuses.splice(to, 0, st!);
    return {
      outline: outline.map((x, i) => ({ ...x, index: i })),
      pages,
      statuses,
      activeIndex: to,
      outlineDirty: true,
      // 自动保存的防抖挂在这上面：只有人真的改了大纲才重置计时
      outlineEditSeq: s.outlineEditSeq + 1,
    };
  }),

  insertOutline: (afterIndex, page) => set((s) => {
    const at = Math.min(afterIndex + 1, s.outline.length);
    const outline = [...s.outline];
    const pages = [...s.pages];
    const statuses = [...s.statuses];
    outline.splice(at, 0, { ...page, index: at });
    pages.splice(at, 0, null);
    statuses.splice(at, 0, 'pending');
    return {
      outline: outline.map((x, i) => ({ ...x, index: i })),
      pages,
      statuses,
      activeIndex: at,
      outlineDirty: true,
      // 自动保存的防抖挂在这上面：只有人真的改了大纲才重置计时
      outlineEditSeq: s.outlineEditSeq + 1,
    };
  }),

  removeOutline: (index) => set((s) => {
    const target = s.outline[index];
    // 封面与结尾不可删
    if (!target || target.pageType === 'cover' || target.pageType === 'end') return {};
    const outline = s.outline.filter((_, i) => i !== index);
    const pages = s.pages.filter((_, i) => i !== index);
    const statuses = s.statuses.filter((_, i) => i !== index);
    return {
      outline: outline.map((x, i) => ({ ...x, index: i })),
      pages,
      statuses,
      activeIndex: Math.max(0, Math.min(index, outline.length - 1)),
      outlineDirty: true,
      // 自动保存的防抖挂在这上面：只有人真的改了大纲才重置计时
      outlineEditSeq: s.outlineEditSeq + 1,
    };
  }),

  renameOutline: (index, title) => set((s) => {
    // 改名也是人改的：打上痕迹，重跑提纲时才不会被模型重写的措辞盖掉
    const current = s.outline[index];
    if (!current || current.title === title) return {};
    return {
      outline: s.outline.map((o, i) => (i === index ? { ...o, title, edited: true } : o)),
      pages: s.pages.map((p, i) => (i === index && p ? { ...p, title: { ...p.title, main: title } } : p)),
      outlineDirty: true,
      // 自动保存的防抖挂在这上面：只有人真的改了大纲才重置计时
      outlineEditSeq: s.outlineEditSeq + 1,
    };
  }),

  /**
   * 改教案的字段。
   *
   * **真的变了才算「人改过」。** 教案编辑器里「要点」那一栏是失焦才提交的——
   * 点进去再点出来、一个字没动，也会走到这里。无条件标 `edited` 的话，
   * 光把五个字段各点一遍就能把这一页标成「人改过」，而标记是**粘性**的：
   * 标上之后「生成提纲」不再重写它的措辞（「生成整本教案」现在会覆盖，不受影响）。
   */
  patchOutline: (index, patch) => set((s) => {
    const current = s.outline[index];
    if (!current) return {};
    const changed = (Object.keys(patch) as (keyof OutlinePage)[])
      .some((k) => JSON.stringify(current[k]) !== JSON.stringify(patch[k]));
    if (!changed) return {};
    return {
      outline: s.outline.map((o, i) => (i === index ? { ...o, ...patch, edited: true } : o)),
      outlineDirty: true,
      // 自动保存的防抖挂在这上面：只有人真的改了大纲才重置计时
      outlineEditSeq: s.outlineEditSeq + 1,
    };
  }),

  applyLesson: (index, page) => set((s) => ({
    outline: s.outline.map((o, i) => (i === index ? page : o)),
  })),

  changePageType: (index, pageType) => set((s) => {
    const target = s.outline[index];
    // 封面与结尾改不了。**没改动就不该标脏**——否则点一下下拉框的当前项也会把大纲冻住
    if (!target || target.pageType === 'cover' || target.pageType === 'end' || target.pageType === pageType) return {};
    return {
      outline: s.outline.map((o, i) => (i === index ? { ...o, pageType } : o)),
      outlineDirty: true,
      // 自动保存的防抖挂在这上面：只有人真的改了大纲才重置计时
      outlineEditSeq: s.outlineEditSeq + 1,
    };
  }),

  progressText(readyCount) {
    const total = get().pages.length;
    if (total === 0) return '还没有页面';
    if (readyCount === total) return `${total} 页已就绪`;
    return `已就绪 ${readyCount}/${total}`;
  },
}));
