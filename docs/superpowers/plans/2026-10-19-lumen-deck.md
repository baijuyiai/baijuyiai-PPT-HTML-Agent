# Lumen Deck 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 PRD v2.0 完整实现 HTML PPT 智能生成平台，本地自包含可运行，覆盖 P0 全部与 P1 全部功能面。

**Architecture:** pnpm workspaces 单仓。四个应用（api / web / admin / worker）共享十六个包。`packages/ir-schema` 为唯一契约真值来源，前后端共享 Zod schema。存储/队列/对象存储/模型/TTS/数字人全部走适配器接口，默认实现零外部依赖。

**Tech Stack:** Node 24 · TypeScript 5 · pnpm workspaces + Turborepo · Express 5 · `node:sqlite` · Vite + React 19 · Tailwind v4 · Radix UI · Lucide · ECharts · Framer Motion · Playwright · PptxGenJS · Remotion + ffmpeg-static · zod · jose · node:test

---

## 0. 全局约定

**模块格式**：全仓 ESM（`"type": "module"`）。包内引用一律带 `.js` 扩展名后缀（NodeNext 解析），源码即产物，dev 用 `tsx` 运行，无需预编译。

**测试**：一律 `node:test` + `node:assert/strict`。测试文件与被测文件同目录，命名 `<name>.test.ts`。运行 `pnpm test`。

**提交**：每个 Task 结束提交一次，message 用 `feat(scope): ...` / `fix(scope): ...` / `chore(scope): ...`。

**依赖方向约束（构建期强制）**：
- `ir-schema` 只依赖 `zod`
- `render-engine` 不得依赖 `ui` / `slides` 的 React 组件
- 所有 `apps/*` 不得互相 import，只通过 `packages/*` 或 HTTP

**emoji 禁令**：任何 `.ts/.tsx/.css/.html` 源码不得含 emoji 码点。`pnpm lint:emoji` 命中即非零退出，已接入 `pnpm build`。

---

## 1. 文件结构总览

```
lumen-deck/
├─ package.json                    # workspace 根，脚本入口
├─ pnpm-workspace.yaml
├─ turbo.json
├─ tsconfig.base.json
├─ .env.example
├─ .gitignore
├─ README.md
├─ scripts/
│  ├─ lint-emoji.mjs               # emoji 码点扫描
│  ├─ lint-design.mjs              # 生成物设计规范校验
│  ├─ smoke.mjs                    # 端到端冒烟
│  ├─ seed.mjs                     # 种子数据
│  └─ dev.mjs                      # 一键启动 api+web+admin+worker
├─ apps/
│  ├─ api/
│  │  ├─ package.json  tsconfig.json
│  │  └─ src/
│  │     ├─ index.ts               # 入口，装配
│  │     ├─ app.ts                 # express app 组装
│  │     ├─ env.ts                 # 环境变量解析（zod）
│  │     ├─ db/
│  │     │  ├─ client.ts           # node:sqlite 连接 + WAL + 外键
│  │     │  ├─ migrate.ts          # 迁移器
│  │     │  └─ migrations/001_init.sql
│  │     ├─ lib/
│  │     │  ├─ crypto.ts           # AES-256-GCM 加解密 + scrypt 口令
│  │     │  ├─ jwt.ts              # access/refresh 签发校验
│  │     │  ├─ logger.ts
│  │     │  ├─ errors.ts           # AppError + 错误码
│  │     │  ├─ audit.ts            # 审计写入
│  │     │  ├─ quota.ts            # 配额检查与计量
│  │     │  └─ ratelimit.ts        # 内存令牌桶
│  │     ├─ middleware/
│  │     │  ├─ auth.ts             # requireAuth / requireAdmin / optionalAuth
│  │     │  ├─ tenant.ts           # tenantId 强制注入与过滤
│  │     │  ├─ error.ts            # 统一错误响应
│  │     │  └─ validate.ts         # zod 请求校验
│  │     ├─ routes/
│  │     │  ├─ auth.ts  me.ts  projects.ts  pages.ts
│  │     │  ├─ styles.ts  tasks.ts  exports.ts  shares.ts
│  │     │  ├─ present.ts          # 公开演示只读
│  │     │  └─ admin/
│  │     │     ├─ users.ts  providers.ts  routes.ts
│  │     │     ├─ audit.ts  usage.ts  settings.ts  styles.ts
│  │     └─ services/
│  │        ├─ project.service.ts
│  │        ├─ generate.service.ts  # 生成编排（SSE 事件源）
│  │        ├─ style.service.ts
│  │        ├─ export.service.ts
│  │        └─ share.service.ts
│  ├─ web/                          # Vite + React 主应用
│  │  ├─ package.json  tsconfig.json  vite.config.ts  index.html
│  │  └─ src/
│  │     ├─ main.tsx  App.tsx  router.tsx
│  │     ├─ api/client.ts           # fetch 封装 + SSE
│  │     ├─ stores/                 # zustand
│  │     ├─ hooks/
│  │     ├─ layouts/AppShell.tsx    # 顶部导航
│  │     ├─ pages/
│  │     │  ├─ Login.tsx  Register.tsx  ChangePassword.tsx
│  │     │  ├─ Projects.tsx  ProjectWorkbench.tsx
│  │     │  ├─ Styles.tsx  Tasks.tsx
│  │     │  ├─ Share.tsx  Present.tsx
│  │     └─ workbench/
│  │        ├─ LeftRail.tsx         # 意图/模式/大纲/风格
│  │        ├─ CenterCanvas.tsx     # 画布 + 翻页 + 全屏
│  │        ├─ RightRail.tsx        # 编辑面板
│  │        ├─ panels/              # Text/Image/Metric/Chart/Motion/Script/Avatar/Cursor
│  │        └─ Skeleton.tsx         # 与最终版式同构的骨架
│  ├─ admin/                        # Vite + React 管理后台
│  │  └─ src/pages/
│  │     ├─ Dashboard.tsx  Users.tsx  UserDetail.tsx
│  │     ├─ Providers.tsx  Routes.tsx  StyleReview.tsx
│  │     ├─ TaskMonitor.tsx  Audit.tsx  Usage.tsx  Settings.tsx
│  └─ worker/
│     └─ src/
│        ├─ index.ts                # 轮询循环 + 心跳
│        └─ handlers/
│           ├─ page-generate.ts  image-generate.ts
│           ├─ script-generate.ts  tts.ts
│           ├─ export-pdf.ts  export-pptx.ts  export-html.ts
│           ├─ video-render.ts  avatar-render.ts
├─ packages/
│  ├─ ir-schema/src/               # deck page style provider user project
│  │                               # script avatar export lint task index
│  ├─ design-system/src/           # tokens.ts themes.css index.ts
│  ├─ ui/src/                      # Button Input Select Tabs Drawer Toast
│  │                               # Skeleton Command Dialog Tooltip Badge
│  │                               # Card Table Switch Progress Icon
│  ├─ style-engine/src/            # recognize.ts normalize.ts cluster.ts
│  │                               # builtin/ (5 风格族) store.ts version.ts
│  ├─ content-engine/src/          # intent.ts outline.ts page-ir.ts
│  │                               # metrics.ts density.ts
│  ├─ render-engine/src/           # variants.ts capacity.ts overflow.ts
│  │                               # compose.ts lint.ts codegen.ts
│  ├─ slides/src/                  # 版式模板组件 + registry
│  ├─ charts/src/                  # echarts adapter + option 构建
│  ├─ motion/src/                  # whitelist + variants
│  ├─ provider-gateway/src/        # client.ts mock.ts router.ts usage.ts
│  ├─ task-client/src/             # queue.ts lease.ts dlq.ts
│  ├─ storage/src/                 # adapter.ts local.ts s3.ts
│  ├─ video-engine/src/            # config.ts render.ts compose.ts
│  ├─ avatar-engine/src/           # preset.ts lipsync.ts compose.ts
│  └─ tts/src/                     # adapter.ts edge.ts mock.ts
└─ data/                           # 运行时（gitignore）：db / objects / exports / tmp
```

---

## 2. 关键契约（先锁定，后续所有 Task 依赖此命名）

### 2.1 环境变量

```
LUMEN_PORT=8787            API 端口
LUMEN_WEB_PORT=5273        web 端口
LUMEN_ADMIN_PORT=5274      admin 端口
LUMEN_SECRET_KEY=          32 字节主密钥（Key 加密 + JWT 签名），生产必改
LUMEN_ADMIN_PASSWORD=admin 覆盖默认 admin 密码
LUMEN_ALLOW_SELF_SIGNUP=true
LUMEN_DATA_DIR=./data
LUMEN_MAX_CONCURRENCY=6    全局并发上限
LUMEN_QUEUE_LEASE_MS=60000
```

### 2.2 统一响应

```ts
type Ok<T>  = { ok: true;  data: T }
type Err    = { ok: false; error: { code: string; message: string; details?: unknown } }
```

错误码：`UNAUTHORIZED` `FORBIDDEN` `NOT_FOUND` `VALIDATION` `CONFLICT` `QUOTA_EXCEEDED` `RATE_LIMITED` `LOCKED_OUT` `PROVIDER_ERROR` `INTERNAL`

### 2.3 队列任务

```ts
type TaskKind = 'page_generate' | 'image_generate' | 'script_generate'
              | 'tts' | 'export_pdf' | 'export_pptx' | 'export_html'
              | 'video_render' | 'avatar_render'

type TaskRow = {
  taskId: string; tenantId: string; projectId: string | null
  pageId: string | null; kind: TaskKind
  idemKey: string            // 幂等键，唯一索引
  groupKey: string           // tenantId/projectId，按组限流
  payload: string            // JSON
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'dead'
  attempts: number; maxAttempts: number
  leaseOwner: string | null; leaseUntil: number | null; heartbeatAt: number | null
  priority: number
  error: string | null; degradeReason: string | null
  createdAt: number; startedAt: number | null; finishedAt: number | null
}
```

### 2.4 存储适配器

```ts
interface StorageAdapter {
  put(key: string, data: Buffer, contentType: string): Promise<string>  // 返回可访问 URL
  get(key: string): Promise<Buffer>
  delete(key: string): Promise<void>
  url(key: string): string
}
// key 约定：`{tenantId}/{projectId}/{kind}/{name}`  kind ∈ images|exports|videos|uploads|thumbs
```

### 2.5 Provider 网关

```ts
interface ProviderGateway {
  text(req: TextRequest): Promise<TextResult>
  image(req: ImageRequest): Promise<ImageResult>
}
type TextRequest = { tenantId: string; taskType: string; system?: string
  messages: { role: 'user'|'assistant'|'system'; content: string }[]
  json?: boolean; maxTokens?: number; temperature?: number }
type TextResult  = { text: string; providerId: string; model: string
  usage: { inputTokens: number; outputTokens: number }
  degraded: boolean; degradeReason?: string }
type ImageRequest = { tenantId: string; taskType: string; prompt: string
  size: string; quality: string; n: number }
type ImageResult  = { images: { buffer: Buffer; mime: string }[]
  providerId: string; model: string; degraded: boolean; degradeReason?: string }
```

### 2.6 SSE 生成事件

```
event: outline      data: { outline: OutlinePage[] }
event: style        data: { styleId, styleName, confidence }
event: page-start   data: { pageId, index }
event: page-ready   data: { pageId, index, page: PageIR }
event: page-failed  data: { pageId, index, error, degradeReason? }
event: done         data: { total, succeeded, failed }
event: error        data: { code, message }
```

---

## 3. 阶段与任务

### 阶段 P0 · 骨架与工具链

#### Task P0-1：workspace 根与工具链
**Files:** Create `package.json` `pnpm-workspace.yaml` `turbo.json` `tsconfig.base.json` `.gitignore` `.env.example` `README.md`

- [ ] 写 `pnpm-workspace.yaml`：`packages: ['apps/*','packages/*']`
- [ ] 写根 `package.json`，scripts：`dev` `build` `typecheck` `test` `lint:emoji` `lint:design` `seed` `smoke` `db:migrate`
- [ ] 写 `tsconfig.base.json`：`module: NodeNext` `target: ES2023` `strict: true` `noUncheckedIndexedAccess: true` `verbatimModuleSyntax: true`
- [ ] 写 `.env.example`（内容见 §2.1）
- [ ] 验证：`pnpm install` 成功；`pnpm -v` ≥ 11
- [ ] Commit `chore: scaffold workspace`

#### Task P0-2：emoji lint 与设计 lint
**Files:** Create `scripts/lint-emoji.mjs` `scripts/lint-design.mjs` `scripts/lint-emoji.test.mjs`

- [ ] 写失败测试：`scripts/lint-emoji.test.mjs` 断言含 emoji 的字符串被判定为违规、纯文本通过
- [ ] 运行 `node --test scripts/lint-emoji.test.mjs` → FAIL
- [ ] 实现 `lint-emoji.mjs`：导出 `findEmoji(text) -> {line,col,char}[]`，码点区间覆盖 `U+1F300–1FAFF` `U+2600–27BF` `U+FE0F` `U+2190–21FF`(排除) `U+2B00–2BFF` `U+1F000–1F2FF`；CLI 扫描 `apps/**` `packages/**` 下 `.ts .tsx .css .html .json`，命中打印 `file:line:col` 并 `process.exit(1)`
- [ ] 运行测试 → PASS；运行 `node scripts/lint-emoji.mjs` 于空仓 → exit 0
- [ ] 实现 `lint-design.mjs`：导出 `lintPageIR(page)` 与 `lintStylePack(pack)`，校验色相数 ≤4、字号在 12/14/16/20/24/32/40/56 阶梯内、要点 ≤5、边距 ≥ 画布宽 5%
- [ ] Commit `feat(scripts): emoji and design lint`

#### Task P0-3：设计令牌
**Files:** Create `packages/design-system/src/tokens.ts` `themes.css` `index.ts` `package.json` `tsconfig.json`

- [ ] 按 PRD §3.3 写全 token：`--brand-500/600/100`、`--accent-500/100`、中性色阶、语义色，浅深双套
- [ ] 写 `tokens.ts` 导出结构化对象（供生成器与 PPTX/视频复用同一色值）
- [ ] 写间距（4px 基数）、圆角（8/12/16）、阴影（sm/md）、字阶、字重、动效时长常量
- [ ] 验证：`pnpm --filter @lumen/design-system typecheck`
- [ ] Commit `feat(design-system): tokens and themes`

#### Task P0-4：UI 组件库
**Files:** Create `packages/ui/src/{Button,Input,Select,Tabs,Drawer,Toast,Skeleton,Command,Dialog,Tooltip,Badge,Card,Table,Switch,Progress,Icon,index}.tsx` + `styles.css`

- [ ] 全部基于 Radix primitives，Tailwind 类名消费 design-system CSS 变量
- [ ] `Icon.tsx`：Lucide 封装，强制 `strokeWidth=1.5`，尺寸限 16/20/24，纯图标按钮强制 `aria-label`
- [ ] 全组件 focus ring 主色 2px；无 emoji
- [ ] 验证：`pnpm --filter @lumen/ui typecheck` + `pnpm lint:emoji`
- [ ] Commit `feat(ui): component library`

---

### 阶段 P1 · 契约层

#### Task P1-1：ir-schema 全部 schema
**Files:** Create `packages/ir-schema/src/{deck,page,style,provider,user,project,script,avatar,export,lint,task,index}.ts` + 对应 `.test.ts`

- [ ] `page.ts`：`PageType`（cover/section/text/imageText/chart/metrics/end）、`Block` 判别联合（paragraph/bullets/metric/image/chart）、`ImageBlock.genParams`、`PageIR` 含 `motion` `script` `avatar` `footer` `overrides`
- [ ] `style.ts`：`StylePack` 五层（base.tokens/typography/titleGrammar/layouts/components/rules/motionWhitelist）+ `variants` + `overrides` + `examples`
- [ ] `deck.ts`：`DeckIR` 含 `styleId` 形如 `business-classic@1.2`
- [ ] `provider.ts`：`Provider` `TaskRoute` `RouteEntry`，`locked` 布尔
- [ ] `user.ts`：`User` `Role` `Status` `Source` `Quota`
- [ ] `project.ts`：`Project` `ProjectStatus` `PageStatus` `TaskKind`
- [ ] `script.ts`：`Script` `Segment` `Anchor`（`targetId` `x` `y`）
- [ ] `avatar.ts`：`AvatarConfig` `AvatarMode = 'pip'|'fullscreen'|'off'`
- [ ] 每个 schema 写 `.test.ts`：合法样例 parse 通过 + 非法样例抛错
- [ ] 验证：`pnpm --filter @lumen/ir-schema test` 全绿
- [ ] Commit `feat(ir-schema): contracts`

---

### 阶段 P2 · 后端核心

#### Task P2-1：数据库与迁移
**Files:** Create `apps/api/src/db/{client,migrate}.ts` `migrations/001_init.sql` `apps/api/src/env.ts`

- [ ] `client.ts`：`node:sqlite` `DatabaseSync`，开 `WAL` `foreign_keys=ON`，导出 `db` 与 `tx(fn)` 事务包装
- [ ] `001_init.sql`：按 §4 建全表 + 索引（`tasks.idemKey` UNIQUE、`tasks(groupKey,status,priority,createdAt)`、`users.username` UNIQUE、`users.email` UNIQUE、`shares.token` UNIQUE）
- [ ] `migrate.ts`：读 `migrations/*.sql` 顺序执行，`schema_migrations` 记录，幂等
- [ ] `env.ts`：zod 解析环境变量，缺 `LUMEN_SECRET_KEY` 时开发环境生成并写 `.env.local`，生产抛错
- [ ] 测试：`migrate.test.ts` 断言重复执行不报错、表存在
- [ ] Commit `feat(api): db and migrations`

#### Task P2-2：加密、JWT、日志、错误、审计、配额、限流
**Files:** Create `apps/api/src/lib/{crypto,jwt,logger,errors,audit,quota,ratelimit}.ts` + tests

- [ ] `crypto.ts`：`hashPassword`/`verifyPassword` 用 `crypto.scrypt`；`encryptSecret`/`decryptSecret` 用 AES-256-GCM，输出 `v1:<iv>:<tag>:<ct>` base64
- [ ] `jwt.ts`：`signAccess`(15m) `signRefresh`(30d) `verifyAccess` `verifyRefresh`，HS256 用 `LUMEN_SECRET_KEY`
- [ ] `logger.ts`：结构化 JSON 行日志，**自动脱敏** `apiKey|authorization|password|token|secret`
- [ ] `errors.ts`：`AppError(code, message, status, details?)`
- [ ] `audit.ts`：`record({tenantId,userId,action,target,meta,ip})`
- [ ] `quota.ts`：`assertQuota(userId, kind)` 检查项目数/并发/Token/图片数，超限抛 `QUOTA_EXCEEDED`
- [ ] `ratelimit.ts`：内存令牌桶，`limit(key, max, windowMs)`
- [ ] 测试覆盖：加解密往返、错误密码拒绝、日志脱敏、限流触发
- [ ] Commit `feat(api): core libs`

#### Task P2-3：中间件与鉴权
**Files:** Create `apps/api/src/middleware/{auth,tenant,error,validate}.ts` + tests

- [ ] `auth.ts`：`requireAuth`（Bearer 校验 + 用户状态检查，禁用即 401）、`requireAdmin`（非 admin 403 + 审计）、`optionalAuth`
- [ ] `tenant.ts`：注入 `req.tenantId = user.tenantId`；提供 `scopedWhere()` 帮助函数，所有 service 查询必须经过
- [ ] `validate.ts`：`body(schema)` `query(schema)` `params(schema)` 中间件
- [ ] 测试：无 token 401、普通用户访问 admin 403、禁用用户 401
- [ ] Commit `feat(api): middleware`

#### Task P2-4：认证路由
**Files:** Create `apps/api/src/routes/{auth,me}.ts` + tests

- [ ] `POST /api/auth/login`：用户名或邮箱；失败 5 次锁 15 分钟（`login_attempts` 表）；成功签发 access + refresh（refresh 走 httpOnly cookie）；写审计
- [ ] `POST /api/auth/register`：`ALLOW_SELF_SIGNUP` 关闭则 403；密码 ≥8 位含字母与数字；同 IP 每小时 ≤10 次；创建 `source='self_signup'` `role='user'` `status='active'`；自动登录
- [ ] `POST /api/auth/refresh` `POST /api/auth/logout`
- [ ] `POST /api/auth/change-password`：改后旧 refresh 全失效；`mustChangePassword` 置 false
- [ ] `GET /api/me`：用户信息 + 配额 + 用量
- [ ] 种子：`admin/admin`，`mustChangePassword=true`，密码取 `LUMEN_ADMIN_PASSWORD`
- [ ] 测试：admin 登录、改密后旧密码失效、注册成功自动登录、关闭开关后注册 403、锁定 15 分钟
- [ ] Commit `feat(api): auth`

#### Task P2-5：存储适配器
**Files:** Create `packages/storage/src/{adapter,local,s3,index}.ts` + tests

- [ ] `local.ts`：落 `LUMEN_DATA_DIR/objects/{key}`，`url()` 返回 `/files/{key}`，API 侧静态托管
- [ ] `s3.ts`：接口同构，未配置时抛 `NOT_CONFIGURED`
- [ ] 测试：put/get/delete 往返、路径穿越 `../` 被拒绝
- [ ] Commit `feat(storage): adapters`

#### Task P2-6：Provider 网关（Mock + 真实 + 路由降级）
**Files:** Create `packages/provider-gateway/src/{client,mock,router,usage,index}.ts` + tests

- [ ] `mock.ts`：**确定性**文本生成器（对大纲/页内容/讲稿分别产出结构合法 JSON）+ 图像生成器（按 prompt 哈希生成渐变几何 PNG，无文字）
- [ ] `client.ts`：OpenAI 兼容 `chat/completions` 与 `images/generations`；自定义 `pathPrefix` 与 headers；超时与重试
- [ ] `router.ts`：解析 `task_routes`，primary 失败按 `fallbacks` 依次尝试，记录 `degradeReason`；`locked` 路由校验调用者是否 admin 显式切换
- [ ] `usage.ts`：写 `usage_records`（文本 token / 图片张数分开计量）
- [ ] 测试：Mock 输出过 Zod、降级链在主 Provider 抛错后切换并标记 degraded、locked 路由普通用户改不了
- [ ] Commit `feat(provider-gateway): gateway and routing`

#### Task P2-7：任务队列
**Files:** Create `packages/task-client/src/{queue,lease,dlq,index}.ts` + tests

- [ ] `enqueue(task)`：写 `tasks`，`idemKey` 冲突则返回既有任务（幂等）
- [ ] `claim(owner, limit)`：按 `groupKey` 分组限流 + 全局并发上限，事务内 `UPDATE ... WHERE status='queued'` 加租约
- [ ] `heartbeat(taskId, owner)`：续租；租约过期任务可被重新领取
- [ ] `complete` / `fail`（未达 maxAttempts 回 queued，达则入 `task_dlq` 并置 `dead`）
- [ ] `recoverStale()`：启动时回收租约过期的 running 任务
- [ ] 测试：幂等入队、并发领取不重复、租约过期可回收、重试计数与 DLQ
- [ ] Commit `feat(task-client): queue`

#### Task P2-8：项目、页面、风格、导出、分享路由
**Files:** Create `apps/api/src/services/{project,style,export,share}.service.ts` `routes/{projects,pages,styles,tasks,exports,shares,present}.ts`

- [ ] 项目 CRUD（状态徽章数据、缩略图）；`tenantId` 强制过滤；A 用户读 B 项目 403 + 审计
- [ ] 页面读写、单页重生成入队、讲稿/数字人/光标字段更新
- [ ] 风格库列表/详情/识别（URL / 图片 / 描述）
- [ ] 任务列表/详情/重试/DLQ
- [ ] 导出发起与轮询
- [ ] 分享创建（签名 token + 过期）与公开只读读取（`/api/present/:token`，无鉴权）
- [ ] 测试：越权 403、分享 token 过期失效、分享只读不可写
- [ ] Commit `feat(api): resource routes`

#### Task P2-9：生成编排（SSE）
**Files:** Create `apps/api/src/services/generate.service.ts` `routes/projects.ts`(生成端点)

- [ ] `POST /api/projects/:id/outline` → 生成大纲
- [ ] `GET /api/projects/:id/generate/stream` → SSE，按 §2.6 事件序列逐页落地；每页 `pageVersionId` 作幂等键入队；页失败发 `page-failed` 但不中断整体
- [ ] 生成与视图解耦：客户端断开不终止任务
- [ ] 测试：SSE 事件序列完整、单页失败不影响其他页
- [ ] Commit `feat(api): streaming generation`

#### Task P2-10：admin 路由（CRM / Provider / 路由 / 审计 / 用量 / 设置）
**Files:** Create `apps/api/src/routes/admin/*.ts` + tests

- [ ] 用户列表（含角色/状态/来源/项目数/累计页数/累计费用）、筛选搜索、创建、编辑、禁用（Token 立即失效）、详情（项目/任务/用量/审计）、配额设置
- [ ] Provider CRUD（Key 加密存储，响应永不含明文，`apiKey` 出参一律 `***`）+ 测试连接（文本与图片各发最小请求）
- [ ] 任务路由 CRUD + locked 切换
- [ ] 审计查询（按用户/时间/操作筛选）、用量统计、CSV 导出
- [ ] 全局设置（`ALLOW_SELF_SIGNUP` 等）
- [ ] 测试：普通用户 403、Key 不出现在任何响应、禁用后 Token 立即失效、CSV 导出正确
- [ ] Commit `feat(api): admin and CRM`

#### Task P2-11：worker 主体
**Files:** Create `apps/worker/src/index.ts` + `handlers/*.ts`

- [ ] 轮询循环：claim → 执行 → heartbeat 定时器 → complete/fail
- [ ] `page-generate.ts`：content-engine + render-engine + 图片任务派发 + 讲稿派发
- [ ] `image-generate.ts`：provider-gateway 图片 → storage → 回填 Page IR
- [ ] `script-generate.ts`：逐页讲稿 + 分段锚点
- [ ] 失败降级：图片失败重试 1 次后占位图 + 提示；页生成失败回退最近合法模板并记录原因
- [ ] Commit `feat(worker): task handlers`

---

### 阶段 P3 · 引擎层

#### Task P3-1：风格引擎
**Files:** Create `packages/style-engine/src/{recognize,normalize,cluster,store,version,index}.ts` `builtin/*.ts` + tests

- [ ] 五个内置风格族（商务经典 / 学术严谨 / 科技极简 / 品牌设计 / 亲和品质），每个含五层完整结构、6–12 个标题 composition 模板、`audienceFit`、`motionWhitelist`、`components.avatar` 与 `components.cursor`
- [ ] `recognize.ts` 三源：URL（抓 HTML，解析 `<style>`/`<link>`，提取色值/字体/字号）、图片（`jpeg-js`+`pngjs` 解码 → 中位切分量化取色 + 边缘密度估排版）、描述（模型）
- [ ] `normalize.ts` 比例化归一；`cluster.ts` 聚类投票；冲突消解 `描述 > 多数 > 异常值`
- [ ] 输出风格包 + `confidence` + `pendingConfirm[]`
- [ ] `store.ts` 持久化；`version.ts` `v1 → v1.x` 微调 delta 聚类升级
- [ ] 测试：五风格族各 parse 通过设计 Lint；识别三源各产合法风格包；版本升级保留兼容
- [ ] Commit `feat(style-engine): recognition and style packs`

#### Task P3-2：内容引擎
**Files:** Create `packages/content-engine/src/{intent,outline,page-ir,metrics,density,index}.ts` + tests

- [ ] `intent.ts`：四类路由（已有内容 / 仅大纲 / 仅想法 / 混合）→ 统一 `DeckIR` 出口
- [ ] `outline.ts`：生成 `OutlinePage[]`（页类型 + 主张 + 要点），可拖拽排序/增删/改标题/切页类型
- [ ] `page-ir.ts`：Outline → `PageIR`；一页一个主张；要点 ≤5
- [ ] `metrics.ts`：规则优先（百分比/金额/倍数/排名/趋势正则族）抽 `metric` 块，附原文与来源；模型兜底判核心数字；允许改主指标
- [ ] `density.ts`：密度超阈值触发拆页建议
- [ ] 测试：3 页已有内容 100% 正确分页并产合法 Page IR；高密度页触发拆页；主指标可改选
- [ ] Commit `feat(content-engine): intent outline page-ir`

#### Task P3-3：排版渲染引擎
**Files:** Create `packages/render-engine/src/{variants,capacity,overflow,compose,lint,codegen,index}.ts` + tests

- [ ] `variants.ts`：版式变体注册表，每 variant 预置标题字数/行数、正文上限、块数、图片比例、指标卡上限
- [ ] `capacity.ts`：`computeContentLoad(page, variant) -> number`
- [ ] `overflow.ts`：溢出策略按序 —— 换 variant → 重排块 → 降字号（阶梯内 1–2 档）→ 拆页（标"续"）→ 摘要（原文可回溯）
- [ ] `compose.ts`：12 栏网格 + 基线间距；图片 `object-fit: cover` + 焦点裁切；1/2/3/4 图预设布局；固定 16:9；CSS 变量驱动
- [ ] `lint.ts`：排印质量（孤字、标点悬挂、中英混排间距、数字等宽对齐）+ 复用 `scripts/lint-design.mjs` 规则
- [ ] `codegen.ts`：在风格包 + Page IR + 版式模板约束下产出受约束 HTML；**不让模型决定配色/字体/间距**；输出过 Zod + Lint，失败回退最近合法模板并记录原因
- [ ] 测试：内容量 ±50% 不溢出/不重叠/字号 ≥12px；超限拆页；Lint 能拦截违规配色
- [ ] Commit `feat(render-engine): layout and overflow`

#### Task P3-4：slides 版式模板
**Files:** Create `packages/slides/src/{registry,blocks/*,variants/*,index}.tsx`

- [ ] 按 PageType × variant 实现真实 React 版式组件；所有色/字/间距取自 CSS 变量
- [ ] 图片 1/2/3/4 图预设；指标卡、图表槽位、页脚来源与页码
- [ ] 与 render-engine 的 variant 名一一对应
- [ ] 测试：每个 variant 用样例 Page IR 渲染不抛错（`react-dom/server` 快照）
- [ ] Commit `feat(slides): layout templates`

#### Task P3-5：图表与动效
**Files:** Create `packages/charts/src/{adapter,echarts,antv,index}.ts` `packages/motion/src/{whitelist,variants,index}.ts` + tests

- [ ] `charts`：IR 中立 schema → ECharts option；AntV 适配层同构；配色来自风格包
- [ ] `motion`：每风格允许动效白名单（商务仅 fade/slide）；Framer Motion variants；禁止自由写动画代码
- [ ] 测试：同一 IR 切 ECharts/AntV 数据结构一致；白名单外动效被拒
- [ ] Commit `feat(charts,motion): adapters`

#### Task P3-6：TTS
**Files:** Create `packages/tts/src/{adapter,edge,mock,index}.ts` + tests

- [ ] `edge.ts`：Node WebSocket 直连 Edge 朗读，输出 mp3 + 词级时间戳（从 WordBoundary 事件）
- [ ] `mock.ts`：`ffmpeg-static` 生成按文本长度估算时长的静音轨，时间戳按字符均分
- [ ] 自动降级：Edge 失败 → Mock，并标记
- [ ] 测试：Mock 输出可解析的 mp3 与时间戳；降级路径被触发
- [ ] Commit `feat(tts): adapters`

#### Task P3-7：数字人引擎
**Files:** Create `packages/avatar-engine/src/{preset,lipsync,compose,index}.ts` + assets

- [ ] 三个预设形象（商务中性 / 亲和女性 / 简约男性），矢量绘制，品质符合 PRD §3.1，无卡通夸张
- [ ] `lipsync.ts`：音频包络 → 口型幅度序列（可复用 TTS 时间戳），误差目标 <100ms
- [ ] `compose.ts`：FFmpeg 圆形 mask 叠加，支持边框/阴影/位置/直径；`fullscreen` 页数字人为主画面、PPT 半透明；`off` 跳过
- [ ] 失败降级静态肖像 + 音频并标注
- [ ] 测试：口型序列长度与音频对齐；`off` 页不产生合成
- [ ] Commit `feat(avatar-engine): presets and compositing`

#### Task P3-8：视频引擎
**Files:** Create `packages/video-engine/src/{config,render,compose,index}.ts` + Remotion 模板

- [ ] `config.ts`：Page IR + Script → Remotion `config.json`（页面数据 + 时间轴 + 光标锚点 + 数字人 mode）
- [ ] `render.ts`：`@remotion/renderer` 逐页/逐段渲染 1080p；单页重渲只动该页
- [ ] `compose.ts`：`ffmpeg-static` 拼接 + 音轨 + 光标图层
- [ ] 失败页可单独重试
- [ ] 测试：config 生成合法；单页重渲不影响其他页产物
- [ ] Commit `feat(video-engine): remotion pipeline`

---

### 阶段 P4 · 前端

#### Task P4-1：web 基座
**Files:** Create `apps/web/{package.json,vite.config.ts,index.html}` `src/{main,App,router,api/client}.tsx` `layouts/AppShell.tsx` `stores/*`

- [ ] Vite + React 19 + Tailwind v4 + react-router
- [ ] `api/client.ts`：fetch 封装（自动附带 token、401 自动 refresh、统一错误）+ `openSSE()`
- [ ] `AppShell`：顶部导航（Logo｜项目库｜新建项目｜风格库｜任务中心｜[admin: CRM/模型配置/风格审核/任务监控]｜用户菜单含主题切换）
- [ ] 主题切换：`data-theme` 属性 + localStorage
- [ ] 验证：`pnpm --filter @lumen/web dev` 起得来，浏览器打开无错
- [ ] Commit `feat(web): shell and client`

#### Task P4-2：认证与项目库页面
**Files:** Create `pages/{Login,Register,ChangePassword,Projects,Tasks}.tsx`

- [ ] 登录页含「注册」入口；首次登录强制跳改密
- [ ] 项目库：状态徽章（草稿/生成中 x/y/已完成/失败）、缩略图、更新时间、新建项目（场景/人群标签 + 推荐风格）
- [ ] 任务中心：按类型看成功率与 P95，失败原因与降级原因可见
- [ ] Commit `feat(web): auth and projects`

#### Task P4-3：三栏工作台
**Files:** Create `pages/ProjectWorkbench.tsx` `workbench/{LeftRail,CenterCanvas,RightRail,Skeleton}.tsx` `workbench/panels/*.tsx`

- [ ] 左栏：意图输入、模式切换、大纲导航（拖拽排序/增删/改标题/切页类型）、风格选择（含人群推荐标签）
- [ ] 中栏：真实 React 画布、编辑/演示态、左右翻页、全屏、未生成页骨架屏（与最终版式同构）+「优先生成」、数字人画中画
- [ ] 右栏：文字 / 图片替换裁切 / 指标卡 / 图表数据 / 动效 / 讲稿 / 数字人 / 光标
- [ ] 流式生成：SSE 逐页落地，已生成页立即可翻页编辑；插队请求 1s 内入队
- [ ] Commit `feat(web): workbench`

#### Task P4-4：风格库与识别页
**Files:** Create `pages/Styles.tsx` `components/StyleRecognize.tsx` `components/StylePreview.tsx`

- [ ] 风格卡片（族/人群/调性）、详情五层结构展示、识别向导（URL/多图/描述，展示置信度与待确认项）
- [ ] Commit `feat(web): style library`

#### Task P4-5：演示与分享页
**Files:** Create `pages/{Present,Share}.tsx`

- [ ] 演示：方向键 / 点击 / 触摸滑动 / 全屏 / 进度指示 / 缩略图导航
- [ ] 分享页：只读演示；`file://` 明确提示不支持
- [ ] 讲解：TTS 流式播放 + 词级时间戳驱动元素揭示 + 讲解光标（锚点缓动移动、段内呼吸、透明度可调）；离开页面即停
- [ ] 数字人演示中临时切换 `pip ↔ fullscreen ↔ off` 循环（只影响当前会话，不回写，退出恢复）
- [ ] Commit `feat(web): present and share`

#### Task P4-6：admin 后台
**Files:** Create `apps/admin/*` 全套页面

- [ ] 路由守卫：非 admin 不可见且直接访问跳回；后端 403 兜底
- [ ] Dashboard / 用户列表（筛选搜索/创建/编辑/禁用/详情/配额）/ Provider 配置（测试连接）/ 任务路由（locked 标记）/ 风格库审核 / 任务监控（成功率 P95、降级原因、一键切备用）/ 审计 / 用量 / 设置
- [ ] Commit `feat(admin): console`

---

### 阶段 P5 · 导出与分享

#### Task P5-1：HTML 单文件导出
**Files:** Create `apps/worker/src/handlers/export-html.ts` `packages/render-engine/src/selfcontained.ts`

- [ ] 服务端渲染全部页 → 内联 CSS/JS/字体/图片 base64 → 单个 `.html`
- [ ] 移动端触摸翻页；HTTPS 自包含（微信可打开）
- [ ] 测试：产物单文件、无外链、用 Playwright 打开可翻页
- [ ] Commit `feat(export): self-contained html`

#### Task P5-2：PDF 导出
**Files:** Create `apps/worker/src/handlers/export-pdf.ts`

- [ ] Playwright 逐页渲染 + `@media print` 分页；与 PPTX 复用渲染环境
- [ ] 导出前校验全部页就绪
- [ ] 测试：PDF 页数与 deck 一致、无空白页
- [ ] Commit `feat(export): pdf`

#### Task P5-3：PPTX 导出（截图版 + 可编辑实验版）
**Files:** Create `apps/worker/src/handlers/export-pptx.ts`

- [ ] 默认：逐页截图 → PptxGenJS 铺满 16:9；面板明确提示「文字不可编辑」
- [ ] 实验版：Page IR 重建标题/正文/指标/图片，复杂装饰降级背景图；默认关闭
- [ ] 测试：PPTX 可被解析、页数一致、16:9 尺寸正确
- [ ] Commit `feat(export): pptx`

#### Task P5-4：视频与数字人导出
**Files:** Create `apps/worker/src/handlers/{video-render,avatar-render}.ts`

- [ ] 按 `avatar.mode` 与 `segments.anchor` 分别处理数字人与光标图层，互不阻塞
- [ ] 分段渲染 + 单页重渲 + 失败页单独重试
- [ ] Commit `feat(export): video and avatar`

#### Task P5-5：分享链路
**Files:** Create `apps/api/src/services/share.service.ts`(完善) `scripts/` 微信单文件

- [ ] 分享 token 签名 + 过期 + 租户边界
- [ ] 微信分享：HTTPS 自包含单 HTML，移动端触摸翻页；`file://` 提示不支持
- [ ] 移动端数字人降级为静态头像 + 音频
- [ ] Commit `feat(share): links and wechat`

---

### 阶段 P6 · 验证与交付

#### Task P6-1：种子与一键启动
**Files:** Create `scripts/{seed,dev}.mjs`

- [ ] 种子：admin、5 风格族、3 数字人预设、Mock Provider、默认任务路由
- [ ] `dev.mjs`：并发起 api + web + admin + worker，带颜色前缀日志，Ctrl-C 统一退出
- [ ] Commit `chore: seed and dev runner`

#### Task P6-2：端到端冒烟
**Files:** Create `scripts/smoke.mjs`

- [ ] 脚本自动走完：登录 → 建项目 → 生成大纲 → 流式生成 → 导出 HTML/PDF → 建分享 → 匿名读分享
- [ ] 断言每步状态与产物文件存在
- [ ] 运行 `pnpm smoke` 全绿
- [ ] Commit `test: e2e smoke`

#### Task P6-3：README 与验收清单
**Files:** Create `README.md` `docs/验收清单.md`

- [ ] 启动步骤、默认账号、环境变量、目录说明、能力边界（诚实列出 §10）
- [ ] 验收清单逐条对照 PRD 验收标准勾选
- [ ] Commit `docs: readme and acceptance`

---

## 4. 自检记录

**Spec 覆盖**：PRD 5.1–5.15 全部映射到 Task（5.1→P2-4/P2-10，5.2→P3-1/P4-4，5.3→P3-2，5.4→P3-3/P3-4，5.5→P4-3，5.6→P2-7/P2-9，5.7→P4-5/P5-5，5.8→P5-1/2/3，5.9→P3-6/P5-4，5.10→P3-5，5.11→P2-6/P2-10，5.12→P2-10/P4-6，5.13→P3-7/P5-4，5.14→P3-7/P4-5，5.15→P2-6/P2-11）。§8 非功能需求由 P0-2/P2-2/P2-7/P2-10 覆盖。

**占位扫描**：无 TBD / TODO。

**命名一致性**：`tenantId` `pageVersionId` `idemKey` `groupKey` `styleId@version` `AvatarMode` `TaskKind` `StorageAdapter` `ProviderGateway` 在全文一致。
