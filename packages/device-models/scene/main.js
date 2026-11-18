/**
 * 场景入口。按 `?scene=` 组装，渲一帧，把外壳图与屏幕四角交回给 Node 侧。
 *
 * ## 姿态
 *
 * 每台设备三个姿态：正面 → 中间 → 英雄角。**三个而不是五个**：素材量与导出体积线性
 * 相关（同一张图在导出件里出现几次就内联几份），而三个姿态加交叉溶解已经够读出
 * 「转过去」；中间那一个的作用是让溶解**先经过它**，不然看着像「淡过去」而不是「转过去」。
 *
 * 角度**烘进渲染图**，页面里不再做 CSS 旋转——把一张已经带真实厚度的渲染图当平卡片
 * 再转一次，反而把 3D 感转没。CSS 的 3D 机制在这一套里只服务于屏幕那一层（`matrix3d` 单应）。
 *
 * ## 这个文件是纯 JS
 *
 * 由 `scripts/render.ts` 原样喂给浏览器，**不经过任何编译**。类型标注写在这里
 * 浏览器会直接抛 `Unexpected token`——踩过一次了。
 */
import * as THREE from 'three';
import { makeRenderer, makeEnvironment, projector, opaqueStats, frameBox } from './stage.js';
import { buildIPhone } from './iphone.js';
import { buildMacBook } from './macbook.js';
import { buildDisplay } from './display.js';
import { buildCurved } from './curved.js';

const W = 900;
const H = 1200;

/* 查询参数在**最顶上**解析：模块级常量要用它，
   放到文件末尾会让它们在模块求值时踩到 TDZ（`Cannot access 'params' before initialization`）。 */
const params = new URLSearchParams(location.search);

/**
 * 悬停时转过去多少、分几步。
 *
 * ## 帧数决定「像不像真的在转」
 *
 * 页面里没有运行时 3D，悬停时是把这几帧**交叉溶解**出来的。溶解的中间态是
 * **两张投影叠在一起**，所以帧距必须足够小，中间态才读成动态模糊；
 * 帧距一大，读起来就是「一张图淡成另一张」——**这是「不像转动」的真正原因**，
 * 与角度大小无关。
 *
 * 最早只有三帧（0° / 7.4° / 15.5°），每步 7.5°，中间态糊成一片。
 * 九帧把每步压到 3.1°，中间态才接得上。再多收益就很小了——素材量与帧数线性相关。
 */
const HOVER_STEPS = 9;
/** 转到多少度。25° 才看得出机身的厚度，太小了转过去也像没转 */
const HOVER_YAW = 0.44;
/** 俯仰与画面内倾斜：真手转一台设备时不会只绕一个轴，带一点才自然 */
const HOVER_PITCH = -0.14;
const HOVER_TILT = 0.05;

/**
 * `yaw` 是绕 Y 的偏转（左右转），`pitch` 是绕 X 的俯仰，`tilt` 是画面内的轻微倾斜。
 *
 * 前面一长串是**交付用的**——一次连续的转动，页面按顺序溶解出来。
 * `side` 是**调模型用的**：侧视才看得出机身的厚度、开合角、屏幕倾角对不对，
 * 它不进骨架（生成器会跳过）。
 */
export const POSES = [
  ...Array.from({ length: HOVER_STEPS }, (_, i) => {
    const k = i / (HOVER_STEPS - 1);
    return {
      // 首尾用老名字：`front` / `hero` 在外壳图文件名里，改了要动一堆地方
      id: i === 0 ? 'front' : (i === HOVER_STEPS - 1 ? 'hero' : `h${i}`),
      yaw: HOVER_YAW * k,
      pitch: -0.02 + (HOVER_PITCH + 0.02) * k,
      tilt: HOVER_TILT * k,
    };
  }),
  { id: 'side', yaw: -1.35, pitch: -0.05, tilt: 0.0 },
];

/*
  **把姿态表交给外面。** `scripts/render.ts` 要按它决定渲哪几张——
  两边各写一份的话，加一帧忘了同步另一边，症状是「渲了但骨架里没有」，
  而骨架生成器只按文件名找图，找不到会抛错，看起来像渲染坏了。
*/
window.__poses = POSES.map((p) => p.id);

/**
 * 把整组挪到原点，**按指定对象**居中。
 *
 * 取景范围不能直接用整组的包围盒：桌面这类「衬景」本来就该出画，
 * 把它们算进取景范围，主体会被压成中间一小块。所以居中只看主体。
 */
function centerOn(group, target) {
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(target);
  group.position.sub(box.getCenter(new THREE.Vector3()));
}

/** 取景用的包围盒。**必须在姿态施加之后量**——旋转会让包围盒变大，量早了会裁掉。 */
function boxOf(target) {
  return new THREE.Box3().setFromObject(target);
}

/**
 * 把一台设备包成场景：把主体居中，交回取景对象。
 *
 * **取景只看主体**：早先笔记本与显示器还垫了一层木桌，那层衬景本来就该出画，
 * 算进取景范围会把主体压成中间一小块——所以取景用的是 `part.group` 而不是整组。
 * （木桌已按用户要求去掉，这个区分留着仍然对：以后再加任何衬景同理。）
 *
 * `elev` 是**相机俯角**（度），见下面 `CAM_ELEV` 的说明。
 */
function sceneOf(part, elev) {
  const g = new THREE.Group();
  g.add(part.group);
  centerOn(g, part.group);
  return { group: g, screen: part.screen, screenGroup: part.screenGroup, fitTarget: part.group, elev };
}

/**
 * 相机俯角（度）。**笔记本和显示器必须给，手机不用。**
 *
 * ## 为什么
 *
 * 相机默认与**主体包围盒的中心**等高、平视。手机是竖着的一块板，平视正好；
 * 笔记本不是——它的键盘面是**水平**的，而相机正对着它的侧棱，键盘面就只剩一条缝。
 * 渲染图上表现为「一台没有键盘的笔记本」，页面上看不出是相机的问题，
 * 只会觉得模型做错了。
 *
 * 显示器同理：底座与支架也是水平的，平视时整个支架看不见，像一块悬空的屏。
 *
 * ## 度数怎么定的
 *
 * 目标是**看得见键盘、但屏幕仍占画面主体**。太小（<15°）键盘只是窄窄一条；
 * 太大（>35°）变成俯视图，屏幕被压扁、失去「立着」的感觉。
 * 26° 大致是产品图里常见的那个角度；显示器是竖屏 + 细支架，抬 12° 就够看清底座了。
 */
const CAM_ELEV = { iphone: 0, macbook: 26, display: 12, curved: 0 };

/** 场景表。每个条目返回 `{ group, screen, screenGroup?, fitTarget, elev }` */
const SCENES = {
  iphone: () => sceneOf(buildIPhone(), CAM_ELEV.iphone),
  macbook: () => sceneOf(buildMacBook(), CAM_ELEV.macbook),
  display: () => sceneOf(buildDisplay(), CAM_ELEV.display),

  /*
    **卷曲屏**：没有单一的屏幕四边形，而是一串条带（见 `curved.js`）。
    取景只看整条纸——纸卷比手机本身大得多，按手机取景会把卷轴裁掉。
  */
  curved: () => {
    const c = buildCurved();
    const g = new THREE.Group();
    g.add(c.group);
    centerOn(g, c.group);
    return { group: g, strips: c.strips, paper: c.paper, fitTarget: c.group, elev: CAM_ELEV.curved };
  },
};

/* ---------------- 跑 ---------------- */

const sceneId = params.get('scene') ?? 'iphone';
const poseId = params.get('pose') ?? 'front';

const build = SCENES[sceneId];
if (!build) {
  window.__error = `没有这个场景：${sceneId}`;
  window.__done = true;
} else {
  const pose = POSES.find((p) => p.id === poseId) ?? POSES[0];

  const renderer = makeRenderer(W, H);
  const scene = makeEnvironment(renderer);
  const camera = new THREE.PerspectiveCamera(30, W / H, 1, 20000);

  const { group, screen, screenGroup, strips, paper, fitTarget, elev } = await build();

  /*
    姿态施加在一个**外层 pivot** 上，而不是设备 group 自己。
    设备 group 的本地坐标系要保持「屏幕在 XY 平面上、朝 +Z」这个干净的定义，
    四角才有一个稳定的参照；姿态一变就全乱。
  */
  const pivot = new THREE.Group();
  pivot.add(group);
  scene.add(pivot);
  pivot.rotation.set(pose.pitch, pose.yaw, pose.tilt);
  /*
    **先把姿态烘进世界矩阵，再量取景。** 顺序反了的话量到的还是没旋转的包围盒——
    而旋转会让投影宽度变大（一台 1850×1701 的笔记本绕 Y 转 15° 就变成 2227），
    表现是「正视图刚好、一转到 3/4 角就被裁掉」。
  */
  pivot.updateMatrixWorld(true);

  /*
    1.2 是**留白**：`frameBox` 解出来的是「刚好装下」，乘上去之后主体占画面的 1/1.2。
    手机这类薄物体包围盒浅、几乎顶满；笔记本上盖掀着，包围盒深，同一系数下会显得更小——
    这是可接受的，真要逐台调，等它们真的排进页面里再按页面构图调。

    **抬到俯角上**：相机沿一个半径 `d` 的球面抬 `elev` 度，仍然看向原点。
    `frameBox` 解的是「相机在 (0,0,d) 上要多远」，抬起来之后水平距离变成 `d·cos(elev)`、
    主体会略微变大——所以下面那个余量按 `elev` 补一点，别让设备顶到画布边。

    ## 距离取**整张姿态表的最大值**，不是这一帧自己的

    早先是「每渲一帧，就按那一帧的姿态量包围盒、算距离」。转到 3/4 角时包围盒变宽，
    相机自动后退，于是设备在画面上**缩小**了——实测笔记本首帧到末帧的不透明面积掉了 48%，
    用户看到的就是「位移的时候变小了」。转动应该只改朝向、不改大小。

    取最大是为了**谁都不出画**：小的那几个姿态会比「刚好装下」留白多一点，可以接受。
    `side` 不进这张表——它是调模型用的侧视图，不进交付件（见 `render.ts` 的 `posesOf`），
    把它算进来会把所有帧都压小一大圈。
  */
  const margin = 1.2 + Math.sin(THREE.MathUtils.degToRad(elev)) * 0.12;
  let dist = 0;
  for (const p of POSES) {
    if (p.id === 'side') continue;
    pivot.rotation.set(p.pitch, p.yaw, p.tilt);
    pivot.updateMatrixWorld(true);
    dist = Math.max(dist, frameBox(camera, boxOf(fitTarget), margin));
  }
  // 扫完回到这一帧真正要渲的姿态
  pivot.rotation.set(pose.pitch, pose.yaw, pose.tilt);
  pivot.updateMatrixWorld(true);
  const fitBox = boxOf(fitTarget);
  const rad = THREE.MathUtils.degToRad(elev);
  camera.position.set(0, dist * Math.sin(rad), dist * Math.cos(rad));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld(true);

  /*
    **相机距离必须是有限数。** 取景参数写错（键名对不上、除零）时它会是 NaN，
    而 NaN 的相机渲出来是一张**全透明的空图**——不报错、不抛异常，只有「设备不见了」。
    宁可在这里明确失败，也别把空图交给下游。

    报错里要把**量到的包围盒**带上：`NaN` 几乎总是「包围盒是空的」，
    而空的包围盒（`min/max` 是 ±Infinity）光看距离那个数字看不出来。
  */
  if (!Number.isFinite(camera.position.z) || camera.position.z <= 0) {
    /*
      逐个子对象量一遍。空包围盒几乎总是**某一个子对象**把 `NaN` 带了进来
      （`Box3.union` 里 `Math.min(NaN, x)` 是 NaN，于是整组都废了），
      而 `JSON.stringify` 把 `NaN` 和 `Infinity` 都写成 `null`——光看整组的数看不出是谁。
    */
    const kids = fitTarget.children.map((c) => {
      const b = new THREE.Box3().setFromObject(c);
      return `${c.type}(count=${c.count ?? '-'}) min=${b.min.toArray()} max=${b.max.toArray()}`;
    }).join('\n  ');
    window.__error = `相机距离算出来是 ${camera.position.z}（俯角 ${elev}°），`
      + `整组包围盒 ${JSON.stringify({ min: fitBox.min, max: fitBox.max })}。逐个子对象：\n  ${kids}`;
    window.__done = true;
  } else {
    renderer.render(scene, camera);

    // 屏幕可视区四角，顺序：左上、右上、右下、左下。没有屏幕的场景跳过
    let quad = null;
    /*
      卷曲屏走**条带**：每条各自一个四边形，页面里各套一个 `matrix3d`。
      没有 `screenGroup`——条带的坐标本来就写在 `group` 的本地坐标系里。
    */
    let quads = null;
    if (strips) {
      const project = projector(camera, W, H);
      quads = strips.map((c) => c.map((p) => project(p.x, p.y, p.z, group)));
    } else if (screen) {
      /*
        四角要用**屏幕自己那一层**的矩阵投影。笔记本的屏在一个掀起的上盖坐标系里
        （见 `macbook.js`），用机身坐标系会整体偏掉。没有 `screenGroup` 的场景
        （裸机）就用 `group` 自己。
      */
      const frame = screenGroup ?? group;
      const project = projector(camera, W, H);
      const hw = screen.w / 2;
      const hh = screen.h / 2;
      quad = [
        project(-hw, hh, screen.z, frame),
        project(hw, hh, screen.z, frame),
        project(hw, -hh, screen.z, frame),
        project(-hw, -hh, screen.z, frame),
      ];
    }

    const stats = opaqueStats(renderer, W, H);
    window.__result = {
      scene: sceneId,
      pose: poseId,
      quad,
      quads,
      paper: paper ?? null,
      screen: screen ? { w: screen.w, h: screen.h, r: screen.r } : null,
      opaque: stats.count,
      bounds: stats.box,
      shell: renderer.domElement.toDataURL('image/webp', 0.86),
    };
    window.__done = true;
  }
}
