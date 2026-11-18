import test from 'node:test';
import assert from 'node:assert/strict';
import { stepState } from './step-progress.js';

/** 与识别风格的五个阶段同序，但测试不依赖那个数组——helper 对任何顺序表都成立 */
const ORDER = ['split', 'read', 'synth', 'derive', 'mock'] as const;
type Step = (typeof ORDER)[number];

test('还没收到进度时，每一步都是待跑，既不亮也不算跑完', () => {
  for (const k of ORDER) {
    assert.equal(stepState(ORDER, k, null), 'pending');
    assert.equal(stepState(ORDER, k, undefined), 'pending');
  }
});

test('进度停在第一步时，只有第一步在跑', () => {
  assert.equal(stepState(ORDER, 'split', 'split'), 'active');
  assert.equal(stepState(ORDER, 'read', 'split'), 'pending');
  assert.equal(stepState(ORDER, 'mock', 'split'), 'pending');
});

test('进度走到中间时，前面算跑完、当前算在跑、后面算待跑', () => {
  assert.equal(stepState(ORDER, 'split', 'synth'), 'passed');
  assert.equal(stepState(ORDER, 'read', 'synth'), 'passed');
  assert.equal(stepState(ORDER, 'synth', 'synth'), 'active');
  assert.equal(stepState(ORDER, 'derive', 'synth'), 'pending');
  assert.equal(stepState(ORDER, 'mock', 'synth'), 'pending');
});

test('进度走到最后一步时，前面四步全算跑完', () => {
  assert.equal(stepState(ORDER, 'mock', 'mock'), 'active');
  for (const k of ORDER.slice(0, 4)) {
    assert.equal(stepState(ORDER, k, 'mock'), 'passed', `${k} 应算跑完`);
  }
});

test('服务端发了顺序表里没有的阶段名时一律按待跑处理，不会把没跑的错标成跑完', () => {
  // 服务端加了新阶段而前端还没跟上时的兜底：宁可一个都不亮，也不能谎报进度
  for (const k of ORDER) {
    assert.equal(stepState(ORDER, k, 'brand-new-step'), 'pending');
  }
});

test('顺序表里没有这个 key 时同样按待跑处理', () => {
  const steps = ['a', 'b'] as const;
  assert.equal(stepState(steps, 'zzz' as Step, 'a'), 'pending');
});
