#!/usr/bin/env node
/**
 * 把旧链路的页面烘成静态 HTML，并把项目改指到新的风格库。
 *
 * ## 为什么要烘
 *
 * 旧页面的内容是 `PageIR.blocks`，靠 `packages/slides` 的 React 组件按风格包的几何排版；
 * 新链路的页面内容是 `PageIR.html`，走 iframe。风格包一删，旧页就没有几何可依——
 * 导出直接报错、演示态静默空白。烘一遍之后它们变成新链路的页面，两条路合一。
 *
 * ## 烘出来的东西长什么样
 *
 * `renderToStaticMarkup(<Slide …/>)` 的产物 + 一份 `packages/slides/src/styles.css`。
 * **CSS 必须一起带上**：那段标记用的是 `.lumen-*` 这类类名，样式全在 styles.css 里，
 * 而新链路的 `buildPageDocument` 只注入调色板变量与字体，不注入组件样式——
 * 不带的话烘出来是一堆没有样式的裸 div。风格包的 CSS 变量（`--brand-500` 那一套）
 * 已经由 `Slide` 内联在根节点上，不用另外处理。
 *
 * ## 用法
 *
 *   node --import tsx scripts/bake-legacy-pages.tsx --probe <projectId> <pageIndex>
 *       只烘一页，写到 `.bake-probe.html` 供人眼核对，**不落库**
 *   node --import tsx scripts/bake-legacy-pages.tsx --dry-run
 *       报出会动哪些项目与页，不写
 *   node --import tsx scripts/bake-legacy-pages.tsx
 *       真烘并落库
 */

// 必须排在最前：它给全局装上 React，供经典 JSX 编译产物使用
import './jsx-runtime.js';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { renderToStaticMarkup } from 'react-dom/server';
import { Slide } from '@lumen/slides';
import { buildSlideContext } from '@lumen/render-engine';
import { buildPageDocument, fontStacksOf } from '@lumen/ir-schema';
import type { PageIR, StyleDocSummary, StylePack } from '@lumen/ir-schema';

const require = createRequire(import.meta.url);

const { migrate, closeDb, all, get, listStyleDocs, resolveStyleDoc, resolveStyle, pageIR, savePage, updateProject } =
  await import('@lumen/server-core');

/** 读 slides 的组件样式。与导出链路同一份真值文件，不另抄 */
function loadSlidesCss(): string {
  try {
    return readFileSync(require.resolve('@lumen/slides/styles.css'), 'utf8');
  } catch {
    return readFileSync(new URL('../../../packages/slides/src/styles.css', import.meta.url), 'utf8');
  }
}

/**
 * 把一页旧 IR 渲染成自包含的 HTML 片段。
 *
 * 用 `mode: 'export'`：动效降级成静态、不加逐块进场的标记——烘出来的是**落点那一帧**，
 * 快照不该带着一段永远播不完的入场动画。
 */
function bakePage(page: PageIR, pack: StylePack, slidesCss: string): string {
  const ctx = buildSlideContext(page, pack, { mode: 'export' });
  const markup = renderToStaticMarkup(<Slide ctx={ctx} scale={1} />);
  return `<style>${slidesCss}</style>\n${markup}`;
}

interface ProjectRow { projectId: string; tenantId: string; title: string; styleId: string | null }

/** 还挂在旧风格包上的项目。新链路的 styleId 形如 `recognized-*` */
function legacyProjects(): ProjectRow[] {
  return all<ProjectRow>('SELECT projectId, tenantId, title, styleId FROM projects ORDER BY createdAt')
    .filter((p) => p.styleId && !p.styleId.startsWith('recognized-'));
}

function pagesOf(projectId: string) {
  return all<{ pageId: string; pageIndex: number; ir: string }>(
    'SELECT pageId, pageIndex, ir FROM pages WHERE projectId = ? ORDER BY pageIndex',
    projectId,
  );
}

function main() {
  migrate();
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const probeAt = argv.indexOf('--probe');

  const docs = listStyleDocs({ limit: 100 }).items;

  if (probeAt >= 0) {
    const projectId = argv[probeAt + 1]!;
    const pageIndex = Number(argv[probeAt + 2] ?? 0);
    const row = get<ProjectRow>('SELECT projectId, tenantId, title, styleId FROM projects WHERE projectId = ?', projectId);
    if (!row) throw new Error(`项目不存在：${projectId}`);
    const pack = resolveStyle(row.styleId!);
    const pageRow = pagesOf(projectId).find((p) => p.pageIndex === pageIndex);
    if (!pageRow) throw new Error(`这一页不存在：${projectId} #${pageIndex}`);
    const html = bakePage(pageIR(pageRow as never), pack, loadSlidesCss());
    writeFileSync('.bake-probe.html', `<!doctype html><meta charset="utf-8"><body style="margin:0">${html}</body>`);
    // 再按**新链路真正的装配方式**包一份：新链路是 `buildPageDocument` 把片段包成整页
    // 塞进 iframe，而它会额外注入调色板变量、字体与静态动效规则。只测裸片段不够——
    // 要看的是「走新链路之后长什么样」
    const to = docs[0]!;
    const doc = resolveStyleDoc(to.styleId);
    const wrapped = buildPageDocument(html, {
      palette: doc.palette,
      ...fontStacksOf(doc),
      title: 'bake probe',
      motion: 'none',
    });
    writeFileSync('apps/web/public/_bake-probe.html', wrapped);
    console.log(`已烘一页 → .bake-probe.html（裸片段）与 apps/web/public/_bake-probe.html（走新链路装配）`);
    console.log(`项目「${row.title}」用的是 ${row.styleId}，共 ${pagesOf(projectId).length} 页`);
    closeDb();
    return;
  }

  const projects = legacyProjects();
  if (projects.length === 0) {
    console.log('没有挂在旧风格包上的项目，无需烘焙');
    closeDb();
    return;
  }
  if (docs.length === 0) throw new Error('风格库里一套都没有，先建风格再烘');

  console.log(`待处理 ${projects.length} 个项目；风格库有 ${docs.length} 套：${docs.map((d) => d.name).join('、')}\n`);

  const slidesCss = loadSlidesCss();
  let baked = 0;
  const plan: { project: ProjectRow; to: StyleDocSummary; pages: number }[] = [];

  for (const p of projects) {
    const rows = pagesOf(p.projectId);
    // 五套里随机挑一套。用随机而不是固定一套：这几套各有各的调子，
    // 全挂同一套会让所有旧项目长得一样
    const to = docs[Math.floor(Math.random() * docs.length)]!;
    plan.push({ project: p, to, pages: rows.length });
    console.log(`${p.title}（${p.styleId} → ${to.name}）${rows.length} 页`);
  }

  if (dryRun) {
    console.log('\n--dry-run：未写库');
    closeDb();
    return;
  }

  for (const { project, to, pages } of plan) {
    const pack = resolveStyle(project.styleId!);
    const rows = pagesOf(project.projectId);
    for (const row of rows) {
      const page = pageIR(row as never);
      const html = bakePage(page, pack, slidesCss);
      const saved = savePage(project.projectId, project.tenantId, { ...page, html }, row.pageIndex);
      if (saved) baked += 1;
    }
    updateProject(project.projectId, project.tenantId, { styleId: to.styleId });
    console.log(`+ ${project.title} → ${to.name}，烘了 ${rows.length} 页`);
  }

  console.log(`\n共烘 ${baked} 页，${plan.length} 个项目已改指新风格`);
  closeDb();
}

main();
