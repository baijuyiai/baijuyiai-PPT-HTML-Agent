#!/usr/bin/env node
/**
 * 从 Gendo 的免费抠图库抓人物素材。
 *
 * 来源与许可：https://gendo.ai/blog/free-cutout-people-png-architectural-renders
 * 「236+ transparent-background PNG people」「no sign-up, no email gate, no watermark」
 * 「licensed for use in commercial architectural work, including client deliverables,
 * competition entries, planning submissions and published visuals」。
 *
 * ## 为什么要转一道手
 *
 * 原图是**调色板 PNG**（colorType 3 + tRNS），而本仓的 `decodePng`
 * （`packages/style-engine/src/png.ts`）只读 PLTE 的 RGB、**不读 tRNS**——
 * 直接入库会把整张图判成不透明，`transparent` 标错、`fillImageSlots` 也就不会给它
 * 挂 `data-lumen-cutout`。所以统一过一遍 ffmpeg，转成真彩 + alpha（colorType 6）。
 *
 * 顺带缩到 512：原图 1024 方、转 RGBA 后约 200KB 一张，59 张就是 12MB；
 * 而这个包的 `assets/` 是进 git 的，仓库会被撑大六倍。512 够撑满最大那个图位。
 *
 * 用法：
 *   node scripts/stock-fetch-people.mjs <索引页正文文件>     抓取并转换
 *   node scripts/stock-fetch-people.mjs <索引页正文文件> --dry-run
 *
 * **索引页是客户端渲染的**（`curl https://gendo.ai/cutout-database` 只拿到 1.7KB 的空壳），
 * 所以正文要自己取一份下来——用能跑 JS 的抓取工具（Firecrawl 之类）把
 * `https://gendo.ai/cutout-database` 转成 markdown 存成文件传进来即可。
 * 页面结构变了脚本会解析不出条目并如实报错，不会静默下成空批。
 *
 * 已经在 `assets/` 里的会跳过，所以中断之后重跑能接着来，不会从头再下。
 * 下完还要跑一次 `pnpm stock:add` 补色板——那是唯一会解 PNG 算代表色的地方。
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(root, 'packages/stock-library/assets');
const STAGING = join(tmpdir(), 'lumen-people-staging');

const dryRun = process.argv.includes('--dry-run');
const indexFile = process.argv.slice(2).find((a) => !a.startsWith('--'));

/** 六个族裔 × 男女，每组合取几张。姿态轮转着取，落到页面上的不是一个模子 */
const ETHNICITIES = [
  { key: 'african', en: 'African', zh: '非洲' },
  { key: 'arabic', en: 'Arabic', zh: '阿拉伯' },
  { key: 'asian', en: 'Asian', zh: '东亚' },
  { key: 'caucasian', en: 'Caucasian', zh: '欧美' },
  { key: 'hispanic', en: 'Hispanic', zh: '拉美' },
  { key: 'indian', en: 'Indian', zh: '南亚' },
];
const PER_GROUP = 5;
const POSES = ['Walking', 'Standing', 'Sitting', 'Running', 'Jogging'];
const POSE_ZH = { Walking: '行走', Standing: '站立', Sitting: '坐姿', Running: '奔跑', Jogging: '慢跑' };
const GENDER_ZH = { Male: '男', Female: '女' };

/** 目标边长。见文件头「顺带缩到 512」 */
const EDGE = 512;

function parseIndex(html) {
  const re = /\[!\[([^\]]+)\]\(https:\/\/gendo\.ai\/cutouts\/256\/([a-f0-9-]+)-256\.png\)\]\(https:\/\/gendo\.ai\/cutout-database\/([a-z0-9-]+)\)[\s\S]{0,200}?\[Download PNG\]\(https:\/\/gendo\.ai\/cutouts\/full\/([a-f0-9-]+)\.png\)/g;
  const out = [];
  let m;
  while ((m = re.exec(html))) out.push({ title: m[1], slug: m[3], id: m[4] });
  return out;
}

/** 每个「族裔 × 性别」抽 PER_GROUP 张，姿态轮转着取 */
function choose(all) {
  const picked = [];
  for (const eth of ETHNICITIES) {
    for (const gender of ['Male', 'Female']) {
      const pool = all.filter((x) => x.title.includes(eth.en) && x.title.includes(gender));
      const byPose = POSES.map((p) => pool.filter((x) => x.title.startsWith(p)));
      const chosen = [];
      const used = new Set();
      for (let round = 0; chosen.length < PER_GROUP; round += 1) {
        let added = false;
        for (const list of byPose) {
          if (chosen.length >= PER_GROUP) break;
          const x = list[round];
          if (x && !used.has(x.id)) { chosen.push(x); used.add(x.id); added = true; }
        }
        if (!added) break;
      }
      for (const x of pool) {
        if (chosen.length >= PER_GROUP) break;
        if (!used.has(x.id)) { chosen.push(x); used.add(x.id); }
      }
      for (const [i, x] of chosen.entries()) {
        picked.push({ ...x, eth: eth.key, ethZh: eth.zh, gender, index: i + 1 });
      }
    }
  }
  return picked;
}

/** 一条清单项里除色板外的那部分。色板由 `pnpm stock:add` 补 */
function metaOf(p, pose) {
  return {
    kind: 'people',
    author: 'Gendo AI',
    source: `https://gendo.ai/cutout-database/${p.slug}`,
    license: 'Gendo Free Cutout Database（可商用，无需署名）',
    tone: 'light',
    transparent: true,
    palette: [],
    tags: [POSE_ZH[pose] ?? pose, GENDER_ZH[p.gender], p.ethZh, '人物', '透明底'].filter(Boolean),
  };
}

async function download(url, dest) {
  // 单张卡住时不至于把整批拖死——实测有一轮在第 36 张上挂了六分钟没动静
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function main() {
  if (!indexFile) {
    console.error('用法：node scripts/stock-fetch-people.mjs <索引页正文文件> [--dry-run]');
    console.error('索引页 https://gendo.ai/cutout-database 是客户端渲染的，要用能跑 JS 的抓取工具');
    console.error('把它转成 markdown 存成文件再传进来（见脚本头部注释）。');
    process.exit(1);
  }

  const all = parseIndex(readFileSync(indexFile, 'utf8'));
  if (all.length === 0) {
    console.error(`没从 ${indexFile} 里解析出任何条目。页面结构可能变了`);
    process.exit(1);
  }
  const picked = choose(all);
  console.log(`索引里 ${all.length} 张，选中 ${picked.length} 张\n`);

  const poseCount = {};
  for (const p of picked) {
    const pose = p.title.split(' ')[0];
    poseCount[pose] = (poseCount[pose] ?? 0) + 1;
  }
  console.log('姿态分布：', Object.entries(poseCount).map(([k, v]) => `${POSE_ZH[k] ?? k}=${v}`).join('  '));
  console.log('族裔分布：', ETHNICITIES.map((e) => `${e.zh}=${picked.filter((p) => p.eth === e.key).length}`).join('  '));

  if (dryRun) {
    console.log('\n--dry-run：未下载');
    return;
  }

  rmSync(STAGING, { recursive: true, force: true });
  mkdirSync(STAGING, { recursive: true });
  mkdirSync(ASSETS, { recursive: true });

  const entries = [];
  const failed = [];
  for (const p of picked) {
    const pose = p.title.split(' ')[0];
    const file = `people-${p.eth}-${p.gender === 'Male' ? 'm' : 'f'}-${p.index}.png`;
    const raw = join(STAGING, `raw-${file}`);
    const out = join(ASSETS, file);
    // 已经在 assets 里的跳过。这张批次跑一半挂了，重跑要能接着来，不能从零开始
    if (existsSync(out)) {
      entries.push({ file, ...metaOf(p, pose) });
      continue;
    }
    try {
      await download(`https://gendo.ai/cutouts/full/${p.id}.png`, raw);
      // 转真彩 + alpha 并缩放。`-compression_level` 对 PNG 无效，这里靠默认档
      execFileSync('ffmpeg', [
        '-y', '-v', 'error', '-i', raw,
        '-vf', `scale=${EDGE}:${EDGE}:flags=lanczos`,
        '-pix_fmt', 'rgba',
        out,
      ]);
      if (!existsSync(out)) throw new Error('转换后没有产物');
      entries.push({ file, ...metaOf(p, pose) });
      process.stdout.write(`+ ${file}\n`);
    } catch (err) {
      failed.push({ file, reason: err instanceof Error ? err.message : String(err) });
      console.error(`! ${file}  ${failed.at(-1).reason}`);
    }
  }

  writeFileSync(join(STAGING, 'entries.json'), `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
  console.log(`\n下到 ${entries.length} 张${failed.length ? `，失败 ${failed.length} 张` : ''}`);
  console.log(`清单片段写到 ${join(STAGING, 'entries.json')}，接着跑 pnpm stock:add 补色板`);
}

main();
