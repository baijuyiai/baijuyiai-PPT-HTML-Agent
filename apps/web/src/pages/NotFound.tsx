import { useNavigate } from 'react-router-dom';
import { Button, EmptyState } from '@lumen/ui';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex h-full items-center justify-center bg-[var(--page-bg)]">
      <EmptyState
        icon="Compass"
        title="页面不存在"
        description="你访问的地址可能已被移除，或者链接不完整。"
        action={<Button variant="primary" onClick={() => navigate('/projects')}>回到项目库</Button>}
      />
    </div>
  );
}
