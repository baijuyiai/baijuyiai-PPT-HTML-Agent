import { useMemo } from 'react';
import {
  buildPageDocument, fontStacksOf, imageOverridesOf,
  type BrandSlot, type ImageOverrides, type StockImage, type PageType,
} from '@lumen/ir-schema';
import { allocateStockImages, stockImagesFor, stockPaletteOf } from '@lumen/stock-library';
import { makeChartRenderer } from '@lumen/charts';
import { NewChainAvatar, NewChainCursor, NewChainDecoration } from '@lumen/slides';
import { cn } from '@lumen/ui';
import type { PageIR, StyleDoc } from '../api/types.js';

/**
 * 样机：把模型产出的 HTML 片段渲染出来。
 *
 * 用 iframe 而不是 `dangerouslySetInnerHTML`：片段的 `<style>` 是**全局**的，
 * 直接塞进主文档里，`.slide{…}` 这种选择器会漏到整个应用上，把界面样式搞坏。
 * iframe 自带样式隔离，片段怎么写都影响不到外面。
 *
 * `sandbox` 开 `allow-same-origin` 但**不开 `allow-scripts`**：
 * 不开脚本是因为识别产出的 HTML 已经过 `lintMockHtml` 禁掉了 `<script>`，
 * 这里是第二道防线；开同源是为了让图片位能正常加载。两者组合是安全的——
 * 能读自己的资源，但执行不了任何代码。
 *
 * **这条边界不要为了动效去动**：开了 `allow-scripts`，模型产出的内容就能在应用
 * 同源上下文里执行代码。逐个进入因此只能用「注入 CSS + 标容器」的办法做，
 * 见 `markStaggerItems`。
 */

export function HtmlMock({
  doc, html, width, images, pageType, pageNo = 0, frame = true, staggerSeed = null,
  avatar = null, cursor = null, brand, overrides, hover = false, reveal = false,
  chartStyle, frameRef, overlay, className = '',
}: {
  /**
   * 渲染这一页要用的风格。
   *
   * **`spec` 必须带上**：视觉规范里存着四个字体角色的选择（`spec.fonts`），
   * `fontStacksOf` 会拿它盖过风格原有的字体栈。漏了它，用户在风格库里切了字体、
   * 画布纹丝不动——而这正是那一栏存在的意义。
   */
  doc: Pick<StyleDoc, 'palette' | 'fontFamily' | 'fontDisplay' | 'fontScript' | 'fontNumeric' | 'theme' | 'spec'>;
  html: string;
  /**
   * 图表视觉风格（`@lumen/charts` 的 `CHART_STYLE_IDS`）。不传就用默认那一套。
   *
   * **传 id 字符串，不传预设对象**：它要进下面 `srcDoc` 的 `useMemo` 依赖，
   * 字符串是稳定的；传对象就得靠调用方保证引用不变，而调用方多半是现造的。
   */
  chartStyle?: string;
  /** 显示宽度。高度按 16:9 推出来，画布比例是固定的 */
  width: number;
  /**
   * 这一张该用哪几张图。**一组样机摆在一起时必须传**（配 `useMockImages` 用），
   * 不传就自己按色板挑——那种挑法对同一套配色总是从同一张开始给，
   * 一组里几张样机会撞成同一张画面。
   */
  images?: StockImage[];
  /**
   * 页类型。给了就在页面上叠一层装饰件（`DECORATION_BY_PAGE_TYPE`）。
   * 不传就不叠——新旧对比、九宫格缩略图那些地方不需要。
   */
  pageType?: PageType;
  /**
   * 页码。装饰件里的编号徽标要用它。**未知就传 0**，那时徽标不画——
   * 画出来是「00」，比没有更难看，也容易让人以为那是个真的页码。
   */
  pageNo?: number;
  /** 外框（描边 + 圆角 + 白底）。演示态要铺满整屏，那边传 false */
  frame?: boolean;
  /**
   * 元素逐块进场的种子。传页码（或页下标）就逐块进场、并按它轮换进场方向；
   * 不传或传 null 就不逐块。由调用方按 `resolveMotion` 解析后传入。
   */
  staggerSeed?: number | null;
  /**
   * 这一页的数字人设置。给了就按它叠一层头像——**页面上开着数字人时编辑器里也得看得见**，
   * 否则「数字人」那一栏的开关在画布上没有反馈，用户只能靠猜。
   */
  avatar?: PageIR['avatar'] | null;
  /**
   * 讲解光标的位置（画布比例 0~1）。演示态由讲稿分段的锚点驱动；
   * 编辑器里不传——光标是播讲时才有的东西，编辑时停在那里反而挡字。
   */
  cursor?: { x: number; y: number; visible: boolean } | null;
  /**
   * 项目品牌。只有工作台画布与演示态会传——风格库样机、项目缩略图那些没有项目，
   * 不传就是「没有品牌」，行为不变。
   *
   * 传的是 `brandOf(project)` 的返回值，**不要**用 `hasBrand` 去筛：前者永远返回一个
   * `BrandSlot`，五列全空时 `fillBrandSlots` 才会把没有值的槽位元素整条删掉
   * （「清空品牌」后页眉上的空壳要消失）；传 `undefined` 则那一步整个不执行。
   */
  brand?: BrandSlot;
  /**
   * 用户在右栏图位面板上做过的调整（换图 / 删图）。
   *
   * 传的是 `imageOverridesOf(page.overrides)` 的结果，**不要直接传 `page.overrides`**：
   * 那个字段是 `z.record(z.unknown())`，里面躺着别的功能写的键，渲染层只认挑出来的那一份。
   */
  overrides?: ImageOverrides;
  /**
   * 图位的鼠标悬停反馈（抬起、放大、投影）。
   *
   * **只在「看样机」的场合开**：功能库的放大演示、风格库预览。工作台画布里
   * 用户正在图位上拖拽，图跟着鼠标抬起来只会碍事；演示态没人悬停；导出是截图。
   * 默认关，所以这三处不传就与改动前逐字一致。
   */
  hover?: boolean;
  /**
   * iframe 的引用。工作台的图位拖拽要读 `contentDocument` 量每个图位的几何
   * （`sandbox="allow-same-origin"`，父文档读得到）。
   */
  frameRef?: React.Ref<HTMLIFrameElement>;
  /**
   * 叠在 iframe 之上的东西，与装饰件同一个 1920×1080 坐标系。
   *
   * 与装饰件分开一个口子：装饰件是「这套风格在这一页上长什么样」，由 `pageType` 决定；
   * 这一层是**编辑器的手柄**，演示态与导出都不该有。混在一起会让导出也长出拖拽框。
   */
  overlay?: React.ReactNode;
  /**
   * 「正在生成」的揭示态：元素标好阅读序但先藏起来，由外层逐个点亮。
   *
   * 与 `staggerSeed` 互斥（两者都是「元素逐个出现」，同时开就是两套动画抢同一批元素），
   * 传了 `reveal` 就以它为准。见 `buildPageDocument` 的同名选项。
   */
  reveal?: boolean;
  className?: string;
}) {
  const srcDoc = useMemo(() => {
    // 图片位是模型留的空位（只写 data-lumen-image，不写 src），渲染时才配图。
    // 不配的话浏览器显示的是破图图标，比没有图更难看
    const filled = images ?? stockImagesFor(html, stockPaletteOf(doc.palette, doc.theme === 'dark'), pageType);
    return buildPageDocument(html, {
      palette: doc.palette, ...fontStacksOf(doc), images: filled, staggerSeed,
      /*
        图表槽由 `@lumen/charts` 出图。**色板从 `doc.palette` 派生，不是从 tokens**——
        新链路的 StyleDoc 只有解析后的 7 色，而 `doc.palette` 已经是深色模式那一份，
        拿 tokens 会在深色底上画出深色文字。

        `chartStyle` 传 **id 字符串**而不是预设对象：这个 useMemo 的依赖里要放它，
        字符串是稳定的；传对象的话调用方每次渲染现造一个，memo 被打穿、iframe 反复重载。
      */
      renderChart: makeChartRenderer({ palette: doc.palette, ...(chartStyle ? { style: chartStyle } : {}) }),
      ...(reveal ? { reveal } : {}),
      ...(brand ? { brand } : {}),
      ...(overrides ? { overrides } : {}),
      ...(hover ? { hover } : {}),
    });
    // `doc.spec` 进依赖：规范里的字体选择盖过上面那几套栈，不进的话切了字体画布不重画。
    // 依赖整个 spec 对象而不是 spec.fonts——它来自 react-query 的缓存，引用稳定。
    // `doc.fontNumeric` 也要进：它是识别从参考图里读出来的数字字体，没有 spec 时
    // 全靠它，不进依赖就是「换了风格数字还按上一套排」
  }, [doc.palette, doc.fontFamily, doc.fontDisplay, doc.fontScript, doc.fontNumeric, doc.spec, doc.theme, html, images, staggerSeed, reveal, brand, overrides, hover, chartStyle]);

  const height = Math.round(width * (1080 / 1920));

  if (html.trim().length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-[var(--radius-inner)] border border-dashed border-[var(--border)] text-[12px] text-[var(--text-3)] ${className}`}
        style={{ width, height }}
      >
        样机未生成
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative overflow-hidden',
        // 外框的颜色跟着主题走：深色模式下深色描边，浅色模式下浅色描边
        frame && 'rounded-[var(--radius-inner)] border border-[var(--border)]',
        className,
      )}
      // 底色用这一页自己的底色，不用白色：iframe 每次换 srcdoc 都要重载，
      // 重载那一瞬间露出来的就是这层底色——白底配深色风格会闪一下刺眼的白
      style={{ width, height, background: doc.palette.bg }}
    >
      {/* 画布永远是 1920×1080，靠这一层缩放适配容器——与导出走的是同一条路子。
          装饰件与 iframe 在同一个坐标系里，所以它也得放进这层里面 */}
      <div
        style={{
          position: 'relative',
          width: 1920,
          height: 1080,
          transform: `scale(${width / 1920})`,
          transformOrigin: 'top left',
        }}
      >
        <iframe
          ref={frameRef}
          title="风格样机"
          srcDoc={srcDoc}
          sandbox="allow-same-origin"
          scrolling="no"
          style={{ display: 'block', width: 1920, height: 1080, border: 0 }}
        />
        {overlay}
        {(pageType || avatar || cursor) && (
          // 装饰、数字人、光标都叠在 iframe 之上，与页面内容同一个 1920×1080 坐标系。
          // pointer-events 关掉，否则它们会挡住下面页面的交互
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
            {pageType && (
              <NewChainDecoration
                pageType={pageType}
                palette={doc.palette}
                isDark={doc.theme === 'dark'}
                fontFamily={doc.fontFamily}
                pageNo={pageNo}
              />
            )}
            {avatar && <NewChainAvatar avatar={avatar} />}
            <NewChainCursor enabled={Boolean(cursor)} cursor={cursor} brand={doc.palette.brand} />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * 「把这一页渲染出来」需要的输入，一次算好。
 *
 * ## 为什么要有这个 hook
 *
 * **工作台画布与项目库封面渲染的是同一页，必须传同一组输入。** 这两处原先各拼各的，
 * 结果漂了：封面没传 `overrides`（用户换过的图不显示）也没传 `avatar`（数字人不叠），
 * 于是卡片上那张和工作台里那张根本是两页内容，而且**永远不会对上**。
 * 把这份清单收成一处，以后加渲染输入只改这里，不会再出现「只改了一边」。
 *
 * ## 返回的引用必须是稳的
 *
 * `HtmlMock` 里 `srcDoc` 那个 `useMemo` 的依赖里有 `overrides` 与 `brand`。
 * 每次渲染都返回新对象的话，那个 memo 会被打穿，`srcdoc` 一变 iframe 就整个重载——
 * 表现是画面不停闪。所以这里两层都 memo。
 *
 * 画布独有的东西**不进这里**：`cursor`（播讲时才有）、`staggerSeed`（编辑态逐块进场）、
 * `frameRef` / `overlay`（编辑器手柄）都是它自己加的。
 */
export function usePageMockInputs(
  page: {
    html?: string;
    pageType?: PageType;
    footer?: { pageNo?: number };
    avatar?: PageIR['avatar'];
    overrides?: unknown;
  } | null | undefined,
  brand?: BrandSlot,
) {
  const overrides = useMemo(() => imageOverridesOf(page?.overrides), [page?.overrides]);
  const html = page?.html ?? '';
  const pageType = page?.pageType;
  const pageNo = page?.footer?.pageNo ?? 0;
  const avatar = page?.avatar ?? null;
  return useMemo(
    () => ({ html, pageType, pageNo, avatar, overrides, ...(brand ? { brand } : {}) }),
    [html, pageType, pageNo, avatar, overrides, brand],
  );
}

/**
 * 一组样机共用的配图分配。
 *
 * 一套风格里九个页类型共用同一套配色，而按色板挑图是确定性的、对同一套配色总是
 * 从同一张开始给——于是几个单图位的页会拿到同一张画面，并排看过去像是同一页贴了三遍。
 * **分配必须放在整组层面做**：单张层面不知道前面已经用掉了几张。
 *
 * 依赖用片段拼成的字符串，而不是数组本身：数组每次渲染都是新的，直接当依赖会让
 * `images` 每帧换一个引用，进而把 `HtmlMock` 里的 `useMemo` 打穿、iframe 反复重载。
 */
export function useMockImages(
  doc: Pick<StyleDoc, 'palette' | 'fontFamily' | 'fontDisplay' | 'fontScript' | 'theme'> | null | undefined,
  fragments: string[],
  /**
   * 每段片段各自在哪一页类型上。**抠图位靠它决定取人像池还是物件池**——
   * 不传的话一律按非人物页处理（走物件池）。
   */
  pageTypes: (PageType | undefined)[] = [],
): StockImage[][] {
  const fingerprint = fragments.join('\u0000');
  const typeKey = pageTypes.join('\u0000');
  return useMemo(
    // doc 还没拉回来时也得照常调用——hook 不能有条件分支，所以这里收 null 而不是让调用方去判
    () => (doc ? allocateStockImages(fragments, stockPaletteOf(doc.palette, doc.theme === 'dark'), pageTypes) : []),
    // fingerprint 就是 fragments 的内容指纹；pageTypes 同样按内容做指纹
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fingerprint, typeKey, doc?.palette, doc?.theme],
  );
}
