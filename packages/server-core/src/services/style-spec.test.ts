import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderGateway } from '@lumen/provider-gateway';
import type { PageType, StyleDoc, StyleSpec } from '@lumen/ir-schema';

// 环境必须在导入任何模块之前设定
const tmp = mkdtempSync(join(tmpdir(), 'lumen-spec-'));
process.env.NODE_ENV = 'test';
process.env.LUMEN_DB_PATH = join(tmp, 'test.db');
process.env.LUMEN_SECRET_KEY = 'test-secret-key-0123456789abcdefghijklmnop';

const { migrate } = await import('../db/migrate.js');
const { closeDb } = await import('../db/client.js');
const { ensureSeed } = await import('./seed.service.js');
const { saveStyleDoc, resolveStyleDoc } = await import('./style-doc.service.js');
const { unifyStyle, setSpecFonts } = await import('./style-spec.service.js');
const { StyleDoc: StyleDocSchema, PAGE_TYPE_LABEL, PAGE_TYPE_ORDER, fontStacksOf, fontStackOf } = await import('@lumen/ir-schema');
const { MOCK_PLACEHOLDER_MARKER } = await import('@lumen/provider-gateway');
const { MODEL_LIMITER } = await import('../lib/model-limiter.js');

migrate();
ensureSeed();

test.after(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * 一键统一。
 *
 * 全程假网关：要验的是「四步都跑到、手改过的页跳过、坏提示词不落库、规范不合契约就中止」，
 * 不是模型本身。真调模型会让用例既慢又不确定，在没有 Key 的机器上还会直接失败。
 */

const PALETTE = {
  bg: '#EFE6DA', surface: '#F7F1E8', text: '#3A322B', muted: '#8A7F73',
  accent: '#E08A3C', brand: '#C7421A', border: '#D8CDBF',
};

/** 四个小节齐全的提示词。改写出来的那几条必须长这样，否则会被当成不合规丢掉 */
function promptFor(t: string, tag = ''): string {
  return `角色：${t} 的设计师。\n任务：写 ${t}${tag}。\n视觉与排版要求：\n1. 只属于 ${t} 的版式。\n代码要求（非常重要）：\n1. 用 :root 定义变量。`;
}

/** 合规的样机 HTML：配色全走变量，且变量值与色板逐字对上 */
function goodHtml(tag = ''): string {
  return [
    `<style>:root { --bg:${PALETTE.bg}; --text:${PALETTE.text}; --accent:${PALETTE.accent}; }`,
    '.slide { width: 1920px; height: 1080px; background: var(--bg); color: var(--text); }',
    `</style><div class="slide">样机${tag}</div>`,
  ].join('');
}

const SPEC_JSON = JSON.stringify({
  intro: '浅灰蓝底上浮白色表面，1px 细线分层。',
  title: {
    sizePx: 44, weight: 700, color: 'brand', align: 'left',
    rule: { position: 'above', widthPx: 72, heightPx: 6, color: 'accent' },
  },
  header: { kind: 'block', sizePx: 34, color: 'brand', heightPx: 88 },
  footer: { heightPx: 100, showPageNo: true },
  marginPx: 56,
  radius: { card: 14, inner: 8 },
  decoration: ['1px 细线'],
});

/**
 * 实测的失败形状：模型把 `rule.position` 写成 `left`（它想表达「短横线在标题左侧」），
 * 而契约只认 above / below / none。其余字段全对。
 */
const SPEC_JSON_BAD_ENUM = SPEC_JSON.replace('"position":"above"', '"position":"left"');

let seq = 0;
/**
 * 造一份风格文档。默认两页（封面 + 文字页），够验「哪一页被跳过」这类事；
 * 要验并发批量（自检两页一批）就得多给几页。
 *
 * `meta` 给固定值而不是让默认值填：默认的 `createdAt` / `updatedAt` 取 `Date.now()`，
 * 断言「meta 没被顺手改掉」时会因为毫秒级差异变成假阳性。
 */
function makeDoc(edited: PageType[] = [], pages: PageType[] = ['cover', 'text']): string {
  seq += 1;
  const styleId = `spec-${seq}`;
  const pagePrompts: Record<string, unknown> = {};
  for (const t of pages) {
    pagePrompts[t] = {
      pageType: t,
      prompt: promptFor(t),
      mockHtml: goodHtml('旧'),
      source: 'reference',
      issues: [],
      edited: edited.includes(t),
    };
  }
  const doc = StyleDocSchema.parse({
    styleId,
    name: `测试风格 ${seq}`,
    description: '一句话说明',
    fontFamily: '"Source Han Serif", serif',
    deckPrompt: '整本一套调子',
    palette: PALETTE,
    pagePrompts,
    meta: { builtin: false, reviewed: true, customized: false, createdAt: 1700000000000, updatedAt: 1700000000000 },
  });
  assert.equal(saveStyleDoc(doc).ok, true);
  return styleId;
}

interface TextRequest {
  system?: string;
  messages: { role?: string; content: string; images?: string[] }[];
  maxTokens?: number;
  taskType?: string;
  json?: boolean;
}

/** 请求体里出现的页类型。改写与自检的正文都写成「【文字页】」这种形式 */
function typesIn(content: string): PageType[] {
  const byLabel = new Map(Object.entries(PAGE_TYPE_LABEL).map(([k, v]) => [v, k as PageType]));
  return [...content.matchAll(/【(.+?)】/g)]
    .map((m) => byLabel.get(m[1]!))
    .filter((t): t is PageType => Boolean(t));
}

/** 内置 Mock 对 html_codegen 的兜底：一段占位说明，不是提示词，但过得了 JSON 解析之外的任何检查 */
const MOCK_REPLY = `已收到 html_codegen 任务。${MOCK_PLACEHOLDER_MARKER}，用于在尚未接入真实模型时保持整条链路可用。`;

/** 按 system 里的特征串分派回复，并记下每次收到的请求供断言 */
function fakeGateway(opts: {
  /** 提炼那一步的回复。给函数可以按调用次数换答案 */
  spec?: string | (() => string);
  /** 拿到这一批的页类型，返回改写结果 */
  rewrite?: (types: PageType[]) => string;
  check?: string;
  /** 让自检那一步直接抛 */
  checkThrows?: boolean;
  /** 让改写那一步回 Mock 的占位说明。给函数可以按调用次数换答案 */
  rewriteMock?: boolean | (() => boolean);
  /** 让自检那一步回 Mock 的占位说明 */
  checkMock?: boolean;
} = {}) {
  const seen: TextRequest[] = [];
  const gateway = {
    async text(req: TextRequest) {
      seen.push(req);
      const sys = req.system ?? '';
      const reply = (text: string) => ({
        text, providerId: 'fake', model: 'fake',
        usage: { inputTokens: 1, outputTokens: 1 },
        degraded: false, degradeReason: '', latencyMs: 1,
      });
      if (sys.includes('提炼出一份')) {
        const spec = typeof opts.spec === 'function' ? opts.spec() : opts.spec;
        return reply(spec ?? SPEC_JSON);
      }
      if (sys.includes('请把这条提示词改成符合规范的样子')) {
        const mock = typeof opts.rewriteMock === 'function' ? opts.rewriteMock() : opts.rewriteMock;
        if (mock) return reply(MOCK_REPLY);
        const types = typesIn(req.messages[0]!.content);
        return reply(opts.rewrite
          ? opts.rewrite(types)
          : JSON.stringify({ pages: types.map((t) => ({ pageType: t, prompt: promptFor(t, '（已统一）') })) }));
      }
      if (sys.includes('只报对不上的地方')) {
        if (opts.checkThrows) throw new Error('自检这一步炸了');
        if (opts.checkMock) return reply(MOCK_REPLY);
        return reply(opts.check ?? '{"deviations":[]}');
      }
      // 出样机
      return reply(goodHtml('新'));
    },
    async image() { throw new Error('本用例不生成图片'); },
  } as unknown as ProviderGateway;
  return { seen, gateway };
}

/** 把一次统一的 SSE 事件收成数组 */
async function run(styleId: string, gw: ProviderGateway) {
  const out: { event: string; data: unknown }[] = [];
  for await (const e of unifyStyle({ styleId, gateway: gw })) out.push(e);
  return out;
}

test('四步都跑到：提炼规范 → 改写 → 重出样机 → 自检，结果落库', async () => {
  const styleId = makeDoc();
  const { gateway, seen } = fakeGateway();

  const events = await run(styleId, gateway);
  const steps = events.filter((e) => e.event === 'progress').map((e) => (e.data as { step: string }).step);
  assert.deepEqual([...new Set(steps)], ['spec', 'rewrite', 'mock', 'check']);

  const done = events.at(-1)!;
  assert.equal(done.event, 'done');
  const data = done.data as {
    doc: StyleDoc; spec: StyleSpec; rewritten: PageType[]; skippedEdited: PageType[]; deviations: unknown[];
  };
  assert.deepEqual([...data.rewritten].sort(), ['cover', 'text']);
  assert.deepEqual(data.skippedEdited, []);
  assert.equal(data.spec.title.sizePx, 44);

  // 落库了：规范与改写后的提示词都在
  const saved = resolveStyleDoc(styleId);
  assert.equal(saved.spec?.title.sizePx, 44);
  assert.match(saved.pagePrompts.cover!.prompt, /（已统一）/);
  assert.match(saved.pagePrompts.cover!.mockHtml, /样机新/);
  // 配色、字体、meta 一个没动
  assert.deepEqual(saved.palette, PALETTE);
  assert.equal(saved.fontFamily, '"Source Han Serif", serif');
  assert.equal(saved.meta.createdAt, 1700000000000);

  // 提炼那次调用里必须带上各页的「视觉与排版要求」那一段，而不是整条提示词：
  // 「角色」「代码要求」两段各页大同小异，喂进去只是白花 token
  const extract = seen.find((r) => (r.system ?? '').includes('提炼出一份'))!;
  assert.match(extract.messages[0]!.content, /视觉与排版要求：/);
  assert.equal(extract.messages[0]!.content.includes('代码要求（非常重要）：'), false);
  // 色值要给：模型要在不知道色板的情况下判断「哪个颜色才是这套风格的主张」
  assert.match(extract.messages[0]!.content, new RegExp(PALETTE.brand));
});

test('手改过的页跳过、并如实报出来', async () => {
  const styleId = makeDoc(['cover']);
  const { gateway, seen } = fakeGateway();

  const events = await run(styleId, gateway);
  const data = events.at(-1)!.data as { rewritten: PageType[]; skippedEdited: PageType[] };
  assert.deepEqual(data.rewritten, ['text']);
  assert.deepEqual(data.skippedEdited, ['cover']);

  const saved = resolveStyleDoc(styleId);
  assert.equal(saved.pagePrompts.cover!.prompt, promptFor('cover'), '手改过的提示词不该被动');
  assert.equal(saved.pagePrompts.cover!.edited, true);
  assert.match(saved.pagePrompts.text!.prompt, /（已统一）/);

  // 跳过的那一页不该出现在改写请求里——「跳过」与「改了但没落库」是两回事
  const rewrite = seen.filter((r) => (r.system ?? '').includes('请把这条提示词改成符合规范的样子'));
  assert.equal(rewrite.length, 1);
  assert.deepEqual(typesIn(rewrite[0]!.messages[0]!.content), ['text']);
  // 重出样机也只跑被改写的那一页：样机是最贵的一步
  const mocks = seen.filter((r) => (r.system ?? '').includes('严格照着用户给的提示词写这一页的 HTML'));
  assert.equal(mocks.length, 1);
  assert.match(mocks[0]!.messages[0]!.content, /写 text（已统一）/);
});

test('一批里坏的那条丢掉、保留原提示词——坏提示词比不统一更糟', async () => {
  const styleId = makeDoc();
  const { gateway } = fakeGateway({
    rewrite: (types) => JSON.stringify({
      pages: types.map((t) => ({
        pageType: t,
        // cover 缺了「代码要求」那一段
        prompt: t === 'cover' ? '角色：x\n任务：y\n视觉与排版要求：z' : promptFor(t, '（已统一）'),
      })),
    }),
  });

  const events = await run(styleId, gateway);
  const data = events.at(-1)!.data as { rewritten: PageType[]; unrewritten: PageType[] };
  assert.deepEqual(data.rewritten, ['text'], '坏的那条不该收');
  assert.deepEqual(data.unrewritten, ['cover'], '该改却没改上的页要如实报出来');

  const saved = resolveStyleDoc(styleId);
  assert.equal(saved.pagePrompts.cover!.prompt, promptFor('cover'), '原提示词要留着');
  assert.match(saved.pagePrompts.text!.prompt, /（已统一）/);
  // 规范本身仍然提炼出来了——它是独立的一步，不该被后面的失败带没
  assert.equal(saved.spec?.title.sizePx, 44);
});

test('一整批一页都没收上来就抛——「已统一 0 页」不能算成功', async () => {
  const styleId = makeDoc();
  const { gateway } = fakeGateway({ rewrite: () => JSON.stringify({ pages: [] }) });

  const events = await run(styleId, gateway);
  assert.equal(events.at(-1)!.event, 'error');
  // 静默跳过的后果是用户看到「统一完成」而其实一个字没改
  assert.equal(resolveStyleDoc(styleId).spec, null);
});

test('模型用中文页名回填也收得上——请求正文与系统提示里都是中文，那是它的合理反应', async () => {
  const styleId = makeDoc();
  const { gateway } = fakeGateway({
    rewrite: (types) => JSON.stringify({
      pages: types.map((t) => ({ pageType: PAGE_TYPE_LABEL[t], prompt: promptFor(t, '（已统一）') })),
    }),
    check: JSON.stringify({
      deviations: [{ pageType: PAGE_TYPE_LABEL.text, field: 'title.sizePx', expected: '46px', found: '44px' }],
    }),
  });

  const events = await run(styleId, gateway);
  const data = events.at(-1)!.data as {
    rewritten: PageType[]; deviations: { pageType: string; found: string }[];
  };
  assert.deepEqual([...data.rewritten].sort(), ['cover', 'text'], '中文页名不该被当成答非所问丢掉');
  assert.deepEqual(data.deviations, [{ pageType: 'text', field: 'title.sizePx', expected: '46px', found: '44px' }]);
  assert.match(resolveStyleDoc(styleId).pagePrompts.cover!.prompt, /（已统一）/);
});

test('答非所问的页类型仍然丢掉——放宽的是页名写法，不是这一批的边界', async () => {
  const styleId = makeDoc();
  const { gateway } = fakeGateway({
    rewrite: () => JSON.stringify({
      pages: [
        { pageType: '文字页', prompt: promptFor('text', '（已统一）') },
        { pageType: '思维导图', prompt: promptFor('mindMap', '（已统一）') },
        { pageType: 'mindMap', prompt: promptFor('mindMap', '（已统一）') },
      ],
    }),
  });

  const events = await run(styleId, gateway);
  const data = events.at(-1)!.data as { rewritten: PageType[] };
  assert.deepEqual(data.rewritten, ['text'], '不在这一批里的，写中文名还是写英文名都不该收');
});

test('枚举越界时把错误发回去让它自己改，不是直接判死', async () => {
  const styleId = makeDoc();
  let n = 0;
  const { gateway, seen } = fakeGateway({
    spec: () => { n += 1; return n === 1 ? SPEC_JSON_BAD_ENUM : SPEC_JSON; },
  });

  const events = await run(styleId, gateway);
  assert.equal(events.at(-1)!.event, 'done', '枚举越界一次不该让整轮失败');
  assert.equal(resolveStyleDoc(styleId).spec?.title.sizePx, 44);

  const calls = seen.filter((r) => (r.system ?? '').includes('提炼出一份'));
  assert.equal(calls.length, 2);
  // 重发时必须带上**它自己上一次的输出**与出错的字段路径，只说「错了」它看不到错在哪
  const retry = calls[1]!.messages;
  assert.equal(retry.length, 3, '原始请求 + 上次输出 + 修正要求');
  assert.equal(retry[1]!.role, 'assistant');
  assert.match(retry[1]!.content, /"position":"left"/);
  assert.match(retry[2]!.content, /title\.rule\.position/);
});

test('三次都合不上契约才中止——到这一步说明它确实理解不了', async () => {
  const styleId = makeDoc();
  const { gateway, seen } = fakeGateway({ spec: SPEC_JSON_BAD_ENUM });

  const events = await run(styleId, gateway);
  assert.equal(events.at(-1)!.event, 'error');
  assert.equal(seen.filter((r) => (r.system ?? '').includes('提炼出一份')).length, 3);
  // 一份瞎猜的规范会把下面每一页都改坏，所以这一步没有兜底：什么都没写进去
  const saved = resolveStyleDoc(styleId);
  assert.equal(saved.spec, null);
  assert.equal(saved.pagePrompts.cover!.prompt, promptFor('cover'));
});

test('提炼这次没吐出 JSON 时重发一次——抖动与「理解错了」是两回事', async () => {
  const styleId = makeDoc();
  let n = 0;
  const { gateway, seen } = fakeGateway({
    spec: () => {
      n += 1;
      return n === 1 ? '好的，我来分析这套风格。首先看配色……' : SPEC_JSON;
    },
  });

  const events = await run(styleId, gateway);
  assert.equal(events.at(-1)!.event, 'done', '抖动应该被重发救回来');
  assert.equal(seen.filter((r) => (r.system ?? '').includes('提炼出一份')).length, 2);
  assert.equal(resolveStyleDoc(styleId).spec?.title.sizePx, 44);
});

test('一直不吐 JSON 就中止，不无限重发', async () => {
  const styleId = makeDoc();
  const { gateway, seen } = fakeGateway({ spec: '抱歉，我需要更多信息。' });

  const events = await run(styleId, gateway);
  assert.equal(events.at(-1)!.event, 'error');
  // 有上限：走到这一步说明不是抖动，再问下去只是白等
  assert.equal(seen.filter((r) => (r.system ?? '').includes('提炼出一份')).length, 3);
  assert.equal(resolveStyleDoc(styleId).spec, null);
});

test('自检的偏差如实带出来，并丢掉不在这一批里的页', async () => {
  const styleId = makeDoc();
  const { gateway } = fakeGateway({
    check: JSON.stringify({
      deviations: [
        { pageType: 'text', field: 'title.sizePx', expected: '44px', found: '46px' },
        // 页类型不在这一批里的丢掉：模型偶尔答非所问
        { pageType: 'mindMap', field: 'title.sizePx', expected: '44px', found: '52px' },
      ],
    }),
  });

  const events = await run(styleId, gateway);
  const data = events.at(-1)!.data as { deviations: { pageType: string; field: string }[] };
  assert.deepEqual(data.deviations, [{ pageType: 'text', field: 'title.sizePx', expected: '44px', found: '46px' }]);
  // 自检查的是**产物**不是提示词：提示词写得对不代表跑出来就对。
  // 收尾那条进度要报出到底还剩几处，用户据此判断这轮统一做没做到位
  const check = events.filter((e) => e.event === 'progress' && (e.data as { step: string }).step === 'check');
  assert.match((check.at(-1)!.data as { label: string }).label, /1 处仍不一致/);
});

test('自检挂了不把统一结果作废——它是参考信息，不是产物', async () => {
  const styleId = makeDoc();
  const { gateway } = fakeGateway({ checkThrows: true });

  const events = await run(styleId, gateway);
  assert.equal(events.at(-1)!.event, 'done', '自检失败不该把整轮变成 error');
  const saved = resolveStyleDoc(styleId);
  assert.equal(saved.spec?.title.sizePx, 44);
  assert.match(saved.pagePrompts.cover!.prompt, /（已统一）/);
});

test('改写撞上内置 Mock 时重发一次——它给的是一段说明，不是提示词', async () => {
  const styleId = makeDoc();
  let n = 0;
  const { gateway, seen } = fakeGateway({
    rewriteMock: () => { n += 1; return n === 1; },
  });

  const events = await run(styleId, gateway);
  assert.equal(events.at(-1)!.event, 'done');
  assert.equal((events.at(-1)!.data as { rewritten: PageType[] }).rewritten.length, 2);
  /**
   * 3 而不是 2：`REWRITE_BATCH` 是 1，两页就是两批，再加上撞上 Mock 那次的**重发**。
   * 断言的是「重发真的发生了」——只有 2 次的话说明撞上 Mock 后没重发，
   * 那一页会拿一段说明文字当提示词存进库里。
   */
  assert.equal(seen.filter((r) => (r.system ?? '').includes('请把这条提示词改成符合规范的样子')).length, 3);
});

test('改写两次都撞上内置 Mock 就抛——不能悄悄报成「统一完成」', async () => {
  const styleId = makeDoc();
  const { gateway } = fakeGateway({ rewriteMock: true });

  const events = await run(styleId, gateway);
  assert.equal(events.at(-1)!.event, 'error');
  // 半途落库会让库里一部分页是新的一批是旧的，比整轮失败更难收拾
  assert.equal(resolveStyleDoc(styleId).spec, null);
});

test('自检撞上内置 Mock 时说「没跑成」，不说「0 处不一致」', async () => {
  const styleId = makeDoc();
  const { gateway } = fakeGateway({ checkMock: true });

  const events = await run(styleId, gateway);
  const data = events.at(-1)!.data as { checked: boolean; deviations: unknown[]; rewritten: PageType[] };
  assert.equal(events.at(-1)!.event, 'done', '自检没跑成不该把统一结果作废');
  assert.equal(data.checked, false);
  assert.deepEqual(data.deviations, []);
  assert.deepEqual([...data.rewritten].sort(), ['cover', 'text']);
  // 进度收尾那条也要如实说
  const check = events.filter((e) => e.event === 'progress' && (e.data as { step: string }).step === 'check');
  assert.match((check.at(-1)!.data as { label: string }).label, /没跑成/);
  // 规范与提示词照常落库
  const saved = resolveStyleDoc(styleId);
  assert.equal(saved.spec?.title.sizePx, 44);
  assert.match(saved.pagePrompts.cover!.prompt, /（已统一）/);
});

test('样机没出来的页也把改写后的提示词留下——提示词才是这一步的主要产物', async () => {
  const styleId = makeDoc();
  const seen: TextRequest[] = [];
  const gateway = {
    async text(req: TextRequest) {
      seen.push(req);
      const sys = req.system ?? '';
      const reply = (text: string) => ({
        text, providerId: 'fake', model: 'fake',
        usage: { inputTokens: 1, outputTokens: 1 },
        degraded: false, degradeReason: '', latencyMs: 1,
      });
      if (sys.includes('提炼出一份')) return reply(SPEC_JSON);
      if (sys.includes('请把这条提示词改成符合规范的样子')) {
        const types = typesIn(req.messages[0]!.content);
        return reply(JSON.stringify({ pages: types.map((t) => ({ pageType: t, prompt: promptFor(t, '（已统一）') })) }));
      }
      if (sys.includes('只报对不上的地方')) return reply('{"deviations":[]}');
      throw new Error('出样机这一步炸了');
    },
    async image() { throw new Error('本用例不生成图片'); },
  } as unknown as ProviderGateway;

  const events = await run(styleId, gateway);
  assert.equal(events.at(-1)!.event, 'done');
  const saved = resolveStyleDoc(styleId);
  assert.match(saved.pagePrompts.cover!.prompt, /（已统一）/, '样机失败不该把提示词一起丢掉');
  assert.equal(saved.pagePrompts.cover!.mockHtml, '');
});

/* ---------------- 字体角色 ---------------- */

/**
 * 字体是从**风格原有的字体栈**反查出来的，不是让模型猜的。
 *
 * 模型只能从提示词的文字里读「大标题用衬线展示体」这种描述，猜不准是哪一个衬线；
 * 而 `StyleDoc` 里那三套栈是识别阶段就定下的真值。`makeDoc` 里正文用的是
 * `"Source Han Serif"`（清单里没有），所以它应当留空——空串表示「不指定、按原样」，
 * 给个默认值会把所有老风格悄悄换掉字体。
 */
test('统一之后四个字体角色按风格原有的栈填好，认不出的留空', async () => {
  const styleId = makeDoc();
  const { gateway } = fakeGateway();
  await run(styleId, gateway);

  const fonts = resolveStyleDoc(styleId).spec!.fonts;
  // 默认展示字体就是 Cormorant Garamond 那一套
  assert.equal(fonts.display, 'cormorant');
  // 数字按大标题走：大号指标值跟标题一个字体是常态
  assert.equal(fonts.numeric, 'cormorant');
  // 手写体的默认栈就是清单里那条系统手写体
  assert.equal(fonts.script, 'system-script');
  assert.equal(fonts.body, '', '「Source Han Serif」不在清单里，不该被硬认成某一个');
});

test('换字体只改规范：提示词与样机一个字都不动，渲染用的栈跟着变', async () => {
  const styleId = makeDoc();
  const { gateway } = fakeGateway();
  await run(styleId, gateway);
  const before = resolveStyleDoc(styleId);

  const after = setSpecFonts(styleId, { body: 'montserrat' });

  assert.equal(after.spec!.fonts.body, 'montserrat');
  assert.equal(after.spec!.fonts.display, 'cormorant', '只动指定的那一档，别的角色不该被顺手改掉');
  // 真正要验的是这条：渲染层拿到的栈换了
  assert.equal(fontStacksOf(after).fontFamily, fontStackOf('montserrat'));
  // 提示词与样机一个字都没动——字体走 CSS 变量，不需要重跑统一
  assert.deepEqual(after.pagePrompts, before.pagePrompts);
});

test('数字那一档不指定时落回展示字体，不是落回正文', async () => {
  const styleId = makeDoc();
  const { gateway } = fakeGateway();
  await run(styleId, gateway);

  // 先把数字换成等宽，再清掉——清掉之后应当回到展示字体
  setSpecFonts(styleId, { numeric: 'system-mono' });
  const doc = setSpecFonts(styleId, { numeric: '' });
  assert.equal(fontStacksOf(doc).fontNumeric, fontStackOf('cormorant'));
});

test('认不出的字体 id 被挡下，不落库', async () => {
  const styleId = makeDoc();
  const { gateway } = fakeGateway();
  await run(styleId, gateway);

  assert.throws(() => setSpecFonts(styleId, { display: 'comic-sans' }), /认不出的字体/);
  assert.equal(resolveStyleDoc(styleId).spec!.fonts.display, 'cormorant', '抛了就不该写进去');
});

test('还没提炼过规范时换字体给一句人话，不是空指针', () => {
  const styleId = makeDoc();
  assert.throws(() => setSpecFonts(styleId, { body: 'montserrat' }), /先跑一次「提炼并统一」/);
});

/**
 * 自检那一段是**并发**跑的（六批三路）。
 *
 * 这一步是整条链路最后一段长尾：十二页六批，串行实测要十五分钟，而六批之间互不相干。
 * 并发改成串行（或把上限调成 1）功能照样对，只是整套慢下来——不测就发现不了。
 */
test('自检并发跑：六页六批，多批同时在跑而不是一批一批等', async () => {
  const styleId = makeDoc([], ['cover', 'toc', 'text', 'imageText', 'chart', 'metrics']);
  // 限流器是跨用例共享的，前面哪条撞过限流的话这里会从一个降过档的状态开始
  MODEL_LIMITER.reset();
  let live = 0;
  let maxLive = 0;
  let checkCalls = 0;

  const gateway = {
    async text(req: TextRequest) {
      const sys = req.system ?? '';
      const reply = (text: string) => ({
        text, providerId: 'fake', model: 'fake',
        usage: { inputTokens: 1, outputTokens: 1 },
        degraded: false, degradeReason: '', latencyMs: 1,
      });
      if (sys.includes('提炼出一份')) return reply(SPEC_JSON);
      if (sys.includes('请把这条提示词改成符合规范的样子')) {
        const types = typesIn(req.messages[0]!.content);
        return reply(JSON.stringify({ pages: types.map((t) => ({ pageType: t, prompt: promptFor(t, '（已统一）') })) }));
      }
      if (sys.includes('只报对不上的地方')) {
        checkCalls += 1;
        live += 1;
        maxLive = Math.max(maxLive, live);
        // 让三批有时间重叠上。不等的话先发的那批可能在下一批起来之前就跑完了
        await new Promise<void>((r) => setTimeout(r, 10));
        live -= 1;
        return reply('{"deviations":[]}');
      }
      // 出样机
      return reply(goodHtml('新'));
    },
    async image() { throw new Error('本用例不生成图片'); },
  } as unknown as ProviderGateway;

  const events = await run(styleId, gateway);
  assert.equal(events.at(-1)!.event, 'done');
  assert.equal(checkCalls, 6, '一页一批，六页正好六批');
  /**
   * 上限从 `MODEL_LIMITER.ceiling` 取，**不写死数字**：这个值调过（3 → 6），
   * 写死的话每次调都得回来改一遍，而这条用例真正关心的是「并发了没有」。
   */
  assert.ok(maxLive > 1, `多批该同时在跑；串行的话这里会是 1，实际 ${maxLive}`);
  assert.ok(maxLive <= MODEL_LIMITER.ceiling, `不该超过上限 ${MODEL_LIMITER.ceiling}，实际 ${maxLive}`);
});

/**
 * 自检那一批挂了会**重发一次**。
 *
 * 实测这条是必须的：八套里四套的自检没跑成，全是 `deepseek-v4.1-flash` 把预算烧在推理上、
 * 正文为空；而挂掉的批次下标每套都不一样，是随机抽风而不是某一页特别难比。
 * 自检改成并发之后重发一批只多等一批的时间，不进整轮关键路径，而丢掉整份清单是实打实的损失。
 */
test('自检某一批抽风时重发一次，清单照样拿得到', async () => {
  const styleId = makeDoc([], ['cover', 'toc', 'text', 'imageText']);
  let calls = 0;

  const gateway = {
    async text(req: TextRequest) {
      const sys = req.system ?? '';
      const reply = (text: string) => ({
        text, providerId: 'fake', model: 'fake',
        usage: { inputTokens: 1, outputTokens: 1 },
        degraded: false, degradeReason: '', latencyMs: 1,
      });
      if (sys.includes('提炼出一份')) return reply(SPEC_JSON);
      if (sys.includes('请把这条提示词改成符合规范的样子')) {
        const types = typesIn(req.messages[0]!.content);
        return reply(JSON.stringify({ pages: types.map((t) => ({ pageType: t, prompt: promptFor(t, '（已统一）') })) }));
      }
      if (sys.includes('只报对不上的地方')) {
        calls += 1;
        // 第一次抽风（降级 = 这批没跑成），重发时正常
        if (calls === 1) return reply(MOCK_REPLY);
        return reply('{"deviations":[{"pageType":"cover","field":"title.sizePx","expected":"44px","found":"46px"}]}');
      }
      return reply(goodHtml('新'));
    },
    async image() { throw new Error('本用例不生成图片'); },
  } as unknown as ProviderGateway;

  const events = await run(styleId, gateway);
  const data = events.at(-1)!.data as { checked: boolean; deviations: { field: string }[] };
  assert.equal(data.checked, true, '抽风那批重发一次就该拿到结果');
  assert.ok(data.deviations.length > 0, '重发拿到的清单要留下');
  assert.ok(calls > 2, '第一次抽风那批确实重发过');
});

/**
 * 重发也救不回来时，整轮要标成「自检没跑成」，**不能当成 0 处不一致**。
 *
 * 并发之后这条更容易踩：`mapLimit` 会把抛了的那批换成 `null`，顺手 `filter(Boolean)`
 * 一下就变成「这批没问题」。而界面上「0 处不一致」和「没跑成」是两句话，
 * 前者会让用户以为已经全对齐了。
 */
test('自检有一批两次都挂了就整轮标没跑成，不伪装成 0 处不一致', async () => {
  const styleId = makeDoc([], ['cover', 'toc', 'text', 'imageText']);

  const gateway = {
    async text(req: TextRequest) {
      const sys = req.system ?? '';
      const reply = (text: string) => ({
        text, providerId: 'fake', model: 'fake',
        usage: { inputTokens: 1, outputTokens: 1 },
        degraded: false, degradeReason: '', latencyMs: 1,
      });
      if (sys.includes('提炼出一份')) return reply(SPEC_JSON);
      if (sys.includes('请把这条提示词改成符合规范的样子')) {
        const types = typesIn(req.messages[0]!.content);
        return reply(JSON.stringify({ pages: types.map((t) => ({ pageType: t, prompt: promptFor(t, '（已统一）') })) }));
      }
      // 自检每一次都抽风：重发也救不回来
      if (sys.includes('只报对不上的地方')) return reply(MOCK_REPLY);
      return reply(goodHtml('新'));
    },
    async image() { throw new Error('本用例不生成图片'); },
  } as unknown as ProviderGateway;

  const events = await run(styleId, gateway);
  const done = events.at(-1)!;
  assert.equal(done.event, 'done');
  const data = done.data as { checked: boolean; deviations: unknown[] };
  assert.equal(data.checked, false, '有一批没跑成，整轮就该标没跑成');
  assert.deepEqual(data.deviations, [], '没跑成时不该给出一个「零偏差」的假结论');
  const last = events.filter((e) => e.event === 'progress').at(-1)!.data as { label: string };
  assert.match(last.label, /没跑成/);
});

/**
 * 重新统一**不该把用户点选的字体推回风格原有的栈**。
 *
 * 字体那一档是用户在界面上点出来的（`setSpecFonts`），而重新统一本来是个可以随便点的
 * 动作——推回去的话，用户看到的是「我的设置自己没了」。实测踩过：正文切成系统等宽、
 * 再点一次「重新统一」，那一档悄悄变回 Montserrat。
 */
test('重新统一保留已定过的字体档，只补空着的那几档', async () => {
  const styleId = makeDoc();
  await run(styleId, fakeGateway().gateway);
  setSpecFonts(styleId, { body: 'system-mono' });

  await run(styleId, fakeGateway().gateway);

  const fonts = resolveStyleDoc(styleId).spec!.fonts;
  assert.equal(fonts.body, 'system-mono', '用户点的那一档被推回去了');
  // 没定过的那几档仍然照风格原有的栈推，不能被这条规则连累
  assert.equal(fonts.display, 'cormorant');
  assert.equal(fonts.script, 'system-script');
  assert.equal(fonts.numeric, 'cormorant');
});
