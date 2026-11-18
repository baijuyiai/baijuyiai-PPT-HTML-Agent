/**
 * 可选的字体。
 *
 * ## 为什么规范里存 id 而不是字体栈
 *
 * 字体栈是几十个字体名拼起来的一长串（自带的那份要列到 `PingFang SC` / `Microsoft YaHei`
 * 才兜得住中文）。把它整串存进规范有两个问题：界面上没法「一键切换」——用户看到的是
 * 一串字体名，不是「衬线 / 无衬线」这样的选项；改一个角色要重写全篇的栈。
 *
 * 所以规范里存的是这里的 `id`，真栈由本文件给出。**清单只写这一处**：界面的选择器、
 * 提示词的注入、样机的渲染都从这里取。
 *
 * ## 现在只有两个自带字体
 *
 * `Montserrat` 与 `Cormorant Garamond` 是随仓库分发的那两份（见 `html-doc.ts` 的
 * `BUNDLED_FACES`），其余几个走系统字体栈。**不外链**：导出件要自包含，链一个
 * Google Fonts 在客户机器上打不开就退回系统字体，字形全变。
 *
 * 想加自带字体就往 `assets/fonts/` 放 woff2、在 `BUNDLED_FACES` 里登记、
 * 再往下面这张表加一条——三处都要动，缺一处就是「选得到但渲染不出来」。
 */

export interface FontChoice {
  id: string;
  /** 界面上显示的名字。**说清它长什么样**，不是字体名本身 */
  label: string;
  /**
   * 主字体名，小写。用来**反查**：`StyleDoc` 里存的是完整栈，
   * 想认出「这套风格用的是清单里哪一个」就得靠它。
   *
   * 认主字体就够，不看兜底那一段——兜底是中文与系统回落，各栈之间本来就大量重叠
   * （`Montserrat` 的栈里也有 `system-ui`），拿兜底去比会认错。
   */
  primary: string;
  /** 完整字体栈，直接写进 `font-family` */
  stack: string;
  /** 这套字体有没有汉字。没有的话中文会顺着栈往下落，得在标签里说明 */
  hasCjk: boolean;
}

/**
 * 中文兜底那一段。
 *
 * `Montserrat` / `Cormorant Garamond` 一个汉字都没有，中文会顺着栈往下落。
 * 这几个名字在 mac 与 Windows 上分别命中（`PingFang SC` / `Microsoft YaHei`），
 * **不能删**：删了中文就没字体了。
 */
const CJK_FALLBACK = '"PingFang SC", "Microsoft YaHei", "Hiragino Sans GB", sans-serif';

/** 衬线中文字体。与上面同理，只是换成宋体那一系 */
const CJK_SERIF = '"Songti SC", "STSong", "Noto Serif SC", "SimSun", serif';

/**
 * 手写体的系统栈。
 *
 * **这一档没有自带字体**：手写体只在签名、引言这类装饰处出现（图文排版那 41 份里
 * 只有 9 份用到），为它再带一份字体不划算。前两个名字 Windows 有、后两个 macOS 有，
 * `cursive` 只当最后兜底——这个通用族在 Windows 上会落到 Comic Sans，很难看。
 *
 * 定义在这里而不是 `style-doc.ts`，是为了让 `DEFAULT_FONT_SCRIPT` 与下面清单里那一条
 * 同源：两处各写一份的话，反查 `fontIdOfStack` 会因为一个字不一样而认不出，
 * 表现是「八套风格的手写体全是未指定」。
 */
export const SYSTEM_SCRIPT_STACK = '"Segoe Script","Ink Free","Snell Roundhand","Bradley Hand",cursive';

export const FONT_CHOICES: FontChoice[] = [
  {
    id: 'montserrat',
    label: 'Montserrat · 几何无衬线',
    primary: 'montserrat',
    stack: `Montserrat, system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, ${CJK_FALLBACK}`,
    hasCjk: false,
  },
  {
    id: 'cormorant',
    label: 'Cormorant Garamond · 高对比衬线',
    primary: 'cormorant garamond',
    stack: `"Cormorant Garamond", "Songti SC", "STSong", "Noto Serif SC", Georgia, "Times New Roman", ${CJK_SERIF}`,
    hasCjk: false,
  },
  {
    id: 'system-sans',
    label: '系统无衬线',
    primary: 'system-ui',
    stack: `system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, ${CJK_FALLBACK}`,
    hasCjk: true,
  },
  {
    id: 'system-serif',
    label: '系统衬线',
    primary: 'georgia',
    stack: `Georgia, "Times New Roman", "Songti SC", "STSong", "Noto Serif SC", serif`,
    hasCjk: true,
  },
  {
    id: 'system-mono',
    label: '系统等宽',
    primary: 'consolas',
    stack: `"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace`,
    hasCjk: false,
  },
  {
    id: 'system-script',
    label: '系统手写体',
    primary: 'segoe script',
    stack: SYSTEM_SCRIPT_STACK,
    hasCjk: false,
  },
];

/** 认不出的 id 回空串——调用方据此决定是回落还是报错 */
export function fontStackOf(id: string | null | undefined): string {
  if (!id) return '';
  return FONT_CHOICES.find((f) => f.id === id)?.stack ?? '';
}

/** 界面上用的标签。认不出的 id 原样返回，免得显示成空白 */
export function fontLabelOf(id: string | null | undefined): string {
  if (!id) return '';
  return FONT_CHOICES.find((f) => f.id === id)?.label ?? id;
}

/**
 * 反过来：从一条字体栈认出它是清单里的哪一个。认不出（是这套风格自己写的栈）回空串。
 *
 * 提炼规范时用：`StyleDoc` 里那三套栈是识别阶段定下的，比让模型从提示词的文字里
 * 猜「衬线展示体是哪一个衬线」可靠得多。**按清单顺序比主字体名**，顺序不能乱——
 * `Montserrat` 的栈里也含 `system-ui`，先比 `system-ui` 会把它认成系统无衬线。
 */
export function fontIdOfStack(stack: string | null | undefined): string {
  if (!stack) return '';
  const lower = stack.toLowerCase();
  return FONT_CHOICES.find((f) => lower.includes(f.primary))?.id ?? '';
}
