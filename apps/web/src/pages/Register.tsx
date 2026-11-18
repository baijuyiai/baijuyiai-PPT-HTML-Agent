import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button, Field, Icon, Input } from '@lumen/ui';
import { api } from '../api/client.js';
import { useSession } from '../stores/session.js';
import { AuthLayout } from '../layouts/AuthLayout.js';

export function RegisterPage() {
  const navigate = useNavigate();
  const register = useSession((s) => s.register);
  const loading = useSession((s) => s.loading);
  const error = useSession((s) => s.error);
  const clearError = useSession((s) => s.clearError);

  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  // 注册开关由服务端决定。登录页隐藏了入口，直访 /register 也要挡——否则关掉开关只是「藏起来」
  const [signupAllowed, setSignupAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    void api
      .get<{ allowSelfSignup: boolean }>('/public/settings')
      .then((s) => setSignupAllowed(s.allowSelfSignup))
      .catch(() => setSignupAllowed(true));
  }, []);

  const passwordIssue = password.length === 0
    ? ''
    : password.length < 8
      ? '密码至少 8 位'
      : !/[A-Za-z]/.test(password)
        ? '密码必须包含字母'
        : !/[0-9]/.test(password)
          ? '密码必须包含数字'
          : '';
  const mismatch = confirm.length > 0 && confirm !== password;
  // 账号填的是邮箱时，邮箱栏自动沿用，不再要求重复填一遍
  const isEmailAccount = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(username.trim());
  const canSubmit = username.length >= 3 && !passwordIssue && !mismatch && confirm.length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      await register(username, password, email || undefined);
      navigate('/projects', { replace: true });
    } catch {
      // 错误已写入 store
    }
  }

  // 开关关掉时不留注册页可看：直访也退回登录页，跟接口的 403 保持一致
  if (signupAllowed === false) return <Navigate to="/login" replace />;

  return (
    <AuthLayout
      title="创建账号"
      description="注册后立即可用。账号填用户名或邮箱都可以。"
      footer={
        <>
          已有账号？{' '}
          <Link to="/login" className="font-medium text-[var(--brand-600)] hover:underline">
            登录
          </Link>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <Field label="账号" required htmlFor="reg-username" hint="用户名或邮箱，至少 3 位">
          <Input
            id="reg-username"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value);
              clearError();
            }}
            placeholder="用户名或 you@example.com"
          />
        </Field>
        <Field
          label="邮箱"
          hint={isEmailAccount ? '已按账号里的邮箱登记，用于日后找回密码' : '选填，用于日后找回密码'}
          htmlFor="reg-email"
        >
          <Input
            id="reg-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            disabled={isEmailAccount}
          />
        </Field>
        <Field
          label="密码"
          required
          htmlFor="reg-password"
          hint={passwordIssue || '至少 8 位，需同时包含字母与数字'}
        >
          <Input
            id="reg-password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clearError();
            }}
          />
        </Field>
        <Field label="确认密码" required htmlFor="reg-confirm">
          <Input
            id="reg-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onBlur={() => undefined}
          />
        </Field>

        {mismatch && (
          <p className="text-[12px] text-[var(--error)]">两次输入的密码不一致</p>
        )}
        {error && (
          <div className="flex items-start gap-2 rounded-[var(--radius-control)] border border-[var(--error)] bg-[var(--surface-0)] px-3 py-2.5 text-[13px] text-[var(--error)]">
            <Icon name="CircleAlert" size={16} />
            <span>{error}</span>
          </div>
        )}

        <Button type="submit" variant="primary" size="lg" loading={loading} disabled={!canSubmit}>
          注册并进入
        </Button>
      </form>
    </AuthLayout>
  );
}
