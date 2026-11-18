import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANVAS_HEIGHT, CANVAS_WIDTH, HOVER_CSS, STAGGER_ATTR, STAGGER_CSS, STAGGER_DIRECTIONS, STAGGER_MAX_ITEMS,
  STATIC_CSS,
  applyElementEdits, buildPageDocument, fillImageSlots, framingOf, imageOverridesOf, imageSlotsOf, isCutoutSlot,
  REVEAL_CSS,
  applyTextRuns, markElementIndex, markStaggerItems, objectFitByClass, paletteVars,
  staggerDirectionFor, stripHardcodedFonts, textBlocksOf, textRunsOf,
  type StockImage,
} from './html-doc.js';
import { brandOf, hasBrand } from './brand.js';

/** 把一串地址包成落图对象。绝大多数用例不关心抠图，只关心顺序与去重 */
const imgs = (...urls: string[]): StockImage[] => urls.map((src) => ({ src }));

const PALETTE = {
  bg: '#EFE6DA', surface: '#F7F1E8', text: '#3A322B', muted: '#8A7F73',
  accent: '#E08A3C', brand: '#C7421A', border: '#D8CDBF',
};
const FONT = 'system-ui, sans-serif';

test('装配出来的文档带骨架、固定画布、以及配色变量兜底', () => {
  const doc = buildPageDocument('<style>.a{color:var(--text)}</style><div class="a">内容</div>', {
    palette: PALETTE, fontFamily: FONT, title: '样机',
  });
  assert.match(doc, /^<!DOCTYPE html>/);
  assert.match(doc, /<meta charset="utf-8">/);
  assert.ok(doc.includes(`${CANVAS_WIDTH}px`), '画布宽度要钉死');
  assert.ok(doc.includes(`${CANVAS_HEIGHT}px`), '画布高度要钉死');
  for (const c of Object.values(PALETTE)) assert.ok(doc.includes(c), `${c} 应写进变量兜底`);
  assert.ok(doc.includes(FONT));
  assert.ok(doc.includes('<div class="a">内容</div>'), '片段要原样保留');
});

test('片段自己那份 :root 排在兜底之后——它应该赢', () => {
  // 兜底只是「模型漏写某个变量」时的保险，不能反过来盖掉模型的配色
  const doc = buildPageDocument('<style>:root{--bg:#000000}</style><div>x</div>', {
    palette: PALETTE, fontFamily: FONT,
  });
  const fallbackAt = doc.indexOf('--bg: #EFE6DA');
  const ownAt = doc.indexOf('--bg:#000000');
  assert.ok(fallbackAt >= 0 && ownAt >= 0, '两份都应在');
  assert.ok(ownAt > fallbackAt, '片段自己那份要在兜底之后');
});

test('图片位按下标填图，下标从 1 开始', () => {
  const frag = '<img data-lumen-image="1" alt="一"><img data-lumen-image="2" alt="二">';
  const out = fillImageSlots(frag, imgs('/a.jpg', '/b.jpg'));
  assert.ok(out.includes('src="/a.jpg"'));
  assert.ok(out.includes('src="/b.jpg"'));
  assert.ok(out.includes('alt="一"'), '原有属性要保留');
});

test('几个图位写成同一个下标时，配到的是互不相同的图', () => {
  // 实测踩到的：图片排版页的五个图位**全写成 "1"**，按下标取图会让整页重复同一张画面，
  // 用户看到的是「同一张图贴了五遍」。撞过的下标要顺延到没用过的那张
  const frag = Array.from({ length: 5 }, () => '<img data-lumen-image="1">').join('');
  const out = fillImageSlots(frag, imgs('/a.jpg', '/b.jpg', '/c.jpg', '/d.jpg', '/e.jpg'));
  const srcs = [...out.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(srcs.length, 5, `五个图位该填五张，填了 ${srcs.length} 张`);
  assert.equal(new Set(srcs).size, 5, `重复了：${srcs.join(', ')}`);
});

test('图位比可用的图多时，多出来的仍是占位块', () => {
  // 顺延不能变成「把别的图挪过来」——图真的不够时要如实留占位块
  const frag = '<img data-lumen-image="1"><img data-lumen-image="1"><img data-lumen-image="1">';
  const out = fillImageSlots(frag, imgs('/a.jpg'));
  assert.equal((out.match(/src=/g) ?? []).length, 1);
  assert.equal((out.match(/lumen-image-slot/g) ?? []).length, 2, '多出来的两个该是占位块');
});

test('没有对应图片的图位换成占位块，不留破图', () => {
  const out = fillImageSlots('<img data-lumen-image="3" alt="三">', imgs('/a.jpg'));
  assert.ok(!out.includes('<img'), '不能留一个没有 src 的 img——浏览器里是个破图标');
  assert.ok(out.includes('lumen-image-slot'), '应换成占位块');
});

test('占位块沿用原 img 的 class 与内联样式——换的是内容不是版式', () => {
  const out = fillImageSlots(
    '<img data-lumen-image="1" class="hero" style="width:100%;border-radius:8px">', [],
  );
  // **并成一个 class 属性**，不能写成 `class="lumen-image-slot" class="hero"`：
  // 重复的 class 浏览器只认第一个，模型自己的类名会被整条丢掉，那个图位的定位就塌了
  assert.equal((out.match(/\bclass=/g) ?? []).length, 1, '只能有一个 class 属性');
  assert.match(out, /class="lumen-image-slot hero"/, '占位块的类与模型自己的类都要在');
  assert.ok(out.includes('style="width:100%;border-radius:8px"'), '内联样式要保留');
});

test('装配出来的文档带占位块样式', () => {
  const doc = buildPageDocument('<div>x</div>', { palette: PALETTE, fontFamily: FONT });
  assert.ok(doc.includes('.lumen-image-slot'), '占位块样式要注入，否则占位块是透明的');
});

test('三个字体角色都注入，没给的落回上一个角色', () => {
  const full = buildPageDocument('<div>x</div>', {
    palette: PALETTE, fontFamily: FONT, fontDisplay: 'Georgia,serif', fontScript: 'cursive',
  });
  assert.ok(full.includes(`--font-sans: ${FONT};`));
  assert.ok(full.includes('--font-display: Georgia,serif;'));
  assert.ok(full.includes('--font-script: cursive;'));

  /*
    **没给也必须注入**：骨架里写的是 `font-family:var(--font-display)`，
    变量没定义的话这条声明在计算值阶段就是无效的、整个属性退回继承——
    看着像「骨架的字体不起作用」，而不是「这套风格没设展示字体」。
  */
  const bare = buildPageDocument('<div>x</div>', { palette: PALETTE, fontFamily: FONT });
  assert.ok(bare.includes('--font-display: var(--font-sans);'), '展示字体没给就该落回正文');
  assert.ok(bare.includes('--font-script: var(--font-display);'), '手写体没给就该落回展示字体');
});

test('已经有 src 的图位被替换而不是叠加两个 src', () => {
  const out = fillImageSlots('<img data-lumen-image="1" src="">', imgs('/a.jpg'));
  assert.equal((out.match(/src=/g) ?? []).length, 1);
  assert.ok(out.includes('src="/a.jpg"'));
});

test('没有图位的片段不受影响', () => {
  const frag = '<div>纯文字</div>';
  assert.equal(fillImageSlots(frag, imgs('/a.jpg')), frag);
});

test('配色变量拼成一串自定义属性', () => {
  const vars = paletteVars(PALETTE);
  assert.ok(vars.includes('--bg: #EFE6DA;'));
  assert.ok(vars.includes('--accent: #E08A3C;'));
});

/* ---------------- 透明底抠图 ---------------- */

test('抠图落图时标上 data-lumen-cutout，照片不标', () => {
  const out = fillImageSlots(
    '<img data-lumen-image="1"><img data-lumen-image="2">',
    [{ src: '/stock/cutout-1.png', cutout: true }, { src: '/stock/nature-3.jpg' }],
  );
  assert.equal((out.match(/data-lumen-cutout="1"/g) ?? []).length, 1, '只该标抠图那一张');
  // 标在抠图那一张身上，不是随便一张
  assert.match(out, /<img[^>]*data-lumen-cutout="1"[^>]*src="\/stock\/cutout-1\.png"/);
  const second = /<img[^>]*data-lumen-image="2"[^>]*>/.exec(out)?.[0] ?? '';
  assert.ok(second.includes('src="/stock/nature-3.jpg"'));
  assert.ok(!second.includes('data-lumen-cutout'), '照片不该标抠图');
});

/**
 * 序号是**给画布上的拖拽手柄用的**：手柄按 DOM 元素找图位，而 `data-lumen-image="n"`
 * 那个 n 是模型写的、不可靠（实测五个图位都写成 "1"）。盖上去的序号与覆盖表的 key
 * 是同一个数，三边才对得上。
 */
test('落完图后每个图位都盖上了自己的序号', () => {
  const out = fillImageSlots(
    '<img data-lumen-image="1"><img data-lumen-image="1"><img data-lumen-image="1">',
    imgs('/a.jpg', '/b.jpg', '/c.jpg'),
  );
  const nos = [...out.matchAll(/data-lumen-slot="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(nos, [0, 1, 2], '五个图位都写成 "1" 也要数出互不相同的序号');
});

test('图不够时的占位块也带序号——手柄要能找到它', () => {
  const out = fillImageSlots('<img data-lumen-image="1"><img data-lumen-image="2">', imgs('/a.jpg'));
  const nos = [...out.matchAll(/data-lumen-slot="(\d+)"/g)].map((m) => Number(m[1]));
  assert.deepEqual(nos, [0, 1]);
  assert.ok(out.includes('lumen-image-slot'), '第二个仍是占位块');
});

test('抠图标记不会重复叠加', () => {
  const out = fillImageSlots(
    '<img data-lumen-image="1" data-lumen-cutout="1">',
    [{ src: '/a.png', cutout: true }],
  );
  assert.equal((out.match(/data-lumen-cutout/g) ?? []).length, 1);
});

test('已经有 src 的抠图位也要标上——替换 src 与标记是两件事', () => {
  const out = fillImageSlots(
    '<img data-lumen-image="1" src="old.png" style="object-fit:cover">',
    [{ src: '/new.png', cutout: true }],
  );
  assert.ok(out.includes('data-lumen-cutout="1"'));
  assert.ok(out.includes('src="/new.png"'));
  assert.ok(!out.includes('old.png'));
});

test('文档里注入了抠图不裁切的规则，且带 !important', () => {
  // 模型把 object-fit 写在内联 style 上，样式表规则不加 !important 压不过内联样式
  const doc = buildPageDocument('<div>x</div>', { palette: PALETTE, fontFamily: FONT });
  // 三个取值是一条规则里的选择器组，所以先取出那条规则再逐值核对
  const rule = /img\[data-lumen-cutout="1"\][^{]*\{[^}]*object-fit:\s*contain\s*!important/.exec(doc)?.[0];
  assert.ok(rule, '抠图位的 object-fit:contain !important 那条规则不见了');
  // `head`/`half` 是图位声明取景的写法，`1` 是老页面里的——三个都得在
  for (const v of ['1', 'head', 'half']) {
    assert.ok(rule.includes(`data-lumen-cutout="${v}"`), `选择器里缺 data-lumen-cutout="${v}"`);
  }
});

/* ---------------- 图位的位置与裁切 ---------------- */

/** 取某个图位落完之后那条 `<img ...>` 的内联样式，省得每条断言都去写正则 */
function styleOf(out: string): string {
  return /\bstyle\s*=\s*["']([^"']*)["']/i.exec(out)?.[1] ?? '';
}

/**
 * **这条是这个功能最容易悄悄坏的地方。**
 *
 * 模型常用 `transform: translate(-50%,-50%)` 居中。位置调整若写成 `transform` 简写，
 * 就把它的居中整个替换掉——图跑到右下角，而页面上不报任何错。
 * 独立的 `translate` 属性是另一个通道，与 `transform` 叠加。
 */
test('挪图位不动模型写的 transform 简写', () => {
  const frag = '<img data-lumen-image="1" style="transform: translate(-50%,-50%); width: 400px">';
  const out = fillImageSlots(frag, imgs('/a.jpg'), { '0': { dx: 20, dy: -30 } });
  assert.ok(out.includes('transform: translate(-50%,-50%)'), '模型的 transform 要原样留着');
  assert.ok(styleOf(out).includes('translate: 20px -30px'), '位移要落在独立的 translate 上');
  assert.ok(out.includes('width: 400px'), '别的样式不动');
});

test('缩放与旋转也各走独立属性', () => {
  const out = fillImageSlots('<img data-lumen-image="1">', imgs('/a.jpg'), {
    '0': { scale: 1.25, rotate: 8 },
  });
  const s = styleOf(out);
  assert.ok(s.includes('scale: 1.25'));
  assert.ok(s.includes('rotate: 8deg'));
});

test('没调过的图位，样式一个字都不动', () => {
  const frag = '<img data-lumen-image="1" style="width:400px">';
  const out = fillImageSlots(frag, imgs('/a.jpg'), { '0': { prompt: '一片落叶' } });
  assert.equal(styleOf(out), 'width:400px', '只写了提示词，不该动版式');
});

test('原来没有 style 的图位，调整后新加一个', () => {
  const out = fillImageSlots('<img data-lumen-image="1" alt="一">', imgs('/a.jpg'), { '0': { dx: 5 } });
  assert.ok(out.includes('alt="一"'), '原有属性要保留');
  assert.equal(styleOf(out), 'translate: 5px 0px');
});

/**
 * 覆盖表的 schema 是 `z.record(z.unknown())`，里面什么类型都可能躺着。
 * 一个非法值不该把整条 `style` 声明毁掉——那是「用户调了位置，版式反而全塌」。
 */
test('覆盖表里的非法数字被忽略，不是当成 0', () => {
  const ov = imageOverridesOf({
    images: { 0: { dx: '20', dy: null, scale: Number.NaN, rotate: 3 } },
  });
  assert.equal(ov['0']?.dx, undefined);
  assert.equal(ov['0']?.dy, undefined);
  assert.equal(ov['0']?.scale, undefined);
  assert.equal(ov['0']?.rotate, 3, '合法的那一项要留下');
});

test('合法的位置字段被读出来', () => {
  const ov = imageOverridesOf({
    images: { 0: { dx: 12, dy: -4, scale: 1.5, rotate: 3 } },
  });
  assert.deepEqual(ov['0'], { dx: 12, dy: -4, scale: 1.5, rotate: 3 });
});

test('老数据里残留的 focus / zoom 被忽略，不报错也不再生效', () => {
  // 这两个字段对应的「裁切左右 / 裁切上下 / 放大」三条滑杆已经删掉。
  // 用过的项目里还留着值，读的时候直接丢掉——留着就会变成面板上看不见、
  // 却在悄悄影响渲染的幽灵状态
  const ov = imageOverridesOf({
    images: { 0: { dx: 5, focus: { x: 0.2, y: 0.3 }, zoom: 2 } },
  });
  assert.deepEqual(ov['0'], { dx: 5 });
});

test('覆盖表里的调整在占位块那条路上不生效，也不报错', () => {
  // 图不够时图位是占位块，没有 src 可调；不该因此抛，也不该把版式改坏
  const out = fillImageSlots('<img data-lumen-image="9" style="width:400px">', imgs('/a.jpg'), {
    '0': { dx: 30, scale: 2 },
  });
  assert.ok(out.includes('lumen-image-slot'), '仍是占位块');
});

/* ---------------- 元素逐块进场 ---------------- */

/** 把标出来的元素按出现顺序读成 [标签名, 序号] */
function items(html: string): [string, number][] {
  return [...html.matchAll(/<([a-z][\w-]*)[^>]* data-stagger-item [^>]*--stagger-i:(\d+)/gi)]
    .map((m) => [m[1]!, Number(m[2]!)] as [string, number]);
}

test('按阅读序递归分配：标题、正文、卡片组各拿一个序号，卡片再各自一个', () => {
  const frag = '<div class="stage"><header><i>x</i></header>'
    + '<main><h1>标题</h1><p>正文</p><div class="cards"><b>1</b><b>2</b><b>3</b></div></main></div>';
  const out = markStaggerItems(frag, 'up');
  const first = /^<[^>]*>/.exec(out)![0];
  assert.ok(first.includes(`${STAGGER_ATTR}="up"`), `方向该标在最外层容器上：${first}`);
  assert.ok(first.includes('class="stage"'));
  // header=0, main=1, h1=2, p=3, cards=4, 三张卡=5,6,7
  assert.deepEqual(items(out).map(([t, i]) => `${t}${i}`),
    ['header0', 'main1', 'h12', 'p3', 'div4', 'b5', 'b6', 'b7']);
});

test('根只有一个孩子时退到里面那一层', () => {
  const frag = '<div class="slide"><div class="cards"><div>a</div><div>b</div><div>c</div></div></div>';
  const out = markStaggerItems(frag, 'up');
  assert.deepEqual(items(out).map(([t]) => t), ['div', 'div', 'div']);
  assert.match(out, new RegExp(`${STAGGER_ATTR}="up"`));
});

test('一处都挑不到时原样返回——降级成整体淡入，不是失败', () => {
  // 单段正文：根只有一个孩子，孩子也没有并列的子节点
  const frag = '<div class="slide"><p>只有一段话</p></div>';
  assert.equal(markStaggerItems(frag, 'up'), frag);
  assert.equal(markStaggerItems('', 'up'), '');
});

test('空元素算子节点（图要跟着进场），但自己不会变成容器', () => {
  // img/br 没有闭合标签，若把它们压进栈，后面的兄弟会被算成它们的孩子，
  // 真正的容器就少算一层子节点、挑不出来。图是内容，<br> 只是排版
  const frag = '<div class="stage"><img src="a.png"><br><p>一句话</p><p>又一句</p></div>';
  const out = markStaggerItems(frag, 'up');
  const first = /^<[^>]*>/.exec(out)![0];
  assert.ok(first.includes(`${STAGGER_ATTR}="up"`), `该标在 stage 上：${out}`);
  assert.deepEqual(items(out).map(([t, i]) => `${t}${i}`), ['img0', 'p1', 'p2']);
});

test('纯装饰层不单独进场——背景光晕不该比内容先亮', () => {
  // 实测踩到的：封面根节点底下是 [两团光晕, 底图, 遮罩, header, main, footer]，
  // 按顺序标下来最先动的是光晕，看着像页面加载了两遍
  const frag = '<div class="canvas">'
    + '<span class="glow glow--tl"></span><span class="glow glow--br"></span>'
    + '<img class="bg-image" src="a.png"><span class="bg-scrim"></span>'
    + '<header>页眉</header><main>正文</main></div>';
  const out = markStaggerItems(frag, 'up');
  // 底图留着（它是内容），两团光晕与遮罩跳过
  assert.deepEqual(items(out).map(([t, i]) => `${t}${i}`), ['img0', 'header1', 'main2']);
});

test('跳过的不占号——序号在标出来的那些之间仍然连续', () => {
  const frag = '<div class="canvas"><span class="glow"></span><p>一</p><span class="glow"></span><p>二</p></div>';
  const out = markStaggerItems(frag, 'up');
  assert.deepEqual(items(out).map(([, i]) => i), [0, 1]);
});

test('序号封顶，不会给一页上百个元素都挂动画', () => {
  const items20 = Array.from({ length: 40 }, (_, i) => `<li>${i}</li>`).join('');
  const out = markStaggerItems(`<ul>${items20}</ul>`, 'up');
  assert.equal(items(out).length, STAGGER_MAX_ITEMS);
  assert.deepEqual(items(out).map(([, i]) => i), Array.from({ length: STAGGER_MAX_ITEMS }, (_, i) => i));
});

test('模型漏写闭合标签时不错位——宁可少标也不标到别的元素上', () => {
  const frag = '<div class="stage"><section><h1>标题</h1><p>正文</p></div>';
  const out = markStaggerItems(frag, 'up');
  // stage 只有一个孩子，挑不出容器；section 那两个孩子拿 0 与 1。
  // 绝不能因为少一个 </section> 就把标记插到 stage 上
  assert.deepEqual(items(out).map(([t, i]) => `${t}${i}`), ['h10', 'p1']);
  assert.ok(!/^<div[^>]*data-stagger-item/.test(out), 'stage 不该被标');
});

test('带引号属性里的 > 不会把标签截断，已有的属性一个不动', () => {
  const frag = '<div class="stage" data-note="a>b"><h1 style="color:red">标题</h1><p>正文</p></div>';
  const out = markStaggerItems(frag, 'left');
  assert.ok(out.includes('data-note="a>b"'), '属性要原样保留');
  assert.ok(out.includes('style="color:red;--stagger-i:0"'), `已有的 style 要追加而不是覆盖：${out}`);
});

test('方向按种子轮换，负种子也落在合法范围内', () => {
  const got = [0, 1, 2, 3, 4, 5].map((i) => staggerDirectionFor(i));
  assert.deepEqual(got, ['up', 'left', 'right', 'scale', 'up', 'left']);
  for (const seed of [-1, -2, -9]) {
    assert.ok(STAGGER_DIRECTIONS.includes(staggerDirectionFor(seed)));
  }
});

test('导出静帧：motion:none 时不标任何东西，并注入把动效按死的规则', () => {
  const frag = '<div class="stage"><h1>标题</h1><p>正文</p></div>';
  const doc = buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT, motion: 'none', staggerSeed: 3,
  });
  assert.ok(!doc.includes(STAGGER_ATTR), '导出稿里不能留逐块进场的标记');
  assert.ok(!doc.includes('data-stagger-item'));
  assert.ok(doc.includes(STATIC_CSS), '导出稿要把动效按死，否则截图可能拍在中途');
});

test('演示态：给了种子就标元素并注入方向 CSS，不给就不标', () => {
  const frag = '<div class="stage"><h1>标题</h1><p>正文</p></div>';
  const doc = buildPageDocument(frag, { palette: PALETTE, fontFamily: FONT, staggerSeed: 0 });
  assert.ok(doc.includes('data-stagger-item'));
  assert.ok(doc.includes(`${STAGGER_ATTR}="up"`), '种子 0 是 up');
  assert.ok(doc.includes('lumen-stagger-in'), '关键帧要注入——iframe 加载不到主文档的样式表');
  assert.ok(doc.includes('min(var(--stagger-i, 0), 8)'), '延迟要夹住');
  assert.ok(!doc.includes(STATIC_CSS));

  const plain = buildPageDocument(frag, { palette: PALETTE, fontFamily: FONT });
  assert.ok(!plain.includes('data-stagger-item'));
  assert.ok(!plain.includes(STATIC_CSS), '默认是播放态，不该把动效按死');
});

test('揭示态：标元素但不自播，只把元素压成透明等外层点亮', () => {
  const frag = '<div class="stage"><h1>标题</h1><p>正文</p></div>';
  const doc = buildPageDocument(frag, { palette: PALETTE, fontFamily: FONT, reveal: true });

  assert.ok(doc.includes('data-stagger-item'), '要靠这套标记拿阅读序');
  assert.ok(doc.includes(REVEAL_CSS), '要注入「先藏起来」那条规则');
  assert.ok(doc.includes('opacity: 0'), '元素得先是透明的，外层才有得点亮');
  // **不能自播**：带了 animation 的话页面一渲染就自己跑完，外层再点也没意义
  assert.ok(!doc.includes('lumen-stagger-in'), '揭示态不该注入逐块进场的关键帧');
  assert.ok(!doc.includes(STAGGER_CSS));
});

test('揭示态与逐块进场互斥：同时传 reveal 与 staggerSeed 时以 reveal 为准', () => {
  const frag = '<div class="stage"><h1>标题</h1><p>正文</p></div>';
  const doc = buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT, reveal: true, staggerSeed: 3,
  });
  assert.ok(doc.includes(REVEAL_CSS));
  assert.ok(!doc.includes('lumen-stagger-in'), '两套动画抢同一批元素，只能留一套');
  // 标记照旧要留：揭示靠 `--stagger-i` 拿阅读序，少了它框就是按 DOM 顺序冒出来的
  assert.ok(doc.includes('data-stagger-item') && doc.includes('--stagger-i'));
});

test('不传 reveal 时输出与改动前逐字一致', () => {
  const frag = '<div class="stage"><h1>标题</h1><p>正文</p></div>';
  const opts = { palette: PALETTE, fontFamily: FONT, staggerSeed: 2 };
  const withFlag = buildPageDocument(frag, { ...opts, reveal: false });
  const without = buildPageDocument(frag, opts);
  assert.equal(withFlag, without, '显式传 false 与不传必须同一条路');
  assert.ok(!withFlag.includes(REVEAL_CSS));
});

/* ---------------- 文字段：列出来、改回去 ---------------- */

const RUN_PAGE = [
  '<div class="stage">',
  '  <style>.a{color:var(--text)}</style>',
  '  <!-- 3. 中部标题组 -->',
  '  <header><div>从0-1成为FDE</div><div>第 1 页，共 30 页</div></header>',
  '  <main>',
  '    <h1>命题：缺的不是模型</h1>',
  '    <p><strong>来源可查</strong>：Palantir 在 2020 年的 S-1 招股书中。</p>',
  '    <div>FDE 交付节奏<br>进场 · 落地</div>',
  '    <div></div><span>   </span>',
  '  </main>',
  '</div>',
].join('');

test('文字段：跳过 style、注释与纯空白，其余按文档序列出', () => {
  const runs = textRunsOf(RUN_PAGE);
  assert.deepEqual(runs.map((r) => r.text), [
    '从0-1成为FDE',
    '第 1 页，共 30 页',
    '命题：缺的不是模型',
    '来源可查',
    '：Palantir 在 2020 年的 S-1 招股书中。',
    'FDE 交付节奏',
    '进场 · 落地',
  ]);
  // 注释里的中文不该出现，CSS 更不该
  assert.ok(!runs.some((r) => r.text.includes('中部标题组')));
  assert.ok(!runs.some((r) => r.text.includes('color:var')));
});

test('文字段：混排元素按文本节点拆开，ordinal / siblings 对得上', () => {
  const runs = textRunsOf(RUN_PAGE);

  // `<div>FDE 交付节奏<br>进场 · 落地</div>`：同一个 <div> 下两段，这才需要标序号
  const br = runs.filter((r) => r.tag === 'div' && r.siblings === 2);
  assert.deepEqual(br.map((r) => [r.text, r.ordinal]), [['FDE 交付节奏', 0], ['进场 · 落地', 1]]);

  // `<p><strong>来源可查</strong>：…</p>`：**标签名取的是直接父元素**，
  // 加粗那段的父元素是 <strong> 而不是 <p>——界面上标「strong」比标「p」更准
  const bold = runs.find((r) => r.text === '来源可查')!;
  assert.equal(bold.tag, 'strong');
  assert.equal(runs.find((r) => r.text.startsWith('：Palantir'))!.tag, 'p');

  // 只有一个文本节点的元素，ordinal 是 0、siblings 是 1——界面据此不标序号
  const h1 = runs.find((r) => r.tag === 'h1')!;
  assert.deepEqual([h1.ordinal, h1.siblings], [0, 1]);
});

test('文字段：改一段不影响其余，也不动结构', () => {
  const runs = textRunsOf(RUN_PAGE);
  const target = runs.find((r) => r.text.startsWith('：Palantir'))!;
  const next = applyTextRuns(RUN_PAGE, [{ i: target.i, text: '：这是改写后的说明。' }]);

  assert.ok(next.includes('：这是改写后的说明。'), '没写进去');
  // **结构必须原样**：换 textContent 的做法会在这里把 <strong> 抹掉
  assert.ok(next.includes('<strong>来源可查</strong>'), '<strong> 被改没了——这正是按文本节点分段的理由');
  assert.ok(next.includes('<br>'), '<br> 被改没了');
  assert.ok(next.includes('第 1 页，共 30 页'), '没动的那一段被改了');

  const after = textRunsOf(next);
  assert.equal(after.length, runs.length, '改文字不该改变段的条数');
  assert.equal(after[target.i]!.text, '：这是改写后的说明。');
  assert.deepEqual(
    after.map((r) => r.text).filter((_, i) => i !== target.i),
    runs.map((r) => r.text).filter((_, i) => i !== target.i),
    '除了那一段，其余一个字都不该变',
  );
});

test('文字段：实体解码后再编码，往返一致', () => {
  const frag = '<div>AT&amp;T 与 &lt;标签&gt;</div>';
  const runs = textRunsOf(frag);
  assert.equal(runs[0]!.text, 'AT&T 与 <标签>', '列出来给用户看的应该是解码后的');

  // 改别的段时，没动的那段原样保留（不重新编码）
  const other = '<div>AT&amp;T 与 &lt;标签&gt;</div><p>正文</p>';
  const kept = applyTextRuns(other, [{ i: 1, text: '改过的正文' }]);
  assert.ok(kept.includes('AT&amp;T 与 &lt;标签&gt;'), '没动的段被重新编码了');
});

test('文字段：用户输入里的尖括号与和号要转义，不能把 HTML 打坏', () => {
  const next = applyTextRuns('<p>原文</p>', [{ i: 0, text: 'a < b & c > d' }]);
  assert.equal(next, '<p>a &lt; b &amp; c &gt; d</p>');
  // 转义之后仍然是同一段，条数不变
  assert.equal(textRunsOf(next).length, 1);
  assert.equal(textRunsOf(next)[0]!.text, 'a < b & c > d');
});

test('文字段：空片段与没有文字的片段不炸', () => {
  assert.deepEqual(textRunsOf(''), []);
  assert.deepEqual(textRunsOf('<style>.a{}</style><div></div>'), []);
  assert.equal(applyTextRuns('<div>x</div>', []), '<div>x</div>');
  // 越界的下标忽略，不抛错
  assert.equal(applyTextRuns('<div>x</div>', [{ i: 99, text: 'y' }]), '<div>x</div>');
});

test('文字段：漏写闭合标签时不把后面的文字算进前一个元素', () => {
  // 模型偶尔漏闭合。scanTags 那套的做法是「不配对就跳过」，这里也照做——
  // 算错顶多是某一段的标签名标得不对，不能让它把整段文字吞掉
  const runs = textRunsOf('<div><p>甲</div><p>乙</p>');
  assert.deepEqual(runs.map((r) => r.text), ['甲', '乙']);
});

const BLOCK_PAGE = [
  '<div class="stage">',
  '  <header><div>FDE 交付节奏</div><div>第 6 页，共 30 页</div></header>',
  '  <main>',
  '    <h1>进场 · 落地 · 扩展 · 移交</h1>',
  '    <p>蹲点观察客户真实操作，画出流程现状图。</p>',
  '  </main>',
  '  <footer><div>FDE · 交付节奏</div></footer>',
  '</div>',
].join('');

test('区块：取最外层元素的直接孩子，认得出的标签翻成中文', () => {
  const blocks = textBlocksOf(BLOCK_PAGE);
  assert.deepEqual(blocks.map((b) => [b.label, b.tag]), [
    ['页头', 'header'], ['正文', 'main'], ['页脚', 'footer'],
  ]);
  // 文字不多时直接平铺，不分小组——页头那两条摆成三层比平铺还长
  assert.deepEqual(blocks[0]!.runs.map((r) => r.text), ['FDE 交付节奏', '第 6 页，共 30 页']);
  assert.deepEqual(blocks[0]!.groups, []);
});

test('区块：每个文字段只出现一次，合起来正好是全部文字段', () => {
  const runs = textRunsOf(BLOCK_PAGE);
  const seen = textBlocksOf(BLOCK_PAGE).flatMap((b) => [...b.runs, ...b.groups.flatMap((g) => g.runs)]);
  // 顺序也要对：导航、滚动定位都按这个顺序来
  assert.deepEqual(seen.map((r) => r.i), runs.map((r) => r.i));
});

test('区块：多个顶层元素各算一块', () => {
  const blocks = textBlocksOf('<div>甲</div><div>乙</div>');
  assert.equal(blocks.length, 2);
  assert.deepEqual(blocks.map((b) => b.runs.map((r) => r.text)), [['甲'], ['乙']]);
});

test('区块：文字多的往下切到小组，切完仍覆盖全部文字', () => {
  // 16 段 > 阈值 12，而且四个 section 各 4 段——切到 section 这一级就够细了
  const sec = (n: number) => `<section><h2>第 ${n} 组标题</h2><p>说明一</p><p>说明二</p><span>注</span></section>`;
  // 外面套一层 stage：块取的是**最外层元素的直接孩子**，不套的话块就是那四个 section
  const frag = `<div class="stage"><main>${[1, 2, 3, 4].map(sec).join('')}</main></div>`;

  const [main] = textBlocksOf(frag);
  assert.equal(main!.tag, 'main');
  assert.equal(main!.runs.length, 0, '分了组就不该在区块上再留一份（同一段会显示两次）');
  assert.deepEqual(main!.groups.map((g) => g.runs.length), [4, 4, 4, 4]);
  assert.equal(main!.groups.flatMap((g) => g.runs).length, textRunsOf(frag).length);
});

test('区块：小组名跳过开头的大数字，取第一段像标题的文字', () => {
  // 真实数据里组的开头常常是装饰性的大数字（「01」「P3–P5」），拿它当组名等于没名字
  const card = (n: number) => `<article><div>0${n}</div><div>P3–P5</div><div>FDE 是什么</div><p>一个被写进招股书的岗位。</p></article>`;
  const frag = `<main><div>${[1, 2, 3, 4].map(card).join('')}</div></main>`;

  const [main] = textBlocksOf(frag);
  assert.ok(main!.groups.length >= 2);
  for (const g of main!.groups) assert.equal(g.label, 'FDE 是什么', `组名取成了 ${g.label}`);
});

test('区块：空片段与没有文字的片段不炸', () => {
  assert.deepEqual(textBlocksOf(''), []);
  assert.deepEqual(textBlocksOf('<style>.a{}</style><div></div>'), []);
});

test('悬停反馈：默认不注入，传了 hover 才注入', () => {
  const frag = '<div class="stage"><div class="ph"><img data-lumen-image="1"></div></div>';

  const plain = buildPageDocument(frag, { palette: PALETTE, fontFamily: FONT });
  assert.ok(!plain.includes(':hover'), '默认不该注入悬停规则');

  const hover = buildPageDocument(frag, { palette: PALETTE, fontFamily: FONT, hover: true });
  assert.ok(hover.includes(HOVER_CSS));
  assert.ok(hover.includes(':hover'));
  // 动的是图位的**父元素**：骨架里约 95% 的图位外面是 `overflow: hidden`，
  // 效果挂在 `<img>` 上会被整条裁掉，规则写了也看不见
  assert.ok(hover.includes(':has(> [data-lumen-image])'), '要挑中裁剪框那一层，不是图位自己');
  // `body > *` 把页面根元素排除掉，否则鼠标一进画面整页抬起
  assert.ok(hover.includes('body > * :has('), '要排除页面根元素');
  // 骨架自己用 `transform` 做定位与旋转，简写是整体替换，写进去元素当场跳位
  assert.ok(!/transform\s*:/.test(HOVER_CSS), '只能用 translate/scale 长写，不能碰 transform 简写');
  // 不画描边：`outline` 跟 border-box 走，圆头像/六边形头像上会显出一个方框
  assert.ok(!/outline/.test(HOVER_CSS), '悬停不加描边');
  assert.ok(hover.includes('prefers-reduced-motion'), '这段 CSS 在 iframe 里，主文档那条够不到');
});

/* ---------------- 品牌槽位 ---------------- */
const BRAND_FRAG = [
  '<style>.brand-mark{width:34px;height:34px}</style>',
  '<div class="brandbar">',
  '  <span class="brand-mark" data-lumen-brand="logo"></span>',
  '  <span class="brand-name" data-lumen-brand="name"></span>',
  '  <span class="brand-sub" data-lumen-brand="tagline"></span>',
  '</div>',
].join('\n');

const LOGO_SVG = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="currentColor"/></svg>';

/**
 * 槽位里 logo 最终长成的那串 data URL。
 *
 * 稿是**百分号编码**放进 `<img src>` 的，所以断言不能再拿 `doc.includes(LOGO_SVG)` 去比——
 * 那句话在改动后永远为假，而假断言只会让人以为功能坏了。这里复算一遍，而不是抄字面量。
 *
 * 注意：**它证明不了编码是对的**：左右两边走同一个变换，一起错就一起绿。所以下面另有三条
 * **独立**的断言（解码回来查 `xmlns`、查 `currentColor` 已烘掉、查坏色值兜底）。
 * 三者合起来才守得住这条链路。
 */
const logoData = (svg: string, color: string = PALETTE.brand) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
    svg.replace(/<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"').replace(/currentColor/gi, color),
  )}`;

/**
 * 从文档里取出 logo 那一条 data URL 并解码回 SVG 源码。
 *
 * **只解那一条，不要解整份文档。** `buildPageDocument` 无条件注入的 `IMAGE_SLOT_CSS` 里有
 * `color-mix(… var(--muted) 8%, …)`，那个裸 `%` 后面跟的是逗号、不是合法转义，
 * 对整份文档 `decodeURIComponent` 会直接抛 `URIError: URI malformed`——那样这条用例
 * 任何输入都过不了，而它看起来还像在验功能（这个坑真踩过）。
 */
function decodedLogo(doc: string): string {
  const m = /src="data:image\/svg\+xml;charset=utf-8,([^"]+)"/.exec(doc);
  assert.ok(m, `logo 应当以 data 图片形态进文档，实际片段：${doc.slice(0, 300)}`);
  return decodeURIComponent(m[1]!);
}

test('三个槽位分别填成 logo、品牌名、标语', () => {
  const doc = buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '星图科技', tagline: '让数据说话' },
  });

  assert.ok(doc.includes(logoData(LOGO_SVG)), 'logo 要以 data: 图片的形式进文档');
  assert.ok(doc.includes('星图科技'), '品牌名要填进去');
  assert.ok(doc.includes('让数据说话'), '标语要填进去');
  assert.equal(doc.includes('data-lumen-brand'), false, '槽位属性要留在成品里就等于没填');
});

test('logo 槽填的是 <img>，稿本身绝不内联进文档', () => {
  const doc = buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '星图科技', tagline: '' },
  });

  // 这条是**安全边界**，不是外观偏好：内联进 HTML 文档的 SVG 过的是 HTML 解析器，
  // `<desc>` 是集成点、`<img>`/`<meta>` 是跳出元素，一整类 payload 能借此落进页面。
  // 当图片加载则脚本与外部子资源一律不生效。改回内联会让这条转红。
  assert.equal(doc.includes('<svg'), false, '成品的文档里不许出现内联的 <svg>');
  assert.equal(doc.includes(LOGO_SVG), false, '原稿的字面文本也不该出现');
  assert.ok(doc.includes('<img src="data:image/svg+xml;charset=utf-8,'), 'logo 要走 <img> + data URL');
});

test('单色稿的 currentColor 在渲染时烘成品牌色，图片里拿不到外面的 CSS', () => {
  const doc = buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '星图科技', tagline: '' },
  });
  assert.ok(doc.includes(logoData(LOGO_SVG)), 'currentColor 要换成 palette.brand');
  assert.equal(
    decodedLogo(doc).includes('currentColor'), false,
    '烘完不该还剩 currentColor——<img> 里的 SVG 继承不到外面的 --brand，剩下就是没有颜色',
  );
});

/**
 * **`xmlns` 是硬依赖，漏了整张图加载失败。**
 *
 * 稿走的是 `<img src="data:image/svg+xml,…">`，这条路上浏览器按 **XML** 解析它：
 * 根元素不在 SVG 命名空间里就不是 SVG。实测（真 Chromium）：不带 xmlns → `onerror`、
 * `naturalWidth === 0`；补上 → 正常画出来。而失败时接口不报错、日志没有异常，
 * 用户只看到「重绘成功」加一个空页眉。
 *
 * 提示词里写着「不要写 xmlns」，所以**这条只能靠代码兜**——它就是 `ensureXmlns` 的守卫。
 */
test('稿进图片前必须补上 xmlns，模型的稿不带也要补', () => {
  // 注意 LOGO_SVG 本身**不带** xmlns，正是模型照提示词写出来的样子
  const doc = buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '', tagline: '' },
  });
  const inner = decodedLogo(doc);
  assert.match(inner, /<svg[^>]*\sxmlns="http:\/\/www\.w3\.org\/2000\/svg"/, `补出来的稿：${inner}`);

  // 已经带了就不能补第二遍（重复的 xmlns 会让 XML 非法，同样加载失败）
  const withNs = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="1" height="1"/></svg>';
  const again = decodedLogo(buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT, brand: { svg: withNs, name: '', tagline: '' },
  }));
  assert.equal(again.match(/xmlns=/g)?.length, 1, `不该补第二遍：${again}`);
});

/**
 * 判据必须**限定在根标签上、并且看值**。
 *
 * 只问「整篇里出现过 `xmlns=`」的话，下面三种稿会被跳过、产出画不出来的图片
 * （实测都是 `naturalWidth === 0`）：注释或文本里含 `xmlns=`、`xmlns=""`、
 * `xmlns` 指向别的命名空间。而函数的名字与 docstring 说的是「保证根标签带」。
 */
test('xmlns 的判据看根标签的值，不是「整篇里出现过 xmlns=」', () => {
  const NS = 'xmlns="http://www.w3.org/2000/svg"';
  const render = (svg: string) => decodedLogo(buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT, brand: { svg, name: '', tagline: '' },
  }));

  // 注释里出现 `xmlns=` 不算数
  assert.match(
    render('<svg viewBox="0 0 10 10"><!-- 这里写着 xmlns= 三个字 --><rect width="1" height="1"/></svg>'),
    new RegExp(NS),
  );
  // 空命名空间、错命名空间都要被改写
  assert.match(render('<svg xmlns="" viewBox="0 0 10 10"><rect width="1" height="1"/></svg>'), new RegExp(NS));
  assert.match(
    render('<svg xmlns="http://www.w3.org/1999/xhtml" viewBox="0 0 10 10"><rect width="1" height="1"/></svg>'),
    new RegExp(NS),
  );

  // 已经对的不改写、也不补第二遍，而且根标签之外一个字不动
  const right = '<svg class="a" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="1" height="1"/></svg>';
  const out = render(right);
  assert.equal(out.match(/xmlns=/g)?.length, 1);
  assert.ok(out.includes('class="a"'), '根标签上的其它属性不能被改写弄丢');

  /**
   * 根标签要按**第一个元素**去找。注释里完全可以先出现一个完整的假开标签，
   * 取「全文第一个 `<svg`」就会把 xmlns 补进注释、真根标签仍然是空的——
   * 图片照样加载不出来，而且看不出哪里不对。
   */
  const decoy = render(
    '<!-- <svg viewBox="0 0 1 1"> --><svg viewBox="0 0 10 10"><rect width="1" height="1"/></svg>',
  );
  assert.equal(/<!-- <svg xmlns=/.test(decoy), false, `不能把 xmlns 补进注释里：${decoy}`);
  assert.match(
    decoy,
    /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 10 10">/,
    `该补的是真根标签：${decoy}`,
  );

  // 根标签前面出现声明或 DOCTYPE 时，仍然要能找到它。
  //
  // **DOCTYPE 那条不能用 `<!DOCTYPE svg>`。** 那个串里**没有 `<svg` 字面**，于是即使
  // `BEFORE_ROOT` 少了 DOCTYPE 那一支，`head` 退化成空串、第一个命中的 `<svg` 仍然正好是
  // 真根标签——断言照样绿，那一支等于没被验到（实测：去掉那一支 `fail=0`）。
  // 真正能触发它的是**内部子集里出现 `<svg` 字面**的形态，比如下面这条。
  assert.match(render('<?xml version="1.0"?><svg viewBox="0 0 10 10"><rect width="1" height="1"/></svg>'), new RegExp(NS));
  const doctype = render(
    "<!DOCTYPE svg [<!ENTITY e '<svg viewBox=\"0 0 1 1\">'>]><svg viewBox=\"0 0 10 10\"><rect width=\"1\" height=\"1\"/></svg>",
  );
  // 只断言「补对地方」这个不变量，别把 `<!DOCTYPE[^>]*>` 在哪截断也写进断言里——
  // 那种写法会让将来任何一次实现调整都误报
  assert.equal(/<!ENTITY e '<svg xmlns=/.test(doctype), false, `不能把 xmlns 补进 DOCTYPE 里：${doctype}`);
  assert.match(doctype, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 10 10">/, `要补在真根标签上：${doctype}`);
});

/**
 * `palette.brand` 是没有格式校验的裸字符串（`style-doc.ts:124-142`），而它会被**替换进 SVG 源码**。
 * 实测两种坏结果，都不报错：`var(--brand)` 让颜色变成黑色（图片文档里没有自定义属性可继承）；
 * `#06c<b` 让 SVG 变成非法 XML、整张图加载失败。所以认不出是颜色就退回黑色。
 */
test('palette.brand 不是色值时退回黑色，绝不拼坏 SVG', () => {
  const render = (brand: string) => decodedLogo(buildPageDocument(BRAND_FRAG, {
    palette: { ...PALETTE, brand }, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '', tagline: '' },
  }));

  assert.match(render('var(--brand)'), /fill="#000"/, '继承不到的自定义属性要退回黑色，不能原样拼进去');
  assert.match(render('currentColor'), /fill="#000"/, '原样拼 currentColor 等于没染上色');
  assert.match(render('none'), /fill="#000"/, 'none 会让 logo 静默不可见');

  const broken = render('#06c<b');
  assert.equal(broken.includes('<b'), false, `坏色值不能把稿拼出非法标签：${broken}`);
  assert.match(broken, /fill="#000"/);

  assert.match(render('#06c'), /fill="#06c"/, '合法色值要原样用');
  assert.match(render('rgb(1, 2, 3)'), /fill="rgb\(1, 2, 3\)"/, 'rgb() 也要放行');
});

test('彩色稿（没有 currentColor）原样带过去', () => {
  const colorful = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#C7421A"/></svg>';
  const doc = buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: colorful, name: '', tagline: '' },
  });
  assert.ok(doc.includes(logoData(colorful, '#C7421A')), '没有 currentColor 时应当一字不改');
});

/**
 * `mergeStyle` 末尾那句 `replace(/"/g, '&quot;')` 是**承重的**，不是顺手写的。
 *
 * `rebuildOpen` 要拿**双引号**重新拼出那个 style 属性，而模型完全可能写成单引号属性里带双引号
 * （`style='font-family:"Inter"'` 很常见）。不转义就会把属性截断；再往前一步，
 * `style='x" onload="alert(1)'` 会**在页面里真造出一个事件处理器**。
 *
 * 实测：把那个 replace 去掉，`html-doc.test.ts` 47 条**全绿**——没有任何断言在守它。
 */
test('style 里的双引号必须转义，否则属性被截断、甚至拼出事件处理器', () => {
  const render = (frag: string) => buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT, brand: { name: '星图科技', tagline: '' },
  });

  // 样本特意不用 `font-family`：装配时会剥掉写死的字体（见 `stripHardcodedFonts`），
  // 拿它当样本，这条测的就不再是「转义」而是「剥离」了
  const quoted = render(
    "<span class=\"brand-name\" data-lumen-brand=\"name\" style='background-image:url(\"a.png\");font-size:14px'></span>",
  );
  const m = /<span[^>]*>/.exec(quoted);
  assert.ok(m, `槽位标签应还在，实际：${quoted.slice(0, 200)}`);
  assert.ok(m[0].includes('&quot;a.png&quot;'), `style 里的双引号要转义，实际：${m[0]}`);
  assert.ok(m[0].includes('font-size:14px'), '后半段不能被截掉');

  const evil = render("<span data-lumen-brand=\"name\" style='x\" onload=\"alert(1)'></span>");
  assert.equal(
    evil.includes('style="x" onload="alert(1)"'), false,
    `不转义就会拼出真的事件处理器：${evil.slice(0, 200)}`,
  );
  assert.ok(evil.includes('&quot; onload=&quot;'), '它现在只是一段没意义的样式文本');
});

test('没填的槽位整个元素删掉，不留空壳', () => {
  const doc = buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '星图科技', tagline: '' },
  });
  assert.equal(/brand-sub/.test(doc), false, '没有标语就该整条删掉，而不是留个空 span');
});

test('用原图时槽位里放 img，指向 /files', () => {
  const doc = buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT,
    brand: { imageSrc: '/files/tn_x/proj/uploads/1-logo.png', name: '', tagline: '' },
  });
  assert.ok(doc.includes('src="/files/tn_x/proj/uploads/1-logo.png"'), '要放原图');
  assert.equal(/brand-name/.test(doc), false, '没填名字就该整条删掉');
});

test('品牌名里的尖括号要转义，不能被当成标签', () => {
  const doc = buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT,
    brand: { name: '<script>alert(1)</script>', tagline: '' },
  });
  assert.equal(doc.includes('<script>alert(1)</script>'), false, '品牌名是用户输入，必须转义');
  assert.ok(doc.includes('&lt;script&gt;'), '转义后仍要显示出来');
});

test('不传 brand 时片段原样，行为与改动前一致', () => {
  const doc = buildPageDocument(BRAND_FRAG, { palette: PALETTE, fontFamily: FONT });
  assert.ok(doc.includes('data-lumen-brand="logo"'), '没品牌就不该动槽位');
});

/**
 * **清空品牌之后，槽位必须被移除，不能留空壳。**
 *
 * 这条钉的是 `brandOf` 的返回类型：它**不能**在五列全空时返回 `undefined`——
 * 那样 `if (opts.brand) fillBrandSlots(...)` 根本不会被调用，配过品牌时生成的页面
 * 页眉上会留着 `class="brand-mark"` 这类空元素。模型的 CSS 只要给它写了尺寸或底色，
 * 用户看到的就是每页多一个空方块，而不是「品牌没了」。
 *
 * 实测过：`brand: undefined` → 槽位原样留着；`brand: { name:'', tagline:'' }` → 整条移除。
 */
test('清空品牌后槽位被整个移除，页眉里不留空壳', () => {
  const doc = buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT,
    // 五列全空的项目行，走的就是 `brandOf`
    brand: brandOf({
      brandLogoImage: '', brandLogoSvg: '', brandLogoMode: '', brandName: '', brandTagline: '',
    }),
  });
  assert.equal(/data-lumen-brand/.test(doc), false, '槽位属性不能留在成品里');
  // 按**元素标记**断言，不能只找 `brand-mark` 这个类名——`BRAND_FRAG` 的 `<style>` 里
  // 就写着 `.brand-mark{width:34px;height:34px}`，那样断言恒为假，等于没守
  for (const cls of ['brand-mark', 'brand-name', 'brand-sub']) {
    assert.equal(doc.includes(`<span class="${cls}"`), false, `${cls} 这条空壳要整个删掉`);
  }
  assert.ok(doc.includes('<div class="brandbar">'), '容器要留着，删的只是槽位那几条');
});

/**
 * `hasBrand` 是**生成侧**要的那个布尔（提示词提不提槽位），而 `brandOf` 是**渲染侧**要的值
 * （永远返回一个 `BrandSlot`，清空品牌时才能把空壳槽位删掉）。两个问题、同一个来源。
 */
test('hasBrand：只有名字也算有品牌，全空才算没有', () => {
  const empty = {
    brandLogoImage: '', brandLogoSvg: '', brandLogoMode: '', brandName: '', brandTagline: '',
  };
  assert.equal(hasBrand(empty), false, '五列全空就是没品牌');
  assert.equal(hasBrand({ ...empty, brandName: '星图科技' }), true, '只有名字也算有');
  assert.equal(
    hasBrand({ ...empty, brandLogoMode: 'original', brandLogoImage: 'tn_x/prj_y/uploads/a.png' }),
    true, '有原图也算有',
  );
  assert.equal(hasBrand({ ...empty, brandLogoMode: 'redraw' }), false, '模式写了但稿没落库，等于没有');

  // **这条是给将来的人看的**：`brandOf` 永远返回真值，所以「有没有」绝不能写成
  // `brandOf(project) !== undefined`——那样每个老项目都会被塞进品牌块
  assert.equal(typeof brandOf(empty), 'object', 'brandOf 永远返回对象，判断「有没有」必须用 hasBrand');
});

test('模型漏写槽位时跳过，不抛', () => {
  const doc = buildPageDocument('<div class="brandbar"><span>品牌名</span></div>', {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '星图科技', tagline: '' },
  });
  assert.ok(doc.includes('品牌名'), '没有槽位就什么都不做');
});

test('品牌名与标语不带内联颜色，颜色归这套风格的规范管', () => {
  const doc = buildPageDocument(BRAND_FRAG, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '星图科技', tagline: '让数据说话' },
  });
  // 这两条**不能**带内联颜色：「深蓝渐变商务风」的品牌名规范色是 muted，
  // 写死 --brand 就把它盖掉了。logo 槽不在此列——它现在是 `<img>`，颜色烘在图片里。
  for (const cls of ['brand-name', 'brand-sub']) {
    const m = new RegExp(`<span class="${cls}"[^>]*>`).exec(doc);
    assert.ok(m, `${cls} 槽位应还在`);
    assert.equal(m[0].includes('color'), false, `${cls} 不该带内联颜色，实际：${m[0]}`);
  }
});

/* ---- 模型的 HTML 是不可信输入：下面六条钉住「畸形输入不许吃掉正文」---- */

test('槽位漏写闭合标签时跳过它，正文一个字都不能丢', () => {
  // 漏写 </span> 很常见。若默认「吃到片段末尾」，后面整页正文都会消失
  const frag = '<div class="brandbar"><span data-lumen-brand="logo">'
    + '<span data-lumen-brand="name"></span></div><main><p>正文正文</p></main>';
  const doc = buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '星图科技', tagline: '' },
  });
  assert.ok(doc.includes('<p>正文正文</p>'), '正文必须还在');
  assert.ok(doc.includes('星图科技'), '后面那个有闭合的槽位照常填');
});

test('属性值里出现同名字符串时不算命中，无关元素不能被动', () => {
  const frag = '<div title="用 data-lumen-brand=logo 标记"><p>正文</p></div>';
  const doc = buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '星图科技', tagline: '' },
  });
  assert.ok(doc.includes('<p>正文</p>'), '正文不能被吃掉');
  assert.equal(doc.includes(logoData(LOGO_SVG)), false, '不该把 logo 填进一个无关的 div');
});

test('取值不是三种槽位之一时原样不动，绝不删元素', () => {
  const frag = '<header data-lumen-brand="header"><h1>标题</h1></header><p>正文</p>';
  const doc = buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '星图科技', tagline: '' },
  });
  assert.ok(doc.includes('<h1>标题</h1>'), '认不出来的取值不该让元素消失');
  assert.ok(doc.includes('data-lumen-brand="header"'), '也不该动它');
});

test('槽位用的是 div 就保留 div，block 不能变成 inline 的 span', () => {
  const frag = '<div class="brand-name" data-lumen-brand="name"></div>';
  const doc = buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT,
    brand: { name: '星图科技', tagline: '' },
  });
  assert.match(doc, /<div class="brand-name">星图科技<\/div>/);
});

test('模型写在 logo 槽上的内联尺寸要留着，不能被缩成默认大小', () => {
  const frag = '<span class="brand-mark" data-lumen-brand="logo" style="width:34px;height:34px"></span>';
  const doc = buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '', tagline: '' },
  });
  const m = /<span class="brand-mark"[^>]*>/.exec(doc);
  assert.ok(m, '槽位标签应还在');
  assert.ok(m[0].includes('width:34px'), `模型的尺寸要留着，实际：${m[0]}`);
  assert.ok(doc.includes(logoData(LOGO_SVG)), 'logo 照常填进去');
});

test('槽位落在 img 上时换成 span，class 与 style 都带过去', () => {
  const frag = '<img class="logo-mark" data-lumen-brand="logo" style="width:34px">';
  const doc = buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '', tagline: '' },
  });
  assert.ok(doc.includes(logoData(LOGO_SVG)), 'logo 要填进去');
  const m = /<span class="logo-mark"[^>]*>/.exec(doc);
  assert.ok(m, `img 应换成带 class 的 span，实际片段：${doc.slice(0, 200)}`);
  assert.ok(m[0].includes('width:34px'), 'img 上的 style 也要带过去');
});

test('空元素槽位上的 width / height 属性要转成内联尺寸', () => {
  // `<img width="34" height="34">` 是模型很常见的写法。这两个属性在 span 上不再生效，
  // 不转的话 logo 会退回 SVG 自身的默认大小
  const frag = '<img data-lumen-brand="logo" width="34" height="34">';
  const doc = buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '', tagline: '' },
  });
  const m = /<span[^>]*>/.exec(doc);
  assert.ok(m, `img 应换成 span，实际片段：${doc.slice(0, 200)}`);
  assert.ok(m[0].includes('width:34px'), `width 属性要转成内联尺寸，实际：${m[0]}`);
  assert.ok(m[0].includes('height:34px'), `height 属性要转成内联尺寸，实际：${m[0]}`);
});

test('宽度写成百分比时原样带过去', () => {
  const frag = '<img data-lumen-brand="logo" width="50%">';
  const doc = buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '', tagline: '' },
  });
  const m = /<span[^>]*>/.exec(doc);
  assert.ok(m, 'img 应换成 span');
  assert.ok(m[0].includes('width:50%'), `百分比要原样带过去，实际：${m[0]}`);
});

test('槽位属性前漏了空格也要摘掉，脚手架不能漏进成品', () => {
  // 模型漏写空格是常事；摘不掉的话 data-lumen-brand 会留在成品里，违背「槽位属性是脚手架」这条
  const frag = '<span class="brand-mark"data-lumen-brand="logo"></span>';
  const doc = buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '', tagline: '' },
  });
  assert.equal(doc.includes('data-lumen-brand'), false, '漏写空格时也要摘掉');
  assert.ok(doc.includes(logoData(LOGO_SVG)), 'logo 照常填进去');
});

test('空元素换成 span 时 id 也要带过去', () => {
  const frag = '<img id="brandlogo" data-lumen-brand="logo" width="34">';
  const doc = buildPageDocument(frag, {
    palette: PALETTE, fontFamily: FONT,
    brand: { svg: LOGO_SVG, name: '', tagline: '' },
  });
  assert.ok(doc.includes('id="brandlogo"'), '模型的 CSS 可能按 #id 定位，id 不能丢');
});

/* ---------------- 图位调整（面板上换图 / 删图） ---------------- */

test('覆盖表按图位次序换图，素材库配的那张被顶掉', () => {
  const out = fillImageSlots(
    '<img data-lumen-image="1"><img data-lumen-image="2">',
    imgs('/a.jpg', '/b.jpg'),
    { '1': { src: '/mine.png' } },
  );
  assert.ok(out.includes('src="/a.jpg"'), '没被覆盖的图位仍走素材库');
  assert.ok(out.includes('src="/mine.png"'), '被覆盖的图位用用户指定的那张');
  assert.ok(!out.includes('src="/b.jpg"'), '被顶掉的那张不该还出现在页面上');
});

test('删掉的图位整条移除，不留占位块', () => {
  const out = fillImageSlots(
    '<div class="wrap"><img data-lumen-image="1" class="leaf"></div>',
    imgs('/a.jpg'),
    { '0': { hidden: true } },
  );
  assert.ok(!out.includes('<img'), '元素要整条没了');
  assert.ok(!out.includes('lumen-image-slot'), '也不该留一个占位块——用户说的是不要这张图');
  assert.ok(out.includes('<div class="wrap"></div>'), '外面的容器不受影响');
});

/**
 * **次序当 key，不是模型写的那个数字。**
 *
 * 模型在图片排版页上会把五个图位都写成 `data-lumen-image="1"`（实测过）。
 * 拿那个数字当 key 的话，用户调第 3 张会同时改到五张——而界面上只显示改了一张。
 */
test('五个图位都写成同一个下标时，只改其中一个不影响别的', () => {
  const frag = Array.from({ length: 5 }, () => '<img data-lumen-image="1">').join('');
  const out = fillImageSlots(frag, imgs('/a.jpg', '/b.jpg', '/c.jpg', '/d.jpg', '/e.jpg'), {
    '2': { src: '/mine.png' },
  });
  assert.equal((out.match(/src="\/mine.png"/g) ?? []).length, 1, '只该改到第三张');
  for (const f of ['/a.jpg', '/b.jpg', '/d.jpg', '/e.jpg']) {
    assert.ok(out.includes(`src="${f}"`), `${f} 不该被动到`);
  }
});

test('覆盖表里写 cutout:false 能把抠图标记摘掉', () => {
  const out = fillImageSlots(
    '<img data-lumen-image="1" data-lumen-cutout="1">',
    [{ src: '/a.png', cutout: true }],
    { '0': { cutout: false } },
  );
  assert.ok(!out.includes('data-lumen-cutout'), '用户说不要当抠图，标记就该摘掉');
});

test('imageSlotsOf 列出图位与它们实际落的图', () => {
  const slots = imageSlotsOf(
    '<img data-lumen-image="1" class="leaf"><img data-lumen-image="2">',
    imgs('/a.jpg', '/b.jpg'),
    { '1': { hidden: true } },
  );
  assert.equal(slots.length, 2);
  assert.deepEqual(slots[0], { index: 0, slotNo: 1, src: '/a.jpg', cutout: false, hidden: false });
  assert.equal(slots[1]!.hidden, true, '被删掉的那一位也要列出来，否则面板上会凭空少一行');
  assert.equal(slots[1]!.src, null);
});

test('imageSlotsOf 在没有图位的片段上回空数组', () => {
  assert.deepEqual(imageSlotsOf('<div>没有图</div>', imgs('/a.jpg')), []);
});

test('imageOverridesOf 不信任 overrides 里的脏数据', () => {
  assert.deepEqual(imageOverridesOf(undefined), {});
  assert.deepEqual(imageOverridesOf({ images: 'not-an-object' }), {});
  assert.deepEqual(imageOverridesOf({ images: { '0': null, '1': 42 } }), {});
  // 一个字段都没挑出来的项要丢掉，否则面板上会多出一个空壳图位
  assert.deepEqual(imageOverridesOf({ images: { '0': { nonsense: 1 } } }), {});
  assert.deepEqual(imageOverridesOf({ images: { '0': { src: '  ' } } }), {}, '空白 src 不算');
  assert.deepEqual(imageOverridesOf({ images: { '0': { src: '/a.png', hidden: false } } }), {
    '0': { src: '/a.png', hidden: false },
  });
});

/* ---------------- 图位判据：这个图位要不要透明底 ---------------- */

/** 实测到的那份封面片段：contain 写在 class 规则里，不是内联 */
const COVER = [
  '<style>',
  '  .leaf { position:absolute; display:block; width:768px; height:842px; object-fit: contain }',
  '  .hero img { object-fit: cover }',
  '  .thumb { object-fit: cover }',
  '</style>',
  '<img class="leaf" data-lumen-image="1" alt="">',
].join('\n');

test('class 规则里的 object-fit: contain 也算抠图位', () => {
  const fits = objectFitByClass(COVER);
  assert.equal(fits['leaf'], 'contain');
  assert.equal(fits['thumb'], 'cover');
  assert.equal(isCutoutSlot('<img class="leaf" data-lumen-image="1">', fits), true);
});

test('只有 object-fit: cover 的图位不算抠图位', () => {
  const fits = objectFitByClass(COVER);
  assert.equal(isCutoutSlot('<img class="thumb" data-lumen-image="1">', fits), false);
});

/**
 * **后代选择器不参与判断。** 漏判只是让这个图位维持现状（当普通照片配图），
 * 误判会把普通照片的图位当成抠图位、从透明底池里塞一张不贴题的图进去。
 * 两类错误代价不对称，所以宁可漏。
 */
test('后代选择器不参与判断', () => {
  const fits = objectFitByClass(COVER);
  assert.equal(fits['hero'], undefined, '.hero img 里的 object-fit 不该记到 .hero 头上');
  assert.equal(isCutoutSlot('<img class="hero" data-lumen-image="1">', fits), false);
});

test('内联 style 压过 class 规则——它俩不一致时听内联的', () => {
  const fits = objectFitByClass(COVER);
  const tag = '<img class="leaf" data-lumen-image="1" style="object-fit: cover">';
  assert.equal(isCutoutSlot(tag, fits), false, '内联说了 cover，就不能再回头去看 class');
});

test('内联写了 contain 也算，不需要 class', () => {
  assert.equal(isCutoutSlot('<img data-lumen-image="1" style="object-fit:contain">', {}), true);
});

test('显式标记优先，且不需要样式', () => {
  assert.equal(isCutoutSlot('<img data-lumen-image="1" data-lumen-cutout="1">', {}), true);
});

test('图位声明取景：head / half 认得出，别的写法回 null', () => {
  assert.equal(framingOf('<img data-lumen-image="1" data-lumen-cutout="head">'), 'head');
  assert.equal(framingOf('<img data-lumen-image="1" data-lumen-cutout="half">'), 'half');
  assert.equal(framingOf('<img data-lumen-image="1" data-lumen-cutout="HEAD">'), 'head', '大小写不敏感');
  assert.equal(framingOf('<img data-lumen-image="1" data-lumen-cutout="1">'), null, '老写法认不出取景');
  assert.equal(framingOf('<img data-lumen-image="1">'), null, '没写就是没写');
  // `headband` 这种值不该被当成 `head`——边界没卡住的话会静默取错池子
  assert.equal(framingOf('<img data-lumen-image="1" data-lumen-cutout="headshot">'), null);
});

test('同一个 class 写了两条 object-fit 时，后面那条赢', () => {
  const fits = objectFitByClass('<style>.a{object-fit:cover} .a{object-fit:contain}</style>');
  assert.equal(fits['a'], 'contain');
});

test('没有 style 块、没有 class 的图位不算抠图位', () => {
  assert.deepEqual(objectFitByClass('<img data-lumen-image="1">'), {});
  assert.equal(isCutoutSlot('<img data-lumen-image="1">', {}), false);
});

test('注释里的 object-fit 不算声明', () => {
  assert.deepEqual(objectFitByClass('<style>.a{/* object-fit:contain */ color:red}</style>'), {});
  assert.equal(isCutoutSlot('<img class="a" data-lumen-image="1">',
    objectFitByClass('<style>.a{/* object-fit:contain */ color:red}</style>')), false);
});

/**
 * 剥离注释那行是**承重的**，但它防的**不是**「注释里写的 object-fit 被当成声明」——
 * 声明正则前面那条 `(?:^|;)` 已经把这种误判挡住了：**实测**剥与不剥，
 * `.a{` + 注释 + ` color:red}` 这种形态都得到 `{}`，拿它当守卫是假绿
 * （去掉那行，上面那条用例照样过）。它真正的作用是**注释夹在规则前面时别把选择器带歪**：
 * 不剥的话注释前缀加 `.a` 整段过不了「最简单选择器」那条判据，`.a` 就丢了——这是**漏判**。
 * 下面这条输入才是能抓住它的那个。
 */
test('注释夹在规则前面时挡不住识别——剥离注释那行是承重的', () => {
  assert.deepEqual(objectFitByClass('<style>/* x */ .a{object-fit:contain}</style>'), { a: 'contain' });
  assert.equal(isCutoutSlot('<img class="a" data-lumen-image="1">',
    objectFitByClass('<style>/* x */ .a{object-fit:contain}</style>')), true);
});

test('img.foo 这种带标签的选择器也认', () => {
  assert.equal(objectFitByClass('<style>img.leaf{object-fit:contain}</style>')['leaf'], 'contain');
});

test('逗号列表里每个选择器都记上', () => {
  const fits = objectFitByClass('<style>.a, .b { object-fit: contain }</style>');
  assert.equal(fits['a'], 'contain');
  assert.equal(fits['b'], 'contain');
});

test('图位自己声明了 contain，落图时要标上抠图标记', () => {
  const out = fillImageSlots(COVER, imgs('/a.jpg'));
  assert.ok(out.includes('data-lumen-cutout="1"'), '写了 contain 的图位要标上');
});

test('用户显式说不要抠图，压得过样式里的 contain', () => {
  const out = fillImageSlots(COVER, imgs('/a.jpg'), { '0': { cutout: false } });
  assert.ok(!out.includes('data-lumen-cutout'), '用户说了算');
});

test('样式里是 cover 的图位不受影响——这条防误伤', () => {
  const frag = '<style>.thumb{object-fit:cover}</style><img class="thumb" data-lumen-image="1">';
  const out = fillImageSlots(frag, imgs('/a.jpg'));
  assert.ok(!out.includes('data-lumen-cutout'));
});

test('没有 style 块的片段产出逐字节不变——存量样机走的就是这条路', () => {
  const frag = '<img data-lumen-image="1"><img data-lumen-image="2">';
  assert.equal(fillImageSlots(frag, imgs('/a.jpg', '/b.jpg')),
    '<img data-lumen-slot="0" src="/a.jpg" data-lumen-image="1">'
    + '<img data-lumen-slot="1" src="/b.jpg" data-lumen-image="2">');
});

test('用户显式说这要抠图，压得过样式里的 cover', () => {
  const frag = '<style>.thumb{object-fit:cover}</style><img class="thumb" data-lumen-image="1">';
  const out = fillImageSlots(frag, imgs('/a.jpg'), { '0': { cutout: true } });
  assert.ok(out.includes('data-lumen-cutout="1"'), '用户说了算');
});

/* ---------------- 元素级编辑 ---------------- */

/** 从带标记的片段里读出 `data-lumen-el`，按文档序 */
const elIndices = (frag: string): string[] =>
  [...frag.matchAll(/\bdata-lumen-el="(\d+)"/g)].map((m) => m[1]!);

test('markElementIndex 给每个元素都盖上号，号就是文档序', () => {
  const out = markElementIndex('<div><p>甲</p><img src="/a.jpg"></div>');
  // 0=div 1=p 2=img，按出现次序
  assert.deepEqual(elIndices(out), ['0', '1', '2']);
  assert.ok(out.includes('<div data-lumen-el="0">'), 'div 上要盖');
  assert.ok(out.includes('<p data-lumen-el="1">'), 'p 上要盖');
  assert.ok(out.includes('<img data-lumen-el="2"'), 'img 上也要盖——它同样是可选中元素');
});

test('markElementIndex 只改开标签，闭合标签与内容一个字节都不动', () => {
  const out = markElementIndex('<div>正文</div>');
  assert.ok(out.endsWith('正文</div>'), '内容和闭合标签要原样');
  assert.ok(out.includes('<div data-lumen-el="0">正文</div>'));
});

test('markElementIndex 的号是文档序，不是嵌套深度', () => {
  // 深度优先：外层 0，它里面的第一个孩子 1，第二个孩子 2，然后才轮到外层的兄弟
  const out = markElementIndex('<section><h1>标题</h1><p>正文</p></section><footer>x</footer>');
  assert.deepEqual(elIndices(out), ['0', '1', '2', '3']);
  assert.ok(out.includes('<footer data-lumen-el="3"'), '兄弟元素排在后代之后');
});

test('markElementIndex 重复调用不叠加标记', () => {
  const once = markElementIndex('<div><p>x</p></div>');
  assert.equal(markElementIndex(once), once, '再盖一遍应该原样返回');
});

test('markElementIndex 在空片段与纯文本上不炸', () => {
  assert.equal(markElementIndex(''), '');
  assert.equal(markElementIndex('一段没有标签的文字'), '一段没有标签的文字');
});

test('markElementIndex 认 void 元素，不会把它后面的元素算错位', () => {
  // 若把 <img> 当开标签压栈，后面的 </div> 就会被当成它的闭合，整棵树的号都错
  const out = markElementIndex('<div><img src="/a.jpg"><span>x</span></div>');
  assert.deepEqual(elIndices(out), ['0', '1', '2']);
  assert.ok(out.includes('<span data-lumen-el="2"'), 'span 应是 2，不是 1');
});

test('applyElementEdits 的位移写成 translate 独立属性，不碰 transform', () => {
  const out = applyElementEdits('<div style="transform:translate(-50%,-50%)">x</div>', [
    { index: 0, dx: 12, dy: -30 },
  ]);
  assert.ok(out.includes('translate: 12px -30px'), '要追加 translate');
  assert.ok(out.includes('transform:translate(-50%,-50%)'), '模型自己的 transform 必须原样留着');
});

test('applyElementEdits 在没有 style 的元素上新建 style', () => {
  const out = applyElementEdits('<div>x</div>', [{ index: 0, dx: 5, dy: 0 }]);
  assert.ok(out.includes('<div style="translate: 5px 0px">x</div>'), out);
});

test('applyElementEdits 追加在已有 style 末尾——同一条里后面的声明优先', () => {
  const out = applyElementEdits('<div style="color:red">x</div>', [{ index: 0, dx: 1, dy: 2 }]);
  assert.ok(out.includes('style="color:red;translate: 1px 2px"'), out);
});

test('applyElementEdits 已有 style 结尾带分号时不写出双分号', () => {
  const out = applyElementEdits('<div style="color:red;">x</div>', [{ index: 0, dx: 1, dy: 2 }]);
  assert.ok(out.includes('style="color:red;translate: 1px 2px"'), out);
});

test('applyElementEdits 只写一个轴时，另一个轴补 0', () => {
  const out = applyElementEdits('<div>x</div>', [{ index: 0, dy: 8 }]);
  assert.ok(out.includes('translate: 0px 8px'), out);
});

test('applyElementEdits 的 text 只换内容，标签与属性一个不动', () => {
  const out = applyElementEdits('<h1 class="t">旧标题</h1>', [{ index: 0, text: '新标题' }]);
  assert.equal(out, '<h1 class="t">新标题</h1>');
});

test('applyElementEdits 的 text 转义尖括号，不把用户输入当成标签', () => {
  const out = applyElementEdits('<p>x</p>', [{ index: 0, text: '<img src=x onerror=alert(1)>' }]);
  assert.ok(out.includes('&lt;img src=x onerror=alert(1)&gt;'), out);
  assert.ok(!out.includes('<img'), '不能真的插进一个 img');
});

test('applyElementEdits 的 text 不碰子元素以外的兄弟——换的是内容区间整段', () => {
  // p 里只有文字，它的闭合标签在 </p>；后面的 span 不该被动
  const out = applyElementEdits('<p>旧</p><span>兄弟</span>', [{ index: 0, text: '新' }]);
  assert.equal(out, '<p>新</p><span>兄弟</span>');
});

test('applyElementEdits 对空元素（img）不下 text，避免把内容插到标签外面', () => {
  const out = applyElementEdits('<img src="/a.jpg">', [{ index: 0, text: '不该出现' }]);
  assert.equal(out, '<img src="/a.jpg">', 'void 元素跳过 text');
});

test('applyElementEdits 多个编辑各改各的，互不干扰', () => {
  const frag = '<div><p>甲</p><h2>乙</h2></div>';
  const out = applyElementEdits(frag, [
    { index: 1, text: '甲改' },
    { index: 2, dx: 7, dy: 0 },
  ]);
  assert.equal(out, '<div><p>甲改</p><h2 style="translate: 7px 0px">乙</h2></div>');
});

test('applyElementEdits 从后往前改，前面的编辑不会因为长度变化而错位', () => {
  // 若从前往后改，第一个 text 变长后，第二个元素的下标就指到别处了
  const frag = '<div><p>短</p><p>也短</p></div>';
  const out = applyElementEdits(frag, [
    { index: 1, text: '这段文字长得多' },
    { index: 2, text: '这段也不短' },
  ]);
  assert.equal(out, '<div><p>这段文字长得多</p><p>这段也不短</p></div>');
});

test('applyElementEdits 同时给一个元素改文字又位移，两样都生效', () => {
  const out = applyElementEdits('<p class="t">旧</p>', [{ index: 0, dx: 3, dy: 4, text: '新' }]);
  // 原本没有 style，新属性就插在标签名之后（与其它补丁函数同一处插入位）
  assert.equal(out, '<p style="translate: 3px 4px" class="t">新</p>');
});

test('applyElementEdits 下标越界时原样返回', () => {
  const frag = '<div>x</div>';
  assert.equal(applyElementEdits(frag, [{ index: 9, dx: 1, dy: 1 }]), frag);
});

test('applyElementEdits 空编辑列表原样返回——一个字节都不动', () => {
  const frag = '<div style="color:red">x</div>';
  assert.equal(applyElementEdits(frag, []), frag);
});

test('applyElementEdits 改完还能再被 markElementIndex 盖号——两个函数能串起来用', () => {
  const edited = applyElementEdits('<div><p>旧</p></div>', [{ index: 1, dx: 10, dy: 0 }]);
  const marked = markElementIndex(edited);
  assert.deepEqual(elIndices(marked), ['0', '1'], '下标仍与编辑前对齐');
  assert.ok(marked.includes('translate: 10px 0px'), '位移还在');
});

test('applyElementEdits 不会把渲染期的图位标记带进结果——它只认传进来的字符串', () => {
  // 编辑器拿的是原始 mockHtml，这条锁住「补丁不会凭空造出 data-lumen-slot」
  const out = applyElementEdits('<div><img data-lumen-image="1"></div>', [{ index: 1, dx: 1, dy: 1 }]);
  assert.ok(!out.includes('data-lumen-slot'), '不该凭空冒出图位标记');
  assert.ok(!out.includes('src="/stock/'), '更不该写死图片地址');
});

/* ---------------- 写死的字体栈 ---------------- */

test('剥掉写死的 font-family，只留引用 var(--font-*) 的', () => {
  const src = [
    '<style>',
    '.a{font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;color:var(--text)}',
    '.b{font-family:var(--font-display)}',
    '</style>',
    '<div class="a" style="font-family:Arial, sans-serif;padding:8px">甲</div>',
  ].join('');
  const out = stripHardcodedFonts(src);
  assert.ok(!/apple-system/.test(out), '规则里写死的系统字体栈没剥掉');
  assert.ok(!/Arial/.test(out), '内联 style 里写死的没剥掉');
  assert.ok(out.includes('font-family:var(--font-display)'), '引用变量的那份被误剥了');
  // 只该剥掉声明本身，同一条规则里别的属性、内联 style 的其余部分、内容都不能动
  assert.ok(out.includes('color:var(--text)'), '把同一条规则里的其它声明也剥掉了');
  assert.ok(out.includes('padding:8px'), '把内联 style 里的其它声明也剥掉了');
  assert.ok(out.includes('甲'), '把内容也剥掉了');
});

test('@font-face 里的 font-family 不动——那是在声明字体名，不是选字体', () => {
  const face = '@font-face{font-family:"Cormorant Garamond";src:url(/fonts/x.woff2)}';
  const out = stripHardcodedFonts(`<style>${face}.a{font-family:"Cormorant Garamond",serif}</style>`);
  assert.ok(out.includes(face), '@font-face 被剥了，打包字体会全废');
  assert.ok(!/\.a\{font-family:/.test(out), '规则里写死的那份没剥掉');
});

test('装配文档时把写死的字体剥掉——不然在风格库里换字体页面纹丝不动', () => {
  /*
    识别出来的风格提示词里常有一条「正文与标题统一使用系统无衬线字体栈：-apple-system,…」，
    模型照办，于是页面里 `.stage{font-family:-apple-system,…}`。类选择器比本文档里的
    `body{font-family:var(--font-sans)}` 更具体，直接盖掉——实测 76 页里 9 页如此。
  */
  const doc = buildPageDocument(
    '<style>.a{font-family:-apple-system,"Segoe UI",sans-serif;color:var(--text)}</style><div class="a">内容</div>',
    { palette: PALETTE, fontFamily: FONT, title: '样机' },
  );
  assert.ok(!/apple-system/.test(doc), '写死的字体栈漏进了文档，会盖掉 --font-sans');
  assert.ok(doc.includes('body { font-family: var(--font-sans); }'), '文档自己的字体兜底没了');
  assert.ok(doc.includes(`--font-sans: ${FONT}`), '字体变量没注入');
});

/**
 * 片段在 `:root` 里重新定义 `--font-*` 也要剥掉。
 *
 * 这是同一个病的第二种写法，实测比第一种还多：提示词的「代码要求」写着
 * 「在 :root 中定义 CSS 变量（… --font-sans / --font-display / --font-script）」，
 * 模型就把真栈抄了进去。片段那份 `:root` 排在 `<body>` 里、比文档 `<head>` 里的晚，
 * 同优先级下它赢——于是风格库里换了字体，页面上一点反应都没有。
 * **96 页样机里 34 页是这样。**
 */
test('剥掉片段里重新定义的 --font-* 变量', () => {
  const src = [
    '<style>',
    ':root{--bg:#F6F2EA;--font-sans:Montserrat,system-ui,sans-serif;',
    '--font-display:"Cormorant Garamond",serif;--font-numeric:Consolas,monospace}',
    '.a{font-family:var(--font-display)}',
    '</style>',
  ].join('');
  const out = stripHardcodedFonts(src);
  assert.ok(!/--font-sans\s*:/.test(out), '--font-sans 的定义没剥掉');
  assert.ok(!/--font-display\s*:/.test(out), '--font-display 的定义没剥掉');
  assert.ok(!/--font-numeric\s*:/.test(out), '--font-numeric 的定义没剥掉');
  // 调色板那几行不能动：那是另一件事，而且片段那份本来就该赢
  assert.ok(out.includes('--bg:#F6F2EA'), '把调色板的变量也剥了');
  // 引用它的地方要留着——那是「用哪个角色」，不是「这个角色是什么字体」
  assert.ok(out.includes('font-family:var(--font-display)'), '把引用也剥了');
});

test('装配文档时注入的字体变量抬一档优先级，片段那份 :root 压不过它', () => {
  const out = buildPageDocument(
    '<style>:root{--font-display:"Some Other Face",serif}</style><div>甲</div>',
    { palette: PALETTE, fontFamily: 'BodyStack, sans-serif', fontDisplay: 'DisplayStack, serif' },
  );
  // 兜底那条：即便正则漏了某种写法，优先级也压得住
  assert.match(out, /:root:root\s*\{[^}]*--font-display:\s*DisplayStack, serif/);
  // 片段那份定义在装配时就被剥了，所以页面里不该再有它
  assert.equal(out.includes('Some Other Face'), false, '片段自己那份字体定义没剥掉');
});
