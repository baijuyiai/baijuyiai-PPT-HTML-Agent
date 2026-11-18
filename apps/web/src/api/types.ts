import type {
  AudienceTag, BrandFields, DeckDepth, IntentResult, MeasuredPage, OutlinePage, PageIR, PageType,
  ProjectStatus, Quota, SceneTag, StyleDoc, StylePalette, StylePack, StyleSpec, TaskKind, TaskStatus,
  AvatarMode, StudioLayout, StudioModuleId } from '@lumen/ir-schema';

export type {
  OutlinePage, PageIR, StyleDoc, StylePalette, StylePack, PageType, AudienceTag, SceneTag,
  ProjectStatus, Quota, AvatarMode, DeckDepth, StudioLayout, StudioModuleId };

/**
 * 项目行在接口上的样子。
 *
 * **五个品牌列从 `BrandFields` 继承，不在这里重抄一遍**：那五个字段是
 * `brandOf(project)` 的入参类型，重抄一份就会多出一处会漂的定义——而漂掉的表现是
 * 「编辑器里页眉没有 logo」，接口与日志都不说话。接口回的确实是完整的一行
 * （`withProgress` 是 `{ ...row, … }`），所以这里继承得来的是真值。
 */
export interface ProjectSummary extends BrandFields {
  projectId: string;
  title: string;
  brief: string;
  audienceTag: AudienceTag;
  scene: SceneTag;
  styleId: string | null;
  status: ProjectStatus;
  totalPages: number;
  readyPages: number;
  failedPages: number;
  thumbnailKey: string;
  avatarEnabled: boolean;
  /** 大纲的思考层级 */
  depth: DeckDepth;
  /** 目标页数。null = 由内容决定 */
  targetPages: number | null;
  /** 讲解音色。**null = 沿用后台的全局设置**（没单独选过） */
  narrationVoice: string | null;
  /** 讲解语气。null = 沿用全局；空串是合法值，表示「不加语气提示」 */
  narrationTone: string | null;
  /** 生成页面时顺带出讲稿 */
  narrationScriptEnabled: boolean;
  /** 图表视觉风格。取值见 `@lumen/charts` 的 `CHART_STYLE_IDS` */
  chartStyle: string;
  progressText: string;
  shareCount?: number;
  createdAt: number;
  updatedAt: number;
}

export interface PageEntry {
  pageId: string;
  pageIndex: number;
  status: 'pending' | 'generating' | 'ready' | 'failed';
  version: number;
  page: PageIR;
}

/**
 * 项目当前挂的风格。两种形态并存：新链路的风格文档（`doc`，页面走 iframe）
 * 与旧风格包（`pack`，页面走 `@lumen/slides` 的几何排版）。
 *
 * 做成判别联合而不是「两个可选字段」：调用方必须处理两种，
 * 漏掉一种不会退化成「拿不到就少渲染一点」，而是整块画布空白。
 */
export type ProjectStyle =
  | { kind: 'pack'; styleId: string; name: string; pack: StylePack }
  | { kind: 'doc'; styleId: string; name: string; doc: StyleDoc };

export interface ProjectDetail {
  project: ProjectSummary;
  pages: PageEntry[];
  outline: OutlinePage[];
  intent: IntentResult;
  style: ProjectStyle | null;
}

export interface StyleSummary {
  styleId: string;
  family: string;
  version: string;
  name: string;
  description: string;
  audienceFit: AudienceTag[];
  toneKeywords: string[];
  builtin: boolean;
  reviewed: boolean;
  /** 内置包被改过。改过的包不会再被代码里的真值覆盖，也可以一键恢复默认 */
  customized: boolean;
  examples: string[];
  updatedAt: number;
}

/**
 * 可选风格。来自**风格库**（`GET /projects/style-suggestions` 回的是 StyleDoc 列表项），
 * 不是代码里写死的旧风格包。
 *
 * 没有 `family` / `toneKeywords` 那套元数据——新库不按人群算推荐，
 * 库里就五六套，把封面样机摆出来让人直接挑比算一个推荐值诚实。
 * `previewHtml` 是模型真跑出来的样机片段，卡片直接渲染它。
 */
export interface StyleChoice {
  styleId: string;
  name: string;
  description: string;
  theme: 'light' | 'dark';
  palette: StylePalette;
  fontFamily: string;
  /** 三个字体角色里的另外两个。卡片要渲染 `previewHtml`，少一个预览就和真页不一样 */
  fontDisplay: string;
  fontScript: string;
  /**
   * 第四个角色：数字字体。**识别阶段从参考图里读出来的那一档**，空串是常态。
   *
   * 与另外三个不同的是它还有个更优先的落点——`spec.fonts.numeric`，也就是用户在
   * 界面上点选的那一档。见 `fontStacksOf` 的三级回落。
   */
  fontNumeric: string;
  /**
   * 视觉规范。**卡片也要带上**：四个字体角色的选择在 `spec.fonts` 里，
   * `fontStacksOf` 拿它盖过上面那三套栈。不带的话详情页切了字体、卡片上还是旧的。
   */
  spec: StyleSpec | null;
  pageTypes: PageType[];
  /** 已经出了样机的页类型数。为 0 说明这套风格还是空壳 */
  mockedCount: number;
  /** 卡片上的预览样机，最多三张 */
  previewHtml: string[];
}

export interface RecognizeResult {
  source: 'url' | 'images' | 'text';
  confidence: number;
  stylePack: StylePack;
  pendingConfirm: { field: string; question: string; candidates: string[]; resolved: string }[];
  conflicts: { field: string; values: string[]; winner: string; reason: string }[];
  /** 从每张设计稿上量出来的页。界面据此做「原图 ↔ 重绘样机」并排与页类型改写 */
  measuredPages: MeasuredPage[];
}

export interface TaskSummary {
  taskId: string;
  tenantId: string;
  projectId: string | null;
  pageId: string | null;
  kind: TaskKind;
  status: TaskStatus;
  attempts: number;
  maxAttempts: number;
  error: string;
  degradeReason: string;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface QueueStats {
  queued: number;
  running: number;
  dead: number;
  byKind: {
    kind: TaskKind;
    total: number;
    succeeded: number;
    failed: number;
    dead: number;
    successRate: number;
    p95Ms: number;
    degraded: number;
  }[];
}

export interface ExportJobSummary {
  exportId: string;
  projectId: string;
  format: 'pdf' | 'pptx' | 'pptx-editable' | 'html' | 'mp4';
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  progress: number;
  artifactKey: string;
  /** 可直接下载的地址 */
  artifactUrl: string;
  pageCount: number;
  error: string;
  createdAt: number;
  finishedAt: number | null;
}

export interface ShareSummary {
  shareId: string;
  token: string;
  projectId: string;
  expiresAt: number;
  revoked: boolean;
  viewCount: number;
  createdAt: number;
  url?: string;
}

export interface PublicShare {
  title: string;
  styleId: string | null;
  expiresAt: number;
  pages: PageIR[];
}

export const SCENE_OPTIONS: { value: SceneTag; label: string }[] = [
  { value: 'pitch', label: '融资路演' },
  { value: 'strategy', label: '战略发布' },
  { value: 'annual', label: '年会演讲' },
  { value: 'academic', label: '学术汇报' },
  { value: 'defense', label: '课题答辩' },
  { value: 'board', label: '董事会汇报' },
  { value: 'review', label: '经营分析' },
  { value: 'tech', label: '技术方案与架构评审' },
  { value: 'brand', label: '品牌提案与视觉汇报' },
  { value: 'general', label: '通用' },
];

export const AUDIENCE_OPTIONS: { value: AudienceTag; label: string }[] = [
  { value: 'executive', label: '企业高管' },
  { value: 'founder', label: '老板与创始人' },
  { value: 'scholar', label: '学者与研究人员' },
  { value: 'tech-lead', label: '技术总监与架构师' },
  { value: 'brand', label: '品牌与设计负责人' },
  { value: 'general', label: '通用' },
];

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: '草稿',
  generating: '生成中',
  completed: '已完成',
  failed: '失败',
};

export const TASK_KIND_LABEL: Record<TaskKind, string> = {
  page_generate: '页级生成',
  image_generate: '图片生成',
  script_generate: '讲稿生成',
  tts: '语音合成',
  export_pdf: '导出 PDF',
  export_pptx: '导出 PPTX',
  export_html: '导出 HTML',
  video_render: '视频渲染',
  avatar_render: '数字人合成',
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  queued: '排队中',
  running: '执行中',
  succeeded: '已完成',
  failed: '失败待重试',
  dead: '已进入死信',
  paused: '已暂停',
};

export function formatTime(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function relativeTime(ts: number): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)} 天前`;
  return formatTime(ts);
}
