import { DatabaseSync, type StatementSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { dbPath } from '../env.js';

/** SQLite 可接受的绑定值 */
export type SqlValue = null | number | bigint | string | Uint8Array;

let instance: DatabaseSync | null = null;

function open(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const d = new DatabaseSync(path);
  // WAL 提升并发读写；busy_timeout 避免多进程（api + worker）争用时直接报 SQLITE_BUSY
  d.exec('PRAGMA journal_mode = WAL');
  d.exec('PRAGMA foreign_keys = ON');
  d.exec('PRAGMA busy_timeout = 5000');
  d.exec('PRAGMA synchronous = NORMAL');
  return d;
}

/** 全局连接（api 与 worker 各自进程一份） */
export function getDb(): DatabaseSync {
  if (!instance) instance = open(dbPath);
  return instance;
}

export function closeDb(): void {
  instance?.close();
  instance = null;
}

/** 测试用：替换全局连接 */
export function setDbForTest(d: DatabaseSync | null): void {
  instance = d;
}

/** 测试用：开一个独立连接（不污染全局单例） */
export function openDatabase(path: string): DatabaseSync {
  return open(path);
}

/** 把 JS 值转换为 SQLite 可绑定值：布尔转 0/1，对象转 JSON，undefined 转 null */
export function toSqlValue(v: unknown): SqlValue {
  if (v === undefined || v === null) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'string') return v;
  if (v instanceof Uint8Array) return v;
  return JSON.stringify(v);
}

export function run(sql: string, ...params: unknown[]): void {
  getDb().prepare(sql).run(...params.map(toSqlValue));
}

export function all<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  return getDb().prepare(sql).all(...params.map(toSqlValue)) as T[];
}

export function get<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T | undefined {
  return getDb().prepare(sql).get(...params.map(toSqlValue)) as T | undefined;
}

export function pluck<T = unknown>(sql: string, ...params: unknown[]): T | undefined {
  const row = get<Record<string, T>>(sql, ...params);
  if (!row) return undefined;
  const keys = Object.keys(row);
  return keys.length > 0 ? row[keys[0]!] : undefined;
}

export function count(sql: string, ...params: unknown[]): number {
  return Number(pluck<number>(sql, ...params) ?? 0);
}

/** 事务包装。用 BEGIN IMMEDIATE 立即取写锁，避免并发下升级锁失败。 */
export function tx<T>(fn: () => T): T {
  const d = getDb();
  d.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    d.exec('COMMIT');
    return result;
  } catch (err) {
    try {
      d.exec('ROLLBACK');
    } catch {
      // 回滚失败时保留原始错误
    }
    throw err;
  }
}

/**
 * 按列名插入。表名与列名来自代码常量，不接受用户输入。
 * 返回插入的行数。
 */
export function insertRow(table: string, row: Record<string, unknown>): void {
  const cols = Object.keys(row);
  if (cols.length === 0) throw new Error(`insertRow: ${table} 没有可插入的列`);
  const sql = `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`;
  run(sql, ...cols.map((c) => row[c]));
}

/** 按主键更新。只更新 patch 中出现的列。 */
export function updateRow(
  table: string,
  keyColumn: string,
  keyValue: unknown,
  patch: Record<string, unknown>,
): number {
  const cols = Object.keys(patch);
  if (cols.length === 0) return 0;
  const sql = `UPDATE ${table} SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE ${keyColumn} = ?`;
  const stmt: StatementSync = getDb().prepare(sql);
  const res = stmt.run(...cols.map((c) => toSqlValue(patch[c])), toSqlValue(keyValue));
  return Number(res.changes);
}

/** JSON 列安全解析：损坏时回退到 fallback，不让单条脏数据炸掉整个请求 */
export function parseJson<T>(text: unknown, fallback: T): T {
  if (typeof text !== 'string' || text === '') return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
