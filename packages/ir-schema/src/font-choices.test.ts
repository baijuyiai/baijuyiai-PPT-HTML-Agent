import test from 'node:test';
import assert from 'node:assert/strict';
import { FONT_CHOICES, fontIdOfStack, fontLabelOf, fontStackOf } from './font-choices.js';

/**
 * 字体清单是**界面选择器与渲染层共用的那一份**。这里钉三件事：
 * 每个 id 都认得出、反查不会认错、认不出时不瞎猜。
 */

test('每个候选都能从自己的栈反查回自己', () => {
  for (const f of FONT_CHOICES) {
    assert.equal(fontIdOfStack(fontStackOf(f.id)), f.id, `${f.id} 反查不到自己`);
  }
});

test('反查按清单顺序比主字体名，不会被兜底那一段带偏', () => {
  // Montserrat 的栈里也有 system-ui（中文与系统回落），先比它会认成「系统无衬线」
  const montserrat = fontStackOf('montserrat');
  assert.ok(montserrat.includes('system-ui'), '这条前提变了的话，下面那句就没意义了');
  assert.equal(fontIdOfStack(montserrat), 'montserrat');
  assert.equal(fontIdOfStack(fontStackOf('system-sans')), 'system-sans');
});

test('认不出的栈回空串，不瞎猜一个', () => {
  assert.equal(fontIdOfStack('"Some Custom Face", serif'), '');
  assert.equal(fontIdOfStack(''), '');
  assert.equal(fontIdOfStack(null), '');
  assert.equal(fontIdOfStack(undefined), '');
});

test('认不出的 id 取栈回空串、取标签回原样', () => {
  assert.equal(fontStackOf('nope'), '');
  assert.equal(fontStackOf(''), '');
  // 标签原样返回：界面上显示成空白的话，用户看不出这个值坏了
  assert.equal(fontLabelOf('nope'), 'nope');
  assert.equal(fontLabelOf('montserrat'), 'Montserrat · 几何无衬线');
});

test('清单里的 id 与主字体名都不重复', () => {
  assert.equal(new Set(FONT_CHOICES.map((f) => f.id)).size, FONT_CHOICES.length);
  assert.equal(new Set(FONT_CHOICES.map((f) => f.primary)).size, FONT_CHOICES.length);
  // 主字体名要小写：反查那边统一转小写再比
  for (const f of FONT_CHOICES) {
    assert.equal(f.primary, f.primary.toLowerCase(), `${f.id} 的主字体名不是小写`);
  }
});
