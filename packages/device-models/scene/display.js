/**
 * Studio Display XDR（27 寸 5K 显示器）。
 *
 * ## 与手机 / 笔记本同一套做法
 *
 * 屏是**带圆角矩形孔的挤出框**，孔里真空，界面图从后面填进来。
 *
 * ## 与笔记本的关键差别：屏幕不在机身本地坐标系的原点
 *
 * 显示器是立在桌面上的，屏在机身坐标系里**又高又偏**（面板底边离桌面 698 单位）。
 * 而 `main.js` 的四角投影是照「屏幕在本地 XY 平面、以原点为中心」写的，
 * 所以这里必须返回一个**原点落在屏幕中心**的 `screenGroup`——
 * 否则四角会整体偏到桌面上去。
 *
 * ## 尺寸
 *
 * 与手机共用一套设备单位（5917 单位/米）。Apple Studio Display 实机：
 * 整体宽 623mm、含支架高 478mm；面板可视区 597×336mm（27 寸 16:9）。
 * 面板外框比可视区每边多 12mm 边框。
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { roundedRect, screenBlocker } from './stage.js';

export const DISPLAY = {
  panel: { w: 3674, h: 2130, t: 207, r: 44 },
  /** 屏幕可视区 */
  screen: { w: 3533, h: 1988, r: 16 },
  /** 面板底边离桌面的高度（不含面板本身的高度） */
  lift: 698,
  stand: { w: 260, d: 70, footW: 640, footD: 380, footT: 26 },
};

const ALU = new THREE.MeshPhysicalMaterial({
  color: 0x2b2e34, roughness: 0.34, metalness: 0.92,
  clearcoat: 0.3, clearcoatRoughness: 0.28,
});
const GLASS = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, roughness: 0.05, metalness: 0.1,
  transparent: true, opacity: 0.06, clearcoat: 1,
});

/**
 * 建一台显示器。**支架脚底落在 `y = 0`**，与 `buildDesk` 的桌面上表面同一约定，
 * 所以「摆到桌上」就是把两个 group 直接叠起来。
 *
 * 返回 `{ group, screen, screenGroup }`。`screen.z` 是**相对 `screenGroup`** 的，
 * 也就是 0——那个坐标系的原点就是屏幕中心。
 */
export function buildDisplay() {
  const { panel, screen, lift, stand } = DISPLAY;
  const g = new THREE.Group();

  /* ---- 支架 ---- */
  const column = new THREE.Mesh(new RoundedBoxGeometry(stand.w, lift, stand.d, 4, 12), ALU);
  column.position.set(0, lift / 2, -stand.d * 0.6);
  g.add(column);

  // 底座：一块压扁的圆角板。做得比立柱宽得多——真机靠它才站得住，视觉上也才「落」得下来
  const foot = new THREE.Mesh(
    new RoundedBoxGeometry(stand.footW, stand.footT, stand.footD, 4, 12),
    ALU,
  );
  foot.position.set(0, stand.footT / 2, 0);
  g.add(foot);

  /* ---- 面板 ---- */
  const shape = roundedRect(new THREE.Shape(), panel.w, panel.h, panel.r);
  shape.holes.push(roundedRect(new THREE.Path(), screen.w, screen.h, screen.r));
  const panelMesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: panel.t, bevelEnabled: false, curveSegments: 32 }),
    ALU,
  );
  // 形状居中于原点，往上抬到面板底边落在 lift 处
  panelMesh.position.set(0, lift + panel.h / 2, 0);
  g.add(panelMesh);

  /* 屏幕中心那一层：原点 = 屏幕中心，四角投影直接可用 */
  const screenGroup = new THREE.Group();
  screenGroup.position.set(0, lift + panel.h / 2, panel.t);
  g.add(screenGroup);

  // 玻璃面：铺在孔上给一层淡反射，属于外壳层
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(screen.w, screen.h), GLASS);
  glass.position.copy(screenGroup.position);
  g.add(glass);

  // 挡板在玻璃**后面**一丝，挡住支架从孔里透出来
  const blocker = screenBlocker(screen.w, screen.h, 0);
  blocker.position.copy(screenGroup.position);
  blocker.position.z -= 0.5;
  g.add(blocker);

  return { group: g, screen: { ...screen, z: 0 }, screenGroup };
}
