/**
 * 把**生成出来的** 36 份界面骨架整体渲一遍，拼成一张联络表。
 *
 * ## 为什么不在功能库里一张张点
 *
 * 功能库要登录、要翻页、卡片还是缩略的。而这里要看的恰恰是**每份骨架自己排得对不对**：
 * 设备有没有落在框里、屏幕有没有跟着机身、有没有哪一份漏了背景光晕或者文字压到设备上。
 * 一屏看全最快。
 *
 * 跑法（仓库根目录）：
 * ```
 * node --import tsx packages/device-models/scripts/sheet-ui-layouts.ts
 * ```
 * 产物在 `scripts/.out/ui-sheet.png`。
 */
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { UI_LAYOUTS } from '../../../packages/ir-schema/src/ui-layouts.ts';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '.out');
const STOCK = path.join(HERE, '..', '..', 'stock-library', 'assets');
mkdirSync(OUT, { recursive: true });

const W = 1920;
const H = 1080;

/** 骨架只许用变量取色，所以这套变量得由页面注入——与真渲染时那套同口径 */
const VARS = `:root{--bg:#EFE6DA;--surface:#F7F1E8;--text:#3A322B;--muted:#8A7F73;--accent:#E08A3C;--brand:#C7421A;--border:#D8CDBF;
--font-sans:system-ui,-apple-system,sans-serif;--font-display:Georgia,"Times New Roman",serif;--font-script:"Segoe Script",cursive}
html,body{margin:0;background:#20232a}
/*
  **屏幕里铺一张测试图案。** 真页面里那张图由下游填，这里没有，孔就是空的——
  而「孔是空的」和「屏幕没贴上去」在缩略图上长得一模一样。
  铺一张四周描边的网格：描边正好落在孔边上就是贴对了，露出底色说明 underscan，
  被边框吃掉一条说明 overscan 过头。
*/
.ui-screen img{background:
  repeating-linear-gradient(0deg,#0b3d3a 0 2px,transparent 2px 46px),
  repeating-linear-gradient(90deg,#0b3d3a 0 2px,transparent 2px 46px),
  linear-gradient(#12a594,#12a594);
  box-shadow:inset 0 0 0 5px #e5484d}`;

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
    // **先把文件读出来再写响应头。** 反过来的话，读不到文件时已经在 catch 里
    // 试图改发 404，而响应头早发出去了——报的是 `ERR_HTTP_HEADERS_SENT`，
    // 看着像服务坏了，其实是「没这个文件」。
    const body = readFileSync(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
const PORT = (server.address() as { port: number }).port;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

/*
  **取不到图要报出来。** 外壳图是 `url(/stock/devices/…)` 这种**根相对路径**，
  而 `page.setContent()` 出来的文档是 `about:blank`——根相对路径在那儿解析不了，
  图一张都取不到，而 `getComputedStyle(shell).backgroundImage` **照样返回那串 URL**，
  于是「图没加载」和「图加载了」在量出来的数据上一模一样，
  只有截图上是**设备整个不见了**。踩过一次，所以这里盯住 requestfailed。
*/
const failed: string[] = [];
page.on('requestfailed', (r) => failed.push(`取不到 ${r.url()}`));
// 用 `response` 而不是 `console`：控制台那句 404 **不带 URL**，只报「有个资源没找到」，
// 而 favicon 每次都会 404——分不清是外壳图没了还是浏览器在要图标
page.on('response', (r) => {
  if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) failed.push(`${r.status()} ${r.url()}`);
});

const shots: { file: string; label: string }[] = [];
const problems: string[] = [];

for (const [i, l] of UI_LAYOUTS.entries()) {
  const pageFile = `ui-layout-${String(i).padStart(2, '0')}.html`;
  writeFileSync(
    path.join(OUT, pageFile),
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${VARS}</style></head><body>${l.skeleton}</body></html>`,
    'utf8',
  );
  failed.length = 0;
  await page.goto(`http://127.0.0.1:${PORT}/${pageFile}`, { waitUntil: 'load' });
  await page.waitForTimeout(120);

  /*
    **每份都量一遍**：设备那几层在不在、外壳图取到没有、屏幕有没有落到机身上。
    只看截图的话，「屏幕比机身大一圈」和「屏幕正好」在缩略图里分不出来。
  */
  const m = await page.evaluate(`(() => {
    const dev = document.querySelector('.ui-dev');
    if (!dev) return { dev: false, hasShell: false, hasScreen: false };
    const shell = dev.querySelector('.ui-shell');
    const screen = dev.querySelector('.ui-screen');
    if (!shell || !screen) return { dev: true, hasShell: !!shell, hasScreen: !!screen };
    const bg = getComputedStyle(shell).backgroundImage;
    const b = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    const sb = b(shell), cb = b(screen);
    // 屏幕中心要落在外壳图里。整块飘到机身外的话，页面上是「一块界面浮在设备旁边」
    const cx = cb.x + cb.w / 2, cy = cb.y + cb.h / 2;
    return {
      dev: true, hasShell: true, hasScreen: true,
      sprite: /devices\\/([\\w-]+\\.webp)/.exec(bg)?.[1] ?? null,
      spriteUrl: /url\\("?([^")]+)"?\\)/.exec(bg)?.[1] ?? null,
      matrix: getComputedStyle(screen).transform.startsWith('matrix3d'),
      inside: cx > sb.x && cx < sb.x + sb.w && cy > sb.y && cy < sb.y + sb.h,
      screen: { w: Math.round(cb.w), h: Math.round(cb.h) },
      shell: { w: Math.round(sb.w), h: Math.round(sb.h) },
    };
  })()`) as Record<string, unknown>;

  if (m.dev !== true) problems.push(`${l.id}：一个设备都没有`);
  else if (!m.hasShell || !m.hasScreen) problems.push(`${l.id}：机身或屏幕那层缺了 ${JSON.stringify(m)}`);
  else {
    if (!m.sprite) problems.push(`${l.id}：外壳图没取到`);
    if (!m.matrix) problems.push(`${l.id}：屏幕不是 matrix3d`);
    if (!m.inside) problems.push(`${l.id}：屏幕飘到机身外了 ${JSON.stringify(m.screen)} vs ${JSON.stringify(m.shell)}`);
    /*
      **外壳图真的取到了没有，只能自己去 fetch 一次。** `getComputedStyle` 在 404 时
      照样把那串 URL 原样返回，所以「图没加载」在量出来的数据上看不出来。
    */
    const status = await page.evaluate(
      `fetch(${JSON.stringify(String(m.spriteUrl))}).then((r) => r.status).catch(() => 0)`,
    ) as number;
    if (status !== 200) problems.push(`${l.id}：外壳图取不到（HTTP ${status}）`);
  }
  for (const f of failed) problems.push(`${l.id}：${f}`);

  const file = path.join(OUT, `ui-layout-${String(i).padStart(2, '0')}.png`);
  await page.screenshot({ path: file });
  shots.push({ file, label: `${l.name} · ${l.group} · ${l.scene}` });
}

/* ---------------- 联络表 ---------------- */

const COLS = 4;
const CELL = 460;
const CH = Math.round(CELL * (H / W));
const rows = Math.ceil(shots.length / COLS);
const cells = shots.map((s) =>
  `<figure><img src="data:image/png;base64,${readFileSync(s.file).toString('base64')}">`
  + `<figcaption>${s.label}</figcaption></figure>`).join('');
const sheet = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
body{margin:0;background:#14161a;font-family:ui-monospace,monospace}
.grid{display:grid;grid-template-columns:repeat(${COLS},1fr);gap:12px;padding:12px}
figure{margin:0}
figcaption{color:#c8ccd4;font-size:13px;padding:5px 2px}
img{width:${CELL}px;display:block;background:#20232a}
</style></head><body><div class="grid">${cells}</div></body></html>`;

const sp = await browser.newPage({ viewport: { width: COLS * (CELL + 12) + 12, height: rows * (CH + 30) } });
await sp.setContent(sheet, { waitUntil: 'load' });
await sp.screenshot({ path: path.join(OUT, 'ui-sheet.png'), fullPage: true });
writeFileSync(path.join(OUT, 'ui-sheet.html'), sheet, 'utf8');

await browser.close();
server.close();

console.log(`共 ${shots.length} 份`);
if (problems.length > 0) {
  console.error(`\n有 ${problems.length} 份不对劲：`);
  for (const p of problems) console.error(`  ${p}`);
  process.exitCode = 1;
} else {
  console.log('每一份的设备、外壳图、屏幕矩阵都在位。');
}
console.log(`联络表：${path.relative(process.cwd(), path.join(OUT, 'ui-sheet.png'))}`);
