import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, CardBody, Field, Input, Table, Td, Th, useToast } from '@lumen/ui';
import { PAGE_TYPE_LABEL, PAGE_TYPE_ORDER, buildPageDocument, fontStacksOf, type FontStacks, type StylePalette } from '@lumen/ir-schema';
import { stockImagesFor, stockPaletteOf } from '@lumen/stock-library';
import { api } from '../api/client.js';
import { formatTime, type AdminStylesResult } from '../api/types.js';
import { AdminPage, LoadError } from '../components/AdminPage.js';

/**
 * 风格库审核。
 *
 * 一套风格 = 九个页类型各一条 HTML 生成提示词，外加每个页类型的一张样机。
 * 审核通过表示这套风格已经过人工确认，可以对外推荐给用户。
 *
 * **样机必须真的渲染出来**：配色对不对、版式是不是这套风格该有的样子，
 * 光看名字和色值块判断不了。样机走的是与工作台、导出完全相同的那一份装配
 * （`buildPageDocument`），所以这里看到的和用户拿到的必然一致。
 */

const PAGE_SIZE = 20;

/** 卡片上放几张样机。三张足够看出这套风格的调子 */
const PREVIEW_COUNT = 3;
/** 样机缩略图宽度，按 1920 的画布等比缩放 */
const THUMB_WIDTH = 232;
const THUMB_HEIGHT = Math.round(THUMB_WIDTH * (1080 / 1920));

export function StylesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(0);
  const [previewId, setPreviewId] = useState<string | null>(null);

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    p.set('limit', String(PAGE_SIZE));
    p.set('offset', String(page * PAGE_SIZE));
    return p.toString();
  }, [q, page]);

  const styles = useQuery({
    queryKey: ['admin', 'styles', query],
    queryFn: () => api.get<AdminStylesResult>(`/admin/styles?${query}`),
  });

  const review = useMutation({
    mutationFn: ({ styleId, reviewed }: { styleId: string; reviewed: boolean }) =>
      api.post(`/admin/styles/${encodeURIComponent(styleId)}/review`, { reviewed }),
    onSuccess: () => {
      toast.success('审核状态已更新');
      void qc.invalidateQueries({ queryKey: ['admin', 'styles'] });
    },
    onError: (err: Error) => toast.error('操作失败', err.message),
  });

  const items = styles.data?.items ?? [];
  const total = styles.data?.total ?? 0;
  const maxPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);
  const previewing = items.find((s) => s.styleId === previewId) ?? null;

  return (
    <AdminPage
      title="风格库审核"
      description="一套风格包含九个页类型各自的 HTML 生成提示词与样机。审核通过表示该风格已人工确认，可以对外推荐。"
      actions={<Badge tone="brand">已审核 {items.filter((s) => s.reviewed).length} / 本页 {items.length}</Badge>}
    >
      <div className="flex flex-col gap-4">
        <Card>
          <CardBody className="flex items-end gap-3">
            <div className="min-w-[240px] flex-1">
              <Field label="搜索" htmlFor="style-q">
                <Input
                  id="style-q"
                  value={q}
                  placeholder="按风格名或 styleId 搜索"
                  onChange={(e) => { setQ(e.target.value); setPage(0); }}
                />
              </Field>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardBody className="p-0">
            {styles.isError ? (
              <div className="p-5"><LoadError message="风格列表读取失败" onRetry={() => void styles.refetch()} /></div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>风格</Th>
                    <Th>配色</Th>
                    <Th>覆盖页型</Th>
                    <Th>样机</Th>
                    <Th>来源</Th>
                    <Th>审核</Th>
                    <Th>操作</Th>
                  </tr>
                </thead>
                <tbody>
                  {styles.isLoading ? (
                    <tr><Td className="text-[var(--text-3)]">加载中</Td><Td /><Td /><Td /><Td /><Td /><Td /></tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <Td className="text-[var(--text-3)]">风格库还是空的。到工作台里识别一套风格，这里就会出现待审核的条目。</Td>
                      <Td /><Td /><Td /><Td /><Td /><Td />
                    </tr>
                  ) : (
                    items.map((s) => (
                      <tr key={s.styleId}>
                        <Td>
                          <div className="flex flex-col gap-0.5 whitespace-nowrap">
                            <span className="font-medium text-[var(--text-1)]">{s.name}</span>
                            <span className="font-[var(--font-mono)] text-[12px] text-[var(--text-3)]">{s.styleId}</span>
                          </div>
                        </Td>
                        <Td><PaletteSwatches palette={s.palette} /></Td>
                        <Td className="whitespace-nowrap">
                          <Badge tone={s.pageTypes.length === PAGE_TYPE_ORDER.length ? 'success' : 'warning'}>
                            {s.pageTypes.length} / {PAGE_TYPE_ORDER.length} 页型
                          </Badge>
                        </Td>
                        <Td className="whitespace-nowrap">
                          {s.previewHtml.length > 0 ? (
                            <Button size="sm" variant="ghost" onClick={() => setPreviewId(s.styleId)}>
                              看样机（{s.mockedCount}）
                            </Button>
                          ) : (
                            <span className="text-[12px] text-[var(--text-3)]">还没有</span>
                          )}
                        </Td>
                        <Td>
                          <Badge tone={s.builtin ? 'neutral' : 'brand'}>{s.builtin ? '内置' : '自定义'}</Badge>
                        </Td>
                        <Td>
                          <Badge tone={s.reviewed ? 'success' : 'warning'}>{s.reviewed ? '已审核' : '待审核'}</Badge>
                        </Td>
                        <Td>
                          <Button
                            size="sm"
                            variant="ghost"
                            loading={review.isPending}
                            onClick={() => review.mutate({ styleId: s.styleId, reviewed: !s.reviewed })}
                          >
                            {s.reviewed ? '撤销审核' : '通过审核'}
                          </Button>
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
            共 {total} 条，第 {page + 1} / {maxPage + 1} 页
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

      {previewing && (
        <MockupPanel
          name={previewing.name}
          description={previewing.description}
          palette={previewing.palette}
          fonts={fontStacksOf(previewing)}
          theme={previewing.theme}
          pageTypes={previewing.pageTypes}
          mockups={previewing.previewHtml}
          mockedCount={previewing.mockedCount}
          updatedAt={previewing.updatedAt}
          onClose={() => setPreviewId(null)}
        />
      )}
    </AdminPage>
  );
}

/** 七个色值排成一排。这是判断「调子对不对」最快的一眼 */
function PaletteSwatches({ palette }: { palette: StylePalette }) {
  const entries = Object.entries(palette) as [keyof StylePalette, string][];
  return (
    <div className="flex items-center gap-1">
      {entries.map(([key, color]) => (
        <span
          key={key}
          title={`${key} ${color}`}
          className="h-5 w-5 rounded-[4px] border border-[var(--border)]"
          style={{ background: color }}
        />
      ))}
    </div>
  );
}

/**
 * 样机面板。
 *
 * 每张样机是一个 1920×1080 的 iframe，靠 `transform: scale()` 缩到缩略图大小——
 * 与工作台、导出用的是同一条路径，所以这里看到的就是用户会拿到的。
 */
function MockupPanel(props: {
  name: string;
  description: string;
  palette: StylePalette;
  fonts: FontStacks;
  theme: 'light' | 'dark';
  pageTypes: string[];
  mockups: string[];
  mockedCount: number;
  updatedAt: number;
  onClose: () => void;
}) {
  const missing = PAGE_TYPE_ORDER.filter((t) => !props.pageTypes.includes(t));
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
      onClick={props.onClose}
    >
      <div
        className="max-h-full w-full max-w-[1100px] overflow-auto rounded-[var(--radius-card)] bg-[var(--surface-0)] p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-[16px] font-medium text-[var(--text-1)]">{props.name}</div>
            {props.description && (
              <div className="mt-1 max-w-[760px] text-[12px] text-[var(--text-2)]">{props.description}</div>
            )}
            <div className="mt-1 text-[12px] text-[var(--text-3)]">
              共 {props.mockedCount} 张样机，这里显示前 {props.mockups.length} 张；更新于 {formatTime(props.updatedAt)}
              {missing.length > 0 && `；还缺 ${missing.map((t) => PAGE_TYPE_LABEL[t]).join('、')}`}
            </div>
          </div>
          <Button size="sm" variant="ghost" onClick={props.onClose}>关闭</Button>
        </div>

        <div className="flex flex-wrap gap-3">
          {props.mockups.map((html, i) => (
            <MockThumb key={i} html={html} palette={props.palette} fonts={props.fonts} theme={props.theme} />
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {PAGE_TYPE_ORDER.map((t) => (
            <Badge key={t} tone={props.pageTypes.includes(t) ? 'success' : 'neutral'}>
              {PAGE_TYPE_LABEL[t]}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}

function MockThumb({ html, palette, fonts, theme }: {
  html: string;
  palette: StylePalette;
  fonts: FontStacks;
  theme: 'light' | 'dark';
}) {
  const srcDoc = useMemo(() => {
    // 与工作台、导出走同一条装配：图位在这里配图，配色与字体栈也一致
    const images = stockImagesFor(html, stockPaletteOf(palette, theme === 'dark'));
    return buildPageDocument(html, { palette, ...fonts, images });
  }, [html, palette, fonts, theme]);
  return (
    <div
      className="overflow-hidden rounded-[8px] border border-[var(--border)]"
      style={{ width: THUMB_WIDTH, height: THUMB_HEIGHT }}
    >
      <iframe
        title="样机"
        sandbox="allow-same-origin"
        srcDoc={srcDoc}
        scrolling="no"
        style={{
          width: 1920,
          height: 1080,
          border: 0,
          transform: `scale(${THUMB_WIDTH / 1920})`,
          transformOrigin: 'top left',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
