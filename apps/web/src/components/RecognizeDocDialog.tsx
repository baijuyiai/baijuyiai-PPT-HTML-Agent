import { useCallback, useMemo, useRef, useState } from 'react';
import { Badge, Button, Dialog, Icon, useToast } from '@lumen/ui';
import {
  PAGE_TYPE_LABEL, PAGE_TYPE_ORDER,
  type PageType, type ProgressPayload, type RecognizeStep,
} from '@lumen/ir-schema';
import { api, streamSse } from '../api/client.js';
import type { StyleDoc } from '../api/types.js';
import { uploadReferenceImages } from '../studio/upload.js';
import { HtmlMock, useMockImages } from './HtmlMock.js';
import { StepList } from './StepList.js';

/**
 * 识别风格：每个页类型一条 HTML 生成提示词 + 它真跑出来的样机。
 *
 * 一轮要三到六分钟（约二十次模型调用），所以走 SSE 边跑边报进度。
 * 界面上每一步都显示在做什么，用户不会对着一个转圈等五分钟。
 */

/**
 * 识别的五个阶段，顺序即实际执行顺序。
 *
 * 阶段名对着服务端的 `RECOGNIZE_STEPS` 卡住：名字对不上进度就永远不亮，而这是这一轮
 * 唯一的反馈，所以宁可编译不过也不要静默失效。
 */
const STEPS = [
  { key: 'split', label: '找出每一页' },
  { key: 'read', label: '逐页写提示词' },
  { key: 'synth', label: '提炼配色与风格名' },
  { key: 'derive', label: '推导缺失的页类型' },
  { key: 'mock', label: '生成样机' },
] as const satisfies readonly { key: RecognizeStep; label: string }[];

type StepKey = typeof STEPS[number]['key'];

/**
 * 服务端 SSE 发来的进度负载，形状直接取自共用契约，**不在这里另写一份**。
 *
 * 这里曾经手写过一个 `{ key, label, done, total }`，而服务端发的是 `step`；
 * `setProgress(data as Progress)` 是裸强转、TS 查不出来，于是 `progress.key` 恒为
 * undefined，五个阶段徽标一个都不亮、「已读 3/9 页」也永远不显示——一轮识别三五分钟
 * 全程没有任何进度反馈。手写第二份形状正是这个口子，所以现在只留一份。
 */
type Progress = ProgressPayload<StepKey>;

export function RecognizeDocDialog({
  open, onOpenChange, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [doc, setDoc] = useState<StyleDoc | null>(null);
  const [openPrompt, setOpenPrompt] = useState<PageType | null>(null);
  const abortRef = useRef<(() => void) | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.();
    abortRef.current = null;
    setImages([]);
    setRunning(false);
    setProgress(null);
    setDoc(null);
    setOpenPrompt(null);
  }, []);

  async function onPickFiles(files: FileList | null) {
    if (!files) return;
    setUploading(true);
    try {
      const next = await uploadReferenceImages(Array.from(files).slice(0, 12));
      setImages((prev) => [...prev, ...next].slice(0, 12));
    } catch (err) {
      toast.error('图片上传失败', err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  function start() {
    if (images.length === 0) return;
    setRunning(true);
    setDoc(null);
    setProgress(null);
    const qs = images.map((u) => `image=${encodeURIComponent(u)}`).join('&');
    abortRef.current = streamSse(`/styles/recognize-doc/stream?${qs}`, {
      onEvent: (event, data) => {
        if (event === 'progress') {
          const p = data as Progress;
          setProgress(p);
        } else if (event === 'done') {
          setDoc(data as StyleDoc);
          setRunning(false);
          setProgress(null);
          toast.success('识别完成', '可以逐页看提示词与样机');
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
    });
  }

  const save = async () => {
    if (!doc) return;
    try {
      const r = await api.post<{ styleId: string; issues: { pageType: string; message: string }[] }>(
        '/styles/docs', { doc },
      );
      toast.success('已存入风格库', doc.name);
      // 提示词结构有问题的如实说出来，但不阻断保存
      if (r.issues.length > 0) toast.info('有几条提示词结构不全', `${r.issues.length} 条，可展开逐条查看`);
      onSaved();
      reset();
      onOpenChange(false);
    } catch (err) {
      toast.error('保存失败', err instanceof Error ? err.message : String(err));
    }
  };

  const covered = useMemo(() => (doc ? PAGE_TYPE_ORDER.filter((t) => doc.pagePrompts[t]) : []), [doc]);
  const fragments = useMemo(() => covered.map((t) => doc!.pagePrompts[t]!.mockHtml), [covered, doc]);
  // 九个页类型共用同一套配色，配图必须整组一起分——各挑各的会让几张样机撞成同一张画面
  const mockImages = useMockImages(doc, fragments, covered);

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}
      title="识别风格"
      description="上传设计稿，为每个页类型写一条 HTML 生成提示词，并真跑出样机"
      width={1100}
    >
      <div className="flex flex-col gap-5">
        {!doc && (
          <>
            <label className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-[var(--border)] px-6 py-8 text-center transition-colors hover:bg-[var(--surface-1)]">
              <Icon name="ImageUp" size={24} />
              <span className="text-[13px] text-[var(--text-2)]">
                {uploading ? '正在上传…' : '点这里选设计稿，可以一次选多张'}
              </span>
              <span className="text-[12px] text-[var(--text-3)]">
                单页导出或拼图都行。拼图会自动找出里面每一页
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
            footer="一轮约二十次模型调用、三到六分钟。可以切走做别的，别关这个窗口。"
          />
        )}

        {doc && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-[15px] font-semibold text-[var(--text-1)]">{doc.name}</span>
              <Badge tone="neutral">{doc.theme === 'dark' ? '深色' : '浅色'}</Badge>
              <span className="text-[12px] text-[var(--text-3)]">{doc.description}</span>
              <div className="ml-auto flex items-center gap-1.5">
                {Object.values(doc.palette).map((c) => (
                  <span
                    key={c}
                    title={c}
                    className="h-4 w-4 rounded-full border border-[var(--border-subtle)]"
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {covered.map((t, i) => {
                const p = doc.pagePrompts[t]!;
                return (
                  <div key={t} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-[var(--text-1)]">{PAGE_TYPE_LABEL[t]}</span>
                      <Badge tone={p.source === 'reference' ? 'brand' : 'neutral'}>
                        {p.source === 'reference' ? '参考图里有' : '推导'}
                      </Badge>
                      <button
                        type="button"
                        className="ml-auto text-[12px] text-[var(--text-3)] underline-offset-2 hover:underline"
                        onClick={() => setOpenPrompt(openPrompt === t ? null : t)}
                      >
                        {openPrompt === t ? '收起提示词' : '看提示词'}
                      </button>
                    </div>
                    <HtmlMock doc={doc} html={p.mockHtml} width={420} images={mockImages[i]} pageType={t} pageNo={i + 1} />
                    {openPrompt === t && (
                      <pre className="max-h-[220px] overflow-auto whitespace-pre-wrap rounded-[var(--radius-inner)] bg-[var(--surface-1)] px-3 py-2 text-[12px] leading-[1.7] text-[var(--text-2)]">
                        {p.prompt}
                      </pre>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button pill variant="ghost" onClick={() => { reset(); onOpenChange(false); }}>
            {doc ? '放弃' : '取消'}
          </Button>
          {!doc && (
            <Button pill variant="primary" loading={running} disabled={images.length === 0 || running} onClick={start}>
              开始识别
            </Button>
          )}
          {doc && <Button pill variant="primary" onClick={() => void save()}>存入风格库</Button>}
        </div>
      </div>
    </Dialog>
  );
}
