import test from 'node:test';
import assert from 'node:assert/strict';
import { screenMatrix, screenStyle, overscan, type Point, type Quad } from './quad.js';

/**
 * 单应的正确性**只能靠把四角代回去验**——这是本模块唯一有意义的判据。
 *
 * 矩阵算错了不会报错：浏览器照收，屏幕上只是界面图贴歪、或者整块不渲染。
 * 而这类错误在 1920 画布上肉眼很难判断「差了多少」，所以必须在数字上钉死。
 */

/** 按 CSS 的列主序解析 `matrix3d(...)`，返回作用在 `(x,y,0,1)` 上的结果 */
function apply(matrix: string, x: number, y: number): Point {
  // 只取括号里那一串——直接对整条匹配会把 `matrix3d` 的 `3` 也数进去
  const inside = /matrix3d\(([^)]*)\)/.exec(matrix)?.[1];
  assert.ok(inside, `不是一条 matrix3d：${matrix}`);
  const nums = inside.split(',').map((s) => Number(s.trim()));
  assert.equal(nums.length, 16, `matrix3d 应该有 16 个数，实际 ${nums.length} 个`);
  const [a1, b1, , d1, a2, b2, , d2, , , , , a4, b4, , d4] = nums as [
    number, number, number, number, number, number, number, number,
    number, number, number, number, number, number, number, number,
  ];
  const X = a1 * x + a2 * y + a4;
  const Y = b1 * x + b2 * y + b4;
  const W = d1 * x + d2 * y + d4;
  return { x: X / W, y: Y / W };
}

/** 把源矩形的四角代进矩阵，逐个核对落点 */
function assertQuadMaps(W: number, H: number, quad: Quad, note: string) {
  const m = screenMatrix(W, H, quad);
  const src: Point[] = [{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: 0, y: H }];
  for (let i = 0; i < 4; i += 1) {
    const got = apply(m, src[i]!.x, src[i]!.y);
    assert.ok(
      Math.abs(got.x - quad[i]!.x) < 1e-6 && Math.abs(got.y - quad[i]!.y) < 1e-6,
      `${note}：第 ${i} 角该落到 (${quad[i]!.x}, ${quad[i]!.y})，实际 (${got.x}, ${got.y})`,
    );
  }
}

test('一般四边形（带透视）——四角逐一落准', () => {
  // 四角不构成平行四边形：对边既不平行也不等长，仿射变换做不到这一种
  assertQuadMaps(1440, 3120, [
    { x: 300, y: 120 },
    { x: 1080, y: 210 },
    { x: 1010, y: 960 },
    { x: 340, y: 880 },
  ], '透视四边形');
});

test('平行四边形（设备正对相机）——走 g=h=0 那条分支', () => {
  // 这一种下 Heckbert 的分母恰好为 0，必须走特判分支，否则是 0/0
  assertQuadMaps(1000, 500, [
    { x: 100, y: 100 },
    { x: 700, y: 100 },
    { x: 700, y: 350 },
    { x: 100, y: 350 },
  ], '平行四边形');
});

test('轴对齐矩形——退化成纯缩放平移', () => {
  assertQuadMaps(800, 600, [
    { x: 40, y: 50 },
    { x: 440, y: 50 },
    { x: 440, y: 350 },
    { x: 40, y: 350 },
  ], '轴对齐矩形');
});

test('源矩形与目标一样大且同位——映射是恒等', () => {
  const quad: Quad = [
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
  ];
  const p = apply(screenMatrix(100, 100, quad), 37, 82);
  assert.ok(Math.abs(p.x - 37) < 1e-6 && Math.abs(p.y - 82) < 1e-6, `恒等映射该原样返回，实际 (${p.x}, ${p.y})`);
});

/**
 * 四角共线时无解。**必须抛，不能静默出 NaN**——`matrix3d(NaN…)` 浏览器整块不渲染
 * 且一个字都不报，页面上就是「设备不见了」，排查起来毫无线索。
 */
test('退化的四边形要抛错，不能静默出 NaN', () => {
  assert.throws(
    () => screenMatrix(100, 100, [
      { x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 },
    ]),
    /退化/,
  );
  assert.throws(() => screenMatrix(0, 100, [
    { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 },
  ]), /必须为正/);
});

test('生成的 CSS 自带 transform-origin 与 object-fit——那两条约定不能靠调用方记', () => {
  const css = screenStyle(1440, 3120, [
    { x: 10, y: 20 }, { x: 110, y: 20 }, { x: 110, y: 220 }, { x: 10, y: 220 },
  ]);
  assert.match(css, /transform-origin:\s*0 0/, '默认的 50% 50% 会让四角整体错位');
  assert.match(css, /object-fit:\s*cover/, '按盒子裁满，溢出的部分交给外壳遮');
  assert.match(css, /transform:\s*matrix3d\(/);
});

test('overscan 把四角从质心往外放，质心不动', () => {
  const quad: Quad = [
    { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 },
  ];
  const out = overscan(quad, 1.03);
  assert.deepEqual(out[0], { x: -1.5, y: -1.5 });
  assert.deepEqual(out[2], { x: 101.5, y: 101.5 });
  const centroid = (q: Quad): Point => ({
    x: (q[0].x + q[1].x + q[2].x + q[3].x) / 4,
    y: (q[0].y + q[1].y + q[2].y + q[3].y) / 4,
  });
  assert.deepEqual(centroid(out), centroid(quad), '质心不该动');
});

/**
 * 放大的必须是**盖满孔**的方向：underscan 会在孔边露出页面底色，形成一圈亮边。
 * 这条钉的是「放完之后四角在孔之外」。
 */
test('overscan 之后四角落在孔之外（不会露边）', () => {
  const quad: Quad = [
    { x: 300, y: 120 }, { x: 1080, y: 210 }, { x: 1010, y: 960 }, { x: 340, y: 880 },
  ];
  const out = overscan(quad, 1.03);
  const cx = (quad[0].x + quad[1].x + quad[2].x + quad[3].x) / 4;
  const cy = (quad[0].y + quad[1].y + quad[2].y + quad[3].y) / 4;
  for (let i = 0; i < 4; i += 1) {
    const dIn = Math.hypot(quad[i]!.x - cx, quad[i]!.y - cy);
    const dOut = Math.hypot(out[i]!.x - cx, out[i]!.y - cy);
    assert.ok(dOut > dIn, `第 ${i} 角没有被推出去，盖不满孔`);
  }
});
