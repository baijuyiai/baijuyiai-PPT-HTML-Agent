import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, setDbForTest } from '../db/client.js';
import { migrate } from '../db/migrate.js';
import { listUsage, recordUsage, usageSummary } from './usage.service.js';

function freshDb() {
  const d = openDatabase(':memory:');
  setDbForTest(d);
  migrate();
  return d;
}

/** 一条人民币文本调用 + 一条美元图片调用，用来看两种币种是否各归各的 */
function seedMixedCurrencies() {
  recordUsage({
    tenantId: 'tn_1', userId: 'u_1', projectId: 'prj_1', taskType: 'page_content',
    kind: 'text', providerId: 'prv_cny', model: 'deepseek-v4.1-flash',
    amount: 1, inputTokens: 298, outputTokens: 524, cost: 0.004788, currency: 'CNY', latencyMs: 900, ok: true,
  });
  recordUsage({
    tenantId: 'tn_1', userId: 'u_1', projectId: 'prj_1', taskType: 'image',
    kind: 'image', providerId: 'prv_usd', model: 'gpt-image-2.5-sunburst',
    amount: 2, inputTokens: 0, outputTokens: 0, cost: 0.04, currency: 'USD', latencyMs: 57000, ok: true,
  });
}

test('用量汇总把不同币种的费用分桶，不做相加', () => {
  freshDb();
  seedMixedCurrencies();

  const s = usageSummary({ tenantId: 'tn_1' });
  assert.equal(s.calls, 2);
  assert.equal(s.tokens, 822);
  assert.equal(s.images, 2);

  assert.deepEqual(s.costs, [
    { currency: 'USD', amount: 0.04 },
    { currency: 'CNY', amount: 0.004788 },
  ], '金额大的排在前面');
});

test('按 Provider 与任务类型分组时，各组也各自带币种桶', () => {
  freshDb();
  seedMixedCurrencies();

  const s = usageSummary({ tenantId: 'tn_1' });

  const cny = s.byProvider.find((p) => p.providerId === 'prv_cny')!;
  assert.deepEqual(cny.costs, [{ currency: 'CNY', amount: 0.004788 }]);
  assert.equal(cny.tokens, 822);

  const usd = s.byProvider.find((p) => p.providerId === 'prv_usd')!;
  assert.deepEqual(usd.costs, [{ currency: 'USD', amount: 0.04 }]);
  assert.equal(usd.images, 2);

  const image = s.byTaskType.find((t) => t.taskType === 'image')!;
  assert.deepEqual(image.costs, [{ currency: 'USD', amount: 0.04 }]);
});

test('同一个 Provider 同时产生两种币种时，该组内也分成两桶', () => {
  freshDb();
  recordUsage({
    tenantId: 'tn_1', taskType: 'image', kind: 'image', providerId: 'prv_x',
    amount: 1, cost: 0.02, currency: 'USD', ok: true,
  });
  recordUsage({
    tenantId: 'tn_1', taskType: 'image', kind: 'image', providerId: 'prv_x',
    amount: 1, cost: 0.15, currency: 'CNY', ok: true,
  });

  const group = usageSummary({ tenantId: 'tn_1' }).byProvider[0]!;
  assert.equal(group.providerId, 'prv_x');
  assert.deepEqual(group.costs, [
    { currency: 'CNY', amount: 0.15 },
    { currency: 'USD', amount: 0.02 },
  ]);
});

test('筛选条件会同时作用于计数与费用两张查询', () => {
  freshDb();
  seedMixedCurrencies();
  recordUsage({
    tenantId: 'tn_2', taskType: 'image', kind: 'image', providerId: 'prv_other',
    amount: 1, cost: 9.99, currency: 'CNY', ok: true,
  });

  const s = usageSummary({ tenantId: 'tn_1' });
  assert.equal(s.calls, 2);
  assert.ok(
    !s.costs.some((c) => c.amount === 9.99),
    '别的租户的 9.99 不能漏进这个租户的费用桶',
  );
});

test('没有费用时返回空桶数组而不是零额桶', () => {
  freshDb();
  recordUsage({
    tenantId: 'tn_1', taskType: 'outline', kind: 'text', providerId: 'prv_mock',
    amount: 1, inputTokens: 10, outputTokens: 20, cost: 0, currency: 'CNY', ok: true,
  });

  const s = usageSummary({ tenantId: 'tn_1' });
  assert.deepEqual(s.costs, []);
  assert.deepEqual(s.byProvider[0]!.costs, []);
  assert.equal(s.calls, 1);
});

test('原始记录带出币种，供逐行展示', () => {
  freshDb();
  seedMixedCurrencies();

  const { items } = listUsage({ tenantId: 'tn_1' });
  const usd = items.find((r) => r.providerId === 'prv_usd')!;
  assert.equal(usd.currency, 'USD');
  assert.equal(usd.cost, 0.04);
  assert.equal(items.find((r) => r.providerId === 'prv_cny')!.currency, 'CNY');
});
