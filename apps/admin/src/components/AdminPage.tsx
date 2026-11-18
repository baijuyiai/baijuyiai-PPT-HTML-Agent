import type { ReactNode } from 'react';

/** 后台各页统一的内容容器：标题区 + 可滚动正文 */
export function AdminPage({
  title, description, actions, children, width = 'wide',
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  /** narrow 用于表单类页面，避免输入框被拉得过宽 */
  width?: 'wide' | 'narrow';
}) {
  return (
    <div className={width === 'narrow' ? 'mx-auto w-full max-w-[860px] px-6 py-6' : 'w-full px-6 py-6'}>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[18px] font-semibold tracking-tight text-[var(--text-1)]">{title}</h1>
          {description && <p className="text-[13px] leading-[1.6] text-[var(--text-3)]">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

/** 指标卡：概览页与详情页复用 */
export function StatCard({
  label, value, hint, icon, tone = 'default',
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  tone?: 'default' | 'warning' | 'error';
}) {
  const valueColor = tone === 'error'
    ? 'text-[var(--error)]'
    : tone === 'warning'
      ? 'text-[var(--warning)]'
      : 'text-[var(--text-1)]';
  return (
    <div className="flex flex-col gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-0)] p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-[var(--text-3)]">{label}</span>
        {icon}
      </div>
      <span className={`text-[24px] font-semibold tracking-tight ${valueColor}`}>{value}</span>
      {hint && <span className="text-[12px] text-[var(--text-3)]">{hint}</span>}
    </div>
  );
}

/** 加载失败时的统一呈现，避免空白页让人误以为没数据 */
export function LoadError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-0)] p-5">
      <p className="text-[13px] text-[var(--error)]">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="text-[13px] font-medium text-[var(--brand-600)] hover:underline"
        >
          重新加载
        </button>
      )}
    </div>
  );
}
