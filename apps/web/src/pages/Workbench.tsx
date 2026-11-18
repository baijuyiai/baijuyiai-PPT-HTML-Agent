import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Button, Dialog, DropdownMenu, EditorRail, IconButton, PageLoader, StatusPill, Tooltip, useTheme, useToast,
} from '@lumen/ui';
import { api, SseConnectError, streamSse } from '../api/client.js';
import type { OutlinePage, PageIR, ProjectDetail, StylePack, TaskSummary } from '../api/types.js';
import { DEFAULT_NARRATION_VOICE, NARRATION_VOICE_OPTIONS, type ChartStyleId, type PlanStep } from '@lumen/ir-schema';
import { CHART_STYLES, chartStyleOf } from '@lumen/charts';
import { LeftRail, RailShell } from '../workbench/LeftRail.js';
import { CenterCanvas } from '../workbench/CenterCanvas.js';
import { RightRail } from '../workbench/RightRail.js';
import { OutlineList } from '../workbench/OutlineList.js';
import { PageDesignBar } from '../workbench/PageDesignBar.js';
import { pageDesignStage } from '../workbench/page-design-state.js';
import { LessonEditor } from '../workbench/LessonEditor.js';
import { ExportShareDialog } from '../workbench/ExportShareDialog.js';
import { useWorkbench, type PageProgress, type PlanProgress, type PlanScope } from '../workbench/store.js';
import type { CanvasSelection } from '../workbench/CanvasTextHandles.js';
import { useSession } from '../stores/session.js';
import { markSeen } from '../workbench/seen.js';
import { useElapsed } from '../workbench/use-elapsed.js';
import { useBatchRun } from '../workbench/useBatchRun.js';

/**
 * `GET /projects/:id/generate/progress` 的回复。
 *
 * `kind` 分「整本」与「某一页被单独重生成」两类：两者的界面分量完全不同——
 * 前者要摆出「已完成 N 页」那一整套，后者只是某一格里在转。刷新回来据此决定接哪一种班。
 */
interface ProgressReply {
  running: boolean;
  kind: 'bulk' | 'page' | null;
  pages: { index: number; label: string; startedAt: number }[];
}

/**
 * 项目详情：三栏工作台。
 *
 * 骨架照参考稿的编辑器形态来——悬浮圆角窗口、最左一条图标竖栏、
 * 左右两块内嵌面板、中间画布。竖栏不放文字标签，所以左边那块面板
 * 可以专心放内容；面板之间用 1px 细线分隔而不是留缝，
 * 因为这里的信息密度很高，留缝会把画布挤窄。
 */
export function WorkbenchPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { theme, toggle } = useTheme();
  const wb = useWorkbench();

  // 打开这一页就算「看过了」。写在挂载时而不是离开时：离开的时机（关标签页、前进后退）
  // 不一定跑得到，而挂载一定跑得到
  const userId = useSession((s) => s.user?.userId ?? '');
  useEffect(() => {
    // `projectId` 有 `''` 的默认值（`:27` 的 `useParams()`），**空串要挡掉**——
    // 不挡就会往 localStorage 里记一个空 id，那个键谁也读不到、只是脏
    if (userId && projectId) markSeen(userId, projectId);
  }, [userId, projectId]);

  const detail = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => api.get<ProjectDetail>(`/projects/${projectId}`),
    enabled: Boolean(projectId),
  });

  // 详情到位后把服务端状态同步到本地编辑态
  useEffect(() => {
    if (!detail.data) return;
    wb.hydrate(detail.data);
    // 只在项目切换或服务端数据变化时同步，避免覆盖用户正在编辑的本地状态
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.data, projectId]);

  const [exportOpen, setExportOpen] = useState(false);
  const [leftTab, setLeftTab] = useState('brief');
  /**
   * 画布上选中的那一处（一段文字或一个图位）。右栏据此切 tab 并滚过去。
   *
   * 放在这一层是因为画布与右栏是**兄弟**，谁都不该知道对方；选中态是他们之间唯一要传的东西。
   * 段号是「**这一页**里第几段」，所以换页必须清掉——留着会指向新一页里另一段文字。
   */
  const [canvasSelection, setCanvasSelection] = useState<CanvasSelection>(null);
  useEffect(() => { setCanvasSelection(null); }, [wb.activeIndex]);
  /** 画布那个 iframe。右栏改文字时要往它里面即时写，所以放在这一层持有 */
  const canvasFrameRef = useRef<HTMLIFrameElement>(null);
  const stopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => stopRef.current?.(), []);

  // 已经有页面时，用户的注意力在页面上，默认切到大纲；空项目则先让他填需求
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (hydratedRef.current || !detail.data) return;
    hydratedRef.current = true;
    setLeftTab(detail.data.pages.length > 0 ? 'outline' : 'brief');
  }, [detail.data]);

  /**
   * 事件流报错的**唯一出口**。
   *
   * 「没连上」与「连着断了」要分开说：没连上时服务端已经讲清了原因
   * （生成锁被占着、项目不存在、登录过期），那句话是用户唯一的下一步；
   * 笼统报成「事件流断开」等于把它丢掉，用户只会以为是自己网络坏了。
   */
  const sseErrorToast = useCallback((err: Error) => {
    if (err instanceof SseConnectError) toast.error('没能开始生成', err.message);
    else toast.error('事件流断开', err.message);
  }, [toast]);

  /**
   * 生成结束的**唯一出口**。
   *
   * 四条路都可能走到这里：服务端发了 `done`、服务端发了 `error`、流被中途掐断
   * （`onError`）、以及流正常结束却没发过 `done`（`onClose`）。
   * 原先只在前两条里把 `generating` 放回 false，而后两条没写——
   * **流一断，`generating` 就永远停在 true**，界面定格在最后一帧：
   * 进度条不动、按钮禁用，看着就是「卡住了」，刷新一次才恢复。
   * 所以这里收成一处，四条路都从这里出去，**不允许在别处再写 setGenerating(false)**。
   *
   * ## 身份必须是稳定的（`[]`，不是 `[wb]`）
   *
   * 它挂在下面那圈 3 秒轮询的依赖里，而那圈轮询正是**唯一能把卡住的状态捞回来**的东西。
   * 依赖写成 `wb`（整个 store 对象）的话，每次 store 写入都会换一个新身份 → 那圈轮询的
   * effect 被拆了重建 → `setInterval` 活不过 3 秒，**一次都轮不到**。
   * 实测：界面停在「正在生成页面 3/3」整整六分钟没出来，根因就是这里。
   * 动作本身从 store 上取（`getState()`，身份恒定的那些），所以不需要 `wb` 进依赖。
   */
  const finishGeneration = useCallback(() => {
    stopRef.current = null;
    useWorkbench.getState().setGenerating(false);
  }, []);

  const startGeneration = useCallback((regenerate = false) => {
    if (stopRef.current) return;
    wb.setGenerating(true);
    /**
     * **只有全量重来才清空。** 续跑时不能清：已经生成好的那二十来页要一直留在画布上，
     * 服务端虽然会把它们当「本来就有」再报一遍 `page-ready`，但那之间有一段全空——
     * 用户看着自己刚生成的二十页一起消失，比不点还吓人。
     */
    if (regenerate) wb.clearProgress();

    /**
     * 画布回到**第一页要生成的那一页**。
     *
     * 不跳的话，用户点生成时停在哪儿、就先看到哪一页的揭示动画——「从上至下逐页生成」
     * 这件事在画布上就看不出来了，看着像从中间某页开始生成。
     *
     * 判据与服务端那份 `pending` 同一条：**不是 ready 的第一页**。续跑时前面几页
     * 本来就有，跳过去才是对的。
     */
    const firstPending = wb.statuses.findIndex((s) => s !== 'ready');
    wb.setActiveIndex(firstPending >= 0 ? firstPending : 0);

    const stop = streamSse(`/projects/${projectId}/generate/stream${regenerate ? '?regenerate=1' : ''}`, {
      onEvent: (event, data) => {
        const d = data as Record<string, unknown>;
        switch (event) {
          case 'style':
            wb.setStyleInfo(String(d.styleId), String(d.styleName));
            break;
          case 'outline':
            wb.setOutline(d.outline as OutlinePage[]);
            break;
          case 'page-start':
            /*
              这一条**不是**「这一页开始生成」，而是「这一页写完了、画布切过去」——
              服务端那侧是在落库之后、`page-ready` 之前发的（并发三页，没有「正在写的那一页」）。
              所以这里只跟着移选中，**不要**顺手标成「进行中」：那样会黄一下立刻变绿，
              用户根本看不见，还平白多一个和事实对不上的状态。
            */
            wb.setActiveIndex(Number(d.index));
            break;
          case 'page-progress':
            /*
              并发跑的时候落库要按大纲顺序，卡住的那页会把后面已完成的页全压住——
              所以**这一条是「还在动」的唯一凭据**。界面据此显示「第 N 页正在写 · 已等 M 秒」，
              而不是让用户对着一个纹丝不动的「已完成 0 页」猜是慢还是死。

              `startedAt` 也带上：画布上那块逐块点亮的画按**这一页跑了多久**算到第几块，
              拿「这一句文案说了多久」算的话，模型每换一句进度话，画面就从头重画一遍。
            */
            wb.setPageProgress(
              Number(d.index),
              String(d.label),
              typeof d.startedAt === 'number' ? d.startedAt : undefined,
            );
            break;
          case 'page-ready':
            wb.upsertPage(Number(d.index), d.page as PageIR, 'ready');
            break;
          case 'page-failed':
            // 服务端把这一页一起发来了（它是落过库的那一行）。**要放进 store**：
            // 失败原因在 `degradeReason` 里，只标一个红点的话用户永远看不到为什么
            wb.upsertPage(Number(d.index), (d.page as PageIR) ?? null, 'failed');
            toast.error(`第 ${Number(d.index) + 1} 页生成失败`, String(d.degradeReason ?? d.error ?? ''));
            break;
          case 'done': {
            const succeeded = Number(d.succeeded ?? 0);
            const failed = Number(d.failed ?? 0);
            const skipped = Number(d.skipped ?? 0);
            finishGeneration();
            // skipped 是「本来就有、这一轮没重做」的页。**必须与 succeeded 分开报**：
            // 合成一句「已生成 N 页」会让续跑的人以为又花了 N 页的钱
            if (failed > 0) {
              toast.info(`完成：新生成 ${succeeded} 页，失败 ${failed} 页`,
                skipped > 0 ? `另有 ${skipped} 页本来就有，没有重做` : '失败页可单独重生成');
            } else if (succeeded === 0 && skipped > 0) {
              toast.info('这本已经生成过', `${skipped} 页都在，没有重做`);
            } else {
              toast.success(`已生成 ${succeeded} 页`,
                skipped > 0 ? `另有 ${skipped} 页本来就有` : '可以开始精修或导出');
            }
            void qc.invalidateQueries({ queryKey: ['project', projectId] });
            // 项目库那张卡片上的「就绪 N/M」也要跟着变，否则回列表还得等一轮缓存过期
            void qc.invalidateQueries({ queryKey: ['projects'] });
            break;
          }
          case 'error':
            finishGeneration();
            toast.error('生成中断', String(d.message ?? ''));
            // 服务端那一侧可能已经落了若干页，界面上的进度是旧的，重新拉一次
            void qc.invalidateQueries({ queryKey: ['project', projectId] });
            break;
        }
      },
      onError: (err) => {
        finishGeneration();
        sseErrorToast(err);
        void qc.invalidateQueries({ queryKey: ['project', projectId] });
      },
      /**
       * 流正常结束。服务端那条 `done` 分支已经覆盖了绝大多数情况，
       * 这里是补漏：中间层按空闲超时掐流时，客户端看到的是「读完了，
       * 但没有 done」——不接这一条，生成中状态就摘不掉。
       */
      onClose: () => {
        if (!stopRef.current) return; // done/error 已经收过尾了
        finishGeneration();
        void qc.invalidateQueries({ queryKey: ['project', projectId] });
      },
    });
    stopRef.current = stop;
  }, [projectId, qc, toast, wb, finishGeneration, sseErrorToast]);

  /**
   * 「按此风格全部重新生成」（「风格」那一屏底部那颗按钮）。
   *
   * **恒等于全量重来**，不跟着 `generateMode` 走。换风格之后，已经生成好的页是按
   * **旧风格**写的，而 `generateMode` 在有缺页时给的是「继续生成 N 页」——那条路
   * 只补缺的几页，于是新风格和旧风格会混在同一本书里，而且**表面上看不出来**：
   * 每一页单看都正常，只有整本连起来读才觉得调子不对。
   *
   * 顺手切到「大纲与页面」：按下去之后人想看的就是一页页按新样子出来，而那一屏
   * 才有逐页的进度（左栏那列呼吸的色条、画布上的揭示、底部的「已等 N 秒」）。
   * 留在风格这一屏的话，除了按钮转圈什么都没有。
   */
  const regenerateWithStyle = useCallback(() => {
    setLeftTab('outline');
    startGeneration(true);
  }, [startGeneration]);

  /* ---------------- 提纲与教案 ---------------- */

  const [planning, setPlanning] = useState<PlanStep | null>(null);
  const [planProgress, setPlanProgress] = useState<PlanProgress | null>(null);
  /** 这一轮是谁点的。两个按钮跑的是同一条流，光看 `planning` 分不出该给哪个转圈 */
  const [planScope, setPlanScope] = useState<PlanScope | null>(null);
  /**
   * 整本正在重排（提纲 / 教案）时要显示的阶段，其余时候是 null。
   *
   * 画布靠它让位给 `PlanningProgress`。判据带上 scope 是因为**单页教案**
   * （`生成本页教案`）也走同一条流：那会儿用户就坐在这一页上改，
   * 把画布换成进度屏等于把他手上的东西抢走。
   */
  const planAllStep: PlanStep | null = planning !== null && planScope === 'all' ? planning : null;
  const planStopRef = useRef<(() => void) | null>(null);

  useEffect(() => () => planStopRef.current?.(), []);

  /**
   * 跑一段 plan 流（提纲或教案）。
   *
   * 返回 Promise 是为了让「生成整本教案」能把两段串起来——先出提纲、再出教案。
   *
   * **收尾只有一个出口**：`done` / `error` / `onClose` 三条路都从 `finish` 出去。
   * 与 `finishGeneration` 是同一个道理——少接一条，界面就永远停在「生成中」，
   * 那个缺陷这一版之前刚修过一次（见 `finishGeneration` 的注释）。
   */
  const runPlanStream = useCallback((path: string, step: PlanStep, scope: PlanScope) => new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      planStopRef.current = null;
      setPlanning(null);
      setPlanProgress(null);
      setPlanScope(null);
      resolve(ok);
    };

    setPlanning(step);
    setPlanScope(scope);
    setPlanProgress({ step, label: '正在准备', done: 0, total: 0 });

    const stop = streamSse(path, {
      onEvent: (event, data) => {
        const d = data as Record<string, unknown>;
        switch (event) {
          case 'progress':
            setPlanProgress({
              step: (d.step as PlanStep) ?? step,
              label: String(d.label ?? ''),
              // 服务端每写完一页都会带上这两个数；丢掉它们就只剩一句文字，画不出进度条
              done: Number(d.done ?? 0),
              total: Number(d.total ?? 0),
            });
            break;
          case 'outline':
            wb.setOutline(d.outline as OutlinePage[]);
            // 降级是**如实告知**而不是报错：规则骨架是可用的，只是没经过模型思考
            if (d.degraded) toast.info('模型不可用，这是规则骨架', '接上模型后重跑一次会好很多');
            break;
          case 'page':
            if (d.page) wb.applyLesson(Number(d.index), d.page as OutlinePage);
            break;
          case 'done': {
            if (Array.isArray(d.outline)) wb.setOutline(d.outline as OutlinePage[]);
            /*
              两档的收尾口径**故意不同**，别合并：
              - 提纲：跳过手改的页（那是人定的措辞，重跑该保留）→ 报「另有 N 页没有动」
              - 教案：整本重写、一页不落（用户按的就是「整本」）→ 报「其中 N 页已被覆盖」
              教案那句必须说，否则用户回头发现自己调过的那页被冲了，不知道是什么时候的事。
            */
            if (step === 'lessons') {
              const failed = Number(d.failed ?? 0);
              const overwritten = Number(d.overwrittenEdited ?? 0);
              const tail = overwritten > 0 ? `其中 ${overwritten} 页你改过，已按整本重写覆盖` : '';
              if (failed > 0) toast.info(`教案写好 ${Number(d.succeeded ?? 0)} 页，${failed} 页没写出来`, tail || '失败的可单页重跑');
              else toast.success(`教案已写 ${Number(d.succeeded ?? 0)} 页`, tail || '可以逐页精修了');
            } else {
              const skipped = Number(d.skippedEdited ?? 0);
              toast.success('提纲已生成', skipped > 0 ? `另有 ${skipped} 页你改过，没有动` : '接着生成教案');
            }
            finish(true);
            break;
          }
          case 'error':
            toast.error(step === 'lessons' ? '生成教案中断' : '生成提纲中断', String(d.message ?? ''));
            finish(false);
            break;
        }
      },
      onError: (err) => { sseErrorToast(err); finish(false); },
      // 流正常结束却没发过 done：按失败处理，别让下一段接着跑
      onClose: () => finish(false),
    });
    /**
     * 停止要**同时**收掉两件事：abort 流，再走一遍 `finish`。
     *
     * 只 abort 的话，`streamSse` 把 AbortError 吃掉（那是主动取消，不算错误），
     * `onClose` 也不会来——`finish` 没人调，`planning` 就永远停在那一档，
     * 而「生成整本教案」还 await 着这个 Promise，按钮再也点不动。
     */
    planStopRef.current = () => { stop(); finish(false); };
  }), [wb, toast, sseErrorToast]);

  /**
   * 停止按钮的唯一出口。三条流都收掉，再统一收尾。
   *
   * **先叫停服务端，再关自己这条流，顺序不能反。** 生成现在**不跟着连接走了**
   * （刷新页面不会打断它，见 `routes/projects.ts` 那段说明），所以只关掉流
   * 等于「我不听了」，后台照样在花钱、生成锁照样占着。真正让它停的是这个接口。
   *
   * 停完必须重新拉一次详情：断开的那一刻可能有页刚落库、事件还没送到，
   * 不拉的话界面上那几页要等下次刷新才出现——正是「生成好了却看不见」那个毛病。
   */
  const stopAll = useCallback(() => {
    void api.post(`/projects/${projectId}/generate/stop`, {}).catch(() => undefined);
    stopRef.current?.();
    planStopRef.current?.();
    regenStopRef.current?.();
    finishGeneration();
    void qc.invalidateQueries({ queryKey: ['project', projectId] });
  }, [finishGeneration, qc, projectId]);

  const planOutline = useCallback(
    () => runPlanStream(`/projects/${projectId}/plan/outline/stream`, 'outline', 'all'),
    [runPlanStream, projectId],
  );

  const planLessons = useCallback((only?: number[]) => runPlanStream(
    `/projects/${projectId}/plan/lessons/stream${only && only.length > 0 ? `?only=${only.join(',')}` : ''}`,
    'lessons',
    // 带了 `only` 就是「生成本页教案」，没带就是整本——这一条决定两个按钮谁转圈
    only && only.length > 0 ? 'one' : 'all',
  ), [runPlanStream, projectId]);

  /** 一键到底：先出提纲，再出教案。提纲没成就不往下走——教案要照着提纲写 */
  const planAll = useCallback(async () => {
    const ok = await planOutline();
    if (ok) await planLessons();
  }, [planOutline, planLessons]);

  /**
   * 设了页数的项目，进去就把提纲按页数出出来。
   *
   * **规则层给不了这个页数**：它按内容长度排，段数不够时不硬凑——一份八个要点的需求
   * 设 15 页，它只给 9 页。而用户填了 15 却看到 9，读起来就是系统没听他的。
   * 按页数扩展或收缩要的是模型（`plan/outline/stream` 把页数当硬要求，页数不对会带着
   * 抱怨重发，直到正好 N 页），所以那件事不该等他再点一次。
   *
   * **只在没动过的项目上自动重排**。已经生成过页面、或手改过某一页，都不动——
   * 那时以他手上那一份为准，页数差几页是他自己的事。少了这两道，进一次项目
   * 就把人改过的大纲冲掉一次。
   *
   * 服务端那侧配合：详情接口对这类项目**不返回规则骨架**（见 `generate.service.ts`
   * 的 `planOutline`），所以新建的项目进来是空大纲，这里直接跑。
   *
   * 只跑一次：跑完 `detail` 会重新拉，那时页数已经对上了；`autoPlannedRef` 再挡一道，
   * 免得生成失败时反复重试、反复花钱。
   */
  const autoPlannedRef = useRef<string | null>(null);
  useEffect(() => {
    const data = detail.data;
    if (!data) return;
    const want = data.project.targetPages;
    if (want == null || data.outline.length === want) return;
    if (data.pages.length > 0 || data.outline.some((o) => o.edited)) return;
    if (autoPlannedRef.current === projectId) return;
    autoPlannedRef.current = projectId;
    void planOutline();
  }, [detail.data, projectId, planOutline]);

  /**
   * 需求表单注册进来的「立刻保存」。
   *
   * 页数、深度这些是**设置**，改了不点保存就只活在表单里，而提纲读的是服务端那一份。
   * 生成动作必须**先等它落库**再出提纲——不等的话，用户改了页数、点「生成整本教案」，
   * 出来的还是老页数（用户报的就是这一条）。光靠防抖保存也不行：那是赌手速。
   */
  const briefSaveRef = useRef<(() => Promise<boolean>) | null>(null);
  const registerBriefSave = useCallback((fn: () => Promise<boolean>) => {
    briefSaveRef.current = fn;
  }, []);

  /**
   * 存需求 → 出提纲 → 出教案。**「整本重新规划」只有这一个入口**（中栏顶部那个按钮）。
   *
   * 原先「保存并生成」（需求栏）与「生成整本教案」（教案栏）做的是同一件事，
   * 两个按钮并排摆着只会让人犹豫该点哪个，所以撤掉了需求栏那个。
   */
  const saveAndPlanAll = useCallback(async () => {
    // 没注册（表单还没挂上）时按「不用存」处理，别把生成挡死
    const saved = await (briefSaveRef.current?.() ?? Promise.resolve(true));
    if (!saved) return; // 存不上就别生成，否则生成的是旧内容
    await planAll();
  }, [planAll]);

  /**
   * 单页重生成走流式。
   *
   * 原先是一个 `POST /pages/:id/regenerate`——**要等一整次模型调用**（实测 85 秒起步，
   * lint 不过还要再来一次），界面上只有一个转圈，用户分不清是在跑还是卡死了，
   * 反馈原话就是「转圈很久没结果」。现在服务端把「走到哪一步」推出来，
   * 界面上连同已经等了多少秒一起显示。
   */
  const [regen, setRegen] = useState<{ pageId: string; label: string; startedAt: number } | null>(null);
  const regenStopRef = useRef<(() => void) | null>(null);
  const regenElapsed = useElapsed(regen?.startedAt);

  useEffect(() => () => regenStopRef.current?.(), []);

  const regeneratePage = useCallback((pageId: string, layoutId?: string, nextPageType?: string) => {
    if (regenStopRef.current) return;
    setRegen({
      pageId,
      label: nextPageType ? '正在按图文版式重排这一页' : layoutId ? '正在按新排版重排这一页' : '正在准备',
      startedAt: Date.now(),
    });
    const finish = () => {
      regenStopRef.current = null;
      setRegen(null);
      /*
        这一页的骨架 id 已经落库了（响应里那份 page 带着它），生成动画该以**页面上那一份**
        为准——把「刚挑的」这条临时记录清掉。不清的话，之后一次不带骨架的普通重生成
        （服务端会把 id 清空）还会照着一条早就过期的记录去画那份骨架。
      */
      useWorkbench.getState().clearPendingLayout(pageId);
    };

    /**
     * 指定版式时带上 `layoutId`（工作台的「换排版」）。
     *
     * **要 encodeURIComponent**：自建骨架的 id 里带斜杠（`people/custom-…@v1`），
     * 不编码的话它会当成两段路径，落到别的路由上去。
     *
     * `pageType` 是「转成图文页」顺带要改的页类型。**放在这条请求里而不是单独
     * 调 `PUT /outline`**：那个端点会删掉 `pageIndex >= outline.length` 的页行，
     * 而转换不该删任何页（实测把一个 13 页的项目删到了 6 页）。
     */
    const query = [
      layoutId ? `layoutId=${encodeURIComponent(layoutId)}` : '',
      nextPageType ? `pageType=${encodeURIComponent(nextPageType)}` : '',
    ].filter(Boolean).join('&');
    const path = `/pages/${pageId}/regenerate/stream${query ? `?${query}` : ''}`;
    const stop = streamSse(path, {
      onEvent: (event, data) => {
        const d = data as Record<string, unknown>;
        if (event === 'progress') {
          setRegen((r) => (r ? { ...r, label: String(d.label ?? '') } : r));
        } else if (event === 'page') {
          const page = d.page as PageIR;
          // 服务端换的是内容、位置与 pageId 都不动，所以按下标写回即可；
          // 万一对不上（期间整份重新生成过），退回重新拉一次详情
          const idx = wb.pages.findIndex((p) => p?.pageId === page.pageId);
          if (idx >= 0) wb.upsertPage(idx, page, page.status === 'ready' ? 'ready' : 'failed');
          else void qc.invalidateQueries({ queryKey: ['project', projectId] });
          if (page.status === 'ready') toast.success('本页已重新生成');
          else toast.error('这一页还是没能生成出来', page.degradeReason ?? '');
          finish();
        } else if (event === 'error') {
          toast.error('重生成失败', String(d.message ?? ''));
          finish();
        }
      },
      onError: (err) => {
        sseErrorToast(err);
        finish();
      },
      onClose: finish,
    });
    regenStopRef.current = () => { stop(); finish(); };
  }, [projectId, qc, toast, wb, sseErrorToast]);

  /**
   * 整份 deck 的讲稿批量重算。
   *
   * **点完不能只弹个 toast。** 这个接口只是把任务排进队列（回一个 `queued` 数），
   * 真正生成在 worker 里，一页几秒、整本几十秒到几分钟。原来界面上除了那条会自己
   * 消失的 toast 什么都没有——看不到跑到哪、还剩几页、是不是卡住了。
   *
   * 所以记下「点了多少页、什么时候点的」，拿任务列表轮询着把进度显示在按钮上。
   */
  /**
   * 整份 deck 的讲稿批量重算。
   *
   * 进度由 `useBatchRun` 轮询任务列表得来——接口只是把任务排进队列（回一个 `queued` 数），
   * 真正生成在 worker 里。配音那一条用的是同一个 hook。
   */
  const scriptRun = useBatchRun(projectId, 'script_generate');

  const generateScripts = useMutation({
    mutationFn: () => api.post<{ queued: number }>(`/projects/${projectId}/scripts`),
    onSuccess: (r) => {
      if (r.queued === 0) {
        toast.info('没有要重算的讲稿', '还没生成过页面的页不会排进来');
        return;
      }
      scriptRun.start(r.queued);
    },
    onError: (err: Error) => toast.error('生成讲稿失败', err.message),
  });

  /**
   * 整份 deck 的讲解配音。
   *
   * **不跟着页面生成自动跑**：一页合成实测 15~35 秒，整本要十几分钟、按 token 计费。
   * 用户得先把内容确认完，再点这个按钮；点开先选音色，选完才整本排产。
   */
  const narrationRun = useBatchRun(projectId, 'tts');

  /** 点「配音」先弹这个，选完音色才排产 */
  const [narrationOpen, setNarrationOpen] = useState(false);
  /**
   * 暂停那一刻的音色。继续时拿它和当前值比——变了就把整批按新音色重排，
   * 免得同一本演示里新旧两种声音混着。
   */
  const pausedVoice = useRef<string | null>(null);

  const generateNarration = useMutation({
    mutationFn: async (voice: string) => {
      const current = detail.data?.project.narrationVoice ?? '';
      if (voice !== current) {
        await api.patch(`/projects/${projectId}`, { narrationVoice: voice === '' ? null : voice });
        await qc.invalidateQueries({ queryKey: ['project', projectId] });
      }
      return api.post<{ queued: number }>(`/projects/${projectId}/narration`);
    },
    onSuccess: (r) => {
      setNarrationOpen(false);
      if (r.queued === 0) {
        toast.info('没有要配音的页', '还没有讲稿的页不会排进来');
        return;
      }
      narrationRun.start(r.queued);
    },
    onError: (err: Error) => toast.error('生成配音失败', err.message),
  });

  /**
   * 切换图表风格。**即时落库**——这是个纯显示偏好，没有「确认」这一步的意义，
   * 点完画布就该跟着变。改完让详情失效，`project.chartStyle` 一路传到 `HtmlMock`，
   * 而那个 `srcDoc` 的 memo 依赖里有它，iframe 自己会重画。
   */
  const setChartStyle = useMutation({
    mutationFn: (style: ChartStyleId) => api.patch(`/projects/${projectId}`, { chartStyle: style }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['project', projectId] }),
    onError: (err: Error) => toast.error('切换图表风格失败', err.message),
  });

  const narrationControl = useMutation({
    mutationFn: (action: 'pause' | 'resume' | 'stop') =>
      api.post<{ changed: number }>(`/projects/${projectId}/narration/${action}`),
    onSuccess: (_r, action) => {
      if (action === 'stop') {
        narrationRun.reset();
        toast.info('已停止配音', '已经合成好的页会保留');
        return;
      }
      if (action === 'pause') {
        pausedVoice.current = detail.data?.project.narrationVoice ?? '';
        toast.info('已暂停', '正在合成的那几页会跑完；改了音色再「继续」会按新音色整批重来');
        narrationRun.refresh();
        return;
      }
      /**
       * **继续时音色变了就整批重来。** 已合成的页是按旧音色出的，接着跑只会让
       * 一本演示里两种声音并存。停止 + 重新整批排产，靠内容哈希把旧音频全作废。
       */
      const current = detail.data?.project.narrationVoice ?? '';
      if (pausedVoice.current !== null && current !== pausedVoice.current) {
        void narrationControlStopThenRestart();
        return;
      }
      narrationRun.refresh();
    },
    onError: (err: Error) => toast.error('操作失败', err.message),
  });

  /** 暂停中改了音色：先清掉排队任务，再按新音色整本重排 */
  const narrationControlStopThenRestart = async () => {
    await api.post(`/projects/${projectId}/narration/stop`);
    const r = await api.post<{ queued: number }>(`/projects/${projectId}/narration`);
    if (r.queued === 0) {
      narrationRun.reset();
      toast.info('没有要配音的页', '还没有讲稿的页不会排进来');
      return;
    }
    narrationRun.start(r.queued);
    toast.info('已按新音色重排', '整本会重新合成一遍，旧音频会被替换');
  };

  /**
   * 整本讲稿的暂停 / 继续 / 停止。
   *
   * 比配音那条简单：讲稿没有音色这类「重排参数」，继续就是继续，不用比较什么。
   * 服务端那边两者走同一个控制函数，只有 kind 不同。
   */
  const scriptControl = useMutation({
    mutationFn: (action: 'pause' | 'resume' | 'stop') =>
      api.post<{ changed: number }>(`/projects/${projectId}/scripts/${action}`),
    onSuccess: (_r, action) => {
      if (action === 'stop') {
        scriptRun.reset();
        toast.info('已停止生成讲稿', '已经生成好的页会保留');
        return;
      }
      if (action === 'pause') {
        toast.info('已暂停', '正在生成的那几页会跑完，剩下的等你点「继续」');
      }
      scriptRun.refresh();
    },
    onError: (err: Error) => toast.error('操作失败', err.message),
  });

  /** 骨架屏上的「优先生成」：这一页还没有，按大纲序号现生成一页 */
  const generateAt = useMutation({
    mutationFn: (index: number) => api.post<{ page: PageIR }>(`/projects/${projectId}/pages/${index}/generate`),
    onSuccess: async () => {
      // 服务端已经把页插到它该在的位置，重新拉一次详情让工作台按服务端顺序重排
      await qc.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success('本页已生成');
    },
    onError: (err: Error) => toast.error('生成失败', err.message),
  });

  const pack: StylePack | null = detail.data?.style?.kind === 'pack' ? detail.data.style.pack : null;
  const readyCount = useMemo(() => wb.pages.filter((p) => p !== null && p.status === 'ready').length, [wb.pages]);
  const failedCount = useMemo(() => wb.statuses.filter((s) => s === 'failed').length, [wb.statuses]);

  /**
   * 底部那条状态栏上要讲的「现在在跑什么」。
   *
   * 并发跑时会有好几页同时在写，摆不下也不该全摆——用户要的是「还在动」。
   * 所以挑**等得最久的那一页**：卡住的正是它，而卡住的那一页才是用户真正
   * 想知道「到底怎么了」的那一页。全都在正常推进时，这一页也只是「最早开始的那页」，
   * 看着一样。
   */
  const liveProgress = useMemo(() => {
    const list = Object.values(wb.genProgress);
    if (list.length === 0) return null;
    return list.reduce((oldest, p) => (p.at < oldest.at ? p : oldest));
  }, [wb.genProgress]);

  /**
   * 生成按钮的三种语义。
   *
   * - `start`：一页都还没有；
   * - `resume`：有页没成（失败的，或上一轮停在中途留下的那些）→ **只补这些**，
   *   已经成功的页原样留着、不重复计费；
   * - `regenerate`：全都好了 → 清空重来。
   *
   * 原先只有两种，判据是「有没有生成过页」，也就是 `hasGenerated`。于是项目里只要
   * 存在一页，按钮就永远是「重新生成」——**按下去会先把整本删光**：21 页跑了 20 页成功、
   * 10 页失败的项目，用户想「接着跑剩下的」，按下去丢的是前面那 20 页。
   */
  const generateMode: 'start' | 'resume' | 'regenerate' =
    readyCount === 0 && failedCount === 0
      ? 'start'
      : readyCount === wb.pages.length ? 'regenerate' : 'resume';
  const pendingCount = wb.pages.length - readyCount;

  /**
   * 「页面设计」屏顶上那条状态条的三个读数。
   *
   * 与 `liveProgress`（挑等得最久的那一页，给底部状态栏用）不同：状态条要把
   * **正在写的每一页**都摆出来，所以按大纲下标排好整份传下去。
   */
  const livePages = useMemo(
    () => Object.values(wb.genProgress).sort((a, b) => a.index - b.index),
    [wb.genProgress],
  );
  /** 有纲、还没写教案的条数。判据与 `LessonEditor` / `OutlineList` 一致：看视觉形式有没有字 */
  const lessonsMissing = useMemo(
    () => wb.outline.filter((o) => (o.visualForm ?? '').trim() === '').length,
    [wb.outline],
  );
  /**
   * 整本这一轮是什么时候点起来的。
   *
   * **在客户端记，因为服务端没记**：服务端只逐页登记「这一页什么时候开始写的」
   * （`LivePage.startedAt`，刷新靠它接上单页的进度），整本这一轮的起点没有对应字段。
   * 所以刷新之后它从 0 重新数——文案里写的是「本轮」，不是「总共」，不至于骗人。
   *
   * 只在**由静转动**那一下写一次（`prev ?? Date.now()`）：轮询每 3 秒回来一次，
   * 无条件重写的话这个数会跟着轮询往前跳，秒数永远停在 0 附近。
   */
  const [roundStartedAt, setRoundStartedAt] = useState<number | null>(null);
  useEffect(() => {
    setRoundStartedAt((prev) => (wb.generating ? (prev ?? Date.now()) : null));
  }, [wb.generating]);

  /**
   * 「页面设计」顶上那条状态条此刻是哪一档。
   *
   * 与状态条内部算的是同一个纯函数（`pageDesignStage`），这里再用一次是为了**决定顶栏那颗
   * 生成按钮让不让位**——只有状态条自己摆了按钮的时候它才让。两处都走同一份判据，
   * 不会出现「状态条说待开始、顶栏却把按钮藏了」那种一个都不给的情况。
   */
  const designStage = pageDesignStage({
    outlineCount: wb.outline.length,
    readyCount,
    failedCount,
    generating: wb.generating,
    liveCount: livePages.length,
  });

  /**
   * 进来先问一次：这个项目现在在生成吗。
   *
   * 生成**不跟着连接走了**（刷新不会打断它），所以刷新回来时界面上关于「正在生成」
   * 的一切都归零——用户看到几页不动的大纲行，不知道后台其实在跑、跑到了哪。
   * 问这一下就把「第 N 页正在写、已等 M 秒」接回来，之后靠下面的轮询续着。
   *
   * ## 依赖只能有 `projectId`
   *
   * 这条 effect 里**有一次 fetch，而它的回调会写 store**（`syncLiveProgress`）。
   * 依赖里带上 `wb`（整个 store 对象）就成了一个闭环：store 写入 → `wb` 换身份 →
   * effect 重建 → 再 fetch → 又写 store…… 实测跑到 **每秒二十次**请求，
   * 而那圈 3 秒轮询被这样反复拆建，**一次都轮不到**——于是「服务端已经收尾、
   * 界面还写着正在生成」这个状态永远没人来纠正（见 `finishGeneration` 的注释）。
   *
   * 所以这里读状态与调动作一律走 `useWorkbench.getState()`：它取到的是同一份 store，
   * 但**不进依赖**，effect 就只在换项目时跑一次——这也正是它本来的意思（「进来先问一次」）。
   */
  useEffect(() => {
    void api.get<ProgressReply>(`/projects/${projectId}/generate/progress`)
      .then((d) => {
        /*
          逐页进度**两类都接**：整本在跑、或只是某一页被单独重生成，界面上那一格
          都该写着「正在写这一页」。手动的单页不置 `generating`——那是整本的界面态，
          只重跑一页却摆出「已完成 N 页」那一套，与事实对不上。
        */
        const st = useWorkbench.getState();
        st.syncLiveProgress(d.pages);
        /*
          刷新回来把画布挪到**正在写的那一页**上。

          用户报的原话是「刷新过后，正在生成的页面的进度就看不到了」——生成并没有停
          （它不跟着连接走），但客户端关于「在生成哪一页」的记忆全清零了，落回第 1 页。
          整本那条流靠 `page-start` 事件移画布，刷新之后没有事件可收，就靠这一句补上。

          已经停在某一页正在写的那页上时不动它：用户自己点过去看的，别抢。
        */
        if (d.pages.length > 0 && !d.pages.some((p) => p.index === st.activeIndex)) {
          st.setActiveIndex(d.pages[0]!.index);
        }
        // 自己已经开着一条流了（正常点「生成」进来的那条），别抢
        if (d.kind !== 'bulk' || st.generating) return;
        st.setGenerating(true);
      }).catch(() => undefined);
  }, [projectId]);

  /**
   * 每几秒做两件事：**续上进度**，和服务端对一次账。
   *
   * 进度那条**一直问，不以「正在生成」为前提**：SSE 的进度事件是推给当时那条连接的，
   * 连接没了就没了——而手动的单页重生成压根不置 `generating`，刷新之后若不问，
   * 那一页的「正在写」就再也接不上。对本就在跑的那条流它是重复劳动，但只是一次
   * 内存查询，换来的是三种情况（整本、单页、刷新接回来）共用一份代码。
   *
   * 对账那条是兜底：事件流被中间层掐断、或某一页的 `page-ready` 恰好丢在断连那一刻，
   * 界面上就会出现「服务端已经好了、这边还是没生成」——用户的原话是
   * 「有些页面生成了，我必须刷新才能看到」。它**只同步页与状态、不动大纲**，
   * 用户可能正同时在左栏改标题。
   */
  useEffect(() => {
    const progressTimer = window.setInterval(() => {
      void api.get<ProgressReply>(`/projects/${projectId}/generate/progress`)
        .then((d) => {
          const st = useWorkbench.getState();
          st.syncLiveProgress(d.pages);
          if (!st.generating) return;
          // 服务端那一轮已经收尾了（跑完、或被叫停），界面跟着收
          if (!d.running) { finishGeneration(); return; }
        }).catch(() => undefined);
    }, 3000);
    const pageTimer = window.setInterval(() => {
      void api.get<ProjectDetail>(`/projects/${projectId}`)
        .then((d) => {
          /*
            **一直对账，不以「正在生成」为前提。**

            原先这里挂着 `if (st.generating)`。而 `generating` 是个**客户端状态**：
            某一页的状态要是在它变 false 之前没跟上（事件丢在断连那一刻、或是这一轮
            已经收尾），那个错的状态就再也不会被纠正——用户看到的是「18 页都好了，
            却有一页还写着生成中，也不知道是哪一页」。

            代价是每 8 秒一次项目查询；换来的是界面永远收敛到服务端那一份真相。
          */
          // 对账要拿**此刻**的 store，不是建这个 effect 时的那个（见下面依赖的注释）
          useWorkbench.getState().syncPages(d);
        })
        // 对账失败不打扰用户：下一轮再来，事件流本身还在
        .catch(() => undefined);
    }, 8000);
    return () => {
      window.clearInterval(progressTimer);
      window.clearInterval(pageTimer);
    };
    /*
      **依赖里只有 `projectId` 与那个身份稳定的 `finishGeneration`。**
      两者都不能写成 `wb`：那圈 3 秒对账是「服务端已经好了、界面还停在生成中」唯一能
      把状态捞回来的东西，而它要是被每次 store 写入拆了重建，`setInterval` 活不过 3 秒、
      一次都轮不到——实测就是这么卡死的（见 `finishGeneration` 与上面那条 effect 的注释）。
      两个回调里读写 store 一律走 `useWorkbench.getState()`。
    */
  }, [projectId, finishGeneration]);

  if (detail.isLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center"><PageLoader label="正在加载项目" /></div>
    );
  }
  if (detail.isError || !detail.data) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4">
        <p className="text-sm text-[var(--text-2)]">项目不存在或无权访问</p>
        <Button variant="primary" pill onClick={() => navigate('/projects')}>返回项目库</Button>
      </div>
    );
  }

  return (
    <>
      <div className="flex h-full min-h-0 w-full flex-col">
        <TopBar
          title={detail.data.project.title}
          subtitle={wb.progressText(readyCount)}
          styleName={wb.styleName}
          chartStyle={detail.data.project.chartStyle}
          onChartStyleChange={(v) => setChartStyle.mutate(v)}
          degraded={wb.degradedPages}
          generating={wb.generating}
          readyCount={readyCount}
          total={wb.pages.length}
          onBack={() => navigate('/projects')}
          onPresent={(fromStart) => navigate(
            fromStart ? `/present/${projectId}` : `/present/${projectId}?page=${wb.activeIndex}`,
          )}
          onScripts={() => generateScripts.mutate()}
          scriptsPending={generateScripts.isPending || scriptControl.isPending}
          scriptsDone={scriptRun.done}
          scriptsTotal={scriptRun.total}
          scriptsPaused={scriptRun.paused}
          onScriptsPause={() => scriptControl.mutate('pause')}
          onScriptsResume={() => scriptControl.mutate('resume')}
          onScriptsStop={() => scriptControl.mutate('stop')}
          onNarration={() => setNarrationOpen(true)}
          narrationPending={generateNarration.isPending || narrationControl.isPending}
          narrationDone={narrationRun.done}
          narrationTotal={narrationRun.total}
          narrationPaused={narrationRun.paused}
          onNarrationPause={() => narrationControl.mutate('pause')}
          onNarrationResume={() => narrationControl.mutate('resume')}
          onNarrationStop={() => narrationControl.mutate('stop')}
          onExport={() => setExportOpen(true)}
          onGenerate={() => startGeneration(generateMode === 'regenerate')}
          generateMode={generateMode}
          pendingCount={pendingCount}
          canAct={readyCount > 0}
          busy={wb.generating || planning !== null}
          onStop={stopAll}
          /*
            顶栏那颗生成按钮**在「页面设计」让位**：那一屏顶上的状态条已经摆着同一颗
            （待开始给「开始生成 N 页」、有缺页给「继续生成 N 页」），两颗青柠色的药丸
            上下叠在一个视口里，实测截图里看得很清楚，谁都要愣一下该点哪个。

            判据用的是**状态条此刻算出来的那一档**，不是 tab 本身：状态条不给按钮的时候
            （全部就绪时的「重新生成」、单页重生成时的「正在生成这一页」）顶栏照旧要留着，
            否则这一刻这一屏一个能点的生成都没有。
          */
          hideGenerate={leftTab === 'outline' && (designStage === 'idle' || designStage === 'partial')}
        />

        <div className="flex min-h-0 flex-1">
          <EditorRail
            value={leftTab}
            onChange={setLeftTab}
            items={[
              /*
                四格的顺序就是这本 deck 的工序：**提纲与教案 → 页面 → 风格 → 功能库**。
                所以第一格叫「大纲与教案」（它里面确实是大纲、教案、需求三样），
                第二格叫「页面设计」（它里面是页面列表 + 画布 + 检查器）。
              */
              { id: 'brief', icon: 'ListChecks', label: '大纲与教案' },
              { id: 'outline', icon: 'LayoutTemplate', label: '页面设计', badge: wb.pages.length },
              { id: 'style', icon: 'Palette', label: '风格' },
              { id: 'modules', icon: 'Blocks', label: '功能库' },
            ]}
            footer={(
              <>
                <Tooltip content={theme === 'dark' ? '切到浅色' : '切到深色'}>
                  <IconButton
                    name={theme === 'dark' ? 'Sun' : 'Moon'}
                    label="切换主题"
                    size={20}
                    onClick={toggle}
                  />
                </Tooltip>
                <Tooltip content="导出与分享">
                  <IconButton name="Share2" label="导出与分享" size={20} disabled={readyCount === 0} onClick={() => setExportOpen(true)} />
                </Tooltip>
              </>
            )}
          />

          {leftTab === 'brief' ? (
            /*
              「大纲与教案」这一屏的顺序是**大纲 / 教案 / 需求**。
              大纲放在最左不是随手排的：它在「页面设计」那一屏里也在最左，
              两屏同形之后，切 tab 时左栏不会从左边跳到右边。
              需求表单挪到最右——它是一屏只填一次的东西，不占主视线。
            */
            <>
              <RailShell title="大纲" icon="ListOrdered" hint="拖拽排序，双击标题改名">
                <OutlineList
                  projectId={projectId}
                  onGenerate={() => startGeneration(generateMode === 'regenerate')}
                  generating={wb.generating}
                  planProgress={planProgress}
                  showPageTypePanel={false}
                />
              </RailShell>

              <LessonEditor
                projectId={projectId}
                planning={planning}
                planScope={planScope}
                progress={planProgress}
                onGenerateLesson={() => void planLessons([wb.activeIndex])}
                onGeneratePage={() => {
                  const page = wb.pages[wb.activeIndex];
                  // 已生成过的走重生成（换掉内容、位置与 pageId 都不动），
                  // 还没有的走「按大纲序号补生成」——两条路的落位规则不一样，不能混用
                  if (page?.pageId) regeneratePage(page.pageId);
                  else generateAt.mutate(wb.activeIndex);
                }}
                generatingPage={regen !== null || generateAt.isPending}
              />

              <LeftRail
                projectId={projectId}
                onGenerate={() => startGeneration(generateMode === 'regenerate')}
                planning={planning}
                planScope={planScope}
                planProgress={planProgress}
                generating={wb.generating}
                tab={leftTab}
                onTabChange={setLeftTab}
                side="right"
                onRegisterSave={registerBriefSave}
                onGenerateLessons={() => void saveAndPlanAll()}
              />
            </>
          ) : (
            /*
              「页面设计」这一屏 = **顶上一条状态条 + 底下三栏**。

              状态条横跨三栏摆在最上面，是因为这一屏原先没有任何一处说得出「整本跑到哪了」：
              左栏那条汇总要滚到列表顶上才看得见，切到别的页看画布就再也找不到说全局的地方。
              它同时是**这一屏唯一的「开始」入口**——左栏底下那颗同名的按钮已按用户要求撤掉，
              「大纲与教案生成好之后，在这一屏手动点开始」这句话才有一个明确的下手处。
            */
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <PageDesignBar
                outlineCount={wb.outline.length}
                lessonsMissing={lessonsMissing}
                readyCount={readyCount}
                failedCount={failedCount}
                generating={wb.generating}
                live={livePages}
                roundStartedAt={roundStartedAt}
                // 顶栏那颗按 `generateMode` 会给「重新生成」，而状态条只在
                // 「一页都没有」与「有缺页」两态给按钮，两种语义都是续跑，所以恒传 false
                onStart={() => startGeneration(false)}
                onGoOutline={() => setLeftTab('brief')}
              />

              <div className="flex min-h-0 flex-1">
                <LeftRail
                  projectId={projectId}
                  onGenerate={() => startGeneration(generateMode === 'regenerate')}
                  planning={planning}
                  planScope={planScope}
                  planProgress={planProgress}
                  generating={wb.generating}
                  tab={leftTab}
                  onTabChange={setLeftTab}
                  onGenerateLessons={() => void saveAndPlanAll()}
                  onRegenerateAll={regenerateWithStyle}
                  onPickLayout={(layoutId) => {
                    const page = wb.pages[wb.activeIndex];
                    if (!page?.pageId) return;
                    /*
                      先记下「刚挑的是这份」再发起生成：骨架 id 要等这一页生成完才落库，
                      而那条**生成动画现在就要画这份骨架**——不然用户刚点的那一下，
                      画面上画的还是风格样机，看着像点了没反应（见 store 的 `pendingLayouts`）。
                    */
                    wb.setPendingLayout(page.pageId, layoutId);
                    regeneratePage(page.pageId, layoutId);
                  }}
                />

                <CenterCanvas
                  pack={pack}
                  theme={theme}
                  onRegenerate={regeneratePage}
                  onGenerateAt={(index) => generateAt.mutate(index)}
                  selection={canvasSelection}
                  onSelect={setCanvasSelection}
                  frameRef={canvasFrameRef}
                  regenerating={regen !== null}
                  regenProgress={regen ? { pageId: regen.pageId, label: regen.label, elapsed: regenElapsed } : null}
                  generatingAt={generateAt.isPending ? generateAt.variables ?? null : null}
                  planning={planAllStep}
                  planProgress={planProgress}
                />

                <RightRail
                  pack={pack}
                  theme={theme}
                  projectId={projectId}
                  onRegenerate={(layoutId, nextPageType) => {
                    const page = wb.pages[wb.activeIndex];
                    if (page && page.pageId) regeneratePage(page.pageId, layoutId, nextPageType);
                  }}
                  regenerating={regen !== null}
                  regenProgress={regen ? { pageId: regen.pageId, label: regen.label, elapsed: regenElapsed } : null}
                  selection={canvasSelection}
                  frameRef={canvasFrameRef}
                />
              </div>
            </div>
          )}
        </div>

        <StatusBar
          index={wb.pages.length === 0 ? 0 : wb.activeIndex + 1}
          total={wb.pages.length}
          ready={readyCount}
          styleName={wb.styleName}
          degraded={wb.degradedPages}
          generating={wb.generating}
          progress={liveProgress}
        />
      </div>

      <NarrationVoiceDialog
        open={narrationOpen}
        onOpenChange={setNarrationOpen}
        projectVoice={detail.data?.project.narrationVoice ?? ''}
        pending={generateNarration.isPending}
        onStart={(voice) => generateNarration.mutate(voice)}
      />

      <ExportShareDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        projectId={projectId}
        readyCount={readyCount}
        totalPages={wb.pages.length}
      />

      <div className="sr-only" aria-live="polite">
        {wb.generating ? `正在生成，已完成 ${readyCount} 页` : '生成已结束'}
      </div>
    </>
  );
}

/* ---------------- 顶栏 ---------------- */

/**
 * 顶栏只放「这个项目是什么、能对它做什么」。
 * 左半是身份与状态，右半是动作，中间留空——挤满按钮的顶栏会让人每次都要重新找。
 */
function TopBar({
  title, subtitle, styleName, chartStyle, onChartStyleChange, degraded, generating, readyCount, total,
  onBack, onPresent, onScripts, scriptsPending, scriptsDone, scriptsTotal, scriptsPaused,
  onScriptsPause, onScriptsResume, onScriptsStop,
  onNarration, narrationPending, narrationDone, narrationTotal, narrationPaused,
  onNarrationPause, onNarrationResume, onNarrationStop,
  onExport, onGenerate, generateMode, pendingCount, canAct, busy, onStop, hideGenerate,
}: {
  title: string;
  subtitle: string;
  styleName: string;
  /** 这个项目的图表视觉风格。图表页按它画 */
  chartStyle: string;
  onChartStyleChange: (style: ChartStyleId) => void;
  degraded: number;
  generating: boolean;
  readyCount: number;
  total: number;
  /** 这一轮讲稿已经跑完几页。没在跑时为 `null` */
  scriptsDone: number | null;
  /** 这一轮讲稿一共排了几页。没在跑时为 0 */
  scriptsTotal: number;
  onBack: () => void;
  /** 演示。`fromStart` 为 true 从第一页开始，否则从当前页开始 */
  onPresent: (fromStart: boolean) => void;
  onScripts: () => void;
  scriptsPending: boolean;
  /** 其中被挂起的页数。>0 说明正暂停着 */
  scriptsPaused: number;
  onScriptsPause: () => void;
  onScriptsResume: () => void;
  onScriptsStop: () => void;
  /** 这一轮配音已经跑完几页。没在跑时为 `null` */
  narrationDone: number | null;
  /** 这一轮配音一共排了几页。没在跑时为 0 */
  narrationTotal: number;
  /** 其中被挂起的页数。>0 说明正暂停着 */
  narrationPaused: number;
  /** 打开音色弹层；真正排产在弹层里点「开始生成」之后 */
  onNarration: () => void;
  onNarrationPause: () => void;
  onNarrationResume: () => void;
  onNarrationStop: () => void;
  narrationPending: boolean;
  onExport: () => void;
  onGenerate: () => void;
  /** 生成按钮这次按什么语义走：刚开始 / 补没成功的 / 全部重来 */
  generateMode: 'start' | 'resume' | 'regenerate';
  /** 还没成功的页数，`resume` 时写进按钮 */
  pendingCount: number;
  canAct: boolean;
  /** 有任何一条内容链路（出页面 / 出提纲 / 出教案）在跑 */
  busy: boolean;
  onStop: () => void;
  /**
   * 这一次**不画**那颗生成按钮。
   *
   * 「页面设计」那一屏顶上有一条状态条，开始/继续就摆在那里（`PageDesignBar`）——
   * 顶栏再摆一颗同名的主按钮，两颗青柠色的药丸会上下叠在同一个视口里，实测截图看得很清楚：
   * 「开始生成」在上面、「开始生成 3 页」在下面，谁都要愣一下该点哪个。
   *
   * 只在状态条自己**有话说**的时候让位（待开始 / 有缺页）。全部就绪时状态条不给按钮，
   * 那一刻顶栏那颗是「重新生成」，是这一屏唯一能全本重来的入口，不能一起藏掉。
   */
  hideGenerate?: boolean;
}) {
  /** 还有页没跑完。全跑完了按钮该回到「配音」 */
  const narrationRunning = narrationDone !== null && narrationTotal > 0 && narrationDone < narrationTotal;
  /** 同上，讲稿那一条 */
  const scriptsRunning = scriptsDone !== null && scriptsTotal > 0 && scriptsDone < scriptsTotal;

  const generateCopy = {
    start: { label: '开始生成', hint: '按大纲逐页生成' },
    resume: { label: `继续生成 ${pendingCount} 页`, hint: '只补没成功的那些页，已经生成好的不会重做、不会重复计费' },
    regenerate: { label: '重新生成', hint: '清空后按大纲重新生成全部页面' },
  }[generateMode];
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] px-3">
      <IconButton name="ArrowLeft" label="返回项目库" onClick={onBack} />

      <div className="flex min-w-0 items-center gap-2.5">
        <span className="truncate text-[15px] font-semibold tracking-tight text-[var(--text-1)]">{title}</span>
        <span className="hidden shrink-0 text-[12px] text-[var(--text-3)] sm:inline">{subtitle}</span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {generating ? (
          <StatusPill tone="brand" icon="Loader">
            生成中 {readyCount}/{total}
          </StatusPill>
        ) : readyCount > 0 ? (
          <StatusPill tone="success">已就绪</StatusPill>
        ) : (
          <StatusPill tone="neutral">草稿</StatusPill>
        )}
        {styleName && <StatusPill tone="neutral">{styleName}</StatusPill>}
        {/*
          图表风格：项目级旋钮，点完即时落库。

          **只用一个图标，不写文字。** 顶栏本来就紧（窄窗口下标题已经被压到只剩几十像素），
          加一个带文字的控件会把标题挤成 0 宽——实测过。当前是哪一套看悬停提示，
          展开后菜单里有对勾。
        */}
        <Tooltip content={`图表风格：${chartStyleOf(chartStyle).name}`}>
          <DropdownMenu
            align="start"
            trigger={(
              <IconButton
                name="ChartColumn"
                label={`图表风格：${chartStyleOf(chartStyle).name}`}
                size={16}
              />
            )}
            items={CHART_STYLES.map((s) => ({
              label: s.name,
              ...(s.id === chartStyle ? { icon: 'Check' as const } : {}),
              onSelect: () => onChartStyleChange(s.id),
            }))}
          />
        </Tooltip>
        {degraded > 0 && (
          <Tooltip content="这些页走了降级路径（例如图表数据不足改成了文本页）">
            <StatusPill tone="warning" icon="TriangleAlert">{degraded} 页降级</StatusPill>
          </Tooltip>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {/*
          「演示」是个下拉：从头放 / 从当前页接着放。
          原先只有一键从头，讲到一半想再放一遍当前这页，得先手动翻回去。
        */}
        <DropdownMenu
          align="end"
          trigger={(
            <Button size="sm" pill icon="MonitorPlay" iconRight="ChevronDown" disabled={!canAct}>
              演示
            </Button>
          )}
          items={[
            { label: '从头演示', icon: 'Play', onSelect: () => onPresent(true) },
            { label: '从当前页开始', icon: 'CirclePlay', onSelect: () => onPresent(false) },
          ]}
        />
        {/*
          讲稿跑起来之后，这个位置换成「暂停/继续 + 停止」，与配音那一组同形。
          原来只有一条不会停的进度：一本三十页的 deck 每页都要调一次模型，
          跑到一半想回去改内容、或者发现方向不对，除了等没有别的办法。
        */}
        {scriptsRunning ? (
          <>
            <Tooltip content={scriptsPaused > 0 ? '接着跑剩下的页' : '暂停排队。正在生成的那几页会跑完'}>
              <Button
                size="sm"
                pill
                icon={scriptsPaused > 0 ? 'Play' : 'Pause'}
                disabled={scriptsPending}
                onClick={scriptsPaused > 0 ? onScriptsResume : onScriptsPause}
              >
                {scriptsPaused > 0 ? '继续' : '暂停'} 讲稿 {scriptsDone}/{scriptsTotal}
              </Button>
            </Tooltip>
            <Tooltip content="停掉排队与挂起的讲稿任务。已经生成好的页会保留">
              <Button size="sm" pill icon="Square" disabled={scriptsPending} onClick={onScriptsStop}>
                停止讲稿
              </Button>
            </Tooltip>
          </>
        ) : (
          <Tooltip content="按每页内容重算口播稿与讲解锚点">
            {/*
            讲稿按钮**就地显示进度**：排进去几页、跑完几页。
            原来只弹一条会自己消失的 toast，用户看不到跑到哪、还剩几页、是不是卡住了。
          */}
            <Button
              size="sm"
              pill
              icon="Mic"
              loading={scriptsPending}
              disabled={!canAct}
              onClick={onScripts}
            >
              讲稿
            </Button>
          </Tooltip>
        )}
        {/*
          配音**与讲稿分开**：讲稿是文字，配音是按 token 计费的语音合成，一页十几秒。
          所以它不跟着生成自动跑，要用户把内容确认完再点。
          跑起来之后这个位置换成「暂停/继续 + 停止」，视线不用移动。
        */}
        {narrationRunning ? (
          <>
            <Tooltip content={narrationPaused > 0 ? '接着跑剩下的页' : '暂停排队。正在合成的那几页会跑完'}>
              <Button
                size="sm"
                pill
                icon={narrationPaused > 0 ? 'Play' : 'Pause'}
                disabled={narrationPending}
                onClick={narrationPaused > 0 ? onNarrationResume : onNarrationPause}
              >
                {narrationPaused > 0 ? '继续' : '暂停'} {narrationDone}/{narrationTotal}
              </Button>
            </Tooltip>
            <Tooltip content="停掉排队与挂起的配音。已经合成好的页会保留">
              <Button size="sm" pill icon="Square" disabled={narrationPending} onClick={onNarrationStop}>
                停止配音
              </Button>
            </Tooltip>
          </>
        ) : (
          <Tooltip content="按每页讲稿合成语音，演示时逐页朗读">
            <Button
              size="sm"
              pill
              icon="Volume2"
              loading={narrationPending}
              disabled={!canAct}
              onClick={onNarration}
            >
              配音
            </Button>
          </Tooltip>
        )}
        <Button size="sm" pill icon="Share2" disabled={!canAct} onClick={onExport}>导出与分享</Button>
        {/*
          **在跑的时候只给「停止」，不给「再生成一次」**。两个并排会出现一个能点的
          「重新生成」和一个「停止」，用户第一反应是点重新生成——那会叠出第二条流
          （服务端会用生成锁挡住，但那一刻他已经在疑惑了）。生成按钮的位置直接换成停止，
          视线不用移动。
        */}
        {busy ? (
          <Tooltip content="停下当前的生成。已经生成好的页会保留，之后可以从没成功的那些页继续">
            <Button size="sm" pill icon="Square" onClick={onStop}>停止</Button>
          </Tooltip>
        ) : hideGenerate ? null : (
          <Tooltip content={generateCopy.hint}>
            <Button variant="primary" size="sm" pill icon="Sparkles" onClick={onGenerate}>
              {generateCopy.label}
            </Button>
          </Tooltip>
        )}
      </div>
    </header>
  );
}

/* ---------------- 状态栏 ---------------- */

/**
 * 状态栏常驻底部，把「现在处于什么状态」摆在那儿，不用去别处找。
 * 数字用等宽，翻页时不会左右跳。
 */
function StatusBar({
  index, total, ready, styleName, degraded, generating, progress,
}: {
  index: number; total: number; ready: number; styleName: string; degraded: number; generating: boolean;
  /** 现在在跑的那一页（挑等得最久的那个）。空闲时是 null */
  progress: PageProgress | null;
}) {
  /*
    等了多少秒是长任务里**唯一诚实的进度**：模型一次调用要几十秒，
    中间没有任何可报的阶段。没有这个数字，用户看到的就是一个转圈，
    分不出是慢还是死了。
  */
  const elapsed = useElapsed(progress?.at);
  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-[var(--border-subtle)] px-3 text-[11px] text-[var(--text-3)]">
      <span className="font-[var(--font-mono)] tabular-nums">页 {index} / {total}</span>
      <span className="font-[var(--font-mono)] tabular-nums">就绪 {ready}/{total}</span>
      {styleName && <span>风格 {styleName}</span>}
      {degraded > 0 && <span className="text-[var(--warning)]">{degraded} 页有降级</span>}
      <span className="ml-auto flex min-w-0 items-center gap-1.5">
        {generating ? (
          <>
            <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[var(--brand-500)]" />
            <span className="shrink-0">正在生成</span>
            {/*
              并发跑的时候「已完成 N 页」会卡住不动（落库按大纲顺序，一页卡住就全压着），
              所以这一句才是界面上唯一能证明「还在动」的东西。
            */}
            {progress && (
              <span className="truncate font-[var(--font-mono)] tabular-nums">
                · 第 {progress.index + 1} 页 · {progress.label}（已等 {elapsed} 秒）
              </span>
            )}
          </>
        ) : (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
            空闲
          </>
        )}
      </span>
    </footer>
  );
}

/**
 * 点「配音」弹出来的音色选择。
 *
 * **音色存在项目上，不是只影响这一次的参数**：它进了合成的缓存键，选完就决定了
 * 这一本演示的声音。所以这里写的值和左栏「项目需求」里那个是同一个字段。
 */
function NarrationVoiceDialog({
  open, onOpenChange, projectVoice, pending, onStart,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectVoice: string;
  pending: boolean;
  onStart: (voice: string) => void;
}) {
  const [voice, setVoice] = useState(projectVoice);

  // 每次打开重新同步：上一次可能选了没点「开始生成」就关掉了
  useEffect(() => {
    if (open) setVoice(projectVoice === '' ? DEFAULT_NARRATION_VOICE : projectVoice);
  }, [open, projectVoice]);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="生成整本配音"
      description="按每页讲稿合成语音，演示时逐页朗读"
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="primary" loading={pending} onClick={() => onStart(voice)}>
            开始生成
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <label className="text-[13px] font-medium text-[var(--text-2)]" htmlFor="narration-voice">
          音色
        </label>
        <select
          id="narration-voice"
          className="h-9 rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-0)] px-2.5 text-[13px] text-[var(--text-1)]"
          value={voice}
          onChange={(e) => setVoice(e.target.value)}
        >
          {NARRATION_VOICE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>{o.id} · {o.hint}</option>
          ))}
        </select>
        <p className="text-[12px] leading-relaxed text-[var(--text-3)]">
          换音色会让已经合成好的页失效，整本按新音色重来一遍。
        </p>
      </div>
    </Dialog>
  );
}
