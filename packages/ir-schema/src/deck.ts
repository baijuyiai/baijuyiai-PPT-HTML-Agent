import { z } from 'zod';
import { PageIR, PageType } from './page.js';

/** 目标人群标签（PRD §5.2 风格族与人群映射） */
export const AudienceTag = z.enum(['executive', 'scholar', 'founder', 'tech-lead', 'brand', 'general']);
export type AudienceTag = z.infer<typeof AudienceTag>;

/** 意图路由四类，走同一 Deck IR 出口（PRD §5.3） */
export const IntentKind = z.enum(['has_content', 'outline_only', 'idea_only', 'mixed']);
export type IntentKind = z.infer<typeof IntentKind>;

export const IntentResult = z.object({
  kind: IntentKind,
  confidence: z.number().min(0).max(1),
  /** 判定依据，便于用户理解为何走这条路径 */
  reason: z.string().default(''),
  /** 从已有内容中切分出的段落数 */
  contentSegments: z.number().int().default(0),
});
export type IntentResult = z.infer<typeof IntentResult>;

/** 大纲页：页类型 + 主张 + 要点（PRD §5.3） */
export const OutlinePage = z.object({
  index: z.number().int().min(0),
  pageType: PageType,
  /** 一页一个主张 */
  claim: z.string(),
  title: z.string(),
  points: z.array(z.string()).max(5).default(() => []),
  section: z.string().default(''),
  /**
   * 这一页对应的**原文段落**。
   *
   * 不要拿它当教案用：`page-ir.ts` 与 `generate.service.ts` 都把它当 `sourceText`
   * 喂给生成页面的模型，占了它就把原文冲掉了，下游再没有事实与数字可依。
   * 教案有自己的两个字段，见下。
   */
  notes: z.string().default(''),
  /**
   * 视觉形式：这一页该配什么图 / 用什么图表 / 什么版式。教案阶段由模型给出。
   *
   * 三个后加的字段都是 `optional` 而不是 `.default()`：大纲是从 `decks.meta`
   * 里 **JSON 强转**读出来的（`readDeckMeta` 不过 schema），老数据运行时拿到的
   * 就是 `undefined`——声明成必填是类型上的谎。读取侧按空值处理即可。
   */
  visualForm: z.string().optional(),
  /** 设计说明：这一页为什么这么排、要给听众留下什么。只给人看，不发给模型 */
  designNote: z.string().optional(),
  /**
   * 人工改过。
   *
   * 重跑提纲时，标了这个的页**原样保留**，并在结果里如实报出「这 N 页你改过，没有动」——
   * 与 `StylePagePrompt.edited` 是同一条规矩：机器重跑不该把人的手改冲掉。
   */
  edited: z.boolean().optional(),
});
export type OutlinePage = z.infer<typeof OutlinePage>;

/**
 * 大纲的思考层级。只影响提纲与教案两段怎么问模型，不影响页面渲染。
 *
 * 与 `targetPages` 一起跟着**项目**走，不跟着某一次生成走——用户设过一次就不该再设第二次。
 */
export const DeckDepth = z.enum(['shallow', 'standard', 'deep']);
export type DeckDepth = z.infer<typeof DeckDepth>;

export const DEPTH_LABEL: Record<DeckDepth, string> = {
  shallow: '浅',
  standard: '中',
  deep: '深',
};

/**
 * 各档要求模型做什么。
 *
 * 写在一处，提示词与界面说明都从这里取——分成两份写，改了一处忘另一处，
 * 界面上说的和模型实际被要求的就不是一回事了。
 */
export const DEPTH_BRIEF: Record<DeckDepth, string> = {
  shallow: '沿用给定的分段，把标题与主张写顺即可。不要自行增删页。',
  standard: '先搭一条叙事骨架（现状 → 分析 → 方案 → 验证 → 收获），再往骨架上分配页。',
  deep: '先搭叙事骨架，再为每一页写清论证链：这一页要证明什么、拿什么证、与上一页什么关系。'
    + '要点必须带具体数字与出处，不要写「增长显著」这类空话。',
};

export const Outline = z.object({
  title: z.string(),
  audienceTag: AudienceTag.default('general'),
  goal: z.string().default(''),
  pages: z.array(OutlinePage).default(() => []),
});
export type Outline = z.infer<typeof Outline>;

export const CanvasSpec = z.object({
  w: z.number().int().positive().default(1920),
  h: z.number().int().positive().default(1080),
});
export type CanvasSpec = z.infer<typeof CanvasSpec>;

export const DeckMeta = z.object({
  audience: z.string().default(''),
  goal: z.string().default(''),
  intent: IntentResult.optional(),
  outline: z.array(OutlinePage).default(() => []),
});
export type DeckMeta = z.infer<typeof DeckMeta>;

/** Deck IR：内容编译的统一出口（PRD §6） */
export const DeckIR = z.object({
  deckId: z.string(),
  tenantId: z.string(),
  title: z.string(),
  /** 形如 'business-classic@1.2' */
  styleId: z.string(),
  audienceTag: AudienceTag.default('general'),
  canvas: CanvasSpec.default(() => ({ w: 1920, h: 1080 })),
  pages: z.array(PageIR).default(() => []),
  meta: DeckMeta.default(() => ({ audience: '', goal: '', outline: [] })),
});
export type DeckIR = z.infer<typeof DeckIR>;
