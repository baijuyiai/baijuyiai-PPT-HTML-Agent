# Lumen Deck · 技术设计规格

- 日期：2026-10-19
- 状态：已确认，作为实施依据
- 上游文档：《HTML PPT 智能生成平台 · 产品需求文档（PRD）v2.0》
- 本文档只写 PRD 未定或需要工程决策的部分；功能验收标准以 PRD 为准

---

## 1. 工程决策记录

| 决策项 | 结论 | 理由 |
| --- | --- | --- |
| 运行形态 | 本地自包含优先 | 零外部服务依赖，`pnpm dev` 一键起；存储/队列/对象存储全部走可插拔适配器 |
| 数据库 | `node:sqlite`（Node 24 内置） | 实测支持 WAL / JSON1 / FTS5，无原生编译，Windows 零摩擦 |
| 队列 | DB 租约队列 | 至少一次投递 + `pageVersionId` 幂等 + Worker 心跳续租 + DLQ |
| 对象存储 | 本地文件系统，路径 `/{tenantId}/{projectId}/` | 适配器接口与 S3 兼容层同构，日后可切 |
| 模型接入 | Mock Provider 为一等实现 | 无 Key 时全链路可跑可演示；填 Key 后共用同一套 schema 与校验 |
| 数字人 | 内置音频包络驱动轻量口型 + 外部引擎适配器 | bithuman/Wav2Lip/MuseTalk 为重型 ML，本地零依赖不可行；保留可插拔切换 |
| TTS | Edge 朗读 WebSocket + Mock 静音轨兜底 | 非官方协议可能失效，兜底保证视频流水线永远出片 |
| 视频 | `@remotion/renderer` + `ffmpeg-static` | 免系统安装 FFmpeg |
| PDF | Playwright Chromium 逐页渲染 | 与 PPTX 截图复用同一渲染环境 |

---

## 2. 仓库结构

```
projects/lumen-deck/
├─ apps/
│  ├─ api/              Express 5 · HTTP + SSE
│  ├─ web/              Vite + React 19 · 主应用
│  ├─ admin/            管理后台
│  └─ worker/           任务执行器
├─ packages/
│  ├─ ir-schema/        Zod 契约层（唯一真值来源）
│  ├─ design-system/    设计令牌 + 双主题
│  ├─ ui/               Radix + Tailwind 组件库
│  ├─ style-engine/     风格包
│  ├─ content-engine/   意图 → 大纲 → Page IR
│  ├─ render-engine/    版式匹配 · 容量 · 溢出 · Lint
│  ├─ slides/           版式模板组件
│  ├─ charts/           ECharts 适配层
│  ├─ motion/           动效白名单
│  ├─ provider-gateway/ 模型网关
│  ├─ task-client/      队列客户端
│  ├─ storage/          对象存储适配器
│  ├─ video-engine/     Remotion + FFmpeg
│  ├─ avatar-engine/    数字人
│  └─ tts/              语音合成
├─ scripts/             emoji lint · 设计 lint · 冒烟 · 启动
└─ data/                运行时产物（gitignore）
```

**依赖约束**：`render-engine` 不得依赖 `ui` 的 React 组件。`ir-schema` 不得依赖任何运行时包（除 `zod`）。

---

## 3. 契约层（packages/ir-schema）

唯一真值来源，前后端共享。全部 Zod schema，导出 TS 类型。

- `deck.ts` — Deck IR、Canvas、Meta
- `page.ts` — Page IR、PageType、LayoutVariant、所有 Block 联合类型
- `style.ts` — Style Pack 五层结构、Tokens、Typography、TitleGrammar、Layouts、Components（avatar/cursor）、MotionWhitelist
- `provider.ts` — Provider、TaskRoute、FallbackChain、LockedRoute
- `user.ts` — User、Role、Status、Source、Quota、AuditEvent
- `project.ts` — Project、ProjectStatus、PageStatus、Task、TaskKind
- `script.ts` — Script、Segment、Anchor
- `avatar.ts` — AvatarConfig、AvatarMode
- `export.ts` — ExportJob、ExportFormat
- `lint.ts` — LintIssue、LintSeverity

**不变式**：
- 所有实体含 `tenantId`；所有查询强制过滤。
- Page IR 的 `blocks` 为判别联合，`type` 为判别键。
- Style Pack 版本号 `styleId@version` 单一字符串标识。

---

## 4. 数据层

SQLite 表（迁移脚本 `apps/api/src/db/migrations/`）：

`users` · `refresh_tokens` · `audit_events` · `projects` · `pages` · `decks` · `style_packs` · `style_versions` · `providers` · `task_routes` · `tasks` · `task_dlq` · `export_jobs` · `shares` · `usage_records` · `app_settings` · `login_attempts` · `signup_attempts`

- 迁移器：顺序 SQL 文件 + `schema_migrations` 表，幂等。
- 种子：`admin/admin`（`mustChangePassword=true`）、5 个风格族内置风格包、3 个预设数字人、默认 Provider（Mock）、默认任务路由（含 locked 标记）。
- Key 加密：AES-256-GCM，主密钥来自 `LUMEN_SECRET_KEY` 环境变量；DB 只存密文与 IV；响应/日志永不回显明文。

---

## 5. API 面

前缀 `/api`。统一响应 `{ ok, data }` / `{ ok:false, error:{ code, message } }`。

- `auth` — 登录 / 注册 / 刷新 / 登出 / 改密 / 会话
- `projects` — CRUD · 大纲 · 页面 · 生成（SSE）· 状态
- `styles` — 列表 · 详情 · 识别（URL/图片/描述）· 版本
- `pages` — 单页读写 · 重生成 · 讲稿 · 数字人 · 光标
- `tasks` — 列表 · 详情 · 重试 · DLQ
- `exports` — 发起 PDF/PPTX/HTML/MP4 · 轮询
- `shares` — 创建签名分享 · 公开读取（无鉴权但有签名与过期）
- `admin/*` — users（CRM）· providers · routes · audit · usage · settings
- `me` — 当前用户 · 配额 · 用量

**鉴权**：`Authorization: Bearer <access>`；refresh 走 httpOnly cookie。中间件 `requireAuth` / `requireAdmin` / `requireTenant`。越权 403 + 审计。

---

## 6. 引擎层

**content-engine**：意图识别（已有内容 / 仅大纲 / 仅想法 / 混合）→ Outline（页类型 + 主张 + 要点）→ Page IR。指标抽取规则优先（百分比/金额/倍数/排名/趋势正则族），模型兜底。密度超阈值触发拆页建议。

**render-engine**：每 variant 预置容量模型 → 计算 `contentLoad` → 溢出策略按序（换 variant → 重排块 → 降字号 1–2 档 → 拆页标"续" → 摘要）。输出过 Zod + 设计 Lint。

**style-engine**：风格识别三源（URL 抓取解析 / 多图量化取色 / 描述模型解析）→ 归一化 → 聚类投票 → 冲突消解（描述 > 多数 > 异常值）→ 输出风格包 + 置信度 + 待确认项。

**provider-gateway**：OpenAI 兼容客户端；`mock` 与真实实现同接口。路由解析（primary → fallbacks）→ 失败自动降级并记录原因 → 用量计量。`locked` 路由非 admin 显式切换不可改。

**task-client**：入队（group 按 tenant/project）→ 领取（租约 + 心跳）→ 执行 → 成功/失败/重试 → DLQ。幂等键 `pageVersionId`。

**video-engine**：Page IR + Script → Remotion `config.json` → 逐页/逐段渲染 → FFmpeg 合成。单页重渲只动该页。

**avatar-engine**：三态 `pip` / `fullscreen` / `off`；音频包络 → 口型驱动；FFmpeg 圆形 mask 叠加；失败降级静态肖像 + 音频并标注。

---

## 7. 前端

- 路由：`/login` `/register` `/projects` `/projects/:id`（三栏工作台）`/styles` `/tasks` `/share/:token` `/present/:id` `/admin/*`
- 状态：zustand（UI 态）+ TanStack Query（服务端态）
- 三栏：左（意图/模式/大纲/风格）· 中（画布/演示/骨架屏/数字人画中画）· 右（文字/图片/指标/图表/动效/讲稿/数字人/光标）
- 画布固定 16:9，CSS 变量驱动，主题可切换
- 骨架屏与最终版式同构
- 图标：Lucide，线宽 1.5，尺寸 16/20/24，`currentColor`；**零 emoji**

---

## 8. 品质护栏

- `scripts/lint-emoji.mjs` — 扫描 emoji 码点与 emoji 图片资源，命中即非零退出，接入 `pnpm build`
- `scripts/lint-design.mjs` — 校验生成 Page IR 的色相数、留白、字号阶梯、块数上限
- 运行期 Lint：生成 HTML/React 前过 Zod + 设计 Lint，失败回退最近合法模板并记录原因

---

## 9. 分期与验收

| 阶段 | 内容 | 验收方式 |
| --- | --- | --- |
| P0 骨架 | monorepo · 工具链 · 令牌 · ui 基座 · emoji lint | 构建通过、lint 可拦截 |
| P1 契约 | ir-schema 全部 schema + 单测 | 单测全绿 |
| P2 后端核心 | db · 迁移 · 种子 · auth/RBAC · 审计 · 配额 · storage · provider-gateway · queue | 冒烟脚本跑通登录→建项目→生成→导出 |
| P3 引擎 | style/content/render/slides/charts/motion/video/avatar/tts | 各引擎单测 + 端到端页级生成 |
| P4 前端 | web + admin 全部页面 | 浏览器实跑，截图佐证 |
| P5 导出分享 | PDF/PPTX/HTML/MP4 · 分享链接 · 微信单文件 | 真实导出文件并检查 |
| P6 验证 | 端到端 · 启动脚本 · README | 冷启动一键跑通 |

---

## 10. 已知边界

1. 数字人口型为音频包络驱动的轻量实现，视觉精度不等同 Wav2Lip；外部引擎为可插拔适配器。
2. Edge-TTS 走非官方协议，可能失效；Mock 静音轨兜底保证出片。
3. 可编辑 PPTX 为实验开关，默认关闭（PRD 决策）。
4. OAuth 仅预留接口，不实现。
5. 多人实时协同为 PRD 非目标，不做。
