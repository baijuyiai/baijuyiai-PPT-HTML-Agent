import type { CSSProperties } from 'react';
import { cn } from './cn.js';
import { BRAND_LOGO } from './brand-logo.js';

/**
 * 品牌标识：**HTML PPT OS**。
 *
 * 三段对应产品链路本身——给一段内容（HTML）→ 变成演示稿（PPT）→ 讲出来（OS）。
 *
 * ## 字标
 *
 * 三段同一个字体（`--font-brand`，鸿蒙排头），靠**颜色与字重**拉开层次：
 * `HTML` 加粗取正文色、`PPT` 更粗一档并取品牌色、`OS` 收成右上角一枚小角标。
 * 前两段排成一行读作「HTML PPT」，第三段挂在右上角——「OS」是运行环境，
 * 不是一个并列的产物，压成角标正好说出这层从属关系。
 *
 * ## 颜色为什么要分主题
 *
 * 规格是「HTML 白、PPT 荧光绿」，那是压在深色上的样子，也正是默认主题。
 * 但浅色主题下侧栏底色接近白：白字看不见，荧光绿只有 1.6:1 也读不出来。
 * 所以这里不写死白与绿，而是取两个**语义**令牌——
 * `--text-1`（当前主题的主文字色）与 `--brand-600`（当前背景下读得清的那一档品牌色）。
 * 深色下它们就是白与荧光绿，浅色下自动换成近黑与橄榄绿。结构不变，只换色。
 */

export type BrandTone = 'default' | 'onBrand';

/**
 * 品牌墨色底上的字标（登录页左侧那块面板）。
 *
 * 这一档就是规格里的原样：`HTML` 白、`PPT` 荧光绿。**它要求底色是深的**——
 * 白压在荧光绿上只有 1.36:1，反过来也一样。所以那块面板得是墨色，
 * 不能是一整面荧光绿：那样不仅字读不出来，方块 logo 也会化进底色里，
 * 方形就没了。
 *
 * `--brand-500` 两套主题同值，所以这一档不用跟着主题变。
 */
const ON_BRAND_TEXT = 'text-white';
const ON_BRAND_ACCENT = 'text-[var(--brand-500)]';
const ON_BRAND_BADGE = 'bg-[var(--brand-500)]/18 text-[var(--brand-500)]';

/** 字标正文那一段 */
const TONE_TEXT: Record<BrandTone, string> = {
  default: 'text-[var(--text-1)]',
  onBrand: ON_BRAND_TEXT,
};
/**
 * `PPT` 那一段。
 *
 * 取 `--brand-600` 而不是 500：**500 是荧光绿本体，它只能当填充**——
 * 画在白底上对比度 1.6:1，当文字等于没写。600 是同一族里读得清的那一档。
 * 墨色底上则没有这个问题，直接用 500。
 */
const TONE_ACCENT: Record<BrandTone, string> = {
  default: 'text-[var(--brand-600)]',
  onBrand: ON_BRAND_ACCENT,
};
/** `OS` 角标 */
const TONE_BADGE: Record<BrandTone, string> = {
  default: 'bg-[var(--brand-100)] text-[var(--brand-600)]',
  onBrand: ON_BRAND_BADGE,
};

/**
 * 字标。字号由调用方给：`style.fontSize` 或 `className` 里的 `text-*` 都行，
 * 里面的 `OS` 角标用 `em` 跟着一起缩放。
 */
export function BrandWordmark({
  className, tone = 'default', style,
}: {
  className?: string;
  tone?: BrandTone;
  style?: CSSProperties;
}) {
  return (
    <span className={cn('whitespace-nowrap leading-none', className)} style={style}>
      <span className={cn('font-(family-name:--font-brand) font-bold', TONE_TEXT[tone])}>HTML</span>
      <span className={cn('ml-[0.36em] font-(family-name:--font-brand) font-extrabold tracking-[-0.01em]', TONE_ACCENT[tone])}>
        PPT
      </span>
      <span
        className={cn(
          // -top 用的是角标自己的 em（0.56 个正文 em），所以看着抬得多、实际抬得少，
          // 正好落在「正文顶端再往上一点」——角标该在的位置
          'relative -top-[0.78em] ml-[0.3em] inline-block rounded-full px-[0.5em] py-[0.18em]',
          'align-baseline font-(family-name:--font-brand) text-[0.56em] font-semibold leading-none',
          TONE_BADGE[tone],
        )}
      >
        OS
      </span>
    </span>
  );
}

/**
 * 方块 logo：**用户给的那张图，原样用**，只在右上角切一刀。
 *
 * 不裁圆角、不加描边、不加投影——图本身就是一枚方形的品牌贴纸，
 * 加任何修饰都是替用户改图。
 *
 * 右上角那一刀用 `clip-path` 而不是 `border-radius`：**切角与圆角是两回事**，
 * 圆角是把角磨圆，切角是把角斜着削掉一条边。用 `polygon` 走 45° 斜线才是削。
 * 切的是右上角——右下角是那枚红色的 `HTML` 药丸，切了会缺一块。
 *
 * 比例写百分比而不是像素：这个方块在侧栏是 28、后台登录页是 44，
 * 按像素切的话小尺寸那一处会看不出切过。
 */
export function BrandMark({ size = 28, alt = '' }: { size?: number; alt?: string }) {
  return (
    <img
      src={BRAND_LOGO}
      width={size}
      height={size}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      draggable={false}
      className="block shrink-0 select-none"
      style={{ clipPath: 'polygon(0 0, 75% 0, 100% 25%, 100% 100%, 0 100%)' }}
    />
  );
}

/** 图标 + 字标。侧栏、登录页、后台顶栏都用这一份，三处不会各写各的 */
export function BrandLockup({
  collapsed = false,
  size = 28,
  tone = 'default',
  className,
}: {
  collapsed?: boolean;
  size?: number;
  tone?: BrandTone;
  className?: string;
}) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      {/* 收起时只剩方块，它就是唯一的品牌信号，得让屏幕阅读器念出来；展开时字标已经念过了 */}
      <BrandMark size={size} alt={collapsed ? 'HTML PPT OS' : ''} />
      {/*
        字标字号**跟着方块走**，不写死。方块在侧栏是 28、登录页是 36，
        写死一个字号的话，大尺寸那处字会明显偏小、两处看着不像同一个标识。
        0.62 是量出来的：方块 28 时字标 17px，与方块同高看过去最匀。
      */}
      {!collapsed && <BrandWordmark style={{ fontSize: Math.round(size * 0.62) }} tone={tone} />}
    </span>
  );
}
