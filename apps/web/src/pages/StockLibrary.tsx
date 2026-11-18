import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, Icon, IconButton, Input,
  SegmentedControl, cn, useToast,
} from '@lumen/ui';
import {
  STOCK_CATEGORY_LABEL,
  STOCK_CATEGORY_ORDER,
  STOCK_KIND_LABEL,
  STOCK_PHOTOS,
  setStockPhotos,
  sortStockPhotos,
  stockCategoryOf,
  stockUrl,
  type StockCategory,
  type StockPhoto,
} from '@lumen/stock-library';
import { api } from '../api/client.js';
import { useSession } from '../stores/session.js';

/**
 * 图片库。
 *
 * 这是生成页面时按风格配色自动挑图的那个池子，不是装饰性素材区。摆出来是为了能一眼
 * 看清「系统手上到底有哪些图、分别是什么调子」——在这之前它只在下游露过面，也就是
 * 某一页被挑中的那几张，看不出全貌，也就无从判断挑得对不对。
 *
 * **作者与出处必须显示**：照片来自 Unsplash、人物来自 Gendo 的免费抠图库，署名是它们的
 * 使用条款要求的，不是可选的装饰。少了它，这个页面比没有更糟。
 *
 * **筛选条上是「人物 / 物件 / 其他」三个分类，不是七个题材**：59 张各国人物摆在几十张风景照里，
 * 按题材分七档反而找不着人。题材（`kind`）仍在，它服务的是「同一页几张岔开题材」，
 * 那是挑图的事，不必摆到台面上。
 *
 * 物件单独一档，是因为它们和照片的用法不一样：都是透明底抠图，**不进自动配图池**，
 * 只落在抠图位上。混进「其他」的话，上面那句「系统从『其他』里挑图」就不实了。
 */

/**
 * 透明底的棋盘格垫底。
 *
 * 抠图是透明底的，直接铺在卡片的白底上完全看不出边界——用户没法判断这一张是抠得干净
 * 还是带着一块白边。垫一层棋盘格是这件事的通用做法，一眼就能读出来。
 */
const CHECKER: React.CSSProperties = {
  backgroundColor: 'var(--surface-2)',
  backgroundImage:
    'linear-gradient(45deg, rgba(127,127,127,.18) 25%, transparent 25%, transparent 75%, rgba(127,127,127,.18) 75%),'
    + 'linear-gradient(45deg, rgba(127,127,127,.18) 25%, transparent 25%, transparent 75%, rgba(127,127,127,.18) 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 8px 8px',
};

type CategoryFilter = StockCategory | 'all';
type ToneFilter = 'all' | 'light' | 'dark';
type StockAction = 'trash' | 'restore' | 'purge';

const TONE_LABEL: Record<'light' | 'dark', string> = { light: '浅色', dark: '深色' };

/**
 * 把一次删除/恢复应用到本地清单上，与服务端那套标记同一套语义。
 *
 * 抽出来是因为乐观更新与回滚都要用它——两处各写一遍，迟早有一边漏掉
 * 「恢复时要真把 deletedAt 删掉，而不是设成 undefined」（后者会让 JSON 里
 * 多出一个 `"deletedAt": null`，而过滤判的是 `=== undefined`）。
 */
function applyLocally(
  list: StockPhoto[] | undefined,
  action: StockAction,
  file: string,
): StockPhoto[] | undefined {
  if (!list) return list;
  if (action === 'purge') return list.filter((p) => p.file !== file);
  return list.map((p) => {
    if (p.file !== file) return p;
    if (action === 'trash') return { ...p, deletedAt: Date.now() };
    const restored = { ...p };
    delete restored.deletedAt;
    return restored;
  });
}

/** 批量彻底删除。与单张那条同一套语义，只是一次摘掉一批 */
function purgeLocally(list: StockPhoto[] | undefined, files: string[]): StockPhoto[] | undefined {
  if (!list) return list;
  const gone = new Set(files);
  return list.filter((p) => !gone.has(p.file));
}

export function StockLibraryPage() {
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [tone, setTone] = useState<ToneFilter>('all');
  const [q, setQ] = useState('');
  const [preview, setPreview] = useState<StockPhoto | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [purging, setPurging] = useState<StockPhoto | null>(null);
  /**
   * 回收站里勾中的文件名。
   *
   * **只活在回收站这一个视图里**：切回图片库时清空，否则那些名字会留着，
   * 下次再进回收站会看到一批「莫名其妙被选中」的图。
   */
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  /**
   * 待确认批量删除的那批文件名，`null` 表示没在确认。
   *
   * **存快照而不是一个布尔。** 确认框里的张数、以及最终删的是哪几张，都要是「点按钮那一刻」
   * 看到的那批：只存 bool 的话，删成功后清空勾选会让标题在关闭动画里闪成「0 张」，
   * 而且真删什么取决于回调执行时 `selected` 是什么，读起来是两处真相。
   */
  const [pendingPurge, setPendingPurge] = useState<readonly string[] | null>(null);
  const toast = useToast();
  const qc = useQueryClient();
  const isAdmin = useSession((s) => s.user?.role === 'admin');

  /**
   * 清单走网络而不是编译进 bundle 的那份快照：素材能在后台被删到回收站，
   * 快照是构建时点，不重新拉就会一直显示已经删掉的图。
   */
  const manifest = useQuery({
    queryKey: ['stock-manifest'],
    queryFn: async () => {
      // no-store：删完要立刻看到新清单，走 HTTP 缓存会拿回刚被删掉的那一份
      const r = await fetch('/stock/manifest.json', { cache: 'no-store' });
      if (!r.ok) throw new Error('图片清单读取失败');
      return (await r.json()) as StockPhoto[];
    },
  });

  /**
   * 配图那边也用这份清单。
   *
   * **不能写在 `queryFn` 里顺手设**：乐观更新只改缓存、不走 queryFn，
   * 那样删完配图还在用旧清单——图从图片库消失了，新页面却照样挑到它。
   */
  useEffect(() => {
    if (manifest.data) setStockPhotos(manifest.data);
  }, [manifest.data]);

  const all = manifest.data ?? STOCK_PHOTOS;
  const live = all.filter((p) => p.deletedAt === undefined);
  const trashed = all.filter((p) => p.deletedAt !== undefined);
  const source = showTrash ? trashed : live;

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const hit = source.filter((p) => {
      if (category !== 'all' && stockCategoryOf(p) !== category) return false;
      if (tone !== 'all' && p.tone !== tone) return false;
      if (!needle) return true;
      // 标签是这批图真正的检索维度（「暗调」「留白」「仰视」），文件名只是顺带
      const hay = [p.file, p.author, STOCK_KIND_LABEL[p.kind], ...p.tags].join(' ').toLowerCase();
      return hay.includes(needle);
    });
    // 透明底抠图排在后面。排的是筛完的结果，所以「人物」这一档里也是先普通照片后抠图
    return sortStockPhotos(hit);
  }, [source, category, tone, q]);

  const filtered = category !== 'all' || tone !== 'all' || q.trim() !== '';

  /** 当前筛出来的都勾上了。空列表不算「全选」，否则一条都没有时按钮会写着「取消全选」 */
  const allSelected = items.length > 0 && items.every((p) => selected.has(p.file));

  /**
   * 三个写操作只差一个路径。
   *
   * **乐观更新，不等服务端回来再改界面。** 只靠 invalidate 重拉的话，网络往返期间
   * 那张图还挂在页面上；连删几张时几次 refetch 互相打断，表现就是「提示说删掉了、
   * 图还在，得刷新才看得到」。
   */
  const mutateStock = useMutation({
    mutationFn: ({ action, file }: { action: StockAction; file: string }) => {
      const path = `/admin/stock/${encodeURIComponent(file)}`;
      if (action === 'purge') return api.del(path);
      return api.post(`${path}/${action}`);
    },
    /**
     * **同步改缓存，不要 await。** 连点几张时，`await qc.cancelQueries()` 会让
     * 后面几次 onMutate 排在微任务里互相等，表现就是「删第二张没反应」。
     * 取消在飞的 refetch 是「顺手做」，不必等它回来才改界面。
     */
    onMutate: ({ action, file }) => {
      void qc.cancelQueries({ queryKey: ['stock-manifest'] });
      const previous = qc.getQueryData<StockPhoto[]>(['stock-manifest']);
      qc.setQueryData<StockPhoto[]>(['stock-manifest'], (old) => applyLocally(old, action, file));
      return { previous };
    },
    onError: (err: Error, { action }, ctx) => {
      if (ctx?.previous) qc.setQueryData(['stock-manifest'], ctx.previous);
      toast.error(
        action === 'trash' ? '移到回收站失败' : action === 'restore' ? '恢复失败' : '删除失败',
        err.message,
      );
    },
    onSuccess: (_r, { action }) => {
      if (action === 'trash') toast.success('已移到回收站', '已经用在项目里的页面不受影响');
      else if (action === 'restore') toast.success('已恢复');
      else toast.success('已彻底删除', '已经用到它的页面会显示不出来');
    },
    // 失败也重拉一次，把回滚后的状态与服务端对齐
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['stock-manifest'] }); },
  });

  /**
   * 一次彻底删掉一批。回收站的「全选 → 彻底删除」走这条。
   *
   * **不是把单张那条循环调一遍**：`useMutation` 的乐观更新是「取消查询 → 读快照 →
   * 改缓存」，连着 `mutate` 五十次就是五十次这样的往复，中间任何一次 refetch 插进来
   * 都会把前一次的改动盖掉——表现是「提示说删了五十张，界面还剩几张」。服务端那边
   * 也是同样的道理（见 `purgeStockPhotos`），所以两边都是一次一批。
   */
  const purgeMany = useMutation({
    mutationFn: (files: string[]) =>
      api.post<{ purged: string[]; missing: string[] }>('/admin/stock/purge', { files }),
    onMutate: (files) => {
      void qc.cancelQueries({ queryKey: ['stock-manifest'] });
      const previous = qc.getQueryData<StockPhoto[]>(['stock-manifest']);
      qc.setQueryData<StockPhoto[]>(['stock-manifest'], (old) => purgeLocally(old, files));
      return { previous };
    },
    onError: (err: Error, _files, ctx) => {
      if (ctx?.previous) qc.setQueryData(['stock-manifest'], ctx.previous);
      toast.error('批量彻底删除失败', err.message);
    },
    onSuccess: (r) => {
      setSelected(new Set());
      toast.success(
        `已彻底删除 ${r.purged.length} 张`,
        r.missing.length > 0
          ? `有 ${r.missing.length} 张没在图库里，没动它们`
          : '已经用到它们的页面会显示不出来',
      );
    },
    onSettled: () => { void qc.invalidateQueries({ queryKey: ['stock-manifest'] }); },
  });

  /**
   * 勾选 / 取消勾选一张。**就地改这一个文件名**，不重建整个 Set——
   * 一次几十张的时候重建是没必要的开销，而这里只有一次点击。
   */
  function toggleSelect(file: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(file)) next.add(file);
      return next;
    });
  }

  const selectedFiles = [...selected];

  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-6 px-8 py-8">
      <header className="flex flex-col gap-1.5">
        <div className="flex items-start gap-3">
          <div className="flex flex-col gap-1.5">
            <h1 className="text-[26px] font-semibold tracking-tight text-[var(--text-1)]">
              {showTrash ? '图片回收站' : '图片库'}
            </h1>
            <p className="max-w-[640px] text-[13px] leading-[1.7] text-[var(--text-3)]">
              {showTrash
                ? '这些图已经不用了：不在图片库里显示，也不会被新生成的项目挑中。已经用到它们的页面照常显示。'
                : '生成页面时，系统按当前风格的配色从「其他」里挑图。人物与物件都是透明底抠图，不参与自动配图——人物落在人物页的人像位，物件落在封面、章节页那些抠图位。'}
            </p>
          </div>
          {isAdmin && (
            <Button
              size="sm"
              pill
              icon={showTrash ? 'ArrowLeft' : 'Trash2'}
              className="ml-auto"
              onClick={() => {
                setShowTrash((v) => !v);
                setPreview(null);
                // 勾选只属于回收站这一个视图：留着的话，下次进来会看到一批「莫名其妙被选中」的图
                setSelected(new Set());
              }}
            >
              {showTrash ? '返回图片库' : `回收站${trashed.length > 0 ? ` ${trashed.length}` : ''}`}
            </Button>
          )}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[12px] text-[var(--text-3)]">共 {items.length} 张</span>
        <SegmentedControl
          size="sm"
          value={category}
          onChange={(v) => setCategory(v)}
          options={[
            { value: 'all' as const, label: '全部' },
            ...STOCK_CATEGORY_ORDER.map((c) => ({ value: c, label: STOCK_CATEGORY_LABEL[c] })),
          ]}
        />
        <SegmentedControl
          size="sm"
          value={tone}
          onChange={(v) => setTone(v)}
          options={[
            { value: 'all' as const, label: '不限明暗' },
            { value: 'light' as const, label: '浅色' },
            { value: 'dark' as const, label: '深色' },
          ]}
        />
        <div className="ml-auto w-[220px]">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜标签、题材或作者" aria-label="搜索图片" />
        </div>
      </div>

      {/*
        回收站的操作条。

        **「全选」选的是筛完剩下的那些**，不是回收站里全部——上面刚按分类或标签筛过一轮，
        这时点全选却把没显示的也删掉，是最容易出事的一种。文案里明写「当前筛选」就是为了这个。
      */}
      {showTrash && isAdmin && (
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[var(--surface-1)] px-4 py-2.5">
          <Button
            size="sm"
            pill
            variant="ghost"
            icon={allSelected ? 'SquareMinus' : 'SquareCheck'}
            disabled={items.length === 0}
            onClick={() => setSelected(allSelected ? new Set() : new Set(items.map((p) => p.file)))}
          >
            {allSelected ? '取消全选' : '全选当前筛选'}
          </Button>
          <span className="text-[12px] text-[var(--text-3)]">
            {selected.size > 0 ? `已选 ${selected.size} 张` : '勾选后可以一次清掉'}
          </span>
          <Button
            size="sm"
            pill
            variant="danger"
            icon="Trash2"
            className="ml-auto"
            disabled={selected.size === 0}
            onClick={() => setPendingPurge(selectedFiles)}
          >
            {selected.size > 0 ? `彻底删除 ${selected.size} 张` : '彻底删除'}
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon="Image"
            title="没有匹配的图片"
            description="换个标签或放宽筛选条件看看。"
            action={<button type="button" className="text-[13px] text-[var(--brand-600)] underline-offset-2 hover:underline" onClick={() => { setCategory('all'); setTone('all'); setQ(''); }}>清空筛选</button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((p) => (
            <StockCard
              key={p.file}
              photo={p}
              onOpen={() => setPreview(p)}
              admin={isAdmin}
              trashed={showTrash}
              selectable={showTrash && isAdmin}
              selected={selected.has(p.file)}
              onToggleSelect={() => toggleSelect(p.file)}
              onTrash={() => mutateStock.mutate({ action: 'trash', file: p.file })}
              onRestore={() => mutateStock.mutate({ action: 'restore', file: p.file })}
              onPurge={() => setPurging(p)}
            />
          ))}
        </div>
      )}

      <Dialog
        open={preview !== null}
        onOpenChange={(v) => { if (!v) setPreview(null); }}
        title={preview ? `${STOCK_CATEGORY_LABEL[stockCategoryOf(preview)]} · ${TONE_LABEL[preview.tone]}` : ''}
        description={preview ? preview.tags.join(' · ') : ''}
        width={960}
      >
        {preview && (
          <div className="flex flex-col gap-4">
            <div
              className="flex max-h-[560px] items-center justify-center overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-subtle)]"
              style={preview.transparent ? CHECKER : undefined}
            >
              <img
                src={stockUrl(preview)}
                alt={preview.tags.join('，')}
                className="max-h-[560px] w-full object-contain"
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] text-[var(--text-3)]">
              <span className="lumen-num">{preview.file}</span>
              <span>
                作者{' '}
                {preview.source
                  ? (
                    <a href={preview.source} target="_blank" rel="noreferrer" className="text-[var(--brand-600)] underline-offset-2 hover:underline">
                      {preview.author || '来源待补'}
                    </a>
                  )
                  : <span className="text-[var(--text-4)]">{preview.author || '来源待补'}</span>}
              </span>
              <span className="flex items-center gap-1.5">
                取样色板
                <span className="flex items-center gap-1">
                  {preview.palette.map((c) => (
                    <span key={c} title={c} className="h-3.5 w-3.5 rounded-full border border-[var(--border-subtle)]" style={{ background: c }} />
                  ))}
                </span>
              </span>
              {preview.source && (
                <a href={preview.source} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[var(--brand-600)] underline-offset-2 hover:underline">
                  查看原图出处
                  <Icon name="ExternalLink" size={16} />
                </a>
              )}
            </div>
          </div>
        )}
      </Dialog>

      {/*
        彻底删除是不可逆的，而且会让已经用到这张图的页面显示不出来——所以单独确认一次。
        移到回收站不用确认：那一步是可恢复的，弹窗只会拖慢清理废图。
      */}
      <ConfirmDialog
        open={purging !== null}
        onOpenChange={(v) => { if (!v) setPurging(null); }}
        title="彻底删除这张图？"
        description={purging
          ? `${purging.file} 会被永久删除，回收站里也找不回来。已经用到它的页面会显示不出来。`
          : ''}
        confirmText="彻底删除"
        danger
        onConfirm={() => {
          if (purging) mutateStock.mutate({ action: 'purge', file: purging.file });
          setPurging(null);
        }}
      />

      {/* 批量那条与单张同一条口径：不可逆，所以也单独确认一次 */}
      <ConfirmDialog
        open={pendingPurge !== null}
        onOpenChange={(v) => { if (!v) setPendingPurge(null); }}
        title={`彻底删除这 ${pendingPurge?.length ?? 0} 张图？`}
        description="它们会被永久删除，回收站里也找不回来。已经用到它们的页面会显示不出来。"
        confirmText={`彻底删除 ${pendingPurge?.length ?? 0} 张`}
        danger
        onConfirm={() => {
          if (pendingPurge) purgeMany.mutate([...pendingPurge]);
          setPendingPurge(null);
        }}
      />
    </div>
  );
}

function StockCard({
  photo, onOpen, admin, trashed, selectable, selected, onToggleSelect, onTrash, onRestore, onPurge,
}: {
  photo: StockPhoto;
  onOpen: () => void;
  admin: boolean;
  trashed: boolean;
  /** 只有回收站里能勾选——图片库那边没有「批量」这个动作 */
  selectable: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onTrash: () => void;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <Card className={cn('flex flex-col overflow-hidden', selected && 'ring-2 ring-[var(--brand-500)]')}>
      <div className="relative">
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full flex-col gap-3 p-3 text-left transition-colors duration-150 ease-out hover:bg-[var(--surface-1)]"
          aria-label={`查看图片 ${photo.file}`}
        >
          <div
            className="flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-[var(--radius-inner)] border border-[var(--border-subtle)]"
            style={photo.transparent ? CHECKER : undefined}
          >
            <img
              src={stockUrl(photo)}
              alt={photo.tags.join('，')}
              loading="lazy"
              // 抠图用 contain：cover 会把透明物体裁掉一圈，而它本来就不该铺满整格
              className={cn('h-full w-full', photo.transparent ? 'object-contain' : 'object-cover', trashed && 'opacity-50')}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Badge tone="brand">{STOCK_CATEGORY_LABEL[stockCategoryOf(photo)]}</Badge>
            <Badge tone="neutral">{TONE_LABEL[photo.tone]}</Badge>
            <span className="ml-auto flex items-center gap-1">
              {photo.palette.map((c) => (
                <span key={c} title={c} className="h-3 w-3 rounded-full border border-[var(--border-subtle)]" style={{ background: c }} />
              ))}
            </span>
          </div>
          <p className="text-[12px] leading-[1.6] text-[var(--text-3)]">{photo.tags.join(' · ')}</p>
          <p className="truncate text-[11px] text-[var(--text-4)]" title={photo.author || '来源待补'}>
            {photo.author || '来源待补'}
          </p>
        </button>

        {/*
          勾选按钮。

          **不是原生 checkbox。** 原生那个的勾是白色的，压在荧光绿上对比度只有 1.4:1——
          等于看不见。这里用一个圆形按钮：选中时荧光绿底 + 深色勾（`--brand-fg`，约 12:1），
          未选中时是半透明白底 + 描边，放在缩略图上哪种明暗的图都读得出来。
        */}
        {selectable && (
          <button
            type="button"
            onClick={onToggleSelect}
            aria-pressed={selected}
            aria-label={selected ? `取消选中 ${photo.file}` : `选中 ${photo.file}`}
            className={cn(
              'absolute left-4 top-4 flex h-7 w-7 items-center justify-center rounded-full border transition-colors duration-150 ease-out',
              selected
                ? 'border-[var(--brand-500)] bg-[var(--brand-500)] text-[var(--brand-fg)]'
                : 'border-[var(--border-subtle)] bg-[var(--surface-0)]/90 text-[var(--text-3)] backdrop-blur-sm hover:text-[var(--text-1)]',
            )}
          >
            {selected && <Icon name="Check" size={16} />}
          </button>
        )}

        {/* 只有管理员能改素材库——普通用户看得到图，但删不了 */}
        {admin && (
          <div className="absolute right-4 top-4 flex items-center gap-0.5 rounded-full border border-[var(--border-subtle)] bg-[var(--surface-0)]/90 px-0.5 py-0.5 backdrop-blur-sm">
            {trashed ? (
              <>
                <IconButton name="RotateCcw" label="恢复到图片库" onClick={onRestore} />
                <IconButton name="Trash2" label="彻底删除" onClick={onPurge} />
              </>
            ) : (
              <IconButton name="Trash2" label="移到回收站" onClick={onTrash} />
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
