-- 风格包的「改过」与「删过」两个状态。
--
-- 内置风格的真值在代码里（BUILTIN_STYLE_PACKS），每次启动都会写回库，
-- 这样代码里新增版式或设计语言字段能立刻生效。但这带来两个问题：
--
-- 1. 用户改了内置风格，下次启动会被代码里的真值覆盖掉 → 用 customized 记住「这一份是人改过的」，
--    写回时跳过它，改动就能留下来。
-- 2. 用户删了内置风格，下次启动它又回来了 → 用 hidden 记住「这一份是删掉的」，
--    写回时同样跳过。删掉的行留在库里而不是物理删除，就是为了记住这件事。
ALTER TABLE style_packs ADD COLUMN customized INTEGER NOT NULL DEFAULT 0;
ALTER TABLE style_packs ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_style_hidden ON style_packs(hidden);
