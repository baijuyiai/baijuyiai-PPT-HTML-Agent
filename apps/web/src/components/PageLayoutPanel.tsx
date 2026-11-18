import { useState } from 'react';
import { PAGE_TYPE_LABEL, type PageType } from '@lumen/ir-schema';
import { Button, EmptyState, PageLoader, useToast } from '@lumen/ui';
import { api } from '../api/client.js';
import { LayoutCardGrid, usePageLayouts, type MockDoc } from './LayoutGallery.js';

/**
 * 「编辑这一页」的第三条路：**换这一页的默认版式**。
 *
 * ## 与另外两条路的区别
 *
 * | 模式 | 换什么 | 影响范围 |
 * | --- | --- | --- |
 * | 直接改 | 样机上几个元素的位置与文字 | 只有样机 |
 * | 传参考图重做 | 整页重识别，提示词与样机一起换 | 这一页以后怎么生成 |
 * | **换版式** | 样机换成这份骨架，并把这一页**绑定**到它 | 这一页以后怎么生成 |
 *
 * 后两条的差别在**代价**：重做要调一次模型（几十秒到几分钟），换版式是**现成的骨架**，
 * 点一下就落库。所以「这一页的版面不对、但内容对」时该走这条——不用等模型重画一遍。
 *
 * ## 绑的是 id，不是把骨架抄进提示词
 *
 * 抄进提示词的话，生成时那条自动候选块还会照常拼上来，两段互相打架（一段说「就这一种」、
 * 一段说「下面是几个候选，挑一个」）。所以库里只存 `layoutId`，生成时由
 * `boundLayoutOf` 现查骨架、走 `forcedLayoutBlock`——**只给这一种，不给候选**。
 *
 * ## 解绑要留着
 *
 * 绑上之后若没有回头路，用户就只能靠「传参考图重做」把它冲掉，而那要花一次模型调用。
 * 所以当前有绑定时多给一个「改回自动挑」。
 */
export function PageLayoutPanel({
  styleId, doc, pageType, prompt, mockHtml, currentLayoutId, onDone, onCancel,
}: {
  styleId: string;
  doc: MockDoc;
  pageType: PageType;
  /** 这一页现在的提示词。保存时原样回传——服务端那条 PUT 要求它非空 */
  prompt: string;
  /** 这一页现在的样机。**解绑时要原样传回去**——解绑只松开版式，不该顺手把样机也清掉 */
  mockHtml: string;
  /** 这一页现在绑的骨架 id。空串 = 没绑 */
  currentLayoutId: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [picked, setPicked] = useState<string | null>(currentLayoutId || null);
  const [saving, setSaving] = useState(false);
  const { effectiveType, moduleId, layouts, groups, images, loading, toImageText } =
    usePageLayouts(pageType, doc, true);

  const chosen = layouts.find((l) => l.id === picked) ?? null;
  const bound = currentLayoutId
    ? layouts.find((l) => l.id === currentLayoutId) ?? null
    : null;
  /** 挑中的就是现在绑的那一份、也没打算解绑——没什么可存的 */
  const unchanged = picked === (currentLayoutId || null);

  /**
   * 落库。`layoutId` 传**空串表示解绑**，不传表示不动——这里两种情况都要能表达，
   * 所以不能省掉这个字段（见 `ReplaceInput.layoutId`）。
   */
  async function save(layoutId: string, mockHtml: string) {
    setSaving(true);
    try {
      const r = await api.put<{ issues: { pageType: string; message: string }[] }>(
        `/styles/docs/${encodeURIComponent(styleId)}/pages/${pageType}`,
        { prompt, mockHtml, layoutId },
      );
      toast.success(
        layoutId ? '已换默认版式' : '已改回自动挑版式',
        layoutId ? PAGE_TYPE_LABEL[pageType] : undefined,
      );
      // 与另外两条路同一个口径：问题不阻断保存，但必须如实说
      if (r.issues.length > 0) {
        toast.info('存了，不过这一页的样机有几个问题', r.issues.map((i) => i.message).join('；'));
      }
      onDone();
    } catch (err) {
      toast.error('保存失败', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (prompt.trim().length === 0) {
    return (
      <div className="px-5 py-6">
        <EmptyState
          icon="Blocks"
          title={`这套风格还没写过「${PAGE_TYPE_LABEL[pageType]}」的提示词`}
          description="先用「传参考图重做」或「补齐缺失页类型」把它补上，再来换版式。"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      <div className="flex flex-col gap-1">
        <p className="text-[12px] leading-[1.7] text-[var(--text-3)]">
          挑一份骨架，这一页的样机换成它，同时<span className="text-[var(--text-1)]">绑定</span>到它——
          以后重新生成这一页时不再由模型自己挑版式，就按这一份排。文字、要点、讲稿都不变。
        </p>
        <p className="text-[12px] leading-[1.7] text-[var(--text-3)]">
          {bound
            ? <>现在绑的是<span className="text-[var(--text-1)]">「{bound.name}」</span>。</>
            : '现在没绑版式，生成时按这一页的内容自动挑候选。'}
        </p>
      </div>

      {!moduleId ? (
        <EmptyState
          icon="Blocks"
          title="这个页类型没有版式库"
          description="只有人物页、图文页、图片排版页、图表页、界面页与架构页有版式骨架可挑。其余页类型的版面由风格提示词决定。"
        />
      ) : loading ? (
        <div className="py-16"><PageLoader label="正在加载版式库" /></div>
      ) : (
        <LayoutCardGrid
          doc={doc}
          layouts={layouts}
          groups={groups}
          images={images}
          effectiveType={effectiveType}
          picked={picked}
          onPick={setPicked}
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          pill
          variant="primary"
          loading={saving}
          disabled={!chosen || unchanged}
          onClick={() => { if (chosen) void save(chosen.id, chosen.skeleton); }}
        >
          {chosen ? `用「${chosen.name}」` : '选一份骨架'}
        </Button>
        {currentLayoutId && (
          <Button
            pill
            variant="ghost"
            loading={saving}
            onClick={() => void save('', mockHtml)}
          >
            改回自动挑
          </Button>
        )}
        <Button pill variant="ghost" disabled={saving} onClick={onCancel}>取消</Button>
        <span className="text-[12px] text-[var(--text-3)]">
          {toImageText
            ? '图文页借的是图片排版页的库，挑完这一页的版面按图片排版页的样子排。'
            : '存下来之后这一页会标成「手改」，「一键统一风格」不再改它。'}
        </span>
      </div>
    </div>
  );
}
