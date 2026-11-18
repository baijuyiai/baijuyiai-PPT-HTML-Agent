import test from 'node:test';
import assert from 'node:assert/strict';
import { complementOf, fromHex, toHsl } from './color.js';

/**
 * 互补色。**用途是讲解光标**：它要压在主色调铺的版面上，同色系会糊在一起。
 */

test('色相转 180°：红的互补是青', () => {
  const red = toHsl(fromHex('#C0392B'));
  const comp = toHsl(fromHex(complementOf('#C0392B')));
  const delta = Math.abs(((comp.h - red.h) % 360 + 360) % 360 - 180);
  assert.ok(delta < 2, `色相差 ${delta.toFixed(1)}°，不是 180°`);
  // 红在 0° 附近，转 180 该落在青绿一带
  assert.ok(comp.h > 150 && comp.h < 210, `互补色的色相是 ${comp.h.toFixed(0)}°`);
});

test('深色品牌色配出来的互补色要提亮——否则压在深色版面上等于没有', () => {
  // 深海军蓝 L≈15%。照搬明度的话互补色是深黄，深底上看不见
  const dark = toHsl(fromHex('#0B1F3A'));
  assert.ok(dark.l < 0.3, `这张得是深色，实际 L=${dark.l.toFixed(2)}`);
  const comp = toHsl(fromHex(complementOf('#0B1F3A')));
  assert.ok(comp.l >= 0.5, `互补色的明度只有 ${comp.l.toFixed(2)}，太暗`);
});

test('浅色品牌色配出来的互补色要压暗——否则压在浅色版面上会糊', () => {
  const light = toHsl(fromHex('#F5E6C8'));
  assert.ok(light.l > 0.8, `这张得是浅色，实际 L=${light.l.toFixed(2)}`);
  const comp = toHsl(fromHex(complementOf('#F5E6C8')));
  assert.ok(comp.l <= 0.75, `互补色的明度是 ${comp.l.toFixed(2)}，太亮`);
});

test('有饱和度下限，别配出一个灰扑扑的互补色', () => {
  const comp = toHsl(fromHex(complementOf('#8A9BA8')));
  assert.ok(comp.s >= 0.45, `饱和度只有 ${comp.s.toFixed(2)}`);
});

test('结果始终是一个合法的六位十六进制', () => {
  for (const hex of ['#C0392B', '#0B1F3A', '#F5E6C8', '#808080', '#000000', '#FFFFFF', '#1B4D8F']) {
    assert.match(complementOf(hex), /^#[0-9A-F]{6}$/, `${hex} 配出来的是 ${complementOf(hex)}`);
  }
});

test('认不出的输入不炸——回一个合法颜色就行', () => {
  // 上游可能是 'var(--brand-500)' 这种，或者干脆是空串
  assert.match(complementOf(''), /^#[0-9A-F]{6}$/);
  assert.match(complementOf('var(--brand-500)'), /^#[0-9A-F]{6}$/);
});
