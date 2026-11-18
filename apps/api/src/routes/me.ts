import { Router } from 'express';
import { ok } from '@lumen/server-core';
import { requireAuth } from '@lumen/server-core';
import { quotaState } from '@lumen/server-core';
import { requireById, toPublic } from '@lumen/server-core';
import { listProviders, listRoutes, toProvider } from '@lumen/server-core';
import { DEFAULT_LOCKED_ROUTES, TASK_TYPE_LABEL, type TaskType } from '@lumen/ir-schema';

export const meRouter = Router();

/** 当前用户信息 + 配额 + 用量（PRD §5.11 用户侧只读展示） */
meRouter.get('/', requireAuth, (req, res) => {
  const userId = req.auth!.sub;
  const { quota, used } = quotaState(userId);
  ok(res, { user: toPublic(requireById(userId)), quota, used });
});

/**
 * 用户侧只读的模型库状态（PRD §5.11「用户侧只读展示当前所用模型，不可见 Key、不可改路由」）。
 *
 * 这里只回答两个问题：每个环节实际跑的是哪个模型、这个模型是不是真的接上了。
 * 因此只回 Provider 名称与模型名——Base URL、Key 掩码、定价都不出这个接口。
 */
meRouter.get('/models', requireAuth, (_req, res) => {
  const providers = new Map(
    listProviders().map((row) => {
      const p = toProvider(row);
      return [p.providerId, {
        name: p.name,
        isMock: p.isMock,
        // 内置 Mock 不需要 Key；真实 Provider 没配 Key 就是没接上
        configured: p.isMock || Boolean(p.apiKeyRef),
      }];
    }),
  );

  const describe = (providerId: string, model: string) => {
    const p = providers.get(providerId);
    return {
      providerName: p?.name ?? providerId,
      model,
      isMock: p?.isMock ?? false,
      configured: p?.configured ?? false,
    };
  };

  const routes = listRoutes().map((route) => ({
    taskType: route.taskType,
    label: TASK_TYPE_LABEL[route.taskType as TaskType] ?? route.taskType,
    locked: route.locked || DEFAULT_LOCKED_ROUTES.includes(route.taskType as TaskType),
    primary: describe(route.primary.providerId, route.primary.model),
    fallbacks: route.fallbacks.map((f) => describe(f.providerId, f.model)),
  }));

  ok(res, { routes });
});
