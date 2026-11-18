import { MOTION_PINNED, type MotionName } from '@lumen/ir-schema';

/**
 * 翻页动效的解析与关键帧名映射。
 *
 * 这个文件是动效的**单一真值**：演示态、风格库单页预览、工作台画布三处都从这里取，
 * 各写一份的话「同一个动效名在三个地方时长不同」这种偏差没人会发现。
 * `variants.ts` 是另一回事——那份给未来的 Remotion 用，形状是 framer-motion 的，别混。
 */

/** 交叉过渡时长（ms）。与 `packages/slides/src/styles.css` 里关键帧的时长一致 */
export const FLIP_MS = 250;

/**
 * 这一页的动效是不是人手选的。
 *
 * 没手选过的走默认（逐块进场、每页换方向）；手选的照播。
 */
export function isMotionPinned(motion: { from: string }): boolean {
  return motion.from === MOTION_PINNED;
}

/**
 * 演示/渲染时这一页**实际**要播的动效。
 *
 * 动效是**两层**的事，不是一件事：页面这一层（翻页时整页淡入/位移）与元素这一层
 * （页内元素一块一块进场）。原先一个 `MotionName` 两头兼顾，表达不了
 * 「整页淡入 + 元素逐块」这种组合，所以这里拆成一个显式的结果。
 */
export interface ResolvedMotion {
  /** 页面这一层。`FlipStage` 与旧渲染器的整页动画用它 */
  page: MotionName;
  /**
   * 元素逐块进场的种子。`null` = 不逐块。
   * `0` = 每页一样；`n` = 按 n 轮换进场方向（见 `html-doc.ts` 的 `staggerDirectionFor`）。
   */
  staggerSeed: number | null;
}

/**
 * 解析一页要播的动效。
 *
 * 规则：
 * - `none`：明确表态不动，两层都不动
 * - **手选过具体动效**（`from === 'manual'` 且不是 `stagger`）：整页进，元素不逐块
 * - 其余（含 `auto`、含历史上没人碰过的页面）：**逐块进场**，且按页序号换方向
 * - 手选 `stagger`：逐块进场，但每页一样
 *
 * 为什么「没手选过」也算逐块：`auto` 是后加的枚举值，历史上所有页面的 `enter`
 * 都存着 `fadeUp`（那会儿的默认值），而 `from` 从来没人写过。只看 `enter` 的话，
 * 用户手上现成的 deck 一页都不会逐块进场，这个默认等于只对新页面生效。
 */
export function resolveMotion(
  motion: { enter: MotionName; from: string },
  seed: number,
): ResolvedMotion {
  if (motion.enter === 'none') return { page: 'none', staggerSeed: null };
  // 手选「逐个进入」：逐块，但每页同一个方向，别让用户选了个固定值却每页都在变
  if (motion.enter === 'stagger') return { page: 'stagger', staggerSeed: 0 };
  if (isMotionPinned(motion)) return { page: motion.enter, staggerSeed: null };
  return { page: 'stagger', staggerSeed: seed };
}

/**
 * 进入动画的关键帧名。
 *
 * `stagger` 在**页面这一层**就是普通淡入——逐个进场发生在页内元素上，
 * 由 `--stagger-i` 排延迟（旧渲染器见 `Slide.tsx`，新链路见 `html-doc.ts`）。
 */
export const ENTER_ANIMATION: Record<MotionName, string> = {
  // auto 不该走到这里（调用方先解析），兜底当淡入而不是报错
  auto: 'lumen-fade',
  stagger: 'lumen-fade',
  none: 'none',
  fade: 'lumen-fade',
  fadeUp: 'lumen-fade-up',
  fadeDown: 'lumen-fade-down',
  slideLeft: 'lumen-slide-left',
  slideRight: 'lumen-slide-right',
  scaleIn: 'lumen-scale-in',
};

/**
 * 退出动画的关键帧名。
 *
 * **出 = 顺着进入的方向继续走**：从右边滑进来的下一页，配的是向左滑出去的上一页。
 * 反向的话两层会朝同一个方向挤，看着像撞在一起。
 */
export const EXIT_ANIMATION: Record<MotionName, string> = {
  auto: 'lumen-fade-out',
  stagger: 'lumen-fade-out',
  none: 'none',
  fade: 'lumen-fade-out',
  fadeUp: 'lumen-fade-up-out',
  fadeDown: 'lumen-fade-down-out',
  slideLeft: 'lumen-slide-left-out',
  slideRight: 'lumen-slide-right-out',
  scaleIn: 'lumen-scale-out',
};

/** 拼一段可直接放进 style 的 animation 值。`none` 时给空串，调用方好判 */
export function animationCss(name: string, ms = FLIP_MS): string {
  if (name === 'none') return '';
  return `${name} ${ms}ms var(--ease-out, cubic-bezier(0.2,0,0,1)) both`;
}
