-- 把已有风格的正文字体栈换成「自带拉丁字体排最前」的那一版。
--
-- 为什么必须迁移，而不是只改 zod 的默认值：
-- `fontFamily` 是**存进 doc 里**的（与 fontDisplay / fontScript 不同——那两个当初就没写进库，
-- 读的时候才落默认值，所以改默认值对老数据是有效的）。只改默认值的话，
-- 已经存在的那几套风格一点变化都没有，用户看到的是「改了没生效」。
--
-- 只改**正好等于旧默认值**的那些行：用户自己调过字体栈的风格不动。
-- 这条 WHERE 也让迁移是幂等的——重跑一次匹配不到任何行。
UPDATE style_docs
SET doc = json_set(
  doc,
  '$.fontFamily',
  'Montserrat, system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif'
)
WHERE json_extract(doc, '$.fontFamily') =
  'system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif';

-- fontDisplay / fontScript 不在这里迁：库里那几套风格的这两个字段是**缺省的**（当初没写进去），
-- 读的时候才由 zod 落默认值，所以换 DEFAULT_FONT_DISPLAY 对它们自动生效。
-- 手写体那一档用户选的就是原来的默认值（Segoe Script 排最前），也不用动。
