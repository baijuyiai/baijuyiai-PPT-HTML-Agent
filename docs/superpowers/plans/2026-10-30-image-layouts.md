# 多图排版 26 种版式 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给「图片排版页」（`gallery`）建一个 26 种版式的骨架库，生成时按张数与内容形态筛出候选塞进提示词，并在能力总览的「功能模块」里全部渲染出来。

**Architecture:** 骨架是风格无关的 HTML（只用 `paletteVars` 注入的 CSS 变量取色），放在 `@lumen/ir-schema`；`server-core` 在拼生成请求时按规则筛出候选组、拼成一段提示词；`apps/web` 的「功能模块」tab 直接渲染骨架。

**Tech Stack:** TypeScript（NodeNext / verbatimModuleSyntax）、React 19、`node --import tsx --test`、Playwright（实测）。

设计文档：[docs/superpowers/specs/2026-10-30-image-layouts-design.md](../specs/2026-10-30-image-layouts-design.md)

---

## 文件结构

| 文件 | 动作 | 责任 |
|---|---|---|
| `packages/ir-schema/src/image-skeletons.ts` | 新建 | 26 份 HTML 骨架，纯数据 |
| `packages/ir-schema/src/image-layouts.ts` | 新建 | 类型、注册表、候选规则、提示词拼装 |
| `packages/ir-schema/src/image-layouts.test.ts` | 新建 | 骨架约束 + 候选规则的单测 |
| `packages/ir-schema/src/index.ts` | 改 | 加一行导出 |
| `packages/server-core/src/services/generate-html.service.ts` | 改 | `gallery` 页注入候选 |
| `packages/server-core/src/services/generate-html.test.ts` | 改 | 注入的单测 |
| `apps/web/src/pages/Studio.tsx` | 改 | 「功能模块」加一张「多图排版」卡 |

**为什么拆两个文件**：26 份骨架约 2000 行，与「类型 + 规则」混在一起，改规则时要在一堆 HTML 里翻。与人物排版（`people-skeletons.ts` / `people-layouts.ts`）同构。

**两条必须守住的规矩**（人物排版那次已经写下）：

1. **`fillImageSlots` 的取图规则只有一份。** 骨架里的 `data-lumen-image` 编号**必须从 1 起连续**——跳号会让 `fillImageSlots` 把后面的格子挪过来，页面上看不出来但图是错的。
2. **骨架只用 CSS 变量取色。** `lintMockHtml`（`packages/render-engine/src/codegen.ts:152`）把非配色的 hex 判成 `error`，变量定义里的颜色也查。

### 骨架的房屋风格

每份都照这个来，不要各写各的：

- 根：`<div class="page">`，`.page{width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);color:var(--text);font-family:var(--font-sans)}`
- 边距：左右 96px，上下 72px
- 标题 44px / 600；小标题 26px / 600；说明 18px / 400 且用 `var(--muted)`
- 装饰件：只用 `var(--brand)` / `var(--accent)` 的纯色块、`linear-gradient` 与 `var(--border)` 的细线，不用图片、不用 emoji
- 图位：`<img data-lumen-image="n" alt="">`，**不写 `src`、不写 `data-lumen-cutout`**
- 图片一律配 `object-fit: cover`（圆形/多边形用 `border-radius` / `clip-path` 直接切）
- 图位外面套一个 `.ph` 占位底色（`background: var(--surface)`），图片加载前不至于是一片白

**不要写 `position: fixed`、不要用 `vh` 单位**——画布固定 1920×1080，靠外层 `transform: scale()` 适配，这两种写法在编辑器里看着正常、一导出就错位（`codegen.ts:222`）。

---

## Task 1: 类型、注册表与候选规则

**Files:**
- Create: `packages/ir-schema/src/image-layouts.ts`
- Create: `packages/ir-schema/src/image-skeletons.ts`（本任务只放一个空数组，Task 2 填）
- Create: `packages/ir-schema/src/image-layouts.test.ts`
- Modify: `packages/ir-schema/src/index.ts`

- [ ] **Step 1: 先建一个空的骨架数组**

`packages/ir-schema/src/image-skeletons.ts`：

```ts
import type { ImageLayout } from './image-layouts.js';

/**
 * 图片排版页的 26 份版式骨架。约束（只用 CSS 变量、图位不写 cutout 标记）
 * 见 `image-layouts.ts` 顶部的说明。
 *
 * 每份都是**片段**（`<style>` + 一个根 `<div class="page">`），不是完整文档——
 * `buildPageDocument` 会把它包进 html/head/body，并注入配色变量与图位规则。
 *
 * 画布固定 1920×1080。边距左右 96px、上下 72px。
 */
export const IMAGE_SKELETONS: ImageLayout[] = [];
```

- [ ] **Step 2: 写类型、注册表与规则**

`packages/ir-schema/src/image-layouts.ts`：

```ts
import { IMAGE_SKELETONS } from './image-skeletons.js';

/**
 * 图片排版页（`gallery`）的版式库。
 *
 * ## 为什么要有它
 *
 * `gallery` 是「多张图成组铺开、以图为主」的页类型，此前只有一条按风格写的提示词，
 * 版式由模型自由发挥——同一套风格每次排出来的不一样，也排不出「弧形卡扇」「斜切面板」
 * 「拍立得散落」这类有明确形态的东西。
 *
 * ## 与人物排版的三个不同
 *
 * 1. **图从普通池取**（28 张照片），不是人物池。所以图位**不写 `data-lumen-cutout`**
 *    ——写了会被当抠图位、从人物池取人像，一页多图排版里冒出 12 张人像不是配图。
 * 2. **槽位数封顶 12**：普通池按明暗硬筛（`stock-library/src/index.ts` 的 `toneMatched`），
 *    深色风格单页只能拿到 13 张，超出的图位会退化成占位块。
 * 3. **决定版式的量是张数**，不是人数。所以候选规则先按 `slots` 筛，再按内容形态挑。
 */
export type ImageGroup = 'grid' | 'collage' | 'arc' | 'slant' | 'spread' | 'stagger';

/** 界面与提示词里的排列顺序 */
export const IMAGE_GROUP_ORDER: ImageGroup[] = ['grid', 'collage', 'arc', 'slant', 'spread', 'stagger'];

const GROUP_LABEL: Record<ImageGroup, string> = {
  grid: '网格',
  collage: '拼贴',
  arc: '弧形',
  slant: '斜切透视',
  spread: '主次跨页',
  stagger: '错落',
};

export function imageGroupLabel(g: ImageGroup): string {
  return GROUP_LABEL[g];
}

export interface ImageLayout {
  /** 形如 `gallery/mosaic-fullbleed@v1` */
  id: string;
  /** 中文名，界面与提示词都用它 */
  name: string;
  /** 一句话：适合什么内容 */
  brief: string;
  group: ImageGroup;
  /**
   * 这份骨架里有几个图位。**显式写死，不靠数骨架**：候选规则要在不解析 HTML 的
   * 前提下按张数筛，而「从产物反推约束」在骨架改一格忘同步时会静默放一个填不满的
   * 版式进来。单测钉住它等于骨架里实际的图位数。
   */
  slots: number;
  /** HTML 片段：`<style>` + 一个根 `<div>`。约束见模块顶部注释 */
  skeleton: string;
}

export const IMAGE_LAYOUTS: ImageLayout[] = IMAGE_SKELETONS;

const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9,
};

/**
 * 中文数词 → 阿拉伯数字。支持「十」「十二」「二十」「二十三」。
 *
 * 人物排版那份只认单个汉字（`people-layouts.ts` 的 `CN_NUM`），因为它抓的量词是
 * 位/个/名/人，很少写成「十二位」。图片排版页写「十二张」很自然，所以这里要认。
 */
function cnNumber(raw: string): number | undefined {
  const m = /^([一二两三四五六七八九])?十([一二三四五六七八九])?$/.exec(raw);
  if (m) {
    const tens = m[1] ? CN_NUM[m[1]]! : 1;
    const ones = m[2] ? CN_NUM[m[2]]! : 0;
    return tens * 10 + ones;
  }
  return CN_NUM[raw];
}

/**
 * 估这一页要几张图。抓不到回 `null`。
 *
 * **回 `null` 而不是 0**：0 表示「确实没有图」，`null` 表示「估不出来」，
 * 两者在 `imageLayoutCandidates` 里走不同的分支。
 *
 * 只看 `visualForm` 与 `points`：标题里常有「三大优势」这种与图片张数无关的数字。
 */
export function estimateImageCount(visualForm: string, points: string[]): number | null {
  /**
   * 十位的可选前缀**必须在最前面**：写成 `(十[一二三四五六七八九]?|[一二两三四五六七八九]|\d+)`
   * 时，「二十张图」会从「十」那一格开始匹配、解析成 10 而不是 20——正则会从能匹配的
   * 最左位置起算，而不是最长的那个。
   */
  const m = /((?:[一二两三四五六七八九])?十[一二三四五六七八九]?|[一二两三四五六七八九]|\d+)\s*(?:张|幅|格|个)\s*(?:图|照片|图片|画面)?/.exec(visualForm);
  if (m) {
    const raw = m[1]!;
    const n = /^\d+$/.test(raw) ? Number(raw) : cnNumber(raw);
    if (n !== undefined) return n;
  }
  return points.length > 0 ? points.length : null;
}

/** 内容形态 → 组。一个都没命中时按张数降序取（见下） */
const GROUP_RE: Record<ImageGroup, RegExp> = {
  grid: /网格|矩阵|宫格|拼图|瀑布|图墙|马赛克/,
  collage: /拼贴|拍立得|手账|散落|便签|贴纸|剪贴/,
  arc: /弧|拱|环|圆|扇形|放射|环绕/,
  slant: /斜切|平行四边形|透视|立体|等距|堆叠|倾斜/,
  spread: /主图|大图|跨页|杂志|主次|特写/,
  stagger: /错落|高低|编号|序列|时间线|列表|阶梯/,
};

/** 估出来的张数太小（比如 2）时的保底档：小版式一定填得满 */
const SMALL_MAX = 4;
/** 候选封顶。与人物排版一致——一次多带 4–8KB，不是 26 份骨架 */
const MAX_CANDIDATES = 6;
/** 命中的组里每组取几个 */
const PER_GROUP = 2;

/** 张数多的画面最满，图片排版页最常见的正是「铺满」——所以一律按 slots 降序 */
const bySlotsDesc = (a: ImageLayout, b: ImageLayout) => b.slots - a.slots;

/**
 * 按这一页的内容筛出候选版式。**返回的数组一定非空。**
 *
 * 两层：**先按张数筛掉填不满的，再按内容形态挑**。张数是硬约束——一个要 12 张图的
 * 版式，这一页只有 4 张时用不了，多出来的图位会变成占位块。
 *
 * 规则是**猜的**，靠实测校准。所以它单独成函数、单独测，调的时候不用碰骨架。
 */
export function imageLayoutCandidates(input: {
  title: string; claim: string; points: string[]; visualForm: string;
}): ImageLayout[] {
  const text = [input.title, input.claim, input.visualForm, ...input.points].join(' ');
  const n = estimateImageCount(input.visualForm, input.points);

  let usable = n === null ? IMAGE_LAYOUTS : IMAGE_LAYOUTS.filter((l) => l.slots <= n);
  /**
   * 估出来的张数比最小版式还小（比如 2）时会一个不剩——回退到「小版式」那一档。
   *
   * 宁可给几个填得满的，也不要空手：没有候选就等于退回「模型自由发挥」，
   * 而那正是这一整套东西要治的病。
   */
  if (usable.length < 3) usable = IMAGE_LAYOUTS.filter((l) => l.slots <= SMALL_MAX);

  const hits = IMAGE_GROUP_ORDER.filter((g) => GROUP_RE[g].test(text));
  const picked: ImageLayout[] = [];
  const seen = new Set<string>();
  const take = (l: ImageLayout) => {
    if (seen.has(l.id) || picked.length >= MAX_CANDIDATES) return;
    seen.add(l.id);
    picked.push(l);
  };

  for (const g of hits) {
    for (const l of usable.filter((x) => x.group === g).sort(bySlotsDesc).slice(0, PER_GROUP)) take(l);
  }
  // 命中组不够时按张数降序补满。命中组为空时这一轮就是全部候选——
  // 张数多的画面最满，没有别的信号时它是最稳的选择
  for (const l of [...usable].sort(bySlotsDesc)) take(l);

  return picked;
}

/**
 * 拼成提示词里的那一段。
 *
 * 骨架用 ```html 围栏包着：模型对围栏里的内容会更当成「示例」而不是「正文」，
 * 而且围栏能挡住骨架里的缩进被当成正文缩进。
 */
export function imageLayoutBlock(candidates: ImageLayout[]): string {
  const items = candidates.map((l) =>
    `【${l.name}】${l.brief}\n\n\`\`\`html\n${l.skeleton}\n\`\`\``,
  );
  return [
    '这一页是图片排版页。图片排版页有多种版式，**按这一页的内容挑一种**，不要每页都用同一个。',
    '下面是适合这一页的几个候选：',
    '',
    ...items,
    '',
    '挑一个，然后用**这套风格**的视觉语言把它写出来。',
    '**骨架里的图片说明文字、标签、编号全是示例**（写具体是为了让版式的疏密看得出来），',
    '一律换成这一页的实际内容，一个都不要照抄。骨架的配色一律走 CSS 变量，不要写死色值。',
  ].join('\n');
}
```

- [ ] **Step 3: 导出**

`packages/ir-schema/src/index.ts`，在 `export * from './people-layouts.js';` 那行下面加：

```ts
export * from './image-layouts.js';
```

- [ ] **Step 4: 写候选规则的单测**

`packages/ir-schema/src/image-layouts.test.ts`：

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { IMAGE_GROUP_ORDER, IMAGE_LAYOUTS, estimateImageCount, imageLayoutCandidates, imageGroupLabel } from './image-layouts.js';

test('估张数：阿拉伯数字与中文数词都认', () => {
  assert.equal(estimateImageCount('六张产品图排成两行', []), 6);
  assert.equal(estimateImageCount('12 张照片铺满整页', []), 12);
  assert.equal(estimateImageCount('十张图', []), 10);
  assert.equal(estimateImageCount('十二张图', []), 12);
  assert.equal(estimateImageCount('二十张图', []), 20);
});

test('估张数：visualForm 抓不到时退回要点条数，都没有回 null', () => {
  assert.equal(estimateImageCount('左侧主图右侧说明', ['a', 'b', 'c']), 3);
  // 回 null 而不是 0——「估不出来」与「确实没有图」是两件事
  assert.equal(estimateImageCount('左侧主图右侧说明', []), null);
});

test('估张数：只看 visualForm 与要点，不看标题里的无关数字', () => {
  // 「三大优势」不是图片张数。标题不参与估算，所以这里应当回 null 而不是 3
  assert.equal(estimateImageCount('', []), null);
});

test('26 个版式的 id 唯一，分组数是 4 / 5 / 4 / 5 / 5 / 3', () => {
  assert.equal(IMAGE_LAYOUTS.length, 26);
  assert.equal(new Set(IMAGE_LAYOUTS.map((l) => l.id)).size, 26);
  const counts = IMAGE_GROUP_ORDER.map((g) => IMAGE_LAYOUTS.filter((l) => l.group === g).length);
  assert.deepEqual(counts, [4, 5, 4, 5, 5, 3]);
  for (const g of IMAGE_GROUP_ORDER) assert.ok(imageGroupLabel(g).length > 0, `${g} 缺中文名`);
});

test('slots 等于骨架里实际的图位数，且都在 4–12 之间', () => {
  for (const l of IMAGE_LAYOUTS) {
    const ns = [...l.skeleton.matchAll(/data-lumen-image\s*=\s*["']?(\d+)/gi)].map((m) => Number(m[1]));
    assert.equal(new Set(ns).size, l.slots, `${l.id} 的 slots 写的是 ${l.slots}，骨架里是 ${new Set(ns).size}`);
    assert.ok(l.slots >= 4 && l.slots <= 12, `${l.id} 的 slots=${l.slots} 越界（4–12）`);
  }
});

test('骨架的图位编号从 1 起连续', () => {
  for (const l of IMAGE_LAYOUTS) {
    const ns = [...new Set([...l.skeleton.matchAll(/data-lumen-image\s*=\s*["']?(\d+)/gi)].map((m) => Number(m[1])))].sort((a, b) => a - b);
    assert.deepEqual(ns, Array.from({ length: ns.length }, (_, i) => i + 1), `${l.id} 的图位编号不连续，fillImageSlots 会漏格`);
  }
});

test('图位不写 cutout 标记、不写 src——这些是普通照片，走普通池', () => {
  for (const l of IMAGE_LAYOUTS) {
    const imgs = [...l.skeleton.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]!);
    assert.ok(imgs.length > 0, `${l.id} 没有 <img>`);
    for (const tag of imgs) {
      assert.ok(!/data-lumen-cutout/i.test(tag), `${l.id} 的图位标了抠图，会从人物池取人像：${tag.slice(0, 80)}`);
      assert.ok(!/\bsrc\s*=/i.test(tag), `${l.id} 的图位写了 src，填图时会被盖掉：${tag.slice(0, 80)}`);
    }
  }
});

test('骨架是片段，且不写死色值', () => {
  for (const l of IMAGE_LAYOUTS) {
    assert.ok(l.skeleton.includes('<style>'), `${l.id} 没有 <style>`);
    assert.ok(!/<!DOCTYPE|<html|<body/i.test(l.skeleton), `${l.id} 是完整文档，该是片段`);
    assert.ok(/width:\s*1920px/.test(l.skeleton), `${l.id} 没定画布宽（画布是 1920×1080）`);
    // 抠掉变量定义之后不该还有 hex
    const body = l.skeleton.replace(/--[a-z-]+\s*:\s*#[0-9a-f]{3,8}/gi, '');
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(body), `${l.id} 里有写死的色值，换风格不会跟着变`);
  }
});

test('候选：张数估得出时，不带 slots 超过它的版式', () => {
  const picked = imageLayoutCandidates({ title: '', claim: '', points: [], visualForm: '四张图横排' });
  assert.ok(picked.length > 0);
  for (const l of picked) assert.ok(l.slots <= 4, `${l.id} 要 ${l.slots} 张图，这一页只有 4 张`);
});

test('候选：张数估不出时给满 6 个，且按张数降序', () => {
  const picked = imageLayoutCandidates({ title: '产品一览', claim: '', points: [], visualForm: '' });
  assert.equal(picked.length, 6);
  for (let i = 1; i < picked.length; i++) {
    assert.ok(picked[i - 1]!.slots >= picked[i]!.slots, '候选没有按张数降序');
  }
});

test('候选：内容形态命中时，该组排在前面', () => {
  const picked = imageLayoutCandidates({
    title: '团队照片墙', claim: '', points: [], visualForm: '六张图排成网格',
  });
  assert.ok(picked.length > 0);
  assert.equal(picked[0]!.group, 'grid', `第一条候选该是网格组，实际是 ${picked[0]!.group}`);
});

test('候选：六个组的关键词各命中一次', () => {
  const cases: [string, string][] = [
    ['grid', '六张图排成网格'], ['collage', '照片拼贴成拍立得'], ['arc', '卡片排成弧形'],
    ['slant', '斜切面板错开'], ['spread', '左侧主图右侧说明'], ['stagger', '图片错落排布'],
  ];
  for (const [group, visualForm] of cases) {
    const picked = imageLayoutCandidates({ title: '', claim: '', points: [], visualForm });
    assert.equal(picked[0]!.group, group, `「${visualForm}」该先给 ${group}`);
  }
});

test('候选：张数比最小版式还小时回退到小版式，不空手', () => {
  const picked = imageLayoutCandidates({ title: '', claim: '', points: [], visualForm: '两张图' });
  assert.ok(picked.length > 0, '回退之后仍然空手了');
  for (const l of picked) assert.ok(l.slots <= 4);
});

test('候选：永不超过 6 个', () => {
  for (const vf of ['', '四张图', '十二张图排成网格', '斜切面板错开排布']) {
    const picked = imageLayoutCandidates({ title: '', claim: '', points: [], visualForm: vf });
    assert.ok(picked.length <= 6, `「${vf}」给了 ${picked.length} 个候选`);
  }
});
```

- [ ] **Step 5: 跑测试，确认只有「估张数」那三条是绿的**

Run: `node --import tsx --test packages/ir-schema/src/image-layouts.test.ts`
Expected: FAIL —— **只有 `估张数：…` 那三条应当过**（它们只依赖 `estimateImageCount`，
与骨架无关）。其余全红：`IMAGE_LAYOUTS` 还是空的，长度、分组数、`slots`、候选规则
那些用例都取不到东西。这是**预期的红**，Task 2 把骨架填上就转绿。

- [ ] **Step 6: 提交**

```bash
git add packages/ir-schema/src/image-layouts.ts packages/ir-schema/src/image-skeletons.ts packages/ir-schema/src/image-layouts.test.ts packages/ir-schema/src/index.ts
git commit -m "feat(ir-schema): 多图排版的类型、注册表与候选规则"
```

---

## Task 2: 26 份骨架

**Files:**
- Modify: `packages/ir-schema/src/image-skeletons.ts`（把 `IMAGE_SKELETONS` 填满）

**这一步由控制者本人写**（骨架要对着参考图排，26 张图在控制者的上下文里），不派子代理。

参考图在 `C:\Users\41945\Desktop\多图排版`。**图里的一切文案（「Project name」
「THE ROSELINE RING」「01」这类）都是占位示例**，写具体是为了让版式的疏密看得出来。

**六批写**，每批写完跑一次测试（`node --import tsx --test packages/ir-schema/src/image-layouts.test.ts`），
绿了再写下一批。一批一提交。

### 第一批：grid 网格（4 个）

| id | name | slots | 结构 |
|---|---|---|---|
| `gallery/grid-thumbs-hero@v1` | 缩略图墙 + 中央主图 | 10 | 三行四列圆角缩略图铺满整页（`.ph` 底 + `border-radius:16px`，格间 12px 缝）；中央叠一张 2×2 跨格的主图（`border-radius:24px`，投影用 `var(--border)`），主图上下各压一条 `var(--bg)` 半透明带写标题与副题；图位 1 是主图，2–10 是缩略图 |
| `gallery/mosaic-fullbleed@v1` | 满版瓦片马赛克 | 12 | 12 张圆角瓦片按 4 列铺满画布、高度不一（`grid-template-rows: repeat(12, 1fr)` 配 `span`），四周出血到画布外 24px；中央一条 `var(--bg)` 半透明横带压在大字上；大标题用 `var(--text)` 48px 衬在瓦片下层，压 60% 不透明 |
| `gallery/masonry-side-text@v1` | 左文右瀑布流 | 12 | 左 28%：页标题 44px + 两段说明 + 一条 `var(--accent)` 短横线；右 72%：四列瀑布流，12 张图高度按 3:2 / 2:3 / 1:1 三种循环，列间 16px |
| `gallery/magazine-grid@v1` | 非对称杂志网格 | 6 | 三列网格，格子高矮不一（1 号跨两行，6 号跨两列）；其中留两格不放图、改成文字块（`var(--surface)` 底 + 标题 + 两行说明）；页码与栏目标签用 `var(--muted)` 竖排贴在左边缘 |

### 第二批：collage 拼贴（5 个）

| id | name | slots | 结构 |
|---|---|---|---|
| `gallery/polaroid-scatter@v1` | 拍立得散落 | 7 | 7 张白边拍立得（`var(--surface)` 底 + 8px 内边距 + 下方 56px 留白写手写体说明）随机旋转 -12°~12°、错落叠放，投影用 `var(--border)`；每张下方一行 `var(--muted)` 小字；页左上角一行标题 |
| `gallery/polaroid-board@v1` | 拍立得便签板 | 8 | 底是一块 `var(--surface)` 大圆角板（带 `var(--border)` 描边）；板上一张日历网格（`var(--border)` 细线，日期用 `var(--muted)`）；8 张拍立得压在日历上、旋转错落；四角散 `var(--accent)` 小色块当贴纸；板右下角一块便签（`var(--bg)` 底）写一段引言 |
| `gallery/tiles-giant-type@v1` | 散落方图 + 巨型字穿插 | 7 | 7 张方图大小不一、位置错落（避开中央横带）；一行巨型字（`var(--text)` 160px / 700）横穿画面、**压在图片下层**；图与字之间的空隙填 `var(--brand)` 描边圆圈与细线；左下角一段说明 |
| `gallery/strips-giant-type@v1` | 图穿插巨型字 | 6 | 6 张圆角图横向错落排开（高低差 120px 以内）；一行巨型字（`var(--text)` 180px）压在下层，图的间隙里露出字；左上角小标题，右下角一段说明 |
| `gallery/scatter-around-title@v1` | 照片散落四角 + 中央大字 | 8 | 中央 40% 是标题区（页标题 56px + 一行 `var(--muted)` 说明 + 一条 `var(--brand)` 短横线）；8 张图分四组贴在四角与上下边（每张大小不同、都不带圆角），与标题区之间留出呼吸空间 |

### 第三批：arc 弧形（4 个）

| id | name | slots | 结构 |
|---|---|---|---|
| `gallery/arc-card-fan@v1` | 弧形卡扇 | 5 | 5 张竖卡沿一条弧线排开（`transform: rotate()` 从 -18° 到 18°，中间那张最大且不旋转、`z-index` 最高），两侧的卡部分出血到画布外；卡下方居中页标题 + 一行说明；卡底压一条 `var(--bg)` 半透明带写卡名 |
| `gallery/arc-cards-flat@v1` | 浅弧竖卡 | 5 | 5 张竖卡按浅弧排开（旋转 ±8° 以内，垂直偏移 ±40px，中间最大）；每张卡内底部压一条 `var(--surface)` 带写卡名；卡上方页标题，卡下方居中一段说明 + 一条 `var(--border)` 分隔线 |
| `gallery/ring-cards@v1` | 环形卡片拱 | 12 | 12 张圆角方卡沿一个椭圆环排布（用 `transform: rotate(θ) translateY(-R)` 绕中心转），每张按切线方向再转 `θ`；中间留空放标题区（页标题 + 一行说明 + 一个 `var(--brand)` 圆角按钮形状）；环的四角出血 |
| `gallery/circle-row@v1` | 大小不一圆形横排 | 8 | 8 个圆形图（`border-radius:50%`）横排，直径在 180–420px 之间交替、垂直中心错开；最左最右两个被画布边缘切掉一半；顶部页标题，底部一条 `var(--border)` 横线 + 居中一行说明 |

### 第四批：slant 斜切透视（5 个）

| id | name | slots | 结构 |
|---|---|---|---|
| `gallery/slant-strips@v1` | 斜切条交错 | 4 | 4 条平行四边形（`clip-path: polygon(8% 0, 100% 0, 92% 100%, 0 100%)`）竖向并排、上下交错；每条内部压一条 `var(--text)` 半透明药丸标签写场景名；顶部居中页标题 |
| `gallery/slant-panels-center@v1` | 斜切面板环绕中央文字 | 6 | 6 块斜切面板（左右两种相反方向）拼在四角与两侧，围出中央一块空白；中央是页标题 + 两行说明；每块面板角上写一个 `var(--muted)` 标签 |
| `gallery/slant-hero-panels@v1` | 主图 + 斜切面板阵 | 6 | 左 42% 一张主图（不带斜切，圆角）；右侧 2×3 斜切面板阵（同一方向），每块压一条 `var(--text)` 半透明标签；主图下方一行说明 |
| `gallery/iso-screens@v1` | 等距屏幕炸开 | 4 | 4 张圆角屏幕沿一条斜轴（`transform: rotate(-30deg) skewX(-8deg)`）依次散开、大小递减、投影加深；每张旁边引一条 `var(--border)` 细线连到一个 `var(--muted)` 标签；左侧 30% 写标题与说明 |
| `gallery/slab-stack@v1` | 堆叠板列表 | 7 | 7 块板从上到下叠（`transform: perspective(1200px) rotateX(58deg)`），每块露出一条顶面写标题 + 副题；板与板之间用 `var(--bg)` 的间隙分开；整叠居中，上下出血 |

### 第五批：spread 主次跨页（5 个）

| id | name | slots | 结构 |
|---|---|---|---|
| `gallery/hero-corners@v1` | 中央主图 + 四角小图 | 5 | 中央一张大图（占 52%×62%，圆角）；四角各一张小图（大小相同，圆角），每张压一条 `var(--text)` 半透明药丸标签；四张小图与中央大图之间的空隙里居中写一句说明 |
| `gallery/quad-arc-band@v1` | 四等分竖图 + 弧形说明带 | 4 | 上半 62% 四张等宽竖图并排（无圆角、无缝）；下半是一块 `var(--surface)` 底、上边缘用 `border-radius: 50% 50% 0 0 / 80px 80px 0 0` 起拱的说明带，带内居中页标题 + 一行八个小标签（`var(--muted)` 配 `var(--border)` 竖线分隔） |
| `gallery/cards-center-lift@v1` | 中间抬起的卡列 | 5 | 5 张竖卡并排，中间那张大 1.25 倍且向下沉 60px（`z-index` 最高），其余四张等高；每张底部压一条 `var(--bg)` 半透明带写卡名；卡上方页标题，卡下方居中一段说明 + 两个 `var(--border)` 圆形箭头 |
| `gallery/device-flanked@v1` | 中央设备 + 两侧竖卡 | 7 | 中央一张竖长图当「设备」（占 26%×76%，圆角 32px + `var(--border)` 粗描边）；两侧各三张竖卡（高度递减、垂直错开），每张底部写小字卡名；顶部居中页标题 + 一行说明 |
| `gallery/editorial-spread@v1` | 杂志跨页 | 5 | 左 26%：页标题（衬线感：`font-weight:400` + 大字号）+ 一行期号，下方两张小图并排；中间 40%：一张通高主图；右 26%：两张小图并排 + 一段说明 + 一个 `var(--accent)` 小标签 |

### 第六批：stagger 错落（3 个）

| id | name | slots | 结构 |
|---|---|---|---|
| `gallery/stagger-columns@v1` | 错落竖卡 + 背景大字 | 7 | 7 张竖卡（圆角 20px）垂直错开排开，垂直偏移按 ±160px 交替；每张底部压一条 `var(--bg)` 半透明带写卡名与副题；背景两行巨型字（`var(--text)` 200px）压在卡片下层，只露出上下两截；左上角小标题 |
| `gallery/numbered-strips@v1` | 编号竖条错落 | 5 | 5 张竖条图（无圆角）横排、上下交替错开（相邻差 140px）；每条旁边写一个大号编号（`var(--text)` 64px / 700）+ 两行 `var(--muted)` 说明；右下角一个斜体大词（`font-style:italic`，`var(--muted)`）压在留白处 |
| `gallery/labeled-mosaic@v1` | 图 + 标签错落马赛克 | 6 | 6 组「图 + 标签 + 段落」错落成三列；每组图上写一个小标题（`var(--text)` 22px / 600）、图下一行地点与两行 `var(--muted)` 说明；组的尺寸不一、垂直位置错开；左上角页标题 |

- [ ] **Step 1–6: 逐批写、逐批验、逐批提交**

每批：

1. 在 `IMAGE_SKELETONS` 里补上这一批
2. Run: `node --import tsx --test packages/ir-schema/src/image-layouts.test.ts`
   Expected: 这一批相关的用例转绿；总数不到 26 时 `IMAGE_LAYOUTS.length` 那条仍然红
3. 写完第六批后，全部应当绿
4. Run: `node --import tsx --test packages/ir-schema/src/*.test.ts`
   Expected: `fail 0`
5. ```bash
   git add packages/ir-schema/src/image-skeletons.ts
   git commit -m "feat(ir-schema): 多图排版骨架 · <这一批的组名>"
   ```

**每批写完自查一遍**：`data-lumen-image` 编号是否从 1 连续（漏号会让 `fillImageSlots`
把后面的格子挪过来，页面上看不出来但图是错的）。

---

## Task 3: 生成时注入候选

**Files:**
- Modify: `packages/server-core/src/services/generate-html.service.ts:157-173`
- Test: `packages/server-core/src/services/generate-html.test.ts`

- [ ] **Step 1: 扩现有的那条用例**

`packages/server-core/src/services/generate-html.test.ts:1007` 已经有一条
「人物页的请求带上了版式候选，其他页类型不带」。**不新写一条**——在同一条里加
`gallery` 那一档，它验的本来就是同一件事。

先把 `makeDoc` 的 `pagePrompts` 里补上 `gallery`（`:1009-1013`）：

```ts
      gallery: { pageType: 'gallery', prompt: GALLERY_PROMPT, mockHtml: '<div>样机</div>', source: 'derived' },
```

文件顶部（`PEOPLE_PROMPT` 那附近，`:46`）加一条常量：

```ts
const GALLERY_PROMPT = '角色：版式设计师。\n任务：写图片排版页。\n视觉与排版要求：\n1. 多张图铺开。\n代码要求（非常重要）：\n1. 用 :root 定义变量。';
```

然后在 `people` 那一段（`:1030`）**之后**、`text` 那一段（`:1036`）**之前**插入：

```ts
  const gallery = fakeGateway([goodHtml('产品一览')]);
  await generatePageHtml({
    projectId: project.projectId,
    tenantId: project.tenantId,
    userId: project.ownerId,
    outline: {
      pageType: 'gallery', title: '产品一览', claim: '六个场景', section: '',
      points: ['a', 'b', 'c', 'd', 'e', 'f'], visualForm: '六张图排成网格',
    } as never,
    doc,
    pageIndex: 2,
    totalPages: 5,
    gateway: gallery.gateway as never,
  });
  const sentGallery = gallery.seen[0]!.messages[0]!.content;
  assert.match(sentGallery, /图片排版页有多种版式/, '图片排版页没带上版式说明——模型又回到每次自由发挥');
  assert.match(sentGallery, /```html/, '版式说明里没有骨架示例');
  assert.ok(
    !/data-lumen-cutout/.test(sentGallery),
    '多图骨架里带了抠图标记，图位会去人物池取人像',
  );
```

最后把 `text` 那一段的断言（`:1047-1050`）改成两个页类型都挡：

```ts
  assert.ok(
    !/人物页有多种版式|图片排版页有多种版式/.test(text.seen[0]!.messages[0]!.content),
    '别的页类型也带上了版式说明，白花提示词',
  );
```

**这条断言必须同时改**：原来只挡「人物页有多种版式」，新链路漏进 `text` 页也测不出来。

- [ ] **Step 2: 跑测试确认它失败**

Run: `node --import tsx --test packages/server-core/src/services/generate-html.test.ts`
Expected: FAIL —— `这一页是图片排版页` 匹配不到。

- [ ] **Step 3: 改注入那一段**

`packages/server-core/src/services/generate-html.service.ts`，把 `:157-173` 那段
（现在只有 `pageType === 'people'` 一个分支）换成：

```ts
  /**
   * 人物页与图片排版页各有十几种版式，让模型每次自由发挥是排不出该有的样子的。
   * 这里按这一页的内容筛出几个候选，把它们的骨架当示例塞进提示词。
   *
   * **只带候选组，不带全部**：一次多带约 4–8KB，而不是 16–32KB。
   * **不多一次模型调用**——挑版式与写 HTML 是同一次调用里的两件事。
   */
  const layoutInput = {
    title: input.outline.title,
    claim: input.outline.claim,
    points: input.outline.points,
    // `visualForm` 在 `OutlinePage` 上是 optional（老数据运行时是 undefined），
    // 而规则函数要的是 `string`——这里收一下，不要往规则里塞 undefined
    visualForm: input.outline.visualForm ?? '',
  };
  const layoutBlock = pageType === 'people'
    ? peopleLayoutBlock(peopleLayoutCandidates(layoutInput))
    : pageType === 'gallery'
      ? imageLayoutBlock(imageLayoutCandidates(layoutInput))
      : '';
```

顶部 import 补上：

```ts
import { imageLayoutBlock, imageLayoutCandidates, peopleLayoutBlock, peopleLayoutCandidates } from '@lumen/ir-schema';
```

（原有的 `peopleLayoutBlock, peopleLayoutCandidates` 那一行合并进去。）

- [ ] **Step 4: 跑测试确认它通过**

Run: `node --import tsx --test packages/server-core/src/services/generate-html.test.ts`
Expected: PASS，`fail 0`。

- [ ] **Step 5: 提交**

```bash
git add packages/server-core/src/services/generate-html.service.ts packages/server-core/src/services/generate-html.test.ts
git commit -m "feat(generate): 图片排版页生成时注入多图排版候选"
```

---

## Task 4: 能力总览里摆出来

**Files:**
- Modify: `apps/web/src/pages/Studio.tsx:7`（import）、`:240-247`（配图）、`:325-368` 之后（新卡片）

- [ ] **Step 1: 加 import**

`apps/web/src/pages/Studio.tsx` 顶部，`@lumen/ir-schema` 那段 import 里加：

```ts
  IMAGE_GROUP_ORDER, IMAGE_LAYOUTS, imageGroupLabel,
```

（与已有的 `PEOPLE_GROUP_ORDER, PEOPLE_LAYOUTS, peopleGroupLabel` 并排。）

- [ ] **Step 2: 整组一次分配配图**

`ModuleGallery` 里，`skeletonImages` 那个 `useMemo`（`:240-247`）下面加：

```tsx
  // 26 份多图骨架同理：整组一次分配，否则 26 张样机会撞成同一张画面
  const imageFragments = useMemo(() => IMAGE_LAYOUTS.map((l) => l.skeleton), []);
  const imageFlat = useMockImages(doc, imageFragments);
  const imageLayoutImages = useMemo(
    () => Object.fromEntries(IMAGE_LAYOUTS.map((l, i) => [l.id, imageFlat[i] ?? []])),
    [imageFlat],
  );
```

- [ ] **Step 3: 加卡片**

在「人物排版」那张 `Card`（`:325-368`）**之后**、下一张 `Card` 之前插入：

```tsx
      <Card>
        <CardBody className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[15px] font-semibold text-[var(--text-1)]">多图排版</h2>
            <p className="text-[13px] leading-[1.6] text-[var(--text-3)]">
              图片排版页有二十六种版式，按形态分六组。生成图片排版页时会先按这一页要几张图
              筛掉填不满的，再按内容形态筛出一组候选，由模型挑一个照着排。下面这些是骨架
              本身——颜色全部走这套风格的 CSS 变量，所以换风格它们跟着变。
            </p>
          </div>
          {IMAGE_GROUP_ORDER.map((g) => {
            const items = IMAGE_LAYOUTS.filter((l) => l.group === g);
            if (items.length === 0) return null;
            return (
              <div key={g} className="flex flex-col gap-3">
                <span className="text-[12px] font-medium text-[var(--text-3)]">
                  {imageGroupLabel(g)}（{items.length}）
                </span>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
                  {items.map((l) => (
                    <div key={l.id} className="flex flex-col gap-2">
                      <div className="overflow-hidden rounded-[var(--radius-control)] border border-[var(--border)]">
                        <HtmlMock
                          doc={doc}
                          html={l.skeleton}
                          width={400}
                          images={imageLayoutImages[l.id]}
                          pageType="gallery"
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

- [ ] **Step 4: 类型检查**

Run: `pnpm -r typecheck`
Expected: 无错误。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/pages/Studio.tsx
git commit -m "feat(studio): 功能模块加一张「多图排版」卡，26 份骨架全摆出来"
```

---

## Task 5: 全量验证与浏览器实测

- [ ] **Step 1: 全仓检查**

```bash
pnpm test
pnpm -r typecheck
pnpm build
```

Expected: 三条全过，`fail 0`。

- [ ] **Step 2: 真浏览器实测**

起 dev server（**改完代码再起长任务**——`tsx watch` 一重启就会打断在途的 SSE）。

借 `apps/worker` 的 playwright 写一个一次性脚本放 `apps/worker/scratch/`（不提交），
用 admin/admin 登录，进「能力总览 → 功能模块」，滚到「多图排版」：

1. **26 个样机都渲染出来**——数一下卡片数，且每个 iframe 里都有 `.page`
2. **没有一格是占位块**——每个样机里 `.lumen-image-slot` 的数量为 0
   （占位块是 `fillImageSlots` 填不上图时给的那个斜纹 div）
3. **图不是人像抠图**——抽样看几张，画面里不该出现人像
4. 截图存档

- [ ] **Step 3: 换风格再验一遍**

换一套冷色风格（或深色风格），确认 26 个骨架跟着变色。
**这一条验的是「只用 CSS 变量取色」**——写死了色值的骨架在这里会露馅。

- [ ] **Step 4: 生成实测**

真生成一页图片排版页，看模型挑没挑版式、有没有照骨架排。
在项目里新建/挑一个项目，把某一页的页类型改成「图片排版」，重生成这一页。

- [ ] **Step 5: 收尾**

把实测结果记进 commit message。若发现骨架需要调整，改完重跑 Step 1–4。

---

## 不做

- 不接 `cover` / `end`。
- 不做人工指定版式。
- 不扩素材库（满版类版式压到 12 格就是配合现有 28 张）。
- 不改已有 5 套风格的存储提示词。
- 不做版式的每风格推导（骨架风格无关）。
