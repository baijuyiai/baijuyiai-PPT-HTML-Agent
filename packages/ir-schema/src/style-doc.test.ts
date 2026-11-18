import test from 'node:test';
import assert from 'node:assert/strict';
import {
  IMAGE_SLOT_ATTR, PAGE_TYPE_BRIEF, PAGE_TYPE_LABEL, PAGE_TYPE_ORDER, PROMPT_SECTIONS,
  DECORATION_BY_PAGE_TYPE, StyleDoc, coveredPageTypes, isPromptUsable, lintStylePrompt,
  fontStacksOf, missingPageTypes, pagePromptOf, styleRef,
} from './style-doc.js';
import { fontStackOf } from './font-choices.js';
import { PageType } from './page.js';

const PALETTE = {
  bg: '#EFE6DA', surface: '#F7F1E8', text: '#3A322B', muted: '#8A7F73',
  accent: '#E08A3C', brand: '#C7421A', border: '#D8CDBF',
};

const GOOD_PROMPT = [
  '角色：你是一个资深的前端工程师和视觉设计师，精通现代 CSS 排版。',
  '任务：请帮我用单文件（HTML + 内联 CSS）写一个封面模板。',
  '视觉与排版要求：',
  '1. 背景：暖米纸色，四角放极小说明文字。',
  '代码要求（非常重要）：',
  '1. 在 :root 中定义 CSS 变量。',
].join('\n');

function doc(over: Record<string, unknown> = {}) {
  return StyleDoc.parse({
    styleId: 'warm-paper', version: '1.0', name: '暖调纸感编辑风', palette: PALETTE, ...over,
  });
}

test('页类型是十三个，顺序即大纲里的常见出场次序', () => {
  assert.equal(PAGE_TYPE_ORDER.length, 13);
  assert.equal(new Set(PAGE_TYPE_ORDER).size, 13);
  // 封面第一、封底最后，中间是正文类
  assert.equal(PAGE_TYPE_ORDER[0], 'cover');
  assert.equal(PAGE_TYPE_ORDER[PAGE_TYPE_ORDER.length - 1], 'end');
  for (const t of PAGE_TYPE_ORDER) {
    assert.ok(PAGE_TYPE_LABEL[t].length > 0, `${t} 缺中文名`);
    assert.ok(PAGE_TYPE_BRIEF[t].length > 0, `${t} 缺一句话说明`);
  }
});

test('两个图解页排在图表页之后、封底之前', () => {
  // 顺序是产品决定：图解页是正文类，出场在收尾之前
  const chartAt = PAGE_TYPE_ORDER.indexOf('chart');
  const endAt = PAGE_TYPE_ORDER.indexOf('end');
  for (const t of ['architecture', 'mindMap'] as const) {
    const at = PAGE_TYPE_ORDER.indexOf(t);
    assert.ok(at > chartAt && at < endAt, `${t} 应排在 chart 之后、end 之前`);
  }
});

test('PageType 枚举的每一项都出现在 PAGE_TYPE_ORDER 里——两张表不能漂移', () => {
  // PAGE_TYPE_ORDER 是普通数组，漏掉一个页类型不会编译报错也不会让别的用例挂，
  // 但识别时的页类型推导、missingPageTypes、后台覆盖率都会少算一类。只有这条用例能兜住。
  for (const t of PageType.options) {
    assert.ok(PAGE_TYPE_ORDER.includes(t), `${t} 在 PageType 枚举里，却没写进 PAGE_TYPE_ORDER`);
  }
});

test('图片排版页与图文页是两个类型——谁是主角不一样', () => {
  // 合成一类的话，「一页放六张图」和「一页放一张配图」会共用同一套提示词
  assert.notEqual(PAGE_TYPE_BRIEF.gallery, PAGE_TYPE_BRIEF.imageText);
  assert.match(PAGE_TYPE_BRIEF.gallery, /多张图/);
  assert.match(PAGE_TYPE_BRIEF.imageText, /文字为主/);
});

test('四段齐全的提示词算合格', () => {
  assert.deepEqual(lintStylePrompt(GOOD_PROMPT), []);
  assert.equal(isPromptUsable(GOOD_PROMPT), true);
});

test('缺任何一段都要报出来——下游是把提示词原样发出去的', () => {
  for (const section of PROMPT_SECTIONS) {
    const broken = GOOD_PROMPT.replace(section, '');
    const issues = lintStylePrompt(broken);
    assert.ok(issues.some((i) => i.rule === 'prompt/missing-section'), `缺「${section}」应报错`);
    assert.equal(isPromptUsable(broken), false);
  }
});

test('四段次序颠倒要报出来', () => {
  const shuffled = [
    '任务：请帮我写一个模板。',
    '角色：你是一个前端工程师。',
    '视觉与排版要求：',
    '1. 背景。',
    '代码要求（非常重要）：',
    '1. 变量。',
  ].join('\n');
  assert.ok(lintStylePrompt(shuffled).some((i) => i.rule === 'prompt/section-order'));
});

test('提示词里写死 img 的 src 要拦下——那样这条提示词换不了图', () => {
  const hardcoded = `${GOOD_PROMPT}\n图片位：<img src="/stock/a.jpg">`;
  const issues = lintStylePrompt(hardcoded);
  assert.ok(issues.some((i) => i.rule === 'prompt/hardcoded-img-src'), issues.map((i) => i.rule).join(','));
});

test('用占位属性的图片位放行', () => {
  const ok = `${GOOD_PROMPT}\n图片位：<img ${IMAGE_SLOT_ATTR}="1">`;
  assert.deepEqual(lintStylePrompt(ok), []);
});

test('空提示词直接判不合格', () => {
  assert.ok(lintStylePrompt('   ').some((i) => i.rule === 'prompt/empty'));
});

test('配色七项齐全是 schema 的硬要求', () => {
  const missing = { ...PALETTE } as Record<string, string>;
  delete missing.border;
  assert.throws(() => StyleDoc.parse({ styleId: 'x', name: 'x', palette: missing }));
});

test('没写过提示词的页类型要能查出来，供推导用', () => {
  const d = doc({
    pagePrompts: {
      cover: { pageType: 'cover', prompt: GOOD_PROMPT },
      toc: { pageType: 'toc', prompt: GOOD_PROMPT },
    },
  });
  assert.deepEqual(coveredPageTypes(d), ['cover', 'toc']);
  const missing = missingPageTypes(d);
  assert.equal(missing.length, 11);
  assert.ok(!missing.includes('cover'));
  assert.ok(missing.includes('gallery'));
});

test('取某页提示词：没写过返回 null，写过则带上正确的页类型', () => {
  const d = doc({ pagePrompts: { cover: { pageType: 'cover', prompt: GOOD_PROMPT } } });
  assert.equal(pagePromptOf(d, 'cover')?.prompt, GOOD_PROMPT);
  assert.equal(pagePromptOf(d, 'chart'), null);
});

test('风格引用是 styleId@version 形式，项目表存的就是它', () => {
  assert.equal(styleRef(doc()), 'warm-paper@1.0');
});

test('默认值齐全：没给样机时是空串而不是 undefined', () => {
  const d = doc({ pagePrompts: { cover: { pageType: 'cover', prompt: GOOD_PROMPT } } });
  assert.equal(d.pagePrompts.cover!.mockHtml, '');
  assert.equal(d.pagePrompts.cover!.source, 'derived');
  assert.deepEqual(d.pagePrompts.cover!.issues, []);
  assert.equal(d.pagePrompts.cover!.edited, false);
  assert.equal(d.theme, 'light');
  assert.ok(d.fontFamily.includes('system-ui'), '默认字体栈要是系统字体');
});

/**
 * 版式绑定是**后加的字段**，库里那几十套风格写的时候还没有它。
 *
 * 老数据（对象里根本没有这个键）必须能解析出来并落成空串——不然启动时
 * 一次 `StyleDoc.parse` 就会把整套风格判成不合规，而症状是「风格库空了」，
 * 与真正的原因（少个字段）离得很远。
 */
test('老数据里没有 layoutId 时解析成空串，不是 undefined', () => {
  const d = doc({ pagePrompts: { cover: { pageType: 'cover', prompt: GOOD_PROMPT } } });
  assert.equal(d.pagePrompts.cover!.layoutId, '');
  // 显式给了就留着
  const bound = doc({
    pagePrompts: { cover: { pageType: 'cover', prompt: GOOD_PROMPT, layoutId: 'people/row-hex-team@v1' } },
  });
  assert.equal(bound.pagePrompts.cover!.layoutId, 'people/row-hex-team@v1');
});

/**
 * 人物页。
 *
 * 它和别的页类型不一样的地方在于：**图位取的是那 59 张人物抠图**，不是普通配图。
 * 那条链路（`cutout` 标记 → `data-lumen-cutout` → `object-fit: contain`）早就建好了，
 * 一直没人用；这个页类型是它的第一个消费方。
 */
test('people 是合法页类型，排在 gallery 之后', () => {
  assert.ok(PageType.options.includes('people'), '枚举里要有 people');
  assert.equal(PAGE_TYPE_LABEL.people, '人物页');
  assert.ok(PAGE_TYPE_BRIEF.people.length > 0, 'brief 不能空——推导提示词时要拿它当说明');

  const gi = PAGE_TYPE_ORDER.indexOf('gallery');
  const pi = PAGE_TYPE_ORDER.indexOf('people');
  assert.ok(gi >= 0 && pi >= 0, '两张表里都要有');
  assert.equal(
    pi, gi + 1,
    '**必须紧跟在 gallery 之后。** `derivePrompts` 拿 PAGE_TYPE_ORDER 的前三条当 few-shot，'
    + '把新类型插在前面会改掉所有已存风格的推导输入——那是没人要求的行为变化',
  );
});

test('missingPageTypes 会把 people 认成缺的那一类', () => {
  // 一套只有旧 11 类的风格：加了 people 之后它就缺这一类了。
  // **这正是「每个风格自动补上人物页」的机制**——`fill-missing` 流程按这个函数找缺的
  const legacy = StyleDoc.parse({
    styleId: 'legacy', name: '旧风格', palette: PALETTE,
    pagePrompts: Object.fromEntries(
      PAGE_TYPE_ORDER.filter((t) => t !== 'people')
        .map((t) => [t, { pageType: t, prompt: 'x' }]),
    ),
  });
  assert.deepEqual(missingPageTypes(legacy), ['people']);
});

/**
 * 新链路的装饰件只许锚在角落，不许横贯版面。
 *
 * `rule` 是唯一一种横贯版面的：一条固定在画布 30% 高处的细线。旧渲染器的版式是固定的
 * （标题一定在 30% 之上），这条线正好当分隔；新链路里版式由模型自己写，30% 落到哪儿全看它，
 * 实测一本 30 页的书里 9 张文字页有 6 张这条线**压在正文上**——用户报的是
 * 「中间有一根莫名其妙的灰线，好几页都有」。
 *
 * 这条用例盯着整张表：以后再加装饰件，只要它是横贯的那种，就会在这里被拦下。
 */
test('新链路的装饰件不横贯版面——只有锚在角落的几种', () => {
  const values = Object.values(DECORATION_BY_PAGE_TYPE);
  assert.equal(
    values.includes('rule'), false,
    'rule 是横贯版面的一种，新版式下它会随机压在正文上；要加装饰就往角落加',
  );
  assert.equal(DECORATION_BY_PAGE_TYPE.text, 'none', '文字页不叠装饰件');
});

/**
 * 规范里的字体选择**盖过风格原有的那三套栈**。
 *
 * 这是渲染与写提示词共用的唯一一处，也是「一键换字体」真正生效的地方：
 * 用户在界面上点了什么，这里就得回什么。漏了这层覆盖的表现是
 * 「界面上显示已切到衬线、画布纹丝不动」。
 */
test('规范里点名的字体盖过风格原有的栈；没点名的那档落回原样', () => {
  const base = {
    fontFamily: '"Source Han Serif", serif',
    fontDisplay: '"Some Custom Display", serif',
    fontScript: '"Segoe Script", cursive',
  };
  // 没有规范时就是原来的三套栈，一个字不变（存量风格走的正是这条路）
  assert.equal(fontStacksOf(base).fontFamily, '"Source Han Serif", serif');
  assert.equal(fontStacksOf(base).fontNumeric, '"Some Custom Display", serif', '数字该落回展示字体');

  const doc = {
    ...base,
    spec: {
      fonts: { display: 'cormorant', body: 'montserrat', script: '', numeric: 'system-mono' },
    } as unknown as Parameters<typeof fontStacksOf>[0]['spec'],
  };
  const stacks = fontStacksOf(doc);
  assert.equal(stacks.fontFamily, fontStackOf('montserrat'), '正文该用规范里点的那套');
  assert.equal(stacks.fontDisplay, fontStackOf('cormorant'));
  assert.equal(stacks.fontNumeric, fontStackOf('system-mono'));
  // 空串是「不指定」，该落回风格原有的栈——不能把没点过的档也一起换掉
  assert.equal(stacks.fontScript, '"Segoe Script", cursive');
});
