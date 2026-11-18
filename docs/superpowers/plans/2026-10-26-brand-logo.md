# 项目品牌 logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户可以在「项目需求」左栏上传一张品牌 logo，自动重绘成矢量稿并确认，之后每一页页眉都显示真 logo 与真品牌名。

**Architecture:** logo 不走提示词，走**渲染时注入**——模型在页眉留一个 `data-lumen-brand` 空槽位，`buildPageDocument` 装配文档时把真内容填进去。这与现有的 `data-lumen-image` 图位是同一套做法，好处是确定性（SVG 让模型「顺手改一下」就坏）、不烧 token、换 logo 不用重新生成页面。

**Tech Stack:** TypeScript ESM（`NodeNext`）、zod、`node:sqlite`、Express、React + Vite、`node:test`

**设计文档：** [docs/superpowers/specs/2026-10-26-brand-logo-design.md](../specs/2026-10-26-brand-logo-design.md)

**测试文件命名：** 设计文档里写的是 `brand-logo.service.test.ts`，本仓惯例是去掉 `.service`（`generate-html.service.ts` → `generate-html.test.ts`）。计划按惯例用 `brand-logo.test.ts`。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `packages/server-core/src/db/migrations/009_project_brand.sql` | 新建。`projects` 加五列 |
| `packages/ir-schema/src/brand.ts` | 新建。`BrandSlot` 类型、槽位属性名、`brandOf` 把项目行翻成槽位参数 |
| `packages/ir-schema/src/html-doc.ts` | 改。`fillBrandSlots` + `buildPageDocument` 接线 |
| `packages/ir-schema/src/provider.ts` | 改。`TaskType` 加 `logo_redraw` |
| `packages/server-core/src/services/seed.service.ts` | 改。`ROUTE_DEFAULTS` 加一行 |
| `packages/server-core/src/services/brand-logo.service.ts` | 新建。重绘：读原图 → 视觉模型 → 校验 → 落库 |
| `packages/server-core/src/services/generate-html.service.ts` | 改。提示词加 `brandBlock` |
| `packages/server-core/src/services/project.service.ts` | 改。`ProjectRow` 与 `updateProject` 加五列 |
| `apps/api/src/routes/projects.ts` | 改。三条品牌路由 |
| `apps/web/src/components/HtmlMock.tsx` | 改。加可选 `brand` prop |
| `apps/web/src/workbench/CenterCanvas.tsx`、`Presenter.tsx` | 改。把项目的品牌传进 `HtmlMock` |
| `apps/web/src/workbench/LeftRail.tsx` | 改。`BriefPanel` 加「品牌」一块 |
| `apps/worker/src/render.tsx` | 改。`pageMarkup` / `buildSinglePageHtml` / `buildSelfContainedHtml` 加品牌参数 |
| `apps/worker/src/handlers/export-pptx.tsx`、`export-pdf.tsx`、单文件导出 | 改。把项目的品牌一路传下去 |

**关键约束：`brandOf` 必须放在 `@lumen/ir-schema`，不能放 `server-core`。** 前端 `HtmlMock` 也要用它，而 `server-core` 依赖 `node:sqlite`，前端引不动。

---

## Task 1: 项目上的品牌字段

**Files:**
- Create: `packages/server-core/src/db/migrations/009_project_brand.sql`
- Modify: `packages/server-core/src/services/project.service.ts:17-38`（`ProjectRow`）、`:158-168`（`updateProject`）
- Test: `packages/server-core/src/services/brand-logo.test.ts`（新建）

- [ ] **Step 1: 写迁移**

新建 `packages/server-core/src/db/migrations/009_project_brand.sql`：

```sql
-- 项目品牌：上传的 logo、它的矢量重绘稿、以及品牌名与标语。
--
-- 五列都跟着**项目**走，不跟着某一次生成走——一本 deck 一套品牌，
-- 与 depth / targetPages 同一条规矩。
--
-- brandLogoSvg 存的是 SVG 源码而不是对象 key：装配页面的 buildPageDocument 是**同步**函数，
-- 取不了远端对象。几 KB 一行，比把装配改成异步划算得多。
--
-- brandLogoMode 三态：'' 没有 logo、'redraw' 用重绘稿、'original' 用上传的原图。
-- 显式存一列而不是「有 svg 就用 svg」：重绘成功之后用户仍可能想退回原图，
-- 靠推导就退不回去了。
ALTER TABLE projects ADD COLUMN brandLogoImage TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN brandLogoSvg TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN brandLogoMode TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN brandName TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN brandTagline TEXT NOT NULL DEFAULT '';
```

- [ ] **Step 2: 写失败的测试**

新建 `packages/server-core/src/services/brand-logo.test.ts`：

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 环境必须在导入任何模块之前设定
const tmp = mkdtempSync(join(tmpdir(), 'lumen-brand-'));
process.env.NODE_ENV = 'test';
process.env.LUMEN_DB_PATH = join(tmp, 'test.db');
process.env.LUMEN_SECRET_KEY = 'test-secret-key-0123456789abcdefghijklmnop';

const { migrate } = await import('../db/migrate.js');
const { closeDb } = await import('../db/client.js');
const { ensureSeed } = await import('./seed.service.js');
const { createUser } = await import('./user.service.js');
const { createProject, requireProject, updateProject } = await import('./project.service.js');

migrate();
ensureSeed();

test.after(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

let seq = 0;
function makeProject() {
  seq += 1;
  const user = createUser({
    username: `brand${Date.now()}${Math.floor(Math.random() * 100000)}`,
    password: 'abcd1234',
    role: 'user',
    source: 'self_signup',
  });
  return createProject({
    tenantId: user.tenantId,
    ownerId: user.userId,
    title: `品牌验证 ${seq}`,
    brief: '一段需求。',
  });
}

/* ---------------- 数据模型 ---------------- */

test('品牌五个字段跟着项目走，默认都是空的', () => {
  const project = makeProject();
  assert.equal(project.brandLogoImage, '');
  assert.equal(project.brandLogoSvg, '');
  assert.equal(project.brandLogoMode, '');
  assert.equal(project.brandName, '');
  assert.equal(project.brandTagline, '');

  const svg = '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
  const updated = updateProject(project.projectId, project.tenantId, {
    brandName: '星图科技',
    brandTagline: '让数据说话',
    brandLogoImage: 'tn_x/proj/uploads/1-logo.png',
    brandLogoSvg: svg,
    brandLogoMode: 'redraw',
  });

  assert.equal(updated.brandName, '星图科技');
  assert.equal(updated.brandLogoMode, 'redraw');
  assert.equal(
    requireProject(project.projectId, project.tenantId).brandLogoSvg, svg,
    '要真的落库，不能只在返回值里',
  );
});
```

- [ ] **Step 3: 跑测试，确认失败**

Run: `cd packages/server-core && node --import tsx --test src/services/brand-logo.test.ts`

Expected: FAIL —— `project.brandLogoImage` 是 `undefined`（列还不存在，`ProjectRow` 也没这两个字段），
或先报 TS 类型错「对象字面量不能指定未知属性 `brandName`」。

- [ ] **Step 4: 改 `ProjectRow` 与 `updateProject`**

`packages/server-core/src/services/project.service.ts`，`ProjectRow`（:17-38）在 `targetPages` 后加：

```ts
  /** 上传的 logo 原图的对象 key。空串表示没传 */
  brandLogoImage: string;
  /** 重绘稿的 SVG 源码。空串表示没重绘过 */
  brandLogoSvg: string;
  /** '' 没有 logo / 'redraw' 用重绘稿 / 'original' 用原图 */
  brandLogoMode: string;
  /** 品牌名。空串表示没填 */
  brandName: string;
  /** 标语。空串表示没填 */
  brandTagline: string;
```

`updateProject` 的 `Pick`（:161-163）改成：

```ts
  patch: Partial<Pick<ProjectRow,
    'title' | 'brief' | 'audienceTag' | 'scene' | 'styleId' | 'status'
    | 'thumbnailKey' | 'avatarEnabled' | 'depth' | 'targetPages'
    | 'brandLogoImage' | 'brandLogoSvg' | 'brandLogoMode' | 'brandName' | 'brandTagline'>>,
```

- [ ] **Step 5: 跑测试，确认通过**

Run: `cd packages/server-core && node --import tsx --test src/services/brand-logo.test.ts`

Expected: PASS，1 个用例。

- [ ] **Step 6: 提交**

```bash
git add packages/server-core/src/db/migrations/009_project_brand.sql \
        packages/server-core/src/services/project.service.ts \
        packages/server-core/src/services/brand-logo.test.ts
git commit -m "feat(brand): projects 表加品牌五列"
```

---

## Task 2: 品牌槽位

**Files:**
- Create: `packages/ir-schema/src/brand.ts`
- Modify: `packages/ir-schema/src/index.ts`（加 `export * from './brand.js';`）
- Modify: `packages/ir-schema/src/html-doc.ts`（`fillBrandSlots` + `PageDocumentOptions.brand` + `buildPageDocument` 接线）
- Test: `packages/ir-schema/src/html-doc.test.ts`

- [ ] **Step 1: 写失败的测试**

在 `packages/ir-schema/src/html-doc.test.ts` 末尾追加（文件已有 `PALETTE` / `FONT` 两个常量，直接复用）：

```ts
/* ---------------- 品牌槽位 ---------------- */

// 新增这一行的 import（`brandOf` / `hasBrand` 用来验「清空品牌后槽位被移除」与「有没有品牌」）
import { brandOf, hasBrand } from './brand.js';

const BRAND_FRAG = [
  '<style>.brand-mark{width:34px;height:34px}</style>',
  '<div class="brandbar">',
  '  <span class="brand-mark" data-lumen-brand="logo"></span>',
  '  <span class="brand-name" data-lumen-brand="name"></span>',
  '  <span class="brand-sub" data-lumen-brand="tagline"></span>',
  '</div>',
].join('\n');

const LOGO_SVG = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="currentColor"/></svg>';

/**
 * 槽位里 logo 最终长成的那串 data URL。
 *
 * 稿是**百分号编码**放进 `<img src>` 的，所以断言不能再拿 `doc.includes(LOGO_SVG)` 去比——
 * 那句话在改动后永远为假，而假断言只会让人以为功能坏了。这里复算一遍，而不是抄字面量。
 *
 * 注意：**它证明不了编码是对的**：左右两边走同一个变换，一起错就一起绿。所以下面另有三条
 * **独立**的断言（解码回来查 `xmlns`、查 `currentColor` 已烘掉、查坏色值兜底）。
 * 三者合起来才守得住这条链路。
 */
const logoData = (svg: string, color: string = PALETTE.brand) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"').replace(/currentColor/gi, color),
  )}`;

/**
 * 从文档里取出 logo 那一条 data URL 并解码回 SVG 源码。
 *
 * **只解那一条，不要解整份文档。** `buildPageDocument` 无条件注入的 `IMAGE_SLOT_CSS` 里有
 * `color-mix(… var(--muted) 8%, …)`，那个裸 `%` 后面跟的是逗号、不是合法转义，
 * 对整份文档 `decodeURIComponent` 会直接抛 `URIError: URI malformed`——那样这条用例
 * 任何输入都过不了，而它看起来还像在验功能（这个坑真踩过）。
 */
function decodedLogo(doc: string): string {
  const m = /src="data:image\/svg\+xml;charset=utf-8,([^"]+)"/.exec(doc);
  assert.ok(m, `logo 应当以 data 图片形态进文档，实际片段：${doc.slice(0, 300)}`);
  return decodeURIComponent(m[1]!);
}

test('三个槽位分别填成 logo、品牌名、标语', () => {
  const doc = buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '星图科技', tagline: '让数据说话' },
  });

  assert.ok(doc.includes(logoData(LOGO_SVG)), 'logo 要以 data: 图片的形式进文档');
  assert.ok(doc.includes('星图科技'), '品牌名要填进去');
  assert.ok(doc.includes('让数据说话'), '标语要填进去');
  assert.equal(doc.includes('data-lumen-brand'), false, '槽位属性要留在成品里就等于没填');
});

test('logo 槽填的是 <img>，稿本身绝不内联进文档', () => {
  const doc = buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '星图科技', tagline: '' },
  });

  // 这条是**安全边界**，不是外观偏好：内联进 HTML 文档的 SVG 过的是 HTML 解析器，
  // `<desc>` 是集成点、`<img>`/`<meta>` 是跳出元素，一整类 payload 能借此落进页面。
  // 当图片加载则脚本与外部子资源一律不生效。改回内联会让这条转红。
  assert.equal(doc.includes('<svg'), false, '成品的文档里不许出现内联的 <svg>');
  assert.equal(doc.includes(LOGO_SVG), false, '原稿的字面文本也不该出现');
  assert.ok(doc.includes('<img src="data:image/svg+xml;charset=utf-8,'), 'logo 要走 <img> + data URL');
});

test('单色稿的 currentColor 在渲染时烘成品牌色，图片里拿不到外面的 CSS', () => {
  const doc = buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '星图科技', tagline: '' },
  });
  assert.ok(doc.includes(logoData(LOGO_SVG)), 'currentColor 要换成 palette.brand');
  assert.equal(
    decodedLogo(doc).includes('currentColor'), false,
    '烘完不该还剩 currentColor——<img> 里的 SVG 继承不到外面的 --brand，剩下就是没有颜色',
  );
});

/**
 * **`xmlns` 是硬依赖，漏了整张图加载失败。**
 *
 * 稿走的是 `<img src="data:image/svg+xml,…">`，这条路上浏览器按 **XML** 解析它：
 * 根元素不在 SVG 命名空间里就不是 SVG。实测（真 Chromium）：不带 xmlns → `onerror`、
 * `naturalWidth === 0`；补上 → 正常画出来。而失败时接口不报错、日志没有异常，
 * 用户只看到「重绘成功」加一个空页眉。
 *
 * 提示词里写着「不要写 xmlns」，所以**这条只能靠代码兜**——它就是 `ensureXmlns` 的守卫。
 */
test('稿进图片前必须补上 xmlns，模型的稿不带也要补', () => {
  // 注意 LOGO_SVG 本身**不带** xmlns，正是模型照提示词写出来的样子
  const doc = buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '', tagline: '' },
  });
  const inner = decodedLogo(doc);
  assert.match(inner, /<svg[^>]*\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/, `补出来的稿：${inner}`);

  // 已经带了就不能补第二遍（重复的 xmlns 会让 XML 非法，同样加载失败）
  const withNs = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="1" height="1"/></svg>';
  const again = decodedLogo(buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT, brand: { svg: withNs, name: '', tagline: '' },
  }));
  assert.equal(again.match(/xmlns=/g)?.length, 1, `不该补第二遍：${again}`);
});

/**
 * 判据必须**限定在根标签上、并且看值**。
 *
 * 只问「整篇里出现过 `xmlns=`」的话，下面三种稿会被跳过、产出画不出来的图片
 * （实测都是 `naturalWidth === 0`）：注释或文本里含 `xmlns=`、`xmlns=""`、
 * `xmlns` 指向别的命名空间。而函数的名字与 docstring 说的是「保证根标签带」。
 */
test('xmlns 的判据看根标签的值，不是「整篇里出现过 xmlns=」', () => {
  const NS = 'xmlns="http://www.w3.org/2000/svg"';
  const render = (svg: string) => decodedLogo(buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT, brand: { svg, name: '', tagline: '' },
  }));

  // 注释里出现 `xmlns=` 不算数
  assert.match(
    render('<svg viewBox="0 0 10 10"><!-- 这里写着 xmlns= 三个字 --><rect width="1" height="1"/></svg>'),
    new RegExp(NS),
  );
  // 空命名空间、错命名空间都要被改写
  assert.match(render('<svg xmlns="" viewBox="0 0 10 10"><rect width="1" height="1"/></svg>'), new RegExp(NS));
  assert.match(
    render('<svg xmlns="http://www.w3.org/1999/xhtml" viewBox="0 0 10 10"><rect width="1" height="1"/></svg>'),
    new RegExp(NS),
  );

  // 已经对的不改写、也不补第二遍，而且根标签之外一个字不动
  const right = '<svg class="a" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="1" height="1"/></svg>';
  const out = render(right);
  assert.equal(out.match(/xmlns=/g)?.length, 1);
  assert.ok(out.includes('class="a"'), '根标签上的其它属性不能被改写弄丢');

  /**
   * 根标签要按**第一个元素**去找。注释里完全可以先出现一个完整的假开标签，
   * 取「全文第一个 `<svg`」就会把 xmlns 补进注释、真根标签仍然是空的——
   * 图片照样加载不出来，而且看不出哪里不对。
   */
  const decoy = render(
    '<!-- <svg viewBox="0 0 1 1"> --><svg viewBox="0 0 10 10"><rect width="1" height="1"/></svg>',
  );
  assert.equal(/<!-- <svg xmlns=/.test(decoy), false, `不能把 xmlns 补进注释里：${decoy}`);
  assert.match(
    decoy,
    /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 10 10">/,
    `该补的是真根标签：${decoy}`,
  );

  // 根标签前面出现声明或 DOCTYPE 时，仍然要能找到它。
  //
  // **DOCTYPE 那条不能用 `<!DOCTYPE svg>`。** 那个串里**没有 `<svg` 字面**，于是即使
  // `BEFORE_ROOT` 少了 DOCTYPE 那一支，`head` 退化成空串、第一个命中的 `<svg` 仍然正好是
  // 真根标签——断言照样绿，那一支等于没被验到（实测：去掉那一支 `fail=0`）。
  // 真正能触发它的是**内部子集里出现 `<svg` 字面**的形态，比如下面这条。
  assert.match(render('<?xml version="1.0"?><svg viewBox="0 0 10 10"><rect width="1" height="1"/></svg>'), new RegExp(NS));
  const doctype = render(
    "<!DOCTYPE svg [<!ENTITY e '<svg viewBox=\"0 0 1 1\">'>]><svg viewBox=\"0 0 10 10\"><rect width=\"1\" height=\"1\"/></svg>",
  );
  // 只断言「补对地方」这个不变量，别把 `<!DOCTYPE[^>]*>` 在哪截断也写进断言里——
  // 那种写法会让将来任何一次实现调整都误报
  assert.equal(/<!ENTITY e '<svg xmlns=/.test(doctype), false, `不能把 xmlns 补进 DOCTYPE 里：${doctype}`);
  assert.match(doctype, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 10 10">/, `要补在真根标签上：${doctype}`);
});

/**
 * `palette.brand` 是没有格式校验的裸字符串（`style-doc.ts:124-142`），而它会被**替换进 SVG 源码**。
 * 实测两种坏结果，都不报错：`var(--brand)` 让颜色变成黑色（图片文档里没有自定义属性可继承）；
 * `#06c<b` 让 SVG 变成非法 XML、整张图加载失败。所以认不出是颜色就退回黑色。
 */
test('palette.brand 不是色值时退回黑色，绝不拼坏 SVG', () => {
  const render = (brand: string) => decodedLogo(buildPageDocument(BRAND_FRAG, {
    palette: { ...PALETTE, brand }, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '', tagline: '' },
  }));

  assert.match(render('var(--brand)'), /fill="#000"/, '继承不到的自定义属性要退回黑色，不能原样拼进去');
  assert.match(render('currentColor'), /fill="#000"/, '原样拼 currentColor 等于没染上色');
  assert.match(render('none'), /fill="#000"/, 'none 会让 logo 静默不可见');

  const broken = render('#06c<b');
  assert.equal(broken.includes('<b'), false, `坏色值不能把稿拼出非法标签：${broken}`);
  assert.match(broken, /fill="#000"/);

  assert.match(render('#06c'), /fill="#06c"/, '合法色值要原样用');
  assert.match(render('rgb(1, 2, 3)'), /fill="rgb\(1, 2, 3\)"/, 'rgb() 也要放行');
});

test('彩色稿（没有 currentColor）原样带过去', () => {
  const colorful = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#C7421A"/></svg>';
  const doc = buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: colorful, name: '', tagline: '' },
  });
  assert.ok(doc.includes(logoData(colorful, '#C7421A')), '没有 currentColor 时应当一字不改');
});

/**
 * `mergeStyle` 末尾那句 `replace(/"/g, '&quot;')` 是**承重的**，不是顺手写的。
 *
 * `rebuildOpen` 要拿**双引号**重新拼出那个 style 属性，而模型完全可能写成单引号属性里带双引号
 * （`style='font-family:"Inter"'` 很常见）。不转义就会把属性截断；再往前一步，
 * `style='x" onload="alert(1)'` 会**在页面里真造出一个事件处理器**。
 *
 * 实测：把那个 replace 去掉，`html-doc.test.ts` 47 条**全绿**——没有任何断言在守它。
 */
test('style 里的双引号必须转义，否则属性被截断、甚至拼出事件处理器', () => {
  const render = (frag: string) => buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT, brand: { name: '星图科技', tagline: '' },
  });

  const quoted = render(
    "<span class=\"brand-name\" data-lumen-brand=\"name\" style='font-family:\"Inter\";font-size:14px'></span>",
  );
  const m = /<span[^>]*>/.exec(quoted);
  assert.ok(m, `槽位标签应还在，实际：${quoted.slice(0, 200)}`);
  assert.ok(m[0].includes('&quot;Inter&quot;'), `style 里的双引号要转义，实际：${m[0]}`);
  assert.ok(m[0].includes('font-size:14px'), '后半段不能被截掉');

  const evil = render("<span data-lumen-brand=\"name\" style='x\" onload=\"alert(1)'></span>");
  assert.equal(
    evil.includes('style="x" onload="alert(1)"'), false,
    `不转义就会拼出真的事件处理器：${evil.slice(0, 200)}`,
  );
  assert.ok(evil.includes('&quot; onload=&quot;'), '它现在只是一段没意义的样式文本');
});

test('没填的槽位整个元素删掉，不留空壳', () => {
  const doc = buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '星图科技', tagline: '' },
  });
  assert.equal(/brand-sub/.test(doc), false, '没有标语就该整条删掉，而不是留个空 span');
});

test('用原图时槽位里放 img，指向 /files', () => {
  const doc = buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT,
    brand: { imageSrc: '/files/tn_x/proj/uploads/1-logo.png', name: '', tagline: '' },
  });
  assert.ok(doc.includes('src="/files/tn_x/proj/uploads/1-logo.png"'), '要放原图');
  assert.equal(/brand-name/.test(doc), false, '没填名字就该整条删掉');
});

test('品牌名里的尖括号要转义，不能被当成标签', () => {
  const doc = buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT,
    brand: { name: '<script>alert(1)</script>', tagline: '' },
  });
  assert.equal(doc.includes('<script>alert(1)</script>'), false, '品牌名是用户输入，必须转义');
  assert.ok(doc.includes('&lt;script&gt;'), '转义后仍要显示出来');
});

test('不传 brand 时片段原样，行为与改动前一致', () => {
  const doc = buildPageDocument(BRAND_FRAG, { palette: PALETTE, fontFamily: FONT });
  assert.ok(doc.includes('data-lumen-brand="logo"'), '没品牌就不该动槽位');
});

/**
 * **清空品牌之后，槽位必须被移除，不能留空壳。**
 *
 * 这条钉的是 `brandOf` 的返回类型：它**不能**在五列全空时返回 `undefined`——
 * 那样 `if (opts.brand) fillBrandSlots(...)` 根本不会被调用，配过品牌时生成的页面
 * 页眉上会留着 `class="brand-mark"` 这类空元素。模型的 CSS 只要给它写了尺寸或底色，
 * 用户看到的就是每页多一个空方块，而不是「品牌没了」。
 *
 * 实测过：`brand: undefined` → 槽位原样留着；`brand: { name:'', tagline:'' }` → 整条移除。
 */
test('清空品牌后槽位被整个移除，页眉里不留空壳', () => {
  const doc = buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT,
    // 五列全空的项目行，走的就是 `brandOf`
    brand: brandOf({
      brandLogoImage: '', brandLogoSvg: '', brandLogoMode: '', brandName: '', brandTagline: '',
    }),
  });
  assert.equal(/data-lumen-brand/.test(doc), false, '槽位属性不能留在成品里');
  // 按**元素标记**断言，不能只找 `brand-mark` 这个类名——`BRAND_FRAG` 的 `<style>` 里
  // 就写着 `.brand-mark{width:34px;height:34px}`，那样断言恒为假，等于没守
  for (const cls of ['brand-mark', 'brand-name', 'brand-sub']) {
    assert.equal(doc.includes(`<span class="${cls}"`), false, `${cls} 这条空壳要整个删掉`);
  }
  assert.ok(doc.includes('<div class="brandbar">'), '容器要留着，删的只是槽位那几条');
});

/**
 * `hasBrand` 是**生成侧**要的那个布尔（提示词提不提槽位），而 `brandOf` 是**渲染侧**要的值
 * （永远返回一个 `BrandSlot`，清空品牌时才能把空壳槽位删掉）。两个问题、同一个来源。
 */
test('hasBrand：只有名字也算有品牌，全空才算没有', () => {
  const empty = {
    brandLogoImage: '', brandLogoSvg: '', brandLogoMode: '', brandName: '', brandTagline: '',
  };
  assert.equal(hasBrand(empty), false, '五列全空就是没品牌');
  assert.equal(hasBrand({ ...empty, brandName: '星图科技' }), true, '只有名字也算有');
  assert.equal(
    hasBrand({ ...empty, brandLogoMode: 'original', brandLogoImage: 'tn_x/prj_y/uploads/a.png' }),
    true, '有原图也算有',
  );
  assert.equal(hasBrand({ ...empty, brandLogoMode: 'redraw' }), false, '模式写了但稿没落库，等于没有');

  // **这条是给将来的人看的**：`brandOf` 永远返回真值，所以「有没有」绝不能写成
  // `brandOf(project) !== undefined`——那样每个老项目都会被塞进品牌块
  assert.equal(typeof brandOf(empty), 'object', 'brandOf 永远返回对象，判断「有没有」必须用 hasBrand');
});

test('模型漏写槽位时跳过，不抛', () => {
  const doc = buildPageDocument('<div class="brandbar"><span>品牌名</span></div>', {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '星图科技', tagline: '' },
  });
  assert.ok(doc.includes('品牌名'), '没有槽位就什么都不做');
});

test('品牌名与标语不带内联颜色，颜色归这套风格的规范管', () => {
  const doc = buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '星图科技', tagline: '让数据说话' },
  });
  // 这两条**不能**带内联颜色：「深蓝渐变商务风」的品牌名规范色是 muted，
  // 写死 --brand 就把它盖掉了。logo 槽不在此列——它现在是 `<img>`，颜色烘在图片里。
  for (const cls of ['brand-name', 'brand-sub']) {
    const m = new RegExp(`<span class="${cls}"[^>]*>`).exec(doc);
    assert.ok(m, `${cls} 槽位应还在`);
    assert.equal(m[0].includes('color'), false, `${cls} 不该带内联颜色，实际：${m[0]}`);
  }
});

/* ---- 模型的 HTML 是不可信输入：下面六条钉住「畸形输入不许吃掉正文」---- */

test('槽位漏写闭合标签时跳过它，正文一个字都不能丢', () => {
  // 漏写 </span> 很常见。若默认「吃到片段末尾」，后面整页正文都会消失
  const frag = '<div class="brandbar"><span data-lumen-brand="logo">'
    + '<span data-lumen-brand="name"></span></div><main><p>正文正文</p></main>';
  const doc = buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '星图科技', tagline: '' },
  });
  assert.ok(doc.includes('<p>正文正文</p>'), '正文必须还在');
  assert.ok(doc.includes('星图科技'), '后面那个有闭合的槽位照常填');
});

test('属性值里出现同名字符串时不算命中，无关元素不能被动', () => {
  const frag = '<div title="用 data-lumen-brand=logo 标记"><p>正文</p></div>';
  const doc = buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '星图科技', tagline: '' },
  });
  assert.ok(doc.includes('<p>正文</p>'), '正文不能被吃掉');
  assert.equal(doc.includes(logoData(LOGO_SVG)), false, '不该把 logo 填进一个无关的 div');
});

test('取值不是三种槽位之一时原样不动，绝不删元素', () => {
  const frag = '<header data-lumen-brand="header"><h1>标题</h1></header><p>正文</p>';
  const doc = buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '星图科技', tagline: '' },
  });
  assert.ok(doc.includes('<h1>标题</h1>'), '认不出来的取值不该让元素消失');
  assert.ok(doc.includes('data-lumen-brand="header"'), '也不该动它');
});

test('槽位用的是 div 就保留 div，block 不能变成 inline 的 span', () => {
  const frag = '<div class="brand-name" data-lumen-brand="name"></div>';
  const doc = buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT,
    brand: { name: '星图科技', tagline: '' },
  });
  assert.match(doc, /<div class="brand-name">星图科技<\/div>/);
});

test('模型写在 logo 槽上的内联尺寸要留着，不能被缩成默认大小', () => {
  const frag = '<span class="brand-mark" data-lumen-brand="logo" style="width:34px;height:34px"></span>';
  const doc = buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '', tagline: '' },
  });
  const m = /<span class="brand-mark"[^>]*>/.exec(doc);
  assert.ok(m, '槽位标签应还在');
  assert.ok(m[0].includes('width:34px'), `模型的尺寸要留着，实际：${m[0]}`);
  assert.ok(doc.includes(logoData(LOGO_SVG)), 'logo 照常填进去');
});

test('槽位落在 img 上时换成 span，class 与 style 都带过去', () => {
  const frag = '<img class="logo-mark" data-lumen-brand="logo" style="width:34px">';
  const doc = buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '', tagline: '' },
  });
  assert.ok(doc.includes(logoData(LOGO_SVG)), 'logo 要填进去');
  const m = /<span class="logo-mark"[^>]*>/.exec(doc);
  assert.ok(m, `img 应换成带 class 的 span，实际片段：${doc.slice(0, 200)}`);
  assert.ok(m[0].includes('width:34px'), 'img 上的 style 也要带过去');
});

test('空元素槽位上的 width / height 属性要转成内联尺寸', () => {
  // `<img width="34" height="34">` 是模型很常见的写法。这两个属性在 span 上不再生效，
  // 不转的话 logo 会退回 SVG 自身的默认大小
  const frag = '<img data-lumen-brand="logo" width="34" height="34">';
  const doc = buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '', tagline: '' },
  });
  const m = /<span[^>]*>/.exec(doc);
  assert.ok(m, `img 应换成 span，实际片段：${doc.slice(0, 200)}`);
  assert.ok(m[0].includes('width:34px'), `width 属性要转成内联尺寸，实际：${m[0]}`);
  assert.ok(m[0].includes('height:34px'), `height 属性要转成内联尺寸，实际：${m[0]}`);
});

test('宽度写成百分比时原样带过去', () => {
  const frag = '<img data-lumen-brand="logo" width="50%">';
  const doc = buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '', tagline: '' },
  });
  const m = /<span[^>]*>/.exec(doc);
  assert.ok(m, 'img 应换成 span');
  assert.ok(m[0].includes('width:50%'), `百分比要原样带过去，实际：${m[0]}`);
});

test('槽位属性前漏了空格也要摘掉，脚手架不能漏进成品', () => {
  // 模型漏写空格是常事；摘不掉的话 data-lumen-brand 会留在成品里，违背「槽位属性是脚手架」这条
  const frag = '<span class="brand-mark"data-lumen-brand="logo"></span>';
  const doc = buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '', tagline: '' },
  });
  assert.equal(doc.includes('data-lumen-brand'), false, '漏写空格时也要摘掉');
  assert.ok(doc.includes(logoData(LOGO_SVG)), 'logo 照常填进去');
});

test('空元素换成 span 时 id 也要带过去', () => {
  const frag = '<img id="brandlogo" data-lumen-brand="logo" width="34">';
  const doc = buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '', tagline: '' },
  });
  assert.ok(doc.includes('id="brandlogo"'), '模型的 CSS 可能按 #id 定位，id 不能丢');
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd packages/ir-schema && node --import tsx --test src/html-doc.test.ts`

Expected: FAIL —— `PageDocumentOptions` 上没有 `brand` 这个属性（TS 报错），或 `data-lumen-brand` 原样留在文档里。

- [ ] **Step 3: 写 `packages/ir-schema/src/brand.ts`**

```ts
/**
 * 项目品牌：上传的 logo、它的矢量重绘稿、品牌名与标语。
 *
 * 放在 `ir-schema` 而不是 `server-core`，是因为**前端也要用**——`HtmlMock` 得把项目的品牌
 * 翻成装配参数，而 `server-core` 依赖 `node:sqlite`，前端引不动。
 * 所以这里的入参是结构化类型，不是 `ProjectRow`。
 */

/** 一个项目上跟品牌有关的五个字段。`ProjectRow` 满足它 */
export interface BrandFields {
  brandLogoImage: string;
  brandLogoSvg: string;
  brandLogoMode: string;
  brandName: string;
  brandTagline: string;
}

/**
 * 装配一份页面文档时用的品牌参数。
 *
 * `svg` 与 `imageSrc` 二选一：前者是重绘稿，后者是上传的原图。两个都给时 `svg` 优先。
 * 两个都没有、名字标语也都是空串时，调用方应当传 `undefined`——见 `brandOf`。
 */
export interface BrandSlot {
  svg?: string;
  imageSrc?: string;
  name: string;
  tagline: string;
}

/** 页眉槽位的属性名 */
export const BRAND_SLOT_ATTR = 'data-lumen-brand';

export const BRAND_SLOT_KINDS = ['logo', 'name', 'tagline'] as const;
export type BrandSlotKind = (typeof BRAND_SLOT_KINDS)[number];

/**
 * `brandLogoMode` 的三个取值。**这个集合只在这一处定义**——服务端写入、API 的请求 schema
 * （Task 5）、界面上的切换按钮（Task 8）都从这里取。各写一份的话，将来加第四态必然漏一处。
 *
 * 注意 `BrandFields.brandLogoMode` 声明为 `string` 而不是这个联合类型：它直接对应数据库里
 * 那一列，而库里的值是历史写入的，声明成联合类型是类型层面的谎话。
 * 与同表的 `depth` / `status` 是同一条规矩。
 */
export const BRAND_LOGO_MODES = ['', 'redraw', 'original'] as const;
export type BrandLogoMode = (typeof BRAND_LOGO_MODES)[number];

/**
 * 把项目行翻成装配参数。**永远返回一个 `BrandSlot`**，哪怕五列全空。
 *
 * 为什么**不能**在「什么都没填」时返回 `undefined`：调用方是
 * `if (opts.brand) body = fillBrandSlots(...)`，拿到 `undefined` 就**根本不会去动槽位**。
 * 于是「清空品牌」之后，那些在配着品牌时生成、片段里写着 `data-lumen-brand` 的页面，
 * 页眉上会留着 `class="brand-mark"` 这类**空壳元素**——模型的 CSS 只要给它写了尺寸或底色，
 * 用户看到的就是每页页眉多一个空方块，而不是「品牌没了」。实测过两种取值的行为：
 *
 * - `brand: undefined`            → 槽位属性与元素原样留着
 * - `brand: { name:'', tagline:'' }` → 槽位被整个移除（`slotValue` 全返回 `null`）
 *
 * 而「从没配过品牌」的项目**行为不变**：那些页面的片段里本来就没有槽位属性，
 * `fillBrandSlots` 对不含槽位的片段是逐字节原样返回。
 */
export function brandOf(project: BrandFields): BrandSlot {
  const logo =
    project.brandLogoMode === 'redraw' && project.brandLogoSvg
      ? { svg: project.brandLogoSvg }
      : project.brandLogoMode === 'original' && project.brandLogoImage
        ? { imageSrc: `/files/${project.brandLogoImage}` }
        : {};

  return { ...logo, name: project.brandName.trim(), tagline: project.brandTagline.trim() };
}

/**
 * 这个项目**到底有没有**品牌？
 *
 * 生成提示词靠它决定提不提槽位，而这件事**不能**用 `brandOf(...) !== undefined` 来判断——
 * 上面那个函数永远返回真值。也不能只看 `brandLogoMode`：只有品牌名、没有 logo 的项目
 * 同样该在页眉留出名字。
 *
 * 判据与渲染侧同一处：渲染侧要「永远拿到一个 `BrandSlot`」（这样清空品牌时能把空壳槽位
 * 整条删掉），生成侧要「有没有」这个布尔。两个问题，同一个来源。
 */
export function hasBrand(project: BrandFields): boolean {
  const b = brandOf(project);
  return Boolean(b.svg || b.imageSrc || b.name || b.tagline);
}
```

在 `packages/ir-schema/src/index.ts` 里按现有顺序加一行：

```ts
export * from './brand.js';
```

- [ ] **Step 4: 在 `html-doc.ts` 里实现 `fillBrandSlots`**

在 `fillImageSlots` 之后加：

```ts
/**
 * 填品牌槽位：`data-lumen-brand="logo|name|tagline"`。
 *
 * 与图位（`fillImageSlots`）同一套做法，但**只换元素内容、不换标签**——模型写的标签名、
 * class 与内联样式都留着，于是尺寸、颜色、字距跟着这套风格的规范走，不用我们另写一套。
 *
 * 模型的 HTML 是**不可信输入**，四条自保的规矩（都是实测踩出来的）：
 *
 * 1. **只认属性名，不认字符串。** 属性段按属性语法拆，`title="用 data-lumen-brand=logo 标记"`
 *    里的那一段不算命中——否则一个无关的 div 会被整块换成 logo。
 * 2. **取值只认三种。** 不是 logo / name / tagline 就原样不动，绝不删元素：模型把标记挂错
 *    容器、或随手写个 `"header"` 这种描述性取值，都很常见。
 * 3. **找不到配对闭合标签就跳过这个槽位。** 模型漏写 `</span>` 时，若默认「吃到片段末尾」，
 *    那之后的正文会被整页吞掉。宁可少填一个槽位，也不能吃掉正文——`markStaggerItems`
 *    里的同类取舍也是这条（「宁可少标，也不能让栈错位」）。
 * 4. **logo 槽填的是 `<img>`，稿本身绝不内联。** 单色稿的颜色在**这里**烘进去
 *    （`colorizeSvg` 把 `currentColor` 换成品牌色），不靠 CSS 继承——理由见 `colorizeSvg`。
 *    品牌名与标语仍然是纯文本，且**不带任何内联颜色**：它们的配色归这套风格的规范管
 *    （「深蓝渐变商务风」的品牌名规范色是 muted 而不是 brand），一条内联样式就会把它盖掉。
 */
export function fillBrandSlots(fragment: string, brand: BrandSlot, brandColor: string): string {
  const tagRe = /<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

  interface Hit {
    kind: BrandSlotKind;
    start: number;
    openEnd: number;
    /** 闭合标签的起点。空元素时等于 openEnd */
    closeStart: number;
    end: number;
    voidTag: boolean;
  }
  const hits: Hit[] = [];

  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(fragment)) !== null) {
    const tag = (m[1] ?? '').toLowerCase();
    const attrs = m[2] ?? '';
    const kind = attrValue(attrs, BRAND_SLOT_ATTR);
    if (kind === null || !isSlotKind(kind)) continue;

    const start = m.index;
    const openEnd = m.index + m[0].length;
    const voidTag = attrs.trimEnd().endsWith('/') || VOID_TAGS.has(tag);

    if (voidTag) {
      hits.push({ kind, start, openEnd, closeStart: openEnd, end: openEnd, voidTag });
      continue;
    }

    const close = findClose(fragment, tag, openEnd);
    // 漏写闭合标签：这个槽位一个字都不动，后面的内容也就不会被吞掉
    if (close === null) continue;

    hits.push({ kind, start, openEnd, closeStart: close.start, end: close.end, voidTag });
    tagRe.lastIndex = close.end;
  }

  // 从后往前改，前面的下标才不会被位移带偏
  let out = fragment;
  for (const hit of hits.reverse()) {
    const value = slotValue(hit.kind, brand, brandColor);
    const open = out.slice(hit.start, hit.openEnd);

    if (value === null) {
      out = out.slice(0, hit.start) + out.slice(hit.end);
      continue;
    }
    if (hit.voidTag) {
      // 空元素装不下内容，整条换成 span；标签名丢了，但 class 与 style 带过去
      out = out.slice(0, hit.start) + spanFrom(open) + value + '</span>' + out.slice(hit.end);
      continue;
    }
    // 只换内容：开标签与闭合标签原样留着
    out = out.slice(0, hit.start) + rebuildOpen(open) + value + out.slice(hit.closeStart);
  }
  return out;
}

const isSlotKind = (v: string): v is BrandSlotKind =>
  (BRAND_SLOT_KINDS as readonly string[]).includes(v);

/**
 * 按属性语法拆开标签的属性段，取出名为 `name` 的属性的值。
 *
 * **必须这样拆**，不能用「在属性段里搜 `data-lumen-brand=` 这个子串」——那样
 * `title="用 data-lumen-brand=logo 标记"` 里的那一段也会命中，
 * 于是一个无关的 div 会被整块换成 logo（实测踩过）。
 */
function attrValue(attrs: string, name: string): string | null {
  const re = /([a-zA-Z_:][\w:.-]*)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(attrs)) !== null) {
    if ((m[1] ?? '').toLowerCase() !== name) continue;
    const raw = m[2];
    if (raw === undefined) return '';
    return raw[0] === '"' || raw[0] === "'" ? raw.slice(1, -1) : raw;
  }
  return null;
}

/**
 * 从 `from` 起找 `<tag>` 的配对闭合标签。**找不到就返回 `null`**——
 * 调用方据此跳过，而不是假设它一直延伸到片段末尾。
 */
function findClose(fragment: string, tag: string, from: number): { start: number; end: number } | null {
  const re = new RegExp(`<(/?)${tag}\\b((?:"[^"]*"|'[^']*'|[^>"'])*)>`, 'gi');
  re.lastIndex = from;
  let depth = 1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment)) !== null) {
    if ((m[2] ?? '').trimEnd().endsWith('/')) continue; // 自闭合的不算一层
    depth += m[1] === '/' ? -1 : 1;
    if (depth === 0) return { start: m.index, end: m.index + m[0].length };
  }
  return null;
}

/**
 * 摘掉槽位属性本身——它是脚手架，不该出现在成品里。
 *
 * 前置允许是空白、引号或串首：模型漏写空格时（`class="b"data-lumen-brand="logo"`）也要摘掉。
 * 带 `g` 是为了重复属性（模型偶尔把同一个属性写两遍，只摘第一处会漏一个进成品）。
 *
 * **收尾要按边界分情况**，不能一律 `'$1'`：边界是引号时必须放回，否则会把上一个属性
 * 的收尾引号一起吃掉（`class="b` 变成没闭合）；边界是空白时**不能**放回，
 * 否则 `>` 前会留一个杂散空格，`<div class="a" >` 与 `<div class="a">` 就不再是同一个字符串。
 */
function withoutSlotAttr(attrs: string): string {
  return attrs.replace(
    /(^|[\s"'])data-lumen-brand\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/gi,
    (_all, boundary: string) => (boundary === '"' || boundary === "'" ? boundary : ''),
  );
}

/**
 * 供空元素换成 span 时用。
 *
 * `class` 与 `style` 直接搬；**`width` / `height` 这两个 HTML 属性要转成内联尺寸**——
 * 它们在 `<img>` 上是有效的尺寸声明，换到 `<span>` 上就不再有效。不转的话，
 * 模型写的 `<img width="34" height="34">` 尺寸会整个丢掉，SVG 退回自身默认大小。
 */
function spanFrom(open: string): string {
  const attrs = withoutSlotAttr(openAttrs(open));
  const id = attrValue(attrs, 'id');
  const cls = attrValue(attrs, 'class');
  // HTML 的 width/height 属性既可以是数字（`34` → `34px`），也可以是百分比（`50%` → `50%`）
  const dim = (v: string | null) => {
    const t = v?.trim() ?? '';
    if (/^\d+$/.test(t)) return `${t}px`;
    return /^\d+(\.\d+)?%$/.test(t) ? t : '';
  };
  const w = dim(attrValue(attrs, 'width'));
  const h = dim(attrValue(attrs, 'height'));
  const size = [w && `width:${w}`, h && `height:${h}`].filter(Boolean).join('; ');
  const style = mergeStyle(attrValue(attrs, 'style'), size);
  // id 也要带过去：模型的 CSS 可能按 `#id` 定位，丢了它版式会塌
  return `<span${id === null ? '' : ` id="${escapeHtml(id)}"`}${cls === null ? '' : ` class="${escapeHtml(cls)}"`}${style ? ` style="${style}"` : ''}>`;
}

/** 重建开标签：摘掉槽位属性，其余属性一个字不动 */
function rebuildOpen(open: string): string {
  const m = /^<([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>$/.exec(open);
  if (!m) return open;
  const attrs = withoutSlotAttr(m[2] ?? '');
  const rest = attrs.replace(/(^|\s)style\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+)/i, '');
  const style = mergeStyle(attrValue(attrs, 'style'), '');
  return `<${m[1]}${rest}${style ? ` style="${style}"` : ''}>`;
}

/** 取一个开标签的属性段。取不到就返回空串 */
function openAttrs(open: string): string {
  return /^<[a-zA-Z][\w-]*((?:"[^"]*"|'[^']*'|[^>"'])*)>$/.exec(open)?.[1] ?? '';
}

/** 把一段声明并到已有的内联样式后面。已有值里的双引号要转义，否则会拼出非法属性 */
function mergeStyle(current: string | null, add: string): string {
  const parts = [current?.trim().replace(/;?$/, '') ?? '', add].filter((s) => s !== '');
  return parts.join('; ').replace(/"/g, '&quot;');
}

/**
 * 把单色稿里的 `currentColor` 烘成品牌色。
 *
 * **为什么不继续用 `color: var(--brand)` + `currentColor` 继承。**
 * 那条路要求稿是**内联**进 HTML 文档的，而内联意味着它过的是 **HTML 解析器**，不是 XML 解析器。
 * HTML 的 foreign content 规则里，`<desc>` / `<title>` 是**集成点**（子标记按 HTML 解析），
 * `<img>` / `<div>` / `<meta>` 这些 start tag 会**把解析器从 SVG 里弹出来**，变成页面上真正的
 * HTML 元素。于是这些 payload 都能通过任何「拒绝清单」式的校验、逐字节落进库：
 *
 * - `<desc><iframe src="javascript:parent.__pwned=1"></iframe></desc>` —— 导出时**无交互执行 JS**；
 * - `<img src="http&#58;//169.254.169.254/latest/meta-data/">` —— 从**服务器**发起对外请求
 *   （数值字符引用让原文里根本不出现 `http://`，正则看不见，浏览器看得见）；
 * - `<meta http-equiv="refresh" content="0;url=http&#58;//attacker.example/">` —— 整页被导航走，
 *   导出出来的 PDF/PPTX 拍的是攻击者的页面。
 *
 * 这不是「再补几条规则」能修的：正则看的是原文，浏览器看的是**重新解析后**的结果，
 * 中间隔着实体解码、空白规范化、CSS 转义一整个规范化层。
 *
 * 改成 `<img src="data:image/svg+xml,…">` 之后，浏览器把这份稿当**静态图片**加载：
 * 脚本不执行、外部子资源一律不加载、也跳不出成 HTML 标记。上面三类 payload 全部失效
 * （实测 22 条 payload 在这个形态下零执行、零请求）。代价就是图片里的 SVG 拿不到外面的 CSS，
 * 所以颜色必须在这里烘进去。
 *
 * 顺带一个好处：「用原图」那条路本来就已经是 `<img>` 了，两个分支现在同一个形状。
 */
function colorizeSvg(svg: string, brandColor: string): string {
  return svg.replace(/currentColor/gi, brandColor);
}

/**
 * 品牌色的兜底：认不出是颜色就退回黑色。
 *
 * `StylePalette.brand` 是裸 `z.string()`（`packages/ir-schema/src/style-doc.ts:124-142`），
 * **没有任何颜色格式校验**，而这个值是要被**替换进 SVG 源码**的。实测两种坏结果，都不报错：
 *
 * - `var(--brand)` / `currentColor` → 图片能加载，但颜色是**黑色**（图片文档里没有自定义属性
 *   可继承，「logo 跟着品牌色走」直接失效）；
 * - `#06c<b` → SVG 变成非法 XML → **整张图加载失败**（`onerror`、`naturalWidth === 0`），
 *   页眉上什么都没有。
 *
 * 所以认得出才用。只认 `#hex` 与 `rgb()/hsl()` 这一类：**命名色一律不收**——
 * `none` 之类的值会让 logo 静默变成不可见，而本仓的风格配色本来就是十六进制。
 */
function safeColor(value: string): string {
  const v = value.trim();
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) return v;
  if (/^(?:rgb|rgba|hsl|hsla)\(\s*[0-9.,%\s/deg]+\)$/i.test(v)) return v;
  return '#000';
}

/** SVG 的命名空间。稿要当图片加载就必须带它，见 `ensureXmlns` */
const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * 保证**根标签**带**正确的** `xmlns`。
 *
 * **这不是可选项，是硬依赖。** 稿是以 `<img src="data:image/svg+xml,…">` 加载的，而这条路上
 * 浏览器按 **XML** 解析它：根元素不在 SVG 命名空间里就不是 SVG，**整张图加载失败**。
 * 实测（真 Chromium）：不带 xmlns → `onerror`、`naturalWidth === 0`；补上 → 150×150 正常画出来。
 * 而失败时接口不报错、日志没有异常，用户只看到「重绘成功」加一个空页眉。
 *
 * **在代码里补，不让模型写。** 与图位那条「不让模型写 src」同一个道理——模型漏一次就静默坏一页，
 * 而这件事几行代码就能保证。历史稿（提示词还写着「不要写 xmlns」那段时间落库的）也一并兜住。
 *
 * **判据必须限定在根标签上、并且看值**，不能只问「整篇里出现过 `xmlns=`」——
 * 那样下面三种稿会被跳过、产出画不出来的图片（实测都是 `naturalWidth === 0`）：
 * 注释或文本里含 `xmlns=`、`xmlns=""`（空命名空间）、`xmlns` 指向别的命名空间。
 *
 * 而且**根标签要按「第一个元素」去找**，不能取全文第一个 `<svg`：注释里完全可以先出现一个
 * 完整的假开标签（`<!-- <svg viewBox="0 0 1 1"> -->`），那样 xmlns 会被补进注释、真根标签
 * 仍然是空的，图片照样加载不出来。所以先跳过根标签前面允许出现的东西（空白、注释、XML 声明、
 * DOCTYPE），再从那里找 `<svg`。
 */
const BEFORE_ROOT = /^(?:\s|<!--[\s\S]*?-->|<\?xml[^>]*\?>|<!DOCTYPE[^>]*>)*/i;

function ensureXmlns(svg: string): string {
  const head = BEFORE_ROOT.exec(svg)![0];
  const m = /<svg\b[^>]*>/i.exec(svg.slice(head.length));
  // 连根标签都找不到就不动它——这种稿 `validateLogoSvg` 已经拦掉了
  if (!m) return svg;

  const at = head.length + m.index;
  const tag = m[0];
  const found = /\sxmlns\s*=\s*("[^"]*"|'[^']*')/i.exec(tag);
  // 已经是对的：不改写、也不补第二遍（重复的 xmlns 会让 XML 非法，同样加载失败）
  if (found && found[1]!.slice(1, -1) === SVG_NS) return svg;

  // 有但是错的就改写它，没有才插。`xmlns:xlink=` 不会命中这个正则，那不算默认命名空间
  const fixed = found
    ? tag.replace(found[0], ` xmlns="${SVG_NS}"`)
    : tag.replace(/<svg\b/i, `<svg xmlns="${SVG_NS}"`);
  return svg.slice(0, at) + fixed + svg.slice(at + tag.length);
}

/**
 * 把落库的重绘稿变成一个能直接塞进 `src` 的 data URL。
 *
 * **整个仓库只允许这一处构造它。** 页面渲染、导出、面板预览都调这个函数——手搓第二份
 * 一定会漏掉这里的某一步（补 xmlns、烘品牌色、色值兜底），而漏掉任何一步都是静默失效：
 * 图片加载不出来、或者颜色不对，接口与日志都不说话。
 *
 * `brandColor` 传当前风格包的 `palette.brand`。
 */
export function brandLogoDataUrl(svg: string, brandColor: string): string {
  const colored = colorizeSvg(svg, safeColor(brandColor));
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(ensureXmlns(colored))}`;
}

/** 槽位该填什么。返回 `null` 表示这个槽位没有值、整个元素删掉 */
function slotValue(kind: BrandSlotKind, brand: BrandSlot, brandColor: string): string | null {
  if (kind === 'logo') {
    if (brand.svg) {
      return `<img src="${brandLogoDataUrl(brand.svg, brandColor)}" alt="" style="display:block;width:100%;height:100%;object-fit:contain">`;
    }
    if (brand.imageSrc) return `<img src="${escapeHtml(brand.imageSrc)}" alt="" style="display:block;width:100%;height:100%;object-fit:contain">`;
    return null;
  }
  if (kind === 'name') return brand.name ? escapeHtml(brand.name) : null;
  if (kind === 'tagline') return brand.tagline ? escapeHtml(brand.tagline) : null;
  return null;
}
```

在 `html-doc.ts` 顶部的 import 里加上：

```ts
import { BRAND_SLOT_ATTR, BRAND_SLOT_KINDS, type BrandSlot, type BrandSlotKind } from './brand.js';
```

`PageDocumentOptions`（:403-419）在 `staggerSeed` 后加：

```ts
  /**
   * 项目品牌。不传就是「没有品牌」，槽位原样不动——行为与改动前完全一致。
   * 由 `brandOf(project)` 从项目行翻出来。
   */
  brand?: BrandSlot;
```

`buildPageDocument`（:427）在 `fillImageSlots` 之后、`markStaggerItems` **之前**接上：

```ts
  let body = opts.images && opts.images.length > 0 ? fillImageSlots(fragment, opts.images) : fragment;
  // 品牌槽位在逐块进场之前填：填完才谈得上「哪些元素要进场」，
  // 否则 logo 会被当成一个新元素漏掉，进场顺序里没有它
  if (opts.brand) body = fillBrandSlots(body, opts.brand, opts.palette.brand);
  if (stagger) body = markStaggerItems(body, staggerDirectionFor(opts.staggerSeed!));
```

- [ ] **Step 5: 跑测试，确认通过**

Run: `cd packages/ir-schema && node --import tsx --test src/html-doc.test.ts`

Expected: PASS —— 原有用例 + Step 1 里新增的那一批（happy path、转义、以及六条畸形输入的回归）全过，
`fail 0`。**不要按「新增几个」这种数字对账**，测试件数会随审查意见增减，看 `fail 0` 就够了。

- [ ] **Step 6: 提交**

```bash
git add packages/ir-schema/src/brand.ts packages/ir-schema/src/index.ts \
        packages/ir-schema/src/html-doc.ts packages/ir-schema/src/html-doc.test.ts
git commit -m "feat(brand): 品牌槽位与渲染时注入"
```

---

## Task 3: `logo_redraw` 任务类型

**Files:**
- Modify: `packages/ir-schema/src/provider.ts:138-158`
- Modify: `packages/server-core/src/services/seed.service.ts:19-27`
- Test: `packages/server-core/src/services/brand-logo.test.ts`（追加）

- [ ] **Step 1: 写失败的测试**

在 `packages/server-core/src/services/brand-logo.test.ts` 末尾追加：

```ts
/* ---------------- 任务类型 ---------------- */

test('logo_redraw 是合法任务类型，有中文名，且默认不锁路由', async () => {
  const { TaskType, TASK_TYPE_LABEL, DEFAULT_LOCKED_ROUTES } = await import('@lumen/ir-schema');
  assert.ok(TaskType.options.includes('logo_redraw'), '枚举里要有 logo_redraw');
  assert.equal(TASK_TYPE_LABEL.logo_redraw, '品牌重绘');
  assert.equal(DEFAULT_LOCKED_ROUTES.includes('logo_redraw'), false, '重绘不该默认锁路由');
});

test('种子给 logo_redraw 建了路由，指向默认文本模型', async () => {
  const { get } = await import('../db/client.js');
  const row = get<{ taskType: string; primaryRef: string }>(
    'SELECT taskType, primaryRef FROM task_routes WHERE taskType = ?', 'logo_redraw',
  );
  assert.ok(row, 'ensureSeed 要建这条路由，否则重绘会报「没有路由」');
  assert.ok(row!.primaryRef.length > 0);
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd packages/server-core && node --import tsx --test src/services/brand-logo.test.ts`

Expected: FAIL —— `TaskType.options` 里没有 `logo_redraw`，`TASK_TYPE_LABEL.logo_redraw` 是 `undefined`。

- [ ] **Step 3: 加任务类型**

`packages/ir-schema/src/provider.ts:138-146` 的枚举里加一行：

```ts
  'style_recognize', // 风格识别：把文字描述映射到风格族与人群
  'logo_redraw',     // 品牌 logo 重绘：看图 → 写 SVG
```

`:150-158` 的 `TASK_TYPE_LABEL` 加一行：

```ts
  style_recognize: '风格识别',
  logo_redraw: '品牌重绘',
```

**不要**动 `DEFAULT_LOCKED_ROUTES`（:183）。

- [ ] **Step 4: 加种子路由**

`packages/server-core/src/services/seed.service.ts:19-27` 的 `ROUTE_DEFAULTS` 加一行：

```ts
  { taskType: 'style_recognize', model: DEFAULT_TEXT_MODEL },
  { taskType: 'logo_redraw', model: DEFAULT_TEXT_MODEL },
```

同文件 :33 的注释「六个任务类型路由」改成「七个任务类型路由」。

- [ ] **Step 5: 跑测试，确认通过**

Run: `cd packages/server-core && node --import tsx --test src/services/brand-logo.test.ts`

Expected: PASS，`fail 0`。（**别按用例个数对账**——这个文件后面几个任务还会往里加，看 `fail 0` 就行。）

- [ ] **Step 6: 提交**

```bash
git add packages/ir-schema/src/provider.ts packages/server-core/src/services/seed.service.ts \
        packages/server-core/src/services/brand-logo.test.ts
git commit -m "feat(brand): 加 logo_redraw 任务类型与默认路由"
```

---

## Task 4: 重绘服务

**Files:**
- Create: `packages/server-core/src/services/brand-logo.service.ts`
- Modify: `packages/server-core/src/index.ts`（`export * from './services/brand-logo.service.js';`）
- Test: `packages/server-core/src/services/brand-logo.test.ts`（追加）

- [ ] **Step 1: 写失败的测试**

在 `packages/server-core/src/services/brand-logo.test.ts` 末尾追加：

```ts
/* ---------------- 重绘 ---------------- */

const { redrawLogo, validateLogoSvg } = await import('./brand-logo.service.js');
const { MOCK_PLACEHOLDER_MARKER } = await import('@lumen/provider-gateway');

/** 假网关：记下每次请求，按次序吐预设回复 */
function fakeGateway(replies: (string | Error)[]) {
  const seen: {
    messages: { content: string; images?: string[] }[];
    taskType?: string;
    /** 指令写在这里，不在那一轮的用户消息里 */
    system?: string;
  }[] = [];
  let i = 0;
  return {
    seen,
    gateway: {
      async text(req: { messages: { content: string; images?: string[] }[]; taskType?: string; system?: string }) {
        seen.push(req);
        const r = replies[Math.min(i, replies.length - 1)];
        i += 1;
        if (r instanceof Error) throw r;
        return {
          text: r ?? '', providerId: 'fake', model: 'fake',
          usage: { inputTokens: 1, outputTokens: 1 },
          degraded: false, degradeReason: '', latencyMs: 1,
        };
      },
      async image() { throw new Error('本用例不生成图片'); },
    },
  };
}

const GOOD_SVG = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="currentColor"/></svg>';

/** 一个假的对象读取函数，固定返回一张 1x1 PNG */
const onePng = async () => Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('重绘成功：落库 svg 与原图 key，模式是 redraw', async () => {
  const project = makeProject();
  const { gateway, seen } = fakeGateway([JSON.stringify({ svg: GOOD_SVG })]);

  const out = await redrawLogo({
    projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
    imageKey: 'tn_x/proj/uploads/1-logo.png',
    gateway: gateway as never, readObject: onePng,
  });

  assert.equal(out.svg, GOOD_SVG);
  const saved = requireProject(project.projectId, project.tenantId);
  assert.equal(saved.brandLogoSvg, GOOD_SVG, '要落库');
  assert.equal(saved.brandLogoImage, 'tn_x/proj/uploads/1-logo.png', '原图 key 也要留，供「就用原图」');
  assert.equal(saved.brandLogoMode, 'redraw');

  // 原图要以 data URL 发给模型，模型才看得到
  assert.ok(seen[0]!.messages[0]!.images?.[0]?.startsWith('data:image/png;base64,'), '原图要发给模型');
  assert.equal(seen[0]!.taskType, 'logo_redraw', '要走 logo_redraw 路由');
  assert.match(
    seen[0]!.system ?? '', /不要画背景/,
    '提示词要明说去掉白底。**约束在 `system` 里**——仓库惯例是指令进 system，那一轮的用户消息只放任务本身',
  );
});

test('校验：恶意 SVG 一律拒收', () => {
  // **每条用例只命中 FORBIDDEN 里的一条规则**，这样删掉任意一条规则都必有用例转红。
  // 若一条用例同时命中两条（例如 `<image href>` 会同时撞上 `<image` 与 `href`），
  // 删掉其中一条另一条仍会兜住，那条规则就等于一次都没被验到。
  //
  // **尤其注意最后那条 http 规则**：任何 `https://…` 外链都会连带上它。所以想隔离
  // `<image` / `href=` / `url(` 这三条时，URL 必须写成**协议相对写法** `//…`
  // （`//host` 本身也是真实的攻击形态）。写成 `https://` 的话，这三条用例会同时命中
  // http 规则，删掉 `<image` / `href=` / `url(` 任一条测试都不转红——这三条规则等于白写。
  const bad = [
    // `<script`
    '<svg viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10"/></svg>',
    // `<image` —— 用 src 而非 href（写成 href 会先被 href 规则拦下），且 URL 用协议相对写法
    '<svg viewBox="0 0 10 10"><image src="//evil.example/x.png"/><rect width="1" height="1"/></svg>',
    // `<foreignObject`
    '<svg viewBox="0 0 10 10"><foreignObject><div>x</div></foreignObject><rect width="1" height="1"/></svg>',
    // `href=` —— 用 `<a href>`：`<use href>` / xlink:href 都会连带到别的规则；URL 同样用 `//…`
    '<svg viewBox="0 0 10 10"><a href="//evil.example/x">x</a><rect width="1" height="1"/></svg>',
    // `xlink:` —— 不带 href=，否则被 href 规则遮住
    '<svg viewBox="0 0 10 10"><rect width="1" height="1" xlink:type="simple"/></svg>',
    // `url(` —— URL 同样用 `//…`
    '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="url(//evil.example/x)"/></svg>',
    // `<style` —— 不带 @import，否则被那条遮住
    '<svg viewBox="0 0 10 10"><style>rect{fill:red}</style><rect width="1" height="1"/></svg>',
    // `@import` —— 反向：**不带 `<style`**，否则被 `<style` 先拦下，这条规则就一次都没被验到。
    // 现实里的绕过形态是 `<style>@import "https://…"`（引号写法，`url(` 那条挡不住），
    // 能不能拦住全看这一条，所以它必须有一条自己的用例
    '<svg viewBox="0 0 10 10"><rect width="1" height="1" fill="@import"/></svg>',
    // `image-set(` —— 同样不带 `<style`
    '<svg viewBox="0 0 10 10"><rect width="1" height="1" style="fill:image-set(a 1x)"/></svg>',
    // `on*=` —— 内联事件处理器，导出用 Chromium **没关 JS**，这里放行就等于放行任意代码
    '<svg viewBox="0 0 10 10" onload="alert(1)"><rect width="1" height="1"/></svg>',
    // 非 w3.org 的 http(s) 地址
    '<svg viewBox="0 0 10 10"><rect width="1" height="1" fill="https://evil.example/x"/></svg>',
    // `<use` —— 不带 href，否则被 href 规则遮住
    '<svg viewBox="0 0 10 10"><use/><rect width="1" height="1"/></svg>',
    // 结构性错误：根本不是 SVG
    'not an svg at all',
    // 缺 viewBox
    '<svg><rect width="10" height="10"/></svg>',
    // 没有任何图形（这条故意不带 rect，验证图形检查本身）
    '<svg viewBox="0 0 10 10"><text>只有文字，没有图形</text></svg>',
  ];
  for (const svg of bad) {
    // 断言消息前缀而不是 `/.*/`：后者连 TypeError 也算通过，等于没验
    assert.throws(() => validateLogoSvg(svg), /重绘结果/, `这条本该被拒：${svg.slice(0, 60)}`);
  }
});

test('校验：合格的 SVG 放行', () => {
  assert.doesNotThrow(() => validateLogoSvg(GOOD_SVG));
  assert.doesNotThrow(() => validateLogoSvg(
    '<svg viewBox="0 0 10 10"><path d="M0 0 L10 10"/><rect width="2" height="2"/></svg>',
  ));
});

/**
 * 报错必须抛 `AppError`，否则那些中文报错根本到不了用户手上。
 *
 * `packages/server-core/src/middleware/error.ts` 只把 **`AppError`** 的报文透给客户端，
 * 其余一律压成 500「服务器内部错误」。所以这一整轮「把裸 `Error` 换成 `invalid(...)`」的
 * 改动，**全靠 `err instanceof AppError`** 才成立。
 *
 * 而原来没有任何断言在看这件事：把 `invalid(` 全换回 `new Error(`，别的用例只匹配
 * 消息前缀（`/重绘结果/`），**一条都不会转红**，用户却会看到「重绘失败：服务器内部错误」。
 * 这条就是补那个洞的——它不看消息，只看类型与 code。
 */
test('校验与网关失败抛的是 AppError，报文才透得到用户手上', async () => {
  const { AppError } = await import('../lib/errors.js');

  // **`huge` 这条不能漏。** `validateLogoSvg` 有 5 个拒绝分支，前四条分别命中
  // 「非 SVG / 缺 viewBox / 无图形 / FORBIDDEN」；体积那条如果不在这个列表里，
  // 把 `invalid(\`重绘结果超过…\`)` 换成裸 `Error` 就**一条测试都不会转红**
  // （旁边那条 40KB 用例只匹配消息前缀，不看类型）——用户看到的就是 500「服务器内部错误」，
  // 正是这条用例要堵的失败形态，只是漏了最后一个分支。实测确认过这个盲区。
  const huge = `<svg viewBox="0 0 10 10"><path d="M0 0 ${'L1 1 '.repeat(11000)}"/></svg>`;
  for (const svg of [
    huge,
    // **这条不能用 `'not an svg at all'`。** 那个字符串连 viewBox 也没有，于是下一条规则
    // 也会拒它——删掉「不是 SVG」这个分支，`assert.throws` 照样通过，那条分支一次都没被验到
    // （实测：变异成删除该分支，`fail=0`）。要的就是「有 viewBox、有图形、就是没有 `<svg>`」。
    '<div viewBox="0 0 1 1"><rect width="1" height="1"/></div>',
    '<svg><rect width="10" height="10"/></svg>',
    '<svg viewBox="0 0 10 10"><text>只有文字</text></svg>',
    '<svg viewBox="0 0 10 10"><script>x</script><rect width="1" height="1"/></svg>',
  ]) {
    assert.throws(
      () => validateLogoSvg(svg),
      (e: unknown) => e instanceof AppError && e.code === 'VALIDATION' && /重绘结果/.test(e.message),
      `本该是 VALIDATION 的 AppError：${svg.slice(0, 40)}`,
    );
  }

  const project = makeProject();
  const opts = { projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId };

  // 路由指向内置 Mock：要让用户知道是「没配模型」，不是「服务器坏了」
  const mock = fakeGateway([`${MOCK_PLACEHOLDER_MARKER}，这是一段说明文字。`]);
  await assert.rejects(
    redrawLogo({ ...opts, imageKey: 'tn_x/proj/uploads/5-logo.png', gateway: mock.gateway as never, readObject: onePng }),
    (e: unknown) => e instanceof AppError && e.code === 'NOT_CONFIGURED',
  );

  // 模型回的不是合契约的 JSON
  const garbage = fakeGateway(['这不是 JSON']);
  await assert.rejects(
    redrawLogo({ ...opts, imageKey: 'tn_x/proj/uploads/6-logo.png', gateway: garbage.gateway as never, readObject: onePng }),
    (e: unknown) => e instanceof AppError && e.code === 'PROVIDER_ERROR',
  );

  /**
   * 网关**自己**抛的那条裸 `Error` 也要翻。
   *
   * `router.ts:11` 明写「未配置路由时 message 含 `ROUTE_NOT_CONFIGURED`」，还有测试守着，
   * 所以这不是猜字符串。而「logo_redraw 没配模型」是自建部署最容易撞上的一种失败——
   * 不翻的话用户在面板上只看到「服务器内部错误」，连要去管理后台配路由都想不到。
   */
  const noRoute = {
    async text() { throw new Error('ROUTE_NOT_CONFIGURED：任务类型 logo_redraw 未配置路由，请先在管理后台补上主模型与降级链'); },
    async image() { throw new Error('本用例不生成图片'); },
  };
  await assert.rejects(
    redrawLogo({ ...opts, imageKey: 'tn_x/proj/uploads/7-logo.png', gateway: noRoute as never, readObject: onePng }),
    (e: unknown) => e instanceof AppError && e.code === 'NOT_CONFIGURED',
    '路由没配时不能让用户看到「服务器内部错误」',
  );
});

test('模型给的不是合法 SVG 时明确报错，且不落库、但保留原图 key', async () => {
  const project = makeProject();
  const { gateway } = fakeGateway([JSON.stringify({ svg: '<svg viewBox="0 0 1 1"><script>x</script></svg>', })]);

  await assert.rejects(
    redrawLogo({
      projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
      imageKey: 'tn_x/proj/uploads/2-logo.png',
      gateway: gateway as never, readObject: onePng,
    }),
    /重绘结果/,
  );

  const saved = requireProject(project.projectId, project.tenantId);
  assert.equal(saved.brandLogoSvg, '', '校验没过就不该落库');
  assert.equal(saved.brandLogoImage, 'tn_x/proj/uploads/2-logo.png', '原图 key 要留着，「就用原图」还得用');
  assert.equal(saved.brandLogoMode, 'original', '重绘没成，自动退回原图模式，用户不至于看到空白页眉');
});

/**
 * 读不出原图时必须**整个不动库**。
 *
 * 这一条钉的是「先读图再动库」那个顺序。顺序反过来（先写原图 key 再读）会留下
 * `{image: 一个不存在的 key, svg: '', mode: 'original'}`：上一份能用的稿被清掉了，
 * 新的原图又是破图。触发面不小——对象过期被清、或者计划 Task 5 的 `/brand/redraw`
 * 收到一个乱传的 key，都会走到这里。
 */
test('读不出原图时一个字都不写，旧原图与旧稿都留着', async () => {
  const project = makeProject();
  const opts = { projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId };

  // 前置条件：先有一份好好的状态
  const first = fakeGateway([JSON.stringify({ svg: GOOD_SVG })]);
  await redrawLogo({ ...opts, imageKey: 'tn_x/proj/uploads/old.png', gateway: first.gateway as never, readObject: onePng });
  assert.equal(requireProject(project.projectId, project.tenantId).brandLogoSvg, GOOD_SVG, '前置条件');
  assert.equal(requireProject(project.projectId, project.tenantId).brandLogoMode, 'redraw', '前置条件');

  const { gateway } = fakeGateway([JSON.stringify({ svg: GOOD_SVG })]);
  await assert.rejects(
    redrawLogo({
      ...opts, imageKey: 'tn_x/proj/uploads/missing.png',
      gateway: gateway as never, readObject: async () => { throw new Error('对象不存在'); },
    }),
    // **`/取不到/` 而不是 `/对象不存在/`**：`redrawLogo` 把读失败翻成了
    // `invalid('这张原图取不到，可能已经过期或被清理…')`（见 Step 3），原始消息**透不出来
    // 正是要的行为**——裸 `Error` 会被中间件压成 500「服务器内部错误」，用户看不到任何原因。
    // 这条用例的本职是「读失败时一个字都不写库」，前后置断言照旧。
    /取不到/,
  );

  const saved = requireProject(project.projectId, project.tenantId);
  assert.equal(saved.brandLogoImage, 'tn_x/proj/uploads/old.png', '旧原图不能被换成一个读不出来的 key');
  assert.equal(saved.brandLogoSvg, GOOD_SVG, '旧稿不能被清掉——它本来还能用');
  assert.equal(saved.brandLogoMode, 'redraw', '模式也不能被退成 original');
});

test('超过 40KB 的稿拒收，模型多半是把整张图描成了逐像素路径', () => {
  const huge = `<svg viewBox="0 0 10 10"><path d="M0 0 ${'L1 1 '.repeat(11000)}"/></svg>`;
  assert.ok(Buffer.byteLength(huge, 'utf8') > 40 * 1024, '前置条件：这段确实超了 40KB');
  // 它不含任何被拒绝的内容，所以拦下它的只可能是体积那条
  assert.throws(() => validateLogoSvg(huge), /超过 40KB/);
  // 边界：刚好不超的要放行，否则这个上限会变成「稍微复杂一点就不给过」
  const justUnder = `<svg viewBox="0 0 10 10"><path d="M0 0 ${'L1 1 '.repeat(Math.floor((40 * 1024 - 70) / 5))}"/></svg>`;
  assert.ok(Buffer.byteLength(justUnder, 'utf8') <= 40 * 1024, '前置条件：这段没超');
  assert.doesNotThrow(() => validateLogoSvg(justUnder));
});

test('换一张图但重绘失败时，不留着上一张的重绘稿', async () => {
  const project = makeProject();
  const opts = { projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId };

  // 前置条件：第一张已经重绘好了、且已经落库
  const first = fakeGateway([JSON.stringify({ svg: GOOD_SVG })]);
  await redrawLogo({ ...opts, imageKey: 'tn_x/proj/uploads/old-logo.png', gateway: first.gateway as never, readObject: onePng });
  assert.equal(requireProject(project.projectId, project.tenantId).brandLogoSvg, GOOD_SVG, '前置条件');

  // 用户换了一张，这一轮模型给的东西校验不过
  const second = fakeGateway([JSON.stringify({ svg: '<svg viewBox="0 0 1 1"><script>x</script></svg>', })]);
  await assert.rejects(
    redrawLogo({ ...opts, imageKey: 'tn_x/proj/uploads/new-logo.png', gateway: second.gateway as never, readObject: onePng }),
    /重绘结果/,
  );

  const saved = requireProject(project.projectId, project.tenantId);
  assert.equal(saved.brandLogoImage, 'tn_x/proj/uploads/new-logo.png', '原图要换成新的');
  assert.equal(
    saved.brandLogoSvg, '',
    '旧稿必须清掉：留着就是「新原图 + 上一张的重绘稿」两份不相干的东西并排，'
    + '面板按 `brandLogoSvg` 非空走有稿那条分支，既不提示失败、还让人能把旧稿确认到新图上',
  );
  assert.equal(saved.brandLogoMode, 'original');
});

/**
 * 一个能卡住**第一次**模型调用的网关，用来在两轮重绘之间插队。
 *
 * `started` 在第一次调用进入时兑现，于是「A 这一轮已经落到模型上」是可等待的确定事实，
 * 不靠 `await Promise.resolve()` 数微任务——那种写法一旦前面多一个 await 就悄悄失真。
 */
function gatedGateway(svgA: string, svgB: string) {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let entered!: () => void;
  const started = new Promise<void>((r) => { entered = r; });
  let call = 0;
  const gateway = {
    async text() {
      call += 1;
      if (call === 1) {
        entered();
        await gate;
        return { text: JSON.stringify({ svg: svgA }) };
      }
      return { text: JSON.stringify({ svg: svgB }) };
    },
    async image() { throw new Error('本用例不生成图片'); },
  };
  return { gateway, started, release };
}

test('重绘期间用户又换了一张：先发起的那一轮不覆盖后来者', async () => {
  const SVG_A = '<svg viewBox="0 0 4 4"><rect width="4" height="4"/></svg>';
  const SVG_B = '<svg viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"/></svg>';
  const keyA = 'tn_x/proj/uploads/a.png';
  const keyB = 'tn_x/proj/uploads/b.png';

  const project = makeProject();
  const opts = { projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId };
  const { gateway, started, release } = gatedGateway(SVG_A, SVG_B);

  // A 这一轮发起后卡在模型上（初始写已经落了 keyA）
  const slow = redrawLogo({ ...opts, imageKey: keyA, gateway: gateway as never, readObject: onePng });
  await started;
  assert.equal(requireProject(project.projectId, project.tenantId).brandLogoImage, keyA, '前置条件：A 已落库');

  // 这期间用户又传了一张，B 这一轮一路跑完并写库
  await redrawLogo({ ...opts, imageKey: keyB, gateway: gateway as never, readObject: onePng });
  assert.equal(requireProject(project.projectId, project.tenantId).brandLogoSvg, SVG_B, '前置条件：B 已落库');

  // A 这才拿到模型结果
  release();
  await slow;

  const saved = requireProject(project.projectId, project.tenantId);
  assert.equal(saved.brandLogoImage, keyB, '当前原图是 B');
  assert.equal(saved.brandLogoSvg, SVG_B, 'B 的图必须配 B 的稿，不能被 A 的稿盖掉');
  assert.equal(saved.brandLogoMode, 'redraw');
});

test('网关整个挂掉时如实报错，不落库', async () => {
  const project = makeProject();
  const { gateway } = fakeGateway([new Error('连接超时')]);
  await assert.rejects(
    redrawLogo({
      projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
      imageKey: 'tn_x/proj/uploads/3-logo.png',
      gateway: gateway as never, readObject: onePng,
    }),
    /连接超时/,
  );
  assert.equal(requireProject(project.projectId, project.tenantId).brandLogoSvg, '');
});

test('内置 Mock 的占位说明不算重绘结果', async () => {
  const project = makeProject();
  const { gateway } = fakeGateway([`${MOCK_PLACEHOLDER_MARKER}，这是一段说明文字。`]);
  await assert.rejects(
    redrawLogo({
      projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
      imageKey: 'tn_x/proj/uploads/4-logo.png',
      gateway: gateway as never, readObject: onePng,
    }),
  );
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd packages/server-core && node --import tsx --test src/services/brand-logo.test.ts`

Expected: FAIL —— 找不到模块 `./brand-logo.service.js`。

- [ ] **Step 3: 写 `brand-logo.service.ts`**

```ts
import { z } from 'zod';
import { isMockPlaceholder, type ProviderGateway } from '@lumen/provider-gateway';
import { createStorage } from '@lumen/storage';
import { invalid, notConfigured, providerError } from '../lib/errors.js';
import { updateProject, requireProject } from './project.service.js';
import { billedGateway } from './billed-gateway.js';

/** 重绘稿的体积上限。一页 logo 用不着几十 KB，超了多半是模型把整张图描成了逐像素路径 */
const MAX_SVG_BYTES = 40 * 1024;

/**
 * 拒绝清单：明显不该出现在 logo 里的东西。
 *
 * **这不是安全边界，别再往里加规则指望它挡住攻击。** 安全边界是「这份稿只会以
 * `<img src="data:image/svg+xml,…">` 的形态出现，永远不会内联进页面」——
 * 见 `packages/ir-schema/src/html-doc.ts` 的 `colorizeSvg`，那里记着为什么内联不行。
 *
 * 为什么正则挡不住：它看的是**原文**，浏览器看的是**重新解析后**的结果，中间隔着
 * 实体解码、空白规范化、CSS 转义一整层。实测跑通过的原样放行（全部逐字节落库）：
 *
 * - `<img src="http&#58;//169.254.169.254/…">` —— `&#58;` 解出来才是冒号；
 * - `<desc><iframe src="javascript:…"></iframe></desc>` —— `<desc>` 是 HTML 集成点；
 * - `<svg style="background:\75 rl(…)">` —— `\75 rl(` 是 `url(` 的 CSS 转义写法。
 *
 * 所以这份清单只做两件事：**挡住老实的模型输出**（它才是 99% 的情况），
 * 以及**在明显有毒时给出一个人能看懂的错误**，而不是让一段怪东西静默落库。
 *
 * 它比页面用的 `lintMockHtml`（`packages/render-engine/src/codegen.ts:140-155`）**大体相当**：
 * 页面那套挡 `script` / `@import` / 外部 `url()` / `on*` 与 `<link rel=stylesheet`（后者这里
 * 没有对应项，但要走 `href=` 才生效、已被 `\bhref\s*=` 拦住，所以不是洞）。这里额外挡 `<style>`、
 * `<image>`、`<foreignObject>`、`<use>`、`xlink:`——logo 只需要形状属性，用不上这些。
 */
const FORBIDDEN: { re: RegExp; why: string }[] = [
  { re: /<script\b/i, why: '脚本标签' },
  { re: /<style\b/i, why: '样式块' },
  { re: /<image\b/i, why: 'SVG 图片引用' },
  { re: /<foreignObject\b/i, why: '嵌入的外部内容' },
  { re: /<use\b/i, why: '外部符号引用' },
  { re: /\bhref\s*=/i, why: '链接属性' },
  { re: /xlink:/i, why: 'xlink 命名空间' },
  { re: /\burl\s*\(/i, why: 'url() 引用' },
  { re: /@import/i, why: '@import 引入' },
  { re: /image-set\s*\(/i, why: 'image-set() 引用' },
  { re: /\bon[a-z]+\s*=/i, why: '内联事件处理器' },
  // 一个 logo 里除了 SVG 命名空间，不该出现任何 http(s) 地址
  { re: /https?:\/\/(?!www\.w3\.org\/)/i, why: '外部网址' },
];

/** 至少要有一种图形，纯文字的「重绘」等于什么都没画 */
const SHAPE = /<(path|rect|circle|ellipse|polygon|polyline|line)\b/i;

/**
 * 校验重绘稿。**不过就抛**——宁可让面板走失败态，也不能把一段来路不明的 SVG
 * 塞进每一页的页眉里。
 *
 * 它防三件事：
 * 1. **明显有毒的东西**（`<script>`、`on*=`、外部引用）——一道廉价的初筛，
 *    真正的保险是「稿只会当图片加载」。别把它当安全边界，见 `FORBIDDEN` 上面那段。
 * 2. **不是一个 SVG**（没有 `<svg>`、缺 `viewBox`）——缺 viewBox 缩放会失真，
 *    而且这种情况下模型多半是在胡说；
 * 3. **不是一页 logo 的东西**（没有任何图形、几百 KB 的逐像素路径）。
 *
 * **抛的是 `AppError`，不是裸 `Error`。** 中间件只把 `AppError` 的报文透给客户端，
 * 裸 `Error` 一律被压成「服务器内部错误」——上面这几句精心写的中文就白写了，
 * 用户看到的是「重绘失败：服务器内部错误」，真正的原因（比如「缺 viewBox」）只留在日志里。
 */
export function validateLogoSvg(svg: string): void {
  if (typeof svg !== 'string' || !/<svg\b/i.test(svg)) throw invalid('重绘结果不是一个 SVG');
  if (!/viewBox\s*=/i.test(svg)) throw invalid('重绘结果缺 viewBox，缩放会失真');

  /**
   * **安全检查排在图形检查前面。**
   *
   * 排在后面的话，一段带 `<script>` 却没画图形的 SVG 会先被「没有任何图形」拦下——
   * 结论碰巧也是拒收，但那条安全规则**一次都没被验到**：把它从 `FORBIDDEN` 里删掉，
   * 测试照样全绿。安全清单必须每条都有能单独失败的用例守着，顺序就得让它先说话。
   */
  for (const { re, why } of FORBIDDEN) {
    // 报 `why` 而不是正则源码：`\bon[a-z]+\s*=` 对用户是天书，而且会被原样打进 toast
    if (re.test(svg)) throw invalid(`重绘结果里有不允许的东西：${why}`);
  }

  if (!SHAPE.test(svg)) throw invalid('重绘结果里没有任何图形');
  if (Buffer.byteLength(svg, 'utf8') > MAX_SVG_BYTES) {
    throw invalid(`重绘结果超过 ${MAX_SVG_BYTES / 1024}KB`);
  }
}

/** 只收 `svg` 一项。单色与否不用模型说——渲染时按 `currentColor` 有没有出现来决定烘不烘颜色 */
const Reply = z.object({ svg: z.string().min(1) });

const SYSTEM = [
  '你是矢量图形工程师。用户给你一张品牌 logo 的位图，你把它**重画成 SVG**。',
  '',
  '硬性要求：',
  '- 只输出 JSON：{"svg":"<svg …>…</svg>"}',
  '- svg 必须带 viewBox，坐标自己归一化，不要写 width/height 的固定像素',
  '- **不要画背景**：logo 外面那层白底、底色都不要，只留图形本身',
  '- 形状参数写属性（fill / stroke / stroke-width / transform），**不要用 <style> 块**',
  '- 不要写 <script>、<style>、<image>、<foreignObject>、<use>、href、xlink、url()、@import',
  '- 不要写 on 开头的事件属性（onload / onclick 等）',
  '- **svg 根标签必须带 xmlns="http://www.w3.org/2000/svg"**——它会被当图片加载，缺了就画不出来',
  '- 除了上面那个 xmlns，不要写任何 http(s) 地址',
  '- 不要引外部字体、不要用 <text> 拼图形——文字用路径描出来',
  '- 原图是单色（黑白/灰阶）时，**所有填充与描边一律写 currentColor**——',
  '  它会被换成这套风格的品牌色，logo 才跟页面配色一致；',
  '  原图本身有颜色时，用原图自己的色值',
  '- 形状尽量精简：能用 <path> 就用 path，不要一个像素一个矩形',
].join('\n');

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
};

export interface RedrawLogoInput {
  projectId: string;
  tenantId: string;
  userId: string;
  /** `/uploads` 返回的对象 key */
  imageKey: string;
  /** 演示用的注入点，测试里换成假网关 */
  gateway?: ProviderGateway;
  /** 演示用的注入点，测试里换成假的对象读取 */
  readObject?: (key: string) => Promise<Buffer>;
}

/**
 * 把上传的 logo 重绘成 SVG。
 *
 * **失败时保留 `brandLogoImage` 并把模式退回 `original`**：原图还在，「就用原图」才有得用；
 * 否则用户传了一张图、重绘又失败，面板上会是一片空白，只能重传。
 */
export async function redrawLogo(input: RedrawLogoInput): Promise<{ svg: string }> {
  const readObject = input.readObject ?? (async (key: string) => createStorage().get(key));

  /**
   * **先读图，再动库。**
   *
   * 读图是毫秒级的，重绘要跑十几秒；这一步之前是唯一一个「库里还完全是上次的样子」的时刻。
   * 顺序反过来的话，`imageKey` 指向一个读不出来的对象时（对象过期被清、key 是客户端乱传的），
   * 库里会留下「**一个不存在的原图 key + 一份刚被清掉的旧稿**」——上一份能用的稿没了，
   * 新原图又是破图，用户只能重传。按这个顺序，读失败就整个不动库，面板上什么都不变。
   */
  let buffer: Buffer;
  try {
    buffer = await readObject(input.imageKey);
  } catch {
    /**
     * **读不出对象不能落成 500。**
     *
     * `LocalStorage.get` 读不到时抛裸 `Error`，而中间件把裸 `Error` 一律压成
     * 500「服务器内部错误」——用户看到「重绘失败：服务器内部错误」，分不出是图片没了
     * 还是模型挂了。`apps/api/src/routes/styles.ts:281-284` 是同一条路径（读一个被引用
     * 到的上传对象），那边就是 `catch { throw invalid('图片不存在或已过期：…') }`，这里对齐它。
     *
     * 这也会把「key 里带 `..`」这类被 `assertSafeKey` 拒掉的输入一并落成 400——
     * 那本来就是客户端传错了参数，400 是对的。
     */
    throw invalid('这张原图取不到，可能已经过期或被清理，重新上传一次试试');
  }

  /**
   * 记下原图，并且**把上一次的重绘稿清掉**。
   *
   * 记原图：重绘要跑十几秒，中途用户刷新页面时这张图不该丢。
   *
   * 清旧稿：不清的话，用户换了一张图、而重绘失败，库里会留下「**新的原图 + 上一张的重绘稿**」。
   * 面板按 `brandLogoSvg` 非空走「有重绘稿」那条分支，于是既不提示失败、又把两份不相干的
   * 东西并排摆着，用户还能点「用重绘稿」把旧稿确认到新图上。
   */
  updateProject(input.projectId, input.tenantId, {
    brandLogoImage: input.imageKey,
    brandLogoSvg: '',
    brandLogoMode: 'original',
  });

  const ext = input.imageKey.split('.').pop()?.toLowerCase() ?? 'png';
  const dataUrl = `data:${MIME_BY_EXT[ext] ?? 'image/png'};base64,${buffer.toString('base64')}`;

  const gateway = input.gateway ?? billedGateway(input.tenantId, input.userId);
  let res: Awaited<ReturnType<ProviderGateway['text']>>;
  try {
    res = await gateway.text({
      taskType: 'logo_redraw',
      json: true,
      maxTokens: 8000,
      system: SYSTEM,
      messages: [{ role: 'user', content: '把这张 logo 重画成 SVG。', images: [dataUrl] }],
    });
  } catch (err) {
    /**
     * **网关抛的是裸 `Error`，不翻一遍用户只会看到「服务器内部错误」。**
     *
     * 只翻这一种：**路由没配**。`packages/provider-gateway/src/router.ts:11` 明写
     * 「message 含 `ROUTE_NOT_CONFIGURED`」，:15 抛出，`provider-gateway.test.ts:175`
     * 用不强锚的 `/ROUTE_NOT_CONFIGURED/` 守着——所以这里**照着契约用 `includes`**。
     *
     * **别自作聪明改成 `startsWith`。** 契约说的是「含」，改成锚定开头，生产者将来把消息
     * 改成 `任务路由未配置（ROUTE_NOT_CONFIGURED）：…` 时它自己那条用例照样绿，而这条路会
     * **静默**退回 500「服务器内部错误」——没有任何测试会红。要收紧就先改 `router.ts:11`
     * 的契约与它那条用例，让「契约」真的成立，再收紧消费者。
     *
     * 而「logo_redraw 没配模型」是自建部署最容易撞上、也最需要用户看懂的一种失败：
     * 面板上只会显示「logo 重绘失败」，原因得说得出来。
     *
     * **其余的原样往上抛，让它落成 500。** `apps/api/src/routes/styles.ts:82-85` 那条
     * 注释说得对：「把 provider 挂掉说成图读不了是撒谎」——认不出的失败就该是 500，
     * 记在日志里，而不是硬编一句可能不准确的人话。
     */
    const raw = err instanceof Error ? err.message : String(err);
    if (raw.includes('ROUTE_NOT_CONFIGURED')) throw notConfigured(raw);
    throw err;
  }

  if (isMockPlaceholder(res.text)) throw notConfigured('当前 logo_redraw 路由指向内置 Mock，它给不出矢量稿');

  let parsed: z.infer<typeof Reply>;
  try {
    parsed = Reply.parse(JSON.parse(res.text));
  } catch {
    throw providerError(`模型没有给出合契约的 JSON（回的是：${res.text.slice(0, 60)}）`);
  }

  validateLogoSvg(parsed.svg);

  /**
   * **落库前确认这一轮还没被后来者顶掉。**
   *
   * 重绘是同步的十几秒，期间用户可能又传了一张（双击「换一张」、开两个标签页）。
   * 没有这道检查的话，先发起的那一轮后完成，会把**上一张图的重绘稿**盖到当前这张图上——
   * 库里存着 `image=B` 与 `svg=重绘A`，而界面看不出哪里不对。
   *
   * 被顶掉就什么都不写：后来者那一轮会写它自己的。返回的 `svg` 只是给调用方看一眼，
   * **不要拿它当落库结果**——落库状态以重新读出来的项目为准。
   */
  if (requireProject(input.projectId, input.tenantId).brandLogoImage !== input.imageKey) {
    return { svg: parsed.svg };
  }

  updateProject(input.projectId, input.tenantId, {
    brandLogoSvg: parsed.svg,
    brandLogoMode: 'redraw',
  });
  return { svg: parsed.svg };
}

/**
 * 清空一个项目的品牌。槽位全部落空，页眉上那几条槽位元素会被整个移除
 * （前提是 `brandOf` 在五列全空时**仍然返回一个 `BrandSlot`**，见 `brand.ts`——
 * 返回 `undefined` 的话 `fillBrandSlots` 根本不会被调用，槽位会留成空壳）。
 *
 * **注意「清空」清掉的是项目行上那五个指针，不是对象存储里的文件。** 全仓没有任何
 * `storage.delete` 调用，`/files` 又是不鉴权的 `express.static`——原图与重绘稿都还在磁盘上、
 * 按 key 仍能取回，真正不可逆的是「再也找不到它们了」。别把这句话读成能回收磁盘。
 */
export function clearBrand(projectId: string, tenantId: string): void {
  requireProject(projectId, tenantId);
  updateProject(projectId, tenantId, {
    brandLogoImage: '', brandLogoSvg: '', brandLogoMode: '', brandName: '', brandTagline: '',
  });
}
```

在 `packages/server-core/src/index.ts` 里加：

```ts
export * from './services/brand-logo.service.js';
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd packages/server-core && node --import tsx --test src/services/brand-logo.test.ts`

Expected: PASS，`fail 0`。**别按用例个数对账**——这个文件后面的任务还会往里加。

- [ ] **Step 5: 提交**

```bash
git add packages/server-core/src/services/brand-logo.service.ts \
        packages/server-core/src/index.ts \
        packages/server-core/src/services/brand-logo.test.ts
git commit -m "feat(brand): logo 重绘服务与 SVG 校验"
```

---

## Task 5: 三条品牌路由

**Files:**
- Modify: `apps/api/src/routes/projects.ts`
- Test: `apps/api/src/routes/projects.test.ts`

- [ ] **Step 1: 写失败的测试**

**先给该文件的测试环境补一行**：`process.env.LUMEN_DATA_DIR = join(tmp, 'data');`
（与 `LUMEN_DB_PATH` 并列）。新用例里有一次**真的上传**，而 `createStorage()` 的默认值是
`./data/objects`——不设的话会往 `apps/api/data/` 里写文件（`.gitignore` 里有 `data/`，
所以只是脏，不会进版本库；但测试不该往仓库里写东西）。`apps/worker/src/worker.test.ts`
就是这么做。

该文件的辅助函数（:49）签名是 `api(path, init: RequestInit)`——**body 要自己 `JSON.stringify`**，鉴权走 `headers: auth(tokenA)`（`auth` 在同文件 :68 定义），**没有** `anonymous` 之类的开关，
不带头就是匿名。`projectId` / `tokenA` 是该文件顶部的模块级变量（:58-60），已由前面的用例填好。

在 `apps/api/src/routes/projects.test.ts` 末尾追加：

```ts
/* ---------------- 品牌 ---------------- */

test('品牌路由要登录，未登录一律 401', async () => {
  const res = await api('/api/projects/prj_x/brand/redraw', {
    method: 'POST', body: JSON.stringify({ imageKey: 'k.png' }),
  });
  assert.equal(res.status, 401);
});

test('重绘要传 imageKey，不传报 400', async () => {
  const res = await api(`/api/projects/${projectId}/brand/redraw`, {
    method: 'POST', headers: auth(tokenA), body: JSON.stringify({}),
  });
  assert.equal(res.status, 400);
});

test('imageKey 必须是本项目上传的图，别人的 key 一律拒收', async () => {
  const me = await api('/api/me', { headers: auth(tokenA) });
  const tenantId = me.body.data.user.tenantId as string;

  const bad = [
    `${tenantId}/prj_someone_else/uploads/1-logo.png`, // 别的项目
    `${tenantId}/${projectId}/outputs/deck.pdf`,       // 本项目、但不在 uploads 分区
    '/etc/passwd',
    `../../${tenantId}/${projectId}/uploads/x.png`,    // 路径花活
  ];
  for (const imageKey of bad) {
    const res = await api(`/api/projects/${projectId}/brand/redraw`, {
      method: 'POST', headers: auth(tokenA), body: JSON.stringify({ imageKey }),
    });
    assert.equal(res.status, 400, `本该拒收：${imageKey}，实际 ${res.status} ${JSON.stringify(res.body)}`);
  }

  /**
   * 前缀对了就该**放行到下一步**。
   *
   * **这条与上面那个拒收循环守的是相反的两个方向，两条都要：**
   * - 把前缀判断写成**恒真**（`if (true) throw`）→ 上面那个循环照样全绿（坏 key 都被拒了），
   *   红的只有这条；它守的是「不能一律拒收」。
   * - 把前缀判断写成**恒假**（`if (false)`）→ 上面那个循环先红，红的**不是**这条；
   *   它守的是「不能一律放行」。
   *
   * 只留一条都会漏掉一个方向：恒真那种实现下真实用户**一张图都传不上去**，
   * 而只测拒收是看不出来的。
   *
   * **用「真上传一张图」来验，不要用「假 key 撞下游失败 + `assert.notEqual(status, 400)`」。**
   * 后者是个会误伤后续修复的陷阱：任何非 400 都算过（402 配额、404 路由写错、409 生成锁都过），
   * 而且哪天有人把「读对象失败」的错误语义从 500 改成 400（`apps/api/src/routes/styles.ts:281-284`
   * 就是 400），这条会立刻变红——尽管前缀校验一字未改，红的原因会指向错误的方向。
   *
   * 真上传之后，断言就落在**「请求走到了模型那一步」**（内置 Mock 给不出矢量稿 → 501），
   * 那是前缀过关、且对象真读到了的确凿证据。
   *
   * 顺带钉住一条**隐式契约**：品牌 logo 上传时**必须带 `projectId`**
   * （`apps/api/src/routes/uploads.ts:47` 的默认值是字面量 `'uploads'`）。仓库里现存的
   * 三处 `/uploads` 调用（`studio/upload.ts`、`RightRail.tsx` 两处）都没带，
   * 谁照它们复制一份，**每一次合法重绘都会 400**，而错误信息指不到真正的原因。
   */
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const up = await api('/api/uploads', {
    method: 'POST', headers: auth(tokenA),
    body: JSON.stringify({ dataUrl: `data:image/png;base64,${png}`, name: 'logo.png', projectId }),
  });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  assert.ok(
    String(up.body.data.key).startsWith(`${tenantId}/${projectId}/uploads/`),
    `上传要落在本项目的 uploads 分区，实际：${up.body.data.key}`,
  );

  const passed = await api(`/api/projects/${projectId}/brand/redraw`, {
    method: 'POST', headers: auth(tokenA), body: JSON.stringify({ imageKey: up.body.data.key }),
  });
  assert.equal(
    passed.status, 501,
    `前缀过了就该走到模型那一步（内置 Mock 给不出稿 → 501），实际 ${passed.status} ${JSON.stringify(passed.body)}`,
  );
  assert.match(passed.body.error?.message ?? '', /Mock/, '原因要是「路由指向内置 Mock」，不是前缀、也不是读对象');
});

/**
 * **前缀对了但对象不在了**，要报 400 并说得出原因。
 *
 * 读对象失败原先落成 500「服务器内部错误」，用户分不出是图片没了还是模型挂了
 * （`apps/api/src/routes/styles.ts:281-284` 是同一条路径，那边就是 400 + 一句中文）。
 * 这条守的就是那个 `try/catch`——去掉它，这条会红在 500 上。
 */
test('前缀对了但对象不在了，报 400 且说得出原因', async () => {
  const me = await api('/api/me', { headers: auth(tokenA) });
  const tenantId = me.body.data.user.tenantId as string;

  const res = await api(`/api/projects/${projectId}/brand/redraw`, {
    method: 'POST', headers: auth(tokenA),
    body: JSON.stringify({ imageKey: `${tenantId}/${projectId}/uploads/not-there.png` }),
  });
  assert.equal(res.status, 400, `不该是 500「服务器内部错误」：${JSON.stringify(res.body)}`);
  assert.match(res.body.error?.message ?? '', /取不到/, '要说得出是原图取不到');
});

test('PATCH 能存品牌名、标语与模式，且不接受客户端回传的 SVG', async () => {
  const res = await api(`/api/projects/${projectId}`, {
    method: 'PATCH', headers: auth(tokenA),
    body: JSON.stringify({
      brandName: '星图科技', brandTagline: '让数据说话',
      brandLogoMode: 'original', brandLogoSvg: '<svg/>',
    }),
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.data.brandName, '星图科技');
  // **三个字段都要断言。** 只断言 name 与 mode 的话，把 `brandTagline` 那一行从
  // `updateProject` 里删掉、全仓测试**一条都不会红**（实测过）——用户改标语永远不生效。
  assert.equal(res.body.data.brandTagline, '让数据说话', '标语也要真的落库');
  assert.equal(res.body.data.brandLogoMode, 'original', '模式也要真的落库');

  /**
   * 回传的 `brandLogoSvg` 被丢掉了——**这条守的其实是 `updateProject` 的白名单**
   * （漏写一行就红），不是注释常说的「schema 静默剥掉」：schema 是普通 `z.object`，
   * Zod 默认剥掉未知字段，所以就算有人把 `brandLogoSvg` 加进 schema、却忘了加进
   * `updateProject`，这条照样绿。安全属性守住了，机制没被验到——写在这里免得被误读。
   */
  assert.equal(res.body.data.brandLogoSvg, '', 'SVG 只能由服务端校验后写入，客户端传什么都不算数');

  // 空串要能真的把模式清掉——Task 8 的「不用 logo」按钮走的就是这条路，
  // 而 `''` 是 `BRAND_LOGO_MODES` 的合法取值，不测的话没人知道它通不通
  const cleared = await api(`/api/projects/${projectId}`, {
    method: 'PATCH', headers: auth(tokenA), body: JSON.stringify({ brandLogoMode: '' }),
  });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.data.brandLogoMode, '', '空串要能把模式清掉');
});

test('DELETE /brand 清空五列', async () => {
  const me = await api('/api/me', { headers: auth(tokenA) });
  const tenantId = me.body.data.user.tenantId as string;

  /**
   * **五列都要先设成非空、再逐列断言清掉。**
   *
   * 只 `PATCH brandName` 再断言 `brandName === ''` 的话，把 `clearBrand` 改成
   * 「只清 brandName」（其余四列一个都不清）**全仓测试一条都不会红**（实测过）——
   * 而用户点了清空、面板上 logo 还在，CI 全绿。改这五列时漏一个正是最容易犯的错。
   *
   * `brandLogoSvg` 走不了 PATCH（服务端才写），所以用 `updateProject` 直接置。
   */
  const { updateProject } = await import('@lumen/server-core');
  updateProject(projectId, tenantId, {
    brandLogoImage: `${tenantId}/${projectId}/uploads/1-logo.png`,
    brandLogoSvg: '<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>',
    brandLogoMode: 'redraw',
    brandName: '星图科技',
    brandTagline: '让数据说话',
  });
  const before = await api(`/api/projects/${projectId}`, { headers: auth(tokenA) });
  for (const col of ['brandLogoImage', 'brandLogoSvg', 'brandLogoMode', 'brandName', 'brandTagline']) {
    assert.ok(before.body.data.project[col].length > 0, `前置条件：${col} 要是非空的，否则下面的断言是空转`);
  }

  const res = await api(`/api/projects/${projectId}/brand`, { method: 'DELETE', headers: auth(tokenA) });
  assert.equal(res.status, 200);

  const detail = await api(`/api/projects/${projectId}`, { headers: auth(tokenA) });
  for (const col of ['brandLogoImage', 'brandLogoSvg', 'brandLogoMode', 'brandName', 'brandTagline']) {
    assert.equal(detail.body.data.project[col], '', `${col} 要一起清掉`);
  }

  // 清空是不可逆的，要留得下痕迹，而且**认得出是「清品牌」而不是「删项目」**
  const { listAudit } = await import('@lumen/server-core');
  const { items } = listAudit({ tenantId, action: 'clear_brand', limit: 10 });
  assert.ok(items.length > 0, '清空品牌必须写审计');
  assert.match(items[0]!.target, new RegExp(projectId), '审计里要认得出清的是哪个项目');
});

/**
 * 三条路由对外都必须挡住别人的项目，并留下 forbidden 审计。
 *
 * **别以为这条在守路由级那几行 `requireProject`。** 实测：删掉 `DELETE /:id/brand` 上那行，
 * 全仓测试**一条都不红**——`clearBrand` 内部还会 `requireProject` 一次，给出同一个 403、
 * 同一条 forbidden 审计（审计是错误中间件统一写的，`middleware/error.ts:32`），
 * 行为完全不可区分。那行是「删了也没人知道」的纯冗余纵深防御。`PATCH /:id` 更彻底：
 * 它**根本没有**路由级校验，靠 `updateProject` 内部那次。
 *
 * 所以这条用例守的是**可观测的对外契约**（三条都 403、都有审计），不是某一行代码。
 * 要让它守某一行，得先让那行不可替代——那要改设计，不值得。
 */
test('品牌三条路由都挡住别人的项目，并写 forbidden 审计', async () => {
  const me = await api('/api/me', { headers: auth(tokenB) });
  const tenantId = me.body.data.user.tenantId as string;
  const userId = me.body.data.user.userId as string;

  const attempts: [string, RequestInit][] = [
    [`/api/projects/${projectId}`, { method: 'PATCH', body: JSON.stringify({ brandName: '偷改' }) }],
    [`/api/projects/${projectId}/brand/redraw`, {
      method: 'POST', body: JSON.stringify({ imageKey: `${tenantId}/${projectId}/uploads/x.png` }),
    }],
    [`/api/projects/${projectId}/brand`, { method: 'DELETE' }],
  ];
  for (const [path, init] of attempts) {
    const res = await api(path, { ...init, headers: auth(tokenB) });
    assert.equal(res.status, 403, `${init.method} ${path} 本该 403，实际 ${res.status}`);
    assert.equal(res.body.error?.code, 'FORBIDDEN');
  }

  const { listAudit } = await import('@lumen/server-core');
  const { items } = listAudit({ tenantId, userId, action: 'forbidden', limit: 10 });
  assert.ok(items.length >= 3, '三条越权都要留下 forbidden 审计');
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd apps/api && node --import tsx --test src/routes/projects.test.ts`

Expected: FAIL —— `/brand/redraw` 与 `/brand` 都是 404（路由不存在）。

- [ ] **Step 3: 扩 `PATCH` 的 body schema**

`apps/api/src/routes/projects.ts` 的 `PATCH /:id`，在 `targetPages` 后加三个字段：

```ts
    /** '' 没有 logo / 'redraw' 用重绘稿 / 'original' 用原图。取自 `BRAND_LOGO_MODES`，不另抄一份 */
    brandLogoMode: z.enum(BRAND_LOGO_MODES).optional(),
    brandName: z.string().max(60).optional(),
    brandTagline: z.string().max(120).optional(),
```

同处的 `updateProject(...)` 调用里加三行（**注意没有 `brandLogoSvg`**——SVG 只由服务端写）：

```ts
    ...(body.brandLogoMode !== undefined ? { brandLogoMode: body.brandLogoMode } : {}),
    ...(body.brandName !== undefined ? { brandName: body.brandName } : {}),
    ...(body.brandTagline !== undefined ? { brandTagline: body.brandTagline } : {}),
```

- [ ] **Step 3b: 给「清空品牌」加一个审计动作**

`AuditAction` 是**闭合枚举**（`packages/ir-schema/src/user.ts:60`），所以下面那条 `DELETE /brand`
要用的 `'clear_brand'` 必须先加进去，否则 `recordAudit` 那行过不了 `tsc`。

在 `'delete_project',` 那一行后面加：

```ts
  // 清空品牌会把项目行上那五个指针清掉，同样不可逆（对象还在磁盘上，但再也找不到）。
  // **不借 `delete_project`**——借来的动作名会让审计里分不出「删了整本项目」和「只清了品牌」，
  // 上面那条注释记的就是这类教训
  'clear_brand',
```

再在 `apps/admin/src/api/types.ts:121` 的 `AUDIT_ACTION_LABEL` 里补一条中文名
（不补的话筛选器与徽标会直接显示 `clear_brand`）：

```ts
  clear_brand: '清空品牌',
  // 顺手补上这两条：它们本来就缺（枚举 23 个动作里少了这 2 个），
  // 于是审计页的筛选下拉里**根本没有**「删除项目」「重新生成讲稿」两个选项，
  // 表格里也直接显示英文。反正已经在动这张表，两行的成本
  delete_project: '删除项目',
  script_generate: '重新生成讲稿',
```

代价就这几行：`ACTION_FILTERS`（`apps/admin/src/pages/Audit.tsx:10`）是从这张表自动生成的。

另外在 `apps/api/src/routes/uploads.ts` 的 `UploadSchema` 里给 `projectId` 补一句注释——
它是品牌那条链路的**隐式契约**，而仓库里现存的三处调用都没带：

```ts
  /** 归属项目。**品牌 logo 必须带**：重绘时要求 `imageKey` 以 `<tenantId>/<projectId>/uploads/` 开头，
   *  不带的话 key 会落在字面量 `uploads/` 分区里，每次合法重绘都会 400 */
```

- [ ] **Step 4: 加两条新路由**

在 `apps/api/src/routes/projects.ts` 的 `DELETE /:id` 之后加：

```ts
/* ---------------- 品牌 logo ---------------- */

/**
 * 把上传的 logo 重绘成矢量稿。
 *
 * **同步跑十几秒**：不像风格识别那条要三到六分钟，没必要为它上 SSE。
 * 前端在这段时间里显示转圈，与单页重生成是同一个量级的等待。
 *
 * 服务端落库、客户端只收结果——**不接受客户端回传的 SVG**：
 * 那段稿会被填进每一页的页眉，校验只能发生在服务端。
 */
projectsRouter.post('/:id/brand/redraw', async (req, res) => {
  const { id } = parseParams(IdParam, req);
  const tenantId = tenantOf(req);
  const userId = userIdOf(req);
  requireProject(id, tenantId);
  const body = parseBody(z.object({
    imageKey: z.string().min(1).max(400),
    // 只做长度校验不够——见下面那条前缀检查
  }), req);

  /**
   * `imageKey` 必须是**本租户、本项目**的 uploads 分区里的对象。
   *
   * 不校验的话，可以把任意字符串（别人的对象 key、`../../` 之类的路径花活）写成自己项目的
   * logo。危害不大（`/files` 本来就是不鉴权的 `express.static`），但「这个参数只接受本项目
   * 的资源」是该有的样子，而且它顺手把「key 乱传」这类输入挡在了读对象之前。
   *
   * 前缀形状跟着 `objectKey(tenantId, projectId, 'uploads', name)`（`packages/storage/src/adapter.ts:48`）：
   * 那三段是 `tn_*` / `prj_*` / 字面量 `uploads`，过一遍 `sanitizeSegment` 也是原样。
   */
  const keyPrefix = `${tenantId}/${id}/uploads/`;
  if (!body.imageKey.startsWith(keyPrefix)) {
    // 把「上传时要带 projectId」写进消息里：`POST /api/uploads` 的默认值是字面量 `'uploads'`
    // （`routes/uploads.ts:47`），而仓库里现存的三处调用都没带 `projectId`。
    // 谁照它们复制一份，每次合法重绘都会撞到这里，而原消息指不到真正的原因
    throw invalid('imageKey 不是这个项目上传的图片（上传时要带上 projectId）');
  }

  await redrawLogo({
    projectId: id, tenantId, userId,
    imageKey: body.imageKey,
    gateway: billedGateway(tenantId, userId),
  });

  /**
   * **只回项目状态，不回 `svg`。**
   *
   * `redrawLogo` 在「这一轮被后一次上传顶掉」时会返回一份**没落库**的稿（它选择不覆盖
   * 后来者的结果）。把它放进响应体，客户端就会显示一份并不存在的重绘稿，而同一个响应里的
   * `project.brandLogoSvg` 又是另一份东西——自相矛盾。项目状态才是唯一可信的结果。
   */
  ok(res, withProgress(requireProject(id, tenantId)));
});

/** 清空品牌。槽位全部落空，页眉那条元素会被整个移除 */
projectsRouter.delete('/:id/brand', (req, res) => {
  const { id } = parseParams(IdParam, req);
  const tenantId = tenantOf(req);
  requireProject(id, tenantId);
  clearBrand(id, tenantId);
  recordAudit({
    // **不借 `delete_project`。** 清空会把项目行上的五个指针清掉，那同样不可逆
    // （对象还在磁盘上，但再也找不到它们了）；借别人的动作名，审计里就分不出
    // 「删了整本项目」和「只清了品牌」——`AuditAction` 那个枚举的注释记着同一类教训
    // （`delete_project` 当初是从 `export` 借来的）
    tenantId, userId: userIdOf(req), action: 'clear_brand',
    target: `project:${id}:brand`, ip: clientIp(req),
  });
  ok(res, withProgress(requireProject(id, tenantId)));
});
```

`apps/api/src/routes/projects.ts` 顶部从 `@lumen/server-core` 的 import 里加上 `redrawLogo, clearBrand`；
**`invalid` 也要加**（前缀校验那条 `throw invalid(...)` 用它，该文件现在只引了 `notFound, ok, requirePasswordChanged`，不加过不了 `tsc`）；
`BRAND_LOGO_MODES` 加到已有的 `@lumen/ir-schema` 那条 import 上（该文件 :8 已经引了这个包）。

**注意**：`DELETE /:id/brand` 与已有的 `DELETE /:id` 不冲突（路径不同），但 Express 里
`DELETE /:id/brand` 必须**注册在 `DELETE /:id` 之后**也可以正常工作——两条路径的模式不同，
不会互相吞。保持上面这个顺序即可。

- [ ] **Step 5: 跑测试，确认通过**

Run: `cd apps/api && node --import tsx --test src/routes/projects.test.ts`

Expected: PASS。

- [ ] **Step 6: 提交**

```bash
git add apps/api/src/routes/projects.ts apps/api/src/routes/projects.test.ts
git commit -m "feat(brand): 重绘、改名、清空三条路由"
```

---

## Task 6: 提示词里的品牌块

**Files:**
- Modify: `packages/server-core/src/services/generate-html.service.ts`
- Test: `packages/server-core/src/services/generate-html.test.ts`

- [ ] **Step 1: 写失败的测试**

在 `packages/server-core/src/services/generate-html.test.ts` 末尾追加：

```ts
/* ---------------- 品牌提示词 ---------------- */

test('有品牌时，提示词给出槽位并要求不要自己画图形', async () => {
  const doc = makeDoc();
  const project = makeProject();
  const { gateway, seen } = fakeGateway([goodHtml()]);

  await generatePageHtml({
    projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
    outline: { pageType: 'cover', title: 'T', claim: '', section: '', points: [] } as never,
    doc, pageIndex: 0, totalPages: 1,
    gateway: gateway as never,
    // 三项都给上，才能一次验到三条槽位行
    brand: {
      svg: '<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>',
      name: '星图科技', tagline: '让数据说话',
    },
  });

  const sent = seen[0]!.messages[0]!.content;
  assert.ok(sent.includes('data-lumen-brand="logo"'), '要给出 logo 槽位');
  assert.ok(sent.includes('data-lumen-brand="name"'), '要给出品牌名槽位');
  assert.ok(sent.includes('data-lumen-brand="tagline"'), '要给出标语槽位');
  assert.match(sent, /不要自己画图形/, '要明说不要自己画');
});

/**
 * **没值的槽位一个字都不提。**
 *
 * `fillBrandSlots` 会把没有值的槽位元素整条删掉，所以让模型为一个「等下会被删掉」的元素
 * 留位置，等于让它按三格排版、最后只剩两格。这条钉住「只说有值的那些」。
 */
test('没填的槽位不出现在提示词里，免得模型为会被删掉的元素排版', async () => {
  const doc = makeDoc();
  const project = makeProject();
  const { gateway, seen } = fakeGateway([goodHtml()]);

  await generatePageHtml({
    projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
    outline: { pageType: 'cover', title: 'T', claim: '', section: '', points: [] } as never,
    doc, pageIndex: 0, totalPages: 1,
    gateway: gateway as never,
    // 只有名字：logo 与标语都没有
    brand: { name: '星图科技', tagline: '' },
  });

  const sent = seen[0]!.messages[0]!.content;
  assert.ok(sent.includes('data-lumen-brand="name"'), '有值的那个要给');
  assert.equal(sent.includes('data-lumen-brand="logo"'), false, '没 logo 就别提 logo 槽位');
  assert.equal(sent.includes('data-lumen-brand="tagline"'), false, '没标语就别提标语槽位');
});

test('没有品牌时提示词里一个字都不提', async () => {
  const doc = makeDoc();
  const project = makeProject();
  const { gateway, seen } = fakeGateway([goodHtml()]);

  await generatePageHtml({
    projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
    outline: { pageType: 'cover', title: 'T', claim: '', section: '', points: [] } as never,
    doc, pageIndex: 0, totalPages: 1,
    gateway: gateway as never,
  });

  assert.equal(/data-lumen-brand/.test(seen[0]!.messages[0]!.content), false, '没品牌就完全不该提，行为与改动前一致');
});

/**
 * **重试那一轮也要带品牌槽位。**
 *
 * `callModel` 有两个调用点：正常那次，与「上一版有这些问题，请重写」的重试那次。
 * 只给前一处传 `brand` 的话，重试稿的提示词里没有槽位、写出来的页面没有 `data-lumen-brand`；
 * 而「两次都不合规」时采用的**正是重试稿**（`generate-html.service.ts:134-137`），
 * 那一页的页眉就静默少掉品牌——看起来像模型偶尔不听话，其实是漏了一个实参。
 *
 * `WRONG_PALETTE_HTML` 就是用来逼出重试的（上面「配色跑偏时重写一次」那条用例用的也是它）。
 */
test('重试那一轮的提示词同样带品牌槽位', async () => {
  const doc = makeDoc();
  const project = makeProject();
  const { gateway, seen } = fakeGateway([WRONG_PALETTE_HTML, goodHtml()]);

  await generatePageHtml({
    projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
    outline: { pageType: 'cover', title: 'T', claim: '', section: '', points: [] } as never,
    doc, pageIndex: 0, totalPages: 1,
    gateway: gateway as never,
    brand: { svg: '<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>', name: '星图科技', tagline: '' },
  });

  assert.equal(seen.length, 2, '前置条件：确实走了重试');
  assert.ok(
    seen[1]!.messages[0]!.content.includes('data-lumen-brand="logo"'),
    '重试那一轮也必须给出槽位，否则重试稿会把页眉的品牌整块丢掉',
  );
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd packages/server-core && node --import tsx --test src/services/generate-html.test.ts`

Expected: FAIL —— 新用例**运行时断言失败**（`AssertionError: 要给出 logo 槽位`）。
**不是 TS 报错**：`node --import tsx --test` 只剥类型、不做类型检查（类型由
`pnpm -r typecheck` 管，它会另外红）。照「TS 报错」去核对会以为失败得不对。

- [ ] **Step 3: 加 `brandBlock`**

`packages/server-core/src/services/generate-html.service.ts`，在 `contentBrief` 附近加：

```ts
/**
 * 品牌槽位那一段提示词。**只在项目确实有品牌时才拼进去**——没传 logo 也没填名字时
 * 一个字都不提，生成结果与改动前逐字一致。
 *
 * 而且**只说那些真有值的槽位**：`fillBrandSlots` 会把没有值的槽位元素**整条删掉**
 * （`slotValue` 返回 `null` 那一支），所以让模型为一个「等下会被删掉」的元素留位置，
 * 等于让它按三格排版、最后只剩两格。只提有的那几个，模型排出来的版才和成品一致。
 *
 * 说「留空即可」而不是「写上品牌名」：内容由渲染时注入（见 `fillBrandSlots`），
 * 模型自己写一遍只会产生第二份真相，用户改了名字它不会跟着变。
 */
function brandBlock(brand: BrandSlot): string {
  const slots = [
    brand.svg || brand.imageSrc
      ? '- 标识位置：<span class="brand-mark" data-lumen-brand="logo"></span>'
      : '',
    brand.name ? '- 品牌名：<span class="brand-name" data-lumen-brand="name"></span>' : '',
    brand.tagline ? '- 标语：<span class="brand-sub" data-lumen-brand="tagline"></span>' : '',
  ].filter((line) => line !== '');

  return [
    '---',
    '这一本有品牌标识，页眉必须按下面来写：',
    '',
    ...slots,
    '',
    '**上面这些位置不要自己画图形、不要写 <img>、不要填文字**，留空即可，系统会填进去。',
    '页眉的几何：高度与标识尺寸按上面「视觉规范」里那条页眉品牌标识来；',
    '规范里没写、或写着「不用页眉」时，按高 88px、标识 34px、左右边距 96px 来。',
  ].join('\n');
}
```

`PageHtmlInput`（:55-74）加：

```ts
  /** 项目品牌。不传就是「没有品牌」，提示词里一个字都不提 */
  brand?: BrandSlot;
```

给 `callModel` 加第五个参数 `brand?: BrandSlot`，在拼 `content` 的数组里、
`specBlock` 之后插一行：

```ts
        ...(brand ? ['', brandBlock(brand)] : []),
```

**`callModel` 有两个调用点，两处都要传 `brand`**（`:119` 正常那次、`:126` 带问题重试那次）。
**漏掉重试那处是个静默 bug**：重试稿的提示词里没有品牌槽位，于是它写出来的页面没有
`data-lumen-brand`；而「两次都不合规」时采用的正是重试稿（`:134-137`），
那一页的页眉就会**悄没声地少掉品牌**——看起来像模型偶尔不听话，其实是这里漏了一个实参。

`contentBrief` 不动——品牌是版式不是内容，放进内容段会让模型以为那是「这一页要讲的事」。

顶部 import 加：

```ts
import type { BrandSlot } from '@lumen/ir-schema';
```

- [ ] **Step 4: 跑测试，确认通过**

Run: `cd packages/server-core && node --import tsx --test src/services/generate-html.test.ts`

Expected: PASS，`fail 0`（原有用例不许被改红）。

- [ ] **Step 5: 提交**

```bash
git add packages/server-core/src/services/generate-html.service.ts \
        packages/server-core/src/services/generate-html.test.ts
git commit -m "feat(brand): 页面提示词给出品牌槽位"
```

---

## Task 6b: 把品牌接进生成链路

> **这一节是补的。** Task 6 只给 `PageHtmlInput` 加了 `brand`，但**全计划没有任何一处
> 去填它**——没有这一节，新生成的页面 `html` 里永远不会有 `data-lumen-brand`，
> Task 7 的 `fillBrandSlots` 也就没东西可填，整个功能对新页面是**惰性的**，
> 只有 Task 9 手工实测才会撞上。

**Files:**
- Modify: `packages/server-core/src/services/generate-html.service.ts`
- Test: `packages/server-core/src/services/generate-html.test.ts`

- [ ] **Step 1: 写失败的测试**

**注意两件事，都是实测踩出来的：**

1. **`generatePageHtmlAt` 读的是「已缓存」的大纲**（`readDeckMeta`），而 `makeProject()`
   只建项目、不建 deck。**不先 `planOutline(projectId, tenantId)` 的话它会抛
   `AppError: 大纲里没有第 1 页`**——断言一个字都跑不到，于是这条用例**在任何变异下都「红」**，
   等于一次都没验到东西。文件里既有的「按大纲序号补生成一页」那条就是先 `planOutline` 的。
2. **「没品牌」那条的断言不能只 grep `data-lumen-brand`。** 因为 `brandBlock` 只说有值的槽位，
   而 `brandOf` 对空项目返回 `{ name:'', tagline:'' }`——于是接线写成
   `brand: brandOf(project)`（忘了 `hasBrand`）时，品牌块里**一条 `data-lumen-brand` 都没有**，
   grep 那个属性的断言照样绿。要 grep **品牌块自己的首行**，那才是「块有没有被拼进去」的直接信号。

```ts
/**
 * **没品牌的项目，生成入口不许把品牌块拼进提示词。**
 *
 * 守的是接线时很容易犯的错：`brandOf` 现在永远返回一个 `BrandSlot`（渲染侧需要这样，
 * 清空品牌时才能把空壳槽位删掉），所以**不能**写 `brand: brandOf(project)`——
 * 那样没配品牌的项目也会拿到真值对象、品牌块被拼进去、模型在每页页眉留空槽位，
 * 等于把所有老项目的版式都改了。判断「有没有」要用 `hasBrand`。
 *
 * **断言 grep 品牌块自己的首行，不能只 grep `data-lumen-brand`**：`brandBlock` 只说有值的
 * 槽位，而空项目的 `brandOf` 给出的是 `{ name:'', tagline:'' }`——那种情况下块里一条
 * `data-lumen-brand` 都没有，只 grep 那个属性的断言会**在接线写错时照样绿**（实测）。
 */
test('没配品牌的项目，生成入口不会往提示词里塞品牌块', async () => {
  const project = makeProject();   // 五列全空
  planOutline(project.projectId, project.tenantId);
  const { gateway, seen } = fakeGateway([goodHtml()]);

  await generatePageHtmlAt(project.projectId, project.tenantId, project.ownerId, 0, gateway as never);

  const sent = seen[0]!.messages[0]!.content;
  assert.equal(sent.includes('这一本有品牌标识'), false, '没品牌就不该出现品牌块本身');
  assert.equal(sent.includes('data-lumen-brand'), false, '也不该出现任何槽位');
});

test('配了品牌的项目，生成入口会把品牌块拼进提示词', async () => {
  const project = makeProject();
  const { updateProject } = await import('./project.service.js');
  updateProject(project.projectId, project.tenantId, { brandName: '星图科技' });
  planOutline(project.projectId, project.tenantId);
  const { gateway, seen } = fakeGateway([goodHtml()]);

  await generatePageHtmlAt(project.projectId, project.tenantId, project.ownerId, 0, gateway as never);

  assert.ok(
    seen[0]!.messages[0]!.content.includes('data-lumen-brand="name"'),
    '配了品牌名就该给出名字槽位',
  );
});

/**
 * **三个入口都要接上品牌。**
 *
 * 三条路径各自调 `generatePageHtml`：整本的逐页循环、`regeneratePageHtmlInner`、
 * `generatePageHtmlAtInner`。**漏掉任何一处，那条路径生成的页面页眉就没有品牌。**
 * 实测过：只去掉整本那条的 `brand`，上面那两条用例**一条都不红**——它们只覆盖了
 * `generatePageHtmlAt`。所以下面两条各走一个入口，缺一不可。
 *
 * 前置条件三处不一样，别照抄：`runHtmlGeneration` **自己会** `planOutline`；
 * `regeneratePageHtml` 要一个**已存在的页面**，所以先跑一遍整本流。
 * 具体写法照文件里既有的整本/单页用例（`runHtmlGeneration` 有六处、`regeneratePageHtml` 两处）。
 */
test('整本生成那条路径也把品牌传下去', async () => {
  const project = makeProject();
  const { updateProject } = await import('./project.service.js');
  updateProject(project.projectId, project.tenantId, { brandName: '星图科技' });
  const { gateway, seen } = fakeGateway([goodHtml(), goodHtml(), goodHtml(), goodHtml(), goodHtml()]);

  for await (const _ of runHtmlGeneration({
    projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
    gateway: gateway as never,
  })) { /* 事件不看，看的是发出去的提示词 */ }

  assert.ok(seen.length > 0, '前置条件：确实调了模型');
  for (const [i, req] of seen.entries()) {
    assert.ok(
      req.messages[0]!.content.includes('这一本有品牌标识'),
      `整本流第 ${i + 1} 页的提示词里要有品牌块`,
    );
  }
});

test('单页重生成那条路径也把品牌传下去', async () => {
  const project = makeProject();
  const { updateProject, listPages } = await import('./project.service.js');
  const seed = fakeGateway([goodHtml(), goodHtml(), goodHtml(), goodHtml(), goodHtml()]);
  for await (const _ of runHtmlGeneration({
    projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
    gateway: seed.gateway as never,
  })) { /* 先造出页面来 */ }

  const pageId = listPages(project.projectId)[0]!.pageId;
  updateProject(project.projectId, project.tenantId, { brandName: '星图科技' });

  const { gateway, seen } = fakeGateway([goodHtml()]);
  await regeneratePageHtml(pageId, project.tenantId, project.ownerId, gateway as never);
  assert.ok(
    seen[0]!.messages[0]!.content.includes('这一本有品牌标识'),
    '单页重生成也要带品牌块',
  );
});
```

- [ ] **Step 2: 接线**

`generate-html.service.ts` 里 `generatePageHtml` 有**三个**调用点，三处都要把品牌传进去。
服务内部**已经**拿得到项目行，所以不用改路由、也不会漏在调用方：

| 调用点 | 项目行从哪来 |
|---|---|
| `:517`（`runHtmlGenerationInner` 的逐页循环） | `:425` 已经取了 `project`，**在循环之前算一次**再复用 |
| `:641`（`regeneratePageHtmlInner`） | 只有页面行 `row`，要 `requireProject(row.projectId, tenantId)` 取一次 |
| `:700`（`generatePageHtmlAtInner`） | 同样取一次 |

三处都写：

```ts
        // 没有品牌就**必须**给 undefined：`brandOf` 永远返回真值，直接用它会把品牌块
        // 塞进每一个老项目的提示词里
        brand: hasBrand(project) ? brandOf(project) : undefined,
```

`:517` 那处在循环外算一次存成局部变量（每页重复 `requireProject` 是白花的查询）。

顶部 import 从 `@lumen/ir-schema` 加 `brandOf, hasBrand`。

- [ ] **Step 3: 跑测试，确认通过**

Run: `cd packages/server-core && node --import tsx --test src/services/generate-html.test.ts`

Expected: PASS，`fail 0`（Task 6 的用例一条都不许红）。

- [ ] **Step 4: 提交**

```bash
git add packages/server-core/src/services/generate-html.service.ts \
        packages/server-core/src/services/generate-html.test.ts
git commit -m "feat(brand): 生成入口把项目品牌传进提示词"
```

---

## Task 7: 把品牌一路传到渲染层

**Files:**
- Modify: `apps/web/src/components/HtmlMock.tsx`
- Modify: `apps/web/src/workbench/CenterCanvas.tsx`、`apps/web/src/components/Presenter.tsx`
- Modify: `apps/worker/src/render.tsx`
- Modify: `apps/worker/src/handlers/export-pptx.tsx`、`export-pdf.tsx`、单文件导出 handler
- Test: `apps/worker/src/render.test.ts`

- [ ] **Step 1: 写失败的测试**

在 `apps/worker/src/render.test.ts` 末尾追加：

```ts
/* ---------------- 品牌 ---------------- */

const BRAND_SVG = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="currentColor"/></svg>';

test('导出时品牌槽位被填掉，成品里不留 data-lumen-brand', () => {
  const page = htmlPage({
    html: '<style>.b{width:34px}</style><div class="brandbar">'
      + '<span class="b" data-lumen-brand="logo"></span>'
      + '<span data-lumen-brand="name"></span>'
      + '</div><h1>标题</h1><p>正文</p>',
  });
  const out = pageMarkup(page, PACK, DOC, { svg: BRAND_SVG, name: '星图科技', tagline: '' });
  const srcdoc = (/srcdoc="([^"]*)"/.exec(out)?.[1] ?? '')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

  assert.ok(
    srcdoc.includes('<img src="data:image/svg+xml;charset=utf-8,'),
    'logo 要以 data: 图片的形式进导出稿',
  );
  // 这条是安全边界，不是外观偏好：内联进导出页的 SVG 过的是 HTML 解析器
  // （`<desc>` 是集成点、`<img>`/`<meta>` 是跳出元素），一整类 payload 能借此落进成品。
  // 当图片加载则脚本与外部子资源一律不生效。改回内联会让这条转红。
  assert.equal(srcdoc.includes('<svg'), false, '导出稿里不许出现内联的 <svg>');
  // 同样只解 logo 那条 data URL：稿里注入了 `color-mix(… 8%, …)`，对整份文档
  // `decodeURIComponent` 会抛 `URIError`（裸 `%` 后面是逗号，不是合法转义）
  const logoUrl = /src="data:image\/svg\+xml;charset=utf-8,([^"]+)"/.exec(srcdoc);
  assert.ok(logoUrl, `logo 应以 data 图片形态进导出稿，实际：${srcdoc.slice(0, 300)})`);
  assert.equal(
    decodeURIComponent(logoUrl[1]!).includes('currentColor'), false,
    '单色稿的 currentColor 要烘成品牌色——图片里的 SVG 继承不到外面的 --brand',
  );
  assert.ok(srcdoc.includes('星图科技'), '品牌名要进导出稿');
  assert.equal(srcdoc.includes('data-lumen-brand'), false, '槽位必须填掉，不能漏到成品里');
});

/**
 * 不传品牌时，**片段里的槽位一个字都不动**。
 *
 * 注意：这条原来是 `assert.match(out, /^<div class="lumen-pagebox">/)`——那个断言
 * **什么也没验**：实测「普通页不传品牌」「带槽位页不传品牌」「带槽位页**传了品牌**」
 * 三种情况它**全都通过**，区分不出「与改动前一致」。它守的只是「不传品牌不炸、
 * 仍走 iframe 分支」。
 *
 * 真正该守的契约是「没有品牌时槽位原样留着（不删、不填）」——`brandOf` 现在永远返回
 * 一个 `BrandSlot`，所以只有**调用方显式不传** `brand` 时才走这条分支，
 * 而样式库样机（`HtmlMock` 不传 brand）正是这种情况。一句话就能钉住，而且真的会红。
 */
test('不传品牌时，片段里的槽位原样留着', () => {
  const page = htmlPage({
    html: '<div class="brandbar">'
      + '<span class="brand-mark" data-lumen-brand="logo"></span>'
      + '<span data-lumen-brand="name"></span>'
      + '</div><h1>标题</h1>',
  });
  const out = pageMarkup(page, PACK, DOC);
  const srcdoc = (/srcdoc="([^"]*)"/.exec(out)?.[1] ?? '')
    .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');

  assert.match(out, /^<div class="lumen-pagebox">/, '不传品牌仍走 iframe 分支');
  assert.ok(srcdoc.includes('data-lumen-brand="logo"'), '槽位属性要原样留着，不能被填掉或删掉');
  assert.ok(srcdoc.includes('data-lumen-brand="name"'));
});
```

- [ ] **Step 2: 跑测试，确认失败**

Run: `cd apps/worker && node --import tsx --test src/render.test.ts`

Expected: FAIL —— **运行时断言失败**（`AssertionError`），**不是 TS 报错**：
`node --import tsx --test` 只剥类型、不做类型检查（类型由 `pnpm -r typecheck` 管）。
照「TS 报错」去核对会以为失败得不对。

- [ ] **Step 3: `pageMarkup` 加第四个参数**

`apps/worker/src/render.tsx:70`：

```ts
export function pageMarkup(
  page: PageIR,
  pack: StylePack,
  doc: StyleDoc | null,
  /** 项目品牌。不传就是「没有品牌」 */
  brand?: BrandSlot,
): string {
```

同函数里 `buildPageDocument`（:75）的 options 加一行：

```ts
      ...(brand ? { brand } : {}),
```

顶部 import 加 `import type { BrandSlot } from '@lumen/ir-schema';`。

- [ ] **Step 4: 三个装配函数各加一个参数**

`buildSinglePageHtml`（:313-318）：

```ts
export async function buildSinglePageHtml(
  page: PageIR,
  pack: StylePack,
  readFile: (key: string) => Promise<Buffer>,
  doc?: StyleDoc | null,
  brand?: BrandSlot,
): Promise<string> {
```

函数体里 `pageMarkup(page, pack, doc ?? null)`（:330）改成 `pageMarkup(page, pack, doc ?? null, brand)`。

`buildSelfContainedHtml` 的 `SelfContainedHtmlInput` 加 `brand?: BrandSlot;`，
:276 的 `pageMarkup(page, input.pack, input.doc ?? null)` 改成
`pageMarkup(page, input.pack, input.doc ?? null, input.brand)`。

`apps/worker/src/handlers/export-pdf.tsx:28-35` 的 `buildPrintHtml` 入参加 `brand?: BrandSlot;`，
:37 的调用同样补上第四个实参。

- [ ] **Step 5: 三个导出 handler 把项目的品牌传下去**

三个 handler 里都已经有 `project`（`requireProject(job.projectId, job.tenantId)`），
各自在调用装配函数时加一个参数：

```ts
const brand = brandOf(project);
```

- `apps/worker/src/handlers/export-pptx.tsx:279`：
  `await buildSinglePageHtml(page, pack, (key) => ctx.storage.get(key), docForProject(project.styleId), brand)`
- `apps/worker/src/handlers/export-pdf.tsx`：`buildPrintHtml({ …, brand })`
- `apps/worker/src/handlers/export-html.tsx:28`：`buildSelfContainedHtml({ …, brand })`

顶部 import 加 `import { brandOf } from '@lumen/ir-schema';`。

- [ ] **Step 6: `HtmlMock` 加可选 `brand`**

`apps/web/src/components/HtmlMock.tsx` 的 props 加：

```ts
  /**
   * 项目品牌。只有工作台画布与演示态会传——风格库样机、项目缩略图那些没有项目，
   * 不传就是「没有品牌」，行为不变。
   */
  brand?: BrandSlot;
```

`useMemo` 里（:72）的 `buildPageDocument` options 加 `...(brand ? { brand } : {})`，
依赖数组（:75）末尾加 `brand`。

注意：**别漏了解构参数**：`HtmlMock` 的形参是一长串解构（`doc, html, width, images, …`），
只在 props 类型里加 `brand` 是不够的——函数体里用 `brand` 会报
`TS2304: Cannot find name 'brand'`。**不加默认值**（`brand = null` 会与
`brand?: BrandSlot` 冲突）。

- [ ] **Step 6b: `ProjectSummary` 补上那五列**

`apps/web/src/api/types.ts` 的 `ProjectSummary` **没有**那五个品牌列，所以
`brandOf(project)` 在 `CenterCanvas` 与 `Present.tsx` 两处都过不了类型检查
（`Type 'ProjectSummary' is missing … brandLogoImage, brandLogoSvg, brandLogoMode, brandName, brandTagline`）。

接口**确实**回这五列（`withProgress` 是 `{ ...row, … }`），是前端类型少写了。让它继承：

```ts
export interface ProjectSummary extends BrandFields {
```

**别重抄那五个字段**——重抄会多一处会漂的定义。这也是 Task 8 的前置：
`LeftRail.tsx` 同样要 `brandOf(project)`，不修这个它一样编不过。

顶部 import 加 `import type { BrandSlot } from '@lumen/ir-schema';`。

- [ ] **Step 7: 工作台与演示态传品牌**

两处的取数方式不一样，**不要照抄**：

**`apps/web/src/workbench/CenterCanvas.tsx`** 订阅了 store，但 :50 的解构里没有 `project`。
先把它加进去：

```ts
const { pages, statuses, activeIndex, outline, generating, styleId, project } = useWorkbench();
```

再把 :201 的 `<HtmlMock …>` 加一个 prop：

```tsx
brand={brand}
```

其中 `brand` 在组件里这样算：

```tsx
// **要 `useMemo` 包一层。** `brandOf(project)` 每次渲染都返回新对象，而 `HtmlMock` 的
// `useMemo` 依赖里有 `brand`——直接传字面量会把那个 useMemo 打穿、每次渲染重算 srcDoc。
// `store.project` 是稳定引用（来自查询结果，不是每次渲染新建），所以 `[project]` 够用。
//
// 实测过重算不会让 iframe 反复重载（`staggerSeed` 是 `activeIndex`，确定性，
// 重算出来的 srcDoc 字符串与上次相同，React 按值比较不会重设属性）——所以这是白算一次的
// 性能问题，不是正确性问题。但那个文件自己的注释写着「数组每次渲染都是新的……
// 把 useMemo 打穿、iframe 反复重载」，同类坑踩过一次就够了。
const brand = useMemo(() => (project ? brandOf(project) : undefined), [project]);
```

**`apps/web/src/components/Presenter.tsx` 不订阅 store**——它全靠 props
（`pages` / `pack` / `styleDoc` / `theme` / `title` / `onExit`，见 :18-30）。所以走 prop：

1. `PresenterProps`（:18）加：

```ts
  /** 项目品牌。没有品牌的项目传 undefined */
  brand?: BrandSlot;
```

2. `Presenter` 的解构参数里加 `brand`，:264 的 `<HtmlMock …>` 加 `brand={brand}`。

3. `apps/web/src/pages/Present.tsx:59` 的 `<Presenter …>` 加一行——该文件 :14-17 已经有
   `detail` 这个 `useQuery`，直接用它：

```tsx
brand={brandOf(detail.data.project)}
```

（上面已经 `if (!detail.data) return …`，TS 也窄化过了，所以**不要**再写
`detail.data ? … : undefined`——那是死代码。）
```

两处都要 `import { brandOf } from '@lumen/ir-schema';`（`Presenter` 还要
`import type { BrandSlot } from '@lumen/ir-schema';`）。

- [ ] **Step 8: 跑测试，确认通过**

Run: `cd apps/worker && node --import tsx --test src/render.test.ts`

Expected: PASS。

- [ ] **Step 8b: 补一条 `export-html` 的接线用例，并把覆盖边界写下来**

上面那条用例**直接调 `pageMarkup`**，所以它只钉住了 `pageMarkup` 那一层。实测（逐处变异）：

| 链路 | 去掉 `brand` 会转红吗 |
|---|---|
| `pageMarkup` 内部的 `...(brand ? { brand } : {})` | 会红 |
| `slotValue('logo')` 的 data URL / 烘色 | 会红 |
| `buildSelfContainedHtml` 的转发 | 会红（补了下述用例之后） |
| `export-html` handler 里 `brandOf(project)` | 会红（同上） |
| `buildPrintHtml` / `buildSinglePageHtml` 两处转发 | 不红 |
| `export-pdf` / `export-pptx` 两个 handler 里 `brandOf(project)` | 不红 |
| web 侧 `HtmlMock` / `CenterCanvas` / `Present` / `Presenter` | 无测试可红（`apps/web` 只有 `step-progress.test.ts`） |

**补 `export-html` 那一跳**——它便宜且干净，不需要浏览器：`exportHtml` 只调
`buildSelfContainedHtml` + `ctx.storage.put`。`apps/worker/src/worker.test.ts` 里现成的脚手架
（`freshDb()` 真 SQLite、`makeTask`、`createWorkerContext`、临时 `LUMEN_DATA_DIR`）就够。
用 `createExport(projectId, tenantId, 'html')`（`packages/server-core/src/services/export.service.ts:71`）
造一条导出 job；给项目配品牌；`await exportHtml(task, ctx)`；从 storage 读回产物断言
「有 `data:image/svg+xml`、有品牌名、没有 `data-lumen-brand`」。加完做变异确认它真的会红。

**三个前置条件，少一个就卡住或假通过：**

1. **项目必须先挂上一份风格文档。** `docForProject` 找不到就返回 `null`，而 `pageMarkup`
   在 `doc` 为 `null` 时**退回旧渲染路径，根本不碰品牌槽位**。补法：`saveStyleDoc(doc)`
   之后把项目的 `styleId` 设成返回的 `saved.styleId`。
   注意：**更危险的是方向**：`doc` 为 null 时，**反向断言**（「产物里没有内联 `<svg>`」
   「没有 `data-lumen-brand`」）会**假通过**——一条看着在守接线、实际一次都没验到的用例。
   所以断言里**必须有正向的那条**（「logo 要以 data 图片形态进产物」）。
2. **`saveStyleDoc` 会拒绝一份没有任何非空提示词的风格文档**（`hasAnyPrompt` 为假就 `ok: false`），
   所以最小可用的 doc 至少带一条 `pagePrompts` 且 `prompt` 非空。
3. **页面 `status` 默认是 `pending`，而 `createExport` 要求全部页就绪**——用例里要显式写
   `status: 'ready'`。

**`buildPrintHtml` / `buildSinglePageHtml` 两处转发与 PDF·PPTX 两个 handler 故意不盖**：
中间那两处转发**并不贵**（直接调装配函数多传一个 `brand` 就行，不用浏览器），但**只盖它们
买的是覆盖率的错觉**——「漏了接线」这个风险恰恰在 handler 那一层，而那层要盖只能真起
Chromium（慢、CI 里脆；`worker.test.ts` 开头就明写「PDF / PPTX 的浏览器链路没有自动化覆盖」，
那是有意的取舍）。**这条链路整条由 Task 9 的浏览器实测守着**
（「导出一份 PPTX 与一份 PDF → 打开确认页眉里的 logo 在」）——手工实测走的是**完整链路、
含 handler**，比给转发补一条单测更有力。不是没人管，是换了手段。

**这张表要写进测试文件的注释里**，免得将来有人以为「有一条品牌用例就够了」。
另外把一处容易骗过做变异的人的细节也写上：**「把 `slotValue` 改回内联 SVG 会红」证明不了
`<svg` 那条断言**——那时用例会**在前一条**（data 图片）就红，`<svg` 那条根本没轮到执行。
要单独验它，得让 `slotValue` **同时**吐出 data 图片与内联 SVG（两道闸是独立的）。

- [ ] **Step 9: 全仓类型检查**

Run: `pnpm -r typecheck`

Expected: 全部 Done，没有 TS 错。

- [ ] **Step 10: 提交**

```bash
git add apps/worker/src/render.tsx apps/worker/src/handlers/export-pptx.tsx \
        apps/worker/src/handlers/export-pdf.tsx apps/worker/src/handlers/export-html.tsx \
        apps/worker/src/render.test.ts \
        apps/web/src/components/HtmlMock.tsx apps/web/src/workbench/CenterCanvas.tsx \
        apps/web/src/components/Presenter.tsx apps/web/src/pages/Present.tsx \
        apps/web/src/api/types.ts
git commit -m "feat(brand): 编辑器、演示与三条导出链路传品牌"
```

注意：**清单必须与上面要改的文件一致。** 早先这版只列了 7 个，漏了 `export-html.tsx`
（单文件 HTML 导出的接线）与 `Present.tsx`（演示态的接线）——照那个清单提交，
**这两条链路的品牌接线会漏在提交外面，而类型检查不会报**（`brand` 是可选参数）。

---

## Task 8: 左栏的品牌一块

**Files:**
- Modify: `apps/web/src/workbench/LeftRail.tsx`
- Modify: `apps/web/src/workbench/RightRail.tsx`（只给 `fileToDataUrl` 加一个 `export`）

前端没有组件测试（`apps/web` 只有 `step-progress.test.ts`），这一块靠浏览器实测，见 Task 9。

- [ ] **Step 1: 加品牌状态与上传逻辑**

`apps/web/src/workbench/LeftRail.tsx` 的 `BriefPanel` 里，`depth` 那个 state 之后加：

```tsx
  const [brandBusy, setBrandBusy] = useState(false);
  /**
   * 重绘失败的**原因**，要一直留在面板上。
   *
   * 只丢给 `toast.error` 是不够的：toast 几秒后自己消失，用户回头想再看一眼「到底为什么没成」
   * 就没有了，只能凭记忆。设计文档 §五 那张表里「重绘失败」那一格写的是
   * 「原图缩略图 + **失败原因** + 重试、就用原图」——原因是要占面板一格的东西。
   */
  const [brandError, setBrandError] = useState('');
  /**
   * 品牌名与标语**各有自己的本地 state**，显示值不绕服务端来回。
   *
   * 上一版把 `value` 直接绑在 `project.brandName` 上、每次按键都 PATCH + invalidate，
   * 于是每次按键也发一次 GET；这些 GET 与 PATCH 互相重叠，**一个带着旧值的 GET 完全可能
   * 最后落地**，把用户正在打的字回退掉。实测（40ms/字打「星图科技」）输入框只剩「星技」，
   * 而且**落库的也是「星技」**——不是显示问题，刷新也回不来。
   */
  const [brandName, setBrandName] = useState(project?.brandName ?? '');
  const [brandTagline, setBrandTagline] = useState(project?.brandTagline ?? '');
```

（**不要**在这里算一个 `brand` 变量。这块 UI 直接读 `project.brandLogoSvg` /
`project.brandLogoMode` / `project?.brandName` 这些列，`brandOf` 是渲染侧
`buildPageDocument` 用的形状，这里用不上——加了就是一个没人引用的死变量，
而本仓没开 `noUnusedLocals`、也没有 ESLint，它不会报错。）

`saveAndPlan` 之前加两个动作：

```tsx
  /** 上传原图 → 落对象存储 → 立刻重绘。两段都在同一个 loading 里，用户看到的是一次等待 */
  const uploadLogo = async (file: File) => {
    setBrandBusy(true);
    setBrandError('');
    let key: string;
    try {
      const dataUrl = await fileToDataUrl(file);
      ({ key } = await api.post<{ key: string }>('/uploads', { dataUrl, name: file.name, projectId }));
    } catch (err) {
      // 上传这一跳自己也会失败（图太大、格式不收、网络断了），报错要说「上传」而不是「重绘」
      setBrandBusy(false);
      setBrandError((err as Error).message);
      toast.error('logo 上传失败', (err as Error).message);
      return;
    }
    await runRedraw(key); // 它自己管 brandBusy 与报错
  };

  /**
   * 跑一次重绘。上传与「重试」共用——两条路只差 `imageKey` 从哪来。
   *
   * 为什么要单独抽出来：重绘失败**多半是瞬时的**（模型超时、网关抖一下），而上一版只有
   * 「换一张」能重来，它要求用户把同一个文件再选一遍。设计文档 §五 那张表里
   * 「重绘失败」那一格明写了「重试」，就是指用**同一张原图**再跑一次。
   */
  const runRedraw = async (imageKey: string) => {
    setBrandBusy(true);
    setBrandError('');
    try {
      await api.post(`/projects/${projectId}/brand/redraw`, { imageKey });
      await qc.invalidateQueries({ queryKey: ['project', projectId] });
      toast.success('logo 已重绘');
    } catch (err) {
      await qc.invalidateQueries({ queryKey: ['project', projectId] });
      // 原因**两处都要给**：toast 是当场的反馈，state 是留在面板上的那一份
      setBrandError((err as Error).message);
      toast.error('logo 重绘失败', (err as Error).message);
    } finally {
      setBrandBusy(false);
    }
  };

  const setBrandMode = (mode: '' | 'redraw' | 'original') =>
    api.patch(`/projects/${projectId}`, { brandLogoMode: mode })
      .then(() => qc.invalidateQueries({ queryKey: ['project', projectId] }))
      .catch((err: Error) => toast.error('切换失败', err.message));

  const clearLogo = () =>
    api.del(`/projects/${projectId}/brand`)
      .then(() => qc.invalidateQueries({ queryKey: ['project', projectId] }))
      .catch((err: Error) => toast.error('移除失败', err.message));
```

品牌名与标语的**防抖落库**，加在 `clearLogo` 之后：

```tsx
  /**
   * 品牌名 / 标语：**本地立刻显示，停顿 400ms 才落库**。
   *
   * 为什么显示值必须走本地 state：上面那两个 state 的注释里记了实测——`value` 绑服务端
   * 回来的值、而每次按键都 `invalidateQueries`，一次带着旧值的 GET 就能把正在打的字回退掉。
   *
   * 为什么是 400ms 而不是 onBlur：这两个字段要的是「不用点保存」，而 onBlur 在用户打完字
   * 直接关标签页时会丢。400ms 是「打完一个词就存」的手感。
   *
   * **不要**给这两个字段设 `dirtyRef`。那个 ref 是给**没有立刻落库**的
   * brief / title / 页数 / 深度 用的（上面那个 `useEffect` 拿它挡回填）；
   * 品牌这两项每次打字都会落库，占着它有两个坏处：左栏一直显示「未保存」，
   * 以及把那个 `useEffect` 的同步一起挡掉——`dirtyRef` 是共用的，一个字段不该管另一个的。
   */
  const brandTimers = useRef<{ name?: ReturnType<typeof setTimeout>; tagline?: ReturnType<typeof setTimeout> }>({});
  const brandEditing = useRef({ name: false, tagline: false });

  const saveBrand = (which: 'name' | 'tagline', value: string) => {
    brandEditing.current[which] = true;
    const timer = brandTimers.current[which];
    if (timer) clearTimeout(timer);
    brandTimers.current[which] = setTimeout(() => {
      brandEditing.current[which] = false;
      const body = which === 'name' ? { brandName: value } : { brandTagline: value };
      void api.patch(`/projects/${projectId}`, body)
        .then(() => qc.invalidateQueries({ queryKey: ['project', projectId] }))
        .catch((err: Error) => toast.error('品牌信息保存失败', err.message));
    }, 400);
  };

  // 服务端回来的值只在「用户没在打这个字段」时回填
  useEffect(() => {
    if (!brandEditing.current.name) setBrandName(project?.brandName ?? '');
  }, [project?.brandName]);
  useEffect(() => {
    if (!brandEditing.current.tagline) setBrandTagline(project?.brandTagline ?? '');
  }, [project?.brandTagline]);
```

**`fileToDataUrl` 不在这个文件里**——它在 `apps/web/src/workbench/RightRail.tsx:853`，
是个模块内私有函数。把它**加上 `export`**（那个文件底部本来就有 `export { IconButton }`，
跨文件导出这个文件里的工具是既有做法），然后 `LeftRail.tsx` 从 `'./RightRail.js'` import。
**不要**在 `LeftRail` 里再抄一份。

`BriefPanel` 里还要拿到品牌色（预览重绘稿要用）：

```tsx
  const styleId = useWorkbench((s) => s.styleId);
  const styleDoc = useStyleDoc(styleId);
  // 拿不到风格文档就退回黑色。**这通常是「还没加载完」的瞬时状态**（`useStyleDoc`
  // 是个查询），加载完会自己变对，所以不必为此在界面上加提示——加了反而是一闪而过的噪音。
  const brandColor = styleDoc.data?.palette.brand ?? '#000';
```

`useStyleDoc` 从 `'../api/hooks.js'` import（`CenterCanvas` 就是这么拿 doc 的）。

- [ ] **Step 2: 画那一块**

在「深度」那一块（:296-309）之后、「保存并生成」之前插入：

**只用这个仓里确实有的原语**：`Button`（`variant` 取 `primary|secondary|ghost|danger|accent|violet`，
`size` 取 `sm|md|lg`）、`Input`。**`@lumen/ui` 里没有 `Spinner`，`Button` 也不支持 `asChild`**——
所以「转圈」用 `animate-pulse` 的文字，「换一张」用包着隐藏 `<input type="file">` 的 `<label>`。

注意：**背景色用 `--surface-1`，不是 `--surface-2`。** 后者在**任何源码 CSS 里都没有定义**
（`themes.css` 只有 `--surface-0` / `--surface-1` / `--surface-elevated` / `--surface-glass` /
`--surface-glass-border`），用了它背景会**静默落空、只剩边框**——不报错、不警告，只是看着不对。
这个仓里同类的面板底色都是 `--surface-1`（`RightRail.tsx:291` 的图位就是）。
（`apps/web/src/pages/StockLibrary.tsx:36` 也用了 `--surface-2`，但**那里是另一回事、不要去改**：
它是透明底抠图的棋盘格垫底色，落空成透明之后露出来的是卡片自己的白底，而「浅色格」本来
要的就是卡片底色，棋盘格照样读得出来。左边这块是整个容器该有底而没有底，性质不同。）

```tsx
      <div className="flex flex-col gap-1.5">
        <span className="text-[12px] text-[var(--text-3)]">品牌 logo（可选）</span>

        {brandBusy ? (
          <div className="flex h-[54px] animate-pulse items-center justify-center rounded-[var(--radius-inner)] border border-[var(--border)] bg-[var(--surface-1)] text-[11px] text-[var(--text-3)]">
            正在重绘…
          </div>
        ) : project?.brandLogoImage ? (
          <div className="flex flex-col gap-1.5">
            <div className="flex h-[54px] items-center justify-center gap-3 rounded-[var(--radius-inner)] border border-[var(--border)] bg-[var(--surface-1)]">
              {/* 原图与重绘稿并排，让用户看得出模型重画成了什么样 */}
              <img src={`/files/${project.brandLogoImage}`} alt="原图"
                className="max-h-[38px] max-w-[38px] object-contain" />
              {project.brandLogoSvg && (
                <>
                  <span className="text-[10px] text-[var(--text-3)]">→</span>
                  {/*
                    重绘稿走 `brandLogoDataUrl`，**不要在这里手搓 data URL**。
                    那个函数是「补 xmlns + 烘品牌色 + 色值兜底」三件事的合集，漏掉任何一件都是
                    静默失效：缺 xmlns 整张图加载不出来，缺烘色单色稿就是黑的。
                    上一版这里就是手搓的，手搓出来的是没烘色、也没补 xmlns 的那一份——
                    面板里黑着、页面上是品牌色，两种表现不一致会被当成 bug 报上来。

                    `brandColor` 取当前风格文档的 `palette.brand`——这个组件里用
                    `useStyleDoc(styleId)`（`apps/web/src/api/hooks.ts:12`）拿，
                    `CenterCanvas` 就是这么拿到 `doc` 的（那边是 `styleDoc.data`）。
                    确实取不到就退回 `'#000'`（通常是风格文档还没加载完，加载完会自己变对）。
                  */}
                  <img src={brandLogoDataUrl(project.brandLogoSvg, brandColor)}
                    alt="重绘稿" className="max-h-[38px] max-w-[38px] object-contain" />
                </>
              )}
            </div>

            {project.brandLogoSvg ? (
              <div className="flex gap-1.5">
                <Button size="sm" variant={project.brandLogoMode === 'redraw' ? 'primary' : 'secondary'}
                  onClick={() => void setBrandMode('redraw')}>用重绘稿</Button>
                <Button size="sm" variant={project.brandLogoMode === 'original' ? 'primary' : 'secondary'}
                  onClick={() => void setBrandMode('original')}>用原图</Button>
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <span className="text-[11px] text-[var(--warning)]">重绘没成，现在用的是原图</span>
                {/*
                  原因要**一直留在面板上**。只给 toast 是不够的：它几秒后自己消失，
                  用户回头想再看一眼「到底为什么没成」就没有了，只能凭记忆。
                */}
                {brandError && (
                  <span className="text-[11px] leading-[1.5] text-[var(--text-3)]">{brandError}</span>
                )}
                {/*
                  「重试」用**同一张原图**再跑一次。没有它的话用户只能「换一张」——
                  那要把同一个文件再选一遍，而且会换掉对象存储里的 key。
                  重绘失败多半是瞬时的（模型超时、网关抖一下），值得给一个一键重来。
                */}
                <Button size="sm" variant="secondary"
                  onClick={() => void runRedraw(project.brandLogoImage)}>重试</Button>
              </div>
            )}

            <div className="flex gap-1.5">
              <label className="flex-1 cursor-pointer rounded-[var(--radius-inner)] border border-[var(--border)] px-3 py-1.5 text-center text-[12px] text-[var(--text-2)] hover:bg-[var(--surface-1)]">
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); }} />
                换一张
              </label>
              <Button size="sm" variant="ghost" onClick={() => void clearLogo()}>移除</Button>
            </div>
          </div>
        ) : (
          <label className="flex h-[54px] cursor-pointer items-center justify-center rounded-[var(--radius-inner)] border border-dashed border-[var(--border)] text-[11px] text-[var(--text-3)] hover:bg-[var(--surface-1)]">
            <input type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); }} />
            点这里选图，或拖进来
          </label>
        )}

        <Input
          value={brandName}
          aria-label="品牌名"
          placeholder="品牌名（可选）"
          onChange={(e) => { setBrandName(e.target.value); saveBrand('name', e.target.value); }}
        />
        <Input
          value={brandTagline}
          aria-label="标语"
          placeholder="标语（可选）"
          onChange={(e) => { setBrandTagline(e.target.value); saveBrand('tagline', e.target.value); }}
        />
      </div>
```

**重绘失败那一格是照设计文档补的。** 上一版这里是「原图 + 一句『重绘没成，现在用的是原图』
+ 换一张 + 移除」，原因是只丢给了 `toast.error`。设计文档 §五 那张表写的是
「原图缩略图 + **失败原因** + **重试**、就用原图」，计划当时没跟上——实现跟的是计划，
所以两边都得改：计划补这一节，实现补 `brandError` 与「重试」。
「就用原图」那一项不必单独给按钮：重绘没成时服务端已经把模式退回 `original` 了，
面板上那句「现在用的是原图」说的就是它。

**注意**：两个输入框是「边打边存」——**不用点保存**，但值由**本地 state** 持有，
服务端只负责收（`saveBrand`，400ms 防抖）。**不要**把它们接进 `save` mutation——
那会把「保存并生成」变成唯一入口，用户改个名字还得点一次生成。

注意：**「边打边存为什么会丢字」——这一节是被实测推翻后重写的，别再改回去。**

初版写的是「`value` 直接绑 `project.brandName`，每次 `onChange` 立刻 PATCH + `invalidateQueries`」，
理由写的是「服务端存的就是刚打进去的那个字，所以打字不会丢字」。**那个理由是错的**：
它默认了「打完字 → 落库 → 回填」是一条串行链，而实际上每次按键都会发一次 GET，
这些 GET 与 PATCH 互相重叠，**一个带着旧值的 GET 完全可能最后落地**。

浏览器实测（真 Chromium，localhost，逐字打「星图科技」）：

| 打字间隔 | 输入框最终显示 | 库里最终值 |
|---|---|---|
| 40ms/字 | `星技` | `星技` |
| 300ms/字 | `星图科技` | `星图科技` |

**注意第二列不是「显示问题」——落库的就是那个错值**，用户刷新也回不来。40ms/字是
本地 RTT≈1ms 下的阈值；线上 RTT 一大，这个窗口等比变宽，正常手速也会撞上。

同一个改动还带出第二个毛病：给这两个字段设 `dirtyRef.current = true`（那本来是
给没有立刻落库的 brief/title/页数/深度 挡回填用的），结果**打一个字左栏就挂上「未保存」**
（渲染「未保存」的是 `dirtyRef.current && <span className="text-[var(--warning)]">未保存</span>`
那一行——**这里不写行号**：Task 8 一加进来它就从 `:299` 漂到了 `:347`，grep 那串 JSX 才找得准），
而且 `dirtyRef`
是共用的，它会把上面那个 `useEffect` 对 brief/页数/深度的同步一起挡掉。实测：打完品牌名后
左栏一直显示「未保存」，而那时品牌名其实早就落库了。所以修复里把它一起去掉。

- [ ] **Step 3: 补 import**

`LeftRail.tsx` 顶部确认有 `useState`、`useQueryClient`、`useToast`、`api`、`Input`、`Button`。
新增 `brandLogoDataUrl`（`@lumen/ir-schema`）——**只要这一个**，这块 UI 不需要 `brandOf`
（它直接读 `project` 的五个品牌列）。**不要 import `Spinner`——`@lumen/ui` 里没有这个组件。**

- [ ] **Step 4: 类型检查**

Run: `pnpm --filter @lumen/web typecheck`

Expected: Done，没有 TS 错。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/workbench/LeftRail.tsx apps/web/src/workbench/RightRail.tsx
git commit -m "feat(brand): 项目需求左栏加品牌一块"
```

---

## Task 9: 全量验证与浏览器实测

**Files:** 无改动（除非实测发现问题）

- [ ] **Step 1: 全量测试与构建**

```bash
pnpm -r typecheck
pnpm -r test
pnpm build
```

Expected: 全部通过，0 失败。

- [ ] **Step 2: 浏览器实测主路径**

在 `lumen-dev`（http://localhost:5273）里：

1. 打开一个项目 → 「项目需求」tab → 左栏出现「品牌 logo（可选）」虚线框
2. 传一张**带白底的彩色 logo** → 转圈十几秒 → 出现「原图 → 重绘稿」并排
3. 确认重绘稿里**没有白底**、颜色与原图一致
4. 填品牌名与标语
5. 重新生成一页 → 打开看页眉：真 logo + 真名字，**没有「品牌名称占位」**

- [ ] **Step 3: 浏览器实测单色 logo**

传一张**黑白 logo** → 确认页面上的 logo 是这套风格的 `--brand` 色，换一套风格会跟着变色。
（机制是渲染时把稿里的 `currentColor` 烘成 `palette.brand` 再当图片塞进去，不是靠 CSS 继承。）

- [ ] **Step 3b: 验收那条安全边界**

`Step 3b` 存在的理由：这一版把 logo 从「内联 SVG」改成「data 图片」，就是为了关掉一整类
绕过，所以必须在**真的页面上**确认它关上了，而不是只看单测。

1. 把一段 `on*=payload`（例如 `<svg viewBox="0 0 10 10" onload="window.__pwned=1">…`）当重绘稿
   直接写进库（`pnpm admin:show` 拿到的库路径，或用一段临时脚本调 `updateProject`）；
2. 打开那一页，在控制台看 `window.__pwned`——**必须是 undefined**；
3. 同时确认这一页的 logo 仍然正常显示（data URL 通过校验、尺寸对）。

- [ ] **Step 4: 浏览器实测降级**

1. 把 `logo_redraw` 路由在管理后台指向内置 Mock → 回项目再传一张图
2. 确认面板报「重绘失败」且出现「用原图」
3. 点「用原图」→ 重新生成一页 → 页眉显示的是上传的原图

- [ ] **Step 5: 浏览器实测导出**

导出一份 PPTX 与一份 PDF → 打开确认页眉里的 logo 在（导出走的是渲染后截图，
SVG 天然可用）。

- [ ] **Step 6: 回归**

打开一个**没传 logo** 的项目 → 重新生成一页 → 结果与改动前逐字一致
（页眉仍是模型自己画的占位图形 + 占位文字）。

- [ ] **Step 7: 提交实测中发现的修复**

**不要用 `git add -A`**，按文件名逐个加（这个仓里同时可能有别的会话在动别的文件，
一个 `-A` 会把不属于本次的东西一起带走）：

```bash
git add <实测中改过的具体文件…>
git commit -m "fix(brand): 实测中发现的修正"
```

没有改动就跳过这一步，不要造空提交。

---

## 自查记录

**Spec 覆盖：**

| 设计文档章节 | 对应任务 |
|---|---|
| 一、数据模型（迁移 009 + 五列） | Task 1 |
| 二、重绘服务 + `logo_redraw` 任务类型 + SVG 校验 | Task 3、Task 4 |
| 二、三条路由 | Task 5 |
| 三、槽位协议（`data-lumen-brand` + `fillBrandSlots` + `brandOf`） | Task 2 |
| 三、调用方接线 | Task 7 |
| 四、提示词 `brandBlock` | Task 6、**Task 6b（接线）** |
| 五、界面 | Task 8 |
| 六、降级 | Task 4（失败保留原图）、Task 2（漏写槽位）、Task 6（没品牌不注入） |
| 七、导出 | Task 7、Task 9 |
| 验证 | Task 9 |

**类型一致性：** `BrandSlot`（`svg` / `imageSrc` / `name` / `tagline`）在 Task 2 定义，
Task 4、Task 6、Task 7 一律用它；`brandOf` 只在 Task 2 定义一次，Task 7、Task 8 引用；
`fillBrandSlots` 的名字在 Task 2 定义、Task 2 的测试引用。`validateLogoSvg` 与
`redrawLogo` 在 Task 4 定义、Task 4 的测试引用。`clearBrand` 在 Task 4 定义、Task 5 引用。

**接口核实（写计划时逐条查过，避免写出不存在的 API）：**

| 事实 | 结论 |
|---|---|
| `@lumen/ui` 有没有 `Spinner` | **没有**。转圈用 `animate-pulse` 的文字 |
| `Button` 支持哪些 variant / size | `primary\|secondary\|ghost\|danger\|accent\|violet`；`sm\|md\|lg`。**不支持 `asChild`** |
| `createStorage` 从哪来 | `@lumen/storage`，不是 server-core 自己的 lib |
| `buildSelfContainedHtml` 的调用点 | `apps/worker/src/handlers/export-html.tsx:28` |
| `Presenter` 怎么拿数据 | **不订阅 store**，全靠 props；`Present.tsx:14` 的 `detail` 查询是它上游 |
| `CenterCanvas` 订阅了 `project` 吗 | 订阅了 store，但 :50 的解构里**没有** `project`，要补 |
| `projects.test.ts` 的 `api()` 签名 | `api(path, init: RequestInit)`，body 要自己 `JSON.stringify`，鉴权走 `headers: auth(token)` |
| `html-doc.test.ts` 有哪些现成常量 | `PALETTE`、`FONT`，直接复用 |

**原先记的越界项已收回：** 早先这版计划让 `DELETE /:id/brand` 借用 `delete_project`，
理由是「加新枚举值会牵动 admin 的审计页」。核过之后理由不成立——`ACTION_FILTERS`
（`apps/admin/src/pages/Audit.tsx:10`）是从 `AUDIT_ACTION_LABEL` 自动生成的，
代价只是 `user.ts` 加一个枚举值 + `types.ts` 加一条中文名，两行。而借用动作名正是
`AuditAction` 注释里记着的那类教训，所以改成 `clear_brand`（见 Step 3b）。
