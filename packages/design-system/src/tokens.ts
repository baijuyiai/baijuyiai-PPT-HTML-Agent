/**
 * 设计令牌的结构化定义。
 * 与 themes.css 中的 CSS 变量一一对应；生成器（PPTX / 视频 / 导出）复用同一份色值，
 * 避免 CSS 变量在非浏览器环境不可用导致配色漂移。
 * 来源：PRD §3.3 / §3.4 / §3.5。
 */

export type ThemeMode = 'light' | 'dark';

/**
 * 主色 · 荧光绿。
 *
 * 500 只做填充，600 只做文字与描边——亮绿画在白底上只有 1.6:1，当文字读不出来。
 * 深色主题下 600 反过来变亮：它的语义是「当前背景下读得清的那一档」，不是「更深的 500」。
 * 与 `themes.css` 里那两个变量逐字对应，改一处要改两处。
 */
export const brand = {
  light: { 500: '#BDEC3D', 600: '#4C5A0A', 100: '#F2FAD4', fg: '#161D00' },
  dark: { 500: '#BDEC3D', 600: '#CBF43F', 100: '#232B0A', fg: '#161D00' },
} as const;

/** 辅助色 · 橙（单屏面积 ≤10%） */
export const accent = {
  light: { 500: '#FF7A1A', 100: '#FFF0E6' },
  dark: { 500: '#FF9447', 100: '#3A2718' },
} as const;

/**
 * 中性色。深色模式禁止纯黑。
 *
 * 深色是三档而不是两档：底色 / 表面 / 抬升。只有两档时，
 * 弹窗、下拉、选中行这些「浮在表面之上」的东西只能靠阴影分层，
 * 而深色底上的阴影本来就几乎看不见——必须再给一档更亮的表面。
 */
export const neutral = {
  light: {
    900: '#0F1115', // 主文字
    700: '#4A4F5A', // 次要文字
    500: '#8A8F99', // 辅助文字
    300: '#E6E8EC', // 边框
    100: '#F7F8FA', // 页面底色
    0: '#FFFFFF',   // 卡片表面
  },
  dark: {
    900: '#F5F6F8',
    700: '#B4B8C0',
    500: '#7A7E88',
    300: '#262629', // 边框
    100: '#0A0A0C', // 页面底色
    0: '#121214',   // 中性色阶的底，但**不是**卡片表面——见下方 surface
  },
} as const;

/**
 * 浮动外壳的三级表面：画布 → 外壳 → 卡片。**从深到浅，卡片才浮得起来。**
 *
 * 深色下卡片不能取 `neutral.dark[0]`（#121214）——那比外壳还暗，卡片会陷进去。
 * 浅色下同理，画布要比卡片深一档，白色卡片才有边界。
 */
export const surface = {
  light: { canvas: '#E8EAEF', shell: '#FBFBFD', card: '#FFFFFF' },
  dark: { canvas: '#050507', shell: '#101014', card: '#18181D' },
} as const;

/** 导航当前项的药丸。**反色**：浅色下近黑底白字，深色下反过来 */
export const navActive = {
  light: { bg: '#16181D', fg: '#FFFFFF' },
  dark: { bg: '#F5F5F7', fg: '#0A0A0C' },
} as const;

/**
 * 弹层背后的遮罩。与 `backdrop`（画布底色）不是一回事——这个是压在内容之上的
 * 半透明黑，深色下要更重，否则弹窗与背景分不开。
 */
export const scrim = {
  light: 'rgba(15, 17, 21, 0.40)',
  dark: 'rgba(0, 0, 0, 0.62)',
} as const;

/** 深色下「浮在表面之上」的一档：弹层、下拉、选中行 */
export const elevated = {
  light: { 0: '#FFFFFF' },
  dark: { 0: '#202024' },
} as const;

/**
 * 玻璃拟态表面。深色下是一层极淡的白色叠加，浅色下是半透明白。
 * 叠在什么底色上就透出什么底色，所以它不写死色值，而是给一层半透明。
 */
export const glass = {
  light: 'rgba(255, 255, 255, 0.62)',
  dark: 'rgba(255, 255, 255, 0.045)',
} as const;

/** 比 --border 更弱的分隔线，用于卡片内部、表格行之间 */
export const borderSubtle = {
  light: 'rgba(15, 17, 21, 0.07)',
  dark: 'rgba(255, 255, 255, 0.06)',
} as const;

/**
 * 主行动按钮的底色与前景色。
 *
 * 按角色命名而不是按色值。两套主题里字都是**深色**——主色是荧光绿，它很亮，
 * 白字压上去只有 1.4:1，等于没写。亮底配深字才是这枚按钮唯一读得出来的组合。
 */
export const cta = {
  light: { bg: '#BDEC3D', fg: '#161D00', hover: '#AAD92B' },
  dark: { bg: '#BDEC3D', fg: '#161D00', hover: '#CBF43F' },
} as const;

/** 语义色，双主题共用 */
export const semantic = {
  success: '#22A06B',
  warning: '#F5A524',
  error: '#E5484D',
  info: '#3B82F6',
} as const;

/** 间距基数 4px，常用档位 */
export const space = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 6: 24, 8: 32, 12: 48, 16: 64,
} as const;

/** 圆角：控件 12 / 卡片 20 / 弹层 20 / 内部 10 / 面板 20 / 外壳 28 */
export const radius = {
  control: 12, card: 20, popover: 20, inner: 10, tile: 14, panel: 20, shell: 28, window: 22, pill: 999,
} as const;

export const shadow = {
  light: {
    sm: '0 1px 2px rgba(0,0,0,.06)',
    md: '0 8px 24px rgba(0,0,0,.10)',
    lg: '0 20px 48px rgba(0,0,0,.14)',
  },
  dark: {
    sm: '0 1px 2px rgba(0,0,0,.30)',
    md: '0 8px 24px rgba(0,0,0,.45)',
    lg: '0 20px 48px rgba(0,0,0,.60)',
  },
} as const;

/** 字阶（界面最小 12px，正文默认 14px） */
export const fontSize = {
  12: 12, 14: 14, 16: 16, 20: 20, 24: 24, 32: 32, 40: 40, 56: 56,
} as const;

export const fontWeight = { regular: 400, medium: 500, semibold: 600, bold: 700 } as const;

export const lineHeight = { body: 1.6, title: 1.2, tight: 1.15 } as const;

export const fontFamily = {
  /** 中文 */
  sans: '"PingFang SC", "HarmonyOS Sans", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif',
  /** 英文数字 */
  latin: '"Inter", "Geist", system-ui, -apple-system, sans-serif',
  /** 等宽数字 */
  mono: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
} as const;

/** 动效：只做 150–250ms 位移/淡入，禁止弹跳旋转炫技 */
export const motion = {
  fast: 150,
  base: 200,
  pageFlip: 250,
  skeletonPulse: 1600,
  easing: 'cubic-bezier(0.2, 0, 0, 1)', // ease-out
} as const;

/** 图标：线宽 1.5，尺寸限 16/20/24 */
export const icon = { strokeWidth: 1.5, sizes: [16, 20, 24] as const } as const;

/** 画布：固定 16:9 */
export const canvas = {
  width: 1920,
  height: 1080,
  /** 页面边距不小于画布宽 5% */
  minMarginRatio: 0.05,
  /** 12 栏网格 */
  gridColumns: 12,
} as const;

/** 品质基线硬约束，供设计 Lint 使用 */
export const qualityBaseline = {
  /** 单屏主色 + 辅助色 + 中性色不超过 4 个色相 */
  maxHueFamilies: 4,
  /** 辅助橙面积占比上限 */
  maxAccentAreaRatio: 0.10,
  /** 一页要点上限 */
  maxBullets: 5,
  /** 生成内容字号下限 */
  minFontSize: 12,
} as const;

export interface ThemeTokens {
  mode: ThemeMode;
  brand: { 500: string; 600: string; 100: string };
  cta: { bg: string; fg: string; hover: string };
  accent: { 500: string; 100: string };
  neutral: { 900: string; 700: string; 500: string; 300: string; 100: string; 0: string };
  /** 抬升表面：弹层、下拉、选中行 */
  elevated: string;
  /** 玻璃表面，叠在任意底色之上 */
  glass: string;
  /** 比边框更弱的分隔线 */
  borderSubtle: string;
  semantic: { success: string; warning: string; error: string; info: string };
  shadow: { sm: string; md: string; lg: string };
}

export function themeTokens(mode: ThemeMode): ThemeTokens {
  return {
    mode,
    brand: brand[mode],
    cta: cta[mode],
    accent: accent[mode],
    neutral: neutral[mode],
    elevated: elevated[mode][0],
    glass: glass[mode],
    borderSubtle: borderSubtle[mode],
    semantic,
    shadow: shadow[mode],
  };
}
