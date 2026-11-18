import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImageOverrides } from '@lumen/ir-schema';
import { textRunAtPoint, type CanvasSelection } from './CanvasTextHandles.js';

/**
 * 画布上的图位手柄：把 iframe 里每个图位框出来，直接拖。
 *
 * ## 为什么手柄画在 iframe 外面
 *
 * iframe 是 `sandbox="allow-same-origin"` 但**不开 `allow-scripts`**——那条边界不动
 * （见 `HtmlMock` 的注释）。所以不能在页面里注入拖拽脚本，只能在父文档里叠一层：
 * 从 `contentDocument` 量几何，手柄按同一套 1920×1080 画布坐标画出来。
 *
 * ## 拖动时为什么不走 React
 *
 * **拖动过程中直接改 iframe 里那个元素的内联 `translate`**，不写 store。
 * 写 store 会让 `srcdoc` 换一次、iframe 整个重载，一帧一次就是幻灯片；
 * 松手才写回覆盖表，那时重载一次，落在最终位置。
 *
 * 量几何用的是 `getBoundingClientRect()`：iframe 的布局视口就是 1920×1080
 * （元素宽度写死 1920，父层的 `scale` 只是视觉缩放，量不到），所以量出来**直接就是
 * 画布坐标**，不用再换算。反过来，指针位移是屏幕像素，得除以缩放比才是画布像素。
 *
 * ## 点在图位上的文字，要**让给文字**
 *
 * 手柄的点击区是**整个图位框**，而它画在文字层上面。封面那种「主视觉几乎铺满画布」的页面，
 * 一个图位框就压住了一大半文字（实测第 1 页：16 段里 9 段的中心落在图位里），
 * 于是点标题选到的是图片——用户的原话是「为什么选择文字了，但是选到的是图片」。
 *
 * 所以「点一下」（没拖动）这一支先问一句「这点上有没有文字」，有就报文字。
 * **拖动不受影响**：从图位框里任何位置都能拖走，那是明确的手势，不该被文字挡住。
 */
export interface SlotBox {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DragState {
  index: number;
  el: HTMLElement;
  startX: number;
  startY: number;
  baseDx: number;
  baseDy: number;
  dx: number;
  dy: number;
  /** 指针有没有真的挪过。没挪过就是「点了一下」，那要报选中、不该当拖动 */
  moved: boolean;
}

export function SlotHandles({
  frameRef, scale, overrides, onChange, onSelect,
}: {
  frameRef: React.RefObject<HTMLIFrameElement | null>;
  /** 画布显示宽 / 1920。指针位移除以它才是画布像素 */
  scale: number;
  overrides: ImageOverrides;
  onChange: (index: number, dx: number, dy: number) => void;
  /**
   * 点了一下（没拖）。右栏据此切 tab 并滚过去。
   *
   * 报的不一定是图位——点在图位上的文字时报的是文字（见顶部那段注释），
   * 所以这里收的就是与 `CanvasTextHandles` 同一个选中类型。
   */
  onSelect: (s: CanvasSelection) => void;
}) {
  const [boxes, setBoxes] = useState<SlotBox[]>([]);
  /** 铺满画布的那层容器。量它的位置做屏幕 → 画布坐标的换算 */
  const hostRef = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  /** 拖动中不改手柄位置——改的是被拖的那个元素，手柄得等松手再对齐 */
  const dragging = useRef(false);

  const measure = useCallback(() => {
    if (dragging.current) return;
    const doc = frameRef.current?.contentDocument;
    if (!doc) {
      setBoxes([]);
      return;
    }
    const found: SlotBox[] = [];
    for (const el of doc.querySelectorAll<HTMLElement>('[data-lumen-slot]')) {
      const index = Number(el.getAttribute('data-lumen-slot'));
      if (!Number.isFinite(index)) continue;
      const r = el.getBoundingClientRect();
      // 塌掉或只有几个像素的图位不给手柄：拖不动，画出来只是一道碍眼的线
      if (r.width < 8 || r.height < 8) continue;
      found.push({ index, x: r.left, y: r.top, w: r.width, h: r.height });
    }
    setBoxes(found);
  }, [frameRef]);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    // iframe 每次换 `srcdoc` 都会重载，元素全部重建，几何得重新量
    el.addEventListener('load', measure);
    measure();
    return () => el.removeEventListener('load', measure);
  }, [frameRef, measure]);

  // 换图 / 删图会改这一页的覆盖表，`load` 之外再兜一次
  useEffect(() => { measure(); }, [overrides, measure]);

  const elementAt = (index: number): HTMLElement | null => {
    const doc = frameRef.current?.contentDocument;
    return doc?.querySelector<HTMLElement>(`[data-lumen-slot="${index}"]`) ?? null;
  };

  const down = (e: React.PointerEvent, box: SlotBox) => {
    const el = elementAt(box.index);
    if (!el) return;
    e.preventDefault();
    e.stopPropagation();
    const ov = overrides[String(box.index)] ?? {};
    dragging.current = true;
    drag.current = {
      index: box.index,
      el,
      startX: e.clientX,
      startY: e.clientY,
      baseDx: ov.dx ?? 0,
      baseDy: ov.dy ?? 0,
      dx: ov.dx ?? 0,
      dy: ov.dy ?? 0,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    // 屏幕像素 → 画布像素。少了这一步，缩到 50% 时拖起来只有一半的位移，像卡住了
    d.dx = Math.round(d.baseDx + (e.clientX - d.startX) / scale);
    d.dy = Math.round(d.baseDy + (e.clientY - d.startY) / scale);
    // 阈值与 `CanvasTextHandles` 一致：几像素的抖动不该被当成拖动
    if (Math.abs(e.clientX - d.startX) > 4 || Math.abs(e.clientY - d.startY) > 4) d.moved = true;
    d.el.style.translate = `${d.dx}px ${d.dy}px`;
  };

  /** 这一点上是哪一段文字。图位框压住了文字时要把这一下让出去 */
  const textHere = (e: React.PointerEvent): number | null => {
    const doc = frameRef.current?.contentDocument;
    const host = hostRef.current;
    if (!doc || !host) return null;
    return textRunAtPoint(doc, host, e.clientX, e.clientY, scale);
  };

  const up = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    dragging.current = false;
    // 手柄先跟过去，免得松手到重载完成之间它跳回原位
    setBoxes((bs) => bs.map((b) => (
      b.index === d.index ? { ...b, x: b.x + d.dx - d.baseDx, y: b.y + d.dy - d.baseDy } : b
    )));
    if (!d.moved) {
      const i = textHere(e);
      onSelect(i === null ? { kind: 'image', i: d.index } : { kind: 'text', i });
      return;
    }
    if (d.dx !== d.baseDx || d.dy !== d.baseDy) onChange(d.index, d.dx, d.dy);
  };

  if (boxes.length === 0) return null;

  return (
    <div ref={hostRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {boxes.map((b) => (
        <div
          key={b.index}
          onPointerDown={(e) => down(e, b)}
          onPointerMove={(e) => {
            move(e);
            /*
              压在文字上时给文本光标。不给的话手柄一直显示 `move`，
              用户会以为标题这儿只能拖——而点下去其实选的是文字。
            */
            if (!drag.current) e.currentTarget.style.cursor = textHere(e) !== null ? 'text' : 'move';
          }}
          onPointerUp={up}
          onPointerCancel={up}
          title="拖动挪图位"
          style={{
            position: 'absolute',
            left: b.x,
            top: b.y,
            width: b.w,
            height: b.h,
            pointerEvents: 'auto',
            cursor: 'move',
            // 虚线常显、悬停变实线：不常显用户不知道这儿能拖，常显得太亮又会盖过页面本身
            outline: '2px dashed color-mix(in srgb, var(--accent-500) 55%, transparent)',
            outlineOffset: -2,
            borderRadius: 4,
          }}
          onPointerEnter={(e) => { e.currentTarget.style.outline = '2px solid var(--accent-500)'; }}
          onPointerLeave={(e) => {
            if (drag.current?.index === b.index) return;
            e.currentTarget.style.outline = '2px dashed color-mix(in srgb, var(--accent-500) 55%, transparent)';
          }}
        />
      ))}
    </div>
  );
}
