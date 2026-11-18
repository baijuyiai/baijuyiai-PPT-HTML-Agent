import type { UiLayout } from './ui-layouts.js';

/**
 * 界面页的版式骨架。**这是生成文件，不要手改**。
 *
 * 由 `scripts/recognize-ui-layouts.ts --emit` 从参考图识别出来并写入：
 * 版面是模型照参考图认的，设备那一块是生成时注入的（`scripts/lib/ui-device.ts`）。
 * 改版面要改识别提示词再重跑，改设备要重跑渲染再 emit——**手改会在下一次被覆盖**。
 *
 * 每份骨架里嵌着**算出来的**三样东西：外壳转动图路径、屏幕四角的 `matrix3d`、
 * 悬停时的步进时序。手抄的话，改了取景或姿态角就会留下一份悄悄过期的副本——
 * 症状是「设备转了、屏幕没跟着转」，看着像 CSS 写错了。
 *
 * 约束（只用 CSS 变量取色、三个字体角色、**不许有别的 `<img>`**）见 `ui-layouts.ts` 顶部。
 * 共 37 份。
 */
export const UI_SKELETONS: UiLayout[] = [
  {
    id: "ui/copy-left-device-right@v1",
    name: "左文右机",
    group: "phone",
    scene: "iphone",
    brief: "左侧文案加底部大标题、右侧竖版手机直立于画面并顶到上下边，背后压着巨大品牌词与光晕，适合手机 App 界面展示页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);font-family:var(--font-sans)">
<style>
.stage{width:1920px;height:1080px;position:relative;background:var(--bg)}
.glow{position:absolute;border-radius:50%;filter:blur(20px)}
.glow-a{left:520px;top:120px;width:1100px;height:900px;background:radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--accent) 60%, transparent), transparent 68%);opacity:.22}
.glow-b{left:1180px;top:520px;width:780px;height:640px;background:radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--brand) 55%, transparent), transparent 70%);opacity:.16}
.blob{position:absolute;background:var(--accent);opacity:.14}
.blob-a{left:60px;top:660px;width:300px;height:150px;border-radius:50% 40% 55% 45%;transform:rotate(-12deg)}
.blob-b{left:1560px;top:120px;width:250px;height:130px;border-radius:45% 55% 40% 60%}
.bigword{position:absolute;left:70px;top:-58px;z-index:1;font-family:var(--font-display);font-size:240px;font-weight:900;letter-spacing:-.04em;line-height:.9;color:var(--text);opacity:.13;text-transform:uppercase;white-space:nowrap}
.copy{position:absolute;left:150px;top:648px;width:560px;z-index:6}
.kicker{margin:0 0 22px;font-size:14px;font-weight:500;letter-spacing:.42em;text-transform:uppercase;color:var(--muted)}
h1{margin:0 0 26px;font-family:var(--font-display);font-size:104px;font-weight:800;line-height:.94;letter-spacing:-.03em;color:var(--text);text-transform:lowercase}
.lede{margin:0;font-size:21px;font-weight:300;line-height:1.65;color:var(--muted);max-width:470px}
.rule{margin-top:40px;width:96px;height:8px;border-radius:999px;background:var(--accent);opacity:.5}
.chip{position:absolute;z-index:7;display:flex;align-items:center;gap:12px;padding:16px 30px;border-radius:999px;background:color-mix(in srgb, var(--surface) 62%, transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb, var(--border) 70%, transparent);font-size:15px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--text);white-space:nowrap}
.chip-a{left:640px;top:838px}
.chip-b{left:1516px;top:404px}
.dot{width:10px;height:10px;border-radius:50%;background:var(--accent);opacity:.9}
.dash{width:26px;height:4px;border-radius:999px;background:var(--accent);opacity:.75}
.fade{position:absolute;left:0;right:0;bottom:0;height:260px;z-index:8;background:linear-gradient(to bottom, transparent, var(--bg) 82%)}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-210.2px;top:-155.0px;width:900px;height:1200px;transform:scale(1.13127);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style>
<div class="glow glow-a"></div>
<div class="glow glow-b"></div>
<div class="blob blob-a"></div>
<div class="blob blob-b"></div>
<div class="bigword">Galmo</div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:820px;top:56px;width:600px;height:1060px;z-index:3"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="copy">
<p class="kicker">V2.4 / Team Sports</p>
<h1>team up!</h1>
<p class="lede">Create and manage teams with your friends, then lock in a court slot for the next game in seconds.</p>
<div class="rule"></div>
</div>
<div class="chip chip-a"><span class="dot"></span>Next game in 5 days</div>
<div class="chip chip-b"><span class="dash"></span>Volleyball · 20 mins</div>
<div class="fade"></div>
</div>`,
  },
  {
    id: "ui/text-left-devices-right@v1",
    name: "左文右机",
    group: "laptop",
    scene: "macbook",
    brief: "左侧竖排品牌、巨型标题、重点胶囊与四条勾选要点，右侧笔记本压着手机错落叠放，背后有巨字与光晕，适合产品 UI Kit / 设计系统发布页。",
    skeleton: `<div style="position:relative;width:1920px;height:1080px;background:var(--bg);overflow:hidden">
<style>
.rings{position:absolute;left:380px;top:-320px;width:1700px;height:1700px;border-radius:50%;background:repeating-radial-gradient(circle at 50% 50%,transparent 0 92px,color-mix(in srgb,var(--border) 42%,transparent) 92px 93px);opacity:.75;z-index:0}
.glow-a{position:absolute;left:620px;top:-180px;width:1300px;height:1000px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 60%,transparent),transparent 66%);opacity:.20;z-index:1}
.glow-b{position:absolute;left:1100px;top:520px;width:1100px;height:820px;background:radial-gradient(circle,color-mix(in srgb,var(--brand) 55%,transparent),transparent 68%);opacity:.14;z-index:1}
.mega{position:absolute;left:560px;top:330px;font-family:var(--font-display);font-size:240px;font-weight:900;line-height:1;letter-spacing:-.04em;color:var(--text);opacity:.10;white-space:nowrap;z-index:1}
.brand{position:absolute;left:110px;top:70px;display:flex;align-items:center;gap:12px;z-index:5}
.dot{width:14px;height:14px;border-radius:3px;background:var(--accent);transform:rotate(12deg)}
.brandname{font-size:36px;font-weight:800;letter-spacing:-.02em;color:var(--text)}
.kicker{position:absolute;left:114px;top:136px;font-size:17px;font-weight:500;letter-spacing:.38em;text-transform:uppercase;color:var(--muted);z-index:5}
.title{position:absolute;left:110px;top:182px;width:640px;margin:0;font-family:var(--font-display);font-size:110px;font-weight:800;line-height:.96;letter-spacing:-.03em;color:var(--text);z-index:5}
.pill{position:absolute;left:110px;top:462px;display:flex;align-items:baseline;gap:20px;padding:20px 48px 26px;border-radius:46px;background:var(--accent);color:var(--text);z-index:5}
.pill-num{font-size:84px;font-weight:900;line-height:1;letter-spacing:-.04em}
.pill-txt{font-size:40px;font-weight:500;letter-spacing:-.01em}
.list{position:absolute;left:110px;top:668px;width:760px;display:flex;flex-wrap:wrap;gap:30px 70px;z-index:5}
.li{display:flex;align-items:center;gap:16px;width:320px}
.tick{position:relative;flex:none;width:26px;height:26px;border-radius:8px;background:var(--accent)}
.tick::after{content:'';position:absolute;left:9px;top:5px;width:7px;height:12px;border-right:2px solid var(--text);border-bottom:2px solid var(--text);transform:rotate(40deg)}
.li-txt{font-size:23px;font-weight:500;letter-spacing:.01em;color:var(--text);opacity:.86}
.note{position:absolute;left:112px;top:846px;font-family:var(--font-script);font-size:27px;color:var(--muted);z-index:5}
.chip{display:flex;align-items:center;gap:14px;font-size:18px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--text);padding:16px 30px;border-radius:999px;background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);z-index:6}
.chip-dot{width:9px;height:9px;border-radius:50%;background:var(--accent)}
.chip-a{position:absolute;left:1408px;top:150px}
.chip-b{position:absolute;left:1240px;top:862px}
.dev-laptop{z-index:3}
.dev-phone{z-index:4}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-59.0px;top:-456.1px;width:900px;height:1200px;transform:scale(1.23274);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:1781px;height:1160px;border-radius:22px;transform-origin:0 0;transform:matrix3d(0.239938370715, 0, 0, 0, 0.00809028390427, 0.24721112368, 0, 0.0000179784086762, 0, 0, 1, 0, 236.334880878, 392.445244317, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(0.243588265607, -0.0189874180754, 0, 0.0000423329434676, 0.0428811627876, 0.250520632593, 0, 0.0000102890315318, 0, 0, 1, 0, 165.531703242, 444.86698085, 0, 1)}.ui-shell-1{position:absolute;left:156px;top:370px;width:595px;height:507px;background-image:url(/stock/devices/macbook-turn.webp);background-repeat:no-repeat;background-size:595px 4563px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -4056px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}*{pointer-events:none}.ui-dev-2,.ui-dev-2 *{pointer-events:auto}.ui-stage-2{position:absolute;left:-157.3px;top:-99.4px;width:900px;height:1200px;transform:scale(0.72572);transform-origin:top left}.ui-screen-2{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-2 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-2:hover .ui-screen-2{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-2{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-2:hover .ui-shell-2{background-position:0 -7496px}.ui-dev-2{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-2:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-2,.ui-screen-2,.ui-shell-2{transition:none}}</style>
<div class="rings"></div>
<div class="glow-a"></div>
<div class="glow-b"></div>
<div class="mega">ENEFTY</div>
<div class="brand"><span class="dot"></span><span class="brandname">Enefty</span></div>
<div class="kicker">V2.4 / UI KIT</div>
<h1 class="title">NFT Website UI Kit</h1>
<div class="pill"><span class="pill-num">30+</span><span class="pill-txt">Screens</span></div>
<div class="list">
<div class="li"><span class="tick"></span><span class="li-txt">Fully Customizable</span></div>
<div class="li"><span class="tick"></span><span class="li-txt">Styleguide Included</span></div>
<div class="li"><span class="tick"></span><span class="li-txt">Mobile Responsive</span></div>
<div class="li"><span class="tick"></span><span class="li-txt">Light Mode</span></div>
</div>
<div class="note">Every screen built on an 8pt grid</div>
<div class="chip chip-a"><span class="chip-dot"></span>Drag &amp; Drop Ready</div>
<div class="chip chip-b">Mobile Screens Included</div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:830px;top:265px;width:1000px;height:625px"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="ui-dev ui-dev-2" style="position:absolute;left:770px;top:290px;width:340px;height:680px"><div class="ui-stage ui-stage-2"><div class="ui-screen ui-screen-2"><img data-lumen-image="2"></div><div class="ui-shell ui-shell-2"></div></div></div></div>
</div>`,
  },
  {
    id: "ui/dual-phone-hero@v1",
    name: "双机横排大标题",
    group: "phone",
    scene: "iphone",
    brief: "顶部大标题配右侧行动区，中部深色横带上并排两台手机、背后压着巨大单词与光晕，底部收一句结尾标题，适合产品发布首屏。",
    skeleton: `<div style="position:relative;width:1920px;height:1080px;background:var(--bg);overflow:hidden">
<style>
.band{position:absolute;left:0;top:330px;width:1920px;height:470px;background:var(--text);z-index:1}
.bigword{position:absolute;left:250px;top:400px;font-family:var(--font-display);font-size:230px;font-weight:900;line-height:1;letter-spacing:-.04em;color:var(--bg);opacity:.13;white-space:nowrap;z-index:2}
.glow{position:absolute;z-index:2}
.g1{left:120px;top:230px;width:760px;height:760px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 60%,transparent),transparent 70%);opacity:.28}
.g2{left:1150px;top:300px;width:760px;height:760px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 55%,transparent),transparent 70%);opacity:.24}
.g3{left:900px;top:200px;width:560px;height:340px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 75%,transparent),transparent 66%);opacity:.32}
.glass{background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent)}
.logo{position:absolute;left:100px;top:46px;font-family:var(--font-display);font-size:28px;font-weight:800;letter-spacing:-.01em;color:var(--text);z-index:6}
.nav{position:absolute;left:790px;top:56px;display:flex;gap:58px;z-index:6}
.navlink{font-size:13px;font-weight:500;letter-spacing:.24em;text-transform:uppercase;color:var(--muted)}
.pill{position:absolute;right:100px;top:36px;padding:16px 30px;border-radius:999px;font-size:15px;font-weight:600;color:var(--text);z-index:6}
.title{position:absolute;left:180px;top:84px;width:1000px;margin:0;font-family:var(--font-display);font-size:100px;font-weight:800;line-height:.96;letter-spacing:-.035em;color:var(--text);z-index:6}
.kicker{position:absolute;left:1040px;top:148px;font-size:12px;font-weight:600;letter-spacing:.32em;text-transform:uppercase;color:var(--muted);z-index:6}
.lead{position:absolute;left:1040px;top:184px;width:340px;margin:0;font-size:18px;font-weight:400;line-height:1.6;color:var(--muted);z-index:6}
.cta{position:absolute;left:1040px;top:296px;width:300px;height:74px;border-radius:20px;background:var(--text);color:var(--bg);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:600;z-index:6}
.chipA{position:absolute;left:200px;top:672px;padding:14px 24px;border-radius:999px;font-size:15px;font-weight:500;color:var(--text);z-index:6}
.chipB{position:absolute;left:1210px;top:560px;padding:14px 24px;border-radius:999px;font-size:15px;font-weight:500;color:var(--text);z-index:6}
.end{position:absolute;left:180px;top:916px;margin:0;font-family:var(--font-display);font-size:54px;font-weight:800;line-height:1.05;letter-spacing:-.025em;color:var(--text);z-index:6}
.endsub{position:absolute;left:180px;top:1000px;margin:0;font-size:17px;font-weight:400;color:var(--muted);z-index:6}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-138.8px;top:-87.7px;width:900px;height:1200px;transform:scale(0.64034);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}*{pointer-events:none}.ui-dev-2,.ui-dev-2 *{pointer-events:auto}.ui-stage-2{position:absolute;left:-175.8px;top:-111.1px;width:900px;height:1200px;transform:scale(0.81110);transform-origin:top left}.ui-screen-2{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-2 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-2:hover .ui-screen-2{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-2{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-2:hover .ui-shell-2{background-position:0 -7496px}.ui-dev-2{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-2:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-2,.ui-screen-2,.ui-shell-2{transition:none}}</style>
<div class="glow g1"></div>
<div class="glow g2"></div>
<div class="glow g3"></div>
<div class="band"></div>
<div class="bigword">BITCOIN</div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:280px;top:300px;width:300px;height:600px;z-index:4"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="ui-dev ui-dev-2" style="position:absolute;left:1320px;top:300px;width:380px;height:760px;z-index:4"><div class="ui-stage ui-stage-2"><div class="ui-screen ui-screen-2"><img data-lumen-image="2"></div><div class="ui-shell ui-shell-2"></div></div></div></div>
<div class="logo">Gen+Z</div>
<div class="nav"><span class="navlink">About</span><span class="navlink">Pricing</span><span class="navlink">Features</span></div>
<div class="pill glass">Join now</div>
<h1 class="title">Build your<br/>Bitcoin savings.</h1>
<div class="kicker">V2.4 / Auto Invest</div>
<p class="lead">Link your bank account, deposit cash, and buy Bitcoin at the best times automatically.</p>
<div class="cta">Join the waitlist</div>
<div class="chipA glass">Available balance $14,230.00</div>
<div class="chipB glass">Instant transfer · 0 fees</div>
<h2 class="end">Start creating your portfolio today</h2>
<p class="endsub">Try out a few crypto currencies to find your perfect formula.</p>
</div>`,
  },
  {
    id: "ui/stacked-phones-hero@v1",
    name: "大字压屏三机",
    group: "phone",
    scene: "iphone",
    brief: "巨大标题压顶、三台手机错落居中排开，两侧浮着毛玻璃名片卡与胶囊标签，适合 App 展示页。",
    skeleton: `<div class="stage" style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);color:var(--text)">
<style>
.stage{font-family:var(--font-sans);background:var(--bg);color:var(--text);overflow:hidden}
.glow{position:absolute;border-radius:50%;filter:blur(70px);pointer-events:none}
.glow-a{left:520px;top:140px;width:1000px;height:1000px;background:radial-gradient(circle,var(--accent) 0%,transparent 70%);opacity:.20}
.glow-b{left:1170px;top:60px;width:900px;height:900px;background:radial-gradient(circle,var(--brand) 0%,transparent 70%);opacity:.18}
.glow-c{left:-140px;top:480px;width:820px;height:820px;background:radial-gradient(circle,var(--accent) 0%,transparent 70%);opacity:.12}
.arc{position:absolute;border-radius:50%;border:1px solid var(--border);opacity:.32}
.arc-a{left:-420px;top:120px;width:1600px;height:1600px}
.arc-b{left:1000px;top:-320px;width:1500px;height:1500px}
.ghost{position:absolute;left:110px;top:592px;margin:0;font-family:var(--font-display);font-size:230px;font-weight:900;letter-spacing:-.035em;line-height:1;color:var(--text);opacity:.10}
.title{position:absolute;left:56px;top:24px;margin:0;font-family:var(--font-display);font-size:196px;font-weight:900;letter-spacing:-.045em;line-height:.94;text-transform:uppercase;color:var(--text)}
.kicker{position:absolute;left:64px;top:238px;margin:0;font-size:16px;font-weight:500;letter-spacing:.44em;text-transform:uppercase;color:var(--muted)}
.lede{position:absolute;right:56px;top:138px;width:390px;margin:0;text-align:right;font-size:19px;font-weight:300;line-height:1.65;color:var(--muted)}
.chiprow{position:absolute;right:56px;top:66px;display:flex;gap:12px}
.glass{background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent)}
.chip{padding:12px 20px;border-radius:999px;font-size:13px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--text)}
.tag{padding:11px 18px;border-radius:999px;font-size:14px;font-weight:500;letter-spacing:.04em;color:var(--text);opacity:.9}
.card{position:absolute;padding:24px 26px;border-radius:26px;display:flex;flex-direction:column;gap:12px}
.avatar{width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--brand));opacity:.85}
.arrow{font-size:26px;line-height:1;font-weight:300;color:var(--text);opacity:.7}
.cardtitle{margin:0;font-size:27px;font-weight:800;letter-spacing:-.01em}
.mlabel{margin:0;font-size:12px;font-weight:400;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.mvalue{margin:0;font-size:17px;font-weight:500;color:var(--text);opacity:.9}
.qr{margin-left:auto;padding:9px 18px;border-radius:999px;background:color-mix(in srgb,var(--accent) 78%,transparent);border:1px solid color-mix(in srgb,var(--accent) 55%,transparent);color:var(--text);font-size:14px;font-weight:700;letter-spacing:.02em}
.fade{position:absolute;left:0;right:0;bottom:0;height:170px;background:linear-gradient(to top,var(--bg),transparent);pointer-events:none}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-138.8px;top:-87.7px;width:900px;height:1200px;transform:scale(0.64034);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}*{pointer-events:none}.ui-dev-2,.ui-dev-2 *{pointer-events:auto}.ui-stage-2{position:absolute;left:-166.6px;top:-105.3px;width:900px;height:1200px;transform:scale(0.76841);transform-origin:top left}.ui-screen-2{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-2 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-2:hover .ui-screen-2{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-2{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-2:hover .ui-shell-2{background-position:0 -7496px}.ui-dev-2{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-2:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-2,.ui-screen-2,.ui-shell-2{transition:none}}*{pointer-events:none}.ui-dev-3,.ui-dev-3 *{pointer-events:auto}.ui-stage-3{position:absolute;left:-185.1px;top:-117.0px;width:900px;height:1200px;transform:scale(0.85379);transform-origin:top left}.ui-screen-3{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-3 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-3:hover .ui-screen-3{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-3{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-3:hover .ui-shell-3{background-position:0 -7496px}.ui-dev-3{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-3:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-3,.ui-screen-3,.ui-shell-3{transition:none}}</style>
<div class="glow glow-a"></div>
<div class="glow glow-b"></div>
<div class="glow glow-c"></div>
<div class="arc arc-a"></div>
<div class="arc arc-b"></div>
<p class="ghost">CONTACTS</p>
<div class="ui-dev ui-dev-1" style="position:absolute;left:150px;top:460px;width:300px;height:600px"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="ui-dev ui-dev-2" style="position:absolute;left:790px;top:330px;width:360px;height:720px"><div class="ui-stage ui-stage-2"><div class="ui-screen ui-screen-2"><img data-lumen-image="2"></div><div class="ui-shell ui-shell-2"></div></div></div></div>
<div class="ui-dev ui-dev-3" style="position:absolute;left:1340px;top:220px;width:400px;height:800px"><div class="ui-stage ui-stage-3"><div class="ui-screen ui-screen-3"><img data-lumen-image="3"></div><div class="ui-shell ui-shell-3"></div></div></div></div>
<h1 class="title">Itsme App</h1>
<p class="kicker">V2.4 / Contact Platform</p>
<div class="chiprow"><span class="glass chip">30+ Screens</span><span class="glass chip">iOS &amp; Android</span><span class="glass chip">Dark Mode</span></div>
<p class="lede">Store every card you collect in one place, scan a new contact in a second, and keep the whole team in sync across devices.</p>
<div class="glass card" style="left:48px;top:300px;width:452px;height:196px">
<div style="display:flex;align-items:center;justify-content:space-between"><span class="avatar"></span><span class="arrow">↗</span></div>
<p class="cardtitle">BC for Buddies</p>
<div style="display:flex;align-items:flex-end;gap:24px"><div><p class="mlabel">Creation date</p><p class="mvalue">12.11.2022</p></div><div><p class="mlabel">Connections</p><p class="mvalue">56</p></div><span class="qr">QR Code</span></div>
</div>
<div class="glass card" style="left:1380px;top:840px;width:490px;height:196px">
<div style="display:flex;align-items:center;justify-content:space-between"><span class="avatar"></span><span class="arrow">↗</span></div>
<p class="cardtitle">BC for Emmy</p>
<div style="display:flex;align-items:flex-end;gap:24px"><div><p class="mlabel">Creation date</p><p class="mvalue">22.12.2022</p></div><div><p class="mlabel">Connections</p><p class="mvalue">1</p></div><span class="qr">QR Code</span></div>
</div>
<div style="position:absolute;left:496px;top:846px;display:flex;flex-direction:column;gap:12px">
<span class="glass tag">Fully Customizable</span>
<span class="glass tag">Offline Sync</span>
</div>
<div class="fade"></div>
</div>`,
  },
  {
    id: "ui/left-copy-right-phone@v1",
    name: "左文右机",
    group: "phone",
    scene: "iphone",
    brief: "左侧大标题与行动按钮、右侧一台竖屏手机压在巨型底字与光晕上，适合移动端产品首页展示。",
    skeleton: `<style>
.stage{position:relative;width:1920px;height:1080px;background:var(--bg);overflow:hidden;color:var(--text);font-family:var(--font-sans)}
.glow-a{position:absolute;left:780px;top:-200px;width:1150px;height:1150px;background:radial-gradient(circle,var(--accent) 0%,transparent 62%);opacity:.17;filter:blur(30px);z-index:0}
.glow-b{position:absolute;left:-280px;top:520px;width:920px;height:920px;background:radial-gradient(circle,var(--brand) 0%,transparent 66%);opacity:.14;filter:blur(30px);z-index:0}
.ghost{position:absolute;left:620px;top:150px;font-family:var(--font-display);font-size:210px;font-weight:900;line-height:.9;letter-spacing:-.04em;text-transform:uppercase;color:var(--text);opacity:.11;white-space:nowrap;z-index:1}
.dotgrid{position:absolute;right:128px;top:168px;width:220px;height:180px;background-image:radial-gradient(var(--muted) 1.8px,transparent 1.8px);background-size:24px 24px;opacity:.45;z-index:2}
.spark{position:absolute;left:898px;top:296px;width:44px;height:44px;background:var(--accent);clip-path:polygon(50% 0,58% 42%,100% 50%,58% 58%,50% 100%,42% 58%,0 50%,42% 42%);z-index:7}
.squiggle{position:absolute;right:118px;bottom:132px;width:150px;height:46px;background:repeating-linear-gradient(0deg,transparent 0 9px,var(--accent) 9px 11px);transform:rotate(-8deg);opacity:.65;z-index:6}
.nav{position:absolute;left:150px;right:150px;top:58px;display:flex;align-items:center;gap:54px;z-index:8}
.logo{display:flex;align-items:center;gap:14px;font-size:30px;font-weight:800;letter-spacing:-.02em}
.logo-mark{width:26px;height:26px;background:var(--accent);border-radius:50% 50% 50% 0;transform:rotate(-45deg)}
.navlist{display:flex;align-items:center;gap:44px;list-style:none;margin:0;padding:0;font-size:19px;font-weight:500;letter-spacing:.04em;opacity:.85}
.spacer{flex:1}
.appstore{display:flex;align-items:center;padding:12px 28px;border-radius:16px;background:color-mix(in srgb,var(--surface) 55%,transparent);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);backdrop-filter:blur(18px)}
.as-sm{display:block;font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.as-lg{display:block;font-size:22px;font-weight:700;letter-spacing:-.01em}
.signup{padding:18px 48px;border-radius:16px;font-size:21px;font-weight:700;color:var(--bg);background:color-mix(in srgb,var(--accent) 88%,transparent);backdrop-filter:blur(14px)}
.copy{position:absolute;left:150px;top:206px;width:820px;z-index:6}
.kicker{font-size:16px;font-weight:600;letter-spacing:.34em;text-transform:uppercase;color:var(--accent);margin-bottom:26px}
.headline{font-family:var(--font-display);font-size:112px;line-height:1;letter-spacing:-.03em;margin:0;font-weight:900}
.headline .lite{font-weight:300;opacity:.9}
.rule{width:300px;height:7px;border-radius:999px;background:var(--accent);margin:22px 0 32px}
.lede{width:600px;font-size:24px;font-weight:300;line-height:1.65;color:var(--muted);margin:0}
.cta{position:absolute;left:150px;top:762px;display:flex;align-items:center;gap:56px;z-index:8}
.btn{display:flex;align-items:center;justify-content:center;width:330px;height:92px;border-radius:18px;font-size:23px;font-weight:700;color:var(--bg);background:linear-gradient(120deg,color-mix(in srgb,var(--accent) 92%,transparent),color-mix(in srgb,var(--brand) 72%,transparent));backdrop-filter:blur(14px)}
.badge{width:150px;height:150px;border-radius:50%;border:1px dashed color-mix(in srgb,var(--accent) 70%,transparent);background:color-mix(in srgb,var(--surface) 40%,transparent);backdrop-filter:blur(16px);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px}
.badge span{font-size:13px;font-weight:700;letter-spacing:.22em;text-transform:uppercase}
.badge .dot{width:34px;height:34px;border-radius:50%;background:var(--accent);margin-top:4px}
.chev{position:absolute;left:1004px;top:700px;width:38px;height:38px;border-left:3px solid var(--text);border-bottom:3px solid var(--text);transform:rotate(45deg);opacity:.75;z-index:9}
.chip{position:absolute;padding:14px 26px;border-radius:999px;font-size:16px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;background:color-mix(in srgb,var(--surface) 62%,transparent);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);backdrop-filter:blur(18px);z-index:9}
.chip-a{left:924px;top:552px}
.chip-b{left:1566px;top:842px}
.band{position:absolute;left:0;right:0;bottom:0;height:210px;background:linear-gradient(to top,var(--bg) 34%,transparent);z-index:3}
.stats{position:absolute;left:150px;right:150px;bottom:56px;display:flex;align-items:center;gap:88px;z-index:7}
.clients{display:flex;align-items:center;gap:20px}
.avatars{display:flex}
.avatar{width:44px;height:44px;border-radius:50%;background:color-mix(in srgb,var(--muted) 45%,transparent);border:2px solid var(--border);margin-left:-14px}
.avatar.first{margin-left:0}
.ctxt .num{display:block;font-size:26px;font-weight:800;letter-spacing:-.02em}
.ctxt .lab{display:block;font-size:14px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted)}
.stat{display:flex;flex-direction:column;gap:8px}
.stathead{display:flex;align-items:center;gap:16px}
.ico{width:22px;height:22px;border-radius:5px;border:2px solid var(--accent)}
.stathead .num{font-size:38px;font-weight:800;letter-spacing:-.02em}
.stat .lab{font-size:14px;letter-spacing:.26em;text-transform:uppercase;color:var(--muted)}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-221.3px;top:-146.2px;width:900px;height:1200px;transform:scale(1.06724);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style>
<div class="stage">
<div class="glow-a"></div>
<div class="glow-b"></div>
<div class="ghost">Finance</div>
<div class="dotgrid"></div>
<div class="spark"></div>
<div class="band"></div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:1090px;top:70px;width:520px;height:1000px;z-index:4"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="nav">
<div class="logo"><span class="logo-mark"></span><span>Bank</span></div>
<ul class="navlist"><li>Explore</li><li>Support</li><li>Apply for card</li></ul>
<div class="spacer"></div>
<div class="appstore"><div><span class="as-sm">Available on the</span><span class="as-lg">App Store</span></div></div>
<div class="signup">Sign Up</div>
</div>
<div class="copy">
<div class="kicker">V2.4 / Mobile Banking</div>
<h1 class="headline"><span class="heavy">Best</span> <span class="lite">way to</span><br><span class="lite">manage</span> <span class="heavy">your</span><br><span class="heavy">finance</span></h1>
<div class="rule"></div>
<p class="lede">Track every card, bill and transfer in one place. Set a monthly budget and the app flags overspend before the statement lands.</p>
</div>
<div class="cta">
<div class="btn">Get Started</div>
<div class="badge"><span>Try it</span><span>for free</span><span class="dot"></span></div>
</div>
<div class="chev"></div>
<div class="chip chip-a">Instant alerts</div>
<div class="chip chip-b">Card controls</div>
<div class="squiggle"></div>
<div class="stats">
<div class="clients">
<div class="avatars"><span class="avatar first"></span><span class="avatar"></span><span class="avatar"></span><span class="avatar"></span></div>
<div class="ctxt"><span class="num">50k+ Client</span><span class="lab">all over the world</span></div>
</div>
<div class="stat"><div class="stathead"><span class="ico"></span><span class="num">95%</span></div><span class="lab">01 / Successful purchase</span></div>
<div class="stat"><div class="stathead"><span class="ico"></span><span class="num">100%</span></div><span class="lab">02 / Wallet 24 security</span></div>
</div>
</div>`,
  },
  {
    id: "ui/left-copy-right-phone-2@v1",
    name: "左文右机双栏",
    group: "phone",
    scene: "iphone",
    brief: "左侧浅色文案栏配大标题与数据，右侧深色面板里竖屏手机压在分栏线上，适合金融、SaaS 工具类产品首页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.glow{position:absolute;border-radius:50%;z-index:0;pointer-events:none}
.g1{left:-180px;top:-260px;width:1200px;height:1200px;background:radial-gradient(circle,var(--accent) 0%,transparent 68%);opacity:.14}
.g2{right:-240px;bottom:-300px;width:1300px;height:1300px;background:radial-gradient(circle,var(--brand) 0%,transparent 70%);opacity:.18}
.card{position:absolute;left:100px;top:60px;width:1720px;height:960px;border-radius:32px;background:var(--surface);overflow:hidden;box-shadow:0 50px 140px color-mix(in srgb,var(--text) 26%,transparent)}
.dark{position:absolute;left:920px;top:0;width:800px;height:960px;background:color-mix(in srgb,var(--text) 94%,transparent);z-index:1}
.halo{position:absolute;left:840px;top:70px;width:720px;height:860px;background:radial-gradient(ellipse at center,var(--accent) 0%,transparent 66%);opacity:.22;z-index:2}
.dots{position:absolute;left:1300px;top:180px;width:340px;height:340px;background-image:radial-gradient(circle,var(--accent) 0 26px,transparent 27px);background-size:106px 106px;opacity:.45;z-index:2}
.word{position:absolute;left:1250px;top:592px;font-family:var(--font-display);font-size:132px;font-weight:900;line-height:.9;letter-spacing:-.04em;color:var(--bg);opacity:.14;white-space:nowrap;z-index:2}
.band{position:absolute;left:920px;bottom:0;width:800px;height:118px;z-index:4;display:flex;align-items:flex-end;gap:26px;padding:0 60px 34px;background:linear-gradient(to top,color-mix(in srgb,var(--text) 96%,transparent) 40%,transparent);backdrop-filter:blur(14px)}
.bandtext{font-size:13px;font-weight:500;letter-spacing:.28em;text-transform:uppercase;color:var(--bg);opacity:.85}
.bandsep{width:60px;height:1px;background:color-mix(in srgb,var(--bg) 30%,transparent)}
.copy{position:absolute;left:110px;top:250px;width:720px;z-index:3}
.kicker{font-size:15px;font-weight:600;letter-spacing:.36em;text-transform:uppercase;color:var(--accent);margin:0 0 30px}
.h1{font-family:var(--font-display);font-size:92px;font-weight:800;line-height:1.02;letter-spacing:-.035em;color:var(--text);margin:0 0 36px}
.lede{font-size:20px;font-weight:300;line-height:1.65;color:var(--muted);width:520px;margin:0}
.stats{position:absolute;left:110px;top:790px;display:flex;align-items:center;gap:54px;z-index:3}
.stat{display:flex;flex-direction:column;gap:14px}
.ring{width:36px;height:36px;border-radius:50%;border:2px solid var(--accent);opacity:.85}
.num{font-size:52px;font-weight:800;letter-spacing:-.03em;line-height:1;color:var(--text)}
.cap{font-size:14px;font-weight:400;letter-spacing:.22em;text-transform:uppercase;color:var(--muted)}
.divider{width:1px;height:110px;background:color-mix(in srgb,var(--text) 16%,transparent)}
.brand{position:absolute;left:110px;top:88px;display:flex;align-items:center;gap:12px;z-index:4}
.bmark{display:flex;align-items:flex-end;gap:4px}
.bd{width:11px;height:11px;border-radius:50%;background:var(--accent)}
.bd.s{width:8px;height:8px;opacity:.72}
.bd.l{width:14px;height:14px}
.bname{font-size:26px;font-weight:700;letter-spacing:-.01em;color:var(--text)}
.nav{position:absolute;left:1150px;top:74px;display:flex;gap:12px;z-index:6}
.chip{padding:12px 22px;border-radius:999px;font-size:13px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:var(--bg);background:color-mix(in srgb,var(--text) 52%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--bg) 18%,transparent)}
.tag{position:absolute;left:1330px;top:300px;display:flex;align-items:center;gap:12px;padding:14px 24px;border-radius:999px;z-index:6;background:color-mix(in srgb,var(--text) 48%,transparent);backdrop-filter:blur(20px);border:1px solid color-mix(in srgb,var(--bg) 20%,transparent)}
.dotm{width:9px;height:9px;border-radius:50%;background:var(--accent)}
.tagtext{font-size:13px;font-weight:500;letter-spacing:.2em;text-transform:uppercase;color:var(--bg)}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-166.6px;top:-105.3px;width:900px;height:1200px;transform:scale(0.76841);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style>
<div class="glow g1"></div>
<div class="glow g2"></div>
<div class="card">
<div class="dark"></div>
<div class="halo"></div>
<div class="dots"></div>
<div class="word">FINANCE</div>
<div class="band"><span class="bandtext">30+ screens</span><span class="bandsep"></span><span class="bandtext">iOS · Android · Web</span></div>
<div class="copy">
<p class="kicker">Nanou / Mobile Banking</p>
<h1 class="h1">Manage your business finances easily</h1>
<p class="lede">Track balances, move money and reconcile invoices without leaving the dashboard — built for founders who outgrew their spreadsheet.</p>
</div>
<div class="stats">
<div class="stat"><div class="ring"></div><div class="num">6.2k</div><div class="cap">Active accounts</div></div>
<div class="divider"></div>
<div class="stat"><div class="ring"></div><div class="num">567</div><div class="cap">Transfers a day</div></div>
</div>
<div class="brand"><div class="bmark"><span class="bd l"></span><span class="bd"></span><span class="bd s"></span></div><div class="bname">Nanou</div></div>
<div class="nav"><span class="chip">About</span><span class="chip">Services</span><span class="chip">Reviews</span><span class="chip">Contacts</span></div>
<div class="tag"><span class="dotm"></span><span class="tagtext">Live balance · $23.45</span></div>
</div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:1030px;top:210px;width:360px;height:720px;z-index:5"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
</div>`,
  },
  {
    id: "ui/floating-glass-panels@v1",
    name: "居中浮板右文",
    group: "display",
    scene: "display",
    brief: "画面中央一大叠悬浮玻璃面板错落堆在一起，右侧一栏标题与说明；适合展示 Dashboard / 数据仪表盘界面套件。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden"><style>.wall{position:absolute;inset:0;background-image:repeating-linear-gradient(90deg,color-mix(in srgb,var(--text) 5%,transparent) 0 46px,transparent 46px 158px);opacity:.5;z-index:0}.glow{position:absolute;border-radius:50%;z-index:0}.glow-a{left:60px;top:-180px;width:960px;height:960px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 70%,transparent) 0%,transparent 68%);opacity:.22}.glow-b{left:960px;top:320px;width:880px;height:880px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 60%,transparent) 0%,transparent 70%);opacity:.15}.glow-c{left:1360px;top:-220px;width:780px;height:780px;background:radial-gradient(circle,color-mix(in srgb,var(--brand) 65%,transparent) 0%,transparent 70%);opacity:.18}.bigword{position:absolute;left:40px;top:40px;font-family:var(--font-display);font-size:232px;font-weight:900;line-height:.9;letter-spacing:-.04em;text-transform:uppercase;color:var(--text);opacity:.11;z-index:1;white-space:nowrap}.pill{background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border-radius:999px;border:1px solid color-mix(in srgb,var(--border) 70%,transparent)}.panel{background:color-mix(in srgb,var(--surface) 58%,transparent);backdrop-filter:blur(22px);border:1px solid color-mix(in srgb,var(--border) 68%,transparent)}.tag{font-size:15px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-74.7px;top:-440.4px;width:900px;height:1200px;transform:scale(1.34686);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:3533px;height:1988px;border-radius:16px;transform-origin:0 0;transform:matrix3d(0.194674468736, 0, 0, 0, 0.00722258029417, 0.20084118139, 0, 0.0000160501784315, 0, 0, 1, 0, 106.107550977, 351.711547735, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(0.202346986126, 0.00644592133635, 0, 0.0000377974793072, 0.0129337680086, 0.208936346938, 0, 0.00000812980323644, 0, 0, 1, 0, 127.608952389, 358.530188991, 0, 1)}.ui-shell-1{position:absolute;left:97px;top:327px;width:704px;height:542px;background-image:url(/stock/devices/display-turn.webp);background-repeat:no-repeat;background-size:704px 4878px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -4336px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style><div class="wall"></div><div class="glow glow-a"></div><div class="glow glow-b"></div><div class="glow glow-c"></div><div class="bigword">Overview</div><div class="ui-dev ui-dev-1" style="position:absolute;left:300px;top:175px;width:1060px;height:730px;z-index:4"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div><div class="pill" style="position:absolute;left:640px;top:62px;width:770px;height:78px;z-index:6;display:flex;align-items:center;gap:16px;padding:0 14px 0 28px;box-sizing:border-box"><span style="width:12px;height:12px;background:var(--accent);border-radius:3px"></span><span style="font-size:16px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted)">Search dashboards</span><span style="flex:1"></span><span style="font-size:15px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)">Overview</span><span style="font-size:15px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)">Reports</span><span style="font-size:15px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--bg);background:var(--accent);border-radius:999px;padding:14px 26px">Create</span></div><div class="panel" style="position:absolute;left:1150px;top:652px;width:312px;height:200px;z-index:6;border-radius:26px;padding:26px;box-sizing:border-box"><p style="margin:0;font-size:14px;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)">Season 24</p><p style="margin:16px 0 0;font-family:var(--font-display);font-size:56px;font-weight:800;line-height:1;letter-spacing:-.02em;color:var(--text)">2.4k</p><p style="margin:12px 0 0;font-size:16px;line-height:1.5;color:var(--muted)">Active workspaces this week</p></div><div style="position:absolute;left:1470px;top:208px;width:380px;z-index:6"><p class="tag" style="margin:0">V2.4 / Float UI</p><h1 style="margin:28px 0 0;font-family:var(--font-display);font-size:112px;font-weight:900;line-height:.9;letter-spacing:-.035em;text-transform:uppercase;color:var(--text)">Glass<br>Panels</h1><p style="margin:30px 0 0;font-size:19px;line-height:1.7;color:var(--muted);font-weight:300">Drag any card to reposition it, and the grid re-balances every panel around it in real time.</p><ul style="margin:34px 0 0;padding:0;list-style:none"><li style="display:flex;align-items:center;gap:14px;margin-bottom:16px;font-size:17px;color:var(--text)"><span style="width:10px;height:10px;background:var(--accent);border-radius:2px"></span>Fully customizable</li><li style="display:flex;align-items:center;gap:14px;margin-bottom:16px;font-size:17px;color:var(--text)"><span style="width:10px;height:10px;background:var(--accent);border-radius:2px"></span>Dark mode ready</li><li style="display:flex;align-items:center;gap:14px;font-size:17px;color:var(--text)"><span style="width:10px;height:10px;background:var(--accent);border-radius:2px"></span>Auto layout grid</li></ul><p style="margin:30px 0 0;font-family:var(--font-script);font-size:27px;color:var(--muted)">built for product teams</p></div><div style="position:absolute;left:0;bottom:0;width:1920px;height:140px;z-index:7;background:linear-gradient(to top,color-mix(in srgb,var(--bg) 96%,transparent) 44%,transparent);backdrop-filter:blur(16px);display:flex;align-items:center;gap:60px;padding:0 88px;box-sizing:border-box"><span class="tag">30+ floating panels</span><span class="tag">Live data binding</span><span class="tag">Keyboard first</span><span style="flex:1"></span><span style="font-size:15px;letter-spacing:.34em;text-transform:uppercase;color:var(--text)">Float UI Kit</span></div></div>`,
  },
  {
    id: "ui/text-left-phone-right@v1",
    name: "左文右机",
    group: "phone",
    scene: "iphone",
    brief: "左侧竖排标题与四条功能说明，右侧一台大屏手机压住底部巨型词标，适合首页/UI 走查页。",
    skeleton: `<div style="position:relative;width:1920px;height:1080px;background:var(--bg);overflow:hidden">
<style>
.glow{position:absolute;border-radius:50%;pointer-events:none}
.bigword{position:absolute;left:-46px;bottom:-84px;font-family:var(--font-display);font-size:300px;font-weight:900;letter-spacing:-.04em;line-height:.86;color:var(--text);opacity:.08;z-index:1;text-transform:uppercase}
.eyebrow{position:absolute;font-size:16px;font-weight:600;letter-spacing:.36em;text-transform:uppercase;color:var(--muted);z-index:5}
.rule{position:absolute;width:6px;height:64px;background:var(--accent);border-radius:3px;z-index:5}
.h1{position:absolute;font-family:var(--font-display);font-size:118px;font-weight:900;letter-spacing:-.03em;line-height:.94;color:var(--text);text-transform:uppercase;z-index:5}
.script{position:absolute;font-family:var(--font-script);font-size:40px;font-weight:400;color:var(--accent);z-index:5}
.stack{position:absolute;left:110px;top:302px;width:700px;z-index:5}
.item{position:relative;padding-left:42px;margin-bottom:30px}
.mark{position:absolute;left:0;top:7px;width:16px;height:16px;background:var(--accent);border-radius:3px;transform:rotate(45deg);opacity:.9}
.item h3{font-size:23px;font-weight:800;letter-spacing:.01em;color:var(--text);margin:0 0 7px 0;line-height:1.2}
.item p{font-size:17px;font-weight:300;line-height:1.6;color:var(--muted);margin:0;max-width:600px}
.cards{position:absolute;left:110px;top:868px;display:flex;gap:16px;z-index:5}
.card{position:relative;width:200px;height:150px;padding:18px;box-sizing:border-box;border-radius:22px;background:color-mix(in srgb,var(--surface) 58%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);overflow:hidden}
.cardMark{display:block;width:34px;height:34px;border-radius:11px;background:var(--accent);opacity:.85;margin-bottom:14px}
.card h3{font-size:17px;font-weight:700;color:var(--text);margin:0 0 6px 0;line-height:1.2}
.card p{font-size:13px;font-weight:300;line-height:1.5;color:var(--muted);margin:0}
.chip{position:absolute;display:flex;align-items:center;gap:12px;padding:15px 24px;border-radius:999px;background:color-mix(in srgb,var(--surface) 58%,transparent);backdrop-filter:blur(20px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);font-size:15px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--text);z-index:6}
.pdot{display:block;width:7px;height:7px;border-radius:50%;background:var(--muted);opacity:.75}
.hair{display:block;width:34px;height:1px;background:var(--border)}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-231.3px;top:-146.2px;width:900px;height:1200px;transform:scale(1.06724);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style>
<div class="glow" style="left:820px;top:-180px;width:1180px;height:1180px;background:radial-gradient(circle,var(--accent) 0%,transparent 68%);opacity:.20;z-index:0"></div>
<div class="glow" style="left:1260px;top:280px;width:900px;height:900px;background:radial-gradient(circle,var(--brand) 0%,transparent 70%);opacity:.18;z-index:0"></div>
<div class="glow" style="left:-240px;top:560px;width:880px;height:880px;background:radial-gradient(circle,var(--accent) 0%,transparent 70%);opacity:.12;z-index:0"></div>
<div class="bigword">Chaos</div>
<div class="rule" style="left:110px;top:56px;height:52px"></div>
<div class="eyebrow" style="left:140px;top:52px">Interface Display / Case 04</div>
<div class="eyebrow" style="left:140px;top:82px;letter-spacing:.22em;opacity:.7">30+ screens · light &amp; dark</div>
<h1 class="h1" style="left:110px;top:130px">Home<br>Page</h1>
<div class="script" style="left:120px;top:392px">home page</div>
<div class="chip" style="left:1490px;top:52px;padding:14px 26px">
<span class="pdot"></span><span class="pdot"></span><span class="pdot"></span>
<span class="hair"></span>
<span>UI / UX</span>
</div>
<div class="stack">
<div class="item">
<span class="mark"></span>
<h3>Sticky Navigation Bar</h3>
<p>Full-width nav keeps the search field and category tabs one thumb-tap away on every scroll position.</p>
</div>
<div class="item">
<span class="mark"></span>
<h3>Auto-Playing Banner</h3>
<p>Campaign slides rotate every four seconds and pause on touch, so the newest drop is always on top.</p>
</div>
<div class="item">
<span class="mark"></span>
<h3>Tile Grid</h3>
<p>Three tappable tiles push seasonal events, lottery draws and member perks to the first screenful.</p>
</div>
<div class="item">
<span class="mark"></span>
<h3>Flash Sale Rail</h3>
<p>Countdown plus quick-add shortlist restocks items every hour and keeps returning users curious.</p>
</div>
</div>
<div class="cards">
<div class="card"><span class="cardMark"></span><h3>Flash Deals</h3><p>Limited stock, refreshed hourly</p></div>
<div class="card"><span class="cardMark"></span><h3>Lucky Draw</h3><p>Claim a box with every order</p></div>
<div class="card"><span class="cardMark"></span><h3>Member Zone</h3><p>Points, tiers and early access</p></div>
</div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:1240px;top:30px;width:500px;height:1000px;z-index:4"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="chip" style="left:1150px;top:452px;padding:14px 22px;font-size:14px">Tap to preview</div>
<div class="chip" style="left:1178px;top:912px;width:560px;height:74px;box-sizing:border-box;border-radius:28px;justify-content:space-between;font-size:14px">
<span>New arrivals · Series 03</span>
<span class="hair"></span>
<span style="opacity:.7">12 screens</span>
</div>
</div>`,
  },
  {
    id: "ui/dual-phone-hero-type@v1",
    name: "双机居中大字",
    group: "phone",
    scene: "iphone",
    brief: "两台手机错落叠放压住背景巨字，四角毛玻璃胶囊与页脚小字围合，适合 Web3 / 产品概念首屏展示",
    skeleton: `<div style="position:relative;width:1920px;height:1080px;overflow:hidden;background:var(--bg);color:var(--text)">
<style>
.glow{position:absolute;border-radius:50%;pointer-events:none}
.glow-a{left:520px;top:-260px;width:1240px;height:1240px;background:radial-gradient(circle,var(--accent),transparent 68%);opacity:.20;z-index:0;filter:blur(30px)}
.glow-b{left:980px;top:420px;width:900px;height:900px;background:radial-gradient(circle,var(--brand),transparent 70%);opacity:.14;z-index:0;filter:blur(40px)}
.glow-c{left:-180px;top:600px;width:760px;height:760px;background:radial-gradient(circle,var(--accent),transparent 72%);opacity:.12;z-index:0;filter:blur(36px)}
.big{position:absolute;font-family:var(--font-display);font-weight:900;text-transform:uppercase;white-space:nowrap;line-height:.9;letter-spacing:-.035em;color:var(--text);pointer-events:none;z-index:1}
.big-a{left:110px;top:110px;font-size:300px;opacity:.15}
.big-b{left:-40px;top:556px;font-size:290px;opacity:.09}
.slot-back{left:588px;top:196px;width:430px;height:870px;z-index:2}
.slot-front{left:800px;top:66px;width:400px;height:810px;z-index:3}
.pill{display:flex;align-items:center;justify-content:center;height:58px;padding:0 28px;border-radius:999px;background:color-mix(in srgb,var(--surface) 55%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 65%,transparent);font-size:16px;font-weight:400;letter-spacing:.3em;text-transform:uppercase;color:var(--text)}
.pill-sm{height:48px;padding:0 22px;font-size:14px;letter-spacing:.26em}
.topbar-left{position:absolute;left:70px;top:60px;z-index:6}
.topbar-right{position:absolute;right:70px;top:60px;display:flex;gap:14px;z-index:6}
.tag{position:absolute;left:1352px;top:742px;display:flex;align-items:center;gap:14px;padding:18px 26px;border-radius:20px;background:color-mix(in srgb,var(--surface) 50%,transparent);backdrop-filter:blur(20px);border:1px solid color-mix(in srgb,var(--border) 60%,transparent);z-index:6}
.tag-dot{width:12px;height:12px;border-radius:3px;background:var(--accent)}
.tag-t{font-size:15px;letter-spacing:.28em;text-transform:uppercase;color:var(--text)}
.tag-s{margin-top:6px;font-size:14px;font-weight:300;letter-spacing:.02em;color:var(--muted)}
.band{position:absolute;left:0;bottom:0;width:1920px;height:240px;background:linear-gradient(to top,var(--bg),transparent);z-index:4;pointer-events:none}
.foot-l{position:absolute;left:70px;bottom:54px;z-index:6}
.foot-l .l1{font-size:27px;font-weight:500;letter-spacing:-.01em}
.foot-l .l2{font-family:var(--font-script);font-size:36px;opacity:.75;margin-top:2px}
.foot-r{position:absolute;right:70px;bottom:58px;display:flex;gap:52px;font-size:18px;font-weight:300;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);z-index:6}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-203.8px;top:-127.2px;width:900px;height:1200px;transform:scale(0.92850);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}*{pointer-events:none}.ui-dev-2,.ui-dev-2 *{pointer-events:auto}.ui-stage-2{position:absolute;left:-189.9px;top:-118.4px;width:900px;height:1200px;transform:scale(0.86446);transform-origin:top left}.ui-screen-2{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-2 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-2:hover .ui-screen-2{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-2{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-2:hover .ui-shell-2{background-position:0 -7496px}.ui-dev-2{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-2:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-2,.ui-screen-2,.ui-shell-2{transition:none}}</style>
<div class="glow glow-a"></div>
<div class="glow glow-b"></div>
<div class="glow glow-c"></div>
<div class="big big-a">WEB 3.0</div>
<div class="big big-b">INTERNET</div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:588px;top:196px;width:430px;height:870px;z-index:2"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="ui-dev ui-dev-2" style="position:absolute;left:800px;top:66px;width:400px;height:810px;z-index:3"><div class="ui-stage ui-stage-2"><div class="ui-screen ui-screen-2"><img data-lumen-image="2"></div><div class="ui-shell ui-shell-2"></div></div></div></div>
<div class="band"></div>
<div class="topbar-left"><div class="pill pill-sm">2023</div></div>
<div class="topbar-right"><div class="pill pill-sm">WEB 3.0</div><div class="pill pill-sm">WEBSITE</div><div class="pill pill-sm">CONCEPT</div></div>
<div class="tag"><div class="tag-dot"></div><div><div class="tag-t">Smart Living</div><div class="tag-s">Drag a module onto the canvas and it snaps to the grid</div></div></div>
<div class="foot-l"><div class="l1">Ai &amp; Blockchain</div><div class="l2">Platform Concept</div></div>
<div class="foot-r"><span>13 /</span><span>93</span></div>
</div>`,
  },
  {
    id: "ui/left-copy-right-phone-3@v1",
    name: "左文右机压字",
    group: "phone",
    scene: "iphone",
    brief: "深色圆角大面板铺满下半屏，左下放大标题与说明，右侧一台手机压住背后的巨型词标与光晕，适合讲单个 App 的主界面。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden">
<style>
.glow{position:absolute;pointer-events:none;z-index:0}
.panel{position:absolute;left:40px;top:298px;width:1840px;height:742px;border-radius:52px;background:color-mix(in srgb,var(--surface) 92%,transparent);border:1px solid color-mix(in srgb,var(--border) 55%,transparent);z-index:1}
.ghost{position:absolute;left:730px;top:390px;font-family:var(--font-display);font-size:214px;font-weight:900;letter-spacing:-.04em;line-height:.9;text-transform:uppercase;white-space:nowrap;color:var(--text);opacity:.13;z-index:2}
.fade{position:absolute;left:40px;top:830px;width:1840px;height:210px;border-radius:0 0 52px 52px;background:linear-gradient(to bottom,transparent,color-mix(in srgb,var(--surface) 80%,transparent));z-index:3}
.mark{position:absolute;left:112px;top:392px;display:flex;gap:9px;align-items:flex-end;z-index:4}
.mark span{display:block;width:7px;border-radius:4px;background:var(--text);opacity:.88}
.nav{position:absolute;left:112px;top:104px;display:flex;gap:10px;z-index:7}
.nav div{padding:13px 28px;border-radius:999px;font-size:13px;font-weight:500;letter-spacing:.24em;text-transform:uppercase;color:var(--text);background:color-mix(in srgb,var(--surface) 58%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent)}
.chip{position:absolute;left:1000px;top:688px;display:flex;align-items:center;gap:12px;padding:15px 28px;border-radius:999px;color:var(--text);background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);z-index:6}
.chip span.dot{display:block;width:10px;height:10px;border-radius:50%;background:var(--accent)}
.chip span.tx{font-size:14px;font-weight:500;letter-spacing:.2em;text-transform:uppercase}
.kicker{position:absolute;left:112px;top:636px;font-size:15px;font-weight:500;letter-spacing:.38em;text-transform:uppercase;color:var(--muted);z-index:7}
h1{position:absolute;left:106px;top:664px;margin:0;font-size:128px;font-weight:300;letter-spacing:-.03em;line-height:1;color:var(--text);z-index:7}
.lede{position:absolute;left:112px;top:854px;width:660px;margin:0;font-size:20px;font-weight:400;line-height:1.65;color:var(--muted);z-index:7}
.meta{position:absolute;left:112px;top:1000px;font-size:13px;font-weight:500;letter-spacing:.3em;text-transform:uppercase;color:var(--muted);opacity:.75;z-index:7}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-240.6px;top:-152.1px;width:900px;height:1200px;transform:scale(1.10993);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style>
<div class="glow" style="left:880px;top:-180px;width:1240px;height:1240px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 55%,transparent),transparent 68%);opacity:.22"></div>
<div class="glow" style="left:-220px;top:500px;width:920px;height:920px;background:radial-gradient(circle,color-mix(in srgb,var(--brand) 50%,transparent),transparent 70%);opacity:.16"></div>
<div class="panel"></div>
<div class="ghost">Spending</div>
<div class="fade"></div>
<div class="mark"><span style="height:56px"></span><span style="height:28px"></span><span style="height:42px"></span></div>
<div class="nav"><div>Overview</div><div>Categories</div><div>Reports</div></div>
<div class="chip"><span class="dot"></span><span class="tx">Category view</span></div>
<div class="kicker">01 / Dashboard</div>
<h1>Main screen</h1>
<p class="lede">Expenses and income are split by category and colour, with a scale that shows each amount relative to the others, so the numbers read at a glance.</p>
<div class="meta">V2.4 / Personal finance</div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:1220px;top:20px;width:520px;height:1040px;z-index:5"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
</div>`,
  },
  {
    id: "ui/center-laptop-hero@v1",
    name: "居中笔电巨字",
    group: "laptop",
    scene: "macbook",
    brief: "笔记本正面居中压在超大品牌字与光晕上，四角毛玻璃导航与底部渐隐说明带收边，适合主打一个产品界面截图的发布页。",
    skeleton: `<div style="position:relative;width:1920px;height:1080px;background:var(--bg);overflow:hidden">
<style>
.glow{position:absolute;border-radius:50%;pointer-events:none;z-index:0}
.glow-a{left:280px;top:40px;width:1360px;height:960px;background:radial-gradient(circle at 50% 45%,var(--accent),transparent 66%);opacity:.22;filter:blur(30px)}
.glow-b{left:1140px;top:540px;width:820px;height:560px;background:radial-gradient(circle at 50% 50%,var(--brand),transparent 70%);opacity:.18;filter:blur(50px)}
.bigword{position:absolute;left:0;top:324px;width:1920px;text-align:center;font-family:var(--font-display);font-size:240px;font-weight:900;letter-spacing:-.04em;line-height:.92;text-transform:uppercase;color:var(--text);opacity:.12;z-index:1}
.brand{position:absolute;left:88px;top:70px;display:flex;align-items:center;gap:20px;z-index:6}
.mark{position:relative;width:46px;height:46px;border-radius:50%;border:2px solid var(--text);opacity:.85}
.mark span{position:absolute;left:10px;top:10px;width:22px;height:22px;border-radius:50%;border:2px solid var(--accent)}
.brandname{font-family:var(--font-display);font-size:26px;font-weight:800;letter-spacing:.26em;text-transform:uppercase;color:var(--text)}
.topnav{position:absolute;right:88px;top:76px;display:flex;gap:12px;z-index:6}
.chip{padding:15px 28px;border-radius:999px;font-size:14px;font-weight:600;letter-spacing:.3em;text-transform:uppercase;color:var(--text);background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent)}
.tag{position:absolute;z-index:7;padding:18px 26px;border-radius:999px;font-size:14px;font-weight:600;letter-spacing:.3em;text-transform:uppercase;color:var(--text);background:color-mix(in srgb,var(--surface) 58%,transparent);backdrop-filter:blur(22px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);box-shadow:0 24px 60px color-mix(in srgb,var(--text) 12%,transparent)}
.tag-l{left:146px;top:752px}
.tag-r{right:146px;top:752px}
.band{position:absolute;left:0;bottom:0;width:1920px;height:280px;background:linear-gradient(to bottom,transparent,var(--bg) 62%);z-index:4}
.band-in{display:flex;align-items:flex-end;justify-content:space-between;gap:60px;padding:0 88px 54px;box-sizing:border-box;height:100%}
.kick{font-size:15px;font-weight:700;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.note{margin:14px 0 0;max-width:560px;font-size:17px;font-weight:300;line-height:1.6;color:var(--muted)}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-71.9px;top:-540.0px;width:900px;height:1200px;transform:scale(1.45957);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:1781px;height:1160px;border-radius:22px;transform-origin:0 0;transform:matrix3d(0.239938370715, 0, 0, 0, 0.00809028390427, 0.24721112368, 0, 0.0000179784086762, 0, 0, 1, 0, 236.334880878, 392.445244317, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(0.243588265607, -0.0189874180754, 0, 0.0000423329434676, 0.0428811627876, 0.250520632593, 0, 0.0000102890315318, 0, 0, 1, 0, 165.531703242, 444.86698085, 0, 1)}.ui-shell-1{position:absolute;left:156px;top:370px;width:595px;height:507px;background-image:url(/stock/devices/macbook-turn.webp);background-repeat:no-repeat;background-size:595px 4563px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -4056px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style>
<div class="glow glow-a"></div>
<div class="glow glow-b"></div>
<div class="bigword">On Point</div>
<div class="brand"><div class="mark"><span></span></div><div class="brandname">On Point</div></div>
<div class="topnav"><div class="chip">Features</div><div class="chip">Pricing</div><div class="chip">Sign Up</div></div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:370px;top:104px;width:1180px;height:740px;z-index:5"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="tag tag-l">Fully Customizable</div>
<div class="tag tag-r">Dark Mode</div>
<div class="band"><div class="band-in"><div><div class="kick">V2.4 / Personal Banking UI</div><p class="note">Drop in a card component, tune the token, and the whole wallet layout re-renders with live balances.</p></div><div class="kick">30+ Screens</div></div></div>
</div>`,
  },
  {
    id: "ui/centered-device-bottom-copy@v1",
    name: "居中机身+底部文案",
    group: "laptop",
    scene: "macbook",
    brief: "一台笔记本居中放大占满上半画面，底部一条渐隐模糊带上排大标题与说明，适合产品 UI Kit 发布页",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden">
<style>
.hs-glow-a{position:absolute;left:120px;top:-200px;width:1500px;height:1050px;background:radial-gradient(circle at 50% 50%,color-mix(in srgb,var(--accent) 60%,transparent),transparent 66%);opacity:.20}
.hs-glow-b{position:absolute;right:-220px;top:120px;width:1100px;height:900px;background:radial-gradient(circle at 50% 50%,color-mix(in srgb,var(--brand) 70%,transparent),transparent 64%);opacity:.16}
.hs-word{position:absolute;left:0;right:0;top:290px;text-align:center;z-index:1;font-family:var(--font-display);font-size:260px;font-weight:800;letter-spacing:-.04em;line-height:.92;text-transform:uppercase;color:var(--text);opacity:.14;white-space:nowrap}
.hs-slot{position:absolute;z-index:3}
.hs-band{position:absolute;left:0;right:0;bottom:0;height:500px;z-index:4;background:linear-gradient(to bottom,transparent,color-mix(in srgb,var(--bg) 90%,transparent) 44%,var(--bg));backdrop-filter:blur(14px)}
.hs-copy{position:absolute;left:0;right:0;bottom:52px;z-index:6;text-align:center}
.hs-chips{display:flex;justify-content:center;gap:14px;margin-bottom:26px}
.hs-chip{background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);border-radius:999px;padding:11px 24px;font-size:14px;font-weight:500;letter-spacing:.28em;text-transform:uppercase;color:var(--muted)}
.hs-kicker{font-size:15px;font-weight:400;letter-spacing:.42em;text-transform:uppercase;color:var(--muted);margin-bottom:16px}
.hs-title{font-family:var(--font-display);font-size:152px;font-weight:300;letter-spacing:-.03em;line-height:.94;color:var(--text);margin:0}
.hs-desc{font-size:23px;font-weight:300;line-height:1.6;color:var(--muted);max-width:880px;margin:24px auto 0}
.hs-side{position:absolute;left:74px;bottom:66px;z-index:6;font-size:14px;font-weight:400;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.hs-rule{position:absolute;left:74px;bottom:104px;z-index:6;width:64px;height:1px;background:var(--border)}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-66.1px;top:-510.8px;width:900px;height:1200px;transform:scale(1.38067);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:1781px;height:1160px;border-radius:22px;transform-origin:0 0;transform:matrix3d(0.239938370715, 0, 0, 0, 0.00809028390427, 0.24721112368, 0, 0.0000179784086762, 0, 0, 1, 0, 236.334880878, 392.445244317, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(0.243588265607, -0.0189874180754, 0, 0.0000423329434676, 0.0428811627876, 0.250520632593, 0, 0.0000102890315318, 0, 0, 1, 0, 165.531703242, 444.86698085, 0, 1)}.ui-shell-1{position:absolute;left:156px;top:370px;width:595px;height:507px;background-image:url(/stock/devices/macbook-turn.webp);background-repeat:no-repeat;background-size:595px 4563px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -4056px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style>
<div class="hs-glow-a"></div>
<div class="hs-glow-b"></div>
<div class="hs-word">Workspace</div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:400px;top:28px;width:1120px;height:700px"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="hs-band"></div>
<div class="hs-rule"></div>
<div class="hs-side">(111) HubSpot UI Kit</div>
<div class="hs-copy">
<div class="hs-chips">
<span class="hs-chip">30+ Screens</span>
<span class="hs-chip">Dark Mode</span>
<span class="hs-chip">Auto Layout</span>
</div>
<div class="hs-kicker">V2.4 / CRM Design System</div>
<h1 class="hs-title">UI Kit</h1>
<p class="hs-desc">Every card, chip and pipeline state is a real component with tokens attached, so a new dashboard screen drops together in minutes instead of days.</p>
</div>
</div>`,
  },
  {
    id: "ui/dark-hero-left-copy-right-phone@v1",
    name: "深底左文右机",
    group: "phone",
    scene: "iphone",
    brief: "深色英雄区，左侧大标题与说明加右侧单台手机，屏幕前压着毛玻璃余额卡，底部一条模糊三步说明带",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);color:var(--text);font-family:var(--font-sans)"><style>.hero-glow-a{position:absolute;left:1010px;top:-180px;width:1020px;height:1020px;border-radius:50%;background:radial-gradient(circle,var(--accent) 0%,transparent 66%);opacity:.22;filter:blur(28px)}.hero-glow-b{position:absolute;left:1130px;top:400px;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,var(--brand) 0%,transparent 68%);opacity:.16;filter:blur(32px)}.hero-word{position:absolute;left:-40px;top:104px;z-index:1;font-family:var(--font-display);font-size:232px;font-weight:900;line-height:.88;letter-spacing:-.045em;opacity:.10;white-space:nowrap}.hero-nav{position:absolute;left:96px;top:58px;z-index:7;display:flex;align-items:center;gap:58px}.hero-logo{display:flex;align-items:center;gap:14px;font-size:23px;font-weight:800;letter-spacing:-.01em}.hero-mark{width:26px;height:26px;border-radius:50%;border:2px solid var(--accent);background:color-mix(in srgb,var(--accent) 26%,transparent)}.hero-links{display:flex;gap:36px;font-size:16px;font-weight:400;color:var(--muted);letter-spacing:.02em}.glass{border-radius:999px;background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent)}.hero-signup{position:absolute;right:96px;top:52px;z-index:7;padding:17px 36px;font-size:16px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}.hero-title{position:absolute;left:96px;top:246px;z-index:6;width:770px;margin:0;font-size:108px;font-weight:600;line-height:1.03;letter-spacing:-.038em}.hero-cta{position:absolute;left:96px;top:656px;z-index:6;border-radius:14px;background:var(--accent);color:var(--bg);padding:22px 44px;font-size:17px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}.hero-note{position:absolute;left:430px;top:650px;z-index:6;width:340px;margin:0;font-size:16px;font-weight:300;line-height:1.62;color:var(--muted)}.panel{position:absolute;z-index:5;box-sizing:border-box;border-radius:26px;background:color-mix(in srgb,var(--surface) 56%,transparent);backdrop-filter:blur(24px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);padding:26px 28px}.panel-k{font-size:12px;font-weight:600;letter-spacing:.28em;text-transform:uppercase;color:var(--muted)}.panel-v{font-size:38px;font-weight:800;letter-spacing:-.02em;margin-top:10px}.panel-bars{display:flex;align-items:flex-end;gap:9px;height:74px;margin-top:18px}.bar{width:16px;border-radius:6px;background:color-mix(in srgb,var(--accent) 70%,transparent)}.hero-tag{position:absolute;left:1588px;top:592px;z-index:5;padding:18px 32px;font-size:15px;font-weight:600;letter-spacing:.16em;text-transform:uppercase}.hero-band{position:absolute;left:0;bottom:0;width:1920px;height:212px;z-index:8;background:linear-gradient(180deg,transparent,color-mix(in srgb,var(--text) 10%,transparent) 46%,color-mix(in srgb,var(--text) 16%,transparent));backdrop-filter:blur(16px);border-top:1px solid color-mix(in srgb,var(--border) 45%,transparent);display:flex;align-items:center;justify-content:center;gap:44px}.step{display:flex;align-items:center;gap:18px;width:300px}.step-ico{width:46px;height:46px;border-radius:12px;border:1px solid color-mix(in srgb,var(--border) 70%,transparent);background:color-mix(in srgb,var(--accent) 28%,transparent)}.step-t{font-size:16px;font-weight:400;line-height:1.45}.step-arrow{font-size:24px;color:var(--muted);opacity:.55}*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-219.3px;top:-138.6px;width:900px;height:1200px;transform:scale(1.01174);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style><div class="hero-glow-a"></div><div class="hero-glow-b"></div><div class="hero-word">ROUND</div><div class="hero-nav"><div class="hero-logo"><span class="hero-mark"></span><span>Round</span></div><div class="hero-links"><span>How it works</span><span>Features</span><span>App</span><span>Company</span></div></div><div class="hero-signup glass">Sign up</div><h1 class="hero-title">Pay, invest, save your cash with a single bank</h1><div class="hero-cta">Get started</div><p class="hero-note">The modern way to control your savings with just one app.</p><div class="ui-dev ui-dev-1" style="position:absolute;left:1276px;top:44px;width:474px;height:948px;z-index:3"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div><div class="panel" style="left:1046px;top:186px"><div class="panel-k">Total balance</div><div class="panel-v">$67,939.04</div><div class="panel-bars"><span class="bar" style="height:38px"></span><span class="bar" style="height:56px"></span><span class="bar" style="height:30px"></span><span class="bar" style="height:68px"></span><span class="bar" style="height:46px"></span><span class="bar" style="height:74px"></span></div></div><div class="panel" style="left:1080px;top:700px;width:280px;padding:20px 24px"><div class="panel-k">Weekly spend</div><div class="panel-bars" style="height:52px;margin-top:14px"><span class="bar" style="height:24px;width:12px"></span><span class="bar" style="height:40px;width:12px"></span><span class="bar" style="height:18px;width:12px"></span><span class="bar" style="height:48px;width:12px"></span><span class="bar" style="height:32px;width:12px"></span></div></div><div class="hero-tag glass">Smart living</div><div class="hero-band"><div class="step"><span class="step-ico"></span><span class="step-t">Download the app to your device</span></div><span class="step-arrow">›</span><div class="step"><span class="step-ico"></span><span class="step-t">Sign up with your phone or ID card</span></div><span class="step-arrow">›</span><div class="step"><span class="step-ico"></span><span class="step-t">Get a virtual card or order a physical one</span></div></div></div>`,
  },
  {
    id: "ui/light-left-copy-two-phones@v1",
    name: "浅底左文双机",
    group: "phone",
    scene: "iphone",
    brief: "浅色英雄区，左侧带描边胶囊的标题与商店按钮，右侧前后两台手机错落叠放并压一张毛玻璃余额卡",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);color:var(--text);font-family:var(--font-sans)"><style>.bank-glow-a{position:absolute;left:820px;top:-140px;width:1100px;height:1100px;border-radius:50%;background:radial-gradient(circle,var(--accent) 0%,transparent 68%);opacity:.20;filter:blur(30px)}.bank-glow-b{position:absolute;left:420px;top:540px;width:900px;height:900px;border-radius:50%;background:radial-gradient(circle,var(--brand) 0%,transparent 70%);opacity:.14;filter:blur(34px)}.bank-word{position:absolute;left:690px;top:70px;z-index:1;font-family:var(--font-display);font-size:228px;font-weight:900;line-height:.9;letter-spacing:-.04em;opacity:.10;white-space:nowrap}.bank-logo{position:absolute;left:104px;top:58px;z-index:7;font-size:24px;font-weight:800;letter-spacing:-.01em}.bank-links{position:absolute;left:640px;top:66px;z-index:7;display:flex;align-items:center;gap:26px;font-size:16px;font-weight:400;color:var(--muted)}.bank-sep{opacity:.5}.bank-cta{position:absolute;right:104px;top:52px;z-index:7;border-radius:999px;background:var(--accent);color:var(--bg);padding:18px 38px;font-size:16px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}.bank-title{position:absolute;left:120px;top:284px;z-index:6;width:700px;margin:0;font-size:90px;font-weight:700;line-height:1.16;letter-spacing:-.028em}.bank-pill{display:inline-block;border:2px solid var(--text);border-radius:999px;padding:0 26px 8px}.bank-note{position:absolute;left:120px;top:656px;z-index:6;width:470px;margin:0;font-size:18px;font-weight:300;line-height:1.66;color:var(--muted)}.store{position:absolute;z-index:7;display:flex;align-items:center;gap:14px;box-sizing:border-box;border-radius:16px;padding:14px 26px;background:color-mix(in srgb,var(--surface) 58%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent)}.store-sq{width:26px;height:26px;border-radius:7px;background:color-mix(in srgb,var(--text) 70%,transparent)}.store-k{display:block;font-size:10px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--muted)}.store-v{display:block;font-size:17px;font-weight:700;letter-spacing:-.01em}.bank-card{position:absolute;left:1452px;top:132px;z-index:5;box-sizing:border-box;width:342px;height:134px;border-radius:20px;background:color-mix(in srgb,var(--surface) 60%,transparent);backdrop-filter:blur(22px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);padding:22px 26px;display:flex;align-items:center;gap:18px}.card-sq{width:46px;height:46px;border-radius:12px;background:color-mix(in srgb,var(--accent) 55%,transparent)}.card-k{font-size:11px;font-weight:600;letter-spacing:.24em;text-transform:uppercase;color:var(--muted)}.card-v{font-size:26px;font-weight:800;letter-spacing:-.02em;margin-top:6px}.bank-ring{position:absolute;left:884px;top:748px;width:130px;height:130px;border-radius:50%;border:1px dashed color-mix(in srgb,var(--text) 38%,transparent);z-index:1}*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-186.9px;top:-118.1px;width:900px;height:1200px;transform:scale(0.86233);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}*{pointer-events:none}.ui-dev-2,.ui-dev-2 *{pointer-events:auto}.ui-stage-2{position:absolute;left:-173.0px;top:-109.4px;width:900px;height:1200px;transform:scale(0.79829);transform-origin:top left}.ui-screen-2{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-2 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-2:hover .ui-screen-2{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-2{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-2:hover .ui-shell-2{background-position:0 -7496px}.ui-dev-2{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-2:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-2,.ui-screen-2,.ui-shell-2{transition:none}}</style><div class="bank-glow-a"></div><div class="bank-glow-b"></div><div class="bank-word">BANKING</div><div class="bank-ring"></div><div class="bank-logo">atom bank</div><div class="bank-links"><span>Features</span><span class="bank-sep">/</span><span>Services</span><span class="bank-sep">/</span><span>Payments</span><span class="bank-sep">/</span><span>Credits</span></div><div class="bank-cta">Get started →</div><h1 class="bank-title"><span class="bank-pill">Mobile banking</span><br>that helps you<br>manage <span class="bank-pill">finances</span></h1><p class="bank-note">Modern and secure service that lets you manage accounts, make payments and transfers using your smartphone.</p><div class="ui-dev ui-dev-1" style="position:absolute;left:1010px;top:168px;width:404px;height:808px;z-index:4"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div><div class="ui-dev ui-dev-2" style="position:absolute;left:1360px;top:288px;width:374px;height:748px;z-index:3"><div class="ui-stage ui-stage-2"><div class="ui-screen ui-screen-2"><img data-lumen-image="2"></div><div class="ui-shell ui-shell-2"></div></div></div></div><div class="bank-card"><span class="card-sq"></span><span><span class="card-k">Total balance</span><span class="card-v">$110.00</span></span></div><div class="store" style="left:120px;top:784px"><span class="store-sq"></span><span><span class="store-k">Download on the</span><span class="store-v">App Store</span></span></div><div class="store" style="left:400px;top:784px"><span class="store-sq"></span><span><span class="store-k">Get it on</span><span class="store-v">Google Play</span></span></div></div>`,
  },
  {
    id: "ui/center-phone-giant-word@v1",
    name: "居中手机压大字",
    group: "phone",
    scene: "iphone",
    brief: "一台手机居中压在超大品牌词上，四角散落小字与毛玻璃标签，适合单品界面主视觉展示。",
    skeleton: `<div style="position:relative;width:1920px;height:1080px;background:var(--bg);overflow:hidden">
<style>
.glow{position:absolute;border-radius:50%;pointer-events:none}
.giant{position:absolute;left:0;top:420px;width:1920px;display:flex;justify-content:center;align-items:baseline;gap:150px;font-family:var(--font-display);font-size:320px;font-weight:900;letter-spacing:-.04em;line-height:.86;white-space:nowrap;color:var(--text);opacity:.15}
.giant span:last-child{opacity:.55}
.kicker{position:absolute;font-size:16px;font-weight:500;letter-spacing:.36em;text-transform:uppercase;color:var(--muted)}
.chip{position:absolute;display:flex;align-items:center;gap:14px;padding:15px 28px;border-radius:999px;background:color-mix(in srgb,var(--surface) 58%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);font-size:15px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--text)}
.dot{width:9px;height:9px;border-radius:50%;background:var(--accent)}
.panel{position:absolute;padding:28px 32px;border-radius:28px;background:color-mix(in srgb,var(--surface) 50%,transparent);backdrop-filter:blur(22px);border:1px solid color-mix(in srgb,var(--border) 65%,transparent)}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-222.1px;top:-140.4px;width:900px;height:1200px;transform:scale(1.02455);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style>
<div class="glow" style="left:520px;top:0;width:900px;height:900px;background:radial-gradient(circle,var(--accent) 0%,transparent 68%);opacity:.22;filter:blur(50px)"></div>
<div class="glow" style="left:60px;top:520px;width:720px;height:720px;background:radial-gradient(circle,var(--brand) 0%,transparent 70%);opacity:.16;filter:blur(60px)"></div>
<div class="glow" style="left:1180px;top:380px;width:760px;height:760px;background:radial-gradient(circle,var(--accent) 0%,transparent 72%);opacity:.14;filter:blur(60px)"></div>
<div class="giant"><span>Digit</span><span>Link</span></div>
<div style="position:absolute;left:0;bottom:0;width:1920px;height:280px;background:linear-gradient(to top,var(--bg) 0%,transparent 100%)"></div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:720px;top:70px;width:480px;height:960px"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="kicker" style="left:72px;top:66px">UI/UX 2024</div>
<div class="kicker" style="right:72px;top:66px">ARUI</div>
<div style="position:absolute;left:1300px;top:150px;width:36px;height:36px;border:2px solid color-mix(in srgb,var(--text) 50%,transparent);border-radius:9px;transform:rotate(45deg)"></div>
<div class="chip" style="left:1214px;top:236px"><span class="dot"></span>Live preview</div>
<div class="chip" style="left:200px;top:730px"><span class="dot"></span>Fully customizable</div>
<div class="panel" style="left:72px;bottom:72px;width:440px">
<p style="margin:0 0 14px;font-size:14px;font-weight:600;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)">01 / User experience</p>
<p style="margin:0;font-size:18px;font-weight:300;line-height:1.65;color:var(--text)">Drag a component onto the canvas and it snaps to the grid. Every screen ships with dark mode, motion presets and tokens.</p>
</div>
<div style="position:absolute;right:72px;bottom:78px;display:flex;gap:92px;text-align:right">
<div><p style="margin:0 0 10px;font-size:13px;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)">UI Designer</p><p style="margin:0;font-size:22px;font-weight:600;letter-spacing:.02em;color:var(--text)">ARUI</p></div>
<div><p style="margin:0 0 6px;font-size:13px;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)">Tidy Up</p><p style="margin:0;font-family:var(--font-script);font-size:34px;color:var(--text)">ARUI</p></div>
</div>
</div>`,
  },
  {
    id: "ui/left-copy-center-phone@v1",
    name: "左文右注居中机",
    group: "phone",
    scene: "iphone",
    brief: "居中的一台手机压在超大背景字上，左侧大标题与浮层卡片、右侧说明与网络节点环绕，适合展示单台设备的界面主视觉。",
    skeleton: `<div style="position:relative;width:1920px;height:1080px;background:var(--bg);overflow:hidden">
<style>
.ui-grid{position:absolute;left:0;top:0;width:1920px;height:1080px;background-image:linear-gradient(color-mix(in srgb,var(--border) 38%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,var(--border) 38%,transparent) 1px,transparent 1px);background-size:120px 120px;opacity:.5}
.ui-veil{position:absolute;left:0;top:0;width:1920px;height:1080px;background:radial-gradient(ellipse at 50% 42%,transparent 30%,var(--bg) 94%)}
.ui-glow-a{position:absolute;left:470px;top:20px;width:1000px;height:1000px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 58%,transparent) 0%,transparent 68%);opacity:.22;filter:blur(18px)}
.ui-glow-b{position:absolute;left:1120px;top:400px;width:780px;height:780px;background:radial-gradient(circle,color-mix(in srgb,var(--brand) 62%,transparent) 0%,transparent 70%);opacity:.18;filter:blur(22px)}
.ui-glow-c{position:absolute;left:160px;top:500px;width:560px;height:560px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 45%,transparent) 0%,transparent 70%);opacity:.14;filter:blur(18px)}
.glass{background:color-mix(in srgb,var(--surface) 55%,transparent);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 62%,transparent)}
.ui-word{position:absolute;left:740px;top:688px;font-family:var(--font-display);font-size:240px;font-weight:900;line-height:.9;letter-spacing:-.045em;color:var(--text);opacity:.12;white-space:nowrap;z-index:1}
.ui-kicker{position:absolute;left:110px;top:54px;font-size:16px;font-weight:500;letter-spacing:.34em;text-transform:uppercase;color:var(--muted);z-index:2}
.ui-title{position:absolute;left:90px;top:100px;width:880px;font-family:var(--font-display);font-size:96px;font-weight:300;line-height:1;letter-spacing:-.03em;color:var(--text);opacity:.78;z-index:1}
.ui-note-head{position:absolute;left:1390px;top:52px;width:430px;text-align:right;font-size:17px;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:var(--text);z-index:2}
.ui-dot-mark{display:inline-block;width:14px;height:14px;border-radius:4px;background:color-mix(in srgb,var(--accent) 72%,transparent);vertical-align:middle;margin-right:10px}
.ui-lede{position:absolute;left:1440px;top:104px;width:380px;text-align:right;font-size:17px;font-weight:300;line-height:1.65;color:var(--muted);z-index:2}
.ui-tagline{position:absolute;left:1440px;top:300px;width:380px;text-align:right;font-size:15px;letter-spacing:.32em;text-transform:uppercase;color:var(--muted);z-index:2}
.ui-pill{position:absolute;display:flex;align-items:center;gap:16px;height:68px;padding:0 26px;border-radius:999px;box-sizing:border-box;z-index:4}
.ui-glyph{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;color:var(--text);background:color-mix(in srgb,var(--surface) 72%,transparent)}
.ui-pill-text{font-size:15px;font-weight:500;letter-spacing:.18em;text-transform:uppercase;color:var(--text)}
.ui-card{position:absolute;left:268px;top:620px;width:340px;height:168px;border-radius:26px;box-sizing:border-box;padding:24px 26px;display:flex;flex-direction:column;justify-content:space-between;z-index:3}
.ui-mini{font-size:14px;letter-spacing:.22em;text-transform:uppercase;color:var(--muted)}
.ui-amount{font-family:var(--font-display);font-size:42px;font-weight:600;letter-spacing:-.02em;color:var(--text);line-height:1}
.ui-delta{align-self:flex-start;font-size:13px;font-weight:600;letter-spacing:.08em;color:var(--text);background:color-mix(in srgb,var(--accent) 62%,transparent);border-radius:999px;padding:5px 12px}
.ui-price{position:absolute;left:1150px;top:430px;width:264px;height:126px;border-radius:22px;box-sizing:border-box;padding:20px 24px;display:flex;flex-direction:column;justify-content:center;gap:10px;z-index:4}
.ui-price-cap{font-size:13px;letter-spacing:.26em;text-transform:uppercase;color:var(--muted)}
.ui-price-val{font-family:var(--font-display);font-size:44px;font-weight:600;letter-spacing:-.02em;color:var(--text);line-height:1}
.ui-orb{position:absolute;left:1416px;top:500px;width:76px;height:76px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:24px;color:var(--text);z-index:4}
.ui-node{position:absolute;display:flex;flex-direction:column;align-items:center;gap:16px;z-index:6}
.ui-node-dot{width:92px;height:92px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:600;color:var(--text)}
.ui-node-cap{font-size:15px;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)}
.ui-link{position:absolute;background:color-mix(in srgb,var(--border) 55%,transparent);z-index:2}
.ui-badge{position:absolute;left:878px;top:908px;width:140px;height:140px;border-radius:50%;background:var(--brand);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;z-index:7}
.ui-badge-mark{font-family:var(--font-display);font-size:46px;font-weight:800;color:var(--bg);line-height:1}
.ui-badge-cap{font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:var(--bg);opacity:.75}
.ui-stack{position:absolute;left:1630px;top:856px;display:flex;flex-direction:column;align-items:flex-end;gap:12px;z-index:7}
.ui-chip{height:46px;padding:0 24px;border-radius:999px;display:flex;align-items:center;font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}
.ui-band{position:absolute;left:0;bottom:0;width:1920px;height:240px;background:linear-gradient(to top,color-mix(in srgb,var(--bg) 90%,transparent),transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);z-index:5;pointer-events:none}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-226.7px;top:-143.3px;width:900px;height:1200px;transform:scale(1.04589);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style>
<div class="ui-grid"></div>
<div class="ui-veil"></div>
<div class="ui-glow-a"></div>
<div class="ui-glow-b"></div>
<div class="ui-glow-c"></div>
<div class="ui-word">REWARDS</div>
<div class="ui-title">Interoperability Like Never Before</div>
<div class="ui-kicker">/ MOBILE APP</div>
<div class="ui-note-head"><span class="ui-dot-mark"></span>A WORLD OF REWARDS AWAITS!</div>
<p class="ui-lede">Unlock exclusive experiences and perks with your Passport. Loyalty, incentives and extra rewards live in one wallet.</p>
<div class="ui-tagline">[ ECOSYSTEM WEB3 ]</div>
<div class="ui-link" style="left:290px;top:806px;width:180px;height:1px"></div>
<div class="ui-link" style="left:600px;top:820px;width:1px;height:180px"></div>
<div class="ui-link" style="left:330px;top:1010px;width:250px;height:1px"></div>
<div class="ui-link" style="left:1300px;top:900px;width:280px;height:1px"></div>
<div class="ui-link" style="left:1580px;top:750px;width:1px;height:120px"></div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:715px;top:30px;width:490px;height:980px;z-index:3"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="ui-pill glass" style="left:110px;top:452px"><span class="ui-glyph">&#8594;</span><span class="ui-pill-text">Explore the ecosystem</span></div>
<div class="ui-pill glass" style="left:330px;top:566px"><span class="ui-glyph">&#8599;</span><span class="ui-pill-text">Receive</span></div>
<div class="ui-card glass"><span class="ui-mini">Your balance</span><span class="ui-amount">$24,130.50</span><span class="ui-delta">+2.10%</span></div>
<div class="ui-price glass"><span class="ui-price-cap">Price per token</span><span class="ui-price-val">$1,00</span></div>
<div class="ui-orb glass">&#8644;</div>
<div class="ui-node" style="left:200px;top:800px"><span class="ui-node-cap">Wallet</span><span class="ui-node-dot glass">W</span></div>
<div class="ui-node" style="left:452px;top:900px"><span class="ui-node-cap">Crypto</span><span class="ui-node-dot glass">C</span></div>
<div class="ui-node" style="left:1200px;top:780px"><span class="ui-node-cap">Crypto</span><span class="ui-node-dot glass">C</span></div>
<div class="ui-node" style="left:1540px;top:620px"><span class="ui-node-cap">Gift</span><span class="ui-node-dot glass">G</span></div>
<div class="ui-badge"><span class="ui-badge-mark">P</span><span class="ui-badge-cap">Passport</span></div>
<div class="ui-stack"><div class="ui-chip glass">UI/UX</div><div class="ui-chip glass">Mobile App</div><div class="ui-chip glass">Web3</div></div>
<div class="ui-band"></div>
</div>`,
  },
  {
    id: "ui/left-copy-left-phone@v1",
    name: "左文左机",
    group: "phone",
    scene: "iphone",
    brief: "左侧竖排标题与说明、下方一台手机，右中偏置一台大显示器，巨型单词横在设备底部，适合服务介绍页首页。",
    skeleton: `<div class="page" style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)"><style>.glow{position:absolute;border-radius:50%;filter:blur(70px);pointer-events:none;z-index:0}.glow-a{left:600px;top:-220px;width:1200px;height:1200px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 50%,transparent),transparent 68%);opacity:.22}.glow-b{left:-260px;top:380px;width:960px;height:960px;background:radial-gradient(circle,color-mix(in srgb,var(--brand) 46%,transparent),transparent 70%);opacity:.18}.glow-c{right:-220px;bottom:-300px;width:1100px;height:1000px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 40%,transparent),transparent 72%);opacity:.15}.giant{position:absolute;left:560px;top:752px;font-family:var(--font-display);font-size:224px;font-weight:800;letter-spacing:-.04em;line-height:.86;text-transform:uppercase;color:var(--text);opacity:.12;white-space:nowrap;z-index:1}.copy{position:absolute;left:130px;top:132px;width:470px;z-index:6}.kicker{font-size:15px;font-weight:500;letter-spacing:.44em;text-transform:uppercase;color:var(--muted)}.copy h1{margin:26px 0 0;font-family:var(--font-display);font-size:88px;font-weight:900;line-height:.94;letter-spacing:-.035em;text-transform:uppercase;color:var(--text)}.copy p{margin:26px 0 0;max-width:400px;font-size:18px;font-weight:300;line-height:1.65;color:var(--muted)}.nav{position:absolute;right:130px;top:70px;display:flex;gap:36px;padding:18px 36px;border-radius:999px;background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 68%,transparent);z-index:8}.nav span{font-size:13px;font-weight:500;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)}.nav span.on{color:var(--text)}.chip{position:absolute;display:flex;align-items:center;gap:12px;padding:15px 26px;border-radius:999px;background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);font-size:13px;font-weight:500;letter-spacing:.24em;text-transform:uppercase;color:var(--text);z-index:6;white-space:nowrap}.chip .dot{width:8px;height:8px;border-radius:50%;background:var(--accent)}.band{position:absolute;left:0;right:0;bottom:0;height:240px;background:linear-gradient(to bottom,transparent,var(--bg));z-index:7;pointer-events:none}.bar{position:absolute;left:130px;right:130px;bottom:44px;height:74px;display:flex;align-items:center;justify-content:space-between;padding:0 40px;border-radius:999px;background:color-mix(in srgb,var(--surface) 52%,transparent);backdrop-filter:blur(22px);border:1px solid color-mix(in srgb,var(--border) 62%,transparent);z-index:8}.bar span{font-size:13px;font-weight:500;letter-spacing:.32em;text-transform:uppercase;color:var(--muted)}.bar span.lead{color:var(--text);font-weight:700}*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-138.8px;top:-87.7px;width:900px;height:1200px;transform:scale(0.64034);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}*{pointer-events:none}.ui-dev-2,.ui-dev-2 *{pointer-events:auto}.ui-stage-2{position:absolute;left:-74.0px;top:-432.6px;width:900px;height:1200px;transform:scale(1.32288);transform-origin:top left}.ui-screen-2{position:absolute;left:0;top:0;width:3533px;height:1988px;border-radius:16px;transform-origin:0 0;transform:matrix3d(0.194674468736, 0, 0, 0, 0.00722258029417, 0.20084118139, 0, 0.0000160501784315, 0, 0, 1, 0, 106.107550977, 351.711547735, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-2 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-2:hover .ui-screen-2{transform:matrix3d(0.202346986126, 0.00644592133635, 0, 0.0000377974793072, 0.0129337680086, 0.208936346938, 0, 0.00000812980323644, 0, 0, 1, 0, 127.608952389, 358.530188991, 0, 1)}.ui-shell-2{position:absolute;left:97px;top:327px;width:704px;height:542px;background-image:url(/stock/devices/display-turn.webp);background-repeat:no-repeat;background-size:704px 4878px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-2:hover .ui-shell-2{background-position:0 -4336px}.ui-dev-2{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-2:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-2,.ui-screen-2,.ui-shell-2{transition:none}}</style><div class="glow glow-a"></div><div class="glow glow-b"></div><div class="glow glow-c"></div><div class="giant">SERVICES</div><div class="ui-dev ui-dev-1" style="position:absolute;left:130px;top:480px;width:300px;height:600px;z-index:2"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div><div class="ui-dev ui-dev-2" style="position:absolute;left:760px;top:130px;width:1040px;height:717px;z-index:2"><div class="ui-stage ui-stage-2"><div class="ui-screen ui-screen-2"><img data-lumen-image="2"></div><div class="ui-shell ui-shell-2"></div></div></div></div><div class="copy"><div class="kicker">V2.4 / SERVICE SYSTEM</div><h1>OUR<br>SERVICES</h1><p>Drag a component onto the canvas and it snaps to the grid. Every service page ships responsive, dark-mode ready and wired to real data.</p></div><div class="nav"><span class="on">About</span><span>Services</span><span>Projects</span><span>Contact</span></div><div class="chip" style="left:330px;top:660px"><span class="dot"></span><span>Live preview</span></div><div class="chip" style="left:690px;top:790px"><span class="dot"></span><span>30+ screens</span></div><div class="band"></div><div class="bar"><span class="lead">OOSAA SERVICE SYSTEM</span><span>Design / Build / Maintain</span><span>EST. 2024</span></div></div>`,
  },
  {
    id: "ui/text-left-phone-right-2@v1",
    name: "左文右机",
    group: "phone",
    scene: "iphone",
    brief: "左侧四行巨型标题压着文字选择框与蓝色胶囊标签，右侧下方一台竖屏手机顶出画面，右上角白色方块压住标题，适合展示移动端 App 界面。",
    skeleton: `<div class="stage">
<style>
.stage{position:relative;width:1920px;height:1080px;background:var(--bg);overflow:hidden;font-family:var(--font-sans)}
.glow-a{position:absolute;left:900px;top:60px;width:1060px;height:1060px;background:radial-gradient(circle,var(--accent) 0%,transparent 68%);opacity:.20;z-index:0}
.glow-b{position:absolute;left:-220px;top:-180px;width:1150px;height:950px;background:radial-gradient(circle,var(--brand) 0%,transparent 70%);opacity:.14;z-index:0}
.ghost{position:absolute;left:940px;top:790px;z-index:1;font-family:var(--font-display);font-size:210px;font-weight:800;letter-spacing:-.04em;line-height:.9;color:var(--text);opacity:.10}
.head{position:absolute;left:150px;top:104px;margin:0;z-index:2;font-family:var(--font-display);font-size:152px;font-weight:300;line-height:.98;letter-spacing:-.035em;color:var(--text)}
.head span{display:block}
.sel{position:absolute;left:138px;top:252px;width:872px;height:170px;border:2px solid var(--accent);z-index:4}
.sel span{position:absolute;width:14px;height:14px;background:var(--bg);border:2px solid var(--accent)}
.sel .tl{left:-9px;top:-9px}
.sel .tr{right:-9px;top:-9px}
.sel .bl{left:-9px;bottom:-9px}
.sel .br{right:-9px;bottom:-9px}
.panel{position:absolute;left:1420px;top:-90px;width:600px;height:600px;background:var(--surface);z-index:3}
.mark{position:absolute;left:170px;top:240px;width:262px;height:212px}
.mark span{position:absolute;display:block}
.m1{left:0;top:0;width:130px;height:64px;border-radius:32px;background:var(--accent)}
.m2{left:0;top:74px;width:130px;height:64px;border-radius:32px;background:var(--brand);opacity:.8}
.m3{left:0;top:148px;width:130px;height:64px;border-radius:32px;background:var(--accent);opacity:.5}
.m4{left:142px;top:74px;width:120px;height:120px;border-radius:60px;background:var(--brand);opacity:.35}
.chip{position:absolute;left:1000px;top:398px;z-index:6;padding:20px 40px;border-radius:10px;font-size:32px;font-weight:500;letter-spacing:.01em;color:var(--text);background:color-mix(in srgb,var(--brand) 78%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 60%,transparent)}
.copy{position:absolute;left:150px;top:790px;width:640px;z-index:6}
.kicker{font-size:17px;font-weight:600;letter-spacing:.42em;text-transform:uppercase;color:var(--accent)}
.copy p{margin:20px 0 0;font-size:20px;font-weight:300;line-height:1.6;color:var(--muted)}
.tags{display:flex;gap:14px;margin-top:26px}
.tag{padding:14px 26px;border-radius:999px;font-size:16px;letter-spacing:.16em;text-transform:uppercase;color:var(--text);background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent)}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-182.1px;top:-140.4px;width:900px;height:1200px;transform:scale(1.02455);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style>
<div class="glow-a"></div>
<div class="glow-b"></div>
<div class="ghost">STYLE</div>
<h1 class="head"><span>Design in</span><span>modern and</span><span>minimalist</span><span>style</span></h1>
<div class="sel"><span class="tl"></span><span class="tr"></span><span class="bl"></span><span class="br"></span></div>
<div class="panel"><div class="mark"><span class="m1"></span><span class="m2"></span><span class="m3"></span><span class="m4"></span></div></div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:1180px;top:400px;width:560px;height:960px;z-index:5"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="chip">Enver Studio</div>
<div class="copy">
<div class="kicker">V2.4 / Design System</div>
<p>Drag a component onto the canvas and it snaps to the grid, keeping every card, token and state in sync.</p>
<div class="tags"><div class="tag">Fully Customizable</div><div class="tag">Dark Mode</div></div>
</div>
</div>`,
  },
  {
    id: "ui/centered-phone-split-caption@v1",
    name: "中置手机分栏注解",
    group: "phone",
    scene: "iphone",
    brief: "巨字压底的居中手机，左右两侧分栏排说明与日期标签，适合手机银行或单屏 App 展示页。",
    skeleton: `<div style="position:relative;width:1920px;height:1080px;background:var(--bg);overflow:hidden">
<style>
.wm{position:absolute;z-index:1;font-family:var(--font-display);font-weight:900;line-height:.86;color:var(--text);white-space:nowrap;pointer-events:none}
.wm-top{left:70px;top:-34px;font-size:282px;letter-spacing:-.035em;opacity:.12}
.wm-bot{left:-12px;bottom:-72px;font-size:330px;letter-spacing:-.04em;opacity:.13}
.glow{position:absolute;z-index:2;border-radius:50%;filter:blur(30px);pointer-events:none}
.glow-a{left:460px;top:-60px;width:1000px;height:920px;background:radial-gradient(circle at 50% 50%,color-mix(in srgb,var(--accent) 60%,transparent),transparent 68%);opacity:.22}
.glow-b{left:1060px;top:470px;width:880px;height:720px;background:radial-gradient(circle at 50% 50%,color-mix(in srgb,var(--brand) 55%,transparent),transparent 70%);opacity:.18}
.line{position:absolute;z-index:2;background:var(--border);opacity:.55}
.kicker{position:absolute;z-index:4;font-size:19px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.lead{position:absolute;z-index:4;font-size:24px;line-height:1.6;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.claim{position:absolute;z-index:4;font-size:40px;font-weight:800;line-height:1.12;letter-spacing:-.01em;text-transform:uppercase;color:var(--text)}
.sig{font-family:var(--font-script);font-size:38px;letter-spacing:.02em;text-transform:none;color:var(--text)}
.chip{position:absolute;z-index:5;display:flex;align-items:center;gap:14px;padding:18px 30px;border-radius:999px;background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);font-size:17px;letter-spacing:.28em;text-transform:uppercase;color:var(--text)}
.dot{width:12px;height:12px;border-radius:3px;background:var(--accent)}
.panel{position:absolute;z-index:5;border-radius:22px;padding:26px 32px;background:color-mix(in srgb,var(--surface) 58%,transparent);backdrop-filter:blur(20px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent)}
.band{position:absolute;z-index:6;left:0;bottom:0;width:1920px;height:140px;background:linear-gradient(to top,color-mix(in srgb,var(--bg) 92%,transparent),transparent);backdrop-filter:blur(10px)}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-208.2px;top:-131.6px;width:900px;height:1200px;transform:scale(0.96051);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style>
<div class="glow glow-a"></div>
<div class="glow glow-b"></div>
<div class="wm wm-top">DESIGNS</div>
<div class="wm wm-bot">BANKING</div>
<div class="line" style="left:0;top:318px;width:1920px;height:1px"></div>
<div class="line" style="left:0;top:812px;width:1920px;height:1px"></div>
<div class="line" style="left:1456px;top:0;width:1px;height:1080px"></div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:735px;top:80px;width:450px;height:900px;z-index:3"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="lead" style="left:56px;top:238px;width:400px">Minimalistic layout with bold type for account balances and spending trends.</div>
<div class="claim" style="left:60px;top:430px;width:430px">Share your best banking app</div>
<div class="kicker" style="left:1424px;top:228px">Design</div>
<div class="sig" style="position:absolute;z-index:4;left:1424px;top:262px">HR Rumen</div>
<div class="kicker" style="left:1424px;top:520px">Date</div>
<div class="kicker" style="left:1424px;top:556px;color:var(--text)">29/10/2024</div>
<div class="panel" style="left:1330px;top:640px;width:340px">
<div class="kicker" style="position:static">Live balance</div>
<div style="margin-top:14px;font-size:46px;font-weight:800;letter-spacing:-.02em;color:var(--text)">$16.965,90</div>
<div style="margin-top:10px;font-size:16px;line-height:1.5;color:var(--muted)">Snapshot refreshes every 30 seconds across linked accounts.</div>
</div>
<div class="chip" style="left:56px;top:862px"><span class="dot"></span>Dark mode ready</div>
<div class="chip" style="left:1424px;top:880px;padding:16px 26px">30+ screens</div>
<div class="band"></div>
</div>`,
  },
  {
    id: "ui/center-phone-hero-type@v1",
    name: "居中机型压底巨字",
    group: "phone",
    scene: "iphone",
    brief: "一台手机居中压在巨型品牌字上，左下角大标题与右上毛玻璃导航，底部渐隐压边，适合产品发布/设计系统封面",
    skeleton: `<div class="ui-hero" style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);color:var(--text)">
<style>
.ui-hero{font-family:var(--font-sans)}
.ui-glow{position:absolute;border-radius:50%;pointer-events:none}
.g1{left:-160px;top:-340px;width:1400px;height:1400px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 60%,transparent) 0%,transparent 68%);opacity:.20}
.g2{left:840px;top:480px;width:1040px;height:1040px;background:radial-gradient(circle,color-mix(in srgb,var(--brand) 55%,transparent) 0%,transparent 70%);opacity:.18}
.g3{left:1180px;top:-260px;width:920px;height:920px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 45%,transparent) 0%,transparent 72%);opacity:.14}
.ui-word{position:absolute;left:56px;top:352px;z-index:1;font-family:var(--font-display);font-size:250px;font-weight:900;letter-spacing:-.045em;line-height:.88;color:var(--text);opacity:.10;white-space:nowrap;text-transform:uppercase}
.ui-fade{position:absolute;left:0;right:0;bottom:0;height:440px;z-index:7;background:linear-gradient(to top,var(--bg) 0%,color-mix(in srgb,var(--bg) 72%,transparent) 46%,transparent 100%)}
.ui-glass{background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent)}
.ui-brand{position:absolute;left:110px;top:70px;z-index:9;display:flex;align-items:center;gap:16px}
.ui-brand-mark{width:26px;height:26px;border-radius:7px;background:var(--accent)}
.ui-brand-name{font-size:20px;font-weight:700;letter-spacing:.34em;text-transform:uppercase}
.ui-nav{position:absolute;right:110px;top:64px;z-index:9;display:flex;align-items:center;height:62px;border-radius:999px;padding:0 10px}
.ui-nav-item{font-size:14px;font-weight:600;letter-spacing:.24em;text-transform:uppercase;color:var(--muted);padding:0 22px}
.ui-nav-item.on{color:var(--text)}
.ui-chip{position:absolute;left:392px;top:318px;z-index:6;display:flex;align-items:center;gap:14px;height:66px;padding:0 34px;border-radius:999px}
.ui-chip-dot{width:10px;height:10px;border-radius:50%;background:var(--accent)}
.ui-chip-text{font-size:16px;font-weight:600;letter-spacing:.3em;text-transform:uppercase}
.ui-badge{position:absolute;left:440px;top:452px;z-index:6;width:88px;height:88px;border-radius:50%;background:var(--accent);display:flex;align-items:center;justify-content:center}
.ui-badge-core{width:18px;height:18px;border-radius:4px;background:var(--bg);transform:rotate(45deg)}
.ui-copy{position:absolute;left:110px;bottom:92px;z-index:9}
.ui-kicker{font-size:17px;font-weight:600;letter-spacing:.42em;text-transform:uppercase;color:var(--muted);margin-bottom:28px}
.ui-title{font-family:var(--font-display);font-size:132px;font-weight:900;line-height:.96;letter-spacing:-.035em;color:var(--accent);margin:0}
.ui-title span{display:block}
.ui-amp{opacity:.55}
.ui-meta{position:absolute;right:110px;bottom:112px;z-index:9;max-width:420px;text-align:right}
.ui-meta-line{font-size:18px;font-weight:300;line-height:1.6;color:var(--muted);margin:0 0 26px 0}
.ui-meta-item{font-size:17px;font-weight:600;letter-spacing:.3em;text-transform:uppercase;color:var(--muted);line-height:2.1}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-296.1px;top:-187.2px;width:900px;height:1200px;transform:scale(1.36606);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style>
<div class="ui-glow g1"></div>
<div class="ui-glow g2"></div>
<div class="ui-glow g3"></div>
<div class="ui-word">Medialo</div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:480px;top:-150px;width:640px;height:1280px;z-index:4"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="ui-chip ui-glass"><span class="ui-chip-dot"></span><span class="ui-chip-text">AI Portrait Generator</span></div>
<div class="ui-badge"><div class="ui-badge-core"></div></div>
<div class="ui-fade"></div>
<div class="ui-brand"><div class="ui-brand-mark"></div><div class="ui-brand-name">Medialo</div></div>
<div class="ui-nav ui-glass"><div class="ui-nav-item on">Overview</div><div class="ui-nav-item">Screens</div><div class="ui-nav-item">Buy Kit</div></div>
<div class="ui-copy"><div class="ui-kicker">V2.4 / Design System</div><h1 class="ui-title"><span>Typography</span><span class="ui-amp">&amp; Colors</span></h1></div>
<div class="ui-meta"><p class="ui-meta-line">Every type ramp, token and color pair — documented, named and ready to drop into your next build.</p><div class="ui-meta-item">30+ Screens</div><div class="ui-meta-item">Dark Mode Ready</div></div>
</div>`,
  },
  {
    id: "ui/center-phone-glass-card@v1",
    name: "中置机右浮卡",
    group: "phone",
    scene: "iphone",
    brief: "手机居中偏左、机身大半压着背景巨字，左上大标题、右上说明，右侧一块毛玻璃卡片贴着机身写功能点，适合单屏 App 界面展示。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden">
<style>
.glow-a{position:absolute;left:300px;top:-220px;width:1400px;height:1400px;background:radial-gradient(circle at 50% 50%,color-mix(in srgb,var(--accent) 22%,transparent) 0%,transparent 68%);opacity:.7;z-index:0}
.glow-b{position:absolute;left:1180px;top:300px;width:1000px;height:1000px;background:radial-gradient(circle at 50% 50%,color-mix(in srgb,var(--brand) 26%,transparent) 0%,transparent 70%);opacity:.55;z-index:0}
.glow-c{position:absolute;left:420px;top:640px;width:900px;height:700px;background:radial-gradient(circle at 50% 50%,color-mix(in srgb,var(--accent) 34%,transparent) 0%,transparent 72%);opacity:.35;z-index:2}
.ghost{position:absolute;left:110px;top:556px;font-family:var(--font-display);font-size:238px;font-weight:900;letter-spacing:-.045em;line-height:.9;text-transform:uppercase;color:var(--text);opacity:.11;white-space:nowrap;z-index:1}
.kicker{position:absolute;left:124px;top:96px;font-size:15px;font-weight:500;letter-spacing:.44em;text-transform:uppercase;color:var(--muted);z-index:5}
.title{position:absolute;left:116px;top:132px;width:1000px;font-family:var(--font-display);font-size:150px;font-weight:300;letter-spacing:-.035em;line-height:.94;color:var(--text);z-index:5}
.lede{position:absolute;left:1250px;top:158px;width:530px;font-size:20px;font-weight:300;line-height:1.68;color:var(--muted);z-index:5}
.panel{position:absolute;left:1030px;top:520px;width:610px;height:300px;box-sizing:border-box;padding:42px 46px;border-radius:34px;background:color-mix(in srgb,var(--surface) 52%,transparent);backdrop-filter:blur(24px);border:1px solid color-mix(in srgb,var(--border) 62%,transparent);box-shadow:0 40px 90px color-mix(in srgb,var(--bg) 70%,transparent);z-index:4}
.panel h2{margin:0 0 16px;font-size:36px;font-weight:500;letter-spacing:-.015em;line-height:1.14;color:var(--text)}
.panel p{margin:0;font-size:18px;font-weight:300;line-height:1.62;color:var(--muted)}
.chip{position:absolute;left:498px;top:398px;padding:14px 28px;border-radius:999px;background:color-mix(in srgb,var(--surface) 60%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);font-size:14px;font-weight:500;letter-spacing:.3em;text-transform:uppercase;color:var(--text);white-space:nowrap;z-index:5}
.chip-alt{position:absolute;left:560px;top:756px;padding:13px 26px;border-radius:999px;background:color-mix(in srgb,var(--surface) 48%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 64%,transparent);font-size:13px;font-weight:400;letter-spacing:.24em;text-transform:uppercase;color:var(--muted);white-space:nowrap;z-index:5}
.fade{position:absolute;left:0;bottom:0;width:1920px;height:260px;background:linear-gradient(180deg,transparent 0%,color-mix(in srgb,var(--bg) 88%,transparent) 62%,var(--bg) 100%);z-index:6}
.meta-l{position:absolute;left:120px;top:948px;font-size:14px;font-weight:500;letter-spacing:.34em;text-transform:uppercase;color:var(--muted);z-index:7}
.meta-r{position:absolute;left:1440px;top:948px;width:360px;text-align:right;font-size:14px;font-weight:500;letter-spacing:.34em;text-transform:uppercase;color:var(--muted);z-index:7}
.rule{position:absolute;left:120px;top:1000px;width:1680px;height:1px;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--border) 90%,transparent) 18%,color-mix(in srgb,var(--border) 90%,transparent) 82%,transparent);z-index:7}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-199.9px;top:-126.3px;width:900px;height:1200px;transform:scale(0.92209);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style>
<div class="glow-a"></div>
<div class="glow-b"></div>
<div class="ghost">INVENTORY</div>
<div class="glow-c"></div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:660px;top:116px;width:432px;height:864px;z-index:3"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="chip">Real-time stock</div>
<div class="chip-alt">Syncs every 30s</div>
<div class="panel">
<h2>Effortless Inventory Control</h2>
<p>Gain instant insight into stock levels across every warehouse, so nothing goes oversold and nothing sits idle.</p>
</div>
<p class="kicker">V2.4 / Mobile App</p>
<h1 class="title">Mobile App</h1>
<p class="lede">A pocket console for warehouse teams: scan a shelf, log the count, and the dashboard updates before you walk to the next aisle.</p>
<div class="fade"></div>
<p class="meta-l">01 — Inventory Console</p>
<p class="meta-r">iOS 17 / 30+ Screens</p>
<div class="rule"></div>
</div>`,
  },
  {
    id: "ui/dual-phone-panel-right@v1",
    name: "左双机右面板",
    group: "phone",
    scene: "iphone",
    brief: "左侧两台手机错落叠放、右侧一块圆角色板托住一排毛玻璃标签与第三台手机，适合展示成套 App 界面。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden">
<style>
.glow{position:absolute;border-radius:50%;filter:blur(90px);pointer-events:none;z-index:0}
.g1{left:90px;top:-160px;width:880px;height:880px;background:radial-gradient(circle,var(--accent),transparent 68%);opacity:.22}
.g2{right:-200px;bottom:-260px;width:960px;height:960px;background:radial-gradient(circle,var(--accent),transparent 70%);opacity:.18}
.g3{left:460px;top:380px;width:680px;height:680px;background:radial-gradient(circle,var(--brand),transparent 72%);opacity:.15}
.ghost{position:absolute;left:40px;top:880px;font-family:var(--font-display);font-weight:900;font-size:190px;line-height:.92;letter-spacing:-.04em;color:var(--text);opacity:.11;white-space:nowrap;z-index:1}
.panel{position:absolute;left:930px;top:30px;width:960px;height:1020px;border-radius:56px;background:color-mix(in srgb,var(--accent) 74%,transparent);backdrop-filter:blur(26px);border:1px solid color-mix(in srgb,var(--border) 55%,transparent);z-index:2}
.kicker{position:absolute;left:74px;top:36px;margin:0;font-size:17px;font-weight:600;letter-spacing:.44em;text-transform:uppercase;color:var(--muted);z-index:6}
.lede{position:absolute;left:74px;top:70px;width:520px;margin:0;font-size:19px;font-weight:300;line-height:1.6;color:var(--muted);z-index:6}
.chip{position:absolute;box-sizing:border-box;display:flex;align-items:center;gap:16px;height:74px;padding:0 28px;border-radius:999px;background:color-mix(in srgb,var(--surface) 76%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);color:var(--text);font-size:26px;font-weight:700;letter-spacing:-.01em;white-space:nowrap;z-index:6}
.mark{width:24px;height:24px;border-radius:7px;background:var(--accent);flex:none}
.dot{width:15px;height:15px;border-radius:50%;background:var(--brand);flex:none}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-175.8px;top:-111.1px;width:900px;height:1200px;transform:scale(0.81110);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}*{pointer-events:none}.ui-dev-2,.ui-dev-2 *{pointer-events:auto}.ui-stage-2{position:absolute;left:-157.3px;top:-99.4px;width:900px;height:1200px;transform:scale(0.72572);transform-origin:top left}.ui-screen-2{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-2 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-2:hover .ui-screen-2{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-2{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-2:hover .ui-shell-2{background-position:0 -7496px}.ui-dev-2{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-2:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-2,.ui-screen-2,.ui-shell-2{transition:none}}*{pointer-events:none}.ui-dev-3,.ui-dev-3 *{pointer-events:auto}.ui-stage-3{position:absolute;left:-175.4px;top:-114.0px;width:900px;height:1200px;transform:scale(0.83244);transform-origin:top left}.ui-screen-3{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-3 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-3:hover .ui-screen-3{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-3{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-3:hover .ui-shell-3{background-position:0 -7496px}.ui-dev-3{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-3:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-3,.ui-screen-3,.ui-shell-3{transition:none}}</style>
<div class="glow g1"></div>
<div class="glow g2"></div>
<div class="glow g3"></div>
<div class="ghost">MOODMORPHER</div>
<div class="panel"></div>
<p class="kicker">UI Kit / 40+ Screens</p>
<p class="lede">Drag a component onto the canvas and it snaps to the grid. Every screen ships with dark mode, motion presets and a live preview.</p>
<div class="chip" style="left:980px;top:78px;width:430px"><span class="mark"></span>Components Included</div>
<div class="chip" style="left:1430px;top:78px;width:380px"><span class="dot"></span>Fully Customizable</div>
<div class="chip" style="left:980px;top:170px;width:430px"><span class="mark"></span>40+ Premium Screens</div>
<div class="chip" style="left:1430px;top:170px;width:250px"><span class="dot"></span>Free Font</div>
<div class="chip" style="left:960px;top:262px;width:210px"><span class="mark"></span>UI Kit</div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:70px;top:140px;width:380px;height:760px;z-index:4"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="ui-dev ui-dev-2" style="position:absolute;left:400px;top:340px;width:340px;height:680px;z-index:5"><div class="ui-stage ui-stage-2"><div class="ui-screen ui-screen-2"><img data-lumen-image="2"></div><div class="ui-shell ui-shell-2"></div></div></div></div>
<div class="ui-dev ui-dev-3" style="position:absolute;left:1180px;top:250px;width:400px;height:780px;z-index:4"><div class="ui-stage ui-stage-3"><div class="ui-screen ui-screen-3"><img data-lumen-image="3"></div><div class="ui-shell ui-shell-3"></div></div></div></div>
</div>`,
  },
  {
    id: "ui/centered-phone-left-copy@v1",
    name: "中置手机左文",
    group: "phone",
    scene: "iphone",
    brief: "手机竖屏居中顶天立地，左侧标题与短句、右侧品牌和毛玻璃数据卡，背后压着巨大的品牌字与冷暖两团光晕，适合移动端 App 首页或金融产品展示。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.glow{position:absolute;pointer-events:none;z-index:0}
.glow-a{left:-340px;top:-420px;width:1260px;height:1140px;background:radial-gradient(circle at 45% 45%,var(--accent),transparent 66%);opacity:.22}
.glow-b{right:-280px;top:-80px;width:1200px;height:1260px;background:radial-gradient(circle at 50% 50%,var(--brand),transparent 64%);opacity:.25}
.glow-c{left:500px;bottom:-420px;width:1040px;height:920px;background:radial-gradient(circle at 50% 50%,var(--accent),transparent 68%);opacity:.14}
.bigword{position:absolute;z-index:1;font-family:var(--font-display);font-weight:900;font-size:330px;line-height:.82;letter-spacing:-.045em;text-transform:uppercase;color:var(--text);opacity:.13;white-space:nowrap}
.bigword-l{left:-50px;top:392px}
.bigword-r{right:-60px;top:468px}
.fade{position:absolute;left:0;right:0;bottom:0;height:280px;z-index:2;pointer-events:none;background:linear-gradient(to top,var(--bg),color-mix(in srgb,var(--bg) 55%,transparent),transparent)}
.head{position:absolute;left:92px;top:94px;width:560px;z-index:4}
.kicker{margin:0 0 26px;font-size:15px;font-weight:500;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.title{margin:0;font-size:60px;font-weight:700;line-height:1.12;letter-spacing:-.028em;color:var(--text)}
.sub{margin:34px 0 0;width:470px;font-size:19px;font-weight:300;line-height:1.62;color:var(--muted)}
.pills{position:absolute;left:92px;top:636px;display:flex;gap:14px;z-index:4}
.pill{display:flex;align-items:center;gap:11px;padding:13px 24px;border-radius:999px;font-size:15px;font-weight:500;color:var(--text);background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--accent)}
.chip{position:absolute;z-index:5;border-radius:24px;background:color-mix(in srgb,var(--surface) 58%,transparent);backdrop-filter:blur(20px);border:1px solid color-mix(in srgb,var(--border) 66%,transparent)}
.chip-insight{left:452px;top:752px;width:430px;padding:22px 26px}
.chip-title{margin:0 0 8px;font-size:19px;font-weight:600;letter-spacing:-.01em;color:var(--text)}
.chip-text{margin:0;font-size:15px;font-weight:300;line-height:1.55;color:var(--muted)}
.tag{position:absolute;z-index:5;left:1262px;top:264px;display:flex;align-items:center;gap:10px;padding:12px 22px;border-radius:999px;font-size:14px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--text);background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent)}
.brand{position:absolute;right:94px;top:72px;z-index:5;display:flex;align-items:center;gap:12px}
.brand-mark{position:relative;width:22px;height:22px;border:2px solid var(--text);border-radius:7px;display:flex;align-items:center;justify-content:center}
.brand-mark span{display:block;width:7px;height:7px;border-radius:2px;background:var(--accent)}
.brand-name{font-size:27px;font-weight:600;letter-spacing:-.015em;color:var(--text)}
.panel{position:absolute;right:94px;bottom:86px;width:368px;z-index:5;padding:26px 30px;border-radius:26px;background:color-mix(in srgb,var(--surface) 55%,transparent);backdrop-filter:blur(22px);border:1px solid color-mix(in srgb,var(--border) 66%,transparent)}
.panel-k{margin:0;font-size:13px;font-weight:500;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)}
.panel-v{margin:12px 0 0;font-family:var(--font-display);font-size:46px;font-weight:800;line-height:1;letter-spacing:-.03em;color:var(--text)}
.panel-n{margin:12px 0 0;font-size:15px;font-weight:400;letter-spacing:.01em;color:var(--accent)}
.foot{position:absolute;left:92px;bottom:88px;z-index:5;font-size:13px;font-weight:500;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-259.1px;top:-163.8px;width:900px;height:1200px;transform:scale(1.19530);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style>
<div class="glow glow-a"></div>
<div class="glow glow-b"></div>
<div class="glow glow-c"></div>
<div class="bigword bigword-l">FI</div>
<div class="bigword bigword-r">NA</div>
<div class="fade"></div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:680px;top:30px;width:560px;height:1120px;z-index:3"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="head">
<p class="kicker">V3.0 / Finance OS</p>
<h1 class="title">Smarter Finance, Always Powered by Intelligence.</h1>
<p class="sub">Track balances, cards and portfolio in one live view. Every transfer, subscription and insight syncs the moment it clears.</p>
</div>
<div class="pills">
<div class="pill"><span class="dot"></span>Real-Time Sync</div>
<div class="pill"><span class="dot"></span>Bank-Level Security</div>
</div>
<div class="chip chip-insight">
<h3 class="chip-title">Smart Insights</h3>
<p class="chip-text">Spending patterns are grouped the moment a card is used, no manual tagging.</p>
</div>
<div class="tag"><span class="dot"></span>Auto-Savings On</div>
<div class="brand">
<div class="brand-mark"><span></span></div>
<div class="brand-name">Finora</div>
</div>
<div class="panel">
<p class="panel-k">Live Balance</p>
<p class="panel-v">$12,450.75</p>
<p class="panel-n">+8.78% this month</p>
</div>
<p class="foot">Finora Mobile / iOS 18</p>
</div>`,
  },
  {
    id: "ui/dual-phone-right-copy@v1",
    name: "左双机右文案",
    group: "phone",
    scene: "iphone",
    brief: "两台手机错落叠放在画面左中部，右侧竖排职位标题、标签胶囊与报价卡片，底部压一行巨字，适合展示双屏 App 界面。",
    skeleton: `<div style="position:relative;width:1920px;height:1080px;background:var(--bg);overflow:hidden;font-family:var(--font-sans)">
<style>
.gw{position:absolute;font-family:var(--font-display);font-size:220px;font-weight:900;letter-spacing:-.045em;line-height:.9;white-space:nowrap;color:var(--text);opacity:.11;z-index:1}
.glow{position:absolute;border-radius:50%;filter:blur(52px);pointer-events:none}
.chip{background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);border-radius:999px;color:var(--text)}
.card{background:color-mix(in srgb,var(--surface) 58%,transparent);backdrop-filter:blur(24px);border:1px solid color-mix(in srgb,var(--border) 60%,transparent);border-radius:30px}
.kicker{font-size:15px;font-weight:600;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.lbl{margin-top:8px;font-size:14px;font-weight:500;letter-spacing:.22em;text-transform:uppercase;color:var(--muted)}
.btn{background:var(--text);color:var(--bg);border-radius:999px;text-align:center;font-size:19px;font-weight:600}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-202.4px;top:-137.4px;width:900px;height:1200px;transform:scale(1.00320);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}*{pointer-events:none}.ui-dev-2,.ui-dev-2 *{pointer-events:auto}.ui-stage-2{position:absolute;left:-188.9px;top:-125.7px;width:900px;height:1200px;transform:scale(0.91782);transform-origin:top left}.ui-screen-2{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-2 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-2:hover .ui-screen-2{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-2{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-2:hover .ui-shell-2{background-position:0 -7496px}.ui-dev-2{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-2:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-2,.ui-screen-2,.ui-shell-2{transition:none}}</style>
<div class="glow" style="left:-200px;top:-240px;width:1200px;height:1200px;background:radial-gradient(circle,var(--accent) 0%,transparent 68%);opacity:.18"></div>
<div class="glow" style="left:820px;top:420px;width:1400px;height:1000px;background:radial-gradient(circle,var(--brand) 0%,transparent 70%);opacity:.15"></div>
<div class="glow" style="left:420px;top:-300px;width:900px;height:820px;background:radial-gradient(circle,var(--accent) 0%,transparent 72%);opacity:.1"></div>
<div class="gw" style="left:660px;top:788px">PORTFOLIO</div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:130px;top:86px;width:500px;height:940px;z-index:3"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="ui-dev ui-dev-2" style="position:absolute;left:620px;top:196px;width:450px;height:860px;z-index:2"><div class="ui-stage ui-stage-2"><div class="ui-screen ui-screen-2"><img data-lumen-image="2"></div><div class="ui-shell ui-shell-2"></div></div></div></div>
<div style="position:absolute;left:130px;top:30px;z-index:5;display:flex;align-items:center;gap:14px">
<div style="width:16px;height:16px;background:var(--accent);border-radius:4px"></div>
<span class="kicker">Folio · Mobile App Kit</span>
</div>
<div style="position:absolute;left:1180px;top:92px;width:640px;z-index:4;display:flex;flex-direction:column;gap:26px">
<div class="kicker">Top rated · Freelance</div>
<h1 style="margin:0;font-size:80px;font-weight:800;letter-spacing:-.035em;line-height:1;color:var(--text)">Logo Designer</h1>
<p style="margin:0;font-size:21px;font-weight:300;line-height:1.55;color:var(--muted)">TechCorp Inc. · Posted 23 minutes ago</p>
<div style="display:flex;gap:14px">
<div class="chip" style="padding:13px 28px;font-size:17px;font-weight:600">Freelance</div>
<div class="chip" style="padding:13px 28px;font-size:17px;font-weight:600">Remote</div>
</div>
<div style="display:flex;gap:16px;align-items:center">
<div class="btn" style="flex:1;padding:22px 0">Apply Now</div>
<div class="chip" style="width:68px;height:68px;display:flex;align-items:center;justify-content:center">
<div style="width:20px;height:20px;border:2px solid var(--text);border-radius:5px"></div>
</div>
</div>
<div class="card" style="padding:30px 36px;display:flex;gap:60px">
<div>
<div style="font-size:36px;font-weight:800;letter-spacing:-.02em;color:var(--text)">$150–300</div>
<div class="lbl">Fixed budget</div>
</div>
<div>
<div style="font-size:36px;font-weight:800;letter-spacing:-.02em;color:var(--text)">5–7 days</div>
<div class="lbl">Deadline</div>
</div>
</div>
</div>
<div style="position:absolute;left:22px;top:648px;width:96px;height:96px;border-radius:50%;background:var(--text);z-index:5;display:flex;align-items:center;justify-content:center">
<div style="width:34px;height:4px;background:var(--bg);border-radius:2px"></div>
</div>
<div class="chip" style="position:absolute;left:70px;top:676px;padding:18px 34px;font-size:20px;font-weight:600;z-index:5">Services</div>
<div class="chip" style="position:absolute;left:34px;top:796px;padding:18px 34px;font-size:20px;font-weight:600;z-index:5">Budget</div>
<div class="chip" style="position:absolute;left:74px;top:916px;padding:18px 34px;font-size:20px;font-weight:600;z-index:5">Remote work</div>
<div class="card" style="position:absolute;left:1180px;top:756px;width:620px;padding:34px 38px;z-index:4">
<div style="font-size:40px;font-weight:800;letter-spacing:-.03em;color:var(--text)">$120/hour</div>
<p style="margin:14px 0 0;font-size:18px;font-weight:300;line-height:1.6;color:var(--muted)">Send one brief and get three logo directions back within 48 hours, plus a full brand sheet.</p>
<div style="margin-top:26px;display:flex;gap:58px">
<div>
<div style="font-size:32px;font-weight:800;color:var(--text)">$25K+</div>
<div class="lbl">Earned</div>
</div>
<div>
<div style="font-size:32px;font-weight:800;color:var(--text)">4x</div>
<div class="lbl">Hired</div>
</div>
</div>
</div>
</div>`,
  },
  {
    id: "ui/centered-laptop-bigword@v1",
    name: "居机压字",
    group: "laptop",
    scene: "macbook",
    brief: "一台笔记本居中偏右压在巨型品牌字上，左上栏目与右上两行标题对称收边，左中浮一枚毛玻璃胶囊，底部一条大圆角模糊带兜底。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden">
<style>
.veil{position:absolute;left:0;top:0;width:1920px;height:1080px;background:linear-gradient(155deg,color-mix(in srgb,var(--surface) 46%,transparent) 0%,transparent 58%);opacity:.55;z-index:1}
.glow{position:absolute;border-radius:50%;pointer-events:none;z-index:1}
.glow-a{left:-240px;top:-300px;width:1280px;height:1280px;background:radial-gradient(circle,var(--accent) 0%,transparent 66%);opacity:.20}
.glow-b{right:-260px;bottom:-360px;width:1200px;height:1200px;background:radial-gradient(circle,var(--brand) 0%,transparent 68%);opacity:.16}
.glow-c{left:480px;top:120px;width:1200px;height:760px;background:radial-gradient(ellipse at center,var(--accent) 0%,transparent 70%);opacity:.13}
.bigword{position:absolute;left:0;top:242px;width:1920px;text-align:center;font-family:var(--font-display);font-size:268px;line-height:.88;font-weight:900;letter-spacing:-.04em;color:var(--text);opacity:.12;white-space:nowrap;z-index:1}
.floor{position:absolute;left:340px;bottom:110px;width:1280px;height:240px;border-radius:50%;background:radial-gradient(ellipse at center,var(--text) 0%,transparent 70%);opacity:.07;z-index:2}
.kicker{position:absolute;left:120px;top:76px;font-size:19px;font-weight:500;letter-spacing:.44em;text-transform:uppercase;color:var(--muted);z-index:6}
.head-r{position:absolute;right:118px;top:66px;text-align:right;font-size:27px;line-height:1.34;font-weight:600;letter-spacing:.01em;color:var(--text);z-index:6}
.chip{position:absolute;left:336px;top:534px;display:flex;align-items:center;gap:16px;padding:19px 36px;border-radius:999px;background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);color:var(--text);font-size:24px;font-weight:600;letter-spacing:.02em;z-index:6}
.cursor{width:22px;height:22px;background:var(--text);clip-path:polygon(0 0,100% 40%,44% 55%,33% 100%);opacity:.92}
.band{position:absolute;left:56px;right:56px;bottom:-70px;height:220px;border-radius:104px 104px 0 0;background:linear-gradient(180deg,color-mix(in srgb,var(--surface) 58%,transparent) 0%,transparent 100%);backdrop-filter:blur(26px);border:1px solid color-mix(in srgb,var(--border) 52%,transparent);z-index:5}
.band-row{position:absolute;left:130px;right:130px;bottom:96px;display:flex;justify-content:space-between;align-items:flex-end;z-index:6}
.band-note{font-size:16px;font-weight:300;letter-spacing:.30em;text-transform:uppercase;color:var(--muted);line-height:1.9}
.band-tags{display:flex;gap:14px}
.pill{padding:12px 26px;border-radius:999px;background:color-mix(in srgb,var(--surface) 58%,transparent);backdrop-filter:blur(16px);border:1px solid color-mix(in srgb,var(--border) 66%,transparent);font-size:15px;font-weight:500;letter-spacing:.20em;text-transform:uppercase;color:var(--text)}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-66.1px;top:-510.8px;width:900px;height:1200px;transform:scale(1.38067);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:1781px;height:1160px;border-radius:22px;transform-origin:0 0;transform:matrix3d(0.239938370715, 0, 0, 0, 0.00809028390427, 0.24721112368, 0, 0.0000179784086762, 0, 0, 1, 0, 236.334880878, 392.445244317, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(0.243588265607, -0.0189874180754, 0, 0.0000423329434676, 0.0428811627876, 0.250520632593, 0, 0.0000102890315318, 0, 0, 1, 0, 165.531703242, 444.86698085, 0, 1)}.ui-shell-1{position:absolute;left:156px;top:370px;width:595px;height:507px;background-image:url(/stock/devices/macbook-turn.webp);background-repeat:no-repeat;background-size:595px 4563px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -4056px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style>
<div class="veil"></div>
<div class="glow glow-a"></div>
<div class="glow glow-b"></div>
<div class="glow glow-c"></div>
<div class="bigword">TrackNest</div>
<div class="floor"></div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:560px;top:200px;width:1120px;height:700px;z-index:3"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="band"></div>
<p class="kicker">Web Design / Case 04</p>
<h2 class="head-r">Finance Consultation<br>&amp; Money Management</h2>
<div class="chip"><span>Samyak</span><span class="cursor"></span></div>
<div class="band-row">
<p class="band-note">TrackNest — personal finance dashboard<br>Built for web and mobile in one system</p>
<div class="band-tags"><span class="pill">30+ Screens</span><span class="pill">Dark Mode</span><span class="pill">Fully Customizable</span></div>
</div>
</div>`,
  },
  {
    id: "ui/dual-phone-diagonal@v1",
    name: "双机对角错落",
    group: "phone",
    scene: "iphone",
    brief: "两台手机沿对角线错落排在画面中央，左上与右下各压一块毛玻璃说明卡，背后有大字与光晕，适合展示同一 App 的两个界面步骤。",
    skeleton: `<style>
.page{width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden}
.glow{position:absolute;border-radius:50%;pointer-events:none;z-index:0}
.glow-a{left:680px;top:-240px;width:1240px;height:1240px;background:radial-gradient(circle,var(--accent),transparent 68%);opacity:.20}
.glow-b{left:-180px;top:500px;width:940px;height:940px;background:radial-gradient(circle,var(--brand),transparent 70%);opacity:.14}
.glow-c{left:1180px;top:560px;width:820px;height:820px;background:radial-gradient(circle,var(--accent),transparent 72%);opacity:.12}
.bigword{position:absolute;left:410px;top:398px;font-size:224px;font-weight:900;letter-spacing:-.045em;line-height:.92;text-transform:uppercase;color:var(--text);opacity:.11;white-space:nowrap;z-index:1}
.bottomfade{position:absolute;left:0;right:0;bottom:0;height:270px;background:linear-gradient(to top,var(--bg),transparent);z-index:2;pointer-events:none}
.ui-dev-slot{z-index:3}
.cap{position:absolute;z-index:4;padding:30px 34px;border-radius:22px;background:color-mix(in srgb,var(--surface) 60%,transparent);backdrop-filter:blur(20px);border:1px solid color-mix(in srgb,var(--border) 65%,transparent)}
.cap .kick{margin:0 0 14px;font-size:14px;font-weight:500;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.cap h3{margin:0 0 12px;font-size:38px;font-weight:800;letter-spacing:-.02em;line-height:1.05;color:var(--text)}
.cap p{margin:0;font-size:19px;font-weight:300;line-height:1.62;color:var(--muted)}
.cap-a{left:118px;top:92px;width:424px}
.cap-b{right:122px;bottom:78px;width:404px}
.pillrow{position:absolute;left:118px;bottom:118px;display:flex;gap:14px;z-index:4}
.pill{padding:15px 28px;border-radius:999px;background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);font-size:15px;font-weight:500;letter-spacing:.28em;text-transform:uppercase;color:var(--text)}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-186.9px;top:-118.1px;width:900px;height:1200px;transform:scale(0.86233);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}*{pointer-events:none}.ui-dev-2,.ui-dev-2 *{pointer-events:auto}.ui-stage-2{position:absolute;left:-198.9px;top:-125.7px;width:900px;height:1200px;transform:scale(0.91782);transform-origin:top left}.ui-screen-2{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-2 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-2:hover .ui-screen-2{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-2{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-2:hover .ui-shell-2{background-position:0 -7496px}.ui-dev-2{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-2:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-2,.ui-screen-2,.ui-shell-2{transition:none}}</style>
<div class="page">
<div class="glow glow-a"></div>
<div class="glow glow-b"></div>
<div class="glow glow-c"></div>
<div class="bigword">Spending</div>
<div class="bottomfade"></div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:1150px;top:18px;width:404px;height:808px"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="ui-dev ui-dev-2" style="position:absolute;left:542px;top:188px;width:430px;height:860px"><div class="ui-stage ui-stage-2"><div class="ui-screen ui-screen-2"><img data-lumen-image="2"></div><div class="ui-shell ui-shell-2"></div></div></div></div>
<div class="cap cap-a">
<p class="kick">10 / Insights</p>
<h3>Insights Screen</h3>
<p>Spending and income are charted by category, so users can spot where the money actually goes each month.</p>
</div>
<div class="cap cap-b">
<p class="kick">11 / Scan</p>
<h3>Scan Screen</h3>
<p>Scan a merchant QR code to pay in one tap, with no card details typed or stored on the device.</p>
</div>
<div class="pillrow">
<span class="pill">30+ Screens</span>
<span class="pill">Dark Mode</span>
</div>
</div>`,
  },
  {
    id: "ui/left-copy-dual-phone@v1",
    name: "左文右双机",
    group: "phone",
    scene: "iphone",
    brief: "左侧大标题与毛玻璃说明卡、右侧两台前后错落的手机压在巨大幽灵字上，适合 App 发布页与移动端界面展示。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);color:var(--text)">
<style>
.glow-a{position:absolute;left:-240px;top:-320px;width:1000px;height:1000px;border-radius:50%;background:radial-gradient(circle,var(--accent) 0%,transparent 68%);opacity:.24}
.glow-b{position:absolute;right:-260px;top:-240px;width:1100px;height:920px;border-radius:50%;background:radial-gradient(circle,var(--brand) 0%,transparent 70%);opacity:.20}
.glow-c{position:absolute;left:820px;top:520px;width:1040px;height:780px;border-radius:50%;background:radial-gradient(circle,var(--accent) 0%,transparent 72%);opacity:.15}
.frame{position:absolute;left:790px;top:90px;width:1050px;height:850px;border:1px solid var(--border);border-radius:56px;opacity:.6;z-index:1}
.bigword{position:absolute;left:860px;top:596px;font-family:var(--font-display);font-size:236px;font-weight:900;line-height:.9;letter-spacing:-.04em;text-transform:uppercase;color:var(--text);opacity:.10;white-space:nowrap;z-index:1}
.note{position:absolute;left:110px;top:120px;width:380px;padding:28px 30px;border-radius:28px;background:color-mix(in srgb,var(--surface) 60%,transparent);backdrop-filter:blur(20px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);z-index:5}
.bar{width:46px;height:4px;border-radius:2px;background:var(--accent);margin-bottom:16px}
.note h3{margin:0 0 10px;font-size:26px;font-weight:700;line-height:1.25}
.note p{margin:0;font-size:15px;font-weight:400;line-height:1.65;color:var(--muted)}
.kicker{position:absolute;left:110px;top:368px;font-size:15px;font-weight:500;letter-spacing:.42em;text-transform:uppercase;color:var(--muted);z-index:3}
.head{position:absolute;left:110px;top:410px;width:790px;margin:0;font-family:var(--font-display);font-size:74px;font-weight:900;line-height:1.02;letter-spacing:-.03em;z-index:3}
.sub{position:absolute;left:110px;top:692px;width:730px;margin:0;font-size:19px;font-weight:400;line-height:1.6;color:var(--muted);z-index:3}
.chip{position:absolute;display:flex;align-items:center;gap:12px;padding:14px 24px;border-radius:999px;background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);font-size:17px;font-weight:500;white-space:nowrap;z-index:5}
.chip-a{left:640px;top:430px}
.chip-b{left:1560px;top:700px}
.pip{width:9px;height:9px;border-radius:50%;background:var(--accent)}
.sphere{position:absolute;left:1650px;top:186px;width:112px;height:112px;border-radius:50%;background:radial-gradient(circle at 34% 30%,var(--accent),var(--brand));opacity:.85;z-index:2}
.node{position:absolute;width:14px;height:14px;border:1px solid var(--muted);border-radius:4px;opacity:.6;z-index:2}
.node-a{left:782px;top:236px}
.node-b{left:1826px;top:440px}
.plus{position:absolute;width:26px;height:26px;border-radius:7px;background:var(--accent);opacity:.45;z-index:2}
.plus-a{left:1706px;top:112px}
.plus-b{left:600px;top:790px}
.band{position:absolute;left:0;top:960px;width:1920px;height:120px;background:linear-gradient(180deg,transparent,var(--bg));z-index:4}
.footline{position:absolute;left:110px;top:952px;width:1700px;display:flex;align-items:center;gap:26px;z-index:6}
.avatar{display:flex;align-items:center;justify-content:center;width:62px;height:62px;border-radius:50%;border:1px solid color-mix(in srgb,var(--border) 80%,transparent);background:color-mix(in srgb,var(--surface) 55%,transparent);backdrop-filter:blur(14px)}
.dotmark{width:16px;height:16px;border-radius:4px;background:var(--accent);transform:rotate(45deg)}
.sig{margin:0;font-family:var(--font-script);font-size:30px;font-weight:400;flex:1}
.cta{margin-left:auto;padding:20px 38px;border-radius:999px;background:var(--accent);color:var(--bg);font-size:19px;font-weight:600;letter-spacing:.01em;white-space:nowrap}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-185.1px;top:-117.0px;width:900px;height:1200px;transform:scale(0.85379);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}*{pointer-events:none}.ui-dev-2,.ui-dev-2 *{pointer-events:auto}.ui-stage-2{position:absolute;left:-185.1px;top:-117.0px;width:900px;height:1200px;transform:scale(0.85379);transform-origin:top left}.ui-screen-2{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-2 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-2:hover .ui-screen-2{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-2{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-2:hover .ui-shell-2{background-position:0 -7496px}.ui-dev-2{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-2:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-2,.ui-screen-2,.ui-shell-2{transition:none}}</style>
<div class="glow-a"></div>
<div class="glow-b"></div>
<div class="glow-c"></div>
<div class="frame"></div>
<div class="bigword">Launch</div>
<div class="node node-a"></div>
<div class="node node-b"></div>
<div class="plus plus-a"></div>
<div class="plus plus-b"></div>
<div class="sphere"></div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:860px;top:20px;width:400px;height:800px;z-index:3"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="ui-dev ui-dev-2" style="position:absolute;left:1140px;top:130px;width:400px;height:800px;z-index:4"><div class="ui-stage ui-stage-2"><div class="ui-screen ui-screen-2"><img data-lumen-image="2"></div><div class="ui-shell ui-shell-2"></div></div></div></div>
<div class="note"><div class="bar"></div><h3>Launch your app and present!</h3><p>One Flutter codebase, two native builds, shipped the same afternoon.</p></div>
<div class="kicker">V2.4 / Flutter Starter Kit</div>
<h1 class="head">Launch Your<br>Dream App —<br>iOS &amp; Android Ready!</h1>
<p class="sub">Cross-platform Flutter development · Fast · Secure · Modern · Pixel-accurate on every screen size.</p>
<div class="chip chip-a"><span class="pip"></span>Push Notifications</div>
<div class="chip chip-b"><span class="pip"></span>Dark Mode</div>
<div class="band"></div>
<div class="footline"><div class="avatar"><span class="dotmark"></span></div><p class="sig">Dear fanv tofobnge</p><div class="cta">Start your project today ›</div></div>
</div>`,
  },
  {
    id: "ui/center-laptop-side-notes@v1",
    name: "中机左右分文",
    group: "laptop",
    scene: "macbook",
    brief: "笔记本居中压住巨型背景字，左中与右下的说明文字分列两侧，顶部大标题配一排悬浮毛玻璃导航胶囊，底部渐隐带收尾；适合产品详情、案例复盘页。",
    skeleton: `<div class="stage">
<style>
.stage{position:relative;width:1920px;height:1080px;background:var(--bg);overflow:hidden}
.glow{position:absolute;pointer-events:none}
.g1{left:-260px;top:-240px;width:1500px;height:1200px;background:radial-gradient(circle at 45% 45%,var(--accent),transparent 66%);opacity:.24;filter:blur(70px)}
.g2{right:-320px;bottom:-360px;width:1500px;height:1200px;background:radial-gradient(circle at 50% 50%,var(--brand),transparent 68%);opacity:.22;filter:blur(80px)}
.g3{left:600px;top:400px;width:920px;height:580px;background:radial-gradient(ellipse at 50% 50%,var(--accent),transparent 70%);opacity:.16;filter:blur(90px)}
.band{position:absolute;left:0;bottom:0;width:1920px;height:230px;background:linear-gradient(to bottom,transparent,var(--bg));z-index:4}
.mega{position:absolute;left:0;top:274px;width:1920px;text-align:center;font-family:var(--font-display);font-size:190px;font-weight:800;letter-spacing:-.04em;line-height:.92;text-transform:uppercase;color:var(--text);opacity:.12;z-index:1;pointer-events:none}
.hd{position:absolute;left:0;top:52px;width:1920px;text-align:center;z-index:6}
.kick{margin:0 0 20px;font-size:16px;font-weight:400;letter-spacing:.46em;text-transform:uppercase;color:var(--muted)}
.hd h1{margin:0;font-family:var(--font-display);font-size:92px;font-weight:400;line-height:1.0;letter-spacing:-.025em;color:var(--text)}
.hd h1 .ac{color:var(--accent)}
.brand{position:absolute;left:96px;top:64px;z-index:6;display:flex;align-items:center;gap:14px}
.brand .mk{width:24px;height:24px;border-radius:7px;background:var(--accent)}
.brand span{font-size:16px;font-weight:500;letter-spacing:.34em;text-transform:uppercase;color:var(--text)}
.case{position:absolute;right:96px;top:60px;z-index:6;padding:13px 22px;border-radius:999px;background:color-mix(in srgb,var(--surface) 50%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 65%,transparent);font-size:14px;font-weight:400;letter-spacing:.32em;text-transform:uppercase;color:var(--muted)}
.nav{position:absolute;left:552px;top:292px;z-index:6;display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:999px;background:color-mix(in srgb,var(--surface) 55%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent)}
.nav .mk{width:26px;height:26px;border-radius:8px;background:color-mix(in srgb,var(--accent) 88%,transparent)}
.nav span{font-size:15px;font-weight:400;letter-spacing:.06em;color:var(--muted);padding:8px 16px;border-radius:999px}
.nav span.on{background:color-mix(in srgb,var(--accent) 30%,transparent);color:var(--text)}
.tag{position:absolute;left:1478px;top:604px;z-index:6;display:flex;align-items:center;gap:12px;padding:15px 24px;border-radius:999px;background:color-mix(in srgb,var(--surface) 60%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);font-size:16px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:var(--text)}
.tag .d{width:8px;height:8px;border-radius:50%;background:var(--accent)}
.blk{position:absolute;z-index:6}
.blk h2{margin:0 0 18px;font-size:25px;font-weight:600;letter-spacing:-.01em;color:var(--text)}
.blk p{margin:0;font-size:20px;font-weight:300;line-height:1.6;color:var(--muted)}
.blk p .hi{color:var(--text);font-weight:500}
.blk-l{left:96px;top:596px;width:370px}
.blk-r{right:70px;top:792px;width:390px}
.chips{position:absolute;left:96px;bottom:92px;z-index:6;display:flex;gap:12px}
.chip{display:flex;align-items:center;gap:10px;padding:12px 20px;border-radius:999px;background:color-mix(in srgb,var(--surface) 58%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);font-size:15px;font-weight:500;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
.chip .d{width:7px;height:7px;border-radius:50%;background:var(--accent);opacity:.9}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-57.4px;top:-446.6px;width:900px;height:1200px;transform:scale(1.20710);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:1781px;height:1160px;border-radius:22px;transform-origin:0 0;transform:matrix3d(0.239938370715, 0, 0, 0, 0.00809028390427, 0.24721112368, 0, 0.0000179784086762, 0, 0, 1, 0, 236.334880878, 392.445244317, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(0.243588265607, -0.0189874180754, 0, 0.0000423329434676, 0.0428811627876, 0.250520632593, 0, 0.0000102890315318, 0, 0, 1, 0, 165.531703242, 444.86698085, 0, 1)}.ui-shell-1{position:absolute;left:156px;top:370px;width:595px;height:507px;background-image:url(/stock/devices/macbook-turn.webp);background-repeat:no-repeat;background-size:595px 4563px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -4056px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style>
<div class="glow g1"></div>
<div class="glow g2"></div>
<div class="glow g3"></div>
<div class="mega">Nuance Studio</div>
<div class="band"></div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:470px;top:300px;width:980px;height:612px;z-index:3"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="brand"><div class="mk"></div><span>Nuance</span></div>
<div class="case">Case Study 04</div>
<div class="hd"><p class="kick">Website Redesign</p><h1>The Brief <span class="ac">&amp;</span><br><span class="ac">Our Response</span></h1></div>
<div class="nav"><div class="mk"></div><span class="on">Home</span><span>About</span><span>Services</span><span>Contact</span></div>
<div class="tag"><span class="d"></span>Conversion Ready</div>
<div class="blk blk-l"><h2>Brief</h2><p>The client needed a credible, modern presence to <span class="hi">position the agency</span> as a leading creative studio rather than a portfolio of loose work.</p></div>
<div class="blk blk-r"><h2>Our Response</h2><p>A <span class="hi">conversion-focused</span> site was designed and built to explain services clearly, lift brand perception and route every enquiry into one form.</p></div>
<div class="chips"><div class="chip"><span class="d"></span>Fully Customizable</div><div class="chip"><span class="d"></span>Dark Mode</div><div class="chip"><span class="d"></span>30+ Sections</div></div>
</div>`,
  },
  {
    id: "ui/center-phone-float-cards@v1",
    name: "中机左右浮卡",
    group: "phone",
    scene: "iphone",
    brief: "手机居中竖立、两侧压着毛玻璃信息卡，左侧窄栏放标题与说明，适合展示移动端界面与悬浮交互卡片。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.ui-glow{position:absolute;border-radius:50%;z-index:0}
.ui-glow.a{left:120px;top:-320px;width:1240px;height:1240px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 62%,transparent) 0%,transparent 66%);opacity:.22}
.ui-glow.b{left:820px;top:-180px;width:1180px;height:1320px;background:radial-gradient(circle,color-mix(in srgb,var(--brand) 55%,transparent) 0%,transparent 68%);opacity:.2}
.ui-glow.c{left:640px;top:520px;width:900px;height:900px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 52%,transparent) 0%,transparent 70%);opacity:.16}
.ui-word{position:absolute;z-index:1;left:640px;top:352px;font-family:var(--font-display);font-weight:800;font-size:242px;line-height:1;letter-spacing:-.04em;text-transform:uppercase;color:var(--text);opacity:.13}
.ui-veil{position:absolute;z-index:2;left:0;bottom:0;width:1920px;height:320px;background:linear-gradient(to bottom,transparent,color-mix(in srgb,var(--bg) 88%,transparent) 58%,var(--bg))}
.ui-kicker{position:absolute;z-index:4;left:120px;top:248px;margin:0;font-size:15px;font-weight:500;letter-spacing:.42em;text-transform:uppercase;color:var(--muted)}
.ui-title{position:absolute;z-index:4;left:120px;top:292px;width:430px;margin:0;font-family:var(--font-display);font-weight:800;font-size:64px;line-height:.98;letter-spacing:-.03em;text-transform:uppercase;color:var(--text)}
.ui-lede{position:absolute;z-index:4;left:120px;top:642px;width:360px;margin:0;font-size:18px;font-weight:300;line-height:1.7;color:var(--muted)}
.ui-tagrow{position:absolute;z-index:5;left:120px;top:792px;display:flex;gap:12px}
.ui-tag{padding:12px 20px;border-radius:999px;font-size:13px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:var(--text);background:color-mix(in srgb,var(--surface) 55%,transparent);backdrop-filter:blur(14px);border:1px solid color-mix(in srgb,var(--border) 65%,transparent)}
.ui-chip{position:absolute;z-index:5;border-radius:26px;background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent)}
.ui-chip.stat{left:570px;top:424px;width:320px;height:222px;padding:28px;box-sizing:border-box;background:linear-gradient(155deg,color-mix(in srgb,var(--accent) 34%,transparent),color-mix(in srgb,var(--surface) 56%,transparent))}
.ui-chip.card{left:1160px;top:246px;width:520px;height:264px;padding:28px;box-sizing:border-box}
.ui-chip.pill{left:470px;top:802px;width:384px;height:112px;border-radius:999px;display:flex;align-items:center;gap:20px;padding:0 30px;box-sizing:border-box}
.ui-chip.coll{left:1196px;top:806px;width:312px;height:130px;border-radius:28px;display:flex;align-items:center;gap:20px;padding:0 26px;box-sizing:border-box}
.ui-mini{margin:0;font-size:11px;font-weight:500;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)}
.ui-stat-num{font-family:var(--font-display);font-size:78px;font-weight:800;line-height:1;letter-spacing:-.04em;color:var(--text)}
.ui-card-title{margin:0;font-family:var(--font-display);font-size:27px;font-weight:700;line-height:1.15;letter-spacing:-.01em;color:var(--text)}
.ui-name{margin:0;font-size:27px;font-weight:700;line-height:1.2;color:var(--text)}
.ui-handle{margin:0;font-size:15px;font-weight:300;color:var(--muted)}
.ui-sub{margin:0;font-size:13px;font-weight:300;line-height:1.5;color:var(--muted)}
.ui-avatar{border-radius:50%;background:linear-gradient(140deg,color-mix(in srgb,var(--accent) 72%,transparent),color-mix(in srgb,var(--brand) 62%,transparent));border:1px solid color-mix(in srgb,var(--border) 60%,transparent)}
.ui-thumb{border-radius:18px;background:linear-gradient(140deg,color-mix(in srgb,var(--accent) 78%,transparent),color-mix(in srgb,var(--brand) 66%,transparent),color-mix(in srgb,var(--surface) 40%,transparent))}
.ui-subscribe{border-radius:999px;padding:10px 20px;font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--text);background:color-mix(in srgb,var(--accent) 45%,transparent)}
.ui-script{position:absolute;z-index:4;left:1250px;top:660px;margin:0;font-family:var(--font-script);font-size:44px;line-height:1;color:var(--text);opacity:.8}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-240.6px;top:-152.1px;width:900px;height:1200px;transform:scale(1.10993);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style>
<div class="ui-glow a"></div>
<div class="ui-glow b"></div>
<div class="ui-glow c"></div>
<div class="ui-word">Curatio</div>
<div class="ui-veil"></div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:700px;top:20px;width:520px;height:1040px;z-index:3"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<p class="ui-kicker">V2.4 / Curatio Design System</p>
<h1 class="ui-title">Frontier of Digital Innovation</h1>
<p class="ui-lede">Collect the ideas that move you. Curatio turns articles, threads and videos into capsules you can reopen, annotate and share with your team.</p>
<div class="ui-tagrow"><span class="ui-tag">Dark Mode</span><span class="ui-tag">Offline</span></div>
<div class="ui-chip stat"><p class="ui-mini" style="margin-bottom:12px">Weekly Views</p><div class="ui-stat-num">12k</div><p class="ui-sub" style="margin-top:16px">capsules read this week</p></div>
<div class="ui-chip card"><div style="display:flex;gap:22px;align-items:flex-start"><div class="ui-thumb" style="width:104px;height:104px;flex:0 0 104px"></div><div><p class="ui-mini" style="margin-bottom:10px">2025 DeFi Strategy Capsule</p><h3 class="ui-card-title">Navigating Tomorrow's Trends</h3></div></div><div style="display:flex;align-items:center;gap:14px;margin-top:24px"><div class="ui-avatar" style="width:36px;height:36px"></div><span style="font-size:14px;font-weight:400;color:var(--muted)">Ronald Richards</span><span style="flex:1"></span><span class="ui-subscribe">Subscribe</span></div></div>
<div class="ui-chip pill"><div class="ui-avatar" style="width:66px;height:66px;flex:0 0 66px"></div><div><p class="ui-name">Robert Fox</p><p class="ui-handle">@robert</p></div></div>
<div class="ui-chip coll"><div class="ui-thumb" style="width:78px;height:78px;flex:0 0 78px;border-radius:16px"></div><div><p class="ui-name" style="font-size:22px">Collection</p><p class="ui-handle" style="font-size:13px">128 capsules</p></div></div>
<p class="ui-script">curated by hand</p>
</div>`,
  },
  {
    id: "ui/centered-phone-annotated@v1",
    name: "中置手机环绕批注",
    group: "phone",
    scene: "iphone",
    brief: "一台手机竖立居中，四周散落手写式批注与指示线，背后压着巨大的品牌字与光晕，适合讲 App 引导页、单屏交互细节。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden"><style>.glow{position:absolute;border-radius:50%;pointer-events:none;z-index:0}.g1{left:120px;top:-260px;width:1240px;height:1240px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 60%,transparent) 0%,transparent 68%);opacity:.22}.g2{left:1180px;top:160px;width:1040px;height:1040px;background:radial-gradient(circle,color-mix(in srgb,var(--brand) 55%,transparent) 0%,transparent 70%);opacity:.18}.g3{left:600px;top:460px;width:960px;height:760px;background:radial-gradient(ellipse,color-mix(in srgb,var(--accent) 45%,transparent) 0%,transparent 72%);opacity:.16}.ghost{position:absolute;z-index:1;font-family:var(--font-display);font-size:238px;font-weight:900;line-height:.88;letter-spacing:-.04em;text-transform:uppercase;color:var(--text);opacity:.11;white-space:nowrap}.note{position:absolute;z-index:6;margin:0;font-size:16px;font-weight:600;letter-spacing:.32em;text-transform:uppercase;color:var(--text);opacity:.7;line-height:1.9}.rule{position:absolute;z-index:6;height:1px;background:color-mix(in srgb,var(--text) 45%,transparent);transform-origin:0 50%}.tip{position:absolute;z-index:6;width:11px;height:11px;border-top:1px solid color-mix(in srgb,var(--text) 55%,transparent);border-right:1px solid color-mix(in srgb,var(--text) 55%,transparent)}.glass{position:absolute;z-index:6;box-sizing:border-box;background:color-mix(in srgb,var(--surface) 58%,transparent);backdrop-filter:blur(20px);border:1px solid color-mix(in srgb,var(--border) 65%,transparent);border-radius:999px}.card{position:absolute;z-index:6;box-sizing:border-box;background:color-mix(in srgb,var(--surface) 55%,transparent);backdrop-filter:blur(22px);border:1px solid color-mix(in srgb,var(--border) 60%,transparent);border-radius:26px}*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-198.4px;top:-130.1px;width:900px;height:1200px;transform:scale(0.94984);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style><div class="glow g1"></div><div class="glow g2"></div><div class="glow g3"></div><div class="ghost" style="left:238px;top:424px">Wandermap</div><p style="position:absolute;z-index:6;left:0;top:46px;width:1920px;margin:0;text-align:center;font-size:16px;font-weight:600;letter-spacing:.42em;text-transform:uppercase;color:var(--muted)">Wandermap / Onboarding Kit V2.4</p><p style="position:absolute;z-index:6;left:0;top:84px;width:1920px;margin:0;text-align:center;font-family:var(--font-script);font-size:62px;font-weight:400;color:var(--text)">The onboarding flow</p><div class="ui-dev ui-dev-1" style="position:absolute;left:730px;top:168px;width:460px;height:890px;z-index:2"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div><p class="note" style="left:96px;top:262px;width:340px">Status bar</p><div class="rule" style="left:462px;top:300px;width:250px;transform:rotate(5deg)"></div><div class="tip" style="left:706px;top:310px;transform:rotate(45deg)"></div><div class="glass" style="left:96px;top:420px;padding:16px 30px;font-size:15px;font-weight:600;letter-spacing:.3em;text-transform:uppercase;line-height:1;color:var(--text)">30+ screens</div><div class="card" style="left:96px;top:552px;width:446px;padding:28px 32px"><h3 style="margin:0 0 14px;font-size:26px;font-weight:800;letter-spacing:-.01em;line-height:1.15;color:var(--text)">Three slides, one action</h3><p style="margin:0;font-size:16px;font-weight:400;line-height:1.65;color:var(--muted)">Swap the hero art without moving the progress dots. The copy keeps the same headline slot while the illustration changes.</p></div><div style="position:absolute;z-index:6;left:118px;top:840px;width:300px;height:116px;border:1px solid color-mix(in srgb,var(--text) 45%,transparent);border-radius:50%;display:flex;align-items:center;justify-content:center"><p style="margin:0;text-align:center;font-size:16px;font-weight:600;letter-spacing:.3em;text-transform:uppercase;line-height:1.6;color:var(--text)">Coming soon</p></div><p class="note" style="left:1330px;top:246px;width:440px">Battery, wifi</p><p class="note" style="left:1330px;top:288px;width:440px">and cellular</p><div class="rule" style="left:1246px;top:300px;width:110px;transform:rotate(-10deg)"></div><div class="tip" style="left:1230px;top:288px;transform:rotate(225deg)"></div><p class="note" style="left:1330px;top:690px;width:300px">Get started</p><div class="rule" style="left:1202px;top:730px;width:118px"></div><div class="tip" style="left:1194px;top:720px;transform:rotate(225deg)"></div><div class="glass" style="left:1330px;top:844px;padding:18px 34px;font-size:15px;font-weight:600;letter-spacing:.3em;text-transform:uppercase;line-height:1;color:var(--text)">Fully customizable</div><div style="position:absolute;z-index:4;left:0;bottom:0;width:1920px;height:260px;background:linear-gradient(to top,var(--bg) 14%,transparent 100%);opacity:.92"></div><div style="position:absolute;z-index:7;left:0;bottom:0;width:1920px;height:84px;background:color-mix(in srgb,var(--surface) 45%,transparent);backdrop-filter:blur(22px);border-top:1px solid color-mix(in srgb,var(--border) 60%,transparent)"></div><p style="position:absolute;z-index:8;left:64px;bottom:28px;margin:0;font-size:15px;font-weight:600;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)">@anelka.md</p><p style="position:absolute;z-index:8;right:64px;bottom:28px;margin:0;font-size:15px;font-weight:600;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)">anelkemd.com</p></div>`,
  },
  {
    id: "ui/centered-phone-over-word@v1",
    name: "居中手机压大字",
    group: "phone",
    scene: "iphone",
    brief: "一台手机正对画面居中，巨大品牌词压在机身后，两侧毛玻璃卡片托住标题与要点，底部一条胶囊标签收边，适合做单机产品的界面主视觉。",
    skeleton: `<div style="position:relative;width:1920px;height:1080px;overflow:hidden;background:var(--bg)">
<style>
.wall{position:absolute;left:0;top:0;width:1920px;height:560px;background:linear-gradient(180deg,color-mix(in srgb,var(--brand) 58%,var(--bg)),color-mix(in srgb,var(--brand) 26%,var(--bg)));opacity:.94}
.floor{position:absolute;left:0;top:510px;width:1920px;height:570px;background:linear-gradient(180deg,color-mix(in srgb,var(--muted) 30%,var(--bg)),color-mix(in srgb,var(--surface) 72%,var(--bg)))}
.sweep{position:absolute;left:0;top:0;width:1920px;height:1080px;background:linear-gradient(112deg,transparent 34%,color-mix(in srgb,var(--bg) 66%,transparent) 52%,transparent 70%);opacity:.5}
.glow1{position:absolute;left:470px;top:-170px;width:1000px;height:1000px;background:radial-gradient(circle at 50% 50%,color-mix(in srgb,var(--accent) 60%,transparent),transparent 65%);opacity:.2;filter:blur(30px)}
.glow2{position:absolute;right:90px;bottom:-260px;width:1120px;height:920px;background:radial-gradient(circle at 50% 50%,color-mix(in srgb,var(--brand) 55%,transparent),transparent 66%);opacity:.22;filter:blur(40px)}
.glow3{position:absolute;left:640px;top:520px;width:660px;height:660px;background:radial-gradient(circle at 50% 50%,color-mix(in srgb,var(--accent) 55%,transparent),transparent 68%);opacity:.16;filter:blur(28px)}
.megaword{position:absolute;left:0;top:330px;width:1920px;text-align:center;white-space:nowrap;font-family:var(--font-display);font-size:250px;font-weight:900;letter-spacing:-.04em;line-height:.9;color:var(--text);opacity:.12;z-index:2}
.kicker{position:absolute;left:0;top:44px;width:1920px;margin:0;text-align:center;font-size:16px;font-weight:500;letter-spacing:.34em;text-transform:uppercase;color:var(--muted);z-index:6}
.fade{position:absolute;left:0;bottom:0;width:1920px;height:230px;background:linear-gradient(180deg,transparent,var(--bg));z-index:4}
.card{position:absolute;box-sizing:border-box;background:color-mix(in srgb,var(--surface) 58%,transparent);backdrop-filter:blur(22px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);border-radius:22px;padding:34px 36px;z-index:6}
.card.left{left:130px;top:440px;width:440px}
.card.right{right:130px;top:440px;width:420px}
.mini{margin:0 0 16px;font-size:12px;font-weight:600;letter-spacing:.34em;text-transform:uppercase;color:var(--accent)}
.h2{margin:0 0 18px;font-family:var(--font-display);font-size:46px;font-weight:800;line-height:1.02;letter-spacing:-.02em;color:var(--text)}
.body{margin:0;font-size:17px;font-weight:400;line-height:1.65;color:var(--muted)}
.h3{margin:0 0 20px;font-size:14px;font-weight:600;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)}
.list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:14px}
.list li{display:flex;align-items:center;gap:14px;font-size:17px;font-weight:400;letter-spacing:.01em;color:var(--text)}
.sq{flex:0 0 auto;width:9px;height:9px;border-radius:2px;background:var(--accent)}
.tag{position:absolute;left:628px;top:864px;display:flex;align-items:center;gap:12px;padding:14px 26px;border-radius:999px;background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);font-size:13px;font-weight:500;letter-spacing:.24em;text-transform:uppercase;color:var(--text);z-index:6}
.dot{width:9px;height:9px;border-radius:999px;background:var(--accent)}
.pill{position:absolute;left:830px;bottom:34px;width:260px;height:58px;display:flex;align-items:center;justify-content:center;gap:16px;border-radius:999px;background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);z-index:6}
.capsule{width:52px;height:24px;border:3px solid color-mix(in srgb,var(--text) 55%,transparent);border-radius:999px}
.pilltxt{font-size:12px;font-weight:600;letter-spacing:.28em;text-transform:uppercase;color:var(--muted)}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-203.6px;top:-128.7px;width:900px;height:1200px;transform:scale(0.93917);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style>
<div class="wall"></div>
<div class="floor"></div>
<div class="sweep"></div>
<div class="glow1"></div>
<div class="glow2"></div>
<div class="glow3"></div>
<div class="megaword">APPROACH</div>
<p class="kicker">V2.4 / Design System / 40+ Screens</p>
<div class="fade"></div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:740px;top:70px;width:440px;height:880px;z-index:5"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="card left">
<p class="mini">Case Study</p>
<h2 class="h2">User-centric approach</h2>
<p class="body">We build apps that do not just meet functional requirements. They resonate with the audience and lead to measurable success.</p>
</div>
<div class="card right">
<p class="h3">What is inside</p>
<ul class="list">
<li><span class="sq"></span>Fully Customizable</li>
<li><span class="sq"></span>Dark Mode Ready</li>
<li><span class="sq"></span>60fps Interactions</li>
</ul>
</div>
<div class="tag"><span class="dot"></span>Approach 01</div>
<div class="pill"><span class="capsule"></span><span class="pilltxt">Live Preview</span></div>
</div>`,
  },
  {
    id: "ui/phone-center-right-title@v1",
    name: "中机右题左下注",
    group: "phone",
    scene: "iphone",
    brief: "一台手机竖立在画面偏左中央，右侧两行大标题，左下角一段说明文字，顶部一排毛玻璃导航胶囊，背后压着巨字与斜向细线。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden">
<style>
.glow{position:absolute;z-index:0;border-radius:50%}
.glow-a{left:430px;top:-90px;width:980px;height:980px;background:radial-gradient(circle at 50% 50%,var(--accent) 0%,transparent 62%);opacity:.20}
.glow-b{left:690px;top:330px;width:900px;height:900px;background:radial-gradient(circle at 50% 50%,var(--brand) 0%,transparent 66%);opacity:.15}
.bigword{position:absolute;left:300px;top:118px;z-index:1;font-family:var(--font-display);font-size:250px;font-weight:900;line-height:.88;letter-spacing:-.04em;color:var(--text);opacity:.11;white-space:nowrap}
.wire{position:absolute;left:-160px;width:2240px;height:2px;background:linear-gradient(90deg,transparent 0%,var(--muted) 22%,var(--muted) 78%,transparent 100%);opacity:.30}
.wire-a{top:142px;transform:rotate(-7deg);z-index:2}
.wire-b{top:832px;transform:rotate(6deg);z-index:7;opacity:.20}
.nav{position:absolute;left:0;top:42px;width:1920px;display:flex;justify-content:center;gap:12px;z-index:8}
.chip{padding:13px 26px;border-radius:999px;background:color-mix(in srgb,var(--surface) 58%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);font-size:19px;font-weight:500;color:var(--text)}
.chip-on{background:var(--text);color:var(--bg);border:1px solid color-mix(in srgb,var(--text) 90%,transparent);font-weight:600}
.head{position:absolute;left:1290px;top:246px;width:590px;margin:0;z-index:8;font-size:76px;font-weight:800;line-height:1.06;letter-spacing:-.03em;color:var(--text)}
.head .dim{font-weight:300;color:var(--muted)}
.cap{position:absolute;left:88px;top:624px;width:520px;z-index:8}
.cap-k{margin:0 0 20px;font-size:15px;font-weight:700;letter-spacing:.34em;text-transform:uppercase;color:var(--text)}
.cap-b{margin:0;font-size:26px;font-weight:400;line-height:1.55;color:var(--muted)}
.cap-b .em{color:var(--text);font-weight:700}
.tag{position:absolute;left:452px;top:806px;z-index:9;display:flex;align-items:center;gap:12px;padding:14px 24px;border-radius:999px;background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);font-size:14px;font-weight:600;letter-spacing:.18em;text-transform:uppercase;color:var(--text);white-space:nowrap}
.tag-dot{width:8px;height:8px;border-radius:50%;background:var(--accent)}
.fade{position:absolute;left:0;bottom:0;width:1920px;height:190px;z-index:4;background:linear-gradient(180deg,transparent 0%,var(--bg) 84%)}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-202.1px;top:-140.4px;width:900px;height:1200px;transform:scale(1.02455);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style>
<div class="glow glow-a"></div>
<div class="glow glow-b"></div>
<div class="bigword">SPEND</div>
<div class="wire wire-a"></div>
<div class="wire wire-b"></div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:700px;top:56px;width:520px;height:960px;z-index:5"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="nav">
<div class="chip">About</div>
<div class="chip">Branding</div>
<div class="chip">Dashboard</div>
<div class="chip chip-on">Mobile App</div>
<div class="chip">Watch</div>
<div class="chip">Website</div>
</div>
<h1 class="head">Know the numbers first. <span class="dim">Spend, burn, income.</span></h1>
<div class="tag"><span class="tag-dot"></span>Monthly burn $34,011</div>
<div class="fade"></div>
<div class="cap">
<p class="cap-k">Overview Screen</p>
<p class="cap-b">See where the money goes, how fast it burns and what comes back in. <span class="em">So you can</span> cut costs early, plan the next hire and walk into investor calls with real numbers.</p>
</div>
</div>`,
  },
  {
    id: "ui/left-copy-right-phone-4@v1",
    name: "左文右机大字",
    group: "phone",
    scene: "iphone",
    brief: "深色底、左半屏巨大标题与说明文案，右侧一台超大手机压住毛玻璃胶囊、悬浮标签与橙色光晕，适合展示 App 界面。",
    skeleton: `<div style="position:relative;width:1920px;height:1080px;background:var(--bg);overflow:hidden">
<style>
.glow{position:absolute;border-radius:50%;pointer-events:none}
.glow-a{left:900px;top:-160px;width:1260px;height:1060px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 80%,transparent) 0%,transparent 68%);opacity:.22;filter:blur(26px)}
.glow-b{left:120px;top:560px;width:980px;height:760px;background:radial-gradient(circle,color-mix(in srgb,var(--brand) 70%,transparent) 0%,transparent 70%);opacity:.16;filter:blur(30px)}
.watermark{position:absolute;left:700px;top:664px;font-family:var(--font-display);font-size:224px;font-weight:900;letter-spacing:-.04em;line-height:.9;color:var(--text);opacity:.10;white-space:nowrap;z-index:1}
.copy{position:absolute;left:120px;top:214px;max-width:1180px;z-index:3}
.kicker{font-size:16px;font-weight:600;letter-spacing:.34em;text-transform:uppercase;color:var(--muted);margin:0}
.head{font-family:var(--font-display);font-size:186px;font-weight:900;line-height:.94;letter-spacing:-.035em;color:var(--text);margin:30px 0 0 0}
.sub{font-size:21px;font-weight:300;line-height:1.65;color:var(--muted);max-width:560px;margin:36px 0 0 0}
.rail{position:absolute;left:120px;top:64px;display:flex;align-items:center;gap:20px;z-index:8}
.chip{display:flex;align-items:center;gap:12px;height:58px;padding:0 26px;border-radius:999px;box-sizing:border-box;background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);color:var(--text);font-size:16px;font-weight:600;letter-spacing:.02em}
.chip-accent{background:color-mix(in srgb,var(--accent) 86%,transparent);border-color:color-mix(in srgb,var(--accent) 58%,transparent)}
.dot{width:10px;height:10px;border-radius:50%;background:var(--text);opacity:.9}
.round{width:58px;height:58px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);color:var(--text);font-size:22px;font-weight:700}
.float-tag{position:absolute;left:1080px;top:646px;padding:18px 26px;border-radius:20px;background:color-mix(in srgb,var(--surface) 58%,transparent);backdrop-filter:blur(20px);border:1px solid color-mix(in srgb,var(--border) 65%,transparent);z-index:9}
.tag-lab{display:block;font-size:13px;font-weight:600;letter-spacing:.28em;text-transform:uppercase;color:var(--muted)}
.tag-val{display:block;margin-top:8px;font-size:18px;font-weight:700;letter-spacing:-.01em;color:var(--text)}
.stats{position:absolute;left:120px;top:846px;display:flex;gap:64px;padding:30px 42px;border-radius:26px;background:color-mix(in srgb,var(--surface) 58%,transparent);backdrop-filter:blur(22px);border:1px solid color-mix(in srgb,var(--border) 65%,transparent);z-index:9}
.stat-num{display:block;font-family:var(--font-display);font-size:38px;font-weight:800;letter-spacing:-.02em;color:var(--text)}
.stat-lab{margin:8px 0 0 0;font-size:13px;font-weight:600;letter-spacing:.24em;text-transform:uppercase;color:var(--muted)}
.fade{position:absolute;left:0;bottom:0;width:1920px;height:240px;background:linear-gradient(180deg,transparent,var(--bg));z-index:6;pointer-events:none}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-240.6px;top:-152.1px;width:900px;height:1200px;transform:scale(1.10993);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style>
<div class="glow glow-a"></div>
<div class="glow glow-b"></div>
<div class="watermark">NEW WORLD</div>
<div class="copy">
<p class="kicker">V2.4 / Publishing Platform</p>
<h1 class="head">Don't miss<br>a new world</h1>
<p class="sub">Publish a project, drop the preview link, and the mockup renders itself on every device you own.</p>
</div>
<div class="rail">
<div class="chip chip-accent"><span class="dot"></span>Follow</div>
<div class="round">+</div>
<div class="chip">2.4k saves this week</div>
</div>
<div class="float-tag"><span class="tag-lab">Card balance</span><span class="tag-val">$4,900.00 synced</span></div>
<div class="stats">
<div><span class="stat-num">30+</span><p class="stat-lab">Screens</p></div>
<div><span class="stat-num">12ms</span><p class="stat-lab">Render</p></div>
<div><span class="stat-num">4.9</span><p class="stat-lab">Rating</p></div>
</div>
<div class="fade"></div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:1272px;top:20px;width:520px;height:1040px;z-index:5"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
</div>`,
  },
  {
    id: "ui/center-display-hero@v1",
    name: "置中大屏展示",
    group: "display",
    scene: "display",
    brief: "深色顶栏放栏目条与大标题、右侧一段说明，中央一台横屏显示器压住巨字与光晕，底部一排毛玻璃胶囊，适合大屏/后台界面发布页。",
    skeleton: `<style>
.ui-page{position:relative;width:1920px;height:1080px;background:var(--bg);font-family:var(--font-sans);overflow:hidden}
.band{position:absolute;left:0;top:0;width:1920px;height:368px;background:linear-gradient(180deg,color-mix(in srgb,var(--text) 12%,transparent),transparent);z-index:0}
.floor{position:absolute;left:0;bottom:0;width:1920px;height:740px;background:linear-gradient(180deg,transparent,color-mix(in srgb,var(--surface) 58%,transparent));z-index:0}
.glow-a{position:absolute;left:60px;top:200px;width:1180px;height:900px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 55%,transparent),transparent 68%);opacity:.20;filter:blur(24px);z-index:0}
.glow-b{position:absolute;right:-140px;bottom:-180px;width:1040px;height:900px;border-radius:50%;background:radial-gradient(circle,color-mix(in srgb,var(--brand) 60%,transparent),transparent 70%);opacity:.16;filter:blur(30px);z-index:0}
.ghost{position:absolute;left:100px;top:396px;margin:0;font-family:var(--font-display);font-size:300px;font-weight:800;line-height:.9;letter-spacing:-.04em;text-transform:uppercase;color:var(--text);opacity:.12;white-space:nowrap;z-index:1}
.kicker{position:absolute;left:108px;top:92px;display:flex;align-items:center;gap:16px;z-index:6}
.kicker .num{width:30px;height:30px;border-radius:50%;background:var(--accent);color:var(--bg);font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center}
.kicker .label{font-size:12px;font-weight:600;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.title{position:absolute;left:104px;top:144px;margin:0;font-family:var(--font-display);font-size:116px;font-weight:800;letter-spacing:-.035em;line-height:.95;color:var(--text);z-index:6}
.lead{position:absolute;left:1276px;top:154px;width:548px;margin:0;font-size:17px;font-weight:300;line-height:1.72;color:var(--muted);z-index:6}
.nav{position:absolute;left:508px;top:352px;height:58px;display:flex;align-items:center;gap:30px;padding:0 30px;border-radius:999px;background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);z-index:6}
.nav span{font-size:11px;font-weight:600;letter-spacing:.24em;text-transform:uppercase;color:var(--muted)}
.nav .on{color:var(--text)}
.tag{position:absolute;left:1452px;top:506px;display:flex;align-items:center;gap:12px;height:48px;padding:0 22px;border-radius:999px;background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);z-index:6}
.tag .dot{width:8px;height:8px;border-radius:50%;background:var(--accent)}
.tag p{margin:0;font-size:12px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;color:var(--text)}
.rooms{position:absolute;left:508px;top:938px;display:flex;gap:12px;z-index:6}
.chip{height:44px;padding:0 24px;display:flex;align-items:center;border-radius:999px;font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);background:color-mix(in srgb,var(--surface) 58%,transparent);backdrop-filter:blur(16px);border:1px solid color-mix(in srgb,var(--border) 65%,transparent)}
.chip.on{color:var(--bg);background:var(--surface)}
.fade{position:absolute;left:0;bottom:0;width:1920px;height:200px;background:linear-gradient(180deg,transparent,var(--bg));z-index:4;pointer-events:none}
.meta{position:absolute;right:104px;bottom:62px;text-align:right;z-index:6}
.meta .k{margin:0 0 10px;font-size:12px;letter-spacing:.32em;text-transform:uppercase;color:var(--muted)}
.meta .v{margin:0;font-family:var(--font-display);font-size:44px;font-weight:800;letter-spacing:-.02em;color:var(--text)}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-82.8px;top:-468.2px;width:900px;height:1200px;transform:scale(1.43173);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:3533px;height:1988px;border-radius:16px;transform-origin:0 0;transform:matrix3d(0.194674468736, 0, 0, 0, 0.00722258029417, 0.20084118139, 0, 0.0000160501784315, 0, 0, 1, 0, 106.107550977, 351.711547735, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(0.202346986126, 0.00644592133635, 0, 0.0000377974793072, 0.0129337680086, 0.208936346938, 0, 0.00000812980323644, 0, 0, 1, 0, 127.608952389, 358.530188991, 0, 1)}.ui-shell-1{position:absolute;left:97px;top:327px;width:704px;height:542px;background-image:url(/stock/devices/display-turn.webp);background-repeat:no-repeat;background-size:704px 4878px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -4336px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style>
<div class="ui-page">
<div class="band"></div>
<div class="floor"></div>
<div class="glow-a"></div>
<div class="glow-b"></div>
<div class="ghost">Dashboard</div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:400px;top:330px;width:1120px;height:776px;z-index:3"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="kicker"><span class="num">8</span><span class="label">Product Features</span></div>
<h1 class="title">Dashboard</h1>
<p class="lead">The Aeros dashboard pulls every room reading into one view. Temperature, humidity, air quality and CO2 update live, so you can read the whole house at a glance instead of opening six menus.</p>
<div class="nav"><span class="on">Overview</span><span>Environment</span><span>Energy</span><span>Devices</span><span>AI Insights</span></div>
<div class="tag"><span class="dot"></span><p>Live Climate Sync</p></div>
<div class="rooms"><div class="chip on">Lounge</div><div class="chip">Bedroom</div><div class="chip">Kitchen</div></div>
<div class="fade"></div>
<div class="meta"><p class="k">Updated 3 min ago</p><p class="v">28°C</p></div>
</div>`,
  },
  {
    id: "ui/center-duo-phone-hero@v1",
    name: "双机错落压大字",
    group: "phone",
    scene: "iphone",
    brief: "两台手机一前一后错落在画面中偏右，压在横贯全幅的巨型标题上，四角小标签配毛玻璃胶囊，适合展示移动端界面对。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.stars{position:absolute;inset:0;background-image:radial-gradient(color-mix(in srgb,var(--text) 75%,transparent) 1.3px,transparent 1.7px);background-size:86px 86px;opacity:.2;pointer-events:none}
.glow{position:absolute;border-radius:50%;filter:blur(40px);pointer-events:none}
.g1{left:140px;top:40px;width:1240px;height:920px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 55%,transparent),transparent 66%);opacity:.2}
.g2{left:780px;top:200px;width:920px;height:840px;background:radial-gradient(circle,color-mix(in srgb,var(--brand) 50%,transparent),transparent 68%);opacity:.22}
.g3{right:-160px;bottom:-240px;width:920px;height:820px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 45%,transparent),transparent 70%);opacity:.16}
.word{position:absolute;left:8px;top:22px;font-size:250px;font-weight:800;letter-spacing:-.04em;line-height:.94;white-space:nowrap;color:var(--text);opacity:.13;z-index:1}
.band{position:absolute;left:0;bottom:0;width:1920px;height:360px;background:linear-gradient(to top,color-mix(in srgb,var(--bg) 90%,transparent),transparent);z-index:2}
.kicker{position:absolute;top:26px;font-size:15px;font-weight:600;letter-spacing:.24em;line-height:1.9;text-transform:uppercase;color:var(--muted);z-index:7}
.kicker-l{left:28px;width:250px}
.kicker-r{right:28px;width:260px;text-align:right}
.pillbar{position:absolute;left:430px;top:28px;width:1000px;display:flex;justify-content:center;gap:150px;z-index:7}
.pill{padding:11px 24px;border-radius:999px;background:color-mix(in srgb,var(--surface) 55%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);font-size:13px;font-weight:600;letter-spacing:.26em;text-transform:uppercase;color:var(--text)}
.tag{position:absolute;left:326px;top:600px;display:flex;align-items:center;gap:12px;padding:14px 26px;border-radius:999px;background:color-mix(in srgb,var(--surface) 58%,transparent);backdrop-filter:blur(20px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);z-index:6}
.tag .dot{width:9px;height:9px;border-radius:50%;background:var(--accent);opacity:.9}
.tag .t{font-size:13px;font-weight:600;letter-spacing:.26em;text-transform:uppercase;color:var(--text)}
.note{position:absolute;left:328px;top:668px;width:262px;font-size:16px;font-weight:400;line-height:1.65;color:var(--muted);z-index:6}
.bigL{position:absolute;left:30px;top:772px;font-size:118px;font-weight:300;letter-spacing:-.02em;line-height:1;color:var(--text);opacity:.94;z-index:6}
.bigR{position:absolute;right:40px;top:762px;font-size:118px;font-weight:300;letter-spacing:-.02em;line-height:1;color:var(--text);opacity:.94;z-index:6}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-197.4px;top:-113.5px;width:900px;height:1200px;transform:scale(0.88106);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}*{pointer-events:none}.ui-dev-2,.ui-dev-2 *{pointer-events:auto}.ui-stage-2{position:absolute;left:-213.2px;top:-131.6px;width:900px;height:1200px;transform:scale(0.96051);transform-origin:top left}.ui-screen-2{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-2 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-2:hover .ui-screen-2{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-2{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-2:hover .ui-shell-2{background-position:0 -7496px}.ui-dev-2{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-2:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-2,.ui-screen-2,.ui-shell-2{transition:none}}</style>
<div class="stars"></div>
<div class="glow g1"></div>
<div class="glow g2"></div>
<div class="glow g3"></div>
<div class="word">Planning</div>
<div class="band"></div>
<div class="kicker kicker-l">Embark on a journey of discovery.</div>
<div class="kicker kicker-r">Wanderlust: the urge to travel</div>
<div class="pillbar"><span class="pill">Horizons</span><span class="pill">New</span><span class="pill">Horizons</span></div>
<div class="tag"><span class="dot"></span><span class="t">AI Trip Planner</span></div>
<p class="note">Ask in plain language and the itinerary rebuilds itself around weather, budget and pace.</p>
<div class="ui-dev ui-dev-1" style="position:absolute;left:630px;top:238px;width:400px;height:840px;z-index:3"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="ui-dev ui-dev-2" style="position:absolute;left:840px;top:118px;width:440px;height:900px;z-index:5"><div class="ui-stage ui-stage-2"><div class="ui-screen ui-screen-2"><img data-lumen-image="2"></div><div class="ui-shell ui-shell-2"></div></div></div></div>
<div class="bigL">Smart</div>
<div class="bigR">(Travel)</div>
</div>`,
  },
  {
    id: "ui/text-left-device-cluster@v1",
    name: "左文右多机",
    group: "display",
    scene: "display",
    brief: "左侧标题说明与按钮、右侧一台笔记本带显示器与手机错落堆叠，适合产品发布页与工具类界面展示",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.halo{position:absolute;border-radius:50%;pointer-events:none;z-index:0}
.halo-a{left:1020px;top:-300px;width:1560px;height:1560px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 80%,transparent) 0%,transparent 68%);opacity:.24}
.halo-b{left:-460px;top:320px;width:1040px;height:1040px;background:radial-gradient(circle,color-mix(in srgb,var(--brand) 75%,transparent) 0%,transparent 70%);opacity:.17}
.bigword{position:absolute;left:560px;top:110px;font-family:var(--font-display);font-size:212px;font-weight:900;line-height:.9;letter-spacing:-.045em;text-transform:uppercase;color:var(--text);opacity:.11;white-space:nowrap;z-index:1}
.copy{position:absolute;left:128px;top:326px;width:530px;z-index:6}
.kicker{font-size:16px;font-weight:600;letter-spacing:.42em;text-transform:uppercase;color:var(--muted);margin:0 0 26px}
.title{font-family:var(--font-display);font-size:74px;font-weight:800;line-height:1.02;letter-spacing:-.028em;color:var(--text);margin:0 0 30px}
.lede{font-size:19px;font-weight:300;line-height:1.65;color:var(--muted);margin:0 0 44px;max-width:470px}
.actions{display:flex;gap:18px}
.btn{height:64px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:600;letter-spacing:.08em;text-transform:uppercase}
.btn-solid{padding:0 46px;background:var(--accent);color:var(--bg)}
.btn-ghost{padding:0 40px;color:var(--text);background:color-mix(in srgb,var(--surface) 42%,transparent);border:1px solid color-mix(in srgb,var(--border) 75%,transparent);backdrop-filter:blur(16px)}
.chip{position:absolute;display:flex;align-items:center;gap:12px;height:56px;padding:0 26px;border-radius:999px;background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);color:var(--text);font-size:15px;font-weight:500;letter-spacing:.04em;z-index:6}
.chip .dot{width:9px;height:9px;border-radius:50%;background:var(--accent)}
.chip-a{left:612px;bottom:150px}
.chip-b{left:1052px;top:238px}
.bottomline{position:absolute;left:0;bottom:118px;width:1920px;height:1px;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--accent) 70%,transparent),transparent);opacity:.55;z-index:3}
.edge{position:absolute;left:0;bottom:0;width:1920px;height:240px;background:linear-gradient(to top,var(--bg) 8%,transparent 100%);z-index:4;pointer-events:none}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-43.1px;top:-235.3px;width:900px;height:1200px;transform:scale(0.71956);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:3533px;height:1988px;border-radius:16px;transform-origin:0 0;transform:matrix3d(0.194674468736, 0, 0, 0, 0.00722258029417, 0.20084118139, 0, 0.0000160501784315, 0, 0, 1, 0, 106.107550977, 351.711547735, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(0.202346986126, 0.00644592133635, 0, 0.0000377974793072, 0.0129337680086, 0.208936346938, 0, 0.00000812980323644, 0, 0, 1, 0, 127.608952389, 358.530188991, 0, 1)}.ui-shell-1{position:absolute;left:97px;top:327px;width:704px;height:542px;background-image:url(/stock/devices/display-turn.webp);background-repeat:no-repeat;background-size:704px 4878px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -4336px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}*{pointer-events:none}.ui-dev-2,.ui-dev-2 *{pointer-events:auto}.ui-stage-2{position:absolute;left:-56.7px;top:-437.9px;width:900px;height:1200px;transform:scale(1.18343);transform-origin:top left}.ui-screen-2{position:absolute;left:0;top:0;width:1781px;height:1160px;border-radius:22px;transform-origin:0 0;transform:matrix3d(0.239938370715, 0, 0, 0, 0.00809028390427, 0.24721112368, 0, 0.0000179784086762, 0, 0, 1, 0, 236.334880878, 392.445244317, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-2 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-2:hover .ui-screen-2{transform:matrix3d(0.243588265607, -0.0189874180754, 0, 0.0000423329434676, 0.0428811627876, 0.250520632593, 0, 0.0000102890315318, 0, 0, 1, 0, 165.531703242, 444.86698085, 0, 1)}.ui-shell-2{position:absolute;left:156px;top:370px;width:595px;height:507px;background-image:url(/stock/devices/macbook-turn.webp);background-repeat:no-repeat;background-size:595px 4563px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-2:hover .ui-shell-2{background-position:0 -4056px}.ui-dev-2{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-2:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-2,.ui-screen-2,.ui-shell-2{transition:none}}*{pointer-events:none}.ui-dev-3,.ui-dev-3 *{pointer-events:auto}.ui-stage-3{position:absolute;left:-115.7px;top:-73.1px;width:900px;height:1200px;transform:scale(0.53362);transform-origin:top left}.ui-screen-3{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-3 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-3:hover .ui-screen-3{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-3{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-3:hover .ui-shell-3{background-position:0 -7496px}.ui-dev-3{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-3:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-3,.ui-screen-3,.ui-shell-3{transition:none}}</style>
<div class="halo halo-a"></div>
<div class="halo halo-b"></div>
<div class="bigword">Workspace</div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:1310px;top:150px;width:560px;height:390px"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="ui-dev ui-dev-2" style="position:absolute;left:700px;top:150px;width:960px;height:600px"><div class="ui-stage ui-stage-2"><div class="ui-screen ui-screen-2"><img data-lumen-image="2"></div><div class="ui-shell ui-shell-2"></div></div></div></div>
<div class="ui-dev ui-dev-3" style="position:absolute;left:880px;top:250px;width:250px;height:500px"><div class="ui-stage ui-stage-3"><div class="ui-screen ui-screen-3"><img data-lumen-image="3"></div><div class="ui-shell ui-shell-3"></div></div></div></div>
<div class="bottomline"></div>
<div class="edge"></div>
<div class="copy">
<p class="kicker">V2.4 / AI Workspace</p>
<h1 class="title">One canvas for every team</h1>
<p class="lede">Docs, tables, chat and automations live side by side. Every edit syncs to the whole team the moment it lands.</p>
<div class="actions">
<div class="btn btn-solid">Start free</div>
<div class="btn btn-ghost">Book a demo</div>
</div>
</div>
<div class="chip chip-a"><span class="dot"></span>Q3 campaign · 78% complete</div>
<div class="chip chip-b"><span class="dot"></span>Live sync across 12 devices</div>
</div>`,
  },
  {
    id: "ui/centered-phone-bigword-chips@v1",
    name: "中机大字环绕",
    group: "phone",
    scene: "iphone",
    brief: "手机居中压在超大品牌字上，四周浮着毛玻璃胶囊标签，顶部一排栏目导航，适合展示单台手机 App 界面。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.kicker{text-transform:uppercase;font-size:13px;letter-spacing:.3em;color:var(--muted);font-weight:400}
.navval{font-size:17px;letter-spacing:.01em;color:var(--text);font-weight:500;margin-top:10px}
.chip{position:absolute;z-index:4;background:color-mix(in srgb,var(--surface) 62%,transparent);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid color-mix(in srgb,var(--border) 70%,transparent);border-radius:999px;color:var(--text);font-size:22px;font-weight:400;letter-spacing:.01em;padding:20px 40px;white-space:nowrap}
.glow{position:absolute;border-radius:50%;z-index:0}
*{pointer-events:none}.ui-dev-1,.ui-dev-1 *{pointer-events:auto}.ui-stage-1{position:absolute;left:-212.8px;top:-134.5px;width:900px;height:1200px;transform:scale(0.98186);transform-origin:top left}.ui-screen-1{position:absolute;left:0;top:0;width:384px;height:840px;border-radius:40px;transform-origin:0 0;transform:matrix3d(1.05663893567, 0, 0, 0, -0.0041633334536, 1.0508767055, 0, -0.00000925185211912, 0, 0, 1, 0, 247.125324351, 155.656054828, 0, 1);transition:transform 0.45s steps(8, end)}.ui-screen-1 img{width:100%;height:100%;object-fit:cover;display:block}.ui-dev-1:hover .ui-screen-1{transform:matrix3d(1.062539573, 0.131575590397, 0, 0.000201637337649, 0.0235747533358, 1.03341218797, 0, -0.000055699181359, 0, 0, 1, 0, 256.346200532, 145.773361789, 0, 1)}.ui-shell-1{position:absolute;left:224px;top:137px;width:454px;height:937px;background-image:url(/stock/devices/iphone-turn.webp);background-repeat:no-repeat;background-size:454px 8433px;background-position:0 0;transition:background-position 0.45s steps(8, end)}.ui-dev-1:hover .ui-shell-1{background-position:0 -7496px}.ui-dev-1{transition:translate .4s var(--ease-out,cubic-bezier(0.2,0,0,1)),scale .4s var(--ease-out,cubic-bezier(0.2,0,0,1))}.ui-dev-1:hover{translate:0 -16px;scale:1.04}@media (prefers-reduced-motion: reduce){.ui-dev-1,.ui-screen-1,.ui-shell-1{transition:none}}</style>
<div class="glow" style="left:420px;top:-260px;width:1080px;height:1080px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 30%,transparent),transparent 66%);opacity:.22"></div>
<div class="glow" style="left:1180px;top:340px;width:900px;height:900px;background:radial-gradient(circle,color-mix(in srgb,var(--brand) 32%,transparent),transparent 68%);opacity:.18"></div>
<div class="glow" style="left:120px;top:560px;width:760px;height:760px;background:radial-gradient(circle,color-mix(in srgb,var(--accent) 26%,transparent),transparent 70%);opacity:.16"></div>
<div style="position:absolute;left:330px;top:96px;z-index:1;font-family:var(--font-display);font-size:260px;line-height:.9;font-weight:900;letter-spacing:-.04em;color:var(--text);opacity:.14;white-space:nowrap">Homely</div>
<div style="position:absolute;left:0;right:0;bottom:0;height:340px;z-index:2;background:linear-gradient(to top,color-mix(in srgb,var(--bg) 92%,transparent),transparent)"></div>
<div style="position:absolute;left:90px;right:90px;top:54px;z-index:5;display:flex;justify-content:space-between;align-items:flex-start">
<div><div class="kicker">Project</div><div class="navval">Homely</div></div>
<div><div class="kicker">Work</div><div class="navval">Mobile App</div></div>
<div style="margin-top:2px"><div style="width:40px;height:40px;border:2px solid var(--text);border-radius:12px;display:flex;align-items:center;justify-content:center"><div style="width:15px;height:15px;border:2px solid var(--text);border-radius:4px"></div></div></div>
<div><div class="kicker">Created by</div><div class="navval">Varti Studio</div></div>
<div style="text-align:right"><div class="kicker">Published</div><div class="navval">2026</div></div>
</div>
<div class="ui-dev ui-dev-1" style="position:absolute;left:730px;top:120px;width:460px;height:920px;z-index:3"><div class="ui-stage ui-stage-1"><div class="ui-screen ui-screen-1"><img data-lumen-image="1"></div><div class="ui-shell ui-shell-1"></div></div></div></div>
<div class="chip" style="left:178px;top:520px">Everything in one place</div>
<div class="chip" style="left:1218px;top:330px">Smart living</div>
<div class="chip" style="left:1330px;top:726px">Comfort life</div>
<div style="position:absolute;left:178px;top:876px;width:440px;z-index:4">
<div class="kicker">IOS / ANDROID</div>
<p style="margin:14px 0 0;font-size:19px;line-height:1.6;font-weight:300;color:var(--muted)">Locks, lights and climate live on one screen, and every scene runs on the schedule you set once.</p>
</div>
</div>`,
  },
];
