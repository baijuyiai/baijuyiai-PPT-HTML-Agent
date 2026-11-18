/**
 * 把人像抠图归一化到统一取景。
 *
 * ## 为什么需要这一步
 *
 * 那批抠图是拼来的，人物在 512 画框里的**位置与大小差得很多**：实测头顶落在
 * 画框高的 5.3%～37.5%，身高落在 51.2%～91.8%。版式那边用的是**固定裁切窗口**
 * （见 `ir-schema/src/people-skeletons.ts` 的三档），窗口固定而素材不齐，结果就是
 * 同一排头像里有人露头有人露肩、头大大小小——「头像大小不一样」是这么来的。
 *
 * 归一化只做一件事：**把每个人物的包围盒搬到画框里同一个位置、同一个大小**。
 * 之后固定窗口对谁都成立，版式那边一个像素都不用改。
 *
 * ## 为什么按包围盒，不按头
 *
 * 按头最准，但**测不准**。试过「跟着最上面那段连通域往下走、找脖子的宽度极小」，
 * 59 张只检出 39 张，而且常把腰当成脖子（长发、围巾、连帽衫把头和肩连成一片，
 * 轮廓根本不收窄）。包围盒是确定的，所以按它来。
 *
 * 代价是**坐姿的人会显得头大**：包围盒矮，放大到统一身高，头就跟着放大了。
 * 所以坐姿、以及「举手的胳膊高过头顶」那种包围盒顶端不是头的，一律排除，
 * 不进人像池——名单在 `src/index.ts` 的 `PEOPLE_PORTRAIT_EXCLUDED`，
 * **这个脚本与运行时读的是同一份**，不会漂。
 *
 * ## 怎么跑
 *
 * ```
 * pnpm --filter @lumen/stock-library normalize-people
 * ```
 *
 * **可以重复跑**：已经归一化过的图，包围盒正好落在目标上，再跑一次是恒等变换。
 * 原图在 git 里，跑坏了 `git checkout -- packages/stock-library/assets` 就回来了。
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PEOPLE_PORTRAIT_EXCLUDED } from '../src/index.js';
import { decodePng, encodePng, type RgbaImage } from '../src/png-codec.js';

const ASSETS = path.resolve(fileURLToPath(new URL('../assets', import.meta.url)));

/**
 * 归一化目标：人物包围盒的顶端与高度，都按画框高的比例算。
 *
 * ## 为什么按取景分两套
 *
 * 素材分两套取景（文件名前缀 `people-head-` / `people-half-`），图位会声明自己要哪种：
 *
 * - `head` 头肩特写。包围盒就是头到肩。
 * - `half` 头到腰 / 头到胯。
 *
 * 两套各自归一化到「包围盒占满画框」，**同一套里每张的取景就完全一致**——
 * 这是「头像位真的取到头」的落点。配上 `object-fit: contain`（那条 `!important`
 * 规则），人物自动按画框高度撑满，骨架连裁切偏移都不用写。
 *
 * ## 老素材那条
 *
 * `people-<族裔>-<性别>-<序号>.png` 那批是站姿全身，仍按 15% / 74% 归一化——
 * 它们已经被回收站下架，但文件还在（已生成的老页面还要渲染），所以这里不能不管。
 */
function targetsFor(file: string): { top: number; h: number } {
  if (file.startsWith('people-head-')) return { top: 0.04, h: 0.92 };
  if (file.startsWith('people-half-')) return { top: 0.04, h: 0.92 };
  return { top: 0.15, h: 0.74 };
}

/** 兼容旧签名：老素材那条路的默认目标 */
const TARGET_TOP = 0.15;
const TARGET_H = 0.74;

/* ---------------- 归一化 ---------------- */

/** 透明像素下面藏着的颜色是垃圾，插值必须**先乘 alpha**，否则边缘会渗出杂色 */
function samplePremul(img: RgbaImage, sx: number, sy: number, out: number[]): void {
  const x0 = Math.floor(sx), y0 = Math.floor(sy);
  const fx = sx - x0, fy = sy - y0;
  const { width, height, data } = img;
  const acc = [0, 0, 0, 0];
  const taps: [number, number, number][] = [
    [0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy],
  ];
  for (const [dx, dy, w] of taps) {
    if (w === 0) continue;
    const x = x0 + dx, y = y0 + dy;
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const i = (y * width + x) * 4;
    const a = data[i + 3]! / 255;
    acc[0] = acc[0]! + data[i]! * a * w;
    acc[1] = acc[1]! + data[i + 1]! * a * w;
    acc[2] = acc[2]! + data[i + 2]! * a * w;
    acc[3] = acc[3]! + a * w;
  }
  if (acc[3]! <= 0.0001) { out[0] = out[1] = out[2] = out[3] = 0; return; }
  out[0] = Math.round(acc[0]! / acc[3]!);
  out[1] = Math.round(acc[1]! / acc[3]!);
  out[2] = Math.round(acc[2]! / acc[3]!);
  out[3] = Math.round(Math.min(1, acc[3]!) * 255);
}

interface Box { top: number; left: number; w: number; h: number }

/** 不透明像素的包围盒。alpha 阈值取 16，与 `analyze.ts` 里那一套一致 */
export function alphaBox(img: RgbaImage): Box | null {
  const { width, height, data } = img;
  let top = -1, bottom = -1, left = width, right = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3]! > 16) {
        if (top < 0) top = y;
        bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }
  return top < 0 ? null : { top, left, w: right - left + 1, h: bottom - top + 1 };
}

/** 归一化一张。返回一句给人看的说明 */
export function normalizeOne(file: string, img: RgbaImage): { image: RgbaImage; note: string } | null {
  const box = alphaBox(img);
  if (!box) return null;
  const { top: TARGET_TOP, h: TARGET_H } = targetsFor(file);
  const pct = (v: number) => (v / img.height * 100).toFixed(1);

  const k = (TARGET_H * img.height) / box.h;
  const dstTop = TARGET_TOP * img.height;

  /**
   * 横向以**头部**居中，不是以整个包围盒居中。
   *
   * 包围盒中心只在「人站直、两臂贴身」时才等于头部中心。有人一条胳膊伸出去，
   * 包围盒就往那边偏，人像位里这个人就贴到边上去了——实测铺出来一排头像东倒西歪。
   * 取人物顶端一小段（站立的人头就在这段里）的横向中点当中心。
   */
  const headBand = Math.max(6, Math.round(box.h * 0.12));
  let hxMin = img.width, hxMax = -1;
  for (let y = box.top; y < Math.min(box.top + headBand, img.height); y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3]! > 16) {
        if (x < hxMin) hxMin = x;
        if (x > hxMax) hxMax = x;
      }
    }
  }
  const headCx = hxMax < 0 ? box.left + box.w / 2 : (hxMin + hxMax) / 2;

  // 源 → 目标： dst = dstLeft + (src - box.left) * k ，且要求 headCx 落在画框正中
  const dstLeft = img.width / 2 - (headCx - box.left) * k;

  const out = Buffer.alloc(img.width * img.height * 4);
  const px = [0, 0, 0, 0];
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const sx = box.left + (x - dstLeft) / k;
      const sy = box.top + (y - dstTop) / k;
      if (sx < -1 || sy < -1 || sx > img.width || sy > img.height) continue;
      samplePremul(img, sx, sy, px);
      const i = (y * img.width + x) * 4;
      out[i] = px[0]!; out[i + 1] = px[1]!; out[i + 2] = px[2]!; out[i + 3] = px[3]!;
    }
  }
  return {
    image: { width: img.width, height: img.height, data: out },
    note: `k=${k.toFixed(3)} top ${pct(box.top)}%→${(TARGET_TOP * 100).toFixed(0)}% h ${pct(box.h)}%→${(TARGET_H * 100).toFixed(0)}%`,
  };
}

// 只有直接跑这个文件才动素材。被 import（比如测试要拿编解码器）时什么都不做
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = readdirSync(ASSETS).filter((f) => /^people-.*\.png$/i.test(f)).sort();
  for (const f of files) {
    if (PEOPLE_PORTRAIT_EXCLUDED.has(f)) { console.log(f.padEnd(26), '排除（不改）'); continue; }
    const img = decodePng(readFileSync(path.join(ASSETS, f)));
    const r = normalizeOne(f, img);
    if (!r) { console.log(f.padEnd(26), '全透明，跳过'); continue; }
    writeFileSync(path.join(ASSETS, f), encodePng(r.image));
    console.log(f.padEnd(26), r.note);
  }
  console.log(`\n共 ${files.length} 张，排除 ${PEOPLE_PORTRAIT_EXCLUDED.size} 张`);
}
