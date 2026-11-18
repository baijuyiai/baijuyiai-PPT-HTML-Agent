import { all, count, get, insertRow, parseJson, updateRow } from '../db/client.js';
import { hashPassword, newId } from '../lib/crypto.js';
import { conflict, notFound } from '../lib/errors.js';
import {
  DEFAULT_QUOTA,
  mergeCostBuckets,
  type CostBucket,
  type Quota,
  type Role,
  type UserAdminView,
  type UserPublic,
  type UserSource,
  type UserStatus,
} from '@lumen/ir-schema';

export interface UserRow {
  userId: string;
  tenantId: string;
  username: string;
  email: string;
  passwordHash: string;
  role: string;
  status: string;
  source: string;
  mustChangePassword: number;
  createdBy: string;
  quota: string;
  createdAt: number;
  lastLoginAt: number;
}

export function toPublic(row: UserRow): UserPublic {
  return {
    userId: row.userId,
    tenantId: row.tenantId,
    username: row.username,
    email: row.email,
    role: row.role as Role,
    status: row.status as UserStatus,
    source: row.source as UserSource,
    mustChangePassword: row.mustChangePassword === 1,
    createdBy: row.createdBy,
    quota: parseJson<Quota>(row.quota, { ...DEFAULT_QUOTA }),
    createdAt: row.createdAt,
    lastLoginAt: row.lastLoginAt,
  };
}

export function findById(userId: string): UserRow | undefined {
  return get<UserRow>('SELECT * FROM users WHERE userId = ?', userId);
}

export function requireById(userId: string): UserRow {
  const row = findById(userId);
  if (!row) throw notFound('用户不存在');
  return row;
}

/** 账号支持用户名或邮箱登录 */
export function findByLogin(login: string): UserRow | undefined {
  const key = login.trim();
  return get<UserRow>(
    'SELECT * FROM users WHERE username = ? OR (email <> \'\' AND email = ?) LIMIT 1',
    key, key,
  );
}

export function isUsernameTaken(username: string): boolean {
  return count('SELECT COUNT(*) AS n FROM users WHERE username = ?', username) > 0;
}

export function isEmailTaken(email: string): boolean {
  if (!email) return false;
  return count('SELECT COUNT(*) AS n FROM users WHERE email = ?', email) > 0;
}

export interface CreateUserInput {
  username: string;
  email?: string;
  password: string;
  role: Role;
  source: UserSource;
  createdBy?: string;
  mustChangePassword?: boolean;
  quota?: Partial<Quota>;
  /** 管理员建号可指定租户；自助注册一律新建独立租户 */
  tenantId?: string;
}

export function createUser(input: CreateUserInput): UserRow {
  const username = input.username.trim();
  if (isUsernameTaken(username)) throw conflict('用户名已被占用');
  const email = (input.email ?? '').trim();
  if (email && isEmailTaken(email)) throw conflict('邮箱已被占用');

  const userId = newId('usr');
  const tenantId = input.tenantId ?? newId('tn');
  insertRow('users', {
    userId,
    tenantId,
    username,
    email,
    passwordHash: hashPassword(input.password),
    role: input.role,
    status: 'active',
    source: input.source,
    mustChangePassword: input.mustChangePassword ?? false,
    createdBy: input.createdBy ?? '',
    quota: JSON.stringify({ ...DEFAULT_QUOTA, ...(input.quota ?? {}) }),
    createdAt: Date.now(),
    lastLoginAt: 0,
  });
  return requireById(userId);
}

export interface UpdateUserInput {
  email?: string;
  role?: Role;
  status?: UserStatus;
  quota?: Quota;
  password?: string;
  mustChangePassword?: boolean;
}

export function updateUser(userId: string, patch: UpdateUserInput): UserRow {
  requireById(userId);
  const set: Record<string, unknown> = {};
  if (patch.email !== undefined) {
    const email = patch.email.trim();
    if (email) {
      const other = get<{ userId: string }>('SELECT userId FROM users WHERE email = ? AND userId <> ?', email, userId);
      if (other) throw conflict('邮箱已被占用');
    }
    set.email = email;
  }
  if (patch.role !== undefined) set.role = patch.role;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.quota !== undefined) set.quota = JSON.stringify(patch.quota);
  if (patch.password !== undefined) set.passwordHash = hashPassword(patch.password);
  if (patch.mustChangePassword !== undefined) set.mustChangePassword = patch.mustChangePassword;
  updateRow('users', 'userId', userId, set);
  return requireById(userId);
}

export function touchLogin(userId: string): void {
  updateRow('users', 'userId', userId, { lastLoginAt: Date.now() });
}

export interface UserListQuery {
  q?: string;
  role?: string;
  status?: string;
  source?: string;
  createdFrom?: number;
  createdTo?: number;
  limit?: number;
  offset?: number;
}

/** CRM 列表：含项目数、累计页数、累计费用与用量（PRD §5.12） */
export function listUsers(q: UserListQuery): { items: UserAdminView[]; total: number } {
  const where: string[] = ['1 = 1'];
  const params: unknown[] = [];
  if (q.q) {
    where.push('(username LIKE ? OR email LIKE ?)');
    const like = `%${q.q}%`;
    params.push(like, like);
  }
  if (q.role) {
    where.push('role = ?');
    params.push(q.role);
  }
  if (q.status) {
    where.push('status = ?');
    params.push(q.status);
  }
  if (q.source) {
    where.push('source = ?');
    params.push(q.source);
  }
  if (q.createdFrom) {
    where.push('createdAt >= ?');
    params.push(q.createdFrom);
  }
  if (q.createdTo) {
    where.push('createdAt <= ?');
    params.push(q.createdTo);
  }
  const clause = where.join(' AND ');
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 500);
  const offset = Math.max(q.offset ?? 0, 0);

  const total = count(`SELECT COUNT(*) AS n FROM users WHERE ${clause}`, ...params);
  const rows = all<UserRow>(`SELECT * FROM users WHERE ${clause} ORDER BY createdAt DESC LIMIT ? OFFSET ?`, ...params, limit, offset);

  const items = rows.map((row) => ({ ...toPublic(row), ...aggregatesFor(row.userId) }));
  return { items, total };
}

/** 单个用户的聚合用量 */
export function aggregatesFor(userId: string): Pick<UserAdminView, 'projectCount' | 'pageCount' | 'costs' | 'tokensUsed' | 'imagesUsed'> {
  const projectCount = count('SELECT COUNT(*) AS n FROM projects WHERE ownerId = ?', userId);
  const pageCount = count('SELECT COUNT(*) AS n FROM pages WHERE tenantId = (SELECT tenantId FROM users WHERE userId = ?)', userId);
  const usage = get<{ tokens: number; images: number }>(
    `SELECT
       COALESCE(SUM(CASE WHEN kind = 'text'  THEN inputTokens + outputTokens ELSE 0 END), 0) AS tokens,
       COALESCE(SUM(CASE WHEN kind = 'image' THEN amount ELSE 0 END), 0) AS images
     FROM usage_records WHERE userId = ?`,
    userId,
  );
  const costs = mergeCostBuckets(
    all<CostBucket>(
      `SELECT currency, COALESCE(SUM(cost), 0) AS amount
       FROM usage_records WHERE userId = ? GROUP BY currency`,
      userId,
    ),
  );
  return {
    projectCount,
    pageCount,
    costs,
    tokensUsed: usage?.tokens ?? 0,
    imagesUsed: usage?.images ?? 0,
  };
}
