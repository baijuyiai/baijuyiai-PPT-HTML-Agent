import test from 'node:test';
import assert from 'node:assert/strict';
import { MOTION_PINNED, MotionName, StyleFamily } from '@lumen/ir-schema';
import { FAMILY_MOTION_WHITELIST, isMotionAllowed, assertMotionAllowed } from './whitelist.js';
import { motionVariants, PAGE_FLIP_MS, UI_TRANSITION_MS, SKELETON_PULSE_MS } from './variants.js';
import { prefersReducedMotion } from './reduced-motion.js';
import {
  ENTER_ANIMATION, EXIT_ANIMATION, animationCss, isMotionPinned, resolveMotion,
} from './transitions.js';

const ALL_MOTIONS = [...MotionName.options] as MotionName[];
const ALL_FAMILIES = [...StyleFamily.options] as StyleFamily[];

test('business-classic 不允许 scaleIn，assertMotionAllowed 抛错且信息含 MOTION_NOT_ALLOWED', () => {
  assert.equal(isMotionAllowed('business-classic', 'scaleIn'), false);
  assert.throws(() => assertMotionAllowed('business-classic', 'scaleIn'), /MOTION_NOT_ALLOWED/);
});

test('brand-design 允许 scaleIn', () => {
  assert.equal(isMotionAllowed('brand-design', 'scaleIn'), true);
  assert.doesNotThrow(() => assertMotionAllowed('brand-design', 'scaleIn'));
});

test('每个 MotionName 都能生成 variants，时长落在允许档位', () => {
  const allowed = new Set([0, 0.15, 0.2, 0.25]);
  for (const name of ALL_MOTIONS) {
    const v = motionVariants(name);
    assert.ok(allowed.has(v.transition.duration), `${name} 时长 ${v.transition.duration} 不在允许档位`);
    assert.deepEqual(v.transition.ease, [0.2, 0, 0, 1], `${name} 缓动必须是 ease-out`);
    assert.equal(typeof v.initial, 'object');
    assert.equal(typeof v.animate, 'object');
  }
});

test('none 返回空 initial/animate 且时长为 0', () => {
  const v = motionVariants('none');
  assert.deepEqual(v.initial, {});
  assert.deepEqual(v.animate, {});
  assert.equal(v.transition.duration, 0);
});

test('所有 variants 的 transition 不含 spring / bounce 弹跳', () => {
  for (const name of ALL_MOTIONS) {
    const v = motionVariants(name);
    const serialized = JSON.stringify(v);
    assert.ok(!serialized.includes('spring'), `${name} 含 spring`);
    assert.ok(!serialized.includes('bounce'), `${name} 含 bounce`);
    assert.equal('type' in v.transition, false);
  }
});

test('遍历所有风格族 x 所有动效，isMotionAllowed 不抛异常且返回布尔', () => {
  for (const family of ALL_FAMILIES) {
    for (const name of ALL_MOTIONS) {
      assert.doesNotThrow(() => isMotionAllowed(family, name));
      assert.equal(typeof isMotionAllowed(family, name), 'boolean');
    }
  }
});

test('白名单覆盖全部风格族且非空', () => {
  for (const family of ALL_FAMILIES) {
    assert.ok(FAMILY_MOTION_WHITELIST[family].length > 0, `${family} 白名单为空`);
  }
});

test('prefersReducedMotion 在 Node 下返回 false 不报错', () => {
  assert.equal(prefersReducedMotion(), false);
});

test('过渡时长常量符合 PRD', () => {
  assert.equal(PAGE_FLIP_MS, 250);
  assert.equal(UI_TRANSITION_MS, 200);
  assert.equal(SKELETON_PULSE_MS, 1600);
});

/* ---------------- 动效解析：页面层 + 元素层 ---------------- */

const M = (enter: MotionName, from = 'style-pack') => ({ enter, from });

test('没手选过的页面默认逐块进场，且每页换一个种子', () => {
  // 这是本次改动之前所有页面的样子：enter 是当时的默认值 fadeUp，from 从来没人写过
  const legacy = M('fadeUp');
  assert.equal(isMotionPinned(legacy), false);
  for (const seed of [0, 1, 2, 7]) {
    assert.deepEqual(resolveMotion(legacy, seed), { page: 'stagger', staggerSeed: seed });
  }
});

test('auto 与「没手选过」同一条路——都是逐块进场', () => {
  assert.deepEqual(resolveMotion(M('auto'), 4), { page: 'stagger', staggerSeed: 4 });
});

test('手选「逐个进入」：逐块，但每页同一个种子', () => {
  for (const seed of [0, 3, 9]) {
    assert.deepEqual(resolveMotion(M('stagger', MOTION_PINNED), seed), { page: 'stagger', staggerSeed: 0 });
  }
});

test('手选具体动效：整页进，元素不逐块', () => {
  for (const enter of ['fadeUp', 'slideLeft', 'scaleIn'] as MotionName[]) {
    assert.deepEqual(resolveMotion(M(enter, MOTION_PINNED), 3), { page: enter, staggerSeed: null });
  }
});

test('none 两层都不动，手不手选都一样', () => {
  for (const from of ['style-pack', MOTION_PINNED]) {
    assert.deepEqual(resolveMotion(M('none', from), 2), { page: 'none', staggerSeed: null });
  }
});

test('每一页解析出来的东西都自洽：逐块时种子非空，不逐块时种子为空', () => {
  const all: MotionName[] = ['auto', 'stagger', 'none', 'fade', 'fadeUp', 'slideLeft'];
  for (const enter of all) {
    for (const from of ['style-pack', MOTION_PINNED]) {
      const r = resolveMotion(M(enter, from), 5);
      assert.equal(
        r.staggerSeed == null,
        r.page !== 'stagger',
        `${enter}/${from} 解析成 ${JSON.stringify(r)}，两层对不上`,
      );
    }
  }
});

test('进出动画一一配对，出是顺着进入方向继续走', () => {
  assert.equal(ENTER_ANIMATION.slideLeft, 'lumen-slide-left');
  assert.equal(EXIT_ANIMATION.slideLeft, 'lumen-slide-left-out');
  assert.equal(ENTER_ANIMATION.fadeUp, 'lumen-fade-up');
  assert.equal(EXIT_ANIMATION.fadeUp, 'lumen-fade-up-out');
  // none 进出都是 none：导出与减弱动效下必须完全静态
  assert.equal(ENTER_ANIMATION.none, 'none');
  assert.equal(EXIT_ANIMATION.none, 'none');
});

test('每个具体动效名都有进入与退出两条关键帧，没有 undefined 洞', () => {
  for (const name of ALL_MOTIONS) {
    assert.equal(typeof ENTER_ANIMATION[name], 'string', `${name} 缺进入关键帧`);
    assert.equal(typeof EXIT_ANIMATION[name], 'string', `${name} 缺退出关键帧`);
  }
});

test('animationCss 对 none 给空串，其余带上时长与缓动', () => {
  assert.equal(animationCss('none'), '');
  assert.match(animationCss('lumen-fade', 250), /^lumen-fade 250ms .*both$/);
});
