#!/usr/bin/env node
/**
 * 把放进 `packages/stock-library/assets/` 的 PNG 收进清单。
 *
 * 清单原先是一份手写的 JSON，加一张图要手抄色板与明暗。这个脚本把「能算的那部分」
 * 算出来，**只增不改**：已经在清单里的文件一律跳过，绝不覆盖手填的 author / source /
 * license / tags。跑完之后把要补的作者与来源自己填上。
 *
 * 用法（与其它脚本一样要带 tsx，因为算色板要解 PNG）：
 *   pnpm stock:add
 *   pnpm stock:add -- --dry-run
 *
 * 只认 PNG：抠图是透明底的，JPEG 存不了 alpha。照片那 28 张是外部生成的，本脚本不动它们。
 */

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzePng, kindFromFilename } from '../packages/stock-library/src/analyze.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(root, 'packages/stock-library/assets');
const MANIFEST = join(ASSETS, 'manifest.json');

const dryRun = process.argv.includes('--dry-run');

/** 清单里每条键的书写顺序。与手写的那份一致，diff 才读得下去 */
const KEY_ORDER = ['file', 'kind', 'author', 'source', 'license', 'tone', 'transparent', 'palette', 'tags'];

function orderedEntry(entry) {
  const out = {};
  for (const k of KEY_ORDER) if (entry[k] !== undefined) out[k] = entry[k];
  for (const k of Object.keys(entry)) if (!(k in out)) out[k] = entry[k];
  return out;
}

function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const known = new Set(manifest.map((e) => e.file));
  const pngs = readdirSync(ASSETS).filter((f) => f.toLowerCase().endsWith('.png')).sort();

  const added = [];
  const failed = [];
  for (const file of pngs) {
    if (known.has(file)) continue;
    // 题材从文件名前缀认，认不出就跳过并报出来——不能兜底成人物：
    // 物件被打成人物会掉进人像池，而物件池一张都收不到，页面上不报错
    const kind = kindFromFilename(file);
    if (!kind) {
      failed.push({ file, reason: '文件名前缀认不出题材（要以 people- 或 object- 开头）' });
      continue;
    }
    try {
      added.push(analyzePng(file, readFileSync(join(ASSETS, file)), kind));
    } catch (err) {
      // 16 位色深与隔行 PNG 解不了。如实报出来，别让整批停下——
      // 用户重新导一次比一句「不支持」有用
      failed.push({ file, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  if (added.length === 0 && failed.length === 0) {
    console.log(`清单已是最新：${pngs.length} 张 PNG 全在里面，共 ${manifest.length} 条`);
    return;
  }

  for (const e of added) {
    console.log(`+ ${e.file}  ${e.kind}  ${e.tone}  ${e.transparent ? '透明底' : '不透明'}  ${e.palette.join(' ')}`);
  }
  for (const f of failed) {
    console.error(`! ${f.file}  跳过：${f.reason}`);
  }

  if (dryRun) {
    console.log(`\n--dry-run：本来会新增 ${added.length} 条，未写入`);
    return;
  }

  const next = [...manifest, ...added.map(orderedEntry)];
  writeFileSync(MANIFEST, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  console.log(`\n清单：${manifest.length} → ${next.length} 条。author / source / license / tags 还是空的，记得手填`);
}

main();
