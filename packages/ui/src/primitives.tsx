import { forwardRef, type ComponentProps, type CSSProperties, type ReactNode } from 'react';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from './cn.js';
import { Icon, type IconName } from './Icon.js';

/* ---------------- Button ---------------- */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * 主按钮的底色与前景走 --cta-* 这组角色令牌，而不是写死品牌色。
 *
 * **字色必须跟着底走。** 主色是荧光绿，它很亮——白字压上去对比度只有 1.4:1，
 * 等于没写。`--cta-fg` 是「压在 cta-bg 上的字」，两套主题里都是深色。
 */
const VARIANT: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--cta-bg)] text-[var(--cta-fg)] hover:bg-[var(--cta-hover)] shadow-[0_1px_2px_rgba(0,0,0,.25)]',
  secondary:
    'bg-[var(--surface-0)] text-[var(--text-1)] border border-[var(--border)] hover:bg-[var(--surface-1)]',
  ghost: 'bg-transparent text-[var(--text-2)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]',
  danger: 'bg-[var(--error)] text-white hover:opacity-90',
  accent: 'bg-[var(--accent-500)] text-white hover:opacity-90',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-[13px] gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-[15px] gap-2',
};

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  /** 胶囊形。参考稿里所有动作按钮都是全圆角，方角只留给输入类控件 */
  pill?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, iconRight, loading, pill, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={rest.type ?? 'button'}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center font-medium',
        'transition-colors duration-150 ease-out select-none whitespace-nowrap',
        'disabled:cursor-not-allowed disabled:opacity-45',
        pill ? 'rounded-full' : 'rounded-[var(--radius-control)]',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon ? <Icon name={icon} size={size === 'sm' ? 16 : 20} /> : null}
      {children}
      {iconRight && !loading ? <Icon name={iconRight} size={size === 'sm' ? 16 : 20} /> : null}
    </button>
  );
});

function Spinner() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="animate-spin">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/* ---------------- Input / Textarea ---------------- */

export const Input = forwardRef<HTMLInputElement, ComponentProps<'input'>>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'h-9 w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-0)]',
        'px-3 text-sm text-[var(--text-1)] placeholder:text-[var(--text-3)]',
        'transition-colors duration-150 ease-out',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, ComponentProps<'textarea'>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      className={cn(
        'w-full rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-0)]',
        'px-3 py-2 text-sm leading-[1.6] text-[var(--text-1)] placeholder:text-[var(--text-3)]',
        'transition-colors duration-150 ease-out resize-y',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    />
  );
});

export function Field({
  label, hint, error, required, children, htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-[var(--text-2)]">
        {label}
        {required && <span className="ml-1 text-[var(--error)]">*</span>}
      </label>
      {children}
      {error ? (
        <span className="text-[12px] text-[var(--error)]">{error}</span>
      ) : hint ? (
        <span className="text-[12px] text-[var(--text-3)]">{hint}</span>
      ) : null}
    </div>
  );
}

/* ---------------- Badge ---------------- */

type BadgeTone = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'error';

const TONE: Record<BadgeTone, string> = {
  neutral: 'bg-[var(--surface-1)] text-[var(--text-2)] border-[var(--border)]',
  brand: 'bg-[var(--brand-100)] text-[var(--brand-600)] border-transparent',
  accent: 'bg-[var(--accent-100)] text-[var(--accent-500)] border-transparent',
  success: 'bg-transparent text-[var(--success)] border-[var(--success)]',
  warning: 'bg-transparent text-[var(--warning)] border-[var(--warning)]',
  error: 'bg-transparent text-[var(--error)] border-[var(--error)]',
};

export function Badge({
  tone = 'neutral', icon, children, className,
}: { tone?: BadgeTone; icon?: IconName; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        // 徽章是短标签，任何情况下都不该折行——列宽紧张时折行会把「普通用户」拆成两行
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-[12px] font-medium',
        TONE[tone],
        className,
      )}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </span>
  );
}

/* ---------------- Card ---------------- */

export function Card({ className, children, ...rest }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-0)]',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, description, action }: { title: ReactNode; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-[15px] font-semibold text-[var(--text-1)]">{title}</h3>
        {description && <p className="text-[13px] text-[var(--text-3)]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('p-5', className)}>{children}</div>;
}

/* ---------------- Skeleton ---------------- */

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div
      className={cn('rounded-[var(--radius-control)] bg-[var(--surface-1)]', className)}
      style={{ animation: 'lumen-skeleton var(--motion-skeleton) ease-in-out infinite', ...style }}
      aria-hidden="true"
    />
  );
}

/* ---------------- Progress ---------------- */

export function Progress({
  value, label, trackClassName = 'bg-[var(--surface-1)]',
}: {
  /** 0–1 的比例，不是百分数 */
  value: number;
  label?: string;
  /**
   * 轨道底色。默认 `--surface-1`——放在 `--surface-0` 的底上够用。
   * **卡片本身就是 `--surface-1` 时必须换一档**，否则轨道和卡片同色，整条进度条只剩前面那截。
   */
  trackClassName?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <div className="flex justify-between text-[12px] text-[var(--text-3)]">
          <span>{label}</span>
          <span className="font-[var(--font-mono)] tabular-nums">{pct}%</span>
        </div>
      )}
      <ProgressPrimitive.Root
        value={pct}
        className={cn('h-1.5 w-full overflow-hidden rounded-full', trackClassName)}
      >
        <ProgressPrimitive.Indicator
          className="h-full rounded-full bg-[var(--brand-500)] transition-[width] duration-200 ease-out"
          style={{ width: `${pct}%` }}
        />
      </ProgressPrimitive.Root>
    </div>
  );
}

/* ---------------- Switch ---------------- */

export function Switch({
  checked, onCheckedChange, label, disabled,
}: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <SwitchPrimitive.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ease-out',
          'data-[state=checked]:bg-[var(--brand-500)] data-[state=unchecked]:bg-[var(--neutral-300)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        {/*
          滑块在选中态取深色：轨道是荧光绿，白滑块压上去只有 1.5:1，
          看着像轨道上破了个洞。深色滑块才读得出「这是一枚开关」。
        */}
        <SwitchPrimitive.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow-[var(--shadow-sm)] transition-transform duration-150 ease-out data-[state=checked]:translate-x-[18px] data-[state=checked]:bg-[var(--brand-fg)]" />
      </SwitchPrimitive.Root>
      <span className="text-sm text-[var(--text-1)]">{label}</span>
    </div>
  );
}

/* ---------------- Table ---------------- */

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        // 表头是短标签，折行只会让列看起来歪，统一不换行
        'whitespace-nowrap border-b border-[var(--border)] px-4 py-2.5 text-left text-[12px] font-medium uppercase tracking-wider text-[var(--text-3)]',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className, title }: { children?: ReactNode; className?: string; title?: string }) {
  return (
    <td className={cn('border-b border-[var(--border)] px-4 py-3 text-[var(--text-1)]', className)} title={title}>
      {children}
    </td>
  );
}

/* ---------------- Empty / Loading ---------------- */

export function EmptyState({
  icon = 'Inbox', title, description, action,
}: { icon?: IconName; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface-1)] text-[var(--text-3)]">
        <Icon name={icon} size={24} />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium text-[var(--text-1)]">{title}</p>
        {description && <p className="max-w-md text-[13px] text-[var(--text-3)]">{description}</p>}
      </div>
      {action}
    </div>
  );
}
