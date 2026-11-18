import {
  builtinLayoutsOf, checkLayoutSkeleton, customLayoutId, imageSlotNumbers,
  isValidLayoutGroup, moduleOfLayoutId, setHiddenLayoutIds,
  type StudioLayout, type StudioModuleId,
} from '@lumen/ir-schema';
import { isMockHtmlAcceptable, lintMockHtml } from '@lumen/render-engine';
import { all, get, insertRow, run } from '../db/client.js';

/**
 * 功能库里用户自建的版式骨架。
 *
 * ## 铁律：它只进库，不进候选池
 *
 * 内置的骨架（`PEOPLE_LAYOUTS` / `IMAGE_LAYOUTS`）是**生成时的候选池**——出人物页、
 * 图片排版页时会按这一页的内容筛几个候选塞进提示词。用户新建的骨架按口径**不参与
 * 自动挑版式**，只在功能库里展示、由用户在工作台手动套到某一页上。
 *
 * 所以合并只允许发生在两个地方：**功能库页的展示层**与**这里的 `resolveLayoutForPrompt`**。
 * 绝不要把自建骨架 `push` 进那两个常量数组，也不要给 `peopleLayoutCandidates` /
 * `imageLayoutCandidates` 加读库的参数——那会让自建骨架悄悄进候选池（用户完全看不出来），
 * 同时把 `people-layouts.test.ts` 里钉死的数量断言弄挂。
 */

/**
 * 校验骨架时用的色板。
 *
 * 骨架只用 CSS 变量取色，所以取哪一套都一样——这里用骨架单测里的那一套，
 * 与 `people-skeletons.test.ts` 保持同口径：同一条骨架，在这里和在生成链路上
 * 得到同样的判定。
 */
const LINT_PALETTE = {
  bg: '#EFE6DA', surface: '#F7F1E8', text: '#3A322B', muted: '#8A7F73',
  accent: '#E08A3C', brand: '#C7421A', border: '#D8CDBF',
};

/**
 * 一份骨架能不能用。空数组表示能。
 *
 * 两道关：`checkLayoutSkeleton` 查结构（有没有 style 块、图位编号连不连续），
 * `lintMockHtml` 查配色与危险标签——**与生成页面时那道是同一道**。
 *
 * 两道都要在**存之前**跑，不能只跑在识别流里：识别流过了不代表存进去的那份没问题
 * （客户端可能改过骨架），而一份坏骨架进库之后，每次拿它换排版都会生成出一页
 * 被判不合规、重试、最后降级。
 */
export function validateSkeleton(moduleId: StudioModuleId, skeleton: string): string[] {
  const issues = checkLayoutSkeleton(moduleId, skeleton);
  const lint = lintMockHtml(skeleton, LINT_PALETTE);
  for (const i of lint) if (i.severity === 'error') issues.push(i.message);
  if (issues.length === 0 && !isMockHtmlAcceptable(lint)) issues.push('骨架没通过样机校验');
  return issues;
}

interface Row {
  layoutId: string;
  moduleId: string;
  name: string;
  brief: string;
  groupKey: string;
  slots: number | null;
  skeleton: string;
  sourceImage: string;
  createdAt: number;
}

function toLayout(row: Row): StudioLayout {
  return {
    id: row.layoutId,
    name: row.name,
    brief: row.brief,
    group: row.groupKey,
    ...(row.slots === null ? {} : { slots: row.slots }),
    skeleton: row.skeleton,
    source: 'user',
  };
}

/** 自建骨架列表。`moduleId` 不传就是全部 */
export function listStudioLayouts(moduleId?: StudioModuleId): StudioLayout[] {
  const rows = moduleId
    ? all<Row>('SELECT * FROM studio_layouts WHERE moduleId = ? ORDER BY createdAt ASC', moduleId)
    : all<Row>('SELECT * FROM studio_layouts ORDER BY createdAt ASC');
  return rows.map(toLayout);
}

export function getStudioLayout(layoutId: string): StudioLayout | null {
  const row = get<Row>('SELECT * FROM studio_layouts WHERE layoutId = ?', layoutId);
  return row ? toLayout(row) : null;
}

export interface SaveStudioLayoutInput {
  moduleId: StudioModuleId;
  name: string;
  brief: string;
  group: string;
  skeleton: string;
  /** 参考图 URL，留个出处 */
  sourceImage?: string;
}

export type SaveStudioLayoutResult =
  | { ok: true; layout: StudioLayout }
  | { ok: false; issues: string[] };

/**
 * 存一份自建骨架。
 *
 * **入库前重新校验**，不信任客户端回传的骨架——识别流已经验过一遍，但那是为了给模型
 * 反馈；这里这道是为了守住库。
 */
export function saveStudioLayout(input: SaveStudioLayoutInput): SaveStudioLayoutResult {
  const issues: string[] = [];
  if (input.name.trim().length === 0) issues.push('还没有名字');
  // 与内置骨架同一个门槛：太短的说明模型挑不出来，这里虽然不喂模型，但界面上也读不出信息
  if (input.brief.trim().length < 8) issues.push('「适合什么内容」至少要写八个字');
  if (!isValidLayoutGroup(input.moduleId, input.group)) issues.push(`分组「${input.group}」不属于这个版式库`);
  issues.push(...validateSkeleton(input.moduleId, input.skeleton));
  if (issues.length > 0) return { ok: false, issues };

  // 图位数由服务端数出来，不采信调用方自报——骨架是机器产出的，计数才是唯一真相
  const slots = input.moduleId === 'image-layouts' ? imageSlotNumbers(input.skeleton).length : null;
  const layoutId = customLayoutId(input.moduleId);
  insertRow('studio_layouts', {
    layoutId,
    moduleId: input.moduleId,
    name: input.name.trim(),
    brief: input.brief.trim(),
    groupKey: input.group,
    slots,
    skeleton: input.skeleton,
    sourceImage: input.sourceImage ?? '',
    createdAt: Date.now(),
  });
  const saved = getStudioLayout(layoutId);
  return saved ? { ok: true, layout: saved } : { ok: false, issues: ['写入后读不回来'] };
}

/**
 * 删一份自建骨架。
 *
 * **内置骨架天然删不掉**：它们不在库里，`DELETE` 影响零行，于是走「没找到」这条。
 * 不需要单独判一次「这是不是内置的」。
 */
export function deleteStudioLayout(layoutId: string): { deleted: boolean; reason: string } {
  if (!get<Row>('SELECT layoutId FROM studio_layouts WHERE layoutId = ?', layoutId)) {
    return { deleted: false, reason: '没有这份骨架（内置的版式删不掉）' };
  }
  run('DELETE FROM studio_layouts WHERE layoutId = ?', layoutId);
  return { deleted: true, reason: '' };
}

/**
 * 按 id 取一份可用于「强制版式」的骨架：先找内置，再找自建。
 *
 * **这是允许把两边合起来看的两个地方之一**（另一个是功能库的展示层）。
 * 内置优先：两边的 id 命名空间不重叠（自建都带 `custom-`），先后其实无所谓，
 * 但先内置能让「拿内置 id 来查」这条最常见的路少一次库查询。
 *
 * **下架的不影响这里**：下架只是不进自动候选池，用户手动套上去照样要能渲染——
 * 已经生成过的页面更是全靠它。
 */
export function resolveLayoutForPrompt(layoutId: string): StudioLayout | null {
  const moduleId = moduleOfLayoutId(layoutId);
  if (!moduleId) return null;
  const builtin = builtinLayoutsOf(moduleId).find((l) => l.id === layoutId);
  return builtin ?? getStudioLayout(layoutId);
}

/* ---------------- 内置版式的下架 ---------------- */

/**
 * 把库里的下架名单灌进 ir-schema。
 *
 * 候选函数（`peopleLayoutCandidates` / `imageLayoutCandidates`）在生成链路上被调用，
 * 那里没有库句柄，所以名单走模块级变量（`hidden-layouts.ts`）。
 * **每次下架/恢复之后、以及每次生成之前各调一次**——这张表只有几十行，
 * 比在内存里维护一份可能过期的缓存省事得多。
 */
export function syncHiddenLayouts(): void {
  setHiddenLayoutIds(hiddenLayoutIds());
}

/** 当前下架的内置版式 id。功能库列「已下架」那一节要用 */
export function hiddenLayoutIds(): string[] {
  return all<{ layoutId: string }>(
    'SELECT layoutId FROM hidden_builtin_layouts ORDER BY hiddenAt ASC',
  ).map((r) => r.layoutId);
}

export type HideResult = { ok: true } | { ok: false; reason: string };

/**
 * 下架一份**内置**版式。
 *
 * 只认内置的：自建的本来就能直接删（`deleteStudioLayout`），给它们再开一条「下架」
 * 只会多一个语义重叠的状态。传自建 id 进来会走「没找到」这条。
 *
 * **不拦「把一组下架光」**：那是个合法的用法（用户就是不喜欢这一组），
 * 候选函数在组内空了时会退回全组，不会让那一页的提示词被抽掉。
 */
export function hideBuiltinLayout(layoutId: string): HideResult {
  const moduleId = moduleOfLayoutId(layoutId);
  if (!moduleId) return { ok: false, reason: `认不出「${layoutId}」属于哪个版式库` };
  if (!builtinLayoutsOf(moduleId).some((l) => l.id === layoutId)) {
    return { ok: false, reason: '这是自建的版式，直接删就行，不用下架' };
  }
  // `OR IGNORE` 让重复下架变成幂等操作：连点两次不该报主键冲突
  run(
    'INSERT OR IGNORE INTO hidden_builtin_layouts (layoutId, hiddenAt) VALUES (?, ?)',
    layoutId, Date.now(),
  );
  syncHiddenLayouts();
  return { ok: true };
}

/** 恢复一份下架的内置版式。幂等：没下架过也回成功 */
export function unhideBuiltinLayout(layoutId: string): HideResult {
  run('DELETE FROM hidden_builtin_layouts WHERE layoutId = ?', layoutId);
  syncHiddenLayouts();
  return { ok: true };
}
