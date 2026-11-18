import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge, Button, Card, CardBody, CardHeader, Field, Input, Select, Table, Td, Th, useToast,
} from '@lumen/ui';
import { api } from '../api/client.js';
import {
  TASK_KIND_LABEL, TASK_STATUS_LABEL, formatNumber, formatTime, taskKindLabel,
  type QueueStats, type TaskListResult, type TaskSummary,
} from '../api/types.js';
import { AdminPage, LoadError, StatCard } from '../components/AdminPage.js';

const PAGE_SIZE = 30;

const KIND_FILTERS = [
  { value: '', label: '全部类型' },
  ...Object.entries(TASK_KIND_LABEL).map(([value, label]) => ({ value, label })),
];

const STATUS_FILTERS = [
  { value: '', label: '全部状态' },
  { value: 'queued', label: '排队中' },
  { value: 'running', label: '执行中' },
  { value: 'succeeded', label: '已完成' },
  { value: 'failed', label: '失败待重试' },
  { value: 'dead', label: '已进入死信' },
];

const STATUS_TONE: Record<string, 'neutral' | 'brand' | 'success' | 'warning' | 'error'> = {
  queued: 'neutral',
  running: 'brand',
  succeeded: 'success',
  failed: 'warning',
  dead: 'error',
};

export function TasksPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState<'live' | 'dlq'>('live');

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (kind) p.set('kind', kind);
    if (status) p.set('status', status);
    if (tenantId.trim()) p.set('tenantId', tenantId.trim());
    p.set('limit', String(PAGE_SIZE));
    p.set('offset', String(page * PAGE_SIZE));
    return p.toString();
  }, [kind, status, tenantId, page]);

  const stats = useQuery({
    queryKey: ['admin', 'queue-stats'],
    queryFn: () => api.get<QueueStats>('/admin/tasks/stats'),
    refetchInterval: 10_000,
  });

  const tasks = useQuery({
    queryKey: ['admin', 'tasks', query],
    queryFn: () => api.get<TaskListResult>(`/admin/tasks?${query}`),
    refetchInterval: tab === 'live' ? 10_000 : false,
  });

  const dlq = useQuery({
    queryKey: ['admin', 'tasks-dlq'],
    queryFn: () => api.get<TaskListResult>('/admin/tasks/dlq?limit=100'),
    enabled: tab === 'dlq',
  });

  const retry = useMutation({
    mutationFn: (taskId: string) => api.post<{ retried: boolean }>(`/admin/tasks/${taskId}/retry`),
    onSuccess: (r) => {
      if (r.retried) toast.success('已重新入队');
      else toast.error('无法重试', '该任务当前状态不支持重试');
      void qc.invalidateQueries({ queryKey: ['admin', 'tasks'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'tasks-dlq'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'queue-stats'] });
    },
    onError: (err: Error) => toast.error('重试失败', err.message),
  });

  const total = tasks.data?.total ?? 0;
  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const byKind = (stats.data?.byKind ?? []).filter((k) => k.total > 0);
  const totalP95 = byKind.length > 0 ? Math.max(...byKind.map((k) => k.p95Ms)) : 0;

  return (
    <AdminPage
      title="任务监控"
      description="跨租户的队列视图。死信表示重试耗尽，需要人工介入；重试会重置状态并重新入队。"
      actions={
        <Button
          size="sm"
          variant="ghost"
          icon="RefreshCw"
          onClick={() => { void stats.refetch(); void tasks.refetch(); void dlq.refetch(); }}
        >
          刷新
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="排队中" value={stats.isSuccess ? formatNumber(stats.data.queued) : '—'} />
          <StatCard label="执行中" value={stats.isSuccess ? formatNumber(stats.data.running) : '—'} />
          <StatCard
            label="死信"
            value={stats.isSuccess ? formatNumber(stats.data.dead) : '—'}
            tone={(stats.data?.dead ?? 0) > 0 ? 'error' : 'default'}
          />
          <StatCard label="最慢环节 P95" value={totalP95 > 0 ? `${(totalP95 / 1000).toFixed(1)}s` : '—'} />
        </div>

        {byKind.length > 0 && (
          <Card>
            <CardHeader title="按类型" description="成功率与 P95 用于定位是哪一环在拖慢整体" />
            <CardBody className="p-0">
              <Table>
                <thead>
                  <tr>
                    <Th>类型</Th>
                    <Th>总数</Th>
                    <Th>成功</Th>
                    <Th>失败</Th>
                    <Th>死信</Th>
                    <Th>成功率</Th>
                    <Th>P95</Th>
                    <Th>降级</Th>
                  </tr>
                </thead>
                <tbody>
                  {byKind.map((k) => (
                    <tr key={k.kind}>
                      <Td className="font-medium text-[var(--text-1)]">{taskKindLabel(k.kind)}</Td>
                      <Td>{formatNumber(k.total)}</Td>
                      <Td className="text-[var(--success)]">{k.succeeded}</Td>
                      <Td className={k.failed > 0 ? 'text-[var(--warning)]' : undefined}>{k.failed}</Td>
                      <Td className={k.dead > 0 ? 'text-[var(--error)]' : undefined}>{k.dead}</Td>
                      <Td>{(k.successRate * 100).toFixed(1)}%</Td>
                      <Td>{k.p95Ms > 0 ? `${(k.p95Ms / 1000).toFixed(1)}s` : '—'}</Td>
                      <Td>{k.degraded}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </CardBody>
          </Card>
        )}

        <div className="flex items-center gap-1 border-b border-[var(--border)]">
          <TabButton active={tab === 'live'} onClick={() => setTab('live')}>任务列表</TabButton>
          <TabButton active={tab === 'dlq'} onClick={() => setTab('dlq')}>
            死信队列{dlq.data?.total ? `（${dlq.data.total}）` : ''}
          </TabButton>
        </div>

        {tab === 'live' ? (
          <>
            <Card>
              <CardBody className="flex flex-wrap items-end gap-3">
                <div className="w-[180px]">
                  <Select ariaLabel="类型筛选" value={kind} onValueChange={(v) => { setKind(v); setPage(0); }} options={KIND_FILTERS} />
                </div>
                <div className="w-[160px]">
                  <Select ariaLabel="状态筛选" value={status} onValueChange={(v) => { setStatus(v); setPage(0); }} options={STATUS_FILTERS} />
                </div>
                <div className="min-w-[180px] flex-1">
                  <Field label="租户 ID" htmlFor="task-tenant" hint="留空表示全部租户">
                    <Input
                      id="task-tenant"
                      value={tenantId}
                      placeholder="tn_..."
                      onChange={(e) => { setTenantId(e.target.value); setPage(0); }}
                    />
                  </Field>
                </div>
              </CardBody>
            </Card>

            <Card>
              <CardBody className="p-0">
                {tasks.isError ? (
                  <div className="p-5"><LoadError message="任务列表读取失败" onRetry={() => void tasks.refetch()} /></div>
                ) : (
                  <Table>
                    <thead>
                      <tr>
                        <Th>任务</Th>
                        <Th>租户</Th>
                        <Th>状态</Th>
                        <Th>尝试</Th>
                        <Th>降级原因</Th>
                        <Th>耗时</Th>
                        <Th>创建时间</Th>
                        <Th>操作</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {tasks.isLoading ? (
                        <tr><Td className="text-[var(--text-3)]">加载中</Td><Td /><Td /><Td /><Td /><Td /><Td /><Td /></tr>
                      ) : (tasks.data?.items.length ?? 0) === 0 ? (
                        <tr>
                          <Td className="text-[var(--text-3)]">没有匹配的任务</Td>
                          <Td /><Td /><Td /><Td /><Td /><Td /><Td />
                        </tr>
                      ) : (
                        tasks.data!.items.map((t) => (
                          <tr key={t.taskId}>
                            <Td>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[13px] font-medium text-[var(--text-1)]">
                                  {taskKindLabel(t.kind)}
                                </span>
                                <span className="font-[var(--font-mono)] text-[12px] text-[var(--text-3)]">{t.taskId}</span>
                              </div>
                            </Td>
                            <Td className="font-[var(--font-mono)] text-[12px] text-[var(--text-2)]">{t.tenantId}</Td>
                            <Td>
                              <Badge tone={STATUS_TONE[t.status] ?? 'neutral'}>{TASK_STATUS_LABEL[t.status] ?? t.status}</Badge>
                              {t.error && (
                                <span className="mt-1 block max-w-[240px] truncate text-[12px] text-[var(--error)]" title={t.error}>
                                  {t.error}
                                </span>
                              )}
                            </Td>
                            <Td className="text-[var(--text-2)]">{t.attempts} / {t.maxAttempts}</Td>
                            <Td className="max-w-[200px] truncate text-[12px] text-[var(--text-3)]" title={t.degradeReason}>
                              {t.degradeReason || '—'}
                            </Td>
                            <Td className="whitespace-nowrap text-[var(--text-2)]">{durationText(t)}</Td>
                            <Td className="whitespace-nowrap text-[var(--text-3)]">{formatTime(t.createdAt)}</Td>
                            <Td>
                              {t.status === 'failed' || t.status === 'dead' ? (
                                <Button size="sm" variant="ghost" loading={retry.isPending} onClick={() => retry.mutate(t.taskId)}>
                                  重试
                                </Button>
                              ) : (
                                <span className="text-[12px] text-[var(--text-3)]">—</span>
                              )}
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
                共 {formatNumber(total)} 条，第 {page + 1} / {maxPage + 1} 页
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
          </>
        ) : (
          <Card>
            <CardHeader title="死信队列" description="重试次数耗尽的任务会移入这里，确认原因后可重新入队" />
            <CardBody className="p-0">
              {dlq.isError ? (
                <div className="p-5"><LoadError message="死信队列读取失败" onRetry={() => void dlq.refetch()} /></div>
              ) : (dlq.data?.items.length ?? 0) === 0 ? (
                <p className="px-5 py-4 text-[13px] text-[var(--text-3)]">死信队列为空。</p>
              ) : (
                <Table>
                  <thead>
                    <tr>
                      <Th>任务</Th>
                      <Th>租户</Th>
                      <Th>错误</Th>
                      <Th>创建时间</Th>
                      <Th>操作</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {dlq.data!.items.map((t) => (
                      <tr key={t.taskId}>
                        <Td>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[13px] font-medium text-[var(--text-1)]">
                              {taskKindLabel(t.kind)}
                            </span>
                            <span className="font-[var(--font-mono)] text-[12px] text-[var(--text-3)]">{t.taskId}</span>
                          </div>
                        </Td>
                        <Td className="font-[var(--font-mono)] text-[12px] text-[var(--text-2)]">{t.tenantId}</Td>
                        <Td className="max-w-[320px] text-[12px] text-[var(--error)]" title={t.error}>{t.error || '—'}</Td>
                        <Td className="whitespace-nowrap text-[var(--text-3)]">{formatTime(t.createdAt)}</Td>
                        <Td>
                          <Button size="sm" variant="ghost" loading={retry.isPending} onClick={() => retry.mutate(t.taskId)}>
                            重新入队
                          </Button>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        )}
      </div>
    </AdminPage>
  );
}

function TabButton({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? '-mb-px border-b-2 border-[var(--brand-600)] px-3 py-2 text-[13px] font-medium text-[var(--brand-600)]'
          : '-mb-px border-b-2 border-transparent px-3 py-2 text-[13px] font-medium text-[var(--text-2)] hover:text-[var(--text-1)]'
      }
    >
      {children}
    </button>
  );
}

function durationText(t: TaskSummary): string {
  if (!t.startedAt) return '—';
  const end = t.finishedAt ?? Date.now();
  const ms = end - t.startedAt;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`;
}
