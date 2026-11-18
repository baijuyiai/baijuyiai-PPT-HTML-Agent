import { useEffect, useLayoutEffect, useRef } from 'react';
import type { StyleDoc } from '@lumen/ir-schema';
import { prefersReducedMotion } from '@lumen/motion';
import { HtmlMock } from '../components/HtmlMock.js';
import { startSwarm, type Box, type SwarmItem } from './swarm/engine.js';

/**
 * 「这一页正在生成」的可视化：**一群光标把这一页搭出来**。
 *
 * ## 画的是什么
 *
 * 只有一条来源：**HTML 片段**。两段接力——
 *
 * | 阶段 | 画的 | 节拍 |
 * | --- | --- | --- |
 * | 还在生成 | **通用框架**（`frameHtml`）：没选功能时是风格里该页类型的样机，选了功能时是那份骨架 | **循环**，直到真页落地 |
 * | 真页落地 | **刚生成的这一页**（`html`） | 从头走**一遍**，走完 `onPlayedOnce` |
 *
 * 两段都是「光标拖出框 → 框里的东西淡出来」：字烘在这些片段里，截不了，所以不打字。
 * （引擎里那一套逐字打字的机制还在，只是现在没有调用方喂它，见 `engine.ts` 的注释。）
 *
 * ## 为什么框架是通用框架，不是这一页的真实文案
 *
 * 上一版画的是「这一页真实大纲文案排出来的草稿」。用户看下来要的是**通用**：
 * 框架就该是这套风格自己的样子，文字是方向性占位（「这里主要讲解的核心内容」这类），
 * 于是任何风格 × 任何页类型都画得出来、一眼认得出是哪套风格。真实内容在落地那一刻
 * 才出现——**揭幕那一遍**。
 *
 * ## 落地是「html 变了」判出来的，不是「有 html」
 *
 * 重生成一页时旧 html 一直在，按「有 html」判会一开场就跳进揭幕那一遍。
 * 所以这里在**挂载时**记一份基线（此时这一页已有的 html），与当前这份不同才算落地。
 * 调用方负责在换页 / 换生成轮次时**换一个 `key`**，让这个基线跟着重来。
 *
 * ## 减动效
 *
 * `animate` 为假时**不启动这个引擎**：框架原样静态显示，真页一落地就叫 `onPlayedOnce`
 * 交出去。那类用户要的是别动，不是要一张与这一页无关的图。
 */
const CANVAS_W = 1920;

export function GenerationReveal({
  frameHtml, html, doc, pageNo = 0, totalPages = 1, width, label, chartStyle, startedAt, animate = true, onLanded, onPlayedOnce,
}: {
  /** 生成中循环放的那张**通用框架**（风格样机 / 功能库骨架） */
  frameHtml: string;
  /** 这一页**此刻已有的** HTML。与挂载时那份不同、且非空 → 判定为「真页落地」 */
  html: string;
  doc: Pick<StyleDoc, 'name' | 'palette' | 'fontFamily' | 'fontDisplay' | 'fontScript' | 'fontNumeric' | 'theme' | 'spec'>;
  pageNo?: number;
  /** 这一本共几页。页码那一行要写成 `03 / 12` 还是 `第 3 页` 由风格规范定 */
  totalPages?: number;
  /** 显示宽度。高度按 16:9 推出来 */
  width: number;
  /** 底下那行说明，形如「正在生成这一页 · 已等 47 秒」。揭幕那一遍不显示它 */
  label: string;
  /**
   * 图表视觉风格。揭示层画的也是这一页，风格必须与画布上一致——
   * 不然生成时看到一种、生成完跳成另一种。
   */
  chartStyle?: string;
  /**
   * 这一页**开始生成**的时刻（服务端登记的那个，不随进度文案刷新）。
   *
   * 缺省时退回挂载这一刻：还没收到服务端那条进度的头几秒用得着，收到之后会跳成真起点，
   * 方向是「往前」，只会多画一块，不会倒放。
   */
  startedAt?: number;
  /** 减动效时为假：不启动群光标，框架原样静态显示 */
  animate?: boolean;
  /**
   * 真页落地了（此刻起在真页上走揭幕）。
   *
   * 调用方拿它**把这一轮钉住**：服务端收尾、轮询把「在生成」翻成假时，揭示层不能跟着撤——
   * 不然揭幕演到一半被硬切，那正是这一版要修的观感。
   */
  onLanded?: () => void;
  /** 揭幕那一遍放完了。调用方据此把揭示层换成真页 */
  onPlayedOnce?: () => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  /**
   * 挂载时这一页已有的那份 html。
   *
   * **不进依赖、不在其后更新**：它要一直是「这一轮开场时的样子」，与当前这份比才知道
   * 真页有没有落地（重生成时旧 html 从第一帧就在，见顶部说明）。
   */
  const baselineRef = useRef(html);
  const mountedAtRef = useRef(Date.now());
  const landedAtRef = useRef(0);

  const landed = html !== '' && html !== baselineRef.current;
  // 落地那一刻的时钟，取一次就定住——它同时是揭幕那一遍的起点
  if (landed && landedAtRef.current === 0) landedAtRef.current = Date.now();

  const source = landed ? html : frameHtml;
  const origin = landed ? landedAtRef.current : (startedAt ?? mountedAtRef.current);

  /**
   * 回调走 ref。
   *
   * 与 `origin`、`source` 同理：调用方传下来的多半是每次渲染都新建的函数，
   * 进依赖就成了「每渲染一次重启一轮引擎」——画面会永远停在开场。
   */
  const playedRef = useRef(onPlayedOnce);
  playedRef.current = onPlayedOnce;
  const landedRef = useRef(onLanded);
  landedRef.current = onLanded;

  const scale = width / CANVAS_W;
  const height = Math.round(width * (1080 / 1920));

  /**
   * 换算用的倍率放 ref 里，不进依赖。
   *
   * 画布随窗口缩放时 `scale` 会变，而这个倍率只有一处用它——量 caret 的位置。
   * 进依赖的话每拖一下窗口就重启一轮引擎，文字会闪回完整再被截一遍。
   */
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  /** 落地了就叫一声：调用方据此把这一轮钉住，别让服务端收尾把揭幕演到一半切断 */
  useEffect(() => {
    if (landed) landedRef.current?.();
  }, [landed]);

  /**
   * **`useLayoutEffect`**：引擎起来的那一刻就要把文字截到位、把该藏的块藏起来。
   * 放到 `useEffect` 里（浏览器画完那一帧才跑）会先闪一下完整的一页，再跳成「进行中」。
   */
  useLayoutEffect(() => {
    if (!animate) {
      // 不动效这一档：框架静态摆着，真页一落地就直接交出去
      if (landed) playedRef.current?.();
      return;
    }
    let stop: (() => void) | null = null;
    let timer = 0;
    let cancelled = false;
    const mountedAt = Date.now();

    const begin = (): void => {
      if (cancelled) return;
      const layer = layerRef.current;
      if (!layer) return;
      const items = htmlItems(frameRef.current);
      if (items.length === 0) {
        /*
          `srcdoc` 的解析时机在浏览器之间并不一致，量不到就隔一会儿再问。
        */
        if (Date.now() - mountedAt < 3_000) {
          timer = window.setTimeout(begin, 100);
          return;
        }
        // 等不到就别等了：把元素全亮着，页面照常显示，只是没有群光标
        for (const el of frameRef.current?.contentDocument?.querySelectorAll<HTMLElement>('[data-stagger-item]') ?? []) {
          el.style.opacity = '1';
        }
        return;
      }
      // 倍率走 getter 不走值：窗口一缩放 `scale` 就变，走值会把整轮引擎重启，文字会闪回去。
      // 配色不传：这一层是产品自己的界面层，用引擎里那套产品色，不跟着风格走
      stop = startSwarm({
        layer,
        origin,
        items,
        scale: () => scaleRef.current,
        loop: !landed,
        onPlayedOnce: () => playedRef.current?.(),
      });
    };

    begin();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      stop?.();
    };
  }, [source, origin, landed, animate]);

  return (
    <div className="relative" style={{ width, height }}>
      {/* 不传 `images`：让 `HtmlMock` 按配色自己配。这里只是过渡态，不值得再算一份 */}
      <HtmlMock
        doc={doc}
        html={source}
        width={width}
        pageNo={pageNo}
        frame={false}
        reveal
        chartStyle={chartStyle}
        frameRef={frameRef}
      />
      {/*
        群光标那一层**摆在缩放容器外面**，铺满画布的显示区。

        摆在里面的话一切尺寸都会跟着画布一起缩——实测画布常用状态下只有三成多，
        光标会缩到十来个像素，几乎看不见，而「看得见一群光标在动」正是这个效果的全部。
        摆在外面由引擎自己按显示像素画，光标恒定 22 屏幕像素、线宽恒定 1.4 像素。
      */}
      <div ref={layerRef} style={LAYER} />
      {/*
        说明条贴在画布底部中间。**揭幕那一遍不显示**：那一遍说明的「正在生成这一页」
        已经不成立了（这一页正是刚生成好的），而这一刻该看的画面就是它本身。

        **不写阶段名**：服务端只知道「正在调用模型写这一页」这一件事，
        编出「正在排标题」之类的话就是假信息。光标画到第几块也不进这行字——
        那条编排不是真实进度。
      */}
      {!landed && (
        <div
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-0)]/90 px-3 py-1 text-[12px] text-[var(--text-2)] backdrop-blur-sm"
          role="status"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--brand-500)]" />
          {label}
        </div>
      )}
    </div>
  );
}

const LAYER: React.CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none' };

/**
 * 这一版 HTML 里的那些块。
 *
 * 它们由 `markStaggerItems` 标好阅读序、并预置成透明的（见 `HtmlMock` 的 `reveal`）。
 * 这里的矩形是**画布坐标**：iframe 自己的视口就是 1920×1080，外层那个 `scale` 是绘制层
 * 的变换，`getBoundingClientRect()` 读不到它。
 */
function htmlItems(frame: HTMLIFrameElement | null): SwarmItem[] {
  const doc = frame?.contentDocument;
  if (!doc) return [];
  return [...doc.querySelectorAll('[data-stagger-item]')]
    .map((el) => ({ el: el as HTMLElement, i: Number((el as HTMLElement).style.getPropertyValue('--stagger-i')) || 0 }))
    // DOM 顺序在嵌套结构下并不等于阅读序，`--stagger-i` 才是
    .sort((a, b) => a.i - b.i)
    .map(({ el }) => {
      const r = el.getBoundingClientRect();
      return { el, box: { x: r.left, y: r.top, w: r.width, h: r.height } };
    });
}

/** 系统设了「减弱动效」时不做揭示。调用方据此退回静态呈现 */
export function revealAllowed(): boolean {
  return !prefersReducedMotion();
}
