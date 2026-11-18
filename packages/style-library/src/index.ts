import { StyleDoc, styleRef } from '@lumen/ir-schema';
import styles from '../assets/styles.json' with { type: 'json' };

/**
 * 风格库的平台资产。
 *
 * ## 为什么风格要有这样一份文件
 *
 * 风格是**平台资产**：谁识别出来的、在哪台机器上识别的，不影响它对别人的价值——
 * 和管理员传进配图库的素材是一个性质。但它原先只存在 `data/lumen.db` 里，
 * 换台机器就没有了，也没法进版本管理。
 *
 * 导成随仓库分发的文件之后：拉到代码的任何环境都有一份相同的风格库，推到远端
 * 就等于存到了云端。配图库（`packages/stock-library`）一直是这个形态，这里补齐。
 *
 * ## 同步是两步，两个方向
 *
 * - **出去**：界面上识别/调整风格写进 DB，再 `pnpm style:export` 导成这份文件并提交。
 *   文件是给人看 diff 的，所以导出脚本按名字排序，顺序稳定。
 * - **进来**：新环境起来时 `seedStyleDocs()` 把文件里、库里还没有的风格补进去。
 *   已经有的一律不动——那份可能被人手改过，覆盖掉就把改动冲没了。
 *
 * 也就是说这份文件是**基线**，不是唯一真相：运行时的真相在库里，这里存的是
 * 「一个干净的库应该长什么样」。
 */
export const BUILTIN_STYLE_DOCS: StyleDoc[] = (styles as unknown[]).map((s) => StyleDoc.parse(s));

/** 按 `family@version` 取一份。找不到回 `null`，调用处据此决定是跳过还是报错 */
export function findBuiltinStyleDoc(ref: string): StyleDoc | null {
  return BUILTIN_STYLE_DOCS.find((d) => styleRef(d) === ref) ?? null;
}
