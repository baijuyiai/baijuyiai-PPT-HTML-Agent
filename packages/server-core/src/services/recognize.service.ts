import type { AudienceTag, RecognizeResult, StyleFamily } from '@lumen/ir-schema';
import { BUILTIN_STYLE_PACKS } from '@lumen/style-engine';
import { logger } from '../lib/logger.js';
import { buildGateway } from './provider.service.js';
import { recordUsage } from './usage.service.js';

/**
 * 用模型精修风格识别结果。
 *
 * 为什么不是「全交给模型」：规则版识别是确定性的、离线可用的、结果可解释的，
 * 拿它当底座，模型只负责它真正更强的那部分——理解描述里的语义意图
 * （「要有科技感但别太冷」这种话，关键词表是覆盖不完的）。
 *
 * 因此这里的策略是「模型赢在它给了合法答案的字段，其余保持规则结果」，
 * 且模型不可用、超时、返回不合法时**静默退回规则结果**，不阻塞识别。
 */

const FAMILIES: StyleFamily[] = [
  'business-classic', 'academic-rigor', 'tech-minimal', 'brand-design', 'friendly-premium',
  'swiss-minimal', 'editorial-magazine', 'academic-report', 'consulting-report',
];

const AUDIENCES: AudienceTag[] = ['executive', 'founder', 'scholar', 'tech-lead', 'brand', 'general'];

const FAMILY_LABEL: Record<StyleFamily, string> = {
  'business-classic': '商务经典（克制、权威、留白、结论前置；适合老板与高管）',
  'academic-rigor': '学术严谨（清晰、规范、图表准确、引用可溯；适合学者与研究人员）',
  'tech-minimal': '科技极简（结构、理性、等宽数字、深色友好；适合技术总监与架构师）',
  'brand-design': '品牌设计（排印讲究、细节、统一、经得起放大；适合品牌与设计负责人）',
  'friendly-premium': '亲和品质（亲和但有品质，不廉价不幼稚；适合电商与个人品牌）',
  'swiss-minimal': '瑞士极简（栅格严整、大留白、一页一结论；适合项目复盘与季度总结）',
  'editorial-magazine': '杂志创意（衬线大标题、图片出血、编辑感；适合品牌提案与作品集）',
  'academic-report': '学术组会（深蓝深灰、可溯源、语言不官方；适合组会汇报与课程展示）',
  'consulting-report': '咨询报告（深海藏蓝配金、金字塔原理与 MECE、页标题即论点；适合行研与战略分析）',
};

interface ModelChoice {
  family?: string;
  audience?: string;
  toneKeywords?: string[];
  rationale?: string;
}

/** 从模型返回里尽量抠出 JSON——它常常会包一层 ```json 或加一句解释 */
function extractJson(text: string): ModelChoice | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as ModelChoice;
  } catch {
    return null;
  }
}

export interface RefineInput {
  description: string;
  /** 规则版结果，作为底座 */
  baseline: RecognizeResult;
  /** 这次识别是否带了设计稿 / 网页这类实测输入 */
  hasDesignInput?: boolean;
  tenantId: string;
  userId: string;
}

/**
 * 返回精修后的结果；模型不可用或结果不合法时原样返回 baseline。
 * 绝不因为模型的问题让识别失败。
 */
export async function refineRecognitionWithModel(input: RefineInput): Promise<RecognizeResult> {
  const { description, baseline } = input;
  if (!description.trim()) return baseline;

  try {
    const gateway = buildGateway({
      // 风格识别也是真花钱的模型调用，同样要落账；否则用量页会漏掉这一整类开销
      onUsage: {
        record: (e) => recordUsage({
          tenantId: input.tenantId,
          userId: input.userId,
          taskType: e.taskType,
          kind: e.kind,
          providerId: e.providerId,
          model: e.model,
          amount: e.amount,
          inputTokens: e.inputTokens,
          outputTokens: e.outputTokens,
          cost: e.cost,
          currency: e.currency,
          latencyMs: e.latencyMs,
          ok: e.ok,
          degradeReason: e.degradeReason,
        }),
      },
    });

    const result = await gateway.text({
      taskType: 'style_recognize',
      json: true,
      system: [
        '你是演示文稿的视觉风格顾问。根据用户的描述判断最合适的风格族与受众。',
        '只输出 JSON，不要任何解释文字。',
      ].join('\n'),
      messages: [{
        role: 'user',
        content: [
          `用户描述：${description.slice(0, 2000)}`,
          '',
          '可选风格族：',
          ...FAMILIES.map((f) => `- ${f}：${FAMILY_LABEL[f]}`),
          '',
          `可选受众：${AUDIENCES.join(', ')}`,
          '',
          '输出 JSON：{"family":"风格族 id","audience":"受众 id","toneKeywords":["3到5个调性词"],"rationale":"一句话理由"}',
        ].join('\n'),
      }],
      // 推理模型会把预算先花在 reasoning 上，给小了正文就是空的
      maxTokens: 4000,
      temperature: 0.2,
    });

    const choice = extractJson(result.text);
    if (!choice) {
      logger.warn('风格识别的模型返回不是合法 JSON，保留规则结果', { preview: result.text.slice(0, 120) });
      return { ...baseline, modelAssisted: true, modelNote: '模型返回不可解析，已保留规则结果' };
    }

    const family = FAMILIES.includes(choice.family as StyleFamily)
      ? (choice.family as StyleFamily)
      : undefined;
    const audience = AUDIENCES.includes(choice.audience as AudienceTag)
      ? (choice.audience as AudienceTag)
      : undefined;
    const toneKeywords = Array.isArray(choice.toneKeywords)
      ? choice.toneKeywords.filter((k) => typeof k === 'string' && k.trim()).slice(0, 6)
      : [];

    /**
     * 模型选中的风格族只当参考。
     *
     * 有实测输入（设计稿 / 网页）时**绝不换包**：包里已经有从像素量出来的令牌、
     * 设计语言与版式，整包换成内置族会把它们全部丢掉——实测过的输入比模型的
     * 文字判断更可信。只有在纯文字描述这种没有实测信号的情况下才真的换。
     */
    const maySwapPack = !input.hasDesignInput;
    const pack = family && maySwapPack
      ? (BUILTIN_STYLE_PACKS.find((p) => p.family === family) ?? baseline.stylePack)
      : baseline.stylePack;

    return {
      ...baseline,
      stylePack: toneKeywords.length > 0
        ? { ...pack, toneKeywords }
        : pack,
      // 模型给的判断提升置信度：两个独立来源一致时更可信
      confidence: family && family === baseline.stylePack.family
        ? Math.min(0.98, baseline.confidence + 0.15)
        : baseline.confidence,
      modelAssisted: true,
      modelNote: [
        family
          ? (maySwapPack
            ? `模型判定风格族：${family}`
            : `模型倾向风格族 ${family}，但本次带了实测输入，保留实测结果`)
          : '模型未给出可用风格族，沿用规则结果',
        audience ? `受众：${audience}` : '',
        typeof choice.rationale === 'string' ? choice.rationale : '',
      ].filter(Boolean).join('；'),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('风格识别的模型精修失败，退回规则结果', { message });
    return { ...baseline, modelAssisted: true, modelNote: `模型不可用，已退回规则结果：${message.slice(0, 120)}` };
  }
}
