import test from 'node:test';
import assert from 'node:assert/strict';
import { PageIR, Provider, TaskRoute } from '@lumen/ir-schema';
import type { PageType } from '@lumen/ir-schema';
import { MockClient, targetImageSize } from './mock.js';
import { OpenAICompatibleClient } from './openai.js';
import { canChangeRoute, fallbackChain, isLocked, resolveRoute } from './router.js';
import { createGateway } from './gateway.js';
import { isThrottleError, isThrottleText } from './throttle.js';
import type { GatewayConfig, ProviderClient, TextRequest, UsageRecord } from './types.js';

/* ---------------- 测试夹具 ---------------- */

function makeProvider(overrides: Record<string, unknown> = {}) {
  return Provider.parse({
    providerId: 'p-mock',
    name: '内置 Mock',
    type: 'openai-compatible',
    baseUrl: '',
    ...overrides,
  });
}

function makeRoute(overrides: Record<string, unknown> = {}) {
  return TaskRoute.parse({
    routeId: 'rt-1',
    taskType: 'outline',
    primary: { providerId: 'p-mock', model: 'm-mock' },
    ...overrides,
  });
}

const ALL_PAGE_TYPES: PageType[] = ['cover', 'section', 'text', 'imageText', 'chart', 'metrics', 'end'];

/* ---------------- 1. Mock 文本过 PageIR schema ---------------- */

test('Mock 文本 page 形状可通过 PageIR.parse()', async () => {
  const client = new MockClient('p-mock');
  const cfg = makeProvider();

  for (const pageType of ALL_PAGE_TYPES) {
    const res = await client.text(
      {
        taskType: 'page_content',
        messages: [{ role: 'user', content: '生成这一页' }],
        json: true,
        mockShape: 'page',
        mockContext: { pageId: 'page-0007', pageType, title: '用数据校准每一次决策' },
      },
      'm-mock',
      cfg,
    );
    const parsed = PageIR.parse(JSON.parse(res.text));
    assert.equal(parsed.pageId, 'page-0007');
    assert.equal(parsed.pageType, pageType);
    assert.ok(parsed.layoutVariant.startsWith(`${pageType}/`), `版式名应带页类型前缀：${parsed.layoutVariant}`);
    assert.ok(parsed.title.main.length > 0);
    assert.ok(parsed.blocks.length >= 1, `页 ${pageType} 应至少有一个内容块`);
  }
});

test('Mock 大纲页数与首尾页类型符合约定', async () => {
  const client = new MockClient('p-mock');
  const res = await client.text(
    { taskType: 'outline', messages: [{ role: 'user', content: '写大纲' }], json: true, mockShape: 'outline', mockContext: { pageCount: 6 } },
    'm-mock',
    makeProvider(),
  );
  const outline = JSON.parse(res.text) as { title: string; pages: { index: number; pageType: string; claim: string }[] };
  assert.equal(outline.pages.length, 6);
  assert.equal(outline.pages[0]?.pageType, 'cover');
  assert.equal(outline.pages[5]?.pageType, 'end');
  assert.equal(outline.pages[0]?.index, 0);
});

test('Mock 讲稿与 Remotion 配置结构合法', async () => {
  const client = new MockClient('p-mock');
  const cfg = makeProvider();

  const scriptRes = await client.text(
    { taskType: 'script', messages: [{ role: 'user', content: '写讲稿' }], json: true, mockShape: 'script' },
    'm-mock',
    cfg,
  );
  const script = JSON.parse(scriptRes.text) as { text: string; segments: { t: number; text: string; cursor: boolean }[] };
  assert.ok(script.segments.length >= 3 && script.segments.length <= 5);
  for (let i = 1; i < script.segments.length; i++) {
    assert.ok(script.segments[i]!.t > script.segments[i - 1]!.t, '讲稿分段起始时间必须递增');
  }

  const remotionRes = await client.text(
    { taskType: 'remotion_config', messages: [{ role: 'user', content: '写配置' }], json: true, mockShape: 'remotion' },
    'm-mock',
    cfg,
  );
  const remotion = JSON.parse(remotionRes.text) as { fps: number; width: number; height: number; scenes: unknown[] };
  assert.equal(remotion.fps, 30);
  assert.equal(remotion.width, 1920);
  assert.equal(remotion.height, 1080);
  assert.equal(remotion.scenes.length, 3);
});

test('Mock HTML 只用 CSS 变量、不含硬编码色值', async () => {
  const client = new MockClient('p-mock');
  const res = await client.text(
    { taskType: 'html_codegen', messages: [{ role: 'user', content: '写 HTML' }], mockShape: 'html' },
    'm-mock',
    makeProvider(),
  );
  assert.ok(res.text.includes('var(--brand-500)'));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b/.test(res.text), 'HTML 里不应出现十六进制色值');
  assert.ok(!/rgba?\(/i.test(res.text), 'HTML 里不应出现 rgb/rgba 硬编码色值');
});

/* ---------------- 2. Mock 确定性 ---------------- */

test('Mock 文本完全确定性：同输入两次结果完全相同', async () => {
  const client = new MockClient('p-mock');
  const cfg = makeProvider();
  const req: TextRequest = {
    taskType: 'page_content',
    system: '你是资深商务顾问',
    messages: [{ role: 'user', content: '生成第 3 页' }],
    json: true,
    mockShape: 'page',
    mockContext: { pageId: 'page-0003', pageType: 'text' },
  };
  const a = await client.text(req, 'm-mock', cfg);
  const b = await client.text(req, 'm-mock', cfg);
  assert.deepEqual(a, b);
});

/* ---------------- 3. Mock 图片是合法 PNG ---------------- */

test('Mock 图片是合法 PNG：签名、尺寸、IEND、确定性与差异', async () => {
  const client = new MockClient('p-mock');
  const cfg = makeProvider();
  const req = { taskType: 'image' as const, prompt: '极简商务几何构成，柔和色块', size: '1536x1024', quality: 'high', n: 2 };

  const res = await client.image(req, 'm-mock', cfg);
  assert.equal(res.images.length, 2);
  const buf = res.images[0]!.buffer;

  // PNG 头 8 字节
  assert.deepEqual(
    [...buf.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  );

  // IHDR
  assert.equal(buf.subarray(12, 16).toString('latin1'), 'IHDR');
  const expected = targetImageSize('1536x1024');
  assert.equal(buf.readUInt32BE(16), expected.width);
  assert.equal(buf.readUInt32BE(20), expected.height);
  // 最长边被压到 256，等比缩放后高度为 171
  assert.equal(expected.width, 256);
  assert.equal(expected.height, 171);

  // IEND 结尾
  assert.equal(buf.subarray(buf.length - 8, buf.length - 4).toString('latin1'), 'IEND');

  // 确定性
  const again = await client.image(req, 'm-mock', cfg);
  assert.deepEqual(again.images[0]!.buffer, buf);

  // 不同 prompt 出不同字节
  const other = await client.image({ ...req, prompt: '另一张极简商务配图' }, 'm-mock', cfg);
  assert.notDeepEqual(other.images[0]!.buffer, buf);
});

/* ---------------- 4. 路由解析 ---------------- */

test('未配置路由时 resolveRoute 抛 ROUTE_NOT_CONFIGURED', () => {
  assert.throws(
    () => resolveRoute({ getRoute: () => undefined }, 'image'),
    /ROUTE_NOT_CONFIGURED/,
  );
  const route = makeRoute();
  assert.equal(resolveRoute({ getRoute: () => route }, 'outline'), route);
});

/* ---------------- 5. 路由切换权限 ---------------- */

test('canChangeRoute：locked 路由仅 admin 可改，非 locked 路由 user 可改', () => {
  const locked = makeRoute({ locked: true });
  const open = makeRoute({ locked: false });

  assert.equal(isLocked(locked), true);
  assert.equal(isLocked(open), false);

  assert.equal(canChangeRoute(locked, 'user'), false);
  assert.equal(canChangeRoute(locked, 'admin'), true);
  assert.equal(canChangeRoute(locked, 'guest'), false);

  assert.equal(canChangeRoute(open, 'user'), true);
  assert.equal(canChangeRoute(open, 'admin'), true);
});

test('fallbackChain 把 primary 放在最前', () => {
  const route = makeRoute({
    primary: { providerId: 'p-a', model: 'm-a' },
    fallbacks: [
      { providerId: 'p-b', model: 'm-b' },
      { providerId: 'p-c', model: 'm-c' },
    ],
  });
  assert.deepEqual(fallbackChain(route), [
    { providerId: 'p-a', model: 'm-a' },
    { providerId: 'p-b', model: 'm-b' },
    { providerId: 'p-c', model: 'm-c' },
  ]);
});

/* ---------------- 6. 降级链 ---------------- */

function textResult(providerId: string, model: string, text: string) {
  return {
    text,
    providerId,
    model,
    usage: { inputTokens: 3, outputTokens: 5 },
    degraded: false,
    degradeReason: '',
    latencyMs: 1,
  };
}

function speechResult(providerId: string, model: string) {
  return {
    audio: { buffer: Buffer.from('fake-mp3'), mime: 'audio/mpeg' },
    transcript: '念出来的内容',
    providerId,
    model,
    usage: { inputTokens: 3, outputTokens: 5 },
    degraded: false,
    degradeReason: '',
    latencyMs: 1,
  };
}

test('首选失败时切到次选并标记 degraded，用量两条都记', async () => {
  const failing: ProviderClient = {
    providerId: 'p-bad',
    isMock: false,
    async text() {
      throw new Error('连接超时');
    },
    async image() {
      throw new Error('连接超时');
    },
    async speech() {
      throw new Error('连接超时');
    },
  };
  const okClient: ProviderClient = {
    providerId: 'p-ok',
    isMock: true,
    async text(_req, model) {
      return textResult('p-ok', model, '备用模型输出');
    },
    async image(_req, model) {
      return { images: [], providerId: 'p-ok', model, degraded: false, degradeReason: '', latencyMs: 1 };
    },
    async speech(_req, model) {
      return speechResult('p-ok', model);
    },
  };

  const records: UsageRecord[] = [];
  const cfg: GatewayConfig = {
    getProvider: (id) => {
      if (id === 'p-bad') return makeProvider({ providerId: 'p-bad', name: '坏网关' });
      if (id === 'p-ok') return makeProvider({ providerId: 'p-ok', name: '备用网关', isMock: true });
      return undefined;
    },
    getRoute: () =>
      makeRoute({
        primary: { providerId: 'p-bad', model: 'm-bad' },
        fallbacks: [{ providerId: 'p-ok', model: 'm-ok' }],
      }),
    usage: { record: (e) => records.push(e) },
    clients: { 'p-bad': failing, 'p-ok': okClient },
  };

  const res = await createGateway(cfg).text({ taskType: 'outline', messages: [{ role: 'user', content: '写大纲' }] });
  assert.equal(res.text, '备用模型输出');
  assert.equal(res.providerId, 'p-ok');
  assert.equal(res.degraded, true);
  assert.match(res.degradeReason, /p-bad/);
  assert.match(res.degradeReason, /连接超时/);

  assert.equal(records.length, 2);
  assert.equal(records[0]!.ok, false);
  assert.equal(records[0]!.providerId, 'p-bad');
  assert.equal(records[1]!.ok, true);
  assert.equal(records[1]!.providerId, 'p-ok');
  assert.equal(records[1]!.kind, 'text');
});

test('首选成功时不标记降级，用量只记一条', async () => {
  const records: UsageRecord[] = [];
  const cfg: GatewayConfig = {
    getProvider: () => makeProvider({ providerId: 'p-mock', isMock: true }),
    getRoute: () => makeRoute(),
    usage: { record: (e) => records.push(e) },
  };
  const res = await createGateway(cfg).text({
    taskType: 'outline',
    messages: [{ role: 'user', content: '写大纲' }],
    json: true,
    mockShape: 'outline',
    mockContext: { pageCount: 4 },
  });
  assert.equal(res.degraded, false);
  assert.equal(res.degradeReason, '');
  assert.equal(records.length, 1);
  assert.equal(records[0]!.ok, true);
  const outline = JSON.parse(res.text) as { pages: unknown[] };
  assert.equal(outline.pages.length, 4);
});

test('链上 Provider 配置缺失时跳到下一个', async () => {
  const records: UsageRecord[] = [];
  const cfg: GatewayConfig = {
    getProvider: (id) => (id === 'p-ok' ? makeProvider({ providerId: 'p-ok', isMock: true }) : undefined),
    getRoute: () =>
      makeRoute({
        primary: { providerId: 'p-missing', model: 'm-x' },
        fallbacks: [{ providerId: 'p-ok', model: 'm-ok' }],
      }),
    usage: { record: (e) => records.push(e) },
  };
  const res = await createGateway(cfg).text({
    taskType: 'outline',
    messages: [{ role: 'user', content: '写大纲' }],
    mockShape: 'plain',
  });
  assert.equal(res.degraded, true);
  assert.match(res.degradeReason, /p-missing/);
  assert.equal(records.length, 2);
  assert.equal(records[0]!.ok, false);
  assert.match(records[0]!.degradeReason, /未找到 Provider 配置/);
});

/* ---------------- 7. 全部失败 ---------------- */

test('全部 Provider 失败时抛 ALL_PROVIDERS_FAILED 且带每条原因', async () => {
  const alwaysFail = (providerId: string): ProviderClient => ({
    providerId,
    isMock: false,
    async text() {
      throw new Error(`${providerId} 不可用`);
    },
    async image() {
      throw new Error(`${providerId} 不可用`);
    },
    async speech() {
      throw new Error(`${providerId} 不可用`);
    },
  });
  const cfg: GatewayConfig = {
    getProvider: (id) => makeProvider({ providerId: id }),
    getRoute: () =>
      makeRoute({
        primary: { providerId: 'p-a', model: 'm-a' },
        fallbacks: [{ providerId: 'p-b', model: 'm-b' }],
      }),
    clients: { 'p-a': alwaysFail('p-a'), 'p-b': alwaysFail('p-b') },
  };

  await assert.rejects(
    () => createGateway(cfg).text({ taskType: 'outline', messages: [{ role: 'user', content: '写大纲' }] }),
    (e: Error) => {
      assert.match(e.message, /ALL_PROVIDERS_FAILED/);
      assert.match(e.message, /p-a/);
      assert.match(e.message, /p-b/);
      return true;
    },
  );
});

test('图片任务按 n 记用量', async () => {
  const records: UsageRecord[] = [];
  const cfg: GatewayConfig = {
    getProvider: () => makeProvider({ providerId: 'p-mock', isMock: true }),
    getRoute: () => makeRoute({ taskType: 'image' }),
    usage: { record: (e) => records.push(e) },
  };
  const res = await createGateway(cfg).image({
    taskType: 'image',
    prompt: '极简商务配图',
    size: '1024x1024',
    quality: 'high',
    n: 3,
  });
  assert.equal(res.images.length, 3);
  assert.equal(records.length, 1);
  assert.equal(records[0]!.amount, 3);
  assert.equal(records[0]!.kind, 'image');
});

/* ---------------- 7b. 费用与币种 ---------------- */

test('文本费用按 token 单价计算，币种取自 Provider 配置', async () => {
  const records: UsageRecord[] = [];
  const cfg: GatewayConfig = {
    getProvider: () => makeProvider({
      providerId: 'p-cny',
      isMock: true,
      pricing: { currency: 'CNY', inputPerMTokens: 2, outputPerMTokens: 8, perImage: 0 },
    }),
    getRoute: () => makeRoute(),
    usage: { record: (e) => records.push(e) },
  };
  await createGateway(cfg).text({
    taskType: 'outline',
    messages: [{ role: 'user', content: '写大纲' }],
    mockShape: 'outline',
    mockContext: { pageCount: 4 },
  });

  assert.equal(records.length, 1);
  const r = records[0]!;
  assert.equal(r.currency, 'CNY');
  // Mock 固定回 3 入 / 5 出，正好用来验证算式而不是验证模型
  const expected = (r.inputTokens / 1_000_000) * 2 + (r.outputTokens / 1_000_000) * 8;
  assert.equal(r.cost, Math.round(expected * 1e6) / 1e6);
});

test('图片费用按张数与美元单价计算，不会混进人民币口径', async () => {
  const records: UsageRecord[] = [];
  const cfg: GatewayConfig = {
    getProvider: () => makeProvider({
      providerId: 'p-usd',
      isMock: true,
      pricing: { currency: 'USD', inputPerMTokens: 0, outputPerMTokens: 0, perImage: 0.02 },
    }),
    getRoute: () => makeRoute({ taskType: 'image' }),
    usage: { record: (e) => records.push(e) },
  };
  await createGateway(cfg).image({ taskType: 'image', prompt: '极简配图', size: '1024x1024', quality: 'high', n: 3 });

  assert.equal(records.length, 1);
  assert.equal(records[0]!.currency, 'USD');
  assert.equal(records[0]!.cost, 0.06);
});

test('未配置单价时费用为 0，币种仍按默认人民币记录', async () => {
  const records: UsageRecord[] = [];
  const cfg: GatewayConfig = {
    getProvider: () => makeProvider({ providerId: 'p-nopricing', isMock: true }),
    getRoute: () => makeRoute(),
    usage: { record: (e) => records.push(e) },
  };
  await createGateway(cfg).text({
    taskType: 'outline',
    messages: [{ role: 'user', content: '写大纲' }],
    mockShape: 'plain',
  });
  assert.equal(records[0]!.cost, 0);
  assert.equal(records[0]!.currency, 'CNY');
});

test('失败记录的费用为 0，但币种跟着 Provider 走', async () => {
  const records: UsageRecord[] = [];
  const failing = (providerId: string): ProviderClient => ({
    providerId,
    isMock: false,
    async text() { throw new Error('上游 500'); },
    async image() { throw new Error('上游 500'); },
    async speech() { throw new Error('上游 500'); },
  });
  const cfg: GatewayConfig = {
    getProvider: () => makeProvider({
      providerId: 'p-usd',
      pricing: { currency: 'USD', inputPerMTokens: 0, outputPerMTokens: 0, perImage: 0.02 },
    }),
    getRoute: () => makeRoute({ taskType: 'image' }),
    usage: { record: (e) => records.push(e) },
    clients: { 'p-usd': failing('p-usd') },
  };
  await assert.rejects(() => createGateway(cfg).image({
    taskType: 'image', prompt: '配图', size: '1024x1024', quality: 'high', n: 1,
  }));
  assert.equal(records.length, 1);
  assert.equal(records[0]!.ok, false);
  assert.equal(records[0]!.cost, 0);
  assert.equal(records[0]!.currency, 'USD');
});

/* ---------------- 8. OpenAI 兼容客户端 ---------------- */

test('OpenAICompatibleClient 文本请求的 URL、鉴权头与 body 结构', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(
      JSON.stringify({ choices: [{ message: { content: '{"title":"季度复盘"}' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  }) as typeof fetch;

  const client = new OpenAICompatibleClient({ providerId: 'p-openai', apiKey: 'sk-test-secret', fetchImpl });
  const provider = makeProvider({
    providerId: 'p-openai',
    baseUrl: 'https://api.example.com/',
    pathPrefix: '/v1',
    maxRetries: 0,
  });

  const res = await client.text(
    {
      taskType: 'outline',
      system: '你是资深商务顾问',
      messages: [{ role: 'user', content: '写一份季度复盘大纲' }],
      json: true,
      maxTokens: 512,
      temperature: 0.3,
    },
    'deepseek-v4',
    provider,
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://api.example.com/v1/chat/completions');

  const headers = calls[0]!.init.headers as Record<string, string>;
  assert.equal(headers['Authorization'], 'Bearer sk-test-secret');
  assert.equal(headers['Content-Type'], 'application/json');

  const body = JSON.parse(String(calls[0]!.init.body)) as {
    model: string;
    messages: { role: string; content: string }[];
    response_format: { type: string };
    max_tokens: number;
    temperature: number;
  };
  assert.equal(body.model, 'deepseek-v4');
  assert.equal(body.messages[0]!.role, 'system');
  assert.equal(body.messages[1]!.content, '写一份季度复盘大纲');
  assert.equal(body.response_format.type, 'json_object');
  assert.equal(body.max_tokens, 512);
  assert.equal(body.temperature, 0.3);

  assert.equal(res.text, '{"title":"季度复盘"}');
  assert.equal(res.usage.inputTokens, 10);
  assert.equal(res.usage.outputTokens, 5);
});

test('OpenAICompatibleClient 失败时抛 PROVIDER_ERROR 且不含密钥，并按 maxRetries 重试', async () => {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    calls.push(String(url));
    // 故意在响应体里回显密钥，验证错误信息会做清洗
    return new Response('internal error, key=sk-test-secret', { status: 500 });
  }) as typeof fetch;

  const client = new OpenAICompatibleClient({ providerId: 'p-openai', apiKey: 'sk-test-secret', fetchImpl });
  const provider = makeProvider({ providerId: 'p-openai', baseUrl: 'https://api.example.com', maxRetries: 2 });

  await assert.rejects(
    () => client.text({ taskType: 'outline', messages: [{ role: 'user', content: '写大纲' }] }, 'm', provider),
    (e: Error) => {
      assert.match(e.message, /PROVIDER_ERROR/);
      assert.match(e.message, /500/);
      assert.ok(!e.message.includes('sk-test-secret'), '错误信息里绝不能出现明文密钥');
      return true;
    },
  );
  assert.equal(calls.length, 3, 'maxRetries=2 时应共发起 3 次请求');
});

/**
 * `deadline` 这一组钉的是「一页最坏能跑多久」。
 *
 * 没有它的时候，一个请求的耗时是三层重试乘出来的：供应商 `maxRetries+1` 次
 * × 每次 `timeoutMs`，外面还有降级链与页级两层。按实测配置单次调用就能到 15 分钟，
 * 用户看到的就是「一直在加载中」。
 */
test('deadline 已经过去时一次请求都不发起', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response('{}', { status: 200 });
  }) as typeof fetch;

  const client = new OpenAICompatibleClient({ providerId: 'p-openai', apiKey: 'k', fetchImpl });
  const provider = makeProvider({ providerId: 'p-openai', baseUrl: 'https://api.example.com', maxRetries: 2 });

  await assert.rejects(
    () => client.text(
      { taskType: 'outline', messages: [{ role: 'user', content: 'x' }], deadline: Date.now() - 1 },
      'm',
      provider,
    ),
    (e: Error) => {
      assert.match(e.message, /时间预算/);
      return true;
    },
  );
  assert.equal(calls, 0, '预算早就用完了，不该还往外发请求');
});

test('首次尝试把预算耗光后不再按 maxRetries 重试', async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    await new Promise((r) => setTimeout(r, 60));
    throw new Error('socket hang up');
  }) as typeof fetch;

  const client = new OpenAICompatibleClient({ providerId: 'p-openai', apiKey: 'k', fetchImpl });
  const provider = makeProvider({ providerId: 'p-openai', baseUrl: 'https://api.example.com', maxRetries: 5 });

  await assert.rejects(
    () => client.text(
      { taskType: 'outline', messages: [{ role: 'user', content: 'x' }], deadline: Date.now() + 100 },
      'm',
      provider,
    ),
    (e: Error) => {
      assert.match(e.message, /时间预算/);
      return true;
    },
  );
  assert.equal(calls, 1, '预算已经没了，不该再重试');
});

test('降级链上第一个 Provider 用光预算后，不再换一家接着等', async () => {
  let secondCalls = 0;
  const slow: ProviderClient = {
    providerId: 'p-slow',
    isMock: false,
    async text() {
      await new Promise((r) => setTimeout(r, 150));
      throw new Error('连接超时');
    },
    async image() {
      throw new Error('连接超时');
    },
    async speech() {
      throw new Error('连接超时');
    },
  };
  const second: ProviderClient = {
    providerId: 'p-ok',
    isMock: true,
    async text(_req, model) {
      secondCalls += 1;
      return textResult('p-ok', model, '不该被调到');
    },
    async image(_req, model) {
      return { images: [], providerId: 'p-ok', model, degraded: false, degradeReason: '', latencyMs: 1 };
    },
    async speech(_req, model) {
      return speechResult('p-ok', model);
    },
  };

  const cfg: GatewayConfig = {
    getProvider: (id) => {
      if (id === 'p-slow') return makeProvider({ providerId: 'p-slow', name: '慢网关' });
      if (id === 'p-ok') return makeProvider({ providerId: 'p-ok', name: '备用网关', isMock: true });
      return undefined;
    },
    getRoute: () =>
      makeRoute({
        primary: { providerId: 'p-slow', model: 'm-slow' },
        fallbacks: [{ providerId: 'p-ok', model: 'm-ok' }],
      }),
    usage: { record: () => undefined },
    clients: { 'p-slow': slow, 'p-ok': second },
  };

  await assert.rejects(
    () => createGateway(cfg).text({
      taskType: 'outline',
      messages: [{ role: 'user', content: '写大纲' }],
      deadline: Date.now() + 100,
    }),
    (e: Error) => {
      assert.match(e.message, /ALL_PROVIDERS_FAILED/);
      assert.match(e.message, /时间预算/);
      return true;
    },
  );
  assert.equal(secondCalls, 0, '预算已经用完，换一家只是再空等一轮');
});

/* ---------------- 9. 图片两种响应形态 ---------------- */

test('OpenAICompatibleClient 图片 b64_json 分支解码为 Buffer', async () => {
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const urls: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ data: [{ b64_json: pngBytes.toString('base64') }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;

  const client = new OpenAICompatibleClient({ providerId: 'p-openai', apiKey: 'k', fetchImpl });
  const provider = makeProvider({ providerId: 'p-openai', baseUrl: 'https://api.example.com', maxRetries: 0 });

  const res = await client.image(
    { taskType: 'image', prompt: '极简商务配图', size: '1536x1024', quality: 'high', n: 1 },
    'gpt-image-2',
    provider,
  );
  assert.equal(urls[0], 'https://api.example.com/v1/images/generations');
  assert.equal(res.images.length, 1);
  assert.deepEqual(res.images[0]!.buffer, pngBytes);
  assert.equal(res.images[0]!.mime, 'image/png');
});

test('OpenAICompatibleClient 图片 url 分支会二次下载并转 Buffer', async () => {
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 9, 8, 7]);
  const seen: string[] = [];
  const fetchImpl = (async (url: string | URL | Request) => {
    const u = String(url);
    seen.push(u);
    if (u.includes('/images/generations')) {
      return new Response(JSON.stringify({ data: [{ url: 'https://img.example.com/a.png' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(pngBytes, { status: 200, headers: { 'content-type': 'image/png' } });
  }) as typeof fetch;

  const client = new OpenAICompatibleClient({ providerId: 'p-openai', apiKey: 'k', fetchImpl });
  const provider = makeProvider({ providerId: 'p-openai', baseUrl: 'https://api.example.com', maxRetries: 0 });

  const res = await client.image(
    { taskType: 'image', prompt: '极简商务配图', size: '1024x1024', quality: 'high', n: 1 },
    'gpt-image-2',
    provider,
  );
  assert.deepEqual(seen, ['https://api.example.com/v1/images/generations', 'https://img.example.com/a.png']);
  assert.deepEqual(res.images[0]!.buffer, pngBytes);
  assert.equal(res.images[0]!.mime, 'image/png');
});

/* ---------------- 10. 透明底按请求给 ---------------- */

/**
 * 1×1 的 RGBA PNG（ct=6）。**不能用不带 alpha 的图当假响应**：下一个任务会给网关加上
 * 「要了透明底必须真有 alpha」的检查，那时这些用例都得过那一关。
 */
/**
 * 1×1 的 ct=6（RGBA）PNG。假 fetch 用它当响应体——要一张真 PNG，解码那步才走得通。
 */
const PNG_RGBA_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** 把发出去的请求体记下来的假 fetch */
function capturingFetch(sink: Record<string, unknown>[]) {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    sink.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
    return new Response(JSON.stringify({ data: [{ b64_json: PNG_RGBA_1PX.toString('base64') }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

/** 一个真连出去（isMock: false）、但 fetch 被换掉的网关配置 */
function imageCfg(sink: Record<string, unknown>[], provider: Record<string, unknown> = {}): GatewayConfig {
  return {
    getProvider: () => makeProvider({
      providerId: 'p-img', isMock: false, baseUrl: 'https://example.test', ...provider,
    }),
    getRoute: () => makeRoute({ taskType: 'image', primary: { providerId: 'p-img', model: 'm-img' } }),
    decryptKey: () => 'k',
    fetchImpl: capturingFetch(sink),
  };
}

const ASK_IMAGE = {
  taskType: 'image' as const, prompt: 'p', size: '1024x1024', quality: 'high', n: 1,
};

test('供应商级的 imageExtraParams 展开进请求体，且压得过按请求的参数', async () => {
  // 管理员显式写死的配置应该赢——否则他在后台改了却不见效，只能靠猜
  const sink: Record<string, unknown>[] = [];
  await createGateway(imageCfg(sink, { imageExtraParams: { quality: 'low', seed: 7 } }))
    .image(ASK_IMAGE);
  assert.equal(sink[0]?.['quality'], 'low', '管理员写死的应该赢过请求里的 quality');
  assert.equal(sink[0]?.['seed'], 7);
});

test('ratio 方言的供应商走 size / resolution，不带 quality', async () => {
  const sink: Record<string, unknown>[] = [];
  await createGateway(imageCfg(sink, { imageSizeFormat: 'ratio', imageResolution: '2K' }))
    .image({ ...ASK_IMAGE, ratio: '1:1' });
  assert.equal(sink[0]?.['size'], '1:1');
  assert.equal(sink[0]?.['resolution'], '2K');
  assert.equal(sink[0]?.['quality'], undefined, 'ratio 方言的 quality 被服务端固定为 high，传了只会误导');
});

/* ---------------- 9. 语音合成 ---------------- */

/** 造一个只关心语音的 fetch 桩，把请求记下来 */
function audioFetch(payload: unknown, calls: { url: string; init: RequestInit }[], status = 200) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }) as typeof fetch;
}

test('语音请求带 modalities 与 audio 参数，语气走 system，base64 解成 Buffer', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const mp3 = Buffer.from('假装这是一段 mp3');
  const fetchImpl = audioFetch(
    {
      choices: [{
        message: { audio: { data: mp3.toString('base64'), format: 'mp3', transcript: '存量竞争加剧。' } },
      }],
      usage: { prompt_tokens: 20, completion_tokens: 30 },
    },
    calls,
  );

  const client = new OpenAICompatibleClient({ providerId: 'p-audio', apiKey: 'sk-test-secret', fetchImpl });
  const provider = makeProvider({
    providerId: 'p-audio',
    baseUrl: 'https://api.example.com/',
    pathPrefix: '/v1',
    maxRetries: 0,
  });

  const res = await client.speech(
    { taskType: 'tts', text: '存量竞争加剧。', voice: 'alloy', tone: '沉稳专业，像给客户做正式汇报' },
    'gpt-audio-1.5-official',
    provider,
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, 'https://api.example.com/v1/chat/completions');
  const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
  assert.equal(body['model'], 'gpt-audio-1.5-official');
  assert.deepEqual(body['modalities'], ['text', 'audio']);
  assert.deepEqual(body['audio'], { voice: 'alloy', format: 'mp3' });
  const messages = body['messages'] as { role: string; content: string }[];
  assert.equal(messages.length, 2);
  assert.equal(messages[0]!.role, 'system');
  /**
   * **这条指令不能省。** `gpt-audio` 走的是 /chat/completions，是对话模型：
   * 只丢一段文本进去，它会当成对话输入生成一段**回应**而不是朗读
   * （实测 1034 字的讲稿只合成出 233 字的回话，还反问「你觉得这样的导读节奏可以吗？」）。
   */
  assert.match(
    messages[0]!.content,
    /逐字朗读/,
    `system 必须要求逐字朗读，否则合成出来的是回应不是朗读：${messages[0]!.content}`,
  );
  assert.match(messages[0]!.content, /沉稳专业/, '语气要并进同一条 system');
  assert.deepEqual(messages[1], { role: 'user', content: '存量竞争加剧。' });

  assert.equal(res.audio.mime, 'audio/mpeg');
  assert.deepEqual(res.audio.buffer, mp3);
  assert.equal(res.transcript, '存量竞争加剧。');
  assert.deepEqual(res.usage, { inputTokens: 20, outputTokens: 30 });
  assert.equal(res.degraded, false);
});

test('没有语气时 system 里仍要有「逐字朗读」指令', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = audioFetch(
    { choices: [{ message: { audio: { data: Buffer.from('x').toString('base64'), format: 'wav' } } }] },
    calls,
  );
  const client = new OpenAICompatibleClient({ providerId: 'p-audio', apiKey: '', fetchImpl });
  const res = await client.speech(
    { taskType: 'tts', text: '念这句', voice: 'alloy', tone: '   ' },
    'gpt-audio-1.5-official',
    makeProvider({ providerId: 'p-audio', maxRetries: 0 }),
  );

  const body = JSON.parse(String(calls[0]!.init.body)) as Record<string, unknown>;
  const messages = body['messages'] as { role: string; content: string }[];
  assert.equal(messages.length, 2, '语气空白也不能省掉 system——朗读指令就在里面');
  assert.match(messages[0]!.content, /逐字朗读/);
  assert.ok(!messages[0]!.content.includes('\n'), '没有语气时不该多出一行空的');
  assert.deepEqual(messages[1], { role: 'user', content: '念这句' });
  assert.equal(res.audio.mime, 'audio/wav', 'mime 跟着模型回的 format 走');
});

test('语音模型没回音频时抛 PROVIDER_ERROR，且错误信息里不含密钥', async () => {
  const fetchImpl = audioFetch({ choices: [{ message: { content: '' } }] }, []);
  const client = new OpenAICompatibleClient({ providerId: 'p-audio', apiKey: 'sk-test-secret', fetchImpl });

  await assert.rejects(
    () => client.speech(
      { taskType: 'tts', text: 'x', voice: 'alloy' },
      'gpt-audio-1.5-official',
      makeProvider({ providerId: 'p-audio', maxRetries: 0 }),
    ),
    (e: Error) => {
      assert.ok(e.message.includes('PROVIDER_ERROR'), `实际：${e.message}`);
      assert.ok(!e.message.includes('sk-test-secret'), '错误信息里绝不能出现明文密钥');
      return true;
    },
  );
});

test('语音任务走降级链：首选失败切次选，两条用量都记，kind 记 text', async () => {
  const records: UsageRecord[] = [];
  const bad: ProviderClient = {
    providerId: 'p-bad',
    isMock: false,
    async text() { throw new Error('不该被调到'); },
    async image() { throw new Error('不该被调到'); },
    async speech() { throw new Error('语音服务不可用'); },
  };
  const good: ProviderClient = {
    providerId: 'p-ok',
    isMock: true,
    async text() { throw new Error('不该被调到'); },
    async image() { throw new Error('不该被调到'); },
    async speech(_req, model) { return speechResult('p-ok', model); },
  };

  const gateway = createGateway({
    getProvider: (id) => makeProvider({ providerId: id }),
    getRoute: () => makeRoute({
      taskType: 'tts',
      primary: { providerId: 'p-bad', model: 'm-bad' },
      fallbacks: [{ providerId: 'p-ok', model: 'm-ok' }],
    }),
    clients: { 'p-bad': bad, 'p-ok': good },
    usage: { record: (e) => records.push(e) },
  });

  const res = await gateway.speech({ taskType: 'tts', text: '念这句', voice: 'alloy' });

  assert.equal(res.degraded, true);
  assert.ok(res.degradeReason.includes('p-bad'), `降级说明该写明主模型：${res.degradeReason}`);
  assert.equal(res.audio.mime, 'audio/mpeg');

  assert.equal(records.length, 2, '失败与成功各记一条');
  assert.equal(records[0]!.ok, false);
  assert.equal(records[1]!.ok, true);
  assert.equal(records[1]!.taskType, 'tts');
  /**
   * 语音按 token 计费、一次调用算一笔，与文本同构，所以记 kind='text'。
   * 这条断言是**故意**锁住这个决定：改成 'audio' 会让用量页与聚合 SQL 全线要改。
   */
  assert.equal(records[1]!.kind, 'text');
  assert.equal(records[1]!.inputTokens, 3);
});




/* ---------------- 限流识别 ---------------- */

/**
 * 「上游扛不住了」这个判据要准。
 *
 * 页面生成的并发上限靠它决定降不降档：把网络抖动当成限流，并发会一路降到地板；
 * 把限流当成普通失败，就是一连串 429 加白跑的重试。
 *
 * 认的是**网关实际抛出来的报文**——状态码原样留在消息里，走完降级链之后
 * 是 `ALL_PROVIDERS_FAILED：…；<provider>/<model>：PROVIDER_ERROR 429 …`，
 * 所以字符串匹配是可靠的，不用改错误类型。
 */
test('认得出 429 与 503——网关的真实报文格式', () => {
  assert.equal(
    isThrottleError(new Error('PROVIDER_ERROR 429 https://api.example.com/v1/chat/completions：rate limit exceeded')),
    true,
  );
  assert.equal(isThrottleError(new Error('PROVIDER_ERROR 503 https://api.example.com：service unavailable')), true);

  // 走完降级链之后被包了一层，状态码还在里面
  assert.equal(
    isThrottleError(new Error('ALL_PROVIDERS_FAILED：任务 html_codegen 的全部 Provider 均失败；'
      + 'p1/m1：PROVIDER_ERROR 429 https://a.example.com；p2/m2：PROVIDER_ERROR 429 https://b.example.com')),
    true,
  );

  // 有些兼容端只写中文
  assert.equal(isThrottleText('网关 503：限流'), true);
});

test('普通失败不当成限流——降错档会把并发一路压到地板', () => {
  assert.equal(isThrottleError(new Error('PROVIDER_ERROR 401 https://api.example.com：invalid api key')), false);
  assert.equal(isThrottleError(new Error('PROVIDER_ERROR 400 https://api.example.com：bad request')), false);
  assert.equal(isThrottleError(new Error('PROVIDER_ERROR The operation was aborted due to timeout')), false);
  assert.equal(isThrottleError(new Error('模型没写出提示词')), false);
  // 数字出现在别处不算：这里是个普通的 token 数
  assert.equal(isThrottleText('用掉 429 个 token'), false);
});
