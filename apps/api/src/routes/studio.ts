import { Router } from 'express';
import { z } from 'zod';
import {
  builtinLayoutsOf, StudioModuleId, type StudioLayout,
} from '@lumen/ir-schema';
import {
  billedGateway, deleteStudioLayout, hideBuiltinLayout, invalid, listStudioLayouts,
  notFound, ok, parseBody, parseParams, parseQuery, requireAuth, requirePasswordChanged,
  requireTenant, saveStudioLayout, syncHiddenLayouts, tenantOf, unhideBuiltinLayout, userIdOf,
} from '@lumen/server-core';
import { openSse } from '../lib/sse.js';
import { resolveImages } from '../lib/ref-images.js';

/**
 * 功能库：用户自建的版式骨架。
 *
 * ## 为什么单独一个路由文件
 *
 * 它跟 `/styles` 那套不是一回事：风格是「每页一条提示词 + 样机」，这里存的是**版式骨架**
 * （一段只有结构与图位的 HTML）。两者唯一的交集是都要从参考图识别，而那条识别流
 * 走的是另一份提示词、另一套校验。
 *
 * ## 自建骨架不进自动挑版式的候选池
 *
 * 这是全局口径，写在 `studio-layout.service.ts` 顶部。这个文件只负责「列出来 / 存进去 /
 * 删掉 / 从图里认一份」，**不碰生成链路**——按骨架重排某一页走的是
 * `GET /api/pages/:pageId/regenerate/stream?layoutId=…`，在 `projects.ts` 那边。
 */
export const studioRouter = Router();
studioRouter.use(requireAuth, requirePasswordChanged, requireTenant);

/**
 * 列某个版式库的全部骨架：内置 + 自建，**合成一份列表**（内置在前，自建按创建顺序跟在后头）。
 *
 * 合并在服务端做，是因为两边本来就要一起显示；而合并只允许发生在展示层——
 * 见 service 顶部那条铁律。
 *
 * **先灌一次下架名单**：`builtinLayoutsOf` 的 `hidden` 标志读的是 ir-schema 里的
 * 模块级集合，而那个集合在进程刚起来时是空的。功能库页是唯一要看这个标志的地方，
 * 在这里灌一次最省事——不必去启动流程里挂一个钩子，也不必担心别处改了库之后这里过期。
 */
studioRouter.get('/layouts', (req, res) => {
  const q = parseQuery(z.object({ module: StudioModuleId }), req);
  syncHiddenLayouts();
  const items: StudioLayout[] = [...builtinLayoutsOf(q.module), ...listStudioLayouts(q.module)];
  ok(res, { items });
});

/** 保存一份自建骨架。**校验在服务端重做一遍**，不信任客户端回传的骨架 */
studioRouter.post('/layouts', (req, res) => {
  const body = parseBody(z.object({
    moduleId: StudioModuleId,
    name: z.string().min(1).max(40),
    brief: z.string().min(8).max(200),
    group: z.string().min(1).max(40),
    // 上限给得宽：一份骨架一两千字符，但模型偶尔会写得很啰嗦
    skeleton: z.string().min(1).max(200_000),
    sourceImage: z.string().max(500).optional(),
  }), req);

  const result = saveStudioLayout({
    moduleId: body.moduleId,
    name: body.name,
    brief: body.brief,
    group: body.group,
    skeleton: body.skeleton,
    ...(body.sourceImage ? { sourceImage: body.sourceImage } : {}),
  });
  // 不合规是**输入的问题**，回 400 并把问题清单带上，让界面能原样显示——
  // 不是 500，也不是「200 + ok:false」
  if (!result.ok) throw invalid('这份骨架还不能存', result.issues);
  ok(res, result, 201);
});

/**
 * 删一份自建骨架。内置的天然删不掉——它们不在库里，`DELETE` 影响零行，
 * 于是走「没找到」这条（见 `deleteStudioLayout`）。
 *
 * id 里带斜杠（`people/custom-…@v1`），客户端必须 `encodeURIComponent`。
 * Express 5 按编码后的形态匹配单段路径、再把参数解码回来，所以 `:layoutId` 收得住。
 */
studioRouter.delete('/layouts/:layoutId', (req, res) => {
  const { layoutId } = parseParams(z.object({ layoutId: z.string().min(1).max(200) }), req);
  const result = deleteStudioLayout(layoutId);
  if (!result.deleted) throw notFound(result.reason);
  ok(res, result);
});

/**
 * 下架 / 恢复一份**内置**版式。
 *
 * 与「删除自建」是两件事：自建的是整行删掉，内置的写死在代码里、删不得，
 * 下架只是**让它不再进自动挑版式的候选池**（已生成的项目页面照旧渲染）。
 * 所以是两个动词、两个端点，不合并。
 *
 * 幂等：重复下架、恢复没下架过的，都回成功——界面上的按钮连点两下不该报错。
 */
studioRouter.post('/layouts/:layoutId/hide', (req, res) => {
  const { layoutId } = parseParams(z.object({ layoutId: z.string().min(1).max(200) }), req);
  const result = hideBuiltinLayout(layoutId);
  if (!result.ok) throw invalid(result.reason);
  ok(res, result);
});

studioRouter.delete('/layouts/:layoutId/hide', (req, res) => {
  const { layoutId } = parseParams(z.object({ layoutId: z.string().min(1).max(200) }), req);
  const result = unhideBuiltinLayout(layoutId);
  if (!result.ok) throw invalid(result.reason);
  ok(res, result);
});

/**
 * 从一张参考图识别一份版式骨架（流式）。
 *
 * 走 SSE 是因为一次识别要跑十几秒到一分钟（写一两千 token 的骨架，不合规还要再来一次）。
 * 普通请求等得起，但用户在等待期间什么都看不到。
 *
 * 用 GET 而不是 POST：浏览器的 EventSource 不能发 POST。图片先走 /uploads 落盘，
 * 这里只带引用（`?image=…`）。
 *
 * **`module` 必须在开流之前校验**：流一开状态码就发出去了，这时再发现参数不对
 * 只能回 200 + 一条 error 事件，与其它路由的 400 口径对不上。`parseQuery` 在
 * `openSse()` 之前，正好落在这条线上。
 */
studioRouter.get('/layouts/recognize-stream', async (req, res) => {
  const q = parseQuery(z.object({
    module: StudioModuleId,
    image: z.union([z.string().min(1), z.array(z.string().min(1))]),
  }), req);
  const refs = (Array.isArray(q.image) ? q.image : [q.image]).slice(0, 6);

  const sse = openSse(res);
  try {
    const images = await resolveImages(refs);
    const { runLayoutRecognition } = await import('@lumen/server-core');
    for await (const evt of runLayoutRecognition({
      moduleId: q.module,
      imageUrls: images,
      tenantId: tenantOf(req),
      userId: userIdOf(req),
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
