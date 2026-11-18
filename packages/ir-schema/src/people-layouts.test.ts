import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PEOPLE_LAYOUTS, PEOPLE_GROUP_ORDER, peopleGroupLabel,
  peopleLayoutBlock, peopleLayoutCandidates, type PeopleGroup,
} from './people-layouts.js';

const EMPTY = { title: '', claim: '', points: [] as string[], visualForm: '' };

const byGroup = (g: PeopleGroup) => PEOPLE_LAYOUTS.filter((l) => l.group === g);

/**
 * 骨架是**从参考图识别出来的生成文件**（`people-skeletons.ts`），不是手写的。
 * 所以这里钉的是「生成得对不对」——数量落在区间里、两组都有、id 不撞——
 * 而不是某个具体版式长什么样。改版式要改识别提示词再重跑，手改会被覆盖。
 */
test('总数落在一个像样的区间里，id 唯一，两组都不为空', () => {
  /*
    上下界是**烟雾测试**，不是目标值：识别跑了没有、去重有没有把库炸掉。
    实际数量取决于那批参考图能认出多少份，每次重跑都会变，别把它当成要凑的数。
    提示词那头的长度由 `MAX_CANDIDATES` 封顶，与总数无关。
  */
  assert.ok(
    PEOPLE_LAYOUTS.length >= 40 && PEOPLE_LAYOUTS.length <= 120,
    `共 ${PEOPLE_LAYOUTS.length} 份，落在 40–120 之外——太少挑不开，太多说明去重没起作用`,
  );
  assert.equal(
    new Set(PEOPLE_LAYOUTS.map((l) => l.id)).size, PEOPLE_LAYOUTS.length, 'id 撞了',
  );

  for (const g of PEOPLE_GROUP_ORDER) {
    assert.ok(
      byGroup(g).length > 0,
      `「${g}」这一组一份都没有——候选池按组取，空组会让人物页那段提示词整个被抽掉`,
    );
  }
  // 分组只有两个，多出来的组名等于没人取
  assert.deepEqual(
    [...new Set(PEOPLE_LAYOUTS.map((l) => l.group))].sort(),
    [...PEOPLE_GROUP_ORDER].sort(),
  );
});

test('每个版式都有名字与一句话说明，id 形如 people/x@v1', () => {
  for (const l of PEOPLE_LAYOUTS) {
    assert.ok(l.name.length > 0, `${l.id} 没有名字`);
    assert.ok(l.brief.length >= 8, `${l.id} 的说明太短，模型挑不出来`);
    assert.match(l.id, /^people\/[a-z0-9-]+@v1$/, `${l.id} 不符合命名`);
    assert.ok(peopleGroupLabel(l.group).length > 0, `${l.group} 没有中文名`);
  }
});

/**
 * 斜切容器里的照片**不能跟着容器一起斜**。
 *
 * 参考图里那几份斜切版式（「斜带四人并置」「四柱斜切错落」）在设计稿上是**整块斜切**的：
 * 框斜、人也跟着斜，整张图就是一个斜构图。模型照抄了容器的 `transform:skewX(-9deg)`，
 * 而图片是容器的后代，于是**人被剪切变形**——脸是歪的、肩膀是斜的。设计稿那样做成立是
 * 因为它整张图都斜；搬进骨架里，一页只有这一块斜、其余全正，那个歪掉的人就格外刺眼。
 *
 * 生成时会给图片补一道反向斜切（容器保持斜窗口的形状，内容回正），见
 * `scripts/lib/recognize-layouts.ts` 的 `unskewImagesInSkewedFrames`。
 * **这条测的是那个补丁真落到了文件里**——判据直接写在文件内容上，不依赖那个函数。
 *
 * 只认「斜切 + `overflow:hidden`」这一种容器：有裁切才是「斜窗口」；没有裁切时斜切
 * 多半是整个元素的倾斜造型，照片跟着斜是设计的一部分，不该动。
 */
test('斜切容器里的照片必须补了反向斜切——人被剪切变形就是这条挂了', () => {
  const offenders: string[] = [];

  for (const l of PEOPLE_LAYOUTS) {
    for (const style of l.skeleton.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) {
      const css = style[1] ?? '';
      for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const sel = (rule[1] ?? '').trim();
        const body = rule[2] ?? '';
        if (!/\boverflow\s*:\s*hidden/i.test(body)) continue;

        const angle = /\bskewX\(\s*(-?[\d.]+)deg\s*\)/i.exec(body);
        if (!angle) continue;
        const cls = /^\.([\w-]+)$/.exec(sel)?.[1];
        // 这个类没用在 HTML 里就是条死规则，不必管
        if (!cls || !new RegExp(`class\\s*=\\s*"[^"]*\\b${cls}\\b`).test(l.skeleton)) continue;

        const imgBody = new RegExp(`\\.${cls}\\s*(?:>\\s*)?img\\s*\\{([^{}]*)\\}`, 'i').exec(css)?.[1] ?? '';
        const counter = /\bskewX\(\s*(-?[\d.]+)deg\s*\)/i.exec(imgBody);
        if (!counter || Number(counter[1]) !== -Number(angle[1])) {
          offenders.push(`${l.id} 的 .${cls}（容器 skewX(${angle[1]}deg)，图片 ${counter ? `skewX(${counter[1]}deg)` : '没补'}）`);
        }
      }
    }
  }

  assert.deepEqual(offenders, [], `这些版式的照片会跟着容器一起斜：\n  ${offenders.join('\n  ')}`);
});

test('候选规则：单人那组靠词与人数判，其余一律走多人', () => {
  const g = (input: Partial<typeof EMPTY>) =>
    [...new Set(peopleLayoutCandidates({ ...EMPTY, ...input }).map((l) => l.group))];

  assert.deepEqual(g({ title: '创始人简介' }), ['solo'], '单人关键词该走 solo');
  assert.deepEqual(g({ title: '核心成员', visualForm: '一个人像居中，两侧文字' }), ['solo'], '一个人该走 solo');
  assert.deepEqual(g({ title: '团队阵容', visualForm: '六个人像排成网格' }), ['multi'], '六个人该走 multi');
  assert.deepEqual(g({}), ['multi'], '**兜底也要给一组**——回空数组等于把版式说明整段抽掉');
});

test('人数优先从 visualForm 抓，抓不到才用要点条数', () => {
  // visualForm 说一个人，要点却有几条——该按 visualForm 走（它是讲版式的那个字段）
  const byForm = peopleLayoutCandidates({
    ...EMPTY, title: '这一页讲三件事', visualForm: '一个人像特写', points: ['a', 'b', 'c'],
  });
  assert.deepEqual([...new Set(byForm.map((l) => l.group))], ['solo'], 'visualForm 该压过 points');

  // visualForm 里没有数量词时退回要点条数：四条 → 多于一人 → multi
  const byPoints = peopleLayoutCandidates({ ...EMPTY, title: '几位同行者', points: ['a', 'b', 'c', 'd'] });
  assert.deepEqual([...new Set(byPoints.map((l) => l.group))], ['multi'], 'visualForm 抓不到时该用要点条数');
});

test('候选封顶四个，且两组都给得出候选', () => {
  // 「多人」那一组有四十多份，整组塞进提示词是两百多 KB，而且候选一多模型就不挑了
  for (const input of [
    { ...EMPTY },
    { ...EMPTY, title: '创始人简介' },
    { ...EMPTY, title: '团队阵容', visualForm: '六个人像排成网格' },
  ]) {
    const c = peopleLayoutCandidates(input);
    assert.ok(c.length > 0, `${JSON.stringify(input)} 一个候选都没给`);
    assert.ok(c.length <= 4, `给了 ${c.length} 个候选，超过封顶`);
    assert.equal(new Set(c.map((l) => l.id)).size, c.length, '候选里有重复');
  }
});

test('组内按「图位数离估计人数最近」排序', () => {
  // 三个人：排在前面的该是三格版式，而不是一格或六格
  const three = peopleLayoutCandidates({ ...EMPTY, title: '团队成员', visualForm: '三个人像横排' });
  const slotsOf = (s: string) => new Set([...s.matchAll(/data-lumen-image\s*=\s*["']?(\d+)/gi)].map((m) => Number(m[1]))).size;
  assert.ok(
    slotsOf(three[0]!.skeleton) <= 4,
    `三个人排在最前的是 ${slotsOf(three[0]!.skeleton)} 格版式，排序没生效`,
  );
});

test('提示词块：带名字、说明与骨架，且不带别的组的版式', () => {
  const solo = peopleLayoutCandidates({ ...EMPTY, title: '创始人简介' });
  const block = peopleLayoutBlock(solo);
  for (const l of solo) {
    assert.ok(block.includes(l.name), `块里缺版式名「${l.name}」`);
    assert.ok(block.includes(l.skeleton), `块里缺「${l.name}」的骨架`);
  }
  // 只带候选组：随便挑一个别的组的版式，它不该出现
  const other = PEOPLE_LAYOUTS.find((l) => l.group !== 'solo')!;
  assert.ok(!block.includes(other.skeleton), `不该把「${other.name}」也带上`);
});

/* ---------------- 运行时规则 ---------------- */
/*
  下面这几条与「版式好不好看」无关，是**不满足就跑不起来**：编号断了会把后面的格子
  挪过来、写死色值换风格不跟着变、给 img 写 object-fit 会被那条 `!important` 压掉。
  识别出来的骨架同样要过，所以这些断言与数量无关，一直留着。
*/

test('每份骨架都是片段：有 <style>、有根 div、没有完整文档标签', () => {
  for (const l of PEOPLE_LAYOUTS) {
    assert.ok(l.skeleton.includes('<style>'), `${l.id} 没有 <style>`);
    assert.ok(!/<!DOCTYPE|<html|<body/i.test(l.skeleton), `${l.id} 是完整文档，该是片段`);
    // 根 div 必须自己定住画布：它不自带尺寸的话，绝对定位的子元素会散到视口上去
    assert.ok(/width:\s*1920px/.test(l.skeleton), `${l.id} 没定画布宽（画布是 1920×1080）`);
    assert.ok(/height:\s*1080px/.test(l.skeleton), `${l.id} 没定画布高`);
    assert.ok(/position:\s*relative/.test(l.skeleton), `${l.id} 的根 div 没有 position:relative`);
  }
});

test('每份骨架至少一个人像位，且编号从 1 起连续', () => {
  for (const l of PEOPLE_LAYOUTS) {
    const ns = [...l.skeleton.matchAll(/data-lumen-image\s*=\s*["']?(\d+)/gi)].map((m) => Number(m[1]));
    assert.ok(ns.length > 0, `${l.id} 一个人像位都没有——那它就不是人物页的版式`);
    assert.deepEqual(
      [...new Set(ns)].sort((a, b) => a - b),
      Array.from({ length: Math.max(...ns) }, (_, i) => i + 1),
      `${l.id} 的图位编号不连续，fillImageSlots 会把后面的格子挪过来`,
    );
  }
});

test('每份骨架的人像位都带抠图标记、不写 src、不写 object-fit，且没有写死的色值', () => {
  for (const l of PEOPLE_LAYOUTS) {
    const imgs = [...l.skeleton.matchAll(/<img\b[^>]*>/gi)].map((m) => m[0]!);
    assert.ok(imgs.length > 0, `${l.id} 没有 <img>`);
    for (const tag of imgs) {
      assert.match(tag, /data-lumen-cutout/i, `${l.id} 的人像位没标抠图，会被裁掉边缘：${tag.slice(0, 80)}`);
      assert.ok(!/\bsrc\s*=/i.test(tag), `${l.id} 的人像位写了 src，填图时会被盖掉：${tag.slice(0, 80)}`);
    }
    // 写死色值会让「一套骨架吃所有风格」失效，lintMockHtml 也会判 error
    assert.ok(!/#[0-9a-f]{3,8}\b/i.test(l.skeleton), `${l.id} 里有写死的色值，换风格不会跟着变`);
    assert.ok(!/\brgba?\(|\bhsla?\(/i.test(l.skeleton), `${l.id} 里有 rgb()/hsl() 色值`);
    /*
      裁切不能靠 object-fit——那条 `contain !important` 压不过，会静默失效。

      **img 上的内联宽高是允许的**（`style="width:100%;height:100%"`）：那是让图填满
      图位容器的正当写法，配上 `contain` 正好是「按容器高度撑满」。
      早先那条「img 不许有内联样式」是老约定的残留——那时尺寸由三档类名统一给，
      现在没有档位了，这条规矩就只剩下误伤。
    */
    assert.ok(
      !/object-fit\s*:/i.test(l.skeleton),
      `${l.id} 给 img 写了 object-fit——那条 contain !important 压不过，写了等于没写`,
    );
  }
});

test('每份骨架要挑字体只能挑那三个变量，不写具体字体栈', () => {
  for (const l of PEOPLE_LAYOUTS) {
    /*
      **内联样式里那一处最要命**：`body{font-family:var(--font-sans)}` 是注入的样式表规则，
      而骨架根 `<div>` 的内联样式压得过它——写死了这套风格的字体就被整条盖掉，
      换风格也不跟着变。和写死 hex 是同一类错。
    */
    for (const m of l.skeleton.matchAll(/font-family\s*:\s*([^;}"]+)/gi)) {
      assert.match(
        m[1]!.trim(),
        /^var\(--font-(sans|display|script)\)$/,
        `${l.id} 写死了字体栈「${m[1]!.trim()}」——只许写 var(--font-sans/display/script)`,
      );
    }
  }
});

test('占位文案一律英文，骨架里一个汉字都不许有', () => {
  /*
    骨架里的文字是**示例**，生成真页面时会被整段替换。但**它读起来像什么，
    模型以后就照着写什么**——中文占位会让每一页都写成中文腔的 PPT。
    用户直接提过这条：大标题、人名、短介一律英文。

    识别脚本的 `accept()` 里有一条同样的校验，漏了就带问题重发一次。
    这里钉的是产物——谁手改骨架塞回中文，当场红。
  */
  const CJK = /[一-鿿]/;
  const bad: string[] = [];
  for (const l of PEOPLE_LAYOUTS) {
    const m = CJK.exec(l.skeleton);
    if (m) {
      const at = l.skeleton.slice(Math.max(0, m.index - 30), m.index + 30).replace(/\s+/g, ' ');
      bad.push(`${l.id}: …${at}…`);
    }
  }
  assert.deepEqual(bad, [], '骨架的占位文案里有汉字，必须全部改成英文');
});

test('每份骨架都不带 script / 外链 / 内联事件 / emoji', () => {
  for (const l of PEOPLE_LAYOUTS) {
    assert.ok(!/<script/i.test(l.skeleton), `${l.id} 里有 <script>`);
    assert.ok(!/\son[a-z]+\s*=/i.test(l.skeleton), `${l.id} 里有内联事件`);
    assert.ok(!/https?:\/\//i.test(l.skeleton), `${l.id} 里有外链`);
    assert.ok(!/position\s*:\s*fixed/i.test(l.skeleton), `${l.id} 用了 position:fixed`);
    assert.ok(!/\d(vh|vw)\b/.test(l.skeleton), `${l.id} 用了 vh/vw，画布是固定像素`);
  }
});
