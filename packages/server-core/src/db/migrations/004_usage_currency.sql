-- 用量记录的计费币种。
-- 历史行的 cost 全是 0（单价当时未配置），给它们标成 CNY 不会造成任何误导；
-- 真正有金额的记录都产生在这次迁移之后。
ALTER TABLE usage_records ADD COLUMN currency TEXT NOT NULL DEFAULT 'CNY';
