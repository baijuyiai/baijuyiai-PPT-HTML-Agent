import test from 'node:test';
import assert from 'node:assert/strict';
import type { StyleTokens } from '@lumen/ir-schema';
import { ChartUsage } from '@lumen/ir-schema';
import { CHART_KINDS, type ChartKind } from '@lumen/ir-schema/chart-kind';
import { EChartsRenderer } from './echarts.js';
import { AntVRenderer } from './antv.js';
import { paletteFromStyle, chartTheme } from './palette.js';
import {
  getRenderer, buildChartOption, renderChartSvg, makeChartRenderer,
  chartStyleOf, DEFAULT_CHART_STYLE,
} from './index.js';
import { BUILDERS } from './builders/index.js';
import { DEFAULT_USAGE } from './builders/context.js';
import { layeredLayout } from './layout.js';
import type { ChartSpec } from './types.js';

/** 一套满足品质基线的风格 token（accent500 与 warning 故意同色，用于验证去重） */
const tokens: StyleTokens = {
  brand500: '#1E4ED8',
  brand600: '#1A3FB0',
  brand100: '#DCE6FB',
  accent500: '#F5A524',
  accent100: '#FDF0D5',
  neutral900: '#111827',
  neutral700: '#374151',
  neutral500: '#6B7280',
  neutral300: '#D1D5DB',
  neutral100: '#F3F4F6',
  neutral0: '#FFFFFF',
  success: '#22A06B',
  warning: '#F5A524',
  error: '#E5484D',
  info: '#3B82F6',
};

const PALETTE = paletteFromStyle(tokens);
const THEME = chartTheme(tokens);

/** 页面解析后的 7 色（新链路 `StyleDoc.palette` 的形状），`makeChartRenderer` 要它 */
const RESOLVED = {
  bg: '#EFE6DA', surface: '#F7F1E8', text: '#3A322B', muted: '#8A7F73',
  accent: '#E08A3C', brand: '#C7421A', border: '#D8CDBF',
};

/**
 * 每种图各配一份数据。
 *
 * **每种的字段不一样**（宽表 / 树 / 边 / 矩阵 / 观测值 / K 线 / 点对），
 * 所以这里是一张按种类索引的表而不是一个万能构造函数——
 * 用宽表硬套结构型图表，测出来的「能渲染」是假的。
 */
const DATA: Record<ChartKind, Partial<ChartSpec>> = {
  bar: { categories: ['一月', '二月', '三月', '四月'], series: [{ name: '营收', values: [120, 200, 150, 80] }] },
  barH: { categories: ['华东', '华南', '华北'], series: [{ name: '门店数', values: [42, 28, 36] }] },
  radar: { categories: ['洞察', '设计', '实现', '交付', '协作'], series: [{ name: '本期', values: [4.2, 4.5, 4.8, 4.7, 4.4] }] },
  barDiverging: { categories: ['研发', '市场', '人力'], series: [{ name: '今年', values: [420, 286, 338] }, { name: '去年', values: [360, 312, 290] }] },

  boxplot: { samples: [{ name: '华东', values: [42, 55, 61, 58, 72, 80, 49] }, { name: '华南', values: [38, 44, 52, 47, 41, 58, 49] }] },
  histogram: { samples: [{ name: '订单', values: [12, 18, 22, 25, 28, 31, 33, 34, 36, 38, 41, 43, 45] }] },
  scatter: { categories: ['投放', '成交'], points: [{ name: '门店', values: [[12, 38], [24, 61], [36, 79], [48, 118]] }] },
  violin: { samples: [{ name: '周一', values: [120, 132, 128, 141, 136, 148, 155, 142, 138, 161] }, { name: '周三', values: [118, 126, 131, 124, 129, 135, 122, 127, 133, 130] }] },

  area: { categories: ['1月', '2月', '3月', '4月'], series: [{ name: '用户', values: [18, 21, 26, 32] }] },
  line: { categories: ['1月', '2月', '3月', '4月'], series: [{ name: '企业版', values: [100, 112, 128, 141] }] },
  candlestick: { ohlc: [{ name: '第1周', values: [4820, 4910, 4780, 4960] }, { name: '第2周', values: [4910, 4870, 4820, 4980] }, { name: '第3周', values: [4870, 5120, 4850, 5190] }] },
  heatmap: { matrix: { rows: ['周一', '周二'], cols: ['上午', '下午', '晚间'], values: [[12, 48, 186], [14, 52, 192]] } },

  treemap: { hierarchy: { name: '全部', children: [{ name: '企业版', value: 4820 }, { name: '团队版', value: 2140 }, { name: '个人版', value: 960 }] } },
  pie: { categories: ['自然流量', '内容合作', '付费投放'], series: [{ name: '新增', values: [3860, 2420, 1980] }] },
  decompTree: { hierarchy: { name: '总成本', value: 2860, children: [{ name: '人力', value: 1420, children: [{ name: '研发', value: 880 }, { name: '交付', value: 340 }] }, { name: '基础设施', value: 760 }] } },
  sunburst: { hierarchy: { name: '全部', children: [{ name: '企业版', value: 4820, children: [{ name: '标准版', value: 3380 }, { name: '旗舰版', value: 1440 }] }, { name: '团队版', value: 2140 }] } },

  funnel: { categories: ['访问', '注册', '填资料', '验证'], series: [{ name: '人数', values: [48200, 21600, 9800, 7420] }] },
  sankey: { links: [{ source: '官网', target: '注册', value: 4200 }, { source: '内容', target: '注册', value: 2600 }, { source: '注册', target: '成交', value: 3400 }] },
  chord: { matrix: { rows: ['产品', '研发', '设计'], cols: ['产品', '研发', '设计'], values: [[0, 186, 92], [186, 0, 36], [92, 36, 0]] } },
  flowchart: { links: [{ source: '需求提出', target: '评审排期' }, { source: '评审排期', target: '方案设计' }, { source: '方案设计', target: '开发实现' }] },
};

function spec(kind: ChartKind): ChartSpec {
  return { kind, ...DATA[kind], palette: PALETTE, theme: THEME } as ChartSpec;
}

/** 老测试用的宽表规格 */
function wideSpec(kind: ChartKind): ChartSpec {
  return {
    kind,
    categories: ['一月', '二月', '三月', '四月'],
    series: [
      { name: '营收', values: [120, 200, 150, 80] },
      { name: '成本', values: [60, 90, 70, 40] },
    ],
    palette: PALETTE,
    theme: THEME,
  };
}

/* ---------------- option 构建 ---------------- */

test('每一种图表都有构建器，且不抛错', () => {
  const renderer = new EChartsRenderer();
  for (const kind of CHART_KINDS) {
    assert.ok(BUILDERS[kind], `${kind} 缺构建器`);
    const option = renderer.buildOption(spec(kind));
    assert.ok(option.series, `${kind} 的 option 里应有 series`);
  }
});

test('base option 关掉动画——不关的话依赖动画收敛的图在 SSR 下会画空', () => {
  const option = new EChartsRenderer().buildOption(spec('treemap'));
  assert.equal(option.animation, false);
});

test('ECharts option 含 color/grid，且 bar 与 line 的 series[0].type 正确', () => {
  const bar = new EChartsRenderer().buildOption(wideSpec('bar'));
  assert.deepEqual(bar.color, PALETTE);
  assert.ok(bar.grid);
  assert.equal((bar.series as { type: string }[])[0]?.type, 'bar');

  assert.equal((new EChartsRenderer().buildOption(wideSpec('line')).series as { type: string }[])[0]?.type, 'line');

  const areaSeries = (new EChartsRenderer().buildOption(wideSpec('area')).series as { type: string; areaStyle?: unknown }[])[0];
  assert.equal(areaSeries?.type, 'line', 'area 在 ECharts 里就是带 areaStyle 的折线');
  assert.ok(areaSeries?.areaStyle);
});

test('条形图把两个轴对调，柱状图不对调', () => {
  const bar = new EChartsRenderer().buildOption(wideSpec('bar'));
  const barH = new EChartsRenderer().buildOption(wideSpec('barH'));
  assert.equal((bar.xAxis as { type: string }).type, 'category');
  assert.equal((bar.yAxis as { type: string }).type, 'value');
  assert.equal((barH.yAxis as { type: string }).type, 'category', '横向条的类目应在纵轴');
  assert.equal((barH.xAxis as { type: string }).type, 'value');
});

test('分向条形图两条序列叠在同一栈上，第二条取负', () => {
  const option = new EChartsRenderer().buildOption(spec('barDiverging'));
  const series = option.series as { stack?: string; data: number[] }[];
  assert.equal(series.length, 2);
  assert.equal(series[0]?.stack, 'total');
  assert.equal(series[1]?.stack, 'total');
  assert.deepEqual(series[0]?.data, [420, 286, 338]);
  assert.deepEqual(series[1]?.data, [-360, -312, -290], '第二条应取负值才背向排开');
});

test('热力图一定带 visualMap——没有它会直接抛异常', () => {
  const option = new EChartsRenderer().buildOption(spec('heatmap'));
  assert.ok(option.visualMap, 'HeatmapView 在没有 visualMap 时 throw');
  const data = (option.series as { type: string; data: number[][] }[])[0];
  assert.equal(data?.type, 'heatmap');
  assert.deepEqual(data?.data[0], [0, 0, 12], '热力图数据是 [列下标, 行下标, 值]');
});

test('饼图取首个 series，元素形如 { name, value }', () => {
  const pie = new EChartsRenderer().buildOption(spec('pie'));
  const first = (pie.series as { type: string; data: { name: string; value: number }[] }[])[0];
  assert.equal(first?.type, 'pie');
  assert.deepEqual(Object.keys(first?.data[0] ?? {}).sort(), ['name', 'value']);
  assert.deepEqual(first?.data[0], { name: '自然流量', value: 3860 });
});

test('分解树展开到底——ECharts 默认只展两层，深的节点会直接不画', () => {
  const option = new EChartsRenderer().buildOption(spec('decompTree'));
  const series = (option.series as { type: string; initialTreeDepth: number }[])[0];
  assert.equal(series?.type, 'tree');
  assert.equal(series?.initialTreeDepth, -1);
});

test('桑基图钉死迭代次数，不吃版本默认值', () => {
  const option = new EChartsRenderer().buildOption(spec('sankey'));
  const series = (option.series as { type: string; layoutIterations: number }[])[0];
  assert.equal(series?.type, 'sankey');
  assert.equal(series?.layoutIterations, 32);
});

test('和弦图从矩阵生成双向边，跳过自环', () => {
  const option = new EChartsRenderer().buildOption(spec('chord'));
  const series = (option.series as { type: string; data: { name: string }[]; links: { source: string; target: string }[] }[])[0];
  assert.equal(series?.type, 'chord');
  assert.deepEqual(series?.data.map((d) => d.name), ['产品', '研发', '设计']);
  // 3x3 矩阵去掉对角自环，双向各一条 → 6 条
  assert.equal(series?.links.length, 6);
  assert.ok(!series?.links.some((l) => l.source === l.target), '不该有自环');
});

test('流程图用固定坐标，不用 force 布局', () => {
  const option = new EChartsRenderer().buildOption(spec('flowchart'));
  const series = (option.series as { type: string; layout: string; data: { x: number; y: number }[] }[])[0];
  assert.equal(series?.type, 'graph');
  assert.equal(series?.layout, 'none', 'force 布局里有 Math.random，SSR 下不可复现');
  assert.ok(series?.data.every((d) => Number.isFinite(d.x) && Number.isFinite(d.y)));
});

test('paletteFromStyle 去重且长度不少于 6', () => {
  const p = paletteFromStyle(tokens);
  assert.equal(new Set(p).size, p.length);
  assert.ok(p.length >= 6, `色板长度 ${p.length} 应 >= 6`);
});

test('类目轴开启 hideOverlap 防标签重叠', () => {
  const xAxis = new EChartsRenderer().buildOption(wideSpec('bar')).xAxis as {
    axisLabel: { hideOverlap: boolean; interval: string };
  };
  assert.equal(xAxis.axisLabel.hideOverlap, true);
  assert.equal(xAxis.axisLabel.interval, 'auto');
});

test('数值轴在有 unit 时把单位拼到标签上', () => {
  const option = new EChartsRenderer().buildOption({ ...wideSpec('bar'), unit: '%' });
  const yAxis = option.yAxis as { axisLabel: { formatter?: string } };
  assert.equal(yAxis.axisLabel.formatter, '{value}%');
});

test('getRenderer 与 buildChartOption 分发到正确渲染器', () => {
  assert.equal(getRenderer('echarts').name, 'echarts');
  assert.equal(getRenderer('antv').name, 'antv');
  const option = buildChartOption(wideSpec('bar'), 'antv');
  assert.equal(option.type, 'interval');
  assert.ok(Array.isArray(option.data));
});

test('AntV 对原生不支持的图给出显式降级，而不是崩', () => {
  const antv = new AntVRenderer();
  assert.equal(antv.supports('bar'), true);
  assert.equal(antv.supports('sankey'), false);
  const option = antv.buildOption(spec('sankey'));
  assert.equal(option.type, 'link', '降级映射要给出一个近似标记');
});

/* ---------------- SSR 渲染 ---------------- */

test('20 种图表都能渲染出 SVG', () => {
  for (const kind of CHART_KINDS) {
    const svg = renderChartSvg(spec(kind), { width: 1000, height: 460 });
    assert.ok(svg.startsWith('<svg'), `${kind} 应产出 svg 根节点`);
    assert.ok(/<(path|rect|polygon|circle|text)/.test(svg), `${kind} 应有图元`);
    assert.ok(svg.includes('viewBox="0 0 1000 460"'), `${kind} 应带 viewBox`);
  }
});

test('结构型图表的数据在别的字段上，不能被空数据守卫丢掉', () => {
  // 这一条是回归测试：原先的守卫只看 categories/series 空不空，
  // 树状图 / 旭日图 / 桑基图 / 和弦图 / 流程图会被静默丢成空白。
  // `scatter` 不在这一列——它的数据在 points 上，但 categories 是轴名，本来就该有
  for (const kind of ['treemap', 'sunburst', 'decompTree', 'sankey', 'chord', 'flowchart', 'heatmap', 'boxplot', 'violin', 'candlestick'] as const) {
    const s = spec(kind);
    assert.deepEqual(s.categories ?? [], [], `${kind} 的示例数据本就不该有 categories`);
    assert.deepEqual(s.series ?? [], [], `${kind} 的示例数据本就不该有 series`);
    assert.notEqual(renderChartSvg(s, { width: 1000, height: 460 }), '', `${kind} 不该被判成「没有数据」`);
  }
  // 散点图同样只看 points：只有轴名、没有点时应当判成没数据
  assert.notEqual(renderChartSvg(spec('scatter'), { width: 1000, height: 460 }), '');
  assert.equal(
    renderChartSvg({ ...spec('scatter'), points: [] }, { width: 1000, height: 460 }),
    '',
    '只有轴名没有点时应当判成没数据',
  );
});

test('小提琴图是自绘的多边形，不是复用别的系列', () => {
  const svg = renderChartSvg(spec('violin'), { width: 1000, height: 460 });
  assert.ok(svg.includes('<polygon'), '小提琴的轮廓应是 polygon');
});

test('流程图的坐标是确定的：同一份数据两次渲染逐字一致', () => {
  const a = renderChartSvg(spec('flowchart'), { width: 1000, height: 460 });
  const b = renderChartSvg(spec('flowchart'), { width: 1000, height: 460 });
  assert.equal(a, b, '出现差异说明用到了随机布局');
});

/* ---------------- 分层布局 ---------------- */

test('layeredLayout 把链式流程按层从左往右排', () => {
  const { nodes } = layeredLayout([
    { source: 'A', target: 'B' },
    { source: 'B', target: 'C' },
    { source: 'C', target: 'D' },
  ], 1000, 400);
  const x = (name: string) => nodes.find((n) => n.name === name)!.x;
  assert.ok(x('A') < x('B') && x('B') < x('C') && x('C') < x('D'), '每一层应比上一层更靠右');
});

test('layeredLayout 剔除回边：环不会把节点推到最后一层', () => {
  /*
    实测踩过的坑：流程里的「验收不过就打回重做」是条回边，
    最长路径松弛碰到它会把本该在第 4 层的节点推到第 7 层，整张图散开、连线乱穿。
  */
  const links = [
    { source: '需求', target: '设计' },
    { source: '设计', target: '开发' },
    { source: '开发', target: '验收' },
    { source: '验收', target: '上线' },
    { source: '验收', target: '打回' },
    { source: '打回', target: '开发' }, // 回边
  ];
  const { nodes } = layeredLayout(links, 1000, 400);
  const x = (name: string) => nodes.find((n) => n.name === name)!.x;
  assert.ok(x('开发') < x('验收'), '回边不该把「开发」推到「验收」右边');
  assert.equal(x('打回'), x('上线'), '打回与上线同层，横坐标应当一样');
  assert.equal(nodes.length, 6);
});

test('layeredLayout 对自环不敏感，也不吞节点', () => {
  const { nodes } = layeredLayout([
    { source: 'A', target: 'A' },
    { source: 'A', target: 'B' },
  ], 1000, 400);
  assert.deepEqual(nodes.map((n) => n.name), ['A', 'B']);
  assert.ok(nodes[0]!.x < nodes[1]!.x);
});

test('layeredLayout 空输入回空数组，不抛错', () => {
  assert.deepEqual(layeredLayout([], 1000, 400).nodes, []);
});

test('responsive 时根节点跟随容器，viewBox 保留比例', () => {
  const svg = renderChartSvg(spec('bar'), { width: 1000, height: 460, responsive: true });
  assert.ok(svg.startsWith('<svg width="100%" height="100%"'), '根节点宽高应为百分比');
  assert.ok(svg.includes('viewBox="0 0 1000 460"'), 'viewBox 决定比例，不能丢');
});

test('没有数据时返回空串，由调用方决定占位', () => {
  assert.equal(renderChartSvg({ ...spec('bar'), categories: [], series: [] }, { width: 1000, height: 460 }), '');
  assert.equal(renderChartSvg({ ...spec('sankey'), links: [] }, { width: 1000, height: 460 }), '');
});

/* ---------------- 图表规范驱动 option ---------------- */

/**
 * 风格包的 `chart` 规范必须真的改变 option。
 * 断言「字段存在」是不够的——字段可能压根没接进渲染器，
 * 那样学术严谨族和品牌设计族画出来的图会一模一样。
 */

const renderer = new EChartsRenderer();

/** 从 option 里取第一个 series 的 itemStyle */
function firstItemStyle(option: Record<string, unknown>): Record<string, unknown> {
  const series = option.series as Record<string, unknown>[];
  return (series[0]!.itemStyle ?? {}) as Record<string, unknown>;
}

test('gridLines=false 时关掉数值轴网格线', () => {
  const on = renderer.buildOption({ ...wideSpec('bar'), usage: { gridLines: true } });
  const off = renderer.buildOption({ ...wideSpec('bar'), usage: { gridLines: false } });
  const splitOn = (on.yAxis as Record<string, unknown>).splitLine as Record<string, unknown>;
  const splitOff = (off.yAxis as Record<string, unknown>).splitLine as Record<string, unknown>;
  assert.equal(splitOn.show, undefined, '开启时 splitLine 用样式对象，不显式写 show');
  assert.equal(splitOff.show, false, '关闭时应显式 show:false');
});

test('axisTone=text 时轴标签用正文色而非弱化色', () => {
  const muted = renderer.buildOption({ ...wideSpec('bar'), usage: { axisTone: 'muted' } });
  const text = renderer.buildOption({ ...wideSpec('bar'), usage: { axisTone: 'text' } });
  const labelOf = (o: Record<string, unknown>) => ((o.yAxis as Record<string, unknown>).axisLabel as Record<string, unknown>).color;
  assert.equal(labelOf(muted), tokens.neutral500);
  assert.equal(labelOf(text), tokens.neutral900);
});

test('barRadius 只圆柱子上边两角；横向条圆右边两角', () => {
  assert.deepEqual(firstItemStyle(renderer.buildOption({ ...wideSpec('bar'), usage: { barRadius: 8 } })).borderRadius, [8, 8, 0, 0]);
  assert.deepEqual(firstItemStyle(renderer.buildOption({ ...wideSpec('barH'), usage: { barRadius: 8 } })).borderRadius, [0, 8, 8, 0]);
});

test('emphasis=max-bar 时最大值那根柱子换成强调色', () => {
  const option = renderer.buildOption({ ...wideSpec('bar'), usage: { emphasis: 'max-bar' } });
  const data = (option.series as Record<string, unknown>[])[0]!.data as unknown[];
  // 营收是 [120, 200, 150, 80]，最大值 200 在下标 1
  assert.equal(typeof data[0], 'number', '非最大值保持裸数值');
  assert.deepEqual((data[1] as { value: number }).value, 200);
  assert.equal(((data[1] as { itemStyle: { color: string } }).itemStyle).color, tokens.accent500);
});

test('emphasis=primary-series 时非主序列被淡化', () => {
  const option = renderer.buildOption({ ...wideSpec('bar'), usage: { emphasis: 'primary-series' } });
  const series = option.series as Record<string, unknown>[];
  assert.equal((series[0]!.itemStyle as { color: string }).color, PALETTE[0], '主序列保持原色');
  assert.notEqual((series[1]!.itemStyle as { color: string }).color, PALETTE[1], '次序列应被淡化');
});

test('emphasis=focus-max 时最大值保持原色、其余变淡', () => {
  /*
    参考图（仪表盘那套）用的就是这个口径。拿 `max-bar` 代替时踩过：
    强调色与品牌色都是蓝，高亮那根几乎看不出来，等于白做。
  */
  const option = renderer.buildOption({ ...wideSpec('bar'), usage: { emphasis: 'focus-max' } });
  const data = (option.series as Record<string, unknown>[])[0]!.data as unknown[];
  // 营收 [120, 200, 150, 80]，最大值 200 在下标 1
  const colorOf = (v: unknown) => (v as { itemStyle: { color: string } }).itemStyle.color;
  assert.equal(colorOf(data[1]), PALETTE[0], '高亮那根保持主色');
  assert.notEqual(colorOf(data[0]), PALETTE[0], '其余柱要变淡');
  const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
  assert.ok(lum(colorOf(data[0])) > lum(PALETTE[0]!), '变淡是往白靠，不是换个色相');
});

test('focus-max 配圆角时，变淡的柱子也要带上圆角', () => {
  // 漏了这一处的话，一排柱子里只有高亮那根是圆的，其余是直角——一眼看得出来
  const option = renderer.buildOption({ ...wideSpec('bar'), usage: { emphasis: 'focus-max', barRadius: 8 } });
  const data = (option.series as Record<string, unknown>[])[0]!.data as unknown[];
  for (const v of data) {
    assert.deepEqual((v as { itemStyle: { borderRadius: number[] } }).itemStyle.borderRadius, [8, 8, 0, 0]);
  }
});

test('palette=mono-ramp 时所有序列取自同一条单色阶梯', () => {
  const option = renderer.buildOption({ ...wideSpec('bar'), usage: { palette: 'mono-ramp' } });
  const colors = (option.series as Record<string, unknown>[]).map((s) => (s.itemStyle as { color: string }).color);
  assert.equal(colors[0], PALETTE[0], '首条用基色');
  assert.notEqual(colors[1], colors[0], '第二条应是阶梯上的另一级');
  const lum = (hex: string) => parseInt(hex.slice(1, 3), 16) + parseInt(hex.slice(3, 5), 16) + parseInt(hex.slice(5, 7), 16);
  assert.ok(lum(colors[1]!) > lum(colors[0]!), '阶梯应逐级变亮');
});

test('lineWidth 与 areaFill 作用在折线系列上', () => {
  const option = renderer.buildOption({ ...wideSpec('line'), usage: { lineWidth: 4, areaFill: true } });
  const series = option.series as Record<string, unknown>[];
  assert.equal((series[0]!.lineStyle as { width: number }).width, 4);
  assert.ok(series[0]!.areaStyle, 'areaFill 应给折线加面积填充');
});

test('没给 usage 时按保守默认渲染，不抛错', () => {
  const option = renderer.buildOption(wideSpec('bar'));
  const split = (option.yAxis as Record<string, unknown>).splitLine as Record<string, unknown>;
  assert.equal(split.show, undefined, '默认有网格线');
  assert.deepEqual(firstItemStyle(option).borderRadius, undefined, '默认不圆角');
});

/* ---------------- 图表风格：新字段与预设 ---------------- */

/**
 * `ChartUsage`（ir-schema 的 zod）与 `ChartUsageSpec`（本包手抄的镜像）是两份定义，
 * 跨包不能互相 import，只能靠这条用例钉住。
 *
 * **没有它的时候，加了字段只改一边是个静默的坑**：预设里写了 `lineMarkers`，
 * 而 zod 那边不认识这个键——解析时被剥掉，图表照旧不画点，没有任何地方报错。
 */
test('ChartUsage 与 ChartUsageSpec 的字段集合必须一致', () => {
  const fromIr = Object.keys(ChartUsage.shape).sort();
  const fromCharts = Object.keys(DEFAULT_USAGE).sort();
  assert.deepEqual(fromCharts, fromIr, '两份定义漂了：加了字段要两边一起改');
});

test('新字段的默认值取「加它们之前的行为」——旧链路零回归', () => {
  assert.equal(DEFAULT_USAGE.gridTone, 'normal');
  assert.equal(DEFAULT_USAGE.axisLine, true);
  assert.equal(DEFAULT_USAGE.areaGradient, false);
  assert.equal(DEFAULT_USAGE.lineMarkers, false);
  assert.equal(DEFAULT_USAGE.donutCap, 'butt');
  assert.equal(DEFAULT_USAGE.barLabels, false);
  assert.equal(DEFAULT_USAGE.averageLine, false);
});

test('areaGradient 把面积填充换成垂直渐变', () => {
  const flat = renderer.buildOption({ ...spec('area'), usage: { areaGradient: false } });
  const grad = renderer.buildOption({ ...spec('area'), usage: { areaGradient: true } });
  const styleOf = (o: Record<string, unknown>) => (o.series as Record<string, unknown>[])[0]!.areaStyle as Record<string, unknown>;
  assert.equal(styleOf(flat).opacity, 0.15, '不开渐变时是平铺一块半透明色');
  assert.equal(styleOf(grad).opacity, undefined);
  assert.equal((styleOf(grad).color as { type: string }).type, 'linear');
  const stops = (styleOf(grad).color as { colorStops: { color: string }[] }).colorStops;
  assert.equal(stops.length, 2);
  assert.match(stops[0]!.color, /^rgba\(/, 'colorStops 要用 rgba——八位 hex 在 zrender 的部分路径上不被认');
  assert.match(stops[1]!.color, /,0\)$/, '底端应当全透明');
});

test('lineMarkers 给折线加实心圆点', () => {
  const off = renderer.buildOption({ ...spec('line'), usage: { lineMarkers: false } });
  const on = renderer.buildOption({ ...spec('line'), usage: { lineMarkers: true } });
  const s = (o: Record<string, unknown>) => (o.series as Record<string, unknown>[])[0]!;
  assert.equal(s(off).symbol, undefined);
  assert.equal(s(on).symbol, 'circle');
  assert.equal(s(on).symbolSize, 8);
});

test('axisLine=false 时两个轴都不画轴线；gridTone=faint 时网格线调淡', () => {
  const off = renderer.buildOption({ ...wideSpec('bar'), usage: { axisLine: false } });
  assert.equal((off.xAxis as Record<string, unknown>).axisLine && ((off.xAxis as Record<string, unknown>).axisLine as Record<string, unknown>).show, false);
  assert.equal(((off.yAxis as Record<string, unknown>).axisLine as Record<string, unknown>).show, false);

  const faint = renderer.buildOption({ ...wideSpec('bar'), usage: { gridTone: 'faint' } });
  const normal = renderer.buildOption({ ...wideSpec('bar'), usage: { gridTone: 'normal' } });
  const gridOf = (o: Record<string, unknown>) =>
    (((o.yAxis as Record<string, unknown>).splitLine as Record<string, unknown>).lineStyle as { color: string }).color;
  assert.equal(gridOf(normal), tokens.neutral300, 'normal 用主题里那个网格色');
  assert.match(gridOf(faint), /^rgba\(/, 'faint 是同一个色压到四成');
});

test('donutCap=round 时环图扇区圆头、环更粗', () => {
  const butt = renderer.buildOption({ ...spec('pie'), usage: { donutCap: 'butt' } });
  const round = renderer.buildOption({ ...spec('pie'), usage: { donutCap: 'round' } });
  const s = (o: Record<string, unknown>) => (o.series as Record<string, unknown>[])[0]!;
  assert.deepEqual(s(butt).radius, ['45%', '70%']);
  assert.deepEqual(s(round).radius, ['52%', '76%']);
  assert.equal((s(round).itemStyle as Record<string, unknown>).borderRadius, 8);
  assert.equal((s(butt).itemStyle as Record<string, unknown>).borderRadius, undefined);
});

test('barLabels 给柱顶加数值标签，横向条的标签在右端', () => {
  const vertical = renderer.buildOption({ ...wideSpec('bar'), usage: { barLabels: true } });
  const horizontal = renderer.buildOption({ ...wideSpec('barH'), usage: { barLabels: true } });
  const labelOf = (o: Record<string, unknown>) => ((o.series as Record<string, unknown>[])[0]!.label) as { show: boolean; position: string };
  assert.equal(labelOf(vertical).show, true);
  assert.equal(labelOf(vertical).position, 'top');
  assert.equal(labelOf(horizontal).position, 'right', '横向图的标签写死 top 会压在柱子上');
});

test('averageLine 挂一条均值虚线，标签是深色药丸', () => {
  const option = renderer.buildOption({ ...wideSpec('bar'), usage: { averageLine: true } });
  const markLine = (option.series as Record<string, unknown>[])[0]!.markLine as Record<string, unknown>;
  assert.ok(markLine, '第一条序列上该挂 markLine');
  const label = markLine.label as Record<string, unknown>;
  assert.equal(label.backgroundColor, tokens.neutral900, '药丸是深色底');
  assert.equal(label.color, 'transparent', '文字用页面底色（这里主题的背景是 transparent）');
  // 营收 [120, 200, 150, 80]，均值 137.5
  assert.deepEqual(markLine.data, [{ yAxis: 137.5 }]);
});

test('均值线只挂在第一条序列上，且只在柱/折线/面积上', () => {
  const twoSeries = renderer.buildOption({ ...wideSpec('bar'), usage: { averageLine: true } });
  const series = twoSeries.series as Record<string, unknown>[];
  assert.ok(series[0]!.markLine);
  assert.equal(series[1]!.markLine, undefined, '几条序列各画一条会变成一堆平行虚线');

  const pie = renderer.buildOption({ ...spec('pie'), usage: { averageLine: true } });
  assert.equal((pie.series as Record<string, unknown>[])[0]!.markLine, undefined);
});

/* ---------------- 预设 ---------------- */

test('三套预设：数据看板把所有标记打开，经典全关，品牌色沿用看板画法', () => {
  const dash = chartStyleOf('dashboard');
  const classic = chartStyleOf('classic');
  assert.equal(dash.usage.barRadius > 0, true);
  assert.equal(dash.usage.areaGradient, true);
  assert.equal(dash.usage.lineMarkers, true);
  assert.equal(dash.usage.axisLine, false);
  assert.equal(dash.usage.gridTone, 'faint');
  assert.equal(dash.usage.donutCap, 'round');
  assert.equal(dash.usage.barLabels, true);
  assert.equal(dash.usage.averageLine, true);
  assert.ok(dash.colors && dash.colors.length >= 5, '数据看板自带分类色板');

  assert.deepEqual(classic.usage, DEFAULT_USAGE, '经典就是「加风格层之前的样子」');
  assert.equal(classic.colors, undefined, '经典不给色板，跟着页面配色走');

  /*
    「品牌色」存在的**全部理由**就是这一条：要仪表盘那套画法，但配色跟 deck 一个调子。
    红黑风格下 `paletteFromPalette` 派出来就是「品牌红 + 亮红」那一组，
    所以它俩的 usage 必须是同一份——哪天真要分开，这个预设也就没有意义了。
  */
  const brand = chartStyleOf('brand');
  assert.deepEqual(brand.usage, dash.usage, '画法与数据看板一致');
  assert.equal(brand.colors, undefined, '不给色板，走 paletteFromPalette');
});

test('chartStyleOf 认不出时回默认那一套，且回的永远是同一份对象', () => {
  assert.equal(chartStyleOf('不存在的风格').id, DEFAULT_CHART_STYLE);
  assert.equal(chartStyleOf(undefined).id, DEFAULT_CHART_STYLE);
  assert.equal(chartStyleOf(null).id, DEFAULT_CHART_STYLE);
  // 调用方要拿它进 useMemo 依赖，现造对象会把 memo 打穿
  assert.equal(chartStyleOf('dashboard'), chartStyleOf('dashboard'), '同 id 必须回同一个引用');
});

test('makeChartRenderer 按预设出图：数据看板会画出均值药丸与圆角柱', () => {
  const dash = makeChartRenderer({ palette: RESOLVED, style: 'dashboard' });
  const classic = makeChartRenderer({ palette: RESOLVED, style: 'classic' });
  const size = { width: 800, height: 400 };

  const dashSvg = dash(spec('bar'), size);
  assert.match(dashSvg, /均值 /, '均值线的标签要真的画出来');
  assert.match(dashSvg, /#6366F1/i, '数据看板该用它自带的靛紫，而不是页面配色');
  // ECharts 把圆角柱画成带圆弧的 path（不是 rx 的 rect）
  assert.match(dashSvg, /d="[^"]*A\d/, '圆角柱在 SVG 里是一段圆弧');

  const classicSvg = classic(spec('bar'), size);
  assert.ok(!classicSvg.includes('均值 '), '经典不画均值线');
  assert.ok(!/#6366F1/i.test(classicSvg), '经典跟着页面配色，不该出现数据看板那套色');
  assert.ok(!/d="[^"]*A\d/.test(classicSvg), '经典是直角柱，不该有圆弧');
});

test('均值线的标签是实心的——淡化只能调线的色，不能调 opacity', () => {
  const svg = makeChartRenderer({ palette: RESOLVED, style: 'dashboard' })(spec('bar'), { width: 800, height: 400 });
  const pill = /<text[^>]*>均值 [\d.]+<\/text>/.exec(svg)?.[0] ?? '';
  assert.ok(pill, '标签该画出来');
  assert.ok(!pill.includes('fill-opacity'), 'markLine 的 opacity 会把标签一起带淡，实测踩过');
});

test('makeChartRenderer 不给 style 时用默认那一套', () => {
  const svg = makeChartRenderer({ palette: RESOLVED })(spec('bar'), { width: 800, height: 400 });
  assert.match(svg, /均值 /, '不传 style 应当落到默认的 dashboard');
});
