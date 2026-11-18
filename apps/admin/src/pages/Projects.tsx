import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, CardBody, Field, Input, Select, Table, Td, Th } from '@lumen/ui';
import { api } from '../api/client.js';
import { formatCosts, formatNumber, relativeTime, sumCosts, type CostBucket } from '../api/types.js';
import { AdminPage, LoadError, StatCard } from '../components/AdminPage.js';

const PAGE_SIZE = 25;

interface AdminProjectRow {
  projectId: string;
  tenantId: string;
  title: string;
  ownerName: string;
  ownerEmail: string;
  audienceTag: string;
  scene: string;
  styleId: string;
  status: string;
  pages: number;
  readyPages: number;
  failedPages: number;
  pendingPages: number;
  calls: number;
  costs: CostBucket[];
  createdAt: number;
  updatedAt: number;
}

interface ProjectListResult {
  items: AdminProjectRow[];
  total: number;
}

const STATUS_LABEL: Record<string, string> = {
  draft: '草稿',
  generating: '生成中',
  completed: '已完成',
  failed: '失败',
};

const STATUS_TONE: Record<string, 'neutral' | 'brand' | 'success' | 'error'> = {
  draft: 'neutral',
  generating: 'brand',
  completed: 'success',
  failed: 'error',
};

const STATUS_FILTERS = [
  { value: '', label: '全部状态' },
  { value: 'draft', label: '草稿' },
  { value: 'generating', label: '生成中' },
  { value: 'completed', label: '已完成' },
  { value: 'failed', label: '失败' },
];

export function ProjectsPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(0);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (status) p.set('status', status);
    p.set('limit', String(PAGE_SIZE));
    p.set('offset', String(page * PAGE_SIZE));
    return p.toString();
  }, [q, status, page]);

  const projects = useQuery({
    queryKey: ['admin', 'projects', query],
    queryFn: () => api.get<ProjectListResult>(`/admin/projects?${query}`),
    refetchInterval: 30_000,
  });

  const items = projects.data?.items ?? [];
  const total = projects.data?.total ?? 0;
  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  const totals = useMemo(() => ({
    pages: items.reduce((n, p) => n + p.pages, 0),
    failed: items.reduce((n, p) => n + p.failedPages, 0),
    calls: items.reduce((n, p) => n + p.calls, 0),
    costs: sumCosts(items.map((p) => p.costs)),
  }), [items]);

  return (
    <AdminPage
      title="项目总览"
      description="跨租户的演示项目清单。这里是只读观察窗口——改内容仍然走用户侧，运维不替用户改稿。"
      actions={
        <Button size="sm" variant="ghost" icon="RefreshCw" onClick={() => void projects.refetch()}>刷新</Button>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="项目数" value={formatNumber(total)} hint="当前筛选下" />
          <StatCard label="页面总数" value={formatNumber(totals.pages)} hint="本页统计" />
          <StatCard
            label="失败页"
            value={formatNumber(totals.failed)}
            tone={totals.failed > 0 ? 'error' : 'default'}
            hint="本页统计"
          />
          <StatCard label="累计调用" value={formatNumber(totals.calls)} hint={`费用 ${formatCosts(totals.costs)}`} />
        </div>

        <Card>
          <CardBody className="flex flex-wrap items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <Field label="搜索" htmlFor="proj-q">
                <Input
                  id="proj-q"
                  value={q}
                  placeholder="按标题或需求内容搜索"
                  onChange={(e) => { setQ(e.target.value); setPage(0); }}
                />
              </Field>
            </div>
            <div className="w-[160px]">
              <Select
                ariaLabel="状态筛选"
                value={status}
                onValueChange={(v) => { setStatus(v); setPage(0); }}
                options={STATUS_FILTERS}
              />
            </div>
            {(q || status) && (
              <Button size="sm" variant="ghost" icon="X" onClick={() => { setQ(''); setStatus(''); setPage(0); }}>
                清除筛选
              </Button>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-0">
            {projects.isError ? (
              <div className="p-5"><LoadError message="项目列表读取失败" onRetry={() => void projects.refetch()} /></div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>项目</Th>
                    <Th>归属</Th>
                    <Th>状态</Th>
                    <Th>页面</Th>
                    <Th>调用 / 费用</Th>
                    <Th>更新时间</Th>
                  </tr>
                </thead>
                <tbody>
                  {projects.isLoading ? (
                    <tr><Td className="text-[var(--text-3)]">加载中</Td><Td /><Td /><Td /><Td /><Td /></tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <Td className="text-[var(--text-3)]">
                        {q || status ? '没有匹配的项目' : '平台上还没有项目，跑一次 pnpm seed 会生成默认演示'}
                      </Td>
                      <Td /><Td /><Td /><Td /><Td />
                    </tr>
                  ) : (
                    items.map((p) => (
                      <tr key={p.projectId}>
                        <Td>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium text-[var(--text-1)]">{p.title}</span>
                            <span className="font-[var(--font-mono)] text-[12px] text-[var(--text-3)]">
                              {p.projectId}
                            </span>
                          </div>
                        </Td>
                        <Td>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[13px] text-[var(--text-2)]">{p.ownerName}</span>
                            <span className="font-[var(--font-mono)] text-[12px] text-[var(--text-3)]">{p.tenantId}</span>
                          </div>
                        </Td>
                        <Td>
                          <Badge tone={STATUS_TONE[p.status] ?? 'neutral'}>{STATUS_LABEL[p.status] ?? p.status}</Badge>
                        </Td>
                        <Td className="whitespace-nowrap text-[var(--text-2)]">
                          {p.readyPages} / {p.pages}
                          {p.failedPages > 0 && (
                            <span className="ml-1.5 text-[var(--error)]">{p.failedPages} 失败</span>
                          )}
                          {p.pendingPages > 0 && (
                            <span className="ml-1.5 text-[var(--text-3)]">{p.pendingPages} 待生成</span>
                          )}
                        </Td>
                        <Td className="whitespace-nowrap text-[var(--text-2)]">
                          {formatNumber(p.calls)} / {formatCosts(p.costs, '—')}
                        </Td>
                        <Td className="whitespace-nowrap text-[var(--text-3)]">{relativeTime(p.updatedAt)}</Td>
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
      </div>
    </AdminPage>
  );
}
