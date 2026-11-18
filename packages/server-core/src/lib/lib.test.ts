import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword, verifyPassword, encryptSecret, decryptSecret, maskSecret, hashToken, newId, newOpaqueToken,
} from './crypto.js';
import { redact } from './logger.js';
import { hit, peek, resetAll, reset } from './ratelimit.js';
import { signAccess, verifyAccess } from './jwt.js';
import { AppError, forbidden, notFound } from './errors.js';

test('口令哈希可验证，错误口令被拒', () => {
  const stored = hashPassword('abcd1234');
  assert.match(stored, /^scrypt\$16384\$8\$1\$/);
  assert.equal(verifyPassword('abcd1234', stored), true);
  assert.equal(verifyPassword('abcd1235', stored), false);
  assert.equal(verifyPassword('', stored), false);
});

test('同一口令两次哈希不同（盐随机）', () => {
  assert.notEqual(hashPassword('abcd1234'), hashPassword('abcd1234'));
});

test('损坏的哈希串返回 false 而不抛错', () => {
  for (const bad of ['', 'garbage', 'scrypt$1', 'scrypt$a$b$c$d$e', 'bcrypt$x$y']) {
    assert.equal(verifyPassword('abcd1234', bad), false, `应拒绝 ${bad}`);
  }
});

test('密钥加解密往返，密文格式为 v1:iv:tag:ct', () => {
  const plain = 'sk-test-1234567890abcdef';
  const ref = encryptSecret(plain);
  assert.match(ref, /^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/);
  assert.notEqual(ref, plain);
  assert.equal(ref.includes(plain), false, '密文不得包含明文');
  assert.equal(decryptSecret(ref), plain);
});

test('空串加密返回空串；脏密文解密返回空串', () => {
  assert.equal(encryptSecret(''), '');
  assert.equal(decryptSecret(''), '');
  assert.equal(decryptSecret('v1:bad:bad:bad'), '');
  assert.equal(decryptSecret('v2:a:b:c'), '');
  assert.equal(decryptSecret('random'), '');
});

test('掩码保留首尾各 4 位', () => {
  assert.equal(maskSecret('sk-1234567890abcdef'), 'sk-1******cdef');
  assert.equal(maskSecret('short'), '*****');
  assert.equal(maskSecret(''), '');
});

test('ID 与不透明 token 具备足够随机性', () => {
  const ids = new Set(Array.from({ length: 200 }, () => newId('prj')));
  assert.equal(ids.size, 200);
  assert.match(newId('prj'), /^prj_[0-9a-z]{10}$/);
  assert.notEqual(newOpaqueToken(), newOpaqueToken());
  assert.equal(hashToken('abc'), hashToken('abc'));
  assert.notEqual(hashToken('abc'), hashToken('abd'));
});

test('日志脱敏：敏感键名与敏感值形态都被打码', () => {
  const out = redact({
    apiKey: 'sk-live-abcdefghijklmnop',
    authorization: 'Bearer abcdefghijklmnop',
    password: 'abcd1234',
    nested: { refreshToken: 'zzz', safe: 'visible' },
    note: '这里有一个 sk-abcdefghijklmnop 混在文本里',
    count: 3,
  }) as Record<string, unknown>;

  assert.equal(out.apiKey, '***');
  assert.equal(out.authorization, '***');
  assert.equal(out.password, '***');
  assert.equal((out.nested as Record<string, unknown>).refreshToken, '***');
  assert.equal((out.nested as Record<string, unknown>).safe, 'visible');
  assert.equal(out.count, 3);
  assert.equal(String(out.note).includes('sk-abcdefghijklmnop'), false, '文本中的 key 也应被打码');
});

test('日志脱敏处理数组与错误对象', () => {
  const out = redact({ list: [{ token: 'x' }, { ok: 1 }], err: new Error('sk-abcdefghijklmnop 失败') }) as Record<string, unknown>;
  assert.equal((out.list as Record<string, unknown>[])[0]!.token, '***');
  assert.equal((out.list as Record<string, unknown>[])[1]!.ok, 1);
  assert.equal(String((out.err as Record<string, unknown>).message).includes('sk-abcdefghijklmnop'), false);
});

test('限流：窗口内计数，超限拒绝，窗口滚动后重置', () => {
  resetAll();
  const r1 = hit('k', 2, 1000);
  assert.equal(r1.allowed, true);
  assert.equal(r1.remaining, 1);
  const r2 = hit('k', 2, 1000);
  assert.equal(r2.allowed, true);
  assert.equal(r2.remaining, 0);
  const r3 = hit('k', 2, 1000);
  assert.equal(r3.allowed, false, '第三次应被拒绝');
  assert.equal(peek('k', 1000), 3);
  reset('k');
  assert.equal(peek('k', 1000), 0);
});

test('限流键相互独立', () => {
  resetAll();
  hit('a', 1, 1000);
  assert.equal(hit('a', 1, 1000).allowed, false);
  assert.equal(hit('b', 1, 1000).allowed, true);
});

test('访问令牌签发与校验往返，含租户与角色', async () => {
  const token = await signAccess({ sub: 'u1', tid: 't1', role: 'admin', mcp: true });
  const claims = await verifyAccess(token);
  assert.equal(claims.sub, 'u1');
  assert.equal(claims.tid, 't1');
  assert.equal(claims.role, 'admin');
  assert.equal(claims.mcp, true);
});

test('被篡改的令牌校验失败', async () => {
  const token = await signAccess({ sub: 'u1', tid: 't1', role: 'user', mcp: false });
  const tampered = token.slice(0, -3) + 'aaa';
  await assert.rejects(() => verifyAccess(tampered));
  await assert.rejects(() => verifyAccess('not.a.jwt'));
});

test('AppError 映射到 HTTP 状态码并输出统一错误体', () => {
  assert.equal(notFound().status, 404);
  assert.equal(forbidden().status, 403);
  const e = new AppError('QUOTA_EXCEEDED', '额度不足', { need: 5 });
  assert.equal(e.status, 402);
  assert.deepEqual(e.toJSON(), {
    ok: false,
    error: { code: 'QUOTA_EXCEEDED', message: '额度不足', details: { need: 5 } },
  });
});
