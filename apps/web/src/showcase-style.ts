import type { StyleDocSummary } from '@lumen/ir-schema';

/**
 * 功能库拿哪一套风格渲染样机。
 *
 * ## 深色那一档要挑「中性」的，不能按列表顺序取第一套
 *
 * 功能库展示的是**模块本身**（数字人、光标、版式、装饰件、动效），样机只是它们的载体。
 * 所以底色越中性，模块自己的样子越清楚。库里那套「深蓝渐变商务风」的底色是 `#0F3468`，
 * 一屏样机全是蓝的——那不是「深色模式」，那是「蓝色模式」。
 *
 * 判据是**彩度**（三通道里最大与最小的差），越低越中性；同分时取更暗的那个。
 * 不按列表顺序取：那样风格库里新增一套深色风格，就可能把深色模板整片换掉，
 * 而这件事在界面上看不出任何痕迹。
 *
 * ## 浅色那一档维持列表顺序
 *
 * 不是漏了。近白的底色里那点色相差在观感上弱得多——`#EFE6D9`（暖调纸感）看着是
 * 「纸」，不是「黄色模式」，而同样的彩度差放在 `#0F3468` 上就是满屏蓝。
 * 而且浅色那一档是用户看惯的，没有理由去动它。
 */
export function showcaseStyleOf(
  styles: StyleDocSummary[],
  theme: 'light' | 'dark',
): StyleDocSummary | undefined {
  const pool = styles.filter((s) => s.theme === theme);
  if (theme === 'light') return pool[0];
  return [...pool].sort(
    (a, b) => chromaOf(a.palette.bg) - chromaOf(b.palette.bg)
      || lumaOf(a.palette.bg) - lumaOf(b.palette.bg),
  )[0];
}

/**
 * `#RGB` / `#RRGGBB` → 三个 0–255 的通道。认不出的回 `null`。
 *
 * 认不出时按「最不中性」处理（见 `chromaOf`）：判不出来就别去当代表，
 * 让判得出来的那几套先上。
 */
function channelsOf(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** 彩度：最大通道与最小通道的差。0 是纯灰，越大越「有色」 */
export function chromaOf(hex: string): number {
  const c = channelsOf(hex);
  if (!c) return Number.POSITIVE_INFINITY;
  return Math.max(...c) - Math.min(...c);
}

/** 感知亮度。只用来给同彩度的两套分先后 */
export function lumaOf(hex: string): number {
  const c = channelsOf(hex);
  if (!c) return Number.POSITIVE_INFINITY;
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
