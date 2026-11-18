import { buildPack } from './shared.js';

/** 商务经典：深墨蓝 + 暖金。面向老板与高管，克制、权威、结论前置。 */
export const businessClassic = buildPack({
  styleId: 'business-classic',
  family: 'business-classic',
  version: '1.0',
  name: '商务经典',
  description: '深墨蓝配暖金，大量留白，结论前置。适合融资路演、战略发布、董事会汇报。',
  audienceFit: ['executive', 'founder'],
  toneKeywords: ['克制', '权威', '留白', '结论前置'],
  tokens: {
    brand500: '#1F3A5F',
    brand600: '#162C49',
    brand100: '#E8EEF5',
    accent500: '#B8894A',
    accent100: '#F5EDE1',
    neutral900: '#101418',
    neutral700: '#444B54',
    neutral500: '#7C848E',
    neutral300: '#DFE3E8',
    neutral100: '#F6F7F9',
    neutral0: '#FFFFFF',
  },
  fonts: {
    heading: '"Inter", "PingFang SC", system-ui, sans-serif',
    body: '"PingFang SC", "Noto Sans SC", system-ui, sans-serif',
    numeric: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
  },
  sizes: { display: 56, title: 40, subtitle: 24, body: 20, caption: 14, metric: 56, mono: 20 },
  weights: { display: 600, title: 600, subtitle: 500, body: 400, caption: 400, metric: 600, mono: 500 },
  lineHeights: { display: 1.2, title: 1.2, subtitle: 1.4, body: 1.6, caption: 1.5, metric: 1.15, mono: 1.5 },
  letterSpacing: { display: 0.5, title: 0.5, caption: 1 },
  capacity: { titleChars: 24, bodyChars: 200, density: 1.0 },
  motionWhitelist: ['none', 'fade', 'fadeUp', 'slideLeft', 'slideRight'],
  avatar: {
    pip: { border: '1px solid var(--brand-500)', shadow: 'md', background: 'var(--surface-0)' },
    fullscreen: { background: 'var(--surface-0)', pptOpacity: 0.18, transitionMs: 250 },
  },
  cursor: { shape: 'halo', color: 'var(--accent-500)', opacity: 0.5, size: 48, pulseMs: 1200, moveEaseMs: 400 },
  examples: ['融资路演', '年度战略发布', '董事会经营分析'],
});
