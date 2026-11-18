#!/usr/bin/env node
// 品牌一致性护栏：源码中禁止出现 emoji。
// PRD §3.6 / §8：构建期 lint 扫描 emoji 字符与图片资源，命中即构建失败。

import { readFileSync, readdirSync } from 'node:fs';
import { join, extname, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// emoji 码点区间（不含已废弃的箭头/几何符号区，避免误伤正常排版字符）
const EMOJI_RANGES = [
  [0x1f000, 0x1f0ff], // 麻将/多米诺/扑克
  [0x1f100, 0x1f2ff], // 带圈字母数字补充
  [0x1f300, 0x1f5ff], // 杂项符号与象形文字
  [0x1f600, 0x1f64f], // 表情
  [0x1f650, 0x1f67f], // 装饰性符号
  [0x1f680, 0x1f6ff], // 交通与地图符号
  [0x1f700, 0x1f77f], // 炼金术符号
  [0x1f780, 0x1f7ff], // 几何扩展
  [0x1f800, 0x1f8ff], // 补充箭头
  [0x1f900, 0x1f9ff], // 补充符号与象形文字
  [0x1fa00, 0x1faff], // 扩展 A
  [0x1fb00, 0x1fbff], // 传统计算符号
  [0x2600, 0x26ff],   // 杂项符号（含太阳/云/电话等）
  [0x2700, 0x27bf],   // 装饰符号（含剪刀/对勾/星）
  [0x2b00, 0x2bff],   // 杂项符号与箭头（含五角星/圆）
  [0xfe0f, 0xfe0f],   // 变体选择符-16
  [0x200d, 0x200d],   // 零宽连接符（emoji 序列构成符）
  [0x20e3, 0x20e3],   // 组合包围键帽
  [0x1f1e6, 0x1f1ff], // 区域指示符（国旗）
];

const SCAN_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.html', '.json', '.md']);
// `.claude` 里放的是会话元数据与**工作树副本**（`.claude/worktrees/<name>/` 是整个仓库的一份拷贝）。
// 不跳过它有两个后果：同一处违规被按副本数重复报，以及**构建结果取决于别的会话留下了什么工作树**
// ——别人分支里的 emoji 会让这边的 `pnpm build` 转红，而这边根本改不到那些文件。
//
// `data` 与 `data-sync` 是**用户内容**（数据库、上传的文件，以及项目数据导出的副本），
// 不是源码。用户页面上真写了勾叉这类符号，不该按「界面图标不许用 emoji」来判。
//
// `.cache` 是**批量脚本的中间产物**（模型的原始输出、缓存、报告），可重算、不进版本库。
// 里面的 emoji 多半来自参考图的文件名（小红书导出的图名常带表情符号），模型原样抄进
// JSON 而已——拿它卡构建，等于让「用户怎么命名素材」决定这边能不能出包。
/*
  `scratch` 是 `apps/worker/scratch/`——跑验证脚本时落下的截图与联络表，不进版本库、也不上线。
  里面的 HTML 会把参考图的**文件名**原样写进去（小红书导出的图名里全是 emoji），
  那不是「把 emoji 当界面图标用」，拦下来只会让人每次都要手动清一遍临时目录。
*/
const SKIP_DIRS = new Set(['node_modules', 'dist', '.turbo', '.git', '.claude', 'data', 'data-sync', 'coverage', '.cache', 'scratch']);

/**
 * 找出文本中所有 emoji 字符。
 * 列号按 UTF-16 码元计数（1 起），与 VS Code / ESLint 的报错列号一致。
 * @param {string} text
 * @returns {{ line: number, col: number, char: string, codePoint: string }[]}
 */
export function findEmoji(text) {
  const hits = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      const cp = line.codePointAt(j);
      if (cp === undefined) continue;
      const inRange = EMOJI_RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);
      if (inRange) {
        hits.push({
          line: i + 1,
          col: j + 1,
          char: String.fromCodePoint(cp),
          codePoint: 'U+' + cp.toString(16).toUpperCase().padStart(4, '0'),
        });
      }
      if (cp > 0xffff) j++; // 跳过代理对低位
    }
  }
  return hits;
}

/** 递归收集待扫描文件 */
function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      walk(join(dir, e.name), out);
    } else if (e.isFile()) {
      if (SCAN_EXT.has(extname(e.name))) out.push(join(dir, e.name));
    }
  }
  return out;
}

/** 扫描入口：返回所有违规 */
export function scanTree(root) {
  const violations = [];
  for (const file of walk(root)) {
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const hit of findEmoji(text)) {
      violations.push({ file: relative(root, file), ...hit });
    }
  }
  return violations;
}

const isMain = process.argv[1] ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href : false;

if (isMain) {
  const root = process.cwd();
  const violations = scanTree(root);
  if (violations.length > 0) {
    console.error(`emoji lint 失败：发现 ${violations.length} 处 emoji 字符（PRD §3.6 禁止 emoji 作为界面图标）`);
    for (const v of violations.slice(0, 50)) {
      console.error(`  ${v.file}:${v.line}:${v.col}  ${v.codePoint}`);
    }
    if (violations.length > 50) console.error(`  ... 另有 ${violations.length - 50} 处`);
    process.exit(1);
  }
  console.log('emoji lint 通过：未发现 emoji 字符');
}
