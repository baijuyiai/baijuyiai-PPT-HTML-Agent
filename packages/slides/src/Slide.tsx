import type { CSSProperties } from 'react';
import type { ChartBlock, ImageBlock } from '@lumen/ir-schema';
import type { SlideRenderContext } from '@lumen/render-engine';
import { staggerDirectionFor, type BandSpec } from '@lumen/ir-schema';
import { ENTER_ANIMATION, animationCss } from '@lumen/motion';
import { STAGGER_ATTR } from '@lumen/ir-schema';
import { complementOf } from '@lumen/style-engine';
import { layoutFor } from './layouts.js';
import { avatarSrcFor } from './avatars.js';
import { fontSize, fontFamily, fontWeight, numericStyle, surfaceColors, type SurfaceColors } from './theme.js';
import { DecorationLayer, langOf, pageBackground, recipeOf, scrimCss, spacingScale } from './language.js';
import {
  Bullets, ChartSlot, FooterBar, ImageSlot, MetricRow, Paragraphs, TitleBlock, TocList,
} from './primitives.js';

export interface SlideProps {
  ctx: SlideRenderContext;
  /** 显示缩放。画布固定 1920×1080，由外层缩放适配容器。 */
  scale?: number;
  /** 数字人形象，缺省时使用内置中性肖像 */
  avatar?: { svg?: string; poster?: string };
  /** 讲解光标位置，由演示组件按讲稿时间戳计算后传入 */
  cursor?: { x: number; y: number; visible: boolean } | null;
  /** 透传的额外样式 */
  style?: CSSProperties;
}

/** 页面级进入动画的时长。比翻页层的 250ms 短一点，页面先落定，翻页层再收尾 */
const ENTER_MS = 200;

/** 整页渲染入口。按版式描述符分发，视觉取值全部来自风格包。 */
export function Slide({ ctx, scale = 1, avatar, cursor, style }: SlideProps) {
  const colors = surfaceColors(ctx);
  const { w, h, marginPx } = ctx.canvas;
  const recipe = recipeOf(ctx);

  const animation = ctx.mode === 'export' || ctx.motion === 'none'
    ? 'none'
    : animationCss(ENTER_ANIMATION[ctx.motion] ?? 'lumen-fade', ENTER_MS);

  /**
   * 元素逐块进场：方向挂在根节点上，靠自定义属性继承给所有带 `data-stagger-item` 的后代
   * （见 `styles.css`）。**导出时一律不加**——截图要的是落点那一帧。
   */
  const staggerDir = ctx.mode === 'export' || ctx.staggerSeed == null
    ? null
    : staggerDirectionFor(ctx.staggerSeed);

  const inner: CSSProperties = {
    width: w,
    height: h,
    position: 'relative',
    overflow: 'hidden',
    // 页面底色由「页类型配方」决定：封面可以是渐变或图上压字，正文页是素底
    background: pageBackground(ctx, colors),
    color: colors.text,
    boxSizing: 'border-box',
    // 页面边距不小于画布宽 5%（PRD §3.1）
    padding: marginPx,
    display: 'flex',
    flexDirection: 'column',
    animation,
    // 风格包令牌铺到根节点，模板内一律用 var() 取值
    ...(ctx.cssVars as CSSProperties),
  };

  return (
    <div style={{ width: w * scale, height: h * scale, overflow: 'hidden', ...style }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: w, height: h }}>
        <div
          style={inner}
          data-slide-root
          {...(staggerDir ? { [STAGGER_ATTR]: staggerDir } : {})}
          data-variant={ctx.variant.id}
          data-theme={ctx.theme}
          data-page-type={ctx.page.pageType}
          data-background={recipe.background}
          data-spacing={recipe.spacing}
        >
          <DecorationLayer ctx={ctx} colors={colors} />
          <LayoutBody ctx={ctx} colors={colors} />
          <SlideFooter ctx={ctx} colors={colors} />
          <AvatarLayer ctx={ctx} colors={colors} avatar={avatar} />
          <CursorLayer ctx={ctx} colors={colors} cursor={cursor} />
        </div>
      </div>
    </div>
  );
}

/* ---------------- 版式主体 ---------------- */

function LayoutBody({ ctx, colors }: { ctx: SlideRenderContext; colors: SurfaceColors }) {
  const layout = layoutFor(ctx.variant);
  // 带里有量出来的横带结构就走「按原稿排布」那条路径，否则套 kind 对应的固定骨架
  if (layout.bands && layout.bands.length > 0) return <SkeletonBody ctx={ctx} colors={colors} />;
  // 页类型配方的疏密折算成间距乘子：封面与章节页「airy」，正文页「normal」
  const density = spacingScale(ctx);
  const gap = Math.round(ctx.canvas.h * layout.gapRatio * density);
  const innerGap = Math.round(24 * density);
  const images = ctx.page.blocks.filter((b): b is ImageBlock => b.type === 'image');
  const chart = ctx.page.blocks.find((b): b is ChartBlock => b.type === 'chart');
  const hasMetrics = ctx.page.blocks.some((b) => b.type === 'metric');
  const hasBullets = ctx.page.blocks.some((b) => b.type === 'bullets');

  /**
   * 元素逐块进场的序号，按阅读序往后排：标题 → 指标 → 段落 → 要点。
   *
   * **数法必须与各组件自己那份 filter 一致**（`MetricRow` 会 `slice(0, maxCount)`、
   * `Bullets` 会把各块的 items 摊平），数错会让两块的序号撞上、同时进场，
   * 而那看起来只是「这两块一起进的」，很难联想到是数错了。
   */
  const staggering = ctx.mode !== 'export' && ctx.staggerSeed != null;
  const metricCount = Math.min(4, ctx.page.blocks.filter((b) => b.type === 'metric').length);
  const paraCount = ctx.page.blocks.filter((b) => b.type === 'paragraph').length;
  const titleIdx = staggering ? 0 : null;
  const metricBase = staggering ? 1 : null;
  const paraBase = staggering ? 1 + metricCount : null;
  const bulletBase = staggering ? 1 + metricCount + paraCount : null;

  const title = (
    <TitleBlock
      ctx={ctx}
      colors={colors}
      align={layout.align}
      step={layout.titleStep}
      showSub={layout.subUnderTitle}
      staggerIndex={titleIdx}
    />
  );

  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: innerGap, minWidth: 0 }}>
      {hasMetrics && (
        <MetricRow
          ctx={ctx}
          colors={colors}
          maxCount={layout.kind === 'cards-4' ? 4 : 4}
          featured={layout.kind === 'hero-metric' || layout.kind === 'cards-3'}
          staggerBase={metricBase}
        />
      )}
      <Paragraphs ctx={ctx} colors={colors} staggerBase={paraBase} />
      {hasBullets && <Bullets ctx={ctx} colors={colors} staggerBase={bulletBase} />}
    </div>
  );

  switch (layout.kind) {
    case 'centered':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap, textAlign: 'center' }}>
          {title}
          <div style={{ maxWidth: 1180 }}>{body}</div>
        </div>
      );

    case 'minimal':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap }}>
          {title}
        </div>
      );

    case 'toc-list':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap, minHeight: 0 }}>
          {title}
          <TocList ctx={ctx} colors={colors} columns={1} staggerBase={paraBase} />
        </div>
      );

    case 'toc-grid':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap, minHeight: 0 }}>
          {title}
          <TocList ctx={ctx} colors={colors} columns={2} staggerBase={paraBase} />
        </div>
      );

    case 'numbered':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap }}>
          <span style={{ ...numericStyle(ctx, fontSize(ctx, 'display')), color: colors.brand, opacity: 0.28 }}>
            {String(ctx.page.footer.pageNo).padStart(2, '0')}
          </span>
          {title}
        </div>
      );

    case 'banner':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap }}>
          <div
            style={{
              background: colors.brandSoft,
              padding: '28px 32px',
              borderRadius: langOf(ctx).gui.radius.card,
              borderLeft: `4px solid ${colors.brand}`,
            }}
          >
            {title}
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>{body}</div>
        </div>
      );

    case 'two-column':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap, minHeight: 0 }}>
          {title}
          <div style={{ flex: 1, minHeight: 0, columnCount: 2, columnGap: 56 }}>
            <Paragraphs ctx={ctx} colors={colors} />
            {hasBullets && <Bullets ctx={ctx} colors={colors} />}
          </div>
        </div>
      );

    case 'media-left':
    case 'media-right': {
      const mediaFirst = layout.kind === 'media-left';
      const media = (
        <ImageSlot ctx={ctx} colors={colors} image={images[0]} captionPlacement={layout.captionPlacement} style={{ minWidth: 0 }} />
      );
      const content = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0, justifyContent: 'center' }}>
          {title}
          {body}
        </div>
      );
      return (
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: 'grid',
            gridTemplateColumns: `${layout.mediaRatio}fr ${1 - layout.mediaRatio}fr`,
            gap: 56,
            alignItems: 'stretch',
          }}
        >
          {mediaFirst ? media : content}
          {mediaFirst ? content : media}
        </div>
      );
    }

    case 'overlay':
      return (
        <div style={{ position: 'absolute', inset: 0 }}>
          <ImageSlot
            ctx={ctx}
            colors={colors}
            image={images[0]}
            captionPlacement="none"
            style={{ position: 'absolute', inset: 0, gap: 0 }}
          />
          <div
            style={{
              position: 'absolute',
              inset: 0,
              // 压字遮罩的浓淡来自风格包的 imagery.scrim：品牌族压得重，学术族几乎不压
              background: langOf(ctx).imagery.scrim.gradient,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: ctx.canvas.marginPx,
              right: ctx.canvas.marginPx,
              bottom: ctx.canvas.marginPx,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              color: '#FFFFFF',
            }}
          >
            <OverlayTitle ctx={ctx} staggerIndex={titleIdx} />
            {hasBullets && <OverlayBullets ctx={ctx} staggerBase={paraBase} />}
          </div>
        </div>
      );

    case 'grid-2':
    case 'grid-3':
    case 'grid-4': {
      const cols = layout.kind === 'grid-2' ? 2 : layout.kind === 'grid-3' ? 3 : 2;
      const rows = layout.kind === 'grid-4' ? 2 : 1;
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap, minHeight: 0 }}>
          {title}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gridTemplateRows: `repeat(${rows}, 1fr)`,
              gap: 24,
            }}
          >
            {images.slice(0, cols * rows).map((img, i) => (
              <ImageSlot key={i} ctx={ctx} colors={colors} image={img} captionPlacement={layout.captionPlacement} style={{ minHeight: 0 }} />
            ))}
          </div>
          {(hasBullets || hasMetrics) && <div style={{ maxHeight: 160, overflow: 'hidden' }}>{body}</div>}
        </div>
      );
    }

    case 'chart-full':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap, minHeight: 0 }}>
          {title}
          <ChartSlot ctx={ctx} colors={colors} chart={chart} style={{ flex: 1, minHeight: 0 }} />
          {(hasBullets || hasMetrics) && <div style={{ maxHeight: 150, overflow: 'hidden' }}>{body}</div>}
        </div>
      );

    case 'chart-split':
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap, minHeight: 0 }}>
          {title}
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'grid',
              gridTemplateColumns: `${layout.mediaRatio}fr ${1 - layout.mediaRatio}fr`,
              gap: 40,
            }}
          >
            <ChartSlot ctx={ctx} colors={colors} chart={chart} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, justifyContent: 'center', minWidth: 0 }}>{body}</div>
          </div>
        </div>
      );

    case 'hero-metric':
    case 'cards-3':
    case 'cards-4':
    default:
      return (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap, minHeight: 0 }}>
          {title}
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>{body}</div>
        </div>
      );
  }
}

/**
 * 按设计稿量出来的横带排布。
 *
 * 与上面那 19 个 kind 的区别：那些是系统自带的固定骨架，**任何风格都套同一副**；
 * 这一条是「原稿怎么排就怎么排」——每条带的上下位置、高度、左右边界、栏数
 * 都来自识别时从设计稿像素上量到的比例。
 *
 * 定位用绝对定位 + 百分比。包含块是根节点的 padding box，无边框时即整个画布，
 * 所以量到的比例能直接对上——根节点的 padding 不影响绝对定位子元素。
 *
 * 内容按角色分配到带：标题类合成一个标题块放进「眉标顶 → 副标题底」那个区域
 * （它们在视觉上本来就是一个块，拆开反而与原稿不像）；图表与图片进图区带；
 * 指标卡按量到的栏数分卡片；正文进面积最大的那条文字带。
 */
/** 比例转百分比字符串。不取整会写出 4.000000000000001% 这种浮点残渣 */
const pct = (v: number): string => `${Number((v * 100).toFixed(3))}%`;

function SkeletonBody({ ctx, colors }: { ctx: SlideRenderContext; colors: SurfaceColors }) {
  const g = layoutFor(ctx.variant);
  const grid = langOf(ctx).grid;
  const bands = (g.bands ?? []).filter((b) => b.role !== 'footer');
  if (bands.length === 0) return null;

  const box = (b: BandSpec): CSSProperties => ({
    position: 'absolute',
    top: pct(b.topRatio),
    left: pct(b.leftRatio),
    width: pct(b.widthRatio),
    height: pct(b.heightRatio),
  });

  const heading = bands.filter((b) => b.role === 'eyebrow' || b.role === 'title' || b.role === 'subtitle');
  const rest = bands.filter((b) => !heading.includes(b));
  const align = bands.find((b) => b.role === 'title')?.align === 'center' ? 'center' : 'left';

  /** 标题组的外接矩形（比例）。既用来定位，也用来判断图区有没有压在它身上 */
  const headingRect = heading.length > 0
    ? {
      left: Math.min(...heading.map((b) => b.leftRatio)),
      top: Math.min(...heading.map((b) => b.topRatio)),
      right: Math.max(...heading.map((b) => b.leftRatio + b.widthRatio)),
      bottom: Math.max(...heading.map((b) => b.topRatio + b.heightRatio)),
    }
    : null;

  const headingBox: CSSProperties | null = headingRect
    ? {
      position: 'absolute',
      top: pct(headingRect.top),
      left: pct(headingRect.left),
      width: pct(headingRect.right - headingRect.left),
    }
    : null;

  const chart = ctx.page.blocks.find((b) => b.type === 'chart');
  const images = ctx.page.blocks.filter((b) => b.type === 'image');
  const hasMetrics = ctx.page.blocks.some((b) => b.type === 'metric');

  /**
   * 按优先级领取横带：图表 → 图片 → 指标 → 正文。
   *
   * 每一类都先找合身的带（图区带 / 指标带 / 文字带），领不到就退到还没被占用的带。
   * 这条退路是必要的：用户可以把页类型从「指标页」改成「正文页」，
   * 但原稿量出来的横带角色仍然是「指标卡」——没有退路的话正文就没地方放，
   * 页面会空掉。
   */
  const claimed = new Set<BandSpec>();
  const byArea = (list: BandSpec[]) => [...list]
    .sort((a, b) => b.widthRatio * b.heightRatio - a.widthRatio * a.heightRatio);
  const take = (pool: BandSpec[]): BandSpec | null => {
    const found = pool.find((b) => !claimed.has(b));
    if (found) claimed.add(found);
    return found ?? null;
  };

  /**
   * 压在标题底下的图区带要**先画**。
   *
   * 杂志封面那种「照片居中/满铺、标题压在照片上」的版面，量出来的图区带和标题带
   * 在纵向上是重叠的。绝对定位下它们在同一层，按 DOM 顺序画的话图会盖住标题——
   * 用户看到的是「图在、字没了」，而字其实一直在。
   *
   * 判据是**与标题外接矩形相交**，不是「占满整页」：叶子那张照片只占中间 62%×86%，
   * 但它和标题叠在一起，同样得垫到下面去。左右并排的版面（文字在左、图在右）
   * 不相交，走的还是原来的路径。
   */
  const intersects = (b: BandSpec) => headingRect !== null
    && b.leftRatio < headingRect.right && b.leftRatio + b.widthRatio > headingRect.left
    && b.topRatio < headingRect.bottom && b.topRatio + b.heightRatio > headingRect.top;
  const bgBand = rest
    .filter((b) => b.role === 'visual' && intersects(b))
    .sort((a, b) => b.widthRatio * b.heightRatio - a.widthRatio * a.heightRatio)[0] ?? null;
  const inner = bgBand ? rest.filter((b) => b !== bgBand) : rest;

  /**
   * 压字遮罩只在**图确实压在字底下**时才画。
   *
   * 左右并排的版面（文字在左、图在右）里，两条带的外接矩形常常有一点点交叠：
   * 标题带填到 57%，右侧图从 42% 开始，纸面上「相交」了，但字并没有压在图身上。
   * 不加这条守卫，风格包开的遮罩会平白盖在右侧那张图上，把它压暗一块。
   * 所以要求交叠面积占到标题外接矩形的近一半才算真的压字。
   */
  const scrimmed = (() => {
    if (!bgBand || !headingRect) return false;
    const w = Math.min(bgBand.leftRatio + bgBand.widthRatio, headingRect.right)
      - Math.max(bgBand.leftRatio, headingRect.left);
    const h = Math.min(bgBand.topRatio + bgBand.heightRatio, headingRect.bottom)
      - Math.max(bgBand.topRatio, headingRect.top);
    const area = (headingRect.right - headingRect.left) * (headingRect.bottom - headingRect.top);
    return area > 0 && (Math.max(0, w) * Math.max(0, h)) / area > 0.45;
  })();

  const allPool = byArea(inner);
  const mediaPool = byArea(inner.filter((b) => b.role === 'visual'));
  const metricPool = byArea(inner.filter((b) => b.role === 'metrics'));
  const textPool = byArea(inner.filter((b) => b.role !== 'visual' && b.role !== 'metrics'));

  const chartBand = chart ? (take(mediaPool) ?? take(allPool)) : null;
  // 底图已经吃掉了第一张，剩下的才轮到图文区——不排掉的话同一张图会被画两遍
  const bandImages = bgBand ? images.slice(1) : images;
  const imageBand = !chart && bandImages.length > 0 ? (take(mediaPool) ?? take(allPool)) : null;
  const metricBand = hasMetrics ? (take(metricPool) ?? take(allPool)) : null;
  // 最后一级退路是与最大的那条带共用。带不够分是常态（比如一页既有指标又有正文，
  // 原稿却只量出一条内容带），此时宁可让它们在同一块区域里上下堆叠，也不能把内容丢掉
  const textBand = take(textPool) ?? take(allPool) ?? allPool[0] ?? null;

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {/* 压在标题下面的图区带先画。它是底，所以不要题注 */}
      {bgBand && images.length > 0 && (
        <>
          <div style={{ ...box(bgBand), overflow: 'hidden' }}>
            <ImageSlot
              ctx={ctx}
              colors={colors}
              image={images[0]!}
              captionPlacement="none"
              style={{ width: '100%', height: '100%' }}
            />
          </div>
          {/* 压字遮罩：风格包自己开了遮罩、且图确实压在字底下才画。
              照片一杂，压在上面的字就读不出来，而「要不要压暗、压多暗」是这套风格的决定 */}
          {scrimmed && <div style={{ ...box(bgBand), ...scrimCss(ctx), pointerEvents: 'none' }} />}
        </>
      )}

      {headingBox && (
        <div style={headingBox}>
          <TitleBlock ctx={ctx} colors={colors} align={align} step={g.titleStep} />
        </div>
      )}

      {chartBand && chart && (
        <div style={box(chartBand)}>
          <ChartSlot ctx={ctx} colors={colors} chart={chart} style={{ width: '100%', height: '100%' }} />
        </div>
      )}

      {imageBand && bandImages.length > 0 && (
        <div
          style={{
            ...box(imageBand),
            display: 'grid',
            gridTemplateColumns: `repeat(${Math.max(1, imageBand.columns)}, 1fr)`,
            // 栏距取自量出来的网格，而不是写死一个数——这是「网格化」真正落地的地方
            gap: grid.gutter,
          }}
        >
          {bandImages.slice(0, Math.max(1, imageBand.columns)).map((img, i) => (
            <ImageSlot
              key={i}
              ctx={ctx}
              colors={colors}
              image={img}
              captionPlacement={g.captionPlacement}
              style={{ minWidth: 0 }}
            />
          ))}
        </div>
      )}

      {metricBand && hasMetrics && (
        <div style={box(metricBand)}>
          <MetricRow ctx={ctx} colors={colors} maxCount={metricBand.columns} featured={metricBand.columns <= 2} />
        </div>
      )}

      {textBand && (
        <div style={{ ...box(textBand), overflow: 'hidden' }}>
          <Paragraphs ctx={ctx} colors={colors} />
          <Bullets ctx={ctx} colors={colors} />
        </div>
      )}
    </div>
  );
}

/** 图上压字时标题必须为浅色，与遮罩配合保证可读性 */
function OverlayTitle({ ctx, staggerIndex }: { ctx: SlideRenderContext; staggerIndex?: number | null }) {
  const layout = layoutFor(ctx.variant);
  return (
    <TitleBlock
      ctx={ctx}
      colors={{ ...surfaceColors(ctx), text: '#FFFFFF', textMuted: 'rgba(255,255,255,0.78)' }}
      align={layout.align}
      step={layout.titleStep}
      staggerIndex={staggerIndex}
    />
  );
}

function OverlayBullets({ ctx, staggerBase }: { ctx: SlideRenderContext; staggerBase?: number | null }) {
  const colors = { ...surfaceColors(ctx), text: 'rgba(255,255,255,0.92)' };
  return (
    <div style={{ maxHeight: 200, overflow: 'hidden' }}>
      <Bullets ctx={ctx} colors={colors} staggerBase={staggerBase} />
    </div>
  );
}

function SlideFooter({ ctx, colors }: { ctx: SlideRenderContext; colors: SurfaceColors }) {
  const layout = layoutFor(ctx.variant);
  if (layout.kind === 'overlay') return null;

  /**
   * 走骨架路径时页脚必须自己绝对定位。
   *
   * 平时页脚是靠 LayoutBody 的 `flex: 1` 被顶到底部的；骨架路径里 LayoutBody
   * 是绝对定位、脱离了文档流，页脚会变成唯一的流内子元素而被顶到**顶部**。
   * 量到页脚带就贴到那条带的位置，没量到就贴画布底部，与 flex 时的落点一致。
   */
  if (layout.bands && layout.bands.length > 0) {
    const fb = layout.bands.find((b) => b.role === 'footer');
    return (
      <div
        style={fb
          ? {
            position: 'absolute',
            left: pct(fb.leftRatio),
            width: pct(fb.widthRatio),
            bottom: pct(1 - fb.topRatio - fb.heightRatio),
          }
          : { position: 'absolute', left: ctx.canvas.marginPx, right: ctx.canvas.marginPx, bottom: ctx.canvas.marginPx }}
      >
        <FooterBar ctx={ctx} colors={colors} />
      </div>
    );
  }
  return <FooterBar ctx={ctx} colors={colors} />;
}

/* ---------------- 数字人图层 ---------------- */


function AvatarLayer({
  ctx,
  colors,
  avatar,
}: {
  ctx: SlideRenderContext;
  colors: SurfaceColors;
  avatar?: { svg?: string; poster?: string };
}) {
  const { page } = ctx;
  if (!page.avatar.enabled || page.avatar.mode === 'off') return null;

  // 优先用上传的肖像，其次用调用方给的形象，最后落到 modelId 对应的内置预设
  const src = avatar?.poster
    ?? (page.avatar.portraitUrl
      || (avatar?.svg
        ? `data:image/svg+xml;utf8,${encodeURIComponent(avatar.svg)}`
        : avatarSrcFor(page.avatar.modelId)));

  if (page.avatar.mode === 'fullscreen') {
    const fs = ctx.pack.base.components.avatar.fullscreen;
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: colors.isDark ? 'rgba(22,24,29,0.86)' : 'rgba(255,255,255,0.86)',
          transition: `opacity ${fs.transitionMs}ms var(--ease-out, ease-out)`,
        }}
        data-avatar="fullscreen"
      >
        <img
          src={src}
          alt="讲解数字人"
          style={{ width: Math.round(ctx.canvas.h * 0.62), height: Math.round(ctx.canvas.h * 0.62), borderRadius: 999, objectFit: 'cover' }}
        />
      </div>
    );
  }

  const { diameter, position, offset, border, shadow } = page.avatar;
  const corner: CSSProperties =
    position === 'bottom-left' ? { left: offset.x, bottom: offset.y }
      : position === 'bottom-right' ? { right: offset.x, bottom: offset.y }
        : position === 'top-left' ? { left: offset.x, top: offset.y }
          : { right: offset.x, top: offset.y };

  return (
    <img
      src={src}
      alt="讲解数字人"
      data-avatar="pip"
      style={{
        position: 'absolute',
        width: diameter,
        height: diameter,
        borderRadius: 999,
        objectFit: 'cover',
        border: border === 'none' ? 'none' : border,
        boxShadow: shadow === 'md' ? '0 8px 24px rgba(0,0,0,.18)' : shadow === 'sm' ? '0 1px 2px rgba(0,0,0,.10)' : 'none',
        ...corner,
      }}
    />
  );
}

/* ---------------- 讲解光标图层 ---------------- */

function CursorLayer({
  ctx,
  colors,
  cursor,
}: {
  ctx: SlideRenderContext;
  colors: SurfaceColors;
  cursor?: { x: number; y: number; visible: boolean } | null;
}) {
  const { page } = ctx;
  if (!page.script.cursorEnabled || !cursor || !cursor.visible) return null;
  const c = ctx.pack.base.components.cursor;
  const size = c.size;
  /**
   * **颜色用品牌色的互补色。** 光标要压在主色调铺的版面上，同色系会糊在一起。
   * 包里写死一个具体颜色（不是 `var(--…)`）是作者明确指定的，照它；而内置的十来套
   * 包写的都是 `var(--brand-500)` / `var(--accent-500)`，那两句本来也就是「用主色」，
   * 换成互补色正是这个意思。
   */
  const color = c.color.startsWith('var(') ? complementOf(colors.brand) : c.color;

  const shape = () => {
    switch (c.shape) {
      case 'dot':
        return <span style={{ width: size * 0.35, height: size * 0.35, borderRadius: 999, background: color, opacity: c.opacity }} />;
      case 'arrow':
        return (
          <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
            <path d="M10 6l28 14-11 4-4 11z" fill={color} opacity={c.opacity} />
          </svg>
        );
      case 'laser':
        return <span style={{ width: size * 0.2, height: size * 0.2, borderRadius: 999, background: color, opacity: c.opacity, boxShadow: `0 0 0 ${size * 0.3}px ${color}22` }} />;
      case 'halo':
      default:
        /**
         * **镂空 + 发光，不填色。** 光圈的作用是「圈住这一片」，中间必须透出被圈住的
         * 内容——填一块半透明色会把正文压暗，看起来像盖了个章。光靠描边又太单薄，
         * 用内外两层投影把颜色晕开，读起来是一圈光而不是一条线。
         */
        return (
          <span
            style={{
              width: size,
              height: size,
              borderRadius: 999,
              background: 'transparent',
              border: `${Math.max(2, Math.round(size * 0.06))}px solid ${color}`,
              boxShadow: `0 0 ${size * 0.2}px ${color}, 0 0 ${size * 0.45}px ${color}80, inset 0 0 ${size * 0.14}px ${color}66`,
              opacity: Math.min(1, c.opacity + 0.2),
            }}
          />
        );
    }
  };

  return (
    <div
      data-cursor
      style={{
        position: 'absolute',
        left: `${cursor.x * 100}%`,
        top: `${cursor.y * 100}%`,
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        transition: `left ${c.moveEaseMs}ms var(--ease-out, ease-out), top ${c.moveEaseMs}ms var(--ease-out, ease-out)`,
        animation: `lumen-pulse ${c.pulseMs}ms ease-in-out infinite`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {shape()}
    </div>
  );
}

/** 供列表缩略图使用的极简渲染：只出标题与主色块，不含图片与图表 */
export function SlideThumbnail({ ctx, scale }: { ctx: SlideRenderContext; scale: number }) {
  const colors = surfaceColors(ctx);
  const { w, h, marginPx } = ctx.canvas;
  const bg = pageBackground(ctx, colors);
  return (
    <div style={{ width: w * scale, height: h * scale, overflow: 'hidden', background: bg }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: w, height: h }}>
        <div style={{ width: w, height: h, padding: marginPx, background: bg, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 }}>
          <span style={{ height: 6, width: 80, background: colors.accent, borderRadius: 3 }} />
          <span style={{ fontFamily: fontFamily(ctx, 'title'), fontSize: fontSize(ctx, 'title'), fontWeight: fontWeight(ctx, 'title'), color: colors.text }}>
            {ctx.page.title.main}
          </span>
          <span style={{ height: 12, width: '62%', background: colors.border, borderRadius: 6 }} />
          <span style={{ height: 12, width: '44%', background: colors.border, borderRadius: 6 }} />
        </div>
      </div>
    </div>
  );
}
