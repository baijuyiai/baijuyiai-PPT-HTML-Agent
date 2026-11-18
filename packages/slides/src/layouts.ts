import { geometryFor } from '@lumen/style-engine';
import type { VariantGeometry } from '@lumen/ir-schema';

/**
 * 版式描述符的读取口。
 *
 * 几何的**真值在风格包里**（`LayoutVariantSpec.geometry`，由 style-engine 的
 * `buildLayouts` 从 `DEFAULT_VARIANT_GEOMETRY` 与容量一起写出去）。
 * 这里只做一件事：从渲染上下文里的 variant 取出它，缺失时由 style-engine 回落。
 *
 * 早先这张表是模块级常量，任何风格都套同一副骨架——「换个风格只是换颜色和字体」
 * 的结构性原因就在这里。识别出来的风格要能按原稿排版，几何就必须能从包里读到。
 */

export type VariantLayout = VariantGeometry;
export type { LayoutKind } from '@lumen/ir-schema';

/** 取该版式的几何。未知版式回落到文本版式，避免渲染期崩溃 */
export function layoutFor(variant: { id: string; geometry?: VariantGeometry }): VariantGeometry {
  return geometryFor(variant);
}
