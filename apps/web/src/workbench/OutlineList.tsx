import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Icon, IconButton, IconTile, Input, PanelEmpty, Progress, Select, Tooltip, useToast, cn } from '@lumen/ui';
import { api } from '../api/client.js';
import type { OutlinePage, PageIR, ProjectDetail } from '../api/types.js';
import { PAGE_TYPE_ICON, PAGE_TYPE_LABEL, PAGE_TYPE_OPTIONS } from './page-types.js';
import { AUTO_SAVE_MS, useBeforeUnloadWhile } from './auto-save.js';
import { useWorkbench, type PageStatus, type PlanProgress } from './store.js';

/**
 * 一页走到哪了。**这是列表里最主要的读数**——比标题、比图标都先被看到。
 *
 * 分成五档而不是「已完成 / 没完成」两档，是因为「教案写了、页面还没生成」与
 * 「两样都没有」是**两件不同的事**：合成一档的话，跑「生成整本教案」时整列
 * 都是一个颜色，用户看不出写到哪了——那正是之前那一版的问题。
 */
type RowStage = 'empty' | 'lesson' | 'generating' | 'ready' | 'failed';

const STAGE_BAR: Record<RowStage, string> = {
  // 灰条不是「没有信息」，它让每行左边都对齐，也让「有颜色」本身成为信息
  empty: 'bg-[var(--border)]',
  lesson: 'bg-[var(--info)]',
  generating: 'bg-[var(--warning)]',
  ready: 'bg-[var(--success)]',
  failed: 'bg-[var(--error)]',
};

const STAGE_LABEL: Record<RowStage, string> = {
  empty: '还没有教案',
  lesson: '教案已写，页面待生成',
  generating: '正在生成这一页',
  ready: '已生成',
  failed: '生成失败',
};

/**
 * 页面状态与「有没有教案」合成一档。页面那边更靠后，所以优先。
 *
 * `writing` 是**服务端刚报上来的**「这一页正在调用模型」（`page-progress` 事件）。
 * 它比 `status` 准：并发跑的时候服务端只在自己写完那一刻才改页状态，中间那几十秒
 * 里 `status` 一直是 `pending`——光看它，整列灰着一片，用户分不清是在排队还是真在写。
 */
function rowStage(status: PageStatus, hasLesson: boolean, writing: boolean): RowStage {
  if (status === 'failed') return 'failed';
  if (status === 'ready') return 'ready';
  if (writing || status === 'generating') return 'generating';
  return hasLesson ? 'lesson' : 'empty';
}

/**
 * 大纲列表：拖拽排序、双击改名、状态点、插入/删除。
 *
 * 从 `LeftRail.tsx` 里提出来，因为**两个 tab 都要用它**：
 * 「页面设计」放在左栏（300px），「大纲与教案」放在右栏（304px）。
 * 它本身不带宽度、也不依赖左栏的局部状态，所以是同一份组件两处用，
 * 而不是两份长得像的代码。
 */
export function OutlineList({
  projectId, onGenerate, generating, planProgress = null, showPageTypePanel = true,
  showGenerateAction = true, onInserted,
}: {
  projectId: string;
  onGenerate: () => void;
  generating: boolean;
  /** 提纲 / 教案那一轮跑到哪了。给了就在顶部显示那条汇总 */
  planProgress?: PlanProgress | null;
  /**
   * 新增一页之后。**当前页由 `insertOutline` 自己设好**，这里给的是「加完之后还要做什么」——
   * 「页面设计」用它切到「大纲与教案」，因为加完一页的下一步一定是写它的教案。
   */
  onInserted?: () => void;
  /**
   * 底部的「选中页的页类型」面板。
   *
   * 「大纲与教案」tab 里关掉它——那边中栏的教案编辑器已经有同一个下拉，
   * 两个可见的下拉绑同一个状态只会让人犹豫该点哪个。
   */
  showPageTypePanel?: boolean;
  /**
   * 表头那颗「开始生成」。
   *
   * **「页面设计」tab 里关掉它**：那一屏顶上的状态条（`PageDesignBar`）已经把
   * 开始/继续摆在同一个视口里，而且是带进度的那一处；这里再留一颗同样的图标，
   * 两颗按钮隔 40px 做同一件事。
   */
  showGenerateAction?: boolean;
}) {
  const toast = useToast();
  const { outline, pages, statuses, activeIndex, outlineDirty, genProgress } = useWorkbench();
  const setActiveIndex = useWorkbench((s) => s.setActiveIndex);
  const moveOutline = useWorkbench((s) => s.moveOutline);
  const insertOutline = useWorkbench((s) => s.insertOutline);
  const removeOutline = useWorkbench((s) => s.removeOutline);
  const renameOutline = useWorkbench((s) => s.renameOutline);
  const changePageType = useWorkbench((s) => s.changePageType);
  const markOutlineSaved = useWorkbench((s) => s.markOutlineSaved);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  /**
   * 大纲的自动保存。改标题、改页类型、增删页、拖排序都算「改了」——
   * 原先这些改动只留在本地（`outlineDirty`），要用户自己去点那颗小保存图标，
   * 而改完之后加的页生成不出来（生成读的是服务端大纲），看起来就是「加不上」。
   */
  const qc = useQueryClient();
  const outlineEditSeq = useWorkbench((s) => s.outlineEditSeq);
  const [saveState, setSaveState] = useState<'idle' | 'pending' | 'saving' | 'error'>('idle');
  const inFlight = useRef(false);
  const flushRef = useRef<() => void>(() => {});

  const save = useMutation({
    mutationFn: (job: { next: OutlinePage[]; dropped: number }) =>
      api.put(`/projects/${projectId}/outline`, { outline: job.next }),
    onSuccess: (_res, job) => {
      inFlight.current = false;
      // 存进去了，本地这份不再是「唯一的真相」——放开 hydrate，让它重新跟服务端对齐
      markOutlineSaved();
      setSaveState('idle');
      void qc.invalidateQueries({ queryKey: ['project', projectId] });
      /**
       * **删页要当面说。**
       *
       * `saveOutline` 把 `pageIndex >= 大纲条数` 的页行当孤儿删掉，而且**不可逆**
       * （见 `generate.service.ts` 那段注释）。手动点保存时用户心里有数，
       * 自动保存是替他按的这一步——那就更得说清删了几页、为什么。
       */
      if (job.dropped > 0) {
        toast.push({
          tone: 'warning',
          title: `大纲已保存，${job.dropped} 页已删除`,
          description: '大纲决定这一本有多少页，超出新页数的页行连同内容一起删掉了；把页数改回去需要重新生成那几页。',
        });
      }
    },
    onError: (err: Error) => {
      inFlight.current = false;
      setSaveState('error');
      toast.error('大纲保存失败，改动还在本地', err.message);
    },
  });

  /**
   * 发一次大纲保存。
   *
   * 用 ref 拿它是因为「离开前冲一次」的 effect 依赖里不该带上它的身份——
   * `useMutation` 每次渲染都返回新对象，带上去那个 effect 会被反复清理+重跑。
   */
  flushRef.current = () => {
    if (inFlight.current) return;
    const s = useWorkbench.getState();
    if (!s.outlineDirty) return;
    const next = s.outline.map((o, i) => ({ ...o, index: i }));
    // 服务端会删掉超出去的行，删几页要提前算出来（存完再算，那份数据已经没了）
    const rows = qc.getQueryData<ProjectDetail>(['project', projectId])?.pages.length ?? 0;
    inFlight.current = true;
    setSaveState('saving');
    save.mutate({ next, dropped: Math.max(0, rows - next.length) });
  };

  // 手停就存。`outlineEditSeq` 只在人真的改了大纲时自增
  useEffect(() => {
    if (!outlineDirty) return;
    const t = window.setTimeout(() => flushRef.current(), AUTO_SAVE_MS);
    return () => window.clearTimeout(t);
  }, [outlineEditSeq, outlineDirty]);

  // 换项目/离开工作台前把没存的大纲冲出去
  useEffect(() => () => { flushRef.current(); }, [projectId]);

  useBeforeUnloadWhile(outlineDirty);

  const hasPages = pages.some(Boolean);

  const readyCount = statuses.filter((s) => s === 'ready').length;
  const failedCount = statuses.filter((s) => s === 'failed').length;

  /**
   * 顶部那条汇总看的是**此刻在跑的那件事**：写教案时看教案写到第几页，
   * 生成页面时看落地了几页，其余时候看已经生成了几页。
   *
   * 教案那一段只在 `total > 1` 时接管——提纲报的是 `0/1 → 1/1`，
   * 拿它当进度会一直显示 0%。
   *
   * **页面生成没有逐页的「进行中」**：服务端并发三页，`page-start` 又是落库之后才发的
   * （见 `generate-html.service.ts`），哪几页正在写它自己也不知道。所以那一档只报
   * 「落地了几页」，不假装知道在写哪一页。
   */
  const lessonRun = planProgress?.step === 'lessons' && planProgress.total > 1 ? planProgress : null;
  const landed = readyCount + failedCount;
  /**
   * 正在写的是**哪几页**。服务端那份登记是唯一说得准的来源（见 `page-progress` 的说明），
   * 所以汇总里直接把它点出来——用户报的「哪一页在生成不太清晰」，答案就在这一行。
   */
  const liveIndices = Object.keys(genProgress).map(Number).sort((a, b) => a - b);
  const liveHint = liveIndices.length === 1 ? ` · 第 ${liveIndices[0]! + 1} 页`
    : liveIndices.length > 1 ? ` · 第 ${liveIndices[0]! + 1} 页起 ${liveIndices.length} 页`
      : '';
  /**
   * 有没有活在跑。**不只看 `generating`**：那是整本的界面态，单页重生成不置它，
   * 但那时确实有一页在写——汇总里得说出来。
   */
  const running = generating || liveIndices.length > 0;
  const summary = lessonRun
    ? { text: `教案 ${lessonRun.done}/${lessonRun.total}`, value: lessonRun.done / lessonRun.total }
    : running
      ? { text: `生成中 ${landed}/${outline.length}${liveHint}`, value: outline.length > 0 ? landed / outline.length : 0 }
      : { text: `已生成 ${readyCount}/${outline.length}`, value: outline.length > 0 ? readyCount / outline.length : 0 };

  return (
    <div className="flex flex-col gap-2 pt-2">
      <div className="flex items-center gap-2 px-1">
        <span className="flex-1 text-[11px] text-[var(--text-3)]">
          共 {outline.length} 页
          {/*
            未保存要**看得见**。有它之前，本地改动会一直挡着服务端那一份（见 store 的
            `outlineDirty`），而界面上没有任何提示——用户改完不知道还得点一下保存，
            加的那一页也生成不出来（生成读的是服务端大纲）。
          */}
          {saveState === 'saving'
            ? <span className="ml-1.5 text-[var(--text-3)]">· 保存中…</span>
            : saveState === 'error'
              ? <span className="ml-1.5 text-[var(--error)]">· 保存失败，改动还在本地</span>
              : outlineDirty
                ? <span className="ml-1.5 text-[var(--warning)]">· 待保存</span>
                : null}
        </span>
        <Tooltip content={saveState === 'error' ? '重试保存大纲' : '保存大纲'}>
          <IconButton
            name="Save"
            label="保存大纲"
            size={16}
            className={saveState === 'error' ? 'text-[var(--error)]' : outlineDirty ? 'text-[var(--brand-600)]' : undefined}
            onClick={() => flushRef.current()}
          />
        </Tooltip>
        {showGenerateAction && (
          <Tooltip content={hasPages ? '按当前大纲重新生成' : '开始生成'}>
            <IconButton name="Sparkles" label="开始生成" size={16} disabled={generating} onClick={onGenerate} />
          </Tooltip>
        )}
      </div>

      {/*
        汇总条。之前只有一句「共 N 页」，跑到第几页全靠用户自己数那些小圆点。
        轨道用 `--border`：这一层底是外壳，`--surface-1` 的轨道在这上面几乎看不见。
      */}
      {outline.length > 0 && (
        <div className="flex items-center gap-2 px-1">
          <div className="min-w-0 flex-1">
            <Progress value={summary.value} trackClassName="bg-[var(--border)]" />
          </div>
          <span className="shrink-0 text-[11px] tabular-nums text-[var(--text-3)]">{summary.text}</span>
          {failedCount > 0 && (
            <span className="shrink-0 text-[11px] text-[var(--error)]">{failedCount} 页失败</span>
          )}
        </div>
      )}

      {outline.length === 0 ? (
        <PanelEmpty
          icon="ListOrdered"
          title="还没有大纲"
          description="到「大纲与教案」里写清内容与页数，把大纲和教案跑出来。"
        />
      ) : (
        <ul className="flex flex-col gap-0.5">
          {outline.map((o, i) => {
            const status = statuses[i] ?? 'pending';
            const active = i === activeIndex;
            /*
              「有没有教案」看的是视觉形式有没有字——与 `LessonEditor` 同一条判据。
              机器写的与人改的都算，这里只问「写没写」。
            */
            const hasLesson = (o.visualForm ?? '').trim() !== '';
            // 服务端刚报过这一页在写（进度事件），哪怕页状态还停在 pending
            const live = genProgress[i];
            const stage = rowStage(status, hasLesson, live !== undefined);
            // 悬停提示用服务端那一句原话（「正在调用模型写这一页」），它比档位名具体
            const stageLabel = live?.label ?? STAGE_LABEL[stage];
            return (
              <li
                key={`${i}-${o.title}`}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIndex !== null && dragIndex !== i) moveOutline(dragIndex, i);
                  setDragIndex(null);
                }}
                className={cn(
                  'group relative flex items-start gap-2.5 rounded-[var(--radius-tile)] px-2 py-2',
                  'transition-colors duration-150 ease-out',
                  /*
                    正在生成的那一行**整行染上色**，不只在左边那 4px 上。

                    一列十八行里，一根会呼吸的小竖条太容易被漏看了——用户的原话是
                    「哪一页在生成不太清晰」「看上去还有一页在生成，不知道是哪一页」。
                    整行底色 + 条子 + 一颗写着「生成中」的色块，三处同时说同一件事。
                  */
                  active ? 'bg-[var(--brand-500)]/12'
                    : stage === 'generating' ? 'bg-[var(--warning)]/14'
                      : 'hover:bg-[var(--surface-1)]',
                )}
              >
                {/*
                  左侧这条竖条是整列最主要的读数：**颜色 = 这一页走到哪了，长度 = 是不是当前选中的那一页**。
                  合成一个元素，是因为 300px 的列里再塞一条独立的选中标记，两条线会挤在一起分不清谁是谁。
                */}
                <span
                  aria-hidden="true"
                  title={stageLabel}
                  className={cn(
                    'absolute left-0 top-1/2 w-[4px] -translate-y-1/2 rounded-full',
                    'transition-[height,background-color] duration-150 ease-out',
                    active ? 'h-[calc(100%-10px)]' : 'h-6',
                    STAGE_BAR[stage],
                    // 正在写的那几格条子呼吸着：一列静止的灰里，动的那几格就是进度
                    stage === 'generating' && 'animate-pulse',
                  )}
                />

                <span className="mt-0.5 cursor-grab text-[var(--text-3)] opacity-0 transition-opacity duration-150 group-hover:opacity-100" aria-hidden="true">
                  <Icon name="GripVertical" size={16} />
                </span>

                <IconTile
                  icon={PAGE_TYPE_ICON[o.pageType] as never}
                  size={32}
                  tone={active ? 'brand' : 'neutral'}
                />

                <button
                  type="button"
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setActiveIndex(i)}
                  aria-label={`切换到第 ${i + 1} 页`}
                >
                  {editing === i ? (
                    <Input
                      autoFocus
                      value={draftTitle}
                      onChange={(e) => setDraftTitle(e.target.value)}
                      onBlur={() => {
                        renameOutline(i, draftTitle.trim() || o.title);
                        setEditing(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          renameOutline(i, draftTitle.trim() || o.title);
                          setEditing(null);
                        }
                        if (e.key === 'Escape') setEditing(null);
                      }}
                      className="h-6 text-[13px]"
                    />
                  ) : (
                    <span
                      className={cn(
                        'block truncate text-[13px] font-medium',
                        // 教案没写的那几页压暗一档：跑「生成整本教案」时，标题一页页亮起来
                        // 就是进度本身——左侧色条那时还停在灰或蓝上，看不出「写到哪了」
                        hasLesson ? 'text-[var(--text-1)]' : 'text-[var(--text-2)]',
                      )}
                      onDoubleClick={() => {
                        setEditing(i);
                        setDraftTitle(o.title);
                      }}
                    >
                      {o.title}
                    </span>
                  )}
                  <span className="mt-0.5 flex items-center gap-1.5">
                    <span className="font-[var(--font-mono)] text-[10px] tabular-nums text-[var(--text-3)]">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {/* 页类型标签。**只有图标不够**——十二个页类型的线性图标长得都差不多，
                        认不全；这一栏是「一眼看出这本讲了什么」的地方，得能读出来 */}
                    <span className="shrink-0 rounded-full border border-[var(--border-subtle)] px-1.5 text-[10px] leading-[15px] text-[var(--text-2)]">
                      {PAGE_TYPE_LABEL[o.pageType]}
                    </span>
                    {/*
                      正在生成：一颗**实心的琥珀色块**，整列里只此一处。

                      实心而不是描边，是为了在十八行里一眼扫得到——用户报的原话是
                      「看上去还有一页在生成，不知道是哪一页」。底色压深字（`--brand-fg`），
                      和主行动按钮同一个做法，琥珀底上读得清。
                    */}
                    {live !== undefined && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--warning)] px-1.5 text-[10px] font-semibold leading-[15px] text-[var(--brand-fg)]">
                        <span className="h-1 w-1 animate-pulse rounded-full bg-[var(--brand-fg)]" />
                        生成中
                      </span>
                    )}
                    {stage === 'failed' && (
                      <span className="shrink-0 rounded-full bg-[var(--error)]/18 px-1.5 text-[10px] font-medium leading-[15px] text-[var(--error)]">
                        失败
                      </span>
                    )}
                    {/*
                      生成中那一行**把那句原话摆出来**（「正在调用模型写这一页 · 已等 12 秒」），
                      不再显示 `claim`：这一刻它比这一页打算讲什么更要紧，而秒数自己会走
                      （3 秒一次的服务端进度会把 store 换一份，组件跟着重渲染）。
                    */}
                    {live !== undefined ? (
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-[var(--text-1)]">
                        {live.label} · 已等 {Math.max(0, Math.round((Date.now() - live.at) / 1000))} 秒
                      </span>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-3)]">{o.claim}</span>
                    )}
                    {/*
                      这里原来还有两个 6px 的状态点（绿=已生成、红=失败）。左侧那条竖条
                      把同一件事说得更清楚，留着只会让人以为两处在讲不同的东西。
                      失败原因挪到了竖条的 `title` 上。
                    */}
                    {/* 本页显式关掉了数字人。用线性图标而不是色点，跟生成状态区分开（PRD §5.13） */}
                    {pages[i]?.avatar.enabled && pages[i]?.avatar.mode === 'off' && (
                      <span className="shrink-0 text-[var(--text-3)]" title="本页不显示数字人">
                        <Icon name="UserRoundX" size={16} />
                      </span>
                    )}
                  </span>
                </button>

                <div className="flex shrink-0 flex-col opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                  <IconButton
                    name="Plus"
                    label="在此页后新增"
                    size={16}
                    onClick={() => {
                      insertOutline(i, { index: i + 1, pageType: 'text', claim: '新页面', title: '新页面', points: [], section: '', notes: '' });
                      onInserted?.();
                    }}
                  />
                  <IconButton
                    name="Trash2"
                    label="删除此页"
                    size={16}
                    disabled={o.pageType === 'cover' || o.pageType === 'end'}
                    onClick={() => removeOutline(i)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/*
        页类型选择器**钉在面板底部**，不跟着列表滚。

        它原先只是 `<ul>` 后面的一个普通块——页数一多（30 页的项目很常见）就落到
        滚动区最底下，要滚过全部页才看得见，等于没有。而它管的正是「当前选中这一页」，
        与列表滚到哪毫无关系，所以该常驻。

        `-mx-2.5` 抵消滚动容器的左右内边距，让这条贴满整栏宽。

        **`bottom-[-1rem]` 是为了补上滚动容器自己那 16px 的下内边距。** sticky 的约束
        止于滚动区的内容盒，所以 `bottom-0` 会停在容器 `pb-4` 的上沿——那条缝里会漏出
        下面滚过去的页面条目（实测就是这么发现的）。往下探 16px 之后，被裁掉的那 16px
        正好是这条自己的 `pb-4`（纯留白，没有内容），底边就与滚动区底边重合了。
      */}
      {showPageTypePanel && outline.length > 0 && (
        <div className="sticky bottom-[-1rem] z-10 -mx-2.5 mt-2 flex flex-col gap-2 border-t border-[var(--border-subtle)] bg-[var(--surface-0)] px-2.5 pb-4 pt-3">
          <span className="text-[12px] text-[var(--text-3)]">选中页的页类型</span>
          <Select
            ariaLabel="页类型"
            value={outline[activeIndex]?.pageType ?? 'text'}
            onValueChange={(v) => changePageType(activeIndex, v as PageIR['pageType'])}
            options={PAGE_TYPE_OPTIONS.map((p) => ({
              value: p.value,
              label: p.label,
              ...(outline[activeIndex]?.pageType === 'cover' || outline[activeIndex]?.pageType === 'end'
                ? { description: '封面与结尾页类型不可更改' }
                : {}),
            }))}
            disabled={outline[activeIndex]?.pageType === 'cover' || outline[activeIndex]?.pageType === 'end'}
          />
          <p className="text-[12px] leading-[1.5] text-[var(--text-3)]">
            双击标题可改名，拖拽可排序。改动会在保存后生效。
          </p>
        </div>
      )}
    </div>
  );
}
