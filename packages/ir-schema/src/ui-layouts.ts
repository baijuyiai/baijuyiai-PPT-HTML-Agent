import { isHiddenLayout } from './hidden-layouts.js';
import { UI_SKELETONS } from './ui-skeletons.js';

/**
 * 界面页（`ui`）的版式库。
 *
 * ## 这一页是什么
 *
 * 页面里摆一台 3D 设备（手机 / 笔记本 / 显示器），**设备屏幕里嵌着一张可替换的界面图**，
 * 配标题与说明。参考图里那一类是「界面展示页」：产品截图放进设备的屏幕里，
 * 设备本身带真实厚度与角度，鼠标滑上去还会转一点。
 *
 * ## 与另外三个版式库的根本不同：骨架里嵌着**算出来的**东西
 *
 * 人物 / 图文 / 图表那三个库的骨架是纯 HTML+CSS，改配色改文案都在骨架内部。
 * 这个库不是——每份骨架里嵌着三样**由渲染算出来**的东西：
 *
 * 1. **外壳转动图**（`.ui-shell` 的 `background-image:url(/stock/devices/…)`）。设备是
 *    three.js 在构建期渲出来的一张竖着拼起来的长图（九个姿态），不是 CSS 画的。
 * 2. **屏幕四角的 `matrix3d`**。屏幕在渲染图里是一个斜的四边形，要把矩形界面图贴上去，
 *    只能用单应（见 `@lumen/device-models` 的 `quad.ts`）。
 * 3. **姿态之间的步进时序**（`.ui-screen` 与 `.ui-shell` 上那对 `steps(8, end)`）。
 *
 * 所以骨架是**生成的**（`ui-skeletons.ts` 顶部有说明）：版面由识别参考图得到，
 * 设备那一块由 `scripts/lib/ui-device.ts` 在生成时注入。
 *
 * ## 生成时模型只许换文字
 *
 * 这一点必须在提示词里说死：模型看到 `url(/stock/devices/…)` 会顺手改成它想用的图，
 * 看到 `matrix3d(…)` 会觉得是乱码、顺手删掉——两种都会让设备散架，
 * 而**没有任何一处会报错**，页面上只是「屏幕和机身对不上了」。
 *
 * ## 分组按设备分
 *
 * 手机 / 笔记本 / 显示器。判据是教案 `visualForm` 里提到的设备——
 * 与图表页按「画哪种图」挑候选是同一个路子。
 */

export type UiGroup = 'phone' | 'laptop' | 'display';

/** 界面与提示词里的排列顺序 */
export const UI_GROUP_ORDER: UiGroup[] = ['phone', 'laptop', 'display'];

const GROUP_LABEL: Record<UiGroup, string> = {
  phone: '手机',
  laptop: '笔记本',
  display: '显示器',
};

export function uiGroupLabel(g: UiGroup): string {
  return GROUP_LABEL[g];
}

export interface UiLayout {
  /** 形如 `ui/iphone-showcase@v1` */
  id: string;
  /** 中文名，界面与提示词都用它 */
  name: string;
  /** 一句话：适合什么内容 */
  brief: string;
  group: UiGroup;
  /**
   * 这台设备在 `@lumen/device-models` 里的**场景 id**（`iphone` / `macbook-desk` / …）。
   *
   * 留着它是为了让「这份骨架用的是哪台设备」可查——生成器按它找回外壳图与矩阵，
   * 以后要重渲某一台也能一眼看出影响哪几份骨架。**渲染代码不读这个字段**，
   * 两边靠生成器对齐，不是运行时耦合。
   */
  scene: string;
  /** HTML 片段：`<style>` + 一个根 `<div>`。约束见 `checkLayoutSkeleton` */
  skeleton: string;
}

export const UI_LAYOUTS: UiLayout[] = UI_SKELETONS;

/**
 * 教案里的说法 → 用哪台设备。
 *
 * **顺序即优先级**，从具体到宽泛：「数据大屏」必须排在「电脑」前面，
 * 否则前者永远匹配到后者。三档都不中时兜底给手机——参考图里 36 张有 29 张是手机。
 */
const DEVICE_KEYWORDS: [RegExp, UiGroup][] = [
  /*
    **这一组只认「真的指屏幕」的词。** 早先这里还收了「控制台」「后台管理」——
    那是**软件概念不是硬件**，一个后台管理界面跑在笔记本上。收了它们之后
    「笔记本上的后台管理界面」会认成显示器，而且错得毫无痕迹（都是挑一份骨架）。
  */
  [/显示器|大屏|数据大屏|屏幕墙|监控大屏|电视屏/, 'display'],
  [/笔记本|电脑|网页|网站|官网|PC\s*端|桌面端|后台管理|控制台|\bWeb\b/i, 'laptop'],
  [/手机|APP|应用|移动端|小程序|掌上|安卓|iOS/i, 'phone'],
];

/**
 * 从教案的视觉形式里认出用哪台设备。认不出回 `null`。
 *
 * 只看 `visualForm`：标题里常有「三大功能」这种与设备无关的词，
 * 拿它当判据会把纯文字页也认成界面页。
 */
export function estimateUiGroup(visualForm: string): UiGroup | null {
  for (const [re, group] of DEVICE_KEYWORDS) {
    if (re.test(visualForm)) return group;
  }
  return null;
}

/**
 * 一组最多给几个候选。
 *
 * 库里每组有二十来份骨架（从 36 张参考图识别来的），**整组塞进提示词是不行的**：
 * 每份都带着一整台设备的 CSS 与矩阵，三份就是一万多 token。所以这里卡住上界。
 */
const MAX_CANDIDATES = 3;

/**
 * 从这一组的第几个开始取。
 *
 * **不能取前三个。** 库里的顺序是「参考图按文件名排下来」的顺序，与这一页的内容
 * 毫无关系——取前三个意味着另外三十来份永远轮不到，而用户要的恰恰是「每页挑到贴的那份」，
 * 识别三十多张参考图也就白做了。
 *
 * 按这一页的内容算一个稳定的起点，于是各页落在不同的位置：
 * **同一页永远拿到同一组**（重生成的结果稳定，不会刷一次变一个样），
 * 不同页拿到的组不同。
 */
function offsetOf(seed: string, len: number): number {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return Math.abs(h) % len;
}

/**
 * 按这一页的内容筛出候选版式。**返回的数组一定非空。**
 *
 * **一组被下架光了就退回全组**（与图文 / 图表排版同一条规矩）：候选函数承诺非空，
 * 而空组会让这段提示词整个被抽掉、界面页退回自由发挥。下架是「别再自动挑中」，
 * 不是「这一组不许用」。
 */
export function uiLayoutCandidates(input: { visualForm: string; points: string[] }): UiLayout[] {
  const group = estimateUiGroup(input.visualForm)
    ?? estimateUiGroup(input.points.join(' '))
    ?? 'phone';

  const pool = UI_LAYOUTS.filter((l) => l.group === group && !isHiddenLayout(l.id));
  const usable = pool.length > 0
    ? pool
    // 一组被下架光了、或干脆一份都没有时退回全库
    : UI_LAYOUTS.filter((l) => l.group === group);
  const list = usable.length > 0 ? usable : UI_LAYOUTS;

  const n = Math.min(MAX_CANDIDATES, list.length);
  const start = offsetOf(`${input.visualForm}|${input.points.join('|')}`, list.length);
  return Array.from({ length: n }, (_, i) => list[(start + i) % list.length]!);
}

/**
 * 「设备那一块不许动」那一段。**候选块与指定版式块共用**。
 *
 * 不写死这条的话，模型会做两件很自然的事——把 `/stock/devices/…` 换成它觉得更贴题的图、
 * 把看不懂的 `matrix3d(…)` 当成乱码删掉。两件都会让屏幕和机身分家，
 * 而页面上只会看到「屏幕歪了」，没有任何报错。
 *
 * 抽出来共用是因为**两条路都会走到**：不绑版式时走 `uiLayoutBlock`，
 * 风格库给这一页绑了版式时走 `forcedLayoutBlock`（见 `studio-layouts.ts`）。
 * 那段话只写在候选块里的话，**绑了版式的风格反而会生成出散架的界面页**——
 * 而绑版式恰恰是界面页的常态（见 `scripts/fill-ui-pages.ts`）。
 */
export const UI_DEVICE_KEEP = [
  '**设备那一整块（`<div class="ui-dev ui-dev-N">` 及其里面的全部内容，还有 `<style>` 里',
  '所有带 `-N` 后缀的规则）照原样留着，一个字都不要改、不要挪、不要删**：',
  '- `.ui-shell-N` 上的 `background-image:url(/stock/devices/…)` 是**设备的机身**',
  '  （一张竖着拼起来的长图），路径不要改、不要删、不要加；',
  '- `.ui-screen-N` 上的 `matrix3d(…)` 是**把屏幕贴到机身斜面上的坐标变换**，',
  '  看着像乱码，但删了或改了屏幕就和机身分家了——原样保留；',
  '- `:hover` 那两条是鼠标滑上去时机身与屏幕一起转到 3/4 角的时序，同理原样保留；',
  '- `.ui-screen-N` 里那个 `<img data-lumen-image="N">` **不写 `src`**（真图由下游填进去），',
  '  也不要给它加 `data-lumen-cutout`；',
  '- 一页里不止一台设备时，各台的 `N` 不同，**不要把它们合并或改成同一个数**。',
  '',
  '要改的只有页面上的**文字**：标题、说明、标签。',
].join('\n');

/**
 * 拼成提示词里的那一段。
 *
 * 与另外三个库的候选块同一个口径，但**多出 `UI_DEVICE_KEEP` 那段最要紧的话**。
 */
export function uiLayoutBlock(candidates: UiLayout[], pageLabel: string): string {
  const items = candidates.map((l) =>
    `【${l.name}】${l.brief}\n\n\`\`\`html\n${l.skeleton}\n\`\`\``,
  );
  return [
    `这一页是${pageLabel}。${pageLabel}有多种版式，**按这一页的内容挑一种**，不要每页都用同一个。`,
    '下面是适合这一页的几个候选：',
    '',
    ...items,
    '',
    '挑一个，**照它的版式结构排**：标题、说明、标签放哪，设备占多大、摆在哪儿，都按骨架来。',
    '**骨架里的文字全是示例**（写具体是为了让版式的疏密看得出来），一律换成这一页的实际内容。',
    '骨架的配色一律走 CSS 变量，不要写死色值。',
    '',
    UI_DEVICE_KEEP,
  ].join('\n');
}
