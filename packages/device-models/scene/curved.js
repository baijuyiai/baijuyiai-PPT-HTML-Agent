/**
 * 卷曲屏：一长条界面从设备里淌出来，在下方卷成一卷。
 *
 * ## 这是什么
 *
 * 参考图里那种「长截图顺着手机屏往下流、出了机身继续往前弯、最后卷成一个纸卷」的效果。
 * 它不是一台设备，而是**一张纸**：纸的上半段平铺在手机屏上，下半段是圆弧，末尾卷过去。
 *
 * ## 为什么不能用一张图 + 一个单应
 *
 * 单应（`quad.ts`）只能把矩形映到**平面**四边形。纸是弯的，一张矩形贴不上去。
 * 解法是**把纸沿长度切成 N 条**：每条在屏幕上近似是一个平面四边形，各自算一个 `matrix3d`。
 * 页面里用 N 个 `<div>`，各自 `background-position` 错开一格、套上自己的矩阵，
 * 拼起来就是连续的曲面。N 只影响 DOM 节点数，不影响导出体积（N 个 div 引用同一张图）。
 *
 * ## 纸面朝哪边（决定了「内容铺到哪儿为止」）
 *
 * 路径从屏幕顶开始往下走，到屏幕底边开始沿半径 `r` 的圆弧往前弯。参数 `θ` 是弯过的角度，
 * 纸面法线是 `(0, sinθ, cosθ)`：
 *
 * - `θ = 0`   —— 正对镜头（平铺在屏幕上的那一段）
 * - `θ = 90°` —— 朝正上方，纸面在画面里被压成一条
 * - `θ > 90°` —— 翻向背面，肉眼基本看不到正面了
 *
 * 所以**内容只铺到 110°**，再往后用纸背的素色补——参考图里卷起来那一截也正是素的。
 * 这条边界不写死成「一半」是有原因的：110° 是算出来的，不是拍的。
 *
 * ## 外壳图里，内容区是个洞
 *
 * 纸的内容那一段在渲染时**整个不画**（`visible = false`），于是外壳图上那一片是透明的，
 * 页面把 N 条界面图填进去。卷轴那一段是纸背，属于外壳，照常渲染——它同时也会
 * **盖住**伸到它后面的那几条，遮挡关系自动就对。
 */
import * as THREE from 'three';
import { buildIPhone, IPHONE } from './iphone.js';

export const PAPER = {
  /**
   * 出了机身之后**先直着往下走多长**再开始弯。
   *
   * 这一段不能省：没有它，圆弧紧贴机身下沿开始卷，而卷起来那一截（更靠前）
   * 会**把整段曲面全盖住**——渲染出来就是「手机下面直接是一卷白纸」，
   * 参考图里那种「内容顺着往下淌」的感觉全没了。
   */
  tail: 620,
  /** 圆弧半径。越大卷得越舒展，越小卷得越紧 */
  r: 300,
  /** 纸带总共弯过多少度。超过 180° 才会「卷」起来而不是「折」下去 */
  sweepDeg: 190,
  /** 内容铺到多少度为止，见文件头 */
  contentSweepDeg: 110,
  /**
   * 沿纸带切多少条。**条数决定折角可见度**：曲面用平面四边形逼近，条太少会看出棱。
   * 26 条在 900px 宽的出图上已经看不出棱，而 DOM 节点数也还好。
   */
  strips: 26,
};

/** 纸在设备坐标系里的落点：平铺段贴在屏幕正面一丝之前，免得和边框共面打架 */
const Z0 = IPHONE.screen.z + 1;
const FLAT = IPHONE.screen.h;
const HALF_W = IPHONE.screen.w / 2;

/**
 * 纸带上弧长为 `s` 处的位置。`s` 从屏幕**顶边**起算，沿纸往下走。
 * 返回的 `ny`/`nz` 是纸面法线（正面）——只有算内容铺到哪儿时用得上。
 */
function pointAt(s) {
  // ① 平铺在屏幕上
  if (s <= FLAT) return { y: FLAT / 2 - s, z: Z0, ny: 0, nz: 1 };
  const t = s - FLAT;
  // ② 出了机身，直着往下走
  if (t <= PAPER.tail) return { y: -FLAT / 2 - t, z: Z0, ny: 0, nz: 1 };
  // ③ 圆弧：往前弯，卷起来
  const th = (t - PAPER.tail) / PAPER.r;
  return {
    y: -FLAT / 2 - PAPER.tail - PAPER.r * Math.sin(th),
    z: Z0 + PAPER.r * (1 - Math.cos(th)),
    ny: Math.sin(th),
    nz: Math.cos(th),
  };
}

/** 纸带上一小段 `[s0, s1]` 的网格。三角面朝外（正面朝 +Z 那一侧） */
function ribbon(s0, s1, segs) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= segs; i += 1) {
    const p = pointAt(s0 + ((s1 - s0) * i) / segs);
    pos.push(-HALF_W, p.y, p.z, HALF_W, p.y, p.z);
  }
  for (let i = 0; i < segs; i += 1) {
    const a = i * 2;
    idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** 纸背。素色、双面——卷起来之后看到的是它的外表面 */
const PAPER_BACK = new THREE.MeshPhysicalMaterial({
  color: 0xe9e9ec, roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide,
});

/** 纸带上四个角的局部坐标。顺序：左上、右上、右下、左下——与 `quad.ts` 的约定一致 */
function corners(s0, s1) {
  const a = pointAt(s0);
  const b = pointAt(s1);
  return [
    { x: -HALF_W, y: a.y, z: a.z },
    { x: HALF_W, y: a.y, z: a.z },
    { x: HALF_W, y: b.y, z: b.z },
    { x: -HALF_W, y: b.y, z: b.z },
  ];
}

/**
 * 建一个卷曲屏场景。
 *
 * 返回 `{ group, strips, paper, fitTarget }`：
 * - `strips` 是 N 组四角坐标（设备坐标系），交给 `main.js` 投成像素；
 * - `paper` 是**纸展开后的尺寸**（宽 × 长），页面要拿它当 `background-size`。
 */
export function buildCurved() {
  const g = new THREE.Group();
  const phone = buildIPhone();
  g.add(phone.group);

  const straight = FLAT + PAPER.tail;
  const total = straight + PAPER.r * THREE.MathUtils.degToRad(PAPER.sweepDeg);
  const contentEnd = straight + PAPER.r * THREE.MathUtils.degToRad(PAPER.contentSweepDeg);

  // 内容段：**不渲染**。它在外壳图上是一块透明的洞，页面把界面图填进去
  const content = new THREE.Mesh(ribbon(0, contentEnd, PAPER.strips), PAPER_BACK);
  content.visible = false;
  content.name = 'paper-content';
  g.add(content);

  // 卷轴段：纸背，属于外壳。它同时会盖住伸到它后面的界面条
  const roll = new THREE.Mesh(ribbon(contentEnd, total, 32), PAPER_BACK);
  roll.name = 'paper-roll';
  g.add(roll);

  const strips = [];
  for (let i = 0; i < PAPER.strips; i += 1) {
    strips.push(corners((i / PAPER.strips) * contentEnd, ((i + 1) / PAPER.strips) * contentEnd));
  }

  return {
    group: g,
    strips,
    paper: { w: IPHONE.screen.w, length: contentEnd },
    fitTarget: g,
  };
}
