import type { ProviderGateway } from '@lumen/provider-gateway';
import { buildGateway } from './provider.service.js';
import { recordUsage } from './usage.service.js';

/**
 * 建一个会把花费落账的网关。
 *
 * 不挂 `onUsage` 的网关，它发起的调用**不进 `usage_records`**，而「用量与计费」页
 * 正是从那张表算的——漏挂不会报错，只会让整类开销从账上消失。所以凡是真花钱的
 * 调用点，一律走这个函数，不要直接 `buildGateway()`。
 */
export function billedGateway(tenantId: string, userId: string): ProviderGateway {
  return buildGateway({
    onUsage: {
      record: (e) => recordUsage({
        tenantId, userId,
        taskType: e.taskType, kind: e.kind, providerId: e.providerId, model: e.model,
        amount: e.amount, inputTokens: e.inputTokens, outputTokens: e.outputTokens,
        cost: e.cost, currency: e.currency, latencyMs: e.latencyMs,
        ok: e.ok, degradeReason: e.degradeReason,
      }),
    },
  });
}
