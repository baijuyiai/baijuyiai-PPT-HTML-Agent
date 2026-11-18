import { MotionName, isMotionMode, type StyleFamily } from '@lumen/ir-schema';

/**
 * 各风格族的默认动效白名单。
 * PRD 要求每风格只允许有限的入场动效，禁止临场自由写动画。
 * 商务经典最克制（仅淡入与位移），越靠「品牌设计 / 可爱高级」越允许缩放。
 */
export const FAMILY_MOTION_WHITELIST: Record<StyleFamily, MotionName[]> = {
  'business-classic': ['none', 'fade', 'fadeUp', 'slideLeft', 'slideRight'],
  'academic-rigor': ['none', 'fade', 'fadeUp'],
  'tech-minimal': ['none', 'fade', 'fadeUp', 'fadeDown', 'slideLeft', 'slideRight'],
  'brand-design': ['none', 'fade', 'fadeUp', 'fadeDown', 'slideLeft', 'slideRight', 'scaleIn'],
  'friendly-premium': ['none', 'fade', 'fadeUp', 'fadeDown', 'slideLeft', 'slideRight', 'scaleIn'],
  // 四套指令模板族。动效一律克制：这几套的卖点是排印与结构，
  // 动画一多就把「像一个人做的」这件事冲掉了
  'swiss-minimal': ['none', 'fade', 'fadeUp'],
  'editorial-magazine': ['none', 'fade', 'fadeUp', 'slideLeft'],
  'academic-report': ['none', 'fade'],
  'consulting-report': ['none', 'fade', 'fadeUp'],
};

/** 判断某风格族是否允许某动效 */
export function isMotionAllowed(family: StyleFamily, name: MotionName): boolean {
  return FAMILY_MOTION_WHITELIST[family].includes(name);
}

/**
 * 新链路（StyleDoc 项目）的动效白名单。
 *
 * 上面那张按风格族限制的表是给**旧链路**用的：那时渲染器只有一套骨架，
 * 骨架少、动效再花就露馅，所以商务经典只给淡入、品牌设计才给缩放。
 * 新链路的页面是模型写的 HTML，动效由 CSS 关键帧统一施加，跟风格无关，所以放全量。
 *
 * 留成常量而不是在面板里就地写一个数组，是为了让「新链路到底允许哪些动效」
 * 有一个可被测试与复用的真值。
 */
export const NEW_CHAIN_MOTION_WHITELIST: readonly MotionName[] =
  MotionName.options.filter((m) => !isMotionMode(m));

/** 断言某风格族允许某动效，不允许则抛错（错误信息含 MOTION_NOT_ALLOWED 便于上层捕获） */
export function assertMotionAllowed(family: StyleFamily, name: MotionName): void {
  if (!isMotionAllowed(family, name)) {
    throw new Error(`MOTION_NOT_ALLOWED: 风格族 ${family} 不允许动效 ${name}`);
  }
}
