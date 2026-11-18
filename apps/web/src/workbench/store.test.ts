import test from 'node:test';
import assert from 'node:assert/strict';
import { useWorkbench } from './store.js';
import type { PageIR, ProjectDetail } from '../api/types.js';

/**
 * 脏名单与自动保存的底座。
 *
 * 这层不碰网络，验的是三条「本地这份比服务端新」的规矩：
 * 改过就记名、存上了才摘、服务端那份换上来时不许盖掉手里还没存的那几页。
 */

function page(id: string, main: string): PageIR {
  return {
    pageId: id, pageType: 'text', layoutVariant: 'text/one-column@v1',
    title: { eyebrow: '', main, accentWords: [], sub: '' },
    blocks: [], footer: { source: '', pageNo: 1 }, overrides: {}, html: `<div>${main}</div>`,
  } as unknown as PageIR;
}

function detail(pages: { id: string; main: string }[], outline: { title: string }[]): ProjectDetail {
  return {
    project: { projectId: 'prj_t', styleId: 's@1.0' },
    pages: pages.map((p, i) => ({
      pageId: p.id, pageIndex: i, status: 'ready' as const, version: 1, page: page(p.id, p.main),
    })),
    outline: outline.map((o, i) => ({ index: i, title: o.title, pageType: 'text' })) as never,
    intent: {} as never,
    style: null,
  } as unknown as ProjectDetail;
}

/** 每个用例都从干净状态起，别让上一条的脏名单漏过来 */
function reset(d: ProjectDetail) {
  useWorkbench.setState({
    pages: [], statuses: [], outline: [], activeIndex: 0,
    dirtyPages: [], editSeq: 0, outlineDirty: false,
  });
  useWorkbench.getState().hydrate(d);
}

test('改过的页进脏名单，存上了才摘掉', () => {
  reset(detail([{ id: 'pg_a', main: 'A' }, { id: 'pg_b', main: 'B' }], [{ title: '一' }, { title: '二' }]));
  assert.deepEqual(useWorkbench.getState().dirtyPages, [], '刚拉下来的东西不该是脏的');

  useWorkbench.getState().updatePage(1, { title: { eyebrow: '', main: 'B 改过', accentWords: [], sub: '' } });
  assert.deepEqual(useWorkbench.getState().dirtyPages, ['pg_b'], '改哪一页就记哪一页');
  assert.equal(useWorkbench.getState().pages[1]!.title.main, 'B 改过');

  useWorkbench.getState().updatePage(1, { html: '<div>x</div>' });
  assert.deepEqual(useWorkbench.getState().dirtyPages, ['pg_b'], '同一页改两次只记一次');

  useWorkbench.getState().markPageSaved('pg_b');
  assert.deepEqual(useWorkbench.getState().dirtyPages, [], '存上了就摘掉');
});

test('对账时不许拿服务端那份盖掉手里还没存的页', () => {
  reset(detail([{ id: 'pg_a', main: 'A' }, { id: 'pg_b', main: 'B' }], [{ title: '一' }, { title: '二' }]));
  useWorkbench.getState().updatePage(0, { html: '<div>我正在改这一页</div>' });

  // 生成期间每几秒来一次的对账，服务端那份还是老的
  useWorkbench.getState().syncPages(detail([{ id: 'pg_a', main: 'A' }, { id: 'pg_b', main: 'B' }], [{ title: '一' }, { title: '二' }]));

  const s = useWorkbench.getState();
  assert.equal(s.pages[0]!.html, '<div>我正在改这一页</div>', '本地改过的那一页必须活下来');
  assert.equal(s.pages[1]!.html, '<div>B</div>', '没改过的照服务端那份换');
  assert.deepEqual(s.dirtyPages, ['pg_a'], '脏名单也跟着留着');
});

test('服务端把某一页换新了（刚重生成完），那一页就不再算脏', () => {
  reset(detail([{ id: 'pg_a', main: 'A' }], [{ title: '一' }]));
  useWorkbench.getState().updatePage(0, { html: '<div>本地那份</div>' });
  assert.deepEqual(useWorkbench.getState().dirtyPages, ['pg_a']);

  useWorkbench.getState().upsertPage(0, page('pg_a', '服务端新写的'), 'ready');
  assert.deepEqual(useWorkbench.getState().dirtyPages, [], '留着只会把旧内容再发回去，盖掉刚生成的那一版');
});

/**
 * 记 `pageId` 而不是格子号的理由，就在这条用例里。
 *
 * 左栏拖一下顺序，`moveOutline` 会把 `pages` 整段挪位。按下标记的话，脏名单里那个
 * 下标已经指向别的页了——自动保存会把这一页的内容写到那一页上去。
 */
test('拖排序之后脏名单指的还是原来那一页', () => {
  reset(detail(
    [{ id: 'pg_a', main: 'A' }, { id: 'pg_b', main: 'B' }, { id: 'pg_c', main: 'C' }],
    [{ title: '一' }, { title: '二' }, { title: '三' }],
  ));
  useWorkbench.getState().updatePage(2, { html: '<div>C 改过</div>' });
  assert.deepEqual(useWorkbench.getState().dirtyPages, ['pg_c']);

  useWorkbench.getState().moveOutline(2, 0);
  const s = useWorkbench.getState();
  assert.deepEqual(s.dirtyPages, ['pg_c'], '记的是 id，挪位不影响');
  assert.equal(s.pages[0]!.pageId, 'pg_c', '前置条件：这一页确实挪到第一格了');
  assert.equal(s.pages[0]!.html, '<div>C 改过</div>', '内容跟着页走，没串到别的页上');
});

/* ---------------- 大纲那一路 ---------------- */

/**
 * 大纲的自动保存靠 `outlineEditSeq` 重置防抖。
 *
 * 它必须**只在真的改了东西时**自增：页类型那次「点开下拉框又选回当前项」如果也算一次编辑，
 * 计时器就被重置一次，用户手一停一停地翻，保存永远等不到那次 800ms。
 */
test('只有真的改了大纲才推进编辑序号', () => {
  reset(detail([{ id: 'pg_a', main: 'A' }], [{ title: '一' }, { title: '二' }]));
  const seq = () => useWorkbench.getState().outlineEditSeq;

  const s0 = seq();
  useWorkbench.getState().renameOutline(0, '一');            // 标题没变
  assert.equal(seq(), s0, '原名写回不算改动');

  useWorkbench.getState().changePageType(0, 'text');         // 页类型没变
  assert.equal(seq(), s0, '选回当前页类型不算改动');

  useWorkbench.getState().renameOutline(0, '一、新的标题');
  assert.equal(seq(), s0 + 1, '真改了才推进');
  assert.equal(useWorkbench.getState().outlineDirty, true, '同时要标脏，自动保存才有事可做');

  useWorkbench.getState().moveOutline(0, 1);
  assert.equal(seq(), s0 + 2, '拖排序也是改动');
});

/**
 * 大纲一保存，服务端会把 `pageIndex >= 大纲条数` 的页行删掉。
 *
 * 本地那份脏名单得跟着清理——留着的话自动保存会一直往一个已经不存在的页面发请求，
 * 每次都 404，界面上永远停在「保存失败」。
 */
test('页面被删掉后，它的脏标记也要摘掉', () => {
  reset(detail(
    [{ id: 'pg_a', main: 'A' }, { id: 'pg_b', main: 'B' }],
    [{ title: '一' }, { title: '二' }],
  ));
  useWorkbench.getState().updatePage(1, { html: '<div>改过</div>' });
  assert.deepEqual(useWorkbench.getState().dirtyPages, ['pg_b']);

  // 大纲缩到一条：服务端删掉了第二条页行，下一次对账就只剩一条
  useWorkbench.getState().syncPages(detail([{ id: 'pg_a', main: 'A' }], [{ title: '一' }]));
  assert.deepEqual(useWorkbench.getState().dirtyPages, [], '那一页已经不在页面里了，别再追着存');
});
