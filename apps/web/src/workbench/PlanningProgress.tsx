import { useState } from 'react';
import { Icon } from '@lumen/ui';
import type { PlanStep } from '@lumen/ir-schema';
import { StepList, type StepSpec } from '../components/StepList.js';
import { useElapsed } from './use-elapsed.js';
import type { PlanProgress } from './store.js';

const PLAN_STEP_SPECS: readonly StepSpec<PlanStep>[] = [
  { key: 'outline', label: '生成提纲' },
  { key: 'lessons', label: '生成教案' },
];

/**
 * 「这一本正在被思考」那一屏。
 *
 * ## 为什么要占满中栏
 *
 * 从「项目需求」点下去之后跑的是两段模型调用（先重排提纲、再逐页写教案），
 * 实测一轮几分钟。原先中栏什么都不动：提纲还没落库，教案面板直接走「还没有提纲」
 * 那个静态占位；大纲那一栏写着「共 0 页」。用户点完按钮，整屏只有顶栏一个「停止」，
 * **看不出是在跑还是点空了**——反馈原话就是「项目的进度状态不明显」。
 *
 * 所以这一屏要同时回答三件事：**在跑**（中间那个呼吸的环）、**跑到哪一步**
 * （两步清单，在跑的那步转圈）、**还要多久**（已等 N 秒 —— 模型那边给不出阶段时，
 * 这个数字是唯一诚实的进度）。
 *
 * 用 `StepList` 而不是另画一套：识别风格、单页重识别那边显示的是同一件事，
 * 各写一份的代价这个仓库已经付过一次（见 `StepList` 顶部注释）。
 *
 * 减弱动效由 `@lumen/ui` 的全局 `prefers-reduced-motion` 兜底，这里不另判——
 * 环停下之后「已等 N 秒」照样在走，信息不丢。
 */
export function PlanningProgress({
  step, label, progress, title, hint,
}: {
  /** 正在跑哪一段。收到第一个进度事件前用它兜底 */
  step: PlanStep | null;
  /** 服务端报的实时说明（「骨架 13 页，正在让模型深入思考」） */
  label: string | null;
  progress: PlanProgress | null;
  title?: string;
  hint?: string;
}) {
  // 挂载那一刻就是这一轮的开始。链式跑（提纲→教案）中间不卸载，所以计的是总时长
  const [startedAt] = useState(() => Date.now());
  const elapsed = useElapsed(startedAt);

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-6 px-8 py-10">
      <span aria-hidden className="relative block h-[124px] w-[124px]">
        {/* 外圈：一层呼吸的柔光，让「在动」这件事在余光里也看得见 */}
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background: 'radial-gradient(closest-side, color-mix(in srgb, var(--brand-500) 38%, transparent), transparent 74%)',
            animation: 'lumen-skeleton 2.6s ease-in-out infinite',
          }}
        />
        <span className="absolute inset-[28px] rounded-full border border-[var(--border)]" />
        {/* 内圈：一道匀速转的弧。用 border-t 而不是 conic-gradient——后者在深色底上会看到色带 */}
        <span
          className="absolute inset-[28px] animate-spin rounded-full border-2 border-transparent border-t-[var(--brand-500)]"
          style={{ animationDuration: '2.4s' }}
        />
        <Icon name="Sparkles" size={24} className="absolute inset-0 m-auto text-[var(--text-2)]" />
      </span>

      <div className="flex flex-col items-center gap-1.5 text-center">
        <span className="text-[16px] font-semibold text-[var(--text-1)]">
          {title ?? '正在思考这一本的骨架与教案'}
        </span>
        <span className="max-w-[420px] text-[13px] text-[var(--text-3)]">
          {label || '正在准备'}
        </span>
      </div>

      <div className="w-full max-w-[420px]">
        <StepList
          steps={PLAN_STEP_SPECS}
          current={progress?.step ?? step}
          liveLabel={label}
          progress={progress}
          footer={`已等 ${elapsed} 秒${hint ? ` · ${hint}` : ''}`}
        />
      </div>
    </div>
  );
}
