import {
  CJK_RE, LATIN_RE, containsEmoji, hueFamily, isMotionMode,
  type LintIssue, type PageIR, type StylePack,
} from '@lumen/ir-schema';
import { measureContent } from '@lumen/content-engine';
import { isMotionPinned } from '@lumen/motion';
import { getFontScale } from './context.js';
import { effectiveCapacity } from './overflow.js';
import { resolveVariant } from './context.js';

/**
 * 生成物一致性校验（PRD §11 术语：Lint）。
 * 覆盖 §3.1 品质基线、§3.4 排印质量、§5.3 内容约束、§5.15 生成约束。
 * 返回的 issues 中 severity 为 error 的必须阻断渲染。
 */

const CLOSING_PUNCT = /^[，。、；：？！）】》」』…—]+/;
const OPENING_PUNCT = /[（【《「『]+$/;

/** 标点悬挂：句首出现收尾标点，或句尾出现起首标点 */
export function punctuationIssue(text: string): boolean {
  const t = text.trim();
  if (t.length === 0) return false;
  return CLOSING_PUNCT.test(t) || OPENING_PUNCT.test(t);
}

/** 孤字：某一行只剩一个字 */
export function orphanLineIssue(text: string): boolean {
  return text
    .split('\n')
    .map((l) => l.trim())
    .some((l) => l.length === 1 && CJK_RE.test(l));
}

/** 中英混排未加空格 */
export function cjkLatinSpacingIssue(text: string): boolean {
  for (let i = 0; i < text.length - 1; i++) {
    const a = text[i]!;
    const b = text[i + 1]!;
    if ((CJK_RE.test(a) && LATIN_RE.test(b)) || (LATIN_RE.test(a) && CJK_RE.test(b))) {
      // 标点相邻不算问题
      if (/[，。、；：？！（）【】《》「」『』…—·]/.test(a) || /[，。、；：？！（）【】《》「」『』…—·]/.test(b)) continue;
      return true;
    }
  }
  return false;
}

/** 该页用到的色相族数量（用于「单屏不超过 4 个色相」的运行期复核） */
export function pageHueFamilies(pack: StylePack, extraColors: string[] = []): Set<string> {
  const hues = new Set<string>();
  for (const c of [pack.base.tokens.brand500, pack.base.tokens.brand600, pack.base.tokens.accent500, ...extraColors]) {
    const f = hueFamily(c);
    if (f) hues.add(f);
  }
  return hues;
}

export interface LintPageOptions {
  /** 是否把排印类问题降级为 warning（预览态用） */
  lenientTypography?: boolean;
}

/** 单页校验 */
export function lintPage(page: PageIR, pack: StylePack, opts: LintPageOptions = {}): LintIssue[] {
  const issues: LintIssue[] = [];
  const variant = resolveVariant(page, pack);
  const load = measureContent(page);
  const typoSeverity: LintIssue['severity'] = opts.lenientTypography ? 'warning' : 'error';
  const path = (s: string) => `pages.${page.pageId}.${s}`;
  const push = (rule: string, severity: LintIssue['severity'], message: string, p: string) =>
    issues.push({ rule, severity, message, path: p });

  /* --- 一页一个主张 --- */
  if (page.title.main.trim().length === 0) {
    push('content/empty-title', 'error', '页面缺少主标题，无法构成一个主张', path('title.main'));
  }

  /* --- 容量 --- */
  // 用与 fitPage 同一套容量口径（含当前字号缩放折算），否则会出现
  // 「适配器认为装得下、这里判它超限」，页面被标失败但内容其实是好的
  const cap = effectiveCapacity(variant, getFontScale(page));
  if (load.bodyChars > cap.maxBodyChars) {
    push('capacity/body', 'error', `正文 ${load.bodyChars} 字超出 ${variant.id} 上限 ${Math.floor(cap.maxBodyChars)}`, path('blocks'));
  }
  if (load.blocks > cap.maxBlocks) {
    push('capacity/blocks', 'error', `块数 ${load.blocks} 超出 ${variant.id} 上限 ${cap.maxBlocks}`, path('blocks'));
  }
  if (load.bullets > pack.base.rules.maxBullets) {
    push('content/bullets', 'error', `要点 ${load.bullets} 条超过上限 ${pack.base.rules.maxBullets}`, path('blocks'));
  }
  if (load.metrics > cap.maxMetrics) {
    push('capacity/metrics', 'error', `指标 ${load.metrics} 个超出 ${variant.id} 上限 ${cap.maxMetrics}`, path('blocks'));
  }

  /* --- 标题模板容量 --- */
  const tpl = pack.base.titleGrammar.templates.find((t) => t.maxTitleChars >= page.title.main.length);
  if (!tpl) {
    push('title/too-long', 'warning', `主标题 ${page.title.main.length} 字超出全部标题模板容量，建议精简`, path('title.main'));
  }

  /* --- 动效白名单 --- */
  // 只校验**真会被播的那个值**：
  // - `auto` / `stagger` 是模式不是具体动效，auto 自己就会去白名单里挑，
  //   拿它比对白名单永远是「不在白名单内」，等于每个新页面一建出来就带一条 error
  // - 没手选过的页面播的是轮换出来的值（一定在白名单里），存着的那个数根本不生效，
  //   校验它只会误报
  if (isMotionPinned(page.motion) && !isMotionMode(page.motion.enter)
    && !pack.base.motionWhitelist.includes(page.motion.enter)) {
    push('motion/not-allowed', 'error', `动效 ${page.motion.enter} 不在风格 ${pack.styleId} 的白名单内（PRD §5.10）`, path('motion.enter'));
  }

  /* --- 指标：恰好一个主指标 --- */
  const metrics = page.blocks.filter((b) => b.type === 'metric');
  const primaries = metrics.filter((b) => b.type === 'metric' && b.primary).length;
  if (metrics.length > 0 && primaries === 0) {
    push('metrics/no-primary', 'warning', '本页有指标但未指定主指标', path('blocks'));
  }
  if (primaries > 1) {
    push('metrics/multiple-primary', 'error', `本页有 ${primaries} 个主指标，应恰好一个`, path('blocks'));
  }

  /* --- 图表：类目与数值长度一致 --- */
  for (const [i, b] of page.blocks.entries()) {
    if (b.type !== 'chart') continue;
    for (const s of b.data.series) {
      if (s.values.length !== b.data.categories.length) {
        push(
          'chart/series-length',
          'error',
          `图表序列「${s.name}」数值个数 ${s.values.length} 与类目数 ${b.data.categories.length} 不一致`,
          path(`blocks.${i}`),
        );
      }
    }
    if (b.data.categories.length === 0) {
      push('chart/empty', 'error', '图表没有类目数据', path(`blocks.${i}`));
    }
  }

  /* --- 图片：AI 生成必须有提示词与合规约束 --- */
  for (const [i, b] of page.blocks.entries()) {
    if (b.type !== 'image') continue;
    if (b.source === 'ai') {
      if (b.prompt.trim().length === 0) {
        push('image/empty-prompt', 'error', 'AI 图片缺少提示词', path(`blocks.${i}.prompt`));
      } else {
        if (!/不要出现任何文字|不含文字|无文字/.test(b.prompt)) {
          push('image/no-text-constraint', 'error', '图片提示词必须显式约束「不生成文字」（PRD §5.15）', path(`blocks.${i}.prompt`));
        }
        if (!/不要出现可识别的真人|不含真人|无真人/.test(b.prompt)) {
          push('image/no-portrait-constraint', 'error', '图片提示词必须显式约束「不生成可识别真人肖像」（PRD §5.15）', path(`blocks.${i}.prompt`));
        }
      }
      if (b.status === 'failed' && b.src === '') {
        push('image/failed-no-placeholder', 'warning', '图片生成失败且无占位图，需提示用户替换', path(`blocks.${i}`));
      }
    }
  }

  /* --- 排印质量 --- */
  const titleText = [page.title.eyebrow, page.title.main, page.title.sub].filter(Boolean).join('\n');
  if (punctuationIssue(page.title.main)) {
    push('type/punctuation', typoSeverity, '标题存在标点悬挂', path('title.main'));
  }
  if (orphanLineIssue(titleText)) {
    push('type/orphan', typoSeverity, '标题存在孤字行', path('title'));
  }
  if (cjkLatinSpacingIssue(page.title.main)) {
    push('type/cjk-latin-spacing', 'warning', '标题中英文之间建议加空格', path('title.main'));
  }
  for (const [i, b] of page.blocks.entries()) {
    const texts: string[] =
      b.type === 'paragraph' ? [b.text]
        : b.type === 'bullets' ? b.items
          : b.type === 'metric' ? [b.label, b.trend].filter(Boolean) as string[]
            : [];
    for (const t of texts) {
      if (orphanLineIssue(t)) push('type/orphan', typoSeverity, '正文存在孤字行', path(`blocks.${i}`));
      if (punctuationIssue(t)) push('type/punctuation', typoSeverity, '正文存在标点悬挂', path(`blocks.${i}`));
    }
  }

  /* --- 品牌护栏：内容不得含 emoji --- */
  const allText = [
    page.title.eyebrow, page.title.main, page.title.sub,
    ...page.blocks.flatMap((b) => {
      switch (b.type) {
        case 'paragraph': return [b.text];
        case 'bullets': return b.items;
        case 'metric': return [b.value, b.label, b.trend];
        case 'image': return [b.caption];
        case 'toc': return b.items.map((i) => i.title);
        case 'chart': return b.data.categories;
      }
    }),
  ].join('');
  if (containsEmoji(allText)) {
    push('brand/emoji', 'error', '页面内容含 emoji，违反品牌一致性约束（PRD §3.6）', 'blocks');
  }

  /* --- 数字人 --- */
  if (page.avatar.enabled && page.avatar.mode !== 'off') {
    if (page.avatar.diameter < 120 || page.avatar.diameter > 240) {
      push('avatar/diameter', 'error', `数字人直径 ${page.avatar.diameter}px 超出 120–240 区间（PRD §5.13）`, path('avatar.diameter'));
    }
    // 不遮挡核心内容区：封面与结尾页不应出现画中画
    if ((page.pageType === 'cover' || page.pageType === 'end') && page.avatar.mode === 'pip') {
      push('avatar/cover-overlap', 'warning', '封面/结尾页的画中画可能遮挡主标题', path('avatar'));
    }
  }

  /* --- 讲解光标锚点 --- */
  for (const [i, seg] of page.script.segments.entries()) {
    if (!seg.anchor) continue;
    if (seg.anchor.x < 0 || seg.anchor.x > 1 || seg.anchor.y < 0 || seg.anchor.y > 1) {
      push('cursor/anchor-range', 'error', '光标锚点坐标必须在 0–1 之间', path(`script.segments.${i}.anchor`));
    }
  }

  return issues;
}

export function lintDeck(pages: PageIR[], pack: StylePack, opts: LintPageOptions = {}): LintIssue[] {
  return pages.flatMap((p) => lintPage(p, pack, opts));
}

export function hasBlockingIssue(issues: LintIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}
