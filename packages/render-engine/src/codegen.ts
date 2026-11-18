import { containsEmoji, type LintIssue, type StylePalette } from '@lumen/ir-schema';

/**
 * 模型产出的 HTML 的约束校验。
 *
 * 两种 HTML 走这里：识别时生成的**样机**，以及生成整本 deck 时的**每一页**。
 * 两者要守的规矩一样——单文件、内联样式、不引外部资源、配色只来自这套风格、
 * 不写脚本、不破坏固定 16:9 画布。
 *
 * ## 为什么 `:root` 要开豁免
 *
 * 「硬编码色值必须来自风格包」这条如果不豁免 `:root`，会变成一条**永远过不了**的规则：
 * `:root` 块正是定义这套风格色值的地方，它当然会写出具体的十六进制。
 * 真正要禁的是**在 `:root` 之外**随手写死一个颜色——那种地方写死之后，
 * 换主题时那一处不会跟着变，整套风格就散架了。
 *
 * 所以这里的做法是：先把 CSS 自定义属性的**定义**从 HTML 里抠掉，再扫剩下的十六进制。
 * 抠定义而不是只抠 `:root` 块，是因为模型有时把变量定义在 `.slide` 上而不是 `:root` 上——
 * 定义在哪不重要，重要的是用的时候是 `var(--x)` 而不是写死。
 */

/** 这套风格允许出现的色值（大写归一） */
export function paletteColors(palette: StylePalette): Set<string> {
  const set = new Set<string>();
  for (const c of Object.values(palette)) {
    if (typeof c !== 'string') continue;
    set.add(c.toUpperCase());
    // 三位缩写也放行
    const m = /^#([0-9a-fA-F]{6})$/.exec(c);
    if (m) {
      const h = m[1]!;
      if (h[0] === h[1] && h[2] === h[3] && h[4] === h[5]) {
        set.add(`#${h[0]}${h[2]}${h[4]}`.toUpperCase());
      }
    }
  }
  return set;
}

/**
 * 抠掉 CSS 自定义属性的定义（`--x: ...;`），只留下使用处。
 *
 * 自定义属性的值里可以出现任意字符（颜色、长度、字体栈、渐变），
 * 所以匹配到分号或右花括号为止，不能只匹配到空格。
 */
function stripCustomPropertyDefs(html: string): string {
  return html.replace(/--[\w-]+\s*:\s*[^;}]*;?/g, '');
}

/**
 * 去掉 HTML 的**数字字符实体**（`&#8594;` 是「→」、`&#8595;` 是「↓」、`&#x2713;` 是「✓」）。
 *
 * **不这么做的话，箭头会被当成十六进制色值。** `HEX_RE` 是 `#[0-9a-fA-F]{3,8}\b`，
 * 而 `&#8594;` 里的 `#8594` 正好落在这个形状里——于是「用箭头做装饰」被判成
 * 「写死了色值」，报出来的却是一个页面上根本不存在的颜色。
 *
 * 只对**色值扫描**那一步去实体，不动原串：实体在别处（比如 `title`、`alt`）
 * 是内容的一部分，不该被改掉。
 */
function stripNumericEntities(html: string): string {
  return html.replace(/&#(?:x[0-9a-fA-F]+|\d+);/g, '');
}

/**
 * 具名变量 → 色板字段。
 *
 * 这几个变量是**契约**：提示词里明确要求模型写 `--bg:#EFE6D9` 这样的定义，
 * 页面渲染时 `buildPageDocument` 也按这几个名字兜底。所以它们不是「随便一个变量」，
 * 值必须与色板逐字对上——模型把 `--bg` 定义成深色，整页的调子就翻了个个儿。
 */
const PALETTE_VAR: Record<string, keyof StylePalette> = {
  '--bg': 'bg',
  '--surface': 'surface',
  '--text': 'text',
  '--muted': 'muted',
  '--accent': 'accent',
  '--brand': 'brand',
  '--border': 'border',
};

/** 取出所有 `--name: value` 的定义 */
function customPropertyDefs(html: string): { name: string; value: string }[] {
  const out: { name: string; value: string }[] = [];
  const re = /(--[\w-]+)\s*:\s*([^;}]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push({ name: m[1]!.toLowerCase(), value: m[2]! });
  return out;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 把 `#abc` 补成 `#aabbcc`。`hexToRgb` 只认六位，三位简写不补全会解析成别的颜色 */
function expandHex(hex: string): string {
  const h = hex.slice(1);
  if (h.length === 3) return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`.toUpperCase();
  return hex.toUpperCase();
}

/**
 * 纯黑与纯白。**只有这两个**，灰阶不算。
 *
 * 描边、阴影、遮罩里写 `#000` / `#fff` 是常规手法，与风格无关，
 * 逼它们也走变量没有意义——实测「浅紫玻璃流光风」的封面就因为这个被打了回票，
 * 重试一次还是同一个写法，白花一次调用。
 *
 * **灰阶不在此列**：`#333` 这种是实打实的配色选择，换了风格就该跟着变，
 * 必须走 `var(--…)`。放行它等于把「硬编码色值」这条检查掏空。
 */
function isPureBlackOrWhite(hex: string): boolean {
  const h = expandHex(hex);
  return h === '#000000' || h === '#FFFFFF';
}

/** 中性色：灰、黑、白。描边、阴影、遮罩到处都要用，不该拦 */
function isNeutral(hex: string): boolean {
  return isNeutralRgb(hexToRgb(expandHex(hex)));
}

function isNeutralRgb(rgb: [number, number, number]): boolean {
  return Math.max(...rgb) - Math.min(...rgb) <= 12;
}

/** 一个 rgb 三元组是否与某个色板色同色系（各通道都在容差内） */
function nearRgbPalette(rgb: [number, number, number], palette: StylePalette, tol: number): boolean {
  return Object.values(palette).some((p) => {
    if (typeof p !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(p)) return false;
    const [pr, pg, pb] = hexToRgb(p);
    return Math.abs(rgb[0] - pr) <= tol && Math.abs(rgb[1] - pg) <= tol && Math.abs(rgb[2] - pb) <= tol;
  });
}

/** 与某个色板色同色系（各通道都在容差内）。深浅变体走这条 */
function nearPalette(hex: string, palette: StylePalette): boolean {
  return nearRgbPalette(hexToRgb(hex), palette, 32);
}

/**
 * `rgb()` / `rgba()` 的用色算不算「在色板上」。
 *
 * 纯黑、纯白、各种灰一律放行：描边、遮罩、阴影里到处都要用。
 *
 * 其余按**色板色的带透明度版本**放行。这条是实测补上的：提示词要求封面做渐变遮罩，
 * 模型写的 `rgba(14,28,75,.85)` 就是底色 `#0E1C4B` 加透明度——这是常规手法，
 * 原先却判成「硬编码色值」，一页合格的封面因此被标成失败。
 *
 * 容差比变量定义那条松得多（96 对 32）：变量定义是色板**本身**，必须逐字对上；
 * 这里的 rgba 是色板的**用法**，同色系内允许深浅变化——`rgba(120,180,255,.28)`
 * 是品牌蓝提亮之后的结果，判它越界是错的。真要拦的是「蓝色页面上冒出一块绿色」
 * 那种跨色相漂移，那至少差 150，96 拦得住。
 */
function rgbIsOnPalette(css: string, palette: StylePalette): boolean {
  const m = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(css);
  if (!m) return true;
  const rgb: [number, number, number] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (rgb.some((v) => !Number.isFinite(v))) return true;
  if (isNeutralRgb(rgb)) return true;
  return nearRgbPalette(rgb, palette, 96);
}

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
const RGB_RE = /rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*(?:,\s*[\d.]+\s*)?\)/g;

/** 相对亮度（WCAG 的定义）。算对比度用 */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 对比度，1（完全一样）~ 21（纯黑配纯白）。越大越清楚 */
function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 对比度的下限。
 *
 * 3:1 是 WCAG 给**大字号**（≥24px 粗体或 ≥18.66px）的 AA 线，而演示文稿里的
 * 标题动辄上百像素，正文也在 18px 上下——取 3 是贴着的。
 * 再往下就真的是「看不清」而不是「不够讲究」了。
 */
const CONTRAST_MIN = 3;

/**
 * 文字与它所在底色的对比度。只报最明确的那一种：**一条规则里同时写了底和字**。
 *
 * ## 为什么要有这一条
 *
 * 用户一次报了六套风格的「文字看不清」——深色卡片上写深色字、浅色底上写浅色字。
 * 这是**跨风格的通用毛病**，不是某一套的偶然：模型写
 * `.card{background:var(--surface);color:var(--text)}` 时脑子里想的是
 * 「卡片用表面色、字用正文色」，完全没考虑这两个色**放在一起**是什么效果。
 * 实测「重工蓝白工业风」的文字页就是这样：`--surface:#2B4C9B`（深蓝）
 * 配 `--text:#1A1A1A`（近黑），卡片上的字基本看不见。
 *
 * 判据一句话（用户给的）：**深色底配浅色字、浅色底配深色字**。
 *
 * ## 为什么只查这一种
 *
 * 完整判断要算 CSS 层叠——某个 div 的字色来自继承、底色来自祖先，静态看是看不出来的。
 * 所以这里宁可漏，不可误伤：**误判会让合格的页面被反复重发**，比漏掉一条糟得多。
 *
 * 跨层那一种由 `pageContrastIssues` 兜底，判据比这里窄得多，见它的说明。
 */
interface ContrastHit { selector: string; ratio: number; color: string; background: string }

/**
 * 从正则抓到的「选择器」里剥掉混进来的 HTML。
 *
 * `ruleRe` 是在**整篇 HTML** 上扫的，而 CSS 常常分成好几段 `<style>` 写，
 * 于是某个 `{` 之前那一长串可能是 `</div><style>.stage`——把标签也当成了选择器的一部分。
 * 页面级容器认的是 `.stage` 这种精确名字，脏了就对不上，整页判据会**静默失效**。
 * 实测就是这么发现的：构造用例全都不报，查下来是选择器不干净。
 *
 * 只在真的含 `<` 时才剥，免得动到 `.a > .b` 这类正常选择器。
 */
function cleanSelector(raw: string): string {
  const s = raw.trim();
  if (!s.includes('<')) return s.replace(/\s+/g, ' ');
  const parts = s.split('<');
  const last = parts[parts.length - 1] ?? '';
  return last.replace(/^[^>]*>/, '').trim().replace(/\s+/g, ' ');
}

function contrastIssues(html: string): ContrastHit[] {
  const vars = cssVarTable(html);
  const resolve = (raw: string): string | null => {
    const rgb = resolveColor(raw, vars);
    return rgb ? rgbToHex(rgb) : null;
  };

  const out: ContrastHit[] = [];
  // 一条规则 = 选择器 { 声明块 }。@media / @keyframes 的嵌套这里会看走眼，
  // 但看走眼的结果只是「跳过」，不会误报
  const ruleRe = /([^{}@]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(html)) !== null) {
    const selector = cleanSelector(m[1]!);
    const body = m[2]!;
    // 前面的 `[;{\s]` 是为了不把 `background-color` 里的 `color` 也当成文字色
    const bgRaw = /(?:^|[;{\s])background(?:-color)?\s*:\s*([^;}]+)/i.exec(body)?.[1];
    const fgRaw = /(?:^|[;{\s])color\s*:\s*([^;}]+)/i.exec(body)?.[1];
    if (!bgRaw || !fgRaw) continue;
    const background = resolve(bgRaw);
    const color = resolve(fgRaw);
    if (!background || !color) continue;
    const ratio = contrastRatio(hexToRgb(background), hexToRgb(color));
    /**
     * 比到小数点后一位再判，**别用原始值**。
     *
     * 实测踩过：某页算出来 2.96，报出去的消息是「3.0:1，至少要 3:1」——
     * 自己跟自己矛盾，看的人只会觉得这条检查坏了。按一位小数比，
     * 2.96 归到 3.0 就放行，2.7 该报的照报。
     */
    if (Number(ratio.toFixed(1)) < CONTRAST_MIN) out.push({ selector, ratio, color, background });
  }
  return out;
}

/** 把 CSS 变量表读成 `名字 → 原始值`。值可能又是 `var(--x)` 或 `color-mix(…)`，由 `resolveColor` 递归解开 */
function cssVarTable(html: string): Map<string, string> {
  const vars = new Map<string, string>();
  for (const { name, value } of customPropertyDefs(html)) {
    if (!vars.has(name)) vars.set(name, value.trim());
  }
  return vars;
}

const NAMED_COLORS: Record<string, [number, number, number]> = {
  white: [255, 255, 255],
  black: [0, 0, 0],
};

/** 从 `openIdx` 处的 `(` 配对到对应的 `)`，返回整段（含括号）。配不上返回 null */
function matchParens(s: string, openIdx: number): string | null {
  let depth = 0;
  for (let i = openIdx; i < s.length; i += 1) {
    if (s[i] === '(') depth += 1;
    else if (s[i] === ')') {
      depth -= 1;
      if (depth === 0) return s.slice(openIdx, i + 1);
    }
  }
  return null;
}

/**
 * 把一段 CSS 颜色解析成 rgb。
 *
 * 认四种写法：`#rgb` / `#rrggbb` / `var(--x)` / `color-mix(in srgb, A p%, B)`，
 * 外加 `white` / `black` 两个关键字。**其余一律返回 null**——`transparent`、
 * `currentColor`、`rgba(…)` 都算认不出。
 *
 * 认不出就当没有，是**故意的**：这条检查宁可漏，不可误伤。
 */
function resolveColor(raw: string, vars: Map<string, string>, depth = 0): [number, number, number] | null {
  if (depth > 8) return null; // 变量互相引用时防死循环
  const v = raw.trim();
  const named = NAMED_COLORS[v.toLowerCase()];
  if (named) return named;
  const hex = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/.exec(v);
  if (hex) return hexToRgb(expandHex(hex[0]!));
  const varRef = /^var\(\s*(--[\w-]+)/.exec(v);
  if (varRef) {
    const inner = vars.get(varRef[1]!.toLowerCase());
    return inner === undefined ? null : resolveColor(inner, vars, depth + 1);
  }
  const mixIdx = /^color-mix\(\s*in\s+srgb\s*,/i.exec(v);
  if (mixIdx) {
    const inner = matchParens(v, v.indexOf('('));
    if (!inner) return null;
    const parts = inner.slice(1, -1).replace(/^\s*in\s+srgb\s*,/i, '').split(',');
    if (parts.length !== 2) return null;
    const [aRaw, bRaw] = parts as [string, string];
    const a = resolveColor(aRaw, vars, depth + 1);
    const b = resolveColor(bRaw, vars, depth + 1);
    if (!a || !b) return null;
    // 权重写在任一侧都行；两侧都没写就是各一半
    const pct = /([\d.]+)\s*%/.exec(aRaw)?.[1];
    const w = pct === undefined ? 0.5 : Math.min(Math.max(Number(pct) / 100, 0), 1);
    return [
      Math.round(a[0] * w + b[0] * (1 - w)),
      Math.round(a[1] * w + b[1] * (1 - w)),
      Math.round(a[2] * w + b[2] * (1 - w)),
    ];
  }
  return null;
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const h = (n: number) => Math.round(n).toString(16).padStart(2, '0').toUpperCase();
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * 从一段 `background` 值里取出**所有**能解析的颜色，取平均当作这一层的代表色。
 *
 * 为什么是平均，而不是取最亮或最暗：整页底色几乎总是渐变，两端一深一浅。
 * 取最亮会放行「深红渐变上写黑字」——最亮那一端勉强够 4:1，可那只是左上角一小块，
 * 大部分面积是暗的；取最暗又会把浅色渐变误判成深色。**平均更贴近这一页大部分面积
 * 的观感**，实测第 11 页正是靠平均才抓出来。
 */
function averageColor(raw: string, vars: Map<string, string>): [number, number, number] | null {
  const found: [number, number, number][] = [];
  let rest = raw;
  // `color-mix(…)` 先摘掉：它内部含 `var()`，不先摘会被下面的 var 扫描重复计入
  for (;;) {
    const idx = rest.indexOf('color-mix(');
    if (idx < 0) break;
    const whole = matchParens(rest, idx + 'color-mix'.length);
    if (!whole) break;
    // `matchParens` 给的是括号那一段，要**把 `color-mix` 这个名字拼回去**才认得出
    const c = resolveColor(`color-mix${whole}`, vars);
    if (c) found.push(c);
    rest = `${rest.slice(0, idx)} ${rest.slice(idx + whole.length)}`;
  }
  for (const v of rest.match(/var\(\s*--[\w-]+/g) ?? []) {
    const c = resolveColor(v, vars);
    if (c) found.push(c);
  }
  for (const h of rest.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? []) {
    found.push(hexToRgb(expandHex(h)));
  }
  if (found.length === 0) return null;
  const n = found.length;
  return [
    Math.round(found.reduce((s, c) => s + c[0], 0) / n),
    Math.round(found.reduce((s, c) => s + c[1], 0) / n),
    Math.round(found.reduce((s, c) => s + c[2], 0) / n),
  ];
}

/**
 * 页面级容器：铺满整个画布的那一层。整页的底色由它决定。
 *
 * 只认这几个明确的名字，而且**画布容器优先于根元素**：模型一般先写
 * `html, body { background: var(--bg) }`，再写 `.stage { background: <深色渐变> }`，
 * 真正盖住画布的是后者。不分优先级就会取到那层白底，这一页的问题正好被遮掉。
 *
 * 判据放窄是**故意的**：漏判只是少抓一页，认错容器却会把
 * 「浅色页面上一个深色卡片」这类正常版式全打成对比度不足。
 */
const CANVAS_CONTAINERS = new Set(['.stage', '.slide', '.canvas', '.lumen-page']);
const ROOT_CONTAINERS = new Set(['html', 'body', '.page', '.deck', '.stage-wrap']);

/**
 * **整页底色与文字色的对比度。**
 *
 * ## 为什么还要单开一条
 *
 * `contrastIssues` 只查「同一条规则里同时写了底和字」，漏掉一整类：
 * **底色在祖先、字色在后代**。实测用户报的「红黑极简提案风文字页看不清」
 * 就是这个形状——`.stage` 铺了 `--brand` 深红渐变（只声明 `background`），
 * 而 `.headline` / `.body-text` / `.page-num` 各自写 `color: var(--text)`（近黑），
 * 跨了一层，前一条完全看不见。
 *
 * ## 判据
 *
 * 页面级容器的底色算出来之后，拿它去比那些**只声明了字色、没声明底色**的规则。
 * 不达标的**至少 3 条**才报：
 *
 * - 一条两条可能是「深色图片上压一行白字」这种正常写法，拦下来就是误伤；
 * - 成片不达标才是「整页设计错了」——那正是要打回重写的那一种。
 *
 * 自己声明了底色的规则一律不参与（它们的底在别处，判不准）。
 */
/**
 * 标签扫描用的正则。属性部分允许引号里出现 `>`（`data-x="a>b"` 这种）。
 * 注释先被剔除，免得注释里的标签把栈带偏。
 */
const TAG_RE = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
/** 不需要闭合标签的元素。SVG 里的形状大多自闭合，一并列上 */
const VOID_TAGS = new Set([
  'img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area', 'base', 'col',
  'embed', 'param', 'track', 'wbr',
  'circle', 'path', 'rect', 'line', 'ellipse', 'polygon', 'polyline', 'stop', 'use', 'image',
]);

/** 从属性串里取出 class 列表 */
function classesOf(attrs: string): string[] {
  const m = /class\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(attrs);
  return m ? (m[1] ?? m[2] ?? '').split(/\s+/).filter(Boolean) : [];
}

/** 选择器里出现的类名 */
function classNamesIn(selector: string): string[] {
  return [...selector.matchAll(/\.([\w-]+)/g)].map((m) => m[1]!);
}

/**
 * 每个类名**有没有实例是直接坐在整页底色上的**（上面没有压着别的色块）。
 *
 * ## 为什么必须看 DOM
 *
 * 一开始是按 CSS 规则猜的：「没声明 `background` 的文字规则 = 直接坐在整页底色上」。
 * 实测**误伤了五页正常版面**——第 7、13、19 页是白底上的白字，可那些白字其实坐在
 * 深色卡片里；第 24、25 页的深灰字坐在白色卡片里。它们的选择器上看不出任何线索
 * （`.card-note` 和 `.card` 是两个互不相干的规则），只有**看元素嵌套**才知道。
 *
 * 误伤的代价远大于漏判：合格的页面会被打回重写，白花一轮模型钱，还可能被改坏。
 *
 * ## 判据
 *
 * 扫一遍标签，维护一个栈；栈里任何一个「声明了背景色的非页面级容器」都算一层覆盖。
 * 只有**所有**实例都裸露在整页底色上的类名才算数——有一个实例被色块罩着就不算。
 */
function bareOnPageBackground(html: string, blockClasses: Set<string>): Set<string> {
  const bare = new Map<string, boolean>();
  const stack: { tag: string; cls: string[] }[] = [];
  let covered = 0;

  TAG_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG_RE.exec(html)) !== null) {
    const tag = m[2]!.toLowerCase();
    const attrs = m[3] ?? '';
    if (m[1] === '/') {
      // 按名字往回找最近的同名开标签，连同它之后没闭合的一起弹掉
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i]!.tag !== tag) continue;
        while (stack.length > i) {
          const e = stack.pop()!;
          covered -= e.cls.filter((c) => blockClasses.has(c)).length;
        }
        break;
      }
      continue;
    }
    const cls = classesOf(attrs);
    const selfClosing = attrs.trimEnd().endsWith('/') || VOID_TAGS.has(tag);
    // 此刻的 `covered` 只算了**祖先**，元素自己的背景不算——它自己的底色就是它自己的底
    const exposed = covered === 0;
    for (const c of cls) {
      const prev = bare.get(c);
      bare.set(c, prev === undefined ? exposed : prev && exposed);
    }
    if (!selfClosing) {
      stack.push({ tag, cls });
      covered += cls.filter((c) => blockClasses.has(c)).length;
    }
  }

  return new Set([...bare].filter(([, v]) => v).map(([k]) => k));
}

/**
 * **整页底色与文字色的对比度。**
 *
 * ## 为什么还要单开一条
 *
 * `contrastIssues` 只查「同一条规则里同时写了底和字」，漏掉一整类：
 * **底色在祖先、字色在后代**。实测用户报的「红黑极简提案风文字页看不清」
 * 就是这个形状——`.stage` 铺了 `--brand` 深红渐变（只声明 `background`），
 * 而 `.headline` / `.body-text` / `.page-num` 各自写 `color: var(--text)`（近黑），
 * 跨了一层，前一条完全看不见。
 *
 * ## 判据
 *
 * 页面级容器的底色算出来之后，拿它去比那些**只声明了字色、没声明底色**、
 * 而且**确实裸露在整页底色上**的规则（见 `bareOnPageBackground`——中间夹着色块的
 * 一律不算，那些字的底是色块不是整页）。
 *
 * 不达标的**至少 3 条**才报：一条两条可能是「深色图片上压一行白字」这种正常写法，
 * 成片不达标才是「整页设计错了」。
 */
function pageContrastIssues(html: string, vars: Map<string, string>): ContrastHit[] {
  let canvasBg: [number, number, number] | null = null;
  let rootBg: [number, number, number] | null = null;
  const textRules: { selector: string; classes: string[]; color: [number, number, number]; raw: string }[] = [];
  /** 声明了背景色的**非页面级容器**类名。栈里出现它就说明这一层有覆盖 */
  const blockClasses = new Set<string>();

  const ruleRe = /([^{}@]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = ruleRe.exec(html)) !== null) {
    const selector = cleanSelector(m[1]!);
    const body = m[2]!;
    const bgRaw = /(?:^|[;{\s])background(?:-color)?\s*:\s*([^;}]+)/i.exec(body)?.[1];
    if (bgRaw) {
      /**
       * 伪元素（`::before` / `::after`）是**装饰层**，不是罩着子元素的容器。
       *
       * 把它算成色块，它所在的那个元素就会被塞进色块名单，于是里面的文字
       * 全被当成「有底」而放行。实测第 25 页正是这么漏的：`.stage::before`
       * 那条径向暖光把 `stage` 塞了进去，整页深红底上的深色字一个都没报出来。
       */
      const names = selector.split(',').map((s) => s.trim()).filter((s) => !s.includes('::'));
      if (names.length === 0) continue;
      const bg = averageColor(bgRaw, vars);
      const isPageContainer = names.some((n) => CANVAS_CONTAINERS.has(n) || ROOT_CONTAINERS.has(n));
      if (bg && isPageContainer) {
        if (names.some((n) => CANVAS_CONTAINERS.has(n))) canvasBg = bg;
        else if (!canvasBg) rootBg = bg;
      } else if (!isPageContainer) {
        // 中间层的色块。它罩着的字，底是这个色块而不是整页
        for (const c of classNamesIn(names.join(', '))) blockClasses.add(c);
      }
      continue; // 自己声明了底色的，不参与整页判据
    }
    const fgRaw = /(?:^|[;{\s])color\s*:\s*([^;}]+)/i.exec(body)?.[1];
    if (!fgRaw) continue;
    const fg = resolveColor(fgRaw, vars);
    if (fg) textRules.push({ selector, classes: classNamesIn(selector), color: fg, raw: fgRaw.trim() });
  }

  const pageBg = canvasBg ?? rootBg;
  if (!pageBg) return [];

  const bare = bareOnPageBackground(html.replace(/<!--[\s\S]*?-->/g, ''), blockClasses);

  const bad = textRules
    // 选择器里一个类名都没有（纯标签选择器）时判不了，跳过——宁可漏
    .filter((r) => r.classes.length > 0 && r.classes.every((c) => bare.has(c)))
    .map((r) => ({
      selector: r.selector,
      color: r.raw,
      background: rgbToHex(pageBg),
      ratio: contrastRatio(r.color, pageBg),
    }))
    .filter((r) => Number(r.ratio.toFixed(1)) < CONTRAST_MIN);
  return bad.length >= 3 ? bad : [];
}

/** 拿来做「开合配对」判据的结构性标签。见 `lintMockHtml` 里那条规则 */
const STRUCTURAL_TAGS = ['div', 'section', 'main', 'header', 'footer', 'article', 'nav', 'figure', 'ul', 'ol', 'table'];

export function lintMockHtml(html: string, palette: StylePalette): LintIssue[] {
  const issues: LintIssue[] = [];
  const push = (rule: string, severity: LintIssue['severity'], message: string) =>
    issues.push({ rule, severity, message, path: 'html' });

  if (html.trim().length === 0) {
    push('codegen/empty', 'error', '生成的 HTML 为空');
    return issues;
  }

  // 动效只能来自白名单，不能自由写脚本
  if (/<script\b/i.test(html)) {
    push('codegen/script', 'error', 'HTML 不得包含 script 标签');
  }
  if (/<link\b[^>]*rel\s*=\s*["']?stylesheet/i.test(html)) {
    push('codegen/external-stylesheet', 'error', '不得引入外部样式表，样式必须内联');
  }
  if (/@import\b/i.test(html)) {
    push('codegen/import', 'error', '不得使用 @import 引入外部样式');
  }
  if (/url\(\s*['"]?https?:/i.test(html)) {
    push('codegen/external-asset', 'error', '不得引用外部资源 URL');
  }
  if (/\son[a-z]+\s*=\s*["']/i.test(html)) {
    push('codegen/inline-handler', 'error', '不得使用内联事件处理器');
  }

  /*
    抠掉变量定义之后再看剩下的色值。

    **还要先去掉 HTML 的数字字符实体。** `HEX_RE` 是 `#[0-9a-fA-F]{3,8}\b`，
    而 `&#8594;`（「→」）里的 `#8594` 正好落在这个形状里——于是「用箭头做装饰」
    被判成「写死了色值」，整份骨架被打回，而报错说的是一个页面上根本不存在的颜色。
    实测在界面排版的识别里连撞两次（`#8594` 与 `#8595`，就是 → 和 ↓）。
  */
  const body = stripNumericEntities(stripCustomPropertyDefs(html));
  const allowed = paletteColors(palette);
  const offending = [...new Set((body.match(HEX_RE) ?? []).map((h) => h.toUpperCase()))]
    .filter((h) => !allowed.has(h) && !isPureBlackOrWhite(h));
  if (offending.length > 0) {
    push(
      'codegen/hardcoded-color',
      'error',
      `在变量定义之外写死了色值：${offending.slice(0, 6).join('、')}；配色要写成 var(--…)`,
    );
  }
  const offendingRgb = (body.match(RGB_RE) ?? []).filter((c) => !rgbIsOnPalette(c, palette));
  if (offendingRgb.length > 0) {
    push('codegen/hardcoded-color', 'error', `写死了 rgb 色值：${offendingRgb.slice(0, 4).join('、')}`);
  }

  /**
   * **变量定义里的颜色也要查。**
   *
   * 只查「定义之外」是不够的——模型一旦发现把颜色塞进 `:root` 就没人管，
   * 就会把所有颜色都搬进变量定义里。实测就是这么发生的：提示词里明明白白写着
   * `--bg:#EFE6D9`，模型给出 `--bg:#0B0B10`，整页从暖米白翻成深紫，
   * 而上面那条硬编码检查一声不吭。
   *
   * 分两档：`--bg` 这几个具名变量是契约，值必须与色板**逐字对上**；
   * 其余变量（`--bg-soft` 这类深浅变体）允许是同色系或中性色。
   */
  const wrongContract: string[] = [];
  const offPalette: string[] = [];
  for (const { name, value } of customPropertyDefs(html)) {
    const hexes = (value.match(HEX_RE) ?? []).map((h) => h.toUpperCase());
    if (hexes.length === 0) continue;
    const slot = PALETTE_VAR[name];
    if (slot) {
      const expected = palette[slot].toUpperCase();
      for (const h of hexes) if (h !== expected) wrongContract.push(`${name}: ${h}（应为 ${expected}）`);
    } else {
      for (const h of hexes) if (!isNeutral(h) && !nearPalette(h, palette)) offPalette.push(`${name}: ${h}`);
    }
  }
  if (wrongContract.length > 0) {
    push(
      'codegen/palette-var-mismatch',
      'error',
      `这几个变量没有用这套风格的配色：${wrongContract.slice(0, 4).join('；')}`,
    );
  }
  if (offPalette.length > 0) {
    push(
      'codegen/off-palette-var',
      'error',
      `变量里出现了这套配色之外的颜色：${offPalette.slice(0, 4).join('；')}`,
    );
  }

  /**
   * 文字与它所在底色的对比度。见 `contrastIssues` 的说明。
   *
   * 只报**最差的那两条**：一页上十处低对比度的话，把十条都塞给模型它反而抓不住重点，
   * 而修掉最差的那两处通常就够它意识到问题在哪。
   */
  const lowContrast = contrastIssues(html).sort((a, b) => a.ratio - b.ratio);
  for (const c of lowContrast.slice(0, 2)) {
    push(
      'codegen/text-contrast',
      'error',
      `文字与底色的对比度太低（${c.ratio.toFixed(1)}:1，至少要 ${CONTRAST_MIN}:1）：`
      + `\`${c.selector}\` 的底色是 ${c.background}、文字色是 ${c.color}。`
      + '**深色底配浅色字、浅色底配深色字**——这两个色放在一起基本看不清',
    );
  }

  /**
   * 整页底色与文字色的对比度。见 `pageContrastIssues` 的说明。
   *
   * 这一条和上面那条是**互补的**：上面那条要求「底和字写在同一处」，
   * 这一条管「底在整页容器、字在各处」。两条都报的话，同一次重写里会同时带上，
   * 模型能从两个角度看到问题，更容易改对。
   */
  const pageContrast = pageContrastIssues(html, cssVarTable(html)).sort((a, b) => a.ratio - b.ratio);
  if (pageContrast.length > 0) {
    const worst = pageContrast[0]!;
    push(
      'codegen/page-text-contrast',
      'error',
      `整页底色与文字色反差不够（${pageContrast.length} 处）：整页铺的是 ${worst.background}，`
      + `而 ${pageContrast.slice(0, 3).map((c) => `\`${c.selector}\``).join('、')} 等用的是 ${worst.color}`
      + `（最低 ${worst.ratio.toFixed(1)}:1，至少要 ${CONTRAST_MIN}:1）。`
      + '**整页铺深色底时，页面上所有文字都要换成浅色**——页眉、页脚、页码、正文、标题一个都不能漏；'
      + '`--text` / `--muted` 是给浅色底准备的，深色底上不能用',
    );
  }

  if (containsEmoji(html)) {
    push('codegen/emoji', 'error', 'HTML 含 emoji 字符');
  }

  // 必须真的用上 CSS 变量，否则换主题时整套风格不会跟着变
  if (!/var\(--/.test(html)) {
    push('codegen/no-tokens', 'warning', '未使用任何 CSS 变量，换主题时会脱离这套风格');
  }

  /**
   * 画布是固定 1920×1080，且靠外层 `transform: scale()` 适配容器。
   *
   * `position: fixed` 相对视口定位，缩放之后会跑到容器外面；
   * `100vh` 取的是浏览器视口高度，不是画布高度，两者在缩放后不相等——
   * 这两种写法在编辑器里看着正常，一导出就错位。
   */
  if (/position\s*:\s*fixed/i.test(html)) {
    push('codegen/fixed-position', 'error', '使用了 position: fixed，会破坏固定 16:9 画布的定位');
  }
  if (/\b\d+(?:\.\d+)?vh\b/i.test(html)) {
    push('codegen/viewport-height', 'warning', '使用了 vh 单位；画布高度固定 1080px，vh 在缩放后不等于画布高度');
  }

  if (/<html\b|<body\b/i.test(html)) {
    push('codegen/full-document', 'warning', '应只生成页面片段，而不是完整文档骨架');
  }

  /**
   * **残缺的片段要拦下来，不能当成好页面落库。**
   *
   * 模型偶尔会在写到一半时被截断（供应商侧断流、超时后回了个半截 body），
   * 而我们此前**一条判据都没有**：一个只写到 `<style>…html,body` 就断掉的片段
   * 照样过 lint、标成 `ready` 落库，界面上那一格是绿的、打开来是**一整页白**。
   * 实测踩过：一本 30 页的书里第 5 页就是这样，用户报的是「第五页白页」。
   *
   * 判据挑的是**截断必然留下、而正常片段不会有**的两条：
   *
   * 1. `<style>` 没闭合。截断点几乎总在样式表里（样式表比正文长得多），
   *    而模型正常写完时不会漏 `</style>`——它漏了浏览器会把后面全部内容当样式吃掉，
   *    那种片段本来也不该上线。
   * 2. 结构性标签开合不配对。这一条兜住「样式表写完了、正文写到一半断掉」那种。
   *
   * 只数这几个结构性标签，**不数 `<span>` / `<p>` 之类**：它们在模型手里经常是
   * 「开一个闭一个漏一个」的写法，拿它们做判据会把好页面误判成失败。宁可漏掉
   * 一部分截断（那还有下面那条内容判据兜着），也不要误伤。
   */
  const styleOpens = (html.match(/<style\b/gi) ?? []).length;
  const styleCloses = (html.match(/<\/style\s*>/gi) ?? []).length;
  if (styleOpens > styleCloses) {
    push('codegen/unclosed-style', 'error', '样式表没有闭合（片段像是被截断了），这一页不能上线');
  }
  const unbalanced = STRUCTURAL_TAGS
    .map((tag) => ({
      tag,
      diff: (html.match(new RegExp(`<${tag}\\b(?![^>]*/>)`, 'gi')) ?? []).length
        - (html.match(new RegExp(`</${tag}\\s*>`, 'gi')) ?? []).length,
    }))
    .filter((x) => x.diff > 0);
  if (unbalanced.length > 0) {
    push(
      'codegen/unclosed-tag',
      'error',
      `这些标签没有闭合（片段像是被截断了）：${unbalanced.map((x) => x.tag).join('、')}`,
    );
  }

  /**
   * **一页至少要看得见东西。**
   *
   * 上面两条拦的是「结构断在半路」，这一条拦的是更隐蔽的一种：结构完整、
   * 但正文是空的——比如模型把样式表写完就停了，或者只回了一堆没有文字的容器。
   * 界面上那是一整页白，而所有别的判据都会放行。
   *
   * 文字、图、画布都算「看得见」；只有装饰性色块不算。
   */
  const withoutStyle = html.replace(/<style\b[\s\S]*?<\/style\s*>/gi, '');
  const visible = withoutStyle.replace(/<[^>]*>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').trim();
  if (visible.length === 0 && !/<(img|svg|canvas|video|picture)\b/i.test(withoutStyle)) {
    push('codegen/blank-page', 'error', '这一页没有任何可见内容（没有文字、也没有图），像是一张白页');
  }

  return issues;
}


/** 生成结果是否可用（无 error 级问题） */
export function isMockHtmlAcceptable(issues: LintIssue[]): boolean {
  return !issues.some((i) => i.severity === 'error');
}
