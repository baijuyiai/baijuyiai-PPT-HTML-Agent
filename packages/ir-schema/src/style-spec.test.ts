import test from 'node:test';
import assert from 'node:assert/strict';
import { StyleSpec, specBlock, specLines } from './style-spec.js';

/**
 * 规范本身是纯数据，这里只钉两件事：**界面上看到的与发给模型的是同一套措辞**，
 * 以及**颜色只写语义名**。
 */

const SPEC = StyleSpec.parse({
  intro: '浅灰蓝底上浮白色表面，1px 细线分层，留白大。',
  title: { sizePx: 44, weight: 700, color: 'brand', align: 'left', rule: { position: 'above', widthPx: 72, heightPx: 6, color: 'accent' } },
  subtitle: { sizePx: 28, weight: 500, color: 'muted' },
  body: { sizePx: 16, weight: 400, color: 'text', lineHeight: 1.8 },
  numeric: { sizePx: 64, weight: 700, color: 'brand' },
  fonts: { display: 'cormorant', body: 'montserrat', script: '', numeric: 'system-mono' },
  header: {
    kind: 'block', sizePx: 34, color: 'brand', heightPx: 88,
    position: 'left', textSizePx: 13, textColor: 'muted', textTransform: 'uppercase',
  },
  footer: {
    heightPx: 100, showPageNo: true,
    pageNoPosition: 'right', pageNoFormat: 'padded', pageNoSizePx: 13, pageNoColor: 'muted',
  },
  marginPx: 56,
  radius: { card: 14, inner: 8 },
  decoration: ['1px 细线', '圆角方块'],
  effects: [
    { kind: 'glass', note: '卡片底用 backdrop-filter: blur(24px) 加半透明白，边缘 1px 亮线' },
    { kind: 'glow', note: '关键数字带一圈 brand 色外发光' },
  ],
});

test('规范只认语义色名，写死色值会被 schema 挡下', () => {
  assert.equal(StyleSpec.safeParse({ ...SPEC, title: { ...SPEC.title, color: '#123456' } }).success, false);
  assert.equal(StyleSpec.safeParse({ ...SPEC, title: { ...SPEC.title, color: 'brand' } }).success, true);
  // border 也在允许之列：它是调色板里真实存在的色，分隔线用它最自然
  assert.equal(StyleSpec.safeParse({ ...SPEC, title: { ...SPEC.title, color: 'border' } }).success, true);
  // 但底与面的颜色不在——标题、标识、装饰条上不会用它们
  assert.equal(StyleSpec.safeParse({ ...SPEC, title: { ...SPEC.title, color: 'bg' } }).success, false);
  assert.equal(StyleSpec.safeParse({ ...SPEC, title: { ...SPEC.title, color: 'surface' } }).success, false);
});

test('缺省值齐全：没给装饰清单时是空数组而不是 undefined', () => {
  const parsed = StyleSpec.parse({
    title: { sizePx: 44, weight: 700, color: 'brand', align: 'left', rule: { position: 'none', widthPx: 0, heightPx: 0, color: 'accent' } },
    header: { kind: 'none', sizePx: 0, color: 'brand', heightPx: 0 },
    footer: { heightPx: 0, showPageNo: false },
    marginPx: 56,
    radius: { card: 0, inner: 0 },
  });
  assert.deepEqual(parsed.decoration, []);
  assert.equal(parsed.intro, '');
});

test('specBlock 把每一条都写成人话，颜色写成变量名', () => {
  const text = specBlock(SPEC);
  assert.match(text, /页标题：44px \/ 字重 700 \/ 颜色 var\(--brand\) \/ 左对齐/);
  assert.match(text, /标题上方一条 72×6px 的 var\(--accent\) 短横线/);
  // 四档字级要各写一行。少一档，模型就会拿标题的字号去排副标题
  assert.match(text, /副标题：28px \/ 字重 500 \/ 颜色 var\(--muted\)/);
  assert.match(text, /正文：16px \/ 字重 400 \/ 颜色 var\(--text\) \/ 行高 1\.8/);
  assert.match(text, /数字（指标值、大号序号）：64px \/ 字重 700 \/ 颜色 var\(--brand\)/);
  // 字体写的是**名字**不是字体栈——规范里存的是 id，栈由渲染层按 id 展开
  assert.match(text, /大标题用 Cormorant Garamond · 高对比衬线/);
  assert.match(text, /正文用 Montserrat · 几何无衬线/);
  assert.match(text, /数字用 系统等宽/);
  assert.equal(text.includes('手写体用'), false, '没指定手写体时那一项不该出现');
  assert.match(text, /页眉品牌标识：一枚圆角方块，尺寸 34px、颜色 var\(--brand\)、靠左；页眉高 88px/);
  assert.match(text, /页眉字（如「目录 \/ CONTENTS」）：13px \/ 颜色 var\(--muted\) \/ \*\*全大写\*\*/);
  assert.match(text, /页脚：高 100px；页码靠右，写成「01」这个样式（13px \/ 颜色 var\(--muted\)）/);
  assert.match(text, /左右安全边距：56px/);
  assert.match(text, /圆角：卡片 14px、内层 8px/);
  assert.match(text, /整页只允许出现这些装饰：1px 细线、圆角方块/);
  assert.match(text, /毛玻璃：卡片底用 backdrop-filter: blur\(24px\) 加半透明白，边缘 1px 亮线/);
  assert.match(text, /发光：关键数字带一圈 brand 色外发光/);
  // 色值一个都不该出现——色值由 palette 单点管住，规范里再写一遍就有了第二个真值
  assert.equal(/#[0-9a-f]{6}/i.test(text), false);
});

test('页码的四种写法各写成人话，不是把枚举名丢出去', () => {
  const label = (pageNoFormat: 'plain' | 'padded' | 'of-total' | 'chinese') =>
    specBlock(StyleSpec.parse({ ...SPEC, footer: { ...SPEC.footer, pageNoFormat } }));
  assert.match(label('plain'), /写成「1」这个样式/);
  assert.match(label('padded'), /写成「01」这个样式/);
  assert.match(label('of-total'), /写成「1 \/ 12」这个样式/);
  assert.match(label('chinese'), /写成「第 1 页」这个样式/);
});

test('不写页码时，页码的位置与格式一律不提', () => {
  const noNo = specBlock(StyleSpec.parse({ ...SPEC, footer: { ...SPEC.footer, showPageNo: false } }));
  assert.match(noNo, /页脚：高 100px，不写页码/);
  assert.equal(noNo.includes('靠右'), false);
  assert.equal(noNo.includes('这个样式'), false);
});

test('没有效果语言时，视觉那一栏整个不出现', () => {
  const plain = StyleSpec.parse({ ...SPEC, effects: [] });
  assert.equal(specBlock(plain).includes('视觉效果'), false);
  assert.equal(specLines(plain).some((l) => l.label === '视觉效果'), false);
});

test('效果类型只认那四种，别的会被挡下', () => {
  assert.equal(StyleSpec.safeParse({ ...SPEC, effects: [{ kind: 'neon', note: '亮色描边加外发光' }] }).success, true);
  assert.equal(StyleSpec.safeParse({ ...SPEC, effects: [{ kind: 'gradient', note: '135° 线性渐变' }] }).success, true);
  // 别自己发明第五种——枚举就是枚举，多一个值下游没人认识
  assert.equal(StyleSpec.safeParse({ ...SPEC, effects: [{ kind: 'blur', note: '模糊' }] }).success, false);
});

test('不用强调条时那条不写出来；不用页眉时要明说「不用页眉」', () => {
  const bare = StyleSpec.parse({
    ...SPEC,
    title: { ...SPEC.title, rule: { position: 'none', widthPx: 0, heightPx: 0, color: 'accent' } },
    header: { kind: 'none', sizePx: 0, color: 'brand', heightPx: 0 },
  });
  const text = specBlock(bare);
  assert.equal(text.includes('短横线'), false, '不用强调条就不该提它');
  // 页眉那一条要**留着**并明说不用：这是给模型看的，不提它模型就会自己加一个。
  // 界面那边（specLines）相反——没有的东西不必占一行
  assert.match(text, /页眉品牌标识：不用页眉/);
  assert.equal(specLines(bare).some((l) => l.label === '页眉品牌标识'), false);
  assert.match(text, /页标题：44px/, '标题那一条仍要在');
});

test('specLines 与 specBlock 同源：界面上看到的就是发给模型的那几条', () => {
  const lines = specLines(SPEC);
  assert.deepEqual(lines.map((l) => l.label), [
    '页标题', '标题强调条', '副标题', '正文', '数字', '字体',
    '页眉品牌标识', '页眉字', '页脚', '安全边距', '圆角', '允许的装饰', '视觉效果',
  ]);
  // 措辞可以不同（给模型的那份要成句、界面那份要短），但**数字与颜色变量不能分叉**：
  // 界面上写着 44px、发给模型的是 46px 的话，用户照着界面判断「统一了吗」就会判断错
  const text = specBlock(SPEC);
  for (const l of lines) {
    for (const fact of l.value.match(/\d+|var\(--\w+\)/g) ?? []) {
      assert.ok(text.includes(fact), `「${l.label}」里的 ${fact} 在 specBlock 里找不到`);
    }
  }
});

/**
 * 页码字号为 0 表示「不适用」——不写页码时模型会合理地给 0。
 *
 * 卡一个下限只会让它白重发一轮（实测踩过：`footer.pageNoSizePx` 报
 * 「Number must be greater than or equal to 8」，整条提炼重发一次）。
 * 写进提示词时那句要整句省掉，**不能出现「0px」**——模型会照着写一个看不见的页码。
 */
test('页码字号为 0 时那一句不写出来', () => {
  const zero = StyleSpec.parse({ ...SPEC, footer: { ...SPEC.footer, pageNoSizePx: 0 } });
  // 钉整句而不是 includes('0px')：上面那句「高 100px」里也含这三个字符，
  // 用 includes 的话这条断言永远通不过（第一版就是这么写错的）
  assert.match(specBlock(zero), /- 页脚：高 100px；页码靠右，写成「01」这个样式\n/);
  assert.equal(
    specLines(zero).find((l) => l.label === '页脚')!.value,
    '高 100px，页码靠右、写成「01」',
  );
  // 字号给了就照写，别把这条规则顺手改成「永远不写」
  const sized = StyleSpec.parse({ ...SPEC, footer: { ...SPEC.footer, pageNoSizePx: 12 } });
  assert.match(specBlock(sized), /写成「01」这个样式（12px \/ 颜色 var\(--muted\)）/);
});
