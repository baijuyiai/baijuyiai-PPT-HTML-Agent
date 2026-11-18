/**
 * 从 Unsplash 下载一批**生活场景照片**，落进 `assets/`。
 *
 * ## 为什么是下载而不是生成
 *
 * 配图要的是**真实摄影的质感**——真实的光、真实的皮肤与布料纹理、真实的空间纵深。
 * 生成的图在这几样上最容易露怯，而多图排版恰恰把它们放大到整屏。
 * 参考的是多图排版实际会选的那些图：时尚人物、户外运动、日常瞬间、人像特写。
 *
 * 来源与许可：Unsplash License（可商用、免授权、不强制署名）。**逐张的来源页面记不下**——
 * 图片是从搜索页的 CDN 直链取的，`images.unsplash.com/photo-<id>` 里的 id 与
 * 照片页 slug 里的不是同一个，没法反推。所以 `source` 记的是**搜索页**，
 * 那是这批图真实、可核对的出处。
 *
 * ## 跑法（仓库根目录）
 *
 * ```
 * node --import tsx scripts/stock-fetch-photos.ts --dry-run   先看清单
 * node --import tsx scripts/stock-fetch-photos.ts             下载并写清单
 * ```
 *
 * 下载完要**目视过一遍**再提交：构图太满、主体不明确、带文字的都要挑出来删掉。
 */
import { writeFileSync, existsSync, readFileSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzePng } from '../packages/stock-library/src/analyze.ts';
import type { StockKind } from '../packages/stock-library/src/index.ts';

const ASSETS = path.resolve(fileURLToPath(new URL('../packages/stock-library/assets', import.meta.url)));
const MANIFEST = path.join(ASSETS, 'manifest.json');

/** 这批统一归「生活」：画面里有人、有日常场景，不是纯风景也不是抽象构成 */
const KIND: StockKind = 'lifestyle';

interface Candidate {
  slug: string;
  /** 出处搜索页。同一批图共用一个 query，`source` 就记它 */
  query: string;
  /** `images.unsplash.com/photo-<id>` 里的那一段 */
  id: string;
  /** 挑图用的标签。写具体的：挑图时靠它把同一页的几张岔开 */
  tags: string[];
}

const CANDIDATES: Candidate[] = [
  /* ---- 街头时尚 ---- */
  { slug: 'street-fashion-01', query: 'street-style', id: '1598211664451-1458e4a3e279', tags: ['街头', '时尚', '人物'] },
  { slug: 'street-fashion-02', query: 'street-style', id: '1532332248682-206cc786359f', tags: ['街头', '时尚', '女性'] },
  { slug: 'street-fashion-04', query: 'street-style', id: '1624338618005-0a93e308abae', tags: ['街头', '时尚', '男性'] },
  { slug: 'street-fashion-05', query: 'street-style', id: '1624911104820-5316c700b907', tags: ['街头', '时尚', '女性'] },
  { slug: 'street-fashion-06', query: 'street-style', id: '1594035795072-3fcd236b7d83', tags: ['街头', '潮流', '男性'] },
  { slug: 'street-fashion-07', query: 'street-style', id: '1590330297626-d7aff25a0431', tags: ['街头', '时尚', '女性'] },
  { slug: 'street-fashion-08', query: 'street-style', id: '1660486044177-45cd45bb5e99', tags: ['街头', '男性', '日常'] },
  { slug: 'street-fashion-09', query: 'street-style', id: '1759504692093-9f0461eeba34', tags: ['街头', '时尚', '女性'] },
  { slug: 'street-fashion-10', query: 'street-style', id: '1582164256364-b0eccb922bff', tags: ['街头', '男性', '潮流'] },
  { slug: 'street-fashion-11', query: 'street-style', id: '1624223237138-21a37e61dec0', tags: ['街头', '时尚', '女性'] },
  { slug: 'street-fashion-12', query: 'street-style', id: '1774413768903-057eb084133b', tags: ['街头', '人物', '日常'] },

  /* ---- 运动户外 ---- */
  { slug: 'sport-run-01', query: 'running-outdoors', id: '1759674804375-3d0c038a0a6a', tags: ['运动', '跑步', '户外'] },
  { slug: 'sport-run-03', query: 'running-outdoors', id: '1727094141271-9bea5bc8c757', tags: ['运动', '跑步', '城市'] },
  { slug: 'sport-run-05', query: 'running-outdoors', id: '1486218119243-13883505764c', tags: ['运动', '跑步', '群体'] },
  { slug: 'sport-run-06', query: 'running-outdoors', id: '1594882645126-14020914d58d', tags: ['运动', '跑步', '逆光'] },
  { slug: 'sport-run-07', query: 'running-outdoors', id: '1480179087180-d9f0ec044897', tags: ['运动', '跑步', '女性'] },
  { slug: 'sport-run-08', query: 'running-outdoors', id: '1711598850173-0b0a0f69b4f4', tags: ['运动', '跑步', '海岸'] },
  { slug: 'sport-run-10', query: 'running-outdoors', id: '1744060204728-f68e434a3edf', tags: ['运动', '跑步', '黄金时刻'] },
  { slug: 'sport-run-12', query: 'running-outdoors', id: '1728532483490-708f6562b738', tags: ['运动', '跑步', '动感'] },

  /* ---- 生活瞬间 ---- */
  { slug: 'life-coffee-01', query: 'coffee-lifestyle', id: '1492158244976-29b84ba93025', tags: ['生活', '咖啡', '静物'] },
  { slug: 'life-coffee-02', query: 'coffee-lifestyle', id: '1518057111178-44a106bad636', tags: ['生活', '咖啡', '桌面'] },
  { slug: 'life-coffee-03', query: 'coffee-lifestyle', id: '1509042239860-f550ce710b93', tags: ['生活', '咖啡', '手部'] },
  { slug: 'life-coffee-04', query: 'coffee-lifestyle', id: '1511426420268-4cfdd3763b77', tags: ['生活', '咖啡', '静物'] },
  { slug: 'life-coffee-05', query: 'coffee-lifestyle', id: '1536227661368-deef57acf708', tags: ['生活', '咖啡', '俯拍'] },
  { slug: 'life-coffee-06', query: 'coffee-lifestyle', id: '1495474472287-4d71bcdd2085', tags: ['生活', '咖啡', '笔记本'] },
  { slug: 'life-coffee-07', query: 'coffee-lifestyle', id: '1504630083234-14187a9df0f5', tags: ['生活', '咖啡', '书'] },
  { slug: 'life-coffee-08', query: 'coffee-lifestyle', id: '1498709112912-9be3173d30be', tags: ['生活', '咖啡', '桌面'] },
  { slug: 'life-coffee-09', query: 'coffee-lifestyle', id: '1610632380989-680fe40816c6', tags: ['生活', '饮品', '静物'] },
  { slug: 'life-coffee-12', query: 'coffee-lifestyle', id: '1510972527921-ce03766a1cf1', tags: ['生活', '咖啡', '手部'] },

  /* ---- 明亮人像 ----
   * 前一批的 `portrait-*` 十四张全是深色棚拍（`analyzePng` 判出来也确实是 dark），
   * 而挑图的明暗是**硬约束**——浅色风格一张都轮不到它们。这一组补的就是这个缺口。 */
  { slug: 'people-bright-01', query: 'bright-portrait-white-background', id: '1758600587815-b654d1405e83', tags: ['人像', '女性', '明亮'] },
  { slug: 'people-bright-02', query: 'bright-portrait-white-background', id: '1533656812321-1868a4d2b72a', tags: ['人像', '女性', '户外'] },

  /* ---- 居家日常 ----
   * 上一批的「生活」十二张全是咖啡，题材太窄。这一组换到室内：做饭、撸猫、客厅。 */
  { slug: 'life-home-01', query: 'daily-life-home', id: '1790123855915-ff6e7d466031', tags: ['生活', '居家', '宠物'] },
  { slug: 'life-kitchen-01', query: 'daily-life-home', id: '1758523418681-85b822e3c671', tags: ['生活', '厨房', '人物'] },
  { slug: 'life-kitchen-02', query: 'daily-life-home', id: '1763570645938-cd8f15773dab', tags: ['生活', '厨房', '烹饪'] },
  { slug: 'life-interior-01', query: 'daily-life-home', id: '1778088442580-8b4046c070ca', tags: ['生活', '室内', '客厅'] },
  { slug: 'life-interior-02', query: 'daily-life-home', id: '1765728614151-58445a0eac16', tags: ['生活', '室内', '客厅'] },

  /* ---- 人像特写 ---- */
  { slug: 'portrait-01', query: 'portrait-people', id: '1674932668403-33398b81c92f', tags: ['人像', '女性', '影棚'] },
  { slug: 'portrait-02', query: 'portrait-people', id: '1581841064838-a470c740e8ee', tags: ['人像', '女性', '微笑'] },
  { slug: 'portrait-03', query: 'portrait-people', id: '1563170446-9c3c0622d8a9', tags: ['人像', '男性', '黑白'] },
  { slug: 'portrait-04', query: 'portrait-people', id: '1574526783053-c3afac70d448', tags: ['人像', '男性', '简约'] },
  { slug: 'portrait-05', query: 'portrait-people', id: '1544005313-94ddf0286df2', tags: ['人像', '女性', '自然光'] },
  { slug: 'portrait-06', query: 'portrait-people', id: '1496672254107-b07a26403885', tags: ['人像', '女性', '侧脸'] },
  { slug: 'portrait-07', query: 'portrait-people', id: '1504275490777-45f30792f13f', tags: ['人像', '女性', '黑白'] },
  { slug: 'portrait-08', query: 'portrait-people', id: '1711464669343-2596d0f1b526', tags: ['人像', '女性', '特写'] },
  { slug: 'portrait-09', query: 'portrait-people', id: '1506863530036-1efeddceb993', tags: ['人像', '男性', '街拍'] },
  { slug: 'portrait-10', query: 'portrait-people', id: '1617744966315-b3c950c430c7', tags: ['人像', '女性', '暖调'] },
  { slug: 'portrait-11', query: 'portrait-people', id: '1587397845856-e6cf49176c70', tags: ['人像', '男性', '深色'] },
  { slug: 'portrait-12', query: 'portrait-people', id: '1517462964-21fdcec3f25b', tags: ['人像', '女性', '自然光'] },
  { slug: 'portrait-13', query: 'portrait-people', id: '1516239482977-b550ba7253f2', tags: ['人像', '女性', '特写'] },
  { slug: 'portrait-14', query: 'portrait-people', id: '1721956514577-f6c15d73e585', tags: ['人像', '男性', '剪影'] },
];

const dryRun = process.argv.includes('--dry-run');

if (dryRun) {
  console.log(`共 ${CANDIDATES.length} 张候选（kind=${KIND}）：`);
  for (const c of CANDIDATES) console.log(`  ${c.slug}  [${c.tags.join('/')}]`);
  process.exit(0);
}

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Record<string, unknown>[];
const known = new Set(manifest.map((e) => String(e.file)));

/** 下载并发。Unsplash 的 CDN 不介意，但别一次打五十个 */
const CONCURRENCY = 4;

let ok = 0;
let skipped = 0;
let failed = 0;

async function fetchOne(c: Candidate): Promise<void> {
  const file = `${c.slug}.jpg`;
  if (known.has(file) || existsSync(path.join(ASSETS, file))) {
    skipped += 1;
    return;
  }

  /* 长边压到 1200：多图排版里一张图最大也就占半屏，1920 画布下 960px 就够，
   * 1200 留了余量。仓库里已有的那批照片是 1200×675、每张 70KB——
   * 按原图 1600 下会得到 1600×2400、每张 500KB，五十张就是 24MB，
   * 比整个素材库现有的 12MB 还大一倍，全是白占的。
   * `w`/`h` 同时给 + `fit=max`：竖图横图都按长边 1200 走，不会一种被撑到 2400。 */
  const url = `https://images.unsplash.com/photo-${c.id}?w=1200&h=1200&fit=max&q=80&fm=jpg`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());

  const out = path.join(ASSETS, file);
  writeFileSync(out, buf);

  /* 色板与明暗要解像素才算得出来，而仓库里只有 PNG 解码器。
   * 转一道临时 PNG 交给 `analyzePng`，用完就删——jpg 仍是要落盘的那份。 */
  const tmp = path.join(tmpdir(), `lumen-stock-${c.slug}-${Date.now()}.png`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', out, tmp]);
  const analyzed = analyzePng(file, readFileSync(tmp), KIND);
  unlinkSync(tmp);

  manifest.push({
    file,
    kind: KIND,
    author: 'Unsplash',
    source: `https://unsplash.com/s/photos/${c.query}`,
    license: 'Unsplash License',
    tone: analyzed.tone,
    palette: analyzed.palette,
    tags: c.tags,
  });
  ok += 1;
  process.stdout.write(`  ${file}（${(buf.length / 1024).toFixed(0)} KB，${analyzed.tone}）\n`);
}

for (let i = 0; i < CANDIDATES.length; i += CONCURRENCY) {
  const batch = CANDIDATES.slice(i, i + CONCURRENCY);
  const results = await Promise.allSettled(batch.map(fetchOne));
  for (const [j, r] of results.entries()) {
    if (r.status === 'rejected') {
      failed += 1;
      console.log(`  ${batch[j]!.slug} 失败：${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    }
  }
}

writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`\n成功 ${ok}，跳过 ${skipped}，失败 ${failed}。清单现在共 ${manifest.length} 条。`);
if (ok > 0) {
  console.log([
    '',
    '接下来：',
    '  1. 打开 assets/ 目视过一遍——构图太满、主体不明确、带文字的挑出来删掉，',
    '     删完记得把清单里对应的条目也去掉',
    '  2. 重新生成打包快照：pnpm build（前端把清单打进 bundle）',
  ].join('\n'));
}
process.exit(failed > 0 ? 1 : 0);
