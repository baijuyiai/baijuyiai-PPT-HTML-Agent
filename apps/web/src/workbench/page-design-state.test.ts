import test from 'node:test';
import assert from 'node:assert/strict';
import { duration, pageDesignStage, type StageInput } from './page-design-state.js';

/**
 * 状态条上说「现在是什么状况」的那一个判断。
 *
 * 这一份要钉住的是**两条会让状态条说谎的次序**：
 *
 * 1. 整本跑到最后一页、那一页刚落库但流还没收尾时，`readyCount === outlineCount` 已经成立——
 *    先判 `done` 就会在还在跑的时候说「全部完成」。
 * 2. 用户单独重跑一页（比如失败的那一页）时不置 `generating`——只看它，
 *    那一刻状态条会显示「全部完成」，而有一页正在写。
 */

const base: StageInput = {
  outlineCount: 18, readyCount: 0, failedCount: 0, generating: false, liveCount: 0,
};
const stage = (over: Partial<StageInput>) => pageDesignStage({ ...base, ...over });

test('一条大纲都没有：先指回去写大纲，不说生成', () => {
  assert.equal(stage({ outlineCount: 0 }), 'no-outline');
  // 连「在跑」都压不过它：没有大纲就没有可生成的东西，跑着的那条流也不是这一本的
  assert.equal(stage({ outlineCount: 0, generating: true }), 'no-outline');
});

test('有纲、一页都没做：待开始', () => {
  assert.equal(stage({}), 'idle');
});

test('整本在跑：跑着，哪怕一页都还没落库', () => {
  assert.equal(stage({ generating: true }), 'running');
  assert.equal(stage({ generating: true, readyCount: 12, failedCount: 1 }), 'running');
});

test('整本跑到最后一页还没收尾时不报「全部完成」', () => {
  // 最后一页刚落库：ready 已经等于 outlineCount，但那条流还在跑
  assert.equal(stage({ readyCount: 18, generating: true }), 'running');
  // 流收尾之后才是完成
  assert.equal(stage({ readyCount: 18, generating: false }), 'done');
});

test('单页重生成时不置 generating，但状态条要说在跑', () => {
  // 18 页全好了，用户对第 7 页点「重试」
  assert.equal(stage({ readyCount: 18, liveCount: 1 }), 'running');
  // 一页没成功时重跑那一页，同样是「在跑」而不是「还有 17 页没出来」
  assert.equal(stage({ readyCount: 17, liveCount: 1 }), 'running');
});

test('停下来但没齐：说差几页，不是「重新生成」', () => {
  assert.equal(stage({ readyCount: 12, failedCount: 2 }), 'partial');
  // 一页都没成功过（全失败）也算「停在半路」，而不是「还没开始」
  assert.equal(stage({ failedCount: 3 }), 'partial');
});

test('全部就绪才算完成', () => {
  assert.equal(stage({ readyCount: 17, failedCount: 1 }), 'partial');
  assert.equal(stage({ readyCount: 18 }), 'done');
});

test('时长：整分整时不拖一个 0', () => {
  assert.equal(duration(0), '0 秒');
  assert.equal(duration(48), '48 秒');
  assert.equal(duration(59), '59 秒');
  assert.equal(duration(60), '1 分');
  assert.equal(duration(200), '3 分 20 秒');
  assert.equal(duration(3600), '1 小时');
  assert.equal(duration(3900), '1 小时 5 分');
});
