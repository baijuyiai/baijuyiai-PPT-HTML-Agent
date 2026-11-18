/**
 * 抠图：把一张图的主体抠出来，背景变透明。
 *
 * 走 [抠抠图](https://doc.koukoutu.com) 的同步接口（`POST https://sync.koukoutu.com/v1/create`）。
 *
 * ## 为什么用 `image_file` 而不是 `image_url`
 *
 * 接口三种入参变体（`image_url` / `image_file` / `image_base64`）共用同一个端点。
 * 我们的图在**本地磁盘**上（`data/objects/` 与素材库的 `assets/`），公网取不到，
 * 所以只能把字节传上去。
 *
 * ## 为什么用 `response=bytes` 而不是 `url`
 *
 * 文档里那个「返回响应」是空的（作者只写了个 `{}`），`response=url` 时返回的
 * JSON 长什么样**没有文档**。`bytes` 是文档写明的默认值，而且响应体就是图片本身——
 * 不用猜字段名，也不用再多下载一次。万一回来的不是图片，下面会把 JSON 里的
 * `message` 挖出来当错误报，不至于只给一句「解析失败」。
 *
 * **认格式只能看字节，不能看 `content-type`**：实测它回的是 `application/octet-stream`，
 * 头里没有格式信息。详见 `sniffImageMime`。
 *
 * ## 计费
 *
 * 同步接口 **1 积分一张**，`output_format=png` 再加 1。默认用 png：素材库那边
 * `pnpm stock:add` 只认 PNG（JPEG 存不了 alpha），而多花的那 1 积分可以忽略。
 */
import { decodePng, pngHasAlpha } from '@lumen/style-engine/png';
import { koukoutuApiKey } from './settings.service.js';

const ENDPOINT = 'https://sync.koukoutu.com/v1/create';

/** 同步接口的并发上限是 5，超时给宽一点——它要跑一整个抠图模型 */
const TIMEOUT_MS = 120_000;

export interface CutoutInput {
  buffer: Buffer;
  /** 传上去时告诉服务端是什么图。只用于 multipart 的 content-type */
  mime: string;
  /** 文件名，服务端按扩展名判格式。带扩展名 */
  filename: string;
}

export interface CutoutResult {
  buffer: Buffer;
  mime: string;
}

export interface CutoutOptions {
  /** 不传就取管理后台配的那把。测试里注入 */
  apiKey?: string;
  /** 边缘增强：0 不增强 / 1 标准 / 2 高度 */
  border?: 0 | 1 | 2;
  fetchImpl?: typeof fetch;
}

/**
 * 抠一张图。失败抛 `Error`，消息以 `CUTOUT_ERROR` 开头——调用处照惯例
 * 剥掉前缀再给用户看（与 `PROVIDER_ERROR` 同一套）。
 */
export async function cutoutImage(
  input: CutoutInput,
  opts: CutoutOptions = {},
): Promise<CutoutResult> {
  const apiKey = opts.apiKey ?? koukoutuApiKey();
  if (!apiKey.trim()) {
    throw new Error('CUTOUT_ERROR 还没有配置抠图服务的密钥，到管理后台「全局设置」里填');
  }

  const form = new FormData();
  form.append('model_key', 'background-removal');
  form.append('image_file', new Blob([new Uint8Array(input.buffer)], { type: input.mime }), input.filename);
  form.append('output_format', 'png');
  form.append('border', String(opts.border ?? 1));
  // 要字节不要 URL：URL 那种返回体的结构没有文档，猜字段名不如直接把图拿回来
  form.append('response', 'bytes');

  const doFetch = opts.fetchImpl ?? fetch;
  let res: Response;
  try {
    res = await doFetch(ENDPOINT, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`CUTOUT_ERROR 抠图服务连不上或超时：${msg}`);
  }

  /**
   * **按字节判，不看 `content-type`。** 真接口回的是 `application/octet-stream`
   * （2026-10-30 实测），头里根本没有格式信息；照抄它还会让下游拿到一个没用的 mime。
   * magic number 不会撒谎。
   *
   * **拿到了还得是带 alpha 的 PNG。** 抠图服务哪天回一张没有 alpha 的图（或者干脆
   * 回 JPEG），用户拿到的是一张不透明的图却看到「已抠图」——比报错更糟。
   * 这道检查原先在 `provider-gateway` 里守着「让模型直接出透明底」那条路，
   * 那条路删掉之后挪到这里：同一件事，守的是真正会出透明底的地方。
   *
   * 走到下面说明回来的不是可用的透明底图：要么是错误信封、要么是网关的 HTML。
   */
  const buffer = Buffer.from(await res.arrayBuffer());
  const sniffed = res.ok ? sniffImageMime(buffer) : null;
  if (sniffed) {
    if (sniffed !== 'image/png' || !pngHasAlpha(buffer)) {
      throw new Error(
        `CUTOUT_ERROR 抠图服务返回的不是透明底（${sniffed}，没有 alpha 通道）`,
      );
    }
    if (!hasSubject(buffer)) {
      throw new Error(
        'CUTOUT_ERROR 抠图服务把整张图都抠没了（这张图可能没有明确主体），换一张主体清楚的图再试',
      );
    }
    return { buffer, mime: sniffed };
  }

  /**
   * 错误信封形状是 `{ code, message, data }`——从同一家的「查询剩余积分」接口上看到的，
   * 那个是唯一一个把返回体写全了的。这里**不假设字段一定在**，挖不到就把原文截一段
   * 带出去：报「解析失败」对排查一点用都没有。
   */
  const text = buffer.toString('utf8');
  let detail = '';
  try {
    const j = JSON.parse(text) as { message?: unknown; code?: unknown };
    detail = typeof j.message === 'string' ? j.message : '';
    if (!detail && j.code !== undefined) detail = `code ${String(j.code)}`;
  } catch { /* 不是 JSON，下面用原文 */ }
  if (!detail) detail = text.replace(/[^\x20-\x7e一-龥]/g, ' ').slice(0, 200).trim() || `HTTP ${res.status}`;
  throw new Error(`CUTOUT_ERROR 抠图失败：${detail}`);
}

/**
 * 从字节认图片格式。认不出回 `null`。
 *
 * 只认素材库可能落地的三种：抠图服务要 `output_format=png`（默认），
 * 但 `webp` 也支持，JPEG 是防它哪天忽略参数直接回原格式。
 */
function sniffImageMime(buf: Buffer): string | null {
  if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

/**
 * 抠出来的是不是一张空图。
 *
 * 抠图服务对「没有明确主体」的图会把整张都判成背景、返回一张**全透明**的图。
 * **实测踩到的**：一张纯纹理照片，回来 100% 透明。
 *
 * 它格式上完全合法——是 PNG、有 alpha——所以 `pngHasAlpha` 拦不住。用户拿到的是一张
 * 看不见的图，面板上却写着「已抠图」，而这一次真扣了额度。
 *
 * 阈值与素材入库那条同口径（`stock-library` 的 `looksTransparent`）：不透明像素要占到
 * 1% 以上。两边守的是同一件事——**这张图里到底有没有东西**。
 */
function hasSubject(buf: Buffer): boolean {
  const img = decodePng(buf);
  let solid = 0;
  let total = 0;
  for (let i = 3; i < img.data.length; i += 4) {
    total += 1;
    if (img.data[i]! > 200) solid += 1;
  }
  return total > 0 && solid / total > 0.01;
}
