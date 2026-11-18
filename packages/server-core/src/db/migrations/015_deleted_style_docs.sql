-- 用户删掉、且**不该再被资产同步补回来**的风格。
--
-- ## 为什么需要它
--
-- 风格资产（`packages/style-library/assets/styles.json`）是**平台资产**：
-- 新环境起来时 `seedStyleDocs()` 会把文件里、库里还没有的风格补进去，
-- 这样拉到代码的每台机器都有一份相同的风格库。
--
-- 但这也意味着**界面上删不掉**：删掉一套随资产分发的风格，下次 API 重启
-- （`pnpm dev` 是 watch 模式，改一行服务端代码就重启）它又被补回来。
-- 用户看到的是「删了又回来」——实测反馈过。
--
-- ## 为什么是真删 + 记一笔，而不是软删除
--
-- 功能库那边下架内置版式用的是「打标记、不真删」（`hidden_builtin_layouts`），
-- 因为**已生成的页面还要靠那份骨架渲染**，骨架删了就画不出来。
--
-- 风格这边不同：项目页面生成时就把 HTML 落进 `pages` 表了，渲染不再需要
-- `style_docs`；而 `deleteStyleDoc` 又已经挡住「还有项目在用这套风格」的情况。
-- 所以这里可以真删，这张表只负责**让资产同步别再把它塞回来**。
--
-- 用户重新识别、或显式 `pnpm style:import` 一套同 id 的风格时，
-- `saveStyleDoc` 会把这一笔撤掉——否则「删掉又想要回来」就没路可走了。
--
-- 不加 tenantId：与 style_docs / studio_layouts 同一条理由，风格是跨项目的资产。
CREATE TABLE IF NOT EXISTS deleted_style_docs (
  styleId TEXT PRIMARY KEY,
  -- 毫秒时间戳。只用来排序与排查「什么时候删的」，没有别的语义
  deletedAt INTEGER NOT NULL
);
