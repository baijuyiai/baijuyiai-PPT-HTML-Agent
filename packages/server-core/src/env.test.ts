import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.LUMEN_SECRET_KEY = 'test-secret-key-0123456789abcdefghijklmnop';

const { resolveForcePasswordChange } = await import('./env.js');

test('强制改密开关：未配置时生产强制、开发不强制', () => {
  assert.equal(resolveForcePasswordChange(undefined, true), true, '生产未配置必须强制');
  assert.equal(resolveForcePasswordChange(undefined, false), false, '开发未配置不强制，admin/admin 直接可用');
  assert.equal(resolveForcePasswordChange('', false), false, '空字符串按未配置处理');
});

test('强制改密开关：显式配置覆盖环境默认', () => {
  assert.equal(resolveForcePasswordChange('true', false), true, '开发环境也能显式开启');
  assert.equal(resolveForcePasswordChange('1', false), true);
  assert.equal(resolveForcePasswordChange('false', true), false, '生产环境也能显式关闭');
});
