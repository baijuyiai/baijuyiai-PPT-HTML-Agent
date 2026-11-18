import { createStorage, invalid, mimeOfName } from '@lumen/server-core';

/**
 * 把图片引用统一解成 data URL 交给风格引擎。
 *
 * 为什么要先上传再识别：一张 900px 的设计图转成 base64 就有 800KB 上下，
 * 12 张接近 10MB，远超请求体上限——直接塞 data URL 会 413。
 * 所以前端先走 /uploads 落盘，这里再把对象读回来。
 *
 * 识别风格与识别版式两条流共用这一份：**只认 `data:` 与 `/files/` 两种引用**，
 * 别的一律拒掉。这条白名单是安全边界，两边各写一份迟早有一边放松。
 */
export async function resolveImages(entries: string[]): Promise<string[]> {
  const storage = createStorage();
  const out: string[] = [];
  for (const entry of entries) {
    if (entry.startsWith('data:')) {
      out.push(entry);
      continue;
    }
    const key = entry.startsWith('/files/') ? entry.slice('/files/'.length) : null;
    if (!key) throw invalid(`不支持的图片引用：${entry.slice(0, 60)}`);
    let buffer: Buffer;
    try {
      buffer = await storage.get(decodeURIComponent(key));
    } catch {
      throw invalid(`图片不存在或已过期：${key}`);
    }
    const mime = mimeOfName(key) ?? 'image/png';
    out.push(`data:${mime};base64,${buffer.toString('base64')}`);
  }
  return out;
}
