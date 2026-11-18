import test from 'node:test';
import assert from 'node:assert/strict';
import { DRAW_MS, GAP_MS, LOOP_HOLD_MS, activeBlockOf, cycleOf, dragPoint, planSwarm, playedOut, stateOf, timelineAt } from './plan.js';

/**
 * 群光标的时间轴是**纯函数**，所以它可以直接测。
 *
 * 这一份最该钉住的两件事：
 *
 * 1. **一个光标同一时刻只干一件事**——它是靠「每个光标一条队列」做到的，
 *    不是靠抢占。队列排错了，会出现一个光标同时拖两个框（画面上就是框在抽搐）。
 * 2. **文字只增不减、块只往前走**——「刷新之后接着看」全靠这条：
 *    `stateOf` 要是会往回走，刷新一次文字就倒着退回去。
 */

test('每个光标各排一条队，同一时刻只干一件事', () => {
  const plan = planSwarm([10, 20, 30, 40, 50, 60, 70], 3);
  assert.equal(plan.cursorCount, 3);
  // 分派是 `i % 光标数`
  assert.deepEqual(plan.blocks.map((b) => b.cursor), [0, 1, 2, 0, 1, 2, 0]);

  for (const c of [0, 1, 2]) {
    const mine = plan.blocks.filter((b) => b.cursor === c);
    for (let i = 1; i < mine.length; i += 1) {
      assert.ok(
        mine[i]!.drawAt >= mine[i - 1]!.doneAt + GAP_MS,
        `第 ${c} 号光标的两块挨上了：上一块 ${mine[i - 1]!.doneAt} 结束，下一块 ${mine[i]!.drawAt} 就开始`,
      );
    }
    // 在中途任意时刻抽查：手上最多一块
    for (let t = 0; t <= plan.totalMs; t += 37) {
      const jobs = plan.blocks.filter(
        (b) => b.cursor === c && t >= b.drawAt && t < b.doneAt + GAP_MS,
      );
      assert.ok(jobs.length <= 1, `t=${t} 时第 ${c} 号光标手上有 ${jobs.length} 块`);
    }
  }
});

test('`activeBlockOf` 与队列一致：轮到自己之前返回 null', () => {
  const plan = planSwarm([8, 8, 8, 8], 2);
  // 0 号光标管第 0、2 块，它第一个开工
  assert.equal(activeBlockOf(plan, 0, 0)?.index, 0);
  // 1 号光标晚 `LEAD_MS` 开工——开场那一刻它手上是空的，这正是「不同步启动」
  assert.equal(activeBlockOf(plan, 1, 0), null);
  assert.equal(activeBlockOf(plan, 1, plan.blocks[1]!.drawAt)?.index, 1);
  // 全部跑完之后手上没活
  assert.equal(activeBlockOf(plan, 0, plan.totalMs + 1), null);
});

test('文字只增不减，框只往前走', () => {
  const plan = planSwarm([40, 12], 2);
  for (const b of plan.blocks) {
    let typed = -1;
    let box = -1;
    for (let t = 0; t <= plan.totalMs; t += 11) {
      const st = stateOf(b, t);
      assert.ok(st.typed >= typed, `t=${t} 时字数从 ${typed} 退回了 ${st.typed}`);
      assert.ok(st.box >= box, `t=${t} 时框从 ${box} 退回了 ${st.box}`);
      typed = st.typed;
      box = st.box;
    }
    assert.equal(stateOf(b, plan.totalMs).typed, b.chars, '跑到底必须全部打完');
    assert.equal(stateOf(b, plan.totalMs).phase, 'done');
  }
});

test('还没轮到的块完全是空的——画面上不该提前漏出内容', () => {
  const plan = planSwarm([50, 50], 2);
  const later = plan.blocks[1]!;
  const st = stateOf(later, later.drawAt - 1);
  assert.deepEqual(st, { phase: 'waiting', box: 0, typed: 0 });
});

test('零字的块（页眉）走完自己的框，不当成打字块', () => {
  const plan = planSwarm([0, 20], 2);
  const head = plan.blocks[0]!;
  assert.equal(head.chars, 0);
  assert.equal(stateOf(head, 0).phase, 'drawing');
  assert.equal(stateOf(head, DRAW_MS).phase, 'done', '没有字要打，拖完框就算做完');
  assert.equal(stateOf(head, plan.totalMs).typed, 0);
});

test('长段落把每个字压低，总时长仍落在可看的区间里', () => {
  const short = planSwarm([6], 1);
  const long = planSwarm([400], 1);
  const shortMs = short.blocks[0]!.doneAt - short.blocks[0]!.typeAt;
  const longMs = long.blocks[0]!.doneAt - long.blocks[0]!.typeAt;
  assert.ok(shortMs < longMs, '长得多的段落还是要多花些时间');
  assert.ok(longMs <= 3_400 + 1, `长段落不该拖过上限，实际 ${longMs}`);
  assert.ok(shortMs >= 460 - 1, `短标题也要留够看得清的时间，实际 ${shortMs}`);
  // 每个字都变快了，而不是一刀切
  assert.ok(long.blocks[0]!.charMs[0]! < short.blocks[0]!.charMs[0]!, '长段落每个字更快');
});

test('每个字快慢不一——匀速打字一眼就看得出是机器', () => {
  const plan = planSwarm([60], 1);
  const ms = plan.blocks[0]!.charMs;
  assert.ok(new Set(ms.map((m) => m.toFixed(3))).size > 10, '不该是一串相同的数');
  const spread = Math.max(...ms) / Math.min(...ms);
  assert.ok(spread > 1.5 && spread < 4, `快慢差别该明显但别离谱，实际 ${spread.toFixed(2)} 倍`);
});

test('多个光标错开开工——一起动起来像同一台机器在放动画', () => {
  const plan = planSwarm([10, 10, 10, 10], 4);
  const starts = plan.blocks.map((b) => b.drawAt);
  assert.equal(new Set(starts).size, 4, '四个光标不该在同一毫秒开工');
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b), '开工顺序按光标序号');
});

test('拖框沿上边再沿右边走，两端都对得上', () => {
  assert.deepEqual(dragPoint(0), { u: 0, v: 0 });
  assert.deepEqual(dragPoint(1), { u: 1, v: 1 });
  const mid = dragPoint(0.5);
  assert.equal(mid.v, 0, '前半程还在上边上');
  assert.ok(mid.u > 0 && mid.u < 1);
  assert.equal(dragPoint(0.85).u, 1, '后半程沿右边下来');
  assert.ok(dragPoint(0.85).v > 0);
  // 夹边界：越界不该算出负的或者超过 1 的
  assert.deepEqual(dragPoint(-5), { u: 0, v: 0 });
  assert.deepEqual(dragPoint(9), { u: 1, v: 1 });
});

test('没有块时不该炸', () => {
  const plan = planSwarm([], 3);
  assert.equal(plan.blocks.length, 0);
  assert.equal(plan.totalMs, 0);
});

/**
 * 循环那一条。
 *
 * 一页要跑几十秒到几分钟，动画只有五到十秒——**不循环的话剩下那几分钟画面上没有
 * 任何东西在动**，看着像卡死（用户报的就是这个）。循环靠的就是 `timelineAt` 一个取模，
 * 没有第二处复位逻辑，所以这一条要钉死：绕回去那一刻，所有块都回到起点。
 */
test('循环：跑满一圈后从头开始，且 hold 段里全都画完了', () => {
  const plan = planSwarm([10, 20, 30], 2);
  const cycle = cycleOf(plan);
  assert.equal(cycle, plan.totalMs + LOOP_HOLD_MS);

  // 刚开始：第一块才动手
  assert.equal(timelineAt(plan, 0, true), 0);

  // 一圈之内就是原样
  assert.equal(timelineAt(plan, plan.totalMs, true), plan.totalMs);

  // 跨过一圈：绕回起点（多跑的那点时间照算）
  assert.equal(timelineAt(plan, cycle, true), 0);
  assert.equal(timelineAt(plan, cycle + 500, true), 500);
  /*
    跑了好几圈之后**不能要求逐位相等**：`raw % cycle` 在 raw 上百万毫秒时会有
    1e-12 量级的浮点误差（实测 `cycle*3+1200` 算出 1199.9999999999982）。
    对渲染没有影响——`t` 差 1e-9 毫秒，`stateOf` 的边界最多差一帧——但判据不能写成严格相等。
  */
  assert.ok(Math.abs(timelineAt(plan, cycle * 3 + 1200, true) - 1200) < 0.01);

  // hold 段（画完到重来之间）里每一块都是 done——「搭完了」要看得见，不能一闪而过
  for (const raw of [plan.totalMs, plan.totalMs + LOOP_HOLD_MS - 50]) {
    const t = timelineAt(plan, raw, true);
    for (const b of plan.blocks) assert.equal(stateOf(b, t).phase, 'done');
  }
});

test('不循环时原样返回：揭幕那一遍要走到头就停，不能绕回去', () => {
  const plan = planSwarm([10, 20, 30], 2);
  const cycle = cycleOf(plan);
  assert.equal(timelineAt(plan, cycle * 2 + 700, false), cycle * 2 + 700);
  // 负的时间不该出现（时钟回拨、origin 在未来）
  assert.equal(timelineAt(plan, -5000, false), 0);
  assert.equal(timelineAt(plan, -5000, true), 0);
});

test('放完了没有：只认「跑到 totalMs」，hold 不算', () => {
  const plan = planSwarm([10, 20], 2);
  assert.equal(playedOut(plan, plan.totalMs - 1), false);
  assert.equal(playedOut(plan, plan.totalMs), true);
});


