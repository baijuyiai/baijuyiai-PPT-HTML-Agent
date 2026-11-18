import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Badge, Button, Dialog, Field, Icon, IconButton, IconTile, Input, PanelEmpty, Select, StatusPill,
  Switch, Tabs, TabPanel, Textarea, useToast,
} from '@lumen/ui';
import { cn } from '@lumen/ui';
import { api, SseConnectError, streamSse } from '../api/client.js';
import { AUTO_SAVE_MS, useBeforeUnloadWhile } from './auto-save.js';
import {
  MOTION_PINNED, imageOverridesOf, imageSlotCount, imageSlotsOf,
  moduleOfPageType,
  type ImageSlot, type ImageSlotOverride, type MotionName,
} from '@lumen/ir-schema';
import {
  STOCK_CATEGORY_LABEL, STOCK_CATEGORY_ORDER, STOCK_PHOTOS, sortStockPhotos, stockCategoryOf, stockImageOf,
  stockImagesFor, stockPaletteOf, type StockCategory,
} from '@lumen/stock-library';
import { NEW_CHAIN_MOTION_WHITELIST, isMotionPinned } from '@lumen/motion';
import type { PageIR, StylePack, TaskSummary } from '../api/types.js';
import { AVATAR_PRESETS, avatarSrcFor } from '@lumen/slides';
import { useStyleDoc } from '../api/hooks.js';
import { applyTextRuns, textBlocksOf, textRunsOf, type TextBlock } from '@lumen/ir-schema';
import { textNodesOf, type CanvasSelection } from './CanvasTextHandles.js';
import { LayoutPickerDialog } from './LayoutPickerDialog.js';
import { useElapsed } from './use-elapsed.js';
import { useWorkbench } from './store.js';

const TABS = [
  { value: 'text', label: '文字', icon: 'Type' as const },
  { value: 'media', label: '图片', icon: 'Image' as const },
  { value: 'data', label: '数据', icon: 'ChartColumn' as const },
  { value: 'motion', label: '动效', icon: 'Wand2' as const },
  { value: 'script', label: '讲稿', icon: 'Mic' as const },
  { value: 'avatar', label: '数字人', icon: 'UserRound' as const },
];

export function RightRail({
  pack, theme, projectId, onRegenerate, regenerating, regenProgress, selection, frameRef,
}: {
  pack: StylePack | null;
  theme: 'light' | 'dark';
  projectId: string;
  /** 画布上选中的那一处。右栏据此切 tab 并滚到对应那一条 */
  selection: CanvasSelection;
  /** 画布那个 iframe。文字面板敲字时往它里面即时写，让画布跟着变 */
  frameRef: React.RefObject<HTMLIFrameElement | null>;
  /**
   * 重跑这一页。带 `layoutId` 就是「按这份骨架重排」——见 `LayoutPickerDialog`。
   * `nextPageType` 是顺带把这一页的页类型改掉（「转成图文页」），由服务端落进大纲。
   */
  onRegenerate: (layoutId?: string, nextPageType?: string) => void;
  regenerating: boolean;
  /** 正在重跑的那一页走到哪一步、已经等了多少秒。不是这一页时为 null */
  regenProgress: { pageId: string; label: string; elapsed: number } | null;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const { pages, activeIndex, statuses, outline } = useWorkbench();
  const updatePage = useWorkbench((s) => s.updatePage);
  const changePageType = useWorkbench((s) => s.changePageType);
  const markOutlineSaved = useWorkbench((s) => s.markOutlineSaved);
  /**
   * 项目用的那套风格。换排版的缩略样机要用它的配色与字体——骨架只用 CSS 变量取色，
   * 所以任何一套都渲得出来，但配图是按色板挑的，不传就是一格一格的空图位。
   */
  const styleId = useWorkbench((s) => s.styleId);
  const styleDoc = useStyleDoc(styleId || null);
  const page = pages[activeIndex] ?? null;
  const status = statuses[activeIndex] ?? 'pending';
  /**
   * 这一页**接下来会按哪个页类型重生成**。取大纲，不取页面 IR 里的 `page.pageType`。
   *
   * 重生成读的是 `meta.outline[row.pageIndex].pageType`（见 `regeneratePageHtmlInner`），
   * 所以大纲才是真值。IR 里那个是**上一次生成时的**页类型：用户把转折页改成人物页之后、
   * 重新生成之前，两者并不一致。拿 IR 那个来判「要不要给换排版入口」，会出现
   * 「刚把类型改成人物页，右栏却还是不给入口」——而用户这时候正想换排版。
   */
  const plannedType = outline[activeIndex]?.pageType ?? page?.pageType ?? '';

  /**
   * 这一次是不是「转成图文页」。
   *
   * **判据是画布上这一页是不是文字页**（`page.pageType`），外加「大纲那边没有别的
   * 版式库可挑」。两个来源缺一不可：
   *
   * - 只看大纲：实测一个项目里第 5 页画布上是文字页、大纲却写着「数字页」（改过页
   *   类型但没重新生成），按大纲判右栏就不给入口——而用户正对着那页文字想转。
   * - 只看页面：刚在大纲里把类型改成人物页时页面还没重生成，按页面判会让入口消失，
   *   而用户这时候正想换排版。
   */
  const toImageText = (page?.pageType === 'text' || plannedType === 'text')
    && moduleOfPageType(plannedType) === null;

  /** 版式库认的页类型。转换时借图文页的库，其余看大纲 */
  const libraryType = toImageText ? 'imageText' : plannedType;
  const thisRegen = page && regenProgress?.pageId === page.pageId ? regenProgress : null;
  /** 失败用错误色、其余降级用警告色，下面那两条提示共用 */
  const tone = status === 'failed' ? 'var(--error)' : 'var(--warning)';
  const [tab, setTab] = useState('text');
  /**
   * 自动保存的状态：idle 干净 / pending 改过还没存 / saving 正在存 / error 存失败了。
   *
   * 「改完忘了按保存、一刷新全没了」实测报过好几次，而保存按钮就在这一栏底下——
   * 用户改的是画布上的字，眼睛在左边，根本不会去看右边那个按钮。所以改成自动存：
   * 停手 `AUTO_SAVE_MS` 存一次，切页/离开时立刻冲一次，存不上就明说、不静默吞掉。
   *
   * 脏名单在 store 里（`dirtyPages`），所以画布上拖图位那一路（`CenterCanvas` 直接调
   * `updatePage`）也一并覆盖到，不必两处各写一套。
   */
  const [saveState, setSaveState] = useState<'idle' | 'pending' | 'saving' | 'error'>('idle');
  const dirtyPages = useWorkbench((s) => s.dirtyPages);
  const editSeq = useWorkbench((s) => s.editSeq);
  const isDirty = !!page && dirtyPages.includes(page.pageId);
  /** 正在飞的那几页，别重复发同一个请求 */
  const inFlight = useRef<Set<string>>(new Set());
  /**
   * 发一次保存。用 ref 拿它有两个原因：一是在 `save` 的 `onSuccess` 里要用到它自己
   * （存不完要再排一次），二是几处 effect 的依赖里不该带上它的身份——
   * `useMutation` 每次渲染都返回新对象，带上去计时器会被反复重置，自动保存就永远不来。
   */
  const flushRef = useRef<(pageId?: string) => void>(() => {});

  /**
   * 画布上点了什么，就切到管它的那个面板。
   *
   * 只管**切 tab**，滚到具体那一条由各面板自己按 `selection` 做——
   * 面板的列表是它自己的，从外面滚不准。
   */
  useEffect(() => {
    if (!selection) return;
    setTab(selection.kind === 'text' ? 'text' : 'media');
  }, [selection]);
  /** 换排版弹窗开着没有。挑完由 `onRegenerate(layoutId)` 触发重排，重排期间 `regenerating` 为真 */
  const [pickingLayout, setPickingLayout] = useState(false);

  const save = useMutation({
    mutationFn: (job: { page: PageIR; index: number }) =>
      api.put(`/pages/${job.page.pageId}`, { page: job.page, pageIndex: job.index }),
    onSuccess: (_res, job) => {
      inFlight.current.delete(job.page.pageId);
      const now = useWorkbench.getState();
      const cur = now.pages[job.index];
      // 存的过程中又改了这一页（内容对不上了）→ 别摘脏标记，稍后再来一次
      if (cur && cur.pageId === job.page.pageId && JSON.stringify(cur) === JSON.stringify(job.page)) {
        now.markPageSaved(job.page.pageId);
      } else {
        window.setTimeout(() => flushRef.current(job.page.pageId), AUTO_SAVE_MS);
      }
      const s = useWorkbench.getState();
      setSaveState(s.dirtyPages.length > 0 ? 'pending' : 'idle');
      void qc.invalidateQueries({ queryKey: ['project', projectId] });
    },
    onError: (err: Error, job) => {
      inFlight.current.delete(job.page.pageId);
      setSaveState('error');
      // 不许静默：存不上要当面说清，而且改动还在本地（脏标记没摘）
      toast.error('保存失败，改动还在本地', err.message);
    },
  });

  /**
   * 把某一页发出去。不传 `pageId` 就是当前页。
   *
   * 一律按 `pageId` 定位而不是按下标：切页、拖排序之后下标就变了，只有 id 是稳的。
   * 而且发送前才从 store 现读一份，所以发出去的永远是**最新**的内容。
   */
  flushRef.current = (pageId?: string) => {
    const s = useWorkbench.getState();
    const index = pageId ? s.pages.findIndex((p) => p?.pageId === pageId) : s.activeIndex;
    const target = s.pages[index];
    if (!target || inFlight.current.has(target.pageId)) return;
    inFlight.current.add(target.pageId);
    setSaveState('saving');
    save.mutate({ page: target, index });
  };

  // 手停就存。`editSeq` 只在人真的改了东西时自增，对账拿回来的新数据不会重置计时
  useEffect(() => {
    if (!isDirty || thisRegen) return;
    const t = window.setTimeout(() => flushRef.current(page?.pageId), AUTO_SAVE_MS);
    return () => window.clearTimeout(t);
  }, [editSeq, isDirty, thisRegen, page?.pageId]);

  /**
   * 切页 / 离开工作台前，把还没落盘的**全部**冲出去。
   *
   * 防抖还没到点就切走的话，那一页的改动会跟着组件一起没——这也是原先那个
   * 「切页时 `setDirty(false)`」的老毛病：改完不点保存就切走，改动直接消失。
   */
  useEffect(() => () => {
    for (const id of useWorkbench.getState().dirtyPages) flushRef.current(id);
  }, [page?.pageId]);

  // 还没落盘就关标签或刷新，让浏览器拦一下
  useBeforeUnloadWhile(dirtyPages.length > 0);

  const patch = useMemo(
    () => (p: Partial<PageIR>) => {
      // 脏标记由 store 的 `updatePage` 统一打——画布那条路不走这里，两处不能各记各的
      updatePage(activeIndex, p);
    },
    [activeIndex, updatePage],
  );

  if (!page) {
    return (
      <aside className="flex w-[304px] shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--surface-0)]">
        <PanelEmpty
          icon="SquarePen"
          title="选中一页开始编辑"
          description="在左边点一页，这里会变成它的检查器：文字、图片、指标、图表、动效、讲稿与数字人。"
        />
      </aside>
    );
  }

  return (
    <aside className="flex w-[304px] shrink-0 flex-col border-l border-[var(--border-subtle)] bg-[var(--surface-0)]">
      {/* 检查器头部：当前页名 + 状态。六类设置挤在下面一条图标行里，名称走 title 提示 */}
      <header className="flex h-11 shrink-0 items-center gap-2 px-3">
        <IconTile icon={PAGE_ICON[page.pageType] ?? 'Square'} size={28} tone="brand" />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-semibold text-[var(--text-1)]">{page.title.main || '未命名页'}</span>
          <span className="truncate font-[var(--font-mono)] text-[10px] text-[var(--text-3)]">{page.layoutVariant}</span>
        </div>
        {status === 'failed' && <StatusPill tone="error">失败</StatusPill>}
        {status === 'pending' && <StatusPill tone="neutral">未生成</StatusPill>}
        {/*
          换排版。**每一页都有这个入口。**

          原先只对有版式库的三个页类型显示（人物页、图文页、图片排版页），其余八个
          连按钮都不给——理由是「没有骨架可挑，摆一个点了没反应的按钮不如不摆」。
          但用户要的恰恰相反：这一页的类型没有专属库时，**把四个库整个端出来让他挑**。
          版面本来由风格提示词决定，不等于不能换一种排法试试。

          **文字页仍是个特例**：它借的是图文页那个库（`toImageText`），按钮也就直说
          「转成图文页」。文字页自己没有库，而「把一页纯文字排成图文页」是常见诉求，
          此前用户得先改页类型、再存大纲、再重生成——三步，且第一步改完画布毫无反应
          （实测库里 68 页有 27 页的大纲页类型与页面页类型对不上，就是这么来的）。
          这里给它一个入口一步做完。

          原先这里还有一条「到风格库看这一页的样机」，按口径删掉了：风格库是设计资产的
          管理页，在项目里干活的人不该被引出去。
        */}
        <Button
          size="sm"
          pill
          variant="ghost"
          icon="LayoutGrid"
          onClick={() => setPickingLayout(true)}
        >
          {toImageText ? '转成图文页' : '换排版'}
        </Button>
      </header>

      {/*
        换排版。挑完直接触发这一页重排——**关掉弹窗再跑**，让用户回到画布上看结果，
        而不是对着一个盖住画布的进度条。进度显示在画布与工具栏上（`regenProgress`）。

        `pageType` 传 `'text'` 而不是换算好的 `libraryType`：弹窗内部自己会把它换算成
        图文页（`libraryPageTypeOf`），换算过的那一份还决定它的标题写「换排版」还是
        「转成图文页」——这里直接给 'imageText' 会让它以为自己只是在换排版。
      */}
      <LayoutPickerDialog
        open={pickingLayout}
        onOpenChange={setPickingLayout}
        pageType={toImageText ? 'text' : plannedType}
        doc={styleDoc.data}
        busy={regenerating}
        onPick={(layout) => {
          setPickingLayout(false);
          if (!toImageText) {
            onRegenerate(layout.id);
            return;
          }
          /**
           * 转成图文页：页类型交给**重排那一条请求**去改（`?pageType=`）。
           *
           * 这里**不能**自己调 `PUT /outline`：那个端点写完会删掉
           * `pageIndex >= outline.length` 的页行，而转换不该删任何页。实测踩过——
           * 一个 13 页的项目（大纲 8 条）当场被删到 6 页，不可逆。
           *
           * 本地这一份也改一下，列表立刻显示「图文页」；服务端在同一个请求里落库，
           * 所以顺手清掉脏标记，否则会一直挂着「有改动未保存」。
           */
          changePageType(activeIndex, libraryType as PageIR['pageType']);
          markOutlineSaved();
          onRegenerate(layout.id, libraryType);
        }}
      />

      {/*
        没生成出来的**原因**直接摆在面板顶上。
        只在 toast 里报一下就没了是不够的：一条流里可能连着失败十页，用户回头想
        「为什么没跑出来」时，界面上除了一颗红点什么都没有——而那十页每一页的原因
        其实都落在 IR 里（`degradeReason`），白存着没地方显示。
      */}
      {page.degradeReason && (
        <div
          className="mx-2.5 mb-2 shrink-0 rounded-[var(--radius-control)] border px-2.5 py-2"
          style={{
            borderColor: tone,
            background: `color-mix(in srgb, ${tone} 9%, transparent)`,
          }}
        >
          <p className="text-[11px] font-medium" style={{ color: tone }}>
            {status === 'failed' ? '这一页没生成出来' : '这一页走了降级'}
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--text-3)]">{page.degradeReason}</p>
        </div>
      )}

      {/*
        面板必须是 Tabs 的 children。写成同级的条件渲染虽然也能显示，
        但 Radix 拿不到 tab 与 panel 的对应关系，键盘左右键切页签、读屏播报都失效。
      */}
      <Tabs
        value={tab}
        onValueChange={setTab}
        items={TABS}
        variant="grid"
        columns={6}
        iconOnly
        className="flex min-h-0 flex-1 flex-col"
        listClassName="mx-2.5 mb-1.5"
      >
        <div className="min-h-0 flex-1 overflow-y-auto lumen-scroll">
          {/*
            与「图片」tab 同一个口径：新链路（这一页有 HTML）列的是**页面里真实的文字**，
            旧链路才回落到 IR 字段——旧链路里 IR 就是真值，改它确实会变。
          */}
          <TabPanel value="text" className="pt-0">
            {page.html.trim().length > 0
              ? (
                <PageTextPanel
                  page={page}
                  patch={patch}
                  selectedRun={selection?.kind === 'text' ? selection.i : null}
                  frameRef={frameRef}
                />
              )
              : <TextPanel page={page} patch={patch} />}
          </TabPanel>
          {/*
            两条链路各有一个面板，**在这里分流而不是在 MediaPanel 里早退**：
            在组件内部早退会跳过它自己的 hooks，而 `page.html` 会因为「重新生成本页」
            在两次渲染之间变化，hook 顺序随之改变，React 会直接报错。
          */}
          <TabPanel value="media" className="pt-0">
            {page.html.trim().length > 0
              ? (
                <HtmlImagePanel
                  page={page}
                  patch={patch}
                  selectedSlot={selection?.kind === 'image' ? selection.i : null}
                />
              )
              : <MediaPanel page={page} patch={patch} onRegenerate={onRegenerate} regenerating={regenerating} />}
          </TabPanel>
          <TabPanel value="data" className="pt-0"><DataPanel page={page} patch={patch} /></TabPanel>
          <TabPanel value="motion" className="pt-0"><MotionPanel page={page} patch={patch} pack={pack} /></TabPanel>
          <TabPanel value="script" className="pt-0"><ScriptPanel page={page} patch={patch} projectId={projectId} /></TabPanel>
          <TabPanel value="avatar" className="pt-0"><AvatarPanel page={page} patch={patch} /></TabPanel>
        </div>
      </Tabs>

      {/*
        重跑时**另起一行**放进度。挤在同一行里会把这行撑成三行、把「保存本页」顶出面板
        （实测截图：304px 宽的面板装不下「正在调用模型写这一页（已等 5 秒）」+ 两个按钮）。
      */}
      <footer
        className={cn(
          'flex shrink-0 border-t border-[var(--border-subtle)] p-2.5',
          thisRegen ? 'flex-col items-stretch gap-1.5' : 'items-center gap-2',
        )}
      >
        {/*
          「已等 N 秒」要和按钮上的转圈一起出现。一页要跑几十秒到几分钟，
          光转圈看不出是慢还是卡死——这条反馈原话就是「转圈很久没结果」
        */}
        <span
          className={cn(
            'text-[11px]',
            saveState === 'error' ? 'text-[var(--error)]' : 'text-[var(--text-3)]',
            thisRegen ? 'truncate' : 'flex-1',
          )}
        >
          {thisRegen
            ? `${thisRegen.label}（已等 ${thisRegen.elapsed} 秒）`
            : saveState === 'saving' ? '保存中…'
              : saveState === 'error' ? '保存失败，改动还在本地'
                : isDirty ? '未保存'
                  : status === 'ready' ? '已保存'
                    : status === 'failed' ? '本页生成失败' : '本页尚未生成'}
        </span>
        <div className={cn('flex items-center gap-2', thisRegen && 'justify-end')}>
          {/* 随时可重生成：改完文字想换一版排版是常态，不该只有失败时才给这个按钮 */}
          <Button
            size="sm"
            pill
            icon="RotateCcw"
            disabled={!page || status === 'generating'}
            loading={regenerating}
            // 不传 layoutId：这一条是「内容不变、版式自由发挥」，与「换排版」是两件事
            onClick={() => onRegenerate()}
          >
            {status === 'failed' ? '重新生成' : '换一版'}
          </Button>
          {/*
            自动保存是主力，这个按钮留作「立刻存一次」与失败后的重试口。
            存不上时不自动重试（免得连环打），所以失败态下它必须显眼地变成「重试保存」。
          */}
          <Button
            size="sm"
            pill
            variant="primary"
            icon="Save"
            loading={saveState === 'saving'}
            disabled={!isDirty}
            onClick={() => flushRef.current(page.pageId)}
          >
            {saveState === 'error' ? '重试保存' : '保存本页'}
          </Button>
        </div>
      </footer>
      <span className="sr-only" data-theme-hint={theme} />
    </aside>
  );
}

/** 检查器头部那枚小图标。与左栏大纲用的是同一套页类型图标 */
const PAGE_ICON: Record<string, never> = {
  cover: 'Presentation', toc: 'ListOrdered', section: 'Bookmark', text: 'AlignLeft',
  imageText: 'Image', chart: 'ChartColumn', metrics: 'Hash', end: 'Flag',
} as never;

/* ---------------- 文字 ---------------- */

function TextPanel({ page, patch }: { page: PageIR; patch: (p: Partial<PageIR>) => void }) {
  const paragraphs = page.blocks.filter((b) => b.type === 'paragraph');
  const bullets = page.blocks.filter((b) => b.type === 'bullets');

  return (
    <div className="flex flex-col">
      <PanelGroup title="标题">
        <Field label="眉标" hint="显示在标题上方的小字，可用于章节名">
          <Input
            value={page.title.eyebrow}
            onChange={(e) => patch({ title: { ...page.title, eyebrow: e.target.value } })}
          />
        </Field>
        <Field label="主标题" hint="一页只表达一个主张">
          <Input
            value={page.title.main}
            onChange={(e) => patch({ title: { ...page.title, main: e.target.value } })}
          />
        </Field>
        <Field label="副标题">
          <Input
            value={page.title.sub}
            onChange={(e) => patch({ title: { ...page.title, sub: e.target.value } })}
          />
        </Field>
        <Field label="强调词" hint="用辅助色标出的词，多个用逗号分隔">
          <Input
            value={page.title.accentWords.join('，')}
            onChange={(e) =>
              patch({
                title: {
                  ...page.title,
                  accentWords: e.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean).slice(0, 4),
                },
              })
            }
          />
        </Field>
      </PanelGroup>

      {paragraphs.length > 0 && (
        <PanelGroup title="正文">
          {paragraphs.map((b, i) => {
            const idx = page.blocks.indexOf(b);
            return (
              <Field key={i} label={`段落 ${i + 1}`}>
                <Textarea
                  rows={4}
                  value={b.type === 'paragraph' ? b.text : ''}
                  onChange={(e) => {
                    const blocks = [...page.blocks];
                    blocks[idx] = { ...b, text: e.target.value } as PageIR['blocks'][number];
                    patch({ blocks });
                  }}
                />
              </Field>
            );
          })}
        </PanelGroup>
      )}

      {bullets.length > 0 && (
        <PanelGroup title="要点">
          {bullets.map((b, i) => {
            const idx = page.blocks.indexOf(b);
            return (
              <Field key={i} label={`要点组 ${i + 1}`} hint="一页最多 5 条">
                <Textarea
                  rows={Math.max(3, (b.type === 'bullets' ? b.items.length : 0) + 1)}
                  value={b.type === 'bullets' ? b.items.join('\n') : ''}
                  onChange={(e) => {
                    const items = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 5);
                    const blocks = [...page.blocks];
                    blocks[idx] = { ...b, items } as PageIR['blocks'][number];
                    patch({ blocks });
                  }}
                />
              </Field>
            );
          })}
        </PanelGroup>
      )}

      <PanelGroup title="页脚">
        <Field label="来源标注" hint="数据出处、引用来源等，可回溯">
          <Input
            value={page.footer.source}
            onChange={(e) => patch({ footer: { ...page.footer, source: e.target.value } })}
          />
        </Field>
      </PanelGroup>
    </div>
  );
}

/* ---------------- 图片 ---------------- */

/**
 * 一条滑杆。没有做成 `@lumen/ui` 里的通用件：全仓库只有图片面板用得上，
 * 而通用件一旦抽出去就要考虑受控、键盘、无障碍、主题——这里三行就够了。
 */
function RangeField({
  label, value, min, max, step, suffix = '', onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  // 已选部分的占比。样式在 `styles.css` 的 `.lumen-range` 里——Chrome 没有
  // progress 伪元素，只能靠这个值在轨道背景上画一段渐变
  const pct = max === min ? 0 : ((value - min) / (max - min)) * 100;
  return (
    <label className="flex items-center gap-2">
      <span className="w-[52px] shrink-0 text-[11px] text-[var(--text-3)]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ '--range-pct': `${pct}%` } as CSSProperties}
        className="lumen-range min-w-0 flex-1"
      />
      <span className="w-[46px] shrink-0 text-right font-[var(--font-mono)] text-[10px] tabular-nums text-[var(--text-3)]">
        {Math.round(value * 100) / 100}{suffix}
      </span>
    </label>
  );
}

/**
 * 图位的位置。改的是这个图位本身——整块挪走、放大、转一点，
 * 落成独立的 `translate` / `scale` / `rotate`，与模型写的 `transform` 叠加。
 */
function GeometryFields({
  slot, ov, setSlot,
}: {
  slot: ImageSlot;
  ov: ImageSlotOverride | undefined;
  setSlot: (index: number, ov: ImageSlotOverride | null) => void;
}) {
  const moved = ov?.dx !== undefined || ov?.dy !== undefined || ov?.scale !== undefined
    || ov?.rotate !== undefined;
  /** 只清几何，保留换图 / 透明底 / 提示词——「归位」说的是位置归位，不是把这一位重置 */
  const reset = () => {
    const next = { ...ov };
    delete next.dx; delete next.dy; delete next.scale; delete next.rotate;
    setSlot(slot.index, Object.keys(next).length === 0 ? null : next);
  };

  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-control)] bg-[var(--surface-1)] p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-[var(--text-2)]">位置</span>
        {moved && (
          <button
            type="button"
            className="text-[11px] text-[var(--accent-500)] hover:underline"
            onClick={reset}
          >
            归位
          </button>
        )}
      </div>

      <RangeField label="左右" value={ov?.dx ?? 0} min={-400} max={400} step={1} suffix="px"
        onChange={(v) => setSlot(slot.index, { dx: v })} />
      <RangeField label="上下" value={ov?.dy ?? 0} min={-300} max={300} step={1} suffix="px"
        onChange={(v) => setSlot(slot.index, { dy: v })} />
      <RangeField label="缩放" value={ov?.scale ?? 1} min={0.5} max={2} step={0.01}
        onChange={(v) => setSlot(slot.index, { scale: v })} />
      {/*
        旋转是**整圈**的（-180°~180° 覆盖所有朝向）。原先只给 ±15°——那是按「把歪了的图
        扶正」想的，但用户会拿它当排版手段用（斜着摆一片叶子、转一下徽标），15° 不够。
        滑杆两端是同一个朝向，`归位` 把这一项清零。
      */}
      <RangeField label="旋转" value={ov?.rotate ?? 0} min={-180} max={180} step={1} suffix="°"
        onChange={(v) => setSlot(slot.index, { rotate: v })} />
    </div>
  );
}

/**
 * 去掉服务端错误码前缀，只留要读的那句话。
 *
 * 网关抛的是 `PROVIDER_ERROR 这个模型没给出透明底（…）`、抠图服务抛的是
 * `CUTOUT_ERROR 还没有配置抠图服务的密钥（…）` 这种，前缀是给日志与排查用的
 * 机器码，露在面板上只是噪音——用户要读的是后面那句「去哪配」。
 */
function humanizeError(message: string): string {
  return message.replace(/^(PROVIDER_ERROR|ALL_PROVIDERS_FAILED|CUTOUT_ERROR)\s*/, '');
}

/**
 * 新链路的图位面板。
 *
 * 页面是模型写的一段 HTML，图位是里面的 `<img data-lumen-image="n">`，渲染时才由素材库
 * 配图——所以 `page.blocks` 里一个图片块都没有。面板原先只看 `blocks`，于是那本 30 页的
 * 书里 5 页的 7 个图位一个都列不出来，永远显示「本页没有图片槽位」。
 *
 * 调整写进 `page.overrides.images`，**不动模型写的 HTML**：那是重生成的产物，直接改不可逆；
 * 而且 `fillImageSlots` 本来就会覆盖图位上写着的 `src`，写进去也活不下来。
 */
/**
 * 这一页的文字，按**区块 → 小组 → 文字**三层列出来，逐条改。
 *
 * ## 为什么不是原来的 IR 字段
 *
 * 新版链路下画布渲染的是模型写的 `page.html`，而 IR 的 `title.main` / `blocks[].text` /
 * `footer.source` **从不写回 HTML**——在那里改字，画布一个字都不会变（这就是「改了没反应」
 * 的根子）。所以这个面板直接列页面里真实的文字。
 *
 * ## 为什么要分块
 *
 * 一页有五六十段文字，平铺着列出来**根本找不到要改的那一条**（用户的原话是「文字内容太多」）。
 * 所以按页面自己的结构分三层，并且**默认全部收起**——先看到「这一页分几块」，
 * 点开哪块才看到哪块的文字。区块名（页头 / 正文 / 页脚）来自 `textBlocksOf`。
 *
 * ## 敲字时的即时预览走「直接改 iframe 的 DOM」
 *
 * 不写 store：写 store 会让 `srcdoc` 换一次、iframe 整页重载，一敲一个字闪一次。
 * **失焦才把结果写回 `page.html`**（`applyTextRuns` 只动改过的那一段，其余一字不变）。
 *
 * ## 段号是「这一页里第几段」
 *
 * 与画布那边（`CanvasTextHandles` 遍历 iframe 的 DOM）用的是**同一套遍历规则**，
 * 两边必须对得上；换页要清草稿，否则段号会指到新一页的另一段上。
 */
function PageTextPanel({
  page, patch, selectedRun, frameRef,
}: {
  page: PageIR;
  patch: (p: Partial<PageIR>) => void;
  /** 画布上选中的那一段。**自动展开它所在的区块与小组**，再滚过去 */
  selectedRun: number | null;
  frameRef: React.RefObject<HTMLIFrameElement | null>;
}) {
  const runs = useMemo(() => textRunsOf(page.html), [page.html]);
  const blocks = useMemo(() => textBlocksOf(page.html), [page.html]);
  /** 还没提交的改动：段号 → 新文字 */
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  /**
   * 展开的区块与小组。**同一时刻只有一处**——这是手风琴，不是多选。
   *
   * 原先两个都是 Set（可以同时开着好几个）。页面上点一段文字会自动展开它所在的那一组，
   * 点几段之后面板里就横七竖八开着好几组，用户的原话是「选中文字的组展开的时候，
   * 其他文字组收起来」。收成单值之后，面板上永远只有一条路径是打开的。
   */
  const [openBlock, setOpenBlock] = useState<number | null>(null);
  const [openGroup, setOpenGroup] = useState<number | null>(null);
  /** 展开是 state、要等下一次渲染才长出那一行，所以滚动请求得存下来、渲染完再执行 */
  const [pendingScroll, setPendingScroll] = useState<number | null>(null);
  const rowRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const blockRefs = useRef<Record<number, HTMLDivElement | null>>({});

  /** 段号 → 它落在哪个区块、哪个小组。画布选中时靠它决定展开谁 */
  const homeOf = useMemo(() => {
    const map = new Map<number, { block: number; group: number | null }>();
    for (const b of blocks) {
      for (const r of b.runs) map.set(r.i, { block: b.key, group: null });
      for (const g of b.groups) for (const r of g.runs) map.set(r.i, { block: b.key, group: g.key });
    }
    return map;
  }, [blocks]);

  // 换页丢掉草稿：段号是「这一页里第几段」，带到下一页指的是另一段文字
  useEffect(() => { setDrafts({}); }, [page.pageId]);

  /* ---- 画布上点了一段文字 → 展开它所在的区块与小组，再滚过去 ---- */
  /** 已经处理过的那一段。改字会让 `page.html` 变、`homeOf` 跟着重建，
   *  不加这道闸，用户一失焦提交就会被滚回原处，下一段没法接着改 */
  const handled = useRef<number | null>(null);
  useEffect(() => {
    if (selectedRun === null) { handled.current = null; return; }
    if (handled.current === selectedRun) return;
    handled.current = selectedRun;
    const home = homeOf.get(selectedRun);
    if (!home) return;
    // 先取成局部量：下面要写进 setState 的回调里，闭包会丢掉 null 收窄
    const { block, group: groupKey } = home;
    setOpenBlock(block);
    setOpenGroup(groupKey);
    setPendingScroll(selectedRun);
  }, [selectedRun, homeOf]);

  // 展开之后那一行才在 DOM 里，这时候滚才滚得到
  useEffect(() => {
    if (pendingScroll === null) return;
    rowRefs.current[pendingScroll]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    setPendingScroll(null);
  }, [pendingScroll, openBlock, openGroup]);

  /** 敲字时直接改 iframe 里那个文本节点，画布当场跟着变 */
  const preview = (i: number, text: string) => {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    const node = textNodesOf(doc)[i];
    if (node) node.data = text;
  };

  const change = (i: number, text: string) => {
    setDrafts((d) => ({ ...d, [i]: text }));
    preview(i, text);
  };

  /** 失焦才写回 HTML。**每次按键都写**会让 iframe 每敲一个字重载一次 */
  const commit = (i: number) => {
    const next = drafts[i];
    if (next === undefined) return;
    patch({ html: applyTextRuns(page.html, [{ i, text: next }]) });
    setDrafts((d) => {
      const rest = { ...d };
      delete rest[i];
      return rest;
    });
  };

  /** 收起别的、只留这一个。传 null 就是全收 */
  const openOnly = (block: number | null, group: number | null) => {
    setOpenBlock(block);
    setOpenGroup(group);
  };

  const toggleBlock = (key: number) => {
    // 收起再展开时小组回到收起的初始态：展开的是「这个区块」，不是上次看到的那个位置
    openOnly(openBlock === key ? null : key, null);
  };

  const toggleGroup = (key: number) => {
    setOpenGroup(openGroup === key ? null : key);
  };

  /** 快捷导航：跳到某个区块并展开它 */
  const jumpTo = (key: number) => {
    if (openBlock !== key) openOnly(key, null);
    // 区块本身一直在 DOM 里（只是里面收着），可以直接滚
    blockRefs.current[key]?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  const row = (r: (typeof runs)[number]) => {
    const on = selectedRun === r.i;
    const value = drafts[r.i] ?? r.text;
    return (
      <div
        key={r.i}
        data-lumen-run={r.i}
        ref={(el) => { rowRefs.current[r.i] = el; }}
        className={cn(
          'flex flex-col gap-1 rounded-[var(--radius-control)] border px-2 py-1.5 transition-colors duration-150 ease-out',
          on ? 'border-[var(--brand-500)] bg-[var(--brand-500)]/8' : 'border-transparent',
        )}
      >
        <span className="flex items-center gap-1.5 text-[10px] text-[var(--text-3)]">
          <span className="font-[var(--font-mono)]">{r.tag}</span>
          {/* 一个元素里只有一段时不标序号——标了只是噪音 */}
          {r.siblings > 1 && <span>· 第 {r.ordinal + 1}/{r.siblings} 段</span>}
        </span>
        <Textarea
          value={value}
          // 长段落给高一点，但别让一条占满整屏
          rows={Math.min(6, Math.max(1, Math.ceil(value.length / 22)))}
          onChange={(e) => change(r.i, e.target.value)}
          onBlur={() => commit(r.i)}
          className="text-[12px] leading-[1.6]"
        />
      </div>
    );
  };

  const group = (g: TextBlock['groups'][number]) => {
    const open = openGroup === g.key;
    const hasSelected = g.runs.some((r) => r.i === selectedRun);
    return (
      <div key={g.key} className="flex flex-col gap-1">
        <button
          type="button"
          data-lumen-group={g.key}
          onClick={() => toggleGroup(g.key)}
          className={cn(
            'flex items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-1 text-left text-[11px] transition-colors duration-150 ease-out',
            hasSelected
              ? 'bg-[var(--brand-500)]/8 text-[var(--brand-600)]'
              : 'text-[var(--text-2)] hover:bg-[var(--surface-1)]',
          )}
        >
          <Icon name={open ? 'ChevronDown' : 'ChevronRight'} size={16} />
          <span className="min-w-0 flex-1 truncate">{g.label}</span>
          <span className="shrink-0 text-[10px] text-[var(--text-3)]">{g.runs.length}</span>
        </button>
        {open && <div className="flex flex-col gap-2 pl-3">{g.runs.map(row)}</div>}
      </div>
    );
  };

  if (runs.length === 0) {
    return <PanelEmpty icon="Type" title="这一页没有文字" description="模型写的 HTML 里没有可编辑的文字段。" />;
  }

  return (
    <div className="flex flex-col gap-2 px-2.5 pb-2">
      {/*
        快捷导航吸顶。底色要用 rail 的底色（`--surface-0`），否则下面的文字会从缝里透出来。
      */}
      <div className="sticky top-0 z-10 -mx-2.5 flex flex-wrap items-center gap-1 bg-[var(--surface-0)] px-2.5 pb-1.5 pt-1">
        {blocks.map((b) => {
          const selectedHere = selectedRun !== null && homeOf.get(selectedRun)?.block === b.key;
          const count = b.runs.length + b.groups.reduce((n, g) => n + g.runs.length, 0);
          return (
            <button
              key={b.key}
              type="button"
              data-lumen-block-nav={b.key}
              onClick={() => jumpTo(b.key)}
              className={cn(
                'rounded-full border px-2 py-0.5 text-[11px] transition-colors duration-150 ease-out',
                selectedHere
                  ? 'border-[var(--brand-500)] bg-[var(--brand-500)]/10 text-[var(--brand-600)]'
                  : 'border-[var(--border)] text-[var(--text-2)] hover:border-[var(--brand-500)] hover:text-[var(--brand-600)]',
              )}
            >
              {b.label}
              <span className="ml-1 text-[10px] text-[var(--text-3)]">{count}</span>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] leading-[1.6] text-[var(--text-3)]">
        这一页的全部文字，共 {runs.length} 段、{blocks.length} 块。点画布上的字会直接跳到对应那一条。
      </p>

      {blocks.map((b) => {
        const open = openBlock === b.key;
        const count = b.runs.length + b.groups.reduce((n, g) => n + g.runs.length, 0);
        return (
          <div
            key={b.key}
            ref={(el) => { blockRefs.current[b.key] = el; }}
            className="flex flex-col gap-1.5 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-1)] p-1.5"
          >
            <button
              type="button"
              data-lumen-block={b.key}
              onClick={() => toggleBlock(b.key)}
              className="flex items-center gap-1.5 px-1 py-0.5 text-left"
            >
              <Icon name={open ? 'ChevronDown' : 'ChevronRight'} size={16} />
              <span className="text-[12px] font-medium text-[var(--text-1)]">{b.label}</span>
              <span className="text-[10px] text-[var(--text-3)]">
                {count} 段{b.groups.length > 0 ? ` · ${b.groups.length} 组` : ''}
              </span>
            </button>
            {open && (
              <div className="flex flex-col gap-2">
                {b.groups.length > 0 ? b.groups.map(group) : b.runs.map(row)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function HtmlImagePanel({
  page, patch, selectedSlot,
}: {
  page: PageIR;
  patch: (p: Partial<PageIR>) => void;
  /** 画布上点中的图位。右栏滚到它并高亮 */
  selectedSlot: number | null;
}) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const styleId = useWorkbench((s) => s.styleId);
  const doc = useStyleDoc(styleId || null);
  const [picking, setPicking] = useState<number | null>(null);
  const [uploadingAt, setUploadingAt] = useState<number | null>(null);

  const overrides = useMemo(() => imageOverridesOf(page.overrides), [page.overrides]);

  /**
   * 图位清单。**底图用素材库配好的那一份**——面板上显示的要与画布上看到的是同一张。
   * 自己另算一份取图规则迟早与渲染对不上，而那种错不报错，只是「面板上写着 A、画布上是 B」。
   */
  const slots = useMemo(() => {
    const d = doc.data;
    if (!d) return [];
    const auto = stockImagesFor(page.html, stockPaletteOf(d.palette, d.theme === 'dark'), page.pageType);
    return imageSlotsOf(page.html, auto, overrides);
  }, [page.html, doc.data, overrides]);

  // 画布上点中一个图位 → 滚到它。用 `nearest`：已经看得见就别动，免得面板自己乱跳
  useEffect(() => {
    if (selectedSlot === null) return;
    document.getElementById(`lumen-slot-${selectedSlot}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [selectedSlot]);

  const setSlot = (index: number, ov: ImageSlotOverride | null) => {
    const images = { ...overrides };
    // `null` = 撤销这一项，回到素材库自动配的那张
    if (ov === null) delete images[String(index)];
    else images[String(index)] = { ...images[String(index)], ...ov };
    // 展开 `page.overrides` 再写：那个字段里可能还有别的功能放的键，整块替换会把它们抹掉
    patch({ overrides: { ...page.overrides, images } });
  };

  /**
   * 新增一个图位。
   *
   * **这是唯一一处直接改模型写的 HTML 的操作**——规格里把这个例外写明了：别的调整都
   * 有现成的元素可覆盖（覆盖的语义是「这个图位改成这样」），新增没有元素可覆盖。
   * 代价是它会在「重新生成这一页」时随整份 HTML 一起消失，所以按钮下面写清楚了。
   *
   * 插的是一个**绝对定位**的 img，外面套一层 `inset:0` 的容器：绝对定位不参与文档流，
   * 不会把模型排好的版挤乱；套容器是为了让 `right` / `bottom` 的百分比有个确定的参照
   * ——容器的定位祖先若不存在，百分比就相对初始包含块，也就是 1920×1080 的画布本身。
   */
  const addSlot = () => {
    const no = imageSlotCount(page.html) + 1;
    const block = '<div class="lumen-added-slot" style="position:absolute;inset:0;pointer-events:none">'
      + `<img data-lumen-image="${no}" `
      + 'style="position:absolute;right:6%;bottom:8%;width:24%;height:auto;object-fit:contain">'
      + '</div>';
    patch({ html: `${page.html}\n${block}` });
  };

  const upload = useMutation({
    mutationFn: async ({ file, index }: { file: File; index: number }) => {
      const dataUrl = await fileToDataUrl(file);
      const r = await api.post<{ url: string }>('/uploads', { dataUrl, name: file.name });
      return { url: r.url, index };
    },
    onSuccess: ({ url, index }) => {
      /**
       * 上传的图按普通照片落，**但不改这个图位的性质**——上传一张文件本身没有对
       * 「这一位要不要透明底」表态，图位自己的声明（样式里的 `object-fit: contain`）
       * 该继续算数。写死 `cutout: false` 会压过它：往抠图位上传透明 PNG 会被
       * `object-fit: cover` 裁掉，标记也被摘。
       *
       * 普通图位不受影响：那里本来就没有声明，`cutout` 缺省照样落成普通照片。
       */
      setSlot(index, { src: url });
      toast.success('图片已替换');
    },
    onError: (err: Error) => toast.error('上传失败', err.message),
  });

  /**
   * 图位上的流式操作：出图与抠图共用这一副骨架。
   *
   * 两条流的流程一模一样——打「忙」标记 → 逐条更新进度 → 成功写覆盖表 → 失败把原因
   * 留在面板上；差别只有地址、开始时的文案、以及成功那一步。所以抽成一个，
   * 而不是把二十行 SSE 胶水抄两遍。
   */
  const [gen, setGen] = useState<{ index: number; label: string; startedAt: number } | null>(null);
  /**
   * 上一次操作失败的原因，**留在面板上不自动消失**。
   *
   * 原来失败只弹一个 toast——几秒后自己走了，面板干净得像什么都没发生。实测踩过：
   * 图片模型给不出透明底时，用户点「生成透明底版本」看到的就是「点了没反应」，
   * 而那句「检查图片供应商的模型配置」正是要他动手去改的东西。会消失的提示等于没提示。
   */
  const [genError, setGenError] = useState<{ index: number; message: string } | null>(null);
  const genStopRef = useRef<(() => void) | null>(null);
  useEffect(() => () => genStopRef.current?.(), []);
  const genElapsed = useElapsed(gen?.startedAt);

  const runSlotStream = (
    index: number,
    opts: {
      url: string;
      startLabel: string;
      failToast: string;
      doneToast: string;
      /** 成功那一步。两条流不一样：出图只是换 `src`，抠图还要把这一位标成抠图位 */
      onImage: (url: string) => void;
      /**
       * 收尾**之后**才跑的东西。抠图位上「重新生成」要接着抠一遍，就是挂在这里。
       * 不能直接写在 `onImage` 里：那时「忙」标记还没清，下一步开头那道
       * 「已经在忙就别开始」的闸会把它挡掉，表现为「点了没反应」。
       */
      then?: (url: string) => void;
    },
  ) => {
    if (genStopRef.current) return;
    setGenError(null);
    setGen({ index, label: opts.startLabel, startedAt: Date.now() });
    const finish = () => { genStopRef.current = null; setGen(null); };

    const stop = streamSse(opts.url, {
      onEvent: (event, data) => {
        const d = data as Record<string, unknown>;
        if (event === 'progress') {
          setGen((g) => (g ? { ...g, label: String(d.label ?? '') } : g));
        } else if (event === 'image') {
          const url = String(d.url);
          opts.onImage(url);
          toast.success(opts.doneToast, '按「保存本页」落盘');
          finish();
          opts.then?.(url);
        } else if (event === 'error') {
          setGenError({ index, message: humanizeError(String(d.message ?? '')) });
          toast.error(opts.failToast, humanizeError(String(d.message ?? '')));
          finish();
        }
      },
      onError: (err) => {
        // 没连上（超时、路由不通）与连着断了是两回事，服务端那句话更有用
        const message = humanizeError(err.message);
        setGenError({ index, message });
        if (err instanceof SseConnectError) toast.error(`没能开始${opts.failToast}`, message);
        else toast.error('事件流断开', message);
        finish();
      },
      onClose: finish,
    });
    genStopRef.current = () => { stop(); finish(); };
  };

  /**
   * 把这一位**现在那张图**送去抠图服务真抠一遍。
   *
   * 与「重新生成」是两件事：那条是生成一张新图，这条是把现有的图抠出来。原先是让
   * 图片模型直接出透明底（`background: 'transparent'`），实测那个参数会被静默忽略、
   * 把「透明」画成棋盘格，所以那条路已经删了，改成出完图再真抠。
   */
  const cutoutAt = (index: number, src: string, chained = false) => {
    runSlotStream(index, {
      url: `/pages/${page.pageId}/image/cutout/stream`
        + `?slot=${index}&src=${encodeURIComponent(src)}`,
      startLabel: chained ? '正在抠图（接着上一步）' : '正在抠图',
      failToast: '抠图失败',
      doneToast: '已抠图',
      onImage: (url) => {
        // **顺带把这一位标成抠图位**：抠出来的就是透明底，不标的话它会按
        // `object-fit: cover` 渲染，透明物体被裁掉一圈
        setSlot(index, { src: url, cutout: true });
      },
    });
  };

  /**
   * 「重新生成」走流式：出图实测几十秒，与「重跑这一页」同一类等待。
   * 生成完**只写覆盖表、不落库**——与「从图库选」是同一条路，
   * 用户按一次「保存本页」把这一页的改动一起落盘。
   */
  const regenerate = (index: number, prompt: string, chainCutout: boolean) => {
    runSlotStream(index, {
      url: `/pages/${page.pageId}/image/stream`
        + `?slot=${index}&prompt=${encodeURIComponent(prompt)}`,
      startLabel: '正在准备',
      failToast: '生成失败',
      doneToast: chainCutout ? '已生成，正在抠图' : '已生成一张新图',
      onImage: (url) => {
        // **不动 `cutout`**：这一位是不是抠图位由 `slot.cutout` 说了算，生成结果
        // 不该反过来改它。出图出的是普通照片，标成抠图位反而会让它被 `contain` 缩起来
        setSlot(index, { src: url });
      },
      // 抠图位上重新生成，接着把新图抠一遍——不然用户点一次「重新生成」拿到的是张
      // 不透明的图，还得再点一次「抠图」，而这一步是他点之前就想要的
      then: chainCutout ? (url) => cutoutAt(index, url, true) : undefined,
    });
  };

  if (doc.isLoading) {
    return <p className="px-1 py-6 text-center text-[13px] text-[var(--text-3)]">正在读取这套风格的配色…</p>;
  }
  if (slots.length === 0) {
    return (
      <p className="rounded-[var(--radius-control)] bg-[var(--surface-1)] px-3 py-6 text-center text-[13px] leading-[1.6] text-[var(--text-3)]">
        本页没有图位。想让这一页有配图，可以在左栏换一个带图的页类型，或重新生成这一页。
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          const index = uploadingAt;
          e.target.value = '';
          if (file && index !== null) upload.mutate({ file, index });
        }}
      />

      <p className="px-2.5 pb-1 text-[11px] leading-[1.6] text-[var(--text-3)]">
        这一页有 {slots.length} 个图位。改动只作用在这一页。
      </p>

      {slots.map((slot) => {
        const ov = overrides[String(slot.index)];
        // 收窄一次给下面的闭包用：`slot.src` 是可选字段，闭包里 TS 不会再替我们收窄
        const src = slot.src;
        // **只看换过 / 删过**，不看 prompt：用户只是写了一句提示词、还没点生成，
        // 不该显示成「已替换」——那会让他以为图已经变了
        const edited = ov !== undefined
          && (ov.src !== undefined || ov.cutout !== undefined || ov.hidden !== undefined);
        const busy = gen?.index === slot.index;
        return (
          <PanelGroup key={slot.index} id={`lumen-slot-${slot.index}`} title={`图片 ${slot.index + 1}`}>
            <div className="flex items-center gap-3">
              <div className="flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-1)]">
                {slot.hidden || !slot.src ? (
                  <Icon name={slot.hidden ? 'ImageOff' : 'Image'} size={20} />
                ) : (
                  <img
                    src={slot.src}
                    alt=""
                    className={cn('h-full w-full', slot.cutout ? 'object-contain' : 'object-cover')}
                  />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
                {slot.hidden ? (
                  <Badge tone="error">已删除</Badge>
                ) : (
                  <Badge tone={edited ? 'brand' : 'neutral'}>{edited ? '已替换' : '自动配图'}</Badge>
                )}
                {slot.cutout && !slot.hidden && <Badge tone="neutral">抠图</Badge>}
                <span className="text-[11px] leading-[1.5] text-[var(--text-3)]">
                  版面上的第 {slot.slotNo} 号图位
                </span>
              </div>
            </div>

            <Field label="生成提示词" hint="留空就按这一页的标题与主张拼一句">
              <Textarea
                rows={2}
                value={ov?.prompt ?? ''}
                placeholder="例：一片斜置的枯黄落叶，浅色背景，俯拍"
                onChange={(e) => setSlot(slot.index, { prompt: e.target.value })}
              />
            </Field>

            {!slot.hidden && slot.src && (
              <GeometryFields slot={slot} ov={ov} setSlot={setSlot} />
            )}

            <div className="flex flex-wrap gap-2">
              <Button size="sm" icon="Search" onClick={() => setPicking(slot.index)}>从图库选</Button>
              <Button
                size="sm"
                icon="Upload"
                loading={upload.isPending && uploadingAt === slot.index}
                onClick={() => {
                  setUploadingAt(slot.index);
                  fileRef.current?.click();
                }}
              >
                上传
              </Button>
              {slot.hidden ? (
                <Button size="sm" icon="RotateCcw" onClick={() => setSlot(slot.index, null)}>恢复</Button>
              ) : (
                <Button size="sm" icon="Trash2" onClick={() => setSlot(slot.index, { hidden: true })}>删除</Button>
              )}
              <Button
                size="sm"
                variant="primary"
                icon="Sparkles"
                loading={busy}
                disabled={gen !== null && !busy}
                onClick={() => regenerate(slot.index, ov?.prompt ?? '', slot.cutout)}
              >
                重新生成
              </Button>
              {/*
                「抠图」：把这一位现在那张图送去抠图服务真抠一遍。**只在有图、且还不是
                透明底时出现**——已经是抠图的再抠一遍是白花一次额度，结果也不会更好。
              */}
              {!slot.hidden && src && !slot.cutout && (
                <Button
                  size="sm"
                  icon="Scissors"
                  disabled={gen !== null && !busy}
                  onClick={() => cutoutAt(slot.index, src)}
                >
                  抠图
                </Button>
              )}
              {edited && !slot.hidden && (
                <Button size="sm" variant="ghost" icon="RotateCcw" onClick={() => setSlot(slot.index, null)}>
                  还原
                </Button>
              )}
            </div>

            {busy && (
              <p className="text-[11px] leading-[1.5] text-[var(--text-3)]">
                {gen.label}（已等 {genElapsed} 秒）
              </p>
            )}

            {genError?.index === slot.index && (
              <div className="flex items-start gap-2 rounded-[var(--radius-control)] border border-[var(--error)] px-2.5 py-2">
                <Icon name="CircleAlert" size={16} className="mt-px shrink-0 text-[var(--error)]" />
                <span className="min-w-0 flex-1 text-[11px] leading-[1.6] text-[var(--text-2)]">
                  {genError.message}
                </span>
                <button
                  type="button"
                  className="shrink-0 text-[11px] text-[var(--text-3)] hover:underline"
                  onClick={() => setGenError(null)}
                >
                  知道了
                </button>
              </div>
            )}
          </PanelGroup>
        );
      })}

      <div className="flex flex-col gap-1.5 px-2.5 pt-2">
        <Button size="sm" icon="Plus" onClick={addSlot}>新增一个图位</Button>
      </div>

      <StockPickerDialog
        open={picking !== null}
        onOpenChange={(v) => { if (!v) setPicking(null); }}
        onPick={(src, cutout) => {
          if (picking !== null) setSlot(picking, { src, cutout });
          setPicking(null);
        }}
      />
    </div>
  );
}
/**
 * 从素材库里挑一张。
 *
 * 用弹层而不是塞进 304px 的面板里：库里一百多张，挤在侧栏里既看不全也点不准。
 * 排序走 `sortStockPhotos`（透明底抠图排后面），另给一个搜索框——**不按色板推荐**：挑图是用户的
 * 审美决定，推荐排序会把「这一页本来该是什么题材」这件更要紧的事盖掉。
 */
function StockPickerDialog({
  open, onOpenChange, onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (src: string, cutout: boolean) => void;
}) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<'all' | StockCategory>('all');

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase();
    const hit = STOCK_PHOTOS.filter((p) => {
      if (category !== 'all' && stockCategoryOf(p) !== category) return false;
      if (kw === '') return true;
      return p.file.toLowerCase().includes(kw) || p.tags.some((t) => t.toLowerCase().includes(kw));
    });
    // 透明底抠图排在后面，与图片库同一套顺序（`sortStockPhotos`）
    return sortStockPhotos(hit);
  }, [q, category]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="从图库选一张">
      <div className="flex flex-col gap-3">
        <Input
          value={q}
          placeholder="搜文件名或标签，如 落叶、几何"
          aria-label="搜索图库"
          onChange={(e) => setQ(e.target.value)}
        />
        <div className="flex gap-1.5">
          {(['all', ...STOCK_CATEGORY_ORDER] as const).map((c) => (
            <Button
              key={c}
              size="sm"
              pill
              variant={category === c ? 'primary' : 'ghost'}
              onClick={() => setCategory(c)}
            >
              {c === 'all' ? '全部' : STOCK_CATEGORY_LABEL[c]}
            </Button>
          ))}
        </div>
        <div className="grid max-h-[46vh] grid-cols-3 gap-2 overflow-y-auto lumen-scroll">
          {list.map((p) => {
            const img = stockImageOf(p);
            return (
              <button
                key={p.file}
                type="button"
                onClick={() => onPick(img.src, img.cutout === true)}
                className="group relative aspect-video overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-1)]"
                title={p.tags.join(' · ') || p.file}
              >
                <img
                  src={img.src}
                  alt=""
                  loading="lazy"
                  className={cn(
                    'h-full w-full transition-transform duration-150 ease-out group-hover:scale-[1.04]',
                    img.cutout ? 'object-contain' : 'object-cover',
                  )}
                />
                {img.cutout && (
                  <span className="absolute bottom-1 left-1 rounded-full bg-[var(--surface-0)]/85 px-1.5 py-0.5 text-[10px] text-[var(--text-2)]">
                    抠图
                  </span>
                )}
              </button>
            );
          })}
          {list.length === 0 && (
            <p className="col-span-3 py-6 text-center text-[13px] text-[var(--text-3)]">没有匹配的图</p>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function MediaPanel({
  page, patch, onRegenerate, regenerating,
}: { page: PageIR; patch: (p: Partial<PageIR>) => void; onRegenerate: () => void; regenerating: boolean }) {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const images = page.blocks.filter((b) => b.type === 'image');

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const dataUrl = await fileToDataUrl(file);
      return api.post<{ url: string }>('/uploads', { dataUrl, name: file.name });
    },
    onError: (err: Error) => toast.error('上传失败', err.message),
  });

  if (images.length === 0) {
    return (
      <div className="flex flex-col">
        <p className="rounded-[var(--radius-control)] bg-[var(--surface-1)] px-3 py-6 text-center text-[13px] leading-[1.6] text-[var(--text-3)]">
          本页没有图片槽位。可在左栏把页类型改为「图文」，或重新生成这一页。
        </p>
        <Button icon="RotateCcw" loading={regenerating} onClick={onRegenerate}>重新生成本页</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload.mutateAsync(file);
        }}
      />

      {images.map((b, i) => {
        const idx = page.blocks.indexOf(b);
        if (b.type !== 'image') return null;
        const replace = (patchBlock: Partial<typeof b>) => {
          const blocks = [...page.blocks];
          blocks[idx] = { ...b, ...patchBlock } as PageIR['blocks'][number];
          patch({ blocks });
        };
        return (
          <PanelGroup key={i} title={`图片 ${i + 1}`}>
            <div className="flex items-center gap-3">
              <div className="h-20 w-32 shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-1)]">
                {b.src ? (
                  <img src={b.src} alt={b.caption || '页面配图'} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[var(--text-3)]"><Icon name="Image" size={20} /></div>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Badge tone={b.status === 'ready' ? 'success' : b.status === 'failed' ? 'error' : 'neutral'}>
                  {b.status === 'ready' ? '已就绪' : b.status === 'failed' ? '生成失败' : '生成中'}
                </Badge>
                <Button
                  size="sm"
                  icon="Upload"
                  loading={upload.isPending}
                  onClick={() => fileRef.current?.click()}
                >
                  替换图片
                </Button>
              </div>
            </div>

            {b.placeholderReason && (
              <p className="text-[12px] text-[var(--error)]">{b.placeholderReason}</p>
            )}

            <Field label="生成提示词" hint="强制不含文字、Logo 与可识别真人">
              <Textarea rows={3} value={b.prompt} onChange={(e) => replace({ prompt: e.target.value })} />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="焦点裁切">
                <Select
                  ariaLabel="焦点裁切"
                  value={b.focus}
                  onValueChange={(v) => replace({ focus: v as typeof b.focus })}
                  options={[
                    { value: 'center', label: '居中' },
                    { value: 'top', label: '靠上' },
                    { value: 'bottom', label: '靠下' },
                    { value: 'left', label: '靠左' },
                    { value: 'right', label: '靠右' },
                  ]}
                />
              </Field>
              <Field label="图注">
                <Input value={b.caption} onChange={(e) => replace({ caption: e.target.value })} />
              </Field>
            </div>

            {b.source === 'ai' && (
              <Button size="sm" icon="RotateCcw" onClick={() => replace({ status: 'pending', placeholderReason: '' })}>
                标记为重新生成
              </Button>
            )}
          </PanelGroup>
        );
      })}
    </div>
  );
}

/* ---------------- 数据（指标与图表） ---------------- */

function DataPanel({ page, patch }: { page: PageIR; patch: (p: Partial<PageIR>) => void }) {
  const metrics = page.blocks.filter((b) => b.type === 'metric');
  const charts = page.blocks.filter((b) => b.type === 'chart');

  return (
    <div className="flex flex-col">
      {metrics.length === 0 && charts.length === 0 && (
        <p className="rounded-[var(--radius-control)] bg-[var(--surface-1)] px-3 py-6 text-center text-[13px] leading-[1.6] text-[var(--text-3)]">
          本页没有指标或图表。指标会从内容里的百分比、金额、倍数、排名与趋势自动抽取。
        </p>
      )}

      {metrics.length > 0 && (
        <PanelGroup title="指标" hint="主指标决定视觉重心，一页只有一个">
          {metrics.map((b, i) => {
            const idx = page.blocks.indexOf(b);
            if (b.type !== 'metric') return null;
            const replace = (p: Partial<typeof b>) => {
              const blocks = [...page.blocks];
              blocks[idx] = { ...b, ...p } as PageIR['blocks'][number];
              patch({ blocks });
            };
            return (
              <div key={i} className="flex flex-col gap-2.5 rounded-[var(--radius-control)] border border-[var(--border)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] text-[var(--text-3)]">指标 {i + 1}</span>
                  <button
                    type="button"
                    onClick={() => {
                      const blocks = page.blocks.map((blk, k) =>
                        blk.type === 'metric' ? ({ ...blk, primary: k === idx } as PageIR['blocks'][number]) : blk,
                      );
                      patch({ blocks });
                    }}
                    className={cn(
                      'rounded-full px-2.5 py-0.5 text-[12px] transition-colors duration-150 ease-out',
                      b.primary ? 'bg-[var(--brand-500)] text-[var(--brand-fg)]' : 'bg-[var(--surface-1)] text-[var(--text-3)]',
                    )}
                  >
                    {b.primary ? '主指标' : '设为主指标'}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <Field label="数值"><Input value={b.value} onChange={(e) => replace({ value: e.target.value })} /></Field>
                  <Field label="名称"><Input value={b.label} onChange={(e) => replace({ label: e.target.value })} /></Field>
                </div>
                <Field label="变化"><Input value={b.trend} onChange={(e) => replace({ trend: e.target.value })} /></Field>
                <Field label="出处" hint="可回溯到原文">
                  <Input value={b.source} onChange={(e) => replace({ source: e.target.value })} />
                </Field>
              </div>
            );
          })}
        </PanelGroup>
      )}

      {charts.map((b, i) => {
        const idx = page.blocks.indexOf(b);
        if (b.type !== 'chart') return null;
        const replace = (p: Partial<typeof b>) => {
          const blocks = [...page.blocks];
          blocks[idx] = { ...b, ...p } as PageIR['blocks'][number];
          patch({ blocks });
        };
        return (
          <PanelGroup key={i} title={`图表 ${i + 1}`}>
            <Field label="图表类型">
              <Select
                ariaLabel="图表类型"
                value={b.kind}
                onValueChange={(v) => replace({ kind: v as typeof b.kind })}
                options={[
                  { value: 'bar', label: '柱状图' },
                  { value: 'line', label: '折线图' },
                  { value: 'area', label: '面积图' },
                  { value: 'pie', label: '饼图' },
                  { value: 'scatter', label: '散点图' },
                  { value: 'radar', label: '雷达图' },
                ]}
              />
            </Field>
            <Field label="渲染器" hint="编辑态可切 ECharts / AntV，导出统一走静态 SVG">
              <Select
                ariaLabel="渲染器"
                value={b.renderer}
                onValueChange={(v) => replace({ renderer: v as typeof b.renderer })}
                options={[
                  { value: 'echarts', label: 'ECharts' },
                  { value: 'antv', label: 'AntV' },
                ]}
              />
            </Field>
            <Field label="类目" hint="每行一个">
              <Textarea
                rows={Math.max(3, b.data.categories.length)}
                value={b.data.categories.join('\n')}
                onChange={(e) => {
                  const categories = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
                  replace({ data: { ...b.data, categories } });
                }}
              />
            </Field>
            {b.data.series.map((s, si) => (
              <Field key={si} label={`序列 ${si + 1}：${s.name}`} hint="每行一个数值，需与类目数一致">
                <Textarea
                  rows={Math.max(3, s.values.length)}
                  value={s.values.join('\n')}
                  onChange={(e) => {
                    const values = e.target.value.split('\n').map((v) => Number(v.trim())).filter((v) => Number.isFinite(v));
                    const series = [...b.data.series];
                    series[si] = { ...s, values };
                    replace({ data: { ...b.data, series } });
                  }}
                />
              </Field>
            ))}
          </PanelGroup>
        );
      })}
    </div>
  );
}

/* ---------------- 动效 ---------------- */

function MotionPanel({ page, patch, pack }: { page: PageIR; patch: (p: Partial<PageIR>) => void; pack: StylePack | null }) {
  // 旧链路项目按风格包的白名单；新链路项目（pack 为 null）没有风格包，用新链路那份全量
  const whitelist = pack?.base.motionWhitelist ?? NEW_CHAIN_MOTION_WHITELIST;
  // `auto` 与 `stagger` 是模式，不在白名单里也永远可选——白名单管的是「具体动效」，
  // 拿模式去比对白名单永远是「不在白名单内」
  const allowed: MotionName[] = ['auto', 'stagger', ...whitelist];
  const label: Record<string, string> = {
    auto: '逐块进场（每页不同）', stagger: '逐块进场（每页相同）',
    none: '无动效', fade: '整页淡入', fadeUp: '整页上浮', fadeDown: '整页下沉',
    slideLeft: '整页左滑', slideRight: '整页右滑', scaleIn: '整页放大',
  };
  /**
   * 面板显示的是**实际会播的那个**，不是 `motion.enter` 里存着的那个。
   *
   * 没手选过的页面存的值不生效（播的是轮换出来的），照着存的值显示就会骗人：
   * 显示「上浮淡入」，实际每页都不一样。所以这种情况一律显示「自动轮换」。
   */
  const pinned = isMotionPinned(page.motion);
  const shown = pinned ? page.motion.enter : 'auto';

  return (
    <div className="flex flex-col">
      <PanelGroup title="入场动效" hint="「逐块进场」是页面上的元素一块一块进来；其余几个是整页一起进">
        <Field label="动效">
          <Select
            ariaLabel="入场动效"
            value={shown}
            onValueChange={(v) => patch({
              motion: v === 'auto'
                // 选「自动轮换」等于**取消**手选：把 from 交回去，它才会跟着页序号走
                ? { enter: 'auto', from: 'style-pack' }
                : { enter: v as PageIR['motion']['enter'], from: MOTION_PINNED },
            })}
            options={allowed.map((m) => ({ value: m, label: label[m] ?? m }))}
          />
        </Field>
        <div className="rounded-[var(--radius-control)] bg-[var(--surface-1)] p-3 text-[12px] leading-[1.6] text-[var(--text-3)]">
          动效时长限定在 150–250ms，导出时统一降级为静态，避免投影时出现卡顿。
          {shown === 'auto' && (
            <span className="mt-1.5 block">
              默认值。页内元素按阅读序一块块进场，进场方向按页序号轮换，连续几页各不相同。
            </span>
          )}
          {shown === 'stagger' && (
            <span className="mt-1.5 block">
              与上一项一样是逐块进场，但每页用同一个方向，不随页码变。
            </span>
          )}
          {shown !== 'auto' && shown !== 'stagger' && shown !== 'none' && (
            <span className="mt-1.5 block">
              这几项是整页一起进，页内元素不逐块。想要元素一块块进来请选上面那两项。
            </span>
          )}
        </div>
      </PanelGroup>
    </div>
  );
}

/* ---------------- 讲稿与光标 ---------------- */

function ScriptPanel({ page, patch, projectId }: { page: PageIR; patch: (p: Partial<PageIR>) => void; projectId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const segments = page.script.segments;
  /** 这一页的讲稿任务在途。按钮显示「生成中…」，并在后台盯着它跑完 */
  const [waiting, setWaiting] = useState(false);

  /**
   * 讲稿由 worker 生成，**每页要调一次模型**，几秒到十几秒不等。
   * 接口只负责把它排进队列，正文要等 worker 跑完才回写到这一页上。
   */
  const generate = useMutation({
    mutationFn: () => api.post<{ queued: boolean }>(`/pages/${page.pageId}/script`),
    onSuccess: () => {
      toast.success('已排入队列', '讲稿生成后会显示在这里');
      setWaiting(true);
    },
    onError: (err: Error) => toast.error('生成讲稿失败', err.message),
  });

  /**
   * 盯着这一页的讲稿任务，跑完了再去拉页面。
   *
   * **原来固定 900ms 后拉一次是错的**：那时模型还没回来，拉回来的仍是旧讲稿——
   * 用户点了「重新生成」，界面一动不动，看着像没反应。所以改成轮询任务表。
   *
   * 判据是「这一页还有没有**在途**的讲稿任务」，不是「有没有跑完的任务」：
   * 同一页历史上已经有一堆 succeeded 的老任务，按「跑完」去数的话第一次轮询就收工了。
   * 而接口是在任务落库之后才回的，所以第一次轮询一定看得到刚排进去的那条。
   *
   * 60 秒封顶：任务表按 `limit` 截断，万一这一页的任务压根没进列表，
   * 不封顶就会一直轮询下去。
   */
  useEffect(() => {
    if (!waiting) return;
    let stopped = false;
    let id = 0;
    const startedAt = Date.now();
    const finish = () => {
      if (stopped) return;
      stopped = true;
      window.clearInterval(id);
      setWaiting(false);
      void qc.invalidateQueries({ queryKey: ['project', projectId] });
    };
    const tick = async () => {
      try {
        const r = await api.get<{ items: TaskSummary[] }>(
          `/tasks?${new URLSearchParams({ projectId, kind: 'script_generate', limit: '200' })}`,
        );
        const active = r.items.filter(
          (t) => t.pageId === page.pageId
            && (t.status === 'queued' || t.status === 'running' || t.status === 'paused'),
        );
        if (active.length === 0 || Date.now() - startedAt > 60_000) finish();
      } catch {
        // 网络抖一下不算失败，下一拍再试
      }
    };
    id = window.setInterval(() => void tick(), 1500);
    void tick();
    return () => { stopped = true; window.clearInterval(id); };
  }, [waiting, page.pageId, projectId, qc]);

  /**
   * 单页配音。
   *
   * 讲稿改过之后这一页的音频本来就会失效（文件名带内容哈希），这个按钮是给用户一个
   * **显式入口**——不用为了改一页去点整本的「配音」。要整本重来才用顶栏那个。
   */
  const narrate = useMutation({
    mutationFn: () => api.post<{ queued: boolean }>(`/pages/${page.pageId}/narration`),
    onSuccess: () => toast.success('已排入队列', '配音合成后会用于这一页的讲解'),
    onError: (err: Error) => toast.error('生成配音失败', err.message),
  });

  return (
    <div className="flex flex-col">
      <PanelGroup title="讲稿">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-[var(--text-3)]">
            {page.script.edited
              ? '这份讲稿你改过，重新生成页面不会覆盖'
              : segments.length > 0
                ? `已按 ${segments.length} 段生成，含讲解锚点`
                : '还没有讲稿'}
          </span>
          <Button
            size="sm"
            variant="ghost"
            icon="RefreshCw"
            loading={generate.isPending || waiting}
            onClick={() => generate.mutate()}
          >
            {waiting ? '生成中…' : segments.length > 0 ? '重新生成' : '生成讲稿'}
          </Button>
        </div>
        <Field label="逐页口播稿" hint="口语化、含过渡句。你改过之后，重新生成页面不会再覆盖它">
          <Textarea
            rows={7}
            value={page.script.text}
            onChange={(e) => patch({ script: { ...page.script, text: e.target.value } })}
          />
        </Field>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12px] text-[var(--text-3)]">
            配音按内容缓存，改了讲稿或音色会自动失效
          </span>
          <Button
            size="sm"
            variant="ghost"
            icon="Volume2"
            loading={narrate.isPending}
            disabled={segments.length === 0}
            onClick={() => narrate.mutate()}
          >
            重新生成配音
          </Button>
        </div>
      </PanelGroup>

      <PanelGroup title="讲解光标">
        <Switch
          checked={page.script.cursorEnabled}
          onCheckedChange={(v) => patch({ script: { ...page.script, cursorEnabled: v } })}
          label="本页启用讲解光标"
        />
        {page.script.cursorEnabled && (
          <>
            <p className="text-[12px] leading-[1.6] text-[var(--text-3)]">
              光标按分段锚点移动，无锚点的段落会淡出而不是漂移。锚点坐标可在下方微调。
            </p>
            {segments.length === 0 ? (
              <p className="rounded-[var(--radius-control)] bg-[var(--surface-1)] px-3 py-4 text-center text-[12px] text-[var(--text-3)]">
                还没有讲稿分段。生成讲稿后会自动附带锚点。
              </p>
            ) : (
              segments.map((s, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-[var(--border)] p-3">
                  <span className="font-[var(--font-mono)] text-[11px] tabular-nums text-[var(--text-3)]">
                    {Math.round(s.t / 100) / 10}s
                  </span>
                  <Textarea
                    rows={2}
                    value={s.text}
                    onChange={(e) => {
                      const next = [...segments];
                      next[i] = { ...s, text: e.target.value };
                      patch({ script: { ...page.script, segments: next } });
                    }}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="锚点 X">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={s.anchor?.x ?? 0.5}
                        onChange={(e) => {
                          const next = [...segments];
                          next[i] = {
                            ...s,
                            anchor: { targetId: s.anchor?.targetId ?? '', x: clamp01(Number(e.target.value)), y: s.anchor?.y ?? 0.5 },
                          };
                          patch({ script: { ...page.script, segments: next } });
                        }}
                      />
                    </Field>
                    <Field label="锚点 Y">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={s.anchor?.y ?? 0.5}
                        onChange={(e) => {
                          const next = [...segments];
                          next[i] = {
                            ...s,
                            anchor: { targetId: s.anchor?.targetId ?? '', x: s.anchor?.x ?? 0.5, y: clamp01(Number(e.target.value)) },
                          };
                          patch({ script: { ...page.script, segments: next } });
                        }}
                      />
                    </Field>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </PanelGroup>
    </div>
  );
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

/* ---------------- 数字人 ---------------- */

function AvatarPanel({ page, patch }: { page: PageIR; patch: (p: Partial<PageIR>) => void }) {
  const a = page.avatar;
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  /** 上传正面肖像。肖像只落本项目对象存储，随时可换回内置形象。 */
  async function onPickPortrait(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await toPngDataUrl(file);
      const uploaded = await api.post<{ url: string }>('/uploads', { dataUrl, name: file.name });
      patch({ avatar: { ...a, portraitUrl: uploaded.url, enabled: true } });
      toast.success('肖像已上传', '保存本页后生效');
    } catch (err) {
      toast.error('上传失败', err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col">
      <PanelGroup title="数字人讲解" hint="默认关闭，可按页开启">
        <Switch
          checked={a.enabled}
          onCheckedChange={(v) => patch({ avatar: { ...a, enabled: v } })}
          label="本页显示数字人"
        />
        {a.enabled && (
          <>
            <Field label="形象" hint="默认是真人肖像；也可以上传自己的正面肖像">
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  {AVATAR_PRESETS.map((p) => {
                    const active = !a.portraitUrl && a.modelId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-label={`选择形象 ${p.name}`}
                        aria-pressed={active}
                        onClick={() => patch({ avatar: { ...a, modelId: p.id, portraitUrl: '' } })}
                        className={cn(
                          'flex flex-1 flex-col items-center gap-1.5 rounded-[var(--radius-control)] border p-2 transition-colors duration-150 ease-out',
                          active
                            ? 'border-[var(--brand-600)] bg-[var(--brand-100)]'
                            : 'border-[var(--border)] hover:bg-[var(--surface-1)]',
                        )}
                      >
                        <img
                          src={avatarSrcFor(p.id)}
                          alt=""
                          className="h-12 w-12 rounded-full object-cover"
                        />
                        <span className="text-[11px] text-[var(--text-2)]">{p.name}</span>
                      </button>
                    );
                  })}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void onPickPortrait(e.target.files)}
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" icon="ImagePlus" loading={uploading} onClick={() => fileRef.current?.click()}>
                    上传肖像
                  </Button>
                  {a.portraitUrl && (
                    <>
                      <img src={a.portraitUrl} alt="当前肖像" className="h-8 w-8 rounded-full object-cover" />
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="X"
                        onClick={() => patch({ avatar: { ...a, portraitUrl: '' } })}
                      >
                        换回内置
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </Field>
            <Field label="显示模式">
              <Select
                ariaLabel="显示模式"
                value={a.mode}
                onValueChange={(v) => patch({ avatar: { ...a, mode: v as PageIR['avatar']['mode'] } })}
                options={[
                  { value: 'pip', label: '画中画', description: '左下角圆形小窗' },
                  { value: 'fullscreen', label: '全屏', description: '数字人占主体，PPT 降为半透明衬底' },
                  { value: 'off', label: '本页关闭', description: '不显示数字人' },
                ]}
              />
            </Field>

            {a.mode === 'pip' && (
              <>
                <Field label="位置">
                  <Select
                    ariaLabel="位置"
                    value={a.position}
                    onValueChange={(v) => patch({ avatar: { ...a, position: v as PageIR['avatar']['position'] } })}
                    options={[
                      { value: 'bottom-left', label: '左下角' },
                      { value: 'bottom-right', label: '右下角' },
                      { value: 'top-left', label: '左上角' },
                      { value: 'top-right', label: '右上角' },
                    ]}
                  />
                </Field>
                <Field label={`直径 ${a.diameter}px`} hint="范围 120–240">
                  <input
                    type="range"
                    min={120}
                    max={240}
                    step={8}
                    value={a.diameter}
                    aria-label="数字人直径"
                    onChange={(e) => patch({ avatar: { ...a, diameter: Number(e.target.value) } })}
                    className="w-full accent-[var(--brand-600)]"
                  />
                </Field>
              </>
            )}

            <div className="rounded-[var(--radius-control)] bg-[var(--surface-1)] p-3 text-[12px] leading-[1.6] text-[var(--text-3)]">
              数字人复用同一份讲稿音频，不重复配音。
              服务端口型视频尚未实现，导出与分享里呈现的是静态肖像。
            </div>
            {a.degraded && <Badge tone="warning" icon="TriangleAlert">本页数字人已降级</Badge>}
          </>
        )}
      </PanelGroup>
    </div>
  );
}

/* ---------------- 通用容器 ---------------- */

/**
 * 检查器分区。可折叠。
 *
 * 一页要调的东西（标题、正文、要点、页脚、图片、指标、图表、动效、讲稿、数字人）
 * 全部展开会长到要一直滚，所以每块都收起来，用户先看分区名再决定展开哪一块。
 * 默认展开，因为进到某个页签的人多半就是冲着那块来的。
 */
function PanelGroup({
  title, hint, children, defaultOpen = true, id,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  /** 让外面能滚到这一组（画布上点中图位时右栏要跳过去） */
  id?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section id={id} className="border-b border-[var(--border-subtle)] last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-2.5 py-2 text-left transition-colors duration-150 ease-out hover:bg-[var(--surface-1)]"
      >
        <Icon
          name="ChevronRight"
          size={16}
          className={cn('shrink-0 text-[var(--text-3)] transition-transform duration-150 ease-out', open && 'rotate-90')}
        />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--text-2)]">{title}</span>
        {hint && <span className="shrink-0 text-[10px] text-[var(--text-3)]" title={hint}>{hint}</span>}
      </button>
      {open && <div className="flex flex-col gap-2.5 px-2.5 pb-3.5">{children}</div>}
    </section>
  );
}

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });
}

export { IconButton };

/** 用 canvas 把任意图片统一转成 PNG data URL，与服务端只解 PNG 的口径一致 */
async function toPngDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布上下文');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/png');
}
