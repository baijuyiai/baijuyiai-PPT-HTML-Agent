/**
 * 画布上的选中框：细边 + 四角的实心锚点。
 *
 * ## 线宽按 `scale` 反算
 *
 * 这一层画在 **1920×1080 的画布里**，而画布被 `transform: scale()` 缩过——
 * 写死 px 的话，画布缩到一半线就细一半、放大就粗一倍，同一个框在不同缩放下
 * 不是同一个样子。
 *
 * **线要细**：以前是 `2/scale`（屏幕上恒定 2px），压在页面内容上像一道栏杆，
 * 一页几十个框叠起来整片发绿。1px 足够指出边界，又不挡内容。
 *
 * ## 四角用百分比定位
 *
 * 框的宽高是量出来的、每块都不一样，`left/top: 0%|100%` + `translate(-50%,-50%)`
 * 不用知道它们是多少。
 *
 * ## 为什么抽出来
 *
 * 两处共用同一套视觉：生成时的逐块揭示、画布上的文字选中。复制两份迟早会漂——
 * 而「看起来是同一套框」本身就是这两处要传达的信息。
 *
 * 图位框（`SlotHandles`）与元素编辑框不走这里：那两个是**虚线**，与这里的实线
 * 分属两套语义（可选 vs 已选中），混用反而分不清。
 */
import type { CSSProperties, HTMLAttributes } from 'react';

const CORNERS = [
  { left: '0%', top: '0%' },
  { left: '100%', top: '0%' },
  { left: '0%', top: '100%' },
  { left: '100%', top: '100%' },
] as const;

export interface FrameBox {
  /** 画布坐标（未缩放的 1920×1080 系） */
  x: number;
  y: number;
  w: number;
  h: number;
}

export function SelectionFrame({
  box, scale, opacity = 1, style, ...rest
}: {
  box: FrameBox;
  /** 画布显示宽 / 1920。屏幕像素除以它才是画布像素 */
  scale: number;
  opacity?: number;
} & HTMLAttributes<HTMLSpanElement>) {
  const lineW = Math.max(1, 1 / scale);
  const dot = Math.max(5, 5 / scale);

  return (
    <span
      aria-hidden="true"
      {...rest}
      style={{
        position: 'absolute',
        left: box.x,
        top: box.y,
        width: box.w,
        height: box.h,
        outline: `${lineW}px solid var(--brand-500)`,
        outlineOffset: 0,
        borderRadius: 2 / scale,
        opacity,
        // 框画在页面内容之上，但不能抢走指针——底下还有文字要选、图位要拖
        pointerEvents: 'none',
        ...style,
      }}
    >
      {/* 四角的锚点：实心底、带描边的小方块，压在框线上把角「钉」住 */}
      {CORNERS.map((c) => (
        <span
          key={`${c.left}-${c.top}`}
          style={{
            position: 'absolute',
            left: c.left,
            top: c.top,
            width: dot,
            height: dot,
            transform: 'translate(-50%, -50%)',
            background: 'var(--brand-500)',
            outline: `${lineW}px solid var(--brand-600)`,
            outlineOffset: 0,
          } as CSSProperties}
        />
      ))}
    </span>
  );
}
