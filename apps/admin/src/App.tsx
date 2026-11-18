import { useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { PageLoader, useTheme } from '@lumen/ui';
import { setUnauthorizedHandler } from './api/client.js';
import { useSession } from './stores/session.js';
import { AdminShell } from './layouts/AdminShell.js';
import { LoginPage } from './pages/Login.js';
import { ChangePasswordPage } from './pages/ChangePassword.js';
import { DashboardPage } from './pages/Dashboard.js';
import { ProjectsPage } from './pages/Projects.js';
import { UsersPage } from './pages/Users.js';
import { UsagePage } from './pages/Usage.js';
import { ProvidersPage } from './pages/Providers.js';
import { RoutesPage } from './pages/Routes.js';
import { StylesPage } from './pages/Styles.js';
import { TasksPage } from './pages/Tasks.js';
import { AuditPage } from './pages/Audit.js';
import { SettingsPage } from './pages/Settings.js';
import { NotFoundPage } from './pages/NotFound.js';

export function App() {
  const ready = useSession((s) => s.ready);
  const user = useSession((s) => s.user);
  const bootstrap = useSession((s) => s.bootstrap);
  useTheme();

  useEffect(() => {
    void bootstrap();
    setUnauthorizedHandler(() => {
      useSession.setState({ user: null });
    });
    return () => setUnauthorizedHandler(null);
  }, [bootstrap]);

  if (!ready) return <PageLoader label="正在确认登录状态" />;

  return (
    <BrowserRouter basename="/admin">
      <Routes>
        <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />
        {/* 首次登录强制改密：只放行改密页本身 */}
        <Route path="/change-password" element={user ? <ChangePasswordPage /> : <Navigate to="/login" replace />} />

        <Route element={<RequireAdmin />}>
          <Route element={<AdminShell />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/usage" element={<UsagePage />} />
            <Route path="/providers" element={<ProvidersPage />} />
            <Route path="/routes" element={<RoutesPage />} />
            <Route path="/styles" element={<StylesPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/audit" element={<AuditPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  );
}

function RequireAdmin() {
  const user = useSession((s) => s.user);
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return <Outlet />;
}
