# 项目库封面与「有新变更」· 设计

2026-10-26

## 背景

用户原话：

> 所有项目需要封面，如果项目有变更，需要能够看到变更

逐条问过、已确认的判断：

- **封面实时渲染第 1 页**，不用 worker 截图存图
- **「看到变更」= 卡片上标「有新变更」**，不做变更明细
- 取数走**懒加载 + 每张卡片自取**（下面的方案 A）
- **旧链项目退回文字占位**
- **封面区改成 16:9**
- 「上次打开时间」**记在 localStorage**

## 现状

### 封面位是有的，只是永远走占位那一支

`apps/web/src/pages/Projects.tsx:156` 已经有封面位：

```tsx
{project.thumbnailKey ? (
  <img src={project.thumbnailKey} alt="" className="h-full w-full object-cover" />
) : (
  <div className="flex w-full flex-col gap-2">…文字占位…</div>
)}
```

但 **`thumbnailKey` 全仓没有任何写入方**——`projects` 表里有这一列、`ProjectSummary`
上有这个字段、`updateProject` 的 `Pick` 里也留着它，就是没人写。所以这个三元判断的
真分支从来没跑过，用户看到的永远是文字占位。这就是「所有项目需要封面」的来源。

### 两条渲染链

| | 新链 | 旧链 |
|---|---|---|
| 判据 | `PageIR.html` 存在 | 只有 `PageIR.blocks` |
| 渲染 | `HtmlMock`（iframe `srcdoc`） | `@lumen/slides` 的 `<Slide>` |
| 需要 | `StyleDoc`（`useStyleDoc(styleId)`） | `StylePack` |

分流逻辑在 `apps/web/src/workbench/CenterCanvas.tsx:211`：
`rendered?.html && styleDoc.data ? <HtmlMock/> : ctx ? <Slide/> : …`。

实测（开发库 71 页）：**70 页有新链 `html`**。按项目数看，9 个项目里 6 个第 0 页有新链 `html`、
3 个连第 0 页都没有、**0 个是纯旧链**——所以旧链那条兜底在开发库里**验不到**，
只能靠读代码确认判据（`PageIR.html` 默认 `''`，旧链页取出来就是空串）。
（`prj_m26s7ez1yr` 那条 `blocks=2` 的页是**孤儿行**：它的 `projectId` 在 `projects` 表里
不存在，项目删了页还在。它不是一个能打开来看的旧链项目。）

### 关键约束

- `useStyleDoc(styleId)`（`apps/web/src/api/hooks.ts:14`）按 `styleId` 缓存、`staleTime` 5 分钟。
  **多本演示共用一套风格只拉一次**，所以风格文档这一侧几乎不花钱。
- `StylePack` **只能从 `GET /projects/:id` 拿**（`Workbench.tsx:270` 的
  `detail.data?.style?.kind === 'pack'`）。为一个旧链项目给列表加一次详情请求不划算。
- 页面 HTML 实测 **2.7–12KB**（开发库第 0 页）。
- **`updatedAt` 是可信的**：只有 `updateProject`（改标题/需求/风格/品牌/页数/深度）与
  `refreshProjectCounts`（生成、存页、删页、重排之后）会碰它。**列表接口只读**——
  `withProgress` 只算 `progressText`，不写库。所以拿它判「有没有变」成立。

## 一、封面

### 数据：一个只取第 0 页的端点

```
GET /api/projects/:id/cover   →   { "page": PageIR | null }
```

只取 `pageIndex = 0` 的那一页；还没生成过任何页就回 `null`。
租户校验照别的路由：`requireProject(id, tenantOf(req))`。

**为什么不把第 0 页塞进列表接口。** 两种做法都能让封面有数据，差别在 iframe：

| | 列表接口顺带返回 | 懒加载 + 自取（本设计） |
|---|---|---|
| 请求数 | 1 | 每张卡片 1（懒加载后只有可见的几张） |
| payload | 按项目数线性涨（50 个约 0.5MB） | 不变 |
| **iframe 数** | **= 全部项目数** | **= 当前可见张数（约 9）** |

50 个项目一次挂 50 个 iframe 不是「慢一点」，是会卡住——每个 iframe 都要解析一份
完整文档、跑一遍那套风格的 CSS。项目库是会长期增长的一页，这一条必须一开始就守住。

### 渲染：`ProjectCover`

新文件 `apps/web/src/components/ProjectCover.tsx`：

```tsx
export function ProjectCover({ project }: { project: ProjectSummary }) {
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // 进过视口就置 true，之后不再断开——滚回去不该把已经渲染好的封面拆掉
  // IntersectionObserver…

  // 卡片宽度是响应式的（1 / 2 / 3 列），而 HtmlMock 要一个具体宽度。
  // 照 CenterCanvas.tsx:21-37 那套 useLayoutEffect + ResizeObserver 量。
  useLayoutEffect(() => { /* … ro.observe(boxRef.current) … */ }, []);

  const cover = useQuery({
    queryKey: ['project-cover', project.projectId],
    queryFn: () => api.get<{ page: PageIR | null }>(`/projects/${project.projectId}/cover`),
    enabled: visible,
    staleTime: 60_000,
  });
  const styleDoc = useStyleDoc(project.styleId);

  const page = cover.data?.page ?? null;
  const html = page?.html ?? '';
  // **无条件调用**：useMockImages 是 hook，不能放在条件分支里
  const images = useMockImages(styleDoc.data, html ? [html] : []);

  const ready = html !== '' && styleDoc.data != null && width > 0;
  return (
    <div ref={boxRef} className="aspect-video w-full overflow-hidden bg-[var(--surface-1)]">
      {ready
        ? <HtmlMock doc={styleDoc.data} html={html} width={width} images={images[0]} />
        : <CoverPlaceholder title={project.title} />}
    </div>
  );
}
```

- `ready` 是**三个条件**同时成立：`html` 非空、风格文档到手、宽度量出来了。
  任何一个不满足就走占位，占位就是现在那段文字排版，一行不改。
  其中 `html` 为空**涵盖两种情况**——「还没生成」与「旧链」（`PageIR.html` 的默认值就是
  `''`，见 `packages/ir-schema/src/page.ts:367`，旧链页取出来正是空串），
  所以不需要单独判 `blocks`。
- `width` 是量出来的容器宽；`HtmlMock` 的高度按 16:9 推出来，与容器的 `aspect-video`
  **正好相等**，所以不会被裁。占位那条分支也占同一个 `aspect-video` 盒子，
  有没有封面卡片高度都一致。

**旧链退回占位是有意的**，不是漏了：渲染它要为每张卡片拉一次项目详情拿 `StylePack`，
而旧链是正在消失的形态（现在 71 页里只有 1 页）。将来旧链清完，这段兜底自然就没人走了。

**`useMockImages` 是 hook，不能放在条件分支里**，所以它无条件调用、`fragments` 传空数组
时自然回空——`HtmlMock` 的 `images` 是可选的，不传就按色板自己挑。

### 版式：封面区从固定高改成 16:9

现在是 `h-[132px] … p-4`。幻灯片是 16:9，硬塞进 132px 只能裁掉两边，
所以改成 `aspect-video`、去掉内边距、全出血。卡片会因此高一点，这是对的——
封面本来就该按它自己的比例显示。

## 二、「有新变更」

### 判定

`project.updatedAt > 上次打开这个项目的时间` → 卡片上标一个 `Badge tone="brand"`「有新变更」。

放在标题下方那一行，紧挨现有的「x 前更新」。理由：那一行本来就是讲「时间与新鲜度」的，
不新造一处视觉语言。

### 记录：`apps/web/src/workbench/seen.ts`

```ts
export function markSeen(userId: string, projectId: string): void;
export function seenAt(userId: string, projectId: string): number | null;
```

localStorage，key 是 `lumen.seen.<userId>`，值是 `{ [projectId]: timestamp }`。
**按 userId 分开存**——同一个浏览器上换账号不会串。

写入点在 `Workbench.tsx` 挂载时（`useEffect`，`projectId` 变时重跑）。

**没有记录时按「没有变更」处理，不标。** 把「没记录」当成「上次打开是很久以前」的话，
第一次打开项目库会满屏都是「有新变更」——那个标记就废了。它表达的是「我上次看过之后它变了」，
没看过就谈不上「变了」。

### 为什么是 localStorage 而不是建表

这是「我看过没有」的**本地偏好**，不是需要跨设备一致的事实。建表要多一次迁移 + 一个端点
+ 每次打开项目一次写；用户在两处都选了改动小的那一档。

**已知代价，写在这里不假装没有**：换浏览器、换设备或清缓存之后，**所有项目都不再显示
「有新变更」**——包括真的被改过的那些。因为「没记录」按「不算变」处理（反过来处理的话，
第一次打开项目库会满屏都是标记，那个标记就废了），所以代价是**漏报**而不是误报。
浏览器实测确认过这个方向：清掉 `lumen.seen.*` 之后重载，连一个刚被改过的项目也不带标记。
要跨设备一致就得建 `project_views(userId, projectId, seenAt)` 表——那是另一个决定，这次不做。

### 一个边界情况

正在生成的项目，你在工作台里看着它跑完，`updatedAt` 会超过你刚才记的 `seenAt`，
回到列表它会显示「有新变更」。**这是对的**——它确实变了，你确实没看过变完之后的样子。

## 不做

- 不做变更明细（改了标题 / 重生成第几页 / 换了风格）
- 不做封面的人工上传或选择
- 不给旧链项目做封面（退回文字占位）
- **不动 `thumbnailKey` 那一列**。它仍然没有写入方，本来该在这次一起清掉，但清它要再来一次
  迁移，而它正是「将来若改回 worker 截图」的天然落点。留着，但这次不给它写入方。

## 验证

1. `pnpm -r typecheck`、`pnpm -r test`、`pnpm build` 全过
2. 单测：
   - `cover` 端点：有第 0 页时回它；一页都没有时回 `null`；**别的租户取不到**
     （`requireProject` 抛的是 **403 FORBIDDEN**，不是 404——`projects.test.ts` 里
     「品牌三条路由都挡住别人的项目」那条用例就是按 403 断言的，这里对齐它）
   - `seen.ts`：`markSeen` 之后 `seenAt` 拿得到；**换 userId 不串**；
     没记录时 `seenAt` 回 `null`（而不是 0——回 0 会让所有项目都变成「有变更」）
3. 浏览器实测：
   - 项目库每张卡片显示第 1 页的真实渲染（不是文字占位）
   - **滚动才请求**：网络里能看出请求是随滚动一张张出去的，不是一上来全发
   - 打开一个项目再回列表，「有新变更」消失
   - 旧链项目显示文字占位
   - 封面是 16:9、没被裁
4. 回归：项目库的搜索、状态筛选、删除、新建弹窗都不受影响
