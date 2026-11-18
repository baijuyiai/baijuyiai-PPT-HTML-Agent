-- 新链路的风格：每个页类型一条 HTML 生成提示词 + 它真跑出来的样机。
--
-- 为什么另起一张表而不是改 style_packs：
-- 两者的形状差得太远。旧包是「一套设计 token + 23 个版式 + 版式几何」，
-- 顶层字段里 family / tokens / layouts / language 这些在新链路里一个都不存在；
-- 而 style_packs.family 是 NOT NULL 且带索引，SQLite 改列约束要重建整张表。
-- 与其把一张表拧成两种形状，不如分开，让旧表在切换完成前保持可用。
--
-- 两张表共用同一个 styleId 命名空间（projects.styleId 存的是它），
-- 所以切换期间两边的 id 不能撞：识别出来的风格 id 带时间戳后缀，不会撞。
CREATE TABLE IF NOT EXISTS style_docs (
  styleId    TEXT PRIMARY KEY,
  version    TEXT NOT NULL,
  name       TEXT NOT NULL,
  -- 整个 StyleDoc 的 JSON。单页提示词 1~3KB、样机 HTML 3~8KB，
  -- 九个页类型约 40~80KB，SQLite 的 TEXT 列没有压力，不必拆表
  doc        TEXT NOT NULL,
  builtin    INTEGER NOT NULL DEFAULT 0,
  reviewed   INTEGER NOT NULL DEFAULT 0,
  customized INTEGER NOT NULL DEFAULT 0,
  createdAt  INTEGER NOT NULL,
  updatedAt  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_style_docs_name ON style_docs(name);
