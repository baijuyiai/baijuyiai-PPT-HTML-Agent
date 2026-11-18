import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Drawer, EmptyState, Icon, Input, PageLoader, Select, cn, useToast } from '@lumen/ui';
import {
  FONT_CHOICES, PAGE_TYPE_LABEL, PAGE_TYPE_ORDER, SPEC_FONT_ROLES, fontRoleLabel,
  missingPageTypes, specLines, UNIFY_STEPS,
  type FillMissingStep, type PageType, type ProgressPayload, type SpecDeviation, type SpecFontRole,
  type StyleDoc, type StyleDocSummary, type StyleSpec, type UnifyStep,
} from '@lumen/ir-schema';
import { resolveMotion } from '@lumen/motion';
import { ApiFailure, api, streamSse } from '../api/client.js';
import { FlipStage } from '../components/FlipStage.js';
import { HtmlMock, useMockImages } from '../components/HtmlMock.js';
import { RecognizeDocDialog } from '../components/RecognizeDocDialog.js';
import { StepList } from '../components/StepList.js';
import { PageEditPanel } from '../components/PageEditPanel.js';

/**
 * 风格库。
 *
 * 一套风格是「每个页类型一条 HTML 生成提示词 + 它真跑出来的样机」，
 * 所以卡片上直接显示样机——那是真实产物，不是另画的示意图。
 *
 * **支持 `?style=<id>&page=<页类型>` 直接落进来**：功能库页与工作台的
 * 「看这个页类型的样机」都靠它一步跳到对应风格的那一页，不用先到列表再自己找。
 */

export function StyleLibraryPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [recognizeOpen, setRecognizeOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(params.get('style'));

  const list = useQuery({
    queryKey: ['style-docs', q],
    queryFn: () => api.get<{ items: StyleDocSummary[]; total: number }>(
      `/styles/docs?${new URLSearchParams(q ? { q } : {}).toString()}`,
    ),
  });

  const items = list.data?.items ?? [];

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-8 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[26px] font-semibold tracking-tight text-[var(--text-1)]">风格库</h1>
          <p className="max-w-[640px] text-[13px] leading-[1.7] text-[var(--text-3)]">
            一套风格是每种页类型各一条 HTML 生成提示词，以及它跑出来的样机。
            用这套风格生成页面时，把提示词和该页内容一起发给模型，产出就是 HTML。
          </p>
        </div>
        <Button variant="primary" pill icon="Wand2" onClick={() => setRecognizeOpen(true)}>识别风格并新建</Button>
      </header>

      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-[var(--text-3)]">共 {items.length} 套</span>
        <div className="w-[220px]">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索风格名称" aria-label="搜索风格" />
        </div>
      </div>

      {list.isLoading ? (
        <div className="py-20"><PageLoader label="正在加载风格库" /></div>
      ) : items.length === 0 ? (
        <Card>
          <EmptyState
            icon="Palette"
            title={q ? '没有匹配的风格' : '风格库还是空的'}
            description={q
              ? '换个关键词看看。'
              : '上传一张设计稿，模型会为每个页类型写一条 HTML 生成提示词，并真跑出样机。'}
            action={<Button variant="primary" pill icon="Wand2" onClick={() => setRecognizeOpen(true)}>识别风格并新建</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {items.map((s) => (
            <StyleDocCard key={s.styleId} style={s} onOpen={() => setSelected(s.styleId)} onEdit={() => setSelected(s.styleId)} />
          ))}
        </div>
      )}

      <StyleDocDrawer
        styleId={selected}
        focusPage={params.get('page')}
        onClose={() => {
          setSelected(null);
          // 参数一并清掉：留着的话刷新一次，抽屉又自己弹回来
          setParams({}, { replace: true });
        }}
      />
      <RecognizeDocDialog
        open={recognizeOpen}
        onOpenChange={setRecognizeOpen}
        onSaved={() => { void qc.invalidateQueries({ queryKey: ['style-docs'] }); }}
      />
    </div>
  );
}

/**
 * 409 拒绝时服务端给的原因（响应体 `{ok:true,data:{deleted:false,reason}}` 里的那句话）。
 *
 * 删风格被项目占用是**有意拒绝、不是故障**，而原因只在这个 payload 里
 * （`client.ts` 特意把它装进 `ApiFailure.payload`）。不取它的话界面上只剩
 * 「请求失败（HTTP 409）」，用户既不知道被谁占着、也不知道下一步该做什么。
 */
function deleteRefusalReason(err: unknown): string | null {
  const payload = err instanceof ApiFailure ? err.payload : null;
  const reason = payload && typeof payload === 'object' && 'reason' in payload
    ? (payload as { reason?: unknown }).reason
    : null;
  return typeof reason === 'string' && reason.trim().length > 0 ? reason : null;
}

function StyleDocCard({ style, onOpen, onEdit }: { style: StyleDocSummary; onOpen: () => void; onEdit: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [confirming, setConfirming] = useState(false);

  const remove = useMutation({
    mutationFn: () => api.del<{ deleted: boolean; reason: string }>(
      `/styles/docs/${encodeURIComponent(style.styleId)}`,
    ),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['style-docs'] });
      toast.success('已删除', style.name);
      setConfirming(false);
    },
    // 还被项目引用时服务端会拒绝，把原因照实转达
    onError: (err: Error) => {
      setConfirming(false);
      toast.error('删不掉这套风格', deleteRefusalReason(err) ?? err.message);
    },
  });

  // 卡片上这几张缩略图是一组，配图要一起分——各挑各的会让它们撞成同一张画面
  const previewImages = useMockImages(style, style.previewHtml);

  return (
    <Card className="flex flex-col overflow-hidden">
      <button
        type="button"
        onClick={onOpen}
        className="flex flex-col gap-3 p-4 text-left transition-colors duration-150 ease-out hover:bg-[var(--surface-1)]"
        aria-label={`查看风格 ${style.name}`}
      >
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px] font-semibold text-[var(--text-1)]">{style.name}</span>
          <div className="flex items-center gap-1.5">
            <Badge tone="neutral">{style.theme === 'dark' ? '深色' : '浅色'}</Badge>
            {!style.reviewed && <Badge tone="warning">待审核</Badge>}
          </div>
        </div>

        {/* 样机条：直接渲染模型产出的 HTML，所见即所得 */}
        <div className="flex gap-2">
          {style.previewHtml.length > 0 ? (
            style.previewHtml.map((html, i) => (
              <HtmlMock key={i} doc={style} html={html} width={116} images={previewImages[i]} />
            ))
          ) : (
            CARD_PLACEHOLDERS
          )}
        </div>

        <p className="line-clamp-2 text-[13px] leading-[1.6] text-[var(--text-3)]">{style.description}</p>

        <div className="flex items-center gap-3 text-[12px] text-[var(--text-3)]">
          <span className="flex items-center gap-1.5">
            <Icon name="LayoutTemplate" size={16} />
            {style.pageTypes.length} 类页面 · {style.mockedCount} 张样机
          </span>
          <div className="ml-auto flex items-center gap-1">
            {Object.values(style.palette).slice(0, 6).map((c, i) => (
              <span key={`${i}-${c}`} title={c} className="h-3.5 w-3.5 rounded-full border border-[var(--border-subtle)]" style={{ background: c }} />
            ))}
          </div>
        </div>
      </button>

      <div className="mt-auto flex items-center justify-end gap-2 border-t border-[var(--border-subtle)] px-4 py-2.5">
        {confirming ? (
          <>
            <span className="mr-auto text-[12px] text-[var(--text-3)]">删除后无法恢复</span>
            <Button pill size="sm" variant="ghost" onClick={() => setConfirming(false)}>取消</Button>
            <Button pill size="sm" variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>确认删除</Button>
          </>
        ) : (
          <>
            <Button pill size="sm" variant="ghost" icon="Pencil" onClick={onEdit}>编辑</Button>
            <Button pill size="sm" variant="ghost" icon="Trash2" onClick={() => setConfirming(true)}>删除</Button>
          </>
        )}
      </div>
    </Card>
  );
}

const CARD_PLACEHOLDERS = [0, 1, 2].map((i) => (
  <div key={i} className="h-[65px] w-[116px] rounded-[var(--radius-inner)] bg-[var(--surface-1)]" />
));

/** 补齐只有两步：推导缺的提示词、给每条出样机。顺序即实际执行顺序，阶段名对着服务端卡住 */
const FILL_STEPS = [
  { key: 'derive', label: '推导缺的提示词' },
  { key: 'mock', label: '生成样机' },
] as const satisfies readonly { key: FillMissingStep; label: string }[];

/** 服务端 SSE 发来的进度负载，形状取自共用契约，不在这里另写一份 */
type FillProgress = ProgressPayload<FillMissingStep>;

/** 统一风格的四步。顺序即实际执行顺序，阶段名对着服务端的 `UNIFY_STEPS` 卡住 */
const UNIFY_STEPS_UI = [
  { key: 'spec', label: '提炼视觉规范' },
  { key: 'rewrite', label: '改写各页提示词' },
  { key: 'mock', label: '重出样机' },
  { key: 'check', label: '比对规范与样机' },
] as const satisfies readonly { key: UnifyStep; label: string }[];

/** 「未指定」在 Select 里的哨兵值。Radix 不收空串当选项值，只能拿一个字符串顶替 */
const NO_FONT = '__none__';

/**
 * 四个字体角色的选择器。
 *
 * **改这里不重跑统一**：角色在页面里走 `--font-sans` / `--font-display` / `--font-script` /
 * `--font-numeric` 四个 CSS 变量，换一次全篇每一页同时跟着变——这就是「一键切换、
 * 全风格统一」。重跑一轮统一要十来分钟、还会跳过手改过的页，为换个字体付这个代价没有道理。
 *
 * 清单只列 `FONT_CHOICES`：**不外链**。导出件要自包含，链一个 Google Fonts
 * 在客户机器上打不开就退回系统字体，字形全变。
 */
function SpecFontPicker({ spec, pending, onPick }: {
  spec: StyleSpec;
  pending: boolean;
  onPick: (patch: Partial<Record<SpecFontRole, string>>) => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-[12px] font-medium text-[var(--text-2)]">字体</span>
        <span className="text-[11px] text-[var(--text-3)]">
          换一次全篇生效，不用重跑统一。提示词里写的是变量名，所以一个字都不用改。
        </span>
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {SPEC_FONT_ROLES.map((role) => {
          const current = spec.fonts[role];
          return (
            <label key={role} className="flex items-center gap-2">
              <span className="w-14 shrink-0 text-[12px] text-[var(--text-3)]">{fontRoleLabel(role)}</span>
              <Select
                ariaLabel={`${fontRoleLabel(role)}用哪套字体`}
                disabled={pending}
                value={current || NO_FONT}
                onValueChange={(v) => onPick({ [role]: v === NO_FONT ? '' : v })}
                options={[
                  /*
                    「未指定」**常驻**，不是只在当前为空时才给。
                    Radix 的 value 必须能在选项里找到，所以它确实只在空值时能显示出来；
                    但把它一直摆在清单里，用户选了一个字体之后还能退回去——否则
                    「跟风格原样」就是一个只能离开、回不去的状态。
                  */
                  { value: NO_FONT, label: '未指定（跟风格原样）' },
                  ...FONT_CHOICES.map((f) => ({
                    value: f.id,
                    label: f.label,
                    ...(f.hasCjk ? {} : { description: '中文回落系统字体' }),
                  })),
                ]}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** 详情：各页类型的提示词与样机 */
function StyleDocDrawer({ styleId, focusPage, onClose }: {
  styleId: string | null;
  /** URL 带上来的页类型。有它就打开「逐页看」并停在这一页 */
  focusPage?: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const [openPrompt, setOpenPrompt] = useState<PageType | null>(null);
  /** 正在编辑的页类型。非 null 时整个 Drawer 换成编辑视图，而不是再叠一层弹框 */
  const [editing, setEditing] = useState<PageType | null>(null);
  /**
   * 看这一套风格的方式。**默认是网格**——一眼看完有哪些页类型是详情页的主要用途；
   * 单页模式是「把每一页放大看清楚」，两种都要，所以是个开关而不是二选一。
   *
   * 从外面带着页类型进来时直接进单页模式：那是「我要看这一页」，不是「我要逛一圈」。
   */
  const [view, setView] = useState<'grid' | 'single'>(focusPage ? 'single' : 'grid');
  const [atRaw, setAtRaw] = useState(0);
  /** 补齐在途。跑的时候那一行显示进度，按钮收成转圈 */
  const [filling, setFilling] = useState(false);
  const [fillProgress, setFillProgress] = useState<FillProgress | null>(null);
  const fillAbortRef = useRef<(() => void) | null>(null);
  /** 统一在途。与补齐各占一套状态：两者可以互相打断，共用一个变量会让进度条串台 */
  const [unifying, setUnifying] = useState(false);
  const [unifyProgress, setUnifyProgress] = useState<ProgressPayload<UnifyStep> | null>(null);
  const [deviations, setDeviations] = useState<SpecDeviation[] | null>(null);
  const [specChecked, setSpecChecked] = useState(true);
  const [unrewritten, setUnrewritten] = useState<PageType[]>([]);
  const [skippedEdited, setSkippedEdited] = useState<PageType[]>([]);
  const unifyAbortRef = useRef<(() => void) | null>(null);

  /**
   * 关抽屉或换风格时收掉在跑的补齐流。
   *
   * **不能照抄 `RedrawPagePanel` 的「卸载时收」**：那个面板本身就是抽屉里的一个子组件，
   * 关抽屉时 Portal 里的内容一卸载，它跟着卸载，cleanup 自然会跑。而 `StyleDocDrawer` 是
   * `Drawer` 的**父组件**，一直挂在风格库页面上（`open` 只控制 Drawer 内部的 Portal），
   * 关抽屉不会把它卸载——照抄的话关掉抽屉，那条流会一直读到模型跑完，用户已经看不见它了，
   * 账单却照记。
   *
   * 所以盯 `styleId`：它变成 null（关抽屉）或换成另一套（换风格）时，上一轮的 cleanup 先跑，
   * 在这里收掉流并复位状态。不复位的话，重新打开会看到一个永远转不完的「补齐」——
   * 流已经断了，不会再有事件把它结束掉。
   */
  useEffect(() => () => {
    fillAbortRef.current?.();
    fillAbortRef.current = null;
    setFilling(false);
    setFillProgress(null);
    unifyAbortRef.current?.();
    unifyAbortRef.current = null;
    setUnifying(false);
    setUnifyProgress(null);
    setDeviations(null);
    setSkippedEdited([]);
  }, [styleId]);

  const detail = useQuery({
    queryKey: ['style-doc', styleId],
    // 接口返回的就是整份 StyleDoc（服务端走 `resolveStyleDoc`）。按真实形状声明，
    // 而不是只声明界面用到的那几个字段：补齐那一行要用 `missingPageTypes`，
    // 它按完整契约读 `pagePrompts`，声明窄了就只能靠强转，而强转会把字段名写错藏起来
    queryFn: () => api.get<StyleDoc>(`/styles/docs/${encodeURIComponent(styleId!)}`),
    enabled: Boolean(styleId),
  });
  const doc = detail.data;
  const covered = useMemo(() => (doc ? PAGE_TYPE_ORDER.filter((t) => doc.pagePrompts[t]) : []), [doc]);
  // 页类型会长（九个 → 十一个），新识别的风格自动带全，**已经存进库的那些只有九个**
  const missing = useMemo(() => (doc ? missingPageTypes(doc) : []), [doc]);
  const fragments = useMemo(() => covered.map((t) => doc!.pagePrompts[t]!.mockHtml), [covered, doc]);
  // 九个页类型共用同一套配色，配图必须整组一起分——各挑各的会让几张样机撞成同一张画面
  const mockImages = useMockImages(doc, fragments, covered);

  /**
   * 外面带页类型进来时，等详情到了再定位。
   *
   * `covered` 是详情加载完才有的，挂载那一刻还不知道目标排在第几个——初值只能给 0，
   * 真正的下标在这里补上。
   */
  useEffect(() => {
    if (!focusPage || covered.length === 0) return;
    const i = covered.findIndex((t) => t === focusPage);
    if (i >= 0) setAtRaw(i);
  }, [focusPage, covered]);

  /**
   * 单页模式看到第几页。
   *
   * 下标夹在 `covered` 里而不是单独维护一份列表：补齐之后页类型会变多，
   * 用旧列表算出来的下标会指到不存在的页上。
   */
  const at = Math.min(Math.max(0, atRaw), Math.max(0, covered.length - 1));
  const step = (delta: number) => setAtRaw(Math.min(Math.max(0, at + delta), covered.length - 1));
  /** 逐页看的动效。样机没有页面对象，按页类型序号解析即可 */
  const singleMotion = resolveMotion({ enter: 'auto', from: 'style-pack' }, at);

  function startFill() {
    if (!styleId || filling) return;
    setFilling(true);
    setFillProgress(null);
    fillAbortRef.current = streamSse(
      `/styles/docs/${encodeURIComponent(styleId)}/fill-missing/stream`,
      {
        onEvent: (event, data) => {
          if (event === 'progress') {
            setFillProgress(data as FillProgress);
          } else if (event === 'done') {
            setFilling(false);
            setFillProgress(null);
            // 流已经结束，别让 abortRef 继续指着它——关抽屉时再调一次虽然无害，但那是悬空引用
            fillAbortRef.current = null;
            // 两个查询都要失效：详情里多了几格样机，列表卡片上的「N 类页面」也跟着变了。
            // 与重识别面板落库后失效的是同两个
            void qc.invalidateQueries({ queryKey: ['style-doc', styleId] });
            void qc.invalidateQueries({ queryKey: ['style-docs'] });
            const filled = (data as { filled: PageType[] }).filled;
            if (filled.length > 0) {
              toast.success('已补齐', filled.map((t) => PAGE_TYPE_LABEL[t]).join('、'));
            }
          } else if (event === 'error') {
            setFilling(false);
            setFillProgress(null);
            fillAbortRef.current = null;
            toast.error('补齐失败', (data as { message: string }).message);
          }
        },
        onError: (err) => {
          setFilling(false);
          setFillProgress(null);
          fillAbortRef.current = null;
          toast.error('补齐中断', err.message);
        },
      },
    );
  }

  /**
   * 换字体角色。
   *
   * **不发模型调用、不重出样机**：服务端只改规范里的选择，页面渲染时那四个 CSS 变量
   * 跟着变，全篇一起换。所以这里跑完立刻失效两条查询，画布与卡片同时刷新。
   */
  const setFont = useMutation({
    mutationFn: (patch: Partial<Record<SpecFontRole, string>>) =>
      api.patch(`/styles/docs/${encodeURIComponent(styleId ?? '')}/fonts`, patch),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['style-doc', styleId] });
      // 列表卡片也带 spec（它要渲染样机），不失效的话卡片上还是旧字体
      await qc.invalidateQueries({ queryKey: ['style-docs'] });
    },
    onError: (err: Error) => toast.error('换字体失败', err.message),
  });

  /**
   * 一键统一：提炼规范 → 改写提示词 → 重出样机 → 自检。
   *
   * 与补齐同一套骨架（SSE、断开即停、跑完失效两条查询），差别在它跑完之后要把
   * 自检结果留在界面上——用户要的就是「哪里还没拉齐」这个结论，转成 toast 一闪就没了。
   */
  function startUnify() {
    if (!styleId || unifying) return;
    setUnifying(true);
    setUnifyProgress(null);
    setDeviations(null);
    setSkippedEdited([]);
    unifyAbortRef.current = streamSse(
      `/styles/docs/${encodeURIComponent(styleId)}/unify/stream`,
      {
        onEvent: (event, data) => {
          if (event === 'progress') {
            setUnifyProgress(data as ProgressPayload<UnifyStep>);
          } else if (event === 'done') {
            const r = data as {
              rewritten: PageType[]; skippedEdited: PageType[]; unrewritten: PageType[];
              deviations: SpecDeviation[]; checked: boolean;
            };
            setUnifying(false);
            setUnifyProgress(null);
            unifyAbortRef.current = null;
            setDeviations(r.deviations);
            setSpecChecked(r.checked);
            setSkippedEdited(r.skippedEdited);
            setUnrewritten(r.unrewritten);
            // 与补齐失效同两条：详情里的样机与规范变了，列表卡片上的预览也跟着变
            void qc.invalidateQueries({ queryKey: ['style-doc', styleId] });
            void qc.invalidateQueries({ queryKey: ['style-docs'] });
            if (r.rewritten.length === 0) {
              toast.info('没有页被改写', r.unrewritten.length > 0
                ? '这几页这一轮没改上，提示词还是原来的'
                : '这套风格的每一页都被你手改过');
            } else {
              toast.success('已统一', `${r.rewritten.length} 页的提示词与样机已按新规范更新`);
            }
          } else if (event === 'error') {
            setUnifying(false);
            setUnifyProgress(null);
            unifyAbortRef.current = null;
            toast.error('统一失败', (data as { message: string }).message);
          }
        },
        onError: (err) => {
          setUnifying(false);
          setUnifyProgress(null);
          unifyAbortRef.current = null;
          toast.error('统一中断', err.message);
        },
      },
    );
  }

  return (
    <Drawer
      open={Boolean(styleId)}
      onOpenChange={(v) => { if (!v) { setOpenPrompt(null); setEditing(null); onClose(); } }}
      title={doc?.name ?? '风格详情'}
      /*
        编辑态放宽到 1200：那边是「画布 + 侧栏」并排，画布固定 800（1920 的 42% 缩放），
        侧栏最少 280，再加间距与抽屉自己的 20px 内边距，880 摆不下。
        只读的那些视图仍是 880——它们只有样机网格，宽了反而散
      */
      width={editing ? 1200 : 880}
    >
      {!doc ? (
        <div className="py-16"><PageLoader label="正在加载" /></div>
      ) : editing ? (
        <PageEditPanel
          doc={doc}
          pageType={editing}
          onDone={() => {
            setEditing(null);
            // 两个查询都要失效：详情里的这一页样机与徽标变了，列表卡片上的预览也可能是这一页
            void qc.invalidateQueries({ queryKey: ['style-doc', styleId] });
            void qc.invalidateQueries({ queryKey: ['style-docs'] });
          }}
          onBack={() => setEditing(null)}
        />
      ) : (
        <div className="flex flex-col gap-5 px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="neutral">{doc.theme === 'dark' ? '深色' : '浅色'}</Badge>
            <span className="text-[13px] text-[var(--text-2)]">{doc.description}</span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                pill
                size="sm"
                variant={view === 'grid' ? 'primary' : 'ghost'}
                icon="LayoutGrid"
                onClick={() => setView('grid')}
              >
                网格
              </Button>
              <Button
                pill
                size="sm"
                variant={view === 'single' ? 'primary' : 'ghost'}
                icon="Square"
                onClick={() => setView('single')}
              >
                逐页看
              </Button>
            </div>
          </div>

          {/* 风格介绍：这套风格的视觉规范。它是「一键统一」的产物，也是它下一次的依据 */}
          <div className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-[var(--surface-1)] px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[13px] font-medium text-[var(--text-1)]">风格介绍</span>
              <Button
                pill
                size="sm"
                variant={doc.spec ? 'ghost' : 'primary'}
                className="ml-auto"
                loading={unifying}
                disabled={unifying || covered.length === 0}
                onClick={() => startUnify()}
              >
                {doc.spec ? '重新统一' : '提炼并统一'}
              </Button>
            </div>

            {doc.spec ? (
              <>
                {doc.spec.intro && (
                  <p className="text-[13px] leading-[1.7] text-[var(--text-2)]">{doc.spec.intro}</p>
                )}
                <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
                  {specLines(doc.spec).map((l) => (
                    <div key={l.label} className="flex gap-2 text-[12px] leading-[1.6]">
                      <dt className="shrink-0 text-[var(--text-3)]">{l.label}</dt>
                      <dd className="text-[var(--text-2)]">{l.value}</dd>
                    </div>
                  ))}
                </dl>
                <SpecFontPicker
                  spec={doc.spec}
                  pending={setFont.isPending}
                  onPick={(patch) => setFont.mutate(patch)}
                />
              </>
            ) : (
              <p className="text-[12px] leading-[1.7] text-[var(--text-3)]">
                还没提炼过视觉规范。识别是逐页写提示词的，各页的标题层级、角标形态、边距常常对不上——
                单独看每一页都成立，一张张翻过去就散了。点右边提炼一份全篇共用的规范，
                各页的提示词与样机会照它重写一遍。
              </p>
            )}

            {unifying && (
              <StepList
                steps={UNIFY_STEPS_UI}
                current={unifyProgress?.step}
                liveLabel={unifyProgress?.label}
                footer="四步里有两步是逐页调用，整套要几分钟。关掉这个抽屉会中断这一轮。"
              />
            )}

            {skippedEdited.length > 0 && (
              <p className="text-[12px] leading-[1.6] text-[var(--text-3)]">
                这 {skippedEdited.length} 页你手改过，没有动：{skippedEdited.map((t) => PAGE_TYPE_LABEL[t]).join('、')}。
                要一起统一的话，得先把它们的手改标记去掉。
              </p>
            )}

            {unrewritten.length > 0 && (
              <p className="text-[12px] leading-[1.6] text-[var(--text-3)]">
                这 {unrewritten.length} 页这一轮没改上：{unrewritten.map((t) => PAGE_TYPE_LABEL[t]).join('、')}。
                它们还是原来的提示词——不是「本来就不需要改」，再点一次「重新统一」可以补上。
              </p>
            )}

            {deviations !== null && (
              !specChecked ? (
                // 自检没跑成时说「全部对齐」是假信号——那正是用户会据此以为不用再管了的一句话
                <p className="text-[12px] leading-[1.6] text-[var(--text-3)]">
                  自检没跑成，这一次没有比对结果。规范与提示词已经更新，但这一轮没有查过产物，
                  别把这里的空白当成「已经对齐」。
                </p>
              ) : deviations.length === 0 ? (
                <p className="text-[12px] text-[var(--text-3)]">自检：逐页比对过，与规范全部对齐。</p>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[12px] text-[var(--text-3)]">
                    自检：还有 {deviations.length} 处与规范对不上——
                  </span>
                  {deviations.map((d, i) => (
                    <div key={`${d.pageType}-${d.field}-${i}`} className="flex flex-wrap items-center gap-2 text-[12px] leading-[1.6]">
                      <span className="text-[var(--text-2)]">{PAGE_TYPE_LABEL[d.pageType as PageType] ?? d.pageType}</span>
                      <span className="text-[var(--text-3)]">{d.field}</span>
                      <span className="text-[var(--text-3)]">应为 {d.expected}</span>
                      <span className="text-[var(--text-3)]">实际 {d.found}</span>
                      <button
                        type="button"
                        className="text-[var(--text-3)] underline-offset-2 hover:underline"
                        onClick={() => setEditing(d.pageType as PageType)}
                      >
                        改这一页
                      </button>
                    </div>
                  ))}
                </div>
              )
            )}
          </div>

          {/* 补齐入口。只在缺页类型时出现——一类不缺时这一行是多余的噪音 */}
          {missing.length > 0 && (
            <div className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-[var(--surface-1)] px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[13px] text-[var(--text-2)]">
                  还缺 {missing.length} 类页面：{missing.map((t) => PAGE_TYPE_LABEL[t]).join('、')}
                </span>
                <Button
                  pill
                  size="sm"
                  variant="primary"
                  className="ml-auto"
                  loading={filling}
                  onClick={() => startFill()}
                >
                  补齐
                </Button>
              </div>
              {filling && (
                <div className="flex flex-col gap-2">
                  {FILL_STEPS.map((s) => {
                    const active = fillProgress?.step === s.key;
                    const passed = fillProgress
                      ? FILL_STEPS.findIndex((x) => x.key === fillProgress.step)
                        > FILL_STEPS.findIndex((x) => x.key === s.key)
                      : false;
                    return (
                      <div key={s.key} className="flex items-center gap-2.5 text-[13px]">
                        {active ? (
                          <Icon name="LoaderCircle" size={16} className="animate-spin" />
                        ) : (
                          <Icon
                            name={passed ? 'CircleCheck' : 'Circle'}
                            size={16}
                            className={passed ? 'text-[var(--success)]' : 'text-[var(--text-3)]'}
                          />
                        )}
                        <span className={active ? 'text-[var(--text-1)]' : 'text-[var(--text-3)]'}>
                          {active ? fillProgress.label : s.label}
                        </span>
                      </div>
                    );
                  })}
                  <p className="text-[12px] text-[var(--text-3)]">
                    只补缺的那几类，配色、字体与已有的页类型都不动。每一类都要真跑一次样机，约几分钟，别关这个抽屉。
                  </p>
                </div>
              )}
            </div>
          )}

          <div className={view === 'grid' ? 'grid grid-cols-1 gap-5 lg:grid-cols-2' : 'hidden'}>
            {covered.map((t, i) => {
              const p = doc.pagePrompts[t]!;
              return (
                <div key={t} className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[var(--text-1)]">{PAGE_TYPE_LABEL[t]}</span>
                    <Badge tone={p.source === 'manual' ? 'brand' : 'neutral'}>
                      {p.source === 'manual' ? '手改' : p.source === 'reference' ? '参考图里有' : '推导'}
                    </Badge>
                    {p.edited && <Badge tone="success">已改过</Badge>}
                    <button
                      type="button"
                      className="ml-auto text-[12px] text-[var(--text-3)] underline-offset-2 hover:underline"
                      onClick={() => setEditing(t)}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="text-[12px] text-[var(--text-3)] underline-offset-2 hover:underline"
                      onClick={() => setOpenPrompt(openPrompt === t ? null : t)}
                    >
                      {openPrompt === t ? '收起提示词' : '看提示词'}
                    </button>
                  </div>
                  <HtmlMock doc={doc} html={p.mockHtml} width={380} images={mockImages[i]} pageType={t} pageNo={i + 1} />
                  {openPrompt === t && (
                    <pre className="max-h-[240px] overflow-auto whitespace-pre-wrap rounded-[var(--radius-inner)] bg-[var(--surface-1)] px-3 py-2 text-[12px] leading-[1.7] text-[var(--text-2)]">
                      {p.prompt}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>

          {/*
            逐页看：一次只放一页，翻页时播入场动效。
            与上面那个网格是同一份数据、同一组配图，换的只是「一次看几页」。
            **不卸载网格、只用 hidden 藏起来**：卸载再挂回来会让每张样机的 iframe
            重新加载一遍，切回来时九张图一起闪白。
          */}
          {view === 'single' && covered.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {covered.map((t, i) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setAtRaw(i)}
                    className={cn(
                      'rounded-full px-3 py-1 text-[12px] transition-colors duration-150 ease-out',
                      i === at
                        ? 'bg-[var(--brand-500)] text-[var(--brand-fg)]'
                        : 'bg-[var(--surface-1)] text-[var(--text-3)] hover:text-[var(--text-1)]',
                    )}
                  >
                    {PAGE_TYPE_LABEL[t]}
                  </button>
                ))}
              </div>

              <FlipStage pageKey={covered[at] ?? ''} motion={singleMotion.page} className="self-center">
                <HtmlMock
                  doc={doc}
                  html={doc.pagePrompts[covered[at]!]!.mockHtml}
                  width={820}
                  images={mockImages[at]}
                  pageType={covered[at]}
                  pageNo={at + 1}
                  staggerSeed={singleMotion.staggerSeed}
                />
              </FlipStage>

              <div className="flex items-center justify-center gap-3">
                <Button pill size="sm" variant="ghost" icon="ChevronLeft" disabled={at === 0} onClick={() => step(-1)}>
                  上一页
                </Button>
                <span className="font-[var(--font-mono)] text-[12px] tabular-nums text-[var(--text-3)]">
                  {at + 1} / {covered.length}
                </span>
                <Button
                  pill
                  size="sm"
                  variant="ghost"
                  iconRight="ChevronRight"
                  disabled={at >= covered.length - 1}
                  onClick={() => step(1)}
                >
                  下一页
                </Button>
                <Button pill size="sm" variant="ghost" icon="PenLine" onClick={() => setEditing(covered[at]!)}>
                  编辑这一页
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
