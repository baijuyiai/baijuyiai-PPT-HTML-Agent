/**
 * iPhone 18 Pro。
 *
 * ## 构件
 *
 * 机身是**一块带圆角矩形孔的挤出框**——孔里什么都不画，`alpha` 下天然透明，
 * 界面图从后面填进来。这是「屏幕内容可替换」的前提：外壳图上必须真的有一个洞，
 * 而不是一块深色的屏。
 *
 * 另外三样让它读起来像一台手机：**灵动岛**（孔内的黑色胶囊，属于外壳层，
 * 所以它会盖在界面图上）、**侧边按键**、**背面摄像头凸台**。
 *
 * ## 尺寸
 *
 * 单位是任意的「设备单位」，只要三台设备之间保持真实比例即可。手机取 420×880×26，
 * 圆角 56；孔 384×840、圆角 40。孔与机身之间那圈边框**对角很薄**（56 与 40 只差 16），
 * 这正是界面图必须带 `border-radius` 的原因，见 `quad.ts` 的 `screenStyle`。
 */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { roundedRect, screenBlocker } from './stage.js';

export const IPHONE = {
  body: { w: 420, h: 880, d: 26, r: 56 },
  /** 屏幕可视区。`z` 是界面图该待的那一层——孔的**前表面**，与边框齐平 */
  screen: { w: 384, h: 840, r: 40, z: 26 },
};

/**
 * 灵动岛。**尺寸照参考图量的**：宽约为屏幕宽的 20%、宽高比约 2.6:1
 * （量的是用户给的那张真机照：胶囊 51×20 px，同一张图里机身 253 px 宽）。
 *
 * ## 为什么用挤出的圆角矩形，不用 `RoundedBoxGeometry`
 *
 * `RoundedBoxGeometry(w, h, d, seg, r)` 的 `r` 会被**最小的那一维**卡住——
 * 这里 `d` 只有 5，所以 `r` 最大只能是 2.5。写 `r = h/2` 想做成胶囊，实际出来
 * 是个**四角几乎方**的矩形，与真机一眼就能看出差别（用户就是这么发现的）。
 * 挤出的二维形状没有这个限制：`r` 取 `h/2` 就是真正的胶囊。
 */
const ISLAND = {
  w: 78,
  h: 30,
  /** 胶囊上沿到屏幕上沿的距离 */
  topGap: 18,
  d: 5,
  /**
   * 前摄在胶囊里的位置，**从左边量起的比例**。
   * 0.8 是照参考图量的：镜头在偏右那一端，不在正中。
   */
  camFromLeft: 0.8,
  camR: 7,
};

const ALU = new THREE.MeshPhysicalMaterial({
  color: 0x2b2e34, roughness: 0.32, metalness: 0.92,
  clearcoat: 0.35, clearcoatRoughness: 0.25,
});
const GLASS = new THREE.MeshPhysicalMaterial({
  color: 0xffffff, roughness: 0.05, metalness: 0.1,
  transparent: true, opacity: 0.06, clearcoat: 1,
});
const LENS = new THREE.MeshPhysicalMaterial({
  color: 0x0b0c0f, roughness: 0.08, metalness: 0.5, clearcoat: 1,
});
/** 灵动岛本体。比纯黑亮一点点，不然在深色壁纸上和背景糊在一起 */
const ISLAND_BODY = new THREE.MeshBasicMaterial({ color: 0x05060a });
/**
 * 前摄：一圈略亮的环 + 更深的内芯 + 一点高光。三层才读得出「这是个镜头」。
 *
 * **环必须比岛体亮得出来。** 第一版环取 0x171c29、内芯 0x070a12，而岛体是 0x05060a——
 * 仨几乎一个色，渲出来只剩针尖大一个点，看着像颗灰尘。参考图里镜头的环是能看出来的。
 */
const CAM_RING = new THREE.MeshBasicMaterial({ color: 0x2a3448 });
const CAM_CORE = new THREE.MeshBasicMaterial({ color: 0x080c15 });
const CAM_GLINT = new THREE.MeshBasicMaterial({ color: 0x8fa6cc });

/** 侧边按键：贴在左右两侧的小圆角块。位置与长短照真机的大致比例 */
function buttons() {
  const g = new THREE.Group();
  const make = (x, y, h) => {
    const m = new THREE.Mesh(new RoundedBoxGeometry(9, h, 15, 4, 4), ALU);
    m.position.set(x, y, 0);
    return m;
  };
  const left = -(IPHONE.body.w / 2) - 1;
  const right = IPHONE.body.w / 2 + 1;
  // 左侧：静音拨片 + 音量加减
  g.add(make(left, 250, 46), make(left, 168, 92), make(left, 58, 92));
  // 右侧：电源键
  g.add(make(right, 140, 130));
  return g;
}

/**
 * 建一台 iPhone。
 *
 * 返回 `{ group, screen, screenGroup }`——`screen` 是界面图要贴的那一层（宽高、圆角），
 * `screenGroup` 的原点就在屏幕中心。取景交给 `main.js`：它要等姿态转完再按包围盒量。
 */
export function buildIPhone() {
  const { body, screen } = IPHONE;
  const g = new THREE.Group();

  // 机身：带孔的挤出框
  const shape = roundedRect(new THREE.Shape(), body.w, body.h, body.r);
  shape.holes.push(roundedRect(new THREE.Path(), screen.w, screen.h, screen.r));
  g.add(new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: body.d, bevelEnabled: false, curveSegments: 24 }),
    ALU,
  ));

  // 背面摄像头凸台 + 三个镜头。只在 3/4 视角里看得见，但少了就不像手机
  const bumpX = -body.w / 2 + 96;
  const bumpY = body.h / 2 - 100;
  const bump = new THREE.Mesh(new RoundedBoxGeometry(152, 152, 14, 5, 44), ALU);
  bump.position.set(bumpX, bumpY, -body.d / 2 - 7);
  g.add(bump);
  for (const [dx, dy] of [[-32, 32], [32, 32], [-32, -32]]) {
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(27, 27, 12, 32), LENS);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(bumpX + dx, bumpY + dy, -body.d / 2 - 15);
    g.add(lens);
  }

  g.add(buttons());

  /*
    灵动岛：**属于外壳层**，画在孔内、贴着前表面。
    它在渲染时是实心黑，所以出图之后会盖在界面图上——与真机一致（灵动岛本来就压在内容之上）。
  */
  const island = new THREE.Group();
  const islandY = screen.h / 2 - ISLAND.topGap - ISLAND.h / 2;
  // 挤出是从 z=0 往 +Z 长，形状居中于原点——往回挪半个厚度才是「居中」
  const islandZ = screen.z - 1.5 - ISLAND.d / 2;

  const pill = new THREE.Mesh(
    new THREE.ExtrudeGeometry(
      roundedRect(new THREE.Shape(), ISLAND.w, ISLAND.h, ISLAND.h / 2),
      { depth: ISLAND.d, bevelEnabled: false, curveSegments: 32 },
    ),
    ISLAND_BODY,
  );
  pill.position.set(0, 0, islandZ);
  island.add(pill);

  /*
    前摄：一圈环 + 内芯 + 一点高光。

    **必须贴在岛的前表面上、而且别叠三层同心的圆盘。** 第一版把三片圆柱塞在 z=25 附近，
    而岛的前表面在 z=27——镜头整个被岛体挡住了，渲出来只剩针尖大的一点。
    而且三片几乎共面，深度测试压不稳。改成**同平面上的环 + 圆**（半径不重叠，不会打架）。
  */
  const pillFront = islandZ + ISLAND.d;
  const camX = -ISLAND.w / 2 + ISLAND.camFromLeft * ISLAND.w;

  const ring = new THREE.Mesh(new THREE.RingGeometry(ISLAND.camR * 0.62, ISLAND.camR, 32), CAM_RING);
  ring.position.set(camX, 0, pillFront + 0.05);
  island.add(ring);

  const core = new THREE.Mesh(new THREE.CircleGeometry(ISLAND.camR * 0.62, 32), CAM_CORE);
  core.position.set(camX, 0, pillFront + 0.05);
  island.add(core);

  // 高光偏左上一点——正中的话像一颗纽扣，不像镜头
  const glint = new THREE.Mesh(new THREE.CircleGeometry(ISLAND.camR * 0.22, 16), CAM_GLINT);
  glint.position.set(camX - ISLAND.camR * 0.3, ISLAND.camR * 0.3, pillFront + 0.08);
  island.add(glint);

  island.position.set(0, islandY, 0);
  g.add(island);

  /*
    **屏幕中心那一层。** 三台设备对外都返回 `screenGroup`，原点就是屏幕中心——
    调用方拿它去投四角，不必知道屏幕在机身坐标系里偏到哪儿去了。
  */
  const screenGroup = new THREE.Group();
  screenGroup.position.set(0, 0, screen.z);
  g.add(screenGroup);

  // 玻璃面：铺在孔上给一层淡反射。它是「贴在外壳图里的反射层」，不参与遮挡
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(screen.w, screen.h), GLASS);
  glass.position.z = screen.z;
  g.add(glass);

  /*
    挡板放在玻璃**后面**一丝：玻璃是透明的，排在挡板之后画，仍能叠上去；
    而挡板写下的深度会把摄像头凸台与握持的手挡在孔外——见 `stage.js` 的 `screenBlocker`。
  */
  g.add(screenBlocker(screen.w, screen.h, screen.z - 0.5));

  return { group: g, screen: { ...screen, z: 0 }, screenGroup };
}
