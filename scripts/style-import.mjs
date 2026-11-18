/**
 * 以资产文件为准，把风格写回库里。
 *
 * 和 API 启动时那趟 seed 的分别：那个只补缺失，这个会**覆盖**库里内容不同的那几套。
 * 用途是把远端改过的风格同步下来——拉完代码，`assets/styles.json` 是新的，
 * 库里还是旧的，光靠 seed 补不上（它认为「已经有了」）。
 *
 * **会丢东西**：本地在界面上对这几套风格做过的改动会被文件里的整份替换。
 * 所以它是个显式动作，不挂在启动路径上。
 *
 * 跑法（仓库根目录）：pnpm style:import
 */
// 相对路径 + `.ts` 后缀：根目录的 package.json 没声明 workspace 依赖，
// 从仓库根解析 `@lumen/server-core` 会失败。仓库里其他脚本（seed.mjs）也是这么引的
import { seedStyleDocs } from '../packages/server-core/src/services/style-doc.service.ts';

const result = seedStyleDocs({ overwrite: true });

for (const ref of result.inserted) console.log(`  补入 ${ref}`);
for (const ref of result.updated) console.log(`  覆盖 ${ref}`);

const written = result.inserted.length + result.updated.length;
console.log(
  written === 0
    ? `库里和资产文件已经一致（${result.skipped} 套都没变）`
    : `写入 ${written} 套（新增 ${result.inserted.length}、覆盖 ${result.updated.length}、未变 ${result.skipped}）`,
);
