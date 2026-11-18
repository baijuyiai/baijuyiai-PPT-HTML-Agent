-- 讲解的三个项目级旋钮：音色、语气、以及「生成页面时要不要顺带出讲稿」。
--
-- 音色与语气**可空，NULL 表示「沿用后台的全局设置」**。
-- 于是两种诉求同时成立：项目单独选过的用自己的（每个项目各选），没选过的跟着全局走
-- （改一次全局，所有没覆盖过的项目一起换）。老项目没有这两列，读出来就是 NULL，
-- 行为与改动前完全一致——这是刻意的向后兼容，不是漏了默认值。
--
-- narrationScriptEnabled 给默认值而不是可空：读取侧（生成流程里的分支）不该处理
-- 第三种状态。默认 1 = 生成讲稿，与「默认全部是生成讲解内容的」一致。
ALTER TABLE projects ADD COLUMN narrationVoice TEXT;
ALTER TABLE projects ADD COLUMN narrationTone TEXT;
ALTER TABLE projects ADD COLUMN narrationScriptEnabled INTEGER NOT NULL DEFAULT 1;
