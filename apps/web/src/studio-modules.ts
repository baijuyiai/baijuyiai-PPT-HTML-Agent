import { type PageType, type StudioModuleId } from '@lumen/ir-schema';

/**
 * 「功能库」页里那两个版式库，与它们各自服务的页类型。
 *
 * **名字与页类型的对应只写这一处**：卡片标题、以及「看某页类型的样机」按钮
 * 该指向哪一页，都从这里取。以后加版式库（图表页、数字页…）只改这张表。
 *
 * `id` 就是 `StudioModuleId`——它同时是库的标识（`studio_layouts.moduleId`）、
 * 卡片的锚点、以及工作台「换排版」时按页类型反查的那个键。三处用同一个值，
 * 所以类型上直接绑死，别在这里放宽成 string。
 */
export interface StudioModule {
  /** 锚点与 React key 用，形如 `people-layouts` */
  id: StudioModuleId;
  /** 界面上的名字。与功能库页里的卡片标题一字不差，导航条上按它显示 */
  name: string;
  /** 这个模块服务的页类型。**一个模块只服务一个**，多对一会让「看样机」指向不明 */
  pageType: PageType;
  /**
   * 卡片上那句话。
   *
   * **不写死份数**：自建骨架一加，份数就变了，而这段话是写死的字符串，
   * 改起来没人会记得。份数由卡片自己按实际列表数出来。
   */
  brief: string;
}

const PEOPLE_LAYOUT_MODULE: StudioModule = {
  id: 'people-layouts',
  name: '人物排版',
  pageType: 'people',
  brief: '人物页的版式，按人数分两组（单人 / 多人）。生成人物页时会按这一页的内容筛出一组候选，由模型挑一个照着排。下面这些是骨架本身——颜色全部走这套风格的 CSS 变量，所以换风格它们跟着变。',
};

const IMAGE_LAYOUT_MODULE: StudioModule = {
  id: 'image-layouts',
  name: '图文排版',
  pageType: 'gallery',
  brief: '图片排版页的版式，按图位张数分两组（图文排版 / 多图排版）。生成时会先估这一页要几张图，再从对上的那一组里筛出一组候选。下面这些是骨架本身——颜色全部走这套风格的 CSS 变量，所以换风格它们跟着变。',
};

const CHART_LAYOUT_MODULE: StudioModule = {
  id: 'chart-layouts',
  name: '图表排版',
  pageType: 'chart',
  brief: '图表页的版式，按图表类型分五组（比较 / 分布 / 趋势 / 构成 / 流程），一种图一份。骨架里除了版面还带一个「图表槽」——写明画哪种图、数据什么形状，出图交给图表引擎。生成时按教案里写的那种图筛候选。',
};

const UI_LAYOUT_MODULE: StudioModule = {
  id: 'ui-layouts',
  name: '界面排版',
  pageType: 'ui',
  brief: '界面页的版式，按设备分三组（手机 / 笔记本 / 显示器）。骨架里摆的是 three.js 在构建期渲出来的设备——屏幕是一张可替换的图，鼠标滑上去设备会转一点。生成时按教案里写的那台设备筛候选。',
};

const ARCHITECTURE_LAYOUT_MODULE: StudioModule = {
  id: 'architecture-layouts',
  name: '架构排版',
  pageType: 'architecture',
  brief: '架构图 / 逻辑框架图的版式，按结构分五组（分层架构 / 模块矩阵 / 中心辐射 / 流程链路 / 框架底座），平面与等距立体都在里面。生成时按教案里写的结构筛候选。骨架里标了 data-lumen-arch-node 的块就是会被换成本页真实内容的位置——颜色全部走这套风格的 CSS 变量，所以换风格它们跟着变。',
};

/** 具名导出这几个，功能库页的卡片直接引用，不用按下标去数组里捞 */
export { ARCHITECTURE_LAYOUT_MODULE, CHART_LAYOUT_MODULE, IMAGE_LAYOUT_MODULE, PEOPLE_LAYOUT_MODULE, UI_LAYOUT_MODULE };

/** 全部版式库模块，按功能库页里的出场顺序 */
export const STUDIO_MODULES: StudioModule[] = [
  PEOPLE_LAYOUT_MODULE,
  IMAGE_LAYOUT_MODULE,
  CHART_LAYOUT_MODULE,
  UI_LAYOUT_MODULE,
  ARCHITECTURE_LAYOUT_MODULE,
];

/**
 * 某个版式库服务的主页类型。
 *
 * 「换排版」弹窗与「识别并新建」弹窗都要按模块挑一个页类型去配图 / 预览，
 * 而它们以前各自写了一句 `moduleId === 'people-layouts' ? 'people' : 'gallery'`——
 * 加图表库时两处都要改，漏一处就是「图表骨架按图片排版页去配图」。
 * 收成一处，取值直接来自 `StudioModule.pageType`。
 */
export function pageTypeOfModule(id: StudioModuleId): PageType | null {
  return STUDIO_MODULES.find((m) => m.id === id)?.pageType ?? null;
}

/**
 * 版式库认的页类型：**文字页借图文页的库**，其余页类型原样返回。
 *
 * 文字页自己没有版式库（它的版面由风格提示词决定），但「把一页纯文字排成图文页」
 * 是个常见诉求。工作台把它做成一步：挑一份图文骨架 → 顺带把页类型改成图文页 →
 * 重排（见 `RightRail` 的 `onPick`）。
 *
 * **两处必须用同一份**：入口按它决定要不要显示「转成图文页」，弹窗按它查库、
 * 按它筛图位区间。各写一句 `pageType === 'text'` 的话，将来再加一种转换
 * （比如数字页借图表库）就会漂——与上面 `pageTypeOfModule` 是同一条理由。
 */
export function libraryPageTypeOf(pageType: string): string {
  return pageType === 'text' ? 'imageText' : pageType;
}
