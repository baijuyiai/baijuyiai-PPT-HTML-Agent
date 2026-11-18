import { z } from 'zod';

export const LintSeverity = z.enum(['error', 'warning']);
export type LintSeverity = z.infer<typeof LintSeverity>;

/** 渲染前一致性校验结果（PRD §11 术语：Lint） */
export const LintIssue = z.object({
  rule: z.string(),
  severity: LintSeverity,
  message: z.string(),
  /** 定位路径，如 'pages[2].blocks[1].items' */
  path: z.string().default(''),
});
export type LintIssue = z.infer<typeof LintIssue>;

export const LintResult = z.object({
  ok: z.boolean(),
  issues: z.array(LintIssue).default(() => []),
});
export type LintResult = z.infer<typeof LintResult>;

export type LintIssueInput = z.input<typeof LintIssue>;

/** 仅在无 error 级问题时判定通过 */
export function lintOk(issues: LintIssueInput[]): LintResult {
  return { ok: !issues.some((i) => i.severity === 'error'), issues: issues.map((i) => LintIssue.parse(i)) };
}

/** 品质基线硬指标（PRD §3.1 / §3.4） */
/**
 * 字号阶梯（PRD §3.4）。所有角色的字号必须落在这一串里，保证一套风格的
 * 字号关系是**成比例**的，而不是各页各拍一个数。
 *
 * 56 以上三档是后加的：1920×1080 的画布上 56px 只占 2.9% 高，表达不了 hero 大标题。
 * 从设计稿识别出来的风格动辄用 90~110px 的封面主标，卡在 56 上会把它们全部压扁，
 * 而「压扁」是看不出来的——页面照样渲染，只是不像原稿。加档是纯放行的改动，
 * 内置族用的都在 56 以内，不受影响。
 */
export const FONT_SIZE_LADDER = [12, 14, 16, 20, 24, 32, 40, 56, 64, 80, 96] as const;

export function isOnFontLadder(sizePx: number): boolean {
  return (FONT_SIZE_LADDER as readonly number[]).includes(sizePx);
}

/**
 * 把任意字号吸附到阶梯上。
 *
 * 取最近的档；两边一样近时取**小的那一档**——小了顶多留白多一点，
 * 大了会溢出，而溢出的补救（降字号、拆页）比留白难看得多。
 */
export function snapToFontLadder(sizePx: number): number {
  let best = FONT_SIZE_LADDER[0] as number;
  let bestGap = Infinity;
  for (const step of FONT_SIZE_LADDER) {
    const gap = Math.abs(step - sizePx);
    if (gap < bestGap) {
      best = step;
      bestGap = gap;
    }
  }
  return best;
}

/**
 * 色相族归类，用于「单屏色相不超过 4 个」判定。
 * 把颜色按色相区间归到有限几个族，中性色（低饱和）不计入。
 */
export function hueFamily(hex: string): string | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const { r, g, b } = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  // 低饱和视为中性色，不计入色相族
  if (delta < 24 || max === 0) return null;
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  // 归到 12 个 30 度区间
  return `h${Math.floor(h / 30)}`;
}

export function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let s = m[1]!;
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  return {
    r: parseInt(s.slice(0, 2), 16),
    g: parseInt(s.slice(2, 4), 16),
    b: parseInt(s.slice(4, 6), 16),
  };
}

/** emoji 码点区间。构建期 lint 与运行期内容 lint 共用同一份判定。 */
const EMOJI_RANGES: [number, number][] = [
  [0x1f000, 0x1f0ff], [0x1f100, 0x1f2ff], [0x1f300, 0x1f5ff], [0x1f600, 0x1f64f],
  [0x1f650, 0x1f67f], [0x1f680, 0x1f6ff], [0x1f700, 0x1f77f], [0x1f780, 0x1f7ff],
  [0x1f800, 0x1f8ff], [0x1f900, 0x1f9ff], [0x1fa00, 0x1faff], [0x1fb00, 0x1fbff],
  [0x2600, 0x26ff], [0x2700, 0x27bf], [0x2b00, 0x2bff], [0xfe0f, 0xfe0f],
  [0x200d, 0x200d], [0x20e3, 0x20e3], [0x1f1e6, 0x1f1ff],
];

/** 文本中是否含 emoji 字符（PRD §3.6 禁止 emoji 作为界面图标） */
export function containsEmoji(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const cp = text.codePointAt(i);
    if (cp === undefined) continue;
    if (EMOJI_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi)) return true;
    if (cp > 0xffff) i++;
  }
  return false;
}

/** 中文字符 */
export const CJK_RE = /[㐀-䶿一-鿿]/;
/** 拉丁字母或数字 */
export const LATIN_RE = /[A-Za-z0-9]/;
