import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderGateway } from '@lumen/provider-gateway';

// 环境必须在导入任何模块之前设定
const tmp = mkdtempSync(join(tmpdir(), 'lumen-redraw-'));
process.env.NODE_ENV = 'test';
process.env.LUMEN_DB_PATH = join(tmp, 'test.db');
process.env.LUMEN_SECRET_KEY = 'test-secret-key-0123456789abcdefghijklmnop';

// 下面这套 DB 夹具与 PALETTE 本任务的用例用不到，是 Task 4 / Task 5 要用的。
// 不拆出去是因为环境变量必须先于 import 设定，拆了反而要复制一遍。

const { migrate } = await import('../db/migrate.js');
const { closeDb } = await import('../db/client.js');
const { ensureSeed } = await import('./seed.service.js');
const { saveStyleDoc, resolveStyleDoc } = await import('./style-doc.service.js');
const { splitForPick, redrawPage, replacePagePrompt } = await import('./redraw-page.service.js');
const { StyleDoc } = await import('@lumen/ir-schema');
const { toDataUrl, decodeImage } = await import('@lumen/style-engine/server');

migrate();
ensureSeed();

test.after(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * 分页与重识别。
 *
 * 全程用假网关：这里要验的是「框怎么传、提示词带没带上配色、替换时动了哪几格」，
 * 不是模型本身。真调模型会让用例既慢又不确定，在没有 Key 的机器上还会直接失败。
 */

/**
 * 一张 64×64 的纯色 PNG。
 *
 * 分页的框由假网关给，不靠像素，所以画什么都行——只要 `decodeImage` 解得开。
 * 尺寸取 64 而不是 8：`cropNormalized` 会把归一化框乘回像素再取整，
 * 图太小的时候一个 0.9 宽的框只剩七像素，容易撞上边界处理。
 */
const IMAGE = toDataUrl({ width: 64, height: 64, data: new Uint8Array(64 * 64 * 4).fill(200) });

const PALETTE = {
  bg: '#EFE6DA', surface: '#F7F1E8', text: '#3A322B', muted: '#8A7F73',
  accent: '#E08A3C', brand: '#C7421A', border: '#D8CDBF',
};

/** 夹具风格的字体。与配色一样，重识别时它必须**明写进模型调用**——渲染层注入 `--font-sans`
 *  拦不住模型自己写死的 `body{font-family:…}`（同优先级、片段又排在后），字体就丢了 */
const FONT = '"Source Han Serif", serif';

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

test('分页只找出一页时原样返回那一页', async () => {
  const { gateway } = fakeGateway([
    JSON.stringify({ slides: [{ pageType: 'cover', x0: 0.05, y0: 0.1, x1: 0.95, y1: 0.9 }] }),
  ]);
  const slides = await splitForPick(IMAGE, gateway);
  assert.equal(slides.length, 1);
  assert.equal(slides[0]!.index, 0);
  assert.equal(slides[0]!.pageType, 'cover');
  assert.deepEqual(slides[0]!.box, { x0: 0.05, y0: 0.1, x1: 0.95, y1: 0.9 });
});

test('拼图分出多页时按序返回，每页带自己的裁切框', async () => {
  const { gateway } = fakeGateway([
    JSON.stringify({
      slides: [
        { pageType: 'cover', x0: 0.04, y0: 0.10, x1: 0.96, y1: 0.50 },
        { pageType: 'metrics', x0: 0.04, y0: 0.55, x1: 0.96, y1: 0.95 },
      ],
    }),
  ]);
  const slides = await splitForPick(IMAGE, gateway);
  assert.equal(slides.length, 2);
  assert.deepEqual(slides.map((s) => s.index), [0, 1]);
  assert.deepEqual(slides.map((s) => s.pageType), ['cover', 'metrics']);
  assert.ok(slides[1]!.box.y0 > slides[0]!.box.y1, '两页不该重叠');
});

test('模型一个框都给不出时，整张图当一页，并标成兜底', async () => {
  const { gateway } = fakeGateway([JSON.stringify({ slides: [] })]);
  const slides = await splitForPick(IMAGE, gateway);
  assert.equal(slides.length, 1);
  assert.deepEqual(slides[0]!.box, { x0: 0, y0: 0, x1: 1, y1: 1 });
  // 兜底与「模型如实返回整画布」的框逐位相同，只有这个 flag 能把两者分开。
  // 少了它，界面就分不清「真找到了这一页」与「什么都没找到」
  assert.equal(slides[0]!.fallback, true);
});

test('模型真给出框时不带兜底标记——否则这条 flag 就没有正反两面', async () => {
  const { gateway } = fakeGateway([
    JSON.stringify({ slides: [{ pageType: 'cover', x0: 0, y0: 0, x1: 1, y1: 1 }] }),
  ]);
  const slides = await splitForPick(IMAGE, gateway);
  // 框取整画布，与兜底那一页的框**完全相同**——这正是客户端启发式不可用的原因，
  // 也是这条用例存在的意义：区分两者只能靠 flag，不能靠框的形状
  assert.equal(slides.length, 1);
  assert.deepEqual(slides[0]!.box, { x0: 0, y0: 0, x1: 1, y1: 1 });
  assert.equal(slides[0]!.fallback, undefined);
  assert.ok(!('fallback' in slides[0]!), '真找到的页不该带这个键');
});

test('分页请求确实把图发出去了——参数被调换是这里最容易犯的错', async () => {
  const { gateway, seen } = fakeGateway([JSON.stringify({ slides: [] })]);
  await splitForPick(IMAGE, gateway);
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.taskType, 'style_recognize');
  assert.equal(seen[0]!.json, true);
  assert.deepEqual(seen[0]!.messages[0]!.images, [IMAGE]);
});

const OK_PROMPT = '角色：封面设计师。\n任务：写封面。\n视觉与排版要求：\n1. 大字标题。\n代码要求（非常重要）：\n1. 用 :root 定义变量。';

/** 一份合规的样机 HTML：配色全部走变量，且变量值与色板逐字对上 */
const GOOD_HTML = [
  `<style>:root { --bg:${PALETTE.bg}; --text:${PALETTE.text}; --accent:${PALETTE.accent}; }`,
  '.slide { width: 1920px; height: 1080px; background: var(--bg); color: var(--text); }',
  '</style><div class="slide">封面</div>',
].join('');

let seq = 0;
function makeDoc(over: Record<string, unknown> = {}) {
  seq += 1;
  const styleId = `redraw-${seq}`;
  const doc = StyleDoc.parse({
    styleId,
    version: '1.0',
    name: `风格 ${seq}`,
    description: '一句话说明',
    fontFamily: FONT,
    // 必须给个非空值：`StyleDoc.deckPrompt` 默认是 `''`，不设的话「替换后 deckPrompt
    // 逐字不变」那条断言比的是 `'' === ''`——空的。审查实测：把 deckPrompt 从实现里
    // 整个删掉，124 条全绿
    deckPrompt: '整本一套调子',
    palette: PALETTE,
    pagePrompts: {
      cover: { pageType: 'cover', prompt: OK_PROMPT, mockHtml: '<div>旧封面样机</div>', source: 'reference' },
      text: { pageType: 'text', prompt: OK_PROMPT, mockHtml: '<div>文字页样机</div>', source: 'derived' },
    },
    ...over,
  });
  assert.equal(saveStyleDoc(doc).ok, true);
  return styleId;
}

const FULL_BOX = { x0: 0, y0: 0, x1: 1, y1: 1 };

/** 把一次重识别的 SSE 事件收成数组，省得每条用例都写一遍 for await */
async function collect(gen: AsyncGenerator<{ event: string; data: unknown }>) {
  const out: { event: string; data: unknown }[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

test('重识别按 裁页 → 写提示词 → 出样机 报进度，最后给出提示词与样机', async () => {
  const styleId = makeDoc();
  const { gateway } = fakeGateway([OK_PROMPT, GOOD_HTML]);
  const events = await collect(redrawPage({
    styleId, pageType: 'cover', imageUrl: IMAGE, box: FULL_BOX, gateway,
  }));

  const steps = events.filter((e) => e.event === 'progress').map((e) => (e.data as { step: string }).step);
  assert.deepEqual(steps, ['crop', 'read', 'mock']);

  const done = events.find((e) => e.event === 'done');
  assert.ok(done, '必须给出 done 事件');
  const data = done.data as { prompt: string; mockHtml: string; promptIssues: { rule: string }[] };
  assert.equal(data.prompt, OK_PROMPT);
  assert.ok(data.mockHtml.includes('--bg'), '样机应该是模型吐的那份 HTML');
  assert.deepEqual(data.promptIssues, []);
});

test('按框裁图：发出去的是裁过的那一块，不是整张原图', async () => {
  const styleId = makeDoc();
  const { gateway, seen } = fakeGateway([OK_PROMPT, GOOD_HTML]);
  // 64×64 的图只取右下四分之一 → 32×32
  await collect(redrawPage({
    styleId, pageType: 'cover', imageUrl: IMAGE,
    box: { x0: 0.5, y0: 0.5, x1: 1, y1: 1 },
    gateway,
  }));
  const sent = seen[0]!.messages[0]!.images![0]!;
  // 别断言 data URL 字符串不相等：`toDataUrl` 会重新编码，全幅裁切的字节是否与原图
  // 逐字相同取决于编码器。直接解出来量宽高，恒等裁切（没裁）会量到 64
  const decoded = decodeImage(sent);
  assert.equal(decoded.width, 32, '裁切没生效的话这里还是 64');
  assert.equal(decoded.height, 32);
});

test('写提示词的调用带上了这套风格的配色', async () => {
  const styleId = makeDoc();
  const { gateway, seen } = fakeGateway([OK_PROMPT, GOOD_HTML]);
  await collect(redrawPage({ styleId, pageType: 'cover', imageUrl: IMAGE, box: FULL_BOX, gateway }));
  assert.ok(seen[0]!.messages[0]!.content.includes(PALETTE.bg), '提示词调用里必须有色值');
  assert.ok(seen[0]!.messages[0]!.content.includes('不要照搬'), '必须说清参考图的颜色不算数');
});

test('出样机的调用也带上了同一套配色', async () => {
  const styleId = makeDoc();
  const { gateway, seen } = fakeGateway([OK_PROMPT, GOOD_HTML]);
  await collect(redrawPage({ styleId, pageType: 'cover', imageUrl: IMAGE, box: FULL_BOX, gateway }));
  const mockCall = seen[seen.length - 1]!;
  // 用 `--bg: <值>;` 这种带标点的精确形式，而不是裸的色值：样机首版 lint 不过会重试，
  // 重试的附加文本里带着 lint 抱怨（「应为 #EFE6DA」），裸断言会被那段泄漏文本满足
  assert.ok(mockCall.messages[0]!.content.includes(`--bg: ${PALETTE.bg};`));
});

test('写提示词的调用带上了这套风格的字体', async () => {
  const styleId = makeDoc();
  const { gateway, seen } = fakeGateway([OK_PROMPT, GOOD_HTML]);
  await collect(redrawPage({ styleId, pageType: 'cover', imageUrl: IMAGE, box: FULL_BOX, gateway }));
  const content = seen[0]!.messages[0]!.content;
  // 只靠渲染层注入 --font-sans 是不够的：模型自己写的 body{font-family:…} 与注入那条
  // 同优先级、片段又排在后面，会把它盖掉。所以字体必须和配色一样明写进调用
  assert.ok(content.includes(FONT), '提示词调用里必须有这套风格的字体');
  assert.ok(content.includes('var(--font-sans)'), '必须让页面引用注入的 --font-sans');
  assert.ok(content.includes('不要声明任何具体的字体名'), '必须明说不要自带字体栈');
  assert.ok(content.includes('var(--font-display)'), '必须交代「展示字体」这个角色');
  assert.ok(content.includes('var(--font-script)'), '必须交代「手写体」这个角色');
});

test('出样机的调用也带上了同一套字体', async () => {
  const styleId = makeDoc();
  const { gateway, seen } = fakeGateway([OK_PROMPT, GOOD_HTML]);
  await collect(redrawPage({ styleId, pageType: 'cover', imageUrl: IMAGE, box: FULL_BOX, gateway }));
  const mockCall = seen[seen.length - 1]!;
  assert.ok(mockCall.messages[0]!.content.includes(FONT), '出样机也要钉死字体，否则模型会自己发明一套');
  assert.ok(mockCall.messages[0]!.content.includes('var(--font-sans)'));
});

test('提示词缺小节时带缺失项重试一次，补上了就不算缺失', async () => {
  const styleId = makeDoc();
  const { gateway, seen } = fakeGateway(['角色：只有一段', OK_PROMPT, GOOD_HTML]);
  const events = await collect(redrawPage({
    styleId, pageType: 'cover', imageUrl: IMAGE, box: FULL_BOX, gateway,
  }));
  const done = events.find((e) => e.event === 'done')!;
  assert.deepEqual((done.data as { promptIssues: unknown[] }).promptIssues, []);
  assert.equal(seen.length, 3, '写提示词两次 + 出样机一次');
  // 重试列的是 lint 给出的 message 原文，逐条带「- 」前缀
  assert.ok(
    seen[1]!.messages[0]!.content.includes('- 缺少「任务：」这一段'),
    '重试时要把问题逐条列出来',
  );
  // **重试那一次也要带配色**——最终存下来的就是这一版的提示词，
  // 而配色注入存在的全部理由就是不让模型自己发明一套色。少了这条断言，
  // 把重试分支的 palette 删掉 13 条用例全绿（审查实测）
  assert.ok(seen[1]!.messages[0]!.content.includes(PALETTE.bg), '重试也要带配色');
  // 字体同理：重试那一版才是最终落库的，重试分支漏了它，字体就还是跟着模型自己发明的走
  assert.ok(seen[1]!.messages[0]!.content.includes(FONT), '重试也要带字体');
});

test('重试后仍缺小节就如实标出，但不阻断', async () => {
  const styleId = makeDoc();
  const { gateway } = fakeGateway(['角色：只有一段', '角色：还是只有一段', GOOD_HTML]);
  const events = await collect(redrawPage({
    styleId, pageType: 'cover', imageUrl: IMAGE, box: FULL_BOX, gateway,
  }));
  const done = events.find((e) => e.event === 'done')!;
  const issues = (done.data as { promptIssues: { rule: string; message: string }[] }).promptIssues;
  assert.ok(issues.some((i) => i.rule === 'prompt/missing-section' && i.message.includes('任务：')));
  assert.ok(issues.some((i) => i.rule === 'prompt/missing-section' && i.message.includes('代码要求（非常重要）：')));
});

test('只缺一个小节也要重试——那正是最容易发生的一档', async () => {
  const styleId = makeDoc();
  // 只差「代码要求（非常重要）：」这一段，而少了它生成的 HTML 就不会用 :root 变量
  const oneMissing = '角色：x\n任务：y\n视觉与排版要求：\n1. z';
  const { gateway, seen } = fakeGateway([oneMissing, OK_PROMPT, GOOD_HTML]);
  const events = await collect(redrawPage({
    styleId, pageType: 'cover', imageUrl: IMAGE, box: FULL_BOX, gateway,
  }));
  assert.equal(seen.length, 3, '缺一个也要重试');
  assert.deepEqual(
    (events.find((e) => e.event === 'done')!.data as { promptIssues: unknown[] }).promptIssues,
    [],
  );
});

test('写死 img 的 src 也算不合契约，要重试', async () => {
  const styleId = makeDoc();
  // 四个小节都在、顺序也对，只有图片位写死了 src——旧的「只查小节在不在」
  // 判据会放过它，而这条提示词换不了图
  const badImg = `${OK_PROMPT}\n<img src="https://example.com/a.png">`;
  const { gateway, seen } = fakeGateway([badImg, OK_PROMPT, GOOD_HTML]);
  const events = await collect(redrawPage({
    styleId, pageType: 'cover', imageUrl: IMAGE, box: FULL_BOX, gateway,
  }));
  assert.equal(seen.length, 3, '写死 src 也要重试');
  assert.deepEqual(
    (events.find((e) => e.event === 'done')!.data as { promptIssues: unknown[] }).promptIssues,
    [],
  );
});

test('样机过不了 lint 时仍给出结果，并把问题带出来', async () => {
  const styleId = makeDoc();
  const wrong = '<style>:root { --bg:#0B0B10; }</style><div class="slide">x</div>';
  const { gateway } = fakeGateway([OK_PROMPT, wrong, wrong]);
  const events = await collect(redrawPage({
    styleId, pageType: 'cover', imageUrl: IMAGE, box: FULL_BOX, gateway,
  }));
  const done = events.find((e) => e.event === 'done');
  assert.ok(done, '样机不合规不该让整次重识别失败');
  assert.ok((done.data as { issues: string[] }).issues.length > 0);
});

test('模型没写出提示词时给出 error 事件而不是抛出去', async () => {
  const styleId = makeDoc();
  const { gateway } = fakeGateway(['', '']);
  const events = await collect(redrawPage({
    styleId, pageType: 'cover', imageUrl: IMAGE, box: FULL_BOX, gateway,
  }));
  const err = events.find((e) => e.event === 'error');
  assert.ok(err);
  assert.ok((err.data as { message: string }).message.includes('提示词'));
});

test('风格不存在时给出 error 事件', async () => {
  const { gateway } = fakeGateway([OK_PROMPT]);
  const events = await collect(redrawPage({
    styleId: 'not-a-style', pageType: 'cover', imageUrl: IMAGE, box: FULL_BOX, gateway,
  }));
  const err = events.find((e) => e.event === 'error');
  assert.ok(err);
  assert.ok((err.data as { message: string }).message.includes('风格不存在'));
});

const NEW_PROMPT = '角色：新封面设计师。\n任务：写新封面。\n视觉与排版要求：\n1. 新的大字标题。\n代码要求（非常重要）：\n1. 用 :root 定义变量。';
const NEW_MOCK = `<style>:root { --bg:${PALETTE.bg}; }</style><div class="slide">新封面</div>`;

test('替换只动指定那一格，其余一律原样', () => {
  const styleId = makeDoc();
  const before = resolveStyleDoc(styleId);
  const { doc: after } = replacePagePrompt({ styleId, pageType: 'cover', prompt: NEW_PROMPT, mockHtml: NEW_MOCK });

  assert.equal(after.pagePrompts.cover!.prompt, NEW_PROMPT);
  assert.equal(after.pagePrompts.cover!.mockHtml, NEW_MOCK);

  assert.equal(after.pagePrompts.text!.prompt, before.pagePrompts.text!.prompt);
  assert.equal(after.pagePrompts.text!.mockHtml, before.pagePrompts.text!.mockHtml);
  assert.equal(after.name, before.name);
  assert.equal(after.description, before.description);
  assert.equal(after.fontFamily, before.fontFamily);
  assert.equal(after.deckPrompt, before.deckPrompt);
  assert.deepEqual(after.palette, before.palette);
});

test('替换后标成手改，并且可以再次替换', () => {
  const styleId = makeDoc();
  const { doc: first } = replacePagePrompt({ styleId, pageType: 'cover', prompt: NEW_PROMPT, mockHtml: NEW_MOCK });
  assert.equal(first.pagePrompts.cover!.source, 'manual');
  assert.equal(first.pagePrompts.cover!.edited, true);

  const { doc: again } = replacePagePrompt({ styleId, pageType: 'cover', prompt: OK_PROMPT, mockHtml: GOOD_HTML });
  assert.equal(again.pagePrompts.cover!.prompt, OK_PROMPT, '第二次替换读到的是第一次的结果，直接覆盖');
});

test('替换时服务端自己重算样机的 lint 问题', () => {
  const styleId = makeDoc();
  const wrong = '<style>:root { --bg:#0B0B10; }</style><div class="slide">x</div>';
  const { doc: after } = replacePagePrompt({ styleId, pageType: 'cover', prompt: NEW_PROMPT, mockHtml: wrong });
  assert.ok(after.pagePrompts.cover!.issues.length > 0, 'issues 是派生数据，由服务端算而不是客户端传');
});

test('提示词不合契约时照样保存，但把问题带出来', () => {
  const styleId = makeDoc();
  // 缺了「代码要求（非常重要）：」这一段。saveStyleDoc 的 ok 仍为 true（它只在整个 doc
  // 一条非空提示词都没有时才 false），所以只看 ok 的话这个问题就断了
  const broken = '角色：x\n任务：y\n视觉与排版要求：\n1. z';
  const { issues } = replacePagePrompt({ styleId, pageType: 'cover', prompt: broken, mockHtml: NEW_MOCK });
  assert.ok(
    issues.some((i) => i.pageType === 'cover' && i.message.includes('代码要求')),
    '契约问题必须带出去，否则从重试到落库全程无人知晓',
  );
});

test('别的页类型早就有问题，也不该报成这次替换的后果', () => {
  const styleId = makeDoc({
    pagePrompts: {
      cover: { pageType: 'cover', prompt: OK_PROMPT, mockHtml: '<div>旧封面样机</div>', source: 'reference' },
      // chart 这条本来就不全，跟这次替换无关
      chart: { pageType: 'chart', prompt: '角色：x\n任务：y', mockHtml: '<div>图表样机</div>', source: 'derived' },
    },
  });
  const { issues } = replacePagePrompt({ styleId, pageType: 'cover', prompt: NEW_PROMPT, mockHtml: NEW_MOCK });
  assert.deepEqual(issues, [], '换的是封面，chart 老早缺的那一段不该算在这次头上');
});

/* ---------------- 版式绑定（风格库「换版式」） ---------------- */

/**
 * `layoutId` 的三种语义：传新 id = 换绑，传空串 = 解绑，**不传 = 不动**。
 *
 * 中间那条最要紧：直接改这一页（挪元素）与传参考图重做都会走这条 PUT，而前者
 * **不传** `layoutId`。把「不传」也当成清空的话，用户绑好的默认版式会在下一次
 * 挪元素时无声无息地掉——界面上什么都不会显示，页面上也看不出区别。
 */
test('layoutId 不传时保持原绑定，传空串才解绑', () => {
  const styleId = makeDoc({
    pagePrompts: {
      cover: {
        pageType: 'cover', prompt: OK_PROMPT, mockHtml: GOOD_HTML,
        source: 'manual', edited: true, layoutId: 'people/row-hex-team@v1',
      },
    },
  });

  // 挪元素：只改样机，不传 layoutId
  const { doc: moved } = replacePagePrompt({
    styleId, pageType: 'cover', prompt: OK_PROMPT, mockHtml: NEW_MOCK,
  });
  assert.equal(
    moved.pagePrompts.cover!.layoutId, 'people/row-hex-team@v1',
    '不传 layoutId 不该把绑定冲掉——挪元素与绑定是两件事',
  );

  // 换绑
  const { doc: rebound } = replacePagePrompt({
    styleId, pageType: 'cover', prompt: OK_PROMPT, mockHtml: NEW_MOCK, layoutId: 'people/grid-six@v1',
  });
  assert.equal(rebound.pagePrompts.cover!.layoutId, 'people/grid-six@v1');

  // 解绑
  const { doc: unbound } = replacePagePrompt({
    styleId, pageType: 'cover', prompt: OK_PROMPT, mockHtml: NEW_MOCK, layoutId: '',
  });
  assert.equal(unbound.pagePrompts.cover!.layoutId, '', '空串是「解绑」，不是「不动」');
});

test('风格不存在时抛错', () => {
  assert.throws(
    () => replacePagePrompt({ styleId: 'not-a-style', pageType: 'cover', prompt: NEW_PROMPT, mockHtml: NEW_MOCK }),
    /风格不存在/,
  );
});
