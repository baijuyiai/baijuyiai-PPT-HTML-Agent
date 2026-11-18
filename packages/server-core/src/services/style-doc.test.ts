import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 环境必须在导入任何模块之前设定
const tmp = mkdtempSync(join(tmpdir(), 'lumen-doc-'));
process.env.NODE_ENV = 'test';
process.env.LUMEN_DB_PATH = join(tmp, 'test.db');
process.env.LUMEN_SECRET_KEY = 'test-secret-key-0123456789abcdefghijklmnop';

const { migrate } = await import('../db/migrate.js');
const { closeDb, run } = await import('../db/client.js');
const { ensureSeed } = await import('../services/seed.service.js');
const { createProject } = await import('../services/project.service.js');
const { createUser } = await import('../services/user.service.js');
const {
  deleteStyleDoc, hasAnyStyleDoc, listStyleDocs, resolveAnyStyle, resolveStyleDoc, saveStyleDoc,
  styleDocExists, styleRefExists,
} = await import('../services/style-doc.service.js');
const { ensureBuiltinStyles } = await import('../services/style.service.js');
const { StyleDoc } = await import('@lumen/ir-schema');

migrate();
ensureSeed();
ensureBuiltinStyles();

test.after(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

const PALETTE = {
  bg: '#EFE6DA', surface: '#F7F1E8', text: '#3A322B', muted: '#8A7F73',
  accent: '#E08A3C', brand: '#C7421A', border: '#D8CDBF',
};

const GOOD_PROMPT = [
  '角色：你是一个资深的前端工程师和视觉设计师。',
  '任务：请帮我用单文件（HTML + 内联 CSS）写一个封面模板。',
  '视觉与排版要求：',
  '1. 暖米纸色底，四角放极小说明文字。',
  '代码要求（非常重要）：',
  '1. 在 :root 中定义 CSS 变量。',
].join('\n');

function makeDoc(styleId: string, over: Record<string, unknown> = {}) {
  return StyleDoc.parse({
    styleId,
    version: '1.0',
    name: `风格 ${styleId}`,
    description: '一句话说明',
    palette: PALETTE,
    pagePrompts: {
      cover: { pageType: 'cover', prompt: GOOD_PROMPT, mockHtml: '<div>样机</div>', source: 'reference' },
      toc: { pageType: 'toc', prompt: GOOD_PROMPT, source: 'derived' },
    },
    ...over,
  });
}

test('存进去能取出来，页提示词与样机都在', () => {
  const saved = saveStyleDoc(makeDoc('doc-basic'));
  assert.equal(saved.ok, true, JSON.stringify(saved.issues));
  assert.equal(saved.styleId, 'doc-basic@1.0');

  const back = resolveStyleDoc('doc-basic@1.0');
  assert.equal(back.name, '风格 doc-basic');
  assert.equal(back.palette.accent, '#E08A3C');
  assert.equal(back.pagePrompts.cover!.prompt, GOOD_PROMPT);
  assert.equal(back.pagePrompts.cover!.mockHtml, '<div>样机</div>');
  assert.equal(back.pagePrompts.cover!.source, 'reference');
});

test('只给 styleId 也能取到（取最新版本）', () => {
  saveStyleDoc(makeDoc('doc-byid'));
  assert.equal(resolveStyleDoc('doc-byid').styleId, 'doc-byid');
});

test('提示词缺段只警告、不拒绝——为一条结构不全的提示词丢掉整轮识别不划算', () => {
  const partial = makeDoc('doc-partial', {
    pagePrompts: { cover: { pageType: 'cover', prompt: '角色：只有一个角色段。' } },
  });
  const saved = saveStyleDoc(partial);
  assert.equal(saved.ok, true, '结构不全仍应存得进去');
  assert.ok(saved.issues.some((i) => i.message.includes('任务')), '但要如实报出缺了哪段');
  assert.equal(styleDocExists('doc-partial@1.0'), true);
});

test('一条提示词都没有的包拒绝保存——那在库里就是个空壳', () => {
  const empty = makeDoc('doc-empty', { pagePrompts: {} });
  const saved = saveStyleDoc(empty);
  assert.equal(saved.ok, false);
  assert.equal(styleDocExists('doc-empty@1.0'), false);
});

test('列表只带前几张样机，不把九页全塞进去', () => {
  // 一页样机几 KB，九个页类型全带上会让列表接口变成几百 KB
  const many = makeDoc('doc-preview', {
    pagePrompts: Object.fromEntries(
      ['cover', 'toc', 'section', 'text', 'imageText'].map((t) => [
        t, { pageType: t, prompt: GOOD_PROMPT, mockHtml: `<div>${t}</div>` },
      ]),
    ),
  });
  saveStyleDoc(many);
  const row = listStyleDocs({ q: 'doc-preview' }).items[0]!;
  assert.equal(row.mockedCount, 5);
  assert.equal(row.previewHtml.length, 3, '预览只带三张');
  assert.equal(row.pageTypes.length, 5);
});

test('列表带上字体栈——样机渲染要用它', () => {
  saveStyleDoc(makeDoc('doc-font'));
  const row = listStyleDocs({ q: 'doc-font' }).items[0]!;
  assert.ok(row.fontFamily.includes('system-ui'));
});

test('没被项目引用时能删掉', () => {
  saveStyleDoc(makeDoc('doc-removable'));
  assert.equal(deleteStyleDoc('doc-removable@1.0').deleted, true);
  assert.equal(styleDocExists('doc-removable@1.0'), false);
});

test('被项目引用时拒绝删除，并说明有几个项目', () => {
  saveStyleDoc(makeDoc('doc-in-use'));
  // 建项目要先有用户：createProject 会走配额校验，配额挂在用户上
  const user = createUser({
    username: `u${Date.now()}${Math.floor(Math.random() * 1000)}`,
    password: 'abcd1234', role: 'user', source: 'self_signup',
  });
  const project = createProject({
    tenantId: user.tenantId, ownerId: user.userId, title: '占位项目',
    brief: '', audienceTag: 'general', scene: 'general',
  });
  run('UPDATE projects SET styleId = ? WHERE projectId = ?', 'doc-in-use@1.0', project.projectId);

  const r = deleteStyleDoc('doc-in-use@1.0');
  assert.equal(r.deleted, false);
  assert.match(r.reason, /1 个项目/);
  assert.equal(styleDocExists('doc-in-use@1.0'), true, '拒绝时不能真的删掉');
});

test('删不存在的风格如实报错', () => {
  assert.throws(() => deleteStyleDoc('no-such-doc@1.0'), /风格不存在/);
});

test('库里有没有风格要能问出来——库空着时生成必须显式报错而不是静默兜底', () => {
  assert.equal(hasAnyStyleDoc(), true);
});

/* ---------------- 两种风格并存时的取用 ---------------- */

test('项目指向风格文档时取到文档，指向旧风格包时取到包', () => {
  saveStyleDoc(makeDoc('doc-any'));
  const doc = resolveAnyStyle('doc-any@1.0');
  assert.equal(doc?.kind, 'doc');
  assert.equal(doc?.kind === 'doc' ? doc.doc.name : '', '风格 doc-any');

  // 内置风格包还在库里（旧项目仍在用），取用时不能被当成「不存在」
  const pack = resolveAnyStyle('business-classic@1.0');
  assert.equal(pack?.kind, 'pack', '旧风格包必须仍取得到，否则旧项目打不开');
});

test('两种都不是时返回 null 而不是抛错——项目详情靠它避免整个接口 500', () => {
  // 曾经就是这样挂的：项目表里存的是风格文档的 id，详情接口却只认旧风格包，
  // resolveStyle 一抛，GET /projects/:id 直接 500，工作台整个打不开
  assert.equal(resolveAnyStyle('no-such-thing@9.9'), null);
  assert.equal(resolveAnyStyle(null), null);
  assert.equal(resolveAnyStyle(undefined), null);
});

test('锁定风格前的存在性把关对两种都放行，对不存在的拦住', () => {
  assert.equal(styleRefExists('doc-any@1.0'), true);
  assert.equal(styleRefExists('business-classic@1.0'), true);
  assert.equal(styleRefExists('no-such-thing@9.9'), false);
});
