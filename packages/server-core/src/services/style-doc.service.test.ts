import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 环境必须在导入任何模块之前设定
const tmp = mkdtempSync(join(tmpdir(), 'lumen-style-seed-'));
process.env.NODE_ENV = 'test';
process.env.LUMEN_DB_PATH = join(tmp, 'test.db');
process.env.LUMEN_SECRET_KEY = 'test-secret-key-0123456789abcdefghijklmnop';

const { migrate } = await import('../db/migrate.js');
const { closeDb } = await import('../db/client.js');
const { seedStyleDocs, listStyleDocs, resolveStyleDoc, saveStyleDoc, deleteStyleDoc } =
  await import('./style-doc.service.js');
const { BUILTIN_STYLE_DOCS } = await import('@lumen/style-library');
const { styleRef } = await import('@lumen/ir-schema');

migrate();

test.after(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

test('风格资产不是空的，每份都覆盖了页类型', () => {
  assert.ok(BUILTIN_STYLE_DOCS.length > 0, '资产文件里应该有风格');
  for (const doc of BUILTIN_STYLE_DOCS) {
    assert.ok(doc.styleId.length > 0, '每份都要有 styleId');
    assert.ok(
      Object.keys(doc.pagePrompts).length > 0,
      `${doc.name} 应该至少覆盖一个页类型`,
    );
  }
});

test('新环境（空库）起来时把资产补进库里', () => {
  assert.equal(listStyleDocs().total, 0, '这条用例跑之前库里应该是空的');

  const result = seedStyleDocs();

  assert.equal(result.inserted.length, BUILTIN_STYLE_DOCS.length, '应该全部补进来');
  assert.equal(result.skipped, 0);
  assert.equal(listStyleDocs().total, BUILTIN_STYLE_DOCS.length);
  // 补进来的要能按 ref 取出来——seed 只插了行，这条确认 doc JSON 也写对了
  for (const doc of BUILTIN_STYLE_DOCS) {
    assert.equal(resolveStyleDoc(styleRef(doc)).name, doc.name);
  }
});

test('再跑一次不重复插入，也不更新已有行', () => {
  const result = seedStyleDocs();
  assert.equal(result.inserted.length, 0);
  assert.equal(result.skipped, BUILTIN_STYLE_DOCS.length);
  assert.equal(listStyleDocs().total, BUILTIN_STYLE_DOCS.length);
});

test('库里已有的风格不被资产文件覆盖', () => {
  const first = BUILTIN_STYLE_DOCS[0]!;
  const ref = styleRef(first);

  // 模拟人在界面上改过这套风格。走 saveStyleDoc 而不是直接 UPDATE 列：
  // 改的是**整份 doc JSON**（列只是它的索引），两条路径不一样
  const saved = saveStyleDoc({ ...first, name: '人手改过的名字' });
  assert.equal(saved.ok, true, '手改应该存得进去');

  const result = seedStyleDocs();
  assert.equal(result.inserted.length, 0, '已有的不该被当成缺失');
  assert.equal(
    resolveStyleDoc(ref).name,
    '人手改过的名字',
    '手改过的风格不能被文件里的基线盖掉',
  );
});

test('overwrite 模式才按文件覆盖，且只覆盖内容不同的那几套', () => {
  const first = BUILTIN_STYLE_DOCS[0]!;
  const ref = styleRef(first);

  // 上一条用例把库里第一套的名字改成了「人手改过的名字」，这里把它推回文件里的值
  const result = seedStyleDocs({ overwrite: true });

  assert.deepEqual(result.updated, [ref], '只有被改过的那一套需要覆盖');
  assert.equal(resolveStyleDoc(ref).name, first.name, '应该回到文件里的名字');
});

test('内容已经一致时 overwrite 也不写库', () => {
  const result = seedStyleDocs({ overwrite: true });
  assert.equal(result.updated.length, 0, '没变就不该写——写了会把 updatedAt 刷新、打乱列表顺序');
  assert.equal(result.skipped, BUILTIN_STYLE_DOCS.length);
});

/**
 * 「删了又回来」——实测反馈过的问题。
 *
 * 随资产分发的风格，`seedStyleDocs()` 在每次 API 启动时都会把「库里没有的」补进去。
 * 于是界面上删掉一套，下次 `pnpm dev` 改一行服务端代码触发重启，它又冒出来了。
 * 修法是删除时记一笔（`deleted_style_docs`），资产同步看到就跳过。
 *
 * **这两条用例必须放在最后**：前面的用例都在数库里的总数，删掉一套会让它们全红。
 */
test('删掉的资产风格不会被下一次资产同步补回来', () => {
  const first = BUILTIN_STYLE_DOCS[0]!;
  const ref = styleRef(first);
  const before = listStyleDocs().total;

  const removed = deleteStyleDoc(ref);
  assert.equal(removed.deleted, true, '没有项目在用，应该删得掉');
  assert.equal(listStyleDocs().total, before - 1, '删完库里应该少一套');

  // 这一步就是「删了又回来」的成因：API 每次启动都跑 seedStyleDocs
  const result = seedStyleDocs();
  assert.equal(result.inserted.length, 0, '删过的不该被当成「新环境缺这套」补回来');
  assert.deepEqual(result.deletedSkipped, [ref], '要如实报出「这套是删过的、故意没补」');
  assert.equal(listStyleDocs().total, before - 1, '删了就是删了');

  // overwrite（`pnpm style:import`）也一样跳：用户删过就表示这套不要了
  const forced = seedStyleDocs({ overwrite: true });
  assert.deepEqual(forced.deletedSkipped, [ref]);
  assert.equal(listStyleDocs().total, before - 1, '显式同步资产也不该把它塞回来');
});

test('重新保存同一套风格之后，资产同步又认它了', () => {
  const first = BUILTIN_STYLE_DOCS[0]!;
  const ref = styleRef(first);

  // 用户后悔了、或者重新导入一次——**任何一次显式保存都表示「我要这套」**
  assert.equal(saveStyleDoc(first).ok, true, '重新保存应该成功');
  assert.equal(listStyleDocs().total, BUILTIN_STYLE_DOCS.length, '库里的套数应该回到原样');

  const result = seedStyleDocs();
  assert.deepEqual(result.deletedSkipped, [], '存过之后就不该再被当成删过的');
  assert.equal(result.inserted.length, 0, '已经在库里，不需要补');
});
