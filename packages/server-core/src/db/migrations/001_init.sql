-- Lumen Deck 初始表结构
-- 约定：布尔用 INTEGER 0/1；结构化字段存 JSON 文本；所有实体带 tenantId。
-- 所有时间戳为毫秒（INTEGER）。

CREATE TABLE IF NOT EXISTS schema_migrations (
  id        TEXT PRIMARY KEY,
  appliedAt INTEGER NOT NULL
);

-- ---------- 账号与鉴权 ----------

CREATE TABLE IF NOT EXISTS users (
  userId             TEXT PRIMARY KEY,
  tenantId           TEXT NOT NULL,
  username           TEXT NOT NULL,
  email              TEXT NOT NULL DEFAULT '',
  passwordHash       TEXT NOT NULL,
  role               TEXT NOT NULL,
  status             TEXT NOT NULL,
  source             TEXT NOT NULL,
  mustChangePassword INTEGER NOT NULL DEFAULT 0,
  createdBy          TEXT NOT NULL DEFAULT '',
  quota              TEXT NOT NULL,
  createdAt          INTEGER NOT NULL,
  lastLoginAt        INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email <> '';
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenantId);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  tokenId   TEXT PRIMARY KEY,
  userId    TEXT NOT NULL,
  tenantId  TEXT NOT NULL,
  tokenHash TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  revoked   INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rt_user ON refresh_tokens(userId);
CREATE INDEX IF NOT EXISTS idx_rt_hash ON refresh_tokens(tokenHash);

CREATE TABLE IF NOT EXISTS login_attempts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  username  TEXT NOT NULL,
  ip        TEXT NOT NULL DEFAULT '',
  ok        INTEGER NOT NULL,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_la_username ON login_attempts(username, createdAt);
CREATE INDEX IF NOT EXISTS idx_la_ip ON login_attempts(ip, createdAt);

CREATE TABLE IF NOT EXISTS signup_attempts (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  ip        TEXT NOT NULL,
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sa_ip ON signup_attempts(ip, createdAt);

CREATE TABLE IF NOT EXISTS audit_events (
  auditId   TEXT PRIMARY KEY,
  tenantId  TEXT NOT NULL,
  userId    TEXT NOT NULL DEFAULT '',
  action    TEXT NOT NULL,
  target    TEXT NOT NULL DEFAULT '',
  meta      TEXT NOT NULL DEFAULT '{}',
  ip        TEXT NOT NULL DEFAULT '',
  createdAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_time ON audit_events(tenantId, createdAt);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_events(userId, createdAt);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_events(action, createdAt);

-- ---------- 项目与内容 ----------

CREATE TABLE IF NOT EXISTS projects (
  projectId     TEXT PRIMARY KEY,
  tenantId      TEXT NOT NULL,
  ownerId       TEXT NOT NULL,
  title         TEXT NOT NULL,
  brief         TEXT NOT NULL DEFAULT '',
  audienceTag   TEXT NOT NULL DEFAULT 'general',
  scene         TEXT NOT NULL DEFAULT 'general',
  styleId       TEXT,
  status        TEXT NOT NULL DEFAULT 'draft',
  totalPages    INTEGER NOT NULL DEFAULT 0,
  readyPages    INTEGER NOT NULL DEFAULT 0,
  failedPages   INTEGER NOT NULL DEFAULT 0,
  thumbnailKey  TEXT NOT NULL DEFAULT '',
  avatarEnabled INTEGER NOT NULL DEFAULT 0,
  createdAt     INTEGER NOT NULL,
  updatedAt     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_proj_tenant ON projects(tenantId, updatedAt);
CREATE INDEX IF NOT EXISTS idx_proj_owner ON projects(ownerId, updatedAt);

CREATE TABLE IF NOT EXISTS decks (
  deckId      TEXT PRIMARY KEY,
  projectId   TEXT NOT NULL,
  tenantId    TEXT NOT NULL,
  title       TEXT NOT NULL,
  styleId     TEXT,
  audienceTag TEXT NOT NULL DEFAULT 'general',
  canvas      TEXT NOT NULL DEFAULT '{"w":1920,"h":1080}',
  meta        TEXT NOT NULL DEFAULT '{}',
  createdAt   INTEGER NOT NULL,
  updatedAt   INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_decks_project ON decks(projectId);

CREATE TABLE IF NOT EXISTS pages (
  pageId        TEXT PRIMARY KEY,
  projectId     TEXT NOT NULL,
  tenantId      TEXT NOT NULL,
  pageIndex     INTEGER NOT NULL,
  pageType      TEXT NOT NULL,
  layoutVariant TEXT NOT NULL,
  ir            TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  pageVersionId TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 1,
  updatedAt     INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_proj_index ON pages(projectId, pageIndex);

CREATE TABLE IF NOT EXISTS style_packs (
  styleId   TEXT PRIMARY KEY,
  family    TEXT NOT NULL,
  version   TEXT NOT NULL,
  name      TEXT NOT NULL,
  pack      TEXT NOT NULL,
  builtin   INTEGER NOT NULL DEFAULT 0,
  reviewed  INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL,
  updatedAt INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_style_family ON style_packs(family);

-- ---------- 模型配置与路由 ----------

CREATE TABLE IF NOT EXISTS providers (
  providerId      TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  type            TEXT NOT NULL,
  baseUrl         TEXT NOT NULL,
  apiKeyRef       TEXT NOT NULL DEFAULT '',
  pathPrefix      TEXT NOT NULL DEFAULT '/v1',
  headers         TEXT NOT NULL DEFAULT '{}',
  models          TEXT NOT NULL DEFAULT '{}',
  timeoutMs       INTEGER NOT NULL DEFAULT 60000,
  maxRetries      INTEGER NOT NULL DEFAULT 2,
  concurrency     INTEGER NOT NULL DEFAULT 5,
  costLimitTokens INTEGER NOT NULL DEFAULT 0,
  costLimitImages INTEGER NOT NULL DEFAULT 0,
  enabled         INTEGER NOT NULL DEFAULT 1,
  isMock          INTEGER NOT NULL DEFAULT 0,
  createdAt       INTEGER NOT NULL,
  updatedAt       INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS task_routes (
  routeId    TEXT PRIMARY KEY,
  taskType   TEXT NOT NULL,
  primaryRef TEXT NOT NULL,
  fallbacks  TEXT NOT NULL DEFAULT '[]',
  locked     INTEGER NOT NULL DEFAULT 0,
  updatedAt  INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_routes_tasktype ON task_routes(taskType);

-- ---------- 任务队列 ----------

CREATE TABLE IF NOT EXISTS tasks (
  taskId        TEXT PRIMARY KEY,
  tenantId      TEXT NOT NULL,
  projectId     TEXT,
  pageId        TEXT,
  kind          TEXT NOT NULL,
  idemKey       TEXT NOT NULL,
  groupKey      TEXT NOT NULL,
  payload       TEXT NOT NULL DEFAULT '{}',
  status        TEXT NOT NULL DEFAULT 'queued',
  attempts      INTEGER NOT NULL DEFAULT 0,
  maxAttempts   INTEGER NOT NULL DEFAULT 3,
  leaseOwner    TEXT,
  leaseUntil    INTEGER,
  heartbeatAt   INTEGER,
  priority      INTEGER NOT NULL DEFAULT 0,
  error         TEXT NOT NULL DEFAULT '',
  degradeReason TEXT NOT NULL DEFAULT '',
  createdAt     INTEGER NOT NULL,
  startedAt     INTEGER,
  finishedAt    INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_idem ON tasks(idemKey);
CREATE INDEX IF NOT EXISTS idx_tasks_claim ON tasks(status, priority, createdAt);
CREATE INDEX IF NOT EXISTS idx_tasks_group ON tasks(groupKey, status);
CREATE INDEX IF NOT EXISTS idx_tasks_proj ON tasks(projectId, kind, status);

CREATE TABLE IF NOT EXISTS task_dlq (
  taskId    TEXT PRIMARY KEY,
  tenantId  TEXT NOT NULL,
  projectId TEXT,
  kind      TEXT NOT NULL,
  payload   TEXT NOT NULL DEFAULT '{}',
  error     TEXT NOT NULL DEFAULT '',
  attempts  INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL,
  movedAt   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dlq_tenant ON task_dlq(tenantId, movedAt);

-- ---------- 导出与分享 ----------

CREATE TABLE IF NOT EXISTS export_jobs (
  exportId    TEXT PRIMARY KEY,
  tenantId    TEXT NOT NULL,
  projectId   TEXT NOT NULL,
  format      TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'queued',
  progress    REAL NOT NULL DEFAULT 0,
  artifactKey TEXT NOT NULL DEFAULT '',
  pageCount   INTEGER NOT NULL DEFAULT 0,
  error       TEXT NOT NULL DEFAULT '',
  createdAt   INTEGER NOT NULL,
  finishedAt  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_export_proj ON export_jobs(projectId, createdAt);

CREATE TABLE IF NOT EXISTS shares (
  shareId   TEXT PRIMARY KEY,
  token     TEXT NOT NULL,
  tenantId  TEXT NOT NULL,
  projectId TEXT NOT NULL,
  createdBy TEXT NOT NULL,
  expiresAt INTEGER NOT NULL DEFAULT 0,
  revoked   INTEGER NOT NULL DEFAULT 0,
  viewCount INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_shares_token ON shares(token);
CREATE INDEX IF NOT EXISTS idx_shares_proj ON shares(projectId);

-- ---------- 计量与设置 ----------

CREATE TABLE IF NOT EXISTS usage_records (
  usageId      TEXT PRIMARY KEY,
  tenantId     TEXT NOT NULL,
  userId       TEXT NOT NULL DEFAULT '',
  projectId    TEXT NOT NULL DEFAULT '',
  taskType     TEXT NOT NULL,
  kind         TEXT NOT NULL,
  providerId   TEXT NOT NULL DEFAULT '',
  model        TEXT NOT NULL DEFAULT '',
  amount       INTEGER NOT NULL DEFAULT 0,
  inputTokens  INTEGER NOT NULL DEFAULT 0,
  outputTokens INTEGER NOT NULL DEFAULT 0,
  cost         REAL NOT NULL DEFAULT 0,
  latencyMs    INTEGER NOT NULL DEFAULT 0,
  ok           INTEGER NOT NULL DEFAULT 1,
  degradeReason TEXT NOT NULL DEFAULT '',
  createdAt    INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_usage_tenant_time ON usage_records(tenantId, createdAt);
CREATE INDEX IF NOT EXISTS idx_usage_user ON usage_records(userId, createdAt);
CREATE INDEX IF NOT EXISTS idx_usage_kind ON usage_records(kind, createdAt);

CREATE TABLE IF NOT EXISTS app_settings (
  key       TEXT PRIMARY KEY,
  value     TEXT NOT NULL,
  updatedAt INTEGER NOT NULL
);
