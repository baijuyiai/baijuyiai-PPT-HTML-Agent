/**
 * 场景的公共装配：渲染器、相机、灯光、环境，以及几个共用的小工具。
 *
 * ## 这里为什么是 `.js` 而不是 `.ts`
 *
 * 这些代码**跑在浏览器里**（无头 Chromium），用 `window` / `document`，而本仓的
 * `tsconfig.base.json` 只给了 `lib: ["ES2023"]`、没有 DOM。要类型检查就得给这个包
 * 单开一套 DOM lib 的配置，还得把 TS 转成 JS 再喂给页面（多一道构建）。
 *
 * 换来的收益只是「渲染代码有类型」——而这部分代码的正确性**只能靠看图判断**，
 * 类型帮不上忙。所以这里就用浏览器原生的 ESM，本地服务直接吐，Node 侧的驱动仍是 TS。
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * 建一个渲染器。
 *
 * `alpha: true` + `setClearColor(0x000000, 0)` 是**透明底的前提**：孔里什么都不画时
 * 才能真的透出后面的界面图。`preserveDrawingBuffer` 是 `toDataURL` 的前提，
 * 少了它可能拿到一张空帧。
 */
export function makeRenderer(width, height) {
  const renderer = new THREE.WebGLRenderer({
    alpha: true, antialias: true, preserveDrawingBuffer: true,
  });
  renderer.setSize(width, height, false);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.body.appendChild(renderer.domElement);
  return renderer;
}

/**
 * 建一套灯光与环境。
 *
 * **环境贴图不能省**：哑光铝与玻璃的质感全在反射里，没有它金属看着就是一块死灰，
 * 整台设备会像纸糊的。`RoomEnvironment` 是 three 自带的室内环境，够用且不必带贴图资源。
 */
export function makeEnvironment(renderer) {
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.85;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x3a3d44, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 2.0);
  key.position.set(-700, 1000, 900);
  scene.add(key);
  // 侧后方一盏补光，勾出机身边缘，不然深色机身在深色底上会糊成一团
  const rim = new THREE.DirectionalLight(0xdfe6ff, 1.4);
  rim.position.set(800, -300, -500);
  scene.add(rim);
  return scene;
}

/**
 * 圆角矩形路径。`THREE.Shape` 与 `THREE.Path` 都能用（前者做外轮廓、后者做孔）。
 *
 * 从 (x+r, y) 起笔、顺时针一圈，四角各一段二次贝塞尔。
 */
export function roundedRect(p, w, h, r) {
  const x = -w / 2;
  const y = -h / 2;
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r); p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y);
  return p;
}

/**
 * 把一组局部坐标点投影成画布像素。顺序由调用方给定，**统一为左上、右上、右下、左下**——
 * `screenMatrix` 要的就是这个顺序。
 *
 * `z` 是屏幕可视区所在的那一层。取「孔在前表面的开口」而不是孔的中间：
 * 界面贴在前表面才与边框齐平，斜视时不会露出孔的内壁。
 */
export function projector(camera, width, height) {
  return (x, y, z, group) => {
    const v = new THREE.Vector3(x, y, z).applyMatrix4(group.matrixWorld).project(camera);
    return { x: (v.x * 0.5 + 0.5) * width, y: (1 - (v.y * 0.5 + 0.5)) * height };
  };
}

/**
 * 数一数画布上有多少不透明像素，并给出这些像素的包围盒。
 *
 * 包围盒是给**界面排版**用的：识别出来的骨架只知道「设备占页面上哪一块」，
 * 把设备塞进去时得知道它在渲染图里**实际占了多大**——渲染图是 900×1200，
 * 而设备只占中间一块，四周全是透明的。不裁掉的话每台设备都会比框小一圈。
 *
 * **像素数是「真的画出了东西」的唯一判据。** 一切正常但相机没对着模型、或灯光全黑时，
 * 出图和现在一模一样；只有这个数能戳破——而它一为 0，下游会得到一张全透明的空图，
 * 页面上就是「设备不见了」，排查起来毫无线索。
 */
export function opaqueStats(renderer, width, height) {
  const gl = renderer.getContext();
  const px = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, px);
  let count = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let row = 0; row < height; row += 1) {
    /*
      **`readPixels` 是自下往上给的**（第 0 行是图像的最下面一行），
      而包围盒要的是图像坐标（左上为原点），所以这里翻一下 y。
      忘了翻的症状是「裁出来的图上下颠倒了」，但那要等到页面里才看得出来。
    */
    const y = height - 1 - row;
    const base = row * width * 4;
    for (let x = 0; x < width; x += 1) {
      if (px[base + x * 4 + 3] <= 8) continue;
      count += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const box = maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  return { count, box };
}

/**
 * 屏幕挡板：**只写深度、不写颜色**的一块平面。
 *
 * ## 为什么必须有它
 *
 * 机身是「带孔的挤出框」，孔里什么都不画——这样出图之后孔是透明的，界面图才能从后面
 * 填进来。但**孔是通的**，于是手机背后的一切（摄像头凸台、握持的手）都会从这个孔里
 * 透出来，在页面上盖住界面图。真机的背是实的，不会有这回事。
 *
 * 修法不是把背补上（补上孔就不透明了，界面图也进不来），而是插一块 `colorWrite: false`
 * 的平面：它**写深度、不写颜色**，后面比它远的物体在深度测试里被拒掉，而颜色缓冲
 * 保持透明。于是「孔后面的东西看不见」与「孔是透明的」同时成立。
 *
 * **`renderOrder = -1` 不能省。** 不写颜色意味着它**擦不掉已经画上的东西**——它只能挡住
 * 之后画的。而 three 对不透明物体的排序在 `material.id` 那一层就分开了（`painterSortStable`
 * 先比 groupOrder、renderOrder，再比 material.id，最后才比深度），不同材质之间根本不按
 * 远近排。挡板与机身、凸台各是各的材质，谁先画是随机的——凸台先画的话，它那一块颜色
 * 就留在屏幕里了。`renderOrder` 是排序的第二关键字，压到 -1 就一定最先画。
 */
export function screenBlocker(w, h, z) {
  const blocker = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ colorWrite: false }),
  );
  blocker.position.z = z;
  blocker.renderOrder = -1;
  blocker.name = 'screen-blocker';
  return blocker;
}

/**
 * 按**包围盒的八个角点**逐个反解相机距离，取最大值。
 *
 * ## 为什么不能拿「包围盒尺寸 ÷ 视场角」直接算
 *
 * 那样等于把尺寸当成「在 `z = 0` 平面上的一个矩形」。但物体是有厚度的：
 * 一台笔记本的包围盒 z 跨度 1700，正对镜头那一面比中心近 850。
 * 相机在 4971 处时，那一面在 4121，**投影比在 z=0 处大 20%**——
 * 于是「正视图刚好、一转到 3/4 角右边就被裁掉」。
 *
 * 这个错误很隐蔽：尺寸量对了、旋转也量进去了，只有「深度带来的透视放大」被漏掉，
 * 而它恰好只在大角度下才显形。
 *
 * 判据是逐点的：相机在 `(0, 0, D)` 朝 `−Z`，点 `(x, y, z)` 落在画面内要满足
 * `|x| ≤ (D − z)·tan(hFov/2)`，即 `D ≥ z + |x| / tan(hFov/2)`；纵向同理。
 * 八个角点各算一遍取最大，就是「刚好装下」的距离。
 */
export function frameBox(camera, box, margin = 1.1) {
  const tv = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const th = tv * camera.aspect;
  let d = 0;
  for (let i = 0; i < 8; i += 1) {
    const x = (i & 1) ? box.max.x : box.min.x;
    const y = (i & 2) ? box.max.y : box.min.y;
    const z = (i & 4) ? box.max.z : box.min.z;
    d = Math.max(d, z + Math.abs(x) / th, z + Math.abs(y) / tv);
  }
  return d * margin;
}
