import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BrandMark, BrandWordmark, Button, Field, Icon, Input } from '@lumen/ui';
import { useSession } from '../stores/session.js';

export function LoginPage() {
  const navigate = useNavigate();
  const login = useSession((s) => s.login);
  const loading = useSession((s) => s.loading);
  const error = useSession((s) => s.error);
  const clearError = useSession((s) => s.clearError);

  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const user = await login(account, password);
      navigate(user.mustChangePassword ? '/change-password' : '/', { replace: true });
    } catch {
      // 错误已写入 store，这里只负责不跳转
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-[var(--page-bg)] p-8">
      <div className="w-full max-w-[380px]">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <BrandMark size={44} />
          <div className="flex flex-col gap-1.5">
            <h1 className="flex items-baseline gap-2">
              <BrandWordmark className="text-[24px]" />
              <span className="text-[13px] font-medium text-[var(--text-3)]">管理后台</span>
            </h1>
            <p className="text-[13px] leading-[1.6] text-[var(--text-3)]">
              仅管理员可登录。内置账号为 admin。
            </p>
          </div>
        </div>

        <form className="flex flex-col gap-4" onSubmit={onSubmit}>
          <Field label="账号或邮箱" required htmlFor="admin-account">
            <Input
              id="admin-account"
              autoComplete="username"
              autoFocus
              value={account}
              onChange={(e) => {
                setAccount(e.target.value);
                clearError();
              }}
              placeholder="admin"
            />
          </Field>
          <Field label="密码" required htmlFor="admin-password">
            <Input
              id="admin-password"
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
            登录后台
          </Button>
        </form>

        <p className="mt-6 text-center text-[12px] text-[var(--text-3)]">
          所有后台操作都会写入审计日志
        </p>
      </div>
    </div>
  );
}
