import { buildPack } from './shared.js';

/**
 * 杂志创意：墨黑配赤陶，衬线大标题，图片整幅出血，编辑感排印。
 * 对应「创意提案风」指令模板——12 栏栅格，标题占顶部四分之一，图与观点强相关。
 */
export const editorialMagazine = buildPack({
  styleId: 'editorial-magazine',
  family: 'editorial-magazine',
  version: '1.0',
  name: '杂志创意',
  description: '墨黑配赤陶，衬线大标题，图片出血，编辑感排印。适合品牌提案、作品集、创意比稿。',
  audienceFit: ['brand', 'founder', 'general'],
  toneKeywords: ['编辑感', '排印讲究', '大图', '留白'],
  tokens: {
    brand500: '#1B1A17',
    brand600: '#0E0D0B',
    brand100: '#EFEDE8',
    accent500: '#C8512F',
    accent100: '#FAEBE4',
    neutral900: '#141310',
    neutral700: '#484540',
    neutral500: '#8A857D',
    neutral300: '#E2DED6',
    neutral100: '#F6F4EF',
    neutral0: '#FFFFFF',
  },
  fonts: {
    heading: '"Playfair Display", "Songti SC", Georgia, serif',
    body: '"Inter", "PingFang SC", system-ui, sans-serif',
    numeric: '"Inter", "JetBrains Mono", system-ui, sans-serif',
  },
  sizes: { display: 56, title: 40, subtitle: 24, body: 20, caption: 14, metric: 56, mono: 20 },
  weights: { display: 700, title: 700, subtitle: 400, body: 400, caption: 500, metric: 600, mono: 500 },
  lineHeights: { display: 1.08, title: 1.12, subtitle: 1.4, body: 1.7, caption: 1.45, metric: 1.1, mono: 1.5 },
  letterSpacing: { display: -0.6, title: -0.4, caption: 1.2 },
  capacity: { titleChars: 22, bodyChars: 180, density: 1.1 },
  motionWhitelist: ['none', 'fade', 'fadeUp', 'slideLeft'],
  avatar: {
    pip: { border: 'none', shadow: 'md', background: 'var(--surface-0)' },
    fullscreen: { background: 'var(--surface-0)', pptOpacity: 0.2, transitionMs: 300 },
  },
  cursor: { shape: 'halo', color: 'var(--accent-500)', opacity: 0.6, size: 52, pulseMs: 1400, moveEaseMs: 420 },
  examples: ['品牌提案', '作品集', '创意比稿'],
});
