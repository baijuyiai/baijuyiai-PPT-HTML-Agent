import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 环境必须在导入任何模块之前设定
const tmp = mkdtempSync(join(tmpdir(), 'lumen-genhtml-'));
process.env.NODE_ENV = 'test';
process.env.LUMEN_DB_PATH = join(tmp, 'test.db');
process.env.LUMEN_SECRET_KEY = 'test-secret-key-0123456789abcdefghijklmnop';

const { migrate } = await import('../db/migrate.js');
const { closeDb, run, get } = await import('../db/client.js');
const { ensureSeed } = await import('./seed.service.js');
const { createUser } = await import('./user.service.js');
const { createProject, listPages, pageIR, savePage, savePageGroup, refreshProjectCounts, requireProject } = await import('./project.service.js');
const { saveStyleDoc, resolveStyleDoc } = await import('./style-doc.service.js');
const { runHtmlGeneration, generatePageHtml, regeneratePageHtml, generatePageHtmlAt } = await import('./generate-html.service.js');
const { MODEL_LIMITER } = await import('../lib/model-limiter.js');
const { requestStop, acquirePageGeneration, releasePageGeneration } = await import('../lib/generation-lock.js');
const { livePagesOf } = await import('../lib/generation-progress.js');
const { alignSources, readDeckMeta, saveOutline } = await import('./generate.service.js');
const { planOutline } = await import('./generate.service.js');
const { StyleDoc, IMAGE_LAYOUTS } = await import('@lumen/ir-schema');
const { MOCK_PLACEHOLDER_MARKER } = await import('@lumen/provider-gateway');

migrate();
ensureSeed();

test.after(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * 逐页生成 HTML。
 *
 * 全程用假网关：这里要验的是「提示词怎么选、产出的页面长什么样、不合规怎么收场」，
 * 不是模型本身。真调模型会让用例既慢又不确定，还会在没有 Key 的机器上直接失败。
 */

const PALETTE = {
  bg: '#EFE6DA', surface: '#F7F1E8', text: '#3A322B', muted: '#8A7F73',
  accent: '#E08A3C', brand: '#C7421A', border: '#D8CDBF',
};

const COVER_PROMPT = '角色：封面设计师。\n任务：写封面。\n视觉与排版要求：\n1. 大字标题。\n代码要求（非常重要）：\n1. 用 :root 定义变量。';
const TEXT_PROMPT = '角色：版式设计师。\n任务：写文字页。\n视觉与排版要求：\n1. 单栏。\n代码要求（非常重要）：\n1. 用 :root 定义变量。';
const PEOPLE_PROMPT = '角色：版式设计师。\n任务：写人物页。\n视觉与排版要求：\n1. 人像横排。\n代码要求（非常重要）：\n1. 用 :root 定义变量。';
const GALLERY_PROMPT = '角色：版式设计师。\n任务：写图片排版页。\n视觉与排版要求：\n1. 多张图铺开。\n代码要求（非常重要）：\n1. 用 :root 定义变量。';
const IMAGE_TEXT_PROMPT = '角色：版式设计师。\n任务：写图文页。\n视觉与排版要求：\n1. 一图一文。\n代码要求（非常重要）：\n1. 用 :root 定义变量。';
const CHART_PROMPT = '角色：数据可视化设计师。\n任务：写图表页。\n视觉与排版要求：\n1. 一个图表加一段结论。\n代码要求（非常重要）：\n1. 用 :root 定义变量。';

/** 一份合规的页面 HTML：配色全部走变量，且变量值与色板逐字对上 */
function goodHtml(title = '标题') {
  return [
    `<style>:root { --bg:${PALETTE.bg}; --text:${PALETTE.text}; --accent:${PALETTE.accent}; }`,
    '.slide { width: 1920px; height: 1080px; background: var(--bg); color: var(--text); }',
    '.title { font-size: 120px; color: var(--accent); }</style>',
    `<div class="slide"><h1 class="title">${title}</h1></div>`,
  ].join('');
}

/** 一份合规的图表页 HTML：带图表槽。`slot` 传空串就得到「模型自己用 CSS 画图」的那种 */
function chartHtml(slot = '<div class="plot" data-lumen-chart="1200x500">'
  + '{"kind":"bar","categories":["一","二"],"series":[{"name":"营收","values":[1,2]}]}</div>') {
  return [
    `<style>:root { --bg:${PALETTE.bg}; --text:${PALETTE.text}; --accent:${PALETTE.accent}; }`,
    '.slide { width: 1920px; height: 1080px; background: var(--bg); }',
    '.plot { position: absolute; left: 120px; top: 300px; width: 1200px; height: 500px; }</style>',
    `<div class="slide"><div class="title">各季度营收</div>${slot}</div>`,
  ].join('');
}

/** 把 --bg 写成深紫的页面：正是实测里模型跑偏的那一种 */
const WRONG_PALETTE_HTML = [
  '<style>:root { --bg:#0B0B10; --text:#FFFFFF; --accent:#8B5CF6; }',
  '.slide { background: var(--bg); color: var(--text); }</style>',
  '<div class="slide">内容</div>',
].join('');

interface TextRequest {
  system?: string;
  messages: { content: string }[];
  maxTokens?: number;
}

/** 假网关：按调用次序吐预设回复，并记下每次收到的请求供断言 */
function fakeGateway(replies: (string | Error)[], delayMs = 0, stepMs = 0) {
  const seen: TextRequest[] = [];
  let i = 0;
  return {
    seen,
    gateway: {
      async text(req: TextRequest) {
        seen.push(req);
        const idx = i;
        const r = replies[Math.min(i, replies.length - 1)];
        i += 1;
        /**
         * 默认不延迟。只有「两条流同时跑」那类用例需要它——
         * 瞬时返回时第一条流会在第二条起来之前就跑完，根本撞不上。
         *
         * `stepMs` 让**第 n 次调用再多等 n×stepMs**，把整本的落地时间摊开。
         * 页是并发跑的，只给一个统一的 `delayMs` 的话所有页会在同一瞬间一起落库，
         * 「第一页已落库」与「整本跑完放锁」几乎重合，想让「第二条流撞上锁」就只能赌时序
         * （实测会随前面用跑过多少条、限流器并发被抬到多高而时过时不过）。
         * 摊开之后窗口是宽的，跟机器快慢无关。
         */
        const wait = delayMs + idx * stepMs;
        if (wait > 0) await new Promise((res) => setTimeout(res, wait));
        if (r instanceof Error) throw r;
        return {
          text: r ?? '', providerId: 'fake', model: 'fake',
          usage: { inputTokens: 1, outputTokens: 1 },
          degraded: false, degradeReason: '', latencyMs: 1,
        };
      },
      async image() {
        throw new Error('本用例不生成图片');
      },
    },
  };
}

let seq = 0;
function makeDoc(over: Record<string, unknown> = {}) {
  seq += 1;
  const styleId = `genhtml-${seq}`;
  const doc = StyleDoc.parse({
    styleId,
    version: '1.0',
    name: `风格 ${seq}`,
    description: '一句话说明',
    palette: PALETTE,
    pagePrompts: {
      cover: { pageType: 'cover', prompt: COVER_PROMPT, mockHtml: '<div>样机</div>', source: 'reference' },
      text: { pageType: 'text', prompt: TEXT_PROMPT, mockHtml: '<div>样机</div>', source: 'derived' },
    },
    ...over,
  });
  const saved = saveStyleDoc(doc);
  assert.equal(saved.ok, true, JSON.stringify(saved.issues));
  return doc;
}

function makeProject() {
  const user = createUser({
    username: `u${Date.now()}${Math.floor(Math.random() * 100000)}`,
    password: 'abcd1234',
    role: 'user',
    source: 'self_signup',
  });
  return createProject({
    tenantId: user.tenantId,
    ownerId: user.userId,
    title: '增长战略',
    brief: [
      '1. 市场现状',
      '过去三年，企业级演示工具市场增长了 210%，在线协作类产品占比从 12% 提升到 34%。',
      '',
      '2. 我们的方案',
      '我们提供从想法到成品的全链路能力，首年目标覆盖 3000 家企业客户。',
    ].join('\n'),
  });
}

/* ---------------- 单页 ---------------- */

test('按页类型取到对应提示词，产出一页可用的 HTML', async () => {
  const doc = makeDoc();
  const project = makeProject();
  const { gateway, seen } = fakeGateway([goodHtml('增长战略')]);

  const r = await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: { pageType: 'cover', title: '增长战略', claim: '以产品力驱动', section: '', points: [] } as never,
    doc,
    pageIndex: 0,
    totalPages: 5,
    gateway: gateway as never,
  });

  assert.equal(r.page.status, 'ready');
  assert.equal(r.degradeReason, '');
  assert.equal(r.issues.filter((i) => i.severity === 'error').length, 0);
  assert.ok(r.page.html.includes('增长战略'), '模型给的 HTML 要原样留下');
  assert.equal(r.page.pageType, 'cover');
  // 提示词是封面的那条，不是文字页的
  assert.ok(seen[0]!.messages[0]!.content.includes(COVER_PROMPT));
  // 内容只给这一页的，不夹带整本大纲
  assert.ok(seen[0]!.messages[0]!.content.includes('以产品力驱动'));
});

test('风格没写这个页类型时退到文字页的提示词，并如实标出降级原因', async () => {
  const doc = makeDoc();
  const project = makeProject();
  const { gateway, seen } = fakeGateway([goodHtml('数据')]);

  const r = await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    // 这套风格只写了 cover 与 text
    outline: { pageType: 'chart', title: '数据', claim: '', section: '', points: [] } as never,
    doc,
    pageIndex: 2,
    totalPages: 5,
    gateway: gateway as never,
  });

  assert.equal(r.page.status, 'ready', '回落后仍应出得来');
  assert.ok(seen[0]!.messages[0]!.content.includes(TEXT_PROMPT), '应使用文字页的提示词');
  assert.ok(r.degradeReason.includes('chart'), `降级原因要点名页类型，实际：${r.degradeReason}`);
  assert.ok(r.degradeReason.includes('text'), `也要说明用的是哪一条，实际：${r.degradeReason}`);
  /*
    **降级时不该再塞图表骨架。** 一边让模型写文字页、一边给它一张图表页的版面，
    它会写出个四不像。骨架要跟着页类型一起降。
  */
  assert.ok(!seen[0]!.messages[0]!.content.includes('图表槽'), '降级后不该塞图表骨架');
});

/* ---------------- 图表页 ---------------- */

function chartDoc() {
  return makeDoc({
    pagePrompts: {
      cover: { pageType: 'cover', prompt: COVER_PROMPT, mockHtml: '<div>样机</div>', source: 'reference' },
      chart: { pageType: 'chart', prompt: CHART_PROMPT, mockHtml: '<div>样机</div>', source: 'derived' },
    },
  });
}

test('图表页带上版式库的候选，教案说的那种图排在最前', async () => {
  const project = makeProject();
  const { gateway, seen } = fakeGateway([chartHtml()]);

  const r = await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: {
      pageType: 'chart', title: '线索流转', claim: '', section: '', points: [],
      visualForm: '桑基图，看线索从官网、内容、活动到成交与流失的去向',
    } as never,
    doc: chartDoc(),
    pageIndex: 0,
    totalPages: 1,
    gateway: gateway as never,
  });

  const sent = seen[0]!.messages[0]!.content;
  assert.ok(sent.includes('这一页是图表页'));
  assert.ok(sent.includes('图表槽'), '要交代那块是图表槽');
  const names = [...sent.matchAll(/^【(.+?)】/gm)].map((m) => m[1]);
  assert.equal(names[0], '满宽桑基图', '教案已经说清了画什么，不该让模型再猜一次');
  assert.ok(names.length <= 4, '候选要封顶');
  assert.equal(r.page.status, 'ready');
});

test('图表页漏写图表槽会被打回重写，不会留下一页手搓的方块', async () => {
  const project = makeProject();
  // 第一次是模型自己用 CSS 画的（没有槽），第二次才老实留槽
  const { gateway, seen } = fakeGateway([chartHtml('<div class="plot">手搓的柱子</div>'), chartHtml()]);

  const r = await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: { pageType: 'chart', title: '各季度营收', claim: '', section: '', points: [], visualForm: '柱状图' } as never,
    doc: chartDoc(),
    pageIndex: 0,
    totalPages: 1,
    gateway: gateway as never,
  });

  assert.equal(seen.length, 2, '漏了槽应当带问题重写一次');
  assert.ok(seen[1]!.messages[0]!.content.includes('图表槽'), '重写时要把问题说清楚');
  assert.ok(r.page.html.includes('data-lumen-chart'), '最终留下的应是带槽的那一版');
  assert.ok(!r.page.html.includes('手搓的柱子'));
});

test('两次都不留图表槽时如实标出这一页没生成好', async () => {
  const project = makeProject();
  const { gateway } = fakeGateway([
    chartHtml('<div class="plot">手搓</div>'),
    chartHtml('<div class="plot">还是手搓</div>'),
  ]);

  const r = await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: { pageType: 'chart', title: 'T', claim: '', section: '', points: [], visualForm: '柱状图' } as never,
    doc: chartDoc(),
    pageIndex: 0,
    totalPages: 1,
    gateway: gateway as never,
  });

  assert.equal(r.page.status, 'failed');
  assert.ok(r.degradeReason.includes('图表槽'), r.degradeReason);
});

test('一条页类型提示词都没有时明确报错，而不是产出一页空白', async () => {
  const doc = makeDoc({
    pagePrompts: { cover: { pageType: 'cover', prompt: COVER_PROMPT, source: 'reference' } },
  });
  const project = makeProject();
  const { gateway } = fakeGateway([goodHtml()]);

  const r = await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: { pageType: 'text', title: 'T', claim: '', section: '', points: [] } as never,
    doc,
    pageIndex: 0,
    totalPages: 1,
    gateway: gateway as never,
  });

  assert.equal(r.page.status, 'failed');
  assert.ok(r.degradeReason.includes('text'), r.degradeReason);
  assert.equal(r.page.html, '');
});

test('配色跑偏时重写一次，改对了就用第二次的', async () => {
  const doc = makeDoc();
  const project = makeProject();
  const { gateway, seen } = fakeGateway([WRONG_PALETTE_HTML, goodHtml('增长战略')]);

  const r = await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: { pageType: 'cover', title: '增长战略', claim: '', section: '', points: [] } as never,
    doc,
    pageIndex: 0,
    totalPages: 1,
    gateway: gateway as never,
  });

  assert.equal(seen.length, 2, '第一版不合规应重写一次');
  assert.equal(r.page.status, 'ready');
  assert.equal(r.degradeReason, '');
  assert.ok(r.page.html.includes(PALETTE.bg), '应留下改对的那一版');
});

test('两次都跑偏时页面标为失败，并把问题写进降级原因', async () => {
  const doc = makeDoc();
  const project = makeProject();
  const { gateway } = fakeGateway([WRONG_PALETTE_HTML, WRONG_PALETTE_HTML]);

  const r = await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: { pageType: 'cover', title: '增长战略', claim: '', section: '', points: [] } as never,
    doc,
    pageIndex: 0,
    totalPages: 1,
    gateway: gateway as never,
  });

  assert.equal(r.page.status, 'failed');
  assert.ok(r.degradeReason.includes('不合规'), r.degradeReason);
  assert.ok(
    r.page.html.includes(PALETTE.bg) === false,
    '失败的那一版也落库，用户能看到模型到底写了什么',
  );
  assert.ok(r.page.html.length > 0);
});

test('模型报错时降级而不抛出——一页失败不该中断整本', async () => {
  const doc = makeDoc();
  const project = makeProject();
  const { gateway } = fakeGateway([new Error('连接超时')]);

  const r = await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: { pageType: 'cover', title: '增长战略', claim: '', section: '', points: [] } as never,
    doc,
    pageIndex: 0,
    totalPages: 1,
    gateway: gateway as never,
  });

  assert.equal(r.page.status, 'failed');
  assert.ok(r.degradeReason.includes('连接超时'), r.degradeReason);
});

/* ---------------- 整本 ---------------- */

test('整本生成：一页大纲一页，不拆页，页序与大纲一致', async () => {
  makeDoc();
  const project = makeProject();
  const { gateway } = fakeGateway([goodHtml()]);

  const events: string[] = [];
  let done: { total: number; succeeded: number; failed: number } | null = null;
  for await (const evt of runHtmlGeneration({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: gateway as never,
  })) {
    events.push(evt.event);
    if (evt.event === 'done') done = evt.data;
  }

  assert.ok(events.includes('style'), '应先报用了哪套风格');
  assert.ok(events.includes('outline'));
  assert.ok(done, '应发出 done');
  assert.equal(done!.failed, 0, '假网关每次都给合规 HTML，不应有失败页');
  assert.equal(done!.succeeded, done!.total);

  const pages = listPages(project.projectId);
  assert.equal(pages.length, done!.total, '页数应与大纲页数一致——新链路不拆页');
  for (const [i, row] of pages.entries()) {
    const page = pageIR(row);
    assert.equal(page.footer.pageNo, i + 1, '页码应连续');
    assert.ok(page.html.length > 0, '每页都要有 HTML');
  }
});

test('项目选定的风格被如实报出来，报出来的那套真的取得到', async () => {
  const doc = makeDoc();
  const project = makeProject();
  const { gateway } = fakeGateway([goodHtml()]);

  // 库里有多套风格，谁是「最新的」按毫秒排、同毫秒不分先后，
  // 所以这里直接钉死项目用哪一套，断言才稳定
  run('UPDATE projects SET styleId = ? WHERE projectId = ?', doc.styleId, project.projectId);

  let styleEvent: { styleId: string; styleName: string } | null = null;
  for await (const evt of runHtmlGeneration({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: gateway as never,
  })) {
    if (evt.event === 'style') styleEvent = evt.data;
  }

  // 不报出来的话，用户看到成品才知道用的不是自己想的那套
  assert.ok(styleEvent, '应发出 style 事件');
  assert.equal(styleEvent!.styleId, doc.styleId, '用哪套风格要如实报出来');
  assert.equal(styleEvent!.styleName, doc.name);
  assert.equal(resolveStyleDoc(styleEvent!.styleId).name, doc.name, '报出来的风格应真的取得到');
});

/* ---------------- 单页重生成 ---------------- */

test('重生成换掉 HTML 但页面 id 与位置不动', async () => {
  const doc = makeDoc();
  const project = makeProject();
  run('UPDATE projects SET styleId = ? WHERE projectId = ?', doc.styleId, project.projectId);

  for await (const _ of runHtmlGeneration({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: fakeGateway([goodHtml('第一版')]).gateway as never,
  })) { /* 只要落库 */ }

  const before = listPages(project.projectId);
  const target = before[1]!;
  const beforeNo = pageIR(target).footer.pageNo;

  const page = await regeneratePageHtml(
    target.pageId, project.tenantId, project.ownerId,
    fakeGateway([goodHtml('第二版')]).gateway as never,
  );

  assert.equal(page.pageId, target.pageId, '重生成要落回同一页');
  assert.ok(page.html.includes('第二版'), '内容应换成新一版');
  assert.equal(page.footer.pageNo, beforeNo, '位置不该动');

  const after = listPages(project.projectId);
  assert.equal(after.length, before.length, '重生成不该多出页面');
});

/**
 * **重生成也要带上这一页对应的需求原文。**
 *
 * 原先这条路径只给大纲的标题与要点，于是「重新生成这一页」会把用户写进需求里的
 * 细节全部丢掉——那一页只剩大纲那三行重新写一遍。整本生成与「优先生成本页」都带了
 * 原文，只有这里漏了。用户的原话：「用户提供的需求完善，需要尽量不遗漏」。
 *
 * 断言用的是 `alignSources` **自己算出来的那一段**，不是写死的字面量：
 * 写死的话，切段规则一改这条就变成假绿；只断言「有原文」这个标题更糟——
 * 把 `sourceText` 传成空串也能过。
 */
test('重生成带上这一页对应的需求原文', async () => {
  const doc = makeDoc();
  const project = makeProject();
  run('UPDATE projects SET styleId = ? WHERE projectId = ?', doc.styleId, project.projectId);

  for await (const _ of runHtmlGeneration({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: fakeGateway([goodHtml()]).gateway as never,
  })) { /* 只要落库 */ }

  const target = listPages(project.projectId)[1]!;
  const expected = alignSources(project.brief, readDeckMeta(project.projectId).outline ?? [], 'mixed')[1];
  assert.ok(expected, '前置条件：这一页该有对应的原文，否则下面的断言是空转');

  const { gateway, seen } = fakeGateway([goodHtml('新内容')]);
  await regeneratePageHtml(target.pageId, project.tenantId, project.ownerId, gateway as never);

  const sent = (seen[0]?.messages ?? []).map((m) => m.content).join('\n');
  assert.ok(sent.includes('这一页对应的原文'), '提示词里要有一段「对应的原文」');
  assert.ok(sent.includes(expected), '那一段原文要整段进提示词，不能只给标题和要点');
});

/**
 * 「换排版」挑的那份骨架要**记在页面上**。
 *
 * 挑骨架本来只进提示词（`forcedLayoutBlock`），而落库的 `layoutVariant` 在新链路里
 * 恒为空串——于是刷新之后、以及画布上那条生成动画要画「这一页将要长成的框架」时，
 * 谁都答不出这一页用的是哪份骨架。实测的表现就是：刚挑完骨架，生成动画画的还是
 * 风格样机（探针抓到的就是这一条）。
 *
 * 反向那一条同样重要：**普通重生成要把它清掉**——那时这一页用的是风格里绑定的那份，
 * 留着旧值就是在说一件不再成立的事。
 */
test('挑过的骨架记在页面上，普通重生成把它清掉', async () => {
  const doc = makeDoc();
  const project = makeProject();
  run('UPDATE projects SET styleId = ? WHERE projectId = ?', doc.styleId, project.projectId);
  for await (const _ of runHtmlGeneration({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: fakeGateway([goodHtml()]).gateway as never,
  })) { /* 只要落库 */ }

  const target = listPages(project.projectId)[1]!;
  const layout = {
    id: 'gallery/hero-title-stack@v1', name: '巨题压角配图', brief: '左侧巨题、右侧一张竖图',
    group: 'feature', slots: 1, source: 'builtin' as const,
    skeleton: '<style>.s{width:1920px;height:1080px;background:var(--bg)}</style>'
      + '<div class="s"><img data-lumen-image="1"></div>',
  };

  const withLayout = await regeneratePageHtml(
    target.pageId, project.tenantId, project.ownerId,
    fakeGateway([goodHtml('换过版面')]).gateway as never, undefined, layout as never,
  );
  assert.equal(withLayout.studioLayoutId, layout.id, '挑过的骨架要记在页面上');

  const plain = await regeneratePageHtml(
    target.pageId, project.tenantId, project.ownerId,
    fakeGateway([goodHtml('又重生成一次')]).gateway as never,
  );
  assert.equal(plain.studioLayoutId, '', '不带骨架的重生成要把它清掉');
});

test('重生成保留人工改过的讲稿', async () => {  const doc = makeDoc();
  const project = makeProject();
  run('UPDATE projects SET styleId = ? WHERE projectId = ?', doc.styleId, project.projectId);

  for await (const _ of runHtmlGeneration({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: fakeGateway([goodHtml()]).gateway as never,
  })) { /* 只要落库 */ }

  const target = listPages(project.projectId)[0]!;
  // 人工改过的讲稿带 edited 标记
  const edited = {
    ...pageIR(target),
    script: { cursorEnabled: false, text: '我自己写的逐字稿', segments: [], edited: true },
  };
  run('UPDATE pages SET ir = ? WHERE pageId = ?', JSON.stringify(edited), target.pageId);

  const page = await regeneratePageHtml(
    target.pageId, project.tenantId, project.ownerId,
    fakeGateway([goodHtml('新内容')]).gateway as never,
  );

  assert.equal(page.script.text, '我自己写的逐字稿', '重生成是为了换内容，不该顺手冲掉逐字稿');
});

/**
 * **重生成不能冲掉手动换过的图。**
 *
 * 用户在右栏图片面板上「换一张 / 加一张 / 删掉这个图位」，全落在 `page.overrides.images`。
 * 原先只有讲稿带得过去（`existingScript`），overrides 一律丢——用户选完图只要点一次
 * 「重跑这一页」，那页的图就被换回素材库自动配的那张。用户报的原话：
 * 「包括在独立页面有增加图片的，现在都没有了」。
 */
test('重生成保留手动换过的图', async () => {
  const doc = makeDoc();
  const project = makeProject();
  run('UPDATE projects SET styleId = ? WHERE projectId = ?', doc.styleId, project.projectId);

  for await (const _ of runHtmlGeneration({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: fakeGateway([goodHtml()]).gateway as never,
  })) { /* 只要落库 */ }

  const target = listPages(project.projectId)[1]!;
  const picked = {
    ...pageIR(target),
    overrides: { images: { '0': { src: '/stock/my-pick.jpg', cutout: false } }, fontScale: 0.9 },
  };
  run('UPDATE pages SET ir = ? WHERE pageId = ?', JSON.stringify(picked), target.pageId);

  const page = await regeneratePageHtml(
    target.pageId, project.tenantId, project.ownerId,
    fakeGateway([goodHtml('新内容')]).gateway as never,
  );

  assert.ok(page.html.includes('新内容'), '内容该照常换新');
  assert.deepEqual(
    (page.overrides as { images?: Record<string, unknown> }).images,
    { '0': { src: '/stock/my-pick.jpg', cutout: false } },
    '换过的图要跟着新内容活下来',
  );
  assert.equal(page.overrides['fontScale'], 0.9, '这一页的字号缩放也是手动改的，同样要留下');
});

test('重生成时新页面自己带出来的 overrides 不会反压用户的选择', async () => {
  const doc = makeDoc();
  const project = makeProject();
  run('UPDATE projects SET styleId = ? WHERE projectId = ?', doc.styleId, project.projectId);

  for await (const _ of runHtmlGeneration({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: fakeGateway([goodHtml()]).gateway as never,
  })) { /* 只要落库 */ }

  const target = listPages(project.projectId)[1]!;
  run(
    'UPDATE pages SET ir = ? WHERE pageId = ?',
    JSON.stringify({ ...pageIR(target), overrides: { images: { '0': { src: '/stock/mine.jpg' } } } }),
    target.pageId,
  );

  const page = await regeneratePageHtml(
    target.pageId, project.tenantId, project.ownerId,
    fakeGateway([goodHtml('新内容')]).gateway as never,
  );

  assert.equal(
    (page.overrides as { images: Record<string, { src: string }> }).images['0']!.src,
    '/stock/mine.jpg',
    '用户选的图优先于生成路径自己写的',
  );
  // 落盘的也必须是这一份——返回一个「没带上用户改动」的页面等于让界面以为没保存上
  const stored = pageIR(listPages(project.projectId).find((r) => r.pageId === target.pageId)!);
  assert.equal(
    (stored.overrides as { images: Record<string, { src: string }> }).images['0']!.src,
    '/stock/mine.jpg',
    '库里的那份也要带上用户的选择',
  );
});

/**
 * **目标格被别人的页占着时，保存要保住内容而不是报错。**
 *
 * 工作台保存时会把自己的格子号一起发上来（`RightRail` 的 `pageIndex: activeIndex`），
 * 而工作台的格子号是按大纲摆的、库里的 `pageIndex` 是按行摆的。两者一旦错开
 * （旧链路拆页留下的 `-r1` 续页就会造成错开），这一写就撞 `pages(projectId, pageIndex)`
 * 唯一索引：接口 500、界面弹「保存失败」，用户改的东西一刷新就没了。
 */
test('保存页面时目标格被占：保住内容，位置不动', () => {
  const doc = makeDoc();
  const project = makeProject();
  run('UPDATE projects SET styleId = ? WHERE projectId = ?', doc.styleId, project.projectId);

  const rows = [0, 1, 2].map((i) => ({
    pageId: `pg_slot${i}`,
    projectId: project.projectId,
    tenantId: project.tenantId,
    pageType: 'text' as const,
    layoutVariant: 'text/one-column@v1',
    title: { eyebrow: '', main: `第 ${i + 1} 页`, accentWords: [], sub: '' },
    blocks: [],
    footer: { source: '', pageNo: i + 1 },
    html: '<div></div>',
    status: 'ready' as const,
  }));
  savePageGroup(project.projectId, project.tenantId, rows as never, 0);

  const mine = listPages(project.projectId)[2]!;
  // 想把它挪到第 2 格——那一格已经有别人的页
  const saved = savePage(mine.projectId, project.tenantId, { ...pageIR(mine), html: '<p>改过的内容</p>' }, 1);

  assert.ok(saved, '保存不该失败');
  assert.equal(saved!.pageIndex, 2, '位置保持原样，不抢别人的格子');
  assert.ok(pageIR(saved!).html.includes('改过的内容'), '内容要落盘，这才是保存的目的');
});

/** 项目页数只数落在大纲格里的行——否则项目卡写「19 页」、工作台写「共 10 页」 */
test('项目页数只数大纲格里的行，超纲行不算', () => {
  const doc = makeDoc();
  const project = makeProject();
  run('UPDATE projects SET styleId = ? WHERE projectId = ?', doc.styleId, project.projectId);

  // 先让项目有一份大纲（这一步会落库），下面才有「大纲格」这个参照
  planOutline(project.projectId, project.tenantId);
  const outlineLen = (readDeckMeta(project.projectId).outline ?? []).length;
  assert.ok(outlineLen > 0, '前置条件：项目得有大纲');

  const rows = Array.from({ length: outlineLen + 3 }, (_, i) => ({
    pageId: `pg_over${i}`,
    projectId: project.projectId,
    tenantId: project.tenantId,
    pageType: 'text' as const,
    layoutVariant: 'text/one-column@v1',
    title: { eyebrow: '', main: `第 ${i + 1} 页`, accentWords: [], sub: '' },
    blocks: [],
    footer: { source: '', pageNo: i + 1 },
    html: '<div></div>',
    status: 'ready' as const,
  }));
  savePageGroup(project.projectId, project.tenantId, rows as never, 0);
  assert.equal(listPages(project.projectId).length, outlineLen + 3, '前置条件：库里确实有超纲行');

  refreshProjectCounts(project.projectId);
  const p = requireProject(project.projectId, project.tenantId);
  assert.equal(p.totalPages, outlineLen, '只数大纲格里的行');
  assert.equal(p.readyPages, outlineLen);
});

/* ---------------- 单页补生成 ---------------- */

test('按大纲序号补生成一页，插到该在的位置', async () => {
  const doc = makeDoc();
  const project = makeProject();
  run('UPDATE projects SET styleId = ? WHERE projectId = ?', doc.styleId, project.projectId);

  // 补生成要读已缓存的大纲，先把大纲规划出来
  const { outline } = planOutline(project.projectId, project.tenantId);
  assert.ok(outline.length >= 3, '这个 brief 应至少排出 3 页');

  // 先只生成第 0 页，再补第 1 页，看它是否插在第 0 页后面
  const first = await generatePageHtml({
    projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
    outline: outline[0]!, doc, pageIndex: 0, totalPages: outline.length,
    gateway: fakeGateway([goodHtml()]).gateway as never,
  });
  savePageGroup(project.projectId, project.tenantId, [first.page], 0, 0);

  const page = await generatePageHtmlAt(
    project.projectId, project.tenantId, project.ownerId, 1,
    fakeGateway([goodHtml('补的第 2 页')]).gateway as never,
  );

  const pages = listPages(project.projectId);
  assert.equal(pages.length, 2);
  assert.equal(pages[1]!.pageId, page.pageId, '补生成的第 2 页应排在第 1 页后面');
  assert.equal(pageIR(pages[1]!).footer.pageNo, 2, '页码应跟着位置重排');
});

/**
 * 往一本**已经有好几页**的书里补生成后面的某一页：新页插到它该在的位置，
 * **原来那几页一格都不许少**。
 *
 * 这条锁的是一个严重得多的事故：补生成的落点是 `savePageGroup` 按「这个位置之前
 * 已经有多少页」推出来的，而那个数算在 `await` 之前——等模型那几分钟里页表要是变了，
 * 落点就是过期的，新页会占掉别人的格子，而原来的那一页被挤出去、谁也点不到。
 * 用户看到的是「生成完一页，前面某页不见了」。
 */
test('往已有几页的书里补生成一页，原来的页一格不少', async () => {
  const doc = makeDoc();
  const project = makeProject();
  run('UPDATE projects SET styleId = ? WHERE projectId = ?', doc.styleId, project.projectId);
  const { outline } = planOutline(project.projectId, project.tenantId);
  assert.ok(outline.length >= 5, `这个 brief 应至少排出 5 页，实际 ${outline.length}`);

  // 先把前四页铺好，模拟「跑了一半的书」
  for (const i of [0, 1, 2, 3]) {
    const r = await generatePageHtml({
      projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
      outline: outline[i]!, doc, pageIndex: i, totalPages: outline.length,
      gateway: fakeGateway([goodHtml(`第 ${i + 1} 页`)]).gateway as never,
    });
    savePageGroup(project.projectId, project.tenantId, [r.page], i, i);
  }
  const beforeIds = listPages(project.projectId).map((r) => r.pageId);
  assert.equal(beforeIds.length, 4);

  const made = await generatePageHtmlAt(
    project.projectId, project.tenantId, project.ownerId, 4,
    fakeGateway([goodHtml('补的第 5 页')]).gateway as never,
  );

  const after = listPages(project.projectId);
  assert.equal(after.length, 5, '补一页之后该有五格');
  assert.deepEqual(after.map((r) => r.outlineIndex), [0, 1, 2, 3, 4], '每一页都该待在自己的大纲槽位上');
  for (const id of beforeIds) {
    assert.ok(after.some((r) => r.pageId === id), `原来的页 ${id} 不该消失`);
  }
  assert.equal(after[4]!.pageId, made.pageId, '新页落在第 5 格');
});

/**
 * 跑了一半的书要能补齐，不能被当成「已经生成过」。
 *
 * 这一条锁的是一个实测踩过的坑：生成中途断掉（进程重启 / 流被掐 / 人离开），
 * 库里留下「前几页全都 ready」。原先的早退判据只问「已有的页是不是全 ready」，
 * 这个条件在半本书上同样成立，于是再点生成会被拦在那里、报「已生成 N 页」
 * 然后什么都不做——那本书永远停在 N 页。用户看到的就是「卡住、点不动」。
 */
test('跑了一半的书再点生成，补的是缺的那几页，不是原地返回', async () => {
  makeDoc();
  const project = makeProject();

  // 先正常生成整本，拿到完整的大纲页数
  for await (const _ of runHtmlGeneration({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: fakeGateway([goodHtml()]).gateway as never,
  })) { /* 抽干 */ }

  const full = listPages(project.projectId);
  assert.ok(full.length >= 3, '这个 brief 应至少排出 3 页');

  // 模拟「跑到一半断了」：只留前两页，其余当作没生成过
  for (const row of full.slice(2)) {
    run('DELETE FROM pages WHERE pageId = ?', row.pageId);
  }
  assert.equal(listPages(project.projectId).length, 2, '前置条件：库里只剩两页');

  // 再点一次生成。缺的页必须补出来
  const events: string[] = [];
  let done: { total: number; succeeded: number; failed: number; skipped?: number } | null = null;
  for await (const evt of runHtmlGeneration({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: fakeGateway([goodHtml()]).gateway as never,
  })) {
    events.push(evt.event);
    if (evt.event === 'done') done = evt.data;
  }

  assert.ok(done, '应发出 done');
  assert.equal(
    listPages(project.projectId).length, full.length,
    '补齐后页数应回到大纲页数——半本书被当成「已生成」正是本次要修的缺陷',
  );
  assert.equal(done!.skipped, 2, '已有的两页不重做，应计入 skipped');
  assert.equal(done!.succeeded, full.length - 2, '只生成缺的那几页');
});

/**
 * 已经齐了的书不能被重复生成 —— 上面那条修完之后，这条是它的反面，
 * 保证「补齐」没有把「不重复花钱」这条一起改坏。
 */
test('已经生成齐的书再点生成，一页都不重做', async () => {
  makeDoc();
  const project = makeProject();

  for await (const _ of runHtmlGeneration({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: fakeGateway([goodHtml()]).gateway as never,
  })) { /* 抽干 */ }

  const before = listPages(project.projectId);
  const idsBefore = before.map((r) => r.pageId).join(',');

  let done: { succeeded: number; skipped?: number } | null = null;
  for await (const evt of runHtmlGeneration({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: fakeGateway([goodHtml()]).gateway as never,
  })) {
    if (evt.event === 'done') done = evt.data;
  }

  assert.equal(done!.succeeded ?? 0, 0, '齐了的书不该再调模型');
  assert.equal(listPages(project.projectId).map((r) => r.pageId).join(','), idsBefore, 'pageId 不该变——变了等于所有下游产物（图、讲稿、导出）全部作废');
});

/**
 * 同一个项目上不能有两条生成流同时在跑。
 *
 * 实测踩到的形态：用户在生成途中刷新页面（客户端的「生成中」是本地状态，刷新即清零），
 * 再点一次生成，于是同一个项目上跑起两条流。第二条流看到前几页已经 ready、跳过它们，
 * 直接落到当前这一页——**正好与第一条流撞在同一个大纲槽位上**。
 *
 * `savePageGroup` 按「插入位置」算 pageIndex，两个写入者各自读到同一份现状，
 * 后写的把先写的挤到下一格。实测库里留下的痕迹：
 *
 * ```
 * pageIndex=4 outlineIndex=4 [imageText]   ← 后写的
 * pageIndex=5 outlineIndex=4 [imageText]   ← 被挤下来的
 * pageIndex=6 outlineIndex=5 [metrics]
 * ```
 *
 * 于是出现**两条 outlineIndex 相同的页**，而缺的那个槽位永远是空的。页数对不上大纲，
 * `refreshProjectCounts` 就永远判不出 completed，项目卡在「生成中」出不来——
 * 界面上一页一页往下走，走到撞车那一页就不动了。
 */
test('同一个项目上两条生成流同时跑，页不会互相挤位', async () => {
  makeDoc();
  const project = makeProject();

  const run = () => (async () => {
    for await (const _ of runHtmlGeneration({
      projectId: project.projectId,
      tenantId: project.tenantId,
      userId: project.ownerId,
      // 每页 30ms，让两条流真正重叠——瞬时返回的话第一条会先跑完，撞不上
      gateway: fakeGateway([goodHtml()], 30).gateway as never,
    })) { /* 抽干 */ }
  })();

  // 第一条先跑起来，等它落下两页再起第二条——模拟「生成到一半刷新、再点一次」
  const first = run();
  for (let i = 0; i < 400 && listPages(project.projectId).length < 2; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  // 第二条被拒也是符合预期的收场，不该让这条用例挂在拒绝上
  const second = run().catch(() => undefined);
  await Promise.all([first, second]);

  const pages = listPages(project.projectId);
  const outlineIndices = pages.map((p) => p.outlineIndex);
  assert.equal(
    new Set(outlineIndices).size, outlineIndices.length,
    `同一个大纲槽位不该有两页，实际 outlineIndex = ${outlineIndices.join(',')}`,
  );
});

/**
 * 上一条只保证「不会挤位」，这一条保证**拒得明白、放得干净**。
 *
 * 放锁尤其要紧：生成权拿在生成器手里，跑完（或被关掉）没放回去的话，
 * 这个项目从此再也生成不了——比原来的挤位还糟。所以跑完之后必须还能再起一条。
 */
test('生成中再点一次会被明确拒掉，跑完之后还能接着生成', async () => {
  makeDoc();
  const project = makeProject();
  const opts = {
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
  };
  const drain = (delayMs = 0, stepMs = 0) => (async () => {
    for await (const _ of runHtmlGeneration({
      ...opts, gateway: fakeGateway([goodHtml()], delayMs, stepMs).gateway as never,
    })) { /* 抽干 */ }
  })();

  /**
   * 让每页的落地时间依次往后错开（第 n 页多等 n×60ms）。
   *
   * 页是并发跑的：只给统一的延迟，所有页会在同一瞬间一起落库，
   * 「第一页已落库」与「整本跑完放锁」几乎重合，第二条流就撞不上锁——
   * 这条用例会随「前面跑过多少条、限流器并发被抬到多高」时过时不过。
   * 错开之后，等到第一页落库时后面八页还都在天上，锁一定还在手里。
   */
  const first = drain(60, 60);
  for (let i = 0; i < 400 && listPages(project.projectId).length < 1; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }

  await assert.rejects(
    drain(),
    /正在生成中/,
    '第二条流要明确报「正在生成中」，而不是悄悄跑起来把页挤坏',
  );

  await first;

  // 锁没放回去的话这里会抛——那意味着这个项目以后再也生成不了了
  await drain();
});

/**
 * **一页卡住不能把整本拖死。**
 *
 * 实测现场：模型某一轮把 max_tokens 全花在推理上、正文空返回（日志原文是
 * 「模型只产出了 120444 字推理内容，正文为空」），网关按 maxRetries 重试三次、
 * 每次 300 秒，页级再重试两轮——一页最坏能跑一个小时。而落库严格按大纲顺序，
 * 于是其余页几分钟内就全跑完了却一页都出不来，界面在「已完成 0 页」上停几十分钟，
 * 用户看到的就是「卡死、一直在加载中」。
 *
 * 这里把预算压成毫秒级来验那条底线：**卡住的那页到点就落库成「没生成出来」，
 * 位置让给后面已完成的页，整本一定有 `done`。**
 */
test('一页卡死不影响整本：到预算就落库成失败，后面的页照样出', async () => {
  const doc = makeDoc();
  const project = makeProject();
  run('UPDATE projects SET styleId = ? WHERE projectId = ?', doc.styleId, project.projectId);
  const { outline } = planOutline(project.projectId, project.tenantId);
  assert.ok(outline.length >= 3, '这个 brief 应至少排出 3 页');

  /**
   * 第 1 次调用（就是第 0 页那一次）**永不落定**，其余立刻给出可用 HTML。
   *
   * 这正是实测那个失败的样子：请求挂着不回来。假网关不理会 `deadline`，
   * 所以这条同时钉住了「页面层自己那道 race 兜底」——光靠把 deadline 传下去，
   * 碰上不守约的实现就是一小时。
   */
  let call = 0;
  const stuck = {
    async text() {
      const mine = call++;
      if (mine === 0) return new Promise<never>(() => { /* 永不落定 */ });
      return {
        text: goodHtml(),
        providerId: 'fake',
        model: 'fake',
        usage: { inputTokens: 1, outputTokens: 1 },
        degraded: false,
        degradeReason: '',
        latencyMs: 1,
      };
    },
    async image() {
      throw new Error('本用例不生成图片');
    },
  };

  const events: { event: string; data: Record<string, unknown> }[] = [];
  for await (const evt of runHtmlGeneration({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: stuck as never,
    budgetMs: 250,
  })) {
    events.push(evt as never);
  }

  assert.ok(
    events.some((e) => e.event === 'done'),
    '整本必须有结局——不能永远转圈',
  );

  const failed = events.filter((e) => e.event === 'page-failed');
  assert.equal(failed.length, 1, '只有卡住的那一页失败');
  assert.equal(failed[0]!.data['index'], 0, '卡住的正是第 0 页');
  assert.match(
    String(failed[0]!.data['degradeReason'] ?? failed[0]!.data['error']),
    /等太久/,
    '失败原因要说清是等超时了，不能只报一句「失败」',
  );

  const ready = events.filter((e) => e.event === 'page-ready');
  assert.equal(ready.length, outline.length - 1, '其余页都要照常生成出来');

  // 而且真落了库，不是只发了个事件
  const rows = listPages(project.projectId);
  assert.equal(rows.length, outline.length);
  assert.equal(rows.filter((r) => r.status === 'ready').length, outline.length - 1);

  /**
   * 进度事件要排在结果之前。
   *
   * 并发时这一条是「看得见」的几乎全部来源：落库按大纲顺序，卡住那页会把后面的
   * 全压住，而进度不走那条路。顺序反过来的话，用户会先看到「第 3 页好了」、
   * 再冒出一句「第 3 页正在写」。
   */
  const firstProgress = events.findIndex((e) => e.event === 'page-progress');
  const firstReady = events.findIndex((e) => e.event === 'page-ready');
  assert.ok(firstProgress >= 0, '并发跑的时候必须有进度事件，否则界面只能干转圈');
  assert.ok(firstProgress < firstReady, '进度要排在结果之前');
});

/**
 * **落库严格按大纲升序推进，一页都不跳。**
 *
 * 这条钉的是一个**刻意的取舍**：卡住的那一页会挡住它后面的页，直到时间预算
 * 把它变成「没生成出来」为止（上一条用例验的就是这个让位）。看着不如
 * 「谁好了谁先出」漂亮，但那是唯一安全的写法——`savePageGroup` 按「这个位置
 * 之前已经有多少页」推算落点，跳号落库之后那一格终究要回填，而回填会把后面
 * 已落的页整段重排、挤错位（推演过的例子：已落 1@1、3@3 之后再落第 0 页，
 * 第 3 页会被挤到 2）。
 *
 * 所以「别挡路」这件事交给**时间预算**解，不去打乱落库顺序。
 */
test('落库严格按大纲升序推进，第 0 页没好之前一页都不先落', async () => {
  const doc = makeDoc();
  const project = makeProject();
  run('UPDATE projects SET styleId = ? WHERE projectId = ?', doc.styleId, project.projectId);
  const { outline } = planOutline(project.projectId, project.tenantId);
  assert.ok(outline.length >= 3, '这个 brief 应至少排出 3 页');

  // 第 0 页慢（但没到预算），其余页立刻回来
  let call = 0;
  const gateway = {
    async text() {
      const mine = call++;
      await new Promise((r) => setTimeout(r, mine === 0 ? 600 : 10));
      return {
        text: goodHtml(),
        providerId: 'fake',
        model: 'fake',
        usage: { inputTokens: 1, outputTokens: 1 },
        degraded: false,
        degradeReason: '',
        latencyMs: 1,
      };
    },
    async image() {
      throw new Error('本用例不生成图片');
    },
  };

  const events: { event: string; data: Record<string, unknown> }[] = [];
  for await (const evt of runHtmlGeneration({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: gateway as never,
    budgetMs: 10_000,
  })) {
    events.push(evt as never);
  }

  const order = events
    .filter((e) => e.event === 'page-ready' || e.event === 'page-failed')
    .map((e) => Number(e.data['index']));
  assert.deepEqual(
    order,
    [...order].sort((a, b) => a - b),
    '落库事件要严格按大纲下标升序，不能出现回填',
  );
  assert.equal(order[0], 0, '第 0 页没好之前，一页都不该先落');
  assert.equal(order.length, outline.length, '每一页都要有结局');
});

/**
 * **「停止」是显式的，不再靠断开连接。**
 *
 * 生成原先跟着连接走：客户端一断（刷新、关标签页、断网），服务端下一轮就 `break` 收手。
 * 那条口径是按「用户点了停止」想的，而断连最常见的来源其实是**刷新页面**——
 * 实测用户报的正是这个：刷新一下回来，生成停在半路，界面上关于「正在生成」的一切
 * 都没了，他既不知道是卡住了还是跑完了，也不知道停在哪一页。
 *
 * 所以现在断开不影响这一轮（由 `routes/projects.ts` 那段说明负责），想停只有
 * `requestStop` 这一条路。这条用例钉住「叫停之后真的收手、且不把项目卡死」。
 */
test('显式叫停之后这一轮收手，而且不把项目卡住', async () => {
  const doc = makeDoc();
  const project = makeProject();
  run('UPDATE projects SET styleId = ? WHERE projectId = ?', doc.styleId, project.projectId);
  const { outline } = planOutline(project.projectId, project.tenantId);
  assert.ok(outline.length >= 3, '这个 brief 应至少排出 3 页');

  const gateway = {
    async text() {
      await new Promise((r) => setTimeout(r, 300));
      return {
        text: goodHtml(),
        providerId: 'fake',
        model: 'fake',
        usage: { inputTokens: 1, outputTokens: 1 },
        degraded: false,
        degradeReason: '',
        latencyMs: 1,
      };
    },
    async image() {
      throw new Error('本用例不生成图片');
    },
  };

  const events: { event: string; data: Record<string, unknown> }[] = [];
  for await (const evt of runHtmlGeneration({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: gateway as never,
    budgetMs: 60_000,
  })) {
    events.push(evt as never);
    // 看到第一页在写就叫停——模拟用户按下「停止」
    if (evt.event === 'page-progress') requestStop(project.projectId);
  }

  assert.ok(events.some((e) => e.event === 'done'), '叫停也要有结局，不能悬着');

  /*
    锁必须放掉。不放的话这个项目**从此再也生成不了**，而用户完全看不出为什么——
    点「生成」只会收到一句「正在生成中」。这是叫停这条路最容易漏的一步。
  */
  await assert.doesNotReject(async () => {
    for await (const _ of runHtmlGeneration({
      projectId: project.projectId,
      tenantId: project.tenantId,
      userId: project.ownerId,
      gateway: fakeGateway([goodHtml()]).gateway as never,
    })) { /* 抽干 */ }
  });
});

/**
 * **「正在写哪几页」要登在进程里一份**，刷新之后界面才接得回来。
 *
 * 进度原先只走 SSE：推给当时那条连接，推完就没了。可生成现在不跟着连接走，
 * 用户刷新回来时后台还在跑，而界面上什么都不剩——他明明在花钱，屏幕上却是一片静止。
 * 所以这份登记要**问得到**，而且一轮结束要清干净：留着的话下一轮头几秒会显示
 * 上一轮的旧话，看着像「刚刚还在写第 7 页、怎么又从头开始了」。
 */
test('正在写哪几页问得到，一轮结束就清空', async () => {
  const doc = makeDoc();
  const project = makeProject();
  run('UPDATE projects SET styleId = ? WHERE projectId = ?', doc.styleId, project.projectId);
  planOutline(project.projectId, project.tenantId);

  const gateway = {
    async text() {
      await new Promise((r) => setTimeout(r, 120));
      return {
        text: goodHtml(),
        providerId: 'fake',
        model: 'fake',
        usage: { inputTokens: 1, outputTokens: 1 },
        degraded: false,
        degradeReason: '',
        latencyMs: 1,
      };
    },
    async image() {
      throw new Error('本用例不生成图片');
    },
  };

  const it = runHtmlGeneration({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: gateway as never,
    budgetMs: 60_000,
  })[Symbol.asyncIterator]();

  // 消费到第一条进度为止——那正是「刷新之后界面要接着显示」的那一刻
  let firstProgress: { index: number; label: string; startedAt: number } | null = null;
  for (;;) {
    const r = await it.next();
    if (r.done) break;
    if (r.value.event === 'page-progress') {
      firstProgress = r.value.data as { index: number; label: string; startedAt: number };
      break;
    }
  }

  const live = livePagesOf(project.projectId);
  assert.ok(live.length > 0, '跑到一半时该有在写的页');
  assert.ok(live[0]!.label.length > 0, '那一行要有话可说——界面直接把它摆在状态栏上');
  assert.equal(typeof live[0]!.at, 'number', '要有时刻，界面拿它算「已等 N 秒」');
  assert.equal(
    typeof live[0]!.startedAt, 'number',
    '还要有这一页的起点——生成中那块逐块点亮的画靠它算画到第几块',
  );
  assert.ok(live[0]!.startedAt <= live[0]!.at, '起点不晚于当前这句文案的开始时刻');
  assert.equal(
    firstProgress?.startedAt, live[0]!.startedAt,
    '进度事件要把它一起带上，否则刷新的那一刻界面算不出画到第几块',
  );

  for (;;) {
    const r = await it.next();
    if (r.done) break;
  }

  assert.equal(livePagesOf(project.projectId).length, 0, '一轮结束要清空');
});

/**
 * 同一页换一句文案时，**起点不动**。
 *
 * 「这一句是什么时候开始说的」和「这一页是从什么时候开始生成的」是两件事：
 * 前者换一次文案就刷新，后者整页只定一次。揭示层画到第几块要按后者算——
 * 拿前者当起点的话，模型每换一句进度话，画布上的那一页就从头重画一遍。
 */
test('同一页换一句进度文案时，起点不动', async () => {
  const { setLivePage, livePagesOf: read, clearLivePages } = await import('../lib/generation-progress.js');

  const first = setLivePage('prog1', 3, '正在调用模型写这一页');
  await new Promise((r) => setTimeout(r, 5));
  const second = setLivePage('prog1', 3, '上一版有不合规的地方，正在重写');

  assert.equal(second.label, '上一版有不合规的地方，正在重写');
  assert.equal(second.startedAt, first.startedAt, '起点要保住');
  assert.ok(second.at >= first.at, '「这一句说了多久」的时刻该往前走');
  assert.equal(read('prog1')[0]!.startedAt, first.startedAt);

  clearLivePages('prog1');
  assert.equal(read('prog1').length, 0, '清掉之后起点也一起没了，重新开始就重新计时');
});

/**
 * 逐页生成要并发，但**落库与吐事件仍按大纲顺序**。
 *
 * 实测单页模型调用 p50 76 秒，串行跑一本 9 页要十几分钟，用户盯着看就是「卡住了」。
 * 并发的是模型那一段；落库留在原地按顺序做——`savePageGroup` 是按位置排页的，
 * 并发写会各自读到同一份现状把彼此挤位。所以这两件事要一起钉住：
 * **同时在飞的调用数 > 1**，且**页序与事件序都还是大纲序**。
 *
 * 上限从 `MODEL_LIMITER.ceiling` 取，**不写死数字**：这个值调过一次（3 → 6），
 * 写死的话每次调都得回来改一遍测试，而它本来就不该关心具体是几。
 */
test('逐页生成是并发的，但落库与事件仍按大纲顺序', async () => {
  makeDoc();
  const project = makeProject();
  // 模块级那个限流器是跨用例共享的：前面哪条用例撞过限流的话，
  // 这里会从一个已经降过档的状态开始，峰值就测不准了
  MODEL_LIMITER.reset();

  let inFlight = 0;
  let peak = 0;
  const slowGateway = {
    async text() {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 40));
      inFlight -= 1;
      return {
        text: goodHtml(), providerId: 'fake', model: 'fake',
        usage: { inputTokens: 1, outputTokens: 1 },
        degraded: false, degradeReason: '', latencyMs: 1,
      };
    },
    async image() { throw new Error('本用例不生成图片'); },
  };

  const emitted: number[] = [];
  for await (const evt of runHtmlGeneration({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: slowGateway as never,
  })) {
    if (evt.event === 'page-ready') emitted.push(evt.data.index);
  }

  const pages = listPages(project.projectId);
  assert.ok(pages.length >= 2, '这个 brief 应至少排出 2 页，否则测不出并发');
  assert.ok(peak > 1, `应并发跑模型调用，实际同时最多只有 ${peak} 个`);
  assert.ok(
    peak <= MODEL_LIMITER.ceiling,
    `并发度不该超过上限 ${MODEL_LIMITER.ceiling}，实际 ${peak} 个`,
  );

  assert.deepEqual(
    pages.map((p) => p.outlineIndex),
    pages.map((_, i) => i),
    '落库顺序要按大纲，不能因为谁先跑完就先落库',
  );
  assert.deepEqual(
    emitted, [...emitted].sort((a, b) => a - b),
    '事件也要按大纲顺序吐，页序在界面上才不会乱',
  );
});

/* ---------------- 教案进不进提示词 ---------------- */

/**
 * 教案里的「视觉形式」要作为**明确要求**发下去，「设计说明」不要。
 *
 * 视觉形式是执行要求（配什么图、什么版式），模型照着做就行；
 * 设计说明是写给人看的「为什么这么排」，注进去只会稀释真正的要求——
 * 模型会把注意力分给一句它不需要执行的话。
 */
test('教案的视觉形式发给模型，设计说明不发给模型', async () => {
  const doc = makeDoc();
  const project = makeProject();
  const { gateway, seen } = fakeGateway([goodHtml()]);

  await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: {
      pageType: 'text',
      title: '市场现状',
      claim: '存量竞争加剧',
      section: '',
      points: ['市场增速从 210% 降到 18%'],
      visualForm: '左右分栏，左侧一张增长曲线图，右侧三条要点卡',
      designNote: '先让数字自己说话，再落到结论上',
    } as never,
    doc,
    pageIndex: 2,
    totalPages: 9,
    gateway: gateway as never,
  });

  const content = seen[0]!.messages[0]!.content;
  assert.ok(content.includes('视觉形式'), '视觉形式要作为明确要求发下去');
  assert.ok(content.includes('左右分栏'), '视觉形式的内容要带上');
  assert.ok(!content.includes('先让数字自己说话'), '设计说明是给人看的，不该发给模型');
});

test('还没有教案的页照常生成，只是不带视觉形式那一行', async () => {
  const doc = makeDoc();
  const project = makeProject();
  const { gateway, seen } = fakeGateway([goodHtml()]);

  const r = await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: {
      pageType: 'text', title: '市场现状', claim: '', section: '', points: [],
    } as never,
    doc,
    pageIndex: 0,
    totalPages: 1,
    gateway: gateway as never,
  });

  assert.equal(r.page.status, 'ready', '没有教案不该挡住生成');
  assert.ok(!seen[0]!.messages[0]!.content.includes('视觉形式'), '没填就别提这一项');
});

/* ---------------- 不是页面的回复不能当页面落库 ---------------- */

/**
 * 降级到内置 Mock 时拿到的是它的**占位说明文字**，不是一页 HTML。
 *
 * 这段文字过得了 `lintMockHtml`——没有色值、没有 script、没有外部资源，
 * 只差一条 `no-tokens` 的 warning，而 warning 不算阻断。不加判据它会被当成
 * 真页面落库、还标成 `ready`：界面上那一格看着是绿的，打开来是一段
 * 「本回复由内置 Mock 网关生成」。实测踩过，一个项目 15 页里有 3 页是这么来的。
 */
test('内置 Mock 的占位说明不会被当成页面，而是如实标失败', async () => {
  const doc = makeDoc();
  const project = makeProject();
  const { gateway } = fakeGateway([`${MOCK_PLACEHOLDER_MARKER}，用于在尚未接入真实模型时保持整条链路可用。`]);

  const r = await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: { pageType: 'text', title: '原因二', claim: '', section: '', points: [] } as never,
    doc,
    pageIndex: 0,
    totalPages: 1,
    gateway: gateway as never,
  });

  assert.equal(r.page.status, 'failed', '这不是一页，不能标成 ready');
  assert.ok(r.degradeReason.includes('Mock'), `降级原因要点名是 Mock，实际：${r.degradeReason}`);
  assert.ok(
    !r.page.html.includes(MOCK_PLACEHOLDER_MARKER),
    '那段占位说明一个字都不该落进页面',
  );
});

test('回了一段没有标签的散文也按失败处理', async () => {
  const doc = makeDoc();
  const project = makeProject();
  // 换供应商、换路由、模型抽风，都可能回一段纯文字
  const { gateway } = fakeGateway(['好的，这一页我建议用左右分栏的版式来排。']);

  const r = await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: { pageType: 'text', title: '结论一', claim: '', section: '', points: [] } as never,
    doc,
    pageIndex: 0,
    totalPages: 1,
    gateway: gateway as never,
  });

  assert.equal(r.page.status, 'failed');
  assert.ok(r.degradeReason.includes('HTML'), r.degradeReason);
});

/* ---------------- 计费 ---------------- */

const usageCount = () => get<{ n: number }>('SELECT COUNT(*) AS n FROM usage_records')!.n;

/**
 * 不传网关时要走**计费**网关。
 *
 * 这里原先回落到 `buildGateway()`，它不带 `onUsage`，于是所有没显式传网关的调用点
 * 都静默不记账——而没传网关的恰恰是最常用的两个入口：单页重生成与「优先生成本页」。
 * 实测踩过：一页重跑成功落库、`pages` 里躺着新内容，`usage_records` 里一条都没有。
 * 出页面是全链路最贵的一类调用，漏记不报错，只会让整类开销从账上消失。
 *
 * 用例不传 `gateway`，就是让服务用它自己的兜底网关。这台机器没配 Key，路由会落到
 * 内置 Mock——它给得出东西、也可能给不出，**两种收场都不重要**，
 * 要验的是这一次调用有没有记账。
 */
test('不传网关时也会记账，兜底网关不是不花钱的那个', async () => {
  const doc = makeDoc();
  const project = makeProject();
  const before = usageCount();

  await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: { pageType: 'cover', title: '增长战略', claim: '', section: '', points: [] } as never,
    doc,
    pageIndex: 0,
    totalPages: 5,
  }).catch(() => undefined);

  assert.ok(usageCount() > before, '兜底网关发出去的调用必须进 usage_records');
});



/* ---------------- 品牌提示词 ---------------- */

test('有品牌时，提示词给出槽位并要求不要自己画图形', async () => {
  const doc = makeDoc();
  const project = makeProject();
  const { gateway, seen } = fakeGateway([goodHtml()]);

  await generatePageHtml({
    projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
    outline: { pageType: 'cover', title: 'T', claim: '', section: '', points: [] } as never,
    doc, pageIndex: 0, totalPages: 1,
    gateway: gateway as never,
    // 三项都给上，才能一次验到三条槽位行
    brand: {
      svg: '<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>',
      name: '星图科技', tagline: '让数据说话',
    },
  });

  const sent = seen[0]!.messages[0]!.content;
  assert.ok(sent.includes('data-lumen-brand="logo"'), '要给出 logo 槽位');
  assert.ok(sent.includes('data-lumen-brand="name"'), '要给出品牌名槽位');
  assert.ok(sent.includes('data-lumen-brand="tagline"'), '要给出标语槽位');
  assert.match(sent, /不要自己画图形/, '要明说不要自己画');
});

/**
 * **没值的槽位一个字都不提。**
 *
 * `fillBrandSlots` 会把没有值的槽位元素整条删掉，所以让模型为一个「等下会被删掉」的元素
 * 留位置，等于让它按三格排版、最后只剩两格。这条钉住「只说有值的那些」。
 */
test('没填的槽位不出现在提示词里，免得模型为会被删掉的元素排版', async () => {
  const doc = makeDoc();
  const project = makeProject();
  const { gateway, seen } = fakeGateway([goodHtml()]);

  await generatePageHtml({
    projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
    outline: { pageType: 'cover', title: 'T', claim: '', section: '', points: [] } as never,
    doc, pageIndex: 0, totalPages: 1,
    gateway: gateway as never,
    // 只有名字：logo 与标语都没有
    brand: { name: '星图科技', tagline: '' },
  });

  const sent = seen[0]!.messages[0]!.content;
  assert.ok(sent.includes('data-lumen-brand="name"'), '有值的那个要给');
  assert.equal(sent.includes('data-lumen-brand="logo"'), false, '没 logo 就别提 logo 槽位');
  assert.equal(sent.includes('data-lumen-brand="tagline"'), false, '没标语就别提标语槽位');
});

test('没有品牌时提示词里一个字都不提', async () => {
  const doc = makeDoc();
  const project = makeProject();
  const { gateway, seen } = fakeGateway([goodHtml()]);

  await generatePageHtml({
    projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
    outline: { pageType: 'cover', title: 'T', claim: '', section: '', points: [] } as never,
    doc, pageIndex: 0, totalPages: 1,
    gateway: gateway as never,
  });

  assert.equal(/data-lumen-brand/.test(seen[0]!.messages[0]!.content), false, '没品牌就完全不该提，行为与改动前一致');
});

/**
 * **重试那一轮也要带品牌槽位。**
 *
 * `callModel` 有两个调用点：正常那次，与「上一版有这些问题，请重写」的重试那次。
 * 只给前一处传 `brand` 的话，重试稿的提示词里没有槽位、写出来的页面没有 `data-lumen-brand`；
 * 而「两次都不合规」时采用的**正是重试稿**（`generate-html.service.ts:134-137`），
 * 那一页的页眉就静默少掉品牌——看起来像模型偶尔不听话，其实是漏了一个实参。
 *
 * `WRONG_PALETTE_HTML` 就是用来逼出重试的（上面「配色跑偏时重写一次」那条用例用的也是它）。
 */
test('重试那一轮的提示词同样带品牌槽位', async () => {
  const doc = makeDoc();
  const project = makeProject();
  const { gateway, seen } = fakeGateway([WRONG_PALETTE_HTML, goodHtml()]);

  await generatePageHtml({
    projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
    outline: { pageType: 'cover', title: 'T', claim: '', section: '', points: [] } as never,
    doc, pageIndex: 0, totalPages: 1,
    gateway: gateway as never,
    brand: { svg: '<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>', name: '星图科技', tagline: '' },
  });

  assert.equal(seen.length, 2, '前置条件：确实走了重试');
  assert.ok(
    seen[1]!.messages[0]!.content.includes('data-lumen-brand="logo"'),
    '重试那一轮也必须给出槽位，否则重试稿会把页眉的品牌整块丢掉',
  );
});

/* ---------------- 品牌接线 ---------------- */

/**
 * **没品牌的项目，生成入口不许把品牌块拼进提示词。**
 *
 * 守的是接线时很容易犯的错：`brandOf` 现在永远返回一个 `BrandSlot`（渲染侧需要这样，
 * 清空品牌时才能把空壳槽位删掉），所以**不能**写 `brand: brandOf(project)`——
 * 那样没配品牌的项目也会拿到真值对象、品牌块被拼进去、模型在每页页眉留空槽位，
 * 等于把所有老项目的版式都改了。判断「有没有」要用 `hasBrand`。
 *
 * **断言 grep 品牌块自己的首行，不能只 grep `data-lumen-brand`**：`brandBlock` 只说有值的
 * 槽位，而空项目的 `brandOf` 给出的是 `{ name:'', tagline:'' }`——那种情况下块里一条
 * `data-lumen-brand` 都没有，只 grep 那个属性的断言会**在接线写错时照样绿**（实测）。
 */
test('没配品牌的项目，生成入口不会往提示词里塞品牌块', async () => {
  const project = makeProject();   // 五列全空
  // 这个入口读的是**已缓存**的大纲（`readDeckMeta`），而 `makeProject()` 只建项目、
  // 不建 deck。不先规划的话它会抛「大纲里没有第 1 页」——断言一个字都跑不到，
  // 于是这条用例在**任何**变异下都「红」，等于一次都没验到东西。
  planOutline(project.projectId, project.tenantId);
  const { gateway, seen } = fakeGateway([goodHtml()]);

  await generatePageHtmlAt(project.projectId, project.tenantId, project.ownerId, 0, gateway as never);

  const sent = seen[0]!.messages[0]!.content;
  assert.equal(sent.includes('这一本有品牌标识'), false, '没品牌就不该出现品牌块本身');
  assert.equal(sent.includes('data-lumen-brand'), false, '也不该出现任何槽位');
});

test('配了品牌的项目，生成入口会把品牌块拼进提示词', async () => {
  const project = makeProject();
  const { updateProject } = await import('./project.service.js');
  updateProject(project.projectId, project.tenantId, { brandName: '星图科技' });
  planOutline(project.projectId, project.tenantId);
  const { gateway, seen } = fakeGateway([goodHtml()]);

  await generatePageHtmlAt(project.projectId, project.tenantId, project.ownerId, 0, gateway as never);

  assert.ok(
    seen[0]!.messages[0]!.content.includes('data-lumen-brand="name"'),
    '配了品牌名就该给出名字槽位',
  );
});

/**
 * **三个入口都要接上品牌。**
 *
 * 三条路径各自调 `generatePageHtml`：整本的逐页循环、`regeneratePageHtmlInner`、
 * `generatePageHtmlAtInner`。**漏掉任何一处，那条路径生成的页面页眉就没有品牌。**
 * 实测过：只去掉整本那条的 `brand`，上面那两条用例**一条都不红**——它们只覆盖了
 * `generatePageHtmlAt`。所以下面两条各走一个入口，缺一不可。
 *
 * 前置条件三处不一样，别照抄：`runHtmlGeneration` **自己会** `planOutline`；
 * `regeneratePageHtml` 要一个**已存在的页面**，所以先跑一遍整本流。
 * 具体写法照文件里既有的整本/单页用例（`runHtmlGeneration` 有六处、`regeneratePageHtml` 两处）。
 */
test('整本生成那条路径也把品牌传下去', async () => {
  // 垫一套风格：`ensureStyleDoc` 在风格库为空时抛「风格库是空的」，
  // 那样这两条只跑自己时会挂——文件里既有的整本用例也是这么垫的
  makeDoc();
  const project = makeProject();
  const { updateProject } = await import('./project.service.js');
  updateProject(project.projectId, project.tenantId, { brandName: '星图科技' });
  const { gateway, seen } = fakeGateway([goodHtml(), goodHtml(), goodHtml(), goodHtml(), goodHtml()]);

  for await (const _ of runHtmlGeneration({
    projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
    gateway: gateway as never,
  })) { /* 事件不看，看的是发出去的提示词 */ }

  assert.ok(seen.length > 0, '前置条件：确实调了模型');
  for (const [i, req] of seen.entries()) {
    assert.ok(
      req.messages[0]!.content.includes('这一本有品牌标识'),
      `整本流第 ${i + 1} 页的提示词里要有品牌块`,
    );
  }
});

test('单页重生成那条路径也把品牌传下去', async () => {
  makeDoc();   // 同上：先垫一套风格
  const project = makeProject();
  const { updateProject, listPages } = await import('./project.service.js');
  const seed = fakeGateway([goodHtml(), goodHtml(), goodHtml(), goodHtml(), goodHtml()]);
  for await (const _ of runHtmlGeneration({
    projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
    gateway: seed.gateway as never,
  })) { /* 先造出页面来 */ }

  const pageId = listPages(project.projectId)[0]!.pageId;
  updateProject(project.projectId, project.tenantId, { brandName: '星图科技' });

  const { gateway, seen } = fakeGateway([goodHtml()]);
  await regeneratePageHtml(pageId, project.tenantId, project.ownerId, gateway as never);
  assert.ok(
    seen[0]!.messages[0]!.content.includes('这一本有品牌标识'),
    '单页重生成也要带品牌块',
  );
});

test('图文页与图片排版页都带上了版式候选，人物页带自己的，其余页类型不带', async () => {
  const doc = makeDoc({
    pagePrompts: {
      cover: { pageType: 'cover', prompt: COVER_PROMPT, mockHtml: '<div>样机</div>', source: 'reference' },
      text: { pageType: 'text', prompt: TEXT_PROMPT, mockHtml: '<div>样机</div>', source: 'derived' },
      people: { pageType: 'people', prompt: PEOPLE_PROMPT, mockHtml: '<div>样机</div>', source: 'derived' },
      gallery: { pageType: 'gallery', prompt: GALLERY_PROMPT, mockHtml: '<div>样机</div>', source: 'derived' },
      imageText: { pageType: 'imageText', prompt: IMAGE_TEXT_PROMPT, mockHtml: '<div>样机</div>', source: 'derived' },
    },
  });
  const project = makeProject();

  const people = fakeGateway([goodHtml('核心团队')]);
  await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: {
      pageType: 'people', title: '核心团队', claim: '四位创始人', section: '',
      points: ['甲', '乙', '丙', '丁'], visualForm: '',
    } as never,
    doc,
    pageIndex: 0,
    totalPages: 5,
    gateway: people.gateway as never,
  });
  const sent = people.seen[0]!.messages[0]!.content;
  assert.match(sent, /人物页有多种版式/, '人物页没带上版式说明——模型又回到每次自由发挥');
  assert.match(sent, /```html/, '版式说明里没有骨架示例');
  assert.match(sent, /data-lumen-cutout/, '骨架里没有抠图标记，人像位会被裁');

  const gallery = fakeGateway([goodHtml('产品一览')]);
  await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: {
      pageType: 'gallery', title: '产品一览', claim: '六个场景', section: '',
      points: ['甲', '乙', '丙', '丁', '戊', '己'], visualForm: '六张图排成网格',
    } as never,
    doc,
    pageIndex: 2,
    totalPages: 5,
    gateway: gallery.gateway as never,
  });
  const sentGallery = gallery.seen[0]!.messages[0]!.content;
  assert.match(sentGallery, /图片排版页有多种版式/, '图片排版页没带上版式说明——模型又回到每次自由发挥');
  assert.match(sentGallery, /```html/, '版式说明里没有骨架示例');
  assert.ok(
    !/data-lumen-cutout/.test(sentGallery),
    '多图骨架里带了抠图标记，图位会去人物池取人像',
  );
  assert.match(
    sentGallery, /版面结构以下面这份骨架为准/,
    '没有优先级声明——风格提示词里的版面分区会压过候选，版式库等于白注入',
  );
  assert.match(sent, /版面结构以下面这份骨架为准/, '人物页也应当拿到优先级声明');
  /*
    **优先级声明不能指名小节。** 早先写的是「风格提示词里的『版面分区 / 画面分区 /
    网格』那一节，按候选来」——而识别出来的风格提示词通篇是编号的「视觉与排版要求」，
    没有哪一节叫这个名字，那句话指不到任何东西。实测：图文页拿到四份单图位骨架，
    产出的 HTML 里一个图位都没有，整页照着风格提示词那套「左文字 52% + 右球体 +
    底部三栏卡」排了下来。判据只能按「描述的是什么」。
  */
  assert.ok(
    !/那一节/.test(sentGallery),
    '优先级声明指了具体小节名——识别出来的风格里没有这个名字，指不到任何东西',
  );

  /*
    **图文页也要拿到版式库。** 这条以前没测，而生成链路里写死的是 `=== 'gallery'`——
    于是图文页能手动「换排版」，从头生成时却拿不到版式库，而且没有任何报错。

    文案还得说对页类型：叫成「图片排版页」会让模型按「以图为主」取舍内容，
    而图文页是以文字为主的。
  */
  const imageText = fakeGateway([goodHtml('产品图文')]);
  await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: {
      pageType: 'imageText', title: '产品图文', claim: '一张配图', section: '',
      points: ['甲', '乙'], visualForm: '一张主图配一段说明',
    } as never,
    doc,
    pageIndex: 3,
    totalPages: 5,
    gateway: imageText.gateway as never,
  });
  const sentImageText = imageText.seen[0]!.messages[0]!.content;
  assert.match(sentImageText, /这一页是图文页/, '图文页没拿到版式说明——模型又回到每次自由发挥');
  assert.match(sentImageText, /```html/, '版式说明里没有骨架示例');
  assert.ok(
    !sentImageText.includes('图片排版页'),
    '图文页的提示词里写着「图片排版页」，模型会按「以图为主」取舍内容',
  );
  assert.ok(
    !/data-lumen-cutout/.test(sentImageText),
    '图文页走普通图池，骨架里不该有抠图标记',
  );

  const text = fakeGateway([goodHtml('正文')]);
  await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: { pageType: 'text', title: '正文', claim: '一段话', section: '', points: [] } as never,
    doc,
    pageIndex: 1,
    totalPages: 5,
    gateway: text.gateway as never,
  });
  assert.ok(
    !/人物页有多种版式|图片排版页有多种版式/.test(text.seen[0]!.messages[0]!.content),
    '别的页类型也带上了版式说明，白花提示词',
  );
});

test('图文页的教案没写张数时，候选兜到图文那一组，不兜到多图', async () => {
  /*
    实测踩到的：一页图文页的教案只有标题与主张（`points` 为空、`visualForm` 缺失），
    估不出张数。候选函数当时一律兜到多图组，于是提示词一边说「这一页是图文页」、
    一边给「九张照片墙」——自相矛盾的结果是模型整段骨架都不用，重新生成出来的
    版面一张图都没有，和没有版式库时一模一样。

    所以这里数的是骨架里的图位编号：图文那一组每份只有 1 个图位。
  */
  const doc = makeDoc({
    pagePrompts: {
      imageText: { pageType: 'imageText', prompt: IMAGE_TEXT_PROMPT, mockHtml: '<div>样机</div>', source: 'derived' },
    },
  });
  const project = makeProject();
  const g = fakeGateway([goodHtml('组织与节奏')]);
  await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: {
      pageType: 'imageText', title: '五、组织与节奏', claim: '组织与节奏', section: '',
      points: [], visualForm: '',
    } as never,
    doc,
    pageIndex: 6,
    totalPages: 10,
    gateway: g.gateway as never,
  });

  const sent = g.seen[0]!.messages[0]!.content;
  const slots = [...sent.matchAll(/data-lumen-image\s*=\s*["']?(\d+)/gi)].map((m) => Number(m[1]));
  assert.ok(slots.length > 0, '候选骨架没进提示词——图文页又回到每次自由发挥');
  for (const n of slots) {
    assert.equal(n, 1, `候选里出现了 ${n} 号图位的骨架，图文页排不下这么多张`);
  }
});

/* ---------------- 指定版式（工作台换排版） ---------------- */

/**
 * 用户手动挑了一份版式时，提示词里**只该有那一份**。
 *
 * 这条锁的是「换排版」真的换得动：如果 `forcedLayout` 只是拼在候选块后面，
 * 模型会从十几个候选里重新挑一个，用户挑的那份等于没生效，而**界面上看不出来**——
 * 页面确实重生成了一版新的，只是没按用户选的那份排。
 */
test('指定版式时只带那一份骨架，不再带候选组', async () => {
  const doc = makeDoc({
    pagePrompts: {
      gallery: { pageType: 'gallery', prompt: GALLERY_PROMPT, mockHtml: '<div>样机</div>', source: 'derived' },
    },
  });
  const project = makeProject();

  // 一段内置骨架里绝不会出现的结构，用来确认「只有它进去了」
  const skeleton = [
    '<style>.s{width:1920px;height:1080px;background:var(--bg)}</style>',
    '<div class="s" data-marker="unique-forced-9f3a">',
    '<img data-lumen-image="1"><img data-lumen-image="2">',
    '<img data-lumen-image="3"><img data-lumen-image="4">',
    '</div>',
  ].join('');

  const g = fakeGateway([goodHtml('产品一览')]);
  await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: {
      pageType: 'gallery', title: '产品一览', claim: '四个场景', section: '',
      points: ['甲', '乙', '丙', '丁'], visualForm: '四张图排成网格',
    } as never,
    doc,
    pageIndex: 0,
    totalPages: 5,
    gateway: g.gateway as never,
    forcedLayout: {
      id: 'gallery/custom-abc123-xy9z@v1', name: '四宫格等分', brief: '四张图等宽等高等分整页',
      group: 'grid', slots: 4, skeleton, source: 'user',
    },
  });

  const sent = g.seen[0]!.messages[0]!.content;
  assert.ok(sent.includes('unique-forced-9f3a'), '用户挑的那份骨架没进提示词');
  assert.ok(sent.includes('四宫格等分'), '没带名字，模型不知道自己在排哪一种');
  assert.match(sent, /不要另挑/, '没说清「就这一种」——模型会照候选那套自己再选一轮');
  assert.ok(
    !/图片排版页有多种版式/.test(sent),
    '候选块还在，模型会从候选里重新挑一个，用户挑的那份等于没生效',
  );
  // 骨架里的示例内容必须换掉：这条不因为「这次是用户手挑的」而放松
  assert.match(sent, /一个都不要照抄/, '没交代骨架里的示例内容要换成本页内容');
});

/**
 * 不传 `forcedLayout` 时行为**逐字不变**。
 *
 * 这条是给「改这一处别把整本生成带坏」兜底的：整本生成与「优先生成本页」都不传，
 * 它们走的必须还是候选筛选那条老路。
 */
test('不指定版式时，候选筛选那条路逐字不变', async () => {
  const doc = makeDoc({
    pagePrompts: {
      gallery: { pageType: 'gallery', prompt: GALLERY_PROMPT, mockHtml: '<div>样机</div>', source: 'derived' },
    },
  });
  const project = makeProject();
  const outline = {
    pageType: 'gallery', title: '产品一览', claim: '四个场景', section: '',
    points: ['甲', '乙', '丙', '丁'], visualForm: '四张图排成网格',
  };

  const g = fakeGateway([goodHtml('产品一览')]);
  await generatePageHtml({
    projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
    outline: outline as never, doc, pageIndex: 0, totalPages: 5, gateway: g.gateway as never,
  });
  const sent = g.seen[0]!.messages[0]!.content;
  assert.match(sent, /图片排版页有多种版式/, '不传 forcedLayout 时必须走候选筛选');
  assert.ok(!sent.includes('不要另挑'), '不该出现「指定版式」那套措辞');
});

/* ---------------- 默认版式（风格库「换版式」） ---------------- */

/**
 * 风格里给某一页类型**绑定**了骨架时，生成这一页只带那一份。
 *
 * 这条锁的是「换版式」真的落到了生成上。库里只存一个 id
 * （`StylePagePrompt.layoutId`），骨架由生成链路现查——若这一步没接上，
 * 那个 id 就只是个装饰：界面显示「已绑定」，生成出来还是模型自己挑的那一种，
 * 而**没有任何地方会报错**。
 */
test('风格里绑了版式时，生成这一页只带那一份骨架', async () => {
  const bound = IMAGE_LAYOUTS.find((l) => l.group === 'multi')!;
  const doc = makeDoc({
    pagePrompts: {
      gallery: {
        pageType: 'gallery', prompt: GALLERY_PROMPT, mockHtml: '<div>样机</div>',
        source: 'manual', edited: true, layoutId: bound.id,
      },
    },
  });
  const project = makeProject();

  const g = fakeGateway([goodHtml('产品一览')]);
  await generatePageHtml({
    projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
    outline: {
      pageType: 'gallery', title: '产品一览', claim: '四个场景', section: '',
      points: ['甲', '乙', '丙', '丁'], visualForm: '四张图排成网格',
    } as never,
    doc, pageIndex: 0, totalPages: 5, gateway: g.gateway as never,
  });

  const sent = g.seen[0]!.messages[0]!.content;
  assert.ok(sent.includes(bound.skeleton), `绑的那份骨架没进提示词（绑的是 ${bound.id}）`);
  assert.ok(sent.includes(bound.name), '没带名字，模型不知道自己在排哪一种');
  assert.match(sent, /不要另挑/, '没说清「就这一种」——模型会照候选那套自己再选一轮');
  assert.ok(
    !/图片排版页有多种版式/.test(sent),
    '候选块还在，模型会从候选里重新挑一个，绑定等于没生效',
  );
});

/**
 * 绑定认不出的 id（骨架被删了）时**退回自动候选**，不是把这一页卡住。
 *
 * 绑定的作用只是「别自动挑、就用这一份」。它失效了最该发生的是回到老路上，
 * 而不是这一页再也生成不出来——删一份骨架不该把用过它的风格全废掉。
 */
test('绑的骨架认不出时退回候选筛选，不报错', async () => {
  const doc = makeDoc({
    pagePrompts: {
      gallery: {
        pageType: 'gallery', prompt: GALLERY_PROMPT, mockHtml: '<div>样机</div>',
        source: 'manual', edited: true, layoutId: 'gallery/custom-gone-0000@v1',
      },
    },
  });
  const project = makeProject();

  const g = fakeGateway([goodHtml('产品一览')]);
  await generatePageHtml({
    projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
    outline: {
      pageType: 'gallery', title: '产品一览', claim: '四个场景', section: '',
      points: ['甲', '乙', '丙', '丁'], visualForm: '四张图排成网格',
    } as never,
    doc, pageIndex: 0, totalPages: 5, gateway: g.gateway as never,
  });

  assert.match(
    g.seen[0]!.messages[0]!.content,
    /图片排版页有多种版式/,
    '绑的骨架已经不在了，该退回候选筛选',
  );
});

/**
 * 工作台当场指定（`forcedLayout`）**压过**风格里的绑定。
 *
 * 两者是「就这一次换成这份」与「以后都按这份」的关系，前者更近、更明确。
 * 反过来让绑定压过它的话，工作台的「换排版」在绑过版式的风格上点了没反应。
 */
test('当场指定的版式压过风格里的绑定', async () => {
  const bound = IMAGE_LAYOUTS.find((l) => l.group === 'multi')!;
  const doc = makeDoc({
    pagePrompts: {
      gallery: {
        pageType: 'gallery', prompt: GALLERY_PROMPT, mockHtml: '<div>样机</div>',
        source: 'manual', edited: true, layoutId: bound.id,
      },
    },
  });
  const project = makeProject();

  const skeleton = [
    '<style>.s{width:1920px;height:1080px;background:var(--bg)}</style>',
    '<div class="s" data-marker="unique-this-time-4c81">',
    '<img data-lumen-image="1"><img data-lumen-image="2">',
    '</div>',
  ].join('');

  const g = fakeGateway([goodHtml('产品一览')]);
  await generatePageHtml({
    projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
    outline: {
      pageType: 'gallery', title: '产品一览', claim: '四个场景', section: '',
      points: ['甲', '乙'], visualForm: '两张图并排',
    } as never,
    doc, pageIndex: 0, totalPages: 5, gateway: g.gateway as never,
    forcedLayout: {
      id: 'gallery/custom-abc123-xy9z@v1', name: '双图并排', brief: '两张图左右等分',
      group: 'multi', slots: 2, skeleton, source: 'user',
    },
  });

  const sent = g.seen[0]!.messages[0]!.content;
  assert.ok(sent.includes('unique-this-time-4c81'), '当场指定那份没进提示词');
  assert.ok(!sent.includes(bound.skeleton), '风格里绑的那份也进去了，两份骨架打架');
});

/* ---------------- 从失败处续跑 ---------------- */

/**
 * 整本失败之后再点一次，**只重做失败的那些页，且原地覆盖**。
 *
 * 这条锁的是「失败页的 pageId 必须沿用」。不沿用的话 `savePageGroup` 认不出旧行、
 * 把它当邻居推到页组后面——重做 N 页就多出 N 行残页，全书页数翻倍，
 * 而那些残页不在大纲里、谁也点不到，永远补不掉。实测踩过：29 页的书续跑一轮变 39 页。
 */
test('整本失败后重新生成：原地覆盖失败页，页数不变、pageId 不变', async () => {
  makeDoc();
  const project = makeProject();

  // 第一轮：模型完全不可用。单页失败不中断整本，每一页都落一行 failed
  for await (const _ of runHtmlGeneration({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: fakeGateway([new Error('断网了')]).gateway as never,
  })) { /* 抽干 */ }

  const failed = listPages(project.projectId);
  assert.ok(failed.length >= 3, '这个 brief 应至少排出 3 页');
  assert.ok(failed.every((r) => r.status === 'failed'), '模型不可用时每一页都应该是 failed');
  const idsBefore = failed.map((r) => r.pageId);
  const noBefore = failed.map((r) => pageIR(r).footer.pageNo);

  // 第二轮：网络恢复，再点一次生成
  let done: { succeeded: number; failed: number; skipped?: number } | null = null;
  for await (const evt of runHtmlGeneration({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: fakeGateway([goodHtml()]).gateway as never,
  })) {
    if (evt.event === 'done') done = evt.data;
  }

  const after = listPages(project.projectId);
  assert.ok(done);
  assert.equal(after.length, failed.length, '续跑不该多出页——失败页是原地覆盖的');
  assert.equal(done!.succeeded, failed.length, '失败的那些页应该全都重做出来');
  assert.equal(done!.failed, 0);
  assert.deepEqual(after.map((r) => r.pageId), idsBefore, 'pageId 要沿用，否则旧行会被挤到页组后面');
  assert.deepEqual(after.map((r) => pageIR(r).footer.pageNo), noBefore, '位置与页码不该动');
  assert.ok(after.every((r) => r.status === 'ready'));
});

/** 只坏了一页时，续跑**只调一次模型**，其余页原样留着 */
test('只剩一页失败时，续跑只重做那一页，其余页不重复计费', async () => {
  makeDoc();
  const project = makeProject();

  for await (const _ of runHtmlGeneration({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: fakeGateway([goodHtml()]).gateway as never,
  })) { /* 抽干 */ }

  const rows = listPages(project.projectId);
  assert.ok(rows.length >= 3);
  // 模拟这一页这一轮没成
  run("UPDATE pages SET status = 'failed' WHERE pageId = ?", rows[1]!.pageId);

  const g = fakeGateway([goodHtml('重做的那一页')]);
  let done: { succeeded: number; failed: number; skipped?: number } | null = null;
  for await (const evt of runHtmlGeneration({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: g.gateway as never,
  })) {
    if (evt.event === 'done') done = evt.data;
  }

  const after = listPages(project.projectId);
  assert.ok(done);
  assert.equal(done!.skipped, rows.length - 1, '已经好的页不重做');
  assert.equal(done!.succeeded, 1, '只重做失败的那一页');
  assert.equal(g.seen.length, 1, '一页只该调一次模型——多调就是在重复计费');
  assert.equal(after.length, rows.length, '页数不该变');
  assert.equal(after[1]!.pageId, rows[1]!.pageId, '那一页仍是原来那一行');
  assert.equal(after[1]!.status, 'ready');
});

/* ---------------- 项目状态不再被一页失败钉死 ---------------- */

/**
 * 一页失败**不该把整本钉死在「生成中」**。
 *
 * 这是用户报的「第十页生成失败后就很难往下继续生成」的另一半：项目列表里那条
 * 进度条永远走不完，徽章一直写着「生成中」，用户以为还在跑，就一直等——
 * 而实际上活早就干完了，只剩那一页要单独重做。
 *
 * 终态判据是**有没有失败页**，不是「有没有成功页」：20 页好、1 页坏的那本标成
 * 「已完成」是在骗人——绿徽章让用户以为没事了，坏的那页就一直没人管。
 * 标 `failed` 时徽章写的是「失败 1 页」，正好说清还有几页要修。
 */
test('一页失败后项目进终态，不再卡在「生成中」', async () => {
  makeDoc();
  const project = makeProject();

  for await (const _ of runHtmlGeneration({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: fakeGateway([goodHtml()]).gateway as never,
  })) { /* 抽干 */ }

  const rows = listPages(project.projectId);
  assert.ok(rows.length >= 3);
  assert.equal(requireProject(project.projectId, project.tenantId).status, 'completed', '全成功就是已完成');

  // 模拟这一页这一轮没成（模型回了半截、lint 没过的那种）
  run("UPDATE pages SET status = 'failed' WHERE pageId = ?", rows[1]!.pageId);
  refreshProjectCounts(project.projectId);

  const p = requireProject(project.projectId, project.tenantId);
  assert.equal(p.status, 'failed', '有失败页就该进终态，不该再写「生成中」');
  assert.equal(p.failedPages, 1);
  assert.equal(p.readyPages, rows.length - 1);
});

/**
 * 反过来：**页还没落全时仍然是「生成中」**。
 *
 * 上面那条把「一页失败」从 `generating` 里摘出来了，但别把「跑了一半」也一起摘掉——
 * 那会让一本只生成了几页的书显示成终态，用户以为跑完了，剩下的页永远补不出来。
 */
test('页还没落全时项目仍是「生成中」，不能提前判终态', async () => {
  makeDoc();
  const project = makeProject();

  for await (const _ of runHtmlGeneration({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: fakeGateway([goodHtml()]).gateway as never,
  })) { /* 抽干 */ }

  const rows = listPages(project.projectId);
  assert.ok(rows.length >= 3);
  // 删掉最后一页：模拟跑到一半断了，大纲还有槽位没落库
  run('DELETE FROM pages WHERE pageId = ?', rows[rows.length - 1]!.pageId);
  refreshProjectCounts(project.projectId);

  const p = requireProject(project.projectId, project.tenantId);
  assert.equal(p.status, 'generating', '大纲没落全就还是生成中');
  assert.equal(p.totalPages, rows.length - 1);
});

/* ---------------- 模型空转要重试 ---------------- */

/**
 * 模型空转（回空正文 / 半截 HTML）是**随机的**，重试一次比直接判失败划算。
 *
 * 实测形态：同一页、同一提示词连着重跑两次，第一次回的是写到 `<style>…html,body`
 * 就断掉的半截 HTML，第二次推理把 max_tokens 全吃光、正文是空串。两次失败都不带
 * 任何「这一页有问题」的信息，纯粹是这一轮抽到了什么。
 */
test('模型第一次空转、第二次写出来：这一页应该成功，而不是判失败', async () => {
  const doc = makeDoc();
  const project = makeProject();
  const g = fakeGateway([new Error('模型只产出了 127656 字推理内容，正文为空'), goodHtml('重试出来的')]);

  const r = await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: { pageType: 'cover', title: '增长战略', claim: '', section: '', points: [] } as never,
    doc,
    pageIndex: 0,
    totalPages: 1,
    gateway: g.gateway as never,
  });

  assert.equal(r.page.status, 'ready', r.degradeReason);
  assert.equal(g.seen.length, 2, '第一次抛错后应该再调一次模型');
  assert.ok(r.page.html.includes('重试出来的'));
});

test('两次都空转才判失败，且原因里写明试过两次', async () => {
  const doc = makeDoc();
  const project = makeProject();
  const g = fakeGateway([new Error('正文为空')]);

  const r = await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: { pageType: 'cover', title: '增长战略', claim: '', section: '', points: [] } as never,
    doc,
    pageIndex: 0,
    totalPages: 1,
    gateway: g.gateway as never,
  });

  assert.equal(r.page.status, 'failed');
  assert.equal(g.seen.length, 2, '两次封顶——再多试只是继续烧时间和钱');
  assert.ok(r.degradeReason.includes('试了两次'), r.degradeReason);
});

/**
 * 重试**不该**把最坏情况的调用次数抬上去。
 *
 * 第一次就抛错的话，那次「不合规重写」根本没跑到；两条路各自封顶 2 次调用。
 * 这条用例盯着这个上界——哪天有人把重试改成三层嵌套，调用次数会翻倍而没人发现。
 */
test('一页最多调两次模型，无论失败发生在哪一步', async () => {
  const doc = makeDoc();
  const project = makeProject();
  // 每次都回不合规的 HTML：会走「不合规重写」那条路
  const bad = '<div style="color: #FF00FF">x</div>';
  const g = fakeGateway([bad]);

  const r = await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: { pageType: 'cover', title: '增长战略', claim: '', section: '', points: [] } as never,
    doc,
    pageIndex: 0,
    totalPages: 1,
    gateway: g.gateway as never,
  });

  assert.equal(g.seen.length, 2, '不合规那条路也是两次封顶');
  assert.equal(r.page.status, 'failed');
});

/**
 * 重试**不能原样再发一遍**——那只是再抽一次签。
 *
 * 「推理吃光预算」这个失败有明确对策：模型把预算花在推演版式上，就直说别推演。
 * 提示词里尺寸已经给全了，它不需要自己权衡。
 */
test('空转后的重试会换一种问法，明确叫模型别推演版式', async () => {
  const doc = makeDoc();
  const project = makeProject();
  const g = fakeGateway([
    new Error('模型只产出了 127656 字推理内容，正文为空，通常是 max_tokens 被推理耗尽'),
    goodHtml('这次写出来了'),
  ]);

  const r = await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: { pageType: 'cover', title: '增长战略', claim: '', section: '', points: [] } as never,
    doc,
    pageIndex: 0,
    totalPages: 1,
    gateway: g.gateway as never,
  });

  assert.equal(r.page.status, 'ready', r.degradeReason);
  const second = String(g.seen[1]?.messages[0]?.content ?? '');
  assert.match(second, /不要逐条推演尺寸/, '重试要明确叫模型别推演版式，否则等于原样重发');
});

test('别的原因失败时不塞这段提示——那段话只对「想太多」有用', async () => {
  const doc = makeDoc();
  const project = makeProject();
  const g = fakeGateway([new Error('连接超时'), goodHtml()]);

  await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: { pageType: 'cover', title: '增长战略', claim: '', section: '', points: [] } as never,
    doc,
    pageIndex: 0,
    totalPages: 1,
    gateway: g.gateway as never,
  });

  const second = String(g.seen[1]?.messages[0]?.content ?? '');
  assert.equal(/不要逐条推演尺寸/.test(second), false, '网络类失败与「想太多」无关，不该塞这段');
});

/**
 * 截断那一次的重写**必须叫模型写短些**——这是用户实测卡死的那一条。
 *
 * 原先这里漏了：`retryHint` 只认「正文为空」，而截断走的是**另一条路**——
 * lint 判不合规 → `produce` 里「带问题重写」，那条路的提示词只有一句
 * 「上一版有这些问题，请重写」，**没有任何「写短些」的意思**。模型于是照着同样的
 * 篇幅再写一遍、再截断一次，这一页永远出不来。用户报的
 * 「第十页生成失败后就很难往下继续生成」正是这个：那一页连着两次都回了一截没写完的 HTML。
 */
test('截断的那一次重写会明确叫模型写短些，不会原样再要一遍', async () => {
  const doc = makeDoc();
  const project = makeProject();
  // 第一版：样式表写完了、正文写到一半断掉（正是截断留下的形状）
  const truncated = [
    `<style>:root { --bg:${PALETTE.bg}; --text:${PALETTE.text}; --accent:${PALETTE.accent}; }`,
    '.slide { background: var(--bg); color: var(--text); }</style>',
    '<div class="slide"><h1 class="title">写到这里就断了',
  ].join('');
  const g = fakeGateway([truncated, goodHtml('这次写完了')]);

  const r = await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: { pageType: 'cover', title: '增长战略', claim: '', section: '', points: [] } as never,
    doc,
    pageIndex: 0,
    totalPages: 1,
    gateway: g.gateway as never,
  });

  assert.equal(g.seen.length, 2, '截断是不合规，走「带问题重写」那条路');
  assert.equal(r.page.status, 'ready', r.degradeReason);
  const second = String(g.seen[1]?.messages[0]?.content ?? '');
  assert.match(second, /写得短一些/, '要说清「比上一轮少写些」，否则模型会照同样篇幅再断一次');
  assert.match(second, /没有闭合/, '原始问题也要照常带上');
});

/* ---------------- 限流自适应 ---------------- */

/**
 * 整条降级链都因限流失败时，页面生成的并发要降档。
 *
 * 这是「并发调到 6」能安全上线的**前提**：往上调必然更容易撞限流，
 * 撞了如果不收手，就是一连串 429 加白跑的重试，反而比并发 3 更慢。
 * 网关那边没有任何限流配置（它是个薄封装），撞上才知道，所以全靠这一步兜住。
 */
test('整条降级链都因限流失败时，页面生成的并发降档', async () => {
  makeDoc();
  const project = makeProject();
  MODEL_LIMITER.reset();
  try {
    const { gateway } = fakeGateway([
      new Error('ALL_PROVIDERS_FAILED：任务 html_codegen 的全部 Provider 均失败；'
        + 'p1/m1：PROVIDER_ERROR 429 https://a.example.com'),
    ]);

    for await (const _ of runHtmlGeneration({
      projectId: project.projectId,
      tenantId: project.tenantId,
      userId: project.ownerId,
      gateway: gateway as never,
    })) { /* 跑完即可 */ }

    assert.equal(
      MODEL_LIMITER.current, MODEL_LIMITER.floor,
      `连着撞限流该一路降到地板 ${MODEL_LIMITER.floor}，实际 ${MODEL_LIMITER.current}`,
    );
  } finally {
    MODEL_LIMITER.reset();
  }
});

/**
 * 主模型 429、但降级到备用模型**成功了**——活还在往前走，不该按硬降处理。
 *
 * 这种记软降（退一档）。降太狠是白亏：降级链本来就是为了扛住主模型抖动，
 * 一抖动就把并发砍半，等于把降级链的作用抵消掉。
 */
test('主模型限流但降级成功，只退一档，不砍半', async () => {
  makeDoc();
  const project = makeProject();
  MODEL_LIMITER.reset();
  try {
    const before = MODEL_LIMITER.current;
    const degradedGateway = {
      async text() {
        return {
          text: goodHtml(), providerId: 'fake', model: 'fake',
          usage: { inputTokens: 1, outputTokens: 1 },
          degraded: true, degradeReason: 'p1/m1：PROVIDER_ERROR 429 https://a.example.com', latencyMs: 1,
        };
      },
      async image() { throw new Error('本用例不生成图片'); },
    };

    for await (const _ of runHtmlGeneration({
      projectId: project.projectId,
      tenantId: project.tenantId,
      userId: project.ownerId,
      gateway: degradedGateway as never,
    })) { /* 跑完即可 */ }

    assert.ok(MODEL_LIMITER.current < before, `该退档，实际还是 ${MODEL_LIMITER.current}`);
    assert.ok(
      MODEL_LIMITER.current >= MODEL_LIMITER.floor,
      '不该穿到地板以下',
    );
  } finally {
    MODEL_LIMITER.reset();
  }
});

test('一路顺利时不降档，也不越界', async () => {
  makeDoc();
  const project = makeProject();
  MODEL_LIMITER.reset();
  try {
    const { gateway } = fakeGateway([goodHtml()]);
    for await (const _ of runHtmlGeneration({
      projectId: project.projectId,
      tenantId: project.tenantId,
      userId: project.ownerId,
      gateway: gateway as never,
    })) { /* 跑完即可 */ }

    assert.equal(MODEL_LIMITER.current, MODEL_LIMITER.ceiling, '没撞限流就该保持在上限');
  } finally {
    MODEL_LIMITER.reset();
  }
});

/**
 * 下面是「手动单页与整本并存」这一组。
 *
 * 用户报的现场：整本生成到一半，某一页没出来，他对着那一页点重试——原先手动那条路
 * 跟整本抢同一把项目级锁，必然 409，而那正是他此刻最想点的一下。现在它们各拿各的：
 * 整本写全书、手动只写自己那一格，并且**整本这一轮不许盖掉手动那一版**。
 */

/** 抽干一条整本生成流。并发的用例里用得上，写成一处免得每处都抄一遍 */
const drainBatch = (opts: { projectId: string; tenantId: string; userId: string; gateway: unknown }) =>
  (async () => {
    const events: string[] = [];
    let done: { total: number; succeeded: number; failed: number; skipped?: number } | null = null;
    for await (const evt of runHtmlGeneration({
      projectId: opts.projectId,
      tenantId: opts.tenantId,
      userId: opts.userId,
      gateway: opts.gateway as never,
    })) {
      events.push(evt.event);
      if (evt.event === 'done') done = evt.data;
    }
    return { events, done };
  })();

test('整本跑着时对已出来的一页点重试：不再被整本的锁挡回去', async () => {
  makeDoc();
  const project = makeProject();
  const opts = { projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId };

  // 整本跑慢些，好让手动那一下挤进去（每页 60ms 起、逐页再多等 120ms）
  const batch = drainBatch({ ...opts, gateway: fakeGateway([goodHtml('整本版')], 60, 120).gateway });
  for (let i = 0; i < 600 && listPages(project.projectId).length < 1; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  const first = listPages(project.projectId)[0];
  assert.ok(first, '整本要先落下一页，手动那一下才有页可点');

  // 原先这里会抛「这个项目正在生成中（生成整本页面…）」
  const again = await regeneratePageHtml(
    first!.pageId, opts.tenantId, opts.userId,
    fakeGateway([goodHtml('重跑版')]).gateway as never,
  );
  assert.match(again.html, /重跑版/);

  await batch;

  const slots = listPages(project.projectId).map((r) => r.outlineIndex);
  assert.equal(
    new Set(slots).size, slots.length,
    `同一个大纲槽位不该有两页，实际 outlineIndex = ${slots.join(',')}`,
  );
});

test('整本跑着时可以单独补生成一页：手动那版赢，页表不被写坏', async () => {
  makeDoc();
  const project = makeProject();
  const opts = { projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId };

  const batch = drainBatch({ ...opts, gateway: fakeGateway([goodHtml('整本版')], 60, 120).gateway });
  for (let i = 0; i < 600 && listPages(project.projectId).length < 1; i++) {
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.ok((readDeckMeta(project.projectId).outline?.length ?? 0) >= 2, '这份用例要有一页以上大纲');

  const manual = await generatePageHtmlAt(
    opts.projectId, opts.tenantId, opts.userId, 1,
    fakeGateway([goodHtml('手动版')]).gateway as never,
  );
  assert.match(manual.html, /手动版/);

  const { done } = await batch;

  const rows = listPages(project.projectId);
  const slots = rows.map((r) => r.outlineIndex);
  assert.equal(
    new Set(slots).size, slots.length,
    `同一个大纲槽位不该有两页，实际 outlineIndex = ${slots.join(',')}`,
  );

  const slot1 = rows.find((r) => r.outlineIndex === 1);
  assert.ok(slot1, '第 2 页要落在它自己的槽位上');
  assert.match(pageIR(slot1!).html, /手动版/, '整本落得晚也不该把手动那版盖回旧的');
  assert.ok(
    (done?.skipped ?? 0) >= 1,
    '这一格既是手动要的，整本就不该再调一次模型，也不该把它算成自己的产出',
  );
});

test('补生成撞上已经填好的同一格：原地覆盖，不会多出一行', async () => {
  makeDoc();
  const project = makeProject();
  const opts = { projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId };

  await drainBatch({ ...opts, gateway: fakeGateway([goodHtml('第一版')]).gateway });

  const before = listPages(project.projectId);
  const target = before.find((r) => r.outlineIndex === 0);
  assert.ok(target, '第 1 页应该已经落库');

  const page = await generatePageHtmlAt(
    opts.projectId, opts.tenantId, opts.userId, 0,
    fakeGateway([goodHtml('第二版')]).gateway as never,
  );

  const after = listPages(project.projectId);
  assert.equal(after.length, before.length, '同一个槽位不该多出一行——那正是「页数对不上大纲」的成因');
  assert.equal(page.pageId, target!.pageId, '要沿用已有那一行的 pageId 原地覆盖');
  assert.match(pageIR(after.find((r) => r.outlineIndex === 0)!).html, /第二版/);
});

/**
 * 「整本让一格给它」。
 *
 * 手动那页不经过 `mapLimit`、也不排队，它一开就占掉一份模型配额。整本这边少开一路，
 * 天上的总额才是配额那么多——而**不是**总量没变、手动那页硬挤进去。
 *
 * 租约故意挂在**大纲里没有的槽位**上：这样整本该干的活仍是六页（不会因为让位而少干活），
 * 峰值只可能被 `bookSlots` 压下来，这条用例才真的在验让位本身。
 */
test('整本给正在跑的手动那几页让位：并发峰值不超过限流器档位', async () => {
  makeDoc();
  const project = makeProject();
  const opts = { projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId };

  saveOutline(project.projectId, project.tenantId, Array.from({ length: 6 }, (_, i) => ({
    index: i, pageType: 'text', claim: '一句话主张', title: `第 ${i + 1} 页`, points: [], section: '', notes: '',
  })));

  MODEL_LIMITER.reset();
  const ceiling = MODEL_LIMITER.current;
  let live = 0;
  let peak = 0;
  const gateway = {
    async text() {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 20));
      live -= 1;
      return {
        text: goodHtml(), providerId: 'fake', model: 'fake',
        usage: { inputTokens: 1, outputTokens: 1 },
        degraded: false, degradeReason: '', latencyMs: 1,
      };
    },
    async image() { throw new Error('本用例不生成图片'); },
  };

  // 假装用户点了两页重试：这两格的手动租约占着配额，整本该少开两路
  acquirePageGeneration(opts.projectId, 100, '重跑这一页');
  acquirePageGeneration(opts.projectId, 101, '重跑这一页');
  try {
    await drainBatch({ ...opts, gateway });
  } finally {
    releasePageGeneration(opts.projectId, 100);
    releasePageGeneration(opts.projectId, 101);
    MODEL_LIMITER.reset();
  }

  assert.ok(peak > 1, '该并发，不然这条用例什么也没验到');
  assert.ok(
    peak <= ceiling - 2,
    `让出两格之后峰值该在 ${ceiling - 2} 以内，实际 ${peak}（不让位的话会跑到 ${ceiling}）`,
  );
});
