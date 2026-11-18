import type { ChartLink } from '@lumen/ir-schema/chart-kind';

/**
 * 流程图的分层布局。
 *
 * ## 为什么自己算，不用 ECharts 的布局
 *
 * `graph` 系列的 `layout: 'force'` 里有两处 `Math.random`（`forceHelper.js`），
 * **同一份数据两次渲染出的坐标不同**。后果不只是「看着不一样」：SSR 出的 SVG
 * 每次字节不同，测试没法断言，导出件与编辑器里看到的也不是同一张图。
 *
 * 自己算则完全确定：节点顺序按**输入顺序**取，层数按最长路径算，同层均分。
 *
 * ## 回边必须先剔除
 *
 * 流程图里有环是常态（「验收不过就打回重做」），而最长路径松弛碰到环会把节点
 * 一层层往后推：实测「打回修改 → 开发实现」这条回边把本该在第 4 层的
 * 「开发实现」推到了第 7 层，整张图散开、连线乱穿。
 *
 * 所以先做一次 DFS 找出**回边**（指向当前搜索栈上节点的边），分层只看剩下的边。
 * DFS 按输入顺序走，结果完全确定。
 */

export interface FlowNode {
  name: string;
  x: number;
  y: number;
}

export interface FlowLayout {
  nodes: FlowNode[];
  /** 画布上留给图的外边距。节点是方框，贴着边画会被裁掉 */
  padding: number;
}

/** 节点方框的宽高。与 `GraphChart` 里 `symbolSize` 配的那组数一致 */
export const FLOW_NODE_W = 132;
export const FLOW_NODE_H = 52;

/**
 * 找出回边（下标）。指向「当前搜索栈上」的节点的边就是回边。
 *
 * 用显式栈而不是递归：节点数虽然不多，但递归写法碰到长链会爆栈，
 * 而这个函数不该有输入规模上的隐含上限。
 */
function findBackEdges(order: string[], links: ChartLink[]): Set<number> {
  const adjacency = new Map<string, { to: string; index: number }[]>();
  for (const [index, l] of links.entries()) {
    const list = adjacency.get(l.source);
    if (list) list.push({ to: l.target, index });
    else adjacency.set(l.source, [{ to: l.target, index }]);
  }

  /** 0 = 没访问过，1 = 在当前搜索栈上，2 = 已搜完 */
  const state = new Map<string, 0 | 1 | 2>();
  const back = new Set<number>();

  for (const root of order) {
    if (state.has(root)) continue;
    state.set(root, 1);
    const stack: { name: string; next: number }[] = [{ name: root, next: 0 }];
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const edges = adjacency.get(top.name) ?? [];
      if (top.next >= edges.length) {
        state.set(top.name, 2);
        stack.pop();
        continue;
      }
      const edge = edges[top.next]!;
      top.next += 1;
      const seen = state.get(edge.to);
      if (seen === 1) back.add(edge.index);
      else if (seen === undefined) {
        state.set(edge.to, 1);
        stack.push({ name: edge.to, next: 0 });
      }
    }
  }
  return back;
}

export function layeredLayout(
  links: ChartLink[],
  width: number,
  height: number,
  padding = 24,
): FlowLayout {
  // 1. 收集节点，按首次出现顺序
  const order: string[] = [];
  const seen = new Set<string>();
  const add = (name: string) => {
    if (name === '' || seen.has(name)) return;
    seen.add(name);
    order.push(name);
  };
  for (const l of links) {
    add(l.source);
    add(l.target);
  }
  if (order.length === 0) return { nodes: [], padding };

  // 2. 剔除回边与自环，剩下的边才是分层依据
  const back = findBackEdges(order, links);
  const forward = links.filter((l, i) => !back.has(i) && l.source !== l.target);

  // 3. 最长路径分层
  const depth = new Map<string, number>(order.map((n) => [n, 0]));
  for (let pass = 0; pass < order.length; pass += 1) {
    for (const l of forward) {
      const from = depth.get(l.source);
      const to = depth.get(l.target);
      if (from === undefined || to === undefined) continue;
      if (to < from + 1) depth.set(l.target, from + 1);
    }
  }

  const layers = new Map<number, string[]>();
  for (const n of order) {
    const d = depth.get(n)!;
    const bucket = layers.get(d);
    if (bucket) bucket.push(n);
    else layers.set(d, [n]);
  }

  // 4. 落坐标
  const depthCount = Math.max(...layers.keys()) + 1;
  const innerW = Math.max(1, width - padding * 2);
  const innerH = Math.max(1, height - padding * 2);
  const dx = depthCount > 1 ? innerW / (depthCount - 1) : 0;

  const nodes: FlowNode[] = [];
  for (const [d, names] of [...layers.entries()].sort((a, b) => a[0] - b[0])) {
    const dy = names.length > 1 ? innerH / (names.length - 1) : 0;
    names.forEach((name, i) => {
      nodes.push({
        name,
        x: padding + (depthCount > 1 ? d * dx : innerW / 2),
        // 只有一层时纵向居中；多层时上下顶格均分
        y: names.length > 1 ? padding + i * dy : padding + innerH / 2,
      });
    });
  }
  return { nodes, padding };
}
