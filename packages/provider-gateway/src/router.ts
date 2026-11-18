import type { TaskRoute, TaskType } from '@lumen/ir-schema';

/** 路由解析所需的最小接口，便于测试时直接传一个桩对象 */
export interface RouteSource {
  getRoute(taskType: TaskType): TaskRoute | undefined;
}

/** 可改动路由的角色 */
export type RouteRole = 'admin' | 'user' | 'guest';

/** 解析路由；未配置路由时抛错，message 含 ROUTE_NOT_CONFIGURED */
export function resolveRoute(routes: RouteSource, taskType: TaskType): TaskRoute {
  const route = routes.getRoute(taskType);
  if (!route) {
    throw new Error(`ROUTE_NOT_CONFIGURED：任务类型 ${taskType} 未配置路由，请先在管理后台补上主模型与降级链`);
  }
  return route;
}

/** 判定某任务类型的路由是否为锁定路由 */
export function isLocked(route: TaskRoute): boolean {
  return route.locked === true;
}

/** 校验角色是否有权切换该路由：locked 路由仅 admin 可改 */
export function canChangeRoute(route: TaskRoute, role: RouteRole): boolean {
  if (isLocked(route)) return role === 'admin';
  return role !== 'guest';
}

/** 从路由取出降级链（primary 在前，其后依次为 fallbacks） */
export function fallbackChain(route: TaskRoute): { providerId: string; model: string }[] {
  return [
    { providerId: route.primary.providerId, model: route.primary.model },
    ...route.fallbacks.map((f) => ({ providerId: f.providerId, model: f.model })),
  ];
}
