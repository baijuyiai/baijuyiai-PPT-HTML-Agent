import test from 'node:test';
import assert from 'node:assert/strict';
import { readNavCollapsed, writeNavCollapsed } from './nav-pref.js';
import type { StorageLike } from '../workbench/seen.js';

/** 内存版 storage。`apps/web` 没有 DOM 环境，真 `localStorage` 在这里根本不存在 */
function fakeStore(): StorageLike & { dump: () => Record<string, string> } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => { m.set(k, v); },
    dump: () => Object.fromEntries(m),
  };
}

test('没记过时是展开的', () => {
  const s = fakeStore();
  assert.equal(
    readNavCollapsed(s), false,
    '**默认必须是展开**——收起是用户主动选的，第一次进来就只剩图标，导航等于藏起来了',
  );
});

test('收起之后读得回来，再展开也读得回来', () => {
  const s = fakeStore();
  writeNavCollapsed(true, s);
  assert.equal(readNavCollapsed(s), true);
  writeNavCollapsed(false, s);
  assert.equal(readNavCollapsed(s), false, '展开要真的存成展开，不能只靠「没记过」');
});

test('存储里是别的值时按展开处理，不抛', () => {
  const s = fakeStore();
  // 只认 '1'。历史值、手改坏的值都不该让左栏莫名其妙地收起
  for (const junk of ['', 'true', 'yes', '{坏 JSON']) {
    s.setItem('lumen.nav.collapsed', junk);
    assert.equal(readNavCollapsed(s), false, `存成 ${JSON.stringify(junk)} 时不该收起`);
  }
});

test('getItem / setItem 抛异常时不往上冒', () => {
  const boom: StorageLike = {
    getItem() { throw new Error('隐私模式'); },
    setItem() { throw new Error('配额满'); },
  };
  assert.equal(readNavCollapsed(boom), false, '读不到就按展开，界面不能白屏');
  writeNavCollapsed(true, boom); // 不该抛
});
