import test from 'node:test';
import assert from 'node:assert/strict';
import { StylePack } from '@lumen/ir-schema';
import {
  BUILTIN_STYLE_PACKS, CANONICAL_VARIANT_IDS, lintStylePack, lintAllStylePacks, contrastRatio,
  styleRef, parseStyleRef, packCssVars, cssVarsToStyle, pickTitleTemplate, pickVariant,
  findVariant, variantsForPageType, recommendForAudience, recommendForScene, SCENE_AUDIENCE, buildLayouts,
} from './index.js';
import { classifyPalette, fromHex, toHsl, type ColorBucket } from './palette.js';

test('全部内置风格包通过 StylePack schema', () => {
  // 不写死数量：内置族会增减，写死的话每加一套就要改一次测试
  assert.ok(BUILTIN_STYLE_PACKS.length >= 5, `内置族太少：${BUILTIN_STYLE_PACKS.length}`);
  for (const p of BUILTIN_STYLE_PACKS) {
    const parsed = StylePack.parse(p);
    assert.equal(parsed.meta.builtin, true);
    assert.equal(parsed.base.rules.marginRatio, 0.05);
  }
});

test('全部内置风格包通过设计 Lint，零错误', () => {
  const issues = lintAllStylePacks(BUILTIN_STYLE_PACKS);
  const errors = issues.filter((i) => i.severity === 'error');
  assert.deepEqual(errors, [], `存在 Lint 错误：\n${errors.map((e) => `  ${e.path} ${e.rule} ${e.message}`).join('\n')}`);
});

test('所有风格族实现完全相同的规范版式集合', () => {
  for (const p of BUILTIN_STYLE_PACKS) {
    const ids = new Set(p.base.layouts.map((l) => l.id));
    for (const id of CANONICAL_VARIANT_IDS) {
      assert.ok(ids.has(id), `${p.styleId} 缺少版式 ${id}`);
    }
    assert.equal(ids.size, CANONICAL_VARIANT_IDS.length, `${p.styleId} 版式数量与规范不一致`);
  }
  assert.equal(CANONICAL_VARIANT_IDS.length, 23);
});

test('每个风格族有 8 个标题 composition 模板，id 唯一', () => {
  for (const p of BUILTIN_STYLE_PACKS) {
    const tpls = p.base.titleGrammar.templates;
    assert.ok(tpls.length >= 6 && tpls.length <= 12, `${p.styleId} 模板数量 ${tpls.length} 越界`);
    assert.equal(new Set(tpls.map((t) => t.id)).size, tpls.length, `${p.styleId} 模板 id 重复`);
  }
});

test('风格族之间调性不同但品质基线一致', () => {
  const ids = BUILTIN_STYLE_PACKS.map((p) => p.styleId);
  assert.equal(new Set(ids).size, BUILTIN_STYLE_PACKS.length, 'styleId 必须互不相同');
  for (const p of BUILTIN_STYLE_PACKS) {
    assert.equal(p.base.rules.maxHueFamilies, 4);
    assert.equal(p.base.rules.maxBullets, 5);
    assert.equal(p.base.rules.minFontSize, 12);
    assert.ok(p.base.rules.maxAccentAreaRatio <= 0.10);
  }
  // 主色确实不同，不是同一套配色换名字
  const brandColors = new Set(BUILTIN_STYLE_PACKS.map((p) => p.base.tokens.brand500));
  assert.equal(brandColors.size, BUILTIN_STYLE_PACKS.length, '有风格族共用了同一个主色');
});

test('风格标识 family@version 往返', () => {
  const p = BUILTIN_STYLE_PACKS[0]!;
  const ref = styleRef(p);
  assert.equal(ref, `${p.styleId}@${p.version}`);
  assert.deepEqual(parseStyleRef(ref), { styleId: p.styleId, version: p.version });
  assert.throws(() => parseStyleRef('no-version'));
});

test('CSS 变量覆盖全部色板与字体角色，且与包内真值一致', () => {
  for (const p of BUILTIN_STYLE_PACKS) {
    const vars = packCssVars(p);
    assert.equal(vars['--brand-500'], p.base.tokens.brand500);
    assert.equal(vars['--accent-500'], p.base.tokens.accent500);
    assert.equal(vars['--fs-body'], `${p.base.typography.roles.find((r) => r.role === 'body')!.sizePx}px`);
    assert.ok(vars['--ff-display']!.length > 0);
    const style = cssVarsToStyle(vars);
    assert.match(style, /--brand-500: #[0-9A-Fa-f]{6}/);
  }
});

test('对比度计算符合 WCAG 基准值', () => {
  assert.equal(contrastRatio('#000000', '#FFFFFF'), 21);
  assert.equal(Math.round(contrastRatio('#FFFFFF', '#FFFFFF')!), 1);
  assert.ok(contrastRatio('#767676', '#FFFFFF')! >= 4.5, '中灰对白应达 AA');
  assert.equal(contrastRatio('not-a-color', '#FFFFFF'), null);
});

test('按人群推荐风格：学者优先学术严谨，设计负责人优先品牌设计', () => {
  assert.equal(recommendForAudience('scholar', BUILTIN_STYLE_PACKS)[0]!.family, 'academic-rigor');
  assert.equal(recommendForAudience('brand', BUILTIN_STYLE_PACKS)[0]!.family, 'brand-design');
  assert.equal(recommendForAudience('tech-lead', BUILTIN_STYLE_PACKS)[0]!.family, 'tech-minimal');
  assert.equal(recommendForAudience('executive', BUILTIN_STYLE_PACKS)[0]!.family, 'business-classic');
  // 未知人群回落到通用顺序，不抛错。比的是「全都返回」而不是某个写死的数字——
  // 内置族会增减，写死数字的话每加一套就要改一次测试
  assert.equal(recommendForAudience('general', BUILTIN_STYLE_PACKS).length, BUILTIN_STYLE_PACKS.length);
});

test('按场景推荐：答辩走学术，路演走创始人', () => {
  assert.equal(SCENE_AUDIENCE.defense, 'scholar');
  assert.equal(SCENE_AUDIENCE.pitch, 'founder');
  assert.equal(recommendForScene('defense', BUILTIN_STYLE_PACKS)[0]!.family, 'academic-rigor');
  assert.equal(recommendForScene('brand', BUILTIN_STYLE_PACKS)[0]!.family, 'brand-design');
});

test('标题模板挑选：图上压字优先 overlay，短标题优先居中', () => {
  const pack = BUILTIN_STYLE_PACKS[0]!;
  const overlay = pickTitleTemplate(pack, { mainChars: 10, hasSub: false, hasEyebrow: false, imageLed: true });
  assert.equal(overlay.composition, 'overlay');

  const short = pickTitleTemplate(pack, { mainChars: 8, hasSub: true, hasEyebrow: false, imageLed: false });
  assert.ok(['centered', 'minimal', 'left-aligned'].includes(short.composition));

  const long = pickTitleTemplate(pack, { mainChars: 26, hasSub: true, hasEyebrow: true, imageLed: false });
  assert.ok(['left-aligned', 'stacked', 'split', 'minimal'].includes(long.composition));
});

test('版式挑选：内容量小选小版式，内容量大选能装下的版式', () => {
  const pack = BUILTIN_STYLE_PACKS[0]!;
  const small = pickVariant(pack, 'imageText', { titleChars: 12, bodyChars: 40, blocks: 2, bullets: 1, metrics: 1 });
  const large = pickVariant(pack, 'imageText', { titleChars: 24, bodyChars: 140, blocks: 4, bullets: 3, metrics: 2 });
  assert.ok(small.maxBodyChars <= large.maxBodyChars, '小内容应配到容量更小的版式');

  const charts = variantsForPageType(pack, 'chart');
  assert.ok(charts.length >= 2);
  assert.ok(findVariant(pack, 'chart/full@v1'));
  assert.throws(() => findVariant(pack, 'chart/不存在@v1'), /缺少版式/);
});

test('版式容量随风格疏密画像变化：学术比品牌能装更多正文', () => {
  const academic = BUILTIN_STYLE_PACKS.find((p) => p.styleId === 'academic-rigor')!;
  const brand = BUILTIN_STYLE_PACKS.find((p) => p.styleId === 'brand-design')!;
  const a = findVariant(academic, 'text/one-column@v1');
  const b = findVariant(brand, 'text/one-column@v1');
  assert.ok(a.maxBodyChars > b.maxBodyChars, `学术(${a.maxBodyChars}) 应比品牌(${b.maxBodyChars}) 容纳更多正文`);
});

test('Lint 能抓出违规风格包', () => {
  const bad = structuredClone(BUILTIN_STYLE_PACKS[0]!);
  bad.base.typography.roles[0]!.sizePx = 15; // 不在字阶
  bad.base.rules.maxBullets = 8;
  bad.base.motionWhitelist = [];
  const issues = lintStylePack(bad);
  const rules = issues.map((i) => i.rule);
  assert.ok(rules.includes('type/size-ladder'));
  assert.ok(rules.includes('content/bullets'));
  assert.ok(rules.includes('motion/whitelist-empty'));

  const missing = structuredClone(BUILTIN_STYLE_PACKS[0]!);
  missing.base.layouts = missing.base.layouts.slice(0, 3);
  assert.ok(lintStylePack(missing).some((i) => i.rule === 'layout/missing-variant'));
});

/* ---------------- 识别取色的可用性护栏 ---------------- */

function bucket(hex: string, count: number): ColorBucket {
  return { hex, rgb: fromHex(hex), count };
}

test('浅色底纹不会被当成品牌色：频率高但撑不起强调', () => {
  // 大面积的浅绿底纹 + 少量真正的品牌绿
  const p = classifyPalette([bucket('#DBEBDD', 500), bucket('#1F7A4D', 60), bucket('#FFFFFF', 400)]);
  const hsl = toHsl(fromHex(p.brand500));
  assert.ok(hsl.s >= 0.35, `品牌色饱和度应够用，实际 ${p.brand500}`);
  assert.ok(hsl.l <= 0.72, `品牌色不该浅到发白，实际 ${p.brand500}`);
});

test('源图只有浅色时，品牌色被规整到可用区间', () => {
  const p = classifyPalette([bucket('#E8F0F8', 600), bucket('#DCE8F2', 300)]);
  const hsl = toHsl(fromHex(p.brand500));
  assert.ok(hsl.s >= 0.35 && hsl.l >= 0.30 && hsl.l <= 0.72, `规整后应落在可用区间，实际 ${p.brand500}`);
});

test('正文色与底色始终有对比度底线，源图再浅也不糊', () => {
  // 整张图都很浅：最深的一档也不够当正文色
  const p = classifyPalette([bucket('#F1E8E7', 500), bucket('#A6D3CC', 300), bucket('#FFFFFF', 200)]);
  const ratio = contrastRatio(p.neutral900, p.neutral0);
  assert.ok(ratio !== null && ratio >= 10, `正文与底色对比度应达 AAA，实际 ${ratio}`);
  const soft = contrastRatio(p.neutral700, p.neutral0);
  assert.ok(soft !== null && soft >= 4.5, `次要文字应达 AA，实际 ${soft}`);
});

test('识别出的中性色对齐内置包的对比度水平，不出现 level 参差', () => {
  // 内置五个风格包的正文字色对比度实测都在 16–18；识别结果不能差一个档
  const p = classifyPalette([bucket('#DBEBDD', 500), bucket('#1F7A4D', 60), bucket('#FFFFFF', 400)]);
  const ratio = contrastRatio(p.neutral900, p.neutral0);
  assert.ok(ratio !== null && ratio >= 10, `识别包的正文对比度不应显著低于内置包，实际 ${ratio}`);
  const secondary = contrastRatio(p.neutral700, p.neutral0);
  assert.ok(secondary !== null && secondary >= 6, `次要文字对比度偏低，实际 ${secondary}`);
});

test('源图本身够深够浅时，中性色原样保留，不被无谓改动', () => {
  const p = classifyPalette([bucket('#0F1115', 400), bucket('#FFFFFF', 500)]);
  assert.equal(p.neutral900, '#0F1115');
  assert.equal(p.neutral0, '#FFFFFF');
});

test('品牌浅底保留色相，不会推成纯白', () => {
  const p = classifyPalette([bucket('#6D4AFF', 300), bucket('#FFFFFF', 300)]);
  assert.notEqual(p.brand100, '#FFFFFF', '品牌浅底推成纯白就丢了品牌色相');
  assert.ok(toHsl(fromHex(p.brand100)).s >= 0.25, `浅底应带品牌色相，实际 ${p.brand100}`);
});

/* ---------------- 设计语言 ---------------- */

const PAGE_TYPES = ['cover', 'toc', 'section', 'text', 'imageText', 'gallery', 'people', 'ui', 'chart', 'architecture', 'mindMap', 'metrics', 'end'] as const;
const GUIDANCE_KEYS = ['cover', 'section', 'toc', 'text', 'imageText', 'chart', 'metrics', 'end', 'icon', 'chartUse', 'imageUse'] as const;

test('五个内置包都带完整设计语言：十三种页类型各有配方', () => {
  for (const pack of BUILTIN_STYLE_PACKS) {
    const types = pack.base.language.pageRecipes.map((r) => r.pageType).sort();
    assert.deepEqual(types, [...PAGE_TYPES].sort(), `${pack.styleId} 的页面配方不完整`);
    for (const r of pack.base.language.pageRecipes) {
      assert.ok(r.requiredSlots.length > 0, `${pack.styleId} 的 ${r.pageType} 应声明必需槽位`);
    }
  }
});

test('设计语言的使用说明每一项都写了，且各族措辞不同', () => {
  for (const pack of BUILTIN_STYLE_PACKS) {
    for (const key of GUIDANCE_KEYS) {
      const text = pack.base.language.guidance[key];
      assert.ok(text.length >= 10, `${pack.styleId} 的 guidance.${key} 太短或为空`);
    }
  }
  // 说明文字必须真的因族而异，否则「注入生成提示词」等于没注入
  const covers = BUILTIN_STYLE_PACKS.map((p) => p.base.language.guidance.cover);
  assert.equal(new Set(covers).size, covers.length, '各族的封面说明不应雷同');
});

test('GUI 规格因族而异：圆角、列表标记、分隔线不是同一套', () => {
  const radii = BUILTIN_STYLE_PACKS.map((p) => p.base.language.gui.radius.card);
  assert.ok(new Set(radii).size >= 3, '圆角至少要有三档差异');
  const markers = BUILTIN_STYLE_PACKS.map((p) => p.base.language.gui.listRow.marker);
  assert.ok(new Set(markers).size >= 3, '列表标记至少要有三种');
  const dividers = BUILTIN_STYLE_PACKS.map((p) => p.base.language.gui.divider);
  assert.ok(new Set(dividers).size >= 2, '分隔线至少要有两种');
});

test('图标规范与图表规范因族而异', () => {
  const containers = BUILTIN_STYLE_PACKS.map((p) => p.base.language.iconography.container);
  assert.ok(new Set(containers).size >= 2, '图标容器至少要有两种（裸图标 / 装容器）');
  const palettes = BUILTIN_STYLE_PACKS.map((p) => p.base.language.chart.palette);
  assert.ok(palettes.includes('mono-ramp'), '学术严谨族应走单色系');
  const emphases = BUILTIN_STYLE_PACKS.map((p) => p.base.language.chart.emphasis);
  assert.ok(new Set(emphases).size >= 2, '图表强调方式至少要有两种');
});

test('图片规范的比例来自该族版式里真实出现过的比例', () => {
  for (const pack of BUILTIN_STYLE_PACKS) {
    const aspects = pack.base.language.imagery.aspect;
    assert.ok(aspects.length > 0, `${pack.styleId} 应给出图片比例`);
    const fromLayouts = new Set(pack.base.layouts.flatMap((l) => l.imageRatios));
    for (const a of aspects) {
      assert.ok(fromLayouts.has(a), `${pack.styleId} 的图片比例 ${a} 不在任何版式允许的范围内`);
    }
  }
});

test('老包缺 language 字段也能 parse，缺省值由反推补上', () => {
  const pack = BUILTIN_STYLE_PACKS[0]!;
  const raw = JSON.parse(JSON.stringify(pack)) as Record<string, unknown>;
  const base = raw.base as Record<string, unknown>;
  delete base.language;
  const reparsed = StylePack.parse(raw);
  assert.equal(reparsed.base.language.version, '1.0');
  assert.equal(reparsed.base.language.pageRecipes.length, 0, '缺省时不硬造配方');
  // 但 gui / imagery 这些有独立默认值的块必须有完整结构，渲染层才不会读到 undefined
  assert.equal(typeof reparsed.base.language.gui.radius.card, 'number');
  assert.equal(typeof reparsed.base.language.chart.gridLines, 'boolean');
  assert.ok(Array.isArray(reparsed.base.language.imagery.aspect));
});

test('版式容量能装下品质基线允许的内容量', () => {
  /**
   * 这条不变式是防一类系统性缺陷的：内容引擎按 rules.maxBullets 给要点，
   * 如果版式的 maxBullets 比它小，每一页都会被判「溢出」——白降字号、白拆页。
   * 实测踩过：疏密系数把 maxBullets 压到 3，而引擎给 5 条，
   * 十页的 deck 里六页被降了字号。数量是布局结构，不该随疏密缩放。
   */
  for (const pack of BUILTIN_STYLE_PACKS) {
    const rules = pack.base.rules;
    const textVariants = pack.base.layouts.filter((l) => l.pageType === 'text');
    const best = Math.max(...textVariants.map((l) => l.maxBullets));
    assert.ok(
      best >= rules.maxBullets,
      `${pack.styleId}：正文页最多只能放 ${best} 条要点，但内容引擎会写到 ${rules.maxBullets} 条`,
    );
    const bestMetrics = Math.max(...pack.base.layouts.filter((l) => l.pageType === 'metrics').map((l) => l.maxMetrics));
    assert.ok(bestMetrics >= 1, `${pack.styleId} 至少要有一个能放指标的指标版式`);
  }
});

test('疏密只影响字数，不影响槽位数量', () => {
  const a = buildLayouts({ titleChars: 24, bodyChars: 220, density: 1 });
  const b = buildLayouts({ titleChars: 24, bodyChars: 220, density: 1.6 });
  const byId = (list: typeof a) => new Map(list.map((l) => [l.id, l]));
  const A = byId(a);
  const B = byId(b);
  for (const id of A.keys()) {
    assert.equal(A.get(id)!.maxBlocks, B.get(id)!.maxBlocks, `${id} 的块数不该随疏密变`);
    assert.equal(A.get(id)!.maxBullets, B.get(id)!.maxBullets, `${id} 的要点数不该随疏密变`);
    assert.equal(A.get(id)!.maxMetrics, B.get(id)!.maxMetrics, `${id} 的指标数不该随疏密变`);
  }
  // 但字数必须跟着变，否则疏密这个参数就没意义了
  assert.ok(A.get('text/one-column@v1')!.maxBodyChars > B.get('text/one-column@v1')!.maxBodyChars);
});

test('声明 0 个槽位的版式就是 0，不会被抬成 1', () => {
  // 封面的骨架值是 metrics: 0 / bullets: 0，抬成 1 会让样机里凭空多出指标卡
  const layouts = buildLayouts({ titleChars: 24, bodyChars: 220, density: 1 });
  const cover = layouts.find((l) => l.id === 'cover/centered@v1')!;
  assert.equal(cover.maxMetrics, 0, '封面不该有指标槽位');
  assert.equal(cover.maxBullets, 0, '封面不该有要点槽位');

  const section = layouts.find((l) => l.id === 'section/minimal@v1')!;
  assert.equal(section.maxBullets, 0);
  assert.equal(section.maxMetrics, 0);

  // 有槽位的仍然照常
  const metrics3 = layouts.find((l) => l.id === 'metrics/three-card@v1')!;
  assert.equal(metrics3.maxMetrics, 3);
});
