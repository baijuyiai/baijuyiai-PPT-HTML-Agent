import { useState } from 'react';
import { moduleOfPageType, PAGE_TYPE_LABEL, type PageType } from '@lumen/ir-schema';
import { Button } from '@lumen/ui';
import type { StyleDoc } from '../api/types.js';
import { libraryPageTypeOf } from '../studio-modules.js';
import { ElementEditPanel } from './ElementEditPanel.js';
import { PageLayoutPanel } from './PageLayoutPanel.js';
import { RedrawPagePanel } from './RedrawPagePanel.js';

/**
 * 「编辑这一页」的三条路，装在一个壳里。
 *
 * | 模式 | 做什么 | 什么时候用 |
 * | --- | --- | --- |
 * | 直接改 | 在现有这一页上挪元素、改文字，提示词不动 | 大方向对，就差几处位置 |
 * | 换版式 | 从版式库里挑一份骨架，样机换成它、这一页绑上它 | 版面不对但内容对，不想等模型重画 |
 * | 重做 | 传一张参考图，整页重新识别，提示词与样机一起换 | 这一页的版式整个不对，库里也没有合用的 |
 *
 * **三条路共用一个抽屉、一行头部**，不各开一个入口：它们改的是同一个对象（这一页），
 * 用户心里也是一件事（「这一页不对」），只是修法深浅不同。分成三个按钮的话，
 * 用户得先判断自己属于哪一种，而那个判断只有进去看了才知道。
 *
 * **「换版式」只在有版式库的页类型上出现**——判据是 `moduleOfPageType`（见下面的 `hasLayouts`），
 * 不在这里写死名单：写死的话，每加一个版式库都得回来改一遍，而漏改的症状是
 * 「那个库的页类型下面没有这个入口」，不报错。
 *
 * 三个模式**同时只挂一个**，不做「隐藏起来留着」。重做那条路上跑着一条 SSE，
 * 藏起来的话用户看不见它、账单却照记；卸载会按 `RedrawPagePanel` 里那条清理收掉它，
 * 这正是切走时该发生的。
 */
export function PageEditPanel({
  doc, pageType, onDone, onBack,
}: {
  doc: Pick<StyleDoc, 'styleId' | 'palette' | 'fontFamily' | 'fontDisplay' | 'fontScript' | 'fontNumeric' | 'theme' | 'spec' | 'pagePrompts'>;
  pageType: PageType;
  onDone: () => void;
  onBack: () => void;
}) {
  const [mode, setMode] = useState<'redraw' | 'elements' | 'layout'>('elements');
  /** 直接改这条路上有未保存改动。子面板上报，用来拦「切模式」 */
  const [elementDirty, setElementDirty] = useState(false);

  const page = doc.pagePrompts[pageType];
  const prompt = page?.prompt ?? '';
  const mockHtml = page?.mockHtml ?? '';

  /** 文字页借的是图文页的库，所以判据走 `libraryPageTypeOf`，与挑版式那边同一份映射 */
  const hasLayouts = moduleOfPageType(libraryPageTypeOf(pageType)) !== null;

  const switchMode = (next: 'redraw' | 'elements' | 'layout') => {
    if (next === mode) return;
    /*
      切模式会丢掉「直接改」里还没保存的改动，所以拦一道。不做两条路的状态合并：
      重做的结果是一整份新 HTML，直接改的是一组打在旧 HTML 上的补丁，合并起来没有意义。
      「换版式」那条没有本地状态（挑中的骨架点一下就直接落库），不必拦。
    */
    if (mode === 'elements' && elementDirty
      && !window.confirm('切过去会丢掉「直接改这一页」里还没保存的改动，确定要切吗？')) return;
    setMode(next);
  };

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 px-5 py-4">
        <Button pill size="sm" variant="ghost" icon="ChevronLeft" onClick={onBack}>
          返回风格详情
        </Button>
        <span className="text-[13px] text-[var(--text-2)]">改【{PAGE_TYPE_LABEL[pageType]}】</span>

        <div className="ml-auto flex items-center gap-1">
          {([
            ['elements', '直接改这一页', 'PenLine'],
            ...(hasLayouts ? [['layout', '换版式', 'LayoutGrid'] as const] : []),
            ['redraw', '传参考图重做', 'ImageUp'],
          ] as const).map(([key, label, icon]) => (
            <Button
              key={key}
              pill
              size="sm"
              variant={mode === key ? 'primary' : 'ghost'}
              icon={icon}
              onClick={() => switchMode(key)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {mode === 'redraw' ? (
        <>
          <p className="px-5 pb-1 text-[12px] leading-[1.7] text-[var(--text-3)]">
            配色与字体沿用这套风格，换的是版式与视觉语言。整页重新识别，提示词与样机一起换。
          </p>
          <RedrawPagePanel
            doc={doc}
            pageType={pageType}
            current={mockHtml}
            onDone={onDone}
          />
        </>
      ) : mode === 'layout' ? (
        <PageLayoutPanel
          styleId={doc.styleId}
          doc={doc}
          pageType={pageType}
          prompt={prompt}
          mockHtml={mockHtml}
          currentLayoutId={page?.layoutId ?? ''}
          onDone={onDone}
          onCancel={onBack}
        />
      ) : (
        <ElementEditPanel
          doc={doc}
          pageType={pageType}
          prompt={prompt}
          mockHtml={mockHtml}
          onDone={onDone}
          onCancel={onBack}
          onDirtyChange={setElementDirty}
        />
      )}
    </div>
  );
}
