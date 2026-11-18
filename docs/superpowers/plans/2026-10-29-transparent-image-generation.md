# 透明底配图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删掉本地抠图，改成让图片模型按图位标注直接出透明底 PNG。

**Architecture:** 判据（「这个图位要不要透明底」）由 `ir-schema` 里的两个纯函数提供，
`fillImageSlots`（落图）与 `cutoutSlotsOf`（挑图）共用同一份判断；`background` 做成
**按请求**的网关参数（不是供应商级的 `imageExtraParams`，那会让所有生图都变透明）；
网关在返回前验一次「要了透明底就真得有 alpha」，验不过就报错。

**Tech Stack:** pnpm monorepo / TypeScript ESM（`NodeNext`、`verbatimModuleSyntax`、
`noUncheckedIndexedAccess`）/ `node --import tsx --test` / zod

**规格：** [docs/superpowers/specs/2026-10-29-transparent-image-generation-design.md](../specs/2026-10-29-transparent-image-generation-design.md)

**前置条件（人工，不属于本计划）：** 图片供应商的模型要换成官方变体
（`gpt-image-2.5-sunburst` → `gpt-image-2.5-sunburst-official`）。不换的话 Task 5 的
alpha 检查会如实报错，功能是空的。

**命令约定：** 单文件测试用 `node --import tsx --test <路径>`；全量用 `pnpm test`；
类型检查 `pnpm -r typecheck`。**都在仓库根目录跑。**

---

## 文件结构

| 文件 | 责任 | 动作 |
|---|---|---|
| `packages/ir-schema/src/html-doc.ts` | 图位判据（`objectFitByClass` / `isCutoutSlot`）+ 落图 | 改 |
| `packages/ir-schema/src/html-doc.test.ts` | 判据与落图的单测 | 改 |
| `packages/stock-library/src/index.ts` | 挑图（`cutoutSlotsOf`） | 改 |
| `packages/stock-library/src/stock-library.test.ts` | 挑图侧的单测 | 改 |
| `packages/provider-gateway/src/types.ts` | `ImageRequest.background` | 改 |
| `packages/provider-gateway/src/openai.ts` | `#imageParams` 翻译 `background` | 改 |
| `packages/provider-gateway/src/png.ts` | **新建**：`pngHasAlpha` | 建 |
| `packages/provider-gateway/src/png.test.ts` | **新建**：`pngHasAlpha` 的单测 | 建 |
| `packages/provider-gateway/src/gateway.ts` | 要了透明底就验一次 | 改 |
| `packages/provider-gateway/src/mock.ts` | Mock 也要出得了 alpha | 改 |
| `apps/api/src/routes/projects.ts` | 图片路由接 `cutout` 参数 | 改 |
| `apps/web/src/workbench/RightRail.tsx` | 删抠图、按钮改名、传参数 | 改 |
| `apps/web/src/workbench/cutout.ts` | 本地抠图 | **删** |
| `apps/web/src/workbench/cutout.test.ts` | 本地抠图的测试 | **删** |
| `packages/server-core/src/services/generate-html.service.ts` | `PAGE_SYSTEM` 加标注规则 | 改 |
| `apps/worker/scratch/verify-transparent.mjs` | **新建**：真浏览器实测脚本 | 建 |

---

### Task 1: 图位判据（样式侧）

`object-fit: contain` 是这个仓库里「这张图不该被裁切、要完整看见」的既有写法。
实测暖调纸感那套风格的封面，那个图位是 `<img class="leaf" data-lumen-image="1">`，
而 `contain` 写在页面自己那段 `<style>` 的 `.leaf { … }` 里——**不是内联**。
所以判据要能看 class 规则。

**Files:**
- Modify: `packages/ir-schema/src/html-doc.ts`
- Test: `packages/ir-schema/src/html-doc.test.ts`

- [ ] **Step 1: 写失败的测试**

先把该文件顶部那条 `from './html-doc.js'` 的导入补上两个名字
（`isCutoutSlot`、`objectFitByClass`），再追加到文件末尾：

```ts
/* ---------------- 图位判据：这个图位要不要透明底 ---------------- */

/** 实测到的那份封面片段：contain 写在 class 规则里，不是内联 */
const COVER = [
  '<style>',
  '  .leaf { position:absolute; display:block; width:768px; height:842px; object-fit: contain }',
  '  .hero img { object-fit: cover }',
  '  .thumb { object-fit: cover }',
  '</style>',
  '<img class="leaf" data-lumen-image="1" alt="">',
].join('\n');

test('class 规则里的 object-fit: contain 也算抠图位', () => {
  const fits = objectFitByClass(COVER);
  assert.equal(fits['leaf'], 'contain');
  assert.equal(fits['thumb'], 'cover');
  assert.equal(isCutoutSlot('<img class="leaf" data-lumen-image="1">', fits), true);
});

test('只有 object-fit: cover 的图位不算抠图位', () => {
  const fits = objectFitByClass(COVER);
  assert.equal(isCutoutSlot('<img class="thumb" data-lumen-image="1">', fits), false);
});

/**
 * **后代选择器不参与判断。** 漏判只是让这个图位维持现状（当普通照片配图），
 * 误判会把普通照片的图位当成抠图位、从透明底池里塞一张不贴题的图进去。
 * 两类错误代价不对称，所以宁可漏。
 */
test('后代选择器不参与判断', () => {
  const fits = objectFitByClass(COVER);
  assert.equal(fits['hero'], undefined, '.hero img 里的 object-fit 不该记到 .hero 头上');
  assert.equal(isCutoutSlot('<img class="hero" data-lumen-image="1">', fits), false);
});

test('内联 style 压过 class 规则——它俩不一致时听内联的', () => {
  const fits = objectFitByClass(COVER);
  const tag = '<img class="leaf" data-lumen-image="1" style="object-fit: cover">';
  assert.equal(isCutoutSlot(tag, fits), false, '内联说了 cover，就不能再回头去看 class');
});

test('内联写了 contain 也算，不需要 class', () => {
  assert.equal(isCutoutSlot('<img data-lumen-image="1" style="object-fit:contain">', {}), true);
});

test('显式标记优先，且不需要样式', () => {
  assert.equal(isCutoutSlot('<img data-lumen-image="1" data-lumen-cutout="1">', {}), true);
});

test('同一个 class 写了两条 object-fit 时，后面那条赢', () => {
  const fits = objectFitByClass('<style>.a{object-fit:cover} .a{object-fit:contain}</style>');
  assert.equal(fits['a'], 'contain');
});

test('没有 style 块、没有 class 的图位不算抠图位', () => {
  assert.deepEqual(objectFitByClass('<img data-lumen-image="1">'), {});
  assert.equal(isCutoutSlot('<img data-lumen-image="1">', {}), false);
});
```

- [ ] **Step 2: 跑测试，确认它失败**

```bash
node --import tsx --test packages/ir-schema/src/html-doc.test.ts
```

预期：FAIL，报 `isCutoutSlot is not a function` / `objectFitByClass is not a function`。

- [ ] **Step 3: 实现**

在 `packages/ir-schema/src/html-doc.ts` 里 `markCutout` 那条注释**之前**插入：

```ts
/**
 * 一页里「class 名 → 这个 class 规则里最后一条 `object-fit` 的值」。
 *
 * **刻意只认最简单的选择器**：`.foo` 与 `img.foo`（含逗号列表）。后代选择器
 * （`.hero img`）、子选择器、伪类、`!important`、优先级计算一律不看。
 *
 * 理由是**两类错误的代价不对称**：漏判只是让这个图位维持现状（当普通照片配图），
 * 误判会把一张普通照片的图位当成抠图位、从透明底池里塞一张不贴题的图进去。
 * 所以宁可漏。要按真正的级联算，得把浏览器那套搬过来，代价远大于收益。
 */
export function objectFitByClass(fragment: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const block of fragment.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
    // 注释先去掉：`/* object-fit: contain */` 里的那一段不算声明
    const css = (block[1] ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const rule of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
      const fit = /(?:^|;)\s*object-fit\s*:\s*([\w-]+)/i.exec(rule[2] ?? '')?.[1];
      if (!fit) continue;
      for (const part of (rule[1] ?? '').split(',')) {
        const m = /^(?:[a-z][\w-]*)?\.([\w-]+)$/i.exec(part.trim());
        // 后出现的规则赢——同一层级的选择器里，CSS 就是这么定的
        if (m?.[1]) out[m[1].toLowerCase()] = fit.toLowerCase();
      }
    }
  }
  return out;
}

/**
 * 这个图位要不要透明底。
 *
 * 两条判据，**显式标记优先**：模型写了 `data-lumen-cutout` 就听它的；否则看样式里
 * 有没有 `object-fit: contain`——内联的压过 class 规则的。
 *
 * 为什么必须看 class 规则：实测暖调纸感那套风格的封面，图位是
 * `<img class="leaf" data-lumen-image="1">`，而 `contain` 写在页面那段 `<style>` 的
 * `.leaf { … }` 里，**不是内联**。只看内联会漏掉整个存量页面。
 *
 * `fits` 由 `objectFitByClass(fragment)` 算一次传进来——它是整页一份的，
 * 每个图位各算一遍是白费。
 */
export function isCutoutSlot(tag: string, fits: Record<string, string>): boolean {
  if (/\bdata-lumen-cutout\b/i.test(tag)) return true;
  const inline = /\bstyle\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
  if (inline) {
    const own = /(?:^|;)\s*object-fit\s*:\s*([\w-]+)/i.exec(inline)?.[1];
    // 内联写了就以内联为准：它压得过 class 规则，不能再回头去看 class
    if (own) return own.toLowerCase() === 'contain';
  }
  const cls = /\bclass\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
  if (!cls) return false;
  return cls.split(/\s+/).some((c) => fits[c.toLowerCase()] === 'contain');
}
```

- [ ] **Step 4: 跑测试，确认通过**

```bash
node --import tsx --test packages/ir-schema/src/html-doc.test.ts
```

预期：PASS，且原有用例一个不挂。

- [ ] **Step 5: 提交**

```bash
git add packages/ir-schema/src/html-doc.ts packages/ir-schema/src/html-doc.test.ts
git commit -m "feat(ir-schema): 图位要不要透明底，判据加上 class 规则里的 object-fit:contain"
```

---

### Task 2: 落图侧接上判据

`fillImageSlots` 现在只在「选中的图本身是透明底」或「用户显式指定过」时才标
`data-lumen-cutout`。补上第三条：**这个图位自己声明了要透明底**。

**Files:**
- Modify: `packages/ir-schema/src/html-doc.ts`
- Test: `packages/ir-schema/src/html-doc.test.ts`

- [ ] **Step 1: 写失败的测试**

追加到 `packages/ir-schema/src/html-doc.test.ts`：

```ts
test('图位自己声明了 contain，落图时要标上抠图标记', () => {
  const out = fillImageSlots(COVER, imgs('/a.jpg'));
  assert.ok(out.includes('data-lumen-cutout="1"'), '写了 contain 的图位要标上');
});

test('用户显式说不要抠图，压得过样式里的 contain', () => {
  const out = fillImageSlots(COVER, imgs('/a.jpg'), { '0': { cutout: false } });
  assert.ok(!out.includes('data-lumen-cutout'), '用户说了算');
});

test('样式里是 cover 的图位不受影响——这条防误伤', () => {
  const frag = '<style>.thumb{object-fit:cover}</style><img class="thumb" data-lumen-image="1">';
  const out = fillImageSlots(frag, imgs('/a.jpg'));
  assert.ok(!out.includes('data-lumen-cutout'));
});

test('没有 style 块的片段产出逐字节不变——存量样机走的就是这条路', () => {
  const frag = '<img data-lumen-image="1"><img data-lumen-image="2">';
  assert.equal(fillImageSlots(frag, imgs('/a.jpg', '/b.jpg')),
    '<img data-lumen-slot="0" src="/a.jpg" data-lumen-image="1">'
    + '<img data-lumen-slot="1" src="/b.jpg" data-lumen-image="2">');
});
```

- [ ] **Step 2: 跑测试，确认它失败**

```bash
node --import tsx --test packages/ir-schema/src/html-doc.test.ts
```

预期：第一条 FAIL（`data-lumen-cutout` 没被标上），后三条 PASS。

- [ ] **Step 3: 实现**

在 `fillImageSlots` 里，把 `fits` 算一次并传下去：

```ts
export function fillImageSlots(
  fragment: string,
  images: StockImage[],
  overrides: ImageOverrides = {},
): string {
  const used = new Set<number>();
  // 整页算一次：每个图位各算一遍是白费，而且它们看的是同一份 <style>
  const fits = objectFitByClass(fragment);
  const take = (want: number): StockImage | undefined => {
```

再把返回那一行改成：

```ts
    return decorate(markSlotIndex(markCutout(withSrc, chosen, ov, isCutoutSlot(tag, fits)), index), ov);
```

`markCutout` 加一个参数：

```ts
/**
 * 抠图落成 `object-fit: contain` 的依据。
 *
 * 模型给图位写的样式多半是照片的写法（`object-fit: cover` 配一个定宽定高的框），
 * 透明物体套进去会被裁掉边缘。标个属性，由 `IMAGE_SLOT_CSS` 统一压过去。
 *
 * 三个来源，**优先级从高到低**：用户在图位面板上明确指定过 → 这个图位自己声明了
 * 要透明底（`data-lumen-cutout`，或样式里的 `object-fit: contain`）→ 选中的那张图
 * 本身是透明底。用户明确说「这张不要当抠图」时要能把标记**摘掉**，否则点了没反应。
 */
function markCutout(tag: string, image: StockImage, ov: ImageSlotOverride, declared: boolean): string {
  const want = ov.cutout ?? (declared || image.cutout === true);
```

- [ ] **Step 4: 跑测试，确认通过**

```bash
node --import tsx --test packages/ir-schema/src/html-doc.test.ts
```

预期：全 PASS。**特别确认原来那条「抠图落图时标上 data-lumen-cutout，照片不标」
仍然过**——它的片段没有 `<style>`，行为不该变。

- [ ] **Step 5: 提交**

```bash
git add packages/ir-schema/src/html-doc.ts packages/ir-schema/src/html-doc.test.ts
git commit -m "feat(ir-schema): 图位自己声明了要透明底时，落图就标上抠图标记"
```

---

### Task 3: 挑图侧接上同一份判据

`cutoutSlotsOf` 决定这个图位从**哪个池子**取图（透明底池 / 普通池）。它与
`fillImageSlots` 必须用同一个判断——`html-doc.ts:60` 那条注释已经写死了这条规矩。

**Files:**
- Modify: `packages/stock-library/src/index.ts`
- Test: `packages/stock-library/src/stock-library.test.ts`

- [ ] **Step 1: 写失败的测试**

先把该文件顶部的导入改成（`imageSlotsOf` 是新加的，其余本来就有）：

```ts
import {
  allocateStockImages, imageSlotCount, STOCK_PHOTOS, STOCK_CATEGORY_LABEL, stockCategoryOf,
  stockImagesFor, stockPhotoFor, stockPhotosFor, stockUrl, type StockPalette,
} from './index.js';
import { fillImageSlots, imageSlotsOf } from '@lumen/ir-schema';
```

追加到该文件末尾：

```ts
/** 按地址找清单里的那张图，再问它属于哪个类别（`stockCategoryOf` 收的是图片本身） */
const categoryOfSrc = (src: string) => {
  const p = STOCK_PHOTOS.find((x) => stockUrl(x) === src);
  assert.ok(p, `配到了一张不在清单里的图：${src}`);
  return stockCategoryOf(p);
};

test('样式里写了 contain 的图位从透明底池取图', () => {
  const html = '<style>.leaf{object-fit:contain}</style><img class="leaf" data-lumen-image="1">';
  const imgs = stockImagesFor(html, DARK);
  assert.equal(imgs.length, 1);
  assert.equal(categoryOfSrc(imgs[0]!.src), 'people', '该从透明底池取');
  assert.ok(imgs[0]!.cutout, '该带 cutout 标记');
});

test('样式里写的是 cover 时仍从普通池取——防误伤', () => {
  const html = '<style>.thumb{object-fit:cover}</style><img class="thumb" data-lumen-image="1">';
  const imgs = stockImagesFor(html, DARK);
  assert.notEqual(categoryOfSrc(imgs[0]!.src), 'people');
});

test('挑图与落图对同一份片段给出一致的判断', () => {
  // 两边各算一遍，算不到一块去就会「面板写着 A、画布上是 B」——那种错不报错
  const html = '<style>.leaf{object-fit:contain}</style><img class="leaf" data-lumen-image="1">';
  const imgs = stockImagesFor(html, DARK);
  const slots = imageSlotsOf(html, imgs);
  assert.equal(slots[0]!.cutout, true, '落图侧也要认成抠图位');
});
```

- [ ] **Step 2: 跑测试，确认它失败**

```bash
node --import tsx --test packages/stock-library/src/stock-library.test.ts
```

预期：第一条 FAIL（拿到的是普通照片）。第二条、第三条同样失败。

- [ ] **Step 3: 实现**

`packages/stock-library/src/index.ts` 的导入加两个名字：

```ts
import { IMAGE_SLOT_ATTR, imageSlotCount, isCutoutSlot, objectFitByClass, type StockImage } from '@lumen/ir-schema';
```

`cutoutSlotsOf` 改成：

```ts
function cutoutSlotsOf(fragment: string, count: number): boolean[] {
  const out = new Array<boolean>(count).fill(false);
  const used = new Set<number>();
  // 与 fillImageSlots 用同一份判据。整页算一次，别每个图位各算一遍
  const fits = objectFitByClass(fragment);
  for (const m of fragment.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0]!;
    const want = Number(new RegExp(`${IMAGE_SLOT_ATTR}\\s*=\\s*["']?(\\d+)`, 'i').exec(tag)?.[1]);
    if (!Number.isFinite(want)) continue;
    const i = takeSlot(want, count, used);
    if (i === null) continue;
    out[i] = isCutoutSlot(tag, fits);
  }
  return out;
}
```

同时把该函数上面那段注释里「判据是 `data-lumen-cutout`」的说法改成「显式标记，
或样式里的 `object-fit: contain`」。

- [ ] **Step 4: 跑测试，确认通过**

```bash
node --import tsx --test packages/stock-library/src/stock-library.test.ts
```

预期：全 PASS。**特别确认「没有抠图标记时，整组分配的结果与改动前逐字节一致」仍过**
——它的片段没有 `<style>`，行为不该变。

- [ ] **Step 5: 提交**

```bash
git add packages/stock-library/src/index.ts packages/stock-library/src/stock-library.test.ts
git commit -m "feat(stock-library): 挑图侧与落图侧共用同一份抠图位判据"
```

---

### Task 4: 网关支持按请求的透明底

**`imageExtraParams` 是按供应商配的固定附加参数，不能拿来干这个**——写进去等于让
**所有**生图都变透明，普通照片图位也会遭殃。所以做成按请求的字段。

**Files:**
- Modify: `packages/provider-gateway/src/types.ts`
- Modify: `packages/provider-gateway/src/openai.ts`
- Test: `packages/provider-gateway/src/provider-gateway.test.ts`

- [ ] **Step 1: 写失败的测试**

追加到 `packages/provider-gateway/src/provider-gateway.test.ts`（沿用该文件里已有的
`makeProvider` / `makeRoute` 两个构造器）：

```ts
/**
 * 1×1 的 RGBA PNG（ct=6）。**不能用不带 alpha 的图当假响应**：Task 5 会给网关加上
 * 「要了透明底必须真有 alpha」的检查，那时这些用例都得过那一关。
 */
const PNG_RGBA_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

/** 把发出去的请求体记下来的假 fetch */
function capturingFetch(sink: Record<string, unknown>[]) {
  return (async (_url: string | URL | Request, init?: RequestInit) => {
    sink.push(JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>);
    return new Response(JSON.stringify({ data: [{ b64_json: PNG_RGBA_1PX.toString('base64') }] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

/** 一个真连出去（isMock: false）、但 fetch 被换掉的网关配置 */
function imageCfg(sink: Record<string, unknown>[], provider: Record<string, unknown> = {}): GatewayConfig {
  return {
    getProvider: () => makeProvider({
      providerId: 'p-img', isMock: false, baseUrl: 'https://example.test', ...provider,
    }),
    getRoute: () => makeRoute({ taskType: 'image', primary: { providerId: 'p-img', model: 'm-img' } }),
    decryptKey: () => 'k',
    fetchImpl: capturingFetch(sink),
  };
}

const ASK_TRANSPARENT = {
  taskType: 'image' as const, prompt: 'p', size: '1024x1024', quality: 'high', n: 1,
  background: 'transparent' as const,
};

test('要透明底时请求体带 background 与 output_format:png', async () => {
  const sink: Record<string, unknown>[] = [];
  await createGateway(imageCfg(sink)).image(ASK_TRANSPARENT);
  assert.equal(sink[0]?.['background'], 'transparent');
  assert.equal(sink[0]?.['output_format'], 'png', 'JPEG 存不了 alpha，必须一起要 PNG');
});

test('不要透明底时一个字都不带', async () => {
  const sink: Record<string, unknown>[] = [];
  await createGateway(imageCfg(sink)).image({
    taskType: 'image', prompt: 'p', size: '1024x1024', quality: 'high', n: 1,
  });
  assert.equal(sink[0]?.['background'], undefined);
  assert.equal(sink[0]?.['output_format'], undefined);
});

test('供应商级的 imageExtraParams 压得过按请求的 background', async () => {
  // 管理员显式写死的配置应该赢——否则他在后台改了却不见效，只能靠猜。
  // 这里的 'opaque' 是**管理员自由填的字符串**，与 ImageRequest.background 的类型无关
  const sink: Record<string, unknown>[] = [];
  await createGateway(imageCfg(sink, { imageExtraParams: { background: 'opaque' } }))
    .image(ASK_TRANSPARENT);
  assert.equal(sink[0]?.['background'], 'opaque');
});

test('ratio 方言的供应商也要带上透明底参数——那是另一条 return', async () => {
  // 这条是补的：`#imageParams` 有两条 return，只测 pixels 那条的话，
  // ratio 那条的 `...bg` 被删掉不会有任何测试变红
  const sink: Record<string, unknown>[] = [];
  await createGateway(imageCfg(sink, { imageSizeFormat: 'ratio', imageResolution: '2K' }))
    .image({ ...ASK_TRANSPARENT, ratio: '1:1' });
  assert.equal(sink[0]?.['background'], 'transparent');
  assert.equal(sink[0]?.['output_format'], 'png');
  // 顺带锁住 ratio 形态没被带歪
  assert.equal(sink[0]?.['size'], '1:1');
  assert.equal(sink[0]?.['resolution'], '2K');
});
```

- [ ] **Step 2: 跑测试，确认它失败**

```bash
node --import tsx --test packages/provider-gateway/src/provider-gateway.test.ts
```

预期：前两条 FAIL（`background` 是 `undefined`）。第三条会因为 TypeScript 不接受
`background` 这个字段而先报类型错——那也是 FAIL。

- [ ] **Step 3: 实现**

`packages/provider-gateway/src/types.ts` 的 `ImageRequest` 末尾加：

```ts
  /**
   * 透明底。不传就是供应商默认（普通照片）。
   *
   * **必须按请求给，不能写进供应商级的 `imageExtraParams`**：那是固定附加参数，
   * 写进去等于让所有生图都变透明，普通照片图位也会遭殃。
   *
   * 只有这一个取值：`'opaque'` 曾经有过，用来让管理员把全局固定成透明底的配置
   * 「按回去」，但 `imageExtraParams` 展开在它之后、管理员固定什么就是什么，
   * 按不回去——与其留一个做不到事的取值，不如不留。
   */
  background?: 'transparent';
```

`packages/provider-gateway/src/openai.ts` 的 `#imageParams` 改成：

```ts
  #imageParams(req: ImageRequest, cfg: Provider): Record<string, unknown> {
    const extra = cfg.imageExtraParams ?? {};
    /**
     * 透明底是**按请求**的参数。它必须与 `output_format: 'png'` 一起给：
     * JPEG 存不了 alpha，别的格式会被服务端压成不带 alpha 的。
     *
     * 排在 `...extra` **之前**——`imageExtraParams` 是管理员显式写死的覆盖，应该赢。
     * 反过来的话，他在后台改了却不见效，只能靠猜。
     */
    const bg = req.background === 'transparent'
      ? { background: 'transparent', output_format: 'png' }
      : {};
    if (cfg.imageSizeFormat === 'ratio') {
      // ratio 方言用清晰度档位计价，且 quality 字段被服务端固定为 high、传别的值只会被忽略，
      // 所以不传，免得管理员以为调低 quality 能省钱
      return { size: toRatio(req.ratio, req.size), resolution: cfg.imageResolution, ...bg, ...extra };
    }
    return { size: req.size, quality: req.quality, ...bg, ...extra };
  }
```

- [ ] **Step 4: 跑测试，确认通过**

```bash
node --import tsx --test packages/provider-gateway/src/provider-gateway.test.ts
```

预期：全 PASS。

- [ ] **Step 5: 提交**

```bash
git add packages/provider-gateway/src/types.ts packages/provider-gateway/src/openai.ts packages/provider-gateway/src/provider-gateway.test.ts
git commit -m "feat(gateway): 透明底做成按请求的参数，不与供应商级固定参数混在一起"
```

---

### Task 5: 要了透明底就必须真的拿到透明底

实测：非官方变体（`gpt-image-2.5-sunburst`）会**静默忽略** `background`，返回一张
`ct=2`（RGB，无 alpha）的 PNG，而且把「透明」**画成棋盘格**。用户拿到一张格子图却看到
「已生成」，比报错更糟。

**Files:**
- Create: `packages/provider-gateway/src/png.ts`
- Create: `packages/provider-gateway/src/png.test.ts`
- Modify: `packages/provider-gateway/src/gateway.ts`
- Modify: `packages/provider-gateway/src/mock.ts`

- [ ] **Step 1: 写失败的测试**

新建 `packages/provider-gateway/src/png.test.ts`：

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { pngHasAlpha } from './png.js';

/** 拼一个只有签名与 IHDR 的最小 PNG，够 pngHasAlpha 判色彩类型 */
function fakePng(colorType: number): Buffer {
  const buf = Buffer.alloc(26);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'latin1');
  buf[25] = colorType;
  return buf;
}

test('ct=6（RGBA）与 ct=4（灰度+alpha）算有 alpha', () => {
  assert.equal(pngHasAlpha(fakePng(6)), true);
  assert.equal(pngHasAlpha(fakePng(4)), true);
});

test('ct=2（RGB）与 ct=0（灰度）算没有 alpha——实测非官方变体返回的就是 ct=2', () => {
  assert.equal(pngHasAlpha(fakePng(2)), false);
  assert.equal(pngHasAlpha(fakePng(0)), false);
});

test('ct=3（调色板）当它有——调色板可以靠 tRNS 带透明，不值得为此再解一遍', () => {
  assert.equal(pngHasAlpha(fakePng(3)), true);
});

test('不是 PNG、或太短，一律当没有', () => {
  assert.equal(pngHasAlpha(Buffer.from('not a png at all, definitely not')), false);
  assert.equal(pngHasAlpha(Buffer.alloc(4)), false);
});

test('签名对但第一个块不是 IHDR，当没有', () => {
  const buf = fakePng(6);
  buf.write('IDAT', 12, 'latin1');
  assert.equal(pngHasAlpha(buf), false);
});
```

- [ ] **Step 2: 跑测试，确认它失败**

```bash
node --import tsx --test packages/provider-gateway/src/png.test.ts
```

预期：FAIL，`Cannot find module './png.js'`。

- [ ] **Step 3: 实现 `pngHasAlpha`**

新建 `packages/provider-gateway/src/png.ts`：

```ts
/**
 * 这张 PNG 有没有 alpha 通道。
 *
 * 只看开头 26 个字节，**不解码**：色彩类型在从 0 数起的第 25 个字节
 * （8 字节签名 + 4 字节块长 + 4 字节 `IHDR` + 4 字节宽 + 4 字节高 + 1 字节位深）。
 *
 * 存在的理由是「要了透明底却没拿到」这件事**必须报出来**：实测非官方变体会静默忽略
 * `background` 参数，返回一张没有 alpha 的图，用户拿到的是一张画着棋盘格的照片。
 */
export function pngHasAlpha(buf: Buffer): boolean {
  if (buf.length < 26) return false;
  for (let i = 0; i < 8; i += 1) {
    if (buf[i] !== PNG_SIGNATURE[i]) return false;
  }
  if (buf.toString('latin1', 12, 16) !== 'IHDR') return false;
  const colorType = buf[25]!;
  // 0（灰度）与 2（RGB）一定没有 alpha；4 / 6 有；3（调色板）可能靠 tRNS 带透明，当它有
  return colorType !== 0 && colorType !== 2;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
```

- [ ] **Step 4: 跑测试，确认通过**

```bash
node --import tsx --test packages/provider-gateway/src/png.test.ts
```

预期：全 PASS。

- [ ] **Step 5: 在网关里接上检查**

`packages/provider-gateway/src/gateway.ts` 顶部导入：

```ts
import { pngHasAlpha } from './png.js';
```

在 `gateway.ts` 里（`createGateway` 外面，模块级）加：

```ts
/**
 * 要了透明底就必须真的拿到透明底。
 *
 * 实测：非官方变体（`gpt-image-2.5-sunburst`）会**静默忽略** `background`，返回一张
 * ct=2（RGB，无 alpha）的 PNG，还把「透明」画成棋盘格。用户拿到一张格子图却看到
 * 「已生成」，比报错更糟——所以这里当场验，验不过就抛。
 *
 * 抛而不是降级：降级会静默换一张「能出图但不是透明底」的，那正是要避免的事。
 */
function assertTransparent(images: { buffer: Buffer; mime: string }[]): void {
  if (images.every((im) => pngHasAlpha(im.buffer))) return;
  throw new Error(
    'PROVIDER_ERROR 这个模型没给出透明底（返回的 PNG 没有 alpha 通道），'
    + '检查图片供应商的模型配置',
  );
}
```

`createGateway` 返回对象里的 `image` 方法（现在是这样）：

```ts
    async image(req: ImageRequest): Promise<ImageResult> {
      const route = resolveRoute(cfg, req.taskType);
      return run<ImageResult>({
        route,
        kind: 'image',
        amount: req.n,
        tokens: () => ({ inputTokens: 0, outputTokens: 0 }),
        call: (client, model, provider) => client.image(req, model, provider),
      });
    },
```

改成：

```ts
    async image(req: ImageRequest): Promise<ImageResult> {
      const route = resolveRoute(cfg, req.taskType);
      const result = await run<ImageResult>({
        route,
        kind: 'image',
        amount: req.n,
        tokens: () => ({ inputTokens: 0, outputTokens: 0 }),
        call: (client, model, provider) => client.image(req, model, provider),
      });
      // 放在 `run` **之后**：降级链已经跑完，验的是最终要交给用户的那一张
      if (req.background === 'transparent') assertTransparent(result.images);
      return result;
    },
```

- [ ] **Step 6: Mock 也要出得了 alpha**

不补这一步，mock 模式下「生成透明底」会当场报错，开发时没法验。

`packages/provider-gateway/src/mock.ts` 的 `image` 方法改成：

```ts
  async image(req: ImageRequest, model: string, _cfg: Provider): Promise<ImageResult> {
    const { width, height } = targetImageSize(req.size);
    // 要透明底就得真给 alpha，否则网关那道检查会在 mock 模式下一直报错，
    // 开发时根本验不了这条链路
    const buffer = buildPng(req.prompt, width, height, req.background === 'transparent');
    const count = Math.max(1, Math.floor(req.n));
    const images = Array.from({ length: count }, () => ({ buffer, mime: 'image/png' }));
```

`buildPng` 加一个参数：

```ts
function buildPng(prompt: string, width: number, height: number, transparent = false): Buffer {
```

循环里改成按通道数走：

```ts
  const channels = transparent ? 4 : 3;
  const stride = width * channels;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // 过滤方法：None
    const ny = height > 1 ? y / (height - 1) : 0;
    for (let x = 0; x < width; x++) {
      const nx = width > 1 ? x / (width - 1) : 0;
      const g = Math.min(1, Math.max(0, (nx + ny) / 2));
      let r = bgTop[0] + (bgBottom[0] - bgTop[0]) * g;
      let gg = bgTop[1] + (bgBottom[1] - bgTop[1]) * g;
      let b = bgTop[2] + (bgBottom[2] - bgTop[2]) * g;
      // 覆盖度：形状盖到的地方才不透明，其余地方在透明模式下是全透明的
      let cover = 0;
      for (const s of shapes) {
        const dx = nx - s.cx;
        const dy = ny - s.cy;
        const cos = Math.cos(-s.rot);
        const sin = Math.sin(-s.rot);
        const ex = (dx * cos - dy * sin) / s.rx;
        const ey = (dx * sin + dy * cos) / s.ry;
        const cov = 1 - smoothstep(0.72, 1, Math.hypot(ex, ey));
        if (cov <= 0) continue;
        if (cov > cover) cover = cov;
        const a = cov * s.alpha;
        r += (s.color[0] - r) * a;
        gg += (s.color[1] - gg) * a;
        b += (s.color[2] - b) * a;
      }
      const o = rowStart + 1 + x * channels;
      raw[o] = clampByte(r);
      raw[o + 1] = clampByte(gg);
      raw[o + 2] = clampByte(b);
      if (transparent) raw[o + 3] = clampByte(cover * 255);
    }
  }
```

`ihdr[9]` 那行改成：

```ts
  ihdr[9] = transparent ? 6 : 2; // 颜色类型：透明底要 RGBA，否则真彩 RGB
```

- [ ] **Step 7: 加一条 mock 的测试**

追加到 `packages/provider-gateway/src/provider-gateway.test.ts`：

```ts
test('mock 要了透明底就给带 alpha 的 PNG', async () => {
  const gw = createGateway({
    getProvider: () => makeProvider({ providerId: 'p-mock', isMock: true }),
    getRoute: () => makeRoute({ taskType: 'image' }),
  });
  const res = await gw.image(ASK_TRANSPARENT);
  assert.equal(pngHasAlpha(res.images[0]!.buffer), true);
  const plain = await gw.image({
    taskType: 'image', prompt: 'p', size: '256x256', quality: 'high', n: 1,
  });
  assert.equal(pngHasAlpha(plain.images[0]!.buffer), false, '没要透明底就还是老样子');
});
```

`pngHasAlpha` 从 `./png.js` 导入。

- [ ] **Step 8: 跑测试，确认通过**

```bash
node --import tsx --test packages/provider-gateway/src/png.test.ts
node --import tsx --test packages/provider-gateway/src/provider-gateway.test.ts
pnpm --filter @lumen/provider-gateway typecheck
```

预期：全 PASS，类型检查过。

- [ ] **Step 9: 提交**

```bash
git add packages/provider-gateway/src/png.ts packages/provider-gateway/src/png.test.ts packages/provider-gateway/src/gateway.ts packages/provider-gateway/src/mock.ts
git commit -m "feat(gateway): 要了透明底就验一次真有没有 alpha，没有就报错不假装成功"
```

---

### Task 6: 图片路由接上 cutout 参数

**Files:**
- Modify: `apps/api/src/routes/projects.ts:592-630`（`pagesRouter.get('/:pageId/image/stream', …)`）

- [ ] **Step 1: 改查询参数的 schema**

把路由里那段 `parseQuery` 改成：

```ts
  const q = parseQuery(z.object({
    slot: z.coerce.number().int().min(0),
    prompt: z.string().max(2000).optional(),
    /**
     * 这个图位是不是要透明底。**由面板算好传过来**，不在服务端重算：面板手里那份
     * `imageSlotsOf` 的结果就是有效值（用户的 `cutout: false` 覆盖已经算进去了），
     * 服务端要自己算得把风格文档、色板、素材库都拉进来重跑一遍同一套规则，
     * 而结果未必与面板显示的一致——那种错不报错，只是「面板写着 A、生成的是 B」。
     */
    cutout: z.enum(['0', '1']).optional(),
  }), req);
```

- [ ] **Step 2: 按它决定要不要透明底**

`slotImagePrompt` 那句之后、`sse.send('progress', …)` 之前不用动；把 `billedGateway(...).image({...})` 那段改成：

```ts
    const transparent = q.cutout === '1';
    const result = await billedGateway(tenantId, userId).image({
      taskType: 'image',
      prompt,
      // 与图片块那条链路同一组参数。**透明底走 1:1**：图位是 `object-fit: contain`，
      // 透明边距也算进画面里，16:9 的宽画布会让主体在框里缩得更小
      size: '1536x1024',
      ratio: transparent ? '1:1' : '16:9',
      quality: 'high',
      n: 1,
      ...(transparent ? { background: 'transparent' as const } : {}),
    });
```

（`size` 不跟着 `ratio` 变是刻意的：`ratio` 方言下 `size` 不进请求体，写它只是为了
`pixels` 方言的供应商不炸。）

- [ ] **Step 3: 跑类型检查**

```bash
pnpm --filter @lumen/api typecheck
```

预期：过。

- [ ] **Step 4: 提交**

```bash
git add apps/api/src/routes/projects.ts
git commit -m "feat(api): 图片生成按图位性质决定要不要透明底，透明底走 1:1"
```

---

### Task 7: 面板删掉抠图，按钮跟着图位性质改名

**Files:**
- Modify: `apps/web/src/workbench/RightRail.tsx`
- Delete: `apps/web/src/workbench/cutout.ts`
- Delete: `apps/web/src/workbench/cutout.test.ts`

- [ ] **Step 1: 先确认没有别处还在用**

```bash
grep -rn "cutout.js\|keyOutImageToDataUrl\|keyOutBackground\|SOLID_SUBJECT_MIN" apps packages --include=*.ts --include=*.tsx
```

预期：只命中 `apps/web/src/workbench/cutout.ts`、`cutout.test.ts` 与
`RightRail.tsx` 里的导入。**若还有别处命中，先停下来看清楚那是谁在用**，别直接删。

- [ ] **Step 2: 删掉文件**

```bash
git rm apps/web/src/workbench/cutout.ts apps/web/src/workbench/cutout.test.ts
```

- [ ] **Step 3: 删掉 RightRail 里的抠图**

1. 删导入：`import { keyOutImageToDataUrl } from './cutout.js';`
2. 删整个 `const cutout = useMutation({ … })` 块（那段以「抠图。在浏览器里做」开头的
   注释连同函数一起删）
3. 删渲染里那段「抠图」按钮：

```tsx
              {!slot.hidden && slot.src && (
                <Tooltip content="去掉接近纯色的背景，变成透明底。只对背景干净的图有效">
                  <Button
                    size="sm"
                    icon="Scissors"
                    loading={cutout.isPending && cutout.variables === slot.index}
                    onClick={() => cutout.mutate(slot.index)}
                  >
                    抠图
                  </Button>
                </Tooltip>
              )}
```

4. `Tooltip` 若因此在 `@lumen/ui` 的导入里没人用了，一并删掉那个名字（该文件里还有
   别的 `Tooltip` 用法就先留着——以 `grep -n "Tooltip" apps/web/src/workbench/RightRail.tsx`
   的结果为准）。

- [ ] **Step 4: 生成时把图位性质带上，按钮跟着改名**

`regenerate` 加一个参数：

```ts
  const regenerate = (index: number, prompt: string, transparent: boolean) => {
    if (genStopRef.current) return;
    setGen({ index, label: '正在准备', startedAt: Date.now() });
    const finish = () => { genStopRef.current = null; setGen(null); };

    const stop = streamSse(
      `/pages/${page.pageId}/image/stream?slot=${index}`
      + `&prompt=${encodeURIComponent(prompt)}`
      // 图位要透明底时让服务端出透明底。**由面板算好传过去**——它手里那份
      // `imageSlotsOf` 的结果就是有效值，服务端重算未必与画布上看到的一致
      + `&cutout=${transparent ? 1 : 0}`,
      {
```

按钮改成：

```tsx
              <Button
                size="sm"
                variant="primary"
                icon="Sparkles"
                loading={busy}
                disabled={gen !== null && !busy}
                onClick={() => regenerate(slot.index, ov?.prompt ?? '', slot.cutout)}
              >
                {slot.cutout ? '生成透明底版本' : '重新生成'}
              </Button>
```

**还有一处必须改，它在同一个函数里、很容易漏**：`regenerate` 的 SSE 事件处理里，`image` 事件现在写的是

```ts
setSlot(index, { src: String(d.url), cutout: false });
```

那个 `cutout: false` 是**重新生成出普通照片那个年代留下的**。现在抠图位点「生成透明底版本」时，它会当场把图位退回非抠图态：`markCutout` 是 `ov.cutout ?? (declared || …)`，`false` 压过页面自己声明的 `data-lumen-cutout` —— 按钮弹回「重新生成」、预览从 `contain` 变 `cover` 把刚生成的透明图裁掉、画布上的标记被摘。人物页的人像位尤其糟（`people-skeletons.ts` 明说骨架不自己写 `object-fit`，全靠那条注入规则钉住）。

改成只写 `src`：

```ts
          } else if (event === 'image') {
            // **不动 `cutout`**：这个图位是不是透明底位由 `slot.cutout` 说了算，
            // 生成结果不该反过来改它。早先这里写死 `cutout: false` 是对的——那时
            // 重新生成出的都是普通照片；现在抠图位要出透明底，写死就把自己废了。
            setSlot(index, { src: String(d.url) });
            toast.success('已生成一张新图', '按「保存本页」落盘');
            finish();
```

**顺手把两处提到已删功能的注释订正掉**（描述的东西不存在了，留着会误导）：

1. `upload` 的 `onSuccess` 附近：`// 上传的图按普通照片落（cutout: false）：用户要抠图是另一件事，` → 把「抠图」改成「透明底」。
2. 「新增一个图位」按钮下方那段说明：`——别的调整（换图、抠图、位置）都存在覆盖表里，不受影响。` → `（换图、位置、是否用透明底）`。

`GeometryFields` 上方那句 `/** 只清几何，保留换图 / 抠图 / 提示词… */` 里的「抠图」也一并统一成「透明底」。

**徽标与图库弹层里那个「抠图」不用改**——作名词标注「这一位是透明底位」没错，属既有约定。

- [ ] **Step 5: 类型检查与全量测试**

```bash
pnpm --filter @lumen/web typecheck
pnpm test
```

预期：都过。`pnpm test` 的用例数会**少 9 条**（`cutout.test.ts` 被删了），这是预期的。

- [ ] **Step 6: 提交**

```bash
git add -A apps/web/src/workbench
git commit -m "feat(workbench): 删掉本地抠图，图位要透明底就生成时直接出"
```

---

### Task 8: 让模型把标注写出来

**Files:**
- Modify: `packages/server-core/src/services/generate-html.service.ts:46-75`（`PAGE_SYSTEM`）

- [ ] **Step 1: 加规则**

在 `PAGE_SYSTEM` 数组里，`'内容是用户给的，**一个字都不要改**：…'` 那两行**之前**插入：

```ts
  '',
  /**
   * 图位的两种性质。**模型能明确控制的那条判据就是这个标记**——渲染层认它，也认
   * 样式里的 `object-fit: contain`（后者是给存量页面兜底的，新写的页面靠这一条）。
   * 标了才会去要透明底的主体图，没标就当普通照片。写漏了不会报错，只会在该配
   * 透明底主体图的地方配成一张普通照片——实测暖调纸感那套风格的封面就是这么坏的。
   */
  '图位要的是**透明底的主体图**时（这张图不该被裁切、要完整看见；人物页的人像位也算这一类），',
  '标签要写成 `<img data-lumen-image="n" data-lumen-cutout="1">`；',
  '样式里已经这么写了的（比如人物页骨架给的人像位）照抄，不要摘掉；',
  '其余图位按普通照片写，不要加这个标记。',
  '',
```

**条件必须写在语义层（「要透明底的主体图」），不能写在症状层（「样式里写了 `contain`」）。**
人物页骨架里的人像位写的是 `data-lumen-cutout="1"` 但样式里**没有** `contain`（骨架刻意
用容器裁切 + 那条注入的 `!important` contain 规则，见 `people-skeletons.ts`）。按症状写的话，
人像位恰好落进「其余图位」，系统消息叫模型别标、用户消息里的骨架又叫它标——模型听了系统
消息，人像位就退回普通照片池。**「要透明底」与「不被裁切」不是一回事**，人像位正是
「要透明底、却被容器裁」的那一类。

末尾那个 `''` 不能省：本文件约定空行分隔主题块，缺了它，新规则会和「内容是用户给的」
读成一段。

- [ ] **Step 2: 跑类型检查与测试**

```bash
pnpm --filter @lumen/server-core typecheck
pnpm test
```

预期：都过。

- [ ] **Step 3: 提交**

```bash
git add packages/server-core/src/services/generate-html.service.ts
git commit -m "feat(generate): 提示词要求模型把「这一位要透明底」标出来"
```

---

### Task 9: 真浏览器实测

仓库规矩：改渲染 / 导出 / 前端交互都要真浏览器实测。**预览面板不可用时**借
`apps/worker` 的 playwright，脚本放 `apps/worker/scratch/`，用**纯 `.mjs`**
（tsx 会给 `page.evaluate` 里的具名函数加 `__name` 装饰，注入页面就报
`__name is not defined`）。

**前置：** 供应商模型已换成官方变体（否则这一步会如实报错，那也是一种通过——见第 4 条）。

**Files:**
- Create: `apps/worker/scratch/verify-transparent.mjs`

- [ ] **Step 1: 写脚本**

```js
/**
 * 透明底配图实测。
 *
 * 四件事：标注过的图位出透明底、画布上主体完整浮着、未标注的仍出普通照片、
 * 模型不支持时如实报错。
 */
import { chromium } from 'playwright';

const WEB = 'http://localhost:5273';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e).slice(0, 300)));

await page.goto(`${WEB}/login`, { waitUntil: 'networkidle' });
await page.fill('#login-account', 'admin');
await page.fill('#login-password', 'admin');
await page.click('button[type=submit]');
await page.waitForURL('**/projects');
await page.goto(`${WEB}/projects/prj_u3zrgvlkke`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

const tab = page.locator('[role=tab][aria-label="图片"]');
for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) await tab.dispatchEvent(t);
await tab.click();
await page.waitForTimeout(800);

const panel = () => page.locator('aside').last();
const panelButton = (text) => panel().locator('button', { hasText: text }).first();

/** 读 iframe 里第一个图位的 src 与计算样式 */
const probe = () => page.evaluate(() => {
  const f = document.querySelector('iframe[title="风格样机"]');
  const el = f?.contentDocument?.querySelector('[data-lumen-slot]');
  if (!el) return null;
  const cs = f.contentWindow.getComputedStyle(el);
  return {
    src: el.getAttribute('src') || '',
    cutout: el.hasAttribute('data-lumen-cutout'),
    objectFit: cs.objectFit,
  };
});

const before = await probe();
console.log('  起点：', JSON.stringify(before));
check('封面图位被认成抠图位（contain 写在 class 规则里也认得出）', before?.cutout === true);
check('落图时带上了 object-fit: contain', before?.objectFit === 'contain', before?.objectFit);
check('按钮跟着改名了', (await panel().innerText()).includes('生成透明底版本'));

// 生成透明底
await panel().locator('textarea').first().fill('一片斜置的枯黄落叶，主体完整居中');
await page.waitForTimeout(300);
await panelButton('生成透明底版本').click();

/**
 * 等「换图了 **或** 弹出了 toast」。
 *
 * **两个坑，都实测踩过**：
 *
 * 1. `waitForFunction` 的签名是 `(pageFunction, arg, options)`——`{ timeout }` 必须放
 *    **第三个**位置。写成第二个会被当成传给页面函数的 `arg`，而真正生效的是默认的
 *    30 秒；出图要 40–50 秒，于是每次都在半途放弃，面板上还留着「正在生成图片（已等
 *    30 秒）」，看着像卡住。
 * 2. 判据不能只写「src 变成 /files/」：**报错时 src 根本不会变**，那样只会白等满超时。
 *    而错误只活在一个几秒后自动消失的 toast 里，等超时再回头查就什么都看不到了。
 *    所以要挂一个观察器把出现过的 toast 记下来，并让它参与结束条件。
 */
await page.evaluate(() => {
  window.__toasts = [];
  const grab = () => {
    for (const el of document.querySelectorAll('[role=status],[data-sonner-toast]')) {
      const t = (el.textContent || '').trim();
      if (t && !window.__toasts.includes(t)) window.__toasts.push(t);
    }
  };
  new MutationObserver(grab).observe(document.body, { subtree: true, childList: true, characterData: true });
  grab();
});
await page.waitForFunction(() => {
  const f = document.querySelector('iframe[title="风格样机"]');
  const img = f?.contentDocument?.querySelector('[data-lumen-slot]');
  if (img?.getAttribute('src')?.startsWith('/files/')) return true;
  return (window.__toasts ?? []).some((t) => t.includes('生成失败'));
}, null, { timeout: 300000 }).catch(() => {});

const after = await probe();
check('新图落到了这个图位', after?.src.startsWith('/files/'), after?.src);

if (!after?.src.startsWith('/files/')) {
  /**
   * 没落图——把界面上的话原样打出来。
   *
   * **模型不支持透明底时走的正是这条路**，而这一步要验的就是「界面如实报错，而不是
   * 静默把一张棋盘格当成功存下来」。所以这里不是「测试挂了」，是要看那句话。
   */
  console.log('  —— 没出图。面板上的话：');
  console.log((await panel().innerText()).split('\n').filter((l) => l.trim()).slice(-12)
    .map((l) => `     ${l}`).join('\n'));
  console.log('  —— 整个过程里出现过的 toast：');
  console.log('    ', await page.evaluate(() => (window.__toasts ?? []).join(' | ') || '（没有）'));
  await page.screenshot({ path: 'scratch/transparent-error.png' });
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed（没出图，见上面面板与 toast 里的话）`);
  process.exit(2);
}

// 这张 PNG 到底有没有 alpha
const alpha = await page.evaluate(async (url) => {
  const el = new Image();
  await new Promise((res, rej) => { el.onload = res; el.onerror = rej; el.src = url; });
  const c = document.createElement('canvas');
  c.width = el.naturalWidth; c.height = el.naturalHeight;
  const ctx = c.getContext('2d');
  ctx.drawImage(el, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let clear = 0;
  for (let i = 3; i < d.length; i += 4 * 37) if (d[i] < 16) clear += 1;
  return { clear, sampled: Math.ceil(d.length / (4 * 37)) };
}, after?.src);
const share = alpha.clear / alpha.sampled;
check('这张图真的带透明通道', share > 0.15, `全透明像素占 ${(share * 100).toFixed(0)}%`);

/**
 * **生成完还要再看一次图位本身。** 这一段是补的——代码质量审查发现过一个真实缺陷：
 * SSE 的 `image` 事件处理里写着 `setSlot(index, { src, cutout: false })`，于是
 * 「生成透明底版本」成功后，图位当场被退回非抠图态（按钮弹回「重新生成」、预览从
 * `contain` 变 `cover` 把刚生成的透明图裁掉、画布上的标记被摘）。只查「src 变了」
 * 与「文件有 alpha」是抓不到它的。
 */
const afterSlot = await probe();
check('生成完图位仍是抠图位（标记还在）', afterSlot?.cutout === true);
check('生成完仍按不裁切渲染', afterSlot?.objectFit === 'contain', afterSlot?.objectFit);
check('按钮仍写着「生成透明底版本」', (await panel().innerText()).includes('生成透明底版本'));

await page.screenshot({ path: 'scratch/transparent-canvas.png' });
await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
```

- [ ] **Step 2: 跑它**

```bash
cd apps/worker && node scratch/verify-transparent.mjs
```

预期：全 PASS。**若第一条就 FAIL（封面没被认成抠图位）**，去看
`imageSlotsOf` 拿到的片段里那个 `<img>` 有没有 `class="leaf"`——实测是有的；
没有的话说明这本书的页面与实测样本不同，把真实片段补进 Task 1 的测试用例。

- [ ] **Step 3: 看画布**

截图 `apps/worker/scratch/transparent-canvas.png`，确认落叶完整浮在版面上、
没有被裁切、边缘干净。

- [ ] **Step 4: 反向实测：模型不支持时要报错**

把供应商的「图片模型」临时改回 `gpt-image-2.5-sunburst`（管理后台），再跑一次
「生成透明底版本」。

预期：**界面如实报错**「这个模型没给出透明底（返回的 PNG 没有 alpha 通道），检查图片
供应商的模型配置」，**不是**静默出一张棋盘格。验完把模型改回官方变体。

- [ ] **Step 5: 对照组**

同一页里找一个**没标注**的图位（`class` 里是 `object-fit: cover` 的那种），点它的
「重新生成」：

预期：按钮写的是「重新生成」，出的是普通照片，图位上**没有** `data-lumen-cutout`。

- [ ] **Step 6: 提交**

```bash
git add apps/worker/scratch/verify-transparent.mjs
git commit -m "test(worker): 透明底配图的真浏览器实测脚本"
```

---

## 收尾

- [ ] `pnpm test`、`pnpm -r typecheck`、`pnpm build` 全过。
- [ ] 全量测试的用例数比改动前**少 9 条**（删掉的 `cutout.test.ts`），除此之外数量只增不减。
- [ ] `grep -rn "keyOut\|抠图" apps packages --include=*.ts --include=*.tsx` 只剩
      `data-lumen-cutout` 这类标记名与注释，没有残留的本地抠图实现。

## 不做（与规格一致）

- 不修本地抠图算法——整个删掉，不修。
- 不补物件抠图素材、不改 `REGULAR_POOL`（「图位分池」那份规格的事）。
- 不做「按页批量出透明底」。
- 不改识别链路；不动 iframe 的 `sandbox`。
