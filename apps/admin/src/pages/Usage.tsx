import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, CardBody, CardHeader, Field, Input, Select, Table, Td, Th } from '@lumen/ui';
import { api } from '../api/client.js';
import {
  formatCost, formatCosts, formatNumber, formatTime, type UsageResult,
} from '../api/types.js';
import { AdminPage, LoadError, StatCard } from '../components/AdminPage.js';

const PAGE_SIZE = 40;

const KIND_FILTERS = [
  { value: '', label: '全部计量' },
  { value: 'text', label: '文本 Token' },
  { value: 'image', label: '图片张数' },
];

function toTimestamp(dateStr: string, endOfDay: boolean): number | undefined {
  if (!dateStr) return undefined;
  const d = new Date(`${dateStr}T${endOfDay ? '23:59:59' : '00:00:00'}`);
  return Number.isNaN(d.getTime()) ? undefined : d.getTime();
}

export function UsagePage() {
  const [kind, setKind] = useState('');
  const [userId, setUserId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);

  const filters = useMemo(() => {
    const p = new URLSearchParams();
    if (kind) p.set('kind', kind);
    if (userId.trim()) p.set('userId', userId.trim());
    if (projectId.trim()) p.set('projectId', projectId.trim());
    const f = toTimestamp(from, false);
    const t = toTimestamp(to, true);
    if (f) p.set('from', String(f));
    if (t) p.set('to', String(t));
    return p;
  }, [kind, userId, projectId, from, to]);

  const usage = useQuery({
    queryKey: ['admin', 'usage', filters.toString(), page],
    queryFn: () => {
      const p = new URLSearchParams(filters);
      p.set('limit', String(PAGE_SIZE));
      p.set('offset', String(page * PAGE_SIZE));
      return api.get<UsageResult>(`/admin/usage?${p.toString()}`);
    },
  });

  const summary = usage.data?.summary;
  const total = usage.data?.records.total ?? 0;
  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const filtered = Boolean(kind || userId || projectId || from || to);

  return (
    <AdminPage
      title="用量与计费"
      description="按调用计量的原始记录。文本按 Token、图片按张数分别计量，费用取自 Provider 配置的口径。"
      actions={
        <Button size="sm" variant="ghost" icon="RefreshCw" onClick={() => void usage.refetch()}>刷新</Button>
      }
    >
      <div className="flex flex-col gap-5">
        <Card>
          <CardBody className="flex flex-wrap items-end gap-3">
            <div className="w-[150px]">
              <Select ariaLabel="计量类型" value={kind} onValueChange={(v) => { setKind(v); setPage(0); }} options={KIND_FILTERS} />
            </div>
            <div className="min-w-[170px] flex-1">
              <Field label="用户 ID" htmlFor="usage-user" hint="留空表示全部">
                <Input id="usage-user" value={userId} placeholder="usr_..." onChange={(e) => { setUserId(e.target.value); setPage(0); }} />
              </Field>
            </div>
            <div className="min-w-[170px] flex-1">
              <Field label="项目 ID" htmlFor="usage-project" hint="留空表示全部">
                <Input id="usage-project" value={projectId} placeholder="prj_..." onChange={(e) => { setProjectId(e.target.value); setPage(0); }} />
              </Field>
            </div>
            <div className="w-[150px]">
              <Field label="起始日期" htmlFor="usage-from">
                <Input id="usage-from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
              </Field>
            </div>
            <div className="w-[150px]">
              <Field label="截止日期" htmlFor="usage-to">
                <Input id="usage-to" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} />
              </Field>
            </div>
            {filtered && (
              <Button
                size="sm"
                variant="ghost"
                icon="X"
                onClick={() => { setKind(''); setUserId(''); setProjectId(''); setFrom(''); setTo(''); setPage(0); }}
              >
                清除筛选
              </Button>
            )}
          </CardBody>
        </Card>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="调用次数" value={summary ? formatNumber(summary.calls) : '—'} />
          <StatCard label="文本 Token" value={summary ? formatNumber(summary.tokens) : '—'} />
          <StatCard label="图片张数" value={summary ? formatNumber(summary.images) : '—'} />
          <StatCard
            label="累计费用"
            value={summary ? formatCosts(summary.costs, '—') : '—'}
            hint={summary ? `失败 ${summary.failures} 次，降级 ${summary.degraded} 次` : ''}
            tone={(summary?.failures ?? 0) > 0 ? 'warning' : 'default'}
          />
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader title="按 Provider" description="用于判断费用集中在哪个接入方" />
            <CardBody className="p-0">
              {usage.isError ? (
                <div className="p-5"><LoadError message="用量读取失败" onRetry={() => void usage.refetch()} /></div>
              ) : (summary?.byProvider.length ?? 0) === 0 ? (
                <p className="px-5 py-4 text-[13px] text-[var(--text-3)]">当前筛选下没有调用记录。</p>
              ) : (
                <Table>
                  <thead>
                    <tr><Th>Provider</Th><Th>调用</Th><Th>Token</Th><Th>图片</Th><Th>费用</Th></tr>
                  </thead>
                  <tbody>
                    {summary!.byProvider.map((p) => (
                      <tr key={p.providerId}>
                        <Td className="font-[var(--font-mono)] text-[12px] text-[var(--text-2)]">{p.providerId}</Td>
                        <Td>{formatNumber(p.calls)}</Td>
                        <Td>{formatNumber(p.tokens)}</Td>
                        <Td>{formatNumber(p.images)}</Td>
                        <Td>{formatCosts(p.costs, '—')}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="按任务类型" description="用于定位哪个环节最贵" />
            <CardBody className="p-0">
              {(summary?.byTaskType.length ?? 0) === 0 ? (
                <p className="px-5 py-4 text-[13px] text-[var(--text-3)]">当前筛选下没有调用记录。</p>
              ) : (
                <Table>
                  <thead>
                    <tr><Th>任务类型</Th><Th>调用</Th><Th>Token</Th><Th>图片</Th><Th>费用</Th></tr>
                  </thead>
                  <tbody>
                    {summary!.byTaskType.map((t) => (
                      <tr key={t.taskType}>
                        <Td className="text-[var(--text-2)]">{t.taskType}</Td>
                        <Td>{formatNumber(t.calls)}</Td>
                        <Td>{formatNumber(t.tokens)}</Td>
                        <Td>{formatNumber(t.images)}</Td>
                        <Td>{formatCosts(t.costs, '—')}</Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader title="原始记录" description={`共 ${formatNumber(total)} 条`} />
          <CardBody className="p-0">
            {usage.isError ? (
              <div className="p-5"><LoadError message="用量记录读取失败" onRetry={() => void usage.refetch()} /></div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>时间</Th>
                    <Th>任务</Th>
                    <Th>计量</Th>
                    <Th>Provider / 模型</Th>
                    <Th>数量</Th>
                    <Th>费用</Th>
                    <Th>耗时</Th>
                    <Th>结果</Th>
                  </tr>
                </thead>
                <tbody>
                  {usage.isLoading ? (
                    <tr><Td className="text-[var(--text-3)]">加载中</Td><Td /><Td /><Td /><Td /><Td /><Td /><Td /></tr>
                  ) : (usage.data?.records.items.length ?? 0) === 0 ? (
                    <tr>
                      <Td className="text-[var(--text-3)]">没有匹配的记录</Td>
                      <Td /><Td /><Td /><Td /><Td /><Td /><Td />
                    </tr>
                  ) : (
                    usage.data!.records.items.map((r) => (
                      <tr key={r.usageId}>
                        <Td className="whitespace-nowrap text-[var(--text-2)]">{formatTime(r.createdAt)}</Td>
                        <Td className="text-[var(--text-2)]">{r.taskType}</Td>
                        <Td>
                          <Badge tone={r.kind === 'image' ? 'accent' : 'neutral'}>
                            {r.kind === 'image' ? '图片' : '文本'}
                          </Badge>
                        </Td>
                        <Td className="max-w-[220px] truncate font-[var(--font-mono)] text-[12px] text-[var(--text-2)]" title={`${r.providerId} / ${r.model}`}>
                          {r.providerId} / {r.model}
                        </Td>
                        <Td className="text-[var(--text-2)]">
                          {r.kind === 'image'
                            ? `${r.amount} 张`
                            : `${formatNumber(r.inputTokens)} 入 / ${formatNumber(r.outputTokens)} 出`}
                        </Td>
                        <Td className="text-[var(--text-2)]">{formatCost(r.cost, r.currency)}</Td>
                        <Td className="text-[var(--text-3)]">{r.latencyMs > 0 ? `${(r.latencyMs / 1000).toFixed(1)}s` : '—'}</Td>
                        <Td>
                          {r.ok ? (
                            r.degradeReason ? <Badge tone="warning">降级</Badge> : <Badge tone="success">成功</Badge>
                          ) : (
                            <Badge tone="error">失败</Badge>
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
          <span className="text-[12px] text-[var(--text-3)]">第 {page + 1} / {maxPage + 1} 页</span>
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
    </AdminPage>
  );
}
