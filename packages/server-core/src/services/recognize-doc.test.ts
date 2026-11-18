import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProviderGateway } from '@lumen/provider-gateway';

// 环境必须在导入任何模块之前设定：recognize-doc.service 的导入链会拉起 db/client
process.env.NODE_ENV = 'test';
process.env.LUMEN_DB_PATH = ':memory:';
process.env.LUMEN_SECRET_KEY = 'test-secret-key-0123456789abcdefghijklmnop';

const { runDocRecognition } = await import('./recognize-doc.service.js');
const { toDataUrl } = await import('@lumen/style-engine/server');
const { RECOGNIZE_STEPS } = await import('@lumen/ir-schema');

/**
 * 全量识别这条路**真的跑一遍**（假网关），看它发出去的请求长什么样。
 *
 * 为什么非得跑起来不可：`page-prompt-kit` 给「写提示词」与「出样机」各有一路
 * **可选**的配色/字体注入，两个调用点各传什么，只有把整条路跑一遍才看得见。
 * 单靠 `page-prompt-kit.test.ts` 里直接调 kit 的用例不够——那些用例把可选参数
 * 省掉就算数，跟本文件里这两个调用点一点关系都没有。审查实测过：往调用点塞错东西，
 * 那套用例全绿、一条都不红，而它们的名字宣称守住了全量识别这条路。
 *
 * 现在的分工：**写提示词那次不带**（那时配色与字体都还没读出来），
 * **出样机那次带**（配色必有；字体是识别从参考图里读出来的，见 `SYNTH` 的 `fonts`）。
 * 后者正是「字体识别」在服务端这一侧的落点，所以断言把它逐档钉住——
 * 读出来的字体只写进 `StyleDoc` 而不喂给样机，等于白读。
 *
 * 假网关的路数与 `redraw-page.test.ts` 相同：按调用次序吐预设回复。
 */

const PALETTE = {
  bg: '#EFE6DA', surface: '#F7F1E8', text: '#3A322B', muted: '#8A7F73',
  accent: '#E08A3C', brand: '#C7421A', border: '#D8CDBF',
};

/**
 * 一张 64×64 的纯色 PNG。
 *
 * 分页的框由假网关给，不靠像素，画什么都行——只要 `decodeImage` 解得开。
 * 尺寸取 64 而不是 8：`cropNormalized` 会把归一化框乘回像素再取整，
 * 图太小的时候一个 0.9 宽的框只剩七像素，容易撞上边界处理。
 */
const IMAGE = toDataUrl({ width: 64, height: 64, data: new Uint8Array(64 * 64 * 4).fill(200) });

const PROMPT = '角色：封面设计师。\n任务：写封面。\n视觉与排版要求：\n1. 大字标题。\n代码要求（非常重要）：\n1. 用 :root 定义变量。';

/** 一份合规的样机：配色全走变量，且与下面 synth 回复里的色板逐字对上 */
const MOCK_HTML = [
  `<style>:root { --bg:${PALETTE.bg}; --text:${PALETTE.text}; --accent:${PALETTE.accent}; }`,
  '.slide { width: 1920px; height: 1080px; background: var(--bg); color: var(--text); }',
  '</style><div class="slide">封面</div>',
].join('');

const SPLIT_ONE_PAGE = JSON.stringify({ slides: [{ pageType: 'cover', x0: 0, y0: 0, x1: 1, y1: 1 }] });
/**
 * 综合风格的那次回复，**带上字体**。
 *
 * 从参考图里读出字体是这一版新加的：`fonts` 给的是 `FONT_CHOICES` 的 id，
 * 识别链路要把它落成 `StyleDoc` 上的字体栈，**并且按它出样机**。
 * 三个角色各有代表性：衬线展示体、无衬线正文、等宽数字；`script` 故意留空，
 * 用来钉住「空串不覆盖默认值」这一条。
 */
const SYNTH = JSON.stringify({
  name: '暖调纸感编辑风', description: '一句话说明', theme: 'light', palette: PALETTE, deckPrompt: '一页一个结论',
  fonts: { display: 'cormorant', body: 'montserrat', script: '', numeric: 'system-mono' },
  fontNote: '大标题衬线、正文无衬线、数字等宽',
});
/** 推导这一批一个都不给——退化成兜底模板即可，这条用例不关心推导出来的内容 */
const DERIVE_NOTHING = JSON.stringify({ pages: [] });

/**
 * 假网关的预设回复，**按调用次序**。
 *
 * 一轮单页识别固定 30 次调用，次序是：
 *   1        分页              → 一个 cover 框
 *   2        写提示词          → 唯一那一页
 *   3        综合风格
 *   4~14     推导缺失页类型    → 12 个页类型里读出来 1 个、缺 11 个。
 *                                **一批一页**（见 `derivePrompts` 的注释：
 *                               三页叠一起输出写不完，「代码要求」那段先丢），
 *                               所以是 11 批而不是原先的 4 批
 *   15~30    出样机            → 读出来的 1 页 + 推导出来的 11 页，共 12 页，
 *                                外加 4 次带问题重发（chart / people / imageText / gallery）
 *
 * 最后一项会被后面所有出样机调用复用（假网关取 `replies[Math.min(i, len-1)]`）。
 *
 * **按位置给，而不是按 system 提示词的字面去匹配**：后者会把这条接线用例钉死在
 * 提示词的措辞上，改一次文案就崩——那不该是这条用例关心的东西。
 */
const REPLIES = [
  SPLIT_ONE_PAGE, PROMPT, SYNTH,
  // 11 批推导，每批一页。这批一个都不给——退化成兜底模板即可，这条用例不关心推导出来的内容
  DERIVE_NOTHING, DERIVE_NOTHING, DERIVE_NOTHING, DERIVE_NOTHING, DERIVE_NOTHING, DERIVE_NOTHING,
  DERIVE_NOTHING, DERIVE_NOTHING, DERIVE_NOTHING, DERIVE_NOTHING, DERIVE_NOTHING,
  MOCK_HTML,
];

interface TextRequest {
  system?: string;
  messages: { content: string }[];
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

test('全量识别：写提示词时不带配色与字体，出样机时带上从参考图读出的字体', async () => {
  const { gateway, seen } = fakeGateway(REPLIES);
  const events: { event: string; data: unknown }[] = [];
  for await (const e of runDocRecognition({ imageUrls: [IMAGE], tenantId: 'tn_doc', userId: 'u_doc', gateway })) {
    events.push(e);
  }

  // 先钉住「这条路真跑完了」：中途断在第 3 次调用的话，下面的断言都是空话
  assert.ok(events.some((e) => e.event === 'done'), '全量识别必须跑到 done，这条结论才算数');

  // 调用次序是下面按位置取请求的前提（见 REPLIES 的注释）。数字变了说明流程变了
  //
  // 33 = 1 分页 + 1 写提示词 + 1 综合 + 12 推导（一批一页）+ 18 出样机。
  // 出样机那 18 里多出来的 5 次是**带问题重发**：REPLIES 里那份通用的 MOCK_HTML
  // 既没有图表槽、也没有图片位，于是 chart 按 `chartSlotIssues`、
  // people / imageText / gallery / ui 按 `imageSlotIssues` 各重发了一次。
  // **这是应当的**——没槽的图表页等于版式库里二十种图一种都用不上，
  // 没图片位的人物页、图文页与界面页则一格内容都填不上。
  assert.equal(seen.length, 33, '一轮单页识别固定 33 次调用，变了就重新数一遍再改这里');

  // 写提示词（第 2 次）在综合风格之前，配色与字体都还没读出来，两样都不该带
  const writeContent = seen[1]!.messages[0]!.content;
  assert.ok(!writeContent.includes('--bg:'), '写提示词时配色还没定，不该带配色块');
  assert.ok(!writeContent.includes('var(--font-sans)'), '写提示词时字体还没读出来，不该带字体块');

  // 出样机（第 16 次起，13 个页类型各一次）——配色是必填参数，字体是**这一版新读出来的**，
  // 两样都必须带上。**这是「字体识别」真正的落点**：识别只把字体写进 StyleDoc 不够，
  // 样机也得照它出，否则库里写着无衬线、卡片样机却是衬线
  const mockContents = seen.slice(15).map((r) => r.messages[0]!.content);
  // 18 = 13 个页类型各一次 + 5 次带问题重发（chart / people / imageText / gallery / ui）
  assert.equal(mockContents.length, 18, '13 个页类型各出一次样机，另有 5 页重发');
  for (const content of mockContents) {
    assert.ok(content.includes(`--bg: ${PALETTE.bg};`), '出样机照旧带配色');
    // 三个读出来的角色逐个钉住。值来自 `FONT_CHOICES`，不是这里手写的字面量——
    // 但断言里写死前缀是为了让「换了字体清单」这件事在这条用例上显形
    assert.ok(content.includes('--font-sans: Montserrat'), '出样机要按读出来的正文无衬线出');
    assert.ok(content.includes('--font-display: "Cormorant Garamond"'), '出样机要按读出来的衬线展示体出');
    assert.ok(content.includes('--font-numeric: "SFMono-Regular"'), '出样机要按读出来的等宽数字出');
    // `script` 在 SYNTH 里是空串，不该凭空冒出一个手写体变量来
    assert.ok(!content.includes('--font-script:'), '没读出写体就不该注入写体变量');
  }

  // 落库那份也要带上同样的字体：`fontStacksOf` 认的是这些栈，两边对不上就是白读
  const done = events.find((e) => e.event === 'done')!.data as Record<string, unknown>;
  assert.ok(String(done.fontFamily).includes('Montserrat'), 'StyleDoc 的正文栈要是读出来的那一档');
  assert.ok(String(done.fontDisplay).includes('Cormorant Garamond'), 'StyleDoc 的展示栈要是读出来的那一档');
  assert.ok(String(done.fontNumeric).includes('SFMono-Regular'), 'StyleDoc 的数字栈要是读出来的那一档');
  // 空串那一档不覆盖，`StyleDoc` 的默认手写体栈接手
  assert.ok(String(done.fontScript).includes('Segoe Script'), '没读出写体时保留默认手写体栈，而不是写成空串');
});

/**
 * 进度事件的负载形状。
 *
 * 这是跨端契约，且**曾经断过一次**：服务端一直发 `step`，前端却照着 `key` 读，
 * 而 `setProgress(data as Progress)` 是裸强转、TS 查不出来。运行时 `progress.key`
 * 恒为 undefined，五个阶段徽标一个都不亮、「已读 3/9 页」也永远不显示——一轮识别
 * 三到六分钟，这是用户唯一的进度反馈。所以字段名与阶段名都得在这里钉住。
 */test('进度负载带 step 而不是 key，五个阶段按顺序各报一次', async () => {
  const { gateway } = fakeGateway(REPLIES);
  const events: { event: string; data: unknown }[] = [];
  for await (const e of runDocRecognition({ imageUrls: [IMAGE], tenantId: 'tn_doc', userId: 'u_doc', gateway })) {
    events.push(e);
  }

  const progress = events
    .filter((e) => e.event === 'progress')
    .map((e) => e.data as Record<string, unknown>);
  assert.ok(progress.length > 0, '一轮识别必须报进度，否则界面上三五分钟没有任何反馈');

  for (const p of progress) {
    assert.ok(!('key' in p), `进度负载不该带 key：${JSON.stringify(p)}`);
    assert.equal(typeof p.step, 'string', `进度负载缺 step：${JSON.stringify(p)}`);
    assert.equal(typeof p.label, 'string', `进度负载缺 label：${JSON.stringify(p)}`);
    assert.equal(typeof p.done, 'number', `进度负载缺 done：${JSON.stringify(p)}`);
    assert.equal(typeof p.total, 'number', `进度负载缺 total：${JSON.stringify(p)}`);
    assert.ok(
      (RECOGNIZE_STEPS as readonly string[]).includes(p.step as string),
      `阶段名不在共用契约里：${String(p.step)}`,
    );
  }

  // 前端把五个阶段按 RECOGNIZE_STEPS 的顺序摆出来，服务端就得按同一个顺序报，
  // 否则界面上会先亮后面的再回头亮前面的
  assert.deepEqual(
    [...new Set(progress.map((p) => String(p.step)))],
    [...RECOGNIZE_STEPS],
  );
});

/**
 * 写提示词写漏了段落时要带问题重试一次。
 *
 * 这条原先**没有**：全量识别那条路是裸调 `writePagePrompt` 的，模型漏写「代码要求」
 * 那一段也没人管。实测「红黑极简提案风」一轮下来 cover / toc / metrics / imageText
 * 四页缺段（metrics 甚至四段全缺），落库时 `saveStyleDoc` 报了一串结构警告。
 * 而缺「代码要求」的提示词生成出来的页面不会用 `:root` 变量，换主题就散架。
 *
 * 单页重识别（`redrawPage`）一直是校验+重试的，这里补上同一个口径。
 */
test('写出来的提示词缺段落时带问题重发一次，并把缺了哪段告诉模型', async () => {
  /** 只有两段。模型漏写「视觉与排版要求」「代码要求」时就是这个样子 */
  const BAD_PROMPT = '角色：封面设计师。\n任务：写封面。';
  // 第 2 次是第一次写提示词（给坏的），第 3 次是重试（给好的），其余位置照旧
  const REPLIES_RETRY = [
    SPLIT_ONE_PAGE, BAD_PROMPT, PROMPT, SYNTH,
    DERIVE_NOTHING, DERIVE_NOTHING, DERIVE_NOTHING, DERIVE_NOTHING, DERIVE_NOTHING, DERIVE_NOTHING,
    DERIVE_NOTHING, DERIVE_NOTHING, DERIVE_NOTHING, DERIVE_NOTHING, DERIVE_NOTHING,
    MOCK_HTML,
  ];

  const { gateway, seen } = fakeGateway(REPLIES_RETRY);
  const events: { event: string; data: unknown }[] = [];
  for await (const e of runDocRecognition({ imageUrls: [IMAGE], tenantId: 'tn_doc', userId: 'u_doc', gateway })) {
    events.push(e);
  }
  assert.ok(events.some((e) => e.event === 'done'), '这条路要跑到 done，结论才算数');

  // 多出来的一次就是重试。33 是常规轮次（见上一条用例），这里多一发
  assert.equal(seen.length, 34, '缺段落要多发一次写提示词');

  const retry = seen[2]!.messages[0]!.content;
  assert.match(retry, /上一版有这些问题/, '重试要把上一版的问题摆出来');
  assert.match(retry, /缺少「视觉与排版要求：」/, '缺哪一段要说具体，模型才知道补什么');
  assert.match(retry, /缺少「代码要求（非常重要）：」/);

  // 落库的那份要用**重试后**的合规提示词，不是那份残缺的
  const done = events.find((e) => e.event === 'done')!.data as Record<string, unknown>;
  const prompts = done.pagePrompts as Record<string, { prompt: string }>;
  assert.equal(prompts.cover?.prompt, PROMPT, '存下来的应该是重试后那一版');
});
