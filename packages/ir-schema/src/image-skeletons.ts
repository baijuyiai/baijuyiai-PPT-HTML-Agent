import type { ImageLayout } from './image-layouts.js';

/**
 * 图文排版页的版式骨架。**这是生成文件，不要手改**。
 *
 * 由 `scripts/recognize-image-layouts.ts --emit` 从参考图识别出来并写入。
 * 改版式要改识别提示词再重跑，手改会在下一次生成时被覆盖。
 *
 * 两组按**图位张数**分：1 个图位是 `feature`（图文排版），2 个及以上是 `multi`（多图排版）。
 *
 * 每份都是**自包含**的（`<style>` + 一个根 `<div>`），不共用任何底座——
 * 所以各份之间的字号与留白是各自照参考图定的，横向摆在一起不必一致。
 *
 * 约束（只用 CSS 变量取色与三个字体角色、图位**不写** `data-lumen-cutout`、
 * 照片用 `object-fit:cover` 裁满）见 `image-layouts.ts` 顶部的说明。共 41 份。
 */
export const IMAGE_SKELETONS: ImageLayout[] = [
  {
    id: "gallery/scattered-polaroid-collage@v1",
    name: "散落拍立得拼贴",
    group: "multi",
    brief: "左栏标题与手写短句，右栏七张微旋转的拍立得相片错落堆叠，适合月度随手拍、生活记录类合集页。",
    slots: 7,
    skeleton: `<div class="collage" style="width:1920px;height:1080px;position:relative;background:var(--bg)"><style>.collage{font-family:var(--font-sans);color:var(--text);overflow:hidden}.mast{position:absolute;left:110px;top:92px;width:430px}.kicker{font-size:18px;font-weight:400;letter-spacing:.5em;text-transform:uppercase;color:var(--muted);margin:0}.h1{font-family:var(--font-display);font-size:150px;font-weight:900;line-height:.92;letter-spacing:-.035em;margin:14px 0 0}.sub{font-size:20px;font-weight:300;line-height:1.6;color:var(--muted);margin:24px 0 0}.chip{position:absolute;left:110px;top:566px;transform:rotate(-3deg);background:var(--accent);color:var(--bg);font-size:16px;font-weight:700;letter-spacing:.34em;text-transform:uppercase;padding:11px 22px}.quote{position:absolute;left:110px;bottom:104px;width:470px;font-family:var(--font-script);font-size:46px;line-height:1.4;margin:0;color:var(--text)}.foot{position:absolute;left:110px;bottom:56px;font-size:16px;letter-spacing:.36em;text-transform:uppercase;color:var(--muted)}.card{position:absolute;background:var(--surface);border:1px solid var(--border);padding:16px 16px 54px}.ph{overflow:hidden}.ph img{width:100%;height:100%;object-fit:cover;display:block}.cap{position:absolute;left:16px;bottom:16px;font-size:17px;letter-spacing:.06em;color:var(--muted);font-weight:400}</style><div class="mast"><p class="kicker">Recap / May</p><h1 class="h1">May Dumps</h1><p class="sub">Seven frames from a slow month: a desk at midnight, a cloud shaped like bread, oat milk in the left hand.</p></div><div class="chip">Take it easy</div><p class="quote">held on and a hope, that we'll find our way</p><p class="foot">Take photos for memories</p><div class="card" style="left:600px;top:80px;width:376px;transform:rotate(-6deg)"><div class="ph" style="height:250px"><img data-lumen-image="1"></div><p class="cap">Cloud bread, 21 May</p></div><div class="card" style="left:1010px;top:44px;width:412px;transform:rotate(4deg)"><div class="ph" style="height:272px"><img data-lumen-image="2"></div><p class="cap">Midnight activities</p></div><div class="card" style="left:1462px;top:104px;width:360px;transform:rotate(-3deg)"><div class="ph" style="height:238px"><img data-lumen-image="3"></div><p class="cap">The sunset was beautiful</p></div><div class="card" style="left:626px;top:500px;width:386px;transform:rotate(3deg)"><div class="ph" style="height:258px"><img data-lumen-image="4"></div><p class="cap">Watching hirono</p></div><div class="card" style="left:1044px;top:452px;width:372px;transform:rotate(-5deg)"><div class="ph" style="height:246px"><img data-lumen-image="5"></div><p class="cap">Take a pic, 04:12</p></div><div class="card" style="left:1468px;top:520px;width:352px;transform:rotate(6deg)"><div class="ph" style="height:232px"><img data-lumen-image="6"></div><p class="cap">Moonlight, 23:40</p></div><div class="card" style="left:920px;top:806px;width:400px;transform:rotate(-2deg)"><div class="ph" style="height:190px"><img data-lumen-image="7"></div><p class="cap">Oatside milk</p></div></div>`,
  },
  {
    id: "gallery/hero-title-stack@v1",
    name: "巨题压角配图",
    group: "feature",
    brief: "左侧小栏目行压一个超大展示标题加手写期号，右侧一张竖图配底部双标签注脚，适合开篇或章节封面。",
    slots: 1,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.hs-kicker{position:absolute;left:120px;top:170px;font-size:19px;font-weight:400;letter-spacing:.44em;text-transform:uppercase;color:var(--muted)}
.hs-title{position:absolute;left:112px;top:230px;font-family:var(--font-display);font-size:196px;font-weight:900;line-height:.88;letter-spacing:-.045em;color:var(--text)}
.hs-week{position:absolute;left:124px;top:405px;font-family:var(--font-script);font-size:92px;line-height:1;color:var(--accent)}
.hs-rule{position:absolute;left:124px;top:566px;width:180px;height:2px;background:var(--accent);opacity:.75}
.hs-body{position:absolute;left:124px;top:610px;width:620px;font-size:21px;font-weight:300;line-height:1.65;color:var(--muted)}
.hs-tags{position:absolute;left:124px;top:880px;display:flex;gap:14px}
.hs-tag{font-size:15px;font-weight:500;letter-spacing:.28em;text-transform:uppercase;color:var(--text);border:1px solid var(--border);padding:13px 22px;border-radius:999px}
.hs-ph{position:absolute;right:120px;top:180px;width:600px;height:720px;overflow:hidden;border:1px solid var(--border)}
.hs-ph img{width:100%;height:100%;object-fit:cover;display:block}
.hs-cap{position:absolute;right:120px;top:930px;width:600px;display:flex;justify-content:space-between;font-size:15px;font-weight:300;letter-spacing:.22em;text-transform:uppercase;color:var(--muted)}
</style>
<div class="hs-kicker">SELECTED SUMMER / 2026</div>
<div class="hs-title">July Dumps</div>
<div class="hs-week">Week 1</div>
<div class="hs-rule"></div>
<div class="hs-body">Nine rolls of film, four cities, and a notebook that never made it out of the bag. This is what the first week actually looked like.</div>
<div class="hs-tags"><div class="hs-tag">21 JUL 2026</div><div class="hs-tag">WEEK 01–05</div></div>
<div class="hs-ph"><img data-lumen-image="1"></div>
<div class="hs-cap"><span>Ferry pier, 06:40</span><span>MILAN</span></div>
</div>`,
  },
  {
    id: "gallery/scattered-photo-wall@v1",
    name: "散贴拍立得墙",
    group: "multi",
    brief: "在浅色底板上斜贴一排大小不一的拍立得相片，夹少量贴纸与手写批注，适合生活记录、花絮合集。",
    slots: 9,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.wall-board{position:absolute;left:60px;top:60px;width:1800px;height:960px;background:var(--surface);border:1px solid var(--border)}
.wall-card{position:absolute;box-sizing:border-box;display:flex;flex-direction:column;padding:14px;background:var(--bg);border:1px solid var(--border)}
.wall-card .ph{flex:1;overflow:hidden}
.wall-card .ph img{width:100%;height:100%;object-fit:cover;display:block}
.wall-cap{margin-top:12px;height:22px;font-size:14px;font-weight:300;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.wall-tag{position:absolute;left:100px;top:100px;font-size:15px;font-weight:500;letter-spacing:.4em;text-transform:uppercase;color:var(--muted);z-index:6}
.wall-strip{position:absolute;left:700px;top:540px;padding:14px 26px;background:var(--text);color:var(--bg);font-size:14px;font-weight:500;letter-spacing:.34em;text-transform:uppercase;transform:rotate(-2deg);z-index:6}
.wall-pill{position:absolute;left:1470px;top:520px;padding:14px 30px;border-radius:999px;background:var(--accent);color:var(--bg);font-size:22px;font-weight:900;letter-spacing:.14em;transform:rotate(-6deg);z-index:6}
.wall-script{position:absolute;left:110px;top:528px;font-family:var(--font-script);font-size:54px;color:var(--accent);z-index:6}
</style>
<div class="wall-board"></div>
<div class="wall-tag">JULY / WEEK 01</div>
<div class="wall-card" style="left:140px;top:170px;width:290px;height:350px;transform:rotate(-6deg)"><div class="ph"><img data-lumen-image="1"></div><div class="wall-cap">Porch, 06:40</div></div>
<div class="wall-card" style="left:470px;top:130px;width:330px;height:400px;transform:rotate(3deg)"><div class="ph"><img data-lumen-image="2"></div><div class="wall-cap">Tomatoes, day 9</div></div>
<div class="wall-card" style="left:830px;top:160px;width:300px;height:360px;transform:rotate(-3deg)"><div class="ph"><img data-lumen-image="3"></div><div class="wall-cap">Sunset, 21:04</div></div>
<div class="wall-card" style="left:1170px;top:140px;width:320px;height:380px;transform:rotate(5deg)"><div class="ph"><img data-lumen-image="4"></div><div class="wall-cap">Roll 1 of 8</div></div>
<div class="wall-card" style="left:1530px;top:180px;width:270px;height:330px;transform:rotate(-5deg)"><div class="ph"><img data-lumen-image="5"></div><div class="wall-cap">Cat, unimpressed</div></div>
<div class="wall-card" style="left:210px;top:570px;width:310px;height:380px;transform:rotate(4deg)"><div class="ph"><img data-lumen-image="6"></div><div class="wall-cap">Quiet hour, 19:20</div></div>
<div class="wall-card" style="left:580px;top:600px;width:290px;height:340px;transform:rotate(-4deg)"><div class="ph"><img data-lumen-image="7"></div><div class="wall-cap">Candle, night 3</div></div>
<div class="wall-card" style="left:920px;top:620px;width:300px;height:350px;transform:rotate(3deg)"><div class="ph"><img data-lumen-image="8"></div><div class="wall-cap">Grill night</div></div>
<div class="wall-card" style="left:1420px;top:590px;width:330px;height:390px;transform:rotate(-3deg)"><div class="ph"><img data-lumen-image="9"></div><div class="wall-cap">Table, page 12</div></div>
<div class="wall-script">life recently</div>
<div class="wall-strip">TAKE PHOTOS FOR MEMORIES</div>
<div class="wall-pill">HAHA</div>
</div>`,
  },
  {
    id: "gallery/calendar-photo-grid@v1",
    name: "月历格嵌照片",
    group: "multi",
    brief: "左侧竖排月份大字与说明，右侧七列月历网格，部分日期格直接嵌照片并压日期数字，适合日程、月度回顾。",
    slots: 7,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.cal-year{position:absolute;left:120px;top:150px;font-size:17px;font-weight:400;letter-spacing:.44em;text-transform:uppercase;color:var(--muted)}
.cal-month{position:absolute;left:112px;top:196px;font-family:var(--font-display);font-size:150px;font-weight:900;line-height:.9;letter-spacing:-.04em;color:var(--text)}
.cal-rule{position:absolute;left:124px;top:420px;width:160px;height:2px;background:var(--accent)}
.cal-note{position:absolute;left:124px;top:470px;width:360px;font-size:19px;font-weight:300;line-height:1.7;color:var(--muted)}
.cal-tag{position:absolute;left:124px;top:700px;font-size:14px;font-weight:500;letter-spacing:.3em;text-transform:uppercase;color:var(--text);border:1px solid var(--border);padding:12px 20px;border-radius:999px}
.cal-grid{position:absolute;left:620px;top:140px;width:1180px;height:800px;display:grid;grid-template-columns:repeat(7,1fr);grid-template-rows:40px repeat(5,1fr);gap:12px}
.cal-h{font-size:14px;font-weight:500;letter-spacing:.3em;text-transform:uppercase;color:var(--muted);align-self:end}
.cal-cell{position:relative;border:1px solid var(--border)}
.cal-d{position:absolute;left:10px;top:8px;font-size:17px;font-weight:400;color:var(--muted);z-index:3}
.cal-ph .ph{position:absolute;inset:0;overflow:hidden}
.cal-ph .ph img{width:100%;height:100%;object-fit:cover;display:block}
.cal-label{position:absolute;left:10px;bottom:9px;font-size:11px;font-weight:500;letter-spacing:.22em;text-transform:uppercase;color:var(--bg);z-index:3}
</style>
<div class="cal-year">Archive 2025</div>
<div class="cal-month">July</div>
<div class="cal-rule"></div>
<div class="cal-note">Thirty-one days, nine rolls of film, and a habit of writing down what the light looked like before it went.</div>
<div class="cal-tag">WEEK 01–05</div>
<div class="cal-grid">
<div class="cal-h">S</div><div class="cal-h">M</div><div class="cal-h">T</div><div class="cal-h">W</div><div class="cal-h">T</div><div class="cal-h">F</div><div class="cal-h">S</div>
<div class="cal-cell"></div><div class="cal-cell"></div><div class="cal-cell"><span class="cal-d">1</span></div><div class="cal-cell cal-ph"><span class="cal-d">2</span><div class="ph"><img data-lumen-image="1"></div><span class="cal-label">Porch</span></div><div class="cal-cell"><span class="cal-d">3</span></div><div class="cal-cell"><span class="cal-d">4</span></div><div class="cal-cell"><span class="cal-d">5</span></div>
<div class="cal-cell cal-ph"><span class="cal-d">6</span><div class="ph"><img data-lumen-image="2"></div><span class="cal-label">06:40</span></div><div class="cal-cell"><span class="cal-d">7</span></div><div class="cal-cell"><span class="cal-d">8</span></div><div class="cal-cell"><span class="cal-d">9</span></div><div class="cal-cell"><span class="cal-d">10</span></div><div class="cal-cell"><span class="cal-d">11</span></div><div class="cal-cell cal-ph"><span class="cal-d">12</span><div class="ph"><img data-lumen-image="3"></div><span class="cal-label">Market</span></div>
<div class="cal-cell"><span class="cal-d">13</span></div><div class="cal-cell"><span class="cal-d">14</span></div><div class="cal-cell"><span class="cal-d">15</span></div><div class="cal-cell"><span class="cal-d">16</span></div><div class="cal-cell cal-ph"><span class="cal-d">17</span><div class="ph"><img data-lumen-image="4"></div><span class="cal-label">Pier</span></div><div class="cal-cell"><span class="cal-d">18</span></div><div class="cal-cell"><span class="cal-d">19</span></div>
<div class="cal-cell"><span class="cal-d">20</span></div><div class="cal-cell cal-ph"><span class="cal-d">21</span><div class="ph"><img data-lumen-image="5"></div><span class="cal-label">21:04</span></div><div class="cal-cell"><span class="cal-d">22</span></div><div class="cal-cell"><span class="cal-d">23</span></div><div class="cal-cell cal-ph"><span class="cal-d">24</span><div class="ph"><img data-lumen-image="6"></div><span class="cal-label">Table</span></div><div class="cal-cell"><span class="cal-d">25</span></div><div class="cal-cell"><span class="cal-d">26</span></div>
<div class="cal-cell"><span class="cal-d">27</span></div><div class="cal-cell"><span class="cal-d">28</span></div><div class="cal-cell cal-ph"><span class="cal-d">29</span><div class="ph"><img data-lumen-image="7"></div><span class="cal-label">Night</span></div><div class="cal-cell"><span class="cal-d">30</span></div><div class="cal-cell"><span class="cal-d">31</span></div><div class="cal-cell"></div><div class="cal-cell"></div>
</div>
</div>`,
  },
  {
    id: "gallery/image-left-quote-card@v1",
    name: "左图右引文卡",
    group: "feature",
    brief: "左边一张近方形大图加双标签注脚，右边一块浮起的卡片放引文与手写签名，适合金句页、编辑手记。",
    slots: 1,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.q-ph{position:absolute;left:100px;top:140px;width:800px;height:800px;overflow:hidden;border:1px solid var(--border)}
.q-ph img{width:100%;height:100%;object-fit:cover;display:block}
.q-cap{position:absolute;left:100px;top:966px;width:800px;display:flex;justify-content:space-between;font-size:15px;font-weight:300;letter-spacing:.24em;text-transform:uppercase;color:var(--muted)}
.q-card{position:absolute;left:980px;top:180px;width:840px;height:720px;box-sizing:border-box;display:flex;flex-direction:column;padding:64px 68px;background:var(--surface);border:1px solid var(--border)}
.q-dots{display:flex;gap:10px;margin-bottom:42px}
.q-dot{width:13px;height:13px;border-radius:50%;background:var(--muted);opacity:.35}
.q-kicker{font-size:16px;font-weight:400;letter-spacing:.44em;text-transform:uppercase;color:var(--muted);margin-bottom:34px}
.q-quote{font-family:var(--font-display);font-size:46px;font-weight:400;line-height:1.45;letter-spacing:-.01em;color:var(--text)}
.q-sign{font-family:var(--font-script);font-size:42px;color:var(--accent);margin-top:auto}
.q-meta{font-size:14px;font-weight:300;letter-spacing:.26em;text-transform:uppercase;color:var(--muted);margin-top:18px}
</style>
<div class="q-ph"><img data-lumen-image="1"></div>
<div class="q-cap"><span>Sunset over the pier, 21:04</span><span>MILAN / 2026</span></div>
<div class="q-card">
<div class="q-dots"><div class="q-dot"></div><div class="q-dot"></div><div class="q-dot"></div></div>
<div class="q-kicker">NOTE / 04</div>
<div class="q-quote">We take pictures not to prove it happened, but so that one ordinary afternoon can come back warm and undamaged.</div>
<div class="q-sign">Week 1, page 12</div>
<div class="q-meta">RECORDED 21 JUL 2026 / 21:04</div>
</div>
</div>`,
  },
  {
    id: "gallery/image-left-message-row@v1",
    name: "左图右对话条",
    group: "feature",
    brief: "左边一张大图配注脚，右边竖排两条圆角对话气泡带时间戳，适合聊天记录、来信或问答页。",
    slots: 1,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.ms-kicker{position:absolute;left:120px;top:96px;font-size:18px;font-weight:400;letter-spacing:.44em;text-transform:uppercase;color:var(--muted)}
.ms-now{position:absolute;right:120px;top:96px;font-size:16px;font-weight:400;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)}
.ms-ph{position:absolute;left:120px;top:200px;width:760px;height:700px;overflow:hidden;border:1px solid var(--border)}
.ms-ph img{width:100%;height:100%;object-fit:cover;display:block}
.ms-cap{position:absolute;left:120px;top:930px;width:760px;display:flex;justify-content:space-between;font-size:15px;font-weight:300;letter-spacing:.24em;text-transform:uppercase;color:var(--muted)}
.ms-col{position:absolute;left:1030px;top:222px;width:770px}
.ms-name{font-size:15px;font-weight:500;letter-spacing:.34em;text-transform:uppercase;color:var(--muted);margin-bottom:16px}
.ms-in{box-sizing:border-box;background:var(--surface);border:1px solid var(--border);border-radius:28px;padding:34px 40px;font-size:31px;font-weight:400;line-height:1.5;color:var(--text)}
.ms-time{font-size:14px;font-weight:300;letter-spacing:.24em;text-transform:uppercase;color:var(--muted);margin:14px 0 44px 6px}
.ms-out{box-sizing:border-box;margin-left:150px;background:var(--accent);border-radius:28px;padding:30px 40px;font-size:27px;font-weight:500;line-height:1.45;color:var(--bg)}
</style>
<div class="ms-kicker">MESSAGES / INBOX</div>
<div class="ms-now">NOW 21:40</div>
<div class="ms-ph"><img data-lumen-image="1"></div>
<div class="ms-cap"><span>Rooftop table, 19:20</span><span>MILAN / JUL 2026</span></div>
<div class="ms-col">
<div class="ms-name">Mom</div>
<div class="ms-in">Lychees are in at the corner shop. Come home and eat, there is plenty.</div>
<div class="ms-time">21:38</div>
<div class="ms-out">On my way. Save me the cold ones.</div>
<div class="ms-time">21:40</div>
</div>
</div>`,
  },
  {
    id: "gallery/photo-band-icon-labels@v1",
    name: "上图带八标签",
    group: "multi",
    brief: "顶部四张同宽照片横向铺满，下方弧形白色面板居中大标题，底部一行八个图标加分类标签，适合运动、生活方式类主题页。",
    slots: 4,
    skeleton: `<div class="wrap" style="width:1920px;height:1080px;position:relative">
<style>
.wrap{background:var(--bg);overflow:hidden}
.strip{position:absolute;left:0;top:0;width:1920px;height:600px;display:flex;gap:5px}
.ph{overflow:hidden;flex:1 1 0;background:var(--surface)}
.ph img{width:100%;height:100%;object-fit:cover;display:block}
.panel{position:absolute;left:0;bottom:0;width:1920px;height:620px;box-sizing:border-box;background:var(--surface);border-radius:960px 960px 0 0/120px 120px 0 0;padding:160px 110px 70px;display:flex;flex-direction:column;align-items:center}
.kicker{margin:0;font-size:15px;font-weight:400;letter-spacing:.46em;text-transform:uppercase;color:var(--muted)}
.title{margin:22px 0 0;max-width:1520px;font-family:var(--font-display);font-size:96px;font-weight:900;line-height:.95;letter-spacing:-.02em;text-transform:uppercase;color:var(--text)}
.rule{width:120px;height:1px;margin:44px 0 0;background:var(--border)}
.row{margin-top:auto;width:100%;display:flex;justify-content:space-between;align-items:flex-start}
.item{width:190px;text-align:center}
.ico{position:relative;width:48px;height:48px;margin:0 auto 16px;border:2px solid var(--text);border-radius:50%;opacity:.85}
.ico span{position:absolute;left:10px;top:22px;width:26px;height:2px;background:var(--text);transform:rotate(-38deg)}
.lbl{margin:0;min-height:48px;font-size:15px;font-weight:400;letter-spacing:.16em;line-height:1.6;text-transform:uppercase;color:var(--text)}
</style>
<div class="strip">
<div class="ph"><img data-lumen-image="1"></div>
<div class="ph"><img data-lumen-image="2"></div>
<div class="ph"><img data-lumen-image="3"></div>
<div class="ph"><img data-lumen-image="4"></div>
</div>
<div class="panel">
<p class="kicker">Outdoor Series / 2026</p>
<h1 class="title">Enjoy Every Moment in the Sun</h1>
<div class="rule"></div>
<div class="row">
<div class="item"><div class="ico"><span></span></div><p class="lbl">Road Cycling</p></div>
<div class="item"><div class="ico"><span></span></div><p class="lbl">Mountain Bike</p></div>
<div class="item"><div class="ico"><span></span></div><p class="lbl">Trail Running</p></div>
<div class="item"><div class="ico"><span></span></div><p class="lbl">Open Air</p></div>
<div class="item"><div class="ico"><span></span></div><p class="lbl">Snow Season</p></div>
<div class="item"><div class="ico"><span></span></div><p class="lbl">Water Sport</p></div>
<div class="item"><div class="ico"><span></span></div><p class="lbl">Golf Course</p></div>
<div class="item"><div class="ico"><span></span></div><p class="lbl">Indoor Sport</p></div>
</div>
</div>
</div>`,
  },
  {
    id: "gallery/full-bleed-hero-tag@v1",
    name: "满屏大图标签条",
    group: "feature",
    brief: "一张照片铺满整页，左下压一条半透明标签条与巨字标题，适合做章节封面或单张主视觉。",
    slots: 1,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)"><style>.hero{position:absolute;inset:0;overflow:hidden}.hero img{width:100%;height:100%;object-fit:cover;display:block}.kick{position:absolute;left:104px;top:92px;font-family:var(--font-sans);font-weight:600;font-size:20px;letter-spacing:.42em;text-transform:uppercase;color:var(--text)}.head{position:absolute;left:104px;bottom:250px;font-family:var(--font-display);font-weight:900;font-size:152px;line-height:.92;letter-spacing:-.03em;text-transform:uppercase;color:var(--text)}.bar{position:absolute;left:104px;bottom:104px;width:540px;height:76px;background:var(--bg);opacity:.82}.tag{position:absolute;left:104px;bottom:104px;width:540px;height:76px;display:flex;align-items:center;padding-left:32px;box-sizing:border-box;font-family:var(--font-sans);font-weight:600;font-size:22px;letter-spacing:.34em;text-transform:uppercase;color:var(--text)}.note{position:absolute;right:104px;bottom:116px;font-family:var(--font-sans);font-weight:300;font-size:20px;letter-spacing:.24em;text-transform:uppercase;color:var(--text);opacity:.9}</style><div class="hero"><img data-lumen-image="1" alt=""></div><div class="kick">SELECTED SERIES / 2026</div><div class="head">OUTDOOR<br>SPORTS</div><div class="bar"></div><div class="tag">Trail Running, Milan</div><div class="note">Frame 01 / 12 Dec 2026</div></div>`,
  },
  {
    id: "gallery/hero-left-five-grid@v1",
    name: "左大图右五格",
    group: "multi",
    brief: "左侧一张通栏大图配标签条，右侧两行五格小图拼贴，每格压一条类别标签，适合栏目总览。",
    slots: 6,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)"><style>.hero{position:absolute;left:0;top:0;width:700px;height:1080px;overflow:hidden}.hero img{width:100%;height:100%;object-fit:cover;display:block}.kick{position:absolute;left:56px;top:88px;font-family:var(--font-sans);font-weight:600;font-size:22px;letter-spacing:.4em;text-transform:uppercase;color:var(--text)}.herobar{position:absolute;left:56px;bottom:96px;width:452px;height:72px;background:var(--bg);opacity:.84}.herotag{position:absolute;left:56px;bottom:96px;width:452px;height:72px;display:flex;align-items:center;padding-left:28px;box-sizing:border-box;font-family:var(--font-sans);font-weight:600;font-size:20px;letter-spacing:.32em;text-transform:uppercase;color:var(--text)}.stack{position:absolute;left:740px;top:60px;width:1120px;height:960px;display:flex;flex-direction:column;gap:20px}.row{display:flex;gap:20px;flex:1}.cell{position:relative;flex:1;overflow:hidden;background:var(--surface)}.cell img{width:100%;height:100%;object-fit:cover;display:block}.bar{position:absolute;left:28px;bottom:28px;padding:18px 26px;background:var(--bg);opacity:.84}.tag{position:absolute;left:28px;bottom:28px;padding:18px 26px;font-family:var(--font-sans);font-weight:600;font-size:18px;letter-spacing:.3em;text-transform:uppercase;color:var(--text)}</style><div class="hero"><img data-lumen-image="1" alt=""></div><div class="kick">FIELD NOTES / VOL. 04</div><div class="herobar"></div><div class="herotag">Outdoor Sports</div><div class="stack"><div class="row"><div class="cell"><img data-lumen-image="2" alt=""><div class="bar"></div><div class="tag">Fishing</div></div><div class="cell"><img data-lumen-image="3" alt=""><div class="bar"></div><div class="tag">Exercise</div></div></div><div class="row"><div class="cell"><img data-lumen-image="4" alt=""><div class="bar"></div><div class="tag">Travel</div></div><div class="cell"><img data-lumen-image="5" alt=""><div class="bar"></div><div class="tag">Mountain Climbing</div></div><div class="cell"><img data-lumen-image="6" alt=""><div class="bar"></div><div class="tag">Camping</div></div></div></div></div>`,
  },
  {
    id: "gallery/six-tile-labeled-grid@v1",
    name: "六格标签图阵",
    group: "multi",
    brief: "三列两行的等分图片墙，每格左上角编号、左下角压半透明标签条，适合并列展示六个类别。",
    slots: 6,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)"><style>.grid{position:absolute;left:60px;top:60px;width:1800px;height:960px;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(2,1fr);gap:22px}.cell{position:relative;overflow:hidden;background:var(--surface)}.cell img{width:100%;height:100%;object-fit:cover;display:block}.bar{position:absolute;left:26px;bottom:26px;padding:16px 24px;background:var(--bg);opacity:.84}.tag{position:absolute;left:26px;bottom:26px;padding:16px 24px;font-family:var(--font-sans);font-weight:600;font-size:18px;letter-spacing:.3em;text-transform:uppercase;color:var(--text)}.num{position:absolute;right:26px;top:24px;font-family:var(--font-display);font-weight:400;font-size:30px;letter-spacing:.08em;color:var(--text);opacity:.92}</style><div class="grid"><div class="cell"><img data-lumen-image="1" alt=""><div class="num">01</div><div class="bar"></div><div class="tag">Outdoor Sports</div></div><div class="cell"><img data-lumen-image="2" alt=""><div class="num">02</div><div class="bar"></div><div class="tag">Fishing</div></div><div class="cell"><img data-lumen-image="3" alt=""><div class="num">03</div><div class="bar"></div><div class="tag">Exercise</div></div><div class="cell"><img data-lumen-image="4" alt=""><div class="num">04</div><div class="bar"></div><div class="tag">Travel</div></div><div class="cell"><img data-lumen-image="5" alt=""><div class="num">05</div><div class="bar"></div><div class="tag">Mountain Climbing</div></div><div class="cell"><img data-lumen-image="6" alt=""><div class="num">06</div><div class="bar"></div><div class="tag">Camping</div></div></div></div>`,
  },
  {
    id: "gallery/three-column-five-photo@v1",
    name: "三栏五图带大标",
    group: "multi",
    brief: "左二右二三栏排布五张场景图，中间一幅大图，底部压一行超大写标题，适合运动服饰的多场景展示。",
    slots: 5,
    skeleton: `<div class="page"><style>.page{width:1920px;height:1080px;position:relative;background:var(--bg);color:var(--text);font-family:var(--font-sans)}.col{position:absolute;top:64px;height:656px;display:flex;flex-direction:column;gap:24px}.col-l{left:64px;width:500px}.col-r{left:1388px;width:468px}.ph{position:relative;overflow:hidden;border-radius:24px;background:var(--surface)}.col .ph{flex:1 1 0;min-height:0}.ph img{width:100%;height:100%;object-fit:cover;display:block}.hero{position:absolute;left:596px;top:64px;width:760px;height:656px;overflow:hidden;border-radius:24px;background:var(--surface)}.hero img{width:100%;height:100%;object-fit:cover;display:block}.tag{position:absolute;left:26px;bottom:26px;display:flex;align-items:center;padding:13px 26px}.tag .bg{position:absolute;left:0;top:0;right:0;bottom:0;background:var(--surface);opacity:.74;border-radius:999px}.tag .tx{position:relative;font-size:20px;font-weight:600;letter-spacing:.3em;text-transform:uppercase;color:var(--text)}.kicker{position:absolute;left:64px;top:756px;margin:0;font-size:13px;font-weight:400;letter-spacing:.5em;text-transform:uppercase;color:var(--muted)}.head{position:absolute;left:64px;top:792px;width:1500px;margin:0;font-family:var(--font-display);font-size:108px;line-height:1.02;font-weight:900;letter-spacing:-.02em;text-transform:uppercase;color:var(--text)}</style><div class="col col-l"><div class="ph"><img data-lumen-image="1"><div class="tag"><span class="bg"></span><span class="tx">Casual</span></div></div><div class="ph"><img data-lumen-image="2"><div class="tag"><span class="bg"></span><span class="tx">Running</span></div></div></div><div class="hero"><img data-lumen-image="3"><div class="tag"><span class="bg"></span><span class="tx">Outdoor</span></div></div><div class="col col-r"><div class="ph"><img data-lumen-image="4"><div class="tag"><span class="bg"></span><span class="tx">Training</span></div></div><div class="ph"><img data-lumen-image="5"><div class="tag"><span class="bg"></span><span class="tx">Gym</span></div></div></div><p class="kicker">Five scenes / one kit</p><h1 class="head">Apply for various scenes<br>Comfortable to wear</h1></div>`,
  },
  {
    id: "gallery/tilted-scenario-row@v1",
    name: "斜切四图场景栏",
    group: "multi",
    brief: "顶部大标题配一句说明，下方四张微微倾斜的照片卡横向并列，每张卡下挂编号与场景标签，适合按使用场景陈列同一件产品。",
    slots: 4,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden">
<style>
.wrap{position:absolute;inset:0;display:flex;flex-direction:column;padding:70px 90px 76px;box-sizing:border-box}
.head{display:flex;align-items:flex-end;justify-content:space-between;gap:60px}
h1{margin:0;font-family:var(--font-display);font-size:96px;font-weight:900;line-height:.95;letter-spacing:-.03em;text-transform:uppercase;color:var(--text);max-width:1220px}
.kicker{font-size:14px;font-weight:500;letter-spacing:.44em;text-transform:uppercase;color:var(--muted);white-space:nowrap;padding-bottom:12px}
.deck{margin:22px 0 0;font-size:19px;font-weight:300;line-height:1.65;color:var(--muted);max-width:620px}
.grid{margin-top:auto;display:grid;grid-template-columns:repeat(4,1fr);gap:28px}
.card{position:relative}
.ph{overflow:hidden;height:600px;border-radius:6px;background:var(--surface);border:1px solid var(--border)}
.ph img{width:100%;height:100%;object-fit:cover;display:block}
.t1 .ph{transform:rotate(-3.5deg)}
.t2 .ph{transform:rotate(2.6deg)}
.t3 .ph{transform:rotate(-2.2deg)}
.t4 .ph{transform:rotate(3.4deg)}
.meta{margin-top:34px;display:flex;align-items:baseline;gap:14px}
.num{font-size:12px;font-weight:300;letter-spacing:.32em;color:var(--muted);opacity:.8}
.lab{font-size:15px;font-weight:600;letter-spacing:.32em;text-transform:uppercase;color:var(--text)}
</style>
<div class="wrap">
<div class="head">
<h1>Built For Every Hour Outside</h1>
<div class="kicker">Field Series / 2026</div>
</div>
<p class="deck">Four ways the same frame gets used: pavement, climb, trail, and the last cold hour on the water.</p>
<div class="grid">
<div class="card t1"><div class="ph"><img data-lumen-image="1" alt=""></div><div class="meta"><span class="num">01</span><span class="lab">Running</span></div></div>
<div class="card t2"><div class="ph"><img data-lumen-image="2" alt=""></div><div class="meta"><span class="num">02</span><span class="lab">Cycling</span></div></div>
<div class="card t3"><div class="ph"><img data-lumen-image="3" alt=""></div><div class="meta"><span class="num">03</span><span class="lab">Hiking</span></div></div>
<div class="card t4"><div class="ph"><img data-lumen-image="4" alt=""></div><div class="meta"><span class="num">04</span><span class="lab">Fishing</span></div></div>
</div>
</div>
</div>`,
  },
  {
    id: "gallery/five-photo-center-title@v1",
    name: "五图环绕标题",
    group: "multi",
    brief: "五张照片围住中央标题卡的拼贴版式，适合运动、生活方式等有多个场景要并列展示的主题。",
    slots: 5,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden"><style>.ph{overflow:hidden;position:absolute}.ph img{width:100%;height:100%;object-fit:cover;display:block}.p1{left:0;top:0;width:712px;height:1080px}.p2{left:720px;top:0;width:560px;height:392px}.p3{left:720px;top:688px;width:560px;height:392px}.p4{left:1288px;top:0;width:632px;height:536px}.p5{left:1288px;top:544px;width:632px;height:536px}.card{position:absolute;left:720px;top:400px;width:560px;height:280px;background:var(--surface);display:flex;flex-direction:column;justify-content:center;padding:0 36px;box-sizing:border-box}.kicker{font-size:13px;font-weight:400;letter-spacing:.36em;text-transform:uppercase;color:var(--muted);margin:0 0 16px}.head{font-family:var(--font-display);font-size:108px;font-weight:900;line-height:.9;letter-spacing:-.03em;text-transform:uppercase;color:var(--text);margin:0}.desc{font-size:16px;font-weight:300;line-height:1.6;color:var(--muted);margin:18px 0 0;max-width:420px}.tag{position:absolute;left:28px;bottom:28px;background:var(--bg);padding:14px 20px 12px;border-left:4px solid var(--accent)}.nm{display:block;font-size:20px;font-weight:700;letter-spacing:.26em;text-transform:uppercase;color:var(--text)}.dt{display:block;font-size:14px;font-weight:300;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-top:6px}</style><div class="ph p1"><img data-lumen-image="1" alt=""><div class="tag"><span class="nm">Running</span><span class="dt">Coastal Trail, 06:40</span></div></div><div class="ph p2"><img data-lumen-image="2" alt=""><div class="tag"><span class="nm">Yoga</span><span class="dt">Studio B, Lisbon</span></div></div><div class="ph p3"><img data-lumen-image="3" alt=""><div class="tag"><span class="nm">Workout</span><span class="dt">Core Set, Week 3</span></div></div><div class="ph p4"><img data-lumen-image="4" alt=""><div class="tag"><span class="nm">Cycling</span><span class="dt">Ridge Route, 42 km</span></div></div><div class="ph p5"><img data-lumen-image="5" alt=""><div class="tag"><span class="nm">Fitness</span><span class="dt">Heavy Bag, Round 4</span></div></div><div class="card"><p class="kicker">Training / 2026</p><h1 class="head">Suitable<br>Occasion</h1><p class="desc">Five sessions shot across one week in Lisbon: pavement, mat, saddle, floor and bag. Same athlete, five different mornings.</p></div></div>`,
  },
  {
    id: "gallery/left-title-center-hero@v1",
    name: "左题中图右双格",
    group: "multi",
    brief: "左侧竖排大标题配手写签名，中间一整幅主视觉，右侧两格小图加说明与行动标签，适合时尚、作品特写或个人专辑页。",
    slots: 5,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden"><style>.topbar{position:absolute;left:64px;right:64px;top:44px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);padding-bottom:16px}.logo{font-family:var(--font-script);font-size:42px;line-height:1;color:var(--text)}.nav{display:flex;align-items:center;gap:40px;font-size:12px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted);font-weight:400}.nav .lead{color:var(--text);font-weight:600}.ph{overflow:hidden;background:var(--surface)}.ph img{width:100%;height:100%;object-fit:cover;display:block}.headline{position:absolute;left:64px;top:236px;width:420px}.kicker{font-size:12px;letter-spacing:.36em;text-transform:uppercase;color:var(--muted);font-weight:400;margin:0}.title{font-family:var(--font-display);font-size:126px;line-height:.94;letter-spacing:-.025em;font-weight:800;color:var(--text);margin:26px 0 0}.sig{font-family:var(--font-script);font-size:54px;line-height:1;color:var(--text);opacity:.8;margin:22px 0 0}.note{font-size:16px;line-height:1.6;color:var(--muted);font-weight:300;margin:24px 0 0;max-width:330px}.thumbrow{position:absolute;left:64px;bottom:84px;display:flex;gap:20px}.thumbrow .ph{width:200px;height:248px}.hero{position:absolute;left:540px;top:148px;width:780px;height:790px}.rightcol{position:absolute;left:1370px;top:148px;width:486px}.rightrow{display:flex;gap:22px}.rightrow .ph{width:232px;height:300px}.pager{margin-top:36px;font-size:12px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted);font-weight:400}.cap{margin-top:26px;font-size:17px;line-height:1.6;color:var(--text);font-weight:300;max-width:420px}.cta{margin-top:24px;font-size:12px;letter-spacing:.34em;text-transform:uppercase;color:var(--accent);font-weight:600}</style><div class="topbar"><div class="logo">Aurelle</div><div class="nav"><span class="lead">Search</span><span>Log In</span><span>Help</span><span>Bag (0)</span></div></div><div class="hero ph"><img data-lumen-image="1"></div><div class="headline"><p class="kicker">Spring / Summer 2020</p><h1 class="title">Sunset<br>Shades</h1><div class="sig">S. Marche</div><p class="note">Linen and washed silk, cut loose for open water. Shot on the Amalfi coast across three mornings in June.</p></div><div class="thumbrow"><div class="ph"><img data-lumen-image="2"></div><div class="ph"><img data-lumen-image="3"></div></div><div class="rightcol"><div class="rightrow"><div class="ph"><img data-lumen-image="4"></div><div class="ph"><img data-lumen-image="5"></div></div><div class="pager">01 / 05</div><p class="cap">Choose earth-friendly fibre, dyed in small batches near Lake Como since 2018.</p><div class="cta">Get The Look</div></div></div>`,
  },
  {
    id: "gallery/circle-hero-row@v1",
    name: "巨题圆阵群像",
    group: "multi",
    brief: "居中巨字标题下方横向摊开一圈大小不一的圆形照片，适合人物群像、艺术家名录或团队成员开篇页。",
    slots: 10,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);color:var(--text)">
<style>
.hd{position:absolute;top:58px;left:88px;right:88px;display:flex;align-items:center;justify-content:space-between}
.logo{font-size:26px;font-weight:900;letter-spacing:.44em;text-transform:uppercase}
.nav{display:flex;align-items:center;gap:36px}
.navtxt{font-size:13px;font-weight:400;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.av{width:42px;height:42px;border-radius:50%;overflow:hidden}
.av img{width:100%;height:100%;object-fit:cover;display:block}
.bars{display:flex;flex-direction:column;gap:8px;width:34px}
.bars span{display:block;height:1px;background:var(--text);opacity:.75}
.title{position:absolute;top:160px;left:0;width:100%;text-align:center;font-family:var(--font-display);font-weight:900;font-size:188px;line-height:.9;letter-spacing:-.05em;text-transform:uppercase}
.c{position:absolute;border-radius:50%;overflow:hidden}
.c img{width:100%;height:100%;object-fit:cover;display:block}
.rule{position:absolute;top:930px;left:660px;width:600px;height:1px;background:var(--text);opacity:.3}
.cap{position:absolute;top:962px;left:0;width:100%;margin:0;text-align:center;font-size:15px;line-height:1.75;letter-spacing:.08em;color:var(--muted)}
</style>
<div class="hd">
<div class="logo">FORMA</div>
<div class="nav">
<span class="navtxt">Shop</span>
<div class="av"><img data-lumen-image="10"></div>
<div class="bars"><span></span><span></span></div>
</div>
</div>
<div class="title">Artists</div>
<div class="c" style="left:-130px;top:490px;width:340px;height:340px"><img data-lumen-image="1"></div>
<div class="c" style="left:185px;top:385px;width:230px;height:230px"><img data-lumen-image="2"></div>
<div class="c" style="left:455px;top:385px;width:210px;height:210px"><img data-lumen-image="3"></div>
<div class="c" style="left:295px;top:625px;width:250px;height:250px"><img data-lumen-image="4"></div>
<div class="c" style="left:615px;top:605px;width:210px;height:210px"><img data-lumen-image="5"></div>
<div class="c" style="left:775px;top:385px;width:450px;height:450px"><img data-lumen-image="6"></div>
<div class="c" style="left:1240px;top:420px;width:400px;height:400px"><img data-lumen-image="7"></div>
<div class="c" style="left:1645px;top:385px;width:230px;height:230px"><img data-lumen-image="8"></div>
<div class="c" style="left:1695px;top:675px;width:210px;height:210px"><img data-lumen-image="9"></div>
<div class="rule"></div>
<p class="cap">Nine portraits, one room.<br>Shot in Milan across three days in March 2026.</p>
</div>`,
  },
  {
    id: "gallery/giant-title-five-staggered-cards@v1",
    name: "巨字下五图错排",
    group: "multi",
    brief: "顶部左大字标题配右侧短说明，深色面板内巨字标题下五张错落竖图横向连排并带图注，底部圆形翻页按钮；适合作品集精选页。",
    slots: 5,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden"><style>.wrap{position:absolute;inset:0;padding:52px 110px 0}.head{display:flex;justify-content:space-between;align-items:flex-start}.head h1{margin:0;max-width:620px;font-family:var(--font-display);font-size:76px;line-height:.94;font-weight:900;letter-spacing:-.02em;color:var(--text)}.head p{margin:14px 0 0;max-width:520px;font-size:19px;line-height:1.55;font-weight:300;color:var(--muted)}.panel{position:absolute;left:110px;right:110px;top:214px;bottom:46px;background:var(--surface);border-radius:8px;padding:54px 72px 28px;display:flex;flex-direction:column}.top{display:flex;align-items:flex-start;gap:56px}.note{margin:18px 0 0;width:252px;flex:none;font-size:16px;line-height:1.6;font-weight:400;color:var(--text);opacity:.7}.big{margin:0;flex:1;text-align:center;font-family:var(--font-display);font-size:156px;line-height:.88;font-weight:900;letter-spacing:-.04em;color:var(--text);text-transform:uppercase}.photos{flex:1;display:flex;align-items:center;justify-content:center;gap:26px}.card{position:relative;flex:none;border-radius:18px;overflow:hidden}.card img{width:100%;height:100%;object-fit:cover;display:block}.c1{width:250px;height:300px;margin-top:40px}.c2{width:250px;height:360px;margin-top:14px}.c3{width:320px;height:420px}.c4{width:250px;height:360px;margin-top:14px}.c5{width:250px;height:300px;margin-top:40px}.cap{position:absolute;left:0;right:0;bottom:0;padding:52px 18px 14px;background:linear-gradient(to top,var(--surface),transparent)}.cap span{display:block;font-size:14px;font-weight:500;letter-spacing:.16em;text-transform:uppercase;color:var(--text)}.tag{position:absolute;top:16px;left:16px;padding:7px 16px;border-radius:999px;background:var(--surface);color:var(--text);font-size:13px;font-weight:500;letter-spacing:.16em;text-transform:uppercase}.nav{display:flex;justify-content:center;gap:14px;padding-top:16px}.nav span{width:56px;height:56px;border-radius:50%;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:20px;color:var(--text)}.nav span.on{border-color:var(--text)}</style><div class="wrap"><div class="head"><h1>View our latest works</h1><p>Nine pieces this season, each one drawn, cast and polished by hand in our Lisbon studio before it leaves the bench.</p></div></div><div class="panel"><div class="top"><p class="note">Cast in recycled 18k gold, so no two surfaces catch the light the same way twice.</p><h2 class="big">Our Works</h2></div><div class="photos"><div class="card c1"><img data-lumen-image="1"><div class="cap"><span>Roseline Ring, 2026</span></div></div><div class="card c2"><img data-lumen-image="2"><div class="cap"><span>The Zoe Earrings</span></div></div><div class="card c3"><img data-lumen-image="3"><span class="tag">Rings</span><div class="cap"><span>The Hibiscus Ring II</span></div></div><div class="card c4"><img data-lumen-image="4"><div class="cap"><span>Chubby Hoops, Gold</span></div></div><div class="card c5"><img data-lumen-image="5"><div class="cap"><span>The Nico Chain, 04/12</span></div></div></div><div class="nav"><span>←</span><span class="on">→</span></div></div></div>`,
  },
  {
    id: "gallery/title-over-card-carousel@v1",
    name: "上标题下五卡轮播",
    group: "multi",
    brief: "顶部一行导航，中间大号衬线标题居中，底部五张圆角竖卡横向排开、中间最大两侧渐小并向画面外溢出，适合展示一组精选作品或热门文章。",
    slots: 5,
    skeleton: `<div class="root" style="width:1920px;height:1080px;position:relative"><style>*{box-sizing:border-box;margin:0;padding:0}.root{background:var(--bg);color:var(--text);font-family:var(--font-sans);overflow:hidden}.top{position:absolute;top:0;left:0;width:1920px;height:112px;display:flex;align-items:center;justify-content:space-between;padding:0 64px}.brand{display:flex;align-items:center;gap:18px;font-size:23px;font-weight:700;letter-spacing:.02em}.dash{width:56px;height:1px;background:var(--text);opacity:.5}.nav{display:flex;gap:44px;font-size:15px;font-weight:400;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}.title{position:absolute;top:140px;left:0;width:1920px;padding:0 320px;text-align:center;font-family:var(--font-display);font-size:100px;font-weight:400;line-height:1.03;letter-spacing:-0.02em}.row{position:absolute;left:0;bottom:60px;width:1920px;height:600px;display:flex;align-items:flex-end;justify-content:center;gap:30px;overflow:hidden}.card{position:relative;flex:0 0 auto;border-radius:28px;overflow:hidden;border:1px solid var(--border)}.card img{width:100%;height:100%;object-fit:cover;display:block}.c1,.c5{width:340px;height:410px;opacity:.85}.c2,.c4{width:380px;height:480px}.c3{width:460px;height:560px}.cap{position:absolute;left:26px;right:26px;bottom:24px;font-family:var(--font-display);font-size:24px;font-weight:400;line-height:1.25;text-shadow:0 2px 24px var(--bg)}.c3 .cap{left:32px;right:32px;bottom:30px;font-size:30px}</style><div class="top"><div class="brand">Voyager2<span class="dash"></span></div><div class="nav"><span>Places</span><span>Authors</span><span>Navigator</span><span>About</span><span>Connect</span></div></div><div class="title">Selected and popular posts on the social right now</div><div class="row"><div class="card c1"><img data-lumen-image="1"><div class="cap">Getting the look in Detroit</div></div><div class="card c2"><img data-lumen-image="2"><div class="cap">Selected projects from the last month</div></div><div class="card c3"><img data-lumen-image="3"><div class="cap">Otherworldly places located on Earth</div></div><div class="card c4"><img data-lumen-image="4"><div class="cap">Visualizing distorted sound mixes</div></div><div class="card c5"><img data-lumen-image="5"><div class="cap">Analog rituals in paper form</div></div></div></div>`,
  },
  {
    id: "gallery/left-copy-right-triptych@v1",
    name: "左文右三联图",
    group: "multi",
    brief: "左侧竖排文案区配大标题与胶囊按钮，右侧三张照片拼成不等高图阵，适合单品发布或作品首图页。",
    slots: 3,
    skeleton: `<div class="l1" style="width:1920px;height:1080px;position:relative;background:var(--bg);color:var(--text);font-family:var(--font-sans);overflow:hidden"><style>.l1 *{margin:0;padding:0;box-sizing:border-box}.l1 .ph{overflow:hidden}.l1 .ph img{width:100%;height:100%;object-fit:cover;display:block}.l1-brand{position:absolute;left:150px;top:54px;font-size:15px;font-weight:700;letter-spacing:.02em}.l1-menu{position:absolute;right:150px;top:58px;display:flex;gap:44px;font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)}.l1-rail{position:absolute;left:52px;top:540px;transform:translateY(-50%);writing-mode:vertical-rl;font-size:11px;letter-spacing:.5em;text-transform:uppercase;color:var(--muted)}.l1-copy{position:absolute;left:150px;top:248px;width:600px}.l1-kick{font-size:13px;letter-spacing:.42em;text-transform:uppercase;color:var(--muted);font-weight:400}.l1-h1{font-family:var(--font-display);font-size:104px;line-height:.96;letter-spacing:-.02em;font-weight:900;margin-top:32px}.l1-btn{display:inline-flex;align-items:center;gap:16px;border:1px solid var(--border);padding:20px 30px;font-size:13px;letter-spacing:.24em;text-transform:uppercase;font-weight:500;margin-top:52px}.l1-plus{font-size:17px;line-height:1;color:var(--accent)}.l1-note{font-size:15px;font-weight:300;line-height:1.7;color:var(--muted);width:330px;margin-top:52px}.l1-foot{position:absolute;left:150px;bottom:56px;font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)}.l1-m1{position:absolute;left:780px;top:96px;width:540px;height:430px}.l1-m2{position:absolute;left:780px;top:550px;width:540px;height:434px}.l1-m3{position:absolute;left:1344px;top:96px;width:540px;height:888px}.l1-chip{position:absolute;left:32px;bottom:28px;background:var(--text);color:var(--bg);font-size:12px;letter-spacing:.28em;text-transform:uppercase;font-weight:500;padding:10px 16px}</style><div class="l1-brand">FOOD&trade;</div><div class="l1-menu"><span>Home</span><span>Story</span><span>Projects</span></div><div class="l1-rail">New Product</div><div class="l1-copy"><div class="l1-kick">Highlight your cooking</div><h1 class="l1-h1">Basting Brush &amp; Pump</h1><div class="l1-btn"><span class="l1-plus">+</span><span>More Information</span></div><p class="l1-note">Silicone head, beech handle, 240 mm. Third run since 1994, poured and finished by hand in the same workshop.</p></div><div class="l1-foot">Designed with love by Mazur &mdash; 01</div><div class="l1-m1 ph"><img data-lumen-image="1"></div><div class="l1-m2 ph"><img data-lumen-image="2"><div class="l1-chip">Orange Stuff, Wood Table</div></div><div class="l1-m3 ph"><img data-lumen-image="3"></div></div>`,
  },
  {
    id: "gallery/dark-number-feature@v1",
    name: "深色编号跨页",
    group: "multi",
    brief: "深底整页，左侧栏目小字加正文，右下压一个巨大编号，右侧两张照片竖排，适合章节封面或项目编年。",
    slots: 2,
    skeleton: `<div class="l2" style="width:1920px;height:1080px;position:relative;background:var(--text);color:var(--bg);font-family:var(--font-sans);overflow:hidden"><style>.l2 *{margin:0;padding:0;box-sizing:border-box}.l2 .ph{overflow:hidden}.l2 .ph img{width:100%;height:100%;object-fit:cover;display:block}.l2-kick{position:absolute;left:140px;top:96px;font-size:12px;letter-spacing:.44em;text-transform:uppercase;opacity:.6;font-weight:400}.l2-h2{position:absolute;left:140px;top:168px;width:820px;font-family:var(--font-display);font-size:96px;font-weight:900;line-height:.98;letter-spacing:-.02em}.l2-body{position:absolute;left:140px;top:420px;width:520px;font-size:17px;font-weight:300;line-height:1.7;opacity:.66}.l2-list{position:absolute;left:140px;top:640px;display:flex;flex-direction:column;gap:20px}.l2-row{display:flex;align-items:center;gap:18px;font-size:12px;letter-spacing:.3em;text-transform:uppercase;opacity:.55}.l2-dash{width:34px;height:1px;background:var(--bg);opacity:.5}.l2-num{position:absolute;left:140px;bottom:40px;font-family:var(--font-display);font-size:360px;font-weight:900;line-height:.78;letter-spacing:-.06em;color:var(--accent)}.l2-i1{position:absolute;left:1260px;top:0;width:660px;height:530px}.l2-i2{position:absolute;left:1260px;top:550px;width:660px;height:530px}</style><div class="l2-kick">New Projects / Season Two</div><h2 class="l2-h2">Tools that outlive the recipe</h2><p class="l2-body">Twenty-nine pieces cast this spring in Padua, from the same sand moulds we have used since 1994. Each handle is oiled twice and stamped by hand.</p><div class="l2-list"><div class="l2-row"><span class="l2-dash"></span><span>Cast &amp; Cooled / Padua</span></div><div class="l2-row"><span class="l2-dash"></span><span>Oiled Twice / 12 Days</span></div><div class="l2-row"><span class="l2-dash"></span><span>Ships 04 March 2026</span></div></div><div class="l2-num">01</div><div class="l2-i1 ph"><img data-lumen-image="1"></div><div class="l2-i2 ph"><img data-lumen-image="2"></div></div>`,
  },
  {
    id: "gallery/left-photo-right-copy@v1",
    name: "左满图右文",
    group: "multi",
    brief: "左半整幅照片出血，右半是标题、短说明加一张小图与手写签名，适合人物专访或单品故事。",
    slots: 2,
    skeleton: `<div class="l4" style="width:1920px;height:1080px;position:relative;background:var(--bg);color:var(--text);font-family:var(--font-sans);overflow:hidden"><style>.l4 *{margin:0;padding:0;box-sizing:border-box}.l4 .ph{overflow:hidden}.l4 .ph img{width:100%;height:100%;object-fit:cover;display:block}.l4-ph{position:absolute;left:0;top:0;width:900px;height:1080px}.l4-kick{position:absolute;left:1050px;top:148px;font-size:12px;letter-spacing:.44em;text-transform:uppercase;color:var(--muted)}.l4-h2{position:absolute;left:1050px;top:196px;width:720px;font-family:var(--font-display);font-size:104px;font-weight:900;line-height:.96;letter-spacing:-.02em}.l4-body{position:absolute;left:1050px;top:436px;width:600px;font-size:17px;font-weight:300;line-height:1.7;color:var(--muted)}.l4-small{position:absolute;left:1050px;top:628px;width:420px;height:280px}.l4-cap{position:absolute;left:1050px;top:928px;font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)}.l4-sign{position:absolute;left:1520px;top:900px;font-family:var(--font-script);font-size:46px;color:var(--accent)}</style><div class="l4-ph ph"><img data-lumen-image="1"></div><div class="l4-kick">Selected Series / 2026</div><h2 class="l4-h2">Wood &amp; Table</h2><p class="l4-body">Twelve boards cut from a single elm felled near Bergamo. We dry them for nine months, then finish with beeswax and nothing else.</p><div class="l4-small ph"><img data-lumen-image="2"></div><div class="l4-cap">Workshop, Bergamo &mdash; 09 Feb 2026</div><div class="l4-sign">Mazur</div></div>`,
  },
  {
    id: "gallery/full-bleed-six-grid@v1",
    name: "满版六格图集",
    group: "multi",
    brief: "整页无留白的六格照片拼贴，中间一条深色文字带压住节奏，适合系列作品或影像合辑。",
    slots: 6,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden"><style>.g{position:absolute;overflow:hidden}.g img{width:100%;height:100%;object-fit:cover;display:block}.band{position:absolute;left:560px;top:0;width:400px;height:1080px;box-sizing:border-box;padding:64px 44px 56px 44px;background:var(--text);display:flex;flex-direction:column;justify-content:space-between}.kick{font-size:12px;letter-spacing:.36em;text-transform:uppercase;font-weight:400;color:var(--bg);opacity:.6;margin:0}.ttl{font-family:var(--font-display);font-size:66px;line-height:.94;letter-spacing:-.02em;font-weight:300;color:var(--bg);margin:20px 0 0 0}.dsc{font-size:15px;line-height:1.7;font-weight:300;color:var(--bg);opacity:.68;margin:28px 0 0 0}.bignum{font-family:var(--font-display);font-size:152px;line-height:.78;letter-spacing:-.05em;font-weight:900;color:var(--bg)}.foot{font-size:11px;letter-spacing:.3em;text-transform:uppercase;font-weight:400;color:var(--bg);opacity:.5;margin:22px 0 0 0}</style><div class="g" style="left:0;top:0;width:560px;height:620px"><img data-lumen-image="1"></div><div class="g" style="left:0;top:620px;width:560px;height:460px"><img data-lumen-image="2"></div><div class="g" style="left:960px;top:0;width:480px;height:560px"><img data-lumen-image="3"></div><div class="g" style="left:1440px;top:0;width:480px;height:640px"><img data-lumen-image="4"></div><div class="g" style="left:960px;top:560px;width:480px;height:520px"><img data-lumen-image="5"></div><div class="g" style="left:1440px;top:640px;width:480px;height:440px"><img data-lumen-image="6"></div><div class="band"><div><p class="kick">Selected Series</p><h2 class="ttl">New<br>Works</h2><p class="dsc">Six interiors shot across Milan and Lisbon through 2026, printed on the same matte stock as the studio's first catalogue.</p></div><div><div class="bignum">01</div><p class="foot">Frames 06 / 2026</p></div></div></div>`,
  },
  {
    id: "gallery/top-band-hero@v1",
    name: "顶栏标题满幅图",
    group: "feature",
    brief: "顶部一条实色横栏压着曲名与艺人，下方整张照片满幅铺满，适合单曲、专辑或封面主视觉的首图页。",
    slots: 1,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.l1-bar{position:absolute;left:0;top:0;width:1920px;height:132px;background:var(--brand);display:flex;align-items:center;justify-content:center;gap:24px}
.l1-t{font-family:var(--font-display);font-size:56px;font-weight:900;letter-spacing:-.01em;color:var(--bg);margin:0}
.l1-a{font-size:30px;font-weight:300;letter-spacing:.24em;text-transform:uppercase;color:var(--bg);opacity:.82}
.l1-ph{position:absolute;left:0;top:132px;width:1920px;height:948px;overflow:hidden}
.l1-ph img{width:100%;height:100%;object-fit:cover;display:block}
.l1-cap{position:absolute;left:64px;bottom:58px;font-size:18px;letter-spacing:.4em;text-transform:uppercase;color:var(--text);opacity:.9}
</style>
<div class="l1-bar"><h1 class="l1-t">COME TOGETHER</h1><span class="l1-a">The Beatles</span></div>
<div class="l1-ph"><img data-lumen-image="1"></div>
<div class="l1-cap">Abbey Road / London — 1969</div>
</div>`,
  },
  {
    id: "gallery/side-label-photo@v1",
    name: "左栏文字右大图",
    group: "feature",
    brief: "左侧浅色竖栏堆叠标题、艺人与一段说明，右侧一张大照片撑满，适合需要配文字的封面或人物介绍页。",
    slots: 1,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);display:flex">
<style>
.l2-left{width:648px;height:1080px;background:var(--surface);border-right:1px solid var(--border);padding:104px 76px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:space-between}
.l2-kick{font-size:17px;letter-spacing:.44em;text-transform:uppercase;color:var(--muted)}
.l2-t{font-family:var(--font-display);font-size:104px;font-weight:900;line-height:.9;letter-spacing:-.035em;color:var(--text);margin:0}
.l2-a{font-size:28px;font-weight:300;letter-spacing:.3em;text-transform:uppercase;color:var(--text);opacity:.75}
.l2-note{font-size:19px;font-weight:300;line-height:1.7;color:var(--muted);max-width:430px;margin:0}
.l2-ph{flex:1;height:1080px;overflow:hidden;background:var(--surface)}
.l2-ph img{width:100%;height:100%;object-fit:cover;display:block}
</style>
<div class="l2-left">
<span class="l2-kick">Side A / Track 02</span>
<h1 class="l2-t">PINK<br>+ WHITE</h1>
<span class="l2-a">Frank Ocean</span>
<p class="l2-note">Shot in Los Angeles over two winters on expired 400 ISO film; the sleeve keeps the contact-sheet frame numbers.</p>
</div>
<div class="l2-ph"><img data-lumen-image="1"></div>
</div>`,
  },
  {
    id: "gallery/mid-band-overlay@v1",
    name: "中间色带压全图",
    group: "feature",
    brief: "整张照片满幅打底，画面正中横贯一条实色带写标题与艺人，适合视觉强、要一眼抓人的封面或活动主视觉。",
    slots: 1,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.l3-ph{position:absolute;inset:0;overflow:hidden}
.l3-ph img{width:100%;height:100%;object-fit:cover;display:block}
.l3-veil{position:absolute;inset:0;background:var(--bg);opacity:.22}
.l3-band{position:absolute;left:0;top:452px;width:1920px;height:176px;background:var(--accent);display:flex;align-items:center;justify-content:center;gap:30px}
.l3-t{font-family:var(--font-display);font-size:74px;font-weight:900;letter-spacing:-.02em;color:var(--bg);margin:0}
.l3-a{font-size:30px;font-weight:300;letter-spacing:.22em;text-transform:uppercase;color:var(--bg);opacity:.86}
.l3-kick{position:absolute;left:72px;top:72px;font-size:17px;letter-spacing:.44em;text-transform:uppercase;color:var(--text)}
.l3-year{position:absolute;right:72px;bottom:64px;font-size:17px;letter-spacing:.44em;text-transform:uppercase;color:var(--text)}
</style>
<div class="l3-ph"><img data-lumen-image="1"></div>
<div class="l3-veil"></div>
<div class="l3-band"><h1 class="l3-t">TITI ME PREGUNTO</h1><span class="l3-a">Bad Bunny</span></div>
<div class="l3-kick">Island / 2022</div>
<div class="l3-year">San Juan — 04:16</div>
</div>`,
  },
  {
    id: "gallery/minimal-slice-strip@v1",
    name: "极细横条留白多",
    group: "feature",
    brief: "页面大部分留白，只在中段横一条窄图与一条实色标题带，极简克制，适合单曲、短文案或安静的分隔页。",
    slots: 1,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.l4-kick{position:absolute;left:50%;top:300px;transform:translateX(-50%);font-size:17px;letter-spacing:.5em;text-transform:uppercase;color:var(--muted)}
.l4-slice{position:absolute;left:0;top:452px;width:1920px;height:96px;overflow:hidden;background:var(--surface)}
.l4-slice img{width:100%;height:100%;object-fit:cover;display:block;opacity:.85}
.l4-bar{position:absolute;left:0;top:548px;width:1920px;height:92px;background:var(--brand);display:flex;align-items:center;justify-content:center;gap:26px}
.l4-t{font-family:var(--font-display);font-size:42px;font-weight:900;letter-spacing:-.01em;color:var(--bg);margin:0}
.l4-a{font-size:24px;font-weight:300;letter-spacing:.3em;text-transform:uppercase;color:var(--bg);opacity:.82}
.l4-foot{position:absolute;left:50%;bottom:180px;transform:translateX(-50%);font-size:16px;letter-spacing:.46em;text-transform:uppercase;color:var(--muted)}
</style>
<div class="l4-kick">Single / 2024</div>
<div class="l4-slice"><img data-lumen-image="1"></div>
<div class="l4-bar"><h1 class="l4-t">TASTE</h1><span class="l4-a">Sabrina Carpenter</span></div>
<div class="l4-foot">Island Records — 3:24</div>
</div>`,
  },
  {
    id: "gallery/dark-big-type@v1",
    name: "暗色大字配窄图",
    group: "feature",
    brief: "深色底上左侧压超大两行标题，右侧一条窄横图，配细线与手写批注，适合情绪化的单曲或引言页。",
    slots: 1,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.l5-kick{position:absolute;left:96px;top:164px;font-size:17px;letter-spacing:.46em;text-transform:uppercase;color:var(--muted)}
.l5-rule{position:absolute;left:96px;right:96px;top:228px;height:1px;background:var(--border)}
.l5-ph{position:absolute;right:96px;top:320px;width:1090px;height:400px;overflow:hidden;background:var(--surface)}
.l5-ph img{width:100%;height:100%;object-fit:cover;display:block;opacity:.7}
.l5-t{position:absolute;left:96px;top:400px;font-family:var(--font-display);font-size:138px;font-weight:900;line-height:.86;letter-spacing:-.05em;color:var(--text);margin:0}
.l5-a{position:absolute;left:100px;top:664px;font-size:26px;font-weight:300;letter-spacing:.36em;text-transform:uppercase;color:var(--muted)}
.l5-sig{position:absolute;left:100px;bottom:160px;font-family:var(--font-script);font-size:44px;color:var(--accent)}
.l5-num{position:absolute;right:96px;bottom:160px;font-size:16px;letter-spacing:.46em;text-transform:uppercase;color:var(--muted)}
</style>
<div class="l5-kick">After Hours / Side B</div>
<div class="l5-rule"></div>
<div class="l5-ph"><img data-lumen-image="1"></div>
<h1 class="l5-t">CRY<br>FOR ME</h1>
<div class="l5-a">The Weeknd</div>
<div class="l5-sig">mixed at night</div>
<div class="l5-num">XO — 03:44</div>
</div>`,
  },
  {
    id: "gallery/wide-photo-caption@v1",
    name: "宽幅横图下题条",
    group: "feature",
    brief: "上方一张宽幅横图，下方实色题条左写曲名右写艺人，最底一行日期与地点，适合标准的资讯型封面页。",
    slots: 1,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.l6-ph{position:absolute;left:0;top:0;width:1920px;height:672px;overflow:hidden}
.l6-ph img{width:100%;height:100%;object-fit:cover;display:block}
.l6-bar{position:absolute;left:0;top:672px;width:1920px;height:132px;background:var(--brand);display:flex;align-items:center;justify-content:space-between;padding:0 72px;box-sizing:border-box}
.l6-t{font-family:var(--font-display);font-size:50px;font-weight:900;letter-spacing:-.015em;color:var(--bg);margin:0}
.l6-a{font-size:26px;font-weight:300;letter-spacing:.34em;text-transform:uppercase;color:var(--bg);opacity:.85}
.l6-note{position:absolute;left:72px;top:852px;font-size:19px;font-weight:300;line-height:1.7;color:var(--muted);max-width:1100px;margin:0}
.l6-meta{position:absolute;right:72px;bottom:76px;font-size:16px;letter-spacing:.42em;text-transform:uppercase;color:var(--muted)}
</style>
<div class="l6-ph"><img data-lumen-image="1"></div>
<div class="l6-bar"><h1 class="l6-t">WILDEST DREAMS</h1><span class="l6-a">Taylor Swift</span></div>
<p class="l6-note">Rerecorded version tracked at 24-bit in Nashville; the artwork frame comes from a single 35mm roll shot on the coast.</p>
<div class="l6-meta">Nashville / 2023</div>
</div>`,
  },
  {
    id: "gallery/vertical-title-fullbleed@v1",
    name: "侧排竖题满幅图",
    group: "feature",
    brief: "满幅照片打底，右侧竖排一行巨型标题，左下压超大数字与艺人名，适合视觉冲击强的封面或章节页。",
    slots: 1,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.l7-ph{position:absolute;inset:0;overflow:hidden}
.l7-ph img{width:100%;height:100%;object-fit:cover;display:block}
.l7-veil{position:absolute;inset:0;background:var(--bg);opacity:.3}
.l7-t{position:absolute;right:150px;top:150px;writing-mode:vertical-rl;font-family:var(--font-display);font-size:132px;font-weight:900;letter-spacing:-.03em;color:var(--text);margin:0}
.l7-num{position:absolute;left:110px;bottom:176px;font-family:var(--font-display);font-size:220px;font-weight:900;line-height:.84;letter-spacing:-.055em;color:var(--text);margin:0}
.l7-a{position:absolute;left:118px;bottom:104px;font-size:24px;font-weight:300;letter-spacing:.44em;text-transform:uppercase;color:var(--text);opacity:.85}
.l7-kick{position:absolute;right:150px;bottom:120px;font-size:16px;letter-spacing:.44em;text-transform:uppercase;color:var(--text);opacity:.75}
</style>
<div class="l7-ph"><img data-lumen-image="1"></div>
<div class="l7-veil"></div>
<h1 class="l7-t">BRAT</h1>
<h1 class="l7-num">360</h1>
<div class="l7-a">Charli xcx</div>
<div class="l7-kick">Club Edit — 2:58</div>
</div>`,
  },
  {
    id: "gallery/mosaic-center-script@v1",
    name: "满版图阵中央题字",
    group: "multi",
    brief: "整页深底，上半部铺满圆角照片墙，中段压一条深色横带放手写体巨字标题，底部居中排奖项大字与品牌落款。适合影赛公示封面、年度选集封面。",
    slots: 12,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden">
<style>
.mos{position:absolute;left:0;top:0;width:1920px;height:704px;display:grid;grid-template-columns:repeat(4,1fr);grid-template-rows:repeat(3,1fr);gap:12px;padding:12px;box-sizing:border-box}
.ph{overflow:hidden;border-radius:20px}
.ph img{width:100%;height:100%;object-fit:cover;display:block}
.band{position:absolute;left:0;top:400px;width:1920px;height:290px;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center}
.kick{font-size:20px;font-weight:400;letter-spacing:.46em;text-transform:uppercase;color:var(--muted)}
.script{font-family:var(--font-script);font-size:140px;line-height:1;color:var(--text);margin-top:22px}
.foot{position:absolute;left:0;top:704px;width:1920px;height:376px;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.h1{font-family:var(--font-display);font-size:96px;font-weight:800;line-height:.95;letter-spacing:-.02em;color:var(--text)}
.sub{font-size:30px;font-weight:300;letter-spacing:.06em;color:var(--muted);margin-top:26px}
.line{font-size:24px;font-weight:500;letter-spacing:.36em;text-transform:uppercase;color:var(--text);margin-top:40px}
.brand{font-size:18px;font-weight:400;letter-spacing:.3em;text-transform:uppercase;color:var(--muted);margin-top:44px}
</style>
<div class="mos">
<div class="ph"><img data-lumen-image="1"></div>
<div class="ph"><img data-lumen-image="2"></div>
<div class="ph"><img data-lumen-image="3"></div>
<div class="ph"><img data-lumen-image="4"></div>
<div class="ph"><img data-lumen-image="5"></div>
<div class="ph"><img data-lumen-image="6"></div>
<div class="ph"><img data-lumen-image="7"></div>
<div class="ph"><img data-lumen-image="8"></div>
<div class="ph"><img data-lumen-image="9"></div>
<div class="ph"><img data-lumen-image="10"></div>
<div class="ph"><img data-lumen-image="11"></div>
<div class="ph"><img data-lumen-image="12"></div>
</div>
<div class="band">
<span class="kick">Imaging Awards / 2025 Season</span>
<div class="script">Light the Moment</div>
</div>
<div class="foot">
<h1 class="h1">2025 Imaging Awards</h1>
<p class="sub">Powered by LUMO</p>
<div class="line">Jury Selection — Official Announcement</div>
<div class="brand">OPPO × HASSELBLAD</div>
</div>
</div>`,
  },
  {
    id: "gallery/strip-top-big-title@v1",
    name: "顶图带下大标题",
    group: "multi",
    brief: "顶部一条六格方形照片横带，下方深底居中排巨字大标题、一段短说明和三个数据标签，收尾干净。适合封面、结果公示页或章节首页。",
    slots: 6,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden">
<style>
.strip{position:absolute;left:0;top:0;width:1920px;height:352px;display:grid;grid-template-columns:repeat(6,1fr);gap:14px;padding:14px;box-sizing:border-box}
.ph{overflow:hidden;border-radius:18px}
.ph img{width:100%;height:100%;object-fit:cover;display:block}
.copy{position:absolute;left:0;top:352px;width:1920px;height:728px;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.kick{font-size:20px;font-weight:400;letter-spacing:.5em;text-transform:uppercase;color:var(--muted)}
.h1{font-family:var(--font-display);font-size:150px;font-weight:900;line-height:.9;letter-spacing:-.035em;color:var(--text);margin-top:28px}
.lede{font-size:26px;font-weight:300;line-height:1.6;color:var(--muted);max-width:920px;margin-top:36px}
.meta{display:flex;gap:64px;margin-top:54px}
.meta span{font-size:18px;font-weight:500;letter-spacing:.34em;text-transform:uppercase;color:var(--text)}
</style>
<div class="strip">
<div class="ph"><img data-lumen-image="1"></div>
<div class="ph"><img data-lumen-image="2"></div>
<div class="ph"><img data-lumen-image="3"></div>
<div class="ph"><img data-lumen-image="4"></div>
<div class="ph"><img data-lumen-image="5"></div>
<div class="ph"><img data-lumen-image="6"></div>
</div>
<div class="copy">
<span class="kick">Open Call / Entries Closed</span>
<h1 class="h1">Light the Moment</h1>
<p class="lede">Nine jurors from six countries reviewed 412,000 entries shot on mobile phones across 78 cities between March and November 2025.</p>
<div class="meta">
<span>412,000 Entries</span>
<span>9 Jurors</span>
<span>12 Dec 2026 / Shenzhen</span>
</div>
</div>
</div>`,
  },
  {
    id: "gallery/left-text-card-fan@v1",
    name: "左文右扇卡",
    group: "multi",
    brief: "左侧竖排标题与短文，右侧一台倾斜设备与四张扇形展开的卡片，四组带引线的标注指向各卡片，适合讲一个 App 或一个系列的几块功能。",
    slots: 5,
    skeleton: `<div class="page" style="width:1920px;height:1080px;position:relative;background:var(--bg)">
<style>
.page{font-family:var(--font-sans);color:var(--text)}
.ph{overflow:hidden}
.ph img{width:100%;height:100%;object-fit:cover;display:block}
.hair{position:absolute;left:88px;top:112px;width:120px;height:2px;background:var(--accent)}
.head{position:absolute;left:88px;top:158px;width:540px}
.kicker{font-size:15px;letter-spacing:.44em;text-transform:uppercase;color:var(--muted);font-weight:400}
.title{font-family:var(--font-display);font-size:150px;font-weight:900;line-height:.88;letter-spacing:-.04em;margin:24px 0 0;color:var(--text)}
.lede{font-size:21px;font-weight:300;line-height:1.65;color:var(--muted);margin:36px 0 0;max-width:460px}
.stamp{position:absolute;left:88px;bottom:70px;font-size:13px;letter-spacing:.4em;text-transform:uppercase;color:var(--muted);font-weight:400}
.device{position:absolute;left:640px;top:268px;width:400px;height:620px;border-radius:38px;background:var(--surface);border:1px solid var(--border);box-sizing:border-box;padding:16px;transform:rotate(-8deg)}
.screen{width:100%;height:100%;border-radius:26px}
.card{position:absolute;width:380px;height:280px;border-radius:18px;overflow:hidden;background:var(--surface);border:1px solid var(--border)}
.card .ph{width:100%;height:100%}
.cap{position:absolute;left:0;bottom:0;width:100%;box-sizing:border-box;padding:14px 18px;background:var(--surface);border-top:1px solid var(--border);font-size:12px;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)}
.ca{left:700px;top:600px;transform:rotate(-14deg)}
.cb{left:890px;top:460px;transform:rotate(-7deg)}
.cc{left:1080px;top:320px;transform:rotate(0deg)}
.cd{left:1270px;top:180px;transform:rotate(8deg)}
.callout{position:absolute;padding-left:16px;border-left:2px solid var(--accent)}
.callout h3{margin:0;font-size:14px;letter-spacing:.34em;text-transform:uppercase;font-weight:600;color:var(--text)}
.callout p{margin:10px 0 0;font-size:17px;font-weight:300;line-height:1.5;color:var(--muted)}
.n1{left:560px;top:132px;width:220px}
.n2{left:560px;top:930px;width:250px}
.n3{left:1680px;top:150px;width:200px}
.n4{left:1680px;top:620px;width:200px}
</style>
<div class="hair"></div>
<div class="head">
<div class="kicker">App / Home</div>
<h1 class="title">Home</h1>
<p class="lede">Six daily collections, one quiet place. Picks rebuild every morning at 07:00 from what you saved yesterday.</p>
</div>
<div class="stamp">Seoul / 12 Dec 2026</div>
<div class="device">
<div class="screen ph"><img data-lumen-image="1" alt=""></div>
</div>
<div class="card ca">
<div class="ph"><img data-lumen-image="2" alt=""></div>
<div class="cap">Slow Mornings / 2026</div>
</div>
<div class="card cb">
<div class="ph"><img data-lumen-image="3" alt=""></div>
<div class="cap">Brick Courtyard, Bldg 4</div>
</div>
<div class="card cc">
<div class="ph"><img data-lumen-image="4" alt=""></div>
<div class="cap">Red Stair / 06:40</div>
</div>
<div class="card cd">
<div class="ph"><img data-lumen-image="5" alt=""></div>
<div class="cap">Sand Dunes, Jeju</div>
</div>
<div class="callout n1"><h3>Picked for you</h3><p>Two fresh themes land every Tuesday at 07:00.</p></div>
<div class="callout n2"><h3>Morning brief</h3><p>Anything you saved yesterday returns, three items max.</p></div>
<div class="callout n3"><h3>Mail digest</h3><p>Friday, six items, one tap to archive the rest.</p></div>
<div class="callout n4"><h3>Health check</h3><p>Steps, sleep and resting heart rate since Monday.</p></div>
</div>`,
  },
  {
    id: "gallery/scattered-photos-giant-word@v1",
    name: "散图巨字压底",
    group: "multi",
    brief: "多张大小不一的照片横向错落散排，底部巨型标题压过图角，下方接小段说明与平台标签行。",
    slots: 6,
    skeleton: `<div class="page" style="width:1920px;height:1080px;position:relative;overflow:hidden"><style>.page{background:var(--bg);font-family:var(--font-sans)}.kicker{position:absolute;left:84px;top:86px;font-family:var(--font-display);font-size:58px;line-height:1.04;font-weight:300;letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}.word{position:absolute;left:56px;top:520px;z-index:3;font-family:var(--font-display);font-size:300px;line-height:.86;font-weight:900;letter-spacing:-.045em;white-space:nowrap;color:var(--text)}.ph{position:absolute;z-index:2;overflow:hidden;border-radius:6px;background:var(--surface)}.ph img{width:100%;height:100%;object-fit:cover;display:block}.p1{left:-70px;top:120px;width:230px;height:282px;transform:rotate(-4deg)}.p2{left:92px;top:350px;width:220px;height:230px}.p3{left:352px;top:200px;width:322px;height:400px;transform:rotate(2deg)}.p4{left:720px;top:112px;width:440px;height:490px}.p5{left:1210px;top:272px;width:350px;height:270px;transform:rotate(-2deg)}.p6{left:1620px;top:90px;width:380px;height:440px}.tags{position:absolute;left:1180px;top:118px;width:240px;z-index:4;font-size:19px;line-height:1.75;font-weight:500;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)}.lede{position:absolute;left:242px;top:806px;width:620px;z-index:4;font-size:23px;line-height:1.65;font-weight:400;color:var(--muted)}.rule{position:absolute;left:120px;right:120px;top:946px;height:1px;background:var(--border)}.plats{position:absolute;left:120px;right:120px;top:974px;display:flex;justify-content:space-between;align-items:center;z-index:4}.plat{display:flex;align-items:center;gap:16px;font-size:20px;font-weight:500;letter-spacing:.28em;text-transform:uppercase;color:var(--muted)}.tick{width:14px;height:14px;background:var(--muted);opacity:.45;border-radius:3px}</style><div class="kicker">Community<br>Driven</div><div class="word">listen($)</div><div class="ph p1"><img data-lumen-image="1"></div><div class="ph p2"><img data-lumen-image="2"></div><div class="ph p3"><img data-lumen-image="3"></div><div class="ph p4"><img data-lumen-image="4"></div><div class="ph p5"><img data-lumen-image="5"></div><div class="ph p6"><img data-lumen-image="6"></div><div class="tags">Radio<br>Music<br>Player<br>Interface</div><div class="lede">Twelve episodes recorded between Milan and Lisbon across one winter. Each guest brings the record that got them through the long drive home.</div><div class="rule"></div><div class="plats"><div class="plat"><span class="tick"></span><span>Google Podcasts</span></div><div class="plat"><span class="tick"></span><span>Apple Podcasts</span></div><div class="plat"><span class="tick"></span><span>YouTube</span></div><div class="plat"><span class="tick"></span><span>Spotify</span></div></div></div>`,
  },
  {
    id: "gallery/scattered-arc-hero@v1",
    name: "中心环绕散图",
    group: "multi",
    brief: "一段居中的大标题与按钮，两侧散落圆角照片围成弧线，底部三栏小说明，适合产品发布或作品集首屏。",
    slots: 10,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);color:var(--text);overflow:hidden"><style>.tile{position:absolute;overflow:hidden;border-radius:28px}.tile img{width:100%;height:100%;object-fit:cover;display:block}.t1{left:56px;top:104px;width:250px;height:250px;transform:rotate(-6deg)}.t2{left:288px;top:26px;width:196px;height:196px;transform:rotate(7deg)}.t3{left:32px;top:432px;width:214px;height:214px;transform:rotate(-3deg)}.t4{left:272px;top:322px;width:186px;height:186px;transform:rotate(5deg)}.t5{left:138px;top:714px;width:232px;height:232px;transform:rotate(4deg)}.t6{left:1614px;top:104px;width:250px;height:250px;transform:rotate(6deg)}.t7{left:1432px;top:26px;width:196px;height:196px;transform:rotate(-7deg)}.t8{left:1674px;top:432px;width:214px;height:214px;transform:rotate(3deg)}.t9{left:1462px;top:322px;width:186px;height:186px;transform:rotate(-5deg)}.t10{left:1550px;top:714px;width:232px;height:232px;transform:rotate(-4deg)}.hero{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:800px;text-align:center;font-family:var(--font-sans)}.kicker{font-size:12px;font-weight:500;letter-spacing:.45em;text-transform:uppercase;color:var(--muted)}.hero h1{font-family:var(--font-display);font-size:96px;font-weight:400;line-height:.96;letter-spacing:-.03em;margin:28px 0 0}.sub{font-size:16px;font-weight:300;line-height:1.6;color:var(--muted);max-width:520px;margin:26px auto 0}.btn{display:inline-block;margin-top:34px;background:var(--text);color:var(--bg);border-radius:999px;padding:18px 42px;font-size:12px;font-weight:600;letter-spacing:.28em;text-transform:uppercase}.feats{display:flex;margin-top:58px;border-top:1px solid var(--border);padding-top:28px;text-align:left}.feat{flex:1;padding:0 22px}.feat:first-child{padding-left:0}.feat:last-child{padding-right:0}.feat+.feat{border-left:1px solid var(--border)}.feat h3{font-size:12px;font-weight:600;letter-spacing:.3em;text-transform:uppercase;margin:0}.feat p{font-size:11px;font-weight:300;line-height:1.6;color:var(--muted);margin:10px 0 0}</style><div class="tile t1"><img data-lumen-image="1" alt=""></div><div class="tile t2"><img data-lumen-image="2" alt=""></div><div class="tile t3"><img data-lumen-image="3" alt=""></div><div class="tile t4"><img data-lumen-image="4" alt=""></div><div class="tile t5"><img data-lumen-image="5" alt=""></div><div class="tile t6"><img data-lumen-image="6" alt=""></div><div class="tile t7"><img data-lumen-image="7" alt=""></div><div class="tile t8"><img data-lumen-image="8" alt=""></div><div class="tile t9"><img data-lumen-image="9" alt=""></div><div class="tile t10"><img data-lumen-image="10" alt=""></div><div class="hero"><p class="kicker">Studio Tools / 2026</p><h1>Pictures Worth Keeping</h1><p class="sub">Turn one written prompt into a finished frame in about eleven seconds, then push it straight to the press file.</p><span class="btn">Start Creating</span><div class="feats"><div class="feat"><h3>True to Life</h3><p>Skin, glass and water read the way they do in the room, not as a filter laid over it.</p></div><div class="feat"><h3>In Seconds</h3><p>Eleven seconds per frame on a laptop, no render farm and no queue behind you.</p></div><div class="feat"><h3>Styles, Plenty</h3><p>Forty-two presets, from wet-plate portrait to clean commercial daylight.</p></div></div></div></div>`,
  },
  {
    id: "gallery/giant-word-card-row@v1",
    name: "巨字卡片横排",
    group: "multi",
    brief: "巨型展示字垫底，五张竖版人物卡片高低错落横排，四周浮动栏目标签，底部一行说明，适合内容精选或人物阵容页。",
    slots: 10,
    skeleton: `<div class="stage" style="width:1920px;height:1080px;position:relative">
<style>
.stage{overflow:hidden;background:var(--bg);color:var(--text);font-family:var(--font-sans)}
.ghost{position:absolute;left:520px;top:40px;width:940px;height:940px;border-radius:50%;background:var(--brand);opacity:.15;filter:blur(170px)}
.word{position:absolute;margin:0;font-family:var(--font-display);font-weight:900;font-size:300px;line-height:.82;letter-spacing:-.05em;text-transform:uppercase;color:var(--text);opacity:.09}
.word-a{left:140px;top:22px}
.word-b{right:110px;bottom:-8px}
.brand{position:absolute;left:92px;top:62px;display:flex;align-items:center;gap:16px;z-index:6}
.brand .mark{width:34px;height:34px;border-radius:3px;background:var(--accent);opacity:.9}
.brand span{font-size:22px;font-weight:700;letter-spacing:.42em;text-transform:uppercase}
.tag{position:absolute;display:flex;align-items:center;gap:14px;font-size:14px;font-weight:600;letter-spacing:.38em;text-transform:uppercase;color:var(--muted);z-index:6}
.tag .sq{width:11px;height:11px;background:var(--accent);opacity:.85}
.t1{left:330px;top:248px}
.t2{left:1490px;top:330px}
.t3{left:398px;top:958px}
.t4{left:1516px;top:984px}
.ph{overflow:hidden}
.ph img{width:100%;height:100%;object-fit:cover;display:block}
.card{position:absolute;border-radius:26px;background:var(--surface)}
.c1{left:90px;top:320px;width:300px;height:380px}
.c2{left:430px;top:260px;width:320px;height:430px}
.c3{left:790px;top:180px;width:340px;height:500px}
.c4{left:1170px;top:260px;width:320px;height:430px}
.c5{left:1530px;top:320px;width:300px;height:380px}
.chip{position:absolute;left:16px;top:16px;display:flex;align-items:center;gap:9px;padding:7px 15px;border-radius:999px;background:var(--surface);font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--text)}
.chip .dot{width:8px;height:8px;border-radius:50%;background:var(--accent)}
.flag{position:absolute;right:16px;top:16px;width:24px;height:24px;border:2px solid var(--border);border-radius:7px;opacity:.8}
.meta{position:absolute;left:16px;right:16px;bottom:16px;display:flex;align-items:center;gap:13px}
.av{width:52px;height:52px;border-radius:50%;flex:0 0 auto;border:2px solid var(--border)}
.nm{margin:0;font-size:17px;font-weight:700;letter-spacing:.02em;text-shadow:0 2px 18px var(--bg)}
.rl{margin:3px 0 0;font-size:11px;font-weight:400;letter-spacing:.26em;text-transform:uppercase;color:var(--muted);text-shadow:0 2px 18px var(--bg)}
.note{position:absolute;left:730px;top:902px;width:460px;margin:0;text-align:center;font-size:13px;font-weight:400;line-height:2;letter-spacing:.22em;text-transform:uppercase;color:var(--muted)}
</style>
<div class="ghost"></div>
<h1 class="word word-a">THE</h1>
<h1 class="word word-b">TIDE</h1>
<div class="brand"><div class="mark"></div><span>Mise</span></div>
<div class="tag t1"><div class="sq"></div>Shopping</div>
<div class="tag t2"><div class="sq"></div>Video</div>
<div class="tag t3"><div class="sq"></div>Watch</div>
<div class="tag t4"><div class="sq"></div>Entertainment</div>
<div class="card ph c1"><img data-lumen-image="1"><div class="chip"><div class="dot"></div>3:12 H</div><div class="flag"></div><div class="meta"><div class="av ph"><img data-lumen-image="2"></div><div><p class="nm">Edwards</p><p class="rl">Top Seller</p></div></div></div>
<div class="card ph c2"><img data-lumen-image="3"><div class="chip"><div class="dot"></div>1:05 H</div><div class="flag"></div><div class="meta"><div class="av ph"><img data-lumen-image="4"></div><div><p class="nm">Watson</p><p class="rl">Top Seller</p></div></div></div>
<div class="card ph c3"><img data-lumen-image="5"><div class="chip"><div class="dot"></div>5:46 H</div><div class="flag"></div><div class="meta"><div class="av ph"><img data-lumen-image="6"></div><div><p class="nm">Alexander</p><p class="rl">Top Seller</p></div></div></div>
<div class="card ph c4"><img data-lumen-image="7"><div class="chip"><div class="dot"></div>4:46 H</div><div class="flag"></div><div class="meta"><div class="av ph"><img data-lumen-image="8"></div><div><p class="nm">Cody Fisher</p><p class="rl">Top Seller</p></div></div></div>
<div class="card ph c5"><img data-lumen-image="9"><div class="chip"><div class="dot"></div>2:38 H</div><div class="flag"></div><div class="meta"><div class="av ph"><img data-lumen-image="10"></div><div><p class="nm">Simmons</p><p class="rl">Top Seller</p></div></div></div>
<p class="note">Five rooms, twelve cameras, one long take. Shot in Milan over three nights in March 2026.</p>
</div>`,
  },
  {
    id: "gallery/center-hero-photo-wall@v1",
    name: "中轴大图配照片墙",
    group: "multi",
    brief: "顶部居中大标题，中段两侧照片墙夹一张竖向主图，底部一行小字说明，适合作品集封面或产品发布页。",
    slots: 9,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden"><style>.card{position:absolute;left:100px;top:70px;width:1720px;height:940px;background:var(--surface);border-radius:52px;overflow:hidden}.kicker{position:absolute;left:0;top:66px;width:100%;text-align:center;font-size:20px;font-weight:400;letter-spacing:.44em;text-transform:uppercase;color:var(--muted)}.head{position:absolute;left:0;top:112px;width:100%;margin:0;text-align:center;font-family:var(--font-display);font-size:96px;font-weight:900;line-height:.98;letter-spacing:-.02em;text-transform:uppercase;color:var(--text)}.ph{overflow:hidden;border-radius:22px;background:var(--bg)}.ph img{width:100%;height:100%;object-fit:cover;display:block}.t{position:absolute;width:220px;height:215px}.hero{position:absolute;left:670px;top:270px;width:380px;height:560px;border-radius:36px;border:1px solid var(--border)}.note{position:absolute;left:50%;top:864px;transform:translateX(-50%);width:660px;margin:0;text-align:center;font-size:21px;font-weight:300;line-height:1.55;color:var(--muted)}</style><div class="card"><div class="kicker">Selected Series / 2026</div><h1 class="head">Create Wish<br>Video With Love</h1><div class="hero ph"><img data-lumen-image="1"></div><div class="t ph" style="left:100px;top:325px"><img data-lumen-image="2"></div><div class="t ph" style="left:350px;top:325px"><img data-lumen-image="3"></div><div class="t ph" style="left:1150px;top:325px"><img data-lumen-image="4"></div><div class="t ph" style="left:1400px;top:325px"><img data-lumen-image="5"></div><div class="t ph" style="left:100px;top:570px"><img data-lumen-image="6"></div><div class="t ph" style="left:350px;top:570px"><img data-lumen-image="7"></div><div class="t ph" style="left:1150px;top:570px"><img data-lumen-image="8"></div><div class="t ph" style="left:1400px;top:570px"><img data-lumen-image="9"></div><p class="note">Shot across 14 cities in nine months; every frame graded by hand before it reaches the feed.</p></div></div>`,
  },
  {
    id: "gallery/scattered-frames-hero@v1",
    name: "散图环绕大标题",
    group: "multi",
    brief: "深色底上八张照片散落四周、大小错落，中央是一组巨大的两行标题加日期区间，适合赛事或活动主视觉开场页。",
    slots: 8,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);color:var(--text);overflow:hidden"><style>.ph{overflow:hidden}.ph img{width:100%;height:100%;object-fit:cover;display:block}.kick{font-size:15px;font-weight:400;letter-spacing:.42em;text-transform:uppercase;color:var(--muted);margin:0}.title{font-family:var(--font-display);font-size:118px;font-weight:900;line-height:.92;letter-spacing:-.02em;margin:26px 0 0}.dateline{font-size:24px;font-weight:300;letter-spacing:.22em;color:var(--muted);margin:34px 0 0}.dateline span{color:var(--accent);font-weight:600}</style><div class="ph" style="position:absolute;left:40px;top:36px;width:320px;height:200px"><img data-lumen-image="1" alt=""></div><div class="ph" style="position:absolute;left:388px;top:206px;width:228px;height:144px"><img data-lumen-image="2" alt=""></div><div class="ph" style="position:absolute;left:1300px;top:188px;width:222px;height:140px"><img data-lumen-image="3" alt=""></div><div class="ph" style="position:absolute;left:1560px;top:36px;width:320px;height:200px"><img data-lumen-image="4" alt=""></div><div class="ph" style="position:absolute;left:126px;top:688px;width:322px;height:212px"><img data-lumen-image="5" alt=""></div><div class="ph" style="position:absolute;left:502px;top:862px;width:262px;height:174px"><img data-lumen-image="6" alt=""></div><div class="ph" style="position:absolute;left:1182px;top:840px;width:242px;height:164px"><img data-lumen-image="7" alt=""></div><div class="ph" style="position:absolute;left:1518px;top:758px;width:342px;height:216px"><img data-lumen-image="8" alt=""></div><div style="position:absolute;left:460px;top:352px;width:1000px;text-align:center"><p class="kick">Insta360 &times; Leica / Official Imaging Partner</p><h1 class="title">THE GLOBAL<br>IMAGE CHALLENGE</h1><p class="dateline"><span>[</span> 2025.11.18 &mdash; 2026.02.28 <span>]</span></p></div></div>`,
  },
  {
    id: "gallery/mega-title-photo-scatter@v1",
    name: "巨字叠图阵",
    group: "multi",
    brief: "深底网格上散落多张人像照片，超大字标题压在照片之上，适合人像/作品合集式的封面页。",
    slots: 7,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden"><style>.l1-vline{position:absolute;top:0;bottom:0;width:1px;background:var(--border);opacity:.35}.l1-hline{position:absolute;left:0;right:0;height:1px;background:var(--border);opacity:.35}.l1-ph{position:absolute;overflow:hidden}.l1-ph img{width:100%;height:100%;object-fit:cover;display:block}.l1-brand{position:absolute;left:130px;top:96px;display:flex;align-items:center}.l1-mark{width:34px;height:34px;border-radius:50%;background:var(--text)}.l1-mark2{width:26px;height:26px;border-radius:50%;background:var(--bg);margin-left:-20px}.l1-brandname{font-size:26px;font-weight:700;letter-spacing:.02em;color:var(--text);margin-left:16px}.l1-hash{position:absolute;right:132px;top:104px;font-size:24px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text)}.l1-solid{position:absolute;left:230px;top:180px;margin:0;font-family:var(--font-display);font-size:280px;font-weight:900;line-height:.84;letter-spacing:-.05em;color:var(--text)}.l1-outline{position:absolute;left:470px;top:392px;margin:0;font-family:var(--font-display);font-size:280px;font-weight:900;line-height:.84;letter-spacing:-.04em;color:transparent;-webkit-text-stroke:2px var(--text);opacity:.9}.l1-note{position:absolute;left:140px;top:930px;width:660px;margin:0;font-size:19px;font-weight:400;line-height:1.6;color:var(--muted)}.l1-tag{position:absolute;right:132px;bottom:64px;font-size:13px;font-weight:400;letter-spacing:.42em;text-transform:uppercase;color:var(--muted)}</style><div class="l1-vline" style="left:480px"></div><div class="l1-vline" style="left:960px"></div><div class="l1-vline" style="left:1440px"></div><div class="l1-hline" style="top:360px"></div><div class="l1-hline" style="top:720px"></div><div class="l1-ph" style="left:140px;top:222px;width:214px;height:290px"><img data-lumen-image="1"></div><div class="l1-ph" style="left:660px;top:62px;width:224px;height:300px"><img data-lumen-image="2"></div><div class="l1-ph" style="left:1090px;top:250px;width:286px;height:300px"><img data-lumen-image="3"></div><div class="l1-ph" style="left:1520px;top:140px;width:292px;height:292px"><img data-lumen-image="4"></div><div class="l1-ph" style="left:288px;top:626px;width:222px;height:264px"><img data-lumen-image="5"></div><div class="l1-ph" style="left:700px;top:590px;width:300px;height:330px"><img data-lumen-image="6"></div><div class="l1-ph" style="left:1380px;top:680px;width:278px;height:300px"><img data-lumen-image="7"></div><div class="l1-brand"><div class="l1-mark"></div><div class="l1-mark2"></div><div class="l1-brandname">Motion Media Group</div></div><div class="l1-hash">#YourFest</div><h1 class="l1-solid">Favorite</h1><h1 class="l1-outline">artist</h1><p class="l1-note">We cut After Effects and Premiere templates, motion design, 2D and 3D animation — twelve new packs a year, made in Berlin since 2019.</p><div class="l1-tag">Motion / 2026</div></div>`,
  },
  {
    id: "gallery/left-title-right-mosaic@v1",
    name: "左标题右图墙",
    group: "multi",
    brief: "左侧大标语与页脚小字，右侧满铺不规则图片瀑布墙，适合灵感合集与作品集封面。",
    slots: 12,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden"><style>.mosaic-wrap{position:absolute;left:760px;top:0;width:1160px;height:1080px;display:grid;grid-template-columns:repeat(5,1fr);grid-template-rows:repeat(6,1fr);gap:14px;padding:40px 40px 40px 0;box-sizing:border-box}.ph{overflow:hidden}.ph img{width:100%;height:100%;object-fit:cover;display:block}.mosaic-wrap .ph{border-radius:2px}.tall{grid-row:span 2}.wide{grid-column:span 2}.mosaic-head{position:absolute;left:120px;top:300px;width:600px}.kicker{font-family:var(--font-sans);font-size:16px;letter-spacing:.42em;text-transform:uppercase;color:var(--muted);font-weight:400;margin:0 0 28px 0}.mosaic-title{font-family:var(--font-display);font-size:126px;line-height:.94;letter-spacing:-.03em;color:var(--text);font-weight:900;margin:0}.mosaic-title em{font-style:normal;color:var(--brand)}.mosaic-foot{position:absolute;left:120px;bottom:72px;width:520px;font-family:var(--font-sans);font-size:19px;line-height:1.6;color:var(--muted);font-weight:300;margin:0}</style><div class="mosaic-wrap"><div class="ph tall"><img data-lumen-image="1"></div><div class="ph"><img data-lumen-image="2"></div><div class="ph"><img data-lumen-image="3"></div><div class="ph"><img data-lumen-image="4"></div><div class="ph"><img data-lumen-image="5"></div><div class="ph"><img data-lumen-image="6"></div><div class="ph"><img data-lumen-image="7"></div><div class="ph"><img data-lumen-image="8"></div><div class="ph tall"><img data-lumen-image="9"></div><div class="ph"><img data-lumen-image="10"></div><div class="ph"><img data-lumen-image="11"></div><div class="ph wide"><img data-lumen-image="12"></div></div><div class="mosaic-head"><p class="kicker">SAVEE / VISUAL INDEX 2026</p><h1 class="mosaic-title">Save.<br>Share.<br><em>Inspire.</em></h1></div><p class="mosaic-foot">A running archive of 4,200 saved frames, rebuilt every Monday morning from the studio floor.</p></div>`,
  },
  {
    id: "gallery/hero-fan-card-strip@v1",
    name: "居中标题扇形卡流",
    group: "multi",
    brief: "居中大标题配一行说明，下方中央一台设备大图、两侧高低错落的竖版小卡扇形排开，适合产品首页或系列入口。",
    slots: 7,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden"><style>.ws{position:absolute;inset:0;background:var(--bg);color:var(--text)}.ph{overflow:hidden}.ph img{width:100%;height:100%;object-fit:cover;display:block}.ws-bar{position:absolute;left:64px;right:64px;top:0;height:78px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border)}.ws-brand{font-family:var(--font-display);font-size:23px;font-weight:700;letter-spacing:-.01em}.ws-nav{display:flex;gap:38px;font-size:12px;font-weight:400;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}.ws-head{position:absolute;left:280px;right:280px;top:118px;text-align:center}.ws-kicker{font-size:12px;font-weight:500;letter-spacing:.46em;text-transform:uppercase;color:var(--accent);margin:0}.ws-h1{font-family:var(--font-display);font-size:100px;line-height:.94;letter-spacing:-.035em;font-weight:900;margin:22px 0 0}.ws-lede{font-size:18px;font-weight:300;line-height:1.65;color:var(--muted);max-width:660px;margin:20px auto 0}.ws-strip{position:absolute;left:0;right:0;bottom:60px;height:610px;display:flex;align-items:flex-start;justify-content:center;gap:26px}.ws-card{position:relative;width:190px;border-radius:16px;border:1px solid var(--border);background:var(--surface)}.ws-card .ph{position:absolute;inset:0;border-radius:15px}.ws-c1{height:400px;margin-top:120px}.ws-c2{height:470px;margin-top:24px}.ws-c3{height:420px;margin-top:88px}.ws-c4{height:420px;margin-top:88px}.ws-c5{height:470px;margin-top:24px}.ws-c6{height:400px;margin-top:120px}.ws-chip{position:absolute;left:14px;bottom:14px;padding:7px 11px;border-radius:4px;background:var(--bg);color:var(--text);font-size:10px;font-weight:600;letter-spacing:.26em;text-transform:uppercase;line-height:1.3}.ws-dev{width:520px;height:590px;border-radius:30px;border:1px solid var(--border);background:var(--surface);padding:16px;box-sizing:border-box;display:flex;flex-direction:column;gap:16px}.ws-dev .ph{flex:1;min-height:0;border-radius:18px}.ws-devrow{display:flex;align-items:baseline;justify-content:space-between;gap:16px;padding:0 6px 4px}.ws-devt{font-family:var(--font-display);font-size:21px;font-weight:800;letter-spacing:-.01em}.ws-devs{font-size:10px;font-weight:500;letter-spacing:.3em;text-transform:uppercase;color:var(--muted);white-space:nowrap}</style><div class="ws"><div class="ws-bar"><div class="ws-brand">Web Stories</div><div class="ws-nav"><span>Create</span><span>Learn</span><span>Showcase</span><span>What's new</span></div></div><div class="ws-head"><p class="ws-kicker">Portfolio / 2026</p><h1 class="ws-h1">Every story finds its people.</h1><p class="ws-lede">Eight new series this week, from a baker in Lisbon to a night-shift nurse in Osaka, each one under four minutes.</p></div><div class="ws-strip"><div class="ws-card ws-c1"><div class="ph"><img data-lumen-image="1"></div><span class="ws-chip">Skyline Tour</span></div><div class="ws-card ws-c2"><div class="ph"><img data-lumen-image="2"></div><span class="ws-chip">Reading List</span></div><div class="ws-card ws-c3"><div class="ph"><img data-lumen-image="3"></div><span class="ws-chip">Sound Walk</span></div><div class="ws-dev"><div class="ph"><img data-lumen-image="4"></div><div class="ws-devrow"><span class="ws-devt">24 Hours in New York City</span><span class="ws-devs">My Journey</span></div></div><div class="ws-card ws-c4"><div class="ph"><img data-lumen-image="5"></div><span class="ws-chip">Night Swim</span></div><div class="ws-card ws-c5"><div class="ph"><img data-lumen-image="6"></div><span class="ws-chip">Recipe Box</span></div><div class="ws-card ws-c6"><div class="ph"><img data-lumen-image="7"></div><span class="ws-chip">Field Notes</span></div></div></div></div>`,
  },
  {
    id: "gallery/feature-side-card-grid@v1",
    name: "左图组右双卡",
    group: "multi",
    brief: "左侧一张横向主图加一张宽幅横图，右侧两张等高的竖卡，每张图下带标题与栏目小字，适合资讯流或作品列表。",
    slots: 4,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden"><style>.lf{position:absolute;inset:0;background:var(--bg);color:var(--text)}.ph{overflow:hidden}.ph img{width:100%;height:100%;object-fit:cover;display:block}.lf-head{position:absolute;left:64px;right:64px;top:58px;display:flex;align-items:flex-end;justify-content:space-between;border-bottom:1px solid var(--border);padding-bottom:28px}.lf-h1{font-family:var(--font-display);font-size:96px;line-height:.92;letter-spacing:-.04em;font-weight:900;margin:0}.lf-meta{font-size:12px;font-weight:400;letter-spacing:.34em;text-transform:uppercase;color:var(--muted);line-height:2.1;text-align:right}.lf-grid{position:absolute;left:64px;right:64px;top:272px;bottom:64px;display:flex;gap:32px}.lf-main{width:1150px;display:flex;flex-direction:column;gap:32px}.lf-side{flex:1;min-width:0;display:flex;flex-direction:column;gap:32px}.lf-card{border-radius:16px;border:1px solid var(--border);background:var(--surface);display:flex;flex-direction:column;overflow:hidden;min-height:0}.lf-card .ph{flex:1;min-height:0}.lf-feature{flex:1}.lf-wide{height:246px}.lf-cap{padding:18px 22px;display:flex;align-items:baseline;justify-content:space-between;gap:18px}.lf-t{font-family:var(--font-display);font-weight:800;letter-spacing:-.015em;line-height:1.2}.lf-t-lg{font-size:32px}.lf-t-sm{font-size:19px}.lf-s{font-size:11px;font-weight:500;letter-spacing:.3em;text-transform:uppercase;color:var(--muted);white-space:nowrap}</style><div class="lf"><div class="lf-head"><h1 class="lf-h1">Read next</h1><div class="lf-meta"><div>Feed / Issue 14</div><div>26 Mar 2026</div></div></div><div class="lf-grid"><div class="lf-main"><div class="lf-card lf-feature"><div class="ph"><img data-lumen-image="1"></div><div class="lf-cap"><span class="lf-t lf-t-lg">24 Hours in New York City</span><span class="lf-s">My Journey</span></div></div><div class="lf-card lf-wide"><div class="ph"><img data-lumen-image="2"></div><div class="lf-cap"><span class="lf-t lf-t-sm">The orange cat who runs the corner shop</span><span class="lf-s">Osaka / 6 min</span></div></div></div><div class="lf-side"><div class="lf-card"><div class="ph"><img data-lumen-image="3"></div><div class="lf-cap"><span class="lf-t lf-t-sm">Favorite bakery for summer</span><span class="lf-s">Oslo</span></div></div><div class="lf-card"><div class="ph"><img data-lumen-image="4"></div><div class="lf-cap"><span class="lf-t lf-t-sm">Jellyfish, the next king of the sea</span><span class="lf-s">Deep sea</span></div></div></div></div></div></div>`,
  },
  {
    id: "gallery/portrait-card-row@v1",
    name: "六张竖卡横排",
    group: "multi",
    brief: "左上角一个大标题配手写签名与栏目信息，下方六张等高竖图横向平铺、隔张错位，图下带标题与年份地点，适合片单或系列总览。",
    slots: 6,
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden"><style>.cs{position:absolute;inset:0;background:var(--bg);color:var(--text)}.ph{overflow:hidden}.ph img{width:100%;height:100%;object-fit:cover;display:block}.cs-head{position:absolute;left:66px;right:66px;top:70px;display:flex;align-items:flex-start;justify-content:space-between;gap:60px}.cs-kicker{font-size:12px;font-weight:500;letter-spacing:.46em;text-transform:uppercase;color:var(--accent);margin:0}.cs-h1{font-family:var(--font-display);font-size:84px;line-height:.94;letter-spacing:-.035em;font-weight:900;margin:18px 0 0}.cs-lede{font-size:17px;font-weight:300;line-height:1.7;color:var(--muted);max-width:520px;margin:16px 0 0}.cs-right{text-align:right;padding-top:34px}.cs-script{font-family:var(--font-script);font-size:38px;line-height:1.1;font-weight:400;margin:0}.cs-meta{font-size:11px;font-weight:500;letter-spacing:.34em;text-transform:uppercase;color:var(--muted);margin:14px 0 0}.cs-row{position:absolute;left:66px;right:66px;top:330px;display:flex;align-items:flex-start;gap:24px}.cs-card{flex:1;min-width:0}.cs-card .ph{height:540px;border-radius:14px;border:1px solid var(--border)}.cs-off{margin-top:40px}.cs-title{font-size:17px;font-weight:600;line-height:1.35;margin:16px 0 0}.cs-sub{font-size:11px;font-weight:500;letter-spacing:.28em;text-transform:uppercase;color:var(--muted);margin:7px 0 0}</style><div class="cs"><div class="cs-head"><div><p class="cs-kicker">Selected series / 2026</p><h1 class="cs-h1">Ones to watch</h1><p class="cs-lede">Six photo essays from the current issue, shot between March and December, printed here at full column width.</p></div><div class="cs-right"><p class="cs-script">curated weekly by the editors</p><p class="cs-meta">36 series / updated friday</p></div></div><div class="cs-row"><div class="cs-card"><div class="ph"><img data-lumen-image="1"></div><h3 class="cs-title">Brick Courtyard</h3><p class="cs-sub">Milan / 2026</p></div><div class="cs-card cs-off"><div class="ph"><img data-lumen-image="2"></div><h3 class="cs-title">Salt Flats at Dawn</h3><p class="cs-sub">Utah / 2025</p></div><div class="cs-card"><div class="ph"><img data-lumen-image="3"></div><h3 class="cs-title">Night Market, Taipei</h3><p class="cs-sub">Taiwan / 2026</p></div><div class="cs-card"><div class="ph"><img data-lumen-image="4"></div><h3 class="cs-title">Paper Mills</h3><p class="cs-sub">Osaka / 2024</p></div><div class="cs-card cs-off"><div class="ph"><img data-lumen-image="5"></div><h3 class="cs-title">The Long Swim</h3><p class="cs-sub">Lisbon / 2025</p></div><div class="cs-card"><div class="ph"><img data-lumen-image="6"></div><h3 class="cs-title">Winter Orchard</h3><p class="cs-sub">Kent / 2026</p></div></div></div></div>`,
  },
];
