import { useCallback, useRef, useState } from 'react';
import { Badge, Button, Dialog, Field, Icon, Input, Select, useToast } from '@lumen/ui';
import {
  STUDIO_MODULE_LABEL, layoutGroupsOf,
  type LayoutRecognizeStep, type ProgressPayload, type StudioModuleId,
} from '@lumen/ir-schema';
import { api, streamSse } from '../api/client.js';
import type { StyleDoc } from '../api/types.js';
import { uploadReferenceImages } from '../studio/upload.js';
import { pageTypeOfModule } from '../studio-modules.js';
import { HtmlMock, useMockImages } from './HtmlMock.js';
import { StepList } from './StepList.js';

/**
 * 识别版式：从一张参考图里认出一份骨架，存进某个版式库。
 *
 * ## 识别本身不落库
 *
 * 流跑完只拿到一份**候选骨架**，用户看过样机、确认过名字与分组、点了保存才落库。
 * 反过来（先落库再让用户删）的话，库里会攒一堆没人要的骨架，而删掉的那些 id
 * 已经花出去了。识别因此可以随便重跑，不留痕。
 *
 * ## 只有两步，而且很短
 *
 * 一次模型调用（看图写骨架），不合规再补一次。所以进度条只有两个阶段，
 * 整轮通常十几秒——`footer` 里说清这一点，免得用户按识别风格那三五分钟的预期等。
 */

/**
 * 两个阶段，顺序即实际执行顺序。
 *
 * 阶段名对着服务端的 `LAYOUT_RECOGNIZE_STEPS` 卡住：名字对不上进度就永远不亮，
 * 而这是这一轮唯一的反馈。重试**不会**多出一个阶段——服务端那两次都报 `check`，
 * 阶段序单调前进，徽标不会往回退。
 */
const STEPS = [
  { key: 'read', label: '看图写骨架' },
  { key: 'check', label: '检查是否合规' },
] as const satisfies readonly { key: LayoutRecognizeStep; label: string }[];

type StepKey = typeof STEPS[number]['key'];
type Progress = ProgressPayload<StepKey>;

/** 服务端 `skeleton` 事件给的形状。与 `recognize-layout.service.ts` 的 `RecognizedLayout` 对齐 */
interface Draft {
  name: string;
  brief: string;
  group: string;
  skeleton: string;
  slots?: number;
}

export function RecognizeLayoutDialog({
  open, onOpenChange, moduleId, doc, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 存进哪个版式库。由入口按钮所在的那张卡决定，不在这里再选一次 */
  moduleId: StudioModuleId;
  /**
   * 拿哪套风格渲染预览。
   *
   * 骨架只用 CSS 变量取色，所以**任何一套风格都能把它渲出来**——这里传的其实是
   * 「预览时配哪几张图、字体什么样」。不传的话图位是空的，用户看不出这份骨架
   * 在真实页面里长什么样，而「认出来的样子」正是他决定存不存的主要依据。
   */
  doc: StyleDoc;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [saving, setSaving] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);

  const groups = layoutGroupsOf(moduleId);
  const moduleLabel = STUDIO_MODULE_LABEL[moduleId];

  const reset = useCallback(() => {
    abortRef.current?.();
    abortRef.current = null;
    setImages([]);
    setRunning(false);
    setProgress(null);
    setDraft(null);
    setName('');
    setGroup('');
  }, []);

  async function onPickFiles(files: FileList | null) {
    if (!files) return;
    setUploading(true);
    try {
      // 一份版式看一张图就够，多传几张只是给模型多几个参照
      const next = await uploadReferenceImages(Array.from(files).slice(0, 6));
      setImages((prev) => [...prev, ...next].slice(0, 6));
    } catch (err) {
      toast.error('图片上传失败', err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  function start() {
    if (images.length === 0) return;
    setRunning(true);
    setDraft(null);
    setProgress(null);
    const qs = images.map((u) => `image=${encodeURIComponent(u)}`).join('&');
    abortRef.current = streamSse(
      `/studio/layouts/recognize-stream?module=${moduleId}&${qs}`,
      {
        onEvent: (event, data) => {
          if (event === 'progress') {
            setProgress(data as Progress);
          } else if (event === 'skeleton') {
            const d = data as Draft;
            setDraft(d);
            // 名字与分组都用识别出来的，用户改不改都行——模型判错分组时不必重跑一轮识别
            setName(d.name);
            setGroup(d.group);
            setRunning(false);
            setProgress(null);
          } else if (event === 'error') {
            setRunning(false);
            setProgress(null);
            toast.error('识别失败', (data as { message: string }).message);
          }
        },
        onError: (err) => {
          setRunning(false);
          setProgress(null);
          toast.error('识别中断', err.message);
        },
      },
    );
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    try {
      await api.post('/studio/layouts', {
        moduleId,
        name: name.trim(),
        brief: draft.brief,
        group,
        skeleton: draft.skeleton,
        ...(images[0] ? { sourceImage: images[0] } : {}),
      });
      toast.success('已存进功能库', `${moduleLabel} · ${name.trim()}`);
      onSaved();
      reset();
      onOpenChange(false);
    } catch (err) {
      // 服务端会把「哪一条不合规」放在 details 里，但这里只显示 message 就够了：
      // 真到了这一步说明识别流没拦住，那是 bug 不是用户能改的事
      toast.error('保存失败', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const previewPageType = pageTypeOfModule(moduleId) ?? 'gallery';
  const fragments = draft ? [draft.skeleton] : [];
  // 抠图位靠页类型决定取人像池还是物件池，所以这里必须把页类型一起传下去
  const mockImages = useMockImages(doc, fragments, [previewPageType]);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}
      title="识别并新建版式"
      description={`从设计稿里认出一份骨架，存进「${moduleLabel}」`}
      width={960}
      /* 按钮走 `footer`：children 是滚动体，放里面会被推到内容末尾 */
      footer={(
        <>
          <Button pill variant="ghost" onClick={() => { reset(); onOpenChange(false); }}>
            {draft ? '放弃' : '取消'}
          </Button>
          {!draft && (
            <Button
              pill
              variant="primary"
              loading={running}
              disabled={images.length === 0 || running || uploading}
              onClick={start}
            >
              开始识别
            </Button>
          )}
          {draft && (
            <Button pill variant="primary" loading={saving} disabled={name.trim().length === 0} onClick={() => void save()}>
              存进功能库
            </Button>
          )}
        </>
      )}
    >
      <div className="flex flex-col gap-5">
        {/*
          存进哪个库**写在明面上**。入口按钮长在某张版式卡上，用户点的时候心里有数，
          但对话框盖上来之后那一层上下文就没了——而存错库要删掉重来。
        */}
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] bg-[var(--surface-1)] px-3 py-2 text-[13px]">
          <Icon name="LibraryBig" size={16} className="text-[var(--text-3)]" />
          <span className="text-[var(--text-3)]">存进</span>
          <span className="font-medium text-[var(--text-1)]">{moduleLabel}</span>
          <span className="text-[var(--text-3)]">
            ——新骨架只进库，不会被自动挑中；要用它排某一页，去工作台的「换排版」里挑
          </span>
        </div>

        {!draft && (
          <>
            <label className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-[var(--border)] px-6 py-8 text-center transition-colors hover:bg-[var(--surface-1)]">
              <Icon name="ImageUp" size={24} />
              <span className="text-[13px] text-[var(--text-2)]">
                {uploading ? '正在上传…' : '点这里选一张参考设计稿'}
              </span>
              <span className="text-[12px] text-[var(--text-3)]">
                整页设计稿，或截图里的一页都行。多选可以给模型多几个参照
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => void onPickFiles(e.target.files)}
              />
            </label>

            {images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {images.map((url) => (
                  <div key={url} className="relative h-[72px] w-[128px] overflow-hidden rounded-[var(--radius-inner)] border border-[var(--border-subtle)]">
                    <img src={url} alt="" className="h-full w-full object-cover" />
                    <button
                      type="button"
                      aria-label="移除这张图"
                      className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white"
                      onClick={() => setImages((prev) => prev.filter((u) => u !== url))}
                    >
                      <Icon name="X" size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {running && (
          <StepList
            steps={STEPS}
            current={progress?.step}
            liveLabel={progress?.label}
            footer="一次模型调用，通常十几秒。不合规会自动带着问题重写一版。"
          />
        )}

        {draft && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-medium text-[var(--text-1)]">认出来的样子</span>
                  {draft.slots !== undefined && <Badge tone="neutral">{draft.slots} 个图位</Badge>}
                </div>
                <HtmlMock
                  doc={doc}
                  html={draft.skeleton}
                  width={560}
                  images={mockImages[0]}
                  pageType={previewPageType}
                  pageNo={1}
                  frame={false}
                />
              </div>

              <div className="flex flex-col gap-3">
                <Field label="名字" required htmlFor="layout-name">
                  <Input
                    id="layout-name"
                    value={name}
                    maxLength={40}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="如：四宫格等分"
                  />
                </Field>
                <Field
                  label="分组"
                  hint="模型判错了就改这里，不用重跑一轮识别"
                >
                  <Select
                    ariaLabel="分组"
                    value={group}
                    onValueChange={setGroup}
                    options={groups.map((g) => ({ value: g.key, label: g.label }))}
                  />
                </Field>
                <div className="flex flex-col gap-1">
                  <span className="text-[13px] font-medium text-[var(--text-2)]">适合什么内容</span>
                  <p className="text-[13px] leading-[1.6] text-[var(--text-3)]">{draft.brief}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}
