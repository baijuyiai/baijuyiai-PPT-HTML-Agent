import type { ComponentProps } from 'react';
import * as Lucide from 'lucide-react';
import { cn } from './cn.js';

/**
 * 图标封装。
 * PRD §3.6 硬性约束：统一线性图标，线宽 1.5，尺寸仅 16/20/24，默认 currentColor，
 * 纯图标按钮必须有 aria-label。这里把线宽与尺寸约束收口到一处，避免调用方写飘。
 */
export type IconName = keyof typeof Lucide;

const ALLOWED_SIZES = [16, 20, 24] as const;
export type IconSize = (typeof ALLOWED_SIZES)[number];

export interface IconProps extends Omit<ComponentProps<'svg'>, 'ref'> {
  name: IconName;
  size?: IconSize;
  /** 纯装饰图标传 true，会被屏幕阅读器忽略 */
  decorative?: boolean;
}

export function Icon({ name, size = 20, decorative = true, className, ...rest }: IconProps) {
  const Cmp = Lucide[name] as React.ComponentType<ComponentProps<'svg'>> | undefined;
  if (!Cmp) {
    // 名字写错时退化为占位方块，而不是整页崩掉
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        className={className}
        aria-hidden={decorative}
        {...rest}
      >
        <rect x="4" y="4" width="16" height="16" rx="3" />
      </svg>
    );
  }
  return (
    <Cmp
      width={size}
      height={size}
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      color="currentColor"
      className={className}
      aria-hidden={decorative}
      {...rest}
    />
  );
}

/** 纯图标按钮必须显式提供 aria-label，否则运行时给出明显提示 */
export function IconButton({
  name,
  label,
  size = 20,
  className,
  ...rest
}: Omit<ComponentProps<'button'>, 'children'> & { name: IconName; label: string; size?: IconSize }) {
  if (!label) throw new Error('IconButton 必须提供 aria-label');
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-control)]',
        'text-[var(--text-2)] transition-colors duration-150 ease-out',
        'hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]',
        'disabled:cursor-not-allowed disabled:opacity-40',
        className,
      )}
      {...rest}
    >
      <Icon name={name} size={size} decorative />
    </button>
  );
}
