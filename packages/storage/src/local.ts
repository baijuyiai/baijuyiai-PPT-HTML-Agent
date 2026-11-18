import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { assertSafeKey, type StorageAdapter } from './adapter.js';

export interface LocalStorageOptions {
  /** 落盘根目录 */
  rootDir: string;
  /** 公开访问前缀，默认 '/files' */
  publicBasePath?: string;
}

/** 去掉结尾斜杠，保证拼出的 URL 只有单个分隔符 */
function normalizeBasePath(base: string): string {
  return base.replace(/\/+$/, '');
}

/**
 * 本地文件系统实现：把对象写到 rootDir 下的同名相对路径。
 * 仅供开发与单机部署使用；接入云端存储请另实现 StorageAdapter。
 * 所有方法在操作前都会调用 assertSafeKey，防止 key 穿越出 rootDir。
 */
export class LocalStorage implements StorageAdapter {
  readonly rootDir: string;
  readonly publicBasePath: string;

  constructor(options: LocalStorageOptions) {
    this.rootDir = options.rootDir;
    this.publicBasePath = normalizeBasePath(options.publicBasePath ?? '/files');
  }

  async put(key: string, data: Buffer, _contentType: string): Promise<string> {
    assertSafeKey(key);
    const target = join(this.rootDir, key);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, data);
    return this.url(key);
  }

  async get(key: string): Promise<Buffer> {
    assertSafeKey(key);
    const target = join(this.rootDir, key);
    try {
      return await readFile(target);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`NOT_FOUND: 对象不存在（${key}）`);
      }
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    const target = join(this.rootDir, key);
    await rm(target, { force: true });
  }

  url(key: string): string {
    assertSafeKey(key);
    return `${this.publicBasePath}/${key}`;
  }

  async exists(key: string): Promise<boolean> {
    assertSafeKey(key);
    const target = join(this.rootDir, key);
    try {
      const info = await stat(target);
      return info.isFile();
    } catch {
      return false;
    }
  }
}
