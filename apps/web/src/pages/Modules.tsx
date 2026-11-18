import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge, Button, Card, CardBody, ConfirmDialog, EmptyState, Icon, IconButton, PageLoader,
  SegmentedControl, useToast,
} from '@lumen/ui';
import {
  DECORATION_BY_PAGE_TYPE, DEFAULT_AVATAR, DEFAULT_CHART_STYLE_ID, PAGE_TYPE_LABEL, PAGE_TYPE_ORDER,
  builtinLayoutsOf, layoutGroupsOf,
  type ChartStyleId,
  type PageIR, type PageType, type StudioLayout, type StudioModuleId,
  type StyleDoc, type StyleDocSummary,
} from '@lumen/ir-schema';
import { CHART_STYLES } from '@lumen/charts';
import { NEW_CHAIN_MOTION_WHITELIST } from '@lumen/motion';
import { CURSOR_SHAPE_BRIEF, CURSOR_SHAPE_LABEL, CURSOR_SHAPES, CursorGlyph } from '@lumen/slides';
import { api } from '../api/client.js';
import { showcaseStyleOf } from '../showcase-style.js';
import { ARCHITECTURE_LAYOUT_MODULE, CHART_LAYOUT_MODULE, IMAGE_LAYOUT_MODULE, PEOPLE_LAYOUT_MODULE, UI_LAYOUT_MODULE, type StudioModule } from '../studio-modules.js';
import { HtmlMock, useMockImages } from '../components/HtmlMock.js';
import { ModulePreviewDialog, type PreviewScene } from '../components/ModulePreviewDialog.js';
import { RecognizeLayoutDialog } from '../components/RecognizeLayoutDialog.js';
import { useStudioLayouts, useStyleDoc } from '../api/hooks.js';

/**
 * 功能库：数字人、光标、版式库、装饰件、动效这些**跨页类型复用**的零件。
 *
 * ## 为什么从「能力总览」里拆出来
 *
 * 两页回答的不是同一个问题。能力总览按一套风格看各页类型排出来什么样，摆的是
 * **成品**；这里摆的是**零件本身**，与风格无关——换一套风格只是让它们换一层配色。
 * 挤在一个页面的两个 tab 里时，「样张用哪套风格」和「样张用深色还是浅色」这两个
 * 选择器得按 tab 换位置，看的人要先想清楚自己在哪一档。拆开之后各自只有一件事。
 *
 * ## 为什么这里只留深浅模板开关
 *
 * 这些零件要回答的是「在深色模板和浅色模板下都立得住吗」，所以按 `theme` 各取一套
 * 代表风格来回切——切的是**样张本身**，界面明暗不受影响。风格库里有五套风格，
 * 挑哪一套不影响零件长什么样，所以不摆风格选择器（那是在挑设计语言，不是在验模块）。
 */

type AvatarMode = PageIR['avatar']['mode'];

/**
 * 内置骨架，**在模块加载时算一次**。
 *
 * 不写成每次渲染现算：`builtinLayoutsOf` 每次都回一个新数组，当 `useMemo`/`useMockImages`
 * 的依赖会让它们每帧重算，进而把样机的 iframe 反复重载。自建骨架还没拉回来时用的就是它。
 */
const BUILTIN_PEOPLE = builtinLayoutsOf('people-layouts');
const BUILTIN_IMAGE = builtinLayoutsOf('image-layouts');
const BUILTIN_CHART = builtinLayoutsOf('chart-layouts');
const BUILTIN_UI = builtinLayoutsOf('ui-layouts');
const BUILTIN_ARCHITECTURE = builtinLayoutsOf('architecture-layouts');

/**
 * 图表骨架的配图表：**空的**。
 *
 * 图表骨架里没有图位（`<img data-lumen-image>`），那一格是图表槽，由图表引擎出图。
 * 用模块级常量而不是每次现造一个 `{}`：`LayoutModuleCard` 把它传给 `HtmlMock`，
 * 而 `HtmlMock` 的 `srcDoc` 是 `useMemo` 的——每次渲染换一个新对象会把那个 memo 打穿。
 */
/**
 * 「这个库不占图位」用的空表。
 *
 * 图表骨架的内容是数据规格（由图表引擎按槽现画），架构骨架的内容是方块与连线
 * （每个块标了 `data-lumen-arch-node`），两者都没有 `<img>`，所以不预分配配图——
 * `HtmlMock` 自己会走「没有图位」那条路。
 */
const NO_IMAGES: Record<string, never[]> = {};

const AVATAR_STATES: { mode: AvatarMode; label: string; hint: string }[] = [
  { mode: 'pip', label: '左下角', hint: '画面左下角的圆形，直径与位置逐页可配' },
  { mode: 'fullscreen', label: '全屏', hint: '讲解人铺满整屏，页面让位' },
  { mode: 'float', label: '右下角浮框', hint: '右下角一块 16:9 的圆角矩形窗口，约占画面十二分之一，像视频通话的自画面' },
];

/**
 * 演示用的数字人配置。取左下角：页码徽标在**右上角**（`numbered-badge` 是
 * `right: marginPx, top:`），左下角不会跟它撞。
 */
function avatarFor(mode: AvatarMode): PageIR['avatar'] {
  return {
    ...DEFAULT_AVATAR,
    enabled: true,
    mode,
    /*
      浮框摆右下角——那是这个形态本身的意思；pip 留在左下角，避开右上角的页码徽标。
      这里不摆 `off`：关闭数字人是项目里逐页配的事，不是这个模块的一种能力。
    */
    position: mode === 'float' ? 'bottom-right' : 'bottom-left',
    offset: { x: 64, y: 64 },
  };
}

export function ModulesPage() {
  const navigate = useNavigate();
  const [mockTheme, setMockTheme] = useState<'light' | 'dark' | null>(null);
  /**
   * 图表那一节按哪套风格渲染。**只是预览开关，不落库**——
   * 项目里真正生效的那一份存在 `projects.chartStyle` 上，在工作台里切。
   * 默认值取 `DEFAULT_CHART_STYLE_ID`，与新建项目的默认一致。
   */
  const [chartStyle, setChartStyle] = useState<ChartStyleId>(DEFAULT_CHART_STYLE_ID);

  const list = useQuery({
    queryKey: ['style-docs', 'catalog'],
    queryFn: () => api.get<{ items: StyleDocSummary[] }>('/styles/docs?limit=100'),
  });
  const styles = list.data?.items ?? [];
  /**
   * 两种模板各取一套代表风格。功能库不列全部风格（那是在挑设计语言，不是在验模块），
   * 只按明暗各给一套，切换才有「对比」的意思。
   *
   * **深色那一档挑中性的是关键**：底色带色相会把每个模块都染成那个色，
   * 功能库展示的就不再是模块本身了。取哪一套的规则见 `showcaseStyleOf`。
   */
  const lightStyle = showcaseStyleOf(styles, 'light');
  const darkStyle = showcaseStyleOf(styles, 'dark');
  const shownTheme: 'light' | 'dark' = mockTheme ?? lightStyle?.theme ?? 'light';
  const activeId = (shownTheme === 'dark' ? darkStyle?.styleId : lightStyle?.styleId)
    ?? styles[0]?.styleId
    ?? '';
  const doc = useStyleDoc(activeId || null);

  /**
   * 两个版式库的骨架：**内置 + 自建，由服务端合成一份**（内置在前）。
   *
   * 查在这里而不是画廊里，是为了页头那枚「N 种版式骨架」的徽标也能算上自建的——
   * 用户刚新建了一份，抬头一看数字没变，会以为没存上。
   */
  const peopleQ = useStudioLayouts('people-layouts');
  const imageQ = useStudioLayouts('image-layouts');
  const chartQ = useStudioLayouts('chart-layouts');
  const uiQ = useStudioLayouts('ui-layouts');
  const architectureQ = useStudioLayouts('architecture-layouts');
  const peopleLayouts = peopleQ.data?.items ?? BUILTIN_PEOPLE;
  const imageLayouts = imageQ.data?.items ?? BUILTIN_IMAGE;
  const chartLayouts = chartQ.data?.items ?? BUILTIN_CHART;
  const uiLayouts = uiQ.data?.items ?? BUILTIN_UI;
  const architectureLayouts = architectureQ.data?.items ?? BUILTIN_ARCHITECTURE;

  /** 放大演示的那一张。null 就是没开 */
  const [scene, setScene] = useState<PreviewScene | null>(null);

  /**
   * 最近一次拿到的风格文档，用来在**切深浅的空窗期**里顶班。
   *
   * 换模板会换 `activeId`，于是 `useStyleDoc` 要重新拉一份；新文档到位之前
   * `doc.data` 是 undefined，下面那个 `{doc.data && <ModuleGallery/>}` 会把整个
   * 画廊连同它里面的东西一起卸掉。弹框恰好活在这段空窗里——切模板本来就是
   * 在弹框里点的——不留一份上一份的话，点一下「深色模板」弹框就自己关了。
   */
  const lastDoc = useRef<StyleDoc | null>(null);
  if (doc.data) lastDoc.current = doc.data;
  const previewDoc = doc.data ?? lastDoc.current;

  return (
    <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-8 py-8">
      {/*
        标题那一行**吸顶**：这一页很长（六个小节，几十张样机），滚到下面想换样张深浅时
        不必再滚回顶部。

        它必须是滚动容器的直接子元素才吸得住——`position: sticky` 的作用范围止于父容器，
        留在 `<header>` 里的话只能粘到 header 那几十像素高，等于没吸。所以这里把
        「标题 + 右侧控件」单独提成一行，说明文字留在下面随页面滚走（它读一次就够了）。

        **负边距与内边距成对出现，别只改一个**：`-mx-8 -mt-8` 抵消的是外层容器的
        `px-8 py-8`，让这一行顶到内容区的边、吸顶时不露出两侧与上方的滚动内容；
        而 `pt-8` 又把内容压回 32px——**不然标题会比项目库、风格库高出整整一档**。
        标题在静止时和吸顶时都在同一个位置，滚动不会跳。

        下面那条「跳到」的 `top` 是**这一行的高度**，改了 `pt`/`pb` 或字号要跟着改。
      */}
      <header className="sticky top-0 z-20 -mx-8 -mt-8 flex flex-wrap items-center justify-between gap-3 bg-[var(--shell-bg)] px-8 pt-8 pb-3">
        <h1 className="text-[24px] font-semibold tracking-tight text-[var(--text-1)]">功能库</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="brand">{peopleLayouts.length + imageLayouts.length + chartLayouts.length} 种版式骨架</Badge>
          {/*
            它管的是**样张**而不是界面主题——选项名里的「模板」已经说明了，
            再挂一句 title 给悬停的人。风格还没加载出来时不显示：那时候点了也不会有变化。
          */}
          {styles.length > 0 && (
            <span title="只换样张的深浅，不影响界面主题">
              <SegmentedControl
                size="sm"
                value={shownTheme}
                onChange={(v) => setMockTheme(v)}
                options={[
                  { value: 'light' as const, label: '浅色模板', icon: 'Sun' },
                  { value: 'dark' as const, label: '深色模板', icon: 'Moon' },
                ]}
              />
            </span>
          )}
          {/*
            图表风格：**只影响图表那一节的 20 张预览**，是给你逐套对比着看的。
            项目里真正生效的那一份存在项目行上、在工作台里切——
            这里是「挑之前先看看长什么样」，所以它不落库。
          */}
          <span title="只换图表的画法，用来逐套对比">
            <SegmentedControl
              size="sm"
              value={chartStyle}
              onChange={(v) => setChartStyle(v)}
              options={CHART_STYLES.map((s) => ({ value: s.id, label: s.name }))}
            />
          </span>
        </div>
      </header>

      {/*
        段落宽度跟风格库对齐（那边也是 `max-w-[640px]`）。两页的页头版式本来就是一回事，
        宽度不一样的话，并排看过去说明文字会一条长一条短。
      */}
      <p className="-mt-2 max-w-[640px] text-[13px] leading-[1.7] text-[var(--text-3)]">
        数字人、讲解光标、版式库、装饰件与入场动效——跨页类型复用的零件都在这里，
        全部由真实的生成链路现场渲染，不是截图。
      </p>

      {list.isLoading ? (
        <div className="py-20"><PageLoader label="正在加载风格库" /></div>
      ) : styles.length === 0 ? (
        <Card>
          <EmptyState
            icon="Palette"
            title="风格库还是空的"
            description="这里的一切都挂在一套具体风格上。先到「风格库」里识别一套，再回来看。"
          />
        </Card>
      ) : (
        <>
          {doc.isLoading && <div className="py-16"><PageLoader label="正在加载这套风格" /></div>}
          {doc.data && (
            <ModuleGallery
              doc={doc.data}
              peopleLayouts={peopleLayouts}
              imageLayouts={imageLayouts}
              chartLayouts={chartLayouts}
              uiLayouts={uiLayouts}
              architectureLayouts={architectureLayouts}
              chartStyle={chartStyle}
              onPreview={setScene}
              onOpenStyle={(t) => navigate(`/styles?style=${encodeURIComponent(activeId)}&page=${t}`)}
            />
          )}

          {/*
            弹框挂在**画廊外面**：换模板时新文档还没到，画廊会整段卸掉，
            挂里面的话点一下「深色模板」弹框就跟着没了。挂在页面这一层，
            再拿 `previewDoc` 顶住空窗期，它就活得下来。
          */}
          {previewDoc && (
            <ModulePreviewDialog
              open={scene !== null}
              onOpenChange={(v) => { if (!v) setScene(null); }}
              doc={previewDoc}
              scene={scene}
              theme={shownTheme}
              onThemeChange={(v) => setMockTheme(v)}
            />
          )}
        </>
      )}
    </div>
  );
}

/* ---------------- 各小节 ---------------- */

/**
 * 这一页里的小节，给顶部那条切换导航用。**顺序就是卡片的顺序**。
 *
 * 两个版式库小节的 id 与 `StudioModule.id` 一字不差——卡片是按那个 id 挂锚点的
 * （`<Card id={module.id}>`），同一个模块在两处都叫一个名字，点一下才滚得到。
 */
const MODULE_SECTIONS = [
  { id: 'avatar', label: '数字人三态' },
  { id: 'cursor', label: '讲解光标' },
  { id: 'people-layouts', label: '人物排版' },
  { id: 'image-layouts', label: '图文排版' },
  { id: 'chart-layouts', label: '图表排版' },
  { id: 'ui-layouts', label: '界面排版' },
  { id: 'architecture-layouts', label: '架构排版' },
  { id: 'decoration', label: '页类型装饰件' },
  { id: 'motion', label: '入场动效' },
];

/**
 * 版式库模块的卡片标题：名字 + 一句话 + 两个动作。
 *
 * 两个模块共用。抽出来是因为**按钮跳哪去、点了开什么**这件事只该写一遍——
 * 以后加版式库（图表页、数字页…）直接复用，不会各写各的。
 */
function ModuleCardHeader({
  module, onOpenStyle, onRecognize,
}: {
  module: StudioModule;
  onOpenStyle: (t: PageType) => void;
  /**
   * 不给就不显示「识别并新建」。
   *
   * **界面排版正是这样**：另外三个库的骨架是「版面的样子」，从参考图抽象得出来；
   * 界面骨架里嵌着**我们自己的设备渲染图**和屏幕的 `matrix3d`，都是算出来的，
   * 识别器照参考图写一份不会是我们的那一台（服务端那边也是显式抛错的）。
   */
  onRecognize?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="text-[15px] font-semibold text-[var(--text-1)]">{module.name}</h2>
        <p className="text-[13px] leading-[1.6] text-[var(--text-3)]">{module.brief}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" icon="Palette" onClick={() => onOpenStyle(module.pageType)}>
          看「{PAGE_TYPE_LABEL[module.pageType]}」的样机
        </Button>
        {/*
          「识别并新建」长在卡片上而不是页头：先选分类再识别，是用户的口径。
          分类由点哪张卡决定，比在下拉框里再选一次可靠——选错库要删掉重来。
        */}
        {onRecognize && (
          <Button size="sm" variant="primary" icon="ScanSearch" onClick={onRecognize}>
            识别并新建
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * 一个版式库的整张卡：按分组把骨架摆出来。
 *
 * **内置与自建走同一条渲染路径**，只靠 `source` 分出「自建」徽标与动作按钮。
 * 各写一份的话，两边迟早长歪（一边能放大、一边不能），而那种不一致没人会去修。
 *
 * ## 下架的内置版式不进网格，收在分组下面一条可折叠的里
 *
 * 下架是「别再被自动挑中」，不是「从库里消失」——所以仍要能看见、能恢复，
 * 但不能和还在用的混在一格里：混着摆的话，用户根本看不出自己下架过什么。
 */
function LayoutModuleCard({
  module, layouts, images, doc, chartStyle, onPreview, onDelete, onHide, onUnhide, onRecognize, onOpenStyle,
}: {
  module: StudioModule;
  /** 内置 + 自建，已由服务端合成 */
  layouts: StudioLayout[];
  images: Record<string, ReturnType<typeof useMockImages>[number]>;
  doc: StyleDoc;
  /**
   * 图表视觉风格。**只有图表库传**，人物/图文排版传 undefined——
   * 这张卡是三个库共用的，传一个恒定的值给另两个只会白换一份 `renderChart`。
   */
  chartStyle?: ChartStyleId;
  onPreview: (s: PreviewScene) => void;
  /** 删一份自建骨架 */
  onDelete: (l: StudioLayout) => void;
  /** 下架一份内置骨架 */
  onHide: (l: StudioLayout) => void;
  /** 把下架的内置骨架放回来 */
  onUnhide: (l: StudioLayout) => void;
  onRecognize?: () => void;
  onOpenStyle: (t: PageType) => void;
}) {
  const groups = layoutGroupsOf(module.id);
  return (
    <Card id={module.id}>
      <CardBody className="flex flex-col gap-4">
        <ModuleCardHeader module={module} onOpenStyle={onOpenStyle} onRecognize={onRecognize} />
        {groups.map((g) => {
          const items = layouts.filter((l) => l.group === g.key && !l.hidden);
          const hidden = layouts.filter((l) => l.group === g.key && l.hidden);
          // 自建骨架可能落在一个内置没有条目的分组里，这时分组标题仍要出现——
          // 不然用户新建的那份会凭空消失，直到他想起去别的分组里找
          if (items.length === 0 && hidden.length === 0) return null;
          return (
            <div key={g.key} className="flex flex-col gap-3">
              <span className="text-[12px] font-medium text-[var(--text-3)]">
                {g.label}（{items.length}）
              </span>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                {items.map((l) => (
                  <div key={l.id} className="flex flex-col gap-2">
                    <PreviewableMock
                      label={l.name}
                      onOpen={() => onPreview({
                        key: `${module.id}:${l.id}`,
                        title: `${module.name} · ${l.name}`,
                        brief: l.brief,
                        html: l.skeleton,
                        images: images[l.id],
                        pageType: module.pageType,
                        pageNo: 1,
                        seed: layouts.indexOf(l),
                        // 弹框要跟卡片同款——不带的话放大之后图表风格会跳回去
                        chartStyle,
                      })}
                    >
                      <HtmlMock
                        doc={doc}
                        html={l.skeleton}
                        width={400}
                        images={images[l.id]}
                        pageType={module.pageType}
                        pageNo={1}
                        frame={false}
                        chartStyle={chartStyle}
                      />
                    </PreviewableMock>
                    <div className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--text-1)]">
                        {l.name}
                        {l.source === 'user' && (
                          <>
                            <Badge tone="brand">自建</Badge>
                            <IconButton
                              name="Trash2"
                              label={`删除自建版式「${l.name}」`}
                              size={16}
                              className="ml-auto"
                              onClick={() => onDelete(l)}
                            />
                          </>
                        )}
                        {l.source === 'builtin' && (
                          <IconButton
                            name="EyeOff"
                            label={`下架版式「${l.name}」，之后不再自动挑中它`}
                            size={16}
                            className="ml-auto"
                            onClick={() => onHide(l)}
                          />
                        )}
                      </span>
                      <span className="text-[12px] leading-[1.6] text-[var(--text-3)]">{l.brief}</span>
                    </div>
                  </div>
                ))}
              </div>
              {hidden.length > 0 && <HiddenLayouts items={hidden} onUnhide={onUnhide} />}
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}

/**
 * 一组里已下架的那几份。**默认收起**。
 *
 * 收起而不是直接摊开：下架是「我不用它了」，用户平时不需要看见它们；
 * 但也不能不显示——不然下架就成了单向操作，想反悔时无从下手。
 */
function HiddenLayouts({
  items, onUnhide,
}: {
  items: StudioLayout[];
  onUnhide: (l: StudioLayout) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-fit items-center gap-1.5 text-[12px] text-[var(--text-3)] hover:text-[var(--text-1)]"
      >
        <Icon name={open ? 'ChevronDown' : 'ChevronRight'} size={16} />
        已下架（{items.length}）
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 rounded-[var(--radius-control)] border border-[var(--border-subtle)] p-2">
          {items.map((l) => (
            <div key={l.id} className="flex items-center gap-2 px-1">
              <span className="text-[12px] text-[var(--text-2)]">{l.name}</span>
              <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-3)]">{l.brief}</span>
              <IconButton
                name="RotateCcw"
                label={`恢复版式「${l.name}」`}
                size={16}
                onClick={() => onUnhide(l)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * 一张可点击放大的样机。
 *
 * **iframe 会吞掉点击**——`document.elementFromPoint` 在样机上返回的是 `IFRAME`，
 * 而点击不跨 iframe 边界，直接给外层挂 `onClick` 永远不触发。所以渲染归渲染，
 * 另盖一层透明按钮接点击。与 `ProjectCover.tsx` 的封面卡片同一个路数。
 *
 * 外框的描边跟着悬停换成强调色：样机内容里的悬停反馈在列表上看不到（同一层按钮挡住了），
 * 至少让卡片自己给出「可以点」的暗示。
 */
function PreviewableMock({ label, onOpen, children }: {
  label: string;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)] transition-colors duration-150 ease-out hover:border-[var(--accent)]">
      {children}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`放大演示：${label}`}
        className="absolute inset-0 cursor-zoom-in"
      />
    </div>
  );
}

function ModuleGallery({
  doc, peopleLayouts, imageLayouts, chartLayouts, uiLayouts, architectureLayouts, chartStyle, onPreview, onOpenStyle,
}: {
  doc: StyleDoc;
  /** 内置 + 自建，已由服务端合成一份（内置在前） */
  peopleLayouts: StudioLayout[];
  imageLayouts: StudioLayout[];
  chartLayouts: StudioLayout[];
  uiLayouts: StudioLayout[];
  architectureLayouts: StudioLayout[];
  /** 图表那一节按哪套风格渲染。**只有图表库吃它**，另两个库与它无关 */
  chartStyle: ChartStyleId;
  /** 点开某一张样机的放大演示。**状态由页面那一层持有**——见 `lastDoc` 那段注释 */
  onPreview: (s: PreviewScene) => void;
  onOpenStyle: (pageType: PageType) => void;
}) {
  // 数字人与光标要叠在一页真内容上才看得出效果。挑一页有的：优先数字页，
  // 它画面最满，头像压上去挡不挡字一眼就能判断
  const demo = useMemo(() => {
    const order: PageType[] = ['metrics', 'text', 'imageText', 'cover'];
    for (const t of order) {
      const html = doc.pagePrompts[t]?.mockHtml ?? '';
      if (html.trim()) return { pageType: t, html };
    }
    const first = PAGE_TYPE_ORDER.find((t) => (doc.pagePrompts[t]?.mockHtml ?? '').trim());
    return first ? { pageType: first, html: doc.pagePrompts[first]!.mockHtml } : null;
  }, [doc]);

  const demoImages = useMockImages(doc, demo ? [demo.html] : [], demo ? [demo.pageType] : []);

  /*
    两个版式库各整组分配一次配图。
    **必须整组一起分**：一套风格里所有骨架共用同一套配色，而按色板挑图是确定性的、
    对同一套配色总是从同一张开始给——各挑各的会让几十张样机撞成同一张画面。
    `useMockImages` 是 hook，**不能在 .map 里调**——所以先一次拿到二维数组，再按 id 拆开。

    自建骨架接在内置后面，所以内置那批的分配不会因为新建了一份就整体错位。
  */
  const peopleFragments = useMemo(() => peopleLayouts.map((l) => l.skeleton), [peopleLayouts]);
  const peopleFlat = useMockImages(doc, peopleFragments, peopleLayouts.map(() => 'people' as const));
  const peopleImages = useMemo(
    () => Object.fromEntries(peopleLayouts.map((l, i) => [l.id, peopleFlat[i] ?? []])),
    [peopleLayouts, peopleFlat],
  );

  const imageFragments = useMemo(() => imageLayouts.map((l) => l.skeleton), [imageLayouts]);
  const imageFlat = useMockImages(doc, imageFragments, imageLayouts.map(() => 'gallery' as const));
  const imageImages = useMemo(
    () => Object.fromEntries(imageLayouts.map((l, i) => [l.id, imageFlat[i] ?? []])),
    [imageLayouts, imageFlat],
  );

  /*
    界面骨架的图位只有一个（设备屏幕），仍要走整组分配：
    同一套配色下各份骨架拿到的图才不会撞。
  */
  const uiFragments = useMemo(() => uiLayouts.map((l) => l.skeleton), [uiLayouts]);
  const uiFlat = useMockImages(doc, uiFragments, uiLayouts.map(() => 'ui' as const));
  const uiImages = useMemo(
    () => Object.fromEntries(uiLayouts.map((l, i) => [l.id, uiFlat[i] ?? []])),
    [uiLayouts, uiFlat],
  );

  /* ---- 新建与删除 ---- */

  /** 正在识别的是哪个版式库。null 就是没开 */
  const [recognizing, setRecognizing] = useState<StudioModuleId | null>(null);
  /** 待确认删除的自建骨架 */
  const [deleting, setDeleting] = useState<StudioLayout | null>(null);
  const qc = useQueryClient();
  const toast = useToast();

  const remove = useMutation({
    mutationFn: (layoutId: string) => api.del(`/studio/layouts/${encodeURIComponent(layoutId)}`),
    onSuccess: () => {
      // 两个库都刷一遍：id 里已经写了是哪个库，但多刷一次只是多一个缓存失效，不值得再判一遍
      void qc.invalidateQueries({ queryKey: ['studio-layouts'] });
      toast.success('已删除', '这份自建版式不会再出现在换排版里');
    },
    onError: (err: Error) => toast.error('删除失败', err.message),
  });

  /*
    下架与恢复。**都是可逆的，所以不弹确认框**——下架只影响「以后自动挑不挑它」，
    已经生成过的页面照旧渲染，想反悔点一下就回来。删除自建那份才要确认，那个真没了。
  */
  const hide = useMutation({
    mutationFn: (layoutId: string) => api.post(`/studio/layouts/${encodeURIComponent(layoutId)}/hide`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['studio-layouts'] });
      toast.success('已下架', '以后不再自动挑中它；已生成的页面不受影响');
    },
    onError: (err: Error) => toast.error('下架失败', err.message),
  });

  const unhide = useMutation({
    mutationFn: (layoutId: string) => api.del(`/studio/layouts/${encodeURIComponent(layoutId)}/hide`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['studio-layouts'] });
      toast.success('已恢复', '它会重新进自动挑版式的候选池');
    },
    onError: (err: Error) => toast.error('恢复失败', err.message),
  });

  if (!demo) {
    return (
      <Card>
        <EmptyState icon="Blocks" title="这套风格还没有样机" description="先到风格库里给页类型生成样机，这里才有可叠的内容。" />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/*
        六个小节堆在一页里，滚到下面就不知道上面还有什么了。这条**粘在滚动容器顶部**
        （AppShell 的 <main> 是那个容器），点一下滚到对应小节。

        `top` 让开上面那条吸顶的标题行：两条都是 sticky，不错开的话后画的会盖住先画的。
        **77px 是那条标题行实测的高度**（`pt-8` + 内容 + `pb-3`），改了它的内边距要跟着改。
      */}
      <nav className="sticky top-[77px] z-10 flex flex-wrap items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--border-subtle)] bg-[var(--surface-0)] px-2 py-1.5">
        <span className="px-1.5 text-[12px] text-[var(--text-3)]">跳到</span>
        {MODULE_SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="rounded-full px-2.5 py-1 text-[12px] text-[var(--text-2)] transition-colors duration-150 ease-out hover:bg-[var(--surface-1)] hover:text-[var(--text-1)]"
          >
            {s.label}
          </button>
        ))}
      </nav>

      <Card id="avatar">
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[15px] font-semibold text-[var(--text-1)]">数字人三态</h2>
            <p className="text-[13px] leading-[1.6] text-[var(--text-3)]">
              逐页可配，演示中还能临时切换且不回写页面设置。这里用同一页内容渲染三种模式。
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {AVATAR_STATES.map((s, i) => (
              <div key={s.mode} className="flex flex-col gap-2">
                <PreviewableMock
                  label={s.label}
                  onOpen={() => onPreview({
                    key: `avatar:${s.mode}`,
                    title: `数字人 · ${s.label}`,
                    brief: s.hint,
                    html: demo.html,
                    images: demoImages[0],
                    pageType: demo.pageType,
                    pageNo: 1,
                    avatar: avatarFor(s.mode),
                    seed: i,
                  })}
                >
                  <HtmlMock
                    doc={doc}
                    html={demo.html}
                    width={400}
                    images={demoImages[0]}
                    pageType={demo.pageType}
                    pageNo={1}
                    avatar={avatarFor(s.mode)}
                  />
                </PreviewableMock>
                <div className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-2 text-[13px] font-medium text-[var(--text-1)]">
                    {s.label}
                    <span className="font-[var(--font-mono)] text-[11px] text-[var(--text-3)]">{s.mode}</span>
                  </span>
                  <span className="text-[12px] text-[var(--text-3)]">{s.hint}</span>
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card id="cursor">
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[15px] font-semibold text-[var(--text-1)]">讲解光标</h2>
            <p className="text-[13px] leading-[1.6] text-[var(--text-3)]">
              由讲稿分段的锚点驱动，段间缓动、段内呼吸，不遮挡文字。颜色取当前风格的强调色，
              所以换一套风格它跟着换。
              <br />
              三种形状在这里按放大的尺寸摆出来——整页缩到样机那么小时，实际大小的光标只剩几个
              像素，形状根本看不出来。实际用的是哪一种写在 `NEW_CHAIN_CURSOR.shape`。
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {CURSOR_SHAPES.map((s) => (
              <div key={s} className="flex flex-col gap-2">
                <div
                  className="flex items-center justify-center rounded-[var(--radius-control)] border border-[var(--border)]"
                  style={{ height: 152, background: doc.palette.bg }}
                >
                  <CursorGlyph shape={s} size={84} color={doc.palette.accent} />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-medium text-[var(--text-1)]">{CURSOR_SHAPE_LABEL[s]}</span>
                  <span className="text-[12px] text-[var(--text-3)]">{CURSOR_SHAPE_BRIEF[s]}</span>
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <LayoutModuleCard
        module={PEOPLE_LAYOUT_MODULE}
        layouts={peopleLayouts}
        images={peopleImages}
        doc={doc}
        onPreview={onPreview}
        onDelete={setDeleting}
        onHide={(l) => hide.mutate(l.id)}
        onUnhide={(l) => unhide.mutate(l.id)}
        onRecognize={() => setRecognizing('people-layouts')}
        onOpenStyle={onOpenStyle}
      />

      <LayoutModuleCard
        module={IMAGE_LAYOUT_MODULE}
        layouts={imageLayouts}
        images={imageImages}
        doc={doc}
        onPreview={onPreview}
        onDelete={setDeleting}
        onHide={(l) => hide.mutate(l.id)}
        onUnhide={(l) => unhide.mutate(l.id)}
        onRecognize={() => setRecognizing('image-layouts')}
        onOpenStyle={onOpenStyle}
      />

      {/*
        图表骨架不带图位，图由图表引擎按骨架里的槽现画（`HtmlMock` 内部接的），
        所以这一张**不需要预分配配图**——传空表，`HtmlMock` 自己会走「没有图位」那条路。
      */}
      <LayoutModuleCard
        module={CHART_LAYOUT_MODULE}
        layouts={chartLayouts}
        images={NO_IMAGES}
        doc={doc}
        chartStyle={chartStyle}
        onPreview={onPreview}
        onDelete={setDeleting}
        onHide={(l) => hide.mutate(l.id)}
        onUnhide={(l) => unhide.mutate(l.id)}
        onRecognize={() => setRecognizing('chart-layouts')}
        onOpenStyle={onOpenStyle}
      />

      {/*
        界面排版**不传 `onRecognize`**：它的骨架由设备渲染生成，不是从参考图抽象出来的。
        传了会在服务端抛错，而按钮摆在那儿只会让人白点一次。
      */}
      <LayoutModuleCard
        module={UI_LAYOUT_MODULE}
        layouts={uiLayouts}
        images={uiImages}
        doc={doc}
        onPreview={onPreview}
        onDelete={setDeleting}
        onHide={(l) => hide.mutate(l.id)}
        onUnhide={(l) => unhide.mutate(l.id)}
        onOpenStyle={onOpenStyle}
      />

      <LayoutModuleCard
        module={ARCHITECTURE_LAYOUT_MODULE}
        layouts={architectureLayouts}
        images={NO_IMAGES}
        doc={doc}
        onPreview={onPreview}
        onDelete={setDeleting}
        onHide={(l) => hide.mutate(l.id)}
        onUnhide={(l) => unhide.mutate(l.id)}
        onRecognize={() => setRecognizing('architecture-layouts')}
        onOpenStyle={onOpenStyle}
      />

      <Card id="decoration">
        <CardBody className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-[15px] font-semibold text-[var(--text-1)]">页类型装饰件</h2>
            <p className="text-[13px] leading-[1.6] text-[var(--text-3)]">
              装饰件叠在页面之上，用来让同一套配色下的不同页类型拉开差别。图形页与图片排版页不叠——
              它们自己已经够满，再加一层是添乱。
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {PAGE_TYPE_ORDER.map((t) => (
              <div key={t} className="flex items-center gap-2 rounded-[var(--radius-control)] border border-[var(--border)] px-3 py-2">
                <span className="text-[12px] text-[var(--text-2)]">{PAGE_TYPE_LABEL[t]}</span>
                <span className="ml-auto font-[var(--font-mono)] text-[11px] text-[var(--text-3)]">
                  {DECORATION_BY_PAGE_TYPE[t]}
                </span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card id="motion">
        <CardBody className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-[15px] font-semibold text-[var(--text-1)]">入场动效</h2>
            <p className="text-[13px] leading-[1.6] text-[var(--text-3)]">
              默认是元素逐块进场（按阅读序一块块进来，方向按页序号轮换）；也可以整页一起进。
              导出时一律降级为静态，避免投影时出现卡顿。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {NEW_CHAIN_MOTION_WHITELIST.map((m) => (
              <span
                key={m}
                className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 font-[var(--font-mono)] text-[12px] text-[var(--text-2)]"
              >
                <Icon name="Sparkles" size={16} className="text-[var(--text-3)]" />
                {m}
              </span>
            ))}
          </div>
        </CardBody>
      </Card>

      {/*
        识别弹窗。**挂在画廊里**（不是页面那一层）：它认出来的是「哪个版式库的骨架」，
        这件事只在这里知道。切深浅模板会换 `doc`，但弹窗靠 `doc` 只是为了预览配图，
        而切模板本身只有页头那一个入口——不会在弹窗开着的时候点到。
      */}
      {recognizing && (
        <RecognizeLayoutDialog
          open
          onOpenChange={(v) => { if (!v) setRecognizing(null); }}
          moduleId={recognizing}
          doc={doc}
          onSaved={() => { void qc.invalidateQueries({ queryKey: ['studio-layouts'] }); }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(v) => { if (!v) setDeleting(null); }}
        title="删掉这份自建版式？"
        description={deleting
          ? `「${deleting.name}」会从功能库里消失，已经用它排过的页面不受影响。删掉之后这份骨架就找不回来了。`
          : ''}
        confirmText="删除"
        danger
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
          setDeleting(null);
        }}
      />
    </div>
  );
}
