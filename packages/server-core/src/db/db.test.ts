import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, setDbForTest, all, insertRow, updateRow, get, tx, parseJson, toSqlValue } from './client.js';
import { migrate } from './migrate.js';

function freshDb() {
  const d = openDatabase(':memory:');
  setDbForTest(d);
  return d;
}

test('迁移可重复执行且表结构完整', () => {
  const d = freshDb();
  const first = migrate();
  assert.ok(first.includes('001_init.sql'));

  const second = migrate();
  assert.deepEqual(second, [], '重复执行不应再应用任何迁移');

  const tables = all<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  ).map((r) => r.name);
  for (const t of [
    'users', 'refresh_tokens', 'login_attempts', 'signup_attempts', 'audit_events',
    'projects', 'decks', 'pages', 'style_packs', 'providers', 'task_routes',
    'tasks', 'task_dlq', 'export_jobs', 'shares', 'usage_records', 'app_settings',
    'schema_migrations',
  ]) {
    assert.ok(tables.includes(t), `缺少表 ${t}`);
  }
  d.close();
  setDbForTest(null);
});

test('tasks.idemKey 唯一约束生效（幂等入队的基石）', () => {
  const d = freshDb();
  migrate();
  const row = {
    taskId: 'k1', tenantId: 't1', kind: 'page_generate',
    idemKey: 'p1:pv1', groupKey: 't1/p1', createdAt: Date.now(),
  };
  insertRow('tasks', row);
  assert.throws(() => insertRow('tasks', { ...row, taskId: 'k2' }), /UNIQUE|constraint/i);
  d.close();
  setDbForTest(null);
});

test('users 用户名唯一，空邮箱不占用唯一索引', () => {
  const d = freshDb();
  migrate();
  const base = {
    tenantId: 't1', passwordHash: 'x', role: 'user', status: 'active',
    source: 'self_signup', quota: '{}', createdAt: Date.now(),
  };
  insertRow('users', { ...base, userId: 'u1', username: 'alice', email: '' });
  insertRow('users', { ...base, userId: 'u2', username: 'bob', email: '' });
  assert.throws(
    () => insertRow('users', { ...base, userId: 'u3', username: 'alice', email: '' }),
    /UNIQUE|constraint/i,
  );
  insertRow('users', { ...base, userId: 'u4', username: 'carol', email: 'x@y.com' });
  assert.throws(
    () => insertRow('users', { ...base, userId: 'u5', username: 'dave', email: 'x@y.com' }),
    /UNIQUE|constraint/i,
    '邮箱非空时应受唯一索引约束',
  );
  d.close();
  setDbForTest(null);
});

test('toSqlValue 处理布尔、undefined、对象', () => {
  assert.equal(toSqlValue(true), 1);
  assert.equal(toSqlValue(false), 0);
  assert.equal(toSqlValue(undefined), null);
  assert.equal(toSqlValue(null), null);
  assert.equal(toSqlValue('a'), 'a');
  assert.equal(toSqlValue({ a: 1 }), '{"a":1}');
});

test('insertRow / updateRow / get 往返', () => {
  const d = freshDb();
  migrate();
  insertRow('projects', {
    projectId: 'p1', tenantId: 't1', ownerId: 'u1', title: '路演',
    avatarEnabled: true, createdAt: 1, updatedAt: 1,
  });
  const before = get<{ title: string; avatarEnabled: number }>('SELECT title, avatarEnabled FROM projects WHERE projectId = ?', 'p1');
  assert.equal(before?.title, '路演');
  assert.equal(before?.avatarEnabled, 1, '布尔应写为 1');

  const changed = updateRow('projects', 'projectId', 'p1', { title: '战略发布', status: 'generating' });
  assert.equal(changed, 1);
  const after = get<{ title: string; status: string }>('SELECT title, status FROM projects WHERE projectId = ?', 'p1');
  assert.equal(after?.title, '战略发布');
  assert.equal(after?.status, 'generating');
  d.close();
  setDbForTest(null);
});

test('updateRow 空 patch 不执行且返回 0', () => {
  const d = freshDb();
  migrate();
  insertRow('projects', { projectId: 'p1', tenantId: 't1', ownerId: 'u1', title: 'x', createdAt: 1, updatedAt: 1 });
  assert.equal(updateRow('projects', 'projectId', 'p1', {}), 0);
  d.close();
  setDbForTest(null);
});

test('事务失败时回滚', () => {
  const d = freshDb();
  migrate();
  assert.throws(() =>
    tx(() => {
      insertRow('projects', { projectId: 'p1', tenantId: 't1', ownerId: 'u1', title: 'a', createdAt: 1, updatedAt: 1 });
      throw new Error('boom');
    }),
  );
  const rows = all('SELECT projectId FROM projects');
  assert.equal(rows.length, 0, '事务内写入应被回滚');
  d.close();
  setDbForTest(null);
});

test('parseJson 对损坏数据回退而不抛错', () => {
  assert.deepEqual(parseJson('{"a":1}', {}), { a: 1 });
  assert.deepEqual(parseJson('{bad json', { fallback: true }), { fallback: true });
  assert.deepEqual(parseJson(null, []), []);
  assert.deepEqual(parseJson('', []), []);
});
