import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge, Button, Icon, IconButton, Input, PanelSection, SearchField,
  SegmentedControl, Select, StatusPill, Switch, Textarea, Tooltip, useToast,
} from '@lumen/ui';
import { cn } from '@lumen/ui';
import {
  DEPTH_BRIEF, DEPTH_LABEL, NARRATION_VOICE_OPTIONS, PAGE_TYPE_LABEL, STUDIO_MODULE_LABEL,
  brandLogoDataUrl, type DeckDepth, type PageType,
} from '@lumen/ir-schema';
import { api } from '../api/client.js';
import { useStyleDoc } from '../api/hooks.js';
import { HtmlMock, useMockImages } from '../components/HtmlMock.js';
import { LayoutCardGrid, usePageLayouts } from '../components/LayoutGallery.js';
import type { OutlinePage, PageIR, StyleChoice } from '../api/types.js';
import { OutlineList } from './OutlineList.js';
import { fileToDataUrl } from './RightRail.js';
import { useWorkbench, type PlanProgress, type PlanScope } from './store.js';

/**
 * 左右两栏共用的壳：标题栏 + 滚动区 + 可选底部主操作。
 *
 * 提出来是因为**大纲那一栏在两个 tab 里都要出现**（「页面设计」在左，
 * 「大纲与教案」也在左）。两处各写一遍壳的话，边框方向、内边距、滚动行为会慢慢漂开，
 * 用户切 tab 时左栏就会跳一下——而「切 tab 时左栏不动」正是这一版要的东西。
 */
export function RailShell({
  title, icon, hint, side = 'left', footer, children,
}: {
  title: string;
  icon: string;
  hint: string;
  /** 壳在哪一侧。只影响边框画哪一边——两栏贴着不同的邻居 */
  side?: 'left' | 'right';
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <aside
      className={cn(
        'flex min-h-0 w-[300px] shrink-0 flex-col border-[var(--border-subtle)] bg-[var(--surface-0)]',
        side === 'left' ? 'border-r' : 'border-l',
      )}
    >
      <header className="flex h-11 shrink-0 items-center gap-2 px-3">
        <Icon name={icon as never} size={16} className="shrink-0 text-[var(--text-3)]" />
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text-1)]">{title}</span>
        <Tooltip content={hint}>
          <Icon name="Info" size={16} className="shrink-0 text-[var(--text-3)]" />
        </Tooltip>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto lumen-scroll px-2.5 pb-4">
        {children}
      </div>

      {footer && <div className="shrink-0 border-t border-[var(--border-subtle)] p-2.5">{footer}</div>}
    </aside>
  );
}

export function LeftRail({
  projectId, onGenerate, planning, planScope, planProgress, generating, tab, onTabChange, side = 'left',
  onRegisterSave, onGenerateLessons, onRegenerateAll, onPickLayout,
}: {
  projectId: string;
  onGenerate: () => void;
  planning: 'outline' | 'lessons' | null;
  /** 这一轮是谁点的。与教案面板同一个口径，决定下面那颗按钮转不转圈 */
  planScope: PlanScope | null;
  /** 提纲 / 教案那一轮跑到哪了，透给大纲列表顶部那条汇总 */
  planProgress: PlanProgress | null;
  generating: boolean;
  tab: string;
  onTabChange: (v: string) => void;
  /** 这一栏在哪一侧。「项目需求」里它被换到了右边 */
  side?: 'left' | 'right';
  /**
   * 需求表单把「立刻保存」注册上来，交给上层。
   *
   * 生成动作要先调它——页数、深度这些设置改了不点保存就只活在表单里，
   * 而提纲读的是服务端那一份（见 `Workbench.tsx` 里 `briefSaveRef` 的注释）。
   */
  onRegisterSave?: (fn: () => Promise<boolean>) => void;
  /**
   * 「生成整本教案」。**底部主操作在「项目需求」tab 里换成了它。**
   *
   * 原先它挂在教案面板的表头，而整本的东西是在「项目需求」这一栏里定的（页数、深度、
   * 需求都在这里），按钮却在中栏顶部——用户的原话：「所有大纲和教案的整体设计，
   * 是在右侧梳理的，所以整体的教案生成按钮放在右侧」。挪下来之后，它和决定它怎么跑的
   * 那几个输入框在同一栏里，滚动区滚到哪儿它都常驻在底下。
   */
  onGenerateLessons?: () => void;
  /**
   * 「按此风格全部重新生成」——**只在「风格」tab 显示**，语义恒等于全量重来。
   *
   * 为什么不能复用上面那颗按钮：它按状态会给三种文案（生成 / 继续生成 / 重新生成），
   * 而「继续生成」只补缺的那几页——**换风格之后这条路是错的**。已经生成好的页
   * 是按旧风格写的，不重做就和新风格混在同一本书里，表面上还看不出来。
   * 所以风格这一屏要一颗**不打折**的按钮：点了就是整本重做。
   */
  onRegenerateAll?: () => void;
  /**
   * 「功能库」那一屏挑定了一份骨架。交给上层去重排这一页——
   * 重排要拿 pageId 和服务端打交道，而这一栏只管挑。
   */
  onPickLayout?: (layoutId: string) => void;
}) {
  const pages = useWorkbench((s) => s.pages);
  const statuses = useWorkbench((s) => s.statuses);
  const hasPages = pages.some((p) => p !== null);
  /**
   * 按钮上的字要**如实**说这次会发生什么。
   *
   * 原来只要有一页存在就写「按大纲重新生成」，而它实际走的是可续跑的生成（跳过已好的页）。
   * 两个方向都会误人：用户以为要全重来而不敢点，或者点了以为全重来、其实只补了缺的几页。
   */
  const readyCount = pages.filter((p) => p !== null && p.status === 'ready').length;
  const failedCount = statuses.filter((s) => s === 'failed').length;
  const allReady = pages.length > 0 && readyCount === pages.length;
  const generateLabel = !hasPages && failedCount === 0
    ? '生成全部页面'
    : allReady ? '按大纲重新生成' : `继续生成 ${pages.length - readyCount} 页`;

  const META: Record<string, { title: string; icon: string; hint: string }> = {
    // 这一格是**需求表单**那一栏，所以标题仍是「项目需求」——它装的是这个 tab 的输入，
    // 不等于 tab 本身（tab 叫「大纲与教案」，里面还有大纲与教案两块）
    brief: { title: '项目需求', icon: 'PenLine', hint: '写清给谁看、要说明什么' },
    outline: { title: '页面设计', icon: 'LayoutTemplate', hint: '拖拽排序，双击标题改名' },
    style: { title: '风格', icon: 'Palette', hint: '决定这套 deck 的设计语言' },
    modules: { title: '功能库', icon: 'Blocks', hint: '给这一页挑一份排版骨架' },
  };
  const meta = META[tab] ?? META.brief!;

  return (
    <RailShell
      title={meta.title}
      icon={meta.icon}
      hint={meta.hint}
      side={side}
      /*
        底部主操作常驻：不管在哪个面板都能直接生成，不用先切回大纲。

        「项目需求」那一屏的主操作是**「生成整本教案」**——它管的是整本重排，
        与「生成页面」不是一回事（后者是按已经定好的大纲逐页出 HTML）。
        两种都摆出来并排容易点错，所以换掉而不是加一个：这一栏里定的页数、深度、
        需求正是决定教案怎么跑的那几样，动作摆在它们底下最顺。

        **「页面设计」那一屏没有底部按钮**：它的开始/继续搬到了这一屏顶上的状态条里
        （`PageDesignBar`）。生成页面本来就是那一屏的主角，按钮该跟进度条待在一处，
        而不是缩在左栏最底下——离它 30px 的那条汇总已经在说同一件事了，摆两遍
        只会让人犹豫该点哪个。`OutlineList` 表头那颗小图标同理，也在那一屏关掉。
      */
      footer={tab === 'brief' ? (
        <Button
          variant="primary"
          size="lg"
          pill
          className="w-full"
          icon="Wand2"
          disabled={planning !== null}
          loading={planning !== null && planScope === 'all'}
          onClick={onGenerateLessons}
        >
          生成整本教案
        </Button>
      ) : tab === 'outline' ? undefined : (
        <Button
          variant="primary"
          size="lg"
          pill
          className="w-full"
          icon="Sparkles"
          loading={generating}
          /*
            「风格」那一屏的动作**恒等于全量重来**，见上面 `onRegenerateAll` 的说明。
            剩下那一屏（功能库）维持原有语义：按状态说清这一次会发生什么。
          */
          onClick={tab === 'style' && onRegenerateAll ? onRegenerateAll : onGenerate}
        >
          {generating ? '生成中' : tab === 'style' ? '按此风格全部重新生成' : generateLabel}
        </Button>
      )}
    >
      {tab === 'brief' && (
        <BriefPanel
          projectId={projectId}
          planning={planning}
          generating={generating}
          {...(onRegisterSave ? { onRegisterSave } : {})}
        />
      )}
      {tab === 'outline' && (
        <OutlineList
          projectId={projectId}
          onGenerate={onGenerate}
          generating={generating}
          planProgress={planProgress}
          /* 开始生成由顶上的状态条管，表头不再摆第二颗（见 footer 的注释） */
          showGenerateAction={false}
          /*
            新加一页就切到「大纲与教案」——加完一页的下一步一定是写它的教案。
            当前页由 `insertOutline` 自己设好，这里只管把 tab 换过去。
          */
          onInserted={() => onTabChange('brief')}
        />
      )}
      {tab === 'style' && <StylePanel projectId={projectId} />}
      {tab === 'modules' && <ModulePanel onPick={onPickLayout} />}
    </RailShell>
  );
}

/* ---------------- 风格 ---------------- */

function StylePanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const styleId = useWorkbench((s) => s.styleId);
  /** 已经出来的页数。换风格之后它们全是旧风格写的，提示里要说清这一点 */
  const pageCount = useWorkbench((s) => s.pages.filter((p) => p !== null).length);

  const choices = useQuery({
    queryKey: ['style-suggestions'],
    queryFn: () => api.get<{ styles: StyleChoice[] }>('/projects/style-suggestions'),
  });

  const apply = useMutation({
    mutationFn: (next: string) => api.patch(`/projects/${projectId}`, { styleId: next }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['project', projectId] });
      /*
        **换风格只改项目行上的引用，画布上的页一个字都不会自己变。**
        不说清楚的话，用户点了另一套风格、看画布还是老样子，只会以为没生效。
        所以这里直接把下一步指出来：按钮就在这一栏底下。
      */
      toast.success('风格已锁定', pageCount > 0
        ? `已经生成的 ${pageCount} 页还是旧风格，点下面的「按此风格全部重新生成」重做一遍`
        : '生成时就会用这套风格');
    },
    onError: (err: Error) => toast.error('切换失败', err.message),
  });

  const styles = choices.data?.styles ?? [];
  const current = styles.find((s) => s.styleId === styleId) ?? null;

  return (
    <div className="flex flex-col gap-3 px-1 pt-1">
      <div className="flex flex-col gap-2">
        {choices.isLoading && <p className="text-[12px] text-[var(--text-3)]">正在获取风格库…</p>}
        {choices.isSuccess && styles.length === 0 && (
          <p className="text-[12px] leading-[1.6] text-[var(--text-3)]">
            风格库还是空的。先到「风格库」里识别一套，这里才会出现可选风格。
          </p>
        )}
        {styles.map((s) => (
          <StyleOption
            key={s.styleId}
            choice={s}
            current={s.styleId === styleId}
            onPick={() => apply.mutate(s.styleId)}
          />
        ))}
      </div>

      {current && (
        <div className="flex flex-col gap-2.5 rounded-[var(--radius-tile)] bg-[var(--surface-1)] p-3">
          <span className="text-[11px] text-[var(--text-3)]">当前风格色板</span>
          <div className="flex gap-1.5">
            {[current.palette.brand, current.palette.accent, current.palette.surface, current.palette.bg, current.palette.text].map((c) => (
              <span key={c} className="h-7 flex-1 rounded-[var(--radius-inner)] border border-[var(--border-subtle)]" style={{ background: c }} title={c} />
            ))}
          </div>
          <div className="flex flex-col gap-1 text-[11px] text-[var(--text-3)]">
            <span>{current.pageTypes.length} 个页类型 · {current.mockedCount} 张样机</span>
            <span>{current.theme === 'dark' ? '深色底' : '浅色底'}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 一个可选风格。
 *
 * 卡片上放一张真实的封面样机，而不是只写名字和关键词——
 * 「蔚蓝科技商务风」和「深蓝渐变商务风」在文字上差不了几个字，看一眼封面立刻分得清。
 * 样机是模型真跑出来的 HTML，走的是生成同一条链路。
 */
function StyleOption({
  choice, current, onPick,
}: { choice: StyleChoice; current: boolean; onPick: () => void }) {
  const cover = choice.previewHtml[0] ?? '';
  const images = useMockImages(choice, cover ? [cover] : [], ['cover']);

  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={current}
      className={cn(
        'group flex flex-col gap-2 rounded-[var(--radius-tile)] p-2 text-left',
        'transition-colors duration-150 ease-out',
        current ? 'bg-[var(--brand-500)]/12' : 'hover:bg-[var(--surface-1)]',
      )}
    >
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--text-1)]">{choice.name}</span>
        {current && <StatusPill tone="brand">当前</StatusPill>}
      </span>

      {cover ? (
        /*
          样机外面套 `pointer-events-none`。它是**一个 iframe**，而 iframe 上的点击
          不会冒泡到外层那个 button——卡片上最显眼、最自然下手的那一片就是它，
          于是「点卡片没反应」。骨架卡片墙（`LayoutCardGrid`）一直有这一层，这里漏了。
        */
        <span className="pointer-events-none">
          <HtmlMock doc={choice} html={cover} width={252} images={images[0]} />
        </span>
      ) : (
        <span className="h-[142px] w-full rounded-[var(--radius-inner)] bg-[var(--surface-1)]" />
      )}

      <span className="line-clamp-2 text-[11px] leading-[1.5] text-[var(--text-3)]">
        {choice.description || '这套风格还没有写介绍'}
      </span>
    </button>
  );
}

/* ---------------- 功能库 ---------------- */

/**
 * 工作台里的「功能库」这一屏：给**当前这一页**挑一份排版骨架。
 *
 * 与「风格」那一屏的分工：风格管整套 deck 的设计语言（配色、字体、质感），换一次
 * 要整本重做；这里管**这一页**的版面结构，只重排这一页，文字与讲稿都不动。
 *
 * 挑哪几个库**按当前页的类型自动定位**（`moduleOfPageType`）：人物页看人物排版、
 * 图表页看图表排版、图文页看图文排版。封面、目录、正文这些页类型本来没有专属库，
 * 就把四个库整个端出来任挑——版面由风格提示词决定，不等于不能换一种排法试试。
 *
 * 点一份**直接重排**，不设"选中再确认"两步：这和右栏那颗「换一版」是同一个动作，
 * 而这里没有弹窗底部那条地方摆确认按钮。重排会调一次模型，画布上会出现揭示层，
 * 连点两次会被服务端的生成锁挡掉（不会叠着跑两轮）。
 */
function ModulePanel({
  onPick,
}: {
  /** 挑定了。交给上层去触发这一页重排 */
  onPick?: (layoutId: string) => void;
}) {
  const toast = useToast();
  const styleId = useWorkbench((s) => s.styleId);
  const outline = useWorkbench((s) => s.outline);
  const activeIndex = useWorkbench((s) => s.activeIndex);
  const pages = useWorkbench((s) => s.pages);
  const styleDoc = useStyleDoc(styleId || null);

  const plannedType = outline[activeIndex]?.pageType ?? '';
  const written = Boolean(pages[activeIndex]?.pageId);

  const { effectiveType, moduleId, layouts, groups, images, loading } =
    usePageLayouts(plannedType, styleDoc.data, true, true);

  return (
    <div className="flex flex-col gap-3 px-1 pt-1">
      <p className="text-[12px] leading-[1.6] text-[var(--text-3)]">
        {moduleId
          ? `这一页是${PAGE_TYPE_LABEL[plannedType as PageType] ?? plannedType}，下面是${STUDIO_MODULE_LABEL[moduleId]}的骨架。`
          : `这一页的类型没有专属的功能库，下面是全部 ${Object.keys(STUDIO_MODULE_LABEL).length} 个库的骨架。`}
        点一份就按它重排这一页（调一次模型，几十秒到一分钟），文字与讲稿不动。
      </p>

      {loading && <p className="text-[12px] text-[var(--text-3)]">正在加载功能库…</p>}

      {!loading && layouts.length === 0 && (
        <p className="text-[12px] leading-[1.6] text-[var(--text-3)]">
          功能库里还没有骨架。到「功能库」那一页识别或新建几份，这里就有了。
        </p>
      )}

      {!loading && layouts.length > 0 && (
        <>
          <span className="font-[var(--font-mono)] text-[11px] tabular-nums text-[var(--text-3)]">
            共 {layouts.length} 份
          </span>
          <LayoutCardGrid
            doc={styleDoc.data}
            layouts={layouts}
            groups={groups}
            images={images}
            effectiveType={effectiveType}
            // 点即应用，不留选中态：这一屏没有确认按钮，摆一个亮着的框只会让人以为还要再点一下
            picked={null}
            onPick={(id) => {
              if (!id) return;
              if (!written) {
                toast.error('这一页还没生成', '先把它生成出来，再换排版');
                return;
              }
              onPick?.(id);
            }}
            cardWidth={250}
            gridClassName="grid-cols-1"
          />
        </>
      )}
    </div>
  );
}

/* ---------------- 需求 ---------------- */

function BriefPanel({
  projectId, planning, generating, onRegisterSave,
}: {
  projectId: string;
  planning: 'outline' | 'lessons' | null;
  generating: boolean;
  onRegisterSave?: (fn: () => Promise<boolean>) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const project = useWorkbench((s) => s.project);
  const [brief, setBrief] = useState(project?.brief ?? '');
  const [title, setTitle] = useState(project?.title ?? '');
  const [pages, setPages] = useState(project?.targetPages != null ? String(project.targetPages) : '');
  const [depth, setDepth] = useState<DeckDepth>(project?.depth ?? 'standard');
  /**
   * 讲解的三项。音色与语气**留空即跟随后台的全局设置**——服务端那边空串会存成 null，
   * 于是「没单独选过」与「选了一个空音色」是两回事，前者跟着全局走。
   */
  const [voice, setVoice] = useState(project?.narrationVoice ?? '');
  const [tone, setTone] = useState(project?.narrationTone ?? '');
  const [scriptEnabled, setScriptEnabled] = useState(project?.narrationScriptEnabled ?? true);
  const [brandBusy, setBrandBusy] = useState(false);
  /**
   * 重绘失败的**原因**，要一直留在面板上。
   *
   * 只丢给 `toast.error` 是不够的：toast 几秒后自己消失，用户回头想再看一眼「到底为什么没成」
   * 就没有了，只能凭记忆。设计文档 §五 那张表里「重绘失败」那一格写的是
   * 「原图缩略图 + **失败原因** + 重试、就用原图」——原因是要占面板一格的东西。
   */
  const [brandError, setBrandError] = useState('');
  /**
   * 品牌名与标语**各有自己的本地 state**，显示值不绕服务端来回。
   *
   * 上一版把 `value` 直接绑在 `project.brandName` 上、每次按键都 PATCH + invalidate，
   * 于是每次按键也发一次 GET；这些 GET 与 PATCH 互相重叠，**一个带着旧值的 GET 完全可能
   * 最后落地**，把用户正在打的字回退掉。实测（40ms/字打「星图科技」）输入框只剩「星技」，
   * 而且**落库的也是「星技」**——不是显示问题，刷新也回不来。
   */
  const [brandName, setBrandName] = useState(project?.brandName ?? '');
  const [brandTagline, setBrandTagline] = useState(project?.brandTagline ?? '');
  const styleId = useWorkbench((s) => s.styleId);
  const styleDoc = useStyleDoc(styleId);
  // 拿不到风格文档就退回黑色。**这通常是「还没加载完」的瞬时状态**（`useStyleDoc`
  // 是个查询），加载完会自己变对，所以不必为此在界面上加提示——加了反而是一闪而过的噪音。
  const brandColor = styleDoc.data?.palette.brand ?? '#000';
  // 用户碰过之后就不再被服务端回来的值覆盖——否则每次 invalidate 都会把他正在敲的字吞掉
  const dirtyRef = useRef(false);

  useEffect(() => {
    if (dirtyRef.current) return;
    setBrief(project?.brief ?? '');
    setTitle(project?.title ?? '');
    setPages(project?.targetPages != null ? String(project.targetPages) : '');
    setDepth(project?.depth ?? 'standard');
    setVoice(project?.narrationVoice ?? '');
    setTone(project?.narrationTone ?? '');
    setScriptEnabled(project?.narrationScriptEnabled ?? true);
  }, [
    project?.brief, project?.title, project?.targetPages, project?.depth,
    project?.narrationVoice, project?.narrationTone, project?.narrationScriptEnabled,
  ]);

  const save = useMutation({
    mutationFn: () => api.patch(`/projects/${projectId}`, {
      title,
      brief,
      depth,
      // 空表示「由内容决定」。显式送 null 而不是不送——不送的话服务端分不清
      // 「用户清空了」和「用户没改」，清空就存不下去
      targetPages: pages.trim() === '' ? null : Number(pages),
      // 同理：讲解的音色语气留空表示「跟随后台设置」，要显式送 null
      narrationVoice: voice.trim() === '' ? null : voice.trim(),
      narrationTone: tone.trim() === '' ? null : tone.trim(),
      narrationScriptEnabled: scriptEnabled,
    }),
    onSuccess: async () => {
      dirtyRef.current = false;
      await qc.invalidateQueries({ queryKey: ['project', projectId] });
    },
    onError: (err: Error) => toast.error('保存失败', err.message),
  });

  /**
   * 跑一次重绘。上传与「重试」共用——两条路只差 `imageKey` 从哪来。
   *
   * 为什么要单独抽出来：重绘失败**多半是瞬时的**（模型超时、网关抖一下），而上一版只有
   * 「换一张」能重来，它要求用户把同一个文件再选一遍。设计文档 §五 那张表里
   * 「重绘失败」那一格明写了「重试」，就是指用**同一张原图**再跑一次。
   */
  const runRedraw = async (imageKey: string) => {
    setBrandBusy(true);
    setBrandError('');
    try {
      await api.post(`/projects/${projectId}/brand/redraw`, { imageKey });
      await qc.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success('logo 已重绘');
    } catch (err) {
      await qc.invalidateQueries({ queryKey: ['project', projectId] });
      // 原因**两处都要给**：toast 是当场的反馈，state 是留在面板上的那一份
      setBrandError((err as Error).message);
      toast.error('logo 重绘失败', (err as Error).message);
    } finally {
      setBrandBusy(false);
    }
  };

  /** 上传原图 → 落对象存储 → 立刻重绘。两段都在同一个 loading 里，用户看到的是一次等待 */
  const uploadLogo = async (file: File) => {
    setBrandBusy(true);
    setBrandError('');
    let key: string;
    try {
      const dataUrl = await fileToDataUrl(file);
      ({ key } = await api.post<{ key: string }>('/uploads', { dataUrl, name: file.name, projectId }));
    } catch (err) {
      // 上传这一跳自己也会失败（图太大、格式不收、网络断了），报错要说「上传」而不是「重绘」
      setBrandBusy(false);
      setBrandError((err as Error).message);
      toast.error('logo 上传失败', (err as Error).message);
      return;
    }
    await runRedraw(key); // 它自己管 brandBusy 与报错
  };

  const setBrandMode = (mode: '' | 'redraw' | 'original') =>
    api.patch(`/projects/${projectId}`, { brandLogoMode: mode })
      .then(() => qc.invalidateQueries({ queryKey: ['project', projectId] }))
      .catch((err: Error) => toast.error('切换失败', err.message));

  const clearLogo = () =>
    api.del(`/projects/${projectId}/brand`)
      .then(() => qc.invalidateQueries({ queryKey: ['project', projectId] }))
      .catch((err: Error) => toast.error('移除失败', err.message));

  /**
   * 品牌名 / 标语：**本地立刻显示，停顿 400ms 才落库**。
   *
   * 为什么显示值必须走本地 state：上面那两个 state 的注释里记了实测——`value` 绑服务端
   * 回来的值、而每次按键都 `invalidateQueries`，一次带着旧值的 GET 就能把正在打的字回退掉。
   *
   * 为什么是 400ms 而不是 onBlur：这两个字段要的是「不用点保存」，而 onBlur 在用户打完字
   * 直接关标签页时会丢。400ms 是「打完一个词就存」的手感。
   *
   * **不要**给这两个字段设 `dirtyRef`。那个 ref 是给**没有立刻落库**的
   * brief / title / 页数 / 深度 用的（上面那个 `useEffect` 拿它挡回填）；
   * 品牌这两项每次打字都会落库，占着它有两个坏处：左栏一直显示「未保存」，
   * 以及把那个 `useEffect` 的同步一起挡掉——`dirtyRef` 是共用的，一个字段不该管另一个的。
   */
  const brandTimers = useRef<{ name?: ReturnType<typeof setTimeout>; tagline?: ReturnType<typeof setTimeout> }>({});
  const brandEditing = useRef({ name: false, tagline: false });

  const saveBrand = (which: 'name' | 'tagline', value: string) => {
    brandEditing.current[which] = true;
    const timer = brandTimers.current[which];
    if (timer) clearTimeout(timer);
    brandTimers.current[which] = setTimeout(() => {
      brandEditing.current[which] = false;
      const body = which === 'name' ? { brandName: value } : { brandTagline: value };
      void api.patch(`/projects/${projectId}`, body)
        .then(() => qc.invalidateQueries({ queryKey: ['project', projectId] }))
        .catch((err: Error) => toast.error('品牌信息保存失败', err.message));
    }, 400);
  };

  // 服务端回来的值只在「用户没在打这个字段」时回填
  useEffect(() => {
    if (!brandEditing.current.name) setBrandName(project?.brandName ?? '');
  }, [project?.brandName]);
  useEffect(() => {
    if (!brandEditing.current.tagline) setBrandTagline(project?.brandTagline ?? '');
  }, [project?.brandTagline]);

  /**
   * 把「立刻保存」交给上层。
   *
   * 页数、深度这些是**设置**：改了不点保存就只活在表单里，而提纲读的是服务端那一份。
   * 生成动作必须先把它落库，否则用户改了页数、点「生成整本教案」，出来的还是老页数。
   *
   * 用 ref 转一道是因为 `save` 这个 mutation 对象每次渲染都换新的，
   * 直接把 `save.mutateAsync` 注册上去会立刻过期。
   */
  const saveRef = useRef(save);
  useEffect(() => { saveRef.current = save; });
  useEffect(() => {
    onRegisterSave?.(() => saveRef.current.mutateAsync().then(() => true).catch(() => false));
  }, [onRegisterSave]);

  const busy = save.isPending || planning !== null || generating;
  const pageCount = Number(pages);
  const pagesInvalid = pages.trim() !== '' && (!Number.isInteger(pageCount) || pageCount < 3 || pageCount > 30);

  return (
    <div className="flex flex-col gap-3 px-1 pt-1">
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] text-[var(--text-3)]">项目标题</span>
        <Input
          value={title}
          onChange={(e) => {
            dirtyRef.current = true;
            setTitle(e.target.value);
          }}
          aria-label="项目标题"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="flex items-center justify-between text-[12px] text-[var(--text-3)]">
          <span>内容或想法</span>
          {dirtyRef.current && <span className="text-[var(--warning)]">未保存</span>}
        </span>
        <Textarea
          rows={14}
          value={brief}
          onChange={(e) => {
            dirtyRef.current = true;
            setBrief(e.target.value);
          }}
          aria-label="内容或想法"
          placeholder="粘贴已有内容，或写下你的想法。写清给谁看、要说明什么——内容越具体，提纲和教案越能用。"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] text-[var(--text-3)]">页数</span>
        <Input
          type="number"
          min={3}
          max={30}
          value={pages}
          aria-label="页数"
          placeholder="留空由内容决定"
          onChange={(e) => {
            dirtyRef.current = true;
            setPages(e.target.value);
          }}
        />
        {pagesInvalid && (
          <span className="text-[11px] text-[var(--warning)]">页数在 3 到 30 之间，或留空</span>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] text-[var(--text-3)]">深度</span>
        <SegmentedControl
          size="sm"
          value={depth}
          onChange={(v) => {
            dirtyRef.current = true;
            setDepth(v);
          }}
          options={(Object.keys(DEPTH_LABEL) as DeckDepth[]).map((d) => ({ value: d, label: DEPTH_LABEL[d] }))}
        />
        {/* 说明取自 DEPTH_BRIEF——与发给模型的提示词同源，界面上说的就是模型真被要求的 */}
        <p className="text-[11px] leading-[1.6] text-[var(--text-3)]">{DEPTH_BRIEF[depth]}</p>
      </div>

      {/*
        讲解。音色与语气**留空即跟随后台的全局设置**——所以 placeholder 写的是
        「跟随后台设置」而不是某个具体音色：这里读不到全局值（那是后台的接口），
        写死一个默认音色反而会骗人。
      */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] text-[var(--text-3)]">讲解音色</span>
        <Input
          list="project-narration-voices"
          value={voice}
          aria-label="讲解音色"
          placeholder="跟随后台设置"
          onChange={(e) => {
            dirtyRef.current = true;
            setVoice(e.target.value);
          }}
        />
        <datalist id="project-narration-voices">
          {NARRATION_VOICE_OPTIONS.map((v) => (
            <option key={v.id} value={v.id}>{v.hint}</option>
          ))}
        </datalist>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] text-[var(--text-3)]">讲解语气</span>
        <Input
          value={tone}
          aria-label="讲解语气"
          placeholder="跟随后台设置"
          onChange={(e) => {
            dirtyRef.current = true;
            setTone(e.target.value);
          }}
        />
      </div>

      <Switch
        checked={scriptEnabled}
        label="生成页面时同时生成讲稿"
        onCheckedChange={(v) => {
          dirtyRef.current = true;
          setScriptEnabled(v);
        }}
      />

      <p className="text-[11px] leading-[1.6] text-[var(--text-3)]">
        音色与语气留空即跟随后台设置。改了它们，已生成的配音会自动失效，下次播放时重新合成；
        配音不在这里自动生成——内容确认后到顶栏点「配音」。
      </p>

      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] text-[var(--text-3)]">品牌 logo（可选）</span>

        {brandBusy ? (
          <div className="flex h-[54px] animate-pulse items-center justify-center rounded-[var(--radius-inner)] border border-[var(--border)] bg-[var(--surface-1)] text-[11px] text-[var(--text-3)]">
            正在重绘…
          </div>
        ) : project?.brandLogoImage ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex h-[54px] items-center justify-center gap-3 rounded-[var(--radius-inner)] border border-[var(--border)] bg-[var(--surface-1)]">
              {/* 原图与重绘稿并排，让用户看得出模型重画成了什么样 */}
              <img src={`/files/${project.brandLogoImage}`} alt="原图"
                className="max-h-[38px] max-w-[38px] object-contain" />
              {project.brandLogoSvg && (
                <>
                  <span className="text-[10px] text-[var(--text-3)]">→</span>
                  {/*
                    重绘稿走 `brandLogoDataUrl`，**不要在这里手搓 data URL**。
                    那个函数是「补 xmlns + 烘品牌色 + 色值兜底」三件事的合集，漏掉任何一件都是
                    静默失效：缺 xmlns 整张图加载不出来，缺烘色单色稿就是黑的。
                    上一版这里就是手搓的，手搓出来的是没烘色、也没补 xmlns 的那一份——
                    面板里黑着、页面上是品牌色，两种表现不一致会被当成 bug 报上来。

                    `brandColor` 取当前风格文档的 `palette.brand`——这个组件里用
                    `useStyleDoc(styleId)`（`apps/web/src/api/hooks.ts:12`）拿，
                    `CenterCanvas` 就是这么拿到 `doc` 的（那边是 `styleDoc.data`）。
                    确实取不到就退回 `'#000'`（通常是风格文档还没加载完，加载完会自己变对）。
                  */}
                  <img src={brandLogoDataUrl(project.brandLogoSvg, brandColor)}
                    alt="重绘稿" className="max-h-[38px] max-w-[38px] object-contain" />
                </>
              )}
            </div>

            {project.brandLogoSvg ? (
              <div className="flex gap-1.5">
                <Button size="sm" variant={project.brandLogoMode === 'redraw' ? 'primary' : 'secondary'}
                  onClick={() => void setBrandMode('redraw')}>用重绘稿</Button>
                <Button size="sm" variant={project.brandLogoMode === 'original' ? 'primary' : 'secondary'}
                  onClick={() => void setBrandMode('original')}>用原图</Button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-[var(--warning)]">重绘没成，现在用的是原图</span>
                {/*
                  原因要**一直留在面板上**。只给 toast 是不够的：它几秒后自己消失，
                  用户回头想再看一眼「到底为什么没成」就没有了，只能凭记忆。
                */}
                {brandError && (
                  <span className="text-[11px] leading-[1.5] text-[var(--text-3)]">{brandError}</span>
                )}
                {/*
                  「重试」用**同一张原图**再跑一次。没有它的话用户只能「换一张」——
                  那要把同一个文件再选一遍，而且会换掉对象存储里的 key。
                  重绘失败多半是瞬时的（模型超时、网关抖一下），值得给一个一键重来。
                */}
                <Button size="sm" variant="secondary"
                  onClick={() => void runRedraw(project.brandLogoImage)}>重试</Button>
              </div>
            )}

            <div className="flex gap-1.5">
              <label className="flex-1 cursor-pointer rounded-[var(--radius-inner)] border border-[var(--border)] px-3 py-1.5 text-center text-[12px] text-[var(--text-2)] hover:bg-[var(--surface-1)]">
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); }} />
                换一张
              </label>
              <Button size="sm" variant="ghost" onClick={() => void clearLogo()}>移除</Button>
            </div>
          </div>
        ) : (
          <label className="flex h-[54px] cursor-pointer items-center justify-center rounded-[var(--radius-inner)] border border-dashed border-[var(--border)] text-[11px] text-[var(--text-3)] hover:bg-[var(--surface-1)]">
            <input type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); }} />
            点这里选图，或拖进来
          </label>
        )}

        <Input
          value={brandName}
          aria-label="品牌名"
          placeholder="品牌名（可选）"
          onChange={(e) => { setBrandName(e.target.value); saveBrand('name', e.target.value); }}
        />
        <Input
          value={brandTagline}
          aria-label="标语"
          placeholder="标语（可选）"
          onChange={(e) => { setBrandTagline(e.target.value); saveBrand('tagline', e.target.value); }}
        />
      </div>

      {/*
        **这里只有「仅保存」，没有「保存并生成」。**
        「整本重新规划」（存需求 → 出提纲 → 出教案）只有中栏顶部那一个入口，
        两个按钮做同一件事只会让人犹豫该点哪个。而中栏那个入口自己会先存需求，
        所以这一栏不点保存也不会漏掉——`onRegisterSave` 就是给它用的。
      */}
      <Button
        variant="secondary"
        pill
        icon="Save"
        className="w-full"
        loading={save.isPending && planning === null}
        disabled={busy || pagesInvalid}
        onClick={() => save.mutate()}
      >
        仅保存
      </Button>

      <PanelSection title="接下来会发生什么" defaultOpen={false}>
        <p className="text-[12px] leading-[1.7] text-[var(--text-3)]">
          改完需求点中栏的「生成整本教案」——它会先存需求，再按当前的页数与需求
          **重新规划整本**：重出一份提纲，然后逐页把教案写实。只想重写一页的教案，
          用左边那个「生成本页教案」。
          页面不在这一步出——教案定下来之后，用顶栏的「生成」或中栏的「生成本页页面」。
        </p>
      </PanelSection>
    </div>
  );
}
