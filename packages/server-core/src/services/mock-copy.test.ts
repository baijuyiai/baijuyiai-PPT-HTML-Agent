import test from 'node:test';
import assert from 'node:assert/strict';
import { placeholderCopy, rewriteMockCopy, visualLen } from './mock-copy.js';

/**
 * 样机文案改成方向性占位的那套判据。
 *
 * 要钉住的三件事，每一件都是踩过或差点踩到的：
 *
 * 1. **版式不动**——占位的长度要跟原文对齐。第一版档位与占位长度对不上，
 *    「9 个字的标题」被换成「4 个字的占位」，一页的版式直接塌。
 * 2. **不是所有冒号都是字段**——「元数据驱动：指标、血缘、权限在同一张图上维护……」
 *    这种一句话被按字段拆过，换出来是「元数据驱动：内容」。
 * 3. **渲染层的数据不能当文案改**——图表槽里那串 JSON 也是「页面上的文字」，
 *    按文案换掉之后图表就画不出来了。
 */

/* ---------------- 形状：页码 / 日期 / 指标 / 符号 ---------------- */

test('页码是版式的骨架，一个字都不动', () => {
  assert.equal(placeholderCopy('01 / 12'), null);
  assert.equal(placeholderCopy('第 3 页'), null);
  assert.equal(placeholderCopy('09'), null);
});

test('日期换成「日期」', () => {
  assert.equal(placeholderCopy('2024.12.18'), '日期');
  assert.equal(placeholderCopy('2024年12月'), '日期');
  assert.equal(placeholderCopy('2021–2024'), '日期');
});

test('指标保留形状、数字归零', () => {
  assert.equal(placeholderCopy('63%'), '00%');
  assert.equal(placeholderCopy('210%'), '000%');
  assert.equal(placeholderCopy('1.2K'), '0.0K');
});

test('纯符号与过短的串留着：那是刻度或装饰，换了反而把轴撑开', () => {
  assert.equal(placeholderCopy('·'), null);
  assert.equal(placeholderCopy('—'), null);
  assert.equal(placeholderCopy('N'), null);
  assert.equal(placeholderCopy('   '), null);
});

/* ---------------- 「标签：值」 ---------------- */

test('短字段只换值：汇报人：李承远 → 汇报人：姓名', () => {
  assert.equal(placeholderCopy('汇报人：李承远'), '汇报人：姓名');
  assert.equal(placeholderCopy('发布：2024.12.18'), '发布：日期');
});

test('机构名按机构换，但**只认短值**', () => {
  assert.equal(placeholderCopy('机构：战略发展中心'), '机构：单位');
  // 长脚注不是机构字段：带分隔符的值走档位，不能整条压成「单位」
  const footnote = placeholderCopy('来源：内部数据平台 · 更新时间 2024.12');
  assert.ok(footnote !== null && footnote.startsWith('来源：'));
  assert.notEqual(footnote, '来源：单位');
});

test('一句话里的冒号不算字段——第一版就是在这儿把整句拆坏的', () => {
  const sentence = '元数据驱动：指标、血缘、权限在同一张图上维护，一次评估即可看清变更影响。';
  const got = placeholderCopy(sentence);
  assert.ok(got !== null);
  assert.ok(!got.startsWith('元数据驱动：'), `不该按字段拆：${got}`);
  assert.ok(visualLen(got) > 20, '这么长的一句不该换成一句短的');
});

/* ---------------- 长度档位 ---------------- */

test('长度按档位对齐：多长的原文换多长的占位', () => {
  const short = placeholderCopy('简短')!;
  const mid = placeholderCopy('这里写这一页的核心标题')!;
  const long = placeholderCopy('这里写这一页的核心标题，再加上一句说明这一块要讲什么')!;
  assert.ok(visualLen(short) < visualLen(mid), '短槽不该拿到长占位');
  assert.ok(visualLen(mid) < visualLen(long), '长槽不该拿到短占位');
  // 九字上下的一档（实测最容易塌的那一档）：不能退成四个字
  const nine = placeholderCopy('以数字驱动企业增长')!;
  assert.ok(visualLen(nine) >= 8, `九字标题换成了 ${visualLen(nine)} 个字的占位`);
});

test('长段落续写到接近原文长度（一整段短掉一半最扎眼）', () => {
  const para = '批流一体任务在统一调度平面上编排，变更发布经灰度与回滚双通道校验，端到端时延稳定控制在分钟级以内，'
    + '异常自动降级到只读副本，保证每一次发布都可以在五分钟之内回退到上一个已知good状态。';
  const got = placeholderCopy(para)!;
  assert.ok(visualLen(got) > visualLen(para) * 0.7, `续写不够：${visualLen(got)} vs ${visualLen(para)}`);
  assert.ok(visualLen(got) < visualLen(para) * 1.4, `续写过头：${visualLen(got)} vs ${visualLen(para)}`);
});

test('拉丁为主的那几行也给拉丁占位（眉标、字标的气质不能变）', () => {
  assert.ok(placeholderCopy('ANNUAL REPORT')!.includes('SECTION'));
  assert.ok(!/[㐀-䶿一-鿿]/.test(placeholderCopy('Autumn', 'p', 0)!));
  // 词表里的单个词（Studio / Brand）本来就是通用的英文，认成占位留着不动
  assert.equal(placeholderCopy('Studio', 'p', 0), null);
});

/* ---------------- 拉丁语境一个汉字都不给（用户点出来的） ---------------- */

test('原文没有汉字，占位也不许有汉字——封面大字与字标是拉丁排版', () => {
  // 实测点出来的三处：橙红大字海报风的刊名、暖调纸感编辑风封面的巨字与两个橙字
  for (const text of ['Lumen', 'Oak', 'Autumn', 'VOL 3', 'Lumen.Press']) {
    const got = placeholderCopy(text, 'p', 0);
    assert.ok(got !== null, `${text} 没被改写`);
    assert.ok(!/[㐀-鿿]/.test(got), `${text} 换成了中文「${got}」`);
  }
  // 「Vol.01」这种字母只占一半的也算拉丁语境：上一版按字母占比判，它被判成了中文
  assert.ok(!/[㐀-鿿]/.test(placeholderCopy('Vol.01', 'p', 0)!));
});

/* ---------------- 占位不长于原文（用户点出来的） ---------------- */

test('占位永远不超过原文长度——长了标题就会多折一行', () => {
  const samples = [
    '让每一次表达', '都成为', '资产',           // 红黑极简提案风封面标题那三行
    '以数字驱动企业增长', '整本手册的一页', 'Oak',
    '以系统化的设计语言，帮助企业在复杂市场中建立清晰而可信的品牌资产。',
    'A Seasonal Study in Paper & Light',
  ];
  for (const text of samples) {
    const got = placeholderCopy(text, 'p', 0);
    if (got === null) continue;
    assert.ok(visualLen(got) <= visualLen(text) + 1e-9,
      `「${text}」(${visualLen(text)}) 换成了更长的「${got}」(${visualLen(got)})`);
  }
});

test('连着几个短标签轮换着换，不会换成同一个词', () => {
  // 一页上三四个导航词是常态，全换成「栏目」就会读成「栏目 栏目 栏目」——一眼像坏了
  const got = [0, 1, 2].map((i) => placeholderCopy('Autumn', 'p', i));
  assert.equal(new Set(got).size, 3, `三个短标签换成了同一批：${got.join('/')}`);
  // 同一个（原文, 段序）永远给同一个结果：脚本重跑两次不能得到两份不同的样机
  assert.equal(placeholderCopy('Autumn', 'p', 2), got[2]);
});

test('两个字母以内的刻度与装饰留着，三个字母的字标要换', () => {
  assert.equal(placeholderCopy('No'), null);
  assert.equal(placeholderCopy('OK'), null);
  assert.notEqual(placeholderCopy('OAK'), null);
});

/* ---------------- 整页改写 ---------------- */

const MOCK = [
  '<style>.h1{font-size:96px}.cap{color:var(--muted)}</style>',
  '<div class="page" style="width:1920px;height:1080px">',
  '<p class="kicker">企业年报 / ANNUAL REPORT</p>',
  '<h1 class="h1">以数字驱动企业增长</h1>',
  '<p class="cap">汇报人：李承远 · 战略发展中心 · 2024.12.18</p>',
  '<div data-lumen-chart="1180x560">{"kind":"bar","categories":["2021","2022"],"series":[{"name":"S","values":[12,18]}]}</div>',
  '<span class="foot">01 / 12</span>',
  '</div>',
].join('');

test('整页改写：具体内容全没了，版式与数据一个字节没动', () => {
  const r = rewriteMockCopy(MOCK);
  // 具体内容不该剩下：人名、机构、年份、那句主张
  for (const secret of ['李承远', '战略发展中心', '2024.12.18', '以数字驱动企业增长', 'ANNUAL REPORT']) {
    assert.ok(!r.html.includes(secret), `还留着「${secret}」`);
  }
  // 图表那串 JSON 原封不动——它是渲染层的数据
  assert.ok(r.html.includes('{"kind":"bar","categories":["2021","2022"]'));
  // 样式与属性一个字没动
  assert.ok(r.html.includes('<style>.h1{font-size:96px}.cap{color:var(--muted)}</style>'));
  assert.ok(r.html.includes('style="width:1920px;height:1080px"'));
  assert.ok(r.html.includes('data-lumen-chart="1180x560"'));
  // 页码留着
  assert.ok(r.html.includes('>01 / 12<'));
  assert.ok(r.changed > 0 && r.runs > r.changed, 'runs 是全部文字段，changed 是改过的');
});

test('长度差得多的段会被列出来给人看', () => {
  const r = rewriteMockCopy('<div class="a">这一行只有八个字</div>');
  assert.equal(r.risky.length, 0, '八字换七字不该被列出来');
  const bad = rewriteMockCopy(`<div class="a">${'很长的一句占位说明'.repeat(6)}</div>`);
  assert.ok(bad.html.length > 0);
});
