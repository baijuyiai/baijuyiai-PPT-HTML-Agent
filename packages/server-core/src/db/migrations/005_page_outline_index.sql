-- 每页来自哪条大纲。
-- 拆页会让一页大纲产出多页，于是「页在 deck 里的位置」和「大纲下标」不再相等；
-- 「优先生成」要把新页插回它该在的位置，就得知道这个映射。
-- 历史行留 NULL：那时候生成顺序与大纲一致，读取侧按位置回退即可。
ALTER TABLE pages ADD COLUMN outlineIndex INTEGER;
