import type { CSSProperties, ReactNode } from 'react';
import type { IconName, IconSpec } from '@lumen/ir-schema';

/**
 * 线性图标集。
 *
 * 手绘路径而不是引图标字体或第三方库：导出的 HTML 要在任何机器上打开都一致，
 * 字体图标一旦缺字就变成方框，而 CDN 图标库在离线环境直接不显示。
 * 全部画在 24×24 网格上，`stroke="currentColor"`，颜色与线宽由风格包给。
 *
 * 每一项存的是**返回元素的函数**而不是元素本身。看着绕，但这是必需的：
 * 元素写在模块顶层会在模块求值时立刻构造，而 worker 这类 Node 进程里
 * 这份代码是经典 JSX 编译的（tsx 不把 react-jsx 应用到本包），要靠一个
 * 运行时装的全局 React 兜底。顶层求值会跑在那个兜底之前，直接炸在导入阶段；
 * 放进函数里，求值就推迟到渲染时，兜底已经就位。
 */
const PATHS: Record<IconName, () => ReactNode> = {
  growth: () => (<><path d="M3 18l6-6 4 4 7-7" /><path d="M16 9h5v5" /></>),
  decline: () => (<><path d="M3 7l6 6 4-4 7 7" /><path d="M16 16h5v-5" /></>),
  target: () => (<><circle cx="12" cy="12" r="8.2" /><circle cx="12" cy="12" r="3.4" /></>),
  users: () => (<><circle cx="9" cy="8" r="3.2" /><path d="M3 20c0-3.3 2.7-5.6 6-5.6s6 2.3 6 5.6" /><path d="M16.6 5.6a3.2 3.2 0 0 1 0 6.3" /><path d="M17.2 14.9c2.3.6 3.8 2.5 3.8 5.1" /></>),
  clock: () => (<><circle cx="12" cy="12" r="8.4" /><path d="M12 7v5.4l3.4 2" /></>),
  shield: () => (<><path d="M12 3l7 2.8v6.1c0 4.3-2.9 7.5-7 8.9-4.1-1.4-7-4.6-7-8.9V5.8z" /></>),
  bolt: () => (<><path d="M13.2 2.5L5.5 13.2h5l-1 8.3L18.5 10h-5z" /></>),
  chart: () => (<><path d="M3.5 20.5h17" /><path d="M6.5 20.5v-5.5" /><path d="M11.5 20.5v-11" /><path d="M16.5 20.5v-8" /></>),
  document: () => (<><path d="M6 3h8l4 4v14H6z" /><path d="M14 3v4h4" /><path d="M9 12.5h6" /><path d="M9 16.5h4" /></>),
  gear: () => (<><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" /></>),
  check: () => (<><path d="M4.5 12.6l5 5 10-11.2" /></>),
  star: () => (<><path d="M12 3.4l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.4l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" /></>),
  globe: () => (<><circle cx="12" cy="12" r="8.4" /><path d="M3.6 12h16.8" /><path d="M12 3.6c2.4 2.4 3.6 5.2 3.6 8.4s-1.2 6-3.6 8.4c-2.4-2.4-3.6-5.2-3.6-8.4s1.2-6 3.6-8.4z" /></>),
  layers: () => (<><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 12.5l9 5 9-5" /><path d="M3 17l9 5 9-5" /></>),
  lock: () => (<><rect x="4.8" y="10.4" width="14.4" height="10.2" rx="2" /><path d="M8.4 10.4V7.6a3.6 3.6 0 0 1 7.2 0v2.8" /></>),
  idea: () => (<><path d="M12 3a6 6 0 0 0-3.5 10.9v3.1h7v-3.1A6 6 0 0 0 12 3z" /><path d="M9.5 20h5" /></>),
  puzzle: () => (<><rect x="3.2" y="3.2" width="9" height="9" rx="1.6" /><rect x="11.8" y="11.8" width="9" height="9" rx="1.6" /><path d="M12.2 7.7h4.4v4.1" /></>),
  rocket: () => (<><path d="M12 2.6c3 2.1 4.6 5.6 4.6 9.6L12 16.6l-4.6-4.4c0-4 1.6-7.5 4.6-9.6z" /><path d="M7.4 12.2L4 15.6l1 3.6 3.5-2.1" /><path d="M16.6 12.2L20 15.6l-1 3.6-3.5-2.1" /><circle cx="12" cy="9.2" r="1.6" /></>),
  money: () => (<><circle cx="12" cy="12" r="8.4" /><path d="M12 6.6v10.8" /><path d="M14.8 9.4c-.6-.9-1.6-1.4-2.8-1.4-1.7 0-2.9.9-2.9 2.2 0 3 6 1.6 6 4.4 0 1.3-1.2 2.2-3 2.2-1.3 0-2.4-.6-3-1.5" /></>),
  calendar: () => (<><rect x="3.5" y="5.2" width="17" height="15.3" rx="2" /><path d="M3.5 10h17" /><path d="M8 3v4M16 3v4" /></>),
  message: () => (<><path d="M4 4.6h16v11H12l-4.6 4.2V15.6H4z" /></>),
  search: () => (<><circle cx="10.6" cy="10.6" r="6.4" /><path d="M15.4 15.4L20.8 20.8" /></>),
  filter: () => (<><path d="M3.2 5h17.6l-6.8 8v6.2l-4-2.1v-4.1z" /></>),
  grid: () => (<><rect x="3.4" y="3.4" width="7.4" height="7.4" rx="1.6" /><rect x="13.2" y="3.4" width="7.4" height="7.4" rx="1.6" /><rect x="3.4" y="13.2" width="7.4" height="7.4" rx="1.6" /><rect x="13.2" y="13.2" width="7.4" height="7.4" rx="1.6" /></>),
  cube: () => (<><path d="M12 2.8l8.4 4.6v9.2L12 21.2 3.6 16.6V7.4z" /><path d="M3.6 7.4L12 12l8.4-4.6" /><path d="M12 12v9.2" /></>),
  cloud: () => (<><path d="M7 18.6h10.4a4 4 0 0 0 .5-8 6 6 0 0 0-11.6 1.4A3.6 3.6 0 0 0 7 18.6z" /></>),
  database: () => (<><ellipse cx="12" cy="6" rx="7.4" ry="3" /><path d="M4.6 6v12c0 1.7 3.3 3 7.4 3s7.4-1.3 7.4-3V6" /><path d="M4.6 12c0 1.7 3.3 3 7.4 3s7.4-1.3 7.4-3" /></>),
  key: () => (<><circle cx="8.4" cy="8.4" r="4.2" /><path d="M11.4 11.4L20.4 20.4" /><path d="M17.6 17.6l2.2-2.2" /></>),
  map: () => (<><path d="M9 3.5L3.5 6v14.5L9 18l6 2.5 5.5-2.5V3.5L15 6z" /><path d="M9 3.5V18" /><path d="M15 6v14.5" /></>),
  flag: () => (<><path d="M6 21.5V3" /><path d="M6 4.6h11.6l-2.6 4.2 2.6 4.2H6" /></>),
  bell: () => (<><path d="M18.2 16.4H5.8l1.6-2.6V10a4.6 4.6 0 0 1 9.2 0v3.8z" /><path d="M10 19.2a2 2 0 0 0 4 0" /></>),
  book: () => (<><path d="M12 7v13" /><path d="M4 4.6h6a2 2 0 0 1 2 2v13.4a2 2 0 0 0-2-2H4z" /><path d="M20 4.6h-6a2 2 0 0 0-2 2v13.4a2 2 0 0 1 2-2h6z" /></>),
  briefcase: () => (<><rect x="3" y="7.4" width="18" height="12.4" rx="2" /><path d="M8.6 7.4V5.6a2 2 0 0 1 2-2h2.8a2 2 0 0 1 2 2v1.8" /><path d="M3 13h18" /></>),
  building: () => (<><rect x="4" y="3.4" width="10" height="17.4" /><path d="M14 9.4h6v11.4h-6" /><path d="M7 7h2M7 11h2M7 15h2M17 12.5h1M17 16.5h1" /></>),
  code: () => (<><path d="M9 6.4L3.4 12 9 17.6" /><path d="M15 6.4L20.6 12 15 17.6" /></>),
  cpu: () => (<><rect x="7" y="7" width="10" height="10" rx="2" /><path d="M10 2.4v4.6M14 2.4v4.6M10 17v4.6M14 17v4.6M2.4 10h4.6M2.4 14h4.6M17 10h4.6M17 14h4.6" /></>),
  heart: () => (<><path d="M12 20.4S3.6 15.3 3.6 9.8A4.8 4.8 0 0 1 12 6.8a4.8 4.8 0 0 1 8.4 3c0 5.5-8.4 10.6-8.4 10.6z" /></>),
  home: () => (<><path d="M3.6 10.6L12 3.6l8.4 7V20h-6v-5.4H9.6V20h-6z" /></>),
  mail: () => (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3.4 7.4L12 13.2l8.6-5.8" /></>),
  phone: () => (<><path d="M7.4 3.6h3l1.5 3.8-2 1.5a12 12 0 0 0 5.2 5.2l1.5-2 3.8 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 5.4 5.6a2 2 0 0 1 2-2z" /></>),
  pie: () => (<><circle cx="12" cy="12" r="8.4" /><path d="M12 3.6V12h8.4" /></>),
  refresh: () => (<><path d="M20 12a8 8 0 1 1-2.4-5.7" /><path d="M20 3.6V9h-5.4" /></>),
  tag: () => (<><path d="M11 3.5H4.6v6.4l9.4 9.4 6.4-6.4z" /><circle cx="8.2" cy="7.1" r="1.2" /></>),
  tool: () => (<><path d="M15.6 3.4a5.2 5.2 0 0 0-4.9 7.3l-7 7a2 2 0 1 0 2.8 2.8l7-7a5.2 5.2 0 0 0 6.9-6.9l-3 3-3-.8-.8-3z" /></>),
  warning: () => (<><path d="M12 3.6L21.4 20H2.6z" /><path d="M12 9.6v5" /><path d="M12 17.4v.2" /></>),
  info: () => (<><circle cx="12" cy="12" r="8.4" /><path d="M12 11v5.6" /><path d="M12 7.6v.2" /></>),
  link: () => (<><path d="M10.2 13.8a4 4 0 0 0 5.6 0l2.8-2.8a4 4 0 1 0-5.6-5.6l-1.4 1.4" /><path d="M13.8 10.2a4 4 0 0 0-5.6 0l-2.8 2.8a4 4 0 1 0 5.6 5.6l1.4-1.4" /></>),
  route: () => (<><circle cx="5.6" cy="6" r="2.6" /><circle cx="18.4" cy="18" r="2.6" /><path d="M5.6 8.6V13a4 4 0 0 0 4 4h6.2" /></>),
};

export interface IconProps {
  name: IconName;
  /** 图标边长（px）。默认取风格包的 iconography.size */
  size?: number;
  strokeWidth?: number;
  color?: string;
  style?: CSSProperties;
}

/** 裸图标。线宽与尺寸由调用方或风格包给。 */
export function Icon({ name, size = 24, strokeWidth = 1.5, color, style }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color ?? 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ flex: '0 0 auto', ...style }}
    >
      {PATHS[name]()}
    </svg>
  );
}

export interface IconTileProps extends IconProps {
  /** 容器规格。none 表示不装容器 */
  container: IconSpec['container'];
  containerTone: IconSpec['containerTone'];
  brandSoft: string;
  accentSoft: string;
  border: string;
  brand: string;
  accent: string;
}

/**
 * 图标 + 容器。容器形状与底色来自风格包的 iconography，
 * 所以同一个图标在「科技极简」里是方圆底品牌浅色，在「商务经典」里是裸线稿。
 */
export function IconTile({
  container, containerTone, brandSoft, accentSoft, border, brand, accent,
  size = 24, strokeWidth = 1.5, ...icon
}: IconTileProps) {
  const glyph = <Icon {...icon} size={size} strokeWidth={strokeWidth} />;
  if (container === 'none') return glyph;

  const radius = container === 'circle' ? 999 : container === 'squircle' ? size * 0.42 : 4;
  const box = Math.round(size * 1.85);
  const tone = containerTone === 'brand-soft' ? { bg: brandSoft, fg: brand, bd: 'transparent' }
    : containerTone === 'accent-soft' ? { bg: accentSoft, fg: accent, bd: 'transparent' }
      : containerTone === 'outline' ? { bg: 'transparent', fg: brand, bd: border }
        : { bg: 'transparent', fg: brand, bd: 'transparent' };

  return (
    <span
      style={{
        flex: '0 0 auto',
        width: box,
        height: box,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius,
        background: tone.bg,
        border: `1px solid ${tone.bd}`,
        color: tone.fg,
      }}
    >
      {glyph}
    </span>
  );
}

/** 有没有这个图标；用于外部传进来非法名字时兜底 */
export function hasIcon(name: string): name is IconName {
  return Object.prototype.hasOwnProperty.call(PATHS, name);
}
