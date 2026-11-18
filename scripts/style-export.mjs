/**
 * 把库里现存的风格导成随仓库分发的资产文件。
 *
 * 为什么要有这一步：风格原本只存在 `data/lumen.db` 里，换一台机器、换一个人
 * 就拿不到——而这五套风格是**平台资产**（谁识别出来的都一样对所有人可用），
 * 不该跟着某个人的库走。导成文件提交进仓库之后，拉到代码的所有环境都有一份
 * 相同的风格库，推到远端就等于存到了云端。配图库（`packages/stock-library`）
 * 一直是这个形态，风格库补齐它。
 *
 * 一次完整的同步是**两步**：
 *   1. 在界面上识别/调整风格（写进 DB）
 *   2. `pnpm style:export` 把 DB 导成文件，然后提交
 * 反过来，新环境起来时 `seedStyleDocs()` 会把文件里、库里还没有的风格补进去。
 *
 * 跑法（仓库根目录）：pnpm style:export [--db <路径>]
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const OUT = 'packages/style-library/assets/styles.json';

const dbArgIndex = process.argv.indexOf('--db');
const DB = dbArgIndex >= 0 ? process.argv[dbArgIndex + 1] : (process.env.LUMEN_DB_PATH ?? 'data/lumen.db');

const db = new DatabaseSync(DB, { readOnly: true });
const rows = db.prepare('SELECT styleId, name, doc FROM style_docs').all();

if (rows.length === 0) {
  console.error(`库里一套风格都没有（${DB}），没什么可导的。`);
  process.exit(1);
}

/**
 * 去掉 meta 里的两个时间戳再导出。
 *
 * 它们是运行时的记账（「这条记录什么时候被写的」），不是风格的实质内容。
 * 而且 `saveStyleDoc` 每次都会把 `updatedAt` 刷成当前时间——带上它们的话，
 * 每同步一次就产生一个「只改了时间」的假 diff，把真正的内容变化淹掉。
 */
function withoutTimestamps(doc) {
  const meta = doc.meta ?? {};
  return {
    ...doc,
    meta: { builtin: meta.builtin, reviewed: meta.reviewed, customized: meta.customized },
  };
}

/** 按名字排，顺序稳定——不然每次导出的数组顺序都可能变，diff 里全是噪音 */
const styles = rows
  .map((r) => withoutTimestamps(JSON.parse(String(r.doc))))
  .sort((a, b) => String(a.name).localeCompare(String(b.name), 'zh'));

mkdirSync(dirname(OUT), { recursive: true });
// 缩进 2 空格：这份文件是要给人看 diff 的，一行到底就失去意义了
writeFileSync(OUT, `${JSON.stringify(styles, null, 2)}\n`);

const bytes = Buffer.byteLength(JSON.stringify(styles));
console.log(`已导出 ${styles.length} 套风格 → ${OUT}`);
for (const s of styles) {
  const pages = Object.keys(s.pagePrompts ?? {}).length;
  console.log(`  · ${s.name}（${pages} 个页类型）`);
}
console.log(`共 ${(bytes / 1024).toFixed(0)} KB`);
