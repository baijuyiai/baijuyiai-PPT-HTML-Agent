import { buildPack } from './shared.js';

/**
 * 瑞士极简：近黑主色 + 一点朱红，栅格严整、大留白、一页一结论。
 * 对应「商务汇报风」指令模板——视觉上克制，内容上要求每页标题就是一句结论。
 */
export const swissMinimal = buildPack({
  styleId: 'swiss-minimal',
  family: 'swiss-minimal',
  version: '1.0',
  name: '瑞士极简',
  description: '近黑配朱红，栅格严整，大留白，一页一结论。适合项目复盘、季度总结、经营汇报。',
  audienceFit: ['executive', 'founder', 'general'],
  toneKeywords: ['克制', '严整', '留白', '结论前置'],
  tokens: {
    brand500: '#101317',
    brand600: '#000000',
    brand100: '#EEF0F2',
    accent500: '#E0453A',
    accent100: '#FBE9E7',
    neutral900: '#0B0D10',
    neutral700: '#3C4149',
    neutral500: '#767C86',
    neutral300: '#DDE1E6',
    neutral100: '#F4F5F7',
    neutral0: '#FFFFFF',
  },
  fonts: {
    heading: '"Inter", "Helvetica Neue", "PingFang SC", system-ui, sans-serif',
    body: '"Inter", "PingFang SC", system-ui, sans-serif',
    numeric: '"Inter", "JetBrains Mono", system-ui, sans-serif',
  },
  sizes: { display: 56, title: 40, subtitle: 24, body: 20, caption: 14, metric: 56, mono: 20 },
  weights: { display: 700, title: 700, subtitle: 500, body: 400, caption: 500, metric: 700, mono: 500 },
  lineHeights: { display: 1.15, title: 1.2, subtitle: 1.35, body: 1.55, caption: 1.4, metric: 1.1, mono: 1.5 },
  letterSpacing: { display: -0.5, title: -0.3, caption: 0.6 },
  capacity: { titleChars: 26, bodyChars: 200, density: 1.15 },
  motionWhitelist: ['none', 'fade', 'fadeUp'],
  avatar: {
    pip: { border: '1px solid var(--brand-500)', shadow: 'sm', background: 'var(--surface-0)' },
    fullscreen: { background: 'var(--surface-0)', pptOpacity: 0.16, transitionMs: 220 },
  },
  cursor: { shape: 'dot', color: 'var(--accent-500)', opacity: 0.55, size: 40, pulseMs: 1100, moveEaseMs: 360 },
  examples: ['项目复盘', '季度总结', '经营分析会'],
});
