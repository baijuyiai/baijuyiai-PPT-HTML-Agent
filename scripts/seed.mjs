#!/usr/bin/env node
/**
 * 种子数据。
 *
 * 幂等：重复执行只会补齐缺失的部分。
 * 1) 应用数据库迁移
 * 2) 写入内置管理员、Mock Provider 与默认任务路由（ensureSeed）
 * 3) 可选：写入演示用户与一个已生成完毕的演示项目，便于首次打开就有东西可看
 *
 * 用法：
 *   pnpm seed            写入迁移 + 内置数据 + 演示数据
 *   pnpm seed --minimal  只写迁移与内置数据，不造演示项目
 */

import { migrate } from '../packages/server-core/src/db/migrate.ts';
import { ensureSeed, ADMIN_USERNAME } from '../packages/server-core/src/services/seed.service.ts';
import { createUser, findById, isUsernameTaken } from '../packages/server-core/src/services/user.service.ts';
import { createProject, deleteProject, listProjects } from '../packages/server-core/src/services/project.service.ts';
import { runGeneration } from '../packages/server-core/src/services/generate.service.ts';
import { env, dataDir } from '../packages/server-core/src/env.ts';
import { closeDb, get } from '../packages/server-core/src/db/client.ts';

const DEMO_USERNAME = 'demo';
const DEMO_PASSWORD = 'demo1234';
const DEMO_TITLE = 'FDE 介绍：把 AI 能力交付到业务现场';

/**
 * 默认演示内容。
 * 刻意写得像一份真实的汇报稿：有主张、有数字、有结构，
 * 这样生成的成品能覆盖封面/章节/图文/指标/图表/结尾各种页型，
 * 也能顺带验证「指标抽取」「图表降级」「拆页」这些分支。
 */
const BRIEF = `1. 什么是 FDE

FDE（Forward Deployed Engineer，前置交付工程师）是把 AI 能力真正落到客户业务里的角色。
他不坐在总部等需求，而是直接进入客户的业务现场，和一线一起把问题定义清楚、把方案跑通。

2. 为什么现在需要 FDE

过去两年，企业对 AI 岗位的需求增长了 210%，但项目失败率依然高达 63%。
失败的原因很少是模型不行，而是没人把模型的能力边界和业务的真实约束对上。
客户买的从来不是软件，是能落地的结果。

- 只交付功能，不交付结果，项目就会停在验收那一刻
- 需求在会议室里永远说不全，必须到现场才知道约束在哪
- 模型能力更新太快，方案必须能在一线快速调整

3. FDE 做什么

- 定义问题：把模糊的业务诉求拆成可验证的技术目标
- 搭建原型：用最快的方式做出能跑的最小闭环，先看结果再谈方案
- 交付落地：把原型工程化，写清边界条件与运维手册
- 沉淀复用：把现场经验抽象成产品能力，反哺给下一个客户

4. 关键数字

试点客户的平均制作时长从 6 小时下降到 40 分钟，效率提升 9 倍。
项目返工率从 47% 下降到 13%，客户续约率从 71% 提升到 84%。
人均产出从 178 万提升到 236 万，销售费用率从 38% 降到 32%。

5. 怎么做

第一，把交付结果写进考核，而不是只考核功能上线。
第二，让工程师直接面对客户，中间不隔产品经理。
第三，把不确定性留在交付前，现场只做确定的事。

6. 下一步

明年目标是把这套打法复制到三个大区，把线上自助的占比从 10% 提到 20%，
把续约率提到 88%。`;

/** 后台演示用：额外造几个不同来源与状态的真实感账号，避免 CRM 只有两行 */
const EXTRA_USERS = [
  { username: 'zhangwei', email: 'zhangwei@example.com', role: 'user', source: 'self_signup' },
  { username: 'lina', email: 'lina@example.com', role: 'user', source: 'self_signup' },
  { username: 'wangqiang', email: 'wangqiang@example.com', role: 'guest', source: 'admin_created' },
];

/** 按用户名取回用户；不存在时抛错而不是返回 undefined，避免下游静默用错人 */
function requireUserByName(username) {
  const row = get('SELECT userId FROM users WHERE username = ?', username);
  if (!row) throw new Error(`用户不存在：${username}`);
  return findById(row.userId);
}

async function main() {
  const minimal = process.argv.includes('--minimal');

  const applied = migrate();
  console.log(applied.length > 0
    ? `已应用 ${applied.length} 个迁移：${applied.join(', ')}`
    : '数据库已是最新，无迁移需要应用');

  const created = ensureSeed();
  console.log(created.length > 0 ? `内置数据：新建 ${created.join('、')}` : '内置数据：已存在，跳过');

  // 配了真实模型就把路由指过去；没配则继续用内置 Mock
  const { configureProviders, describeRoutes } = await import('./providers.mjs');
  configureProviders((line) => console.log(`模型接入：${line}`));
  for (const line of describeRoutes()) console.log(`  ${line}`);

  const admin = requireUserByName(ADMIN_USERNAME);
  if (created.includes('admin 账号')) {
    console.log(
      `管理员账号：${ADMIN_USERNAME} / ${env.LUMEN_ADMIN_PASSWORD}`
      + (env.adminForcePasswordChange ? '（首次登录需改密）' : '（不强制改密，可直接登录）'),
    );
  } else {
    // 已存在时 seed 不会覆盖密码——这正是「改了 LUMEN_ADMIN_PASSWORD 却不生效」的常见困惑
    console.log(
      `管理员账号：${ADMIN_USERNAME} 已存在，密码保持不变`
      + `（要重设密码请跑 pnpm admin:reset）`,
    );
  }

  if (minimal) {
    console.log('已按 --minimal 跳过演示数据');
    return;
  }

  if (isUsernameTaken(DEMO_USERNAME)) {
    console.log(`演示用户：${DEMO_USERNAME} 已存在，跳过`);
  } else {
    createUser({
      username: DEMO_USERNAME,
      email: 'demo@example.com',
      password: DEMO_PASSWORD,
      role: 'user',
      source: 'admin_created',
      createdBy: admin.userId,
      mustChangePassword: false,
    });
    console.log(`演示用户：${DEMO_USERNAME} / ${DEMO_PASSWORD}（不需要改密）`);
  }

  const demo = requireUserByName(DEMO_USERNAME);

  // 后台演示用账号：CRM 只有两行看不出筛选与角色差异
  let extraCreated = 0;
  for (const u of EXTRA_USERS) {
    if (isUsernameTaken(u.username)) continue;
    createUser({
      username: u.username,
      email: u.email,
      password: 'demo1234',
      role: u.role,
      source: u.source,
      createdBy: admin.userId,
      mustChangePassword: false,
    });
    extraCreated += 1;
  }
  if (extraCreated > 0) console.log(`演示账号：新建 ${extraCreated} 个（密码同为 demo1234）`);

  // 标题改过之后旧演示项目会留在库里，清掉避免演示时看到两个「演示项目」
  const stale = listProjects(demo.tenantId, demo.userId, { q: '演示项目：区域增长复盘' });
  for (const item of stale.items) {
    deleteProject(item.projectId, demo.tenantId);
    console.log(`已清理旧演示项目：${item.projectId}`);
  }

  const existing = listProjects(demo.tenantId, demo.userId, { q: DEMO_TITLE });
  if (existing.items.length > 0) {
    console.log(`演示项目：「${DEMO_TITLE}」已存在，跳过生成`);
    return;
  }

  const project = createProject({
    tenantId: demo.tenantId,
    ownerId: demo.userId,
    title: DEMO_TITLE,
    brief: BRIEF,
    audienceTag: 'executive',
    scene: 'review',
  });
  console.log(`演示项目已创建：${project.projectId}`);

  // 直接跑生成器，不经过 HTTP 与队列——种子脚本要求同步产出确定结果
  let ready = 0;
  let failed = 0;
  for await (const evt of runGeneration({
    projectId: project.projectId,
    tenantId: demo.tenantId,
    userId: demo.userId,
  })) {
    if (evt.event === 'page-ready') ready += 1;
    else if (evt.event === 'page-failed') {
      failed += 1;
      console.log(`  第 ${evt.data.index + 1} 页失败：${evt.data.error}`);
    } else if (evt.event === 'error') {
      throw new Error(`生成中断：${evt.data.message}`);
    }
  }

  console.log(`演示项目生成完成：${ready} 页就绪，${failed} 页失败`);
  console.log(`数据目录：${dataDir}`);
  console.log(`前端地址：http://localhost:${env.LUMEN_WEB_PORT}`);
}

main()
  .catch((err) => {
    console.error('种子数据写入失败：', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
