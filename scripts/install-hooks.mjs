/**
 * 把 `scripts/hooks/` 下的钩子装到本机的 `.git/hooks/`。
 *
 * 装的是**薄壳**而不是复制本体：`.git/hooks/pre-push` 里只有一行，
 * 转去执行仓库里的真脚本。所以改了本体立即生效，不会出现「仓库里改了、
 * 本机跑的还是旧的」这种最难查的不同步。也让真脚本能进版本管理——
 * `.git/` 是不会被提交的，直接写在那里等于换台机器就没了。
 *
 * 跑法（仓库根目录）：pnpm hooks:install
 */
import { chmodSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';

const SRC = 'scripts/hooks';

const hooksDir = resolve(execFileSync('git', ['rev-parse', '--git-path', 'hooks'], { encoding: 'utf8' }).trim());
mkdirSync(hooksDir, { recursive: true });

let installed = 0;
for (const name of readdirSync(SRC)) {
  const source = join(SRC, name);
  if (!statSync(source).isFile()) continue;

  // 本体自己也要可执行：Linux/macOS 上 sh 直接跑它，靠的就是执行位
  try {
    chmodSync(source, 0o755);
  } catch {
    // Windows 上文件系统没有执行位这回事，git 照样会用 sh 跑它
  }

  writeFileSync(
    join(hooksDir, name),
    `#!/bin/sh\nexec "$(git rev-parse --show-toplevel)/${SRC}/${name}" "$@"\n`,
  );
  console.log(`  装上 ${name}`);
  installed += 1;
}

console.log(`共 ${installed} 个钩子 → ${hooksDir}`);
