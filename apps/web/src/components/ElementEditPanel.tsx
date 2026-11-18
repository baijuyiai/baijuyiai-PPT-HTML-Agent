import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  applyElementEdits, markElementIndex, ELEMENT_INDEX_ATTR, PAGE_TYPE_LABEL,
  type ElementEdit, type PageType,
} from '@lumen/ir-schema';
import { Button, Icon, useToast } from '@lumen/ui';
import { api } from '../api/client.js';
import type { StyleDoc } from '../api/types.js';
import { HtmlMock } from './HtmlMock.js';

/**
 * 单页编辑的第二条路：**直接改这一页上的元素**——点一个元素、拖动改位置、改文字。
 *
 * ## 改的是字符串，不是活 DOM
 *
 * 拖动时确实直接改 iframe 里那个元素的内联 `translate`（那样才跟手），但**存下来的不是
 * 序列化结果**。渲染链路会往 HTML 上盖东西——`fillImageSlots` 盖 `src` / `data-lumen-slot`、
 * `markStaggerItems` 盖 `data-stagger-item`——序列化再还原要同时处理「图位填不上时 `<img>`
 * 被换成 `<div>`」这类情形，很脆；而且一旦漏还原，写死的图片地址就静默进了风格库，
 * 再被当样本喂给「统一风格」的提示词。详见 `applyElementEdits` 的注释。
 *
 * 所以这里只存一组「改了什么」（`ElementEdit[]`），渲染与保存都拿它对**原始 mockHtml**
 * 做定点补丁：`markElementIndex(applyElementEdits(mockHtml, edits))`。
 *
 * ## 画布坐标
 *
 * iframe 的布局视口就是 1920×1080（外层只用 CSS `scale` 做视觉缩放），所以从
 * `contentDocument` 量出来的几何**直接就是画布坐标**；反过来，屏幕上的指针位移要除以
 * 缩放比才是画布像素。与 `SlotHandles` 同一套。
 *
 * ## 选中与拖动是同一次按下
 *
 * 不做「先点选、再拖」两步：一次按下既选中也可能开始拖，指针没动够就只当点选。
 * 分开做的话用户得先点一下再按住拖，而拖动时手一抖就变成重新点选。
 */

/** 画布显示宽度。固定值——跟着容器变的话缩放比会变，指针换算与框的位置都得跟着重算 */
const CANVAS_W = 800;
const SCALE = CANVAS_W / 1920;

/**
 * 不给选的结构性元素。它们是渲染骨架（`buildPageDocument` 加的），不是这一页的内容。
 * 它们本来也点不中（`display:none`），列在这儿是防「往上找父级」时找到 `body` 以外的东西。
 */
const SKIP_TAGS = new Set(['HTML', 'BODY', 'HEAD', 'STYLE', 'SCRIPT', 'LINK', 'META', 'TITLE', 'BASE']);

interface Box { x: number; y: number; w: number; h: number }

interface DragState {
  index: number;
  el: HTMLElement;
  startX: number;
  startY: number;
  baseDx: number;
  baseDy: number;
  /** 拖动开始时元素框的位置（画布坐标），拖动中框直接跟着它走 */
  baseLeft: number;
  baseTop: number;
  dx: number;
  dy: number;
  moved: boolean;
}

/** 侧栏里那三格草稿。`baseText` 用来判断文字到底改没改——没改就别往 HTML 里写一遍 */
interface Draft {
  index: number;
  text: string;
  baseText: string;
  dx: string;
  dy: string;
}

/**
 * 把一条改动并进编辑表。
 *
 * **位移归零就把这一项去掉**，不在 HTML 里留一句 `translate: 0px 0px`——那是噪声，
 * 而且会让人以为「这个元素被特意摆过」。它自己那份文字改动要留着。
 */
function upsertOffset(list: ElementEdit[], index: number, dx: number, dy: number): ElementEdit[] {
  const found = list.find((e) => e.index === index);
  if (dx === 0 && dy === 0) {
    if (!found) return list;
    if (found.text === undefined) return list.filter((e) => e.index !== index);
    return list.map((e) => (e.index === index ? { index, text: found.text! } : e));
  }
  const next: ElementEdit = { ...(found ?? { index }), dx, dy };
  return found ? list.map((e) => (e.index === index ? next : e)) : [...list, next];
}

/**
 * 把侧栏草稿并进编辑表。**草稿按值传进来，不从 ref 现读**——
 * 这条路上的调用者常常紧接着就把 ref 换成下一个元素的草稿了（切选中时），
 * 现读会拿到新的那一份，改的文字就落到别的元素上。
 */
function withDraftOf(list: ElementEdit[], d: Draft): ElementEdit[] {
  let next = list;
  if (d.text !== d.baseText) {
    const found = next.find((e) => e.index === d.index);
    next = found
      ? next.map((e) => (e.index === d.index ? { ...e, text: d.text } : e))
      : [...next, { index: d.index, text: d.text }];
  }
  const dx = Number(d.dx);
  const dy = Number(d.dy);
  if (Number.isFinite(dx) && Number.isFinite(dy)) next = upsertOffset(next, d.index, dx, dy);
  return next;
}

export function ElementEditPanel({
  doc, pageType, prompt, mockHtml, onDone, onCancel, onDirtyChange,
}: {
  doc: Pick<StyleDoc, 'styleId' | 'palette' | 'fontFamily' | 'fontDisplay' | 'fontScript' | 'fontNumeric' | 'theme' | 'spec'>;
  pageType: PageType;
  /** 这一页现在的提示词。保存时要原样回传——服务端那条 PUT 要求它非空 */
  prompt: string;
  /** **原始**样机片段。所有编辑都是对它做补丁，不是对渲染结果做 */
  mockHtml: string;
  onDone: () => void;
  onCancel: () => void;
  /** 有未保存改动时上报。外层用它拦「切到另一个模式」 */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const toast = useToast();
  const [edits, setEdits] = useState<ElementEdit[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [box, setBox] = useState<Box | null>(null);
  /** 拒绝拖动的原因。常驻在侧栏里，不是一闪而过的提示——用户得知道为什么拖不动 */
  const [blocked, setBlocked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  /** 一步撤销：存上一次的编辑表。不做多步栈——这里的操作粒度就是「拖一下」 */
  const [lastEdits, setLastEdits] = useState<ElementEdit[] | null>(null);

  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const hoverRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<DragState | null>(null);
  /**
   * 侧栏草稿的镜像。事件处理里读到的是**本次渲染开始时**的那份 state，
   * 而选中、拖动、保存这几条路都要读「此刻真正在框里的值」，所以得有个 ref。
   */
  const draftRef = useRef<Draft | null>(null);

  /**
   * 真正交给 `HtmlMock` 的片段。
   *
   * `markElementIndex` 盖的号**只活在这一份里**，不进保存的字符串：它跟 `data-lumen-slot`
   * 是同一类东西，是给界面用的抓手，不是样机的一部分。
   */
  const html = useMemo(
    () => markElementIndex(applyElementEdits(mockHtml, edits)),
    [mockHtml, edits],
  );

  const elementByIndex = useCallback((index: number): HTMLElement | null => (
    frameRef.current?.contentDocument
      ?.querySelector<HTMLElement>(`[${ELEMENT_INDEX_ATTR}="${index}"]`) ?? null
  ), []);

  const measure = useCallback(() => {
    if (selected === null) { setBox(null); return; }
    const el = elementByIndex(selected);
    if (!el) { setBox(null); return; }
    // iframe 的布局视口就是画布，量出来直接是画布坐标
    const r = el.getBoundingClientRect();
    setBox({ x: r.left, y: r.top, w: r.width, h: r.height });
  }, [selected, elementByIndex]);

  useEffect(() => {
    const f = frameRef.current;
    if (!f) return;
    // iframe 每次换 `srcdoc` 都会重载，元素全部重建，几何得重新量
    f.addEventListener('load', measure);
    measure();
    return () => f.removeEventListener('load', measure);
  }, [measure]);

  /* ---------------- 选中 ---------------- */

  /**
   * 按画布坐标命中元素。命中的是**最内层**的，所以想挪一张卡片却选到里面的文字是常态——
   * 侧栏给了「选父级」来补救。
   */
  const pickAt = (clientX: number, clientY: number): HTMLElement | null => {
    const rect = overlayRef.current?.getBoundingClientRect();
    const d = frameRef.current?.contentDocument;
    if (!rect || !d) return null;
    // 屏幕坐标 → 画布坐标。先减再除：减掉的是缩放后的视觉位置，除的是缩放比
    const hit = d.elementFromPoint((clientX - rect.left) / SCALE, (clientY - rect.top) / SCALE);
    let el: HTMLElement | null = hit as HTMLElement | null;
    // 往上找第一个带号的。`elementFromPoint` 可能落在 body 上（片段没铺满的地方）
    while (el && !el.hasAttribute(ELEMENT_INDEX_ATTR)) el = el.parentElement;
    while (el && SKIP_TAGS.has(el.tagName)) el = el.parentElement;
    return el;
  };

  const select = useCallback((index: number, el: HTMLElement) => {
    const edit = edits.find((e) => e.index === index);
    const plain = el.children.length === 0 && !SKIP_TAGS.has(el.tagName);
    // 已经改过的元素，草稿从改动起算；没改过的，从它当前渲染出来的文字起算。
    // 拿渲染出来的那份当基准，才判断得出「这次到底改没改」
    const baseText = edit?.text ?? (plain ? (el.textContent ?? '') : '');
    const d: Draft = {
      index,
      text: baseText,
      baseText,
      dx: String(edit?.dx ?? 0),
      dy: String(edit?.dy ?? 0),
    };
    draftRef.current = d;
    setDraft(d);
    setSelected(index);
    setBlocked(null);
  }, [edits]);

  /**
   * 这个元素有没有「锚在它外面」的绝对定位后代。
   *
   * 有的话就不能拖：`translate`（和 `transform` 一样）会让元素成为**所有后代的包含块**，
   * 那些后代的参照物当场从别处换成它，位置一跳一大截。`SlotHandles` 拖的是叶子 `<img>`，
   * 永远踩不到这条；这里能拖容器，就必须先查。
   */
  const danglingDescendant = (el: HTMLElement): HTMLElement | null => {
    for (const d of el.querySelectorAll<HTMLElement>('*')) {
      const pos = getComputedStyle(d).position;
      if (pos !== 'absolute' && pos !== 'fixed') continue;
      // 没渲染出来的（display:none）跳了也看不见，不用管
      if (d.getClientRects().length === 0) continue;
      // 绝对定位后代的包含块就是它的 offsetParent；fixed 的为 null（参照视口）
      const cb = d.offsetParent;
      if (cb === el) continue;              // 本来就锚在我们身上，跟着走
      if (cb && el.contains(cb)) continue;  // 中间还有一层定位祖先，轮不到我们当包含块
      return d;
    }
    return null;
  };

  /* ---------------- 草稿落地 ---------------- */

  /**
   * 把侧栏草稿并进编辑表。
   *
   * **不把草稿清空**：清了之后输入框会跟着变空（它的 value 读的就是草稿），
   * 用户看到的是「一失焦文字就没了」。草稿留着，值不变，只是同时落进了编辑表。
   */
  const commitDraft = () => {
    const d = draftRef.current;
    if (!d) return;
    setLastEdits(edits);
    setEdits((prev) => withDraftOf(prev, d));
  };

  /* ---------------- 指针 ---------------- */

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const el = pickAt(e.clientX, e.clientY);
    // 点空白处 = 取消选中。先把草稿落下来，不然刚改的文字会跟着选中一起没了
    if (!el) {
      commitDraft();
      setSelected(null);
      setBlocked(null);
      return;
    }
    const index = Number(el.getAttribute(ELEMENT_INDEX_ATTR));
    if (!Number.isFinite(index)) return;
    if (index !== selected) {
      commitDraft();
      select(index, el);
    }

    const bad = danglingDescendant(el);
    if (bad) {
      setBlocked(
        `这个元素里面有一个绝对定位的 <${bad.tagName.toLowerCase()}> 锚在别处。`
        + '给它加位移会把那个元素的参照物换成它自己，位置会当场跳掉——'
        + '改选它里面的元素，或者改选外层更干净的那个。',
      );
      return;
    }

    const r = el.getBoundingClientRect();
    const edit = edits.find((x) => x.index === index);
    drag.current = {
      index, el,
      startX: e.clientX, startY: e.clientY,
      baseDx: edit?.dx ?? 0, baseDy: edit?.dy ?? 0,
      baseLeft: r.left, baseTop: r.top,
      dx: edit?.dx ?? 0, dy: edit?.dy ?? 0,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const hover = hoverRef.current;
    if (!d) {
      // 没在拖就画一层悬停框——不画的话用户是闭着眼睛点的
      if (!hover) return;
      const el = pickAt(e.clientX, e.clientY);
      if (!el) { hover.style.display = 'none'; return; }
      const r = el.getBoundingClientRect();
      hover.style.display = 'block';
      hover.style.left = `${r.left}px`;
      hover.style.top = `${r.top}px`;
      hover.style.width = `${r.width}px`;
      hover.style.height = `${r.height}px`;
      return;
    }
    // 屏幕像素 → 画布像素。少了这一步，缩到 42% 时拖起来只有不到一半的位移，像卡住了
    d.dx = Math.round(d.baseDx + (e.clientX - d.startX) / SCALE);
    d.dy = Math.round(d.baseDy + (e.clientY - d.startY) / SCALE);
    d.moved = true;
    // 拖动中直接改活 DOM，不写 state——写 state 会换 srcDoc、iframe 整体重载，一帧一次
    d.el.style.translate = `${d.dx}px ${d.dy}px`;
    // 框也直接跟过去，不走 React
    const b = boxRef.current;
    if (b) {
      b.style.left = `${d.baseLeft + d.dx}px`;
      b.style.top = `${d.baseTop + d.dy}px`;
    }
    if (hover) hover.style.display = 'none';
  };

  const onPointerUp = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    if (!d.moved) return;                       // 只是点选，没拖
    if (d.dx === d.baseDx && d.dy === d.baseDy) return;
    // 侧栏的 X / Y 要跟着走，不然框在那儿、数字还是旧的
    const prev = draftRef.current;
    const next: Draft = {
      index: d.index,
      text: prev?.text ?? '',
      baseText: prev?.baseText ?? '',
      dx: String(d.dx),
      dy: String(d.dy),
    };
    draftRef.current = next;
    setDraft(next);
    setLastEdits(edits);
    setEdits((prevEdits) => upsertOffset(prevEdits, d.index, d.dx, d.dy));
  };

  /* ---------------- 侧栏 ---------------- */

  const selectedEl = selected === null ? null : elementByIndex(selected);
  const plainText = selectedEl !== null && selectedEl.children.length === 0
    && !SKIP_TAGS.has(selectedEl.tagName);

  /**
   * 有没有东西可存。**必须从 state 算**：`draftRef.current` 变了不会触发重渲染，
   * 拿它当判据的话「保存」按钮永远是灰的。
   */
  const draftDirty = draft !== null && (() => {
    const e = edits.find((x) => x.index === draft.index);
    if (draft.text !== draft.baseText) return true;
    const dx = Number(draft.dx);
    const dy = Number(draft.dy);
    return (Number.isFinite(dx) && dx !== (e?.dx ?? 0)) || (Number.isFinite(dy) && dy !== (e?.dy ?? 0));
  })();
  const dirty = edits.length > 0 || draftDirty;

  // 上报给外层，切模式时用它拦一道
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);

  const applyDraftField = (patch: Partial<Draft>) => {
    const d = draftRef.current;
    if (!d) return;
    const next = { ...d, ...patch };
    draftRef.current = next;
    setDraft(next);
    // 文字实时打到画布上，不走 state——走 state 就是每敲一个字重载一次 iframe。
    // 元素现查，不用渲染时抓的那个引用：iframe 可能刚重载过，旧引用已经脱离了文档
    if (patch.text !== undefined) {
      const el = elementByIndex(d.index);
      if (el) el.textContent = patch.text;
    }
  };

  const undo = () => {
    if (!lastEdits) return;
    setEdits(lastEdits);
    setLastEdits(null);
    draftRef.current = null;
    setDraft(null);
    setSelected(null);
  };

  const reset = () => {
    setLastEdits(edits.length > 0 ? [] : null);
    setEdits([]);
    draftRef.current = null;
    setDraft(null);
    setSelected(null);
    setBlocked(null);
  };

  const selectParent = () => {
    if (!selectedEl) return;
    const p = selectedEl.parentElement;
    if (!p || !p.hasAttribute(ELEMENT_INDEX_ATTR)) {
      setBlocked('已经是最外层了，没有父级可选。');
      return;
    }
    const index = Number(p.getAttribute(ELEMENT_INDEX_ATTR));
    if (!Number.isFinite(index)) return;
    commitDraft();
    select(index, p);
  };

  async function save() {
    const d = draftRef.current;
    const finalEdits = d ? withDraftOf(edits, d) : edits;
    if (finalEdits.length === 0) return;
    setSaving(true);
    try {
      const r = await api.put<{ issues: { pageType: string; message: string }[] }>(
        `/styles/docs/${encodeURIComponent(doc.styleId)}/pages/${pageType}`,
        // prompt 原样回传：服务端那条 PUT 要求它非空，改样机不该动提示词
        { prompt, mockHtml: applyElementEdits(mockHtml, finalEdits) },
      );
      toast.success('已保存', PAGE_TYPE_LABEL[pageType]);
      if (r.issues.length > 0) {
        toast.info('存了，不过这一页的样机有几个问题', r.issues.map((i) => i.message).join('；'));
      }
      onDone();
    } catch (err) {
      toast.error('保存失败', err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start gap-4 px-5 py-4">
      {/* 画布。外层宽度写死，缩放交给 HtmlMock——与工作台、导出走同一条路 */}
      <div className="shrink-0" style={{ width: CANVAS_W }}>
        <HtmlMock
          doc={doc}
          html={html}
          width={CANVAS_W}
          pageType={pageType}
          frameRef={frameRef}
          /*
            不传 staggerSeed：逐块进场会往 HTML 里盖 `data-stagger-item`，
            虽然不进保存的字符串，但编辑时元素还在飞进来，点不中。
            不传 hover：overlay 吃掉了指针事件，悬停反馈也看不到。
          */
          overlay={(
            <div
              ref={overlayRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={() => { if (hoverRef.current) hoverRef.current.style.display = 'none'; }}
              style={{ position: 'absolute', inset: 0, cursor: 'crosshair' }}
            >
              {/* 悬停框：常显太吵，只在指针下面那一个元素上闪一层 */}
              <div
                ref={hoverRef}
                style={{
                  position: 'absolute', display: 'none', pointerEvents: 'none',
                  outline: '1px dashed color-mix(in srgb, var(--brand-600) 60%, transparent)',
                  outlineOffset: -1, borderRadius: 3,
                }}
              />
              {/* 选中框 */}
              {box && (
                <div
                  ref={boxRef}
                  style={{
                    position: 'absolute', pointerEvents: 'none',
                    left: box.x, top: box.y, width: box.w, height: box.h,
                    outline: '2px solid var(--brand-600)', outlineOffset: -2, borderRadius: 4,
                  }}
                />
              )}
            </div>
          )}
        />
      </div>

      {/* 侧栏 */}
      <div className="flex min-w-[280px] flex-1 flex-col gap-3">
        <p className="text-[12px] leading-[1.7] text-[var(--text-3)]">
          在左边点一个元素选中它，按住拖动改位置，下面改文字。位移是<span className="text-[var(--text-2)]">平移</span>——
          不脱离它原来的版式，只整体挪一段距离。
        </p>

        {blocked && (
          <div className="flex items-start gap-1.5 rounded-[var(--radius-inner)] bg-[var(--surface-1)] px-3 py-2 text-[12px] leading-[1.6] text-[var(--text-2)]">
            <Icon name="TriangleAlert" size={16} />
            <span>{blocked}</span>
          </div>
        )}

        {!selectedEl ? (
          <p className="text-[13px] text-[var(--text-3)]">还没选中元素。</p>
        ) : (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-[12px] text-[var(--text-3)]">选中的元素</span>
              <span className="truncate font-[var(--font-mono)] text-[12px] text-[var(--text-1)]">
                &lt;{selectedEl.tagName.toLowerCase()}
                {typeof selectedEl.className === 'string' && selectedEl.className.trim()
                  ? `.${selectedEl.className.trim().split(/\s+/).join('.')}`
                  : ''}
                &gt;
              </span>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[12px] text-[var(--text-3)]">位移</span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-[12px] text-[var(--text-3)]">
                  X
                  <input
                    type="number"
                    value={draft?.dx ?? '0'}
                    onChange={(e) => applyDraftField({ dx: e.target.value })}
                    onBlur={commitDraft}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitDraft(); }}
                    className="w-[72px] rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-0)] px-2 py-1 font-[var(--font-mono)] text-[12px] text-[var(--text-1)]"
                  />
                </label>
                <label className="flex items-center gap-1 text-[12px] text-[var(--text-3)]">
                  Y
                  <input
                    type="number"
                    value={draft?.dy ?? '0'}
                    onChange={(e) => applyDraftField({ dy: e.target.value })}
                    onBlur={commitDraft}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitDraft(); }}
                    className="w-[72px] rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface-0)] px-2 py-1 font-[var(--font-mono)] text-[12px] text-[var(--text-1)]"
                  />
                </label>
                <span className="text-[11px] text-[var(--text-3)]">画布像素</span>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[12px] text-[var(--text-3)]">文字</span>
              {plainText ? (
                <textarea
                  rows={2}
                  value={draft?.text ?? ''}
                  onChange={(e) => applyDraftField({ text: e.target.value })}
                  onBlur={commitDraft}
                  className="w-full resize-y rounded-[var(--radius-inner)] border border-[var(--border)] bg-[var(--surface-0)] px-2.5 py-2 text-[13px] leading-[1.6] text-[var(--text-1)]"
                />
              ) : (
                <span className="text-[12px] leading-[1.6] text-[var(--text-3)]">
                  这个元素里面还有子元素，换文字会把子元素一起抹掉。点它里面那个文字元素来改。
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button pill size="sm" variant="ghost" icon="CornerLeftUp" onClick={selectParent}>
                选父级
              </Button>
              <Button pill size="sm" variant="ghost" icon="Undo2" disabled={!lastEdits} onClick={undo}>
                撤销这一步
              </Button>
              <Button pill size="sm" variant="ghost" disabled={edits.length === 0} onClick={reset}>
                全部重置
              </Button>
            </div>
          </>
        )}

        {/*
          保存的副作用要说在前面。服务端 `replacePagePrompt` 会把这一页标成
          `source: 'manual'` + `edited: true`，而「一键统一风格」会跳过被手改过的页
          （`StyleLibrary` 里那条 `skippedEdited`）。事后才发现就晚了
        */}
        <p className="text-[12px] leading-[1.6] text-[var(--text-3)]">
          存下来之后这一页会标成「手改」，「一键统一风格」不再改它。改动只影响这一页的样机，
          提示词原样保留。
        </p>

        <div className="flex items-center gap-2">
          <Button pill variant="primary" disabled={!dirty || saving} onClick={() => void save()}>
            {saving ? '保存中…' : '保存'}
          </Button>
          <Button
            pill
            variant="ghost"
            onClick={() => {
              // 改了没保存最容易让人以为已经存上了，所以拦一道
              if (dirty && !window.confirm('这一页还有没保存的改动，确定要离开吗？')) return;
              onCancel();
            }}
          >
            取消
          </Button>
          {dirty && <span className="text-[12px] text-[var(--text-3)]">{edits.length} 处改动待保存</span>}
        </div>
      </div>
    </div>
  );
}
