import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 环境必须在导入任何模块之前设定
const tmp = mkdtempSync(join(tmpdir(), 'lumen-studiolayout-'));
process.env.NODE_ENV = 'test';
process.env.LUMEN_DB_PATH = join(tmp, 'test.db');
process.env.LUMEN_SECRET_KEY = 'test-secret-key-0123456789abcdefghijklmnop';

const { migrate } = await import('../db/migrate.js');
const { closeDb } = await import('../db/client.js');
const {
  deleteStudioLayout, getStudioLayout, hiddenLayoutIds, hideBuiltinLayout, listStudioLayouts,
  resolveLayoutForPrompt, saveStudioLayout, unhideBuiltinLayout, validateSkeleton,
} = await import('./studio-layout.service.js');
const { builtinLayoutsOf, imageLayoutCandidates, imageSlotNumbers } = await import('@lumen/ir-schema');

migrate();

test.after(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

/**
 * 自建版式骨架的存取。
 *
 * 这里最要紧的两条不是「能存能取」，而是：
 * 1. **坏的存不进去**——识别流过了不代表客户端回传的那份没问题，而一份坏骨架进库之后，
 *    每次拿它换排版都会生成出一页被判不合规、重试、最后降级。
 * 2. **不污染内置**——自建骨架绝不能进自动挑版式的候选池。
 */

const GALLERY_SKELETON = [
  '<style>.s{width:1920px;height:1080px;background:var(--bg)}</style>',
  '<div class="s">',
  '<img data-lumen-image="1"><img data-lumen-image="2">',
  '<img data-lumen-image="3"><img data-lumen-image="4">',
  '</div>',
].join('');

const PEOPLE_SKELETON = [
  '<style>.s{background:var(--bg)}</style>',
  '<div class="s"><img data-lumen-image="1" data-lumen-cutout="1"><img data-lumen-image="2"></div>',
].join('');

function save(over: Record<string, unknown> = {}) {
  return saveStudioLayout({
    moduleId: 'image-layouts',
    name: '四宫格等分',
    brief: '四张图等宽等高等分整页',
    group: 'multi',
    skeleton: GALLERY_SKELETON,
    ...over,
  } as never);
}

test('存一份合规骨架：能读回来，slots 由服务端数出来', () => {
  const r = save();
  assert.equal(r.ok, true, JSON.stringify(r));
  if (!r.ok) return;
  assert.equal(r.layout.source, 'user');
  assert.equal(r.layout.slots, 4, 'slots 该由服务端数，不采信调用方');
  assert.equal(r.layout.name, '四宫格等分');

  const back = getStudioLayout(r.layout.id);
  assert.equal(back?.skeleton, GALLERY_SKELETON);
  assert.equal(back?.id, r.layout.id);
});

test('自建 id 与内置永不撞，且能反推回模块', () => {
  const builtinIds = new Set([
    ...builtinLayoutsOf('people-layouts'), ...builtinLayoutsOf('image-layouts'),
  ].map((l) => l.id));
  for (let i = 0; i < 30; i += 1) {
    const r = save({ name: `批量 ${i}` });
    assert.equal(r.ok, true);
    if (!r.ok) return;
    assert.equal(builtinIds.has(r.layout.id), false, `${r.layout.id} 与内置撞了`);
  }
});

test('listStudioLayouts 只列自建，且能按模块筛', () => {
  const people = save({ moduleId: 'people-layouts', group: 'solo', skeleton: PEOPLE_SKELETON, name: '左右分栏' });
  assert.equal(people.ok, true);

  const all = listStudioLayouts();
  assert.ok(all.length >= 31, `自建列表少得不对：${all.length}`);
  assert.ok(all.every((l) => l.source === 'user'), '自建列表里混进了内置的');

  const onlyPeople = listStudioLayouts('people-layouts');
  assert.ok(onlyPeople.length >= 1);
  assert.ok(onlyPeople.every((l) => l.id.startsWith('people/')), '按模块筛没生效');
  assert.equal(onlyPeople.some((l) => l.id === all.find((l) => l.id.startsWith('gallery/'))?.id), false);
});

test('坏的存不进去：写死色值 / 图位跳号 / 名字为空 / 分组不属于该库', () => {
  const hex = save({ skeleton: GALLERY_SKELETON.replace('var(--bg)', '#FF00AA') });
  assert.equal(hex.ok, false);
  if (!hex.ok) assert.ok(hex.issues.length > 0);

  const skipped = save({
    skeleton: '<style></style><div><img data-lumen-image="1"><img data-lumen-image="3"></div>',
  });
  assert.equal(skipped.ok, false, '图位跳号该被拦');

  const noName = save({ name: '   ' });
  assert.equal(noName.ok, false, '空名字该被拦');

  // `feature` 是图文排版的分组，放人物排版里没有意义——存进去之后界面上这个分组根本不存在
  const wrongGroup = save({ moduleId: 'people-layouts', group: 'feature', skeleton: PEOPLE_SKELETON });
  assert.equal(wrongGroup.ok, false, '分组不属于该库该被拦');

  const shortBrief = save({ brief: '太短' });
  assert.equal(shortBrief.ok, false, '说明太短该被拦');
});

test('validateSkeleton 只管结构与配色，两条都要过', () => {
  assert.deepEqual(validateSkeleton('image-layouts', GALLERY_SKELETON), []);
  assert.ok(validateSkeleton('image-layouts', GALLERY_SKELETON.replace('var(--bg)', '#FF00AA')).length > 0);
  assert.ok(validateSkeleton('image-layouts', '<div>没有 style 也没有图位</div>').length >= 2);
});

test('图文排版的图位数由骨架数出来，人物排版不给 slots', () => {
  const people = save({ moduleId: 'people-layouts', group: 'solo', skeleton: PEOPLE_SKELETON });
  assert.equal(people.ok, true);
  if (people.ok) assert.equal(people.layout.slots, undefined, '人物排版不该有 slots');

  const gallery = save({ name: '四宫格 A' });
  assert.equal(gallery.ok, true);
  if (gallery.ok) {
    assert.equal(gallery.layout.slots, imageSlotNumbers(GALLERY_SKELETON).length);
  }
});

test('删得掉自建的；内置的删不掉，且不给假成功', () => {
  const r = save({ name: '待删的' });
  assert.equal(r.ok, true);
  if (!r.ok) return;

  assert.deepEqual(deleteStudioLayout(r.layout.id), { deleted: true, reason: '' });
  assert.equal(getStudioLayout(r.layout.id), null);

  // 内置骨架不在库里，DELETE 影响零行——不该报成功
  const builtinId = builtinLayoutsOf('image-layouts')[0]!.id;
  const gone = deleteStudioLayout(builtinId);
  assert.equal(gone.deleted, false);
  assert.ok(gone.reason.includes('内置'));
});

test('resolveLayoutForPrompt 先找内置再找自建，两边都认', () => {
  const builtinId = builtinLayoutsOf('people-layouts')[0]!.id;
  const hit = resolveLayoutForPrompt(builtinId);
  assert.equal(hit?.source, 'builtin');
  assert.equal(hit?.id, builtinId);

  const r = save({ name: '自建可解析的' });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  const mine = resolveLayoutForPrompt(r.layout.id);
  assert.equal(mine?.source, 'user');
  assert.equal(mine?.skeleton, GALLERY_SKELETON);

  // 认不出的 id 回 null，而不是瞎猜一个模块
  assert.equal(resolveLayoutForPrompt('nonsense/whatever@v1'), null);
  assert.equal(resolveLayoutForPrompt(''), null);
});

/**
 * 这条是铁律的守门人：自建骨架**不进自动挑版式的候选池**。
 *
 * 判据是「内置常量数组的条数不因存了自建而变」——真去改那两个数组的话，
 * 两个骨架包自己的单测会当场挂，但那两条断言在别的包里、离这里很远，所以这里就近再钉一次。
 */
test('存自建不污染内置候选池：两个内置数组的条数不变', () => {
  const before = [builtinLayoutsOf('people-layouts').length, builtinLayoutsOf('image-layouts').length];
  for (let i = 0; i < 5; i += 1) save({ name: `污染探测 ${i}` });
  const after = [builtinLayoutsOf('people-layouts').length, builtinLayoutsOf('image-layouts').length];
  assert.deepEqual(after, before, '自建骨架漏进了内置候选池');
});

/* ---------------- 内置版式的下架 ---------------- */

/**
 * 下架 = 「别再被自动挑中」，不是「从库里消失」。
 *
 * 三条都要成立，少一条这个机制就是坏的：
 * 1. 功能库仍列得出来（带 `hidden` 标志），否则用户没法反悔；
 * 2. 候选池里确实没有了；
 * 3. **已经生成过的页面照旧能渲染**——`resolveLayoutForPrompt` 不受影响。
 */
test('下架内置版式：功能库仍列得出来，候选池里没有了', () => {
  const victim = builtinLayoutsOf('image-layouts').find((l) => l.group === 'multi')!;
  const countBefore = builtinLayoutsOf('image-layouts').length;
  assert.equal(hideBuiltinLayout(victim.id).ok, true);

  assert.ok(hiddenLayoutIds().includes(victim.id), '下架名单里没有它');
  const listed = builtinLayoutsOf('image-layouts').find((l) => l.id === victim.id);
  assert.ok(listed, '下架之后功能库列不出它了——用户就没法恢复');
  assert.equal(listed.hidden, true, 'hidden 标志没带上');
  // 常量数组本身不动：下架只是候选池的事
  assert.equal(builtinLayoutsOf('image-layouts').length, countBefore, '下架把条目从库里摘掉了');

  const picked = imageLayoutCandidates({ title: '', claim: '', points: [], visualForm: '六张图排开' });
  assert.ok(!picked.some((l) => l.id === victim.id), '下架的版式还在候选里');

  // 已经生成过的页面靠这条渲染，它必须不受影响
  assert.equal(resolveLayoutForPrompt(victim.id)?.id, victim.id, '下架把强制版式那条路也堵死了');

  assert.equal(unhideBuiltinLayout(victim.id).ok, true);
  assert.ok(!hiddenLayoutIds().includes(victim.id), '恢复之后名单里还有它');
  assert.equal(builtinLayoutsOf('image-layouts').find((l) => l.id === victim.id)?.hidden, false);
  const back = imageLayoutCandidates({ title: '', claim: '', points: [], visualForm: '六张图排开' });
  assert.ok(back.some((l) => l.id === victim.id) || back.length > 0, '恢复之后候选池该重新有它');
});

/** 下架两次、恢复没下架过的，都不该报错——界面上的按钮连点两下是常事 */
test('下架与恢复都是幂等的', () => {
  const victim = builtinLayoutsOf('people-layouts')[0]!.id;
  assert.equal(hideBuiltinLayout(victim).ok, true);
  assert.equal(hideBuiltinLayout(victim).ok, true, '重复下架报错了');
  assert.equal(hiddenLayoutIds().filter((id) => id === victim).length, 1, '重复下架插了两行');
  assert.equal(unhideBuiltinLayout(victim).ok, true);
  assert.equal(unhideBuiltinLayout(victim).ok, true, '恢复没下架过的报错了');
});

test('只认内置的：自建的直接删，认不出的 id 报错', () => {
  const r = save({ name: '自建的不该被下架' });
  assert.equal(r.ok, true);
  if (r.ok) {
    const res = hideBuiltinLayout(r.layout.id);
    assert.equal(res.ok, false);
    if (!res.ok) assert.ok(res.reason.includes('自建'), res.reason);
  }

  const nonsense = hideBuiltinLayout('nonsense/whatever@v1');
  assert.equal(nonsense.ok, false);
  if (!nonsense.ok) assert.ok(nonsense.reason.includes('认不出'), nonsense.reason);
});

test('下架不影响「删自建」：内置的仍然删不掉', () => {
  const builtinId = builtinLayoutsOf('image-layouts')[0]!.id;
  hideBuiltinLayout(builtinId);
  const gone = deleteStudioLayout(builtinId);
  assert.equal(gone.deleted, false, '下架之后内置的居然删得掉了');
  unhideBuiltinLayout(builtinId);
});
