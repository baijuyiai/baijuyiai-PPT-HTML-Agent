import { count, get, insertRow, run, updateRow } from '../db/client.js';
import { hashPassword, hashToken, newId, newOpaqueToken, verifyPassword } from '../lib/crypto.js';
import { conflict, forbidden, invalid, lockedOut, rateLimited, unauthorized } from '../lib/errors.js';
import { recordAudit } from '../lib/audit.js';
import { ACCESS_TTL_SEC, REFRESH_TTL_MS, signAccess } from '../lib/jwt.js';
import { createUser, findByLogin, isUsernameTaken, requireById, toPublic, touchLogin, type UserRow } from './user.service.js';
import { allowSelfSignup, signupPerHour } from './settings.service.js';
import { hit } from '../lib/ratelimit.js';
import { LOGIN_LOCK_MS, LOGIN_MAX_FAILURES, passwordPolicyError, type UserPublic } from '@lumen/ir-schema';

export interface Session {
  user: UserPublic;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/* ---------------- 登录失败锁定 ---------------- */

function recentFailures(username: string): number {
  return count(
    'SELECT COUNT(*) AS n FROM login_attempts WHERE username = ? AND ok = 0 AND createdAt >= ?',
    username, Date.now() - LOGIN_LOCK_MS,
  );
}

function lockRemainingMs(username: string): number {
  const row = get<{ createdAt: number }>(
    'SELECT createdAt FROM login_attempts WHERE username = ? AND ok = 0 ORDER BY createdAt DESC LIMIT 1',
    username,
  );
  if (!row) return 0;
  return Math.max(0, row.createdAt + LOGIN_LOCK_MS - Date.now());
}

function recordAttempt(username: string, ip: string, ok: boolean): void {
  insertRow('login_attempts', { username, ip, ok, createdAt: Date.now() });
}

/* ---------------- 刷新令牌 ---------------- */

function issueRefreshToken(user: UserRow): string {
  const raw = newOpaqueToken(32);
  insertRow('refresh_tokens', {
    tokenId: newId('rt'),
    userId: user.userId,
    tenantId: user.tenantId,
    tokenHash: hashToken(raw),
    expiresAt: Date.now() + REFRESH_TTL_MS,
    revoked: 0,
    createdAt: Date.now(),
  });
  return raw;
}

async function buildSession(user: UserRow): Promise<Session> {
  const accessToken = await signAccess({
    sub: user.userId,
    tid: user.tenantId,
    role: user.role as UserPublic['role'],
    mcp: user.mustChangePassword === 1,
  });
  return {
    user: toPublic(user),
    accessToken,
    refreshToken: issueRefreshToken(user),
    expiresIn: ACCESS_TTL_SEC,
  };
}

/* ---------------- 登录 ---------------- */

export interface LoginInput {
  login: string;
  password: string;
  ip: string;
}

export async function login(input: LoginInput): Promise<Session> {
  const loginKey = input.login.trim();
  if (!loginKey || !input.password) throw invalid('请输入账号与密码');

  const failures = recentFailures(loginKey);
  if (failures >= LOGIN_MAX_FAILURES) {
    const mins = Math.ceil(lockRemainingMs(loginKey) / 60000);
    throw lockedOut(`登录失败次数过多，请 ${mins} 分钟后重试`);
  }

  const user = findByLogin(loginKey);
  if (!user || !verifyPassword(input.password, user.passwordHash)) {
    recordAttempt(loginKey, input.ip, false);
    recordAudit({
      tenantId: user?.tenantId ?? 'unknown',
      userId: user?.userId ?? '',
      action: 'login_failed',
      target: loginKey,
      meta: { attempts: failures + 1 },
      ip: input.ip,
    });
    throw unauthorized('账号或密码错误');
  }

  if (user.status !== 'active') {
    recordAudit({ tenantId: user.tenantId, userId: user.userId, action: 'login_failed', target: 'disabled', ip: input.ip });
    throw forbidden('账号已被禁用，请联系管理员');
  }

  recordAttempt(loginKey, input.ip, true);
  touchLogin(user.userId);
  recordAudit({ tenantId: user.tenantId, userId: user.userId, action: 'login', ip: input.ip });
  return buildSession(requireById(user.userId));
}

/* ---------------- 自助注册 ---------------- */

export interface RegisterInput {
  username: string;
  password: string;
  email?: string;
  ip: string;
}

/** 由邮箱前缀派生一个没被占用的用户名 */
function uniqueUsername(prefix: string): string {
  const base = prefix.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 56) || 'user';
  const padded = base.length >= 3 ? base : `${base}${'0'.repeat(3 - base.length)}`;
  if (!isUsernameTaken(padded)) return padded;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${padded}${i}`;
    if (!isUsernameTaken(candidate)) return candidate;
  }
  throw conflict('无法为该邮箱分配用户名，请换一个账号');
}

export async function register(input: RegisterInput): Promise<Session> {
  if (!allowSelfSignup()) throw forbidden('本站已关闭自助注册');

  const limit = hit(`signup:${input.ip}`, signupPerHour(), 60 * 60 * 1000);
  if (!limit.allowed) throw rateLimited('注册过于频繁，请稍后再试');

  const raw = input.username.trim();
  if (!/^[A-Za-z0-9_.@-]{3,64}$/.test(raw)) {
    throw invalid('账号需为 3-64 位字母、数字、下划线、点、@ 或短横线');
  }
  const pwErr = passwordPolicyError(input.password);
  if (pwErr) throw invalid(pwErr);

  /**
   * 账号支持用户名或邮箱（PRD §5.1）。
   * 填的是邮箱时把它记进 email 列——否则「用邮箱找回」和 CRM 里的邮箱都是空的，
   * 用户以为注册了邮箱，系统却不知道。用户名从 @ 前面取，重名时加数字后缀。
   */
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw);
  const username = looksLikeEmail ? uniqueUsername(raw.split('@')[0]!) : raw;
  const email = looksLikeEmail ? raw : (input.email ?? '').trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid('邮箱格式不正确');

  const user = createUser({
    username,
    email,
    password: input.password,
    role: 'user',
    source: 'self_signup',
  });
  recordAudit({ tenantId: user.tenantId, userId: user.userId, action: 'register', target: username, ip: input.ip });
  return buildSession(user);
}

/* ---------------- 刷新与登出 ---------------- */

export async function refresh(rawToken: string, ip: string): Promise<Session> {
  if (!rawToken) throw unauthorized('缺少刷新令牌');
  const hash = hashToken(rawToken);
  const row = get<{ tokenId: string; userId: string; expiresAt: number; revoked: number }>(
    'SELECT tokenId, userId, expiresAt, revoked FROM refresh_tokens WHERE tokenHash = ?',
    hash,
  );
  if (!row || row.revoked === 1) throw unauthorized('刷新令牌无效，请重新登录');
  if (row.expiresAt <= Date.now()) {
    updateRow('refresh_tokens', 'tokenId', row.tokenId, { revoked: 1 });
    throw unauthorized('登录已过期，请重新登录');
  }

  const user = requireById(row.userId);
  if (user.status !== 'active') throw forbidden('账号已被禁用');

  // 轮换：旧令牌立即失效，降低泄露风险
  updateRow('refresh_tokens', 'tokenId', row.tokenId, { revoked: 1 });
  void ip;
  return buildSession(user);
}

export function logout(rawToken: string): void {
  if (!rawToken) return;
  run('UPDATE refresh_tokens SET revoked = 1 WHERE tokenHash = ?', hashToken(rawToken));
}

/* ---------------- 修改密码 ---------------- */

export async function changePassword(
  userId: string,
  oldPassword: string,
  newPassword: string,
  ip: string,
): Promise<Session> {
  const user = requireById(userId);
  if (!verifyPassword(oldPassword, user.passwordHash)) throw unauthorized('原密码不正确');
  const pwErr = passwordPolicyError(newPassword);
  if (pwErr) throw invalid(pwErr);
  if (oldPassword === newPassword) throw invalid('新密码不能与原密码相同');

  const updated = updateUserPassword(userId, newPassword, false);
  // 改密后所有旧会话立即失效
  run('UPDATE refresh_tokens SET revoked = 1 WHERE userId = ?', userId);
  recordAudit({ tenantId: user.tenantId, userId, action: 'change_password', ip });
  return buildSession(updated);
}

function updateUserPassword(userId: string, password: string, mustChange: boolean): UserRow {
  updateRow('users', 'userId', userId, {
    passwordHash: hashPassword(password),
    mustChangePassword: mustChange,
  });
  return requireById(userId);
}

/** 管理员重置他人密码，强制对方下次登录改密并立即下线 */
export function resetPassword(userId: string, newPassword: string, actorId: string, ip: string): void {
  const pwErr = passwordPolicyError(newPassword);
  if (pwErr) throw invalid(pwErr);
  const user = requireById(userId);
  updateUserPassword(userId, newPassword, true);
  run('UPDATE refresh_tokens SET revoked = 1 WHERE userId = ?', userId);
  recordAudit({ tenantId: user.tenantId, userId: actorId, action: 'reset_password', target: userId, ip });
}

/** 强制下线：撤销全部刷新令牌，访问令牌因状态校验也会在 15 分钟内自然失效 */
export function forceLogout(userId: string, actorId: string, ip: string): void {
  const user = requireById(userId);
  run('UPDATE refresh_tokens SET revoked = 1 WHERE userId = ?', userId);
  recordAudit({ tenantId: user.tenantId, userId: actorId, action: 'force_logout', target: userId, ip });
}

/** 禁用账号：撤销令牌并置状态 */
export function disableUser(userId: string, actorId: string, ip: string): void {
  const user = requireById(userId);
  if (user.role === 'admin') throw conflict('不能禁用管理员账号');
  updateRow('users', 'userId', userId, { status: 'disabled' });
  run('UPDATE refresh_tokens SET revoked = 1 WHERE userId = ?', userId);
  recordAudit({ tenantId: user.tenantId, userId: actorId, action: 'disable_user', target: userId, ip });
}

export function enableUser(userId: string, actorId: string, ip: string): void {
  const user = requireById(userId);
  updateRow('users', 'userId', userId, { status: 'active' });
  recordAudit({ tenantId: user.tenantId, userId: actorId, action: 'enable_user', target: userId, ip });
}
