import { createApp } from './app.js';
import { env } from '@lumen/server-core';
import { migrate } from '@lumen/server-core';
import { ensureSeed } from '@lumen/server-core';
import { seedStyleDocs } from '@lumen/server-core';
import { logger } from '@lumen/server-core';

const applied = migrate();
if (applied.length > 0) logger.info('已应用数据库迁移', { migrations: applied });

const seeded = ensureSeed();
if (seeded.length > 0) logger.info('已写入种子数据', { items: seeded });

/*
 * 把随仓库分发的风格资产补齐。新环境（另一台机器、刚克隆的仓库、部署上去的服务器）
 * 起来时风格库是空的，这一趟让它直接拥有全部平台风格；已经有的不动——
 * 库里那份可能被人手改过。见 `seedStyleDocs` 的注释。
 */
const seededStyles = seedStyleDocs();
if (seededStyles.inserted.length > 0) {
  logger.info('已从风格资产补入风格', {
    styles: seededStyles.inserted,
    skipped: seededStyles.skipped,
  });
}
/*
 * 用户删过、这次故意没补回来的那几套。
 *
 * **单独记一条**：不然「库里怎么比资产少两套」只能靠翻 `deleted_style_docs` 才查得到，
 * 而这条日志恰好是排查「删了又回来」时的第一现场。
 */
if (seededStyles.deletedSkipped.length > 0) {
  logger.info('这几套风格被删过，资产同步跳过', { styles: seededStyles.deletedSkipped });
}

// 这里原本会调 `ensureBuiltinStyles()` 把代码里那五套风格包写进 `style_packs`。
// **现在不再写了**：风格的真值已经搬到风格库（`style_docs`），项目、工作台、
// 能力总览、admin 都只读那边；再写回来只会让「已经删掉的旧风格」每次重启又冒出来。
// 旧渲染器那条路还留着，它自己的兜底是从代码里的 `BUILTIN_STYLE_PACKS` 取，不依赖这张表。

const app = createApp();
app.listen(env.LUMEN_PORT, () => {
  logger.info('HTML PPT OS API 已启动', {
    port: env.LUMEN_PORT,
    publicBaseUrl: env.LUMEN_PUBLIC_BASE_URL,
    allowSelfSignup: env.LUMEN_ALLOW_SELF_SIGNUP,
  });
});
