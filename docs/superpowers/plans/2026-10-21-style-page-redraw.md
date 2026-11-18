# 单页提示词重识别与替换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在风格库里给已生成的风格加编辑入口，能按页类型上传参考图、重新识别出那一条 HTML 生成提示词并重跑样机，确认后永久替换；配色与字体跟随原风格。

**Architecture:** 复用识别链路已有的三个模型原语（分页 / 写提示词 / 出样机），把它们从 `recognize-doc.service.ts` 抽到 `page-prompt-kit.ts` 供两条链路共用。新增 `redraw-page.service.ts` 承载单页流程，配三条 API 路由（分页短 POST、重识别 SSE、替换 PUT）。前端在风格卡片与详情弹框各加编辑入口，编辑视图三态（上传 / 挑页 / 结果）。

**Tech Stack:** TypeScript NodeNext、Express、Zod、React 19、TanStack Query、SSE（`fetch` + ReadableStream，EventSource 发不了 Authorization）、`node:test` + tsx。

**设计文档：** `docs/superpowers/specs/2026-10-21-style-page-redraw-design.md`

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `packages/server-core/src/services/page-prompt-kit.ts`（新建） | 与模型交互的三个原语：分页、写提示词、出样机。两条链路共用，不含任何业务流程 |
| `packages/server-core/src/services/redraw-page.service.ts`（新建） | 单页重识别这条业务：分页给用户挑、按框重识别、替换落库 |
| `packages/server-core/src/services/recognize-doc.service.ts`（改） | 全量识别。删掉搬走的原语，改成从 kit 引；**Task 5.5 修掉它一直没落账的缺口** |
| `packages/server-core/src/services/billed-gateway.ts`（新建） | Task 5.5 的 `billedGateway()`——已经抄了两遍的落账网关，别再抄第三份。**不放 provider.service**，那里刻意反转了依赖 |
| `packages/server-core/src/index.ts`（改） | 加一行导出 |
| `apps/api/src/routes/styles.ts`（改） | 三条路由 |
| `apps/web/src/pages/StyleLibrary.tsx`（改） | 卡片与详情的编辑入口；挂载编辑视图 |
| `apps/web/src/components/RedrawPagePanel.tsx`（新建） | 编辑视图（上传 / 挑页 / 结果 三态） |

**依赖顺序**：1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9。每一步都能单独跑通并提交。

---

## 约定（每个 Task 都适用）

- 跑测试：`pnpm --filter @lumen/server-core test`（只跑 server-core，快）。
- 类型检查：`pnpm --filter @lumen/server-core typecheck`。
- 提交身份这台机器上没配全局，一律用：
  `git -c user.name=sky -c user.email=sky@localhost commit`
- 提交信息末尾必须带 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`。
- **注释与代码里都不能出现 emoji**——`pnpm build` 会先跑 `scripts/lint-emoji.mjs`，它扫全仓。

---

## Task 1: 抽出共用件 `page-prompt-kit.ts`

纯搬运，**行为零变化**。这一步不改任何逻辑，只把与模型交互的三个原语挪个地方，
好让单页重识别这条新链路能用，而不必去够 `recognize-doc.service.ts` 的私有函数。

**Files:**
- Create: `packages/server-core/src/services/page-prompt-kit.ts`
- Modify: `packages/server-core/src/services/recognize-doc.service.ts`

- [ ] **Step 1: 建 kit 文件**

把下面这些**从 `recognize-doc.service.ts` 原样剪过来**（内容一字不改）：
`SPLIT_SYSTEM`、`splitSlides`、`WRITE_SYSTEM`、`writePagePrompt`、`MOCK_SYSTEM`、
`generateMock`、`paletteBlock`、`MOCK_MAX_TOKENS`。

文件头：

```ts
import {
  IMAGE_SLOT_ATTR,
  PAGE_TYPE_BRIEF,
  PAGE_TYPE_LABEL,
  PAGE_TYPE_ORDER,
  type PageType,
  type StylePalette,
} from '@lumen/ir-schema';
import { isMockHtmlAcceptable, lintMockHtml } from '@lumen/render-engine';
import { normalizeCropBox } from '@lumen/style-engine/server';
import type { ProviderGateway } from '@lumen/provider-gateway';
import { parseModelJson, stripFences, stripHtmlReply } from '../lib/model-reply.js';

/**
 * 与模型交互的三个原语：分页、写提示词、出样机。
 *
 * 抽出来是因为两条链路都要用：全量识别（`recognize-doc.service`）与单页重识别
 * （`redraw-page.service`）。它们在这里只做「调模型、收拾返回值」这一件事，
 * 不含任何业务流程——谁调用、结果怎么用，都由调用方决定。
 *
 * 三条各自的行事方式**并不统一**，读之前先看清，别照着某一条去改另一条：
 *
 * - `splitSlides`：模型一个框都给不出时兜底成「整张图当一页」，不抛。
 *   但网关本身报错（网络、限流）会原样抛出去，由调用方决定是跳过还是整批失败。
 * - `writePagePrompt`：模型没写出东西就**抛**。没有提示词就没有可交付的东西，
 *   这里没有合理的兜底，由调用方转成它能表达的失败（SSE 的 error 事件）。
 * - `generateMock`：lint 不过时**内部自己再调一次**（所以调用次数不保证是 1），
 *   仍不过就带着 issues 返回。与 `splitSlides` 一样，网关本身报错会原样抛出去。
 *
 * 别处的近亲实现**有意不同，不要顺手统一**：`design-vision.service.ts` 自己那份
 * `splitSlides` 走像素兜底、预算与温度都不同；`generate-html.service.ts` 的
 * `paletteBlockOf` 用途相同但少一层说明。合并它们会改行为。
 */
```

`splitSlides` 的签名与实现原样搬（它内部用 `normalizeCropBox`、`PAGE_TYPE_ORDER`、
`PAGE_TYPE_LABEL`、`parseModelJson`）。搬过来后 **`export`** 它。

`writePagePrompt`、`generateMock`、`paletteBlock` 搬过来后也 **`export`**。

- [ ] **Step 2: 改 `recognize-doc.service.ts`**

删掉上述八项（含 `SPLIT_SYSTEM` 与 `splitSlides`），改成从 kit 引：

```ts
import { generateMock, paletteBlock, splitSlides, writePagePrompt } from './page-prompt-kit.js';
```

再收拾因此变成未使用的 import：

- `@lumen/ir-schema`：删 `IMAGE_SLOT_ATTR` 吗？**不删**——`DERIVE_SYSTEM` 还在用。
  `PAGE_TYPE_BRIEF`、`PAGE_TYPE_LABEL`、`PAGE_TYPE_ORDER` 也都还在用，保留。
- `@lumen/render-engine`：整行删掉（`isMockHtmlAcceptable` / `lintMockHtml` 只在那两个搬走的函数里用）。
- `../lib/model-reply.js`：`stripFences` 与 `stripHtmlReply` 都只在那两个搬走的函数里用，
  改成 `import { parseModelJson } from '../lib/model-reply.js';`。
- `@lumen/style-engine/server`：`normalizeCropBox` 只被 `splitSlides` 用，从 import 里删掉；
  `cropNormalized`、`decodeImage`、`toDataUrl` 还在 `runDocRecognition` 里用，保留。

- [ ] **Step 3: 跑测试，确认零变化**

```bash
pnpm --filter @lumen/server-core test
```

期望：与改动前**同样的通过数**，一个不多一个不少。

**注意：这个数字是空证据**——本仓库**目前没有任何测试覆盖这三个原语**
（`recognize-doc.test.ts` 只测 `stripReply` 那几个纯函数，从没引用 `runDocRecognition`；
`generate-html.test.ts` 测的是另一条链路 `generate-html.service.ts`，跟这里没有交集）。
所以「搬运没走样」这一步的保证来自**逐块比对**（把 `git show <基线SHA>:...` 的原文件按行区间
切出来，跟新文件做逐字 diff），不是来自测试。别把 97 这个数字当成安全网。

覆盖由下一步补上。

- [ ] **Step 4: 补 kit 的契约测试**

新建 `packages/server-core/src/services/page-prompt-kit.test.ts`。三条主张必须钉住——
它们正是头注释承诺的东西，也是 Task 3 / Task 4 会依赖的行为：

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import type { ProviderGateway } from '@lumen/provider-gateway';
import { generateMock, splitSlides, writePagePrompt } from './page-prompt-kit.js';

const PALETTE = {
  bg: '#EFE6DA', surface: '#F7F1E8', text: '#3A322B', muted: '#8A7F73',
  accent: '#E08A3C', brand: '#C7421A', border: '#D8CDBF',
};

interface TextRequest {
  system?: string;
  messages: { content: string }[];
}

/** 假网关：按调用次序吐预设回复，并记下每次收到的请求供断言 */
function fakeGateway(replies: (string | Error)[]) {
  const seen: TextRequest[] = [];
  let i = 0;
  return {
    seen,
    gateway: {
      async text(req: TextRequest) {
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
    } as unknown as ProviderGateway,
  };
}

const IMG = { width: 64, height: 64 };

test('模型一个框都给不出时，分页兜底成「整张图当一页」而不是空数组', async () => {
  const { gateway } = fakeGateway([JSON.stringify({ slides: [] })]);
  const refs = await splitSlides(gateway, 'data:image/png;base64,AAAA', IMG);
  assert.equal(refs.length, 1, '空数组会让上层报「没能找出任何一页」，那是错的');
  assert.deepEqual(refs[0]!.box, { x0: 0, y0: 0, x1: 1, y1: 1 });
});

test('模型没写出提示词时抛错，调用方必须接住', async () => {
  const { gateway } = fakeGateway(['']);
  await assert.rejects(
    () => writePagePrompt(gateway, 'data:image/png;base64,AAAA', 'cover'),
    /提示词/,
  );
});

test('样机第一版过不了 lint 时，返回的是第二次的结果，且自身不抛', async () => {
  // 两版**只差 --bg 的取值**，其余一字不差——这样才是在问「同一页，配色错了 vs 配色对了」。
  // 两边都要写 style="background:var(--bg)"：整段 HTML 里不出现 var(-- 会触发
  // codegen/no-tokens 这条 **warning**，它不阻断重试却会留在 issues 里，
  // 让下面的 deepEqual([]) 无谓地挂掉（实测踩过）
  const bad = '<style>:root { --bg:#0B0B10; }</style><div class="slide" style="background:var(--bg)">x</div>';
  const good = `<style>:root { --bg:${PALETTE.bg}; }</style><div class="slide" style="background:var(--bg)">x</div>`;
  const { gateway, seen } = fakeGateway([bad, good]);
  const r = await generateMock(gateway, '角色：x\n任务：y\n视觉与排版要求：\n1. z\n代码要求（非常重要）：\n1. w', PALETTE);
  assert.equal(seen.length, 2, '第一版不过 lint 就该自己再调一次');
  assert.equal(r.html, good, '返回的必须是第二次的 html');
  assert.deepEqual(r.issues, [], '第二次过了，就不该再带问题');
});

test('两次都过不了 lint 时带问题返回，不抛', async () => {
  const bad = '<style>:root { --bg:#0B0B10; }</style><div class="slide">x</div>';
  const { gateway } = fakeGateway([bad, bad]);
  const r = await generateMock(gateway, '角色：x\n任务：y\n视觉与排版要求：\n1. z\n代码要求（非常重要）：\n1. w', PALETTE);
  assert.ok(r.issues.some((i) => i.severity === 'error'));
});
```

- [ ] **Step 5: 让样机的内部重试留下痕迹**

`generateMock` 里那次「lint 不过就重试」现在是无声的，而仓库里其它每一处模型抖动都有
`logger.warn`（见 `recognize-doc.service.ts` 里推导失败、单步失败两处）。静默重试意味着
提示词在悄悄退化而没人知道。在重试前加一行：

```ts
      logger.warn('样机第一版没过 lint，将重试一次', {
        errors: issues.filter((i) => i.severity === 'error').map((i) => i.message),
      });
```

并在文件头加 `import { logger } from '../lib/logger.js';`。
（日志不带身份是**有意的**——这个原语本来就不该知道自己在为哪一页服务。）

- [ ] **Step 6: 跑测试与类型检查**

```bash
pnpm --filter @lumen/server-core test
pnpm --filter @lumen/server-core typecheck
```

期望：测试从 97 涨到 101（新增 4 条），全绿；typecheck 无输出。
若有「已声明但从未读取」的报错，说明 Step 2 的 import 没收拾干净。

- [ ] **Step 7: 提交**

```bash
git add packages/server-core/src/services/page-prompt-kit.ts packages/server-core/src/services/page-prompt-kit.test.ts packages/server-core/src/services/recognize-doc.service.ts
git -c user.name=sky -c user.email=sky@localhost commit -m "$(cat <<'EOF'
refactor(style): 把与模型交互的三个原语抽成 page-prompt-kit

分页、写提示词、出样机这三件事原本锁在 recognize-doc.service.ts 里，
可单页重识别也要用同一套。抽出来是为了让两边共用，而不是复制一份。

纯搬运，一行逻辑没改。
EOF
)"
```

---

## Task 2: `writePagePrompt` 支持注入配色与缺失小节

全量识别里写提示词发生在**提炼配色之前**，所以那批提示词根本不知道配色是什么。
单页编辑这条路配色是现成的，不注入的话模型会照着参考图写「背景用深蓝」，
跟这套风格的暖米白直接打架。

**Files:**
- Modify: `packages/server-core/src/services/page-prompt-kit.ts`
- Test: `packages/server-core/src/services/page-prompt-kit.test.ts`（Task 1 已建，这里追加）

- [ ] **Step 1: 写失败的测试**

**追加**到 Task 1 建的 `packages/server-core/src/services/page-prompt-kit.test.ts`。
`PALETTE`、`TextRequest`、`fakeGateway` 那里都已经有了，直接用——
它的 `fakeGateway` 收的是**回复数组**，单条就是 `fakeGateway([...])`：

```ts
const OK_PROMPT = '角色：x\n任务：y\n视觉与排版要求：\n1. z\n代码要求（非常重要）：\n1. w';

test('不给配色时，请求与本任务之前逐字一致——全量识别那条路一点没动', async () => {
  const { gateway, seen } = fakeGateway([OK_PROMPT]);
  await writePagePrompt(gateway, 'data:image/png;base64,AAAA', 'cover');
  assert.equal(seen.length, 1);
  // 逐字比对而不是「不出现色值」：后者在 content 被清空时也会通过。
  // 用模板拼常量而不是抄一份字面量——要钉的是**请求的拼法**（拼装顺序、分隔符、
  // 有没有多余的追加），那才是这次改动真正的风险面；改 BRIEF 的措辞是产品决定，
  // 不该把这条接线用例带崩
  assert.equal(
    seen[0]!.messages[0]!.content,
    `这一页是【${PAGE_TYPE_LABEL.cover}】（${PAGE_TYPE_BRIEF.cover}）。请写出它的 HTML 生成提示词。`,
  );
});

test('给了配色就把色值明写进调用，并说明参考图的颜色不要照搬', async () => {
  const { gateway, seen } = fakeGateway([OK_PROMPT]);
  await writePagePrompt(gateway, 'data:image/png;base64,AAAA', 'cover', { palette: PALETTE });
  const content = seen[0]!.messages[0]!.content;
  assert.ok(content.includes(PALETTE.bg), '色值必须明写进调用');
  assert.ok(content.includes('不要照搬'), '必须说清参考图的颜色不算数');
});

test('给了问题清单就逐条列给模型，要求重写', async () => {
  const { gateway, seen } = fakeGateway([OK_PROMPT]);
  await writePagePrompt(gateway, 'data:image/png;base64,AAAA', 'cover', {
    problems: ['缺少「代码要求（非常重要）：」这一段', '提示词里写死了 img 的 src'],
  });
  const content = seen[0]!.messages[0]!.content;
  assert.ok(content.includes('缺少「代码要求（非常重要）：」这一段'), '问题要逐条列出来');
  assert.ok(content.includes('提示词里写死了 img 的 src'));
  assert.ok(content.includes('重写'), '要说清是重写而不是补');
});
```

import 行加上 `writePagePrompt`（Task 1 那份已经引了 `generateMock` / `splitSlides`）：

```ts
import { generateMock, splitSlides, writePagePrompt } from './page-prompt-kit.js';
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm --filter @lumen/server-core test
```

期望：编译失败或 `writePagePrompt` 忽略第四个参数，两条断言挂掉
（`给配色` 与 `缺失小节` 那两条）。

- [ ] **Step 3: 实现**

把 `writePagePrompt` 改成：

```ts
export interface WritePromptOptions {
  /** 给了就把这套配色明写进调用。单页重识别用，全量识别不传 */
  palette?: StylePalette;
  /** 上一版有哪几个问题，重试时列给模型。传的是 `lintStylePrompt` 给出的 message 原文 */
  problems?: string[];
}

export async function writePagePrompt(
  gateway: ProviderGateway,
  pageImage: string,
  pageType: PageType,
  opts: WritePromptOptions = {},
): Promise<string> {
  const parts = [
    `这一页是【${PAGE_TYPE_LABEL[pageType]}】（${PAGE_TYPE_BRIEF[pageType]}）。请写出它的 HTML 生成提示词。`,
  ];

  if (opts.palette) {
    parts.push(
      '',
      '---',
      paletteBlock(opts.palette),
      '',
      '参考图只用来定版式与视觉语言。**参考图里的颜色不要照搬**——上面这套配色才是这一页要用的，',
      '提示词里写到颜色时一律引用这些变量名。',
    );
  }

  if (opts.problems && opts.problems.length > 0) {
    parts.push(
      '',
      '---',
      '上一版有这些问题，请重写一遍：',
      ...opts.problems.map((p) => `- ${p}`),
      '',
      '四个小节一个都不能少、顺序不能变、名称不能改。',
    );
  }

  const res = await gateway.text({
    taskType: 'html_codegen',
    maxTokens: 8000,
    system: WRITE_SYSTEM,
    messages: [{ role: 'user', content: parts.join('\n'), images: [pageImage] }],
  });
  const prompt = stripFences(res.text);
  if (prompt.trim().length === 0) throw new Error('模型没写出提示词');
  return prompt;
}
```

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm --filter @lumen/server-core test
```

期望：全绿。

- [ ] **Step 5: 提交**

```bash
git add packages/server-core/src/services/page-prompt-kit.ts packages/server-core/src/services/page-prompt-kit.test.ts
git -c user.name=sky -c user.email=sky@localhost commit -m "$(cat <<'EOF'
feat(style): 写提示词时可以注入目标配色与待补小节

单页重识别这条路配色是现成的，不注入的话模型会照着参考图写「背景用深蓝」，
跟这套风格的暖米白直接打架。全量识别不传这个参数，行为不变。

顺带给了「上一版缺了哪几个小节」的入口，重试时能明确要求补齐。
EOF
)"
```

---

## Task 3: `splitForPick()` —— 分页给用户挑

**Files:**
- Create: `packages/server-core/src/services/redraw-page.service.ts`
- Test: `packages/server-core/src/services/redraw-page.test.ts`（新建）

- [ ] **Step 1: 写失败的测试**

新建 `packages/server-core/src/services/redraw-page.test.ts`：

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProviderGateway } from '@lumen/provider-gateway';

// 环境必须在导入任何模块之前设定
const tmp = mkdtempSync(join(tmpdir(), 'lumen-redraw-'));
process.env.NODE_ENV = 'test';
process.env.LUMEN_DB_PATH = join(tmp, 'test.db');
process.env.LUMEN_SECRET_KEY = 'test-secret-key-0123456789abcdefghijklmnop';

const { migrate } = await import('../db/migrate.js');
const { closeDb } = await import('../db/client.js');
const { ensureSeed } = await import('./seed.service.js');
const { saveStyleDoc } = await import('./style-doc.service.js');
const { splitForPick } = await import('./redraw-page.service.js');
const { StyleDoc } = await import('@lumen/ir-schema');
const { toDataUrl } = await import('@lumen/style-engine/server');

migrate();
ensureSeed();

test.after(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * 分页与重识别。
 *
 * 全程用假网关：这里要验的是「框怎么传、提示词带没带上配色、替换时动了哪几格」，
 * 不是模型本身。真调模型会让用例既慢又不确定，在没有 Key 的机器上还会直接失败。
 */

/**
 * 一张 64×64 的纯色 PNG。
 *
 * 分页的框由假网关给，不靠像素，所以画什么都行——只要 `decodeImage` 解得开。
 * 尺寸取 64 而不是 8：`cropNormalized` 会把归一化框乘回像素再取整，
 * 图太小的时候一个 0.9 宽的框只剩七像素，容易撞上边界处理。
 */
const IMAGE = toDataUrl({ width: 64, height: 64, data: new Uint8Array(64 * 64 * 4).fill(200) });

const PALETTE = {
  bg: '#EFE6DA', surface: '#F7F1E8', text: '#3A322B', muted: '#8A7F73',
  accent: '#E08A3C', brand: '#C7421A', border: '#D8CDBF',
};

interface TextRequest {
  system?: string;
  messages: { content: string; images?: string[] }[];
  maxTokens?: number;
  taskType?: string;
  json?: boolean;
}

/** 假网关：按调用次序吐预设回复，并记下每次收到的请求供断言 */
function fakeGateway(replies: (string | Error)[]) {
  const seen: TextRequest[] = [];
  let i = 0;
  return {
    seen,
    gateway: {
      async text(req: TextRequest) {
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
    } as unknown as ProviderGateway,
  };
}

test('分页只找出一页时原样返回那一页', async () => {
  const { gateway } = fakeGateway([
    JSON.stringify({ slides: [{ pageType: 'cover', x0: 0.05, y0: 0.1, x1: 0.95, y1: 0.9 }] }),
  ]);
  const slides = await splitForPick(IMAGE, gateway);
  assert.equal(slides.length, 1);
  assert.equal(slides[0]!.index, 0);
  assert.equal(slides[0]!.pageType, 'cover');
  assert.deepEqual(slides[0]!.box, { x0: 0.05, y0: 0.1, x1: 0.95, y1: 0.9 });
});

test('拼图分出多页时按序返回，每页带自己的裁切框', async () => {
  const { gateway } = fakeGateway([
    JSON.stringify({
      slides: [
        { pageType: 'cover', x0: 0.04, y0: 0.10, x1: 0.96, y1: 0.50 },
        { pageType: 'metrics', x0: 0.04, y0: 0.55, x1: 0.96, y1: 0.95 },
      ],
    }),
  ]);
  const slides = await splitForPick(IMAGE, gateway);
  assert.equal(slides.length, 2);
  assert.deepEqual(slides.map((s) => s.index), [0, 1]);
  assert.deepEqual(slides.map((s) => s.pageType), ['cover', 'metrics']);
  assert.ok(slides[1]!.box.y0 > slides[0]!.box.y1, '两页不该重叠');
});

test('模型一个框都给不出时，整张图当一页', async () => {
  const { gateway } = fakeGateway([JSON.stringify({ slides: [] })]);
  const slides = await splitForPick(IMAGE, gateway);
  assert.equal(slides.length, 1);
  assert.deepEqual(slides[0]!.box, { x0: 0, y0: 0, x1: 1, y1: 1 });
});

test('分页请求确实把图发出去了——参数被调换是这里最容易犯的错', async () => {
  const { gateway, seen } = fakeGateway([JSON.stringify({ slides: [] })]);
  await splitForPick(IMAGE, gateway);
  assert.equal(seen.length, 1);
  assert.equal(seen[0]!.taskType, 'style_recognize');
  assert.equal(seen[0]!.json, true);
  assert.deepEqual(seen[0]!.messages[0]!.images, [IMAGE]);
});
```

前三条验的是**结果**，这一条验的是**请求**。只断言返回值的话，
把 `splitSlides(gateway, imageUrl, img)` 的两个参数写反（或者传了错的 URL）
仍然能通过——而那是这个函数最可能出的真错。

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm --filter @lumen/server-core test
```

期望：`Cannot find module './redraw-page.service.js'`。

- [ ] **Step 3: 实现**

新建 `packages/server-core/src/services/redraw-page.service.ts`：

```ts
import type { PageType } from '@lumen/ir-schema';
// 归一化裁切框直接用 style-engine 那个。**不要在 server-core 里另起一份**——
// `cropNormalized` 收的就是它，重定义会变成第三个同形异名的声明
import { decodeImage, type CropBox } from '@lumen/style-engine/server';
import type { ProviderGateway } from '@lumen/provider-gateway';
import { splitSlides } from './page-prompt-kit.js';
import { buildGateway } from './provider.service.js';

/**
 * 单页重识别：改一套风格里某一个页类型的提示词与样机。
 *
 * 与全量识别（`recognize-doc.service`）共用同一套模型原语，区别在流程：
 * 全量识别一次读整本稿子、定配色、补齐九个页类型；这里只处理用户指定的那一页，
 * 配色与字体沿用已有的那套——换的是版式与视觉语言，不是这套风格的调子。
 *
 * 分两步而不是一步：先分页让用户挑（`splitForPick`），再按挑中的框重识别
 * （`redrawPage`）。中间隔一次用户点击，所以第二步**传框而不是传下标**——
 * 模型调用不是确定性的，第二次分页可能切出不一样的框，用户挑的那一页就会
 * 与真正识别的那一页对不上，而且这种错配是静默的。
 */

export interface PickSlide {
  index: number;
  pageType: PageType;
  box: CropBox;
}

/**
 * 分页，给用户挑一页。
 *
 * 不返回缩略图：前端手上已经有用户刚上传的那张图，把 `box` 按百分比画成可点的矩形
 * 叠上去就行。服务端裁一遍再编码成 PNG 传回来，一张 900px 的稿子动辄几百 KB。
 *
 * @param imageUrl **必须是 data URL**。`decodeImage` 只解 PNG，传 `/files/x.png`
 *   或 http 地址会得到一句「不是合法的 PNG 数据」。调用方先过 `resolveImages`。
 */
export async function splitForPick(
  imageUrl: string,
  gateway: ProviderGateway,
): Promise<PickSlide[]> {
  const img = decodeImage(imageUrl);
  const refs = await splitSlides(gateway, imageUrl, img);
  return refs.map((ref, index) => ({ index, pageType: ref.pageType, box: ref.box }));
}
```

**网关是必传的，不给默认值。** 给个 `= buildGateway()` 看着方便，实际是个陷阱：
`buildGateway()` 不挂 `onUsage` 时那次调用**不进 `usage_records`**，而用量页正是
从那张表算的。默认值让「忘了落账」变成静默的——没人会去 review 一个没写出来的参数。
必传之后，调用方必须显式决定用哪个网关，路由那边自然就写成会落账的那个。

**不要 `export type { CropBox };`。** `apps/api` 本来就依赖 `@lumen/style-engine`，
前端又根本引不到 server-core——这个转发零消费者。而 Task 5 会给这个文件接上
`export *`，那时它就变成「`@lumen/server-core` 对外挂了一个别人家的类型」，
下一个 `import { CropBox } from '@lumen/server-core'` 的人学到的是错误的归属。
要防的是「在 server-core 里重定义」，`import type` 已经防住了。
（`usage.service.ts` 里那个 `export type { UsageSummary }` 也没人用，别照着抄。）

`index` 是**过滤后**的位置，不是「模型眼里的第几页」：`splitSlides` 会把
`normalizeCropBox` 拒掉的框丢掉，模型给三个框、中间那个不合法，第三个就变成
`index: 1`。前端拿它当 React key 没问题，当成页码就错了。

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm --filter @lumen/server-core test
```

期望：全绿。

- [ ] **Step 5: 提交**

```bash
git add packages/server-core/src/services/redraw-page.service.ts packages/server-core/src/services/redraw-page.test.ts
git -c user.name=sky -c user.email=sky@localhost commit -m "$(cat <<'EOF'
feat(style): 单页重识别的分页入口

先分页让用户挑，再按挑中的框重识别。中间隔一次用户点击，所以第二步传框
而不是传下标——模型调用不是确定性的，第二次分页可能切出不一样的框，
用户挑的那一页就会与真正识别的那一页对不上，而且这种错配是静默的。

不返回缩略图：前端手上已经有刚上传的那张图，把框按百分比叠上去更直观，
也省掉几百 KB 的响应体。
EOF
)"
```

---

## Task 4: `redrawPage()` —— 按框重识别（SSE）

**Files:**
- Modify: `packages/server-core/src/services/redraw-page.service.ts`
- Test: `packages/server-core/src/services/redraw-page.test.ts`

- [ ] **Step 1: 写失败的测试**

追加到 `redraw-page.test.ts`（import 行改成
`const { splitForPick, redrawPage } = await import('./redraw-page.service.js');`）：

```ts
const OK_PROMPT = '角色：封面设计师。\n任务：写封面。\n视觉与排版要求：\n1. 大字标题。\n代码要求（非常重要）：\n1. 用 :root 定义变量。';

/** 一份合规的样机 HTML：配色全部走变量，且变量值与色板逐字对上 */
const GOOD_HTML = [
  `<style>:root { --bg:${PALETTE.bg}; --text:${PALETTE.text}; --accent:${PALETTE.accent}; }`,
  '.slide { width: 1920px; height: 1080px; background: var(--bg); color: var(--text); }',
  '</style><div class="slide">封面</div>',
].join('');

let seq = 0;
function makeDoc(over: Record<string, unknown> = {}) {
  seq += 1;
  const styleId = `redraw-${seq}`;
  const doc = StyleDoc.parse({
    styleId,
    version: '1.0',
    name: `风格 ${seq}`,
    description: '一句话说明',
    fontFamily: '"Source Han Serif", serif',
    // 必须给个非空值：`StyleDoc.deckPrompt` 默认是 `''`，不设的话「替换后 deckPrompt
    // 逐字不变」那条断言比的是 `'' === ''`——空的。审查实测：把 deckPrompt 从实现里
    // 整个删掉，124 条全绿
    deckPrompt: '整本一套调子',
    palette: PALETTE,
    pagePrompts: {
      cover: { pageType: 'cover', prompt: OK_PROMPT, mockHtml: '<div>旧封面样机</div>', source: 'reference' },
      text: { pageType: 'text', prompt: OK_PROMPT, mockHtml: '<div>文字页样机</div>', source: 'derived' },
    },
    ...over,
  });
  assert.equal(saveStyleDoc(doc).ok, true);
  return styleId;
}

const FULL_BOX = { x0: 0, y0: 0, x1: 1, y1: 1 };

/** 把一次重识别的 SSE 事件收成数组，省得每条用例都写一遍 for await */
async function collect(gen: AsyncGenerator<{ event: string; data: unknown }>) {
  const out: { event: string; data: unknown }[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

test('重识别按 裁页 → 写提示词 → 出样机 报进度，最后给出提示词与样机', async () => {
  const styleId = makeDoc();
  const { gateway } = fakeGateway([OK_PROMPT, GOOD_HTML]);
  const events = await collect(redrawPage({
    styleId, pageType: 'cover', imageUrl: IMAGE, box: FULL_BOX, gateway,
  }));

  const steps = events.filter((e) => e.event === 'progress').map((e) => (e.data as { step: string }).step);
  assert.deepEqual(steps, ['crop', 'read', 'mock']);

  const done = events.find((e) => e.event === 'done');
  assert.ok(done, '必须给出 done 事件');
  const data = done.data as { prompt: string; mockHtml: string; promptIssues: { rule: string }[] };
  assert.equal(data.prompt, OK_PROMPT);
  assert.ok(data.mockHtml.includes('--bg'), '样机应该是模型吐的那份 HTML');
  assert.deepEqual(data.promptIssues, []);
});

test('写提示词的调用带上了这套风格的配色', async () => {
  const styleId = makeDoc();
  const { gateway, seen } = fakeGateway([OK_PROMPT, GOOD_HTML]);
  await collect(redrawPage({ styleId, pageType: 'cover', imageUrl: IMAGE, box: FULL_BOX, gateway }));
  assert.ok(seen[0]!.messages[0]!.content.includes(PALETTE.bg), '提示词调用里必须有色值');
  assert.ok(seen[0]!.messages[0]!.content.includes('不要照搬'), '必须说清参考图的颜色不算数');
});

test('出样机的调用也带上了同一套配色', async () => {
  const styleId = makeDoc();
  const { gateway, seen } = fakeGateway([OK_PROMPT, GOOD_HTML]);
  await collect(redrawPage({ styleId, pageType: 'cover', imageUrl: IMAGE, box: FULL_BOX, gateway }));
  const mockCall = seen[seen.length - 1]!;
  assert.ok(mockCall.messages[0]!.content.includes(PALETTE.bg));
});

test('提示词不合契约时带问题重试一次，补上了就不算问题', async () => {
  const styleId = makeDoc();
  const { gateway, seen } = fakeGateway(['角色：只有一段', OK_PROMPT, GOOD_HTML]);
  const events = await collect(redrawPage({
    styleId, pageType: 'cover', imageUrl: IMAGE, box: FULL_BOX, gateway,
  }));
  const done = events.find((e) => e.event === 'done')!;
  assert.deepEqual((done.data as { promptIssues: unknown[] }).promptIssues, []);
  assert.equal(seen.length, 3, '写提示词两次 + 出样机一次');
  // 判据是 `lintStylePrompt`，所以列出来的是它的 message 原文，一条一行
  assert.ok(
    seen[1]!.messages[0]!.content.includes('- 缺少「任务：」这一段'),
    '重试时要把问题逐条列出来',
  );
  // **重试那一次也要带配色**——最终存下来的就是这一版的提示词，
  // 而配色注入存在的全部理由就是不让模型自己发明一套色。少了这条断言，
  // 把重试分支的 palette 删掉 13 条用例全绿（审查实测）
  assert.ok(seen[1]!.messages[0]!.content.includes(PALETTE.bg), '重试也要带配色');
});

test('只缺一个小节也要重试——那正是最容易发生的一档', async () => {
  const styleId = makeDoc();
  // 只差「代码要求（非常重要）：」这一段，而少了它生成的 HTML 就不会用 :root 变量
  const oneMissing = '角色：x\n任务：y\n视觉与排版要求：\n1. z';
  const { gateway, seen } = fakeGateway([oneMissing, OK_PROMPT, GOOD_HTML]);
  const events = await collect(redrawPage({
    styleId, pageType: 'cover', imageUrl: IMAGE, box: FULL_BOX, gateway,
  }));
  assert.equal(seen.length, 3, '缺一个也要重试');
  assert.deepEqual(
    (events.find((e) => e.event === 'done')!.data as { promptIssues: unknown[] }).promptIssues,
    [],
  );
});

test('写死 img 的 src 也算不合契约，要重试', async () => {
  const styleId = makeDoc();
  // 四个小节都在、顺序也对，只有图片位写死了 src——旧的「只查小节在不在」
  // 判据会放过它，而这条提示词换不了图
  const badImg = `${OK_PROMPT}\n<img src="https://example.com/a.png">`;
  const { gateway, seen } = fakeGateway([badImg, OK_PROMPT, GOOD_HTML]);
  const events = await collect(redrawPage({
    styleId, pageType: 'cover', imageUrl: IMAGE, box: FULL_BOX, gateway,
  }));
  assert.equal(seen.length, 3, '写死 src 也要重试');
  assert.deepEqual(
    (events.find((e) => e.event === 'done')!.data as { promptIssues: unknown[] }).promptIssues,
    [],
  );
});

test('重试后仍不合契约就如实标出，但不阻断', async () => {
  const styleId = makeDoc();
  const { gateway } = fakeGateway(['角色：只有一段', '角色：还是只有一段', GOOD_HTML]);
  const events = await collect(redrawPage({
    styleId, pageType: 'cover', imageUrl: IMAGE, box: FULL_BOX, gateway,
  }));
  const done = events.find((e) => e.event === 'done')!;
  const issues = (done.data as { promptIssues: { rule: string; message: string }[] }).promptIssues;
  assert.ok(issues.some((i) => i.rule === 'prompt/missing-section' && i.message.includes('任务：')));
  assert.ok(issues.some((i) => i.rule === 'prompt/missing-section' && i.message.includes('代码要求（非常重要）：')));
});

test('样机过不了 lint 时仍给出结果，并把问题带出来', async () => {
  const styleId = makeDoc();
  const wrong = '<style>:root { --bg:#0B0B10; }</style><div class="slide">x</div>';
  const { gateway } = fakeGateway([OK_PROMPT, wrong, wrong]);
  const events = await collect(redrawPage({
    styleId, pageType: 'cover', imageUrl: IMAGE, box: FULL_BOX, gateway,
  }));
  const done = events.find((e) => e.event === 'done');
  assert.ok(done, '样机不合规不该让整次重识别失败');
  assert.ok((done.data as { issues: string[] }).issues.length > 0);
});

test('模型没写出提示词时给出 error 事件而不是抛出去', async () => {
  const styleId = makeDoc();
  const { gateway } = fakeGateway(['', '']);
  const events = await collect(redrawPage({
    styleId, pageType: 'cover', imageUrl: IMAGE, box: FULL_BOX, gateway,
  }));
  const err = events.find((e) => e.event === 'error');
  assert.ok(err);
  assert.ok((err.data as { message: string }).message.includes('提示词'));
});

test('风格不存在时给出 error 事件', async () => {
  const { gateway } = fakeGateway([OK_PROMPT]);
  const events = await collect(redrawPage({
    styleId: 'not-a-style', pageType: 'cover', imageUrl: IMAGE, box: FULL_BOX, gateway,
  }));
  const err = events.find((e) => e.event === 'error');
  assert.ok(err);
  assert.ok((err.data as { message: string }).message.includes('风格不存在'));
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm --filter @lumen/server-core test
```

期望：`redrawPage is not a function`。

- [ ] **Step 3: 实现**

在 `redraw-page.service.ts` 里加。**import 要并进文件顶部已有的那几行**，别在中间另起一段——
Task 3 建好文件后，顶部现在是：

```ts
import type { PageType } from '@lumen/ir-schema';
// 归一化裁切框直接用 style-engine 那个。**不要在 server-core 里另起一份**——
// `cropNormalized` 收的就是它，重定义会变成第三个同形异名的声明
import { decodeImage, type CropBox } from '@lumen/style-engine/server';
import type { ProviderGateway } from '@lumen/provider-gateway';
import { splitSlides } from './page-prompt-kit.js';
```

改完之后应该是：

```ts
import { PROMPT_SECTIONS, type PageType } from '@lumen/ir-schema';
// 归一化裁切框直接用 style-engine 那个。**不要在 server-core 里另起一份**——
// `cropNormalized` 收的就是它，重定义会变成第三个同形异名的声明
import { cropNormalized, decodeImage, toDataUrl, type CropBox } from '@lumen/style-engine/server';
import type { ProviderGateway } from '@lumen/provider-gateway';
import { logger } from '../lib/logger.js';
import { generateMock, splitSlides, writePagePrompt } from './page-prompt-kit.js';
import { resolveStyleDoc } from './style-doc.service.js';
```

（`StylePagePrompt` 是 Task 5 才要用的，这一步别引。）

然后加：

```ts
export type RedrawEvent =
  | { event: 'progress'; data: { step: 'crop' | 'read' | 'mock'; label: string; done: number; total: number } }
  | { event: 'done'; data: { prompt: string; mockHtml: string; issues: string[]; promptIssues: PromptIssue[] } }
  | { event: 'error'; data: { message: string } };

export interface RedrawInput {
  styleId: string;
  pageType: PageType;
  /** data URL。`decodeImage` 只解 PNG，调用方先过 `resolveImages` */
  imageUrl: string;
  box: CropBox;
  /** **必传**。路由那边用 `billedGateway()` 建，测试里换假的。
   *  不给默认值——默认值会让「忘了挂 onUsage」变成静默的记账缺口 */
  gateway: ProviderGateway;
}

/**
 * 提示词符不符合契约——**直接用契约自己的校验器**，不要另写一份子集。
 *
 * 原先这里只查「四个小节在不在」，而 `lintStylePrompt` 还查**小节顺序**与
 * **有没有写死 img 的 src**。用子集的后果是端到端静默的：顺序错或写死 src 的提示词
 * 既不重试、`done` 事件里也不报，而落库那一步只认 `saveStyleDoc` 的 `ok`
 * （那个字段只有整个 doc 一条提示词都没有时才为 false）——这个问题从重试到落库
 * 没有任何一个环节会露面。
 */
function promptProblems(prompt: string): PromptIssue[] {
  return lintStylePrompt(prompt);
}

/**
 * 把内部错误翻成能给用户看的话。
 *
 * `decodeImage` 失败时抛的是 `PNG_DECODE_FAILED: 不是合法的 PNG 数据` 这种带哨兵前缀的
 * 内部报文——原样送出去，用户看到的是一句他既看不懂也无从下手的话。
 * 认得出的翻成中文，认不出的**原样透传**（`风格不存在：x`、`模型没写出提示词`
 * 本来就是能照做的中文，一律换成「服务器内部错误」反而更难排查）。
 *
 * 两条路由（分页的 POST 与重识别的 SSE）共用这一份——同一个失败给两种待遇是错的。
 */
export function publicRedrawMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (raw.startsWith('PNG_DECODE_FAILED')) return '这张图读不了，请用 PNG（前端上传时会自动转）';
  return raw;
}

/**
 * 按框重识别一页。
 *
 * 失败不抛，转成 `error` 事件——调用方是 SSE 路由，抛出去只会变成一个断掉的连接，
 * 用户看不到原因。
 */
export async function* redrawPage(input: RedrawInput): AsyncGenerator<RedrawEvent> {
  const { gateway } = input;
  // 出错时日志要能说清死在哪一步——一条通用的网关报错，不写这个分不出是死在
  // 写提示词还是出样机
  let step: 'crop' | 'read' | 'mock' = 'crop';
  try {
    const doc = resolveStyleDoc(input.styleId);

    yield { event: 'progress', data: { step, label: '正在裁出这一页', done: 0, total: 3 } };
    const img = decodeImage(input.imageUrl);
    const pageImage = toDataUrl(cropNormalized(img, input.box));

    step = 'read';
    yield { event: 'progress', data: { step, label: '正在写提示词', done: 1, total: 3 } };
    let prompt = await writePagePrompt(gateway, pageImage, input.pageType, { palette: doc.palette });
    let problems = promptProblems(prompt);
    if (problems.length > 0) {
      // 连 prompt.length 一起记：若失败源于输出被截断，「代码要求」排在最后一段，
      // 第二次会在同一位置再截断，那次调用就是白花的——长度能让人看出这个信号
      logger.warn('写出来的提示词不合契约，带问题重试一次', {
        styleId: input.styleId, pageType: input.pageType,
        problems: problems.map((p) => p.message), promptLength: prompt.length,
      });
      prompt = await writePagePrompt(gateway, pageImage, input.pageType, {
        palette: doc.palette,
        problems: problems.map((p) => p.message),
      });
      problems = promptProblems(prompt);
    }

    step = 'mock';
    yield { event: 'progress', data: { step, label: '正在出样机', done: 2, total: 3 } };
    const { html, issues } = await generateMock(gateway, prompt, doc.palette);

    yield {
      event: 'done',
      data: {
        prompt,
        mockHtml: html,
        issues: issues.map((i) => i.message),
        promptIssues: problems,
      },
    };
  } catch (err) {
    logger.warn('单页重识别失败', {
      styleId: input.styleId, pageType: input.pageType, step,
      err: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    yield { event: 'error', data: { message: publicRedrawMessage(err) } };
  }
}
```

import 行同时要把 `PROMPT_SECTIONS` 换成 `lintStylePrompt` 与 `PromptIssue`：

```ts
import { lintStylePrompt, type PageType, type PromptIssue } from '@lumen/ir-schema';
```

`toDataUrl` 要加进 `@lumen/style-engine/server` 的 import。

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm --filter @lumen/server-core test
```

期望：全绿。

- [ ] **Step 5: 提交**

```bash
git add packages/server-core/src/services/redraw-page.service.ts packages/server-core/src/services/redraw-page.test.ts
git -c user.name=sky -c user.email=sky@localhost commit -m "$(cat <<'EOF'
feat(style): 按框重识别一页的提示词与样机

配色明写进写提示词的调用，否则模型会照着参考图写「背景用深蓝」，
跟这套风格的暖米白打架。写完校验固定四段，缺了带缺失项重试一次，
仍缺就如实标出来但不阻断——与样机的处理一致。

失败转成 error 事件而不是抛出去：调用方是 SSE 路由，抛出去只会变成一个
断掉的连接，用户看不到原因。
EOF
)"
```

---

## Task 5: `replacePagePrompt()` —— 永久替换

**Files:**
- Modify: `packages/server-core/src/services/redraw-page.service.ts`
- Test: `packages/server-core/src/services/redraw-page.test.ts`

- [ ] **Step 1: 写失败的测试**

追加到 `redraw-page.test.ts`（import 行加上 `replacePagePrompt`）：

```ts
const NEW_PROMPT = '角色：新封面设计师。\n任务：写新封面。\n视觉与排版要求：\n1. 新的大字标题。\n代码要求（非常重要）：\n1. 用 :root 定义变量。';
const NEW_MOCK = `<style>:root { --bg:${PALETTE.bg}; }</style><div class="slide">新封面</div>`;

test('替换只动指定那一格，其余一律原样', () => {
  const styleId = makeDoc();
  const before = resolveStyleDoc(styleId);
  const { doc: after } = replacePagePrompt({ styleId, pageType: 'cover', prompt: NEW_PROMPT, mockHtml: NEW_MOCK });

  assert.equal(after.pagePrompts.cover!.prompt, NEW_PROMPT);
  assert.equal(after.pagePrompts.cover!.mockHtml, NEW_MOCK);

  assert.equal(after.pagePrompts.text!.prompt, before.pagePrompts.text!.prompt);
  assert.equal(after.pagePrompts.text!.mockHtml, before.pagePrompts.text!.mockHtml);
  assert.equal(after.name, before.name);
  assert.equal(after.description, before.description);
  assert.equal(after.fontFamily, before.fontFamily);
  assert.equal(after.deckPrompt, before.deckPrompt);
  assert.deepEqual(after.palette, before.palette);
});

test('替换后标成手改，并且可以再次替换', () => {
  const styleId = makeDoc();
  const { doc: first } = replacePagePrompt({ styleId, pageType: 'cover', prompt: NEW_PROMPT, mockHtml: NEW_MOCK });
  assert.equal(first.pagePrompts.cover!.source, 'manual');
  assert.equal(first.pagePrompts.cover!.edited, true);

  const { doc: again } = replacePagePrompt({ styleId, pageType: 'cover', prompt: OK_PROMPT, mockHtml: GOOD_HTML });
  assert.equal(again.pagePrompts.cover!.prompt, OK_PROMPT, '第二次替换读到的是第一次的结果，直接覆盖');
});

test('替换时服务端自己重算样机的 lint 问题', () => {
  const styleId = makeDoc();
  const wrong = '<style>:root { --bg:#0B0B10; }</style><div class="slide">x</div>';
  const { doc: after } = replacePagePrompt({ styleId, pageType: 'cover', prompt: NEW_PROMPT, mockHtml: wrong });
  assert.ok(after.pagePrompts.cover!.issues.length > 0, 'issues 是派生数据，由服务端算而不是客户端传');
});

test('提示词不合契约时照样保存，但把问题带出来', () => {
  const styleId = makeDoc();
  // 缺了「代码要求（非常重要）：」这一段。saveStyleDoc 的 ok 仍为 true（它只在整个 doc
  // 一条非空提示词都没有时才 false），所以只看 ok 的话这个问题就断了
  const broken = '角色：x\n任务：y\n视觉与排版要求：\n1. z';
  const { issues } = replacePagePrompt({ styleId, pageType: 'cover', prompt: broken, mockHtml: NEW_MOCK });
  assert.ok(
    issues.some((i) => i.pageType === 'cover' && i.message.includes('代码要求')),
    '契约问题必须带出去，否则从重试到落库全程无人知晓',
  );
});

test('别的页类型早就有问题，也不该报成这次替换的后果', () => {
  const styleId = makeDoc({
    pagePrompts: {
      cover: { pageType: 'cover', prompt: OK_PROMPT, mockHtml: '<div>旧封面样机</div>', source: 'reference' },
      // chart 这条本来就不全，跟这次替换无关
      chart: { pageType: 'chart', prompt: '角色：x\n任务：y', mockHtml: '<div>图表样机</div>', source: 'derived' },
    },
  });
  const { issues } = replacePagePrompt({ styleId, pageType: 'cover', prompt: NEW_PROMPT, mockHtml: NEW_MOCK });
  assert.deepEqual(issues, [], '换的是封面，chart 老早缺的那一段不该算在这次头上');
});

test('风格不存在时抛错', () => {
  assert.throws(
    () => replacePagePrompt({ styleId: 'not-a-style', pageType: 'cover', prompt: NEW_PROMPT, mockHtml: NEW_MOCK }),
    /风格不存在/,
  );
});
```

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm --filter @lumen/server-core test
```

期望：`replacePagePrompt is not a function`。

- [ ] **Step 3: 实现**

在 `redraw-page.service.ts` 里加：

```ts
import { lintMockHtml } from '@lumen/render-engine';
import { StyleDoc } from '@lumen/ir-schema';
import { resolveStyleDoc, saveStyleDoc } from './style-doc.service.js';

export interface ReplaceInput {
  styleId: string;
  pageType: PageType;
  prompt: string;
  mockHtml: string;
}

/**
 * 永久替换一个页类型的提示词与样机。
 *
 * 单独开一条路而不是复用 `saveStyleDoc` 那条（它要整个 doc 原样传回来）：
 * 客户端得先拉全量、改一格、再回传，中间**任何一个字段丢了都会被静默写掉**。
 * 这里只收要改的两项，其余从库里读出来原样带过，出错面小一个量级。
 *
 * `issues` 是**派生数据**，服务端拿这套风格的配色重跑一遍 lint 算出来。
 * 让客户端传回来是错的——它算不了，传回来也只能原样存。
 */
export interface ReplaceResult {
  doc: StyleDoc;
  /** **只报这一页**的契约问题（缺小节 / 顺序错 / 写死 img src）。
   *  **不阻断保存**——与样机一个口径；但必须带出去给界面看：丢掉它，
   *  这个问题就从重试、到 SSE 事件、到落库全程没有任何一个环节会露面。
   *
   *  范围是「这一页」而不是「整本」：这次操作只动了这一页，返回别的页早已存在的问题
   *  会让用户以为是自己刚改坏的。整本的风格体检挂在 GET 详情上 */
  issues: { pageType: string; message: string }[];
}

export function replacePagePrompt(input: ReplaceInput): ReplaceResult {
  const doc = resolveStyleDoc(input.styleId);
  const page: StylePagePrompt = {
    pageType: input.pageType,
    prompt: input.prompt,
    mockHtml: input.mockHtml,
    source: 'manual',
    issues: lintMockHtml(input.mockHtml, doc.palette),
    edited: true,
  };
  const next = StyleDoc.parse({
    ...doc,
    pagePrompts: { ...doc.pagePrompts, [input.pageType]: page },
  });
  const result = saveStyleDoc(next);
  if (!result.ok) throw new Error('这一条提示词不合规，没有保存');
  return {
    doc: resolveStyleDoc(input.styleId),
    issues: result.issues.filter((i) => i.pageType === input.pageType),
  };
}
```

**为什么返回值要带上 `issues`**：`saveStyleDoc` 的 `ok` 只有「整个 doc 一条非空提示词都没有」
时才为 false，所以一条缺了「代码要求」的提示词会被**正常保存**、`ok: true`。
只看 `ok` 的话，契约问题在这里就断了——而 Task 4 已经把它算出来带到了 `done` 事件里，
不该在这一步丢掉。

**一处已知的计划/设计漂移，这轮不修**：设计文档里写「`customized` 会置真，说明它已经不是
原始识别结果」，但实际上**没有任何地方给 `style_docs` 行置过这个字段**——
`saveStyleDoc` 插入时硬编码 `customized: 0`、更新时压根不带这一列，
`recognize-doc.service.ts` 建的 doc 也是 `meta.customized: false`。
所以后台那个「已改」徽标对 `style_docs` 行永远不会亮。

现在不出问题，是因为**用户可见的那个标记走的是每页的 `edited`**（Task 7），
`replacePagePrompt` 确实置了它。隐患在别处：`customized` 本来防的是「内置风格被改过之后
启动时又被代码里的真值覆盖」，而今天没有任何内置 `style_docs` 会被播种，所以是潜伏的。
**哪天要播种内置风格文档，`replacePagePrompt`（或 `saveStyleDoc`）必须一起置 `customized`**，
否则用户对内置风格的第一处修改会在下次启动时被静默还原。

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm --filter @lumen/server-core test
```

期望：全绿。

- [ ] **Step 5: 导出并提交**

在 `packages/server-core/src/index.ts` 的 `export * from './services/recognize-doc.service.js';` 后面加一行：

```ts
export * from './services/redraw-page.service.js';
```

**注意：只加这一行，不要顺手把 `page-prompt-kit.js` 也导出去。** 那三个原语是**内部件**，
导出去它们就成了包级 API，`generateMock` 还会连带泄漏 `ReturnType<typeof lintMockHtml>`
这种没人想维护的签名。有需要的话在包内直接 `./page-prompt-kit.js` 引。

```bash
git add packages/server-core/src/services/redraw-page.service.ts packages/server-core/src/services/redraw-page.test.ts packages/server-core/src/index.ts
git -c user.name=sky -c user.email=sky@localhost commit -m "$(cat <<'EOF'
feat(style): 永久替换一个页类型的提示词与样机

单独开一条路而不是复用 saveStyleDoc：那条要整个 doc 原样回传，
中间任何一个字段丢了都会被静默写掉。这里只收要改的两项，
其余从库里读出来原样带过。

issues 由服务端拿这套风格的配色重跑 lint 算出来——那是派生数据，
客户端算不了。
EOF
)"
```

---

## Task 5.5: 补上用量落账（含一个既存缺口）

单页重识别这条路一次编辑要花掉最多五次真金白银的模型调用（分页 1 次 + 写提示词最多 2 次
+ 样机最多 2 次）。不挂 `onUsage` 的话，它们一条都不进 `usage_records`，而
「用量与计费」页正是从那张表算的——整块功能的花费会**静默消失**，没有任何报错。

审查还挖出**既存缺口**：`recognize-doc.service.ts` 里 `const gateway = buildGateway();`
同样没挂 `onUsage`。也就是说上一轮做的整套风格识别（一轮约二十次调用）
**费用一直没落账**。这条规矩在 `recognize.service.ts`（「否则用量页会漏掉这一整类开销」）
与 `design-vision.service.ts` 里都写着，只有这一处漏了。

**Files:**
- Modify: `packages/server-core/src/services/provider.service.ts`
- Modify: `packages/server-core/src/services/recognize-doc.service.ts`

- [ ] **Step 1: 把已经抄了两遍的落账网关抽成一个函数**

`recognize.service.ts` 与 `design-vision.service.ts` 里各有一份十五行、逐字段抄的
`buildGateway({ onUsage: { record: ... } })`。第三条路马上要用，别再抄第三份。

**放哪：新建 `packages/server-core/src/services/billed-gateway.ts`，不要塞进
`provider.service.ts`。** 那个文件里 `GatewayDeps.onUsage` 的注释写着「由调用方注入，
**避免本服务依赖 usage 表结构**」——`billedGateway` 正是那个「调用方」，
塞进去就把这条反转拆掉了。

```ts
import type { ProviderGateway } from '@lumen/provider-gateway';
import { buildGateway } from './provider.service.js';
import { recordUsage } from './usage.service.js';

/**
 * 建一个会把花费落账的网关。
 *
 * 不挂 `onUsage` 的网关，它发起的调用**不进 `usage_records`**，而「用量与计费」页
 * 正是从那张表算的——漏挂不会报错，只会让整类开销从账上消失。所以凡是真花钱的
 * 调用点，一律走这个函数，不要直接 `buildGateway()`。
 */
export function billedGateway(tenantId: string, userId: string): ProviderGateway {
  return buildGateway({
    onUsage: {
      record: (e) => recordUsage({
        tenantId, userId,
        taskType: e.taskType, kind: e.kind, providerId: e.providerId, model: e.model,
        amount: e.amount, inputTokens: e.inputTokens, outputTokens: e.outputTokens,
        cost: e.cost, currency: e.currency, latencyMs: e.latencyMs,
        ok: e.ok, degradeReason: e.degradeReason,
      }),
    },
  });
}
```

（`usage.service.ts` 只引 db / crypto / ir-schema，不引 provider，所以不成环。）

`packages/server-core/src/index.ts` 里加一行 `export * from './services/billed-gateway.js';`——
路由要用它。

```ts
/**
 * 建一个会把花费落账的网关。
 *
 * 不挂 `onUsage` 的网关，它发起的调用**不进 `usage_records`**，而「用量与计费」页
 * 正是从那张表算的——漏挂不会报错，只会让整类开销从账上消失。所以凡是真花钱的
 * 调用点，一律走这个函数，不要直接 `buildGateway()`。
 */
export function billedGateway(tenantId: string, userId: string): ProviderGateway {
  return buildGateway({
    onUsage: {
      record: (e) => recordUsage({
        tenantId, userId,
        taskType: e.taskType, kind: e.kind, providerId: e.providerId, model: e.model,
        amount: e.amount, inputTokens: e.inputTokens, outputTokens: e.outputTokens,
        cost: e.cost, currency: e.currency, latencyMs: e.latencyMs,
        ok: e.ok, degradeReason: e.degradeReason,
      }),
    },
  });
}
```

`recordUsage` 从 `./usage.service.js` 引，字段照抄 `design-vision.service.ts` 里那一份。

- [ ] **Step 2: 修掉既存缺口**

`recognize-doc.service.ts` 的 `runDocRecognition` 里：

```ts
const gateway = billedGateway(input.tenantId, input.userId);
```

`DocRecognitionInput` 里 `tenantId` / `userId` 本来就有（`runDocRecognition` 收下了一直没用），
不用改接口。

- [ ] **Step 3: 验证与提交**

```bash
pnpm --filter @lumen/server-core test
pnpm --filter @lumen/server-core typecheck
```

现有 107 条应当全过——这次改动不碰任何返回值。

```bash
git add packages/server-core/src/services/billed-gateway.ts packages/server-core/src/services/recognize-doc.service.ts packages/server-core/src/index.ts
git -c user.name=sky -c user.email=sky@localhost commit -m "fix(style): 风格识别的花费一直没落账；把落账网关抽成一个函数"
```

**这轮先不动 `recognize.service.ts` 与 `design-vision.service.ts` 里那两份。**
它们行为是对的，换过去是纯重构，混进来只会让 diff 变大、收益为零。
那两处的收敛另起一次提交做。

---

## Task 6: 三条 API 路由

**Files:**
- Modify: `apps/api/src/routes/styles.ts`
- Test: `apps/api/src/routes/styles.test.ts`（新建）

- [ ] **Step 1: 写失败的测试**

新建 `apps/api/src/routes/styles.test.ts`：

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Server } from 'node:http';

const tmp = mkdtempSync(join(tmpdir(), 'lumen-styles-'));
process.env.NODE_ENV = 'test';
process.env.LUMEN_DB_PATH = join(tmp, 'test.db');
process.env.LUMEN_SECRET_KEY = 'test-secret-key-0123456789abcdefghijklmnop';

const { createApp } = await import('../app.js');
const { migrate, ensureSeed, closeDb, saveStyleDoc } = await import('@lumen/server-core');
const { StyleDoc } = await import('@lumen/ir-schema');

migrate();
ensureSeed();

const server: Server = createApp().listen(0);
await new Promise<void>((r) => server.once('listening', () => r()));
const addr = server.address();
const port = typeof addr === 'object' && addr ? addr.port : 0;
const base = `http://127.0.0.1:${port}`;

test.after(() => {
  server.close();
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

interface Res { status: number; body: { ok: boolean; data?: any; error?: { code: string; message: string } } }

async function api(path: string, init: RequestInit = {}): Promise<Res> {
  const res = await fetch(base + path, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : { ok: false } };
}

const OK_PROMPT = '角色：x\n任务：y\n视觉与排版要求：\n1. z\n代码要求（非常重要）：\n1. w';

let token = '';
let styleId = '';
const auth = () => ({ authorization: `Bearer ${token}` });

test('准备一个用户与一套风格', async () => {
  const r = await api('/api/auth/register', {
    method: 'POST', body: JSON.stringify({ username: 'styleuser', password: 'abcd1234' }),
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  token = r.body.data.accessToken;

  styleId = `styles-test-${Date.now().toString(36)}`;
  const saved = saveStyleDoc(StyleDoc.parse({
    styleId, version: '1.0', name: '测试风格', description: '一句话说明',
    pagePrompts: {
      cover: { pageType: 'cover', prompt: OK_PROMPT, mockHtml: '<div>样机</div>', source: 'reference' },
    },
  }));
  assert.equal(saved.ok, true);
});

test('pageType 不在枚举里时明确报错，而不是当成 text 处理', async () => {
  const r = await api(`/api/styles/docs/${styleId}/pages/not-a-type/slides`, {
    method: 'POST', headers: auth(), body: JSON.stringify({ image: 'data:image/png;base64,AAAA' }),
  });
  assert.equal(r.status, 400);
});

test('裁切框越界时明确报错', async () => {
  const r = await api(
    `/api/styles/docs/${styleId}/pages/cover/recognize-stream?image=x&x0=0&y0=0&x1=2&y1=1`,
    { headers: auth() },
  );
  assert.equal(r.status, 400);
});

test('裁切框反了（x1 小于 x0）也报错', async () => {
  const r = await api(
    `/api/styles/docs/${styleId}/pages/cover/recognize-stream?image=x&x0=0.8&y0=0&x1=0.2&y1=1`,
    { headers: auth() },
  );
  assert.equal(r.status, 400);
});

test('风格不存在时替换报 404', async () => {
  const r = await api('/api/styles/docs/not-a-style/pages/cover', {
    method: 'PUT', headers: auth(),
    body: JSON.stringify({ prompt: OK_PROMPT, mockHtml: '<div>x</div>' }),
  });
  assert.equal(r.status, 404);
});

test('替换成功后那一格换了、其余没动', async () => {
  const r = await api(`/api/styles/docs/${styleId}/pages/cover`, {
    method: 'PUT', headers: auth(),
    body: JSON.stringify({ prompt: OK_PROMPT, mockHtml: '<div>新的</div>' }),
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));

  const detail = await api(`/api/styles/docs/${styleId}`, { headers: auth() });
  assert.equal(detail.body.data.pagePrompts.cover.mockHtml, '<div>新的</div>');
  assert.equal(detail.body.data.pagePrompts.cover.source, 'manual');
  assert.equal(detail.body.data.pagePrompts.cover.edited, true);
});

test('提示词不合契约时照样保存，但把问题回给界面', async () => {
  const r = await api(`/api/styles/docs/${styleId}/pages/cover`, {
    method: 'PUT', headers: auth(),
    // 缺了「代码要求（非常重要）：」那一段
    body: JSON.stringify({ prompt: '角色：x\n任务：y\n视觉与排版要求：\n1. z', mockHtml: '<div>x</div>' }),
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.data.issues.length > 0, '问题必须回给界面，否则从重试到落库全程无人知晓');
});

test('传了非 PNG 的图时明确报 400，而不是让它变成 500', async () => {
  // decodeImage 排在模型调用之前，所以这条不会真的去打模型——坏图在花钱之前就炸
  const r = await api(`/api/styles/docs/${styleId}/pages/cover/slides`, {
    method: 'POST', headers: auth(),
    body: JSON.stringify({ image: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' }),
  });
  assert.equal(r.status, 400);
});

test('未登录时三条路由都拒绝', async () => {
  const calls = [
    api(`/api/styles/docs/${styleId}/pages/cover/slides`, {
      method: 'POST', body: JSON.stringify({ image: 'x' }),
    }),
    api(`/api/styles/docs/${styleId}/pages/cover/recognize-stream?image=x&x0=0&y0=0&x1=1&y1=1`),
    api(`/api/styles/docs/${styleId}/pages/cover`, {
      method: 'PUT', body: JSON.stringify({ prompt: 'x', mockHtml: 'y' }),
    }),
  ];
  for (const r of await Promise.all(calls)) assert.equal(r.status, 401);
});
```

**裁切框那两条用例依赖一个顺序**：路由里要**先校验框、再解析图片引用**。
反过来写的话，`image=x` 这个假引用会先被 `resolveImages` 拒掉，用例就变成在测
「图片引用不合法」而不是「框不合法」——两条都是 400，分不出哪条在起作用。

- [ ] **Step 2: 跑测试确认失败**

```bash
pnpm --filter @lumen/api test
```

期望：三条路由都 404（还没注册）。

- [ ] **Step 3: 实现**

在 `apps/api/src/routes/styles.ts` 里，`stylesRouter.delete('/docs/:styleId', ...)` **之后**加
（必须在 `/:styleId` 那条之前——否则 `/docs` 会被 `/:styleId` 先吃掉，这是踩过的坑）：

```ts
const CropBoxQuery = z.object({
  image: z.string().min(1),
  x0: z.coerce.number().min(0).max(1),
  y0: z.coerce.number().min(0).max(1),
  x1: z.coerce.number().min(0).max(1),
  y1: z.coerce.number().min(0).max(1),
});

/** 分页：给用户挑一页用。只分页，不写提示词 */
stylesRouter.post('/docs/:styleId/pages/:pageType/slides', async (req, res) => {
  const p = parseParams(z.object({ styleId: z.string().min(1), pageType: PageType }), req);
  const body = parseBody(z.object({ image: z.string().min(1) }), req);
  const styleId = decodeURIComponent(p.styleId);
  if (!styleDocExists(styleId)) throw notFound(`风格不存在：${styleId}`);
  const [image] = await resolveImages([body.image]);
  const { splitForPick, billedGateway, publicRedrawMessage } = await import('@lumen/server-core');
  let slides;
  try {
    slides = await splitForPick(image!, billedGateway(tenantOf(req), userIdOf(req)));
  } catch (err) {
    // 认得出的失败（图不是 PNG）翻成人话给 400；别的原样往上抛，由错误中间件记成 500——
    // 把 provider 挂掉说成「图读不了」是撒谎。翻译走 `publicRedrawMessage`，
    // SSE 那条路由用的是同一份，同一个失败不该给两种待遇
    if (err instanceof Error && err.message.startsWith('PNG_DECODE_FAILED')) {
      throw invalid(publicRedrawMessage(err));
    }
    throw err;
  }
  ok(res, { slides });
});

/**
 * 单页重识别。
 *
 * 传裁切框而不是传下标去重新分页：模型调用不是确定性的，第二次分页可能切出不一样的框，
 * 用户挑的那一页就会与真正识别的那一页对不上，而且这种错配是静默的。
 */
stylesRouter.get('/docs/:styleId/pages/:pageType/recognize-stream', async (req, res) => {
  const p = parseParams(z.object({ styleId: z.string().min(1), pageType: PageType }), req);
  const q = parseQuery(CropBoxQuery, req);
  if (q.x1 <= q.x0 || q.y1 <= q.y0) throw invalid('裁切框不合法：x1 必须大于 x0，y1 必须大于 y0');

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const [image] = await resolveImages([q.image]);
    const { redrawPage, billedGateway } = await import('@lumen/server-core');
    const gen = redrawPage({
      styleId: decodeURIComponent(p.styleId),
      pageType: p.pageType,
      imageUrl: image!,
      box: { x0: q.x0, y0: q.y0, x1: q.x1, y1: q.y1 },
      gateway: billedGateway(tenantOf(req), userIdOf(req)),
    });
    for await (const evt of gen) {
      if (res.writableEnded) break;
      send(evt.event, evt.data);
    }
  } catch (err) {
    send('error', { message: err instanceof Error ? err.message : String(err) });
  } finally {
    res.end();
  }
});

/** 永久替换一个页类型的提示词与样机 */
stylesRouter.put('/docs/:styleId/pages/:pageType', async (req, res) => {
  const p = parseParams(z.object({ styleId: z.string().min(1), pageType: PageType }), req);
  const body = parseBody(z.object({
    // `.trim()` 是有意的：不带它的话纯空白串能过校验，而 `replacePagePrompt` 里
    // 「整个 doc 一条非空提示词都没有」那条分支会抛**普通** Error，被错误中间件
    // 映射成 500——用户输入的问题该用 4xx 表达。加上它那条分支才真的不可达
    prompt: z.string().trim().min(1),
    mockHtml: z.string(),
  }), req);
  const { replacePagePrompt } = await import('@lumen/server-core');
  const { doc, issues } = replacePagePrompt({
    styleId: decodeURIComponent(p.styleId),
    pageType: p.pageType,
    prompt: body.prompt,
    mockHtml: body.mockHtml,
  });
  // 契约问题带出去：不阻断保存，但界面要能如实说「存了，不过这条提示词缺了一段」
  ok(res, { styleId: doc.styleId, pageType: p.pageType, issues });
});
```

import 行补上：`PageType`（从 `@lumen/ir-schema`）、`notFound`（从 `@lumen/server-core`）、
`styleDocExists`（加进那串 `@lumen/server-core` 的具名 import 里）。

- [ ] **Step 4: 跑测试确认通过**

```bash
pnpm --filter @lumen/api test
```

期望：全绿。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/routes/styles.ts apps/api/src/routes/styles.test.ts
git -c user.name=sky -c user.email=sky@localhost commit -m "$(cat <<'EOF'
feat(style): 单页重识别的三条路由

分页走短 POST，重识别走 SSE，替换走 PUT。三条都注册在 /:styleId 之前，
否则 /docs 会被 /:styleId 先吃掉。

重识别传裁切框而不是传下标去重新分页：模型调用不是确定性的，第二次分页
可能切出不一样的框，用户挑的那一页会与真正识别的那一页静默错配。
EOF
)"
```

---

## Task 7: 前端编辑入口

**Files:**
- Modify: `apps/web/src/pages/StyleLibrary.tsx`

- [ ] **Step 1: 卡片加「编辑」**

`StyleDocCard` 的 props 加一个 `onEdit`：

```tsx
function StyleDocCard({ style, onOpen, onEdit }: { style: StyleDocSummary; onOpen: () => void; onEdit: () => void }) {
```

底部操作条改成：

```tsx
        ) : (
          <>
            <Button pill size="sm" variant="ghost" icon="Pencil" onClick={onEdit}>编辑</Button>
            <Button pill size="sm" variant="ghost" icon="Trash2" onClick={() => setConfirming(true)}>删除</Button>
          </>
        )}
```

调用处：

```tsx
<StyleDocCard key={s.styleId} style={s} onOpen={() => setSelected(s.styleId)} onEdit={() => setSelected(s.styleId)} />
```

`onOpen` 与 `onEdit` 现在做同一件事（打开详情弹框）——这颗按钮是**显式入口**，
不是第二个界面。等 Task 8 把编辑视图接上之后，它仍然打开同一个弹框。

- [ ] **Step 2: 详情里每个页类型加「编辑」与「已改过」标记**

`StyleDocDrawer` 里那块标题行改成：

```tsx
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-[var(--text-1)]">{PAGE_TYPE_LABEL[t]}</span>
                    <Badge tone={p.source === 'manual' ? 'brand' : 'neutral'}>
                      {p.source === 'manual' ? '手改' : p.source === 'reference' ? '参考图里有' : '推导'}
                    </Badge>
                    {p.edited && <Badge tone="success">已改过</Badge>}
                    <button
                      type="button"
                      className="ml-auto text-[12px] text-[var(--text-3)] underline-offset-2 hover:underline"
                      onClick={() => setOpenPrompt(openPrompt === t ? null : t)}
                    >
                      {openPrompt === t ? '收起提示词' : '看提示词'}
                    </button>
                  </div>
```

（`p.edited` 要在详情接口的返回类型里——把
`pagePrompts: Record<string, { prompt: string; mockHtml: string; source: string }>`
改成 `Record<string, { prompt: string; mockHtml: string; source: string; edited?: boolean }>`。）

- [ ] **Step 3: 浏览器里确认**

`pnpm dev` 起 web，打开 `/styles`：

- 每张卡片底部是「编辑」「删除」两颗
- 点「编辑」打开详情弹框
- 详情里每个页类型标题行有来源徽标，改过的显示「已改过」

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/pages/StyleLibrary.tsx
git -c user.name=sky -c user.email=sky@localhost commit -m "$(cat <<'EOF'
feat(style): 风格卡片与详情加上编辑入口

卡片底部的「编辑」打开的就是详情弹框——它是一颗显式入口，不是第二个界面；
现在「点卡片能打开详情」只靠 hover 变色的暗示。

详情里每个页类型把来源徽标拆成 参考图里有 / 推导 / 手改，改过的另加「已改过」。
edited 这个字段 schema 里早就有，一直没人读。
EOF
)"
```

---

## Task 8: 编辑视图 `RedrawPagePanel`

**Files:**
- Create: `apps/web/src/components/RedrawPagePanel.tsx`
- Modify: `apps/web/src/pages/StyleLibrary.tsx`

- [ ] **Step 1: 写组件**

新建 `apps/web/src/components/RedrawPagePanel.tsx`：

```tsx
import { useRef, useState } from 'react';
import { Badge, Button, Icon, useToast } from '@lumen/ui';
import { PAGE_TYPE_LABEL, type PageType } from '@lumen/ir-schema';
import { api, streamSse } from '../api/client.js';
import type { StyleDoc } from '../api/types.js';
import { uploadReferenceImages } from '../studio/upload.js';
import { HtmlMock } from './HtmlMock.js';

/**
 * 单页重识别：上传参考图 → 挑一页 → 看新旧对比 → 确定替换。
 *
 * 三态共用一个面板而不是串三个弹框：一层表面就够，省掉嵌套遮罩与焦点陷阱。
 * 按下「确定替换」之前对服务端零副作用，所以中途关掉直接丢弃，不用二次确认。
 */

interface Slide {
  index: number;
  pageType: PageType;
  box: { x0: number; y0: number; x1: number; y1: number };
}

interface RedrawResult {
  prompt: string;
  mockHtml: string;
  issues: string[];
  /** `lintStylePrompt` 给出的契约问题，`done` 事件原样带出来。
   *  不是「缺了哪几个小节」——顺序错、写死 img src 也算 */
  promptIssues: { rule: string; message: string }[];
}

const STEPS = [
  { key: 'crop', label: '裁出这一页' },
  { key: 'read', label: '写提示词' },
  { key: 'mock', label: '出样机' },
] as const;

export function RedrawPagePanel({
  doc, pageType, current, onDone, onBack,
}: {
  doc: Pick<StyleDoc, 'styleId' | 'palette' | 'fontFamily' | 'theme'>;
  pageType: PageType;
  /** 当前的样机，用来做「旧 ↔ 新」对比 */
  current: string;
  onDone: () => void;
  onBack: () => void;
}) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [slides, setSlides] = useState<Slide[] | null>(null);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState<string>('');
  const [result, setResult] = useState<RedrawResult | null>(null);
  const [openPrompt, setOpenPrompt] = useState(false);
  const abortRef = useRef<(() => void) | null>(null);

  async function onPickFile(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setResult(null);
    setSlides(null);
    try {
      const [url] = await uploadReferenceImages([files[0]!]);
      setImage(url!);
      const r = await api.post<{ slides: Slide[] }>(
        `/styles/docs/${encodeURIComponent(doc.styleId)}/pages/${pageType}/slides`,
        { image: url },
      );
      // 只分出一页就直接进下一步——没有可挑的，多问一次只是碍事
      if (r.slides.length <= 1) {
        const only = r.slides[0] ?? { index: 0, pageType, box: { x0: 0, y0: 0, x1: 1, y1: 1 } };
        start(only);
      } else {
        setSlides(r.slides);
      }
    } catch (err) {
      toast.error('分页失败', err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  }

  function start(slide: Slide) {
    if (!image) return;
    setSlides(null);
    setRunning(true);
    setResult(null);
    const qs = new URLSearchParams({
      image,
      x0: String(slide.box.x0), y0: String(slide.box.y0),
      x1: String(slide.box.x1), y1: String(slide.box.y1),
    });
    abortRef.current = streamSse(
      `/styles/docs/${encodeURIComponent(doc.styleId)}/pages/${pageType}/recognize-stream?${qs}`,
      {
        onEvent: (event, data) => {
          if (event === 'progress') {
            setStep((data as { step: string }).step);
          } else if (event === 'done') {
            setResult(data as RedrawResult);
            setRunning(false);
            setStep('');
          } else if (event === 'error') {
            setRunning(false);
            setStep('');
            toast.error('重识别失败', (data as { message: string }).message);
          }
        },
        onError: (err) => {
          setRunning(false);
          setStep('');
          toast.error('重识别中断', err.message);
        },
      },
    );
  }

  async function confirm() {
    if (!result) return;
    try {
      await api.put(`/styles/docs/${encodeURIComponent(doc.styleId)}/pages/${pageType}`, {
        prompt: result.prompt,
        mockHtml: result.mockHtml,
      });
      toast.success('已替换', PAGE_TYPE_LABEL[pageType]);
      onDone();
    } catch (err) {
      toast.error('替换失败', err instanceof Error ? err.message : String(err));
    }
  }

  function reset() {
    abortRef.current?.();
    setImage(null);
    setSlides(null);
    setResult(null);
    setRunning(false);
    setStep('');
  }

  return (
    <div className="flex flex-col gap-4 px-5 py-4">
      <div className="flex items-center gap-2">
        <Button pill size="sm" variant="ghost" icon="ChevronLeft" onClick={() => { reset(); onBack(); }}>
          返回风格详情
        </Button>
        <span className="text-[13px] text-[var(--text-2)]">
          改【{PAGE_TYPE_LABEL[pageType]}】。配色与字体沿用这套风格，换的是版式与视觉语言
        </span>
      </div>

      {!image && (
        <label className="flex flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-dashed border-[var(--border)] px-6 py-10 text-center transition-colors hover:bg-[var(--surface-1)]">
          <Icon name="ImageUp" size={24} />
          <span className="text-[13px] text-[var(--text-2)]">
            {uploading ? '正在上传…' : '点这里选一张参考图'}
          </span>
          <span className="text-[12px] text-[var(--text-3)]">
            只收一张。整页导出或拼图都行，拼图会让你挑其中一页
          </span>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void onPickFile(e.target.files)}
          />
        </label>
      )}

      {image && slides && (
        <div className="flex flex-col gap-2">
          <span className="text-[13px] text-[var(--text-2)]">这张图里有 {slides.length} 页，点你要的那一页</span>
          <div className="relative w-full max-w-[640px] overflow-hidden rounded-[var(--radius-inner)] border border-[var(--border-subtle)]">
            <img src={image} alt="参考图" className="block w-full" />
            {slides.map((s) => (
              <button
                key={s.index}
                type="button"
                onClick={() => start(s)}
                title={PAGE_TYPE_LABEL[s.pageType]}
                className="absolute border-2 border-[var(--brand)] bg-[var(--brand)]/10 transition-colors hover:bg-[var(--brand)]/25"
                style={{
                  left: `${s.box.x0 * 100}%`,
                  top: `${s.box.y0 * 100}%`,
                  width: `${(s.box.x1 - s.box.x0) * 100}%`,
                  height: `${(s.box.y1 - s.box.y0) * 100}%`,
                }}
              >
                <span className="absolute left-1 top-1 rounded-[4px] bg-[var(--brand)] px-1.5 py-0.5 text-[11px] text-white">
                  {PAGE_TYPE_LABEL[s.pageType]}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {running && (
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-[var(--text-2)]">正在重识别</span>
          {STEPS.map((s) => (
            <Badge key={s.key} tone={step === s.key ? 'brand' : 'neutral'}>{s.label}</Badge>
          ))}
        </div>
      )}

      {result && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] text-[var(--text-3)]">现在</span>
              <HtmlMock doc={doc} html={current} width={380} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[12px] text-[var(--text-3)]">替换后</span>
              <HtmlMock doc={doc} html={result.mockHtml} width={380} />
            </div>
          </div>

          {result.promptIssues.length > 0 && (
            <span className="text-[12px] text-[var(--text-3)]">
              提示词有 {result.promptIssues.length} 处不合契约，仍可替换：
              {result.promptIssues.map((i) => i.message).join('；')}
            </span>
          )}
          {result.issues.length > 0 && (
            <span className="text-[12px] text-[var(--text-3)]">
              样机有 {result.issues.length} 处问题：{result.issues.slice(0, 2).join('；')}
            </span>
          )}

          <button
            type="button"
            className="self-start text-[12px] text-[var(--text-3)] underline-offset-2 hover:underline"
            onClick={() => setOpenPrompt((v) => !v)}
          >
            {openPrompt ? '收起提示词' : '看新提示词'}
          </button>
          {openPrompt && (
            <pre className="max-h-[240px] overflow-auto whitespace-pre-wrap rounded-[var(--radius-inner)] bg-[var(--surface-1)] px-3 py-2 text-[12px] leading-[1.7] text-[var(--text-2)]">
              {result.prompt}
            </pre>
          )}

          <div className="flex items-center gap-2">
            <Button pill variant="primary" onClick={() => void confirm()}>确定替换</Button>
            <Button pill variant="ghost" onClick={reset}>取消</Button>
            <span className="text-[12px] text-[var(--text-3)]">
              替换只影响之后新生成的页面，已经生成的页面不会跟着变
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
```

`api.put` 已经存在（`apps/web/src/api/client.ts:130`），直接用。
`ImageUp` / `Pencil` / `ChevronLeft` 都是 lucide 的标准图标名，`Icon` 从 `lucide-react` 直接取，
名字写错会退化成占位方块而不是整页崩掉。

- [ ] **Step 2: 在详情弹框里挂上**

`StyleLibrary.tsx` 的 `StyleDocDrawer` 加一个 `editing` 状态：

```tsx
  const [editing, setEditing] = useState<PageType | null>(null);
```

标题行那颗「编辑」按钮：

```tsx
                    <button
                      type="button"
                      className="text-[12px] text-[var(--text-3)] underline-offset-2 hover:underline"
                      onClick={() => setEditing(t)}
                    >
                      编辑
                    </button>
```

（放在「看提示词」左边，把「看提示词」上的 `ml-auto` 去掉，改到这颗按钮上。）

Drawer 的内容按 `editing` 分叉：

```tsx
      {!doc ? (
        <div className="py-16"><PageLoader label="正在加载" /></div>
      ) : editing ? (
        <RedrawPagePanel
          doc={doc}
          pageType={editing}
          current={doc.pagePrompts[editing]?.mockHtml ?? ''}
          onDone={() => {
            setEditing(null);
            void qc.invalidateQueries({ queryKey: ['style-doc', styleId] });
            void qc.invalidateQueries({ queryKey: ['style-docs'] });
          }}
          onBack={() => setEditing(null)}
        />
      ) : (
        <div className="flex flex-col gap-5 px-5 py-4">
          {/* 原有的九个页类型网格 */}
        </div>
      )}
```

`StyleDocDrawer` 里加 `const qc = useQueryClient();`。
关闭 Drawer 时要把 `editing` 一起清掉（现有的 `onOpenChange` 里 `setOpenPrompt(null)` 旁边加 `setEditing(null)`）。

- [ ] **Step 3: 浏览器里走一遍完整流程**

`pnpm dev`，打开 `/styles`，找一套风格：

1. 点卡片「编辑」→ 弹框打开
2. 点某个页类型的「编辑」→ 进编辑视图，顶部有「返回风格详情」
3. 选一张拼图 → 出现「这张图里有 N 页，点你要的那一页」+ 可点矩形
4. 点一块 → 三个阶段徽标依次点亮 → 出现「现在 ↔ 替换后」两张样机
5. 点「确定替换」→ 回到详情，那一页的样机换了、徽标变成「手改」「已改过」
6. 刷新页面 → 替换还在

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/components/RedrawPagePanel.tsx apps/web/src/pages/StyleLibrary.tsx
git -c user.name=sky -c user.email=sky@localhost commit -m "$(cat <<'EOF'
feat(style): 单页重识别的编辑视图

上传 → 挑页 → 新旧对比 → 确定替换，三态共用一个面板而不是串三个弹框。

挑页把检测到的框按百分比叠在用户刚上传的那张图上，而不是给一排缩略图——
能看见它在整张图里的位置，也省掉服务端裁图编码那几百 KB。

结果态点「取消」回到上传态而不是退回详情：刚看到不像，下一步多半就是换张图。
EOF
)"
```

---

## Task 9: 全量验证

**Files:** 无（只跑验证）

- [ ] **Step 1: 全量测试**

```bash
pnpm test
```

期望：全绿。记录通过数——本计划之前是 519，这次新增约 20 条。

- [ ] **Step 2: 全量类型检查**

```bash
pnpm -r typecheck
```

期望：19 个包全过。

- [ ] **Step 3: 构建**

```bash
pnpm build
```

期望：emoji lint 通过、类型检查通过、双前端构建成功。

- [ ] **Step 4: 真实模型端到端**

用真模型跑一次单页重识别（约 40~90 秒），确认：

- 新提示词里写的是**这套风格的配色变量**，不是参考图的颜色
- 新样机的 `:root` 里七个变量值与这套风格的 palette 逐字对上
- 旧样机与新样机并排看着是同一套调子，只有版式不同

- [ ] **Step 5: 提交（若有修补）**

```bash
git add -A
git -c user.name=sky -c user.email=sky@localhost commit -m "test(style): 单页重识别端到端验证后的修补"
```

---

## 自查记录

**规格覆盖**：

| 设计文档里的要求 | 落在哪个 Task |
|---|---|
| 三条路由 | Task 6 |
| 分页给用户挑（多于一张才挑） | Task 3、Task 8 Step 1 |
| 传框不传下标 | Task 3、Task 6 |
| 配色注入写提示词 | Task 2、Task 4 |
| 字体跟随（明写进模型调用） | Task 2、Task 4：`fontBlock` 随 `doc.fontFamily` 注入 `writePagePrompt` 与 `generateMock`，与配色同一套**可选**路径（全量识别不传）。渲染层注入不够——片段的 `body{font-family:…}` 与注入的 `--font-sans` 同优先级又排在后，会把它盖掉 |
| 替换只动一格 | Task 5 |
| issues 由服务端算 | Task 5 |
| 四段校验 + 重试一次 | Task 4 |
| 卡片与详情的编辑入口 | Task 7 |
| 「已改过」标记 | Task 7 |
| 三态编辑视图 | Task 8 |
| 取消回上传态 | Task 8 Step 1 的 `reset()` |
| 页面文案「不影响已生成的页面」 | Task 8 Step 1 |
| 前端不做组件测试 | 全篇未安排 |
| 边界：分页找不到页 / 空提示词 / lint 不过 / 风格不存在 | Task 3、4、5 的测试 |

**类型一致性**：`PickSlide`、`RedrawEvent`、`RedrawInput`、`ReplaceInput`、
`WritePromptOptions` 在 Task 2、3、4、5 里定义一次，之后各 Task 只引用不重定义。
`CropBox` **不重新定义**——直接复用 `@lumen/style-engine/server` 早就导出的那个。
`splitForPick(imageUrl, gateway)`（`gateway` **必传**，不给默认值——默认值会让「忘了挂
`onUsage`」变成静默的记账缺口）与 `redrawPage(input)` 的签名在 Task 3、4、6 里一致。
`fakeGateway` 只在 Task 1 定义一次（收回复数组），Task 2 追加用例时直接复用。
