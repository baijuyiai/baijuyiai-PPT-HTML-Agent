import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 环境必须在导入任何模块之前设定
const tmp = mkdtempSync(join(tmpdir(), 'lumen-narration-'));
process.env.NODE_ENV = 'test';
process.env.LUMEN_DB_PATH = join(tmp, 'test.db');
process.env.LUMEN_SECRET_KEY = 'test-secret-key-0123456789abcdefghijklmnop';

const { migrate } = await import('../db/migrate.js');
const { closeDb } = await import('../db/client.js');
const { ensureSeed } = await import('./seed.service.js');
const { createUser } = await import('./user.service.js');
const { createProject, getPage, pageIR, savePageGroup, savePage, updateProject } = await import('./project.service.js');
const { listRoutes, requireRoute, updateRoute, createProvider } = await import('./provider.service.js');
const { SETTING_KEYS, setSetting } = await import('./settings.service.js');
const { apiQueue } = await import('./task.service.js');
const {
  ensureNarration, extensionForMime, narrationHash, readNarration, synthesizeNarration,
} = await import('./narration.service.js');
const { enqueuePageNarration, enqueueProjectNarration } = await import('./narration-dispatch.service.js');
const { PageIR } = await import('@lumen/ir-schema');

migrate();
ensureSeed();

test.after(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * 讲解音频的缓存与失效。
 *
 * 全程用假网关与内存 storage：要验的是「什么情况下算缓存失效、什么时候不该重复花钱」，
 * 不是语音模型本身。真调模型既慢又花钱，还没法在没有 Key 的机器上跑。
 */

const NARRATION = '存量竞争加剧，增长逻辑正在重构。市场增速从 210% 降到 18%。';

function memStorage() {
  const files = new Map<string, Buffer>();
  return {
    files,
    async put(key: string, data: Buffer): Promise<string> {
      files.set(key, data);
      return `/files/${key}`;
    },
    async get(key: string): Promise<Buffer> {
      const b = files.get(key);
      if (!b) throw new Error(`没有这个对象：${key}`);
      return b;
    },
    async delete(key: string): Promise<void> {
      files.delete(key);
    },
    url(key: string): string {
      return `/files/${key}`;
    },
    async exists(key: string): Promise<boolean> {
      return files.has(key);
    },
  };
}

/** 假网关：记下每次收到的语音请求，返回一段可辨认的假音频 */
function fakeGateway() {
  const calls: { text: string; voice: string; tone?: string }[] = [];
  return {
    calls,
    gateway: {
      async text() { throw new Error('这条用例不该调到文本'); },
      async image() { throw new Error('这条用例不该调到图片'); },
      async speech(req: { text: string; voice: string; tone?: string }) {
        calls.push(req);
        return {
          audio: { buffer: Buffer.from(`audio:${req.text}`), mime: 'audio/mpeg' },
          transcript: req.text,
          providerId: 'p-test',
          model: 'gpt-audio-1.5-official',
          usage: { inputTokens: 1, outputTokens: 2 },
          degraded: false,
          degradeReason: '',
          latencyMs: 1,
        };
      },
    },
  };
}

function makePage(script: string) {
  const user = createUser({
    username: `u${Date.now()}${Math.floor(Math.random() * 1000)}`,
    password: 'abcd1234',
    role: 'user',
    source: 'self_signup',
  });
  const project = createProject({
    tenantId: user.tenantId,
    ownerId: user.userId,
    title: '年度战略汇报',
  });
  const page = PageIR.parse({
    pageId: `pg_${Math.floor(Math.random() * 1e9)}`,
    pageType: 'text',
    layoutVariant: 'text/one-column@v1',
    title: { main: '市场现状' },
    blocks: [{ id: 'b', type: 'paragraph', text: '正文' }],
    script: { cursorEnabled: true, text: script, segments: [], edited: false },
    status: 'ready',
  });
  savePageGroup(project.projectId, user.tenantId, [page], 0, 0);
  return { user, project, pageId: page.pageId };
}

test('种子数据里必须已经配好 tts 路由，否则第一次合成就抛 ROUTE_NOT_CONFIGURED', () => {
  const route = listRoutes().find((r) => r.taskType === 'tts');
  assert.ok(route, 'tts 路由没被 seed 出来');
  assert.equal(route.primary.providerId, 'prv_mock', '默认指向内置 Mock，管理员再去后台改');
  assert.ok(requireRoute('tts').primary.model.length > 0);
});

test('extensionForMime 认得出 mp3 与 wav', () => {
  assert.equal(extensionForMime('audio/mpeg'), 'mp3');
  assert.equal(extensionForMime('audio/mp3'), 'mp3');
  assert.equal(extensionForMime('audio/wav'), 'wav');
  assert.equal(extensionForMime('audio/ogg'), 'ogg');
  assert.equal(extensionForMime('application/octet-stream'), 'bin');
});

test('内容哈希用 NUL 分隔，避免拼接歧义', () => {
  const a = narrationHash({ text: 'ab', voice: 'c', tone: '', provider: 'p', model: 'm', prompt: 'r' });
  const b = narrationHash({ text: 'a', voice: 'bc', tone: '', provider: 'p', model: 'm', prompt: 'r' });
  assert.notEqual(a, b, '("ab","c") 与 ("a","bc") 不能撞成同一个哈希');
  assert.equal(a.length, 16);

  /**
   * 朗读指令变了，同一段文本合成出来的音频就完全不同（有指令是全文朗读，
   * 没指令是对话式回应）。它不进哈希的话，改了指令却一直命中旧音频。
   */
  const withPrompt = narrationHash({ text: 't', voice: 'v', tone: '', provider: 'p', model: 'm', prompt: '逐字朗读' });
  const noPrompt = narrationHash({ text: 't', voice: 'v', tone: '', provider: 'p', model: 'm', prompt: '' });
  assert.notEqual(withPrompt, noPrompt, '朗读指令必须进缓存键');
});

test('同模型名换 Provider 也要失效——Mock 与真实 Provider 可能配同一个模型名', async () => {
  const { user, pageId } = makePage(NARRATION);
  const storage = memStorage();
  const { gateway, calls } = fakeGateway();

  await ensureNarration({ pageId, tenantId: user.tenantId, gateway, storage });
  assert.ok(await readNarration(pageId, user.tenantId, storage));

  // 模型名保持不变，只把路由换到另一个 Provider
  const before = requireRoute('tts').primary;
  const other = createProvider({
    name: '另一个语音网关',
    type: 'openai-compatible',
    baseUrl: 'https://audio.example.com/v1',
    models: { text: [], image: [], audio: [before.model] },
  });
  updateRoute('tts', {
    primary: { providerId: other.providerId, model: before.model },
  }, 'admin');

  assert.equal(
    await readNarration(pageId, user.tenantId, storage),
    null,
    '换 Provider 后不该继续命中旧音频，否则「配好了却还是没声音」',
  );

  await ensureNarration({ pageId, tenantId: user.tenantId, gateway, storage });
  assert.equal(calls.length, 2);

  // 还原，免得影响后面的用例
  updateRoute('tts', { primary: before }, 'admin');
});

test('没合成过时取讲解返回 null，不抛错', async () => {
  const { user, pageId } = makePage(NARRATION);
  assert.equal(await readNarration(pageId, user.tenantId, memStorage()), null);
});

test('合成后能取到音频，mime 与内容都对', async () => {
  const { user, pageId } = makePage(NARRATION);
  const storage = memStorage();
  const { gateway, calls } = fakeGateway();

  const made = await synthesizeNarration({ pageId, tenantId: user.tenantId, gateway, storage });
  assert.equal(made.mime, 'audio/mpeg');
  assert.deepEqual(made.buffer, Buffer.from(`audio:${NARRATION}`));
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.text, NARRATION);

  const cached = await readNarration(pageId, user.tenantId, storage);
  assert.ok(cached, '合成过之后应该命中');
  assert.deepEqual(cached.buffer, made.buffer);
});

test('ensureNarration 第二次不再调语音模型（命中缓存不重复花钱）', async () => {
  const { user, pageId } = makePage(NARRATION);
  const storage = memStorage();
  const { gateway, calls } = fakeGateway();

  await ensureNarration({ pageId, tenantId: user.tenantId, gateway, storage });
  await ensureNarration({ pageId, tenantId: user.tenantId, gateway, storage });

  assert.equal(calls.length, 1, '第二次应该走缓存');
});

test('改语气后缓存失效，下次取会重新合成', async () => {
  const { user, pageId } = makePage(NARRATION);
  const storage = memStorage();
  const { gateway, calls } = fakeGateway();

  await ensureNarration({ pageId, tenantId: user.tenantId, gateway, storage });
  assert.ok(await readNarration(pageId, user.tenantId, storage));

  setSetting(SETTING_KEYS.narrationTone, '沉稳专业，像给客户做正式汇报');
  assert.equal(await readNarration(pageId, user.tenantId, storage), null, '语气变了，旧音频不该再命中');

  await ensureNarration({ pageId, tenantId: user.tenantId, gateway, storage });
  assert.equal(calls.length, 2);
  assert.equal(calls[1]!.tone, '沉稳专业，像给客户做正式汇报', '语气要作为 tone 发给模型');

  setSetting(SETTING_KEYS.narrationTone, '');
});

test('改音色后缓存失效，且旧音频文件被清掉', async () => {
  const { user, pageId } = makePage(NARRATION);
  const storage = memStorage();
  const { gateway, calls } = fakeGateway();

  await ensureNarration({ pageId, tenantId: user.tenantId, gateway, storage });
  const afterFirst = storage.files.size;
  assert.ok(afterFirst >= 2, '音频 + 元数据两份');

  setSetting(SETTING_KEYS.narrationVoice, 'nova');
  assert.equal(await readNarration(pageId, user.tenantId, storage), null);

  await ensureNarration({ pageId, tenantId: user.tenantId, gateway, storage });
  assert.equal(calls.length, 2);
  assert.equal(calls[1]!.voice, 'nova');
  assert.equal(storage.files.size, afterFirst, '换音色后旧音频该被删掉，文件数不该涨');

  setSetting(SETTING_KEYS.narrationVoice, '');
});

test('改讲稿后缓存同样失效', async () => {
  const { user, project, pageId } = makePage(NARRATION);
  const storage = memStorage();
  const { gateway, calls } = fakeGateway();

  await ensureNarration({ pageId, tenantId: user.tenantId, gateway, storage });
  assert.ok(await readNarration(pageId, user.tenantId, storage));

  const row = getPage(pageId, user.tenantId);
  const page = pageIR(row);
  savePage(
    project.projectId,
    user.tenantId,
    PageIR.parse({ ...page, script: { ...page.script, text: '换了一段讲稿。' } }),
    row.pageIndex,
  );

  assert.equal(await readNarration(pageId, user.tenantId, storage), null, '讲稿变了，旧音频不该再命中');
  await ensureNarration({ pageId, tenantId: user.tenantId, gateway, storage });
  assert.equal(calls.length, 2);
  assert.equal(calls[1]!.text, '换了一段讲稿。');
});

test('讲稿为空时用标题兜底；标题也空则不合成', async () => {
  const { user, project, pageId } = makePage('');
  const storage = memStorage();
  const { gateway, calls } = fakeGateway();

  await ensureNarration({ pageId, tenantId: user.tenantId, gateway, storage });
  assert.equal(calls.length, 1);
  assert.ok(calls[0]!.text.includes('市场现状'), `标题该兜底进去：${calls[0]!.text}`);

  // 标题也清空之后就不该再合成
  const row = getPage(pageId, user.tenantId);
  const page = pageIR(row);
  savePage(
    project.projectId,
    user.tenantId,
    PageIR.parse({ ...page, title: { ...page.title, main: '' } }),
    row.pageIndex,
  );
  assert.equal(await readNarration(pageId, user.tenantId, storage), null);
  await assert.rejects(
    () => synthesizeNarration({ pageId, tenantId: user.tenantId, gateway, storage }),
    /没有可朗读的内容/,
  );
});

test('别的租户取不到这一页的讲解', async () => {
  const { pageId } = makePage(NARRATION);
  await assert.rejects(() => readNarration(pageId, 'tn_别的租户', memStorage()));
});

/* ---------------- 项目级音色 / 语气 ---------------- */

test('项目选了音色就用项目的，没选（null）才回落全局', async () => {
  const { user, project, pageId } = makePage(NARRATION);
  const storage = memStorage();
  const { gateway, calls } = fakeGateway();

  // 全局设一个，项目没选 → 用全局
  setSetting(SETTING_KEYS.narrationVoice, 'shimmer');
  await ensureNarration({ pageId, tenantId: user.tenantId, gateway, storage });
  assert.equal(calls[0]!.voice, 'shimmer', '项目没选时该跟全局走');

  // 项目单独选一个 → 用它，且缓存随之失效
  updateProject(project.projectId, user.tenantId, { narrationVoice: 'sage' });
  assert.equal(await readNarration(pageId, user.tenantId, storage), null, '换了音色，旧音频该失效');

  await ensureNarration({ pageId, tenantId: user.tenantId, gateway, storage });
  assert.equal(calls[1]!.voice, 'sage', '项目选了就用项目的');

  setSetting(SETTING_KEYS.narrationVoice, '');
});

test('改全局音色会波及「没单独选过」的项目——这正是「全局切换人声重生成」要的', async () => {
  const { user, pageId } = makePage(NARRATION);
  const storage = memStorage();
  const { gateway, calls } = fakeGateway();

  setSetting(SETTING_KEYS.narrationVoice, 'onyx');
  await ensureNarration({ pageId, tenantId: user.tenantId, gateway, storage });
  assert.equal(calls[0]!.voice, 'onyx');

  setSetting(SETTING_KEYS.narrationVoice, 'ballad');
  assert.equal(await readNarration(pageId, user.tenantId, storage), null, '全局变了，没覆盖过的项目该跟着失效');

  await ensureNarration({ pageId, tenantId: user.tenantId, gateway, storage });
  assert.equal(calls[1]!.voice, 'ballad');

  setSetting(SETTING_KEYS.narrationVoice, '');
});

test('批量排配音：只排就绪且有讲稿的页', () => {
  const { user, project, pageId } = makePage(NARRATION);
  // 再加一页没有讲稿的——它不该被排进去，排了 worker 只会抛「没有可朗读的内容」
  const blank = PageIR.parse({
    pageId: `pg_blank_${Math.floor(Math.random() * 1e9)}`,
    pageType: 'text', layoutVariant: 'text/one-column@v1',
    title: { main: '' },
    blocks: [{ id: 'b', type: 'paragraph', text: '正文' }],
    script: { cursorEnabled: false, text: '', segments: [], edited: false },
    status: 'ready',
  });
  savePageGroup(project.projectId, user.tenantId, [blank], 1, 1);

  const queued = enqueueProjectNarration(project.projectId, user.tenantId);
  assert.equal(queued, 1, '只有那一页有讲稿');

  const tasks = apiQueue().list({ projectId: project.projectId, kind: 'tts' });
  assert.equal(tasks.total, 1);
  assert.equal(tasks.items[0]!.pageId, pageId);

  // 单页入口同样受这条约束
  assert.throws(() => enqueuePageNarration(blank.pageId, user.tenantId), /没有可朗读的内容/);
});
