import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ENTER_ANIMATION, EXIT_ANIMATION, FLIP_MS, animationCss } from '@lumen/motion';
import type { MotionName } from '@lumen/ir-schema';
import { cn } from '@lumen/ui';

/**
 * 翻页的交叉过渡。
 *
 * 只做一件事：`pageKey` 变了之后，**把上一页多挂 `FLIP_MS`**，让新页进场的同时旧页退场。
 * 不做这个的话旧页是「啪」地消失——用户看到的不是翻页，是切换。
 *
 * 两层都在文档流里同一个位置：进场层是 `relative`（它决定整个舞台的大小），
 * 退场层是 `absolute; inset: 0` 铺在同一个盒子里。退场层 `pointer-events: none`，
 * 否则这 250ms 里点到的是正在淡出的旧页。
 *
 * **进场的动画挂在层上，不挂在内层渲染器上**：内层（`Slide` / `HtmlMock`）再动一次
 * 就是双份位移，看着像页面在抖。所以演示态给内层传的动效是 `none`。
 *
 * 动效由调用方解析好再传（`auto` 必须先过 `resolveEnterMotion`）。
 * 减弱动效偏好由 CSS 的媒体查询接管：那一条会把退场层直接 `display: none`，
 * 于是退化成硬切，而不是「两层叠着不动」。
 */
export function FlipStage({
  pageKey, motion, children, className,
}: {
  /** 换页判据。变了就触发一次过渡 */
  pageKey: string;
  /** 已解析过的具体动效名 */
  motion: MotionName;
  children: ReactNode;
  className?: string;
}) {
  const lastKey = useRef(pageKey);
  const lastNode = useRef(children);
  const seq = useRef(0);
  const [previous, setPrevious] = useState<{ id: number; node: ReactNode } | null>(null);

  // 换页判据变了才搬旧页。渲染期直接调 setState 是 React 认可的
  // 「props 变了就调整派生状态」写法；这里同时更新 lastKey，所以不会反复触发
  if (lastKey.current !== pageKey) {
    lastKey.current = pageKey;
    seq.current += 1;
    setPrevious({ id: seq.current, node: lastNode.current });
  }
  // 同一次渲染里把当前节点记下来，供下一次翻页当旧页
  lastNode.current = children;

  // 旧页挂够时长就丢掉。依赖用 `previous` 本身——它只在换页与清空时换引用，
  // 同一页里的重渲染（讲解光标、编辑中）不会把它重新计时
  useEffect(() => {
    if (!previous) return;
    const id = previous.id;
    const t = window.setTimeout(() => {
      setPrevious((p) => (p && p.id === id ? null : p));
    }, FLIP_MS);
    return () => window.clearTimeout(t);
  }, [previous]);

  return (
    <div className={cn('relative', className)}>
      {previous && motion !== 'none' && (
        <div
          key={`out-${previous.id}`}
          data-flip-layer="out"
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            animation: animationCss(EXIT_ANIMATION[motion]),
          }}
        >
          {previous.node}
        </div>
      )}
      <div
        // key 让进场层在换页时重建，CSS 动画才会重播
        key={pageKey}
        data-flip-layer="in"
        className="relative"
        style={{ animation: animationCss(ENTER_ANIMATION[motion]) }}
      >
        {children}
      </div>
    </div>
  );
}
