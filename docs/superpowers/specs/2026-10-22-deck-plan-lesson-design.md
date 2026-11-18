# 三段内容链路：提纲 → 教案 → 页面 · 设计

2026-10-22

## 背景

用户的原话：

> 需要可以设置页数和深度，目前这个大纲和教案都太粗糙，需要 AI 深入思考用户需求，
> 然后生成大纲，然后通过大纲生成教案，最后每一页内容都有了，通过教案，选择风格
> 生成每一页的内容，自动识别每一页应该使用什么功能页面。使用 prompt 来开发每一页。

现在已经确认的判断：

- **「深度」= 大纲的思考层级**（不是每页厚薄）
- **「自动识别每一页用什么功能页面」放在教案阶段**（大纲阶段模型还没读过内容，猜不准）
- **教案与大纲是同一份数据**（改教案里的标题，右边大纲列表那一行跟着变）
- **先生成、可以人工改**（不是先生成、必须确认）
- **旧的没教案的内容不用管**（用户会删掉旧项目，不写兼容分支）

## 现状：为什么「粗糙」

`packages/content-engine/src/outline.ts` 的 `buildOutline` 是**纯规则的**，一次模型都不调：

```
detectIntent(纯规则) → analyzeSignals(纯正则) → suggestedPageRange(查表)
  → segmentContent(按空行/编号切段) → claimFromSegment / extractMetrics(正则抽数字)
```

页类型也是规则猜的：

```ts
const pageType: PageType = hasNumbers && metrics.length >= 2 ? 'metrics' : 'text';
```

所以「粗糙」不是调得不好，是**根本没让模型想过**。

链路下游（这一步已经有了，本次只改喂进去的内容）：

```
PageIR.html  ←  generatePageHtml(outline, doc)  逐页调模型写 HTML
```

## 目标链路

```
项目需求（用户写的原文）
  + 页数（可选，3~30）
  + 深度（浅 / 中 / 深）
        │
        ▼  ① 生成提纲        ← 模型深入思考（本次新增）
     提纲：叙事骨架 + 每页要说什么
        │
        ▼  ② 生成教案        ← 模型逐页写实（本次新增）
     教案：标题 / 主张 / 要点(带数字) / 视觉形式 / 设计说明 / 页类型
        │
        ▼  ③ 选风格，生成页面   ← 已有链路，不改
     页面 HTML
```

三段**各自可重跑**，每段都能人工改完再往下走。

## 契约

### `OutlinePage` 扩两个字段

`packages/ir-schema/src/deck.ts`：

```ts
export const OutlinePage = z.object({
  index: z.number().int().min(0),
  pageType: PageType,
  claim: z.string(),            // 一句话主张
  title: z.string(),
  points: z.array(z.string()).max(5),
  section: z.string(),
  notes: z.string(),            // 这一页对应的**原文段落**（已有，不是教案）
  /** 视觉形式：这一页该配什么图 / 用什么图表 / 什么版式。教案阶段由模型给出 */
  visualForm: z.string().default(''),
  /** 设计说明：这一页为什么这么排、要给听众留下什么。只给人看，不发给模型 */
  designNote: z.string().default(''),
});
```

`designNote` 与 `visualForm` 都带 default，老数据 parse 得过——但**不写兼容分支**：没有教案的页就是空字符串，界面据此显示「还没有教案」。

**注意：不复用 `notes`**：它已经是「这一页对应的原文段落」，`page-ir.ts:169` 与
`generate.service.ts:364` 都拿它当 `sourceText` 用。占用它会把原文冲掉，
下游生成页面时就没有原文可依了。

### 深度

`packages/ir-schema/src/deck.ts` 新增：

```ts
/** 大纲的思考层级。只影响提纲与教案两段怎么问模型，不影响页面渲染 */
export const DeckDepth = z.enum(['shallow', 'standard', 'deep']);
export type DeckDepth = z.infer<typeof DeckDepth>;

export const DEPTH_LABEL: Record<DeckDepth, string> = {
  shallow: '浅',
  standard: '中',
  deep: '深',
};

/** 各档要求模型做什么。写在一处，提示词与界面说明都从这里取 */
export const DEPTH_BRIEF: Record<DeckDepth, string> = {
  shallow: '沿用给定的分段，把标题与主张写顺即可。不要自行增删页。',
  standard: '先搭一条叙事骨架（现状 → 分析 → 方案 → 验证 → 收获），再往骨架上分配页。',
  deep: '先搭叙事骨架，再为每一页写清论证链：这一页要证明什么、拿什么证、与上一页什么关系。'
    + '要点必须带具体数字与出处，不要写「增长显著」这类空话。',
};
```

深度存在项目上（`projects` 表加列 `depth`），因为它跟着项目走而不是跟着某一次生成走。

### 页类型：教案阶段定

`OutlinePage.pageType` 字段留着（下游都在读），但**谁写它变了**：原先规则猜，现在教案阶段由模型定。

## 服务

### `packages/server-core/src/services/deck-plan.service.ts`（新建）

两个函数，都收 `gateway`（路由用 `billedGateway` 建）：

```ts
/** ① 生成提纲：规则先出骨架，模型在骨架上深入思考重写 */
export async function planDeckOutline(
  input: { projectId: string; tenantId: string; userId: string;
           targetPages?: number; depth: DeckDepth; gateway: ProviderGateway },
): Promise<OutlinePage[]>;

/** ② 生成教案：逐页调模型，写实这一页的内容 */
export async function planLessons(
  input: { projectId: string; tenantId: string; userId: string;
           gateway: ProviderGateway; only?: number[] },
): Promise<OutlinePage[]>;
```

**`planDeckOutline` 为什么保留规则那一层**：验收清单 5.3 有一条硬要求——
「3 页已有内容 **100%** 正确分页」，这是 `segmentContent` 的确定性分段保证的，
模型做不到 100%。所以做法是：**规则先出骨架（保证不丢内容），模型在骨架上重写**。
这与仓库里风格识别那条链路同一套做法（`recognize.service.ts` 里写的
「规则先给出确定性结果，再让模型在语义层面精修；模型不可用就静默保留规则结果」）。

模型不可用时**不抛错**，原样返回规则骨架并在结果里标明降级。

**`planLessons` 的批量与并发**：

- **每页一次调用，`mapLimit` 并发 3**（`lib/concurrency.ts`）。
- 不按批：一页教案几百字，没有截断风险。对比参照是改写提示词那条链路——
  一页三四千字，必须两页一批，否则超过 `maxTokens` 被截断、JSON 解析不出来。
- **每页调用都要带上下文**，否则每页都会写成「本节要点」那种废话：
  整本提纲（每页标题与主张）+ **前两页的教案**（承接）+ 这一页的原文段落。

`planLessons` 逐页推 SSE，界面上一页页亮起来。

### 注入 `contentBrief`

`generate-html.service.ts` 的 `contentBrief()` 改成教案字段优先：

```
本页内容：
- 页码：第 3 页，共 9 页
- 标题：市场现状
- 这一页要讲清的一句话：存量竞争加剧，增长逻辑正在重构
- 要点：
  · 市场增速从 210% 降到 18%
  · 续费率从 82% 掉到 61%
- 视觉形式：左右分栏，左侧一张增长曲线图，右侧三条要点卡
- 这一页对应的原文（可以引用其中的事实与数字，但不要整段照搬）：
  ……
```

`visualForm` 作为**明确要求**发给模型（不再是让它自己猜版式）；`designNote` **不注入**
（那是给人看的，注进去只会稀释真正的要求）。

## 路由

`apps/api/src/routes/projects.ts` 新增两条 SSE 路由，形态与已有的
`GET /:id/generate/stream` 一致（`openSse` + 遍历异步生成器）：

```
GET  /api/projects/:id/plan/outline/stream?pages=9&depth=deep   ①
GET  /api/projects/:id/plan/lessons/stream[?only=0,1,2]         ②
POST /api/projects/:id/depth                                    改深度（非流式）
```

存在的阶段名进 `packages/ir-schema/src/progress.ts`，与 `RECOGNIZE_STEPS`、
`UNIFY_STEPS` 并列——前端要按同一个顺序把阶段摆出来，名字对不上就白摆。

```
PLAN_STEPS = ['outline', 'lessons'] as const;
```

## 界面

只动「项目需求」这个 tab，另两个（大纲与页面、风格）一行不改：

```
【项目需求】tab                          【大纲与页面】/【风格】tab
┌─┬─────────┬──────────────┬─────────┐  ┌─┬─────────┬──────────┬─────────┐
│竖│ 项目需求 │ 教案          │ 大纲列表 │  │竖│ 大纲/风格│ PPT 画布 │ 页面检查器│
│栏│ +页数    │ （新）        │（复用）  │  │栏│（不变）  │（不变）   │（不变）  │
│ │ +深度    │              │         │  │ │         │          │         │
└─┴─────────┴──────────────┴─────────┘  └─┴─────────┴──────────┴─────────┘
```

三处改动：

1. **`OutlinePanel` 从 `LeftRail.tsx` 提成 `workbench/OutlineList.tsx`**。
   它现在写死在左栏、宽度假设 300px；提出来之后「大纲与页面」的左栏与
   「项目需求」的右栏用同一份——拖拽排序、双击改名、状态点全保留。

2. **新增 `workbench/LessonEditor.tsx`**（中间）。选中页的五个字段
   （标题 / 主张 / 要点 / 视觉形式 / 设计说明）+ 页类型下拉，边改边写回 store
   （与右栏检查器同一套 `patch` 路径）。顶部动作栏：
   `生成本页教案` / `生成整本教案` / `根据教案生成本页页面`，
   右侧显示 `第 3 页 / 共 9 页` 与这一页的页类型。

3. **`Workbench.tsx` 按 tab 分流中栏与右栏**：`leftTab === 'brief'` 时，
   右栏换成 `OutlineList`、中栏换成 `LessonEditor`。

**左栏加两个控件**：

- **页数**：数字输入 3~30，留空表示「由内容决定」
- **深度**：三档 SegmentedControl（浅 / 中 / 深），下面一行小字说明这一档模型会做什么
  （文案取自 `DEPTH_BRIEF`）

**按钮语义变更**：左栏那个「保存并生成」**文案不变**，行为改成**只出提纲 + 教案**，
不再出页面。出页面挪到教案编辑器的动作栏，以及顶栏原有的「生成 / 重新生成」。

## 人工修改

三段各自可改，改完可以只重跑后面那一段：

| 改什么 | 在哪改 | 怎么往下走 |
|---|---|---|
| 提纲（标题 / 主张 / 要点 / 页类型） | 大纲列表（双击改名、拖拽排序）+ 教案编辑器 | 点「生成整本教案」重写教案 |
| 教案（五个字段） | 教案编辑器 | 点「根据教案生成本页页面」 |
| 页面 | 现有右栏检查器 | 现有「重新生成本页」 |

**人工改过的教案在重跑提纲时不被覆盖**：与 `StylePagePrompt.edited` 同一套规矩——
`planDeckOutline` 对已有人工痕迹的页保持原样，并在结果里如实报出「这 N 页你改过，没有动」。

## 验证

1. `pnpm test`、`pnpm -r typecheck`、`pnpm build` 全过。
2. 单测：
   - `planDeckOutline` 三档深度各自问模型的提示词不同（断言注入的 brief 文本）
   - 模型不可用时返回规则骨架并标降级，**不抛错**
   - `planLessons` 的调用次数等于页数，且每一页的调用都带上了整本提纲与前两页教案
   - `contentBrief` 在「有教案 / 没教案」两种输入下的渲染
   - `designNote` **不进** `contentBrief`（注进去会稀释真正的要求）
3. **浏览器实测**：新建一个项目 → 写需求 → 设页数 9、深度「深」 →
   看提纲与教案逐页出来 → 改其中一页的标题 → 确认大纲列表同步变 →
   生成这一页 → 演示态看效果。
4. **降级实测**：把 `html_codegen` 路由临时指向 Mock，确认提纲仍出得来（规则骨架），
   界面如实说「模型不可用，这是规则骨架」。

## 不做

- **不写「没有教案」的兼容分支**——用户会删掉旧项目，只保新项目从零跑通。
- 不改页面渲染链路（已有的那段是好的）。
- 不做「教案模板库」（用户没要）。
