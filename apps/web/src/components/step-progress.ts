/**
 * 一屏分步进度里「哪一步在跑、哪些已经跑完」的判定。
 *
 * 抽出来是因为这个判定被三个流各写了一遍，且第一版写错过：识别风格那次 `active` 与
 * `passed` 恒为 false，五个徽标一个都不亮、一轮三五分钟没有任何反馈，而裸强转让 TS
 * 查不出来。现在判定只有这一份，能直接对着测。
 */

export type StepState = 'pending' | 'active' | 'passed';

/**
 * @param order   阶段顺序，即实际执行顺序
 * @param key     要判定的那一步
 * @param current 服务端报的当前阶段。来自网络，可能是顺序表里没有的名字
 */
export function stepState<K extends string>(
  order: readonly K[],
  key: K,
  current: string | null | undefined,
): StepState {
  if (!current) return 'pending';
  const currentIndex = (order as readonly string[]).indexOf(current);
  const keyIndex = order.indexOf(key);
  // 认不出的阶段名一律按「待跑」：宁可一个都不亮，也不能把没跑的谎报成跑完
  if (currentIndex < 0 || keyIndex < 0) return 'pending';
  if (keyIndex === currentIndex) return 'active';
  return keyIndex < currentIndex ? 'passed' : 'pending';
}
