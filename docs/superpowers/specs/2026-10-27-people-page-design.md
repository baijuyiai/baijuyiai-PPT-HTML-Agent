# 人物页 · 设计

2026-10-27

## 背景

用户原话：

> 风格库的每个风格都增加一个人物排版页，推到出来

逐条问过、已确认的判断：

- **新增一个页类型**（现在 11 种 → 12 种）
- **模型在人像位写标记，填图时按标记取**
- **跑一遍「补齐」**，把每个风格的样机真的出出来

## 现状

### 人像位的机制全都在，就是没有消费方

这条最值得先说清楚，因为它决定了这次要写多少代码。抠图那条链路**已经完整**：

| 环节 | 位置 | 做了什么 |
|---|---|---|
| 标记 | `ir-schema/src/html-doc.ts:34` | `StockImage.cutout?: boolean` |
| 落属性 | `html-doc.ts:124-126` `markCutout` | 抠图落位时给 `<img>` 加 `data-lumen-cutout="1"` |
| 不裁切 | `html-doc.ts:151` | 注入 `img[data-lumen-cutout="1"] { object-fit: contain !important }` |
| 图来自带 | `stock-library/src/index.ts:99` | `transparent === true` 的图自动 `img.cutout = true` |

**缺的只是「谁去取那 59 张人物图」**：`stockPhotosFor` 里有一行明确的排除（`index.ts:150`），
注释写着理由——

> **人物不参与**：那 59 张是透明底抠图，落进 16:9 的图位会按 `object-fit: contain`
> 缩成完整可见——页面正中悬着一个人，既不像配图也不像插画。

所以没有任何页类型用得上这套机制。**而图库页已经对用户承诺了它**：

> 人物是透明底抠图，不参与自动配图——它们是留给**人像位**与人工选图用的。
> ——`apps/web/src/pages/StyleLibrary.tsx:74-75`、`StockLibrary.tsx:74-75`

「人像位」在注释与界面上被提了两处，而它不存在。这次就是把它补上。

### 素材

`STOCK_PHOTOS` 共 87 张，其中**人物 59 张**，全部 `transparent: true`（所以落位必带 `cutout`），
`kind` 全是 `people`，tone 分布 dark 37 / light 22，每张带 `palette` 与 `tags`
（「行走」「女」「非洲」「人物」「透明底」）。

### 补齐流程会自动接上

`missingPageTypes(doc) = PAGE_TYPE_ORDER.filter((t) => !doc.pagePrompts[t])`
（`ir-schema/src/style-doc.ts:227`）。所以**往 `PAGE_TYPE_ORDER` 里加一个页类型，
每个已存风格立刻变成「缺这一类」**，`fill-missing.service.ts` 那条现成的流程会：
照着已有几条推导提示词 → 逐类出样机。**「给每个风格补一条提示词 + 出样机」不用新写代码。**

## 契约

### 一、新页类型

`packages/ir-schema/src/style-doc.ts`：

```ts
// PageType 枚举（page.ts:14）加 'people'
export const PAGE_TYPE_ORDER: PageType[] = [
  'cover', 'toc', 'section', 'text', 'imageText', 'gallery',
  'people',        // ← 加在这里
  'metrics', 'chart', 'architecture', 'mindMap', 'end',
];

PAGE_TYPE_LABEL 加 people: '人物页'
```

**插在 `gallery` 之后，不是插在最前。** `fill-missing.service.ts:66` 拿 `PAGE_TYPE_ORDER`
的**前三条**当 few-shot（`derivePrompts` 只用前三条），把新类型插在前面会改掉所有已存风格的
推导输入——那是没人要求的行为变化。放在 `gallery` 后面语义上也顺（两类都是图多的页）。

### 二、模型怎么表达「这里要一个人」

`packages/server-core/src/services/page-prompt-kit.ts` 里有两处共用的图位说明
（`:95` 与 `:127`），各补一句：

```
- 人像位（团队/讲者/人物风采）写成 <img data-lumen-image="1" data-lumen-cutout="1">，
  编号与普通图片位共用同一个序列；系统会往这一格放人物抠图，并按 contain 摆放不裁切
```

**为什么复用 `data-lumen-cutout` 而不新开一个属性**：那个属性已经存在、`fillImageSlots`
已经在读它、`buildPageDocument` 已经为它注入了 `contain` 规则。新开一个 `data-lumen-people`
只会多出一处要同步的定义，而两者语义是同一个——「这一格是抠图，别裁」。

### 三、填图时按标记取

**这是这次真正的代码改动**，而且只落在 `packages/stock-library/src/index.ts` 一个文件里
（另两处改动是枚举与提示词文案，见第一节与第二节）。

`stockImagesFor(fragment, pal)` 与 `allocateStockImages(fragments, pal)` **签名一个字不改**，
只是内部多扫一件事：这一格有没有 `data-lumen-cutout` 标记。

- **有标记** → 从人物池取（59 张，同样按 `paletteDistance` 排序、同样先避重 `kind`）
- **没有** → 从现有池子取（现在的行为，人物仍然排除在外）

两个池子各自内部不重复，同一个人物不在同一页里出现两次。

**返回的数组必须按图片下标排**：`fillImageSlots` 的 `take(want)` 不是简单地取
`images[want - 1]`，而是**从声明的下标往后找第一个没用过的、找到头绕回前面**
（`html-doc.ts:93-104`）——模型在图片排版页上常把几个图位都写成同一个下标
（`html-doc.ts:56` 记着实测过的五连 "1"），那时它会顺延。所以配图这一侧要
**复刻同一套顺延**（`takeSlot`），否则标记与图片会对不上：人像位拿到普通照片、
普通位拿到抠图，页面上不报错、只是版式不对。`html-doc.ts:60` 已经写下这条规矩
（「这条规则必须与 fillImageSlots 的取图规则一致」），实现里照它复刻并加用例钉住。

**为什么改在这两个函数内部、而不是新加一个入口**：这两个函数本来就收到 fragment，
它们自己就能看见标记。改内部意味着**零调用点改动**——`HtmlMock`（编辑器 / 演示 / 项目库封面）、
`worker` 的导出链路、`admin` 的风格库样机、风格库与工作台的各处 `useMockImages`，
全都自动生效。新加一个入口就要把上面每一个调用点都找出来改一遍，漏一个就是
「编辑器里有人物、导出的 PDF 里没有」这种最难查的不一致。

实现上把 `stockPhotosFor` 里那段「按池子挑」抽成内部函数（排序 → 先避重 kind → 兜底回绕），
两处共用。那段逻辑一个字不改，只是池子变成参数。

**人物池取空时回退到普通池**，不留下空槽——空槽渲染出来是破图图标，比给一张不贴题的图难看。

### 四、样机

不加代码。跑现成的「补齐」：每套风格推导一条 `people` 提示词 + 出一张样机。
样机由模型产出 HTML，渲染时经 `useMockImages` → `allocateStockImages` → 走第三节的新逻辑，
所以样机上的人像位里是**真的人物抠图**。

## 不做

- 不做「按页类型整页填人物」（那是问过的另一个选项，用户选了按标记取）
- 不做人物图的题材/性别/姿态筛选（图库有 tags，但这次不做检索界面）
- 不动 `stockPhotosFor` 对人物的排除——**那条排除是对的**，普通图位仍然不该拿到抠图
- 不给 `people` 页类型做单独的样机模板；它和别的页类型一样由模型写

## 验证

1. `pnpm -r typecheck`、`pnpm -r test`、`pnpm build` 全过
   （注意：`pnpm -r test` 不跑 `apps/web`，web 的测试要用根目录的 `pnpm test`）
2. 单测（`packages/stock-library`）：
   - 带 `data-lumen-cutout` 的图位取到的是人物图，且 `cutout === true`
   - **同一页里没标记的图位仍然拿不到人物图**（那条排除没被这次改动破坏）
   - 一页里既有普通图位又有人像位时，两者取到的是不同的图、且不重复
   - 人物池取空时回退到普通池，不返回 `undefined`
3. 单测（`packages/ir-schema`）：`PAGE_TYPE_ORDER` 含 `people`；`missingPageTypes`
   对一套只有旧 11 类的风格会回 `['people']`
4. 浏览器实测：
   - 风格库每套风格多出「人物页」一张样机，**样机里能看到真的人物抠图**（不是破图、不是普通照片）
   - 抠图没有被裁切（`contain` 生效）
   - 工作台里用这套风格生成一页人物页，页面上人物正常
5. 回归：其余 11 个页类型的样机不受影响（`stockPhotosFor` 的行为没变）
