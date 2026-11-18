import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Icon, PageLoader, useTheme } from '@lumen/ui';
import type { PageIR, StyleDoc, StylePack } from '../api/types.js';
import { Presenter } from '../components/Presenter.js';

interface PublicShare {
  title: string;
  styleId: string | null;
  stylePack: StylePack | null;
  /** 新链路的风格文档。旧链路项目是 null */
  styleDoc: StyleDoc | null;
  expiresAt: number;
  pages: PageIR[];
}

/**
 * 分享页：公开只读。
 * 直接走 fetch 而不是 api 客户端——访客没有令牌，401 自动刷新逻辑在这里没有意义。
 */
export function SharePage() {
  const { token = '' } = useParams();
  const { theme } = useTheme();
  const [data, setData] = useState<PublicShare | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/present/${encodeURIComponent(token)}`);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok || !body.ok) {
          setError(body?.error?.message ?? '分享链接无效或已失效');
        } else {
          setData(body.data as PublicShare);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) return <div className="h-full bg-[#16181D]"><PageLoader label="正在打开分享" /></div>;

  if (error || !data) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-[#16181D] px-6 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/8 text-white/60">
          <Icon name="Link2Off" size={24} />
        </span>
        <div className="flex flex-col gap-1.5">
          <p className="text-[15px] font-medium text-white/85">{error || '分享链接不可用'}</p>
          <p className="max-w-md text-[13px] leading-[1.6] text-white/45">
            分享链接可能已过期或被撤销。如果你是通过本地文件直接打开本页，请改用 HTTP 地址访问——
            浏览器出于安全限制不允许从 file:// 打开分享链接。
          </p>
        </div>
      </div>
    );
  }

  if (data.pages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center bg-[#16181D] text-white/60">
        <p className="text-sm">这份演示还没有已就绪的页面</p>
      </div>
    );
  }

  return (
    <Presenter
      pages={data.pages}
      pack={data.stylePack}
      styleDoc={data.styleDoc ?? null}
      theme={theme}
      title={data.title}
    />
  );
}
