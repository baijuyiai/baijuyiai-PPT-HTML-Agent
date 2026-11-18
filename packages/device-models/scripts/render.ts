/**
 * 把设备渲成图：外壳（屏幕处透明）+ 屏幕四角坐标，并**拼一张贴好界面的对照图**。
 *
 * ## 为什么本地 HTTP 服务 + importmap
 *
 * three 从 r150 起只发 ESM，`page.addScriptTag` 注入的是经典脚本，`import` 当场报错。
 * `setContent()` 之后文档是 `about:blank`（不透明源），`file://` 下 ESM 又走 CORS——
 * 两条都被拦。仓库里 `apps/worker/scratch/render-image-skeletons.mjs` 已经为同一类
 * 问题起过本地服务（那边是 web 字体静默回退），这里照抄那套。
 *
 * ## 对照图为什么必要
 *
 * 只看外壳图**判断不了贴得准不准**。对照图用一张「四周彩色描边 + 网格 + 中心十字」的
 * 测试图案：描边正好落在孔边上就是对的，露出底色说明 underscan，被边框吃掉一条说明
 * overscan 过头。真界面图上这些都看不出来。
 *
 * ## 跑法
 *
 * ```
 * pnpm --filter @lumen/device-models exec tsx scripts/render.ts                 # 全部场景 × 全部姿态
 * pnpm --filter @lumen/device-models exec tsx scripts/render.ts --scene iphone  # 只跑一个场景
 * ```
 *
 * 产物写在 `scripts/.out/`（**不进版本库**）。
 */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { screenStyle, screenMatrix, overscan, type Quad } from '../src/quad.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCENE_DIR = path.join(HERE, '..', 'scene');
const OUT = path.join(HERE, '.out');
mkdirSync(OUT, { recursive: true });

/**
 * three 包根目录。**不写死 `../../node_modules`**——pnpm 把它放在本包自己的 node_modules 里。
 * 也不能解析 `three/package.json`：three 的 `exports` 里没有那一条，会报
 * `ERR_PACKAGE_PATH_NOT_EXPORTED`。解析主入口（`build/three.cjs`）再往上退两级。
 */
const THREE_DIR = path.dirname(path.dirname(createRequire(import.meta.url).resolve('three')));

const W = 900;
const H = 1200;

const SCENES = ['iphone', 'macbook', 'display', 'curved'];

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : process.argv[i + 1];
};




/* ---------------- 起服务 ---------------- */

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json',
  '.glb': 'model/gltf-binary',
};

const server = createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
  /*
    三条路由，各有各的根目录：
    - `/three/*` → three 包
    - `/scene/*` → 本包的 `scene/`（场景模块，浏览器直接加载的 ESM）
    - 其余（只有 `/scene.html`）→ `.out/`，那是这张页面的落脚处
  */
  let file: string;
  if (url.startsWith('/three/')) file = path.join(THREE_DIR, url.slice('/three/'.length));
  else if (url.startsWith('/scene/')) file = path.join(SCENE_DIR, url.slice('/scene/'.length));
  else file = path.join(OUT, url.replace(/^\/+/, '') || 'scene.html');

  // 只服务这三个目录，别把整个仓库暴露出去
  const roots = [THREE_DIR, SCENE_DIR, OUT];
  if (!roots.some((r) => file.startsWith(r))) { res.writeHead(403).end(); return; }
  try {
    const body = readFileSync(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
const PORT = (server.address() as { port: number }).port;

/** 场景页。importmap 把裸包名指到本地服务上的 three */
const PAGE = `<!DOCTYPE html><html><head><meta charset="utf-8">
<script type="importmap">
{ "imports": {
  "three": "http://127.0.0.1:${PORT}/three/build/three.module.js",
  "three/addons/": "http://127.0.0.1:${PORT}/three/examples/jsm/"
} }
</script>
<style>html,body{margin:0;background:transparent;overflow:hidden}canvas{display:block}</style>
</head><body><script type="module" src="/scene/main.js"></script></body></html>`;
writeFileSync(path.join(OUT, 'scene.html'), PAGE, 'utf8');

/* ---------------- 驱动 ---------------- */

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });

/** 页面里的异常一个字都不能吞：importmap 解析失败只会在这里冒出来 */
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

/*
  **姿态表从页面读，不在这一侧另写一份。**
  两边各写一份的话，加一帧忘了同步，症状是「渲了但骨架里没有」——
  而骨架生成器只按文件名找图，找不到会抛错，看起来像渲染坏了、不像列表漂了。
*/
await page.goto(`http://127.0.0.1:${PORT}/scene.html`, { waitUntil: 'load' });
const POSES = await page.evaluate('window.__poses') as string[];
if (!Array.isArray(POSES) || POSES.length === 0) {
  throw new Error('页面没有给出姿态表（window.__poses）——scene/main.js 是不是改了？');
}

const targets: { scene: string; pose: string }[] = [];
for (const scene of (arg('scene')?.split(',') ?? SCENES)) {
  for (const pose of (arg('pose')?.split(',') ?? POSES)) targets.push({ scene, pose });
}

interface Shot {
  scene: string; pose: string; opaque: number;
  shell: Buffer; quad: Quad | null; screen: { w: number; h: number; r: number } | null;
  /** 卷曲屏：一串条带，每条一个四边形。与 `quad` 二选一 */
  quads: Quad[] | null;
  /** 卷曲屏：纸展开后的尺寸（宽 × 长），决定背景图铺多大 */
  paper: { w: number; length: number } | null;
}
const shots: Shot[] = [];

for (const t of targets) {
  errors.length = 0;
  await page.goto(`http://127.0.0.1:${PORT}/scene.html?scene=${t.scene}&pose=${t.pose}&probe=${arg('probe') ?? '0'}`, { waitUntil: 'load' });
  /*
    **这条超时就是「没跑通」的判据。** 模块 import 失败、WebGL 上下文创建失败、
    任何异常，都会让 `__done` 永远不为真——而不是静默出一张空图让人以为成功了。
  */
  try {
    await page.waitForFunction('window.__done === true', null, { timeout: 30_000 });
  } catch {
    console.error(`\n${t.scene}/${t.pose} 没能渲出来：`);
    for (const e of errors) console.error(`  ${e}`);
    const pageErr = await page.evaluate('window.__error ?? null');
    if (pageErr) console.error(`  场景自报：${pageErr}`);
    continue;
  }
  const err = await page.evaluate('window.__error ?? null') as string | null;
  if (err) { console.error(`${t.scene}/${t.pose}：${err}`); continue; }
  // 场景自报的结构报告（换手机之前要先看清模型里有什么）
  const report = await page.evaluate('window.__report ?? null') as string | null;
  if (report) console.log(`
${report}
`);

  const r = await page.evaluate('window.__result') as {
    quad: Quad | null; quads: Quad[] | null; paper: { w: number; length: number } | null;
    screen: { w: number; h: number; r: number } | null;
  /** 不透明像素的包围盒（图像坐标）。设备只占渲染图中间一块，四周是透明的 */
  bounds: { x: number; y: number; w: number; h: number } | null;
    opaque: number; shell: string;
  };
  const shell = Buffer.from(r.shell.split(',')[1]!, 'base64');
  writeFileSync(path.join(OUT, `${t.scene}-${t.pose}.webp`), shell);
  shots.push({
    scene: t.scene, pose: t.pose, opaque: r.opaque, shell,
    quad: r.quad, quads: r.quads, paper: r.paper, screen: r.screen, bounds: r.bounds,
  });

  console.log(`${t.scene.padEnd(14)} ${t.pose.padEnd(6)} 不透明 ${(r.opaque / (W * H) * 100).toFixed(1)}%  ${(shell.length / 1024).toFixed(1)} KB`);
  for (const e of errors) console.error(`  页面报错：${e}`);
}

/* ---------------- 对照图 ---------------- */

/**
 * 测试图案：四周一圈彩色描边 + 网格 + 中心十字。
 * 用它而不是真界面图，是因为**贴得准不准要一眼看得出来**。
 */
function testPattern(w: number, h: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
  <defs><pattern id="g" width="48" height="48" patternUnits="userSpaceOnUse">
    <path d="M48 0H0V48" fill="none" stroke="#2f6fed" stroke-width="1" opacity=".3"/>
  </pattern></defs>
  <rect width="100%" height="100%" fill="#f7f8fa"/>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect x="2" y="2" width="${w - 4}" height="${h - 4}" fill="none" stroke="#e5484d" stroke-width="4"/>
  <line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="#12a594" stroke-width="2"/>
  <line x1="${w / 2}" y1="0" x2="${w / 2}" y2="${h}" stroke="#12a594" stroke-width="2"/>
  <text x="${w / 2}" y="${h / 2 - 14}" font-family="monospace" font-size="26"
        fill="#111" text-anchor="middle">UI SCREEN</text>
</svg>`;
}

/** 把外壳图与界面图合成一页，截图。这张图是「贴得准不准」的唯一判据 */
async function composite(s: Shot): Promise<string | null> {
  const shell = `data:image/webp;base64,${s.shell.toString('base64')}`;
  let html: string;

  /*
    **卷曲屏**：没有单一的屏幕四边形，只有一串条带。
    每条的 `background-position` 错开一格、`background-size` 都撑成整张长图，
    于是每条只露出自己那一横段；各自再套上自己的 `matrix3d`。
    **图只内联一份**——N 个 div 引用同一个 data URI。
  */
  if (s.quads && s.paper) {
    const pw = 384;
    const pl = Math.round(pw * (s.paper.length / s.paper.w));
    const ui = `data:image/svg+xml;base64,${Buffer.from(testPattern(pw, pl), 'utf8').toString('base64')}`;
    const stripH = pl / s.quads.length;
    const strips = s.quads.map((q, i) =>
      `<div class="strip" style="background-position:0 ${(-i * stripH).toFixed(2)}px;`
      + `transform:${screenMatrix(pw, stripH, overscan(q, 1.004))}"></div>`).join('');
    html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;background:#20232a}
      .stage{position:relative;width:${W}px;height:${H}px}
      .strip{position:absolute;left:0;top:0;width:${pw}px;height:${stripH.toFixed(2)}px;
        background-image:url(${ui});background-size:${pw}px ${pl}px;
        background-repeat:no-repeat;transform-origin:0 0}
      .shell{position:absolute;left:0;top:0;width:${W}px;height:${H}px;display:block}
    </style></head><body><div class="stage">
      ${strips}
      <img class="shell" src="${shell}">
    </div></body></html>`;
  } else {
    if (!s.quad || !s.screen) return null;   // 没有屏幕的场景不合成
    const uiW = 384;
    const uiH = Math.round(uiW * (s.screen.h / s.screen.w));
    const ui = `data:image/svg+xml;base64,${Buffer.from(testPattern(uiW, uiH), 'utf8').toString('base64')}`;

    /*
      **overscan 2%**：界面比孔大一丝，保证盖满不留缝——underscan 会在孔边露出底色。
      **`border-radius` 不是装饰**：孔的圆角是 `screen.r`，而界面图是直角矩形；不磨圆的话
      等比放大后四个直角会从孔的圆角处戳出去（斜角那一带的边框特别薄）。
    */
    const radius = Math.round(s.screen.r * (uiW / s.screen.w));
    const style = screenStyle(uiW, uiH, overscan(s.quad, 1.02), radius);
    html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;background:#20232a}
      .stage{position:relative;width:${W}px;height:${H}px}
      .shot{${style}}
      .shell{position:absolute;left:0;top:0;width:${W}px;height:${H}px;display:block}
    </style></head><body><div class="stage">
      <img class="shot" src="${ui}">
      <img class="shell" src="${shell}">
    </div></body></html>`;
  }

  const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await p.setContent(html, { waitUntil: 'load' });
  const file = path.join(OUT, `${s.scene}-${s.pose}-composite.png`);
  await p.screenshot({ path: file });
  await p.close();
  return file;
}

const made: (string | null)[] = [];
for (const s of shots) made.push(await composite(s));

/*
  **设备清单**：每个场景 × 姿态的外壳图、屏幕四角（或卷曲屏的条带）。
  这是「渲染」与「版式骨架」之间唯一的接口——骨架生成器只读它，不碰渲染代码。

  写在 `.out/` 里而不是直接写进 `stock-library`：渲染是本地跑的工具，
  往别的包里写文件得由生成器显式做（`scripts/emit-ui-layouts.ts`），
  免得「跑一次渲染」这种随手动作悄悄改了仓库里别的包。
*/
writeFileSync(path.join(OUT, 'devices.json'), JSON.stringify(
  shots.map((s) => ({
    scene: s.scene,
    pose: s.pose,
    file: `${s.scene}-${s.pose}.webp`,
    quad: s.quad,
    quads: s.quads,
    paper: s.paper,
    screen: s.screen,
    bounds: s.bounds,
  })),
  null, 2,
));

/* ---------------- 转动精灵图 ---------------- */

/**
 * 把每个场景的悬停帧**竖着拼成一张长图**。
 *
 * ## 为什么不各存一帧、页面里叠九个 `<img>`
 *
 * 叠九个元素只能靠 `opacity` 过渡来切换，而**两个姿态会同时出现在画面上**
 * （哪怕是各半）——读起来是「一张图淡成另一张」，不是转动。
 * 拼成一张之后，页面用一个元素 + `background-position` 步进就够了：
 * **任一时刻只有一个姿态**，是硬切，读起来才是真的在转。
 *
 * 附带两个好处：DOM 里只有一个元素；正反两个方向都由同一条 `transition` 负责
 * （`steps()` 在反向过渡里也成立），不用为「移开鼠标」另写一套。
 *
 * 画布上限 16384，九帧 1200 高是 10800，够用。
 */
async function turnSheet(frames: string[], box: { x: number; y: number; w: number; h: number }): Promise<Buffer> {
  const srcs = frames.map((f) =>
    `data:image/webp;base64,${readFileSync(path.join(OUT, f)).toString('base64')}`);
  const p = await browser.newPage({ viewport: { width: 10, height: 10 } });
  const dataUrl = await p.evaluate(
    async ([list, bx, by, bw, bh]) => {
      const canvas = document.createElement('canvas');
      canvas.width = bw;
      canvas.height = bh * list.length;
      const ctx = canvas.getContext('2d');
      for (let i = 0; i < list.length; i += 1) {
        const img = new Image();
        img.src = list[i];
        await img.decode();
        // 按包围盒裁：设备只占渲染图中间一块，四周全是透明的
        ctx.drawImage(img, -bx, i * bh - by);
      }
      return canvas.toDataURL('image/webp', 0.86);
    },
    [srcs, box.x, box.y, box.w, box.h] as const,
  );
  await p.close();
  return Buffer.from(dataUrl.split(',')[1], 'base64');
}

/**
 * 各帧包围盒的**并集**。
 *
 * 取并集而不是第一帧：转动过程中机身会往一侧探出去一点，用第一帧的框会把后面
 * 那几帧切掉一条边——而切掉的是**机身边缘**，页面上看着像设备被削了一刀。
 */
function unionBox(list: (Shot['bounds'])[]): { x: number; y: number; w: number; h: number } {
  const xs = list.filter((b): b is NonNullable<typeof b> => b !== null);
  if (xs.length === 0) throw new Error('一帧不透明像素都没有，包围盒无从谈起');
  const x0 = Math.min(...xs.map((b) => b.x));
  const y0 = Math.min(...xs.map((b) => b.y));
  const x1 = Math.max(...xs.map((b) => b.x + b.w));
  const y1 = Math.max(...xs.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const boxes: Record<string, { x: number; y: number; w: number; h: number }> = {};
for (const scene of new Set(shots.map((s) => s.scene))) {
  const rows = shots.filter((s) => s.scene === scene && s.pose !== 'side');
  if (rows.length === 0) continue;
  const box = unionBox(rows.map((s) => s.bounds));
  boxes[scene] = box;
  const sheet = await turnSheet(rows.map((s) => `${s.scene}-${s.pose}.webp`), box);
  writeFileSync(path.join(OUT, `${scene}-turn.webp`), sheet);
  console.log(`${scene.padEnd(14)} 转动图 ${rows.length} 帧  裁到 ${box.w}×${box.h}  ${(sheet.length / 1024).toFixed(0)} KB`);
}

/** 每个场景的转动图裁到了哪一块。生成器按它把设备精确塞进骨架留的框里 */
writeFileSync(path.join(OUT, 'device-boxes.json'), JSON.stringify(boxes, null, 2));

/* ---------------- 联络表 ---------------- */

if (made.length > 0) {
  const CELL = 300;
  // 联络表用 data URL 而不是文件路径：`file://` 页面加载 `file://` 子资源会被 Chromium 拦。
  // 没有屏幕的场景（调手用）没有合成图，直接铺外壳图
  const cells = shots.map((s, i) => {
    const file = made[i];
    const mime = file ? 'image/png' : 'image/webp';
    const b64 = readFileSync(file ?? path.join(OUT, `${s.scene}-${s.pose}.webp`)).toString('base64');
    return `<figure><figcaption>${s.scene} · ${s.pose}</figcaption>`
      + `<img src="data:${mime};base64,${b64}"></figure>`;
  }).join('\n');
  const sheet = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#14161a;font-family:ui-monospace,monospace}
    .grid{display:grid;grid-template-columns:repeat(${Math.min(made.length, 6)},1fr);gap:10px;padding:10px}
    figure{margin:0}
    figcaption{color:#c8ccd4;font-size:12px;padding:4px 2px}
    img{width:${CELL}px;display:block;background:#20232a}
  </style></head><body><div class="grid">${cells}</div></body></html>`;

  const p = await browser.newPage({ viewport: { width: Math.min(made.length, 6) * (CELL + 10) + 10, height: 900 } });
  await p.setContent(sheet, { waitUntil: 'load' });
  await p.screenshot({ path: path.join(OUT, 'sheet.png'), fullPage: true });
  await p.close();
}

console.log(`\n产物在 ${path.relative(process.cwd(), OUT)}`);
if (shots.some((s) => s.opaque < W * H * 0.01)) {
  console.error('有不透明像素过少的——相机没对着模型、或灯光全黑。');
  process.exitCode = 1;
}

await browser.close();
server.close();
