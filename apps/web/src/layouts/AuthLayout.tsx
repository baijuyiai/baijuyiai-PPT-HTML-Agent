import type { ReactNode } from 'react';
import { BrandLockup } from '@lumen/ui';

/**
 * 登录/注册/改密共用的版式：左侧品牌陈述，右侧表单。
 *
 * 它不走 `AppShell`（那套要登录后才成立），所以**这里得自己套一遍浮动外壳**——
 * 不套的话，从登录页进到项目库会看到两种完全不同的版式，像是两个产品。
 * 骨架与 `ShellFrame` 一致：画布 → 大圆角面板 → 里面的圆角子面板。
 */
export function AuthLayout({
  title, description, children, footer,
}: { title: string; description: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="flex h-full bg-[var(--canvas)] p-4">
      <div className="mx-auto flex h-full w-full max-w-[1120px] overflow-hidden rounded-[var(--radius-shell)] border border-[var(--shell-border)] bg-[var(--shell-bg)] shadow-[var(--shadow-shell)]">
        {/*
          品牌墨色底 + 荧光绿点缀，**不是一整面荧光绿**。

          整面绿那条路试过了，两件事同时塌：字得压成近黑才读得出来，
          而方块 logo 是荧光绿的，铺在荧光绿上会整个化掉——只剩中间那团图案，
          方形就没了。墨色底两边都解决：白字与荧光绿都读得清，方块也立得起来。
          底色用 `--brand-fg`（压在品牌色上的那支墨），与荧光绿是同一族。
        */}
        <aside className="m-2 mr-0 hidden w-[46%] flex-col justify-between rounded-[var(--radius-panel)] bg-[var(--brand-fg)] p-12 text-white lg:flex">
          <BrandLockup size={36} tone="onBrand" />

          <div className="flex flex-col gap-6">
            <h1 className="max-w-[420px] text-[34px] font-semibold leading-[1.25] tracking-tight">
              从想法到成品，
              <br />
              一条链路走完。
            </h1>
            <ul className="flex flex-col gap-3.5 text-[14px] leading-[1.6] text-white/75">
              {[
                '风格可沉淀：从网页、图片或描述抽取统一设计语言',
                '逐页流式生成：已生成的页立刻可翻页、可编辑',
                '产出可多态：PDF、PPTX、微信分享链接、讲解视频',
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--brand-500)]" />
                  {line}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-[12px] text-white/45">面向高品质演示场景的生成、编辑与演示平台</p>
        </aside>

        <main className="flex flex-1 items-center justify-center p-8">
          <div className="w-full max-w-[380px]">
            <div className="mb-7 flex flex-col gap-2">
              <h2 className="text-[26px] font-semibold tracking-tight text-[var(--text-1)]">{title}</h2>
              <p className="text-[13px] leading-[1.6] text-[var(--text-3)]">{description}</p>
            </div>
            {children}
            {footer && <div className="mt-6 text-center text-[13px] text-[var(--text-3)]">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
