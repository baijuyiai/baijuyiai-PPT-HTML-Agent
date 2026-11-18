import { Router } from 'express';
import { z } from 'zod';
import { ok, requirePasswordChanged } from '@lumen/server-core';
import { requireAuth } from '@lumen/server-core';
import { requireTenant, tenantOf, userIdOf } from '@lumen/server-core';
import { parseBody, parseParams, parseQuery } from '@lumen/server-core';
import { invalid } from '@lumen/server-core';
import {
  billedGateway, fillMissingPageTypes, publicRedrawMessage, redrawPage, replacePagePrompt,
  setSpecFonts, splitForPick, unifyStyle,
} from '@lumen/server-core';
import {
  deleteStyleDoc, listStyleDocs, resolveStyleDoc, saveStyleDoc,
} from '@lumen/server-core';
import { PageType, StyleDoc } from '@lumen/ir-schema';
import { openSse } from '../lib/sse.js';
import { resolveImages } from '../lib/ref-images.js';

export const stylesRouter = Router();
stylesRouter.use(requireAuth, requirePasswordChanged, requireTenant);

/* ---------------- 风格（每页一条 HTML 生成提示词 + 样机） ---------------- */

/**
 * 这一组路由的路径都以 `/docs` 开头，**没有 `GET /:styleId` 这种裸参路由了**——
 * 旧的风格包接口（列风格包、取风格包、识别成风格包、保存、删除、恢复默认）随
 * `style_packs` 一起下线。留一条裸参路由在这里，将来加 `/docs` 之外的新段时
 * 又会被它先吃掉，重演「取列表变成取一个叫 docs 的风格然后 404」那一幕。
 */
stylesRouter.get('/docs', (req, res) => {
  const q = parseQuery(z.object({
    q: z.string().optional(),
    theme: z.enum(['light', 'dark']).optional(),
    limit: z.coerce.number().int().optional(),
    offset: z.coerce.number().int().optional(),
  }), req);
  ok(res, listStyleDocs(q));
});

stylesRouter.post('/docs', (req, res) => {
  const body = parseBody(z.object({ doc: z.record(z.unknown()) }), req);
  const result = saveStyleDoc(StyleDoc.parse(body.doc));
  if (!result.ok) return void ok(res, result, 400);
  ok(res, result, 201);
});

stylesRouter.get('/docs/:styleId', (req, res) => {
  const { styleId } = parseParams(z.object({ styleId: z.string().min(1) }), req);
  ok(res, resolveStyleDoc(decodeURIComponent(styleId)));
});

stylesRouter.delete('/docs/:styleId', (req, res) => {
  const { styleId } = parseParams(z.object({ styleId: z.string().min(1) }), req);
  const result = deleteStyleDoc(decodeURIComponent(styleId));
  if (!result.deleted) return void ok(res, result, 409);
  ok(res, result);
});

const CropBoxQuery = z.object({
  image: z.string().min(1),
  x0: z.coerce.number().min(0).max(1),
  y0: z.coerce.number().min(0).max(1),
  x1: z.coerce.number().min(0).max(1),
  y1: z.coerce.number().min(0).max(1),
});

/** 分页：给用户挑一页用。只分页，不写提示词 */
stylesRouter.post('/docs/:styleId/pages/:pageType/slides', async (req, res) => {
  const p = parseParams(z.object({ styleId: z.string().min(1), pageType: PageType }), req);
  const body = parseBody(z.object({ image: z.string().min(1) }), req);
  const styleId = decodeURIComponent(p.styleId);
  // 风格不存在时 resolveStyleDoc 自己抛 notFound。**不要换成 styleDocExists**：它按精确
  // id 匹配，而库里存的是 `id@version`、前端传的是裸 id，会把存在的风格误判成不存在。
  // 这里与下面 PUT 那条同口径；且排在 splitForPick 之前——不存在就不该花钱去分页。
  resolveStyleDoc(styleId);
  const [image] = await resolveImages([body.image]);
  let slides;
  try {
    slides = await splitForPick(image!, billedGateway(tenantOf(req), userIdOf(req)));
  } catch (err) {
    // 认得出的失败（图不是 PNG）翻成人话给 400；别的原样往上抛，由错误中间件记成 500——
    // 把 provider 挂掉说成「图读不了」是撒谎。翻译走 `publicRedrawMessage`，
    // SSE 那条路由用的是同一份，同一个失败不该给两种待遇
    if (err instanceof Error && err.message.startsWith('PNG_DECODE_FAILED')) {
      throw invalid(publicRedrawMessage(err));
    }
    throw err;
  }
  ok(res, { slides });
});

/**
 * 单页重识别。
 *
 * 传裁切框而不是传下标去重新分页：模型调用不是确定性的，第二次分页可能切出不一样的框，
 * 用户挑的那一页就会与真正识别的那一页对不上，而且这种错配是静默的。
 */
stylesRouter.get('/docs/:styleId/pages/:pageType/recognize-stream', async (req, res) => {
  const p = parseParams(z.object({ styleId: z.string().min(1), pageType: PageType }), req);
  const q = parseQuery(CropBoxQuery, req);
  if (q.x1 <= q.x0 || q.y1 <= q.y0) throw invalid('裁切框不合法：x1 必须大于 x0，y1 必须大于 y0');
  const styleId = decodeURIComponent(p.styleId);
  // 存在性校验必须在 openSse() **之前**：流一开，状态码就发出去了，这时再发现风格不存在
  // 只能回 200 + event: error，与 slides / PUT 两条的 404 口径对不上。三条要一个口径。
  resolveStyleDoc(styleId);
  // 图片引用同理，也要在 openSse() **之前**解析：slides 那条路是先解析图片再调模型，
  // 坏引用直接 400；放进 try 里的话流已经开了，状态码只能是 200 + event: error——
  // 同一个失败给两种待遇。三条路由要一个口径。
  const [image] = await resolveImages([q.image]);

  const sse = openSse(res);
  try {
    const gen = redrawPage({
      styleId,
      pageType: p.pageType,
      imageUrl: image!,
      box: { x0: q.x0, y0: q.y0, x1: q.x1, y1: q.y1 },
      gateway: billedGateway(tenantOf(req), userIdOf(req)),
    });
    for await (const evt of gen) {
      // 客户端断开就停手。用 sse.closed 而不是 res.writableEnded——后者断连后恒为 false，
      // 会把生成器一路抽到底，模型调用照跑照记账
      if (sse.closed) break;
      sse.send(evt.event, evt.data);
    }
  } catch (err) {
    sse.send('error', { message: err instanceof Error ? err.message : String(err) });
  } finally {
    sse.end();
  }
});

/** 永久替换一个页类型的提示词与样机 */
stylesRouter.put('/docs/:styleId/pages/:pageType', async (req, res) => {
  const p = parseParams(z.object({ styleId: z.string().min(1), pageType: PageType }), req);
  const body = parseBody(z.object({
    // `.trim()` 挡的是纯空白串——那种串在库里就是一个空壳，不该当一条提示词存进去。
    // 「用户输入问题要用 4xx 表达」这条不再靠它兜底：`replacePagePrompt` 现在自己抛
    // `invalid`（400），就算这个修饰符被谁去掉，那条分支也不会漏成 500
    prompt: z.string().trim().min(1),
    mockHtml: z.string(),
    // 不传 = 不动这一页原来的版式绑定，传空串 = 解绑。三种语义见 `ReplaceInput.layoutId`
    layoutId: z.string().optional(),
  }), req);
  const { doc, issues } = replacePagePrompt({
    styleId: decodeURIComponent(p.styleId),
    pageType: p.pageType,
    prompt: body.prompt,
    mockHtml: body.mockHtml,
    ...(body.layoutId === undefined ? {} : { layoutId: body.layoutId }),
  });
  // 契约问题带出去：不阻断保存，但界面要能如实说「存了，不过这条提示词缺了一段」
  ok(res, { styleId: doc.styleId, pageType: p.pageType, issues });
});

/**
 * 换四个字体角色各自用哪套字体。
 *
 * **不重跑统一**：角色在页面里走 `--font-sans` / `--font-display` / `--font-script` /
 * `--font-numeric` 四个 CSS 变量，换字体就是换变量值，全篇每一页同时跟着变——
 * 这正是「一键切换、全风格统一」要的。见 `setSpecFonts`。
 *
 * 空串表示「这套风格不指定这一档」，渲染层会落回上一档；认不出的 id 由 service 抛 400。
 */
stylesRouter.patch('/docs/:styleId/fonts', (req, res) => {
  const { styleId } = parseParams(z.object({ styleId: z.string().min(1) }), req);
  const body = parseBody(
    z.object({
      display: z.string().optional(),
      body: z.string().optional(),
      script: z.string().optional(),
      numeric: z.string().optional(),
    // 一个字段都不给的 PATCH 是空操作，多半是调用方写错了字段名——挡下来比静默成功好
    }).refine((v) => Object.values(v).some((x) => x !== undefined), {
      message: '至少要给一个字体角色',
    }),
    req,
  );
  const doc = setSpecFonts(decodeURIComponent(styleId), body);
  ok(res, { styleId: doc.styleId, fonts: doc.spec?.fonts });
});

/**
 * 补齐一套已存风格缺的页类型。
 *
 * 页类型是会长的：识别链路认识的页类型从九个加到十一个（新增 `architecture` / `mindMap`），
 * 新识别的风格自动带上它们，而**已经存进库的那些只有九个**。这条流只碰缺的那几类——
 * 一类不缺时服务端一个模型调用都不发，直接回一个空 `filled` 的 done。
 *
 * 走 SSE 而不是普通 POST：一轮补齐要发十几次模型调用（推导 + 逐页出样机），
 * 一张样机线上要跑四分钟，普通请求会超时，用户在等待期间也什么都看不到。
 * 用 GET 是照着同族两条流的惯例：浏览器的 EventSource 不能发 POST。
 */
stylesRouter.get('/docs/:styleId/fill-missing/stream', async (req, res) => {
  const p = parseParams(z.object({ styleId: z.string().min(1) }), req);
  const styleId = decodeURIComponent(p.styleId);
  // 存在性校验必须在 openSse() **之前**：流一开，状态码就发出去了，这时再发现风格不存在
  // 只能回 200 + event: error，与 slides / PUT 两条的 404 口径对不上。三条要一个口径。
  resolveStyleDoc(styleId);

  const sse = openSse(res);
  try {
    const gen = fillMissingPageTypes({
      styleId,
      // 网关必须走 billedGateway：不带 onUsage 的网关会静默跳过记账，
      // 而这条流是真花钱的（推导 + 出样机十几次调用）
      gateway: billedGateway(tenantOf(req), userIdOf(req)),
    });
    for await (const evt of gen) {
      // 客户端断开就停手。用 sse.closed 而不是 res.writableEnded——后者断连后恒为 false，
      // 会把生成器一路抽到底，模型调用照跑照记账
      if (sse.closed) break;
      sse.send(evt.event, evt.data);
    }
  } catch (err) {
    sse.send('error', { message: err instanceof Error ? err.message : String(err) });
  } finally {
    sse.end();
  }
});

/**
 * 一键统一风格：提炼视觉规范 → 改写各页提示词 → 重出样机 → 一致性自检。
 *
 * 与 `fill-missing` 同一条路子（存在性校验在 `openSse()` 之前、断连即停手、
 * 网关走 `billedGateway`）。这条流比补齐更贵：四步里有两步是逐页调用。
 */
stylesRouter.get('/docs/:styleId/unify/stream', async (req, res) => {
  const p = parseParams(z.object({ styleId: z.string().min(1) }), req);
  const styleId = decodeURIComponent(p.styleId);
  // 存在性校验必须在 openSse() **之前**：流一开，状态码就发出去了，这时再发现风格不存在
  // 只能回 200 + event: error，与 slides / PUT 两条的 404 口径对不上
  resolveStyleDoc(styleId);

  const sse = openSse(res);
  try {
    for await (const evt of unifyStyle({
      styleId,
      // 网关必须走 billedGateway：不带 onUsage 的网关会静默跳过记账，而这条流真花钱
      gateway: billedGateway(tenantOf(req), userIdOf(req)),
    })) {
      // 客户端断开就停手。用 sse.closed 而不是 res.writableEnded——后者断连后恒为 false，
      // 会把生成器一路抽到底，模型调用照跑照记账
      if (sse.closed) break;
      sse.send(evt.event, evt.data);
    }
  } catch (err) {
    sse.send('error', { message: err instanceof Error ? err.message : String(err) });
  } finally {
    sse.end();
  }
});

/**
 * 新链路的风格识别：每个页类型一条 HTML 生成提示词 + 真跑出来的样机。
 *
 * 走 SSE 而不是普通 POST，是因为一轮识别要 3~6 分钟（分页、逐页写提示词、
 * 补齐缺失页类型、九个页类型各出一次样机，约二十次模型调用）。普通请求会超时，
 * 而且用户在等待期间什么都看不到。
 *
 * 用 GET 而不是 POST：浏览器的 EventSource 不能发 POST。图片先走 /uploads 落盘，
 * 这里只带引用（`?image=…&image=…`）。
 */
stylesRouter.get('/recognize-doc/stream', async (req, res) => {
  const q = parseQuery(z.object({
    image: z.union([z.string().min(1), z.array(z.string().min(1))]),
  }), req);
  const refs = (Array.isArray(q.image) ? q.image : [q.image]).slice(0, 12);

  const sse = openSse(res);
  try {
    const images = await resolveImages(refs);
    const { runDocRecognition } = await import('@lumen/server-core');
    for await (const evt of runDocRecognition({ imageUrls: images, tenantId: tenantOf(req), userId: userIdOf(req) })) {
      // 断开就停：这一条流是三到六分钟、约二十次模型调用，抽到底最贵
      if (sse.closed) break;
      sse.send(evt.event, evt.data);
    }
  } catch (err) {
    sse.send('error', { message: err instanceof Error ? err.message : String(err) });
  } finally {
    sse.end();
  }
});

