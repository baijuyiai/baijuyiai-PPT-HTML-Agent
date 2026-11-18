import { count, get, insertRow, run, updateRow } from '../db/client.js';
import { hashPassword, newId } from '../lib/crypto.js';
import { recordAudit } from '../lib/audit.js';
import { env } from '../env.js';
import {
  DEFAULT_LOCKED_ROUTES,
  DEFAULT_AUDIO_MODEL,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_QUOTA,
  DEFAULT_TEXT_MODEL,
  type TaskType,
} from '@lumen/ir-schema';
import { logger } from '../lib/logger.js';
import type { UserRow } from './user.service.js';

export const ADMIN_USERNAME = 'admin';
export const MOCK_PROVIDER_ID = 'prv_mock';

/** 各任务类型的默认模型（PRD §5.11 任务级路由表） */
const ROUTE_DEFAULTS: { taskType: TaskType; model: string }[] = [
  { taskType: 'outline', model: DEFAULT_TEXT_MODEL },
  { taskType: 'page_content', model: DEFAULT_TEXT_MODEL },
  { taskType: 'html_codegen', model: DEFAULT_TEXT_MODEL },
  { taskType: 'script', model: DEFAULT_TEXT_MODEL },
  { taskType: 'remotion_config', model: DEFAULT_TEXT_MODEL },
  { taskType: 'style_recognize', model: DEFAULT_TEXT_MODEL },
  { taskType: 'logo_redraw', model: DEFAULT_TEXT_MODEL },
  { taskType: 'image', model: DEFAULT_IMAGE_MODEL },
  { taskType: 'tts', model: DEFAULT_AUDIO_MODEL },
];

/**
 * 幂等种子。返回本次新建的条目名。
 * - 内置管理员 admin（默认密码取 LUMEN_ADMIN_PASSWORD，是否强制改密见 LUMEN_ADMIN_FORCE_PASSWORD_CHANGE）
 * - 内置 Mock Provider（无 Key 也能把全链路跑通）
 * - 七个任务类型路由（html_codegen 与 image 默认锁定）
 */
export function ensureSeed(): string[] {
  const created: string[] = [];

  if (count('SELECT COUNT(*) AS n FROM users WHERE role = ?', 'admin') === 0) {
    insertRow('users', {
      userId: newId('usr'),
      tenantId: 'tn_admin',
      username: ADMIN_USERNAME,
      email: '',
      passwordHash: hashPassword(env.LUMEN_ADMIN_PASSWORD),
      role: 'admin',
      status: 'active',
      source: 'system',
      mustChangePassword: env.adminForcePasswordChange,
      createdBy: '',
      quota: JSON.stringify({ ...DEFAULT_QUOTA, maxProjects: 0, maxConcurrency: 10, maxTokens: 0, maxImages: 0 }),
      createdAt: Date.now(),
      lastLoginAt: 0,
    });
    created.push('admin 账号');
  }

  if (!get('SELECT providerId FROM providers WHERE providerId = ?', MOCK_PROVIDER_ID)) {
    insertRow('providers', {
      providerId: MOCK_PROVIDER_ID,
      name: '内置 Mock 网关',
      type: 'openai-compatible',
      baseUrl: '',
      apiKeyRef: '',
      pathPrefix: '/v1',
      headers: '{}',
      models: JSON.stringify({
        text: [DEFAULT_TEXT_MODEL],
        image: [DEFAULT_IMAGE_MODEL],
        audio: [DEFAULT_AUDIO_MODEL],
      }),
      timeoutMs: 60000,
      maxRetries: 2,
      concurrency: 5,
      costLimitTokens: 0,
      costLimitImages: 0,
      enabled: 1,
      isMock: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    created.push('内置 Mock Provider');
  }

  for (const { taskType, model } of ROUTE_DEFAULTS) {
    const existing = get<{ routeId: string }>('SELECT routeId FROM task_routes WHERE taskType = ?', taskType);
    if (existing) continue;
    insertRow('task_routes', {
      routeId: newId('rt'),
      taskType,
      primaryRef: JSON.stringify({ providerId: MOCK_PROVIDER_ID, model }),
      fallbacks: '[]',
      locked: DEFAULT_LOCKED_ROUTES.includes(taskType) ? 1 : 0,
      updatedAt: Date.now(),
    });
    created.push(`任务路由 ${taskType}`);
  }

  if (created.length > 0) logger.info('种子数据就绪', { created });
  return created;
}

/** 运维用：把某个路由的主模型切到指定 Provider（admin 显式操作，用于一键切备用） */
export function switchRoutePrimary(taskType: TaskType, providerId: string, model: string): void {
  updateRow('task_routes', 'taskType', taskType, {
    primaryRef: JSON.stringify({ providerId, model }),
    updatedAt: Date.now(),
  });
}

/** 内置管理员账号；不存在时返回 undefined */
export function findAdmin(): UserRow | undefined {
  return get<UserRow>('SELECT * FROM users WHERE username = ? AND role = ?', ADMIN_USERNAME, 'admin');
}

export interface SetAdminPasswordOptions {
  /** 置为 true 时要求下次登录改密 */
  forceChange: boolean;
}

/**
 * 重设内置管理员的密码（本地运维用，供 `pnpm admin:reset` 调用）。
 *
 * 与 auth.service 的 resetPassword 的关键差别：**这里不做密码策略校验**。
 * 这是 break-glass 通道——能在这台机器上跑脚本的人本来就能直接改库，
 * 在 CLI 上卡「密码必须含数字」只会把人锁在自己的默认密码外面（默认密码 admin 本身
 * 就不满足策略）。远程接口仍然一律走 passwordPolicyError，不走这条路。
 */
export function setAdminPassword(password: string, opts: SetAdminPasswordOptions): UserRow {
  const admin = findAdmin();
  if (!admin) throw new Error(`内置管理员不存在，先执行 pnpm seed`);
  if (password.length === 0) throw new Error('密码不能为空');

  updateRow('users', 'userId', admin.userId, {
    passwordHash: hashPassword(password),
    mustChangePassword: opts.forceChange,
    // 解禁：管理员可能因为连续登录失败被锁，重置密码理应同时解锁
    status: 'active',
  });
  // 旧会话立即失效，否则改了密码但别人手里的刷新令牌还能用
  run('UPDATE refresh_tokens SET revoked = 1 WHERE userId = ?', admin.userId);
  recordAudit({
    tenantId: admin.tenantId,
    userId: admin.userId,
    action: 'reset_password',
    target: admin.userId,
    meta: { via: 'cli', forceChange: opts.forceChange },
    ip: 'local',
  });

  return get<UserRow>('SELECT * FROM users WHERE userId = ?', admin.userId)!;
}
