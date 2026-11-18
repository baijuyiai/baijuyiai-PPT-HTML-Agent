import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import {
  invalid, notFound, ok, requireAdmin, purgeStockPhoto, purgeStockPhotos, readStockManifest,
  restoreStockPhoto, trashStockPhoto,
} from '@lumen/server-core';

/**
 * 素材库管理：进回收站 / 恢复 / 彻底删除。
 *
 * 挂在 `/api/admin` 下，因为它是**改仓库里的文件**——不是某个用户自己的数据。
 * 普通用户看得到图片库（`/images`），但删不了里面的东西。
 *
 * 删除的语义见 `stock-admin.service.ts`：进回收站只打标记、文件留着，已用在项目里
 * 的页面照常显示；彻底删除才真删文件。
 */
export const adminStockRouter = Router();
adminStockRouter.use(requireAdmin);

/** 文件名来自清单，但仍然要收窄字符集——这一层不负责白名单，只负责别把怪东西传下去 */
const FileParam = z.object({ file: z.string().min(1).max(200).regex(/^[A-Za-z0-9._-]+$/) });

/** 批量彻底删除的请求体。上限五百是防呆：回收站里本来也不会有更多 */
const PurgeBody = z.object({ files: z.array(FileParam.shape.file).min(1).max(500) });

/** 完整清单，含回收站里的（界面上要分两栏显示） */
adminStockRouter.get('/', async (_req: Request, res: Response) => {
  const items = await readStockManifest();
  ok(res, { items });
});

/**
 * 批量彻底删除。回收站的「全选 → 彻底删除」走这条。
 *
 * **注册在 `/:file/...` 那几条之前**：`POST /purge` 只有一段，与 `/:file/trash` 的两段
 * 本来不冲突，但顺序写反了以后再加单段路由就会踩到。
 */
adminStockRouter.post('/purge', async (req: Request, res: Response) => {
  const { files } = PurgeBody.parse(req.body);
  await guard(res, () => purgeStockPhotos(files));
});

adminStockRouter.post('/:file/trash', async (req: Request, res: Response) => {
  const { file } = FileParam.parse(req.params);
  await guard(res, () => trashStockPhoto(file).then(() => ({ file })));
});

adminStockRouter.post('/:file/restore', async (req: Request, res: Response) => {
  const { file } = FileParam.parse(req.params);
  await guard(res, () => restoreStockPhoto(file).then(() => ({ file })));
});

adminStockRouter.delete('/:file', async (req: Request, res: Response) => {
  const { file } = FileParam.parse(req.params);
  await guard(res, () => purgeStockPhoto(file).then(() => ({ file })));
});

/** 三个写操作长得一模一样，只有「不存在」与「没法写盘」两种错 */
async function guard(res: Response, run: () => Promise<unknown>): Promise<void> {
  try {
    ok(res, await run());
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('不在图库里')) throw notFound(message);
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EROFS') {
      throw invalid('素材目录是只读的，改不了清单');
    }
    throw err;
  }
}
