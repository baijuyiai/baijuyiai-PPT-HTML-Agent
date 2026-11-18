# 人物页实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给风格库加一个「人物页」页类型，让那 59 张透明底人物抠图真的能被用上——模型在人像位写标记，填图时按标记取人物。

**Architecture:** 抠图链路（`cutout` 标记 → `data-lumen-cutout` 属性 → `object-fit: contain !important`）**已经完整存在，只是没有消费方**。这次补三件事：加页类型、让填图按标记分别取池子、提示词里交代人像位的写法。「给每个风格补一条提示词 + 出样机」不用写代码——`missingPageTypes` 是 `PAGE_TYPE_ORDER.filter(t => !doc.pagePrompts[t])`，加了页类型之后每个已存风格自动变成缺这一类，现成的 `fill-missing` 流程会接手。

**Tech Stack:** TypeScript + Zod、`node --import tsx --test`（**tsx 剥类型但不做类型检查**，测试失败是运行时断言失败）、React（这次不碰前端）。

设计文档：`docs/superpowers/specs/2026-10-27-people-page-design.md`

---

## 文件结构

| 文件 | 责任 |
|---|---|
| `packages/ir-schema/src/page.ts`（改） | `PageType` 枚举加 `people` |
| `packages/ir-schema/src/style-doc.ts`（改） | `PAGE_TYPE_ORDER` / `PAGE_TYPE_LABEL` / `PAGE_TYPE_BRIEF` 各加一项 |
| `packages/ir-schema/src/style-doc.test.ts`（改） | 页类型与 `missingPageTypes` 的用例 |
| `packages/stock-library/src/index.ts`（改） | 抠图槽位的分配：按标记从两个池子分别取 |
| `packages/stock-library/src/stock-library.test.ts`（改） | 那四条用例 |
| `packages/server-core/src/services/page-prompt-kit.ts`（改） | 两处图位说明各补一句人像位 |
| `packages/server-core/src/services/page-prompt-kit.test.ts`（改） | 断言提示词里提到了人像位 |

`PAGE_TYPE_LABEL` 与 `PAGE_TYPE_BRIEF` 都是 `Record<PageType, string>`，所以**加枚举成员之后 TS 会强制你补上它们**——这两个不会漏。`PAGE_TYPE_ORDER` 是数组，**TS 不会提醒**，得手动加。

---

## Task 1: 页类型 `people`

**Files:**
- Modify: `packages/ir-schema/src/page.ts:14-16`（`PageType`）
- Modify: `packages/ir-schema/src/style-doc.ts`（`PAGE_TYPE_ORDER` / `PAGE_TYPE_LABEL` / `PAGE_TYPE_BRIEF` / **`DECORATION_BY_PAGE_TYPE`**）
- Modify: `packages/provider-gateway/src/mock.ts:127`（`LAYOUT_VARIANT`）与 `:143`（`blocksFor` 的穷尽 switch）
- Modify: `packages/render-engine/src/context.ts:144`（`DEFAULT_VARIANT_BY_TYPE`）
- Modify: `packages/style-engine/src/language.ts:38`（`DEFAULT_RECIPES`）
- Modify: `packages/style-engine/src/layout-spec.ts:30`（`PAGE_LABEL`）
- Modify: `packages/server-core/src/services/design-vision.service.ts:51,56`（**手抄的 `PAGE_TYPES` 副本**与 `PAGE_LABEL`）
- Modify: `apps/web/src/workbench/page-types.ts`（`PAGE_TYPE_OPTIONS` / `PAGE_TYPE_ICON` / `PAGE_TYPE_LABEL`）
- Test: `packages/ir-schema/src/style-doc.test.ts`（加两条 + 改两条计数）
- Test: `packages/server-core/src/services/recognize-doc.test.ts:116`（调用次数 18 → 19）

- [ ] **Step 1: 写失败的测试**

加到 `packages/ir-schema/src/style-doc.test.ts` 末尾：

```ts
/**
 * 人物页。
 *
 * 它和别的页类型不一样的地方在于：**图位取的是那 59 张人物抠图**，不是普通配图。
 * 那条链路（`cutout` 标记 → `data-lumen-cutout` → `object-fit: contain`）早就建好了，
 * 一直没人用；这个页类型是它的第一个消费方。
 */
test('people 是合法页类型，排在 gallery 之后', () => {
  assert.ok(PageType.options.includes('people'), '枚举里要有 people');
  assert.equal(PAGE_TYPE_LABEL.people, '人物页');
  assert.ok(PAGE_TYPE_BRIEF.people.length > 0, 'brief 不能空——推导提示词时要拿它当说明');

  const gi = PAGE_TYPE_ORDER.indexOf('gallery');
  const pi = PAGE_TYPE_ORDER.indexOf('people');
  assert.ok(gi >= 0 && pi >= 0, '两张表里都要有');
  assert.equal(
    pi, gi + 1,
    '**必须紧跟在 gallery 之后。** `derivePrompts` 拿 PAGE_TYPE_ORDER 的前三条当 few-shot，'
    + '把新类型插在前面会改掉所有已存风格的推导输入——那是没人要求的行为变化',
  );
});

test('missingPageTypes 会把 people 认成缺的那一类', () => {
  // 一套只有旧 11 类的风格：加了 people 之后它就缺这一类了。
  // **这正是「每个风格自动补上人物页」的机制**——`fill-missing` 流程按这个函数找缺的
  const legacy = StyleDoc.parse({
    styleId: 'legacy', name: '旧风格',
    // `palette` 是必填的，漏了直接抛 ZodError——与 people 无关，纯粹是这段 snippet 要写全
    palette: PALETTE,
    pagePrompts: Object.fromEntries(
      PAGE_TYPE_ORDER.filter((t) => t !== 'people')
        .map((t) => [t, { pageType: t, prompt: 'x' }]),
    ),
  });
  assert.deepEqual(missingPageTypes(legacy), ['people']);
});
```

（`PALETTE` 是这个文件 `:10` 已有的常量。）

**这个文件的顶部已经导好了，一行都不用动**（核对过 `style-doc.test.ts:3-9`）：

```ts
import {
  IMAGE_SLOT_ATTR, PAGE_TYPE_BRIEF, PAGE_TYPE_LABEL, PAGE_TYPE_ORDER, PROMPT_SECTIONS,
  StyleDoc, coveredPageTypes, isPromptUsable, lintStylePrompt, missingPageTypes, pagePromptOf,
  styleRef,
} from './style-doc.js';
import { PageType } from './page.js';
```

上面那条用例用到的 `PageType` / `PAGE_TYPE_ORDER` / `PAGE_TYPE_LABEL` / `PAGE_TYPE_BRIEF` /
`StyleDoc` / `missingPageTypes` **六个全在列表里**。

- [ ] **Step 2: 跑测试确认它失败**

Run: `node --import tsx --test packages/ir-schema/src/style-doc.test.ts`
Expected: FAIL —— `people` 还不在枚举里。

> **注意这一节的规模。** 第一版计划只点了 `style-doc.ts` 的两张表，实测下来**全仓有 8 处
> `Record<PageType, …>` 同构表**（枚举加成员即缺 key），另有 1 处**手抄的页类型数组**
> 编译器管不着、1 个穷尽 switch、3 条既有用例。**这是一个页类型的真实代价**，
> 不是可以「先落一半」的活。

- [ ] **Step 3: 加枚举 + `ir-schema` 里的四张表**

`packages/ir-schema/src/page.ts` 的 `PageType`：

```ts
export const PageType = z.enum([
  'cover', 'toc', 'section', 'text', 'imageText', 'gallery', 'people', 'chart', 'architecture', 'mindMap', 'metrics', 'end',
]);
```

（`people` 加在 `gallery` 之后。枚举本身的顺序不影响行为——真正定顺序的是 `PAGE_TYPE_ORDER`——但两处保持一致读起来不别扭。）

`packages/ir-schema/src/style-doc.ts` **四处**（不是三处）：

```ts
export const PAGE_TYPE_ORDER: PageType[] = [
  'cover', 'toc', 'section', 'text', 'imageText', 'gallery', 'people', 'metrics', 'chart', 'architecture', 'mindMap', 'end',
];
```

```ts
  gallery: '图片排版页',
  people: '人物页',
  metrics: '数字页',
```

```ts
  gallery: '图片排版页。**多张图成组铺开、以图为主**，文字只作标题与题注',
  people: '人物页。一到三位人物的透明底抠图，配名字、职位与一句话介绍。人像位是**竖向**的，人物脚下要落在同一条基线上，不要让人物悬在版面正中',
  metrics: '数字页。三个左右的指标数字，数字是主角，配一句说明',
```

第四处是 `DECORATION_BY_PAGE_TYPE`（`:87`，**在上一版计划给的行范围之外**）：

```ts
  gallery: 'none',
  people: 'none',
  metrics: 'dots',
```

取 `'none'`：那张表的注释写着「图形页与图片排版页自己已经够满，再叠一层是添乱」，
人物页也是图片主导，同一条理由。

- [ ] **Step 4: 补齐下游 7 处同构表**

**这 7 处编译器不会告诉你该取什么值，只会告诉你缺 key。** 每处的取值都给在这里：

**① `packages/provider-gateway/src/mock.ts:127` `LAYOUT_VARIANT`**

```ts
  gallery: 'four-grid',
  people: 'people-row',
  metrics: 'metric-row',
```

（那张表的注释说得很清楚：`layoutVariant` 只是拼给下游看的字符串，不校验是否真存在。）

**② 同文件 `:143` 的 `blocksFor` 穷尽 switch** —— 它没有 `default`，缺一个 `case` 就是
`TS2366: Function lacks ending return statement`。照 `imageText` 那一条写（人物页 = 一张图 + 一段说明）：

```ts
    case 'people':
      // 人物页：人像抠图 + 名字职位，图上不写文字（文字是块，不是画进图里的）
      return [
        {
          id: 'b1',
          type: 'image',
          source: 'ai',
          src: '',
          prompt: '极简商务风格的几何构成，柔和的品牌色块，画面中不含任何文字',
          genParams: { provider: 'openai-compatible', model: 'gpt-image-2', size: '1536x1024', quality: 'high' },
          status: 'pending',
          ratio: '16:9',
          caption: '人物',
          focus: 'center',
          placeholderReason: '',
        },
        {
          id: 'b2',
          type: 'paragraph',
          text: '一位人物的介绍，配上名字与职位。',
        },
      ];
```

**③ `packages/render-engine/src/context.ts:144` `DEFAULT_VARIANT_BY_TYPE`**

```ts
  gallery: 'imageText/four-grid@v1',
  people: 'imageText/left-right@v1',
  chart: 'chart/full@v1',
```

**必须给一个真存在于内置包里的版式 id**——`render-engine.test.ts` 会遍历这张表逐个断言它在包里。
`imageText/left-right@v1` 就在表里（`imageText` 那一行用的就是它），所以一定过。

**④ `packages/style-engine/src/language.ts:38` `DEFAULT_RECIPES`** —— 照 `imageText` 那条写：

```ts
  people: {
    background: 'plain', decoration: 'none', spacing: 'normal',
    requiredSlots: ['title', 'image'], optionalSlots: ['sub', 'caption'],
  },
```

**⑤ `packages/style-engine/src/layout-spec.ts:30` `PAGE_LABEL`**

```ts
  imageText: '图文页', gallery: '图片排版页', people: '人物页', chart: '图表页',
```

**⑥ `packages/server-core/src/services/design-vision.service.ts` 两处** —— 这处最关键，
**它是手抄的副本、编译器管不着**（`:51`）：

```ts
const PAGE_TYPES: PageType[] = [
  'cover', 'toc', 'section', 'text', 'imageText', 'gallery', 'people', 'chart', 'architecture', 'mindMap', 'metrics', 'end',
];
```

```ts
  imageText: '图文页', gallery: '图片排版页', people: '人物页', chart: '图表页',
```

**漏了这处的后果不是编译错，是静默降级**：`slidePageType` 认不出 `people` 就把它变成
`text`，那一页的版式凭空消失，日志里只有一行 warn——那个文件 `:48-49` 的注释写的正是这件事。

**⑦ `apps/web/src/workbench/page-types.ts` 三处**：

```ts
export const PAGE_TYPE_OPTIONS: { value: PageIR['pageType']; label: string }[] = [
  { value: 'cover', label: '封面' },
  { value: 'toc', label: '目录页' },
  { value: 'section', label: '章节页' },
  { value: 'text', label: '纯文本' },
  { value: 'imageText', label: '图文' },
  { value: 'people', label: '人物' },
  { value: 'chart', label: '图表' },
  { value: 'metrics', label: '指标' },
  { value: 'end', label: '结尾' },
];
```

```ts
  imageText: 'Image',
  gallery: 'Images',
  people: 'Users',
  chart: 'ChartColumn',
```

`PAGE_TYPE_LABEL`（同文件下半部分，`Record<PageIR['pageType'], string>`）加
`people: '人物页',`。**`PAGE_TYPE_OPTIONS` 是普通数组、编译器不管**，
但教案编辑器的页类型下拉是从它来的——不加用户就选不到人物页。

- [ ] **Step 5: 改三条既有用例**

**这三条不是「顺手改」，是加页类型的必然后果，每条都要看清它为什么变。**

**① `packages/ir-schema/src/style-doc.test.ts:31-32`** —— 硬编码的计数：

```
`PAGE_TYPE_ORDER.length` 11 → **12**
```

（连带同一处的 `Set` size 断言，以及用例名里那个「十一个」→「十二个」。）

**② 同文件 `:123`** —— `missing.length` 9 → **10**（多缺一类）。

**③ `packages/server-core/src/services/recognize-doc.test.ts:116`** ——

```ts
  assert.equal(seen.length, 19, '一轮单页识别固定 19 次调用，变了就重新数一遍再改这里');
```

18 → **19**。这条用例自己的注释就写着「变了就重新数一遍再改这里」——加一个页类型就是
多一次样机调用。

- [ ] **Step 6: 跑测试确认全绿**

Run: `node --import tsx --test packages/ir-schema/src/style-doc.test.ts`
Expected: PASS，`fail 0`。

Run: `pnpm -r test`
Expected: 全包 Done、`fail 0`。**如果 `server-core` 还红，八成是 Step 4 的第 ⑥ 处没改到位**
（那个副本编译器不管）。

- [ ] **Step 7: 类型检查**

Run: `pnpm -r typecheck`
Expected: **全 Done**。第一版计划这里写的是「Expected: Done」，实际是**加枚举成员会让
8 处同构表所在的包一起红**——Step 3 与 Step 4 就是为它准备的。

（`Partial<Record<PageType, …>>` 那几处**不用动**：`Partial` 不要求所有 key，
`measured-layout.ts` / `variant-set.ts` 里那三处属于这种。）

- [ ] **Step 8: 提交**

```bash
git add packages/ir-schema/src/page.ts packages/ir-schema/src/style-doc.ts \
  packages/ir-schema/src/style-doc.test.ts packages/provider-gateway/src/mock.ts \
  packages/render-engine/src/context.ts packages/style-engine/src/language.ts \
  packages/style-engine/src/layout-spec.ts \
  packages/server-core/src/services/design-vision.service.ts \
  packages/server-core/src/services/recognize-doc.test.ts \
  apps/web/src/workbench/page-types.ts
git commit -m "feat(ir-schema): 加「人物页」页类型"
```

署名用 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`。

> **执行后补充的三处（第一版计划又漏了）**，都已落地：
>
> **① 真正的第 9 处是 `style-engine/src/language.ts:101` 的 `ALL_PAGE_TYPES`**，一个手写数组，
> 编译器管不着。`deriveLanguage` 靠它决定给哪些页类型配配方（`:430`、`:444` 的
> `ALL_PAGE_TYPES.map(...)`），所以**只加 `DEFAULT_RECIPES.people` 是死代码**——
> `recipeFor('people')` 只能退回默认。
>
> 而且**那个文件 `:98-100` 的注释记着同一个 bug 的 gallery 版本**：
> 「gallery 此前被漏在这里：DEFAULT_RECIPES 有它的配方，但本表没列它，于是 deriveLanguage
> 从来不给图片排版页配页型配方（recipeFor 只能退回默认）。」——我们把它在 people 上又造了一遍。
>
> 补它要连带改 `style-engine.test.ts:204` 的本地 `PAGE_TYPES`（11 → 12）与 `:207` 的用例名
> （「十一种」→「十二种」），因为 `:210` 断言配方集合恰好等于那个本地数组。
>
> **② `recognize-doc.test.ts` 里有两条计数断言，计划只提了一条。** 除了 `:114` 的
> `seen.length` 18→19，还有 `:130` 的 `mockContents.length` **11→12**（「11 个页类型各出一次样机」）。
> 同一条用例、同一个原因，计划漏数了。
>
> **③ `apps/web/src/workbench/page-types.ts` 的 `PAGE_TYPE_LABEL` 不是第三个字面量位置。**
> 它是 `Object.fromEntries(PAGE_TYPE_OPTIONS.map(...))` **派生**出来的，没有地方插。
> 所以 `PAGE_TYPE_LABEL.people` 的值就是 `PAGE_TYPE_OPTIONS` 里写的 `'人物'`。
> 这个值只用于教案编辑器里那个 Badge，而那个列表里其余标签都是短词
> （封面 / 目录页 / 章节页 / 纯文本 / 图文 / 图表 / 指标 / 结尾），**「人物」是对的**，
> 不必为了统一去改成「人物页」。

---

## Task 2: 抠图槽位的分配

**Files:**
- Modify: `packages/stock-library/src/index.ts:148-240`（`stockPhotosFor` / `stockImagesFor` / `allocateStockImages`）
- Test: `packages/stock-library/src/stock-library.test.ts`

- [ ] **Step 1: 写失败的测试**

加到 `packages/stock-library/src/stock-library.test.ts` 末尾：

```ts
/**
 * 人像位：模型在图位上写 `data-lumen-cutout`，那一格就该拿到人物抠图。
 *
 * 与上面那条「人物不参与自动配图」**不矛盾**——那条守的是**没有标记**的图位，
 * 这条守的是**有标记**的。两件事必须同时成立：普通图位永远拿不到抠图（透明底落进
 * 16:9 图位会缩成页面正中悬着一个人），而人像位拿得到。
 */
test('标了抠图的图位拿到人物图，且带 cutout 标记', () => {
  for (const pal of [DARK, LIGHT]) {
    const imgs = stockImagesFor('<img data-lumen-image="1" data-lumen-cutout="1">', pal);
    assert.equal(imgs.length, 1, `要 1 张给了 ${imgs.length} 张`);
    assert.equal(imgs[0]!.cutout, true, '人像位拿到的图必须带 cutout，否则页面上会被裁掉边缘');
    const photo = STOCK_PHOTOS.find((p) => stockUrl(p) === imgs[0]!.src);
    assert.ok(photo, `配到了一张不在清单里的图：${imgs[0]!.src}`);
    assert.equal(stockCategoryOf(photo), 'people', '人像位拿到的不是人物图');
  }
});

test('同一页里没标记的图位仍然拿不到人物图', () => {
  // 这条钉的是「人像位」没有把原来那条排除改松。
  // 一页里普通图位与人像位混排，两边都要对
  const html = [
    '<img data-lumen-image="1">',
    '<img data-lumen-image="2" data-lumen-cutout="1">',
    '<img data-lumen-image="3">',
  ].join('');
  const imgs = stockImagesFor(html, DARK);
  assert.equal(imgs.length, 3, '三个图位要给三张图');
  const cat = (src: string) => {
    const p = STOCK_PHOTOS.find((x) => stockUrl(x) === src);
    assert.ok(p, `配到了一张不在清单里的图：${src}`);
    return stockCategoryOf(p);
  };
  assert.notEqual(cat(imgs[0]!.src), 'people', '第 1 格没标抠图，不该拿到人物');
  assert.equal(cat(imgs[1]!.src), 'people', '第 2 格标了抠图，该拿到人物');
  assert.notEqual(cat(imgs[2]!.src), 'people', '第 3 格没标抠图，不该拿到人物');
  // 三张互不相同
  assert.equal(new Set(imgs.map((i) => i.src)).size, 3, '同一页里不该出现重复的画面');
});

test('没有抠图标记时，整组分配的结果与改动前逐字节一致', () => {
  // 这是这次改动最容易伤到的地方：其余 11 个页类型的样机都走这条路，
  // 它们一个抠图标记都没有，产出必须一模一样
  const frags = ['<img data-lumen-image="1">', '<img data-lumen-image="1"><img data-lumen-image="2">'];
  const out = allocateStockImages(frags, DARK);
  assert.deepEqual(
    out.map((s) => s.map((i) => i.src)),
    [stockPhotosFor(DARK, 3).slice(0, 1).map((p) => stockUrl(p)),
      stockPhotosFor(DARK, 3).slice(1, 3).map((p) => stockUrl(p))],
    '整组分配的取图顺序变了',
  );
});

test('人像位也要不到重复的人物', () => {
  const html = Array.from({ length: 4 }, (_, i) => `<img data-lumen-image="${i + 1}" data-lumen-cutout="1">`).join('');
  const imgs = stockImagesFor(html, DARK);
  assert.equal(imgs.length, 4, '四个图位要给四张图');
  assert.equal(new Set(imgs.map((i) => i.src)).size, 4, '同一个人物在一页里出现了两次');
  assert.ok(imgs.every((i) => i.cutout), '人像位全都该带 cutout');
});

test('标记与最终落图对得上——模型写重下标时也要对', () => {
  // **这条是这次最容易漏的一条。** `fillImageSlots` 不是「第 n 号图位取 images[n-1]」，
  // 而是「从声明的下标往后找第一个没用过的，找到头绕回前面」（html-doc.ts:93-104）。
  // 模型在图片排版页上会把几个图位都写成同一个下标（html-doc.ts:56 记着实测过的五连 "1"），
  // 那时它会顺延。配图这一侧若不复刻同一套顺延，人像位就会拿到普通照片、
  // 普通位拿到抠图——页面上不报错，只是版式看着不对。
  // 所以这条不走「按 src 猜分类」，而是真跑一遍 fillImageSlots 看落下来的结果
  const html = '<img data-lumen-image="1" data-lumen-cutout="1">'
    + '<img data-lumen-image="1" data-lumen-cutout="1">'
    + '<img data-lumen-image="1">';
  const filled = fillImageSlots(html, stockImagesFor(html, DARK));
  const tags = [...filled.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]!);
  assert.equal(tags.length, 3, '三个图位');

  const catOf = (tag: string) => {
    const src = /\bsrc\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    const p = STOCK_PHOTOS.find((x) => stockUrl(x) === src);
    assert.ok(p, `落了一张不在清单里的图：${src}`);
    return stockCategoryOf(p);
  };
  assert.equal(catOf(tags[0]!), 'people', '第 1 个 tag 标了抠图，该拿到人物');
  assert.equal(catOf(tags[1]!), 'people', '第 2 个 tag 标了抠图，该拿到人物');
  assert.notEqual(catOf(tags[2]!), 'people', '第 3 个 tag 没标，不该拿到人物');
});
```

**这条用例还要多引一个名字**：`fillImageSlots`。它从 `@lumen/ir-schema` 直接引，不经过 `./index.js`
（本包没有转出它）：

```ts
import { fillImageSlots } from '@lumen/ir-schema';
```

**这个文件的顶部已经导好了，一行都不用动**（核对过 `stock-library.test.ts:6-10`）：

```ts
import {
  allocateStockImages, imageSlotCount, STOCK_PHOTOS, STOCK_CATEGORY_LABEL, stockCategoryOf,
  stockImagesFor, stockPhotoFor, stockPhotosFor, stockUrl, type StockPalette,
} from './index.js';
```

上面四条用例用到的 `stockImagesFor` / `allocateStockImages` / `stockPhotosFor` /
`STOCK_PHOTOS` / `stockUrl` / `stockCategoryOf` **全在列表里**，`DARK` / `LIGHT` 也是文件里已有的常量。

- [ ] **Step 2: 跑测试确认它失败**

Run: `node --import tsx --test packages/stock-library/src/stock-library.test.ts`
Expected: FAIL —— 前两条（人像位拿到人物）会失败，因为现在没有按标记取这回事，第 2 格拿到的是普通图。

- [ ] **Step 3: 实现**

`packages/stock-library/src/index.ts`。**先看第 1 行的 import**，把 `IMAGE_SLOT_ATTR` 加进去：

```ts
import { IMAGE_SLOT_ATTR, imageSlotCount, type StockImage } from '@lumen/ir-schema';
```

**① 把 `stockPhotosFor` 里那段「按池子挑」抽出来**（`index.ts:148-169`）。行为一个字不改，只是池子变成参数：

```ts
/**
 * 从给定池子里按色板挑 `count` 张。
 *
 * 抽出来是因为**普通池与人像池要走同一套排序与避重**：两处各写一遍，迟早有一边漏掉
 * 「同题材先让位」那一步，而表现只是「某套风格挑的图不好看」，没有任何测试会红。
 */
function pickFrom(pool: StockPhoto[], pal: StockPalette, count: number): StockPhoto[] {
  const wanted = pal.dark ? 'dark' : 'light';
  const toneMatched = pool.filter((p) => p.tone === wanted);
  const usable = toneMatched.length > 0 ? toneMatched : pool;
  const ranked = [...usable].sort((a, b) => paletteDistance(a, pal) - paletteDistance(b, pal));

  const picked: StockPhoto[] = [];
  const usedKinds = new Set<string>();
  // 先走一遍「题材没重复过」的，再走一遍兜底：图库小的时候题材很快用光，
  // 那时宁可同类不同图，也不能少给一张
  for (const pass of [true, false]) {
    for (const photo of ranked) {
      if (picked.length >= count) break;
      if (picked.includes(photo)) continue;
      if (pass && usedKinds.has(photo.kind)) continue;
      picked.push(photo);
      usedKinds.add(photo.kind);
    }
  }
  return picked.slice(0, count);
}

/** 自动配图用的池子。**人物不在里面**——理由见 `stockPhotosFor` 上面那段注释 */
const REGULAR_POOL = STOCK_PHOTOS.filter((p) => p.kind !== 'people');
/** 人像位用的池子：那 59 张透明底抠图 */
const PEOPLE_POOL = STOCK_PHOTOS.filter((p) => p.kind === 'people');
```

`stockPhotosFor` 的函数体整个换成一行（**注释、签名、导出名都不动**）：

```ts
export function stockPhotosFor(pal: StockPalette, count: number): StockPhoto[] {
  return pickFrom(REGULAR_POOL, pal, count);
}
```

再加一个给人物池用的：

```ts
/** 人像位取图。与 `stockPhotosFor` 同一套排序，只是池子换成那 59 张抠图 */
export function peoplePhotosFor(pal: StockPalette, count: number): StockPhoto[] {
  return pickFrom(PEOPLE_POOL, pal, count);
}
```

**② 加两个认标记的函数**（放在 `stockImagesFor` 之前）：

```ts
/**
 * 逐个数出每个图位会被 `fillImageSlots` 分到第几张图，以及那个图位有没有抠图标记。
 *
 * **必须复刻 `fillImageSlots` 的取图规则，不能只按 `data-lumen-image` 的下标算。**
 * 那个函数不是「第 n 号图位取 `images[n-1]`」，而是「从声明的下标往后找第一个没用过的，
 * 找到头绕回前面」（`html-doc.ts:93-104`）。模型在图片排版页上常把几个图位都写成同一个
 * 下标（`html-doc.ts:56` 记着实测过的五连 "1"），那时它会顺延——第 2 个 tag 拿到的
 * 其实是第 2 张图。只按下标算的话标记与图片就对不上：人像位拿到普通照片、普通位拿到
 * 抠图，而页面上不报错，只是版式看着不对。
 *
 * 返回：下标 i（0 起）→ 这一张图会不会落在标了抠图的 tag 上。
 * 拿不到图的图位（模型多写了、图不够）不占池子——`fillImageSlots` 会给它占位块。
 */
function cutoutSlotsOf(fragment: string, count: number): boolean[] {
  const out = new Array<boolean>(count).fill(false);
  const used = new Set<number>();
  for (const m of fragment.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0]!;
    const want = Number(new RegExp(`${IMAGE_SLOT_ATTR}\\s*=\\s*["']?(\\d+)`, 'i').exec(tag)?.[1]);
    if (!Number.isFinite(want)) continue;
    const i = takeSlot(want, count, used);
    if (i === null) continue;
    out[i] = /\bdata-lumen-cutout\b/i.test(tag);
  }
  return out;
}

/**
 * `fillImageSlots` 里那个 `take` 的复刻：从声明的下标往后找第一个没用过的，
 * 找到头绕回前面接着找；拿不到图回 `null`（那边会换成占位块）。
 *
 * **两边必须一致，改一边就要改另一边**——`html-doc.ts:60` 已经写下了这条规矩
 * （「这条规则必须与 fillImageSlots 的取图规则一致」）。Step 1 那条
 * 「标记与最终落图对得上」的用例就是拿来钉这件事的：真跑一遍 `fillImageSlots` 再核对。
 */
function takeSlot(want: number, count: number, used: Set<number>): number | null {
  if (count === 0 || want > count) return null;
  for (let i = want - 1; i < count; i++) if (!used.has(i)) { used.add(i); return i; }
  for (let i = 0; i < want - 1; i++) if (!used.has(i)) { used.add(i); return i; }
  return null;
}

/**
 * 按图位的抠图标记分别取图：标了的从人物池取，没标的从普通池取。
 *
 * 返回的数组**按图片下标排**——下标就是 `fillImageSlots` 会去取的那个位置，
 * 所以第 i 项必须正好是第 i 张图。
 */
function allocateSlotImages(fragments: string[], pal: StockPalette, counts: number[]): StockImage[][] {
  const marks = fragments.map((f, fi) => cutoutSlotsOf(f, counts[fi]!));

  let peopleWanted = 0;
  for (const m of marks) for (const on of m) if (on) peopleWanted += 1;
  const total = counts.reduce((a, b) => a + b, 0);

  // 两个池子各按自己的总数要一次——`pickFrom` 的避重结果与「要几张」有关，
  // 分多次要会拿到与整组不一致的顺序
  const people = peopleWanted > 0 ? peoplePhotosFor(pal, peopleWanted) : [];
  // 人物池取空时整组退回普通池：留一个空槽渲染出来是破图图标，比给一张不贴题的图难看
  const peopleUsable = people.length > 0;
  const regularCount = peopleUsable ? total - peopleWanted : total;
  const regular = regularCount > 0 ? stockPhotosFor(pal, regularCount) : [];

  let pi = 0;
  let ri = 0;
  return marks.map((m) => m.map((on) => {
    if (peopleUsable && on) return stockImageOf(people[pi++ % people.length]!);
    return stockImageOf(regular[ri++ % regular.length]!);
  }));
}
```

**③ 两个出口各改一行**，其余不动：

```ts
export function stockImagesFor(fragment: string, pal: StockPalette): StockImage[] {
  const count = imageSlotCount(fragment);
  if (count === 0) return [];
  return allocateSlotImages([fragment], pal, [count])[0] ?? [];
}
```

`allocateStockImages` 里，把原来「一个池子 + cursor」那一段换成调 `allocateSlotImages`：

```ts
export function allocateStockImages(fragments: string[], pal: StockPalette): StockImage[][] {
  const counts = fragments.map(imageSlotCount);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return counts.map(() => []);
  return allocateSlotImages(fragments, pal, counts);
}
```

**为什么这样就与改动前逐字节一致**：一个抠图标记都没有时，`peopleWanted` 是 0、`people` 是空数组、`peopleUsable` 是 false，于是 `regularCount` 等于 `total`、`regular = stockPhotosFor(pal, total)`——与原来那一行 `const pool = stockPhotosFor(pal, total)` 完全相同，每个下标依次取 `regular[ri++]`，就是原来的 `pool[cursor++]`。**这条有 Step 1 第三条用例钉着。**

- [ ] **Step 4: 跑测试确认它通过**

Run: `node --import tsx --test packages/stock-library/src/stock-library.test.ts`
Expected: PASS，`fail 0`。**既有的那条「人物不参与自动配图」也必须仍然绿**——它守的是没有标记的图位。

- [ ] **Step 5: 提交**

```bash
git add packages/stock-library/src/index.ts packages/stock-library/src/stock-library.test.ts
git commit -m "feat(stock-library): 按图位标记取人物抠图"
```

---

## Task 3: 提示词里交代人像位

**Files:**
- Modify: `packages/server-core/src/services/page-prompt-kit.ts:95-96`（识别提示词）与 `:127`（推导提示词）
- Test: `packages/server-core/src/services/page-prompt-kit.test.ts`

- [ ] **Step 1: 写失败的测试**

加到 `packages/server-core/src/services/page-prompt-kit.test.ts` 末尾：

```ts
/**
 * 两处提示词都交代了人像位的写法。
 *
 * **走真链路断言「模型实际收到什么」，不去断言模块私有的常量**——常量里写了不等于
 * 发出去的就是它。这个文件已有的 `fakeGateway` 会把每次请求的 `system` 记下来，
 * 直接用它。
 */
test('两处提示词都交代了人像位的写法', async () => {
  const write = fakeGateway([OK_PROMPT]);
  await writePagePrompt(write.gateway, 'data:image/png;base64,AAAA', 'people');
  assert.match(
    write.seen[0]!.system ?? '', /data-lumen-cutout/,
    '识别提示词里没提人像位——模型不会写这个标记，人物页就取不到人物图',
  );

  const derive = fakeGateway([JSON.stringify({ pages: [{ pageType: 'people', prompt: OK_PROMPT }] })]);
  await derivePrompts(derive.gateway, [{ pageType: 'cover', prompt: OK_PROMPT }], ['people'], PALETTE);
  assert.match(
    derive.seen[0]!.system ?? '', /data-lumen-cutout/,
    '推导提示词里没提人像位——补齐出来的那条人物页提示词就不会用上人像位',
  );
});
```

**这个文件要改两处 import**（核对过 `page-prompt-kit.test.ts:5`）：

```ts
import { derivePrompts, generateMock, splitSlides, writePagePrompt } from './page-prompt-kit.js';
```

（只加了 `derivePrompts` 一个。）文件里已有的常量与 helper 直接用，**不要重定义**：
`fakeGateway`（`:24`）、`OK_PROMPT`（`:67`，四段齐全的合法提示词）、`PALETTE`（`:8`）。

- [ ] **Step 2: 跑测试确认它失败**

Run: `node --import tsx --test packages/server-core/src/services/page-prompt-kit.test.ts`
Expected: FAIL —— 两处提示词都还没有 `data-lumen-cutout`。

- [ ] **Step 3: 实现**

`page-prompt-kit.ts` 的两处图位说明各补一行。两个提示词常量都是**模块私有**的，
名字是 `WRITE_SYSTEM`（`:63`，识别那条路用）与 `DERIVE_SYSTEM`（`:115`，推导用）——
**不用给它们加 `export`**，测试走假网关断言实际发出去的内容。

`WRITE_SYSTEM` 里（`:95-96` 那两行之后）：

```ts
  `- 图片位写成 <img ${IMAGE_SLOT_ATTR}="1">（第二张是 "2"，依次往后），**不要写 src**——`,
  '  这样这条提示词换一套图还能用。没有图片位的版面就不用写 img（用 CSS/SVG 画的主视觉不算图片位）。',
  `- **人像位**（团队、讲者、人物风采）写成 <img ${IMAGE_SLOT_ATTR}="1" data-lumen-cutout="1">，`,
  '  编号与普通图片位共用同一个序列。系统会往这一格放人物抠图，按 contain 摆放不裁切——',
  '  所以人像位要留竖向的空间，并让人物脚下落在同一条基线上。',
```

推导提示词 `DERIVE_SYSTEM` 里（`:127` 那一行之后）：

```ts
  `- 图片位写成 <img ${IMAGE_SLOT_ATTR}="1"> 这种形式，不要写 src。`,
  `- 人像位写成 <img ${IMAGE_SLOT_ATTR}="1" data-lumen-cutout="1">：这一格会放人物抠图，`,
  '  按 contain 摆放不裁切，所以要留竖向空间。',
```

**为什么复用 `data-lumen-cutout` 而不新开一个属性**：那个属性已经存在、`fillImageSlots` 已经在读它、`buildPageDocument` 已经为它注入了 `contain` 规则。新开一个只会多出一处要同步的定义，而两者语义是同一个——「这一格是抠图，别裁」。

- [ ] **Step 4: 跑测试确认它通过**

Run: `node --import tsx --test packages/server-core/src/services/page-prompt-kit.test.ts`
Expected: PASS，`fail 0`。

- [ ] **Step 5: 提交**

```bash
git add packages/server-core/src/services/page-prompt-kit.ts packages/server-core/src/services/page-prompt-kit.test.ts
git commit -m "feat(prompt): 提示词里交代人像位的写法"
```

---

## Task 4: 全量验证、跑补齐、浏览器实测

- [ ] **Step 1: 三条门禁**

```
pnpm -r typecheck
pnpm -r test
pnpm build
```

三条都要过。

**`pnpm -r test` 不跑 `apps/web`**（它没有 `test` script），所以再加一条：

```
pnpm test
```

Expected: `fail 0`。

- [ ] **Step 2: 起服务**

dev server 起在 5273（`.claude/launch.json` 的 `lumen-dev`），用 admin 登录。

- [ ] **Step 3: 跑补齐（**要花钱**）**

对库里每一套风格跑一次「补齐」。界面上在**风格库**页每张卡片上有入口；接口是
`GET /api/styles/docs/:styleId/fill-missing/stream`。

**这一步要调模型**：每套风格一次推导 + 一次出样机。跑之前先数一下有几套风格，把要花几次调用说清楚。

- [ ] **Step 4: 浏览器实测**

1. 风格库里**每套风格都多出「人物页」一张样机**
2. **样机里的人像位里是真的人物抠图**——不是破图图标、不是普通照片（判据：看得出是抠出来的人，
   背景是页面的底色而不是照片背景）
3. **人物没有被裁切**（`object-fit: contain` 生效；`cover` 会把人裁掉一半）
4. 在工作台里用某套风格生成一页人物页，页面上人物正常

- [ ] **Step 5: 回归**

其余 11 个页类型的样机没变（`stockPhotosFor` 的行为没动，Step 1 的第三条用例钉着）。

- [ ] **Step 6: 提交实测记录（如果有改动）**

实测里改了代码才提交；没改就不提交，把结论写进给用户的汇报里。
