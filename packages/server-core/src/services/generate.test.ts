import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 环境必须在导入任何模块之前设定
const tmp = mkdtempSync(join(tmpdir(), 'lumen-gen-'));
process.env.NODE_ENV = 'test';
process.env.LUMEN_DB_PATH = join(tmp, 'test.db');
process.env.LUMEN_SECRET_KEY = 'test-secret-key-0123456789abcdefghijklmnop';

const { migrate } = await import('../db/migrate.js');
const { closeDb, get, run } = await import('../db/client.js');
const { ensureSeed } = await import('../services/seed.service.js');
const { ensureBuiltinStyles, resolveStyle } = await import('../services/style.service.js');
const { createUser } = await import('../services/user.service.js');
const { createProject, listPages, pageIR, refreshProjectCounts, savePage, savePageGroup } = await import('../services/project.service.js');
const {
  runGeneration, alignSources, planOutline, generateOnePage, outlineIndicesOf, saveOutline,
  setOutlinePageType, readDeckMeta,
} = await import('../services/generate.service.js');

migrate();
ensureSeed();
ensureBuiltinStyles();

test.after(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

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

function makeProject() {
  const user = createUser({ username: `u${Date.now()}${Math.floor(Math.random() * 1000)}`, password: 'abcd1234', role: 'user', source: 'self_signup' });
  const project = createProject({
    tenantId: user.tenantId,
    ownerId: user.userId,
    title: '年度战略汇报',
    brief: BRIEF,
    audienceTag: 'executive',
    scene: 'board',
  });
  return { user, project };
}

test('源文本对齐：封面与结尾页不占用内容段落', () => {
  const outline = [
    { index: 0, pageType: 'cover' as const, claim: 'T', title: 'T', points: [], section: '', notes: '' },
    { index: 1, pageType: 'text' as const, claim: 'A', title: 'A', points: [], section: '', notes: '' },
    { index: 2, pageType: 'text' as const, claim: 'B', title: 'B', points: [], section: '', notes: '' },
    { index: 3, pageType: 'text' as const, claim: 'C', title: 'C', points: [], section: '', notes: '' },
    { index: 4, pageType: 'end' as const, claim: 'E', title: 'E', points: [], section: '', notes: '' },
  ];
  const texts = alignSources(BRIEF, outline, 'has_content');
  assert.equal(texts[0], undefined, '封面页不应分配内容段落');
  assert.equal(texts[4], undefined, '结尾页不应分配内容段落');
  assert.match(texts[1]!, /市场现状/, '第一内容页应拿到第一段');
  assert.match(texts[2]!, /核心痛点/, '第二内容页应拿到第二段');
  assert.match(texts[3]!, /我们的方案/, '第三内容页应拿到第三段');
});

test('源文本对齐：仅想法输入不分配原文', () => {
  const outline = [
    { index: 0, pageType: 'cover' as const, claim: 'T', title: 'T', points: [], section: '', notes: '' },
    { index: 1, pageType: 'text' as const, claim: 'A', title: 'A', points: [], section: '', notes: '' },
  ];
  assert.deepEqual(alignSources('做个产品介绍', outline, 'idea_only'), [undefined, undefined]);
});

test('端到端生成：页内容与原文段落一一对应，不再整体错位', async () => {
  const { user, project } = makeProject();
  const summary = { total: 0, succeeded: 0, failed: 0 };
  for await (const evt of runGeneration({
    projectId: project.projectId, tenantId: user.tenantId, userId: user.userId,
  })) {
    if (evt.event === 'done') Object.assign(summary, evt.data);
  }
  assert.ok(summary.succeeded >= 5, `应生成至少 5 页，实际 ${summary.succeeded}`);

  const pages = listPages(project.projectId).map(pageIR);
  const byTitle = (t: string) => pages.find((p) => p.title.main.includes(t));

  const market = byTitle('市场现状');
  assert.ok(market, '应存在「市场现状」页');
  const marketText = JSON.stringify(market.blocks);
  assert.match(marketText, /210%/, '市场页应包含市场段落里的数字');
  assert.equal(marketText.includes('返工成本高'), false, '市场页不应混入其他段落的内容');

  const pain = byTitle('核心痛点');
  assert.ok(pain, '应存在「核心痛点」页');
  const painText = JSON.stringify(pain.blocks);
  assert.match(painText, /风格一次性/, '痛点页应包含痛点要点');
  assert.equal(painText.includes('210%'), false, '痛点页不应混入市场段落的内容');

  const plan = byTitle('我们的方案');
  assert.ok(plan, '应存在「我们的方案」页');
  assert.match(JSON.stringify(plan.blocks), /1\.2亿元|3000家|9 倍/, '方案页应包含方案段落里的数字');
});

test('生成后每页都带合法版式与白名单动效，且页码连续', async () => {
  const { user, project } = makeProject();
  for await (const _ of runGeneration({ projectId: project.projectId, tenantId: user.tenantId, userId: user.userId })) {
    // 消费完整个事件流
  }
  refreshProjectCounts(project.projectId);
  const pack = resolveStyle('business-classic');
  const variantIds = new Set(pack.base.layouts.map((l) => l.id));
  const pages = listPages(project.projectId).map(pageIR);

  assert.deepEqual(pages.map((p) => p.footer.pageNo), pages.map((_, i) => i + 1));
  for (const p of pages) {
    assert.ok(variantIds.has(p.layoutVariant), `版式 ${p.layoutVariant} 必须来自风格包`);
    // 新页面存的是 `auto`（模式，不在白名单里），轮换出来的值由渲染层负责落在白名单内
    assert.ok(
      isMotionMode(p.motion.enter) || pack.base.motionWhitelist.includes(p.motion.enter),
      '动效必须来自白名单',
    );
  }
});

test('拆页产出的续页落在连续序号上，且不会被记成失败', async () => {
  // 指标密集的正文会触发「拆页」这一步，从而产出「（续）」页。
  // 曾经的 bug：一组适配结果全写同一个 pageIndex，撞 (projectId, pageIndex) 唯一索引，
  // 表现为「页面生成失败」但库里其实已经写进了半页，续页整体丢失。
  const user = createUser({
    username: `split${Date.now()}${Math.floor(Math.random() * 1000)}`,
    password: 'abcd1234', role: 'user', source: 'self_signup',
  });
  const project = createProject({
    tenantId: user.tenantId,
    ownerId: user.userId,
    title: '指标密集汇报',
    brief: [
      '我们要向管理层汇报华东大区的年度增长情况。',
      '',
      '过去一年华东大区营收从 3.2 亿增长到 4.6 亿，同比增速 43.8%，高于全国平均的 28%。',
      '增长主要来自三个方向：一是新签客户数从 1200 家增长到 1850 家，二是客单价从 26.7 万提升到 24.9 万，',
      '三是续约率从 71% 提升到 84%。',
      '',
      '渠道结构上，直销贡献了 62% 的营收，渠道伙伴贡献 28%，线上自助贡献 10%。',
      '其中线上自助的增速最快，同比增长 210%，但基数还小。',
      '',
      '成本方面，销售费用率从 38% 降到 32%，主要靠人效提升：人均产出从 178 万提升到 236 万。',
      '',
      '明年的目标是营收 6.5 亿，重点做三件事：把线上自助的占比从 10% 提到 20%，',
      '把续约率提到 88%，以及在华南复制华东的打法。',
    ].join('\n'),
    audienceTag: 'executive',
    scene: 'review',
  });

  let ready = 0;
  const failures: string[] = [];
  for await (const evt of runGeneration({ projectId: project.projectId, tenantId: user.tenantId, userId: user.userId })) {
    if (evt.event === 'page-ready') ready += 1;
    if (evt.event === 'page-failed') failures.push(`第 ${evt.data.index + 1} 页：${evt.data.error}`);
  }
  assert.deepEqual(failures, [], '不应有页面失败');

  const rows = listPages(project.projectId);
  assert.equal(rows.length, ready, '落库页数应与就绪事件数一致');
  assert.deepEqual(
    rows.map((r) => r.pageIndex),
    rows.map((_, i) => i),
    'pageIndex 必须是连续的 0..n-1',
  );

  // 续页紧跟其主页之后
  const continuations = rows.filter((r) => r.pageId.includes('-r'));
  assert.ok(continuations.length > 0, '该内容量应至少触发一次拆页');
  for (const cont of continuations) {
    const parentId = cont.pageId.slice(0, cont.pageId.indexOf('-r'));
    const parent = rows.find((r) => r.pageId === parentId);
    assert.ok(parent, `续页 ${cont.pageId} 应有对应主页`);
    assert.equal(cont.pageIndex, parent.pageIndex + 1, '续页必须紧跟在主页之后');
    assert.match(pageIR(cont).title.main, /（续）/, '续页标题应标注（续）');
  }
});

test('单页生成可独立调用，且不覆盖其他页', async () => {
  const { user, project } = makeProject();
  const { outline } = planOutline(project.projectId, user.tenantId);
  const pack = resolveStyle('business-classic');

  const r = await generateOnePage({
    projectId: project.projectId,
    tenantId: user.tenantId,
    userId: user.userId,
    outline: outline[1]!,
    pack,
    pageIndex: 1,
    totalPages: outline.length,
    sourceText: '单页专用内容，含 42% 的增长数据。',
    avatarEnabled: false,
    audienceTag: 'executive',
  });
  assert.equal(r.pages.length, 1);
  const all = listPages(project.projectId);
  assert.equal(all.length, 1, '只应写入被生成的那一页');
  assert.equal(all[0]!.pageIndex, 1);
});

test('生成事件流包含完整的逐页序列', async () => {
  const { user, project } = makeProject();
  const events: string[] = [];
  const readyIndexes: number[] = [];
  for await (const evt of runGeneration({ projectId: project.projectId, tenantId: user.tenantId, userId: user.userId })) {
    events.push(evt.event);
    if (evt.event === 'page-ready') readyIndexes.push(evt.data.index);
  }
  assert.equal(events[0], 'style', '第一个事件应是风格锁定');
  assert.equal(events[1], 'outline', '第二个事件应是大纲');
  assert.ok(events.includes('page-start'));
  assert.ok(events.includes('page-ready'));
  assert.equal(events[events.length - 1], 'done');
  assert.equal(events.filter((e) => e === 'page-start').length, events.filter((e) => e === 'page-ready').length + events.filter((e) => e === 'page-failed').length);
  assert.deepEqual([...readyIndexes].sort((a, b) => a - b), readyIndexes, '页码应按顺序落地');
});

/* ---------------- 页与大纲的归属推断 ---------------- */

/** 造一条页面记录：只要标题对得上就够了 */
function pageRow(title: string, outlineIndex?: number) {
  return {
    ir: JSON.stringify({ pageId: `p-${title}`, title: { main: title } }),
    ...(outlineIndex === undefined ? {} : { outlineIndex }),
  };
}

const OUTLINE = [{ title: '封面' }, { title: '现状' }, { title: '方案' }, { title: '结尾' }];

test('落库记下的归属优先于任何推断', () => {
  const rows = [pageRow('封面', 0), pageRow('现状', 1), pageRow('方案', 2), pageRow('结尾', 3)];
  assert.deepEqual(outlineIndicesOf(rows, OUTLINE), [0, 1, 2, 3]);
});

test('拆页产出的续页归到同一条大纲', () => {
  const rows = [pageRow('封面', 0), pageRow('现状', 1), pageRow('现状（续）', 1), pageRow('方案', 2)];
  assert.deepEqual(outlineIndicesOf(rows, OUTLINE), [0, 1, 1, 2]);
});

test('老数据没有归属字段时按标题对齐推断，续页跟着上一条', () => {
  const rows = [pageRow('封面'), pageRow('现状'), pageRow('现状（续）'), pageRow('方案'), pageRow('结尾')];
  assert.deepEqual(outlineIndicesOf(rows, OUTLINE), [0, 1, 1, 2, 3]);
});

test('标题对不上时退回页在 deck 里的位置，不会把页算到更前面', () => {
  const rows = [pageRow('封面'), pageRow('临时加的页'), pageRow('方案')];
  const got = outlineIndicesOf(rows, OUTLINE);
  assert.equal(got[0], 0);
  // 第 2 页对不上大纲，退回自己的位置 1；第 3 页从游标 1 往后找到「方案」= 2
  assert.equal(got[1], 1);
  assert.equal(got[2], 2);
});

test('归属推断只用来定位插入点：数出排在目标大纲之前的页数', () => {
  // 大纲第 2 条（「方案」）之前，实际有 4 页（含一页续页）
  const rows = [pageRow('封面'), pageRow('现状'), pageRow('现状（续）'), pageRow('方案')];
  const before = outlineIndicesOf(rows, OUTLINE).filter((from) => from < 2).length;
  assert.equal(before, 3, '续页也要算进去，否则新页会插到续页前面');
});

/* ---------------- 设计语言注入生成提示词 ---------------- */

const { styleGuidanceLines, capacityLines, applyPolish } = await import('../services/generate.service.js');
const { BUILTIN_STYLE_PACKS } = await import('@lumen/style-engine');
const { PageIR, OutlinePage, isMotionMode } = await import('@lumen/ir-schema');
const { buildImagePrompt } = await import('@lumen/content-engine');

const CLASSIC = BUILTIN_STYLE_PACKS.find((p) => p.styleId === 'business-classic')!;
const ACADEMIC = BUILTIN_STYLE_PACKS.find((p) => p.styleId === 'academic-rigor')!;

function pageOf(pageType: string, blocks: unknown[] = []) {
  return PageIR.parse({
    pageId: 'pg-1',
    pageType,
    layoutVariant: 'text/one-column@v1',
    title: { main: '标题' },
    blocks,
  });
}

test('页级提示词带上该页类型的设计语言说明', () => {
  const lines = styleGuidanceLines(pageOf('text'), CLASSIC);
  assert.equal(lines.length, 1);
  assert.ok(lines[0]!.includes(CLASSIC.base.language.guidance.text), '应原样带上该页类型的说明');
  assert.ok(lines[0]!.includes(CLASSIC.name), '应标明是哪个风格包');
});

test('换成另一个风格族，注入的说明随之改变', () => {
  const a = styleGuidanceLines(pageOf('text'), CLASSIC)[0];
  const b = styleGuidanceLines(pageOf('text'), ACADEMIC)[0];
  assert.notEqual(a, b, '不同风格族应注入不同说明');
});

test('只有真的画了图表/图片的页才注入图表与图片规范', () => {
  const plain = styleGuidanceLines(pageOf('text'), CLASSIC);
  assert.ok(!plain.some((l) => l.startsWith('图表规范')), '没图表就不该注入图表规范');

  const withChart = styleGuidanceLines(
    pageOf('chart', [{ id: 'c1', type: 'chart', kind: 'bar', data: { categories: ['甲'], series: [{ name: 's', values: [1] }] } }]),
    CLASSIC,
  );
  assert.ok(withChart.some((l) => l.startsWith('图表规范')), '有图表应注入图表规范');

  const withImage = styleGuidanceLines(
    pageOf('imageText', [{ id: 'i1', type: 'image', source: 'ai', status: 'ready', src: '/x.png' }]),
    CLASSIC,
  );
  assert.ok(withImage.some((l) => l.startsWith('图片规范')), '有图片应注入图片规范');
});

test('图片提示词的强制约束在任何风格下都在', () => {
  for (const pack of BUILTIN_STYLE_PACKS) {
    const prompt = buildImagePrompt('标题', '主张', pack.toneKeywords);
    assert.ok(prompt.includes('不要出现任何文字'), `${pack.styleId} 丢了禁文字约束`);
    assert.ok(prompt.includes('不要出现可识别的真人肖像'), `${pack.styleId} 丢了禁真人约束`);
  }
});

test('页级提示词带上本页版式容量，模型才知道写多长', () => {
  const page = PageIR.parse({
    pageId: 'pg-cap',
    pageType: 'text',
    layoutVariant: 'text/bullets@v1',
    title: { main: '标题' },
    blocks: [{ id: 'b', type: 'bullets', items: ['一'] }],
  });
  const lines = capacityLines(page, CLASSIC);
  assert.equal(lines.length, 1);
  assert.match(lines[0]!, /版式容量/);
  assert.match(lines[0]!, /要点不超过 \d+ 条/);
  assert.match(lines[0]!, /每条不超过 \d+ 字/);

  // 容量确实来自该版式，而不是写死的数字
  const variant = CLASSIC.base.layouts.find((l) => l.id === 'text/bullets@v1')!;
  assert.ok(lines[0]!.includes(`正文总量不超过 ${variant.maxBodyChars} 字`), lines[0]!);
});

test('版式在包里找不到时不硬编一句容量，宁可什么都不加', () => {
  const page = PageIR.parse({
    pageId: 'pg-cap2', pageType: 'text', layoutVariant: 'text/does-not-exist@v1',
    title: { main: '标题' }, blocks: [{ id: 'b', type: 'paragraph', text: 'x' }],
  });
  assert.deepEqual(capacityLines(page, CLASSIC), []);
});

test('页面被删后写回不再把它插回来（重新生成会残留旧页的真因）', async () => {
  const { project, user } = makeProject();
  const page = PageIR.parse({
    pageId: 'pg_resurrect', pageType: 'text', layoutVariant: 'text/one-column@v1',
    title: { main: '会被删掉的一页' },
    blocks: [{ id: 'b', type: 'paragraph', text: '正文' }],
    status: 'ready',
  });
  savePageGroup(project.projectId, user.tenantId, [page], 0, 0);
  assert.equal(listPages(project.projectId).length, 1);

  // 模拟「整份重新生成」：旧页连同它的任务一起被删
  run('DELETE FROM pages WHERE projectId = ?', project.projectId);

  // 此刻一个还在跑的慢任务（比如图片生成）回来写回这一页
  const saved = savePage(project.projectId, user.tenantId, page, 0);

  assert.equal(saved, null, '页已不存在时应跳过写回');
  assert.equal(listPages(project.projectId).length, 0, '不该把删掉的页插回来');
});

test('页面还在时写回照常生效，并递增版本', async () => {
  const { project, user } = makeProject();
  const page = PageIR.parse({
    pageId: 'pg_writeback', pageType: 'text', layoutVariant: 'text/one-column@v1',
    title: { main: '正常写回' },
    blocks: [{ id: 'b', type: 'paragraph', text: '正文' }],
    status: 'ready',
  });
  savePageGroup(project.projectId, user.tenantId, [page], 0, 0);
  const before = listPages(project.projectId)[0]!;

  const next = PageIR.parse({ ...page, blocks: [{ id: 'b', type: 'paragraph', text: '改过的正文' }] });
  const saved = savePage(project.projectId, user.tenantId, next, 0);

  assert.ok(saved, '页还在时应当写回');
  assert.equal(saved!.version, before.version + 1);
  assert.equal(saved!.pageId, 'pg_writeback');
});

/**
 * **大纲决定这一本有多少页**，超出去的页行要跟着删。
 *
 * 原先 `saveOutline` 只写 `decks.meta`，`pages` 表一个字节都不动。于是把页数改小、
 * 重出提纲之后，库里还留着旧的那些行——而客户端会按 DB 里最大的 `pageIndex` 把页数
 * **补回去**，界面上就还是原来的页数。用户的原话：「页数改少了之后…还是原来的页数」。
 */
test('大纲变短时，超出页数的页面行一起删掉', () => {
  const { project, user } = makeProject();
  const outlineOf = (n: number) => Array.from({ length: n }, (_, i) => OutlinePage.parse({
    index: i,
    pageType: i === 0 ? 'cover' : i === n - 1 ? 'end' : 'text',
    title: `第 ${i + 1} 页`,
    claim: '',
    points: [],
    section: '',
    notes: '',
  }));

  saveOutline(project.projectId, user.tenantId, outlineOf(5));
  savePageGroup(project.projectId, user.tenantId, Array.from({ length: 5 }, (_, i) => PageIR.parse({
    pageId: `pg_trim_${i}`, pageType: 'text', layoutVariant: 'text/one-column@v1',
    title: { main: `第 ${i + 1} 页` },
  })), 0);
  assert.equal(listPages(project.projectId).length, 5, '先摆 5 页');

  saveOutline(project.projectId, user.tenantId, outlineOf(2));
  const left = listPages(project.projectId);
  assert.equal(left.length, 2, '大纲缩到 2 页，多出来的页行该删掉');
  assert.deepEqual(left.map((p) => p.pageIndex), [0, 1]);

  // 改大时不补：那几页要重新生成，不该凭空冒出来
  saveOutline(project.projectId, user.tenantId, outlineOf(4));
  assert.equal(listPages(project.projectId).length, 2, '改大不会把删掉的页变回来');
});

/**
 * **只改一页的类型，别的页一个都不动。**
 *
 * 这条守的是工作台的「转成图文页」。此前那条路图省事调了 `saveOutline`，而它按上面
 * 那条测试的设计会删掉 `pageIndex >= outline.length` 的页行——实测把一个 13 页的项目
 * （大纲 8 条）当场删到 6 页，不可逆。转换只该动它自己那一页，所以走这个函数。
 */
test('setOutlinePageType 只改一页的类型，一个页行都不删', () => {
  const { project, user } = makeProject();
  const outlineOf = (n: number) => Array.from({ length: n }, (_, i) => OutlinePage.parse({
    index: i, pageType: 'text', title: `第 ${i + 1} 页`, claim: '', points: [], section: '', notes: '',
  }));

  // 故意让页行多于大纲：这正是会触发 `saveOutline` 删页的形状
  saveOutline(project.projectId, user.tenantId, outlineOf(2));
  savePageGroup(project.projectId, user.tenantId, Array.from({ length: 4 }, (_, i) => PageIR.parse({
    pageId: `pg_type_${i}`, pageType: 'text', layoutVariant: 'text/one-column@v1',
    title: { main: `第 ${i + 1} 页` },
  })), 0);
  assert.equal(listPages(project.projectId).length, 4, '前置条件：4 个页行，大纲只有 2 条');

  setOutlinePageType(project.projectId, user.tenantId, 1, 'imageText');

  assert.equal(listPages(project.projectId).length, 4, '一个页行都不该少');
  const outline = readDeckMeta(project.projectId).outline ?? [];
  assert.equal(outline[1]?.pageType, 'imageText', '这一页的类型要真的改到');
  assert.equal(outline[0]?.pageType, 'text', '别的页不动');
  assert.equal(outline.length, 2, '大纲本身不多不少');

  // 越界要明确报错，不能悄悄什么都不做——那样调用方会以为改成功了
  assert.throws(
    () => setOutlinePageType(project.projectId, user.tenantId, 9, 'imageText'),
    /大纲里没有/,
  );
});

test('模型给出要点后，兜底散文让位，不与要点并存', () => {
  const page = PageIR.parse({
    pageId: 'pg-polish', pageType: 'text', layoutVariant: 'text/one-column@v1',
    title: { main: '交付方式的变化' },
    blocks: [{ id: 'pg-polish-para', type: 'paragraph', text: '整段原文'.repeat(60) }],
    overrides: { fallbackParagraph: true },
  });
  const next = applyPolish(page, { main: '交付方式之变', points: ['从卖产品到卖结果', '从项目制到持续运营'] });

  assert.equal(next.title.main, '交付方式之变');
  assert.equal(next.blocks.some((b) => b.type === 'paragraph'), false, '兜底散文应被替换掉');
  const bullets = next.blocks.find((b) => b.type === 'bullets');
  assert.ok(bullets && bullets.type === 'bullets');
  assert.equal(bullets.items.length, 2);
  assert.equal(next.overrides.fallbackParagraph, false, '标记要清掉，免得后续再误判');
});

test('用户自己的正文不会被模型要点挤掉', () => {
  const page = PageIR.parse({
    pageId: 'pg-keep', pageType: 'text', layoutVariant: 'text/one-column@v1',
    title: { main: '标题' },
    blocks: [{ id: 'p', type: 'paragraph', text: '这是用户自己写的正文。' }],
  });
  const next = applyPolish(page, { points: ['要点一'] });
  assert.ok(next.blocks.some((b) => b.type === 'paragraph'), '没有兜底标记的正文必须保留');
  assert.ok(next.blocks.some((b) => b.type === 'bullets'));
});

test('模型没给标题时不把原标题清空', () => {
  const page = PageIR.parse({
    pageId: 'pg-null', pageType: 'text', layoutVariant: 'text/one-column@v1',
    title: { main: '原标题', sub: '原副标题' },
    blocks: [{ id: 'p', type: 'paragraph', text: '正文' }],
  });
  const next = applyPolish(page, { main: '   ', points: [] });
  assert.equal(next.title.main, '原标题');
  assert.equal(next.title.sub, '原副标题');
  assert.equal(next.blocks.length, 1, '没有要点时块不动');
});

test('模型给的要点去空并按上限截断', () => {
  const page = PageIR.parse({
    pageId: 'pg-trim', pageType: 'text', layoutVariant: 'text/one-column@v1',
    title: { main: '标题' },
    blocks: [{ id: 'p', type: 'paragraph', text: '正文' }],
  });
  const next = applyPolish(page, { points: ['一', '  ', '二', '三', '四', '五', '六'] });
  const bullets = next.blocks.find((b) => b.type === 'bullets');
  assert.ok(bullets && bullets.type === 'bullets');
  assert.deepEqual(bullets.items, ['一', '二', '三', '四', '五']);
});

/* ---------------- 风格包的删除 ---------------- */

test('内置风格包被项目引用时不能删，并报出有几个项目在用', async () => {
  const { deleteStyle } = await import('../services/style.service.js');
  const r = deleteStyle('business-classic@1.0');
  assert.equal(r.deleted, false);
  assert.ok(r.reason.includes('个项目在用'), r.reason);
});

test('没被引用的内置风格删掉是隐藏而不是物理删除，且可以恢复', async () => {
  const { deleteStyle, listHiddenStyles, listStyles, restoreStyle } = await import('../services/style.service.js');
  const ref = 'academic-rigor@1.0';

  const r = deleteStyle(ref);
  assert.equal(r.deleted, true, r.reason);
  // 内置包的真值在代码里，物理删掉下次启动 ensureBuiltinStyles 会把它写回来，
  // 所以「删」只能是打隐藏标记，并且要能被列出来、能被恢复
  assert.ok(listHiddenStyles().some((s) => s.styleId === ref), '应出现在隐藏列表里');
  assert.ok(!listStyles({ limit: 300 }).items.some((s) => s.styleId === ref), '不应出现在可见列表里');

  restoreStyle(ref);
  assert.ok(!listHiddenStyles().some((s) => s.styleId === ref), '恢复后不应还在隐藏列表里');
  assert.ok(listStyles({ limit: 300 }).items.some((s) => s.styleId === ref), '恢复后应重新可见');
});

test('自建风格包没有项目在用就能删掉', async () => {
  const { deleteStyle, saveStyle, resolveStyle } = await import('../services/style.service.js');
  const base = resolveStyle('business-classic');
  const custom = {
    ...base,
    styleId: 'probe-deletable',
    name: '可删的探针风格',
    meta: { builtin: false, reviewed: false, createdAt: Date.now(), updatedAt: Date.now() },
  };
  const saved = saveStyle(custom);
  assert.equal(saved.ok, true, JSON.stringify(saved.issues));

  const r = deleteStyle('probe-deletable@1.0');
  assert.equal(r.deleted, true);
  assert.throws(() => resolveStyle('probe-deletable@1.0'), /风格包不存在/);
});

test('还有项目在用的风格包不能删，并报出有几个项目', async () => {
  const { deleteStyle, saveStyle, resolveStyle } = await import('../services/style.service.js');
  const { project } = makeProject();
  const base = resolveStyle('business-classic');
  const custom = {
    ...base,
    styleId: 'probe-in-use',
    name: '在用中的探针风格',
    meta: { builtin: false, reviewed: false, createdAt: Date.now(), updatedAt: Date.now() },
  };
  assert.equal(saveStyle(custom).ok, true);
  run('UPDATE projects SET styleId = ? WHERE projectId = ?', 'probe-in-use@1.0', project.projectId);

  const r = deleteStyle('probe-in-use@1.0');
  assert.equal(r.deleted, false);
  assert.ok(r.reason.includes('1 个项目'), r.reason);
  // 还在，别真的删了
  assert.equal(resolveStyle('probe-in-use@1.0').styleId, 'probe-in-use');
});

test('删不存在的风格包如实报 404', async () => {
  const { deleteStyle } = await import('../services/style.service.js');
  assert.throws(() => deleteStyle('no-such-style@1.0'), /风格包不存在/);
});

test('被占用时把「谁在用」和「建议改到哪」一起报出来', async () => {
  const { deleteStyle, saveStyle, resolveStyle } = await import('../services/style.service.js');
  const { project } = makeProject();
  const base = resolveStyle('business-classic');
  const custom = {
    ...base,
    styleId: 'probe-suggest',
    name: '待建议的探针风格',
    meta: { builtin: false, reviewed: false, createdAt: Date.now(), updatedAt: Date.now() },
  };
  assert.equal(saveStyle(custom).ok, true);
  run('UPDATE projects SET styleId = ? WHERE projectId = ?', 'probe-suggest@1.0', project.projectId);

  // 光拒绝不够：用户看到「先给它们换一个再删」却找不到换的地方，删除就等于删不掉。
  // 所以响应里必须带着可执行的下一步——占用它的项目清单，以及推荐的替代风格。
  const r = deleteStyle('probe-suggest@1.0');
  assert.equal(r.deleted, false);
  assert.ok(r.projects?.some((p) => p.projectId === project.projectId), '应报出占用它的项目');
  assert.ok(r.suggestion, '应给出替代风格');
  assert.ok(r.suggestion!.reason.length > 0, '推荐要给得出理由');
  // 推荐的不能是它自己
  assert.notEqual(r.suggestion!.styleId, 'probe-suggest@1.0');
});

test('带上 reassignTo 就先把项目搬过去再删', async () => {
  const { deleteStyle, saveStyle, resolveStyle } = await import('../services/style.service.js');
  const { project } = makeProject();
  const base = resolveStyle('business-classic');
  const custom = {
    ...base,
    styleId: 'probe-reassign',
    name: '待搬走的探针风格',
    meta: { builtin: false, reviewed: false, createdAt: Date.now(), updatedAt: Date.now() },
  };
  assert.equal(saveStyle(custom).ok, true);
  run('UPDATE projects SET styleId = ? WHERE projectId = ?', 'probe-reassign@1.0', project.projectId);

  const r = deleteStyle('probe-reassign@1.0', { reassignTo: 'academic-rigor@1.0' });
  assert.equal(r.deleted, true, r.reason);
  assert.equal(r.reassigned?.count, 1);
  // 项目真的搬过去了，而不是留着一个指向已删包的悬空引用
  const row = get<{ styleId: string }>('SELECT styleId FROM projects WHERE projectId = ?', project.projectId)!;
  assert.equal(row.styleId, 'academic-rigor@1.0');
  assert.throws(() => resolveStyle('probe-reassign@1.0'), /风格包不存在/);
});

test('要换过去的风格不存在或已删除时拒绝，且不把项目搬走', async () => {
  const { deleteStyle, saveStyle, resolveStyle } = await import('../services/style.service.js');
  const { project } = makeProject();
  const base = resolveStyle('business-classic');
  const custom = {
    ...base,
    styleId: 'probe-bad-target',
    name: '目标不合法的探针风格',
    meta: { builtin: false, reviewed: false, createdAt: Date.now(), updatedAt: Date.now() },
  };
  assert.equal(saveStyle(custom).ok, true);
  run('UPDATE projects SET styleId = ? WHERE projectId = ?', 'probe-bad-target@1.0', project.projectId);

  // 不校验目标就 UPDATE 的话，项目会被指向一个不存在的包——当场打不开，
  // 而删除本身却报告成功。所以这里必须整笔拒绝。
  assert.throws(
    () => deleteStyle('probe-bad-target@1.0', { reassignTo: 'no-such-style@1.0' }),
    /不存在或已被删除/,
  );
  const row = get<{ styleId: string }>('SELECT styleId FROM projects WHERE projectId = ?', project.projectId)!;
  assert.equal(row.styleId, 'probe-bad-target@1.0', '拒绝时项目不能被搬走');
  assert.equal(resolveStyle('probe-bad-target@1.0').styleId, 'probe-bad-target', '拒绝时风格包不能被删');
});

test('替代风格优先同族、其次同明暗', async () => {
  const { suggestReplacement, saveStyle, resolveStyle } = await import('../services/style.service.js');
  const base = resolveStyle('business-classic');

  // 同族同明暗但调性不同
  assert.equal(saveStyle({
    ...base,
    styleId: 'probe-same-family',
    name: '同族探针',
    meta: { builtin: false, reviewed: false, createdAt: Date.now(), updatedAt: Date.now() },
  }).ok, true);
  // 异族但深色
  assert.equal(saveStyle({
    ...resolveStyle('tech-minimal'),
    styleId: 'probe-other-family',
    name: '异族探针',
    meta: { builtin: false, reviewed: false, createdAt: Date.now(), updatedAt: Date.now() },
  }).ok, true);

  const pick = suggestReplacement('probe-same-family@1.0');
  assert.ok(pick, '应给出候选');
  // 同族的骨架、页类型覆盖、动效白名单都一致，换过去项目变化最小，
  // 所以同族必须赢过「只是恰好也排在库里」的别的风格
  assert.equal(pick!.styleId, 'business-classic@1.0');
});
