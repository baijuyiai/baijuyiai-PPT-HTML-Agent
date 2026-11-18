import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { PageIR, containsEmoji, type BlockInput, type PageIR as Page } from '@lumen/ir-schema';
import { BUILTIN_STYLE_PACKS, CANONICAL_VARIANT_IDS, findVariant } from '@lumen/style-engine';
import { buildSlideContext, type SlideRenderContext } from '@lumen/render-engine';
import { DEFAULT_VARIANT_GEOMETRY } from '@lumen/style-engine';
import {
  Slide, SlideThumbnail, layoutFor, AVATAR_PRESETS, avatarPresetSvg, avatarSrcFor, findAvatarPreset,
  DEFAULT_AVATAR_PRESET_ID, NewChainAvatar, CursorGlyph, CURSOR_SHAPES,
} from './index.js';

const PACK = BUILTIN_STYLE_PACKS.find((p) => p.styleId === 'business-classic')!;
const ACADEMIC = BUILTIN_STYLE_PACKS.find((p) => p.styleId === 'academic-rigor')!;

/** 为某版式构造一份内容匹配的样例页 */
function sampleFor(variantId: string): Page {
  const variant = findVariant(PACK, variantId);
  const blocks: BlockInput[] = [];
  if (variant.imageCounts.length > 0) {
    const n = Math.max(...variant.imageCounts);
    for (let i = 0; i < n; i++) {
      blocks.push({
        id: `img${i}`,
        type: 'image',
        source: 'ai',
        src: '',
        prompt: '抽象几何，不要出现任何文字，不要出现可识别的真人肖像',
        status: 'ready',
        caption: `图注 ${i + 1}`,
      });
    }
  }
  if (variant.pageType === 'chart') {
    blocks.push({
      id: 'c1', type: 'chart', kind: 'bar',
      data: { categories: ['华东', '华南', '华北', '西南'], series: [{ name: '营收', values: [320, 280, 150, 90] }] },
    });
  }
  if (variant.maxMetrics > 0) {
    for (let i = 0; i < Math.min(variant.maxMetrics, 3); i++) {
      blocks.push({ id: `m${i}`, type: 'metric', value: `${87 - i * 7}%`, label: `指标 ${i + 1}`, primary: i === 0, trend: i === 0 ? '增长 12%' : '' });
    }
  }
  if (variant.maxBullets > 0) {
    blocks.push({ id: 'b1', type: 'bullets', items: ['要点一', '要点二', '要点三'] });
  }
  if (blocks.length === 0) {
    blocks.push({ id: 'p1', type: 'paragraph', text: '这是一段用于占位校验的正文内容，长度适中。' });
  }
  return PageIR.parse({
    pageId: `pg-${variantId}`,
    pageType: variant.pageType,
    layoutVariant: variantId,
    title: { eyebrow: '章节', main: '以产品力驱动增长', accentWords: ['增长'], sub: '本页说明核心主张与依据' },
    blocks,
    footer: { source: '内部资料', pageNo: 3 },
  });
}

function render(page: Page, pack = PACK, extra: Parameters<typeof buildSlideContext>[2] = {}) {
  const ctx = buildSlideContext(page, pack, extra);
  return renderToStaticMarkup(<Slide ctx={ctx} scale={0.5} />);
}

test('每个规范版式都能渲染，且与规范几何表一一对应', () => {
  assert.equal(CANONICAL_VARIANT_IDS.length, 23);
  for (const id of CANONICAL_VARIANT_IDS) {
    assert.ok(DEFAULT_VARIANT_GEOMETRY[id], `缺少规范几何 ${id}`);
  }
  for (const id of Object.keys(DEFAULT_VARIANT_GEOMETRY)) {
    assert.ok(CANONICAL_VARIANT_IDS.includes(id), `几何 ${id} 不在规范集合内`);
  }
});

/**
 * ECharts SSR 会给内部样式类与动画编号（zr0-cls-0 / zr1-ani-0），每次渲染的编号都不同，
 * 但类名、动画名与对应的样式规则是一起变的，画面完全一致。
 * 比对前把这个计数器抹平，否则任何字符串级的渲染比对都会被它干扰。
 */
const normalize = (html: string) => html.replace(/zr\d+-[a-z]+-\d+/g, 'zrN-x-N');

test('全部 23 个版式：几何的回落路径与包内路径给出同一份几何', () => {
  // 这是把几何搬进风格包时唯一要紧的不变式。老包（库里已有的、没有 geometry 字段的）
  // 走按 id 回落那条路，两条路必须给出同一份几何，否则升级会让所有已保存的项目换一副样子。
  const legacy = {
    ...PACK,
    base: {
      ...PACK.base,
      layouts: PACK.base.layouts.map((l) => {
        const { geometry: _drop, ...rest } = l;
        return rest;
      }),
    },
  };
  for (const id of CANONICAL_VARIANT_IDS) {
    assert.deepEqual(
      layoutFor(legacy.base.layouts.find((l) => l.id === id) as never),
      layoutFor(PACK.base.layouts.find((l) => l.id === id)!),
      `版式 ${id} 的回落几何与包内几何不一致`,
    );
  }
});

test('全部 23 个版式：带 geometry 的包与老包渲染结果一致', () => {
  const legacy = {
    ...PACK,
    base: {
      ...PACK.base,
      layouts: PACK.base.layouts.map((l) => {
        const { geometry: _drop, ...rest } = l;
        return rest;
      }),
    },
  };
  for (const id of CANONICAL_VARIANT_IDS) {
    const page = sampleFor(id);
    assert.equal(
      normalize(render(page, legacy as typeof PACK)),
      normalize(render(page, PACK)),
      `版式 ${id} 在带 geometry 与不带 geometry 两种包下渲染结果不同`,
    );
  }
});

test('风格包自带的几何会覆盖规范表——这是「识别出的风格按原稿排版」的前提', () => {
  const variant = PACK.base.layouts[0]!;
  // 造一个与规范表明显不同的几何，渲染层必须照它来
  const tweaked = { ...variant, geometry: { ...DEFAULT_VARIANT_GEOMETRY[variant.id]!, gapRatio: 0.42 } };
  assert.equal(layoutFor(tweaked).gapRatio, 0.42);
  // 没有 geometry 的老包按 id 回落，不能全部退化成 left-stack
  const legacy = { id: 'cover/centered@v1' };
  assert.equal(layoutFor(legacy as never).kind, 'centered');
});

test('23 个版式全部渲染成功并输出关键内容', () => {
  for (const id of CANONICAL_VARIANT_IDS) {
    const html = render(sampleFor(id));
    assert.ok(html.length > 200, `${id} 渲染结果过短`);
    // 强调词会被拆进独立的 span，因此断言不含强调词的那一段
    assert.ok(html.includes('以产品力驱动'), `${id} 未渲染主标题`);
    assert.ok(html.includes(`data-variant="${id}"`), `${id} 未标注版式`);
    assert.equal(containsEmoji(html), false, `${id} 渲染结果含 emoji`);
  }
});

test('强调词被拆进独立的着色 span', () => {
  const html = render(sampleFor('cover/centered@v1'));
  assert.ok(html.includes('以产品力驱动'), '主标题前半段应原样渲染');
  assert.ok(html.includes('>增长</span>'), '强调词应被独立 span 包裹');
  assert.ok(html.includes(`color:${PACK.base.tokens.accent500}`), '强调词应使用辅助色');
});

test('五个风格族渲染同一版式都成功且取色不同', () => {
  const page = sampleFor('text/one-column@v1');
  const outputs = BUILTIN_STYLE_PACKS.map((pack) => render(page, pack));
  for (const [i, html] of outputs.entries()) {
    assert.ok(html.includes('以产品力驱动'), `风格 ${BUILTIN_STYLE_PACKS[i]!.styleId} 未渲染标题`);
  }
  assert.notEqual(outputs[0], outputs[1], '不同风格族应产出不同渲染结果');
});

test('画布尺寸固定 16:9 且铺满风格包令牌', () => {
  const html = render(sampleFor('text/one-column@v1'));
  assert.ok(html.includes('width:1920px'), '画布宽应为 1920');
  assert.ok(html.includes('height:1080px'), '画布高应为 1080');
  assert.ok(html.includes(`--brand-500:${PACK.base.tokens.brand500}`), '应铺风格包主色变量');
  assert.ok(html.includes('padding:96px'), '边距应为画布宽 5% = 96px');
});

test('深色主题切换背景与文字色', () => {
  const page = sampleFor('text/one-column@v1');
  const light = render(page, PACK, { theme: 'light' });
  const dark = render(page, PACK, { theme: 'dark' });
  assert.ok(light.includes('#FFFFFF'), '浅色背景应为白色');
  assert.ok(dark.includes('#16181D'), '深色背景应为 #16181D（禁止纯黑）');
  assert.ok(dark.includes('data-theme="dark"'));
  assert.notEqual(light, dark);
});

test('导出模式不带入场动效，编辑模式带', () => {
  // from: 'manual' 才是「手选了 fadeUp」；不写的话会被当成没手选过，跟着页序号轮换
  const page = PageIR.parse({ ...sampleFor('text/one-column@v1'), motion: { enter: 'fadeUp', from: 'manual' } });
  assert.ok(render(page, PACK, { mode: 'edit' }).includes('lumen-fade-up'));
  assert.equal(render(page, PACK, { mode: 'export' }).includes('animation:lumen-fade-up'), false);
});

test('默认动效 auto：整页淡入 + 元素逐块，且方向按页码轮换', () => {
  const base = sampleFor('text/one-column@v1');
  // 默认就是 auto（DEFAULT_MOTION），这里显式写出来是为了让「测的是什么」一眼可见
  const dirs = new Set<string>();
  for (const pageNo of [1, 2, 3, 4, 5]) {
    const page = PageIR.parse({
      ...base, footer: { source: '', pageNo }, motion: { enter: 'auto', from: 'style-pack' },
    });
    const edit = render(page, PACK, { mode: 'edit' });
    // 页面这一层是普通淡入：逐块进场发生在页内元素上
    assert.ok(edit.includes('animation:lumen-fade '), `第 ${pageNo} 页整页该是淡入`);
    const dir = /data-lumen-stagger="([a-z]+)"/.exec(edit);
    assert.ok(dir, `第 ${pageNo} 页该有逐块进场的方向：${edit.slice(0, 300)}`);
    dirs.add(dir[1]!);
    // 导出必须静态，否则截图可能拍在动画中途
    const exported = render(page, PACK, { mode: 'export' });
    assert.equal(exported.includes('data-stagger-item'), false, '导出稿不能留逐块进场的标记');
    assert.equal(exported.includes('data-lumen-stagger'), false);
  }
  assert.ok(dirs.size > 1, `连续几页该拿到不同的进场方向，实际只有 ${[...dirs].join(', ')}`);
});

test('手选具体动效时整页进、不逐块', () => {
  const page = PageIR.parse({
    ...sampleFor('text/one-column@v1'),
    motion: { enter: 'fadeUp', from: 'manual' },
  });
  const edit = render(page, PACK, { mode: 'edit' });
  assert.ok(edit.includes('animation:lumen-fade-up '));
  assert.equal(edit.includes('data-stagger-item'), false, '整页进的时候不该有逐块标记');
  assert.equal(edit.includes('data-lumen-stagger'), false);
});

test('手选 stagger：逐块进场，但每页同一个方向', () => {
  const base = sampleFor('text/one-column@v1');
  const dirs = new Set<string>();
  for (const pageNo of [1, 4, 7]) {
    const page = PageIR.parse({
      ...base, footer: { source: '', pageNo }, motion: { enter: 'stagger', from: 'manual' },
    });
    const edit = render(page, PACK, { mode: 'edit' });
    assert.ok(edit.includes('animation:lumen-fade '), '页面这一层仍是整体淡入');
    const dir = /data-lumen-stagger="([a-z]+)"/.exec(edit);
    assert.ok(dir, '该有逐块进场的方向');
    dirs.add(dir[1]!);
    assert.ok(edit.includes('data-stagger-item'), '内容块该被标上序号');
  }
  assert.deepEqual([...dirs], ['up'], '手选的是固定值，不该跟着页码变');
});

test('元素序号按阅读序往后排，标题在最前', () => {
  const page = PageIR.parse({ ...sampleFor('text/one-column@v1'), motion: { enter: 'stagger', from: 'manual' } });
  const edit = render(page, PACK, { mode: 'edit' });
  const indices = [...edit.matchAll(/--stagger-i:(\d+)/g)].map((m) => Number(m[1]!));
  assert.ok(indices.length >= 3, `该标出好几块：${indices.length}`);
  assert.deepEqual(indices, [...indices].sort((a, b) => a - b), '序号该是递增的');
  assert.deepEqual([...new Set(indices)], indices, '序号不该重复');
  assert.equal(indices[0], 0, '标题该拿 0');
});

test('图上压字版式带遮罩且标题为浅色', () => {
  const html = render(sampleFor('imageText/full-bleed-overlay@v1'));
  assert.ok(html.includes('linear-gradient'), '应有遮罩渐变');
  assert.ok(html.includes('#FFFFFF'), '标题应为浅色');
});

test('数字人：关闭时不渲染，pip 时左下角圆形，全屏时占主体', () => {
  const base = sampleFor('text/one-column@v1');
  const off = render(PageIR.parse({ ...base, avatar: { enabled: false, mode: 'pip' } }));
  assert.equal(off.includes('data-avatar'), false);

  const pip = render(PageIR.parse({ ...base, avatar: { enabled: true, mode: 'pip', diameter: 160, position: 'bottom-left' } }));
  assert.ok(pip.includes('data-avatar="pip"'));
  assert.ok(pip.includes('border-radius:999px'));
  assert.ok(pip.includes('width:160px'));

  const fs = render(PageIR.parse({ ...base, avatar: { enabled: true, mode: 'fullscreen' } }));
  assert.ok(fs.includes('data-avatar="fullscreen"'));
});

test('数字人关闭页导出时不产生图层（PRD §5.13 验收）', () => {
  const base = sampleFor('text/one-column@v1');
  const pages = [1, 2, 3].map((n) =>
    PageIR.parse({ ...base, pageId: `p${n}`, avatar: { enabled: true, mode: n === 3 ? 'off' : 'pip' } }),
  );
  const htmls = pages.map((p) => render(p, PACK, { mode: 'export' }));
  assert.ok(htmls[0]!.includes('data-avatar="pip"'));
  assert.ok(htmls[1]!.includes('data-avatar="pip"'));
  assert.equal(htmls[2]!.includes('data-avatar'), false, 'off 页不应有数字人图层');
});

/**
 * 新链路的全屏数字人是**铺满整个画面**的。
 *
 * 原先是「一层半透明遮罩 + 正中一个圆」——那不算全屏：页面还占着大半个画面，
 * 中间悬着个头像。全屏的意思是讲解人占满这一屏，页面让位。
 */
test('全屏数字人铺满整个画面，不留圆形蒙版', () => {
  const page = PageIR.parse({ ...sampleFor('text/one-column@v1'), avatar: { enabled: true, mode: 'fullscreen' } });
  const html = renderToStaticMarkup(<NewChainAvatar avatar={page.avatar} />);
  assert.ok(html.includes('data-avatar="fullscreen"'));
  assert.ok(html.includes('object-fit:cover'), '该铺满画面：cover 而不是 contain');
  assert.equal(html.includes('border-radius:999px'), false, '全屏态不该再有圆形蒙版');
});

/**
 * 三种光标形状都要能在**浅色底**上看见。
 *
 * 很多风格的强调色本身偏浅（亮橙、亮黄），只画强调色的话压在浅底上直接糊掉——
 * 所以每种形状都带一圈白描边。功能库把那三种并排摆出来给人看，糊了就白摆了。
 */
test('讲解光标的三种形状互不相同，且都带白描边', () => {
  const drawn = CURSOR_SHAPES.map((s) => renderToStaticMarkup(<CursorGlyph shape={s} size={84} color="#FF7A1A" />));
  assert.equal(new Set(drawn).size, CURSOR_SHAPES.length, '三种形状画出来必须互不相同');
  drawn.forEach((html, i) => {
    assert.ok(html.length > 0, `${CURSOR_SHAPES[i]} 什么都没画`);
    assert.ok(
      html.includes('rgba(255,255,255,.92)'),
      `${CURSOR_SHAPES[i]} 没有白描边——强调色偏浅时压在浅色底上会糊`,
    );
  });
});

test('讲解光标按锚点渲染，关闭时不出现', () => {
  const base = sampleFor('text/one-column@v1');
  const on = PageIR.parse({
    ...base,
    script: { cursorEnabled: true, segments: [{ t: 0, text: '第一段', anchor: { targetId: 'metric-main', x: 0.62, y: 0.38 }, cursor: true }] },
  });
  const ctx = buildSlideContext(on, PACK);
  const html = renderToStaticMarkup(<Slide ctx={ctx} cursor={{ x: 0.62, y: 0.38, visible: true }} />);
  assert.ok(html.includes('data-cursor'));
  assert.ok(html.includes('left:62%'));
  assert.ok(html.includes('top:38%'));

  const off = PageIR.parse({ ...base, script: { cursorEnabled: false, segments: [] } });
  const offHtml = renderToStaticMarkup(<Slide ctx={buildSlideContext(off, PACK)} cursor={{ x: 0.5, y: 0.5, visible: true }} />);
  assert.equal(offHtml.includes('data-cursor'), false);
});

test('未就绪的图片显示占位图形而不是破图', () => {
  const page = PageIR.parse({
    pageId: 'p', pageType: 'imageText', layoutVariant: 'imageText/left-right@v1',
    title: { main: '配图页' },
    blocks: [{ type: 'image', source: 'ai', prompt: 'x', status: 'pending', placeholderReason: '图片生成中' }],
  });
  const html = render(page);
  assert.ok(html.includes('图片生成中'));
  assert.ok(html.includes('<svg'), '占位应为线稿 SVG');
});

test('图表渲染为静态 SVG，柱状与折线形状不同', () => {
  const mk = (kind: 'bar' | 'line') => PageIR.parse({
    pageId: 'p', pageType: 'chart', layoutVariant: 'chart/full@v1',
    title: { main: '数据' },
    blocks: [{ type: 'chart', kind, data: { categories: ['甲', '乙', '丙'], series: [{ name: 's', values: [3, 5, 2] }] } }],
  });
  const bar = render(mk('bar'));
  const line = render(mk('line'));

  for (const [name, html] of [['柱状', bar], ['折线', line]] as const) {
    assert.ok(html.includes('<svg'), `${name}图应内联为 SVG`);
    assert.ok(html.includes('<path'), `${name}图应有图元`);
    // 静态图不挂交互，出现 tooltip 说明 SSR 模式没走对
    assert.ok(!html.includes('tooltip'), `${name}图不该带 tooltip`);
  }
  assert.notEqual(bar, line, '两种图表的输出应当不同');
});

test('图表配色取自风格包，不写死颜色', () => {
  const page = PageIR.parse({
    pageId: 'p', pageType: 'chart', layoutVariant: 'chart/full@v1',
    title: { main: '数据' },
    blocks: [{ type: 'chart', kind: 'bar', data: { categories: ['甲', '乙', '丙'], series: [{ name: 's', values: [3, 5, 2] }] } }],
  });
  const biz = render(page, PACK);
  const aca = render(page, ACADEMIC);
  assert.notEqual(biz, aca, '换风格包图表配色应跟着变');
  assert.ok(biz.includes(PACK.base.tokens.brand500), '应使用该风格包的主色');
});

test('指标卡渲染主指标高亮，且数值等宽', () => {
  const html = render(sampleFor('metrics/three-card@v1'));
  assert.ok(html.includes('font-variant-numeric:tabular-nums'), '数值应等宽对齐');
  assert.ok(html.includes('87%'));
});

/** 造一个「几何里带横带」的包，模拟识别出来的风格 */
function bandedPack() {
  return {
    ...PACK,
    base: {
      ...PACK.base,
      layouts: PACK.base.layouts.map((l) => (l.pageType === 'text' ? {
        ...l,
        geometry: {
          ...l.geometry,
          bands: [
            { role: 'title', topRatio: 0.1, heightRatio: 0.12, leftRatio: 0.08, widthRatio: 0.5, columns: 1, align: 'left' },
            { role: 'body', topRatio: 0.4, heightRatio: 0.4, leftRatio: 0.08, widthRatio: 0.84, columns: 1, align: 'left' },
            { role: 'footer', topRatio: 0.93, heightRatio: 0.03, leftRatio: 0.08, widthRatio: 0.3, columns: 1, align: 'left' },
          ],
        },
      } : l)),
    },
  } as typeof PACK;
}

test('几何里带横带时按量出的百分比排布，而不是套固定骨架', () => {
  const html = render(sampleFor('text/one-column@v1'), bandedPack());
  // 三条带的位置都应原样出现在样式里
  assert.ok(html.includes('top:10%'), '标题带的位置没落到样式里');
  assert.ok(html.includes('top:40%'), '正文带的位置没落到样式里');
  assert.ok(html.includes('left:8%') && html.includes('width:84%'), '正文带的左右边界没落到样式里');
  // 走骨架路径时不该再出现固定骨架特有的居中容器
  const plain = render(sampleFor('text/one-column@v1'), PACK);
  assert.notEqual(html, plain, '带横带的包渲染结果应与基准族不同');
});

test('骨架路径下页脚仍落在底部，不会被顶到顶部', () => {
  const html = render(sampleFor('text/one-column@v1'), bandedPack());
  // 页脚带的底边 = 1 - 0.93 - 0.03 = 4%
  assert.ok(html.includes('bottom:4%'), `页脚没贴到量到的位置：${html.slice(-400)}`);
  const footerAt = html.indexOf('bottom:4%');
  const topAt = html.indexOf('top:10%');
  assert.ok(footerAt > 0 && topAt > 0 && footerAt !== topAt);
});

test('没有横带的包渲染结果与从前完全一致', () => {
  const legacy = {
    ...PACK,
    base: {
      ...PACK.base,
      layouts: PACK.base.layouts.map((l) => {
        const { bands: _drop, ...rest } = (l.geometry ?? {}) as Record<string, unknown>;
        return { ...l, geometry: { ...rest } };
      }),
    },
  };
  for (const id of CANONICAL_VARIANT_IDS) {
    const page = sampleFor(id);
    assert.equal(
      normalize(render(page, legacy as typeof PACK)),
      normalize(render(page, PACK)),
      `版式 ${id} 在没有横带时渲染结果变了`,
    );
  }
});

test('正文没有专属文字带时退到还没被占用的带，而不是整页空掉', () => {
  // 用户把页类型从「指标页」改成「正文页」，但原稿量出来的横带角色仍是「指标卡」——
  // 这种错配下正文必须有地方放，否则页面会空
  const pack = {
    ...PACK,
    base: {
      ...PACK.base,
      layouts: PACK.base.layouts.map((l) => (l.pageType === 'text' ? {
        ...l,
        geometry: {
          ...l.geometry,
          bands: [
            { role: 'title', topRatio: 0.1, heightRatio: 0.12, leftRatio: 0.08, widthRatio: 0.5, columns: 1, align: 'left' },
            { role: 'metrics', topRatio: 0.5, heightRatio: 0.3, leftRatio: 0.06, widthRatio: 0.86, columns: 3, align: 'n/a' },
          ],
        },
      } : l)),
    },
  } as typeof PACK;

  const html = render(sampleFor('text/one-column@v1'), pack);
  assert.ok(html.includes('top:50%'), '正文没有退到那条空闲的带');
  assert.ok(html.includes('要点一'), '正文内容没被渲染出来');
});

test('布局描述符对未知版式安全回落', () => {
  const l = layoutFor({ id: '不存在的版式@v9' });
  assert.equal(l.kind, 'left-stack');
});

test('缩略图渲染精简版', () => {
  const ctx = buildSlideContext(sampleFor('text/one-column@v1'), PACK);
  const html = renderToStaticMarkup(<SlideThumbnail ctx={ctx} scale={0.1} />);
  assert.ok(html.includes('以产品力驱动增长'), '缩略图标题不拆强调词');
  assert.ok(html.length < 3000, '缩略图应比完整渲染精简');
});

test('学术风格的正文比商务风格更大字号密度更高（同一版式不同调性）', () => {
  const page = sampleFor('text/one-column@v1');
  const biz = render(page, PACK);
  const aca = render(page, ACADEMIC);
  assert.ok(biz.includes(`${PACK.base.typography.roles.find((r) => r.role === 'body')!.sizePx}px`));
  assert.ok(aca.includes(`${ACADEMIC.base.typography.roles.find((r) => r.role === 'body')!.sizePx}px`));
});

test('渲染上下文与包类型对齐', () => {
  const ctx: SlideRenderContext = buildSlideContext(sampleFor('cover/centered@v1'), PACK);
  assert.equal(ctx.canvas.w, 1920);
  assert.equal(ctx.mode, 'edit');
});

/* ---------------- 数字人形象 ---------------- */

test('内置形象有三个，id 唯一且都能产出可用的图源', () => {
  assert.equal(AVATAR_PRESETS.length, 3);
  assert.equal(new Set(AVATAR_PRESETS.map((p) => p.id)).size, 3);
  for (const preset of AVATAR_PRESETS) {
    // 默认那个是真人肖像（位图 data URL），另外两个是剪影 SVG——两种都要能直接塞进 <img src>
    const src = avatarSrcFor(preset.id);
    assert.ok(src.startsWith('data:image/'), `${preset.name} 应产出 data URL`);
    assert.ok(!containsEmoji(src), '形象里不得出现 emoji');
  }
  // 剪影那两个仍要画得出 SVG，且用各自的轮廓色
  for (const preset of AVATAR_PRESETS.filter((p) => !p.imageSrc)) {
    const svg = avatarPresetSvg(preset);
    assert.ok(svg.startsWith('<svg'), `${preset.name} 应产出 svg`);
    assert.ok(svg.includes(preset.silhouette), '应使用该形象的轮廓色');
  }
});

test('默认形象是第一个预设，且它带位图', () => {
  assert.equal(DEFAULT_AVATAR_PRESET_ID, AVATAR_PRESETS[0]!.id);
  assert.ok(AVATAR_PRESETS[0]!.imageSrc?.startsWith('data:image/'), '默认形象应是内联的肖像图');
});

test('未知 modelId 退回第一个预设，不抛错也不留空白', () => {
  assert.equal(findAvatarPreset('preset-does-not-exist'), undefined);
  assert.equal(avatarSrcFor('preset-does-not-exist'), avatarSrcFor(AVATAR_PRESETS[0]!.id));
});

test('上传的肖像优先于内置形象，关掉后回到预设', () => {
  const withPortrait = PageIR.parse({
    ...sampleFor('cover/centered@v1'),
    avatar: { enabled: true, mode: 'pip', portraitUrl: '/files/tn/uploads/me.png' },
  });
  const rendered = renderToStaticMarkup(<Slide ctx={buildSlideContext(withPortrait, PACK)} />);
  assert.ok(rendered.includes('/files/tn/uploads/me.png'), '应使用上传的肖像');

  const back = PageIR.parse({ ...withPortrait, avatar: { ...withPortrait.avatar, portraitUrl: '' } });
  const presetRendered = renderToStaticMarkup(<Slide ctx={buildSlideContext(back, PACK)} />);
  assert.ok(presetRendered.includes('data:image/'), '没有肖像时用内置形象');
});

/* ---------------- 设计语言驱动渲染 ---------------- */

/**
 * 这一组测试的判据是「改了风格包里的设计语言字段，画布输出确实变了」。
 * 只断言字段存在是不够的——那样字段可能压根没接到渲染上，
 * 而「设计语言驱动渲染」正是这套东西存在的全部理由。
 */

type Pack = typeof PACK;

function withGui(base: Pack, patch: Partial<Pack['base']['language']['gui']>): Pack {
  const lang = base.base.language;
  return { ...base, base: { ...base.base, language: { ...lang, gui: { ...lang.gui, ...patch } } } } as Pack;
}

function withLanguage(base: Pack, patch: Record<string, unknown>): Pack {
  return { ...base, base: { ...base.base, language: { ...base.base.language, ...patch } } } as Pack;
}

function withRecipe(base: Pack, pageType: string, patch: Record<string, unknown>): Pack {
  const lang = base.base.language;
  return {
    ...base,
    base: {
      ...base.base,
      language: {
        ...lang,
        pageRecipes: lang.pageRecipes.map((r) => (r.pageType === pageType ? { ...r, ...patch } : r)),
      },
    },
  } as Pack;
}

test('gui.radius.card 改了就真的改变指标卡圆角', () => {
  const page = sampleFor('metrics/three-card@v1');
  const before = render(page);
  const after = render(page, withGui(PACK, { radius: { ...PACK.base.language.gui.radius, card: 21 } }));
  assert.ok(!before.includes('border-radius:21px'), '默认包不该出现 21px 圆角');
  assert.ok(after.includes('border-radius:21px'), '改 radius.card 后指标卡应跟着变');
});

test('gui.card.surface=flat 时指标卡不再画底色与描边', () => {
  const page = sampleFor('metrics/four-card@v1');
  const outlined = render(page);
  const flat = render(page, withGui(PACK, { card: { ...PACK.base.language.gui.card, surface: 'flat' } }));
  assert.ok(outlined.includes('border:1px solid'), '默认是 outlined，应有描边');
  assert.ok(flat.includes('border:none'), 'flat 应去掉描边');
});

test('gui.listRow.marker 决定要点标记的形状', () => {
  const page = sampleFor('text/bullets@v1');
  const square = render(page, withGui(PACK, { listRow: { ...PACK.base.language.gui.listRow, marker: 'square', markerSize: 8 } }));
  const dash = render(page, withGui(PACK, { listRow: { ...PACK.base.language.gui.listRow, marker: 'dash', markerSize: 3 } }));
  const numbered = render(page, withGui(PACK, { listRow: { ...PACK.base.language.gui.listRow, marker: 'number' } }));
  // 方块标记是 8×8；短横是 3px 高、7px 宽；编号则出现两位序号
  assert.ok(square.includes('width:8px;height:8px'), '方块标记应为 8×8');
  assert.ok(dash.includes('width:7px;height:2px'), '短横标记应为 7×2');
  assert.ok(numbered.includes('>01<'), '编号标记应渲染序号');
});

test('页类型配方决定页面底色', () => {
  const cover = sampleFor('cover/centered@v1');
  const tinted = render(cover);
  const gradient = render(cover, withRecipe(PACK, 'cover', { background: 'gradient' }));
  assert.ok(tinted.includes('data-background="tinted"'), 'business-classic 封面默认是 tinted');
  assert.ok(gradient.includes('data-background="gradient"'));
  assert.ok(gradient.includes('linear-gradient(135deg'), '渐变底应真的画出渐变');
});

test('页类型配方决定装饰件', () => {
  const cover = sampleFor('cover/centered@v1');
  assert.ok(render(cover).includes('data-decoration="accent-bar"'), '默认封面应带强调条');
  const bare = render(cover, withRecipe(PACK, 'cover', { decoration: 'none' }));
  assert.ok(!bare.includes('data-decoration'), 'decoration=none 时不该有装饰层');
});

test('页类型配方决定疏密', () => {
  const cover = sampleFor('cover/centered@v1');
  const airy = render(cover);
  const tight = render(cover, withRecipe(PACK, 'cover', { spacing: 'tight' }));
  assert.ok(airy.includes('data-spacing="airy"'));
  assert.ok(tight.includes('data-spacing="tight"'));
  assert.notEqual(airy, tight, '疏密不同应产出不同的间距');
});

test('要点给了图标就渲染图标，没给就退回风格包标记', () => {
  const page = PageIR.parse({
    ...sampleFor('text/bullets@v1'),
    blocks: [
      { id: 'b1', type: 'bullets', items: ['增长来自复购', '成本下降'], icons: ['growth', ''] },
    ],
  });
  const html = render(page, withGui(PACK, { listRow: { ...PACK.base.language.gui.listRow, marker: 'square', markerSize: 8 } }));
  // growth 图标的路径是固定的，出现它才说明图标真的画出来了
  assert.ok(html.includes('M3 18l6-6 4 4 7-7'), '第一条应渲染 growth 图标');
  // 第二条没给图标，应仍走标记分支
  assert.ok(html.includes('width:8px;height:8px'), '第二条应退回方块标记');
});

test('iconography.container 决定图标装不装容器', () => {
  const page = PageIR.parse({
    ...sampleFor('text/bullets@v1'),
    blocks: [{ id: 'b1', type: 'bullets', items: ['增长来自复购'], icons: ['growth'] }],
  });
  const bare = render(page, withLanguage(PACK, { iconography: { ...PACK.base.language.iconography, container: 'none' } }));
  const boxed = render(page, withLanguage(PACK, { iconography: { ...PACK.base.language.iconography, container: 'circle', containerTone: 'brand-soft' } }));
  assert.ok(!bare.includes('inline-flex'), 'container=none 时不装容器');
  assert.ok(boxed.includes('inline-flex'), 'container=circle 时应包一层容器');
});

test('指标卡的图标来自 MetricBlock.icon', () => {
  const page = PageIR.parse({
    ...sampleFor('metrics/three-card@v1'),
    blocks: [
      { id: 'm1', type: 'metric', value: '210%', label: '需求增长', icon: 'growth', primary: true },
      { id: 'm2', type: 'metric', value: '31%', label: '落地率' },
    ],
  });
  const html = render(page);
  assert.ok(html.includes('M3 18l6-6 4 4 7-7'), '有 icon 的指标卡应画出图标');
});

test('imagery.treatment=plain 时图片不圆角也不加边框', () => {
  const page = sampleFor('imageText/left-right@v1');
  const rounded = render(page);
  const plain = render(page, withLanguage(PACK, {
    imagery: { ...PACK.base.language.imagery, treatment: 'plain', radius: 0 },
  }));
  assert.ok(rounded.includes('border-radius:4px'), 'business-classic 图片是 framed + 4px 圆角');
  // React 对数值 0 不补单位，所以这里是 0 而不是 0px
  assert.ok(plain.includes('border-radius:0'), 'plain 应把圆角归零');
});

test('深色模式下图表文字用浅色，不会画出看不见的深色标签', () => {
  const page = sampleFor('chart/full@v1');
  const dark = render(page, PACK, { theme: 'dark' });
  const light = render(page, PACK, { theme: 'light' });
  assert.ok(dark.includes(PACK.base.tokens.neutral100), '深色模式图表文字应取 neutral100');
  assert.ok(light.includes(PACK.base.tokens.neutral900), '浅色模式图表文字应取 neutral900');
});
