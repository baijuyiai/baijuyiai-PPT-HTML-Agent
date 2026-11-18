#!/usr/bin/env node
/**
 * 内置管理员的本地运维工具（break-glass 通道）。
 *
 * 用途：忘记 admin 密码、被登录失败锁住、或想快速把环境恢复到默认凭据时使用。
 * 这是本地脚本——能在这台机器上跑它的人本来就能直接改库，所以这里**不做密码策略校验**，
 * 允许设成 `admin` 这种默认值。远程接口仍然一律走密码策略。
 *
 * 用法：
 *   pnpm admin:show                 查看内置管理员当前状态
 *   pnpm admin:reset                重置为 LUMEN_ADMIN_PASSWORD（默认 admin），并解除强制改密
 *   pnpm admin:reset <新密码>        重置为指定密码
 *   pnpm admin:reset <新密码> --force-change   重置后要求下次登录改密
 */

import { closeDb } from '../packages/server-core/src/db/client.ts';
import { migrate } from '../packages/server-core/src/db/migrate.ts';
import { ensureSeed, findAdmin, setAdminPassword, ADMIN_USERNAME } from '../packages/server-core/src/services/seed.service.ts';
import { env } from '../packages/server-core/src/env.ts';

const args = process.argv.slice(2);
const show = args.includes('show') || args.includes('--show');
const forceChange = args.includes('--force-change');

function describe(admin) {
  const lines = [
    `账号      ${admin.username}`,
    `角色/状态 ${admin.role} / ${admin.status}`,
    `来源      ${admin.source}`,
    `强制改密  ${admin.mustChangePassword === 1 ? '是' : '否'}`,
    `最近登录  ${admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleString('zh-CN') : '从未登录'}`,
  ];
  return lines.join('\n');
}

function main() {
  migrate();
  // 幂等：管理员不存在时先补出来，避免脚本在空库上直接报错
  ensureSeed();

  const admin = findAdmin();
  if (!admin) {
    console.error(`未找到内置管理员 ${ADMIN_USERNAME}`);
    process.exitCode = 1;
    return;
  }

  if (show) {
    console.log(describe(admin));
    return;
  }

  const explicit = args.find((a) => !a.startsWith('-') && a !== 'reset');
  const password = explicit ?? env.LUMEN_ADMIN_PASSWORD;

  const updated = setAdminPassword(password, { forceChange });
  console.log(`已重置内置管理员密码\n`);
  console.log(describe(updated));
  console.log(`\n密码      ${password}`);
  if (!forceChange) {
    console.log('          （不强制改密，可直接用它登录）');
  } else {
    console.log('          （下次登录会被要求修改密码）');
  }
  console.log(`\n后台地址  http://localhost:${env.LUMEN_ADMIN_PORT}/admin/`);
}

try {
  main();
} catch (err) {
  console.error('操作失败：', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  closeDb();
}
