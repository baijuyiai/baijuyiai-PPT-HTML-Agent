import test from 'node:test';
import assert from 'node:assert/strict';
import { PageIR, StyleDoc } from '@lumen/ir-schema';
import { BUILTIN_STYLE_PACKS } from '@lumen/style-engine';
import { pageMarkup } from './render.js';

/**
 * 导出侧的装配：装饰件要叠上、动效要按死。
 *
 * 这几条都属于「编辑器里好好的，导出来不对」那一类，而导出产物没法在界面上随手看，
 * 所以钉在测试里。
 */

const PACK = BUILTIN_STYLE_PACKS.find((p) => p.styleId === 'business-classic')!;

const DOC = StyleDoc.parse({
  styleId: 'doc-export', name: '导出用风格',
  palette: {
    bg: '#EFE6DA', surface: '#F7F1E8', text: '#3A322B', muted: '#8A7F73',
    accent: '#E08A3C', brand: '#C7421A', border: '#D8CDBF',
  },
  fontFamily: 'system-ui, sans-serif',
});

function htmlPage(over: Record<string, unknown> = {}) {
  return PageIR.parse({
    pageId: 'p1', pageType: 'cover', layoutVariant: '',
    title: { main: '封面标题' },
    blocks: [],
    footer: { source: '', pageNo: 1 },
    html: '<style>.a{color:var(--text)}</style><div class="a"><h1>标题</h1><p>正文</p></div>',
    ...over,
  });
}

test('新链路页面导出时包在定位容器里，装饰件叠在 iframe 之后', () => {
  // 目录页按 DECORATION_BY_PAGE_TYPE 走 numbered-badge（封面原来走 corner-block，
  // 那块粉白光晕已经去掉，见下一条），绝对定位要靠 .lumen-pagebox 当定位祖先
  const out = pageMarkup(htmlPage({ pageType: 'toc' }), PACK, DOC);
  assert.match(out, /^<div class="lumen-pagebox">/, `外层容器不对：${out.slice(0, 80)}`);
  assert.ok(out.includes('<iframe class="lumen-html" srcdoc="'), 'iframe 要在');
  assert.ok(out.indexOf('data-decoration="numbered-badge"') > out.indexOf('<iframe'), '装饰件要叠在 iframe 之后');
});

test('封面不叠角落光晕——那块粉白雾会洗白右下角的图片', () => {
  // 用户报的是「首页右下角的白色光晕去掉」。它是 `corner-block` 装饰件画的：
  // 底色 `mix(bg, accent, .22)` 在浅色底上就是白掺两成红（实测 rgb(246,209,215)），
  // 铺在封面右下角的图片上把图和字一起洗白。**它叠在 iframe 之上**，
  // 所以改风格提示词、改页面 CSS 都碰不到它——只有这里拦得住。
  const out = pageMarkup(htmlPage({ pageType: 'cover' }), PACK, DOC);
  assert.equal(out.includes('data-decoration'), false, '封面不该再叠任何装饰件');
  assert.equal(out.includes('radial-gradient'), false, '那块粉白雾就是 radial-gradient 画的');
});

test('类名不能撞上单文件 HTML 的整页 section', () => {
  // `.lumen-page` 在 buildSelfContainedHtml 里是 `position:absolute; inset:0; display:none`
  // 的整页容器，被这边的装饰容器借走就会把整页藏起来
  const out = pageMarkup(htmlPage(), PACK, DOC);
  assert.equal(/class="lumen-page"/.test(out), false, '不能再用 .lumen-page 这个类名');
});

test('导出时页面里的动效被按死，截图不会拍在动画中途', () => {
  const out = pageMarkup(htmlPage(), PACK, DOC);
  const srcdoc = /srcdoc="([^"]*)"/.exec(out)?.[1] ?? '';
  const doc = srcdoc.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  assert.ok(doc.includes('animation: none !important'), '导出稿要把动效按死');
  assert.equal(doc.includes('lumen-stagger-in'), false, '逐块进场的规则不该出现在导出稿里');
  assert.equal(doc.includes('data-stagger-item'), false, '导出稿里元素不能逐块淡入，截图要的是落点那一帧');
});

test('没有装饰的页类型不叠装饰，但仍包在定位容器里', () => {
  // 有装饰的：数字页走 dots
  const withDeco = pageMarkup(htmlPage({ pageType: 'metrics' }), PACK, DOC);
  assert.ok(withDeco.includes('data-decoration="dots"'));
  // 没装饰的：架构图页。**文字页也在这一档**——它原来走 rule（一条横贯版面、
  // 固定在画布 30% 高处的细线），新版式下那条线会随机压在正文上，已经去掉
  for (const pageType of ['architecture', 'text'] as const) {
    const none = pageMarkup(htmlPage({ pageType }), PACK, DOC);
    assert.equal(none.includes('data-decoration'), false, `${pageType} 不该叠装饰`);
    assert.match(none, /^<div class="lumen-pagebox">/, '容器仍在，否则画布尺寸会散');
  }
});

test('旧链路页面不走这条路——没有 html 就还是 React 渲染', () => {
  const out = pageMarkup(
    PageIR.parse({
      pageId: 'p2', pageType: 'text', layoutVariant: 'text/one-column@v1',
      title: { main: '旧页面' }, footer: { source: '', pageNo: 1 }, html: '',
    }),
    PACK,
    DOC,
  );
  assert.equal(out.includes('lumen-pagebox'), false);
  assert.equal(out.includes('<iframe'), false);
});

/* ---------------- 品牌 ---------------- */

const BRAND_SVG = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="currentColor"/></svg>';

test('导出时品牌槽位被填掉，成品里不留 data-lumen-brand', () => {
  const page = htmlPage({
    html: '<style>.b{width:34px}</style><div class="brandbar">'
      + '<span class="b" data-lumen-brand="logo"></span>'
      + '<span data-lumen-brand="name"></span>'
      + '</div><h1>标题</h1><p>正文</p>',
  });
  const out = pageMarkup(page, PACK, DOC, { svg: BRAND_SVG, name: '星图科技', tagline: '' });
  const srcdoc = (/srcdoc="([^"]*)"/.exec(out)?.[1] ?? '')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

  assert.ok(
    srcdoc.includes('<img src="data:image/svg+xml;charset=utf-8,'),
    'logo 要以 data: 图片的形式进导出稿',
  );
  // 这条是安全边界，不是外观偏好：内联进导出页的 SVG 过的是 HTML 解析器
  // （`<desc>` 是集成点、`<img>`/`<meta>` 是跳出元素），一整类 payload 能借此落进成品。
  // 当图片加载则脚本与外部子资源一律不生效。改回内联会让这条转红。
  assert.equal(srcdoc.includes('<svg'), false, '导出稿里不许出现内联的 <svg>');
  // 同样只解 logo 那条 data URL：稿里注入了 `color-mix(… 8%, …)`，对整份文档
  // `decodeURIComponent` 会抛 `URIError`（裸 `%` 后面是逗号，不是合法转义）
  const logoUrl = /src="data:image\/svg\+xml;charset=utf-8,([^"]+)"/.exec(srcdoc);
  assert.ok(logoUrl, `logo 应以 data 图片形态进导出稿，实际：${srcdoc.slice(0, 300)})`);
  assert.equal(
    decodeURIComponent(logoUrl[1]!).includes('currentColor'), false,
    '单色稿的 currentColor 要烘成品牌色——图片里的 SVG 继承不到外面的 --brand',
  );
  assert.ok(srcdoc.includes('星图科技'), '品牌名要进导出稿');
  assert.equal(srcdoc.includes('data-lumen-brand'), false, '槽位必须填掉，不能漏到成品里');
});

/**
 * 不传品牌时，**片段里的槽位一个字都不动**。
 *
 * 注意：这条原来是 `assert.match(out, /^<div class="lumen-pagebox">/)`——那个断言
 * **什么也没验**：实测「普通页不传品牌」「带槽位页不传品牌」「带槽位页**传了品牌**」
 * 三种情况它**全都通过**，区分不出「与改动前一致」。它守的只是「不传品牌不炸、
 * 仍走 iframe 分支」。
 *
 * 真正该守的契约是「没有品牌时槽位原样留着（不删、不填）」——`brandOf` 现在永远返回
 * 一个 `BrandSlot`，所以只有**调用方显式不传** `brand` 时才走这条分支，
 * 而样式库样机（`HtmlMock` 不传 brand）正是这种情况。一句话就能钉住，而且真的会红。
 */
test('不传品牌时，片段里的槽位原样留着', () => {
  const page = htmlPage({
    html: '<div class="brandbar">'
      + '<span class="brand-mark" data-lumen-brand="logo"></span>'
      + '<span data-lumen-brand="name"></span>'
      + '</div><h1>标题</h1>',
  });
  const out = pageMarkup(page, PACK, DOC);
  const srcdoc = (/srcdoc="([^"]*)"/.exec(out)?.[1] ?? '')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

  assert.match(out, /^<div class="lumen-pagebox">/, '不传品牌仍走 iframe 分支');
  assert.ok(srcdoc.includes('data-lumen-brand="logo"'), '槽位属性要原样留着，不能被填掉或删掉');
  assert.ok(srcdoc.includes('data-lumen-brand="name"'));
});
