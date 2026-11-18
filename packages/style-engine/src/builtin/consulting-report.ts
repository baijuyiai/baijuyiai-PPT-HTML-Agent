import { buildPack } from './shared.js';

/**
 * 咨询报告：深海藏蓝配金，白色背景，两栏三栏布局，图表按金融机构标准样式。
 * 对应「麦肯锡咨询风」指令模板——金字塔原理、MECE、结论先行、页标题即论点。
 */
export const consultingReport = buildPack({
  styleId: 'consulting-report',
  family: 'consulting-report',
  version: '1.0',
  name: '咨询报告',
  description: '深海藏蓝配金，白色背景，两栏三栏布局，图表走金融机构标准样式。适合行研、战略分析、尽调汇报。',
  audienceFit: ['executive', 'founder'],
  toneKeywords: ['金字塔', 'MECE', '结论先行', '克制用色'],
  tokens: {
    brand500: '#0B2545',
    brand600: '#071A33',
    brand100: '#E6EBF2',
    accent500: '#C8A44D',
    accent100: '#F7F1E2',
    neutral900: '#0E1319',
    neutral700: '#3E4650',
    neutral500: '#78808A',
    neutral300: '#D8DDE3',
    neutral100: '#F4F6F8',
    neutral0: '#FFFFFF',
    // 图表要「红色警示、绿色乐观」，所以这两个语义色不能沿用默认值
    success: '#2F7D4F',
    warning: '#C8A44D',
    error: '#B23A3A',
    info: '#1D4E89',
  },
  fonts: {
    heading: '"Inter", "Helvetica Neue", "PingFang SC", system-ui, sans-serif',
    body: '"Inter", "PingFang SC", system-ui, sans-serif',
    numeric: '"Inter", "JetBrains Mono", system-ui, sans-serif',
  },
  sizes: { display: 56, title: 40, subtitle: 24, body: 20, caption: 14, metric: 56, mono: 20 },
  weights: { display: 600, title: 600, subtitle: 500, body: 400, caption: 500, metric: 600, mono: 500 },
  lineHeights: { display: 1.18, title: 1.2, subtitle: 1.4, body: 1.5, caption: 1.4, metric: 1.1, mono: 1.45 },
  letterSpacing: { display: 0, title: 0, caption: 0.8 },
  capacity: { titleChars: 30, bodyChars: 260, density: 0.9 },
  motionWhitelist: ['none', 'fade', 'fadeUp'],
  avatar: {
    pip: { border: '1px solid var(--brand-500)', shadow: 'sm', background: 'var(--surface-0)' },
    fullscreen: { background: 'var(--surface-0)', pptOpacity: 0.16, transitionMs: 220 },
  },
  cursor: { shape: 'halo', color: 'var(--accent-500)', opacity: 0.45, size: 46, pulseMs: 1200, moveEaseMs: 380 },
  examples: ['行业研究', '战略分析', '尽职调查'],
});
