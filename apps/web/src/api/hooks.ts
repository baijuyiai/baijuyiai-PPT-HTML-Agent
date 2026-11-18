import { useQuery } from '@tanstack/react-query';
import { api } from './client.js';
import type { StudioLayout, StudioModuleId, StyleDoc } from './types.js';

/**
 * 取一套新链路的风格（每页一条 HTML 生成提示词 + 样机）。
 *
 * 页面渲染要用它：`buildPageDocument` 需要配色与字体栈才能把模型给的 HTML 片段
 * 装配成完整文档。**不把 StyleDoc 从父组件一路透传**——画布在四五个层级之下，
 * 透传会让中间每个组件都被迫知道风格的存在；这里按 styleId 取，命中同一份缓存。
 */
export function useStyleDoc(styleId: string | null) {
  return useQuery({
    queryKey: ['style-doc', styleId],
    queryFn: () => api.get<StyleDoc>(`/styles/docs/${encodeURIComponent(styleId!)}`),
    enabled: Boolean(styleId),
    staleTime: 5 * 60_000,
  });
}

/**
 * 一个版式库的取数配置。抽出来是为了 `useQueries`——工作台在「这一页没有专属
 * 版式库」时要**一次拉四个库**（见 `usePageLayouts`），而 `useQueries` 收的是
 * 配置对象数组、不是 hook。不抽的话查询键与 `staleTime` 会各写一份，迟早漂。
 */
export const studioLayoutsQuery = (moduleId: StudioModuleId) => ({
  queryKey: ['studio-layouts', moduleId] as const,
  queryFn: () => api.get<{ items: StudioLayout[] }>(`/studio/layouts?module=${moduleId}`),
  // 自建骨架改一次就要立刻看到（保存完会 invalidate），但也不必每次挂载都重拉
  staleTime: 60_000,
});

/**
 * 一个版式库的全部骨架：**内置 + 自建合成一份**（内置在前）。
 *
 * 合并由服务端做，前端不再拼一遍——两边各拼一次，排序规则迟早对不上，
 * 而表现只是「刷新前后顺序变了」这种没人会去查的怪事。
 *
 * `moduleId` 为 null 时不发请求。
 */
export function useStudioLayouts(moduleId: StudioModuleId | null) {
  return useQuery({
    ...studioLayoutsQuery(moduleId ?? 'people-layouts'),
    // 键要如实跟着传进来的值走：不然被禁用的那一次会占住别的库的缓存键
    queryKey: ['studio-layouts', moduleId],
    enabled: Boolean(moduleId),
  });
}
