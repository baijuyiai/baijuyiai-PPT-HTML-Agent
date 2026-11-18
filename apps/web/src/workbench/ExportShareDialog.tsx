import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge, Button, Card, CardBody, Dialog, Icon, IconButton, Progress, Select, useToast,
} from '@lumen/ui';
import { api, pollUntil } from '../api/client.js';
import { formatTime, type ExportJobSummary, type ShareSummary } from '../api/types.js';

const FORMATS = [
  { value: 'pptx-editable', label: 'PPTX（可编辑，默认）' },
  { value: 'pptx', label: 'PPTX（截图版，文字不可编辑）' },
  { value: 'pdf', label: 'PDF' },
  { value: 'html', label: 'HTML（单文件自包含）' },
  // 视频链路尚未接通，置灰而不是让它点了报错
  { value: 'mp4', label: 'MP4 视频（暂未开放）', disabled: true },
];

export function ExportShareDialog({
  open, onOpenChange, projectId, readyCount, totalPages,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  readyCount: number;
  totalPages: number;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  // 默认给可编辑版：用户要的是「保存下来能改」。截图版留着给「要 100% 还原」的场合
  const [format, setFormat] = useState('pptx-editable');
  const [activeExport, setActiveExport] = useState<ExportJobSummary | null>(null);

  const notes = useQuery({
    queryKey: ['export-notes'],
    queryFn: () => api.get<{ notes: Record<string, string> }>('/exports/notes'),
    enabled: open,
  });

  const exports = useQuery({
    queryKey: ['exports', projectId],
    queryFn: () => api.get<ExportJobSummary[]>(`/exports?projectId=${projectId}`),
    enabled: open,
  });

  const shares = useQuery({
    queryKey: ['shares', projectId],
    queryFn: () => api.get<ShareSummary[]>(`/shares?projectId=${projectId}`),
    enabled: open,
  });

  const createExport = useMutation({
    mutationFn: () => api.post<ExportJobSummary>('/exports', { projectId, format }),
    onSuccess: async (job) => {
      setActiveExport(job);
      toast.info('导出已开始', '生成完成后会自动出现下载按钮');
      const final = await pollUntil(
        () => api.get<ExportJobSummary>(`/exports/job/${job.exportId}`),
        (j) => j.status === 'succeeded' || j.status === 'failed',
        { intervalMs: 1500, timeoutMs: 8 * 60 * 1000 },
      );
      setActiveExport(final);
      await qc.invalidateQueries({ queryKey: ['exports', projectId] });
      if (final.status === 'succeeded') toast.success('导出完成');
      else toast.error('导出失败', final.error || '未知原因');
    },
    onError: (err: Error) => toast.error('无法发起导出', err.message),
  });

  const createShare = useMutation({
    mutationFn: (ttlDays: number) => api.post<ShareSummary>('/shares', { projectId, ttlDays }),
    onSuccess: async (s) => {
      await qc.invalidateQueries({ queryKey: ['shares', projectId] });
      const url = s.url ?? `${window.location.origin}/share/${s.token}`;
      await navigator.clipboard.writeText(url).catch(() => undefined);
      toast.success('分享链接已创建并复制', url);
    },
    onError: (err: Error) => toast.error('创建失败', err.message),
  });

  const revoke = useMutation({
    mutationFn: (shareId: string) => api.del(`/shares/${shareId}`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['shares', projectId] });
      toast.success('已撤销');
    },
  });

  const notReady = readyCount < totalPages;
  const current = activeExport ?? exports.data?.[0] ?? null;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="导出与分享"
      description="导出前会校验全部页面就绪；分享链接带签名与有效期，访客只读。"
      width={620}
    >
      <div className="flex flex-col gap-5">
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[13px] font-semibold text-[var(--text-1)]">导出</h3>
            <Badge tone={notReady ? 'warning' : 'success'}>
              {readyCount} / {totalPages} 页就绪
            </Badge>
          </div>

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <Select
                ariaLabel="导出格式"
                value={format}
                onValueChange={setFormat}
                options={FORMATS}
              />
            </div>
            <Button pill
              variant="primary"
              icon="Download"
              loading={createExport.isPending}
              disabled={notReady || totalPages === 0}
              onClick={() => createExport.mutate()}
            >
              开始导出
            </Button>
          </div>

          {notes.data?.notes[format] && (
            <p className="rounded-[var(--radius-control)] bg-[var(--surface-1)] px-3 py-2.5 text-[12px] leading-[1.6] text-[var(--text-3)]">
              {notes.data.notes[format]}
            </p>
          )}

          {current && (
            <Card>
              <CardBody className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[13px] text-[var(--text-1)]">
                    {FORMATS.find((f) => f.value === current.format)?.label ?? current.format}
                  </span>
                  <Badge tone={current.status === 'succeeded' ? 'success' : current.status === 'failed' ? 'error' : 'brand'}>
                    {current.status === 'succeeded' ? '已完成' : current.status === 'failed' ? '失败' : '进行中'}
                  </Badge>
                </div>
                {current.status === 'running' || current.status === 'queued' ? (
                  <Progress value={current.progress} label="导出进度" />
                ) : null}
                {current.error && <p className="text-[12px] text-[var(--error)]">{current.error}</p>}
                {current.status === 'succeeded' && current.artifactUrl && (
                  <a
                    href={current.artifactUrl}
                    download
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-[var(--brand-500)] px-4 text-sm font-medium text-[var(--brand-fg)] transition-colors duration-150 hover:bg-[var(--brand-600)]"
                  >
                    <Icon name="Download" size={16} />
                    下载文件
                  </a>
                )}
                <span className="text-[12px] text-[var(--text-3)]">{formatTime(current.createdAt)}</span>
              </CardBody>
            </Card>
          )}

          {(exports.data?.length ?? 0) > 1 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] text-[var(--text-3)]">历史导出</span>
              {exports.data!.slice(1, 5).map((j) => (
                <div key={j.exportId} className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--border)] px-3 py-2">
                  <span className="text-[12px] text-[var(--text-2)]">
                    {FORMATS.find((f) => f.value === j.format)?.label ?? j.format}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-[12px] text-[var(--text-3)]">{formatTime(j.createdAt)}</span>
                    {j.status === 'succeeded' && j.artifactUrl && (
                      <a href={j.artifactUrl} download className="text-[12px] text-[var(--brand-600)] hover:underline">下载</a>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="flex flex-col gap-3 border-t border-[var(--border)] pt-5">
          <h3 className="text-[13px] font-semibold text-[var(--text-1)]">分享</h3>
          <div className="flex flex-wrap items-center gap-2">
            <Button pill size="sm" icon="Link" loading={createShare.isPending} disabled={totalPages === 0} onClick={() => createShare.mutate(30)}>
              创建 30 天链接
            </Button>
            <Button pill size="sm" variant="ghost" onClick={() => createShare.mutate(7)}>7 天</Button>
            <Button pill size="sm" variant="ghost" onClick={() => createShare.mutate(0)}>不过期</Button>
          </div>

          {(shares.data?.length ?? 0) === 0 ? (
            <p className="text-[12px] text-[var(--text-3)]">还没有分享链接。</p>
          ) : (
            <div className="flex flex-col gap-2">
              {shares.data!.map((s) => {
                const url = s.url ?? `${window.location.origin}/share/${s.token}`;
                const expired = s.expiresAt > 0 && s.expiresAt <= Date.now();
                return (
                  <div key={s.shareId} className="flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border)] px-3 py-2">
                    <span className="min-w-0 flex-1 truncate font-[var(--font-mono)] text-[12px] text-[var(--text-2)]">{url}</span>
                    {expired ? (
                      <Badge tone="warning">已过期</Badge>
                    ) : (
                      <span className="shrink-0 text-[12px] text-[var(--text-3)]">
                        {s.expiresAt === 0 ? '长期有效' : `${formatTime(s.expiresAt)} 到期`}
                      </span>
                    )}
                    <IconButton
                      name="Copy"
                      label="复制链接"
                      size={16}
                      onClick={() => void navigator.clipboard.writeText(url).then(() => toast.success('已复制'))}
                    />
                    <IconButton name="Ban" label="撤销链接" size={16} onClick={() => revoke.mutate(s.shareId)} />
                  </div>
                );
              })}
            </div>
          )}
          <p className="text-[12px] leading-[1.6] text-[var(--text-3)]">
            微信内置浏览器可直接打开分享页；导出的 HTML 是单文件自包含，可离线演示。
          </p>
        </section>
      </div>
    </Dialog>
  );
}
