/**
 * MacBook Pro 14。
 *
 * ## 与手机同一套做法
 *
 * 屏幕同样是**带圆角矩形孔的挤出框**——孔里什么都不画，界面图从后面填进来。
 * 「屏幕内容可替换」的前提就是外壳图上真的有一个洞。
 *
 * ## 不一样的地方：屏幕不在机身本地坐标系里
 *
 * 笔记本的屏是**掀起来的**，它在一个绕 X 轴转过的「上盖」坐标系里。所以这里返回的是
 * `screenGroup`（屏幕中心那一层）而不是让调用方拿机身坐标系去投四角——
 * `main.js` 的四角投影本来就是照「屏幕在本地 XY 平面、朝 +Z」写的，
 * 给它一个已经带上盖旋转的坐标系即可，不用为笔记本改投影。
 *
 * ## 尺寸
 *
 * 与手机共用一套设备单位（5917 单位/米，即手机宽 420 ≈ 71mm）。真机 MacBook Pro 14：
 * 宽 312.6mm、深 221.2mm、厚 15.5mm；屏可视区 301×196mm。
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { roundedRect, screenBlocker } from './stage.js';

export const MACBOOK = {
  base: { w: 1850, d: 1309, t: 92, r: 26 },
  lid: { w: 1850, h: 1290, t: 60, r: 26 },
  /** 屏幕可视区。`z` 在 `screenGroup` 里是 0——那个坐标系的原点就是屏幕中心 */
  screen: { w: 1781, h: 1160, r: 22 },
  /**
   * 开合角（度）。**从「合盖」量起**：0° 是盖着，180° 是完全摊平。
   * 105° 是笔记本常见的开合位置——再开就往后仰得不自然了。
   */
  openDeg: 105,
  /**
   * 键盘凹槽与触控板。`z` 相对机身中心，**−Z 是转轴那一侧**。
   *
   * 尺寸照真机比例反推（MacBook Pro 14：机身 312.6×221.2mm，键盘区 280×110mm，
   * 触控板 150×100mm），折到本仓的设备单位（1850 宽）。
   */
  deck: {
    well: { w: 1640, d: 600, z: -294, r: 18 },
    pad: { w: 900, d: 520, z: 316, r: 14 },
  },
};

/**
 * 键帽排布。
 *
 * ## 为什么要真建键帽，而不是画个深色凹槽了事
 *
 * 早先键盘区就是**一块深色圆角方块**。俯角一抬，那块方块清清楚楚地露出来，
 * 但读起来是「一块贴纸」而不是键盘——用户的原话是「需要可以看到键盘的」。
 * 产品图里键盘之所以一眼认得出，靠的就是那一格一格的键帽。
 *
 * ## 为什么用 InstancedMesh
 *
 * 十四个键位乘六行是八十四块。逐块 `Mesh` 就是八十四次 draw call，
 * 而它们在几何上**完全一样**、只差一个位置——正是 InstancedMesh 的场合：一次画完。
 *
 * 第一行（功能键行）矮一截，所以行高不统一，位置逐个算。
 */
const KEYS = {
  cols: 14,
  rows: 5,
  /** 键帽之间、以及键帽与凹槽边缘之间的缝。**缝是键盘的全部观感**，不能省 */
  gap: 10,
  margin: 18,
  /** 功能键行的高度。真机上是半高的一排 */
  fnRowD: 44,
  /** 键帽厚度：高出凹槽一点点，不然从俯角看是平的 */
  h: 12,
  /** 键帽倒角半径。**必须小于 `h/2`**，否则 `RoundedBoxGeometry` 直接抛错 */
  r: 5,
};

const ALU = new THREE.MeshPhysicalMaterial({
  color: 0x2b2e34, roughness: 0.34, metalness: 0.92,
  clearcoat: 0.3, clearcoatRoughness: 0.28,
});
/** 键盘凹槽与触控板：比机身哑一点、深一点，不然从 3/4 视角看不出那是两块不同的面 */
const KEYWELL = new THREE.MeshPhysicalMaterial({
  color: 0x14161a, roughness: 0.78, metalness: 0.2,
});
/** 键帽比凹槽**亮一档**。一样深的话，俯角下整片键盘糊成一块黑的 */
const KEYCAP = new THREE.MeshPhysicalMaterial({
  color: 0x26292f, roughness: 0.82, metalness: 0.12,
});
const GLASS = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, roughness: 0.05, metalness: 0.1,
  transparent: true, opacity: 0.06, clearcoat: 1,
});

/**
 * 建一台 MacBook。机身底面落在 `y = 0`，整机居中于原点。
 *
 * 返回 `{ group, screen, screenGroup, fit }`。`screenGroup` 是**屏幕中心**那一层
 * （带上盖的旋转），`screen.z` 为 0。
 */
export function buildMacBook() {
  const { base, lid: lidSize, screen, openDeg } = MACBOOK;
  const g = new THREE.Group();

  /* ---- 底座 ---- */
  const baseMesh = new THREE.Mesh(
    new RoundedBoxGeometry(base.w, base.t, base.d, 6, base.r),
    ALU,
  );
  baseMesh.position.y = base.t / 2;
  g.add(baseMesh);

  /* ---- 键盘区与触控板 ---- */
  const { well: wellBox, pad: padBox } = MACBOOK.deck;

  // 凹槽**略微凹进**顶面一点。凸出来的话从 3/4 视角看像贴了两块胶布
  const well = new THREE.Mesh(
    new RoundedBoxGeometry(wellBox.w, 6, wellBox.d, 4, wellBox.r),
    KEYWELL,
  );
  well.position.set(0, base.t - 1, wellBox.z);
  g.add(well);

  const pad = new THREE.Mesh(
    new RoundedBoxGeometry(padBox.w, 6, padBox.d, 4, padBox.r),
    KEYWELL,
  );
  pad.position.set(0, base.t - 1, padBox.z);
  g.add(pad);

  /* ---- 键帽 ---- */
  /*
    行高不统一（第一行是半高的功能键），所以逐块算位置，不用整齐的网格循环。
    纵向从凹槽**后缘**往里排：先功能键行，再五行全高键。
  */
  const cols = KEYS.cols;
  const keyW = (wellBox.w - KEYS.margin * 2 - (cols - 1) * KEYS.gap) / cols;
  const rowD = (wellBox.d - KEYS.margin * 2 - KEYS.fnRowD - KEYS.rows * KEYS.gap) / KEYS.rows;

  /*
    参数顺序是 `(geometry, material, count)`——**不是** `(geometry, count, material)`。
    写反了不会报错：`count` 收到材质对象，`new Float32Array(NaN * 16)` 的长度是 0，
    于是实例矩阵是个空数组，`computeBoundingBox` 读出来全是 `NaN`，
    整组的包围盒跟着废掉、相机距离算成 `NaN`——最后的表现是**这台设备渲不出来**。
  */
  const caps = new THREE.InstancedMesh(
    new RoundedBoxGeometry(keyW, KEYS.h, rowD, 3, KEYS.r),
    KEYCAP,
    (KEYS.rows + 1) * cols,
  );
  const m = new THREE.Matrix4();
  let n = 0;
  const zBack = wellBox.z - wellBox.d / 2 + KEYS.margin;
  /** 一行键帽：`depth` 是这一行的进深，`z0` 是这一行后缘的 z */
  const row = (z0, depth) => {
    for (let c = 0; c < cols; c += 1) {
      const x = (c - (cols - 1) / 2) * (keyW + KEYS.gap);
      // 键帽中心比凹槽顶面高一点点：**高出**才看得出是一颗一颗的
      m.makeTranslation(x, base.t + KEYS.h / 2 - 3, z0 + depth / 2);
      caps.setMatrixAt(n++, m);
    }
  };
  row(zBack, KEYS.fnRowD);
  for (let r = 0; r < KEYS.rows; r += 1) {
    row(zBack + KEYS.fnRowD + KEYS.gap + r * (rowD + KEYS.gap), rowD);
  }
  caps.count = n;
  caps.instanceMatrix.needsUpdate = true;
  g.add(caps);

  /* ---- 上盖 ---- */
  /*
    上盖挂在一个**铰链处的组**上：本地原点在转轴上，本地 +Y 沿着上盖往上长。
    这样上盖的旋转就只是这一个组绕 X 转，屏幕坐标系跟着一起转，不用另外算。

    ## 铰链在**后缘**，上盖往后仰——这两条都不能反
    
    机身是朝 +Z 的（屏幕法线朝 +Z，相机也在 +Z）。所以**键盘在 +Z 这一侧**，
    转轴必须在 −Z 那条边，上盖从那里往上升、往 −Z 仰。反过来的话上盖会立在机身
    前方、把键盘整个挡在背后，渲染出来就是「一台没有键盘的笔记本」——
    页面上看不出是相机或铰链的问题，只会觉得模型做错了。

    角度：记 `t` 为 `hinge.rotation.x`，上盖方向是 `(0, cos t, sin t)`。
    - `t = +90°` → `(0, 0, 1)`，上盖平躺着指向前方，**合盖**。
    - `t = 0°` → 竖直，即开了 90°。
    所以「从合盖量起的开合角 `D`」对应 `t = 90° − D`；`D = 105°` 时 `t = −15°`，
    上盖竖直再往后仰 15°。
  */
  const hinge = new THREE.Group();
  hinge.position.set(0, base.t, -base.d / 2);
  hinge.rotation.x = THREE.MathUtils.degToRad(90 - openDeg);
  g.add(hinge);

  const lidShape = roundedRect(new THREE.Shape(), lidSize.w, lidSize.h, lidSize.r);
  lidShape.holes.push(roundedRect(new THREE.Path(), screen.w, screen.h, screen.r));
  const lidMesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(lidShape, { depth: lidSize.t, bevelEnabled: false, curveSegments: 24 }),
    ALU,
  );
  // 挤出是从 z=0 往 +Z 长，形状居中于原点；挪到铰链之上
  lidMesh.position.y = lidSize.h / 2;
  hinge.add(lidMesh);

  /* 屏幕中心那一层。原点就是屏幕中心，所以四角投影照 main.js 那套直接可用 */
  const screenGroup = new THREE.Group();
  screenGroup.position.set(0, lidSize.h / 2, lidSize.t);
  hinge.add(screenGroup);

  // 摄像头：属于外壳层，压在孔里（和手机的灵动岛同一个道理）
  const cam = new THREE.Mesh(
    new RoundedBoxGeometry(84, 20, 4, 4, 9),
    new THREE.MeshBasicMaterial({ color: 0x05060a }),
  );
  cam.position.set(0, lidSize.h / 2 - 34, lidSize.t - 1);
  hinge.add(cam);

  // 玻璃面：铺在孔上给一层淡反射。它是「贴在外壳图里的反射层」，不参与遮挡
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(screen.w, screen.h), GLASS);
  glass.position.set(0, lidSize.h / 2, lidSize.t);
  hinge.add(glass);

  // 挡板在玻璃**后面**一丝：挡住上盖背面透出来的东西，见 `stage.js` 的 `screenBlocker`
  const blocker = screenBlocker(screen.w, screen.h, 0);
  blocker.position.set(0, lidSize.h / 2, lidSize.t - 0.5);
  hinge.add(blocker);

  /*
    不在这里算取景：**取景要等姿态转完再量**，理由见 `main.js` 的 `fitOf`。
    调用方拿 `group` 去居中、拿 `fitTarget` 去取景。
  */
  return { group: g, screen: { ...screen, z: 0 }, screenGroup };
}
