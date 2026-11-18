-- 计费单价。全 0 表示未配置，用量记录里的费用保持 0，不做任何猜测。
-- 单位是人民币元：token 按每百万计价，图片按张计价。
ALTER TABLE providers ADD COLUMN pricing TEXT NOT NULL DEFAULT '{"inputPerMTokens":0,"outputPerMTokens":0,"perImage":0}';
