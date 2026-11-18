import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOM_LAYOUT_PREFIX, builtinLayoutsOf, checkLayoutSkeleton, customLayoutId, forcedLayoutBlock,
  isCustomLayoutId, isValidLayoutGroup, layoutGroupsOf, layoutsForPageType, moduleOfLayoutId,
  moduleOfPageType, type StudioLayout,
} from './studio-layouts.js';
import { imageSlotNumbers } from './html-doc.js';
import { PEOPLE_LAYOUTS } from './people-layouts.js';
import { IMAGE_LAYOUTS } from './image-layouts.js';

/** 一份最小的合规骨架：有 style 块、有根 div、图位从 1 连续、只用变量 */
const OK_SKELETON = [
  '<style>.s{width:1920px;height:1080px;background:var(--bg)}</style>',
  '<div class="s">',
  '<img data-lumen-image="1" data-lumen-cutout="1">',
  '<img data-lumen-image="2">',
  '<img data-lumen-image="3">',
  '<img data-lumen-image="4">',
  '</div>',
].join('');

test('builtinLayoutsOf 把两个内置库原样转成同一形状，条数与分组都不丢', () => {
  const people = builtinLayoutsOf('people-layouts');
  assert.equal(people.length, PEOPLE_LAYOUTS.length, '人物排版转丢了条目');
  const gallery = builtinLayoutsOf('image-layouts');
  assert.equal(gallery.length, IMAGE_LAYOUTS.length, '多图排版转丢了条目');

  // 逐字段对一遍，而不是只看条数：转换里漏掉 slots 或 group 都只有逐条比才看得出来
  for (const [i, l] of people.entries()) {
    const src = PEOPLE_LAYOUTS[i]!;
    assert.equal(l.id, src.id);
    assert.equal(l.name, src.name);
    assert.equal(l.brief, src.brief);
    assert.equal(l.group, src.group);
    assert.equal(l.skeleton, src.skeleton);
    assert.equal(l.source, 'builtin');
    assert.equal(l.slots, undefined, '人物排版的量是人数，不该有 slots');
  }
  for (const [i, l] of gallery.entries()) {
    const src = IMAGE_LAYOUTS[i]!;
    assert.equal(l.id, src.id);
    assert.equal(l.slots, src.slots, `${l.id} 的 slots 没转过来`);
    assert.equal(l.source, 'builtin');
  }
});

test('内置骨架的 id 两两不撞，且都认得出模块', () => {
  const all = [
    ...builtinLayoutsOf('people-layouts'),
    ...builtinLayoutsOf('image-layouts'),
    ...builtinLayoutsOf('chart-layouts'),
    ...builtinLayoutsOf('ui-layouts'),
    ...builtinLayoutsOf('architecture-layouts'),
  ];
  assert.equal(new Set(all.map((l) => l.id)).size, all.length, '内置 id 撞了');
  for (const l of all) {
    assert.ok(moduleOfLayoutId(l.id), `${l.id} 反推不出模块`);
    assert.equal(isCustomLayoutId(l.id), false, `${l.id} 被当成了自建`);
  }
});

test('layoutGroupsOf 的顺序与中文名来自各自的常量，且能被 isValidLayoutGroup 认', () => {
  const people = layoutGroupsOf('people-layouts');
  assert.deepEqual(people.map((g) => g.key), ['solo', 'multi']);
  const gallery = layoutGroupsOf('image-layouts');
  assert.deepEqual(gallery.map((g) => g.key), ['feature', 'multi']);
  const chart = layoutGroupsOf('chart-layouts');
  assert.deepEqual(chart.map((g) => g.key), ['compare', 'distribution', 'trend', 'composition', 'flow']);
  const architecture = layoutGroupsOf('architecture-layouts');
  assert.deepEqual(architecture.map((g) => g.key), ['layer', 'matrix', 'radial', 'flow', 'frame']);
  for (const g of [...people, ...gallery, ...chart, ...architecture]) assert.ok(g.label.length > 0, `${g.key} 缺中文名`);

  assert.equal(isValidLayoutGroup('people-layouts', 'multi'), true);
  // 分组名跨库不通用：solo 是人物排版的，图文排版里没有
  assert.equal(isValidLayoutGroup('people-layouts', 'feature'), false);
  assert.equal(isValidLayoutGroup('image-layouts', 'feature'), true);
  assert.equal(isValidLayoutGroup('image-layouts', '不存在的分组'), false);
  assert.equal(isValidLayoutGroup('chart-layouts', 'trend'), true);
  assert.equal(isValidLayoutGroup('chart-layouts', 'feature'), false);
  assert.equal(isValidLayoutGroup('architecture-layouts', 'radial'), true);
  assert.equal(isValidLayoutGroup('architecture-layouts', 'solo'), false);
});

test('moduleOfPageType：人物页、图文页/图片排版页、图表页各认各的，其余回 null', () => {
  assert.equal(moduleOfPageType('people'), 'people-layouts');
  assert.equal(moduleOfPageType('gallery'), 'image-layouts');
  /*
    **`imageText`（图文页）必须也认到 image-layouts。**
    大纲生成时模型给「图文页」写的就是 `imageText`，而版式库当初只挂在 `gallery` 上——
    于是项目里几乎每一页图文页都拿不到「换排版」的入口，界面上只是按钮不出现，
    看不出是漏了一条配置。
  */
  assert.equal(moduleOfPageType('imageText'), 'image-layouts');
  // 图表页以前也回 null（那时它一份骨架都没有，模型只能自由发挥画 CSS 方块）
  assert.equal(moduleOfPageType('chart'), 'chart-layouts');
  // 架构页接上架构排版（以前回 null，模型只能自由发挥画方块）
  assert.equal(moduleOfPageType('architecture'), 'architecture-layouts');
  // 其余七个页类型没有版式库——工作台靠这个决定要不要给「换排版」入口
  for (const t of ['cover', 'toc', 'section', 'text', 'mindMap', 'metrics', 'end']) {
    assert.equal(moduleOfPageType(t), null, `${t} 不该有版式库`);
  }
});

test('layoutsForPageType：图文页只给图位 ≤2，图片排版页只给 ≥2，人物页不过滤', () => {
  const image = builtinLayoutsOf('image-layouts');
  const text = layoutsForPageType('image-layouts', 'imageText', image);
  const gallery = layoutsForPageType('image-layouts', 'gallery', image);

  assert.ok(text.length > 0 && gallery.length > 0);
  for (const l of text) assert.ok((l.slots ?? 0) <= 2, `${l.id} 有 ${l.slots} 个图位，图文页不该挑到它`);
  for (const l of gallery) assert.ok((l.slots ?? 0) >= 2, `${l.id} 只有 ${l.slots} 个图位，图片排版页不该挑到它`);

  // 一个图位的那些是图文页专属，两张的那几份两边都在——两张图的版面按内容定
  assert.ok(text.some((l) => l.slots === 1), '图文页该拿到一个图位的那批');
  assert.equal(gallery.some((l) => l.slots === 1), false, '图片排版页不该拿到一个图位的');
  for (const l of text.filter((x) => x.slots === 2)) {
    assert.ok(gallery.some((g) => g.id === l.id), `${l.id} 只有两个图位，图片排版页也该能挑`);
  }

  // 人物排版决定版式的量是人数，骨架里没有 slots——一条都不该被过滤掉
  const people = builtinLayoutsOf('people-layouts');
  assert.equal(layoutsForPageType('people-layouts', 'people', people).length, people.length);
});

test('自建 id 带 custom- 前缀，连点两次不撞，且与内置分得开', () => {
  const a = customLayoutId('people-layouts', 1_700_000_000_000);
  const b = customLayoutId('people-layouts', 1_700_000_000_000);
  assert.notEqual(a, b, '同一毫秒生成的两次撞了');
  assert.ok(a.startsWith(`people/${CUSTOM_LAYOUT_PREFIX}`), a);
  assert.ok(isCustomLayoutId(a));
  assert.equal(moduleOfLayoutId(a), 'people-layouts');
  assert.equal(moduleOfLayoutId(customLayoutId('image-layouts')), 'image-layouts');

  // 与内置命名空间永不重叠，是「合并展示时不撞 id」的前提
  const builtin = new Set(builtinLayoutsOf('people-layouts').map((l) => l.id));
  for (let i = 0; i < 200; i += 1) assert.equal(builtin.has(customLayoutId('people-layouts')), false);
});

test('imageSlotNumbers 按数值升序，不是按出现顺序', () => {
  assert.deepEqual(imageSlotNumbers('<img data-lumen-image="3"><img data-lumen-image="1">'), [1, 3]);
  assert.deepEqual(imageSlotNumbers('<div>没有图位</div>'), []);
  // 同一个编号出现两次时不去重——去重是 slots 计数的事，这里只负责把编号读出来
  assert.deepEqual(imageSlotNumbers('<img data-lumen-image="2"><img data-lumen-image="2">'), [2, 2]);
});

test('checkLayoutSkeleton 逐条拦：缺 style、缺根 div、没有图位、编号跳号', () => {
  assert.deepEqual(checkLayoutSkeleton('image-layouts', OK_SKELETON), []);

  assert.ok(checkLayoutSkeleton('image-layouts', '<div class="s">x</div>').some((m) => m.includes('<style>')));
  assert.ok(checkLayoutSkeleton('image-layouts', '<style>.s{}</style>').some((m) => m.includes('根 <div>')));
  assert.ok(
    checkLayoutSkeleton('image-layouts', '<style></style><div>x</div>').some((m) => m.includes('一个图位都没有')),
  );
  // 跳号会把后面的格子挪过来——这是最容易出的错，必须单独拦
  const skipped = '<style></style><div><img data-lumen-image="1"><img data-lumen-image="3"></div>';
  assert.ok(checkLayoutSkeleton('image-layouts', skipped).some((m) => m.includes('连续')));
});

test('checkLayoutSkeleton：图文排版只封顶 12，不设下限；人物排版连上限都不查', () => {
  /*
    **下限不设**：`feature`（图文排版）就是「一张图配一段文字」，图位只有 1 个。
    早先卡过「至少 4 个」，那是只有「多图」一组时的口径，会把图文版式整批判掉。
    两个图位仍然合规矩——它落在 `multi` 那一组。
  */
  const few = '<style></style><div><img data-lumen-image="1"><img data-lumen-image="2"></div>';
  assert.deepEqual(checkLayoutSkeleton('image-layouts', few), []);
  // 只有一个图位同样合规
  const one = '<style></style><div><img data-lumen-image="1"></div>';
  assert.deepEqual(checkLayoutSkeleton('image-layouts', one), []);
  // 同一份骨架放人物排版里也不查张数——人物排版的量是人数，不是图位数
  assert.deepEqual(checkLayoutSkeleton('people-layouts', few), []);

  const many = `<style></style><div>${Array.from({ length: 13 }, (_, i) => `<img data-lumen-image="${i + 1}">`).join('')}</div>`;
  assert.ok(checkLayoutSkeleton('image-layouts', many).some((m) => m.includes('超过 12')));
});

test('forcedLayoutBlock：说清「就这一种」，并且把骨架原样带上', () => {
  const layout: StudioLayout = {
    id: 'gallery/custom-abc-1234@v1', name: '三列等高卡', brief: '三张图等宽并排，下方各一行图注',
    group: 'grid', slots: 3, skeleton: OK_SKELETON, source: 'user',
  };
  const block = forcedLayoutBlock(layout, '图文页');
  assert.ok(block.includes('三列等高卡'), '没带名字');
  assert.ok(block.includes('三张图等宽并排'), '没带说明');
  assert.ok(block.includes(OK_SKELETON), '骨架没原样带进去');
  assert.ok(block.includes('不要另挑'), '没把「别挑」说明白——模型会照候选那套自己再选一轮');
  assert.ok(block.includes('这一页是图文页'), block.slice(0, 40));
  // 这两句是骨架能用的前提，候选块里也有，不能漏
  assert.ok(block.includes('示例'));
  assert.ok(block.includes('CSS 变量'));
});

test('forcedLayoutBlock 的页类型按调用方说的写，不按版式所属的模块猜', () => {
  /*
    同一份 `gallery/…` 骨架，套在图文页上与套在图片排版页上，说法必须不同。
    按模块猜的话两份都会写成「图片排版页」——而页类型叫错会直接影响模型怎么取舍内容
    （图文页以文字为主、图片排版页以图为主）。
  */
  const layout: StudioLayout = {
    id: 'gallery/custom-abc-1234@v1', name: '三列等高卡', brief: '三张图等宽并排，下方各一行图注',
    group: 'multi', slots: 3, skeleton: OK_SKELETON, source: 'user',
  };
  assert.ok(forcedLayoutBlock(layout, '图文页').includes('这一页是图文页'));
  assert.ok(forcedLayoutBlock(layout, '图片排版页').includes('这一页是图片排版页'));
});
