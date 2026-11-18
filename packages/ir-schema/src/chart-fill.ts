import {
  CHART_SLOT_ATTR, CHART_SLOT_RE, parseChartSlot, parseChartSlotSize,
  type ChartRenderFn,
} from './chart-slot.js';

/**
 * 把页面片段里的图表槽换成真的图。
 *
 * 与 `html-doc.ts` 的 `fillImageSlots` 是同一套路数：**纯字符串替换、不碰 DOM**。
 * 页面装配在服务端与浏览器里都要跑，用 DOM 解析器会把这条链路绑死在浏览器上。
 *
 * ## 为什么住在这里，不住 `@lumen/charts`
 *
 * 真正的渲染在 `@lumen/charts`（ECharts 的 SSR），而它依赖本包——本包反向 import 会成环。
 * 所以这里只负责「找到槽、解析数据、调回调、把结果放回去」，渲染函数由调用方注入
 * （`buildPageDocument` 的 `renderChart`）。
 *
 * ## 槽长什么样
 *
 * ```html
 * <div class="ch-plot" style="…" data-lumen-chart="1180x560">{ "kind": "bar", … }</div>
 * ```
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 去掉 `data-lumen-chart="…"` 这个标记属性，其余属性（class、style）原样留着 */
function stripMarker(attrs: string): string {
  return attrs.replace(new RegExp(`\\s*${CHART_SLOT_ATTR}\\s*=\\s*["'][^"']*["']`, 'i'), '');
}

/**
 * 出不了图时的占位块。
 *
 * **不能把槽原样留着**：那样页面上会出现一段裸露的 JSON 文本，比空白更难看，
 * 而且用户看不出是「数据有问题」还是「这一页本来就长这样」。占位块把原因写在上面，
 * 尺寸由骨架自己的样式撑着，页面整体仍是完整的。
 */
function placeholder(attrs: string, problem: string): string {
  return `<div${stripMarker(attrs)} data-lumen-chart-failed="1">`
    + '<div style="display:flex;align-items:center;justify-content:center;width:100%;height:100%;'
    + 'color:var(--muted);font-size:16px;text-align:center;padding:0 24px">'
    + `${escapeHtml(problem)}</div></div>`;
}

/**
 * 填图表槽。`render` 由调用方给（见 `@lumen/charts` 的 `makeChartRenderer`）。
 *
 * 每次调用都重新造一个正则：`CHART_SLOT_RE` 带 `g` 标记，复用同一个实例时
 * `lastIndex` 会跨调用残留——`replace` 恰好会重置它，但依赖这一点太脆。
 */
export function fillChartSlots(fragment: string, render: ChartRenderFn): string {
  return fragment.replace(
    new RegExp(CHART_SLOT_RE.source, 'gi'),
    (_whole: string, attrs: string, sizeValue: string, body: string) => {
      const size = parseChartSlotSize(sizeValue);
      if (!size) {
        return placeholder(attrs, `图表槽的尺寸写法不对：「${sizeValue}」应为「宽x高」，如 1180x560`);
      }
      const parsed = parseChartSlot(body);
      if (!parsed.ok) return placeholder(attrs, parsed.problem);

      let svg = '';
      try {
        svg = render(parsed.data, size);
      } catch (err) {
        // 渲染器内部出错（数据形状对了但 ECharts 画不出来）时也出占位块，
        // 不让整页装配失败——一页坏掉不该拖垮整本
        return placeholder(attrs, `这一页的图没画出来：${err instanceof Error ? err.message : String(err)}`);
      }
      if (svg.trim() === '') return placeholder(attrs, '这一页的图表没有数据');

      return `<div${stripMarker(attrs)} data-lumen-chart-rendered="${parsed.data.kind}">${svg}</div>`;
    },
  );
}
