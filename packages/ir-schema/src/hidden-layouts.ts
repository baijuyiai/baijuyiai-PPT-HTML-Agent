/**
 * 下架的内置版式。
 *
 * ## 为什么要下架而不是删
 *
 * 内置版式写死在代码里（`people-skeletons.ts` / `image-skeletons.ts` 两个生成文件），
 * 是**跨项目的设计资产**，不归某一个项目所有。用户觉得某一版式不适合自己这套东西时，
 * 想要的是「它别再被自动挑中」，而不是「从库里消失」——已经生成过的页面还要靠它渲染。
 * 所以下架的语义是**不进候选池**，与素材库的回收站是同一个口径。
 *
 * ## 为什么单独一个模块
 *
 * 两个版式库（`people-layouts.ts` / `image-layouts.ts`）都要用它，而
 * `studio-layouts.ts` 把两者都 import 了——放在 `studio-layouts.ts` 里就会形成
 * `studio-layouts → image-layouts → studio-layouts` 的环。ESM 能跑，但初始化顺序
 * 一变就会拿到 `undefined`，这个坑在本仓库已经踩过一次（`imageSlotNumbers` 当初
 * 就是因为这个从 `studio-layouts.ts` 挪到 `html-doc.ts` 的）。
 *
 * ## 为什么是模块级变量而不是参数
 *
 * 候选函数（`peopleLayoutCandidates` / `imageLayoutCandidates`）的调用点在
 * `server-core` 的生成链路里，把它们全改成接收一份下架名单，等于让每个调用方
 * 都得先查一次库。这里照 `@lumen/stock-library` 的 `setStockPhotos()` 那套做：
 * 服务启动时灌一次，改动后重灌。
 *
 * **常量数组 `PEOPLE_LAYOUTS` / `IMAGE_LAYOUTS` 保持全量**——功能库要把下架的
 * 列出来供恢复，只有候选池排除它们。
 */

let hidden = new Set<string>();

/** 灌入下架名单。服务启动时与每次下架/恢复之后各调一次 */
export function setHiddenLayoutIds(ids: Iterable<string>): void {
  hidden = new Set(ids);
}

/** 当前下架名单。功能库列「已下架」那一节要用 */
export function hiddenLayoutIds(): string[] {
  return [...hidden];
}

export function isHiddenLayout(id: string): boolean {
  return hidden.has(id);
}
