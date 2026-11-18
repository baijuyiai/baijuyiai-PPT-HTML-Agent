import { useQuery } from '@tanstack/react-query';
import { Badge, Button, Card, CardBody, CardHeader, Icon, PageLoader, Table, Td, Th } from '@lumen/ui';
import { api } from '../api/client.js';
import { useSession } from '../stores/session.js';

interface RouteEndpoint {
  providerName: string;
  model: string;
  isMock: boolean;
  configured: boolean;
}

interface RouteRow {
  taskType: string;
  label: string;
  locked: boolean;
  primary: RouteEndpoint;
  fallbacks: RouteEndpoint[];
}

/**
 * 模型库（PRD §5.11 用户侧只读展示）。
 *
 * 只回答「每个环节跑的是哪个模型、这个模型有没有接上」。
 * Key、Base URL、路由改动都在管理后台，这里看不到也改不了。
 */
export function ModelsPage() {
  const user = useSession((s) => s.user);
  const isAdmin = user?.role === 'admin';

  const routes = useQuery({
    queryKey: ['me', 'models'],
    queryFn: () => api.get<{ routes: RouteRow[] }>('/me/models'),
  });

  const items = routes.data?.routes ?? [];
  const realCount = items.filter((r) => !r.primary.isMock).length;
  const unconfigured = items.filter((r) => !r.primary.configured);

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-8 py-8">
      <header className="flex items-end justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-[26px] font-semibold tracking-tight text-[var(--text-1)]">模型库</h1>
          <p className="text-[13px] text-[var(--text-3)]">
            生成链路上每个环节实际调用的模型。主模型不可用时会自动切到备用模型，并在任务库写明原因。
          </p>
        </div>
        {isAdmin && (
          <a
            href="/admin/providers"
            className="inline-flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border)] px-3 py-1.5 text-[13px] font-medium text-[var(--text-2)] transition-colors duration-150 ease-out hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
          >
            <Icon name="Settings2" size={16} />
            去配置模型
          </a>
        )}
      </header>

      {unconfigured.length > 0 && (
        <Card>
          <CardBody className="flex items-start gap-3">
            <span className="mt-0.5 text-[var(--warning)]"><Icon name="TriangleAlert" size={20} /></span>
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-[var(--text-1)]">
                有 {unconfigured.length} 个环节还没接上真实模型
              </span>
              <span className="text-[13px] leading-[1.6] text-[var(--text-3)]">
                {unconfigured.map((r) => r.label).join('、')}会退回内置 Mock，
                产出的是结构正确的占位内容，不是模型生成的内容。
              </span>
            </div>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader
          title="任务路由"
          description={
            items.length > 0
              ? `${items.length} 个环节，其中 ${realCount} 个接了真实模型`
              : '按任务类型决定调用哪个模型'
          }
        />
        <CardBody className="p-0">
          {routes.isError ? (
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <span className="text-[13px] text-[var(--text-3)]">模型库状态读取失败</span>
              <Button size="sm" variant="ghost" icon="RefreshCw" onClick={() => void routes.refetch()}>重试</Button>
            </div>
          ) : routes.isLoading ? (
            <div className="py-16"><PageLoader label="正在读取模型库状态" /></div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>环节</Th>
                  <Th>当前模型</Th>
                  <Th>状态</Th>
                  <Th>备用模型</Th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.taskType}>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-[var(--text-1)]">{r.label}</span>
                        {r.locked && <Badge tone="neutral">已锁定</Badge>}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex flex-col gap-0.5">
                        <span className="font-[var(--font-mono)] text-[12px] text-[var(--text-2)]">{r.primary.model}</span>
                        <span className="text-[12px] text-[var(--text-3)]">{r.primary.providerName}</span>
                      </div>
                    </Td>
                    <Td>
                      {r.primary.isMock ? (
                        <Badge tone="warning">内置 Mock</Badge>
                      ) : r.primary.configured ? (
                        <Badge tone="success">真实模型</Badge>
                      ) : (
                        <Badge tone="error">未配置 Key</Badge>
                      )}
                    </Td>
                    <Td className="text-[12px] text-[var(--text-3)]">
                      {r.fallbacks.length === 0
                        ? '无'
                        : r.fallbacks.map((f) => `${f.model}${f.isMock ? '（Mock）' : ''}`).join('、')}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <p className="text-[12px] leading-[1.7] text-[var(--text-3)]">
        主模型失败时会自动降级到备用模型，并在任务库记录降级原因。
        Key 由管理员在后台配置，用户侧只读展示，不可见也不可改。
      </p>
    </div>
  );
}
