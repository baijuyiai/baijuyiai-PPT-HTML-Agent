import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Field, Icon, Input } from '@lumen/ui';
import { useToast } from '@lumen/ui';
import { useSession } from '../stores/session.js';
import { AuthLayout } from '../layouts/AuthLayout.js';

export function ChangePasswordPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const user = useSession((s) => s.user);
  const changePassword = useSession((s) => s.changePassword);

  const forced = user?.mustChangePassword === true;
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const policyIssue = newPassword.length === 0
    ? ''
    : newPassword.length < 8
      ? '新密码至少 8 位'
      : !/[A-Za-z]/.test(newPassword)
        ? '新密码必须包含字母'
        : !/[0-9]/.test(newPassword)
          ? '新密码必须包含数字'
          : newPassword === oldPassword
            ? '新密码不能与原密码相同'
            : '';
  const mismatch = confirm.length > 0 && confirm !== newPassword;
  const canSubmit = oldPassword.length > 0 && !policyIssue && !mismatch && confirm.length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError('');
    try {
      await changePassword(oldPassword, newPassword);
      toast.success('密码已更新', '旧密码与所有旧会话已失效');
      navigate('/projects', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '修改失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title={forced ? '首次登录，请修改密码' : '修改密码'}
      description={
        forced
          ? '内置管理员使用默认密码，为安全起见必须先设置新密码才能继续使用。'
          : '修改后当前账号的所有旧会话会立即失效。'
      }
      footer={
        !forced ? (
          <button type="button" className="text-[var(--brand-600)] hover:underline" onClick={() => navigate('/projects')}>
            返回项目库
          </button>
        ) : undefined
      }
    >
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <Field label="当前密码" required htmlFor="cp-old">
          <Input
            id="cp-old"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
          />
        </Field>
        <Field label="新密码" required htmlFor="cp-new" hint={policyIssue || '至少 8 位，需同时包含字母与数字'}>
          <Input
            id="cp-new"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </Field>
        <Field label="确认新密码" required htmlFor="cp-confirm">
          <Input
            id="cp-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>

        {mismatch && <p className="text-[12px] text-[var(--error)]">两次输入的新密码不一致</p>}
        {error && (
          <div className="flex items-start gap-2 rounded-[var(--radius-control)] border border-[var(--error)] px-3 py-2.5 text-[13px] text-[var(--error)]">
            <Icon name="CircleAlert" size={16} />
            <span>{error}</span>
          </div>
        )}

        <Button type="submit" variant="primary" size="lg" loading={loading} disabled={!canSubmit}>
          保存新密码
        </Button>
      </form>
    </AuthLayout>
  );
}
