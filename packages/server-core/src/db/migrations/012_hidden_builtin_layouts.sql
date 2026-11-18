-- 功能库里被下架的**内置**版式。
--
-- 为什么不直接删：内置骨架写死在 ir-schema 的两个生成文件里
-- （people-skeletons.ts / image-skeletons.ts），是跨项目复用的设计资产。
-- 用户觉得某一份不适合自己这套东西时，要的是「它别再被自动挑中」，
-- 而不是「从库里消失」——已经生成过的页面还要靠它渲染，与素材库的回收站同一个口径。
-- 所以下架的语义是**不进生成时的候选池**，功能库仍然列出来供恢复。
--
-- 为什么另开一张表而不是给 studio_layouts 加列：两者是两种东西。
-- studio_layouts 装的是用户自建的骨架（整行都在库里），
-- 这张表只是给内置骨架打的「已下架」标记，只有 id 与时间。
--
-- 不加 tenantId：与 studio_layouts / style_docs 同一条理由——版式是跨项目的设计资产。
-- **代价是下架是全局的**：这个库单组织自用，一处下架所有项目都不再自动挑中它。
-- 以后要按租户分，加一列即可。
CREATE TABLE IF NOT EXISTS hidden_builtin_layouts (
  layoutId TEXT PRIMARY KEY,
  -- 毫秒时间戳。只用来排序与排查「什么时候下架的」，没有别的语义
  hiddenAt INTEGER NOT NULL
);
