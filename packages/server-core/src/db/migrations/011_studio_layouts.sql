-- 功能库里用户自己「识别并新建」的版式骨架。
--
-- 为什么不并进 PEOPLE_LAYOUTS / IMAGE_LAYOUTS 那两个常量数组：
-- 那两个数组是**生成时的候选池**——出人物页/图片排版页时会按内容筛出几个候选塞进提示词。
-- 用户新建的骨架按口径**不参与自动挑版式**，只在库里展示、由用户在工作台手动套上去。
-- 一旦并进数组，它就悄悄进了候选池（用户完全看不出来），
-- 而且 people-layouts.test.ts / image-layouts.test.ts 里钉死的数量与分组断言会当场挂。
--
-- 不加 tenantId：与 style_docs 同一条理由——版式骨架是跨项目复用的设计资产，
-- 里面没有用户内容（识别时模型被要求把正文换成占位示例），也没有密钥。
-- 参考图本身另有出处：它存在租户隔离的 /uploads 分区里，这张表只留一个 URL 备查。
CREATE TABLE IF NOT EXISTS studio_layouts (
  layoutId    TEXT PRIMARY KEY,
  -- 'people-layouts' | 'image-layouts'，对着功能库页那两个版式库
  moduleId    TEXT NOT NULL,
  name        TEXT NOT NULL,
  -- 一句话：适合什么内容。与内置骨架的 brief 同一个用途
  brief       TEXT NOT NULL,
  -- 落在该模块的哪个分组里。**列名不叫 group**：那是 SQL 关键字
  groupKey    TEXT NOT NULL,
  -- 图位数。只有多图排版有；人物排版为 NULL（决定它版式的量是人数，不是图位数）
  slots       INTEGER,
  skeleton    TEXT NOT NULL,
  -- 参考图 URL，留个出处
  sourceImage TEXT NOT NULL DEFAULT '',
  createdAt   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_studio_layouts_module ON studio_layouts(moduleId, createdAt);
