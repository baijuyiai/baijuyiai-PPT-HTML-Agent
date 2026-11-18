/**
 * 把**随仓库分发**的拉丁字体下到 `packages/ir-schema/assets/fonts/`。
 *
 * ## 为什么要自带字体，而不是只用系统字体
 *
 * 默认字体栈以前是一串系统字体名，开头几个还是中文宋体（`Songti SC` / `STSong` /
 * `Noto Serif SC`）——Windows 上一个都没有，于是英文大标题**静默落到 Georgia**。
 * 那是「看着还行但不够高级」的来源，而且在别人机器上落点还不一样。
 *
 * 自带之后，任何机器上渲染出来的是同一套字形。这几个都是 **SIL OFL**，可随产品分发。
 *
 * ## 为什么从 Google Fonts 取
 *
 * 它是这几个字体的上游之一，且按 `unicode-range` 切好了子集——只要 latin 那一份，
 * 一个文件三四十 KB。**不直接 `<link>` 到 Google Fonts**：线上渲染要能离线跑，
 * 成品导出更是必须自包含。
 *
 * 跑法（仓库根目录）：
 * ```
 * node --import tsx scripts/fetch-fonts.ts
 * ```
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const OUT_DIR = path.join(ROOT, 'packages/ir-schema/assets/fonts');

/**
 * 要哪几档字重。
 *
 * **只下用得上的档**：每一档都要单独下载、单独进包。多下一档不会让渲染更好看，
 * 只会让每个用户多等几十 KB。
 *
 * - Cormorant Garamond 最高只到 700，而骨架里大标题常写 900——那一档靠 `@font-face`
 *   的 `font-weight: 400 900` 声明覆盖，**不要**再下一份，下了也没有 900 这个档。
 * - Montserrat 是正文角色，300/400 是正文与说明、600 是标签、800 是大标题。
 */
const FONTS = [
  { family: 'Cormorant Garamond', weight: 400, file: 'cormorant-garamond-400.woff2', google: 'Cormorant+Garamond:wght@400' },
  { family: 'Cormorant Garamond', weight: 700, file: 'cormorant-garamond-700.woff2', google: 'Cormorant+Garamond:wght@700' },
  { family: 'Montserrat', weight: 400, file: 'montserrat-400.woff2', google: 'Montserrat:wght@400' },
  { family: 'Montserrat', weight: 600, file: 'montserrat-600.woff2', google: 'Montserrat:wght@600' },
  { family: 'Montserrat', weight: 800, file: 'montserrat-800.woff2', google: 'Montserrat:wght@800' },
];

/** Google 只对浏览器 UA 发 woff2；用默认 UA 会拿到 ttf，体积三倍 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const LICENSE_NOTE = `随仓库分发的拉丁字体
========================

来源：Google Fonts（https://fonts.googleapis.com）
许可：SIL Open Font License 1.1 —— 可随产品分发、可商用，见各字体官方仓库。

- Cormorant Garamond —— 展示字体（大标题、衬线标题）。Christian Thalmann / Catharsis Fonts
- Montserrat —— 正文无衬线。Julieta Ulanovsky

只取 Google 切好的 **latin** 子集：中文由字体栈后面的系统字体接手，
把中日韩字形也下下来只会让每个文件大好几倍，而一个都用不到。

**不要手改这里的文件。** 换字体改 \`scripts/fetch-fonts.ts\` 的 FONTS 再重跑，
手改会在下一次下载时被覆盖。改完要同步 \`packages/ir-schema/src/html-doc.ts\` 里的
BUNDLED_FACES（那份清单决定页面里怎么声明 @font-face）。
`;

async function fetchOne(f) {
  const dest = path.join(OUT_DIR, f.file);
  if (existsSync(dest)) {
    console.log(`跳过 ${f.file}（已有，${readFileSync(dest).length} 字节）`);
    return;
  }
  const css = await fetch(`https://fonts.googleapis.com/css2?family=${f.google}&display=block`, {
    headers: { 'User-Agent': UA },
  }).then((r) => r.text());

  // 每个 @font-face 前面有一条 `/* latin */` 之类的注释，靠它挑出拉丁那一份
  const latin = [...css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*@font-face\s*\{([^}]*)\}/g)]
    .filter((m) => m[1] === 'latin');
  if (latin.length === 0) throw new Error(`${f.family} ${f.weight}：Google 没给 latin 子集`);

  const url = /url\((https:[^)]+)\)/.exec(latin[0][2])?.[1];
  if (!url) throw new Error(`${f.family} ${f.weight}：CSS 里没找到字体地址`);

  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  // 认一下魔数再落盘：网络中间件返回一页 HTML 时，存下来的「字体」会让渲染静默回退
  if (buf.subarray(0, 4).toString('latin1') !== 'wOF2') {
    throw new Error(`${f.family} ${f.weight}：下到的不是 woff2（前 4 字节 ${buf.subarray(0, 4).toString('latin1')}）`);
  }
  writeFileSync(dest, buf);
  console.log(`下好 ${f.file}：${buf.length} 字节`);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const f of FONTS) await fetchOne(f);

writeFileSync(path.join(OUT_DIR, 'README.txt'), LICENSE_NOTE, 'utf8');
console.log(`\n共 ${FONTS.length} 个字体文件，目录：${path.relative(ROOT, OUT_DIR)}`);
