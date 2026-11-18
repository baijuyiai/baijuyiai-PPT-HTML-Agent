/**
 * 把**渲染好的设备**塞进识别出来的版式骨架里。
 *
 * ## 为什么识别出来的骨架里没有设备
 *
 * 图文 / 人物排版那两套，模型照参考图把版面写出来就行——照片由素材库填。界面排版不一样：
 * 参考图里那台手机/笔记本是**我们自己在 three.js 里渲的**，识别器照参考图画一台出来
 * 只会是另一台（比例、厚度、屏幕倾角全对不上），而屏幕四角的坐标变换更是算出来的、
 * 画不出来。
 *
 * 所以识别器只写**版面**，在设备该在的位置留一个空框：
 *
 * ```html
 * <div class="ui-dev-slot" data-device="phone" style="position:absolute;left:…;top:…;width:…px;height:…px"></div>
 * ```
 *
 * 这个模块把空框换成真设备：外壳转动图 + 屏幕的 `matrix3d` + 悬停时序，一样不少。
 *
 * ## 坐标怎么对齐
 *
 * 渲染是 900×1200 的画布，而设备只占中间一块，四周透明。转动图在渲染那一步已经
 * **按不透明像素的包围盒裁过**（见 `render.ts` 的 `turnSheet`），清单里带着那个盒子。
 * 这里按 `min(框宽/盒宽, 框高/盒高)` 缩放并居中——用「装得下」而不是「铺满」，
 * 识别出来的框长宽比和设备的对不上时，宁可留白也不要拉伸。
 *
 * 外壳图裁过、屏幕四角没裁，所以外壳那层按 `box` 的偏移摆回 900×1200 里的原位，
 * 屏幕四角就能照原样用。
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { screenMatrix, overscan, type Quad } from '../../packages/device-models/src/quad.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');

const MANIFEST = path.join(ROOT, 'packages/device-models/assets/devices.json');

/** 转一圈用多久。与渲染那侧的帧数一起决定转动感，见 `recognize-ui-layouts.ts` */
const TURN = 0.45;

/** 界面上显示的名字 → 设备清单里的场景 id */
export const DEVICE_OF_GROUP: Record<string, string> = {
  phone: 'iphone',
  laptop: 'macbook',
  display: 'display',
};

interface DeviceEntry {
  sprite: string;
  box: { x: number; y: number; w: number; h: number };
  screen: { w: number; h: number; r: number } | null;
  poses: { id: string; quad: Quad }[];
}

interface Manifest {
  stage: { w: number; h: number };
  devices: Record<string, DeviceEntry>;
}

let cached: Manifest | null = null;
export function deviceManifest(): Manifest {
  if (!cached) cached = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest;
  return cached;
}

/** 一个设备空框的整个开标签。属性顺序不定，所以整段抓下来再逐个取 */
const SLOT_TAG_RE = /<div\b[^>]*\bclass\s*=\s*"[^"]*\bui-dev-slot\b[^"]*"[^>]*>/gi;

export interface FoundSlot {
  /** 开标签原文 */
  tag: string;
  device: string;
  style: string;
}

/** 骨架里所有的设备空框，按出现顺序 */
export function slotsIn(skeleton: string): FoundSlot[] {
  return [...skeleton.matchAll(SLOT_TAG_RE)].map((m) => ({
    tag: m[0],
    device: (/data-device\s*=\s*"([^"]*)"/i.exec(m[0])?.[1] ?? '').trim().toLowerCase(),
    style: /style\s*=\s*"([^"]*)"/i.exec(m[0])?.[1] ?? '',
  }));
}

/**
 * 把骨架里的空框全换成真设备，并把设备要用的 CSS 并进它自己的 `<style>` 块。
 *
 * 返回 `devices` 是为了让调用方知道「这一份用的哪几台设备」——`group` 与 `scene`
 * 两个字段要写进生成文件里。
 */
export function injectDevices(skeleton: string): { html: string; devices: { group: string; scene: string }[] } {
  const devices: { group: string; scene: string }[] = [];
  const css: string[] = [];
  let i = 0;

  const html = skeleton.replace(SLOT_TAG_RE, (tag) => {
    i += 1;
    const group = (/data-device\s*=\s*"([^"]*)"/i.exec(tag)?.[1] ?? '').trim().toLowerCase();
    const style = /style\s*=\s*"([^"]*)"/i.exec(tag)?.[1] ?? '';
    // 一个设备屏幕占一个图位，编号从 1 起、与设备序号一致
    const out = injectDevice({ group, slotStyle: style, index: i, imageSlot: i });
    css.push(out.css);
    devices.push({ group, scene: DEVICE_OF_GROUP[group]! });
    return out.html;
  });

  /*
    设备 CSS 并进骨架**自己的** `<style>` 里，而不是另起一块。
    另起一块的话，`stripFontFamily` 那一类后处理、以及以后任何「按 style 块扫一遍」的
    逻辑，都会漏掉它。
  */
  const withCss = css.length > 0
    ? html.replace(/<\/style>/i, `${css.join('')}</style>`)
    : html;

  return { html: withCss, devices };
}

/**
 * 从槽位的行内样式里读出 `width` / `height`（像素）。
 *
 * 读不出来就抛：识别器写了个没有尺寸的框，塞进去的设备会缩成 0 或者撑满整页，
 * 而两种都是「页面上看着不对劲、但没有任何报错」。
 */
function sizeOf(style: string, slot: string): { w: number; h: number } {
  const w = /(?:^|;)\s*width\s*:\s*([\d.]+)px/i.exec(style)?.[1];
  const h = /(?:^|;)\s*height\s*:\s*([\d.]+)px/i.exec(style)?.[1];
  if (!w || !h) throw new Error(`设备槽位「${slot}」的样式里没有 width/height（px）：${style}`);
  return { w: Number(w), h: Number(h) };
}

export interface Injected {
  /** 换掉槽位之后的 HTML 片段 */
  html: string;
  /** 这份设备要用到的 CSS。多个设备时按索引各一套 */
  css: string;
}

/**
 * 把一个设备槽位换成真设备。
 *
 * `index` 从 1 起，用来给类名与图位编号去重——一页里放两台设备时，
 * 两套 `matrix3d` 与两个 `data-lumen-image` 不能撞。
 */
export function injectDevice(opts: {
  group: string;
  slotStyle: string;
  index: number;
  /** 这个设备的屏幕是第几个图位 */
  imageSlot: number;
}): Injected {
  const scene = DEVICE_OF_GROUP[opts.group];
  if (!scene) throw new Error(`没有叫「${opts.group}」的设备，只有 ${Object.keys(DEVICE_OF_GROUP).join(' / ')}`);
  const d = deviceManifest().devices[scene];
  if (!d) throw new Error(`设备清单里没有「${scene}」，先跑一次 render + prepare-devices`);
  if (!d.screen) throw new Error(`「${scene}」没有屏幕数据`);

  const { w: sw, h: sh, r: sr } = d.screen;
  const n = d.poses.length;
  const { w: slotW, h: slotH } = sizeOf(opts.slotStyle, opts.group);
  const i = opts.index;

  // 按包围盒缩放并居中：用「装得下」而不是「铺满」，长宽比对不上时宁可留白
  const k = Math.min(slotW / d.box.w, slotH / d.box.h);
  const left = slotW / 2 - (d.box.x + d.box.w / 2) * k;
  const top = slotH / 2 - (d.box.y + d.box.h / 2) * k;

  const matrix = (q: Quad) => screenMatrix(sw, sh, overscan(q, 1.02));
  const front = d.poses[0]!.quad;
  const hero = d.poses[n - 1]!.quad;
  const radius = Math.round(sr * (sw / d.screen.w));

  const html = `<div class="ui-dev ui-dev-${i}" style="${opts.slotStyle}">`
    + `<div class="ui-stage ui-stage-${i}">`
    + `<div class="ui-screen ui-screen-${i}"><img data-lumen-image="${opts.imageSlot}"></div>`
    + `<div class="ui-shell ui-shell-${i}"></div>`
    + '</div></div>';

  const css = [
    /*
      **页面是静态的，除了设备谁都不该吃鼠标。**

      装饰层（大词标、光晕、网格）和文字块经常压在设备上面——这是排版要的。
      但它们同时也把 `:hover` 吃掉了：`:hover` 只作用于「指针下那个元素及其祖先」，
      压在设备上的 `.mega` 不是 `.ui-dev` 的后代，于是**鼠标滑到设备上什么都不动**。
      实测 37 份里有 8 份是这样（`mega` / `bigword` / `hs-word` / `fade` / `glow` / 标题文字）。

      这些页面里没有任何可点、可编辑的东西（`lintMockHtml` 本来就不许 `<a>` 与 `on*`），
      所以把指针事件一律关掉、只留给设备，既修好了 hover，也不会误伤。
      **压在设备前面**的毛玻璃卡片同样受益——它本来就不该拦鼠标。
    */
    '*{pointer-events:none}',
    `.ui-dev-${i},.ui-dev-${i} *{pointer-events:auto}`,
    // 槽位的定位样式照原样留着，所以这一层只管把舞台摆到正确的位置与缩放
    `.ui-stage-${i}{position:absolute;left:${left.toFixed(1)}px;top:${top.toFixed(1)}px;`,
    `width:${deviceManifest().stage.w}px;height:${deviceManifest().stage.h}px;`,
    `transform:scale(${k.toFixed(5)});transform-origin:top left}`,
    /*
      屏幕跟着机身**一起步进**，用同一条 `steps()`。让屏幕平滑插值、机身硬切的话，
      两者会差半帧，看着像屏幕在机身上滑。
      **矩阵必须写在样式里，不能写到元素的 style 属性上**：行内样式压得过类选择器，
      那样下面那条 `:hover` 永远不生效，机身转了屏幕还停在正面。
    */
    `.ui-screen-${i}{position:absolute;left:0;top:0;width:${sw}px;height:${sh}px;`,
    `border-radius:${radius}px;transform-origin:0 0;transform:${matrix(front)};`,
    `transition:transform ${TURN}s steps(${n - 1}, end)}`,
    `.ui-screen-${i} img{width:100%;height:100%;object-fit:cover;display:block}`,
    `.ui-dev-${i}:hover .ui-screen-${i}{transform:${matrix(hero)}}`,
    /*
      外壳是**一张竖着拼起来的长图**，靠 `background-position` 步进翻页。
      任一时刻只有一个姿态在画面上——**硬切**。叠九个元素做 `opacity` 过渡的话，
      两个姿态会同时出现（哪怕各半），读起来就是「淡入淡出」而不是转动。
      正反两个方向由同一条 transition 负责：移开鼠标时 `steps()` 反向走一遍。
    */
    `.ui-shell-${i}{position:absolute;left:${d.box.x}px;top:${d.box.y}px;`,
    `width:${d.box.w}px;height:${d.box.h}px;`,
    `background-image:url(${d.sprite});background-repeat:no-repeat;`,
    `background-size:${d.box.w}px ${d.box.h * n}px;background-position:0 0;`,
    `transition:background-position ${TURN}s steps(${n - 1}, end)}`,
    `.ui-dev-${i}:hover .ui-shell-${i}{background-position:0 ${-d.box.h * (n - 1)}px}`,
    // 悬停时整台设备抬一点、**并放大一丁点**——「鼠标滑上去有位移」那一下
    /*
      **放大这一档是必须的。** 转动本身会让设备看起来**变小**（转到 3/4 角时投影变窄、
      包围盒变大相机会退），渲染那侧已经把「每帧独立取景」改成「整张姿态表取最大距离」
      压住了大半，但转过去之后终究比正面窄一些。补一点放大，观感才是「转过来」而不是「缩回去」。
      1.04 是**看着不假**的上限——再大就像卡片被掀起来了。
    */
    `.ui-dev-${i}{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),`,
    `scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}`,
    `.ui-dev-${i}:hover{translate:0 -16px;scale:1.04}`,
    `@media (prefers-reduced-motion: reduce){.ui-dev-${i},.ui-screen-${i},.ui-shell-${i}{transition:none}}`,
  ].join('');

  return { html, css };
}
