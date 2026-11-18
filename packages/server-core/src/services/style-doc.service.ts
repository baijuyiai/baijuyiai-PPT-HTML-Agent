import {
  StyleDoc, coveredPageTypes, lintStylePrompt, styleRef,
  type StyleDocSummary, type StylePalette, type StylePack,
} from '@lumen/ir-schema';
import { BUILTIN_STYLE_DOCS } from '@lumen/style-library';
import { all, count, get, insertRow, parseJson, run, updateRow } from '../db/client.js';
import { notFound } from '../lib/errors.js';
import { resolveStyle } from './style.service.js';

/**
 * 新链路的风格存取。
 *
 * 与 `style.service.ts` 并存：那张表管旧链路（设计 token + 版式几何），
 * 这张管新链路（每页一条 HTML 生成提示词 + 样机）。两者共用 styleId 命名空间，
 * 项目表的 `styleId` 存的就是它。切换完成后旧表与旧服务一起删。
 */

export interface StyleDocRow {
  styleId: string;
  version: string;
  name: string;
  doc: string;
  builtin: number;
  reviewed: number;
  customized: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * 列表项的类型在 `@lumen/ir-schema`（前后端共用同一个契约）。
 * 这里只补服务端独有的：三个字体角色要带出来，样机渲染要用。
 */
export type StyleDocSummaryOut = StyleDocSummary;

export interface SaveStyleDocResult {
  styleId: string;
  /** 结构不合规的提示词。warning 级，不阻断保存 */
  issues: { pageType: string; message: string }[];
  ok: boolean;
}

export function toDoc(row: StyleDocRow): StyleDoc {
  return StyleDoc.parse(parseJson<unknown>(row.doc, {}));
}

/**
 * 存一份风格。入库前校验每条提示词的结构。
 *
 * **不合规只警告、不拒绝**：提示词是模型写的，四段结构偶尔会缺一段。
 * 缺了「代码要求」的提示词照样能用（生成的 HTML 只是不会用 CSS 变量），
 * 因为这一条把整份识别结果丢掉、让用户重跑五分钟，代价不成比例。
 * 真正不能存的是空提示词——那种在库里就是个空壳。
 */
export function saveStyleDoc(input: StyleDoc): SaveStyleDocResult {
  const doc = StyleDoc.parse(input);
  const issues: { pageType: string; message: string }[] = [];
  for (const [pageType, p] of Object.entries(doc.pagePrompts)) {
    for (const issue of lintStylePrompt(p.prompt)) {
      issues.push({ pageType, message: issue.message });
    }
  }

  const hasAnyPrompt = Object.values(doc.pagePrompts).some((p) => p.prompt.trim().length > 0);
  if (!hasAnyPrompt) return { styleId: styleRef(doc), issues, ok: false };

  const id = styleRef(doc);
  const existing = get<StyleDocRow>('SELECT * FROM style_docs WHERE styleId = ?', id);
  const payload = {
    version: doc.version,
    name: doc.name,
    doc: JSON.stringify({ ...doc, meta: { ...doc.meta, updatedAt: Date.now() } }),
    builtin: doc.meta.builtin ? 1 : 0,
    reviewed: doc.meta.reviewed ? 1 : 0,
    updatedAt: Date.now(),
  };
  if (existing) {
    updateRow('style_docs', 'styleId', id, payload);
  } else {
    insertRow('style_docs', { styleId: id, customized: 0, createdAt: Date.now(), ...payload });
  }
  /**
   * 存下来了就把「删过」那一笔撤掉。
   *
   * 不撤的话，被删过的风格永远回不来——用户删了、后悔了、重新导入一次，
   * 资产同步仍会因为它在那张表里而跳过它。**任何一次显式保存都表示「我要这套」**。
   *
   * `seedStyleDocs` 也会走这里，但它在调用之前就把删过的跳掉了，所以不会自己撤自己。
   */
  run('DELETE FROM deleted_style_docs WHERE styleId = ?', id);
  return { styleId: id, issues, ok: true };
}

export interface StyleDocListQuery {
  q?: string;
  theme?: 'light' | 'dark';
  limit?: number;
  offset?: number;
}

export function listStyleDocs(q: StyleDocListQuery = {}): { items: StyleDocSummary[]; total: number } {
  const where: string[] = [];
  const params: unknown[] = [];
  if (q.q) {
    where.push('(name LIKE ? OR styleId LIKE ?)');
    params.push(`%${q.q}%`, `%${q.q}%`);
  }
  const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const limit = Math.min(Math.max(q.limit ?? 100, 1), 300);
  const offset = Math.max(q.offset ?? 0, 0);
  const total = count(`SELECT COUNT(*) AS n FROM style_docs ${clause}`, ...params);
  const rows = all<StyleDocRow>(
    `SELECT * FROM style_docs ${clause} ORDER BY updatedAt DESC LIMIT ? OFFSET ?`,
    ...params, limit, offset,
  );
  const items = rows.map(toSummary).filter((s): s is StyleDocSummary => s !== null);
  return { items, total };
}

export function resolveStyleDoc(ref: string): StyleDoc {
  const direct = get<StyleDocRow>('SELECT * FROM style_docs WHERE styleId = ?', ref);
  if (direct) return toDoc(direct);
  const rows = all<StyleDocRow>(
    'SELECT * FROM style_docs WHERE styleId LIKE ? ORDER BY updatedAt DESC', `${ref}@%`,
  );
  if (rows.length === 0) throw notFound(`风格不存在：${ref}`);
  return toDoc(rows[0]!);
}

export function styleDocExists(styleId: string): boolean {
  return Boolean(get<StyleDocRow>('SELECT styleId FROM style_docs WHERE styleId = ?', styleId));
}

/**
 * 删掉一套风格。
 *
 * **删完要记一笔**（`deleted_style_docs`）：随资产分发的那几套（`BUILTIN_STYLE_DOCS`）
 * 会被 `seedStyleDocs()` 在每次 API 启动时补回来，不记的话用户看到的是「删了又回来」。
 * 见迁移 `015_deleted_style_docs.sql`。
 *
 * 已经有项目在用这套风格时**不删**，让调用方如实转告用户——删掉之后那些项目
 * 再生成页面就没有提示词可用了。
 */
export function deleteStyleDoc(styleId: string): { deleted: boolean; reason: string } {
  const row = get<StyleDocRow>('SELECT * FROM style_docs WHERE styleId = ?', styleId);
  if (!row) throw notFound(`风格不存在：${styleId}`);
  const used = count('SELECT COUNT(*) AS n FROM projects WHERE styleId = ?', styleId);
  if (used > 0) {
    return { deleted: false, reason: `还有 ${used} 个项目在用这套风格，先给它们换一个再删` };
  }
  run('DELETE FROM style_docs WHERE styleId = ?', styleId);
  run(
    'INSERT OR IGNORE INTO deleted_style_docs (styleId, deletedAt) VALUES (?, ?)',
    styleId, Date.now(),
  );
  return { deleted: true, reason: '' };
}

/** 这套风格是不是被用户删过、不该再被资产同步补回来 */
export function isStyleDocDeleted(styleId: string): boolean {
  return Boolean(get<{ styleId: string }>('SELECT styleId FROM deleted_style_docs WHERE styleId = ?', styleId));
}

/** 库里还有没有可用的风格。生成新项目时要用，库空着必须显式报错而不是静默兜底 */
export function hasAnyStyleDoc(): boolean {
  return count('SELECT COUNT(*) AS n FROM style_docs') > 0;
}

/**
 * 两份风格在**实质内容**上是不是一样。
 *
 * 刻意不比 `meta`：`saveStyleDoc` 每次都会把 `meta.updatedAt` 刷成当前时间，
 * 所以库里那份的时间戳永远比文件里的新，带上它比就永远「不一样」——
 * 于是每次同步都重写一遍，风格列表的顺序跟着乱跳。
 */
function sameStyleContent(a: StyleDoc, b: StyleDoc): boolean {
  if (a.name !== b.name || a.description !== b.description) return false;
  // 四个字体角色都要比：只比 fontFamily 的话，改展示字体或手写体不会让样机失效
  if (a.theme !== b.theme) return false;
  if (a.fontFamily !== b.fontFamily) return false;
  if (a.fontDisplay !== b.fontDisplay || a.fontScript !== b.fontScript) return false;
  if (a.fontNumeric !== b.fontNumeric) return false;
  if (JSON.stringify(a.palette) !== JSON.stringify(b.palette)) return false;

  const types = new Set([...Object.keys(a.pagePrompts), ...Object.keys(b.pagePrompts)]);
  for (const t of types) {
    const x = a.pagePrompts[t as keyof typeof a.pagePrompts];
    const y = b.pagePrompts[t as keyof typeof b.pagePrompts];
    if (!x || !y) return false;
    if (x.prompt !== y.prompt || x.mockHtml !== y.mockHtml) return false;
  }
  return true;
}

/**
 * 把随仓库分发的风格资产写进库里。
 *
 * 新环境（另一台机器、刚克隆的仓库、部署上去的服务器）起来时库里是空的，
 * 这一趟让它们直接拥有全部平台风格，不必重新识别一遍——识别一套要跑五分钟、
 * 每页都要真调模型。
 *
 * **默认只补缺失**（`overwrite: false`）：库里已经有的一律不动。API 启动走的是
 * 这个模式——一个正在用的库不该因为重启就被文件里的基线改写。
 *
 * **`overwrite: true` 是以文件为准**（`pnpm style:import`），用来把远端改过的
 * 风格同步下来。库里同 id 且内容不同的会被文件里的整份替换，**本地在界面上做过的
 * 改动会丢**——所以它是个显式动作，不在启动路径上。
 */
export function seedStyleDocs(opts: { overwrite?: boolean } = {}): {
  inserted: string[];
  updated: string[];
  skipped: number;
  /** 用户删过、这次故意没补回来的那几套 */
  deletedSkipped: string[];
} {
  const inserted: string[] = [];
  const updated: string[] = [];
  const deletedSkipped: string[] = [];
  let skipped = 0;

  for (const doc of BUILTIN_STYLE_DOCS) {
    const ref = styleRef(doc);
    /**
     * 用户删过的跳过。**这一条必须排在 `styleDocExists` 前面**：删过的风格当然
     * 不在库里，不先拦下来就会被当成「新环境缺这套」补回去——那正是
     * 「删了又回来」的成因。见迁移 `015_deleted_style_docs.sql`。
     *
     * `overwrite` 模式（`pnpm style:import`）也跳：用户删过就表示这套不要了，
     * 显式同步远端资产时同样该尊重这个决定。
     */
    if (isStyleDocDeleted(ref)) {
      deletedSkipped.push(ref);
      continue;
    }
    if (!styleDocExists(ref)) {
      if (saveStyleDoc(doc).ok) inserted.push(ref);
      continue;
    }

    if (!opts.overwrite || sameStyleContent(resolveStyleDoc(ref), doc)) {
      skipped += 1;
      continue;
    }

    saveStyleDoc(doc);
    updated.push(ref);
  }

  return { inserted, updated, skipped, deletedSkipped };
}

/**
 * 项目指向的风格，可能是新链路的文档，也可能还指着旧风格包。
 *
 * **这是个过渡期的桥**，旧链路（`style_packs`）删掉之后这一层就没有第二种情况了。
 * 现在必须有它，是因为项目表里同时存在两种 id：新链路生成过的项目存的是
 * `recognized-xxx@1.0`，旧项目存的是 `business-classic@1.0`。
 *
 * 为什么不直接抛错：`GET /projects/:id` 拿它来填「当前风格」那一块。
 * 抛错的话，**整个项目详情接口 500**，工作台直接打不开——用一个可能取不到的风格，
 * 换来「项目打不开」，代价完全不成比例。取不到就返回 null，界面按「没有风格」显示。
 */
export function resolveAnyStyle(ref: string | null | undefined): { kind: 'doc'; doc: StyleDoc } | { kind: 'pack'; pack: StylePack } | null {
  if (!ref) return null;
  try {
    return { kind: 'doc', doc: resolveStyleDoc(ref) };
  } catch {
    // 不是文档，再按旧风格包试
  }
  try {
    return { kind: 'pack', pack: resolveStyle(ref) };
  } catch {
    return null;
  }
}

/** 这个 ref 指向的东西存不存在。项目显式锁定风格前用它把关 */
export function styleRefExists(ref: string): boolean {
  return resolveAnyStyle(ref) !== null;
}

/**
 * 人工审核标记。
 *
 * **列与 JSON 里的 meta 都要改**：列给列表查询用，meta 给下游读整份文档用。
 * 只改一处的话，下次保存就会被冲掉——`saveStyleDoc` 是按 meta 重算列的，
 * 于是「审核通过」在用户下次编辑这套风格时静默变回「待审核」。
 *
 * 刻意不动 `updatedAt`：审核不是编辑内容，不该把这条记录顶到风格库最前面。
 */
export function reviewStyleDoc(styleId: string, reviewed: boolean): { styleId: string; reviewed: boolean } {
  const row = get<StyleDocRow>('SELECT * FROM style_docs WHERE styleId = ?', styleId);
  if (!row) throw notFound(`风格不存在：${styleId}`);
  const doc = toDoc(row);
  updateRow('style_docs', 'styleId', styleId, {
    reviewed: reviewed ? 1 : 0,
    doc: JSON.stringify({ ...doc, meta: { ...doc.meta, reviewed } }),
  });
  return { styleId, reviewed };
}

/**
 * 取这个项目该用的风格。
 *
 * 项目还没指定风格时，挑库里最近更新的那套并写回项目——**库空着就直接报错**，
 * 不兜底到任何内置风格：内置风格已经随旧链路一起删掉了，而「静默换一套风格生成」
 * 比明确失败糟糕得多，用户拿到一本调子完全不对的册子却不知道哪里错了。
 */
export function ensureStyleDoc(projectId: string, tenantId: string): StyleDoc {
  const project = get<{ styleId: string | null }>(
    'SELECT styleId FROM projects WHERE projectId = ? AND tenantId = ?', projectId, tenantId,
  );
  if (!project) throw notFound('项目不存在');

  if (project.styleId) {
    // 项目可能指向旧链路的风格包（style_packs），那种 id 在 style_docs 里找不到
    if (styleDocExists(project.styleId)) return resolveStyleDoc(project.styleId);
  }

  const first = listStyleDocs({ limit: 1 }).items[0];
  if (!first) {
    throw notFound('风格库是空的。先识别一套风格，再来生成');
  }
  updateRow('projects', 'projectId', projectId, { styleId: first.styleId, updatedAt: Date.now() });
  return resolveStyleDoc(first.styleId);
}

function toSummary(row: StyleDocRow): StyleDocSummary | null {
  let doc: StyleDoc;
  try {
    doc = toDoc(row);
  } catch {
    // 旧版本或手工改库写坏的条目，列表里跳过而不是让整页挂掉
    return null;
  }
  const mocked = Object.values(doc.pagePrompts).filter((p) => p.mockHtml.trim().length > 0);
  return {
    styleId: row.styleId,
    version: row.version,
    name: row.name,
    description: doc.description,
    theme: doc.theme,
    palette: doc.palette,
    fontFamily: doc.fontFamily,
    fontDisplay: doc.fontDisplay,
    fontScript: doc.fontScript,
    fontNumeric: doc.fontNumeric,
    spec: doc.spec,
    pageTypes: coveredPageTypes(doc),
    mockedCount: mocked.length,
    // 卡片上只看三张，多带没意义
    previewHtml: mocked.slice(0, 3).map((p) => p.mockHtml),
    builtin: row.builtin === 1,
    reviewed: row.reviewed === 1,
    customized: row.customized === 1,
    updatedAt: row.updatedAt,
  };
}
