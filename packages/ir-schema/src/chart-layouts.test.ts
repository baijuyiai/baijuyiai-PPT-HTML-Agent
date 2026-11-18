import test from 'node:test';
import assert from 'node:assert/strict';
import { CHART_KINDS, CHART_KIND_GROUP, chartGroupOf } from './chart-kind.js';
import {
  CHART_LAYOUTS, chartLayoutBlock, chartLayoutCandidates, estimateChartKind,
} from './chart-layouts.js';
import { CHART_SLOT_RE, parseChartSlot, parseChartSlotSize } from './chart-slot.js';
import { fillChartSlots } from './chart-fill.js';
import { checkLayoutSkeleton } from './studio-layouts.js';

/** 取出骨架里第一个图表槽的三段：属性串、尺寸串、JSON 正文 */
function slotOf(skeleton: string): { attrs: string; size: string; json: string } {
  const m = new RegExp(CHART_SLOT_RE.source, 'i').exec(skeleton);
  assert.ok(m, '骨架里没有图表槽');
  return { attrs: m[1] ?? '', size: m[2] ?? '', json: m[3] ?? '' };
}

test('20 份骨架，id 形如 chart/xxx@v1，两两不撞', () => {
  assert.equal(CHART_LAYOUTS.length, 20);
  const ids = CHART_LAYOUTS.map((l) => l.id);
  assert.equal(new Set(ids).size, ids.length, 'id 撞了');
  for (const l of CHART_LAYOUTS) {
    assert.match(l.id, /^chart\/[a-z0-9-]+@v1$/, `${l.id} 不符合命名`);
    assert.ok(l.name.length > 0, `${l.id} 缺中文名`);
    assert.ok(l.brief.length >= 8, `${l.id} 的 brief 太短`);
  }
});

test('每种图表各一份骨架，五种分组各四份', () => {
  assert.deepEqual(
    [...CHART_LAYOUTS.map((l) => l.kind)].sort(),
    [...CHART_KINDS].sort(),
    '骨架覆盖的种类与 CHART_KINDS 对不上',
  );
  for (const group of ['compare', 'distribution', 'trend', 'composition', 'flow'] as const) {
    assert.equal(CHART_LAYOUTS.filter((l) => l.group === group).length, 4, `${group} 不是四份`);
  }
});

test('每份骨架的 group 与它的 kind 对得上', () => {
  for (const l of CHART_LAYOUTS) {
    assert.equal(l.group, CHART_KIND_GROUP[l.kind], `${l.id} 的分组与图表种类不符`);
  }
});

test('骨架里图表槽的 kind 与 layout 声明的 kind 一致', () => {
  // 两者对不上的症状是「界面卡片写着折线图、生成出来是柱状图」，没有任何一处会报错
  for (const l of CHART_LAYOUTS) {
    const parsed = parseChartSlot(slotOf(l.skeleton).json);
    assert.ok(parsed.ok, `${l.id} 的槽解析失败：${parsed.ok ? '' : parsed.problem}`);
    if (parsed.ok) {
      assert.equal(parsed.data.kind, l.kind, `${l.id} 的槽写着 ${parsed.data.kind}`);
    }
  }
});

test('骨架里图表槽的 CSS 尺寸与 data-lumen-chart 的尺寸逐字对上', () => {
  // 对不上会把图拉变形：出图的 SVG 是 100%/100% 铺满容器的
  for (const l of CHART_LAYOUTS) {
    const { attrs, size } = slotOf(l.skeleton);
    const declared = parseChartSlotSize(size);
    assert.ok(declared, `${l.id} 的尺寸写法不对：${size}`);

    const cls = /class="([^"]+)"/.exec(attrs)?.[1];
    assert.ok(cls, `${l.id} 的槽没有 class，量不到尺寸`);
    const rule = new RegExp(`\\.${cls}\\{[^}]*width:(\\d+)px;height:(\\d+)px`).exec(l.skeleton);
    assert.ok(rule, `${l.id} 的样式表里找不到 .${cls} 的宽高`);
    assert.equal(Number(rule![1]), declared!.width, `${l.id} 的 CSS 宽与槽属性不符`);
    assert.equal(Number(rule![2]), declared!.height, `${l.id} 的 CSS 高与槽属性不符`);
  }
});

test('每份骨架都能过 checkLayoutSkeleton', () => {
  for (const l of CHART_LAYOUTS) {
    assert.deepEqual(checkLayoutSkeleton('chart-layouts', l.skeleton), [], `${l.id} 没通过校验`);
  }
});

test('checkLayoutSkeleton 会拦下没有图表槽、或槽里 JSON 坏掉的骨架', () => {
  const good = CHART_LAYOUTS[0]!.skeleton;
  const noSlot = good.replace(/data-lumen-chart="[^"]*"/, '');
  assert.ok(checkLayoutSkeleton('chart-layouts', noSlot).some((p) => p.includes('图表槽')));

  const badJson = good.replace(/"kind":"[a-z]+"/, '"kind":"柱状图"');
  assert.ok(checkLayoutSkeleton('chart-layouts', badJson).some((p) => p.includes('图表槽')));

  // 图表骨架**不要求图位**——它查的是图表槽
  assert.equal(/data-lumen-image/.test(good), false);
});

/* ---------------- 认图表种类 ---------------- */

test('estimateChartKind：中文说法认到对应的种类', () => {
  const cases: [string, string][] = [
    ['四季度折线图，横轴是月份', 'line'],
    ['柱状图对比各渠道', 'bar'],
    ['横向条形图排列各门店', 'barH'],
    ['雷达图展示六项能力', 'radar'],
    ['分向条形图对照两年费用', 'barDiverging'],
    ['箱线图看各店离散程度', 'boxplot'],
    ['直方图看金额分布', 'histogram'],
    ['散点图看投放与成交的关系', 'scatter'],
    ['小提琴图看响应时长分布', 'violin'],
    ['面积图看用户累积', 'area'],
    ['K 线图看周度报价', 'candlestick'],
    ['热力图看时段分布', 'heatmap'],
    ['树状图看收入构成', 'treemap'],
    ['饼图看来源占比', 'pie'],
    ['环形图看构成', 'pie'],
    ['分解树拆解成本', 'decompTree'],
    ['旭日图看两层占比', 'sunburst'],
    ['漏斗图看转化', 'funnel'],
    ['桑基图看线索流转', 'sankey'],
    ['和弦图看部门协作', 'chord'],
    ['流程图讲交付步骤', 'flowchart'],
  ];
  for (const [text, kind] of cases) {
    assert.equal(estimateChartKind(text), kind, `「${text}」应认成 ${kind}`);
  }
  assert.equal(estimateChartKind('一段普通的结论文字'), null);
});

test('「分向条形图」不会被「条形图」抢走', () => {
  // 关键词表按具体到宽泛排序，顺序错了这一条就挂
  assert.equal(estimateChartKind('分向条形图'), 'barDiverging');
  assert.equal(estimateChartKind('条形图'), 'barH');
  assert.equal(estimateChartKind('柱状图'), 'bar');
});

/* ---------------- 挑候选 ---------------- */

test('chartLayoutCandidates：命中的那一种排最前，且一定非空', () => {
  const c = chartLayoutCandidates({ visualForm: '桑基图，展示线索从哪来、到哪去', points: [] });
  assert.ok(c.length > 0);
  assert.equal(c[0]!.kind, 'sankey', '教案已经说清了画什么，不该让模型再猜一次');
  for (const l of c) assert.equal(l.group, 'flow', '候选应落在同一组');

  const fallback = chartLayoutCandidates({ visualForm: '看不出来要画什么', points: [] });
  assert.ok(fallback.length > 0, '认不出也要给候选，空数组会让版式块整段被抽掉');
  assert.equal(fallback[0]!.group, 'compare', '认不出兜底给最常用的一类');
});

test('chartLayoutCandidates：visualForm 认不出时退一步看要点', () => {
  const c = chartLayoutCandidates({ visualForm: '看趋势', points: ['用折线图表示三年走势'] });
  assert.equal(c[0]!.kind, 'line');
});

/* ---------------- 提示词块 ---------------- */

test('chartLayoutBlock 说清了「槽留着、只换数据、别写颜色」', () => {
  const block = chartLayoutBlock(chartLayoutCandidates({ visualForm: '柱状图', points: [] }), '图表页');
  assert.ok(block.includes('这一页是图表页'));
  assert.ok(block.includes('图表槽'), '必须点明那一块是图表槽');
  assert.ok(block.includes('不要改 kind'), '模型很容易顺手改掉 kind');
  assert.ok(block.includes('不要往 JSON 里写颜色'), '写死颜色换风格就不跟着变了');
  assert.ok(block.includes('```html'), '骨架要用围栏包着');
});

/* ---------------- 槽的校验 ---------------- */

test('parseChartSlot 逐种检查数据形状', () => {
  const ok = parseChartSlot('{"kind":"bar","categories":["一","二"],"series":[{"name":"营收","values":[1,2]}]}');
  assert.equal(ok.ok, true);

  // 长度对不齐是最常错的一条：ECharts 不报错，只是最后一根柱子没有
  const misaligned = parseChartSlot('{"kind":"bar","categories":["一","二","三"],"series":[{"name":"营收","values":[1,2]}]}');
  assert.equal(misaligned.ok, false);
  if (!misaligned.ok) assert.match(misaligned.problem, /对齐/);

  assert.equal(parseChartSlot('不是 JSON').ok, false);
  assert.equal(parseChartSlot('{"kind":"不存在的图"}').ok, false);
  assert.equal(parseChartSlot('{"kind":"sankey"}').ok, false, '桑基图没有 links 画不出来');
  assert.equal(parseChartSlot('{"kind":"candlestick","ohlc":[{"name":"周一","values":[1,2,3]}]}').ok, false, 'K 线要四个数');
  assert.equal(parseChartSlot('{"kind":"heatmap","matrix":{"rows":["a","b"],"cols":["x"],"values":[[1],[2]]}}').ok, true);
  assert.equal(parseChartSlot('{"kind":"scatter","points":[{"values":[[1,2],[3]]}]}').ok, false, '散点的点必须是两个数');
});

/* ---------------- 填槽 ---------------- */

test('fillChartSlots 把槽换成渲染结果，并保留外层的 class 与 style', () => {
  const html = '<div class="ch-plot" style="width:100px" data-lumen-chart="100x50">{"kind":"bar","categories":["一"],"series":[{"name":"a","values":[1]}]}</div>';
  const out = fillChartSlots(html, (data, size) => `<svg data-k="${data.kind}" data-w="${size.width}"></svg>`);
  assert.ok(out.includes('class="ch-plot"'), '外层 class 要留着，版面靠它定位');
  assert.ok(out.includes('style="width:100px"'));
  assert.ok(!out.includes('data-lumen-chart='), '标记属性要去掉');
  assert.ok(out.includes('data-lumen-chart-rendered="bar"'));
  assert.ok(out.includes('data-w="100"'), '渲染尺寸来自槽属性');
  assert.ok(!out.includes('"kind"'), '槽里那段 JSON 不该留在页面上');
});

test('fillChartSlots 出不了图时留占位块，而不是把 JSON 裸露在页面上', () => {
  const broken = '<div class="ch-plot" data-lumen-chart="100x50">不是 JSON</div>';
  const out = fillChartSlots(broken, () => '<svg></svg>');
  assert.ok(out.includes('data-lumen-chart-failed="1"'));
  assert.ok(!out.includes('不是 JSON'));

  const badSize = '<div class="ch-plot" data-lumen-chart="随便写">{"kind":"bar","categories":["一"],"series":[{"name":"a","values":[1]}]}</div>';
  assert.ok(fillChartSlots(badSize, () => '<svg></svg>').includes('data-lumen-chart-failed'));

  const throws = '<div class="ch-plot" data-lumen-chart="100x50">{"kind":"bar","categories":["一"],"series":[{"name":"a","values":[1]}]}</div>';
  assert.ok(
    fillChartSlots(throws, () => { throw new Error('渲染炸了'); }).includes('data-lumen-chart-failed'),
    '渲染抛错不该让整页装配失败',
  );

  const empty = fillChartSlots(throws, () => '');
  assert.ok(empty.includes('data-lumen-chart-failed'), '渲染出空串也算没画出来');
});

test('没传渲染函数时槽被清成占位块，不会留下裸露的 JSON', () => {
  const html = CHART_LAYOUTS[0]!.skeleton;
  const out = fillChartSlots(html, () => '');
  assert.ok(!out.includes('"kind"'), 'JSON 不该留在页面上');
  assert.ok(out.includes('data-lumen-chart-failed="1"'));
});

test('chartLayoutCandidates 的每一份骨架都能真的填出图', () => {
  for (const kind of CHART_KINDS) {
    const layout = CHART_LAYOUTS.find((l) => l.kind === kind)!;
    const out = fillChartSlots(layout.skeleton, (data, size) =>
      `<svg data-k="${data.kind}" data-w="${size.width}" data-h="${size.height}"></svg>`);
    assert.ok(out.includes(`data-k="${kind}"`), `${kind} 的槽没被填上`);
    assert.ok(!out.includes('data-lumen-chart-failed'), `${kind} 落到了占位块`);
  }
});

test('chartGroupOf 与 CHART_KIND_GROUP 一致', () => {
  for (const kind of CHART_KINDS) assert.equal(chartGroupOf(kind), CHART_KIND_GROUP[kind]);
});
