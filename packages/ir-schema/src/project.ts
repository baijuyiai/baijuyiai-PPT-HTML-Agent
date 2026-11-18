import { z } from 'zod';
import { AudienceTag } from './deck.js';

/** 项目状态徽章（PRD §5.6：草稿/生成中 x/y/已完成/失败） */
export const ProjectStatus = z.enum(['draft', 'generating', 'completed', 'failed']);
export type ProjectStatus = z.infer<typeof ProjectStatus>;

/** 常见使用场景，用于新建项目时的风格推荐 */
export const SceneTag = z.enum([
  'pitch',      // 融资路演
  'strategy',   // 战略发布
  'annual',     // 年会演讲
  'academic',   // 学术汇报
  'defense',    // 课题答辩
  'board',      // 董事会汇报
  'review',     // 经营分析
  'tech',       // 技术方案 / 架构评审
  'brand',      // 品牌提案 / 视觉汇报
  'general',
]);
export type SceneTag = z.infer<typeof SceneTag>;

export const Project = z.object({
  projectId: z.string(),
  tenantId: z.string(),
  ownerId: z.string(),
  title: z.string(),
  /** 用户输入的原始意图文本 */
  brief: z.string().default(''),
  audienceTag: AudienceTag.default('general'),
  scene: SceneTag.default('general'),
  /** 未锁定风格前为 null */
  styleId: z.string().nullable().default(null),
  status: ProjectStatus.default('draft'),
  totalPages: z.number().int().min(0).default(0),
  readyPages: z.number().int().min(0).default(0),
  failedPages: z.number().int().min(0).default(0),
  thumbnailKey: z.string().default(''),
  /** 是否开启数字人（默认关闭，PRD §5.13） */
  avatarEnabled: z.boolean().default(false),
  /**
   * 讲解音色。**null = 沿用后台的全局设置**，不是空串。
   *
   * 于是两种诉求同时成立：项目单独选过的用自己的，没选过的跟着全局走——
   * 改一次全局，所有没覆盖过的项目一起换。用 null 而不是 '' 是因为
   * 「没选过」与「选了一个空音色」是两回事，后者不合法。
   */
  narrationVoice: z.string().nullable().default(null),
  /** 讲解语气。null = 沿用全局；**空串是合法值**，表示「不加语气提示」 */
  narrationTone: z.string().nullable().default(null),
  /** 生成页面时顺带出讲稿。默认开（用户要求「默认全部是生成讲解内容的」） */
  narrationScriptEnabled: z.boolean().default(true),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type Project = z.infer<typeof Project>;

/** 项目列表行（含派生状态，供列表徽章使用） */
export const ProjectListItem = Project.extend({
  progressText: z.string().default(''),
});
export type ProjectListItem = z.infer<typeof ProjectListItem>;

/** 项目级视频规范（PRD §5.9 路径 B） */
export const VideoSpec = z.object({
  fps: z.number().int().default(30),
  width: z.number().int().default(1920),
  height: z.number().int().default(1080),
  /** 配音音色 */
  voice: z.string().default('zh-CN-XiaoxiaoNeural'),
  /** 禁用风格提示词，写入项目级配置 */
  bannedStyles: z.array(z.string()).default(() => []),
});
export type VideoSpec = z.infer<typeof VideoSpec>;
