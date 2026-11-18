# 人物排版：16 种版式 · 设计

2026-10-27

## 背景

用户原话：

> 功能模块，增加人物排版，所有排版拆开

并给了 8 张「PPT-人物排版」参考图，**每张 2 个版式，共 16 个**。

逐条问过、已确认的判断：

- 做成**真实可用的版式模板**，不是只摆样张
- 骨架**当参考示例**塞进提示词（few-shot），模型产出 HTML
- 这次**只做人物页**这一个页类型
- 生成时**由模型自己挑**版式
- 16 个骨架**先按规则预筛到候选组**，只把候选组给模型

## 现状

### 人物页现在只有一种排法

上一轮给每个页类型加了一条提示词，人物页那条由模型自由发挥——同一套风格每次排出来的东西不一样，也没法保证「团队介绍」和「人物简介」排出该有的样子。参考图里这 16 个版式是有明确形态的：谁排头像行、谁排单人特写、谁排斜切飘带，都能说清楚。

### 为什么骨架能跨风格复用

`buildPageDocument` 会注入 `paletteVars`（`--bg/--surface/--text/--muted/--accent/--brand/--border`）
与 `--font-sans`（`ir-schema/src/html-doc.ts:38`、`:754`）。骨架**只用这些变量取色**，
换一套风格自动跟着变，不需要每套风格各写一份。

### 三条硬约束（都有原因，不是风格偏好）

1. **只用 CSS 变量取色，不写死任何色值。**
   `lintMockHtml`（`render-engine/src/codegen.ts:130`）把非配色的 hex 判成 `error`；
   而且写死了换风格就不适配，违背上一条。
2. **人像位写 `data-lumen-cutout="1"`。** 这是上一轮做好的机制：模型写这个标记，
   `fillImageSlots` 就会从人物池取透明底抠图。**人物池 59 张全是抠图**，
   所以所有版式的人像位一律走抠图——包括参考图里那些「照片栏」「用户画像」，
   它们用「抠图 + 色块底」表达，而不是真照片。
3. **要裁切的头像（圆形、六边形）用容器裁，不靠 `object-fit`。**
   `html-doc.ts:151` 那条 `img[data-lumen-cutout="1"] { object-fit: contain !important }`
   是带 `!important` 的样式表规则，骨架覆盖不掉。所以圆形/六边形头像写成
   `wrapper(overflow:hidden) > img(放大 + 位移)`，裁切发生在容器上。
   **这条是这次最容易踩的坑**：直接给 img 写 `object-fit: cover` 会静默失效，
   页面上是「整个人缩在圆圈里」而不是头像。

## 一、版式库

`packages/ir-schema/src/` 下两个文件：

| 文件 | 责任 |
|---|---|
| `people-skeletons.ts` | 16 份 HTML 骨架，纯数据 |
| `people-layouts.ts` | 类型、注册表、候选规则 |

```ts
export type PeopleGroup = 'solo' | 'row' | 'cards' | 'personas' | 'grid';

export interface PeopleLayout {
  id: string;        // 'people/row-hex-team@v1'
  name: string;      // 「六边形头像行」
  brief: string;     // 一句话：适合什么内容
  group: PeopleGroup;
  skeleton: string;  // HTML 骨架
}

export const PEOPLE_LAYOUTS: PeopleLayout[];
/** 按这一页的内容筛出候选组。返回的数组非空——最差也回一组 */
export function peopleLayoutCandidates(input: {
  title: string; claim: string; points: string[]; visualForm: string;
}): PeopleLayout[];
/** 拼成提示词里那一段 */
export function peopleLayoutBlock(candidates: PeopleLayout[]): string;
```

**为什么放 `ir-schema`**：它已经是「页面结构知识」的家（`PAGE_TYPE_ORDER` / `PAGE_TYPE_BRIEF` /
`DECORATION_BY_PAGE_TYPE` 都在 `style-doc.ts`），渲染文件 `html-doc.ts` 本来就在里面；
`server-core` 与 `apps/web` 都已经依赖它。为几个字符串数组新建一个包不划算。

**为什么拆两个文件**：16 份骨架约 1600 行，与「类型 + 规则」混在一起，
改规则时要在一堆 HTML 里翻。

### 16 个版式

| id | 名字 | 组 | 参考图 |
|---|---|---|---|
| `people/solo-quote@v1` | 单人引言 | solo | 图4上 |
| `people/solo-honors@v1` | 单人荣誉 | solo | 图5上 |
| `people/solo-blocks@v1` | 单人色块 | solo | 图5下 |
| `people/row-circle@v1` | 圆形头像行 | row | 图3上 |
| `people/row-circle-note@v1` | 圆形头像说明 | row | 图4下 |
| `people/row-hex-team@v1` | 六边形头像行 | row | 图6上 |
| `people/row-hex-logo@v1` | 六边形头像 logo 行 | row | 图8下 |
| `people/row-circle-dark@v1` | 深色圆形头像行 | row | 图8上 |
| `people/row-hex-timeline@v1` | 六边形头像时间轴 | row | 图2下 |
| `people/cards-four@v1` | 四栏人物卡 | cards | 图3下 |
| `people/cards-blocks@v1` | 色块列人物 | cards | 图7上 |
| `people/ribbon-tags@v1` | 斜切飘带 | cards | 图1上 |
| `people/ribbon-blocks@v1` | 斜切色块 | cards | 图1下 |
| `people/slab-photos@v1` | 斜切照片栏 | cards | 图2上 |
| `people/personas@v1` | 受众画像 | personas | 图6下 |
| `people/hex-grid@v1` | 六边形网格 | grid | 图7下 |

## 二、候选规则

按优先级，命中即返回。**规则是猜的，靠实测校准**——所以它必须可单独测试，
且每一组都能被单独喂进去。

| 顺序 | 判据 | 组 | 候选数 |
|---|---|---|---|
| 1 | 内容含 `画像 / 受众 / 用户 / 人群 / 读者` | `personas` | 1 |
| 2 | 人数 ≥ 6 且含 `团队 / 嘉宾 / 成员 / 阵容 / 班底` | `grid` | 1 |
| 3 | 人数 ≤ 1 | `solo` | 3 |
| 4 | 含 `团队 / 嘉宾 / 成员 / 阵容 / 讲者 / 班底` | `row` | 6 |
| 5 | 其余 | `cards` | 5 |
| 6 | 兜底（人数估不出来且无关键词） | `row` | 6 |

**人数怎么估**：先从 `visualForm`（教案阶段模型写的视觉形式，如「五个人像横排」）里
抓中文或阿拉伯数字的量词；抓不到再用 `points.length`；两个都拿不到回 0，走第 6 条。

**注意 `points` 最多 5 条**（`OutlinePage` 里是 `.max(5)`，`deck.ts:29`），
所以「人数 ≥ 6」只能由 `visualForm` 得出——那是数据本身的边界，不是规则写漏了。

判据文本取 `title + claim + visualForm + points` 拼起来，`visualForm` 权重最高
（它本来就是讲版式的）。`visualForm` 在 `OutlinePage` 上是 `optional`，取用时收成 `''`。

## 三、生成时注入

`packages/server-core/src/services/generate-html.service.ts` 的 `callModel`（`:276`）。

现在的用户消息是几段 `---` 分隔：风格提示词 / 配色 / 视觉规范 / 品牌 / 本页内容。
人物页在**配色之后、本页内容之前**多插一段：

```
---
这一页是人物页。人物页有多种版式，**按这一页的内容挑一种**，不要每页都用同一个。
下面是适合这一页的几个候选：

【单人引言】一位主角，左半幅人像，红色横带 + 大引号 + 姓名头衔 + 引言正文。
（骨架 HTML）

【单人荣誉】一位主角，左文右像；左侧姓名、经历与荣誉徽章，右侧人像。
（骨架 HTML）

挑一个，然后用**这套风格**的视觉语言把它写出来。骨架里的文案是占位，按这一页的实际内容替换；
骨架的配色一律走 CSS 变量，不要写死色值。
```

（骨架用 ```html 代码块包着，上面写成「（骨架 HTML）」只为在本文档里不套娃。）

**只带候选组，不带全部 16 个**：每次人物页生成多带约 4–8KB，**不多一次模型调用**。

`callModel` 现在收不到 `pageType`，要加一个参数把它传进来（或在调用处把这段拼好传进去）。

## 四、能力总览展示

`apps/web/src/pages/Studio.tsx` 的 `功能模块` tab（`ModuleGallery`）新增一张卡「人物排版」：

- **16 个骨架全摆**，按组（solo / row / cards / personas / grid）分段
- **直接渲染骨架，不经过模型**——免费，且符合这一页「现场渲染，不是截图」的既有原则
- 每个下面写版式名 + 一句话

## 不做

- 不做人工指定版式（模型自己挑）
- 不做其他页类型的版式（这次只做人物页）
- 不改已有 5 套风格的存储提示词（版式在生成时注入，不进存储）
- 不做版式的每风格推导（骨架风格无关）
- 不做真照片版式（人物池只有抠图）

## 验证

1. `pnpm -r typecheck`、`pnpm -r test`、`pnpm test`（含 `apps/web`）、`pnpm build` 全过
2. 单测（`packages/ir-schema`）：
   - 16 个 id 唯一；分组数 3 / 6 / 5 / 1 / 1
   - 每份骨架过 `lintMockHtml`（用一套真配色）
   - 每份骨架至少有一个 `data-lumen-cutout="1"` 图位
   - 候选规则：六条判据各喂一个输入，返回对的组；边界（人数估不出、无关键词）走兜底
3. 单测（`packages/server-core`）：人物页的请求带上了候选块；其他页类型不带
4. 浏览器实测（真浏览器，不是看代码）：
   - 能力总览 → 功能模块 → 人物排版：**16 个样机都渲染出来**
   - 人像位里是**真人物抠图**（背景是页面底色，不是照片背景）
   - 圆形/六边形版式里的人物**是裁切的头像**，不是缩小的整个人（这条验的是约束 3）
5. 生成实测：真生成一页人物页，看模型挑没挑、有没有照骨架排
