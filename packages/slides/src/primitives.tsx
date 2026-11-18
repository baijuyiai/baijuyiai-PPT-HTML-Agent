import type { CSSProperties, ReactNode } from 'react';
import type { Block, ChartBlock, ImageBlock, MetricBlock, PageIR } from '@lumen/ir-schema';
import type { SlideRenderContext } from '@lumen/render-engine';
import { chartTheme, paletteFromStyle, renderChartSvg, type ChartUsageSpec } from '@lumen/charts';
import {
  fontSize, fontFamily, fontWeight, letterSpacing, lineHeight, numericStyle, surfaceColors,
  type SurfaceColors,
} from './theme.js';
import {
  borderCss, cardSurfaceCss, dividerCss, langOf, mix, scrimCss, shadowCss,
} from './language.js';
import { Icon, IconTile } from './icons.js';

/* ---------------- 标记 ---------------- */

/**
 * 列表行标记。形状、大小、颜色来源全部来自风格包 `gui.listRow`——
 * 商务经典是一条短横，学术严谨是编号，科技极简是方块，品牌设计是圆点。
 * 标记用几何图形而不是字符，避免任何字体缺失风险。
 */
function Marker({ ctx, colors, index }: { ctx: SlideRenderContext; colors: SurfaceColors; index: number }) {
  const { marker, markerSize, markerColor } = langOf(ctx).gui.listRow;
  if (marker === 'none') return null;

  const color = markerColor === 'accent' ? colors.accent
    : markerColor === 'text' ? colors.textMuted
      : colors.brand;

  if (marker === 'number') {
    return (
      <span style={{ ...numericStyle(ctx, fontSize(ctx, 'caption')), flex: '0 0 auto', color, opacity: 0.8 }}>
        {String(index + 1).padStart(2, '0')}
      </span>
    );
  }
  if (marker === 'check') {
    return <Icon name="check" size={markerSize} strokeWidth={2.4} color={color} style={{ marginTop: 4 }} />;
  }
  if (marker === 'dash') {
    return (
      <span
        style={{
          flex: '0 0 auto', width: Math.round(markerSize * 2.4), height: Math.max(2, Math.round(markerSize * 0.36)),
          marginTop: Math.round(markerSize * 0.75), borderRadius: 999, background: color,
        }}
      />
    );
  }
  const round = marker === 'dot';
  return (
    <span
      style={{
        flex: '0 0 auto',
        width: markerSize,
        height: markerSize,
        marginTop: round ? 10 : 8,
        borderRadius: round ? 999 : Math.min(3, markerSize / 3),
        background: color,
      }}
    />
  );
}

/** 要点行的图标。给了图标就用图标替代标记，否则退回风格包标记 */
function BulletLead({
  ctx, colors, index, icon,
}: { ctx: SlideRenderContext; colors: SurfaceColors; index: number; icon?: string }) {
  const spec = langOf(ctx).iconography;
  if (icon && spec.container !== 'none') {
    return (
      <IconTile
        name={icon as never}
        size={spec.size * 0.72}
        strokeWidth={spec.strokeWidth}
        container={spec.container}
        containerTone={spec.containerTone}
        brandSoft={colors.brandSoft}
        accentSoft={colors.accentSoft}
        border={colors.border}
        brand={colors.brand}
        accent={colors.accent}
      />
    );
  }
  if (icon) {
    return <Icon name={icon as never} size={spec.size * 0.72} strokeWidth={spec.strokeWidth} color={colors.brand} style={{ marginTop: 4 }} />;
  }
  return <Marker ctx={ctx} colors={colors} index={index} />;
}

/* ---------------- 眉标 ---------------- */

export function Eyebrow({ ctx, colors }: { ctx: SlideRenderContext; colors: SurfaceColors }) {
  const { page, titleTemplate } = ctx;
  if (!page.title.eyebrow || titleTemplate.eyebrowStyle === 'none') return null;
  const eyebrow = langOf(ctx).gui.eyebrow;
  const style: CSSProperties = {
    fontFamily: fontFamily(ctx, 'caption'),
    fontSize: fontSize(ctx, 'caption'),
    fontWeight: 500,
    letterSpacing: `${eyebrow.letterSpacingEm}em`,
    color: colors.textMuted,
    textTransform: titleTemplate.eyebrowStyle === 'caps' || eyebrow.transform === 'uppercase' ? 'uppercase' : 'none',
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  };
  return (
    <div style={style}>
      {titleTemplate.eyebrowStyle === 'accent-bar' && (
        <span style={{ width: 28, height: 3, background: colors.accent, borderRadius: 2 }} />
      )}
      {titleTemplate.eyebrowStyle === 'dotted' && (
        <span style={{ width: 6, height: 6, background: colors.brand, borderRadius: 999 }} />
      )}
      <span>{page.title.eyebrow}</span>
    </div>
  );
}

/* ---------------- 标题 ---------------- */

/** 把强调词用辅助色标出。强调词必须来自 IR，不在渲染期猜测。 */
function renderMain(title: string, accentWords: string[], usage: string, accentColor: string): ReactNode {
  if (usage !== 'word' || accentWords.length === 0) return title;
  const escaped = accentWords
    .filter((w) => w.length > 0)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (escaped.length === 0) return title;
  const re = new RegExp(`(${escaped.join('|')})`, 'g');
  const parts = title.split(re);
  return parts.map((part, i) =>
    accentWords.includes(part)
      ? <span key={i} style={{ color: accentColor }}>{part}</span>
      : <span key={i}>{part}</span>,
  );
}

export function TitleBlock({
  ctx,
  colors,
  align,
  step,
  showSub = true,
  maxWidth,
  staggerIndex,
}: {
  ctx: SlideRenderContext;
  colors: SurfaceColors;
  align: 'left' | 'center';
  step: number;
  showSub?: boolean;
  maxWidth?: number;
  /** 元素逐块进场时它是第几个。不传就不逐块 */
  staggerIndex?: number | null;
}) {
  const { page, titleTemplate } = ctx;
  const sizePx = fontSize(ctx, 'title', step);
  const accentUsage = titleTemplate.accentUsage;
  const underline = accentUsage === 'underline';
  const block = accentUsage === 'block';

  return (
    <div {...withStagger(staggerIndex, {
      display: 'flex', flexDirection: 'column', gap: 18,
      alignItems: align === 'center' ? 'center' : 'flex-start', maxWidth,
    })}>
      <Eyebrow ctx={ctx} colors={colors} />
      <h1
        style={{
          margin: 0,
          fontFamily: fontFamily(ctx, 'title'),
          fontSize: sizePx,
          fontWeight: fontWeight(ctx, 'title'),
          lineHeight: lineHeight(ctx, 'title'),
          letterSpacing: letterSpacing(ctx, 'title'),
          color: colors.text,
          textAlign: align,
          textWrap: 'balance',
        }}
      >
        {renderMain(page.title.main, page.title.accentWords, accentUsage, colors.accent)}
      </h1>
      {underline && (
        <span style={{ width: Math.min(220, Math.max(72, sizePx * 3)), height: 4, background: colors.accent, borderRadius: 2 }} />
      )}
      {showSub && page.title.sub && (
        <p
          style={{
            margin: 0,
            fontFamily: fontFamily(ctx, 'subtitle'),
            fontSize: fontSize(ctx, 'subtitle'),
            fontWeight: fontWeight(ctx, 'subtitle'),
            lineHeight: lineHeight(ctx, 'subtitle'),
            color: colors.textMuted,
            textAlign: align,
            maxWidth: block ? Math.min(maxWidth ?? 1100, 1100) : maxWidth,
          }}
        >
          {page.title.sub}
        </p>
      )}
    </div>
  );
}

/* ---------------- 元素逐块进场 ---------------- */

/**
 * 把「我是第几个进场」挂到元素自己的根上。
 *
 * 只挂序号，**不挂方向**——方向由 `Slide` 的根节点给，靠自定义属性继承下来
 * （见 `styles.css` 里 `[data-lumen-stagger="…"]` 那四条）。这样四种方向只要一个关键帧。
 *
 * 返回的是要展开到元素上的属性，调用方把已有的 style 传进来合并，
 * 不传序号就原样返回——不逐块进场时一个属性都不加，元素照旧。
 */
export function withStagger(
  index: number | null | undefined,
  style: CSSProperties,
): { 'data-stagger-item'?: ''; style: CSSProperties } {
  if (index == null) return { style };
  return { 'data-stagger-item': '', style: { ...style, '--stagger-i': index } as CSSProperties };
}

/* ---------------- 正文 ---------------- */

export function Paragraphs({
  ctx, colors, staggerBase,
}: {
  ctx: SlideRenderContext;
  colors: SurfaceColors;
  /** 元素逐块进场：本段第一段的序号。不传就不逐块 */
  staggerBase?: number | null;
}) {
  const paragraphs = ctx.page.blocks.filter((b): b is Extract<Block, { type: 'paragraph' }> => b.type === 'paragraph');
  if (paragraphs.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {paragraphs.map((b, i) => (
        <p
          key={i}
          {...withStagger(staggerBase == null ? null : staggerBase + i, {
            margin: 0,
            fontFamily: fontFamily(ctx, 'body'),
            fontSize: fontSize(ctx, 'body'),
            fontWeight: fontWeight(ctx, 'body'),
            lineHeight: lineHeight(ctx, 'body'),
            color: colors.text,
            textWrap: 'pretty',
          })}
        >
          {b.text}
        </p>
      ))}
    </div>
  );
}

export function Bullets({
  ctx, colors, staggerBase,
}: {
  ctx: SlideRenderContext;
  colors: SurfaceColors;
  /** 元素逐块进场：第一条的序号。不传就不逐块 */
  staggerBase?: number | null;
}) {
  const lists = ctx.page.blocks.filter((b): b is Extract<Block, { type: 'bullets' }> => b.type === 'bullets');
  if (lists.length === 0) return null;
  // icons 与 items 按下标对齐；跨块拼起来时下标要连续，所以累加而不是各块从 0 起
  const rows = lists.flatMap((l) => l.items.map((text, i) => ({ text, icon: l.icons[i] })));
  const { gap } = langOf(ctx).gui.listRow;
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap }}>
      {rows.map((row, i) => (
        <li key={i} {...withStagger(staggerBase == null ? null : staggerBase + i, { display: 'flex', gap: 16, alignItems: 'flex-start' })}>
          <BulletLead ctx={ctx} colors={colors} index={i} icon={row.icon} />
          <span
            style={{
              fontFamily: fontFamily(ctx, 'body'),
              fontSize: fontSize(ctx, 'body'),
              fontWeight: fontWeight(ctx, 'body'),
              lineHeight: lineHeight(ctx, 'body'),
              color: colors.text,
            }}
          >
            {row.text}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- 目录 ---------------- */

/**
 * 目录。
 *
 * 条目单独成块（TocBlock）而不是复用 bullets：目录条目是导航，不是「一页要点」，
 * 复用会被品质基线「要点 ≤5 条」卡死——八章的 deck 目录本来就有八条。
 */
export function TocList({
  ctx,
  colors,
  columns = 1,
  staggerBase,
}: {
  ctx: SlideRenderContext;
  colors: SurfaceColors;
  columns?: 1 | 2;
  /** 元素逐块进场：第一条的序号。不传就不逐块 */
  staggerBase?: number | null;
}) {
  const block = ctx.page.blocks.find((b): b is Extract<Block, { type: 'toc' }> => b.type === 'toc');
  const items = block?.items ?? [];
  if (items.length === 0) return null;

  const gui = langOf(ctx).gui;
  const numbered = gui.listRow.marker === 'number';
  // 引导线的样式跟着分隔线走：商务经典是细实线，科技极简是虚线，品牌设计带强调色
  const divider = dividerCss(ctx, colors);
  const leaderStyle: CSSProperties = divider
    ? { borderBottom: divider }
    : { borderBottom: `1px solid ${mix(colors.bg, colors.border, 0.55)}` };

  const rows = items.map((item, i) => (
    <li key={i} {...withStagger(staggerBase == null ? null : staggerBase + i, { display: 'flex', alignItems: 'baseline', gap: 16, minWidth: 0 })}>
      {numbered && (
        <span
          style={{
            ...numericStyle(ctx, fontSize(ctx, 'caption')),
            flex: '0 0 auto',
            color: colors.brand,
            opacity: 0.75,
          }}
        >
          {String(i + 1).padStart(2, '0')}
        </span>
      )}
      <span
        style={{
          fontFamily: fontFamily(ctx, 'subtitle'),
          fontSize: fontSize(ctx, 'subtitle'),
          fontWeight: fontWeight(ctx, 'subtitle'),
          color: colors.text,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: '72%',
        }}
      >
        {item.title}
      </span>
      {/* 引导点线：撑满剩余宽度，把页码推到右端 */}
      <span style={{ flex: 1, minWidth: 24, transform: 'translateY(-4px)', ...leaderStyle }} />
      <span style={{ ...numericStyle(ctx, fontSize(ctx, 'caption')), flex: '0 0 auto', color: colors.textMuted }}>
        {item.pageNo > 0 ? String(item.pageNo).padStart(2, '0') : '—'}
      </span>
    </li>
  ));

  return (
    <ul
      style={{
        margin: 0,
        padding: 0,
        listStyle: 'none',
        display: 'grid',
        gridTemplateColumns: columns === 2 ? '1fr 1fr' : '1fr',
        columnGap: 64,
        rowGap: columns === 2 ? 22 : 26,
      }}
    >
      {rows}
    </ul>
  );
}

/* ---------------- 指标 ---------------- */

export function MetricCard({
  ctx,
  colors,
  metric,
  sizePx,
  featured,
  staggerIndex,
}: {
  ctx: SlideRenderContext;
  colors: SurfaceColors;
  metric: MetricBlock;
  sizePx: number;
  featured: boolean;
  /** 元素逐块进场时它是第几个。不传就不逐块 */
  staggerIndex?: number | null;
}) {
  const spec = langOf(ctx).iconography;
  const card = cardSurfaceCss(ctx, colors);
  return (
    <div
      {...withStagger(staggerIndex, {
        ...card,
        flex: '1 1 0',
        minWidth: 0,
        display: 'flex',
        flexDirection: 'column',
        ...(featured
          ? {
            background: colors.brandSoft,
            border: `1px solid ${colors.brand}`,
            boxShadow: shadowCss(ctx),
          }
          : {}),
      })}
    >
      {metric.icon && (
        <IconTile
          name={metric.icon}
          size={spec.size}
          strokeWidth={spec.strokeWidth}
          container={spec.container}
          containerTone={spec.containerTone}
          brandSoft={colors.brandSoft}
          accentSoft={colors.accentSoft}
          border={colors.border}
          brand={colors.brand}
          accent={colors.accent}
        />
      )}
      <span
        style={{
          ...numericStyle(ctx, sizePx),
          color: featured ? colors.brand : colors.text,
          whiteSpace: 'nowrap',
        }}
      >
        {metric.value}
      </span>
      <span
        style={{
          fontFamily: fontFamily(ctx, 'body'),
          fontSize: fontSize(ctx, 'body'),
          fontWeight: 500,
          color: colors.text,
        }}
      >
        {metric.label}
      </span>
      {metric.trend && (
        <span
          style={{
            ...numericStyle(ctx, fontSize(ctx, 'caption')),
            color: colors.accent,
          }}
        >
          {metric.trend}
        </span>
      )}
      {metric.source && (
        <span
          style={{
            fontFamily: fontFamily(ctx, 'caption'),
            fontSize: fontSize(ctx, 'caption') - 1,
            color: colors.textMuted,
            lineHeight: 1.5,
          }}
        >
          {metric.source}
        </span>
      )}
    </div>
  );
}

export function MetricRow({
  ctx,
  colors,
  maxCount = 4,
  featured = false,
  staggerBase,
}: {
  ctx: SlideRenderContext;
  colors: SurfaceColors;
  maxCount?: number;
  featured?: boolean;
  /** 元素逐块进场：本行第一张卡片的序号，往后依次加一。不传就不逐块 */
  staggerBase?: number | null;
}) {
  const metrics = ctx.page.blocks.filter((b): b is MetricBlock => b.type === 'metric').slice(0, maxCount);
  if (metrics.length === 0) return null;
  const size = featured ? fontSize(ctx, 'metric') : fontSize(ctx, 'metric', -1);
  return (
    <div style={{ display: 'flex', gap: 20, alignItems: 'stretch' }}>
      {metrics.map((m, i) => (
        <MetricCard
          key={i}
          ctx={ctx}
          colors={colors}
          metric={m}
          sizePx={size}
          featured={featured && i === 0}
          staggerIndex={staggerBase == null ? null : staggerBase + i}
        />
      ))}
    </div>
  );
}

/* ---------------- 图片 ---------------- */

/** 焦点裁切：object-fit: cover + 焦点位置（PRD §5.4） */
function focusPosition(focus: ImageBlock['focus']): string {
  switch (focus) {
    case 'top': return 'center top';
    case 'bottom': return 'center bottom';
    case 'left': return 'left center';
    case 'right': return 'right center';
    default: return 'center center';
  }
}

export function ImageSlot({
  ctx,
  colors,
  image,
  style,
  captionPlacement,
}: {
  ctx: SlideRenderContext;
  colors: SurfaceColors;
  image: ImageBlock | undefined;
  style?: CSSProperties;
  captionPlacement?: 'below' | 'overlay' | 'none';
}) {
  const ready = image && image.status === 'ready' && image.src.length > 0;
  const imagery = langOf(ctx).imagery;
  // 题注位置优先用调用方（版式决定），没给就用风格包的规范
  const placement = captionPlacement ?? imagery.captionPlacement;

  // 整幅出血的图片不装容器：边框与圆角都会在边缘露出底色，破坏出血
  const bleed = imagery.treatment === 'full-bleed';
  const framed = imagery.treatment === 'framed';
  const radius = bleed ? 0 : imagery.radius;
  const scrim = scrimCss(ctx);

  return (
    <figure style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 12, ...style }}>
      <div
        style={{
          position: 'relative',
          flex: '1 1 auto',
          minHeight: 120,
          borderRadius: radius,
          overflow: 'hidden',
          // 用 backgroundColor 而不是 background：下面还要单独设 backgroundImage，
          // 简写与具体属性混用会让 React 在重渲染时报警，且两者的覆盖顺序不确定
          backgroundColor: colors.surface,
          border: framed ? borderCss(ctx, colors) : 'none',
          boxShadow: framed ? shadowCss(ctx) : undefined,
          backgroundImage: ready ? `url("${image.src}")` : undefined,
          backgroundSize: 'cover',
          backgroundPosition: ready ? focusPosition(image.focus) : undefined,
        }}
      >
        {!ready && <PlaceholderGraphic colors={colors} reason={image?.placeholderReason ?? ''} />}
        {placement === 'overlay' && image?.caption && (
          <>
            <span aria-hidden="true" style={{ position: 'absolute', inset: 0, ...scrim }} />
            <figcaption
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 0,
                padding: '16px 20px',
                color: '#FFFFFF',
                fontFamily: fontFamily(ctx, 'caption'),
                fontSize: fontSize(ctx, 'caption'),
                textShadow: '0 1px 3px rgba(0,0,0,.35)',
              }}
            >
              {image.caption}
            </figcaption>
          </>
        )}
      </div>
      {placement === 'below' && image?.caption && (
        <figcaption
          style={{
            fontFamily: fontFamily(ctx, 'caption'),
            fontSize: fontSize(ctx, 'caption'),
            color: colors.textMuted,
          }}
        >
          {image.caption}
        </figcaption>
      )}
    </figure>
  );
}

/** 未就绪时的占位图形。线稿风格，与图标体系一致，不用任何 emoji。 */
function PlaceholderGraphic({ colors, reason }: { colors: SurfaceColors; reason: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        background: colors.surface,
      }}
    >
      <svg width="56" height="56" viewBox="0 0 56 56" fill="none" aria-hidden="true">
        <rect x="4" y="10" width="48" height="36" rx="4" stroke={colors.border} strokeWidth="1.5" />
        <path d="M4 38l12-11 9 8 8-6 19 13" stroke={colors.border} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx="18" cy="21" r="3.5" stroke={colors.border} strokeWidth="1.5" />
      </svg>
      <span
        style={{
          fontFamily: 'inherit',
          fontSize: 14,
          color: colors.textMuted,
        }}
      >
        {reason || '图片生成中'}
      </span>
    </div>
  );
}

/* ---------------- 图表 ---------------- */

export function ChartSlot({
  ctx,
  colors,
  chart,
  style,
}: {
  ctx: SlideRenderContext;
  colors: SurfaceColors;
  chart: ChartBlock | undefined;
  style?: CSSProperties;
}) {
  if (!chart) {
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 12, border: `1px solid ${colors.border}`, background: colors.surface,
          color: colors.textMuted, fontSize: 14, minHeight: 200, ...style,
        }}
      >
        暂无图表数据
      </div>
    );
  }
  const palette = paletteFromStyle(ctx.pack.base.tokens);
  const usage = langOf(ctx).chart;
  // 主题从解析后的界面色来，不从 tokens 直接来——深色模式下 tokens 仍是浅色阶，
  // 直接用会画出深色底上的深色文字，整张图看不见。
  const theme = {
    ...chartTheme(ctx.pack.base.tokens),
    text: colors.text,
    muted: colors.textMuted,
    grid: colors.border,
    accent: colors.accent,
  };
  return (
    <div style={{ minWidth: 0, minHeight: 0, ...style }}>
      <ChartSvg chart={chart} palette={palette} theme={theme} usage={usage} />
    </div>
  );
}

/**
 * 图表渲染。
 *
 * 交给 @lumen/charts 用 ECharts 的 SSR 模式产出静态 SVG：
 * 编辑画布、导出截图、分享单页三处拿到的是同一份字节，像素差异从根上没有了；
 * worker 里没有浏览器也能生成，不必为了画一张图拉起 DOM。
 */
/** 图表的内部分辨率。够清晰又不至于让 SVG 体积失控，缩放交给容器。 */
const CHART_W = 1000;
const CHART_H = 460;

function ChartSvg({
  chart,
  palette,
  theme,
  usage,
}: {
  chart: ChartBlock;
  palette: string[];
  theme: { text: string; muted: string; grid: string; background: string; accent?: string };
  usage: ChartUsageSpec;
}) {
  const svg = renderChartSvg(
    {
      kind: chart.kind,
      categories: chart.data.categories,
      series: chart.data.series,
      palette,
      theme,
      usage,
    },
    { width: CHART_W, height: CHART_H, responsive: true },
  );
  if (!svg) return null;

  return (
    <div
      style={{ width: '100%', height: '100%', minWidth: 0, minHeight: 0 }}
      role="img"
      aria-label="数据图表"
      // ECharts 产出的是它自己生成的 SVG 字符串，不含外部输入，直接内联
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/* ---------------- 页脚 ---------------- */

export function FooterBar({ ctx, colors }: { ctx: SlideRenderContext; colors: SurfaceColors }) {
  const { page } = ctx;
  if (!page.footer.source && !ctx.pageNoText) return null;
  const divider = dividerCss(ctx, colors);
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 24,
        fontFamily: fontFamily(ctx, 'caption'),
        fontSize: fontSize(ctx, 'caption'),
        color: colors.textMuted,
        borderTop: divider || 'none',
        paddingTop: divider ? 14 : 0,
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{page.footer.source}</span>
      <span style={numericStyle(ctx, fontSize(ctx, 'caption'))}>{ctx.pageNoText}</span>
    </div>
  );
}

export function blocksOfType<T extends Block['type']>(page: PageIR, type: T) {
  return page.blocks.filter((b) => b.type === type) as Extract<Block, { type: T }>[];
}
