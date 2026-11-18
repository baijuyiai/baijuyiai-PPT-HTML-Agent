import { useEffect } from 'react';

/**
 * 改动停下多久自动保存一次。
 *
 * 800ms 是「还在打字的间隙」与「等得住」之间的取舍：中文输入法一个词打完通常几百毫秒，
 * 短了会在组词中途发请求（那时内容还是半截的），长了切页前那点等待会明显起来。
 * 反正切页与离开时都会立刻冲一次，这个值只影响「一直待在这一页慢慢改」的手感。
 *
 * 页内容与大纲两路共用同一个节奏——同一个人在同一个界面上打字，不该有两套手感。
 */
export const AUTO_SAVE_MS = 800;

/**
 * 有东西没落盘就关标签/刷新时，让浏览器拦一下。
 *
 * 注意浏览器只认「用户手势之后」的拦截，而且各家文案不能自定义——这里能做的
 * 只是把「你还有没保存的东西」这件事说出来，别让它无声地走掉。
 */
export function useBeforeUnloadWhile(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const onLeave = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [active]);
}
