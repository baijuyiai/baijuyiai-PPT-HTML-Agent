import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { cn } from './cn.js';
import { Icon, type IconName } from './Icon.js';

/**
 * 数据展示组件。
 *
 * 这一组的存在理由：平台里到处是「一个数字 + 一句说明 + 一个变化趋势」，
 * 之前每处都手搓一遍，于是同一件事在三个页面上有三种字号和三种对齐。
 * 统一到这里之后，改一次全局一致。
 */

/* ---------------- 玻璃卡片 ---------------- */

export function GlassCard({
  className, children, padded = true, ...rest
}: { className?: string; children: ReactNode; padded?: boolean } & Omit<ComponentProps<'div'>, 'children'>) {
  return (
    <div
      className={cn(
        'lumen-glass rounded-[var(--radius-card)]',
        padded && 'p-5',
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ---------------- 迷你折线 ---------------- */

/**
 * 迷你折线。纯内联 SVG，不走图表库——
 * 一屏上可能同时有十几个这种小图，每个都起一次 ECharts 渲染管线代价太大。
 */
export function Sparkline({
  values, width = 96, height = 28, color = 'var(--brand-600)', fill = true, className,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
  className?: string;
}) {
  if (values.length < 2) {
    return <span className={cn('inline-block', className)} style={{ width, height }} aria-hidden="true" />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pad = 2;
  const step = (width - pad * 2) / (values.length - 1);
  const pts = values.map((v, i) => {
    const x = pad + i * step;
    const y = pad + (1 - (v - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1]![0].toFixed(1)} ${height} L${pts[0]![0].toFixed(1)} ${height} Z`;
  const id = `spark-${Math.abs(values.reduce((a, b) => a * 31 + b, 7)).toString(36)}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={className} aria-hidden="true">
      {fill && (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${id})`} />
        </>
      )}
      <path d={line} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------------- 指标块 ---------------- */

export interface StatTileProps {
  label: string;
  value: ReactNode;
  /** 同比/环比之类的变化说明 */
  delta?: string;
  /** delta 是正向还是负向。决定用成功色还是错误色 */
  deltaTone?: 'up' | 'down' | 'flat';
  hint?: string;
  icon?: IconName;
  spark?: number[];
  className?: string;
}

export function StatTile({
  label, value, delta, deltaTone = 'flat', hint, icon, spark, className,
}: StatTileProps) {
  const tone = deltaTone === 'up' ? 'text-[var(--success)]'
    : deltaTone === 'down' ? 'text-[var(--error)]' : 'text-[var(--text-3)]';
  return (
    <GlassCard className={cn('flex flex-col gap-3', className)}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-[13px] text-[var(--text-3)]">{label}</span>
        {icon && (
          <span className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-inner)] bg-[var(--surface-1)] text-[var(--text-2)]">
            <Icon name={icon} size={16} />
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="lumen-num text-[28px] font-semibold leading-none text-[var(--text-1)]">{value}</span>
          {(delta || hint) && (
            <span className={cn('text-[12px]', delta ? tone : 'text-[var(--text-3)]')}>
              {delta ?? hint}
            </span>
          )}
        </div>
        {spark && spark.length >= 2 && (
          <Sparkline
            values={spark}
            color={deltaTone === 'down' ? 'var(--error)' : 'var(--brand-600)'}
            className="shrink-0"
          />
        )}
      </div>
    </GlassCard>
  );
}

/* ---------------- 环形占比 ---------------- */

export interface DonutSegment { label: string; value: number; color: string }

/** 环形占比图。用 stroke-dasharray 画弧，不需要图表库 */
export function DonutRing({
  segments, size = 120, thickness = 12, centerLabel, centerHint,
}: {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerLabel?: ReactNode;
  centerHint?: string;
}) {
  const total = segments.reduce((n, s) => n + Math.max(0, s.value), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--surface-1)" strokeWidth={thickness}
        />
        {total > 0 && segments.map((s, i) => {
          const len = (Math.max(0, s.value) / total) * c;
          const dash = `${len} ${c - len}`;
          const el = (
            <circle
              key={i}
              cx={size / 2} cy={size / 2} r={r}
              fill="none" stroke={s.color} strokeWidth={thickness}
              strokeDasharray={dash} strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      {(centerLabel || centerHint) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span className="lumen-num text-[20px] font-semibold text-[var(--text-1)]">{centerLabel}</span>
          {centerHint && <span className="text-[11px] text-[var(--text-3)]">{centerHint}</span>}
        </div>
      )}
    </div>
  );
}

/** 环形图例。与 DonutRing 配对使用 */
export function DonutLegend({ segments, className }: { segments: DonutSegment[]; className?: string }) {
  const total = segments.reduce((n, s) => n + Math.max(0, s.value), 0) || 1;
  return (
    <ul className={cn('flex flex-col gap-2', className)}>
      {segments.map((s) => (
        <li key={s.label} className="flex items-center gap-2 text-[13px]">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: s.color }} />
          <span className="min-w-0 flex-1 truncate text-[var(--text-2)]">{s.label}</span>
          <span className="lumen-num shrink-0 text-[var(--text-3)]">
            {((Math.max(0, s.value) / total) * 100).toFixed(0)}%
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- 条形分布 ---------------- */

/** 横向条形分布。比饼图更适合「十几个类别比大小」 */
export function BarMeter({
  items, className, max: maxOverride,
}: {
  items: { label: string; value: number; hint?: string; color?: string }[];
  className?: string;
  max?: number;
}) {
  const max = maxOverride ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className={cn('flex flex-col gap-2.5', className)}>
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-3">
          <span className="w-[38%] min-w-0 truncate text-[13px] text-[var(--text-2)]" title={it.label}>
            {it.label}
          </span>
          <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-1)]">
            <span
              className="block h-full rounded-full transition-[width] duration-200 ease-out"
              style={{ width: `${(it.value / max) * 100}%`, background: it.color ?? 'var(--brand-500)' }}
            />
          </span>
          <span className="lumen-num w-10 shrink-0 text-right text-[12px] text-[var(--text-3)]">
            {it.hint ?? it.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ---------------- 分段控件 ---------------- */

export interface SegmentedOption<T extends string> { value: T; label: string; icon?: IconName }

export function SegmentedControl<T extends string>({
  value, options, onChange, size = 'md', className,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        // 胶囊容器 + 浮起药丸。参考图里顶部那套切换就是这个形状，圆角不用更小的一档
        'inline-flex items-center gap-0.5 rounded-full bg-[var(--surface-1)] p-0.5',
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full font-medium transition-colors duration-150 ease-out',
              size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-8 px-3 text-[13px]',
              active
                ? 'bg-[var(--surface-elevated)] text-[var(--text-1)] shadow-[var(--shadow-sm)]'
                : 'text-[var(--text-3)] hover:text-[var(--text-1)]',
            )}
          >
            {o.icon && <Icon name={o.icon} size={16} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- 头像堆叠 ---------------- */

export function AvatarStack({
  items, size = 28, max = 5,
}: {
  items: { label: string; src?: string; color?: string }[];
  size?: number;
  max?: number;
}) {
  const shown = items.slice(0, max);
  const rest = items.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((it, i) => (
        <span
          key={i}
          title={it.label}
          className="flex items-center justify-center overflow-hidden rounded-full border-2 border-[var(--surface-0)] bg-[var(--surface-1)] text-[11px] font-medium text-[var(--text-2)]"
          style={{ width: size, height: size, marginLeft: i === 0 ? 0 : -size / 3.2, zIndex: shown.length - i, background: it.color }}
        >
          {it.src ? <img src={it.src} alt={it.label} className="h-full w-full object-cover" /> : it.label.slice(0, 1)}
        </span>
      ))}
      {rest > 0 && (
        <span
          className="flex items-center justify-center rounded-full border-2 border-[var(--surface-0)] bg-[var(--surface-1)] text-[11px] text-[var(--text-3)]"
          style={{ width: size, height: size, marginLeft: -size / 3.2 }}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}

/* ---------------- 区块标题 ---------------- */

export function SectionTitle({
  title, description, action, icon, className,
}: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: IconName; className?: string }) {
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <div className="flex items-start gap-3">
        {icon && (
          <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-[var(--radius-inner)] bg-[var(--brand-100)] text-[var(--brand-600)]">
            <Icon name={icon} size={20} />
          </span>
        )}
        <div className="flex flex-col gap-0.5">
          <h2 className="text-[15px] font-semibold text-[var(--text-1)]">{title}</h2>
          {description && <p className="text-[13px] leading-[1.6] text-[var(--text-3)]">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

/* ---------------- 键值对 ---------------- */

export function KeyValueList({
  items, className, columns = 1,
}: {
  items: { key: string; value: ReactNode; hint?: string }[];
  className?: string;
  columns?: 1 | 2;
}) {
  return (
    <dl
      className={cn('grid gap-x-6 gap-y-3', columns === 2 ? 'grid-cols-2' : 'grid-cols-1', className)}
    >
      {items.map((it) => (
        <div key={it.key} className="flex min-w-0 flex-col gap-1 border-b border-[var(--border-subtle)] pb-2.5">
          <dt className="text-[12px] text-[var(--text-3)]">{it.key}</dt>
          <dd className="min-w-0 text-[13px] text-[var(--text-1)]">{it.value}</dd>
          {it.hint && <span className="text-[11px] leading-[1.5] text-[var(--text-3)]">{it.hint}</span>}
        </div>
      ))}
    </dl>
  );
}

/* ---------------- 色板 ---------------- */

export function ColorSwatches({
  colors, className, size = 40,
}: { colors: { hex: string; label: string }[]; className?: string; size?: number }) {
  return (
    <div className={cn('flex flex-wrap gap-3', className)}>
      {colors.map((c) => (
        <div key={`${c.label}-${c.hex}`} className="flex w-[72px] flex-col gap-1.5">
          <span
            className="rounded-[var(--radius-inner)] border border-[var(--border-subtle)]"
            style={{ width: size, height: size, background: c.hex }}
          />
          <span className="truncate text-[11px] text-[var(--text-2)]" title={c.label}>{c.label}</span>
          <span className="lumen-num truncate text-[10px] text-[var(--text-3)]">{c.hex}</span>
        </div>
      ))}
    </div>
  );
}

/** 给「未测量 / 推测值」用的标记，避免把猜测当结论展示 */
export function InferredTag({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border border-dashed border-[var(--border)] px-2 py-0.5 text-[11px] text-[var(--text-3)]',
        className,
      )}
      style={style}
      title="这项不是从素材里量出来的，是沿用基准族的取值"
    >
      <Icon name="Info" size={16} />
      {children}
    </span>
  );
}
