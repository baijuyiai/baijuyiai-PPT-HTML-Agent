import test from 'node:test';
import assert from 'node:assert/strict';
import { PAGE_TYPE_BRIEF, PAGE_TYPE_LABEL, Provider, StyleSpec } from '@lumen/ir-schema';
import { MockClient, isMockPlaceholder, type ProviderGateway } from '@lumen/provider-gateway';
import { derivePrompts, generateMock, splitSlides, writePagePrompt } from './page-prompt-kit.js';

const PALETTE = {
  bg: '#EFE6DA', surface: '#F7F1E8', text: '#3A322B', muted: '#8A7F73',
  accent: '#E08A3C', brand: '#C7421A', border: '#D8CDBF',
};

const FONTS = { fontFamily: '"Source Han Serif", serif', fontDisplay: 'Georgia, serif', fontScript: 'cursive' };

interface TextRequest {
  system?: string;
  messages: { content: string }[];
}

/** 假网关的回复：字符串就是一段正常产出，对象可以额外声明「这次是降级来的」 */
type Reply = string | Error | { text: string; degraded?: boolean; degradeReason?: string };

/** 假网关：按调用次序吐预设回复，并记下每次收到的请求供断言 */
function fakeGateway(replies: Reply[]) {
  const seen: TextRequest[] = [];
  let i = 0;
  return {
    seen,
    gateway: {
      async text(req: TextRequest) {
        seen.push(req);
        const r = replies[Math.min(i, replies.length - 1)];
        i += 1;
        if (r instanceof Error) throw r;
        if (typeof r === 'object' && r !== null) {
          return {
            text: r.text, providerId: 'fake', model: 'fake',
            usage: { inputTokens: 1, outputTokens: 1 },
            degraded: r.degraded ?? false, degradeReason: r.degradeReason ?? '', latencyMs: 1,
          };
        }
        return {
          text: r ?? '', providerId: 'fake', model: 'fake',
          usage: { inputTokens: 1, outputTokens: 1 },
          degraded: false, degradeReason: '', latencyMs: 1,
        };
      },
      async image() { throw new Error('本用例不生成图片'); },
    } as unknown as ProviderGateway,
  };
}

/**
 * 内置 Mock 给 `html_codegen` 的真实兜底产出。
 *
 * **用真的 `MockClient` 跑出来，不手抄一段「像占位」的字符串**：判据要认的正是网关
 * 实际会给的那串文字。手抄的那份一旦与 `buildPlain` 脱节，用例照样绿着而线上照样漏——
 * 这条链上已经有过多份「测试通过、线上失效」的手抄副本了。
 */
const MOCK_HTML_REPLY = await new MockClient('prv_mock').text(
  { taskType: 'html_codegen', messages: [{ role: 'user', content: '写一页 HTML' }] },
  'deepseek-v4',
  Provider.parse({ providerId: 'prv_mock', name: '内置 Mock', type: 'openai-compatible', baseUrl: '' }),
).then((r) => r.text);


const IMG = { width: 64, height: 64 };
const OK_PROMPT = '角色：x\n任务：y\n视觉与排版要求：\n1. z\n代码要求（非常重要）：\n1. w';

test('模型一个框都给不出时，分页兜底成「整张图当一页」而不是空数组', async () => {
  const { gateway } = fakeGateway([JSON.stringify({ slides: [] })]);
  const refs = await splitSlides(gateway, 'data:image/png;base64,AAAA', IMG);
  assert.equal(refs.length, 1, '空数组会让上层报「没能找出任何一页」，那是错的');
  assert.deepEqual(refs[0]!.box, { x0: 0, y0: 0, x1: 1, y1: 1 });
});

test('模型没写出提示词时抛错，调用方必须接住', async () => {
  const { gateway } = fakeGateway(['']);
  await assert.rejects(
    () => writePagePrompt(gateway, 'data:image/png;base64,AAAA', 'cover'),
    /提示词/,
  );
});

test('样机第一版过不了 lint 时，返回的是第二次的结果，且自身绝不抛', async () => {
  // 两版**只有 --bg 的取值不同**，好让「过不过」只由配色这一件事决定。
  // 两版都要真的引用 var(--bg)：`isMockHtmlAcceptable` 只看 error 级，
  // 但没用到变量会留下一条 no-tokens 的 warning 混进 issues 里，那是另一回事
  const bad = '<style>:root { --bg:#0B0B10; }</style><div class="slide" style="background:var(--bg)">x</div>';
  const good = `<style>:root { --bg:${PALETTE.bg}; }</style><div class="slide" style="background:var(--bg)">x</div>`;
  const { gateway, seen } = fakeGateway([bad, good]);
  const r = await generateMock(gateway, OK_PROMPT, PALETTE);
  assert.equal(seen.length, 2, '第一版不过 lint 就该自己再调一次');
  assert.equal(r.html, good, '返回的必须是第二次的 html');
  assert.deepEqual(r.issues, [], '第二次过了，就不该再带问题');
});

test('两次都过不了 lint 时带问题返回，不抛', async () => {
  const bad = '<style>:root { --bg:#0B0B10; }</style><div class="slide">x</div>';
  const { gateway } = fakeGateway([bad, bad]);
  const r = await generateMock(gateway, OK_PROMPT, PALETTE);
  assert.ok(r.issues.some((i) => i.severity === 'error'));
});

test('不给配色时，请求与本任务之前逐字一致', async () => {
  const { gateway, seen } = fakeGateway([OK_PROMPT]);
  await writePagePrompt(gateway, 'data:image/png;base64,AAAA', 'cover');
  assert.equal(seen.length, 1);
  // 这条只管 **kit 自己的默认行为**：省略可选参数时请求长什么样。
  // 「全量识别那条路真的什么都不传」是另一件事，由 `recognize-doc.test.ts`
  // 端到端守着（那里把 runDocRecognition 真跑一遍）——别把那份覆盖算到这条头上，
  // 这正是原先那条用例名字的毛病：它宣称了一份它并不拥有的覆盖。
  // 逐字比对而不是「不出现色值」：后者在 content 被清空时也会通过。
  // 只钉请求的拼法（拼装顺序、分隔符、没有多余的追加），文案本身仍以常量为准——
  // 改 PAGE_TYPE_BRIEF 的措辞是产品决定，不该把这条接线用例带崩。
  assert.equal(
    seen[0]!.messages[0]!.content,
    `这一页是【${PAGE_TYPE_LABEL.cover}】（${PAGE_TYPE_BRIEF.cover}）。请写出它的 HTML 生成提示词。`,
  );
});

test('给了配色就把色值明写进调用，并说明参考图的颜色不要照搬', async () => {
  const { gateway, seen } = fakeGateway([OK_PROMPT]);
  await writePagePrompt(gateway, 'data:image/png;base64,AAAA', 'cover', { palette: PALETTE });
  const content = seen[0]!.messages[0]!.content;
  assert.ok(content.includes(PALETTE.bg), '色值必须明写进调用');
  assert.ok(content.includes('不要照搬'), '必须说清参考图的颜色不算数');
});

test('给了字体就把字体明写进调用，并要求不声明 font-family', async () => {
  const { gateway, seen } = fakeGateway([OK_PROMPT]);
  await writePagePrompt(gateway, 'data:image/png;base64,AAAA', 'cover', { fonts: FONTS });
  const content = seen[0]!.messages[0]!.content;
  assert.ok(content.includes(FONTS.fontFamily), '字体必须明写进调用');
  // 光写「用这套字体」不够：渲染层注入的 --font-sans 会被片段自己的 body{font-family:…} 盖掉，
  // 所以必须明说要引用 var(--font-sans)、且不要自带字体栈
  assert.ok(content.includes('var(--font-sans)'), '必须让页面引用注入的 --font-sans');
  assert.ok(content.includes('不要声明任何具体的字体名'), '必须明说不要自带字体栈');
  // 另外两个角色也得交代：只给 --font-sans 的话，模型想要衬线或手写体时又会自己去写字体栈
  assert.ok(content.includes('var(--font-display)'), '必须告诉模型「展示字体」这个角色');
  assert.ok(content.includes('var(--font-script)'), '必须告诉模型「手写体」这个角色');
});

test('不给字体时，出样机调用里一个字都不提字体', async () => {
  const { gateway, seen } = fakeGateway([OK_PROMPT, OK_PROMPT]);
  // 与上面那条同理：这条只测 **kit 的默认行为**（省略 fontFamily 时不追加字体块）。
  // 全量识别出样机时确实不给字体，但那是 `recognize-doc.service.ts` 的调用点决定的，
  // 端到端由 `recognize-doc.test.ts` 守——把 fontFamily 塞进那个调用点，红的是那一条，
  // 不是这一条。用例名字原先写成「全量识别那条路一点没动」，宣称的就是这份它没有的覆盖。
  await generateMock(gateway, OK_PROMPT, PALETTE);
  const content = seen[0]!.messages[0]!.content;
  assert.ok(content.includes(`--bg: ${PALETTE.bg};`), '配色照旧带上');
  assert.ok(!content.includes('var(--font-sans)'), '没给字体就不该冒出字体说明');
});

test('给了字体时，出样机的调用也带上字体说明', async () => {
  const { gateway, seen } = fakeGateway([OK_PROMPT, OK_PROMPT]);
  await generateMock(gateway, OK_PROMPT, PALETTE, FONTS);
  const content = seen[0]!.messages[0]!.content;
  assert.ok(content.includes(FONTS.fontFamily), '字体要明写进出样机的调用');
  assert.ok(content.includes('var(--font-sans)'));
});

test('给了问题清单就逐条列给模型，要求重写', async () => {
  const { gateway, seen } = fakeGateway([OK_PROMPT]);
  await writePagePrompt(gateway, 'data:image/png;base64,AAAA', 'cover', {
    problems: ['缺少「代码要求（非常重要）：」这一段', '提示词里写死了 img 的 src'],
  });
  const content = seen[0]!.messages[0]!.content;
  assert.ok(content.includes('缺少「代码要求（非常重要）：」这一段'), '问题要逐条列出来');
  assert.ok(content.includes('提示词里写死了 img 的 src'));
  assert.ok(content.includes('重写'), '要说清是重写而不是补');
});

/* ---------------- 降级到内置 Mock 的判据 ---------------- */

test('降级到内置 Mock 时抛错，占位说明文字不会被当成样机返回', async () => {
  // 先钉住前提：内置 Mock 对 html_codegen 的兜底**确实**是那段占位说明，而不是一页 HTML。
  // 这一条挂了说明 Mock 改了产出，下面那条判据守的东西也就变了
  assert.ok(isMockPlaceholder(MOCK_HTML_REPLY), '内置 Mock 的兜底产出应当带占位标记');

  const { gateway, seen } = fakeGateway([MOCK_HTML_REPLY]);
  await assert.rejects(
    () => generateMock(gateway, OK_PROMPT, PALETTE),
    /没有产出样机/,
  );
  assert.equal(seen.length, 1, '这是降级不是 lint 不过，不该自己再调一次');
});

test('降级与「路由本来就指着 Mock」给的是两种说法', async () => {
  const degraded = fakeGateway([{ text: MOCK_HTML_REPLY, degraded: true, degradeReason: '主模型 prv-x 失败：连接超时' }]);
  await assert.rejects(
    () => generateMock(degraded.gateway, OK_PROMPT, PALETTE),
    /主模型失败后降级到了内置 Mock（主模型 prv-x 失败：连接超时）/,
    '降级要带上原因，否则用户无从判断是配置问题还是模型抖动',
  );

  const routed = fakeGateway([MOCK_HTML_REPLY]);
  await assert.rejects(
    () => generateMock(routed.gateway, OK_PROMPT, PALETTE),
    /当前 html_codegen 路由指向内置 Mock/,
  );
});

test('判据只看占位标记，真样机照旧返回', async () => {
  // 反方向也要守：判据不能宽到把正常样机也拦下。用一段真样机、且**含 Mock 网关常用的
  // 那批 CSS 变量名**，确保拦的是标记句本身，不是「像 Mock 写的」这种模糊印象
  const good = '<style>:root { --bg:#EFE6DA; }</style><div class="slide" style="background:var(--bg)">真样机</div>';
  const { gateway } = fakeGateway([good]);
  const r = await generateMock(gateway, OK_PROMPT, PALETTE);
  assert.equal(r.html, good);
});

/**
 * 两处提示词都交代了人像位的写法。
 *
 * **走真链路断言「模型实际收到什么」，不去断言模块私有的常量**——常量里写了不等于
 * 发出去的就是它。这个文件已有的 `fakeGateway` 会把每次请求的 `system` 记下来，
 * 直接用它。
 */
test('两处提示词都交代了人像位的写法', async () => {
  const write = fakeGateway([OK_PROMPT]);
  await writePagePrompt(write.gateway, 'data:image/png;base64,AAAA', 'people');
  assert.match(
    write.seen[0]!.system ?? '', /data-lumen-cutout/,
    '识别提示词里没提人像位——模型不会写这个标记，人物页就取不到人物图',
  );

  const derive = fakeGateway([JSON.stringify({ pages: [{ pageType: 'people', prompt: OK_PROMPT }] })]);
  await derivePrompts(derive.gateway, [{ pageType: 'cover', prompt: OK_PROMPT }], ['people'], PALETTE);
  assert.match(
    derive.seen[0]!.system ?? '', /data-lumen-cutout/,
    '推导提示词里没提人像位——补齐出来的那条人物页提示词就不会用上人像位',
  );
});

/**
 * 视觉规范也要注进出样机的调用。
 *
 * **不注入的话样机只受那一条提示词约束**，而提示词是逐页写的散文，模型照着写时
 * 很容易把「整页要有一层 158° 渐变底」「页脚右侧放页码」这类系统性细节略过去。
 * 实测踩过：统一之后的样机自检，偏差全落在这些系统性项上——某套 32 条里大半是
 * 「无页脚页码，页码被放到右上角」「整页该是渐变却纯色满铺」「卡片该毛玻璃却是实心」。
 * 而真正生成页面的那条路（`generate-html.service`）本来是注入规范的，两条路不一致，
 * 「统一」就只统一了提示词、没统一产物。
 */
test('给了视觉规范时，出样机的调用带上规范那一段', async () => {
  const { gateway, seen } = fakeGateway([OK_PROMPT, OK_PROMPT]);
  const spec = StyleSpec.parse({
    title: {
      sizePx: 44, weight: 700, color: 'brand', align: 'left',
      rule: { position: 'above', widthPx: 72, heightPx: 6, color: 'accent' },
    },
    header: { kind: 'block', sizePx: 34, color: 'brand', heightPx: 88 },
    footer: { heightPx: 48, showPageNo: true, pageNoPosition: 'right', pageNoFormat: 'padded' },
    marginPx: 56,
    radius: { card: 14, inner: 8 },
  });

  await generateMock(gateway, OK_PROMPT, PALETTE, undefined, spec);
  const content = seen[0]!.messages[0]!.content;
  assert.ok(content.includes('这套风格的视觉规范'), '规范要明写进出样机的调用');
  // 页脚页码是实测最容易漏的一项，单独钉一下
  assert.ok(content.includes('页码靠右'), '页脚页码那一句必须在');
  assert.ok(content.includes('写成「01」'), '页码的写法也要在');
  // 顺序：配色在前、规范在后、正文之前——与 `generate-html.service` 同一个位置
  assert.ok(content.indexOf(`--bg: ${PALETTE.bg};`) < content.indexOf('这套风格的视觉规范'));
});

test('不给规范时，出样机的调用里一个字都不提规范', async () => {
  const { gateway, seen } = fakeGateway([OK_PROMPT, OK_PROMPT]);
  await generateMock(gateway, OK_PROMPT, PALETTE);
  assert.ok(!seen[0]!.messages[0]!.content.includes('这套风格的视觉规范'));
});

/* ---------------- 图表槽 ---------------- */

const PLAIN_HTML = '<style>.a{color:var(--text)}</style><div class="a">内容</div>';
const chartSlot = (json: string) =>
  `<style>.a{color:var(--text)}</style><div data-lumen-chart="600x300">${json}</div>`;
const GOOD_LINE = '{"kind":"line","categories":["A","B"],"series":[{"name":"S","values":[1,2]}]}';

/**
 * 图表页的样机**必须留一个能真出图的槽**。
 *
 * 真正生成页面那条路本来就有这道关（`generate-html.service` 的
 * `layout/missing-chart-slot`），而出样机这条路一直没有——实测九套风格里
 * 只有一套的槽是对的：六套压根没有槽（模型自己用 SVG 手绘了一张画死的图），
 * 一套把 JSON 写成了 JS 对象字面量，一套字段形状不对。
 */
test('图表页没有图表槽时，带着「要有槽」重发一次', async () => {
  const { gateway, seen } = fakeGateway([PLAIN_HTML, chartSlot(GOOD_LINE)]);
  const r = await generateMock(gateway, OK_PROMPT, PALETTE, undefined, undefined, 'chart');
  assert.equal(seen.length, 2, '第一版没有槽就该重发一次');
  assert.match(seen[1]!.messages[0]!.content, /图表槽/);
  assert.ok(r.html.includes('data-lumen-chart'), '重发之后该有槽了');
});

test('槽里的 JSON 写成 JS 对象字面量时，重发并说明要严格 JSON', async () => {
  const jsLiteral = chartSlot("{kind:'bar', categories:['A'], series:[{name:'S', values:[1]}]}");
  const good = chartSlot('{"kind":"bar","categories":["A"],"series":[{"name":"S","values":[1]}]}');
  const { gateway, seen } = fakeGateway([jsLiteral, good]);
  await generateMock(gateway, OK_PROMPT, PALETTE, undefined, undefined, 'chart');
  assert.equal(seen.length, 2);
  assert.match(seen[1]!.messages[0]!.content, /严格 JSON/);
});

test('折线图缺 categories 时，重试理由就是那句「要有 categories」', async () => {
  // 这一条正是用户看到的报错：模型写成 {"kind":"line","data":[{name,value}]}
  const wrongShape = chartSlot('{"kind":"line","data":[{"name":"Q1","value":3}]}');
  const { gateway, seen } = fakeGateway([wrongShape, chartSlot(GOOD_LINE)]);
  await generateMock(gateway, OK_PROMPT, PALETTE, undefined, undefined, 'chart');
  assert.equal(seen.length, 2);
  assert.match(seen[1]!.messages[0]!.content, /categories/);
});

test('槽的尺寸属性写错时也重发，且把整行骨架摆给模型', async () => {
  /**
   * 用**实测踩过的那种错法**当输入：JSON 被塞进了属性值。
   *
   * 「重工蓝白工业风」连着两次不合格就是因为它，写出来的是
   * `<div data-lumen-chart="{"kind":…}">`——属性里的引号在第一个 `{` 处就断了，
   * 解析出来只剩一个 `{`。拿「大一点」这种明显不像尺寸的值当输入，
   * 测不到「模型以为自己在写尺寸、其实在写 JSON」这一种。
   */
  const jsonInAttr = '<style>.a{color:var(--text)}</style>'
    + '<div data-lumen-chart="{">{"kind":"bar","categories":["A"],"series":[{"name":"x","values":[1]}]}</div>';
  const { gateway, seen } = fakeGateway([jsonInAttr, chartSlot(GOOD_LINE)]);
  await generateMock(gateway, OK_PROMPT, PALETTE, undefined, undefined, 'chart');
  assert.equal(seen.length, 2);

  const retry = seen[1]!.messages[0]!.content;
  assert.match(retry, /宽x高/);
  // **整行骨架要摆出来**。只说「属性里该写尺寸」它改不过来——
  // 得看见 `<div data-lumen-chart="1180x560">{…}</div>` 整行，才知道 JSON 在里面
  assert.match(retry, /data-lumen-chart="1180x560">\{"kind"/);
  // 模型写错的那一版要回显，它才看得见自己错在哪
  assert.match(retry, /现在引号里是「\{」/);
});

test('非图表页不要求图表槽——那种页面本来就该用 SVG 画', async () => {
  const { gateway, seen } = fakeGateway([PLAIN_HTML, PLAIN_HTML]);
  await generateMock(gateway, OK_PROMPT, PALETTE, undefined, undefined, 'text');
  assert.equal(seen.length, 1, '文字页没有槽是正常的，不该因此重发');
});

test('不传 pageType 时一个字都不提图表槽——老调用点行为不变', async () => {
  const { gateway, seen } = fakeGateway([PLAIN_HTML, PLAIN_HTML]);
  await generateMock(gateway, OK_PROMPT, PALETTE);
  assert.equal(seen.length, 1);
  assert.ok(!/图表槽/.test(seen[0]!.messages[0]!.content));
});

test('图表槽是对的就不重发', async () => {
  const { gateway, seen } = fakeGateway([chartSlot(GOOD_LINE), chartSlot(GOOD_LINE)]);
  await generateMock(gateway, OK_PROMPT, PALETTE, undefined, undefined, 'chart');
  assert.equal(seen.length, 1);
});

/* ---------------- 图片位 ---------------- */

const photoSlot = (n = 1) => `<style>.a{color:var(--text)}</style><img data-lumen-image="${n}">`;
const cutoutSlot = (n = 1) =>
  `<style>.a{color:var(--text)}</style><img data-lumen-image="${n}" data-lumen-cutout="1">`;

/**
 * 人物页 / 图文页 / 图片排版页**必须留图片位**。
 *
 * 用户一次报了四处「没图 / 没人物」，四套不同风格，**图片位都是 0 个**——
 * 连从参考图里读出来的那条提示词（暖橙渐变的图文页）也没写槽约定。
 * 这些页面的存在理由就是「有图」，而模型会自己画个色块顶上：
 * 页面在界面上看着是完整的，渲染层却一格都填不上。
 */
test('人物页没有人像位时，带着「要有人像位」重发一次', async () => {
  const { gateway, seen } = fakeGateway([PLAIN_HTML, cutoutSlot()]);
  const r = await generateMock(gateway, OK_PROMPT, PALETTE, undefined, undefined, 'people');
  assert.equal(seen.length, 2, '第一版没有槽就该重发一次');
  assert.match(seen[1]!.messages[0]!.content, /人像位/);
  assert.ok(r.html.includes('data-lumen-cutout'), '重发之后该有槽了');
});

test('人物页只有普通图片位、没有人像位，照样算不合格', async () => {
  const { gateway, seen } = fakeGateway([photoSlot(), cutoutSlot()]);
  await generateMock(gateway, OK_PROMPT, PALETTE, undefined, undefined, 'people');
  // 人像位多带一个 data-lumen-cutout，渲染层据此取**透明底抠图**并按 contain 摆。
  // 普通图片位取的是整张照片，会裁切——人像塞进去就糊了
  assert.equal(seen.length, 2, '人像位与普通图片位是两回事');
  assert.match(seen[1]!.messages[0]!.content, /0 个人像位/);
});

test('图片排版页一张图不够，要成组', async () => {
  const one = photoSlot();
  const two = `${photoSlot(1)}<img data-lumen-image="2">`;
  const { gateway, seen } = fakeGateway([one, two]);
  await generateMock(gateway, OK_PROMPT, PALETTE, undefined, undefined, 'gallery');
  assert.equal(seen.length, 2, '「多张图成组铺开」，一张不算');
  assert.match(seen[1]!.messages[0]!.content, /至少要有 2 个/);
});

test('图文页有一个图片位就够，不重发', async () => {
  const { gateway, seen } = fakeGateway([photoSlot(), photoSlot()]);
  await generateMock(gateway, OK_PROMPT, PALETTE, undefined, undefined, 'imageText');
  assert.equal(seen.length, 1);
});

test('封面不强求图片位——主视觉可以是几何构成', async () => {
  const { gateway, seen } = fakeGateway([PLAIN_HTML, PLAIN_HTML]);
  await generateMock(gateway, OK_PROMPT, PALETTE, undefined, undefined, 'cover');
  assert.equal(seen.length, 1, '大字海报那类封面用 CSS 画是合理的，逼它留槽反而会毁掉它');
});

test('不传 pageType 时一个字都不提图片位——老调用点行为不变', async () => {
  const { gateway, seen } = fakeGateway([PLAIN_HTML, PLAIN_HTML]);
  await generateMock(gateway, OK_PROMPT, PALETTE);
  assert.equal(seen.length, 1);
  assert.ok(!/图片位/.test(seen[0]!.messages[0]!.content));
});
