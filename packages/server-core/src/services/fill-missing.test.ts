import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderGateway } from '@lumen/provider-gateway';
import type { PageType, StyleDoc } from '@lumen/ir-schema';

// 环境必须在导入任何模块之前设定
const tmp = mkdtempSync(join(tmpdir(), 'lumen-fill-'));
process.env.NODE_ENV = 'test';
process.env.LUMEN_DB_PATH = join(tmp, 'test.db');
process.env.LUMEN_SECRET_KEY = 'test-secret-key-0123456789abcdefghijklmnop';

const { migrate } = await import('../db/migrate.js');
const { closeDb } = await import('../db/client.js');
const { ensureSeed } = await import('./seed.service.js');
const { saveStyleDoc, resolveStyleDoc } = await import('./style-doc.service.js');
const { fillMissingPageTypes } = await import('./fill-missing.service.js');
const { StyleDoc: StyleDocSchema, PAGE_TYPE_ORDER } = await import('@lumen/ir-schema');

migrate();
ensureSeed();

test.after(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * 补齐已存风格缺的页类型。
 *
 * 全程用假网关：这里要验的是「只补缺的那几类、别的原样带过、一类不缺时一次调用都不发」，
 * 不是模型本身。真调模型会让用例既慢又不确定，在没有 Key 的机器上还会直接失败。
 */

const PALETTE = {
  bg: '#EFE6DA', surface: '#F7F1E8', text: '#3A322B', muted: '#8A7F73',
  accent: '#E08A3C', brand: '#C7421A', border: '#D8CDBF',
};

/** 夹具风格的字体。出样机时必须**明写进调用**——不注入模型会自己发明一套，
 *  与这套风格已有的页摆在一起就是两种字体 */
const FONT = '"Source Han Serif", serif';

/** 四个小节齐全的提示词，推导出来的那几条必须长这样，否则会被当成不合规丢掉 */
function promptFor(t: PageType): string {
  return `角色：${t} 的设计师。\n任务：写 ${t}。\n视觉与排版要求：\n1. 只属于 ${t} 的版式。\n代码要求（非常重要）：\n1. 用 :root 定义变量。`;
}

/** 一份合规的样机 HTML：配色全部走变量，且变量值与色板逐字对上 */
const GOOD_HTML = [
  `<style>:root { --bg:${PALETTE.bg}; --text:${PALETTE.text}; --accent:${PALETTE.accent}; }`,
  '.slide { width: 1920px; height: 1080px; background: var(--bg); color: var(--text); }',
  '</style><div class="slide">样机</div>',
].join('');

/** 推导那一步的模型回复：按请求的页类型给出合规提示词 */
function deriveReply(types: PageType[]): string {
  return JSON.stringify({ pages: types.map((t) => ({ pageType: t, prompt: promptFor(t) })) });
}

interface TextRequest {
  system?: string;
  messages: { content: string; images?: string[] }[];
  maxTokens?: number;
  taskType?: string;
  json?: boolean;
}

/** 假网关：按调用次序吐预设回复，并记下每次收到的请求供断言 */
function fakeGateway(replies: (string | Error)[]) {
  const seen: TextRequest[] = [];
  let i = 0;
  return {
    seen,
    gateway: {
      async text(req: TextRequest) {
        seen.push(req);
        const r = replies[Math.min(i, replies.length - 1)];
        i += 1;
        if (r instanceof Error) throw r;
        return {
          text: r ?? '', providerId: 'fake', model: 'fake',
          usage: { inputTokens: 1, outputTokens: 1 },
          degraded: false, degradeReason: '', latencyMs: 1,
        };
      },
      async image() { throw new Error('本用例不生成图片'); },
    } as unknown as ProviderGateway,
  };
}

let seq = 0;
/**
 * 造一套风格。默认缺 `architecture` / `mindMap` 两类——正是这次新增的两个页类型，
 * 也是真实库里那批老风格的样子（九个，缺这两个）。
 *
 * `meta` 给的是固定值而不是让默认值填：默认的 `createdAt` / `updatedAt` 取 `Date.now()`，
 * 断言「meta 没变」时会因为毫秒级差异变成假阳性。
 */
function makeDoc(missing: PageType[] = ['architecture', 'mindMap'], over: Record<string, unknown> = {}) {
  seq += 1;
  const styleId = `fill-${seq}`;
  const pagePrompts: Record<string, unknown> = {};
  for (const t of PAGE_TYPE_ORDER) {
    if (missing.includes(t)) continue;
    pagePrompts[t] = {
      pageType: t,
      prompt: promptFor(t),
      mockHtml: `<div class="slide">${t} 的旧样机</div>`,
      source: 'reference',
    };
  }
  const doc = StyleDocSchema.parse({
    styleId,
    version: '1.0',
    name: `风格 ${seq}`,
    description: '一句话说明',
    fontFamily: FONT,
    deckPrompt: '整本一套调子',
    palette: PALETTE,
    pagePrompts,
    meta: { builtin: false, reviewed: true, customized: false, createdAt: 1700000000000, updatedAt: 1700000000000 },
    ...over,
  });
  assert.equal(saveStyleDoc(doc).ok, true);
  return styleId;
}

/** 把一次补齐的 SSE 事件收成数组，省得每条用例都写一遍 for await */
async function collect(gen: AsyncGenerator<{ event: string; data: unknown }>) {
  const out: { event: string; data: unknown }[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

test('只补缺失的两个页类型，已有的九个一字未动', async () => {
  const styleId = makeDoc();
  const before = resolveStyleDoc(styleId);
  const { gateway } = fakeGateway([deriveReply(['architecture']), deriveReply(['mindMap']), GOOD_HTML, GOOD_HTML]);
  const events = await collect(fillMissingPageTypes({ styleId, gateway }));

  const done = events.find((e) => e.event === 'done');
  assert.ok(done, '必须给出 done 事件');
  const data = done.data as { doc: StyleDoc; filled: PageType[] };
  assert.deepEqual([...data.filled].sort(), ['architecture', 'mindMap']);
  const after = data.doc;

  // 新补的两类在库里，且是真的落了盘（重新读出来的那份）
  for (const t of ['architecture', 'mindMap'] as PageType[]) {
    assert.ok(after.pagePrompts[t], `${t} 应该补上了`);
  }

  // 已有的九个逐字节不变——这是「补齐」与「重跑」的分界线
  for (const t of PAGE_TYPE_ORDER) {
    if (t === 'architecture' || t === 'mindMap') continue;
    const b = before.pagePrompts[t]!;
    const a = after.pagePrompts[t]!;
    assert.equal(a.prompt, b.prompt, `${t} 的提示词被动了`);
    assert.equal(a.mockHtml, b.mockHtml, `${t} 的样机被动了`);
    assert.equal(a.source, b.source, `${t} 的来源被动了`);
    assert.equal(a.edited, b.edited, `${t} 的编辑标记被动了`);
  }
});

test('补页时能顺带绑版式，样机也照那份骨架出', async () => {
  /*
    两件事一起验，因为它们是同一件事的两半：版式写在页提示词上（补页之前那条提示词
    还不存在，所以没法「先绑再补」），而样机就是在补页这一步生成的——
    绑版式要是发生在之后，样机就没带骨架，风格库里显示的是模型自由发挥的那一版，
    与真生成出来的对不上。界面页尤其明显：样机里一台 CSS 画的假设备、
    真页里是我们渲出来的那台。
  */
  const styleId = makeDoc(['ui']);
  const { gateway, seen } = fakeGateway([deriveReply(['ui']), GOOD_HTML]);
  const layoutId = 'ui/center-phone-hero-type@v1';
  const events = await collect(fillMissingPageTypes({ styleId, gateway, bindLayouts: { ui: layoutId } }));

  const done = events.find((e) => e.event === 'done')!;
  const doc = (done.data as { doc: StyleDoc }).doc;
  assert.equal(doc.pagePrompts.ui?.layoutId, layoutId, '补出来的界面页该绑上指定的版式');

  // 出样机那一次调用里要带上骨架——骨架里嵌着机身图与屏幕的 matrix3d
  const mockCall = seen.at(-1)!;
  const body = mockCall.messages.map((m) => m.content).join('\n');
  assert.match(body, /\/stock\/devices\//, '样机那一轮没带上骨架里的机身图');
  assert.match(body, /matrix3d\(/, '样机那一轮没带上屏幕的坐标变换');
});

test('绑的版式 id 认不出时照常补页，只是不绑', async () => {
  // 绑定失效最该发生的是退回自动候选，而不是让整个补页失败
  const styleId = makeDoc(['ui']);
  const { gateway } = fakeGateway([deriveReply(['ui']), GOOD_HTML]);
  const events = await collect(fillMissingPageTypes({
    styleId, gateway, bindLayouts: { ui: 'ui/这个版式不存在@v1' },
  }));

  const done = events.find((e) => e.event === 'done');
  assert.ok(done, '认不出的版式 id 不该让补页失败');
  const doc = (done.data as { doc: StyleDoc }).doc;
  assert.equal(doc.pagePrompts.ui?.layoutId, '', '认不出的 id 不该被原样写进去');
  assert.equal(doc.pagePrompts.ui?.mockHtml, GOOD_HTML, '样机照常出');
});

test('一类不缺时一个模型调用都不发', async () => {  const styleId = makeDoc([]); // 十一个页类型全在
  const { gateway, seen } = fakeGateway([]);
  const events = await collect(fillMissingPageTypes({ styleId, gateway }));

  // 这条断言是「补齐」不变成「重跑一遍」的闸门：漏了它，一次补齐会把整本重写一遍，
  // 用户等十几分钟、白花一轮钱，已有的页类型还被重新洗过
  assert.equal(seen.length, 0, '不缺任何页类型时不该有任何模型调用');
  const done = events.find((e) => e.event === 'done')!;
  assert.deepEqual((done.data as { filled: PageType[] }).filled, []);
  assert.deepEqual(events.filter((e) => e.event === 'page'), [], '不该报出任何补齐的页');
});

test('补出来的条目 source 是 derived、edited 是 false', async () => {
  const styleId = makeDoc();
  const { gateway } = fakeGateway([deriveReply(['architecture']), deriveReply(['mindMap']), GOOD_HTML, GOOD_HTML]);
  const { doc } = (await collect(fillMissingPageTypes({ styleId, gateway })))
    .find((e) => e.event === 'done')!.data as { doc: StyleDoc };

  for (const t of ['architecture', 'mindMap'] as PageType[]) {
    assert.equal(doc.pagePrompts[t]!.source, 'derived');
    assert.equal(doc.pagePrompts[t]!.edited, false, '机器补的不算用户手改');
    assert.equal(doc.pagePrompts[t]!.prompt, promptFor(t), '用的应该是模型给的那条，不是兜底模板');
  }
});

test('配色、字体、meta 与整本设定一律不动', async () => {
  const styleId = makeDoc();
  const before = resolveStyleDoc(styleId);
  const { gateway } = fakeGateway([deriveReply(['architecture']), deriveReply(['mindMap']), GOOD_HTML, GOOD_HTML]);
  const { doc: after } = (await collect(fillMissingPageTypes({ styleId, gateway })))
    .find((e) => e.event === 'done')!.data as { doc: StyleDoc };

  assert.deepEqual(after.palette, before.palette);
  assert.equal(after.fontFamily, before.fontFamily);
  assert.equal(after.deckPrompt, before.deckPrompt);
  assert.equal(after.name, before.name);
  assert.equal(after.description, before.description);
  assert.equal(after.theme, before.theme);
  // meta：审核状态、内置标记、创建时间都该原样带过（`updatedAt` 例外——落库本就要刷新它）
  assert.equal(after.meta.reviewed, before.meta.reviewed);
  assert.equal(after.meta.builtin, before.meta.builtin);
  assert.equal(after.meta.customized, before.meta.customized);
  assert.equal(after.meta.createdAt, before.meta.createdAt);
});

test('出样机的调用带上了这套风格的字体', async () => {
  const styleId = makeDoc();
  const { gateway, seen } = fakeGateway([deriveReply(['architecture', 'mindMap']), GOOD_HTML, GOOD_HTML]);
  await collect(fillMissingPageTypes({ styleId, gateway }));

  // 第一条是推导、后两条是出样机。样机调用里必须钉死字体，否则模型会自己发明一套
  const mockCall = seen[seen.length - 1]!;
  assert.ok(mockCall.messages[0]!.content.includes(FONT), '出样机要带这套风格的字体');
  assert.ok(mockCall.messages[0]!.content.includes('var(--font-sans)'));
  assert.ok(mockCall.messages[0]!.content.includes(`--bg: ${PALETTE.bg};`), '出样机也要钉死配色');
});

test('风格不存在时给出 error 事件（notFound 由 resolveStyleDoc 抛出）', async () => {
  const { gateway, seen } = fakeGateway([]);
  const events = await collect(fillMissingPageTypes({ styleId: 'not-a-style', gateway }));
  const err = events.find((e) => e.event === 'error');
  assert.ok(err, '风格不存在必须如实报出来');
  assert.ok((err.data as { message: string }).message.includes('风格不存在'));
  assert.equal(seen.length, 0, '风格都没有，不该有任何模型调用');
});

test('网关中途报错时给出 error 事件而不是抛出去', async () => {
  const styleId = makeDoc();
  // 推导那一步就挂掉：这是「never throws」契约最容易破的地方——
  // 抛出去的话调用方的 SSE 连接只会断掉，用户看不到原因，也不知道是白等还是真失败
  const { gateway } = fakeGateway([new Error('网关 503：限流')]);
  const events = await collect(fillMissingPageTypes({ styleId, gateway }));
  const err = events.find((e) => e.event === 'error');
  assert.ok(err, '必须转成 error 事件，不能抛');
  assert.ok((err.data as { message: string }).message.includes('503'));
  assert.equal(events.find((e) => e.event === 'done'), undefined, '失败了就不该再报 done');
});
