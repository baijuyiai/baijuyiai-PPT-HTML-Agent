import { get, insertRow, updateRow } from '../db/client.js';
import { decryptSecret } from '../lib/crypto.js';
import { env } from '../env.js';
import { DEFAULT_NARRATION_VOICE } from '@lumen/ir-schema';

/**
 * 应用设置。DB 中的值覆盖环境变量默认值，便于 admin 在不重启的情况下开关功能。
 */

export const SETTING_KEYS = {
  allowSelfSignup: 'ALLOW_SELF_SIGNUP',
  signupPerHour: 'SIGNUP_MAX_PER_HOUR',
  maxConcurrency: 'MAX_CONCURRENCY',
  /** 抠图服务（抠抠图）的密钥。**存的是 `encryptSecret` 过的**，见 `koukoutuApiKey` */
  koukoutuApiKey: 'KOUKOUTU_API_KEY',
  /** 讲解音色，如 'alloy'。全局一套，不随项目走 */
  narrationVoice: 'NARRATION_VOICE',
  /** 讲解语气。作为 system 提示词发给语音模型 */
  narrationTone: 'NARRATION_TONE',
} as const;

/** 讲解默认语气。空字符串表示不加任何语气提示，让模型按默认读 */
export const DEFAULT_NARRATION_TONE = '';

export function getSetting(key: string): string | undefined {
  const row = get<{ value: string }>('SELECT value FROM app_settings WHERE key = ?', key);
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  const existing = get<{ key: string }>('SELECT key FROM app_settings WHERE key = ?', key);
  if (existing) updateRow('app_settings', 'key', key, { value, updatedAt: Date.now() });
  else insertRow('app_settings', { key, value, updatedAt: Date.now() });
}

export function getBoolSetting(key: string, fallback: boolean): boolean {
  const v = getSetting(key);
  if (v === undefined || v === '') return fallback;
  return v === 'true' || v === '1';
}

export function getNumberSetting(key: string, fallback: number): number {
  const v = getSetting(key);
  if (v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** 自助注册开关：DB 优先，回落到环境变量 */
export function allowSelfSignup(): boolean {
  return getBoolSetting(SETTING_KEYS.allowSelfSignup, env.LUMEN_ALLOW_SELF_SIGNUP);
}

/** 同 IP 每小时注册次数上限 */
export function signupPerHour(): number {
  return getNumberSetting(SETTING_KEYS.signupPerHour, 10);
}

/** 全局任务并发上限 */
export function maxConcurrency(): number {
  return getNumberSetting(SETTING_KEYS.maxConcurrency, env.LUMEN_MAX_CONCURRENCY);
}

/**
 * 抠图服务（抠抠图）的密钥。DB 里存的是 `encryptSecret` 过的，这里解回来。
 *
 * **没有环境变量兜底**，与上面那几项不同：密钥是要人填进来的东西，
 * 给 env 兜底只会多出一种「后台看着没配、实际却能跑」的状态，
 * 排查时白绕一圈。
 */
export function koukoutuApiKey(): string {
  const v = getSetting(SETTING_KEYS.koukoutuApiKey);
  return v ? decryptSecret(v) : '';
}

/** 配没配。后台表单只回这个，不回明文 */
export function koukoutuApiKeySet(): boolean {
  return koukoutuApiKey().trim() !== '';
}

/**
 * 讲解音色。与密钥不同，音色不是敏感项，明文存。
 * 取不到或为空时回默认值——空音色发给模型只会得到报错。
 */
export function narrationVoice(): string {
  const v = getSetting(SETTING_KEYS.narrationVoice);
  return v !== undefined && v.trim() !== '' ? v.trim() : DEFAULT_NARRATION_VOICE;
}

/** 讲解语气。空字符串是合法值，表示不加语气提示 */
export function narrationTone(): string {
  return (getSetting(SETTING_KEYS.narrationTone) ?? DEFAULT_NARRATION_TONE).trim();
}

/** 供前端展示的公开设置（不含任何敏感项） */
export function publicSettings(): { allowSelfSignup: boolean } {
  return { allowSelfSignup: allowSelfSignup() };
}
