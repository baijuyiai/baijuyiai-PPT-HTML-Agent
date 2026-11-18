import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge, Button, Card, CardBody, Dialog, Drawer, Field, Input, Select, Switch,
  Table, Td, Th, useToast,
} from '@lumen/ui';
import { api, download } from '../api/client.js';
import {
  ROLE_LABEL, USER_SOURCE_LABEL, USER_STATUS_LABEL, formatCosts, formatNumber, formatTime,
  type Role, type UserAdminView, type UserDetailResult, type UserListResult, type UserStatus,
} from '../api/types.js';
import { AdminPage, LoadError } from '../components/AdminPage.js';

const PAGE_SIZE = 20;

const ROLE_FILTERS = [
  { value: '', label: '全部角色' },
  { value: 'admin', label: '管理员' },
  { value: 'user', label: '普通用户' },
  { value: 'guest', label: '访客' },
];

const STATUS_FILTERS = [
  { value: '', label: '全部状态' },
  { value: 'active', label: '正常' },
  { value: 'disabled', label: '已停用' },
];

const SOURCE_FILTERS = [
  { value: '', label: '全部来源' },
  { value: 'self_signup', label: '自助注册' },
  { value: 'admin_created', label: '管理员创建' },
  { value: 'system', label: '系统内置' },
];

export function UsersPage() {
  const qc = useQueryClient();
  const toast = useToast();

  const [q, setQ] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (role) p.set('role', role);
    if (status) p.set('status', status);
    if (source) p.set('source', source);
    p.set('limit', String(PAGE_SIZE));
    p.set('offset', String(page * PAGE_SIZE));
    return p.toString();
  }, [q, role, status, source, page]);

  const users = useQuery({
    queryKey: ['admin', 'users', query],
    queryFn: () => api.get<UserListResult>(`/admin/users?${query}`),
  });

  const exportCsv = useMutation({
    mutationFn: () => download('/admin/users/export.csv', 'lumen-users.csv'),
    onSuccess: () => toast.success('已开始下载', '包含用户与累计用量'),
    onError: (err: Error) => toast.error('导出失败', err.message),
  });

  const total = users.data?.total ?? 0;
  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const filtered = Boolean(q || role || status || source);

  function resetTo(fn: () => void) {
    fn();
    setPage(0);
  }

  return (
    <AdminPage
      title="用户与 CRM"
      description="账号管理、配额调整与用量归集。停用与配额变更都会记入审计。"
      actions={
        <>
          <Button size="sm" variant="ghost" icon="Download" loading={exportCsv.isPending} onClick={() => exportCsv.mutate()}>
            导出 CSV
          </Button>
          <Button size="sm" variant="primary" icon="UserPlus" onClick={() => setCreateOpen(true)}>
            新建用户
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Card>
          <CardBody className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <Field label="搜索" htmlFor="user-q">
                <Input
                  id="user-q"
                  value={q}
                  placeholder="按用户名或邮箱搜索"
                  onChange={(e) => resetTo(() => setQ(e.target.value))}
                />
              </Field>
            </div>
            <div className="w-[150px]">
              <Select ariaLabel="角色筛选" value={role} onValueChange={(v) => resetTo(() => setRole(v))} options={ROLE_FILTERS} />
            </div>
            <div className="w-[150px]">
              <Select ariaLabel="状态筛选" value={status} onValueChange={(v) => resetTo(() => setStatus(v))} options={STATUS_FILTERS} />
            </div>
            <div className="w-[150px]">
              <Select ariaLabel="来源筛选" value={source} onValueChange={(v) => resetTo(() => setSource(v))} options={SOURCE_FILTERS} />
            </div>
            {filtered && (
              <Button
                size="sm"
                variant="ghost"
                icon="X"
                onClick={() => resetTo(() => { setQ(''); setRole(''); setStatus(''); setSource(''); })}
              >
                清除筛选
              </Button>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-0">
            {users.isError ? (
              <div className="p-5"><LoadError message="用户列表读取失败" onRetry={() => void users.refetch()} /></div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>用户</Th>
                    <Th>角色</Th>
                    <Th>状态</Th>
                    <Th>来源</Th>
                    <Th className="whitespace-nowrap">项目 / 页</Th>
                    <Th>累计费用</Th>
                    <Th>最近登录</Th>
                    <Th>操作</Th>
                  </tr>
                </thead>
                <tbody>
                  {users.isLoading ? (
                    <tr><Td className="text-[var(--text-3)]">加载中</Td><Td /><Td /><Td /><Td /><Td /><Td /><Td /></tr>
                  ) : (users.data?.items.length ?? 0) === 0 ? (
                    <tr>
                      <Td className="text-[var(--text-3)]">{filtered ? '没有匹配的用户' : '还没有用户'}</Td>
                      <Td /><Td /><Td /><Td /><Td /><Td /><Td />
                    </tr>
                  ) : (
                    users.data!.items.map((u) => (
                      <tr key={u.userId}>
                        <Td>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-[var(--text-1)]">{u.username}</span>
                            <span className="text-[12px] text-[var(--text-3)]">{u.email || '未填写邮箱'}</span>
                          </div>
                        </Td>
                        <Td><Badge tone={u.role === 'admin' ? 'brand' : 'neutral'}>{ROLE_LABEL[u.role]}</Badge></Td>
                        <Td>
                          <Badge tone={u.status === 'active' ? 'success' : 'error'}>{USER_STATUS_LABEL[u.status]}</Badge>
                        </Td>
                        <Td className="whitespace-nowrap text-[var(--text-2)]">{USER_SOURCE_LABEL[u.source]}</Td>
                        <Td className="whitespace-nowrap text-[var(--text-2)]">{u.projectCount} / {formatNumber(u.pageCount)}</Td>
                        <Td className="whitespace-nowrap text-[var(--text-2)]">{formatCosts(u.costs, '—')}</Td>
                        <Td className="whitespace-nowrap text-[var(--text-3)]" title={formatTime(u.lastLoginAt)}>
                          {u.lastLoginAt ? formatTime(u.lastLoginAt) : '从未登录'}
                        </Td>
                        <Td>
                          <Button size="sm" variant="ghost" onClick={() => setDetailId(u.userId)}>详情</Button>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>

        <div className="flex items-center justify-between gap-3">
          <span className="text-[12px] text-[var(--text-3)]">
            共 {formatNumber(total)} 条{filtered ? '（已筛选）' : ''}，第 {page + 1} / {maxPage + 1} 页
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" icon="ChevronLeft" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              上一页
            </Button>
            <Button size="sm" variant="ghost" disabled={page >= maxPage} onClick={() => setPage((p) => p + 1)}>
              下一页
            </Button>
          </div>
        </div>
      </div>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => void qc.invalidateQueries({ queryKey: ['admin', 'users'] })}
      />

      <UserDetailDrawer
        userId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={() => void qc.invalidateQueries({ queryKey: ['admin', 'users'] })}
      />
    </AdminPage>
  );
}

/* ---------------- 新建用户 ---------------- */

function CreateUserDialog({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const toast = useToast();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('user');
  const [mustChange, setMustChange] = useState(true);

  const policyIssue = password.length === 0
    ? ''
    : password.length < 8 ? '密码至少 8 位'
      : !/[A-Za-z]/.test(password) ? '密码必须包含字母'
        : !/[0-9]/.test(password) ? '密码必须包含数字' : '';

  const create = useMutation({
    mutationFn: () => api.post<UserAdminView>('/admin/users', {
      username: username.trim(),
      email: email.trim(),
      password,
      role,
      mustChangePassword: mustChange,
    }),
    onSuccess: (u) => {
      toast.success('用户已创建', `${u.username}（${ROLE_LABEL[u.role]}）`);
      onCreated();
      onOpenChange(false);
      setUsername(''); setEmail(''); setPassword(''); setRole('user'); setMustChange(true);
    },
    onError: (err: Error) => toast.error('创建失败', err.message),
  });

  const canSubmit = username.trim().length >= 3 && !policyIssue && password.length > 0;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="新建用户"
      description="账号由管理员创建时，默认要求首次登录后修改密码。"
      width={480}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="primary" loading={create.isPending} disabled={!canSubmit} onClick={() => create.mutate()}>
            创建
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="用户名" required htmlFor="nu-name" hint="至少 3 位，登录时使用">
          <Input id="nu-name" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
        </Field>
        <Field label="邮箱" htmlFor="nu-email" hint="选填，可用于登录">
          <Input id="nu-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="初始密码" required htmlFor="nu-pw" hint={policyIssue || '至少 8 位，需同时包含字母与数字'}>
          <Input id="nu-pw" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Field label="角色" htmlFor="nu-role">
          <Select
            ariaLabel="角色"
            value={role}
            onValueChange={(v) => setRole(v as Role)}
            options={[
              { value: 'user', label: '普通用户' },
              { value: 'admin', label: '管理员' },
              { value: 'guest', label: '访客' },
            ]}
          />
        </Field>
        <label className="flex items-center justify-between gap-3">
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium text-[var(--text-2)]">首次登录强制改密</span>
            <span className="text-[12px] text-[var(--text-3)]">关闭后该账号可直接使用初始密码</span>
          </span>
          <Switch checked={mustChange} onCheckedChange={setMustChange} label="首次登录强制改密" />
        </label>
      </div>
    </Dialog>
  );
}

/* ---------------- 用户详情 ---------------- */

function UserDetailDrawer({
  userId, onClose, onChanged,
}: { userId: string | null; onClose: () => void; onChanged: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [resetOpen, setResetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [quota, setQuota] = useState<{ maxProjects: number; maxConcurrency: number; maxTokens: number; maxImages: number } | null>(null);
  const [roleDraft, setRoleDraft] = useState<Role | null>(null);

  const detail = useQuery({
    queryKey: ['admin', 'user', userId],
    queryFn: () => api.get<UserDetailResult>(`/admin/users/${userId}`),
    enabled: Boolean(userId),
  });

  const user = detail.data?.user;
  const effectiveQuota = quota ?? (user
    ? {
      maxProjects: user.quota.maxProjects,
      maxConcurrency: user.quota.maxConcurrency,
      maxTokens: user.quota.maxTokens,
      maxImages: user.quota.maxImages,
    }
    : null);

  function invalidate() {
    void qc.invalidateQueries({ queryKey: ['admin', 'user', userId] });
    onChanged();
  }

  const save = useMutation({
    mutationFn: () => api.patch(`/admin/users/${userId}`, {
      ...(roleDraft && roleDraft !== user?.role ? { role: roleDraft } : {}),
      ...(effectiveQuota ? { quota: effectiveQuota } : {}),
    }),
    onSuccess: () => {
      toast.success('已保存');
      invalidate();
    },
    onError: (err: Error) => toast.error('保存失败', err.message),
  });

  const toggleStatus = useMutation({
    mutationFn: (next: UserStatus) => api.post(`/admin/users/${userId}/status`, { status: next }),
    onSuccess: () => {
      toast.success('状态已更新');
      invalidate();
    },
    onError: (err: Error) => toast.error('操作失败', err.message),
  });

  const forceLogout = useMutation({
    mutationFn: () => api.post(`/admin/users/${userId}/force-logout`),
    onSuccess: () => toast.success('已强制下线', '该账号的刷新令牌已全部失效'),
    onError: (err: Error) => toast.error('操作失败', err.message),
  });

  const resetPw = useMutation({
    mutationFn: () => api.patch(`/admin/users/${userId}`, { password: newPassword }),
    onSuccess: () => {
      toast.success('密码已重置', '该账号的旧会话已失效');
      setResetOpen(false);
      setNewPassword('');
      invalidate();
    },
    onError: (err: Error) => toast.error('重置失败', err.message),
  });

  const resetPolicyIssue = newPassword.length === 0
    ? ''
    : newPassword.length < 8 ? '密码至少 8 位'
      : !/[A-Za-z]/.test(newPassword) ? '密码必须包含字母'
        : !/[0-9]/.test(newPassword) ? '密码必须包含数字' : '';

  return (
    <>
      <Drawer
        open={Boolean(userId)}
        onOpenChange={(v) => { if (!v) { onClose(); setQuota(null); setRoleDraft(null); } }}
        title={user ? user.username : '用户详情'}
        description={user ? `${ROLE_LABEL[user.role]} · ${USER_SOURCE_LABEL[user.source]}` : undefined}
        width={520}
        footer={
          <Button variant="primary" loading={save.isPending} disabled={!user} onClick={() => save.mutate()}>
            保存修改
          </Button>
        }
      >
        {detail.isError ? (
          <LoadError message="用户详情读取失败" onRetry={() => void detail.refetch()} />
        ) : !user || !effectiveQuota ? (
          <p className="text-[13px] text-[var(--text-3)]">加载中</p>
        ) : (
          <div className="flex flex-col gap-6">
            <section className="flex flex-col gap-3">
              <h3 className="text-[13px] font-semibold text-[var(--text-1)]">账号</h3>
              <div className="grid grid-cols-2 gap-3 text-[13px]">
                <Info label="用户 ID" value={user.userId} mono />
                <Info label="租户" value={user.tenantId} mono />
                <Info label="邮箱" value={user.email || '未填写'} />
                <Info label="创建时间" value={formatTime(user.createdAt)} />
                <Info label="最近登录" value={user.lastLoginAt ? formatTime(user.lastLoginAt) : '从未登录'} />
                <Info label="状态" value={USER_STATUS_LABEL[user.status]} />
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="text-[13px] font-semibold text-[var(--text-1)]">用量</h3>
              <div className="grid grid-cols-3 gap-3 text-[13px]">
                <Info label="项目" value={String(user.projectCount)} />
                <Info label="页数" value={formatNumber(user.pageCount)} />
                <Info label="累计费用" value={formatCosts(user.costs)} />
                <Info label="Token" value={formatNumber(user.tokensUsed)} />
                <Info label="图片" value={formatNumber(user.imagesUsed)} />
                <Info label="调用次数" value={formatNumber(detail.data?.usage.calls ?? 0)} />
              </div>
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="text-[13px] font-semibold text-[var(--text-1)]">角色</h3>
              <Select
                ariaLabel="角色"
                value={roleDraft ?? user.role}
                onValueChange={(v) => setRoleDraft(v as Role)}
                options={[
                  { value: 'user', label: '普通用户' },
                  { value: 'admin', label: '管理员' },
                  { value: 'guest', label: '访客' },
                ]}
              />
            </section>

            <section className="flex flex-col gap-3">
              <h3 className="text-[13px] font-semibold text-[var(--text-1)]">配额</h3>
              <p className="text-[12px] leading-[1.6] text-[var(--text-3)]">填 0 表示不限。</p>
              <div className="grid grid-cols-2 gap-3">
                <QuotaInput
                  id="q-projects" label="项目上限" value={effectiveQuota.maxProjects}
                  onChange={(v) => setQuota({ ...effectiveQuota, maxProjects: v })}
                />
                <QuotaInput
                  id="q-concurrency" label="并发上限" value={effectiveQuota.maxConcurrency}
                  onChange={(v) => setQuota({ ...effectiveQuota, maxConcurrency: v })}
                />
                <QuotaInput
                  id="q-tokens" label="Token 上限" value={effectiveQuota.maxTokens}
                  onChange={(v) => setQuota({ ...effectiveQuota, maxTokens: v })}
                />
                <QuotaInput
                  id="q-images" label="图片上限" value={effectiveQuota.maxImages}
                  onChange={(v) => setQuota({ ...effectiveQuota, maxImages: v })}
                />
              </div>
            </section>

            <section className="flex flex-col gap-3 border-t border-[var(--border)] pt-5">
              <h3 className="text-[13px] font-semibold text-[var(--text-1)]">安全操作</h3>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" icon="KeyRound" onClick={() => setResetOpen(true)}>重置密码</Button>
                <Button size="sm" icon="LogOut" onClick={() => forceLogout.mutate()} loading={forceLogout.isPending}>
                  强制下线
                </Button>
                {user.status === 'active' ? (
                  <Button
                    size="sm"
                    variant="danger"
                    icon="Ban"
                    loading={toggleStatus.isPending}
                    onClick={() => toggleStatus.mutate('disabled')}
                  >
                    停用账号
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    icon="CircleCheck"
                    loading={toggleStatus.isPending}
                    onClick={() => toggleStatus.mutate('active')}
                  >
                    恢复账号
                  </Button>
                )}
              </div>
            </section>

            <section className="flex flex-col gap-2 border-t border-[var(--border)] pt-5">
              <h3 className="text-[13px] font-semibold text-[var(--text-1)]">最近审计</h3>
              {(detail.data?.audit.length ?? 0) === 0 ? (
                <p className="text-[12px] text-[var(--text-3)]">该用户暂无审计记录。</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {detail.data!.audit.slice(0, 10).map((e) => (
                    <li key={e.auditId} className="flex items-center gap-2 text-[12px]">
                      <span className="w-[112px] shrink-0 text-[var(--text-3)]">{formatTime(e.createdAt)}</span>
                      <Badge tone={e.action === 'forbidden' ? 'error' : 'neutral'}>{e.action}</Badge>
                      <span className="min-w-0 flex-1 truncate text-[var(--text-2)]" title={e.target}>{e.target || '—'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </Drawer>

      <Dialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="重置密码"
        description="重置后该账号的所有旧会话立即失效，且不强制首次改密。"
        width={440}
        footer={
          <>
            <Button onClick={() => setResetOpen(false)}>取消</Button>
            <Button
              variant="primary"
              loading={resetPw.isPending}
              disabled={Boolean(resetPolicyIssue) || newPassword.length === 0}
              onClick={() => resetPw.mutate()}
            >
              确认重置
            </Button>
          </>
        }
      >
        <Field label="新密码" required htmlFor="rp-new" hint={resetPolicyIssue || '至少 8 位，需同时包含字母与数字'}>
          <Input
            id="rp-new"
            type="password"
            autoComplete="new-password"
            autoFocus
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </Field>
      </Dialog>
    </>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[12px] text-[var(--text-3)]">{label}</span>
      <span
        className={mono ? 'truncate font-[var(--font-mono)] text-[12px] text-[var(--text-1)]' : 'text-[13px] text-[var(--text-1)]'}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

function QuotaInput({
  id, label, value, onChange,
}: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label} htmlFor={id}>
      <Input
        id={id}
        type="number"
        min={0}
        value={String(value)}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);
        }}
      />
    </Field>
  );
}
