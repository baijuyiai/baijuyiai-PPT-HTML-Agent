import type { CSSProperties, ReactNode } from 'react';
import {
  CANVAS_HEIGHT, CANVAS_WIDTH, DECORATION_BY_PAGE_TYPE, SPACING_MULTIPLIER, recipeFor,
  type DesignLanguage, type PageIR, type PageType, type RecipeDecoration,
} from '@lumen/ir-schema';
import type { SlideRenderContext } from '@lumen/render-engine';
import { complementOf } from '@lumen/style-engine';
import { avatarSrcFor } from './avatars.js';
import { mix, surfaceColorsFromPalette, type SurfaceColors } from './theme.js';

/**
 * 设计语言 → CSS 的翻译层。
 *
 * 渲染组件不直接读 `ctx.pack.base.language.*`，一律走这里。
 * 好处是「风格包缺字段」只有这一个地方需要兜底，组件里不会到处出现 `?? 12`。
 */

export function langOf(ctx: SlideRenderContext): DesignLanguage {
  return ctx.pack.base.language;
}

export function recipeOf(ctx: SlideRenderContext, pageType?: PageType) {
  return recipeFor(langOf(ctx), pageType ?? ctx.page.pageType);
}

/* ---------------- 颜色工具 ---------------- */

// `mix` / `parseHex` 已挪到 theme.ts：`surfaceColorsFromPalette` 要用它们，
// 而 theme.ts 是被本文件 import 的那一层，反过来引就成了循环。
// 这里转出去，保持 `./language.js` 原有的出口不变。
export { mix };

/* ---------------- 阴影 ---------------- */

const SHADOWS: Record<string, string> = {
  none: 'none',
  sm: '0 1px 2px rgba(16,18,22,.06), 0 1px 3px rgba(16,18,22,.04)',
  md: '0 4px 12px rgba(16,18,22,.08), 0 1px 3px rgba(16,18,22,.05)',
  lg: '0 12px 32px rgba(16,18,22,.14), 0 2px 6px rgba(16,18,22,.06)',
};

export function shadowCss(ctx: SlideRenderContext): string {
  return SHADOWS[langOf(ctx).gui.shadow] ?? SHADOWS.sm!;
}

/* ---------------- 边框与分隔 ---------------- */

export function borderCss(ctx: SlideRenderContext, colors: SurfaceColors): string {
  const b = langOf(ctx).gui.border;
  if (b.style === 'none') return 'none';
  return `${b.width}px solid ${colors.border}`;
}

/** 分隔线。accent 用品牌色，dashed 用虚线，none 返回空串让调用方跳过渲染 */
export function dividerCss(ctx: SlideRenderContext, colors: SurfaceColors): string {
  const d = langOf(ctx).gui.divider;
  switch (d) {
    case 'none': return '';
    case 'dashed': return `1px dashed ${colors.border}`;
    case 'accent': return `1px solid ${mix(colors.accent, colors.bg, 0.45)}`;
    case 'hairline':
    default: return `1px solid ${colors.border}`;
  }
}

/* ---------------- 卡片表面 ---------------- */

export function cardSurfaceCss(ctx: SlideRenderContext, colors: SurfaceColors): CSSProperties {
  const { card } = langOf(ctx).gui;
  const base: CSSProperties = {
    padding: card.padding,
    borderRadius: langOf(ctx).gui.radius.card,
    gap: card.gap,
  };
  switch (card.surface) {
    case 'flat':
      return { ...base, background: 'transparent', border: 'none' };
    case 'tinted':
      return { ...base, background: mix(colors.bg, colors.brand, 0.06), border: 'none' };
    case 'glass':
      return {
        ...base,
        background: colors.isDark ? 'rgba(255,255,255,.06)' : 'rgba(255,255,255,.62)',
        border: `1px solid ${colors.isDark ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.80)'}`,
        backdropFilter: 'blur(14px)',
        boxShadow: shadowCss(ctx),
      };
    case 'outlined':
    default:
      return { ...base, background: colors.surface, border: borderCss(ctx, colors) };
  }
}

/* ---------------- 疏密 ---------------- */

export function spacingScale(ctx: SlideRenderContext): number {
  return SPACING_MULTIPLIER[recipeOf(ctx).spacing];
}

/* ---------------- 页面底色 ---------------- */

export function pageBackground(ctx: SlideRenderContext, colors: SurfaceColors): string {
  const { background } = recipeOf(ctx);
  switch (background) {
    case 'tinted':
      return mix(colors.bg, colors.brand, colors.isDark ? 0.10 : 0.05);
    case 'gradient':
      return `linear-gradient(135deg, ${mix(colors.bg, colors.brand, 0.05)} 0%, ${mix(colors.bg, colors.accent, 0.12)} 100%)`;
    case 'grid': {
      const line = colors.isDark ? 'rgba(255,255,255,.05)' : 'rgba(16,18,22,.05)';
      return `repeating-linear-gradient(0deg, ${line} 0 1px, transparent 1px 40px), repeating-linear-gradient(90deg, ${line} 0 1px, transparent 1px 40px), ${colors.bg}`;
    }
    case 'image-overlay':
      // 图上压字时底色由图片本身给，页面底色兜一层深色以免图片没就绪时闪白
      return colors.isDark ? '#0E1013' : '#111318';
    case 'plain':
    default:
      return colors.bg;
  }
}

/* ---------------- 装饰件 ---------------- */

/**
 * 装饰件的渲染参数。
 *
 * **刻意不带 `SlideRenderContext`**：新链路的页面只有 StyleDoc，构造不出 ctx，
 * 但同一套装饰件在那边也要用（叠在模型产出的 HTML 上）。所以这里只吃
 * 「取哪个装饰 + 什么颜色 + 画布多大」这三件事，两条链路都喂得出来。
 */
export interface DecorationOverlayProps {
  decoration: RecipeDecoration;
  colors: SurfaceColors;
  canvas: { w: number; h: number; marginPx: number };
  /** 药丸圆角。风格包给的；新链路没有风格包时传一个中性值 */
  pillRadius: number;
  /** 编号徽标用的等宽字体族。取不到就交给 CSS 兜底 */
  monoFamily?: string | undefined;
  /** 编号徽标显示的数字 */
  pageNo: number;
}

/**
 * 页面装饰件。绝对定位，画在内容下层。
 *
 * 装饰件是「页类型配方」里唯一纯视觉的一项——它不承载内容，
 * 但没有它，同一套色板做出来的封面和正文页会长得一样。
 */
export function DecorationOverlay({
  decoration, colors, canvas, pillRadius, monoFamily, pageNo,
}: DecorationOverlayProps): ReactNode {
  const r = { pill: pillRadius };

  const node = ((): ReactNode => {
    switch (decoration) {
    case 'accent-bar':
      return (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: Math.round(canvas.w * 0.34),
            height: 6,
            background: colors.accent,
            borderBottomRightRadius: r.pill,
          }}
        />
      );

    case 'corner-block':
      return (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: -Math.round(canvas.w * 0.08),
            bottom: -Math.round(canvas.h * 0.14),
            width: Math.round(canvas.w * 0.42),
            height: Math.round(canvas.w * 0.42),
            borderRadius: '50%',
            background: `radial-gradient(circle, ${mix(colors.bg, colors.accent, 0.22)} 0%, transparent 70%)`,
          }}
        />
      );

    case 'numbered-badge':
      return (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: canvas.marginPx,
            top: Math.round(canvas.marginPx * 0.4),
            fontFamily: monoFamily,
            fontSize: 120,
            lineHeight: 1,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: mix(colors.bg, colors.brand, 0.18),
          }}
        >
          {String(pageNo).padStart(2, '0')}
        </span>
      );

    case 'rule':
      return (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: canvas.marginPx,
            right: canvas.marginPx,
            top: Math.round(canvas.h * 0.30),
            height: 1,
            background: colors.border,
          }}
        />
      );

    case 'dots': {
      const dots: ReactNode[] = [];
      for (let row = 0; row < 5; row += 1) {
        for (let col = 0; col < 5; col += 1) {
          dots.push(
            <span
              key={`${row}-${col}`}
              style={{
                width: 5,
                height: 5,
                borderRadius: 999,
                background: colors.border,
              }}
            />,
          );
        }
      }
      return (
        <span
          aria-hidden="true"
          style={{
            position: 'absolute',
            right: canvas.marginPx,
            bottom: canvas.marginPx,
            display: 'grid',
            gridTemplateColumns: 'repeat(5, auto)',
            gap: 14,
          }}
        >
          {dots}
        </span>
      );
    }

    case 'none':
    default:
      return null;
    }
  })();

  if (!node) return null;
  // display:contents 的包装层不参与布局，只是把装饰件类型暴露成 data 属性，
  // 好让测试和浏览器调试能直接看出这一页用了哪种装饰。
  return (
    <span data-decoration={decoration} style={{ display: 'contents' }}>
      {node}
    </span>
  );
}

/** 旧渲染器这条路：从 ctx 里取出装饰件参数，转给 `DecorationOverlay` */
export function DecorationLayer({ ctx, colors }: { ctx: SlideRenderContext; colors: SurfaceColors }): ReactNode {
  return (
    <DecorationOverlay
      decoration={recipeOf(ctx).decoration}
      colors={colors}
      canvas={ctx.canvas}
      pillRadius={langOf(ctx).gui.radius.pill}
      monoFamily={ctx.pack.base.typography.roles.find((x) => x.role === 'mono')?.family}
      pageNo={ctx.page.footer.pageNo}
    />
  );
}

/**
 * 新链路页面画装饰件时的固定参数。
 *
 * 旧链路那边「页边距多大、药丸圆角多大」是从设计稿量出来的，每套风格不同；
 * 新链路只有一份 StyleDoc，没有东西可量，所以取一组中性值：
 * 边距沿用风格包的默认 `marginRatio`（5%），圆角取中间档，都不抢模型自己的排版。
 */
export const NEW_CHAIN_DECORATION = {
  marginPx: Math.round(1920 * 0.05),
  pillRadius: 8,
} as const;

/**
 * 新链路页面该叠哪一层装饰件。
 *
 * 浏览器（`HtmlMock`）与导出（`render.tsx`）都渲染这一个组件，取的是同一份
 * `DECORATION_BY_PAGE_TYPE` 与同一组中性参数——两处各挑一次装饰，就会出现
 * 「编辑器里有、导出来没有」。
 *
 * 装饰**不进 iframe**：进去就得跟模型自己写的 CSS 抢选择器，而且那边是纯 HTML 字符串、
 * 用不了 React 组件。所以它叠在 iframe 之上，与页面内容同一个 1920×1080 坐标系。
 */
export function NewChainDecoration({
  pageType, palette, isDark, fontFamily, pageNo,
}: {
  pageType: PageType;
  palette: { bg: string; surface: string; text: string; muted: string; accent: string; brand: string; border: string };
  isDark: boolean;
  fontFamily: string;
  pageNo: number;
}): ReactNode {
  const decoration = DECORATION_BY_PAGE_TYPE[pageType];
  if (decoration === 'none') return null;
  // 编号徽标要有个数。页码未知时（风格库的样机、单页重识别）宁可不画——
  // 画出来是「00」，比没有更难看，也容易让人以为那是个真的页码
  if (decoration === 'numbered-badge' && pageNo <= 0) return null;
  return (
    <DecorationOverlay
      decoration={decoration}
      colors={surfaceColorsFromPalette(palette, isDark)}
      canvas={{ w: CANVAS_WIDTH, h: CANVAS_HEIGHT, marginPx: NEW_CHAIN_DECORATION.marginPx }}
      pillRadius={NEW_CHAIN_DECORATION.pillRadius}
      monoFamily={fontFamily}
      pageNo={pageNo}
    />
  );
}

/* ---------------- 数字人与讲解光标（新链路） ---------------- */

/**
 * 浮框态占画布面积的几分之一。定在十二分之一：一块 555×312 的窗口，
 * 摆在页面右下角够看清讲解人，又不会压住正文。
 *
 * 按面积定而不是按宽度：宽度八分之一只有 240px，摆在 1080 高的画布上是一条小纸条，
 * 那不像窗口，像条进度条。
 */
const FLOAT_AREA_RATIO = 12;
/**
 * 浮框的取景比例。**跟画布同为 16:9**——一块缩小的一屏，与页面同形。
 */
const FLOAT_ASPECT = 16 / 9;

/**
 * 新链路数字人。
 *
 * 旧链路那边直径、位置、偏移、描边、投影都取自风格包的组件层；新链路只有一份
 * StyleDoc，没有那一层。**这些值本来就在页面上**（`page.avatar` 带 diameter /
 * position / offset / border / shadow，是逐页可配的），所以直接用页面自己的，
 * 不去编一套中性默认——编出来的默认会把用户逐页调过的位置盖掉。
 */
export function NewChainAvatar({ avatar }: { avatar: PageIR['avatar'] }): ReactNode {
  if (!avatar.enabled || avatar.mode === 'off') return null;

  // 优先用上传的肖像，其次落到 modelId 对应的内置预设
  const src = avatar.portraitUrl || avatarSrcFor(avatar.modelId);

  /**
   * 全屏态：**画面被数字人整个盖住**，不留圆形蒙版。
   *
   * 原先是「一层半透明遮罩 + 正中一个圆」。那不是全屏——页面还占着大半个画面，
   * 中间悬着个头像。全屏的意思就是讲解人占满这一屏，页面让位。
   *
   * `objectFit: cover` 而不是 `contain`：contain 会在两侧留黑边，那又变成"一张图
   * 摆在页面中间"了。cover 让画面被填满，多出来的部分裁掉——正对上传的竖构图肖像，
   * 也正对内置的方形剪影（剪影会放大成头肩特写，看着就是讲解人站在镜头前）。
   */
  if (avatar.mode === 'fullscreen') {
    return (
      <div data-avatar="fullscreen" style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        <img
          src={src}
          alt="讲解数字人"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    );
  }

  const { diameter, position, offset, border, shadow } = avatar;
  const corner: CSSProperties =
    position === 'bottom-left' ? { left: offset.x, bottom: offset.y }
      : position === 'bottom-right' ? { right: offset.x, bottom: offset.y }
        : position === 'top-left' ? { left: offset.x, top: offset.y }
          : { right: offset.x, top: offset.y };
  const shadowCss = shadow === 'md' ? '0 8px 24px rgba(0,0,0,.18)'
    : shadow === 'sm' ? '0 1px 2px rgba(0,0,0,.10)' : 'none';

  /**
   * 浮框态：**右下角一块圆角矩形**，像视频通话里的自画面。
   *
   * 与 `pip` 的分工不是位置而是**分量**：pip 是角落里一枚圆，让位给内容；
   * 浮框是一块实打实占着画面的窗口，用它的时候讲解人是要被看清的。
   *
   * 尺寸按**画布面积的比例**推，不另开配置项：它是个比例，不随页面尺寸变，
   * 摆成写死的像素只会在别的画布上跑偏。取景比例与画布同为 16:9（见 `FLOAT_ASPECT`）。
   */
  if (avatar.mode === 'float') {
    const area = (CANVAS_WIDTH * CANVAS_HEIGHT) / FLOAT_AREA_RATIO;
    const height = Math.round(Math.sqrt(area / FLOAT_ASPECT));
    return (
      <img
        src={src}
        alt="讲解数字人"
        data-avatar="float"
        style={{
          position: 'absolute',
          width: Math.round(height * FLOAT_ASPECT),
          height,
          borderRadius: 24,
          objectFit: 'cover',
          border: border === 'none' ? 'none' : border,
          boxShadow: shadowCss,
          ...corner,
        }}
      />
    );
  }

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
        boxShadow: shadowCss,
        ...corner,
      }}
    />
  );
}

/**
 * 讲解光标的三种形状。
 *
 * 三种的**分工**：箭头是「我在这儿点」，圆点是「就是这一个」，光圈是「这一片」。
 * 三种都画得出来（`CursorGlyph`），功能库那边并排摆出来给人看。
 */
export const CURSOR_SHAPES = ['arrow', 'dot', 'halo'] as const;
export type CursorShape = (typeof CURSOR_SHAPES)[number];

export const CURSOR_SHAPE_LABEL: Record<CursorShape, string> = {
  arrow: '鼠标箭头',
  dot: '圆点',
  halo: '光圈',
};

/** 一句话说明。功能库把三种并排摆出来时，靠它讲清各自的用法 */
export const CURSOR_SHAPE_BRIEF: Record<CursorShape, string> = {
  arrow: '我在这儿点——指某个具体的控件或链接',
  dot: '就是这一个——点在一个词或一个数字上',
  halo: '这一片——圈出一块区域，不指向某一点',
};

/**
 * 新链路讲解光标的固定参数。
 *
 * 旧链路是从风格包组件层读的；新链路没有那一层，取 `CursorComponentStyle` 的默认值
 * （48px / 1200ms 呼吸 / 400ms 缓动）。**颜色不在这里**：它必须跟着
 * 这套风格的强调色走，从 palette 传进来，写死一个色值就等于把风格丢了。
 *
 * `shape` 定死一种，**不是漏了选择器**：三种形状都能画，但新链路还没有「让用户挑」
 * 的那个字段与界面。要换默认改这一个字就行；真要让它可选，得先有存它的地方。
 */
export const NEW_CHAIN_CURSOR = {
  shape: 'halo' as CursorShape,
  size: 48,
  pulseMs: 1200,
  moveEaseMs: 400,
} as const;

/** 描边与投影用的中性色。与强调色无关——它们是**衬底**，保证光标压在深色或浅色上都看得见 */
const CURSOR_RING = 'rgba(255,255,255,.92)';
const CURSOR_SHADE = '0 2px 10px rgba(16,18,22,.38)';

/**
 * 画一个光标形状。
 *
 * **每一条线都比一般指针粗，而且都带一圈白描边。** 理由有两条：
 * - 这是投到大屏上看的，细线一投出去就没了；
 * - 很多风格的强调色本身偏浅（亮橙、亮黄），只画强调色的话压在浅底上直接糊掉。
 *   白描边 + 暗投影把形状从底色里"抠"出来，换哪套风格都立得住。
 *
 * 单独抽出来是因为功能库那边要**把三种形状并排摆出来给人挑**——
 * 让那边自己再画一遍必然和这里画得不一样。
 */
export function CursorGlyph({ shape, size, color }: { shape: CursorShape; size: number; color: string }): ReactNode {
  if (shape === 'arrow') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        aria-hidden="true"
        style={{ display: 'block', filter: 'drop-shadow(0 2px 6px rgba(16,18,22,.45))' }}
      >
        <path d="M9 4l31 18-13 3.6L21 40z" fill={color} stroke={CURSOR_RING} strokeWidth="3.5" strokeLinejoin="round" />
      </svg>
    );
  }
  if (shape === 'dot') {
    return (
      <span
        style={{
          display: 'block',
          width: size * 0.46,
          height: size * 0.46,
          borderRadius: 999,
          background: color,
          border: `${Math.max(3, Math.round(size * 0.08))}px solid ${CURSOR_RING}`,
          boxShadow: CURSOR_SHADE,
        }}
      />
    );
  }
  /** 光圈：镂空 + 发光。中间透出被圈住的内容，靠内外两层投影把颜色晕成一圈光 */
  return (
    <span
      style={{
        display: 'block',
        width: size,
        height: size,
        borderRadius: 999,
        background: 'transparent',
        border: `${Math.max(3, Math.round(size * 0.08))}px solid ${color}`,
        boxShadow: `0 0 ${Math.round(size * 0.2)}px ${color}, 0 0 ${Math.round(size * 0.45)}px ${color}80, inset 0 0 ${Math.round(size * 0.14)}px ${color}66, 0 0 0 2px ${CURSOR_RING}`,
      }}
    />
  );
}

/**
 * 新链路讲解光标。位置是画布比例（0~1），由讲稿分段的锚点驱动。
 *
 * **颜色取的是品牌色的互补色**，不是辅助色：光标要压在主色调铺的版面上，
 * 同色系会糊在一起，互补色才跳得出来。见 `complementOf`。
 *
 * `cursor` 为 null 或 `visible` 为 false 时不画——那表示这一段没有锚点，
 * 硬停在上一处会让人以为讲错了地方。
 */
export function NewChainCursor({
  enabled, cursor, brand,
}: {
  enabled: boolean;
  cursor: { x: number; y: number; visible: boolean } | null | undefined;
  /** 品牌色（主色调）。互补色由这里现算，调用方不用管 */
  brand: string;
}): ReactNode {
  if (!enabled || !cursor || !cursor.visible) return null;
  const c = NEW_CHAIN_CURSOR;

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
      <CursorGlyph shape={c.shape} size={c.size} color={complementOf(brand)} />
    </div>
  );
}

/* ---------------- 压字遮罩 ---------------- */

export function scrimCss(ctx: SlideRenderContext): CSSProperties {
  const s = langOf(ctx).imagery.scrim;
  if (!s.enabled) return {};
  return { background: s.gradient };
}
