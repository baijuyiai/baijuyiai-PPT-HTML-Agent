import assert from 'node:assert/strict';
import test from 'node:test';
import { setHiddenLayoutIds } from './hidden-layouts.js';
import {
  IMAGE_GROUP_ORDER, IMAGE_LAYOUTS, IMAGE_SLOT_RANGE, estimateImageCount, imageGroupLabel, imageGroupOf,
  imageLayoutBlock, imageLayoutCandidates,
} from './image-layouts.js';
import { builtinLayoutsOf } from './studio-layouts.js';

test('估张数：阿拉伯数字与中文数词都认', () => {
  assert.equal(estimateImageCount('六张产品图排成两行', []), 6);
  assert.equal(estimateImageCount('12 张照片铺满整页', []), 12);
  assert.equal(estimateImageCount('十张图', []), 10);
  assert.equal(estimateImageCount('十二张图', []), 12);
  assert.equal(estimateImageCount('二十张图', []), 20);
  assert.equal(estimateImageCount('二十三幅照片', []), 23);
});

test('估张数：visualForm 抓不到时退回要点条数，都没有回 null', () => {
  assert.equal(estimateImageCount('左侧主图右侧说明', ['a', 'b', 'c']), 3);
  // 回 null 而不是 0——「估不出来」与「确实没有图」是两件事
  assert.equal(estimateImageCount('左侧主图右侧说明', []), null);
});

test('估张数：量词不是 张/幅/格/个 时不算数', () => {
  // 「三大优势」不是图片张数。没有量词就退回要点条数，而不是把 3 当成张数
  assert.equal(estimateImageCount('左侧列出三大优势', ['a']), 1);
});

test('骨架库的 id 唯一，两组都非空，且两组按图位张数分得干干净净', () => {
  assert.ok(IMAGE_LAYOUTS.length > 0);
  assert.equal(new Set(IMAGE_LAYOUTS.map((l) => l.id)).size, IMAGE_LAYOUTS.length, 'id 撞了');
  const counts = IMAGE_GROUP_ORDER.map((g) => IMAGE_LAYOUTS.filter((l) => l.group === g).length);
  for (const [i, g] of IMAGE_GROUP_ORDER.entries()) {
    assert.ok(counts[i]! > 0, `「${g}」一份都没有——候选池按组取，空组会让那段提示词整个被抽掉`);
    assert.ok(imageGroupLabel(g).length > 0, `${g} 缺中文名`);
  }
  /*
    分组的判据只有图位张数这一条，所以两组必须正好落在 1 与 ≥2 上。
    混进一份「feature 但两个图位」的，生成时按一张图选它、实际要填两张。
  */
  for (const l of IMAGE_LAYOUTS) {
    assert.equal(l.group, imageGroupOf(l.slots), `${l.id} 的 group 与图位张数对不上`);
  }
});

test('imageGroupOf：一个图位是图文，两个及以上是多图', () => {
  assert.equal(imageGroupOf(0), 'feature');
  assert.equal(imageGroupOf(1), 'feature');
  assert.equal(imageGroupOf(2), 'multi');
  assert.equal(imageGroupOf(12), 'multi');
});

test('slots 等于骨架里实际的图位数，且都在 1–12 之间', () => {
  for (const l of IMAGE_LAYOUTS) {
    const ns = [...l.skeleton.matchAll(/data-lumen-image\s*=\s*["']?(\d+)/gi)].map((m) => Number(m[1]));
    assert.equal(new Set(ns).size, l.slots, `${l.id} 的 slots 写的是 ${l.slots}，骨架里是 ${new Set(ns).size}`);
    // 下限是 1（图文排版就是「一张图配一段文字」），上限 12 是素材池定的：
    // 普通池按明暗硬筛，深色风格单页只拿得到 13 张
    assert.ok(l.slots >= 1 && l.slots <= 12, `${l.id} 的 slots=${l.slots} 越界（1–12）`);
  }
});

test('骨架的图位编号从 1 起连续', () => {
  for (const l of IMAGE_LAYOUTS) {
    const ns = [...new Set(
      [...l.skeleton.matchAll(/data-lumen-image\s*=\s*["']?(\d+)/gi)].map((m) => Number(m[1])),
    )].sort((a, b) => a - b);
    assert.deepEqual(
      ns, Array.from({ length: ns.length }, (_, i) => i + 1),
      `${l.id} 的图位编号不连续，fillImageSlots 会漏格`,
    );
  }
});

test('图位不写 cutout 标记、不写 src——这些是普通照片，走普通池', () => {
  for (const l of IMAGE_LAYOUTS) {
    const imgs = [...l.skeleton.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]!);
    assert.ok(imgs.length > 0, `${l.id} 没有 <img>`);
    for (const tag of imgs) {
      assert.ok(
        !/data-lumen-cutout/i.test(tag),
        `${l.id} 的图位标了抠图，会从人物池取人像：${tag.slice(0, 80)}`,
      );
      assert.ok(!/\bsrc\s*=/i.test(tag), `${l.id} 的图位写了 src，填图时会被盖掉：${tag.slice(0, 80)}`);
    }
  }
});

test('骨架是片段，且不写死色值', () => {
  for (const l of IMAGE_LAYOUTS) {
    assert.ok(l.skeleton.includes('<style>'), `${l.id} 没有 <style>`);
    assert.ok(!/<!DOCTYPE|<html|<body/i.test(l.skeleton), `${l.id} 是完整文档，该是片段`);
    assert.ok(/width:\s*1920px/.test(l.skeleton), `${l.id} 没定画布宽（画布是 1920×1080）`);
    // 抠掉变量定义之后不该还有 hex
    const body = l.skeleton.replace(/--[a-z-]+\s*:\s*#[0-9a-f]{3,8}/gi, '');
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(body), `${l.id} 里有写死的色值，换风格不会跟着变`);
  }
});

test('候选：一张图走图文那一组', () => {
  const picked = imageLayoutCandidates({ title: '', claim: '', points: [], visualForm: '一张主图配一段说明' });
  assert.ok(picked.length > 0);
  for (const l of picked) assert.equal(l.group, 'feature', `${l.id} 是 ${l.group}，这一页只要一张图`);
});

test('候选：估不出张数时也走多图那一组，且给满 4 个', () => {
  const picked = imageLayoutCandidates({ title: '产品一览', claim: '', points: [], visualForm: '' });
  assert.equal(picked.length, 4);
  for (const l of picked) assert.equal(l.group, 'multi');
});

test('IMAGE_SLOT_RANGE：图文页封顶 ≤2——兜底判据就认这条', () => {
  /*
    `fallbackGroup` 判的是「区间上限 ≤2 就兜到图文组」。上限一旦放宽，
    图文页会静默兜回多图组，而表面上什么都看不出来——所以这条单独钉住。
    弹窗那边的 `layoutsForPageType` 用的是同一张表，两边不会各走各的。
  */
  assert.ok(IMAGE_SLOT_RANGE.imageText!.max <= 2, '图文页的上限放宽了，兜底会静默兜回多图组');
  assert.ok(IMAGE_SLOT_RANGE.gallery!.max > 2, '图片排版页的上限收到 2 以内了，它会兜到图文组');
});

test('候选：图文页估不出张数时兜到图文那一组，不兜到多图', () => {
  /*
    图文页（`imageText`）的定位是「一张图配一段文字」。教案没写张数时估不出，
    这时若兜到多图，提示词会一边说「这一页是图文页」、一边给「九张照片墙」，
    模型只能整段骨架都不用——这一页就和没有版式库时一样。实测踩到过。
  */
  const picked = imageLayoutCandidates(
    { title: '组织与节奏', claim: '组织与节奏', points: [], visualForm: '' },
    'imageText',
  );
  assert.ok(picked.length > 0, '空手了——那段提示词会被整个抽掉');
  for (const l of picked) assert.equal(l.group, 'feature', `${l.id} 有 ${l.slots} 个图位，图文页排不下`);
});

test('候选：估得出张数时按张数走，页类型不参与', () => {
  // 图文页也能用两张图的版面——两张的那几份落在多图组，按张数就该选它们
  const picked = imageLayoutCandidates(
    { title: '', claim: '', points: [], visualForm: '两张图：办公室／交付现场' },
    'imageText',
  );
  assert.ok(picked.length > 0);
  assert.equal(picked[0]!.slots, 2, '最接近两张的那份该排在最前');
  assert.ok(picked.some((l) => l.group === 'multi'), '两张图该走多图那一组');
});

test('候选：图片排版页与不传页类型时兜底到多图，行为不变', () => {
  for (const pageType of ['gallery', '']) {
    const picked = imageLayoutCandidates(
      { title: '产品一览', claim: '', points: [], visualForm: '' },
      pageType,
    );
    assert.equal(picked.length, 4, `pageType=「${pageType}」时候选数变了`);
    for (const l of picked) assert.equal(l.group, 'multi', `pageType=「${pageType}」兜错组了`);
  }
});

test('候选：按「图位数离估计张数最近」排序', () => {
  const picked = imageLayoutCandidates({ title: '', claim: '', points: [], visualForm: '六张图排开' });
  assert.ok(picked.length > 0);
  const d = (l: { slots: number }) => Math.abs(l.slots - 6);
  for (let i = 1; i < picked.length; i++) {
    assert.ok(d(picked[i - 1]!) <= d(picked[i]!), '候选没有按与估计张数的距离升序');
  }
});

test('候选：张数比最小版式还小时也不空手', () => {
  const picked = imageLayoutCandidates({ title: '', claim: '', points: [], visualForm: '两张图' });
  assert.ok(picked.length > 0, '空手了——那段提示词会被整个抽掉');
});

test('候选：永不超过 4 个', () => {
  for (const vf of ['', '一张图', '四张图', '十二张图排成网格', '斜切面板错开排布']) {
    const picked = imageLayoutCandidates({ title: '', claim: '', points: [], visualForm: vf });
    assert.ok(picked.length <= 4, `「${vf}」给了 ${picked.length} 个候选`);
  }
});

test('下架的版式不进候选，但仍在 IMAGE_LAYOUTS 里（功能库要列出来供恢复）', () => {
  const victim = IMAGE_LAYOUTS.find((l) => l.group === 'multi')!;
  setHiddenLayoutIds([victim.id]);
  try {
    const picked = imageLayoutCandidates({ title: '', claim: '', points: [], visualForm: '六张图排开' });
    assert.ok(!picked.some((l) => l.id === victim.id), '下架的版式还在候选里');
    assert.ok(IMAGE_LAYOUTS.some((l) => l.id === victim.id), '常量数组不该被下架改动');
    assert.ok(builtinLayoutsOf('image-layouts').find((l) => l.id === victim.id)?.hidden, 'hidden 标志没带上');
  } finally {
    setHiddenLayoutIds([]);
  }
});

test('一组被下架光了就退回全组——宁可多给候选，也不能让候选池空掉', () => {
  const all = IMAGE_LAYOUTS.filter((l) => l.group === 'feature').map((l) => l.id);
  setHiddenLayoutIds(all);
  try {
    const picked = imageLayoutCandidates({ title: '', claim: '', points: [], visualForm: '一张主图' });
    assert.ok(picked.length > 0, '一组下架光之后候选空了');
  } finally {
    setHiddenLayoutIds([]);
  }
});

test('imageLayoutBlock 的页类型名字按调用方说的写，不写死', () => {
  /*
    这个库同时服务「图文页」与「图片排版页」。写死一个的话另一边的提示词会把页类型叫错，
    而页类型叫错会直接影响模型怎么取舍内容（图文页以文字为主、图片排版页以图为主）。
  */
  const picked = imageLayoutCandidates({ title: '', claim: '', points: [], visualForm: '六张图排开' });
  assert.ok(picked.length > 0);

  const asText = imageLayoutBlock(picked, '图文页');
  const asGallery = imageLayoutBlock(picked, '图片排版页');
  assert.ok(asText.includes('这一页是图文页'), asText.slice(0, 40));
  assert.ok(asGallery.includes('这一页是图片排版页'), asGallery.slice(0, 40));
  assert.ok(!asText.includes('图片排版页'), '图文页的那段里不该出现「图片排版页」');

  // 骨架原样带上，且用围栏包着——模型会把围栏里的当成示例而不是正文
  assert.ok(asText.includes(picked[0]!.skeleton), '骨架没原样带进去');
  assert.ok(asText.includes('```html'), '骨架没用围栏包');
});
