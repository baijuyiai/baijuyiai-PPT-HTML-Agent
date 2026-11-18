import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { conflict, invalid, notFound, ok, requirePasswordChanged } from '@lumen/server-core';
import { requireAuth } from '@lumen/server-core';
import { clientIp, parseBody, parseParams, parseQuery } from '@lumen/server-core';
import { requireTenant, tenantOf, userIdOf } from '@lumen/server-core';
import { recordAudit } from '@lumen/server-core';
import { BRAND_LOGO_MODES, CHART_STYLE_IDS, DeckDepth, PageIR, PageType, styleRef, type OutlinePage } from '@lumen/ir-schema';
import { moduleOfLayoutId, moduleOfPageType, type StudioLayout } from '@lumen/ir-schema';
import { listStyleDocs, resolveAnyStyle, styleRefExists } from '@lumen/server-core';
import {
  createProject, deletePage, deleteProject, getPage, insertPageAt, listPages, listProjects, newBlankPage,
  pageIR, refreshProjectCounts, reorderPages, requireProject, savePage, setOutlinePageType, updateProject,
  withProgress,
} from '@lumen/server-core';
import {
  ensureStyle, generatePageAt, planOutline, regeneratePage, regenerateProjectScripts,
  regenerateScript, runGeneration, saveOutline,
} from '@lumen/server-core';
import { readDeckMeta } from '@lumen/server-core';
import {
  generatePageHtmlAt, regeneratePageHtml, runHtmlGeneration,
} from '@lumen/server-core';
import { shareCount } from '@lumen/server-core';
import { createStorage, cutoutImage, mimeOfName, objectKey } from '@lumen/server-core';
import { STOCK_PHOTOS, stockUrl, type StockPhoto } from '@lumen/stock-library';
import { readStockFile } from '@lumen/stock-library/node';
import { billedGateway } from '@lumen/server-core';
import { apiQueue, ensureNarration, enqueuePageNarration, enqueueProjectNarration, groupKeyOf } from '@lumen/server-core';
import { clearBrand, redrawLogo } from '@lumen/server-core';
import { planDeckOutline, planLessons, assertGenerationFree, assertPageFree, generationKind, isGenerating, livePagesOf, requestStop } from '@lumen/server-core';
import { resolveLayoutForPrompt } from '@lumen/server-core';
import { openSse } from '../lib/sse.js';

export const projectsRouter = Router();
projectsRouter.use(requireAuth, requirePasswordChanged, requireTenant);

const AudienceEnum = z.enum(['executive', 'scholar', 'founder', 'tech-lead', 'brand', 'general']);
const SceneEnum = z.enum(['pitch', 'strategy', 'annual', 'academic', 'defense', 'board', 'review', 'tech', 'brand', 'general']);
const IdParam = z.object({ id: z.string().min(1) });
const PageIdParam = z.object({ pageId: z.string().min(1) });

/* ---------------- 项目 ---------------- */

projectsRouter.get('/', (req, res) => {
  const q = parseQuery(z.object({
    q: z.string().optional(),
    status: z.enum(['draft', 'generating', 'completed', 'failed']).optional(),
    limit: z.coerce.number().int().optional(),
    offset: z.coerce.number().int().optional(),
  }), req);
  const result = listProjects(tenantOf(req), userIdOf(req), q);
  ok(res, {
    items: result.items.map((p) => ({ ...p, shareCount: shareCount(p.projectId) })),
    total: result.total,
  });
});

projectsRouter.post('/', (req, res) => {
  const body = parseBody(z.object({
    title: z.string().min(1).max(120),
    brief: z.string().max(20000).optional(),
    audienceTag: AudienceEnum.optional(),
    scene: SceneEnum.optional(),
    /**
     * 目标页数。与 `PATCH` 同一套区间——两处各写一份迟早会漂，
     * 而漂了之后前端那份校验说「可以」、服务端说「不行」。
     *
     * 新建时 `undefined` 与 `null` 是一回事（都落到「由内容决定」），
     * 不像 `PATCH` 那样要区分「不改」与「改成空」。
     */
    targetPages: z.coerce.number().int().min(3).max(30).nullable().optional(),
  }), req);
  const project = createProject({
    tenantId: tenantOf(req),
    ownerId: userIdOf(req),
    title: body.title,
    brief: body.brief ?? '',
    audienceTag: body.audienceTag ?? 'general',
    scene: body.scene ?? 'general',
    targetPages: body.targetPages ?? null,
  });
  ok(res, withProgress(project), 201);
});

/**
 * 可选风格列表，供新建项目弹窗与工作台的风格面板使用。
 *
 * **返回的是风格库里的 StyleDoc**，不是代码里写死的旧风格包。旧包带着
 * `audienceFit` / `toneKeywords` 那套元数据，新库没有、也不打算补：
 * 库里就五六套，一眼看得完，与其按人群算一个推荐值，不如把封面样机摆出来让人直接挑。
 * 所以 `scene` / `audienceTag` 两个查询参数一并去掉了——留着不用是骗人的。
 */
projectsRouter.get('/style-suggestions', (_req, res) => {
  const { items } = listStyleDocs({ limit: 100 });
  ok(res, {
    styles: items.map((d) => ({
      // **不要再拼一次版本**：`StyleDocSummary.styleId` 存的已经是 `id@version`
      // （库里那一列就是全量引用），拼了会得到 `id@1.0@1.0`
      styleId: d.styleId,
      name: d.name,
      description: d.description,
      theme: d.theme,
      palette: d.palette,
      fontFamily: d.fontFamily,
      // 卡片要渲染 previewHtml，三个字体角色少一个预览就和真页不一样
      fontDisplay: d.fontDisplay,
      fontScript: d.fontScript,
      pageTypes: d.pageTypes,
      mockedCount: d.mockedCount,
      previewHtml: d.previewHtml,
    })),
  });
});

projectsRouter.get('/:id', (req, res) => {
  const { id } = parseParams(IdParam, req);
  const tenantId = tenantOf(req);
  const project = requireProject(id, tenantId);
  const pages = listPages(id).map((row) => ({
    pageId: row.pageId, pageIndex: row.pageIndex, status: row.status, version: row.version, page: pageIR(row),
  }));
  // 风格可能是新链路的文档，也可能是旧风格包。**取不到不能让整个详情接口挂掉**——
  // 详情里少一块「当前风格」是小事，项目打不开是大事
  //
  // 两种都要回：工作台靠 `kind` 分流渲染（doc 走 iframe 新链路、pack 走旧渲染器），
  // 少回一种就等于那一种项目打不开
  const style = resolveAnyStyle(project.styleId);
  const { outline, intent } = planOutline(id, tenantId);
  ok(res, {
    project: withProgress(project),
    pages,
    outline,
    intent,
    style: style === null
      ? null
      : style.kind === 'pack'
        ? { kind: 'pack' as const, styleId: `${style.pack.styleId}@${style.pack.version}`, name: style.pack.name, pack: style.pack }
        : { kind: 'doc' as const, styleId: styleRef(style.doc), name: style.doc.name, doc: style.doc },
  });
});
projectsRouter.patch('/:id', (req, res) => {
  const { id } = parseParams(IdParam, req);
  const body = parseBody(z.object({
    title: z.string().min(1).max(120).optional(),
    brief: z.string().max(20000).optional(),
    audienceTag: AudienceEnum.optional(),
    scene: SceneEnum.optional(),
    styleId: z.string().optional(),
    avatarEnabled: z.boolean().optional(),
    /** 大纲的思考层级 */
    depth: DeckDepth.optional(),
    /** 目标页数。null 显式表示「由内容决定」，undefined 表示不改 */
    targetPages: z.coerce.number().int().min(3).max(30).nullable().optional(),
    /** '' 没有 logo / 'redraw' 用重绘稿 / 'original' 用原图。取自 `BRAND_LOGO_MODES`，不另抄一份 */
    brandLogoMode: z.enum(BRAND_LOGO_MODES).optional(),
    brandName: z.string().max(60).optional(),
    brandTagline: z.string().max(120).optional(),
    /**
     * 讲解音色与语气。**传 null 表示「改回沿用全局」**，不传表示不动。
     * 用 null 而不是空串是因为「没选过」与「选了一个空音色」是两回事。
     */
    narrationVoice: z.string().max(80).nullable().optional(),
    /** 语气允许空串——那表示「不加语气提示」，是合法选择 */
    narrationTone: z.string().max(500).nullable().optional(),
    /** 生成页面时是否顺带出讲稿 */
    narrationScriptEnabled: z.boolean().optional(),
    /** 图表视觉风格。取值取自 `CHART_STYLE_IDS`，不另抄一份清单 */
    chartStyle: z.enum(CHART_STYLE_IDS).optional(),
  }), req);

  // 显式锁定风格前先确认它存在，避免把项目指向不存在的风格。
  // 新链路的风格文档与旧的风格包都算存在——过渡期里两者并存
  if (body.styleId && !styleRefExists(body.styleId)) {
    throw notFound(`风格不存在：${body.styleId}`);
  }

  const project = updateProject(id, tenantOf(req), {
    ...(body.title !== undefined ? { title: body.title } : {}),
    ...(body.brief !== undefined ? { brief: body.brief } : {}),
    ...(body.audienceTag !== undefined ? { audienceTag: body.audienceTag } : {}),
    ...(body.scene !== undefined ? { scene: body.scene } : {}),
    ...(body.styleId !== undefined ? { styleId: body.styleId } : {}),
    ...(body.avatarEnabled !== undefined ? { avatarEnabled: body.avatarEnabled ? 1 : 0 } : {}),
    ...(body.depth !== undefined ? { depth: body.depth } : {}),
    ...(body.targetPages !== undefined ? { targetPages: body.targetPages } : {}),
    ...(body.brandLogoMode !== undefined ? { brandLogoMode: body.brandLogoMode } : {}),
    ...(body.brandName !== undefined ? { brandName: body.brandName } : {}),
    ...(body.brandTagline !== undefined ? { brandTagline: body.brandTagline } : {}),
    // null 是合法值（改回沿用全局），所以判的是 undefined 而不是真假
    ...(body.narrationVoice !== undefined ? { narrationVoice: body.narrationVoice } : {}),
    ...(body.narrationTone !== undefined ? { narrationTone: body.narrationTone } : {}),
    ...(body.narrationScriptEnabled !== undefined
      ? { narrationScriptEnabled: body.narrationScriptEnabled ? 1 : 0 }
      : {}),
    ...(body.chartStyle !== undefined ? { chartStyle: body.chartStyle } : {}),
  });
  ok(res, withProgress(project));
});

projectsRouter.delete('/:id', (req, res) => {
  const { id } = parseParams(IdParam, req);
  const tenantId = tenantOf(req);
  /**
   * **正在生成的项目不能删。**
   *
   * 生成是逐页往库里写的，删到一半的项目还被那条流写着：`savePageGroup` 会按
   * `projectId` 重新 INSERT 页行，于是「删掉的项目」过几秒又长出几页孤页，
   * 那些页还会算进项目计数里。等流停了再删，语义才干净。
   *
   * 判据用 `isGenerating`（进程内的租约），与生成入口用的是同一把锁——
   * 两处各判一套迟早会漂。
   */
  if (isGenerating(id)) throw conflict('这个项目正在生成中，等它跑完或先点「停止」再删');
  // 删之前把标题取下来：删完再查就没有了，审计里只剩一个 id，事后认不出删的是哪本
  const title = requireProject(id, tenantId).title;
  deleteProject(id, tenantId);
  recordAudit({
    tenantId, userId: userIdOf(req), action: 'delete_project',
    target: `project:${id}`, meta: { title }, ip: clientIp(req),
  });
  ok(res, { deleted: true });
});

/* ---------------- 品牌 logo ---------------- */

/**
 * 把上传的 logo 重绘成矢量稿。
 *
 * **同步跑十几秒**：不像风格识别那条要三到六分钟，没必要为它上 SSE。
 * 前端在这段时间里显示转圈，与单页重生成是同一个量级的等待。
 *
 * 服务端落库、客户端只收结果——**不接受客户端回传的 SVG**：
 * 那段稿会被填进每一页的页眉，校验只能发生在服务端。
 */
projectsRouter.post('/:id/brand/redraw', async (req, res) => {
  const { id } = parseParams(IdParam, req);
  const tenantId = tenantOf(req);
  const userId = userIdOf(req);
  requireProject(id, tenantId);
  const body = parseBody(z.object({
    imageKey: z.string().min(1).max(400),
    // 只做长度校验不够——见下面那条前缀检查
  }), req);

  /**
   * `imageKey` 必须是**本租户、本项目**的 uploads 分区里的对象。
   *
   * 不校验的话，可以把任意字符串（别人的对象 key、`../../` 之类的路径花活）写成自己项目的
   * logo。危害不大（`/files` 本来就是不鉴权的 `express.static`），但「这个参数只接受本项目
   * 的资源」是该有的样子，而且它顺手把「key 乱传」这类输入挡在了读对象之前。
   *
   * 前缀形状跟着 `objectKey(tenantId, projectId, 'uploads', name)`（`packages/storage/src/adapter.ts:48`）：
   * 那三段是 `tn_*` / `prj_*` / 字面量 `uploads`，过一遍 `sanitizeSegment` 也是原样。
   */
  const keyPrefix = `${tenantId}/${id}/uploads/`;
  if (!body.imageKey.startsWith(keyPrefix)) {
    // 把「上传时要带 projectId」写进消息里：`POST /api/uploads` 的默认值是字面量 `'uploads'`
    // （`routes/uploads.ts:47`），而仓库里现存的三处调用都没带 `projectId`。
    // 谁照它们复制一份，每次合法重绘都会撞到这里，而原消息指不到真正的原因
    throw invalid('imageKey 不是这个项目上传的图片（上传时要带上 projectId）');
  }

  await redrawLogo({
    projectId: id, tenantId, userId,
    imageKey: body.imageKey,
    gateway: billedGateway(tenantId, userId),
  });

  /**
   * **只回项目状态，不回 `svg`。**
   *
   * `redrawLogo` 在「这一轮被后一次上传顶掉」时会返回一份**没落库**的稿（它选择不覆盖
   * 后来者的结果）。把它放进响应体，客户端就会显示一份并不存在的重绘稿，而同一个响应里的
   * `project.brandLogoSvg` 又是另一份东西——自相矛盾。项目状态才是唯一可信的结果。
   */
  ok(res, withProgress(requireProject(id, tenantId)));
});

/** 清空品牌。槽位全部落空，页眉那条元素会被整个移除 */
projectsRouter.delete('/:id/brand', (req, res) => {
  const { id } = parseParams(IdParam, req);
  const tenantId = tenantOf(req);
  requireProject(id, tenantId);
  clearBrand(id, tenantId);
  recordAudit({
    // **不借 `delete_project`。** 清空会把项目行上的五个指针清掉，那同样不可逆
    // （对象还在磁盘上，但再也找不到它们了）；借别人的动作名，审计里就分不出
    // 「删了整本项目」和「只清了品牌」——`AuditAction` 那个枚举的注释记着同一类教训
    // （`delete_project` 当初是从 `export` 借来的）
    tenantId, userId: userIdOf(req), action: 'clear_brand',
    target: `project:${id}:brand`, ip: clientIp(req),
  });
  ok(res, withProgress(requireProject(id, tenantId)));
});

/* ---------------- 大纲 ---------------- */

projectsRouter.post('/:id/outline', (req, res) => {
  const { id } = parseParams(IdParam, req);
  const body = parseBody(z.object({ targetPages: z.coerce.number().int().min(3).max(30).optional() }), req);
  requireProject(id, tenantOf(req));
  const { outline, intent } = planOutline(id, tenantOf(req), body.targetPages);
  ok(res, { outline, intent });
});

projectsRouter.put('/:id/outline', (req, res) => {
  const { id } = parseParams(IdParam, req);
  const tenantId = tenantOf(req);
  const body = parseBody(z.object({ outline: z.array(z.record(z.unknown())).min(1) }), req);
  requireProject(id, tenantId);
  const incoming = body.outline as unknown as OutlinePage[];
  const before = readDeckMeta(id).outline ?? [];

  /**
   * 标了「人改过」的页，重跑提纲时原样保留（见 `deck-plan.service.ts` 的 `withEditedKept`），
   * 与 `StylePagePrompt.edited` 是同一条规矩。不标的话，用户精修过的标题
   * 会在下一次「生成大纲」里被模型重写的措辞盖掉，而用户根本看不出是什么时候没的。
   *
   * ## 标记**信客户端给的那一个**，不靠比对内容推
   *
   * 原先这里是拿收到的整份大纲与库里那份逐字段比，不一样就标「人改过」。看着合理，
   * 实际是个陷阱：客户端发的就是**整份本地大纲**，只要本地那份落后于服务端，
   * 一次保存就会把差异页全部标上。而本地大纲落后是常态——生成教案期间
   * `hydrate` 会**刻意**不覆盖本地大纲（见 `store.ts` 的 `outlineDirty`）。
   *
   * 实测踩到过：一次这样的保存把 30 页里的 26 页标成了「人改过」，而它们的内容一个字没动。
   * 标记又是粘性的，于是「生成整本教案」再也写不到那 26 页。
   *
   * 谁改的只有客户端知道（`renameOutline` / `patchOutline` 里标），所以由它说了算。
   * 服务端只保留**粘性**：标过一次就不收回——「这一页我认过了」这个判断机器无从推断。
   */
  const outline = incoming.map((page, i) => ({
    ...page,
    edited: page.edited === true || before[i]?.edited === true,
  }));

  saveOutline(id, tenantId, outline);
  ok(res, { outline });
});

/* ---------------- 提纲与教案（三段内容链路的前两段） ---------------- */

/**
 * 生成提纲：规则先出骨架，模型在骨架上深入思考重写。
 *
 * 形态与 `styles.ts` 的 `unify/stream` 一致——**校验放在 `openSse()` 之前**，
 * 否则项目不存在会变成「200 + 一条 error 事件」，客户端拿不到该有的 404。
 * 与 `generate/stream` 不同，这条流**断开即停手**：它只改大纲、不落页面，
 * 中途停手没有「项目卡在生成中」的后患（理由在 generate/stream 那边的注释里）。
 */
projectsRouter.get('/:id/plan/outline/stream', async (req, res) => {
  const { id } = parseParams(IdParam, req);
  const tenantId = tenantOf(req);
  const userId = userIdOf(req);
  const project = requireProject(id, tenantId);
  const q = parseQuery(z.object({
    pages: z.coerce.number().int().min(3).max(30).optional(),
    depth: DeckDepth.optional(),
  }), req);

  const depth = q.depth ?? (project.depth as DeckDepth) ?? 'standard';
  // 页数优先取这一次请求带的；没带就沿用项目上存着的——用户设过一次不该再设第二次
  const targetPages = q.pages ?? project.targetPages ?? undefined;
  // 把这一轮的设定存回项目，重跑时不必再传
  updateProject(id, tenantId, {
    depth,
    ...(q.pages !== undefined ? { targetPages: q.pages } : {}),
  });

  // 校验放在开流之前：被拒时回的是干净的 409 JSON，而不是「200 + 一条 error 事件」。
  // 真正的互斥由 `planDeckOutline` 里的取锁保证，这里只是把常见情形提前拦住
  assertGenerationFree(id);

  const sse = openSse(res);
  try {
    for await (const evt of planDeckOutline({
      projectId: id,
      tenantId,
      userId,
      depth,
      ...(targetPages !== undefined ? { targetPages } : {}),
      gateway: billedGateway(tenantId, userId),
    })) {
      if (sse.closed) break;
      sse.send(evt.event, evt.data);
    }
  } catch (err) {
    sse.send('error', { message: err instanceof Error ? err.message : String(err) });
  } finally {
    sse.end();
  }
});

/** 生成教案：逐页把提纲写实。`only=0,1,2` 可只重跑某几页 */
projectsRouter.get('/:id/plan/lessons/stream', async (req, res) => {
  const { id } = parseParams(IdParam, req);
  const tenantId = tenantOf(req);
  const userId = userIdOf(req);
  requireProject(id, tenantId);
  const q = parseQuery(z.object({ only: z.string().optional() }), req);
  const only = q.only
    ? q.only.split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n))
    : undefined;

  assertGenerationFree(id);

  const sse = openSse(res);
  try {
    for await (const evt of planLessons({
      projectId: id,
      tenantId,
      userId,
      ...(only && only.length > 0 ? { only } : {}),
      gateway: billedGateway(tenantId, userId),
    })) {
      if (sse.closed) break;
      sse.send(evt.event, evt.data);
    }
  } catch (err) {
    sse.send('error', { message: err instanceof Error ? err.message : String(err) });
  } finally {
    sse.end();
  }
});

/* ---------------- 生成 ---------------- */

/**
 * 流式生成：SSE 逐页落地。
 *
 * **客户端断开不停手。** 这一轮自己跑完，用户刷新回来还能接着看到进度
 * （见下面循环里那段说明）。
 */
projectsRouter.get('/:id/generate/stream', async (req, res) => {
  const { id } = parseParams(IdParam, req);
  const tenantId = tenantOf(req);
  const userId = userIdOf(req);
  requireProject(id, tenantId);

  // 校验放在开流之前：被拒时回的是干净的 409 JSON，而不是「200 + 一条 error 事件」
  assertGenerationFree(id);

  const sse = openSse(res);
  try {
    /*
      **断开了也不 break。**

      这里原先跟着另外两条 SSE 路由写「断开即停手」，但那条口径是按「用户点了停止」
      想的，而断连还有另一种更常见的来源——**刷新页面**。实测用户报的就是这一条：
      刷新一下，回来发现生成停在半路，界面上关于「正在生成」的一切都没了，
      他既不知道是卡住了还是跑完了，也不知道停在哪一页。

      现在拆成两件事：
      - **断开（刷新、关标签页、断网）不影响这一轮**，它自己跑完；
      - **想停只有一条路**——`POST /generate/stop`，「停止」按钮走的就是它。

      断开之后不必再判 `sse.closed`：`openSse().send` 对已关闭的响应本来就静默跳过
      （见那个文件里对三份坏判据的说明），写向死 socket 不会把事情带崩。

      **网关必须走 `billedGateway`**：不带 `onUsage` 的网关会静默跳过记账。
      这条流原先没传，于是「逐页生成」这一整类开销在 `usage_records` 里一条都没有——
      管理后台的「用量与计费」少算的正是最贵的那一类（一页两三千 token 输入、
      一两万输出），而它不会报错、只会让账对不上。
    */
    for await (const evt of runHtmlGeneration({
      projectId: id, tenantId, userId, gateway: billedGateway(tenantId, userId),
    })) {
      sse.send(evt.event, evt.data);
    }
  } catch (err) {
    sse.send('error', { code: 'INTERNAL', message: err instanceof Error ? err.message : String(err) });
  } finally {
    refreshProjectCounts(id);
    sse.end();
  }
});

/**
 * 显式停止这个项目正在跑的那一轮生成。
 *
 * 它是**唯一的停止方式**：客户端断开（刷新、关标签页）不再打断生成，所以「停下来」
 * 必须由用户明说。没在跑时回 `stopped: false`，界面据此如实说「没在生成」，
 * 而不是给一个假装成功的按钮。
 */
projectsRouter.post('/:id/generate/stop', (req, res) => {
  const { id } = parseParams(IdParam, req);
  const tenantId = tenantOf(req);
  const userId = userIdOf(req);
  requireProject(id, tenantId);
  const stopped = requestStop(id);
  recordAudit({
    tenantId, userId, action: 'export', target: `generate:${id}:stop`, meta: { stopped }, ip: clientIp(req),
  });
  ok(res, { stopped });
});

/**
 * 这个项目现在在生成吗、正在写哪几页。
 *
 * 给**刷新之后的界面**用。进度原先只走 SSE，连接一断什么都不剩——用户回来看到的是
 * 几页不动的大纲行。进项目时问一次这里，就能把「第 N 页正在写、已等 M 秒」接着显示下去，
 * 之后靠轮询续着（那条连接已经不在了，没有事件可收）。
 */
projectsRouter.get('/:id/generate/progress', (req, res) => {
  const { id } = parseParams(IdParam, req);
  requireProject(id, tenantOf(req));
  ok(res, { running: isGenerating(id), kind: generationKind(id), pages: livePagesOf(id) });
});

/** 非流式生成，供脚本与冒烟测试使用 */
projectsRouter.post('/:id/generate', async (req, res) => {
  const { id } = parseParams(IdParam, req);
  const tenantId = tenantOf(req);
  const userId = userIdOf(req);
  requireProject(id, tenantId);
  const body = parseBody(z.object({ regenerate: z.boolean().optional() }), req);

  const summary = { total: 0, succeeded: 0, failed: 0 };
  for await (const evt of runHtmlGeneration({
    projectId: id,
    tenantId,
    userId,
    gateway: billedGateway(tenantId, userId),
    ...(body.regenerate ? { regenerate: true } : {}),
  })) {
    if (evt.event === 'done') Object.assign(summary, evt.data);
  }
  recordAudit({ tenantId, userId, action: 'export', target: `generate:${id}`, meta: summary, ip: clientIp(req) });
  ok(res, summary);
});

/* ---------------- 页面 ---------------- */

/** 批量重算整份 deck 的讲稿（PRD §5.9 路径 A） */
projectsRouter.post('/:id/scripts', (req, res) => {
  const { id } = parseParams(IdParam, req);
  const tenantId = tenantOf(req);
  requireProject(id, tenantId);
  const queued = regenerateProjectScripts(id, tenantId);
  recordAudit({ tenantId, userId: userIdOf(req), action: 'script_generate', target: `project:${id}:scripts`, meta: { queued }, ip: clientIp(req) });
  ok(res, { queued }, 202);
});

/**
 * 给整本项目的就绪页排讲解配音。
 *
 * **配音不走页面生成那条自动链路**：一页合成实测 15~35 秒，整本要跑十几分钟，
 * 用户得先在内容上确认完再点这个按钮，而不是一生成就默默烧钱。
 */
projectsRouter.post('/:id/narration', (req, res) => {
  const { id } = parseParams(IdParam, req);
  const tenantId = tenantOf(req);
  requireProject(id, tenantId);
  const queued = enqueueProjectNarration(id, tenantId);
  recordAudit({
    tenantId, userId: userIdOf(req), action: 'tts_generate',
    target: `project:${id}:narration`, meta: { queued }, ip: clientIp(req),
  });
  ok(res, { queued }, 202);
});

/**
 * 整本批量任务的暂停 / 继续 / 停止。
 *
 * **讲稿与配音共用这一套**：两者都在同一个队列、同一个 `groupKey`（租户/项目）下，
 * 只有 `kind` 不同，所以按 kind 一筛就能分别控制。分开写两份的话，
 * 下次改队列语义（比如「暂停要不要连正在跑的也停」）就得记得改两处。
 *
 * **只动排队中的任务**：正在跑的那几页让它们跑完——中断既拿不回已经花掉的模型调用，
 * 也可能让 worker 把半截结果写进库。
 *
 * 停止是「删掉」，不是标记：留着的排队任务会让前端的进度条一直停在半路。
 */
function groupControl(kind: 'tts' | 'script_generate', action: 'pause' | 'resume' | 'stop') {
  return (req: Request, res: Response): void => {
    const { id } = parseParams(IdParam, req);
    const tenantId = tenantOf(req);
    requireProject(id, tenantId);
    const queue = apiQueue();
    const filters = { groupKey: groupKeyOf(tenantId, id), kind };
    const changed = action === 'pause'
      ? queue.pauseGroup(filters)
      : action === 'resume'
        ? queue.resumeGroup(filters)
        : queue.stopGroup(filters);
    ok(res, { action, changed });
  };
}

for (const action of ['pause', 'resume', 'stop'] as const) {
  projectsRouter.post(`/:id/narration/${action}`, groupControl('tts', action));
  projectsRouter.post(`/:id/scripts/${action}`, groupControl('script_generate', action));
}

projectsRouter.get('/:id/pages', (req, res) => {
  const { id } = parseParams(IdParam, req);
  requireProject(id, tenantOf(req));
  ok(res, listPages(id).map((row) => ({
    pageId: row.pageId, pageIndex: row.pageIndex, status: row.status, version: row.version, page: pageIR(row),
  })));
});

/**
 * 封面用的那一页：只取第 0 页。
 *
 * **为什么不把第 0 页塞进 `GET /projects`**：列表上每张卡片都要渲染一个 iframe，
 * 跟着列表一起发等于一次挂「项目总数」个 iframe——50 个项目不是慢一点，是会卡住。
 * 配前端的懒加载（卡片滚进视口才请求），这个端点一次只为看得见的那几张服务。
 *
 * 没有生成过任何页面时回 `null`，前端据此退回文字占位。
 */
projectsRouter.get('/:id/cover', (req, res) => {
  const { id } = parseParams(IdParam, req);
  requireProject(id, tenantOf(req));
  const first = listPages(id).find((row) => row.pageIndex === 0);
  ok(res, { page: first ? pageIR(first) : null });
});

/** 按大纲序号生成单页（工作台骨架屏上的「优先生成」，PRD §5.5） */
projectsRouter.post('/:id/pages/:index/generate', async (req, res) => {
  const { id } = parseParams(IdParam, req);
  const { index } = parseParams(z.object({ index: z.coerce.number().int().min(0) }), req);
  const page = await generatePageHtmlAt(id, tenantOf(req), userIdOf(req), index);
  ok(res, { page });
});

projectsRouter.post('/:id/pages', (req, res) => {
  const { id } = parseParams(IdParam, req);
  const tenantId = tenantOf(req);
  requireProject(id, tenantId);
  const body = parseBody(z.object({
    pageType: PageType,
    afterIndex: z.coerce.number().int().min(0).optional(),
  }), req);

  const pack = ensureStyle(id, tenantId);
  const existing = listPages(id);
  const at = body.afterIndex === undefined ? existing.length : body.afterIndex + 1;
  const page = newBlankPage(body.pageType, pack, at, existing.length + 1);
  insertPageAt(id, tenantId, page, at);
  refreshProjectCounts(id);
  ok(res, { pageId: page.pageId, page }, 201);
});

projectsRouter.put('/:id/pages/order', (req, res) => {
  const { id } = parseParams(IdParam, req);
  const body = parseBody(z.object({ pageIds: z.array(z.string()).min(1) }), req);
  reorderPages(id, tenantOf(req), body.pageIds);
  ok(res, { reordered: body.pageIds.length });
});

/* ---------------- 单页 ---------------- */

export const pagesRouter = Router();
pagesRouter.use(requireAuth, requirePasswordChanged, requireTenant);

pagesRouter.get('/:pageId', (req, res) => {
  const { pageId } = parseParams(PageIdParam, req);
  const row = getPage(pageId, tenantOf(req));
  ok(res, { pageId: row.pageId, status: row.status, version: row.version, page: pageIR(row) });
});

/**
 * 这一页的讲解音频。
 *
 * 命中缓存就直接回，没有就现合成再回。**同步回字节流而不是走 SSE**：演示端要的是
 * 一个能直接喂给音频元素的响应，不是进度事件；而 3~4 秒的合成延迟由演示端
 * 预取下一页掩盖掉，用户感觉不到。
 *
 * 音频是内容寻址的（key 里带讲稿/音色/语气的哈希），所以同一份内容不会变；
 * 但改了设置就会换 key，于是交给调用方按 URL 缓存即可。
 */
pagesRouter.get('/:pageId/narration', async (req, res) => {
  const { pageId } = parseParams(PageIdParam, req);
  const tenantId = tenantOf(req);
  const audio = await ensureNarration({
    pageId,
    tenantId,
    gateway: billedGateway(tenantId, userIdOf(req)),
  });
  res.setHeader('Content-Type', audio.mime);
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  res.send(audio.buffer);
});

pagesRouter.put('/:pageId', (req, res) => {
  const { pageId } = parseParams(PageIdParam, req);
  const body = parseBody(z.object({
    page: z.record(z.unknown()),
    pageIndex: z.coerce.number().int().min(0).optional(),
  }), req);
  const row = getPage(pageId, tenantOf(req));
  const before = pageIR(row);
  const page = PageIR.parse({ ...body.page, pageId });
  // 讲稿被改动过就打上标记，之后重生成页面不会再把它冲掉
  const scriptTouched = JSON.stringify(page.script) !== JSON.stringify(before.script);
  const next = scriptTouched ? PageIR.parse({ ...page, script: { ...page.script, edited: true } }) : page;
  const saved = savePage(row.projectId, tenantOf(req), next, body.pageIndex ?? row.pageIndex);
  // 上面刚读过这一行，正常不会为空；真为空说明它在毫秒之间被删了，如实报 404
  if (!saved) throw notFound('页面不存在');
  refreshProjectCounts(row.projectId);
  ok(res, { pageId: saved.pageId, status: saved.status, version: saved.version, page: pageIR(saved) });
});

pagesRouter.delete('/:pageId', (req, res) => {
  const { pageId } = parseParams(PageIdParam, req);
  const row = getPage(pageId, tenantOf(req));
  deletePage(pageId, tenantOf(req));
  refreshProjectCounts(row.projectId);
  ok(res, { deleted: true });
});

/**
 * 单页重生成（非流式）。
 *
 * 注意它**不是**「1 秒内响应」：一次重跑就是一整次模型调用，实测 85 秒起步，
 * 碰上 lint 不过还要再来一次。工作台用的是下面那条流式版本；
 * 这条留给脚本与冒烟测试。
 */
pagesRouter.post('/:pageId/regenerate', async (req, res) => {
  const { pageId } = parseParams(PageIdParam, req);
  // 网关不传也用 `billedGateway`（`generatePageHtml` 的默认值），
  // 但这里显式传上，免得以后默认值改了这条入口静默漏记账
  const page = await regeneratePageHtml(
    pageId, tenantOf(req), userIdOf(req), billedGateway(tenantOf(req), userIdOf(req)),
  );
  ok(res, { pageId: page.pageId, page });
});

/**
 * 按提示词给**某一个图位**生成一张图（右栏图片面板上的「重新生成」）。
 *
 * **走流式**：出图实测几十秒，与「重跑这一页」同一类等待，界面上要给得出进展，
 * 否则又是那个「转圈很久没结果」。
 *
 * **不管透明底。** 曾经这里有个 `cutout=1` 会带上 `background: 'transparent'`——
 * 实测图片模型会静默忽略那个参数、把「透明」画成棋盘格，用户拿到一张格子图却看到
 * 「已生成」。现在透明底走另一条路：出完图再由 `image/cutout/stream` 送去抠图服务真抠，
 * 见那里的注释。
 *
 * **不写库**：生成完把 URL 交回前端，前端写进 `page.overrides.images[n].src`——
 * 与面板上「从图库选」是同一条路。这样「生成了一张但没保存」与「换了一张但没保存」
 * 是同一种状态，用户按一次「保存本页」一起落盘。
 */
pagesRouter.get('/:pageId/image/stream', async (req, res) => {
  const { pageId } = parseParams(PageIdParam, req);
  const tenantId = tenantOf(req);
  const userId = userIdOf(req);
  const q = parseQuery(z.object({
    slot: z.coerce.number().int().min(0),
    prompt: z.string().max(2000).optional(),
  }), req);
  const row = getPage(pageId, tenantId);

  const prompt = slotImagePrompt(pageIR(row), q.prompt ?? '');

  const sse = openSse(res);
  const startedAt = Date.now();
  try {
    sse.send('progress', { label: '正在生成图片', elapsedMs: 0 });
    const result = await billedGateway(tenantId, userId).image({
      taskType: 'image',
      prompt,
      size: '1536x1024',
      ratio: '16:9',
      quality: 'high',
      n: 1,
    });
    const first = result.images[0];
    if (!first) throw new Error('图片模型没有返回任何图片');
    // 文件名带时间戳：同一个图位反复生成时不能互相覆盖，否则用户点「还原」就回不去了
    const key = objectKey(
      tenantId, row.projectId, 'images', `${pageId}/slot-${q.slot}-${Date.now()}.png`,
    );
    const url = await createStorage().put(key, first.buffer, first.mime);
    sse.send('image', { slot: q.slot, url, elapsedMs: Date.now() - startedAt });
  } catch (err) {
    sse.send('error', { message: err instanceof Error ? err.message : String(err) });
  } finally {
    sse.end();
  }
});

/**
 * 把**某一个图位现在那张图**送去抠图，回来一张透明底的（右栏图片面板上的「抠图」）。
 *
 * 与上面那条分开，因为做的事不一样：那条是**生成一张新图**，这条是**抠现有的图**。
 * 抠图位上点「重新生成」时，前端会连着调这一条，两步并成一步。
 *
 * **走流式**：取原图 + 抠 + 落盘实测三四秒，与「重新生成」同一类等待。
 *
 * **不写库**：同「重新生成」，交回 URL 由前端写进覆盖表。
 */
pagesRouter.get('/:pageId/image/cutout/stream', async (req, res) => {
  const { pageId } = parseParams(PageIdParam, req);
  const tenantId = tenantOf(req);
  const q = parseQuery(z.object({
    slot: z.coerce.number().int().min(0),
    /**
     * 这一位现在那张图的地址。**由面板传过来，不在服务端重算**——面板手里那份
     * `imageSlotsOf` 的结果就是有效值（换过图、抠过图都算进去了），服务端要自己算
     * 得把风格文档、色板、素材库都拉进来重跑一遍同一套规则，而结果未必一致。
     * 代价是 `src` 成了用户输入，所以下面 `readSlotImage` 只认两种前缀。
     */
    src: z.string().min(1).max(500),
  }), req);
  const row = getPage(pageId, tenantId);
  // 地址合不合法在**开流之前**判：那是客户端错误，该给 400，不是一条 SSE error
  const ref = slotImageRef(q.src, tenantId);

  const sse = openSse(res);
  const startedAt = Date.now();
  try {
    sse.send('progress', { label: '正在读取原图', elapsedMs: 0 });
    const source = await readSlotImage(ref);

    sse.send('progress', { label: '正在抠图', elapsedMs: Date.now() - startedAt });
    const cut = await cutoutImage(source);

    const key = objectKey(
      tenantId, row.projectId, 'images', `${pageId}/slot-${q.slot}-cutout-${Date.now()}.png`,
    );
    const url = await createStorage().put(key, cut.buffer, cut.mime);
    sse.send('image', { slot: q.slot, url, elapsedMs: Date.now() - startedAt });
  } catch (err) {
    sse.send('error', { message: err instanceof Error ? err.message : String(err) });
  } finally {
    sse.end();
  }
});

/** `src` 指向哪张图。只有这两种，见 `slotImageRef` */
type SlotImageRef =
  | { kind: 'stock'; photo: StockPhoto }
  | { kind: 'file'; key: string };

/**
 * 把 `src` 解成一个可读的引用。
 *
 * **只认两种前缀，别的一律拒。** `src` 是前端传上来的，服务端照着它去读文件，
 * 放开了就是一个任意文件读取：
 * - `/stock/<file>`：本仓素材库。**从清单里反查**，不拿请求里的文件名去拼路径——
 *   拼了就得自己防穿越，而清单里本来就有白名单。
 * - `/files/<key>`：对象存储。key 必须落在**本租户**下，免得 A 租户拿 B 租户的 key
 *   去抠出一份自己的副本。
 */
function slotImageRef(src: string, tenantId: string): SlotImageRef {
  if (src.startsWith('/stock/')) {
    const photo = STOCK_PHOTOS.find((p) => stockUrl(p) === src);
    if (!photo) throw invalid('这张素材不在图库里');
    return { kind: 'stock', photo };
  }

  const key = src.startsWith('/files/') ? decodeURIComponent(src.slice('/files/'.length)) : null;
  if (!key) throw invalid('只支持图库素材与本项目上传的图');
  if (!key.startsWith(`${tenantId}/`)) throw invalid('这张图不属于当前项目');
  return { kind: 'file', key };
}

/** 读出来，连同 MIME 与文件名——抠图服务要拿文件名判格式 */
async function readSlotImage(
  ref: SlotImageRef,
): Promise<{ buffer: Buffer; mime: string; filename: string }> {
  if (ref.kind === 'stock') {
    return {
      buffer: await readStockFile(ref.photo.file),
      mime: mimeOfName(ref.photo.file) ?? 'image/jpeg',
      filename: ref.photo.file,
    };
  }

  let buffer: Buffer;
  try {
    buffer = await createStorage().get(ref.key);
  } catch {
    throw invalid('原图不存在或已过期');
  }
  const filename = ref.key.split('/').pop() ?? 'image.png';
  return { buffer, mime: mimeOfName(filename) ?? 'image/png', filename };
}

/**
 * 图位的生成提示词。
 *
 * **留空时要现拼一句**：新链路的图位没有提示词——那是旧链路 `ImageBlock` 才有的字段。
 * 拼的是「这一页在讲什么」而不是「画一张图」：图位配的是这一页的配图，
 * 脱离页面内容生成的图放进版面上会很突兀。
 *
 * 那两句约束不是可选的：`lintPage` 有一条规则要求图片提示词必须显式写「不生成文字」
 * 与「不生成可识别真人」（PRD §5.15），图片块那条链路一直这么做。这里走的是另一条
 * 入口，但产出的图会落在同一张版面上，标准得一致。
 */
function slotImagePrompt(page: ReturnType<typeof pageIR>, given: string): string {
  const base = given.trim()
    || [page.title.main, page.title.sub].map((s) => s.trim()).filter((s) => s !== '').join('：');
  return [
    base,
    '',
    '要求：画面里不要出现任何文字、Logo、水印，也不要出现可识别的真人面孔。',
    '构图简洁、主体明确、四周留出呼吸空间——这张图会作为配图放进一页演示文稿里。',
  ].join('\n');
}

/**
 * 单页重生成（流式）。工作台右栏与画布上的「重新生成」走这条。
 *
 * 为什么必须流式：**一页要等几十秒到几分钟**。原先走上面那个 POST，
 * 界面上只有一个转圈，用户分不清是在跑还是卡死了——实测被报成「转圈很久没结果」。
 * 这里把服务端走到哪一步、已经等了多久推出来，界面上就有话说。
 */
pagesRouter.get('/:pageId/regenerate/stream', async (req, res) => {
  const { pageId } = parseParams(PageIdParam, req);
  const tenantId = tenantOf(req);
  const userId = userIdOf(req);
  // 两条校验都放在开流之前：404 / 409 是干净的 JSON，
  // 而不是「200 + 一条 error 事件」——后者客户端要解析流才知道失败
  const row = getPage(pageId, tenantId);
  /*
    只挡「同一页重复点」，**不挡整本**。

    这里原先用的是 `assertGenerationFree`——整本一跑，用户对着没出来的那一页点重试
    必然回 409，而那正是他此刻最想点的一下。整本与手动单页写的东西不一样（一个写全书、
    一个只写自己那一格），本来就不该互斥（见 `generation-lock.ts` 顶部）。
  */
  assertPageFree(row.projectId, row.pageIndex);

  /**
   * 可选：指定这一页用哪一份版式骨架（工作台的「换排版」）。
   *
   * 校验也放在开流之前，而且**在这一页的页类型与骨架的模块之间做一次对表**——
   * 拿一份人物骨架去排图片页，生成出来的东西既不是人物页也不是图片页，
   * 而没有任何一处会报错，只是这一页悄悄变得不对。宁可在入口挡掉。
   */
  const layoutId = typeof req.query.layoutId === 'string' ? req.query.layoutId : '';

  /**
   * 顺带把这一页的页类型落进大纲（工作台的「转成图文页」）。
   *
   * **必须在这一层改，而且只改这一页。** 两个原因：
   * 1. 下面那道对表读的是大纲里的 pageType，不先改就会被按旧类型挡回去；
   * 2. 前端自己去调 `PUT /outline` 是不行的——那个端点写完会删掉
   *    `pageIndex >= outline.length` 的页行，而「转成图文页」不该删任何页。
   *    实测踩过：一个 13 页的项目（大纲 8 条）当场被删到 6 页。
   */
  const nextPageType = typeof req.query.pageType === 'string' ? req.query.pageType : '';
  if (nextPageType) {
    const parsed = PageType.safeParse(nextPageType);
    if (!parsed.success) throw invalid(`认不出的页类型：${nextPageType}`);
    setOutlinePageType(row.projectId, tenantId, row.pageIndex, parsed.data);
  }

  let forcedLayout: StudioLayout | undefined;
  if (layoutId) {
    const layout = resolveLayoutForPrompt(layoutId);
    if (!layout) throw invalid('这份版式不在功能库里，可能已经被删掉了');
    const outlinePageType = readDeckMeta(row.projectId).outline?.[row.pageIndex]?.pageType ?? '';
    const wantModule = moduleOfPageType(outlinePageType);
    /**
     * **这一页压根没有专属版式库时放行。**
     *
     * 原先这里一律对表，于是封面、目录、正文这些页类型**根本换不了排版**——
     * 而用户明确要的恰恰相反：那些页的版面本来由风格提示词决定，但「换一种排法试试」
     * 是合理诉求，工作台的「功能库」那一屏就是给它们开的一整屏骨架让他挑。
     * 拦在这里，用户看到的是一个点了没反应的按钮加一句莫名其妙的报错。
     *
     * **有专属库的页类型仍然挡**：拿一份人物骨架去排图片页，生成出来的东西既不是
     * 人物页也不是图片页，而没有任何一处会报错，只是这一页悄悄变得不对——
     * 那种「悄悄地不对」正是这道对表要防的。
     */
    if (wantModule !== null && wantModule !== moduleOfLayoutId(layoutId)) {
      throw invalid('这份版式与当前页类型不是一类的，换不了');
    }
    forcedLayout = layout;
  }

  const sse = openSse(res);
  const startedAt = Date.now();
  try {
    const page = await regeneratePageHtml(
      pageId, tenantId, userId, billedGateway(tenantId, userId),
      (label) => sse.send('progress', { label, elapsedMs: Date.now() - startedAt }),
      forcedLayout,
    );
    sse.send('page', { pageId: page.pageId, page, elapsedMs: Date.now() - startedAt });
  } catch (err) {
    sse.send('error', { code: 'INTERNAL', message: err instanceof Error ? err.message : String(err) });
  } finally {
    sse.end();
  }
});

/** 重新生成单页讲稿（PRD §5.9 路径 A）。显式操作，会清掉人工编辑标记。 */
pagesRouter.post('/:pageId/script', (req, res) => {
  const { pageId } = parseParams(PageIdParam, req);
  const row = getPage(pageId, tenantOf(req));
  regenerateScript(pageId, tenantOf(req));
  recordAudit({
    tenantId: tenantOf(req), userId: userIdOf(req), action: 'script_generate',
    target: `page:${pageId}:script`, ip: clientIp(req),
  });
  ok(res, { pageId, projectId: row.projectId, queued: true }, 202);
});

/**
 * 重新生成单页讲解配音。
 *
 * 讲稿改过之后这一页的音频本来就会失效（内容哈希变了），这个入口是给用户一个显式的
 * 按钮，不用为了改一页去点整本。
 */
pagesRouter.post('/:pageId/narration', (req, res) => {
  const { pageId } = parseParams(PageIdParam, req);
  const row = getPage(pageId, tenantOf(req));
  enqueuePageNarration(pageId, tenantOf(req));
  recordAudit({
    tenantId: tenantOf(req), userId: userIdOf(req), action: 'tts_generate',
    target: `page:${pageId}:narration`, ip: clientIp(req),
  });
  ok(res, { pageId, projectId: row.projectId, queued: true }, 202);
});
