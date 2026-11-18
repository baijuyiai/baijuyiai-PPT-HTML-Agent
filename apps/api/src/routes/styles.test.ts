import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';

const tmp = mkdtempSync(join(tmpdir(), 'lumen-styles-'));
process.env.NODE_ENV = 'test';
process.env.LUMEN_DB_PATH = join(tmp, 'test.db');
process.env.LUMEN_SECRET_KEY = 'test-secret-key-0123456789abcdefghijklmnop';

const { createApp } = await import('../app.js');
const { migrate, ensureSeed, closeDb, saveStyleDoc } = await import('@lumen/server-core');
const { PAGE_TYPE_ORDER, StyleDoc } = await import('@lumen/ir-schema');

migrate();
ensureSeed();

const server: Server = createApp().listen(0);
await new Promise<void>((r) => server.once('listening', () => r()));
const addr = server.address();
const port = typeof addr === 'object' && addr ? addr.port : 0;
const base = `http://127.0.0.1:${port}`;

test.after(() => {
  server.close();
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

interface Res { status: number; body: { ok: boolean; data?: any; error?: { code: string; message: string } } }

async function api(path: string, init: RequestInit = {}): Promise<Res> {
  const res = await fetch(base + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : { ok: false } };
}

const OK_PROMPT = '角色：x\n任务：y\n视觉与排版要求：\n1. z\n代码要求（非常重要）：\n1. w';
// 缺了「代码要求（非常重要）：」这一段
const BAD_PROMPT = '角色：x\n任务：y\n视觉与排版要求：\n1. z';

let token = '';
let styleId = '';
const auth = () => ({ authorization: `Bearer ${token}` });

test('准备一个用户与一套风格', async () => {
  const r = await api('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ username: 'styleuser', password: 'abcd1234' }),
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  token = r.body.data.accessToken;

  styleId = `styles-test-${Date.now().toString(36)}`;
  const saved = saveStyleDoc(StyleDoc.parse({
    styleId, version: '1.0', name: '测试风格', description: '一句话说明',
    // palette 在 StyleDoc 契约里是必填项（没有默认值），不给它 parse 会直接抛。
    // 计划里这段漏了 palette，会让准备步骤失败、后面每条用例都拿不到风格。
    palette: {
      bg: '#ffffff', surface: '#f5f5f5', text: '#111111', muted: '#888888',
      accent: '#3366ff', brand: '#3366ff', border: '#e5e5e5',
    },
    pagePrompts: {
      cover: { pageType: 'cover', prompt: OK_PROMPT, mockHtml: '<div>样机</div>', source: 'reference' },
      // 第二个页类型，提示词**也是坏的**：用来钉住「只报被改那一页」——
      // 服务端漏了按页过滤的话，这一条的问题会跟着一起冒出来
      toc: { pageType: 'toc', prompt: BAD_PROMPT, mockHtml: '<div>目录样机</div>', source: 'derived' },
    },
  }));
  assert.equal(saved.ok, true);
});

test('pageType 不在枚举里时明确报错，而不是当成 text 处理', async () => {
  const r = await api(`/api/styles/docs/${styleId}/pages/not-a-type/slides`, {
    method: 'POST', headers: auth(), body: JSON.stringify({ image: 'data:image/png;base64,AAAA' }),
  });
  assert.equal(r.status, 400);
});

test('裁切框越界时明确报错', async () => {
  const r = await api(
    `/api/styles/docs/${styleId}/pages/cover/recognize-stream?image=x&x0=0&y0=0&x1=2&y1=1`,
    { headers: auth() },
  );
  assert.equal(r.status, 400);
});

test('裁切框反了（x1 小于 x0）也报错', async () => {
  const r = await api(
    `/api/styles/docs/${styleId}/pages/cover/recognize-stream?image=x&x0=0.8&y0=0&x1=0.2&y1=1`,
    { headers: auth() },
  );
  assert.equal(r.status, 400);
});

test('风格不存在时替换报 404（业务 404，不是「接口不存在」）', async () => {
  const r = await api('/api/styles/docs/not-a-style/pages/cover', {
    method: 'PUT', headers: auth(),
    body: JSON.stringify({ prompt: OK_PROMPT, mockHtml: '<div>x</div>' }),
  });
  assert.equal(r.status, 404);
  // 光看状态码分不出「风格不存在」与「路由被删了」——两者都是 404。
  // app 级 notFoundHandler 的报文是「接口不存在：…」，业务 404 说的是「风格不存在：…」
  assert.match(r.body.error!.message, /风格不存在/, JSON.stringify(r.body));
});

test('替换成功后那一格换了、其余没动', async () => {
  const r = await api(`/api/styles/docs/${styleId}/pages/cover`, {
    method: 'PUT', headers: auth(),
    body: JSON.stringify({ prompt: OK_PROMPT, mockHtml: '<div>新的</div>' }),
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));

  const detail = await api(`/api/styles/docs/${styleId}`, { headers: auth() });
  assert.equal(detail.body.data.pagePrompts.cover.mockHtml, '<div>新的</div>');
  assert.equal(detail.body.data.pagePrompts.cover.source, 'manual');
  assert.equal(detail.body.data.pagePrompts.cover.edited, true);
});

test('提示词不合契约时照样保存，但只把被改那一页的问题回给界面', async () => {
  const r = await api(`/api/styles/docs/${styleId}/pages/cover`, {
    method: 'PUT', headers: auth(),
    body: JSON.stringify({ prompt: BAD_PROMPT, mockHtml: '<div>x</div>' }),
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));

  const issues = r.body.data.issues as { pageType: string; message: string }[];
  assert.ok(issues.length > 0, '问题必须回给界面，否则从重试到落库全程无人知晓');
  // 夹具里 toc 的提示词同样是坏的：漏了按页过滤的话，toc 的问题会一起冒出来
  assert.deepEqual(
    [...new Set(issues.map((i) => i.pageType))],
    ['cover'],
    '只该报被改的这一页，别的页早有的问题不该算在这次头上',
  );
  // 锁到具体规则，不能只看条数：条数对了但报的不是缺哪一段，界面照样在撒谎
  assert.ok(
    issues.some((i) => i.message.includes('代码要求（非常重要）')),
    `要指出缺的是哪一段，实际：${JSON.stringify(issues)}`,
  );
});

test('传了非 PNG 的图时明确报 400，而不是让它变成 500', async () => {
  // decodeImage 排在模型调用之前，所以这条不会真的去打模型——坏图在花钱之前就炸
  const r = await api(`/api/styles/docs/${styleId}/pages/cover/slides`, {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ image: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' }),
  });
  assert.equal(r.status, 400);
});

test('router 级鉴权守卫拦下未登录请求（覆盖这三个路径）', async () => {
  // 这条测的是 stylesRouter.use(requireAuth) 那道守卫，**不是**三个 handler：
  // handler 要等路由匹配之后才跑，而未登录时守卫先一步拦下，请求根本到不了 handler。
  // handler 确实跑起来由下面那条「风格不存在」的用例证明
  const calls = [
    api(`/api/styles/docs/${styleId}/pages/cover/slides`, {
      method: 'POST', body: JSON.stringify({ image: 'x' }),
    }),
    api(`/api/styles/docs/${styleId}/pages/cover/recognize-stream?image=x&x0=0&y0=0&x1=1&y1=1`),
    api(`/api/styles/docs/${styleId}/pages/cover`, {
      method: 'PUT', body: JSON.stringify({ prompt: 'x', mockHtml: 'y' }),
    }),
  ];
  for (const r of await Promise.all(calls)) assert.equal(r.status, 401);
});

test('SSE 路由的 handler 真的跑起来：风格不存在时在开流之前就 404', async () => {
  const r = await api(
    '/api/styles/docs/not-a-style/pages/cover/recognize-stream?image=x&x0=0&y0=0&x1=1&y1=1',
    { headers: auth() },
  );
  // 路由整个不存在时 app 级 notFoundHandler 也回 404，所以必须看响应体：
  // 业务 404 说「风格不存在」，路由缺失说「接口不存在」。存在性校验排在 openSse 之前，
  // 所以这里拿到的是 JSON 而不是一条 SSE 流——它把 Blocker 2 的口径钉住了
  assert.equal(r.status, 404, JSON.stringify(r.body));
  assert.match(r.body.error!.message, /风格不存在/, JSON.stringify(r.body));
});

test('SSE 路由的坏图片引用在开流之前就 400，与 slides 那条同口径', async () => {
  // `http://…` 这种引用 `resolveImages` 解不了（只认 data: 与 /files/），直接抛 invalid
  const bad = encodeURIComponent('http://example.com/x.png');
  const r = await api(
    `/api/styles/docs/${styleId}/pages/cover/recognize-stream?image=${bad}&x0=0&y0=0&x1=1&y1=1`,
    { headers: auth() },
  );
  // 解析图片排在 openSse 之前，所以这里拿到的是 JSON 而不是一条 SSE 流。
  // 放进 try 里的话流已经开了，状态码只能是 200 + event: error——同一个失败给两种待遇
  assert.equal(r.status, 400, JSON.stringify(r.body));
  assert.match(r.body.error!.message, /不支持的图片引用/, JSON.stringify(r.body));
});

test('补齐流也被 router 级鉴权守卫拦下', async () => {
  // 与上面那条测的是同一道守卫：未登录时它先一步拦下，请求根本到不了 handler
  const r = await api(`/api/styles/docs/${styleId}/fill-missing/stream`);
  assert.equal(r.status, 401);
});

test('补齐流：风格不存在时在开流之前就 404，回的是 JSON 不是一条流', async () => {
  const r = await api('/api/styles/docs/not-a-style/fill-missing/stream', { headers: auth() });
  // 存在性校验排在 openSse 之前，所以这里拿到的是 JSON。若它排到流开之后，
  // 这条请求会变成 200 + event: error——路由缺失的 404 与业务 404 就分不开了。
  // `api()` 会对响应体做 JSON.parse：真收到一条流的话，这条用例直接报错
  assert.equal(r.status, 404, JSON.stringify(r.body));
  assert.match(r.body.error!.message, /风格不存在/, JSON.stringify(r.body));
});

test('补齐流：请求真的开成 text/event-stream，一类不缺时零模型调用', async () => {
  // 用一套**十一个页类型齐全**的风格：服务端对「一类不缺」的路径一个模型调用都不发，
  // 这条用例因此不会真去打模型（既不会花钱，也不会拖到超时）。
  // 用只有两类的夹具风格会走推导 + 出样机，那就成了一次真实计费调用
  const fullId = `styles-full-${Date.now().toString(36)}`;
  const saved = saveStyleDoc(StyleDoc.parse({
    styleId: fullId, version: '1.0', name: '齐全风格', description: '一句话说明',
    palette: {
      bg: '#ffffff', surface: '#f5f5f5', text: '#111111', muted: '#888888',
      accent: '#3366ff', brand: '#3366ff', border: '#e5e5e5',
    },
    pagePrompts: Object.fromEntries(PAGE_TYPE_ORDER.map((t) => [t, {
      pageType: t, prompt: OK_PROMPT, mockHtml: '<div>样机</div>', source: 'reference',
    }])),
  }));
  assert.equal(saved.ok, true);

  const res = await fetch(`${base}/api/styles/docs/${encodeURIComponent(fullId)}/fill-missing/stream`, {
    headers: auth(),
  });
  assert.equal(res.status, 200);
  assert.match(
    res.headers.get('content-type') ?? '', /text\/event-stream/,
    '这条路由要开成 SSE，而不是普通 JSON',
  );
  const text = await res.text();
  // 一类不缺 → 服务端只发一个 done，filled 为空。服务端那条「零模型调用」的保证，
  // 在这里被钉到 HTTP 这一层：真发了调用的话这条用例会慢到超时
  assert.match(text, /event: done/, text);
  assert.match(text, /"filled":\[\]/, text);
});

/* ---------------- 换字体角色 ---------------- */

/**
 * 带视觉规范的一套风格。
 *
 * `StyleSpec` 里只有 `title` / `header` / `footer` / `marginPx` / `radius` 是必填的，
 * 字级那三档（副标题/正文/数字）与字体角色都有缺省值，所以这里不用全写。
 */
let specStyleId = '';
test('准备一套带视觉规范的风格', async () => {
  specStyleId = `styles-spec-${Date.now().toString(36)}`;
  const saved = saveStyleDoc(StyleDoc.parse({
    styleId: specStyleId, version: '1.0', name: '带规范的风格', description: '',
    palette: {
      bg: '#ffffff', surface: '#f5f5f5', text: '#111111', muted: '#888888',
      accent: '#3366ff', brand: '#3366ff', border: '#e5e5e5',
    },
    pagePrompts: { cover: { pageType: 'cover', prompt: OK_PROMPT, mockHtml: '<div>样机</div>', source: 'reference' } },
    spec: {
      intro: '一句话视觉主张',
      title: {
        sizePx: 44, weight: 700, color: 'brand', align: 'left',
        rule: { position: 'above', widthPx: 72, heightPx: 6, color: 'accent' },
      },
      header: { kind: 'block', sizePx: 34, color: 'brand', heightPx: 88 },
      footer: { heightPx: 100, showPageNo: true },
      marginPx: 56,
      radius: { card: 14, inner: 8 },
    },
  }));
  assert.equal(saved.ok, true);
});

test('换字体：认不出的 id 回 400，而不是存进去之后渲染时静默落回原字体', async () => {
  const r = await api(`/api/styles/docs/${specStyleId}/fonts`, {
    method: 'PATCH', headers: auth(), body: JSON.stringify({ display: 'comic-sans' }),
  });
  assert.equal(r.status, 400, JSON.stringify(r.body));
  assert.match(r.body.error!.message, /认不出的字体/);
});

test('换字体：一个字段都不给的 PATCH 回 400，不当成成功的空操作', async () => {
  const r = await api(`/api/styles/docs/${specStyleId}/fonts`, {
    method: 'PATCH', headers: auth(), body: JSON.stringify({}),
  });
  assert.equal(r.status, 400, JSON.stringify(r.body));
});

test('换字体：字段名写错时也回 400（多给一个不认识的键）', async () => {
  const r = await api(`/api/styles/docs/${specStyleId}/fonts`, {
    method: 'PATCH', headers: auth(), body: JSON.stringify({ heading: 'montserrat' }),
  });
  assert.equal(r.status, 400, JSON.stringify(r.body));
});

test('换字体：只动指定的那一档，详情读回来就是新的', async () => {
  const r = await api(`/api/styles/docs/${specStyleId}/fonts`, {
    method: 'PATCH', headers: auth(), body: JSON.stringify({ body: 'montserrat' }),
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.fonts.body, 'montserrat');
  assert.equal(r.body.data.fonts.display, '', '别的角色不该被顺手改掉');

  const detail = await api(`/api/styles/docs/${specStyleId}`, { headers: auth() });
  assert.equal(detail.body.data.spec.fonts.body, 'montserrat');
  // 提示词与样机一个字都没动——字体走 CSS 变量，不需要重跑统一
  assert.equal(detail.body.data.pagePrompts.cover.prompt, OK_PROMPT);
});

test('换字体：还没提炼过规范时给一句人话，不是空指针', async () => {
  const r = await api(`/api/styles/docs/${styleId}/fonts`, {
    method: 'PATCH', headers: auth(), body: JSON.stringify({ body: 'montserrat' }),
  });
  assert.equal(r.status, 400, JSON.stringify(r.body));
  assert.match(r.body.error!.message, /提炼并统一/);
});

test('换字体：未登录被 router 级守卫拦下', async () => {
  const r = await api(`/api/styles/docs/${specStyleId}/fonts`, {
    method: 'PATCH', body: JSON.stringify({ body: 'montserrat' }),
  });
  assert.equal(r.status, 401);
});
