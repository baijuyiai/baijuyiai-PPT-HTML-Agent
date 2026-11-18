import { buildPack } from './shared.js';

/**
 * 亲和品质：珊瑚粉 + 暖黄，暖调中性色。
 * 面向宠物、电商、个人品牌等场景，要求亲和但不廉价、不幼稚（PRD §5.2）。
 */
export const friendlyPremium = buildPack({
  styleId: 'friendly-premium',
  family: 'friendly-premium',
  version: '1.0',
  name: '亲和品质',
  description: '珊瑚粉配暖黄，暖调中性色，圆润但克制。适合宠物、电商与个人品牌，亲和而不廉价。',
  audienceFit: ['brand', 'general'],
  toneKeywords: ['亲和', '有品质', '不廉价', '不幼稚'],
  tokens: {
    brand500: '#E0607E',
    brand600: '#C74A66',
    brand100: '#FDEBEF',
    accent500: '#F0A030',
    accent100: '#FEF3E0',
    neutral900: '#241E22',
    neutral700: '#5A4F55',
    neutral500: '#948A90',
    neutral300: '#ECE4E8',
    neutral100: '#FBF7F9',
    neutral0: '#FFFFFF',
  },
  fonts: {
    heading: '"PingFang SC", "Noto Sans SC", system-ui, sans-serif',
    body: '"PingFang SC", "Noto Sans SC", system-ui, sans-serif',
    numeric: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
  },
  sizes: { display: 40, title: 32, subtitle: 24, body: 20, caption: 14, metric: 40, mono: 14 },
  weights: { display: 600, title: 600, subtitle: 500, body: 400, caption: 400, metric: 600, mono: 500 },
  lineHeights: { display: 1.25, title: 1.25, subtitle: 1.45, body: 1.6, caption: 1.5, metric: 1.15, mono: 1.5 },
  letterSpacing: { display: 0.2 },
  capacity: { titleChars: 24, bodyChars: 200, density: 1.1 },
  motionWhitelist: ['none', 'fade', 'fadeUp', 'fadeDown', 'slideLeft', 'slideRight', 'scaleIn'],
  avatar: {
    pip: { border: '2px solid var(--brand-500)', shadow: 'md', background: 'var(--surface-0)' },
    fullscreen: { background: 'var(--surface-0)', pptOpacity: 0.20, transitionMs: 250 },
  },
  cursor: { shape: 'halo', color: 'var(--brand-500)', opacity: 0.5, size: 48, pulseMs: 1200, moveEaseMs: 400 },
  examples: ['新品发布', '品牌故事', '产品种草'],
});
