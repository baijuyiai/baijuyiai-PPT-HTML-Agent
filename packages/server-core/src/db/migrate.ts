import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getDb, all, run, tx } from './client.js';

const migrationsDir = fileURLToPath(new URL('./migrations/', import.meta.url));

/**
 * 顺序执行未应用的迁移，幂等。
 * 返回本次新应用的迁移文件名。
 */
export function migrate(): string[] {
  const db = getDb();
  // 迁移记录表必须先于任何迁移存在
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (id TEXT PRIMARY KEY, appliedAt INTEGER NOT NULL)');

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const applied = new Set(all<{ id: string }>('SELECT id FROM schema_migrations').map((r) => r.id));

  const newly: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(resolve(migrationsDir, file), 'utf8');
    tx(() => {
      db.exec(sql);
      run('INSERT INTO schema_migrations (id, appliedAt) VALUES (?, ?)', file, Date.now());
    });
    newly.push(file);
  }
  return newly;
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;

if (isMain) {
  const applied = migrate();
  if (applied.length === 0) {
    console.log('数据库已是最新，无迁移需要应用');
  } else {
    console.log(`已应用 ${applied.length} 个迁移：${applied.join(', ')}`);
  }
}
