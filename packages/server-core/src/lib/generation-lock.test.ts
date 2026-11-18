import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 环境必须在导入任何模块之前设定（这个模块本身不碰库，但 logger 走同一套 env）
const tmp = mkdtempSync(join(tmpdir(), 'lumen-lock-'));
process.env.NODE_ENV = 'test';
process.env.LUMEN_DB_PATH = join(tmp, 'test.db');
process.env.LUMEN_SECRET_KEY = 'test-secret-key-0123456789abcdefghijklmnop';

const {
  acquireGeneration, acquirePageGeneration, assertGenerationFree, assertPageFree, beatGeneration,
  isGenerating, isStopRequested, manualLeaseCount, manuallyTouchedSlots, releaseGeneration,
  releasePageGeneration, requestStop,
} = await import('./generation-lock.js');

test.after(() => rmSync(tmp, { recursive: true, force: true }));

/**
 * 一个项目同一时刻只允许一条写内容的链路。
 *
 * 这里要验的是两件事：**互斥**（第二条被明确拒掉，不是排队、不是悄悄叠上去），
 * 以及**租期**（卡死的运行不会把项目永远锁住）。
 */

test('同一个项目取两次锁：第二次被拒，且说清是哪条链路在跑', () => {
  acquireGeneration('p1', '生成教案');
  assert.throws(() => acquireGeneration('p1', '生成页面'), /生成教案/, '要报出占着锁的是哪条链路');
  assert.equal(isGenerating('p1'), true);

  releaseGeneration('p1');
  assert.equal(isGenerating('p1'), false, '放掉之后照常能跑');
  acquireGeneration('p1', '生成页面');
  releaseGeneration('p1');
});

test('不同项目互不影响', () => {
  acquireGeneration('p2a', '生成页面');
  acquireGeneration('p2b', '生成教案');
  assert.equal(isGenerating('p2a'), true);
  assert.equal(isGenerating('p2b'), true);
  releaseGeneration('p2a');
  releaseGeneration('p2b');
});

test('assertGenerationFree 只问不取', () => {
  assertGenerationFree('p3');
  assert.equal(isGenerating('p3'), false, '问一句不该把锁取走');
  acquireGeneration('p3', '生成页面');
  assert.throws(() => assertGenerationFree('p3'), /正在生成中/);
  releaseGeneration('p3');
});

test('没取到租的项目上续租是空操作', () => {
  beatGeneration('p4'); // 不该抛
  assert.equal(isGenerating('p4'), false);
});

/**
 * 卡死的运行不会把项目永远锁住。
 *
 * `finally` 只在那段异步函数被唤醒时才跑得起来，而一个卡在永不落定的 await 上的运行
 * 既不抛也不返回——实测踩过一把锁被占着近一小时、期间一次模型调用都没有，
 * 用户看到的是「一直转圈、点不动」。所以除了 `finally` 还有一道租期。
 */
test('超过租期没有任何进展的锁会被接管', (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  acquireGeneration('p5', '生成页面');

  // 还差一分钟到期：仍然拦住
  t.mock.timers.tick(14 * 60 * 1000);
  assert.throws(() => acquireGeneration('p5', '生成提纲'), /正在生成中/);

  // 越过租期：接管
  t.mock.timers.tick(2 * 60 * 1000);
  acquireGeneration('p5', '生成提纲');
  assert.equal(isGenerating('p5'), true);
  releaseGeneration('p5');
});

test('一直在续租的运行不会被抢走——跑得久不等于卡死', (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  acquireGeneration('p6', '生成整本页面');

  // 累计跑 50 分钟，但每隔 10 分钟都有进展
  for (let i = 0; i < 5; i += 1) {
    t.mock.timers.tick(10 * 60 * 1000);
    beatGeneration('p6');
  }

  assert.throws(() => acquireGeneration('p6', '生成提纲'), /正在生成中/, '一本跑得久的书不该被抢');
  releaseGeneration('p6');
});

/**
 * 手动单页与整本并存。
 *
 * 用户报的原始场景：整本生成到一半，某一页没出来，他对着那一页点重试——
 * 原先跟整本抢同一把项目级锁，必然 409，而那正是他此刻最想点的一下。
 */
test('整本跑着时手动单页照样能开', () => {
  acquireGeneration('q1', '生成整本页面');
  acquirePageGeneration('q1', 5, '重跑这一页');
  assert.equal(isGenerating('q1'), true);
  assert.equal(manualLeaseCount('q1'), 1, '手动那一路要算得出来——整本的并发靠它让位');
  assert.equal(manuallyTouchedSlots('q1').has(5), true);

  releasePageGeneration('q1', 5);
  assert.equal(manualLeaseCount('q1'), 0);
  assert.equal(isGenerating('q1'), true, '手动那页放掉了，整本还在跑');

  releaseGeneration('q1');
  assert.equal(isGenerating('q1'), false);
});

test('同一格重复点被拒，别的格照开', () => {
  acquirePageGeneration('q2', 5, '重跑这一页');
  assert.throws(() => acquirePageGeneration('q2', 5, '生成这一页'), /第 6 页正在生成中/);
  assert.throws(() => assertPageFree('q2', 5), /第 6 页正在生成中/);
  // 别的格不受影响——「失败的那几页可以一起重跑」就是靠这条
  acquirePageGeneration('q2', 7, '生成这一页');
  assert.equal(manualLeaseCount('q2'), 2);

  releasePageGeneration('q2', 5);
  releasePageGeneration('q2', 7);
});

test('只有手动单页在跑时，整本也开得了，且那几格已被保护起来', () => {
  acquirePageGeneration('q3', 2, '重跑这一页');
  // 用户点了几页重试之后当然还想点整本，不该被拒
  acquireGeneration('q3', '生成整本页面');
  assert.equal(
    manuallyTouchedSlots('q3').has(2), true,
    '整本一开始就得知道这一格归手动那一路，否则会把它盖回旧的',
  );
  releaseGeneration('q3');
  releasePageGeneration('q3', 2);
  assert.equal(manuallyTouchedSlots('q3').size, 0, '整本收工了，保护名单也该清掉');
});

test('两条整本仍然互斥', () => {
  acquireGeneration('q4', '生成整本页面');
  assert.throws(() => acquireGeneration('q4', '生成提纲'), /生成整本页面/);
  assert.throws(() => assertGenerationFree('q4'), /正在生成中/);
  releaseGeneration('q4');
});

test('手动单页的租约到点自己让位', (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  acquirePageGeneration('q5', 3, '重跑这一页');
  t.mock.timers.tick(16 * 60 * 1000);
  acquirePageGeneration('q5', 3, '重跑这一页'); // 不该抛
  releasePageGeneration('q5', 3);
});

test('手动碰过的槽位活到整本这一轮结束', () => {
  acquireGeneration('q6', '生成整本页面');
  acquirePageGeneration('q6', 4, '重跑这一页');
  releasePageGeneration('q6', 4);
  assert.equal(
    manuallyTouchedSlots('q6').has(4), true,
    '手动那页落完、租约也放了之后整本才轮到它——按「正在跑」判就会漏掉',
  );
  releaseGeneration('q6');
  assert.equal(manuallyTouchedSlots('q6').has(4), false);
});

/**
 * 叫停只对整本有意义。
 *
 * 手动单页短、单条流，停的是它自己那条连接；而「停止」按钮要说清自己停到了什么——
 * 没在跑整本的时候给一句「没在生成」，比给一个假装成功的按钮强。
 */
test('叫停只认整本，且手动取锁不会把它撤销掉', () => {
  acquirePageGeneration('q7', 1, '重跑这一页');
  assert.equal(requestStop('q7'), false, '只有手动单页在跑时，没有整本可停');

  acquireGeneration('q7', '生成整本页面');
  assert.equal(requestStop('q7'), true);
  assert.equal(isStopRequested('q7'), true);

  // 整本正被叫停时，用户重跑一页不该把「停止」悄悄撤销掉
  acquirePageGeneration('q7', 9, '重跑这一页');
  assert.equal(isStopRequested('q7'), true);

  releasePageGeneration('q7', 9);
  releasePageGeneration('q7', 1);
  releaseGeneration('q7');
  assert.equal(isStopRequested('q7'), false, '整本收工，叫停标记跟着清掉');
});

/**
 * 心跳要打在**正确的租约**上。
 *
 * 一律打给「这个项目」的话，一条卡死的整本会被隔壁手动页的心跳一直续着，
 * 15 分钟的租期就永远到不了点——那正是租期要防的事。
 */
test('手动页的续租不会给卡死的整本续命', (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  acquireGeneration('q8', '生成整本页面');
  acquirePageGeneration('q8', 1, '重跑这一页');

  // 整本卡住不动，手动那页一直在续自己的租
  for (let i = 0; i < 4; i += 1) {
    t.mock.timers.tick(5 * 60 * 1000);
    beatGeneration('q8', 1);
  }

  // 整本超过租期没有任何进展 → 后来者接管
  acquireGeneration('q8', '生成提纲');
  releaseGeneration('q8');
  releasePageGeneration('q8', 1);
});
