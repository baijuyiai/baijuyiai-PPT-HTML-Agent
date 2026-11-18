import test from 'node:test';
import assert from 'node:assert/strict';
import { markSeen, seenAt, hasChanged, type StorageLike } from './seen.js';

/** 内存版 storage。`apps/web` 没有 DOM 环境，真 `localStorage` 在这里根本不存在 */
function fakeStore(): StorageLike & { dump: () => Record<string, string> } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => { m.set(k, v); },
    dump: () => Object.fromEntries(m),
  };
}

test('没记过就回 null，不是 0', () => {
  const s = fakeStore();
  assert.equal(
    seenAt('u1', 'prj_a', s), null,
    '**回 0 会让所有项目都变成「有变更」**——`updatedAt` 一定大于 0。'
    + '「没记过」必须是 null，与「记过但时间很早」区分得开',
  );
});

test('记过之后拿得回那个时间，并且是写进去的那个数', () => {
  const s = fakeStore();
  markSeen('u1', 'prj_a', s, 1_700_000_000_000);
  assert.equal(seenAt('u1', 'prj_a', s), 1_700_000_000_000);
  // 只记这一个项目，别的还是没记过
  assert.equal(seenAt('u1', 'prj_b', s), null);
});

test('换 userId 不串：同一个浏览器上换账号是干净的一份', () => {
  const s = fakeStore();
  markSeen('u1', 'prj_a', s, 111);
  markSeen('u2', 'prj_a', s, 222);
  assert.equal(seenAt('u1', 'prj_a', s), 111, '两个账号看同一个项目，各记各的');
  assert.equal(seenAt('u2', 'prj_a', s), 222);
});

test('存储里是坏数据时按「没记过」处理，不抛', () => {
  const s = fakeStore();
  s.setItem('lumen.seen.u1', '{ 这不是 JSON');
  assert.equal(seenAt('u1', 'prj_a', s), null, '坏数据不该让整个项目库白屏');
});

test('hasChanged：没记过不算变、改得比记的晚才算变', () => {
  assert.equal(hasChanged(1000, null), false, '没看过就谈不上「变了」');
  assert.equal(hasChanged(1000, 999), true, '改动晚于上次打开 → 有变更');
  assert.equal(hasChanged(1000, 1000), false, '同一时刻不算变');
  assert.equal(hasChanged(1000, 1001), false, '上次打开晚于改动 → 没有变更');
});
