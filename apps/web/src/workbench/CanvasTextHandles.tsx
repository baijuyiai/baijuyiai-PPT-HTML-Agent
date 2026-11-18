import { useCallback, useEffect, useRef, useState } from 'react';
import { SelectionFrame } from './SelectionFrame.js';

/**
 * 画布上「点一段文字就选中它」的那一层。
 *
 * ## 与 `SlotHandles` 的分工
 *
 * 这一层铺满整块画布，图位手柄（`SlotHandles`）的框画在它**上面**（DOM 里更靠后）。
 * 所以：点到图位 → 手柄接（拖 / 选），点到别处 → 这一层接（找文字）。
 *
 * ## 为什么点得到 iframe 里的文字
 *
 * iframe 是 `sandbox="allow-same-origin"` 但**不开 `allow-scripts`**——那条边界不动
 * （见 `HtmlMock` 的注释）。外层读得到它的 DOM，只是里面的脚本跑不起来，而这里要的正是「读」。
 *
 * 命中用的是 `caretRangeFromPoint`（拿到点中的那个**文本节点**），不是 `elementFromPoint`：
 * 一段 `<p><strong>来源可查</strong>：Palantir 在…</p>` 里有**两段**文字，
 * 只知道「点在 p 上」是分不出用户想改哪一段的。
 *
 * ## 段号必须与右栏那份清单对得上
 *
 * 右栏那份清单来自 `textRunsOf(page.html)`（按字符串扫），这里的段号来自遍历 iframe 的
 * DOM。两边的规则必须一字不差——跳过 `style`/`script`/`title` 子树、跳过纯空白文本节点。
 * **对不上就宁可不让选**：悄悄改错一段，用户是看不出来的。
 */
export type CanvasSelection =
  | { kind: 'text'; i: number }
  | { kind: 'image'; i: number }
  | null;

/** 与 `html-doc.ts` 的 `SKIP_TEXT_TAGS` 一致。两处必须同步改 */
const SKIP_TAGS = new Set(['STYLE', 'SCRIPT', 'TITLE']);

function isSkipped(node: Node): boolean {
  for (let p = node.parentElement; p; p = p.parentElement) {
    if (SKIP_TAGS.has(p.tagName)) return true;
  }
  return false;
}

/** iframe 里所有「可编辑文字段」的文本节点，顺序与 `textRunsOf` 一致 */
export function textNodesOf(doc: Document): Text[] {
  const out: Text[] = [];
  const walker = doc.createTreeWalker(doc.body ?? doc.documentElement, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text;
    if (isSkipped(t)) continue;
    if ((t.data ?? '').trim() === '') continue;
    out.push(t);
  }
  return out;
}

/** 这个点上有没有文字。有就回那个文本节点 */
function textNodeAt(doc: Document, x: number, y: number): Text | null {
  const anyDoc = doc as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null;
  };
  const range = anyDoc.caretRangeFromPoint?.(x, y);
  const hit = range?.startContainer
    ?? anyDoc.caretPositionFromPoint?.(x, y)?.offsetNode
    ?? null;
  if (!hit || hit.nodeType !== Node.TEXT_NODE) return null;
  const text = hit as Text;
  if ((text.data ?? '').trim() === '' || isSkipped(text)) return null;
  /**
   * `caretRangeFromPoint` 在**空白处也会回最近的一段文字**——不筛一道的话，
   * 点画布角落会莫名其妙选中页面里某一段，而「点空白取消选中」也就永远不生效。
   * 判据：那个点上真正命中的元素里，得包含这个文本节点。
   */
  const under = doc.elementFromPoint(x, y);
  if (!under || !under.contains(text)) return null;
  return text;
}

/**
 * 指针这一点上是哪一段文字。回段号，没有文字回 `null`。
 *
 * **两个手柄层都要用它**：文字层用它决定选哪一段；图位层用它决定「这一下该不该让给文字」
 * （见 `SlotHandles` 里那段注释——封面那种主视觉几乎铺满画布，图位框会压住一大片文字）。
 * 放在这里而不是各写一份：段号必须与右栏那份清单对得上，两处各遍历一次迟早会漂。
 *
 * `host` 是铺满画布的那层容器的 DOM（量它的位置做屏幕 → 画布坐标的换算）。
 */
export function textRunAtPoint(
  doc: Document,
  host: HTMLElement,
  clientX: number,
  clientY: number,
  scale: number,
): number | null {
  const rect = host.getBoundingClientRect();
  const node = textNodeAt(doc, (clientX - rect.left) / scale, (clientY - rect.top) / scale);
  if (!node) return null;
  const i = textNodesOf(doc).indexOf(node);
  return i >= 0 ? i : null;
}

export function CanvasTextHandles({
  frameRef, scale, selection, onSelect,
}: {
  frameRef: React.RefObject<HTMLIFrameElement | null>;
  /** 画布显示宽 / 1920。屏幕像素除以它才是画布像素 */
  scale: number;
  selection: CanvasSelection;
  onSelect: (s: CanvasSelection) => void;
}) {
  /** 选中那一段的框（画布坐标） */
  const [box, setBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const down = useRef<{ x: number; y: number } | null>(null);

  /** 量选中那一段的位置。找不到就不画框——多半是页面刚换、DOM 还是旧的 */
  const measure = useCallback(() => {
    if (selection?.kind !== 'text') { setBox(null); return; }
    const doc = frameRef.current?.contentDocument;
    if (!doc) { setBox(null); return; }
    const nodes = textNodesOf(doc);
    const node = nodes[selection.i];
    if (!node) { setBox(null); return; }
    const range = doc.createRange();
    range.selectNodeContents(node);
    const r = range.getBoundingClientRect();
    if (r.width <= 0 && r.height <= 0) { setBox(null); return; }
    setBox({ x: r.left, y: r.top, w: r.width, h: r.height });
  }, [frameRef, selection]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    // 换 `srcdoc` 会重载 iframe，元素全重建，几何得重新量
    el.addEventListener('load', measure);
    measure();
    return () => el.removeEventListener('load', measure);
  }, [frameRef, measure]);

  /** 画布坐标。与 `ElementEditPanel` 同一套换算：屏幕像素 ÷ 缩放比 */
  const toCanvas = (e: React.PointerEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: (e.clientX - rect.left) / scale, y: (e.clientY - rect.top) / scale };
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const start = down.current;
    down.current = null;
    if (!start) return;
    // 拖过就不是「点」了——用户多半是在框选或甩动，不该顺手改选中
    if (Math.abs(e.clientX - start.x) > 4 || Math.abs(e.clientY - start.y) > 4) return;

    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    const i = textRunAtPoint(doc, e.currentTarget as HTMLElement, e.clientX, e.clientY, scale);
    onSelect(i === null ? null : { kind: 'text', i });
  };

  return (
    <div
      style={{ position: 'absolute', inset: 0, pointerEvents: 'auto', cursor: 'default' }}
      onPointerDown={(e) => { down.current = { x: e.clientX, y: e.clientY }; }}
      onPointerUp={onPointerUp}
      // 划过文字时换成文本光标：不换的话，用户根本不知道画布上的字是能点的
      onPointerMove={(e) => {
        const doc = frameRef.current?.contentDocument;
        const el = e.currentTarget as HTMLElement;
        if (!doc) return;
        const { x, y } = toCanvas(e);
        el.style.cursor = textNodeAt(doc, x, y) ? 'text' : 'default';
      }}
    >
      {box && (
        <SelectionFrame
          data-lumen-text-box={selection?.kind === 'text' ? selection.i : undefined}
          box={box}
          scale={scale}
        />
      )}
    </div>
  );
}
