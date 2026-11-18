import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';

/**
 * 配图库的 Node 侧：拿到原图字节。
 *
 * 浏览器只要地址就够（`stockUrl`），但**导出必须内联一切**（PRD §5.10）：
 * 成品 HTML 里不能留 `/stock/x.jpg` 这种外链，否则用户把文件发出去就全是破图。
 * 所以 worker 导出时要按同样的清单把原图读出来、转成 data URL。
 */

/** 图片资源目录。api 拿它做静态托管，worker 拿它读字节 */
export const STOCK_ASSETS_DIR = resolve(fileURLToPath(new URL('../assets/', import.meta.url)));

/** 读一张图的原图字节。文件名来自清单，不来自用户输入 */
export function readStockFile(file: string): Promise<Buffer> {
  return readFile(join(STOCK_ASSETS_DIR, file));
}
