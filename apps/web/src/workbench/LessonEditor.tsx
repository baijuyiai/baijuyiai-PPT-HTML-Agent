import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Badge, Button, IconButton, Input, PanelEmpty, Select, Textarea, Tooltip, useToast } from '@lumen/ui';
import type { PlanStep } from '@lumen/ir-schema';
import { api } from '../api/client.js';
import type { PageIR } from '../api/types.js';
import { PAGE_TYPE_LABEL, PAGE_TYPE_OPTIONS } from './page-types.js';
import { PlanningProgress } from './PlanningProgress.js';
import { useWorkbench, type PlanProgress, type PlanScope } from './store.js';

/**
 * 教案编辑器（「项目需求」tab 的中栏）。
 *
 * 教案与大纲是**同一份数据**：这里改的标题，右侧大纲列表那一行立刻跟着变。
 * 所以它不自己存一份状态，读写都走 `useWorkbench`，与大纲列表共用同一条路径。
 *
 * 五个字段就是教案的全部：标题 / 一句话主张 / 要点 / 视觉形式 / 设计说明。
 * 前三个大纲阶段也会填（那是骨架），后两个只有教案阶段填——所以一页有没有
 * 教案，看的就是「视觉形式」有没有字。
 *
 * **整本在规划时中栏整个让给 `PlanningProgress`**：那会儿模型正在重写手上这一页，
 * 底下这些输入框填什么都留不住，摆着只会让人误以为能改。
 */

export function LessonEditor({
  projectId, planning, planScope, progress, onGenerateLesson, onGeneratePage, generatingPage,
}: {
  projectId: string;
  /** 正在跑哪一段；null = 空闲 */
  planning: PlanStep | null;
  /** 这一轮是谁点的。两个按钮跑同一条流，光看 `planning` 分不出该给哪个转圈 */
  planScope: PlanScope | null;
  progress: PlanProgress | null;
  onGenerateLesson: () => void;
  onGeneratePage: () => void;
  generatingPage: boolean;
}) {
  const toast = useToast();
  const outline = useWorkbench((s) => s.outline);
  const activeIndex = useWorkbench((s) => s.activeIndex);
  const patchOutline = useWorkbench((s) => s.patchOutline);
  const changePageType = useWorkbench((s) => s.changePageType);

  const page = outline[activeIndex];
  const structural = page?.pageType === 'cover' || page?.pageType === 'end';

  /**
   * 要点在界面上是**一行一条**的多行文本，存的是字符串数组。
   *
   * 编辑期间必须留住用户正在敲的那份文本（包括空行与行尾），不能每次按键都
   * 往数组里塞再拼回来——那样删到空行时光标会跳。所以这里有一份草稿，
   * 失焦时才归一写回。
   */
  const [pointsDraft, setPointsDraft] = useState('');
  const pointsText = (page?.points ?? []).join('\n');
  useEffect(() => setPointsDraft(pointsText), [pointsText, activeIndex]);

  const save = useMutation({
    mutationFn: () => api.put(`/projects/${projectId}/outline`, {
      outline: useWorkbench.getState().outline.map((o, i) => ({ ...o, index: i })),
    }),
    onSuccess: () => {
      // 与大纲列表那个保存同一个口径：存进去了就放开 hydrate
      useWorkbench.getState().markOutlineSaved();
      toast.success('教案已保存');
    },
    onError: (err: Error) => toast.error('保存失败', err.message),
  });

  /**
   * 整本在规划时，中栏整个让给进度那一屏。
   *
   * **这一段必须排在「还没有提纲」那个提前返回前面**：点下「生成整本教案」的头几秒
   * 提纲还没落库，`outline.length` 就是 0——原先正好落在那个静态占位上，
   * 用户看到的是「还没有提纲」，而不是「正在生成提纲」。
   */
  if (planning !== null && planScope === 'all') {
    return (
      <section className="flex min-h-0 min-w-0 flex-1 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-0)]">
        <PlanningProgress
          step={planning}
          label={progress?.label ?? null}
          progress={progress}
          hint="整本重排，要跑几分钟"
        />
      </section>
    );
  }

  if (outline.length === 0) {
    return (
      <section className="flex min-w-0 flex-1 items-center justify-center border-r border-[var(--border-subtle)] bg-[var(--surface-0)]">
        <PanelEmpty
          icon="NotebookPen"
          title="还没有提纲"
          description="先在右边写清需求、定好页数与深度，再点下面的「生成整本教案」。"
        />
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface-0)]">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] px-3">
        <span className="text-[13px] font-semibold text-[var(--text-1)]">教案</span>
        <Badge tone="neutral">
          <span className="font-[var(--font-mono)] tabular-nums">第 {activeIndex + 1} 页 / 共 {outline.length} 页</span>
        </Badge>
        {page && <Badge tone="neutral">{PAGE_TYPE_LABEL[page.pageType]}</Badge>}
        {page?.edited && (
          <Tooltip content="你改过这一页。重新生成提纲时它会原样保留">
            <Badge tone="warning">已手改</Badge>
          </Tooltip>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <Tooltip content="保存教案">
            <IconButton
              name="Save"
              label="保存教案"
              size={16}
              disabled={save.isPending}
              onClick={() => save.mutate()}
            />
          </Tooltip>
          <Button
            size="sm"
            pill
            icon="Sparkles"
            disabled={planning !== null}
            loading={planning !== null && planScope === 'one'}
            onClick={onGenerateLesson}
          >
            生成本页教案
          </Button>
          <Tooltip content="按这一页的教案写出页面 HTML">
            <Button
              size="sm"
              pill
              variant="primary"
              icon="LayoutTemplate"
              disabled={planning !== null}
              loading={generatingPage}
              onClick={onGeneratePage}
            >
              生成本页页面
            </Button>
          </Tooltip>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto lumen-scroll px-5 py-4">
        {!page ? (
          <PanelEmpty icon="MousePointerClick" title="选一页" description="在右侧大纲里点一页，这里编辑它的教案。" />
        ) : (
          <div className="mx-auto flex max-w-[720px] flex-col gap-4">
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <Field label="标题">
                  <Input
                    value={page.title}
                    aria-label="标题"
                    onChange={(e) => patchOutline(activeIndex, { title: e.target.value })}
                  />
                </Field>
              </div>
              <div className="min-w-0 flex-1">
                <Field label="页类型" hint={structural ? '封面与结尾页类型不可更改' : undefined}>
                  <Select
                    ariaLabel="页类型"
                    value={page.pageType}
                    onValueChange={(v) => changePageType(activeIndex, v as PageIR['pageType'])}
                    options={PAGE_TYPE_OPTIONS.map((p) => ({ value: p.value, label: p.label }))}
                    disabled={structural}
                  />
                </Field>
              </div>
            </div>

            <Field label="这一页要讲清的一句话">
              <Input
                value={page.claim}
                aria-label="一句话主张"
                placeholder="例如：存量竞争加剧，增长逻辑正在重构"
                onChange={(e) => patchOutline(activeIndex, { claim: e.target.value })}
              />
            </Field>

            <Field label="要点" hint="一行一条。带上具体数字与措辞，别写「增长显著」这类空话。">
              <Textarea
                rows={10}
                value={pointsDraft}
                aria-label="要点"
                placeholder={'市场增速从 210% 降到 18%\n续费率从 82% 掉到 61%'}
                onChange={(e) => setPointsDraft(e.target.value)}
                onBlur={() => patchOutline(activeIndex, {
                  points: pointsDraft.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 5),
                })}
              />
            </Field>

            {/*
              这两栏是**成段的文字**（其余几栏都是一行），所以有两处与别处不同：

              1. 高一点。三行的框放不下一句完整的视觉形式，滚着读等于看不见全貌；
              2. 文字**暗两档**（`--text-3`）。`--text-1` 是近白、`--text-2` 也还亮，
                 一行标题那样用没问题，铺满一屏的段落就抢戏。

              placeholder **必须比正文再暗一档**：它本来取的就是 `--text-3`，
              正文也用 `--text-3` 的话，空框里的提示和填进去的内容就同色了——
              一眼扫过去像是已经有内容。
            */}
            <div className="flex items-start gap-4">
              <div className="min-w-0 flex-1">
                <Field label="视觉形式" hint="这一页配什么图、用什么图表、什么版式。生成页面时会作为明确要求发下去。">
                  <Textarea
                    rows={6}
                    value={page.visualForm ?? ''}
                    aria-label="视觉形式"
                    placeholder="左右分栏，左侧一张增长曲线图，右侧三条要点卡"
                    className="text-[var(--text-3)] placeholder:opacity-60"
                    onChange={(e) => patchOutline(activeIndex, { visualForm: e.target.value })}
                  />
                </Field>
              </div>
              <div className="min-w-0 flex-1">
                <Field label="设计说明" hint="这一页为什么这么排、要给听众留下什么。只给人看，不会发给模型。">
                  <Textarea
                    rows={6}
                    value={page.designNote ?? ''}
                    aria-label="设计说明"
                    placeholder="先让数字自己说话，再落到结论上"
                    className="text-[var(--text-3)] placeholder:opacity-60"
                    onChange={(e) => patchOutline(activeIndex, { designNote: e.target.value })}
                  />
                </Field>
              </div>
            </div>

            {!page.visualForm && (
              <p className="text-[12px] leading-[1.6] text-[var(--text-3)]">
                这一页还没有教案。点上面的「生成本页教案」让模型照着原文写实，
                或者直接手写——视觉形式填了之后，生成页面时会按它来排。
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** 带标签的一栏。与新建项目弹窗里的 `Field` 同一套排版 */
function Field({ label, hint, children }: { label: string; hint?: string | undefined; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] text-[var(--text-3)]">{label}</span>
      {children}
      {hint && <span className="text-[11px] leading-[1.5] text-[var(--text-3)]">{hint}</span>}
    </label>
  );
}
