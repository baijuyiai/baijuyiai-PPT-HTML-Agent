/**
 * 批量识别版式骨架的公共骨架。
 *
 * ## 为什么要抽出来
 *
 * 「从一批参考图里认出若干份版式、落缓存、再生成骨架文件」这套流程，
 * 人物排版与图文排版**逐字相同**：参数解析、缓存键、跑批、花费统计、报告、
 * 写 TS 文件。两边各抄一遍就是两百行重复，而其中「缓存键要缀哈希」
 * 「没缓存要报出来」这类坑，抄的时候漏一条就会静默丢版式。
 *
 * 所以这里只留**与版式种类无关**的那部分。三样东西仍然各自实现：
 * 提示词、校验规则（`accept`）、产出形状（`emit`）——它们才是两个库真正不同的地方。
 *
 * ## import 走相对路径
 *
 * 根 package.json 里没有这些工作区包，裸包名解析不到（`ERR_MODULE_NOT_FOUND`）。
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { billedGateway } from '../../packages/server-core/src/services/billed-gateway.ts';
import { parseModelJson } from '../../packages/server-core/src/lib/model-reply.ts';
import { usageSummary } from '../../packages/server-core/src/services/usage.service.ts';
import { mapLimit } from '../../packages/server-core/src/lib/concurrency.ts';
import { get } from '../../packages/server-core/src/db/client.ts';
import { imageSlotNumbers } from '../../packages/ir-schema/src/index.ts';

export const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** 模型给的原始草稿。**字段全是 string**——模型什么都可能回，收成能用的那份是 `accept` 的事 */
export interface Draft {
  name: string;
  slug: string;
  brief: string;
  group: string;
  skeleton: string;
}

export interface Skeleton {
  name: string;
  slug: string;
  brief: string;
  group: string;
  skeleton: string;
  /** 图位数。由服务端从骨架里数出来，不采信模型自报 */
  slots: number;
  /** 剥掉了几处 `font-family`。提示词要是失效了，从这个数看得出来 */
  stripped: number;
}

export interface ImageResult {
  image: string;
  layouts: Skeleton[];
  /** 被丢弃的（两次都没过校验），带上原因 */
  dropped: { name: string; issues: string[] }[];
  calls: number;
}

export interface RecognitionConfig {
  /** 参考图目录 */
  dir: string;
  /** 缓存目录的绝对路径 */
  cacheDir: string;
  /** 发给模型的那段话（图之外的部分）。重试时会在这后面追加问题清单 */
  ask: string;
  system: string;
  /**
   * 把一份草稿收成骨架。不合规返回问题清单。
   *
   * `slots` 由调用方用 `imageSlotNumbers(html).length` 数出来——**不采信模型自报**，
   * 候选规则按它筛，报错了会静默放一个填不满的版式进来。
   */
  accept: (d: Draft, fallbackSlug: string) => Skeleton | string[];
  /** 生成骨架文件。收到的是**去重之后**的全集 */
  emit: (all: Skeleton[]) => void;
  /** 默认目录提示里显示的名字，如「人物排版」 */
  label: string;
}

/* ---------------- 参数 ---------------- */

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? undefined : process.argv[i + 1];
}
export const flag = (name: string) => process.argv.includes(`--${name}`);

export const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/** 汉字。骨架的占位文案一律英文，出现汉字就判不合规 */
export const CJK_RE = /[一-鿿]/;

/**
 * 认哪些图。
 *
 * **别只认 jpg。** 早先这里写的是 `\.jpe?g$`，因为人物 / 图文那两批参考图全是花瓣导出的 jpg。
 * 界面排版那批 36 张里有 28 张是 png，照旧写法会**只跑 8 张、其余 28 张一声不响地不进库**——
 * 报告上「成功 8 张」看着完全正常。宁可多认一种扩展名。
 */
const IMAGE_EXT_RE = /\.(jpe?g|png|webp)$/i;

/** data URL 的 MIME 要跟着扩展名走。标错的话有些网关会直接拒掉整张图 */
function mimeOf(file: string): string {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

/**
 * 一张图对应哪个缓存文件。
 *
 * **必须在可读的 slug 后面缀一段文件名的哈希**。`slugify` 会把中文整段剥掉，
 * 而小红书导出的图名是「标题_序号_作者_来自小红书网页版」——标题与作者全是中文，
 * 于是只剩下序号：`..._2_木子李...`、`..._2_潘多拉...`、`..._2_魏玛...` 全落到 `2.json`。
 * 实测 50 张图里 14 张这样撞在一起，**后跑完的那张把前面的结果覆盖掉**，
 * 而且两边都报「成功」——库里凭空少了十四张图的版式，日志上一个字都看不出来。
 */
export function cacheKeyOf(file: string): string {
  const base = slugify(file.replace(IMAGE_EXT_RE, '')) || 'img';
  const hash = createHash('sha1').update(file).digest('hex').slice(0, 8);
  return `${base}-${hash}`;
}

/**
 * 剥掉骨架里写死的 `font-family`，返回剥了几处。**`var(--font-*)` 引用留着不动。**
 *
 * 提示词里明说了只许写 `var(--font-sans/display/script)`，但模型——尤其是根 `<div>` 的
 * 内联样式那一处——仍会漏。留着它后果很实在：内联样式压得过注入的
 * `body{font-family:var(--font-sans)}`，这套风格的字体被**整条盖掉**，换风格它也不跟着变。
 * 和写死 hex 是同一类错。
 *
 * **剥而不是丢**：剥掉只是回落到继承，版式一个字不动；丢掉是白花一次识别的钱。
 * 剥掉几处会记进报告——提示词要是哪天失效了，从那个数字看得出来。
 *
 * 前面那个字符（`;` 或内联样式开头的 `"`）要**原样留着**，
 * 否则会把属性粘坏（`style="width:1920px` 变成 `style="width:1920px` 少了引号那种）。
 */
export function stripFontFamily(s: string): { html: string; stripped: number } {
  let stripped = 0;
  const html = s.replace(
    /(^|[;{\s"'])font-family\s*:\s*(?!var\(--font-)[^;}"']+;?/gi,
    (_m, pre: string) => {
      stripped += 1;
      return pre;
    },
  );
  return { html, stripped };
}

/**
 * 把「斜切容器把里面的照片一起带斜」这个毛病补回来。返回补了几处。
 *
 * ## 为什么要修
 *
 * 参考图里那几份斜切版式（「斜带四人并置」「四柱斜切错落」），设计稿上是**整块斜切**的：
 * 框斜、人也跟着斜，整张图就是一个斜的构图。模型照抄了 `transform:skewX(-9deg)` 写在
 * 容器上，图片是容器的后代，于是**人被剪切变形**——脸是歪的、肩膀是斜的。
 *
 * 设计稿那样做成立是因为它整张图都斜；搬进骨架里，一页里只有这一块斜、其余全正，
 * 那个歪掉的人就格外刺眼。用户的原话：「不要人物看起来倾斜」。
 *
 * ## 怎么修
 *
 * 容器保持斜切（「斜窗口」这个形状是这份版式的全部特征，不能丢），**把反向的斜切补到
 * 里面的图片上**：两个斜切在同一个中心点相消，照片回正，裁剪窗口仍是那个斜四边形。
 *
 * 只在容器同时写了 `overflow:hidden` 时动手。有裁切才是「斜窗口」；没有裁切时斜切
 * 多半是整个元素的倾斜造型，照片跟着斜就是设计的一部分，不该动。
 *
 * 图片自己已经写了 `transform` 的一律跳过——那可能是刻意的（比如图里本来就带一点
 * 旋转），硬叠一个反向斜切会把它的原意改掉。
 */
export function unskewImagesInSkewedFrames(s: string): { html: string; fixed: number } {
  let fixed = 0;

  const html = s.replace(/<style([^>]*)>([\s\S]*?)<\/style>/gi, (whole, attrs: string, css: string) => {
    /** 类名 → 斜切角度。只收「斜切 + 裁切」这一种容器 */
    const skew = new Map<string, number>();
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sel = (rule[1] ?? '').trim();
      const body = rule[2] ?? '';
      if (!/\boverflow\s*:\s*hidden/i.test(body)) continue;
      const m = /\bskewX\(\s*(-?[\d.]+)deg\s*\)/i.exec(body);
      if (!m) continue;
      const angle = Number(m[1]);
      if (!Number.isFinite(angle) || angle === 0) continue;
      // 只认最简单的类选择器，与 `objectFitByClass` 同一条口径
      const cls = /^\.([\w-]+)$/.exec(sel)?.[1];
      if (cls) skew.set(cls.toLowerCase(), angle);
    }
    if (skew.size === 0) return whole;

    let next = css.replace(/([^{}]+)\{([^{}]*)\}/g, (rule, selRaw: string, body: string) => {
      const m = /^\.([\w-]+)\s*(?:>\s*)?img$/i.exec(selRaw.trim());
      const angle = m ? skew.get(m[1]!.toLowerCase()) : undefined;
      if (angle === undefined) return rule;
      if (/\btransform\s*:/i.test(body)) return rule;
      fixed += 1;
      return `${selRaw}{${body.replace(/;\s*$/, '')};transform:skewX(${-angle}deg)}`;
    });

    /*
      容器有斜切、却没写 `.{cls} img` 规则时补一条。补之前先确认这个类真用在了 HTML 里，
      否则会给一份用不到的类平白加几行 CSS。
    */
    for (const [cls, angle] of skew) {
      if (new RegExp(`\\.${cls}\\s*(?:>\\s*)?img\\s*\\{`, 'i').test(next)) continue;
      if (!new RegExp(`class\\s*=\\s*"[^"]*\\b${cls}\\b`, 'i').test(whole)) continue;
      fixed += 1;
      next += `.${cls} img{transform:skewX(${-angle}deg)}`;
    }

    return `<style${attrs}>${next}</style>`;
  });

  return { html, fixed };
}

function readLayouts(raw: string): Draft[] | null {
  const parsed = parseModelJson<{ layouts?: unknown }>(raw);
  if (!parsed || !Array.isArray(parsed.layouts)) return null;
  return parsed.layouts.flatMap((l) => {
    if (typeof l !== 'object' || l === null) return [];
    const o = l as Record<string, unknown>;
    return [{
      name: typeof o.name === 'string' ? o.name.trim() : '',
      slug: typeof o.slug === 'string' ? slugify(o.slug) : '',
      brief: typeof o.brief === 'string' ? o.brief.trim() : '',
      group: typeof o.group === 'string' ? o.group.trim() : '',
      skeleton: typeof o.skeleton === 'string' ? o.skeleton.trim() : '',
    }];
  });
}

/** 重试时追加的一段。把上一版的具体问题原样报回去，比让它自己猜有效得多 */
const RETRY_HEAD = ['', '---', '', '你上一版有下面这些问题，**请重写一版，逐条改掉**：'].join('\n');

/** 去重指纹：分组 + 图位数 + class 集合 + 关键 CSS 值。近似的靠人工再过一遍 */
export function fingerprint(s: Skeleton): string {
  const classes = [...new Set(s.skeleton.match(/class="([^"]*)"/g) ?? [])].sort().join('|');
  const cssValues = (s.skeleton.match(/:\s*[^;{}]+;/g) ?? []).map((v) => v.trim()).sort().join('');
  let h = 0;
  const key = `${s.group}|${s.slots}|${classes}|${cssValues}`;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) | 0;
  return `${s.group}-${s.slots}-${h}`;
}

/** 把骨架写进 TS 源码。反引号与 `${` 必须转义，否则模板字符串会被撕开 */
export const asTemplate = (s: string) =>
  s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');

/** 按指纹去重，顺序保持不变 */
export function dedupe(all: Skeleton[]): Skeleton[] {
  const seen = new Set<string>();
  const unique: Skeleton[] = [];
  for (const s of all) {
    const fp = fingerprint(s);
    if (seen.has(fp)) continue;
    seen.add(fp);
    unique.push(s);
  }
  return unique;
}

/* ---------------- 主流程 ---------------- */

async function recognizeOne(
  cfg: RecognitionConfig,
  gateway: ReturnType<typeof billedGateway>,
  file: string,
): Promise<ImageResult> {
  const dataUrl = `data:${mimeOf(file)};base64,${readFileSync(path.join(cfg.dir, file)).toString('base64')}`;

  const layouts: Skeleton[] = [];
  const dropped: { name: string; issues: string[] }[] = [];
  let calls = 0;
  let problems: string[] = [];

  for (let attempt = 0; attempt < 2; attempt += 1) {
    calls += 1;
    const content = problems.length > 0
      ? `${cfg.ask}\n${RETRY_HEAD}\n${problems.map((p) => `- ${p}`).join('\n')}\n\n**只重发有问题的那几份**，没问题的照原样再给一遍。`
      : cfg.ask;

    const res = await gateway.text({
      taskType: 'style_recognize',
      json: true,
      // 一次最多认八份、每份一两千 token，还要留推演的余量
      maxTokens: 32000,
      temperature: 0.3,
      system: cfg.system,
      messages: [{ role: 'user', content, images: [dataUrl] }],
    });

    const drafts = readLayouts(res.text);
    if (!drafts) {
      // 拿不到 JSON 多半是被截断了（括号不闭合）。降级要求：只输出最重要的一份
      problems = ['你上一次的回复不是可解析的 JSON（多半是被截断了）。请**只输出图里最主要的那一份版式**，并且把 CSS 写紧凑。'];
      continue;
    }

    problems = [];
    for (const [i, d] of drafts.entries()) {
      const r = cfg.accept(d, `layout-${i + 1}`);
      if (Array.isArray(r)) {
        dropped.push({ name: d.name || `第 ${i + 1} 份`, issues: r });
        problems.push(`第 ${i + 1} 份「${d.name || '未命名'}」：${r.join('；')}`);
      } else if (!layouts.some((l) => l.name === r.name)) {
        layouts.push(r);
      }
    }
    // 这一轮全过就不再来一次
    if (problems.length === 0) break;
    // 第二轮之后仍然有问题的，就真的丢掉（`dropped` 里已经记了）
    if (attempt === 1) break;
  }

  // 两轮都没救回来的，从 dropped 里剔掉已经在 layouts 里的
  const finalDropped = dropped.filter((d) => !layouts.some((l) => l.name === d.name));
  return { image: file, layouts, dropped: finalDropped, calls };
}

export async function runRecognition(cfg: RecognitionConfig): Promise<void> {
  const ONLY = arg('only')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
  const LIMIT = Number(arg('limit') ?? 0);
  const CONCURRENCY = Number(arg('concurrency') ?? 3);
  const FRESH = flag('fresh');
  const EMIT = flag('emit');
  const SCRIPT = path.relative(ROOT, process.argv[1] ?? '');

  const files = readdirSync(cfg.dir).filter((f) => IMAGE_EXT_RE.test(f)).sort();
  let targets = ONLY ? files.filter((f) => ONLY.some((k) => f.includes(k))) : files;
  if (LIMIT > 0) targets = targets.slice(0, LIMIT);
  if (targets.length === 0) {
    console.error(`没有匹配到任何图片。目录：${cfg.dir}`);
    process.exit(1);
  }

  mkdirSync(cfg.cacheDir, { recursive: true });
  const cacheOf = (file: string) => path.join(cfg.cacheDir, `${cacheKeyOf(file)}.json`);

  if (EMIT) {
    const all: Skeleton[] = [];
    const missing: string[] = [];
    for (const f of files) {
      const cache = cacheOf(f);
      if (!existsSync(cache)) { missing.push(f); continue; }
      all.push(...(JSON.parse(readFileSync(cache, 'utf8')) as ImageResult).layouts);
    }
    /*
      **没缓存要报出来，不能静默跳过。** 这里少读一张图，库里就凭空少几份版式，
      而生成时看不出来——只会觉得「怎么老是这几个版式」。之前缓存文件名撞了 14 张，
      就是这么无声无息丢掉的。
    */
    if (missing.length > 0) {
      console.log(`\n有 ${missing.length} 张图没有缓存（生成出来的骨架里不含它们）：`);
      for (const f of missing.slice(0, 10)) console.log(`  ${f}`);
      if (missing.length > 10) console.log(`  ... 另有 ${missing.length - 10} 张`);
    }
    if (all.length === 0) throw new Error('缓存里一份骨架都没有，先跑识别');
    cfg.emit(dedupe(all));
    process.exit(0);
  }

  const admin = get<{ userId: string; tenantId: string }>(
    "SELECT userId, tenantId FROM users WHERE role = 'admin' ORDER BY createdAt ASC LIMIT 1",
  );
  if (!admin) throw new Error('库里没有管理员账号，先跑 pnpm seed');
  const gateway = billedGateway(admin.tenantId, admin.userId);

  console.log(`【${cfg.label}】目录：${cfg.dir}`);
  console.log(`要跑 ${targets.length} 张，并发 ${CONCURRENCY}${FRESH ? '，--fresh 全部重跑' : '，已有缓存的跳过'}\n`);

  let ok = 0;
  let failed = 0;
  let produced = 0;
  let droppedCount = 0;
  let strippedCount = 0;

  /** 只统计这一轮的花费：`usageSummary` 不传 `from` 会把租户历史上所有调用都算进来 */
  const startedAt = Date.now();

  for await (const r of mapLimit(targets, CONCURRENCY, async (file): Promise<{ file: string; result: ImageResult | null; fromCache: boolean; error?: string }> => {
    const cache = cacheOf(file);
    if (!FRESH && existsSync(cache)) {
      return { file, result: JSON.parse(readFileSync(cache, 'utf8')) as ImageResult, fromCache: true };
    }
    try {
      const result = await recognizeOne(cfg, gateway, file);
      writeFileSync(cache, JSON.stringify(result, null, 2), 'utf8');
      return { file, result, fromCache: false };
    } catch (e) {
      return { file, result: null, fromCache: false, error: e instanceof Error ? e.message : String(e) };
    }
  })) {
    if (!r) continue;
    if (!r.result) {
      failed += 1;
      console.log(`失败 ${r.file}\n    ${r.error}`);
      continue;
    }
    const tag = r.fromCache ? '（缓存）' : '';
    droppedCount += r.result.dropped.length;
    const stripped = r.result.layouts.reduce((s, l) => s + l.stripped, 0);
    strippedCount += stripped;
    if (r.result.layouts.length === 0) {
      failed += 1;
      console.log(`失败 ${r.file}${tag}：一份都没认出来`);
      for (const d of r.result.dropped) console.log(`    丢掉 ${d.name}：${d.issues.join('；')}`);
      continue;
    }
    ok += 1;
    produced += r.result.layouts.length;
    console.log(`好了 ${r.file}${tag}：${r.result.layouts.length} 份`
      + (r.result.dropped.length > 0 ? `，丢弃 ${r.result.dropped.length} 份` : '')
      + (stripped > 0 ? `，剥掉 ${stripped} 处 font-family` : '')
      + `  [${r.result.layouts.map((l) => l.group).join('/')}]`);
    for (const d of r.result.dropped) console.log(`    丢掉 ${d.name}：${d.issues.join('；')}`);
  }

  const usage = usageSummary({ tenantId: admin.tenantId, from: startedAt });
  writeFileSync(path.join(cfg.cacheDir, 'report.json'), JSON.stringify({
    dir: cfg.dir,
    images: targets.length,
    ok, failed,
    layouts: produced,
    dropped: droppedCount,
    strippedFontFamily: strippedCount,
    calls: usage.calls,
    tokens: usage.tokens,
    costs: usage.costs,
  }, null, 2), 'utf8');

  console.log(`\n成功 ${ok} 张（${produced} 份骨架，丢弃 ${droppedCount} 份），失败 ${failed} 张。`);
  if (strippedCount > 0) {
    console.log(`剥掉 ${strippedCount} 处 font-family——提示词里明说了不许写，这个数不该长期大于 0。`);
  }
  console.log(`模型调用 ${usage.calls} 次，${usage.tokens} token，花费 ${usage.costs.map((c) => `${c.currency} ${c.amount.toFixed(3)}`).join(' + ') || '（供应商没配价格）'}`);
  console.log(`\n接下来：\n  1. 人工过一遍缓存里的骨架（竖版有没有真的重排成横版）\n  2. node --import tsx ${SCRIPT} --emit`);
  // 用 exitCode 而不是 process.exit()：后者会在 db 句柄还没关的时候就掐断进程，
  // Windows 上会冒一条 libuv 的 assertion，看着像脚本崩了
  process.exitCode = failed > 0 ? 1 : 0;
}
