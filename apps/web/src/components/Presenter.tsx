import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Icon, IconButton, Tooltip } from '@lumen/ui';
import { cn } from '@lumen/ui';
import { buildSlideContext } from '@lumen/render-engine';
import { resolveMotion } from '@lumen/motion';
import { Slide } from '@lumen/slides';
import type { BrandSlot, MotionName } from '@lumen/ir-schema';
import type { AvatarMode, PageIR, StyleDoc, StylePack } from '../api/types.js';
import { fetchBlob } from '../api/client.js';
import { FlipStage } from './FlipStage.js';
import { imageOverridesOf } from '@lumen/ir-schema';
import { HtmlMock } from './HtmlMock.js';

const AVATAR_MODE_LABEL: Record<AvatarMode, string> = {
  pip: '画中画',
  fullscreen: '数字人全屏',
  float: '右下角浮框',
  off: '本页关闭',
};

/**
 * 讲稿分段的时长估算口径：中文每字 220ms。
 *
 * **必须与服务端 `script-generate.ts` 的 `MS_PER_CJK_CHAR` 一致**——
 * 两边不一致，按比例定位光标就会整体偏移。
 */
const MS_PER_CHAR = 220;

export interface PresenterProps {
  pages: PageIR[];
  /**
   * 旧链路的风格包。**新链路项目这里是 null，那是正常的**——
   * 那些页面走 iframe 渲染，不需要包。两条链路按「这一页有没有 html」分流。
   */
  pack: StylePack | null;
  /** 新链路的风格文档。旧链路项目是 null */
  styleDoc: StyleDoc | null;
  theme: 'light' | 'dark';
  title: string;
  /** 项目品牌。没有品牌的项目传 undefined */
  brand?: BrandSlot;
  /**
   * 从第几页开始。工作台的「从当前页开始」用它（`?page=N`）。
   * 越界与非法值在这里夹住——只有这里知道一共几页。
   */
  startIndex?: number;
  /** 退出演示（返回编辑或关闭） */
  onExit?: () => void;
}

const CANVAS_W = 1920;
const CANVAS_H = 1080;

/**
 * 锚点 → 画布坐标。
 *
 * `html:` 前缀的是新链路：服务端没有版式，量不出坐标，只给了**页面上的那段文字**，
 * 位置得在这里按文字找元素。找不到就**按序号摊开**——第 i 段落在第 i/N 块内容上。
 * 讲稿本来就是顺着页面往下讲的，摊开至少让光标跟着走，比停在原地强。
 */
function resolveAnchor(
  anchor: { targetId: string; x: number; y: number },
  boxes: { text: string; x: number; y: number }[],
  segIndex: number,
  segCount: number,
): { x: number; y: number } {
  const prefix = 'html:';
  if (!anchor.targetId.startsWith(prefix) || boxes.length === 0) {
    return { x: anchor.x, y: anchor.y };
  }
  const needle = anchor.targetId.slice(prefix.length);
  const hit = needle ? boxes.find((b) => b.text.includes(needle)) : undefined;
  if (hit) return { x: hit.x, y: hit.y };

  const at = Math.min(boxes.length - 1, Math.floor((segIndex / Math.max(1, segCount)) * boxes.length));
  const fallback = boxes[at]!;
  return { x: fallback.x, y: fallback.y };
}

/**
 * 演示态。
 * 键盘方向键 / 空格 / 点击左右半屏 / 触摸滑动都能翻页；
 * 讲解开启时用浏览器语音合成朗读讲稿，词级边界事件驱动讲解光标。
 */
export function Presenter({ pages, pack, styleDoc, theme, title, brand, startIndex = 0, onExit }: PresenterProps) {
  const [index, setIndex] = useState(() => {
    if (!Number.isFinite(startIndex)) return 0;
    return Math.max(0, Math.min(Math.trunc(startIndex), pages.length - 1));
  });
  const [scale, setScale] = useState(0.5);
  const [narrating, setNarrating] = useState(false);
  const [cursor, setCursor] = useState<{ x: number; y: number; visible: boolean } | null>(null);
  const [showChrome, setShowChrome] = useState(true);
  const [thumbnailsOpen, setThumbnailsOpen] = useState(false);
  /**
   * 演示中临时切换数字人三态（PRD §5.13）。
   * 只改这一份会话副本，不回写页面设置，退出演示即恢复。
   */
  const [avatarOverride, setAvatarOverride] = useState<AvatarMode | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const chromeTimer = useRef<number | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  /**
   * 这一页各内容块的中心（画布比例）。讲稿锚点按文字来查它。
   *
   * 用 ref 不用 state：讲稿那段 effect 建的是闭包，把量出来的位置放进依赖里会让
   * **每量一次就重启一次朗读**。位置只是查询表，不参与渲染。
   */
  const anchorBoxesRef = useRef<{ text: string; x: number; y: number }[]>([]);
  /**
   * 正在播放的音频元素。用 `new Audio()` 而不是 `<audio>` 标签：
   * 访问令牌只在内存里，标签自己发的请求带不上 Authorization 头。
   */
  const audioRef = useRef<HTMLAudioElement | null>(null);
  /**
   * `narrating` 的镜像。`ended` 回调是建在 effect 里的闭包，直接读 state 会读到
   * 建闭包那一刻的旧值——讲到第二页时它还以为讲解是关的，于是不会自动翻页。
   */
  const narratingRef = useRef(false);
  narratingRef.current = narrating;
  /**
   * 每页音频的 objectURL。合成一页要 3~4 秒，所以当前页在播时就要把下一页取回来，
   * 否则每页之间都会空一段。取到就留着复用，组件卸载时统一 revoke。
   */
  const audioUrlsRef = useRef(new Map<string, Promise<string>>());
  /** 讲解音频还在取（首次合成要等几秒）。用来在界面上给个交代 */
  const [narrationLoading, setNarrationLoading] = useState(false);

  /**
   * 取某一页的讲解音频，返回可直接播放的 objectURL。
   * 同一页并发只发一次请求——预取与真正播放很可能同时要它。
   */
  const loadNarration = useCallback((pageId: string): Promise<string> => {
    const cached = audioUrlsRef.current.get(pageId);
    if (cached) return cached;
    const pending = fetchBlob(`/pages/${pageId}/narration`)
      .then((blob) => URL.createObjectURL(blob))
      .catch((err: unknown) => {
        // 失败的不留在缓存里，否则这一整场演示都不会再重试
        audioUrlsRef.current.delete(pageId);
        throw err;
      });
    audioUrlsRef.current.set(pageId, pending);
    return pending;
  }, []);

  // 卸载时把这一场用过的 objectURL 全部释放，不然 blob 会一直挂在内存里
  useEffect(() => {
    const urls = audioUrlsRef.current;
    return () => {
      for (const pending of urls.values()) {
        void pending.then((url) => URL.revokeObjectURL(url)).catch(() => {});
      }
      urls.clear();
    };
  }, []);

  const page = pages[index] ?? null;


  /* ---- 画布缩放：始终铺满视口并保持 16:9 ---- */
  useEffect(() => {
    const compute = () => {
      setScale(Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H));
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);

  const go = useCallback((delta: number) => {
    setIndex((i) => Math.max(0, Math.min(i + delta, pages.length - 1)));
  }, [pages.length]);

  const goTo = useCallback((i: number) => {
    setIndex(Math.max(0, Math.min(i, pages.length - 1)));
  }, [pages.length]);

  /* ---- 键盘与触摸 ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowDown':
        case ' ':
        case 'PageDown':
          e.preventDefault();
          go(1);
          break;
        case 'ArrowLeft':
        case 'ArrowUp':
        case 'PageUp':
          e.preventDefault();
          go(-1);
          break;
        case 'Home':
          e.preventDefault();
          goTo(0);
          break;
        case 'End':
          e.preventDefault();
          goTo(pages.length - 1);
          break;
        case 'Escape':
          // 全屏数字人是「这一页放大看」，Esc 先把它收回画中画，再按一次才退出演示
          if (avatarOverride === 'fullscreen') setAvatarOverride('pip');
          else if (document.fullscreenElement) void document.exitFullscreen();
          else onExit?.();
          break;
        case 'f':
        case 'F':
          void toggleFullscreen();
          break;
        case 'n':
        case 'N':
          setNarrating((v) => !v);
          break;
        case 'g':
        case 'G':
          setThumbnailsOpen((v) => !v);
          break;
        case 'a':
        case 'A':
          cycleAvatar();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, goTo, onExit, pages.length, avatarOverride]);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
    } catch {
      // 用户或浏览器拒绝时不阻断演示
    }
  }

  /* ---- 量内容块的位置：讲稿锚点按文字来查 ---- */

  /**
   * 量出这一页各内容块的中心（画布比例 0~1）。
   *
   * 只取「**直接含文字**」的元素：子元素里已经有文字的，那是外层容器，它的中心可能
   * 落在半页之外，光标停过去没有意义。
   *
   * 量出来的是 iframe 自己的坐标系。iframe 就是 1920×1080（缩放挂在外层），
   * 所以直接除以画布尺寸就是比例，与 `NewChainCursor` 用的坐标系一致。
   */
  const measureAnchors = useCallback(() => {
    const doc = frameRef.current?.contentDocument;
    if (!doc?.body) {
      anchorBoxesRef.current = [];
      return;
    }
    const found: { text: string; x: number; y: number }[] = [];
    for (const el of doc.body.querySelectorAll<HTMLElement>('*')) {
      const ownText = [...el.childNodes].some(
        (n) => n.nodeType === 3 && (n.textContent ?? '').trim().length >= 2,
      );
      if (!ownText) continue;
      const r = el.getBoundingClientRect();
      // 塌掉或只有几像素的元素（装饰线、空壳）不参与：光标停上去等于停在一个点上
      if (r.width < 8 || r.height < 8) continue;
      const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      if (text.length < 2) continue;
      found.push({
        text,
        x: (r.left + r.width / 2) / CANVAS_W,
        y: (r.top + r.height / 2) / CANVAS_H,
      });
    }
    anchorBoxesRef.current = found;
  }, []);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) {
      measureAnchors();
      return;
    }
    // iframe 每次换 srcdoc 都会重载，元素全部重建，位置得重新量
    el.addEventListener('load', measureAnchors);
    measureAnchors();
    return () => el.removeEventListener('load', measureAnchors);
  }, [measureAnchors, page?.pageId]);

  /* ---- 讲解：播放音频 + 音频时钟驱动光标 + 讲完自动翻页 ---- */
  useEffect(() => {
    if (!narrating || !page) {
      setCursor(null);
      setNarrationLoading(false);
      return;
    }
    const segments = page.script.segments;
    // 没有分段就没有锚点可指，光标无处可去；但音频照播
    const el = new Audio();
    audioRef.current = el;
    setNarrationLoading(true);

    /**
     * 估算轴总长：**最后一段的末尾**，不是 `script.text.length`。
     * 分段的 `t` 是按字数累加出来的，两者比例相同，但用最后一段的末尾才与
     * 分段自己的坐标系对齐。
     */
    const estTotal = Math.max(
      1,
      segments.reduce((max, s) => Math.max(max, s.t + s.text.length * MS_PER_CHAR), 0),
    );

    /** 把估算轴上的毫秒数落到具体分段，再取该段锚点 */
    const applyCursor = (ms: number) => {
      if (segments.length === 0) return;
      let i = 0;
      while (i < segments.length - 1 && segments[i + 1]!.t <= ms) i += 1;
      const seg = segments[i];
      if (seg?.anchor && seg.cursor !== false) {
        const pos = resolveAnchor(seg.anchor, anchorBoxesRef.current, i, segments.length);
        setCursor({ x: pos.x, y: pos.y, visible: true });
      } else {
        setCursor((c) => (c ? { ...c, visible: false } : null));
      }
    };

    const onTime = () => {
      // 真实时长把「220ms/字」这个估算校正成模型的实际语速
      if (!Number.isFinite(el.duration) || el.duration <= 0) return;
      applyCursor((el.currentTime / el.duration) * estTotal);
    };
    const onLoaded = () => {
      setNarrationLoading(false);
      applyCursor(0);
    };
    const onEnded = () => {
      setCursor(null);
      // 自动翻页：这一页讲完就接着讲下一页
      if (narratingRef.current) setIndex((i) => Math.min(i + 1, pages.length - 1));
    };

    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onLoaded);
    el.addEventListener('ended', onEnded);

    let cancelled = false;
    void loadNarration(page.pageId)
      .then((url) => {
        if (cancelled) return;
        el.src = url;
        return el.play();
      })
      .catch(() => {
        if (cancelled) return;
        // 取不到音频不该把整场演示卡住，退回「没有讲解」的样子
        setNarrationLoading(false);
        setNarrating(false);
      });

    // 当前页在播的同时把下一页取回来，掩盖 3~4 秒的合成
    const next = pages[index + 1];
    if (next) void loadNarration(next.pageId).catch(() => {});

    // 离开页面即停（PRD §5.9 路径 A 验收）
    return () => {
      cancelled = true;
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onLoaded);
      el.removeEventListener('ended', onEnded);
      el.pause();
      el.removeAttribute('src');
      audioRef.current = null;
    };
  }, [narrating, page?.pageId, pages.length, loadNarration]);

  /* ---- 控件自动隐藏 ---- */
  const pokeChrome = useCallback(() => {
    setShowChrome(true);
    if (chromeTimer.current) window.clearTimeout(chromeTimer.current);
    chromeTimer.current = window.setTimeout(() => setShowChrome(false), 2600);
  }, []);

  useEffect(() => {
    pokeChrome();
    return () => {
      if (chromeTimer.current) window.clearTimeout(chromeTimer.current);
    };
  }, [pokeChrome]);

  const shownPage = useMemo(
    () => (page && avatarOverride ? { ...page, avatar: { ...page.avatar, mode: avatarOverride } } : page),
    [page, avatarOverride],
  );
  /**
   * 图位调整。演示态必须与工作台看到的一致——少传这一份就会出现
   * 「编辑器里换掉的图，一按演示又变回去了」。
   */
  const imageOverrides = useMemo(
    () => imageOverridesOf(shownPage?.overrides),
    [shownPage],
  );

  const avatarMode = shownPage?.avatar.enabled ? shownPage.avatar.mode : null;

  const cycleAvatar = useCallback(() => {
    if (!page?.avatar.enabled) return;
    const order: AvatarMode[] = ['pip', 'fullscreen', 'float', 'off'];
    const current = avatarOverride ?? page.avatar.mode;
    const next = order[(order.indexOf(current) + 1) % order.length]!;
    setAvatarOverride(next);
  }, [page, avatarOverride]);

  /**
   * 这一页走哪条渲染链路。
   *
   * 判据与工作台的 `CenterCanvas` 逐字一致：**这一页有没有 html**。
   * 新链路的页面 `blocks` 是空的、内容全在 `html` 里，拿它去 `buildSlideContext`
   * 只会渲染出一个空壳；反过来旧链路的页面没有 html，走 iframe 就是一片空白。
   */
  const isHtmlPage = Boolean(shownPage && shownPage.html.trim().length > 0 && styleDoc);

  /**
   * 这一页要播的动效，**先解析再往下传**：页面这一层给翻页层，元素这一层给内层渲染器。
   */
  const motion = useMemo(
    () => resolveMotion(shownPage?.motion ?? { enter: 'none', from: 'style-pack' }, index),
    [shownPage, index],
  );

  const ctx = useMemo(
    // 翻页层负责整页的进出，内层再动一次就是双份位移；元素逐块进场翻页层管不到，留给内层
    () => (shownPage && pack && !isHtmlPage
      ? buildSlideContext(shownPage, pack, {
        theme, mode: 'present', motion: 'none', staggerSeed: motion.staggerSeed,
      })
      : null),
    [shownPage, pack, theme, isHtmlPage, motion],
  );

  if (pages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-[#16181D] text-white/70">
        <p className="text-sm">没有可演示的页面</p>
      </div>
    );
  }

  return (
    <div
      ref={stageRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[#16181D]"
      onMouseMove={pokeChrome}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (t) touchStart.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(e) => {
        const start = touchStart.current;
        const t = e.changedTouches[0];
        touchStart.current = null;
        if (!start || !t) return;
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
        else if (Math.abs(dy) > 64) go(dy < 0 ? 1 : -1);
      }}
    >
      <FlipStage pageKey={shownPage?.pageId ?? ''} motion={motion.page}>
        {isHtmlPage && shownPage && styleDoc ? (
          <HtmlMock
            doc={styleDoc}
            html={shownPage.html}
            width={Math.round(CANVAS_W * scale)}
            pageType={shownPage.pageType}
            pageNo={shownPage.footer.pageNo}
            // 演示态要铺满整屏，不要样机那个描边外框
            frame={false}
            staggerSeed={motion.staggerSeed}
            avatar={shownPage.avatar}
            cursor={narrating ? cursor : null}
            brand={brand}
            overrides={imageOverrides}
            // 讲稿锚点按文字找元素要读 iframe 的 DOM，量各内容块的中心
            frameRef={frameRef}
          />
        ) : ctx ? (
          <Slide ctx={ctx} scale={scale} cursor={narrating ? cursor : null} />
        ) : (
          <div className="text-white/60">正在准备演示</div>
        )}
      </FlipStage>

      {/* 点击左右半屏翻页 */}
      <button
        type="button"
        aria-label="上一页"
        className="absolute left-0 top-0 h-full w-[35%] cursor-w-resize opacity-0"
        onClick={() => go(-1)}
      />
      <button
        type="button"
        aria-label="下一页"
        className="absolute right-0 top-0 h-full w-[35%] cursor-e-resize opacity-0"
        onClick={() => go(1)}
      />

      {/* 顶部控件 */}
      <div
        className={cn(
          'absolute left-0 right-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/55 to-transparent px-5 py-3.5 transition-opacity duration-200',
          showChrome ? 'opacity-100' : 'opacity-0',
        )}
      >
        <span className="truncate text-[13px] font-medium text-white/85">{title}</span>
        <div className="ml-auto flex items-center gap-1">
          <Tooltip content={narrating ? '停止讲解（N）' : '开始讲解（N）'}>
            <Button
              size="sm"
              variant={narrating ? 'primary' : 'ghost'}
              icon={narrating ? 'Volume2' : 'VolumeX'}
              loading={narrationLoading}
              className="text-white hover:bg-white/10"
              onClick={() => setNarrating((v) => !v)}
            >
              {narrationLoading ? '生成讲解' : '讲解'}
            </Button>
          </Tooltip>
          {page?.avatar.enabled && (
            <Tooltip content="切换数字人显示方式（A）">
              <Button
                size="sm"
                variant="ghost"
                icon={avatarMode === 'off' ? 'UserRoundX' : 'UserRound'}
                className="text-white hover:bg-white/10"
                onClick={cycleAvatar}
              >
                {AVATAR_MODE_LABEL[avatarMode ?? 'pip']}
              </Button>
            </Tooltip>
          )}
          <Tooltip content="缩略图导航（G）">
            <IconButton
              name="LayoutGrid"
              label="缩略图导航"
              size={16}
              className="text-white hover:bg-white/10"
              onClick={() => setThumbnailsOpen((v) => !v)}
            />
          </Tooltip>
          <Tooltip content="全屏（F）">
            <IconButton
              name="Maximize2"
              label="全屏"
              size={16}
              className="text-white hover:bg-white/10"
              onClick={() => void toggleFullscreen()}
            />
          </Tooltip>
          {onExit && (
            <Tooltip content="退出演示（Esc）">
              <IconButton name="X" label="退出演示" size={16} className="text-white hover:bg-white/10" onClick={onExit} />
            </Tooltip>
          )}
        </div>
      </div>

      {/* 底部进度 */}
      <div
        className={cn(
          'absolute bottom-0 left-0 right-0 flex items-center gap-4 bg-gradient-to-t from-black/55 to-transparent px-5 py-4 transition-opacity duration-200',
          showChrome ? 'opacity-100' : 'opacity-0',
        )}
      >
        <IconButton name="ChevronLeft" label="上一页" size={16} className="text-white hover:bg-white/10" disabled={index === 0} onClick={() => go(-1)} />
        <span className="font-[var(--font-mono)] text-[13px] tabular-nums text-white/85">
          {index + 1} / {pages.length}
        </span>
        <IconButton name="ChevronRight" label="下一页" size={16} className="text-white hover:bg-white/10" disabled={index === pages.length - 1} onClick={() => go(1)} />

        <div className="mx-2 flex flex-1 items-center gap-1">
          {pages.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`跳到第 ${i + 1} 页`}
              onClick={() => goTo(i)}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors duration-150 ease-out',
                i <= index ? 'bg-white/85' : 'bg-white/25',
              )}
            />
          ))}
        </div>
      </div>

      {/* 缩略图导航 */}
      {thumbnailsOpen && (
        <div className="absolute inset-x-0 bottom-16 mx-auto flex max-w-[90%] gap-2 overflow-x-auto rounded-[var(--radius-card)] bg-black/70 p-3 backdrop-blur">
          {pages.map((p, i) => (
            <button
              key={p.pageId}
              type="button"
              onClick={() => {
                goTo(i);
                setThumbnailsOpen(false);
              }}
              className={cn(
                'flex h-14 w-24 shrink-0 items-center justify-center rounded-[6px] border text-[11px] transition-colors duration-150',
                i === index ? 'border-[var(--brand-500)] bg-white/10 text-white' : 'border-white/20 text-white/60 hover:bg-white/10',
              )}
            >
              <span className="px-2 text-center leading-tight line-clamp-3">{p.title.main || `第 ${i + 1} 页`}</span>
            </button>
          ))}
        </div>
      )}

      {!showChrome && (
        <div className="pointer-events-none absolute bottom-4 right-5 flex items-center gap-2 text-white/35">
          <Icon name="MoveHorizontal" size={16} />
          <span className="text-[12px]">方向键或滑动翻页</span>
        </div>
      )}
    </div>
  );
}
