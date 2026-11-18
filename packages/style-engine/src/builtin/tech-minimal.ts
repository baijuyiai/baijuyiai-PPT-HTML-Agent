import { buildPack } from './shared.js';

/** 科技极简：电蓝 + 青，等宽数字，深色友好。面向技术总监与架构师。 */
export const techMinimal = buildPack({
  styleId: 'tech-minimal',
  family: 'tech-minimal',
  version: '1.0',
  name: '科技极简',
  description: '电蓝配青，结构理性，数字等宽对齐，深色模式友好。适合技术方案、架构评审、行业分享。',
  audienceFit: ['tech-lead'],
  toneKeywords: ['结构', '理性', '等宽数字', '深色友好'],
  tokens: {
    brand500: '#3B82F6',
    brand600: '#2563EB',
    brand100: '#E6EFFE',
    accent500: '#14B8A6',
    accent100: '#E0F5F2',
    neutral900: '#0F1319',
    neutral700: '#454D59',
    neutral500: '#7C8794',
    neutral300: '#DFE4EA',
    neutral100: '#F6F8FA',
    neutral0: '#FFFFFF',
  },
  fonts: {
    heading: '"Inter", "PingFang SC", system-ui, sans-serif',
    body: '"PingFang SC", "Noto Sans SC", system-ui, sans-serif',
    numeric: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
  },
  sizes: { display: 56, title: 40, subtitle: 20, body: 16, caption: 12, metric: 56, mono: 20 },
  weights: { display: 600, title: 600, subtitle: 500, body: 400, caption: 400, metric: 700, mono: 500 },
  lineHeights: { display: 1.15, title: 1.2, subtitle: 1.4, body: 1.6, caption: 1.5, metric: 1.1, mono: 1.5 },
  letterSpacing: { display: -0.3, title: -0.2, mono: 0.5 },
  capacity: { titleChars: 24, bodyChars: 220, density: 1.0 },
  motionWhitelist: ['none', 'fade', 'fadeUp', 'fadeDown', 'slideLeft', 'slideRight'],
  avatar: {
    pip: { border: '1px solid var(--brand-500)', shadow: 'md', background: 'var(--surface-0)' },
    fullscreen: { background: 'var(--surface-0)', pptOpacity: 0.16, transitionMs: 250 },
  },
  cursor: { shape: 'laser', color: 'var(--brand-500)', opacity: 0.5, size: 40, pulseMs: 1000, moveEaseMs: 300 },
  examples: ['技术方案评审', '系统架构分享', '行业技术演讲'],
});
