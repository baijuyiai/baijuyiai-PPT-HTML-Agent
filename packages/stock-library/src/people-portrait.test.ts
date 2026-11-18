import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PEOPLE_PORTRAIT_EXCLUDED, peoplePool } from './index.js';
import { alphaBox } from '../scripts/normalize-people.js';
import { decodePng } from './png-codec.js';

/**
 * 人像素材必须**取景统一，而且分组正确**。
 *
 * ## 为什么要统一
 *
 * 同一排头像里有人露头有人露肩、头大大小小，根源就是素材本身取景不齐。
 * 归一化由 `packages/stock-library/scripts/normalize-people.ts` 做，这条测试钉它的产物：
 * 谁往 assets 里塞一张没归一化的图，或者谁把归一化脚本改坏了，这里当场红。
 *
 * ## 为什么还要钉分组
 *
 * 图位用 `data-lumen-cutout="head" | "half"` 声明取景，配图时从对应池子挑
 * （见 `index.ts` 的 `peoplePoolOf`）。**「头像位真的取到头」靠的是这个分组，
 * 不是骨架里写死的百分比裁切**——后者在源图姿势不齐时必然落偏。
 *
 * 分组靠 alpha 包围盒的 `h/w` 判：头肩轮廓比肩宽略高（1.2–1.7），
 * 头到腰 / 头到胯是 1.8–2.8。**这个判据是量出来的**，不是拍的——
 * 挑素材的脚本 `apps/worker/scratch/classify-portraits.mts` 用的是同一套阈值。
 * 一组里混进别的取景，页面上就是「头像位给了一张头到膝盖的图」。
 */

const ASSETS = path.resolve(fileURLToPath(new URL('../assets', import.meta.url)));

/** 归一化目标，与 `normalize-people.ts` 的 `targetsFor` 一致 */
const TARGET = {
  /** 新的两套取景：包围盒占满画框 */
  framed: { top: 0.04, h: 0.92 },
  /** 老那批站姿全身。已被回收站下架，但文件还在（老页面还要渲染） */
  legacy: { top: 0.15, h: 0.74 },
};
/** 重采样会让边缘的 alpha 掉到阈值以下，包围盒因此会缩一点点，留 3 个点的余量 */
const TOL = 0.03;

const files = readdirSync(ASSETS).filter((f) => /^people-.*\.png$/i.test(f)).sort();
const headFiles = files.filter((f) => /^people-head-\d+\.png$/.test(f));
const halfFiles = files.filter((f) => /^people-half-\d+\.png$/.test(f));
const legacyFiles = files.filter((f) => !/^people-(head|half)-\d+\.png$/.test(f));

const boxOf = (f: string) => {
  const img = decodePng(readFileSync(path.join(ASSETS, f)));
  const box = alphaBox(img);
  assert.ok(box, `${f} 整张都是透明的`);
  return { img, box };
};

test('人像素材的取景是统一的', () => {
  assert.ok(files.length > 0, 'assets 里一张 people 抠图都没有');
  const bad: string[] = [];
  for (const f of files) {
    if (PEOPLE_PORTRAIT_EXCLUDED.has(f)) continue;
    const { img, box } = boxOf(f);
    const want = headFiles.includes(f) || halfFiles.includes(f) ? TARGET.framed : TARGET.legacy;
    const top = box.top / img.height;
    const h = box.h / img.height;
    if (Math.abs(top - want.top) > TOL || Math.abs(h - want.h) > TOL) {
      bad.push(`${f}: 头顶 ${(top * 100).toFixed(1)}% 身高 ${(h * 100).toFixed(1)}%`);
    }
  }
  assert.deepEqual(
    bad, [],
    '这些人像素材的取景没对齐——跑 `pnpm --filter @lumen/stock-library normalize-people` 重新归一化',
  );
});

test('头肩组与半身组各自都在自己的取景区间里', () => {
  assert.ok(headFiles.length >= 8, `头肩组只有 ${headFiles.length} 张，太少`);
  assert.ok(halfFiles.length >= 8, `半身组只有 ${halfFiles.length} 张，太少`);

  const bad: string[] = [];
  for (const [f, lo, hi] of [
    ...headFiles.map((f) => [f, 1.0, 1.8] as const),
    ...halfFiles.map((f) => [f, 1.6, 3.0] as const),
  ]) {
    const { box } = boxOf(f);
    const ratio = box.h / box.w;
    if (ratio < lo || ratio > hi) {
      bad.push(`${f}: h/w=${ratio.toFixed(2)}，应在 ${lo}–${hi}`);
    }
  }
  assert.deepEqual(
    bad, [],
    '分组里的取景串了——头肩组混进了半身、或反过来。'
    + '挑素材要用 apps/worker/scratch/classify-portraits.mts 量，不要用眼睛看缩略图',
  );
});

test('不适合当人像的素材不进人像池', () => {
  const picked = new Set(peoplePool().map((p) => p.file));
  for (const f of PEOPLE_PORTRAIT_EXCLUDED) {
    assert.ok(!picked.has(f), `${f} 被排除了却还在人像池里`);
  }
  assert.ok(picked.size >= 30, `人像池只剩 ${picked.size} 张，太少了——排除名单是不是加过头了`);
});
