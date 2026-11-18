import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge, Button, Card, CardBody, Dialog, Field, Icon, Select, Switch, Table, Td, Th, useToast,
} from '@lumen/ui';
import { api } from '../api/client.js';
import { TASK_TYPE_LABEL, type ProviderPublic, type TaskRoute, type TaskType } from '../api/types.js';
import { AdminPage, LoadError } from '../components/AdminPage.js';

interface Entry {
  providerId: string;
  model: string;
}

export function RoutesPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<TaskRoute | null>(null);

  const routes = useQuery({
    queryKey: ['admin', 'routes'],
    queryFn: () => api.get<TaskRoute[]>('/admin/routes'),
  });

  const providers = useQuery({
    queryKey: ['admin', 'providers'],
    queryFn: () => api.get<ProviderPublic[]>('/admin/providers'),
  });

  const providerName = (providerId: string): string =>
    providers.data?.find((p) => p.providerId === providerId)?.name ?? providerId;

  return (
    <AdminPage
      title="任务路由"
      description="每个生成环节走哪个 Provider 与模型。主模型失败会自动按降级链切换并记录原因。"
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-0)] px-4 py-3.5">
          <div className="flex items-start gap-2.5">
            <Icon name="Lock" size={16} className="mt-0.5 shrink-0 text-[var(--text-3)]" decorative />
            <p className="text-[12px] leading-[1.7] text-[var(--text-3)]">
              标记为「锁定」的路由（HTML 代码生成与图片生成）默认不允许切换，需在这里显式解锁后修改，
              以免生成结果的版式与画风随模型漂移。
            </p>
          </div>
        </div>

        <Card>
          <CardBody className="p-0">
            {routes.isError ? (
              <div className="p-5"><LoadError message="路由表读取失败" onRetry={() => void routes.refetch()} /></div>
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>环节</Th>
                    <Th>主模型</Th>
                    <Th>降级链</Th>
                    <Th>锁定</Th>
                    <Th>操作</Th>
                  </tr>
                </thead>
                <tbody>
                  {routes.isLoading ? (
                    <tr><Td className="text-[var(--text-3)]">加载中</Td><Td /><Td /><Td /><Td /></tr>
                  ) : (routes.data?.length ?? 0) === 0 ? (
                    <tr>
                      <Td className="text-[var(--text-3)]">路由表为空，请重启服务以写入默认路由</Td>
                      <Td /><Td /><Td /><Td />
                    </tr>
                  ) : (
                    routes.data!.map((r) => (
                      <tr key={r.routeId}>
                        <Td className="font-medium text-[var(--text-1)]">{TASK_TYPE_LABEL[r.taskType] ?? r.taskType}</Td>
                        <Td>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[13px] text-[var(--text-1)]">{r.primary.model}</span>
                            <span className="text-[12px] text-[var(--text-3)]">{providerName(r.primary.providerId)}</span>
                          </div>
                        </Td>
                        <Td>
                          {r.fallbacks.length === 0 ? (
                            <span className="text-[12px] text-[var(--text-3)]">未配置</span>
                          ) : (
                            <div className="flex flex-col gap-0.5">
                              {r.fallbacks.map((f, i) => (
                                <span key={`${f.providerId}-${f.model}-${i}`} className="text-[12px] text-[var(--text-2)]">
                                  {i + 1}. {f.model}（{providerName(f.providerId)}）
                                </span>
                              ))}
                            </div>
                          )}
                        </Td>
                        <Td>
                          {r.locked ? <Badge tone="warning" icon="Lock">已锁定</Badge> : <Badge tone="neutral">可切换</Badge>}
                        </Td>
                        <Td>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>配置</Button>
                        </Td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>

      <RouteDialog
        route={editing}
        providers={providers.data ?? []}
        onOpenChange={(v) => { if (!v) setEditing(null); }}
        onSaved={() => {
          void qc.invalidateQueries({ queryKey: ['admin', 'routes'] });
          toast.success('路由已更新');
        }}
      />
    </AdminPage>
  );
}

function RouteDialog({
  route, providers, onOpenChange, onSaved,
}: {
  route: TaskRoute | null;
  providers: ProviderPublic[];
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<{ primary: Entry; fallbacks: Entry[]; locked: boolean } | null>(null);
  const [initializedFor, setInitializedFor] = useState<string | null>(null);

  const key = route ? route.routeId : '__none__';
  if (route && initializedFor !== key) {
    setInitializedFor(key);
    setDraft({ primary: { ...route.primary }, fallbacks: route.fallbacks.map((f) => ({ ...f })), locked: route.locked });
  }
  if (!route && initializedFor !== null) setInitializedFor(null);

  const save = useMutation({
    mutationFn: () => api.patch<TaskRoute>(`/admin/routes/${route!.taskType}`, draft!),
    onSuccess: () => {
      onSaved();
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error('保存失败', err.message),
  });

  if (!route || !draft) {
    return (
      <Dialog open={false} onOpenChange={onOpenChange} title="配置路由" width={560}>
        <span />
      </Dialog>
    );
  }

  const enabledProviders = providers.filter((p) => p.enabled);
  const providerOptions = enabledProviders.map((p) => ({ value: p.providerId, label: p.name }));
  const modelOptionsFor = (providerId: string) => {
    const p = providers.find((x) => x.providerId === providerId);
    /**
     * 按任务类型挑该 Provider 的哪一档模型。**语音任务用 `audio`**——
     * 拿文本模型列表去填语音路由，下拉里会是一堆根本不能合语音的模型。
     */
    const models = route.taskType === 'image'
      ? p?.models.image ?? []
      : route.taskType === 'tts'
        ? p?.models.audio ?? []
        : p?.models.text ?? [];
    return models.map((m) => ({ value: m, label: m }));
  };

  const canSave = Boolean(draft.primary.providerId && draft.primary.model)
    && draft.fallbacks.every((f) => f.providerId && f.model);

  return (
    <Dialog
      open
      onOpenChange={onOpenChange}
      title={`配置路由：${TASK_TYPE_LABEL[route.taskType] ?? route.taskType}`}
      description="主模型失败时按顺序尝试降级链，每次降级都会记录原因并在任务中心可见。"
      width={560}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="primary" loading={save.isPending} disabled={!canSave} onClick={() => save.mutate()}>
            保存
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {enabledProviders.length === 0 && (
          <p className="rounded-[var(--radius-control)] border border-[var(--warning)] px-3 py-2.5 text-[12px] text-[var(--warning)]">
            当前没有启用的 Provider，请先到「Provider 配置」里启用至少一个。
          </p>
        )}

        <section className="flex flex-col gap-3">
          <h3 className="text-[13px] font-semibold text-[var(--text-1)]">主模型</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Provider" htmlFor="rt-primary-provider">
              <Select
                ariaLabel="主模型 Provider"
                value={draft.primary.providerId}
                onValueChange={(v) => {
                  const first = modelOptionsFor(v)[0]?.value ?? '';
                  setDraft({ ...draft, primary: { providerId: v, model: first } });
                }}
                options={providerOptions}
              />
            </Field>
            <Field label="模型" htmlFor="rt-primary-model">
              <Select
                ariaLabel="主模型"
                value={draft.primary.model}
                onValueChange={(v) => setDraft({ ...draft, primary: { ...draft.primary, model: v } })}
                options={modelOptionsFor(draft.primary.providerId)}
              />
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-[13px] font-semibold text-[var(--text-1)]">降级链</h3>
            <Button
              size="sm"
              variant="ghost"
              icon="Plus"
              disabled={enabledProviders.length === 0}
              onClick={() => {
                const first = enabledProviders[0];
                if (!first) return;
                const model = (route.taskType === 'image' ? first.models.image : first.models.text)[0] ?? '';
                setDraft({ ...draft, fallbacks: [...draft.fallbacks, { providerId: first.providerId, model }] });
              }}
            >
              添加备选
            </Button>
          </div>

          {draft.fallbacks.length === 0 ? (
            <p className="text-[12px] text-[var(--text-3)]">未配置备选。主模型失败时该环节会直接失败。</p>
          ) : (
            <div className="flex flex-col gap-2">
              {draft.fallbacks.map((f, i) => (
                <div key={i} className="flex items-end gap-2">
                  <span className="pb-2.5 text-[12px] text-[var(--text-3)]">{i + 1}</span>
                  <div className="flex-1">
                    <Select
                      ariaLabel={`备选 ${i + 1} Provider`}
                      value={f.providerId}
                      onValueChange={(v) => {
                        const next = [...draft.fallbacks];
                        const first = modelOptionsFor(v)[0]?.value ?? '';
                        next[i] = { providerId: v, model: first };
                        setDraft({ ...draft, fallbacks: next });
                      }}
                      options={providerOptions}
                    />
                  </div>
                  <div className="flex-1">
                    <Select
                      ariaLabel={`备选 ${i + 1} 模型`}
                      value={f.model}
                      onValueChange={(v) => {
                        const next = [...draft.fallbacks];
                        next[i] = { ...f, model: v };
                        setDraft({ ...draft, fallbacks: next });
                      }}
                      options={modelOptionsFor(f.providerId)}
                    />
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDraft({ ...draft, fallbacks: draft.fallbacks.filter((_, j) => j !== i) })}
                  >
                    移除
                  </Button>
                </div>
              ))}
            </div>
          )}
        </section>

        <label className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium text-[var(--text-2)]">锁定该路由</span>
            <span className="text-[12px] text-[var(--text-3)]">锁定后需要再次解锁才能修改，避免模型漂移影响成品一致性</span>
          </span>
          <Switch checked={draft.locked} onCheckedChange={(v) => setDraft({ ...draft, locked: v })} label="锁定该路由" />
        </label>
      </div>
    </Dialog>
  );
}
