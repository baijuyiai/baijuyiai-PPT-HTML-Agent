import { getPage, listPages, pageIR } from './project.service.js';
import { narrationTextOf } from './narration.service.js';
import { apiQueue } from './task.service.js';

/**
 * 讲解配音的派发。
 *
 * 与 `script.service.ts` 对讲稿的关系一样：这里只负责把任务送进队列，真正的合成由
 * worker 的 `tts` handler 做。单独放一个文件是为了让 `narration.service.ts` 不必依赖
 * 队列——那边是纯粹的「合成与缓存」，测试里不用把队列也起起来。
 *
 * **为什么走队列而不是进程内并发**：一页合成实测 15~35 秒，30 页就是 10 分钟上下，
 * 属于后台任务——用户关掉页面也得跑完。队列自带重试与 `maxAttempts`，还省得自己写
 * 断点续跑。同项目的并发由队列的 `groupConcurrency`（默认 3）限住，不必另外加闸。
 */

/** 这一页要不要排配音。没讲稿、或页面还没就绪，都不排——排了 worker 也只会抛错 */
function shouldQueue(page: ReturnType<typeof pageIR>): boolean {
  return page.status === 'ready' && narrationTextOf(page) !== '';
}

/** 给整本项目的就绪页排配音，返回派发了几页 */
export function enqueueProjectNarration(projectId: string, tenantId: string): number {
  let count = 0;
  for (const row of listPages(projectId)) {
    if (row.tenantId !== tenantId) continue;
    if (!shouldQueue(pageIR(row))) continue;
    enqueueOne(projectId, tenantId, row.pageId);
    count += 1;
  }
  return count;
}

/**
 * 只重排一页的配音。
 *
 * 讲稿改过之后这一页的音频本来就会失效（内容哈希变了），这个入口是给用户一个
 * 显式的按钮，不用为了改一页去点整本。`getPage` 顺带把越权与不存在的页挡掉。
 */
export function enqueuePageNarration(pageId: string, tenantId: string): void {
  const row = getPage(pageId, tenantId);
  if (!shouldQueue(pageIR(row))) throw new Error('这一页还没有可朗读的内容');
  enqueueOne(row.projectId, tenantId, pageId);
}

/**
 * 入队一页。nonce 让显式重跑总能排进队列，不被同内容的幂等键挡掉——
 * 与 `script.service.ts` 的 `enqueueScript` 同一套做法。
 */
function enqueueOne(projectId: string, tenantId: string, pageId: string): void {
  apiQueue().enqueue({
    tenantId,
    projectId,
    pageId,
    kind: 'tts',
    idemKey: `tts:${pageId}:${Date.now()}`,
    payload: { pageId },
    maxAttempts: 2,
  });
}
