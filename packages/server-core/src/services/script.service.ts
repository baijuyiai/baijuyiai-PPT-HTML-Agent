import { PageIR } from '@lumen/ir-schema';
import { getPage, listPages, pageIR, savePage } from './project.service.js';
import { apiQueue } from './task.service.js';

/**
 * 讲稿派发（PRD §5.9 路径 A）。
 *
 * 讲稿正文由 worker 的 script_generate handler 用规则模板串出来——不调模型，
 * 保证同一份 Page IR 必得同一份讲稿、可离线复现、可被测试断言。
 * 这里只负责把任务送进队列，以及维护「人工改过」这个标记。
 */

/** 重新生成某一页的讲稿。这是显式操作，会清掉人工编辑标记。 */
export function regenerateScript(pageId: string, tenantId: string): void {
  const row = getPage(pageId, tenantId);
  const page = pageIR(row);
  if (page.script.edited) {
    savePage(
      row.projectId,
      tenantId,
      PageIR.parse({ ...page, script: { ...page.script, edited: false } }),
      row.pageIndex,
    );
  }
  enqueueScript(row.projectId, tenantId, pageId, `manual:${Date.now()}`);
}

/** 给项目里所有就绪页批量派发讲稿任务，返回派发数量 */
export function regenerateProjectScripts(projectId: string, tenantId: string): number {
  let count = 0;
  for (const row of listPages(projectId)) {
    if (row.tenantId !== tenantId) continue;
    const page = pageIR(row);
    if (page.status !== 'ready') continue;
    // 批量重算是用户显式要求的，手改标记同样让位
    if (page.script.edited) {
      savePage(
        projectId,
        tenantId,
        PageIR.parse({ ...page, script: { ...page.script, edited: false } }),
        row.pageIndex,
      );
    }
    enqueueScript(projectId, tenantId, page.pageId, `manual:${Date.now()}`);
    count += 1;
  }
  return count;
}

/** 单页派发。nonce 让显式重生成总能排进队列，不被同内容的幂等键挡掉。 */
function enqueueScript(projectId: string, tenantId: string, pageId: string, nonce: string): void {
  apiQueue().enqueue({
    tenantId,
    projectId,
    pageId,
    kind: 'script_generate',
    idemKey: `script:${pageId}:${nonce}`,
    payload: { pageId },
    maxAttempts: 2,
  });
}
