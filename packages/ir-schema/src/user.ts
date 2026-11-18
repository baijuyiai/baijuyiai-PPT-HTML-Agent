import { z } from 'zod';
import { CostBucket } from './provider.js';

export const Role = z.enum(['admin', 'user', 'guest']);
export type Role = z.infer<typeof Role>;

export const UserStatus = z.enum(['active', 'disabled']);
export type UserStatus = z.infer<typeof UserStatus>;

/** 用户来源：自助注册 / admin 创建 / 系统内置（PRD §5.1） */
export const UserSource = z.enum(['self_signup', 'admin_created', 'system']);
export type UserSource = z.infer<typeof UserSource>;

/** 配额（PRD §5.12）。0 表示不限。 */
export const Quota = z.object({
  maxProjects: z.number().int().min(0).default(10),
  maxConcurrency: z.number().int().min(0).default(3),
  maxTokens: z.number().int().min(0).default(0),
  maxImages: z.number().int().min(0).default(100),
});
export type Quota = z.infer<typeof Quota>;

export const DEFAULT_QUOTA: Quota = { maxProjects: 10, maxConcurrency: 3, maxTokens: 0, maxImages: 100 };

/** 用户实体（不含聚合统计；统计见 UserAdminView） */
export const User = z.object({
  userId: z.string(),
  tenantId: z.string(),
  username: z.string(),
  email: z.string().default(''),
  role: Role,
  status: UserStatus,
  source: UserSource,
  mustChangePassword: z.boolean().default(false),
  createdBy: z.string().default(''),
  quota: Quota.default(() => ({ ...DEFAULT_QUOTA })),
  createdAt: z.number().int(),
  lastLoginAt: z.number().int().default(0),
});
export type User = z.infer<typeof User>;

/** 对外返回的用户信息（无任何凭据字段） */
export const UserPublic = User.omit({ tenantId: true }).extend({
  tenantId: z.string(),
});
export type UserPublic = z.infer<typeof UserPublic>;

/** CRM 列表行：含聚合统计（PRD §5.12 用户列表） */
export const UserAdminView = UserPublic.extend({
  projectCount: z.number().int().default(0),
  pageCount: z.number().int().default(0),
  /** 累计费用，按币种分桶（不同币种不相加） */
  costs: z.array(CostBucket).default(() => []),
  tokensUsed: z.number().int().default(0),
  imagesUsed: z.number().int().default(0),
});
export type UserAdminView = z.infer<typeof UserAdminView>;

/** 审计动作（PRD §5.12 审计日志） */
export const AuditAction = z.enum([
  'register', 'login', 'login_failed', 'login_locked', 'logout',
  'create_user', 'update_user', 'disable_user', 'enable_user',
  'change_password', 'reset_password', 'force_logout',
  'export', 'share', 'provider_change', 'route_change',
  'test_connection', 'style_review', 'quota_change', 'forbidden',
  'script_generate',
  // 讲稿与配音是两件事，分开记。借 `script_generate` 会让审计里分不出
  // 「重算了讲稿」和「合成了配音」——前者不花钱，后者按 token 计费
  'tts_generate',
  // 删项目是不可逆的，得能在审计里一眼认出来。原先借的是 'export'，
  // 于是审计列表里「删了整本项目」看起来像「导出过一次」
  'delete_project',
  // 清空品牌会把项目行上那五个指针清掉，同样不可逆（对象还在磁盘上，但再也找不到）。
  // **不借 `delete_project`**——借来的动作名会让审计里分不出「删了整本项目」和「只清了品牌」，
  // 上面那条注释记的就是这类教训
  'clear_brand',
]);
export type AuditAction = z.infer<typeof AuditAction>;

export const AuditEvent = z.object({
  auditId: z.string(),
  tenantId: z.string(),
  userId: z.string().default(''),
  action: AuditAction,
  target: z.string().default(''),
  meta: z.record(z.unknown()).default(() => ({})),
  ip: z.string().default(''),
  createdAt: z.number().int(),
});
export type AuditEvent = z.infer<typeof AuditEvent>;

/** 用量记录：文本 token 与图片张数分别计量（PRD §8 配额与计量） */
export const UsageKind = z.enum(['text', 'image']);
export type UsageKind = z.infer<typeof UsageKind>;

export const UsageRecord = z.object({
  usageId: z.string(),
  tenantId: z.string(),
  userId: z.string().default(''),
  projectId: z.string().default(''),
  taskType: z.string(),
  kind: UsageKind,
  providerId: z.string().default(''),
  model: z.string().default(''),
  /** 文本：token 数；图片：张数 */
  amount: z.number().int().default(0),
  inputTokens: z.number().int().default(0),
  outputTokens: z.number().int().default(0),
  cost: z.number().default(0),
  /** cost 的币种，跟随产生这条记录的 Provider 配置 */
  currency: z.string().default('CNY'),
  latencyMs: z.number().int().default(0),
  ok: z.boolean().default(true),
  degradeReason: z.string().default(''),
  createdAt: z.number().int(),
});
export type UsageRecord = z.infer<typeof UsageRecord>;

/** 费用按币种分桶的聚合行，供 Provider / 任务类型两张表共用 */
export interface UsageGroup {
  calls: number;
  tokens: number;
  images: number;
  costs: CostBucket[];
}

/** 用量聚合。api 与 admin 共用这一个定义，避免两端各抄一份后形状漂移。 */
export interface UsageSummary {
  tokens: number;
  images: number;
  costs: CostBucket[];
  calls: number;
  failures: number;
  degraded: number;
  byProvider: ({ providerId: string } & UsageGroup)[];
  byTaskType: ({ taskType: string } & UsageGroup)[];
}

/** 登录失败锁定策略 */
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;

/** 自助注册限流：同 IP 每小时 <= 10 次（PRD §5.1） */
export const SIGNUP_MAX_PER_HOUR = 10;
export const SIGNUP_WINDOW_MS = 60 * 60 * 1000;

/** 密码策略：>=8 位，含字母与数字 */
export const PASSWORD_MIN_LENGTH = 8;
export function passwordPolicyError(pw: string): string | null {
  if (pw.length < PASSWORD_MIN_LENGTH) return `密码至少 ${PASSWORD_MIN_LENGTH} 位`;
  if (!/[A-Za-z]/.test(pw)) return '密码必须包含字母';
  if (!/[0-9]/.test(pw)) return '密码必须包含数字';
  return null;
}
