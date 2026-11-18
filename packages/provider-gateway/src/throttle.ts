/**
 * 判断一次模型调用的失败是不是「上游扛不住了」。
 *
 * ## 为什么要单独一个判据
 *
 * 页面生成的耗时几乎全在等模型，所以并发开多大直接决定整本的墙钟。
 * 但往上调会撞限流，撞了之后要做的是**降档**——而「降档」这个动作得先认出
 * 什么是限流。认错了的后果是两头都不好：把网络抖动当成限流，并发会一路降到地板；
 * 把限流当成普通失败，就是一连串 429 与重试。
 *
 * ## 认的是哪几种
 *
 * - **429**：明确的限流。
 * - **503**：上游过载，多数兼容端在并发超限时用它而不是 429。它也可能是短暂宕机，
 *   那种情况下降档没有害处——缓过来之后并发会自己升回去。
 * - **文案里写着「限流」**：本仓库的假网关与部分兼容端就是这么报的，
 *   写出来的是中文而不是状态码。
 *
 * ## 为什么只看报文
 *
 * 网关把失败统一收敛成一个 `Error`，消息形如
 * `PROVIDER_ERROR 429 <url>：…`，走完降级链之后是
 * `ALL_PROVIDERS_FAILED：…；<provider>/<model>：PROVIDER_ERROR 429 …`。
 * **状态码原样保留在报文里**，所以字符串匹配是可靠的，不需要改错误类型。
 * 网关自己已经重试过（默认 3 次尝试），所以能冒到这一层说明限流是持续的。
 */
const THROTTLE_RE = /PROVIDER_ERROR\s+(?:429|503)\b|\b(?:429|503)\b[\s\S]{0,20}?(?:限流|too many|rate limit)|限流/i;

/** 这次失败是不是限流/过载 */
export function isThrottleError(err: unknown): boolean {
  return isThrottleText(err instanceof Error ? err.message : String(err));
}

/** 这段报文里有没有限流/过载的迹象。降级成功时拿它看 `degradeReason` */
export function isThrottleText(text: string): boolean {
  return THROTTLE_RE.test(text);
}
