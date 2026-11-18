# 人物排版 16 种版式 · 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给人物页做一套 16 个版式的骨架库，生成时按内容预筛出候选、由模型挑一个照着排；能力总览里 16 个骨架逐个现场渲染出来。

**Architecture:** 骨架是风格无关的 HTML（只用 `paletteVars` 注入的 CSS 变量取色），放在 `@lumen/ir-schema`；`server-core` 在拼生成请求时按规则筛出候选组、拼成一段提示词；`apps/web` 的「功能模块」tab 直接渲染骨架。

**Tech Stack:** TypeScript ESM `NodeNext`、Zod、node:test（`node --import tsx --test`，**tsx 剥类型但不做类型检查**）、React 18 + Tailwind 4。

设计文档：`docs/superpowers/specs/2026-10-27-people-layouts-design.md`

---

## 文件结构

| 文件 | 责任 |
|---|---|
| `packages/ir-schema/src/people-skeletons.ts`（新建） | 16 份 HTML 骨架，纯数据 |
| `packages/ir-schema/src/people-layouts.ts`（新建） | 类型、注册表、候选规则、提示词块 |
| `packages/ir-schema/src/people-layouts.test.ts`（新建） | 上面那些的单测 |
| `packages/ir-schema/src/index.ts`（改） | 加一行 `export * from './people-layouts.js';` |
| `packages/server-core/src/services/generate-html.service.ts`（改） | `callModel` 多收一个 `layoutBlock`，人物页拼上 |
| `packages/server-core/src/services/generate-html.test.ts`（改） | 断言人物页带上、别的页类型不带 |
| `apps/web/src/pages/Studio.tsx`（改） | 「功能模块」tab 加一张卡 |

**为什么骨架与规则拆两个文件**：16 份骨架约 1600 行，与类型和规则混在一起，改规则时要在一堆 HTML 里翻。

**骨架的房屋风格（三份约束，每份都有原因）**

1. **只用 CSS 变量取色**：`--bg / --surface / --text / --muted / --accent / --brand / --border`。
   `lintMockHtml`（`packages/render-engine/src/codegen.ts:130`）把非配色的 hex 判成 `error`。
2. **人像位写 `<img data-lumen-image="n" data-lumen-cutout="1">`**，**不写 `src`**。
   编号从 1 起、同一份骨架里连续。`fillImageSlots` 会填人物抠图。
3. **要裁切的头像用容器裁**：`<div class="cut"><img …></div>`，
   `.cut{overflow:hidden;border-radius:50%}` + `.cut img{width:160%;height:160%;margin:-30% 0 0 -30%}`。
   **不能给 img 写 `object-fit: cover`**——`html-doc.ts:151` 那条
   `img[data-lumen-cutout="1"]{object-fit:contain !important}` 压不过，写了会静默失效。

另外：骨架是**片段**（`<style>` + 一个根 `<div>`），不是完整文档——`buildPageDocument` 会包。
画布固定 1920×1080，根 div 写 `width:1920px;height:1080px`。

---

## Task 1: 类型、注册表与候选规则

**Files:**
- Create: `packages/ir-schema/src/people-layouts.ts`
- Modify: `packages/ir-schema/src/index.ts`（加一行导出）
- Test: `packages/ir-schema/src/people-layouts.test.ts`

这一步先不写 16 份骨架（Task 2 写），用**占位骨架**把结构与规则钉死。

- [ ] **Step 1: 写失败的测试**

新建 `packages/ir-schema/src/people-layouts.test.ts`：

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PEOPLE_LAYOUTS, PEOPLE_GROUP_ORDER, peopleLayoutCandidates, peopleLayoutBlock,
  type PeopleGroup,
} from './people-layouts.js';

const EMPTY = { title: '', claim: '', points: [] as string[], visualForm: '' };

test('16 个版式，id 唯一，分组数量对', () => {
  assert.equal(PEOPLE_LAYOUTS.length, 16, '参考图是 8 张、每张 2 个版式，共 16 个');
  assert.equal(new Set(PEOPLE_LAYOUTS.map((l) => l.id)).size, 16, 'id 撞了');

  const byGroup = new Map<PeopleGroup, number>();
  for (const l of PEOPLE_LAYOUTS) byGroup.set(l.group, (byGroup.get(l.group) ?? 0) + 1);
  assert.deepEqual(
    PEOPLE_GROUP_ORDER.map((g) => [g, byGroup.get(g) ?? 0]),
    [['solo', 3], ['row', 6], ['cards', 5], ['personas', 1], ['grid', 1]],
    '分组数量与设计文档对不上——改版式时这两处要一起改',
  );
});

test('每个版式都有名字与一句话说明，id 形如 people/x@v1', () => {
  for (const l of PEOPLE_LAYOUTS) {
    assert.ok(l.name.length > 0, `${l.id} 没有名字`);
    assert.ok(l.brief.length >= 8, `${l.id} 的说明太短，模型挑不出来`);
    assert.match(l.id, /^people\/[a-z-]+@v1$/, `${l.id} 不符合命名`);
  }
});

test('候选规则：六条判据各走对组', () => {
  const g = (input: Partial<typeof EMPTY>) =>
    new Set(peopleLayoutCandidates({ ...EMPTY, ...input }).map((l) => l.group));

  assert.deepEqual([...g({ title: '用户画像' })], ['personas'], '画像关键词该走 personas');
  assert.deepEqual([...g({ title: '团队阵容', visualForm: '六个人像排成网格' })], ['grid'], '六人以上该走网格');
  assert.deepEqual([...g({ title: '创始人简介' })], ['solo'], '单人该走 solo');
  assert.deepEqual([...g({ title: '核心团队成员' })], ['row'], '团队关键词该走头像行');
  assert.deepEqual([...g({ title: '这一页讲三件事', points: ['a', 'b', 'c'] })], ['cards'], '其余走人物卡');
  assert.deepEqual([...g({})], ['row'], '**兜底也要给一组**——回空数组等于把版式说明整段抽掉');
});

test('人数优先从 visualForm 抓，抓不到才用要点条数', () => {
  // visualForm 说五个人，要点却只有两条——该按 visualForm 走（它是讲版式的那个字段）
  const byForm = peopleLayoutCandidates({
    ...EMPTY, title: '团队成员', visualForm: '五个人像横排，每人姓名与职位', points: ['a', 'b'],
  });
  assert.deepEqual([...new Set(byForm.map((l) => l.group))], ['row'], 'visualForm 该压过 points');

  // visualForm 里没有数量词时退回要点条数：四条 → cards
  const byPoints = peopleLayoutCandidates({ ...EMPTY, title: '几位同行者', points: ['a', 'b', 'c', 'd'] });
  assert.deepEqual([...new Set(byPoints.map((l) => l.group))], ['cards'], 'visualForm 抓不到时该用要点条数');
});

test('提示词块：带名字、说明与骨架，且不带别的组的版式', () => {
  const solo = peopleLayoutCandidates({ ...EMPTY, title: '创始人简介' });
  const block = peopleLayoutBlock(solo);
  for (const l of solo) {
    assert.ok(block.includes(l.name), `块里缺版式名「${l.name}」`);
    assert.ok(block.includes(l.skeleton), `块里缺「${l.name}」的骨架`);
  }
  // 只带候选组：随便挑一个别的组的版式，它不该出现
  const other = PEOPLE_LAYOUTS.find((l) => l.group !== 'solo')!;
  assert.ok(!block.includes(other.skeleton), `不该把「${other.name}」也带上`);
});
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `node --import tsx --test packages/ir-schema/src/people-layouts.test.ts`
Expected: FAIL —— `Cannot find module './people-layouts.js'`。

- [ ] **Step 3: 实现**

新建 `packages/ir-schema/src/people-layouts.ts`：

```ts
import { PEOPLE_SKELETONS } from './people-skeletons.js';

/**
 * 人物页的版式库。
 *
 * 人物页有十几种排法（单人特写、头像行、斜切飘带、六边形网格……），让模型每次自由发挥
 * 是排不出该有的样子的。这里把每种排法写成一份**骨架**，生成时按这一页的内容筛出
 * 几个候选给模型挑，它照着排。
 *
 * ## 骨架为什么能跨风格复用
 *
 * 骨架只用 `buildPageDocument` 注入的那几个 CSS 变量取色（`--bg/--surface/--text/
 * --muted/--accent/--brand/--border`）与 `--font-sans`，所以换一套风格自动跟着变，
 * 不需要每套风格各写一份。
 *
 * ## 骨架为什么是 HTML 而不是一句描述
 *
 * 只给一句「左文右像」模型排出来的东西仍然每次都不一样。给一份能跑的骨架当示例，
 * 版式一致性高得多——`derivePrompts` 拿已有提示词当 few-shot 是同一个道理。
 */
export type PeopleGroup = 'solo' | 'row' | 'cards' | 'personas' | 'grid';

/** 界面与提示词里的排列顺序 */
export const PEOPLE_GROUP_ORDER: PeopleGroup[] = ['solo', 'row', 'cards', 'personas', 'grid'];

export interface PeopleLayout {
  /** 形如 `people/row-hex-team@v1` */
  id: string;
  /** 中文名，界面与提示词都用它 */
  name: string;
  /** 一句话：适合什么内容。模型据此在候选里挑 */
  brief: string;
  group: PeopleGroup;
  /** HTML 片段：`<style>` + 一个根 `<div>`。约束见模块顶部注释 */
  skeleton: string;
}

/** 由 `people-skeletons.ts` 的纯数据加上分组表拼出来 */
export const PEOPLE_LAYOUTS: PeopleLayout[] = PEOPLE_SKELETONS;

const GROUP_LABEL: Record<PeopleGroup, string> = {
  solo: '单人',
  row: '并列人物行',
  cards: '人物卡',
  personas: '受众画像',
  grid: '多人网格',
};

export function peopleGroupLabel(g: PeopleGroup): string {
  return GROUP_LABEL[g];
}

const byGroup = (g: PeopleGroup) => PEOPLE_LAYOUTS.filter((l) => l.group === g);

/** 「画像 / 受众」这一类：内容本身就不是具体的人，而是某一群人 */
const PERSONA_RE = /画像|受众|用户|人群|读者/;
/** 「一组人」这一类：团队、嘉宾、成员、阵容、班底、讲者 */
const GROUP_RE = /团队|嘉宾|成员|阵容|班底|讲者/;

/**
 * 从 `visualForm` 里估这一页有几个人。
 *
 * **`visualForm` 优先于要点条数**：它是教案阶段专门写「这一页长什么样」的字段
 * （「五个人像横排，每人姓名与职位」），比要点条数贴近人数得多。
 *
 * 抓不到回 `null`（**不是 0**）——0 表示「确实是零个人」，`null` 表示「估不出来」，
 * 两者在下面的规则里走不同的分支。
 */
function estimatePeople(text: string): number | null {
  const cn: Record<string, number> = {
    一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
  };
  const m = /([一二两三四五六七八九十]|\d+)\s*(?:位|个|名|人)/.exec(text);
  if (!m) return null;
  const raw = m[1]!;
  const n = /^\d+$/.test(raw) ? Number(raw) : cn[raw];
  return n === undefined ? null : n;
}

/**
 * 按这一页的内容筛出候选版式。**返回的数组一定非空。**
 *
 * 规则是**猜的**——判据用的是标题、主张、要点与视觉形式这些现成的文本，实测之后
 * 可能要调。所以它单独成函数、单独测，调的时候不用碰骨架。
 */
export function peopleLayoutCandidates(input: {
  title: string; claim: string; points: string[]; visualForm: string;
}): PeopleLayout[] {
  const all = [input.title, input.claim, input.visualForm, ...input.points].join(' ');
  /**
   * 估人数时只看 `visualForm` 与要点：标题里常有「三大优势」这种与人数无关的数字。
   *
   * **注意 `points` 最多 5 条**（`OutlinePage` 里是 `.max(5)`），所以「人数 ≥ 6」
   * 只能由 `visualForm` 得出——那不是漏洞，是数据本身的边界。
   */
  const n = estimatePeople(input.visualForm) ?? (input.points.length || null);

  if (PERSONA_RE.test(all)) return byGroup('personas');
  if (n !== null && n >= 6 && GROUP_RE.test(all)) return byGroup('grid');
  if (n !== null && n <= 1) return byGroup('solo');
  if (GROUP_RE.test(all)) return byGroup('row');
  if (n !== null) return byGroup('cards');
  // 兜底：什么都判断不出来时给「并列人物行」——人物页最常见的是一组人，
  // 而且这一组里版式最多（6 个），模型挑得开的余地最大
  return byGroup('row');
}

/**
 * 拼成提示词里的那一段。
 *
 * 骨架用 ```html 代码块包着：模型对围栏里的内容会更当成「示例」而不是「正文」，
 * 而且围栏能挡住骨架里的缩进被当成正文缩进。
 */
export function peopleLayoutBlock(candidates: PeopleLayout[]): string {
  const items = candidates.map((l) =>
    `【${l.name}】${l.brief}\n\n\`\`\`html\n${l.skeleton}\n\`\`\``,
  );
  return [
    '这一页是人物页。人物页有多种版式，**按这一页的内容挑一种**，不要每页都用同一个。',
    '下面是适合这一页的几个候选：',
    '',
    ...items,
    '',
    '挑一个，然后用**这套风格**的视觉语言把它写出来。骨架里的文案是占位，',
    '按这一页的实际内容替换；骨架的配色一律走 CSS 变量，不要写死色值。',
  ].join('\n');
}
```

`packages/ir-schema/src/index.ts` 末尾加一行（与已有的十几行同形）：

```ts
export * from './people-layouts.js';
```

**本步先建一个最小的 `people-skeletons.ts` 让类型成立**（Task 2 再填真骨架）：

```ts
import type { PeopleLayout } from './people-layouts.js';

/** 见 `people-layouts.ts` 的说明。16 份骨架的正文在 Task 2 里写 */
export const PEOPLE_SKELETONS: PeopleLayout[] = [];
```

注意：这一步跑测试会因为 `PEOPLE_SKELETONS` 是空数组而红（长度 0、候选组为空）。
这是**预期的**——Task 2 把 16 份骨架填上就绿。**不要为了让测试过而删测试。**

- [ ] **Step 4: 确认失败的原因对**

Run: `node --import tsx --test packages/ir-schema/src/people-layouts.test.ts`
Expected: FAIL —— 报「16 个版式，id 唯一，分组数量对」这条，实际长度 0。
**不是** `Cannot find module` 那种失败。

- [ ] **Step 5: 不提交，直接接 Task 2**

**这一步不要提交。** 此时测试是红的（骨架还是空数组），红着提交没有意义。
Task 1 与 Task 2 是同一件事的两半——规则与骨架必须一起落地才谈得上「能跑」，
所以**只在 Task 2 末尾提交一次**，把两个文件一起带上。

---

## Task 2: 16 份骨架

**Files:**
- Modify: `packages/ir-schema/src/people-skeletons.ts`（把 `PEOPLE_SKELETONS` 填满）
- Test: `packages/ir-schema/src/people-layouts.test.ts`（追加三条）

**这一步由控制者本人写**（骨架要对着参考图排，图在控制者的上下文里），不派子代理。

- [ ] **Step 1: 追加骨架的用例**

在 `people-layouts.test.ts` 末尾追加：

```ts
test('每份骨架都是片段：有 <style>、有根 div、没有完整文档标签', () => {
  for (const l of PEOPLE_LAYOUTS) {
    assert.ok(l.skeleton.includes('<style>'), `${l.id} 没有 <style>`);
    assert.ok(!/<!DOCTYPE|<html|<body/i.test(l.skeleton), `${l.id} 是完整文档，该是片段`);
    assert.ok(/width:\s*1920px/.test(l.skeleton), `${l.id} 没定画布宽（画布是 1920×1080）`);
  }
});

test('每份骨架至少一个人像位，且编号从 1 起连续', () => {
  for (const l of PEOPLE_LAYOUTS) {
    const ns = [...l.skeleton.matchAll(/data-lumen-image\s*=\s*["']?(\d+)/gi)].map((m) => Number(m[1]));
    assert.ok(ns.length > 0, `${l.id} 一个人像位都没有——那它就不是人物页的版式`);
    assert.deepEqual(
      [...new Set(ns)].sort((a, b) => a - b),
      Array.from({ length: Math.max(...ns) }, (_, i) => i + 1),
      `${l.id} 的图位编号不连续，fillImageSlots 会漏格`,
    );
  }
});

test('每份骨架的人像位都带抠图标记，且不写死色值', () => {
  for (const l of PEOPLE_LAYOUTS) {
    const imgs = [...l.skeleton.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]!);
    assert.ok(imgs.length > 0, `${l.id} 没有 <img>`);
    for (const tag of imgs) {
      assert.match(tag, /data-lumen-cutout/i, `${l.id} 的人像位没标抠图，会被裁掉边缘：${tag.slice(0, 80)}`);
      assert.ok(!/\bsrc\s*=/i.test(tag), `${l.id} 的人像位写了 src，填图时会被盖掉：${tag.slice(0, 80)}`);
    }
    // 抠掉变量定义之后不该还有 hex
    const body = l.skeleton.replace(/--[a-z-]+\s*:\s*#[0-9a-f]{3,8}/gi, '');
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(body), `${l.id} 里有写死的色值，换风格不会跟着变`);
  }
});
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `node --import tsx --test packages/ir-schema/src/people-layouts.test.ts`
Expected: FAIL —— 长度 0 那条仍然红。

- [ ] **Step 3: 写 16 份骨架**

`people-skeletons.ts` 里逐份写。**每份都遵守「文件结构」那节的三条约束**：
只用 CSS 变量取色、人像位带 `data-lumen-cutout="1"` 且不写 `src`、
要裁切的头像用容器裁。

**房屋风格**（每份都照这个来，不要各写各的）：

- 根：`<div class="page">`，`.page{width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);color:var(--text);font-family:var(--font-sans)}`
- 边距：左右 96px，上下 72px
- 标题层级：页标题 44px / 强调 600，人名 26px / 600，职位与说明 18px / 400 且用 `var(--muted)`
- 装饰件：只用 `var(--brand)` / `var(--accent)` 的纯色块与 `linear-gradient`，不用图片
- 裁切头像（圆形/六边形）统一用这个类：

```css
.avatar { overflow: hidden; background: var(--surface); }
.avatar img { width: 150%; height: 150%; margin: -25% 0 0 -25%; }
.avatar.round { border-radius: 50%; }
.avatar.hex { clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%); }
```

16 份的结构（对着参考图）：

| id | name | 结构 |
|---|---|---|
| `people/solo-quote@v1` | 单人引言 | 左半幅人像（占满高度、底部贴边）；右侧上方页标题，中部 `var(--brand)` 横带上写姓名与头衔，下方大引号 + 引言段落 |
| `people/solo-honors@v1` | 单人荣誉 | 左侧 40%：姓名、出生地/日期一行、经历三条、荣誉徽章四个（圆角块）；右侧人像靠右贴底；背景 `var(--brand)` 大色块压左半边 |
| `people/solo-blocks@v1` | 单人色块 | 左侧文字（姓名中英并列、四条要点、两个荣誉块）；右侧人像，身后两个错落的 `var(--accent)` 矩形色块 |
| `people/row-circle@v1` | 圆形头像行 | 页标题居中；五个圆形头像横排，**中间那个直径大 1.4 倍**；两侧各一个 `var(--brand)` 圆形箭头；每个头像下姓名与职位；底部一段说明 |
| `people/row-circle-note@v1` | 圆形头像说明 | 四个圆形头像横排，每个带浅色圆底（`var(--surface)` 圆形衬在头像后）；姓名 + 下方三行说明；右上角页码装饰 |
| `people/row-hex-team@v1` | 六边形头像行 | 五个六边形头像横排（`.avatar.hex`）；姓名 + 职位在下方；底部一条 `var(--brand)` 横带写队名 |
| `people/row-hex-logo@v1` | 六边形头像 logo 行 | 六个六边形头像横排；姓名 + 职位；每人下方一条 `var(--border)` 分隔线与一个公司名占位（纯文字，不用 logo 图） |
| `people/row-circle-dark@v1` | 深色圆形头像行 | 深色底（`var(--text)` 作背景、`var(--bg)` 作前景）；五个圆形头像，每个身后一个 `var(--accent)` 圆形色块；姓名 + 职位 |
| `people/row-hex-timeline@v1` | 六边形头像时间轴 | 五个六边形头像横排 + 姓名职位；下方一条横线串五个节点，每节点上时间、下议题 |
| `people/cards-four@v1` | 四栏人物卡 | 四个人像**不裁切**、底部对齐、占满各自栏的下半部；栏上方姓名 + 职位，栏下方一段简介；四栏之间用 `var(--border)` 细线分隔 |
| `people/cards-blocks@v1` | 色块列人物 | 四个 `var(--brand)` 矩形色块错落（高度不同）；每个人像嵌在色块内（人像下半部被色块盖住）；色块上写姓名 + 职位 |
| `people/ribbon-tags@v1` | 斜切飘带 | 一条 `var(--brand)` 斜带贯穿整页（`transform: rotate(-6deg)`）；四个头像嵌在带内；每人姓名竖排 + 一个描边标签写角色；带外写关系说明 |
| `people/ribbon-blocks@v1` | 斜切色块 | 红白斜块交替（`clip-path` 切梯形）；四个人像立在斜块上（下半部被块盖住）；块上方姓名与角色，块下方关系说明 |
| `people/slab-photos@v1` | 斜切照片栏 | 四栏斜切面板，每栏一块 `var(--surface)` 底 + 一个人像；人像上方标题条、下方三行说明；栏与栏之间留 8px 缝 |
| `people/personas@v1` | 受众画像 | 左侧 26% 写标题与一段说明；右侧三栏，每栏一个人像 + 一块半透明 `var(--brand)` 遮罩（`opacity:.55`）压在人像下半部，遮罩上写人群名、属性标签与详述 |
| `people/hex-grid@v1` | 六边形网格 | 左侧 30% 写标题与说明段落；右侧九个六边形头像错落排布（三行，奇偶行错开半格），大小不一 |

**写完之后自查一遍**：每份的 `data-lumen-image` 编号是否从 1 连续（漏号会让
`fillImageSlots` 把后面的格子挪过来，页面上看不出来但人是错的）。

- [ ] **Step 4: 跑测试确认它通过**

Run: `node --import tsx --test packages/ir-schema/src/people-layouts.test.ts`
Expected: PASS，`fail 0`。

再跑一遍这个包的全部测试，确认没带坏别的：

Run: `node --import tsx --test packages/ir-schema/src/*.test.ts`
Expected: `fail 0`。

- [ ] **Step 5: 提交**

```bash
git add packages/ir-schema/src/people-skeletons.ts packages/ir-schema/src/people-layouts.test.ts
git commit -m "feat(ir-schema): 人物页 16 份版式骨架"
```

---

## Task 3: 生成时注入候选

**Files:**
- Modify: `packages/server-core/src/services/generate-html.service.ts`（`callModel` 与它的调用处）
- Test: `packages/server-core/src/services/generate-html.test.ts`

- [ ] **Step 1: 写失败的测试**

`generate-html.test.ts` 里已有 `makeDoc(over)`（可覆盖 `pagePrompts`）、`makeProject()`、
`fakeGateway(replies)`（回 `{ gateway, seen }`，`seen[i].messages[0].content` 是发出去的用户消息）。
文件顶部常量区加一条人物页提示词：

```ts
const PEOPLE_PROMPT = '角色：版式设计师。\n任务：写人物页。\n视觉与排版要求：\n1. 人像横排。\n代码要求（非常重要）：\n1. 用 :root 定义变量。';
```

文件末尾追加：

```ts
test('人物页的请求带上了版式候选，其他页类型不带', async () => {
  const doc = makeDoc({
    pagePrompts: {
      cover: { pageType: 'cover', prompt: COVER_PROMPT, mockHtml: '<div>样机</div>', source: 'reference' },
      text: { pageType: 'text', prompt: TEXT_PROMPT, mockHtml: '<div>样机</div>', source: 'derived' },
      people: { pageType: 'people', prompt: PEOPLE_PROMPT, mockHtml: '<div>样机</div>', source: 'derived' },
    },
  });
  const project = makeProject();

  const people = fakeGateway([goodHtml('核心团队')]);
  await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: {
      pageType: 'people', title: '核心团队', claim: '四位创始人', section: '',
      points: ['甲', '乙', '丙', '丁'], visualForm: '',
    } as never,
    doc,
    pageIndex: 0,
    totalPages: 5,
    gateway: people.gateway as never,
  });
  const sent = people.seen[0]!.messages[0]!.content;
  assert.match(sent, /人物页有多种版式/, '人物页没带上版式说明——模型又回到每次自由发挥');
  assert.match(sent, /```html/, '版式说明里没有骨架示例');
  assert.match(sent, /data-lumen-cutout/, '骨架里没有抠图标记，人像位会被裁');

  const text = fakeGateway([goodHtml('正文')]);
  await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: { pageType: 'text', title: '正文', claim: '一段话', section: '', points: [] } as never,
    doc,
    pageIndex: 1,
    totalPages: 5,
    gateway: text.gateway as never,
  });
  assert.ok(
    !/人物页有多种版式/.test(text.seen[0]!.messages[0]!.content),
    '别的页类型也带上了版式说明，白花提示词',
  );
});
```

注意：`visualForm` 在 `OutlinePage` 上是 **optional**（`deck.ts:46`，老数据运行时是
`undefined`），所以上面两处 `outline` 里给了它、但类型上可以不给。若 `deck.ts` 与这里
写的对不上，**停下来报告**，不要自己加字段——加字段会连带影响教案与大纲的落库。

- [ ] **Step 2: 跑测试确认它失败**

Run: `node --import tsx --test packages/server-core/src/services/generate-html.test.ts`
Expected: FAIL —— 人物页那条 `assert.match(sent, /人物页有多种版式/)` 红。

- [ ] **Step 3: 实现**

`generate-html.service.ts`：

① 顶部 import 加上（`@lumen/ir-schema` 已经在这个文件里 import 了别的东西，加到同一处）：

```ts
import { peopleLayoutBlock, peopleLayoutCandidates } from '@lumen/ir-schema';
```

② 在 `generatePageHtml` 里、`callModel` 调用处之前算出这一段：

```ts
  /**
   * 人物页有十几种版式，让模型每次自由发挥是排不出该有的样子的。这里按这一页的内容
   * 筛出几个候选（规则见 `peopleLayoutCandidates`），把它们的骨架当示例塞进提示词。
   *
   * **只带候选组，不带全部 16 个**：一次多带约 4–8KB，而不是 16–32KB。
   * **不多一次模型调用**——挑版式与写 HTML 是同一次调用里的两件事。
   */
  const layoutBlock = pageType === 'people'
    ? peopleLayoutBlock(peopleLayoutCandidates({
        title: input.outline.title,
        claim: input.outline.claim,
        points: input.outline.points,
        // `visualForm` 在 `OutlinePage` 上是 `optional`（老数据运行时就是 undefined），
        // 而规则函数要的是 `string`——这里收一下，不要往规则里塞 undefined
        visualForm: input.outline.visualForm ?? '',
      }))
    : '';
```

注意：字段名以 `packages/ir-schema/src/deck.ts` 的 `OutlinePage` 为准（已核对：
`title` / `claim` / `points`（`.max(5)`）/ `visualForm`（optional）四个都在）。
若与这里写的不符，**停下来报告**，不要自己加字段。

③ `callModel` 的签名加一个参数，并把它拼进用户消息：

```ts
async function callModel(
  gateway: ProviderGateway,
  prompt: string,
  doc: StyleDoc,
  content: string,
  brand?: BrandSlot,
  layoutBlock = '',
): Promise<string> {
```

用户消息里，**版式块放在配色之后、本页内容之前**（先讲怎么排，再讲写什么）：

```ts
      content: [
        prompt,
        '',
        '---',
        paletteBlockOf(doc),
        ...(doc.spec ? ['', '---', specBlock(doc.spec)] : []),
        ...(layoutBlock ? ['', '---', layoutBlock] : []),
        ...(brand ? ['', brandBlock(brand)] : []),
        '',
        '---',
        content,
      ].join('\n'),
```

④ 两处 `callModel(...)` 调用都补上这个参数（重试那处也要——重试是在同一页上重写，
版式说明漏了它就会换一种排法）：

```ts
    html = await callModel(gateway, chosen.prompt, input.doc, brief, input.brand, layoutBlock);
```

- [ ] **Step 4: 跑测试确认它通过**

Run: `node --import tsx --test packages/server-core/src/services/generate-html.test.ts`
Expected: PASS，`fail 0`。

- [ ] **Step 5: 提交**

```bash
git add packages/server-core/src/services/generate-html.service.ts packages/server-core/src/services/generate-html.test.ts
git commit -m "feat(server-core): 人物页生成时带上版式候选"
```

---

## Task 4: 能力总览里摆出来

**Files:**
- Modify: `apps/web/src/pages/Studio.tsx`（`ModuleGallery`）

- [ ] **Step 1: 加一张卡**

`ModuleGallery` 的返回里，在「页类型装饰件」那张卡**之前**插入。import 处加上：

```tsx
import { PEOPLE_LAYOUTS, PEOPLE_GROUP_ORDER, peopleGroupLabel } from '@lumen/ir-schema';
```

```tsx
      <Card>
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[15px] font-semibold text-[var(--text-1)]">人物排版</h2>
            <p className="text-[13px] leading-[1.6] text-[var(--text-3)]">
              人物页有十六种版式，按内容分五组。生成人物页时会按这一页的内容筛出一组候选，
              由模型挑一个照着排。下面这些是**骨架本身**——颜色全部走这套风格的 CSS 变量，
              所以换风格它们跟着变。
            </p>
          </div>
          {PEOPLE_GROUP_ORDER.map((g) => {
            const items = PEOPLE_LAYOUTS.filter((l) => l.group === g);
            if (items.length === 0) return null;
            return (
              <div key={g} className="flex flex-col gap-3">
                <span className="text-[12px] font-medium text-[var(--text-3)]">
                  {peopleGroupLabel(g)}（{items.length}）
                </span>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                  {items.map((l) => (
                    <div key={l.id} className="flex flex-col gap-2">
                      <div className="overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)]">
                        <HtmlMock
                          doc={doc}
                          html={l.skeleton}
                          width={400}
                          images={skeletonImages[l.id]}
                          pageType="people"
                          pageNo={1}
                          frame={false}
                        />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[13px] font-medium text-[var(--text-1)]">{l.name}</span>
                        <span className="text-[12px] leading-[1.6] text-[var(--text-3)]">{l.brief}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </CardBody>
      </Card>
```

② 配图要**整组一起分**——各挑各的会让十六张骨架撞成同一张画面（`useMockImages` 的注释
写的就是这件事）。在 `ModuleGallery` 里、`demoImages` 之后加：

```tsx
  // 十六份骨架共用一套配色，配图必须整组一起分，否则十六张样机会撞成同一张画面。
  // `useMockImages` 是 hook，**不能在 .map 里调**——所以先一次拿到二维数组，再按 id 拆开。
  // 一次要的图位很多（十六份加起来上百个），`allocateStockImages` 会按池子回绕，
  // 那是它的既定行为，不是这里要处理的事
  const skeletonFragments = useMemo(() => PEOPLE_LAYOUTS.map((l) => l.skeleton), []);
  const flat = useMockImages(doc, skeletonFragments);
  const skeletonImages = useMemo(
    () => Object.fromEntries(PEOPLE_LAYOUTS.map((l, i) => [l.id, flat[i] ?? []])),
    [flat],
  );
```

- [ ] **Step 2: 类型检查**

Run: `pnpm --filter @lumen/web typecheck`
Expected: Done，没有 TS 错。

- [ ] **Step 3: 提交**

```bash
git add apps/web/src/pages/Studio.tsx
git commit -m "feat(web): 能力总览里摆出十六种人物版式"
```

---

## Task 5: 全量验证与浏览器实测

- [ ] **Step 1: 四条门禁**

```
pnpm -r typecheck
pnpm -r test
pnpm test
pnpm build
```

`pnpm -r test` **不跑 `apps/web`**（它没有 test script），所以第四条不能省。

- [ ] **Step 2: 浏览器实测**

dev server 起在 5273（`.claude/launch.json` 的 `lumen-dev`），用 admin 登录。
进「能力总览」→「功能模块」→ 拉到「人物排版」。

逐条看：

1. **十六个样机都渲染出来**了（按组分段：单人 3 / 并列人物行 6 / 人物卡 5 / 受众画像 1 / 多人网格 1）
2. **人像位里是真人物抠图**——判据是「背景是页面底色，不是照片背景」
3. **圆形与六边形版式里的人物是裁切的头像**，不是「整个人缩在圆圈里」。
   这条验的是那条 `object-fit: contain !important` 有没有被绕过——量一下
   `.avatar img` 的 `getComputedStyle().objectFit` 应当是 `contain`，
   而**视觉上仍然是裁切的**（因为裁切发生在容器的 `overflow:hidden` 上）。
   如果看到整个人缩在圆圈中央，就是容器裁那一步没写对
4. **换一套风格**（顶部那个 SegmentedControl），十六个样机的配色与字体跟着变——
   这条验的是「骨架只用 CSS 变量取色」有没有写漏

- [ ] **Step 3: 生成实测**

真生成一页人物页（约一次模型调用，**跑之前跟用户确认**），看：
模型有没有在候选里挑一个、排出来的东西像不像那个版式。

- [ ] **Step 4: 提交实测记录（如果有改动）**

实测里改了代码才提交；没改就不提交，把结论写进给用户的汇报里。
