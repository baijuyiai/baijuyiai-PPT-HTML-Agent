import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Badge, BrandLockup, Button, Command, DropdownMenu, Icon, type IconName, cn,
  ShellFrame, ShellHeader, ShellSidebar, ThemeToggle, shellNavItemClass,
} from '@lumen/ui';
import { useSession } from '../stores/session.js';
import { readNavCollapsed, writeNavCollapsed } from './nav-pref.js';

/**
 * 应用外壳：画布上浮一个大圆角面板，里面左侧栏 + 右侧内容区。
 *
 * 用左栏而不是顶部横向导航，是因为这一层要放的不只是五个入口——
 * 还有用量、账号、管理后台。横向排开时这些只能塞进右上角一个下拉里，
 * 越加越多，最后没人找得到。左栏把「去哪」和「我是谁、还剩多少」分成两栏，
 * 各自都有地方长。
 *
 * **左栏可以收起成一条图标栏**：项目库、风格库这些页面在宽屏上要的是横向空间，
 * 而导航一周看不了几次。收起状态记在 localStorage（见 `nav-pref.ts`），
 * 下次进来还是那个宽度。开关放在顶栏最左，不放在左栏里——收起之后左栏只剩
 * 60px，再在它里面放一个「展开」按钮会让图标栏重新变宽，等于没收起。
 *
 * 骨架本身在 `@lumen/ui` 的 `ShellFrame` 里，与后台共用；这里只负责往里填
 * 这一侧的导航数据与顶栏内容。
 *
 * **导出两个 layout，差别只在有没有顶栏。** 工作台自己有一条功能顶栏
 * （返回/演示/讲稿/导出/生成），再叠一条外壳顶栏就是双顶栏，所以那条路由用
 * `WorkbenchShell`。两份共用同一个 `AppShellLayout`，导航与命令面板不会因为
 * 进工作台而重建。
 */

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  hint: string;
}

const NAV: NavItem[] = [
  { to: '/projects', label: '项目库', icon: 'LayoutGrid', hint: '所有演示项目与生成进度' },
  { to: '/modules', label: '功能库', icon: 'Blocks', hint: '数字人、讲解光标、版式库、装饰件与入场动效' },
  { to: '/styles', label: '风格库', icon: 'Palette', hint: '设计语言、页面样机与识别' },
  { to: '/images', label: '图片库', icon: 'Image', hint: '生成页面时按风格配色挑图的池子' },
  { to: '/models', label: '模型库', icon: 'Plug', hint: '路由、连通性与真实调用' },
  { to: '/tasks', label: '任务库', icon: 'ListChecks', hint: '队列、失败重试与日志' },
];

/** 带顶栏的外壳。六个列表页用这个 */
export function AppShell() {
  return <AppShellLayout withHeader />;
}

/** 不带顶栏的外壳。工作台用这个——它自己有顶栏 */
export function WorkbenchShell() {
  return <AppShellLayout withHeader={false} />;
}

function AppShellLayout({ withHeader }: { withHeader: boolean }) {
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readNavCollapsed);
  const isAdmin = user?.role === 'admin';

  const toggleCollapsed = () => {
    // 先写库再改状态：这里的 state 只是界面镜像，真正的「我的偏好」在 localStorage 里
    const next = !collapsed;
    writeNavCollapsed(next);
    setCollapsed(next);
  };

  return (
    <ShellFrame
      sidebar={
        <ShellSidebar
          label="主导航"
          className={cn(
            // 宽度过渡。不做的话收起是一下跳过去的，看不出「它收到哪儿去了」
            'transition-[width] duration-150 ease-out',
            collapsed ? 'w-[60px]' : 'w-[228px]',
          )}
        >
          <button
            type="button"
            onClick={() => navigate('/projects')}
            className={cn('flex h-16 shrink-0 items-center gap-2.5', collapsed ? 'justify-center px-0' : 'px-4')}
            aria-label="返回项目库"
          >
            <BrandLockup collapsed={collapsed} />
          </button>

          <nav
            className={cn(
              'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto py-2',
              collapsed ? 'items-center px-2' : 'px-2.5',
            )}
          >
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                /*
                  收起时只剩图标，悬停提示就是唯一的说明，所以那时要把**名字**也带上——
                  只留 `hint`（「所有演示项目与生成进度」）的话，光看图标的人不知道
                  点下去会去哪一页。
                */
                title={collapsed ? `${item.label} · ${item.hint}` : item.hint}
                /*
                  收起时文字被拿掉了，链接就没有可读的名字了。`aria-label` 常驻，
                  展开时也与可见文字一致，不产生歧义。
                */
                aria-label={item.label}
                className={({ isActive }) => cn(
                  shellNavItemClass(isActive, collapsed),
                  'w-full text-[13px]',
                  collapsed && 'shrink-0',
                )}
              >
                <Icon name={item.icon} size={16} />
                {/*
                  收起时**文字要真的从文档流里拿掉**，不能只是 opacity 0：
                  淡出的文字仍然占着宽度，60px 的栏里会被压成一条竖线，也仍然会被
                  屏幕阅读器念出来。名字改由上面的 `title` 与 `aria-label` 承担。
                */}
                {!collapsed && item.label}
              </NavLink>
            ))}
            {isAdmin && (
              <a
                href="/admin/"
                title="管理后台"
                aria-label="管理后台"
                className={cn(shellNavItemClass(false, collapsed), 'w-full text-[13px]', collapsed && 'shrink-0')}
              >
                <Icon name="ShieldCheck" size={16} />
                {!collapsed && '管理后台'}
              </a>
            )}
          </nav>

          <div className={cn('shrink-0 px-2 pb-1', collapsed && 'flex justify-center')}>
            {/*
              收起/展开**放在侧栏框里**，不放在顶栏。

              原先在顶栏最左，理由是「收起后侧栏只剩 60px，里面再放一个按钮会让它变宽」——
              那个理由只在按钮**带文字**时成立。收成图标按钮之后它和其它导航项一样宽
              （40px），60px 的栏完全放得下。

              放进来还解决了一件顶栏解决不了的事：**工作台没有外壳顶栏**（它有自己的功能
              顶栏），开关留在顶栏的话工作台就永远收不起来。
            */}
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
              aria-expanded={!collapsed}
              title={collapsed ? '展开侧边栏' : '收起侧边栏'}
              className={cn(shellNavItemClass(false, collapsed), 'w-full text-[13px]', collapsed && 'shrink-0')}
            >
              <Icon name={collapsed ? 'PanelLeftOpen' : 'PanelLeftClose'} size={16} />
              {!collapsed && '收起侧栏'}
            </button>
          </div>

          <div className={cn('shrink-0 border-t border-[var(--border-subtle)]', collapsed ? 'p-1.5' : 'p-2.5')}>
            <UserMenu collapsed={collapsed} />
          </div>
        </ShellSidebar>
      }
      {...(withHeader ? {
        header: (
          <ShellHeader>
            {/*
              收起/展开的开关**不在这里**，在侧栏框内（见上面那段注释）：
              工作台没有外壳顶栏，开关留在这里它就永远收不起来。
            */}
            <Button size="sm" variant="ghost" icon="Search" onClick={() => setPaletteOpen(true)}>
              搜索
            </Button>
            <div className="ml-auto flex items-center gap-2">
              {/*
                **这里不再放「新建项目」按钮。** 它原来是个全局动作，但「新建」只对
                项目库那一页有意义——在功能库、风格库、任务库这些页面上点它，
                人会先被弹到项目库再弹一次对话框。项目库页头本来就有自己的那个按钮，
                留在那儿更近、也更说得清。
              */}
              <QuotaHint />
              {/* 深浅切换原来只在工作台顶栏有，默认深色之后每页都得够得着 */}
              <ThemeToggle />
            </div>
          </ShellHeader>
        ),
      } : {})}
    >
      <Outlet />

      <Command
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        placeholder="跳转到页面或执行操作"
        items={[
          { id: 'projects', label: '项目库', icon: 'LayoutGrid', group: '导航', onSelect: () => navigate('/projects') },
          { id: 'new', label: '新建项目', icon: 'Plus', group: '操作', onSelect: () => navigate('/projects?new=1') },
          { id: 'modules', label: '功能库', icon: 'Blocks', group: '导航', onSelect: () => navigate('/modules') },
          { id: 'styles', label: '风格库', icon: 'Palette', group: '导航', onSelect: () => navigate('/styles') },
          { id: 'images', label: '图片库', icon: 'Image', group: '导航', onSelect: () => navigate('/images') },
          { id: 'models', label: '模型库', icon: 'Plug', group: '导航', onSelect: () => navigate('/models') },
          { id: 'tasks', label: '任务库', icon: 'ListChecks', group: '导航', onSelect: () => navigate('/tasks') },
          ...(isAdmin
            ? [{ id: 'admin', label: '管理后台', icon: 'ShieldCheck' as IconName, group: '导航', onSelect: () => { window.location.href = '/admin/'; } }]
            : []),
        ]}
      />
    </ShellFrame>
  );
}

function UserMenu({ collapsed }: { collapsed: boolean }) {
  const navigate = useNavigate();
  const user = useSession((s) => s.user);
  const quota = useSession((s) => s.quota);
  const used = useSession((s) => s.used);
  const logout = useSession((s) => s.logout);

  if (!user) return null;

  const projectText = quota && quota.maxProjects > 0
    ? `${used?.projects ?? 0} / ${quota.maxProjects}`
    : `${used?.projects ?? 0} / 不限`;

  return (
    <DropdownMenu
      trigger={
        <button
          type="button"
          aria-label={`用户菜单：${user.username}`}
          className={cn(
            'flex w-full items-center rounded-[var(--radius-control)] transition-colors duration-150 ease-out hover:bg-[var(--surface-1)]',
            collapsed ? 'justify-center px-0 py-1.5' : 'gap-2.5 px-2 py-1.5',
          )}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand-100)] text-[12px] font-semibold text-[var(--brand-600)]">
            {user.username.slice(0, 1).toUpperCase()}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate text-left text-[13px] text-[var(--text-1)]">{user.username}</span>
              <Icon name="ChevronDown" size={16} />
            </>
          )}
        </button>
      }
      items={[
        { label: `项目 ${projectText}`, icon: 'FolderKanban', onSelect: () => navigate('/projects') },
        { label: '修改密码', icon: 'KeyRound', onSelect: () => navigate('/change-password') },
        'separator',
        { label: '退出登录', icon: 'LogOut', danger: true, onSelect: () => void logout().then(() => navigate('/login')) },
      ]}
    />
  );
}

/** 顶部的用量提示条，用于配额接近上限时提醒（PRD §5.12 配额不静默失败） */
export function QuotaHint() {
  const quota = useSession((s) => s.quota);
  const used = useSession((s) => s.used);
  if (!quota || quota.maxImages === 0 || !used) return null;
  const ratio = used.images / quota.maxImages;
  if (ratio < 0.8) return null;
  return (
    <Badge tone="warning" icon="TriangleAlert">
      图片额度已用 {used.images} / {quota.maxImages}
    </Badge>
  );
}
