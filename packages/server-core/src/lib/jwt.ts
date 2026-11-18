import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { env } from '../env.js';
import type { Role } from '@lumen/ir-schema';

const secret = new TextEncoder().encode(env.LUMEN_SECRET_KEY);

/** 访问令牌有效期 15 分钟 */
export const ACCESS_TTL_SEC = 15 * 60;
/** 刷新令牌有效期 30 天 */
export const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const ACCESS_COOKIE = 'lumen_rt';

export interface AccessClaims {
  /** userId */
  sub: string;
  /** tenantId */
  tid: string;
  role: Role;
  /** 是否必须先改密 */
  mcp: boolean;
}

export async function signAccess(claims: AccessClaims): Promise<string> {
  return new SignJWT({ tid: claims.tid, role: claims.role, mcp: claims.mcp })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuedAt()
    .setIssuer('lumen-deck')
    .setAudience('lumen-deck-web')
    .setExpirationTime(`${ACCESS_TTL_SEC}s`)
    .sign(secret);
}

/** 校验失败抛错，调用方统一转 401 */
export async function verifyAccess(token: string): Promise<AccessClaims> {
  const { payload } = await jwtVerify(token, secret, {
    issuer: 'lumen-deck',
    audience: 'lumen-deck-web',
  });
  return claimsFromPayload(payload);
}

function claimsFromPayload(payload: JWTPayload): AccessClaims {
  const sub = payload.sub;
  const tid = payload.tid;
  const role = payload.role;
  if (typeof sub !== 'string' || typeof tid !== 'string' || typeof role !== 'string') {
    throw new Error('令牌载荷不完整');
  }
  if (role !== 'admin' && role !== 'user' && role !== 'guest') {
    throw new Error('令牌角色非法');
  }
  return { sub, tid, role, mcp: payload.mcp === true };
}
