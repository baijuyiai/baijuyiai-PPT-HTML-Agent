import type { AudienceTag, StyleFamily } from '@lumen/ir-schema';

/**
 * 从文字描述推断风格族。
 * 纯关键词加权，不依赖模型——描述通常很直白，规则命中率足够高，且结果可解释、可复现。
 */

interface FamilyKeywords {
  family: StyleFamily;
  audience: AudienceTag[];
  /** 命中权重较高的关键词 */
  strong: string[];
  /** 一般关键词 */
  weak: string[];
}

const KEYWORDS: FamilyKeywords[] = [
  {
    family: 'business-classic',
    audience: ['executive', 'founder'],
    strong: ['商务', '权威', '正式', '庄重', '稳重', '路演', '融资', '董事会', '战略发布', '年会', '沉稳', '大气'],
    weak: ['专业', '克制', '留白', '结论', '高管', '老板', '汇报', '蓝色', '深蓝', '金色'],
  },
  {
    family: 'academic-rigor',
    audience: ['scholar'],
    strong: ['学术', '严谨', '论文', '答辩', '研究', '课题', '文献', '引用', '实验', '规范'],
    weak: ['清晰', '数据', '图表', '准确', '可溯源', '学者', '会议报告', '衬线'],
  },
  {
    family: 'tech-minimal',
    audience: ['tech-lead'],
    strong: ['科技', '极简', '技术', '架构', '工程师', '等宽', '深色', '系统', '理性', '代码'],
    weak: ['结构', '冷色', '蓝色', '青色', '简洁', '现代', '开发者', '互联网'],
  },
  {
    family: 'brand-design',
    audience: ['brand'],
    strong: ['品牌', '设计', '创意', '视觉', '编辑', '排印', '杂志', '高级', '提案', '比稿', '海报'],
    weak: ['留白', '黑', '红', '对比', '排版', '字体', '艺术', '质感'],
  },
  {
    family: 'friendly-premium',
    audience: ['brand', 'general'],
    strong: ['亲和', '可爱', '宠物', '电商', '温暖', '圆润', '轻松', '甜美', '少女', '软萌', '温馨'],
    weak: ['年轻', '活泼', '粉色', '暖色', '奶油', '亲民', '个人品牌', '种草'],
  },
];

export interface TextSignal {
  family: StyleFamily;
  score: number;
  audience: AudienceTag[];
  /** 描述中提到的调性词 */
  matched: string[];
}

export function analyzeDescription(description: string): TextSignal[] {
  const text = description.toLowerCase();
  const results: TextSignal[] = [];

  for (const k of KEYWORDS) {
    let score = 0;
    const matched: string[] = [];
    for (const w of k.strong) {
      if (text.includes(w)) {
        score += 3;
        matched.push(w);
      }
    }
    for (const w of k.weak) {
      if (text.includes(w)) {
        score += 1;
        matched.push(w);
      }
    }
    if (score > 0) results.push({ family: k.family, score, audience: k.audience, matched });
  }

  return results.sort((a, b) => b.score - a.score);
}

/** 描述里是否明确要求深色基调 */
export function wantsDark(description: string): boolean {
  return /深色|暗色|黑底|暗黑|夜晚|夜间/.test(description);
}

/** 描述里是否明确提到某种色系，用于校验取色结果 */
export function mentionedHues(description: string): string[] {
  const hues: [string, RegExp][] = [
    ['紫', /紫/], ['蓝', /蓝/], ['青', /青|绿松/], ['绿', /绿/],
    ['橙', /橙/], ['黄', /黄|金/], ['红', /红|朱/], ['粉', /粉|珊瑚/], ['黑', /黑|墨/], ['白', /白|米/],
  ];
  return hues.filter(([, re]) => re.test(description)).map(([name]) => name);
}
