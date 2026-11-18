-- 提纲与教案这两段的两个旋钮：页数与深度。
--
-- 两列都跟着**项目**走，不跟着某一次生成走——用户设过一次就不该再设第二次，
-- 重新生成时也应当沿用同一套设定。
--
-- targetPages 可空：NULL 表示「由内容决定」，交给规则层按段落数与人群区间推。
-- depth 给默认值而不是可空：读取侧（提示词拼装、界面小字）不该处理第三种状态。
ALTER TABLE projects ADD COLUMN depth TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE projects ADD COLUMN targetPages INTEGER;
