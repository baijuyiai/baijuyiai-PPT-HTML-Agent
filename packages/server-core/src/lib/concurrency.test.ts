import test from 'node:test';
import assert from 'node:assert/strict';
import { AdaptiveLimiter, mapLimit, mapLimitStream } from './concurrency.js';

/**
 * `mapLimitStream` 是「活源源不断来」的带并发 map。
 *
 * 它跟 `mapLimit` 的差别只有一处，但那一处是整条统一链路提速的关键：**拉取本身受
 * 并发上限约束，且拉取要和「已完成」赛跑**。这两件事都不好从调用方看出来，
 * 所以在这里钉死。赛跑写错的表现是「界面上一分钟不动、然后跳一下」——
 * 功能照常，只是慢了，不测就发现不了。
 */

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function* range(n: number): AsyncGenerator<number> {
  for (let i = 0; i < n; i += 1) yield i;
}

async function drain<R>(gen: AsyncGenerator<R | null>): Promise<(R | null)[]> {
  const out: (R | null)[] = [];
  for await (const r of gen) out.push(r);
  return out;
}

test('并发不超过 limit', async () => {
  let live = 0;
  let maxLive = 0;
  await drain(mapLimitStream(range(6), 2, async (i) => {
    live += 1;
    maxLive = Math.max(maxLive, live);
    await sleep(5);
    live -= 1;
    return i;
  }));
  assert.equal(maxLive, 2);
});

test('谁先跑完谁先产出，不按输入顺序', async () => {
  const delays = [30, 1, 20, 2];
  const out = await drain(mapLimitStream(range(4), 4, async (i) => {
    await sleep(delays[i]!);
    return i;
  }));
  assert.deepEqual(out, [1, 3, 2, 0]);
});

test('源不会被提前拉光：同时最多拉 limit 项', async () => {
  let pulled = 0;
  const gates: (() => void)[] = [];
  async function* source(): AsyncGenerator<number> {
    for (let i = 0; i < 10; i += 1) {
      pulled += 1;
      yield i;
    }
  }

  const out: number[] = [];
  const consume = (async () => {
    for await (const r of mapLimitStream(source(), 3, async (i) => {
      await new Promise<void>((res) => gates.push(res));
      return i;
    })) out.push(r!);
  })();

  // 给池子时间把上限拉满。源那边一次也不该多走
  await sleep(20);
  assert.equal(pulled, 3, '源只该被拉到并发上限，不该提前把十项全拉出来');
  assert.equal(out.length, 0, '没有一项被放行，就不该有产出');

  // 一项一项放行：每放一个，池子才会去拉下一项
  while (out.length < 10) {
    assert.ok(gates.length > 0, '池子该在等一项完成');
    gates.shift()!();
    await sleep(1);
  }
  await consume;
  assert.deepEqual([...out].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('源还在等的时候，已跑完的项照样及时产出——这正是「拉取要和已完成赛跑」', async () => {
  const marks: string[] = [];
  async function* source(): AsyncGenerator<number> {
    yield 0;
    yield 1;
    // 第二项之后源自己卡住一会儿。池子里那两项早就跑完了，
    // 不赛跑的话它们要等源松口才发得出去
    await sleep(60);
    yield 2;
  }

  for await (const r of mapLimitStream(source(), 2, async (i) => {
    await sleep(5);
    return i;
  })) {
    marks.push(`产出${r}`);
  }

  // 源卡住的 60ms 里，前两项必须已经产出——否则 marks 里只有一条在最后
  assert.deepEqual(marks, ['产出0', '产出1', '产出2']);
});

test('某一项抛了产出 null，不中断整批', async () => {
  const out = await drain(mapLimitStream(range(3), 2, async (i) => {
    if (i === 1) throw new Error('这一步炸了');
    return i;
  }));
  assert.equal(out.length, 3);
  assert.equal(out.filter((x) => x === null).length, 1);
  assert.deepEqual(out.filter((x) => x !== null), [0, 2]);
});

test('源抛错时整条流跟着抛，不吞掉', async () => {
  async function* source(): AsyncGenerator<number> {
    yield 0;
    // 让第一项先跑完，好验「已经产出的不会被丢掉」。
    // 源立刻抛的话它会抢在已完成项前面——那是 fail-fast，也是对的，只是测不到这一条
    await sleep(20);
    throw new Error('源炸了');
  }
  const seen: (number | null)[] = [];
  await assert.rejects(async () => {
    for await (const r of mapLimitStream(source(), 2, async (i) => i)) seen.push(r);
  }, /源炸了/);
  // 已经产出的那一项不该被丢掉
  assert.deepEqual(seen, [0]);
});

test('空源什么都不产出，也不卡住', async () => {
  const out = await drain(mapLimitStream(range(0), 3, async (i) => i));
  assert.deepEqual(out, []);
});

test('limit 为 1 时退化成串行，顺序即输入顺序', async () => {
  const out = await drain(mapLimitStream(range(4), 1, async (i) => i));
  assert.deepEqual(out, [0, 1, 2, 3]);
});

/* ---------------- 自适应并发上限 ---------------- */

/**
 * 页面生成的并发上限会自己降档、也会自己升回去。
 *
 * 为什么要它：生成耗时几乎全在等模型（单页 p50 76 秒），并发开多大直接决定整本墙钟；
 * 但往上调会撞供应商限流，而**重试会把并发翻倍**，写死一个数意味着峰值不可控。
 * 网关那边没有任何限流配置，撞上才知道，所以交给它自己找稳态。
 */
test('撞限流：硬降砍半，软降退一档，都不穿地板', () => {
  const hard = new AdaptiveLimiter(6, 2, 99);
  hard.throttled(true);
  assert.equal(hard.current, 3, '整条降级链都挂了 → 砍半');
  hard.throttled(true);
  assert.equal(hard.current, 2, '3 砍半是 1，但不该穿到 2 以下');
  hard.throttled(true);
  assert.equal(hard.current, 2, '到地板就停住');

  const soft = new AdaptiveLimiter(6, 2, 99);
  soft.throttled(false);
  assert.equal(soft.current, 5, '主模型 429 但降级成功 → 只退一档，别降太狠');
});

test('连续顺利够次数才升回一档，中间夹一次限流就重新数', () => {
  const l = new AdaptiveLimiter(6, 2, 3);
  l.throttled(true);
  assert.equal(l.current, 3);

  l.ok();
  l.ok();
  assert.equal(l.current, 3, '才顺利两次，还不够');
  l.ok();
  assert.equal(l.current, 4, '连够三次才升一档');

  // 刚升上去就撞限流：成功计数要清零，否则接下来两次顺利又会白升一档
  l.throttled(false);
  assert.equal(l.current, 3);
  l.ok();
  l.ok();
  assert.equal(l.current, 3, '被限流过之后要重新数');
  l.ok();
  assert.equal(l.current, 4);
});

test('已经在上限时，顺利多少次都不越界', () => {
  const l = new AdaptiveLimiter(4, 2, 2);
  for (let i = 0; i < 10; i += 1) l.ok();
  assert.equal(l.current, 4);
});

test('floor 大于 ceiling 直接拒绝——那是个写反的配置', () => {
  assert.throws(() => new AdaptiveLimiter(2, 6), /floor/);
});

test('mapLimit 用限流器时按它**当前**的值并发，不是构造时的值', async () => {
  const l = new AdaptiveLimiter(6, 1, 99);
  l.throttled(true); // 6 → 3
  l.throttled(true); // 3 → 1

  let live = 0;
  let peak = 0;
  await drain(mapLimit([0, 1, 2, 3, 4, 5], l, async (i) => {
    live += 1;
    peak = Math.max(peak, live);
    await sleep(10);
    live -= 1;
    return i;
  }));

  assert.equal(peak, 1, `降到 1 之后就退化成串行，实际峰值 ${peak}`);
});

test('限流器还在上限时，mapLimit 就按上限并发', async () => {
  const l = new AdaptiveLimiter(3, 1, 99);
  let live = 0;
  let peak = 0;
  await drain(mapLimit([0, 1, 2, 3, 4, 5], l, async (i) => {
    live += 1;
    peak = Math.max(peak, live);
    await sleep(10);
    live -= 1;
    return i;
  }));

  assert.ok(peak > 1, '该并发');
  assert.ok(peak <= 3, `不该超过上限 3，实际 ${peak}`);
});

/**
 * 并发上限可以是一个**现算的读数**，而不是一个固定数或 `AdaptiveLimiter`。
 *
 * 整本生成靠这条给手动那页让一格：用户在某一页点了重生成，那一页立刻开始
 * （它不排队、也不经过 `mapLimit`），整本这边少开一路，天上的总额还是配额那么多
 * （见 `generate-html.service` 的 `bookSlots`）。
 *
 * 所以这里要钉两件事：普通对象能当 `limit` 用；**降档之后补位读的是新档**，
 * 而不是开头那一刻的旧档——读旧档的话让位根本不生效。
 */
test('limit 可以是一个现算的读数，且每一轮都重读', async () => {
  let capNow = 3;
  let live = 0;
  let maxLive = 0;
  const gates: (() => void)[] = [];

  const gen = mapLimit([0, 1, 2, 3, 4, 5], { get current() { return capNow } }, async (i) => {
    live += 1;
    maxLive = Math.max(maxLive, live);
    // 攒着等人放行；300ms 兜底，免得写坏了断言把整条测试挂死
    await Promise.race([new Promise<void>((r) => gates.push(r)), sleep(300)]);
    live -= 1;
    return i;
  });

  const firstDone = gen.next();
  await sleep(10);
  assert.equal(live, 3, '开头按当时的读数起了 3 个');

  capNow = 1;
  gates.shift()!();
  await firstDone;
  await sleep(10);
  assert.equal(live, 2, '降档之后不再补到 3 个——补位那一刻读的必须是新档');

  capNow = 3;
  for (const g of gates.splice(0)) g();
  await drain(gen);
  assert.equal(maxLive, 3, '任何时候都不该超过读数');
});

test('mapLimitStream 同样收现算的读数', async () => {
  let capNow = 2;
  let live = 0;
  let peak = 0;
  await drain(mapLimitStream(range(8), { get current() { return capNow } }, async (i) => {
    live += 1;
    peak = Math.max(peak, live);
    await sleep(5);
    live -= 1;
    return i;
  }));
  assert.ok(peak <= 2, `不该超过读数 2，实际 ${peak}`);
});
