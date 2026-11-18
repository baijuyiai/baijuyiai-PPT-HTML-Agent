import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { STAGGER_CSS, STAGGER_DELAY_CLAMP, STAGGER_DIRECTIONS, STAGGER_STEP_MS } from '@lumen/ir-schema';

/**
 * 逐块进场的规则有**两份**，必须一致。
 *
 * 新链路的内容跑在 iframe 里，加载不到本包的 `styles.css`，所以那份 CSS 由
 * `@lumen/ir-schema` 的 `buildPageDocument` 生成后注入；旧渲染器走本文件。
 * 两份写法不同（一份是 JS 拼的字符串、一份是手写 CSS），改了一处忘了另一处
 * 就会变成「编辑器里好好的，导出来不动」——那种偏差肉眼看不出来。
 *
 * 这里把 `styles.css` 的原文读进来，逐条比对两份里的关键事实。
 */

const raw = readFileSync(new URL('./styles.css', import.meta.url), 'utf8');
/** 压掉空白再比：两份的缩进与换行本来就不一样，比的是声明本身 */
const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
const css = flat(raw);
const generated = flat(STAGGER_CSS);

test('两份都有关键帧，且起始位移一模一样', () => {
  assert.ok(css.includes('@keyframes lumen-stagger-in'), 'styles.css 缺关键帧');
  assert.ok(generated.includes('@keyframes lumen-stagger-in'), '注入的那份缺关键帧');
  // 起始态是「从哪进」的全部内容：方向靠 --stagger-x/y/s 三个变量，两边必须同一套
  const from = 'from { opacity: 0; translate: var(--stagger-x, 0px) var(--stagger-y, 12px); scale: var(--stagger-s, 1); }';
  assert.ok(css.includes(from), 'styles.css 的起始位移与生成的那份不一致');
  assert.ok(generated.includes(from));
});

/**
 * 进场动画绝不能碰页面作者自己用的属性。
 *
 * 实测踩过：一页「谢谢」整块跑到画布右下角、水印从 5% 变成实心块。根因是关键帧动了
 * `transform` 简写、又在 `to` 里写死了终态——
 *
 * - 动画里的 `transform` 会**整个替换**元素自己的 `transform`（动画优先级高于普通声明），
 *   而模型写的页面常拿 `transform: translate(-50%, -50%)` 居中，那一块就退回了
 *   `left:50%; top:50%` 的原始位置；`translate`/`scale` 是独立属性，与 `transform` 相乘叠加，
 *   居中才保得住。
 * - 关键帧里没写的属性会取元素自身的值，所以 `to` 留空就等于「落回它本来的样子」：
 *   水印的 `opacity: .05` 保持 5%。`to` 里写下的每一条，都是从页面手里抢走的一条。
 *
 * 这两条改回去都不会立刻报错，只在某些页上炸，所以钉在这里。
 */
test('关键帧不许动 transform 简写，且 to 必须留空', () => {
  const keyframes = /@keyframes lumen-stagger-in \{ from \{([^}]*)\} to \{([^}]*)\} \}/;
  for (const [label, s] of [['styles.css', css], ['生成的那份', generated]] as const) {
    const m = keyframes.exec(s);
    assert.ok(m, `${label} 的关键帧结构变了，这条断言要跟着改`);
    const from = m[1]!;
    const to = m[2]!.trim();

    assert.equal(/transform\s*:/.test(from), false, `${label} 动了 transform 简写，会顶掉作者用来居中的 transform`);
    assert.equal(to, '', `${label} 的 to 不是空的——写进去的属性会顶掉作者自己的值（实际：${to}）`);
    // 属性白名单：进场只能碰这三个。混进 filter 会凭空造出包含块，把绝对定位的后代整块挪位
    const props = new Set([...from.matchAll(/([a-z-]+)\s*:/g)].map((x) => x[1]));
    assert.deepEqual(
      [...props].sort(), ['opacity', 'scale', 'translate'],
      `${label} 的关键帧多动了别的属性：${[...props].join(', ')}`,
    );
  }
});

test('两份的时长、间隔与夹取上限一致', () => {
  for (const s of [css, generated]) {
    assert.ok(s.includes('animation: lumen-stagger-in 240ms'), '动画时长对不上');
    assert.ok(s.includes(`min(var(--stagger-i, 0), ${STAGGER_DELAY_CLAMP})`), '夹取上限对不上');
    assert.ok(s.includes(`* ${STAGGER_STEP_MS}ms`), '间隔对不上');
  }
});

test('四种进场方向两份都写全，值也一致', () => {
  for (const dir of STAGGER_DIRECTIONS) {
    const rule = new RegExp(`\\[data-lumen-stagger="${dir}"\\] \\{([^}]*)\\}`).exec(generated);
    assert.ok(rule, `生成的那份缺 ${dir} 方向`);
    assert.ok(css.includes(flat(rule[0])), `styles.css 缺 ${dir} 方向，或值不一致`);
  }
});

test('两份都把 data-stagger-item 作为唯一的播放入口', () => {
  // 元素上只有这一个属性、序号只走 --stagger-i；谁另起一个名字就会出现
  // 「一部分元素按新规则动、一部分按旧规则动」
  for (const s of [css, generated]) {
    assert.ok(s.includes('[data-stagger-item]'), '缺元素选择器');
  }
});
