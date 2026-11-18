/**
 * 把 `pages` 的行号按大纲下标归位。
 *
 * ## 出了什么事
 *
 * 旧链路会「拆页」：一页内容太多就派生出 `<pageId>-r1`、`-r2` 续页，它们**排在主页后面**、
 * 各自占一个 `pageIndex`。新链路不拆页，但这些行留在了库里，于是
 *
 *   `pages.pageIndex`  ≠  `大纲下标`
 *
 * 而工作台是按「大纲第几条」摆格子的（`apps/web/src/workbench/store.ts` 的 `pageSlots`：
 * 建一个长度 = 大纲条数的数组，`pages[entry.pageIndex] = entry.page`，**下标超出去的直接丢**）。
 * 两个坐标系一旦错开，后果是：
 *
 *   · 大纲第 7–10 条的页被挤到 pageIndex 11/13/15/17，**界面上整个消失**；
 *   · 本该是第 7 条的格子里，显示的是某个续页残片；
 *   · 在错位的格子上「保存本页」会把改动写进那张残片（实测那一行被写了 9 次）。
 *
 * 实测 `prj_lkb4at8ajz`：大纲 10 条、页行 19 行，其中 9 行落在界面可视范围之外——
 * 用户看到的就是「已保存的页面不见了」。
 *
 * ## 怎么修
 *
 * 按 `outlineIndex` 归位，**一行都不删**：
 *
 *   1. 每个大纲格挑一行：优先非续页（pageId 不匹配 `-r\d+$`），再优先有 layoutVariant 的，
 *      再取 updatedAt 最新的；
 *   2. 其余行（续页、没有 outlineIndex 的）按原 pageIndex 顺序排到大纲长度之后；
 *   3. 用「先全部挪到负数区间」的写法回写，避免中途撞 (projectId, pageIndex) 唯一索引
 *      —— 与 `savePageGroup` 同一套手法。
 *
 * 归位之后 `pageIndex` 与大纲下标一一对应，`refreshProjectCounts` 只数可视范围内的行，
 * 项目卡上的页数也就跟工作台对上了。
 *
 * 幂等：再跑一次什么都不会变。
 *
 * 跑法（仓库根目录）：
 *   node --import tsx scripts/repair-page-slots.ts          # 只看要改哪些
 *   node --import tsx scripts/repair-page-slots.ts --apply
 */
import { existsSync, copyFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { all, get, run } from '../packages/server-core/src/db/client.ts';

const apply = process.argv.includes('--apply');
const DB = path.join(process.cwd(), 'data', 'lumen.db');

/** 备份用 `VACUUM INTO`：那是唯一能把 WAL 里未落盘的部分一起凝固下来的写法 */
function backup(): string {
  const dst = `${DB}.bak-before-slot-repair`;
  if (existsSync(dst)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const alt = `${dst}-${stamp}`;
    vacuum(alt);
    return alt;
  }
  vacuum(dst);
  return dst;
}

function vacuum(dst: string): void {
  const tmp = path.join(os.tmpdir(), `lumen-vacuum-${Date.now()}.db`);
  const d = new DatabaseSync(DB);
  d.exec(`VACUUM INTO '${tmp.replace(/\\/g, '/')}'`);
  d.close();
  copyFileSync(tmp, dst);
  console.log(`  备份 → ${path.relative(process.cwd(), dst)}`);
}

/** 续页：旧链路拆页派生的 `<id>-r1`、`-r2`… */
const isContinuation = (pageId: string): boolean => /-r\d+$/.test(pageId);

interface Row {
  pageId: string;
  pageIndex: number;
  outlineIndex: number | null;
  ir: string;
}

function layoutOf(ir: string): string {
  try { return String((JSON.parse(ir) as { layoutVariant?: unknown }).layoutVariant ?? ''); } catch { return ''; }
}

function outlineLengthOf(projectId: string): number {
  const d = get<{ meta: string }>('SELECT meta FROM decks WHERE projectId = ?', projectId);
  if (!d) return 0;
  try { return (JSON.parse(d.meta) as { outline?: unknown[] }).outline?.length ?? 0; } catch { return 0; }
}

interface Plan {
  projectId: string;
  title: string;
  moves: { pageId: string; from: number; to: number; why: string }[];
  /** 目标位置表：下标即 pageIndex，null 表示这一格空着。空档必须留在原位，不能压掉 */
  target: (string | null)[];
  outlineLen: number;
  /** 归位前的体检数据，写完拿它比对 */
  rowsBefore: number;
  visibleBefore: number;
}

function planOf(projectId: string, title: string): Plan | null {
  const outlineLen = outlineLengthOf(projectId);
  if (outlineLen === 0) return null;

  const rows = all<Row>(
    'SELECT pageId, pageIndex, outlineIndex, ir FROM pages WHERE projectId = ? ORDER BY pageIndex', projectId,
  );
  if (rows.length === 0) return null;

  /**
   * **只在「真有页掉出了可视区」的项目上动手。**
   *
   * 判据是行数超过大纲条数——只有这时 `pageSlots` 才会丢页。行数没超的项目，
   * 每一行都落在可视范围内，界面本来就看得到；去动它只会把行号重新洗一遍，
   * 万一哪两条的 `outlineIndex` 是重复的（实测 `prj_u3zrgvlkke` 就有），
   * 洗牌反而会把两页从可视区里挤出去——比不修还糟。
   */
  if (rows.length <= outlineLen) return null;

  const visibleBefore = rows.filter((r) => r.pageIndex < outlineLen).length;

  // 每个大纲格挑一行
  const slots: (Row | null)[] = [];
  for (let i = 0; i < outlineLen; i += 1) slots.push(null);
  const taken = new Set<string>();
  for (let i = 0; i < outlineLen; i += 1) {
    const cands = rows.filter((r) => r.outlineIndex === i && !taken.has(r.pageId));
    if (cands.length === 0) continue;
    const rank = (r: Row): number[] => [
      isContinuation(r.pageId) ? 1 : 0,          // 主页优于续页
      layoutOf(r.ir) ? 0 : 1,                    // 有版式优于没版式
      r.pageIndex >= outlineLen ? 1 : 0,         // 原本就可见的优于被挤出去的
    ];
    cands.sort((a, b) => {
      const ra = rank(a); const rb = rank(b);
      for (let k = 0; k < ra.length; k += 1) if (ra[k] !== rb[k]) return ra[k]! - rb[k]!;
      return b.pageIndex - a.pageIndex;          // 同分取靠后的（通常是更新的那份）
    });
    const winner = cands[0]!;
    slots[i] = winner;
    taken.add(winner.pageId);
  }

  /**
   * 第二步：**没有占据任何大纲格的行，能留在原地就留在原地**。
   *
   * 这一步是为「没有 outlineIndex 的页」兜底的。它们没有归属，但用户是看得见它们的
   * ——比如 `prj_dkl30iderp` 那张 chart 页就落在大纲第 1 格的位置上，把它当超纲撵走，
   * 用户反而少看到一页。只要它现在待的格子在 [0, 大纲条数) 以内、又没人认领，就让它待着。
   *
   * 留在原地的行同样不可能把可视范围撑大：格子的总数就是大纲条数，这里只是填空格。
   */
  const rest: string[] = [];
  for (const r of rows) {
    if (taken.has(r.pageId)) continue;
    if (r.pageIndex >= 0 && r.pageIndex < outlineLen && slots[r.pageIndex] === null) {
      slots[r.pageIndex] = r;
      taken.add(r.pageId);
    } else {
      rest.push(r.pageId);
    }
  }
  /**
   * 目标位置表。**空档要留着**——稀疏项目里（比如大纲 8 条、库里只有第 2/3/4/5 条落了页）
   * 如果把空格过滤掉，第 5 条的页会被顶到第 3 格上去，等于换了个错位法。
   * 下标 `i < outlineLen` 就是大纲第 i+1 条；再往后是超纲行，按原顺序续上。
   */
  const target: (string | null)[] = [...slots.map((s) => s?.pageId ?? null), ...rest];

  const moves: Plan['moves'] = [];
  target.forEach((id, at) => {
    if (id === null) return;
    const row = rows.find((r) => r.pageId === id)!;
    if (row.pageIndex !== at) {
      moves.push({
        pageId: id, from: row.pageIndex, to: at,
        why: at < outlineLen ? `落回大纲第 ${at + 1} 条` : '超纲，挪到可视范围之后',
      });
    }
  });
  return { projectId, title, moves, target, outlineLen, rowsBefore: rows.length, visibleBefore: visibleBefore };
}

const projects = all<{ projectId: string; title: string }>('SELECT projectId, title FROM projects ORDER BY projectId');
const plans: Plan[] = [];
for (const p of projects) {
  const plan = planOf(p.projectId, p.title);
  if (plan && plan.moves.length > 0) plans.push(plan);
}

if (plans.length === 0) {
  console.log('所有项目的页行号与大纲下标都已经对齐，不用修。');
  process.exit(0);
}

for (const plan of plans) {
  console.log(`\n${plan.title}  (${plan.projectId})`);
  for (const m of plan.moves) console.log(`   #${String(m.from).padStart(2)} → #${String(m.to).padStart(2)}  ${m.pageId}  ${m.why}`);
}

if (!apply) {
  console.log('\n（只看了看，加 --apply 才真改）');
  process.exit(0);
}

console.log('\n先备份：');
backup();

for (const plan of plans) {
  // 先全挪到负数区间，再按目标位置写回——中途不会有两行抢同一个序号
  const ids = plan.target.filter((x): x is string => x !== null);
  ids.forEach((id, i) => run('UPDATE pages SET pageIndex = ? WHERE pageId = ?', -1 - i, id));
  plan.target.forEach((id, i) => { if (id !== null) run('UPDATE pages SET pageIndex = ? WHERE pageId = ?', i, id); });
  console.log(`  ${plan.title}：${ids.length} 行已归位（保留 ${plan.target.length - ids.length} 个空档）`);

  // 归位只许换位置：行数必须与归位前一致，可视范围内的行数也不许变少
  const after = all<{ n: number; visible: number }>(
    'SELECT COUNT(*) n, SUM(CASE WHEN pageIndex < ? THEN 1 ELSE 0 END) visible FROM pages WHERE projectId = ?',
    plan.outlineLen, plan.projectId,
  )[0]!;
  if (after.n !== plan.rowsBefore) {
    throw new Error(`${plan.title}：归位后行数对不上（${plan.rowsBefore} → ${after.n}），停下来人工看`);
  }
  if (after.visible !== plan.visibleBefore) {
    throw new Error(`${plan.title}：归位后可视范围内的页数变了（${plan.visibleBefore} → ${after.visible}），停下来人工看`);
  }
}

// 页数统计跟着重算，项目卡上的数字才会跟工作台一致
const { refreshProjectCounts } = await import('../packages/server-core/src/services/project.service.ts');
for (const plan of plans) refreshProjectCounts(plan.projectId);
console.log('\n已写入，并重算了项目页数。');
process.exit(0);
