import { useEffect, useMemo, useState } from 'react';
import { Button, Dialog, SegmentedControl } from '@lumen/ui';
import { resolveMotion } from '@lumen/motion';
import type { ChartStyleId, PageIR, PageType, StockImage, StyleDoc } from '@lumen/ir-schema';
import { FlipStage } from './FlipStage.js';
import { HtmlMock } from './HtmlMock.js';

/**
 * 放大演示弹框：把一张样机铺到大尺寸上，看清动效。
 *
 * ## 为什么要放大才看得见
 *
 * 列表里的样机只有 400px 宽。逐块进场在那么小的画面上就是「一片糊过去」，
 * 悬停反馈更是连鼠标都落不准——一个图位在 400px 的样机上只有几十像素。
 * 放大到一千多像素，这两件事才谈得上「看」。
 *
 * ## 三样东西都是真的，不是示意
 *
 * - **内容怎么进画面**：`staggerSeed` 交给 `HtmlMock`，由 `markStaggerItems` 标出阅读序、
 *   `STAGGER_CSS` 排延迟。种子按版式下标走，所以不同版式的进场方向不一样。
 * - **悬停反馈**：`hover` 打开，`HOVER_CSS` 注进 iframe。
 * - **深浅模板**：换的是 `doc` 本身，样机那一层配色跟着变。
 *
 * ## 重播靠的是重建 iframe
 *
 * 进场是**一次性的 CSS 动画**（`animation-fill-mode: both`），放完就停在终态，
 * 没有「重放」这种操作。可靠的办法是把文档重新加载一遍：把计数器并进 `FlipStage`
 * 的 `pageKey`，它的 `key` 一变整棵子树卸载重建，iframe 是个新元素，
 * 浏览器重新解析 `srcDoc`，动画自然从头播。
 *
 * **`staggerSeed` 必须是具体数字**，传 null 的话压根没有逐块进场，
 * 重播就只剩下 `FlipStage` 那一层淡入，看着像没反应。
 */

/** 弹框里要演示的那一张。由调用方从模块列表里挑好再传 */
export interface PreviewScene {
  /** 换一张就该重播一次进场。调用方给个稳定的标识（版式 id 之类） */
  key: string;
  title: string;
  brief?: string;
  html: string;
  /** **必须是整组分配好的那一份**，见下面 `images` 的说明 */
  images?: StockImage[];
  pageType?: PageType;
  pageNo?: number;
  /** 数字人三态那三张要用它区分 */
  avatar?: PageIR['avatar'] | null;
  /** 逐块进场的种子。传版式下标，不同版式的进场方向就错开了 */
  seed: number;
  /** 图表视觉风格。只有图表骨架用得上；不传就用默认那一套 */
  chartStyle?: ChartStyleId;
}

/**
 * 弹框里除了样机以外要占掉的高度，**在 1366×768 上量出来的**：
 *
 * - 98 标题行。这个数**跟着弹框宽度变**——宽度一收窄，描述那一行就折成两行，
 *   实测在 1060px 宽时是 77、857px 宽时是 98。取的是宽的那一档。
 * - 57 页脚（那个「看完整样机」按钮，三种卡片都会传）
 * - 28 内容区上下 `py-4`（实测 14 + 14）
 * - 42 工具栏那行（30）+ 它与样机之间的 `gap-3`（12）
 *
 * **取宽的那一档是有意的**：这个常量参与算宽度，宽度又反过来决定标题折不折行，
 * 真去解这个不动点不值当。按最坏情况留够，代价只是样机小几十像素。
 */
const CHROME_H = 225;
/** 内容区左右 `px-5` 各 20 */
const PAD_X = 40;
/** 再大就超过 1920 画布的观感了 */
const MAX_DIALOG_W = 1240;

/**
 * 按视口算弹框与样机的宽度，让 16:9 的样机既够大又不撑出滚动条。
 *
 * **不用 `ResizeObserver` 量容器**：容器的尺寸反过来由这里算出的宽度决定，
 * 量它就成了循环依赖。视口才是那个真正独立的自变量。
 */
function computeSize(): { dialog: number; mock: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // 86vh 是 `Dialog` 内容区的上限；减掉排版开销就是留给样机的高度，再按 16:9 折回宽度
  const byHeight = ((vh * 0.86 - CHROME_H) * 16) / 9 + PAD_X;
  const dialog = Math.round(Math.min(vw - 48, byHeight, MAX_DIALOG_W));
  return { dialog, mock: dialog - PAD_X };
}

function useDialogSize(): { dialog: number; mock: number } {
  const [size, setSize] = useState(computeSize);
  useEffect(() => {
    const onResize = () => setSize(computeSize());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

export function ModulePreviewDialog({
  open, onOpenChange, doc, scene, theme, onThemeChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  doc: StyleDoc;
  scene: PreviewScene | null;
  theme: 'light' | 'dark';
  onThemeChange: (v: 'light' | 'dark') => void;
}) {
  const { dialog, mock } = useDialogSize();
  const [replay, setReplay] = useState(0);

  // 逐块进场的种子按版式下标走：不同版式的进场方向错开，连着看几张不会像同一张
  const motion = useMemo(
    () => resolveMotion({ enter: 'auto', from: 'style-pack' }, scene?.seed ?? 0),
    [scene?.seed],
  );

  /**
   * `theme` 也并进 key：换深浅模板时让内容重新进一次场，而不是「啪」地换一层色。
   * 用户要看的本来就是「内容怎么进画面」，换一层配色顺带再看一遍是好事。
   */
  const stageKey = `${scene?.key ?? ''}|${theme}|${replay}`;

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={scene?.title ?? ''}
      {...(scene?.brief ? { description: scene.brief } : {})}
      width={dialog}
    >
      {scene && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[12px] text-[var(--text-3)]">
              鼠标移到图片上试试；「重播入场」把内容重新进一次画面
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon="RotateCcw"
                onClick={() => setReplay((n) => n + 1)}
              >
                重播入场
              </Button>
              <SegmentedControl
                size="sm"
                value={theme}
                onChange={onThemeChange}
                options={[
                  { value: 'light' as const, label: '浅色模板', icon: 'Sun' },
                  { value: 'dark' as const, label: '深色模板', icon: 'Moon' },
                ]}
              />
            </div>
          </div>

          <FlipStage pageKey={stageKey} motion={motion.page} className="self-center">
            <HtmlMock
              doc={doc}
              html={scene.html}
              width={mock}
              images={scene.images}
              pageType={scene.pageType}
              pageNo={scene.pageNo ?? 1}
              staggerSeed={motion.staggerSeed}
              avatar={scene.avatar ?? null}
              hover
              chartStyle={scene.chartStyle}
            />
          </FlipStage>
        </div>
      )}
    </Dialog>
  );
}
