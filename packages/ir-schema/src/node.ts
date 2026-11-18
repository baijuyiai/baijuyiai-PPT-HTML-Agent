import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

/**
 * `ir-schema` 的 Node 侧：拿到随仓库分发的字体文件。
 *
 * 浏览器只要地址就够（页面里写的是 `/fonts/x.woff2`，由 api 静态托管），
 * 但**导出必须内联一切**：成品 HTML / PDF 里不能留外链，否则用户把文件发出去、
 * 或换台机器打开，字体就退回 Georgia——而字形正是这一版最要紧的东西。
 *
 * 与 `@lumen/stock-library/node` 是同一个路数，理由也一样。
 */

/** 字体资源目录。api 拿它做静态托管，worker 导出时拿它读字节 */
export const FONT_ASSETS_DIR = resolve(fileURLToPath(new URL('../assets/fonts/', import.meta.url)));

/** 读一个字体文件的字节。文件名来自 `BUNDLED_FACES`，不来自用户输入 */
export function readFontFile(file: string): Promise<Buffer> {
  return readFile(join(FONT_ASSETS_DIR, file));
}
