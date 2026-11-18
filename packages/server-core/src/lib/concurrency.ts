import { logger } from './logger.js';

/**
 * 通用并发工具，与领域无关——谁要「同时跑 N 个、完成一个收一个」都可以用。
 *
 * 抽成公共件而不是留在识别服务里，是因为不止一处要用：识别链路本来就在用，
 * 补齐一套已存风格缺的页类型那条路也要用——一张样机在线上要跑四分钟，
 * 两张串着跑就是八分钟，必须并发。
 *
 * 与 `design-vision.service.ts` 里那个同名的**有意不同，不要顺手统一**：
 * 那个是「按输入顺序返回 R[]、某一项抛了整批就废」的收尾式实现，
 * 这个是「谁先跑完谁先产出、失败的那项产出 null」的流式实现。
 * 合并会同时改掉两边的行为。
 */

/**
 * 会自己降档、也会自己升回去的并发上限。
 *
 * ## 为什么不能直接写死一个更大的数
 *
 * 生成页面的耗时几乎全在等模型（实测单页 p50 76 秒、p90 172 秒），
 * 所以「同时跑几页」直接决定整本的墙钟。但**往上调是有代价的**：
 * 供应商那边按 API key 限流，撞上去就是一串 429，而 429 又会让页面失败、
 * 失败再触发重试，反而更慢。
 *
 * 更麻烦的是**重试会把并发翻倍**：一页 lint 不过会重发一次，
 * 所以模型调用层面的并发是页并发的 1~2 倍。写死 6 意味着峰值可能到 12。
 *
 * 所以这里不写死：**撞上限流就降一档，连着顺利若干次再升回去**。
 * 稳态会自己停在供应商扛得住的那个值上，不用人去猜。
 *
 * ## 两个档位
 *
 * - **硬降**（整条降级链都失败，`ALL_PROVIDERS_FAILED`）：说明连兜底模型都在限流，
 *   直接砍半。
 * - **软降**（主模型 429、但降级到备用模型成功了）：说明主模型已经饱和，
 *   退一档就够——这时活还在往前走，降太狠反而白白拖慢。
 *
 * ## 线程安全
 *
 * 不涉及。Node 是单线程，这些方法都只在两次 `await` 之间同步执行，没有竞态。
 */
export class AdaptiveLimiter {
  #current: number;
  #streak = 0;

  constructor(
    /** 起始值，也是上限 */
    readonly ceiling: number,
    /** 下限。**不会降到 0**：再挤也得让活往前走，全停下等于卡死 */
    readonly floor: number,
    /** 连续成功多少次才升一档 */
    readonly recoverAfter = 8,
    /** 名字，只用于日志 */
    readonly name = 'limiter',
  ) {
    if (floor > ceiling) throw new Error('AdaptiveLimiter：floor 不能大于 ceiling');
    this.#current = ceiling;
  }

  get current(): number {
    return this.#current;
  }

  /**
   * 撞上限流。
   *
   * `hard` 为真时砍半（连兜底都挂了），否则退一档。
   * **降档同时清零成功计数**：刚被限流过，接下来那几次顺利不足以说明已经缓过来。
   */
  throttled(hard: boolean): void {
    const next = hard
      ? Math.max(this.floor, Math.floor(this.#current / 2))
      : Math.max(this.floor, this.#current - 1);
    this.#streak = 0;
    if (next === this.#current) return;
    logger.warn('并发撞上限流，降档', {
      name: this.name, from: this.#current, to: next, hard,
    });
    this.#current = next;
  }

  /** 一次顺利的调用。连够 `recoverAfter` 次就把并发抬回去一档 */
  ok(): void {
    if (this.#current >= this.ceiling) return;
    this.#streak += 1;
    if (this.#streak < this.recoverAfter) return;
    this.#streak = 0;
    this.#current += 1;
    logger.info('并发连续顺利，升回一档', { name: this.name, to: this.#current });
  }

  /**
   * 回到起始档。
   *
   * **给测试用的**：模块级那一个（`PAGE_LIMITER`）是跨用例共享的，
   * 某条用例故意撞了限流之后，后面的用例会从一个已经降过档的状态开始跑，
   * 于是「并发生成了几页」这类断言会时对时错。
   */
  reset(): void {
    this.#current = this.ceiling;
    this.#streak = 0;
  }
}

/**
 * 带并发的 map，谁先跑完谁先产出。
 *
 * 自己写而不是引 p-limit：仓库是零外部依赖的，而这里只需要「同时跑 N 个、
 * 完成一个收一个」这一件事。**完成顺序即产出顺序**——调用方只是往列表里塞、
 * 顺便报进度，不要求按输入顺序。
 *
 * **失败不中断整批**：某一页的模型调用挂了，其余的页照常出，
 * 缺的那一页由调用方兜底。一次识别二十来次调用，因为其中一次抖动就全盘作废，
 * 用户要重等五分钟，代价太大。
 *
 * `limit` 可以给一个数，也可以给一个**带只读 `current` 的对象**（`AdaptiveLimiter` 就是
 * 一个）——给后者时**每一轮都重新问当前该开几个**，所以它降档之后立刻就不再起新活
 * （已经在跑的不动，等它们自己收）。
 *
 * 收「带 `current` 的对象」而不是收 `AdaptiveLimiter`：调用方有时要现算一个数出来
 * （比如整本生成要减掉正在跑的手动单页，见 `generate-html.service` 的 `bookSlots`），
 * 而 `AdaptiveLimiter` 有私有字段、普通对象在类型上并不兼容它。
 */
export interface SlotSource {
  readonly current: number;
}

export async function* mapLimit<T, R>(
  items: T[],
  limit: number | SlotSource,
  fn: (item: T) => Promise<R>,
): AsyncGenerator<R | null> {
  const cap = () => (typeof limit === 'number' ? limit : limit.current);
  const pending = new Map<number, Promise<{ i: number; r: R | null }>>();
  let next = 0;

  const start = (i: number) => {
    pending.set(i, (async () => {
      try {
        return { i, r: await fn(items[i]!) };
      } catch (err) {
        logger.warn('识别的一步失败，跳过该项', {
          index: i, err: err instanceof Error ? err.message : String(err),
        });
        return { i, r: null };
      }
    })());
  };

  while (next < items.length && pending.size < cap()) start(next++);

  while (pending.size > 0) {
    const settled = await Promise.race(pending.values());
    pending.delete(settled.i);
    // 补位前**再问一次**上限：上面那一轮里可能刚被限流降了档
    if (next < items.length && pending.size < cap()) start(next++);
    yield settled.r;
  }
}

/**
 * 与 `mapLimit` 同一件事，但**活是源源不断来的**，不是一开始就有一整张清单。
 *
 * ## 为什么需要它
 *
 * 统一风格那条链路原先分两段跑：先把十二页的提示词**全部**改完（六批，串行，一批一分钟），
 * 再开始出样机（十二张，并发三，一张四分钟）。两段之间没有一点重叠——
 * 后一段等前一段，前一段跑完时机器是空的。加起来二十多分钟，其中六分钟纯属白等。
 *
 * 改成流水线之后，第一批提示词一改完就开跑它的样机，改写和出样机同时进行，
 * 谁先跑完谁先报。**「第一批」这件事只有调用方知道**，所以这里不能收数组，
 * 得收一个异步迭代器：它吐一项，这里就起一个任务。
 *
 * ## 与 `mapLimit` 的取舍
 *
 * - **拉取受 `limit` 约束**：有空位才向源要下一项。源那一侧往往也是一次模型调用，
 *   放开拉会把它自己变成无上限并发。
 * - **拉取要和「已完成」赛跑**：源在等模型（一批改写要一分钟）时，已经跑完的样机
 *   不能压着不发，否则界面上一分钟不动、然后跳一下。所以拉取这个 promise 只建一次、
 *   反复参与赛跑，不能每次重建（重建会让源被重复推进）。
 * - **失败同样不中断**：与 `mapLimit` 一个口径，某一项挂了产出 `null`，由调用方兜底。
 *
 * 顺序与 `mapLimit` 一样是**完成顺序**，不是输入顺序。
 */
export async function* mapLimitStream<T, R>(
  source: AsyncIterable<T>,
  limit: number | SlotSource,
  fn: (item: T) => Promise<R>,
): AsyncGenerator<R | null> {
  const cap = () => (typeof limit === 'number' ? limit : limit.current);
  const iter = source[Symbol.asyncIterator]();
  const pending = new Map<number, Promise<{ kind: 'done'; i: number; r: R | null }>>();
  let seq = 0;
  let sourceDone = false;
  /**
   * 源的下一项，**只建一次、反复参与赛跑**。
   *
   * 不每轮现造一个 `.then(...)` 包装是有原因的：被赛输的那一个会成为没人接的孤儿，
   * 而源那一侧真抛错时，孤儿上的拒绝就是一条 unhandled rejection——错误照常往上冒，
   * 日志里却多一条吓人的噪音，还会让人以为是两个独立的问题。
   * 同一个 promise 反复 race 是安全的：每次 race 都会给它挂上处理函数。
   */
  let pulling: Promise<{ kind: 'item'; done: boolean; value?: T | undefined }> | null = null;

  const pull = () => {
    pulling ??= iter.next().then((r) => ({
      kind: 'item' as const,
      done: r.done === true,
      value: r.value as T | undefined,
    }));
    return pulling;
  };

  const start = (i: number, item: T) => {
    pending.set(i, (async () => {
      try {
        return { kind: 'done' as const, i, r: await fn(item) };
      } catch (err) {
        logger.warn('并发流的一步失败，跳过该项', {
          index: i, err: err instanceof Error ? err.message : String(err),
        });
        return { kind: 'done' as const, i, r: null };
      }
    })());
  };

  while (!sourceDone || pending.size > 0) {
    while (!sourceDone && pending.size < cap()) {
      // 手上没有在跑的活时没什么可赛的，直接等源
      const arrived = pending.size === 0
        ? await pull()
        : await Promise.race([pull(), Promise.race(pending.values())]);

      if (arrived.kind === 'done') {
        pending.delete(arrived.i);
        yield arrived.r;
        continue;
      }
      pulling = null;
      if (arrived.done) {
        sourceDone = true;
        break;
      }
      start(seq++, arrived.value!);
    }

    if (pending.size === 0) break;
    const settled = await Promise.race(pending.values());
    pending.delete(settled.i);
    yield settled.r;
  }
}
