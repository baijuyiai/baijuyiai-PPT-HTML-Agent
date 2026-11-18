import test from 'node:test';
import assert from 'node:assert/strict';
import { DIRECTIVES, directiveFor, directiveGuidance } from './directives.js';
import { BUILTIN_STYLE_PACKS } from './builtin/index.js';

/**
 * 创作指令模板。
 *
 * 这几套的价值在于**内容怎么组织**，不是配色好不好看，所以测试盯的是
 * 「规矩写全了没有」「有没有落到风格包上」，而不是文案本身好不好。
 */

const DIRECTIVE_FAMILIES = [
  'swiss-minimal', 'editorial-magazine', 'academic-report', 'consulting-report',
] as const;

test('四套指令模板都在，且四项规矩都写全了', () => {
  for (const id of DIRECTIVE_FAMILIES) {
    const d = DIRECTIVES[id];
    assert.ok(d, `缺指令模板 ${id}`);
    assert.ok(d.label.length > 0, `${id} 缺 label`);
    assert.ok(d.fit.length > 0, `${id} 缺 fit`);
    assert.ok(d.brief.length > 20, `${id} 的核心任务太短，写不出内容要求`);
    assert.ok(d.layoutRules.length > 10, `${id} 缺版式约束`);
    assert.ok(d.colorRules.length > 10, `${id} 缺配色约束`);
    assert.ok(d.avoid.length >= 4, `${id} 的避坑项太少`);
    assert.ok(d.checklist.length >= 5, `${id} 的自检项太少`);
  }
});

test('避坑项里必须包含「不要编造」这条——事实边界是硬要求', () => {
  for (const id of DIRECTIVE_FAMILIES) {
    const all = DIRECTIVES[id]!.avoid.join('');
    assert.ok(all.includes('编造') || all.includes('凑字数'), `${id} 没有卡事实边界`);
  }
});

test('每套指令都有自己独有的一条规矩，不是换个名字的同一份', () => {
  const briefs = DIRECTIVE_FAMILIES.map((id) => DIRECTIVES[id]!.brief);
  assert.equal(new Set(briefs).size, DIRECTIVE_FAMILIES.length, '有两套的核心任务一模一样');
  const rules = DIRECTIVE_FAMILIES.map((id) => DIRECTIVES[id]!.layoutRules);
  assert.equal(new Set(rules).size, DIRECTIVE_FAMILIES.length, '有两套的版式约束一模一样');
});

test('四套指令都挂到了对应的内置风格包上', () => {
  for (const family of DIRECTIVE_FAMILIES) {
    const pack = BUILTIN_STYLE_PACKS.find((p) => p.family === family);
    assert.ok(pack, `内置族里没有 ${family}`);
    const g = pack.base.language.guidance;
    assert.equal(g.brief, DIRECTIVES[family]!.brief, `${family} 的核心任务没落到包上`);
    assert.deepEqual(g.avoid, DIRECTIVES[family]!.avoid, `${family} 的避坑项没落到包上`);
    assert.deepEqual(g.checklist, DIRECTIVES[family]!.checklist, `${family} 的自检项没落到包上`);
  }
});

test('没有指令模板的族不硬凑：返回空对象，界面上不显示那一块', () => {
  assert.equal(directiveFor('business-classic'), undefined);
  assert.deepEqual(directiveGuidance('business-classic'), {});
  assert.deepEqual(BUILTIN_STYLE_PACKS.find((p) => p.family === 'business-classic')!.base.language.guidance.avoid, []);
});

test('前五个内置族的逐页说明仍然齐全——加指令层不该把它们冲掉', () => {
  for (const pack of BUILTIN_STYLE_PACKS) {
    const g = pack.base.language.guidance;
    for (const key of ['cover', 'section', 'toc', 'text', 'imageText', 'chart', 'metrics', 'end'] as const) {
      assert.ok(g[key].length > 0, `${pack.styleId} 缺 ${key} 的说明`);
    }
  }
});
