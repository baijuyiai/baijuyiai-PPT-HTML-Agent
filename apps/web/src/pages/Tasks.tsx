import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge, Button, Card, CardBody, CardHeader, EmptyState, Icon, PageLoader, Select, Table, Td, Th,
  useToast,
} from '@lumen/ui';
import { api } from '../api/client.js';
import {
  TASK_KIND_LABEL, TASK_STATUS_LABEL, formatTime, relativeTime, type QueueStats, type TaskSummary,
} from '../api/types.js';

const STATUS_TONE = {
  queued: 'neutral',
  running: 'brand',
  succeeded: 'success',
  failed: 'warning',
  dead: 'error',
  paused: 'neutral',
} as const;

export function TasksPage() {
  const toast = useToast();
  const qc = useQueryClient();
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');

  const stats = useQuery({
    queryKey: ['task-stats'],
    queryFn: () => api.get<QueueStats>('/tasks/stats'),
    refetchInterval: 5000,
  });

  const list = useQuery({
    queryKey: ['tasks', kind, status],
    queryFn: () => api.get<{ items: TaskSummary[]; total: number }>(
      `/tasks?${new URLSearchParams({ ...(kind ? { kind } : {}), ...(status ? { status } : {}) }).toString()}`,
    ),
    refetchInterval: 5000,
  });

  const retry = useMutation({
    mutationFn: (taskId: string) => api.post(`/tasks/${taskId}/retry`),
    onSuccess: async () => {
      toast.success('已重新入队');
      await qc.invalidateQueries({ queryKey: ['tasks'] });
      await qc.invalidateQueries({ queryKey: ['task-stats'] });
    },
    onError: (err: Error) => toast.error('重试失败', err.message),
  });

  const overall = (stats.data?.byKind ?? []).reduce(
    (acc, k) => ({ total: acc.total + k.total, succeeded: acc.succeeded + k.succeeded, degraded: acc.degraded + k.degraded }),
    { total: 0, succeeded: 0, degraded: 0 },
  );

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-8 py-8">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-[26px] font-semibold tracking-tight text-[var(--text-1)]">任务库</h1>
        <p className="text-[13px] text-[var(--text-3)]">
          按任务类型查看成功率与 P95 耗时。模型降级与失败原因都会在这里留痕。
        </p>
      </header>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="排队中" value={stats.data?.queued ?? 0} icon="Clock" />
        <StatCard label="执行中" value={stats.data?.running ?? 0} icon="Loader" />
        <StatCard
          label="整体成功率"
          value={overall.total > 0 ? `${Math.round((overall.succeeded / overall.total) * 100)}%` : '—'}
          icon="CircleCheck"
        />
        <StatCard label="进入死信" value={stats.data?.dead ?? 0} icon="OctagonAlert" tone={(stats.data?.dead ?? 0) > 0 ? 'error' : 'neutral'} />
      </div>

      {(stats.data?.byKind.length ?? 0) > 0 && (
        <Card>
          <CardHeader title="按任务类型" description="P95 为已完成任务的耗时 95 分位" />
          <Table>
            <thead>
              <tr>
                <Th>任务类型</Th>
                <Th>总数</Th>
                <Th>成功</Th>
                <Th>失败</Th>
                <Th>死信</Th>
                <Th>降级</Th>
                <Th>成功率</Th>
                <Th>P95</Th>
              </tr>
            </thead>
            <tbody>
              {stats.data!.byKind.map((k) => (
                <tr key={k.kind}>
                  <Td>{TASK_KIND_LABEL[k.kind] ?? k.kind}</Td>
                  <Td className="font-[var(--font-mono)] tabular-nums">{k.total}</Td>
                  <Td className="font-[var(--font-mono)] tabular-nums">{k.succeeded}</Td>
                  <Td className="font-[var(--font-mono)] tabular-nums">{k.failed}</Td>
                  <Td className="font-[var(--font-mono)] tabular-nums">{k.dead}</Td>
                  <Td className="font-[var(--font-mono)] tabular-nums">{k.degraded}</Td>
                  <Td className="font-[var(--font-mono)] tabular-nums">
                    {k.total > 0 ? `${Math.round(k.successRate * 100)}%` : '—'}
                  </Td>
                  <Td className="font-[var(--font-mono)] tabular-nums">{k.p95Ms > 0 ? `${(k.p95Ms / 1000).toFixed(1)}s` : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}

      <Card>
        <CardHeader
          title="任务列表"
          action={
            <div className="flex items-center gap-2">
              <Select
                ariaLabel="按类型筛选"
                value={kind || 'all'}
                onValueChange={(v) => setKind(v === 'all' ? '' : v)}
                className="w-[150px]"
                options={[{ value: 'all', label: '全部类型' }, ...Object.entries(TASK_KIND_LABEL).map(([v, l]) => ({ value: v, label: l }))]}
              />
              <Select
                ariaLabel="按状态筛选"
                value={status || 'all'}
                onValueChange={(v) => setStatus(v === 'all' ? '' : v)}
                className="w-[140px]"
                options={[{ value: 'all', label: '全部状态' }, ...Object.entries(TASK_STATUS_LABEL).map(([v, l]) => ({ value: v, label: l }))]}
              />
            </div>
          }
        />
        {list.isLoading ? (
          <div className="py-16"><PageLoader label="正在加载任务" /></div>
        ) : (list.data?.items.length ?? 0) === 0 ? (
          <EmptyState icon="ListChecks" title="没有任务" description="生成、导出与图片任务都会出现在这里。" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>类型</Th>
                <Th>状态</Th>
                <Th>尝试</Th>
                <Th>耗时</Th>
                <Th>创建时间</Th>
                <Th>说明</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {list.data!.items.map((t) => (
                <tr key={t.taskId}>
                  <Td>{TASK_KIND_LABEL[t.kind] ?? t.kind}</Td>
                  <Td><Badge tone={STATUS_TONE[t.status]}>{TASK_STATUS_LABEL[t.status]}</Badge></Td>
                  <Td className="font-[var(--font-mono)] tabular-nums">{t.attempts} / {t.maxAttempts}</Td>
                  <Td className="font-[var(--font-mono)] tabular-nums">
                    {t.startedAt && t.finishedAt ? `${((t.finishedAt - t.startedAt) / 1000).toFixed(1)}s` : '—'}
                  </Td>
                  <Td className="text-[13px] text-[var(--text-3)]" title={formatTime(t.createdAt)}>
                    {relativeTime(t.createdAt)}
                  </Td>
                  <Td className="max-w-[320px] text-[13px] text-[var(--text-3)]">
                    <span className="line-clamp-2">{t.degradeReason || t.error || '—'}</span>
                  </Td>
                  <Td>
                    {(t.status === 'dead' || t.status === 'failed') && (
                      <Button size="sm" icon="RotateCcw" loading={retry.isPending} onClick={() => retry.mutate(t.taskId)}>
                        重试
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function StatCard({
  label, value, icon, tone = 'neutral',
}: { label: string; value: number | string; icon: 'Clock' | 'Loader' | 'CircleCheck' | 'OctagonAlert'; tone?: 'neutral' | 'error' }) {
  return (
    <Card>
      <CardBody className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-[12px] text-[var(--text-3)]">{label}</span>
          <span
            className="font-[var(--font-mono)] text-[24px] font-semibold tabular-nums"
            style={{ color: tone === 'error' ? 'var(--error)' : 'var(--text-1)' }}
          >
            {value}
          </span>
        </div>
        <span className="text-[var(--text-3)]">
          <Icon name={icon} size={24} />
        </span>
      </CardBody>
    </Card>
  );
}
