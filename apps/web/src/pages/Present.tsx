import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, PageLoader, useTheme } from '@lumen/ui';
import { brandOf } from '@lumen/ir-schema';
import { api } from '../api/client.js';
import { useStyleDoc } from '../api/hooks.js';
import type { PageEntry, ProjectDetail, StylePack } from '../api/types.js';
import { Presenter } from '../components/Presenter.js';

export function PresentPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();
  const { theme } = useTheme();
  /**
   * 起始页。工作台的「从当前页开始」把它带在 query 上（`?page=4`）。
   * 越界与非法值交给 Presenter 夹住——那里才知道一共几页。
   */
  const [params] = useSearchParams();
  const startIndex = Number(params.get('page') ?? '0');

  const detail = useQuery({
    queryKey: ['project', projectId, 'present'],
    queryFn: () => api.get<ProjectDetail>(`/projects/${projectId}`),
    enabled: Boolean(projectId),
  });

  /**
   * 新链路的风格文档。
   *
   * **不能只靠 `detail.style`**：它是「项目当前挂的那一套」，只有 `pack` 那一支带着
   * 能直接渲染的几何；新链路的页面 `blocks` 是空的、内容全在 `html` 里，
   * 没有配色与字体就渲染不出来——演示态会永远停在「正在准备演示」。
   * 所以这里按 styleId 单独取一次（拿到的是完整 StyleDoc，含 palette 与 fontFamily）。
   */
  const styleDoc = useStyleDoc(detail.data?.project.styleId ?? null);

  if (detail.isLoading) {
    return <div className="h-full bg-[#16181D]"><PageLoader label="正在准备演示" /></div>;
  }
  if (!detail.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-[#16181D] text-white/80">
        <p className="text-sm">无法加载演示内容</p>
        <Button variant="primary" onClick={() => navigate('/projects')}>返回项目库</Button>
      </div>
    );
  }

  const pages = (detail.data.pages as PageEntry[]).filter((p) => p.status === 'ready').map((p) => p.page);
  const pack: StylePack | null = detail.data.style?.kind === 'pack' ? detail.data.style.pack : null;
  const doc = styleDoc.data ?? null;
  // 新链路项目要等风格文档回来才能渲染，否则第一帧是空白
  const needsDoc = pages.some((p) => p.html.trim().length > 0);

  if (needsDoc && !doc) {
    return (
      <div className="h-full bg-[#16181D]">
        {styleDoc.isError
          ? <div className="flex h-full items-center justify-center text-white/70"><p className="text-sm">这套风格的配色取不到，演示打不开</p></div>
          : <PageLoader label="正在准备演示" />}
      </div>
    );
  }

  return (
    <Presenter
      pages={pages}
      pack={pack}
      styleDoc={doc}
      theme={theme}
      title={detail.data.project.title}
      brand={brandOf(detail.data.project)}
      startIndex={Number.isFinite(startIndex) ? startIndex : 0}
      onExit={() => navigate(`/projects/${projectId}`)}
    />
  );
}
