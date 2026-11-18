import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, CardBody, CardHeader, Icon, Table, Td, Th } from '@lumen/ui';
import { api } from '../api/client.js';
import {
  AUDIT_ACTION_LABEL, formatCosts, formatNumber, formatTime, relativeTime, TASK_KIND_LABEL,
  type AuditListResult, type ProviderPublic, type QueueStats, type UsageResult, type UserListResult,
} from '../api/types.js';
import { AdminPage, LoadError, StatCard } from '../components/AdminPage.js';

export function DashboardPage() {
  const navigate = useNavigate();

  const users = useQuery({
    queryKey: ['admin', 'users', 'count'],
    queryFn: () => api.get<UserListResult>('/admin/users?limit=1'),
  });

  const usage = useQuery({
    queryKey: ['admin', 'usage', 'dashboard'],
    queryFn: () => api.get<UsageResult>('/admin/usage?limit=1'),
  });

  const queue = useQuery({
    queryKey: ['admin', 'queue-stats'],
    queryFn: () => api.get<QueueStats>('/tasks/stats'),
    refetchInterval: 15_000,
  });

  const providers = useQuery({
    queryKey: ['admin', 'providers'],
    queryFn: () => api.get<ProviderPublic[]>('/admin/providers'),
  });

  const audit = useQuery({
    queryKey: ['admin', 'audit', 'recent'],
    queryFn: () => api.get<AuditListResult>('/admin/audit?limit=8'),
  });

  const summary = usage.data?.summary;
  const deadCount = queue.data?.dead ?? 0;
  const enabledProviders = providers.data?.filter((p) => p.enabled).length ?? 0;
  const mockOnly = (providers.data?.length ?? 0) > 0
    && providers.data!.every((p) => p.isMock);

  return (
    <AdminPage
      title="运行概览"
      description="账号、用量、队列与接入状态的整体视图。数据每 15 秒刷新一次队列指标。"
      actions={
        <Button size="sm" variant="ghost" icon="RefreshCw" onClick={() => { void users.refetch(); void usage.refetch(); void queue.refetch(); }}>
          刷新
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="用户总数"
            value={users.isSuccess ? formatNumber(users.data.total) : '—'}
            hint={users.isError ? '读取失败' : '含管理员与访客'}
            icon={<Icon name="Users" size={16} className="text-[var(--text-3)]" />}
          />
          <StatCard
            label="模型调用"
            value={summary ? formatNumber(summary.calls) : '—'}
            hint={summary ? `失败 ${summary.failures} 次，降级 ${summary.degraded} 次` : ''}
            icon={<Icon name="Activity" size={16} className="text-[var(--text-3)]" />}
          />
          <StatCard
            label="累计费用"
            value={summary ? formatCosts(summary.costs, '—') : '—'}
            hint={summary ? `图片 ${formatNumber(summary.images)} 张，Token ${formatNumber(summary.tokens)}` : ''}
            icon={<Icon name="Coins" size={16} className="text-[var(--text-3)]" />}
          />
          <StatCard
            label="队列死信"
            value={queue.isSuccess ? formatNumber(deadCount) : '—'}
            hint={queue.isSuccess ? `排队 ${queue.data.queued}，执行中 ${queue.data.running}` : ''}
            tone={deadCount > 0 ? 'error' : 'default'}
            icon={<Icon name="ListChecks" size={16} className="text-[var(--text-3)]" />}
          />
        </div>

        {mockOnly && (
          <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--warning)] bg-[var(--surface-0)] px-4 py-3">
            <Icon name="TriangleAlert" size={20} className="mt-0.5 shrink-0 text-[var(--warning)]" decorative />
            <div className="flex flex-col gap-1">
              <p className="text-[13px] font-medium text-[var(--text-1)]">当前只配置了内置 Mock 网关</p>
              <p className="text-[12px] leading-[1.6] text-[var(--text-3)]">
                全链路可以跑通，但产出是确定性的占位内容。填入真实 Base URL 与 Key 后即可切换。
              </p>
              <button
                type="button"
                className="mt-1 self-start text-[12px] font-medium text-[var(--brand-600)] hover:underline"
                onClick={() => navigate('/providers')}
              >
                去配置 Provider
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader
              title="队列按类型"
              description="成功率与 P95 耗时，用于判断是哪一环在拖慢整体"
              action={<Button size="sm" variant="ghost" onClick={() => navigate('/tasks')}>任务监控</Button>}
            />
            <CardBody className="p-0">
              {queue.isError ? (
                <div className="p-5"><LoadError message="队列指标读取失败" onRetry={() => void queue.refetch()} /></div>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>类型</Th>
                      <Th>总数</Th>
                      <Th>成功率</Th>
                      <Th>P95</Th>
                      <Th>死信</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {(queue.data?.byKind ?? []).filter((k) => k.total > 0).length === 0 ? (
                      <tr>
                        <Td className="text-[var(--text-3)]">暂无任务记录</Td>
                        <Td /><Td /><Td /><Td />
                      </tr>
                    ) : (
                      queue.data!.byKind.filter((k) => k.total > 0).map((k) => (
                        <tr key={k.kind}>
                          <Td>{TASK_KIND_LABEL[k.kind] ?? k.kind}</Td>
                          <Td>{formatNumber(k.total)}</Td>
                          <Td>{(k.successRate * 100).toFixed(1)}%</Td>
                          <Td>{k.p95Ms > 0 ? `${(k.p95Ms / 1000).toFixed(1)}s` : '—'}</Td>
                          <Td className={k.dead > 0 ? 'text-[var(--error)]' : undefined}>{k.dead}</Td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="接入状态"
              description={`${enabledProviders} 个 Provider 已启用`}
              action={<Button size="sm" variant="ghost" onClick={() => navigate('/providers')}>Provider 配置</Button>}
            />
            <CardBody className="flex flex-col gap-2.5">
              {providers.isError ? (
                <LoadError message="Provider 列表读取失败" onRetry={() => void providers.refetch()} />
              ) : (providers.data?.length ?? 0) === 0 ? (
                <p className="text-[13px] text-[var(--text-3)]">还没有配置任何 Provider。</p>
              ) : (
                providers.data!.map((p) => (
                  <div key={p.providerId} className="flex items-center gap-3 rounded-[var(--radius-control)] border border-[var(--border)] px-3 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-1)]">{p.name}</span>
                    {p.isMock && <Badge tone="warning">Mock</Badge>}
                    <Badge tone={p.hasApiKey ? 'success' : 'neutral'}>{p.hasApiKey ? '已配置 Key' : '未配置 Key'}</Badge>
                    <Badge tone={p.enabled ? 'success' : 'neutral'}>{p.enabled ? '启用' : '停用'}</Badge>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader
            title="最近审计事件"
            description="登录、越权、配置变更都会留痕"
            action={<Button size="sm" variant="ghost" onClick={() => navigate('/audit')}>查看全部</Button>}
          />
          <CardBody className="p-0">
            {audit.isError ? (
              <div className="p-5"><LoadError message="审计日志读取失败" onRetry={() => void audit.refetch()} /></div>
            ) : (audit.data?.items.length ?? 0) === 0 ? (
              <p className="px-5 py-4 text-[13px] text-[var(--text-3)]">暂无审计事件。</p>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>时间</Th>
                    <Th>动作</Th>
                    <Th>对象</Th>
                    <Th>来源 IP</Th>
                  </tr>
                </thead>
                <tbody>
                  {audit.data!.items.map((e) => (
                    <tr key={e.auditId}>
                      <Td className="whitespace-nowrap text-[var(--text-3)]" title={formatTime(e.createdAt)}>
                        {relativeTime(e.createdAt)}
                      </Td>
                      <Td>
                        <Badge tone={e.action === 'forbidden' || e.action === 'login_failed' ? 'error' : 'neutral'}>
                          {AUDIT_ACTION_LABEL[e.action] ?? e.action}
                        </Badge>
                      </Td>
                      <Td className="max-w-[240px] truncate font-[var(--font-mono)] text-[12px] text-[var(--text-2)]" title={e.target}>
                        {e.target || '—'}
                      </Td>
                      <Td className="font-[var(--font-mono)] text-[12px] text-[var(--text-3)]">{e.ip || '—'}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>
    </AdminPage>
  );
}
