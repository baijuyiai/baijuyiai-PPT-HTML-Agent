import { buildPack } from './shared.js';

/** 品牌设计：墨黑 + 朱红，编辑感排印，留白充分。面向品牌与设计负责人。 */
export const brandDesign = buildPack({
  styleId: 'brand-design',
  family: 'brand-design',
  version: '1.0',
  name: '品牌设计',
  description: '墨黑配朱红，编辑感排印，字距收紧，留白充分。适合品牌提案、视觉汇报、创意比稿。',
  audienceFit: ['brand'],
  toneKeywords: ['排印讲究', '细节', '统一', '经得起放大'],
  tokens: {
    brand500: '#16161A',
    brand600: '#000000',
    brand100: '#EDEDF0',
    accent500: '#E8462D',
    accent100: '#FCECE9',
    neutral900: '#16161A',
    neutral700: '#4A4A52',
    neutral500: '#8A8A93',
    neutral300: '#E2E2E6',
    neutral100: '#FAFAFB',
    neutral0: '#FFFFFF',
  },
  fonts: {
    heading: '"Inter", "PingFang SC", system-ui, sans-serif',
    body: '"PingFang SC", "Noto Sans SC", system-ui, sans-serif',
    numeric: '"Inter", system-ui, sans-serif',
  },
  sizes: { display: 56, title: 40, subtitle: 24, body: 20, caption: 12, metric: 40, mono: 14 },
  weights: { display: 700, title: 700, subtitle: 500, body: 400, caption: 500, metric: 700, mono: 500 },
  lineHeights: { display: 1.15, title: 1.2, subtitle: 1.4, body: 1.6, caption: 1.5, metric: 1.1, mono: 1.5 },
  // 编辑感来自收紧的字距与夸张的字重对比
  letterSpacing: { display: -0.8, title: -0.6, caption: 1.2 },
  capacity: { titleChars: 22, bodyChars: 180, density: 1.15 },
  motionWhitelist: ['none', 'fade', 'fadeUp', 'fadeDown', 'slideLeft', 'slideRight', 'scaleIn'],
  avatar: {
    pip: { border: 'none', shadow: 'md', background: 'var(--surface-0)' },
    fullscreen: { background: 'var(--surface-0)', pptOpacity: 0.14, transitionMs: 250 },
  },
  cursor: { shape: 'arrow', color: 'var(--accent-500)', opacity: 0.5, size: 44, pulseMs: 1200, moveEaseMs: 450 },
  examples: ['品牌提案', '视觉识别汇报', '创意比稿'],
});
