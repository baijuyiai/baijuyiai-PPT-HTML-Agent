import { resolveStyleDoc } from '@lumen/server-core';
import { BUILTIN_STYLE_PACKS } from '@lumen/style-engine';
import { ObsoleteSubjectError, getPage, resolveStyle } from '@lumen/server-core';
import type { PageRow } from '@lumen/server-core';
import type { StylePack, StyleDoc } from '@lumen/ir-schema';

/**
 * worker 内部小工具：payload 取值与风格包回退。
 * payload 来自数据库的 JSON 列，类型是 unknown，取值一律要收窄。
 */

/** 取非空字符串，其余一律返回 undefined */
export function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** 取有限数字，其余一律返回 undefined */
export function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** 取布尔值，其余一律返回 undefined */
export function asBool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

/** 取必填字符串，缺失时抛错（错误信息里带上字段名便于排查） */
export function requireString(v: unknown, field: string): string {
  const s = asString(v);
  if (s === undefined) throw new Error(`任务 payload 缺少必填字段：${field}`);
  return s;
}

/**
 * 取任务对应的页面。
 * 页面已被删除（通常是用户删掉了整个项目）时抛 ObsoleteSubjectError，
 * 由执行循环判定为「任务作废」而不是失败——否则这些残留任务会耗尽重试进入死信。
 */
export function requireTaskPage(pageId: string, tenantId: string): PageRow {
  try {
    return getPage(pageId, tenantId);
  } catch {
    throw new ObsoleteSubjectError(`页面已不存在：${pageId}`);
  }
}

const DEFAULT_STYLE = 'business-classic';

/**
 * 取项目风格包。
 * 库里查不到时回退到内置商务经典，避免因为风格包尚未播种就让整条导出链路失败。
 */
export function packForProject(styleId: string | null | undefined): StylePack {
  const ref = asString(styleId ?? undefined) ?? DEFAULT_STYLE;
  try {
    return resolveStyle(ref);
  } catch {
    return BUILTIN_STYLE_PACKS.find((p) => p.styleId === DEFAULT_STYLE) ?? BUILTIN_STYLE_PACKS[0]!;
  }
}

/**
 * 取新链路的风格文档。
 *
 * **找不到就返回 null，不兜底**：页面自己带 HTML 时要拿它的配色与字体栈装配文档，
 * 兜底到另一套风格会把页面的颜色改掉——那比不渲染更糟。返回 null 时调用方
 * 走旧渲染路径，页面仍然出得来。
 */
export function docForProject(styleId: string | null | undefined): StyleDoc | null {
  const ref = asString(styleId ?? undefined);
  if (!ref) return null;
  try {
    return resolveStyleDoc(ref);
  } catch {
    return null;
  }
}
