import { createHash } from 'node:crypto';
import { all, count, get, insertRow, parseJson, run, tx, updateRow } from '../db/client.js';
import { newId } from '../lib/crypto.js';
import { logger } from '../lib/logger.js';
import { conflict, forbidden, notFound } from '../lib/errors.js';
import { assertQuota } from '../lib/quota.js';
import {
  DEFAULT_VARIANT_BY_TYPE,
  fitPage,
  lintPage,
} from '@lumen/render-engine';
import {
  PageIR, type AudienceTag, type OutlinePage, type PageIR as Page, type ProjectStatus, type SceneTag, type StylePack,
} from '@lumen/ir-schema';
import { buildPageIR, reindexOutline } from '@lumen/content-engine';

export interface ProjectRow {
  projectId: string;
  tenantId: string;
  ownerId: string;
  title: string;
  brief: string;
  audienceTag: string;
  scene: string;
  styleId: string | null;
  status: string;
  totalPages: number;
  readyPages: number;
  failedPages: number;
  thumbnailKey: string;
  avatarEnabled: number;
  /** 大纲的思考层级，见 `DEPTH_BRIEF` */
  depth: string;
  /** 目标页数。NULL = 由内容决定 */
  targetPages: number | null;
  /** 上传的 logo 原图的对象 key。空串表示没传 */
  brandLogoImage: string;
  /** 重绘稿的 SVG 源码。空串表示没重绘过 */
  brandLogoSvg: string;
  /** '' 没有 logo / 'redraw' 用重绘稿 / 'original' 用原图 */
  brandLogoMode: string;
  /** 品牌名。空串表示没填 */
  brandName: string;
  /** 标语。空串表示没填 */
  brandTagline: string;
  /** 讲解音色。**NULL = 沿用后台的全局设置**（迁移之前的老项目都是 NULL） */
  narrationVoice: string | null;
  /** 讲解语气。NULL = 沿用全局；**空串是合法值**，表示「不加语气提示」 */
  narrationTone: string | null;
  /** 生成页面时顺带出讲稿。0/1 */
  narrationScriptEnabled: number;
  /**
   * 图表视觉风格（`@lumen/charts` 的 `CHART_STYLE_IDS`）。
   *
   * **不给默认值兜底**：迁移里已经写了 `DEFAULT 'dashboard'`，列本身非空，
   * 这里再兜一层只会掩盖「迁移没跑」这件事。
   */
  chartStyle: string;
  createdAt: number;
  updatedAt: number;
}

export interface PageRow {
  pageId: string;
  projectId: string;
  tenantId: string;
  pageIndex: number;
  pageType: string;
  layoutVariant: string;
  ir: string;
  status: string;
  pageVersionId: string;
  version: number;
  updatedAt: number;
  /** 来自哪条大纲。拆页会让一页大纲产出多页，这个映射用来把页插回正确位置 */
  outlineIndex: number | null;
}

/** 页面内容版本标识，作为生成任务的幂等键 */
export function pageVersionId(page: Page): string {
  // html 也要进哈希：新链路里页面内容就是那段 HTML，它变了版本就该变，
  // 否则图片、讲稿这些下游任务的幂等键不变，重新生成不会重新派发
  const h = createHash('sha256')
    .update(JSON.stringify({ t: page.title, b: page.blocks, v: page.layoutVariant, h: page.html }))
    .digest('hex')
    .slice(0, 16);
  return `pv_${h}`;
}

/* ---------------- 项目 ---------------- */

export interface CreateProjectInput {
  tenantId: string;
  ownerId: string;
  title: string;
  brief?: string;
  audienceTag?: AudienceTag;
  scene?: SceneTag;
  /**
   * 目标页数。`null` = 由内容决定，与建完之后在工作台里留空是同一件事。
   *
   * 新建时就收下它，是因为页数**在建项目那一刻就已经知道了**（用户心里有数），
   * 而等到工作台里再设一次，中间那次「生成整本教案」就会按旧的默认值出提纲。
   */
  targetPages?: number | null;
}

export function createProject(input: CreateProjectInput): ProjectRow {
  assertQuota(input.ownerId, 'project');
  const now = Date.now();
  const projectId = newId('prj');
  insertRow('projects', {
    projectId,
    tenantId: input.tenantId,
    ownerId: input.ownerId,
    title: input.title.trim() || '未命名项目',
    brief: input.brief ?? '',
    audienceTag: input.audienceTag ?? 'general',
    scene: input.scene ?? 'general',
    targetPages: input.targetPages ?? null,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  });
  return requireProject(projectId, input.tenantId);
}

export function requireProject(projectId: string, tenantId: string): ProjectRow {
  const row = get<ProjectRow>('SELECT * FROM projects WHERE projectId = ?', projectId);
  if (!row) throw notFound('项目不存在');
  if (row.tenantId !== tenantId) throw forbidden('无权访问该项目');
  return row;
}

export interface ProjectListQuery {
  q?: string;
  status?: ProjectStatus;
  limit?: number;
  offset?: number;
}

/** 列表强制按租户 + 属主过滤（PRD §2 隔离要求） */
export function listProjects(tenantId: string, ownerId: string, q: ProjectListQuery = {}) {
  const where = ['tenantId = ?', 'ownerId = ?'];
  const params: unknown[] = [tenantId, ownerId];
  if (q.q) {
    where.push('title LIKE ?');
    params.push(`%${q.q}%`);
  }
  if (q.status) {
    where.push('status = ?');
    params.push(q.status);
  }
  const clause = where.join(' AND ');
  const limit = Math.min(Math.max(q.limit ?? 50, 1), 200);
  const offset = Math.max(q.offset ?? 0, 0);
  const total = count(`SELECT COUNT(*) AS n FROM projects WHERE ${clause}`, ...params);
  const rows = all<ProjectRow>(
    `SELECT * FROM projects WHERE ${clause} ORDER BY updatedAt DESC LIMIT ? OFFSET ?`,
    ...params, limit, offset,
  );
  return { items: rows.map(withProgress), total };
}

/** 状态徽章文案（PRD §5.6：草稿 / 生成中 x/y / 已完成 / 失败） */
/**
 * 这一本要出多少页——取大纲页数，不是 `pages` 表里已落的行数。
 *
 * 两者会不一致：跑到一半断了、或者页面被并发写坏，库里就只有前几页。
 * 用库里的行数当分母会得到「生成中 7/7」这种自相矛盾的文案——看着像跑完了，
 * 却还写着生成中，用户只能反复刷新。大纲才是真正要出的页数。
 */
export function outlineLengthOf(projectId: string): number {
  const deckRow = get<{ meta: string }>('SELECT meta FROM decks WHERE projectId = ?', projectId);
  return parseJson<{ outline?: unknown[] }>(deckRow?.meta, {}).outline?.length ?? 0;
}

export function withProgress(row: ProjectRow) {
  let progressText = '草稿';
  if (row.status === 'generating') {
    // 大纲还没生成时退回库里的行数，否则会显示「生成中 0/0」
    const total = outlineLengthOf(row.projectId) || row.totalPages;
    progressText = `生成中 ${row.readyPages}/${total}`;
  } else if (row.status === 'completed') progressText = '已完成';
  else if (row.status === 'failed') progressText = `失败 ${row.failedPages} 页`;
  return {
    ...row,
    avatarEnabled: row.avatarEnabled === 1,
    narrationScriptEnabled: row.narrationScriptEnabled === 1,
    progressText,
  };
}

export function updateProject(
  projectId: string,
  tenantId: string,
  patch: Partial<Pick<ProjectRow,
    'title' | 'brief' | 'audienceTag' | 'scene' | 'styleId' | 'status'
    | 'thumbnailKey' | 'avatarEnabled' | 'depth' | 'targetPages'
    | 'brandLogoImage' | 'brandLogoSvg' | 'brandLogoMode' | 'brandName' | 'brandTagline'
    | 'narrationVoice' | 'narrationTone' | 'narrationScriptEnabled'
    | 'chartStyle'>>,
): ProjectRow {
  requireProject(projectId, tenantId);
  updateRow('projects', 'projectId', projectId, { ...patch, updatedAt: Date.now() });
  return requireProject(projectId, tenantId);
}

export function deleteProject(projectId: string, tenantId: string): void {
  requireProject(projectId, tenantId);
  tx(() => {
    run('DELETE FROM pages WHERE projectId = ?', projectId);
    run('DELETE FROM decks WHERE projectId = ?', projectId);
    run('DELETE FROM export_jobs WHERE projectId = ?', projectId);
    run('DELETE FROM shares WHERE projectId = ?', projectId);
    run('DELETE FROM tasks WHERE projectId = ?', projectId);
    // 死信同样要清：留着会让任务监控的「死信」指标被已删项目的残留撑高，失去信号价值
    run('DELETE FROM task_dlq WHERE projectId = ?', projectId);
    run('DELETE FROM projects WHERE projectId = ?', projectId);
  });
}

/**
 * 由 pages 表回算项目的页数统计与状态。
 *
 * ## 为什么「完成」要拿大纲来判
 *
 * 原先只数 `pages`：`ready === total` 就是 `completed`。这对「生成每次都跑完」
 * 的假设成立，但生成可以半路断掉——进程重启、流被掐、用户离开。断了之后
 * `pages` 里只有前几页且全是 `ready`，于是**一本只生成了两页的书被标成「已完成」**，
 * 而 `runHtmlGeneration` 的早退分支用的正是同一个判据，再点生成会被拦住、
 * 报一句「已生成 N 页」然后什么都不做——那本书就永远补不齐了。
 *
 * 现在把大纲页数一并读进来：**内容齐了，且落库页数与大纲页数相等**才算 `completed`。
 * 少页的一律留在 `generating`，用户看得见「生成中 2/9」，也点得动补齐。
 *
 * `decks` 与 `pages` 都是普通表，不在同一事务里也读得到一致快照（本函数不在 tx 内调用）。
 */
export function refreshProjectCounts(projectId: string): void {
  /**
   * 大纲页数。没有 decks 行的项目（还没生成过大纲）按 0 处理，那时也谈不上「完成」。
   *
   * **统计口径必须跟工作台一致：只数落在大纲格里的行。**
   *
   * 工作台是按大纲摆格子的（`pageSlots`：格子数 = 大纲条数，`pageIndex` 超出去的行直接丢），
   * 而这里原先数的是**表里的全部行**。两个口径一旦分叉，项目卡上写「19 页」、
   * 点进去工作台写「共 10 页」，用户看到的就是「我保存的页面不见了」。
   * 历史遗留的拆页续页（`<id>-r1`）与大纲缩小时留下的超纲行正是来源。
   *
   * `pageIndex >= 0` 那一半是给维护脚本兜底的：归位过程中会把行临时挪到负数区间。
   */
  const outlinePages = outlineLengthOf(projectId);
  const scoped = outlinePages > 0;
  const row = get<{ total: number; ready: number; failed: number }>(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END), 0) AS ready,
            COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) AS failed
     FROM pages WHERE projectId = ? AND pageIndex >= 0${scoped ? ' AND pageIndex < ?' : ''}`,
    ...(scoped ? [projectId, outlinePages] : [projectId]),
  );
  const total = row?.total ?? 0;
  const ready = row?.ready ?? 0;
  const failed = row?.failed ?? 0;

  const project = get<{ status: string }>('SELECT status FROM projects WHERE projectId = ?', projectId);
  let status = project?.status ?? 'draft';
  if (total > 0) {
    /**
     * **`generating` 只有一个含义：还有活没干完。**
     *
     * 原先的判据是「不是全 ready 就是 generating」，于是**一页失败就把整本钉死在
     * `generating` 上**——11 页好了、1 页坏了，项目列表里那条进度条永远走不完，
     * 用户看着就是「卡在生成中」。实测报过：第十页失败之后整本都不动了。
     *
     * 现在分开算：只要还有页没落库（大纲没落全，或有页停在 pending/generating），
     * 才是 `generating`；**都落库了就是终态**——成没成如实记在
     * `readyPages` / `failedPages` 上，失败的页由用户单独重生成。
     *
     * 终态分两种，判据是**有没有失败页**，不是「有没有成功页」：
     * 20 页好、1 页坏的那本标成「已完成」是在骗人——列表上那个绿徽章会让用户以为
     * 没事了，坏的那一页就一直没人管。标 `failed` 时徽章写的是「失败 1 页」，
     * 正好说清还有几页要修。
     */
    const coversOutline = outlinePages === 0 || total >= outlinePages;
    const unfinished = total - ready - failed;
    if (!coversOutline || unfinished > 0) status = 'generating';
    else if (failed > 0) status = 'failed';
    else status = 'completed';
  }
  updateRow('projects', 'projectId', projectId, {
    totalPages: total, readyPages: ready, failedPages: failed, status, updatedAt: Date.now(),
  });
}

/* ---------------- 页面 ---------------- */

export function listPages(projectId: string): PageRow[] {
  return all<PageRow>('SELECT * FROM pages WHERE projectId = ? ORDER BY pageIndex ASC', projectId);
}

export function getPage(pageId: string, tenantId: string): PageRow {
  const row = get<PageRow>('SELECT * FROM pages WHERE pageId = ?', pageId);
  if (!row) throw notFound('页面不存在');
  if (row.tenantId !== tenantId) throw forbidden('无权访问该页面');
  return row;
}

export function pageIR(row: PageRow): Page {
  return PageIR.parse(parseJson<unknown>(row.ir, {}));
}

/**
 * 保存一个**已经存在**的页面。
 *
 * 页不存在时返回 null，**不新建**。这个函数的调用方全是「读出来、改一处、写回去」，
 * 没有一个是要造新页的（造页走 savePageGroup / insertPage）。
 *
 * 为什么这一条要写死：worker 的写回是慢操作——生成一张图要几十秒——期间用户可能
 * 整份重新生成过，那时旧页连同它的任务都已被删掉。如果这里顺手把它插回去，
 * 结果就是重新生成后页数对不上，末尾多出一页上一轮的残留内容。
 * 实测踩过：13 页的 deck 重新生成出 12 页，第 13 页标题还是上一轮的。
 */
export function savePage(
  projectId: string,
  tenantId: string,
  page: Page,
  pageIndex: number,
): PageRow | null {
  const parsed = PageIR.parse(page);
  const now = Date.now();
  const existing = get<PageRow>('SELECT * FROM pages WHERE pageId = ?', parsed.pageId);
  if (!existing) {
    logger.warn('页面已不存在，跳过写回（多半是期间整份重新生成过）', {
      pageId: parsed.pageId, projectId, pageIndex,
    });
    return null;
  }
  if (existing.tenantId !== tenantId) throw forbidden('无权修改该页面');
  /**
   * **目标格被别人的页占着时，退回原位，而不是抛唯一索引错。**
   *
   * 这个端点是「存这一页的内容」，不是「挪这一页的位置」——挪位置走
   * `PUT /projects/:id/pages/order`。但工作台保存时会把自己的格子号一起发上来
   * （`RightRail` 发的 `pageIndex: activeIndex`），而工作台的格子号是按**大纲**
   * 摆的、库里的 `pageIndex` 是按**行**摆的，两者一旦错开，这一写就会撞上
   * `pages(projectId, pageIndex)` 的唯一索引，接口 500、界面上弹「保存失败」，
   * 用户改的东西只要一刷新就没了——报的就是这个。
   *
   * 内容比位置重要：位置冲突时保住内容，位置不动，并记一条 warn 便于回溯。
   */
  let target = pageIndex;
  const occupant = get<{ pageId: string }>(
    'SELECT pageId FROM pages WHERE projectId = ? AND pageIndex = ?', projectId, pageIndex,
  );
  if (occupant && occupant.pageId !== parsed.pageId) {
    logger.warn('保存页面时目标位置已被占用，保持原位置写入', {
      pageId: parsed.pageId, wanted: pageIndex, kept: existing.pageIndex, occupant: occupant.pageId,
    });
    target = existing.pageIndex;
  }
  updateRow('pages', 'pageId', parsed.pageId, {
    pageIndex: target,
    pageType: parsed.pageType,
    layoutVariant: parsed.layoutVariant,
    ir: JSON.stringify(parsed),
    status: parsed.status,
    pageVersionId: pageVersionId(parsed),
    version: existing.version + 1,
    updatedAt: now,
  });
  return get<PageRow>('SELECT * FROM pages WHERE pageId = ?', parsed.pageId) ?? null;
}

export function deletePage(pageId: string, tenantId: string): void {
  getPage(pageId, tenantId);
  run('DELETE FROM pages WHERE pageId = ?', pageId);
}

/**
 * 写入「一个逻辑页适配出来的 1..n 张页面」。
 *
 * 拆页会产出一张主页加若干续页（续页 pageId 由 render-engine 按 `{主页id}-r{i}` 派生，
 * 因此重复写入是更新而不是新增）。它们必须落在**连续的序号**上——都写同一个 pageIndex
 * 会撞 (projectId, pageIndex) 唯一索引，表现为「页面生成失败但库里其实已经写进去一半」。
 *
 * 序号采用「整体重排」而不是「边插边挪」：先读出项目里其余页面的既有顺序，
 * 按 `[at 之前的页] + [本页组] + [其余页]` 拼成目标顺序，再统一写回 0..n-1。
 * 这样中途不会出现两行抢同一个序号的瞬间，也不会留下空洞。
 */
export function savePageGroup(
  projectId: string,
  tenantId: string,
  pages: Page[],
  at: number,
  outlineIndex?: number,
): PageRow[] {
  const parsed = pages.map((p) => PageIR.parse(p));
  if (parsed.length === 0) return [];
  const now = Date.now();
  const incoming = new Set(parsed.map((p) => p.pageId));

  tx(() => {
    const rows = all<{ pageId: string; pageIndex: number }>(
      'SELECT pageId, pageIndex FROM pages WHERE projectId = ? ORDER BY pageIndex',
      projectId,
    );
    const head = rows.filter((r) => !incoming.has(r.pageId) && r.pageIndex < at).map((r) => r.pageId);
    const tail = rows.filter((r) => !incoming.has(r.pageId) && r.pageIndex >= at).map((r) => r.pageId);

    // 页组的起点：目标是 at，但不能压到 at 之前已有的页上（单页生成时 at 可能大于现有页数）
    const groupStart = Math.max(at, head.length);
    const restStart = groupStart + parsed.length;

    // 先把所有行挪到负数区间，避免写回时与尚未移动的邻居撞唯一索引
    const order = [...head, ...parsed.map((p) => p.pageId), ...tail];
    order.forEach((id, i) => updateRow('pages', 'pageId', id, { pageIndex: -1 - i }));

    parsed.forEach((p, i) => {
      const existing = get<PageRow>('SELECT * FROM pages WHERE pageId = ?', p.pageId);
      const fields = {
        pageIndex: groupStart + i,
        pageType: p.pageType,
        layoutVariant: p.layoutVariant,
        ir: JSON.stringify(p),
        status: p.status,
        pageVersionId: pageVersionId(p),
        updatedAt: now,
        // 同一组（含拆页产出的续页）共享同一条大纲
        ...(outlineIndex === undefined ? {} : { outlineIndex }),
      };
      if (existing) {
        if (existing.tenantId !== tenantId) throw forbidden('无权修改该页面');
        updateRow('pages', 'pageId', p.pageId, { ...fields, version: existing.version + 1 });
      } else {
        insertRow('pages', {
          pageId: p.pageId,
          projectId,
          tenantId,
          ...fields,
          version: 1,
        });
      }
    });

    // 其余页按原相对顺序落到页组之后
    head.forEach((id, i) => updateRow('pages', 'pageId', id, { pageIndex: i }));
    tail.forEach((id, i) => updateRow('pages', 'pageId', id, { pageIndex: restStart + i }));
  });

  return parsed.map((p) => get<PageRow>('SELECT * FROM pages WHERE pageId = ?', p.pageId)!);
}

/** 删除某个逻辑页派生出的全部续页（单页重生成前调用，避免上一次拆页的残留） */
export function deleteSplitContinuations(pageId: string): void {
  run('DELETE FROM pages WHERE pageId LIKE ?', `${pageId}-r%`);
}

/**
 * 在指定位置插入页面。
 * pages 上有 (projectId, pageIndex) 唯一索引，因此必须先把该位置及其后的页**从后往前**整体后移，
 * 否则中间某一步会与尚未移动的邻居撞索引。
 */
export function insertPageAt(
  projectId: string,
  tenantId: string,
  page: Page,
  at: number,
): PageRow {
  const parsed = PageIR.parse(page);
  const now = Date.now();
  tx(() => {
    const rows = all<{ pageId: string; pageIndex: number }>(
      'SELECT pageId, pageIndex FROM pages WHERE projectId = ? AND pageIndex >= ? ORDER BY pageIndex DESC',
      projectId, at,
    );
    for (const r of rows) {
      updateRow('pages', 'pageId', r.pageId, { pageIndex: r.pageIndex + 1, updatedAt: now });
    }
    insertRow('pages', {
      pageId: parsed.pageId,
      projectId,
      tenantId,
      pageIndex: at,
      pageType: parsed.pageType,
      layoutVariant: parsed.layoutVariant,
      ir: JSON.stringify(parsed),
      status: parsed.status,
      pageVersionId: pageVersionId(parsed),
      version: 1,
      updatedAt: now,
    });
  });
  return get<PageRow>('SELECT * FROM pages WHERE pageId = ?', parsed.pageId)!;
}

/** 重排页面顺序（大纲拖拽后调用） */
export function reorderPages(projectId: string, tenantId: string, orderedPageIds: string[]): void {
  requireProject(projectId, tenantId);
  tx(() => {
    // 先整体挪到不冲突的负数区间，再按目标顺序写回，避免唯一索引中途冲突
    const rows = all<{ pageId: string }>('SELECT pageId FROM pages WHERE projectId = ?', projectId);
    rows.forEach((r, i) => updateRow('pages', 'pageId', r.pageId, { pageIndex: -1 - i }));
    orderedPageIds.forEach((pageId, i) => {
      updateRow('pages', 'pageId', pageId, { pageIndex: i, updatedAt: Date.now() });
    });
  });
  refreshProjectCounts(projectId);
}

/* ---------------- 由大纲落地页面 ---------------- */

export interface MaterializeOptions {
  pack: StylePack;
  outline: OutlinePage[];
  avatarEnabled: boolean;
  audienceTag: AudienceTag;
  /** 每页对应的原始内容 */
  sourceTexts?: string[];
}

export interface MaterializeResult {
  pages: Page[];
  issues: ReturnType<typeof lintPage>;
  adjusted: number;
}

/**
 * 大纲 → Page IR → 溢出适配 → 设计 Lint。
 * 这是「版式匹配（规则）」这一步的落点（PRD §5.15 总链路）。
 */
export function materializePages(opts: MaterializeOptions): MaterializeResult {
  const outline = reindexOutline(opts.outline);
  const pages: Page[] = [];
  const issues: ReturnType<typeof lintPage> = [];
  let adjusted = 0;

  outline.forEach((o, i) => {
    const built = buildPageIR({
      pageId: newId('pg'),
      outline: o,
      pack: opts.pack,
      pageIndex: i,
      totalPages: outline.length,
      sourceText: opts.sourceTexts?.[i] ?? o.notes,
      avatarEnabled: opts.avatarEnabled,
      audienceTag: opts.audienceTag,
    });
    // 溢出适配可能产出多页
    const fitted = fitPage(built, opts.pack);
    if (fitted.applied.length > 0 && fitted.applied[0] !== 'none') adjusted += 1;
    issues.push(...fitted.issues);
    for (const p of fitted.pages) {
      pages.push({ ...p, status: 'ready' });
      issues.push(...lintPage(p, opts.pack, { lenientTypography: true }));
    }
  });

  return { pages, issues, adjusted };
}

/** 新建单页（左栏「新增页」用） */
export function newBlankPage(
  pageType: Page['pageType'],
  pack: StylePack,
  pageIndex: number,
  totalPages: number,
): Page {
  const outline: OutlinePage = {
    index: pageIndex,
    pageType,
    claim: '新页面',
    title: '新页面',
    points: [],
    section: '',
    notes: '',
  };
  const built = buildPageIR({
    pageId: newId('pg'),
    outline,
    pack,
    pageIndex,
    totalPages,
  });
  return PageIR.parse({
    ...built,
    layoutVariant: DEFAULT_VARIANT_BY_TYPE[pageType] ?? built.layoutVariant,
    // 新页直接可用：内容由规则填充，用户可以立即编辑，也随时可以重新生成
    status: 'ready',
  });
}

/** 页面标题改名（大纲改标题后同步到 Page IR） */
export function renamePageTitle(page: Page, title: string): Page {
  return PageIR.parse({ ...page, title: { ...page.title, main: title } });
}

export function assertPageWritable(row: PageRow, tenantId: string): void {
  if (row.tenantId !== tenantId) throw forbidden('无权修改该页面');
}

export function ensureUniquePageIds(pages: Page[]): void {
  const seen = new Set<string>();
  for (const p of pages) {
    if (seen.has(p.pageId)) throw conflict(`页面 id 重复：${p.pageId}`);
    seen.add(p.pageId);
  }
}
