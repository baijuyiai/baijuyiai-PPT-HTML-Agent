/**
 * 把项目数据导成随仓库分发的文件，让本地与远端能对上。
 *
 * ## 和风格库那套的分别
 *
 * 风格库是**平台资产**（谁识别出来都一样对所有人可用），所以导成一个共享文件。
 * 项目是**用户数据**——跟着账号走，A 的项目不该出现在 B 的列表里。所以这里
 * 按 `tenantId` 分目录，一个项目一份文件：既保证隔离，又让 diff 只落在改过的那一个项目上。
 *
 * ## 顺带说明不导什么
 *
 * - **上传的原始文件**（`data/objects/`，现在 200 MB+）不进仓库：二进制、增长没有上限，
 *   塞进 git 历史之后就再也删不干净了。它们留在本机，跟着服务器/本机盘一起备份。
 * - **账号与令牌**（users / sessions / app_settings）不进仓库：那是凭据，不该进版本管理。
 *
 * 跑法（仓库根目录）：pnpm data:export [--db <路径>]
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'data-sync';

const dbArgIndex = process.argv.indexOf('--db');
const DB = dbArgIndex >= 0 ? process.argv[dbArgIndex + 1] : (process.env.LUMEN_DB_PATH ?? 'data/lumen.db');

const db = new DatabaseSync(DB, { readOnly: true });

const projects = db.prepare('SELECT * FROM projects ORDER BY projectId').all();
if (projects.length === 0) {
  console.error(`库里一个项目都没有（${DB}），没什么可导的。`);
  process.exit(1);
}

// 整目录重建：库里删掉的项目，文件也必须跟着消失，否则下次会被当成「远端有」导回来
rmSync(OUT, { recursive: true, force: true });

let bytes = 0;
const perTenant = new Map();

for (const project of projects) {
  const pages = db.prepare('SELECT * FROM pages WHERE projectId = ? ORDER BY pageIndex').all(project.projectId);
  const decks = db.prepare('SELECT * FROM decks WHERE projectId = ? ORDER BY deckId').all(project.projectId);

  const payload = { project, decks, pages };
  // `pages.ir` 保持 DB 里那个字符串原样，不解析再序列化：往返无损，
  // 也就不会因为格式化差异凭空造出一堆假 diff
  const text = `${JSON.stringify(payload, null, 2)}\n`;

  const dir = join(OUT, String(project.tenantId));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${project.projectId}.json`), text);

  bytes += Buffer.byteLength(text);
  perTenant.set(project.tenantId, (perTenant.get(project.tenantId) ?? 0) + 1);
}

console.log(`已导出 ${projects.length} 个项目 → ${OUT}/`);
for (const [tenant, n] of [...perTenant].sort()) {
  console.log(`  · ${tenant}：${n} 个`);
}
console.log(`共 ${(bytes / 1024).toFixed(0)} KB`);
