import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 环境必须在导入任何模块之前设定（service 链上挂着 db/client）
const tmp = mkdtempSync(join(tmpdir(), 'lumen-reclayout-'));
process.env.NODE_ENV = 'test';
process.env.LUMEN_DB_PATH = join(tmp, 'test.db');
process.env.LUMEN_SECRET_KEY = 'test-secret-key-0123456789abcdefghijklmnop';

const { migrate } = await import('../db/migrate.js');
const { closeDb } = await import('../db/client.js');
const { runLayoutRecognition } = await import('./recognize-layout.service.js');
const { listStudioLayouts } = await import('./studio-layout.service.js');

migrate();

test.after(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * 版式识别。
 *
 * 全程用假网关：要验的是「合规怎么判、不合规怎么重试、两次都不合规怎么收场」，
 * 不是模型本身。真调模型既慢又不确定。
 */

interface TextRequest {
  system?: string;
  messages: { content: string; images?: string[] }[];
  maxTokens?: number;
}

/** 合规骨架：配色全走变量、图位从 1 连续、没有 object-fit */
const OK_SKELETON = [
  '<style>.s{width:1920px;height:1080px;background:var(--bg);color:var(--text)}</style>',
  '<div class="s">',
  '<img data-lumen-image="1"><img data-lumen-image="2">',
  '<img data-lumen-image="3"><img data-lumen-image="4">',
  '</div>',
].join('');

/** 不合规：写死了十六进制色值。这是模型最常犯的一条，也正是 lint 会判死的那条 */
const HEX_SKELETON = OK_SKELETON.replace('var(--bg)', '#FF00AA').replace('var(--text)', '#00FF00');

const IMAGE = 'data:image/png;base64,iVBORw0KGgo=';

function reply(name: string, skeleton: string, group = 'multi') {
  return JSON.stringify({ name, brief: '四张图等宽并排铺满整页', group, skeleton });
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
      async image() {
        throw new Error('本用例不生成图片');
      },
    },
  };
}

async function run(replies: (string | Error)[], moduleId: 'image-layouts' | 'people-layouts' = 'image-layouts') {
  const { gateway, seen } = fakeGateway(replies);
  const events: { event: string; data: unknown }[] = [];
  for await (const evt of runLayoutRecognition({
    moduleId,
    imageUrls: [IMAGE],
    tenantId: 't1',
    userId: 'u1',
    gateway: gateway as never,
  })) {
    events.push(evt as { event: string; data: unknown });
  }
  return { events, seen };
}

const steps = (events: { event: string; data: unknown }[]) =>
  events.filter((e) => e.event === 'progress').map((e) => (e.data as { step: string }).step);

test('一次就合规：read → check，吐出骨架，且不落库', async () => {
  const before = listStudioLayouts().length;
  const { events, seen } = await run([reply('四宫格等分', OK_SKELETON)]);

  assert.deepEqual(steps(events), ['read', 'read', 'check']);
  const last = events.at(-1)!;
  assert.equal(last.event, 'skeleton', JSON.stringify(events));
  const data = last.data as { name: string; brief: string; group: string; skeleton: string; slots: number };
  assert.equal(data.name, '四宫格等分');
  assert.equal(data.skeleton, OK_SKELETON);
  assert.equal(data.slots, 4, '图位数由服务端数出来');
  assert.equal(seen.length, 1, '合规就不该重试');

  // 识别是只读的：没落库，用户没点保存之前库里不该多东西
  assert.equal(listStudioLayouts().length, before, '识别流不该写库');
});

test('骨架里必须有图位与 style 块，提示词里逐条复述了硬约束', async () => {
  const { seen } = await run([reply('四宫格等分', OK_SKELETON)]);
  const system = seen[0]!.system ?? '';
  // 这三条是最容易失败的地方，提示词里必须逐条写出来而不是含糊说「用变量」
  assert.ok(system.includes('data-lumen-image'), '没写图位怎么写');
  assert.ok(system.includes('不写 `src`'), '没说清图位不写 src');
  assert.ok(system.includes('object-fit'), '没禁止 object-fit——会被页面样式表压掉');
  assert.ok(system.includes('var(--bg)'), '没列出可用的变量名');
  assert.ok(system.includes('不要写 `#RRGGBB`'), '没禁死十六进制');
  assert.ok(system.includes('<script>'), '没禁止 script 与外链');
});

test('不合规就带问题重写一版，重试那次仍然报 check（阶段序不倒退）', async () => {
  const { events, seen } = await run([reply('坏骨架', HEX_SKELETON), reply('好骨架', OK_SKELETON)]);

  // 两次 check 连着来，中间没有插一次 read——插了的话阶段徽标会往回退，看着像卡住又重来
  assert.deepEqual(steps(events), ['read', 'read', 'check', 'check']);
  assert.equal(events.at(-1)!.event, 'skeleton');
  assert.equal((events.at(-1)!.data as { name: string }).name, '好骨架');
  assert.equal(seen.length, 2, '应该重试一次');

  // 第二次的提示词里必须带上上一版的具体问题，不能只说「重写一版」
  const retryAsk = seen[1]!.messages[0]!.content;
  assert.ok(retryAsk.includes('请重写一版'), retryAsk.slice(0, 120));
  assert.ok(/#FF00AA/i.test(retryAsk), '没把上一版写死的色值原样报回去');
});

test('两次都不合规就报错，且不吐骨架、不落库', async () => {
  const before = listStudioLayouts().length;
  const { events, seen } = await run([reply('坏', HEX_SKELETON), reply('还是坏', HEX_SKELETON)]);

  assert.equal(seen.length, 2, '只重试一次，不该无限重试');
  const last = events.at(-1)!;
  assert.equal(last.event, 'error', JSON.stringify(events));
  assert.ok((last.data as { message: string }).message.includes('没能识别成可用的图文排版骨架'));
  assert.equal(events.some((e) => e.event === 'skeleton'), false, '不合规的骨架一个字都不该吐出去');
  assert.equal(listStudioLayouts().length, before);
});

test('模型吐回来的不是 JSON 时，按不合规处理而不是崩掉', async () => {
  const { events } = await run(['这不是 JSON', reply('好骨架', OK_SKELETON)]);
  assert.equal(events.at(-1)!.event, 'skeleton', '第一次读不出骨架应该走重试那条路');
});

test('图文排版的分组由图位张数算，模型给什么都不作数', async () => {
  // 四宫格 → 4 个图位 → multi。模型编的那个分组被丢掉
  const { events } = await run([reply('四宫格等分', OK_SKELETON, '我编的分组')]);
  const data = events.at(-1)!.data as { group: string };
  assert.equal(data.group, 'multi', '四个图位该落在多图排版那一组');

  // 一个图位的骨架落在 feature——哪怕模型报的是 multi
  const one = '<style>.s{background:var(--bg)}</style><div class="s"><img data-lumen-image="1"></div>';
  const single = await run([reply('满屏大图', one, 'multi')]);
  assert.equal((single.events.at(-1)!.data as { group: string }).group, 'feature');
});

test('图文排版的提示词不问模型分组，人物排版的才列候选', async () => {
  const { seen } = await run([reply('四宫格等分', OK_SKELETON)]);
  const ask = seen[0]!.messages[0]!.content;
  assert.ok(ask.includes('图文排版'), '没说清这次要识别的是哪一种版式库');
  // 分组是算出来的，问了模型也只会在 feature/multi 之间瞎猜
  assert.ok(ask.includes('不用你判断'), '还是让模型填分组了');

  const people = await run([reply('左右分栏', OK_SKELETON, 'solo')], 'people-layouts');
  const peopleAsk = people.seen[0]!.messages[0]!.content;
  for (const g of ['solo', 'multi']) assert.ok(peopleAsk.includes(g), `候选里少了 ${g}`);
});

test('两个库的图位约定正好相反，提示词不能共用一份', async () => {
  const gallery = await run([reply('四宫格等分', OK_SKELETON)]);
  const gallerySystem = gallery.seen[0]!.system ?? '';
  assert.ok(gallerySystem.includes('绝对不要写 `data-lumen-cutout`'), '没禁止抠图标记——图阵里会冒出人像');
  assert.ok(gallerySystem.includes('object-fit:cover'), '没要求裁满格子——照片会被拉变形');

  const people = await run([reply('左右分栏', OK_SKELETON, 'solo')], 'people-layouts');
  const peopleSystem = people.seen[0]!.system ?? '';
  assert.ok(peopleSystem.includes('data-lumen-cutout="half"'), '没写清人像位的取景标记');
  assert.ok(peopleSystem.includes('不要给 `<img>` 写 `object-fit`'), '没禁止 object-fit——会被页面样式表压掉');
});

test('没有参考图时直接报错，不调模型', async () => {
  const { gateway, seen } = fakeGateway([reply('不该被调用', OK_SKELETON)]);
  const events: { event: string; data: unknown }[] = [];
  for await (const evt of runLayoutRecognition({
    moduleId: 'people-layouts', imageUrls: [], tenantId: 't1', userId: 'u1', gateway: gateway as never,
  })) {
    events.push(evt as { event: string; data: unknown });
  }
  assert.equal(events.length, 1);
  assert.equal(events[0]!.event, 'error');
  assert.equal(seen.length, 0, '没有图就不该调模型');
});

test('模型抛错时收成一条 error 事件，不把异常漏出去', async () => {
  const { events } = await run([new Error('provider 挂了')]);
  const last = events.at(-1)!;
  assert.equal(last.event, 'error');
  assert.equal((last.data as { message: string }).message, 'provider 挂了');
});

test('人物排版认的是人物骨架：同样的骨架在人物排版下不查张数下限', async () => {
  const twoSlots = [
    '<style>.s{background:var(--bg)}</style>',
    '<div class="s"><img data-lumen-image="1" data-lumen-cutout="1"><img data-lumen-image="2"></div>',
  ].join('');
  const { gateway } = fakeGateway([reply('左右分栏', twoSlots, 'solo')]);
  const events: { event: string; data: unknown }[] = [];
  for await (const evt of runLayoutRecognition({
    moduleId: 'people-layouts', imageUrls: [IMAGE], tenantId: 't1', userId: 'u1', gateway: gateway as never,
  })) {
    events.push(evt as { event: string; data: unknown });
  }
  assert.equal(events.at(-1)!.event, 'skeleton');
  const data = events.at(-1)!.data as { group: string; slots?: number };
  assert.equal(data.group, 'solo');
  assert.equal(data.slots, undefined, '人物排版不该有 slots');
});
