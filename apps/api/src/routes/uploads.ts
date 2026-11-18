import { Router } from 'express';
import { z } from 'zod';
import { ok, objectKey, createStorage, requireAuth, requireTenant, tenantOf, parseBody, requirePasswordChanged } from '@lumen/server-core';
import { invalid } from '@lumen/server-core';

export const uploadsRouter = Router();
uploadsRouter.use(requireAuth, requirePasswordChanged, requireTenant);

const MAX_BYTES = 6 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
};

const UploadSchema = z.object({
  /** data URL，形如 data:image/png;base64,... */
  dataUrl: z.string().min(32),
  /** 归属项目。**品牌 logo 必须带**：重绘时要求 `imageKey` 以 `<tenantId>/<projectId>/uploads/` 开头，
   *  不带的话 key 会落在字面量 `uploads/` 分区里，每次合法重绘都会 400 */
  projectId: z.string().optional(),
  name: z.string().optional(),
});

/**
 * 图片上传。前端已经用 canvas 统一转成 PNG/JPEG，这里只做尺寸与类型校验后落对象存储。
 * 返回的 URL 可直接写进 Page IR 的 image block.src。
 */
uploadsRouter.post('/', (req, res) => {
  const body = parseBody(UploadSchema, req);

  const m = /^data:([^;,]+);base64,(.+)$/s.exec(body.dataUrl);
  if (!m) throw invalid('只接受 base64 编码的 data URL');

  const mime = m[1]!.toLowerCase();
  if (!MIME_EXT[mime]) throw invalid(`不支持的图片类型：${mime}`);

  const buffer = Buffer.from(m[2]!, 'base64');
  if (buffer.byteLength > MAX_BYTES) {
    throw invalid(`图片超过 ${Math.round(MAX_BYTES / 1024 / 1024)}MB 上限`);
  }

  const ext = MIME_EXT[mime]!;
  const safeName = (body.name ?? 'image').replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) || 'image';
  const key = objectKey(
    tenantOf(req),
    body.projectId ?? 'uploads',
    'uploads',
    `${Date.now()}-${safeName}.${ext}`,
  );

  const storage = createStorage();
  void storage.put(key, buffer, mime).then((url) => {
    ok(res, { url, key, bytes: buffer.byteLength, mime }, 201);
  }).catch((err: unknown) => {
    res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL', message: err instanceof Error ? err.message : '写入对象存储失败' },
    });
  });
});
