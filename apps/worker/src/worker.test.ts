import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  migrate, openDatabase, setDbForTest, createQueueFor, ObsoleteSubjectError,
} from '@lumen/server-core';
import { getPage, pageIR, savePage, savePageGroup } from '@lumen/server-core';
import {
  createExport, createProject, createUser, exportById, saveStyleDoc, updateProject,
} from '@lumen/server-core';
import { PageIR, StyleDoc, TaskKind, type ImageBlock, type PageIR as Page } from '@lumen/ir-schema';
import { BUILTIN_STYLE_PACKS } from '@lumen/style-engine';
import type { ProviderGateway } from '@lumen/provider-gateway';
import type { LocalStorage } from '@lumen/storage';
import type { TaskRecord } from '@lumen/task-client';
import { createWorkerContext, type WorkerContext } from './context.js';
import { runWorker } from './index.js';
import { requireTaskPage } from './util.js';
import { HANDLERS } from './handlers/index.js';
import { exportHtml } from './handlers/export-html.js';
import { imageGenerate } from './handlers/image-generate.js';
import {
  buildScript, htmlTextBlocks, parseScriptDraft, resegment, scriptGenerate, scriptPrompt,
} from './handlers/script-generate.js';
import { assertPageCount, buildPrintHtml } from './handlers/export-pdf.js';
import {
  EXTRACT_TEXT_SCRIPT, LUMEN_LAYOUT, canvasPxToPt, cssColorToHex,
  defineLumenLayout, textBoxOptions, toBuffer,
} from './handlers/export-pptx.js';
import { CANVAS_HEIGHT, CANVAS_WIDTH, buildSelfContainedHtml, inlineFileUrls } from './render.js';
import { PNG_SIGNATURE, encodePlaceholderPng } from './png.js';

/**
 * worker 的集成测试：用真实 SQLite 内存库 + 真实队列，不 mock 队列。
 *
 * 覆盖范围见文件末尾说明；PDF / PPTX 的浏览器链路没有自动化覆盖。
 */

/** 独立的数据目录，避免测试写进仓库的 data/ */
const DATA_DIR = mkdtempSync(join(tmpdir(), 'lumen-worker-test-'));
process.env.LUMEN_DATA_DIR = DATA_DIR;

after(() => {
  rmSync(DATA_DIR, { recursive: true, force: true });
});

/** 每个用例一个全新的内存库 */
function freshDb() {
  const db = openDatabase(':memory:');
  setDbForTest(db);
  migrate();
  return db;
}

/** 造一条任务记录 */
function makeTask(partial: Partial<TaskRecord> & Pick<TaskRecord, 'tenantId' | 'kind'>): TaskRecord {
  const base: TaskRecord = {
    taskId: 'task-1',
    tenantId: partial.tenantId,
    projectId: null,
    pageId: null,
    kind: partial.kind,
    idemKey: 'idem-1',
    groupKey: `${partial.tenantId}/-`,
    payload: {},
    status: 'running',
    attempts: 1,
    maxAttempts: 3,
    leaseOwner: 'worker-test',
    leaseUntil: null,
    heartbeatAt: null,
    priority: 0,
    error: '',
    degradeReason: '',
    createdAt: 0,
    startedAt: 0,
    finishedAt: null,
  };
  return { ...base, ...partial };
}

/** 测试用的宽松页面输入：块只写关心的字段，其余由 PageIR.parse 补默认值 */
interface PageInput {
  pageId: string;
  pageType: Page['pageType'];
  layoutVariant: string;
  title?: { main: string; sub?: string; eyebrow?: string; accentWords?: string[] };
  blocks?: unknown[];
  /** 新链路的页面内容。有它的时候 `blocks` 是空的 */
  html?: string;
  footer?: { source?: string; pageNo?: number };
}

function page(input: PageInput): Page {
  return PageIR.parse({
    title: { main: '标题' },
    blocks: [],
    ...input,
  });
}

/* ---------------- 1. 上下文装配 ---------------- */

test('createWorkerContext 装配 queue/storage/gateway，storage 根目录指向 LUMEN_DATA_DIR/objects', () => {
  const db = freshDb();
  try {
    const ctx = createWorkerContext('worker-test');
    assert.equal(ctx.owner, 'worker-test');
    assert.equal(typeof ctx.queue.claim, 'function');
    assert.equal(typeof ctx.queue.heartbeat, 'function');
    assert.equal(typeof ctx.queue.complete, 'function');
    assert.equal(typeof ctx.storage.put, 'function');
    assert.equal(typeof ctx.gateway.text, 'function');
    assert.equal(typeof ctx.gateway.image, 'function');
    assert.equal((ctx.storage as LocalStorage).rootDir, join(DATA_DIR, 'objects'));
  } finally {
    db.close();
    setDbForTest(null);
  }
});

/* ---------------- 3. 目标已删除的任务应作废而不是失败 ---------------- */

test('页面已删除时任务作废为 succeeded，不进死信', async () => {
  const db = freshDb();
  try {
    const queue = createQueueFor('worker-test');
    queue.enqueue({
      tenantId: 'tn_a',
      projectId: 'prj_gone',
      kind: 'image_generate',
      idemKey: 'img:missing:0',
      payload: { pageId: 'pg_missing', blockId: 'b1', prompt: '一张抽象几何图' },
      maxAttempts: 2,
    });

    // 用真实 handler 跑一轮：image-generate 查不到页面会抛 ObsoleteSubjectError
    await runWorker({ owner: 'worker-test', maxIterations: 2, idleDelayMs: 1 });

    const task = queue.list({ tenantId: 'tn_a' }).items[0]!;
    assert.equal(task.status, 'succeeded', '目标已删除的任务不应记成失败');
    assert.match(task.degradeReason, /作废/, '应留下作废原因');
    assert.equal(task.attempts, 1, '不应重试');

    const dlq = queue.dlqList({ tenantId: 'tn_a' });
    assert.equal(dlq.total, 0, '不应进入死信队列');
  } finally {
    db.close();
    setDbForTest(null);
  }
});

test('requireTaskPage 在页面缺失时抛 ObsoleteSubjectError，便于执行循环区分失败与作废', () => {
  const db = freshDb();
  try {
    assert.throws(() => requireTaskPage('pg_missing', 'tn_a'), ObsoleteSubjectError);
  } finally {
    db.close();
    setDbForTest(null);
  }
});

/* ---------------- 4. 逐页讲稿 ---------------- */

test('script-generate 产出非空讲稿与递增分段锚点，并写回库', async () => {
  const db = freshDb();
  try {
    const ctx = createWorkerContext('worker-test');
    const ir = page({
      pageId: 'pg-script',
      pageType: 'metrics',
      layoutVariant: 'metrics/three-card@v1',
      title: { main: '经营指标回顾', sub: '本页说明三条核心指标', accentWords: [], eyebrow: '' },
      blocks: [
        { id: 'b1', type: 'bullets', items: ['收入结构保持均衡', '毛利水平稳中有升', '现金流覆盖两个季度'] },
        { id: 'm1', type: 'metric', value: '38%', label: '营业收入同比增长', trend: '+12pt', source: '', primary: true },
        { id: 'm2', type: 'metric', value: '92%', label: '客户续约率', trend: '+4pt', source: '', primary: false },
      ],
      footer: { source: '内部资料', pageNo: 3 },
    });
    // 建页走 savePageGroup；savePage 只负责写回已存在的页，不会新建。
    // 项目本身也得建：讲稿 handler 要读它的受众/场景来定措辞，还要找上一页
    const user = createUser({
      username: `script-${Date.now()}${Math.floor(Math.random() * 100000)}`,
      password: 'abcd1234',
      role: 'user',
      source: 'self_signup',
    });
    const project = createProject({
      tenantId: user.tenantId,
      ownerId: user.userId,
      title: '经营指标回顾',
      audienceTag: 'executive',
    });
    savePageGroup(project.projectId, user.tenantId, [ir], 0, 0);

    const task = makeTask({
      tenantId: user.tenantId, projectId: project.projectId, pageId: 'pg-script',
      kind: 'script_generate', payload: { pageId: 'pg-script' },
    });
    const result = await scriptGenerate(task, ctx);
    // 测试环境的路由指向内置 Mock，Mock 的兜底文案不能当成讲稿，必须退回规则版并写明原因
    assert.match(result.degradeReason ?? '', /未接入真实模型|规则版/);

    const saved = pageIR(getPage('pg-script', user.tenantId));
    assert.ok(saved.script.text.length > 0, '讲稿正文不能为空');
    assert.ok(saved.script.segments.length >= 2, '至少两段');
    assert.equal(saved.script.cursorEnabled, true);

    let previous = -1;
    for (const segment of saved.script.segments) {
      assert.ok(segment.t > previous, `t 必须严格递增：${segment.t} <= ${previous}`);
      previous = segment.t;
      assert.ok(segment.text.length > 0);
      assert.equal(segment.cursor, true);
      assert.ok(segment.anchor, '每段都要有锚点');
      const anchor = segment.anchor!;
      assert.ok(anchor.x >= 0 && anchor.x <= 1, `锚点 x 越界：${anchor.x}`);
      assert.ok(anchor.y >= 0 && anchor.y <= 1, `锚点 y 越界：${anchor.y}`);
      assert.ok(anchor.targetId.length > 0);
    }
    // 指标块应被锚到 metric-N 口径
    assert.ok(saved.script.segments.some((s) => s.anchor?.targetId === 'm1' || s.anchor?.targetId.startsWith('metric-')));
  } finally {
    db.close();
    setDbForTest(null);
  }
});

/** 建一个「内容全在 html 里」的项目，给讲稿的预算/兜底用例共用 */
function seedScriptProject(pageId: string) {
  const user = createUser({
    username: `s-${Date.now()}${Math.floor(Math.random() * 100000)}`,
    password: 'abcd1234', role: 'user', source: 'self_signup',
  });
  const project = createProject({
    tenantId: user.tenantId, ownerId: user.userId,
    title: '讲稿用例', audienceTag: 'executive',
  });
  savePageGroup(project.projectId, user.tenantId, [page({
    pageId, pageType: 'text', layoutVariant: 'text/one-column@v1',
    title: { main: '存量竞争加剧', sub: '', accentWords: [], eyebrow: '' },
    blocks: [],
    html: '<section><h1>存量竞争加剧</h1><p>市场增速从 210% 降到 18%。</p><p>增长逻辑正在重构。</p></section>',
  })], 0, 0);
  return { user, project };
}

/**
 * **实测踩到的**：maxTokens 给 2000 时，`deepseek-v4.1-flash` 每次要产出 3200~3400 字
 * 的 reasoning，预算被推理吃光、正文为空，网关抛错兜底到 Mock——整页讲稿退回规则版，
 * 变成页面文字的罗列。页面上字越多、要回的段数越多越容易踩，目录页最先暴露。
 */
test('讲稿的输出预算要留够推理，给 2000 会被 reasoning 吃光', async () => {
  const db = freshDb();
  try {
    const base = createWorkerContext('worker-test');
    const seen: number[] = [];
    const ctx: WorkerContext = {
      ...base,
      gateway: {
        text: async (req: { maxTokens?: number }) => {
          seen.push(req.maxTokens ?? 0);
          return {
            text: '{"segments":["第一段。","第二段。"]}',
            providerId: 'p-test', model: 'm',
            usage: { inputTokens: 1, outputTokens: 1 },
            degraded: false, degradeReason: '', latencyMs: 1,
          };
        },
        image: async () => { throw new Error('这条用例不该调图片'); },
      } as unknown as ProviderGateway,
    };
    const { user, project } = seedScriptProject('pg-budget');
    await scriptGenerate(makeTask({
      tenantId: user.tenantId, projectId: project.projectId, pageId: 'pg-budget',
      kind: 'script_generate', payload: { pageId: 'pg-budget' },
    }), ctx);

    assert.ok(seen.length > 0, '应该调过模型');
    assert.ok(seen[0]! >= 6000, `输出预算要给 reasoning 留够，实际只给了 ${seen[0]}`);
  } finally {
    db.close();
    setDbForTest(null);
  }
});

/**
 * 落到 Mock 有两种：压根没配真实模型，和配了但调用失败。
 * 原先一律报「未接入真实模型」，把真正的错因吞了——只能去翻 usage 表才知道是
 * max_tokens 被推理耗尽。这条守着「错因要带出来」。
 */
test('落到 Mock 时要把网关给的真实错因带出来', async () => {
  const db = freshDb();
  try {
    const base = createWorkerContext('worker-test');
    const ctx: WorkerContext = {
      ...base,
      gateway: {
        text: async () => ({
          text: '已收到script任务。本回复由内置 Mock 网关生成，用于在尚未接入真实模型时保持整条链路可用。',
          providerId: 'prv_mock', model: 'deepseek-v4',
          usage: { inputTokens: 0, outputTokens: 0 },
          degraded: true,
          degradeReason: '主模型 prv_xf7qfcw31u/deepseek-v4.1-flash 失败：模型只产出了 3258 字推理内容，正文为空',
          latencyMs: 1,
        }),
        image: async () => { throw new Error('这条用例不该调图片'); },
      } as unknown as ProviderGateway,
    };
    const { user, project } = seedScriptProject('pg-mockfall');
    const result = await scriptGenerate(makeTask({
      tenantId: user.tenantId, projectId: project.projectId, pageId: 'pg-mockfall',
      kind: 'script_generate', payload: { pageId: 'pg-mockfall' },
    }), ctx);

    assert.match(result.degradeReason ?? '', /推理内容|正文为空/,
      `网关的错因被吞了：${result.degradeReason}`);
  } finally {
    db.close();
    setDbForTest(null);
  }
});

/* ---------------- 3. 图片生成降级 ---------------- */
test('image-generate 降级：网关恒失败时写占位图并把块标记为 failed', async () => {
  const db = freshDb();
  try {
    const base = createWorkerContext('worker-test');
    const failingGateway = {
      text: async () => { throw new Error('provider down'); },
      image: async () => { throw new Error('provider down'); },
    } as unknown as ProviderGateway;
    const ctx: WorkerContext = { ...base, gateway: failingGateway };

    const ir = page({
      pageId: 'pg-img',
      pageType: 'imageText',
      layoutVariant: 'imageText/left-right@v1',
      title: { main: '结构示意', sub: '', accentWords: [], eyebrow: '' },
      blocks: [
        { id: 'b1', type: 'image', source: 'ai', src: '', prompt: '极简几何构成，不含任何文字', status: 'pending' },
        { id: 'b2', type: 'paragraph', text: '用一张图说明结构。' },
      ],
      footer: { source: '', pageNo: 1 },
    });
    // 建页走 savePageGroup；savePage 只负责写回已存在的页，不会新建
    savePageGroup('prj1', 't1', [ir], 0, 0);

    const task = makeTask({
      tenantId: 't1', projectId: 'prj1', pageId: 'pg-img', kind: 'image_generate',
      payload: { pageId: 'pg-img', blockId: 'b1', prompt: '极简几何构成，不含任何文字', size: '512x512', quality: 'low' },
    });

    const result = await imageGenerate(task, ctx);
    assert.equal(result.degradeReason, '图片生成失败，已降级占位图');

    const saved = pageIR(getPage('pg-img', 't1'));
    const image = saved.blocks.find((b): b is ImageBlock => b.type === 'image');
    assert.ok(image);
    assert.equal(image.status, 'failed');
    assert.ok(image.src.length > 0, '占位图 src 不能为空');
    assert.ok(image.src.startsWith('/files/'), 'src 应指向对象存储');
    assert.ok(image.placeholderReason.length > 0, '必须写明占位原因');
    assert.equal(image.prompt, '极简几何构成，不含任何文字', 'prompt 必须原样透传，不得改写');

    // 占位图确实落了盘，且是合法 PNG
    const key = image.src.replace('/files/', '');
    const buffer = await ctx.storage.get(key);
    assert.ok(buffer.subarray(0, 8).equals(PNG_SIGNATURE));
  } finally {
    db.close();
    setDbForTest(null);
  }
});

/* ---------------- 4. HTML 单文件导出 ---------------- */

test('export-html 产物是单文件：无外链、含全部页与翻页脚本与内联动效', async () => {
  const pack = BUILTIN_STYLE_PACKS.find((p) => p.styleId === 'business-classic');
  assert.ok(pack, '内置商务经典风格包必须存在');

  const pages: Page[] = [
    page({
      pageId: 'pg-a', pageType: 'cover', layoutVariant: 'cover/centered@v1',
      title: { main: '2026 年度业务汇报', sub: '以产品力驱动增长', accentWords: [], eyebrow: '' },
      blocks: [{ id: 'p1', type: 'paragraph', text: '把复杂问题拆成可执行的动作。' }],
      footer: { source: '', pageNo: 1 },
    }),
    page({
      pageId: 'pg-b', pageType: 'imageText', layoutVariant: 'imageText/left-right@v1',
      title: { main: '市场洞察', sub: '', accentWords: [], eyebrow: '' },
      blocks: [
        { id: 'b1', type: 'image', source: 'ai', src: '/files/t1/prj1/images/pg-b_b1.png', prompt: '几何', status: 'ready' },
        { id: 'b2', type: 'paragraph', text: '用一张图说明结构。' },
      ],
      footer: { source: '', pageNo: 2 },
    }),
    page({
      pageId: 'pg-c', pageType: 'metrics', layoutVariant: 'metrics/three-card@v1',
      title: { main: '经营结果', sub: '', accentWords: [], eyebrow: '' },
      blocks: [
        { id: 'm1', type: 'metric', value: '38%', label: '营收增长', primary: true },
        { id: 'm2', type: 'metric', value: '92%', label: '续约率', primary: false },
      ],
      footer: { source: '', pageNo: 3 },
    }),
  ];

  const readKeys: string[] = [];
  const html = await buildSelfContainedHtml({
    title: '季度汇报',
    pages,
    pack,
    readFile: async (key) => {
      readKeys.push(key);
      return encodePlaceholderPng(16, 16);
    },
  });

  assert.ok(!html.includes('http://'), '不得出现 http:// 外链');
  assert.ok(!html.includes('https://'), '不得出现 https:// 外链');
  assert.ok(!html.includes('<link rel="stylesheet"'), '不得引用外部样式表');
  assert.equal((html.match(/class="lumen-page"/g) ?? []).length, pages.length, '每页一个容器');
  assert.ok(html.includes('@keyframes lumen-fade'), '必须内联动效 keyframes');
  assert.ok(html.includes('ArrowRight'), '必须含键盘翻页');
  assert.ok(html.includes('touchstart'), '必须含触摸滑动翻页');
  assert.ok(html.includes('name="viewport"'), '必须含移动端 viewport');
  assert.ok(html.includes('lumen-pageNo'), '必须含页码');
  assert.ok(html.includes('data:image/png;base64,'), '图片必须内联为 data URL');
  assert.ok(!html.includes('/files/'), '不得残留 /files/ 引用');
  assert.deepEqual(readKeys, ['t1/prj1/images/pg-b_b1.png'], '只读取被引用的对象');
});

/* ---------------- 4b. 样机配图的内联 ---------------- */

test('导出把样机配图也内联掉——不然工作台里好看，发出去的成品全是破图', async () => {
  // 配图库的图在浏览器里走 `/stock/x.jpg`，但导出必须是单文件。
  // 漏掉这一路的话，只有导出产物会坏，而导出恰恰是用户唯一会发出去的东西
  const html = '<img src="/stock/abstract-1.jpg"><img src="/files/t1/prj1/a.png">';
  const out = await inlineFileUrls(html, async () => encodePlaceholderPng(4, 4));
  assert.ok(!out.includes('/stock/'), '不得残留 /stock/ 引用');
  assert.ok(!out.includes('/files/'), '不得残留 /files/ 引用');
  assert.equal((out.match(/data:image\//g) ?? []).length, 2, '两张图都要变成 data URL');
  assert.ok(out.includes('data:image/jpeg;base64,'), '配图是 jpg，MIME 要对');
});

test('配图文件读不到时兜底，不让整条导出挂掉', async () => {
  const out = await inlineFileUrls('<img src="/stock/no-such-file.jpg">', async () => {
    throw new Error('不该读对象存储');
  });
  assert.ok(!out.includes('/stock/'), '仍不得残留引用');
  assert.ok(out.includes('data:image/png;base64,'), '应退回占位图');
});

/* ---------------- 4b2. 自带字体的内联 ---------------- */

test('导出把自带字体也内联掉——不然换台机器打开就退回系统字体', async () => {
  /*
    这条不走注入的 `readFile`，而是读**仓库里真的那个字体文件**：
    字体路径是 `@lumen/ir-schema/node` 按 `import.meta.url` 算出来的，
    假造一个读文件函数反而验不到「路径算得对不对」——而那正是最容易错的一环。
  */
  const html = '@font-face{src:url("/fonts/montserrat-400.woff2") format("woff2")}';
  const out = await inlineFileUrls(html, async () => encodePlaceholderPng(4, 4));
  assert.ok(!out.includes('/fonts/'), '不得残留 /fonts/ 引用');
  assert.ok(out.includes('data:font/woff2;base64,'), '应变成字体的 data URL');
  // 真下到的 woff2 头部是 wOF2，转 base64 后是 d09GMg
  assert.ok(out.includes('d09GMg'), '内联的字节不像一个 woff2');
});

test('字体文件读不到时保留原地址，不换成占位图', async () => {
  /*
    字体没有「占位」这一说：换成一张占位图或空 data URL，那条 `src` 直接失效，
    连后面的系统字体都不试了——比留着原地址更糟。留着的话浏览器取不到就按字体栈往下落。
  */
  const out = await inlineFileUrls('<style>url("/fonts/no-such-font.woff2")</style>', async () => {
    throw new Error('不该读对象存储');
  });
  assert.ok(out.includes('/fonts/no-such-font.woff2'), '读不到时该原样留着');
  assert.ok(!out.includes('data:image/'), '不该被换成图片占位');
});

/* ---------------- 4c. 品牌接线：一条用例只钉住一层 ---------------- */

/**
 * **品牌这件事的覆盖边界**（逐处变异实测出来的，别以为「有一条品牌用例」就够了）。
 *
 * | 链路 | 去掉 `brand` 会转红吗 |
 * |---|---|
 * | `pageMarkup` 内部的 `...(brand ? { brand } : {})` | 会红（`render.test.ts`） |
 * | `slotValue('logo')` 的 data URL / 烘色 | 会红（`render.test.ts`） |
 * | `buildSelfContainedHtml` 转发 `input.brand` | 会红（下面这条用例钉住的） |
 * | `export-html` handler 里的 `brandOf(project)` | 会红（下面这条用例） |
 * | `buildPrintHtml` / `buildSinglePageHtml` 两处转发 | **故意不盖**（见下） |
 * | `export-pdf` / `export-pptx` handler 里的 `brandOf(project)` | **故意不盖**（见下） |
 * | web 侧 `HtmlMock` / `CenterCanvas` / `Present` / `Presenter` | 无测试可红（`apps/web` 只有 `step-progress.test.ts`） |
 *
 * 也就是：**HTML 这条链路（handler → 装配函数 → `pageMarkup`）三跳都钉住了；
 * PDF / PPTX 那两条链路四跳一个都没钉住。**
 *
 * `export-pdf` / `export-pptx` 两条链路为什么不盖：两个 handler 里
 * `createPlaywrightPdfRenderer()` / `createPlaywrightShotRenderer()` 都是**内联调用**，
 * 没有注入缝，要盖只能真起 Chromium（慢、CI 里脆）——而本文件开头就写着
 * 「PDF / PPTX 的浏览器链路没有自动化覆盖」，那是有意的取舍。
 * **这两条链路由 Task 9 的浏览器实测守着**（导出一份 PPTX 与 PDF，打开确认页眉里的 logo 在），
 * 不是没人管，是换了手段。
 *
 * 中间那两处转发（`buildPrintHtml` / `buildSinglePageHtml`）**盖起来其实很便宜**
 * （直接调装配函数、多传一个 `brand` 就行，不需要浏览器），之所以不盖，是因为它们
 * **离真正会漏的那一跳还差一层**：把这两处转发钉住，handler 里的 `brandOf(project)`
 * 仍然没被守，而「漏了接线」这个风险恰恰在 handler 那一层——只盖转发等于买了个
 * 覆盖率的错觉。要么两条链路一起盖（得起浏览器），要么就如实记着它们没盖。
 *
 * 另外注意 `render.test.ts` 里那条「导出稿里不许出现内联的 `<svg>`」是**安全边界**：
 * 内联进导出页的 SVG 过的是 HTML 解析器（`<desc>` 是集成点、`<img>`/`<meta>` 是跳出元素），
 * 一整类 payload 能借此落进成品。它确实会红，但**要挑对变异**：把 `slotValue('logo')`
 * 直接改回「返回内联 SVG」时，用例是在**它前面那条**（「logo 要以 data 图片形态进导出稿」）
 * 就红的，这一条根本轮不到执行。真正证明它有效的是「同时给出 data 图片**和**内联 SVG」
 * 那个变异——那时它以自己那句话转红。留着这两条不是重复：前者管「有没有变成图片」，
 * 后者管「有没有把稿内联进去」，是两道独立的闸。
 */

const BRAND_SVG = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="currentColor"/></svg>';

test('export-html 把项目的品牌传进产物——从 pageMarkup 到 handler 这一跳过去没人守', async () => {
  const db = freshDb();
  try {
    const ctx = createWorkerContext('worker-test');

    // 风格文档必须先落库。**这一步不是摆设**：`docForProject` 找不到就返回 null，
    // 而 `pageMarkup` 在 `doc` 为 null 时退回旧渲染路径——那条路根本不碰品牌槽位，
    // 用例会以「没有 logo」的方式**假通过**（或者说假失败，看断言写在哪一边）。
    const doc = StyleDoc.parse({
      styleId: 'export-brand-1', name: '导出品牌验证',
      palette: {
        bg: '#EFE6DA', surface: '#F7F1E8', text: '#3A322B', muted: '#8A7F73',
        accent: '#E08A3C', brand: '#C7421A', border: '#D8CDBF',
      },
      fontFamily: 'system-ui, sans-serif',
      // 至少一条非空提示词：`saveStyleDoc` 对「一条提示词都没有」的空壳是拒绝入库的
      pagePrompts: {
        cover: {
          pageType: 'cover', prompt: '封面页。布局要求：标题居中。', mockHtml: '<div>样机</div>',
          source: 'reference',
        },
      },
    });
    const saved = saveStyleDoc(doc);
    assert.equal(saved.ok, true, `风格文档要先落库：${JSON.stringify(saved.issues)}`);

    const user = createUser({
      username: `brand-export-${Date.now()}${Math.floor(Math.random() * 100000)}`,
      password: 'abcd1234',
      role: 'user',
      source: 'self_signup',
    });
    const project = createProject({
      tenantId: user.tenantId,
      ownerId: user.userId,
      title: '品牌导出',
    });
    // 配品牌：模式是 `redraw` 且稿非空，`brandOf` 才会把 `svg` 那一路带出来
    updateProject(project.projectId, project.tenantId, {
      styleId: saved.styleId,
      brandLogoSvg: BRAND_SVG,
      brandLogoMode: 'redraw',
      brandName: '星图科技',
    });

    savePageGroup(project.projectId, project.tenantId, [PageIR.parse({
      pageId: 'pg_brand', pageType: 'cover', layoutVariant: '',
      title: { main: '封面' }, blocks: [], footer: { source: '', pageNo: 1 },
      // 默认是 pending，而 `createExport` 要求全部页就绪
      status: 'ready',
      html: '<div class="brandbar">'
        + '<span class="brand-mark" data-lumen-brand="logo"></span>'
        + '<span data-lumen-brand="name"></span>'
        + '</div><h1>标题</h1>',
    })], 0, 0);

    const { exportId } = createExport(project.projectId, project.tenantId, 'html');
    await exportHtml(makeTask({
      tenantId: project.tenantId,
      projectId: project.projectId,
      kind: 'export_html',
      payload: { exportId },
    }), ctx);

    const job = exportById(exportId);
    assert.ok(job, '导出任务要还在库里');
    assert.equal(job.status, 'succeeded', job.error || '导出没成');

    const html = (await ctx.storage.get(job.artifactKey)).toString('utf8');
    assert.ok(html.includes('data:image/svg+xml;charset=utf-8,'), '页眉的 logo 要以 data 图片形态进产物');
    assert.ok(html.includes('星图科技'), '品牌名要进产物');
    assert.equal(html.includes('data-lumen-brand'), false, '槽位必须填掉，不能漏到成品里');
  } finally {
    db.close();
    setDbForTest(null);
  }
});

/* ---------------- 5. 占位 PNG 编码器 ---------------- */

test('占位 PNG 编码器：签名、IHDR/IEND 与尺寸正确', () => {
  const png = encodePlaceholderPng(96, 54);
  assert.ok(png.subarray(0, 8).equals(PNG_SIGNATURE), '必须以 PNG magic 开头');

  const types: string[] = [];
  let width = 0;
  let height = 0;
  let offset = 8;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('latin1', offset + 4, offset + 8);
    types.push(type);
    if (type === 'IHDR') {
      width = png.readUInt32BE(offset + 8);
      height = png.readUInt32BE(offset + 12);
    }
    offset += 12 + length;
  }

  assert.ok(types.includes('IHDR'));
  assert.ok(types.includes('IDAT'));
  assert.ok(types.includes('IEND'));
  assert.equal(width, 96);
  assert.equal(height, 54);
  assert.equal(offset, png.length, 'chunk 长度必须刚好铺满整个文件');
});

/* ---------------- 6. handler 覆盖度 ---------------- */

test('HANDLERS 覆盖 TaskKind 的全部 9 个取值', () => {
  const kinds = [...TaskKind.options];
  assert.equal(kinds.length, 9);
  assert.deepEqual(Object.keys(HANDLERS).sort(), [...kinds].sort());
  for (const kind of kinds) {
    assert.equal(typeof HANDLERS[kind], 'function', `${kind} 必须有 handler`);
  }
});

/* ---------------- 7. PDF / PPTX 的纯函数部分 ---------------- */

test('assertPageCount 页数一致时通过，不一致时抛出可读错误', () => {
  assert.doesNotThrow(() => assertPageCount(5, 5));
  assert.throws(() => assertPageCount(5, 4), /PDF 页数与 deck 不一致：期望 5 页，实际 4 页/);
});

test('buildPrintHtml 每页一个打印容器，并内联动效与图片', async () => {
  const pack = BUILTIN_STYLE_PACKS.find((p) => p.styleId === 'business-classic')!;
  const pages = [
    page({
      pageId: 'pg-1', pageType: 'text', layoutVariant: 'text/one-column@v1',
      title: { main: '第一页' },
      blocks: [{ id: 'p1', type: 'paragraph', text: '正文' }],
      footer: { pageNo: 1 },
    }),
    page({
      pageId: 'pg-2', pageType: 'imageText', layoutVariant: 'imageText/left-right@v1',
      title: { main: '第二页' },
      blocks: [{ id: 'b1', type: 'image', source: 'ai', src: '/files/t1/prj1/images/pg-2_b1.png', prompt: '几何', status: 'ready' }],
      footer: { pageNo: 2 },
    }),
  ];

  const html = await buildPrintHtml({
    title: '打印',
    pages,
    pack,
    readFile: async () => encodePlaceholderPng(8, 8),
  });

  assert.equal((html.match(/class="lumen-print-page"/g) ?? []).length, pages.length);
  assert.ok(html.includes('page-break-after: always'), '必须靠 CSS 分页');
  assert.ok(html.includes('@keyframes lumen-fade'), '必须内联动效');
  assert.ok(html.includes('data:image/png;base64,'));
  assert.ok(!html.includes('/files/'), '不得残留对象外链');
  assert.ok(!html.includes('http://') && !html.includes('https://'));
});

test('defineLumenLayout 注册 16:9 版式并启用', () => {
  const layouts: { name: string; width: number; height: number }[] = [];
  const stub = {
    layout: '',
    defineLayout(layout: { name: string; width: number; height: number }) {
      layouts.push(layout);
    },
    addSlide() {
      throw new Error('本用例不应调用 addSlide');
    },
    async write() {
      return new Uint8Array();
    },
  };

  defineLumenLayout(stub);

  assert.deepEqual(layouts, [{ name: 'LUMEN_16_9', width: 13.333, height: 7.5 }]);
  assert.equal(stub.layout, 'LUMEN_16_9');
  // 13.333 / 7.5 与 1920 / 1080 同比
  assert.ok(Math.abs(LUMEN_LAYOUT.width / LUMEN_LAYOUT.height - CANVAS_WIDTH / CANVAS_HEIGHT) < 0.001);
});

test('画布像素换算成磅：1920px 对应 13.333in 版式，1px 正好 0.5pt', () => {
  assert.equal(canvasPxToPt(CANVAS_WIDTH), LUMEN_LAYOUT.width * 72);
  assert.ok(Math.abs(canvasPxToPt(96) - 48) < 0.01, '96px 该是 48pt');
});

test('CSS 颜色转 RRGGBB：rgb / rgba / 三位 hex / 认不出来时的兜底', () => {
  assert.equal(cssColorToHex('rgb(17, 34, 51)'), '112233');
  // 带透明度的也按实色取——PPT 里文本框的透明由别的地方管，这里只取色
  assert.equal(cssColorToHex('rgba(255, 0, 128, 0.5)'), 'FF0080');
  assert.equal(cssColorToHex('#abc'), 'AABBCC');
  assert.equal(cssColorToHex('#1A2B3C'), '1A2B3C');
  // 认不出来不抛错：一个字色不对，不该让整份导出失败
  assert.equal(cssColorToHex('color(display-p3 1 0 0)'), '111111');
});

test('文本框落进版式内，且边距清零——浏览器那点 padding 已经算进 rect 了', () => {
  const opts = textBoxOptions({
    text: '标题', x: 0.25, y: 0.5, w: 0.5, h: 0.1,
    fontSize: 96, bold: true, color: 'rgb(0,0,0)', align: 'center', fontFace: 'Inter',
  });
  assert.ok(Math.abs(Number(opts.x) - LUMEN_LAYOUT.width * 0.25) < 0.001);
  assert.ok(Math.abs(Number(opts.y) - LUMEN_LAYOUT.height * 0.5) < 0.001);
  assert.ok(Number(opts.w) >= LUMEN_LAYOUT.width * 0.5, '宽要留一点余量，否则 PowerPoint 会折出框外');
  assert.equal(opts.fontSize, 48);
  assert.equal(opts.bold, true);
  assert.equal(opts.align, 'center');
  assert.equal(opts.margin, 0);
  assert.equal(opts.valign, 'top');
  // 框必须落在版式内（宽留了余量，所以右边不校验，左边与上边要）
  assert.ok(Number(opts.x) >= 0 && Number(opts.y) >= 0);
});

/**
 * 极小的 DOM 替身，只够跑抽取脚本。用它验的是跳过规则，不是浏览器行为。
 *
 * `wrapped` 模拟新链路：整页裹在 `iframe.lumen-html` 的 srcdoc 里，
 * **外层文档只有 pagebox 与 iframe 两个元素、一个字都没有**，文字全在 iframe 那份文档里。
 */
function fakeDom(
  elements: Array<{
    tag: string; text?: string; style?: Record<string, unknown>;
    rect?: { left: number; top: number; width: number; height: number }; inSvg?: boolean;
  }>,
  opts: { wrapped?: boolean } = {},
) {
  const marks: string[] = [];
  const nodes = elements.map((spec) => ({
    tagName: spec.tag,
    childNodes: spec.text === undefined ? [] : [{ nodeType: 3, nodeValue: spec.text }],
    closest: (sel: string) => (sel === 'svg' && spec.inSvg ? {} : null),
    getBoundingClientRect: () => spec.rect ?? { left: 0, top: 0, width: 100, height: 40 },
    setAttribute: (name: string) => { if (name === 'data-lumen-text') marks.push(spec.tag + ':' + (spec.text ?? '')); },
    spec,
  }));
  const styles = new Map<unknown, Record<string, unknown>>(nodes.map((n) => [n, n.spec.style ?? {}]));
  const getComputedStyle = (el: unknown) => ({
    display: 'block', visibility: 'visible', opacity: '1', fontFamily: 'Inter, sans-serif',
    webkitBackgroundClip: 'border-box', backgroundClip: 'border-box',
    fontSize: '48px', fontWeight: '400', color: 'rgb(0,0,0)', textAlign: 'left',
    ...(styles.get(el) ?? {}),
  });
  /** 记录「藏文字」那条样式被插到了哪个文档里 */
  const hiddenStyles: string[] = [];
  const makeDoc = (body: unknown) => ({
    body,
    createElement: () => ({ textContent: '' }),
    head: { appendChild: (s: { textContent: string }) => { hiddenStyles.push(String(s.textContent)); } },
  });
  const innerDoc = { ...makeDoc({ querySelectorAll: () => nodes }), defaultView: { getComputedStyle } };
  const outerDoc: Record<string, unknown> = makeDoc(
    opts.wrapped
      ? { querySelectorAll: () => [{ tagName: 'DIV' }, { tagName: 'IFRAME' }] }
      : { querySelectorAll: () => nodes },
  );
  if (opts.wrapped) {
    outerDoc.querySelector = (sel: string) => (sel === 'iframe.lumen-html'
      ? { contentDocument: innerDoc, getBoundingClientRect: () => ({ left: 0, top: 0 }) }
      : null);
  }
  const run = new Function('document', 'getComputedStyle', `return ${EXTRACT_TEXT_SCRIPT}`);
  return { boxes: run(outerDoc, getComputedStyle) as Array<{ text: string }>, marks, hiddenStyles };
}

/**
 * 新链路的页裹在 `iframe.lumen-html` 的 srcdoc 里（`render.tsx` 的 `pageMarkup`），
 * 文字全在 iframe 那份文档里。**只扫外层文档就一个框都抽不到**，导出来退化成
 * 「每页一张图」——这正是可编辑版曾经失效的成因，这条锁住它。
 */
test('页面裹在 iframe 里时照样抽得到文字，藏字样式要插进 iframe 那份文档', () => {
  const { boxes, marks, hiddenStyles } = fakeDom(
    [{ tag: 'H1', text: '标题' }, { tag: 'P', text: '正文' }],
    { wrapped: true },
  );
  assert.deepEqual(boxes.map((b) => b.text), ['标题', '正文']);
  assert.deepEqual(marks, ['H1:标题', 'P:正文']);
  // 插到外层文档等于没藏：背景图上还带着原文，铺回文本框就是重影
  assert.equal(hiddenStyles.length, 1, '藏文字的样式要插进 iframe 那份文档');
});
test('抽取脚本跳过 svg、图标字体与渐变字，其余照收', () => {
  const { boxes, marks } = fakeDom([
    { tag: 'H1', text: '标题' },
    { tag: 'P', text: '  正文   里的空格要压平  ' },
    { tag: 'PATH', text: 'M0 0L10 10', inSvg: true },
    { tag: 'SPAN', text: 'arrow_forward', style: { fontFamily: '"Material Symbols", sans-serif' } },
    { tag: 'SPAN', text: '渐变字', style: { webkitBackgroundClip: 'text' } },
    { tag: 'SPAN', text: '藏着的', style: { display: 'none' } },
    { tag: 'SPAN', text: '看不见的', style: { visibility: 'hidden' } },
    { tag: 'SPAN', text: '透明到底的', style: { opacity: '0' } },
    { tag: 'SPAN', text: '太小量不到', rect: { left: 0, top: 0, width: 0, height: 0 } },
    { tag: 'DIV', text: '   ' },
  ]);
  const texts = boxes.map((b) => b.text);
  assert.deepEqual(texts, ['标题', '正文 里的空格要压平']);
  // 收下的那两个要标上，藏文字那一步才找得到它们
  assert.deepEqual(marks, ['H1:标题', 'P:  正文   里的空格要压平  ']);
});

test('通用族名不写进 fontFace——typeface 里塞 system-ui 只会让 PowerPoint 找不到字体', () => {
  const { boxes } = fakeDom([
    { tag: 'H1', text: '标题', style: { fontFamily: 'system-ui, sans-serif' } },
    { tag: 'P', text: '正文', style: { fontFamily: '"Inter", sans-serif' } },
  ]);
  const faces = (boxes as unknown as Array<{ fontFace: string }>).map((b) => b.fontFace);
  assert.deepEqual(faces, ['', 'Inter']);
});

test('抽取脚本给的是画布比例，不是像素', () => {
  const { boxes } = fakeDom([
    { tag: 'H1', text: '标题', rect: { left: 480, top: 270, width: 960, height: 216 } },
  ]);
  const b = boxes[0] as unknown as { x: number; y: number; w: number; h: number };
  assert.ok(Math.abs(b.x - 0.25) < 1e-6);
  assert.ok(Math.abs(b.y - 0.25) < 1e-6);
  assert.ok(Math.abs(b.w - 0.5) < 1e-6);
  assert.ok(Math.abs(b.h - 0.2) < 1e-6);
});

test('PPTX 输出统一收成 Buffer', () => {
  const bytes = new Uint8Array([1, 2, 3]);
  assert.deepEqual(toBuffer(bytes), Buffer.from([1, 2, 3]));
  assert.deepEqual(toBuffer('AQID'), Buffer.from([1, 2, 3]));
  assert.throws(() => toBuffer(123), /PPTX 输出类型不受支持/);
});

/* ---------------- 讲稿分段重排 ---------------- */

const ANCHORS = [
  { t: 0, text: '旧段一', anchor: { targetId: 'title', x: 0.5, y: 0.2 }, cursor: true },
  { t: 100, text: '旧段二', anchor: { targetId: 'block-1', x: 0.3, y: 0.6 }, cursor: true },
];

test('模型写的讲稿按原分段数切回，锚点与坐标原样保留', () => {
  const text = '第一句。第二句。第三句。第四句。';
  const segments = resegment(text, ANCHORS);
  assert.equal(segments.length, 2, '分段数由规则版决定，模型不改变它');
  assert.equal(segments[0]!.anchor?.targetId, 'title');
  assert.equal(segments[1]!.anchor?.targetId, 'block-1');
  assert.equal(segments[0]!.anchor?.x, 0.5);
  assert.equal(segments[0]!.text + segments[1]!.text, text, '正文不能丢字');
});

test('分段起始时间严格递增，按字数推进', () => {
  const segments = resegment('短句。这里是一句明显更长的话，用来把时间轴拉开距离。', ANCHORS);
  assert.ok(segments[1]!.t > segments[0]!.t, 't 必须递增');
  assert.ok(segments[1]!.t >= segments[0]!.text.length * 200, '推进量应与字数同量级');
});

test('句子数少于分段数时不留空段，正文仍完整', () => {
  const segments = resegment('只有一句。', ANCHORS);
  assert.equal(segments.length, 2);
  assert.equal(segments.map((s) => s.text).join(''), '只有一句。');
});

test('没有锚点时不做重排', () => {
  assert.deepEqual(resegment('随便什么。', []), []);
});

/* ---------------- 讲稿：新链路页面（内容在 html 里） ---------------- */

/**
 * **实测踩到的**：新链路页面的 `page.blocks` 是空的（内容全在 `html` 里），而分段与锚点
 * 原先都是按 `blocks` 算的——于是那个 30 页的项目**每页都只有 1 段**、锚点全是
 * `(0.50, 0.22)`，讲解光标从头到尾停在一个点上，压根不会动。
 */
const HTML_PAGE = [
  '<style>.stage{width:1920px}</style>',
  '<div class="stage">',
  '  <header><div class="kicker">Forward Deployed Engineer</div></header>',
  '  <h1>FDE 是什么：一个被写进招股书的岗位</h1>',
  '  <p>FDE 是常驻客户现场、对业务结果负责的工程师。</p>',
  '  <aside>',
  '    <div class="point"><span class="num">01</span><p><strong>来源可查</strong>：Palantir 在 2020 年的 S-1 招股书中把它列为关键角色。</p></div>',
  '    <div class="point"><span class="num">02</span><p><strong>三个词拆开看</strong>：Forward 指站在业务最前线。</p></div>',
  '  </aside>',
  '</div>',
].join('\n');

test('抠出来的文字块是人读的一段段，且不含外层容器的重复', () => {
  const blocks = htmlTextBlocks(HTML_PAGE);
  assert.ok(blocks.some((b) => b.includes('来源可查')), '要点没抠出来');
  assert.ok(blocks.some((b) => b.includes('FDE 是什么')), '标题没抠出来');
  // 外层容器会把内层几块的文字串在一起，位置又是半页中心——必须去掉，不然会重复
  assert.equal(blocks.filter((b) => b.includes('来源可查')).length, 1, '有重复块');
  assert.ok(!blocks.some((b) => b.includes('.stage{')), 'style 块不该进来');
});

/**
 * 实测那个 30 页的项目：页眉页脚里是页码、章节标签条、装饰英文。这些念出来只是噪音。
 *
 * **但不能整块丢掉页眉页脚**——实测里有页把导语放在了页眉里
 * （「FDE 的能力是「工程 + 领域 + 沟通」的交集，缺一块都会塌。」），
 * 整块丢就把正文一起丢了。所以按块判：装饰丢，成句的留。
 */
test('页眉页脚里的页码、标签条、装饰英文不进讲稿', () => {
  const html = [
    '<div class="stage">',
    '<header class="topbar">',
    '  <p class="lead">全书围绕六个问题展开，四段推进。</p>',
    '  <div class="center"><span class="chip">02</span><span class="overline">Contents</span></div>',
    '  <div class="page">第 2 页，共 30 页</div>',
    '</header>',
    '<h1>目录：六个问题</h1>',
    '<p>全书六问，逐条落位。</p>',
    '<footer class="foot">',
    '  <div class="brandmark">FDE · 目录</div>',
    '  <div class="page">第 2 页，共 30 页</div>',
    '</footer>',
    '</div>',
  ].join('\n');

  const blocks = htmlTextBlocks(html);
  assert.ok(blocks.some((b) => b.includes('六个问题')), `正文要留着：${blocks.join(' | ')}`);
  for (const noise of ['第 2 页', 'Contents', 'FDE · 目录']) {
    assert.ok(!blocks.some((b) => b.includes(noise)), `「${noise}」不该进讲稿：${blocks.join(' | ')}`);
  }
  assert.ok(
    blocks.some((b) => b.includes('四段推进')),
    `页眉里的导语是内容，整块丢页眉就把正文丢了：${blocks.join(' | ')}`,
  );
});

test('过滤只作用在页眉页脚——正文里带间隔号的那一块照留', () => {
  const html = '<div><h1>角色分化 · 三条路线</h1><p>行业型 · 平台型 · 管理型</p></div>';
  const blocks = htmlTextBlocks(html);
  assert.ok(blocks.some((b) => b.includes('角色分化')), `正文里的间隔号块不该被误删：${blocks.join(' | ')}`);
});

/**
 * **实测踩到的**：正文里「六项能力对应第 20 页的四级能力标准，用来判断自己现在在第几级」
 * 这句中间带「第 N 页」，页码规则不锚定开头就把整句删了。
 */
test('正文句子里提到「第 N 页」不能被当页码丢掉', () => {
  const html = [
    '<div>',
    '<header><div class="page">第 13 页 / 共 30 页</div></header>',
    '<footer><p>六项能力对应第 20 页的四级能力标准，用来判断自己现在在第几级。</p></footer>',
    '</div>',
  ].join('');
  const blocks = htmlTextBlocks(html);
  assert.ok(!blocks.some((b) => b.includes('第 13 页')), `页码要丢：${blocks.join(' | ')}`);
  assert.ok(
    blocks.some((b) => b.includes('四级能力标准')),
    `正文句子要留，别把它当页码删了：${blocks.join(' | ')}`,
  );
});

test('HTML 页面按页面上的文字分段，不再只有一段', () => {
  const script = buildScript(page({ pageId: 'pg-html', pageType: 'imageText', layoutVariant: 'imageText/split@v1', html: HTML_PAGE, blocks: [] }));
  assert.ok(script.segments.length >= 2, `HTML 页面该分出多段，实际 ${script.segments.length} 段`);
  assert.ok(script.text.includes('来源可查'), '正文该包含页面上的内容，而不是只剩标题那一句');
});

test('HTML 页面的锚点带的是页面上的文字，前端据此找元素', () => {
  const script = buildScript(page({ pageId: 'pg-html', pageType: 'imageText', layoutVariant: 'imageText/split@v1', html: HTML_PAGE, blocks: [] }));
  const ids = script.segments.map((s) => s.anchor?.targetId ?? '');
  assert.ok(ids.every((id) => id.startsWith('html:')), `锚点该带 html: 前缀：${ids.join(' | ')}`);

  /**
   * 那一小段文字必须真的能在页面的**文本**里找到——前端就是拿它去
   * `element.textContent` 里搜的。所以这里按浏览器那套口径去标签（换成空串），
   * 而不是简单粗暴地删。
   */
  const bodyText = HTML_PAGE.replace(/<[^>]*>/g, '');
  for (const id of ids) {
    assert.ok(bodyText.includes(id.slice('html:'.length)), `锚点文字在页面里找不到：${id}`);
  }
});

test('锚点文字剥掉了开头那个编号——编号在页面上的独立 span 里，带上就搜不着', () => {
  const script = buildScript(page({ pageId: 'pg-html', pageType: 'imageText', layoutVariant: 'imageText/split@v1', html: HTML_PAGE, blocks: [] }));
  const withNum = script.segments.find((s) => s.text.includes('来源可查'));
  assert.ok(withNum, '没分到「来源可查」那一段');
  assert.ok(!withNum.anchor!.targetId.startsWith('html:01'), `编号没剥掉：${withNum.anchor!.targetId}`);
});

test('旧链路（有 blocks、没 html）的锚点照旧，不带 html: 前缀', () => {
  const script = buildScript(page({
    pageId: 'pg-old', layoutVariant: 'text/plain@v1',
    pageType: 'text',
    blocks: [{ id: 'b1', type: 'bullets', items: ['收入结构保持均衡', '毛利水平稳中有升'] }],
  }));
  const ids = script.segments.map((s) => s.anchor?.targetId ?? '');
  assert.ok(ids.every((id) => !id.startsWith('html:')), `旧链路不该走 html 锚点：${ids.join(' | ')}`);
  assert.ok(ids.includes('b1'), `该锚到块 id 上：${ids.join(' | ')}`);
});

/* ---------------- 讲稿提示词 ---------------- */

/**
 * **这是本次改动的地基。** 新链路页面的 `blocks` 是空的、内容全在 `html` 里，
 * 而 `scriptPrompt` 原先只遍历 `blocks`——模型对这类页面只拿到一行标题，等于在盲写。
 * 讲稿空泛的根因就在这，不在模型。
 */
test('新链路 HTML 页的提示词里必须有正文，不能只有标题', () => {
  const p = page({
    pageId: 'pg-html-prompt',
    layoutVariant: 'text/one-column@v1',
    pageType: 'text',
    html: '<section><h1>存量竞争加剧</h1><p>市场增速从 210% 降到 18%。</p><p>增长逻辑正在重构。</p></section>',
  });
  const prompt = scriptPrompt(p);
  assert.ok(prompt.includes('存量竞争加剧'), `标题要在：${prompt}`);
  assert.ok(prompt.includes('210%'), `正文必须进提示词，否则模型没东西可写：${prompt}`);
  assert.ok(prompt.includes('增长逻辑正在重构'), prompt);
});

test('旧链路提示词照旧走 blocks', () => {
  const prompt = scriptPrompt(page({
    pageId: 'pg-old-prompt', layoutVariant: 'text/plain@v1', pageType: 'text',
    blocks: [
      { id: 'b1', type: 'bullets', items: ['收入结构保持均衡'] },
      { id: 'm1', type: 'metric', value: '38%', label: '营业收入同比增长', trend: '+12pt', source: '', primary: true },
    ],
  }));
  assert.ok(prompt.includes('收入结构保持均衡'), prompt);
  assert.ok(prompt.includes('38%'), prompt);
});

test('模型回的 JSON 段数对得上才收，对不上退回 null', () => {
  assert.deepEqual(parseScriptDraft('{"segments":["甲","乙"]}', 2), ['甲', '乙']);
  // 允许带围栏：模型经常会加，为此丢一整页讲稿不值当
  assert.deepEqual(parseScriptDraft('```json\n{"segments":["甲"]}\n```', 1), ['甲']);
  // 段数不符
  assert.equal(parseScriptDraft('{"segments":["甲","乙"]}', 3), null);
  // 空段被丢掉之后数量不够，同样算不符
  assert.equal(parseScriptDraft('{"segments":["甲","  "]}', 2), null);
  // 不是 JSON
  assert.equal(parseScriptDraft('这一页讲的是存量竞争。', 1), null);
  assert.equal(parseScriptDraft('{"segments":"不是数组"}', 1), null);
});
