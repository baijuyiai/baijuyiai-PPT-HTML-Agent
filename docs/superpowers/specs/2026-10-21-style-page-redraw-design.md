# 单页提示词重识别与替换 · 设计

2026-10-21

## 背景

风格库里一套风格是「九个页类型各一条 HTML 生成提示词 + 它真跑出来的样机」。
识别一次定终身：某一条提示词写得不合意，只能整套重识别，而重识别会产出一个**新的**
styleId（`slug(name)-时间戳`），旧的那套还在库里，九条提示词里八条是好的也得一起重来。

用户要的是**按页类型改**：在风格库里给已生成的风格加编辑入口，详情弹框里每个页类型
各有一个编辑，点进去上传参考图，重新识别出这一条提示词并重跑样机，确认后永久替换。
**配色与字体跟随原风格**——换的是版式与视觉语言，不是这套风格的调子。

## 现状

已经有的（本次直接复用）：

- `StylePagePrompt` 里**已有 `edited: boolean` 与 `source: 'reference' | 'derived' | 'manual'`**
  两个字段，注释写着「用户改过。重识别时不被覆盖」。但**全仓没有任何地方读过 `edited`**，
  `'manual'` 这个取值也从没被写入过——schema 早就为手工改留了位，只是一直没接上。
- `writePagePrompt(gateway, pageImage, pageType)`：从一页设计稿写出一条提示词。
- `generateMock(gateway, prompt, palette)`：照提示词跑出样机 HTML，带一次重试与 lint。
- `paletteBlock(palette)`：把七个色值明写进生成调用。
- `splitSlides(gateway, imageUrl, img)`：从一张图里找出每一页的归一化裁切框。
- `POST /api/uploads` + 前端的 `uploadReferenceImages()`：压到长边 900px、转 PNG、落盘、返回引用。
- `saveStyleDoc(doc)`：按 styleId upsert。
- `buildPageDocument()` 把 `fontFamily` 注入成 `--font-sans`。

缺的是：把上面这些串成「单页重识别 → 预览 → 替换」这条路的服务与界面。

## 接口

三条新路由，挂在 `/api/styles` 下，都要登录（与现有 `/styles/docs` 一致）。

### `POST /styles/docs/:styleId/pages/:pageType/slides`

body `{ image: string }`（`/uploads` 落盘后的 URL）。分页，并给每一页裁一张缩略图。
约 10~20 秒。

返回：

```json
{ "slides": [{ "index": 0, "pageType": "cover", "box": { "x0": 0.04, "y0": 0.15, "x1": 0.96, "y1": 0.55 } }] }
```

**不返回缩略图**。前端手上已经有用户刚上传的那张图，把 `box` 按百分比画成可点的矩形叠上去就行
（`left: x0*100%` 这一套），比服务端裁一遍再编码成 PNG 传回来省事得多——一张 900px 的稿子
裁出来 base64 动辄几百 KB，四张就是几 MB 的响应体。

### `GET /styles/docs/:styleId/pages/:pageType/recognize-stream?image=…&x0=…&y0=…&x1=…&y1=…`

SSE。按框裁出那一页 → 写提示词 → 出样机。约 40~90 秒
（写提示词约 30 秒，出样机约 50 秒——样机 token 预算 40000，推理会吃掉大半）。

**传裁切框而不是传下标去重新分页**：模型调用不是确定性的，第二次分页可能切出不一样的框，
于是用户挑的那一页与真正识别的那一页对不上——而且这种错配是静默的，只有看图才发现。
框由客户端原样带回来，服务端不再调一次模型，也就没有第二次机会出错。
四个数必须都在 0~1 且 `x1 > x0`、`y1 > y0`，否则 400。

事件：

- `progress` — `{ step: 'crop' | 'read' | 'mock', label, done, total }`。三步各报一次：
  裁页（瞬时）/ 写提示词 / 出样机
- `done` — `{ prompt, mockHtml, issues }`
- `error` — `{ message }`

用 GET 而不是 POST，因为 EventSource 不能发 POST；图片先走 `/uploads`，这里只带引用——
与现有 `/recognize-doc/stream` 的做法一致。

### `PUT /styles/docs/:styleId/pages/:pageType`

body `{ prompt: string, mockHtml: string }`。**永久替换的落点**，毫秒级。

服务端自己读原 doc，**只替换 `pagePrompts[pageType]` 这一格**，其余一律不碰：
palette、fontFamily、name、description、deckPrompt、另外八个页类型、meta 全部原样。
替换后该格的 `source` 变 `'manual'`、`edited` 置真。

**为什么不复用现有的 `POST /styles/docs`**：后者要整个 doc 原样传回来，客户端得先拉全量、
改一格、再回传，中间**任何一个字段丢了都会被静默写掉**。PUT 只传要改的两项，出错面小一个量级。

## 数据流

```
POST /api/uploads                  → 拿到图片 URL
POST …/pages/:t/slides             → 1 张就直接进；多张就把缩略图列出来让用户点
GET  …/pages/:t/recognize-stream   → SSE：正在读参考图 / 正在写提示词 / 正在出样机
                                     done: { prompt, mockHtml, issues }
预览：旧样机 ↔ 新样机 并排
PUT  …/pages/:t                    → 落库，失效 style-docs 与 style-doc 两条 query
```

预览做「旧 ↔ 新」并排是顺手的事——旧的 `mockHtml` 本来就在手上，不额外花一次模型调用，
但能让人看出这一改到底改了什么。

## 界面

**卡片**：底部操作条现在只有「删除」，在它左边加一颗「编辑」。
这颗按钮打开的就是详情弹框，与点卡片本体是同一个面板——它是一颗**显式入口**，
不是第二个界面（现在「点卡片能打开详情」只靠 hover 变色的暗示）。

**详情弹框**：每个页类型那一块的标题行右侧现在是「看提示词」，在它旁边加一颗「编辑」。
该页类型若被改过，来源徽标从「参考图里有 / 推导」变成「手改」，另加「已改过」标记。

**编辑视图**：点「编辑」后**弹框内容整体切成该页类型的编辑视图**（顶部一条
「← 返回风格详情」），而不是再叠一层弹框——一层表面就够，省掉嵌套遮罩与焦点陷阱。

三态，按流程走：

1. **上传态** — 虚线框 +「点这里选参考图」，只收一张。复用 `uploadReferenceImages()`。
2. **挑页态** — **只有分页结果多于一张时才出现**。把用户刚上传的那张图整张显示出来，
   检测到的每一页画成一个可点的矩形叠在上面，角上标出模型判的页类型；点哪块就用哪块。
   比「一排缩略图」直观——能看见它在整张图里的位置。只分出一张就跳过这一态。
3. **结果态** — 三阶段进度 → 旧样机 ↔ 新样机并排（各 380 宽，与详情里一致）
   + 新提示词可展开 → 底部「确定替换」/「取消」。

确认后：调 PUT → 失效 `style-docs` 与 `style-doc` 两条 query → 退回详情视图
→ toast「已替换封面」。

结果态点「取消」回到**上传态**（可以换一张参考图再来），不是退回详情——刚看到不像，
下一步多半就是换张图，不该逼人重新点一遍「编辑」。

中途关掉编辑视图直接丢弃——按下「确定替换」之前整条路对服务端零副作用，
所以不需要「确定要放弃吗」那种二次确认。

## 配色与字体怎么跟随

**字体要主动注入**（与配色同一套做法）：`writePagePrompt` 加一个**可选**的 `fontFamily`
参数，给了就在 user message 里附一段字体说明——页面必须引用 `var(--font-sans)`、**不要**
声明自己的 `font-family` 栈；`generateMock` 同样收一个可选的 `fontFamily`。

「字体由渲染层注入 `--font-sans`、模型不用管」这个判断是**错的**（headless Chrome 实测证伪）：
`buildPageDocument` 把注入的 `body { font-family: var(--font-sans) }` 写在 `<head>`，而模型片段
（连同它自己的 `<style>`）落在 `<body>`——片段的 `body{font-family:…}` 与注入那条**同优先级**
又排在后面，于是片段赢、风格字体被整条丢掉。45 份样机里 28 份写死了自己的字体栈；`WRITE_SYSTEM`
里那句「只用系统无衬线字体栈」正是模型自己发明字体栈的来源，所以必须明写一段把它压住。

**配色要主动注入**：`writePagePrompt` 加一个**可选**的 `palette` 参数，给了就在 user message
里附 `paletteBlock(palette)`，再加一句「参考图的颜色不要照搬，用这套配色」；不给就是现在的
行为，全量识别那条路不受影响。

这一步不能省。全量识别里写提示词发生在**提炼配色之前**，所以那批提示词根本不知道配色是
什么——这正是上次踩过的坑（八条推导页各自发明了一套深色）。单页编辑这条路配色是现成的，
不注入的话模型会照着参考图写「背景用深蓝」，跟这套风格的暖米白直接打架。

## 代码落点

| 文件 | 改动 |
|---|---|
| `packages/server-core/src/services/page-prompt-kit.ts` | 新建。与模型交互的三个原语从 `recognize-doc.service.ts` **原样搬过来**（纯搬运，不改行为）：`SPLIT_SYSTEM` / `splitSlides`、`WRITE_SYSTEM` / `writePagePrompt`、`MOCK_SYSTEM` / `generateMock`、`paletteBlock`、`MOCK_MAX_TOKENS` |
| `packages/server-core/src/services/redraw-page.service.ts` | 新建。`splitForPick()` / `redrawPage()`（SSE 生成器）/ `replacePagePrompt()` |
| `packages/server-core/src/services/recognize-doc.service.ts` | 改成从 kit 引，删掉本地那几份 |
| `packages/server-core/src/index.ts` | 导出新服务 |
| `apps/api/src/routes/styles.ts` | 加三条路由 |
| `apps/web/src/pages/StyleLibrary.tsx` | 卡片加「编辑」；详情加「编辑」与「已改过」；挂载编辑视图 |
| `apps/web/src/components/RedrawPagePanel.tsx` | 新建。编辑视图（三态） |

抽 kit 的代价是要动 `recognize-doc.service.ts` 那个比较敏感的文件，收益是两边都不用去够
对方的私有函数。纯搬运，有测试兜着。

`PUT` 的 body 是 `{ prompt, mockHtml }`——**服务端自己拿这套风格的 palette 重跑一遍
`lintMockHtml`** 填 `issues`。让客户端把 issues 传回来是错的：那是派生数据，客户端算不了，
传回来也只能原样存，不如服务端一次算准。

## 边界情况

| 情况 | 怎么处理 |
|---|---|
| 分页没找出任何一页 | `splitSlides` 自带兜底（整张图当一页）。这里要**如实说**「没能从这张图里找出幻灯片，已按整张图处理」，不能静默 |
| 上传的不是设计稿（比如一张照片） | 检测不了，不拦。预览那一步就是保险——看着不像就点取消，全程零副作用 |
| 模型没写出提示词 | `writePagePrompt` 已经会抛错，SSE 的 `error` 事件把消息带出去，编辑视图显示错误 + 「重试」 |
| 提示词缺了固定四段 | 写完先校验 `PROMPT_SECTIONS`（现在只有推导那条路校验，参考图那条没校验）。缺了**带缺失项重试一次**——与样机同样的做法；仍缺就在结果态里如实标出，不阻断替换 |
| 样机过不了 lint | `generateMock` 已经带问题重试一次；仍不过就带着 `issues` 返回，**不阻断替换**（与全量识别一致——样机是给人看的，不是硬门槛），但 issues 要在结果态里列出来 |
| 用户中途关掉弹框 | 客户端关 EventSource；服务端在 `req` 的 close 上停手。与现有 `/recognize-doc/stream` 对齐 |
| 同一页类型连改两次 | 第二次读到的是第一次的结果，直接覆盖——符合「永久替换」 |
| PUT 时 styleId 不存在 | 404 |

**替换不会改已经生成过的项目。** 项目里的页面在生成那一刻就已经把 HTML 写进
`PageIR.html` 了，改风格库只影响**之后**的生成。这句话要写进编辑视图。

**`reviewed` 徽标保持原样**，不重置成「待审核」——这是用户改自己的风格，强行退回审核队列
会莫名其妙；`customized` 会置真，说明它已经不是原始识别结果。

## 测试

服务层新开 `redraw-page.test.ts`，用假网关（与 `generate-html.test.ts` 同一套做法）：

1. 分页只出一张 → 不进挑页态
2. 分页出多张 → 返回多张带缩略图
3. 写提示词的调用**带上了这套风格的配色**（断言发给网关的消息里含该风格的 `--bg` 值）
4. 出样机时也带配色
5. `replacePagePrompt` **只动那一格**——其余八个页类型、palette、fontFamily、name、
   description、deckPrompt 逐字不变
6. 替换后 `source` 变 `manual`、`edited` 为真
7. styleId 不存在 → 404
8. 样机 lint 不过仍返回结果并带 issues
9. 模型返回空提示词 → 抛错
10. 提示词缺四段 → 带缺失项重试一次；仍缺则返回结果并标出缺失的小节

路由层：三条路由的鉴权与参数校验（`pageType` 不在枚举里 → 400；裁切框四个数越界或
`x1 <= x0` → 400）。

前端不做组件测试（这个仓库现在也没有），靠浏览器实测。

**验证**：`pnpm test`、`pnpm -r typecheck`、`pnpm build`；然后在浏览器里走一遍完整流程——
上传一张拼图 → 挑一页 → 看进度 → 对比新旧样机 → 确定替换 → 刷新页面确认还在。

## 不做的事

- **不手改提示词文本**。编辑面板只做「上传参考图 → 重识别」这一件事。模型写得不好时
  换一张参考图，而不是直接改字。（`source: 'manual'` 这个取值保留给这条路径用。）
- **不做「按原提示词重跑样机」**。想换个随机结果得重新走一遍识别。
- **不做撤销/历史**。确认即永久替换。
- **不编辑风格级元信息**（名称、描述、配色、字体）。配色与字体按设计跟随原风格。
- **不做九页一起批量重识别**。那是「新建一套风格」，现有识别链路已经覆盖。
