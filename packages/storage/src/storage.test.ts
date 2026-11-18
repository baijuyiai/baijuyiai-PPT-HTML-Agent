import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalStorage } from './local.js';
import { assertSafeKey, objectKey } from './adapter.js';
import { createStorage } from './index.js';

/** 建一个临时根目录的存储实例，返回实例与目录以便清理 */
function makeStore(): { store: LocalStorage; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'lumen-storage-'));
  return { store: new LocalStorage({ rootDir: dir, publicBasePath: '/files' }), dir };
}

test('put/get/delete 往返：字节一致，contentType 不影响内容', async () => {
  const { store, dir } = makeStore();
  try {
    const key = objectKey('t1', 'p1', 'images', 'cover.png');
    const payload = Buffer.from([0x00, 0x01, 0x02, 0xfe, 0xff, 0x7f, 0x80]);
    const url = await store.put(key, payload, 'image/png');
    assert.equal(url, '/files/t1/p1/images/cover.png');
    assert.deepEqual(await store.get(key), payload);

    // 同样的字节换一种 contentType，读回内容不变
    const key2 = objectKey('t1', 'p1', 'images', 'cover2.png');
    await store.put(key2, payload, 'application/octet-stream');
    assert.deepEqual(await store.get(key2), payload);

    await store.delete(key);
    assert.equal(await store.exists(key), false);
    // 删除后再读应抛 NOT_FOUND
    await assert.rejects(() => store.get(key), /NOT_FOUND/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('exists 在写入前为 false，写入后为 true', async () => {
  const { store, dir } = makeStore();
  try {
    const key = objectKey('tenant', 'project', 'thumbs', 'a.webp');
    assert.equal(await store.exists(key), false);
    await store.put(key, Buffer.from('x'), 'image/webp');
    assert.equal(await store.exists(key), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('url 使用正斜杠并以 publicBasePath 开头', () => {
  const store = new LocalStorage({ rootDir: 'ignored', publicBasePath: '/files' });
  const u = store.url('t1/p1/images/a.png');
  assert.equal(u, '/files/t1/p1/images/a.png');
  assert.ok(u.startsWith('/files/'));
  assert.equal(u.includes('\\'), false);
});

test('publicBasePath 结尾多余斜杠会被去掉', () => {
  const store = new LocalStorage({ rootDir: 'ignored', publicBasePath: '/files/' });
  assert.equal(store.url('a/b.png'), '/files/a/b.png');
});

test('assertSafeKey 拒绝路径穿越与危险字符', () => {
  assert.throws(() => assertSafeKey('../evil'), /\.\./);
  assert.throws(() => assertSafeKey('/abs'), /开头/);
  assert.throws(() => assertSafeKey('a\\b'), /反斜杠/);
  assert.throws(() => assertSafeKey('a:b'), /冒号/);
  assert.throws(() => assertSafeKey('a/../b'), /\.\./);
  assert.throws(() => assertSafeKey('a\u0000b'), /空字节/);
  assert.throws(() => assertSafeKey(''));
  // 正常 key 不应抛错
  assert.doesNotThrow(() => assertSafeKey('t1/p1/images/a.png'));
});

test('objectKey 净化非法字符并保持四段结构', () => {
  const key = objectKey('t 1', 'p/1', 'images', 'a b/c.png');
  assert.equal(key.includes(' '), false);
  const segments = key.split('/');
  assert.equal(segments.length, 4);
  assert.equal(segments[0], 't_1');
  assert.equal(segments[1], 'p_1');
  assert.equal(segments[2], 'images');
  assert.equal(segments[3], 'a_b_c.png');
  // 净化后的结果必须能通过安全校验
  assert.doesNotThrow(() => assertSafeKey(key));
});

test('objectKey 拒绝空段与路径穿越片段', () => {
  assert.throws(() => objectKey('t1', 'p1', 'images', ''));
  assert.throws(() => objectKey('', 'p1', 'images', 'a.png'));
  assert.throws(() => objectKey('t1', 'p1', 'images', '..'));
});

test('objectKey 拒绝未知分区', () => {
  assert.throws(() =>
    // 故意传入非法 kind，验证运行期守卫
    objectKey('t1', 'p1', 'unknown' as 'images', 'a.png'),
  );
});

test('createStorage 返回同一实例（模块级单例）', () => {
  const a = createStorage();
  const b = createStorage();
  assert.equal(a, b);
  assert.ok(a instanceof LocalStorage);
  assert.ok(a.rootDir.replace(/\\/g, '/').endsWith('/objects'));
});
