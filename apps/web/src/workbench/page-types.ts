import type { PageIR } from '../api/types.js';
import { PAGE_TYPE_LABEL, PAGE_TYPE_ORDER } from '@lumen/ir-schema';

/**
 * 页类型的中文名与图标。
 *
 * 单独一个文件而不是留在某个组件里：大纲列表与教案编辑器都要用，
 * 从组件里互相 import 会绕出一圈没必要的依赖。
 *
 * **中文名与顺序都从 `@lumen/ir-schema` 取，这里不另抄一份。**
 * 原先这里是手写的九个，漏了 `gallery` / `architecture` / `mindMap`——
 * 于是教案编辑器那个「页类型」下拉框里这三类根本选不到，而同一份数据在两个地方
 * 各写一遍，措辞也会漂（这边写「章节页」，`ir-schema` 那边写「转折页」）。
 */
export const PAGE_TYPE_OPTIONS: { value: PageIR['pageType']; label: string }[] =
  PAGE_TYPE_ORDER.map((t) => ({ value: t, label: PAGE_TYPE_LABEL[t] }));

export { PAGE_TYPE_LABEL };

export const PAGE_TYPE_ICON: Record<PageIR['pageType'], string> = {
  cover: 'Presentation',
  toc: 'ListOrdered',
  section: 'Bookmark',
  text: 'AlignLeft',
  imageText: 'Image',
  gallery: 'Images',
  // MonitorSmartphone：一台显示器配一部手机，正是「界面页」摆设备的那件事
  ui: 'MonitorSmartphone',
  people: 'Users',
  chart: 'ChartColumn',
  // Network：节点加连线的图，正好对应「分层方块 + 带箭头连线」的架构图
  architecture: 'Network',
  // Waypoints：一个中心向外的分叉节点，对应思维导图的发散结构
  mindMap: 'Waypoints',
  metrics: 'Hash',
  end: 'Flag',
};
