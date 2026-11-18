import type { ReactNode } from 'react';
import { cn } from './cn.js';
import { IconButton } from './Icon.js';
import { useTheme } from './overlays.js';

/**
 * 浮动外壳：画布上浮一个大圆角面板，左侧侧栏、右侧顶栏 + 内容区。
 *
 * ## 为什么放在 ui 包而不是各自的 app 里
 *
 * web 与 admin 的骨架**逐行同构**（都是 aside + 顶栏 + 可滚动 main），差异只在
 * 侧栏里放什么、顶栏里放什么。骨架抽出来两边共用，改版只动一处；
 * **但只共享骨架，不共享导航数据**——那会把两个 app 的 session store 耦合起来。
 *
 * ## 三条硬约束，动了就是返工
 *
 * **一、外壳上不许出现 `transform` / `filter` / `backdrop-filter`。**
 * 命令面板是 `fixed inset-0` 且**没走 Portal**，DOM 上就在外壳内部。外壳一旦有
 * 这三个属性里的任何一个，就会给它造出包含块，那个本该铺满视口的面板会被框进外壳里。
 * 所以「浮起来」只能靠 `box-shadow`，不能用 `filter: drop-shadow`。
 *
 * **二、内边距只能加在外壳上，不能加进 `<main>`。**
 * `Modules.tsx` 的双层吸顶算的是**页面容器自己**的 `px-6 py-6`（`sticky top-0 -mx-6 -mt-6`）。
 * padding 留在 `<main>` 外面，那些值一个都不用改；一旦加进 `<main>`，
 * `top`、负边距、第二层的 `top-[52px]` 三处全要跟着重算。
 *
 * **三、`<main>` 是唯一的滚动容器。**
 * 页面的吸顶元素全挂在它身上。外壳只负责 `overflow-hidden` 把圆角裁出来。
 */
export function ShellFrame({
  sidebar, header, children, mainClassName,
}: {
  /** 左侧那块。用 `ShellSidebar` 包，或自己写一个自带面板样式的 aside */
  sidebar: ReactNode;
  /** 右侧顶栏。**可以不传**——工作台自己有一条功能顶栏，再叠一条就是双顶栏 */
  header?: ReactNode;
  children: ReactNode;
  mainClassName?: string;
}) {
  return (
    <div className="h-full bg-[var(--canvas)] p-4">
      <div className="flex h-full overflow-hidden rounded-[var(--radius-shell)] border border-[var(--shell-border)] bg-[var(--shell-bg)] shadow-[var(--shadow-shell)]">
        {sidebar}
        <div className="flex min-w-0 flex-1 flex-col">
          {header}
          {/*
            底色**显式写出来**，不靠继承：`Modules` 的吸顶遮罩用的是同一个色，
            两处各写各的迟早会漂移，漂移的表现是吸顶时露出一条异色带。
          */}
          <main className={cn(
            'lumen-scroll min-h-0 flex-1 overflow-y-auto bg-[var(--shell-bg)]',
            mainClassName,
          )}>
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

/**
 * 侧栏那块浮动面板。与外壳之间留 8px 的缝，它才像「浮在画布上」而不是「贴边的墙」。
 *
 * 宽度由调用方给（web 可收起，展开 228 / 收起 60），这里只管面板本身。
 */
export function ShellSidebar({ children, className, label }: {
  children: ReactNode;
  className?: string;
  /** `<aside>` 的可访问名字。收起成图标栏之后，它是这一栏唯一说得清自己是什么的东西 */
  label?: string;
}) {
  return (
    <aside
      aria-label={label}
      className={cn(
        'm-2 mr-0 flex shrink-0 flex-col overflow-hidden',
        'rounded-[var(--radius-panel)] border border-[var(--border-subtle)] bg-[var(--surface-0)]',
        className,
      )}
    >
      {children}
    </aside>
  );
}

/**
 * 外壳顶栏。**不带下边框**——参考图里顶栏就是浮在面板上的一行，
 * 与内容之间靠留白分开，不靠线。内容区在自己那个滚动容器里，不会滑到它下面。
 */
export function ShellHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <header className={cn('flex h-16 shrink-0 items-center gap-3 px-6', className)}>
      {children}
    </header>
  );
}

/**
 * 导航项的**反色药丸**：当前项是近黑底白字（深色主题下反过来）。
 *
 * 放在 ui 包里是因为 web 与 admin 的侧栏要长得一样，而紫色留给按钮与高亮——
 * 当前项如果也用紫，整条侧栏的紫色会盖过页面里真正要点的东西。
 */
export function shellNavItemClass(active: boolean, collapsed = false): string {
  return cn(
    'flex items-center rounded-[var(--radius-control)] transition-colors duration-150 ease-out',
    collapsed ? 'h-10 w-10 justify-center' : 'h-10 gap-2.5 px-3',
    active
      ? 'bg-[var(--nav-active-bg)] font-medium text-[var(--nav-active-fg)]'
      : 'text-[var(--text-2)] hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]',
  );
}

/**
 * 深浅切换。web 与 admin 的顶栏都要有，所以放在这里一份。
 *
 * 默认是深色（见 `useTheme`），图标画的是**点下去会变成什么**——
 * 深色时显示太阳（切到浅色），不是显示当前的月亮。
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <IconButton
      name={theme === 'dark' ? 'Sun' : 'Moon'}
      label={theme === 'dark' ? '切换到浅色主题' : '切换到深色主题'}
      onClick={toggle}
    />
  );
}
