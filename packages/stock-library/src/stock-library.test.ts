import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import {
  allocateStockImages, imageSlotCount, objectPool, STOCK_PHOTOS, STOCK_CATEGORY_LABEL, sortStockPhotos,
  stockCategoryOf, stockImagesFor, stockPhotoFor, stockPhotosFor, stockUrl, type StockPalette,
} from './index.js';
import { fillImageSlots, imageSlotsOf } from '@lumen/ir-schema';

/**
 * 配图库这一层要守住三件事：
 * 1. **清单与实际文件对得上**——清单里写了一张图、磁盘上没有，样机上就是一个破图，
 *    而且只有跑到那一页才看得见。
 * 2. **挑图挑得对**——深色风格不能配浅色照片，同一页里几张不能撞成同一张。
 * 3. **人物不进自动配图**——它们是透明底抠图，落进图位会缩成页面正中悬着一个人。
 */

const LIGHT: StockPalette = { brand: '#1B4D8F', accent: '#C8A45C', neutral: '#FFFFFF', dark: false };
const DARK: StockPalette = { brand: '#4C9AFF', accent: '#FFB454', neutral: '#0B1220', dark: true };

/**
 * 自动配图能用的那些，口径与 `REGULAR_POOL` 一致：**不透明**。
 *
 * 判据是 `!transparent` 而不是 `kind !== 'people'`——加了物件抠图之后后者就不对了：
 * 物件也是透明底、也不进普通池，按 kind 算会把它们算进来，于是「要 40 张」这类
 * 用例拿到的池子大小是错的。
 */
const PICKABLE = STOCK_PHOTOS.filter((p) => !p.transparent);

const HERE = dirname(fileURLToPath(import.meta.url));
/** 图片就在本包的 assets/ 下 */
const STOCK_DIR = join(HERE, '..', 'assets');

/** 按地址找清单里的那张图（`stockCategoryOf` 收的是图片本身，不是地址） */
const photoOfSrc = (src: string) => {
  const p = STOCK_PHOTOS.find((x) => stockUrl(x) === src);
  assert.ok(p, `配到了一张不在清单里的图：${src}`);
  return p;
};

const categoryOfSrc = (src: string) => stockCategoryOf(photoOfSrc(src));

test('清单里的每一张图在磁盘上都存在', () => {
  assert.ok(STOCK_PHOTOS.length >= 12, `配图太少：${STOCK_PHOTOS.length} 张`);
  const missing = STOCK_PHOTOS.filter((p) => !existsSync(join(STOCK_DIR, p.file)));
  assert.deepEqual(missing.map((p) => p.file), [], '清单里有磁盘上没有的图');
});

test('每张图都带得出处与许可信息——这些图是要随仓库分发的', () => {
  for (const p of STOCK_PHOTOS) {
    assert.ok(p.author.length > 0, `${p.file} 缺作者`);
    assert.ok(/^https?:\/\//.test(p.source), `${p.file} 缺来源链接`);
    assert.ok(p.tone === 'light' || p.tone === 'dark', `${p.file} 的明暗标记非法：${p.tone}`);
  }
});

test('每张图的代表色都是合法的十六进制，匹配逻辑靠它', () => {
  for (const p of STOCK_PHOTOS) {
    assert.ok(p.palette.length >= 2, `${p.file} 的代表色太少`);
    for (const hex of p.palette) {
      assert.match(hex, /^#[0-9a-fA-F]{6}$/, `${p.file} 的代表色非法：${hex}`);
    }
  }
});

test('深浅两档都够用——只有深色图的话浅色风格没得配', () => {
  const dark = PICKABLE.filter((p) => p.tone === 'dark').length;
  const light = PICKABLE.filter((p) => p.tone === 'light').length;
  assert.ok(dark >= 4, `深色图只有 ${dark} 张`);
  assert.ok(light >= 4, `浅色图只有 ${light} 张`);
});

test('分类是「人物 / 物件 / 其他」，每张图都落在其中一个里', () => {
  assert.deepEqual(Object.keys(STOCK_CATEGORY_LABEL).sort(), ['object', 'other', 'people']);
  for (const p of STOCK_PHOTOS) {
    const c = stockCategoryOf(p);
    assert.ok(c === 'people' || c === 'object' || c === 'other', `${p.file} 的分类非法：${c}`);
    assert.equal(c === 'people', p.kind === 'people', `${p.file} 的分类与题材对不上`);
    assert.equal(c === 'object', p.kind === 'object', `${p.file} 的分类与题材对不上`);
  }
});

test('透明底的物件归到「物件」，不与普通照片混在「其他」里', () => {
  // 「其他」现在混了两类完全不同的东西：普通照片会进自动配图池，透明底物件不进。
  // 合成一档的话，图片库那句「系统从『其他』里挑图」就与事实不符了
  const objects = STOCK_PHOTOS.filter((p) => p.kind === 'object');
  assert.ok(objects.length > 0, '物件池是空的——素材还没收进清单');
  for (const p of objects) {
    assert.equal(p.transparent, true, `${p.file} 是物件却不是透明底`);
    assert.equal(stockCategoryOf(p), 'object');
  }
});

test('图片库的排列把透明底抠图压到最后', () => {
  const plain = STOCK_PHOTOS.filter((p) => p.transparent !== true);
  const cutouts = STOCK_PHOTOS.filter((p) => p.transparent === true);
  assert.ok(plain.length > 0 && cutouts.length > 0, '清单里两类不齐，这条用例失去意义');

  // 顺序就是「普通照片在前、抠图在后」，两组内部各自保持清单原顺序
  assert.deepEqual(
    sortStockPhotos(STOCK_PHOTOS).map((p) => p.file),
    [...plain, ...cutouts].map((p) => p.file),
  );
  // 不改原数组：`sort` 是原地排的，漏了拷贝就会把调用方的清单也排掉
  assert.notEqual(sortStockPhotos(STOCK_PHOTOS), STOCK_PHOTOS);
});

test('人物全是透明底，且带得出处', () => {
  const people = STOCK_PHOTOS.filter((p) => stockCategoryOf(p) === 'people');
  assert.ok(people.length >= 20, `人物只有 ${people.length} 张`);
  for (const p of people) {
    assert.equal(p.transparent, true, `${p.file} 不是透明底`);
    assert.ok(p.author.length > 0, `${p.file} 缺作者`);
    assert.ok(/^https?:\/\//.test(p.source), `${p.file} 缺来源链接`);
    assert.ok(p.palette.length >= 2, `${p.file} 的代表色太少`);
  }
});

test('人物不参与自动配图——透明底落进图位会缩成页面正中悬着一个人', () => {
  // 深浅两档都试：人物在两侧都有，只挡一边会漏
  for (const pal of [DARK, LIGHT]) {
    const picks = stockPhotosFor(pal, 12);
    const got = picks.filter((p) => stockCategoryOf(p) === 'people');
    assert.deepEqual(got.map((p) => p.file), [], '自动配图挑到了人物');
  }
  // 整组分配那条路也不能漏
  const allocated = allocateStockImages(Array.from({ length: 10 }, () => '<img data-lumen-image="1">'), DARK);
  const files = allocated.flat().map((i) => i.src);
  for (const f of files) {
    const photo = STOCK_PHOTOS.find((p) => stockUrl(p) === f);
    assert.ok(photo, `配到了一张不在清单里的图：${f}`);
    assert.notEqual(stockCategoryOf(photo), 'people', `整组分配挑到了人物：${f}`);
  }
});

test('深色风格拿到深色图，浅色风格拿到浅色图', () => {
  assert.equal(stockPhotoFor(DARK).tone, 'dark', '给深色风格配了浅色图');
  assert.equal(stockPhotoFor(LIGHT).tone, 'light', '给浅色风格配了深色图');
});

test('同一套风格每次拿到同一张——样机不该每次重渲染都闪', () => {
  assert.deepEqual(stockPhotosFor(DARK, 4), stockPhotosFor(DARK, 4));
});

test('同一页里几张图不会撞成同一张', () => {
  // 图文页要看出是「几张图」，不是一张图的复制。
  // 每张单独按自己的题材排一次序的话，两张不同的题材可能都排到同一张图——
  // 所以必须一次把这一页要的几张一起挑
  for (const pal of [DARK, LIGHT]) {
    const picks = stockPhotosFor(pal, 4).map((p) => p.file);
    assert.equal(picks.length, 4, `要 4 张只给了 ${picks.length} 张`);
    assert.equal(new Set(picks).size, picks.length, `同一页挑重了：${picks.join(', ')}`);
  }
});

test('抠图位可以按题材点名要图', () => {
  // 封面主视觉要一栋楼时写 data-lumen-pick="楼"：池子先按题材收窄，再按色板挑。
  // 没有这个提示时取图完全由色板决定，「想要楼却拿到方块」没有办法。
  const html = '<img data-lumen-image="1" data-lumen-cutout="1" data-lumen-pick="楼">';
  for (const pal of [DARK, LIGHT]) {
    const [img] = allocateStockImages([html], pal)[0]!;
    const file = img!.src.split('/').pop()!;
    const photo = STOCK_PHOTOS.find((p) => p.file === file);
    assert.ok(photo, `清单里没有 ${file}`);
    assert.ok(photo.tags.some((t) => t.includes('楼')), `没挑到楼：${file}`);
  }
});

test('要得多时题材尽量岔开，而不是同一类堆满一页', () => {
  const picks = stockPhotosFor(DARK, 4);
  const kinds = new Set(picks.map((p) => p.kind));
  assert.ok(kinds.size >= 3, `4 张图只有 ${kinds.size} 种题材：${picks.map((p) => p.kind).join(', ')}`);
});

test('人像位按声明的取景从对应池子取图', () => {
  /*
    **「头像位真的取到头」靠的是这一步**，不是骨架里写死的百分比裁切——
    那套偏移在源图姿势不齐时必然落偏，实测「头像位取到胸口」就是这么来的。
    素材分两套（`people-head-*` 头肩、`people-half-*` 头到腰/胯），图位声明要哪种。
  */
  const html = [
    '<img data-lumen-image="1" data-lumen-cutout="head">',
    '<img data-lumen-image="2" data-lumen-cutout="half">',
    '<img data-lumen-image="3" data-lumen-cutout="head">',
  ].join('');
  for (const pal of [DARK, LIGHT]) {
    const names = allocateStockImages([html], pal, ['people'])[0]!.map((i) => i.src.split('/').pop()!);
    assert.match(names[0]!, /^people-head-/, `第 1 格是头像位，却给了 ${names[0]}`);
    assert.match(names[1]!, /^people-half-/, `第 2 格是半身位，却给了 ${names[1]}`);
    assert.match(names[2]!, /^people-head-/, `第 3 格是头像位，却给了 ${names[2]}`);
    assert.equal(new Set(names).size, names.length, `同一页挑重了：${names.join(', ')}`);
  }
});

test('没声明取景的老写法按半身兜底', () => {
  // 已经生成过的页面里全是 `data-lumen-cutout="1"`。半身图放进头像位只是裁得紧一点，
  // 头肩图放进半身位会显得空——兜底往宽的那边倒更安全
  const [img] = allocateStockImages(
    ['<img data-lumen-image="1" data-lumen-cutout="1">'], DARK, ['people'],
  )[0]!;
  assert.match(img!.src.split('/').pop()!, /^people-half-/);
});

test('图不够时宁可少给，也不重复给同一张', () => {
  // 浅色池现在只有个位数张，要 40 张不可能。返回的数量只能到池子的大小，
  // 且必须是互不相同的——重复的图比少一张难看得多
  const picks = stockPhotosFor(LIGHT, 40);
  const lightCount = PICKABLE.filter((p) => p.tone === 'light').length;
  assert.equal(picks.length, Math.min(40, lightCount));
  assert.equal(new Set(picks.map((p) => p.file)).size, picks.length, '挑重了');
});

test('取图地址指到 /stock 下的实际路径', () => {
  const url = stockUrl(STOCK_PHOTOS[0]!);
  assert.match(url, /^\/stock\/.+\.jpg$/);
  assert.ok(existsSync(join(STOCK_DIR, STOCK_PHOTOS[0]!.file)));
});

test('暖色风格不会被逼到冷色图上——题材只是加分，色板才是主序', () => {
  // 实测踩到的：浅色图里 abstract 只有一张冷蓝灰，一套暖橙色（#DC974C）的
  // 杂志风封面只能配它，颜色直接打架。根因是「先按题材筛、题材内再比色板」——
  // 题材池只有一张时，色板比较就形同虚设。
  const warm: StockPalette = { brand: '#DC974C', accent: '#C7421A', neutral: '#EEEBE7', dark: false };
  const picked = stockPhotoFor(warm);
  const warmish = picked.palette.some((hex) => {
    const n = parseInt(hex.slice(1), 16);
    return ((n >> 16) & 255) > (n & 255);
  });
  assert.ok(warmish, `暖色风格配到了冷色图：${picked.file} ${picked.palette.join(' ')}`);
});

/* ---------------- Node 侧 ---------------- */

test('Node 侧读得到的原图与浏览器侧地址指向同一份文件', async () => {
  // 两侧一旦漂开，症状是「工作台里配图正常、导出的成品全是破图」——
  // 而导出恰恰是用户唯一会发出去的东西。所以这条必须钉死
  const { STOCK_ASSETS_DIR, readStockFile } = await import('./node.js');
  assert.equal(resolve(STOCK_ASSETS_DIR), resolve(STOCK_DIR), 'Node 侧资源目录与清单所在目录不一致');

  const photo = STOCK_PHOTOS[0]!;
  const buf = await readStockFile(photo.file);
  assert.ok(buf.byteLength > 1000, `读出来的字节太少：${buf.byteLength}`);
  assert.equal(buf[0], 0xff, 'JPEG 应以 FFD8 开头');
  assert.equal(buf[1], 0xd8);
});

test('清单里的每一张图 Node 侧都读得到', async () => {
  const { readStockFile } = await import('./node.js');
  for (const p of STOCK_PHOTOS) {
    const buf = await readStockFile(p.file);
    assert.ok(buf.byteLength > 0, `${p.file} 读出来是空的`);
  }
});

/* ---------------- 按图位配图 ---------------- */

test('没有图位的版面不配图', () => {
  // 纯文字页、图表页本来就该没有配图。硬塞一张进去是错的
  assert.deepEqual(stockImagesFor('<div class="stage"><h1>标题</h1></div>', DARK), []);
});

test('有几个图位就配几张，按色板挑', () => {
  const frag = '<img data-lumen-image="1" class="hero"><img data-lumen-image="2" class="thumb">';
  const images = stockImagesFor(frag, DARK);
  assert.equal(images.length, 2);
  assert.equal(new Set(images).size, 2, '同一页里不该配重');
  for (const img of images) assert.match(img.src, /^\/stock\/.+\.jpg$/);
});

test('图位张数取「最大下标」与「图位个数」里较大的那个', () => {
  // 两种漏法都要挡住，只堵一边会漏另一边：
  // - 模型写 <img data-lumen-image="2"> 却漏了 "1"：只数个数会少算，第二个图位空着
  // - 图片排版页上五个图位**都写成 "1"**（实测过）：只看最大下标会少算，
  //   于是整页只配到一张图，重复五遍
  assert.equal(stockImagesFor('<img data-lumen-image="2">', DARK).length, 2);
  assert.equal(stockImagesFor('<img data-lumen-image="1"><img data-lumen-image="1">', DARK).length, 2);
});

test('图位张数按「最大下标」与「图位个数」取大', () => {
  assert.equal(imageSlotCount('<div>没有图位</div>'), 0);
  assert.equal(imageSlotCount('<img data-lumen-image="3">'), 3);
  assert.equal(imageSlotCount('<img data-lumen-image="1"><img data-lumen-image="1">'), 2);
});

test('同一段片段每次配到同样的图', () => {
  const frag = '<img data-lumen-image="1"><img data-lumen-image="2"><img data-lumen-image="3">';
  assert.deepEqual(stockImagesFor(frag, LIGHT), stockImagesFor(frag, LIGHT));
});

test('深色风格与浅色风格配到的图不同', () => {
  const frag = '<img data-lumen-image="1">';
  assert.notEqual(stockImagesFor(frag, DARK)[0]!.src, stockImagesFor(frag, LIGHT)[0]!.src);
});

test('图位超过图库容量时不会返回 undefined', () => {
  const frag = '<img data-lumen-image="1"><img data-lumen-image="9">';
  const images = stockImagesFor(frag, LIGHT);
  assert.ok(images.length >= 1);
  for (const img of images) assert.ok(img.src.length > 0);
});

/* ---------------- 整组分配 ---------------- */

test('一组样机之间不出现同一张画面', () => {
  // 这是实际踩到的：一套风格的九个页类型共用同一套配色，而按色板挑图是确定性的、
  // 对同一套配色总是从同一张开始给——于是几个单图位的页全拿到同一张图，
  // 并排看过去像是同一页贴了三遍。单张各自调用必然撞车，分配只能在整组层面做。
  const fragments = Array.from({ length: 9 }, () => '<img data-lumen-image="1">');

  // 先把「前提」钉住：单张各自挑确实会撞车。哪天挑选逻辑改成带随机性了，
  // 这条会先红，提醒重写下面那半——而不是让整组分配变成一段没人需要的代码
  const alone = fragments.map((f) => stockImagesFor(f, DARK));
  assert.equal(new Set(alone.map((imgs) => imgs[0]!.src)).size, 1, '前提变了：单张各自挑已经不再撞车');

  const allocated = allocateStockImages(fragments, DARK);
  const flat = allocated.flat();
  assert.equal(flat.length, 9, `九个图位该给九张，给了 ${flat.length} 张`);
  assert.equal(new Set(flat.map((i) => i.src)).size, 9, `组内挑重了：${flat.map((i) => i.src).join(', ')}`);
});

test('一组里各段拿到的张数各自对得上自己的图位', () => {
  const fragments = [
    '<div>纯文字页，没有图位</div>',
    '<img data-lumen-image="1"><img data-lumen-image="2">',
    '<img data-lumen-image="1">',
  ];
  const allocated = allocateStockImages(fragments, LIGHT);
  assert.deepEqual(allocated.map((a) => a.length), [0, 2, 1]);
  assert.equal(new Set(allocated.flat()).size, 3, '组内挑重了');
});

test('整组图位总量超过池子时回绕重用，而不是留出破图位', () => {
  // 少给一张会在页面上留一个破图图标，比重复一张难看得多
  const lightCount = PICKABLE.filter((p) => p.tone === 'light').length;
  const fragments = Array.from({ length: lightCount + 8 }, () => '<img data-lumen-image="1">');
  const allocated = allocateStockImages(fragments, LIGHT);
  assert.equal(allocated.length, fragments.length);
  for (const imgs of allocated) {
    assert.equal(imgs.length, 1);
    assert.match(imgs[0]!.src, /^\/stock\/.+\.jpg$/);
  }
});

test('空输入与全无图位的输入都不炸', () => {
  assert.deepEqual(allocateStockImages([], DARK), []);
  assert.deepEqual(allocateStockImages(['<div>x</div>'], DARK), [[]]);
});

/* ---------------- 人像位：按图位标记取抠图 ---------------- */

/**
 * 人像位：模型在图位上写 `data-lumen-cutout`，那一格就该拿到人物抠图。
 *
 * **页类型一律显式传 `'people'`。** 抠图位取人像池还是物件池是按页类型分的
 * （见 `poolForPageType`），不传就按非人物页处理、走物件池——这几条用例钉的是
 * 人像那一路，所以要显式说清自己在哪一页。
 *
 * 与上面那条「人物不参与自动配图」**不矛盾**——那条守的是**没有标记**的图位，
 * 这条守的是**有标记**的。两件事必须同时成立：普通图位永远拿不到抠图（透明底落进
 * 16:9 图位会缩成页面正中悬着一个人），而人像位拿得到。
 */
test('标了抠图的图位拿到人物图，且带 cutout 标记', () => {
  for (const pal of [DARK, LIGHT]) {
    const imgs = stockImagesFor('<img data-lumen-image="1" data-lumen-cutout="1">', pal, 'people');
    assert.equal(imgs.length, 1, `要 1 张给了 ${imgs.length} 张`);
    assert.equal(imgs[0]!.cutout, true, '人像位拿到的图必须带 cutout，否则页面上会被裁掉边缘');
    const photo = STOCK_PHOTOS.find((p) => stockUrl(p) === imgs[0]!.src);
    assert.ok(photo, `配到了一张不在清单里的图：${imgs[0]!.src}`);
    assert.equal(stockCategoryOf(photo), 'people', '人像位拿到的不是人物图');
  }
});

test('同一页里没标记的图位仍然拿不到人物图', () => {
  // 这条钉的是「人像位」没有把原来那条排除改松。
  // 一页里普通图位与人像位混排，两边都要对
  const html = [
    '<img data-lumen-image="1">',
    '<img data-lumen-image="2" data-lumen-cutout="1">',
    '<img data-lumen-image="3">',
  ].join('');
  const imgs = stockImagesFor(html, DARK, 'people');
  assert.equal(imgs.length, 3, '三个图位要给三张图');
  assert.notEqual(categoryOfSrc(imgs[0]!.src), 'people', '第 1 格没标抠图，不该拿到人物');
  assert.equal(categoryOfSrc(imgs[1]!.src), 'people', '第 2 格标了抠图，该拿到人物');
  assert.notEqual(categoryOfSrc(imgs[2]!.src), 'people', '第 3 格没标抠图，不该拿到人物');
  // 三张互不相同
  assert.equal(new Set(imgs.map((i) => i.src)).size, 3, '同一页里不该出现重复的画面');
});

test('没有抠图标记时，整组分配的结果与改动前逐字节一致', () => {
  // 这是这次改动最容易伤到的地方：其余 11 个页类型的样机都走这条路，
  // 它们一个抠图标记都没有，产出必须一模一样
  const frags = ['<img data-lumen-image="1">', '<img data-lumen-image="1"><img data-lumen-image="2">'];
  const out = allocateStockImages(frags, DARK);
  assert.deepEqual(
    out.map((s) => s.map((i) => i.src)),
    [stockPhotosFor(DARK, 3).slice(0, 1).map((p) => stockUrl(p)),
      stockPhotosFor(DARK, 3).slice(1, 3).map((p) => stockUrl(p))],
    '整组分配的取图顺序变了',
  );
});

test('普通位声明题材时，只在那个题材里挑', () => {
  // 玻璃拟态那类风格整页都该是同一题材；没有这个属性时只能靠色板距离碰运气，
  // 配出来的图题材全看谁离品牌色近
  const imgs = stockImagesFor('<img data-lumen-image="1" data-lumen-pick="玻璃">', LIGHT, 'gallery');
  assert.equal(imgs.length, 1);
  const p = photoOfSrc(imgs[0]!.src);
  assert.ok(
    p.tags.some((t) => t.includes('玻璃')) || p.file.includes('玻璃'),
    `题材没生效，配到了 ${p.file}（tags: ${p.tags.join(' ')}）`,
  );
});

test('人像位也能点名题材——深色底上要浅色衣着的人', () => {
  // 人物页下半场是极深的藏青，抽到穿黑衣服的素材时人整条糊进背景
  // （实测 1.24:1，页面上就是「人只有上半截」）。风格得能点这个名。
  const html = '<img data-lumen-image="1" data-lumen-cutout="1" data-lumen-pick="浅色衣着">';
  const imgs = stockImagesFor(html, LIGHT, 'people');
  assert.equal(imgs.length, 1);
  const p = photoOfSrc(imgs[0]!.src);
  assert.ok(p.tags.some((t) => t.includes('浅色衣着')), `没按题材取人，配到了 ${p.file}`);
});

test('同一页多个普通位都要同一题材时，各取一张不同的', () => {
  const html = [1, 2, 3, 4].map((i) => `<img data-lumen-image="${i}" data-lumen-pick="玻璃">`).join('');
  const imgs = stockImagesFor(html, LIGHT, 'gallery');
  assert.equal(imgs.length, 4, '四个图位要给四张图');
  assert.equal(new Set(imgs.map((i) => i.src)).size, 4, '同一张玻璃图在一页里出现了两次');
});

test('只有部分图位声明题材时，没声明的照常整池挑，两边不串', () => {
  // 封面、图文页那些是不带题材的——它们不该被拖进玻璃池，
  // 也不该让带了题材的图位拿到普通照片
  const frags = [
    '<img data-lumen-image="1">',
    [1, 2].map((i) => `<img data-lumen-image="${i}" data-lumen-pick="玻璃">`).join(''),
  ];
  const out = allocateStockImages(frags, LIGHT);
  const glass = out[1]!.map((i) => photoOfSrc(i.src));
  assert.ok(glass.every((p) => p.tags.some((t) => t.includes('玻璃'))), '带题材的图位拿到了非玻璃图');
  assert.notEqual(glass[0]!.file, glass[1]!.file, '同一页里玻璃图重复了');
  // 没声明题材的那一格要**避开**玻璃组已经用掉的图，否则封面和图片页会撞成同一张
  const plain = photoOfSrc(out[0]![0]!.src);
  assert.ok(!glass.some((p) => p.file === plain.file), `没声明题材的图位撞上了玻璃组：${plain.file}`);
});

test('人像位也要不到重复的人物', () => {
  const html = Array.from({ length: 4 }, (_, i) => `<img data-lumen-image="${i + 1}" data-lumen-cutout="1">`).join('');
  const imgs = stockImagesFor(html, DARK, 'people');
  assert.equal(imgs.length, 4, '四个图位要给四张图');
  assert.equal(new Set(imgs.map((i) => i.src)).size, 4, '同一个人物在一页里出现了两次');
  assert.ok(imgs.every((i) => i.cutout), '人像位全都该带 cutout');
});

test('标记与最终落图对得上——模型写重下标时也要对', () => {
  // **这条是这次最容易漏的一条。** `fillImageSlots` 不是「第 n 号图位取 images[n-1]」，
  // 而是「从声明的下标往后找第一个没用过的，找到头绕回前面」（html-doc.ts:93-104）。
  // 模型在图片排版页上会把几个图位都写成同一个下标（html-doc.ts:56 记着实测过的五连 "1"），
  // 那时它会顺延。配图这一侧若不复刻同一套顺延，人像位就会拿到普通照片、
  // 普通位拿到抠图——页面上不报错，只是版式看着不对。
  // 所以这条不走「按 src 猜分类」，而是真跑一遍 fillImageSlots 看落下来的结果
  const html = '<img data-lumen-image="1" data-lumen-cutout="1">'
    + '<img data-lumen-image="1" data-lumen-cutout="1">'
    + '<img data-lumen-image="1">';
  const filled = fillImageSlots(html, stockImagesFor(html, DARK, 'people'));
  const tags = [...filled.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]!);
  assert.equal(tags.length, 3, '三个图位');
  const srcs = tags.map((t) => /\bsrc\s*=\s*["']([^"']*)["']/i.exec(t)?.[1]);
  assert.equal(categoryOfSrc(srcs[0]!), 'people', '第 1 个 tag 标了抠图，该拿到人物');
  assert.equal(categoryOfSrc(srcs[1]!), 'people', '第 2 个 tag 标了抠图，该拿到人物');
  assert.notEqual(categoryOfSrc(srcs[2]!), 'people', '第 3 个 tag 没标，不该拿到人物');
});

test('样式里写了 contain 的图位从透明底池取图', () => {
  const html = '<style>.leaf{object-fit:contain}</style><img class="leaf" data-lumen-image="1">';
  const imgs = stockImagesFor(html, DARK);
  assert.equal(imgs.length, 1);
  // 判据看的是「是不是透明底」，不是「是不是人物」——没传页类型时走的是物件池
  assert.equal(photoOfSrc(imgs[0]!.src).transparent, true, '该从透明底池取');
  assert.ok(imgs[0]!.cutout, '该带 cutout 标记');
});

test('样式里写的是 cover 时仍从普通池取——防误伤', () => {
  const html = '<style>.thumb{object-fit:cover}</style><img class="thumb" data-lumen-image="1">';
  const imgs = stockImagesFor(html, DARK);
  assert.notEqual(photoOfSrc(imgs[0]!.src).transparent, true, '透明底素材不该进普通图位');
});

test('挑图与落图对同一份片段给出一致的判断', () => {
  // 两边各算一遍，算不到一块去就会「面板写着 A、画布上是 B」——那种错不报错。
  // 挑图侧的判断从「取到了哪个池子的图」看，落图侧的判断从「落完之后 tag 上有没有标记」看。
  // **注意它主要钉一个方向**：落图侧是 `declared || 挑图侧`，所以「挑图侧说否、落图侧说是」
  // 才抓得到；反向结构上不会发生。落图侧自己的判据在 ir-schema 有单测独立覆盖。
  const cases = [
    '<style>.leaf{object-fit:contain}</style><img class="leaf" data-lumen-image="1">',
    '<style>.thumb{object-fit:cover}</style><img class="thumb" data-lumen-image="1">',
    '<img data-lumen-image="1" data-lumen-cutout="1">',
    '<img data-lumen-image="1">',
  ];
  for (const html of cases) {
    const imgs = stockImagesFor(html, DARK);
    const picked = imgs[0]!.cutout === true;
    const rendered = imageSlotsOf(html, imgs)[0]!.cutout;
    assert.equal(rendered, picked, `两侧判断不一致：${html}`);
  }
});

/* ---------------- 抠图分池：人物页走人像池，其余走物件池 ---------------- */

const CUTOUT_SLOT = '<img data-lumen-image="1" data-lumen-cutout="1">';

/**
 * **透明底素材一张都不许进普通池。**
 *
 * 这是加了物件抠图之后最容易悄悄坏掉的一条：`REGULAR_POOL` 原先写的是
 * `kind !== 'people'`，之所以一直没出事，是因为**恰好只有人像是透明底**。
 * 物件抠图一进来它们就会掉进普通池，被当成照片配到 16:9 的图位上——
 * `object-fit: contain` 一缩，页面正中浮一个半透明的大厦。
 */
test('透明底素材一张都不进普通池', () => {
  const picked = stockPhotosFor(DARK, STOCK_PHOTOS.length + 10);
  assert.ok(picked.length > 0, '普通池空了');
  for (const p of picked) {
    assert.notEqual(p.transparent, true, `${p.file} 是透明底，不该进普通池`);
  }
});

test('人物页的抠图位从人像池取', () => {
  const imgs = stockImagesFor(CUTOUT_SLOT, DARK, 'people');
  assert.equal(imgs.length, 1);
  assert.equal(imgs[0]!.cutout, true);
  const photo = STOCK_PHOTOS.find((p) => stockUrl(p) === imgs[0]!.src)!;
  assert.equal(photo.kind, 'people', `人物页的抠图位拿到了 ${photo.kind}`);
});

/**
 * 非人物页（封面、章节页…）的抠图位走物件池。
 *
 * **物件池空的时候退回人像池**——留一个空槽渲染出来是破图图标，比给一张不贴题的图难看。
 * 两条分支都写上，是因为素材加进来之前只走得到后者：写成「必须拿到物件」的话，
 * 现在这条用例是红的，而写成「随便给一张」又验不出将来对不对。
 */
test('非人物页的抠图位：有物件用物件，没有就退回人像池——总之不空手', () => {
  const imgs = stockImagesFor(CUTOUT_SLOT, DARK, 'gallery');
  assert.equal(imgs.length, 1, '空手了');
  assert.equal(imgs[0]!.cutout, true, '抠图位拿到的图必须带 cutout');
  const photo = STOCK_PHOTOS.find((p) => stockUrl(p) === imgs[0]!.src)!;
  if (objectPool().length > 0) {
    assert.equal(photo.kind, 'object', `物件池非空，却拿了 ${photo.kind}`);
  } else {
    assert.equal(photo.kind, 'people', '物件池为空时该退回人像池');
  }
});

test('同一页里两种抠图位各取各的，不互相串', () => {
  // 人物页里混一个非人物页的片段——两条链路在同一次分配里都得对
  const peopleFrag = '<img data-lumen-image="1" data-lumen-cutout="1">';
  const plainFrag = '<img data-lumen-image="1">';
  const [a, b] = allocateStockImages([peopleFrag, plainFrag], DARK, ['people', 'text']);
  assert.equal(a![0]!.cutout, true, '人物页的抠图位没拿到抠图');
  assert.notEqual(b![0]!.cutout, true, '普通图位不该拿到抠图');
});

test('不传页类型也能配图（admin 的缩略图就没传）', () => {
  const imgs = stockImagesFor('<img data-lumen-image="1">', DARK);
  assert.equal(imgs.length, 1);
});
