import { z } from 'zod';
import {
  CHART_KINDS,
  CHART_KIND_LABEL,
  type ChartSlotData,
} from './chart-kind.js';

/**
 * 图表槽：模型在页面 HTML 里留的那个占位。
 *
 * ## 长什么样
 *
 * ```html
 * <div class="ch-plot" style="…width:1180px;height:560px…" data-lumen-chart="1180x560">
 * { "kind": "bar", "categories": ["Q1","Q2"], "series": [{ "name": "营收", "values": [12,18] }] }
 * </div>
 * ```
 *
 * **JSON 写在元素内容里，不写在属性里。** 属性值里的 JSON 要跟引号打架
 * （`data-x='{"a":"b"}'` 只能用单引号包、内部再出现一个单引号整份就坏），
 * 而中文文案里出现单引号是很正常的事。写在元素内容里就是纯文本，`JSON.parse` 直接吃。
 *
 * **槽是空元素**——内容只有那段 JSON。所以「找开标签、再找第一个 `</div>`」就够，
 * 不需要做嵌套配对扫描（那套启发式 `html-doc.ts` 里另有一份，能不用就不用）。
 *
 * ## 属性值 = 渲染尺寸
 *
 * `data-lumen-chart="1180x560"` 一个属性两件事：**有它就是图表槽**，值是渲染尺寸。
 * 尺寸必须与容器一致——出图的 SVG 是 `width:100%;height:100%` 铺满那个 div 的，
 * 宽高比对不上就会把图拉变形。
 */
export const CHART_SLOT_ATTR = 'data-lumen-chart';

/** 槽位尺寸属性值的形状：`1180x560` */
export const CHART_SLOT_SIZE_RE = /^\s*(\d{1,4})\s*[x×]\s*(\d{1,4})\s*$/;

export function parseChartSlotSize(value: string): { width: number; height: number } | null {
  const m = CHART_SLOT_SIZE_RE.exec(value);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  return { width, height };
}

/* ---------------- 数据校验 ---------------- */

const HierarchyNodeSchema: z.ZodType<import('./chart-kind.js').HierarchyNode> = z.lazy(() =>
  z.object({
    name: z.string(),
    value: z.number().optional(),
    children: z.array(HierarchyNodeSchema).optional(),
  }));

const SeriesSchema = z.object({ name: z.string(), values: z.array(z.number()) });
const NamedValuesSchema = z.object({ name: z.string(), values: z.array(z.number()) });

export const ChartSlotDataSchema = z.object({
  kind: z.enum(CHART_KINDS),
  categories: z.array(z.string()).optional(),
  series: z.array(SeriesSchema).optional(),
  unit: z.string().optional(),
  title: z.string().optional(),
  hierarchy: HierarchyNodeSchema.optional(),
  links: z.array(z.object({
    source: z.string(),
    target: z.string(),
    value: z.number().optional(),
  })).optional(),
  matrix: z.object({
    rows: z.array(z.string()),
    cols: z.array(z.string()),
    values: z.array(z.array(z.number())),
  }).optional(),
  samples: z.array(NamedValuesSchema).optional(),
  ohlc: z.array(NamedValuesSchema).optional(),
  points: z.array(z.object({
    name: z.string().optional(),
    values: z.array(z.array(z.number())),
  })).optional(),
});

/** 直角坐标系 / 类目类：靠 `categories` + `series` 出图 */
const CARTESIAN: ChartSlotData['kind'][] = [
  'bar', 'barH', 'radar', 'barDiverging', 'area', 'line', 'pie', 'funnel',
];

function nonEmpty<T>(arr: T[] | undefined): arr is T[] {
  return Array.isArray(arr) && arr.length > 0;
}

/**
 * 这份数据能不能出图。空数组表示没问题。
 *
 * **逐种把关，不靠判别联合**：模型是一段一段往外写 JSON 的，判别联合它写不对也读不懂
 * 报错。这里只回答「这一种图要的东西齐不齐、长度对不对得上」，报错文案直接回给模型重写。
 *
 * 长度对齐是**最常错的一条**：`categories` 四个季度、`values` 三个数，ECharts 不报错，
 * 只是最后一个季度没有柱子——页面上看着像数据丢了，而谁都不会去查 JSON。
 */
export function chartSlotProblems(data: ChartSlotData): string[] {
  const out: string[] = [];
  const label = CHART_KIND_LABEL[data.kind];

  if (CARTESIAN.includes(data.kind)) {
    if (!nonEmpty(data.categories)) out.push(`${label}要有 categories（类目轴上的名字）`);
    if (!nonEmpty(data.series)) out.push(`${label}要有 series（至少一条序列，每条带 name 与 values）`);
    const n = data.categories?.length ?? 0;
    for (const s of data.series ?? []) {
      if (n > 0 && s.values.length !== n) {
        out.push(`series「${s.name}」有 ${s.values.length} 个数，categories 有 ${n} 个，两边要对齐`);
      }
    }
  }

  if (data.kind === 'scatter') {
    if (!nonEmpty(data.points)) {
      out.push('散点图要有 points（每条序列一组点，形如 {"name":"今年","values":[[12,35],[48,60]]}）');
    }
    for (const p of data.points ?? []) {
      const bad = p.values.findIndex((v) => v.length !== 2);
      if (bad >= 0) {
        out.push(`points「${p.name ?? ''}」第 ${bad + 1} 个点不是两个数，散点的每个点是 [x, y]`);
        break;
      }
    }
  }

  if (data.kind === 'boxplot' || data.kind === 'violin' || data.kind === 'histogram') {
    if (!nonEmpty(data.samples)) {
      out.push(`${label}要有 samples（每个类目一组原始观测值，形如 {"name":"A","values":[1,2,3]}）`);
    }
    for (const s of data.samples ?? []) {
      if (s.values.length < 2) out.push(`samples「${s.name}」至少要有两个观测值，一个数画不出分布`);
    }
  }

  if (data.kind === 'candlestick') {
    if (!nonEmpty(data.ohlc)) {
      out.push('股价图要有 ohlc（每根 K 线一个 {"name":"周一","values":[开,收,低,高]}）');
    }
    for (const s of data.ohlc ?? []) {
      if (s.values.length !== 4) out.push(`ohlc「${s.name}」要是四个数：[开, 收, 低, 高]`);
    }
  }

  if (data.kind === 'heatmap' || data.kind === 'chord') {
    const m = data.matrix;
    if (!m || !nonEmpty(m.rows) || !nonEmpty(m.cols)) {
      out.push(`${label}要有 matrix（{"rows":[…],"cols":[…],"values":[[…]]}）`);
    } else if (m.values.length !== m.rows.length) {
      out.push(`matrix.values 有 ${m.values.length} 行，rows 有 ${m.rows.length} 个，两边要对齐`);
    } else {
      for (const [i, row] of m.values.entries()) {
        if (row.length !== m.cols.length) {
          out.push(`matrix.values 第 ${i + 1} 行有 ${row.length} 个数，cols 有 ${m.cols.length} 个，两边要对齐`);
          break;
        }
      }
    }
  }

  if (data.kind === 'treemap' || data.kind === 'sunburst' || data.kind === 'decompTree') {
    if (!data.hierarchy || typeof data.hierarchy.name !== 'string') {
      out.push(`${label}要有 hierarchy（{"name":"总","children":[…] } 这样一层层往下）`);
    }
  }

  if (data.kind === 'sankey' || data.kind === 'flowchart') {
    if (!nonEmpty(data.links)) {
      out.push(`${label}要有 links（每条边 {"source":"A","target":"B"}，节点名自己取）`);
    }
  }

  return out;
}

/**
 * 把槽里的那段文本解析成数据。解析不了回 `{ problem }`，调用方据此出占位块。
 *
 * **只校验到「能不能出图」这一层**：形状对不对、长度齐不齐。不校验数值是否合理
 * （负数、极大值都不拦）——那是内容的事，不是格式的事。
 */
export function parseChartSlot(
  text: string,
): { ok: true; data: ChartSlotData } | { ok: false; problem: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, problem: '图表槽里的内容不是合法 JSON' };
  }
  const parsed = ChartSlotDataSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const where = first?.path.join('.') ?? '';
    return { ok: false, problem: `图表数据不合规：${where ? `${where} ` : ''}${first?.message ?? ''}` };
  }
  const problems = chartSlotProblems(parsed.data);
  if (problems.length > 0) return { ok: false, problem: problems[0]! };
  return { ok: true, data: parsed.data };
}

/**
 * 骨架里的图表槽：开标签 + JSON + 闭合标签。
 *
 * 非贪婪的 `([\s\S]*?)` 是安全的——槽里只有一段 JSON，不会有嵌套的 `</div>`。
 * 分组：1 = 开标签里除属性值外的部分，2 = 尺寸属性值，3 = JSON 正文。
 */
export const CHART_SLOT_RE = new RegExp(
  `<div\\b([^>]*\\b${CHART_SLOT_ATTR}\\s*=\\s*["']([^"']*)["'][^>]*)>([\\s\\S]*?)<\\/div\\s*>`,
  'gi',
);

/** 骨架里有几个图表槽 */
export function chartSlotCount(skeleton: string): number {
  return [...skeleton.matchAll(new RegExp(CHART_SLOT_RE.source, 'gi'))].length;
}

/**
 * 把一份图表数据画成 SVG 的函数。**由调用方注入**，不在这里实现。
 *
 * 真正的渲染在 `@lumen/charts`（ECharts 的 SSR），而它依赖本包——
 * 这里反向 import 会成环。所以 `buildPageDocument` 只收一个回调：
 * 谁渲染谁传进来，IR 这边不碰图表库。
 *
 * `size` 来自槽位属性 `data-lumen-chart="WxH"`，必须与那个容器的实际尺寸一致
 * ——出图的 SVG 是 `width:100%;height:100%` 铺满容器的，宽高比对不上会把图拉变形。
 */
export type ChartRenderFn = (
  data: ChartSlotData,
  size: { width: number; height: number },
) => string;
