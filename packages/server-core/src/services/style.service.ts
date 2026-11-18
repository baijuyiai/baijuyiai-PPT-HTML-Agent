import { all, count, get, insertRow, parseJson, run, updateRow } from '../db/client.js';
import { notFound } from '../lib/errors.js';
import { BUILTIN_STYLE_PACKS, lintStylePack, parseStyleRef, styleRef } from '@lumen/style-engine';
import { StylePack, type LintIssue, type StyleFamily } from '@lumen/ir-schema';

export interface StyleRow {
  styleId: string;
  family: string;
  version: string;
  name: string;
  pack: string;
  builtin: number;
  reviewed: number;
  /** 用户改过。内置包被改过之后，启动时不再用代码里的真值覆盖它 */
  customized: number;
  /** 用户删过。删掉的行留在库里就是为了记住这件事，否则下次启动会被重新种回来 */
  hidden: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * 写入五个内置风格族（PRD §5.2）。
 *
 * 内置风格的真值在代码里（`BUILTIN_STYLE_PACKS`），库里那份只是投影，
 * 所以**每次启动都要覆盖写回**——只写一次的话，代码加了新版式或新的设计语言字段，
 * 老库会一直用旧的那份，表现成「改了代码没生效」。这个坑踩过一次：
 * 新增目录页版式后，库里仍是旧包，生成到目录页就报「没有 toc 类型的版式」。
 *
 * 只覆盖 `builtin = 1` 的行；用户自己识别出来的包（builtin = 0）一律不碰。
 * `reviewed` 是管理员审过的状态，跟着保留。
 */
export function ensureBuiltinStyles(): { created: string[]; updated: string[]; kept: string[] } {
  const created: string[] = [];
  const updated: string[] = [];
  const kept: string[] = [];
  for (const pack of BUILTIN_STYLE_PACKS) {
    const id = styleRef(pack);
    const existing = get<StyleRow>('SELECT * FROM style_packs WHERE styleId = ?', id);
    const packJson = JSON.stringify(pack);

    if (!existing) {
      insertRow('style_packs', {
        styleId: id,
        family: pack.family,
        version: pack.version,
        name: pack.name,
        pack: packJson,
        builtin: 1,
        reviewed: 1,
        customized: 0,
        hidden: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      created.push(id);
      continue;
    }

    if (existing.builtin !== 1) continue;

    /**
     * 人改过或删过的内置包一律不碰。
     *
     * 「每次启动写回内置包」是为了让代码里的新字段立刻生效，
     * 但这条规则不能压过用户自己的改动——改了被覆盖、删了又回来，
     * 用户会认为这个库根本存不住东西。所以这两件事都记在库里，写回时让路。
     */
    if (existing.customized === 1 || existing.hidden === 1) {
      kept.push(id);
      continue;
    }

    if (existing.pack === packJson) continue;
    updateRow('style_packs', 'styleId', id, {
      family: pack.family,
      version: pack.version,
      name: pack.name,
      pack: packJson,
      updatedAt: Date.now(),
    });
    updated.push(id);
  }
  return { created, updated, kept };
}

export function toPack(row: StyleRow): StylePack {
  return StylePack.parse(parseJson<unknown>(row.pack, {}));
}

export interface StyleListQuery {
  family?: StyleFamily;
  q?: string;
  limit?: number;
  offset?: number;
}

export function listStyles(q: StyleListQuery = {}): { items: StyleRow[]; total: number } {
  // 删掉的风格不出现在库里
  const where: string[] = ['hidden = 0'];
  const params: unknown[] = [];
  if (q.family) {
    where.push('family = ?');
    params.push(q.family);
  }
  if (q.q) {
    where.push('(name LIKE ? OR styleId LIKE ?)');
    params.push(`%${q.q}%`, `%${q.q}%`);
  }
  const clause = where.join(' AND ');
  const limit = Math.min(Math.max(q.limit ?? 100, 1), 300);
  const offset = Math.max(q.offset ?? 0, 0);
  const total = count(`SELECT COUNT(*) AS n FROM style_packs WHERE ${clause}`, ...params);
  const items = all<StyleRow>(
    `SELECT * FROM style_packs WHERE ${clause} ORDER BY builtin DESC, updatedAt DESC LIMIT ? OFFSET ?`,
    ...params, limit, offset,
  );
  return { items, total };
}

/** 按 'family@version' 取；只给 family 时取该族最新版本 */
export function resolveStyle(ref: string): StylePack {
  const direct = get<StyleRow>('SELECT * FROM style_packs WHERE styleId = ?', ref);
  if (direct) return toPack(direct);

  let styleId = ref;
  try {
    styleId = parseStyleRef(ref).styleId;
  } catch {
    // 传入的就是纯 styleId
  }
  const rows = all<StyleRow>('SELECT * FROM style_packs WHERE styleId LIKE ? ORDER BY updatedAt DESC', `${styleId}@%`);
  if (rows.length === 0) throw notFound(`风格包不存在：${ref}`);
  return toPack(rows[0]!);
}

export function requireStyleRow(ref: string): StyleRow {
  const direct = get<StyleRow>('SELECT * FROM style_packs WHERE styleId = ?', ref);
  if (direct) return direct;
  const rows = all<StyleRow>('SELECT * FROM style_packs WHERE styleId LIKE ? ORDER BY updatedAt DESC', `${ref}@%`);
  if (rows.length === 0) throw notFound(`风格包不存在：${ref}`);
  return rows[0]!;
}

export interface SaveStyleResult {
  styleId: string;
  issues: LintIssue[];
  ok: boolean;
}

/** 保存（或覆盖）风格包。入库前必过设计 Lint，有 error 时拒绝。 */
export function saveStyle(input: StylePack): SaveStyleResult {
  const pack = StylePack.parse(input);
  const issues = lintStylePack(pack);
  const ok = !issues.some((i) => i.severity === 'error');
  if (!ok) return { styleId: styleRef(pack), issues, ok: false };

  const id = styleRef(pack);
  const existing = get<StyleRow>('SELECT * FROM style_packs WHERE styleId = ?', id);
  const payload = {
    family: pack.family,
    version: pack.version,
    name: pack.name,
    pack: JSON.stringify(pack),
    builtin: pack.meta.builtin ? 1 : 0,
    reviewed: pack.meta.reviewed ? 1 : 0,
    updatedAt: Date.now(),
  };
  if (existing) {
    updateRow('style_packs', 'styleId', id, {
      ...payload,
      // 改的是内置包就记一笔：启动时不再用代码里的真值覆盖它。
      // 不改这一位的话，用户辛苦调的参数会在下次重启时无声消失。
      ...(existing.builtin === 1 ? { customized: 1, hidden: 0 } : {}),
    });
  } else {
    insertRow('style_packs', { styleId: id, createdAt: Date.now(), customized: 0, hidden: 0, ...payload });
  }
  return { styleId: id, issues, ok: true };
}

/**
 * 删除风格包。
 *
 * 还有项目在用的不能直接删——项目存的是 styleId 引用，删掉之后那些项目打不开。
 * 但**光拒绝是不够的**：原来的提示是「先给它们换一个再删」，却不给换的入口，
 * 用户唯一的出路是自己去项目库挨个改，所以删除看上去就是「删不掉」。
 * 现在被占用时返回可执行的建议（`styleUsage`），带上要改的项目清单与推荐的替代风格，
 * 前端一键改过去再删（`opts.reassignTo`）。
 *
 * 内置包不是物理删除，而是标记 hidden：
 * 它的真值在代码里，每次启动都会按代码写回库，物理删掉下次启动就自己回来了。
 * 留一行记住「这个被删过」，写回时跳过，删除才是真的删除。
 * 想找回来用 restoreStyle。
 */
export function deleteStyle(
  styleId: string,
  opts: { reassignTo?: string } = {},
): DeleteStyleResult {
  const row = get<StyleRow>('SELECT * FROM style_packs WHERE styleId = ?', styleId);
  if (!row) throw notFound(`风格包不存在：${styleId}`);

  const used = all<{ projectId: string; title: string }>(
    'SELECT projectId, title FROM projects WHERE styleId = ? ORDER BY updatedAt DESC', styleId,
  );
  if (used.length > 0) {
    if (!opts.reassignTo) {
      return {
        deleted: false,
        reason: `还有 ${used.length} 个项目在用这个风格，先给它们换一个再删`,
        projects: used,
        suggestion: suggestReplacement(styleId),
      };
    }
    /**
     * 只有**换得成**才动项目。
     *
     * 目标风格必须存在且没被删；这里先校验再改，不校验的话
     * `UPDATE ... WHERE styleId = ?` 会静默把项目指向一个不存在的包，
     * 项目当场打不开，而删除本身却报告成功。
     */
    const target = get<StyleRow>('SELECT * FROM style_packs WHERE styleId = ?', opts.reassignTo);
    if (!target || target.hidden === 1) {
      throw notFound(`要换过去的风格不存在或已被删除：${opts.reassignTo}`);
    }
    if (target.styleId === styleId) {
      return { deleted: false, reason: '不能把项目换到正在删除的这套风格上', projects: used, suggestion: null };
    }
    run('UPDATE projects SET styleId = ?, updatedAt = ? WHERE styleId = ?', target.styleId, Date.now(), styleId);
  }

  if (row.builtin === 1) {
    updateRow('style_packs', 'styleId', styleId, { hidden: 1, updatedAt: Date.now() });
  } else {
    run('DELETE FROM style_packs WHERE styleId = ?', styleId);
  }
  return {
    deleted: true,
    reason: '',
    ...(used.length > 0 ? { reassigned: { count: used.length, to: opts.reassignTo! } } : {}),
  };
}

export interface DeleteStyleResult {
  deleted: boolean;
  reason: string;
  /** 没删成时给出：正在用它的项目，前端据此说明「改了哪几个」 */
  projects?: { projectId: string; title: string }[];
  /** 没删成时给出：推荐的替代风格。没有可用候选时为 null */
  suggestion?: StyleReplacement | null;
  /** 删成了且搬过项目时给出 */
  reassigned?: { count: number; to: string };
}

export interface StyleReplacement {
  styleId: string;
  name: string;
  /** 为什么推荐它，直接显示给用户 */
  reason: string;
}

/**
 * 给要被删的风格找一个「最符合」的替代。
 *
 * 排序依据按重要性递减：
 * 1. **同一个风格族**——同族的版式骨架、页类型覆盖、动效白名单都一致，
 *    换过去项目看起来最接近。这是最强信号，给 100 分。
 * 2. **明暗一致**——深色稿换到浅色风格，整本册子会当场翻个个儿，比版式差异刺眼得多。25 分。
 * 3. **调性词重合**——「克制」「权威」这类词是识别时按调性打上的，重合越多越接近。每个 8 分。
 * 4. **内置优先**——内置包的真值在代码里，永远在库里，不会哪天又被删掉。10 分。
 *
 * 都不满足时也能选出一个（分数并列时取名字靠前的），因为「删不掉」比「换得不完美」糟糕得多。
 */
export function suggestReplacement(styleId: string): StyleReplacement | null {
  const rows = all<StyleRow>(
    'SELECT * FROM style_packs WHERE hidden = 0 AND styleId != ? ORDER BY builtin DESC, name', styleId,
  );
  if (rows.length === 0) return null;

  const source = get<StyleRow>('SELECT * FROM style_packs WHERE styleId = ?', styleId);
  const src = source ? safePack(source) : null;

  let best: StyleRow | null = null;
  let bestScore = -1;
  let bestWhy = '';
  for (const row of rows) {
    const pack = safePack(row);
    let score = row.builtin === 1 ? 10 : 0;
    const why: string[] = [];
    if (src && pack) {
      if (pack.family === src.family) {
        score += 100;
        why.push('同一风格族，版式骨架一致');
      }
      if (pack.base.language.theme === src.base.language.theme) {
        score += 25;
        why.push(pack.base.language.theme === 'dark' ? '同为深色' : '同为浅色');
      }
      const shared = pack.toneKeywords.filter((k) => src.toneKeywords.includes(k));
      score += shared.length * 8;
      if (shared.length > 0) why.push(`调性接近（${shared.slice(0, 3).join('、')}）`);
    }
    if (score > bestScore) {
      best = row;
      bestScore = score;
      bestWhy = why.join('；');
    }
  }
  if (!best) return null;
  return {
    styleId: best.styleId,
    name: best.name,
    reason: bestWhy || '库里剩下的风格中差异最小的一个',
  };
}

/** 库里的包可能因为手工改库或旧版本而解析不了，解析不了就只按行上的字段比较 */
function safePack(row: StyleRow): StylePack | null {
  try {
    return toPack(row);
  } catch {
    return null;
  }
}

/** 被删掉的内置风格。用来在库里提示「有 N 个内置风格被隐藏了，可以恢复」 */
export function listHiddenStyles(): StyleRow[] {
  return all<StyleRow>('SELECT * FROM style_packs WHERE hidden = 1 ORDER BY family');
}

/**
 * 恢复一个被删掉或改过的内置风格：回到代码里的真值。
 * 自建的风格没有「默认值」可回，只能恢复被删的内置包，所以对非内置包直接拒绝。
 */
export function restoreStyle(styleId: string): StyleRow {
  const row = get<StyleRow>('SELECT * FROM style_packs WHERE styleId = ?', styleId);
  if (!row) throw notFound(`风格包不存在：${styleId}`);
  if (row.builtin !== 1) throw notFound(`只有内置风格可以恢复默认：${styleId}`);

  const fresh = BUILTIN_STYLE_PACKS.find((p) => styleRef(p) === styleId);
  if (!fresh) throw notFound(`代码里已经没有这个内置风格了：${styleId}`);

  updateRow('style_packs', 'styleId', styleId, {
    family: fresh.family,
    version: fresh.version,
    name: fresh.name,
    pack: JSON.stringify(fresh),
    reviewed: 1,
    customized: 0,
    hidden: 0,
    updatedAt: Date.now(),
  });
  return get<StyleRow>('SELECT * FROM style_packs WHERE styleId = ?', styleId)!;
}

/** 风格库审核（admin） */
export function reviewStyle(styleId: string, reviewed: boolean): StyleRow {
  const row = get<StyleRow>('SELECT * FROM style_packs WHERE styleId = ?', styleId);
  if (!row) throw notFound(`风格包不存在：${styleId}`);
  updateRow('style_packs', 'styleId', styleId, { reviewed: reviewed ? 1 : 0, updatedAt: Date.now() });
  return get<StyleRow>('SELECT * FROM style_packs WHERE styleId = ?', styleId)!;
}

/** 风格包的版本升级：同族新版本写入后，旧版本保留以便回溯 */
export function bumpVersion(ref: string, changes: Partial<StylePack>): SaveStyleResult {
  const current = resolveStyle(ref);
  const [major, minor] = current.version.split('.').map((n) => Number(n) || 0);
  const next: StylePack = {
    ...current,
    ...changes,
    styleId: current.styleId,
    version: `${major}.${(minor ?? 0) + 1}`,
    meta: { ...current.meta, builtin: false, reviewed: false, updatedAt: Date.now() },
  };
  return saveStyle(next);
}
