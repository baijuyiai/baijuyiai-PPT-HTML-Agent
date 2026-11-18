/**
 * 抓一批**真人编辑感人像**，抠成透明底，落进素材库。
 *
 * ## 为什么要换掉原来那批
 *
 * 原来那批（`stock-fetch-people.mjs`）来自 Gendo 免费抠图库，是给建筑渲染用的
 * 「行走 / 坐姿 / 站立 / 奔跑」全身图：512×512、平光、姿势随意。而人物页的参考图
 * 要的是**时尚杂志封面**那种人像——头到肩或头到腰、影棚侧光、有造型的服装。
 * 两者不是一个东西，所以整批换掉。
 *
 * ## 两套取景
 *
 * 图位现在会声明自己要哪种（`data-lumen-cutout="head" | "half"`），所以素材也分两套：
 *
 * - `head`：头肩特写。给头像位用。
 * - `half`：头到腰 / 头到胯。给半身位、单人主视觉用。
 *
 * 这样每张图**天生就是对的取景**，不再靠骨架里写死的百分比偏移去裁——
 * 那套偏移在源图姿势不齐时必然落偏，正是「头像位取到胸口」的根因。
 *
 * ## 来源与许可（**这条要如实告知使用者**）
 *
 * 来源是 Pexels。它的许可（https://www.pexels.com/license/）允许免费商用、
 * 不强制署名、允许修改。**但它不保证肖像权（model release）**：图里是可识别的真人，
 * 用在商用演示里那部分风险由使用者承担。Gendo 那家的许可明确覆盖「客户交付物」，
 * 代价是它没有编辑感人像——换源必须接受这个差别。
 *
 * 逐张的摄影者记不下来：CDN 不暴露作者，而 pexels.com 的详情页对非浏览器请求返回 403。
 * 许可不要求署名，所以 `author` 一律记 `Pexels`、`source` 记详情页链接。
 *
 * ## 跑法（仓库根目录）
 *
 * ```
 * node --import tsx scripts/stock-fetch-portraits.mjs --dry-run   # 只列要抓哪些
 * node --import tsx scripts/stock-fetch-portraits.mjs             # 真抓
 * node --import tsx scripts/stock-fetch-portraits.mjs --only head # 只抓头肩那套
 * ```
 *
 * 前置：管理后台「全局设置 → 抠图服务」里填好 koukoutu 的 API Key。
 * 已经在 `assets/` 里的会跳过，中断之后重跑能接着来。
 *
 * 抓完还要两步：
 *   1. `pnpm --filter @lumen/stock-library normalize-people` —— 把取景归一化
 *   2. `pnpm stock:add` —— 收进清单（色板是那一步算的）
 */
import { writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cutoutImage } from '../packages/server-core/src/services/cutout.service.ts';
import { decodePng, encodePng } from '../packages/stock-library/src/png-codec.ts';
import { fitLongSide } from './lib/fit-long-side.ts';

const ASSETS = path.resolve(fileURLToPath(new URL('../packages/stock-library/assets', import.meta.url)));

/**
 * 落盘长边。
 *
 * 原来那批是 512——头肩位要从里面放大两三倍，一定糊。1024 是「够清晰」与
 * 「仓库别太胖」之间的折中：一张 100–200 KB，32 张 5 MB 上下。
 */
const MAX_LONG_SIDE = 1024;

/** 从 CDN 取图。`w=` 是宽的上限，竖图会按比例给出更高的像素 */
const sourceUrl = (id: number) =>
  `https://images.pexels.com/photos/${id}/pexels-photo-${id}.jpeg?auto=compress&cs=tinysrgb&w=1600`;
const detailUrl = (id: number) => `https://www.pexels.com/photo/${id}/`;

type Framing = 'head' | 'half';

/**
 * 挑好的那批。**顺序就是落盘编号**，中间删一条会让后面的图跟着换号——
 * 但那只是缓存键，重跑会重新生成，不影响已经进清单的条目。
 *
 * **这份名单是量出来的，不是看缩略图挑的**：先把候选全部抠一遍，按 alpha 包围盒的
 * `h/w` 分组（头肩 ≈1.2–1.6，头到腰/胯 ≈1.8–2.8），再要求包围盒顶端不贴画框顶
 * （贴顶 = 原图就把头顶切了）、占画框高 ≥80%。怎么量见
 * `apps/worker/scratch/classify-portraits.mts`。注释里的数字就是那一轮的实测值。
 *
 * 看缩略图挑过一次，整批错了：Pexels 的小图是裁过的，标题写着 half body 的
 * 实际可能是全身，还有几张原图本身就切了头顶。
 *
 * `label` 只进清单的 `tags`，给图片库筛选用。
 */
const PICKS: { framing: Framing; id: number; label: string }[] = [
  // ---- 头肩：影棚光、纯色或暗底、目视镜头 ----
  { framing: 'head', id: 12562546, label: '女 单色' }, // h/w=1.51 fill=99%
  { framing: 'head', id: 28736497, label: '男 黑白' }, // h/w=1.47 fill=98%
  { framing: 'head', id: 33680688, label: '女 黑白' }, // h/w=1.46 fill=97%
  { framing: 'head', id: 16961539, label: '女 特写' }, // h/w=1.44 fill=96%
  { framing: 'head', id: 14304912, label: '女 长袖衬衫' }, // h/w=1.44 fill=96%
  { framing: 'head', id: 32222061, label: '女 黄色头巾' }, // h/w=1.43 fill=96%
  { framing: 'head', id: 39974547, label: '男 正装' }, // h/w=1.56 fill=96%
  { framing: 'head', id: 29852852, label: '女 影棚' }, // h/w=1.31 fill=95%
  { framing: 'head', id: 38386658, label: '女 棕色长发' }, // h/w=1.43 fill=95%
  { framing: 'head', id: 13660183, label: '女 黑色造型' }, // h/w=1.43 fill=95%
  { framing: 'head', id: 33680693, label: '女 亮片 黑白' }, // h/w=1.19 fill=95%
  { framing: 'head', id: 20218971, label: '女 金发西装' }, // h/w=1.62 fill=95%
  { framing: 'head', id: 11989029, label: '女 眼镜' }, // h/w=1.41 fill=94%
  { framing: 'head', id: 16746328, label: '女 影棚' }, // h/w=1.36 fill=93%
  { framing: 'head', id: 16152597, label: '女 微笑' }, // h/w=1.40 fill=93%
  { framing: 'head', id: 36687799, label: '男 影棚' }, // h/w=1.39 fill=92%

  // ---- 半身：头到腰 / 头到胯，有造型 ----
  { framing: 'half', id: 36742542, label: '女 黑白' }, // h/w=1.99 fill=99%
  { framing: 'half', id: 22601721, label: '女 白底' }, // h/w=2.03 fill=98%
  { framing: 'half', id: 30012625, label: '女 暗底' }, // h/w=1.79 fill=97%
  { framing: 'half', id: 21938970, label: '女 针织' }, // h/w=1.81 fill=96%
  { framing: 'half', id: 3973748, label: '女 卷发' }, // h/w=2.12 fill=95%
  { framing: 'half', id: 36646353, label: '女 黑色高领 暗底' }, // h/w=2.20 fill=94%
  { framing: 'half', id: 36457861, label: '女 青底' }, // h/w=2.68 fill=93%
  { framing: 'half', id: 6073973, label: '女 黑衣 暗底' }, // h/w=2.01 fill=92%
  { framing: 'half', id: 36807010, label: '男 西装 暗底' }, // h/w=1.83 fill=91%
  { framing: 'half', id: 30809038, label: '女 白衬衫' }, // h/w=1.77 fill=91%
  { framing: 'half', id: 15416842, label: '女 牛仔' }, // h/w=1.89 fill=90%
  { framing: 'half', id: 10483258, label: '女 全黑' }, // h/w=2.29 fill=89%
  { framing: 'half', id: 14218083, label: '女 绿色 白底' }, // h/w=2.00 fill=88%
  { framing: 'half', id: 16559840, label: '女 牛仔外套' }, // h/w=1.85 fill=86%
  { framing: 'half', id: 40225219, label: '女 黑白' }, // h/w=1.82 fill=82%
  { framing: 'half', id: 39849785, label: '女 黑白 暗底' }, // h/w=1.84 fill=82%
];

/* ---------------- 参数 ---------------- */

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i < 0 ? undefined : process.argv[i + 1];
};
const DRY = process.argv.includes('--dry-run');
const ONLY = arg('only')?.split(',').map((s) => s.trim()).filter(Boolean) as Framing[] | undefined;

const targets = ONLY ? PICKS.filter((p) => ONLY.includes(p.framing)) : PICKS;
if (targets.length === 0) {
  console.error('--only 没匹配到任何一组。可选：head、half');
  process.exit(1);
}

/** 编号按**取景分组内**的顺序，落盘名形如 `people-head-01.png` */
function fileOf(p: { framing: Framing; id: number }): string {
  const n = targets.filter((t) => t.framing === p.framing).findIndex((t) => t.id === p.id) + 1;
  return `people-${p.framing}-${String(n).padStart(2, '0')}.png`;
}

/**
 * 图源与许可写进清单要用的那一份。
 *
 * 导出成 JSON 落缓存，`stock:add` 之后照着填 `author` / `source` / `license` / `tags`——
 * 那一步算得出色板，算不出这些东西。
 */
const attribution = targets.map((p) => ({
  file: fileOf(p),
  author: 'Pexels',
  source: detailUrl(p.id),
  license: 'Pexels License（可商用、免费、无需署名；**不保证肖像权 / model release**）',
  tags: ['人物', '透明底', p.framing === 'head' ? '头肩' : '半身', ...p.label.split(' ')],
}));
writeFileSync(
  path.resolve(fileURLToPath(new URL('.', import.meta.url)), '.cache/portrait-attribution.json'),
  JSON.stringify(attribution, null, 2),
  'utf8',
);

if (DRY) {
  console.log(`要抓 ${targets.length} 张（head ${targets.filter((t) => t.framing === 'head').length}，`
    + `half ${targets.filter((t) => t.framing === 'half').length}）\n`);
  for (const p of targets) console.log(`  ${fileOf(p).padEnd(22)} ← pexels ${p.id}  ${p.label}`);
  console.log('\n--dry-run，什么都没下。');
  process.exit(0);
}

/* ---------------- 抓 → 抠 → 落盘 ---------------- */

let ok = 0;
let skipped = 0;
let failed = 0;

for (const p of targets) {
  const name = fileOf(p);
  const out = path.join(ASSETS, name);
  if (existsSync(out)) { skipped += 1; console.log(`跳过 ${name}：已经在了`); continue; }

  process.stdout.write(`${name} 下载中…`);
  try {
    const res = await fetch(sourceUrl(p.id));
    if (!res.ok) throw new Error(`取图失败 HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());

    process.stdout.write(' 抠底中…');
    const cut = await cutoutImage({ buffer: buf, mime: 'image/jpeg', filename: `${p.id}.jpg` });

    const shrunk = fitLongSide(decodePng(cut.buffer), MAX_LONG_SIDE);
    const png = encodePng(shrunk);
    writeFileSync(out, png);
    ok += 1;
    console.log(` 好了（${shrunk.width}×${shrunk.height}，${(png.length / 1024).toFixed(0)} KB）`);
  } catch (e) {
    failed += 1;
    console.log(` 失败：${e instanceof Error ? e.message : String(e)}`);
  }
  // 站点是给人看的，别连着打
  await new Promise((r) => setTimeout(r, 500));
}

console.log(`\n好了 ${ok}，跳过 ${skipped}，失败 ${failed}。`);
if (ok > 0) {
  console.log('\n接下来：\n'
    + '  1. pnpm --filter @lumen/stock-library normalize-people\n'
    + '  2. pnpm stock:add\n'
    + '  3. 照 scripts/.cache/portrait-attribution.json 补 author / source / license / tags');
}
process.exitCode = failed > 0 ? 1 : 0;
