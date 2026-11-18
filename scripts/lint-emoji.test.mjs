import test from 'node:test';
import assert from 'node:assert/strict';
import { findEmoji } from './lint-emoji.mjs';

// 用 fromCodePoint 构造，避免源码本身含 emoji 字符
const e = (...cps) => String.fromCodePoint(...cps);

test('纯文本与中文不命中', () => {
  assert.deepEqual(findEmoji('这是一段普通说明文字，含标点：、；（）「」'), []);
  assert.deepEqual(findEmoji('const a = 1; // comment'), []);
  assert.deepEqual(findEmoji('箭头 -> 与省略号 ... 与乘号 x'), []);
});

test('常见 emoji 命中并给出位置', () => {
  const hits = findEmoji(`第一行\n前${e(0x1f600)}后`);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 2);
  assert.equal(hits[0].col, 2);
  assert.equal(hits[0].codePoint, 'U+1F600');
});

test('符号类 emoji 命中（对勾/警告/齿轮）', () => {
  assert.equal(findEmoji(e(0x2705)).length, 1); // 白色粗对勾
  assert.equal(findEmoji(e(0x26a0)).length, 1); // 警告
  assert.equal(findEmoji(e(0x2699)).length, 1); // 齿轮
  assert.equal(findEmoji(e(0x1f4ca)).length, 1); // 柱状图
});

test('国旗与键帽序列命中', () => {
  assert.ok(findEmoji(e(0x1f1e8, 0x1f1f3)).length >= 1);
  assert.ok(findEmoji(e(0x31, 0x20e3)).length >= 1);
});

test('零宽连接符与变体选择符被标记', () => {
  assert.ok(findEmoji(e(0xfe0f)).length >= 1);
  assert.ok(findEmoji(e(0x200d)).length >= 1);
});

test('多行多命中位置准确（列为 UTF-16 码元列，与编辑器一致）', () => {
  const hits = findEmoji(`${e(0x1f600)}\nplain\n${e(0x1f601)}${e(0x1f602)}`);
  assert.equal(hits.length, 3);
  assert.deepEqual(hits.map((h) => h.line), [1, 3, 3]);
  // 第 3 行首个字符（U+1F601）占 2 个码元，故第二个字符（U+1F602）落在第 3 列
  assert.deepEqual(hits.map((h) => h.col), [1, 1, 3]);
});
