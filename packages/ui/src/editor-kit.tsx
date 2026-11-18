import { useState, type ComponentProps, type ReactNode } from 'react';
import { cn } from './cn.js';
import { Icon, IconButton, type IconName } from './Icon.js';

/**
 * 编辑器外壳的零件。
 *
 * 这一组是为「项目详情」那类三栏工作台准备的：悬浮圆角窗口 + 图标竖栏 + 内嵌面板 +
 * 可折叠分区 + 组件磁贴 + 检查器行。参考稿里这几个东西反复出现，而且形态固定，
 * 收在这里之后各处不用再各写一遍 padding 和圆角。
 */

/* ---------------- 悬浮窗口 ---------------- */

/**
 * 整个应用悬浮在更深一层的背板上。
 *
 * 参考稿里都是这个结构：外面一圈深色背板，里面一个圆角窗口。
 * 它不只是装饰——窗口边界把「应用内」和「浏览器/桌面」分开，
 * 让里面的面板可以放心用同一层底色，靠 1px 描边分层，而不是靠一层层加亮。
 */
export function AppWindow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="h-full w-full bg-[var(--backdrop)] p-2.5">
      <div
        className={cn(
          'flex h-full min-h-0 w-full overflow-hidden rounded-[var(--radius-window)]',
          'border border-[var(--border)] bg-[var(--page-bg)] shadow-[var(--shadow-lg)]',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/* ---------------- 图标竖栏 ---------------- */

export interface RailItem {
  id: string;
  icon: IconName;
  label: string;
  badge?: number;
}

/**
 * 最左侧的图标竖栏。
 * 选中态是「左侧一条强调竖线 + 图标变亮」，而不是整块填充——
 * 竖栏很窄，整块填充会把图标挤得看不清形状。
 */
export function EditorRail({
  items, value, onChange, footer, className,
}: {
  items: RailItem[];
  value: string;
  onChange: (id: string) => void;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <nav
      aria-label="工作台导航"
      className={cn('flex w-[56px] shrink-0 flex-col items-center gap-1 border-r border-[var(--border-subtle)] py-3', className)}
    >
      {items.map((it) => {
        const active = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            title={it.label}
            aria-label={it.label}
            aria-current={active ? 'page' : undefined}
            onClick={() => onChange(it.id)}
            className={cn(
              'relative flex h-9 w-9 items-center justify-center rounded-[var(--radius-inner)] transition-colors duration-150 ease-out',
              active
                ? 'bg-[var(--brand-500)]/14 text-[var(--brand-600)]'
                : 'text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]',
            )}
          >
            {active && (
              <span className="absolute -left-3 h-4 w-[2px] rounded-full bg-[var(--brand-600)]" aria-hidden="true" />
            )}
            <Icon name={it.icon} size={20} />
            {it.badge !== undefined && it.badge > 0 && (
              <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[var(--brand-500)] px-1 text-[9px] font-semibold text-[var(--brand-fg)]">
                {it.badge > 99 ? '99+' : it.badge}
              </span>
            )}
          </button>
        );
      })}
      {footer && <div className="mt-auto flex flex-col items-center gap-1">{footer}</div>}
    </nav>
  );
}

/* ---------------- 面板 ---------------- */

export function EditorPanel({
  title, actions, children, footer, width, className, bodyClassName,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** 固定宽度；不传则由父级 grid 决定 */
  width?: number;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      style={width ? { width } : undefined}
      className={cn('flex min-h-0 min-w-0 flex-col bg-[var(--surface-0)]', className)}
    >
      {title && (
        <header className="flex h-11 shrink-0 items-center gap-2 px-3">
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-[var(--text-1)]">{title}</span>
          {actions}
        </header>
      )}
      <div className={cn('min-h-0 flex-1 overflow-y-auto lumen-scroll', bodyClassName)}>{children}</div>
      {footer && (
        <div className="shrink-0 border-t border-[var(--border-subtle)] p-2.5">{footer}</div>
      )}
    </section>
  );
}

/**
 * 可折叠分区。
 *
 * 检查器里分区很多，全部展开会长到需要一直滚；折叠起来之后
 * 用户能先看到分区名再决定展开哪一个，找东西比通读快得多。
 */
export function PanelSection({
  title, icon, defaultOpen = true, actions, children, dense,
}: {
  title: string;
  icon?: IconName;
  defaultOpen?: boolean;
  actions?: ReactNode;
  children: ReactNode;
  /** 紧凑模式：用于分区很多、每块内容很少的面板 */
  dense?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-[var(--border-subtle)] last:border-b-0">
      <div className="flex items-center gap-1 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-[var(--radius-inner)] px-1.5 py-1 text-left transition-colors duration-150 ease-out hover:bg-[var(--surface-1)]"
        >
          <Icon
            name="ChevronRight"
            size={16}
            className={cn('shrink-0 text-[var(--text-3)] transition-transform duration-150 ease-out', open && 'rotate-90')}
          />
          {icon && <Icon name={icon} size={16} className="shrink-0 text-[var(--text-3)]" />}
          <span className="truncate text-[12px] font-medium text-[var(--text-2)]">{title}</span>
        </button>
        {actions}
      </div>
      {open && <div className={cn('flex flex-col', dense ? 'gap-1 px-2.5 pb-2.5' : 'gap-2.5 px-2.5 pb-3.5')}>{children}</div>}
    </div>
  );
}

/* ---------------- 检查器行 ---------------- */

/** 左标签右控件的一行。检查器里九成的内容都是这个形状 */
export function FieldRow({
  label, hint, children, align = 'center',
}: { label: ReactNode; hint?: string; children: ReactNode; align?: 'center' | 'start' }) {
  return (
    <div className={cn('flex gap-3', align === 'start' ? 'items-start' : 'items-center')}>
      <span
        title={hint}
        className={cn('w-[52px] shrink-0 text-[12px] text-[var(--text-3)]', align === 'start' && 'pt-2')}
      >
        {label}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** 深色圆角数值输入。参考稿里数值一律右对齐，方便上下扫读对齐 */
export function NumberField({
  value, onChange, suffix, min, max, step = 1, disabled, ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <span
      className={cn(
        'flex h-8 items-center gap-1 rounded-[var(--radius-inner)] border border-[var(--border)] bg-[var(--page-bg)] px-2',
        'transition-colors duration-150 ease-out focus-within:border-[var(--brand-600)]',
        disabled && 'opacity-45',
      )}
    >
      <input
        type="number"
        aria-label={ariaLabel}
        value={Number.isFinite(value) ? value : 0}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        className="lumen-focus-on-wrapper w-full min-w-0 bg-transparent text-right font-[var(--font-mono)] text-[12px] tabular-nums text-[var(--text-1)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
      />
      {suffix && <span className="shrink-0 font-[var(--font-mono)] text-[11px] text-[var(--text-3)]">{suffix}</span>}
    </span>
  );
}

/** 一排图标切换，单选。参考稿里用它做对齐方式、溢出行为、显示模式这类开关 */
export function IconToggleRow<T extends string>({
  value, options, onChange, ariaLabel,
}: {
  value: T;
  options: { value: T; icon: IconName; label: string }[];
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex items-center gap-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.label}
            title={o.label}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex h-8 flex-1 items-center justify-center rounded-[var(--radius-inner)] transition-colors duration-150 ease-out',
              active
                ? 'bg-[var(--brand-500)]/16 text-[var(--brand-600)]'
                : 'text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]',
            )}
          >
            <Icon name={o.icon} size={16} />
          </button>
        );
      })}
    </div>
  );
}

/** 带彩色圆点的状态药丸。用色相而不是只靠文字，一屏里能一眼扫出哪些不正常 */
export function StatusPill({
  tone = 'neutral', children, icon, className,
}: {
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'error' | 'info';
  children: ReactNode;
  icon?: IconName;
  className?: string;
}) {
  const TONE = {
    neutral: 'bg-[var(--surface-1)] text-[var(--text-2)]',
    brand: 'bg-[var(--brand-500)]/14 text-[var(--brand-600)]',
    success: 'bg-[var(--success)]/14 text-[var(--success)]',
    warning: 'bg-[var(--warning)]/16 text-[var(--warning)]',
    error: 'bg-[var(--error)]/14 text-[var(--error)]',
    info: 'bg-[var(--info)]/14 text-[var(--info)]',
  } as const;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium',
        TONE[tone],
        className,
      )}
    >
      {icon ? <Icon name={icon} size={16} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ---------------- 组件磁贴 ---------------- */

/**
 * 方形图标磁贴。用在「插入什么」这类选择上：图标 + 名称。
 * 比下拉菜单好，是因为可选项就那么几个，摊开比藏起来少一次点击。
 */
export function Tile({
  icon, label, active, onClick, disabled, className,
}: {
  icon: IconName;
  label: string;
  active?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex flex-col items-center gap-2 rounded-[var(--radius-tile)] px-2 py-3',
        'transition-colors duration-150 ease-out',
        active
          ? 'bg-[var(--brand-500)]/14 text-[var(--brand-600)]'
          : 'text-[var(--text-3)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]',
        disabled && 'cursor-not-allowed opacity-40 hover:bg-transparent',
        className,
      )}
    >
      <Icon name={icon} size={24} />
      <span className="w-full truncate text-center text-[11px]">{label}</span>
    </button>
  );
}

/** 磁贴网格，三列 */
export function TileGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('grid grid-cols-3 gap-1.5', className)}>{children}</div>;
}

/** 方形图标容器。用于列表行前面那枚小图标 */
export function IconTile({
  icon, tone = 'neutral', size = 36, className,
}: {
  icon: IconName;
  tone?: 'neutral' | 'brand' | 'success' | 'warning' | 'error' | 'info';
  size?: number;
  className?: string;
}) {
  const TONE = {
    neutral: 'bg-[var(--surface-1)] text-[var(--text-2)]',
    brand: 'bg-[var(--brand-500)]/14 text-[var(--brand-600)]',
    success: 'bg-[var(--success)]/14 text-[var(--success)]',
    warning: 'bg-[var(--warning)]/16 text-[var(--warning)]',
    error: 'bg-[var(--error)]/14 text-[var(--error)]',
    info: 'bg-[var(--info)]/14 text-[var(--info)]',
  } as const;
  return (
    <span
      style={{ width: size, height: size }}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-[var(--radius-inner)]',
        TONE[tone],
        className,
      )}
    >
      <Icon name={icon} size={size >= 36 ? 20 : 16} />
    </span>
  );
}

/* ---------------- 搜索框 ---------------- */

/** 面板内的搜索框。带左侧放大镜与右侧快捷键提示，形态与参考稿一致 */
export function SearchField({
  value, onChange, placeholder, shortcut, className, ...rest
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  shortcut?: string;
  className?: string;
} & Omit<ComponentProps<'input'>, 'value' | 'onChange' | 'placeholder' | 'className'>) {
  return (
    <div
      className={cn(
        'flex h-8 items-center gap-2 rounded-[var(--radius-inner)] border border-[var(--border)] bg-[var(--page-bg)] px-2.5',
        'transition-colors duration-150 ease-out focus-within:border-[var(--brand-600)]',
        className,
      )}
    >
      <Icon name="Search" size={16} className="shrink-0 text-[var(--text-3)]" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="lumen-focus-on-wrapper min-w-0 flex-1 bg-transparent text-[12px] text-[var(--text-1)] placeholder:text-[var(--text-3)]"
        {...rest}
      />
      {shortcut && (
        <kbd className="shrink-0 rounded-[4px] border border-[var(--border)] px-1 font-[var(--font-mono)] text-[10px] text-[var(--text-3)]">
          {shortcut}
        </kbd>
      )}
    </div>
  );
}

/* ---------------- 空态 ---------------- */

export function PanelEmpty({ icon, title, description, action }: {
  icon: IconName; title: string; description?: string; action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-5 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-[var(--radius-tile)] bg-[var(--surface-1)] text-[var(--text-3)]">
        <Icon name={icon} size={24} />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-[13px] font-medium text-[var(--text-1)]">{title}</p>
        {description && <p className="max-w-[240px] text-[12px] leading-[1.6] text-[var(--text-3)]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export { IconButton };
