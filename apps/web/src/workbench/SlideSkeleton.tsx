/**
 * 骨架屏：与最终版式同构。
 * PRD §5.5 明确要求未生成页显示「与最终版式同构的骨架屏」，而不是通用占位块，
 * 这样用户在等待时就能预判页面结构。
 */
export function SlideSkeleton({
  scale, label, absolute = false,
}: { scale: number; label?: string; absolute?: boolean }) {
  const W = 1920;
  const H = 1080;
  const margin = Math.round(W * 0.05);
  const bar = (w: string, h: number, mt = 0) => ({
    width: w,
    height: h * scale,
    marginTop: mt * scale,
    borderRadius: 4 * scale,
    background: 'var(--surface-1)',
    animation: 'lumen-skeleton var(--motion-skeleton) ease-in-out infinite',
  });

  return (
    <div
      style={{
        width: W * scale,
        height: H * scale,
        padding: margin * scale,
        background: 'var(--surface-0)',
        display: 'flex',
        flexDirection: 'column',
        gap: 18 * scale,
        ...(absolute ? { position: 'absolute', inset: 0 } : {}),
      }}
      aria-hidden="true"
    >
      {/* 眉标 */}
      <div style={{ ...bar('90px', 6), marginTop: 0 }} />
      {/* 主标题两行 */}
      <div style={bar('72%', 40)} />
      <div style={bar('48%', 40)} />
      {/* 副标题 */}
      <div style={bar('56%', 20, 8)} />

      {/* 内容区：左文右图，与 imageText/left-right 同构 */}
      <div style={{ display: 'flex', gap: 48 * scale, flex: 1, marginTop: 20 * scale }}>
        <div style={{ flex: '0 0 54%', display: 'flex', flexDirection: 'column', gap: 14 * scale }}>
          <div style={bar('100%', 16)} />
          <div style={bar('92%', 16)} />
          <div style={bar('86%', 16)} />
          <div style={bar('64%', 16)} />
          <div style={{ display: 'flex', gap: 16 * scale, marginTop: 12 * scale }}>
            <div style={{ ...bar('33%', 72), marginTop: 0 }} />
            <div style={{ ...bar('33%', 72), marginTop: 0 }} />
            <div style={{ ...bar('33%', 72), marginTop: 0 }} />
          </div>
        </div>
        <div style={{ flex: '1 1 auto', ...bar('100%', 0), height: 'auto', minHeight: 120 * scale }} />
      </div>

      {/* 页脚 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 'auto' }}>
        <div style={{ ...bar('180px', 10), marginTop: 0 }} />
        <div style={{ ...bar('28px', 10), marginTop: 0 }} />
      </div>

      {label ? (
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: 14 * Math.max(scale, 0.4),
            color: 'var(--text-3)',
          }}
        >
          {label}
        </span>
      ) : null}
    </div>
  );
}
