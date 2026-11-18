/**
 * 把一张矩形图**精确贴到一个一般四边形**上所需的 CSS `matrix3d`。
 *
 * ## 为什么是 `matrix3d` 而不是 `matrix`
 *
 * 界面截图是矩形，而设备屏幕在 3D 姿态下投影出来是**一般四边形**——有透视，
 * 对边不平行。2D 仿射变换（`matrix(a,b,c,d,e,f)`）只能把矩形映成**平行四边形**，
 * 做不到一般四边形；要把矩形映到四边形，需要**投影变换**，而 CSS 里唯一能表达
 * 投影的是 `matrix3d` 的**第四行非零**（`w` 分量）。
 *
 * `clip-path` 也不行：它定义在元素的**本地坐标系**里，会跟着 `transform` 一起被投影，
 * 于是想裁的那个四边形自己也被投影歪了。
 *
 * ## 一个矩形只能贴到平面
 *
 * 所以**曲面屏用不了这一套**：圆柱面不是平面，一张矩形图没有一个单应解。
 * 曲面屏的做法是把曲面切成若干近似平面的竖条，每条约一个四边形——见 `curved.ts`。
 *
 * ## 推导
 *
 * 记源矩形四角 `P0=(0,0) P1=(W,0) P2=(W,H) P3=(0,H)`（元素本地坐标），
 * 目标四角 `Q0..Q3`（容器坐标，顺序与 P 一致：左上、右上、右下、左下）。
 *
 * 先按 Heckbert 的标准解算出「单位正方形 → 四边形」的 3×3 单应
 * （把 `(u,v)` 映到 `((a·u+b·v+c)/(g·u+h·v+1), (d·u+e·v+f)/(g·u+h·v+1))`），
 * 再把源尺度折进去（`u = x/W`、`v = y/H`），最后按 **CSS 的列主序**排成 16 个参数。
 *
 * ## 两个必须配套的写法
 *
 * - **`transform-origin: 0 0`**。默认的 `50% 50%` 等于「先平移到中心、变换、再平移回来」，
 *   四角就不再映到 `Q*`，整块会错位。本模块算的是「以元素左上角为原点」的矩阵。
 * - **不要再写 `perspective` 属性**。透视已经在这个矩阵里了；再写一层会把消失点
 *   挪到 `perspective-origin`，反而对不上。
 *
 * 用法见 `screenStyle()`——它把矩阵与那两个写法一起给出，调用方不必自己记。
 */

export interface Point {
  x: number;
  y: number;
}

/** 目标四边形的四角，顺序：左上、右上、右下、左下 */
export type Quad = readonly [Point, Point, Point, Point];

/** 数值比较的容差。像素级贴合，1e-6 足够 */
export const EPSILON = 1e-6;

/**
 * 「单位正方形 → 四边形」的 3×3 单应，按 `[a,b,c,d,e,f,g,h,i]` 返回。
 *
 * 内部函数：对外只暴露 `screenMatrix`。单独拆出来是为了让单测能直接钉住这一步，
 * 不必先经过「折进源尺度」那层。
 */
function unitHomography([q0, q1, q2, q3]: Quad): number[] {
  const dx1 = q1.x - q2.x;
  const dx2 = q3.x - q2.x;
  const dx3 = q0.x - q1.x + q2.x - q3.x;
  const dy1 = q1.y - q2.y;
  const dy2 = q3.y - q2.y;
  const dy3 = q0.y - q1.y + q2.y - q3.y;

  /*
    三个差值同时为零 = 目标正好是平行四边形（设备正对相机时就是这一种）。
    这时 `g = h = 0` 是正解，而下面那个分母 `dx1*dy2 - dx2*dy1` 恰好也是零——
    不走这条分支就是 0/0。
  */
  if (Math.abs(dx3) < EPSILON && Math.abs(dy3) < EPSILON) {
    return [
      q1.x - q0.x, q3.x - q0.x, q0.x,
      q1.y - q0.y, q3.y - q0.y, q0.y,
      0, 0, 1,
    ];
  }

  const den = dx1 * dy2 - dx2 * dy1;
  // 退化成一条线（三点共线）时无解。现实中不会发生，但 0 除会静默出 NaN，
  // 一路变成 `matrix3d(NaN…)`，浏览器整块不渲染且不报错——宁可在这里说清楚
  if (Math.abs(den) < EPSILON) {
    throw new Error(`目标四边形退化了（四角共线或重合），算不出单应：${JSON.stringify([q0, q1, q2, q3])}`);
  }

  const g = (dx3 * dy2 - dx2 * dy3) / den;
  const h = (dx1 * dy3 - dx3 * dy1) / den;

  return [
    q1.x - q0.x + g * q1.x, q3.x - q0.x + h * q3.x, q0.x,
    q1.y - q0.y + g * q1.y, q3.y - q0.y + h * q3.y, q0.y,
    g, h, 1,
  ];
}

/**
 * 源矩形（`width`×`height` 的设计盒）→ 目标四边形的 CSS `matrix3d` 字符串。
 *
 * `quad` 是**容器坐标**里的像素值，顺序必须是左上、右上、右下、左下。
 */
export function screenMatrix(width: number, height: number, quad: Quad): string {
  if (width <= 0 || height <= 0) {
    throw new Error(`源矩形尺寸必须为正，收到 ${width}×${height}`);
  }
  const [a, b, c, d, e, f, g, h, i] = unitHomography(quad) as [
    number, number, number, number, number, number, number, number, number,
  ];

  // 把 u = x/W、v = y/H 折进去：x 方向的分母除 W，y 方向除 H
  const A = a / width;
  const B = b / height;
  const C = c;
  const D = d / width;
  const E = e / height;
  const F = f;
  const G = g / width;
  const H = h / height;
  const I = i;

  /*
    CSS 的 `matrix3d` 是**列主序**：每四个数是一列。作用在 (x,y,0,1) 上得
      x' = m11·x + m21·y + m41
      y' = m12·x + m22·y + m42
      w' = m14·x + m24·y + m44
    与本模块的 A..I 逐项对齐即得下面这一串。
  */
  return `matrix3d(${[
    A, D, 0, G,
    B, E, 0, H,
    0, 0, 1, 0,
    C, F, 0, I,
  ].map(fmt).join(', ')})`;
}

/**
 * 格式化一个矩阵元素。**按有效数字截，不能按固定小数位截。**
 *
 * 透视那两个分量（`g/W`、`h/H`）的量级是 **1e-6** 上下：`toFixed(6)` 会把 `-2.87e-6`
 * 舍成 `-3e-6`，相对误差 4%，四角能差出 **0.2px**——1920 画布上看不出来，但屏幕
 * 与设备孔就会错开一条缝。取 12 位有效数字，相对误差落在 1e-12，四角稳到 1e-6 以内。
 */
function fmt(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`矩阵里出现了非有限数：${n}`);
  return String(Number(n.toPrecision(12)));
}

/**
 * 屏幕元素的完整内联样式。**把 `transform-origin` 与 `object-fit` 一起给出去**，
 * 调用方不必自己记那两条约定（见模块顶部）。
 *
 * `object-fit: cover` 让界面图按 `width`×`height` 的盒子裁满，绝不溢出盒子——
 * 盒子之外的部分靠外壳的不透明边框遮，不是靠 `overflow: hidden`（那只能裁矩形）。
 *
 * ## `radius` 不是装饰，是几何必需
 *
 * 设备的屏幕孔是**圆角**的，而界面图是矩形。等比 overscan 之后，矩形的四个直角会从
 * 孔的圆角处戳出去——斜角那一带的边框特别薄（机身圆角 56、孔圆角 40，对角只剩十几个单位），
 * overscan 2.5% 就足以让直角穿出机身轮廓，页面上是四个角各露一小截界面底色。
 *
 * 给元素一个**在它自己坐标系里**的 `border-radius`，圆角就跟着 `matrix3d` 一起被投影，
 * 正好落在孔的圆角上。`radius` 的单位是**界面图自己的像素**（= 孔的圆角 × 界面宽 / 孔宽），
 * 不是画布像素。
 */
export function screenStyle(width: number, height: number, quad: Quad, radius = 0): string {
  return `position:absolute;left:0;top:0;width:${width}px;height:${height}px;`
    + `object-fit:cover;display:block;transform-origin:0 0;`
    + (radius > 0 ? `border-radius:${radius}px;` : '')
    + `transform:${screenMatrix(width, height, quad)}`;
}

/**
 * 把四角从质心往外放大 `k` 倍。
 *
 * **屏幕要 overscan 而不是 underscan**：设备屏幕在渲染图里是被外壳的边框框住的，
 * 而屏幕元素比孔小一丝时，孔边会露出页面底色，形成一圈亮边。放大 2–3% 保证盖满，
 * 多出来的部分被边框挡住。
 */
export function overscan(quad: Quad, k: number): Quad {
  const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
  const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
  const grow = (p: Point): Point => ({ x: cx + (p.x - cx) * k, y: cy + (p.y - cy) * k });
  return [grow(quad[0]), grow(quad[1]), grow(quad[2]), grow(quad[3])];
}
