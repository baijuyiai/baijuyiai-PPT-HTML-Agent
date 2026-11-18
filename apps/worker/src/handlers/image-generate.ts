import { PageIR, type ImageBlock } from '@lumen/ir-schema';
import type { ImageResult } from '@lumen/provider-gateway';
import { logger, pageIR, savePage } from '@lumen/server-core';
import { objectKey } from '@lumen/storage';
import { encodePlaceholderPng } from '../png.js';
import { asString, requireString, requireTaskPage } from '../util.js';
import type { WorkerContext } from '../context.js';
import type { TaskHandler } from './index.js';

/**
 * 图片生成。
 *
 * 注意：图片块的 prompt 在内容侧已经强制不含文字 / Logo / 可识别真人，
 * worker 一律原样透传，不做任何改写。
 */

/** 占位图尺寸：够用即可，避免失败路径产出大位图 */
const PLACEHOLDER_WIDTH = 1280;
const PLACEHOLDER_HEIGHT = 720;

/** 调用网关生成一张图，失败时重试一次；两次都失败则抛错交由上层降级 */
async function generateImage(
  ctx: WorkerContext,
  req: { prompt: string; size: string; ratio: string; quality: string },
  attempts = 2,
): Promise<ImageResult> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await ctx.gateway.image({
        taskType: 'image',
        prompt: req.prompt,
        size: req.size,
        ratio: req.ratio,
        quality: req.quality,
        n: 1,
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export const imageGenerate: TaskHandler = async (task, ctx) => {
  const pageId = requireString(task.payload.pageId ?? task.pageId, 'pageId');
  const blockId = asString(task.payload.blockId) ?? '';
  const prompt = asString(task.payload.prompt) ?? '';
  const size = asString(task.payload.size) ?? '1536x1024';
  const ratio = asString(task.payload.ratio) ?? '16:9';
  const quality = asString(task.payload.quality) ?? 'high';

  const row = requireTaskPage(pageId, task.tenantId);

  let image: { buffer: Buffer; mime: string };
  let failed = false;
  try {
    const result = await generateImage(ctx, { prompt, size, ratio, quality });
    const first = result.images[0];
    if (!first) throw new Error('图片模型没有返回任何图片');
    image = first;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('图片生成失败，降级为占位图', { taskId: task.taskId, pageId, blockId, message });
    failed = true;
    image = { buffer: encodePlaceholderPng(PLACEHOLDER_WIDTH, PLACEHOLDER_HEIGHT), mime: 'image/png' };
  }

  const key = objectKey(
    task.tenantId,
    task.projectId ?? row.projectId,
    'images',
    `${pageId}/${blockId || '0'}.png`,
  );
  const url = await ctx.storage.put(key, image.buffer, image.mime);

  const page = pageIR(row);
  let matched = false;
  const blocks = page.blocks.map((block): typeof block => {
    if (block.type !== 'image') return block;
    // 已回填过一个块就跳过；blockId 为空时落到第一个图片块，否则精确匹配
    if (matched) return block;
    if (blockId && block.id !== blockId) return block;
    matched = true;
    return {
      ...block,
      src: url,
      status: failed ? 'failed' : 'ready',
      placeholderReason: failed ? '图片生成失败，请替换' : '',
    } satisfies ImageBlock;
  });

  if (!matched) {
    logger.warn('图片任务没有找到目标图片块，跳过回填', { taskId: task.taskId, pageId, blockId });
    return failed ? { degradeReason: '图片生成失败，已降级占位图' } : {};
  }

  savePage(row.projectId, row.tenantId, PageIR.parse({ ...page, blocks }), row.pageIndex);
  return failed ? { degradeReason: '图片生成失败，已降级占位图' } : {};
};
