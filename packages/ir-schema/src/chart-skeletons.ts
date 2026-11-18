import type { ChartLayout } from './chart-layouts.js';

/**
 * 图表页的 20 份骨架，一种图表一份。
 *
 * ## 这是生成文件吗
 *
 * **不是。** 人物排版与图文排版的骨架是识别脚本从设计稿批量认出来的（`*-skeletons.ts`
 * 带那个头注）；图表骨架不是——它的形态由「用哪种图」定死了，而 20 种图的画法
 * 是分类图上给定的，没有可识别的余地。所以这 20 份是手写的，改它就是改设计。
 *
 * ## 每份骨架的两半
 *
 * 1. **画布版式**：标题区、结论、来源注怎么摆。这半边与图文排版的骨架同构，
 *    配色一律走 CSS 变量（`--bg/--surface/--text/--muted/--accent/--brand/--border`），
 *    字体走 `var(--font-sans/--font-display/--font-script)`。
 * 2. **图表槽**：`<div … data-lumen-chart="宽x高">` 里面一段 JSON，写明用哪种图、
 *    数据什么形状。出图交给 `@lumen/charts`，配色由渲染层按风格填——**槽里一个色值都没有**。
 *
 * 槽的 CSS 宽高必须与属性里的尺寸**逐字对上**：出图的 SVG 是 `width:100%;height:100%`
 * 铺满那个容器的，两边宽高比对不上会把图拉变形。
 *
 * ## 写法上的两条规矩
 *
 * - **文字具体**：标题、结论、来源注都写成真内容而不是「标题」「结论」。
 *   写具体是为了让版式的疏密看得出来，模型拿到后一律替换成实际内容。
 * - **JSON 里的数字要真像那么回事**：示例数据全写成 `1,2,3` 的话，
 *   模型看不出「条数按实际内容来」，容易照抄四个数。
 */

export const CHART_SKELETONS: ChartLayout[] = [
  /* ---------------- 比较类 ---------------- */
  {
    id: 'chart/bar-column@v1',
    name: '满宽柱状图',
    brief: '标题与一行结论压在左上，柱状图横贯整幅，适合按类目比大小、看哪一根最高。',
    group: 'compare',
    kind: 'bar',
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.bc-kick{position:absolute;left:120px;top:92px;font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.bc-title{position:absolute;left:116px;top:128px;font-family:var(--font-display);font-size:78px;font-weight:800;line-height:1.04;letter-spacing:-.02em;color:var(--text)}
.bc-claim{position:absolute;left:120px;top:232px;font-size:23px;color:var(--muted)}
.bc-plot{position:absolute;left:120px;top:300px;width:1680px;height:520px}
.bc-rule{position:absolute;left:120px;top:872px;width:60px;height:5px;background:var(--accent)}
.bc-take{position:absolute;left:120px;top:900px;width:1280px;font-size:28px;line-height:1.5;color:var(--text)}
.bc-src{position:absolute;right:120px;bottom:92px;font-size:17px;color:var(--muted)}
</style>
<div class="bc-kick">DATA / 2026</div>
<div class="bc-title">各季度营收</div>
<div class="bc-claim">单位：百万元</div>
<div class="bc-plot" data-lumen-chart="1680x520">
{"kind":"bar","categories":["第一季度","第二季度","第三季度","第四季度"],"series":[{"name":"营收","values":[128,164,212,187]}]}
</div>
<div class="bc-rule"></div>
<div class="bc-take">第三季度冲高到 212 之后回落，全年仍是上行的一年。</div>
<div class="bc-src">数据来源：财务部年度报告</div>
</div>`,
  },
  {
    id: 'chart/bar-horizontal@v1',
    name: '左文右横条',
    brief: '标题与结论占左侧三分之一，横向条形图占右侧三分之二，适合类目名字长、要横着读的对比。',
    group: 'compare',
    kind: 'barH',
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.bh-kick{position:absolute;left:120px;top:150px;font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.bh-title{position:absolute;left:116px;top:196px;width:520px;font-family:var(--font-display);font-size:70px;font-weight:800;line-height:1.08;letter-spacing:-.02em;color:var(--text)}
.bh-rule{position:absolute;left:120px;top:470px;width:56px;height:5px;background:var(--accent)}
.bh-take{position:absolute;left:120px;top:502px;width:500px;font-size:26px;line-height:1.6;color:var(--muted)}
.bh-src{position:absolute;left:120px;bottom:150px;font-size:17px;color:var(--muted)}
.bh-plot{position:absolute;right:120px;top:150px;width:1080px;height:780px}
</style>
<div class="bh-kick">RANKING / 2026</div>
<div class="bh-title">各渠道获客成本</div>
<div class="bh-rule"></div>
<div class="bh-take">搜索广告最便宜，线下展会一客的代价是它的六倍。</div>
<div class="bh-src">数据来源：市场部投放台账</div>
<div class="bh-plot" data-lumen-chart="1080x780">
{"kind":"barH","categories":["搜索广告","内容合作","社群裂变","行业媒体","线下展会"],"series":[{"name":"单客成本","values":[86,124,168,242,520]}],"unit":"元"}
</div>
</div>`,
  },
  {
    id: 'chart/radar-profile@v1',
    name: '左文右雷达',
    brief: '雷达图铺在右半边、文字占左侧，适合六到八个维度的能力画像或评分对比。',
    group: 'compare',
    kind: 'radar',
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.rd-kick{position:absolute;left:120px;top:180px;font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.rd-title{position:absolute;left:116px;top:226px;width:560px;font-family:var(--font-display);font-size:72px;font-weight:800;line-height:1.08;letter-spacing:-.02em;color:var(--text)}
.rd-rule{position:absolute;left:120px;top:492px;width:56px;height:5px;background:var(--accent)}
.rd-take{position:absolute;left:120px;top:524px;width:540px;font-size:26px;line-height:1.6;color:var(--muted)}
.rd-src{position:absolute;left:120px;bottom:180px;font-size:17px;color:var(--muted)}
.rd-plot{position:absolute;right:120px;top:160px;width:1060px;height:760px}
</style>
<div class="rd-kick">ASSESSMENT</div>
<div class="rd-title">团队能力画像</div>
<div class="rd-rule"></div>
<div class="rd-take">工程与交付两项拉满，商业判断是下一阶段要补的那一块。</div>
<div class="rd-src">评分口径：自评 + 客户反馈，满分 5 分</div>
<div class="rd-plot" data-lumen-chart="1060x760">
{"kind":"radar","categories":["需求洞察","方案设计","工程实现","交付质量","商业判断","协作沟通"],"series":[{"name":"本期","values":[4.2,4.5,4.8,4.7,3.1,4.4]},{"name":"上期","values":[3.6,4.0,4.2,4.1,3.3,4.0]}]}
</div>
</div>`,
  },
  {
    id: 'chart/bar-diverging@v1',
    name: '上下分向条',
    brief: '类目居中、两组数值从中间零点背向伸出，适合两组对象逐项对照（今年对去年、A 组对 B 组）。',
    group: 'compare',
    kind: 'barDiverging',
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.bd-kick{position:absolute;left:120px;top:96px;font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.bd-title{position:absolute;left:116px;top:132px;font-family:var(--font-display);font-size:76px;font-weight:800;line-height:1.04;letter-spacing:-.02em;color:var(--text)}
.bd-legend{position:absolute;right:120px;top:150px;display:flex;gap:36px;font-size:20px;color:var(--muted)}
.bd-legend i{display:inline-block;width:26px;height:8px;margin-right:10px;vertical-align:middle}
.bd-plot{position:absolute;left:120px;top:280px;width:1680px;height:600px}
.bd-rule{position:absolute;left:120px;top:918px;width:60px;height:5px;background:var(--accent)}
.bd-take{position:absolute;left:120px;top:946px;width:1680px;font-size:27px;line-height:1.5;color:var(--text)}
</style>
<div class="bd-kick">COMPARE</div>
<div class="bd-title">两年费用对照</div>
<div class="bd-legend"><span><i style="background:var(--brand)"></i>今年</span><span><i style="background:var(--accent)"></i>去年</span></div>
<div class="bd-plot" data-lumen-chart="1680x600">
{"kind":"barDiverging","categories":["研发","市场","人力","差旅","行政"],"series":[{"name":"今年","values":[420,286,338,92,64]},{"name":"去年","values":[360,312,290,140,58]}],"unit":"万元"}
</div>
<div class="bd-rule"></div>
<div class="bd-take">差旅与行政两项压下来了，省出的额度全部投进了研发。</div>
</div>`,
  },

  /* ---------------- 分布类 ---------------- */
  {
    id: 'chart/boxplot-spread@v1',
    name: '满宽箱线图',
    brief: '每个类目一根箱子，看中位数落在哪、上下四分位有多宽，适合比较几组数据的离散程度。',
    group: 'distribution',
    kind: 'boxplot',
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.bx-kick{position:absolute;left:120px;top:92px;font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.bx-title{position:absolute;left:116px;top:128px;font-family:var(--font-display);font-size:78px;font-weight:800;line-height:1.04;letter-spacing:-.02em;color:var(--text)}
.bx-claim{position:absolute;left:120px;top:232px;font-size:23px;color:var(--muted)}
.bx-plot{position:absolute;left:120px;top:300px;width:1680px;height:520px}
.bx-rule{position:absolute;left:120px;top:872px;width:60px;height:5px;background:var(--accent)}
.bx-take{position:absolute;left:120px;top:900px;width:1280px;font-size:28px;line-height:1.5;color:var(--text)}
.bx-src{position:absolute;right:120px;bottom:92px;font-size:17px;color:var(--muted)}
</style>
<div class="bx-kick">DISTRIBUTION</div>
<div class="bx-title">各门店日销售额</div>
<div class="bx-claim">箱子是中位数与上下四分位，每个点是一次盘点</div>
<div class="bx-plot" data-lumen-chart="1680x520">
{"kind":"boxplot","samples":[{"name":"华东","values":[42,55,61,58,72,80,49,66,70,53]},{"name":"华南","values":[38,44,52,47,41,58,49,45,51,43]},{"name":"华北","values":[61,74,88,79,95,102,68,84,91,77]},{"name":"西南","values":[28,33,30,41,36,29,44,31,38,35]}],"unit":"千元"}
</div>
<div class="bx-rule"></div>
<div class="bx-take">华北整体高出一档且最稳，西南最低但波动也最小。</div>
<div class="bx-src">数据来源：门店 POS 系统</div>
</div>`,
  },
  {
    id: 'chart/histogram-bins@v1',
    name: '满宽直方图',
    brief: '把一组观测值分箱数频次，看整体分布是集中还是分散、有没有第二个峰。',
    group: 'distribution',
    kind: 'histogram',
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.hg-kick{position:absolute;left:120px;top:92px;font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.hg-title{position:absolute;left:116px;top:128px;font-family:var(--font-display);font-size:78px;font-weight:800;line-height:1.04;letter-spacing:-.02em;color:var(--text)}
.hg-claim{position:absolute;left:120px;top:232px;font-size:23px;color:var(--muted)}
.hg-plot{position:absolute;left:120px;top:300px;width:1680px;height:520px}
.hg-rule{position:absolute;left:120px;top:872px;width:60px;height:5px;background:var(--accent)}
.hg-take{position:absolute;left:120px;top:900px;width:1280px;font-size:28px;line-height:1.5;color:var(--text)}
.hg-src{position:absolute;right:120px;bottom:92px;font-size:17px;color:var(--muted)}
</style>
<div class="hg-kick">DISTRIBUTION</div>
<div class="hg-title">订单金额分布</div>
<div class="hg-claim">横轴是金额区间，纵轴是落在区间里的订单数</div>
<div class="hg-plot" data-lumen-chart="1680x520">
{"kind":"histogram","samples":[{"name":"订单","values":[12,18,22,25,28,31,33,34,36,38,41,43,45,47,49,52,55,58,62,66,71,78,86,95,112,134,158,182,215,246]}],"unit":"笔"}
</div>
<div class="hg-rule"></div>
<div class="hg-take">绝大多数订单集中在两万以下，五万以上的长尾贡献了相当一部分金额。</div>
<div class="hg-src">样本：近 90 天全部成交订单</div>
</div>`,
  },
  {
    id: 'chart/scatter-correlation@v1',
    name: '满宽散点图',
    brief: '两个数值轴上打点，看点是不是沿着一条斜线走，适合看两个指标之间有没有关系。',
    group: 'distribution',
    kind: 'scatter',
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.sc-kick{position:absolute;left:120px;top:92px;font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.sc-title{position:absolute;left:116px;top:128px;font-family:var(--font-display);font-size:78px;font-weight:800;line-height:1.04;letter-spacing:-.02em;color:var(--text)}
.sc-claim{position:absolute;left:120px;top:232px;font-size:23px;color:var(--muted)}
.sc-plot{position:absolute;left:120px;top:300px;width:1680px;height:520px}
.sc-rule{position:absolute;left:120px;top:872px;width:60px;height:5px;background:var(--accent)}
.sc-take{position:absolute;left:120px;top:900px;width:1280px;font-size:28px;line-height:1.5;color:var(--text)}
.sc-src{position:absolute;right:120px;bottom:92px;font-size:17px;color:var(--muted)}
</style>
<div class="sc-kick">CORRELATION</div>
<div class="sc-title">投放与成交</div>
<div class="sc-claim">横轴：单店月投放额（万元）　纵轴：单店月成交额（万元）</div>
<div class="sc-plot" data-lumen-chart="1680x520">
{"kind":"scatter","categories":["月投放额（万元）","月成交额（万元）"],"points":[{"name":"各门店","values":[[12,38],[18,52],[24,61],[31,84],[36,79],[42,105],[48,118],[55,132],[63,151],[71,164],[80,198],[88,186],[96,224],[104,241]]}]}
</div>
<div class="sc-rule"></div>
<div class="sc-take">点基本沿着一条斜线走，投放每多一万，成交大约多两万出头。</div>
<div class="sc-src">样本：全国 14 家直营店，近 12 个月</div>
</div>`,
  },
  {
    id: 'chart/violin-shape@v1',
    name: '满宽小提琴图',
    brief: '箱线图的加强版：轮廓的胖瘦就是数据密不密，一眼看出单峰还是双峰。',
    group: 'distribution',
    kind: 'violin',
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.vi-kick{position:absolute;left:120px;top:92px;font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.vi-title{position:absolute;left:116px;top:128px;font-family:var(--font-display);font-size:78px;font-weight:800;line-height:1.04;letter-spacing:-.02em;color:var(--text)}
.vi-claim{position:absolute;left:120px;top:232px;font-size:23px;color:var(--muted)}
.vi-plot{position:absolute;left:120px;top:300px;width:1680px;height:520px}
.vi-rule{position:absolute;left:120px;top:872px;width:60px;height:5px;background:var(--accent)}
.vi-take{position:absolute;left:120px;top:900px;width:1280px;font-size:28px;line-height:1.5;color:var(--text)}
.vi-src{position:absolute;right:120px;bottom:92px;font-size:17px;color:var(--muted)}
</style>
<div class="vi-kick">DISTRIBUTION</div>
<div class="vi-title">各批次响应时长</div>
<div class="vi-claim">轮廓越胖，落在那个时长上的请求越多</div>
<div class="vi-plot" data-lumen-chart="1680x520">
{"kind":"violin","samples":[{"name":"周一","values":[120,132,128,141,136,148,155,142,138,161,170,145,150,133,129,152,163,147,139,144]},{"name":"周三","values":[118,126,131,124,129,135,122,127,133,130,141,125,128,134,120,136,130,123,131,127]},{"name":"周五","values":[160,182,215,196,174,231,268,205,188,176,242,198,169,181,224,193,178,207,235,191]}],"unit":"毫秒"}
</div>
<div class="vi-rule"></div>
<div class="vi-take">周三最稳，周五整体右移且尾巴拖得很长，高峰时段的慢请求都集中在那里。</div>
<div class="vi-src">样本：网关侧近三周的全部请求</div>
</div>`,
  },

  /* ---------------- 趋势类 ---------------- */
  {
    id: 'chart/area-cumulative@v1',
    name: '满宽面积图',
    brief: '折线下面填色，看的是总量随时间怎么累积，适合看份额变化或规模增长。',
    group: 'trend',
    kind: 'area',
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.ar-kick{position:absolute;left:120px;top:92px;font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.ar-title{position:absolute;left:116px;top:128px;font-family:var(--font-display);font-size:78px;font-weight:800;line-height:1.04;letter-spacing:-.02em;color:var(--text)}
.ar-claim{position:absolute;left:120px;top:232px;font-size:23px;color:var(--muted)}
.ar-plot{position:absolute;left:120px;top:300px;width:1680px;height:520px}
.ar-rule{position:absolute;left:120px;top:872px;width:60px;height:5px;background:var(--accent)}
.ar-take{position:absolute;left:120px;top:900px;width:1280px;font-size:28px;line-height:1.5;color:var(--text)}
.ar-src{position:absolute;right:120px;bottom:92px;font-size:17px;color:var(--muted)}
</style>
<div class="ar-kick">TREND / 2026</div>
<div class="ar-title">付费用户规模</div>
<div class="ar-claim">单位：万户</div>
<div class="ar-plot" data-lumen-chart="1680x520">
{"kind":"area","categories":["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"],"series":[{"name":"付费用户","values":[18,21,26,32,38,45,53,61,68,76,85,94]}],"unit":"万"}
</div>
<div class="ar-rule"></div>
<div class="ar-take">全年翻了五倍多，下半年每个月的增量都比上半年同期更大。</div>
<div class="ar-src">数据来源：增长看板，每月最后一天快照</div>
</div>`,
  },
  {
    id: 'chart/line-multi-series@v1',
    name: '满宽多线折线',
    brief: '几条线叠在一张图上比走势，适合看谁涨得快、谁在掉队。',
    group: 'trend',
    kind: 'line',
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.ln-kick{position:absolute;left:120px;top:92px;font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.ln-title{position:absolute;left:116px;top:128px;font-family:var(--font-display);font-size:78px;font-weight:800;line-height:1.04;letter-spacing:-.02em;color:var(--text)}
.ln-claim{position:absolute;left:120px;top:232px;font-size:23px;color:var(--muted)}
.ln-plot{position:absolute;left:120px;top:300px;width:1680px;height:520px}
.ln-rule{position:absolute;left:120px;top:872px;width:60px;height:5px;background:var(--accent)}
.ln-take{position:absolute;left:120px;top:900px;width:1280px;font-size:28px;line-height:1.5;color:var(--text)}
.ln-src{position:absolute;right:120px;bottom:92px;font-size:17px;color:var(--muted)}
</style>
<div class="ln-kick">TREND / 2026</div>
<div class="ln-title">三条产品线增速</div>
<div class="ln-claim">指数化到年初 = 100</div>
<div class="ln-plot" data-lumen-chart="1680x520">
{"kind":"line","categories":["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"],"series":[{"name":"企业版","values":[100,112,128,141,163,178,196,215,238,262,288,316]},{"name":"团队版","values":[100,106,114,121,133,142,151,163,174,182,195,206]},{"name":"个人版","values":[100,98,103,99,105,101,108,104,110,107,113,109]}]}
</div>
<div class="ln-rule"></div>
<div class="ln-take">企业版全年翻了三倍，个人版基本横盘——资源该往哪边压已经很清楚。</div>
<div class="ln-src">数据来源：业务中台月度结算</div>
</div>`,
  },
  {
    id: 'chart/candlestick-price@v1',
    name: '满宽K线',
    brief: '每根蜡烛是开收低高四个价，看价格怎么波动，适合行情、报价这类时序数据。',
    group: 'trend',
    kind: 'candlestick',
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.ck-kick{position:absolute;left:120px;top:92px;font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.ck-title{position:absolute;left:116px;top:128px;font-family:var(--font-display);font-size:78px;font-weight:800;line-height:1.04;letter-spacing:-.02em;color:var(--text)}
.ck-claim{position:absolute;left:120px;top:232px;font-size:23px;color:var(--muted)}
.ck-plot{position:absolute;left:120px;top:300px;width:1680px;height:520px}
.ck-rule{position:absolute;left:120px;top:872px;width:60px;height:5px;background:var(--accent)}
.ck-take{position:absolute;left:120px;top:900px;width:1280px;font-size:28px;line-height:1.5;color:var(--text)}
.ck-src{position:absolute;right:120px;bottom:92px;font-size:17px;color:var(--muted)}
</style>
<div class="ck-kick">MARKET</div>
<div class="ck-title">原材料周度报价</div>
<div class="ck-claim">每根蜡烛是开、收、低、高四个价，单位：元/吨</div>
<div class="ck-plot" data-lumen-chart="1680x520">
{"kind":"candlestick","ohlc":[{"name":"第1周","values":[4820,4910,4780,4960]},{"name":"第2周","values":[4910,4870,4820,4980]},{"name":"第3周","values":[4870,5120,4850,5190]},{"name":"第4周","values":[5120,5280,5090,5340]},{"name":"第5周","values":[5280,5190,5120,5330]},{"name":"第6周","values":[5190,5420,5160,5490]},{"name":"第7周","values":[5420,5610,5390,5680]},{"name":"第8周","values":[5610,5540,5460,5690]}]}
</div>
<div class="ck-rule"></div>
<div class="ck-take">六周连涨之后第八周首次收跌，但低点仍高于第七周的开盘。</div>
<div class="ck-src">数据来源：采购部周报</div>
</div>`,
  },
  {
    id: 'chart/heatmap-matrix@v1',
    name: '满宽热力图',
    brief: '两个维度交叉成一张格子图，颜色深浅就是数值大小，适合看时段、地区这类二维分布。',
    group: 'trend',
    kind: 'heatmap',
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.hm-kick{position:absolute;left:120px;top:92px;font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.hm-title{position:absolute;left:116px;top:128px;font-family:var(--font-display);font-size:78px;font-weight:800;line-height:1.04;letter-spacing:-.02em;color:var(--text)}
.hm-claim{position:absolute;left:120px;top:232px;font-size:23px;color:var(--muted)}
.hm-plot{position:absolute;left:120px;top:300px;width:1680px;height:560px}
.hm-rule{position:absolute;left:120px;top:912px;width:60px;height:5px;background:var(--accent)}
.hm-take{position:absolute;left:120px;top:940px;width:1680px;font-size:27px;line-height:1.5;color:var(--text)}
</style>
<div class="hm-kick">HEATMAP</div>
<div class="hm-title">一周请求热力</div>
<div class="hm-claim">纵轴是星期，横轴是时段，颜色越深请求越多</div>
<div class="hm-plot" data-lumen-chart="1680x560">
{"kind":"heatmap","matrix":{"rows":["周一","周二","周三","周四","周五","周六","周日"],"cols":["0-4","4-8","8-12","12-16","16-20","20-24"],"values":[[12,48,186,204,168,74],[14,52,192,210,176,80],[13,50,198,216,182,86],[15,54,196,212,188,92],[16,58,182,190,172,104],[22,34,96,142,208,166],[26,30,84,128,196,152]]}}
</div>
<div class="hm-rule"></div>
<div class="hm-take">工作日的高峰压在下午四点前后，周末则整体后移到晚间——推送与值班都该按这个错开。</div>
</div>`,
  },

  /* ---------------- 构成类 ---------------- */
  {
    id: 'chart/treemap-share@v1',
    name: '满幅树状图',
    brief: '每块面积就是占比，标题压在图左上，适合类目多、要一眼看出谁大谁小。',
    group: 'composition',
    kind: 'treemap',
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.tm-kick{position:absolute;left:120px;top:88px;font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.tm-title{position:absolute;left:116px;top:124px;font-family:var(--font-display);font-size:72px;font-weight:800;line-height:1.04;letter-spacing:-.02em;color:var(--text)}
.tm-claim{position:absolute;left:120px;top:222px;font-size:23px;color:var(--muted)}
.tm-plot{position:absolute;left:120px;top:290px;width:1680px;height:600px}
.tm-rule{position:absolute;left:120px;top:922px;width:60px;height:5px;background:var(--accent)}
.tm-take{position:absolute;left:120px;top:950px;width:1680px;font-size:27px;line-height:1.5;color:var(--text)}
</style>
<div class="tm-kick">REVENUE MIX</div>
<div class="tm-title">收入构成</div>
<div class="tm-claim">每块面积就是占比，单位：万元</div>
<div class="tm-plot" data-lumen-chart="1680x600">
{"kind":"treemap","hierarchy":{"name":"全部收入","children":[{"name":"企业版订阅","value":4820},{"name":"团队版订阅","value":2140},{"name":"个人版订阅","value":960},{"name":"实施服务","value":1560},{"name":"培训","value":420},{"name":"定制开发","value":1180},{"name":"运维托管","value":640},{"name":"插件市场","value":260}]}}
</div>
<div class="tm-rule"></div>
<div class="tm-take">企业版订阅一块就占了全部收入的四成，前四项合起来接近九成。</div>
</div>`,
  },
  {
    id: 'chart/pie-donut@v1',
    name: '左文右环图',
    brief: '环形图铺在右半边、文字占左侧，环心留白，适合四五项的占比且要突出总量。',
    group: 'composition',
    kind: 'pie',
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.pd-kick{position:absolute;left:120px;top:200px;font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.pd-title{position:absolute;left:116px;top:246px;width:560px;font-family:var(--font-display);font-size:72px;font-weight:800;line-height:1.08;letter-spacing:-.02em;color:var(--text)}
.pd-rule{position:absolute;left:120px;top:472px;width:56px;height:5px;background:var(--accent)}
.pd-take{position:absolute;left:120px;top:504px;width:540px;font-size:26px;line-height:1.6;color:var(--muted)}
.pd-src{position:absolute;left:120px;bottom:180px;font-size:17px;color:var(--muted)}
.pd-plot{position:absolute;right:120px;top:150px;width:1000px;height:780px}
</style>
<div class="pd-kick">COMPOSITION</div>
<div class="pd-title">获客来源构成</div>
<div class="pd-rule"></div>
<div class="pd-take">自然流量与内容合作加起来过半，付费投放只占两成出头。</div>
<div class="pd-src">数据来源：增长看板，近 90 天</div>
<div class="pd-plot" data-lumen-chart="1000x780">
{"kind":"pie","categories":["自然流量","内容合作","付费投放","社群推荐","其他"],"series":[{"name":"新增用户","values":[3860,2420,1980,1240,520]}]}
</div>
</div>`,
  },
  {
    id: 'chart/decomp-tree@v1',
    name: '满宽分解树',
    brief: '从一个总数往右一层层拆开，每个节点上标着它的值，适合讲清「这个大数由什么构成」。',
    group: 'composition',
    kind: 'decompTree',
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.dt-kick{position:absolute;left:120px;top:92px;font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.dt-title{position:absolute;left:116px;top:128px;font-family:var(--font-display);font-size:78px;font-weight:800;line-height:1.04;letter-spacing:-.02em;color:var(--text)}
.dt-claim{position:absolute;left:120px;top:232px;font-size:23px;color:var(--muted)}
.dt-plot{position:absolute;left:120px;top:300px;width:1680px;height:560px}
.dt-rule{position:absolute;left:120px;top:912px;width:60px;height:5px;background:var(--accent)}
.dt-take{position:absolute;left:120px;top:940px;width:1680px;font-size:27px;line-height:1.5;color:var(--text)}
</style>
<div class="dt-kick">BREAKDOWN</div>
<div class="dt-title">成本拆解</div>
<div class="dt-claim">从左往右一层层拆，每个节点上的数字是它的金额（万元）</div>
<div class="dt-plot" data-lumen-chart="1680x560">
{"kind":"decompTree","hierarchy":{"name":"总成本","value":2860,"children":[{"name":"人力","value":1420,"children":[{"name":"研发","value":880},{"name":"交付","value":340},{"name":"职能","value":200}]},{"name":"基础设施","value":760,"children":[{"name":"云资源","value":520},{"name":"带宽","value":240}]},{"name":"市场","value":680,"children":[{"name":"投放","value":410},{"name":"活动","value":270}]}]}}
</div>
<div class="dt-rule"></div>
<div class="dt-take">人力占了一半，其中研发一项就吃掉近三分之一——压成本绕不开这一块。</div>
</div>`,
  },
  {
    id: 'chart/sunburst-hierarchy@v1',
    name: '左文右旭日',
    brief: '一圈套一圈地看层级占比，内圈是粗分、外圈是细分，适合两层结构加总量一起讲。',
    group: 'composition',
    kind: 'sunburst',
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.sb-kick{position:absolute;left:120px;top:200px;font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.sb-title{position:absolute;left:116px;top:246px;width:560px;font-family:var(--font-display);font-size:72px;font-weight:800;line-height:1.08;letter-spacing:-.02em;color:var(--text)}
.sb-rule{position:absolute;left:120px;top:472px;width:56px;height:5px;background:var(--accent)}
.sb-take{position:absolute;left:120px;top:504px;width:540px;font-size:26px;line-height:1.6;color:var(--muted)}
.sb-src{position:absolute;left:120px;bottom:180px;font-size:17px;color:var(--muted)}
.sb-plot{position:absolute;right:120px;top:150px;width:1000px;height:780px}
</style>
<div class="sb-kick">HIERARCHY</div>
<div class="sb-title">产品收入层级</div>
<div class="sb-rule"></div>
<div class="sb-take">内圈三条产品线，外圈是各自的版本——企业版里标准版又占了七成。</div>
<div class="sb-src">数据来源：业务中台，单位万元</div>
<div class="sb-plot" data-lumen-chart="1000x780">
{"kind":"sunburst","hierarchy":{"name":"全部","children":[{"name":"企业版","value":4820,"children":[{"name":"标准版","value":3380},{"name":"旗舰版","value":1440}]},{"name":"团队版","value":2140,"children":[{"name":"标准版","value":1620},{"name":"进阶版","value":520}]},{"name":"个人版","value":960,"children":[{"name":"月付","value":620},{"name":"年付","value":340}]}]}}
</div>
</div>`,
  },

  /* ---------------- 流程类 ---------------- */
  {
    id: 'chart/funnel-conversion@v1',
    name: '左文右漏斗',
    brief: '一层层收窄的漏斗，看每一步掉了多少人，适合转化路径与流程损耗。',
    group: 'flow',
    kind: 'funnel',
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.fn-kick{position:absolute;left:120px;top:200px;font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.fn-title{position:absolute;left:116px;top:246px;width:560px;font-family:var(--font-display);font-size:72px;font-weight:800;line-height:1.08;letter-spacing:-.02em;color:var(--text)}
.fn-rule{position:absolute;left:120px;top:472px;width:56px;height:5px;background:var(--accent)}
.fn-take{position:absolute;left:120px;top:504px;width:540px;font-size:26px;line-height:1.6;color:var(--muted)}
.fn-src{position:absolute;left:120px;bottom:180px;font-size:17px;color:var(--muted)}
.fn-plot{position:absolute;right:120px;top:170px;width:1020px;height:740px}
</style>
<div class="fn-kick">FUNNEL</div>
<div class="fn-title">注册转化漏斗</div>
<div class="fn-rule"></div>
<div class="fn-take">最大的一次流失在「填资料」这一步，超过一半的人停在那里。</div>
<div class="fn-src">数据来源：埋点平台，近 30 天</div>
<div class="fn-plot" data-lumen-chart="1020x740">
{"kind":"funnel","categories":["访问落地页","点击注册","填写资料","完成验证","首次使用"],"series":[{"name":"人数","values":[48200,21600,9800,7420,5180]}]}
</div>
</div>`,
  },
  {
    id: 'chart/sankey-flow@v1',
    name: '满宽桑基图',
    brief: '带子越宽流量越大，看东西从哪来到哪去、在哪一环分流，适合资金、用户、工单的流转。',
    group: 'flow',
    kind: 'sankey',
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.sk-kick{position:absolute;left:120px;top:92px;font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.sk-title{position:absolute;left:116px;top:128px;font-family:var(--font-display);font-size:78px;font-weight:800;line-height:1.04;letter-spacing:-.02em;color:var(--text)}
.sk-claim{position:absolute;left:120px;top:232px;font-size:23px;color:var(--muted)}
.sk-plot{position:absolute;left:120px;top:300px;width:1680px;height:560px}
.sk-rule{position:absolute;left:120px;top:912px;width:60px;height:5px;background:var(--accent)}
.sk-take{position:absolute;left:120px;top:940px;width:1680px;font-size:27px;line-height:1.5;color:var(--text)}
</style>
<div class="sk-kick">FLOW</div>
<div class="sk-title">线索流转去向</div>
<div class="sk-claim">带子的宽窄就是线索数量</div>
<div class="sk-plot" data-lumen-chart="1680x560">
{"kind":"sankey","links":[{"source":"官网","target":"自助注册","value":4200},{"source":"官网","target":"销售跟进","value":1800},{"source":"内容","target":"自助注册","value":2600},{"source":"内容","target":"销售跟进","value":900},{"source":"活动","target":"销售跟进","value":2200},{"source":"活动","target":"自助注册","value":600},{"source":"自助注册","target":"成交","value":3400},{"source":"自助注册","target":"流失","value":4000},{"source":"销售跟进","target":"成交","value":2100},{"source":"销售跟进","target":"流失","value":2800}]}
</div>
<div class="sk-rule"></div>
<div class="sk-take">自助注册的线索量是销售跟进的两倍多，但成交率不到一半——分流点该往销售侧挪。</div>
</div>`,
  },
  {
    id: 'chart/chord-relations@v1',
    name: '左文右和弦',
    brief: '圆周上的弧是对象、中间的带子表示两两往来，适合看双向关系（部门协作、品类关联）。',
    group: 'flow',
    kind: 'chord',
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.cd-kick{position:absolute;left:120px;top:200px;font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.cd-title{position:absolute;left:116px;top:246px;width:560px;font-family:var(--font-display);font-size:72px;font-weight:800;line-height:1.08;letter-spacing:-.02em;color:var(--text)}
.cd-rule{position:absolute;left:120px;top:472px;width:56px;height:5px;background:var(--accent)}
.cd-take{position:absolute;left:120px;top:504px;width:540px;font-size:26px;line-height:1.6;color:var(--muted)}
.cd-src{position:absolute;left:120px;bottom:180px;font-size:17px;color:var(--muted)}
.cd-plot{position:absolute;right:100px;top:150px;width:1060px;height:780px}
</style>
<div class="cd-kick">RELATIONS</div>
<div class="cd-title">部门协作密度</div>
<div class="cd-rule"></div>
<div class="cd-take">产品与研发之间往来最密，设计与市场的连线几乎看不见。</div>
<div class="cd-src">口径：跨部门工单往来的条数，近一季度</div>
<div class="cd-plot" data-lumen-chart="1060x780">
{"kind":"chord","matrix":{"rows":["产品","研发","设计","市场","销售"],"cols":["产品","研发","设计","市场","销售"],"values":[[0,186,92,44,58],[186,0,36,22,96],[92,36,0,12,18],[44,22,12,0,124],[58,96,18,124,0]]}}
</div>
</div>`,
  },
  {
    id: 'chart/flowchart-steps@v1',
    name: '满宽流程图',
    brief: '方框加箭头一步步往下走，看的是「先做什么、后做什么、哪一步会分叉」。',
    group: 'flow',
    kind: 'flowchart',
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.fc-kick{position:absolute;left:120px;top:92px;font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.fc-title{position:absolute;left:116px;top:128px;font-family:var(--font-display);font-size:78px;font-weight:800;line-height:1.04;letter-spacing:-.02em;color:var(--text)}
.fc-claim{position:absolute;left:120px;top:232px;font-size:23px;color:var(--muted)}
.fc-plot{position:absolute;left:120px;top:300px;width:1680px;height:560px}
.fc-rule{position:absolute;left:120px;top:912px;width:60px;height:5px;background:var(--accent)}
.fc-take{position:absolute;left:120px;top:940px;width:1680px;font-size:27px;line-height:1.5;color:var(--text)}
</style>
<div class="fc-kick">PROCESS</div>
<div class="fc-title">需求交付流程</div>
<div class="fc-claim">方框是环节，箭头是流转方向</div>
<div class="fc-plot" data-lumen-chart="1680x560">
{"kind":"flowchart","links":[{"source":"需求提出","target":"评审排期"},{"source":"评审排期","target":"方案设计"},{"source":"方案设计","target":"开发实现"},{"source":"开发实现","target":"测试验收"},{"source":"测试验收","target":"灰度发布"},{"source":"灰度发布","target":"全量上线"},{"source":"测试验收","target":"打回修改"},{"source":"打回修改","target":"开发实现"}]}
</div>
<div class="fc-rule"></div>
<div class="fc-take">验收不过要退回开发重做，这一环是整条流程里唯一会回头的节点。</div>
</div>`,
  },
];
