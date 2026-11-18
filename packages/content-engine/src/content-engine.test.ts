import test from 'node:test';
import assert from 'node:assert/strict';
import { PageIR, isMotionMode } from '@lumen/ir-schema';
import { BUILTIN_STYLE_PACKS, findVariant } from '@lumen/style-engine';
import {
  AUDIENCE_BRIEF, COMBO_OVERRIDE, SCENE_BRIEF, narrationBrief,
} from './narration.js';
import {
  analyzeSignals, detectIntent, segmentContent, suggestedPageRange,
  extractMetrics, toMetricBlocks, setPrimaryMetric,
  measureContent, computeLoad, assessDensity, splitContent,
  buildOutline, extractPoints, extractExplicitBullets, reindexOutline, changePageType, insertPage, removePage, renamePage,
  extractAccentWords, buildChartData, inferChartKind, buildImagePrompt, buildPageIR,
} from './index.js';

const PACK = BUILTIN_STYLE_PACKS.find((p) => p.styleId === 'business-classic')!;

const ARTICLE = [
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

test('意图识别：结构化长文判为已有内容', () => {
  const r = detectIntent(ARTICLE);
  assert.equal(r.kind, 'has_content');
  assert.ok(r.confidence >= 0.8);
  assert.ok(r.reason.length > 0);
});

test('意图识别：短句判为仅想法，纯结构行判为仅大纲', () => {
  assert.equal(detectIntent('帮我做个关于我们新产品的路演').kind, 'idea_only');
  const outlineOnly = '1. 背景\n2. 问题\n3. 方案\n4. 数据';
  assert.equal(detectIntent(outlineOnly).kind, 'outline_only');
});

test('意图识别：空输入不抛错', () => {
  const r = detectIntent('   ');
  assert.equal(r.kind, 'idea_only');
  assert.equal(r.confidence, 1);
});

test('信号分析给出可信的字数、句数、结构行数', () => {
  const s = analyzeSignals(ARTICLE);
  assert.ok(s.charCount > 200);
  assert.ok(s.lineCount >= 8);
  assert.equal(s.structureLines, 6, '3 个编号标题 + 3 个项目符号');
  assert.ok(s.bodyChars >= 250, `正文体量应足够判定为完整内容，实际 ${s.bodyChars}`);
  assert.ok(s.sentenceCount >= 5);
});

test('建议页数随内容量增长，且不超过 24', () => {
  const small = suggestedPageRange('idea_only', analyzeSignals('很短的想法'));
  const big = suggestedPageRange('has_content', analyzeSignals(ARTICLE.repeat(20)));
  assert.ok(big.max > small.max);
  assert.ok(big.max <= 24);
});

test('内容切分：有显式结构时按结构切块', () => {
  const segs = segmentContent(ARTICLE);
  assert.equal(segs.length, 3, '应切出 3 个结构化段落');
  assert.match(segs[0]!, /市场现状/);
  assert.match(segs[2]!, /我们的方案/);
});

test('内容切分：无结构时按空行段落切', () => {
  const text = '第一段内容比较长一些。\n\n第二段内容也比较长一些。\n\n第三段内容同样比较长。';
  const segs = segmentContent(text);
  assert.equal(segs.length, 3);
});

test('指标抽取：百分比、倍数、金额、排名、趋势都能识别并带出处', () => {
  // limit 放宽到 20，否则高分模式会先占满名额，掩盖后续模式是否生效
  const m = extractMetrics(ARTICLE, 20);
  const values = m.map((x) => x.value);
  assert.ok(values.includes('210%'), `应识别 210%，实际 ${values.join('/')}`);
  assert.ok(values.includes('34%'));
  assert.ok(values.includes('18%'));
  assert.ok(values.includes('9 倍'), `应识别倍数，实际 ${values.join('/')}`);
  assert.ok(values.includes('1.2亿元'), `应识别金额，实际 ${values.join('/')}`);
  assert.ok(values.includes('3000家'), `应识别计数，实际 ${values.join('/')}`);
  assert.ok(m.every((x) => x.source.length > 0), '每条指标都必须带原文出处');
  assert.ok(m.every((x) => x.label.length >= 2), '每条指标都要有名称');
  assert.ok(m.every((x) => x.label !== '关键指标'), '规则能覆盖的句子都应抽到真实名称');

  // 指标名取数值之前的名词短语，而不是把动词也带上
  const cvr = extractMetrics('本季度转化率提升到 34%', 5)[0]!;
  assert.match(cvr.label, /转化率/, `指标名应含「转化率」，实际「${cvr.label}」`);
});

test('指标抽取：排名类能识别', () => {
  const m = extractMetrics('该产品在细分市场排名第 3 名，TOP 10 中唯一的新玩家', 10);
  assert.ok(m.some((x) => x.kind === 'rank' && x.value.includes('第 3 名')));
  assert.ok(m.some((x) => x.kind === 'rank' && x.value.includes('TOP 10')));
});

test('指标抽取：趋势词能识别为 trend 类型', () => {
  const m = extractMetrics('本季度营收增长 45%，毛利率下降 3%');
  assert.ok(m.some((x) => x.kind === 'trend' && x.trend.includes('增长')));
  assert.ok(m.some((x) => x.kind === 'trend' && x.trend.includes('下降')));
});

test('指标抽取：无数字时返回空数组', () => {
  assert.deepEqual(extractMetrics('这段文字里没有任何数字'), []);
  assert.deepEqual(extractMetrics(''), []);
});

test('主指标可一键改选，且始终只有一个 primary', () => {
  const blocks = toMetricBlocks(extractMetrics(ARTICLE, 20), 4);
  assert.ok(blocks.length >= 2);
  assert.equal(blocks.filter((b) => b.primary).length, 1);
  assert.equal(blocks[0]!.primary, true);

  const switched = setPrimaryMetric(blocks, 1);
  assert.equal(switched[0]!.primary, false);
  assert.equal(switched[1]!.primary, true);
  assert.equal(switched.filter((b) => b.primary).length, 1);
});

test('密度判定：内容超容量时触发拆页建议', () => {
  const variant = findVariant(PACK, 'metrics/three-card@v1');
  const heavy = PageIR.parse({
    pageId: 'p1', pageType: 'metrics', layoutVariant: variant.id,
    title: { main: '一页塞了太多内容的测试标题'.repeat(3) },
    blocks: [
      { type: 'paragraph', text: '正文'.repeat(400) },
      { type: 'bullets', items: ['要点一', '要点二', '要点三', '要点四', '要点五'] },
      { type: 'metric', value: '1', label: 'a' },
      { type: 'metric', value: '2', label: 'b' },
      { type: 'metric', value: '3', label: 'c' },
      { type: 'metric', value: '4', label: 'd' },
      { type: 'metric', value: '5', label: 'e' },
    ],
  });
  const v = assessDensity(heavy, variant);
  assert.equal(v.overflow, true);
  assert.ok(v.suggestedPages >= 2);
  assert.match(v.reason, /超出/);

  const light = PageIR.parse({
    pageId: 'p2', pageType: 'text', layoutVariant: 'text/one-column@v1',
    title: { main: '短标题' }, blocks: [{ type: 'paragraph', text: '一句话。' }],
  });
  const v2 = assessDensity(light, findVariant(PACK, 'text/one-column@v1'));
  assert.equal(v2.overflow, false);
  assert.equal(v2.suggestedPages, 1);
});

test('度量与负载计算自洽', () => {
  const page = PageIR.parse({
    pageId: 'p', pageType: 'text', layoutVariant: 'text/one-column@v1',
    title: { main: '标题' },
    blocks: [
      { type: 'paragraph', text: '十个字的正文内容' },
      { type: 'bullets', items: ['甲', '乙'] },
      { type: 'metric', value: '87%', label: '转化率' },
    ],
  });
  const load = measureContent(page);
  assert.equal(load.blocks, 3);
  assert.equal(load.bullets, 2);
  assert.equal(load.metrics, 1);
  assert.ok(load.bodyChars > 0);
  const ratio = computeLoad(load, findVariant(PACK, 'text/one-column@v1'));
  assert.ok(ratio > 0 && ratio < 1);
});

test('拆页均分不丢内容', () => {
  const items = [1, 2, 3, 4, 5, 6, 7];
  const parts = splitContent(items, 3);
  assert.equal(parts.length, 3);
  assert.deepEqual(parts.flat(), items);
});

test('大纲生成：3 页已有内容正确分页且首页封面末页结尾', () => {
  const { outline, intent } = buildOutline({ title: '产品战略', brief: ARTICLE, audienceTag: 'executive' });
  assert.equal(intent.kind, 'has_content');
  assert.equal(outline[0]!.pageType, 'cover');
  assert.equal(outline[outline.length - 1]!.pageType, 'end');
  const contentPages = outline.slice(1, -1);
  assert.equal(contentPages.length, 3, '三段结构化内容应生成 3 个内容页');
  assert.deepEqual(outline.map((p) => p.index), outline.map((_, i) => i), 'index 必须连续');
});

test('大纲生成：仅想法时套用人群叙事结构', () => {
  const { outline } = buildOutline({ title: '新产品路演', brief: '帮我做一份新产品路演', audienceTag: 'founder', targetPages: 6 });
  assert.equal(outline[0]!.pageType, 'cover');
  assert.equal(outline[outline.length - 1]!.pageType, 'end');
  assert.ok(outline.length >= 4);
  assert.ok(outline.slice(1, -1).every((p) => p.claim.length > 0));
});

/**
 * **不管哪个人群模板，都只有一个封底。**
 *
 * 模板描述的是**正文**，封面、目录、封底由 `buildOutline` 统一补。`general` /
 * `scholar` / `brand` 的末项原先都写成 `end`，于是骨架末尾出来两个「谢谢」
 * （实测：`…text, end, end`）。这条用例把六个模板一次钉住。
 */
test('大纲生成：不管哪个人群模板，都只有一个封底', () => {
  for (const audienceTag of ['founder', 'executive', 'scholar', 'tech-lead', 'brand', 'general'] as const) {
    const { outline } = buildOutline({ title: 'T', brief: '帮我做一份分享', audienceTag, targetPages: 12 });
    const ends = outline.filter((p) => p.pageType === 'end');
    assert.equal(ends.length, 1, `${audienceTag} 出了 ${ends.length} 个封底`);
    assert.equal(outline[outline.length - 1]!.pageType, 'end', '封底要在最后一页');
    assert.equal(outline[0]!.pageType, 'cover');
    assert.deepEqual(outline.map((p) => p.index), outline.map((_, i) => i), 'index 必须连续');
  }
});

/**
 * 页数是**用户设的**，不是内容长度说了算。
 *
 * 原先「已有内容」那条路完全不看 `targetPages`（理由是「不能丢内容」），
 * 于是页数输入框是个摆设：设 3 页、设 30 页，出来都一样多。
 * 不丢内容的正确做法是**合并相邻段落**，而不是无视用户给的数。
 */
test('大纲生成：页数少于段落数时合并相邻段落，内容一句不丢', () => {
  // 这份 brief 三段，不设页数时是封面 + 3 + 结尾 = 5 页
  const plain = buildOutline({ title: 'T', brief: ARTICLE, audienceTag: 'executive' });
  assert.equal(plain.outline.length, 5);

  const three = buildOutline({ title: 'T', brief: ARTICLE, audienceTag: 'executive', targetPages: 3 });
  assert.equal(three.outline.length, 3, '设 3 页就该是 3 页');
  assert.equal(three.outline[0]!.pageType, 'cover');
  assert.equal(three.outline[2]!.pageType, 'end');

  // 三段的原文都并进了那一个内容页——合并是「并起来」不是「砍掉」
  const merged = three.outline[1]!.notes;
  assert.match(merged, /210%/, '第一段的事实要在');
  assert.match(merged, /续费率也从 82% 降到 61%/, '第一段后半也要在');
  assert.match(merged, /风格一次性/, '第二段要在');
  assert.match(merged, /3000 家企业客户/, '第三段要在');
});

test('大纲生成：页数多于段落数时不硬凑，按内容实际能出的页数出', () => {
  // 规则层造不出没有的内容——多出来的页只能由模型补，这里如实给能给的
  const many = buildOutline({ title: 'T', brief: ARTICLE, audienceTag: 'executive', targetPages: 20 });
  assert.equal(many.outline.length, 5, '三段内容撑不出 20 页，就还是 5 页');
});

/**
 * 人物页有两套入口，这里两条都测：**内容里讲了人**（按段落判），
 * 以及**叙事结构里有团队这一页**（路演那条模板）。
 *
 * 判成人物页之后，生成时会带上那套 16 个版式的骨架（见 `@lumen/ir-schema` 的
 * `peopleLayoutCandidates`），排出来才像人物页而不是普通文字页。
 */
const TEAM_ARTICLE = [
  '1. 市场现状',
  '存量竞争加剧，市场增速从 210% 降到 18%，客户续费率也从 82% 降到 61%。',
  '企业采购决策正在从「买工具」转向「买效率」，这对产品的全链路能力提出了更高要求。',
  '',
  '2. 核心团队',
  '核心团队成员来自三家头部厂商，负责过同类产品的完整生命周期，服务过三百多家客户。',
  '团队在过去八年里交付过两代企业级产品，经历过从零到一的完整过程。',
  '- 张伟，CEO，前某某公司副总裁',
  '- 李娜，CTO，主导过两代产品架构',
].join('\n');

test('大纲生成：段落里讲了人，这一页判成人物页', () => {
  const { outline } = buildOutline({ title: 'T', brief: TEAM_ARTICLE, audienceTag: 'founder' });
  const team = outline.find((p) => p.claim.includes('核心团队') || p.notes.includes('核心团队成员'));
  assert.ok(team, `找不到团队那一页：${outline.map((p) => `${p.index}:${p.pageType}:${p.claim}`).join(' / ')}`);
  assert.equal(team.pageType, 'people');
  // 另一段没讲人，不该被带跑
  const market = outline.find((p) => p.notes.includes('存量竞争加剧') || p.claim.includes('市场现状'));
  assert.notEqual(market?.pageType, 'people');
});

test('大纲生成：讲「团队怎么样」的段落不判成人物页', () => {
  // 「团队」在这里是定语，这一页讲的是效率。判成人物页就得给一个没有人的
  // 人物页排版——只能编人，或者留一堆空头像框
  const brief = [
    '1. 交付效率',
    '团队执行力强，交付周期从 30 天降到 12 天，人均产出提升 3 倍。这条路径已经在多个行业头部客户处得到验证，具备可复制性。',
    '试点客户的平均制作时长从 6 小时下降到 40 分钟，返工率下降 73%，客户口碑在行业里排在前列，续费率长期保持在九成以上。',
    '交付拆成了标准动作，每一步都有验收口径，换个人来做也不会走样，这条流水线是效率提升的真正来源。',
    '',
    '2. 成本结构',
    '单客户交付成本从 8 万元降到 1.2 万元，毛利率从 21% 提升到 58%，规模效应已经显现。',
    '边际成本随客户数增加而持续下降，这条曲线在三百家客户上得到了验证，没有出现反弹，说明它不是补贴换来的。',
  ].join('\n');

  const { outline, intent } = buildOutline({ title: 'T', brief, audienceTag: 'founder' });
  assert.equal(intent.kind, 'has_content', '这份 brief 该走内容那条路，否则测不到内容判据');
  assert.deepEqual(
    outline.filter((p) => p.pageType === 'people').map((p) => p.claim), [],
    '「团队」当定语时不该判成人物页',
  );
});

test('大纲生成：名册式的段落（一行一个人）判成人物页', () => {
  // 首句没有讲人的词，但下面挂着两条名册——这也是人物页
  const brief = [
    '1. 我们的优势',
    '整条产品线从零到一都跑过一遍，具备可复制性，客户口碑在行业里排在前列，续费率长期保持在九成以上。',
    '这条路径已经在多个行业头部客户处得到验证，交付时长从 6 小时下降到 40 分钟，返工率下降 73%，客户满意度在验收回访里稳定在九十五分以上。',
    '交付拆成了标准动作，每一步都有验收口径，换个人来做也不会走样，这条流水线是效率提升的真正来源，也是别人抄不走的部分。',
    '',
    '2. 人选说明',
    '下面两位是这条线的主心骨，核心成员履历如下，每一位都做过同类产品，也都在大厂带过完整团队。',
    '两个人的履历互补，一个管渠道一个管产品，配合过两代产品的完整周期，信任是在真项目里磨出来的，不是临时凑的班子。',
    '- 张伟，前某某公司副总裁，负责渠道',
    '- 李娜，前某某公司架构师，负责产品',
  ].join('\n');

  const { outline, intent } = buildOutline({ title: 'T', brief, audienceTag: 'founder' });
  assert.equal(intent.kind, 'has_content', '这份 brief 该走内容那条路，否则测不到内容判据');
  const page = outline.find((p) => p.claim.includes('人选说明'));
  assert.ok(page, `找不到那一页：${outline.map((p) => `${p.index}:${p.pageType}:${p.claim}`).join(' / ')}`);
  assert.equal(page.pageType, 'people', '首句没讲人但挂着两条名册，也该判成人物页');
});

test('大纲生成：路演叙事里有团队这一页', () => {
  // 页数要够长才轮得到它：叙事是切片取的，设 9 页才切到第 7 条
  const { outline } = buildOutline({ title: '新产品路演', brief: '帮我做一份新产品路演', audienceTag: 'founder', targetPages: 9 });
  assert.ok(
    outline.some((p) => p.pageType === 'people'),
    '路演这条路走的是模板叙事，模板里没有人物页就永远排不出人物页',
  );
});

test('大纲编辑：排序、改页类型、增删、改标题', () => {
  const { outline } = buildOutline({ title: 'T', brief: ARTICLE, audienceTag: 'executive' });
  assert.deepEqual(reindexOutline(outline).map((p) => p.index), outline.map((_, i) => i));

  const changed = changePageType(outline, 1, 'chart');
  assert.equal(changed[1]!.pageType, 'chart');
  // 封面页类型不可改
  assert.equal(changePageType(outline, 0, 'text')[0]!.pageType, 'cover');

  const inserted = insertPage(outline, 1, { pageType: 'text', claim: '新页', title: '新页', points: [], section: '', notes: '' });
  assert.equal(inserted.length, outline.length + 1);
  assert.deepEqual(inserted.map((p) => p.index), inserted.map((_, i) => i));

  const removed = removePage(inserted, 2);
  assert.equal(removed.length, outline.length);
  // 封面不可删
  assert.equal(removePage(outline, 0).length, outline.length);

  assert.equal(renamePage(outline, 1, '新标题')[1]!.title, '新标题');
});

test('要点抽取：优先项目符号，最多 5 条', () => {
  const pts = extractPoints('- 甲\n- 乙\n- 丙');
  assert.deepEqual(pts, ['甲', '乙', '丙']);
  const many = extractPoints('- 一\n- 二\n- 三\n- 四\n- 五\n- 六\n- 七');
  assert.equal(many.length, 5, '要点上限为 5（PRD §5.3）');
});

test('显式要点抽取：段落自身的标题行不算要点', () => {
  const seg = ['2. 核心痛点', '- 风格一次性，页间漂移严重', '- 只生成不可精修', '- 生成与演示割裂'].join('\n');
  const items = extractExplicitBullets(seg);
  assert.deepEqual(items, ['风格一次性，页间漂移严重', '只生成不可精修', '生成与演示割裂']);
  assert.equal(items.includes('核心痛点'), false, '标题行不应成为要点');
});

test('显式要点抽取：散文段落返回空数组，避免与正文重复', () => {
  const prose = ['1. 市场现状', '过去三年市场增长了 210%。', '客户续费率从 82% 降到 61%。'].join('\n');
  assert.deepEqual(extractExplicitBullets(prose), []);
  // 但通用抽点仍能按句兜底
  assert.ok(extractPoints(prose).length >= 1);
});

test('散文内容页只渲染正文，不重复出现要点', () => {
  const outline = {
    index: 1, pageType: 'text' as const, claim: '市场正在快速扩张', title: '市场现状',
    points: [], section: '', notes: '',
  };
  const page = buildPageIR({
    pageId: 'pg-prose', outline, pack: PACK, pageIndex: 1, totalPages: 3,
    sourceText: ['1. 市场现状', '过去三年市场增长了 210%。', '客户续费率从 82% 降到 61%。'].join('\n'),
  });
  assert.equal(page.blocks.some((b) => b.type === 'bullets'), false);
  const para = page.blocks.find((b) => b.type === 'paragraph');
  assert.ok(para && para.type === 'paragraph');
  assert.equal(para.text.includes('市场现状'), false, '标题行应被剥掉');
  assert.match(para.text, /210%/);
});

test('强调词与图表数据抽取', () => {
  assert.deepEqual(extractAccentWords('转化率提升到 87%，「北极星指标」达成 3 倍'), ['北极星指标', '87%', '3 倍']);
  const cd = buildChartData('华东 320\n华南 280\n华北 150\n西南 90');
  assert.ok(cd);
  assert.deepEqual(cd.categories, ['华东', '华南', '华北', '西南']);
  assert.deepEqual(cd.series[0]!.values, [320, 280, 150, 90]);
  assert.equal(buildChartData('只有一句话没有数据'), null);
  assert.equal(inferChartKind('同比增长，环比上升，趋势明确'), 'line');
  assert.equal(inferChartKind('华东 320 华南 280'), 'bar');
});

test('图片提示词强制不含文字与真人', () => {
  const p = buildImagePrompt('增长路径', '以产品力驱动增长', ['克制', '权威', '留白']);
  assert.match(p, /不要出现任何文字/);
  assert.match(p, /不要出现可识别的真人肖像/);
  assert.match(p, /克制/);
});

test('Page IR 构建：产出合法 IR、版式来自风格包、无图片的页不加图块', () => {
  const outline = buildOutline({ title: '产品战略', brief: ARTICLE, audienceTag: 'executive' }).outline;
  for (const [i, o] of outline.entries()) {
    const page = buildPageIR({
      pageId: `pg_${i}`, outline: o, pack: PACK, pageIndex: i, totalPages: outline.length,
      sourceText: o.notes, avatarEnabled: true,
    });
    const parsed = PageIR.parse(page);
    assert.equal(parsed.footer.pageNo, i + 1);
    assert.ok(PACK.base.layouts.some((l) => l.id === parsed.layoutVariant), `版式 ${parsed.layoutVariant} 必须来自风格包`);
    // 新页面存的是 `auto`（模式，不在白名单里）；轮换出来的那个值由渲染层负责落在白名单内，
    // 这一层只保证「要么是白名单里的具体动效，要么是个模式」
    assert.ok(
      isMotionMode(parsed.motion.enter) || PACK.base.motionWhitelist.includes(parsed.motion.enter),
      '动效必须来自白名单',
    );
    if (parsed.pageType !== 'imageText' && !parsed.layoutVariant.includes('full-bleed')) {
      assert.equal(parsed.blocks.some((b) => b.type === 'image'), false, '非图文页不应出现图片块');
    }
  }
});

test('Page IR 构建：图文页带 AI 图片块，且提示词合规', () => {
  const page = buildPageIR({
    pageId: 'pg_img', pack: PACK, pageIndex: 2, totalPages: 8,
    outline: { index: 2, pageType: 'imageText', claim: '方案直接命中缺口', title: '解决方案', points: ['要点一'], section: '方案', notes: '正文内容若干。' },
  });
  const img = page.blocks.find((b) => b.type === 'image');
  assert.ok(img && img.type === 'image');
  assert.equal(img.source, 'ai');
  assert.equal(img.status, 'pending');
  assert.match(img.prompt, /不要出现任何文字/);
});

test('Page IR 构建：图表页无数据时降级并记录原因', () => {
  const page = buildPageIR({
    pageId: 'pg_c', pack: PACK, pageIndex: 1, totalPages: 5,
    outline: { index: 1, pageType: 'chart', claim: '趋势很好', title: '增长', points: [], section: '', notes: '这里没有任何成组数值。' },
  });
  assert.notEqual(page.pageType, 'chart');
  assert.match(page.degradeReason, /降级/);
  assert.equal(page.blocks.some((b) => b.type === 'chart'), false);
});

test('Page IR 构建：数字人默认在封面与结尾页关闭', () => {
  const outline = buildOutline({ title: 'T', brief: ARTICLE, audienceTag: 'executive' }).outline;
  const cover = buildPageIR({ pageId: 'c', outline: outline[0]!, pack: PACK, pageIndex: 0, totalPages: 4, avatarEnabled: true });
  const end = buildPageIR({ pageId: 'e', outline: outline[outline.length - 1]!, pack: PACK, pageIndex: 3, totalPages: 4, avatarEnabled: true });
  assert.equal(cover.avatar.enabled, true);
  assert.equal(cover.avatar.mode, 'off', '封面页不显示数字人');
  assert.equal(end.avatar.mode, 'off', '结尾页不显示数字人');
});

/* ---------------- 目录页 ---------------- */

test('三章的 deck 不加目录页', () => {
  const { outline } = buildOutline({ title: '产品战略', brief: ARTICLE, audienceTag: 'executive' });
  assert.equal(outline.filter((p) => p.pageType === 'toc').length, 0, '五页的 deck 不该有目录');
});

test('四章以上在封面后插入目录页，且索引重排', () => {
  const brief = ['一、市场', '二、产品', '三、增长', '四、组织', '五、风险']
    .map((h) => `${h}\n${'内容'.repeat(60)}`)
    .join('\n\n');
  const { outline } = buildOutline({ title: '年度规划', brief, audienceTag: 'executive' });
  const tocAt = outline.findIndex((p) => p.pageType === 'toc');
  assert.ok(tocAt > 0, '目录页应存在且不在首位');
  assert.equal(outline[0]!.pageType, 'cover', '封面仍在第一页');
  assert.equal(tocAt, 1, '目录紧跟封面');
  assert.equal(outline[outline.length - 1]!.pageType, 'end');
  outline.forEach((p, i) => assert.equal(p.index, i, 'index 必须与位置一致'));
});

test('目录页不把章节标题写进 points，避免撞上「要点 ≤5 条」', () => {
  const brief = ['一、A', '二、B', '三、C', '四、D', '五、E', '六、F']
    .map((h) => `${h}\n${'内容'.repeat(60)}`)
    .join('\n\n');
  const { outline } = buildOutline({ title: 'T', brief, audienceTag: 'executive' });
  const toc = outline.find((p) => p.pageType === 'toc');
  assert.ok(toc, '应有目录页');
  assert.deepEqual(toc!.points, [], '条目在构建页 IR 时从章节推导，不占 points');
});

/* ---------------- 页类型降级与正文兜底 ---------------- */

test('指标页抽不出指标时降级成文本页，不留一个没有指标卡的指标页', () => {
  const page = buildPageIR({
    pageId: 'pg-metrics-empty',
    outline: { index: 1, pageType: 'metrics', claim: '交付方式在变', title: '交付方式在变', points: [], section: '', notes: '' },
    pack: PACK, pageIndex: 1, totalPages: 3,
    sourceText: '客户要的是业务指标变化，不是功能上线。',
  });
  assert.equal(page.pageType, 'text', '没有指标就不该继续叫指标页');
  assert.equal(page.blocks.some((b) => b.type === 'metric'), false);
  assert.ok(page.degradeReason.includes('指标页降级'), `应记下降级原因，实际：${page.degradeReason}`);
});

test('有指标时仍是指标页，不误降级', () => {
  const page = buildPageIR({
    pageId: 'pg-metrics-ok',
    outline: { index: 1, pageType: 'metrics', claim: '关键指标达成', title: '关键指标达成', points: [], section: '', notes: '' },
    pack: PACK, pageIndex: 1, totalPages: 3,
    sourceText: '需求增长 210%，交付提速 43.8%，客户续约 84%。',
  });
  assert.equal(page.pageType, 'metrics');
  assert.ok(page.blocks.filter((b) => b.type === 'metric').length >= 2);
});

test('封面/章节页/封底不塞兜底正文', () => {
  for (const pageType of ['cover', 'section', 'end'] as const) {
    const page = buildPageIR({
      pageId: `pg-${pageType}`,
      outline: { index: 1, pageType, claim: '本次汇报的核心结论', title: '结论前置', points: [], section: '', notes: '' },
      pack: PACK, pageIndex: 1, totalPages: 3,
      sourceText: '本次汇报的核心结论',
    });
    // 封面可能配一张整幅出血的主视觉图，那不是「正文」
    assert.equal(
      page.blocks.some((b) => b.type === 'paragraph' || b.type === 'bullets'),
      false,
      `${pageType} 是标题页，不该有正文或要点块`,
    );
  }
});

test('兜底正文与标题相同时不重复渲染', () => {
  // 大纲输入时 sourceText 为空，兜底会取到 claim；claim 常常就等于标题
  const page = buildPageIR({
    pageId: 'pg-dup',
    outline: { index: 1, pageType: 'text', claim: '组织怎么接', title: '组织怎么接', points: [], section: '', notes: '' },
    pack: PACK, pageIndex: 1, totalPages: 3,
  });
  assert.equal(page.blocks.length, 0, '正文与标题一样时应当什么都不放，而不是把标题再写一遍');
});

test('兜底散文被标记，好让模型要点能把它换掉', () => {
  const page = buildPageIR({
    pageId: 'pg-fb',
    outline: { index: 1, pageType: 'text', claim: '市场现状', title: '市场现状', points: [], section: '', notes: '' },
    pack: PACK, pageIndex: 1, totalPages: 3,
    sourceText: '过去两年企业级 AI 需求增长 210%，落地率不足三成。',
  });
  assert.ok(page.blocks.some((b) => b.type === 'paragraph'));
  assert.equal(page.overrides.fallbackParagraph, true, '兜底散文必须带标记，否则模型要点来了它也不让位');
});

test('用户自己的正文不带兜底标记', () => {
  const page = buildPageIR({
    pageId: 'pg-real',
    outline: { index: 1, pageType: 'text', claim: '要点', title: '要点', points: ['用户写的要点一', '用户写的要点二'], section: '', notes: '' },
    pack: PACK, pageIndex: 1, totalPages: 3,
    sourceText: '用户写的要点一\n用户写的要点二',
  });
  assert.equal(page.overrides.fallbackParagraph, undefined);
});

/* ---------------- 讲解的措辞指引 ---------------- */

test('受众与场景两张表各自覆盖全部枚举，不留空', () => {
  for (const [tag, text] of Object.entries(AUDIENCE_BRIEF)) {
    assert.ok(text.trim().length > 10, `${tag} 的措辞太短：${text}`);
  }
  for (const [tag, text] of Object.entries(SCENE_BRIEF)) {
    assert.ok(text.trim().length > 10, `${tag} 的措辞太短：${text}`);
  }
});

test('narrationBrief 把受众与场合拼起来，且不同组合给出不同的话', () => {
  const exec = narrationBrief('executive', 'board');
  const scholar = narrationBrief('scholar', 'defense');
  assert.notEqual(exec, scholar);
  // 两半都要在：受众那半决定怎么推理，场合那半决定这一页要达成什么
  assert.ok(exec.includes(AUDIENCE_BRIEF.executive), exec);
  assert.ok(exec.includes(SCENE_BRIEF.board), exec);
});

test('组合特例只覆盖写了的那些，其余照常拼', () => {
  const withOverride = narrationBrief('founder', 'pitch');
  assert.ok(withOverride.includes(COMBO_OVERRIDE['founder/pitch']!), withOverride);

  // 没写特例的组合不该凭空多出东西
  const plain = narrationBrief('founder', 'annual');
  assert.equal(plain, `${AUDIENCE_BRIEF.founder}\n${SCENE_BRIEF.annual}`);
});
