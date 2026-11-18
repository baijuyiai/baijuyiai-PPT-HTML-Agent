/**
 * 从原始观测值算出图表要的形态。**全部是纯函数、无随机**——
 * 同一份数据每次渲染出的 SVG 必须逐字节一致，否则测试断言不了、
 * 导出与编辑器里看到的也可能不是一张图。
 *
 * 放在这里而不是交给 ECharts 的 `dataset.transform`：自己算一遍，
 * 不用额外注册 `DatasetComponent` / `TransformComponent`，
 * 而且分箱与带宽是**可控的**（ECharts 的默认分箱随数据变，形态不稳定）。
 */

/** 升序副本。不改入参 */
function sorted(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/**
 * 分位数，线性插值（与 numpy 的默认口径一致）。
 * 空数组回 `NaN`——调用方该先判空，不该拿它当 0。
 */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) return Number.NaN;
  const s = sorted(values);
  if (s.length === 1) return s[0]!;
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const frac = pos - lo;
  return s[lo]! * (1 - frac) + s[hi]! * frac;
}

/**
 * 五数概括 `[最小, 下四分位, 中位数, 上四分位, 最大]`。
 *
 * 用四分位而不是 1.5IQR 的离群点口径：这是演示文稿里的图表，
 * 把极值裁掉会让「最大的一天是多少」这种信息消失。
 */
export function fiveNumber(values: number[]): [number, number, number, number, number] {
  const s = sorted(values);
  return [
    s[0] ?? 0,
    quantile(s, 0.25),
    quantile(s, 0.5),
    quantile(s, 0.75),
    s[s.length - 1] ?? 0,
  ];
}

/** 直方图的一根柱子 */
export interface Bin {
  /** 左闭区间起点 */
  start: number;
  /** 右开区间终点 */
  end: number;
  count: number;
}

/**
 * 等宽分箱。
 *
 * 箱数默认按 `ceil(sqrt(n))` 取并夹到 `[3, 12]`：太少看不出分布形状，
 * 太多在演示文稿的尺度下全是锯齿。
 *
 * **所有值相同时给一个箱子**（跨度为 0 会把箱宽算成 0，除零）。
 */
export function histogram(values: number[], binCount?: number): Bin[] {
  if (values.length === 0) return [];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const n = binCount ?? Math.max(3, Math.min(12, Math.ceil(Math.sqrt(values.length))));
  if (hi === lo) return [{ start: lo, end: hi, count: values.length }];

  const width = (hi - lo) / n;
  const bins: Bin[] = Array.from({ length: n }, (_, i) => ({
    start: lo + i * width,
    end: lo + (i + 1) * width,
    count: 0,
  }));
  for (const v of values) {
    // 最大值落在最后一箱（右端是闭的），否则它会掉到数组外面
    const idx = Math.min(n - 1, Math.floor((v - lo) / width));
    bins[idx]!.count += 1;
  }
  return bins;
}

/** 核密度估计的采样点 */
export interface Density {
  /** 横轴采样点，等距 */
  x: number[];
  /** 每个采样点上的密度。未归一化——调用方按最大值缩放去画 */
  y: number[];
}

/** 标准正态密度 */
function gaussian(u: number): number {
  return Math.exp(-0.5 * u * u) / Math.sqrt(2 * Math.PI);
}

/**
 * 高斯核密度估计，带宽用 Silverman 经验规则 `1.06 σ n^(-1/5)`。
 *
 * 采样网格固定 64 点、范围 `[min-3h, max+3h]`——**固定**是刻意的：
 * 网格随数据长度变的话，同一份数据加了两个点，曲线的采样点就整体挪位，
 * 测试里只能断言「大致形状」而断言不了具体坐标。
 *
 * 所有观测值相同（σ=0）时带宽会算成 0，回落到 1，画出来是一个尖峰——这是对的。
 */
export function kde(values: number[], gridSize = 64): Density {
  if (values.length === 0) return { x: [], y: [] };
  if (values.length === 1) {
    const v = values[0]!;
    return { x: [v - 1, v, v + 1], y: [0, 1, 0] };
  }

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1);
  const sigma = Math.sqrt(variance);
  const h = sigma > 0 ? 1.06 * sigma * values.length ** (-1 / 5) : 1;

  const lo = Math.min(...values) - 3 * h;
  const hi = Math.max(...values) + 3 * h;
  const step = (hi - lo) / (gridSize - 1);

  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < gridSize; i += 1) {
    const xi = lo + i * step;
    let sum = 0;
    for (const v of values) sum += gaussian((xi - v) / h);
    x.push(xi);
    y.push(sum / (values.length * h));
  }
  return { x, y };
}
