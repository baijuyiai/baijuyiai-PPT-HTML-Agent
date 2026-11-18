import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DeckIR, PageIR, StylePack, Provider, TaskRoute, User, Project, Task, ExportJob,
  passwordPolicyError, hueFamily, isOnFontLadder, lintOk, DEFAULT_LOCKED_ROUTES,
  mergeCostBuckets, formatCostBuckets, formatAmount, MotionName, isMotionMode, DEFAULT_MOTION,
  pageTextOf,
} from './index.js';

const page = {
  pageId: 'p1',
  pageType: 'imageText',
  layoutVariant: 'imageText/left-right@v1',
  title: { main: '转化率提升 87%' },
  blocks: [
    { type: 'paragraph', text: '本页核心是转化率提升。' },
    { type: 'metric', value: '87%', label: '转化率', primary: true },
    { type: 'image', source: 'ai', prompt: '极简商务，抽象几何，无文字' },
  ],
};

test('PageIR 合法样例解析并填充默认值', () => {
  const p = PageIR.parse(page);
  assert.equal(p.title.eyebrow, '');
  assert.deepEqual(p.title.accentWords, []);
  assert.equal(p.motion.enter, 'auto');
  assert.equal(p.avatar.mode, 'pip');
  assert.equal(p.avatar.diameter, 160);
  assert.equal(p.status, 'pending');
  assert.equal(p.script.cursorEnabled, false);
  const img = p.blocks.find((b) => b.type === 'image');
  assert.ok(img && img.type === 'image');
  assert.equal(img.genParams.model, 'gpt-image-2');
  assert.equal(img.focus, 'center');
});

test('PageIR 拒绝未知块类型与超限要点', () => {
  assert.throws(() => PageIR.parse({ ...page, blocks: [{ type: 'video', src: 'x' }] }));
  assert.throws(() =>
    PageIR.parse({
      ...page,
      blocks: [{ type: 'bullets', items: ['a', 'b', 'c', 'd', 'e', 'f'] }],
    }),
  );
});

test('PageIR 拒绝越界锚点与数字人直径', () => {
  assert.throws(() =>
    PageIR.parse({
      ...page,
      script: { cursorEnabled: true, segments: [{ t: 0, text: 'x', anchor: { targetId: 'a', x: 1.5, y: 0.5 } }] },
    }),
  );
  assert.throws(() => PageIR.parse({ ...page, avatar: { diameter: 300 } }));
});

test('DeckIR 校验 styleId 形式并填充画布', () => {
  const deck = DeckIR.parse({
    deckId: 'd1', tenantId: 't1', title: '路演', styleId: 'business-classic@1.2',
  });
  assert.deepEqual(deck.canvas, { w: 1920, h: 1080 });
  assert.equal(deck.pages.length, 0);
  assert.equal(deck.audienceTag, 'general');
});

const stylePack = {
  styleId: 'business-classic',
  family: 'business-classic',
  version: '1.2',
  name: '商务经典',
  base: {
    tokens: {
      brand500: '#6D4AFF', brand600: '#5A38E6', brand100: '#EFEAFE',
      accent500: '#FF7A1A', accent100: '#FFF0E6',
      neutral900: '#0F1115', neutral700: '#4A4F5A', neutral500: '#8A8F99',
      neutral300: '#E6E8EC', neutral100: '#F7F8FA', neutral0: '#FFFFFF',
    },
    typography: {
      roles: [{ role: 'title', family: 'Inter', sizePx: 40, weight: 600, lineHeight: 1.2 }],
    },
    titleGrammar: {
      templates: [{
        id: 't1', name: '左对齐主张', composition: 'left-aligned',
        maxTitleChars: 24, maxTitleLines: 2,
      }],
    },
    layouts: [{
      id: 'imageText/left-right@v1', pageType: 'imageText',
      maxTitleChars: 24, maxTitleLines: 2, maxBodyChars: 220,
      maxBlocks: 5, maxBullets: 5, maxMetrics: 3,
    }],
    components: {
      avatar: { pip: {}, fullscreen: {} },
      cursor: {},
    },
    motionWhitelist: ['fade', 'fadeUp'],
  },
};

test('StylePack 合法样例解析并填充五层默认值', () => {
  const sp = StylePack.parse(stylePack);
  assert.equal(sp.base.rules.maxBullets, 5);
  assert.equal(sp.base.rules.marginRatio, 0.05);
  assert.equal(sp.base.components.cursor.shape, 'halo');
  assert.equal(sp.base.components.cursor.opacity, 0.5);
  assert.equal(sp.base.components.avatar.fullscreen.transitionMs, 250);
  assert.deepEqual(sp.base.motionWhitelist, ['fade', 'fadeUp']);
  assert.equal(sp.meta.builtin, false);
});

test('StylePack 拒绝非法版本号与越界光标透明度', () => {
  assert.throws(() => StylePack.parse({ ...stylePack, version: 'v1.2' }));
  const bad = structuredClone(stylePack);
  bad.base.components.cursor = { opacity: 0.9 };
  assert.throws(() => StylePack.parse(bad));
});

test('Provider 合法样例解析，默认超时与重试', () => {
  const p = Provider.parse({
    providerId: 'pr1', name: '主网关', type: 'openai-compatible',
    baseUrl: 'https://api.example.com',
  });
  assert.equal(p.timeoutMs, 60000);
  assert.equal(p.maxRetries, 2);
  assert.equal(p.pathPrefix, '/v1');
  assert.equal(p.isMock, false);
});

test('TaskRoute 支持降级链与锁定标记', () => {
  const r = TaskRoute.parse({
    routeId: 'html-codegen', taskType: 'html_codegen',
    primary: { providerId: 'pr1', model: 'deepseek-v4' },
    fallbacks: [{ providerId: 'pr2', model: 'deepseek-v4' }],
    locked: true,
  });
  assert.equal(r.locked, true);
  assert.equal(r.fallbacks.length, 1);
  assert.deepEqual(DEFAULT_LOCKED_ROUTES, ['html_codegen', 'image']);
});

test('User 默认配额与来源标记', () => {
  const u = User.parse({
    userId: 'u1', tenantId: 't1', username: 'alice', role: 'user',
    status: 'active', source: 'self_signup', createdAt: 1,
  });
  assert.deepEqual(u.quota, { maxProjects: 10, maxConcurrency: 3, maxTokens: 0, maxImages: 100 });
  assert.equal(u.mustChangePassword, false);
  assert.equal(u.email, '');
});

test('Project 状态与计数默认值', () => {
  const p = Project.parse({
    projectId: 'p1', tenantId: 't1', ownerId: 'u1', title: '年度战略',
    createdAt: 1, updatedAt: 1,
  });
  assert.equal(p.status, 'draft');
  assert.equal(p.styleId, null);
  assert.equal(p.avatarEnabled, false);
  assert.equal(p.totalPages, 0);
});

test('Task 幂等键与租约字段默认值', () => {
  const t = Task.parse({
    taskId: 'k1', tenantId: 't1', kind: 'page_generate',
    idemKey: 'p1:pv1', groupKey: 't1/p1', createdAt: 1,
  });
  assert.equal(t.status, 'queued');
  assert.equal(t.maxAttempts, 3);
  assert.equal(t.leaseOwner, null);
  assert.equal(t.degradeReason, '');
});

test('ExportJob 进度边界', () => {
  const j = ExportJob.parse({
    exportId: 'e1', tenantId: 't1', projectId: 'p1', format: 'pptx', createdAt: 1,
  });
  assert.equal(j.progress, 0);
  assert.throws(() => ExportJob.parse({
    exportId: 'e2', tenantId: 't1', projectId: 'p1', format: 'pptx', progress: 1.5, createdAt: 1,
  }));
});

test('密码策略：>=8 位且含字母与数字', () => {
  assert.equal(passwordPolicyError('admin'), '密码至少 8 位');
  assert.equal(passwordPolicyError('abcdefgh'), '密码必须包含数字');
  assert.equal(passwordPolicyError('12345678'), '密码必须包含字母');
  assert.equal(passwordPolicyError('abcd1234'), null);
});

test('色相族归类：中性色不计入，彩色归到 30 度区间', () => {
  assert.equal(hueFamily('#0F1115'), null);
  assert.equal(hueFamily('#FFFFFF'), null);
  assert.equal(hueFamily('#8A8F99'), null);
  assert.equal(hueFamily('#6D4AFF'), hueFamily('#5A38E6'));
  assert.notEqual(hueFamily('#FF7A1A'), hueFamily('#6D4AFF'));
});

test('字号阶梯校验', () => {
  assert.equal(isOnFontLadder(14), true);
  assert.equal(isOnFontLadder(56), true);
  assert.equal(isOnFontLadder(15), false);
});

test('lintOk 仅在无 error 时为真', () => {
  assert.equal(lintOk([]).ok, true);
  assert.equal(lintOk([{ rule: 'r', severity: 'warning', message: 'm' }]).ok, true);
  assert.equal(lintOk([{ rule: 'r', severity: 'error', message: 'm' }]).ok, false);
});

/* ---------------- 费用按币种分桶 ---------------- */

test('同一币种的费用桶会相加，零额桶被丢掉', () => {
  assert.deepEqual(
    mergeCostBuckets([
      { currency: 'CNY', amount: 0.1 },
      { currency: 'CNY', amount: 0.2 },
      { currency: 'USD', amount: 0 },
    ]),
    [{ currency: 'CNY', amount: 0.3 }],
  );
});

test('不同币种各成一桶，绝不相加', () => {
  const merged = mergeCostBuckets([
    { currency: 'CNY', amount: 0.32 },
    { currency: 'USD', amount: 0.08 },
  ]);
  assert.equal(merged.length, 2);
  // 金额大的排前面，便于一眼看到主要开销在哪
  assert.equal(merged[0]!.currency, 'CNY');
  assert.equal(merged[1]!.currency, 'USD');
});

test('费用文案按币种选符号，空账不写成 ¥0', () => {
  assert.equal(formatAmount(0.32, 'CNY'), '¥0.3200');
  assert.equal(formatAmount(0.08, 'USD'), '$0.0800');
  // 未知币种不猜符号，用代码前缀，免得把别的钱标成人民币
  assert.equal(formatAmount(1, 'JPY'), 'JPY 1.0000');
  assert.equal(formatCostBuckets([]), '未产生费用');
  assert.equal(formatCostBuckets([{ currency: 'CNY', amount: 0 }], '—'), '—');
  assert.equal(
    formatCostBuckets([{ currency: 'USD', amount: 0.08 }, { currency: 'CNY', amount: 0.32 }]),
    '¥0.3200 + $0.0800',
  );
});

test('auto 与 stagger 是模式，白名单校验要跳过它们', () => {
  assert.equal(DEFAULT_MOTION.enter, 'auto');
  assert.equal(isMotionMode('auto'), true);
  assert.equal(isMotionMode('stagger'), true);
  // 具体动效不是模式，仍要按白名单校验
  for (const name of ['none', 'fade', 'fadeUp', 'slideLeft', 'scaleIn'] as const) {
    assert.equal(isMotionMode(name), false, `${name} 不该被当成模式`);
  }
  // 枚举里必须真的有这两项，否则 isMotionMode 是拿字符串硬比
  assert.ok((MotionName.options as readonly string[]).includes('auto'));
  assert.ok((MotionName.options as readonly string[]).includes('stagger'));
});

/**
 * `pageTextOf` 是「换排版 / 转图文页时该保留哪些字」的唯一判据。
 *
 * 两个方向都要守：**看得见的字一条不能漏**（漏了就是用户说的「转完之后字没了」），
 * **看不见的字一条不能混进来**——图片的 `prompt` 是给生图模型看的，页面上根本不出现，
 * 混进去模型会把它当正文写出来。
 */
test('pageTextOf 只取页面上看得见的字，按阅读顺序', () => {
  const p = PageIR.parse({
    pageId: 'pt1',
    pageType: 'text',
    layoutVariant: 'text/one-column@v1',
    title: { eyebrow: '第三章', main: '交付方式的变化', sub: '从卖产品到卖结果' },
    blocks: [
      { id: 'a', type: 'paragraph', text: '正文第一段' },
      { id: 'b', type: 'bullets', items: ['要点一', '要点二'], icons: [] },
      { id: 'c', type: 'image', source: 'ai', prompt: '不该出现的生图提示词', caption: '图注' },
      { id: 'd', type: 'metric', value: '210%', label: '增长率' },
    ],
  });

  assert.deepEqual(pageTextOf(p), {
    eyebrow: '第三章',
    main: '交付方式的变化',
    sub: '从卖产品到卖结果',
    lines: ['正文第一段', '要点一', '要点二', '图注', '210% 增长率'],
  });
  assert.equal(pageTextOf(p).lines.includes('不该出现的生图提示词'), false, '生图提示词不是页面上的字');
});

test('pageTextOf 跳过空白，不产出空串', () => {
  const p = PageIR.parse({
    pageId: 'pt2',
    pageType: 'text',
    layoutVariant: 'text/one-column@v1',
    title: { main: '标题', sub: '   ' },
    blocks: [
      { id: 'a', type: 'paragraph', text: '  ' },
      { id: 'b', type: 'bullets', items: ['', '有字'], icons: [] },
    ],
  });
  assert.deepEqual(pageTextOf(p), { eyebrow: '', main: '标题', sub: '', lines: ['有字'] });
});
