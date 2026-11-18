import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 环境必须在导入任何模块之前设定
const tmp = mkdtempSync(join(tmpdir(), 'lumen-billed-'));
process.env.NODE_ENV = 'test';
process.env.LUMEN_DB_PATH = join(tmp, 'test.db');
process.env.LUMEN_SECRET_KEY = 'test-secret-key-0123456789abcdefghijklmnop';

const { migrate } = await import('../db/migrate.js');
const { closeDb } = await import('../db/client.js');
const { ensureSeed } = await import('./seed.service.js');
const { billedGateway } = await import('./billed-gateway.js');
const { buildGateway } = await import('./provider.service.js');
const { listUsage } = await import('./usage.service.js');

migrate();
ensureSeed();

test.after(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * 这一组要验的是**落账**，不是模型本身。
 *
 * `ensureSeed` 建了内置 Mock Provider 与七个任务类型的默认路由，所以这里的
 * `gateway.text(...)` 会真的走一遍网关（选路由、调客户端、算出用量），
 * 只是落到 Mock 客户端上——不需要真 Key，也就真的验证了「调用发生时会写一行」，
 * 而不是只验「函数返回了东西」。
 */

test('走 billedGateway 的调用会进 usage_records', async () => {
  const before = listUsage({ tenantId: 'tn_billed' }).total;
  assert.equal(before, 0, '前置条件：这个租户一开始没有记录');

  const gateway = billedGateway('tn_billed', 'u_billed');
  await gateway.text({
    taskType: 'html_codegen',
    maxTokens: 100,
    system: 'x',
    messages: [{ role: 'user', content: 'y' }],
  });

  const { items, total } = listUsage({ tenantId: 'tn_billed' });
  assert.equal(total, 1, '一次文本调用应恰好落一条用量');
  assert.equal(items[0]!.tenantId, 'tn_billed', '租户要对得上');
  assert.equal(items[0]!.userId, 'u_billed', '用户要对得上');
  assert.equal(items[0]!.kind, 'text');
  assert.equal(items[0]!.ok, true, '成功的调用要标成成功');
  assert.equal(items[0]!.providerId, 'prv_mock', '落账应记下真正服务这次调用的 Provider');
  assert.equal(items[0]!.taskType, 'html_codegen');
});

test('不挂 onUsage 的网关调用不进 usage_records——这正是既存缺口的样子', async () => {
  // 同一条路由、同一个 Mock 客户端，唯一差别是没挂 onUsage
  const gateway = buildGateway();
  await gateway.text({
    taskType: 'html_codegen',
    maxTokens: 100,
    system: 'x',
    messages: [{ role: 'user', content: 'y' }],
  });

  assert.equal(
    listUsage({ tenantId: 'tn_unbilled' }).total,
    0,
    '不落账时调用照样成功，但账上一条都没有——漏挂不会报错，只会静默消失',
  );
});
