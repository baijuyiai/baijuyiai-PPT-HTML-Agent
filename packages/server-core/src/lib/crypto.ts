import {
  randomBytes, scryptSync, timingSafeEqual, createCipheriv, createDecipheriv, createHash,
} from 'node:crypto';
import { env } from '../env.js';

/** scrypt 参数：N=16384 在安全性与登录延迟之间取平衡 */
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const MAXMEM = 64 * 1024 * 1024;

/** 口令哈希，格式 `scrypt$N$r$p$salt$hash`，salt 与 hash 用 base64url */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: MAXMEM });
  return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('base64url'), hash.toString('base64url')].join('$');
}

/** 恒定时间比对，防时序侧信道 */
export function verifyPassword(password: string, stored: string): boolean {
  try {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const N = Number(parts[1]);
    const r = Number(parts[2]);
    const p = Number(parts[3]);
    const salt = Buffer.from(parts[4]!, 'base64url');
    const expected = Buffer.from(parts[5]!, 'base64url');
    if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p) || expected.length === 0) return false;
    const actual = scryptSync(password, salt, expected.length, { N, r, p, maxmem: MAXMEM });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * 加密敏感配置（Provider 的 API Key）。
 * AES-256-GCM，输出 `v1:<iv>:<tag>:<ct>`（base64url）。密钥来自 LUMEN_SECRET_KEY。
 */
export function encryptSecret(plain: string): string {
  if (plain === '') return '';
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', env.secretKeyBytes, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${ct.toString('base64url')}`;
}

/** 解密失败返回空串，调用方按「未配置 Key」处理，不让脏密文炸掉请求 */
export function decryptSecret(ref: string): string {
  if (!ref) return '';
  try {
    const parts = ref.split(':');
    if (parts.length !== 4 || parts[0] !== 'v1') return '';
    const iv = Buffer.from(parts[1]!, 'base64url');
    const tag = Buffer.from(parts[2]!, 'base64url');
    const ct = Buffer.from(parts[3]!, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', env.secretKeyBytes, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

/** 对外展示用的掩码，只保留前 4 与后 4 字符 */
export function maskSecret(plain: string): string {
  if (!plain) return '';
  if (plain.length <= 8) return '*'.repeat(plain.length);
  return `${plain.slice(0, 4)}${'*'.repeat(6)}${plain.slice(-4)}`;
}

/** 不透明 token 的哈希（用于 refresh token 落库，库中不存明文） */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

/** 带前缀的短 ID，如 `prj_k3f9x2m1q8` */
export function newId(prefix: string): string {
  const bytes = randomBytes(10);
  let s = '';
  for (const b of bytes) s += ID_ALPHABET[b % ID_ALPHABET.length];
  return `${prefix}_${s}`;
}

/** 不透明随机 token（分享链接、refresh token） */
export function newOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
