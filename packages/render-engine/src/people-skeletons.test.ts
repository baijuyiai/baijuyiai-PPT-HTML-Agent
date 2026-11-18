import test from 'node:test';
import assert from 'node:assert/strict';
import { PEOPLE_LAYOUTS } from '@lumen/ir-schema';
import { isMockHtmlAcceptable, lintMockHtml } from './index.js';

/**
 * 每一份人物版式骨架都要过生成页面时那道**同一道** lint。
 *
 * 为什么这条测试在 `render-engine` 而不是 `ir-schema`：`lintMockHtml` 住在这个包里，
 * 而 `render-engine` 依赖 `ir-schema`。反过来引会成环。
 *
 * 为什么值得单独测：骨架是**照参考图识别出来的**，生成出来的页面却是过 lint 的。
 * 骨架里漏一个写死的色值，后果不是「样机上难看」——模型照着骨架排，那一页会
 * **在生成时被判不合规**然后重试一次、再失败、最后降级。这里拦下来比在生成链路上
 * 发现便宜得多，而且识别脚本每重跑一次都该过这一关。
 */

/** 一套真配色。骨架只用变量，所以取哪套都一样；这里取一套浅色的 */
const PALETTE = {
  bg: '#EFE6DA', surface: '#F7F1E8', text: '#3A322B', muted: '#8A7F73',
  accent: '#E08A3C', brand: '#C7421A', border: '#D8CDBF',
};

test('每一份骨架都过生成页面那道 lint', () => {
  for (const layout of PEOPLE_LAYOUTS) {
    const issues = lintMockHtml(layout.skeleton, PALETTE);
    const errors = issues.filter((i) => i.severity === 'error');
    assert.deepEqual(
      errors.map((i) => `${i.rule}: ${i.message}`),
      [],
      `${layout.id} 有阻断级问题——模型照它排出来的页面会被判不合规`,
    );
    assert.equal(
      isMockHtmlAcceptable(issues), true,
      `${layout.id} 没过 isMockHtmlAcceptable`,
    );
  }
});

test('骨架里没有写死的色值——那是 lint 唯一会真的判死的一条', () => {
  for (const layout of PEOPLE_LAYOUTS) {
    // 把变量定义抠掉之后不该还剩 hex。骨架本来就不定义变量，所以这里等于全扫一遍
    const body = layout.skeleton.replace(/--[a-z-]+\s*:\s*#[0-9a-f]{3,8}/gi, '');
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(body), `${layout.id} 里有写死的色值`);
  }
});
