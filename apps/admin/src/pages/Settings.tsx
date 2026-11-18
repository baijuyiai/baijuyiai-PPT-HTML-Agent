import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Card, CardBody, CardHeader, Field, Icon, Input, Switch, useToast } from '@lumen/ui';
import { NARRATION_VOICE_OPTIONS } from '@lumen/ir-schema';
import { api } from '../api/client.js';
import type { AdminSettings } from '../api/types.js';
import { AdminPage, LoadError } from '../components/AdminPage.js';

export function SettingsPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<AdminSettings | null>(null);
  /**
   * 待保存的抠图密钥。
   *
   * **不放进 `draft`**：`draft` 是整份设置、每次点保存都整体 PATCH 一次，
   * 把密钥混在里面会让「改了并发」这种无关保存也把密钥重发一遍。留空表示不动它。
   */
  const [apiKey, setApiKey] = useState('');

  const settings = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<AdminSettings>('/admin/settings'),
  });

  // 首次拿到数据后填充表单；之后不再覆盖用户正在编辑的内容
  useEffect(() => {
    if (settings.data && draft === null) setDraft(settings.data);
  }, [settings.data, draft]);

  const save = useMutation({
    mutationFn: () => api.patch<AdminSettings>('/admin/settings', {
      ...draft!,
      ...(apiKey.trim() ? { koukoutuApiKey: apiKey.trim() } : {}),
    }),
    onSuccess: (next) => {
      setDraft(next);
      setApiKey('');
      toast.success('设置已保存');
      void qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
    },
    onError: (err: Error) => toast.error('保存失败', err.message),
  });

  const clearKey = useMutation({
    mutationFn: () => api.patch<AdminSettings>('/admin/settings', { koukoutuApiKey: '' }),
    onSuccess: (next) => {
      setDraft(next);
      setApiKey('');
      toast.success('抠图密钥已清除');
    },
    onError: (err: Error) => toast.error('清除失败', err.message),
  });

  return (
    <AdminPage
      title="全局设置"
      description="影响所有租户的开关。改动会立即生效并记入审计日志。"
      width="narrow"
      actions={
        <Button
          size="sm"
          variant="primary"
          loading={save.isPending}
          disabled={!draft || !settings.data}
          onClick={() => save.mutate()}
        >
          保存
        </Button>
      }
    >
      {settings.isError ? (
        <LoadError message="设置读取失败" onRetry={() => void settings.refetch()} />
      ) : !draft ? (
        <p className="text-[13px] text-[var(--text-3)]">加载中</p>
      ) : (
        <div className="flex flex-col gap-5">
          <Card>
            <CardHeader title="注册" description="自助注册开关与限流" />
            <CardBody className="flex flex-col gap-4">
              <label className="flex items-center justify-between gap-4">
                <span className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-medium text-[var(--text-2)]">允许自助注册</span>
                  <span className="text-[12px] text-[var(--text-3)]">
                    关闭后只能由管理员在「用户与 CRM」里创建账号
                  </span>
                </span>
                <Switch
                  checked={draft.allowSelfSignup}
                  onCheckedChange={(v) => setDraft({ ...draft, allowSelfSignup: v })}
                  label="允许自助注册"
                />
              </label>

              <div className="w-[220px]">
                <Field
                  label="同 IP 每小时注册上限"
                  htmlFor="set-signup"
                  hint={draft.allowSelfSignup ? '超出后注册请求会被拒绝' : '当前已关闭自助注册，此值暂不生效'}
                >
                  <Input
                    id="set-signup"
                    type="number"
                    min={1}
                    max={1000}
                    value={String(draft.signupMaxPerHour)}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setDraft({ ...draft, signupMaxPerHour: Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1 });
                    }}
                  />
                </Field>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="并发" description="全局队列并发上限，覆盖单个租户的配额设置" />
            <CardBody className="flex flex-col gap-4">
              <div className="w-[220px]">
                <Field label="最大并发任务数" htmlFor="set-concurrency" hint="1 到 64 之间">
                  <Input
                    id="set-concurrency"
                    type="number"
                    min={1}
                    max={64}
                    value={String(draft.maxConcurrency)}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setDraft({ ...draft, maxConcurrency: Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1 });
                    }}
                  />
                </Field>
              </div>
              <div className="flex items-start gap-2.5 rounded-[var(--radius-control)] bg-[var(--surface-1)] px-3 py-2.5">
                <Icon name="Info" size={16} className="mt-0.5 shrink-0 text-[var(--text-3)]" decorative />
                <p className="text-[12px] leading-[1.7] text-[var(--text-3)]">
                  调高会加快多项目并行时的吞吐，但也会同时占用更多模型配额。Worker 重启后从库里读取最新值。
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="抠图服务"
              description="抠抠图（koukoutu.com）的同步抠图接口，用来把图的主体抠出来、背景变透明"
            />
            <CardBody className="flex flex-col gap-4">
              <div className="w-full max-w-[420px]">
                <Field
                  label="API Key"
                  htmlFor="set-koukoutu"
                  hint={draft.koukoutuApiKeySet
                    ? '已配置。留空表示不改；填新的会覆盖'
                    : '还没配置。到 koukoutu.com/user/dev 领取'}
                >
                  <Input
                    id="set-koukoutu"
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    placeholder={draft.koukoutuApiKeySet ? '（已配置，留空不改）' : '粘贴 API Key'}
                    onChange={(e) => setApiKey(e.target.value)}
                  />
                </Field>
              </div>
              {draft.koukoutuApiKeySet && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="Trash2"
                  loading={clearKey.isPending}
                  onClick={() => clearKey.mutate()}
                >
                  清除密钥
                </Button>
              )}
              <div className="flex items-start gap-2.5 rounded-[var(--radius-control)] bg-[var(--surface-1)] px-3 py-2.5">
                <Icon name="Info" size={16} className="mt-0.5 shrink-0 text-[var(--text-3)]" decorative />
                <p className="text-[12px] leading-[1.7] text-[var(--text-3)]">
                  密钥加密后存库，接口只回「配没配」、不回明文，改动会立即生效不用重启。
                  同步接口按张计费（1 积分一张，PNG 输出加 1）。
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="讲解语音"
              description="这里设的是新项目的初始值。每个项目可以在工作台里单独改；没单独改过的项目跟着这里走"
            />
            <CardBody className="flex flex-col gap-4">
              <div className="w-full max-w-[420px]">
                <Field
                  label="音色"
                  htmlFor="set-narration-voice"
                  hint="从下拉里挑，也可以直接填。留空则用 alloy"
                >
                  <Input
                    id="set-narration-voice"
                    list="narration-voice-options"
                    autoComplete="off"
                    value={draft.narrationVoice}
                    placeholder="alloy"
                    onChange={(e) => setDraft({ ...draft, narrationVoice: e.target.value })}
                  />
                </Field>
                {/*
                  备选列表用 `datalist` 而不是 `Select`：**它只是建议，不是枚举**。
                  可用音色取决于语音模型，写死一份下拉会在换模型时把人锁在错的名字上；
                  原生 datalist 既能下拉挑、也能手填，两边都不耽误。
                */}
                <datalist id="narration-voice-options">
                  {NARRATION_VOICE_OPTIONS.map((v) => (
                    <option key={v.id} value={v.id}>{v.hint}</option>
                  ))}
                </datalist>
              </div>
              <Field
                label="语气"
                htmlFor="set-narration-tone"
                hint="作为提示词发给语音模型，告诉它该怎么读。留空会读得偏快"
              >
                <Input
                  id="set-narration-tone"
                  autoComplete="off"
                  value={draft.narrationTone}
                  placeholder="沉稳自信，像给客户做正式汇报"
                  onChange={(e) => setDraft({ ...draft, narrationTone: e.target.value })}
                />
              </Field>
              <div className="flex items-start gap-2.5 rounded-[var(--radius-control)] bg-[var(--surface-1)] px-3 py-2.5">
                <Icon name="Info" size={16} className="mt-0.5 shrink-0 text-[var(--text-3)]" decorative />
                <p className="text-[12px] leading-[1.7] text-[var(--text-3)]">
                  音色可以从下拉里挑，也可以直接填一个列表里没有的——可用音色取决于语音模型，
                  写死成固定枚举会在换模型时对不上。
                </p>
              </div>
              <div className="flex items-start gap-2.5 rounded-[var(--radius-control)] bg-[var(--surface-1)] px-3 py-2.5">
                <Icon name="Info" size={16} className="mt-0.5 shrink-0 text-[var(--text-3)]" decorative />
                <p className="text-[12px] leading-[1.7] text-[var(--text-3)]">
                  音色本身也会明显改变语速。同一段 688 字讲稿、同一个语气，实测 nova 62 秒、
                  alloy 92 秒、onyx 142 秒——差出一倍多。所以换音色之后音频长度、合成耗时与
                  开销都会跟着变，试听时留意节奏是不是你要的。
                </p>
              </div>
              <div className="flex items-start gap-2.5 rounded-[var(--radius-control)] bg-[var(--surface-1)] px-3 py-2.5">
                <Icon name="Info" size={16} className="mt-0.5 shrink-0 text-[var(--text-3)]" decorative />
                <p className="text-[12px] leading-[1.7] text-[var(--text-3)]">
                  语气会明显改变语速与音频长度：留空时模型按自己的默认节奏读，实测偏快
                  （约 13 字/秒，接近播报速度）；给一段语气描述后会放慢到演示该有的节奏
                  （约 7 字/秒），音频长度约为两倍、合成时间也更长。想更紧凑就往提示词里加
                  「语速偏快」，想要更从容就写「语速放慢」。
                </p>
              </div>
              <div className="flex items-start gap-2.5 rounded-[var(--radius-control)] bg-[var(--surface-1)] px-3 py-2.5">
                <Icon name="Info" size={16} className="mt-0.5 shrink-0 text-[var(--text-3)]" decorative />
                <p className="text-[12px] leading-[1.7] text-[var(--text-3)]">
                  改完音色或语气，已生成的讲解会自动失效并在下次播放时重新合成，不用手动清缓存。
                  演示端按需合成（讲到哪页合哪页），所以不演示就不会产生语音费用。
                </p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="环境" description="只读信息，来自服务端启动时读取的配置" />
            <CardBody>
              <p className="text-[12px] leading-[1.7] text-[var(--text-3)]">
                主密钥、数据库路径与数据目录由环境变量决定，改动需要重启服务，因此不在界面里提供修改入口。
                需要调整时修改仓库根目录的 <span className="font-[var(--font-mono)]">.env.local</span> 后重启。
              </p>
            </CardBody>
          </Card>
        </div>
      )}
    </AdminPage>
  );
}
