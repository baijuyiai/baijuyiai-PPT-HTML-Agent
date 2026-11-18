import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge, Button, Card, ConfirmDialog, Dialog, DropdownMenu, EmptyState, Field, Icon, IconButton,
  Input, PageLoader, Select, Textarea, useToast, type IconName,
} from '@lumen/ui';
import { api } from '../api/client.js';
import { useSession } from '../stores/session.js';
import { hasChanged, seenAt } from '../workbench/seen.js';
import { HtmlMock, useMockImages } from '../components/HtmlMock.js';
import { ProjectCover } from '../components/ProjectCover.js';
import {
  AUDIENCE_OPTIONS, SCENE_OPTIONS, STATUS_LABEL, relativeTime,
  type ProjectSummary, type StyleChoice,
} from '../api/types.js';

const STATUS_TONE = {
  draft: 'neutral',
  generating: 'brand',
  completed: 'success',
  failed: 'error',
} as const;

export function ProjectsPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  /** 等着确认删除的那一个。非空即弹确认框 */
  const [pendingDelete, setPendingDelete] = useState<ProjectSummary | null>(null);

  const list = useQuery({
    queryKey: ['projects', query, status],
    queryFn: () => api.get<{ items: ProjectSummary[]; total: number }>(
      `/projects?${new URLSearchParams({
        ...(query ? { q: query } : {}),
        ...(status ? { status } : {}),
      }).toString()}`,
    ),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del<{ deleted: boolean }>(`/projects/${id}`),
    onSuccess: async () => {
      setPendingDelete(null);
      await qc.invalidateQueries({ queryKey: ['projects'] });
      toast.success('项目已删除');
    },
    // 失败时**不关确认框**：关掉的话用户只看到一句报错，却不知道是哪一个项目没删掉，
    // 也失去了重试的入口
    onError: (err: Error) => toast.error('删除失败', err.message),
  });

  const openNew = params.get('new') === '1';
  const setOpenNew = (v: boolean) => {
    const next = new URLSearchParams(params);
    if (v) next.set('new', '1');
    else next.delete('new');
    setParams(next, { replace: true });
  };

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-8 py-8">
      <header className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[26px] font-semibold tracking-tight text-[var(--text-1)]">项目库</h1>
          <p className="text-[13px] text-[var(--text-3)]">
            共 {list.data?.total ?? 0} 个项目。生成任务在后台运行，离开页面不会中断。
          </p>
        </div>
        <Button variant="primary" icon="Plus" onClick={() => setOpenNew(true)}>
          新建项目
        </Button>
      </header>

      <div className="flex items-center gap-3">
        <div className="relative w-[320px]">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]">
            <Icon name="Search" size={16} />
          </span>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索项目标题"
            className="pl-9"
            aria-label="搜索项目"
          />
        </div>
        <Select
          ariaLabel="按状态筛选"
          value={status || 'all'}
          onValueChange={(v) => setStatus(v === 'all' ? '' : v)}
          className="w-[160px]"
          options={[
            { value: 'all', label: '全部状态' },
            { value: 'draft', label: '草稿' },
            { value: 'generating', label: '生成中' },
            { value: 'completed', label: '已完成' },
            { value: 'failed', label: '失败' },
          ]}
        />
      </div>

      {list.isLoading ? (
        <div className="py-20"><PageLoader label="正在加载项目" /></div>
      ) : (list.data?.items.length ?? 0) === 0 ? (
        <Card>
          <EmptyState
            icon="FolderKanban"
            title={query || status ? '没有匹配的项目' : '还没有项目'}
            description={query || status ? '换个关键词或清空筛选试试。' : '新建一个项目，输入你的想法或已有内容，即可逐页生成演示。'}
            action={<Button variant="primary" icon="Plus" onClick={() => setOpenNew(true)}>新建项目</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.data!.items.map((p) => (
            <ProjectCard
              key={p.projectId}
              project={p}
              onOpen={() => navigate(`/projects/${p.projectId}`)}
              onDelete={() => setPendingDelete(p)}
            />
          ))}
        </div>
      )}

      <NewProjectDialog open={openNew} onOpenChange={setOpenNew} />

      <ConfirmDialog
        open={pendingDelete !== null}
        onOpenChange={(v) => { if (!v) setPendingDelete(null); }}
        title={`删除「${pendingDelete?.title ?? ''}」？`}
        description="这个项目的页面、导出记录与分享链接会一并清掉，删了不能恢复。"
        confirmText="删除"
        danger
        loading={remove.isPending}
        onConfirm={() => { if (pendingDelete) remove.mutate(pendingDelete.projectId); }}
      />
    </div>
  );
}

function ProjectCard({
  project, onOpen, onDelete,
}: { project: ProjectSummary; onOpen: () => void; onDelete: () => void }) {
  const ratio = project.totalPages > 0 ? project.readyPages / project.totalPages : 0;
  // 「有新变更」按 userId 分开记，所以这里要知道当前是谁
  const userId = useSession((s) => s.user?.userId ?? '');
  const changed = userId !== '' && hasChanged(project.updatedAt, seenAt(userId, project.projectId));
  return (
    <Card className="group flex flex-col overflow-hidden transition-shadow duration-150 ease-out hover:shadow-[var(--shadow-md)]">
      <ProjectCover project={project} onOpen={onOpen} />

      <div className="flex flex-1 flex-col gap-3 border-t border-[var(--border)] p-4">
        <div className="flex items-start justify-between gap-3">
          <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-medium text-[var(--text-1)]">{project.title}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-[var(--text-3)]">
              <span>{relativeTime(project.updatedAt)}更新</span>
              {/*
                「有新变更」放在这一行，不新造一处视觉语言——这一行本来就是讲时间与新鲜度的。
                判据是 `updatedAt > 上次打开时间`；从没打开过的不标（见 seen.ts 的 hasChanged）
              */}
              {changed && <Badge tone="brand">有新变更</Badge>}
            </p>
          </button>
          <div className="flex shrink-0 items-center gap-1">
            <Badge tone={STATUS_TONE[project.status]}>{project.progressText}</Badge>
            {/* 删除入口常驻可见而不是悬停才出现：藏起来的入口等于没有入口 */}
            <DropdownMenu
              trigger={
                <IconButton
                  name="MoreHorizontal"
                  label={`项目操作：${project.title}`}
                  size={16}
                  className="h-7 w-7"
                />
              }
              items={[{ label: '删除项目', icon: 'Trash2', danger: true, onSelect: onDelete }]}
            />
          </div>
        </div>

        {project.status === 'generating' && (
          <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--surface-1)]">
            <div className="h-full rounded-full bg-[var(--brand-600)] transition-[width] duration-200 ease-out" style={{ width: `${Math.round(ratio * 100)}%` }} />
          </div>
        )}

        <div className="mt-auto flex items-center gap-3 text-[12px] text-[var(--text-3)]">
          <span className="flex items-center gap-1.5"><Icon name="Layers" size={16} />{project.totalPages} 页</span>
          {project.avatarEnabled && <span className="flex items-center gap-1.5"><Icon name="UserRound" size={16} />数字人</span>}
          {project.shareCount ? <span className="flex items-center gap-1.5"><Icon name="Share2" size={16} />{project.shareCount}</span> : null}
        </div>
      </div>
    </Card>
  );
}

function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const [title, setTitle] = useState('');
  const [brief, setBrief] = useState('');
  const [scene, setScene] = useState('general');
  const [audience, setAudience] = useState('general');
  const [styleId, setStyleId] = useState('');
  /** 预计页数。默认 9——一页不填就出提纲的话，用户拿到的页数全凭内容多长 */
  const [pages, setPages] = useState('9');

  const suggestions = useQuery({
    queryKey: ['style-suggestions'],
    queryFn: () => api.get<{ styles: StyleChoice[] }>('/projects/style-suggestions'),
    enabled: open,
  });

  // 推荐结果变化时自动选中首选风格，用户仍可手动改
  useEffect(() => {
    const first = suggestions.data?.styles[0];
    if (first && !styleId) setStyleId(first.styleId);
  }, [suggestions.data, styleId]);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setBrief('');
      setStyleId('');
      setPages('9');
    }
  }, [open]);

  const pageCount = Number(pages);
  const pagesInvalid = pages.trim() !== '' && (!Number.isInteger(pageCount) || pageCount < 3 || pageCount > 30);

  const create = useMutation({
    mutationFn: () => api.post<ProjectSummary>('/projects', {
      title,
      brief,
      scene,
      audienceTag: audience,
      // 空串发 null 而不是不发：服务端那边 `undefined` 与 `null` 都落到「由内容决定」，
      // 但显式发一个，读日志时看得出用户到底填没填
      targetPages: pages.trim() === '' ? null : pageCount,
    }),
    onSuccess: async (project) => {
      if (styleId) await api.patch(`/projects/${project.projectId}`, { styleId });
      await qc.invalidateQueries({ queryKey: ['projects'] });
      toast.success('项目已创建', '接下来确认大纲，然后逐页生成');
      onOpenChange(false);
      navigate(`/projects/${project.projectId}`);
    },
    onError: (err: Error) => toast.error('创建失败', err.message),
  });

  const canSubmit = title.trim().length > 0 && !pagesInvalid && !create.isPending;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="新建项目"
      description="填入标题与内容，再挑一套风格。内容越完整，生成质量越高。"
      width={620}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="primary" loading={create.isPending} disabled={!canSubmit} onClick={() => create.mutate()}>
            创建并进入
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="项目标题" required htmlFor="np-title">
          <Input
            id="np-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="例如：2026 年度产品战略汇报"
          />
        </Field>

        <Field
          label="内容或想法"
          htmlFor="np-brief"
          hint="可以是完整内容、只有大纲，或一句话想法。系统会自动识别并选择合适的处理路径。"
        >
          <Textarea
            id="np-brief"
            rows={9}
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder={'1. 市场现状\n过去三年，市场增长了 210%……\n\n2. 核心痛点\n- 风格一次性\n- 返工成本高\n\n3. 我们的方案\n……'}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="使用场景" htmlFor="np-scene">
            <Select
              ariaLabel="使用场景"
              value={scene}
              onValueChange={setScene}
              options={SCENE_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
            />
          </Field>
          <Field label="目标人群" htmlFor="np-audience">
            <Select
              ariaLabel="目标人群"
              value={audience}
              onValueChange={setAudience}
              options={AUDIENCE_OPTIONS.map((s) => ({ value: s.value, label: s.label }))}
            />
          </Field>
        </div>

        {/*
          页数单独占一行、只给半栏宽——它是一个数字，拉满整行会显得比上面两个下拉还重。
          区间与措辞都跟工作台左栏那一份对齐（3–30、留空由内容决定），
          两处说法不一致的话，用户会以为其中一个填错了。
        */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="预计页数" htmlFor="np-pages" hint="留空由内容决定">
            <Input
              id="np-pages"
              type="number"
              min={3}
              max={30}
              value={pages}
              onChange={(e) => setPages(e.target.value)}
            />
            {pagesInvalid && (
              <span className="text-[11px] text-[var(--warning)]">页数在 3 到 30 之间，或留空</span>
            )}
          </Field>
        </div>

        <Field label="风格" hint="来自风格库。创建后仍可在工作台里更换">
          <div className="flex flex-col gap-2">
            {suggestions.isLoading && <p className="text-[13px] text-[var(--text-3)]">正在获取风格库…</p>}
            {suggestions.isSuccess && (suggestions.data.styles.length === 0) && (
              <p className="text-[13px] text-[var(--text-3)]">风格库还是空的，先到「风格库」里识别一套。</p>
            )}
            {(suggestions.data?.styles ?? []).map((s) => (
              <StyleChoiceCard
                key={s.styleId}
                choice={s}
                selected={styleId === s.styleId}
                onPick={() => setStyleId(s.styleId)}
              />
            ))}
          </div>
        </Field>
      </div>
    </Dialog>
  );
}

export const PROJECT_ICON: IconName = 'FolderKanban';

/**
 * 新建弹窗里的一张风格卡。
 *
 * 放封面样机而不是只写名字与描述：「蔚蓝科技商务风」和「深蓝渐变商务风」在文字上
 * 差不了几个字，看一眼封面立刻分得清。样机是模型真跑出来的 HTML，走的是生成同一条链路。
 *
 * 单独成一个组件是因为 `useMockImages` 是 hook，不能在 `.map` 里调。
 */
function StyleChoiceCard({
  choice, selected, onPick,
}: { choice: StyleChoice; selected: boolean; onPick: () => void }) {
  const cover = choice.previewHtml[0] ?? '';
  const images = useMockImages(choice, cover ? [cover] : [], ['cover']);

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={`flex items-start gap-3 rounded-[var(--radius-control)] border p-3 text-left transition-colors duration-150 ease-out ${
        selected
          ? 'border-[var(--brand-600)] bg-[var(--brand-100)]'
          : 'border-[var(--border)] hover:bg-[var(--surface-1)]'
      }`}
    >
      <span className="mt-0.5 shrink-0">
        <Icon name={selected ? 'CircleCheck' : 'Circle'} size={16} />
      </span>

      {cover ? (
        <HtmlMock doc={choice} html={cover} width={132} images={images[0]} />
      ) : (
        <span className="h-[74px] w-[132px] shrink-0 rounded-[var(--radius-inner)] border border-dashed border-[var(--border)]" />
      )}

      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className="text-[13px] font-medium text-[var(--text-1)]">{choice.name}</span>
          {choice.mockedCount === 0 && <Badge tone="neutral">无样机</Badge>}
        </span>
        <span className="line-clamp-2 text-[12px] leading-[1.5] text-[var(--text-3)]">
          {choice.description || '这套风格还没有写介绍'}
        </span>
        <span className="text-[11px] text-[var(--text-4)]">
          {choice.pageTypes.length} 个页类型 · {choice.theme === 'dark' ? '深色' : '浅色'}
        </span>
      </span>
    </button>
  );
}
