-- 图片接口方言：不同服务商的调用方式与参数写法差别很大，
-- 靠配置区分而不是靠猜响应形状。
--   imageApi           sync（一次请求直接返回）| task（提交拿 id 再轮询）
--   imageSizeFormat    pixels（1536x1024）| ratio（16:9 另配 resolution）
--   imageResolution    ratio 写法时的清晰度档位，1K / 2K / 4K
--   imagePollTimeoutMs task 模式的轮询上限，必须显著大于 timeoutMs
--   imageExtraParams   固定附加参数，如 {"background":"transparent"}
ALTER TABLE providers ADD COLUMN imageApi TEXT NOT NULL DEFAULT 'sync';
ALTER TABLE providers ADD COLUMN imageSizeFormat TEXT NOT NULL DEFAULT 'pixels';
ALTER TABLE providers ADD COLUMN imageResolution TEXT NOT NULL DEFAULT '2K';
ALTER TABLE providers ADD COLUMN imagePollTimeoutMs INTEGER NOT NULL DEFAULT 420000;
ALTER TABLE providers ADD COLUMN imageExtraParams TEXT NOT NULL DEFAULT '{}';
