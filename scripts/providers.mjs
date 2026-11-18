#!/usr/bin/env node
/**
 * 从环境变量配置真实模型 Provider，并把任务路由指过去。
 *
 * 密钥只从环境变量读（放 .env.local，已 gitignore），不进仓库、不进日志。
 * 幂等：同一个 baseUrl 已存在时原地更新，所以改了 Key 重跑一次就生效。
 *
 * 需要的变量（缺哪组就跳过哪组）：
 *   LUMEN_TEXT_BASE_URL / LUMEN_TEXT_API_KEY / LUMEN_TEXT_MODEL
 *   LUMEN_IMAGE_BASE_URL / LUMEN_IMAGE_API_KEY / LUMEN_IMAGE_MODEL
 * 可选：
 *   LUMEN_IMAGE_API_MODE=sync|task      图片接口是同步返回还是提交后轮询
 *   LUMEN_IMAGE_SIZE_FORMAT=pixels|ratio 尺寸写法：像素还是比例+清晰度
 *   LUMEN_IMAGE_RESOLUTION=2K           ratio 写法时的清晰度档位
 *   LUMEN_IMAGE_POLL_TIMEOUT_MS=420000  task 模式的轮询上限
 */

import {
  createProvider, listProviders, requireRoute, updateProvider, updateRoute,
} from '../packages/server-core/src/services/provider.service.ts';
import { MOCK_PROVIDER_ID } from '../packages/server-core/src/services/seed.service.ts';
// 用相对路径：根目录没有声明 workspace 依赖，裸包名解析不到
import { DEFAULT_IMAGE_MODEL, DEFAULT_TEXT_MODEL } from '../packages/ir-schema/src/index.ts';

/** 走文本模型的环节。图片单独走图片 Provider。 */
const TEXT_ROUTES = ['outline', 'page_content', 'html_codegen', 'script', 'remotion_config', 'style_recognize'];

function findByName(name) {
  return listProviders().find((p) => p.name === name);
}

/** 按名字建或更新，返回 providerId */
function upsert(name, input, log) {
  const existing = findByName(name);
  if (existing) {
    updateProvider(existing.providerId, { name, ...input });
    log(`更新 Provider：${name}`);
    return existing.providerId;
  }
  const row = createProvider({ name, ...input });
  log(`新建 Provider：${name}`);
  return row.providerId;
}

export function configureProviders(log = console.log) {
  const text = {
    baseUrl: process.env.LUMEN_TEXT_BASE_URL ?? '',
    apiKey: process.env.LUMEN_TEXT_API_KEY ?? '',
    model: process.env.LUMEN_TEXT_MODEL ?? '',
  };
  const image = {
    baseUrl: process.env.LUMEN_IMAGE_BASE_URL ?? '',
    apiKey: process.env.LUMEN_IMAGE_API_KEY ?? '',
    model: process.env.LUMEN_IMAGE_MODEL ?? '',
  };

  const textReady = text.baseUrl && text.apiKey && text.model;
  const imageReady = image.baseUrl && image.apiKey && image.model;
  if (!textReady && !imageReady) {
    log('未配置外部模型（LUMEN_TEXT_* / LUMEN_IMAGE_* 均为空），继续使用内置 Mock 网关');
    return;
  }

  const textProviderId = textReady
    ? upsert('文本模型网关', {
      type: 'openai-compatible',
      baseUrl: text.baseUrl,
      apiKey: text.apiKey,
      pathPrefix: '/v1',
      models: { text: [text.model], image: [] },
      // 推理模型单次调用可能要几十秒
      timeoutMs: 180000,
      maxRetries: 1,
      concurrency: 4,
      // 文本单价按你实际的账单填；留 0 表示未配置，用量页会显示 0 而不是猜一个数
      pricing: {
        currency: process.env.LUMEN_TEXT_CURRENCY ?? 'CNY',
        inputPerMTokens: Number(process.env.LUMEN_TEXT_PRICE_IN ?? 0),
        outputPerMTokens: Number(process.env.LUMEN_TEXT_PRICE_OUT ?? 0),
        perImage: 0,
      },
      enabled: true,
    }, log)
    : null;

  const imageProviderId = imageReady
    ? upsert('图片模型网关', {
      type: 'openai-compatible',
      baseUrl: image.baseUrl,
      apiKey: image.apiKey,
      pathPrefix: '/v1',
      models: { text: [], image: [image.model] },
      timeoutMs: 120000,
      maxRetries: 1,
      concurrency: 2,
      imageApi: process.env.LUMEN_IMAGE_API_MODE ?? 'task',
      imageSizeFormat: process.env.LUMEN_IMAGE_SIZE_FORMAT ?? 'ratio',
      imageResolution: process.env.LUMEN_IMAGE_RESOLUTION ?? '2K',
      imagePollTimeoutMs: Number(process.env.LUMEN_IMAGE_POLL_TIMEOUT_MS ?? 420000),
      // ToAPIs 官方价目（2026-09-09 核对）：1K $0.015 / 2K $0.020 / 4K $0.025 每张，按 resolution 档位计价。
      // 这是美元价，所以币种写 USD——不做汇率换算，用量页会把它和人民币的文本费用分开展示。
      pricing: {
        currency: process.env.LUMEN_IMAGE_CURRENCY ?? 'USD',
        inputPerMTokens: 0,
        outputPerMTokens: 0,
        perImage: Number(process.env.LUMEN_IMAGE_PRICE ?? 0.02),
      },
      enabled: true,
    }, log)
    : null;

  // 降级链：真实模型失败时退到内置 Mock，产出占位内容并写明原因，
  // 而不是让整页生成失败。任务中心能看到降级原因。
  if (textProviderId) {
    for (const taskType of TEXT_ROUTES) {
      updateRoute(taskType, {
        primary: { providerId: textProviderId, model: text.model },
        // 脚本直接覆盖降级链：它是「把这套环境配成什么样」的声明，
        // 保留旧值会让上一次配置的残留（比如指向已删除的 Provider）一直留着
        fallbacks: [{ providerId: MOCK_PROVIDER_ID, model: DEFAULT_TEXT_MODEL }],
      }, 'admin');
    }
    log(`任务路由：${TEXT_ROUTES.length} 个文本环节 → ${text.model}（降级到内置 Mock）`);
  }

  if (imageProviderId) {
    updateRoute('image', {
      primary: { providerId: imageProviderId, model: image.model },
      fallbacks: [{ providerId: MOCK_PROVIDER_ID, model: DEFAULT_IMAGE_MODEL }],
      // 图片路由默认锁定（PRD §5.11），这里由脚本显式改，改完保持锁定
      locked: true,
    }, 'admin');
    log(`任务路由：图片 → ${image.model}（降级到内置 Mock）`);
  }
}

/** 供测试与排查：当前路由指向哪里 */
export function describeRoutes() {
  return TEXT_ROUTES.concat('image').map((taskType) => {
    const r = requireRoute(taskType);
    return `${taskType}: ${r.primary.model} @ ${r.primary.providerId}`
      + (r.fallbacks.length ? ` → ${r.fallbacks.map((f) => f.model).join(' → ')}` : '');
  });
}
