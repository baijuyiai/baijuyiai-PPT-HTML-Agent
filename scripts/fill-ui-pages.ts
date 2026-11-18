/**
 * 给风格库里**每一套风格**补上「界面页」，并给它绑定最合适的那份界面版式。
 *
 * ## 为什么走 `fillMissingPageTypes` 而不是自己写一遍
 *
 * 那条服务就是为「页类型会生长」写的：它只补**缺的那几类**，配色、字体、已有的页类型
 * 一个都不动；一类不缺时零模型调用。自己再写一个补数脚本，等于把「只碰缺的」
 * 「用已有几条当 few-shot 推导」「样机带上 doc.spec 与字体栈」这些细节重抄一遍，
 * 抄漏一条就是「补出来的页和别的页不像一套风格」。
 *
 * ## 为什么要另外绑版式
 *
 * 其余页类型都不绑 `layoutId`（`''` = 让模型从候选里挑）。界面页是例外：
 * 它一半的观感在**用哪台设备、设备摆哪、几台**——那是**风格的签名**，不是这一页内容
 * 决定的。同一套风格里每一页都换一台设备、换个左右，整套就不像一套了。
 * 所以这里给每套风格钉一份版式。想改回「让模型挑」，把 `layoutId` 清成 `''` 即可。
 *
 * 绑了之后 `generate-html.service` 走的是 `doc.pagePrompts.ui.layoutId` 那条路，
 * 不再走 `uiLayoutCandidates`；`style-engine` 的 lint 会校验 id 在不在库里，
 * 版式被删会当场报出来。
 *
 * ## 跑法（仓库根目录）
 *
 * ```
 * node --import tsx scripts/fill-ui-pages.ts            # 只补缺的（已补过的会跳过，零调用）
 * node --import tsx scripts/fill-ui-pages.ts --only mw8s70pr
 * node --import tsx scripts/fill-ui-pages.ts --rebind   # 只重绑版式，不补页
 * node --import tsx scripts/fill-ui-pages.ts --reui     # 把已有的界面页删掉重推（改了推导口径后用）
 * ```
 */
import { all, get } from '../packages/server-core/src/db/client.ts';
import { billedGateway } from '../packages/server-core/src/services/billed-gateway.ts';
import { fillMissingPageTypes } from '../packages/server-core/src/services/fill-missing.service.ts';
import { resolveStyleDoc, saveStyleDoc } from '../packages/server-core/src/services/style-doc.service.ts';
import { UI_LAYOUTS } from '../packages/ir-schema/src/ui-layouts.ts';

const arg = (n: string): string | undefined => {
  const i = process.argv.indexOf(`--${n}`);
  return i < 0 ? undefined : process.argv[i + 1];
};
const flag = (n: string) => process.argv.includes(`--${n}`);

/**
 * 风格 → 界面版式。键是风格名（不是 styleId——styleId 带随机后缀，认不出来是什么风格）。
 *
 * ## 挑的判据
 *
 * 按**这套风格在别的页上已经定下的调子**挑，不按「哪份版式好看」挑：
 *
 * - **设备形态跟着风格的内容气质走。** 数据面板 / 商务 / 工业这类讲工具的，
 *   摆笔记本或显示器；编辑风、海报风这类讲「一件作品」的，摆手机。
 * - **构图跟着风格的疏密走。** 大字海报风留白大、字压得很重，就挑「居中压大字」那种；
 *   编辑风是左文右图的栏式，就挑「左文右机」。
 * - **毛玻璃要不要重，看这套风格本身用不用。** 浅紫玻璃流光风整套就是靠毛玻璃立住的，
 *   挑的这份版式里毛玻璃是主角；橙红大字海报风的提示词里明写「不加毛玻璃」，
 *   就挑一份玻璃用得最少的。
 *
 * 名字对不上（新加了风格、或改了名）时**不猜**，直接报出来——瞎绑一份比不绑更糟，
 * 因为看不出是错的。
 */
const LAYOUT_OF_STYLE: Record<string, string> = {
  '橙红大字海报风': 'ui/center-phone-hero-type@v1',      // 居中机型压底巨字：大字海报的调子
  '黑白冷峻汽车风': 'ui/centered-laptop-bigword@v1',      // 居机压字：冷峻、产品感
  '红黑极简提案风': 'ui/centered-laptop-bigword@v1',      // 同上：提案讲的是一个产品界面
  '蓝绿渐变科技风': 'ui/centered-phone-bigword-chips@v1', // 中机大字环绕：科技感的环绕小标签
  '亮蓝手绘编辑风': 'ui/left-copy-right-phone@v1',        // 左文右机：编辑式的栏
  '暖橙渐变编辑风': 'ui/left-copy-right-phone-4@v1',      // 左文右机大字：编辑式、字重
  '暖调纸感编辑风': 'ui/left-copy-right-phone-2@v1',      // 左文右机双栏：纸感的双栏
  '浅紫玻璃流光风': 'ui/floating-glass-panels@v1',        // 居中浮板右文：整套就是毛玻璃
  '深色紫调数据面板': 'ui/center-display-hero@v1',        // 置中大屏展示：数据面板要横屏
  '蔚蓝科技商务风': 'ui/center-laptop-side-notes@v1',     // 中机左右分文：商务、左右注解
  '重工蓝白工业风': 'ui/text-left-device-cluster@v1',     // 左文右多机：工业风的多设备堆叠
};

interface Row { styleId: string; name: string }

const only = arg('only');
const rebind = flag('rebind');
const reui = flag('reui');

const styles = all<Row>('SELECT styleId, name FROM style_docs ORDER BY name');
const targets = only ? styles.filter((s) => s.styleId.includes(only)) : styles;
if (targets.length === 0) {
  console.error(`没有匹配的风格。库里共 ${styles.length} 套：\n  ${styles.map((s) => s.name).join('\n  ')}`);
  process.exit(1);
}

const known = new Set(UI_LAYOUTS.map((l) => l.id));
const missing = [...new Set(Object.values(LAYOUT_OF_STYLE))].filter((id) => !known.has(id));
if (missing.length > 0) {
  throw new Error(`LAYOUT_OF_STYLE 里这几个 id 在库里不存在（版式改名或被删了？）：\n  ${missing.join('\n  ')}`);
}

/*
  **删掉已有的界面页再补一遍。**

  页面提示词是照 `PAGE_TYPE_BRIEF[页类型]` 展开写的（见 `derivePrompts`），那句说明改了，
  旧提示词就带着旧口径。实测踩过：第一版 `ui` 的说明只写了「画面里有一台 3D 设备」，
  推出来的提示词在教模型「机身层用 var(--surface) 画一个圆角矩形、屏幕层内缩 32px」——
  那是**它自己画一台**，而真页面里设备是版式骨架注入的，两样撞在一起就是两台叠着。
  改口径之后必须重推，不然库里留着的全是不合口径的那一版。
*/
if (reui) {
  for (const s of targets) {
    const doc = resolveStyleDoc(s.styleId);
    if (!doc.pagePrompts.ui) continue;
    const { ui: _dropped, ...rest } = doc.pagePrompts;
    saveStyleDoc({ ...doc, pagePrompts: rest });
    console.log(`${s.name}：删掉旧的界面页`);
  }
  console.log('');
}

/* ---------------- 补页 ---------------- */

if (!rebind) {
  const admin = get<{ userId: string; tenantId: string }>(
    "SELECT userId, tenantId FROM users WHERE role = 'admin' ORDER BY createdAt ASC LIMIT 1",
  );
  if (!admin) throw new Error('库里没有管理员账号，先跑 pnpm seed');
  const gateway = billedGateway(admin.tenantId, admin.userId);

  console.log(`要给 ${targets.length} 套风格补「界面页」\n`);
  for (const s of targets) {
    let filled: string[] = [];
    let issues: { pageType: string; message: string }[] = [];
    /*
      **补页与绑版式一次做完。** 版式写在页提示词上，补页之前那条提示词还不存在，
      所以没法「先绑再补」；而样机是在补页这一步生成的，绑版式发生在之后的话，
      样机就没带上骨架——风格库里显示的是模型自由发挥那一版，与真生成出来的对不上。
    */
    const want = LAYOUT_OF_STYLE[s.name];
    for await (const ev of fillMissingPageTypes({
      styleId: s.styleId,
      gateway,
      ...(want ? { bindLayouts: { ui: want } } : {}),
    })) {
      if (ev.event === 'progress') {
        if (ev.data.total > 0) console.log(`  ${s.name} · ${ev.data.label}`);
      } else if (ev.event === 'error') {
        console.error(`  ${s.name} 失败：${ev.data.message}`);
      } else if (ev.event === 'done') {
        filled = ev.data.filled;
        issues = ev.data.issues;
      }
    }
    console.log(filled.length === 0
      ? `${s.name}：不缺页类型，跳过`
      : `${s.name}：补了 ${filled.join('、')}${issues.length > 0 ? `（${issues.length} 处提示词提示）` : ''}`);
  }
  console.log('');
}

/* ---------------- 绑版式 ---------------- */

let bound = 0;
for (const s of targets) {
  const want = LAYOUT_OF_STYLE[s.name];
  if (!want) {
    console.error(`${s.name}：LAYOUT_OF_STYLE 里没有它。新增了风格就补一行，别猜`);
    continue;
  }
  const doc = resolveStyleDoc(s.styleId);
  const page = doc.pagePrompts.ui;
  if (!page) {
    console.error(`${s.name}：还没有界面页，先补页再绑版式`);
    continue;
  }
  if (page.layoutId === want) {
    console.log(`${s.name}：已经绑着 ${want}`);
    continue;
  }
  const prev = page.layoutId || '（没绑）';
  saveStyleDoc({ ...doc, pagePrompts: { ...doc.pagePrompts, ui: { ...page, layoutId: want } } });
  console.log(`${s.name}：${prev} → ${want}`);
  bound += 1;
}

console.log(`\n绑定了 ${bound} 套。接下来：pnpm style:export 把库里的真相写回基线 styles.json`);
process.exit(0);
