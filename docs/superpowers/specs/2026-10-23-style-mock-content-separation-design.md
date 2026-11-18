# 风格库的示例文案不得进入真实项目 · 设计

2026-10-23

## 背景

用户的原话：

> 风格库的每一页的模拟内容，不要进入真实的项目，真实项目需要使用项目每一页的内容。
> 风格库里显示的有模拟，但是核心是规范了本类型页面的设计风格，排版，字号，字体，配图、
> 结构等 GUI 规范。在真实项目里对应每个页面的内容能够真实呈现。优化此逻辑。

已经确认的判断：

- **重写存量提示词，但风格库里的样机仍要显示真实效果**（不是简化成线框）
- **版面上没有对应内容的槽位直接删掉**，不编、不留空壳
- **先做机制（生成侧），后做存量（5 套风格的重写与重出样机）**

## 现状与根因

### 一条提示词同时干两件事

样机生成（`page-prompt-kit.ts` 的 `generateMock`）发的是：

```
prompt + 调色板 → 模型 → 样机 HTML
```

真实项目生成（`generate-html.service.ts` 的 `callModel`）发的是：

```
prompt + 调色板 + 视觉规范 + 项目内容 → 模型 → 真实页面 HTML
```

**用的是同一条 `prompt`。** 样机是给人看的，必须填满才能看出设计效果，所以写提示词时
不得不塞进示例文案；而真实项目也读同一条提示词，于是示例文案跟着进了真实页面。

### 提示词用「内容形状的词」在描述版位

深色紫调数据面板（`recognized-mvgqcw9p`）的封面提示词第 6 条原文：

> 底栏……左侧是**汇报人姓名与职位**（用 · 连接），右侧是**日期**

模型分不清「这是槽位的名字」还是「这是要填的内容」，于是照抄。

### 实测证据

扫全部 40 页生成结果，3 页带着风格库的占位文案：

| 项目 | 页 | 页类型 | 泄漏的文案 |
|---|---|---|---|
| `prj_2o3zwhk8fe` | 第 1 页 | cover | 汇报人姓名 · 职位 / 2025.01.01 |
| `prj_5l0b0v4zxs` | 第 1 页 | cover | 职位 / 日期 |
| `prj_5l0b0v4zxs` | 第 2 页 | section | CHAPTER |

风格提示词里以 `（如 "xxx"）` 形式给出的示例文案：

- 暖调纸感编辑风：`CONTENTS` / `INDEX · 目录` / `CHAPTER 02` / `TEXT` / `MIND MAP` /
  `ARCHITECTURE` / `SYSTEM MAP · 架构总览` / `HTTP` / `JSON`

### 第二个原因：结构性页面的项目内容近乎空

`prj_2o3zwhk8fe` 封面的大纲是 `title: 风格升级验证`、`claim: 风格升级验证`（主张是标题的
逐字复制），`points` 为空，也没有原文段落。版面有四个槽（标题 / 副标题 / 汇报人 / 日期），
项目只填得满一个——剩下三个只能抄示例或凭空编。`projects` 表里也没有「汇报人」「日期」这两列。

## 目标链路

```
风格库 prompt        = 纯版式规范（不含内容形状的词、不含任何示例文案）
样机   = prompt + 示例内容（按页类型写死的 fixture）   ← 只有样机看得到
真实页 = prompt + 项目每一页的内容                     ← 两条走同一个内容通道
```

**内容从哪来由调用方决定，提示词只管设计。**

## 契约

### 一、`MOCK_CONTENT`：按页类型的示例内容

新增 `packages/ir-schema/src/mock-content.ts`，与 `PAGE_TYPE_BRIEF` / `PAGE_TYPE_LABEL`
并列——都是「页类型 → 一段固定文本」的查表，放在一起才不会改错地方。

```ts
/** 样机专用示例内容。**只喂给样机，永远不进真实项目** */
export const MOCK_CONTENT: Record<PageType, MockContent> = { ... };

export interface MockContent {
  title: string;
  subtitle?: string;
  points?: string[];
  /** 元信息行，如汇报人与日期。封面/封底用 */
  meta?: string[];
  /** 图表页的示例数据说明 */
  dataHint?: string;
}

/** 把 fixture 渲染成与 `contentBrief` 同一种形状的文本 */
export function mockBrief(pageType: PageType): string;
```

`mockBrief` 渲染出来的样子（封面）：

```
本页内容：
- 标题：2026 年度产品战略
- 这一页要讲清的一句话：从工具到平台的三条主线
- 汇报人：示例汇报人
- 日期：2026.01.01
```

渲染成与真实内容**同一种形状**是关键——模型在两种情况下看到的都是
「本页内容：- 标题：… - 要点：…」，不需要它去分辨这次是样机还是真页面。

全部风格共用同一份 fixture：样机之间只差设计，横向比风格更容易。

### 二、`lintContentLeak`：确定性泄漏检查

新增在 `packages/render-engine/src/codegen.ts`，与 `lintMockHtml` 并列（同为 HTML 检查，
同样返回 `LintIssue[]`，`rule` 用 `codegen/content-leak`）。

```ts
export function lintContentLeak(
  html: string,
  sources: { prompt: string; allowed: string },
): LintIssue[];
```

判定方式：

1. 从 `html` 抠出可见文字（去掉 `<style>` / `<script>` / 标签）
2. 禁词集合 = 提示词里的引号示例（`"…"`、`「…」`、`（如 …）` 三种写法）
   ∪ `MOCK_CONTENT` 的全部字符串
   ∪ 固定的占位词表（汇报人姓名 / 职位 / 日期 / CONTENTS / CHAPTER / INDEX / AGENDA /
   Lorem / 示例 / 占位 / 待填 等）
3. 禁词出现在可见文字里、**且不在 `allowed`（本页内容）里** → 判为泄漏

**边界要说清**：`2025.01.01` 这种**凭空编造**的日期不在提示词里，这条检查抓不到。
它靠的是另外两条——提示词里没有示例可抄，以及空槽位直接删。**这条检查防的是「抄」，
不是「编」。**

## 四条改动

### 1. 提示词只描述版式，不写内容形状的词

改 `page-prompt-kit.ts` 的 `WRITE_SYSTEM`：

- 槽位按**性质与数量**命名，不按内容命名。
  「左侧是汇报人姓名与职位」→「底栏左侧放一组元信息，两段文字用 · 连接」
- 任何位置都不举例子。
  反例：`一段 12px 大写标签（如 "CONTENTS"）`
  正例：`一段 12px 大写标签，内容由调用方提供`

写入后跑一次 `lintPromptHygiene`（同一份禁词表），命中就带抱怨重试一次；
仍命中则**接受**——一条带示例的提示词仍可用，生成侧的 `lintContentLeak` 会兜住
（它正是从提示词的引号示例里取禁词的）。

### 2. 样机改走「版式 + 示例内容」

`generateMock` 加一个 `pageType` 参数，内部取 `mockBrief(pageType)` 拼进消息，
形状与 `callModel` 一致：

```ts
export async function generateMock(
  gateway: ProviderGateway,
  prompt: string,
  palette: StylePalette,
  pageType: PageType,
  fontFamily?: string,
): Promise<{ html: string; issues: LintIssue[] }>;
```

调用点三处（全量识别、单页重识别、补齐）都已知页类型，改起来是机械的。

### 3. 生成侧：没有内容就删槽位

改 `generate-html.service.ts` 的 `PAGE_SYSTEM`，加两条硬要求：

- 上面那条风格提示词描述的是**版式**。里面出现的任何具体字样都是举例，
  **一个字都不许出现在输出里**。
- 版式里某个槽位如果「本页内容」里没有对应内容，**整条槽位连它的装饰一起去掉**——
  不要编、不要留空壳、不要用「待补充」这类占位词顶上。

### 4. 内容通道补齐结构性页面

`contentBrief` 对封面 / 章节 / 目录 / 封底补上**项目本身**已有的信息：

- 整本标题（`project.title`）
- 这一页在整本里的位置（第 N 页 / 共 M 页）——已有
- 章节页的所属章节名（`outline.section`）——已有

**不引入「汇报人 / 日期」**（用户选了「没有就删」）。

## 接进生成流程

`generatePageHtml` 现在跑 `lintMockHtml` 并在不合规时重试一次。`lintContentLeak`
接在同一条回退路径上：

```
生成 → lintMockHtml + lintContentLeak
      ↓ 有 error
   带抱怨重试一次
      ↓ 仍有 error
   页面标为 failed，degradeReason 写明泄漏了哪个词
```

**标成 failed 而不是静默放过**：一页带着「汇报人姓名」的封面是能看的，
但「看着能看、其实错了」正是这次要消灭的那一类问题。标出来用户能单独重生成。

## 存量 5 套风格（第二步）

1. 跑一遍重写剥离示例文案——复用 `style-spec.service.ts` 那条改写链的形态，
   但目标是「剥离内容形状的词与示例文案」，不是「统一视觉规范」。
   四段结构（`PROMPT_SECTIONS`）原样保留，用 `lintStylePrompt` 校验。
2. **重出样机**——提示词变了，样机得跟着变（用户要求风格库仍显示真实效果）。
   复用 `generateMock`，`mapLimit` 并发 3。11 页类型 × 5 套 ≈ 55 张。
3. 人工改过（`edited: true`）的页跳过，并如实报出「这 N 页你改过，没有动」。

## 验证

1. `pnpm test`、`pnpm -r typecheck`、`pnpm build` 全过。
2. 单测：
   - `lintContentLeak` 对「抄了示例」「没抄」两种输入的判定；禁词在 `allowed` 里时不报
   - `MOCK_CONTENT` 的**每一句都不出现在任何提示词里**（硬保证：fixture 与提示词不重叠）
   - `mockBrief` 与 `contentBrief` 渲染出的形状一致
   - `generateMock` 确实把 fixture 内容发给了模型
   - 泄漏页会带抱怨重试一次，两次都泄漏则标 failed 且 `degradeReason` 点名
3. **浏览器实测**：新建项目 → 生成 → 逐页确认页面文字全部来自项目，没有示例文案；
   重点看封面（原先泄漏的那一页）。
4. **回归**：把 `prj_2o3zwhk8fe`、`prj_5l0b0v4zxs` 的那 3 页重生成，确认干净。
5. **样机不退化**：重写后风格库里的样机仍然饱满、看得出设计（不是空白或线框）。

## 不做

- 不给项目加「汇报人 / 日期」字段（用户选了「没有就删」）。
- 不改页面的渲染链路（`buildPageDocument` 那段是好的）。
- 不修 `buildOutline` 规则分页本身太粗糙的问题——那是
  [2026-10-22-deck-plan-lesson-design.md](2026-10-22-deck-plan-lesson-design.md) 的范围。
- 不追求「防编造」。这条检查只防「抄」，编造靠提示词无示例可抄 + 空槽位删除来防。
