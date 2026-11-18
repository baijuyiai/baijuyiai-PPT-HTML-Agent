/**
 * SSE 分步进度的负载形状。服务端 `yield` 出来的 `data`、前端 `streamSse` 的 `onEvent`
 * 收到的 `data`，都是它。
 *
 * 放在共用包里、两端引同一份声明，而不是各写各的：这个字段曾经服务端叫 `step`、
 * 前端被写成 `key`，而 `setProgress(data as Progress)` 是裸强转、TS 查不出来——
 * 运行时 `progress.key` 恒为 undefined，五个阶段徽标一个都不亮，一轮识别三五分钟
 * 全程没有任何进度反馈。字段名对不上的口子必须从类型上堵死。
 *
 * 各流程的阶段名也一并放这里：前端要按同一个顺序把阶段摆出来，名字对不上就白摆。
 */

/** 一次进度事件的负载。`step` 的取值是各流程自己的阶段名，见下方各常量 */
export interface ProgressPayload<S extends string = string> {
  step: S;
  /** 给用户看的一句话，如「已读 3/9 页」 */
  label: string;
  done: number;
  total: number;
}

/** 识别风格（`/styles/recognize-doc/stream`）的五个阶段，顺序即执行顺序 */
export const RECOGNIZE_STEPS = ['split', 'read', 'synth', 'derive', 'mock'] as const;
export type RecognizeStep = (typeof RECOGNIZE_STEPS)[number];

/**
 * 从一张参考图识别一份版式骨架（`/studio/layouts/recognize-stream`）的两步。
 *
 * **只有两步，重试不额外加一步。** 骨架不合规时会让模型带着问题重写一版，
 * 但那一次**仍然报 `check`**、只换 label——阶段序必须单调前进，
 * 报成 `read → check → read` 的话 `StepList` 的徽标会往回退，看着像卡住又重来。
 */
export const LAYOUT_RECOGNIZE_STEPS = ['read', 'check'] as const;
export type LayoutRecognizeStep = (typeof LAYOUT_RECOGNIZE_STEPS)[number];

/** 给已存风格补齐缺失页类型（`/styles/docs/:styleId/fill-missing/stream`）的两步 */
export const FILL_MISSING_STEPS = ['derive', 'mock'] as const;
export type FillMissingStep = (typeof FILL_MISSING_STEPS)[number];

/** 单页重识别（`/styles/docs/:styleId/pages/:pageType/recognize-stream`）的三步 */
export const REDRAW_STEPS = ['crop', 'read', 'mock'] as const;
export type RedrawStep = (typeof REDRAW_STEPS)[number];

/**
 * 一键统一风格（`/styles/docs/:styleId/unify/stream`）的四步。
 *
 * 顺序即执行顺序：先提炼规范，再照规范改写各页提示词，然后重出样机，
 * 最后比对规范做一次自检——自检必须在重出样机**之后**，它查的是产物不是提示词。
 */
export const UNIFY_STEPS = ['spec', 'rewrite', 'mock', 'check'] as const;
export type UnifyStep = (typeof UNIFY_STEPS)[number];

/**
 * 三段内容链路的前两段（`plan/outline/stream` 与 `plan/lessons/stream`）。
 *
 * 第三段「出页面」不在这里——它走已有的 `generate/stream`，那一条早就在跑。
 * 这里只放新加的两步，前端按这个顺序把阶段摆出来。
 */
export const PLAN_STEPS = ['outline', 'lessons'] as const;
export type PlanStep = (typeof PLAN_STEPS)[number];
