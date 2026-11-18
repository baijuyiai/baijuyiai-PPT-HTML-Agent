import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from './cn.js';
import { Icon, type IconName } from './Icon.js';
import { Input } from './primitives.js';

/* ---------------- Tabs ---------------- */

/**
 * 页签。
 *
 * 注意：面板必须作为 children 传进来，不能写成同级的 <TabPanel>。
 * Radix 要求 Content 在 Root 之内，而这里 Root 由本组件渲染——
 * 写成兄弟节点会让 Radix 直接抛「TabsContent must be used within Tabs」，整页白屏。
 *
 *   <Tabs value={tab} onValueChange={setTab} items={ITEMS}>
 *     <TabPanel value="a">…</TabPanel>
 *   </Tabs>
 */
export function Tabs({
  value, onValueChange, items, className, listClassName, variant = 'underline', columns = 3, children, iconOnly,
}: {
  value: string;
  onValueChange: (v: string) => void;
  items: { value: string; label: string; icon?: IconName }[];
  className?: string;
  /** 页签行自己的样式。面板要撑满高度时，Root 是 flex 容器，内边距只能加在这一行上 */
  listClassName?: string;
  children?: ReactNode;
  /** 只出图标，名称放 title 提示。图标本身有辨识度时，一行能放下更多页签 */
  iconOnly?: boolean;
  /**
   * underline：一行排开，适合页签少的宽容器。
   * grid：等宽多行，适合窄栏里的多页签——一行放不下时会把后面的页签挤出可视区，
   * 用户根本点不到。宁可换行也不隐藏。
   */
  variant?: 'underline' | 'grid';
  /** variant='grid' 时的列数 */
  columns?: number;
}) {
  const grid = variant === 'grid';
  return (
    <TabsPrimitive.Root value={value} onValueChange={onValueChange} className={className}>
      <TabsPrimitive.List
        className={cn(
          listClassName,
          grid
            // 分段控件形态：一条更暗的轨道，选中项是浮起来的一块。
            // 比下划线更适合窄栏——下划线在窄栏里要用户先找到「哪一条是亮的」，
            // 而填充块是一整块面，扫一眼就能定位。
            ? 'grid gap-0.5 rounded-[var(--radius-control)] bg-[var(--surface-1)] p-0.5'
            : 'flex items-center gap-1 border-b border-[var(--border-subtle)]',
        )}
        style={grid ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
      >
        {items.map((it) => (
          <TabsPrimitive.Trigger
            key={it.value}
            value={it.value}
            title={it.label}
            aria-label={it.label}
            className={cn(
              'inline-flex items-center justify-center border-b-2 border-transparent font-medium',
              'transition-colors duration-150 ease-out',
              grid
                ? cn(
                  'min-w-0 gap-1.5 rounded-[var(--radius-inner)] px-1 py-1.5 text-[12px]',
                  'text-[var(--text-3)] hover:text-[var(--text-1)]',
                  'data-[state=active]:bg-[var(--surface-elevated)] data-[state=active]:text-[var(--text-1)]',
                  'data-[state=active]:shadow-[var(--shadow-sm)]',
                )
                : cn(
                  'gap-2 px-3 py-2.5 text-[13px] text-[var(--text-3)] hover:text-[var(--text-1)]',
                  'data-[state=active]:border-[var(--brand-600)] data-[state=active]:text-[var(--text-1)]',
                ),
            )}
          >
            {it.icon && <Icon name={it.icon} size={16} />}
            {!iconOnly && <span className="truncate">{it.label}</span>}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  );
}

export function TabPanel({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  return (
    <TabsPrimitive.Content value={value} className={cn('pt-4 focus:outline-none', className)}>
      {children}
    </TabsPrimitive.Content>
  );
}

/* ---------------- Select ---------------- */

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
  /** 置灰不可选。用于「功能存在但当前不可用」，比直接隐藏更容易让人理解为什么没有 */
  disabled?: boolean;
}

export function Select({
  value, onValueChange, options, placeholder = '请选择', disabled, ariaLabel, className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  ariaLabel: string;
  className?: string;
}) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        aria-label={ariaLabel}
        className={cn(
          'inline-flex h-9 w-full items-center justify-between gap-2 rounded-[var(--radius-control)]',
          'border border-[var(--border)] bg-[var(--surface-0)] px-3 text-sm text-[var(--text-1)]',
          'transition-colors duration-150 ease-out hover:bg-[var(--surface-1)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <Icon name="ChevronDown" size={16} />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className="z-[70] max-h-[320px] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-0)] shadow-[var(--shadow-md)]"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((o) => (
              <SelectPrimitive.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled ?? false}
                className={cn(
                  'relative flex cursor-pointer select-none flex-col gap-0.5 rounded-[6px] px-2.5 py-2',
                  'text-sm text-[var(--text-1)] outline-none',
                  'data-[highlighted]:bg-[var(--surface-1)]',
                  'data-[state=checked]:text-[var(--brand-600)]',
                  'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45',
                )}
              >
                <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                {o.description && <span className="text-[12px] text-[var(--text-3)]">{o.description}</span>}
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/* ---------------- DropdownMenu ---------------- */

export function DropdownMenu({
  trigger, items, align = 'end',
}: {
  trigger: ReactNode;
  items: ({ label: string; icon?: IconName; onSelect: () => void; danger?: boolean } | 'separator')[];
  align?: 'start' | 'end';
}) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild>{trigger}</DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align={align}
          sideOffset={6}
          className="z-[70] min-w-[180px] overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-0)] p-1 shadow-[var(--shadow-md)]"
        >
          {items.map((it, i) =>
            it === 'separator' ? (
              <DropdownMenuPrimitive.Separator key={i} className="my-1 h-px bg-[var(--border)]" />
            ) : (
              <DropdownMenuPrimitive.Item
                key={i}
                onSelect={it.onSelect}
                className={cn(
                  'flex cursor-pointer select-none items-center gap-2 rounded-[6px] px-2.5 py-2 text-sm outline-none',
                  'data-[highlighted]:bg-[var(--surface-1)]',
                  it.danger ? 'text-[var(--error)]' : 'text-[var(--text-1)]',
                )}
              >
                {it.icon && <Icon name={it.icon} size={16} />}
                {it.label}
              </DropdownMenuPrimitive.Item>
            ),
          )}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

/* ---------------- Command（可搜索命令面板） ---------------- */

export interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  icon?: IconName;
  group?: string;
  onSelect: () => void;
}

export function Command({
  open, onOpenChange, items, placeholder = '搜索', emptyText = '没有匹配项',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: CommandItem[];
  placeholder?: string;
  emptyText?: string;
}) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => `${i.label} ${i.hint ?? ''} ${i.group ?? ''}`.toLowerCase().includes(q));
  }, [items, query]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    setActive((a) => Math.min(a, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((a) => Math.max(a - 1, 0));
      } else if (e.key === 'Enter') {
        const item = filtered[active];
        if (item) {
          e.preventDefault();
          item.onSelect();
          onOpenChange(false);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filtered, active, onOpenChange]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center bg-[var(--scrim)] pt-[14vh]" onClick={() => onOpenChange(false)}>
      <div
        className="w-[560px] overflow-hidden rounded-[var(--radius-popover)] border border-[var(--border)] bg-[var(--surface-0)] shadow-[var(--shadow-md)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="命令面板"
      >
        <div className="border-b border-[var(--border)] p-2">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
          />
        </div>
        <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-[var(--text-3)]">{emptyText}</p>
          ) : (
            filtered.map((it, i) => (
              <button
                key={it.id}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  it.onSelect();
                  onOpenChange(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-[6px] px-3 py-2 text-left text-sm',
                  i === active ? 'bg-[var(--surface-1)] text-[var(--text-1)]' : 'text-[var(--text-2)]',
                )}
              >
                {it.icon && <Icon name={it.icon} size={16} />}
                <span className="flex-1 truncate">{it.label}</span>
                {it.hint && <span className="text-[12px] text-[var(--text-3)]">{it.hint}</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Breadcrumb ---------------- */

export function Breadcrumb({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-[13px] text-[var(--text-3)]" aria-label="面包屑">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <Icon name="ChevronRight" size={16} />}
          {it.onClick ? (
            <button type="button" onClick={it.onClick} className="transition-colors hover:text-[var(--text-1)]">
              {it.label}
            </button>
          ) : (
            <span className="text-[var(--text-1)]">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
