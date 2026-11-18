# 透明底配图：删掉抠图，生图时直接出

## 起因

用户报「抠图需要优化，识别主体抠图」。查下来是**整条路走错了**。

现有的「抠图」是本地算法：从四条边向内 flood fill，只对**背景接近纯色**的图有效。它对
一张沙地照片无能为力——背景有层次，键不掉；勉强键掉一半，剩下的是几千个碎点。所以
`cutout.ts` 里那条 `SOLID_SUBJECT_MIN` 判据会让它**如实拒绝**。这个行为是对的，但用户
要的是能抠出来，不是被拒绝。

用户指出：**图片模型可以直接出透明底**。第一次验证时我测的是现网配的
`gpt-image-2.5-sunburst`，拿到的是 `ct=2`（RGB，无 alpha）的 PNG，模型还把「透明」
**画成了棋盘格**——据此我下了「这个网关出不了透明底」的结论。**这个结论是错的**：同一家
的 `-official` 变体出得干干净净。

实测（同一句提示词，`background: "transparent"` + `output_format: "png"`）：

| 模型 | 耗时 | alpha 直方图 | 结果 |
|---|---|---|---|
| `gpt-image-2.5-sunburst` | 40s | 无 alpha 通道（ct=2） | 棋盘格被画进像素 |
| `gpt-image-2-official` | 39s | 75.0% 全透明 / 0.2% 过渡 / 24.5% 不透明 | 干净蒙版 |
| `gpt-image-2.5-sunburst-official` | 55s | 70.7% 全透明 / 0.3% 过渡 / 29.0% 不透明 | 干净蒙版 |

对照组：同一句提示词**不带** `background` 参数，`sunburst` 照样画棋盘格——说明那个参数在
非官方变体上是**空操作**，不是「参数传错了」。

蒙版质量对比：模型直接给的过渡带只占 0.2%，而本地算法抠出来的边缘留着一圈**白边**
（背景色残留）。所以这一版**不修本地抠图，直接删掉**。

## 一、删掉抠图

删 `apps/web/src/workbench/cutout.ts`、`cutout.test.ts`、「抠图」按钮、
`keyOutImageToDataUrl`，以及 P2 那条「上传抠好的图」的链路。

`ImageSlotOverride.cutout` 字段**留着**——它现在只管两件事：

1. 渲染成 `object-fit: contain`（`IMAGE_SLOT_CSS`，本来就有）；
2. 自动配图时从透明底池取（`stock-library` 的 `cutoutSlotsOf`，本来就有）。

## 二、透明底图位怎么认出来

「这个图位要透明底」是**模板里标的**，判据两条，两侧都要改——`stock-library/src/index.ts`
的 `cutoutSlotsOf`（挑图用）与 `ir-schema/src/html-doc.ts` 的 `fillImageSlots`（落图用）
必须一致，这条规矩在 `html-doc.ts:60` 已经写死了。

### 2.1 提示词侧（治本）

`generate-html.service.ts` 的 `PAGE_SYSTEM` 加一条：

> 图位要的是**透明底的主体图**时（画面里一个独立的主体，背景要能透出去；人物页的人像位
> 也算这一类），标签要写成 `<img data-lumen-image="n" data-lumen-cutout="1">`；
> 骨架或示例里已经这么写了的照抄，不要摘掉；其余图位按普通照片写，不要加这个标记。

**条件必须写在语义层（「要透明底的主体图」），不能写在症状层（「样式里写了 `contain`」）。**
这是实现时被代码质量审查揪出来的：人物页骨架里的人像位写的是 `data-lumen-cutout="1"`，
但样式里**没有** `contain`（骨架刻意用容器裁切——`.person{overflow:hidden}` 配
`.person img{width:350%;margin:-35% 0 0 -125%}`）。按症状写的话，人像位恰好落进「其余图位」，
系统消息叫模型别标、用户消息里的骨架又叫它标；模型听了系统消息把标记摘了，人像位就会
退回普通照片池。**「要透明底」与「不被裁切」不是一回事**，人像位正是「要透明底、却被
容器裁」的那一类。

让模型显式写出意图，渲染层照旧只认这一个标记。

### 2.2 渲染侧（救存量）

图位自己的样式里出现 `object-fit: contain` 时，也当抠图位。

**这一条是给存量页面的**。实测暖调纸感那套风格的封面，那个图位长这样：

```html
<img class="leaf" data-lumen-image="1" alt="">
```

而 `object-fit: contain` 写在页面自己那段 `<style>` 里：

```css
.leaf { position:absolute; z-index:1; display:block; width:768px; height:842px;
        top:43px; left:50%; margin-left:-384px; object-fit: contain }
```

所以判据要能看见 **class 规则**，不能只看内联 `style`。但**不做完整的 CSS 级联**：

| 看 | 不看 |
|---|---|
| 该标签自己的内联 `style` | 后代选择器（`.hero img`） |
| 该标签**自己带的** class 在页面 `<style>` 里的规则 | 标签选择器（`img`）、`!important`、优先级计算 |

理由是**两类错误的代价不对称**：漏判只会让这个图位维持现状（当普通照片配图），
而误判会把一张普通照片的图位当成抠图位、从透明池里塞一张不贴题的图进去。所以宁可漏。

`object-fit` 取值只看最后一条生效的声明（同一选择器里写了两条时，后者赢——这是 CSS 里
唯一一条不用算优先级就确定的部分）。

为什么这条推断是安全的：仓库里那条注释已经写下过事实——「模型给图位写的样式多半是照片
的写法（`object-fit: cover` 配一个定宽定高的框）」。`contain` 是少数派，且照片写 `contain`
只会把自己压出黑边，模型不会无缘无故这么写。

### 2.3 要接受的代价

推断一开，存量那本 30 页的书里封面会被认成抠图位，然后从透明底池取图——**而池子里现在
只有 59 张人像**。于是封面那片落叶的位置上会浮出**一个人**。

这是接受的：歪方块是「看起来坏了」，人像是「主体不对但排版是对的」，而且面板上会明说这
一位要透明底配图、给生成入口，点一下 40 秒就换掉。补物件素材是「图位分池」那份规格的事，
这一轮不做。

## 三、生图时出透明底

「重新生成」的行为**由图位性质决定**，一个代码路径，按钮文案跟着变：

| 图位 | 按钮 | 请求 | 结果 |
|---|---|---|---|
| 标注过的 | 生成透明底版本 | 带 `background: "transparent"` + `output_format: "png"` | 真透明底 PNG |
| 未标注的 | 重新生成 | 现在这套 | 普通照片 |

不留两个用户分不清的按钮。

### 3.1 参数必须按请求给，不能按供应商配

`provider.ts` 的 `imageExtraParams` 是**按供应商**的固定附加参数，由 `#imageParams`
合并进每个请求体。把 `background` 写进去等于让**所有**生图都变透明——普通照片图位也会
遭殃。

所以 `ImageRequest` 加一个按请求的字段：

```ts
/** 透明底。不传就是供应商默认（普通照片） */
background?: 'transparent';
```

`openai.ts` 的 `#imageParams` 把它翻译进请求体，**排在 `imageExtraParams` 之前**——
后者是管理员显式写的覆盖，应该赢：

```ts
const bg = req.background === 'transparent'
  // 透明底必须是 PNG：JPEG 存不了 alpha，别的格式会被服务端压成不带 alpha 的
  ? { background: 'transparent', output_format: 'png' }
  : {};
return { size, resolution, ...bg, ...extra };
```

**为什么没有 `'opaque'`。** 早先这一版写的是 `'transparent' | 'opaque'`，理由是「管理员若在
`imageExtraParams` 里固定了透明底，普通照片图位得能把它按回去」。这条理由与上面那句
「`imageExtraParams` 应该赢」**直接冲突**——`extra` 展开在 `bg` 之后，管理员固定什么就是
什么，`'opaque'` 按不回去。而且这一版的路由对非抠图位**根本不发** `background`，所以
`'opaque'` 既没有调用方、也达不到文档写的目的。

两句话只能留一句。留「`imageExtraParams` 应该赢」——它是这个字段本来的定位（给管理员留的
供应商级逃生舱），而且实现更简单。代价是：管理员若真把 `background: transparent` 固定成
全局配置，普通照片图位也会变透明。那是**误配**，不是我们能替他判断的事；真需要按图位区分，
就把他那句配置撤掉。

### 3.2 谁决定这个图位是不是抠图位

**由面板算好传给路由**（`GET /pages/:pageId/image/stream?...&cutout=1`）。

面板手里那份 `imageSlotsOf` 的结果就是**有效值**——它已经把用户的 `cutout: false` 覆盖算
进去了。服务端要自己算的话，得把风格文档、色板、素材库都拉进来重跑一遍同一套规则，而
结果未必与面板显示的一致（那种错不报错，只是「面板写着 A、生成的是 B」）。提示词本来
就是客户端传的，`cutout` 跟着它一起传是同一种信任级别。

## 四、不假装成功

换了模型配置、或者将来换了中转商，`background: "transparent"` 都可能被**静默忽略**——
产出是一张没有 alpha 的普通图（`sunburst` 就是这么干的，而且它画的是棋盘格）。用户拿到
一张格子图却看到「已生成」，比报错更糟。

所以存图前**看一眼 PNG 的 IHDR**：色彩类型在**从 0 数起的第 25 个字节**（8 字节签名 +
4 字节块长 + 4 字节 `IHDR` + 4 字节宽 + 4 字节高 + 1 字节位深）。只读开头 26 个字节就够，
不用整张解码。

| 色彩类型 | 有 alpha？ |
|---|---|
| 0（灰度）、2（RGB） | **没有** |
| 4（灰度+alpha）、6（RGBA） | 有 |
| 3（调色板） | 可能靠 `tRNS` 带透明，当它有 |

判出没有 alpha 时，**如实报错**：「这个模型没给出透明底，检查图片供应商的模型配置」，
而不是把图存下来。

## 五、供应商配置要改（不做这一步，功能就是空的）

现网图片路由的模型是 `gpt-image-2.5-sunburst`，它不会出 alpha，而且失败是静默的。要换成
官方变体（`gpt-image-2-official` 或 `gpt-image-2.5-sunburst-official`）。

这属于管理后台的配置，**价格要另行核对**：`providers.pricing.perImage` 记的是供应商级别的
定价字段，换模型不跟着变，中转商实际怎么算代码这边看不到。

## 六、验证

1. `pnpm test`、`pnpm -r typecheck`、`pnpm build` 全过。
2. 单测：
   - `#imageParams` 在传 / 不传 `background` 时拼出的请求体（含 `output_format` 只在透明
     时才带）；`imageExtraParams` 能压过它；**两条尺寸方言（`pixels` 与 `ratio`）各自
     都要验**——它们是两条 return，只测一条的话另一条被改坏不会红；
   - IHDR 探测：ct=2 / ct=0 判成没有 alpha，ct=6 / ct=4 判成有；
   - `cutoutSlotsOf` 与 `fillImageSlots` 对同一份片段给出一致的判断（含 `contain` 那条）；
   - **class 规则那条**：用实测到的封面片段当用例——`<img class="leaf">` 配
     `.leaf { object-fit: contain }` 要判成抠图位；
   - 只有 `object-fit: cover` 的图位**不**被判成抠图位（防误伤）；
   - 后代选择器（`.hero img { object-fit: cover }`）**不**参与判断——宁可漏，不可误判。
3. **真浏览器实测**：标注过的图位点「生成透明底版本」→ 画布上主体完整浮着、边缘干净、
   `data-lumen-cutout` 在、`object-fit: contain` 生效；未标注的图位仍出普通照片。
4. **反向实测**：把模型临时换回非官方变体，确认界面**如实报错**，而不是静默出一张棋盘格。
5. **对照组**：旧代码（本地抠图那一版）当对照。

## 不做

- 不修本地抠图算法（白边那件事）——整个删掉，不修。
- 不补物件抠图素材、不改 `REGULAR_POOL`（那是「图位分池」那份规格的事）。
- 不做「按页批量出透明底」（每页多一次模型调用，这一轮不走）。
- 不改识别链路（不从参考图里提取「这是抠图位」）。存量风格靠 2.2 的推断兜住，将来重新
  识别的风格靠 2.1 的提示词写对。
- 不动 iframe 的 `sandbox`。
