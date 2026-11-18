#!/usr/bin/env node
/**
 * 端到端冒烟测试。
 *
 * 直接打真实的 HTTP 接口，覆盖 PRD 的主链路：
 *   健康检查 → 登录 → 建项目 → 流式生成（SSE）→ 页就绪 → 导出 PPTX → 下载产物 → 分享链接 → 访客只读
 *
 * 需要先启动 API（pnpm dev 或 pnpm dev:api），并跑过 pnpm seed。
 * 用法：
 *   pnpm smoke
 *   LUMEN_SMOKE_BASE=http://localhost:8787 LUMEN_SMOKE_USER=demo LUMEN_SMOKE_PASSWORD=demo1234 pnpm smoke
 *
 * 退出码 0 表示全部通过；任一环节失败会打印失败原因并以 1 退出。
 */

const BASE = process.env.LUMEN_SMOKE_BASE ?? 'http://localhost:8787';
const USER = process.env.LUMEN_SMOKE_USER ?? 'demo';
const PASSWORD = process.env.LUMEN_SMOKE_PASSWORD ?? 'demo1234';

/** 导出是后台任务，给足时间：无头渲染 PPTX 在慢机器上可能要一两分钟 */
const EXPORT_TIMEOUT_MS = Number(process.env.LUMEN_SMOKE_EXPORT_TIMEOUT ?? 5 * 60 * 1000);

/**
 * 要验证的导出格式。默认只跑 pptx（最快且覆盖了「无头渲染 → 对象存储 → 下载」全链路）。
 * 想全量验证就设 LUMEN_SMOKE_FORMATS=pdf,pptx,html,pptx-editable
 */
const FORMATS = (process.env.LUMEN_SMOKE_FORMATS ?? 'pptx')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** 各格式产物的文件头魔数，用于确认拿到的是真文件而不是错误页 */
const MAGIC = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  pptx: [0x50, 0x4b, 0x03, 0x04], // zip
  'pptx-editable': [0x50, 0x4b, 0x03, 0x04],
  html: [0x3c, 0x21, 0x44, 0x4f], // <!DO
  mp4: [0x00, 0x00, 0x00],
};

let accessToken = '';
let passed = 0;
const failures = [];

function step(name, detail) {
  passed += 1;
  console.log(`  通过  ${name}${detail ? `  ${detail}` : ''}`);
}

function fail(name, detail) {
  failures.push(`${name}：${detail}`);
  console.log(`  失败  ${name}  ${detail}`);
}

/** 断言辅助：不抛异常，只登记结果，这样一次运行能看全所有问题 */
function expect(name, condition, detail) {
  if (condition) step(name, detail);
  else fail(name, detail ?? '条件不成立');
}

async function call(path, init = {}) {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json');
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  const res = await fetch(BASE + path, { ...init, headers });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 400) };
  }
  return { status: res.status, ok: res.ok, body, headers: res.headers };
}

function data(res) {
  return res.body?.data;
}

function errText(res) {
  return res.body?.error?.message ?? res.body?.raw ?? `HTTP ${res.status}`;
}

async function pollUntil(fn, done, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await fn();
    if (done(value)) return value;
    if (Date.now() > deadline) throw new Error(`${label} 超时（${Math.round(timeoutMs / 1000)}s）`);
    await new Promise((r) => setTimeout(r, 1200));
  }
}

/** 手写 SSE 读取：EventSource 无法带 Authorization 头 */
async function readSse(path) {
  const headers = new Headers({ accept: 'text/event-stream' });
  if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
  const res = await fetch(BASE + path, { headers });
  if (!res.ok || !res.body) throw new Error(`事件流连接失败（HTTP ${res.status}）`);

  const events = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx = buffer.indexOf('\n\n');
    while (idx >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = 'message';
      const dataLines = [];
      for (const line of chunk.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length > 0) {
        try {
          events.push({ event, data: JSON.parse(dataLines.join('\n')) });
        } catch {
          events.push({ event, data: dataLines.join('\n') });
        }
      }
      idx = buffer.indexOf('\n\n');
    }
  }
  return events;
}

const BRIEF = [
  '1. 市场现状',
  '过去三年，企业级演示工具市场增长了 210%，在线协作类产品占比从 12% 提升到 34%。',
  '传统本地软件的市场份额持续萎缩，2024 年同比下降 18%，客户续费率从 82% 降到 61%。',
  '',
  '2. 核心痛点',
  '- 风格一次性，页间漂移严重',
  '- 只生成不可精修，返工成本高',
  '- 生成与演示割裂，链路不完整',
  '',
  '3. 我们的方案',
  '我们提供从想法到成品的全链路能力，首年目标覆盖 3000 家企业客户，预期营收 1.2 亿元。',
  '试点客户的平均制作时长从 6 小时下降到 40 分钟，效率提升 9 倍，返工率下降 73%。',
].join('\n');

async function main() {
  console.log(`冒烟目标：${BASE}`);
  console.log(`登录账号：${USER}\n`);

  /* ---- 1. 健康检查 ---- */
  const health = await call('/api/health');
  expect('API 健康检查', health.ok && data(health)?.status === 'up', errText(health));

  /* ---- 2. 登录 ---- */
  const login = await call('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ login: USER, password: PASSWORD }),
  });
  if (!login.ok) {
    fail('登录', errText(login));
    console.log('\n提示：先跑 pnpm seed 创建演示账号，或设置 LUMEN_SMOKE_USER / LUMEN_SMOKE_PASSWORD');
    return;
  }
  accessToken = data(login).accessToken;
  step('登录', `用户 ${data(login).user.username}`);
  if (data(login).user.mustChangePassword) {
    console.log('  注意  该账号要求首次改密，后续接口可能被拦截');
  }

  /* ---- 3. 创建项目 ---- */
  const created = await call('/api/projects', {
    method: 'POST',
    body: JSON.stringify({
      title: `冒烟项目 ${new Date().toISOString().slice(0, 19)}`,
      brief: BRIEF,
      audienceTag: 'executive',
      scene: 'review',
    }),
  });
  if (!created.ok) {
    fail('创建项目', errText(created));
    return;
  }
  const projectId = data(created).projectId;
  step('创建项目', projectId);

  /* ---- 4. 流式生成 ---- */
  let events;
  try {
    events = await readSse(`/api/projects/${projectId}/generate/stream`);
  } catch (err) {
    fail('流式生成', err instanceof Error ? err.message : String(err));
    return;
  }
  const kinds = new Set(events.map((e) => e.event));
  expect('事件流包含 style / outline', kinds.has('style') && kinds.has('outline'));
  expect('事件流以 done 收尾', events.at(-1)?.event === 'done');

  const ready = events.filter((e) => e.event === 'page-ready');
  const failedPages = events.filter((e) => e.event === 'page-failed');
  expect('逐页生成无失败', failedPages.length === 0,
    failedPages.length > 0 ? failedPages.map((e) => `第${e.data.index + 1}页 ${e.data.error}`).join('; ') : `${ready.length} 页就绪`);
  expect('至少生成 3 页', ready.length >= 3, `实际 ${ready.length} 页`);

  const doneEvt = events.findLast((e) => e.event === 'done');
  if (doneEvt) {
    expect('done 事件统计与就绪页数一致', doneEvt.data.succeeded === ready.length,
      `succeeded=${doneEvt.data.succeeded} ready=${ready.length}`);
  }

  /* ---- 5. 页面落库且序号连续 ---- */
  const pagesRes = await call(`/api/projects/${projectId}/pages`);
  const pages = data(pagesRes)?.items ?? data(pagesRes) ?? [];
  const list = Array.isArray(pages) ? pages : (pages.pages ?? []);
  expect('页面已落库', list.length >= 3, `${list.length} 页`);
  const indexes = list.map((p) => p.pageIndex ?? p.index);
  expect('页面序号连续无空洞',
    indexes.every((v, i) => v === i),
    `序号 ${indexes.join(',')}`);
  expect('每页都有合法版式', list.every((p) => Boolean((p.page ?? p.ir)?.layoutVariant)));

  /* ---- 6. 导出并下载产物 ---- */
  for (const format of FORMATS) {
    const exportRes = await call('/api/exports', {
      method: 'POST',
      body: JSON.stringify({ projectId, format }),
    });
    if (!exportRes.ok) {
      fail(`发起导出（${format}）`, errText(exportRes));
      continue;
    }
    const exportId = data(exportRes).exportId;
    step(`发起导出（${format}）`, exportId);

    let job;
    try {
      job = await pollUntil(
        async () => data(await call(`/api/exports/job/${exportId}`)),
        (j) => j.status === 'succeeded' || j.status === 'failed',
        EXPORT_TIMEOUT_MS,
        `${format} 导出`,
      );
    } catch (err) {
      fail(`导出（${format}）`, err instanceof Error ? err.message : String(err));
      continue;
    }

    if (job.status !== 'succeeded') {
      fail(`导出（${format}）`, job.error || job.status);
      continue;
    }
    step(`导出成功（${format}）`, `${job.pageCount} 页`);
    expect(`导出返回可下载地址（${format}）`, Boolean(job.artifactUrl), job.artifactUrl);

    if (!job.artifactUrl) continue;
    const url = job.artifactUrl.startsWith('http') ? job.artifactUrl : BASE + job.artifactUrl;
    const dl = await fetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
    const buf = await dl.arrayBuffer();
    expect(`产物可下载且非空（${format}）`, dl.ok && buf.byteLength > 0,
      `HTTP ${dl.status} / ${buf.byteLength} 字节`);

    const expected = MAGIC[format];
    const head = Array.from(new Uint8Array(buf.slice(0, expected.length)));
    expect(`产物是合法文件（${format}）`,
      head.every((b, i) => b === expected[i]),
      `头部 ${head.map((b) => b.toString(16).padStart(2, '0')).join(' ')}`);
  }

  /* ---- 7. 分享链接与访客只读 ---- */
  const shareRes = await call('/api/shares', {
    method: 'POST',
    body: JSON.stringify({ projectId, ttlDays: 7 }),
  });
  if (!shareRes.ok) {
    fail('创建分享链接', errText(shareRes));
  } else {
    const token = data(shareRes).token;
    step('创建分享链接', token);

    // 访客视角：不带 Authorization，只靠 token
    const saved = accessToken;
    accessToken = '';
    const publicRes = await call(`/api/present/${token}`);
    accessToken = saved;
    expect('分享链接匿名可读', publicRes.ok, errText(publicRes));
    const publicPages = data(publicRes)?.pages ?? [];
    expect('分享页数与原项目一致', publicPages.length === list.length,
      `分享 ${publicPages.length} 页 / 项目 ${list.length} 页`);

    // 已撤销的链接必须立即失效
    const revoked = await call(`/api/shares/${data(shareRes).shareId}`, { method: 'DELETE' });
    expect('分享链接可撤销', revoked.ok, errText(revoked));
    const afterRevoke = await call(`/api/present/${token}`);
    expect('撤销后立即不可读', afterRevoke.status >= 400, `HTTP ${afterRevoke.status}`);
  }

  /* ---- 8. 清理 ---- */
  const removed = await call(`/api/projects/${projectId}`, { method: 'DELETE' });
  expect('冒烟项目已清理', removed.ok, errText(removed));
}

main()
  .catch((err) => {
    console.error('\n冒烟测试异常终止：', err instanceof Error ? err.stack : err);
    failures.push(`未捕获异常：${err instanceof Error ? err.message : String(err)}`);
  })
  .finally(() => {
    console.log(`\n结果：${passed} 项通过，${failures.length} 项失败`);
    if (failures.length > 0) {
      console.log('失败明细：');
      for (const f of failures) console.log(`  - ${f}`);
      process.exitCode = 1;
    }
  });
