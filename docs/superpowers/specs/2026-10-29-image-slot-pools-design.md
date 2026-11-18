# 图位分池：抠图位、物件池，与「封面那片落叶」

## 起因

用户报：**暖调纸感编辑风的封面，配图用的是抠图**。

查下来是反的——封面拿到的是 `texture-1.jpg`（一张沙地脚印照片），**不是**抠图。真正的
问题是三层叠在一起：

1. **这套风格的封面参考设计里，主图位是一片斜置的落叶。** 提示词原文：
   「中部主图位：一片斜置的落叶图位 `<img data-lumen-image="1">`，宽度约画布 40%、
   高度约画布 78%，`object-fit: contain`；水平居中、垂直定位在画布顶部往下约 4% 处，
   整体 `transform: rotate(-28deg)`」。
   `contain` + 定宽高框 + 旋转，是**透明底主体**的写法；照片这么写会被压出黑边。

2. **提示词里没有 `data-lumen-cutout="1"`。** 渲染层只认这个显式标记，认不出来，
   于是按普通照片配图。一张 16:9 的照片被 `contain` 塞进 40%×78% 的框里、再转 -28°，
   在版面上就是一块歪方形——用户看到的就是这个。

3. **抠图池里只有人像。** 59 张 `people-*.png` 全是透明底人像，没有落叶、纸、几何体
   这类物件。所以就算让渲染层认出「这是抠图位」，封面上出现的也会是**一个人**，
   而不是那片落叶。

## 一、让「抠图位」被认出来

判据现在只有一条：`data-lumen-cutout="1"`。补两条，**两侧都要改**——
`packages/stock-library/src/index.ts` 的 `cutoutSlotsOf`（挑图用）与
`packages/ir-schema/src/html-doc.ts` 的 `fillImageSlots`（落图用）必须一致，
这条规矩在 `html-doc.ts:60` 已经写死了。

### 1.1 提示词侧（治本）

> **这一节已被实现取代，措辞不要照抄。** 实际落地的是
> [2026-10-29-transparent-image-generation-design.md](2026-10-29-transparent-image-generation-design.md) §2.1
> ——条件写在**语义层**（「要的是透明底的主体图」），不是下面这个**症状层**的写法。
>
> 下面这条照抄会出 bug：人物页骨架的人像位写 `data-lumen-cutout="1"` 但样式里**没有**
> `contain`（骨架刻意用容器裁切），按症状写的话它落进「其余图位」，系统消息叫模型别标、
> 用户消息里的骨架又叫它标，模型听系统消息就会把标记摘掉、人像位退回普通照片池。
>
> 渲染侧的 §1.2 仍然有效（从 `contain` 推断是给存量页面兜底的）。

`generate-html.service.ts` 的 `PAGE_SYSTEM` 加一条：

> 图位的样式里写了 `object-fit: contain`（也就是这张图不该被裁切、要完整看见）时，
> 标签要写成 `<img data-lumen-image="n" data-lumen-cutout="1">`。

让模型显式写出意图，渲染层照旧只认这一个标记。

### 1.2 渲染侧（救存量）

图位的样式里出现 `object-fit: contain` 时，也当抠图位。

**这一条是给存量页面的**：这套风格的提示词里已经写了 `contain`，所以
**不用重新识别、不用重新生成，封面当场就变**。判据只看该图位自己写的样式
（内联 `style` 与该 `class` 的规则都算），不看整页。

为什么这条推断是安全的：仓库里那条注释已经写下过事实——「模型给图位写的样式多半是
照片的写法（`object-fit: cover` 配一个定宽定高的框）」。`contain` 是少数派，
且照片写 `contain` 只会把自己压出黑边，模型不会无缘无故这么写。

## 二、抠图分池：人像 / 物件

清单里已经有两层，各管一头（`stock-library/src/index.ts:38-86`）：`kind` 是**题材**
（abstract / architecture / nature / city / texture / tech / people，给挑图岔题材用），
`transparent` 是**给渲染用的**透明底标记。`stockImageOf` 只读 `transparent`，
不看文件名也不看类别。所以这次**不新增类别**，只新增题材：

```ts
STOCK_KIND_ORDER = [..., 'object']    // 题材：物件
```

新素材写成 `kind: 'object'` + `transparent: true`。

### 2.1 先修一处会被这次改动踩响的地方

`REGULAR_POOL` 现在是 `kind !== 'people'`（`index.ts:157`）。这条判据之所以一直没出事，
是因为**恰好只有人像是透明底**。加了物件抠图之后，它们会掉进普通池，
被当成照片配到 16:9 的图位上——`object-fit: contain` 一缩，页面正中浮一片落叶。

所以把它改成 `!p.transparent`，并把那条注释里的事实（「透明底抠图不参与自动配图」）
写成判据本身，而不是靠 kind 间接表达。

### 2.2 池子怎么分

| 池子 | 取法 |
|---|---|
| 普通池 | `!transparent`（28 张，不变） |
| 人像池 | `kind === 'people' && !PEOPLE_PORTRAIT_EXCLUDED`（47 张，不变） |
| 物件池 | `kind === 'object' && transparent`（新增） |

抠图位按**页类型**分池：

| 页类型 | 抠图位取自 |
|---|---|
| `people` | 人像池 |
| `cover` / `end` / 其它 | 物件池 |

这要改 `stockImagesFor` 的签名，把 `pageType` 传进来——它现在只看片段，不知道自己在哪一页。
调用点两处：`HtmlMock.tsx`（已拿到 `pageType`）与 `allocateStockImages`（一组片段，
要一并收 `pageTypes`）。

**池子空了怎么办**：物件池为空时退回人像池，人像池也为空时退回普通池。
留一个空槽渲染出来是破图图标，比给一张不贴题的图难看。

## 三、生成物件抠图

新脚本 `packages/stock-library/scripts/generate-objects.ts`：

```
调图像模型（纯色底：纯白）→ 本地抠底 → 归一化 → 落 assets/ + manifest.json
```

- **纯色底而不是要 alpha**：供应商的 `imageExtraParams` 管理后台没有这个字段（DB 里是空的），
  填不进去；而且那个中转商支不支持 `background: transparent` 也没验证过。本地抠底不依赖它。
- **抠底**：从四边向内的 flood fill + 颜色容差，边缘做一圈羽化（alpha 渐变），
  避免锯齿。仓库里已有从零写的 PNG 编解码器（`normalize-people.ts`），复用它。
- **归一化**：与 `normalize-people.ts` 同一套目标——主体顶端落在画布 15%、
  高度占 74%，这样任意一张抠图放进任意一个图位都不会忽大忽小。
- **清单字段**：每张要写 `kind: 'object'`、`transparent: true`，以及 `tone` /
  `palette` / `tags`——`palette` 是挑图排序的依据（`paletteDistance`），
  不写就永远排最后。`palette` 从**抠底之后的实际像素**取样，不是原图。
- **首批物件**：落叶、纸张/信笺、几何体、印章、信封。每个 2–3 张，共约 10–15 张。
- **产物与脚本一起进版本库**：素材是内容，不是构建产物；脚本可重跑，但重跑要花钱。

## 四、验证

1. `pnpm test`、`pnpm -r typecheck`、`pnpm build` 全过。
2. 单测：
   - `cutoutSlotsOf` 与 `fillImageSlots` 对同一份片段给出一致的判断（含 `contain` 那一条）；
   - 只有 `object-fit: cover` 的图位**不**被判成抠图位（防误伤）；
   - 页类型 → 池子的选择，含「物件池空时退回人像池」；
   - **透明底图一张都不进普通池**——加了物件抠图之后，这是最容易悄悄坏掉的一条。
3. **真浏览器实测**：渲染这套风格的封面，确认落叶类抠图完整浮在版面上、没有被裁切；
   再渲染一张人物页，确认它仍然取人像池。旧代码当对照组。

## 不做

- 不做「按页现生成抠图」（每页多一次模型调用，这一轮不走）。
- 不动识别链路（不从参考图里提取「这是抠图位」）。存量风格靠 1.2 的推断兜住，
  将来重新识别的风格靠 1.1 的提示词写对。
- 不做图像模型的透明底参数（供应商配置那一层）。
