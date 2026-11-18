import { z } from 'zod';
import { existsSync, appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

/** 仓库根目录（apps/api/src/env.ts 向上三级） */
export const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..');

const envLocalPath = resolve(repoRoot, '.env.local');
const envPath = resolve(repoRoot, '.env');

/** 测试环境下不读取 .env 文件，保证用例只受显式设置的 process.env 影响 */
const isTest = process.env.NODE_ENV === 'test';

// 用 Node 内置的 loadEnvFile，无第三方依赖。先 .env 后 .env.local，后者优先。
if (!isTest) {
  for (const p of [envPath, envLocalPath]) {
    if (existsSync(p)) {
      try {
        process.loadEnvFile(p);
      } catch {
        // 文件存在但格式异常时忽略，交由下面的 schema 报错
      }
    }
  }
}

/** 'true' / '1' 为真；空或未设置取默认值 */
const boolEnv = (def: boolean) =>
  z.string().optional().transform((v) => (v === undefined || v === '' ? def : v === 'true' || v === '1'));

const EnvSchema = z.object({
  NODE_ENV: z.string().default('development'),
  LUMEN_PORT: z.coerce.number().int().positive().default(8787),
  LUMEN_WEB_PORT: z.coerce.number().int().positive().default(5273),
  LUMEN_ADMIN_PORT: z.coerce.number().int().positive().default(5274),
  LUMEN_SECRET_KEY: z.string().default(''),
  LUMEN_ADMIN_PASSWORD: z.string().default('admin'),
  /**
   * 内置管理员首次登录是否强制改密。
   * 开发环境默认不强制——默认密码就是 admin/admin，让人能直接进去；
   * 生产环境默认强制，因为用默认密码对外提供服务是真风险。
   * 显式设置这个变量可以覆盖默认行为。
   */
  LUMEN_ADMIN_FORCE_PASSWORD_CHANGE: z.string().optional(),
  LUMEN_ALLOW_SELF_SIGNUP: boolEnv(true),
  LUMEN_DATA_DIR: z.string().default('./data'),
  LUMEN_MAX_CONCURRENCY: z.coerce.number().int().positive().default(6),
  LUMEN_QUEUE_LEASE_MS: z.coerce.number().int().positive().default(60000),
  LUMEN_PUBLIC_BASE_URL: z.string().default('http://localhost:8787'),
  /** 测试用：覆盖数据库文件路径，':memory:' 为内存库 */
  LUMEN_DB_PATH: z.string().default(''),
  LUMEN_TTS_ENGINE: z.string().default(''),
});

const parsed = EnvSchema.parse(process.env);
const isProduction = parsed.NODE_ENV === 'production';

let secretKey = parsed.LUMEN_SECRET_KEY;
if (secretKey.length < 32) {
  if (isProduction) {
    throw new Error(
      '生产环境必须设置 LUMEN_SECRET_KEY（至少 32 字符）。生成方式：node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64url\'))"',
    );
  }
  if (!secretKey) {
    secretKey = randomBytes(32).toString('base64url');
    // 测试环境只生成临时密钥不落盘，避免污染工作区；开发环境持久化，避免重启后登录态与已加密的 Key 全部失效
    if (!isTest) {
      appendFileSync(envLocalPath, `\n# 开发环境自动生成，请勿提交\nLUMEN_SECRET_KEY=${secretKey}\n`, 'utf8');
    }
  } else {
    // 有值但过短：开发环境补足到 32 字节
    secretKey = (secretKey + randomBytes(32).toString('base64url')).slice(0, 43);
  }
}

/** 运行时数据目录（绝对路径） */
export const dataDir = resolve(repoRoot, parsed.LUMEN_DATA_DIR);
/** SQLite 文件路径；测试可传 ':memory:' */
export const dbPath = parsed.LUMEN_DB_PATH || resolve(dataDir, 'lumen.db');

// 把归一化后的绝对路径写回环境变量。
// api 与 worker 的工作目录不同，若下游（对象存储适配器）按相对路径解析，
// 两个进程会落到不同目录，表现为「导出成功但下载 404」。
process.env.LUMEN_DATA_DIR = dataDir;

/**
 * 解析「内置管理员首次登录是否强制改密」。
 *
 * 显式配置优先；未配置时生产强制、其余环境不强制——开发环境默认凭据就是 admin/admin，
 * 直接放行能省掉每次重建库都要改一遍密码；生产环境用默认密码对外服务是真风险，必须拦。
 */
export function resolveForcePasswordChange(raw: string | undefined, production: boolean): boolean {
  if (raw === undefined || raw === '') return production;
  return raw === 'true' || raw === '1';
}

export const adminForcePasswordChange = resolveForcePasswordChange(
  parsed.LUMEN_ADMIN_FORCE_PASSWORD_CHANGE,
  isProduction,
);

export const env = {
  ...parsed,
  LUMEN_SECRET_KEY: secretKey,
  isProduction,
  adminForcePasswordChange,
  /** 主密钥字节，用于 AES-256-GCM */
  secretKeyBytes: Buffer.from(secretKey.padEnd(32, '0').slice(0, 32), 'utf8'),
} as const;

export type Env = typeof env;

/** 测试用：读取当前环境变量文件内容（断言自动写入行为） */
export function readEnvLocal(): string {
  return existsSync(envLocalPath) ? readFileSync(envLocalPath, 'utf8') : '';
}
