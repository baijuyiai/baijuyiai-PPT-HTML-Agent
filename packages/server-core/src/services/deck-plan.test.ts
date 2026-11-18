import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 环境必须在导入任何模块之前设定
const tmp = mkdtempSync(join(tmpdir(), 'lumen-deckplan-'));
process.env.NODE_ENV = 'test';
process.env.LUMEN_DB_PATH = join(tmp, 'test.db');
process.env.LUMEN_SECRET_KEY = 'test-secret-key-0123456789abcdefghijklmnop';

const { migrate } = await import('../db/migrate.js');
const { closeDb } = await import('../db/client.js');
const { ensureSeed } = await import('./seed.service.js');
const { createUser } = await import('./user.service.js');
const { createProject, requireProject, updateProject } = await import('./project.service.js');
const { readDeckMeta, saveOutline } = await import('./generate.service.js');
const { planDeckOutline, planLessons } = await import('./deck-plan.service.js');
const { acquireGeneration, releaseGeneration, isGenerating } = await import('../lib/generation-lock.js');
const { buildOutline } = await import('@lumen/content-engine');
const { DEPTH_BRIEF } = await import('@lumen/ir-schema');
const { MOCK_PLACEHOLDER_MARKER } = await import('@lumen/provider-gateway');

migrate();
ensureSeed();

test.after(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * 提纲与教案这两段。
 *
 * 全程用假网关：要验的是「提示词怎么拼、模型不给东西时怎么收场、人工痕迹保不保得住」，
 * 不是模型本身。真调模型会让用例既慢又不确定，还会在没有 Key 的机器上直接失败。
 */

const BRIEF = [
  '1. 市场现状',
  '过去三年，企业级演示工具市场增长了 210%，在线协作类产品占比从 12% 提升到 34%。',
  '',
  '2. 我们的方案',
  '我们提供从想法到成品的全链路能力，首年目标覆盖 3000 家企业客户。',
].join('\n');

interface TextRequest {
  system?: string;
  messages: { role: string; content: string }[];
  taskType?: string;
}

/** 假网关：按调用次序吐预设回复，并记下每次收到的请求供断言 */
function fakeGateway(replies: (string | Error)[], delayMs = 0) {
  const seen: TextRequest[] = [];
  let i = 0;
  return {
    seen,
    gateway: {
      async text(req: TextRequest) {
        seen.push(req);
        const r = replies[Math.min(i, replies.length - 1)];
        i += 1;
        // 默认不延迟。只有「两条流同时跑」那类用例需要它
        if (delayMs > 0) await new Promise((res) => setTimeout(res, delayMs));
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

/** 一份合契约的提纲回复，页数与骨架对齐 */
function outlineReply(pageCount: number) {
  return JSON.stringify({
    pages: Array.from({ length: pageCount }, (_, i) => ({
      index: i,
      title: `模型改的标题 ${i + 1}`,
      claim: `模型改的主张 ${i + 1}`,
      points: ['模型改的要点'],
      pageType: i === 0 ? 'cover' : 'text',
    })),
  });
}

function lessonReply(n: number, over: Partial<{ visualForm: string }> = {}) {
  return JSON.stringify({
    title: `写实的标题 ${n}`,
    claim: `写实的主张 ${n}`,
    points: [`数字 ${n}00%`],
    visualForm: '左右分栏',
    designNote: '先让数字说话',
    ...over,
  });
}

/*
  内置提纲里有一页是图文页，而图文页的教案必须写明几张图（见 lessonProblems）。
  所以整本跑的那几条得用带张数的回复，否则那一页每轮都会被打回重写，调用次数对不上。
  只跑单页、或专门测「不查张数」的那几条仍用 lessonReply。
*/
function lessonReplyWithCount(n: number, over: Partial<{ visualForm: string }> = {}) {
  return lessonReply(n, { visualForm: '两张图：左右分栏', ...over });
}

let seq = 0;
function makeProject() {
  seq += 1;
  const user = createUser({
    username: `dp${Date.now()}${Math.floor(Math.random() * 100000)}`,
    password: 'abcd1234',
    role: 'user',
    source: 'self_signup',
  });
  return createProject({
    tenantId: user.tenantId,
    ownerId: user.userId,
    title: `增长战略 ${seq}`,
    brief: BRIEF,
  });
}

/** 把一条生成器抽干，按事件名分组 */
async function drain(gen: AsyncGenerator<{ event: string; data: unknown }>) {
  const byName = new Map<string, unknown[]>();
  for await (const evt of gen) {
    const list = byName.get(evt.event) ?? [];
    list.push(evt.data);
    byName.set(evt.event, list);
  }
  return byName;
}

const skeletonOf = (title: string) => buildOutline({ title, brief: BRIEF, audienceTag: 'general' }).outline;

/* ---------------- 提纲 ---------------- */

test('提纲：模型在骨架上重写，页数与页序以骨架为准', async () => {
  const project = makeProject();
  const skeleton = skeletonOf(project.title);
  const { gateway } = fakeGateway([outlineReply(skeleton.length)]);

  const events = await drain(planDeckOutline({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    depth: 'standard',
    gateway: gateway as never,
  }));

  const outlineEvent = events.get('outline')?.[0] as { outline: never[]; degraded: boolean };
  assert.ok(outlineEvent, '应发出 outline 事件');
  assert.equal(outlineEvent.degraded, false);
  assert.equal(outlineEvent.outline.length, skeleton.length, '页数由骨架定死');
  assert.equal(readDeckMeta(project.projectId).outline?.length, skeleton.length, '要落库');
});

test('提纲：模型多给的页丢掉、少给的页留骨架原样', async () => {
  const project = makeProject();
  const skeleton = skeletonOf(project.title);
  // 只回前两页，且多塞了一个越界的下标
  const reply = JSON.stringify({
    pages: [
      { index: 0, title: '改过的封面', claim: 'C0', points: [], pageType: 'cover' },
      { index: 1, title: '改过的第二页', claim: 'C1', points: [], pageType: 'text' },
      { index: 99, title: '不该存在的页', claim: 'X', points: [], pageType: 'text' },
    ],
  });
  const { gateway } = fakeGateway([reply]);

  const events = await drain(planDeckOutline({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    depth: 'standard',
    gateway: gateway as never,
  }));

  const outline = (events.get('outline')?.[0] as { outline: { title: string }[] }).outline;
  assert.equal(outline.length, skeleton.length, '页数仍以骨架为准');
  assert.equal(outline[0]!.title, '改过的封面', '模型给的措辞要采纳');
  assert.equal(outline[2]!.title, skeleton[2]!.title, '模型没给的页留骨架原样');
  assert.ok(!outline.some((p) => p.title === '不该存在的页'), '越界的页要丢掉');
});

test('提纲：三档深度问模型的提示词不同', async () => {
  const seenByDepth = new Map<string, string>();
  for (const depth of ['shallow', 'standard', 'deep'] as const) {
    const project = makeProject();
    const skeleton = skeletonOf(project.title);
    const { gateway, seen } = fakeGateway([outlineReply(skeleton.length)]);
    await drain(planDeckOutline({
      projectId: project.projectId,
      tenantId: project.tenantId,
      userId: project.ownerId,
      depth,
      gateway: gateway as never,
    }));
    seenByDepth.set(depth, seen[0]!.messages[0]!.content);
  }

  const values = [...seenByDepth.values()];
  assert.equal(new Set(values).size, 3, '三档的提示词必须互不相同');
  // 说明取自同一份 DEPTH_BRIEF——界面小字与发给模型的必须是同一句话
  for (const [depth, content] of seenByDepth) {
    assert.ok(
      content.includes(DEPTH_BRIEF[depth as keyof typeof DEPTH_BRIEF]),
      `${depth} 档应把 DEPTH_BRIEF 原文发下去`,
    );
  }
});

test('提纲：模型不可用时原样返回规则骨架并标降级，不抛', async () => {
  const project = makeProject();
  const skeleton = skeletonOf(project.title);
  // 内置 Mock 的占位说明过得了 JSON 解析，必须靠标记拦下来
  const { gateway } = fakeGateway([`${MOCK_PLACEHOLDER_MARKER}，这是一段说明文字。`]);

  const events = await drain(planDeckOutline({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    depth: 'standard',
    gateway: gateway as never,
  }));

  assert.equal(events.get('error'), undefined, '不该抛错，降级不是失败');
  const outlineEvent = events.get('outline')?.[0] as { outline: { title: string }[]; degraded: boolean };
  assert.equal(outlineEvent.degraded, true, '要如实标出这一轮没走模型');
  assert.deepEqual(
    outlineEvent.outline.map((p) => p.title),
    skeleton.map((p) => p.title),
    '降级时给的就是规则骨架',
  );
  const done = events.get('done')?.[0] as { degraded: boolean };
  assert.equal(done.degraded, true);
});

test('提纲：模型报错也不抛，同样退回规则骨架', async () => {
  const project = makeProject();
  const { gateway } = fakeGateway([new Error('连接超时')]);
  const events = await drain(planDeckOutline({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    depth: 'standard',
    gateway: gateway as never,
  }));
  assert.equal(events.get('error'), undefined);
  assert.equal((events.get('outline')?.[0] as { degraded: boolean }).degraded, true);
});

test('提纲：人工改过的页在重跑时原样保留，并如实报出跳过了几页', async () => {
  const project = makeProject();
  const skeleton = skeletonOf(project.title);
  // 先手工改掉第 2 页，打上人工痕迹
  const handEdited = skeleton.map((p, i) => (i === 1 ? { ...p, title: '我自己写的标题', edited: true } : p));
  saveOutline(project.projectId, project.tenantId, handEdited);

  const { gateway } = fakeGateway([outlineReply(skeleton.length)]);
  const events = await drain(planDeckOutline({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    depth: 'standard',
    gateway: gateway as never,
  }));

  const outline = (events.get('outline')?.[0] as { outline: { title: string }[] }).outline;
  assert.equal(outline[1]!.title, '我自己写的标题', '手改的那一页不能被模型重写盖掉');
  assert.equal(outline[0]!.title, '模型改的标题 1', '没改过的页照常被重写');
  assert.equal((events.get('done')?.[0] as { skippedEdited: number }).skippedEdited, 1, '要如实报出跳过了几页');
});

/* ---------------- 教案 ---------------- */

test('教案：一页一次调用，每次调用都带上整本提纲', async () => {
  const project = makeProject();
  const skeleton = skeletonOf(project.title);
  saveOutline(project.projectId, project.tenantId, skeleton);

  const { gateway, seen } = fakeGateway([lessonReplyWithCount(1)]);

  const events = await drain(planLessons({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: gateway as never,
  }));

  assert.equal(seen.length, skeleton.length, '一页一次调用');
  assert.equal(seen[0]!.taskType, 'page_content', '教案走 page_content 路由');
  // 整本提纲每页都要出现在上下文里——它是这条叙事线，缺了每页就会写成「本节要点」
  for (const content of seen.map((r) => r.messages[0]!.content)) {
    for (const p of skeleton) {
      assert.ok(content.includes(p.title), `上下文里应有「${p.title}」这一页`);
    }
  }

  const done = events.get('done')?.[0] as { succeeded: number; outline: { visualForm?: string }[] };
  assert.equal(done.succeeded, skeleton.length);
  assert.equal(done.outline[0]!.visualForm, '两张图：左右分栏', '教案要落到大纲上');
  assert.equal(readDeckMeta(project.projectId).outline?.[0]?.visualForm, '两张图：左右分栏', '要落库');
});

test('教案：提示词里带上这一页的页类型，以及该页类型必须交代的事', async () => {
  const project = makeProject();
  const skeleton = skeletonOf(project.title);
  // 把第 0 页改成图片排版页——「多图」这类页类型对教案的要求最具体，最能看出带没带
  saveOutline(project.projectId, project.tenantId,
    skeleton.map((p, i) => (i === 0 ? { ...p, pageType: 'gallery' as const } : p)));

  const { gateway, seen } = fakeGateway([lessonReply(1)]);
  await drain(planLessons({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    only: [0],
    gateway: gateway as never,
  }));

  const content = seen[0]!.messages[0]!.content;
  assert.ok(content.includes('图片排版页'), '要告诉模型这一页是什么页类型');
  assert.ok(content.includes('几张图'), '要告诉它图片排版页必须写明张数与每张画什么');
  // 页类型说明来自 `PAGE_TYPE_BRIEF`，与风格提示词那边同源
  assert.ok(content.includes('以图为主'), '要带上这个页类型的画面说明');
});

test('教案：图片排版页没写明几张图时打回重写，写明了才收', async () => {
  const project = makeProject();
  const skeleton = skeletonOf(project.title);
  saveOutline(project.projectId, project.tenantId,
    skeleton.map((p, i) => (i === 0 ? { ...p, pageType: 'gallery' as const } : p)));

  // 第一次回的视觉形式看不出张数，第二次才写明
  const vague = JSON.stringify({
    title: '图组', claim: '看图', points: ['一', '二'], visualForm: '多张图铺开，以图为主', designNote: '',
  });
  const ok = JSON.stringify({
    title: '图组', claim: '看图', points: ['一', '二'],
    visualForm: '四张图：办公室／代码／会议／交付', designNote: '',
  });
  const { gateway, seen } = fakeGateway([vague, ok]);

  await drain(planLessons({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    only: [0],
    gateway: gateway as never,
  }));

  assert.equal(seen.length, 2, '第一次不合要求，该再要一次');
  assert.ok(
    seen[1]!.messages.some((m) => m.role === 'user' && m.content.includes('几张图')),
    '第二次要把问题说清楚',
  );
  assert.equal(
    readDeckMeta(project.projectId).outline?.[0]?.visualForm, '四张图：办公室／代码／会议／交付',
    '落库的应该是写明张数的那一版',
  );
});

test('教案：图片排版页只写「一张图」不再打回——图文排版那一组就是一张图', async () => {
  const project = makeProject();
  const skeleton = skeletonOf(project.title);
  saveOutline(project.projectId, project.tenantId,
    skeleton.map((p, i) => (i === 0 ? { ...p, pageType: 'gallery' as const } : p)));

  /*
    **早先这里卡「至少三张」**，理由是「一张图的版面就是图文页，不是多图排版」——
    那会儿这个版式库整个叫「多图排版」，只有多图一组。现在库里分了两组，
    图文排版那一组就是「一张图配一段文字」，再卡三张会让那十来个骨架永远挑不到。
    所以现在只要求「写清张数」，「一张」是合法的。
  */
  const { gateway, seen } = fakeGateway([lessonReply(1, { visualForm: '一张主图铺满版面，右侧一行说明' })]);

  await drain(planLessons({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    only: [0],
    gateway: gateway as never,
  }));

  assert.equal(seen.length, 1, '「一张图」不该被打回了');
  assert.equal(
    readDeckMeta(project.projectId).outline?.[0]?.visualForm, '一张主图铺满版面，右侧一行说明',
    '这一版该原样落库',
  );
});

test('教案：图片排版页没写张数仍然打回——版式是按张数筛的', async () => {
  const project = makeProject();
  const skeleton = skeletonOf(project.title);
  saveOutline(project.projectId, project.tenantId,
    skeleton.map((p, i) => (i === 0 ? { ...p, pageType: 'gallery' as const } : p)));

  const vague = JSON.stringify({
    title: '图组', claim: '看图', points: ['一'], visualForm: '主图铺满版面', designNote: '',
  });
  const three = JSON.stringify({
    title: '图组', claim: '看图', points: ['一'], visualForm: '三张图：办公室／代码／会议', designNote: '',
  });
  const { gateway, seen } = fakeGateway([vague, three]);

  await drain(planLessons({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    only: [0],
    gateway: gateway as never,
  }));

  assert.equal(seen.length, 2, '没写张数该被打回');
  assert.equal(
    readDeckMeta(project.projectId).outline?.[0]?.visualForm, '三张图：办公室／代码／会议',
    '落库的应该是写明张数的那一版',
  );
});

test('教案：图表页没写明画哪种图时打回重写', async () => {
  /*
    版式库按教案里写的那种图挑骨架（`chartLayoutCandidates` → `estimateChartKind`），
    写「用一个漂亮的图表展示」就认不出是哪一种，只能兜底给最常用的一类——
    而那很可能不是这一页该用的图。
  */
  const project = makeProject();
  const skeleton = skeletonOf(project.title);
  saveOutline(project.projectId, project.tenantId,
    skeleton.map((p, i) => (i === 0 ? { ...p, pageType: 'chart' as const } : p)));

  const vague = JSON.stringify({
    title: '数据', claim: '看趋势', points: ['一'], visualForm: '用一个漂亮的图表展示', designNote: '',
  });
  const ok = JSON.stringify({
    title: '数据', claim: '看趋势', points: ['一'],
    visualForm: '折线图，横轴是月份、纵轴是营收，两条系列', designNote: '',
  });
  const { gateway, seen } = fakeGateway([vague, ok]);

  await drain(planLessons({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    only: [0],
    gateway: gateway as never,
  }));

  assert.equal(seen.length, 2, '没写明画哪种图该被打回');
  assert.ok(
    seen[1]!.messages.some((m) => m.role === 'user' && m.content.includes('画哪种图')),
    '第二次要把问题说清楚',
  );
  assert.equal(
    readDeckMeta(project.projectId).outline?.[0]?.visualForm, '折线图，横轴是月份、纵轴是营收，两条系列',
    '落库的应该是写明图表种类的那一版',
  );
});

test('教案：图表页提示词里列出全部图表种类，模型才知道有哪些可选', async () => {
  const project = makeProject();
  const skeleton = skeletonOf(project.title);
  saveOutline(project.projectId, project.tenantId,
    skeleton.map((p, i) => (i === 0 ? { ...p, pageType: 'chart' as const } : p)));

  const { gateway, seen } = fakeGateway([lessonReply(1, { visualForm: '柱状图，横轴是季度' })]);

  await drain(planLessons({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    only: [0],
    gateway: gateway as never,
  }));

  const content = seen[0]!.messages[0]!.content;
  assert.ok(content.includes('图表页'), '要告诉模型这一页是什么页类型');
  // 清单从 `CHART_KIND_LABEL` 生成，抽两个代表性的确认它真的拼进去了
  for (const name of ['柱状图', '桑基图', '小提琴图', '旭日图']) {
    assert.ok(content.includes(name), `图表种类清单里应有「${name}」`);
  }
});

test('教案：图文页同样要写明张数——它和图片排版页共用一个版式库', async () => {
  /*
    这条以前没有，而校验里写死的是 `=== 'gallery'`——图文页漏检。
    漏检的后果很实在：版式候选是按张数筛的（`imageLayoutCandidates` → `estimateImageCount`），
    教案不写张数就只能拿要点条数去猜，猜出来的版式和内容对不上。
  */
  const project = makeProject();
  const skeleton = skeletonOf(project.title);
  saveOutline(project.projectId, project.tenantId,
    skeleton.map((p, i) => (i === 0 ? { ...p, pageType: 'imageText' as const } : p)));

  const vague = JSON.stringify({
    title: '图文', claim: '看图', points: ['一'], visualForm: '左侧主图右侧说明', designNote: '',
  });
  const two = JSON.stringify({
    title: '图文', claim: '看图', points: ['一'], visualForm: '两张图：办公室／交付现场', designNote: '',
  });
  const { gateway, seen } = fakeGateway([vague, two]);

  await drain(planLessons({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    only: [0],
    gateway: gateway as never,
  }));

  assert.equal(seen.length, 2, '图文页没写张数该被打回');
  assert.equal(
    readDeckMeta(project.projectId).outline?.[0]?.visualForm, '两张图：办公室／交付现场',
    '落库的应该是写明张数的那一版',
  );
});

test('教案：非图片排版页不查张数——文字页说「左右分栏」是正常的', async () => {
  const project = makeProject();
  const skeleton = skeletonOf(project.title);
  saveOutline(project.projectId, project.tenantId,
    skeleton.map((p, i) => (i === 0 ? { ...p, pageType: 'text' as const } : p)));

  const { gateway, seen } = fakeGateway([lessonReply(1)]);
  await drain(planLessons({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    only: [0],
    gateway: gateway as never,
  }));

  assert.equal(seen.length, 1, '文字页不该因为「没写几张图」被打回');
});

/*
  教案这一档**故意与提纲相反**：整本重写一页不落，手改过的页也覆盖。
  用户按的是「生成整本教案」，就该整本都写。

  原先这里是「整本重跑不碰人改过的页」，实测踩到过：一页被标上「已手改」之后
  整本教案就再也写不到它，用户设了 30 页却只写出 4 页。那个标记还会被误打
  （见 `PUT /outline` 那边的注释），误标一次那一页就永远不跟着整本更新。
*/
test('教案：整本重写一页不落，手改过的页也覆盖，并如实报出覆盖了几页', async () => {
  const project = makeProject();
  const skeleton = skeletonOf(project.title);
  saveOutline(project.projectId, project.tenantId, skeleton);

  // 先整本出一遍
  await drain(planLessons({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: fakeGateway([lessonReply(1)]).gateway as never,
  }));

  // 手工改第 0 页
  const after = readDeckMeta(project.projectId).outline!;
  saveOutline(project.projectId, project.tenantId, after.map((p, i) => (
    i === 0 ? { ...p, title: '我手写的', edited: true } : p
  )));

  // 整本重跑：**覆盖**，而且每一页都要调到模型
  const { gateway, seen } = fakeGateway([lessonReplyWithCount(9)]);
  const whole = await drain(planLessons({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: gateway as never,
  }));
  assert.equal(seen.length, skeleton.length, '整本就该一页不落，不能因为手改过就跳过');
  assert.equal(
    readDeckMeta(project.projectId).outline?.[0]?.title, '写实的标题 9',
    '整本重写要覆盖手改过的页',
  );
  const done = whole.get('done')?.[0] as { skippedEdited: number; overwrittenEdited: number };
  assert.equal(done.overwrittenEdited, 1, '覆盖了几页手改要如实报出来');
  assert.equal(done.skippedEdited, 0, '教案这一档不跳页');

  // 单页重跑：同样是覆盖，但只跑这一页
  const single = await drain(planLessons({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    only: [0],
    gateway: fakeGateway([lessonReply(8)]).gateway as never,
  }));
  assert.equal(
    readDeckMeta(project.projectId).outline?.[0]?.title, '写实的标题 8',
    '单页重跑就是要覆盖',
  );
  assert.equal(
    (single.get('done')?.[0] as { overwrittenEdited: number }).overwrittenEdited, 0,
    '单页重写本来就是覆盖意图，不用报「覆盖了手改」',
  );
});

test('教案：某一页写不出来时其余页照常落库，并报出失败了几页', async () => {
  const project = makeProject();
  const skeleton = skeletonOf(project.title);
  saveOutline(project.projectId, project.tenantId, skeleton);

  // 第 0 页那次调用报错，其余正常
  const replies: (string | Error)[] = [new Error('连接超时'), lessonReplyWithCount(2)];
  const { gateway } = fakeGateway(replies);

  const events = await drain(planLessons({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: gateway as never,
  }));

  const done = events.get('done')?.[0] as { succeeded: number; failed: number };
  assert.equal(done.failed, 1, '一页失败不该中断整本');
  assert.equal(done.succeeded, skeleton.length - 1);
  assert.ok(
    !readDeckMeta(project.projectId).outline?.[0]?.visualForm,
    '失败的那页保留原样（骨架没有教案，所以这里是空的）',
  );
});

test('教案：还没有提纲时明确报错，而不是产出一份空的', async () => {
  const project = makeProject();
  const events = await drain(planLessons({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    gateway: fakeGateway([lessonReply(1)]).gateway as never,
  }));
  const err = events.get('error')?.[0] as { message: string };
  assert.ok(err, '应发出 error 事件');
  assert.match(err.message, /提纲/);
});

/* ---------------- 项目上的两个旋钮 ---------------- */

test('页数与深度存在项目上，重跑时不必再传', async () => {
  const project = makeProject();
  assert.equal(project.depth, 'standard', '新项目给默认深度');
  assert.equal(project.targetPages, null, '默认由内容决定');

  const updated = updateProject(project.projectId, project.tenantId, { depth: 'deep', targetPages: 9 });
  assert.equal(updated.depth, 'deep');
  assert.equal(updated.targetPages, 9);
  assert.equal(requireProject(project.projectId, project.tenantId).depth, 'deep', '要真的落库');
});

/* ---------------- 页数要真的说了算 ---------------- */

/** 一句想法的需求：规则层只能按人群模板铺，铺不满用户要的页数 */
function makeThinProject() {
  const user = createUser({
    username: `thin${Date.now()}${Math.floor(Math.random() * 100000)}`,
    password: 'abcd1234',
    role: 'user',
    source: 'self_signup',
  });
  return createProject({
    tenantId: user.tenantId,
    ownerId: user.userId,
    title: 'AI产品经理为什么火了',
    brief: '详细讲讲AI产品经理这个岗位为什么突然火了，它到底做什么，未来会怎样。',
  });
}

/**
 * 设了页数，提纲就得是这个页数。
 *
 * 实测踩到过：用户设 12 页，出来还是 9 页。两处原因叠在一起——
 * 规则层的「仅想法」分支被写死的人群模板卡住（`general` 只有 6 条，
 * 加封面目录结尾最多 9 页），而模型那一段又要求「页数以骨架为准」，
 * 于是模型就算想多排几页也会被砍回来。**页数是用户给的，得听用户的。**
 */
test('提纲：设了 12 页就出 12 页，不再被骨架的页数卡住', async () => {
  const project = makeThinProject();
  const { gateway, seen } = fakeGateway([outlineReply(12)]);

  const events = await drain(planDeckOutline({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    targetPages: 12,
    depth: 'standard',
    gateway: gateway as never,
  }));

  const outline = (events.get('outline')?.[0] as { outline: unknown[] }).outline;
  assert.equal(outline.length, 12, '设了 12 页就该是 12 页');
  assert.equal(readDeckMeta(project.projectId).outline?.length, 12, '落库的也要是 12 页');
  // 页数要求必须发给模型，否则它不知道要排几页
  assert.match(seen[0]!.messages[0]!.content, /12 页/, '要告诉模型这一本几页');
});

test('提纲：模型没按页数交，带抱怨重发一次', async () => {
  const project = makeThinProject();
  // 第一次只给 5 页，第二次才给对
  const { gateway, seen } = fakeGateway([outlineReply(5), outlineReply(12)]);

  const events = await drain(planDeckOutline({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    targetPages: 12,
    depth: 'standard',
    gateway: gateway as never,
  }));

  assert.equal(seen.length, 2, '页数不对要重发一次');
  // 抱怨是最后一条 user 消息（messages 是同一个数组引用，看第二次请求的末尾）
  assert.match(String(seen[1]!.messages.at(-1)!.content), /12 页/, '抱怨里要写清该给几页');
  assert.equal((events.get('outline')?.[0] as { outline: unknown[] }).outline.length, 12);
});

test('提纲：没设页数时仍以骨架为准，模型多排的页砍掉', async () => {
  const project = makeProject();
  const skeleton = skeletonOf(project.title);
  const { gateway } = fakeGateway([outlineReply(skeleton.length + 4)]);

  const events = await drain(planDeckOutline({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    depth: 'standard',
    gateway: gateway as never,
  }));

  assert.equal(
    (events.get('outline')?.[0] as { outline: unknown[] }).outline.length, skeleton.length,
    '用户没提要求时，页数仍由内容与骨架决定',
  );
});

/* ---------------- 三条链路互斥 ---------------- */

/**
 * 同一个项目上不能有两条写内容的链路同时跑。
 *
 * 实测踩到过：我在跑教案的同时用户又点了一次，同一轮 **29 次模型调用干了 15 页的活**，
 * 白花一倍的钱。出页面那条路早有锁（挤位那个缺陷修出来的），
 * 提纲与教案这两条是新加的，一并纳进同一把锁。
 */
test('教案在跑时再点一次会被明确拒掉，跑完还能接着生成', async () => {
  const project = makeProject();
  saveOutline(project.projectId, project.tenantId, skeletonOf(project.title));
  const opts = { projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId };

  // 每页 40ms，够第二条插进来
  const first = drain(planLessons({ ...opts, gateway: fakeGateway([lessonReply(1)], 40).gateway as never }));
  await new Promise((r) => setTimeout(r, 25));

  await assert.rejects(
    drain(planLessons({ ...opts, gateway: fakeGateway([lessonReply(1)]).gateway as never })),
    /正在生成中/,
    '第二条流要明确报「正在生成中」，而不是悄悄再跑一遍',
  );

  await first;

  // 锁没放回去的话这里会抛——那意味着这个项目以后再也生成不了了
  await drain(planLessons({ ...opts, gateway: fakeGateway([lessonReply(1)]).gateway as never }));
});

test('出页面与出提纲共用同一把锁：互斥，且跑完都放得回去', async () => {
  const project = makeProject();
  const skeleton = skeletonOf(project.title);

  // 先占住锁，模拟「正在出页面」
  acquireGeneration(project.projectId, '测试占位');
  await assert.rejects(
    drain(planDeckOutline({
      projectId: project.projectId,
      tenantId: project.tenantId,
      userId: project.ownerId,
      depth: 'standard',
      gateway: fakeGateway([outlineReply(skeleton.length)]).gateway as never,
    })),
    /正在生成中/,
  );
  assert.equal(isGenerating(project.projectId), true, '被拒的那次不该把锁放掉');

  releaseGeneration(project.projectId);
  assert.equal(isGenerating(project.projectId), false);

  // 放掉之后照常能跑
  await drain(planDeckOutline({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    depth: 'standard',
    gateway: fakeGateway([outlineReply(skeleton.length)]).gateway as never,
  }));
  assert.equal(isGenerating(project.projectId), false, '跑完要放锁');
});
