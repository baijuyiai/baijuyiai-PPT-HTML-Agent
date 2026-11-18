import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { brandOf } from '@lumen/ir-schema';
import { api } from '../api/client.js';
import { useStyleDoc } from '../api/hooks.js';
import { HtmlMock, usePageMockInputs } from './HtmlMock.js';
import type { PageIR, ProjectSummary } from '../api/types.js';

/**
 * 项目库卡片上的封面：那本演示的第 1 页。
 *
 * **懒加载是这个组件的核心，不是优化。** 每张封面都是一个 iframe，而 iframe 要解析一份
 * 完整文档、跑一遍那套风格的 CSS。一次挂「项目总数」个，50 个项目就会卡住整个列表——
 * 所以卡片滚进视口才请求封面、才挂 iframe，风格文档也一并门控在同一个条件上。
 *
 * 渲染复用工作台的 `HtmlMock`（新链路）。旧链项目（只有 `blocks`、没有 `html`）与还没
 * 生成过的项目都退回文字占位：渲染旧链要为每张卡片拉一次项目详情拿 `StylePack`，
 * 而旧链是正在消失的形态。
 */
export function ProjectCover({ project, onOpen }: { project: ProjectSummary; onOpen: () => void }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);

  /**
   * 进过视口就置 true，之后不再观察。
   *
   * `rootMargin` 给 200px：提前一屏就开始加载，滚到的时候已经渲染好了。
   * **不回退成 false**——滚回去不该把已经渲染好的封面拆掉再重建。
   */
  useEffect(() => {
    const el = boxRef.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) setVisible(true); },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  /**
   * 量容器宽。卡片宽度是响应式的（1 / 2 / 3 列），而 `HtmlMock` 要一个具体宽度。
   * 与 `CenterCanvas.tsx:21-37` 那套 `useLayoutEffect` + `ResizeObserver` 同一个写法。
   */
  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const compute = () => setWidth(el.clientWidth);
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cover = useQuery({
    /**
     * key 里带上 `updatedAt`。
     *
     * 封面画的就是第 1 页，而改页面、换风格、重新生成都会让服务端把项目那一行的
     * `updatedAt` 刷新（`refreshProjectCounts`）。key 里只有 projectId 的话，
     * react-query 会认为「还是同一个查询」，再叠上下面那 60 秒 `staleTime`——
     * 改完项目回到列表，看到的仍是改之前那张封面。
     */
    queryKey: ['project-cover', project.projectId, project.updatedAt],
    queryFn: () => api.get<{ page: PageIR | null }>(`/projects/${project.projectId}/cover`),
    // **视口外不请求**，这是懒加载的另一半
    enabled: visible,
    staleTime: 60_000,
  });

  /**
   * **也门控在 `visible` 上。** `useStyleDoc` 自己会按 `styleId` 缓存，但视口外的卡片
   * 照样会为它那套风格发一次请求；传 `null` 时它的 `enabled` 是 false，不发。
   */
  const styleDoc = useStyleDoc(visible ? project.styleId : null);
  const page = cover.data?.page ?? null;
  const doc = styleDoc.data ?? null;
  const html = page?.html ?? '';

  // `brandOf` 每次渲染都返回新对象，而 `HtmlMock` 的 `useMemo` 依赖里有 `brand`——
  // 直接传字面量会把那个 useMemo 打穿。与 `CenterCanvas.tsx:59-67` 同一条理由。
  const brand = useMemo(() => brandOf(project), [project]);

  /**
   * 渲染这一页需要的输入（正文、页类型、页码、数字人、图位调整、品牌）。
   *
   * **和工作台画布用的是同一个 hook**，这是刻意的：两处渲染的是同一页，
   * 各拼各的迟早会漂——事实上就漂过，封面没传 `overrides` 也没传 `avatar`，
   * 卡片上那张和工作台里那张根本是两页。
   */
  const mockInputs = usePageMockInputs(page, brand);

  return (
    <div ref={boxRef} className="relative aspect-video w-full overflow-hidden bg-[var(--surface-1)]">
      {/*
        封面**不能包在按钮里**：iframe 会吞掉点击——`document.elementFromPoint` 在样机上
        返回的就是 `IFRAME`，而点击不跨 iframe 边界，套在 `<button>` 里的封面点不开项目。
        所以渲染归渲染，另加一层透明按钮盖在上面接点击。
      */}
      {page && doc && html !== '' && width > 0 ? (
        <HtmlMock
          doc={doc}
          width={width}
          {...mockInputs}
          /*
            **不传 `images`。** `HtmlMock` 不传时会自己按色板挑（`stockImagesFor`），
            而**单张**样机时那条回退与 `useMockImages(doc, [html])[0]` 的结果逐字节相同
            （拿开发库 15 页实测比对过）。传了只是每张卡片白跑一次分配。
            那个 prop 是给「一组样机摆在一起」用的——一组里几张不传会挑到同一张画面，
            这里只有一张，不存在那个问题。
          */
          frame={false}
        />
      ) : (
        <CoverPlaceholder title={project.title} />
      )}

      <button
        type="button"
        onClick={onOpen}
        className="absolute inset-0 cursor-pointer"
        aria-label={`打开项目 ${project.title}`}
      />
    </div>
  );
}

/** 没有封面时的文字占位。与改动前卡片上那段排版一致 */
function CoverPlaceholder({ title }: { title: string }) {
  return (
    <div className="flex h-full w-full flex-col justify-end gap-2 p-4">
      <span className="h-1.5 w-14 rounded-full bg-[var(--accent-500)]" />
      <span className="line-clamp-2 text-[17px] font-semibold leading-[1.3] text-[var(--text-1)]">{title}</span>
      <span className="h-1.5 w-[62%] rounded-full bg-[var(--border)]" />
      <span className="h-1.5 w-[42%] rounded-full bg-[var(--border)]" />
    </div>
  );
}
