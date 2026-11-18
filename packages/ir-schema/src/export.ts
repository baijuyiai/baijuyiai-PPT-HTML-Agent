import { z } from 'zod';

/** 导出格式（PRD §5.8） */
export const ExportFormat = z.enum([
  'pdf',
  'pptx',           // 逐页截图铺满，视觉 100% 还原，文字不可编辑
  'pptx-editable',  // 默认：从渲染后的 DOM 抽文字，截图铺底 + 真文本框，可编辑
  'html',           // 单文件自包含
  'mp4',            // 服务端视频
]);
export type ExportFormat = z.infer<typeof ExportFormat>;

export const ExportStatus = z.enum(['queued', 'running', 'succeeded', 'failed']);
export type ExportStatus = z.infer<typeof ExportStatus>;

export const ExportJob = z.object({
  exportId: z.string(),
  tenantId: z.string(),
  projectId: z.string(),
  format: ExportFormat,
  status: ExportStatus.default('queued'),
  progress: z.number().min(0).max(1).default(0),
  /** 对象存储中的 key */
  artifactKey: z.string().default(''),
  /** 可直接下载的地址，由服务端根据 artifactKey 派生 */
  artifactUrl: z.string().default(''),
  /** 页数与 deck 是否一致，导出后回填 */
  pageCount: z.number().int().default(0),
  error: z.string().default(''),
  createdAt: z.number().int(),
  finishedAt: z.number().int().nullable().default(null),
});
export type ExportJob = z.infer<typeof ExportJob>;

/** 导出面板对用户的明确提示（PRD §5.8 截图版文字不可编辑） */
export const EXPORT_NOTES: Record<ExportFormat, string> = {
  pdf: '按页面逐页渲染，与网页视觉一致。',
  pptx: '逐页截图铺满，视觉 100% 还原，但文字不可编辑。要改内容请用可编辑版。',
  'pptx-editable': '文字可编辑：背景是截图，文字是真文本框。字体在打开端缺失时会被替换，复杂排版可能错位。',
  html: '单文件自包含，可离线演示，也可在微信内置浏览器打开。',
  // 当前版本未实现，如实告知而不是让用户等一个永远不来的产物
  mp4: '尚未实现：视频渲染需要 Remotion 分段渲染链路，当前版本会明确报错而不是产出半成品。',
};

/** 分享链接（PRD §5.7） */
export const Share = z.object({
  shareId: z.string(),
  token: z.string(),
  tenantId: z.string(),
  projectId: z.string(),
  createdBy: z.string(),
  /** 0 表示不过期 */
  expiresAt: z.number().int().default(0),
  revoked: z.boolean().default(false),
  viewCount: z.number().int().default(0),
  createdAt: z.number().int(),
});
export type Share = z.infer<typeof Share>;

export const SharePublic = z.object({
  token: z.string(),
  title: z.string(),
  pageCount: z.number().int().default(0),
  expiresAt: z.number().int().default(0),
});
export type SharePublic = z.infer<typeof SharePublic>;
