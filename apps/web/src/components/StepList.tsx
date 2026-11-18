import { Icon, Progress } from '@lumen/ui';
import { stepState } from './step-progress.js';

/**
 * 一屏分步进度：在跑的那一步转圈，跑完的打勾，还没跑的是空心圈。
 *
 * 抽出来是因为识别风格与单页重识别要显示的是**同一件事**，而各写一份的代价已经付过一次：
 * 识别那边第一版把「在跑」与「跑完」都算成了 false，几个徽标一个都不亮，一轮三五分钟
 * 全程没有任何反馈。判定本身在 `step-progress.ts`（可以单测），这里只负责画。
 *
 * 在跑的那一步显示服务端给的实时说明（「已读 3/9 页」）而不是阶段名——阶段名是死的，
 * 说明里带着进度，用户据此才知道这一轮走到哪了。
 */
export interface StepSpec<K extends string> {
  key: K;
  label: string;
}

export function StepList<K extends string>({
  steps, current, liveLabel, progress, footer,
}: {
  steps: readonly StepSpec<K>[];
  /** 服务端报的当前阶段。还没收到第一个进度事件时是空的，也可能是顺序表里没有的名字 */
  current: string | null | undefined;
  /** 在跑的那一步的实时说明。不给就退回阶段名 */
  liveLabel?: string | null | undefined;
  /**
   * 在跑那一步的**确定**进度（服务端报的已完成 / 总数）。
   *
   * `total > 1` 才画条。提纲那一段报的是 `0/1 → 1/1`，画出来是一条几乎全程空着的槽，
   * 看着像卡住了；只有教案那一段是真的按页推进，那个数字才值得画成条。
   */
  progress?: { done: number; total: number } | null | undefined;
  /** 列表下面的一句话，用来交代这一轮大概要多久 */
  footer?: string | undefined;
}) {
  const order = steps.map((s) => s.key);
  const bar = progress && progress.total > 1 ? progress : null;
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-card)] bg-[var(--surface-1)] px-4 py-3">
      {steps.map((s) => {
        const state = stepState(order, s.key, current);
        const active = state === 'active';
        const passed = state === 'passed';
        return (
          <div key={s.key} className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5 text-[13px]">
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
                {active && liveLabel ? liveLabel : s.label}
              </span>
            </div>
            {/*
              进度条缩进到文字那一列下面（16 图标 + 10 间距），不顶到卡片左边。
              轨道换成 `--border`：这张卡自己就是 `--surface-1`，同色轨道等于没画。
            */}
            {active && bar && (
              <div className="pl-[26px]">
                <Progress value={bar.done / bar.total} trackClassName="bg-[var(--border)]" />
              </div>
            )}
          </div>
        );
      })}
      {footer && <p className="text-[12px] text-[var(--text-3)]">{footer}</p>}
    </div>
  );
}
