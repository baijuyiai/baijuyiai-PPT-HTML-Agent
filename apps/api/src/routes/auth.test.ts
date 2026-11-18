import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';

// 环境必须在导入任何模块之前设定
const tmp = mkdtempSync(join(tmpdir(), 'lumen-api-'));
process.env.NODE_ENV = 'test';
process.env.LUMEN_DB_PATH = join(tmp, 'test.db');
process.env.LUMEN_ADMIN_PASSWORD = 'admin';
// 这个文件专门验证强制改密链路，所以显式打开；默认行为（开发不强制）在 env.test.ts 覆盖
process.env.LUMEN_ADMIN_FORCE_PASSWORD_CHANGE = 'true';
process.env.LUMEN_SECRET_KEY = 'test-secret-key-0123456789abcdefghijklmnop';

const { createApp } = await import('../app.js');
const { migrate } = await import('@lumen/server-core');
const { ensureSeed } = await import('@lumen/server-core');
const { closeDb } = await import('@lumen/server-core');
const { setSetting } = await import('@lumen/server-core');
const authService = await import('@lumen/server-core');

migrate();
ensureSeed();

const server: Server = createApp().listen(0);
await new Promise<void>((r) => server.once('listening', () => r()));
const addr = server.address();
const port = typeof addr === 'object' && addr ? addr.port : 0;
const base = `http://127.0.0.1:${port}`;

interface ApiResult {
  status: number;
  body: { ok: boolean; data?: unknown; error?: { code: string; message: string } };
  cookies: string[];
}

async function api(path: string, init: RequestInit = {}): Promise<ApiResult> {
  const res = await fetch(base + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  return {
    status: res.status,
    body: text ? JSON.parse(text) : { ok: false },
    cookies: res.headers.getSetCookie?.() ?? [],
  };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

test.after(() => {
  server.close();
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

test('公开设置接口可匿名访问', async () => {
  const r = await api('/api/public/settings');
  assert.equal(r.status, 200);
  assert.equal((r.body.data as { allowSelfSignup: boolean }).allowSelfSignup, true);
});

test('admin/admin 可登录，且首次登录标记强制改密', async () => {
  const r = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: 'admin', password: 'admin' }),
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const data = r.body.data as { user: { role: string; mustChangePassword: boolean; username: string }; accessToken: string };
  assert.equal(data.user.username, 'admin');
  assert.equal(data.user.role, 'admin');
  assert.equal(data.user.mustChangePassword, true, '内置 admin 首次登录必须强制改密');
  assert.ok(data.accessToken.length > 20);
  assert.ok(r.cookies.some((c) => c.startsWith('lumen_rt=')), '应下发刷新令牌 cookie');
  assert.equal(JSON.stringify(r.body).includes('passwordHash'), false, '响应不得含口令哈希');
});

test('错误密码返回 401 且不泄露账号是否存在', async () => {
  const wrong = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: 'admin', password: 'definitely-wrong' }),
  });
  const missing = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: 'nobody-here', password: 'definitely-wrong' }),
  });
  assert.equal(wrong.status, 401);
  assert.equal(missing.status, 401);
  assert.equal(wrong.body.error?.message, missing.body.error?.message, '两种失败的提示应一致');
});

test('未携带令牌访问 /api/me 返回 401', async () => {
  const r = await api('/api/me');
  assert.equal(r.status, 401);
  assert.equal(r.body.error?.code, 'UNAUTHORIZED');
});

test('携带有效令牌访问 /api/me 返回用户、配额与用量', async () => {
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: 'admin', password: 'admin' }),
  });
  const token = (login.body.data as { accessToken: string }).accessToken;
  const r = await api('/api/me', { headers: bearer(token) });
  assert.equal(r.status, 200);
  const data = r.body.data as { user: { username: string }; quota: { maxProjects: number }; used: { projects: number } };
  assert.equal(data.user.username, 'admin');
  assert.equal(data.quota.maxProjects, 0, '管理员配额为 0 表示不限');
  assert.equal(data.used.projects, 0);
});

test('自助注册成功、自动登录、角色为 user、来源正确', async () => {
  const r = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: 'alice', password: 'abcd1234', email: 'alice@example.com' }),
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const data = r.body.data as { user: { role: string; source: string; status: string; tenantId: string }; accessToken: string };
  assert.equal(data.user.role, 'user');
  assert.equal(data.user.source, 'self_signup');
  assert.equal(data.user.status, 'active');
  assert.ok(data.user.tenantId.length > 0, '自助注册应分配独立租户');

  const me = await api('/api/me', { headers: bearer(data.accessToken) });
  assert.equal(me.status, 200);
});

test('注册校验：弱口令被拒、重复用户名被拒', async () => {
  const weak = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: 'weakpw', password: 'abcdefgh' }),
  });
  assert.equal(weak.status, 400);
  assert.match(weak.body.error?.message ?? '', /数字/);

  const dup = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: 'alice', password: 'abcd1234' }),
  });
  assert.equal(dup.status, 409);
});

test('关闭自助注册开关后注册接口返回 403', async () => {
  setSetting('ALLOW_SELF_SIGNUP', 'false');
  const r = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: 'blocked', password: 'abcd1234' }),
  });
  assert.equal(r.status, 403);
  assert.match(r.body.error?.message ?? '', /关闭自助注册/);
  setSetting('ALLOW_SELF_SIGNUP', 'true');
});

test('连续 5 次失败后账号被锁定 15 分钟', async () => {
  await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: 'lockme', password: 'abcd1234' }),
  });
  for (let i = 0; i < 5; i++) {
    const r = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ login: 'lockme', password: 'wrong-pass-1' }),
    });
    assert.equal(r.status, 401, `第 ${i + 1} 次应仍是 401`);
  }
  // 第 6 次即使密码正确也应被锁定
  const locked = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: 'lockme', password: 'abcd1234' }),
  });
  assert.equal(locked.status, 423);
  assert.match(locked.body.error?.message ?? '', /分钟后重试/);
});

test('修改密码后旧密码失效，且旧刷新令牌被撤销', async () => {
  const reg = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: 'changepw', password: 'abcd1234' }),
  });
  const token = (reg.body.data as { accessToken: string }).accessToken;
  const oldRefresh = reg.cookies.find((c) => c.startsWith('lumen_rt='))?.split(';')[0] ?? '';

  const changed = await api('/api/auth/change-password', {
    method: 'POST',
    headers: bearer(token),
    body: JSON.stringify({ oldPassword: 'abcd1234', newPassword: 'efgh5678' }),
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));

  const withOld = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: 'changepw', password: 'abcd1234' }),
  });
  assert.equal(withOld.status, 401, '旧密码应失效');

  const withNew = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: 'changepw', password: 'efgh5678' }),
  });
  assert.equal(withNew.status, 200, '新密码应可登录');

  const oldCookieRefresh = await api('/api/auth/refresh', { method: 'POST', headers: { cookie: oldRefresh } });
  assert.equal(oldCookieRefresh.status, 401, '改密前的刷新令牌应被撤销');
});

test('刷新令牌可轮换出新访问令牌，且旧刷新令牌随即失效', async () => {
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: 'admin', password: 'admin' }),
  });
  const cookie = login.cookies.find((c) => c.startsWith('lumen_rt='))?.split(';')[0] ?? '';
  assert.ok(cookie);

  const first = await api('/api/auth/refresh', { method: 'POST', headers: { cookie } });
  assert.equal(first.status, 200);
  assert.ok((first.body.data as { accessToken: string }).accessToken);

  const second = await api('/api/auth/refresh', { method: 'POST', headers: { cookie } });
  assert.equal(second.status, 401, '同一刷新令牌不可重复使用');
});

test('禁用账号后已签发的访问令牌立即失效', async () => {
  const reg = await api('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username: 'tobedisabled', password: 'abcd1234' }),
  });
  const data = reg.body.data as { accessToken: string; user: { userId: string } };
  assert.equal((await api('/api/me', { headers: bearer(data.accessToken) })).status, 200);

  authService.disableUser(data.user.userId, 'system', '127.0.0.1');

  const after = await api('/api/me', { headers: bearer(data.accessToken) });
  assert.equal(after.status, 401, '禁用后令牌必须立即失效');
  assert.match(after.body.error?.message ?? '', /禁用/);

  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: 'tobedisabled', password: 'abcd1234' }),
  });
  assert.equal(login.status, 403);
});

test('登出后刷新令牌不可再用', async () => {
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: 'admin', password: 'admin' }),
  });
  const cookie = login.cookies.find((c) => c.startsWith('lumen_rt='))?.split(';')[0] ?? '';
  assert.equal((await api('/api/auth/logout', { method: 'POST', headers: { cookie } })).status, 200);
  const after = await api('/api/auth/refresh', { method: 'POST', headers: { cookie } });
  assert.equal(after.status, 401);
});

test('未知接口返回统一 404 结构', async () => {
  const r = await api('/api/definitely-not-here');
  assert.equal(r.status, 404);
  assert.equal(r.body.error?.code, 'NOT_FOUND');
});

test('运维通道：重设管理员密码不受密码策略限制，并解除强制改密', async () => {
  const { setAdminPassword, findAdmin } = await import('@lumen/server-core');

  // 先制造「被锁在门外」的处境：密码被改成一个谁也不知道的值
  const before = findAdmin();
  assert.ok(before, '应存在内置管理员');
  const staleRefresh = (
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ login: 'admin', password: 'admin' }) })
  ).cookies.find((c) => c.startsWith('lumen_rt='))?.split(';')[0] ?? '';
  setAdminPassword('some-other-password', { forceChange: true });

  // `admin` 不满足密码策略（不足 8 位、无数字），但运维通道必须放行
  const updated = setAdminPassword('admin', { forceChange: false });
  assert.equal(updated.mustChangePassword, 0, '不强制改密时应解除标记');
  assert.equal(updated.status, 'active');

  const relogin = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: 'admin', password: 'admin' }),
  });
  assert.equal(relogin.status, 200, '重设后的密码应可登录');
  assert.equal((relogin.body.data as { user: { mustChangePassword: boolean } }).user.mustChangePassword, false);

  const stale = await api('/api/auth/refresh', { method: 'POST', headers: { cookie: staleRefresh } });
  assert.equal(stale.status, 401, '重设密码前的刷新令牌应被撤销');
});
