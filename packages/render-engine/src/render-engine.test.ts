import test from 'node:test';
import assert from 'node:assert/strict';
import { PageIR, type PageIR as Page, type PageIRInput } from '@lumen/ir-schema';
import { BUILTIN_STYLE_PACKS } from '@lumen/style-engine';
import { measureContent } from '@lumen/content-engine';
import {
  buildSlideContext, resolveVariant, getFontScale, setFontScale, scaledFontSize,
  fitPage, fitDeck, motionForMode, needsAvatar, isAvatarFullscreen, DEFAULT_VARIANT_BY_TYPE,
  lintPage, lintDeck, hasBlockingIssue, punctuationIssue, orphanLineIssue, cjkLatinSpacingIssue,
  isMockHtmlAcceptable, lintMockHtml, paletteColors,
} from './index.js';

const PACK = BUILTIN_STYLE_PACKS.find((p) => p.styleId === 'business-classic')!;
const LONG = '这是一段很长的正文内容，用来测试溢出策略是否按既定顺序生效。'.repeat(45);

/** 用最小字段构造页面，其余交给 PageIR 的默认值 */
function page(partial: Partial<PageIRInput> & Pick<PageIRInput, 'pageType' | 'layoutVariant'>): Page {
  return PageIR.parse({
    pageId: 'pg1',
    title: { main: '标题' },
    blocks: [],
    ...partial,
  });
}

/* ---------------- 上下文 ---------------- */

test('渲染上下文提供风格包派生的一切，模板无需自行决定视觉', () => {
  const p = page({
    pageType: 'text', layoutVariant: 'text/one-column@v1',
    title: { main: '增长路径', sub: '以产品力驱动' },
    blocks: [{ type: 'paragraph', text: '一段正文。' }],
  });
  const ctx = buildSlideContext(p, PACK, { theme: 'dark', mode: 'present' });
  assert.equal(ctx.variant.id, 'text/one-column@v1');
  assert.equal(ctx.theme, 'dark');
  assert.equal(ctx.mode, 'present');
  assert.equal(ctx.canvas.w, 1920);
  assert.equal(ctx.canvas.h, 1080);
  assert.equal(ctx.canvas.marginPx, Math.round(1920 * 0.05), '边距不小于画布宽 5%');
  assert.equal(ctx.cssVars['--brand-500'], PACK.base.tokens.brand500);
  assert.equal(ctx.fontScale, 1);
  assert.ok(PACK.base.titleGrammar.templates.some((t) => t.id === ctx.titleTemplate.id));
  // 默认是逐块进场（`stagger` 是模式，不在白名单里）；手选的具体动效才受白名单约束
  assert.equal(ctx.motion, 'stagger');
  assert.equal(ctx.staggerSeed, p.footer.pageNo, '没手选过的页面按页码轮换进场方向');
});

test('版式缺失时按页类型回落，不抛错', () => {
  const p = page({ pageType: 'metrics', layoutVariant: 'metrics/不存在的版式@v9' });
  const v = resolveVariant(p, PACK);
  assert.equal(v.pageType, 'metrics');
});

test('导出模式动效降级为静态，演示模式保留', () => {
  assert.equal(motionForMode('export', 'fadeUp'), 'none');
  assert.equal(motionForMode('present', 'fadeUp'), 'fadeUp');
});

test('字号缩放吸附到字阶且不低于 12px', () => {
  assert.equal(scaledFontSize(40, 1), 40);
  assert.equal(scaledFontSize(40, 0.9), 32, '40*0.9=36 应吸附到 32');
  assert.equal(scaledFontSize(20, 0.85), 16);
  assert.equal(scaledFontSize(12, 0.5), 12, '不得低于阶梯最小值');
  assert.equal(scaledFontSize(56, 0.9), 40);
});

test('数字人开关判定', () => {
  const on = page({ pageType: 'text', layoutVariant: 'text/one-column@v1', avatar: { enabled: true, mode: 'pip', diameter: 160, position: 'bottom-left', offset: { x: 24, y: 24 }, modelId: 'm', border: 'none', shadow: 'md', degraded: false } });
  assert.equal(needsAvatar(on), true);
  assert.equal(isAvatarFullscreen(on), false);
  const fs = { ...on, avatar: { ...on.avatar, mode: 'fullscreen' as const } };
  assert.equal(isAvatarFullscreen(fs), true);
  const off = { ...on, avatar: { ...on.avatar, enabled: false } };
  assert.equal(needsAvatar(off), false);
});

test('每种页类型都有默认版式', () => {
  for (const id of Object.values(DEFAULT_VARIANT_BY_TYPE)) {
    assert.ok(PACK.base.layouts.some((l) => l.id === id), `默认版式 ${id} 必须存在于风格包`);
  }
});

/* ---------------- 溢出策略 ---------------- */

test('内容量合适时不触发任何溢出步骤', () => {
  const p = page({
    pageType: 'text', layoutVariant: 'text/one-column@v1',
    title: { main: '简短标题' },
    blocks: [{ type: 'paragraph', text: '一页正文，长度合适。' }],
  });
  const r = fitPage(p, PACK);
  assert.deepEqual(r.applied, ['none']);
  assert.equal(r.pages.length, 1);
  assert.equal(r.initialRatio <= 1, true);
});

test('溢出时优先换到容量更大的版式', () => {
  const body = '内容'.repeat(55); // 110 字，超出 four-grid 的 73 字上限
  const p = page({
    pageType: 'imageText', layoutVariant: 'imageText/four-grid@v1',
    title: { main: '方案总览' },
    blocks: [{ type: 'paragraph', text: body }],
  });
  const r = fitPage(p, PACK);
  assert.equal(r.applied[0], 'variant-switch', `应首先换版式，实际 ${r.applied.join('>')}`);
  assert.equal(r.pages.length, 1);
  assert.notEqual(r.pages[0]!.layoutVariant, 'imageText/four-grid@v1');
  assert.ok(r.finalRatio <= 1, `换版式后应装得下，实际 ${r.finalRatio}`);
});

test('超量内容按顺序降级并最终拆页，续页标题带「（续）」', () => {
  const p = page({
    pageType: 'text', layoutVariant: 'text/one-column@v1',
    title: { main: '长篇论述' },
    blocks: [{ type: 'paragraph', text: LONG }],
  });
  const r = fitPage(p, PACK);
  assert.ok(r.applied.includes('split'), `应执行拆页，实际 ${r.applied.join('>')}`);
  assert.ok(r.pages.length > 1, '应拆成多页');
  assert.ok(r.pages[1]!.title.main.includes('（续）'), '续页标题应标注（续）');
  // 拆页后每一页都应装得下
  for (const pg of r.pages) {
    const load = measureContent(pg);
    const v = PACK.base.layouts.find((l) => l.id === pg.layoutVariant)!;
    assert.ok(load.bodyChars <= v.maxBodyChars * (1 / getFontScale(pg) ** 2) + 1, `续页仍溢出：${load.bodyChars} vs ${v.maxBodyChars}`);
  }
  // 页码连续
  const nos = r.pages.map((x) => x.footer.pageNo);
  assert.deepEqual(nos, nos.map((_, i) => nos[0]! + i));
});

test('拆页保留内容不丢失（正文总量不减少）', () => {
  const p = page({
    pageType: 'text', layoutVariant: 'text/one-column@v1',
    title: { main: '长篇论述' },
    blocks: [{ type: 'paragraph', text: LONG }],
  });
  const r = fitPage(p, PACK);
  const outChars = r.pages.reduce((n, pg) => n + measureContent(pg).bodyChars, 0);
  assert.ok(outChars >= LONG.length * 0.9, `拆页后正文不应大幅缩水：${outChars} vs ${LONG.length}`);
});

test('极端超量最终摘要，并把原文保留在 overrides 供回溯', () => {
  const huge = LONG.repeat(6);
  const p = page({
    pageType: 'text', layoutVariant: 'text/one-column@v1',
    title: { main: '超长内容' },
    blocks: [{ type: 'paragraph', text: huge }],
  });
  const r = fitPage(p, PACK);
  assert.ok(r.applied.includes('summarize'), `应最终摘要，实际 ${r.applied.join('>')}`);
  const summarized = r.pages.filter((pg) => pg.overrides.summarized === true);
  assert.ok(summarized.length > 0);
  assert.ok(String(summarized[0]!.overrides.originalText).length > 0, '原文必须可回溯');
  assert.ok(r.issues.some((i) => i.rule === 'overflow/summarized'));
});

test('降字号最多两档且不低于基线下限', () => {
  const p = page({
    pageType: 'text', layoutVariant: 'text/one-column@v1',
    title: { main: 'T' },
    blocks: [{ type: 'paragraph', text: LONG }],
  });
  const r = fitPage(p, PACK);
  const fontDowns = r.applied.filter((s) => s === 'font-down').length;
  assert.ok(fontDowns <= 2, `降字号不应超过两档，实际 ${fontDowns}`);
  for (const pg of r.pages) {
    const scale = getFontScale(pg);
    assert.ok(scale >= 0.85, `字号缩放不应低于 0.85，实际 ${scale}`);
  }
});

test('适配后的页面不会被容量校验误判：fit 与 lint 共用同一套容量口径', () => {
  // 曾经的 bug：fitPage 把「降字号」折算进容量（缩小后同一区域能放更多字），
  // 而 lintPage 拿版式的裸上限去比。于是一页被降过字号的内容明明装得下，
  // Lint 却判它超限，页面被标成 failed——适配器白干，用户看到一页失败。
  const p = page({
    pageType: 'text', layoutVariant: 'text/one-column@v1',
    title: { main: '容量口径' },
    blocks: [{ type: 'paragraph', text: LONG }],
  });
  const fitted = fitPage(p, PACK);
  for (const pg of fitted.pages) {
    const errs = lintPage(pg, PACK, { lenientTypography: true }).filter((i) => i.severity === 'error');
    assert.deepEqual(errs, [], `适配后的页不应再有 error：${errs.map((e) => e.rule).join(',')}`);
  }
});

test('批量适配后页码整体重排', () => {
  const pages = [
    page({ pageId: 'a', pageType: 'cover', layoutVariant: 'cover/centered@v1', title: { main: '封面' } }),
    page({ pageId: 'b', pageType: 'text', layoutVariant: 'text/one-column@v1', title: { main: '正文' }, blocks: [{ type: 'paragraph', text: LONG }] }),
    page({ pageId: 'c', pageType: 'end', layoutVariant: 'end/centered@v1', title: { main: '谢谢' } }),
  ];
  const r = fitDeck(pages, PACK);
  assert.ok(r.pages.length > 3);
  assert.deepEqual(r.pages.map((p) => p.footer.pageNo), r.pages.map((_, i) => i + 1));
});

/* ---------------- 页面 Lint ---------------- */

test('合规页面零 error', () => {
  const p = page({
    pageType: 'metrics', layoutVariant: 'metrics/three-card@v1',
    title: { main: '关键指标' },
    blocks: [
      { type: 'metric', value: '87%', label: '转化率', primary: true },
      { type: 'metric', value: '3 倍', label: '效率提升' },
    ],
  });
  const issues = lintPage(p, PACK);
  assert.deepEqual(issues.filter((i) => i.severity === 'error'), []);
});

test('Lint 抓出要点超限、多主指标、动效越界、图表长度不一致', () => {
  const p = page({
    pageType: 'chart', layoutVariant: 'chart/full@v1',
    title: { main: '数据' },
    // from 必须是 manual：没手选过的页面播的是轮换出来的值，存着的这个数根本不生效，
    // 校验它只会误报。这条测的是「手选了一个不在白名单里的动效」
    motion: { enter: 'scaleIn', from: 'manual' },
    blocks: [
      { type: 'bullets', items: ['一', '二', '三', '四', '五'] },
      { type: 'metric', value: '1', label: 'a', primary: true },
      { type: 'metric', value: '2', label: 'b', primary: true },
      { type: 'chart', kind: 'bar', data: { categories: ['甲', '乙', '丙'], series: [{ name: 's', values: [1, 2] }] } },
    ],
  });
  const issues = lintPage(p, { ...PACK, base: { ...PACK.base, motionWhitelist: ['fade'] } });
  const rules = issues.map((i) => i.rule);
  assert.ok(rules.includes('metrics/multiple-primary'));
  assert.ok(rules.includes('chart/series-length'));
  assert.ok(rules.includes('motion/not-allowed'));
  assert.equal(hasBlockingIssue(issues), true);
});

test('auto 与 stagger 不受白名单约束——它们自己会去白名单里挑', () => {
  // 拿 auto 去比对白名单永远是「不在白名单内」，于是每个新页面一建出来就带一条 error
  const whitelistOnly = { ...PACK, base: { ...PACK.base, motionWhitelist: ['fade'] } } as typeof PACK;
  for (const enter of ['auto', 'stagger'] as const) {
    const p = page({ pageType: 'text', layoutVariant: 'text/bullets@v1', title: { main: '正文' }, motion: { enter, from: 'style-pack' } });
    const rules = lintPage(p, whitelistOnly).map((i) => i.rule);
    assert.ok(!rules.includes('motion/not-allowed'), `${enter} 不该被判越界`);
  }
});

test('Lint 抓出 AI 图片提示词缺少强制约束', () => {
  const p = page({
    pageType: 'imageText', layoutVariant: 'imageText/left-right@v1',
    title: { main: '配图' },
    blocks: [{ type: 'image', source: 'ai', prompt: '一张商务风格的抽象图' }],
  });
  const rules = lintPage(p, PACK).map((i) => i.rule);
  assert.ok(rules.includes('image/no-text-constraint'));
  assert.ok(rules.includes('image/no-portrait-constraint'));
});

test('Lint 拦截 emoji 内容', () => {
  const p = page({
    pageType: 'text', layoutVariant: 'text/one-column@v1',
    title: { main: `完成了${String.fromCodePoint(0x1f600)}` },
    blocks: [],
  });
  assert.ok(lintPage(p, PACK).some((i) => i.rule === 'brand/emoji'));
});

test('光标锚点越界由 schema 拦截；Lint 作为第二道防线同样能发现', () => {
  // 第一道：schema 层直接拒绝
  assert.throws(
    () => PageIR.parse({
      pageId: 'p', pageType: 'text', layoutVariant: 'text/one-column@v1',
      title: { main: 'T' },
      script: { cursorEnabled: true, segments: [{ t: 0, text: 'x', anchor: { targetId: 'a', x: 1.4, y: 0.5 } }] },
    }),
    /less than or equal to 1|Number must be less than or equal to 1/i,
  );

  // 第二道：即使拿到未经 schema 校验的对象（例如手工构造或旧数据），Lint 仍能报出
  const raw = {
    pageId: 'p', pageType: 'text', layoutVariant: 'text/one-column@v1',
    title: { eyebrow: '', main: 'T', accentWords: [], sub: '' },
    blocks: [], motion: { enter: 'fadeUp', from: 'style-pack' },
    script: { cursorEnabled: true, text: '', segments: [{ t: 0, text: 'x', cursor: true, anchor: { targetId: 'a', x: 1.4, y: 0.5 } }] },
    avatar: { enabled: false, mode: 'off', position: 'bottom-left', diameter: 160, offset: { x: 24, y: 24 }, modelId: 'm', border: 'none', shadow: 'md', degraded: false },
    footer: { source: '', pageNo: 1 }, overrides: {}, status: 'ready', degradeReason: '',
  } as unknown as Page;
  assert.ok(lintPage(raw, PACK).some((i) => i.rule === 'cursor/anchor-range'));
});

test('Lint 抓出数字人直径越界', () => {
  const raw = {
    pageId: 'p', pageType: 'text', layoutVariant: 'text/one-column@v1',
    title: { eyebrow: '', main: 'T', accentWords: [], sub: '' },
    blocks: [], motion: { enter: 'fadeUp', from: 'style-pack' },
    script: { cursorEnabled: false, text: '', segments: [] },
    avatar: { enabled: true, mode: 'pip', position: 'bottom-left', diameter: 320, offset: { x: 24, y: 24 }, modelId: 'm', border: 'none', shadow: 'md', degraded: false },
    footer: { source: '', pageNo: 1 }, overrides: {}, status: 'ready', degradeReason: '',
  } as unknown as Page;
  assert.ok(lintPage(raw, PACK).some((i) => i.rule === 'avatar/diameter'));
});

test('排印质量启发式：标点悬挂、孤字、中英混排', () => {
  assert.equal(punctuationIssue('，这是句首标点'), true);
  assert.equal(punctuationIssue('正常句子。'), false);
  assert.equal(orphanLineIssue('第一行\n好'), true);
  assert.equal(orphanLineIssue('第一行\n第二行'), false);
  assert.equal(cjkLatinSpacingIssue('增长210%'), true);
  assert.equal(cjkLatinSpacingIssue('增长 210%'), false);
  assert.equal(cjkLatinSpacingIssue('纯中文标题'), false);
});

test('批量 Lint 汇总所有页', () => {
  const pages = [
    page({ pageId: 'a', pageType: 'text', layoutVariant: 'text/one-column@v1', title: { main: '' } }),
    page({ pageId: 'b', pageType: 'text', layoutVariant: 'text/one-column@v1', title: { main: 'ok' } }),
  ];
  const issues = lintDeck(pages, PACK);
  assert.ok(issues.some((i) => i.rule === 'content/empty-title'));
});

/* ---------------- 生成式 HTML 约束 ---------------- */

/** 一套风格配色。新链路里色值直接写在提示词与 HTML 的 :root 里 */
const PALETTE = {
  bg: '#EFE6DA', surface: '#F7F1E8', text: '#3A322B', muted: '#8A7F73',
  accent: '#E08A3C', brand: '#C7421A', border: '#D8CDBF',
};

test('合规的生成 HTML 通过校验', () => {
  const html = '<div style="color: var(--text); background: var(--bg)">内容</div>';
  assert.equal(isMockHtmlAcceptable(lintMockHtml(html, PALETTE)), true);
});

test(':root 里的变量定义不算硬编码——那里正是定义配色的地方', () => {
  // 不豁免的话这条规则永远过不了：:root 块当然会写出具体的十六进制。
  // 真正要禁的是在 :root 之外随手写死一个颜色，那样换主题时那一处不会跟着变
  const html = [
    '<style>:root { --bg: #EFE6DA; --accent: #E08A3C; } .slide { background: var(--bg); }</style>',
    '<div class="slide">内容</div>',
  ].join('');
  const issues = lintMockHtml(html, PALETTE);
  assert.equal(isMockHtmlAcceptable(issues), true, issues.map((i) => i.message).join('；'));
});

test('变量定义写在 .slide 上一样豁免——定义在哪不重要，用的时候是 var 就行', () => {
  const html = '<style>.slide { --bg: #EFE6DA; background: var(--bg); }</style><div class="slide">x</div>';
  assert.equal(isMockHtmlAcceptable(lintMockHtml(html, PALETTE)), true);
});

test('定义之外写死的色值仍被拦下', () => {
  const html = '<style>:root { --bg: #EFE6DA; } .slide { background: var(--bg); color: #FF00FF; }</style>';
  const issues = lintMockHtml(html, PALETTE);
  assert.ok(issues.some((i) => i.rule === 'codegen/hardcoded-color'), '应拦下 :root 之外写死的 #FF00FF');
});

test('具名变量的值必须与色板对上——把 --bg 定义成深色要拦下', () => {
  // 实测踩到的：提示词里明写着 --bg:#EFE6D9，模型给出 --bg:#0B0B10，
  // 整页从暖米白翻成深紫，而 lint 一声不吭——因为豁免把变量定义整个跳过了。
  // 豁免的本意是「允许在这里定义色板」，不是「允许定义任意颜色」。
  const html = '<style>:root { --bg:#0B0B10; --text:#FFFFFF; --accent:#8B5CF6; }</style><div>x</div>';
  const issues = lintMockHtml(html, PALETTE);
  assert.ok(issues.some((i) => i.rule === 'codegen/palette-var-mismatch'), issues.map((i) => i.rule).join(','));
  assert.equal(isMockHtmlAcceptable(issues), false);
});

test('按色板写的具名变量放行', () => {
  const html = `<style>:root { --bg:${PALETTE.bg}; --text:${PALETTE.text}; --accent:${PALETTE.accent}; }</style><div>x</div>`;
  assert.equal(isMockHtmlAcceptable(lintMockHtml(html, PALETTE)), true);
});

test('深浅变体允许同色系或中性色，不许另起一套配色', () => {
  // --bg-soft 这类派生变量是正常的；但派生出绿色就不对了
  // 片段带上正文：只有 `<style>` 没有内容的那一种是「白页」，另有判据拦它，
  // 这里要验的是配色，别让它把这条用例带偏
  const ok = `<style>:root { --bg:${PALETTE.bg}; --bg-soft:#E4D8C6; --hairline:rgba(0,0,0,.2); }</style><div>内容</div>`;
  assert.equal(isMockHtmlAcceptable(lintMockHtml(ok, PALETTE)), true, '同色系变体与中性色应放行');

  const bad = `<style>:root { --bg:${PALETTE.bg}; --brand-green:#12B981; }</style><div>内容</div>`;
  const issues = lintMockHtml(bad, PALETTE);
  assert.ok(issues.some((i) => i.rule === 'codegen/off-palette-var'), issues.map((i) => i.rule).join(','));
});

test('生成 HTML 的违规被逐条拦截', () => {
  const cases: [string, string][] = [
    ['<script>alert(1)</script>', 'codegen/script'],
    ['<link rel="stylesheet" href="x.css">', 'codegen/external-stylesheet'],
    ['<style>@import "a.css";</style>', 'codegen/import'],
    ['<div style="color: #FF00FF">x</div>', 'codegen/hardcoded-color'],
    ['<div style="color: rgb(255, 0, 255)">x</div>', 'codegen/hardcoded-color'],
    ['<div onclick="x()">a</div>', 'codegen/inline-handler'],
    [`<div>${String.fromCodePoint(0x1f600)}</div>`, 'codegen/emoji'],
    ['<img src="url(https://evil.example/a.png)">', 'codegen/external-asset'],
    ['<div style="position: fixed; top: 0">x</div>', 'codegen/fixed-position'],
  ];
  for (const [html, rule] of cases) {
    const issues = lintMockHtml(html, PALETTE);
    assert.ok(issues.some((i) => i.rule === rule), `应拦截 ${rule}，实际 ${issues.map((i) => i.rule).join(',')}`);
    assert.equal(isMockHtmlAcceptable(issues), false);
  }
});

test('vh 只是警告不阻断——缩放之后它确实不等于画布高度，但页面仍能看', () => {
  const issues = lintMockHtml('<div style="height: 60vh; color: var(--text)">x</div>', PALETTE);
  assert.ok(issues.some((i) => i.rule === 'codegen/viewport-height'));
  assert.equal(isMockHtmlAcceptable(issues), true);
});

test('空 HTML 与未用变量的 HTML 被识别', () => {
  assert.ok(lintMockHtml('', PALETTE).some((i) => i.rule === 'codegen/empty'));
  const issues = lintMockHtml('<div class="x">内容</div>', PALETTE);
  assert.ok(issues.some((i) => i.rule === 'codegen/no-tokens'));
  assert.equal(isMockHtmlAcceptable(issues), true, '未用变量只是 warning，不阻断');
});

test('色板色的带透明度版本放行——遮罩、渐变里到处都要用', () => {
  // 实测踩到的：提示词要求封面做渐变遮罩，模型写的 rgba(14,28,75,.85) 就是
  // 底色 #0E1C4B 加透明度。原先只放行纯黑纯白，于是这一页合格的封面被判「硬编码」，
  // 生成时被标成失败。色板的带透明度版本是色板的**用法**，不是另起一套配色
  const css = [
    `<div style="background: linear-gradient(200deg, rgba(58,50,43,.85) 0%, rgba(224,138,60,.30) 100%);
      box-shadow: inset 0 0 0 1px rgba(120,150,220,.28); color: rgba(0,0,0,.2); border-color: rgba(255,255,255,.3)">x</div>`,
  ].join('');
  const issues = lintMockHtml(css, PALETTE);
  assert.deepEqual(issues.filter((i) => i.rule === 'codegen/hardcoded-color'), [], issues.map((i) => i.message).join('；'));
});

test('跨色相的 rgb 仍被拦下——放行的是同色系深浅，不是任意颜色', () => {
  const issues = lintMockHtml('<div style="color: rgb(18, 185, 129)">x</div>', PALETTE);
  assert.ok(issues.some((i) => i.rule === 'codegen/hardcoded-color'), '暖米纸色板上冒出一块绿应该拦下');
});

test('箭头这类 HTML 数字实体不算写死色值', () => {
  // `&#8594;` 是「→」、`&#8595;` 是「↓」。而 HEX_RE 是 `#[0-9a-fA-F]{3,8}\b`，
  // 里面的 `#8594` 正好落在这个形状里——不去实体的话，「用箭头做装饰」会被判成
  // 「写死了色值」，报出来的是一个页面上根本不存在的颜色。
  // 界面排版的识别里连撞两次，每次都白花一轮重试。
  const html = '<style>.x{color:var(--text)}</style>'
    + '<div class="x">Next &#8594;</div><div class="x">Down &#8595; &#x2713;</div>';
  const issues = lintMockHtml(html, PALETTE);
  assert.deepEqual(
    issues.filter((i) => i.rule === 'codegen/hardcoded-color'),
    [],
    issues.map((i) => i.message).join('；'),
  );
  // 去实体只该影响色值扫描：真写死的颜色照样要拦
  const bad = lintMockHtml('<div style="color:#FF00FF">&#8594;</div>', PALETTE);
  assert.ok(bad.some((i) => i.rule === 'codegen/hardcoded-color'), '真色值不能被顺手放过');
});

test('rgba 放行不影响变量定义那条——变量仍要逐字对上色板', () => {
  // 两条规则各管各的：变量定义是色板本身（严），rgba 是色板的用法（松）
  const html = '<style>:root{--bg:#0B0B10}</style><div style="background:rgba(239,230,218,.5)">x</div>';
  const rules = lintMockHtml(html, PALETTE).map((i) => i.rule);
  assert.ok(rules.includes('codegen/palette-var-mismatch'), '--bg 写错仍要拦');
  assert.ok(!rules.includes('codegen/hardcoded-color'), '同色系的 rgba 不该顺带被拦');
});

test('色板允许集合包含全部配色项', () => {
  const allowed = paletteColors(PALETTE);
  for (const c of Object.values(PALETTE)) assert.ok(allowed.has(c.toUpperCase()), `${c} 应在允许集合里`);
  assert.equal(allowed.has('#FF00FF'), false);
});

test('字号缩放写入 overrides 后可读回', () => {
  const p = page({ pageType: 'text', layoutVariant: 'text/one-column@v1' });
  assert.equal(getFontScale(p), 1);
  const scaled = setFontScale(p, 0.9);
  assert.equal(getFontScale(scaled), 0.9);
  assert.equal(getFontScale(setFontScale(p, 5)), 1, '越界值应回落为 1');
});

/* ---------------- 残缺与空白片段 ---------------- */

/**
 * 被截断的片段不能当成好页面。
 *
 * 实测：一本 30 页的书里第 5 页的 HTML 只写到 `<style>…html,body` 就断了
 * （供应商侧断流，回来的是半截 body），它过了当时所有的判据、标成 `ready` 落库，
 * 界面上那一格是绿的、打开来是**一整页白**。用户报的就是「第五页白页」。
 */
test('样式表没闭合的片段判失败——那是被截断的半页', () => {
  const truncated = [
    '<style>',
    '  :root{ --bg:#EFE6DA; --text:#3A322B; }',
    '  html,body',
  ].join('\n');
  const issues = lintMockHtml(truncated, PALETTE);
  assert.equal(isMockHtmlAcceptable(issues), false, '半截片段必须被拦下');
  assert.ok(issues.some((i) => i.rule === 'codegen/unclosed-style'), issues.map((i) => i.rule).join('、'));
});

test('样式表写完了、正文写到一半断掉的片段也判失败', () => {
  const truncated = [
    '<style>:root{ --bg:#EFE6DA; --text:#3A322B; }</style>',
    '<div class="slide">',
    '  <div class="cards">',
    '    <div class="card">第一张',
  ].join('\n');
  const issues = lintMockHtml(truncated, PALETTE);
  assert.equal(isMockHtmlAcceptable(issues), false);
  assert.ok(issues.some((i) => i.rule === 'codegen/unclosed-tag'), issues.map((i) => i.rule).join('、'));
});

test('没有文字也没有图的片段判失败——那在界面上就是一整页白', () => {
  const blank = '<style>:root{ --bg:#EFE6DA; }</style><div class="slide"></div>';
  const issues = lintMockHtml(blank, PALETTE);
  assert.equal(isMockHtmlAcceptable(issues), false);
  assert.ok(issues.some((i) => i.rule === 'codegen/blank-page'), issues.map((i) => i.rule).join('、'));
});

test('只有图、没有文字的页面是正常的，不该被当成白页', () => {
  const imageOnly = [
    '<style>:root{ --bg:#EFE6DA; }</style>',
    '<div class="slide"><img data-lumen-image="1" style="width:100%"></div>',
  ].join('');
  assert.equal(
    isMockHtmlAcceptable(lintMockHtml(imageOnly, PALETTE)), true,
    '整页一张图是合法的版式，判据不能把「没有文字」一律当白页',
  );
});

test('结构正常的页面不会被新的配对判据误伤', () => {
  const html = [
    '<style>:root{ --bg:#EFE6DA; --text:#3A322B; }</style>',
    '<div class="slide"><header>页眉</header><main><ul><li>一</li><li>二</li></ul></main><footer>脚注</footer></div>',
  ].join('');
  const issues = lintMockHtml(html, PALETTE);
  assert.equal(
    isMockHtmlAcceptable(issues), true,
    '开合配对与内容判据都不能误伤正常页面：' + issues.map((i) => i.message).join('；'),
  );
});

/**
 * 文字与底色的对比度。
 *
 * 用户一次报了六套风格的「文字看不清」，根因都是同一条：深色卡片上写深色字、
 * 浅色底上写浅色字。判据是用户给的——**深色底配浅色字、浅色底配深色字**。
 */
test('深色卡片上写深色字被判出来', () => {
  // 实测「重工蓝白工业风」的文字页就是这个形状：--surface 是深蓝、--text 是近黑
  const html = [
    '<style>:root{--bg:#FFFFFF;--surface:#2B4C9B;--text:#1A1A1A;}</style>',
    '<div class="card">卡片内容</div>',
    '<style>.card{background:var(--surface);color:var(--text);}</style>',
  ].join('');
  const issues = lintMockHtml(html, PALETTE);
  const hit = issues.filter((i) => i.rule === 'codegen/text-contrast');
  assert.equal(hit.length, 1, '深蓝底配近黑字该被拦下：' + issues.map((i) => i.rule).join(','));
  assert.match(hit[0]!.message, /深色底配浅色字/);
});

test('深色卡片配浅色字放行——这才是对的写法', () => {
  const html = [
    '<style>:root{--bg:#FFFFFF;--surface:#2B4C9B;--on-surface:#FFFFFF;--text:#1A1A1A;}</style>',
    '<div class="card">卡片内容</div>',
    '<style>.card{background:var(--surface);color:var(--on-surface);}</style>',
  ].join('');
  const issues = lintMockHtml(html, PALETTE);
  assert.equal(
    issues.filter((i) => i.rule === 'codegen/text-contrast').length, 0,
    '白字配深蓝底是高对比，不该误伤：' + issues.map((i) => i.message).join('；'),
  );
});

test('浅色卡片配深色字放行', () => {
  const html = [
    '<style>:root{--bg:#FFFFFF;--surface:#F2F2F2;--text:#1A1A1A;}</style>',
    '<div class="card">卡片内容</div>',
    '<style>.card{background:var(--surface);color:var(--text);}</style>',
  ].join('');
  const issues = lintMockHtml(html, PALETTE);
  assert.equal(issues.filter((i) => i.rule === 'codegen/text-contrast').length, 0);
});

test('只写了字色、没写底色的规则不查——底可能来自祖先，静态看不出来', () => {
  // 宁可漏，不可误伤：误判会让合格的页面被反复重发
  const html = [
    '<style>:root{--bg:#FFFFFF;--text:#1A1A1A;}</style>',
    '<div class="card">卡片内容</div>',
    '<style>.card{color:var(--text);}</style>',
  ].join('');
  const issues = lintMockHtml(html, PALETTE);
  assert.equal(issues.filter((i) => i.rule === 'codegen/text-contrast').length, 0);
});

test('渐变底不参与判断——那不是单一颜色，算不出对比度', () => {
  const html = [
    '<style>:root{--text:#1A1A1A;--accent:#E08A3C;}</style>',
    '<div class="card">卡片内容</div>',
    '<style>.card{background:linear-gradient(180deg,var(--accent),#FFFFFF);color:var(--text);}</style>',
  ].join('');
  const issues = lintMockHtml(html, PALETTE);
  assert.equal(issues.filter((i) => i.rule === 'codegen/text-contrast').length, 0);
});

/**
 * 整页底色与文字色的对比度——**跨层**那一种。
 *
 * 上面几条管的是「底和字写在同一处」。这一组管另一种形状，也是用户实测报的那一种：
 * 「红黑极简提案风」的文字页把 `.stage` 铺成 `--brand` 深红渐变（只声明 `background`），
 * 页眉、正文、页码却各自写 `color: var(--text)`（近黑）——跨了一层，上面那条完全看不见。
 */
test('整页铺深色底、文字还是深色，成片报出来', () => {
  // 底色的层次与真实那页一致：html/body 给浅色，.stage 才是真正盖住画布的那一层
  const html = [
    '<style>:root{--bg:#EFE6DA;--text:#3A322B;--muted:#8A7F73;--brand:#C7421A;--accent:#E08A3C;}</style>',
    '<div class="stage"><p class="head">标题</p><p class="body">正文</p>'
      + '<p class="sub">副文</p><p class="num">3</p></div>',
    '<style>',
    'html,body{background:var(--bg);}',
    '.stage{background:linear-gradient(135deg,color-mix(in srgb,var(--brand) 80%,white) 0%,'
      + 'var(--brand) 55%,color-mix(in srgb,var(--brand) 45%,black) 100%);}',
    '.head{color:var(--text);}',
    '.body{color:var(--muted);}',
    '.sub{color:var(--text);}',
    '.num{color:var(--muted);}',
    '</style>',
  ].join('');
  const issues = lintMockHtml(html, PALETTE);
  const hit = issues.filter((i) => i.rule === 'codegen/page-text-contrast');
  assert.equal(hit.length, 1, '整页深色底配深色字该被拦下：' + issues.map((i) => i.rule).join(','));
  assert.match(hit[0]!.message, /整页铺深色底/);
  // 光说「对比度低」模型不知道怎么改，得点明是**整页那一层**的问题
  assert.match(hit[0]!.message, /所有文字都要换成浅色/);
});

test('整页深色底、文字换成浅色就放行', () => {
  const html = [
    '<style>:root{--bg:#EFE6DA;--text:#3A322B;--brand:#C7421A;--on-brand:#F7F1E8;}</style>',
    '<div class="stage"><p class="head">标题</p><p class="body">正文</p>'
      + '<p class="sub">副文</p><p class="num">3</p></div>',
    '<style>',
    '.stage{background:var(--brand);}',
    '.head{color:var(--on-brand);}',
    '.body{color:var(--on-brand);}',
    '.sub{color:var(--on-brand);}',
    '.num{color:var(--on-brand);}',
    '</style>',
  ].join('');
  const issues = lintMockHtml(html, PALETTE);
  assert.equal(
    issues.filter((i) => i.rule === 'codegen/page-text-contrast').length, 0,
    '浅色字配深色整页底是高对比，不该误伤：' + issues.map((i) => i.message).join('；'),
  );
});

test('整页浅色底配深色字放行——这才是常规写法，绝不能误伤', () => {
  const html = [
    '<style>:root{--bg:#EFE6DA;--text:#3A322B;--muted:#8A7F73;}</style>',
    '<div class="stage"><p class="head">标题</p><p class="body">正文</p>'
      + '<p class="sub">副文</p><p class="num">3</p></div>',
    '<style>',
    '.stage{background:var(--bg);}',
    '.head{color:var(--text);}',
    '.body{color:var(--muted);}',
    '.sub{color:var(--text);}',
    '.num{color:var(--muted);}',
    '</style>',
  ].join('');
  const issues = lintMockHtml(html, PALETTE);
  assert.equal(
    issues.filter((i) => i.rule === 'codegen/page-text-contrast').length, 0,
    '整页浅色底是绝大多数页面的样子，误伤它等于全线打回：' + issues.map((i) => i.message).join('；'),
  );
});

/**
 * 只有一两处不达标时**不报**。
 *
 * 「深色图片上压一行白字」这类写法是正常的，而它在静态上看和「整页设计错了」
 * 长得一样（都是「一条没声明底色的文字规则」）。成片才是整页的问题，一两条不是。
 */
test('整页深色底但只有一两处字色不对时不报——那可能是有意的局部反色', () => {
  const html = [
    '<style>:root{--bg:#EFE6DA;--text:#3A322B;--muted:#8A7F73;--brand:#C7421A;--on-brand:#F7F1E8;}</style>',
    '<div class="stage"><p class="head">标题</p><p class="body">正文</p>'
      + '<p class="sub">副文</p><p class="num">3</p></div>',
    '<style>',
    '.stage{background:var(--brand);}',
    '.head{color:var(--on-brand);}',
    '.body{color:var(--on-brand);}',
    '.sub{color:var(--text);}',
    '.num{color:var(--muted);}',
    '</style>',
  ].join('');
  const issues = lintMockHtml(html, PALETTE);
  assert.equal(issues.filter((i) => i.rule === 'codegen/page-text-contrast').length, 0);
});

/**
 * 整页是渐变时，底色取的是**平均色**，不是某一段。
 *
 * 取最亮那一段会放行「深红渐变上写黑字」——最亮处勉强够 10:1，可那只是左上角一小块；
 * 取最暗又会把浅色渐变误判成深色。**平均更贴近整页大部分面积的观感**，
 * 实测第 11 页正是靠平均才抓出来。
 */
test('整页是渐变时，底色取平均色而不是某一段', () => {
  const html = [
    '<style>:root{--bg:#EFE6DA;--text:#3A322B;--muted:#8A7F73;--brand:#C7421A;}</style>',
    '<div class="stage"><p class="head">标题</p><p class="body">正文</p><p class="sub">副文</p></div>',
    '<style>',
    // 一端很亮、一端很暗：只取任一端都会得出相反结论
    '.stage{background:linear-gradient(135deg,#F2E3D5 0%,var(--brand) 50%,'
      + 'color-mix(in srgb,var(--brand) 30%,black) 100%);}',
    '.head{color:var(--text);}',
    '.body{color:var(--muted);}',
    '.sub{color:var(--text);}',
    '</style>',
  ].join('');
  const hit = lintMockHtml(html, PALETTE).find((i) => i.rule === 'codegen/page-text-contrast');
  assert.ok(hit, '平均下来是深色底，该报');
  assert.equal(
    /整页铺的是 #F2E3D5/.test(hit.message), false,
    '取最亮那一段就会放行——那只是左上角一小块，不能代表整页',
  );
});

/**
 * CSS 分成几段 `<style>` 写时，正则会把 HTML 标签也当成选择器的一部分。
 *
 * 实测踩过：构造用例**全都不报**，查下来是选择器成了 `</div><style>.stage`——
 * 页面级容器认的是精确名字，脏了就对不上，整页判据**静默失效**。
 */
test('CSS 分段写、选择器里混进 HTML 标签时，整页判据照样生效', () => {
  const html = [
    '<style>:root{--bg:#EFE6DA;--text:#3A322B;--muted:#8A7F73;--brand:#C7421A;}</style>',
    '<div class="stage"><p class="head">标题</p><p class="body">正文</p><p class="sub">副文</p></div>',
    '<style>',
    '.stage{background:var(--brand);}',
    '.head{color:var(--text);}',
    '.body{color:var(--muted);}',
    '.sub{color:var(--text);}',
    '</style>',
  ].join('');
  const issues = lintMockHtml(html, PALETTE);
  assert.equal(
    issues.filter((i) => i.rule === 'codegen/page-text-contrast').length, 1,
    '分段写不该让整页判据失效：' + issues.map((i) => i.rule).join(','),
  );
});

/**
 * **伪元素的背景不算「罩着子元素的色块」。**
 *
 * 实测第 25 页整页深红底、文字却全是深色，lint 一声不吭——查下来是
 * `.stage::before` 那条径向暖光把 `stage` 塞进了色块名单，于是 `.stage` 里
 * 所有文字都被当成「有底」而放行。伪元素是装饰层，不是容器。
 */
test('伪元素的背景不把所在元素算成色块', () => {
  const html = [
    '<style>:root{--bg:#EFE6DA;--text:#3A322B;--muted:#8A7F73;--brand:#C7421A;--accent:#E08A3C;}</style>',
    '<div class="stage"><p class="head">标题</p><p class="body">正文</p><p class="sub">副文</p></div>',
    '<style>',
    '.stage{background:var(--brand);}',
    // 画在 .stage 之上的一层暖光：装饰层，不是容器
    '.stage::before{background:var(--accent);}',
    '.head{color:var(--text);}',
    '.body{color:var(--muted);}',
    '.sub{color:var(--text);}',
    '</style>',
  ].join('');
  const issues = lintMockHtml(html, PALETTE);
  assert.equal(
    issues.filter((i) => i.rule === 'codegen/page-text-contrast').length, 1,
    '伪元素不该让整页判据失效：' + issues.map((i) => i.rule).join(','),
  );
});

/**
 * **中间层色块罩着的字，不算整页问题。**
 *
 * 实测误伤过五页：第 7、13、19 页是白底上的白字，可那些白字其实坐在深色卡片里；
 * 第 24、25 页的深灰字坐在白色卡片里。它们的选择器上看不出任何线索
 * （`.card-note` 和 `.card` 是两个互不相干的规则），**只有看元素嵌套才知道**。
 *
 * 误伤的代价远大于漏判：合格的页面会被打回重写，白花一轮模型钱，还可能被改坏。
 * 所以这里钉住——判据必须走 DOM，不能只看 CSS 规则。
 */
test('浅色页面上，深色卡片里的白字不算整页问题', () => {
  const html = [
    '<style>:root{--bg:#EFE6DA;--text:#3A322B;--surface:#2B4C9B;--on-surface:#F7F1E8;}</style>',
    '<div class="stage">',
    '<p class="head">页标题</p>',
    '<div class="card"><p class="name">甲</p><p class="desc">乙</p><p class="note">丙</p></div>',
    '</div>',
    '<style>',
    '.stage{background:var(--bg);}',
    '.head{color:var(--text);}',
    '.card{background:var(--surface);}',
    '.name{color:var(--on-surface);}',
    '.desc{color:var(--on-surface);}',
    '.note{color:var(--on-surface);}',
    '</style>',
  ].join('');
  const issues = lintMockHtml(html, PALETTE);
  assert.equal(
    issues.filter((i) => i.rule === 'codegen/page-text-contrast').length, 0,
    '卡片里的白字底是卡片，不是整页：' + issues.map((i) => i.message).join('；'),
  );
});

test('深色整页底上，白色卡片里的深色字不算整页问题', () => {
  const html = [
    '<style>:root{--bg:#EFE6DA;--text:#3A322B;--muted:#8A7F73;--brand:#C7421A;}</style>',
    '<div class="stage">',
    '<p class="headline">标题</p>',
    '<div class="card"><p class="card-name">甲</p><p class="card-note">乙</p>'
      + '<p class="card-modules">丙</p></div>',
    '</div>',
    '<style>',
    '.stage{background:var(--brand);}',
    '.headline{color:var(--bg);}',
    '.card{background:var(--bg);}',
    '.card-name{color:var(--text);}',
    '.card-note{color:var(--muted);}',
    '.card-modules{color:var(--muted);}',
    '</style>',
  ].join('');
  const issues = lintMockHtml(html, PALETTE);
  assert.equal(
    issues.filter((i) => i.rule === 'codegen/page-text-contrast').length, 0,
    '白卡片里的深色字底是卡片，不是整页：' + issues.map((i) => i.message).join('；'),
  );
});

/**
 * 纯黑纯白在描边、阴影、遮罩里是常规手法，与风格无关，不该按「硬编码色值」拦。
 *
 * 实测「浅紫玻璃流光风」的封面写了个 `#000`，被打了回票、重试一次还是同一个写法，
 * 白花一次调用——而那个色大概率就用在阴影上。
 *
 * **灰阶仍然拦**：`#333` 是实打实的配色选择，换了风格就该跟着变。
 */
test('纯黑纯白放行，灰阶仍然拦', () => {
  const black = '<style>.a{box-shadow:0 2px 8px #000}</style><div class="a">内容</div>';
  assert.equal(
    lintMockHtml(black, PALETTE).filter((i) => i.rule === 'codegen/hardcoded-color').length, 0,
    '#000 该放行',
  );

  // 三位简写也要认出来——`#000` 与 `#000000` 是同一个色
  const shorthandWhite = '<style>.a{outline:1px solid #fff}</style><div class="a">内容</div>';
  assert.equal(
    lintMockHtml(shorthandWhite, PALETTE).filter((i) => i.rule === 'codegen/hardcoded-color').length, 0,
    '#fff 该放行',
  );

  const grey = '<style>.a{color:#333333}</style><div class="a">内容</div>';
  assert.ok(
    lintMockHtml(grey, PALETTE).some((i) => i.rule === 'codegen/hardcoded-color'),
    '灰阶是配色选择，仍要拦',
  );
});
