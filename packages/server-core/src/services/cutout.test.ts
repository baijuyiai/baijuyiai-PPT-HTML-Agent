import assert from 'node:assert/strict';
import test from 'node:test';
import { encodePng } from '@lumen/style-engine/png';
import { cutoutImage } from './cutout.service.js';

/**
 * 抠图服务。**不打真接口**：这里验的是「请求拼得对不对」与「各种失败怎么报」，
 * 那两件事不需要花钱、也不该依赖对方服务在不在。
 *
 * 唯一的例外是「真接口回什么」那几条——它们是实测出来的事实，写在用例里当回归。
 */

/**
 * 2×2 的 ct=6（RGBA）**不透明** PNG——抠图服务正常返回的样子。
 *
 * 现造而不是贴一段 base64：这几个字节要同时满足两件事，写出来才看得出是哪两件——
 * **有 alpha 通道**（否则被 `pngHasAlpha` 拦下）、**有实体像素**（否则被 `hasSubject`
 * 当成「抠没了」）。随手贴一张 1×1 的图很容易踩到后者。
 */
const PNG = Buffer.from(encodePng({
  width: 2,
  height: 2,
  data: Buffer.from([
    200, 30, 30, 255, 210, 40, 40, 255,
    190, 20, 20, 255, 205, 35, 35, 255,
  ]),
}));

/** 1×1 的 ct=2（真彩 RGB，无 alpha）PNG：背景没抠掉的典型形态 */
const NO_ALPHA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPgEpEDAABoAD1UCKP3AAAAAElFTkSuQmCC',
  'base64',
);

/** 记下调用参数的假 fetch，返回给定的响应 */
function fakeFetch(res: Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init! });
    return res;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const imageRes = (mime = 'image/png') => new Response(new Uint8Array(PNG), {
  status: 200, headers: { 'content-type': mime },
});

const input = { buffer: PNG, mime: 'image/png', filename: 'shot.png' };

test('没配密钥时直接报错，且告诉人去哪配', async () => {
  await assert.rejects(
    () => cutoutImage(input, { apiKey: '' }),
    (e: Error) => e.message.startsWith('CUTOUT_ERROR') && e.message.includes('管理后台'),
  );
});

test('成功时把图片字节原样带回来', async () => {
  const { impl, calls } = fakeFetch(imageRes());
  const out = await cutoutImage(input, { apiKey: 'k', fetchImpl: impl });
  assert.equal(out.mime, 'image/png');
  assert.deepEqual(out.buffer, PNG);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://sync.koukoutu.com/v1/create');
});

test('请求按文档拼：X-API-Key 走头，其余走 multipart', async () => {
  const { impl, calls } = fakeFetch(imageRes());
  await cutoutImage(input, { apiKey: 'secret', fetchImpl: impl, border: 2 });

  const headers = calls[0]!.init.headers as Record<string, string>;
  assert.equal(headers['X-API-Key'], 'secret');

  const form = calls[0]!.init.body as FormData;
  assert.equal(form.get('model_key'), 'background-removal');
  assert.equal(form.get('output_format'), 'png');
  assert.equal(form.get('border'), '2');
  // 要字节不要 URL：URL 那种返回体的结构没有文档
  assert.equal(form.get('response'), 'bytes');
  assert.ok(form.get('image_file') instanceof Blob, 'image_file 应当是文件而不是 URL');
});

test('默认要 PNG：素材库那边只认 PNG', async () => {
  const { impl, calls } = fakeFetch(imageRes());
  await cutoutImage(input, { apiKey: 'k', fetchImpl: impl });
  assert.equal((calls[0]!.init.body as FormData).get('output_format'), 'png');
});

/* ---------------- 回来的东西必须真的是透明底 ---------------- */

/**
 * **真接口回的是 `application/octet-stream`**（2026-10-30 实测）。
 *
 * 原先的判据是 `content-type.startsWith('image/')`，在真接口上不成立——
 * 于是把 PNG 字节当 JSON 解析，报出一串乱码。测试里的 mock 回的是 `image/png`，
 * 所以这个错假设一直没被抓住。
 *
 * 改成按字节判：magic number 不会撒谎，头会。
 */
test('头写 application/octet-stream 但字节是 PNG 时照收不误', async () => {
  const res = new Response(new Uint8Array(PNG), {
    status: 200, headers: { 'content-type': 'application/octet-stream' },
  });
  const { impl } = fakeFetch(res);
  const out = await cutoutImage(input, { apiKey: 'k', fetchImpl: impl });
  assert.deepEqual(out.buffer, PNG);
  assert.equal(out.mime, 'image/png', 'mime 该从字节认出来，不该照抄那个没用的头');
});

/**
 * 抠图服务要是哪天回一张没有 alpha 的图，用户拿到的是一张**不透明的图**却看到
 * 「已抠图」——比报错更糟。这条检查原先在 `provider-gateway` 里守着「让模型直接出
 * 透明底」那条路，那条路删掉之后挪到这里：同一件事，守的是真正会出透明底的地方。
 */
test('回来的 PNG 没有 alpha 时报错，不假装成功', async () => {
  const res = new Response(new Uint8Array(NO_ALPHA), {
    status: 200, headers: { 'content-type': 'application/octet-stream' },
  });
  const { impl } = fakeFetch(res);
  await assert.rejects(
    () => cutoutImage(input, { apiKey: 'k', fetchImpl: impl }),
    (e: Error) => e.message.startsWith('CUTOUT_ERROR') && e.message.includes('alpha'),
  );
});

/**
 * **实测踩到的**：拿一张纯纹理照片去抠，服务把整张都判成背景、返回一张全透明的图。
 *
 * 它格式上完全合法——是 PNG、有 alpha——所以上面那条拦不住。用户看到的是一张看不见的
 * 图，面板上却写着「已抠图」；而这一次真的扣了额度。
 */
test('抠成一张全透明的空图时报错——那张图没有明确主体', async () => {
  const empty = Buffer.from(encodePng({ width: 4, height: 4, data: Buffer.alloc(4 * 4 * 4) }));
  const res = new Response(new Uint8Array(empty), {
    status: 200, headers: { 'content-type': 'application/octet-stream' },
  });
  const { impl } = fakeFetch(res);
  await assert.rejects(
    () => cutoutImage(input, { apiKey: 'k', fetchImpl: impl }),
    (e: Error) => e.message.startsWith('CUTOUT_ERROR') && e.message.includes('抠'),
  );
});

test('回来的不是 PNG（比如 JPEG）也报错——它不可能带 alpha', async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const res = new Response(new Uint8Array(jpeg), {
    status: 200, headers: { 'content-type': 'image/jpeg' },
  });
  const { impl } = fakeFetch(res);
  await assert.rejects(
    () => cutoutImage(input, { apiKey: 'k', fetchImpl: impl }),
    (e: Error) => e.message.startsWith('CUTOUT_ERROR') && e.message.includes('image/jpeg'),
  );
});

/* ---------------- 失败怎么报 ---------------- */

test('回来的是错误信封时，把 message 挖出来报，而不是只说解析失败', async () => {
  const res = new Response(JSON.stringify({ code: 400, message: '积分不足' }), {
    status: 400, headers: { 'content-type': 'application/json' },
  });
  const { impl } = fakeFetch(res);
  await assert.rejects(
    () => cutoutImage(input, { apiKey: 'k', fetchImpl: impl }),
    (e: Error) => e.message.startsWith('CUTOUT_ERROR') && e.message.includes('积分不足'),
  );
});

test('回来的是非 JSON 时带一段原文，不留「解析失败」这种空话', async () => {
  const res = new Response('<html>502 Bad Gateway</html>', {
    status: 502, headers: { 'content-type': 'text/html' },
  });
  const { impl } = fakeFetch(res);
  await assert.rejects(
    () => cutoutImage(input, { apiKey: 'k', fetchImpl: impl }),
    (e: Error) => e.message.includes('502 Bad Gateway'),
  );
});

test('200 但回的不是图片也算失败', async () => {
  const res = new Response(JSON.stringify({ code: 200, message: 'success' }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
  const { impl } = fakeFetch(res);
  await assert.rejects(
    () => cutoutImage(input, { apiKey: 'k', fetchImpl: impl }),
    (e: Error) => e.message.startsWith('CUTOUT_ERROR'),
  );
});

test('连不上时带上原因，不吞掉', async () => {
  const impl = (async () => { throw new Error('ECONNRESET'); }) as unknown as typeof fetch;
  await assert.rejects(
    () => cutoutImage(input, { apiKey: 'k', fetchImpl: impl }),
    (e: Error) => e.message.includes('ECONNRESET'),
  );
});
