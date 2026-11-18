import { buildPack } from './shared.js';

/** 学术严谨：深青 + 砖红，衬线标题，信息密度更高。面向学者与研究人员。 */
export const academicRigor = buildPack({
  styleId: 'academic-rigor',
  family: 'academic-rigor',
  version: '1.0',
  name: '学术严谨',
  description: '深青配砖红，衬线标题，网格规整，引用可溯。适合学术汇报、课题答辩、会议演讲。',
  audienceFit: ['scholar'],
  toneKeywords: ['清晰', '规范', '图表准确', '引用可溯'],
  tokens: {
    brand500: '#1D5B5B',
    brand600: '#144444',
    brand100: '#E4F0F0',
    accent500: '#A6443A',
    accent100: '#F6E9E7',
    neutral900: '#14181A',
    neutral700: '#455055',
    neutral500: '#7E898F',
    neutral300: '#DDE4E6',
    neutral100: '#F5F8F8',
    neutral0: '#FFFFFF',
  },
  fonts: {
    heading: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", serif',
    body: '"PingFang SC", "Noto Sans SC", system-ui, sans-serif',
    numeric: '"JetBrains Mono", "SFMono-Regular", Consolas, monospace',
  },
  // 学术场景信息量大，字阶整体下移一档，正文 16 而非 20
  sizes: { display: 40, title: 32, subtitle: 20, body: 16, caption: 12, metric: 40, mono: 16 },
  weights: { display: 600, title: 600, subtitle: 500, body: 400, caption: 400, metric: 600, mono: 400 },
  lineHeights: { display: 1.25, title: 1.25, subtitle: 1.45, body: 1.6, caption: 1.5, metric: 1.15, mono: 1.6 },
  letterSpacing: { caption: 0.5 },
  capacity: { titleChars: 26, bodyChars: 320, density: 0.85 },
  motionWhitelist: ['none', 'fade', 'fadeUp'],
  avatar: {
    pip: { border: '1px solid var(--neutral-300)', shadow: 'sm', background: 'var(--surface-0)' },
    fullscreen: { background: 'var(--surface-0)', pptOpacity: 0.20, transitionMs: 250 },
  },
  cursor: { shape: 'dot', color: 'var(--brand-500)', opacity: 0.5, size: 40, pulseMs: 1200, moveEaseMs: 350 },
  examples: ['课题答辩', '学术会议报告', '论文成果汇报'],
});
