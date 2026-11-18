import assert from 'node:assert/strict';
import test from 'node:test';
import type { StyleDocSummary } from '@lumen/ir-schema';
import { chromaOf, lumaOf, showcaseStyleOf } from './showcase-style.js';

/** 只填用得到的字段。挑风格这件事只看 `theme` 与 `palette.bg` */
const style = (name: string, theme: 'light' | 'dark', bg: string): StyleDocSummary => ({
  styleId: name, version: '1.0', name, description: '', theme,
  palette: { bg, surface: bg, text: '#FFFFFF', muted: '#888888', accent: '#FF0000', brand: '#FF0000', border: '#333333' },
  fontFamily: '', fontDisplay: '', fontScript: '', fontNumeric: '', spec: null, pageTypes: [], mockedCount: 0,
  previewHtml: [], builtin: false, reviewed: false, customized: false, updatedAt: 0,
});

/** 库里真实存在的那几套，底色照抄 */
const LIBRARY = [
  style('暖调纸感编辑风', 'light', '#EFE6D9'),
  style('深色紫调数据面板', 'dark', '#0B0B10'),
  style('蔚蓝科技商务风', 'light', '#F4F7FB'),
  style('蓝绿渐变科技风', 'light', '#FFFFFF'),
  style('深蓝渐变商务风', 'dark', '#0F3468'),
];

test('深色挑中性那套，不挑深蓝那套', () => {
  assert.equal(showcaseStyleOf(LIBRARY, 'dark')?.name, '深色紫调数据面板');
});

test('深色挑谁与列表顺序无关——风格库新增一套不该把深色模板整片换掉', () => {
  const reversed = [...LIBRARY].reverse();
  assert.equal(showcaseStyleOf(reversed, 'dark')?.name, '深色紫调数据面板');
});

test('浅色维持列表顺序，取第一套', () => {
  assert.equal(showcaseStyleOf(LIBRARY, 'light')?.name, '暖调纸感编辑风');
});

test('该主题一套都没有时回 undefined，而不是退回另一种主题', () => {
  const onlyLight = LIBRARY.filter((s) => s.theme === 'light');
  assert.equal(showcaseStyleOf(onlyLight, 'dark'), undefined);
  assert.equal(showcaseStyleOf([], 'light'), undefined);
  assert.equal(showcaseStyleOf([], 'dark'), undefined);
});

test('彩度相同的两套深色，取更暗的那个', () => {
  const a = style('中灰', 'dark', '#404040');
  const b = style('近黑', 'dark', '#101010');
  assert.equal(showcaseStyleOf([a, b], 'dark')?.name, '近黑');
});

test('底色认不出来时排到最后，不抢代表位', () => {
  const broken = style('渐变色底', 'dark', 'linear-gradient(#000, #111)');
  const ok = style('近黑', 'dark', '#0B0B10');
  assert.equal(showcaseStyleOf([broken, ok], 'dark')?.name, '近黑');
  // 全都认不出时不崩，仍给一个
  assert.equal(showcaseStyleOf([broken], 'dark')?.name, '渐变色底');
});

test('chromaOf：纯灰是 0，三位写法与六位等价', () => {
  assert.equal(chromaOf('#000000'), 0);
  assert.equal(chromaOf('#808080'), 0);
  assert.equal(chromaOf('#0F3468'), 104 - 15);
  assert.equal(chromaOf('#abc'), chromaOf('#aabbcc'));
  // 认不出的值当作「最不中性」
  assert.equal(chromaOf('rebeccapurple'), Number.POSITIVE_INFINITY);
});

test('lumaOf：加权亮度，绿比红亮比蓝亮', () => {
  assert.equal(lumaOf('#000000'), 0);
  assert.ok(Math.abs(lumaOf('#FFFFFF') - 255) < 0.01);
  assert.ok(lumaOf('#00FF00') > lumaOf('#FF0000'));
  assert.ok(lumaOf('#FF0000') > lumaOf('#0000FF'));
});
