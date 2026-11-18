import { api } from '../api/client.js';

/**
 * 上传参考图。
 *
 * 浏览器端用 canvas 统一转成 PNG：服务端只解 PNG，不引图片解码依赖。
 * 转完**先上传落盘再传引用**——一张 900px 的图 base64 就有 800KB 上下，
 * 十几张直接塞进请求体会超过上限。
 */

/** 长边压到 900px。再大对识别没有帮助，只是让请求变重 */
const MAX_SIDE = 900;

export async function toPngDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('无法创建画布上下文');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/png');
}

/** 转 PNG 并上传，返回可直接交给识别接口的引用 */
export async function uploadReferenceImages(files: File[]): Promise<string[]> {
  const out: string[] = [];
  for (const file of files) {
    const dataUrl = await toPngDataUrl(file);
    const uploaded = await api.post<{ url: string }>('/uploads', { dataUrl, name: file.name });
    out.push(uploaded.url);
  }
  return out;
}
