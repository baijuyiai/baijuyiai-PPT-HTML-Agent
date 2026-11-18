# 项目品牌 logo · 设计

2026-10-26

## 背景

用户的原话：

> 在项目需求模块，左侧需要可以上传品牌logo，可选，然后上传的图片如果有，需要先处理成
> CSS/SVG重绘稿，然后用于PPT项目内。

已经确认的判断（逐条问过）：

- **只换页眉那枚角标**，封面、结尾页这次不动
- **颜色自动判断**：彩色 logo 保留原色，纯黑白的才染成这套风格的 `--brand` 色
- **品牌名与标语一起填**，两个可选输入框；没填的那一项删掉，不留「品牌名称占位」这种假字
- **上传就自动重绘**，等十几秒出预览，原图与重绘稿并排比对，可「重绘一次」「确认使用」
- **logo 与风格规范冲突时听用户的**：传了就放，规范只在尺寸和位置上说话

## 现状

### 页眉的品牌标识现在是假的

页眉那枚方块和「品牌名称占位」都不是真东西，两层都是编的：

- 风格规范（`StyleSpec.header.kind`，`packages/ir-schema/src/style-spec.ts:37`）只规定形态是
  `bar` / `block` / `wordmark` / `none` 之一，外加尺寸与颜色；
- `specBlock` 把这条翻成一句人话（`「一枚圆角方块」`，`style-spec.ts:139`）发给模型；
- 模型照着画一个占位图形，品牌名与标语它自己编了「品牌名称占位」「BRAND TAGLINE PLACEHOLDER」。

实测第 15 页（`prj_2w89s64ubj`）的页眉：

```html
<div class="brand-mark"><span class="brand-mark-line"></span><span class="brand-mark-line"></span></div>
<span class="brand-name">品牌名称占位</span>
<span class="brand-sub">BRAND TAGLINE PLACEHOLDER</span>
```

### 五套风格的页眉分布

| styleId | 名称 | spec | header.kind |
|---|---|---|---|
| `recognized-mvgpvtvx` | 暖调纸感编辑风 | 无 | — |
| `recognized-mvgqcw9p` | 深色紫调数据面板 | 无 | — |
| `recognized-mvgtbsnm` | 蔚蓝科技商务风 | 有 | `block` 34px / 高 88px |
| `recognized-mvgw7dz4` | 蓝绿渐变科技风 | 有 | `bar` 24px / 高 64px |
| `recognized-mvgxpy95` | 深蓝渐变商务风 | 有 | `wordmark` 20px / 高 32px |

三套有规范、两套没有；`none` 目前没出现但是合法取值。`wordmark` 那套明确写着
「只有一行文字，不加图形」——按已确认的判断，用户传了 logo 就照放。

### 导出侧天然支持

`apps/worker/src/handlers/export-pptx.tsx:294` 是**把每页在 Playwright 里渲染后整页截图**
再贴成一张图；`pptx-editable` 那条也先截一张无文字的背景图。logo 无论以什么形态进页面，
最后都只是像素，所以 PPTX / PDF / 单文件 HTML 三条路都不用做格式转换。

**但形态本身有安全含义，见下面「logo 一律当图片加载」。**

### logo 一律当图片加载（2026-10-26 修订）

初版设计让重绘稿**以内联 SVG 的形态**进页面，并用 `color: var(--brand)` + `currentColor`
继承来跟着主题色走。安全评审用真 Chromium + 真 SQLite 实测否掉了这条路：内联进 HTML 文档的
SVG 过的是 **HTML 解析器**，不是 XML 解析器。按 HTML 的 foreign content 规则，`<desc>` /
`<title>` 是**集成点**（子标记按 HTML 解析），`<img>` / `<div>` / `<meta>` 这类 start tag 会
**把解析器从 SVG 里弹出来**、变成页面上真正的 HTML 元素。以下 payload 全部通过任何
「拒绝清单」式校验、逐字节落库，并在导出时真的执行或真的发请求：

- `<desc><iframe src="javascript:…"></iframe></desc>` —— 无交互执行 JS；
- `<img src="http&#58;//169.254.169.254/latest/meta-data/">` —— 从**服务器**发起对外请求
  （数值字符引用让原文里不出现 `http://`，正则看不见、浏览器看得见）；
- `<meta http-equiv="refresh" content="0;url=…">` —— 整页被导航走，导出的 PDF/PPTX 拍的是
  攻击者的页面；
- `<svg style="background:\75 rl(…)">` —— `\75 rl(` 是 `url(` 的 CSS 转义写法。

**这不是「再补几条规则」能修的**：正则看的是原文，浏览器看的是重新解析后的结果，中间隔着
实体解码、空白规范化、CSS 转义一整个规范化层。

改成构造上免疫：logo 在所有落点都走 `<img src="data:image/svg+xml;charset=utf-8,…">`。
浏览器把这份稿当**静态图片**加载时，脚本不执行、外部子资源一律不加载、也跳不出成 HTML 标记
（实测 22 条 payload 在这个形态下零执行、零请求）。代价是图片里的 SVG 继承不到外面的 CSS，
所以单色稿的 `currentColor` 在**渲染时**烘成 `palette.brand`（`html-doc.ts` 的 `colorizeSvg`）。

**这条边界必须一直守住**：`validateLogoSvg` 只是初筛，不是安全闸门。任何把它改回内联、
或给 logo 单开一个内联落点的改动，都等于把上面那三类 payload 重新放进来。

## 目标链路

```
左栏上传原图 ──► POST /uploads 落对象存储
                      │
                      ▼
              logo_redraw（视觉模型）──► 校验 ──► brandLogoSvg 落库
                      │                              │
                      ▼                              │
              面板：原图 → 重绘稿并排比对              │
                 「重绘一次」「确认使用」「就用原图」     │
                                                     │
  生成页面（模型写 HTML，页眉留空槽位）                 │
                      │                              │
                      ▼                              ▼
       buildPageDocument：把 data-lumen-brand 槽位填成真 logo / 品牌名 / 标语
                      │
                      ▼
        编辑器 iframe / 演示 / PPTX / PDF / 单文件 HTML
```

**关键点：logo 是渲染时注入的，不是提示词里塞给模型的。** 见「三、槽位协议」。

## 契约

### 一、数据模型

迁移 `packages/server-core/src/db/migrations/009_project_brand.sql`，照 005–008 的写法：

```sql
ALTER TABLE projects ADD COLUMN brandLogoImage TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN brandLogoSvg TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN brandLogoMode TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN brandName TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN brandTagline TEXT NOT NULL DEFAULT '';
```

| 列 | 含义 |
|---|---|
| `brandLogoImage` | 上传原图的对象 key。留着重新重绘、以及「就用原图」 |
| `brandLogoSvg` | 重绘稿的 SVG **源码** |
| `brandLogoMode` | `''`（没有 logo）/ `'redraw'` / `'original'` |
| `brandName` | 品牌名，空串表示没填 |
| `brandTagline` | 标语，空串表示没填 |

**存 SVG 源码而不是对象 key**：`buildPageDocument` 是同步函数，取不了远端对象；SVG 几 KB，
一行装得下。

`ProjectRow` 与 `updateProject` 的 `Pick` 同步扩这五列（`project.service.ts`）。

### 二、重绘服务

新文件 `packages/server-core/src/services/brand-logo.service.ts`：

```ts
export async function redrawLogo(input: {
  tenantId: string; userId: string; projectId: string;
  /** /uploads 返回的对象 key */
  imageKey: string;
  gateway?: ProviderGateway;   // 演示用的注入点，测试里换成假网关
}): Promise<{ svg: string }>;
```

流程：读对象存储里的原图 → 转 data URL → 视觉模型 → 校验 → 写
`brandLogoImage` / `brandLogoSvg` / `brandLogoMode='redraw'`。

**读图在写库之前。** 顺序反过来的话，`imageKey` 读不出对象时（对象过期被清、key 是客户端
乱传的）库里会留下「一个读不出来的原图 key + 一份刚被清掉的旧稿」：上一份能用的稿没了、
新原图又是破图。按这个顺序，读失败就整个不动库。

原图转 data URL 照 `apps/api/src/routes/styles.ts:268` 的 `resolveImages` 做（同一套
`/files/<key>` 约定、同一张 MIME 表）。

**新任务类型 `logo_redraw`**：

- `packages/ir-schema/src/provider.ts:138` 的 `TaskType` 加一项，`:150` 的 `TASK_TYPE_LABEL`
  加「品牌重绘」
- `packages/server-core/src/services/seed.service.ts:19` 的 `ROUTE_DEFAULTS` 加一行
- **不加进** `DEFAULT_LOCKED_ROUTES`（`provider.ts:183`）

模型输出 JSON：

```json
{ "svg": "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 100 100\">…</svg>" }
```

- **根标签必须带 `xmlns="http://www.w3.org/2000/svg"`。** 稿是以
  `<img src="data:image/svg+xml,…">` 加载的，这条路上浏览器按 **XML** 解析它：根元素不在
  SVG 命名空间里就不是 SVG，**整张图加载失败**（实测：不带 → `onerror`、`naturalWidth === 0`；
  补上 → 正常画出来）。而且失败时接口不报错、日志没有异常，用户只看到「重绘成功」加一个空页眉。
  **代码里也会补（`ensureXmlns`），不让模型漏一次就静默坏一页**——与图位那条「不让模型写 src」
  同一个道理；提示词里写上只是多一道。
- **单色稿的填充一律用 `currentColor`**（原图是彩色就用字面色值）。渲染成图片时
  `currentColor` 会被烘成这套风格的 `palette.brand`，所以 logo 跟着品牌色走。
  `palette.brand` 是**没有格式校验的裸字符串**（`style-doc.ts:124-142`），而它要被拼进 SVG 源码，
  所以渲染时过一道 `safeColor`：认不出是颜色就退回黑色（`var(--brand)` 会让颜色变成黑的、
  `#06c<b` 会让整张图加载失败，两种都不报错）。
- 去掉白底：重绘本身就只描形状，不画背景
- **不再有 `mono` 字段。** 初版设计里有，但没有任何消费方——单色与否由「稿里有没有出现
  `currentColor`」直接决定，不必让模型说、也不必落库

**校验（`validateLogoSvg`，不过就不落库）**：

- 必须含 `<svg` 且含 `viewBox`
- 至少有一条 `path` / `rect` / `circle` / `ellipse` / `polygon` / `line`
- **拒绝清单**：`<script`、`<style`、`<image`、`<foreignObject`、`href=`、`xlink:`、`url(`、
  `@import`、`image-set(`、`on*=`、非 w3.org 的 `http(s)` 地址
- 长度上限 40KB

注意：**这份清单是初筛，不是安全边界**（安全边界是「logo 只当图片加载」，见上文）。
别再往里加规则指望它挡住攻击——它挡的是老实的模型输出，以及「明显有毒时给一句人话」。

**抛 `AppError`，不抛裸 `Error`**：`middleware/error.ts` 只把 `AppError` 的报文透给客户端，
裸 `Error` 一律压成 500「服务器内部错误」，这些中文报错就白写了。

**网关自己抛的裸 `Error` 里，只翻「路由没配」这一种**（message 含 `ROUTE_NOT_CONFIGURED`，
是 `router.ts:11` 明写的契约）→ `notConfigured`，让用户知道要去管理后台配模型。其余原样往上抛、
落成 500——`styles.ts:82-85` 那条注释说得对：「把 provider 挂掉说成图读不了是撒谎」。

**路由**（`apps/api/src/routes/projects.ts`）：

| 方法 | 路径 | 说明 |
|---|---|---|
| `POST` | `/api/projects/:id/brand/redraw` | body `{ imageKey }`，同步跑十几秒，返回项目状态。`imageKey` 必须是本项目 `uploads/` 分区里的对象。**由服务端落库，不接受客户端回传的 SVG** |
| `PATCH` | `/api/projects/:id` | 扩 `brandLogoMode` / `brandName` / `brandTagline` 三个可选字段 |
| `DELETE` | `/api/projects/:id/brand` | 清空这五个字段，并写一条 `clear_brand` 审计 |

`redraw` **不回传 `svg`**：这一轮被后一次上传顶掉时，服务端返回的稿并没有落库，放进响应体
会让客户端显示一份不存在的重绘稿。项目状态才是唯一可信的结果。

`DELETE` 的审计动作是**自己的 `clear_brand`**，不借 `delete_project`：清空会把项目行上那五个
指针清掉，同样不可逆（**对象还在磁盘上**——全仓没有 `storage.delete`，`/files` 也不鉴权——
真正不可逆的是「再也找不到它们了」）；借来的动作名会让审计里分不出「删了整本项目」和
「只清了品牌」——`delete_project` 当初正是从 `export` 借来的，那个教训写在 `AuditAction` 的注释里。

清空之后，**已生成页面页眉上的槽位元素会被整个移除**——这要求 `brandOf` 在五列全空时
**仍然返回一个 `BrandSlot`**（见 `brand.ts`）。返回 `undefined` 的话
`if (opts.brand) fillBrandSlots(...)` 根本不会被调用，页眉上会留下 `class="brand-mark"`
这类空壳，模型的 CSS 只要给它写了尺寸或底色就是一个空方块。

**重绘失败时 `brandLogoImage` 保留**——这样面板上的「就用原图」还能用。

### 三、槽位协议

`packages/ir-schema/src/html-doc.ts` 加一类槽位，与现有的 `data-lumen-image` 并列：

```html
<span class="brand-mark" data-lumen-brand="logo"></span>
<span class="brand-name" data-lumen-brand="name"></span>
<span class="brand-sub"  data-lumen-brand="tagline"></span>
```

`data-lumen-brand` 三个取值：`logo` / `name` / `tagline`。

`PageDocumentOptions` 加：

```ts
/** 项目品牌。不传就是「没有品牌」，行为与改动前完全一致 */
brand?: {
  /** 页眉标识：重绘稿，或原图的 src。两个都给时 svg 优先。**渲染时会被转成 `<img>`**，见下 */
  svg?: string;
  imageSrc?: string;
  name: string;
  tagline: string;
};
```

再配一个 `brandOf(project)` 把 `ProjectRow` 按 `brandLogoMode` 翻成上面这个形状，
放在 `packages/server-core`——两个调用点不必各写一遍模式判断。

`buildPageDocument` 在 `fillImageSlots` 之后跑 `fillBrandSlots(fragment, brand, brandColor)`
（`brandColor` 传 `opts.palette.brand`）：

- **只换槽位元素的内容，不换标签**——模型写的 class 与 CSS 都留着，于是尺寸、颜色、
  字距跟着这套风格的规范走，不用我们另写一套。
- `logo` 槽：内容是 **`<img src="data:image/svg+xml;charset=utf-8,…">`**（或
  `<img src="原图">`）。**稿本身绝不内联进文档**——理由见上文「logo 一律当图片加载」。
  单色稿的 `currentColor` 在这一步烘成 `brandColor`，因为图片里的 SVG 继承不到外面的 CSS；
  彩色稿原样带过去。
  **这段 data URL 只允许 `brandLogoDataUrl(svg, brandColor)` 一处构造**（它就是
  「补 xmlns + 烘品牌色 + `safeColor` 兜底」三件事的合集）。页面渲染、导出、面板预览三处都调它——
  手搓第二份一定会漏掉其中某一步，而漏掉任何一步都是静默失效：图片加载不出来、或者颜色不对，
  接口与日志都不说话。
- 槽位落在 `<img>` 这种自闭合标签上时，整个标签换成带同样 class/style 的 `<span>`。
- `name` / `tagline` 槽：内容是纯文本，**要转义**（`escapeHtml` 已有），且**不带任何内联
  颜色**——它们的配色归这套风格的规范管（「深蓝渐变商务风」的品牌名规范色是 muted 而不是
  brand），一条内联样式就会把它盖掉。
- **没有值的槽位整个元素删掉**，不留空壳——与「版面上没有对应内容的槽位直接删掉」同一条规矩。
- 模型漏写槽位就跳过，不报错、不阻断生成。

调用方要把品牌传进来：`apps/worker/src/render.tsx:75`（导出）、
`apps/web/src/components/HtmlMock.tsx:72`（编辑器与演示）。另外两处
（`apps/admin/src/pages/Styles.tsx:279` 风格库样机、`apps/worker/src/bake-legacy-pages.tsx:103`）
没有项目，不传。

### 四、提示词

`generate-html.service.ts` 的提示词装配加一段 `brandBlock`，**只在传了 logo 或填了品牌名/标语
时注入**（都没填就不注入，行为与现在完全一致）：

```
---
这一本有品牌标识，页眉必须按下面来写：

- 标识位置：<span class="brand-mark" data-lumen-brand="logo"></span>
- 品牌名：<span class="brand-name" data-lumen-brand="name"></span>
- 标语：<span class="brand-sub" data-lumen-brand="tagline"></span>

**标识位置不要自己画图形、不要写 <img>、不要填文字**，留空即可，系统会填进去。
品牌名与标语也不要自己编，留空即可。
```

**页眉几何**：

- 规范里有 `header.kind !== 'none'`：用规范的 `sizePx` 与 `heightPx`
- 规范里是 `none`、或这套风格根本没有 spec：按默认几何——**高 88px、标识 34px、
  左右边距 96px**（取自实测里出现最多的「蔚蓝科技商务风」，与 `--pad-side: 96px` 一致）

### 五、界面

`apps/web/src/workbench/LeftRail.tsx` 的 `BriefPanel`，在「深度」下面加一块「品牌」：

| 状态 | 面板里显示 |
|---|---|
| 未上传 | 虚线框「点这里选图，或拖进来」 |
| 重绘中 | 原图缩略图 + 转圈 + 「重绘中…」 |
| 比对确认 | 原图 → 重绘稿并排 + 「重绘一次」「确认使用」 |
| 重绘失败 | 原图缩略图 + 失败原因 + 「重试」「就用原图」 |
| 已确认 | 当前生效的那一版 + 「换一张」「重新重绘」 |

下面两个可选输入框：**品牌名**、**标语**，随 `PATCH /projects/:id` 一起存（与页数、深度同一套
`dirtyRef` 逻辑）。

### 六、降级

- 重绘失败或不满意 → 「就用原图」：`brandLogoMode='original'`，槽位里放
  `<img src="原图">`（可能带白底、放大发虚，如实说明）
- 模型漏写槽位 → 那一页页眉空着，不报错、不阻断整本生成
- 没上传 logo 也没填名字 → 提示词里不带 `brandBlock`，行为与现在完全一致
- `logo_redraw` 路由指向内置 Mock → 校验拦下来（Mock 给不出合法 SVG），面板走失败态

### 七、导出

PPTX / PDF / 单文件 HTML 都是渲染后截图或内联，SVG 天然可用，**不需要额外改动**。
补两条断言把这个前提钉住：

- `apps/worker/src/render.test.ts`：带品牌的项目导出时，srcdoc 里含注入后的 SVG
- 导出稿里不含 `data-lumen-brand`（槽位必须已经填掉，不能漏到成品里）

## 不做

- 不做 logo 的手工编辑器（只给「重绘一次」）
- 不做一套 deck 多个 logo（一个项目一个）
- 不自动重生成已有页面（见下）
- 不做分享页 / favicon / 管理后台的品牌
- 不做 logo 的多主题变体

## 已知代价

**槽位是模型写在 HTML 里的，所以已经生成的页面不会自动带上 logo，得重新生成。**
`prj_2w89s64ubj` 那 15 页就是这种情况——可以只挑想改的几页重生成，不必整本重跑。

## 验证

1. `pnpm -r typecheck`、`pnpm -r test`、`pnpm build` 全过
2. 单测：
   - `brand-logo.service.test.ts`（新建）：假网关下验提示词（含「不要画背景」这条要求）、
     SVG 校验（恶意 SVG 逐条拒收、**每条规则都有一条只命中它自己的用例**）、
     `MAX_SVG_BYTES` 那条约 40KB 的分支、**读不出原图时一个字都不写**、
     **报错抛的是 `AppError`**（否则中间件把报文压成「服务器内部错误」）、
     失败时不落库但保留 `brandLogoImage`
   - `html-doc.test.ts`：槽位替换五种情形（有 logo / 无 logo、有标语 / 无标语、模型漏写槽位）；
     **并且断言成品文档里不出现内联的 `<svg>`**、单色稿的 `currentColor` 已被烘成品牌色
   - `render.test.ts`：导出稿里槽位已填、不留 `data-lumen-brand`、**不留内联 `<svg>`**
3. 浏览器实测：新建项目 → 上传一张带白底的彩色 logo → 看重绘稿 → 确认 → 填品牌名 →
   生成一页 → 页眉是 logo + 真名字；再上传一张黑白 logo，确认被染成品牌色
4. **安全边界实测**：把一段 `on*=` payload 当重绘稿写进库，打开那一页看 `window.__pwned`
   必须是 undefined，同时 logo 仍正常显示
5. 降级实测：把 `logo_redraw` 路由指向 Mock，确认面板报错且「就用原图」可用
6. 回归：没传 logo 的项目，生成结果与改动前逐字一致
