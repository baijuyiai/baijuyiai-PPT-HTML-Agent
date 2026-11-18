import { activeBlockOf, dragPoint, planSwarm, playedOut, stateOf, timelineAt } from './plan.js';

/**
 * 画布上那群光标：把这一页「搭」出来。
 *
 * ## 这是自己写的一份，不是抄的
 *
 * 观感参考 `swarm-cursors`（它致敬 Joel Califa 的 Swarm）。那份仓库**没有开源许可证**，
 * README 明写未经同意不要复用它的代码，所以这里一行都没搬：图形是自己画的路径，
 * 物理是自己写的弹簧 + 避让，编排在 `plan.ts`。学的是「一群光标在干活」这件事怎么读起来
 * 像真的，不是它的实现。
 *
 * ## 分工
 *
 * - **时间轴**（谁在第几毫秒画哪一块、打到第几个字）是纯函数，在 `plan.ts`
 * - **调用方**把「有哪些块、每块在画布上的哪里」量好交进来（`SwarmItem`，**画布坐标**）
 * - **这里只做**：按时间轴截断文字、画框与尺寸徽标、让光标飞过去
 *
 * ## 两种放法
 *
 * - **生成中**（`loop`）：放完停一下（`LOOP_HOLD_MS`）再从头来，一直循环到调用方卸下它。
 *   一页要跑几十秒到几分钟，而这条动画只有五到十秒——不循环的话剩下那几分钟画面上
 *   什么都没有在动。
 * - **揭幕**（非 `loop`）：只放一遍，放完叫一声 `onPlayedOnce` 并**停掉 rAF**。
 *   真页落地之后走这一遍，调用方收到那一声就把揭示层换成真页。
 *
 * ## 一切尺寸按**屏幕像素**算
 *
 * 画布是一张 1920×1080 的稿子缩到屏幕上显示的，实测常用状态下只有三成多。光标要是
 * 按画布坐标画，30 画布像素到屏幕上就剩 10 像素——根本看不见，而「看见一群光标在动」
 * 正是这个效果的全部。所以这里把块坐标换算成显示像素再画：光标恒定 30 屏幕像素、
 * 线宽恒定 2 像素、避让距离恒定 70 像素，跑到哪个缩放都一样。物理也跑在显示像素上，
 * 于是速度是「每秒多少屏幕像素」，手感不随缩放变。
 *
 * ## 为什么不用 React 渲染
 *
 * 每秒六十帧改文字、改 transform。走 React 就是每帧一次调和，而这里改的全是
 * 「已知会变的那几个节点」——直接写 DOM，与仓库里 `SlotHandles` 拖动时的做法一致。
 *
 * ## 顺手拿到的性能保障
 *
 * 标签页切走时 `requestAnimationFrame` 自己就停了；`prefers-reduced-motion` 由调用方
 * 挡在门外（那一档压根不启动这个引擎）。
 */

const CANVAS_W = 1920;
const CANVAS_H = 1080;

/**
 * 光标图形。白描边 + 彩填充——压在任何底色上都看得见，这是这类光标的老规矩。
 *
 * `solid` 为假的用描边画（十字准星、I-beam），为真的填充（箭头）。
 */
const SHAPES = {
  arrow: { d: 'M4 3 L4 18 L7.6 14.6 L10.2 20.4 L12.8 19.2 L10.2 13.6 L15.4 13.6 Z', solid: true, hot: [4, 3] },
  cross: { d: 'M11 2 V8.4 M11 13.6 V20 M2 11 H8.4 M13.6 11 H20', solid: false, hot: [11, 11] },
  ibeam: { d: 'M7 4 H15 M11 4 V18 M7 18 H15', solid: false, hot: [11, 11] },
} as const;

/** 图形的坐标系是 22×22，画出来是 `CURSOR_PX` 那么大——热点要按这个比例换算 */
const VIEW_BOX = 22;

type ShapeName = keyof typeof SHAPES;

const STYLE_ID = 'lumen-swarm-style';

/**
 * 取设计系统里的一个颜色变量。
 *
 * **选框走品牌绿，不走这套风格的强调色**：风格色是给这一页的版面用的，选框是**产品
 * 自己的**界面层——它得在十二套风格上都长成同一个样子，用户才知道那是同一件事。
 * 荧光绿是产品的主色（`--brand-500`，和主行动按钮同一个），压在浅色稿子上是一根
 * 干净的亮线，压在深色稿子上更亮。
 *
 * 读计算值而不是直接写 `var()`：SVG 的 `stroke` 属性**不吃 CSS 变量**，那是表现属性，
 * 只有 `style` 里才认。所以在这里换成字面色值再拼进字符串。
 */
function token(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v === '' ? fallback : v;
}

/** 光标、线宽、控制点、避让距离——**都是屏幕像素**，与画布缩放无关 */
const CURSOR_PX = 22;
/**
 * 框的线宽与角点大小。
 *
 * **细**是刻意的：选框是叠在这一页内容之上的，粗一点就变成压在稿子上的一道栏杆，
 * 一页十几个框叠起来整片发绿。1.4 像素在屏幕上是一根干净的细线，够指出边界又不挡内容。
 */
const STROKE_PX = 1.4;
const HANDLE_PX = 6;
const SEP_PX = 72;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SwarmItem {
  /** 画框的对象 */
  el: HTMLElement;
  /** 要逐字打出来的元素。**不给就是「只画框」**——真实 HTML 那条路，字已经烘在页面里了 */
  textEl?: HTMLElement | null;
  /** **画布坐标**（1920×1080 那一套）。必须量在文字被截断之前，否则量到的是空块 */
  box: Box;
}

export interface SwarmOptions {
  /** 叠层的挂载点。**与画布显示区同框**（不是那个被缩放过的 1920 容器） */
  layer: HTMLElement;
  /** 这一页开始生成的时刻。`t = Date.now() - origin` */
  origin: number;
  items: SwarmItem[];
  /**
   * 放完了**从头再来**，直到调用方把它卸下来。
   *
   * 「生成中」那一版要的就是这个：一页要跑几十秒到几分钟，而这条动画只有五到十秒，
   * 不循环的话剩下那几分钟画面上什么都没有在动，看着像卡死。
   * 揭幕那一遍（真页落地之后）传假——那一遍只放一次，放完就停。
   */
  loop?: boolean;
  /** 非循环时，这一遍放完叫一声。调用方据此把揭示层换成真页 */
  onPlayedOnce?: () => void;
  /** 光标配色。不给就用产品自己那一套，见下 */
  colors?: string[];
  /** 一个画布像素等于几个屏幕像素。**每帧读一次**，窗口缩放时不用重启 */
  scale: () => number;
}

interface Cursor {
  el: HTMLDivElement;
  path: SVGPathElement;
  /** 屏幕坐标（相对叠层左上角） */
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  /** 转向有多急。那 25% 的「急性子」就是这两个数大 */
  force: number;
  color: string;
  shape: ShapeName;
  phase: number;
  spin: number;
  radius: number;
}

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
.lumen-swarm-cursor { position: absolute; left: 0; top: 0; will-change: transform; }
.lumen-swarm-cursor svg { display: block; overflow: visible; }
.lumen-swarm-badge {
  position: absolute; left: 0; top: 0; white-space: nowrap;
  padding: 1px 6px; border-radius: 3px; font: 600 12px/1.5 ui-monospace, monospace;
  letter-spacing: .02em;
}
/* caret 默认藏着，只有引擎判到「正在打这一块」才挂出来。
   这样即使 React 重渲染把属性抹掉，也只会少一根光标，不会多出一根不眨的 */
.lumen-swarm-caret { display: inline-block; width: 2px; height: .92em; vertical-align: -.08em;
  margin-left: 2px; background: currentColor; visibility: hidden; }
.lumen-swarm-caret[data-on="1"] { visibility: visible; animation: lumen-swarm-blink 1s steps(1) infinite; }
@keyframes lumen-swarm-blink { 0%, 50% { opacity: 1 } 50.01%, 100% { opacity: 0 } }
@media (prefers-reduced-motion: reduce) { .lumen-swarm-caret[data-on="1"] { animation: none } }
`;
  document.head.appendChild(style);
}

/**
 * 起一轮群光标。返回收尾函数。
 *
 * 收尾必须做干净：换页、换内容、组件卸载都会走它——留着 rAF 就是一堆孤儿在空转。
 */
export function startSwarm(opts: SwarmOptions): () => void {
  const { layer, origin, items, colors, scale, loop = false, onPlayedOnce } = opts;
  if (items.length === 0) return () => undefined;
  ensureStyle();
  /** 选框那一族色。读一次就够——一轮生成几十秒，中途换主题的窗口可以忽略 */
  const brand = token('--brand-500', '#BDEC3D');
  const brandFg = token('--brand-fg', '#161D00');

  const els = items.map((i) => i.el);
  const textEls = items.map((i) => i.textEl ?? null);
  const carets = els.map((el) => el.querySelector<HTMLElement>('[data-swarm-caret]'));
  /**
   * 要打的全文。
   *
   * **从 `data-swarm-full` 读，不从 `textContent` 读**：引擎会因为「服务端那条进度到了」
   * 之类的原因重启，而重启时元素上的文字已被上一轮截成了半截——再读一次就只剩那半截，
   * 计划里每块的字数越读越少，第二次之后一个字都打不出来（实测踩过）。
   *
   * 那几块要打字的元素由调用方在渲染时挂上这两个属性，换页、换内容时跟着更新；
   * 这里只读不写——写在 DOM 上会被复用的节点带到下一页去。
   *
   * **现在没有调用方喂它**：画布上画的是风格里的样机 / 功能库的骨架，文字烘在那些片段里，
   * 截不了。这一路留着，是因为它就是「逐字打字」这件事的通用机制——
   * 真要喂，在 iframe 文档里给文字元素挂上 `data-swarm-text` 与 `data-swarm-full` 即可。
   */
  const full = textEls.map((el) => el?.dataset.swarmFull ?? '');

  /**
   * 把每一块的高度钉住。
   *
   * 打字时文字一点点变长，字一多就换行、整页跟着往下跳——而框是按最初量到的位置画的，
   * 两边立刻对不上。钉住之后版式在整个过程里是死的。
   */
  for (const [i, el] of els.entries()) {
    if (textEls[i]) el.style.minHeight = `${el.offsetHeight}px`;
  }

  const cursorCount = Math.min(6, Math.max(3, Math.ceil(items.length / 2)));
  const plan = planSwarm(full.map((s) => s.length), cursorCount);

  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  // 给个能查的标记：探针与调试要数「画了几个框」，靠 viewBox 猜太脆
  svg.dataset.lumenSwarm = '';
  svg.style.cssText = 'position:absolute;left:0;top:0;pointer-events:none;overflow:visible';
  const badgeLayer = document.createElement('div');
  badgeLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none';
  layer.append(svg, badgeLayer);

  const cursors: Cursor[] = [];
  /*
    光标的配色**不取这套风格的强调色**，尽管那样看起来更「融入」。

    这一层是**产品自己的界面**，不是这一页的内容——它得在十二套风格上都长成同一个
    样子，用户才认得出那是同一件事。风格色留给稿子本身。品牌绿打头，后面几个是固定的
    同伴色：一群光标里全是一个颜色就看不出「一群」了。
  */
  const palette = colors && colors.length > 0
    ? colors
    : [brand, '#3B82F6', '#8B5CF6', '#F59E0B', '#EC4899', '#06B6D4'];
  for (let c = 0; c < plan.cursorCount; c += 1) {
    const el = document.createElement('div');
    el.className = 'lumen-swarm-cursor';
    // 每个光标各是一支独立的口味：速度、转向、绕行相位都不同
    const hot = c % 4 === 0;
    const cur: Cursor = {
      el,
      path: document.createElementNS(svgNs, 'path'),
      // 从画布下缘外飞进来：一上来就出现在版面上会显得凭空冒出来
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      speed: hot ? 1_450 : 620 + (c % 3) * 140,
      force: hot ? 5_200 : 1_200 + (c % 2) * 520,
      color: palette[c % palette.length]!,
      shape: 'arrow',
      phase: c * 1.7,
      spin: (c % 2 === 0 ? 1 : -1) * (0.28 + (c % 3) * 0.07),
      radius: 0.7 + (c % 3) * 0.28,
    };
    const s = document.createElementNS(svgNs, 'svg');
    s.setAttribute('viewBox', '0 0 22 22');
    s.setAttribute('width', String(CURSOR_PX));
    s.setAttribute('height', String(CURSOR_PX));
    s.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,.22))';
    s.appendChild(cur.path);
    el.appendChild(s);
    layer.appendChild(el);
    cursors.push(cur);
  }

  // 徽标按块建，用到了才建。**不能按下标取 `children`**——那儿只有建过的那些
  const badgeEls: HTMLElement[] = [];
  const badgeText: string[] = [];

  /** 上一帧写进去的值。**只在变了才写 DOM**——每帧无脑覆写会让浏览器一直在做无用功 */
  const lastText = els.map(() => '\u0000');
  const lastOpacity = els.map(() => '');
  let lastSvg = '';
  let raf = 0;
  let last = performance.now();
  let stopped = false;
  let placed = false;
  let notified = false;

  const drawCursor = (c: Cursor, shape: ShapeName): void => {
    if (c.shape !== shape) {
      const s = SHAPES[shape];
      c.path.setAttribute('d', s.d);
      c.path.setAttribute('fill', s.solid ? c.color : 'none');
      c.path.setAttribute('stroke', s.solid ? '#fff' : c.color);
      c.path.setAttribute('stroke-width', s.solid ? '1.4' : '2');
      c.path.setAttribute('stroke-linejoin', 'round');
      c.path.setAttribute('stroke-linecap', 'round');
      c.shape = shape;
    }
    // 减掉热点：让光标的**尖端**落在目标点上，而不是元素的左上角
    const k = CURSOR_PX / VIEW_BOX;
    const [hx, hy] = SHAPES[shape].hot;
    c.el.style.transform = `translate(${(c.x - hx * k).toFixed(1)}px, ${(c.y - hy * k).toFixed(1)}px)`;
  };

  const frame = (dt: number): void => {
    /*
      时间轴上的位置。**循环就是这一个取模**（见 `plan.ts` 的 `timelineAt`）：
      `stateOf` 是纯函数，下面每一处又只在「值变了」的时候才写 DOM，
      所以 `t` 一回到 0，文字自己回到零个字、框自己重新画——没有第二处复位逻辑。
    */
    const raw = Date.now() - origin;
    const t = timelineAt(plan, raw, loop);
    const s = Math.max(0.05, scale());
    const vw = CANVAS_W * s;
    const vh = CANVAS_H * s;
    // 画布按显示尺寸建坐标系，线宽才不会被一起缩放掉
    if (svg.getAttribute('width') !== String(vw)) {
      svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
      svg.setAttribute('width', String(vw));
      svg.setAttribute('height', String(vh));
    }
    /** 画布坐标 → 屏幕坐标（相对叠层左上角） */
    const sx = (b: Box) => ({ x: b.x * s, y: b.y * s, w: b.w * s, h: b.h * s });
    const states = plan.blocks.map((b) => stateOf(b, t));

    if (!placed) {
      placed = true;
      for (const [c, cur] of cursors.entries()) {
        cur.x = vw / 2 + (c - cursors.length / 2) * 120;
        cur.y = vh + 60;
      }
    }

    // —— 文字与可见性 ——
    for (const [i, b] of plan.blocks.entries()) {
      const st = states[i]!;
      const tel = textEls[i];
      const want = full[i]!.slice(0, st.typed);
      if (lastText[i] !== want) {
        if (tel) tel.textContent = want;
        lastText[i] = want;
      }
      const caret = carets[i];
      const on = st.phase === 'typing' ? '1' : '0';
      if (caret && caret.dataset.on !== on) caret.dataset.on = on;
      /*
        不打字的块跟着它的框一起淡入。
        真实 HTML 那条路整块都在这一支里——那些元素的文字是烘在页面里的，打不了字，
        所以「画框 → 框里的东西淡出来」就是那一路的写法。
      */
      if (!tel) {
        const o = st.phase === 'waiting' ? '0' : String(Math.min(1, st.box * 1.3));
        if (lastOpacity[i] !== o) { els[i]!.style.opacity = o; lastOpacity[i] = o; }
      }
    }

    // —— 框、控制点与尺寸徽标 ——
    let next = '';
    for (let i = 0; i < plan.blocks.length; i += 1) {
      const st = states[i]!;
      const r = sx(items[i]!.box);
      if (st.phase === 'waiting') { badgeText[i] = ''; continue; }
      if (st.phase === 'drawing') {
        const p = dragPoint(st.box);
        const w = r.w * p.u;
        const h = r.h * p.v;
        next += `<rect x="${r.x.toFixed(1)}" y="${r.y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"`
          + ` fill="none" stroke="${brand}" stroke-width="${STROKE_PX}" stroke-dasharray="9 6" />`;
        // 已经拖到的两个角各钉一个控制点：一眼看出这是在「框」，不是随便一根线
        for (const [hx, hy] of [[r.x, r.y], [r.x + w, r.y + h]] as const) {
          next += `<rect x="${(hx - HANDLE_PX / 2).toFixed(1)}" y="${(hy - HANDLE_PX / 2).toFixed(1)}"`
            + ` width="${HANDLE_PX}" height="${HANDLE_PX}" fill="#fff" stroke="${brand}" stroke-width="${STROKE_PX}" />`;
        }
        badgeText[i] = `${Math.round(items[i]!.box.w * p.u)} × ${Math.round(items[i]!.box.h * p.v)}`;
      } else {
        // 正在打字：实线 + 四角控制点。已经画完的：淡框留着，标出「这块好了」
        const typing = st.phase === 'typing';
        next += `<rect x="${r.x.toFixed(1)}" y="${r.y.toFixed(1)}" width="${r.w.toFixed(1)}" height="${r.h.toFixed(1)}"`
          + ` fill="none" stroke="${brand}" stroke-width="${STROKE_PX}" opacity="${typing ? '0.95' : '0.28'}" />`;
        if (typing) {
          for (const [hx, hy] of
            [[r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]] as const) {
            next += `<rect x="${(hx - HANDLE_PX / 2).toFixed(1)}" y="${(hy - HANDLE_PX / 2).toFixed(1)}"`
              + ` width="${HANDLE_PX}" height="${HANDLE_PX}" fill="#fff" stroke="${brand}" stroke-width="${STROKE_PX}" />`;
          }
        }
        badgeText[i] = '';
      }
    }
    if (next !== lastSvg) { svg.innerHTML = next; lastSvg = next; }

    for (let i = 0; i < badgeText.length; i += 1) {
      const text = badgeText[i]!;
      const st = states[i]!;
      let el = badgeEls[i];
      if (!text) { if (el) el.style.display = 'none'; continue; }
      if (!el) {
        el = document.createElement('div');
        el.className = 'lumen-swarm-badge';
        /*
          徽标就是界面主行动按钮那一套配色（`--brand-500` 底 + `--brand-fg` 字）。
          深色小方块压在浅色稿子上太抢眼，换成主色之后它读起来是「产品吐出来的一个读数」，
          而不是贴上去的一块补丁。
        */
        el.style.background = brand;
        el.style.color = brandFg;
        badgeLayer.appendChild(el);
        badgeEls[i] = el;
      }
      const r = sx(items[i]!.box);
      const p = dragPoint(st.box);
      el.style.display = '';
      // 压在正在拖的那个角的外侧，跟真拖框时一样
      el.style.transform = `translate(${(r.x + r.w * p.u + 12).toFixed(1)}px, ${(r.y + r.h * p.v + 12).toFixed(1)}px)`;
      if (el.textContent !== text) el.textContent = text;
    }

    // —— 光标 ——
    for (const [c, cur] of cursors.entries()) {
      const job = activeBlockOf(plan, c, t);
      let target: { x: number; y: number };
      let shape: ShapeName;
      if (job) {
        const st = stateOf(job, t);
        const r = sx(items[job.index]!.box);
        if (st.phase === 'drawing') {
          const p = dragPoint(st.box);
          target = { x: r.x + r.w * p.u, y: r.y + r.h * p.v };
          shape = 'cross';
        } else {
          /*
            打字时站在字尾。**量那根 caret**，不是算个近似值——
            文字换行之后「末尾」在哪只有浏览器知道，而 caret 是它自己排出来的。
            打完了 caret 就藏起来（宽度归 0），那时退到块的左上角待命。
          */
          const box = carets[job.index]?.getBoundingClientRect();
          const layerBox = layer.getBoundingClientRect();
          target = box && box.width > 0.5
            ? { x: box.left - layerBox.left, y: box.top - layerBox.top + box.height / 2 }
            : { x: r.x + 24, y: r.y + r.h / 2 };
          shape = 'ibeam';
        }
      } else {
        // 手上没活：绕画布中心慢慢巡游
        const a = cur.phase + (t / 1000) * cur.spin;
        const R = (320 + cur.radius * 150 + 40 * Math.sin(t / 1500 + cur.phase)) * s;
        target = { x: vw / 2 + Math.cos(a) * R, y: vh / 2 + Math.sin(a) * R * 0.58 };
        shape = 'arrow';
      }

      // 弹簧式转向：离得越远越用力，近了自然减速，落在目标上不抖
      const dx = target.x - cur.x;
      const dy = target.y - cur.y;
      const d = Math.hypot(dx, dy) || 1;
      const want = Math.min(d * 3.4, cur.speed);
      const k = Math.min(1, (cur.force / 1000) * dt * 6);
      cur.vx += ((dx / d) * want - cur.vx) * k;
      cur.vy += ((dy / d) * want - cur.vy) * k;

      // 同伴避让：太近就互相推开。**没有它，几个光标会叠成一个**
      for (const o of cursors) {
        if (o === cur) continue;
        const ox = cur.x - o.x;
        const oy = cur.y - o.y;
        const od = Math.hypot(ox, oy);
        if (od > 0.01 && od < SEP_PX) {
          const push = (1 - od / SEP_PX) * 900 * dt;
          cur.vx += (ox / od) * push;
          cur.vy += (oy / od) * push;
        }
      }

      // 不该飞出画布：撞边就贴着走，免得出现「光标在页面外干活」
      cur.x = Math.max(-20, Math.min(vw + 20, cur.x + cur.vx * dt));
      cur.y = Math.max(-20, Math.min(vh + 20, cur.y + cur.vy * dt));
      drawCursor(cur, shape);
    }

    /*
      揭幕那一遍（`loop` 为假）放完就收工：叫一声交给调用方，**并把 rAF 停掉**。
      画面到这一刻就定住了，继续每帧空转只是白烧电。
    */
    if (!loop && playedOut(plan, raw)) {
      stopped = true;
      cancelAnimationFrame(raf);
      if (!notified) {
        notified = true;
        onPlayedOnce?.();
      }
    }
  };

  /**
   * **先同步跑一帧**。
   *
   * 调用方是在 `useLayoutEffect` 里起的这个引擎，那一帧还没画到屏幕上——先把文字截到
   * 该有的位置、把该藏的块藏起来，浏览器第一次画出来就是「正在进行中」的样子。
   * 交给 rAF 等下一帧的话，用户会先看到一整页完好的内容闪一下。
   */
  frame(0);

  const tick = (): void => {
    if (stopped) return;
    raf = requestAnimationFrame(tick);
    const now = performance.now();
    // `dt` 封顶：切回标签页时第一帧的间隔可能是几十秒，不封会把光标甩到画布外
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frame(dt);
  };
  // 上面那一帧可能已经判到「放完了」（揭幕那一遍 + origin 在过去），那就不用再起循环
  if (!stopped) raf = requestAnimationFrame(tick);

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    svg.remove();
    badgeLayer.remove();
    for (const c of cursors) c.el.remove();
    // 块上的临时样式要还回去：这一层卸载之后草稿还可能被别处用（打印、导出预览）
    for (const el of els) { el.style.minHeight = ''; el.style.opacity = ''; }
  };
}
