import type { MotionName } from '@lumen/ir-schema';

/** 页面翻页过渡时长（ms） */
export const PAGE_FLIP_MS = 250;
/** 界面元素过渡时长（ms） */
export const UI_TRANSITION_MS = 200;
/** 骨架屏脉冲周期（ms） */
export const SKELETON_PULSE_MS = 1600;

/** 缓动一律 ease-out，禁止弹跳 */
const EASE_OUT: [number, number, number, number] = [0.2, 0, 0, 1];

/** 位移偏移量（px） */
const SHIFT = 12;
/** 滑入偏移量（px） */
const SLIDE = 24;
/** 缩放起始比例 */
const SCALE_FROM = 0.96;

export interface MotionTransition {
  duration: number;
  ease: [number, number, number, number];
  delay?: number;
}

export interface MotionVariants {
  initial: Record<string, number>;
  animate: Record<string, number>;
  transition: MotionTransition;
}

/**
 * 把动效名映射为 Framer Motion 可消费的 variants 普通对象。
 * 刻意不 import framer-motion，服务端也能安全调用。
 * 时长只取 150 / 200 / 250ms 三档（none 为 0）。
 */
export function motionVariants(name: MotionName): MotionVariants {
  switch (name) {
    case 'none':
      return { initial: {}, animate: {}, transition: { duration: 0, ease: EASE_OUT } };
    case 'fade':
      return {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: { duration: 0.2, ease: EASE_OUT },
      };
    case 'fadeUp':
      return {
        initial: { opacity: 0, y: SHIFT },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.25, ease: EASE_OUT },
      };
    case 'fadeDown':
      return {
        initial: { opacity: 0, y: -SHIFT },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.25, ease: EASE_OUT },
      };
    case 'slideLeft':
      return {
        initial: { x: SLIDE },
        animate: { x: 0 },
        transition: { duration: 0.2, ease: EASE_OUT },
      };
    case 'slideRight':
      return {
        initial: { x: -SLIDE },
        animate: { x: 0 },
        transition: { duration: 0.2, ease: EASE_OUT },
      };
    case 'scaleIn':
      return {
        initial: { opacity: 0, scale: SCALE_FROM },
        animate: { opacity: 1, scale: 1 },
        transition: { duration: 0.2, ease: EASE_OUT },
      };
    default:
      return { initial: {}, animate: {}, transition: { duration: 0, ease: EASE_OUT } };
  }
}
