import { useState } from 'react';
import { Button, Dialog, EmptyState, PageLoader } from '@lumen/ui';
import { STUDIO_MODULE_LABEL, type StudioLayout, type StyleDoc } from '@lumen/ir-schema';
import { LayoutCardGrid, usePageLayouts, type MockDoc } from '../components/LayoutGallery.js';

/**
 * 换排版：挑一份骨架，让当前这一页按它重排。
 *
 * ## 换的是排版，不是内容
 *
 * 选完会**重新生成这一页**（一次模型调用），把这一页的标题、要点、讲稿原样交给模型，
 * 只把版面结构换成挑的那一份。所以「内容保留」是提示词层面的事，见
 * `forcedLayoutBlock`——它明确交代骨架里的人名、数字、图注全是示例，一律换成本页内容。
 *
 * ## 只对人物页、图文页与图片排版页出现
 *
 * 其余九个页类型没有版式库（`moduleOfPageType` 回 null）。调用方按这个判断要不要
 * 给入口，这里再判一次是为了**类型上不出现 undefined**，不是第二道业务校验。
 *
 * ## 与风格库那个入口的分工
 *
 * 这条是「**就这一次**换成这份骨架」，改的是这一个项目里的这一页；风格库里那个
 * （`PageEditPanel` 的「换默认版式」）改的是**这套风格以后生成每一页**用什么骨架。
 * 两者共用取数与画卡片的部分（`usePageLayouts` / `LayoutCardGrid`），外壳各写各的。
 *
 * ## 自建骨架也在列表里
 *
 * 用户新建的骨架就是拿来用的，不列出来等于白建。它们与内置的走同一条渲染路径，
 * 只多一枚「自建」徽标——用户分得清哪些是自己建的，也就知道删了会怎样。
 */
export function LayoutPickerDialog({
  open, onOpenChange, pageType, doc, onPick, busy,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** 当前这一页的页类型。决定查哪个版式库、以及一份都查不到时说什么 */
  pageType: string;
  /** 渲染缩略样机用。**必须传**：不传图位是空的，看不出这份骨架长什么样 */
  doc: MockDoc | null | undefined;
  /** 挑定了。`layoutId` 交给调用方去触发重排 */
  onPick: (layout: StudioLayout) => void;
  /** 正在重排。重排期间不让再挑一份 */
  busy: boolean;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const { effectiveType, moduleId, layouts, groups, images, loading, toImageText } =
    usePageLayouts(pageType, doc, open, true);

  const chosen = layouts.find((l) => l.id === picked) ?? null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => { if (!v) setPicked(null); onOpenChange(v); }}
      title={toImageText ? '转成图文页' : '换排版'}
      description={moduleId
        ? (toImageText
          ? '挑一份图文骨架，这一页按它重排，页类型同时改成图文页。文字、要点、讲稿都不变，配图从图库取'
          : '挑一份骨架，这一页按它重排。文字、要点、讲稿都不变，只换版面结构')
        : `这一页的版面本来由风格提示词决定，没有专属的功能库。下面是全部 ${Object.keys(STUDIO_MODULE_LABEL).length} 个功能库的骨架，挑一份试试`}
      width={1100}
      /*
        按钮走 `footer`，**不放在 children 里**。
        children 是滚动体（`Dialog` 里那个 `overflow-y-auto`），几十份骨架一列，
        按钮就被推到列表末尾——得先滚到底才点得到，而它恰恰是每次都要点的那一下。
        `footer` 渲染在滚动区外面，一直在。
      */
      footer={(
        <>
          <Button pill variant="ghost" onClick={() => { setPicked(null); onOpenChange(false); }}>
            取消
          </Button>
          <Button
            pill
            variant="primary"
            loading={busy}
            disabled={!chosen || busy}
            onClick={() => { if (chosen) onPick(chosen); }}
          >
            {chosen
              ? (toImageText ? `按「${chosen.name}」转成图文页` : `按「${chosen.name}」重排这一页`)
              : '选一份骨架'}
          </Button>
        </>
      )}
    >
      <div className="flex flex-col gap-5">
        {loading ? (
          <div className="py-16">
            <PageLoader label={moduleId ? `正在加载${STUDIO_MODULE_LABEL[moduleId]}` : '正在加载功能库'} />
          </div>
        ) : layouts.length === 0 ? (
          <EmptyState
            icon="Blocks"
            title="一份骨架都没有"
            description={moduleId
              ? `${STUDIO_MODULE_LABEL[moduleId]}里还没有骨架。到「功能库」里识别或新建几份，这里就有了。`
              : '功能库里还没有骨架。到「功能库」里识别或新建几份，这里就有了。'}
          />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-[13px]">
              <span className="text-[var(--text-3)]">来自</span>
              <span className="font-medium text-[var(--text-1)]">
                {moduleId ? STUDIO_MODULE_LABEL[moduleId] : '全部功能库'}
              </span>
              <span className="text-[var(--text-3)]">
                · 共 {layouts.length} 份。重排会调一次模型，几十秒到一分钟
              </span>
            </div>

            <LayoutCardGrid
              doc={doc}
              layouts={layouts}
              groups={groups}
              images={images}
              effectiveType={effectiveType}
              picked={picked}
              onPick={setPicked}
            />
          </>
        )}
      </div>
    </Dialog>
  );
}
