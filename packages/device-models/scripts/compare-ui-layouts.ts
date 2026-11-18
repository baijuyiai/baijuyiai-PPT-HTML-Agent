/**
 * 参考图 ↔ 生成骨架 **并排对照表**。
 *
 * ## 为什么需要它
 *
 * 「接近度 90%」这句话没法对着单张渲染图判断——必须把**参考图和生成结果摆在一起**，
 * 一眼看出差在哪：设备大小不对、文案跑到另一边、背景光晕没做、底部那条毛玻璃没有。
 * 单看生成结果会觉得「挺好看」，单看参考图又会记不住。
 *
 * ## 数据从哪来
 *
 * 直接读 `scripts/.cache/ui-layouts/` 的缓存（**不是** `ui-skeletons.ts`）——
 * 缓存里带着「这份版式是从哪张图认出来的」，而生成文件里没有这个信息。
 * 读缓存还顺带保证了看到的就是识别当时的原样。
 *
 * 跑法（仓库根目录）：
 * ```
 * node --import tsx packages/device-models/scripts/compare-ui-layouts.ts
 * node --import tsx packages/device-models/scripts/compare-ui-layouts.ts --only 4521220033
 * ```
 * 产物：`scripts/.out/ui-compare.png`（联络表）与逐张的 `.out/cmp-N.png`。
 */
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { injectDevices } from '../../../scripts/lib/ui-device.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..', '..', '..');
const OUT = path.join(HERE, '.out');
const STOCK = path.join(HERE, '..', '..', 'stock-library', 'assets');
const CACHE = path.join(ROOT, 'scripts', '.cache', 'ui-layouts');
const REFS = 'C:/Users/41945/Desktop/HTML-PPT/界面排版';
mkdirSync(OUT, { recursive: true });

const W = 1920;
const H = 1080;

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i < 0 ? undefined : process.argv[i + 1];
};

const VARS = `:root{--bg:#EFE6DA;--surface:#F7F1E8;--text:#3A322B;--muted:#8A7F73;--accent:#E08A3C;--brand:#C7421A;--border:#D8CDBF;
--font-sans:system-ui,-apple-system,sans-serif;--font-display:Georgia,"Times New Roman",serif;--font-script:"Segoe Script",cursive}
html,body{margin:0;background:#20232a}
/* 屏幕里铺测试图案：真图由下游填，这里没有，孔会是空的——而「空的」和「没贴上去」在缩略图里分不出 */
.ui-screen img{background:
  repeating-linear-gradient(0deg,#0b3d3a 0 2px,transparent 2px 46px),
  repeating-linear-gradient(90deg,#0b3d3a 0 2px,transparent 2px 46px),
  linear-gradient(#12a594,#12a594);box-shadow:inset 0 0 0 5px #e5484d}`;

/* ---------------- 收集 ---------------- */

interface Item { ref: string; name: string; skeleton: string }
const only = arg('only');
const items: Item[] = [];

for (const f of readdirSync(CACHE).filter((x) => x.endsWith('.json') && x !== 'report.json').sort()) {
  const r = JSON.parse(readFileSync(path.join(CACHE, f), 'utf8')) as {
    image: string; layouts: { name: string; skeleton: string }[];
  };
  if (only && !r.image.includes(only)) continue;
  for (const l of r.layouts) items.push({ ref: r.image, name: l.name, skeleton: l.skeleton });
}
if (items.length === 0) throw new Error(`缓存里没有匹配的版式（目录 ${CACHE}）`);

/* ---------------- 服务 ---------------- */

const MIME: Record<string, string> = {
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.html': 'text/html; charset=utf-8',
};
const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const file = url.startsWith('/stock/')
    ? path.join(STOCK, url.slice('/stock/'.length))
    : path.join(OUT, url.replace(/^\/+/, ''));
  if (!file.startsWith(STOCK) && !file.startsWith(OUT)) { res.writeHead(403).end(); return; }
  try {
    // 先读出来再写响应头：读不到时 catch 里改发 404，头已经发出去了会报 ERR_HTTP_HEADERS_SENT
    const body = readFileSync(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
const PORT = (server.address() as { port: number }).port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const bad: string[] = [];
page.on('response', (r) => {
  if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) bad.push(`${r.status()} ${r.url()}`);
});

/* ---------------- 逐张渲染 ---------------- */

const shots: { file: string; ref: string; name: string }[] = [];
for (const [i, it] of items.entries()) {
  const { html } = injectDevices(it.skeleton);
  const pageFile = `cmp-${String(i).padStart(2, '0')}.html`;
  writeFileSync(path.join(OUT, pageFile),
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${VARS}</style></head><body>${html}</body></html>`, 'utf8');
  bad.length = 0;
  await page.goto(`http://127.0.0.1:${PORT}/${pageFile}`, { waitUntil: 'load' });
  await page.waitForTimeout(120);
  for (const b of bad) console.error(`${it.ref}：${b}`);
  const file = path.join(OUT, `cmp-${String(i).padStart(2, '0')}.png`);
  await page.screenshot({ path: file });
  shots.push({ file, ref: it.ref, name: it.name });
}

/* ---------------- 联络表 ---------------- */

/**
 * 参考图**按高度对齐**排在上排，生成结果排在下排。
 * 参考图什么比例都有（从 928×699 到 2880×2160），所以按高度缩放而不是按宽度——
 * 否则宽扁的那几张会占掉一整行。
 */
const CELL_H = 230;
const COLS = 3;
const rows = Math.ceil(shots.length / COLS);
const cells = shots.map((s) => {
  const refB64 = readFileSync(path.join(REFS, s.ref)).toString('base64');
  const mime = /\.png$/i.test(s.ref) ? 'image/png' : 'image/jpeg';
  const shotB64 = readFileSync(s.file).toString('base64');
  return `<figure>
    <div class="pair">
      <img class="ref" src="data:${mime};base64,${refB64}">
      <img class="gen" src="data:image/png;base64,${shotB64}">
    </div>
    <figcaption>${s.name} <span>· ${s.ref.replace(/^huaban-/, '').replace(/\.\w+$/, '')}</span></figcaption>
  </figure>`;
}).join('');

const sheet = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#14161a;font-family:ui-monospace,monospace}
.grid{display:grid;grid-template-columns:repeat(${COLS},1fr);gap:14px;padding:14px}
figure{margin:0}
.pair{display:flex;gap:8px;align-items:flex-start}
.pair img{display:block;background:#20232a}
.ref{height:${CELL_H}px;width:auto;max-width:46%}
.gen{height:${CELL_H}px;width:auto;max-width:52%}
figcaption{color:#c8ccd4;font-size:13px;padding:6px 2px}
figcaption span{color:#6f7683}
</style></head><body><div class="grid">${cells}</div></body></html>`;

const sp = await browser.newPage({ viewport: { width: COLS * 900 + 28, height: rows * (CELL_H + 40) } });
await sp.setContent(sheet, { waitUntil: 'load' });
await sp.screenshot({ path: path.join(OUT, 'ui-compare.png'), fullPage: true });

await browser.close();
server.close();
console.log(`${items.length} 份，对照表：${path.relative(process.cwd(), path.join(OUT, 'ui-compare.png'))}`);
