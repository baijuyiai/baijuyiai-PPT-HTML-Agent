import type { AudienceTag, SceneTag } from '@lumen/ir-schema';

/**
 * 讲解的措辞指引：按「讲给谁听」与「什么场合」两条轴给模型定调。
 *
 * **为什么不写 60 条。** `audienceTag`(6) × `scene`(10) 是 60 种组合，逐条写既维护不动、
 * 也没必要——受众决定「怎么推理、动什么情绪、认什么证据」，场合决定「这一页讲完要达成
 * 什么」，两者是正交的，分开写再拼起来就够。真正需要特例的少数组合用 `COMBO_OVERRIDE`
 * 稀疏覆盖，不铺满。
 *
 * 口径与 `outline.ts` 的 `NARRATIVES` 对齐：`executive` 的大纲骨架本来就是「结论前置」、
 * `founder` 里就有「融资需求」，讲稿的措辞不能另起一套，否则同一份演示前后自相矛盾。
 */

/** 受众：怎么推理、动什么情绪、认什么证据 */
export const AUDIENCE_BRIEF: Record<AudienceTag, string> = {
  executive: '听众是决策层：结论先行，只讲「所以呢」与代价；证据用经营数字与风险，一句一个判断。语气笃定、干脆，不铺垫。',
  scholar: '听众是同行：讲方法与依据、边界与不确定性；证据用数据、来源与可比基线。语气克制、严谨，不把话说满。',
  founder: '听众是投资人：讲机会与增长、为什么是现在、为什么是我们；证据用市场规模、验证指标与团队履历。语气有张力但不吹。',
  'tech-lead': '听众是架构负责人：讲约束、取舍与代价；证据用架构、性能数字与失败模式。务实直接，允许说「这里还没想好」。',
  brand: '听众是品牌与创意方：讲感知与调性、要留下的那一句印象；证据用画面感与用户原话。语气从容、有画面。',
  general: '听众没有专业背景：少术语，先建立共同背景再给结论；证据用生活化的例子。语气亲和、清楚。',
};

/** 场合：这一页讲完要达成什么 */
export const SCENE_BRIEF: Record<SceneTag, string> = {
  pitch: '融资路演。每一步都在为「值得投」累积理由，不要有只为了铺垫而存在的一页。',
  strategy: '战略发布。讲清方向与取舍，也要讲清不做什么。',
  annual: '年会演讲。可以有情绪与故事，最终落在士气上。',
  academic: '学术汇报。可复现、可质疑是底线，结论要能追溯到方法与数据。',
  defense: '课题答辩。会被追问，论点要立得住，主动交代局限比被人问出来好。',
  board: '董事会汇报。风险与合规优先，结论要给到可决策的选项。',
  review: '经营分析。同比环比要说清，讲问题必须带归因。',
  tech: '技术方案评审。讲清方案与备选，以及为什么这么取舍。',
  brand: '品牌提案。讲清要留下的印象，以及它在真实场景里怎么落地。',
  general: '通用场合。清楚、不啰嗦，把事说完整就行。',
};

/**
 * 少数组合需要额外一句话时写在这里。
 *
 * 稀疏覆盖：只有确实需要特例的组合才加，没写到的走上面两张表的拼接结果。
 */
export const COMBO_OVERRIDE: Partial<Record<`${AudienceTag}/${SceneTag}`, string>> = {
  'founder/pitch': '一句话说清「为什么是现在」——时机往往比方案本身更能打动投资人。',
  'executive/board': '把「需要拍板什么」放在最前面，其余都是支撑。',
  'scholar/defense': '预判最可能被问的那个问题，在讲稿里先自己回答掉。',
};

/**
 * 拼出这一页的措辞指引。永远返回非空——受众与场合都是枚举，取不到也有 `general` 兜底。
 */
export function narrationBrief(audience: AudienceTag, scene: SceneTag): string {
  const parts = [
    AUDIENCE_BRIEF[audience] ?? AUDIENCE_BRIEF.general,
    SCENE_BRIEF[scene] ?? SCENE_BRIEF.general,
  ];
  const override = COMBO_OVERRIDE[`${audience}/${scene}`];
  if (override) parts.push(override);
  return parts.join('\n');
}
