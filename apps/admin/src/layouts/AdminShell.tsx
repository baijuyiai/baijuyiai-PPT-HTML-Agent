import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Badge, Command, DropdownMenu, Icon, IconButton, type IconName,
  BrandMark, BrandWordmark, cn,
  ShellFrame, ShellHeader, ShellSidebar, ThemeToggle, shellNavItemClass,
} from '@lumen/ui';
import { useSession } from '../stores/session.js';

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

interface NavGroup {
  title: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    title: '总览',
    items: [{ to: '/', label: '运行概览', icon: 'Gauge' }],
  },
  {
    title: '内容与用户',
    items: [
      { to: '/projects', label: '项目总览', icon: 'FolderKanban' },
      { to: '/users', label: '用户与 CRM', icon: 'Users' },
      { to: '/usage', label: '用量与计费', icon: 'Coins' },
    ],
  },
  {
    title: '模型接入',
    items: [
      { to: '/providers', label: 'Provider 配置', icon: 'Plug' },
      { to: '/routes', label: '任务路由', icon: 'Route' },
    ],
  },
  {
    title: '内容与运行',
    items: [
      { to: '/styles', label: '风格库审核', icon: 'Palette' },
      { to: '/tasks', label: '任务监控', icon: 'ListChecks' },
      { to: '/audit', label: '审计日志', icon: 'ScrollText' },
    ],
  },
  {
    title: '系统',
    items: [{ to: '/settings', label: '全局设置', icon: 'Settings' }],
  },
];

/**
 * 后台外壳。骨架与用户端共用 `ShellFrame`（见 `@lumen/ui`），
 * **只有导航数据与顶栏内容各写各的**——共享导航会把两个 app 的 session store 耦合起来。
 *
 * 与用户端的差异保留着：后台的侧栏**不能收起**（导航项多，收起成图标栏反而难找），
 * 而且带分组标题。
 */
export function AdminShell() {
  const navigate = useNavigate();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const flat = NAV.flatMap((g) => g.items);

  return (
    <ShellFrame
      sidebar={
        <ShellSidebar label="后台导航" className="w-[228px]">
          <div className="flex h-16 shrink-0 items-center gap-2.5 px-4">
            <BrandMark size={28} />
            <span className="flex flex-col leading-tight">
              <BrandWordmark className="text-[16px]" />
              <span className="text-[11px] text-[var(--text-3)]">管理后台</span>
            </span>
          </div>

          <nav className="min-h-0 flex-1 overflow-y-auto lumen-scroll px-2 py-2">
            {NAV.map((group) => (
              <div key={group.title} className="mb-4">
                <p className="px-2 pb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--text-3)]">
                  {group.title}
                </p>
                <ul className="flex flex-col gap-1">
                  {group.items.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.to === '/'}
                        className={({ isActive }) => cn(shellNavItemClass(isActive), 'text-[13px]')}
                      >
                        <Icon name={item.icon} size={16} />
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <div className="shrink-0 border-t border-[var(--border-subtle)] p-2">
            <a href="/" className={cn(shellNavItemClass(false), 'text-[13px]')}>
              <Icon name="ArrowLeft" size={16} />
              返回工作台
            </a>
          </div>
        </ShellSidebar>
      }
      header={
        <ShellHeader>
          <Badge tone="brand" icon="ShieldCheck">管理员会话</Badge>
          <div className="ml-auto flex items-center gap-2">
            <IconButton name="Search" label="搜索" onClick={() => setPaletteOpen(true)} />
            <ThemeToggle />
            <UserMenu onNavigate={(to) => navigate(to)} />
          </div>
        </ShellHeader>
      }
    >
      <Outlet />

      <Command
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        placeholder="跳转到后台页面"
        items={flat.map((item) => ({
          id: item.to,
          label: item.label,
          icon: item.icon,
          group: '导航',
          onSelect: () => navigate(item.to),
        }))}
      />
    </ShellFrame>
  );
}

function UserMenu({ onNavigate }: { onNavigate: (to: string) => void }) {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  if (!user) return null;

  return (
    <DropdownMenu
      trigger={
        <button
          type="button"
          aria-label="账号菜单"
          className="flex items-center gap-2 rounded-[var(--radius-control)] px-2 py-1.5 transition-colors duration-150 ease-out hover:bg-[var(--surface-1)]"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand-100)] text-[12px] font-semibold text-[var(--brand-600)]">
            {user.username.slice(0, 1).toUpperCase()}
          </span>
          <span className="text-[13px] font-medium text-[var(--text-1)]">{user.username}</span>
          <Icon name="ChevronDown" size={16} />
        </button>
      }
      items={[
        { label: '修改密码', icon: 'KeyRound', onSelect: () => onNavigate('/change-password') },
        'separator',
        { label: '退出登录', icon: 'LogOut', danger: true, onSelect: () => void logout() },
      ]}
    />
  );
}
