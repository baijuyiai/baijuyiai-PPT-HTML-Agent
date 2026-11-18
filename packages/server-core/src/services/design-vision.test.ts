import test from 'node:test';
import assert from 'node:assert/strict';
import { PageAnalysis, PageType } from '@lumen/ir-schema';
import { READ_PROMPT, SPLIT_PROMPT, sanitizeAnalysis, slidePageType } from './design-vision.service.js';

/**
 * 模型返回的读解要先收拾再解析。
 *
 * 钉的是这个失败模式：模型把横带的 role（eyebrow）写进了 typography，
 * 一处枚举不对就让 safeParse 整个失败，连已经读对的横带一起被扔掉——
 * 表现是「有些页准、有些页不准」，而且只在日志里留一行 warn，极难查。
 */

const VALID = {
  pageType: 'imageText',
  designStyle: '浅色科技商务风',
  background: '近白底 + 浅蓝渐变',
  layout: '上下两段：页眉带 + 左右分栏主体',
  hierarchy: '第一眼是大标题，第二眼是右侧插画',
  columns: 2,
  bands: [
    { role: 'eyebrow', topRatio: 0, heightRatio: 0.1, leftRatio: 0, widthRatio: 1, columns: 1, note: '页眉' },
    { role: 'body', topRatio: 0.1, heightRatio: 0.9, leftRatio: 0, widthRatio: 1, columns: 2, note: '主体' },
  ],
  typography: [{ role: 'title', sample: '企业级AI中台', family: 'Inter', serif: false, sizePx: 62, weight: 700, letterSpacingEm: 0, color: '#123055' }],
  card: { radius: 12, surface: 'tinted', border: true, shadow: 'sm' },
  palette: { background: '#FFFFFF', text: '#123055', brand: '#1D4E89', accent: '#3FBF7F' },
  imagePrompt: '浅色科技感抽象背景，无文字无人物',
};

test('正常返回原样通过', () => {
  const out = PageAnalysis.safeParse(sanitizeAnalysis(VALID));
  assert.equal(out.success, true);
  assert.equal(out.data!.bands.length, 2);
  assert.equal(out.data!.typography.length, 1);
});

test('typography 里混进横带的 role 时就近映射，而不是废掉整页', () => {
  const messy = {
    ...VALID,
    typography: [
      ...VALID.typography,
      // 实测就是这么来的：模型把 bands 的 role 写进了 typography
      { role: 'eyebrow', sample: '业务介绍', family: 'Inter', serif: false, sizePx: 20, weight: 500, letterSpacingEm: 0.1, color: '#1D4E89' },
      { role: 'visual', sample: '城市插画', family: 'Inter', serif: false, sizePx: 0, weight: 400, letterSpacingEm: 0, color: '#000000' },
    ],
  };
  // 先证明不收拾的话整页会失败——这正是当初的 bug
  assert.equal(PageAnalysis.safeParse(messy).success, false, '未收拾时应当解析失败');

  const out = PageAnalysis.safeParse(sanitizeAnalysis(messy));
  assert.equal(out.success, true, '收拾之后应当通过');
  assert.equal(out.data!.typography.length, 2, 'eyebrow 映射成 caption，visual 丢弃');
  assert.deepEqual(out.data!.typography.map((t) => t.role), ['title', 'caption']);
  // 横带一条都不能少
  assert.equal(out.data!.bands.length, 2);
});

test('横带的 role 也认别名，认不出的才丢那一条', () => {
  const messy = {
    ...VALID,
    bands: [
      { role: 'header', topRatio: 0, heightRatio: 0.1, leftRatio: 0, widthRatio: 1, columns: 1 },
      { role: 'heading', topRatio: 0.1, heightRatio: 0.2, leftRatio: 0, widthRatio: 1, columns: 1 },
      { role: '完全不是个角色', topRatio: 0.3, heightRatio: 0.2, leftRatio: 0, widthRatio: 1, columns: 1 },
      { role: 'image', topRatio: 0.5, heightRatio: 0.5, leftRatio: 0, widthRatio: 1, columns: 1 },
    ],
  };
  const out = PageAnalysis.safeParse(sanitizeAnalysis(messy));
  assert.equal(out.success, true);
  assert.deepEqual(out.data!.bands.map((b) => b.role), ['eyebrow', 'title', 'visual']);
});

test('缺字段、给成 null 时不让收拾本身崩掉', () => {
  assert.doesNotThrow(() => sanitizeAnalysis(null));
  assert.doesNotThrow(() => sanitizeAnalysis(undefined));
  assert.doesNotThrow(() => sanitizeAnalysis({ typography: 'not-an-array', bands: 42 }));
  assert.deepEqual(sanitizeAnalysis({ typography: [null, 1, 'x'] }), { typography: [] });
});

/**
 * 图解页（architecture / mindMap）从看图模型回到系统的两道关卡，各钉一条。
 *
 * 这是同一个失败模式的两半：模型认得出「这是一页架构图」，但代码某处枚举没跟上，
 * 于是要么把它降级成正文页、要么让整页读解 safeParse 失败退回像素——两种都让
 * 「这一页本该承载的架构图版式」凭空消失，而日志里只有一行 warn。
 */
test('分页结果里的图解页不会被降级成正文页', () => {
  // 枚举里真实存在的类型一个都不能降级——少一个，那一页的版式就凭空丢了
  for (const t of PageType.options) {
    assert.equal(slidePageType(t), t, `${t} 在枚举里，却会被降级成正文页`);
  }
  // 认不出的仍要降级，不能把幻觉出来的页类型放进来
  assert.equal(slidePageType('flowchart'), 'text');
  assert.equal(slidePageType(42), 'text');
  assert.equal(slidePageType(undefined), 'text');
});

test('读解里的图解页 pageType 能过 schema，且 sanitizeAnalysis 不会改写它', () => {
  // sanitizeAnalysis 只收拾 typography / bands 的 role 别名，不碰 pageType——
  // 这里把它钉住：图解页的读解不该因为一处枚举缺失被 safeParse 整页丢掉
  for (const pageType of ['architecture', 'mindMap'] as const) {
    const out = PageAnalysis.safeParse(sanitizeAnalysis({ ...VALID, pageType }));
    assert.equal(out.success, true, `${pageType} 的读解不该解析失败`);
    assert.equal(out.data!.pageType, pageType, `${pageType} 的 pageType 不该被改写`);
  }
});

test('两个提示词提供的页类型，与校验接受的口径完全一致', () => {
  // 提示词提供 N 个、校验收 N 个，少一处就会出现「模型标不出这个类型」或
  // 「标出来被静默降级成正文页」。两份提示词都是从 PAGE_TYPES 拼出来的，这条用例
  // 把它们钉在一起，将来谁改成手写字面量会立刻红。
  for (const t of PageType.options) {
    // 分页提示词把每个类型写成 `type(中文名)`；用「前面不是字母」做左边界，
    // 免得 'text' 命中 'imageText('（那种命中会让这条断言形同虚设）
    assert.ok(new RegExp(`(?:^|[^A-Za-z])${t}\\(`).test(SPLIT_PROMPT), `分页提示词漏了 ${t}`);
    assert.equal(slidePageType(t), t, `${t} 在枚举里，却会被降级`);
  }
  assert.ok(
    READ_PROMPT.includes(`"pageType": "${PageType.options.join('|')}"`),
    '读解提示词的 pageType 取值与枚举不一致',
  );
});
