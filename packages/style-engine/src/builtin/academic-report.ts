import { buildPack } from './shared.js';

/**
 * 学术组会：深蓝配青灰，无衬线，单色阶图表，排版疏密有致。
 * 对应「学术组会风」指令模板——结构与口径要能溯源，不得编造材料外的数据。
 * 与「学术严谨」的区别：那一套面向正式答辩，这一套面向学生组会，语言更口语。
 */
export const academicReport = buildPack({
  styleId: 'academic-report',
  family: 'academic-report',
  version: '1.0',
  name: '学术组会',
  description: '深蓝配青灰，无衬线，单色阶图表，疏密有致。适合组会汇报、课程展示、阶段小结。',
  audienceFit: ['scholar', 'general'],
  toneKeywords: ['清晰', '可溯源', '不官方', '疏密有致'],
  tokens: {
    brand500: '#1D3557',
    brand600: '#152740',
    brand100: '#E7EDF4',
    accent500: '#457B9D',
    accent100: '#E3EEF4',
    neutral900: '#1B1F24',
    neutral700: '#4A5158',
    neutral500: '#7B838C',
    neutral300: '#DCE1E6',
    neutral100: '#F5F7F9',
    neutral0: '#FFFFFF',
  },
  fonts: {
    heading: '"Source Han Sans SC", "PingFang SC", "Noto Sans SC", system-ui, sans-serif',
    body: '"Source Han Sans SC", "PingFang SC", system-ui, sans-serif',
    numeric: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
  },
  sizes: { display: 56, title: 40, subtitle: 24, body: 20, caption: 14, metric: 56, mono: 20 },
  weights: { display: 600, title: 600, subtitle: 500, body: 400, caption: 400, metric: 600, mono: 500 },
  lineHeights: { display: 1.2, title: 1.25, subtitle: 1.45, body: 1.65, caption: 1.5, metric: 1.15, mono: 1.5 },
  letterSpacing: { display: 0, title: 0, caption: 0.4 },
  capacity: { titleChars: 24, bodyChars: 220, density: 0.95 },
  motionWhitelist: ['none', 'fade'],
  avatar: {
    pip: { border: '1px solid var(--neutral-300)', shadow: 'sm', background: 'var(--surface-0)' },
    fullscreen: { background: 'var(--surface-0)', pptOpacity: 0.15, transitionMs: 200 },
  },
  cursor: { shape: 'dot', color: 'var(--brand-500)', opacity: 0.45, size: 40, pulseMs: 1200, moveEaseMs: 340 },
  examples: ['组会汇报', '课程展示', '阶段小结'],
});
