/**
 * 配额检查。超限必须拒绝并给出明确提示，不静默降级（PRD §5.12 / §8）。
 * 0 表示不限。
 */

import { count, get, parseJson } from '../db/client.js';
import { quotaExceeded, notFound } from './errors.js';
import { DEFAULT_QUOTA, type Quota } from '@lumen/ir-schema';

export function getUserQuota(userId: string): Quota {
  const row = get<{ quota: string }>('SELECT quota FROM users WHERE userId = ?', userId);
  if (!row) throw notFound('用户不存在');
  return parseJson<Quota>(row.quota, { ...DEFAULT_QUOTA });
}

export type QuotaKind = 'project' | 'image' | 'token';

export interface QuotaState {
  quota: Quota;
  used: { projects: number; images: number; tokens: number };
}

export function quotaState(userId: string): QuotaState {
  const quota = getUserQuota(userId);
  const projects = count('SELECT COUNT(*) AS n FROM projects WHERE ownerId = ?', userId);
  const images = count(
    "SELECT COALESCE(SUM(amount),0) AS n FROM usage_records WHERE userId = ? AND kind = 'image' AND ok = 1",
    userId,
  );
  const tokens = count(
    "SELECT COALESCE(SUM(inputTokens + outputTokens),0) AS n FROM usage_records WHERE userId = ? AND kind = 'text' AND ok = 1",
    userId,
  );
  return { quota, used: { projects, images, tokens } };
}

/**
 * 断言配额足够，不足则抛 QUOTA_EXCEEDED。
 * @param amount 本次将消耗的量（项目固定为 1）
 */
export function assertQuota(userId: string, kind: QuotaKind, amount = 1): void {
  const { quota, used } = quotaState(userId);
  if (kind === 'project' && quota.maxProjects > 0 && used.projects + amount > quota.maxProjects) {
    throw quotaExceeded(`项目数已达上限（${used.projects}/${quota.maxProjects}），请删除旧项目或联系管理员提升配额`);
  }
  if (kind === 'image' && quota.maxImages > 0 && used.images + amount > quota.maxImages) {
    throw quotaExceeded(`图片生成额度不足（已用 ${used.images}/${quota.maxImages} 张），请联系管理员提升配额`);
  }
  if (kind === 'token' && quota.maxTokens > 0 && used.tokens + amount > quota.maxTokens) {
    throw quotaExceeded(`文本额度不足（已用 ${used.tokens}/${quota.maxTokens} token），请联系管理员提升配额`);
  }
}
