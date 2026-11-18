import { IMAGE_SLOT_ATTR, framingOf, imageSlotCount, isCutoutSlot, objectFitByClass, type StockImage } from '@lumen/ir-schema';
import manifest from '../assets/manifest.json' with { type: 'json' };

/**
 * 样机配图库。
 *
 * 这些图是 28 张**开源可商用**的照片（Unsplash License：可商用、免授权、不强制署名），
 * 存在本包的 `assets/` 下。清单里记着每张图的作者、来源链接与许可，要查出处看
 * `assets/manifest.json`。
 *
 * ## 为什么是一个独立的包
 *
 * 配图要出现在**四个地方**：风格库里识别出来的样机、工作台的画布、后台的审核页、
 * 以及导出的成品。前两个在浏览器里，后两个一个在 Node、一个要读原图字节。
 * 原先它只活在 `apps/web` 里，于是只有工作台用得上——样机上留了一堆图片位，
 * 到了别的渲染入口就没人填，全是破图。
 *
 * 拆成包之后：浏览器侧用 `stockUrl()` 拿地址，Node 侧用 `./node` 的
 * `resolveStockFile()` 拿字节。两边看的是同一份清单，不会漂。
 */

export type StockKind = 'abstract' | 'architecture' | 'nature' | 'city' | 'texture' | 'tech' | 'people' | 'object' | 'lifestyle';

/** 类别的中文名。与 `PAGE_TYPE_LABEL` 同一个路数——词表跟着类型走，别在界面里另抄一份 */
export const STOCK_KIND_LABEL: Record<StockKind, string> = {
  abstract: '抽象',
  architecture: '建筑',
  nature: '自然',
  city: '城市',
  texture: '材质',
  tech: '科技',
  people: '人物',
  object: '物件',
  lifestyle: '生活',
};

/** 界面上的排列顺序，与枚举声明顺序一致 */
export const STOCK_KIND_ORDER: StockKind[] = [
  'abstract', 'architecture', 'nature', 'city', 'texture', 'tech', 'people', 'object', 'lifestyle',
];

/**
 * 图片库筛选条上的分类：**人物 / 物件 / 其他**。
 *
 * 与 `kind`（题材）不是一回事，两层各管一头：
 * - `kind` 是**给挑图用的**——`stockPhotosFor` 靠它把同一页的几张岔开题材，
 *   免得四宫格里四张都是建筑。所以它得细。
 * - 分类是**给人筛的**——59 张各国人物摆在几十张风景照里，按题材分成七档
 *   反而找不着人。界面上只要三个按钮。
 *
 * 分三档而不是两档，是因为**「其他」现在混了两类完全不同的东西**：普通照片
 * （会进自动配图池）与透明底物件（不进，只给抠图位和人工选图用）。合成一档的话，
 * 页面上那句「系统从『其他』里挑图」就与事实不符了。
 *
 * 把两者压成一个字段会同时坏掉两头：压成两个值，岔题材就没有依据了；
 * 保持七个值，用户想找人物得先知道它叫「人物」而不是「抠图」。
 */
export type StockCategory = 'people' | 'object' | 'other';

export const STOCK_CATEGORY_LABEL: Record<StockCategory, string> = { people: '人物', object: '物件', other: '其他' };

export const STOCK_CATEGORY_ORDER: StockCategory[] = ['people', 'object', 'other'];

/** 一张图落在哪个分类里。人物与物件各自成类（都是透明底），其余全是「其他」 */
export function stockCategoryOf(photo: Pick<StockPhoto, 'kind'>): StockCategory {
  if (photo.kind === 'people') return 'people';
  if (photo.kind === 'object') return 'object';
  return 'other';
}

/**
 * 图片库的排列：**透明底抠图一律排到最后**。
 *
 * 抠图与普通照片是两种用途的东西——普通照片进自动配图池，抠图只给人像位与人工选图。
 * 混着排的话，翻到一半突然插进来一片透明底的，既看不出分界，也不好连着挑。
 *
 * 判据取 `transparent` 而不是 `kind`：**物件的抠图（大厦、动车、飞机）不在 people 里**，
 * 按 kind 排会漏掉它们，只有 `transparent` 才是「是不是抠图」这件事本身。
 *
 * `Array.prototype.sort` 是稳定的，所以两组内部各自保持清单原顺序。
 */
export function sortStockPhotos<T extends Pick<StockPhoto, 'transparent'>>(photos: T[]): T[] {
  return [...photos].sort((a, b) => Number(a.transparent === true) - Number(b.transparent === true));
}

export interface StockPalette {
  brand: string;
  accent: string;
  neutral: string;
  dark: boolean;
}

export interface StockPhoto {
  file: string;
  kind: StockKind;
  tone: 'light' | 'dark';
  /** 这张图里真实取样的代表色，风格匹配靠它 */
  palette: string[];
  tags: string[];
  author: string;
  source: string;
  /**
   * 透明底抠图。
   *
   * 与 `kind === 'people'` 不是一回事：类别是**给人筛的**，这个标记是**给渲染用的**。
   * 落图时不裁切（`object-fit: contain`）靠的是它，见 `@lumen/ir-schema` 的
   * `fillImageSlots` / `IMAGE_SLOT_CSS`。把某张图归到别类但仍是抠图，
   * 只要这里为 true，渲染就对。
   */
  transparent?: boolean;
  /**
   * 人物像的取景。**只对 `kind === 'people'` 有意义。**
   *
   * - `head`：头肩特写，给头像位。
   * - `half`：头到腰 / 头到胯，给半身位、单人主视觉。
   *
   * 图位会用 `data-lumen-cutout="head" | "half"` 声明自己要哪种，配图时从对应池子挑。
   * 老条目没有这个字段，一律按 `half` 算。
   */
  framing?: 'head' | 'half';
  /**
   * 进回收站的时间。有值 = 已删除，**不参与配图、不在图片库里显示**。
   *
   * 文件本身还在：已经用在项目里的页面照常显示，只是后面新生成的项目挑不到它。
   * 在回收站里「彻底删除」才会真删文件并从清单移除。
   */
  deletedAt?: number;
}

/** 浏览器里取图的地址。由 api 的 `/stock` 静态托管提供，web 与 admin 都反代到它 */
export function stockUrl(photo: StockPhoto): string {
  return `/stock/${photo.file}`;
}

/**
 * 落图用的形态。抠图与否**从清单里的 `transparent` 读**，不看文件名也不看类别——
 * 文件名是给人看的，改一次命名就会让「抠图被裁掉」这种事静默回来。
 */
export function stockImageOf(photo: StockPhoto): StockImage {
  const img: StockImage = { src: stockUrl(photo) };
  if (photo.transparent === true) img.cutout = true;
  return img;
}

/**
 * 编译进 bundle 的那份清单快照。
 *
 * 它是**默认值**，不是真相：素材可以在运行时被删到回收站，而快照是构建时点。
 * 应用启动时用 `setStockPhotos()` 换成服务端刚读出来的那份，配图才不会用到
 * 已经删掉的图。没调过 setter 的场合（单测、纯静态渲染）仍然用这份。
 */
export const STOCK_PHOTOS = manifest as StockPhoto[];

/** 运行时清单。`null` 表示还没被替换过 */
let runtimePhotos: StockPhoto[] | null = null;

/**
 * 换成运行时清单。
 *
 * **必须先把回收站里的排掉再传进来**（或者传原样、让这里的过滤兜住）：
 * 配图与图片库都走这份，漏一个就会「删了还在用」。
 */
export function setStockPhotos(list: StockPhoto[]): void {
  runtimePhotos = list.filter((p) => p.deletedAt === undefined);
}

/** 当前生效的清单（已排除回收站） */
export function currentStockPhotos(): StockPhoto[] {
  return runtimePhotos ?? STOCK_PHOTOS.filter((p) => p.deletedAt === undefined);
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 两张图的代表色之间最近的那一对的距离。数值越小越「同一套色」 */
function paletteDistance(photo: StockPhoto, pal: StockPalette): number {
  const want = [pal.brand, pal.accent].map(hexToRgb).filter((c): c is [number, number, number] => c !== null);
  if (want.length === 0) return 0;
  let best = Infinity;
  for (const hex of photo.palette) {
    const c = hexToRgb(hex);
    if (!c) continue;
    for (const w of want) {
      const d = (c[0] - w[0]) ** 2 + (c[1] - w[1]) ** 2 + (c[2] - w[2]) ** 2;
      if (d < best) best = d;
    }
  }
  return best;
}

/**
 * 从给定池子里按色板挑 `count` 张。
 *
 * 抽出来是因为**普通池与人像池要走同一套排序与避重**：两处各写一遍，迟早有一边漏掉
 * 「同题材先让位」那一步，而表现只是「某套风格挑的图不好看」，没有任何测试会红。
 */
function pickFrom(pool: StockPhoto[], pal: StockPalette, count: number): StockPhoto[] {
  const wanted = pal.dark ? 'dark' : 'light';
  const toneMatched = pool.filter((p) => p.tone === wanted);
  const usable = toneMatched.length > 0 ? toneMatched : pool;
  const ranked = [...usable].sort((a, b) => paletteDistance(a, pal) - paletteDistance(b, pal));

  const picked: StockPhoto[] = [];
  const usedKinds = new Set<string>();
  // 先走一遍「题材没重复过」的，再走一遍兜底：图库小的时候题材很快用光，
  // 那时宁可同类不同图，也不能少给一张
  for (const pass of [true, false]) {
    for (const photo of ranked) {
      if (picked.length >= count) break;
      if (picked.includes(photo)) continue;
      if (pass && usedKinds.has(photo.kind)) continue;
      picked.push(photo);
      usedKinds.add(photo.kind);
    }
  }
  return picked.slice(0, count);
}

/**
 * 自动配图用的池子：**普通照片**。
 *
 * 判据是 `!transparent` 而不是 `kind !== 'people'`。原先写的是后者，之所以一直没出事，
 * 是因为**恰好只有人像是透明底**。加了物件抠图之后它们会掉进这里，被当成照片配到
 * 16:9 的图位上——`object-fit: contain` 一缩，页面正中浮一个半透明的大厦。
 *
 * 把「透明底抠图不参与普通配图」写成判据本身，而不是靠 kind 间接表达。
 */
/** 自动配图用的池子：普通照片（每次重算，跟着运行时清单走） */
function regularPool(): StockPhoto[] {
  return currentStockPhotos().filter((p) => !p.transparent);
}

/**
 * 不适合当人像的素材。
 *
 * 人像位用的是**固定裁切窗口**（见 `ir-schema/src/people-skeletons.ts` 的三档），
 * 所以素材里人物在画框中的位置与大小必须先统一——这一步由
 * `scripts/normalize-people.ts` 做，按人物包围盒把每张缩放到同一个取景。
 *
 * 下面这些**过不了那一关**，所以不进人像池（素材本身不动）：
 *
 * - **坐姿 / 蹲姿**：包围盒本来就矮，放大到统一身高会让头明显偏大，
 *   一排头像里就它一个头大一圈。
 * - **举手高过头顶**：包围盒顶端是手不是头，对齐顶端等于把头顶推出画面。
 *
 * 名单是**逐张看出来的**，不是按阈值算的——坐姿与站姿的包围盒高度是连续过渡的，
 * 没有干净的分界。加新素材时把人像档铺出来看一眼，不对的往这里加。
 */
export const PEOPLE_PORTRAIT_EXCLUDED: ReadonlySet<string> = new Set([
  // 坐姿 / 蹲姿
  'people-african-f-4.png',
  'people-caucasian-f-5.png',
  'people-indian-f-2.png',
  'people-hispanic-m-2.png',
  'people-asian-f-3.png',
  'people-hispanic-f-1.png',
  'people-indian-f-4.png',
  'people-arabic-f-2.png',
  'people-caucasian-m-3.png',
  // 举手高过头顶
  'people-african-m-5.png',
  'people-caucasian-m-4.png',
  'people-caucasian-m-5.png',
]);

/** 人像位用的池子：那批透明底抠图，去掉不适合当人像的。导出给测试核对排除名单 */
export function peoplePool(): StockPhoto[] {
  return currentStockPhotos().filter((p) => p.kind === 'people' && !PEOPLE_PORTRAIT_EXCLUDED.has(p.file));
}

/**
 * 按取景分的人像池。
 *
 * 图位用 `data-lumen-cutout="head" | "half"` 声明自己要哪种，配图时走这里。
 * **认不出取景时（老页面写的 `"1"`、或压根没写）按 `half` 算**——见 `framingOf` 的注释。
 *
 * 某一组空了就退回整池：宁可给一张取景不完全对的，也不能让图位空着
 * （空着渲染出来是破图图标，比给错取景难看）。真到那一步说明素材没配齐，
 * 该去 `scripts/stock-fetch-portraits.ts` 补图，而不是让这里兜着。
 */
export function peoplePoolOf(framing: 'head' | 'half'): StockPhoto[] {
  const all = peoplePool();
  const want = all.filter((p) => (p.framing ?? 'half') === framing);
  return want.length > 0 ? want : all;
}

/**
 * 物件抠图池：透明底的**非人物**素材（大厦、动车、飞机、机器人这类）。
 *
 * 用在非人物页的抠图位上——封面那片斜置的落叶、章节页那个立体的方块。
 * 人像位仍然走 `PEOPLE_POOL`，两个池子按**页类型**分（见 `poolForPageType`）。
 */
/** 物件抠图池：透明底的**非人物**素材（大厦、动车、飞机、机器人这类）。导出给测试核对池子非空 */
export function objectPool(): StockPhoto[] {
  return currentStockPhotos().filter((p) => p.transparent === true && p.kind !== 'people');
}

/**
 * 这一页的抠图位该从哪个池子取。
 *
 * **按页类型分，不按内容猜**：同一套骨架在人物页上要的是人，在封面页上要的是物件，
 * 而片段本身看不出自己在哪一页。
 *
 * 池子空了就退回另一个，再空就回普通池——留一个空槽渲染出来是破图图标，
 * 比给一张不贴题的图难看。
 */
function poolForPageType(pageType: string | undefined): StockPhoto[] {
  const people = peoplePool();
  const objects = objectPool();
  if (pageType === 'people') return people.length > 0 ? people : objects;
  return objects.length > 0 ? objects : people;
}

/**
 * 给这一页挑 `count` 张配图。
 *
 * **先按明暗筛**：深色风格配一张白底照片会刺眼，比题材不对显眼得多，所以明暗是硬约束。
 * 「科技/光感」这一类天然多是深色图，浅色风格要它的时候宁可换一张别的题材的浅色图。
 *
 * **再按「色板接近度 − 题材加分」排序**，而不是「先按题材筛、题材内再比色板」。
 * 后者看着更有条理，实际会把风格逼到死角：浅色图里 `abstract` 只有一张冷蓝灰，
 * 一套暖橙色的杂志风只能配它，颜色直接打架——有选择才谈得上挑。
 *
 * **最后逐个挑，挑过的跳过、题材用过的先让位**。一次要好几张的场合（图文页、
 * 四宫格）必须这样挑：每张单独按自己的题材排一次序的话，两张不同的题材可能
 * 都排到同一张图，同一页里就出现了重复。
 *
 * **人物不参与**：那 59 张是透明底抠图，落进 16:9 的图位会按 `object-fit: contain`
 * 缩成完整可见——页面正中悬着一个人，既不像配图也不像插画。它们是给「人像位」
 * 与人工选图用的，自动挑图这条路上直接排除。
 *
 * 结果只取决于 `pal` 与张数，**同一套风格每次渲染拿到的图是固定的**，样机不会闪。
 */
export function stockPhotosFor(pal: StockPalette, count: number): StockPhoto[] {
  return pickFrom(regularPool(), pal, count);
}

/**
 * 人像位取图。与 `stockPhotosFor` 同一套排序，只是池子换成那批抠图。
 *
 * `framing` 默认 `half`：这是「随便给人像位配一张」的场合，半身图放进头像位
 * 只是裁得紧一点，反过来会显得空。要精确控制取景就走 `allocateStockImages`
 * （它按每个图位自己声明的 `data-lumen-cutout` 取图）。
 */
export function peoplePhotosFor(
  pal: StockPalette,
  count: number,
  framing: 'head' | 'half' = 'half',
): StockPhoto[] {
  return pickFrom(peoplePoolOf(framing), pal, count);
}

/** 物件抠图取图。非人物页的抠图位用它（封面那片落叶、章节页那个方块） */
export function objectPhotosFor(pal: StockPalette, count: number): StockPhoto[] {
  return pickFrom(objectPool(), pal, count);
}

/** 单张。多张的场合用 `stockPhotosFor`，否则同一页里会挑重 */
export function stockPhotoFor(pal: StockPalette, seed = 0): StockPhoto {
  const all = stockPhotosFor(pal, Math.max(1, seed + 1));
  return all[Math.min(seed, all.length - 1)]!;
}

/** 一份风格配色转成配图库认的调子。`dark` 由调用方按 theme 判断 */
export function stockPaletteOf(palette: { brand: string; accent: string; surface: string; bg: string }, dark: boolean): StockPalette {
  return { brand: palette.brand, accent: palette.accent, neutral: dark ? palette.bg : palette.surface, dark };
}

/**
 * 一段 HTML 片段里有几个图位。
 *
 * 规则住在 `@lumen/ir-schema` 的 `fillImageSlots` 旁边——**数几张**与**怎么填**
 * 是同一件事的两半，分居两个包迟早会各改各的。这里只是转出去，方便按图位配图的人
 * 不用多引一个包。
 */
export { imageSlotCount };

/** 一个图位的标记：是不是抠图位，以及要什么题材（`data-lumen-pick`，可空） */
interface SlotMark {
  cutout: boolean;
  pick: string;
  /** 人像位要的取景；不是人像位、或图位没声明时为 `null` */
  framing: 'head' | 'half' | null;
}

/** 题材提示。写中文词即可，按 `tags` 与文件名做包含匹配（如「楼」命中「写字楼」「摩天楼」） */
const PICK_ATTR = 'data-lumen-pick';

function pickOf(tag: string): string {
  const m = new RegExp(`${PICK_ATTR}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag);
  return (m?.[1] ?? '').trim();
}

/** 按题材收窄池子；一个都对不上就退回整池，宁可给一张不同题材的也不给破图 */
function narrowByPick(pool: StockPhoto[], pick: string): StockPhoto[] {
  if (!pick) return pool;
  const words = pick.split(/[\s,，、/]+/).filter(Boolean).map((w) => w.toLowerCase());
  const hit = pool.filter((p) =>
    words.some((w) => p.file.toLowerCase().includes(w) || p.tags.some((t) => t.toLowerCase().includes(w))),
  );
  return hit.length > 0 ? hit : pool;
}

/**
 * 逐个数出每个图位会被 `fillImageSlots` 分到第几张图，以及那个图位是不是抠图位
 * ——判据是**显式标记，或样式里的 `object-fit: contain`**，与 `fillImageSlots` 同一份。
 *
 * **必须复刻 `fillImageSlots` 的取图规则，不能只按 `data-lumen-image` 的下标算。**
 * 那个函数不是「第 n 号图位取 `images[n-1]`」，而是「从声明的下标往后找第一个没用过的，
 * 找到头绕回前面」（`html-doc.ts:93-104`）。模型在图片排版页上常把几个图位都写成同一个
 * 下标（`html-doc.ts:56` 记着实测过的五连 "1"），那时它会顺延——第 2 个 tag 拿到的
 * 其实是第 2 张图。只按下标算的话标记与图片就对不上：人像位拿到普通照片、普通位拿到
 * 抠图，而页面上不报错，只是版式看着不对。
 *
 * 返回：下标 i（0 起）→ 这一张图会不会落在标了抠图的 tag 上。
 * 拿不到图的图位（模型多写了、图不够）不占池子——`fillImageSlots` 会给它占位块。
 */
function cutoutSlotsOf(fragment: string, count: number): SlotMark[] {
  const out: SlotMark[] = Array.from({ length: count }, () => ({ cutout: false, pick: '', framing: null }));
  const used = new Set<number>();
  // 与 fillImageSlots 用同一份判据。整页算一次，别每个图位各算一遍
  const fits = objectFitByClass(fragment);
  for (const m of fragment.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0]!;
    const want = Number(new RegExp(`${IMAGE_SLOT_ATTR}\\s*=\\s*["']?(\\d+)`, 'i').exec(tag)?.[1]);
    if (!Number.isFinite(want)) continue;
    const i = takeSlot(want, count, used);
    if (i === null) continue;
    const cutout = isCutoutSlot(tag, fits);
    out[i] = { cutout, pick: pickOf(tag), framing: cutout ? framingOf(tag) : null };
  }
  return out;
}

/**
 * `fillImageSlots` 里那个 `take` 的复刻：从声明的下标往后找第一个没用过的，
 * 找到头绕回前面接着找；拿不到图回 `null`（那边会换成占位块）。
 *
 * **两边必须一致，改一边就要改另一边**——`html-doc.ts:60` 已经写下了这条规矩
 * （「这条规则必须与 fillImageSlots 的取图规则一致」）。测试里那条
 * 「标记与最终落图对得上」的用例就是拿来钉这件事的：真跑一遍 `fillImageSlots` 再核对。
 */
function takeSlot(want: number, count: number, used: Set<number>): number | null {
  if (count === 0 || want > count) return null;
  for (let i = want - 1; i < count; i++) if (!used.has(i)) { used.add(i); return i; }
  for (let i = 0; i < want - 1; i++) if (!used.has(i)) { used.add(i); return i; }
  return null;
}

/**
 * 按题材分组各要一轮，返回 `题材 → 名单`。
 *
 * 空题材也要占一组：没写 `data-lumen-pick` 的位走整池，结果与改动前
 * 「整池一次要完」逐字节一致（有测试钉着）。
 */
function allocByPick(pool: StockPhoto[], pal: StockPalette, picks: string[]): Map<string, StockPhoto[]> {
  const need = new Map<string, number>();
  for (const pick of picks) need.set(pick, (need.get(pick) ?? 0) + 1);
  const out = new Map<string, StockPhoto[]>();
  for (const [pick, n] of need) out.set(pick, pickFrom(narrowByPick(pool, pick), pal, n));
  return out;
}

/**
 * 按图位的抠图标记分别取图：标了的从人物池取，没标的从普通池取。
 *
 * 返回的数组**按图片下标排**——下标就是 `fillImageSlots` 会去取的那个位置，
 * 所以第 i 项必须正好是第 i 张图。
 */
function allocateSlotImages(
  fragments: string[],
  pal: StockPalette,
  counts: number[],
  pageTypes: (string | undefined)[] = [],
): StockImage[][] {
  const marks = fragments.map((f, fi) => cutoutSlotsOf(f, counts[fi]!));

  /*
    两个池子哪个是空的，决定这一页的抠图位走谁。

    **不要拿 `poolForPageType` 的返回值比引用**：`peoplePoolOf` 每次都新建数组，
    比引用永远不相等，`samePool` 会恒为 false——人物页在物件池空的时候
    就会一张人都拿不到。这里直接看池子空不空，意图也更清楚。
  */
  const anyPeople = peoplePool().length > 0;
  const anyObjects = objectPool().length > 0;
  const samePool = !anyPeople || !anyObjects;

  /**
   * 人像位按取景收题材：`head` 走头肩池，其余（含没声明的）走半身池。
   *
   * **人像位也读 `data-lumen-pick`**：人物页下半场是极深的藏青，抽到穿深色衣服的
   * 素材时人整条糊进背景（实测对比 1.24:1，页面上就是「人只有上半截」）。
   * 风格得能说「这一页要浅色衣着的人」。
   */
  const headPicks: string[] = [];
  const halfPicks: string[] = [];
  /** 物件抠图位，按出现次序；`pick` 是这一格要的题材 */
  const objectSlots: { pick: string }[] = [];
  for (let fi = 0; fi < marks.length; fi++) {
    const toPeople = pageTypes[fi] === 'people' || samePool;
    for (const mark of marks[fi]!) {
      if (!mark.cutout) continue;
      if (toPeople) {
        if (mark.framing === 'head') headPicks.push(mark.pick);
        else halfPicks.push(mark.pick);
      } else objectSlots.push({ pick: mark.pick });
    }
  }
  const total = counts.reduce((a, b) => a + b, 0);

  /**
   * 每个池子**按题材分组各要一轮**。`pickFrom` 的避重结果与「要几张」有关，
   * 分多次要会拿到与整组不一致的顺序，同一页里就出现重复画面。
   *
   * 没有题材的那一组等于「整池一次要完」，与改动前逐字节一致（有测试钉着）。
   */
  const cutoutHead = allocByPick(peoplePoolOf('head'), pal, headPicks);
  const cutoutHalf = allocByPick(peoplePoolOf('half'), pal, halfPicks);
  const objectByPick = allocByPick(poolForPageType('gallery'), pal, objectSlots.map((s) => s.pick));

  /*
    普通位也能声明题材（`data-lumen-pick`）。

    以前只有抠图位读这个属性——「这一格要玻璃 / 要楼」这种诉求在普通照片位上
    只能靠色板距离碰运气，配出来的图题材全看谁离品牌色近。玻璃拟态那类
    **整页都该是同一题材**的风格因此永远配不齐。

    收集顺序必须与下面 `map` 的**消费顺序**完全一致：抠图位在池子空的时候会兜底
    落到普通位，这里也要按同样的条件跳过，否则题材会整体错位一格。
  */
  const regularPicks: string[] = [];
  {
    for (let fi = 0; fi < marks.length; fi++) {
      for (const mark of marks[fi]!) {
        if (mark.cutout) {
          if (pageTypes[fi] === 'people' || samePool) {
            const list = (mark.framing === 'head' ? cutoutHead : cutoutHalf).get(mark.pick) ?? [];
            if (list.length > 0) continue;
          }
          const list = objectByPick.get(mark.pick);
          if (list && list.length > 0) continue;
        }
        regularPicks.push(mark.pick);
      }
    }
  }
  const regularCount = regularPicks.length;

  /**
   * 普通位按题材分组各要一轮；**一个都没声明时走原来的整池一次要完**，
   * 结果与改动前逐字节一致（有测试钉着）。
   */
  let regular: StockPhoto[] = [];
  if (regularCount > 0) {
    if (regularPicks.every((p) => !p)) {
      regular = stockPhotosFor(pal, regularCount);
    } else {
      const need = new Map<string, number>();
      for (const pick of regularPicks) need.set(pick, (need.get(pick) ?? 0) + 1);
      const listOf = new Map<string, StockPhoto[]>();
      /*
        先给**声明了题材**的组分配，再给没声明的那组分配，后者要**避开前者已经用掉的图**。
        否则「封面不带题材 + 图片页全要玻璃」这种组合会让封面拿到玻璃组的第一张——
        同一张图在封面和图片页里各出现一次，翻页就看见重影。
      */
      const taken = new Set<string>();
      for (const [pick, n] of need) {
        if (!pick) continue;
        const list = pickFrom(narrowByPick(regularPool(), pick), pal, n);
        listOf.set(pick, list);
        for (const p of list) taken.add(p.file);
      }
      if (need.has('')) {
        const rest = regularPool().filter((p) => !taken.has(p.file));
        listOf.set('', pickFrom(rest.length > 0 ? rest : regularPool(), pal, need.get('')!));
      }
      const cursor = new Map<string, number>();
      for (const pick of regularPicks) {
        const list = listOf.get(pick)!;
        const k = cursor.get(pick) ?? 0;
        cursor.set(pick, k + 1);
        regular.push(list[k % list.length]!);
      }
    }
  }

  const hi = new Map<string, number>();
  const pi = new Map<string, number>();
  const oi = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => { const v = m.get(k) ?? 0; m.set(k, v + 1); return v; };
  let ri = 0;
  return marks.map((m, fi) => m.map((mark) => {
    if (mark.cutout) {
      if (pageTypes[fi] === 'people' || samePool) {
        const list = (mark.framing === 'head' ? cutoutHead : cutoutHalf).get(mark.pick) ?? [];
        if (list.length > 0) {
          const k = bump(mark.framing === 'head' ? hi : pi, mark.pick);
          return stockImageOf(list[k % list.length]!);
        }
      }
      const list = objectByPick.get(mark.pick);
      if (list && list.length > 0) {
        return stockImageOf(list[bump(oi, mark.pick) % list.length]!);
      }
    }
    return stockImageOf(regular[ri++ % regular.length]!);
  }));
}

/**
 * 给一段 HTML 片段里的图片位挑图。
 *
 * 提示词要求模型把图片位写成 `<img data-lumen-image="n">` 且**不写 src**，
 * 所以图是渲染时才配上去的。这里数出一页里有几个图位，按色板挑同样多的图。
 *
 * 没有图位就返回空数组——纯文字页、图表页本来就该没有配图。
 *
 * **只适合「单独看这一张」的场合。** 要把一组片段摆在一起看（一套风格的九个页类型、
 * 一张卡片的几张缩略图），必须改用 `allocateStockImages`：这个函数对同一套配色
 * 总是从同一张开始给，一组里几个片段各自调用就会拿到同一张图。
 */
export function stockImagesFor(fragment: string, pal: StockPalette, pageType?: string): StockImage[] {
  const count = imageSlotCount(fragment);
  if (count === 0) return [];
  return allocateSlotImages([fragment], pal, [count], [pageType])[0] ?? [];
}

/**
 * 给**一整组**片段一次性分配配图，保证组内不出现重复的画面。
 *
 * 为什么不能各自调用 `stockImagesFor`：`stockPhotosFor` 是确定性的，对同一套配色
 * 总是从同一张开始给；而一套风格里九个页类型共用同一套配色，于是几个单图位的页
 * 会全部拿到同一张图，并排看过去像是同一页贴了三遍。**单张层面没有足够的信息
 * 避免这件事**——只有把整组一起要，才知道前面已经用掉了几张。
 *
 * 返回的数组与入参一一对应，第 i 项就是第 i 段该用的图（按 `data-lumen-image` 下标排好）。
 */
export function allocateStockImages(
  fragments: string[],
  pal: StockPalette,
  pageTypes: (string | undefined)[] = [],
): StockImage[][] {
  const counts = fragments.map(imageSlotCount);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return counts.map(() => []);
  return allocateSlotImages(fragments, pal, counts, pageTypes);
}
