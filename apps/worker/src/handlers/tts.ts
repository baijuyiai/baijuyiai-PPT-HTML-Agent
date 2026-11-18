import { synthesizeNarration } from '@lumen/server-core';
import { requireString, requireTaskPage } from '../util.js';
import type { TaskHandler } from './index.js';

/**
 * 逐页讲解音频。
 *
 * **目前没有入队方**：演示端走的是 `GET /api/pages/:id/narration` 的按需合成
 * （音频按内容哈希命名，命中就复用），那条路不必经过队列，也就不需要等 worker。
 * 这里留着是给「批量预生成整本讲解」这类后台任务用的——`TaskKind 'tts'` 本来就在
 * 任务分类里，把它删掉要连带改一个无关包的十几处测试夹具。
 *
 * 音色与语气取全局设置，不从 payload 传：一份演示的讲解就该是一个人的声音，
 * 逐任务配只会让同一套内容在不同地方听起来像两个人。
 */
export const ttsHandler: TaskHandler = async (task, ctx) => {
  const pageId = requireString(task.payload.pageId ?? task.pageId, 'pageId');
  requireTaskPage(pageId, task.tenantId);

  await synthesizeNarration({
    pageId,
    tenantId: task.tenantId,
    gateway: ctx.gateway,
  });

  return {};
};
