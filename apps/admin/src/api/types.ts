import { formatAmount, formatCostBuckets, mergeCostBuckets } from '@lumen/ir-schema';
import type {
  AuditEvent, CostBucket, ProviderPublic, Quota, QueueStats, Role, StyleDocSummary, TaskRoute, TaskType,
  UsageRecord, UsageSummary, UserAdminView, UserPublic, UserSource, UserStatus,
} from '@lumen/ir-schema';

export type {
  AuditEvent, CostBucket, ProviderPublic, Quota, QueueStats, Role, StyleDocSummary, TaskRoute, TaskType,
  UsageRecord, UsageSummary, UserAdminView, UserPublic, UserSource, UserStatus,
};

export interface UserListResult {
  items: UserAdminView[];
  total: number;
}

export interface UserDetailResult {
  user: UserAdminView;
  usage: UsageSummary;
  audit: AuditEvent[];
}

export interface UsageResult {
  summary: UsageSummary;
  records: { items: UsageRecord[]; total: number };
}

export interface AuditListResult {
  items: AuditEvent[];
  total: number;
}

/** 风格库审核列表。契约直接复用 ir-schema 的 StyleDocSummary，不再手抄一份 */
export type AdminStyleSummary = StyleDocSummary;

export interface AdminStylesResult {
  items: StyleDocSummary[];
  total: number;
}

export interface AdminSettings {
  allowSelfSignup: boolean;
  signupMaxPerHour: number;
  maxConcurrency: number;
  /** 抠图密钥配没配。**服务端只回这个布尔值，不回明文** */
  koukoutuApiKeySet: boolean;
  /** 讲解音色。全局一套，不随项目走 */
  narrationVoice: string;
  /** 讲解语气，作为提示词发给语音模型。空串表示不加提示 */
  narrationTone: string;
}

export interface TestConnectionResult {
  ok: boolean;
  kind: 'text' | 'image';
  latencyMs: number;
  model: string;
  code: string;
  message: string;
}

export interface TaskSummary {
  taskId: string;
  tenantId: string;
  projectId: string | null;
  pageId: string | null;
  kind: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'dead';
  attempts: number;
  maxAttempts: number;
  error: string;
  degradeReason: string;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface TaskListResult {
  items: TaskSummary[];
  total: number;
}

export interface SessionUser extends UserPublic {
  tenantId: string;
}

export interface MeResponse {
  user: SessionUser;
  quota: Quota;
  used: { projects: number; images: number; tokens: number };
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: '管理员',
  user: '普通用户',
  guest: '访客',
};

export const USER_STATUS_LABEL: Record<UserStatus, string> = {
  active: '正常',
  disabled: '已停用',
};

export const USER_SOURCE_LABEL: Record<UserSource, string> = {
  self_signup: '自助注册',
  admin_created: '管理员创建',
  system: '系统内置',
};

export const PROVIDER_TYPE_LABEL: Record<ProviderPublic['type'], string> = {
  'openai-compatible': 'OpenAI 兼容',
  anthropic: 'Anthropic',
  deepseek: 'DeepSeek',
  custom: '自定义',
};

export { TASK_KIND_LABEL, TASK_TYPE_LABEL, taskKindLabel, taskTypeLabel } from '@lumen/ir-schema';

export const TASK_STATUS_LABEL: Record<string, string> = {
  queued: '排队中',
  running: '执行中',
  succeeded: '已完成',
  failed: '失败待重试',
  dead: '已进入死信',
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  register: '注册',
  login: '登录',
  login_failed: '登录失败',
  login_locked: '账号锁定',
  logout: '登出',
  create_user: '创建用户',
  update_user: '更新用户',
  disable_user: '停用用户',
  enable_user: '启用用户',
  change_password: '修改密码',
  reset_password: '重置密码',
  force_logout: '强制下线',
  export: '导出数据',
  share: '创建分享',
  provider_change: 'Provider 变更',
  route_change: '路由变更',
  test_connection: '测试连接',
  style_review: '风格审核',
  quota_change: '配额变更',
  forbidden: '越权访问',
  clear_brand: '清空品牌',
  // 顺手补上这两条：它们本来就缺（枚举 23 个动作里少了这 2 个），
  // 于是审计页的筛选下拉里**根本没有**「删除项目」「重新生成讲稿」两个选项，
  // 表格里也直接显示英文。反正已经在动这张表，两行的成本
  delete_project: '删除项目',
  script_generate: '重新生成讲稿',
};

export function formatTime(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function relativeTime(ts: number): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return formatTime(ts);
}

export function formatNumber(n: number): string {
  return n.toLocaleString('zh-CN');
}

export function formatCost(n: number, currency = 'CNY'): string {
  return formatAmount(n, currency);
}

/** 多币种费用拼成一行。不同币种不相加——换算需要汇率，汇率会过期。 */
export function formatCosts(buckets: CostBucket[] | undefined, empty?: string): string {
  return formatCostBuckets(buckets ?? [], empty);
}

/** 把若干组费用桶并成一组，用于列表页的合计 */
export function sumCosts(groups: (CostBucket[] | undefined)[]): CostBucket[] {
  return mergeCostBuckets(groups.flatMap((g) => g ?? []));
}
