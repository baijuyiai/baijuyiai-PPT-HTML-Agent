import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type CSSProperties, type ReactNode,
} from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from './cn.js';
import { Icon, IconButton, type IconName } from './Icon.js';
import { Button } from './primitives.js';

/* ---------------- Dialog ---------------- */

export function Dialog({
  open, onOpenChange, title, description, children, footer, width = 520,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)] backdrop-blur-[1px] data-[state=open]:animate-[lumen-fade_150ms_ease-out]" />
        <DialogPrimitive.Content
          style={{ width }}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 max-h-[86vh] -translate-x-1/2 -translate-y-1/2',
            'flex flex-col overflow-hidden rounded-[var(--radius-popover)] border border-[var(--border)]',
            'bg-[var(--surface-0)] shadow-[var(--shadow-md)]',
            'data-[state=open]:animate-[lumen-scale-in_200ms_ease-out]',
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
            <div className="flex flex-col gap-1">
              <DialogPrimitive.Title className="text-[15px] font-semibold text-[var(--text-1)]">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-[13px] text-[var(--text-3)]">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton name="X" label="关闭" size={16} />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3.5">{footer}</div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ConfirmDialog({
  open, onOpenChange, title, description, confirmText = '确认', danger, onConfirm, loading,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  confirmText?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      {...(description ? { description } : {})}
      width={440}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>取消</Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            loading={loading}
            onClick={() => void onConfirm()}
          >
            {confirmText}
          </Button>
        </>
      }
    />
  );
}

/* ---------------- Drawer ---------------- */

export function Drawer({
  open, onOpenChange, title, description, children, footer, width = 480, side = 'right',
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  footer?: ReactNode;
  width?: number;
  side?: 'right' | 'left';
}) {
  const panelStyle: CSSProperties = side === 'right' ? { width, right: 0 } : { width, left: 0 };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[var(--scrim)] data-[state=open]:animate-[lumen-fade_150ms_ease-out]" />
        <DialogPrimitive.Content
          style={panelStyle}
          className={cn(
            'fixed top-0 z-50 flex h-full flex-col border-[var(--border)] bg-[var(--surface-0)] shadow-[var(--shadow-md)]',
            side === 'right' ? 'border-l' : 'border-r',
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] px-5 py-4">
            <div className="flex flex-col gap-1">
              <DialogPrimitive.Title className="text-[15px] font-semibold text-[var(--text-1)]">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-[13px] text-[var(--text-3)]">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton name="X" label="关闭" size={16} />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-[var(--border)] px-5 py-3.5">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/* ---------------- Tooltip ---------------- */

export function TooltipProvider({ children }: { children: ReactNode }) {
  return <TooltipPrimitive.Provider delayDuration={280}>{children}</TooltipPrimitive.Provider>;
}

export function Tooltip({ content, children }: { content: string; children: ReactNode }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={6}
          className="z-[60] rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-0)] px-2.5 py-1.5 text-[12px] text-[var(--text-1)] shadow-[var(--shadow-sm)]"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/* ---------------- Toast ---------------- */

export type ToastTone = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
}

interface ToastApi {
  push: (t: Omit<ToastItem, 'id'>) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TOAST_ICON: Record<ToastTone, IconName> = {
  info: 'Info',
  success: 'CircleCheck',
  warning: 'TriangleAlert',
  error: 'CircleAlert',
};

const TOAST_COLOR: Record<ToastTone, string> = {
  info: 'var(--info)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  error: 'var(--error)',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((t: Omit<ToastItem, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    setItems((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), 4600);
  }, []);

  const api = useMemo<ToastApi>(() => ({
    push,
    success: (title, description) => push({ tone: 'success', title, ...(description ? { description } : {}) }),
    error: (title, description) => push({ tone: 'error', title, ...(description ? { description } : {}) }),
    info: (title, description) => push({ tone: 'info', title, ...(description ? { description } : {}) }),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[80] flex w-[360px] flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-0)] px-4 py-3 shadow-[var(--shadow-md)]"
            style={{ animation: 'lumen-fade-up 200ms var(--ease-out) both' }}
            role="status"
          >
            <span style={{ color: TOAST_COLOR[t.tone], marginTop: 1 }}>
              <Icon name={TOAST_ICON[t.tone]} size={20} />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-sm font-medium text-[var(--text-1)]">{t.title}</p>
              {t.description && <p className="text-[13px] leading-[1.5] text-[var(--text-3)]">{t.description}</p>}
            </div>
            <IconButton name="X" label="关闭提示" size={16} onClick={() => setItems((p) => p.filter((x) => x.id !== t.id))} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用');
  return ctx;
}

/* ---------------- 主题切换 ---------------- */

export type ThemeMode = 'light' | 'dark';

export function useTheme(): { theme: ThemeMode; toggle: () => void; set: (m: ThemeMode) => void } {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    /**
     * **默认深色**。存过 `lumen-theme` 的用户照旧读自己的选择，不会被强切；
     * 只有从没选过的人拿到这个默认值。
     *
     * `index.html` 里那段阻塞脚本必须跟着改——它管的是**首帧**，
     * 只改这里的话每次打开都会先闪一下浅色再跳成深色。
     */
    if (typeof window === 'undefined') return 'dark';
    const saved = window.localStorage.getItem('lumen-theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    window.localStorage.setItem('lumen-theme', theme);
  }, [theme]);

  return {
    theme,
    toggle: () => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')),
    set: setThemeState,
  };
}

/** 页面级 loading 遮罩。Esc 关闭由 Radix 负责，这里只提供统一的加载态。 */
export function PageLoader({ label = '加载中' }: { label?: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center gap-3 text-[var(--text-3)]">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="animate-spin">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <span className="text-sm">{label}</span>
    </div>
  );
}
