import { z } from 'zod';
import { imageSlotNumbers } from './html-doc.js';
import { isHiddenLayout } from './hidden-layouts.js';
import { ARCHITECTURE_GROUP_ORDER, ARCHITECTURE_LAYOUTS, architectureGroupLabel } from './architecture-layouts.js';
import { CHART_GROUP_ORDER, chartGroupLabel } from './chart-kind.js';
import { CHART_LAYOUTS } from './chart-layouts.js';
import { CHART_SLOT_RE, parseChartSlot } from './chart-slot.js';
import { PEOPLE_GROUP_ORDER, PEOPLE_LAYOUTS, peopleGroupLabel } from './people-layouts.js';
import { IMAGE_GROUP_ORDER, IMAGE_LAYOUTS, IMAGE_SLOT_RANGE, imageGroupLabel } from './image-layouts.js';
import { UI_DEVICE_KEEP, UI_GROUP_ORDER, UI_LAYOUTS, uiGroupLabel } from './ui-layouts.js';

/**
 * 两个版式库的**共用形状**。
 *
 * ## 为什么要有这一层
 *
 * 人物排版与图文排版的骨架本来各写各的（`PeopleLayout` / `ImageLayout`），字段几乎一样，
 * 只在「图文排版多一个 `slots`」这一处分叉。功能库页与工作台的「换排版」都要同时处理两者，
 * 各写一份分支的话，以后加第三个版式库（图表页、数字页…）就得改两处 UI。
 * 这里把它们收成同一个 `StudioLayout`，UI 只认这一种。
 *
 * **注意「图文排版」这个名字被用在两处**：它既是版式库的名字，也是库内第一组
 * （`feature`，一个图位）的名字。第二组是「多图排版」（`multi`）。这是用户定的口径——
 * 那个库本来就只有图片，整库叫「图文排版」比叫「多图排版」更贴切，而库内再按张数分两组。
 *
 * ## 内置与自建的区别只体现在 `source`
 *
 * 内置的写死在 `ir-schema` 里（数组常量），自建的躺在 `studio_layouts` 表里。
 * 两者的**形状完全一样**，所以列表可以直接拼起来渲染、也可以一起喂给「换排版」。
 * 但**只有内置的进生成时的候选池**——自建的是用户手动套上去的，不参与自动挑版式。
 */

export const StudioModuleId = z.enum(['people-layouts', 'image-layouts', 'chart-layouts', 'ui-layouts', 'architecture-layouts']);
export type StudioModuleId = z.infer<typeof StudioModuleId>;

export const STUDIO_MODULE_LABEL: Record<StudioModuleId, string> = {
  'people-layouts': '人物排版',
  'image-layouts': '图文排版',
  'chart-layouts': '图表排版',
  'ui-layouts': '界面排版',
  'architecture-layouts': '架构排版',
};

/**
 * 每个版式库服务哪些页类型。工作台按当前页类型决定要不要给「换排版」的入口。
 *
 * **图文排版那个库服务两个页类型，不是一个**：
 * - `imageText`（图文页）—— 一到两张图、以文字为主
 * - `gallery`（图片排版页）—— 多张图成组铺开、以图为主
 *
 * 这两条以前只接了 `gallery`，于是**项目里绝大多数「图文页」都拿不到换排版的入口**——
 * 大纲生成时模型写的是 `imageText`，而库挂在 `gallery` 上，两者对不上，
 * 界面上只是「按钮没出现」，看不出是配置漏了一条。
 */
export const STUDIO_MODULE_PAGE_TYPE: Record<StudioModuleId, string[]> = {
  'people-layouts': ['people'],
  'image-layouts': ['imageText', 'gallery'],
  'chart-layouts': ['chart'],
  'ui-layouts': ['ui'],
  'architecture-layouts': ['architecture'],
};

/** 反过来：页类型 → 它对应的版式库。没有版式库的页类型回 null */
export function moduleOfPageType(pageType: string): StudioModuleId | null {
  for (const [moduleId, types] of Object.entries(STUDIO_MODULE_PAGE_TYPE)) {
    if (types.includes(pageType)) return moduleId as StudioModuleId;
  }
  return null;
}

/**
 * 这个页类型能挑哪几份骨架。
 *
 * **只在「换排版」的弹窗里用**。生成时按内容筛候选走的是 `imageLayoutCandidates`，
 * 它按同一张 `IMAGE_SLOT_RANGE` 收窄兜底的那一组；用户手动指定的那一份也不过滤
 * ——他都挑好了，再去拦只会让点了没反应。
 */
export function layoutsForPageType<T extends { slots?: number }>(
  moduleId: StudioModuleId,
  pageType: string,
  layouts: T[],
): T[] {
  if (moduleId !== 'image-layouts') return layouts;
  const range = IMAGE_SLOT_RANGE[pageType];
  if (!range) return layouts;
  return layouts.filter((l) => {
    const n = l.slots ?? 0;
    return n >= range.min && n <= range.max;
  });
}

export interface StudioLayoutGroup {
  key: string;
  label: string;
}

export interface StudioLayout {
  /** 形如 `people/row-hex-team@v1`（内置）或 `people/custom-xxx@v1`（自建） */
  id: string;
  name: string;
  brief: string;
  /** 落在该模块的哪个分组里。取值见 `layoutGroupsOf` */
  group: string;
  /** 图位数。**只有图文排版有**——人物排版决定版式的量是人数，不是图位数 */
  slots?: number;
  skeleton: string;
  source: 'builtin' | 'user';
  /**
   * 已下架。**只有内置的会为 true**——自建的是直接删，没有「下架」这个状态。
   *
   * 下架 = 不进生成时的候选池（见 `hidden-layouts.ts`），功能库仍要把它列出来供恢复，
   * 所以这里带一个标志而不是从列表里滤掉。
   */
  hidden?: boolean;
}

/**
 * 该模块的分组顺序与中文名。界面按这个顺序把骨架分组摆出来。
 *
 * **每个分支都要显式写。** 末尾那条 `return` 落给图文排版，新加一个模块忘了写分支的话，
 * 它的分组会被当成「图文排版」的（而不是报错），症状是功能库里那个库的分节名全错。
 */
export function layoutGroupsOf(moduleId: StudioModuleId): StudioLayoutGroup[] {
  if (moduleId === 'people-layouts') {
    return PEOPLE_GROUP_ORDER.map((g) => ({ key: g as string, label: peopleGroupLabel(g) }));
  }
  if (moduleId === 'chart-layouts') {
    return CHART_GROUP_ORDER.map((g) => ({ key: g as string, label: chartGroupLabel(g) }));
  }
  if (moduleId === 'ui-layouts') {
    return UI_GROUP_ORDER.map((g) => ({ key: g as string, label: uiGroupLabel(g) }));
  }
  if (moduleId === 'architecture-layouts') {
    return ARCHITECTURE_GROUP_ORDER.map((g) => ({ key: g as string, label: architectureGroupLabel(g) }));
  }
  return IMAGE_GROUP_ORDER.map((g) => ({ key: g as string, label: imageGroupLabel(g) }));
}

export function isValidLayoutGroup(moduleId: StudioModuleId, group: string): boolean {
  return layoutGroupsOf(moduleId).some((g) => g.key === group);
}

/**
 * 内置骨架，转成与自建同一形状。**生成时的候选池只取这一份**。
 *
 * `hidden` 现算（`isHiddenLayout` 读的是模块级名单，服务启动时灌过），所以这个函数
 * 仍然是纯的——同一个进程里名单变了，下次调用拿到的就是新值。
 *
 * **与 `layoutGroupsOf` 同一条：末尾那条 `return` 落给图文排版**，新模块忘了写分支会被
 * 当成图文排版列出来（功能库里那个库下面摆着图片版式，而没有任何报错）。
 */
export function builtinLayoutsOf(moduleId: StudioModuleId): StudioLayout[] {
  if (moduleId === 'people-layouts') {
    return PEOPLE_LAYOUTS.map((l) => ({
      id: l.id, name: l.name, brief: l.brief, group: l.group as string,
      skeleton: l.skeleton, source: 'builtin' as const, hidden: isHiddenLayout(l.id),
    }));
  }
  if (moduleId === 'chart-layouts') {
    // 图表骨架没有 `slots`——决定版式的量是「画哪种图」，那个信息在 `ChartLayout.kind` 上，
    // 而候选筛选走 `chartLayoutCandidates`，不走 `slots`
    return CHART_LAYOUTS.map((l) => ({
      id: l.id, name: l.name, brief: l.brief, group: l.group as string,
      skeleton: l.skeleton, source: 'builtin' as const, hidden: isHiddenLayout(l.id),
    }));
  }
  if (moduleId === 'ui-layouts') {
    // 界面骨架没有 `slots`——它的图位只有一个（设备屏幕），而决定版式的量是「用哪台设备」
    return UI_LAYOUTS.map((l) => ({
      id: l.id, name: l.name, brief: l.brief, group: l.group as string,
      skeleton: l.skeleton, source: 'builtin' as const, hidden: isHiddenLayout(l.id),
    }));
  }
  if (moduleId === 'architecture-layouts') {
    // 架构骨架没有 `slots`——架构图不占图位，决定版式的量是「画哪种结构」
    // （那个信息在 `group` 上，候选筛选走 `architectureLayoutCandidates`）
    return ARCHITECTURE_LAYOUTS.map((l) => ({
      id: l.id, name: l.name, brief: l.brief, group: l.group as string,
      skeleton: l.skeleton, source: 'builtin' as const, hidden: isHiddenLayout(l.id),
    }));
  }
  return IMAGE_LAYOUTS.map((l) => ({
    id: l.id, name: l.name, brief: l.brief, group: l.group as string,
    slots: l.slots, skeleton: l.skeleton, source: 'builtin' as const, hidden: isHiddenLayout(l.id),
  }));
}

/** 自建 id 的前缀。用它把自建与内置分开，也保证两者永不撞 */
export const CUSTOM_LAYOUT_PREFIX = 'custom-';

/**
 * 生成一份自建骨架的 id。
 *
 * 要保证的只有一件事：**不与内置撞**。内置是 `people/row-hex-team@v1` 这类人工起的名字，
 * 所以这里统一带 `custom-` 前缀，后面跟时间戳（base36）加四位随机盐——
 * 同一个人连点两次也不会撞。
 *
 * 不去凑内置那条命名正则 `^people/[a-z-]+@v1$`（它只在骨架单测里断言内置数组，运行时无人校验）：
 * 为了合上它得把时间戳里的数字映射成字母，那是为「将来把好用的自建收编成内置」这个
 * 还没发生的事付的代价。真到那天再改 id 不迟。
 */
export function customLayoutId(moduleId: StudioModuleId, at: number = Date.now()): string {
  const ns = LAYOUT_ID_NAMESPACE[moduleId];
  const salt = Math.random().toString(36).slice(2, 6);
  return `${ns}/${CUSTOM_LAYOUT_PREFIX}${at.toString(36)}-${salt}@v1`;
}

export function isCustomLayoutId(id: string): boolean {
  return id.includes(`/${CUSTOM_LAYOUT_PREFIX}`);
}

/**
 * 模块 → 骨架 id 的命名空间前缀。
 *
 * **只有这一处**：`customLayoutId` 生成 id 与 `moduleOfLayoutId` 反推模块都要它。
 * 分写两份的话，加一个模块漏改一处，症状是「自建骨架存进去了、但反推不出属于哪个库」——
 * 换排版弹窗里点它没反应，而没有任何地方报错。
 */
const LAYOUT_ID_NAMESPACE: Record<StudioModuleId, string> = {
  'people-layouts': 'people',
  'image-layouts': 'gallery',
  'chart-layouts': 'chart',
  'ui-layouts': 'ui',
  'architecture-layouts': 'arch',
};

/**
 * 从骨架 id 反推它属于哪个版式库。认不出回 null。
 *
 * 命名空间就是按模块分的（`people/…` / `gallery/…` / `chart/…`），
 * 所以不需要查库也不需要额外字段。
 */
export function moduleOfLayoutId(id: string): StudioModuleId | null {
  for (const [moduleId, ns] of Object.entries(LAYOUT_ID_NAMESPACE)) {
    if (id.startsWith(`${ns}/`)) return moduleId as StudioModuleId;
  }
  return null;
}

/**
 * 指定版式时塞进提示词的那一块。
 *
 * 与 `peopleLayoutBlock` / `imageLayoutBlock` 是**同一件事的两种口径**：那两条给的是
 * 「几个候选，你自己挑」，这一条给的是「就这一种，别挑」。措辞上必须把「不要另挑」
 * 说明白——候选那套的措辞是「挑一个」，模型见过之后会习惯性地在给到的骨架里再选一轮，
 * 而这里只有一个，它可能反而去自由发挥。
 *
 * 末尾那两句照抄候选块里的：骨架里的示例内容必须换掉、配色必须走变量。这两条是
 * 骨架能用的前提，不因为「这次是用户手挑的」而放松。
 *
 * **页类型名字从外面传进来，不按版式所属的模块猜。** 猜的话，用户把一份 `gallery/…`
 * 骨架套在图文页上时，提示词会告诉他「这一页是图片排版页」——页类型叫错会直接影响
 * 模型怎么取舍内容（图文页以文字为主、图片排版页以图为主）。
 */
export function forcedLayoutBlock(layout: StudioLayout, pageLabel: string): string {
  return [
    `这一页是${pageLabel}。**已经指定了版式，就按下面这一种排，不要另挑、不要改动它的版面结构。**`,
    '',
    `【${layout.name}】${layout.brief}`,
    '',
    '```html',
    layout.skeleton,
    '```',
    '',
    '**骨架里的人名、职位、机构名、简介、数字、图注全是示例**（写具体是为了让版式的疏密看得出来），',
    '一律换成这一页的实际内容，一个都不要照抄。骨架的配色一律走 CSS 变量，不要写死色值。',
    /*
      **界面版式还要多带 `UI_DEVICE_KEEP` 那一段。**
      界面骨架里嵌着算出来的东西（机身图路径、屏幕的 `matrix3d`），模型看不懂就会
      「顺手清理」掉，页面上是设备散架而没有任何报错。候选块（`uiLayoutBlock`）里
      本来就带着那段，这条路上也必须带——而风格库给界面页绑版式是常态，
      所以这条路才是主路，漏了它等于「绑了版式的风格反而生成出散架的界面页」。
    */
    ...(moduleOfLayoutId(layout.id) === 'ui-layouts' ? ['', UI_DEVICE_KEEP] : []),
  ].join('\n');
}

/**
 * 图片排版页单页最多几个图位。
 *
 * 普通照片池按明暗硬筛（`stock-library/src/index.ts` 的 `toneMatched`），深色风格
 * 单页只拿得到 13 张，超出的图位会退化成占位块。上限留 12。
 */
const MAX_IMAGE_SLOTS = 12;

/**
 * 骨架的结构问题。空数组表示没问题。
 *
 * **只管结构，不管配色**：配色那一摊（写死 hex、外链、内联事件）归 `lintMockHtml`
 * （在 `@lumen/render-engine`，本包不能反向依赖它）。这里查的是「没有它就不是一份骨架」的几条。
 */
export function checkLayoutSkeleton(moduleId: StudioModuleId, skeleton: string): string[] {
  const problems: string[] = [];
  if (!/<style[\s>]/i.test(skeleton)) problems.push('没有 <style> 块，配色与版式无从谈起');
  if (!/<div[\s>]/i.test(skeleton)) problems.push('没有根 <div>');

  /*
    图表骨架查的是**图表槽**，不是图位——它的「内容」是一份数据规格而不是一张照片。
    槽里的 JSON 必须能解析且能出图（形状对不对、长度齐不齐由 `chartSlotProblems` 管），
    否则渲染层只能给占位块，这一页就等于没图。
  */
  if (moduleId === 'chart-layouts') {
    const slots = [...skeleton.matchAll(new RegExp(CHART_SLOT_RE.source, 'gi'))];
    if (slots.length === 0) {
      problems.push('一个图表槽都没有：图表槽要写成 <div data-lumen-chart="宽x高">{…JSON…}</div>');
    } else {
      const first = slots[0]!;
      const parsed = parseChartSlot(first[3] ?? '');
      if (!parsed.ok) problems.push(`图表槽有问题：${parsed.problem}`);
    }
    return problems;
  }

  /*
    界面骨架的「内容」是一台设备：一张竖着拼的转动图 + 屏幕的 `matrix3d` + 一个图位。
    这里只查**最容易悄悄坏掉的那两样**——转动图没了设备就是一块空白，
    图位编号跳了会把后面的格子挪过来。矩阵对不对没法在这儿查（它是算出来的）。
  */
  if (moduleId === 'ui-layouts') {
    if (!/url\(\/stock\/devices\//.test(skeleton)) {
      problems.push('没有设备转动图：`.ui-shell` 的 background-image 要指向 /stock/devices/…，否则设备整个是空的');
    }
    if (!/matrix3d\(/.test(skeleton)) {
      problems.push('屏幕没有 matrix3d：那是把界面图贴到机身斜面上的坐标变换，删了屏幕会和机身分家');
    }
  }

  /*
    架构骨架查的是**可替换的块**，不是图位——架构图是一张图解，不配照片（所以下面那条
    「一个图位都没有」对它不成立，必须在这里 return）。

    `data-lumen-arch-node` 是生成时的唯一线索：标了它的块会被换成本页的真实内容。
    一份里少于两个就不是一份能用的架构骨架（一个方块加一句标题不成图）。
  */
  if (moduleId === 'architecture-layouts') {
    const nodes = (skeleton.match(/data-lumen-arch-node/gi) ?? []).length;
    if (nodes < 2) {
      problems.push(`标出的可替换块只有 ${nodes} 个：每个模块 / 层 / 节点要写 data-lumen-arch-node，至少 2 个`);
    }
    if (/data-lumen-image/i.test(skeleton)) {
      problems.push('架构图不占图位：不要写 data-lumen-image');
    }
    return problems;
  }

  const slots = imageSlotNumbers(skeleton);
  if (slots.length === 0) {
    problems.push('一个图位都没有：图位要写成 <img data-lumen-image="1">');
  } else if (!slots.every((n, i) => n === i + 1)) {
    problems.push(`图位编号必须从 1 起连续，实际是 ${slots.join(', ')}——跳号会把后面的格子挪过来`);
  }

  /*
    图文排版按张数筛版式，槽位数超出图池就给不满。上限 12 见 `image-layouts.ts` 顶部注释。

    **下限不设**：两组里 `feature`（图文排版）就是「一张图配一段文字」，图位只有 1 个。
    早先这里卡过「至少 4 个」，那是只有「多图」一组时的口径，现在会把图文版式整批判掉。
    上面 `slots.length === 0` 那条已经保证了「至少有一个图位」。
  */
  if (moduleId === 'image-layouts' && slots.length > MAX_IMAGE_SLOTS) {
    problems.push(`图位有 ${slots.length} 个，超过 ${MAX_IMAGE_SLOTS}——普通图池按明暗硬筛后单页最多给到这么多张`);
  }
  return problems;
}
