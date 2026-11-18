/**
 * 把风格库样机上的文字改成**方向性占位**。
 *
 * ## 为什么要改
 *
 * 样机是「这套风格的这一页长什么样」的示例，而它上面的字现在是**具体内容**——
 * 「蔚蓝科技商务风」的封面样机里写着「企业年报 / ANNUAL REPORT」「以数字驱动企业增长」
 * 「汇报人：李承远」「2024.12.18」。一张样机只能配一个项目，谈不上通用；而生成中那张
 * 画布要拿它当**通用框架**（见 `GenerationReveal`），所以文字要换成「这里主要讲解的核心内容」
 * 这类方向性占位——任何项目、任何页类型看着都成立。
 *
 * ## 为什么是改写而不是重跑
 *
 * 重跑一次识别会把样机的**文案与设计一起换掉**（每张线上四分钟，156 张两三个小时），
 * 而这里要的是「换掉文字、版式一个像素不动」。与 `repair-ui-pages.ts` 同一个路子：
 * 定点改，其余不动。
 *
 * 改法是**文本节点级**的（`textRunsOf` / `applyTextRuns`）：标签、属性、样式一个字节都不碰，
 * 而且写回时会转义。占位的长度按原文的**视觉长度**对齐（汉字算 1、拉丁与数字算 0.55），
 * 于是换完之后同一段的换行数不变——这是「版式没动」的实际判据。差得多的会单独列出来。
 *
 * ## 跑法（仓库根目录）
 *
 * ```
 * node --import tsx scripts/rewrite-mock-copy.ts                              # 只看要改哪些（dry-run）
 * node --import tsx scripts/rewrite-mock-copy.ts --only 蔚蓝科技商务风,暖调纸感编辑风
 * node --import tsx scripts/rewrite-mock-copy.ts --page cover                # 只看某一页类型
 * node --import tsx scripts/rewrite-mock-copy.ts --apply                     # 真写
 * ```
 *
 * ## `--reseat <file>`：按原文**重贴**一遍（判据改了之后用）
 *
 * 改写是**不可逆**的：库里那一段被换成占位之后，原文就没了，判据再改也无从下手。
 * 所以判据升级时要拿一份**改写之前**的样机当原文（`git show HEAD:packages/style-library/assets/styles.json`），
 * 逐段重贴：现在那段是占位（说明当初改过）就按原文重新贴，本来就是原文的段一律不碰。
 *
 * 一切长度档位都变了的那种升级（把「档位太粗、占位可能比原文长」修掉）走这一条，
 * 而不是重跑 `--apply`——`--apply` 会把这些占位当成「已经是占位」直接跳过。
 *
 * ```
 * git show HEAD:packages/style-library/assets/styles.json > /tmp/styles-head.json
 * node --import tsx scripts/rewrite-mock-copy.ts --reseat /tmp/styles-head.json
 * node --import tsx scripts/rewrite-mock-copy.ts --reseat /tmp/styles-head.json --apply
 * ```
 *
 * 真写完记得 `pnpm style:export`（导出 `packages/style-library/assets/styles.json`，
 * pre-push 钩子会校验两边一致）。
 */
import { readFileSync } from 'node:fs';
import { listStyleDocs, resolveStyleDoc, saveStyleDoc } from '../packages/server-core/src/services/style-doc.service.ts';
import { isPlaceholderCopy, placeholderCopy, rewriteMockCopy } from '../packages/server-core/src/services/mock-copy.ts';
import { applyTextRuns, textRunsOf } from '../packages/ir-schema/src/html-doc.ts';
import { PAGE_TYPE_LABEL, PAGE_TYPE_ORDER } from '../packages/ir-schema/src/style-doc.ts';

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const valueOf = (flag: string): string | undefined => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};
const only = (valueOf('--only') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const onlyPage = valueOf('--page');
const reseatFile = valueOf('--reseat');

/**
 * 按原文重贴一页：库里现在这段是占位就按原文（改写之前那版）重新挑一个，否则不碰。
 *
 * 新版判据说「这段留着不动」（页码、数字、符号、图表数据，或者原文本身就是占位）时，
 * 要把**原文写回去**——库里那份是上一版换出来的占位（`01.` 被换成「标签」、
 * `CONTENTS` 被换成「SECTION / 栏目」），留着它就比原文长、也不如原文贴。
 *
 * 首尾空白要原样留着——一段行内文字两边的空格是排版的一部分。
 */
function reseatPage(current: string, original: string): { html: string; changed: number; restored: number; skipped: number; unpaired: boolean } {
  const cur = textRunsOf(current);
  const org = textRunsOf(original);
  if (cur.length !== org.length) return { html: current, changed: 0, restored: 0, skipped: 0, unpaired: true };
  const edits: { i: number; text: string }[] = [];
  let skipped = 0;
  let restored = 0;
  for (let k = 0; k < cur.length; k++) {
    const raw = cur[k]!.text;
    const lead = /^\s*/.exec(raw)![0];
    const trail = /\s*$/.exec(raw)![0];
    const inner = raw.slice(lead.length, raw.length - trail.length);
    if (!isPlaceholderCopy(inner)) continue;
    const next = placeholderCopy(org[k]!.text, org[k]!.tag, org[k]!.i);
    if (next === inner) { skipped += 1; continue; }
    const back = org[k]!.text.trim();
    if (next === null) {
      // 新版判据说留着：把原文写回去（库里原本就是原文的话不用动）
      if (back === inner) { skipped += 1; continue; }
      edits.push({ i: cur[k]!.i, text: lead + back + trail });
      restored += 1;
      continue;
    }
    edits.push({ i: cur[k]!.i, text: lead + next + trail });
  }
  return { html: applyTextRuns(current, edits), changed: edits.length - restored, restored, skipped, unpaired: false };
}

const all = listStyleDocs({ limit: 500 }).items;
const targets = only.length > 0
  ? all.filter((s) => only.includes(s.name) || only.includes(s.styleId))
  : all;
if (targets.length === 0) {
  console.error(`没有匹配的风格：${only.join(',')}（库里共 ${all.length} 套）`);
  process.exit(1);
}
/** `--reseat` 时这份是**改写之前**的样机（`git show HEAD:…` 那份） */
const reseatDocs = reseatFile
  ? (JSON.parse(readFileSync(reseatFile, 'utf8')) as { name: string; pagePrompts: Record<string, { mockHtml?: string }> }[])
  : null;
console.log(`${apply ? '真写' : 'dry-run'}：${targets.length} 套风格${onlyPage ? `，只看 ${onlyPage}` : ''}`
  + `${reseatDocs ? `，按 ${reseatFile} 里的原文重贴` : ''}\n`);

let pages = 0;
let runs = 0;
let riskyTotal = 0;
for (const sum of targets) {
  const doc = resolveStyleDoc(sum.styleId);
  const next = { ...doc, pagePrompts: { ...doc.pagePrompts } };
  const lines: string[] = [];
  let ownPages = 0;
  let ownRuns = 0;

  for (const pageType of PAGE_TYPE_ORDER) {
    if (onlyPage && pageType !== onlyPage) continue;
    const p = next.pagePrompts[pageType];
    if (!p || !p.mockHtml.trim()) continue;

    if (reseatDocs) {
      const orig = reseatDocs.find((d) => d.name === doc.name)?.pagePrompts[pageType]?.mockHtml ?? '';
      if (!orig.trim()) continue;
      const r = reseatPage(p.mockHtml, orig);
      if (r.unpaired) {
        console.log(`   ⚠ ${PAGE_TYPE_LABEL[pageType]}(${pageType})：文字段数对不上（${textRunsOf(p.mockHtml).length} vs ${textRunsOf(orig).length}），跳过`);
        continue;
      }
      if (r.changed === 0 && r.restored === 0) continue;
      ownPages += 1;
      ownRuns += r.changed + r.restored;
      lines.push(`   ${PAGE_TYPE_LABEL[pageType]}(${pageType})：重贴 ${r.changed} 段`
        + `${r.restored > 0 ? `，还原 ${r.restored} 段` : ''}`
        + `${r.skipped > 0 ? `（另有 ${r.skipped} 段没得贴）` : ''}`);
      next.pagePrompts[pageType] = { ...p, mockHtml: r.html };
      continue;
    }

    const r = rewriteMockCopy(p.mockHtml);
    if (r.changed === 0) continue;
    ownPages += 1;
    ownRuns += r.changed;
    riskyTotal += r.risky.length;
    lines.push(`   ${PAGE_TYPE_LABEL[pageType]}(${pageType})：改 ${r.changed}/${r.runs} 段`);
    for (const risk of r.risky.slice(0, 3)) lines.push(`      ⚠ 长度差得多：${risk}`);
    if (r.risky.length > 3) lines.push(`      ⚠ 另有 ${r.risky.length - 3} 段长度差得多`);
    next.pagePrompts[pageType] = { ...p, mockHtml: r.html };
  }

  if (ownPages === 0) {
    console.log(`${doc.name}：没有要改的（可能已经改过了）`);
    continue;
  }
  console.log(`${doc.name}：${ownPages} 页 / ${ownRuns} 段`);
  for (const line of lines) console.log(line);
  pages += ownPages;
  runs += ownRuns;

  if (apply) {
    const res = saveStyleDoc(next);
    console.log(res.ok ? '   ✓ 已写入' : `   ✗ 写入失败：${JSON.stringify(res)}`);
  }
}

console.log(`\n合计：${pages} 页样机 / ${runs} 段文字${riskyTotal > 0 ? `，其中 ${riskyTotal} 段长度差得多` : ''}`);
console.log(apply ? '\n写完记得 `pnpm style:export`。' : '\n这是 dry-run，真写加 `--apply`。');
