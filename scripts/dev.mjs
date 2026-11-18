#!/usr/bin/env node
/**
 * 一键启动开发环境。
 *
 * 依次拉起 API、Web、Admin 与 Worker 四个进程，统一加前缀输出日志，Ctrl-C 一起退出。
 * Worker 与 Admin 尚未就绪时会被跳过而不是让整个启动失败——这样在分阶段开发时也能跑通主链路。
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const COLORS = {
  api: '\u001b[35m',
  web: '\u001b[36m',
  admin: '\u001b[33m',
  worker: '\u001b[32m',
};
const RESET = '\u001b[0m';

/** 用 pnpm --filter 启动，保证各包拿到自己的依赖解析 */
const SERVICES = [
  { name: 'api', filter: '@lumen/api', script: 'dev', required: true, port: 8787 },
  { name: 'web', filter: '@lumen/web', script: 'dev', required: true, port: 5273 },
  { name: 'admin', filter: '@lumen/admin', script: 'dev', required: false, port: 5274 },
  { name: 'worker', filter: '@lumen/worker', script: 'dev', required: false, port: 0 },
];

const only = process.argv.slice(2);
const children = [];
let shuttingDown = false;

function log(name, line) {
  const color = COLORS[name] ?? '';
  process.stdout.write(`${color}[${name}]${RESET} ${line}\n`);
}

function start(service) {
  const pkgDir = join(root, service.name === 'api' || service.name === 'web' || service.name === 'admin' || service.name === 'worker'
    ? 'apps'
    : 'packages', service.name);

  if (service.name !== 'api' && service.name !== 'web' && !existsSync(pkgDir)) {
    if (service.required) throw new Error(`${service.name} 目录不存在：${pkgDir}`);
    log('dev', `跳过 ${service.name}（尚未就绪）`);
    return;
  }

  const child = spawn('pnpm', ['--filter', service.filter, 'run', service.script], {
    cwd: root,
    shell: true,
    env: {
      ...process.env,
      FORCE_COLOR: '1',
      /**
       * 让 tsx 用仓库根的 tsconfig，而不是各包自己那份。
       *
       * tsx 只挑一份 tsconfig 应用到它转译的**所有**文件，并且只对落在该 tsconfig
       * `include` 里的文件生效。worker 自己的 tsconfig 只覆盖 `src/**`，
       * 于是它 import 的 packages/slides 会被按经典 JSX 编译——产物里是
       * React.createElement，而那边并没有 import React。根 tsconfig 不限目录，覆盖全部。
       */
      TSX_TSCONFIG_PATH: join(root, 'tsconfig.json'),
    },
  });
  children.push(child);

  const pipe = (stream) => {
    let buffer = '';
    stream.setEncoding('utf8');
    stream.on('data', (chunk) => {
      buffer += chunk;
      let idx = buffer.indexOf('\n');
      while (idx >= 0) {
        log(service.name, buffer.slice(0, idx));
        buffer = buffer.slice(idx + 1);
        idx = buffer.indexOf('\n');
      }
    });
  };
  pipe(child.stdout);
  pipe(child.stderr);

  child.on('exit', (code) => {
    log(service.name, `进程退出（code=${code}）`);
    if (!shuttingDown && service.required && code !== 0) {
      log('dev', `${service.name} 异常退出，停止其余进程`);
      shutdown(1);
    }
  });
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    if (!c.killed) c.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 400);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

const targets = only.length > 0 ? SERVICES.filter((s) => only.includes(s.name)) : SERVICES;
if (targets.length === 0) {
  console.error(`没有匹配的服务。可选：${SERVICES.map((s) => s.name).join(', ')}`);
  process.exit(1);
}

log('dev', `启动：${targets.map((s) => s.name).join(', ')}`);
for (const s of targets) start(s);

const webPort = process.env.LUMEN_WEB_PORT ?? '5273';
const apiPort = process.env.LUMEN_PORT ?? '8787';
log('dev', `API  http://localhost:${apiPort}`);
log('dev', `Web  http://localhost:${webPort}`);
log('dev', 'Ctrl-C 结束全部进程');
