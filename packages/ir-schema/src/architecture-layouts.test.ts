import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ARCHITECTURE_GROUP_ORDER, ARCHITECTURE_LAYOUTS,
  architectureGroupLabel, architectureLayoutBlock, architectureLayoutCandidates,
  estimateArchitectureGroup,
} from './architecture-layouts.js';
import { builtinLayoutsOf, checkLayoutSkeleton, moduleOfLayoutId, moduleOfPageType } from './studio-layouts.js';

/**
 * 架构排版的骨架库。
 *
 * 这一份的骨架是**生成文件**（`scripts/recognize-architecture-layouts.ts --emit` 写的），
 * 所以这里断言的是「生成出来的东西是不是一份能用的骨架」，而不是某一份具体排法：
 * 版式好不好看归渲染抽查，代码这边只钉死那些**坏了就静默出问题**的性质。
 */

test('内置骨架：数量在 15–25 份之间', () => {
  /*
    下限是「有参考图没认出来」的信号，上限是「该回去精挑」的信号。
    两份都不该悄悄越界：少了说明识别漏了图，多了说明把缩略图 / 说明卡也当成版式收了。
  */
  assert.ok(ARCHITECTURE_LAYOUTS.length >= 15, `只有 ${ARCHITECTURE_LAYOUTS.length} 份，低于 15`);
  assert.ok(ARCHITECTURE_LAYOUTS.length <= 25, `有 ${ARCHITECTURE_LAYOUTS.length} 份，超过 25`);
});

test('id 形如 arch/<slug>@v1，两两不撞，且反推得出模块', () => {
  const ids = ARCHITECTURE_LAYOUTS.map((l) => l.id);
  for (const id of ids) {
    assert.match(id, /^arch\/[a-z0-9-]+@v1$/, `${id} 不合命名`);
    assert.equal(moduleOfLayoutId(id), 'architecture-layouts', `${id} 反推不出模块`);
  }
  assert.equal(new Set(ids).size, ids.length, 'id 撞了');
});

test('五组都非空——空组会让那一类结构整批拿不到候选', () => {
  for (const g of ARCHITECTURE_GROUP_ORDER) {
    const n = ARCHITECTURE_LAYOUTS.filter((l) => l.group === g).length;
    assert.ok(n > 0, `「${g}」一份都没有`);
    assert.ok(architectureGroupLabel(g).length > 0, `${g} 缺中文名`);
  }
});

test('每份骨架：1920×1080 单屏、相对定位、不占图位、不写死色值', () => {
  for (const l of ARCHITECTURE_LAYOUTS) {
    const s = l.skeleton;
    assert.match(s, /<style[\s>]/i, `${l.id} 没有 <style>`);
    assert.match(s, /width:1920px/, `${l.id} 没写画布宽`);
    assert.match(s, /height:1080px/, `${l.id} 没写画布高`);
    assert.match(s, /position:relative/, `${l.id} 根 div 不是相对定位`);
    /*
      **架构图不占图位。** 标了 `data-lumen-image` 的骨架会被配图流程当成「这里要放一张照片」，
      而架构页不配照片——图会填进方块里，整张图就废了。
    */
    assert.ok(!/data-lumen-image/i.test(s), `${l.id} 写了 data-lumen-image`);
    assert.ok(!/<img|<svg|<canvas/i.test(s), `${l.id} 里有 <img>/<svg>/<canvas>，连线与图标要用 CSS 画`);
    assert.ok(!/#([0-9a-f]{3}|[0-9a-f]{6})\b/i.test(s), `${l.id} 写死了十六进制色值`);
    assert.ok(!/rgba?\(|hsla?\(/i.test(s), `${l.id} 用了 rgb/hsl，投影要写 color-mix`);
    assert.ok(!/position:\s*fixed/i.test(s), `${l.id} 用了 position:fixed`);
    assert.ok(!/\d+vh\b/i.test(s), `${l.id} 用了 vh 单位`);
    assert.ok(!/<script|@import|<link/i.test(s), `${l.id} 里有脚本或外链`);
    // 字体只能挑三个角色，写具体字体栈换风格不跟着变
    for (const m of s.matchAll(/font-family\s*:\s*([^;"}]+)/gi)) {
      assert.match(m[1]!.trim(), /^var\(--font-(sans|display|script)\)/, `${l.id} 的 font-family 不是 var(--font-*)：${m[1]}`);
    }
  }
});

test('每份骨架至少两个 data-lumen-arch-node——那是「哪些块会被换掉」的唯一线索', () => {
  for (const l of ARCHITECTURE_LAYOUTS) {
    const n = (l.skeleton.match(/data-lumen-arch-node/gi) ?? []).length;
    assert.ok(n >= 2, `${l.id} 只标了 ${n} 个可替换块`);
  }
});

test('checkLayoutSkeleton：架构骨架不因「没有图位」被判死（必须走 early-return）', () => {
  /*
    **这条是加架构模块最容易踩的坑。** 默认那条查的是「至少一个 `data-lumen-image` 图位」，
    架构图一个都没有——不早退的话每一份都会被判成不合规，而症状是「识别出来的骨架一份都存不进去」。
  */
  const ok = ARCHITECTURE_LAYOUTS[0]!.skeleton;
  assert.deepEqual(checkLayoutSkeleton('architecture-layouts', ok), []);
  // 反过来说：一份只有两个方块、没标可替换块的「骨架」要被拦下
  const thin = '<div style="width:1920px;height:1080px;position:relative"><style>.a{color:var(--text)}</style><div class="a">模块</div><div class="a">模块</div></div>';
  assert.ok(checkLayoutSkeleton('architecture-layouts', thin).length > 0, '没标 arch-node 的也该被拦');
});

test('按教案的文字认结构，认不出兜分层', () => {
  assert.equal(estimateArchitectureGroup('分四层，自下而上是基础设施到应用'), 'layer');
  assert.equal(estimateArchitectureGroup('中心是数据中台，向外辐射六个能力'), 'radial');
  assert.equal(estimateArchitectureGroup('按采集到入库的流程画成一条链路'), 'flow');
  assert.equal(estimateArchitectureGroup('做成信息屋：顶棚是业务目标，柱子是支撑能力'), 'frame');
  assert.equal(estimateArchitectureGroup('页面切成并列的六个模块'), 'matrix');
  assert.equal(estimateArchitectureGroup('随便写点什么'), null);
});

test('候选：非空、最多三个、同组的页按内容转开', () => {
  const a = architectureLayoutCandidates({ visualForm: '分四层', points: ['每层若干模块'] });
  assert.ok(a.length > 0 && a.length <= 3);
  assert.ok(a.every((l) => l.group === 'layer'), '认到分层就该只给分层');
  // 内容不同时不该永远给同样三份（库里的顺序与页面内容无关）
  const b = architectureLayoutCandidates({ visualForm: '中心辐射', points: ['六个能力'] });
  assert.ok(b.every((l) => l.group === 'radial'));
});

test('候选块：把骨架与「换掉示例内容」那句话都带上', () => {
  const block = architectureLayoutBlock(ARCHITECTURE_LAYOUTS.slice(0, 2), '架构图页');
  assert.ok(block.includes('架构图页'));
  assert.ok(block.includes(ARCHITECTURE_LAYOUTS[0]!.skeleton), '骨架没进提示词');
  assert.ok(block.includes('data-lumen-arch-node'), '没交代哪些块会被换掉');
  assert.ok(block.includes('CSS 变量'), '没交代配色走变量');
});

test('模块映射：架构页认到架构排版，内置骨架列得出来', () => {
  assert.equal(moduleOfPageType('architecture'), 'architecture-layouts');
  const builtin = builtinLayoutsOf('architecture-layouts');
  assert.equal(builtin.length, ARCHITECTURE_LAYOUTS.length);
  assert.ok(builtin.every((l) => l.source === 'builtin' && l.group.length > 0));
});
