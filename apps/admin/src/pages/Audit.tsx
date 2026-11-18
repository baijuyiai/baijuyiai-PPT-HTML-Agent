import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, CardBody, Field, Input, Select, Table, Td, Th } from '@lumen/ui';
import { api } from '../api/client.js';
import { AUDIT_ACTION_LABEL, formatNumber, formatTime, type AuditListResult } from '../api/types.js';
import { AdminPage, LoadError } from '../components/AdminPage.js';

const PAGE_SIZE = 40;

const ACTION_FILTERS = [
  { value: '', label: '全部动作' },
  ...Object.entries(AUDIT_ACTION_LABEL).map(([value, label]) => ({ value, label })),
];

/** 敏感的越权与失败事件单独标色，便于一眼扫到 */
const ALERT_ACTIONS = new Set(['forbidden', 'login_failed', 'login_locked', 'disable_user']);

function toTimestamp(dateStr: string, endOfDay: boolean): number | undefined {
  if (!dateStr) return undefined;
  const d = new Date(`${dateStr}T${endOfDay ? '23:59:59' : '00:00:00'}`);
  return Number.isNaN(d.getTime()) ? undefined : d.getTime();
}

export function AuditPage() {
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (action) p.set('action', action);
    if (userId.trim()) p.set('userId', userId.trim());
    const f = toTimestamp(from, false);
    const t = toTimestamp(to, true);
    if (f) p.set('from', String(f));
    if (t) p.set('to', String(t));
    p.set('limit', String(PAGE_SIZE));
    p.set('offset', String(page * PAGE_SIZE));
    return p.toString();
  }, [action, userId, from, to, page]);

  const audit = useQuery({
    queryKey: ['admin', 'audit', query],
    queryFn: () => api.get<AuditListResult>(`/admin/audit?${query}`),
  });

  const total = audit.data?.total ?? 0;
  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const filtered = Boolean(action || userId || from || to);

  return (
    <AdminPage
      title="审计日志"
      description="登录、越权、配置变更与配额调整都会留痕。日志只读，不提供删除入口。"
      actions={
        <Button
          size="sm"
          variant="ghost"
          icon="RefreshCw"
          onClick={() => void audit.refetch()}
        >
          刷新
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        <Card>
          <CardBody className="flex flex-wrap items-end gap-3">
            <div className="w-[170px]">
              <Select ariaLabel="动作筛选" value={action} onValueChange={(v) => { setAction(v); setPage(0); }} options={ACTION_FILTERS} />
            </div>
            <div className="min-w-[190px] flex-1">
              <Field label="用户 ID" htmlFor="audit-user" hint="留空表示全部">
                <Input
                  id="audit-user"
                  value={userId}
                  placeholder="usr_..."
                  onChange={(e) => { setUserId(e.target.value); setPage(0); }}
                />
              </Field>
            </div>
            <div className="w-[160px]">
              <Field label="起始日期" htmlFor="audit-from">
                <Input id="audit-from" type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
              </Field>
            </div>
            <div className="w-[160px]">
              <Field label="截止日期" htmlFor="audit-to">
                <Input id="audit-to" type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} />
              </Field>
            </div>
            {filtered && (
              <Button
                size="sm"
                variant="ghost"
                icon="X"
                onClick={() => { setAction(''); setUserId(''); setFrom(''); setTo(''); setPage(0); }}
              >
                清除筛选
              </Button>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-0">
            {audit.isError ? (
              <div className="p-5"><LoadError message="审计日志读取失败" onRetry={() => void audit.refetch()} /></div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>时间</Th>
                    <Th>动作</Th>
                    <Th>用户</Th>
                    <Th>对象</Th>
                    <Th>详情</Th>
                    <Th>来源 IP</Th>
                  </tr>
                </thead>
                <tbody>
                  {audit.isLoading ? (
                    <tr><Td className="text-[var(--text-3)]">加载中</Td><Td /><Td /><Td /><Td /><Td /></tr>
                  ) : (audit.data?.items.length ?? 0) === 0 ? (
                    <tr>
                      <Td className="text-[var(--text-3)]">{filtered ? '没有匹配的审计事件' : '暂无审计事件'}</Td>
                      <Td /><Td /><Td /><Td /><Td />
                    </tr>
                  ) : (
                    audit.data!.items.map((e) => (
                      <tr key={e.auditId}>
                        <Td className="whitespace-nowrap text-[var(--text-2)]">{formatTime(e.createdAt)}</Td>
                        <Td>
                          <Badge tone={ALERT_ACTIONS.has(e.action) ? 'error' : 'neutral'}>
                            {AUDIT_ACTION_LABEL[e.action] ?? e.action}
                          </Badge>
                        </Td>
                        <Td className="font-[var(--font-mono)] text-[12px] text-[var(--text-2)]">{e.userId || '—'}</Td>
                        <Td className="max-w-[220px] truncate font-[var(--font-mono)] text-[12px] text-[var(--text-2)]" title={e.target}>
                          {e.target || '—'}
                        </Td>
                        <Td className="max-w-[280px] truncate text-[12px] text-[var(--text-3)]" title={JSON.stringify(e.meta)}>
                          {metaText(e.meta)}
                        </Td>
                        <Td className="font-[var(--font-mono)] text-[12px] text-[var(--text-3)]">{e.ip || '—'}</Td>
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

/** meta 是自由结构，这里压成一行可读文本，避免表格里塞大段 JSON */
function metaText(meta: Record<string, unknown>): string {
  const entries = Object.entries(meta);
  if (entries.length === 0) return '—';
  return entries
    .map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join('  ');
}
