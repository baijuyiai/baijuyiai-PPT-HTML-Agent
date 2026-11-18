import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import {
  STUDIO_MODULE_LABEL, layoutGroupsOf, layoutsForPageType, moduleOfPageType,
  type StockImage, type StudioLayout, type StudioModuleId, type StyleDoc,
} from '@lumen/ir-schema';
import { Badge, cn } from '@lumen/ui';
import { studioLayoutsQuery } from '../api/hooks.js';
import { libraryPageTypeOf, pageTypeOfModule } from '../studio-modules.js';
import { HtmlMock, useMockImages } from './HtmlMock.js';

/**
 * 「挑一份骨架」这件事的公共部分：**查哪个库、能挑哪些、卡片怎么画**。
 *
 * ## 为什么抽出来
 *
 * 两处要做同一件事，只是外壳不同：
 * - 工作台的「换排版」——挑完立刻重排这一页（`LayoutPickerDialog`）；
 * - 风格库的「换默认版式」——挑完把这一页的样机与绑定一起换掉（`PageEditPanel`）。
 *
 * 各写一遍的代价不是那几十行，而是**筛选口径会漂**：`layoutsForPageType` 那条
 * 「图文页只给一到两张图的骨架」的规则漏抄一处，图文页就会挑到十二个图位的骨架，
 * 而界面上看不出来哪里错了——只是排出来跟内容打架。
 *
 * ## 为什么不是一个完整的组件
 *
 * 两边的外壳差得远：一个是弹框（确认按钮得待在滚动区外面），一个是抽屉里的一个模式
 * （确认按钮跟着面板走）。硬合成一个组件就得把「按钮放哪」做成参数，那比分开写还绕。
 * 所以这里只给**两样**：取数的 hook 与画卡片的组件，各自的壳各写各的。
 */

/** 渲染骨架只要这几样。收窄之后风格库里那份 `Pick<StyleDoc, …>` 也能直接传进来 */
export type MockDoc = Pick<
  StyleDoc, 'palette' | 'fontFamily' | 'fontDisplay' | 'fontScript' | 'fontNumeric' | 'theme' | 'spec'
>;

/** 全部版式库。「全部」模式按这个顺序铺（与功能库页的出场顺序一致） */
const ALL_MODULES: StudioModuleId[] = [
  'people-layouts', 'image-layouts', 'chart-layouts', 'ui-layouts', 'architecture-layouts',
];

/** 分组键带上库名。四个库的分组名各起各的，直接拼在一起会撞 key，撞了就两组抢卡片 */
const groupKeyOf = (moduleId: StudioModuleId, group: string): string => `${moduleId}::${group}`;

/** 一份骨架，外加它来自哪个库——「全部」模式下缩略图要按来源库选配图池 */
export type DecoratedLayout = StudioLayout & { fromModule: StudioModuleId };

/**
 * 这个页类型能挑的骨架，连同渲染它们要用的配图。
 *
 * `enabled` 为 false 时不发请求——两个调用方都只在用户真进了挑版式的那一屏才需要它，
 * 而风格库的编辑面板一进去默认是「直接改这一页」，那时拉几十份骨架是白拉的。
 *
 * `fallbackToAll` 是**工作台那一个入口独有的**：这一页的类型没有专属版式库时
 * （封面、目录、文字页、结尾页…），把四个库整个端出来让它挑。
 *
 * 为什么只给工作台开着，风格库那边的「换默认版式」不给：那边定的是「**这套风格以后
 * 生成每一页**用哪份骨架」，把一个封面页的类型绑到人物排版的骨架上，捆的是整份风格的
 * 默认值，之后每一页都按那个来——而用户当时不过是想给某一页换个样子。
 * 工作台这条是「就这一次」，挑错了再挑一次就行。
 */
export function usePageLayouts(
  pageType: string,
  doc: MockDoc | null | undefined,
  enabled: boolean,
  fallbackToAll = false,
) {
  /**
   * 文字页没有版式库，但「把一页纯文字排成图文页」是个常见诉求，所以它**按图文页的口径走**：
   * 查同一个库、按同一个图位区间筛。映射收在 `libraryPageTypeOf` 一处，工作台入口用的是同一份。
   */
  const effectiveType = libraryPageTypeOf(pageType);
  const moduleId: StudioModuleId | null = moduleOfPageType(effectiveType);
  /** 没有专属库、调用方又允许退——那就列四个库的全部 */
  const allModules = moduleId === null && fallbackToAll;

  const wanted: StudioModuleId[] = !enabled
    ? []
    : moduleId !== null ? [moduleId] : allModules ? ALL_MODULES : [];
  const queries = useQueries({ queries: wanted.map(studioLayoutsQuery) });
  /**
   * 数据变了要重算下面那份 `decorated`。
   *
   * 依赖用「各查询最后一次更新的时刻」拼出来的串，**不能直接把 `queries` 塞进依赖**：
   * 它每次渲染都是新数组，memo 会等于没做；也不能依赖 `queries[i].data`，那样依赖数组的
   * 长度会跟着要几个库变，React 会直接报「依赖数组长度在渲染间不一致」。
   */
  const dataKey = queries.map((q) => q.dataUpdatedAt).join(',');

  const decorated = useMemo(() => {
    /** 专属库：只这一个，且按页类型的图位区间收窄（图文页只给一到两张图的骨架） */
    if (moduleId !== null) {
      const picked = enabled
        ? layoutsForPageType(moduleId, effectiveType, queries[0]?.data?.items ?? [])
        : [];
      return {
        layouts: picked.map((l): DecoratedLayout => ({ ...l, fromModule: moduleId })),
        groups: layoutGroupsOf(moduleId),
      };
    }
    if (!allModules) return { layouts: [] as DecoratedLayout[], groups: [] as { key: string; label: string }[] };
    /*
      **全部模式不收窄。** `layoutsForPageType` 那条「图文页只给一到两张图的骨架」的规则
      是拿页类型去问的，而这一页压根没有对应库，没有「该用哪条区间」这回事——
      整个库端出来，让用户自己看着挑。分组标题带上库名，他才知道这一份是从哪来的。
    */
    const layouts: DecoratedLayout[] = [];
    const groups: { key: string; label: string }[] = [];
    ALL_MODULES.forEach((m, i) => {
      for (const g of layoutGroupsOf(m)) {
        groups.push({ key: groupKeyOf(m, g.key), label: `${STUDIO_MODULE_LABEL[m]} · ${g.label}` });
      }
      for (const l of queries[i]?.data?.items ?? []) {
        layouts.push({ ...l, fromModule: m, group: groupKeyOf(m, l.group) });
      }
    });
    return { layouts, groups };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `queries` 由上面的 `dataKey` 代表
  }, [dataKey, enabled, moduleId, allModules, effectiveType]);

  /*
    整组一次分配配图。**不能在 .map 里调 useMockImages**——它是 hook。
    自建骨架接在内置后面，所以内置那批的分配不会因为多了一份就整体错位。
  */
  const fragments = useMemo(() => decorated.layouts.map((l) => l.skeleton), [decorated]);
  // 配图池跟着骨架的来源库走（人像 / 物件）。「全部」模式下每份各按自己的库取
  const pageTypes = useMemo(
    () => decorated.layouts.map((l) => pageTypeOfModule(l.fromModule) ?? 'gallery'),
    [decorated],
  );
  const flat = useMockImages(doc, fragments, pageTypes);
  const images = useMemo(
    () => Object.fromEntries(decorated.layouts.map((l, i) => [l.id, flat[i] ?? []])),
    [decorated, flat],
  );

  return {
    effectiveType,
    moduleId,
    allModules,
    layouts: decorated.layouts,
    groups: decorated.groups,
    images,
    loading: queries.some((q) => q.isLoading),
    /** 文字页借的是图文页的库，挑完要顺带把页类型也改过去 */
    toImageText: effectiveType !== pageType,
  };
}

/**
 * 骨架卡片墙，按分组铺开。选中态由调用方拿着（`picked` / `onPick`），
 * 因为两边的「确认」时机不同：弹框要等用户再点一下按钮，风格库那边也一样。
 */
export function LayoutCardGrid({
  doc, layouts, groups, images, effectiveType, picked, onPick,
  cardWidth = 400,
  gridClassName,
}: {
  doc: MockDoc | null | undefined;
  layouts: StudioLayout[];
  groups: { key: string; label: string }[];
  images: Record<string, StockImage[]>;
  /** 缩略图按哪个页类型渲染（决定配图池与装饰件）。文字页传的是 `imageText` */
  effectiveType: string;
  picked: string | null;
  onPick: (id: string | null) => void;
  /**
   * 缩略样机渲染多宽。弹窗里 400（那儿容器宽，三列铺开看得清）；
   * 工作台左栏那种三百来像素的窄容器给 250 左右，否则卡片横着溢出。
   */
  cardWidth?: number;
  /**
   * 栅格列数的类。不传就用弹窗那套响应式的；**窄栏里必须传 `grid-cols-1`**——
   * 响应式那套按**视口**分列，窗口一宽就铺三列，而容器其实只有三百像素，
   * 每列被压扁、内容照样溢出。
   */
  gridClassName?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => {
        const items = layouts.filter((l) => l.group === g.key);
        if (items.length === 0) return null;
        return (
          <div key={g.key} className="flex flex-col gap-3">
            <span className="text-[12px] font-medium text-[var(--text-3)]">
              {g.label}（{items.length}）
            </span>
            <div className={cn('grid gap-4', gridClassName ?? 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3')}>
              {items.map((l) => {
                const on = l.id === picked;
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => onPick(on ? null : l.id)}
                    aria-pressed={on}
                    className="flex flex-col gap-2 rounded-[var(--radius-control)] p-1 text-left transition-colors duration-150 ease-out"
                    style={on ? { outline: '2px solid var(--brand-500)', outlineOffset: 2 } : undefined}
                  >
                    <div className="pointer-events-none overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)]">
                      <HtmlMock
                        doc={doc ?? EMPTY_DOC}
                        html={l.skeleton}
                        width={cardWidth}
                        images={images[l.id]}
                        pageType={effectiveType as never}
                        pageNo={1}
                        frame={false}
                      />
                    </div>
                    <span className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-1)]">
                      {l.name}
                      {l.source === 'user' && <Badge tone="brand">自建</Badge>}
                    </span>
                    <span className="text-[12px] leading-[1.6] text-[var(--text-3)]">{l.brief}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * 风格还没拉回来时的兜底。
 *
 * 骨架只用 CSS 变量取色，所以任何一套色板都渲得出来；这里给一套中性灰，
 * 只为在「风格文档还在路上」那一瞬不让 iframe 崩掉——不是一套设计。
 */
export const EMPTY_DOC: MockDoc = {
  palette: {
    bg: '#FFFFFF', surface: '#F5F5F5', text: '#1A1A1A', muted: '#6B6B6B',
    accent: '#2B6CB0', brand: '#2B6CB0', border: '#E2E2E2',
  },
  fontFamily: 'sans-serif',
  fontDisplay: 'serif',
  fontScript: 'cursive',
  // 空串 = 跟展示字体一套，与 `StyleDoc` 的默认值同一个意思
  fontNumeric: '',
  // 还没提炼过规范：字体走上面那几套栈，与真页一致
  spec: null,
  theme: 'light',
};
