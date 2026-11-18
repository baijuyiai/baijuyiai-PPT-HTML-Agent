import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// 环境必须在导入任何模块之前设定
const tmp = mkdtempSync(join(tmpdir(), 'lumen-brand-'));
process.env.NODE_ENV = 'test';
process.env.LUMEN_DB_PATH = join(tmp, 'test.db');
process.env.LUMEN_SECRET_KEY = 'test-secret-key-0123456789abcdefghijklmnop';

const { migrate } = await import('../db/migrate.js');
const { closeDb } = await import('../db/client.js');
const { ensureSeed } = await import('./seed.service.js');
const { createUser } = await import('./user.service.js');
const { createProject, requireProject, updateProject } = await import('./project.service.js');

migrate();
ensureSeed();

test.after(() => {
  closeDb();
  rmSync(tmp, { recursive: true, force: true });
});

let seq = 0;
function makeProject() {
  seq += 1;
  const user = createUser({
    username: `brand${Date.now()}${Math.floor(Math.random() * 100000)}`,
    password: 'abcd1234',
    role: 'user',
    source: 'self_signup',
  });
  return createProject({
    tenantId: user.tenantId,
    ownerId: user.userId,
    title: `品牌验证 ${seq}`,
    brief: '一段需求。',
  });
}

/* ---------------- 数据模型 ---------------- */

test('品牌五个字段跟着项目走，默认都是空的', () => {
  const project = makeProject();
  assert.equal(project.brandLogoImage, '');
  assert.equal(project.brandLogoSvg, '');
  assert.equal(project.brandLogoMode, '');
  assert.equal(project.brandName, '');
  assert.equal(project.brandTagline, '');

  const svg = '<svg viewBox="0 0 10 10"><rect width="10" height="10"/></svg>';
  const updated = updateProject(project.projectId, project.tenantId, {
    brandName: '星图科技',
    brandTagline: '让数据说话',
    brandLogoImage: 'tn_x/proj/uploads/1-logo.png',
    brandLogoSvg: svg,
    brandLogoMode: 'redraw',
  });

  assert.equal(updated.brandName, '星图科技');
  assert.equal(updated.brandLogoImage, 'tn_x/proj/uploads/1-logo.png');
  assert.equal(updated.brandTagline, '让数据说话');
  assert.equal(updated.brandLogoMode, 'redraw');
  assert.equal(
    requireProject(project.projectId, project.tenantId).brandLogoSvg, svg,
    '要真的落库，不能只在返回值里',
  );
});

/* ---------------- 任务类型 ---------------- */

test('logo_redraw 是合法任务类型，有中文名，且默认不锁路由', async () => {
  const { TaskType, TASK_TYPE_LABEL, DEFAULT_LOCKED_ROUTES } = await import('@lumen/ir-schema');
  assert.ok(TaskType.options.includes('logo_redraw'), '枚举里要有 logo_redraw');
  assert.equal(TASK_TYPE_LABEL.logo_redraw, '品牌重绘');
  assert.equal(DEFAULT_LOCKED_ROUTES.includes('logo_redraw'), false, '重绘不该默认锁路由');
});

test('种子给 logo_redraw 建了路由，指向默认文本模型', async () => {
  const { get } = await import('../db/client.js');
  const row = get<{ taskType: string; primaryRef: string }>(
    'SELECT taskType, primaryRef FROM task_routes WHERE taskType = ?', 'logo_redraw',
  );
  assert.ok(row, 'ensureSeed 要建这条路由，否则重绘会报「没有路由」');
  assert.ok(row!.primaryRef.length > 0);
});

/* ---------------- 重绘 ---------------- */

const { redrawLogo, validateLogoSvg } = await import('./brand-logo.service.js');
const { MOCK_PLACEHOLDER_MARKER } = await import('@lumen/provider-gateway');

/** 假网关：记下每次请求，按次序吐预设回复 */
function fakeGateway(replies: (string | Error)[]) {
  const seen: {
    messages: { content: string; images?: string[] }[];
    taskType?: string;
    /** 指令写在这里，不在那一轮的用户消息里 */
    system?: string;
  }[] = [];
  let i = 0;
  return {
    seen,
    gateway: {
      async text(req: { messages: { content: string; images?: string[] }[]; taskType?: string; system?: string }) {
        seen.push(req);
        const r = replies[Math.min(i, replies.length - 1)];
        i += 1;
        if (r instanceof Error) throw r;
        return {
          text: r ?? '', providerId: 'fake', model: 'fake',
          usage: { inputTokens: 1, outputTokens: 1 },
          degraded: false, degradeReason: '', latencyMs: 1,
        };
      },
      async image() { throw new Error('本用例不生成图片'); },
    },
  };
}

const GOOD_SVG = '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="currentColor"/></svg>';

/** 一个假的对象读取函数，固定返回一张 1x1 PNG */
const onePng = async () => Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('重绘成功：落库 svg 与原图 key，模式是 redraw', async () => {
  const project = makeProject();
  const { gateway, seen } = fakeGateway([JSON.stringify({ svg: GOOD_SVG })]);

  const out = await redrawLogo({
    projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
    imageKey: 'tn_x/proj/uploads/1-logo.png',
    gateway: gateway as never, readObject: onePng,
  });

  assert.equal(out.svg, GOOD_SVG);
  const saved = requireProject(project.projectId, project.tenantId);
  assert.equal(saved.brandLogoSvg, GOOD_SVG, '要落库');
  assert.equal(saved.brandLogoImage, 'tn_x/proj/uploads/1-logo.png', '原图 key 也要留，供「就用原图」');
  assert.equal(saved.brandLogoMode, 'redraw');

  // 原图要以 data URL 发给模型，模型才看得到
  assert.ok(seen[0]!.messages[0]!.images?.[0]?.startsWith('data:image/png;base64,'), '原图要发给模型');
  assert.equal(seen[0]!.taskType, 'logo_redraw', '要走 logo_redraw 路由');
  assert.match(
    seen[0]!.system ?? '', /不要画背景/,
    '提示词要明说去掉白底。**约束在 `system` 里**——仓库惯例是指令进 system，那一轮的用户消息只放任务本身',
  );
});

test('校验：恶意 SVG 一律拒收', () => {
  // **每条用例只命中 FORBIDDEN 里的一条规则**，这样删掉任意一条规则都必有用例转红。
  // 若一条用例同时命中两条（例如 `<image href>` 会同时撞上 `<image` 与 `href`），
  // 删掉其中一条另一条仍会兜住，那条规则就等于一次都没被验到。
  // 尤其注意最后那条 http 规则：任何 `https://…` 外链都会连带上它，所以想隔离
  // `<image` / `href=` / `url(` 时，URL 得写成协议相对写法 `//…`。
  const bad = [
    // `<script`
    '<svg viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10"/></svg>',
    // `<image` —— 用 src 而非 href（写成 href 会先被 href 规则拦下），且 URL 用协议相对写法
    // `//…`：写成 `https://…` 会同时命中最后那条 http 规则，`<image` 就没被单独验到
    '<svg viewBox="0 0 10 10"><image src="//evil.example/x.png"/><rect width="1" height="1"/></svg>',
    // `<foreignObject`
    '<svg viewBox="0 0 10 10"><foreignObject><div>x</div></foreignObject><rect width="1" height="1"/></svg>',
    // `href=` —— 用 `<a href>`：`<use href>` / xlink:href 都会连带到别的规则；URL 用 `//…`
    // 协议相对写法，避免同时命中那条 http 规则
    '<svg viewBox="0 0 10 10"><a href="//evil.example/x">x</a><rect width="1" height="1"/></svg>',
    // `xlink:` —— 不带 href=，否则被 href 规则遮住
    '<svg viewBox="0 0 10 10"><rect width="1" height="1" xlink:type="simple"/></svg>',
    // `url(` —— URL 同样用 `//…`，避免同时命中那条 http 规则
    '<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="url(//evil.example/x)"/></svg>',
    // `<style` —— 不带 @import，否则被那条遮住
    '<svg viewBox="0 0 10 10"><style>rect{fill:red}</style><rect width="1" height="1"/></svg>',
    // `@import` —— 反向：**不带 `<style`**，否则被 `<style` 先拦下，这条规则就一次都没被验到。
    // 现实里的绕过形态是 `<style>@import "https://…"`（引号写法，`url(` 那条挡不住），
    // 能不能拦住全看这一条，所以它必须有一条自己的用例
    '<svg viewBox="0 0 10 10"><rect width="1" height="1" fill="@import"/></svg>',
    // `image-set(` —— 同样不带 `<style`
    '<svg viewBox="0 0 10 10"><rect width="1" height="1" style="fill:image-set(a 1x)"/></svg>',
    // `on*=` —— 内联事件处理器，导出用 Chromium **没关 JS**，这里放行就等于放行任意代码
    '<svg viewBox="0 0 10 10" onload="alert(1)"><rect width="1" height="1"/></svg>',
    // 非 w3.org 的 http(s) 地址
    '<svg viewBox="0 0 10 10"><rect width="1" height="1" fill="https://evil.example/x"/></svg>',
    // `<use` —— 不带 href，否则被 href 规则遮住
    '<svg viewBox="0 0 10 10"><use/><rect width="1" height="1"/></svg>',
    // 结构性错误：根本不是 SVG
    'not an svg at all',
    // 缺 viewBox
    '<svg><rect width="10" height="10"/></svg>',
    // 没有任何图形（这条故意不带 rect，验证图形检查本身）
    '<svg viewBox="0 0 10 10"><text>只有文字，没有图形</text></svg>',
  ];
  for (const svg of bad) {
    // 断言消息前缀而不是 `/.*/`：后者连 TypeError 也算通过，等于没验
    assert.throws(() => validateLogoSvg(svg), /重绘结果/, `这条本该被拒：${svg.slice(0, 60)}`);
  }
});

test('校验：合格的 SVG 放行', () => {
  assert.doesNotThrow(() => validateLogoSvg(GOOD_SVG));
  assert.doesNotThrow(() => validateLogoSvg(
    '<svg viewBox="0 0 10 10"><path d="M0 0 L10 10"/><rect width="2" height="2"/></svg>',
  ));
});

/**
 * 报错必须抛 `AppError`，否则那些中文报错根本到不了用户手上。
 *
 * `packages/server-core/src/middleware/error.ts` 只把 **`AppError`** 的报文透给客户端，
 * 其余一律压成 500「服务器内部错误」。所以这一整轮「把裸 `Error` 换成 `invalid(...)`」的
 * 改动，**全靠 `err instanceof AppError`** 才成立。
 *
 * 而原来没有任何断言在看这件事：把 `invalid(` 全换回 `new Error(`，别的用例只匹配
 * 消息前缀（`/重绘结果/`），**一条都不会转红**，用户却会看到「重绘失败：服务器内部错误」。
 * 这条就是补那个洞的——它不看消息，只看类型与 code。
 */
test('校验与网关失败抛的是 AppError，报文才透得到用户手上', async () => {
  const { AppError } = await import('../lib/errors.js');

  // **`huge` 这条不能漏。** `validateLogoSvg` 有 5 个拒绝分支，前四条分别命中
  // 「非 SVG / 缺 viewBox / 无图形 / FORBIDDEN」；体积那条如果不在这个列表里，
  // 把 `invalid(\`重绘结果超过…\`)` 换成裸 `Error` 就**一条测试都不会转红**
  // （旁边那条 40KB 用例只匹配消息前缀，不看类型）——用户看到的就是 500「服务器内部错误」，
  // 正是这条用例要堵的失败形态，只是漏了最后一个分支。实测确认过这个盲区。
  const huge = `<svg viewBox="0 0 10 10"><path d="M0 0 ${'L1 1 '.repeat(11000)}"/></svg>`;
  for (const svg of [
    huge,
    // **这条不能用 `'not an svg at all'`。** 那个字符串连 viewBox 也没有，于是下一条规则
    // 也会拒它——删掉「不是 SVG」这个分支，`assert.throws` 照样通过，那条分支一次都没被验到
    // （实测：变异成删除该分支，`fail=0`）。要的就是「有 viewBox、有图形、就是没有 `<svg>`」。
    '<div viewBox="0 0 1 1"><rect width="1" height="1"/></div>',
    '<svg><rect width="10" height="10"/></svg>',
    '<svg viewBox="0 0 10 10"><text>只有文字</text></svg>',
    '<svg viewBox="0 0 10 10"><script>x</script><rect width="1" height="1"/></svg>',
  ]) {
    assert.throws(
      () => validateLogoSvg(svg),
      (e: unknown) => e instanceof AppError && e.code === 'VALIDATION' && /重绘结果/.test(e.message),
      `本该是 VALIDATION 的 AppError：${svg.slice(0, 40)}`,
    );
  }

  const project = makeProject();
  const opts = { projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId };

  // 路由指向内置 Mock：要让用户知道是「没配模型」，不是「服务器坏了」
  const mock = fakeGateway([`${MOCK_PLACEHOLDER_MARKER}，这是一段说明文字。`]);
  await assert.rejects(
    redrawLogo({ ...opts, imageKey: 'tn_x/proj/uploads/5-logo.png', gateway: mock.gateway as never, readObject: onePng }),
    (e: unknown) => e instanceof AppError && e.code === 'NOT_CONFIGURED',
  );

  // 模型回的不是合契约的 JSON
  const garbage = fakeGateway(['这不是 JSON']);
  await assert.rejects(
    redrawLogo({ ...opts, imageKey: 'tn_x/proj/uploads/6-logo.png', gateway: garbage.gateway as never, readObject: onePng }),
    (e: unknown) => e instanceof AppError && e.code === 'PROVIDER_ERROR',
  );

  /**
   * 网关**自己**抛的那条裸 `Error` 也要翻。
   *
   * `router.ts:11` 明写「未配置路由时 message 含 `ROUTE_NOT_CONFIGURED`」，还有测试守着，
   * 所以这不是猜字符串。而「logo_redraw 没配模型」是自建部署最容易撞上的一种失败——
   * 不翻的话用户在面板上只看到「服务器内部错误」，连要去管理后台配路由都想不到。
   */
  const noRoute = {
    async text() { throw new Error('ROUTE_NOT_CONFIGURED：任务类型 logo_redraw 未配置路由，请先在管理后台补上主模型与降级链'); },
    async image() { throw new Error('本用例不生成图片'); },
  };
  await assert.rejects(
    redrawLogo({ ...opts, imageKey: 'tn_x/proj/uploads/7-logo.png', gateway: noRoute as never, readObject: onePng }),
    (e: unknown) => e instanceof AppError && e.code === 'NOT_CONFIGURED',
    '路由没配时不能让用户看到「服务器内部错误」',
  );
});

test('模型给的不是合法 SVG 时明确报错，且不落库、但保留原图 key', async () => {
  const project = makeProject();
  const { gateway } = fakeGateway([JSON.stringify({ svg: '<svg viewBox="0 0 1 1"><script>x</script></svg>', })]);

  await assert.rejects(
    redrawLogo({
      projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
      imageKey: 'tn_x/proj/uploads/2-logo.png',
      gateway: gateway as never, readObject: onePng,
    }),
    /重绘结果/,
  );

  const saved = requireProject(project.projectId, project.tenantId);
  assert.equal(saved.brandLogoSvg, '', '校验没过就不该落库');
  assert.equal(saved.brandLogoImage, 'tn_x/proj/uploads/2-logo.png', '原图 key 要留着，「就用原图」还得用');
  assert.equal(saved.brandLogoMode, 'original', '重绘没成，自动退回原图模式，用户不至于看到空白页眉');
});

/**
 * 读不出原图时必须**整个不动库**。
 *
 * 这一条钉的是「先读图再动库」那个顺序。顺序反过来（先写原图 key 再读）会留下
 * `{image: 一个不存在的 key, svg: '', mode: 'original'}`：上一份能用的稿被清掉了，
 * 新的原图又是破图。触发面不小——对象过期被清、或者计划 Task 5 的 `/brand/redraw`
 * 收到一个乱传的 key，都会走到这里。
 */
test('读不出原图时一个字都不写，旧原图与旧稿都留着', async () => {
  const project = makeProject();
  const opts = { projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId };

  // 前置条件：先有一份好好的状态
  const first = fakeGateway([JSON.stringify({ svg: GOOD_SVG })]);
  await redrawLogo({ ...opts, imageKey: 'tn_x/proj/uploads/old.png', gateway: first.gateway as never, readObject: onePng });
  assert.equal(requireProject(project.projectId, project.tenantId).brandLogoSvg, GOOD_SVG, '前置条件');
  assert.equal(requireProject(project.projectId, project.tenantId).brandLogoMode, 'redraw', '前置条件');

  const { gateway } = fakeGateway([JSON.stringify({ svg: GOOD_SVG })]);
  await assert.rejects(
    redrawLogo({
      ...opts, imageKey: 'tn_x/proj/uploads/missing.png',
      gateway: gateway as never, readObject: async () => { throw new Error('对象不存在'); },
    }),
    // **这里匹配的是被翻过一遍的中文报文，不是 `对象不存在`。** 读对象失败一律被
    // `redrawLogo` 的 `catch` 换成 `invalid('这张原图取不到…')`——对象存储抛的是裸
    // `Error`，原样放上去只会被中间件压成 500「服务器内部错误」，用户分不出是图片没了
    // 还是模型挂了。所以「原始消息透不出来」正是要的行为，不是丢信息。
    /取不到/,
  );

  const saved = requireProject(project.projectId, project.tenantId);
  assert.equal(saved.brandLogoImage, 'tn_x/proj/uploads/old.png', '旧原图不能被换成一个读不出来的 key');
  assert.equal(saved.brandLogoSvg, GOOD_SVG, '旧稿不能被清掉——它本来还能用');
  assert.equal(saved.brandLogoMode, 'redraw', '模式也不能被退成 original');
});

test('超过 40KB 的稿拒收，模型多半是把整张图描成了逐像素路径', () => {
  const huge = `<svg viewBox="0 0 10 10"><path d="M0 0 ${'L1 1 '.repeat(11000)}"/></svg>`;
  assert.ok(Buffer.byteLength(huge, 'utf8') > 40 * 1024, '前置条件：这段确实超了 40KB');
  // 它不含任何被拒绝的内容，所以拦下它的只可能是体积那条
  assert.throws(() => validateLogoSvg(huge), /超过 40KB/);
  // 边界：刚好不超的要放行，否则这个上限会变成「稍微复杂一点就不给过」
  const justUnder = `<svg viewBox="0 0 10 10"><path d="M0 0 ${'L1 1 '.repeat(Math.floor((40 * 1024 - 70) / 5))}"/></svg>`;
  assert.ok(Buffer.byteLength(justUnder, 'utf8') <= 40 * 1024, '前置条件：这段没超');
  assert.doesNotThrow(() => validateLogoSvg(justUnder));
});

test('换一张图但重绘失败时，不留着上一张的重绘稿', async () => {
  const project = makeProject();
  const opts = { projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId };

  // 前置条件：第一张已经重绘好了、且已经落库
  const first = fakeGateway([JSON.stringify({ svg: GOOD_SVG })]);
  await redrawLogo({ ...opts, imageKey: 'tn_x/proj/uploads/old-logo.png', gateway: first.gateway as never, readObject: onePng });
  assert.equal(requireProject(project.projectId, project.tenantId).brandLogoSvg, GOOD_SVG, '前置条件');

  // 用户换了一张，这一轮模型给的东西校验不过
  const second = fakeGateway([JSON.stringify({ svg: '<svg viewBox="0 0 1 1"><script>x</script></svg>', })]);
  await assert.rejects(
    redrawLogo({ ...opts, imageKey: 'tn_x/proj/uploads/new-logo.png', gateway: second.gateway as never, readObject: onePng }),
    /重绘结果/,
  );

  const saved = requireProject(project.projectId, project.tenantId);
  assert.equal(saved.brandLogoImage, 'tn_x/proj/uploads/new-logo.png', '原图要换成新的');
  assert.equal(
    saved.brandLogoSvg, '',
    '旧稿必须清掉：留着就是「新原图 + 上一张的重绘稿」两份不相干的东西并排，'
    + '面板按 `brandLogoSvg` 非空走有稿那条分支，既不提示失败、还让人能把旧稿确认到新图上',
  );
  assert.equal(saved.brandLogoMode, 'original');
});

/**
 * 一个能卡住**第一次**模型调用的网关，用来在两轮重绘之间插队。
 *
 * `started` 在第一次调用进入时兑现，于是「A 这一轮已经落到模型上」是可等待的确定事实，
 * 不靠 `await Promise.resolve()` 数微任务——那种写法一旦前面多一个 await 就悄悄失真。
 */
function gatedGateway(svgA: string, svgB: string) {
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  let entered!: () => void;
  const started = new Promise<void>((r) => { entered = r; });
  let call = 0;
  const gateway = {
    async text() {
      call += 1;
      if (call === 1) {
        entered();
        await gate;
        return { text: JSON.stringify({ svg: svgA }) };
      }
      return { text: JSON.stringify({ svg: svgB }) };
    },
    async image() { throw new Error('本用例不生成图片'); },
  };
  return { gateway, started, release };
}

test('重绘期间用户又换了一张：先发起的那一轮不覆盖后来者', async () => {
  const SVG_A = '<svg viewBox="0 0 4 4"><rect width="4" height="4"/></svg>';
  const SVG_B = '<svg viewBox="0 0 8 8"><circle cx="4" cy="4" r="3"/></svg>';
  const keyA = 'tn_x/proj/uploads/a.png';
  const keyB = 'tn_x/proj/uploads/b.png';

  const project = makeProject();
  const opts = { projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId };
  const { gateway, started, release } = gatedGateway(SVG_A, SVG_B);

  // A 这一轮发起后卡在模型上（初始写已经落了 keyA）
  const slow = redrawLogo({ ...opts, imageKey: keyA, gateway: gateway as never, readObject: onePng });
  await started;
  assert.equal(requireProject(project.projectId, project.tenantId).brandLogoImage, keyA, '前置条件：A 已落库');

  // 这期间用户又传了一张，B 这一轮一路跑完并写库
  await redrawLogo({ ...opts, imageKey: keyB, gateway: gateway as never, readObject: onePng });
  assert.equal(requireProject(project.projectId, project.tenantId).brandLogoSvg, SVG_B, '前置条件：B 已落库');

  // A 这才拿到模型结果
  release();
  await slow;

  const saved = requireProject(project.projectId, project.tenantId);
  assert.equal(saved.brandLogoImage, keyB, '当前原图是 B');
  assert.equal(saved.brandLogoSvg, SVG_B, 'B 的图必须配 B 的稿，不能被 A 的稿盖掉');
  assert.equal(saved.brandLogoMode, 'redraw');
});

test('网关整个挂掉时如实报错，不落库', async () => {
  const project = makeProject();
  const { gateway } = fakeGateway([new Error('连接超时')]);
  await assert.rejects(
    redrawLogo({
      projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
      imageKey: 'tn_x/proj/uploads/3-logo.png',
      gateway: gateway as never, readObject: onePng,
    }),
    /连接超时/,
  );
  assert.equal(requireProject(project.projectId, project.tenantId).brandLogoSvg, '');
});

test('内置 Mock 的占位说明不算重绘结果', async () => {
  const project = makeProject();
  const { gateway } = fakeGateway([`${MOCK_PLACEHOLDER_MARKER}，这是一段说明文字。`]);
  await assert.rejects(
    redrawLogo({
      projectId: project.projectId, tenantId: project.tenantId, userId: project.ownerId,
      imageKey: 'tn_x/proj/uploads/4-logo.png',
      gateway: gateway as never, readObject: onePng,
    }),
  );
});
