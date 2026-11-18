# 多图排版：26 种版式 · 设计

2026-10-30

## 背景

用户原话：

> 在功能模块增加多图排版，文件夹内全部变成版式：C:\Users\41945\Desktop\多图排版

文件夹里是 **26 张小红书参考图**，全是「多图排版」——一张页面里摆多张图的排法。

逐条问过、已确认的判断：

- **只接 `gallery`（图片排版页）**，不碰 `cover` / `end`。参考图里有几张是封面形态，
  但那些形态放进图片排版页同样成立，而封面是每套风格的重头戏，注入候选会改变现有
  5 套风格的产出。
- **先按张数筛，再按内容形态挑**。张数是硬约束：一个要 12 张图的版式，这一页只有
  4 张时用不了，填不满的图位会变成占位块。

其余沿用[人物排版](2026-10-27-people-layouts-design.md)那一套：骨架 HTML 当 few-shot
塞进提示词，生成时按规则筛候选，功能模块里现场渲染。

## 现状

### 图片排版页现在没有版式库

`gallery` 是「多张图成组铺开、以图为主」的页类型（`ir-schema/src/page.ts:9`），
现在只有一条按风格写的提示词，版式由模型自由发挥——同一套风格每次排出来的不一样，
也排不出参考图里那些有明确形态的东西（弧形卡扇、斜切面板、拍立得散落……）。

### 和人物排版的三个不同

| | 人物排版 | 多图排版 |
|---|---|---|
| 图从哪来 | 人物池（59 张透明底抠图） | **普通池**（28 张照片） |
| 图位标记 | 写 `data-lumen-cutout="1"` | **不写**——普通照片，`object-fit: cover` 就够 |
| 决定版式的量 | 人数 | **张数** |

第三条是这次的核心：一页摆几张图，直接决定哪些版式用得上。

## 一、版式库

`packages/ir-schema/src/` 下两个文件，与人物排版对称：

| 文件 | 责任 |
|---|---|
| `image-skeletons.ts` | 26 份 HTML 骨架，纯数据 |
| `image-layouts.ts` | 类型、注册表、候选规则 |

```ts
export type ImageGroup = 'grid' | 'collage' | 'arc' | 'slant' | 'spread' | 'stagger';

export interface ImageLayout {
  id: string;        // 'gallery/mosaic-fullbleed@v1'
  name: string;      // 「满版瓦片马赛克」
  brief: string;     // 一句话：适合什么内容
  group: ImageGroup;
  /** 这份骨架里有几个图位。候选规则靠它做张数筛选 */
  slots: number;
  skeleton: string;  // HTML 骨架
}

export const IMAGE_LAYOUTS: ImageLayout[];
/** 按这一页的内容筛出候选组。返回的数组非空——最差也回一组 */
export function imageLayoutCandidates(input: {
  title: string; claim: string; points: string[]; visualForm: string;
}): ImageLayout[];
/** 拼成提示词里那一段 */
export function imageLayoutBlock(candidates: ImageLayout[]): string;
```

**`slots` 为什么是显式字段、不靠数骨架里的图位**：候选规则要在**不解析 HTML** 的
前提下按张数筛。数一遍当然也能数出来（`imageSlotCount`），但那是「从产物反推约束」——
骨架改一格忘了同步 `slots`，筛选就会悄悄放一个填不满的版式进来。显式写死，
再由单测钉住「`slots` 等于骨架里实际的图位数」。

### 四条硬约束

1. **只用 CSS 变量取色，不写死任何色值。**
   `lintMockHtml`（`render-engine/src/codegen.ts:152`）把非配色的 hex 判成 `error`，
   变量定义里的颜色也查（`:187` 那条 `palette-var-mismatch`）。骨架只用
   `--bg / --surface / --text / --muted / --accent / --brand / --border`。

2. **图位写 `<img data-lumen-image="n">`，不写 `src`，不写 `data-lumen-cutout`。**
   这些是普通照片，走普通池。写了 cutout 标记会被当抠图位、从人物池取人像——
   一页多图排版里冒出 12 张人像，那不是配图。

3. **槽位数一律 ≤ 12。**
   普通池 28 张按明暗硬筛（`stock-library/src/index.ts:136` 的 `toneMatched`），
   深色风格只能拿到 **13 张**、浅色 15 张。超过这个数，多出来的图位会退化成占位块。
   取 12 是留一格余量。参考图里那张满版马赛克有近 20 格，这次压到 12 格。

4. **圆形 / 多边形裁切用 `border-radius` 或 `clip-path` 配 `object-fit: cover`，不用容器套。**
   人物排版必须用容器裁，是因为 `img[data-lumen-cutout="1"]{object-fit:contain !important}`
   压过了骨架；这里没有那个标记，`cover` 正常生效，直接用最简单的那种写法。

### 26 个版式

按形态分六组。`slots` 是骨架里的图位数。

**grid 网格（4）**——规整的网格、马赛克、瀑布流

| id | 名字 | slots | 参考图 |
|---|---|---|---|
| `gallery/grid-thumbs-hero@v1` | 缩略图墙 + 中央主图 | 10 | 黄圆圈_4 |
| `gallery/mosaic-fullbleed@v1` | 满版瓦片马赛克 | 12 | 王不懂_2 |
| `gallery/masonry-side-text@v1` | 左文右瀑布流 | 12 | 黄圆圈_8 |
| `gallery/magazine-grid@v1` | 非对称杂志网格 | 6 | 策划宠_7 |

**collage 拼贴（5）**——自由摆放、拍立得、散落

| id | 名字 | slots | 参考图 |
|---|---|---|---|
| `gallery/polaroid-scatter@v1` | 拍立得散落 | 7 | 老弥_3 |
| `gallery/polaroid-board@v1` | 拍立得便签板 | 8 | 老弥_5 |
| `gallery/tiles-giant-type@v1` | 散落方图 + 巨型字穿插 | 7 | 黄圆圈_7 |
| `gallery/strips-giant-type@v1` | 图穿插巨型字 | 6 | 灵感_2 |
| `gallery/scatter-around-title@v1` | 照片散落四角 + 中央大字 | 8 | 黄圆圈_5 |

**arc 弧形（4）**——弧线、环形、圆形

| id | 名字 | slots | 参考图 |
|---|---|---|---|
| `gallery/arc-card-fan@v1` | 弧形卡扇 | 5 | 黄圆圈_6 |
| `gallery/arc-cards-flat@v1` | 浅弧竖卡 | 5 | 策划宠_6 |
| `gallery/ring-cards@v1` | 环形卡片拱 | 12 | 灵感_3 |
| `gallery/circle-row@v1` | 大小不一圆形横排 | 8 | 策划宠_4 |

**slant 斜切与透视（5）**——平行四边形、斜切面板、3D

| id | 名字 | slots | 参考图 |
|---|---|---|---|
| `gallery/slant-strips@v1` | 斜切条交错 | 4 | 亚马逊_8 |
| `gallery/slant-panels-center@v1` | 斜切面板环绕中央文字 | 6 | 亚马逊_9 |
| `gallery/slant-hero-panels@v1` | 主图 + 斜切面板阵 | 6 | 亚马逊_13 |
| `gallery/iso-screens@v1` | 等距屏幕炸开 | 4 | 王不懂_8 |
| `gallery/slab-stack@v1` | 堆叠板列表 | 7 | 王不懂_10 |

**spread 主次跨页（5）**——一个大图 + 若干辅图

| id | 名字 | slots | 参考图 |
|---|---|---|---|
| `gallery/hero-corners@v1` | 中央主图 + 四角小图 | 5 | 亚马逊_6 |
| `gallery/quad-arc-band@v1` | 四等分竖图 + 弧形说明带 | 4 | 亚马逊_10 |
| `gallery/cards-center-lift@v1` | 中间抬起的卡列 | 5 | 策划宠_5 |
| `gallery/device-flanked@v1` | 中央设备 + 两侧竖卡 | 7 | 黄圆圈_9 |
| `gallery/editorial-spread@v1` | 杂志跨页 | 5 | 策划宠_2 |

**stagger 错落（3）**——有序错位

| id | 名字 | slots | 参考图 |
|---|---|---|---|
| `gallery/stagger-columns@v1` | 错落竖卡 + 背景大字 | 7 | 黄圆圈_2 |
| `gallery/numbered-strips@v1` | 编号竖条错落 | 5 | ScreenShot_101134 |
| `gallery/labeled-mosaic@v1` | 图 + 标签错落马赛克 | 6 | ScreenShot_101121 |

合计 4 + 5 + 4 + 5 + 5 + 3 = **26**，`slots` 落在 4–12。

## 二、候选规则

两层：**先按张数筛掉用不上的，再按内容形态挑**。规则是猜的，靠实测校准，
所以它单独成函数、单独测，调的时候不用碰骨架。

### 2.1 估张数

```
estimateImageCount(visualForm, points): number | null
```

- 先从 `visualForm` 抓量词：`/([一二两三四五六七八九十]|\d+)\s*(?:张|幅|格|个)\s*(?:图|照片|图片|画面)?/`
- 抓不到就用 `points.length`（教案给的要点条数，图片排版页多半一条要点配一张图）
- 两个都拿不到回 `null`——**回 `null` 而不是 0**：`null` 是「估不出来」，0 是
  「确实没有图」，两者在下面走不同分支

`points` 最多 5 条（`OutlinePage` 里是 `.max(5)`），所以 `points.length` 这条路
估不出 6 以上——那是数据本身的边界，不是规则写漏了。

### 2.2 筛 + 挑

```
n = estimateImageCount(...)
usable = n === null ? IMAGE_LAYOUTS : IMAGE_LAYOUTS.filter(l => l.slots <= n)
// 估出来的张数太小（比如 2）时，usable 会空或只剩一两个——回退到「小版式」这一档，
// 宁可给几个填得满的，也不要空手
if (usable.length < 3) usable = IMAGE_LAYOUTS.filter(l => l.slots <= 4)

groups = 内容形态命中的组（可能命中多个，也可能一个都没命中）
picked = 先按命中组取：每组按 slots 降序取 2 个
         不够就从剩余组按 slots 降序补
返回 picked.slice(0, 6)
```

封顶 6 个，与人物排版一致——一次多带 4–8KB，而不是 26 份骨架。

### 2.3 内容形态 → 组

判据文本取 `title + claim + visualForm + points` 拼起来，`visualForm` 权重最高
（它本来就是讲版式的）。

| 组 | 关键词 |
|---|---|
| `grid` | 网格、矩阵、宫格、拼图、瀑布、图墙、马赛克 |
| `collage` | 拼贴、拍立得、手账、散落、便签、贴纸、剪贴 |
| `arc` | 弧、拱、环、圆、扇形、放射、环绕 |
| `slant` | 斜切、平行四边形、透视、立体、等距、堆叠、倾斜 |
| `spread` | 主图、大图、跨页、杂志、主次、特写、封面式 |
| `stagger` | 错落、高低、编号、序列、时间线、列表、阶梯 |

一个都没命中时：不按组挑，直接从 `usable` 里按 slots 降序取 6 个——
张数多的版式画面最满，图片排版页最常见的正是「铺满」。

## 三、生成时注入

`packages/server-core/src/services/generate-html.service.ts:164` 那段，
现在只对 `people` 拼 `layoutBlock`，改成两个页类型各拼各的：

```ts
const layoutBlock = pageType === 'people'
  ? peopleLayoutBlock(peopleLayoutCandidates({ ... }))
  : pageType === 'gallery'
    ? imageLayoutBlock(imageLayoutCandidates({ ... }))
    : '';
```

注入位置、`callModel` 的签名、重写重试那条路**一行不改**——它们收的都只是
一个字符串。

`imageLayoutBlock` 的措辞照 `peopleLayoutBlock`（`people-layouts.ts:134`），
但两处要改：

- 「这一页是人物页」→「这一页是图片排版页」
- 骨架里的**图片说明文字**（「Project name」「THE ROSELINE RING」这类）是示例，
  一律换成这一页的实际内容。图片排版页的骨架里带文字块，这条比人物页更要紧

### 3.1 优先级：候选压过风格提示词（实测补上的一节）

**这一节是生成实测逼出来的，设计时没想到。**

每套风格的页类型提示词本身就是一份完整版式规格——12 列网格、每张跨几列、像素级
位置、连 `figure`/`figcaption` 的结构都写死了（五套风格全都是）。版式候选是另一份。
两份都给，模型会挑更具体的那个：**实测喂了三个候选（四等分+弧形带 / 斜切条 /
等距屏幕），产出是一套普通的四等宽网格，候选的结构特征一个都没出现。**

所以光把候选那边的措辞从「用这套风格的视觉语言写出来」改成「照版式结构排」不够——
那是劝，不是规则。**优先级要写在两份规格碰面的地方**，也就是
`generate-html.service.ts` 的 `callModel` 注入候选那一处：

> 上面那段风格提示词里的「版面分区 / 画面分区 / 网格」那一节，按下面候选的版式来。

这句同时作用于人物页与图片排版页，两个版式库都受益。

实测结果（`apps/worker/scratch/verify-gallery-generation.ts`，真跑模型、不写库）：
加这句之前 **0/1** 照骨架，加之后 **2/2** 照骨架——两次都复刻出「四等分竖图 +
弧形说明带」，连拱形圆角的 `90px` 都对得上。

## 四、能力总览展示

`apps/web/src/pages/Studio.tsx` 的 `功能模块` tab 新增一张卡「多图排版」，
照现有「人物排版」那张卡（`:325-368`）写：

- **26 个骨架全摆**，按组（grid / collage / arc / slant / spread / stagger）分段
- **直接渲染骨架，不经过模型**，`pageType="gallery"`、`frame={false}`
- 每个下面写版式名 + 一句话
- 配图**整组一次分配**（`useMockImages(doc, 全部骨架)`），否则 26 张样机会撞成同一张画面——
  人物排版那张卡已经踩过这个坑（`:240` 那条注释）

`IMAGE_GROUP_ORDER` / `imageGroupLabel` 与人物排版对称。

## 不做

- **不接 `cover` / `end`**（这次只做图片排版页）。
- **不做人工指定版式**（模型自己挑）。
- **不扩素材库**。普通池 28 张够一次排版用；满版类版式压到 12 格是配合这个池子。
  要更密的马赛克得先加素材，那是另一件事。
- **不改已有 5 套风格的存储提示词**（版式在生成时注入，不进存储）。
- **不做版式的每风格推导**（骨架风格无关）。

## 验证

1. `pnpm test`、`pnpm -r typecheck`、`pnpm build` 全过。
2. 单测（`packages/ir-schema`）：
   - 26 个 id 唯一；分组数 4 / 5 / 4 / 5 / 5 / 3
   - **每份骨架的 `slots` 等于 `imageSlotCount(skeleton)`**——这条钉住「显式字段没写错」
   - 每份骨架过 `lintMockHtml`（用一套真配色）
   - 每份骨架的图位数在 4–12 之间
   - **每份骨架里没有 `data-lumen-cutout`**——写了就会去人物池取人像
   - 候选规则：张数估得出 / 估不出两条路各喂几个输入；六组关键词各命中一次；
     `usable` 不足 3 个时回退到小版式；结果永不为空、永不超过 6 个
3. 单测（`packages/server-core`）：`gallery` 页的请求带上了候选块；
   人物页带的是人物那块；其他页类型两块都不带。
4. **真浏览器实测**（真浏览器，不是看代码）：
   - 能力总览 → 功能模块 → 多图排版：**26 个样机都渲染出来**
   - 每个样机里的图**不是人像抠图**（验的是没写 cutout 标记）
   - **没有一格是占位块**（验的是 `slots` ≤ 素材池上限）
   - 换一套风格（至少冷色 / 暖色各一套），确认骨架跟着变——验的是只用 CSS 变量取色
5. **生成实测**：真生成一页图片排版页，看模型挑没挑、有没有照骨架排。
