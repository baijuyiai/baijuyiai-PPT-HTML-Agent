-- 项目品牌：上传的 logo、它的矢量重绘稿、以及品牌名与标语。
--
-- 五列都跟着**项目**走，不跟着某一次生成走——一本 deck 一套品牌，
-- 与 depth / targetPages 同一条规矩。
--
-- brandLogoSvg 存的是 SVG 源码而不是对象 key：装配页面的 buildPageDocument 是**同步**函数，
-- 取不了远端对象。几 KB 一行，比把装配改成异步划算得多。
--
-- brandLogoMode 三态：'' 没有 logo、'redraw' 用重绘稿、'original' 用上传的原图。
-- 显式存一列而不是「有 svg 就用 svg」：重绘成功之后用户仍可能想退回原图，
-- 靠推导就退不回去了。
ALTER TABLE projects ADD COLUMN brandLogoImage TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN brandLogoSvg TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN brandLogoMode TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN brandName TEXT NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN brandTagline TEXT NOT NULL DEFAULT '';
