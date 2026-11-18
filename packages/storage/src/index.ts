export * from './adapter.js';
export * from './local.js';

import { join } from 'node:path';
import { LocalStorage } from './local.js';

/** 模块级单例缓存：createStorage 重复调用返回同一实例 */
let cached: LocalStorage | undefined;

/**
 * 按环境变量创建本地存储实例（首次调用时创建，之后复用）。
 *
 * - LUMEN_DATA_DIR：数据根目录。**由 server-core 在启动时归一化为绝对路径**——
 *   api 与 worker 的工作目录不同，若这里按相对路径解析，两个进程会写到不同目录，
 *   导致「导出成功但下载 404」这类难查的问题。
 * - 公开访问路径固定为 `/files`，与 api 的静态托管挂载点一致；不使用
 *   LUMEN_PUBLIC_BASE_URL，因为那是给分享链接用的对外地址，不是对象存储路径。
 */
export function createStorage(): LocalStorage {
  if (cached) {
    return cached;
  }
  const dataDir = process.env.LUMEN_DATA_DIR ?? './data';
  cached = new LocalStorage({ rootDir: join(dataDir, 'objects') });
  return cached;
}
