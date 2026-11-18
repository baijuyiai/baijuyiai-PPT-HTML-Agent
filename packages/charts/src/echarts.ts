import type { ChartSpec, ChartRenderer } from './types.js';
import { BUILDERS } from './builders/index.js';
import { GRID_INSET, resolvePalette, usageOf } from './builders/context.js';

/**
 * ECharts 渲染器：把中立规格编译成纯 option 对象，不依赖 echarts 运行时。
 *
 * 自己只搭「所有图都一样」的那一层（动画、色板、字体、网格、标题），
 * 每种图的形状交给 `builders/` 里对应的构建器——20 种挤在一个 if 链里
 * 改一处要翻几百行。
 */
export class EChartsRenderer implements ChartRenderer {
  readonly name = 'echarts' as const;

  buildOption(spec: ChartSpec): Record<string, unknown> {
    const usage = usageOf(spec);
    const palette = resolvePalette(spec, usage);

    const base: Record<string, unknown> = {
      /**
       * **必须关动画。** 树状图 / 旭日图 / 桑基图 / 和弦图 / 漏斗图的布局是随动画帧
       * 收敛的：SSR 下 `setOption` 之后立刻 `renderToSVGString`，动画一帧都没走，
       * 拿到的是**中途状态甚至空图**——页面上就是一块什么都没有的区域，而且不报错。
       */
      animation: false,
      color: palette,
      textStyle: { fontFamily: 'inherit', color: spec.theme.text },
      grid: { ...GRID_INSET },
    };
    if (spec.title) {
      base.title = { text: spec.title, left: 'center', textStyle: { color: spec.theme.text } };
    }

    return { ...base, ...BUILDERS[spec.kind]({ spec, usage, palette }) };
  }
}
