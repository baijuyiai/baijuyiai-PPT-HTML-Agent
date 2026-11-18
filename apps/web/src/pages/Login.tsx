import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Field, Icon, Input } from '@lumen/ui';
import { api } from '../api/client.js';
import { useSession } from '../stores/session.js';
import { AuthLayout } from '../layouts/AuthLayout.js';

export function LoginPage() {
  const navigate = useNavigate();
  const login = useSession((s) => s.login);
  const loading = useSession((s) => s.loading);
  const error = useSession((s) => s.error);
  const clearError = useSession((s) => s.clearError);

  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');
  const [allowSignup, setAllowSignup] = useState(true);

  useEffect(() => {
    // 注册开关由服务端决定，关闭时不展示注册入口
    void api
      .get<{ allowSelfSignup: boolean }>('/public/settings')
      .then((s) => setAllowSignup(s.allowSelfSignup))
      .catch(() => setAllowSignup(true));
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const user = await login(account, password);
      navigate(user.mustChangePassword ? '/change-password' : '/projects', { replace: true });
    } catch {
      // 错误已写入 store，这里只负责不跳转
    }
  }

  return (
    <AuthLayout
      title="登录"
      description="使用账号或邮箱登录。"
      footer={
        allowSignup ? (
          <>
            还没有账号？{' '}
            <Link to="/register" className="font-medium text-[var(--brand-600)] hover:underline">
              注册
            </Link>
          </>
        ) : (
          <span>本站已关闭自助注册，请联系管理员开通账号</span>
        )
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <Field label="账号或邮箱" required htmlFor="login-account">
          <Input
            id="login-account"
            autoComplete="username"
            autoFocus
            value={account}
            onChange={(e) => {
              setAccount(e.target.value);
              clearError();
            }}
            placeholder="admin 或 you@example.com"
          />
        </Field>
        <Field label="密码" required htmlFor="login-password">
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearError();
            }}
            placeholder="请输入密码"
          />
        </Field>

        {error && (
          <div className="flex items-start gap-2 rounded-[var(--radius-control)] border border-[var(--error)] bg-[var(--surface-0)] px-3 py-2.5 text-[13px] text-[var(--error)]">
            <Icon name="CircleAlert" size={16} />
            <span>{error}</span>
          </div>
        )}

        <Button type="submit" variant="primary" size="lg" loading={loading} disabled={!account || !password}>
          登录
        </Button>
      </form>
    </AuthLayout>
  );
}
