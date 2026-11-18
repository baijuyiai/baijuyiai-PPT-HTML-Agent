/**
 * 把风格库里界面页样机**嵌死的设备几何**换成当前渲染出来的那一份。
 *
 * ## 问题
 *
 * 样机是一份冻结的 HTML，里面嵌着三样**由渲染算出来**的东西：外壳图的裁剪盒
 * （`.ui-shell` 的 left/top/width/height 与 background-size）、屏幕的 `matrix3d`、
 * 机身与屏幕的步进时序。设备一重渲（改相机、改模型），这些数就全过期了——
 * 而样机里的文字与设计还是好的，页面上表现为**界面和模型错位**。
 *
 * 实测：相机俯角那次改动之后，11 套样机全过期。macbook 的裁剪盒从 654×626 变成
 * 595×507，样机里还是旧的，屏幕就比机身大了 22%（用户报的就是这个）。
 *
 * ## 为什么不重跑识别
 *
 * 重跑会把 11 套样机的**文案与设计全部换掉**——而用户要的是「修错位」不是「重做」。
 * 这里只换设备那一块：HTML 用 `injectDevice` 重新生成（与识别时同一份代码，
 * 数学只有一处），CSS 把带 `-N` 后缀的规则整组换掉，其余一个字不动。
 *
 * ## 跑法（仓库根目录）
 *
 * ```
 * node --import tsx scripts/repair-ui-pages.ts            # 只看要改哪些
 * node --import tsx scripts/repair-ui-pages.ts --apply
 * ```
 * 改完记得 `pnpm style:export`。
 */
import { all } from '../packages/server-core/src/db/client.ts';
import { resolveStyleDoc, saveStyleDoc } from '../packages/server-core/src/services/style-doc.service.ts';
import { UI_LAYOUTS } from '../packages/ir-schema/src/ui-layouts.ts';
import { DEVICE_OF_GROUP, injectDevice } from './lib/ui-device.ts';

const apply = process.argv.includes('--apply');

/**
 * 从**注入之后**的骨架里读出每台设备的槽位样式与类型。
 *
 * `ui-skeletons.ts` 里存的是注入后的骨架——`.ui-dev-slot` 已经被换成 `.ui-dev-N` 了，
 * 所以 `slotsIn` 读不到。但两样东西都还在：`.ui-dev-N` 元素的**行内样式**就是当初那个
 * 空框的样式（注入时原样留在外层），`.ui-shell-N` 的 `background-image` 里带着场景名。
 */
function devicesOfInjected(skeleton: string): { device: string; style: string }[] {
  const out: { device: string; style: string }[] = [];
  for (let n = 1; n <= 20; n += 1) {
    const m = new RegExp(`<div\\b[^>]*\\bclass="[^"]*\\bui-dev ui-dev-${n}\\b[^"]*"[^>]*>`).exec(skeleton);
    if (!m) break;
    const style = /style="([^"]*)"/i.exec(m[0])?.[1] ?? '';
    const scene = new RegExp(`\\.ui-shell-${n}\\{[^}]*devices/([\\w-]+)-turn\\.webp`).exec(skeleton)?.[1] ?? '';
    const group = Object.entries(DEVICE_OF_GROUP).find(([, s]) => s === scene)?.[0] ?? '';
    out.push({ device: group, style });
  }
  return out;
}

/** 第 n 台设备的完整 HTML（含嵌套的 div）。找不到回 null */
function deviceBlock(html: string, n: number): { start: number; end: number } | null {
  const m = new RegExp(`<div\\b[^>]*\\bclass="[^"]*\\bui-dev ui-dev-${n}\\b[^"]*"[^>]*>`, 'i').exec(html);
  if (!m) return null;
  let depth = 1;
  const tag = /<\/?div\b[^>]*>/gi;
  tag.lastIndex = m.index + m[0].length;
  let t: RegExpExecArray | null;
  while ((t = tag.exec(html)) !== null) {
    depth += t[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return { start: m.index, end: t.index + t[0].length };
  }
  return null;
}

/**
 * 去掉 `<style>` 里所有与第 n 台设备有关的规则。
 *
 * 按**顶层规则**切，不是按 `}` 切——`@media{…{…}}` 里还有一层花括号，
 * 按 `}` 切会把 @media 切碎、留下半个块把后面的规则全吞掉。
 */
function stripDeviceCss(css: string, n: number): string {
  const hits = (sel: string) => new RegExp(`\\bui-(dev|stage|screen|shell)-${n}\\b`).test(sel);
  let out = '';
  let i = 0;
  while (i < css.length) {
    const open = css.indexOf('{', i);
    if (open < 0) { out += css.slice(i); break; }
    const sel = css.slice(i, open);
    // 找与这个 `{` 配对的 `}`
    let depth = 1, j = open + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === '{') depth += 1;
      else if (css[j] === '}') depth -= 1;
      j += 1;
    }
    const body = css.slice(open + 1, j - 1);
    // 整条规则（含 @media）里只要提到这台设备的类名就整块丢掉
    if (!hits(sel) && !hits(body)) out += css.slice(i, j);
    i = j;
  }
  return out;
}

let changed = 0;
for (const row of all<{ styleId: string; name: string }>('SELECT styleId, name FROM style_docs ORDER BY name')) {
  const doc = resolveStyleDoc(row.styleId);
  const page = doc.pagePrompts.ui;
  if (!page) continue;

  const layout = UI_LAYOUTS.find((l) => l.id === page.layoutId);
  if (!layout) { console.log(`${row.name}：界面页没绑版式（或绑的版式找不到了），跳过`); continue; }
  const slots = devicesOfInjected(layout.skeleton);
  if (slots.length === 0) { console.log(`${row.name}：版式里读不出设备，跳过`); continue; }

  let html = page.mockHtml;
  const css: string[] = [];
  let ok = true;
  for (const [i, s] of slots.entries()) {
    const n = i + 1;
    const out = injectDevice({ group: s.device, slotStyle: s.style, index: n, imageSlot: n });
    const block = deviceBlock(html, n);
    if (!block) { console.log(`${row.name}：样机里找不到第 ${n} 台设备（模型可能改过它），跳过`); ok = false; break; }
    html = html.slice(0, block.start) + out.html + html.slice(block.end);
    css.push(out.css);
  }
  if (!ok) continue;

  // 设备 CSS 整组换掉：先抠掉旧的，再把新的接到 `<style>` 末尾
  const styleRe = /(<style[^>]*>)([\s\S]*?)(<\/style>)/i;
  const sm = styleRe.exec(html);
  if (!sm) { console.log(`${row.name}：样机里没有 <style>，跳过`); continue; }
  let inner = sm[2]!;
  for (let n = 1; n <= slots.length; n += 1) inner = stripDeviceCss(inner, n);
  html = html.slice(0, sm.index) + sm[1] + inner + css.join('') + sm[3] + html.slice(sm.index + sm[0].length);

  const before = page.mockHtml;
  if (before === html) { console.log(`${row.name}：已经是最新的`); continue; }

  const m3d = /matrix3d\(([-\d.]+)/.exec(html);
  console.log(`${row.name}：换掉 ${slots.length} 台设备的几何（屏幕矩阵首项 ${m3d ? Number(m3d[1]).toFixed(4) : '?'}）`);
  changed += 1;
  if (apply) {
    saveStyleDoc({ ...doc, pagePrompts: { ...doc.pagePrompts, ui: { ...page, mockHtml: html } } });
  }
}

console.log(apply ? `\n改了 ${changed} 套。接着跑 pnpm style:export` : `\n（只看了看，加 --apply 才真改）共 ${changed} 套要改`);
process.exit(0);
