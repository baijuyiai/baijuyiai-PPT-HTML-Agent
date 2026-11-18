import { z } from 'zod';
import { isMockPlaceholder, type ProviderGateway } from '@lumen/provider-gateway';
import { createStorage, mimeOfName } from '@lumen/storage';
import { invalid, notConfigured, providerError } from '../lib/errors.js';
import { updateProject, requireProject } from './project.service.js';
import { billedGateway } from './billed-gateway.js';

/** 重绘稿的体积上限。一页 logo 用不着几十 KB，超了多半是模型把整张图描成了逐像素路径 */
const MAX_SVG_BYTES = 40 * 1024;

/**
 * 拒绝清单：明显不该出现在 logo 里的东西。
 *
 * **这不是安全边界，别再往里加规则指望它挡住攻击。** 安全边界是「这份稿只会以
 * `<img src="data:image/svg+xml,…">` 的形态出现，永远不会内联进页面」——
 * 见 `packages/ir-schema/src/html-doc.ts` 的 `colorizeSvg`，那里记着为什么内联不行。
 *
 * 为什么正则挡不住：它看的是**原文**，浏览器看的是**重新解析后**的结果，中间隔着
 * 实体解码、空白规范化、CSS 转义一整层。实测跑通过的原样放行（全部逐字节落库）：
 *
 * - `<img src="http&#58;//169.254.169.254/…">` —— `&#58;` 解出来才是冒号；
 * - `<desc><iframe src="javascript:…"></iframe></desc>` —— `<desc>` 是 HTML 集成点；
 * - `<svg style="background:\75 rl(…)">` —— `\75 rl(` 是 `url(` 的 CSS 转义写法。
 *
 * 所以这份清单只做两件事：**挡住老实的模型输出**（它才是 99% 的情况），
 * 以及**在明显有毒时给出一个人能看懂的错误**，而不是让一段怪东西静默落库。
 *
 * 它比页面用的 `lintMockHtml`（`packages/render-engine/src/codegen.ts:140-155`）**大体相当**：
 * 页面那套挡 `script` / `@import` / 外部 `url()` / `on*` 与 `<link rel=stylesheet`（后者这里
 * 没有对应项，但要走 `href=` 才生效、已被 `\bhref\s*=` 拦住，所以不是洞）。这里额外挡 `<style>`、
 * `<image>`、`<foreignObject>`、`<use>`、`xlink:`——logo 只需要形状属性，用不上这些。
 */
const FORBIDDEN: { re: RegExp; why: string }[] = [
  { re: /<script\b/i, why: '脚本标签' },
  { re: /<style\b/i, why: '样式块' },
  { re: /<image\b/i, why: 'SVG 图片引用' },
  { re: /<foreignObject\b/i, why: '嵌入的外部内容' },
  { re: /<use\b/i, why: '外部符号引用' },
  { re: /\bhref\s*=/i, why: '链接属性' },
  { re: /xlink:/i, why: 'xlink 命名空间' },
  { re: /\burl\s*\(/i, why: 'url() 引用' },
  { re: /@import/i, why: '@import 引入' },
  { re: /image-set\s*\(/i, why: 'image-set() 引用' },
  { re: /\bon[a-z]+\s*=/i, why: '内联事件处理器' },
  // 一个 logo 里除了 SVG 命名空间，不该出现任何 http(s) 地址
  { re: /https?:\/\/(?!www\.w3\.org\/)/i, why: '外部网址' },
];

/** 至少要有一种图形，纯文字的「重绘」等于什么都没画 */
const SHAPE = /<(path|rect|circle|ellipse|polygon|polyline|line)\b/i;

/**
 * 校验重绘稿。**不过就抛**——宁可让面板走失败态，也不能把一段来路不明的 SVG
 * 塞进每一页的页眉里。
 *
 * 它防三件事：
 * 1. **明显有毒的东西**（`<script>`、`on*=`、外部引用）——一道廉价的初筛，
 *    真正的保险是「稿只会当图片加载」。别把它当安全边界，见 `FORBIDDEN` 上面那段。
 * 2. **不是一个 SVG**（没有 `<svg>`、缺 `viewBox`）——缺 viewBox 缩放会失真，
 *    而且这种情况下模型多半是在胡说；
 * 3. **不是一页 logo 的东西**（没有任何图形、几百 KB 的逐像素路径）。
 *
 * **抛的是 `AppError`，不是裸 `Error`。** 中间件只把 `AppError` 的报文透给客户端，
 * 裸 `Error` 一律被压成「服务器内部错误」——上面这几句精心写的中文就白写了，
 * 用户看到的是「重绘失败：服务器内部错误」，真正的原因（比如「缺 viewBox」）只留在日志里。
 */
export function validateLogoSvg(svg: string): void {
  if (typeof svg !== 'string' || !/<svg\b/i.test(svg)) throw invalid('重绘结果不是一个 SVG');
  if (!/viewBox\s*=/i.test(svg)) throw invalid('重绘结果缺 viewBox，缩放会失真');

  /**
   * **安全检查排在图形检查前面。**
   *
   * 排在后面的话，一段带 `<script>` 却没画图形的 SVG 会先被「没有任何图形」拦下——
   * 结论碰巧也是拒收，但那条安全规则**一次都没被验到**：把它从 `FORBIDDEN` 里删掉，
   * 测试照样全绿。安全清单必须每条都有能单独失败的用例守着，顺序就得让它先说话。
   */
  for (const { re, why } of FORBIDDEN) {
    // 报 `why` 而不是正则源码：`\bon[a-z]+\s*=` 对用户是天书，而且会被原样打进 toast
    if (re.test(svg)) throw invalid(`重绘结果里有不允许的东西：${why}`);
  }

  if (!SHAPE.test(svg)) throw invalid('重绘结果里没有任何图形');
  if (Buffer.byteLength(svg, 'utf8') > MAX_SVG_BYTES) {
    throw invalid(`重绘结果超过 ${MAX_SVG_BYTES / 1024}KB`);
  }
}

/** 只收 `svg` 一项。单色与否不用模型说——渲染时按 `currentColor` 有没有出现来决定烘不烘颜色 */
const Reply = z.object({ svg: z.string().min(1) });

const SYSTEM = [
  '你是矢量图形工程师。用户给你一张品牌 logo 的位图，你把它**重画成 SVG**。',
  '',
  '硬性要求：',
  '- 只输出 JSON：{"svg":"<svg …>…</svg>"}',
  '- svg 必须带 viewBox，坐标自己归一化，不要写 width/height 的固定像素',
  '- **不要画背景**：logo 外面那层白底、底色都不要，只留图形本身',
  '- 形状参数写属性（fill / stroke / stroke-width / transform），**不要用 <style> 块**',
  '- 不要写 <script>、<style>、<image>、<foreignObject>、<use>、href、xlink、url()、@import',
  '- 不要写 on 开头的事件属性（onload / onclick 等）',
  '- **svg 根标签必须带 xmlns="http://www.w3.org/2000/svg"**——它会被当图片加载，缺了就画不出来',
  '- 除了上面那个 xmlns，不要写任何 http(s) 地址',
  '- 不要引外部字体、不要用 <text> 拼图形——文字用路径描出来',
  '- 原图是单色（黑白/灰阶）时，**所有填充与描边一律写 currentColor**——',
  '  它会被换成这套风格的品牌色，logo 才跟页面配色一致；',
  '  原图本身有颜色时，用原图自己的色值',
  '- 形状尽量精简：能用 <path> 就用 path，不要一个像素一个矩形',
].join('\n');

export interface RedrawLogoInput {
  projectId: string;
  tenantId: string;
  userId: string;
  /** `/uploads` 返回的对象 key */
  imageKey: string;
  /** 演示用的注入点，测试里换成假网关 */
  gateway?: ProviderGateway;
  /** 演示用的注入点，测试里换成假的对象读取 */
  readObject?: (key: string) => Promise<Buffer>;
}

/**
 * 把上传的 logo 重绘成 SVG。
 *
 * **失败时保留 `brandLogoImage` 并把模式退回 `original`**：原图还在，「就用原图」才有得用；
 * 否则用户传了一张图、重绘又失败，面板上会是一片空白，只能重传。
 */
export async function redrawLogo(input: RedrawLogoInput): Promise<{ svg: string }> {
  const readObject = input.readObject ?? (async (key: string) => createStorage().get(key));

  /**
   * **先读图，再动库。**
   *
   * 读图是毫秒级的，重绘要跑十几秒；这一步之前是唯一一个「库里还完全是上次的样子」的时刻。
   * 顺序反过来的话，`imageKey` 指向一个读不出来的对象时（对象过期被清、key 是客户端乱传的），
   * 库里会留下「**一个不存在的原图 key + 一份刚被清掉的旧稿**」——上一份能用的稿没了，
   * 新原图又是破图，用户只能重传。按这个顺序，读失败就整个不动库，面板上什么都不变。
   */
  let buffer: Buffer;
  try {
    buffer = await readObject(input.imageKey);
  } catch {
    /**
     * **读不出对象不能落成 500。**
     *
     * `LocalStorage.get` 读不到时抛裸 `Error`，而中间件把裸 `Error` 一律压成
     * 500「服务器内部错误」——用户看到「重绘失败：服务器内部错误」，分不出是图片没了
     * 还是模型挂了。`apps/api/src/routes/styles.ts:281-284` 是同一条路径（读一个被引用
     * 到的上传对象），那边就是 `catch { throw invalid('图片不存在或已过期：…') }`，这里对齐它。
     *
     * 这也会把「key 里带 `..`」这类被 `assertSafeKey` 拒掉的输入一并落成 400——
     * 那本来就是客户端传错了参数，400 是对的。
     */
    throw invalid('这张原图取不到，可能已经过期或被清理，重新上传一次试试');
  }

  /**
   * 记下原图，并且**把上一次的重绘稿清掉**。
   *
   * 记原图：重绘要跑十几秒，中途用户刷新页面时这张图不该丢。
   *
   * 清旧稿：不清的话，用户换了一张图、而重绘失败，库里会留下「**新的原图 + 上一张的重绘稿**」。
   * 面板按 `brandLogoSvg` 非空走「有重绘稿」那条分支，于是既不提示失败、又把两份不相干的
   * 东西并排摆着，用户还能点「用重绘稿」把旧稿确认到新图上。
   */
  updateProject(input.projectId, input.tenantId, {
    brandLogoImage: input.imageKey,
    brandLogoSvg: '',
    brandLogoMode: 'original',
  });

  const dataUrl = `data:${mimeOfName(input.imageKey) ?? 'image/png'};base64,${buffer.toString('base64')}`;

  const gateway = input.gateway ?? billedGateway(input.tenantId, input.userId);
  let res: Awaited<ReturnType<ProviderGateway['text']>>;
  try {
    res = await gateway.text({
      taskType: 'logo_redraw',
      json: true,
      maxTokens: 8000,
      system: SYSTEM,
      messages: [{ role: 'user', content: '把这张 logo 重画成 SVG。', images: [dataUrl] }],
    });
  } catch (err) {
    /**
     * **网关抛的是裸 `Error`，不翻一遍用户只会看到「服务器内部错误」。**
     *
     * 只翻这一种：**路由没配**。`packages/provider-gateway/src/router.ts:11` 明写
     * 「message 含 `ROUTE_NOT_CONFIGURED`」，:15 抛出，`provider-gateway.test.ts:175`
     * 用不强锚的 `/ROUTE_NOT_CONFIGURED/` 守着——所以这里**照着契约用 `includes`**。
     *
     * **别自作聪明改成 `startsWith`。** 契约说的是「含」，改成锚定开头，生产者将来把消息
     * 改成 `任务路由未配置（ROUTE_NOT_CONFIGURED）：…` 时它自己那条用例照样绿，而这条路会
     * **静默**退回 500「服务器内部错误」——没有任何测试会红。要收紧就先改 `router.ts:11`
     * 的契约与它那条用例，让「契约」真的成立，再收紧消费者。
     *
     * 而「logo_redraw 没配模型」是自建部署最容易撞上、也最需要用户看懂的一种失败：
     * 面板上只会显示「logo 重绘失败」，原因得说得出来。
     *
     * **其余的原样往上抛，让它落成 500。** `apps/api/src/routes/styles.ts:82-85` 那条
     * 注释说得对：「把 provider 挂掉说成图读不了是撒谎」——认不出的失败就该是 500，
     * 记在日志里，而不是硬编一句可能不准确的人话。
     */
    const raw = err instanceof Error ? err.message : String(err);
    if (raw.includes('ROUTE_NOT_CONFIGURED')) throw notConfigured(raw);
    throw err;
  }

  if (isMockPlaceholder(res.text)) throw notConfigured('当前 logo_redraw 路由指向内置 Mock，它给不出矢量稿');

  let parsed: z.infer<typeof Reply>;
  try {
    parsed = Reply.parse(JSON.parse(res.text));
  } catch {
    throw providerError(`模型没有给出合契约的 JSON（回的是：${res.text.slice(0, 60)}）`);
  }

  validateLogoSvg(parsed.svg);

  /**
   * **落库前确认这一轮还没被后来者顶掉。**
   *
   * 重绘是同步的十几秒，期间用户可能又传了一张（双击「换一张」、开两个标签页）。
   * 没有这道检查的话，先发起的那一轮后完成，会把**上一张图的重绘稿**盖到当前这张图上——
   * 库里存着 `image=B` 与 `svg=重绘A`，而界面看不出哪里不对。
   *
   * 被顶掉就什么都不写：后来者那一轮会写它自己的。返回的 `svg` 只是给调用方看一眼，
   * **不要拿它当落库结果**——落库状态以重新读出来的项目为准。
   */
  if (requireProject(input.projectId, input.tenantId).brandLogoImage !== input.imageKey) {
    return { svg: parsed.svg };
  }

  updateProject(input.projectId, input.tenantId, {
    brandLogoSvg: parsed.svg,
    brandLogoMode: 'redraw',
  });
  return { svg: parsed.svg };
}

/**
 * 清空一个项目的品牌。槽位全部落空，页眉上那几条槽位元素会被整个移除
 * （前提是 `brandOf` 在五列全空时**仍然返回一个 `BrandSlot`**，见 `brand.ts`——
 * 返回 `undefined` 的话 `fillBrandSlots` 根本不会被调用，槽位会留成空壳）。
 *
 * **注意「清空」清掉的是项目行上那五个指针，不是对象存储里的文件。** 全仓没有任何
 * `storage.delete` 调用，`/files` 又是不鉴权的 `express.static`——原图与重绘稿都还在磁盘上、
 * 按 key 仍能取回，真正不可逆的是「再也找不到它们了」。别把这句话读成能回收磁盘。
 */
export function clearBrand(projectId: string, tenantId: string): void {
  requireProject(projectId, tenantId);
  updateProject(projectId, tenantId, {
    brandLogoImage: '', brandLogoSvg: '', brandLogoMode: '', brandName: '', brandTagline: '',
  });
}
