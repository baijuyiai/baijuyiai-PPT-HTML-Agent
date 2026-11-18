import { Button, Icon, Progress } from '@lumen/ui';
import { duration, pageDesignStage } from './page-design-state.js';
import type { PageProgress } from './store.js';
import { useElapsed } from './use-elapsed.js';

/**
 * 「页面设计」那一屏顶上的状态条。
 *
 * ## 它解决的是哪一件事
 *
 * 用户的原话：「大纲与教案生成好后，在页面设计页，手动点击开始，才会进入到页面生成过程。
 * 页面生成的过程需要清晰的生成进度和状态」。
 *
 * 这一屏原先**没有任何一处说得出「整本现在跑到哪了」**：左栏那条汇总要滚到列表顶上才
 * 看得见，顶栏那颗状态药丸只写「生成中 12/18」，画布上只有当前这一页。十八页的书跑起来，
 * 用户切到别的页看画布，就再也找不到一个说全局的地方了。
 *
 * 所以状态条摆在**这一屏自己的顶上**，横跨三栏：不管左中右在看什么，它都在。
 * 它同时是这一屏**唯一**的开始入口——左栏底部那颗同名按钮与大纲表头那颗小图标都撤了，
 * 「在这一屏手动点开始」这句话才有一个明确的下手处。
 *
 * 五个状态各自的判据在 `page-design-state.ts` 里（纯函数，有测试）。
 */
export function PageDesignBar({
  outlineCount, lessonsMissing, readyCount, failedCount, generating, live, roundStartedAt, onStart, onGoOutline,
}: {
  outlineCount: number;
  /** 大纲里有几条还没写教案。**只提示不拦**——页面生成读的是大纲，教案缺了也能生成 */
  lessonsMissing: number;
  readyCount: number;
  failedCount: number;
  generating: boolean;
  /** 服务端登记的「正在写」那几页，按大纲下标 */
  live: PageProgress[];
  /**
   * 整本这一轮是什么时候点起来的，用来算「本轮已跑 N 分」。
   *
   * **不跟着连接走**：刷新回来时它从 0 重新数。这是诚实的——客户端确实不知道上一轮
   * 是什么时候开始的（服务端只逐页登记了开始时刻）。所以文案写「本轮」而不是「总共」。
   */
  roundStartedAt: number | null;
  onStart: () => void;
  /** 没有大纲时那一颗：切到「大纲与教案」去写 */
  onGoOutline: () => void;
}) {
  const liveCount = live.length;
  const stage = pageDesignStage({ outlineCount, readyCount, failedCount, generating, liveCount });
  const landed = readyCount + failedCount;

  /**
   * 整套流程里唯一诚实的两个读数：落地了几页、正在写的那页等了多久。
   * 模型一次调用出整页，中间没有可报的阶段——所以这里**不编阶段名**。
   */
  const waited = useElapsed(live.length > 0 ? Math.min(...live.map((p) => p.at)) : undefined);
  const round = useElapsed(roundStartedAt ?? undefined);

  const liveText = liveCount === 0 ? ''
    : liveCount === 1 ? `第 ${live[0]!.index + 1} 页正在写`
      : `第 ${live[0]!.index + 1} 页起 ${liveCount} 页正在写`;
  const latest = live.length > 0 ? live[live.length - 1]!.label : '';

  /*
    `data-lumen-page-design-bar` 是给探针的抓手。这条状态条上的字是**整屏里唯一说得清楚
    「整本跑到哪」的地方**，而它每个状态长得都不一样——探针按文案找、或按「第几个子元素」
    找，状态一变就会找错，实测踩过（`span.font-[var(--font-mono)]` 那种选择器根本不是合法 CSS）。
    `data-stage` 顺带把五态之一写进 DOM，探针不必从文字反推。
  */
  return (
    <div
      data-lumen-page-design-bar
      data-stage={stage}
      className="flex h-11 shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] bg-[var(--surface-0)] px-3"
    >
      {stage === 'no-outline' && (
        <>
          <Icon name="CircleAlert" size={16} className="shrink-0 text-[var(--text-3)]" />
          <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-2)]">
            还没有大纲，没有可生成的东西。先到「大纲与教案」里写清内容与页数，把大纲和教案跑出来。
          </span>
          <Button size="sm" pill icon="ArrowLeft" onClick={onGoOutline}>去写大纲与教案</Button>
        </>
      )}

      {stage === 'idle' && (
        <>
          <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-[var(--text-1)]">
            <Icon name="Rocket" size={16} className="text-[var(--text-3)]" />
            还没开始生成
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-3)]">
            大纲与教案已就绪，{outlineCount} 页待生成。点「开始生成」逐页出图，一页几十秒；中途可以随时停。
            {lessonsMissing > 0 && `（其中 ${lessonsMissing} 页还没写教案）`}
          </span>
          <Button variant="primary" size="sm" pill icon="Sparkles" onClick={onStart}>
            开始生成 {outlineCount} 页
          </Button>
        </>
      )}

      {stage === 'running' && (
        <>
          <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-[var(--text-1)]">
            {/* 会动的那个点：一屏数字全静止时，它是「还活着」的唯一凭据 */}
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--warning)]" />
            {generating ? '正在生成页面' : '正在生成这一页'}
          </span>

          <div className="flex w-[240px] shrink-0 items-center gap-2">
            <div className="min-w-0 flex-1">
              <Progress
                value={outlineCount > 0 ? landed / outlineCount : 0}
                trackClassName="bg-[var(--border)]"
              />
            </div>
            <span className="shrink-0 font-[var(--font-mono)] text-[11px] tabular-nums text-[var(--text-2)]">
              {landed}/{outlineCount}
            </span>
          </div>

          <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-2)]">
            {liveText}
            {liveText && latest ? ` · ${latest}` : ''}
            {liveCount > 0 ? ` · 已等 ${waited} 秒` : ''}
          </span>

          {failedCount > 0 && (
            <span className="shrink-0 text-[11px] text-[var(--error)]">{failedCount} 页失败</span>
          )}
          {generating && (
            <span className="shrink-0 font-[var(--font-mono)] text-[11px] tabular-nums text-[var(--text-3)]">
              本轮 {duration(round)}
            </span>
          )}
        </>
      )}

      {stage === 'partial' && (
        <>
          <Icon name="CirclePause" size={16} className="shrink-0 text-[var(--text-3)]" />
          <span className="shrink-0 font-[var(--font-mono)] text-[11px] tabular-nums text-[var(--text-2)]">
            {readyCount}/{outlineCount}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-3)]">
            已生成 {readyCount} 页
            {failedCount > 0 ? `，${failedCount} 页没成功` : ''}
            {outlineCount - landed > 0 ? `，还有 ${outlineCount - landed} 页没出来` : ''}。接着往下跑只补缺的，已经好的不会重做。
          </span>
          {/*
            **给的是「继续」不是「重新生成」。** 顶栏那颗按钮在「有缺页」时走的是续跑，
            但它的位置与文案会随 `generateMode` 变；这一屏要的是一个语义恒定、说得出
            这一次会发生什么的下手处。
          */}
          <Button variant="primary" size="sm" pill icon="Sparkles" onClick={onStart}>
            继续生成 {outlineCount - readyCount} 页
          </Button>
        </>
      )}

      {stage === 'done' && (
        <>
          <Icon name="CircleCheck" size={16} className="shrink-0 text-[var(--success)]" />
          <span className="shrink-0 text-[12px] font-medium text-[var(--text-1)]">
            {outlineCount} 页全部生成完成
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--text-3)]">
            在画布上改内容、换排版，或到右栏写讲稿锚点。
          </span>
        </>
      )}
    </div>
  );
}
