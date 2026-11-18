import { useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { PageLoader, useTheme } from '@lumen/ui';
import { setStockPhotos, type StockPhoto } from '@lumen/stock-library';
import { setUnauthorizedHandler } from './api/client.js';
import { useSession } from './stores/session.js';
import { AppShell, WorkbenchShell } from './layouts/AppShell.js';
import { LoginPage } from './pages/Login.js';
import { RegisterPage } from './pages/Register.js';
import { ChangePasswordPage } from './pages/ChangePassword.js';
import { ProjectsPage } from './pages/Projects.js';
import { WorkbenchPage } from './pages/Workbench.js';
import { StyleLibraryPage } from './pages/StyleLibrary.js';
import { StockLibraryPage } from './pages/StockLibrary.js';
import { ModulesPage } from './pages/Modules.js';
import { ModelsPage } from './pages/Models.js';
import { TasksPage } from './pages/Tasks.js';
import { PresentPage } from './pages/Present.js';
import { SharePage } from './pages/Share.js';
import { NotFoundPage } from './pages/NotFound.js';

export function App() {
  const ready = useSession((s) => s.ready);
  const user = useSession((s) => s.user);
  const bootstrap = useSession((s) => s.bootstrap);
  useTheme();

  useEffect(() => {
    void bootstrap();
    /**
     * 拉一次真实清单。打进 bundle 的是构建时快照，而素材可以在后台被删到回收站——
     * 不拉这份，配图会一直用已经删掉的图。拉不到就退回快照，不影响使用。
     */
    void fetch('/stock/manifest.json')
      .then((r) => (r.ok ? (r.json() as Promise<StockPhoto[]>) : null))
      .then((list) => { if (Array.isArray(list)) setStockPhotos(list); })
      .catch(() => { /* 用打包里的快照 */ });
    setUnauthorizedHandler(() => {
      useSession.setState({ user: null, quota: null, used: null });
    });
    return () => setUnauthorizedHandler(null);
  }, [bootstrap]);

  if (!ready) return <PageLoader label="正在确认登录状态" />;

  return (
    <BrowserRouter>
      <Routes>
        {/* 公开路由 */}
        <Route path="/login" element={user ? <Navigate to="/projects" replace /> : <LoginPage />} />
        <Route path="/register" element={user ? <Navigate to="/projects" replace /> : <RegisterPage />} />
        <Route path="/share/:token" element={<SharePage />} />

        {/* 首次登录强制改密：只放行改密页本身 */}
        <Route
          path="/change-password"
          element={user ? <ChangePasswordPage /> : <Navigate to="/login" replace />}
        />

        {/* 需要登录的路由 */}
        <Route element={<RequireAuth />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<Navigate to="/projects" replace />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/styles" element={<StyleLibraryPage />} />
            {/* 路由不叫 /stock：那个前缀被反代到 api 的静态图床了，占用它会让整页取不到图 */}
            <Route path="/images" element={<StockLibraryPage />} />
            <Route path="/modules" element={<ModulesPage />} />
            <Route path="/models" element={<ModelsPage />} />
            <Route path="/tasks" element={<TasksPage />} />
          </Route>
          {/*
            工作台套同一个浮动外壳，但**不带外壳顶栏**——它自己有一条功能顶栏
            （返回/演示/讲稿/导出/生成），再叠一条就是双顶栏。
          */}
          <Route element={<WorkbenchShell />}>
            <Route path="/projects/:projectId" element={<WorkbenchPage />} />
          </Route>
          {/* 演示占满整屏，是放映面不是界面，不套壳 */}
          <Route path="/present/:projectId" element={<PresentPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}

function RequireAuth() {
  const user = useSession((s) => s.user);
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return <Outlet />;
}
