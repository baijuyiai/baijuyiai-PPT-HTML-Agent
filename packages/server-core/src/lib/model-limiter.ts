import { isThrottleError, isThrottleText, type ProviderGateway } from '@lumen/provider-gateway';
import { AdaptiveLimiter } from './concurrency.js';

/**
 * 进程级的**模型调用**并发上限，以及把「限流」喂给它的那层包装。
 *
 * ## 为什么是进程级的一个，而不是每条链路各一个
 *
 * 限流是按 **API key** 算的——不管这次调用是生成页面、写提示词、出样机还是自检，
 * 供应商看到的都是同一个 key、同一个配额。所以「同时往外发几个请求」这件事
 * 全局只有一个正确答案；每处各拿一个限流器的话，它们各自看着都很克制，
 * 加起来照样把配额打爆。
 *
 * ## 为什么要在网关这一层观察
 *
 * 降档的前提是**认得出限流**，而限流这件事只有两个地方看得见：
 *
 * - 调用**抛错**了，报文里带 429/503（走完降级链之后是 `ALL_PROVIDERS_FAILED：…`）
 * - 调用**成功了，但是降级来的**（主模型 429、备用模型接住了）——`degraded` 为真
 *
 * 这两种都只在网关返回处可见。往下走一层，前者被各服务转成「这一页失败」，
 * 后者干脆被丢掉（`callModel` 只把 HTML 往上传）——实测就是这么踩的：
 * 限流信号只写在生成页面那一条路上，其余链路撞了限流它一无所知。
 *
 * 所以包一层，**一处观察、处处生效**。
 *
 * ## 为什么每个服务自己调一次 `watchThrottle`
 *
 * 不放进 `billedGateway()`：那个函数在测试里是被绕开的（测试注入假网关），
 * 而假网关恰恰是验证降档行为的地方。包在服务入口，真网关与假网关一视同仁。
 *
 * ## 起始值 6 是怎么来的
 *
 * 一页要 1~2 次模型调用。库里 1900 多条真实记录：单页 **p50 76 秒、p90 172 秒、
 * p99 360 秒**。串行跑一本 9 页要十几分钟，用户盯着看就是「卡住了」——
 * 当年实测并发 3 把 21.3 分钟的模型耗时压进 8.5 分钟墙钟。
 *
 * 提到 6 是因为 **p90 是 p50 的 2.25 倍**：并发低的时候整本墙钟由最慢那几页决定，
 * 多开几路能把这根尾巴摊薄。而且**重试会把并发翻倍**（一页 lint 不过会重发一次），
 * 所以写死 6 意味着模型调用层面峰值能到 12——网关那边没有任何限流配置，
 * 撞上才知道，于是交给 `AdaptiveLimiter` 自己找稳态。
 *
 * 下限取 2：再挤也得让活往前走，降到 1 就退回串行了，那正是要摆脱的东西。
 */
export const MODEL_LIMITER = new AdaptiveLimiter(6, 2, 8, '模型调用');

/**
 * 包一层网关：每次调用回来都告诉限流器「顺利」还是「撞限流了」。
 *
 * 返回的是**新对象**，原网关不动——`billedGateway` 建出来的那个还要给别处用。
 * 三个方法都包：文本、图片、语音都走同一个 key，429 不分种类。
 *
 * **透明**：请求原样转发、结果原样返回，抛出的错也原样往上冒。
 * 唯一的副作用是给限流器记一笔。
 */
export function watchThrottle(gateway: ProviderGateway, limiter = MODEL_LIMITER): ProviderGateway {
  /** 成功的那一路：降级来的算软降，干干净净回来的才算顺利 */
  const observe = <T extends { degraded: boolean; degradeReason: string }>(res: T): T => {
    if (res.degraded && isThrottleText(res.degradeReason)) limiter.throttled(false);
    else limiter.ok();
    return res;
  };

  const guard = async <T extends { degraded: boolean; degradeReason: string }>(
    call: () => Promise<T>,
  ): Promise<T> => {
    try {
      return observe(await call());
    } catch (err) {
      // 走到这里说明整条降级链都失败了，所以是硬降
      if (isThrottleError(err)) limiter.throttled(true);
      throw err;
    }
  };

  return {
    text: (req) => guard(() => gateway.text(req)),
    image: (req) => guard(() => gateway.image(req)),
    speech: (req) => guard(() => gateway.speech(req)),
  };
}
