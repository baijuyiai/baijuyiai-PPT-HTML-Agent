import type { FlowKind } from '@lumen/ir-schema/chart-kind';
import { FLOW_NODE_H, FLOW_NODE_W, layeredLayout } from '../layout.js';
import { lighten } from '../palette.js';
import { seriesColor, type BuildContext, type KindBuilder } from './context.js';

/** 流程类：漏斗图、桑基图、和弦图、流程图 */

/** 漏斗图。取首个 series，类目当层级名 */
function funnel(ctx: BuildContext): Record<string, unknown> {
  const first = ctx.spec.series?.[0];
  const values = first?.values ?? [];
  const data = (ctx.spec.categories ?? []).map((name, i) => ({ name, value: values[i] ?? 0 }));

  return {
    series: [{
      name: first?.name ?? '',
      type: 'funnel',
      left: '8%', right: '8%', top: 16, bottom: 16,
      minSize: '22%',
      gap: 3,
      sort: 'none',
      data,
      label: { show: true, position: 'inside', formatter: '{b} {c}', color: ctx.spec.theme.background },
      itemStyle: { borderWidth: 0 },
    }],
  };
}

/** 从 links 里取出出现过的节点名，保持首次出现的顺序且去重 */
function nodeNames(links: { source: string; target: string }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const l of links) {
    for (const n of [l.source, l.target]) {
      if (n !== '' && !seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  return out;
}

/**
 * 桑基图。流向的宽度就是流量，看的是「东西从哪来、到哪去、各占多少」。
 *
 * `layoutIterations` 显式钉 32：默认值随版本变，而迭代次数直接决定节点摆在哪——
 * 不钉住的话，换个 ECharts 版本同一份数据就排得不一样，导出的图和之前对不上。
 */
function sankey(ctx: BuildContext): Record<string, unknown> {
  const links = ctx.spec.links ?? [];
  const names = nodeNames(links);

  return {
    series: [{
      type: 'sankey',
      data: names.map((name) => ({ name })),
      links: links.map((l) => ({ source: l.source, target: l.target, value: l.value ?? 1 })),
      layoutIterations: 32,
      nodeWidth: 18,
      nodeGap: 14,
      left: 24, right: 24, top: 24, bottom: 24,
      lineStyle: { color: 'gradient', opacity: 0.35, curveness: 0.5 },
      label: { color: ctx.spec.theme.text, fontSize: 14 },
      itemStyle: { borderWidth: 0 },
      emphasis: { focus: 'none' },
    }],
  };
}

/**
 * 和弦图。用矩阵表达「两两之间有多少往来」——比桑基图更适合看双向关系。
 *
 * ECharts 6 新加的原生图，布局是纯三角计算、**没有随机**，SSR 下可复现。
 * 节点名取自 `matrix.rows`（行与列是同一批对象，这是和弦图的前提）；
 * 边取矩阵的非零项，两个方向各算一条。
 */
function chord(ctx: BuildContext): Record<string, unknown> {
  const m = ctx.spec.matrix;
  const names = m?.rows ?? [];
  const values = m?.values ?? [];

  const links: { source: string; target: string; value: number }[] = [];
  for (const [r, row] of values.entries()) {
    for (const [c, v] of row.entries()) {
      // 自环（r === c）跳过：和弦图画不出节点指向自己
      if (r === c || !(v > 0)) continue;
      const source = names[r];
      const target = names[c];
      if (source === undefined || target === undefined) continue;
      links.push({ source, target, value: v });
    }
  }

  return {
    series: [{
      type: 'chord',
      coordinateSystem: 'none',
      data: names.map((name) => ({ name })),
      links,
      radius: ['58%', '78%'],
      center: ['50%', '52%'],
      padAngle: 1.5,
      label: { color: ctx.spec.theme.text, fontSize: 14, position: 'outside' },
      lineStyle: { opacity: 0.45, curveness: 0.6 },
      itemStyle: { borderWidth: 0 },
      emphasis: { focus: 'none' },
    }],
  };
}

/**
 * 流程图。节点关系图，节点名自己取、不要求数值。
 *
 * **`layout: 'none'` + 自己算的分层坐标**（见 `layout.ts`）：ECharts 的 `force`
 * 布局里有两处 `Math.random`，同一份数据两次渲染的坐标不同——SSR 出的 SVG
 * 逐字节不一致，测试断言不了、导出件与编辑器里也不是同一张图。
 *
 * 坐标算在一个 1000×520 的虚拟空间里，ECharts 会把节点外框缩放铺满画布，
 * 所以不用知道画布的真实像素尺寸。
 */
function flowchart(ctx: BuildContext): Record<string, unknown> {
  const links = ctx.spec.links ?? [];
  const { nodes } = layeredLayout(links, 1000, 520);
  const color = seriesColor(ctx, 0);

  return {
    series: [{
      type: 'graph',
      layout: 'none',
      data: nodes.map((n) => ({ name: n.name, x: n.x, y: n.y })),
      links: links.map((l) => ({ source: l.source, target: l.target })),
      symbol: 'rect',
      symbolSize: [FLOW_NODE_W, FLOW_NODE_H],
      roam: false,
      left: 16, right: 16, top: 16, bottom: 16,
      label: {
        show: true,
        color: ctx.spec.theme.background,
        fontSize: 15,
        formatter: '{b}',
      },
      itemStyle: { color, borderWidth: 0, borderRadius: 6 },
      lineStyle: { color: lighten(color, 0.35), width: 1.6, curveness: 0.08 },
      edgeSymbol: ['none', 'arrow'],
      edgeSymbolSize: 8,
      emphasis: { focus: 'none' },
    }],
  };
}

export const FLOW_BUILDERS: Record<FlowKind, KindBuilder> = {
  funnel,
  sankey,
  chord,
  flowchart,
};
