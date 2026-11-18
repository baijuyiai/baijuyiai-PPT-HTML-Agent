/**
 * 把 data-sync/ 里的项目导回库里。
 *
 * 默认**只补缺失**：库里已经有这个 projectId 就跳过。这条默认是为了不丢东西——
 * 本地那份可能比文件新（比如刚在界面上改过、还没来得及导出），覆盖掉就白改了。
 * 真要以文件为准，显式加 `--force`。
 *
 * 注意它**不动**账号、令牌与上传的原始文件（`data/objects/`）：前者不进仓库，
 * 后者体积无上限、塞进 git 历史就删不干净。所以导完之后「上传的图还在不在」
 * 取决于对象存储本身，与这个脚本无关。
 *
 * 跑法（仓库根目录）：pnpm data:import [--force] [--db <路径>]
 */
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = 'data-sync';
const FORCE = process.argv.includes('--force');

const dbArgIndex = process.argv.indexOf('--db');
const DB = dbArgIndex >= 0 ? process.argv[dbArgIndex + 1] : (process.env.LUMEN_DB_PATH ?? 'data/lumen.db');

const db = new DatabaseSync(DB);

/** 列名全部来自文件里的行本身，所以表加列不用改这里 */
function upsert(table, row) {
  const cols = Object.keys(row);
  const placeholders = cols.map(() => '?').join(', ');
  db.prepare(`INSERT OR REPLACE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`)
    .run(...cols.map((c) => row[c]));
}

let imported = 0;
let skipped = 0;

for (const tenant of readdirSync(SRC)) {
  const dir = join(SRC, tenant);
  if (!statSync(dir).isDirectory()) continue;

  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;

    const { project, decks = [], pages = [] } = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const existing = db.prepare('SELECT projectId FROM projects WHERE projectId = ?').get(project.projectId);
    if (existing && !FORCE) {
      skipped += 1;
      continue;
    }

    // 项目和它的页面、大纲一起换，不能只换一半——只更新 projects 行的话，
    // 列表上看得到项目，点进去却是空的
    upsert('projects', project);
    for (const deck of decks) upsert('decks', deck);
    for (const page of pages) upsert('pages', page);
    imported += 1;
  }
}

console.log(`导回 ${imported} 个项目${skipped > 0 ? `，跳过 ${skipped} 个已存在的（要覆盖加 --force）` : ''}`);
