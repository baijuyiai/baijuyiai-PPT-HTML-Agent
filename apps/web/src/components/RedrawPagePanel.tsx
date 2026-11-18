import { useEffect, useRef, useState } from 'react';
import { Button, Icon, useToast } from '@lumen/ui';
import { PAGE_TYPE_LABEL, type PageType, type ProgressPayload, type RedrawStep } from '@lumen/ir-schema';
import { api, streamSse } from '../api/client.js';
import type { StyleDoc } from '../api/types.js';
import { uploadReferenceImages } from '../studio/upload.js';
import { HtmlMock } from './HtmlMock.js';
import { StepList } from './StepList.js';

/**
 * 单页重识别：上传参考图 → 挑一页 → 看新旧对比 → 确定替换。
 *
 * 三态共用一个面板而不是串三个弹框：一层表面就够，省掉嵌套遮罩与焦点陷阱。
 * 按下「确定替换」之前对服务端零副作用，所以中途关掉直接丢弃，不用二次确认。
 */

interface Slide {
  index: number;
  pageType: PageType;
  box: { x0: number; y0: number; x1: number; y1: number };
  /** 服务端标的兜底：模型一个框都没给出，这是「整张图当一页」推出来的那一页 */
  fallback?: true;
}

interface RedrawResult {
  prompt: string;
  mockHtml: string;
  issues: string[];
  /** `lintStylePrompt` 给出的契约问题，`done` 事件原样带出来。
   *  不是「缺了哪几个小节」——顺序错、写死 img src 也算 */
  promptIssues: { rule: string; message: string }[];
}

/** 三步，顺序即实际执行顺序。阶段名对着服务端的 `REDRAW_STEPS` 卡住 */
const STEPS = [
  { key: 'crop', label: '裁出这一页' },
  { key: 'read', label: '写提示词' },
  { key: 'mock', label: '出样机' },
] as const satisfies readonly { key: RedrawStep; label: string }[];

/**
 * 面板从头到尾的阶段：前两步在本地跑，后三步由服务端报。
 *
 * **合成一条线而不是分成两段显示**：用户要的是「现在到哪了」，上传与分页各转各的圈、
 * 之后才换成三个徽标，中间没有任何过渡，看上去像换了一个流程。合起来之后
 * 「已上传、正在找页、还没开始重识别」在一屏里就能读出来。
 */
const PANEL_STEPS = [
  { key: 'upload', label: '上传参考图' },
  { key: 'split', label: '找出每一页' },
  ...STEPS,
] as const;

type PanelStep = typeof PANEL_STEPS[number]['key'];

export function RedrawPagePanel({
  doc, pageType, current, onDone,
}: {
  doc: Pick<StyleDoc, 'styleId' | 'palette' | 'fontFamily' | 'fontDisplay' | 'fontScript' | 'fontNumeric' | 'theme' | 'spec'>;
  pageType: PageType;
  /** 当前的样机，用来做「旧 ↔ 新」对比 */
  current: string;
  onDone: () => void;
}) {
  const toast = useToast();
  /**
   * 上传与分页是两段各自十几秒的等待，提示语不一样（「正在上传」≠「正在找出每一页」），
   * 所以合成一个状态而不是两个布尔量——两个布尔量会出现「都真」这种没有意义的组合。
   */
  const [phase, setPhase] = useState<'idle' | 'uploading' | 'splitting'>('idle');
  const [image, setImage] = useState<string | null>(null);
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [running, setRunning] = useState(false);
  /**
   * 服务端报的进度。**存整份负载而不是只存阶段名**：在跑的那一步要显示服务端给的
   * 实时说明（「正在出样机」），只留阶段名的话只能显示本地写死的那句，与服务端脱节。
   */
  const [progress, setProgress] = useState<ProgressPayload<RedrawStep> | null>(null);
  const [result, setResult] = useState<RedrawResult | null>(null);
  const [openPrompt, setOpenPrompt] = useState(false);
  /** 这一次的框是兜底来的（模型一个都没给出，整张图当一页），不是模型真找出来的 */
  const [fallback, setFallback] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);

  /**
   * 面板被卸载时收掉在跑的流。
   *
   * 关掉抽屉这条路上没有「返回」可点，`reset()` 不会被调到；不在这里收，
   * 那条流会一直读到模型跑完——用户已经看不见它了，账单却照记。
   * 服务端那边正是靠客户端断开才停手的（`sse.closed`），所以断开这件事必须真发生。
   */
  useEffect(() => () => { abortRef.current?.(); }, []);

  async function onPickFile(files: File[] | null) {
    if (!files || files.length === 0) return;
    setResult(null);
    setSlides(null);
    setFallback(false);

    setPhase('uploading');
    let url: string;
    try {
      const [first] = await uploadReferenceImages([files[0]!]);
      url = first!;
    } catch (err) {
      // 上传与分页各用各的标题：两段合一个标题的话，「图没传上去」会被说成「分页失败」，
      // 用户照着这个方向排查会找错地方
      reset();
      toast.error('图片上传失败', err instanceof Error ? err.message : String(err));
      return;
    }

    setImage(url);
    setPhase('splitting');
    try {
      const r = await api.post<{ slides: Slide[] }>(
        `/styles/docs/${encodeURIComponent(doc.styleId)}/pages/${pageType}/slides`,
        { image: url },
      );
      // 恰好一页就不必让用户挑——**包括一页都没找出来**的情况：`splitSlides` 会把
      // 「模型一个框都没给出」兜底成整张图当一页，那也是长度 1。
      // 兜底的那一页带 `fallback`，要如实说，不能与「模型真找到了这一页」长得一样
      const [only] = r.slides;
      // 服务端今天的 `splitSlides` 一定兜底出一页，所以这里正常到不了。但那条兜底若被去掉，
      // 下面 `setSlides([])` 会渲染出「这张图里有 0 页，点你要的那一页」——一个框都没有的
      // 挑页态，用户无路可走（正是本分支早先修过的那种死胡同）。宁可当成失败：抛出去走下面
      // 统一的 catch，回到上传态，用户还能换张图重来
      if (!only) throw new Error('没能从这张图里找出任何一页');
      if (r.slides.length === 1) {
        setFallback(Boolean(only.fallback));
        // 显式把 url 传进去，不从 `image` 状态读：`setImage` 只是**排一次重渲染**，
        // 这个闭包里的 `image` 仍然是本次渲染开始时的 null（用户刚选完文件的那一帧）。
        // 从状态读的话，单页导出这条最常走的路上 `start` 会静默 return，面板一动不动
        start(only, url);
      } else {
        setSlides(r.slides);
      }
    } catch (err) {
      // 回上传态而不是留在「有图、但没得挑」的中间态：那个态下面板正文是空的，
      // 用户只剩「返回风格详情」一条路——想换张图重试就得先退出去再进来
      reset();
      toast.error('分页失败', err instanceof Error ? err.message : String(err));
    } finally {
      setPhase('idle');
    }
  }

  /**
   * `src` 必须由调用方传进来，不能读 `image` 状态——理由见 `onPickFile` 里的注释。
   * 挑页那条路传的是状态里的 `image`，到那时它已经是正确的值了。
   */
  function start(slide: Slide, src: string) {
    if (!src) return;
    setSlides(null);
    setRunning(true);
    setResult(null);
    const qs = new URLSearchParams({
      image: src,
      x0: String(slide.box.x0), y0: String(slide.box.y0),
      x1: String(slide.box.x1), y1: String(slide.box.y1),
    });
    abortRef.current = streamSse(
      `/styles/docs/${encodeURIComponent(doc.styleId)}/pages/${pageType}/recognize-stream?${qs}`,
      {
        onEvent: (event, data) => {
          if (event === 'progress') {
            setProgress(data as ProgressPayload<RedrawStep>);
          } else if (event === 'done') {
            setResult(data as RedrawResult);
            setRunning(false);
            setProgress(null);
            // 流已经结束，别让 abortRef 继续指着它——卸载时再调一次虽然无害，但那是悬空引用
            abortRef.current = null;
          } else if (event === 'error') {
            // 同 onPickFile 的失败分支：留在「有图、但没得挑」的中间态等于把面板掏空
            reset();
            toast.error('重识别失败', (data as { message: string }).message);
          }
        },
        onError: (err) => {
          reset();
          toast.error('重识别中断', err.message);
        },
      },
    );
  }

  async function confirm() {
    if (!result) return;
    try {
      const r = await api.put<{ issues: { pageType: string; message: string }[] }>(
        `/styles/docs/${encodeURIComponent(doc.styleId)}/pages/${pageType}`,
        /*
          整页重来，所以**顺手解绑**：这一页原来若绑着某份骨架（风格库的「换默认版式」），
          留着它就会与这份新提示词打架——生成时按骨架排，而这里刚识别出来的版面是另一套。
          空串 = 解绑，见 `ReplaceInput.layoutId`。
        */
        { prompt: result.prompt, mockHtml: result.mockHtml, layoutId: '' },
      );
      toast.success('已替换', PAGE_TYPE_LABEL[pageType]);
      // 服务端把这一页的契约问题带出来了（缺小节 / 顺序错 / 写死 img src）。它不阻断保存，
      // 但界面得如实说——丢掉这个响应体，这条提示词的问题从重试到落库就没有一个环节会露面。
      // 与 `promptIssues` 可能重叠，但那是「这次生成时」的，这是「落库时」的，口径不同
      if (r.issues.length > 0) {
        toast.info('存了，不过这条提示词缺了几段', r.issues.map((i) => i.message).join('；'));
      }
      onDone();
    } catch (err) {
      toast.error('替换失败', err instanceof Error ? err.message : String(err));
    }
  }

  function reset() {
    abortRef.current?.();
    abortRef.current = null;
    setPhase('idle');
    setImage(null);
    setSlides(null);
    setResult(null);
    setRunning(false);
    setProgress(null);
    setFallback(false);
    // 展开状态也要清：不清的话，结果态展开过提示词、点「取消」回到上传态，再出一次结果时
    // 提示词会自己弹开——用户没点过它
    setOpenPrompt(false);
  }

  /** 一次识别从上传到出样机全程都在途。用它同时决定显示哪些块 */
  const inFlight = phase !== 'idle' || running;
  /**
   * 进度条上「在跑的那一步」。
   *
   * 重识别刚起步、服务端第一个 progress 事件还没到时，先按 `crop` 算——它是这一路
   * 服务端契约（`REDRAW_STEPS`）里的第一步，`start()` 一发出去它就一定在跑。
   * 留成 null 的话那几秒整条进度全是空圈，看上去像卡住了，正是这一屏要解决的问题。
   */
  const currentStep: PanelStep | null =
    phase === 'uploading' ? 'upload'
      : phase === 'splitting' ? 'split'
        : running ? (progress?.step ?? 'crop')
          : null;

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      {/* 返回与页标题那一行在 `PageEditPanel` 里——两种编辑模式共用一行头部 */}

      {/* 一条线走完全程：上传、分页、重识别的三步。上传与分页各十几秒，
          重识别那三步里出样机最慢，所以整条进度必须一直在，不能只在上传时露一下 */}
      {inFlight && (
        <StepList
          steps={PANEL_STEPS}
          current={currentStep}
          liveLabel={progress?.label}
          footer="出样机最慢，通常要几分钟。关掉这个抽屉会中断这一轮。"
        />
      )}

      {!image && !inFlight && (
        <label className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-[var(--border)] px-6 py-10 text-center transition-colors hover:bg-[var(--surface-1)]">
          <Icon name="ImageUp" size={24} />
          <span className="text-[13px] text-[var(--text-2)]">点这里选一张参考图</span>
          <span className="text-[12px] text-[var(--text-3)]">
            只收一张。整页导出或拼图都行，拼图会让你挑其中一页
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              // 先拷成数组再清空 input 的值——`e.target.files` 是活的，置空 value 会把
              // 同一个 FileList 一起清掉。清空是为了回到上传态后还能再选**同一个文件**：
              // 不清的话部分浏览器不派发 change，用户看到的是「点了没反应」
              const picked = e.target.files ? Array.from(e.target.files) : null;
              e.target.value = '';
              void onPickFile(picked);
            }}
          />
        </label>
      )}

      {/* 上传完就把图显示出来，一直到出结果为止——用户刚传完，想看的就是自己那张图。
          分页在途时框还没来，只有图；分页完了叠上可点的框 */}
      {image && !result && (
        <div className="flex flex-col gap-2">
          {slides && (
            <span className="text-[13px] text-[var(--text-2)]">这张图里有 {slides.length} 页，点你要的那一页</span>
          )}
          <div className="relative w-full max-w-[640px] overflow-hidden rounded-[var(--radius-inner)] border border-[var(--border-subtle)]">
            <img src={image} alt="参考图" className="block w-full" />
            {/* 框上的页类型是**模型的判断**，只是提示这一块在原图里是什么，仅供参考：
                识别一律按面板的 `pageType` 跑，参与识别的只有框的位置。
                所以在「封面」编辑态里点一个标着「数据页」的框，仍然按封面识别——这正是用户要的 */}
            {slides?.map((s) => (
              <button
                key={s.index}
                type="button"
                onClick={() => start(s, image)}
                title={PAGE_TYPE_LABEL[s.pageType]}
                className="absolute border-2 border-[var(--brand)] bg-[var(--brand)]/10 transition-colors hover:bg-[var(--brand)]/25"
                style={{
                  left: `${s.box.x0 * 100}%`,
                  top: `${s.box.y0 * 100}%`,
                  width: `${(s.box.x1 - s.box.x0) * 100}%`,
                  height: `${(s.box.y1 - s.box.y0) * 100}%`,
                }}
              >
                <span className="absolute left-1 top-1 rounded-[4px] bg-[var(--brand)] px-1.5 py-0.5 text-[11px] text-white">
                  {PAGE_TYPE_LABEL[s.pageType]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 如实说：兜底与「模型真找到了这一页」的框逐位相同，只有服务端的 flag 分得开。
          范围只在这一处——两页以上说明模型确实给出了可用框，不可能走兜底 */}
      {fallback && (
        <span className="text-[12px] text-[var(--text-3)]">
          没能从这张图里找出幻灯片，已按整张图处理
        </span>
      )}

      {result && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] text-[var(--text-3)]">现在</span>
              <HtmlMock doc={doc} html={current} width={380} pageType={pageType} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] text-[var(--text-3)]">替换后</span>
              <HtmlMock doc={doc} html={result.mockHtml} width={380} pageType={pageType} />
            </div>
          </div>

          {result.promptIssues.length > 0 && (
            <span className="text-[12px] text-[var(--text-3)]">
              提示词有 {result.promptIssues.length} 处不合契约，仍可替换：
              {result.promptIssues.map((i) => i.message).join('；')}
            </span>
          )}
          {result.issues.length > 0 && (
            <span className="text-[12px] text-[var(--text-3)]">
              样机有 {result.issues.length} 处问题：{result.issues.slice(0, 2).join('；')}
            </span>
          )}

          <button
            type="button"
            className="self-start text-[12px] text-[var(--text-3)] underline-offset-2 hover:underline"
            onClick={() => setOpenPrompt((v) => !v)}
          >
            {openPrompt ? '收起提示词' : '看新提示词'}
          </button>
          {openPrompt && (
            <pre className="max-h-[240px] overflow-auto whitespace-pre-wrap rounded-[var(--radius-inner)] bg-[var(--surface-1)] px-3 py-2 text-[12px] leading-[1.7] text-[var(--text-2)]">
              {result.prompt}
            </pre>
          )}

          <div className="flex items-center gap-2">
            <Button pill variant="primary" onClick={() => void confirm()}>确定替换</Button>
            <Button pill variant="ghost" onClick={reset}>取消</Button>
            <span className="text-[12px] text-[var(--text-3)]">
              替换只影响之后新生成的页面，已经生成的页面不会跟着变
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
