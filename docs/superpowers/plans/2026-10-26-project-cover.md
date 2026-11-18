# 项目库封面与「有新变更」实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 项目库的每张卡片显示那本演示第 1 页的真实渲染；项目在上次打开之后被改过时，卡片上标出「有新变更」。

**Architecture:** 封面走一个新端点 `GET /projects/:id/cover` 只取第 0 页，卡片用 IntersectionObserver 滚进视口才请求、才挂 iframe——**iframe 数是唯一的硬约束**，一次挂满列表在项目变多时会卡住。渲染复用工作台那套 `HtmlMock`（新链）；旧链与未生成的项目退回文字占位。「有新变更」把 `projects.updatedAt` 与 localStorage 里记的「上次打开时间」比一比。

**Tech Stack:** React 18 + React Query、Express、node:test（`node --import tsx --test`，**tsx 剥类型但不做类型检查**，测试失败是运行时断言失败）。

设计文档：`docs/superpowers/specs/2026-10-26-project-cover-design.md`

---

## 文件结构

| 文件 | 责任 |
|---|---|
| `apps/api/src/routes/projects.ts`（改） | 加 `GET /:id/cover`——只取第 0 页 |
| `apps/api/src/routes/projects.test.ts`（改） | 该端点的三条用例 |
| `apps/web/src/workbench/seen.ts`（新建） | 「上次打开时间」的读写与「有没有变」的判定。**纯逻辑，storage 可注入** |
| `apps/web/src/workbench/seen.test.ts`（新建） | 上面那三条 |
| `apps/web/src/components/ProjectCover.tsx`（新建） | 封面：懒加载 + 量宽 + 选渲染器 + 占位兜底 |
| `apps/web/src/pages/Projects.tsx`（改） | 卡片用 `ProjectCover`；加「有新变更」徽标 |
| `apps/web/src/pages/Workbench.tsx`（改） | 打开项目时记 `seenAt`。**注意在 `pages/` 下，不在 `workbench/`** |

**为什么 `seen.ts` 的 storage 要可注入**：`apps/web` 只有纯函数测试（`components/step-progress.test.ts` 就是直接 import 一个函数来测），没有组件测试、也没有 DOM 环境。storage 写死在 `localStorage` 上就没法测；做成默认参数 `= localStorage` 之后，测试传一个假的就行，生产代码不用改。

---

## Task 1: 封面端点

**Files:**
- Modify: `apps/api/src/routes/projects.ts`（加在 `GET /:id/pages` 之后，`POST /:id/pages/:index/generate` 之前）
- Test: `apps/api/src/routes/projects.test.ts`

- [ ] **Step 1: 写失败的测试**

加到 `apps/api/src/routes/projects.test.ts` 末尾。它用的 `api()` / `auth()` / `tokenA` / `tokenB` / `projectId` 都是那个文件里已有的：

```ts
/**
 * 封面端点：只回第 0 页。
 *
 * **不能把第 0 页塞进 `GET /projects`**：列表上每张卡片都要渲染一个 iframe，跟着列表一起发
 * 等于一次挂「项目总数」个 iframe。所以单独开一个端点，配前端的懒加载用。
 */
test('封面端点只回第 0 页，没有页面时回 null，别人的项目取不到', async () => {
  const created = await api('/api/projects', {
    method: 'POST', headers: auth(tokenA),
    body: JSON.stringify({ title: '封面端点用例', brief: BRIEF }),
  });
  const pid = created.body.data.projectId as string;

  // 前置条件：一页都没有
  const empty = await api(`/api/projects/${pid}/cover`, { headers: auth(tokenA) });
  assert.equal(empty.status, 200, JSON.stringify(empty.body));
  assert.equal(
    empty.body.data.page, null,
    '一页都没有时要回 null——前端靠它退回文字占位，回 404 或 {} 都会让那条分支写不出来',
  );

  // 落三页进去，端点必须只回第 0 页
  for (let i = 0; i < 3; i++) {
    const p = await api(`/api/projects/${pid}/pages`, {
      method: 'POST', headers: auth(tokenA), body: JSON.stringify({ pageType: 'text' }),
    });
    assert.equal(p.status, 201, JSON.stringify(p.body));
  }

  const one = await api(`/api/projects/${pid}/cover`, { headers: auth(tokenA) });
  assert.equal(one.status, 200);
  assert.ok(one.body.data.page, '有页面之后必须回一页');
  assert.equal(
    one.body.data.page.footer.pageNo, 1,
    '**要的是第 0 页**（页码从 1 起算，所以第 0 页的 pageNo 是 1）。'
    + '回成别的页封面就不是封面了',
  );

  // 别人的项目：`requireProject` 抛的是 403，不是 404
  const denied = await api(`/api/projects/${pid}/cover`, { headers: auth(tokenB) });
  assert.equal(denied.status, 403, '不能读别人项目的封面');
  assert.equal(denied.body.error?.code, 'FORBIDDEN');
});
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `node --import tsx --test apps/api/src/routes/projects.test.ts`
Expected: FAIL —— 新端点还不存在，Express 没有匹配的 handler，`empty.status` 是 404（不是 200）。

- [ ] **Step 3: 实现端点**

在 `apps/api/src/routes/projects.ts` 的 `GET /:id/pages` 那一块之后插入。**不需要加任何 import**——`parseParams` / `IdParam` / `requireProject` / `tenantOf` / `listPages` / `pageIR` / `ok` 都已经是那个文件顶部导入过的：

```ts
/**
 * 封面用的那一页：只取第 0 页。
 *
 * **为什么不把第 0 页塞进 `GET /projects`**：列表上每张卡片都要渲染一个 iframe，
 * 跟着列表一起发等于一次挂「项目总数」个 iframe——50 个项目不是慢一点，是会卡住。
 * 配前端的懒加载（卡片滚进视口才请求），这个端点一次只为看得见的那几张服务。
 *
 * 没有生成过任何页面时回 `null`，前端据此退回文字占位。
 */
projectsRouter.get('/:id/cover', (req, res) => {
  const { id } = parseParams(IdParam, req);
  requireProject(id, tenantOf(req));
  const first = listPages(id).find((row) => row.pageIndex === 0);
  ok(res, { page: first ? pageIR(first) : null });
});
```

- [ ] **Step 4: 跑测试确认它通过**

Run: `node --import tsx --test apps/api/src/routes/projects.test.ts`
Expected: PASS，`fail 0`。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/routes/projects.ts apps/api/src/routes/projects.test.ts
git commit -m "feat(api): 封面端点只取第 0 页"
```

---

## Task 2: `seen.ts`——上次打开时间与「有没有变」

**Files:**
- Create: `apps/web/src/workbench/seen.ts`
- Test: `apps/web/src/workbench/seen.test.ts`

- [ ] **Step 1: 写失败的测试**

新建 `apps/web/src/workbench/seen.test.ts`：

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { markSeen, seenAt, hasChanged, type StorageLike } from './seen.js';

/** 内存版 storage。`apps/web` 没有 DOM 环境，真 `localStorage` 在这里根本不存在 */
function fakeStore(): StorageLike & { dump: () => Record<string, string> } {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => { m.set(k, v); },
    dump: () => Object.fromEntries(m),
  };
}

test('没记过就回 null，不是 0', () => {
  const s = fakeStore();
  assert.equal(
    seenAt('u1', 'prj_a', s), null,
    '**回 0 会让所有项目都变成「有变更」**——`updatedAt` 一定大于 0。'
    + '「没记过」必须是 null，与「记过但时间很早」区分得开',
  );
});

test('记过之后拿得回那个时间，并且是写进去的那个数', () => {
  const s = fakeStore();
  markSeen('u1', 'prj_a', s, 1_700_000_000_000);
  assert.equal(seenAt('u1', 'prj_a', s), 1_700_000_000_000);
  // 只记这一个项目，别的还是没记过
  assert.equal(seenAt('u1', 'prj_b', s), null);
});

test('换 userId 不串：同一个浏览器上换账号是干净的一份', () => {
  const s = fakeStore();
  markSeen('u1', 'prj_a', s, 111);
  markSeen('u2', 'prj_a', s, 222);
  assert.equal(seenAt('u1', 'prj_a', s), 111, '两个账号看同一个项目，各记各的');
  assert.equal(seenAt('u2', 'prj_a', s), 222);
});

test('存储里是坏数据时按「没记过」处理，不抛', () => {
  const s = fakeStore();
  s.setItem('lumen.seen.u1', '{ 这不是 JSON');
  assert.equal(seenAt('u1', 'prj_a', s), null, '坏数据不该让整个项目库白屏');
});

test('hasChanged：没记过不算变、改得比记的晚才算变', () => {
  assert.equal(hasChanged(1000, null), false, '没看过就谈不上「变了」');
  assert.equal(hasChanged(1000, 999), true, '改动晚于上次打开 → 有变更');
  assert.equal(hasChanged(1000, 1000), false, '同一时刻不算变');
  assert.equal(hasChanged(1000, 1001), false, '上次打开晚于改动 → 没有变更');
});
```

- [ ] **Step 2: 跑测试确认它失败**

Run: `node --import tsx --test apps/web/src/workbench/seen.test.ts`
Expected: FAIL —— `Cannot find module './seen.js'`。

- [ ] **Step 3: 实现**

新建 `apps/web/src/workbench/seen.ts`：

```ts
/**
 * 「我上次打开这个项目是什么时候」，以及由它推出来的「它变了吗」。
 *
 * 存在 localStorage，**按 userId 分开**——同一个浏览器上换账号不会串。
 *
 * **为什么是 localStorage 而不是建表**：这是「我看过没有」的本地偏好，不是需要跨设备
 * 一致的事实；建表要多一次迁移 + 一个端点 + 每次打开项目一次写。
 * **已知代价（实测过，方向容易记反）**：换浏览器、换设备或清缓存之后，
 * **所有项目都不再显示「有新变更」**——包括真的被改过的那些，因为「没记录」按「不算变」处理
 * （反过来处理的话，第一次打开项目库会满屏都是标记）。所以代价是**漏报**，不是误报。
 * 要跨设备一致就得建 `project_views(userId, projectId, seenAt)` 表。
 */

/** 只要这两个方法，不要整个 `Storage`——测试传一个内存 Map 就够了 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const keyOf = (userId: string) => `lumen.seen.${userId}`;

function read(userId: string, store: StorageLike): Record<string, number> {
  try {
    const raw = store.getItem(keyOf(userId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    // 存的是个对象、不是数组也不是字符串。坏数据按「没记过」处理——
    // 它不该让整个项目库白屏
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as Record<string, number>;
  } catch {
    return {};
  }
}

/**
 * 记下「现在看过这个项目了」。
 *
 * `now` 是个注入点，只为让测试能写死时间；生产代码不传。
 */
export function markSeen(
  userId: string,
  projectId: string,
  store: StorageLike = localStorage,
  now: number = Date.now(),
): void {
  const all = read(userId, store);
  all[projectId] = now;
  try {
    store.setItem(keyOf(userId), JSON.stringify(all));
  } catch {
    // 隐私模式 / 配额满时 setItem 会抛。这个标记丢了不影响任何功能，不该往上冒
  }
}

/** 没记过回 `null`。**不要回 0**——`updatedAt` 一定大于 0，回 0 等于把所有项目都标成有变更 */
export function seenAt(userId: string, projectId: string, store: StorageLike = localStorage): number | null {
  const v = read(userId, store)[projectId];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * 这个项目在上次打开之后被改过吗。
 *
 * `seen` 为 `null`（从没打开过）时回 `false`：那个标记表达的是「我上次看过之后它变了」，
 * 没看过就谈不上「变了」；按 true 处理的话，第一次打开项目库会满屏都是「有新变更」，
 * 那个标记也就废了。
 */
export function hasChanged(updatedAt: number, seen: number | null): boolean {
  return seen !== null && updatedAt > seen;
}
```

- [ ] **Step 4: 跑测试确认它通过**

Run: `node --import tsx --test apps/web/src/workbench/seen.test.ts`
Expected: PASS，`fail 0`。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/workbench/seen.ts apps/web/src/workbench/seen.test.ts
git commit -m "feat(web): 「上次打开时间」与「有没有变」的判定"
```

---

## Task 3: 封面组件，接到卡片上

**Files:**
- Create: `apps/web/src/components/ProjectCover.tsx`
- Modify: `apps/web/src/pages/Projects.tsx`（`ProjectCard` 里那段封面）

前端没有组件测试，这一块靠类型检查 + Task 5 的浏览器实测。

- [ ] **Step 1: 写组件**

新建 `apps/web/src/components/ProjectCover.tsx`：

```tsx
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { brandOf } from '@lumen/ir-schema';
import { api } from '../api/client.js';
import { useStyleDoc } from '../api/hooks.js';
import { HtmlMock, useMockImages } from './HtmlMock.js';
import type { PageIR, ProjectSummary } from '../api/types.js';

/**
 * 项目库卡片上的封面：那本演示的第 1 页。
 *
 * **懒加载是这个组件的核心，不是优化。** 每张封面都是一个 iframe，而 iframe 要解析一份
 * 完整文档、跑一遍那套风格的 CSS。一次挂「项目总数」个，50 个项目就会卡住整个列表——
 * 所以卡片滚进视口才请求数据、才挂 iframe。
 *
 * 渲染复用工作台的 `HtmlMock`（新链路）。旧链项目（只有 `blocks`、没有 `html`）与还没
 * 生成过的项目都退回文字占位：渲染旧链要为每张卡片拉一次项目详情拿 `StylePack`，
 * 而旧链是正在消失的形态。
 */
export function ProjectCover({ project, onOpen }: { project: ProjectSummary; onOpen: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);

  /**
   * 进过视口就置 true，之后不再观察。
   *
   * `rootMargin` 给 200px：提前一屏就开始加载，滚到的时候已经渲染好了。
   * **不回退成 false**——滚回去不该把已经渲染好的封面拆掉再重建。
   */
  useEffect(() => {
    const el = boxRef.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) setVisible(true); },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  /**
   * 量容器宽。卡片宽度是响应式的（1 / 2 / 3 列），而 `HtmlMock` 要一个具体宽度。
   * 与 `CenterCanvas.tsx:21-37` 那套 `useLayoutEffect` + `ResizeObserver` 同一个写法。
   */
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const compute = () => setWidth(el.clientWidth);
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cover = useQuery({
    queryKey: ['project-cover', project.projectId],
    queryFn: () => api.get<{ page: PageIR | null }>(`/projects/${project.projectId}/cover`),
    // **视口外不请求**，这是懒加载的另一半
    enabled: visible,
    staleTime: 60_000,
  });

  const styleDoc = useStyleDoc(project.styleId);
  const page = cover.data?.page ?? null;
  const doc = styleDoc.data ?? null;
  const html = page?.html ?? '';

  // **无条件调用**：`useMockImages` 是 hook，不能放进条件分支。
  // 没有 html 时传空数组，它自然回空；`HtmlMock` 的 `images` 是可选的。
  const images = useMockImages(doc, html ? [html] : []);

  // `brandOf` 每次渲染都返回新对象，而 `HtmlMock` 的 `useMemo` 依赖里有 `brand`——
  // 直接传字面量会把那个 useMemo 打穿。与 `CenterCanvas.tsx:59-67` 同一条理由。
  const brand = useMemo(() => brandOf(project), [project]);

  return (
    <div ref={boxRef} className="relative aspect-video w-full overflow-hidden bg-[var(--surface-1)]">
      {/*
        封面**不能包在按钮里**：iframe 会吞掉点击——`document.elementFromPoint` 在
        样机上返回的就是 `IFRAME`，而点击不跨 iframe 边界，套在 `<button>` 里的封面
        点不开项目。所以渲染归渲染，另加一层透明按钮盖在上面接点击。
        （`Projects.tsx` 的 `StyleChoiceCard` 是套在按钮里的，那边有没有这个问题见 Task 5。）
      */}
      {page && doc && html !== '' && width > 0 ? (
        <HtmlMock
          doc={doc}
          html={html}
          width={width}
          images={images[0]}
          pageType={page.pageType}
          pageNo={page.footer.pageNo}
          frame={false}
          brand={brand}
        />
      ) : (
        <CoverPlaceholder title={project.title} />
      )}

      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 cursor-pointer"
        aria-label={`打开项目 ${project.title}`}
      />
    </div>
  );
}

/** 没有封面时的文字占位。与改动前卡片上那段排版一致 */
function CoverPlaceholder({ title }: { title: string }) {
  return (
    <div className="flex h-full w-full flex-col justify-end gap-2 p-4">
      <span className="h-1.5 w-14 rounded-full bg-[var(--accent-500)]" />
      <span className="line-clamp-2 text-[17px] font-semibold leading-[1.3] text-[var(--text-1)]">{title}</span>
      <span className="h-1.5 w-[62%] rounded-full bg-[var(--border)]" />
      <span className="h-1.5 w-[42%] rounded-full bg-[var(--border)]" />
    </div>
  );
}
```

`onOpen` 是那个透明按钮的点击处理，由卡片传进来（卡片本来就有 `onOpen`）。

- [ ] **Step 2: 接到卡片上**

`apps/web/src/pages/Projects.tsx` 的 `ProjectCard`，把整个封面 `<button>` 换成：

```tsx
      <ProjectCover project={project} onOpen={onOpen} />
```

也就是删掉这一段（原来的 `h-[132px]`、`thumbnailKey` 三元判断、以及内联的文字占位都归 `ProjectCover` 管了）：

```tsx
      <button
        type="button"
        onClick={onOpen}
        className="flex h-[132px] items-end bg-[var(--surface-1)] p-4 text-left"
        aria-label={`打开项目 ${project.title}`}
      >
        {project.thumbnailKey ? (
          <img src={project.thumbnailKey} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex w-full flex-col gap-2">
            <span className="h-1.5 w-14 rounded-full bg-[var(--accent-500)]" />
            <span className="line-clamp-2 text-[17px] font-semibold leading-[1.3] text-[var(--text-1)]">
              {project.title}
            </span>
            <span className="h-1.5 w-[62%] rounded-full bg-[var(--border)]" />
            <span className="h-1.5 w-[42%] rounded-full bg-[var(--border)]" />
          </div>
        )}
      </button>
```

顶部加 import：

```tsx
import { ProjectCover } from '../components/ProjectCover.js';
```

- [ ] **Step 3: 类型检查**

Run: `pnpm --filter @lumen/web typecheck`
Expected: Done，没有 TS 错。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/components/ProjectCover.tsx apps/web/src/pages/Projects.tsx
git commit -m "feat(web): 项目库卡片显示第一页的真实渲染"
```

---

## Task 4: 「有新变更」

**Files:**
- Modify: `apps/web/src/pages/Projects.tsx`（`ProjectCard` 的标题行）
- Modify: `apps/web/src/pages/Workbench.tsx`（打开项目时记 `seenAt`）

- [ ] **Step 1: 卡片上标出来**

`apps/web/src/pages/Projects.tsx` 里，`ProjectCard` 现在是这样拿到 `project` 的：

```tsx
function ProjectCard({
  project, onOpen, onDelete,
}: { project: ProjectSummary; onOpen: () => void; onDelete: () => void }) {
  const ratio = project.totalPages > 0 ? project.readyPages / project.totalPages : 0;
```

在 `ratio` 那行之后加：

```tsx
  // 「有新变更」按 userId 分开记，所以这里要知道当前是谁
  const userId = useSession((s) => s.user?.userId ?? '');
  const changed = userId !== '' && hasChanged(project.updatedAt, seenAt(userId, project.projectId));
```

把标题行里那句「x 前更新」那一块改成：

```tsx
          <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
            <p className="truncate text-sm font-medium text-[var(--text-1)]">{project.title}</p>
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-[var(--text-3)]">
              <span>{relativeTime(project.updatedAt)}更新</span>
              {/*
                「有新变更」放在这一行，不新造一处视觉语言——这一行本来就是讲时间与新鲜度的。
                判据是 `updatedAt > 上次打开时间`；从没打开过的不标（见 seen.ts 的 hasChanged）
              */}
              {changed && <Badge tone="brand">有新变更</Badge>}
            </p>
          </button>
```

顶部加两个 import：

```tsx
import { useSession } from '../stores/session.js';
import { hasChanged, seenAt } from '../workbench/seen.js';
```

`useSession` 是 zustand store（`apps/web/src/stores/session.ts:38`），`s.user` 是
`SessionUser | null`，而 `SessionUser extends UserPublic`、`UserPublic` 继承 `User`
的 `userId`（`packages/ir-schema/src/user.ts:27`），所以上面那行 `s.user?.userId` 拿得到。

- [ ] **Step 2: 打开项目时记下来**

`apps/web/src/pages/Workbench.tsx`（**`pages/` 下，不是 `workbench/`**）里，
`projectId` 是 `:27` 从路由拿的：`const { projectId = '' } = useParams();`。
在组件体里 `useWorkbench()` 那几行之后加：

```tsx
  // 打开这一页就算「看过了」。写在挂载时而不是离开时：离开的时机（关标签页、前进后退）
  // 不一定跑得到，而挂载一定跑得到
  const userId = useSession((s) => s.user?.userId ?? '');
  useEffect(() => {
    // `projectId` 有 `''` 的默认值（`:27` 的 `useParams()`），**空串要挡掉**——
    // 不挡就会往 localStorage 里记一个空 id，那个键谁也读不到、只是脏
    if (userId && projectId) markSeen(userId, projectId);
  }, [userId, projectId]);
```

import（`Workbench.tsx` 在 `pages/` 下、`seen.ts` 在 `workbench/` 下，所以是 `../workbench/`）：

```tsx
import { useSession } from '../stores/session.js';
import { markSeen } from '../workbench/seen.js';
```

`Workbench.tsx:1` 已经是 `import { useCallback, useEffect, useMemo, useRef, useState } from 'react';`，
`useEffect` 在里面，**不用动那一行**。

- [ ] **Step 3: 类型检查**

Run: `pnpm --filter @lumen/web typecheck`
Expected: Done，没有 TS 错。

- [ ] **Step 4: 提交**

```bash
git add apps/web/src/pages/Projects.tsx apps/web/src/workbench/Workbench.tsx
git commit -m "feat(web): 卡片上标出「有新变更」"
```

---

## Task 5: 全量验证与浏览器实测

- [ ] **Step 1: 三条门禁**

```
pnpm -r typecheck
pnpm -r test
pnpm build
```

三条都要过。**`pnpm build` 别省**——它头一步是 `lint-emoji.mjs`（扫 `.md`），之前它红过很久
没人发现，就是因为只跑了 typecheck 与 test。

- [ ] **Step 2: 起服务并登录**

dev server 起在 5273（`.claude/launch.json` 里的 `lumen-dev`）。用 admin 账号登录。

- [ ] **Step 3: 封面**

打开 `/projects`，逐条看：

1. **每张卡片显示的是那本演示第 1 页的真实渲染**，不是文字占位。
   拿 `prj_2w89s64ubj` 对：它第 0 页的 `pageType` 是 `cover`、`title.main` 是
   「AI产品经理为什么火了」、`title.sub` 是「AI产品经理成为2024-2025年最热门的互联网岗位之一」，
   所以卡片上应当**同时**看到这两句、外加封面页那层装饰件。
   （`PageIR.title` 是个对象 `{eyebrow, main, accentWords, sub}`，不是字符串——
   别按字符串去比。）
2. **封面是 16:9、没被裁**：量一下封面盒子与里面 iframe 的宽高比，都该是 16:9
3. **点封面能打开项目**：点封面正中，URL 应当变成 `/projects/<id>`
   （**这条是这次的重点**——iframe 会吞点击，所以封面外面盖了一层透明按钮）
4. **滚动才请求**：先在网络面板清空，再把列表滚到底，请求应当是一张张随滚动出去的，
   不是一上来全发。**至少要有一次「第一次进列表时请求数 < 项目总数」的观察**
5. **占位那条路要验到**：开发库里 9 个项目，**6 个有新链 `html`、3 个连第 0 页都没有**
   （`prj_35auxxzb4r`、`prj_lgnvwmzxqf`、`prj_pcotv9kw6r`，后两个属于 admin）。
   后三个应当显示**文字占位**（项目标题 + 两条灰横杠），而且**卡片高度与有封面的那些一样**
   ——占位也占同一个 `aspect-video` 盒子。
6. **旧链那条路在开发库里验不了，如实说明，别硬凑**。库里的 9 个项目**没有一个**是
   纯旧链（只有 `blocks`、没有 `html`）。之前计划里写的 `prj_m26s7ez1yr` 是个
   **孤儿 page 行**——它 `projectId` 在 `projects` 表里根本不存在（项目删了、页留下了），
   所以它不是一个「能打开来看的旧链项目」。这条路只能靠读代码确认判据正确
   （`PageIR.html` 默认 `''`，旧链页取出来就是空串，走占位）。

- [ ] **Step 4: 「有新变更」**

1. 打开一个项目，回列表 —— 它的「有新变更」应当**没有**
2. 进工作台改点什么（改项目标题最省事），回列表 —— 它应当**出现**「有新变更」
3. 再打开它，回列表 —— 应当**消失**
4. 换个浏览器或清掉 `lumen.seen.*` 之后回列表 —— **所有项目都不该有**「有新变更」
   （从没记过 = 不算变）

- [ ] **Step 5: 顺带核实一件事**

`apps/web/src/pages/Projects.tsx` 的 `StyleChoiceCard` 把 `HtmlMock` 套在 `<button>` 里，
和这次封面踩的是同一个坑。实测里已经量到 `document.elementFromPoint` 在样机正中返回的是
`IFRAME`（命中测试的结果，不是猜的），而点击不跨 iframe 边界——所以**新建项目弹窗里点
风格缩略图很可能选不中**。

在新建项目弹窗里**用真鼠标点一张未选中风格卡的缩略图**，看选中态变不变：

- 变 → 那边的 iframe 有别的机制兜着，这条作废，别改
- 不变 → 是真 bug，**这次不要顺手改**（不在本计划范围内），报给用户单独开一条

- [ ] **Step 6: 回归**

项目库的搜索、状态筛选、删除确认、新建项目弹窗都照常。

- [ ] **Step 7: 提交实测记录（如果有改动）**

实测里改了代码才提交；没改就不提交，把结论写进给用户的汇报里。
