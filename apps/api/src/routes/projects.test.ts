import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';

const tmp = mkdtempSync(join(tmpdir(), 'lumen-proj-'));
process.env.NODE_ENV = 'test';
process.env.LUMEN_DB_PATH = join(tmp, 'test.db');
// 品牌那几条用例会**真上传一次**，而 `createStorage()` 的默认值是 `./data/objects`——
// 不设这一行就会往 `apps/api/data/` 里写文件（`.gitignore` 里有 `data/`，只是脏，不进版本库，
// 但测试不该往仓库里写东西）。`apps/worker/src/worker.test.ts` 也是这么做
process.env.LUMEN_DATA_DIR = join(tmp, 'data');
process.env.LUMEN_SECRET_KEY = 'test-secret-key-0123456789abcdefghijklmnop';

const { createApp } = await import('../app.js');
const { migrate } = await import('@lumen/server-core');
const { ensureSeed } = await import('@lumen/server-core');
const { closeDb } = await import('@lumen/server-core');
const { ensureBuiltinStyles } = await import('@lumen/server-core');
const { pngHasAlpha } = await import('@lumen/style-engine/png');

migrate();
ensureSeed();
ensureBuiltinStyles();

const server: Server = createApp().listen(0);
await new Promise<void>((r) => server.once('listening', () => r()));
const addr = server.address();
const port = typeof addr === 'object' && addr ? addr.port : 0;
const base = `http://127.0.0.1:${port}`;

const BRIEF = [
  '1. 市场现状',
  '过去三年，企业级演示工具市场增长了 210%，其中在线协作类产品占比从 12% 提升到 34%。',
  '传统本地软件的市场份额持续萎缩，2024 年同比下降 18%，客户续费率也从 82% 降到 61%。',
  '企业采购决策正在从「买工具」转向「买效率」，这对产品的全链路能力提出了更高要求。',
  '同时，客户对成品的审美要求在快速提高，低价模板化产品正在被淘汰。',
  '',
  '2. 核心痛点',
  '- 风格一次性，页间漂移严重',
  '- 只生成不可精修，返工成本高',
  '- 生成与演示割裂，链路不完整',
  '',
  '3. 我们的方案',
  '我们提供从想法到成品的全链路能力，首年目标覆盖 3000 家企业客户，预期营收 1.2 亿元。',
  '试点客户的平均制作时长从 6 小时下降到 40 分钟，效率提升 9 倍，返工率下降 73%。',
  '这条路径已经在多个行业头部客户处得到验证，具备可复制性。',
].join('\n');

interface Res { status: number; body: { ok: boolean; data?: any; error?: { code: string; message: string } } }

async function api(path: string, init: RequestInit = {}): Promise<Res> {
  const res = await fetch(base + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : { ok: false } };
}

let tokenA = '';
let tokenB = '';
let projectId = '';

test.after(() => {
  server.close();
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

const auth = (t: string) => ({ authorization: `Bearer ${t}` });

test('准备两个用户', async () => {
  const a = await api('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ username: 'owner', password: 'abcd1234' }),
  });
  const b = await api('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ username: 'other', password: 'abcd1234' }),
  });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal(b.status, 201, JSON.stringify(b.body));
  tokenA = a.body.data.accessToken;
  tokenB = b.body.data.accessToken;
});

test('新建项目', async () => {
  const r = await api('/api/projects', {
    method: 'POST', headers: auth(tokenA),
    body: JSON.stringify({ title: '产品战略汇报', brief: BRIEF, audienceTag: 'executive', scene: 'board' }),
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.status, 'draft');
  assert.equal(r.body.data.progressText, '草稿');
  // 不传页数就是「由内容决定」。这条项目后面几条用例都在用（大纲、页面、导出），
  // 它得保持「没设页数」这个状态——设了页数的话第一份大纲会交给模型，规则层那条路就测不到了
  assert.equal(r.body.data.targetPages, null);
  projectId = r.body.data.projectId;
});

test('新建项目的页数超出 3–30 就拒绝，与工作台那一格同一套区间', async () => {
  for (const bad of [2, 31, 0, -1]) {
    const r = await api('/api/projects', {
      method: 'POST', headers: auth(tokenA),
      body: JSON.stringify({ title: `页数 ${bad}`, targetPages: bad }),
    });
    assert.equal(r.status, 400, `targetPages=${bad} 应该被拒，实际 ${r.status}`);
  }
  // 边界值收下，别把区间写窄了
  const okEdge = await api('/api/projects', {
    method: 'POST', headers: auth(tokenA),
    body: JSON.stringify({ title: '边界 3 页', targetPages: 3 }),
  });
  assert.equal(okEdge.status, 201, JSON.stringify(okEdge.body));
  assert.equal(okEdge.body.data.targetPages, 3);
  await api(`/api/projects/${okEdge.body.data.projectId}`, { method: 'DELETE', headers: auth(tokenA) });
});

test('新建时设的页数要落库，且详情不替它建一份页数对不上的规则骨架', async () => {
  /*
    实测过的缺陷：新建时填 15 页，一进项目就变回 9 页。

    两个原因叠在一起：
    1. 进项目拉的是 `GET /projects/:id`，它建第一份大纲时**没把项目上的页数传下去**，
       `buildOutline` 就按内容长度自己算了一份；
    2. 就算传下去了也白搭——规则层明确「段数少于页位时不硬凑」，八个要点的需求设 15 页
       它也只给 9 页，而那一份还会**落库**。

    按页数扩展要的是模型（`plan/outline/stream` 把页数当硬要求）。所以详情这里
    对这类项目**如实回空**，由工作台进去后自己跑那条流。

    自己建自己删：这条要的是一次干净的首建，不能借用别的用例已经建好的项目。
  */
  const longBrief = Array.from({ length: 15 }, (_, i) =>
    `${i + 1}. 第 ${i + 1} 节\n这一节讲一件事，写成一段完整的话，好让分段器认得出这是一节。`).join('\n\n');

  const made = await api('/api/projects', {
    method: 'POST', headers: auth(tokenA),
    body: JSON.stringify({ title: '页数落大纲', brief: longBrief, targetPages: 15 }),
  });
  assert.equal(made.status, 201, JSON.stringify(made.body));
  const id = made.body.data.projectId;

  const detail = await api(`/api/projects/${id}`, { headers: auth(tokenA) });
  assert.equal(detail.body.data.project.targetPages, 15, '页数没存到项目上');
  assert.deepEqual(detail.body.data.outline, [], '设了页数的项目不该先给一份对不上页数的规则骨架');

  await api(`/api/projects/${id}`, { method: 'DELETE', headers: auth(tokenA) });
});

test('没设页数的项目，详情照旧给规则骨架', async () => {
  // 上一条的反面：不设页数时规则骨架立即就有，用户不必先等一次模型调用
  const made = await api('/api/projects', {
    method: 'POST', headers: auth(tokenA),
    body: JSON.stringify({ title: '不设页数', brief: BRIEF }),
  });
  const detail = await api(`/api/projects/${made.body.data.projectId}`, { headers: auth(tokenA) });
  assert.equal(detail.body.data.project.targetPages, null);
  assert.ok(detail.body.data.outline.length > 0, '没设页数时也该有一份规则骨架');
  assert.equal(detail.body.data.outline[0].pageType, 'cover');
  await api(`/api/projects/${made.body.data.projectId}`, { method: 'DELETE', headers: auth(tokenA) });
});

test('项目列表只返回自己的项目', async () => {
  const mine = await api('/api/projects', { headers: auth(tokenA) });
  assert.equal(mine.body.data.total, 1);
  const others = await api('/api/projects', { headers: auth(tokenB) });
  assert.equal(others.body.data.total, 0);
});

test('越权读取他人项目返回 403 并写审计', async () => {
  const r = await api(`/api/projects/${projectId}`, { headers: auth(tokenB) });
  assert.equal(r.status, 403);
  assert.equal(r.body.error?.code, 'FORBIDDEN');
});

test('生成大纲：识别为已有内容并正确分页', async () => {
  const r = await api(`/api/projects/${projectId}/outline`, { method: 'POST', headers: auth(tokenA), body: '{}' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const { outline, intent } = r.body.data;
  assert.equal(intent.kind, 'has_content');
  assert.equal(outline[0].pageType, 'cover');
  assert.equal(outline[outline.length - 1].pageType, 'end');
  assert.equal(outline.length, 5, '封面 + 3 个内容页 + 结尾');
});

test('大纲可编辑并持久化', async () => {
  const cur = await api(`/api/projects/${projectId}`, { headers: auth(tokenA) });
  const outline = cur.body.data.outline;
  outline[1].title = '改过的标题';
  const saved = await api(`/api/projects/${projectId}/outline`, {
    method: 'PUT', headers: auth(tokenA), body: JSON.stringify({ outline }),
  });
  assert.equal(saved.status, 200);
  const again = await api(`/api/projects/${projectId}`, { headers: auth(tokenA) });
  assert.equal(again.body.data.outline[1].title, '改过的标题');
});

/*
  标记「已手改」的规则：**信客户端给的那一个**，不靠比对内容推。

  原先服务端拿收到的整份大纲与库里那份逐字段比，不一样就标上。看着合理，实际是个陷阱：
  客户端发的就是整份本地大纲，而本地那份落后于服务端是常态（生成教案期间 `hydrate`
  会刻意不覆盖本地大纲）。实测踩到过——一次这样的保存把 30 页里的 26 页标成「人改过」，
  而它们的内容一个字没动；标记又是粘性的，于是「生成整本教案」再也写不到那 26 页。
*/
test('保存大纲：内容对不上不等于人改过，只有客户端说改过才标', async () => {
  /*
    自己建一个项目：这条用例会把某一页永久标成「人改过」（标记是粘性的，
    标上就摘不掉），不能污染后面那些共用 `projectId` 的用例。
  */
  const made = await api('/api/projects', {
    method: 'POST', headers: auth(tokenA),
    body: JSON.stringify({ title: `标记用例 ${Date.now()}`, brief: BRIEF }),
  });
  const pid = made.body.data.projectId;
  await api(`/api/projects/${pid}/outline`, { method: 'POST', headers: auth(tokenA), body: '{}' });

  const read = async () => (await api(`/api/projects/${pid}`, { headers: auth(tokenA) })).body.data.outline;
  const put = (outline: unknown[]) => api(`/api/projects/${pid}/outline`, {
    method: 'PUT', headers: auth(tokenA), body: JSON.stringify({ outline }),
  });

  const original = await read();

  // 模拟「本地那份落后于服务端」：整份都不一样，但没人动过手
  const drifted = original.map((p: { title: string }) => ({ ...p, title: `${p.title}（本地旧版）`, edited: false }));
  await put(drifted);
  assert.deepEqual(
    (await read()).map((p: { edited?: boolean }) => p.edited ?? false),
    original.map(() => false),
    '整份对不上也不该标成「人改过」',
  );

  // 客户端说改过了 → 标上
  await put(original.map((p: object, i: number) => (i === 1 ? { ...p, edited: true } : p)));
  assert.equal((await read())[1].edited, true, '客户端标了就要落上');

  // 粘性：下一次客户端没带这个标记，也不该被摘掉
  await put(original);
  assert.equal((await read())[1].edited, true, '「这一页我认过了」给了就不收回');
});

test('库里没有风格文档时，生成明确报错而不是产出一本空册子', async () => {
  const r = await api(`/api/projects/${projectId}/generate`, { method: 'POST', headers: auth(tokenA), body: '{}' });
  assert.equal(r.status, 404, JSON.stringify(r.body));
  assert.equal(r.body.error?.code, 'NOT_FOUND');
  assert.ok(r.body.error?.message.includes('风格库是空的'), r.body.error?.message);
});

/**
 * 后面几条用例要拿「已就绪的页面」当前提。
 *
 * 新链路的逐页生成要真调模型，用例里不能走那条路——这里改用手动加页，
 * 同样会落库、同样会算就绪数，而页面的读写、排序、导出受理都不依赖模型，
 * 仍然测得动。
 */
test('按大纲逐页建页', async () => {
  const detail = await api(`/api/projects/${projectId}`, { headers: auth(tokenA) });
  for (const p of detail.body.data.outline) {
    const r = await api(`/api/projects/${projectId}/pages`, {
      method: 'POST', headers: auth(tokenA), body: JSON.stringify({ pageType: p.pageType }),
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }
  const list = await api(`/api/projects/${projectId}/pages`, { headers: auth(tokenA) });
  assert.equal(list.body.data.length, detail.body.data.outline.length, '页数应与大纲一致');
});

test('项目详情返回完整页面与风格包', async () => {
  const r = await api(`/api/projects/${projectId}`, { headers: auth(tokenA) });
  assert.equal(r.status, 200);
  const { project, pages, style } = r.body.data;
  assert.equal(project.status, 'completed');
  assert.equal(project.readyPages, project.totalPages);
  assert.ok(pages.length >= 5);
  assert.ok(style, '应已锁定风格包');
  assert.equal(style.pack.styleId, 'business-classic', '高管人群应推荐商务经典');

  const variantIds = new Set(style.pack.base.layouts.map((l: { id: string }) => l.id));
  for (const p of pages) {
    assert.ok(p.page.layoutVariant.length > 0, '每页都要有版式');
    assert.ok(variantIds.has(p.page.layoutVariant), `版式 ${p.page.layoutVariant} 必须来自风格包`);
    // 新页面存的是 `auto`（模式，不在白名单里），轮换出来的值由渲染层负责落在白名单内
    const enter = p.page.motion.enter;
    assert.ok(
      ['auto', 'stagger'].includes(enter) || style.pack.base.motionWhitelist.includes(enter),
      '动效必须来自白名单',
    );
  }
});

test('页脚页码连续且与顺序一致', async () => {
  const r = await api(`/api/projects/${projectId}/pages`, { headers: auth(tokenA) });
  const pages = r.body.data;
  assert.deepEqual(pages.map((p: any) => p.page.footer.pageNo), pages.map((_: unknown, i: number) => i + 1));
  assert.deepEqual(pages.map((p: any) => p.pageIndex), pages.map((_: unknown, i: number) => i));
});

test('单页可编辑并保存', async () => {
  const list = await api(`/api/projects/${projectId}/pages`, { headers: auth(tokenA) });
  const first = list.body.data[0];
  const edited = {
    ...first.page,
    title: { ...first.page.title, main: '手动改过的主标题' },
    blocks: [...first.page.blocks, { id: '', type: 'paragraph', text: '手动加的一段正文。' }],
  };
  const r = await api(`/api/pages/${first.pageId}`, {
    method: 'PUT', headers: auth(tokenA), body: JSON.stringify({ page: edited }),
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.page.title.main, '手动改过的主标题');

  const re = await api(`/api/pages/${first.pageId}`, { headers: auth(tokenA) });
  assert.equal(re.body.data.page.title.main, '手动改过的主标题');
});

test('库里没有风格文档时，单页重生成明确报错', async () => {
  // 重生成同样要拿风格提示词，没有风格就不该悄悄产出一页无风格的页面
  const list = await api(`/api/projects/${projectId}/pages`, { headers: auth(tokenA) });
  const target = list.body.data[1];
  const r = await api(`/api/pages/${target.pageId}/regenerate`, { method: 'POST', headers: auth(tokenA), body: '{}' });
  assert.equal(r.status, 404, JSON.stringify(r.body));
  assert.ok(r.body.error?.message.includes('风格库是空的'), r.body.error?.message);
});

test('新增页面插到指定位置', async () => {
  const before = await api(`/api/projects/${projectId}/pages`, { headers: auth(tokenA) });
  const r = await api(`/api/projects/${projectId}/pages`, {
    method: 'POST', headers: auth(tokenA),
    body: JSON.stringify({ pageType: 'text', afterIndex: 1 }),
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const after = await api(`/api/projects/${projectId}/pages`, { headers: auth(tokenA) });
  assert.equal(after.body.data.length, before.body.data.length + 1);
});

test('导出：页未就绪时明确拒绝', async () => {
  const created = await api('/api/projects', {
    method: 'POST', headers: auth(tokenA),
    body: JSON.stringify({ title: '空项目', brief: '很短的想法' }),
  });
  const emptyId = created.body.data.projectId;
  const r = await api('/api/exports', {
    method: 'POST', headers: auth(tokenA), body: JSON.stringify({ projectId: emptyId, format: 'pdf' }),
  });
  assert.equal(r.status, 409);
  assert.match(r.body.error?.message ?? '', /没有任何页面/);
});

test('导出：全部就绪后受理并入队', async () => {
  const r = await api('/api/exports', {
    method: 'POST', headers: auth(tokenA), body: JSON.stringify({ projectId, format: 'pptx' }),
  });
  assert.equal(r.status, 202, JSON.stringify(r.body));
  assert.equal(r.body.data.format, 'pptx');
  assert.equal(r.body.data.status, 'queued');

  const jobs = await api(`/api/exports?projectId=${projectId}`, { headers: auth(tokenA) });
  assert.ok(jobs.body.data.length >= 1);

  const tasks = await api('/api/tasks?kind=export_pptx', { headers: auth(tokenA) });
  assert.ok(tasks.body.data.total >= 1, '应生成对应的导出任务');
});

test('导出格式说明对用户可见', async () => {
  const r = await api('/api/exports/notes', { headers: auth(tokenA) });
  assert.equal(r.status, 200);
  assert.match(r.body.data.notes.pptx, /文字不可编辑/);
  assert.match(r.body.data.notes.html, /单文件自包含/);
});

test('分享：创建链接、匿名可读、只读', async () => {
  const created = await api('/api/shares', {
    method: 'POST', headers: auth(tokenA), body: JSON.stringify({ projectId, ttlDays: 7 }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const token = created.body.data.token;
  assert.ok(created.body.data.url.includes(token));

  const pub = await api(`/api/present/${token}`);
  assert.equal(pub.status, 200, JSON.stringify(pub.body));
  assert.equal(pub.body.data.title, '产品战略汇报');
  assert.ok(pub.body.data.pages.length >= 5);
  // 公开接口不得返回任何可写字段
  assert.equal(Object.prototype.hasOwnProperty.call(pub.body.data, 'tenantId'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pub.body.data, 'projectId'), false);
});

test('分享：撤销后不可访问', async () => {
  const created = await api('/api/shares', {
    method: 'POST', headers: auth(tokenA), body: JSON.stringify({ projectId, ttlDays: 1 }),
  });
  const { shareId, token } = created.body.data;
  assert.equal((await api(`/api/present/${token}`)).status, 200);
  await api(`/api/shares/${shareId}`, { method: 'DELETE', headers: auth(tokenA) });
  const after = await api(`/api/present/${token}`);
  assert.equal(after.status, 404);
  assert.match(after.body.error?.message ?? '', /撤销/);
});

test('分享：非法 token 返回 404', async () => {
  const r = await api('/api/present/not-a-real-token');
  assert.equal(r.status, 404);
});

test('普通用户访问 admin 接口返回 403 并写审计', async () => {
  const me = await api('/api/me', { headers: auth(tokenA) });
  const userId = me.body.data.user.userId as string;

  const r = await api('/api/admin/users', { headers: auth(tokenA) });
  assert.equal(r.status, 403);

  const { listAudit } = await import('@lumen/server-core');
  const tenantId = me.body.data.user.tenantId as string;
  const { items } = listAudit({ tenantId, userId, action: 'forbidden', limit: 10 });
  assert.ok(items.length > 0, '越权访问必须留下 forbidden 审计记录');
  assert.match(items[0]!.target, /\/api\/admin\/users/, '审计应记录被访问的接口');
});

test('跨租户读取他人项目返回 403 并写审计', async () => {
  const me = await api('/api/me', { headers: auth(tokenB) });
  const userId = me.body.data.user.userId as string;
  const tenantId = me.body.data.user.tenantId as string;

  const r = await api(`/api/projects/${projectId}`, { headers: auth(tokenB) });
  assert.equal(r.status, 403);

  const { listAudit } = await import('@lumen/server-core');
  const { items } = listAudit({ tenantId, userId, action: 'forbidden', limit: 10 });
  assert.ok(items.length > 0, '越权读取必须留下 forbidden 审计记录');
  assert.match(items[0]!.target, new RegExp(projectId), '审计应记录被访问的项目');
});

test('任务库返回队列统计', async () => {
  const r = await api('/api/tasks/stats', { headers: auth(tokenA) });
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.data.byKind));
});

/**
 * 可选风格来自**风格库**，不是代码里写死的旧风格包。
 *
 * **这条必须放在最后**：它往共用的测试库里存了一套风格，而前面几条用例
 * （「库里没有风格文档时，生成明确报错」那一组）依赖库里是空的。
 * 放在前面会让那几条从「预期报错」变成「顺利生成」，失败得莫名其妙。
 */
test('风格建议接口回的是风格库里的那几套', async () => {
  const empty = await api('/api/projects/style-suggestions', { headers: auth(tokenA) });
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.data.styles, [], '库里没有风格时要回空列表，不能退回内置包');

  const { saveStyleDoc } = await import('@lumen/server-core');
  const { StyleDoc } = await import('@lumen/ir-schema');
  saveStyleDoc(StyleDoc.parse({
    styleId: 'studio-demo',
    name: '演示风格',
    description: '一句话说明这套风格',
    palette: {
      bg: '#EFE6DA', surface: '#F7F1E8', text: '#3A322B', muted: '#8A7F73',
      accent: '#E08A3C', brand: '#C7421A', border: '#D8CDBF',
    },
    pagePrompts: {
      cover: {
        pageType: 'cover',
        prompt: '角色：x\n任务：y\n视觉与排版要求：\n1. z\n代码要求（非常重要）：\n1. w',
        mockHtml: '<div>样机</div>',
      },
    },
  }));

  const r = await api('/api/projects/style-suggestions', { headers: auth(tokenA) });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.styles.length, 1);
  assert.equal(r.body.data.styles[0].styleId, 'studio-demo@1.0');
  assert.equal(r.body.data.styles[0].name, '演示风格');
  assert.deepEqual(r.body.data.styles[0].pageTypes, ['cover']);
  assert.equal(r.body.data.styles[0].palette.accent, '#E08A3C');
});

/**
 * 删除项目：连同它的页面、分享链接一起清掉。
 *
 * `deleteProject` 里那几张表**没有外键级联**，靠一段事务逐表删。漏掉哪一张，
 * 用户下次建同名项目时就会撞上残留的分享链接与导出任务——而且不会报错，
 * 只会让「分享数」「任务数」这些指标悄悄偏大。所以这里逐表核一遍。
 *
 * 这条用例自己建一个项目，不动上面共用的 `projectId`（后面几条还依赖它）。
 */
test('删除项目：级联清掉页面与分享，且不能删别人的', async () => {
  const created = await api('/api/projects', {
    method: 'POST', headers: auth(tokenA),
    body: JSON.stringify({ title: '待删除的项目', brief: BRIEF }),
  });
  const id = created.body.data.projectId as string;

  // 落一页进 pages 表，否则「页面被清掉」这条断言是空转
  const page = await api(`/api/projects/${id}/pages`, {
    method: 'POST', headers: auth(tokenA), body: JSON.stringify({ pageType: 'text' }),
  });
  assert.equal(page.status, 201, JSON.stringify(page.body));

  const share = await api('/api/shares', {
    method: 'POST', headers: auth(tokenA), body: JSON.stringify({ projectId: id, ttlDays: 7 }),
  });
  assert.equal(share.status, 201, JSON.stringify(share.body));

  // 别人的项目删不动，而且项目要原样留着
  const denied = await api(`/api/projects/${id}`, { method: 'DELETE', headers: auth(tokenB) });
  assert.equal(denied.status, 403, '不能删别的租户的项目');
  assert.equal((await api(`/api/projects/${id}`, { headers: auth(tokenA) })).status, 200);

  const del = await api(`/api/projects/${id}`, { method: 'DELETE', headers: auth(tokenA) });
  assert.equal(del.status, 200, JSON.stringify(del.body));
  assert.equal(del.body.data.deleted, true);

  assert.equal((await api(`/api/projects/${id}`, { headers: auth(tokenA) })).status, 404, '项目应已不存在');

  const { listPages, shareCount } = await import('@lumen/server-core');
  assert.equal(listPages(id).length, 0, '页面应随项目一起清掉');
  assert.equal(shareCount(id), 0, '分享链接应随项目一起清掉');

  // 删这种不可逆的动作要留得下痕迹，且认得出删的是哪一本
  const me = await api('/api/me', { headers: auth(tokenA) });
  const { listAudit } = await import('@lumen/server-core');
  const { items } = listAudit({ tenantId: me.body.data.user.tenantId, action: 'delete_project', limit: 10 });
  assert.ok(items.length > 0, '删项目必须写审计');
  assert.match(items[0]!.target, new RegExp(id));
  assert.equal(items[0]!.meta.title, '待删除的项目', '审计里要认得出删的是哪一本，不能只剩 id');
});

/**
 * 图位出图与图位抠图这两条路由。
 *
 * `image/stream` 曾经有个 `cutout=1`，会带上 `background: 'transparent'` 让图片模型
 * 直接出透明底。**实测那个参数会被静默忽略**、把「透明」画成棋盘格，所以那条路删了；
 * 现在透明底只走 `image/cutout/stream`，由抠图服务真抠。这条用例把「删干净了」钉住：
 * 传旧的 `cutout=1` 出来的仍是普通图，不会有人以为它还管用。
 *
 * 抠图那条**不打真接口**：路由里是内联的 `cutoutImage(...)`，注入不了 spy，而这条
 * 用例跑在临时库上、没配 koukoutu 的密钥。所以断言分两段——开流之前 `src` 的校验
 * （客户端错误，该给 400），以及合法地址确实走到了「去抠图」那一步（报的是那句
 * 「还没配置密钥」，说明前面几步都对）。
 */
test('图位出图：出的是普通图，旧的 cutout 参数已不再生效', async () => {
  const created = await api('/api/projects', {
    method: 'POST', headers: auth(tokenA),
    body: JSON.stringify({ title: 'cutout 用例', brief: BRIEF }),
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const pid = created.body.data.projectId as string;

  const page = await api(`/api/projects/${pid}/pages`, {
    method: 'POST', headers: auth(tokenA), body: JSON.stringify({ pageType: 'imageText' }),
  });
  assert.equal(page.status, 201, JSON.stringify(page.body));
  const pageId = page.body.data.pageId as string;

  /**
   * 裸 fetch 读 SSE：`api()` 助手会对响应体 `JSON.parse`，读不了流。
   * 路由里出图走的是内置 Mock，出图很快，不会拖到超时。
   */
  const generate = (query: string) => fetch(
    `${base}/api/pages/${pageId}/image/stream?slot=0${query}`,
    { headers: auth(tokenA) },
  );

  const fetchPng = async (res: Response) => {
    const text = await res.text();
    const url = /"url":"([^"]+)"/.exec(text)?.[1];
    assert.ok(url, `没拿到图：${text.slice(0, 300)}`);
    return Buffer.from(await (await fetch(`${base}${url}`)).arrayBuffer());
  };

  const plain = await generate('');
  assert.equal(plain.status, 200);
  assert.match(plain.headers.get('content-type') ?? '', /text\/event-stream/);
  assert.equal(pngHasAlpha(await fetchPng(plain)), false, '出图出的是普通照片');

  // 旧的 cutout=1 不再有任何效果——图片模型给不出透明底，那条路已经删了
  const old = await generate('&cutout=1');
  assert.equal(old.status, 200);
  assert.equal(pngHasAlpha(await fetchPng(old)), false, '旧的 cutout 参数不该再让图变透明');
});

test('图位抠图：src 只认图库素材与本项目的图', async () => {
  const created = await api('/api/projects', {
    method: 'POST', headers: auth(tokenA),
    body: JSON.stringify({ title: '抠图用例', brief: BRIEF }),
  });
  const pid = created.body.data.projectId as string;
  const page = await api(`/api/projects/${pid}/pages`, {
    method: 'POST', headers: auth(tokenA), body: JSON.stringify({ pageType: 'imageText' }),
  });
  const pageId = page.body.data.pageId as string;

  const cut = (src: string) => fetch(
    `${base}/api/pages/${pageId}/image/cutout/stream?slot=0&src=${encodeURIComponent(src)}`,
    { headers: auth(tokenA) },
  );

  // 这些一律该被挡在开流之前。放开了就是一个任意文件读取
  const rejected: [string, string][] = [
    ['https://evil.test/a.png', '外部地址'],
    ['/etc/passwd', '本地路径'],
    ['/stock/这张素材不存在.jpg', '图库里没有这张'],
    ['/files/../secret.png', '路径穿越'],
    ['/files/other-tenant/prj_x/uploads/a.png', '别的租户的 key'],
  ];
  for (const [src, why] of rejected) {
    const res = await cut(src);
    assert.equal(res.status, 400, `${why} 该被拒：${src}`);
  }

  // 合法地址要真的走到「去抠图」那一步。临时库上没配密钥，所以报的是那一句——
  // 说明页面归属、src 解析、读原图都过了
  const good = await cut('/stock/architecture-1.jpg');
  assert.equal(good.status, 200);
  const text = await good.text();
  assert.match(text, /抠图服务的密钥/, `没走到抠图那一步：${text.slice(0, 300)}`);
});

/* ---------------- 品牌 ---------------- */

test('品牌路由要登录，未登录一律 401', async () => {
  const res = await api('/api/projects/prj_x/brand/redraw', {
    method: 'POST', body: JSON.stringify({ imageKey: 'k.png' }),
  });
  assert.equal(res.status, 401);
});

test('重绘要传 imageKey，不传报 400', async () => {
  const res = await api(`/api/projects/${projectId}/brand/redraw`, {
    method: 'POST', headers: auth(tokenA), body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
});

test('imageKey 必须是本项目上传的图，别人的 key 一律拒收', async () => {
  const me = await api('/api/me', { headers: auth(tokenA) });
  const tenantId = me.body.data.user.tenantId as string;

  const bad = [
    `${tenantId}/prj_someone_else/uploads/1-logo.png`, // 别的项目
    `${tenantId}/${projectId}/outputs/deck.pdf`,       // 本项目、但不在 uploads 分区
    '/etc/passwd',
    `../../${tenantId}/${projectId}/uploads/x.png`,    // 路径花活
  ];
  for (const imageKey of bad) {
    const res = await api(`/api/projects/${projectId}/brand/redraw`, {
      method: 'POST', headers: auth(tokenA), body: JSON.stringify({ imageKey }),
    });
    assert.equal(res.status, 400, `本该拒收：${imageKey}，实际 ${res.status} ${JSON.stringify(res.body)}`);
  }

  /**
   * 前缀对了就该**放行到下一步**。
   *
   * **这条与上面那个拒收循环守的是相反的两个方向，两条都要：**
   * - 把前缀判断写成**恒真**（`if (true) throw`）→ 上面那个循环照样全绿（坏 key 都被拒了），
   *   红的只有这条；它守的是「不能一律拒收」。
   * - 把前缀判断写成**恒假**（`if (false)`）→ 上面那个循环先红，红的**不是**这条；
   *   它守的是「不能一律放行」。
   *
   * 只留一条都会漏掉一个方向：恒真那种实现下真实用户**一张图都传不上去**，
   * 而只测拒收是看不出来的。
   *
   * **用「真上传一张图」来验，不要用「假 key 撞下游失败 + `assert.notEqual(status, 400)`」。**
   * 后者是个会误伤后续修复的陷阱：任何非 400 都算过（402 配额、404 路由写错、409 生成锁都过），
   * 而且哪天有人把「读对象失败」的错误语义从 500 改成 400（`apps/api/src/routes/styles.ts:281-284`
   * 就是 400），这条会立刻变红——尽管前缀校验一字未改，红的原因会指向错误的方向。
   *
   * 真上传之后，断言就落在**「请求走到了模型那一步」**（内置 Mock 给不出矢量稿 → 501），
   * 那是前缀过关、且对象真读到了的确凿证据。
   *
   * 顺带钉住一条**隐式契约**：品牌 logo 上传时**必须带 `projectId`**
   * （`apps/api/src/routes/uploads.ts:47` 的默认值是字面量 `'uploads'`）。仓库里现存的
   * 三处 `/uploads` 调用（`studio/upload.ts`、`RightRail.tsx` 两处）都没带，
   * 谁照它们复制一份，**每一次合法重绘都会 400**，而错误信息指不到真正的原因。
   */
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const up = await api('/api/uploads', {
    method: 'POST', headers: auth(tokenA),
    body: JSON.stringify({ dataUrl: `data:image/png;base64,${png}`, name: 'logo.png', projectId }),
  });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  assert.ok(
    String(up.body.data.key).startsWith(`${tenantId}/${projectId}/uploads/`),
    `上传要落在本项目的 uploads 分区，实际：${up.body.data.key}`,
  );

  const passed = await api(`/api/projects/${projectId}/brand/redraw`, {
    method: 'POST', headers: auth(tokenA), body: JSON.stringify({ imageKey: up.body.data.key }),
  });
  assert.equal(
    passed.status, 501,
    `前缀过了就该走到模型那一步（内置 Mock 给不出稿 → 501），实际 ${passed.status} ${JSON.stringify(passed.body)}`,
  );
  assert.match(passed.body.error?.message ?? '', /Mock/, '原因要是「路由指向内置 Mock」，不是前缀、也不是读对象');
});

/**
 * **前缀对了但对象不在了**，要报 400 并说得出原因。
 *
 * 读对象失败原先落成 500「服务器内部错误」，用户分不出是图片没了还是模型挂了
 * （`apps/api/src/routes/styles.ts:281-284` 是同一条路径，那边就是 400 + 一句中文）。
 * 这条守的就是那个 `try/catch`——去掉它，这条会红在 500 上。
 */
test('前缀对了但对象不在了，报 400 且说得出原因', async () => {
  const me = await api('/api/me', { headers: auth(tokenA) });
  const tenantId = me.body.data.user.tenantId as string;

  const res = await api(`/api/projects/${projectId}/brand/redraw`, {
    method: 'POST', headers: auth(tokenA),
    body: JSON.stringify({ imageKey: `${tenantId}/${projectId}/uploads/not-there.png` }),
  });
  assert.equal(res.status, 400, `不该是 500「服务器内部错误」：${JSON.stringify(res.body)}`);
  assert.match(res.body.error?.message ?? '', /取不到/, '要说得出是原图取不到');
});

test('PATCH 能存品牌名、标语与模式，且不接受客户端回传的 SVG', async () => {
  const res = await api(`/api/projects/${projectId}`, {
    method: 'PATCH', headers: auth(tokenA),
    body: JSON.stringify({
      brandName: '星图科技', brandTagline: '让数据说话',
      brandLogoMode: 'original', brandLogoSvg: '<svg/>',
    }),
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.brandName, '星图科技');
  // **三个字段都要断言。** 只断言 name 与 mode 的话，把 `brandTagline` 那一行从
  // `updateProject` 里删掉、全仓测试**一条都不会红**（实测过）——用户改标语永远不生效。
  assert.equal(res.body.data.brandTagline, '让数据说话', '标语也要真的落库');
  assert.equal(res.body.data.brandLogoMode, 'original', '模式也要真的落库');

  /**
   * 回传的 `brandLogoSvg` 被丢掉了——**这条守的其实是 `updateProject` 的白名单**
   * （漏写一行就红），不是注释常说的「schema 静默剥掉」：schema 是普通 `z.object`，
   * Zod 默认剥掉未知字段，所以就算有人把 `brandLogoSvg` 加进 schema、却忘了加进
   * `updateProject`，这条照样绿。安全属性守住了，机制没被验到——写在这里免得被误读。
   */
  assert.equal(res.body.data.brandLogoSvg, '', 'SVG 只能由服务端校验后写入，客户端传什么都不算数');

  // 空串要能真的把模式清掉——Task 8 的「不用 logo」按钮走的就是这条路，
  // 而 `''` 是 `BRAND_LOGO_MODES` 的合法取值，不测的话没人知道它通不通
  const cleared = await api(`/api/projects/${projectId}`, {
    method: 'PATCH', headers: auth(tokenA), body: JSON.stringify({ brandLogoMode: '' }),
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.data.brandLogoMode, '', '空串要能把模式清掉');
});

/**
 * 图表风格是**按项目**存的，所以这一条要连着走三段：迁移的默认值 → PATCH 写入 → 再读出来。
 *
 * 三段各自守着一处会静默出错的地方：
 *
 * 1. `createProject` 不传 `chartStyle`（列非空，靠迁移的 `DEFAULT 'dashboard'`），
 *    所以新建项目读到 `undefined` 就说明**迁移没跑到**——而这在开发库上是会发生的。
 * 2. 路由 zod 里漏掉 `chartStyle` 的话，zod 默认剥掉未知键，PATCH 照样 200、
 *    值一个字节都没写进去。只断言状态码的用例抓不到。
 * 3. 读路径（`GET /:id` 的 `project`）与 PATCH 的返回是两条路，都要带出来。
 */
test('图表风格按项目存：新建落默认值、PATCH 能改、非法值被拒', async () => {
  const fresh = await api('/api/projects', {
    method: 'POST', headers: auth(tokenA), body: JSON.stringify({ title: '图表风格' }),
  });
  assert.equal(fresh.status, 201);
  assert.equal(
    fresh.body.data.chartStyle, 'dashboard',
    '新建项目要落迁移里的 DEFAULT——是 undefined 就说明迁移没跑（createProject 不给兜底）',
  );

  const set = await api(`/api/projects/${projectId}`, {
    method: 'PATCH', headers: auth(tokenA), body: JSON.stringify({ chartStyle: 'classic' }),
  });
  assert.equal(set.status, 200);
  assert.equal(set.body.data.chartStyle, 'classic', 'PATCH 的返回要带上新值');

  // 再走一次 GET：PATCH 的返回与详情的读路径是两段代码，只验一段等于只验一半
  const detail = await api(`/api/projects/${projectId}`, { headers: auth(tokenA) });
  assert.equal(detail.body.data.project.chartStyle, 'classic', '详情里也要读得出来');

  const bad = await api(`/api/projects/${projectId}`, {
    method: 'PATCH', headers: auth(tokenA), body: JSON.stringify({ chartStyle: '花里胡哨' }),
  });
  assert.equal(bad.status, 400, '认不出的风格名要挡住，不能悄悄落进库里');

  // 被拒之后库里不能变成半截状态
  const after = await api(`/api/projects/${projectId}`, { headers: auth(tokenA) });
  assert.equal(after.body.data.project.chartStyle, 'classic', '400 那次不该改动任何东西');
});

test('DELETE /brand 清空五列', async () => {
  const me = await api('/api/me', { headers: auth(tokenA) });
  const tenantId = me.body.data.user.tenantId as string;

  /**
   * **五列都要先设成非空、再逐列断言清掉。**
   *
   * 只 `PATCH brandName` 再断言 `brandName === ''` 的话，把 `clearBrand` 改成
   * 「只清 brandName」（其余四列一个都不清）**全仓测试一条都不会红**（实测过）——
   * 而用户点了清空、面板上 logo 还在，CI 全绿。改这五列时漏一个正是最容易犯的错。
   *
   * `brandLogoSvg` 走不了 PATCH（服务端才写），所以用 `updateProject` 直接置。
   */
  const { updateProject } = await import('@lumen/server-core');
  updateProject(projectId, tenantId, {
    brandLogoImage: `${tenantId}/${projectId}/uploads/1-logo.png`,
    brandLogoSvg: '<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>',
    brandLogoMode: 'redraw',
    brandName: '星图科技',
    brandTagline: '让数据说话',
  });
  const before = await api(`/api/projects/${projectId}`, { headers: auth(tokenA) });
  for (const col of ['brandLogoImage', 'brandLogoSvg', 'brandLogoMode', 'brandName', 'brandTagline']) {
    assert.ok(before.body.data.project[col].length > 0, `前置条件：${col} 要是非空的，否则下面的断言是空转`);
  }

  const res = await api(`/api/projects/${projectId}/brand`, { method: 'DELETE', headers: auth(tokenA) });
  assert.equal(res.status, 200);

  const detail = await api(`/api/projects/${projectId}`, { headers: auth(tokenA) });
  for (const col of ['brandLogoImage', 'brandLogoSvg', 'brandLogoMode', 'brandName', 'brandTagline']) {
    assert.equal(detail.body.data.project[col], '', `${col} 要一起清掉`);
  }

  // 清空是不可逆的，要留得下痕迹，而且**认得出是「清品牌」而不是「删项目」**
  const { listAudit } = await import('@lumen/server-core');
  const { items } = listAudit({ tenantId, action: 'clear_brand', limit: 10 });
  assert.ok(items.length > 0, '清空品牌必须写审计');
  assert.match(items[0]!.target, new RegExp(projectId), '审计里要认得出清的是哪个项目');
});

/**
 * 三条路由都要挡住别人的项目。
 *
 * **这条守的是路由级那三行 `requireProject`。** 删掉它们三条路由**依然安全**
 * （`redrawLogo` / `clearBrand` / `updateProject` 内部各自还会 `requireProject` 一次），
 * 所以这是廉价的纵深防御——但正因如此，没有任何用例会在有人删掉那三行时变红。
 * 这条补上那个缺口。
 */
test('品牌三条路由都挡住别人的项目，并写 forbidden 审计', async () => {
  const me = await api('/api/me', { headers: auth(tokenB) });
  const tenantId = me.body.data.user.tenantId as string;
  const userId = me.body.data.user.userId as string;

  const attempts: [string, RequestInit][] = [
    [`/api/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify({ brandName: '偷改' }) }],
    [`/api/projects/${projectId}/brand/redraw`, {
      method: 'POST', body: JSON.stringify({ imageKey: `${tenantId}/${projectId}/uploads/x.png` }),
    }],
    [`/api/projects/${projectId}/brand`, { method: 'DELETE' }],
  ];
  for (const [path, init] of attempts) {
    const res = await api(path, { ...init, headers: auth(tokenB) });
    assert.equal(res.status, 403, `${init.method} ${path} 本该 403，实际 ${res.status}`);
    assert.equal(res.body.error?.code, 'FORBIDDEN');
  }

  const { listAudit } = await import('@lumen/server-core');
  const { items } = listAudit({ tenantId, userId, action: 'forbidden', limit: 10 });
  assert.ok(items.length >= 3, '三条越权都要留下 forbidden 审计');
});

/**
 * 封面端点：只回第 0 页。
 *
 * **不能把第 0 页塞进 `GET /projects`**：列表上每张卡片都要渲染一个 iframe，跟着列表一起发
 * 等于一次挂「项目总数」个 iframe。所以单独开一个端点，配前端的懒加载用。
 */
test('封面端点只回第 0 页，没有页面时回 null，别人的项目取不到', async () => {
  const created = await api('/api/projects', {
    method: 'POST', headers: auth(tokenA),
    body: JSON.stringify({ title: '封面端点用例', brief: BRIEF }),
  });
  const pid = created.body.data.projectId as string;

  // 前置条件：一页都没有
  const empty = await api(`/api/projects/${pid}/cover`, { headers: auth(tokenA) });
  assert.equal(empty.status, 200, JSON.stringify(empty.body));
  assert.equal(
    empty.body.data.page, null,
    '一页都没有时要回 null——前端靠它退回文字占位，回 404 或 {} 都会让那条分支写不出来',
  );

  // 落三页进去，端点必须只回第 0 页
  for (let i = 0; i < 3; i++) {
    const p = await api(`/api/projects/${pid}/pages`, {
      method: 'POST', headers: auth(tokenA), body: JSON.stringify({ pageType: 'text' }),
    });
    assert.equal(p.status, 201, JSON.stringify(p.body));
  }

  const one = await api(`/api/projects/${pid}/cover`, { headers: auth(tokenA) });
  assert.equal(one.status, 200);
  assert.ok(one.body.data.page, '有页面之后必须回一页');
  assert.equal(
    one.body.data.page.footer.pageNo, 1,
    '**要的是第 0 页**（页码从 1 起算，所以第 0 页的 pageNo 是 1）。回成别的页封面就不是封面了',
  );

  // 别人的项目：`requireProject` 抛的是 403，不是 404
  const denied = await api(`/api/projects/${pid}/cover`, { headers: auth(tokenB) });
  assert.equal(denied.status, 403, '不能读别人项目的封面');
  assert.equal(denied.body.error?.code, 'FORBIDDEN');
});

/**
 * 生成中删不掉项目，停下之后才删得掉。
 *
 * 生成链路是「先落库、再逐页推进」的，删除与它同时跑会删到一半又被写回几页，
 * 留下一个删除失败的项目。所以 `DELETE` 先问一句锁。这条用例直接持有那把锁，
 * 不真跑生成——真跑一次模型要等几十秒，挡住的也只是同一行判断。
 */
test('生成中不能删项目，停下来之后可以删', async () => {
  const created = await api('/api/projects', {
    method: 'POST', headers: auth(tokenA),
    body: JSON.stringify({ title: '生成中不可删', brief: BRIEF }),
  });
  const pid = created.body.data.projectId as string;

  const { acquireGeneration, releaseGeneration } = await import('@lumen/server-core');
  acquireGeneration(pid, '生成页面');
  try {
    const blocked = await api(`/api/projects/${pid}`, { method: 'DELETE', headers: auth(tokenA) });
    assert.equal(blocked.status, 409, '生成中删项目要被挡住');
    assert.equal(blocked.body.error?.code, 'CONFLICT');
    // 挡住之后项目必须原样还在——否则用户点一次删除就丢了一个跑到一半的项目
    assert.equal((await api(`/api/projects/${pid}`, { headers: auth(tokenA) })).status, 200);
  } finally {
    releaseGeneration(pid);
  }

  const after = await api(`/api/projects/${pid}`, { method: 'DELETE', headers: auth(tokenA) });
  assert.equal(after.status, 200, JSON.stringify(after.body));
  assert.equal((await api(`/api/projects/${pid}`, { headers: auth(tokenA) })).status, 404);
});
