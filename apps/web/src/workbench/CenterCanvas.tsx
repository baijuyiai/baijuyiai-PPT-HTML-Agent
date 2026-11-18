import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, Icon, IconButton, SegmentedControl, StatusPill, Tooltip, useToast } from '@lumen/ui';
import { cn } from '@lumen/ui';
import { buildSlideContext, motionForMode } from '@lumen/render-engine';
import { brandOf, moduleOfLayoutId, type PageType, type PlanStep } from '@lumen/ir-schema';
import { Slide } from '@lumen/slides';
import type { PageIR, StylePack } from '../api/types.js';
import { useStudioLayouts, useStyleDoc } from '../api/hooks.js';
import { HtmlMock, usePageMockInputs } from '../components/HtmlMock.js';
import { useWorkbench, type PlanProgress } from './store.js';
import { SlideSkeleton } from './SlideSkeleton.js';
import { PlanningProgress } from './PlanningProgress.js';
import { GenerationReveal, revealAllowed } from './GenerationReveal.js';
import { SlotHandles } from './SlotHandles.js';
import { CanvasTextHandles, type CanvasSelection } from './CanvasTextHandles.js';

const CANVAS_W = 1920;
const CANVAS_H = 1080;

/** 按容器尺寸算出画布缩放比，保持 16:9 不变形 */
function useFitScale(padding = 48) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = () => {
      const w = el.clientWidth - padding * 2;
      const h = el.clientHeight - padding * 2;
      if (w <= 0 || h <= 0) return;
      setScale(Math.max(0.05, Math.min(w / CANVAS_W, h / CANVAS_H)));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [padding]);

  return { ref, scale };
}

export function CenterCanvas({
  pack, theme, onRegenerate, onGenerateAt, regenerating, generatingAt, regenProgress,
  selection, onSelect, frameRef, planning, planProgress,
}: {
  pack: StylePack | null;
  theme: 'light' | 'dark';
  /**
   * 画布那个 iframe。
   *
   * **由工作台持有再传进来**，不是这里自己建：右栏的文字面板要往同一个 iframe 里
   * 即时写一段文字做预览（敲字时画布上跟着变），而右栏是画布的兄弟，够不着它的 ref。
   */
  frameRef: React.RefObject<HTMLIFrameElement | null>;
  /** 画布上选中的是文字还是图位。右栏据此定位到对应那一条 */
  selection: CanvasSelection;
  onSelect: (s: CanvasSelection) => void;
  onRegenerate: (pageId: string) => void;
  /** 还没有页面的骨架屏上点「优先生成」：按大纲序号现生成一页 */
  onGenerateAt: (outlineIndex: number) => void;
  regenerating: boolean;
  /** 正在重跑的那一页走到哪一步、已经等了多少秒。不是这一页时为 null */
  regenProgress: { pageId: string; label: string; elapsed: number } | null;
  generatingAt: number | null;
  /**
   * 整本正在重排（提纲 / 教案）。非空时画布整个让给它。
   *
   * 规划是在「项目需求」那一屏点起来的，但用户随时会切回这一屏看画布——那时画布上
   * 摆着的是上一版的页面，看不出后台正在重排。占位摆成画布的尺寸，与骨架屏、
   * 失败占位同形，切过来的时候版面不跳。
   */
  planning: PlanStep | null;
  planProgress: PlanProgress | null;
}) {
  const toast = useToast();
  const { pages, statuses, activeIndex, outline, generating, genProgress, styleId, project, pendingLayouts } = useWorkbench();
  const setActiveIndex = useWorkbench((s) => s.setActiveIndex);
  // 页面是 HTML 时要拿这套风格的配色与字体栈才能装配文档。按 styleId 取，
  // 不透传——画布在四五层之下，透传会让中间每个组件都被迫知道风格
  const styleDoc = useStyleDoc(styleId || null);
  const { ref, scale: fitScale } = useFitScale();

  // **要 `useMemo` 包一层。** `brandOf(project)` 每次渲染都返回新对象，而 `HtmlMock` 的
  // `useMemo` 依赖里有 `brand`——直接传字面量会把那个 useMemo 打穿、每次渲染重算 srcDoc。
  // `store.project` 是稳定引用（来自查询结果，不是每次渲染新建），所以 `[project]` 够用。
  //
  // 实测过重算不会让 iframe 反复重载（`staggerSeed` 是 `activeIndex`，确定性，
  // 重算出来的 srcDoc 字符串与上次相同，React 按值比较不会重设属性）——所以这是白算一次的
  // 性能问题，不是正确性问题。但那个文件自己的注释写着「数组每次渲染都是新的……
  // 把 useMemo 打穿、iframe 反复重载」，同类坑踩过一次就够了。
  const brand = useMemo(() => (project ? brandOf(project) : undefined), [project]);

  /**
   * 缩放。默认「适应」把整页塞进可视区，切成「100%」时按原尺寸看——
   * 精修时常常需要看清一行字到底断在哪里，缩到 40% 是看不出来的。
   */
  const [zoom, setZoom] = useState<'fit' | 'actual'>('fit');
  const scale = zoom === 'fit' ? fitScale : 1;

  /** 演示中临时切换数字人三态：只影响当前会话，不回写页面设置（PRD §5.13） */
  const [avatarOverride, setAvatarOverride] = useState<Record<string, PageIR['avatar']['mode']>>({});
  const [cursorOn, setCursorOn] = useState(false);

  const page = pages[activeIndex] ?? null;
  const status = statuses[activeIndex] ?? 'pending';
  const total = pages.length;

  const go = useCallback((delta: number) => {
    setActiveIndex(Math.max(0, Math.min(activeIndex + delta, total - 1)));
  }, [activeIndex, total, setActiveIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1);
      else if (e.key === 'ArrowRight' || e.key === 'PageDown') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  /**
   * 全屏预览。
   *
   * **送进全屏的是外层那个容器（`useFitScale` 观察的那个），不是里面装画布的那一层。**
   * 原先送的是内层 stage——它变大了，但缩放比是按**外层容器**算的，外层尺寸没变，
   * 于是画面还是原来那么大，四周一片空。表现就是「全屏之后中间那页还是那么小」。
   *
   * 送外层则一切照旧：ResizeObserver 观察到容器变成屏幕大小，缩放比跟着重算，
   * 画布自己铺满。不用另写一套「全屏时按窗口算」的分支。
   */
  async function enterFullscreen() {
    const el = ref.current;
    if (!el) return;
    try {
      await el.requestFullscreen();
    } catch {
      toast.error('无法进入全屏', '浏览器拒绝了全屏请求');
    }
  }

  const override = page ? avatarOverride[page.pageId] : undefined;
  const rendered = page && override ? ({ ...page, avatar: { ...page.avatar, mode: override } } as PageIR) : page;

  /**
   * 这一页正在生成。四条来源各管一种入口：
   *
   * - `regenProgress`：单页重生成 / 换排版——它带着 pageId，能精确对上
   * - `generatingAt`：骨架屏上的「优先生成」
   * - `generating && !rendered?.html`：整本生成时，这一页还没出内容
   * - `genProgress[activeIndex]`：**服务端说这一页在写**。刷新之后只有它还在——
   *   前三条都是客户端状态，刷新即清零，而生成并没有停（它不跟着连接走）。
   *   少了这一条，「优先生成」那一页刷新回来画布上什么都没有（实测踩过）
   *
   * **四条各自判空，不能整体套一层 `page &&`。** 未生成的页在 store 里就是 `null`
   * （`pages[i]` 只有生成过才有值），套上去等于把「首次生成」整条路挡在门外——
   * 而那正是整本生成时每一页都要走的入口。实测踩过：整本生成跑完，揭示层一次都没出现。
   */
  const generatingThisPage = Boolean(
    (page && regenProgress?.pageId === page.pageId)
    || generatingAt === activeIndex
    || (generating && !rendered?.html)
    || genProgress[activeIndex] !== undefined,
  );

  /**
   * 生成中循环放的那张**通用框架**，按「这一页将要长成什么框架」取：
   *
   * 1. **用户在功能库挑的那份骨架**——挑完记在 `page.studioLayoutId` 上（见 `PageIR`），
   *    骨架本体从版式库接口拿（列表里就带 `skeleton`）。
   *    **刚挑、这一页还没生成完的那几十秒**读的是 `pendingLayouts` 里那条待定记录：
   *    页面上的 id 要等生成完才落库，而这一次生成就要画那份骨架（见 store 的注释）
   * 2. **风格里这个页类型的样机**——没挑功能时的通用框架
   * 3. 两者都没有 → 调用方退回骨架屏
   *
   * **不再画「这一页真实文案排出来的草稿」**：用户要的是通用——框架就该是这套风格
   * 自己的样子、文字是方向性占位，于是任何风格 × 任何页类型都画得出来、一眼认得出
   * 是哪套风格。真实内容在真页落地那一刻由揭幕那一遍带出来。
   */
  const revealHtml = rendered?.html ?? '';
  const revealPageType = (outline[activeIndex]?.pageType ?? rendered?.pageType ?? 'text') as PageType;
  const pickedLayoutId = page?.studioLayoutId
    || (page ? pendingLayouts[page.pageId] ?? '' : '');
  const pickedModule = pickedLayoutId ? moduleOfLayoutId(pickedLayoutId) : null;
  const pickedLayouts = useStudioLayouts(pickedModule);
  const pickedSkeleton = pickedLayoutId
    ? (pickedLayouts.data?.items.find((l) => l.id === pickedLayoutId)?.skeleton ?? '')
    : '';
  const mockHtml = styleDoc.data?.pagePrompts[revealPageType]?.mockHtml ?? '';
  const frameHtml = pickedSkeleton || mockHtml;

  /** 减动效时不做揭示，换成静态呈现。挂载时读一次就够 */
  const [revealOk] = useState(revealAllowed);

  /**
   * 这一页是从什么时候开始生成的。**服务端登记的那一份**——刷新也还在，
   * 所以揭示层画的进度切页、刷新之后都接得上（见 `GenerationReveal`）。
   */
  const startedAt = genProgress[activeIndex]?.startedAt;

  /**
   * 揭示按「轮」算，`GenerationReveal` 内部记的基线（开场时这一页已有的 html）靠它重来。
   *
   * 身份的判据是**「从没在生成变成在生成」这个上升沿**，不是一个字符串拼出来的键。
   * 拼字符串踩过两种坑：`generatingAt`（骨架屏上的「优先生成」）在 mutation 落定那一刻
   * 变回 null，`startedAt` 在服务端清掉这一页的登记时从 store 里消失——两者都会在
   * **一轮还没演完**的时候把轮次换掉，揭示层跟着重挂、基线跟着重记，于是真页落地那次
   * 永远判不出来，画面上就一直循环放框架。
   *
   * 三个下标：
   * - `revealRound`：当前是第几轮（上升沿自增）
   * - `heldRound`：**正在揭幕**的那一轮——那一遍要走完，中途服务端收尾、轮询把
   *   `generatingThisPage` 翻成假也不能把揭示层撤掉（不然揭幕演到一半被硬切）
   * - `revealedRound`：揭幕已经放完的那一轮——放完就露出真页
   */
  const [revealRound, setRevealRound] = useState(0);
  const wasGenerating = useRef(false);
  useEffect(() => {
    if (generatingThisPage && !wasGenerating.current) setRevealRound((n) => n + 1);
    wasGenerating.current = generatingThisPage;
  }, [generatingThisPage]);
  const [heldRound, setHeldRound] = useState(-1);
  const [revealedRound, setRevealedRound] = useState(-1);
  const revealVisible = Boolean(frameHtml)
    && revealedRound !== revealRound
    && (generatingThisPage || heldRound === revealRound);

  /**
   * 揭示态底下那行说明。
   *
   * 单页重生成时服务端会推真实的说明（「正在调用模型写这一页」），连已等秒数一起显示；
   * 整本生成没有逐页的等待时长可报，就只说在生成。
   * **两边都不编阶段名**——模型一次调用出整页，没有可报的中间步骤。
   */
  const revealLabel = regenProgress && page && regenProgress.pageId === page.pageId
    ? `${regenProgress.label} · 已等 ${regenProgress.elapsed} 秒`
    : '正在生成这一页';

  /**
   * 渲染这一页需要的输入（正文、页类型、页码、数字人、图位调整、品牌）。
   *
   * **项目库封面用的是同一个 hook**，这是刻意的：两处渲染的是同一页，
   * 各拼各的迟早会漂——事实上就漂过，封面没传 `overrides` 也没传 `avatar`，
   * 卡片上那张和工作台里这张根本是两页。画布独有的东西（`cursor`、`staggerSeed`、
   * `frameRef`、`overlay`）不进 hook，在下面单独传。
   *
   * `overrides` 也从这里取：它是同一份数据，另开一个 memo 只是白算一遍。
   */
  const mockInputs = usePageMockInputs(rendered, brand);
  const imageOverrides = mockInputs.overrides;

  /**
   * 画布上拖图位。松手才写覆盖表——拖动过程中手柄直接改 iframe 里那个元素的内联
   * `translate`，见 `SlotHandles` 的注释。
   *
   * 与右栏面板写的是同一份 `page.overrides.images`，所以拖完右栏的滑杆立刻跟着动。
   */
  const updatePage = useWorkbench((s) => s.updatePage);
  const moveSlot = useCallback((index: number, dx: number, dy: number) => {
    const p = pages[activeIndex];
    if (!p) return;
    const images = { ...imageOverrides, [String(index)]: { ...imageOverrides[String(index)], dx, dy } };
    updatePage(activeIndex, { overrides: { ...p.overrides, images } });
  }, [pages, activeIndex, imageOverrides, updatePage]);

  const ctx = rendered && pack
    ? buildSlideContext(rendered, pack, { theme, mode: 'edit' })
    : null;

  return (
    // min-w-0 + flex-1：中间这栏必须吃掉两边的剩余宽度，否则它会按内容宽收着，
    // 右侧的检查器就顶不到窗口右缘，中间留出一道空隙。
    // min-w-0 是必需的：没有它，flex 子项的最小宽度是内容宽，画布缩不下来。
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[var(--page-bg)]">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-3">
        <Tooltip content="上一页">
          <IconButton name="ChevronLeft" label="上一页" size={16} disabled={activeIndex <= 0} onClick={() => go(-1)} />
        </Tooltip>
        <span className="min-w-[52px] text-center font-[var(--font-mono)] text-[12px] tabular-nums text-[var(--text-2)]">
          {total === 0 ? '0 / 0' : `${activeIndex + 1} / ${total}`}
        </span>
        <Tooltip content="下一页">
          <IconButton name="ChevronRight" label="下一页" size={16} disabled={activeIndex >= total - 1} onClick={() => go(1)} />
        </Tooltip>

        {page && (
          <>
            <span className="mx-1 h-4 w-px bg-[var(--border)]" />
            <span className="truncate font-[var(--font-mono)] text-[11px] text-[var(--text-3)]">{page.layoutVariant}</span>
            {page.degradeReason && (
              <Tooltip content={page.degradeReason}>
                <StatusPill tone={status === 'failed' ? 'error' : 'warning'}>
                  {status === 'failed' ? '没生成出来' : '降级'}
                </StatusPill>
              </Tooltip>
            )}
          </>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <SegmentedControl
            size="sm"
            value={zoom}
            onChange={setZoom}
            options={[
              { value: 'fit', label: '适应' },
              { value: 'actual', label: '100%' },
            ]}
          />

          {page && (
            <Tooltip content="演示中临时切换数字人（不回写设置）">
              <Button
                size="sm"
                pill
                variant="ghost"
                icon="UserRound"
                onClick={() => {
                  const modes: PageIR['avatar']['mode'][] = ['pip', 'fullscreen', 'float', 'off'];
                  const cur = override ?? page.avatar.mode;
                  const next = modes[(modes.indexOf(cur) + 1) % modes.length]!;
                  setAvatarOverride((prev) => ({ ...prev, [page.pageId]: next }));
                }}
              >
                {override ?? page.avatar.mode}
              </Button>
            </Tooltip>
          )}
          {page?.script.cursorEnabled && (
            <Tooltip content="预览讲解光标">
              <Button size="sm" pill variant={cursorOn ? 'primary' : 'ghost'} icon="MousePointer2" onClick={() => setCursorOn((v) => !v)}>
                光标
              </Button>
            </Tooltip>
          )}
          <Tooltip content="全屏预览">
            <IconButton name="Maximize2" label="全屏预览" size={16} onClick={() => void enterFullscreen()} />
          </Tooltip>
        </div>
      </div>

      <div
        ref={ref}
        className={cn(
          'lumen-grid-bg relative flex min-h-0 flex-1 items-center justify-center',
          zoom === 'actual' ? 'overflow-auto' : 'overflow-hidden',
        )}
      >
        {/* 画布后面一层柔光。参考稿里每块主体内容背后都有这么一层，
            作用是让画布从网格底上「浮」起来，而不是贴在上面 */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{
            width: Math.round(1920 * scale * 1.5),
            height: Math.round(1080 * scale * 1.6),
            background: 'radial-gradient(closest-side, color-mix(in srgb, var(--brand-500) 22%, transparent), transparent)',
            opacity: 0.5,
          }}
        />

        <div className={cn('relative flex items-center justify-center', zoom === 'actual' && 'p-6')}>
          {/*
            新链路的页面是模型写的 HTML，走 iframe 渲染；旧链路按 blocks 排版，走 Slide。
            两条路并存期间按「这一页有没有 html」分流，同一本 deck 里可以混着都有。
          */}
          {/*
            整本在重排（提纲 / 教案）时，画布整个让给进度。**排在所有分支最前面**：
            那会儿手上这一页马上要被模型重写，照着旧的画出来反而误导。
            占位摆成画布的尺寸，与骨架屏、失败占位同形，切过来版面不跳。
          */}
          {/*
            正在生成时**优先走揭示**，排在「有 html 就显示 html」之前：
            重生成一页时它是有 html 的，不先拦一道的话画布上原样显示旧页面，
            用户完全看不出在跑——这正是加这条分支要解决的事。

            画的是**通用框架**（挑过的骨架 / 这套风格该页类型的样机），循环放；
            真页一落地，`GenerationReveal` 自己接着在真页上走一遍揭幕，走完叫一声，
            这里的 `revealedRound` 就记下那一轮，下一帧换成真页。

            拿不到框架（没有挑过的骨架、这套风格也没给这个页类型写过样机）时退回骨架屏：
            **这一条也排在显示旧页面之前**，否则重生成时还是只能看着一页不动的旧内容发呆。

            `key` 是这一轮的标识（见 `revealRound` 的注释）：换页、换生成轮次都要让
            揭示层连同它内部记的「开场基线」一起重来，否则基线会从上一轮带过来、
            重生成时一开场就被判成「已经落地」。
          */}
          {planning ? (
            <div
              style={{ width: CANVAS_W * scale, height: CANVAS_H * scale }}
              className="overflow-hidden rounded-[4px] border border-[var(--border-subtle)] bg-[var(--surface-0)]"
            >
              <PlanningProgress
                step={planning}
                label={planProgress?.label ?? null}
                progress={planProgress}
                hint="整本重排，要跑几分钟"
              />
            </div>
          ) : revealVisible && styleDoc.data ? (
            <GenerationReveal
              key={revealRound}
              frameHtml={frameHtml}
              html={revealHtml}
              doc={styleDoc.data}
              pageNo={activeIndex + 1}
              totalPages={total}
              width={Math.round(CANVAS_W * scale)}
              label={revealLabel}
              chartStyle={project?.chartStyle}
              animate={revealOk}
              {...(startedAt === undefined ? {} : { startedAt })}
              // 真页落地：把这一轮钉住，揭幕那一遍演完为止（见 revealRound 的注释）
              onLanded={() => setHeldRound(revealRound)}
              onPlayedOnce={() => setRevealedRound(revealRound)}
            />
          ) : generatingThisPage ? (
            <SlideSkeleton scale={scale} label="正在生成这一页" />
          ) : rendered?.html && styleDoc.data ? (
            <HtmlMock
              doc={styleDoc.data}
              width={Math.round(CANVAS_W * scale)}
              {...mockInputs}
              staggerSeed={activeIndex}
              // 图表风格跟着项目走：项目行上存的那一份，与导出件用的是同一个值
              chartStyle={project?.chartStyle}
              cursor={cursorOn ? { x: 0.62, y: 0.38, visible: true } : null}
              frameRef={frameRef}
              overlay={(
                <>
                  {/*
                    选中层在图位手柄**下面**（DOM 里更靠前）。生成中不挂——
                    那一会儿画的是揭示层，点它没有意义。

                    **两层不是各管各的**：图位手柄铺满整个图位框，而封面那种主视觉
                    几乎压住整页文字，所以手柄「点一下」时会先问一句这点上有没有文字，
                    有就让给文字（见 `SlotHandles` 顶部）。拖动仍由手柄独占。
                  */}
                  <CanvasTextHandles
                    frameRef={frameRef}
                    scale={Math.round(CANVAS_W * scale) / CANVAS_W}
                    selection={selection}
                    onSelect={onSelect}
                  />
                  <SlotHandles
                    frameRef={frameRef}
                    scale={Math.round(CANVAS_W * scale) / CANVAS_W}
                    overrides={imageOverrides}
                    onChange={moveSlot}
                    onSelect={onSelect}
                  />
                </>
              )}
              className="shadow-[0_24px_64px_rgba(0,0,0,.45)]"
            />
          ) : ctx ? (
            <Slide
              ctx={ctx}
              scale={scale}
              cursor={cursorOn ? { x: 0.62, y: 0.38, visible: true } : null}
              style={{ boxShadow: '0 24px 64px rgba(0,0,0,.45)', borderRadius: 6, overflow: 'hidden' }}
            />
          ) : status === 'generating' || generating ? (
            <SlideSkeleton scale={scale} label="正在生成这一页" />
          ) : status === 'failed' ? (
            /**
             * 失败页**不能落进「优先生成」那个占位**：那一格会同时出现「本页生成失败」
             * 和「优先生成」两个说法，用户不知道该信哪个。这里给一个静态的失败占位，
             * 动作统一走下面那条失败条上的「重试」。
             */
            <div
              style={{ width: CANVAS_W * scale, height: CANVAS_H * scale }}
              className="flex flex-col items-center justify-center gap-3 rounded-[4px] border border-dashed border-[var(--error)] bg-[var(--surface-0)]"
            >
              <Icon name="CircleAlert" size={24} />
              <span className="text-[15px] font-medium text-[var(--text-1)]">这一页没生成出来</span>
              <span className="max-w-[60%] truncate font-[var(--font-mono)] text-[12px] tabular-nums text-[var(--text-3)]">
                第 {activeIndex + 1} 页 · {outline[activeIndex]?.title ?? ''}
              </span>
            </div>
          ) : (
            <UngeneratedState
              scale={scale}
              index={activeIndex}
              outlineTitle={outline[activeIndex]?.title ?? ''}
              busy={generatingAt === activeIndex}
              onGenerate={() => {
                const p = pages[activeIndex];
                // 已存在的页走重生成，不存在的页按大纲序号现生成——两条路都能真的产出内容
                if (p) onRegenerate(p.pageId);
                else onGenerateAt(activeIndex);
              }}
            />
          )}
        </div>

        {/*
          **失败不在这里报。** 原先画布底部常驻一条「本页生成失败 + 重试」，
          而右栏顶上同时摆着同一件事（连失败原因都写全了）。同一句话在一个屏幕上
          说两遍，画布那条还正好压在缩略图导航条上方，把画面切得很难看。
          所以收成一处：右栏顶上那条说原因，底部的「重新生成」是重试入口。
          画布这边**照旧把这页已有的样子画出来**——它是有内容的，只是没通过校验，
          用户看得见才好判断要不要重跑。
        */}

        {/* 缩略图导航条 */}
        {total > 1 && (
          <div className="absolute bottom-3 left-1/2 flex max-w-[80%] -translate-x-1/2 items-center gap-1.5 overflow-x-auto rounded-full bg-[var(--surface-0)]/92 px-2.5 py-1.5 shadow-[var(--shadow-sm)] backdrop-blur">
            {pages.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`跳到第 ${i + 1} 页`}
                onClick={() => setActiveIndex(i)}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-150 ease-out',
                  i === activeIndex ? 'w-5 bg-[var(--brand-500)]' : 'w-1.5 bg-[var(--neutral-300)] hover:bg-[var(--neutral-500)]',
                )}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function UngeneratedState({
  scale, index, outlineTitle, busy, onGenerate,
}: { scale: number; index: number; outlineTitle: string; busy: boolean; onGenerate: () => void }) {
  return (
    <div
      style={{ width: CANVAS_W * scale, height: CANVAS_H * scale }}
      className="relative flex flex-col items-center justify-center gap-4 overflow-hidden rounded-[4px] border border-dashed border-[var(--border)] bg-[var(--surface-0)] shadow-[var(--shadow-sm)]"
    >
      <SlideSkeleton scale={scale} label="" absolute />
      <div className="relative z-10 flex flex-col items-center gap-3">
        <span className="font-[var(--font-mono)] text-[12px] tabular-nums text-[var(--text-3)]">
          第 {index + 1} 页
        </span>
        <span className="max-w-[60%] text-center text-[15px] font-medium text-[var(--text-1)]">
          {outlineTitle || '尚未生成'}
        </span>
        <Button variant="primary" icon="Sparkles" loading={busy} onClick={onGenerate}>优先生成</Button>
      </div>
    </div>
  );
}

export { motionForMode };
