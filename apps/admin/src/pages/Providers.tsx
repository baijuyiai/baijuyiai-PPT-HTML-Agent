import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge, Button, Card, CardBody, ConfirmDialog, Dialog, Field, Icon, Input, Select, Switch,
  Table, Td, Th, useToast,
} from '@lumen/ui';
import { api } from '../api/client.js';
import {
  PROVIDER_TYPE_LABEL,
  type ProviderPublic, type TestConnectionResult,
} from '../api/types.js';
import { AdminPage, LoadError } from '../components/AdminPage.js';

type ProviderTypeValue = ProviderPublic['type'];

interface ProviderDraft {
  name: string;
  type: ProviderTypeValue;
  baseUrl: string;
  apiKey: string;
  pathPrefix: string;
  textModels: string;
  imageModels: string;
  audioModels: string;
  timeoutMs: number;
  maxRetries: number;
  concurrency: number;
  costLimitTokens: number;
  costLimitImages: number;
  // 计费单价：留 0 表示未配置，用量页就显示 0 而不是猜一个数
  currency: string;
  priceIn: number;
  priceOut: number;
  pricePerImage: number;
  // 图片接口方言：同步返回还是异步任务，尺寸写像素还是比例
  imageApi: string;
  imageSizeFormat: string;
  imageResolution: string;
  imagePollTimeoutMs: number;
  enabled: boolean;
}

const EMPTY_DRAFT: ProviderDraft = {
  name: '',
  type: 'openai-compatible',
  baseUrl: '',
  apiKey: '',
  pathPrefix: '/v1',
  textModels: '',
  imageModels: '',
  audioModels: '',
  timeoutMs: 60000,
  maxRetries: 2,
  concurrency: 5,
  costLimitTokens: 0,
  costLimitImages: 0,
  currency: 'CNY',
  priceIn: 0,
  priceOut: 0,
  pricePerImage: 0,
  imageApi: 'sync',
  imageSizeFormat: 'pixels',
  imageResolution: '2K',
  imagePollTimeoutMs: 420000,
  enabled: true,
};

function toDraft(p: ProviderPublic): ProviderDraft {
  return {
    name: p.name,
    type: p.type,
    baseUrl: p.baseUrl,
    // 已存的 Key 不会回传，留空表示「不修改」
    apiKey: '',
    pathPrefix: p.pathPrefix,
    textModels: p.models.text.join(', '),
    imageModels: p.models.image.join(', '),
    audioModels: p.models.audio.join(', '),
    timeoutMs: p.timeoutMs,
    maxRetries: p.maxRetries,
    concurrency: p.concurrency,
    costLimitTokens: p.costLimitTokens,
    costLimitImages: p.costLimitImages,
    currency: p.pricing.currency,
    priceIn: p.pricing.inputPerMTokens,
    priceOut: p.pricing.outputPerMTokens,
    pricePerImage: p.pricing.perImage,
    imageApi: p.imageApi,
    imageSizeFormat: p.imageSizeFormat,
    imageResolution: p.imageResolution,
    imagePollTimeoutMs: p.imagePollTimeoutMs,
    enabled: p.enabled,
  };
}

function splitModels(raw: string): string[] {
  return raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
}

export function ProvidersPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<ProviderPublic | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<ProviderPublic | null>(null);

  const providers = useQuery({
    queryKey: ['admin', 'providers'],
    queryFn: () => api.get<ProviderPublic[]>('/admin/providers'),
  });

  const remove = useMutation({
    mutationFn: (providerId: string) => api.del(`/admin/providers/${providerId}`),
    onSuccess: () => {
      toast.success('Provider 已删除');
      setPendingDelete(null);
      void qc.invalidateQueries({ queryKey: ['admin', 'providers'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'routes'] });
    },
    onError: (err: Error) => toast.error('删除失败', err.message),
  });

  const toggleEnabled = useMutation({
    mutationFn: ({ providerId, enabled }: { providerId: string; enabled: boolean }) =>
      api.patch(`/admin/providers/${providerId}`, { enabled }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'providers'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'routes'] });
    },
    onError: (err: Error) => toast.error('操作失败', err.message),
  });

  return (
    <AdminPage
      title="Provider 配置"
      description="模型接入地址与凭据。Key 以密文落库，接口只回传掩码；任务路由决定每个环节走哪个 Provider。"
      actions={
        <Button size="sm" variant="primary" icon="Plus" onClick={() => setCreateOpen(true)}>
          新增 Provider
        </Button>
      }
    >
      <Card>
        <CardBody className="p-0">
          {providers.isError ? (
            <div className="p-5"><LoadError message="Provider 列表读取失败" onRetry={() => void providers.refetch()} /></div>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>名称</Th>
                  <Th>类型</Th>
                  <Th>Base URL</Th>
                  <Th>Key</Th>
                  <Th>模型</Th>
                  <Th>状态</Th>
                  <Th>操作</Th>
                </tr>
              </thead>
              <tbody>
                {providers.isLoading ? (
                  <tr><Td className="text-[var(--text-3)]">加载中</Td><Td /><Td /><Td /><Td /><Td /><Td /></tr>
                ) : (providers.data?.length ?? 0) === 0 ? (
                  <tr>
                    <Td className="text-[var(--text-3)]">还没有 Provider，至少需要配置一个才能生成内容</Td>
                    <Td /><Td /><Td /><Td /><Td /><Td />
                  </tr>
                ) : (
                  providers.data!.map((p) => (
                    <tr key={p.providerId}>
                      <Td>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[var(--text-1)]">{p.name}</span>
                          {p.isMock && <Badge tone="warning">Mock</Badge>}
                        </div>
                      </Td>
                      <Td className="text-[var(--text-2)]">{PROVIDER_TYPE_LABEL[p.type]}</Td>
                      <Td
                        className="max-w-[260px] truncate font-[var(--font-mono)] text-[12px] text-[var(--text-2)]"
                        title={p.baseUrl || '内置（不发外部请求）'}
                      >
                        {p.baseUrl || '内置（不发外部请求）'}
                      </Td>
                      <Td className="font-[var(--font-mono)] text-[12px] text-[var(--text-2)]">
                        {p.hasApiKey ? p.apiKeyMasked : '未配置'}
                      </Td>
                      <Td className="whitespace-nowrap text-[12px] text-[var(--text-3)]">
                        文本 {p.models.text.length} / 图片 {p.models.image.length} / 语音 {p.models.audio.length}
                      </Td>
                      <Td>
                        <Badge tone={p.enabled ? 'success' : 'neutral'}>{p.enabled ? '启用' : '停用'}</Badge>
                      </Td>
                      <Td>
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>编辑</Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => toggleEnabled.mutate({ providerId: p.providerId, enabled: !p.enabled })}
                          >
                            {p.enabled ? '停用' : '启用'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setPendingDelete(p)}>删除</Button>
                        </div>
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <div className="mt-4 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface-0)] px-4 py-3.5">
        <div className="flex items-start gap-2.5">
          <Icon name="Info" size={16} className="mt-0.5 shrink-0 text-[var(--text-3)]" decorative />
          <p className="text-[12px] leading-[1.7] text-[var(--text-3)]">
            内置 Mock 网关不发外部请求，返回确定性的占位内容，用于在无 Key 时跑通全链路。
            填入真实 Base URL 与 Key 后，把「任务路由」里的主模型切过去即可生效；Key 修改时留空表示保持不变。
          </p>
        </div>
      </div>

      <ProviderFormDialog
        open={createOpen || Boolean(editing)}
        provider={editing}
        onOpenChange={(v) => {
          if (!v) {
            setCreateOpen(false);
            setEditing(null);
          }
        }}
        onSaved={() => {
          void qc.invalidateQueries({ queryKey: ['admin', 'providers'] });
          void qc.invalidateQueries({ queryKey: ['admin', 'routes'] });
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(v) => { if (!v) setPendingDelete(null); }}
        title="删除 Provider"
        description={
          pendingDelete
            ? `删除「${pendingDelete.name}」后，仍指向它的任务路由会失效。确定继续吗？`
            : undefined
        }
        confirmText="删除"
        danger
        loading={remove.isPending}
        onConfirm={() => { if (pendingDelete) remove.mutate(pendingDelete.providerId); }}
      />
    </AdminPage>
  );
}

/* ---------------- 测试连接 ---------------- */

function TestButton({ provider }: { provider: ProviderPublic }) {
  const toast = useToast();
  const [kind, setKind] = useState<'text' | 'image'>('text');

  const test = useMutation({
    mutationFn: () => api.post<TestConnectionResult>(`/admin/providers/${provider.providerId}/test`, { kind }),
    onSuccess: (r) => {
      if (r.ok) toast.success('连接正常', `${r.model || '默认模型'} · ${r.latencyMs}ms`);
      else toast.error('连接失败', r.message || r.code || '未知错误');
    },
    onError: (err: Error) => toast.error('测试请求失败', err.message),
  });

  return (
    <div className="flex items-center gap-2">
      <span className="w-[110px]">
        <Select
          ariaLabel="测试类型"
          value={kind}
          onValueChange={(v) => setKind(v as 'text' | 'image')}
          options={[{ value: 'text', label: '文本模型' }, { value: 'image', label: '图片模型' }]}
        />
      </span>
      <Button size="sm" icon="PlugZap" loading={test.isPending} onClick={() => test.mutate()}>
        测试连接
      </Button>
    </div>
  );
}

/* ---------------- 表单 ---------------- */

function ProviderFormDialog({
  open, provider, onOpenChange, onSaved,
}: {
  open: boolean;
  provider: ProviderPublic | null;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState<ProviderDraft>(EMPTY_DRAFT);
  const [initializedFor, setInitializedFor] = useState<string | null>(null);

  // 打开时按目标 Provider 重置表单；同一 Provider 重复打开不覆盖用户正在编辑的内容
  const key = provider ? provider.providerId : '__new__';
  if (open && initializedFor !== key) {
    setInitializedFor(key);
    setDraft(provider ? toDraft(provider) : EMPTY_DRAFT);
  }
  if (!open && initializedFor !== null) {
    setInitializedFor(null);
  }

  const isEdit = Boolean(provider);
  const canSubmit = draft.name.trim().length > 0 && draft.baseUrl.trim().length > 0;

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: draft.name.trim(),
        type: draft.type,
        baseUrl: draft.baseUrl.trim(),
        pathPrefix: draft.pathPrefix.trim() || '/v1',
        models: {
          text: splitModels(draft.textModels),
          image: splitModels(draft.imageModels),
          audio: splitModels(draft.audioModels),
        },
        timeoutMs: draft.timeoutMs,
        maxRetries: draft.maxRetries,
        concurrency: draft.concurrency,
        costLimitTokens: draft.costLimitTokens,
        costLimitImages: draft.costLimitImages,
        pricing: {
          currency: draft.currency,
          inputPerMTokens: draft.priceIn,
          outputPerMTokens: draft.priceOut,
          perImage: draft.pricePerImage,
        },
        imageApi: draft.imageApi,
        imageSizeFormat: draft.imageSizeFormat,
        imageResolution: draft.imageResolution.trim() || '2K',
        imagePollTimeoutMs: draft.imagePollTimeoutMs,
        enabled: draft.enabled,
        // 留空表示不修改已存的 Key
        ...(draft.apiKey.trim() ? { apiKey: draft.apiKey.trim() } : {}),
      };
      return isEdit
        ? api.patch<ProviderPublic>(`/admin/providers/${provider!.providerId}`, body)
        : api.post<ProviderPublic>('/admin/providers', body);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Provider 已更新' : 'Provider 已创建');
      onSaved();
      onOpenChange(false);
    },
    onError: (err: Error) => toast.error('保存失败', err.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? `编辑 ${provider!.name}` : '新增 Provider'}
      description="Base URL 指向 OpenAI 兼容的网关根地址，实际请求会拼上路径前缀。"
      width={620}
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>取消</Button>
          <Button variant="primary" loading={save.isPending} disabled={!canSubmit} onClick={() => save.mutate()}>
            保存
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="名称" required htmlFor="pv-name">
            <Input id="pv-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="例如 主网关" />
          </Field>
          <Field label="类型" htmlFor="pv-type">
            <Select
              ariaLabel="类型"
              value={draft.type}
              onValueChange={(v) => setDraft({ ...draft, type: v as ProviderTypeValue })}
              options={[
                { value: 'openai-compatible', label: 'OpenAI 兼容' },
                { value: 'anthropic', label: 'Anthropic' },
                { value: 'deepseek', label: 'DeepSeek' },
                { value: 'custom', label: '自定义' },
              ]}
            />
          </Field>
        </div>

        <Field label="Base URL" required htmlFor="pv-url" hint="例如 https://api.example.com">
          <Input id="pv-url" value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="路径前缀" htmlFor="pv-prefix" hint="默认 /v1">
            <Input id="pv-prefix" value={draft.pathPrefix} onChange={(e) => setDraft({ ...draft, pathPrefix: e.target.value })} />
          </Field>
          <Field
            label="API Key"
            htmlFor="pv-key"
            hint={isEdit ? '留空表示不修改已保存的 Key' : '留空则只能用于不发外部请求的内置网关'}
          >
            <Input
              id="pv-key"
              type="password"
              autoComplete="off"
              value={draft.apiKey}
              onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
              placeholder={isEdit && provider?.hasApiKey ? `已保存（${provider.apiKeyMasked}）` : ''}
            />
          </Field>
        </div>

        <Field label="文本模型" htmlFor="pv-text-models" hint="多个用逗号分隔，第一个作为该 Provider 的默认文本模型">
          <Input id="pv-text-models" value={draft.textModels} onChange={(e) => setDraft({ ...draft, textModels: e.target.value })} placeholder="deepseek-v4" />
        </Field>

        <Field label="图片模型" htmlFor="pv-image-models" hint="多个用逗号分隔">
          <Input id="pv-image-models" value={draft.imageModels} onChange={(e) => setDraft({ ...draft, imageModels: e.target.value })} placeholder="gpt-image-2" />
        </Field>

        <Field label="语音模型" htmlFor="pv-audio-models" hint="讲解用的语音合成模型，多个用逗号分隔">
          <Input id="pv-audio-models" value={draft.audioModels} onChange={(e) => setDraft({ ...draft, audioModels: e.target.value })} placeholder="gpt-audio-1.5-official" />
        </Field>

        <div className="grid grid-cols-3 gap-4">
          <NumberField id="pv-timeout" label="超时（毫秒）" value={draft.timeoutMs} min={1000} onChange={(v) => setDraft({ ...draft, timeoutMs: v })} />
          <NumberField id="pv-retries" label="最大重试" value={draft.maxRetries} min={0} onChange={(v) => setDraft({ ...draft, maxRetries: v })} />
          <NumberField id="pv-concurrency" label="并发上限" value={draft.concurrency} min={1} onChange={(v) => setDraft({ ...draft, concurrency: v })} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <NumberField id="pv-limit-tokens" label="Token 费用上限" value={draft.costLimitTokens} min={0} onChange={(v) => setDraft({ ...draft, costLimitTokens: v })} hint="0 表示不限" />
          <NumberField id="pv-limit-images" label="图片费用上限" value={draft.costLimitImages} min={0} onChange={(v) => setDraft({ ...draft, costLimitImages: v })} hint="0 表示不限" />
        </div>

        <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4">
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium text-[var(--text-2)]">计费单价</span>
            <span className="text-[12px] text-[var(--text-3)]">
              按供应商账单的原始币种填写，不做汇率换算。留 0 表示未配置，用量页会显示 0 而不是猜一个数。
            </span>
          </span>
          <div className="grid grid-cols-4 gap-3">
            <Field label="币种" htmlFor="pv-currency">
              <Select
                ariaLabel="计费币种"
                value={draft.currency}
                onValueChange={(v) => setDraft({ ...draft, currency: v })}
                options={[{ value: 'CNY', label: 'CNY ¥' }, { value: 'USD', label: 'USD $' }]}
              />
            </Field>
            <DecimalField id="pv-price-in" label="输入 / 百万 token" value={draft.priceIn} onChange={(v) => setDraft({ ...draft, priceIn: v })} />
            <DecimalField id="pv-price-out" label="输出 / 百万 token" value={draft.priceOut} onChange={(v) => setDraft({ ...draft, priceOut: v })} />
            <DecimalField id="pv-price-image" label="每张图片" value={draft.pricePerImage} onChange={(v) => setDraft({ ...draft, pricePerImage: v })} />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4">
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium text-[var(--text-2)]">图片接口方言</span>
            <span className="text-[12px] text-[var(--text-3)]">
              同步接口一次请求直接返回图片；异步任务接口先拿任务 ID 再轮询。选错会一直超时。
            </span>
          </span>
          <div className="grid grid-cols-2 gap-3">
            <Field label="调用方式" htmlFor="pv-image-api">
              <Select
                ariaLabel="图片调用方式"
                value={draft.imageApi}
                onValueChange={(v) => setDraft({ ...draft, imageApi: v })}
                options={[{ value: 'sync', label: '同步返回（OpenAI 官方）' }, { value: 'task', label: '异步任务（ToAPIs 等）' }]}
              />
            </Field>
            <Field label="尺寸写法" htmlFor="pv-image-size">
              <Select
                ariaLabel="图片尺寸写法"
                value={draft.imageSizeFormat}
                onValueChange={(v) => setDraft({ ...draft, imageSizeFormat: v })}
                options={[{ value: 'pixels', label: '像素 1536x1024' }, { value: 'ratio', label: '比例 16:9 + 档位' }]}
              />
            </Field>
          </div>
          {draft.imageSizeFormat === 'ratio' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="清晰度档位" htmlFor="pv-image-resolution" hint="比例写法必填，如 1K / 2K / 4K">
                <Input id="pv-image-resolution" value={draft.imageResolution} onChange={(e) => setDraft({ ...draft, imageResolution: e.target.value })} placeholder="2K" />
              </Field>
              <NumberField id="pv-image-poll" label="任务轮询上限（毫秒）" value={draft.imagePollTimeoutMs} min={1000} onChange={(v) => setDraft({ ...draft, imagePollTimeoutMs: v })} hint="单张 2K 图实测约 60 秒" />
            </div>
          )}
        </div>

        <label className="flex items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
          <span className="flex flex-col gap-0.5">
            <span className="text-[13px] font-medium text-[var(--text-2)]">启用该 Provider</span>
            <span className="text-[12px] text-[var(--text-3)]">停用后不会被任何任务路由选中</span>
          </span>
          <Switch checked={draft.enabled} onCheckedChange={(v) => setDraft({ ...draft, enabled: v })} label="启用该 Provider" />
        </label>

        {isEdit && (
          <div className="flex flex-col gap-2.5 border-t border-[var(--border)] pt-4">
            <span className="flex flex-col gap-0.5">
              <span className="text-[13px] font-medium text-[var(--text-2)]">连通性自检</span>
              <span className="text-[12px] text-[var(--text-3)]">
                发一个最小请求验证地址与 Key 是否可用。测试用的是已保存的配置，改完请先保存再测。
              </span>
            </span>
            <TestButton provider={provider!} />
          </div>
        )}
      </div>
    </Dialog>
  );
}

function DecimalField({
  id, label, value, onChange,
}: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  // 单价是小数，不能像 NumberField 那样取整——0.02 被抹成 0 就变成「未配置」了
  return (
    <Field label={label} htmlFor={id}>
      <Input
        id={id}
        type="number"
        min={0}
        step="0.0001"
        value={String(value)}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) && n >= 0 ? n : 0);
        }}
      />
    </Field>
  );
}

function NumberField({
  id, label, value, min, onChange, hint,
}: { id: string; label: string; value: number; min: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <Field label={label} htmlFor={id} {...(hint ? { hint } : {})}>
      <Input
        id={id}
        type="number"
        min={min}
        value={String(value)}
        onChange={(e) => {
          const n = Number(e.target.value);
          onChange(Number.isFinite(n) && n >= min ? Math.floor(n) : min);
        }}
      />
    </Field>
  );
}
