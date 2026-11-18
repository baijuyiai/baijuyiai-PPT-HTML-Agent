import type { DesignGuidance, StyleFamily } from '@lumen/ir-schema';

/**
 * 创作指令模板。
 *
 * 这四套不是「四种好看的配色」，而是**四种写稿的规矩**：
 * 瑞士极简要求一页一结论、咨询报告要求金字塔结构与 MECE、
 * 学术组会要求不得编造材料外的数据、杂志创意要求图文强相关。
 * 逐页的排版说明管不到这些——它们管的是整篇的组织方式与事实边界。
 *
 * 来源是实践里反复验证过的那套「万能高级感 PPT 指令」，这里把它结构化：
 * 可展示、可编辑、可注入生成提示词，而不是躺在某个文档里。
 *
 * 注意：改这里的话，`FAMILY_LANGUAGE` 里对应的族会跟着变（那边是引用它的）。
 */

/** 所有风格都适用的避坑项。加在每套模板自己的避坑项前面 */
const SHARED_AVOID = [
  '渐变、光效、粒子特效、3D 图表、卡通风格、廉价模板感——这些一眼就是模板味',
  '为了凑字数编造数据或结论。缺少依据的内容统一标记【待确认】',
  '大段文字堆在一页里。数据优先用图表，不要用一段话描述一组数字',
];

/** 所有风格都适用的自检项 */
const SHARED_CHECKLIST = [
  '主色是否统一（只有一个主色）',
  '留白是否舒服（没有塞满）',
  '层级是否分明（字号差一眼可见）',
  '是否一页一观点',
  '整体风格是否一致（像一个人做的）',
  '页眉页脚一致、页码连续、字体不超过 2 种',
];

/** 只有全局字段的那部分指令，逐页说明由各族自己给 */
export type DirectiveGuidance = Pick<
  DesignGuidance,
  'brief' | 'layoutRules' | 'colorRules' | 'avoid' | 'checklist'
>;

export interface Directive extends DirectiveGuidance {
  /** 界面上显示的名字 */
  label: string;
  /** 适合什么场合 */
  fit: string;
}

export const DIRECTIVES: Record<string, Directive> = {
  'swiss-minimal': {
    label: '商务汇报风',
    fit: '项目复盘、季度总结、经营汇报',
    brief: '你是一名资深商业演示设计师。每页只表达一个结论；标题直接写结论，'
      + '不写「项目背景」这类空标题；每页保留 1—3 条证据，并注明对应的原材料段落；'
      + '最后一页给出下一步行动。',
    layoutRules: '统一网格与字体层级，保持大留白。标题占顶部，正文左对齐不居中，'
      + '关键数据用大字号单独成块。同页字号最多两级，行距 1.3。',
    colorRules: '主色只用一个，强调色不超过 1 种。强调信息用主色描边或色块，不要满铺。',
    avoid: [...SHARED_AVOID, '装饰性堆砌。每一个色块、每一条线都要有理由'],
    checklist: [...SHARED_CHECKLIST, '每一页的标题是不是一句结论，而不是一个名词'],
  },

  'editorial-magazine': {
    label: '创意提案风',
    fit: '品牌策划、作品集展示、创意比稿',
    brief: '你是资深视觉策划与 PPT 架构师。生成一份结构严谨、视觉高级、逻辑清晰的方案，'
      + '包含封面、目录、正文、结尾，逻辑闭环、视觉统一、重点突出，适配 16:9。',
    layoutRules: '采用 12 栏栅格。标题占顶部 1/4，正文左对齐不居中，关键数据用大字号单独成块。',
    colorRules: '主色一个，浅灰背景，大量留白。全篇不超过 3 色。',
    avoid: [...SHARED_AVOID, '把图片当装饰铺满整页。图与观点必须强相关'],
    checklist: [...SHARED_CHECKLIST, '每一张图是不是都在支撑它旁边的那句话'],
  },

  'academic-report': {
    label: '学术组会风',
    fit: '论文答辩、课程展示、组会汇报',
    brief: '把材料整理成一份组会汇报。结构包括研究背景、核心问题、方法设计、关键结果、'
      + '结论与不足。每一页给出标题、要点、配图建议与讲稿提示。'
      + '语言要像学生组会汇报，不要太官方。**不得编造材料中没有的数据**。',
    layoutRules: '排版疏密有致。方法与结果分开写，不要混在一段里。',
    colorRules: '主色为深蓝或深灰，无衬线字体。图表用单色阶，不要彩虹配色。',
    avoid: [...SHARED_AVOID, '把「相关性」说成「因果」', '省略样本量、口径与局限性'],
    checklist: [...SHARED_CHECKLIST, '每一个数字是不是都能在原材料里找到出处', '结论有没有超出数据支持的范围'],
  },

  'consulting-report': {
    label: '咨询报告风',
    fit: '行业研究、战略分析、尽调汇报',
    brief: '复刻高盛/麦肯锡的商务金融风格。严格遵循金字塔原理与 MECE 原则：结论先行，'
      + '封面之后尽快抛出核心论点；每页只传递 1 个核心观点，页面标题就是本页论点。',
    layoutRules: '目录使用线性导航，内页多用两栏/三栏布局。每个论点下面挂 3 条以内的支撑。',
    colorRules: '主色深海藏蓝，辅助金色或浅米黄，大量白色背景。',
    avoid: [...SHARED_AVOID, '为了排版好看而牺牲逻辑层级', '论点之间互相包含（违反 MECE）'],
    checklist: [...SHARED_CHECKLIST, '每一页的标题是不是一句可以独立成立的论点', '论点之间有没有重叠或遗漏'],
  },
};

/** 各族引用的指令 id。没有对应模板的族返回 undefined，界面据此不显示指令区块 */
export const FAMILY_DIRECTIVE: Partial<Record<StyleFamily, string>> = {
  'swiss-minimal': 'swiss-minimal',
  'editorial-magazine': 'editorial-magazine',
  'academic-report': 'academic-report',
  'consulting-report': 'consulting-report',
};

export function directiveFor(family: StyleFamily): Directive | undefined {
  const id = FAMILY_DIRECTIVE[family];
  return id ? DIRECTIVES[id] : undefined;
}

/** 取一套指令的全局字段（逐页说明由族自己给），没有就返回空对象 */
export function directiveGuidance(family: StyleFamily): Partial<DesignGuidance> {
  const d = directiveFor(family);
  if (!d) return {};
  return {
    brief: d.brief,
    layoutRules: d.layoutRules,
    colorRules: d.colorRules,
    avoid: d.avoid,
    checklist: d.checklist,
  };
}
