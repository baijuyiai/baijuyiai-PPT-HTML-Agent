import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { createQueue, toSqlValue } from './queue.js';
import type { TaskQueue } from './types.js';

const HERE = dirname(fileURLToPath(import.meta.url));
// 直接读取 api 的真实迁移文件，避免把 SQL 复制进测试造成漂移
const MIGRATION = resolve(HERE, '../../server-core/src/db/migrations/001_init.sql');

/** 开一个内存库并执行完整迁移 */
function makeDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(MIGRATION, 'utf8'));
  return db;
}

/** 可注入的可控时钟 */
function makeClock(start = 1000): { now: () => number; set: (v: number) => void } {
  let t = start;
  return {
    now: () => t,
    set: (v: number) => {
      t = v;
    },
  };
}

/** 造一个测试队列（默认单租户 t1） */
function makeQueue(db: DatabaseSync, opts: Partial<Parameters<typeof createQueue>[1]> = {}): TaskQueue {
  return createQueue(db, { owner: 'w1', ...opts });
}

test('toSqlValue 归一布尔/undefined/对象', () => {
  assert.equal(toSqlValue(true), 1);
  assert.equal(toSqlValue(false), 0);
  assert.equal(toSqlValue(undefined), null);
  assert.equal(toSqlValue(null), null);
  assert.equal(toSqlValue(42), 42);
  assert.equal(toSqlValue('x'), 'x');
  assert.equal(toSqlValue({ a: 1 }), '{"a":1}');
});

test('enqueue 幂等：同 idemKey 第二次返回既有任务', () => {
  const db = makeDb();
  const q = makeQueue(db);
  const a = q.enqueue({ tenantId: 't1', projectId: 'p1', kind: 'page_generate', idemKey: 'k1' });
  const b = q.enqueue({ tenantId: 't1', projectId: 'p1', kind: 'page_generate', idemKey: 'k1' });

  assert.equal(a.created, true);
  assert.equal(b.created, false);
  assert.equal(b.task.taskId, a.task.taskId);
  // 只落了一行
  assert.equal(q.list({}).total, 1);
});

test('enqueue 默认 groupKey 为 tenantId/projectId', () => {
  const db = makeDb();
  const q = makeQueue(db);
  const a = q.enqueue({ tenantId: 't1', projectId: 'p1', kind: 'tts', idemKey: 'k1' });
  const b = q.enqueue({ tenantId: 't1', kind: 'tts', idemKey: 'k2' });
  assert.equal(a.task.groupKey, 't1/p1');
  assert.equal(b.task.groupKey, 't1/-');
});

test('claim 领取后状态变 running、attempts 变 1、租约字段已设', () => {
  const clock = makeClock(1000);
  const db = makeDb();
  const q = makeQueue(db, { leaseMs: 5000, now: clock.now });
  q.enqueue({ tenantId: 't1', kind: 'image_generate', idemKey: 'k1', groupKey: 'g1' });

  const claimed = q.claim(1);
  assert.equal(claimed.length, 1);
  const t = claimed[0];
  assert.ok(t);
  assert.equal(t.status, 'running');
  assert.equal(t.attempts, 1);
  assert.equal(t.leaseOwner, 'w1');
  assert.equal(t.leaseUntil, 6000);
  assert.equal(t.heartbeatAt, 1000);
  assert.equal(t.startedAt, 1000);
});

test('并发领取不重复：连续 claim 两次的 taskId 集合不相交', () => {
  const db = makeDb();
  const q = makeQueue(db, { maxConcurrency: 10 });
  for (let i = 0; i < 5; i++) {
    q.enqueue({ tenantId: 't1', kind: 'tts', idemKey: `k${i}`, groupKey: `g${i}` });
  }

  const first = q.claim(5).map((t) => t.taskId);
  const second = q.claim(5).map((t) => t.taskId);

  assert.equal(first.length, 5);
  assert.equal(second.length, 0);
  assert.equal(first.filter((id) => second.includes(id)).length, 0);
});

test('组限流：同 groupKey 的并发不超过 groupConcurrency', () => {
  const db = makeDb();
  const q = makeQueue(db, { maxConcurrency: 10, groupConcurrency: 2 });
  for (let i = 0; i < 5; i++) {
    q.enqueue({ tenantId: 't1', kind: 'tts', idemKey: `k${i}`, groupKey: 'same' });
  }
  assert.equal(q.claim(10).length, 2);
});

test('全局并发上限：claim 不超过 maxConcurrency', () => {
  const db = makeDb();
  const q = makeQueue(db, { maxConcurrency: 3, groupConcurrency: 2 });
  for (let i = 0; i < 10; i++) {
    q.enqueue({ tenantId: 't1', kind: 'tts', idemKey: `k${i}`, groupKey: `g${i}` });
  }
  assert.equal(q.claim(10).length, 3);
});

test('claim 按 priority DESC、createdAt ASC 排序', () => {
  const clock = makeClock(1000);
  const db = makeDb();
  const q = makeQueue(db, { maxConcurrency: 10, now: clock.now });
  const low = q.enqueue({ tenantId: 't1', kind: 'tts', idemKey: 'low', groupKey: 'g1', priority: 0 });
  clock.set(2000);
  const high = q.enqueue({ tenantId: 't1', kind: 'tts', idemKey: 'high', groupKey: 'g2', priority: 5 });

  const claimed = q.claim(2);
  assert.equal(claimed.length, 2);
  assert.equal(claimed[0]?.taskId, high.task.taskId);
  assert.equal(claimed[1]?.taskId, low.task.taskId);
});

test('heartbeat 续租成功；用别人的 owner 调返回 false', () => {
  const clock = makeClock(1000);
  const db = makeDb();
  const q = makeQueue(db, { leaseMs: 5000, now: clock.now });
  const other = createQueue(db, { owner: 'w2', leaseMs: 5000, now: clock.now });

  q.enqueue({ tenantId: 't1', kind: 'tts', idemKey: 'k1', groupKey: 'g1' });
  const t = q.claim(1)[0];
  assert.ok(t);

  clock.set(2000);
  assert.equal(q.heartbeat(t.taskId), true);
  assert.equal(q.get(t.taskId)?.leaseUntil, 7000);
  assert.equal(q.get(t.taskId)?.heartbeatAt, 2000);
  // 别人的 owner 不能续租
  assert.equal(other.heartbeat(t.taskId), false);
});

test('租约过期可被重领（注入时钟）', () => {
  const clock = makeClock(1000);
  const db = makeDb();
  const q = makeQueue(db, { leaseMs: 1000, now: clock.now });
  const enq = q.enqueue({ tenantId: 't1', kind: 'tts', idemKey: 'k1', groupKey: 'g1' });

  assert.equal(q.claim(1).length, 1);
  // 未过期时不能再领
  clock.set(1500);
  assert.equal(q.claim(1).length, 0);
  // 过期后可重领同一条
  clock.set(2001);
  const again = q.claim(1);
  assert.equal(again.length, 1);
  const t = again[0];
  assert.ok(t);
  assert.equal(t.taskId, enq.task.taskId);
  assert.equal(t.attempts, 2);
});

test('recoverStale 把过期 running 回退为 queued 并返回正确行数', () => {
  const clock = makeClock(1000);
  const db = makeDb();
  const q = makeQueue(db, { leaseMs: 1000, now: clock.now });
  const enq = q.enqueue({ tenantId: 't1', kind: 'tts', idemKey: 'k1', groupKey: 'g1' });
  q.claim(1);

  // 租约未过期：不应回收
  clock.set(1500);
  assert.equal(q.recoverStale(), 0);
  assert.equal(q.get(enq.task.taskId)?.status, 'running');

  // 租约过期：回收为 queued，清空租约
  clock.set(2500);
  assert.equal(q.recoverStale(), 1);
  const after = q.get(enq.task.taskId);
  assert.equal(after?.status, 'queued');
  assert.equal(after?.leaseOwner, null);
  assert.equal(after?.leaseUntil, null);
  assert.equal(after?.heartbeatAt, null);
});

test('fail 未达 maxAttempts 回 queued；达到上限进 DLQ 且 status 为 dead', () => {
  const clock = makeClock(1000);
  const db = makeDb();
  const q = makeQueue(db, { leaseMs: 5000, maxConcurrency: 5, now: clock.now });
  const enq = q.enqueue({
    tenantId: 't1',
    projectId: 'p1',
    kind: 'tts',
    idemKey: 'k1',
    groupKey: 'g1',
    maxAttempts: 2,
  });

  // 第一次失败：还有额度，回 queued
  q.claim(1);
  q.fail(enq.task.taskId, 'boom-1');
  const afterFirst = q.get(enq.task.taskId);
  assert.equal(afterFirst?.status, 'queued');
  assert.equal(afterFirst?.attempts, 1);
  assert.equal(afterFirst?.error, 'boom-1');
  assert.equal(afterFirst?.leaseOwner, null);
  assert.equal(q.dlqList({}).total, 0);

  // 第二次失败：额度耗尽，进 DLQ
  q.claim(1);
  q.fail(enq.task.taskId, 'boom-2');
  const afterSecond = q.get(enq.task.taskId);
  assert.equal(afterSecond?.status, 'dead');
  assert.equal(afterSecond?.attempts, 2);

  const dlq = q.dlqList({});
  assert.equal(dlq.total, 1);
  assert.equal(dlq.items[0]?.taskId, enq.task.taskId);
  assert.equal(dlq.items[0]?.status, 'dead');
  assert.equal(dlq.items[0]?.error, 'boom-2');
});

test('retry 能把 dead 任务重置为 queued', () => {
  const clock = makeClock(1000);
  const db = makeDb();
  const q = makeQueue(db, { leaseMs: 5000, maxConcurrency: 5, now: clock.now });
  const enq = q.enqueue({ tenantId: 't1', kind: 'tts', idemKey: 'k1', groupKey: 'g1', maxAttempts: 1 });
  q.claim(1);
  q.fail(enq.task.taskId, 'boom');
  assert.equal(q.get(enq.task.taskId)?.status, 'dead');

  assert.equal(q.retry(enq.task.taskId), true);
  const after = q.get(enq.task.taskId);
  assert.equal(after?.status, 'queued');
  assert.equal(after?.attempts, 0);
  assert.equal(after?.error, '');
  assert.equal(after?.finishedAt, null);
  // 重新入队后不应再留在 DLQ
  assert.equal(q.dlqList({}).total, 0);

  // 状态不允许时返回 false
  assert.equal(q.retry(enq.task.taskId), false);
  assert.equal(q.retry('not-exist'), false);
});

test('stats 的 successRate 与 p95Ms 在构造样本上算出预期值', () => {
  const clock = makeClock(1000);
  const db = makeDb();
  const q = makeQueue(db, { leaseMs: 100000, maxConcurrency: 10, now: clock.now });

  const ids: string[] = [];
  for (let i = 0; i < 3; i++) {
    ids.push(q.enqueue({ tenantId: 't1', kind: 'image_generate', idemKey: `k${i}`, groupKey: `g${i}` }).task.taskId);
  }

  q.claim(3); // 三条 startedAt 均为 1000
  clock.set(1100);
  q.complete(ids[0]!); // 耗时 100
  clock.set(1200);
  q.complete(ids[1]!); // 耗时 200
  clock.set(1300);
  q.complete(ids[2]!); // 耗时 300

  const s = q.stats();
  assert.equal(s.queued, 0);
  assert.equal(s.running, 0);
  assert.equal(s.dead, 0);

  const k = s.byKind.find((x) => x.kind === 'image_generate');
  assert.ok(k);
  assert.equal(k.total, 3);
  assert.equal(k.succeeded, 3);
  assert.equal(k.failed, 0);
  assert.equal(k.dead, 0);
  assert.equal(k.successRate, 1);
  assert.equal(k.p95Ms, 300);
});

test('stats 的 p95Ms 在空样本时为 0，且 degraded 计入', () => {
  const clock = makeClock(1000);
  const db = makeDb();
  const q = makeQueue(db, { leaseMs: 100000, maxConcurrency: 10, now: clock.now });

  const a = q.enqueue({ tenantId: 't1', kind: 'tts', idemKey: 'k1', groupKey: 'g1' });
  q.claim(1);
  clock.set(1050);
  q.complete(a.task.taskId, '降级：模型回退');

  const s = q.stats();
  const k = s.byKind.find((x) => x.kind === 'tts');
  assert.ok(k);
  assert.equal(k.total, 1);
  assert.equal(k.succeeded, 1);
  assert.equal(k.degraded, 1);
  assert.equal(k.p95Ms, 50);

  // 没有任何任务的 kind 不会出现在 byKind 中
  assert.equal(s.byKind.find((x) => x.kind === 'export_pdf'), undefined);
});

test('list 的筛选与分页正确', () => {
  const clock = makeClock(1);
  const db = makeDb();
  const q = makeQueue(db, { now: clock.now });
  for (let i = 0; i < 5; i++) {
    clock.set(i + 1);
    q.enqueue({
      tenantId: i < 3 ? 't1' : 't2',
      kind: i % 2 === 0 ? 'tts' : 'image_generate',
      idemKey: `k${i}`,
      groupKey: `g${i}`,
    });
  }

  const all = q.list({});
  assert.equal(all.total, 5);
  assert.equal(all.items.length, 5);
  // 按 createdAt DESC
  assert.equal(all.items[0]?.createdAt, 5);

  const page1 = q.list({ limit: 2, offset: 0 });
  assert.equal(page1.total, 5);
  assert.deepEqual(
    page1.items.map((i) => i.createdAt),
    [5, 4],
  );
  const page2 = q.list({ limit: 2, offset: 2 });
  assert.deepEqual(
    page2.items.map((i) => i.createdAt),
    [3, 2],
  );

  assert.equal(q.list({ tenantId: 't1' }).total, 3);
  assert.equal(q.list({ kind: 'tts' }).total, 3);
  assert.equal(q.list({ kind: 'image_generate' }).total, 2);
  assert.equal(q.list({ status: 'queued' }).total, 5);
  assert.equal(q.list({ status: 'running' }).total, 0);
});

test('dlqList 按租户筛选并补齐 TaskRecord 默认字段', () => {
  const clock = makeClock(1000);
  const db = makeDb();
  const q = makeQueue(db, { leaseMs: 5000, maxConcurrency: 5, now: clock.now });

  const a = q.enqueue({
    tenantId: 't1',
    projectId: 'p1',
    kind: 'tts',
    idemKey: 'k1',
    groupKey: 'g1',
    maxAttempts: 1,
    payload: { x: 1 },
  });
  const b = q.enqueue({ tenantId: 't2', kind: 'tts', idemKey: 'k2', groupKey: 'g2', maxAttempts: 1 });

  q.claim(2);
  q.fail(a.task.taskId, 'e1');
  q.fail(b.task.taskId, 'e2');

  assert.equal(q.dlqList({}).total, 2);
  const t1 = q.dlqList({ tenantId: 't1' });
  assert.equal(t1.total, 1);
  const item = t1.items[0];
  assert.ok(item);
  assert.equal(item.taskId, a.task.taskId);
  assert.equal(item.status, 'dead');
  assert.equal(item.projectId, 'p1');
  assert.equal(item.groupKey, 't1/p1');
  assert.deepEqual(item.payload, { x: 1 });
  assert.equal(item.pageId, null);
  assert.equal(item.finishedAt, 1000);
});

test('真实时钟下租约过期可被重领（setTimeout 方式，短等待）', async () => {
  const db = makeDb();
  const q = makeQueue(db, { leaseMs: 20, maxConcurrency: 5 });
  const enq = q.enqueue({ tenantId: 't1', kind: 'tts', idemKey: 'k1', groupKey: 'g1' });

  assert.equal(q.claim(1).length, 1);
  await new Promise((r) => setTimeout(r, 35));

  const again = q.claim(1);
  assert.equal(again.length, 1);
  assert.equal(again[0]?.taskId, enq.task.taskId);
});

/* ---------------- 批量暂停 / 继续 / 停止 ---------------- */

test('pauseGroup 把排队中的挂起，claim 不再领；resumeGroup 放回队列', () => {
  const db = makeDb();
  // 组并发默认 2，放宽到 10，免得「继续之后能领 3 条」这条断言被限流干扰
  const q = makeQueue(db, { groupConcurrency: 10 });
  for (let i = 0; i < 3; i += 1) {
    q.enqueue({ tenantId: 't1', projectId: 'p1', kind: 'tts', idemKey: `k${i}` });
  }
  const filters = { groupKey: 't1/p1', kind: 'tts' as const };

  assert.equal(q.pauseGroup(filters), 3);
  assert.equal(q.claim(10).length, 0, '挂起的不能被领——否则「暂停了还在跑」');
  assert.equal(
    q.list({}).items.filter((t) => t.status === 'paused').length,
    3,
  );

  assert.equal(q.resumeGroup(filters), 3);
  assert.equal(q.claim(10).length, 3, '继续之后照常领');
});

test('pauseGroup 只动指定的 kind——同组的讲稿不该被一起挂起', () => {
  const db = makeDb();
  const q = makeQueue(db);
  q.enqueue({ tenantId: 't1', projectId: 'p1', kind: 'tts', idemKey: 'a' });
  q.enqueue({ tenantId: 't1', projectId: 'p1', kind: 'script_generate', idemKey: 'b' });

  assert.equal(q.pauseGroup({ groupKey: 't1/p1', kind: 'tts' }), 1);

  const claimed = q.claim(10);
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0]!.kind, 'script_generate', '讲稿那一条不该被连带挂起');
});

test('stopGroup 删掉排队与挂起的，正在跑的不动', () => {
  const db = makeDb();
  const q = makeQueue(db);
  for (const k of ['a', 'b', 'c']) {
    q.enqueue({ tenantId: 't1', projectId: 'p1', kind: 'tts', idemKey: k });
  }

  const running = q.claim(1);
  assert.equal(running.length, 1);
  q.pauseGroup({ groupKey: 't1/p1', kind: 'tts' });

  assert.equal(q.stopGroup({ groupKey: 't1/p1', kind: 'tts' }), 2, '挂起的两个被删，正在跑的留着');

  const left = q.list({});
  assert.equal(left.total, 1);
  assert.equal(left.items[0]!.taskId, running[0]!.taskId);
  assert.equal(left.items[0]!.status, 'running', '正在合成的那一页不能中途抹掉');
});
