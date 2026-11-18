import type { PeopleLayout } from './people-layouts.js';

/**
 * 人物页的版式骨架。**这是生成文件，不要手改**。
 *
 * 由 `scripts/recognize-people-layouts.ts --emit` 从参考图识别出来并写入。
 * 改版式要改识别提示词再重跑，手改会在下一次生成时被覆盖。
 *
 * 每份都是**自包含**的（`<style>` + 一个根 `<div>`），不共用任何底座——
 * 所以各份之间的字号与留白是各自照参考图定的，横向摆在一起不必一致。
 *
 * 约束（只用 CSS 变量取色与三个字体角色、人像位标 `head`/`half` 声明取景、
 * **不写放大裁切**）见 `people-layouts.ts` 顶部的说明。共 73 份。
 */
export const PEOPLE_SKELETONS: PeopleLayout[] = [
  {
    id: "people/band-badge-quartet@v1",
    name: "横带徽章四人列",
    group: "multi",
    brief: "深色通栏色块横贯画面，四个半身像压在其上、各带一枚圆形年限徽章，下方排姓名与两行履历，适合四人均分的团队页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)"><style>.t1-kick{position:absolute;left:70px;top:26px;font-size:14px;letter-spacing:.44em;text-transform:uppercase;color:var(--muted);font-weight:400}.t1-title{position:absolute;left:64px;top:52px;margin:0;font-family:var(--font-display);font-size:120px;line-height:.95;letter-spacing:-.035em;font-weight:900;color:var(--text)}.t1-meta{position:absolute;right:70px;top:30px;text-align:right;font-size:14px;letter-spacing:.32em;text-transform:uppercase;color:var(--muted);line-height:2.2;font-weight:300}.t1-band{position:absolute;left:70px;right:70px;top:330px;bottom:70px;background:var(--brand);border-radius:2px}.t1-grid{position:absolute;left:110px;right:110px;top:200px;bottom:70px;display:flex;gap:34px}.t1-col{flex:1;display:flex;flex-direction:column;position:relative}.t1-ph{flex:0 0 400px;height:400px;position:relative}.t1-ph img{width:100%;height:100%;display:block}.t1-badge{position:absolute;left:18px;bottom:-58px;width:148px;height:148px;border-radius:50%;background:var(--accent);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:3}.t1-num{display:block;font-family:var(--font-display);font-size:56px;line-height:1;font-weight:900;letter-spacing:-.03em;color:var(--bg)}.t1-unit{display:block;margin-top:6px;font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:var(--bg);opacity:.85}.t1-text{padding-top:112px}.t1-name{margin:0;font-size:42px;font-weight:900;letter-spacing:-.02em;color:var(--bg)}.t1-role{margin:8px 0 0;font-size:18px;font-weight:300;letter-spacing:.02em;color:var(--bg);opacity:.72}.t1-desc{margin:22px 0 0;font-size:17px;line-height:1.55;font-weight:300;color:var(--bg);opacity:.85}.t1-desc+.t1-desc{margin-top:12px}</style><div class="t1-kick">Portrait Series / 2026</div><p class="t1-title">FOUR OF US</p><div class="t1-meta">Average Type<br>Four Profiles</div><div class="t1-band"></div><div class="t1-grid"><div class="t1-col"><div class="t1-ph"><img data-lumen-image="1" data-lumen-cutout="half"><div class="t1-badge"><span class="t1-num">30</span><span class="t1-unit">Years</span></div></div><div class="t1-text"><p class="t1-name">DANIEL OKAFOR</p><p class="t1-role">Chief Scientist</p><p class="t1-desc">Ran the isotope lab for eleven years and holds four patents on cold-chain sensors now used across three continents.</p><p class="t1-desc">Published 120 papers on marine geochemistry, cited more than five thousand times since 2014.</p></div></div><div class="t1-col"><div class="t1-ph"><img data-lumen-image="2" data-lumen-cutout="half"><div class="t1-badge"><span class="t1-num">25</span><span class="t1-unit">Years</span></div></div><div class="t1-text"><p class="t1-name">HANA MORI</p><p class="t1-role">Systems Architect</p><p class="t1-desc">Designed the ledger that clears nine million trades a day, then rebuilt it live over one long weekend in Osaka.</p><p class="t1-desc">Leads forty engineers across Tokyo and Berlin; the current build holds p99 latency under twelve milliseconds.</p></div></div><div class="t1-col"><div class="t1-ph"><img data-lumen-image="3" data-lumen-cutout="half"><div class="t1-badge"><span class="t1-num">23</span><span class="t1-unit">Years</span></div></div><div class="t1-text"><p class="t1-name">LEE JUN-HO</p><p class="t1-role">Data Scientist</p><p class="t1-desc">Trained the ranking model that lifted click-through by twenty-three percent in its first rollout last spring.</p><p class="t1-desc">Writes about causal inference; his recommender notes are still handed to every new analyst on day one.</p></div></div><div class="t1-col"><div class="t1-ph"><img data-lumen-image="4" data-lumen-cutout="half"><div class="t1-badge"><span class="t1-num">15</span><span class="t1-unit">Years</span></div></div><div class="t1-text"><p class="t1-name">MARA VOSS</p><p class="t1-role">Head of Product</p><p class="t1-desc">Shipped the factory floor tool now running in sixteen plants, from Hsinchu to Guadalajara, since 2021.</p><p class="t1-desc">Spent six years on the vendor side before joining; doubled hardware margin inside two quarters.</p></div></div></div></div>`,
  },
  {
    id: "people/giant-letter-quartet@v1",
    name: "巨字衬底四人列",
    group: "multi",
    brief: "四等分竖栏，每栏背后立一个巨大的展示字母，半身像压字而立，下方细分隔线接姓名、职位与四条小字履历。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)"><style>.t2-col{position:absolute;top:0;height:1080px;width:480px;overflow:hidden}.t2-c1{left:0}.t2-c2{left:480px;border-left:1px solid var(--border)}.t2-c3{left:960px;border-left:1px solid var(--border)}.t2-c4{left:1440px;border-left:1px solid var(--border)}.t2-glyph{position:absolute;top:20px;left:0;width:100%;text-align:center;font-family:var(--font-display);font-size:430px;line-height:.8;font-weight:900;letter-spacing:-.05em;color:var(--brand);opacity:.2}.t2-c2 .t2-glyph,.t2-c4 .t2-glyph{color:var(--accent);opacity:.3}.t2-ph{position:absolute;top:130px;left:44px;right:44px;height:470px}.t2-ph img{width:100%;height:100%;display:block}.t2-body{position:absolute;left:52px;right:52px;top:660px}.t2-rule{height:1px;background:var(--border);margin-bottom:26px}.t2-tag{font-size:14px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted);font-weight:400}.t2-name{margin:14px 0 0;font-family:var(--font-display);font-size:46px;line-height:1;font-weight:900;letter-spacing:-.02em;color:var(--text)}.t2-role{margin:16px 0 0;font-size:18px;font-weight:300;letter-spacing:.16em;text-transform:uppercase;color:var(--accent)}.t2-li{position:relative;margin:12px 0 0;padding-left:22px;font-size:15px;line-height:1.5;font-weight:300;color:var(--muted)}.t2-li::before{content:"";position:absolute;left:0;top:8px;width:6px;height:6px;background:var(--accent);opacity:.85}</style><div class="t2-col t2-c1"><div class="t2-glyph">D</div><div class="t2-ph"><img data-lumen-image="1" data-lumen-cutout="half"></div><div class="t2-body"><div class="t2-rule"></div><div class="t2-tag">Paris / 2024</div><p class="t2-name">MAX ROBINSON</p><p class="t2-role">Interior Architect</p><p class="t2-li">Restored the grand salon of the Hotel de Crillon</p><p class="t2-li">Designed the dining room at Costes, open since 2019</p><p class="t2-li">Lighting scheme for the 2024 Games medal hall</p><p class="t2-li">Named Designer of the Year by a Paris quarterly</p></div></div><div class="t2-col t2-c2"><div class="t2-glyph">E</div><div class="t2-ph"><img data-lumen-image="2" data-lumen-cutout="half"></div><div class="t2-body"><div class="t2-rule"></div><div class="t2-tag">Milan / 2025</div><p class="t2-name">EMILY DUVAL</p><p class="t2-role">Furniture Designer</p><p class="t2-li">Compasso d'Oro winner for the Fold chair series</p><p class="t2-li">Teaches full time at the Mendrisio academy</p><p class="t2-li">Signature lamp held in two permanent collections</p><p class="t2-li">Built lobby furniture for two Belle Epoque hotels</p></div></div><div class="t2-col t2-c3"><div class="t2-glyph">N</div><div class="t2-ph"><img data-lumen-image="3" data-lumen-cutout="half"></div><div class="t2-body"><div class="t2-rule"></div><div class="t2-tag">Madrid / 2026</div><p class="t2-name">NICHOLAS GRAY</p><p class="t2-role">Product Designer</p><p class="t2-li">Debut sofa shown at the Milan furniture fair in April</p><p class="t2-li">Chaired the jury for the 19th CDIM design awards</p><p class="t2-li">Won a Paris lifestyle prize for the Kite lamp</p><p class="t2-li">Runs a forty person studio above a tobacco factory</p></div></div><div class="t2-col t2-c4"><div class="t2-glyph">I</div><div class="t2-ph"><img data-lumen-image="4" data-lumen-cutout="half"></div><div class="t2-body"><div class="t2-rule"></div><div class="t2-tag">Hong Kong / 2026</div><p class="t2-name">HENRY CHEN</p><p class="t2-role">Design Director</p><p class="t2-li">Founder of the Chen Design Group, now 120 people</p><p class="t2-li">Named one of the city's ten best interior designers</p><p class="t2-li">First to chair the international design jury in 2021</p><p class="t2-li">Received the BBS honour for services to design</p></div></div></div>`,
  },
  {
    id: "people/four-column-portrait-list@v1",
    name: "四栏矩形人物列",
    group: "multi",
    brief: "四张方形人像横排成列，每列下方接姓名、职位与三条要点，适合四人平均型团队介绍。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);font-family:var(--font-sans);color:var(--text);overflow:hidden"><style>.hd{position:absolute;left:120px;top:70px;font-family:var(--font-display);font-size:100px;font-weight:900;line-height:.92;letter-spacing:-.035em;text-transform:uppercase}.hk{position:absolute;right:120px;top:104px;font-size:12px;font-weight:400;letter-spacing:.42em;text-transform:uppercase;color:var(--muted)}.rule{position:absolute;left:120px;right:120px;top:212px;height:1px;background:var(--border)}.col{position:absolute;top:252px;width:390px}.idx{font-size:12px;font-weight:400;letter-spacing:.4em;color:var(--muted);text-transform:uppercase;margin-bottom:16px}.col img{display:block;width:390px;height:430px;background:var(--surface)}.nm{margin-top:30px;font-size:40px;font-weight:800;line-height:1;letter-spacing:-.015em;text-transform:uppercase}.rl{margin-top:14px;font-size:14px;font-weight:300;letter-spacing:.2em;text-transform:uppercase;color:var(--accent)}.li{margin-top:26px;font-size:15px;font-weight:300;line-height:1.9;color:var(--muted)}.li p{margin:0}</style><div class="hd">Four Minds One Bench</div><div class="hk">Kowloon Labs / Team Sheet 01</div><div class="rule"></div><div class="col" style="left:120px"><div class="idx">01</div><img data-lumen-image="1" data-lumen-cutout="half"><div class="nm">Hana Mori</div><div class="rl">Chief Scientist</div><div class="li"><p>Eleven patents on qubit readout</p><p>Ran the cryostat floor since 2014</p><p>Guest lecturer at Kyoto, spring term</p></div></div><div class="col" style="left:550px"><div class="idx">02</div><img data-lumen-image="2" data-lumen-cutout="half"><div class="nm">Akira Kato</div><div class="rl">Applied ML Lead</div><div class="li"><p>PhD from Stanford, vision and speech</p><p>Won the 2023 RoboCup perception track</p><p>Ships models to forty million handsets</p></div></div><div class="col" style="left:980px"><div class="idx">03</div><img data-lumen-image="3" data-lumen-cutout="half"><div class="nm">Idris Oyelaran</div><div class="rl">Systems Architect</div><div class="li"><p>Built the mesh now serving nine regions</p><p>Cut batch job cost by sixty-two percent</p><p>Keeps the Seoul cluster on call</p></div></div><div class="col" style="left:1410px"><div class="idx">04</div><img data-lumen-image="4" data-lumen-cutout="half"><div class="nm">Marta Villanueva</div><div class="rl">Data Scientist</div><div class="li"><p>Twenty SCI papers on ranking models</p><p>Grew ad click-through four points in a year</p><p>Teaches statistics to new analysts</p></div></div></div>`,
  },
  {
    id: "people/four-rounded-cards@v1",
    name: "四卡圆角信息卡",
    group: "multi",
    brief: "四张竖长圆角卡横排，卡上半是满幅人像压姓名与职位，下半是白底简介段，适合带详细说明的团队页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);font-family:var(--font-sans);color:var(--text);overflow:hidden"><style>.hd{position:absolute;left:120px;top:70px;font-family:var(--font-display);font-size:100px;font-weight:900;line-height:.92;letter-spacing:-.035em;text-transform:uppercase}.hk{position:absolute;right:120px;top:104px;font-size:12px;font-weight:400;letter-spacing:.42em;text-transform:uppercase;color:var(--muted)}.rule{position:absolute;left:120px;right:120px;top:212px;height:1px;background:var(--border)}.card{position:absolute;top:252px;width:390px;height:660px;border-radius:28px;overflow:hidden;background:var(--surface)}.band{position:relative;height:330px;background:var(--brand)}.band img{position:absolute;left:0;top:0;width:100%;height:100%}.who{position:absolute;left:26px;top:26px}.role{font-size:12px;font-weight:400;letter-spacing:.34em;text-transform:uppercase;color:var(--bg);opacity:.82}.nm{margin-top:10px;font-family:var(--font-display);font-size:42px;font-weight:900;line-height:.98;letter-spacing:-.025em;text-transform:uppercase;color:var(--bg)}.txt{padding:32px 30px 0}.lead{margin:0;font-size:19px;font-weight:700;line-height:1.4}.body{margin:18px 0 0;font-size:15px;font-weight:300;line-height:1.85;color:var(--muted)}.ft{position:absolute;left:0;right:0;top:962px;text-align:center;font-size:14px;font-weight:300;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}</style><div class="hd">Who Walks With Us</div><div class="hk">Portrait Series / 2026</div><div class="rule"></div><div class="card" style="left:120px"><div class="band"><img data-lumen-image="1" data-lumen-cutout="half"><div class="who"><div class="role">Chief Scientist</div><div class="nm">Mira Halvorsen</div></div></div><div class="txt"><p class="lead">Runs the national quantum lab</p><p class="body">Leads forty researchers across three campuses and still takes the six am cryostat shift every Thursday.</p></div></div><div class="card" style="left:550px"><div class="band"><img data-lumen-image="2" data-lumen-cutout="half"><div class="who"><div class="role">Systems Architect</div><div class="nm">Tomas Reyes</div></div></div><div class="txt"><p class="lead">Designed the mesh carrying nine regions</p><p class="body">Writes the failure playbooks nobody reads until three am, then rewrites them from memory the next morning.</p></div></div><div class="card" style="left:980px"><div class="band"><img data-lumen-image="3" data-lumen-cutout="half"><div class="who"><div class="role">Data Scientist</div><div class="nm">Chen Siyuan</div></div></div><div class="txt"><p class="lead">Owns the ranking model behind the feed</p><p class="body">Moved click-through up four points in one year while cutting the monthly training bill in half.</p></div></div><div class="card" style="left:1410px"><div class="band"><img data-lumen-image="4" data-lumen-cutout="half"><div class="who"><div class="role">Research Engineer</div><div class="nm">Ama Boateng</div></div></div><div class="txt"><p class="lead">Turns papers into pipelines in eleven days</p><p class="body">Keeps the reproduction notebook honest and publishes every failed run alongside the wins.</p></div></div><div class="ft">Four practitioners, one bench — Seoul / 2026</div></div>`,
  },
  {
    id: "people/circle-quad-team@v1",
    name: "圆像四宫格团队",
    group: "multi",
    brief: "标题横贯顶部，下方四宫格每格左侧圆形头肩像、右侧姓名职位与细线分隔的短句，适合四人平均型团队介绍。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg)">
<style>
.hd{position:absolute;left:110px;top:74px;width:1700px;display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid var(--border);padding-bottom:26px}
.hd h1{margin:0;font-family:var(--font-display);font-size:96px;font-weight:900;letter-spacing:-.035em;line-height:.92;color:var(--text)}
.hd .org{font-size:12px;font-weight:500;letter-spacing:.42em;text-transform:uppercase;color:var(--muted)}
.grid{position:absolute;left:110px;top:252px;width:1700px;height:758px;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:32px}
.cell{display:flex;align-items:center;gap:38px;background:var(--surface);border:1px solid var(--border);border-radius:28px;padding:36px 46px}
.pic{flex:0 0 auto;width:188px;height:188px;border-radius:50%;overflow:hidden;border:5px solid var(--border);background:var(--bg)}
.pic img{width:100%;height:100%}
.body{flex:1 1 auto;min-width:0}
.nm{font-family:var(--font-display);font-size:40px;font-weight:800;letter-spacing:-.012em;line-height:1;color:var(--text)}
.rl{display:block;margin-top:11px;font-size:12px;font-weight:600;letter-spacing:.4em;text-transform:uppercase;color:var(--accent)}
.li{margin:16px 0 0;padding-top:12px;border-top:1px solid var(--border);font-size:17px;font-weight:300;line-height:1.5;color:var(--muted)}
.li b{font-weight:600;color:var(--text)}
</style>
<div class="hd"><h1>WHO CARRIES<br>THE WORK</h1><span class="org">SOUTHBANK STUDIO / 2026</span></div>
<div class="grid">
<div class="cell"><div class="pic"><img data-lumen-image="1" data-lumen-cutout="head"></div><div class="body"><div class="nm">HANA MORI</div><span class="rl">Chief Scientist</span><p class="li"><b>Eleven patents</b> on cold-atom interferometry, three licensed to a Nagoya foundry.</p><p class="li">Runs the five-metre vacuum bench where coherence is measured nightly.</p></div></div>
<div class="cell"><div class="pic"><img data-lumen-image="2" data-lumen-cutout="head"></div><div class="body"><div class="nm">LEE JUN</div><span class="rl">Lead Systems Architect</span><p class="li">Rebuilt the ticketing core to hold <b>40,000</b> requests a second.</p><p class="li">Keeps a paper log of every rollback since the 2019 outage.</p></div></div>
<div class="cell"><div class="pic"><img data-lumen-image="3" data-lumen-cutout="head"></div><div class="body"><div class="nm">AKIRA KATO</div><span class="rl">Data Scientist</span><p class="li">Trains bidding models on <b>nine years</b> of auction logs from Osaka.</p><p class="li">Teaches one evening class on messy data to new analysts.</p></div></div>
<div class="cell"><div class="pic"><img data-lumen-image="4" data-lumen-cutout="head"></div><div class="body"><div class="nm">MIRA SOLBERG</div><span class="rl">Head of Field Research</span><p class="li">Spends <b>120 days</b> a year on site, mostly in coastal shipyards.</p><p class="li">Writes the interview notes the whole studio quotes from.</p></div></div>
</div>
</div>`,
  },
  {
    id: "people/circle-four-column@v1",
    name: "圆像四栏横排",
    group: "multi",
    brief: "四张圆形头肩像在同一水平线横向并排，像下依次是姓名、职位与带横线的多行简介，适合并列展示同层级人物。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg)">
<style>
.top{position:absolute;left:110px;top:74px;width:1700px;display:flex;justify-content:space-between;align-items:baseline;border-bottom:1px solid var(--border);padding-bottom:26px}
.top h1{margin:0;font-family:var(--font-display);font-size:96px;font-weight:900;letter-spacing:-.035em;line-height:.92;color:var(--text)}
.top .org{font-size:12px;font-weight:500;letter-spacing:.42em;text-transform:uppercase;color:var(--muted)}
.cols{position:absolute;left:110px;top:300px;width:1700px;height:706px;display:flex;gap:56px}
.col{flex:1 1 0;min-width:0;display:flex;flex-direction:column}
.pic{width:262px;height:262px;border-radius:50%;overflow:hidden;border:5px solid var(--border);background:var(--surface)}
.pic img{width:100%;height:100%}
.nm{margin-top:34px;font-family:var(--font-display);font-size:38px;font-weight:800;letter-spacing:-.012em;line-height:1;color:var(--text)}
.rl{margin-top:11px;font-size:12px;font-weight:600;letter-spacing:.4em;text-transform:uppercase;color:var(--accent)}
.p{margin:20px 0 0;padding-top:13px;border-top:1px solid var(--border);font-size:17px;font-weight:300;line-height:1.55;color:var(--muted)}
.p b{font-weight:600;color:var(--text)}
</style>
<div class="top"><h1>FOUR AT THE TABLE</h1><span class="org">NORTHLINE GROUP / SEOUL</span></div>
<div class="cols">
<div class="col"><div class="pic"><img data-lumen-image="1" data-lumen-cutout="head"></div><div class="nm">SOFIA BRENNER</div><span class="rl">Managing Director</span><p class="p">Ran the Asian desk of a German energy trader for <b>nine years</b> before joining.</p><p class="p">Led two cross-border acquisitions and one quiet IPO in 2023.</p><p class="p">Keeps a standing Monday call with every plant manager.</p></div>
<div class="col"><div class="pic"><img data-lumen-image="2" data-lumen-cutout="head"></div><div class="nm">DANIEL OKAFOR</div><span class="rl">Head of Operations</span><p class="p">Twenty years on hydrogen sites, from pilot skid to full commercial line.</p><p class="p">Wrote the shutdown procedure now used at <b>four</b> ports.</p><p class="p">Trains new crews on the night shift himself.</p></div>
<div class="col"><div class="pic"><img data-lumen-image="3" data-lumen-cutout="head"></div><div class="nm">PRIYA RAGHAVAN</div><span class="rl">Research Director</span><p class="p">Published <b>thirty-one</b> papers on membrane durability in fuel cells.</p><p class="p">Holds four patents shared with the Munich materials lab.</p><p class="p">Runs the joint doctorate programme with two universities.</p></div>
<div class="col"><div class="pic"><img data-lumen-image="4" data-lumen-cutout="head"></div><div class="nm">ELENA VOSS</div><span class="rl">Vice President, Growth</span><p class="p">Opened <b>seven</b> new markets across Southeast Asia since 2021.</p><p class="p">Built the partner network that now carries half of revenue.</p><p class="p">Speaks at three industry fairs a year and hates panels.</p></div>
</div>
</div>`,
  },
  {
    id: "people/rounded-card-quad-grid@v1",
    name: "四宫格圆角卡片",
    group: "multi",
    brief: "四张圆角卡片按 2×2 排布，每张左侧方形头肩像、右侧姓名与角色，下方浅色细条目区，适合四人平均型团队介绍。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);font-family:var(--font-sans)"><style>.l1-title{position:absolute;left:80px;top:66px;margin:0;font-family:var(--font-display);font-size:78px;font-weight:900;letter-spacing:-.03em;line-height:.95;color:var(--text);text-transform:uppercase}.l1-kicker{position:absolute;right:80px;top:98px;margin:0;font-size:16px;font-weight:400;letter-spacing:.36em;color:var(--muted);text-transform:uppercase}.l1-rule{position:absolute;left:80px;right:80px;top:186px;height:1px;background:var(--border)}.l1-card{position:absolute;width:860px;height:400px;background:var(--surface);border:1px solid var(--border);border-radius:26px}.l1-photo{position:absolute;left:34px;top:34px;width:196px;height:196px;border-radius:18px;overflow:hidden;background:var(--brand)}.l1-name{position:absolute;left:264px;top:62px;margin:0;font-family:var(--font-display);font-size:46px;font-weight:800;letter-spacing:-.01em;line-height:1;color:var(--text)}.l1-role{position:absolute;left:266px;top:128px;margin:0;font-size:17px;font-weight:500;letter-spacing:.2em;color:var(--accent);text-transform:uppercase}.l1-meter{position:absolute;left:266px;top:172px;width:116px;height:3px;background:var(--accent);opacity:.85}.l1-panel{position:absolute;left:34px;top:252px;width:792px;height:114px;border-radius:16px;background:var(--bg);border:1px solid var(--border)}.l1-item{position:absolute;display:flex;align-items:center;gap:12px;width:366px;margin:0;font-size:16px;font-weight:400;line-height:1.3;color:var(--muted)}.l1-bar{display:block;flex:none;width:20px;height:1px;background:var(--accent);opacity:.7}</style><p class="l1-title">FOUR OF US</p><p class="l1-kicker">TEAM PORTRAIT / SEOUL 2026</p><div class="l1-rule"></div><div class="l1-card" style="left:80px;top:214px"><div class="l1-photo"><img data-lumen-image="1" data-lumen-cutout="head" style="width:100%;height:100%"></div><p class="l1-name">HANA MORI</p><p class="l1-role">Machine Learning Lead</p><div class="l1-meter"></div><div class="l1-panel"><p class="l1-item" style="left:26px;top:24px"><span class="l1-bar"></span>Ranking model behind 40M daily queries</p><p class="l1-item" style="left:404px;top:24px"><span class="l1-bar"></span>Six papers on retrieval at SIGIR</p><p class="l1-item" style="left:26px;top:68px"><span class="l1-bar"></span>Stanford PhD, computer science 2019</p><p class="l1-item" style="left:404px;top:68px"><span class="l1-bar"></span>Mentors four researchers in Tokyo</p></div></div><div class="l1-card" style="left:980px;top:214px"><div class="l1-photo"><img data-lumen-image="2" data-lumen-cutout="head" style="width:100%;height:100%"></div><p class="l1-name">LEE JUN</p><p class="l1-role">Chief Scientist</p><div class="l1-meter"></div><div class="l1-panel"><p class="l1-item" style="left:26px;top:24px"><span class="l1-bar"></span>Ran the national deep learning grant</p><p class="l1-item" style="left:404px;top:24px"><span class="l1-bar"></span>100 SCI papers and nine patents</p><p class="l1-item" style="left:26px;top:68px"><span class="l1-bar"></span>Heads the state key lab in Shanghai</p><p class="l1-item" style="left:404px;top:68px"><span class="l1-bar"></span>Advises two ministries on AI policy</p></div></div><div class="l1-card" style="left:80px;top:646px"><div class="l1-photo"><img data-lumen-image="3" data-lumen-cutout="head" style="width:100%;height:100%"></div><p class="l1-name">MARCO RUIZ</p><p class="l1-role">Frontend Engineer</p><div class="l1-meter"></div><div class="l1-panel"><p class="l1-item" style="left:26px;top:24px"><span class="l1-bar"></span>Ships React and Vue for 12M users</p><p class="l1-item" style="left:404px;top:24px"><span class="l1-bar"></span>Cut page load from 4.1s to 900ms</p><p class="l1-item" style="left:26px;top:68px"><span class="l1-bar"></span>Core contributor, two frameworks</p><p class="l1-item" style="left:404px;top:68px"><span class="l1-bar"></span>Reviews 30 pull requests a week</p></div></div><div class="l1-card" style="left:980px;top:646px"><div class="l1-photo"><img data-lumen-image="4" data-lumen-cutout="head" style="width:100%;height:100%"></div><p class="l1-name">IRIS TAN</p><p class="l1-role">Interface Designer</p><div class="l1-meter"></div><div class="l1-panel"><p class="l1-item" style="left:26px;top:24px"><span class="l1-bar"></span>App featured by Apple in 14 countries</p><p class="l1-item" style="left:404px;top:24px"><span class="l1-bar"></span>Red Dot Award, communication 2024</p><p class="l1-item" style="left:26px;top:68px"><span class="l1-bar"></span>Five years across Seoul and Berlin</p><p class="l1-item" style="left:404px;top:68px"><span class="l1-bar"></span>Rebuilt checkout for 2M shoppers</p></div></div></div>`,
  },
  {
    id: "people/skewed-column-stagger@v1",
    name: "四柱斜切错落",
    group: "multi",
    brief: "四根斜切平行四边形人像柱高低交错排开，柱下接姓名、身份与短介，适合四人并列的群像封面。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);font-family:var(--font-sans)"><style>.p2-title{position:absolute;left:90px;top:58px;margin:0;font-family:var(--font-display);font-size:76px;font-weight:900;letter-spacing:-.03em;line-height:.95;color:var(--text);text-transform:uppercase}.p2-kicker{position:absolute;right:80px;top:90px;margin:0;font-size:16px;font-weight:400;letter-spacing:.36em;color:var(--muted);text-transform:uppercase}.p2-col{position:absolute;width:380px}.p2-frame{width:380px;height:400px;overflow:hidden;transform:skewX(-9deg);background:var(--brand);border-radius:4px}.p2-frame img{width:100%;height:100%;transform:skewX(9deg)}.p2-tick{width:64px;height:3px;background:var(--accent);margin:40px 0 24px}.p2-name{margin:0;font-family:var(--font-display);font-size:42px;font-weight:800;letter-spacing:-.01em;line-height:1;color:var(--text);text-transform:uppercase}.p2-role{margin:14px 0 0;font-size:15px;font-weight:500;letter-spacing:.28em;color:var(--accent);text-transform:uppercase}.p2-desc{margin:18px 0 0;max-width:340px;font-size:17px;font-weight:300;line-height:1.65;color:var(--muted)}</style><p class="p2-title">WHO WALKS WITH US</p><p class="p2-kicker">PORTRAIT SERIES / 2026</p><div class="p2-col" style="left:90px;top:320px"><div class="p2-frame"><img data-lumen-image="1" data-lumen-cutout="half"></div><div class="p2-tick"></div><p class="p2-name">AKIRA KATO</p><p class="p2-role">Chief Scientist</p><p class="p2-desc">Thirty years of field research on coastal erosion, four books and a stubborn refusal to fly.</p></div><div class="p2-col" style="left:550px;top:210px"><div class="p2-frame"><img data-lumen-image="2" data-lumen-cutout="half"></div><div class="p2-tick"></div><p class="p2-name">HANA MORI</p><p class="p2-role">Machine Learning</p><p class="p2-desc">Stanford trained, now teaching small models to read shipping manifests at the port of Osaka.</p></div><div class="p2-col" style="left:1010px;top:320px"><div class="p2-frame"><img data-lumen-image="3" data-lumen-cutout="half"></div><div class="p2-tick"></div><p class="p2-name">EDDIE CHOW</p><p class="p2-role">Systems Architect</p><p class="p2-desc">Keeps a million requests a second alive on a Tuesday, and writes the postmortems nobody else will.</p></div><div class="p2-col" style="left:1470px;top:210px"><div class="p2-frame"><img data-lumen-image="4" data-lumen-cutout="half"></div><div class="p2-tick"></div><p class="p2-name">MIA CHEN</p><p class="p2-role">Data Scientist</p><p class="p2-desc">Measures what people click and why, then argues with the marketers about the difference.</p></div></div>`,
  },
  {
    id: "people/vertical-wordmark-five-strips@v1",
    name: "竖排巨字五人条带",
    group: "multi",
    brief: "左侧竖排巨字压住整条版面，右侧五幅竖条人像高低错落前后叠压，适合群像宣言式的封面或系列页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden"><style>.shift-field{position:absolute;left:0;top:140px;width:1920px;height:760px;background:var(--accent)}.slash{position:absolute;top:118px;height:804px;background:var(--text);opacity:.9;transform:skewX(-16deg);z-index:1}.slash-a{left:1596px;width:72px}.slash-b{left:1734px;width:32px}.word{position:absolute;left:36px;top:168px;writing-mode:vertical-rl;font-family:var(--font-display);font-weight:900;font-size:142px;line-height:1;letter-spacing:-.04em;text-transform:uppercase;color:var(--text);z-index:2}.strip{position:absolute;overflow:hidden;background:var(--surface);z-index:2}.strip img{display:block;width:100%;height:100%}.p1{left:290px;top:310px;width:310px;height:430px}.p2{left:545px;top:260px;width:330px;height:460px;z-index:3}.p3{left:780px;top:215px;width:390px;height:540px;z-index:5}.p4{left:1030px;top:260px;width:330px;height:460px;z-index:3}.p5{left:1285px;top:310px;width:310px;height:430px}.kl{position:absolute;left:40px;top:40px;font-size:17px;font-weight:800;letter-spacing:.34em;line-height:1.6;text-transform:uppercase;color:var(--text)}.kl span{display:block;width:52px;margin-top:10px;padding-top:8px;border-top:2px solid var(--border);font-weight:300;letter-spacing:.34em;color:var(--muted)}.kr{position:absolute;right:40px;top:40px;width:380px;text-align:right;font-size:17px;font-weight:300;letter-spacing:.32em;line-height:1.7;text-transform:uppercase;color:var(--muted)}.cap{position:absolute;left:780px;top:936px;width:560px}.cap-name{font-family:var(--font-display);font-size:42px;font-weight:400;line-height:1.1;letter-spacing:.01em;text-transform:uppercase;color:var(--text)}.cap-role{margin-top:12px;font-size:14px;font-weight:500;letter-spacing:.36em;text-transform:uppercase;color:var(--muted)}.fl{position:absolute;left:40px;top:952px;font-size:16px;font-weight:800;letter-spacing:.3em;line-height:1.9;text-transform:uppercase;color:var(--text)}.fl span{display:block;font-weight:300;color:var(--muted)}.fr{position:absolute;right:40px;top:952px;text-align:right;font-size:15px;font-weight:400;letter-spacing:.3em;line-height:1.9;text-transform:uppercase;color:var(--muted)}</style><div class="shift-field"></div><div class="slash slash-a"></div><div class="slash slash-b"></div><div class="word">SHIFT</div><div class="strip p1"><img data-lumen-image="1" data-lumen-cutout="half"></div><div class="strip p2"><img data-lumen-image="2" data-lumen-cutout="half"></div><div class="strip p3"><img data-lumen-image="3" data-lumen-cutout="half"></div><div class="strip p4"><img data-lumen-image="4" data-lumen-cutout="half"></div><div class="strip p5"><img data-lumen-image="5" data-lumen-cutout="half"></div><div class="kl">NEW CREATIVE CLASS<span>2026</span></div><div class="kr">A brighter creative tomorrow</div><div class="cap"><div class="cap-name">JUNE PARK</div><div class="cap-role">Editorial Director / Seoul</div></div><div class="fl">Same ideas<span>Different tomorrow</span></div><div class="fr">People Culture Ideas in Motion</div></div>`,
  },
  {
    id: "people/collage-hero-yearbook@v1",
    name: "拼贴人像大字封面",
    group: "multi",
    brief: "超大字标题压在正中主视觉上，四周斜置拍立得人像与粉色胶带拼贴，适合群像年册或企划封面",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);color:var(--text)">
<style>
.yb-kick{position:absolute;font-size:15px;font-weight:600;letter-spacing:.34em;text-transform:uppercase;line-height:1.9}
.yb-kick span{display:block}
.yb-rule{position:absolute;width:54px;height:3px;background:var(--accent)}
.yb-title{position:absolute;left:76px;top:152px;font-family:var(--font-display);font-weight:900;font-size:170px;line-height:.84;letter-spacing:-.04em;text-transform:uppercase;white-space:nowrap}
.yb-title span{color:var(--accent)}
.yb-sub{position:absolute;left:80px;top:342px;font-size:38px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;line-height:1}
.yb-script{position:absolute;left:84px;top:415px;font-family:var(--font-script);font-size:54px;color:var(--accent);transform:rotate(-7deg)}
.yb-underline{position:absolute;left:92px;top:492px;width:200px;height:3px;background:var(--accent);transform:rotate(-7deg)}
.yb-card{position:absolute;background:var(--surface);padding:14px;border:1px solid var(--border)}
.yb-card img{display:block;width:100%;height:100%}
.yb-tape{position:absolute;background:var(--accent);opacity:.8}
.yb-oval{position:absolute;border:2px solid var(--accent);border-radius:50%;display:flex;align-items:center;justify-content:center;text-align:center;font-size:13px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;line-height:1.9;transform:rotate(-9deg)}
.yb-foot{position:absolute;font-size:14px;font-weight:600;letter-spacing:.42em;text-transform:uppercase;line-height:2;color:var(--muted)}
.yb-foot span{display:block}
</style>
<div class="yb-kick" style="left:76px;top:58px"><span>New People</span><span>New Frame</span></div>
<div class="yb-rule" style="left:76px;top:124px"></div>
<div class="yb-kick" style="right:76px;top:58px;text-align:right"><span>Same Generation</span><span>Different Perspective</span></div>
<div class="yb-rule" style="right:76px;top:124px"></div>
<div class="yb-title">Class <span>26</span></div>
<div class="yb-sub">Creator Yearbook</div>
<div class="yb-script">More than Creators</div>
<div class="yb-underline"></div>
<div class="yb-oval" style="left:470px;top:540px;width:230px;height:150px">Good Ideas<br>Brighter People</div>
<div class="yb-card" style="left:1480px;top:130px;width:400px;height:430px;transform:rotate(3deg)"><img data-lumen-image="1" data-lumen-cutout="half"></div>
<div class="yb-card" style="left:1450px;top:590px;width:400px;height:370px;transform:rotate(-5deg)"><img data-lumen-image="2" data-lumen-cutout="head"></div>
<div class="yb-card" style="left:96px;top:620px;width:330px;height:330px;transform:rotate(5deg)"><img data-lumen-image="3" data-lumen-cutout="head"></div>
<div class="yb-card" style="left:440px;top:700px;width:300px;height:300px;transform:rotate(-6deg)"><img data-lumen-image="4" data-lumen-cutout="head"></div>
<div class="yb-card" style="left:760px;top:720px;width:250px;height:250px;transform:rotate(-2deg)"><img data-lumen-image="5" data-lumen-cutout="head"></div>
<div class="yb-card" style="left:940px;top:100px;width:500px;height:690px;transform:rotate(-2deg)"><img data-lumen-image="6" data-lumen-cutout="half"></div>
<div class="yb-tape" style="left:1400px;top:96px;width:160px;height:44px;transform:rotate(14deg)"></div>
<div class="yb-tape" style="left:1330px;top:520px;width:140px;height:38px;transform:rotate(18deg)"></div>
<div class="yb-tape" style="left:880px;top:700px;width:170px;height:40px;transform:rotate(-10deg)"></div>
<div class="yb-tape" style="left:300px;top:600px;width:150px;height:36px;transform:rotate(-8deg)"></div>
<div class="yb-foot" style="left:76px;top:985px"><span>New Faces</span><span>New Work</span></div>
<div class="yb-rule" style="left:76px;top:952px"></div>
<div class="yb-foot" style="left:940px;top:872px"><span>More Than Creators</span><span>A Brighter Tomorrow</span></div>
<div class="yb-rule" style="right:76px;top:952px"></div>
<div class="yb-foot" style="right:76px;top:978px;text-align:right"><span>Culture People</span><span>Ideas 2026</span></div>
</div>`,
  },
  {
    id: "people/giant-type-five-strips@v1",
    name: "巨字后五条立像",
    group: "multi",
    brief: "巨型展示字横贯页面上方，五条竖幅人像并排压在字脚上，角落配期号与栏目小字；适合群像主视觉封面。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden"><style>.vc-word{position:absolute;left:-60px;right:-60px;top:40px;text-align:center;white-space:nowrap;font-family:var(--font-display);font-weight:900;font-size:340px;line-height:.88;letter-spacing:-.035em;text-transform:uppercase;color:var(--accent);z-index:1}.vc-meta{position:absolute;right:76px;top:64px;z-index:5;text-align:right}.vc-meta p{margin:0;font-size:20px;font-weight:300;letter-spacing:.44em;text-transform:uppercase;color:var(--text);line-height:2.1}.vc-line{display:block;width:130px;height:2px;background:var(--text);opacity:.55;margin:16px 0 16px auto}.vc-thin{color:var(--muted)}.vc-strips{position:absolute;left:206px;top:262px;width:1508px;height:818px;display:flex;gap:12px;background:var(--accent);z-index:3}.vc-strip{flex:1;background:var(--surface);overflow:hidden}.vc-strip img{width:100%;height:100%;display:block}.vc-foot{position:absolute;left:76px;bottom:62px;z-index:5;font-size:20px;font-weight:300;letter-spacing:.44em;text-transform:uppercase;color:var(--text)}.vc-num{position:absolute;right:76px;bottom:62px;z-index:5;font-size:20px;font-weight:300;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)}</style><div class="vc-word">Voices</div><div class="vc-meta"><p>After</p><p>Dark</p><span class="vc-line"></span><p class="vc-thin">2026</p></div><div class="vc-strips"><div class="vc-strip"><img data-lumen-image="1" data-lumen-cutout="head"></div><div class="vc-strip"><img data-lumen-image="2" data-lumen-cutout="head"></div><div class="vc-strip"><img data-lumen-image="3" data-lumen-cutout="head"></div><div class="vc-strip"><img data-lumen-image="4" data-lumen-cutout="head"></div><div class="vc-strip"><img data-lumen-image="5" data-lumen-cutout="head"></div></div><div class="vc-foot">Culture / Image / Sound</div><div class="vc-num">Issue 04</div></div>`,
  },
  {
    id: "people/six-portrait-oversized-title@v1",
    name: "六像错位巨字横贯",
    group: "multi",
    brief: "六张半身人像错位铺成上下两排，超大标题横贯画面中部压在像上，左右窄栏收栏目词、城市与日期。",
    skeleton: `<div class="fv" style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)"><style>.fv-blob{position:absolute;background:var(--accent);border-radius:50%;opacity:.85}.fv-bar{position:absolute;background:var(--accent);opacity:.9}.fv-card{position:absolute;overflow:hidden;background:var(--surface);border:1px solid var(--border)}.fv-card img{display:block;width:100%;height:100%}.fv-name{position:absolute;font-weight:800;font-size:30px;line-height:1.1;letter-spacing:.02em;color:var(--text);text-transform:uppercase;width:340px}.fv-role{position:absolute;font-weight:400;font-size:15px;line-height:1.6;letter-spacing:.26em;color:var(--muted);text-transform:uppercase;width:340px}.fv-kick{position:absolute;font-weight:400;font-size:17px;line-height:2;letter-spacing:.3em;color:var(--muted);text-transform:uppercase;width:280px}.fv-head{position:absolute;font-family:var(--font-display);font-weight:900;font-size:46px;line-height:1.02;letter-spacing:-.01em;color:var(--text);text-transform:uppercase;width:290px}.fv-title{position:absolute;font-family:var(--font-display);font-weight:900;font-size:200px;line-height:.9;letter-spacing:-.04em;color:var(--text);text-transform:uppercase;white-space:nowrap}.fv-note{position:absolute;font-weight:300;font-size:22px;line-height:1.7;letter-spacing:.2em;color:var(--muted);text-transform:uppercase;text-align:right;width:330px}.fv-city{position:absolute;font-weight:900;font-size:96px;line-height:.9;letter-spacing:-.03em;color:var(--text);text-transform:uppercase}.fv-date{position:absolute;font-weight:300;font-size:42px;line-height:1;letter-spacing:.08em;color:var(--text)}.fv-tiny{position:absolute;font-weight:400;font-size:15px;line-height:1.9;letter-spacing:.28em;color:var(--muted);text-transform:uppercase}.fv-script{position:absolute;font-family:var(--font-script);font-size:74px;line-height:1.1;color:var(--text);text-align:right;width:330px;transform:rotate(-5deg)}.fv-rule{position:absolute;background:var(--text);opacity:.3;height:1px}</style><div class="fv-blob" style="left:230px;top:-170px;width:580px;height:580px"></div><div class="fv-blob" style="left:1120px;top:690px;width:540px;height:540px"></div><div class="fv-bar" style="left:1524px;top:640px;width:20px;height:365px"></div><div class="fv-card" style="left:390px;top:20px;width:350px;height:370px"><img data-lumen-image="1" data-lumen-cutout="half"></div><div class="fv-card" style="left:775px;top:20px;width:350px;height:370px"><img data-lumen-image="2" data-lumen-cutout="half"></div><div class="fv-card" style="left:1160px;top:20px;width:350px;height:370px"><img data-lumen-image="3" data-lumen-cutout="half"></div><div class="fv-card" style="left:390px;top:620px;width:350px;height:385px"><img data-lumen-image="4" data-lumen-cutout="half"></div><div class="fv-card" style="left:775px;top:620px;width:350px;height:385px"><img data-lumen-image="5" data-lumen-cutout="half"></div><div class="fv-card" style="left:1160px;top:620px;width:350px;height:385px"><img data-lumen-image="6" data-lumen-cutout="half"></div><div class="fv-title" style="left:70px;top:508px">FUTURE VOICES</div><div class="fv-head" style="left:60px;top:44px">AI Creator Summit</div><div class="fv-kick" style="left:60px;top:190px">IDEAS<br>PEOPLE<br>TOOLS<br>A MORE CREATIVE TOMORROW</div><div class="fv-rule" style="left:60px;top:360px;width:220px"></div><div class="fv-kick" style="left:60px;top:400px">SEOUL<br>TOKYO<br>TAIPEI<br>BANGKOK<br>SINGAPORE</div><div class="fv-city" style="left:60px;top:790px">SEOUL</div><div class="fv-date" style="left:62px;top:900px">17 OCT 2026</div><div class="fv-tiny" style="left:62px;top:972px">COEX CONFERENCE CENTER<br>SEOUL, KOREA</div><div class="fv-kick" style="left:1550px;top:44px;width:330px;text-align:right">ART<br>TECH<br>HUMAN<br>POSSIBILITIES</div><div class="fv-note" style="left:1550px;top:400px">PEOPLE SHAPING CREATIVE WORK WITH AI</div><div class="fv-script" style="left:1560px;top:700px">Good Ideas<br>Travel Further</div><div class="fv-tiny" style="left:1550px;top:950px;width:330px;text-align:right">A MORE OPEN<br>CREATIVE<br>TOMORROW</div><div class="fv-name" style="left:390px;top:398px">YUNA SEO</div><div class="fv-role" style="left:390px;top:436px">AI Artist</div><div class="fv-name" style="left:775px;top:398px">REN ITO</div><div class="fv-role" style="left:775px;top:436px">Creative Coder</div><div class="fv-name" style="left:1160px;top:398px">LINA CHEN</div><div class="fv-role" style="left:1160px;top:436px">Generative Filmmaker</div><div class="fv-name" style="left:390px;top:1013px">MIKA SATO</div><div class="fv-role" style="left:390px;top:1051px">Design Researcher</div><div class="fv-name" style="left:775px;top:1013px">JAE MIN</div><div class="fv-role" style="left:775px;top:1051px">Workflow Builder</div><div class="fv-name" style="left:1160px;top:1013px">THEO HAN</div><div class="fv-role" style="left:1160px;top:1051px">Independent Founder</div></div>`,
  },
  {
    id: "people/six-strip-portrait-wall@v1",
    name: "六栏竖像海报",
    group: "multi",
    brief: "顶部巨字标题压阵加右侧信息栏，下方六条竖幅人像并列，每条带姓名、方向与短句注释，适合六人群展或团队总览。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);color:var(--text);font-family:var(--font-sans);overflow:hidden"><style>.p1-t{position:absolute;font-family:var(--font-display);font-weight:900;font-size:150px;line-height:.88;letter-spacing:-.04em;text-transform:uppercase}.p1-t1{left:80px;top:46px}.p1-t2{left:672px;top:190px}.p1-bar{position:absolute;left:604px;top:60px;width:30px;height:150px;background:var(--accent)}.p1-meta{position:absolute;right:80px;top:54px;width:430px;text-align:right}.p1-kick{font-size:16px;font-weight:400;letter-spacing:.34em;line-height:2;text-transform:uppercase}.p1-rule{height:1px;width:190px;margin:22px 0 22px auto;background:var(--border)}.p1-note{font-size:17px;letter-spacing:.14em;line-height:1.8;text-transform:uppercase;color:var(--muted)}.p1-date{font-size:24px;font-weight:800;letter-spacing:.02em;margin-top:22px}.p1-venue{font-size:19px;letter-spacing:.05em;margin-top:6px}.p1-cities{font-size:14px;letter-spacing:.26em;text-transform:uppercase;color:var(--muted);margin-top:14px}.p1-sub{position:absolute;left:80px;top:332px;max-width:660px;font-size:32px;font-weight:300;line-height:1.3;letter-spacing:.01em}.p1-wall{position:absolute;left:80px;top:470px;width:1758px;height:520px;display:flex;gap:18px}.p1-col{width:278px;display:flex;flex-direction:column}.p1-col img{width:278px;height:340px;background:var(--surface)}.p1-name{font-size:23px;font-weight:800;letter-spacing:.01em;text-transform:uppercase;margin-top:18px}.p1-role{font-size:13px;letter-spacing:.3em;text-transform:uppercase;color:var(--muted);margin-top:7px}.p1-line{height:1px;background:var(--border);margin:13px 0}.p1-cap{font-size:13px;letter-spacing:.18em;line-height:1.8;text-transform:uppercase;color:var(--muted)}.p1-hot{padding:16px 14px;background:var(--accent);color:var(--bg);font-size:13px;font-weight:600;letter-spacing:.18em;line-height:1.8;text-transform:uppercase}.p1-foot{position:absolute;bottom:34px;font-size:15px;letter-spacing:.32em;text-transform:uppercase;color:var(--muted)}.p1-foot-l{left:80px}.p1-foot-r{right:80px}</style><div class="p1-t p1-t1">After</div><div class="p1-t p1-t2">Image</div><div class="p1-bar"></div><div class="p1-meta"><div class="p1-kick">Asian photography<br>exhibition<br>2026</div><div class="p1-rule"></div><div class="p1-note">What remains<br>after the shutter closes?</div><div class="p1-rule"></div><div class="p1-date">12 Dec 2026 — 18 Jan 2027</div><div class="p1-venue">Seoul Photo Space</div><div class="p1-cities">Seoul / Tokyo / Taipei / Shanghai</div></div><div class="p1-sub">Six photographers<br>six ways of seeing</div><div class="p1-wall"><div class="p1-col"><img data-lumen-image="1" data-lumen-cutout="half"><div class="p1-name">Hana Mori</div><div class="p1-role">Street Photography</div><div class="p1-line"></div><div class="p1-cap">A different<br>today</div></div><div class="p1-col"><img data-lumen-image="2" data-lumen-cutout="half"><div class="p1-name">Lee Jun</div><div class="p1-role">Documentary</div><div class="p1-line"></div><div class="p1-cap">Real people<br>real stories</div></div><div class="p1-col"><img data-lumen-image="3" data-lumen-cutout="half"><div class="p1-name">Mei Lin</div><div class="p1-role">Portrait</div><div class="p1-line"></div><div class="p1-cap">Faces contain<br>worlds</div></div><div class="p1-col"><img data-lumen-image="4" data-lumen-cutout="half"><div class="p1-name">Akira Kato</div><div class="p1-role">Architecture</div><div class="p1-line"></div><div class="p1-hot">Spaces<br>shape us</div></div><div class="p1-col"><img data-lumen-image="5" data-lumen-cutout="half"><div class="p1-name">Soo Min</div><div class="p1-role">Night &amp; City</div><div class="p1-line"></div><div class="p1-cap">Lights find<br>another truth</div></div><div class="p1-col"><img data-lumen-image="6" data-lumen-cutout="half"><div class="p1-name">Chen Yu</div><div class="p1-role">Everyday Life</div><div class="p1-line"></div><div class="p1-cap">The extraordinary<br>in the ordinary</div></div></div><div class="p1-foot p1-foot-l">A shared asia, a wider tomorrow</div><div class="p1-foot p1-foot-r">Photography connects us</div></div>`,
  },
  {
    id: "people/left-portrait-giant-name@v1",
    name: "左像右名巨字",
    group: "solo",
    brief: "左侧竖幅半身像配一道蓝色竖条，右侧巨字姓名领起身份、短介与强调色块，适合单人专访或个展介绍。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);color:var(--text);font-family:var(--font-sans);overflow:hidden"><style>.p2-bar{position:absolute;left:110px;top:120px;width:22px;height:840px;background:var(--accent)}.p2-img{position:absolute;left:164px;top:120px;width:520px;height:840px;background:var(--surface)}.p2-kick{position:absolute;left:800px;top:136px;font-size:16px;letter-spacing:.36em;text-transform:uppercase;color:var(--muted)}.p2-name{position:absolute;left:800px;top:196px;font-family:var(--font-display);font-weight:900;font-size:150px;line-height:.9;letter-spacing:-.04em;text-transform:uppercase}.p2-role{position:absolute;left:800px;top:376px;font-size:16px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}.p2-rule{position:absolute;left:800px;top:434px;width:240px;height:1px;background:var(--border)}.p2-bio{position:absolute;left:800px;top:478px;width:830px;font-size:24px;font-weight:300;line-height:1.66}.p2-box{position:absolute;left:800px;top:676px;width:500px;padding:24px 26px;background:var(--accent);color:var(--bg);font-size:19px;font-weight:700;letter-spacing:.26em;line-height:1.7;text-transform:uppercase}.p2-foot{position:absolute;left:800px;top:902px;font-size:15px;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)}.p2-sign{position:absolute;right:150px;top:886px;font-family:var(--font-script);font-size:36px;color:var(--muted)}</style><div class="p2-bar"></div><img class="p2-img" data-lumen-image="1" data-lumen-cutout="half"><div class="p2-kick">Portrait series / no.04</div><div class="p2-name">Hana Mori</div><div class="p2-role">Street photographer / Seoul</div><div class="p2-rule"></div><div class="p2-bio">She walks the same three blocks of Euljiro every morning, waiting for the light to fall between the fish stalls and the half-lifted shutter doors.</div><div class="p2-box">A different<br>today</div><div class="p2-foot">Seoul / 12 Dec 2026</div><div class="p2-sign">after image</div></div>`,
  },
  {
    id: "people/vertical-name-duo-talk@v1",
    name: "竖名双人对话",
    group: "multi",
    brief: "左侧是竖排栏目标识与提问大标题，右侧两人半身像并排，人名与身份竖排在各自人物左侧，适合双人对谈、访谈类页面。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);color:var(--text)"><style>.shadow{position:absolute;left:780px;top:-300px;width:700px;height:1600px;background:var(--surface);opacity:.55;transform:rotate(17deg)}.floor{position:absolute;left:0;bottom:0;width:1920px;height:150px;background:var(--surface);opacity:.9}.lock{position:absolute;left:120px;top:96px;width:620px}.tagbox{display:inline-block;border:3px solid var(--text);padding:11px 20px;font-size:22px;font-weight:700;letter-spacing:.2em;text-transform:uppercase}.brand{margin:18px 0 0;font-family:var(--font-display);font-size:80px;font-weight:900;line-height:1;letter-spacing:-.02em;text-transform:uppercase}.rule{margin-top:22px;width:470px;height:2px;background:var(--text)}.kicker{margin:18px 0 0;font-size:15px;font-weight:400;letter-spacing:.44em;text-transform:uppercase;color:var(--muted)}.head{position:absolute;left:120px;top:424px;width:540px;margin:0;font-family:var(--font-display);font-size:100px;font-weight:900;line-height:.96;letter-spacing:-.035em;text-transform:uppercase}.lead{position:absolute;left:120px;top:760px;width:420px;margin:0;font-size:16px;font-weight:300;line-height:1.75;color:var(--muted)}.script{position:absolute;left:120px;top:888px;margin:0;font-family:var(--font-script);font-size:30px;font-weight:400;color:var(--accent)}.meta{position:absolute;left:120px;top:978px;margin:0;font-size:12px;font-weight:400;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}.p1{position:absolute;left:800px;top:390px;width:450px;height:650px}.p2{position:absolute;left:1375px;top:390px;width:450px;height:650px}.p1 img,.p2 img{display:block;width:100%;height:100%}.n1{position:absolute;left:690px;top:436px;height:520px;writing-mode:vertical-rl}.n2{position:absolute;left:1265px;top:436px;height:520px;writing-mode:vertical-rl}.nm{margin:0;font-size:30px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}.rl{margin:0 22px 0 0;font-size:15px;font-weight:300;letter-spacing:.2em;color:var(--muted)}</style><div class="shadow"></div><div class="floor"></div><div class="lock"><div class="tagbox">Public</div><p class="brand">Dialogue</p><div class="rule"></div><p class="kicker">Listen to the real questions</p></div><p class="head">Where does the money go?</p><p class="lead">Two practitioners sit down to argue about online fundraising — what it fixed, what it broke, and who still gets left outside the room.</p><p class="script">two voices, one question</p><p class="meta">Seoul / 2026 — Episode 07</p><div class="n1"><p class="nm">Hana Mori</p><p class="rl">Chair, Open Giving Fund</p></div><div class="p1"><img data-lumen-image="1" data-lumen-cutout="half"></div><div class="n2"><p class="nm">Akira Kato</p><p class="rl">Founder and CEO, Wellspring</p></div><div class="p2"><img data-lumen-image="2" data-lumen-cutout="half"></div></div>`,
  },
  {
    id: "people/left-text-guest-card@v1",
    name: "左文右像嘉宾卡",
    group: "solo",
    brief: "左侧竖排文字区块配右侧倾斜的嘉宾卡，卡内人像加竖排名牌，适合单人专访或嘉宾介绍页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden;">
<style>
.g1-kick{position:absolute;left:140px;top:170px;font-size:18px;font-weight:400;letter-spacing:.42em;text-transform:uppercase;color:var(--muted)}
.g1-title{position:absolute;left:134px;top:222px;width:700px;font-family:var(--font-display);font-size:118px;font-weight:900;line-height:.94;letter-spacing:-.035em;text-transform:uppercase;color:var(--text)}
.g1-rule{position:absolute;left:140px;top:466px;width:132px;height:3px;background:var(--accent)}
.g1-name{position:absolute;left:140px;top:512px;font-size:30px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--text)}
.g1-role{position:absolute;left:140px;top:560px;font-size:19px;font-weight:300;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.g1-bio{position:absolute;left:140px;top:624px;width:520px;font-size:22px;font-weight:300;line-height:1.7;color:var(--muted)}
.g1-meta{position:absolute;left:140px;bottom:104px;font-size:17px;font-weight:400;letter-spacing:.32em;text-transform:uppercase;color:var(--muted)}
.g1-plate{position:absolute;right:150px;top:170px;width:600px;height:790px;background:var(--accent);opacity:.14;transform:rotate(-6deg)}
.g1-card{position:absolute;right:200px;top:130px;width:620px;height:840px;background:var(--surface);border:1px solid var(--border);transform:rotate(-4deg)}
.g1-card img{position:absolute;left:52px;bottom:0;width:516px;height:700px}
.g1-vname{position:absolute;right:56px;top:78px;writing-mode:vertical-rl;font-family:var(--font-display);font-size:66px;font-weight:900;letter-spacing:.05em;color:var(--text)}
.g1-vrole{position:absolute;right:134px;top:78px;writing-mode:vertical-rl;font-size:17px;font-weight:300;letter-spacing:.36em;text-transform:uppercase;color:var(--muted)}
</style>
<div class="g1-plate"></div>
<div class="g1-card"><img data-lumen-image="1" data-lumen-cutout="half"><div class="g1-vname">HANA MORI</div><div class="g1-vrole">Documentary Photographer</div></div>
<div class="g1-kick">Portrait Series / 2026</div>
<div class="g1-title">The Long Read</div>
<div class="g1-rule"></div>
<div class="g1-name">HANA MORI</div>
<div class="g1-role">Documentary Photographer</div>
<div class="g1-bio">She spent nine winters photographing fishing towns along the northern coast, one roll of film at a time.</div>
<div class="g1-meta">SEOUL / 12 DEC 2026</div>
</div>`,
  },
  {
    id: "people/scattered-team-cards@v1",
    name: "多人错落团队卡",
    group: "multi",
    brief: "顶部居中大标题，下方两排错落旋转的嘉宾小卡，每卡一人一头肩像，适合多人群像阵容页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden;">
<style>
.g2-kick{position:absolute;left:0;top:96px;width:1920px;text-align:center;font-size:17px;font-weight:400;letter-spacing:.44em;text-transform:uppercase;color:var(--muted)}
.g2-title{position:absolute;left:0;top:128px;width:1920px;text-align:center;font-family:var(--font-display);font-size:104px;font-weight:900;letter-spacing:-.02em;text-transform:uppercase;color:var(--text)}
.g2-card{position:absolute;width:262px;height:346px;background:var(--surface);border:1px solid var(--border);padding:20px}
.g2-card img{display:block;width:222px;height:206px}
.g2-name{margin-top:16px;font-size:21px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text)}
.g2-role{margin-top:8px;font-size:14px;font-weight:300;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
</style>
<div class="g2-kick">Reading Series / Vol.04</div>
<div class="g2-title">Who Reads With Us</div>
<div class="g2-card" style="left:180px;top:246px;transform:rotate(-5deg);"><img data-lumen-image="1" data-lumen-cutout="head"><div class="g2-name">MEI LIN</div><div class="g2-role">Documentary Photographer</div></div>
<div class="g2-card" style="left:540px;top:210px;transform:rotate(3deg);"><img data-lumen-image="2" data-lumen-cutout="head"><div class="g2-name">AKIRA KATO</div><div class="g2-role">Sound Editor</div></div>
<div class="g2-card" style="left:900px;top:250px;transform:rotate(-3deg);"><img data-lumen-image="3" data-lumen-cutout="head"><div class="g2-name">LEE JUN</div><div class="g2-role">Architect</div></div>
<div class="g2-card" style="left:1260px;top:208px;transform:rotate(4deg);"><img data-lumen-image="4" data-lumen-cutout="head"><div class="g2-name">SOFIA REYES</div><div class="g2-role">Marine Biologist</div></div>
<div class="g2-card" style="left:260px;top:634px;transform:rotate(4deg);"><img data-lumen-image="5" data-lumen-cutout="head"><div class="g2-name">TOM HALLORAN</div><div class="g2-role">Bike Courier</div></div>
<div class="g2-card" style="left:630px;top:668px;transform:rotate(-2deg);"><img data-lumen-image="6" data-lumen-cutout="head"><div class="g2-name">NINA PETROVA</div><div class="g2-role">Cellist</div></div>
<div class="g2-card" style="left:990px;top:628px;transform:rotate(5deg);"><img data-lumen-image="7" data-lumen-cutout="head"><div class="g2-name">RAVI MENON</div><div class="g2-role">Night-shift Nurse</div></div>
<div class="g2-card" style="left:1350px;top:672px;transform:rotate(-4deg);"><img data-lumen-image="8" data-lumen-cutout="head"><div class="g2-name">CLARA OYELARAN</div><div class="g2-role">Book Conservator</div></div>
</div>`,
  },
  {
    id: "people/calligraphic-cover@v1",
    name: "书法巨题封面",
    group: "solo",
    brief: "左侧两行超大书法感标题压住画面，右侧整条色块托起半身人像，适合封面或开篇页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden;">
<style>
.g3-block{position:absolute;right:0;top:0;width:660px;height:1080px;background:var(--brand);opacity:.12}
.g3-img{position:absolute;right:80px;bottom:0;width:540px;height:920px}
.g3-kick{position:absolute;left:126px;top:104px;font-size:17px;font-weight:400;letter-spacing:.46em;text-transform:uppercase;color:var(--muted)}
.g3-line1{position:absolute;left:120px;top:186px;font-family:var(--font-display);font-size:212px;font-weight:900;line-height:.86;letter-spacing:-.045em;text-transform:uppercase;color:var(--text)}
.g3-line2{position:absolute;left:120px;top:392px;font-family:var(--font-display);font-size:212px;font-weight:900;line-height:.86;letter-spacing:-.045em;text-transform:uppercase;color:var(--text);opacity:.55}
.g3-sub{position:absolute;left:126px;top:652px;font-size:24px;font-weight:300;letter-spacing:.34em;text-transform:uppercase;color:var(--accent)}
.g3-note{position:absolute;left:126px;top:710px;width:560px;font-size:21px;font-weight:300;line-height:1.7;color:var(--muted)}
.g3-sign{position:absolute;left:126px;bottom:106px;font-family:var(--font-script);font-size:46px;color:var(--text);opacity:.85}
</style>
<div class="g3-block"></div>
<img class="g3-img" data-lumen-image="1" data-lumen-cutout="half">
<div class="g3-kick">Library Edition / Vol.07</div>
<div class="g3-line1">Read</div>
<div class="g3-line2">With Us</div>
<div class="g3-sub">Slow pages, long evenings</div>
<div class="g3-note">Six readers, one table, and a rule that nobody leaves before the last paragraph is finished.</div>
<div class="g3-sign">Hana Mori</div>
</div>`,
  },
  {
    id: "people/left-copy-dual-stack-portraits@v1",
    name: "左文右双像竖叠",
    group: "multi",
    brief: "左侧一整栏手写感大标题、对谈人名与日期，右侧上下两块半身像错位叠放，适合双人对谈或访谈海报。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.p1-kicker{position:absolute;left:120px;top:92px;font-size:15px;font-weight:400;letter-spacing:.42em;text-transform:uppercase;color:var(--muted)}
.p1-title{position:absolute;left:112px;top:146px;width:920px;font-family:var(--font-display);font-size:150px;font-weight:900;line-height:.9;letter-spacing:-.035em;text-transform:uppercase;color:var(--text)}
.p1-sub{position:absolute;left:120px;top:466px;width:700px;font-size:27px;font-weight:300;line-height:1.55;letter-spacing:.01em;color:var(--muted)}
.p1-names{position:absolute;left:120px;top:632px;font-size:36px;font-weight:400;line-height:1.6;letter-spacing:.2em;text-transform:uppercase;color:var(--text)}
.p1-names span{display:block}
.p1-times{margin:6px 0 6px 2px;font-size:30px;font-weight:300;color:var(--muted)}
.p1-rule{position:absolute;left:120px;top:846px;width:240px;height:1px;background:var(--border)}
.p1-date{position:absolute;left:114px;top:876px;font-family:var(--font-display);font-size:104px;font-weight:900;line-height:1;letter-spacing:-.03em;color:var(--accent)}
.p1-datemeta{position:absolute;left:432px;top:952px;font-size:14px;font-weight:400;letter-spacing:.4em;text-transform:uppercase;color:var(--muted)}
.p1-note{position:absolute;left:1188px;top:34px;width:420px;font-family:var(--font-script);font-size:32px;font-weight:400;line-height:1.3;color:var(--accent);opacity:.85}
.p1-shot-a{position:absolute;left:1064px;top:112px;width:756px;height:398px;overflow:hidden;background:var(--surface)}
.p1-shot-b{position:absolute;left:956px;top:548px;width:864px;height:452px;overflow:hidden;background:var(--surface)}
.p1-shot-a img,.p1-shot-b img{width:100%;height:100%;display:block}
</style>
<p class="p1-kicker">TALK SERIES / EPISODE 07</p>
<p class="p1-title">SCRAPING<br>THE BARNACLES</p>
<p class="p1-sub">Two generations sit down on one afternoon to argue about staying put, and about leaving before the tide turns.</p>
<div class="p1-names"><span>SEHO YU</span><span class="p1-times">X</span><span>TOM LIU</span></div>
<div class="p1-rule"></div>
<p class="p1-date">07 / 10</p>
<p class="p1-datemeta">PREMIERE / SEOUL 2027</p>
<p class="p1-note">This world has everything to do with you</p>
<div class="p1-shot-a"><img data-lumen-image="1" data-lumen-cutout="half" alt=""></div>
<div class="p1-shot-b"><img data-lumen-image="2" data-lumen-cutout="half" alt=""></div>
</div>`,
  },
  {
    id: "people/staggered-six-lineup@v1",
    name: "标题压顶六人错落",
    group: "multi",
    brief: "手写体巨字标题压在左上方，六位半身像横向一字排开并上下错落，人名身份压在头顶，适合多人阵容或创始团队页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden">
<style>
.kick{position:absolute;left:120px;top:66px;font-size:18px;font-weight:400;letter-spacing:.44em;text-transform:uppercase;color:var(--muted)}
.title{position:absolute;left:110px;top:82px;font-family:var(--font-script);font-size:132px;line-height:.9;color:var(--text);letter-spacing:-.01em}
.sub{position:absolute;left:120px;top:340px;font-size:21px;font-weight:400;letter-spacing:.5em;text-transform:uppercase;color:var(--muted)}
.intro{position:absolute;right:96px;top:104px;width:600px;text-align:right;font-size:21px;font-weight:300;line-height:1.7;color:var(--muted)}
.stamp{position:absolute;right:96px;top:290px;font-size:16px;font-weight:600;letter-spacing:.34em;text-transform:uppercase;color:var(--accent)}
.it{position:absolute;width:272px;height:580px;display:flex;flex-direction:column}
.band{position:absolute;left:-24px;right:-24px;bottom:0;height:132px;background:var(--surface);opacity:.55}
.nm{font-size:29px;font-weight:700;line-height:1.1;letter-spacing:-.01em;color:var(--text);margin:0}
.rl{font-size:15px;font-weight:400;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);margin:8px 0 16px}
.it img{flex:1 1 0;min-height:0;width:100%}
.i1{left:96px;top:400px}
.i2{left:387px;top:466px}
.i3{left:678px;top:400px}
.i4{left:969px;top:466px}
.i5{left:1260px;top:400px}
.i6{left:1551px;top:466px}
</style>
<p class="kick">JIANBEN ARCHIVE / SEOUL</p>
<p class="title">Paper<br>Years</p>
<p class="sub">Book Launch / 12 Dec 2026</p>
<p class="intro">Six founders, one afternoon, one book between them. The first run is three hundred copies, stitched by hand in a Seoul workshop.</p>
<p class="stamp">First Run / 300</p>
<div class="it i1"><div class="band"></div><p class="nm">LIANG WENDAO</p><p class="rl">Founder, Jianben</p><img data-lumen-image="1" data-lumen-cutout="half"></div>
<div class="it i2"><div class="band"></div><p class="nm">ZHANG YI</p><p class="rl">Partner, Jianben</p><img data-lumen-image="2" data-lumen-cutout="half"></div>
<div class="it i3"><div class="band"></div><p class="nm">LI JIHONG</p><p class="rl">Founder, Jianben</p><img data-lumen-image="3" data-lumen-cutout="half"></div>
<div class="it i4"><div class="band"></div><p class="nm">WU XIAOBO</p><p class="rl">Editor in Chief</p><img data-lumen-image="4" data-lumen-cutout="half"></div>
<div class="it i5"><div class="band"></div><p class="nm">LIN SHAO</p><p class="rl">Founder, Jianben</p><img data-lumen-image="5" data-lumen-cutout="half"></div>
<div class="it i6"><div class="band"></div><p class="nm">WAN JIE</p><p class="rl">Print Director</p><img data-lumen-image="6" data-lumen-cutout="half"></div>
</div>`,
  },
  {
    id: "people/duo-vertical-name-strips@v1",
    name: "巨题双人竖名条",
    group: "multi",
    brief: "巨字标题压顶配手写脚注，两位半身像并排居中，左右各一条竖排姓名条，右上角带边框时间条，适合双人直播或对谈海报。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)"><style>.sheet{position:absolute;left:70px;top:60px;width:1780px;height:960px;border:1px solid var(--border);border-radius:30px;opacity:.5}.kicker{position:absolute;left:126px;top:108px;margin:0;font-size:20px;font-weight:400;letter-spacing:.44em;text-transform:uppercase;color:var(--muted)}.title{position:absolute;left:120px;margin:0;font-size:136px;line-height:.95;font-weight:900;letter-spacing:-.035em;text-transform:uppercase;color:var(--text);font-family:var(--font-display)}.t1{top:146px}.t2{top:286px}.script{position:absolute;left:1000px;top:170px;margin:0;font-size:124px;line-height:1;font-family:var(--font-script);color:var(--accent);transform:rotate(-4deg)}.bar{position:absolute;right:126px;top:358px;margin:0;height:66px;display:flex;align-items:center;padding:0 30px;border:1px solid var(--border);font-size:20px;font-weight:400;letter-spacing:.26em;text-transform:uppercase;color:var(--text)}.note{position:absolute;right:110px;top:470px;margin:0;width:250px;font-size:18px;font-weight:300;line-height:1.7;letter-spacing:.02em;color:var(--muted)}.ph{position:absolute;bottom:0;width:430px;height:630px}.p1{left:530px}.p2{left:960px}.tag{position:absolute;top:430px;width:96px;height:420px;padding:26px 0;display:flex;gap:16px;justify-content:center;background:var(--surface);border-radius:8px}.tag p{margin:0;writing-mode:vertical-rl;letter-spacing:.16em}.taga{left:410px;flex-direction:row-reverse}.tagb{left:1414px}.tag-name{font-size:32px;font-weight:700;color:var(--text)}.tag-role{font-size:19px;font-weight:300;letter-spacing:.24em;text-transform:uppercase;color:var(--muted)}.foot{position:absolute;left:126px;bottom:60px;margin:0;font-size:18px;font-weight:300;letter-spacing:.4em;text-transform:uppercase;color:var(--muted)}</style><div class="sheet"></div><p class="kicker">Portrait Series / 2026</p><p class="title t1">All Dreams</p><p class="title t2">Run On Brain</p><p class="script">dream</p><p class="bar">Live 13 Jun 19:00 – 21:30</p><p class="note">Two voices on memory and machines, recorded live in a Seoul studio with an audience of forty.</p><div class="tag taga"><p class="tag-name">Hana Mori</p><p class="tag-role">Chief Curator</p></div><div class="tag tagb"><p class="tag-name">Lee Jun</p><p class="tag-role">Radio Host</p></div><img class="ph p1" data-lumen-image="1" data-lumen-cutout="half"><img class="ph p2" data-lumen-image="2" data-lumen-cutout="half"><p class="foot">Seoul / Live Studio Session</p></div>`,
  },
  {
    id: "people/left-headline-scatter-crew@v1",
    name: "左巨题右散射群像",
    group: "multi",
    brief: "左侧大标题配说明，右侧八人像错落成网格，适合新员工或团队群像页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.t1-kick{position:absolute;left:112px;top:118px;font-size:19px;font-weight:400;letter-spacing:.46em;text-transform:uppercase;color:var(--accent)}
.t1-h1{position:absolute;left:106px;top:170px;font-family:var(--font-display);font-size:104px;line-height:.92;font-weight:900;letter-spacing:-.035em;text-transform:uppercase;color:var(--text)}
.t1-h2{position:absolute;left:106px;top:286px;font-family:var(--font-display);font-size:104px;line-height:.92;font-weight:900;letter-spacing:-.035em;text-transform:uppercase;color:var(--bg);-webkit-text-stroke:2px var(--text)}
.t1-rule{position:absolute;left:112px;top:432px;width:220px;height:5px;background:var(--accent)}
.t1-sub{position:absolute;left:112px;top:466px;width:520px;margin:0;font-size:20px;line-height:1.7;font-weight:300;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.t1-line{position:absolute;left:112px;top:606px;width:520px;height:1px;background:var(--border)}
.t1-note{position:absolute;left:112px;top:636px;font-size:16px;font-weight:400;letter-spacing:.26em;text-transform:uppercase;color:var(--muted)}
.t1-num{position:absolute;left:106px;top:742px;font-family:var(--font-display);font-size:200px;line-height:.9;font-weight:900;letter-spacing:-.04em;color:var(--bg);-webkit-text-stroke:2px var(--border)}
.t1-div{position:absolute;left:730px;top:100px;width:1px;height:880px;background:var(--border)}
.t1-fig{position:absolute;width:255px}
.t1-fig img{width:255px;height:288px;display:block}
.t1-nm{margin:12px 0 0;font-size:22px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text)}
.t1-rl{margin:6px 0 0;font-size:14px;font-weight:300;letter-spacing:.24em;text-transform:uppercase;color:var(--muted)}
</style>
<span class="t1-kick">New Crew Program / Seoul 2026</span>
<span class="t1-h1">New Crew</span>
<span class="t1-h2">New Wave</span>
<div class="t1-rule"></div>
<p class="t1-sub">Eight people, eight first weeks, portraits taken in the lobby on a Tuesday afternoon.</p>
<div class="t1-line"></div>
<span class="t1-note">Portraits 01 — 08 / Shot On Location</span>
<span class="t1-num">08</span>
<div class="t1-div"></div>
<div class="t1-fig" style="left:800px;top:100px"><img data-lumen-image="1" data-lumen-cutout="half" alt=""><p class="t1-nm">Marcus Lin</p><p class="t1-rl">Strategy Lead</p></div>
<div class="t1-fig" style="left:1075px;top:45px"><img data-lumen-image="2" data-lumen-cutout="head" alt=""><p class="t1-nm">Nora Kim</p><p class="t1-rl">Senior Legal Manager</p></div>
<div class="t1-fig" style="left:1350px;top:125px"><img data-lumen-image="3" data-lumen-cutout="half" alt=""><p class="t1-nm">Elliot Chen</p><p class="t1-rl">Data Analytics Lead</p></div>
<div class="t1-fig" style="left:1625px;top:70px"><img data-lumen-image="4" data-lumen-cutout="half" alt=""><p class="t1-nm">Sofia Yu</p><p class="t1-rl">Channel Manager</p></div>
<div class="t1-fig" style="left:800px;top:520px"><img data-lumen-image="5" data-lumen-cutout="half" alt=""><p class="t1-nm">Daniel Park</p><p class="t1-rl">Sales Manager</p></div>
<div class="t1-fig" style="left:1075px;top:585px"><img data-lumen-image="6" data-lumen-cutout="half" alt=""><p class="t1-nm">Iris Zhang</p><p class="t1-rl">Brand Marketing Lead</p></div>
<div class="t1-fig" style="left:1350px;top:505px"><img data-lumen-image="7" data-lumen-cutout="head" alt=""><p class="t1-nm">Akira Kato</p><p class="t1-rl">Hr Operations Lead</p></div>
<div class="t1-fig" style="left:1625px;top:570px"><img data-lumen-image="8" data-lumen-cutout="half" alt=""><p class="t1-nm">Lena Zhao</p><p class="t1-rl">Client Partner</p></div>
</div>`,
  },
  {
    id: "people/portrait-left-double-outline-title@v1",
    name: "左像右双行巨题",
    group: "solo",
    brief: "左侧一张半身人像，右侧两行巨型标题与简介，适合单人访谈或人物特写封面。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.t2-fig{position:absolute;left:110px;top:118px;width:640px;height:844px}
.t2-fig img{width:640px;height:844px;display:block}
.t2-kick{position:absolute;left:884px;top:150px;font-size:19px;font-weight:400;letter-spacing:.46em;text-transform:uppercase;color:var(--accent)}
.t2-h1{position:absolute;left:878px;top:214px;font-family:var(--font-display);font-size:196px;line-height:.9;font-weight:900;letter-spacing:-.04em;text-transform:uppercase;color:var(--text)}
.t2-h2{position:absolute;left:878px;top:392px;font-family:var(--font-display);font-size:196px;line-height:.9;font-weight:900;letter-spacing:-.04em;text-transform:uppercase;color:var(--bg);-webkit-text-stroke:3px var(--text)}
.t2-rule{position:absolute;left:884px;top:604px;width:260px;height:5px;background:var(--accent)}
.t2-nm{position:absolute;left:880px;top:646px;font-size:44px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text)}
.t2-rl{position:absolute;left:884px;top:714px;font-size:17px;font-weight:300;letter-spacing:.34em;text-transform:uppercase;color:var(--accent)}
.t2-bio{position:absolute;left:884px;top:772px;width:640px;margin:0;font-size:22px;line-height:1.65;font-weight:300;color:var(--muted)}
.t2-qt{position:absolute;left:884px;top:930px;font-family:var(--font-script);font-size:34px;color:var(--text);opacity:.8}
.t2-yr{position:absolute;left:1650px;top:946px;font-size:16px;font-weight:400;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)}
</style>
<div class="t2-fig"><img data-lumen-image="1" data-lumen-cutout="half" alt=""></div>
<span class="t2-kick">Portrait Series / No. 07</span>
<span class="t2-h1">Look</span>
<span class="t2-h2">Easy</span>
<div class="t2-rule"></div>
<span class="t2-nm">Hana Mori</span>
<span class="t2-rl">Documentary Photographer</span>
<p class="t2-bio">She spent nine winters photographing fishing towns on the east coast before moving to Seoul to run the studio desk.</p>
<span class="t2-qt">still looking, always</span>
<span class="t2-yr">Seoul / 2026</span>
</div>`,
  },
  {
    id: "people/giant-type-overlap-portrait@v1",
    name: "巨字压像左右分栏",
    group: "solo",
    brief: "超大展示字体占左侧半幅，人物抠像从右侧叠压其上，左下角集中的日期与场次信息，适合演出海报或人物主视觉封面。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)"><style>.kicker{position:absolute;left:120px;top:92px;font-size:18px;font-weight:400;letter-spacing:.44em;text-transform:uppercase;color:var(--muted)}.giant{position:absolute;left:100px;top:232px;font-family:var(--font-display);font-weight:900;font-size:212px;line-height:.86;letter-spacing:-.035em;text-transform:uppercase;color:var(--accent)}.giant span{display:block}.person{position:absolute;left:900px;top:0;width:880px;height:1080px;z-index:2}.date{position:absolute;left:120px;top:700px;font-family:var(--font-display);font-weight:900;font-size:104px;line-height:.9;letter-spacing:-.02em;color:var(--accent)}.headline{position:absolute;left:124px;top:826px;font-size:36px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:var(--text)}.subline{position:absolute;left:124px;top:876px;font-size:26px;font-weight:300;letter-spacing:.24em;text-transform:uppercase;color:var(--muted)}.venue{position:absolute;left:124px;top:920px;font-size:24px;font-weight:400;letter-spacing:.04em;color:var(--muted)}.credit{position:absolute;left:120px;bottom:52px;font-family:var(--font-script);font-size:28px;font-weight:400;color:var(--muted)}</style><p class="kicker">SOLO STAGE / ASIA TOUR 2026</p><div class="giant"><span>HANA</span><span>MORI</span></div><img data-lumen-image="1" data-lumen-cutout="half" class="person"><p class="date">05 / 02</p><p class="headline">BORDERLESS &middot; GUANGZHOU</p><p class="subline">World Tour 2026</p><p class="venue">CH8 Livehouse, Haizhu District</p><p class="credit">by Hana Mori Studio</p></div>`,
  },
  {
    id: "people/left-title-trio-collage@v1",
    name: "左标题三人像拼贴",
    group: "multi",
    brief: "左侧竖排小标签配巨型标题与三人名册，右侧三张半身像错落叠放，适合多位嘉宾的群像海报。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);color:var(--text)"><style>.blob{position:absolute;left:1080px;top:30px;width:720px;height:720px;border-radius:50%;background:var(--surface);opacity:.85}.blob2{position:absolute;left:620px;top:600px;width:430px;height:430px;border-radius:50%;background:var(--surface);opacity:.6}.ring-a{position:absolute;left:1560px;top:92px;width:240px;height:240px;border:9px solid var(--accent);border-radius:50%;border-right-color:transparent;border-bottom-color:transparent;transform:rotate(28deg);opacity:.95}.ring-b{position:absolute;left:700px;top:664px;width:180px;height:180px;border:8px solid var(--accent);border-radius:50%;border-top-color:transparent;border-left-color:transparent;transform:rotate(-18deg);opacity:.9}.dash{position:absolute;left:1462px;top:396px;width:120px;height:14px;border-radius:7px;background:var(--accent);opacity:.9;transform:rotate(-24deg)}.kick{position:absolute;left:74px;top:130px;writing-mode:vertical-rl;text-transform:uppercase;font-size:14px;font-weight:400;letter-spacing:.5em;color:var(--muted)}.vline{position:absolute;left:132px;top:130px;width:1px;height:260px;background:var(--border)}.title{position:absolute;left:176px;top:88px;font-family:var(--font-display);font-size:152px;line-height:.9;letter-spacing:-.035em;font-weight:900;text-transform:uppercase}.sub{position:absolute;left:180px;top:392px;font-size:15px;font-weight:400;letter-spacing:.36em;text-transform:uppercase;color:var(--muted)}.hr{position:absolute;left:180px;top:436px;width:330px;height:1px;background:var(--border)}.n1,.n2,.n3{position:absolute;left:180px;width:420px}.n1{top:474px}.n2{top:672px}.n3{top:870px}.pname{font-size:38px;font-weight:800;letter-spacing:-.01em;line-height:1.05}.pen{font-size:19px;letter-spacing:.14em;color:var(--muted);margin-top:6px;text-transform:uppercase}.ptick{width:26px;height:2px;background:var(--accent);margin:14px 0 12px}.pbio{font-size:15px;font-weight:300;line-height:1.65;color:var(--muted);max-width:400px}.pimg{position:absolute}.i1{left:1000px;top:24px;width:390px;height:450px;z-index:1}.i2{left:1356px;top:206px;width:424px;height:500px;z-index:2}.i3{left:826px;top:428px;width:484px;height:610px;z-index:3}.date{position:absolute;left:1520px;top:832px;width:320px;text-align:right}.dnum{font-family:var(--font-display);font-size:76px;font-weight:800;letter-spacing:-.02em;line-height:1}.dtime{font-size:16px;letter-spacing:.22em;color:var(--muted);margin-top:10px;text-transform:uppercase}.dloc{font-size:13px;letter-spacing:.3em;color:var(--muted);margin-top:6px;text-transform:uppercase}</style><div class="blob"></div><div class="blob2"></div><div class="ring-a"></div><div class="ring-b"></div><div class="dash"></div><div class="kick">DESIGN AND REMADE / CHONGQING</div><div class="vline"></div><div class="title">REMAKE<br>AGAIN</div><div class="sub">SUNAC CHONGQING / DESIGN SERIES 2026</div><div class="hr"></div><div class="n1"><div class="pname">HANA MORI</div><div class="pen">Vocalist</div><div class="ptick"></div><div class="pbio">Cross-border sound artist and founder of the Seeing Objects studio. UNICEF China goodwill ambassador since 2019, recording in the mountains outside Chengdu.</div></div><div class="n2"><div class="pname">MICHAEL YOUNG</div><div class="pen">Industrial Designer</div><div class="ptick"></div><div class="pbio">British designer and curator at the Pushkin Art Centre. Three-time Red Dot Award winner, splitting his year between London and Chongqing.</div></div><div class="n3"><div class="pname">FANG YANG</div><div class="pen">Fashion Designer</div><div class="ptick"></div><div class="pbio">Founder of the label BY FANG. Named by Newsweek as one of the designers reshaping Chinese fashion today.</div></div><img class="pimg i1" data-lumen-image="1" data-lumen-cutout="half"><img class="pimg i2" data-lumen-image="2" data-lumen-cutout="half"><img class="pimg i3" data-lumen-image="3" data-lumen-cutout="half"><div class="date"><div class="dnum">11.17</div><div class="dtime">PM 18:30 — PM 20:00</div><div class="dloc">CHONGQING / BAIXIANG STREET</div></div></div>`,
  },
  {
    id: "people/portrait-cluster-roster@v1",
    name: "左像群右名录",
    group: "multi",
    brief: "左侧五个人像叠成一群、背后压着巨大的幽灵字母，右侧是右对齐的姓名名录，适合设计沙龙或评审团嘉宾页。",
    skeleton: `<style>
.page{width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden;font-family:var(--font-sans)}
.ghost{position:absolute;font-family:var(--font-display);font-weight:900;color:var(--accent);opacity:.18;letter-spacing:-.04em;line-height:.78;text-transform:uppercase;white-space:nowrap}
.ghost-hi{left:-20px;top:-70px;font-size:400px}
.ghost-ds{left:0;top:690px;font-size:260px}
.port{position:absolute}
.p1{left:300px;top:10px;width:300px;height:370px;z-index:2}
.p2{left:56px;top:248px;width:310px;height:372px;z-index:1}
.p3{left:470px;top:168px;width:300px;height:380px;z-index:3}
.p4{left:140px;top:452px;width:340px;height:420px;z-index:5}
.p5{left:462px;top:466px;width:330px;height:422px;z-index:4}
.col{position:absolute;left:1130px;width:730px;text-align:right}
.kicker{top:64px;font-size:15px;font-weight:500;letter-spacing:.42em;color:var(--muted);text-transform:uppercase}
.title{top:92px;font-family:var(--font-display);font-size:112px;font-weight:900;line-height:.94;letter-spacing:-.03em;color:var(--accent);text-transform:uppercase}
.sub1{top:228px;font-size:34px;font-weight:700;letter-spacing:.07em;color:var(--text);text-transform:uppercase;line-height:1.2}
.sub2{top:284px;font-size:15px;font-weight:300;letter-spacing:.18em;color:var(--muted);text-transform:uppercase}
.row{position:absolute;left:1130px;width:730px;text-align:right;border-top:1px solid var(--border);padding-top:16px}
.r1{top:350px}
.r2{top:476px}
.r3{top:602px}
.r4{top:728px}
.r5{top:854px}
.dot{display:inline-block;width:9px;height:9px;background:var(--accent);transform:rotate(45deg);margin-right:14px;vertical-align:2px}
.name{font-size:28px;font-weight:800;letter-spacing:.05em;color:var(--text);text-transform:uppercase;line-height:1.1;margin:0}
.role{font-size:12px;font-weight:500;letter-spacing:.26em;color:var(--muted);text-transform:uppercase;margin:8px 0 0}
.desc{font-size:13px;font-weight:300;line-height:1.7;color:var(--muted);margin:6px 0 0}
.mark{top:1002px;font-size:24px;font-weight:900;letter-spacing:.36em;color:var(--text);text-transform:uppercase}
</style>
<div class="page">
<div class="ghost ghost-hi">HI</div>
<div class="ghost ghost-ds">DESIGN</div>
<img class="port p1" data-lumen-image="1" data-lumen-cutout="half">
<img class="port p2" data-lumen-image="2" data-lumen-cutout="half">
<img class="port p3" data-lumen-image="3" data-lumen-cutout="half">
<img class="port p4" data-lumen-image="4" data-lumen-cutout="half">
<img class="port p5" data-lumen-image="5" data-lumen-cutout="half">
<div class="col kicker">NORDLYS DESIGN SERIES / 07</div>
<div class="col title">ENCOUNTER</div>
<div class="col sub1">Design Directors Salon</div>
<div class="col sub2">Hi-Design 7th Portfolio Review / Hangzhou 2026</div>
<div class="row r1">
<p class="name"><span class="dot"></span>LEE JUN</p>
<p class="role">Founder / Kumo Atelier</p>
<p class="desc">Turns riverside warehouses into public galleries. Fourteen years between Seoul and Hangzhou, most of it spent on scaffolding with a tape measure.</p>
</div>
<div class="row r2">
<p class="name"><span class="dot"></span>AKIRA KATO</p>
<p class="role">Executive Director / Asia Design Council</p>
<p class="desc">Runs the spring design brand summit and edits its annual catalogue. Also teaches interior criticism at two graduate schools in Shanghai.</p>
</div>
<div class="row r3">
<p class="name"><span class="dot"></span>SOKO YAMADA</p>
<p class="role">Chief Designer / Grandview Interiors</p>
<p class="desc">Works almost entirely in timber. Lectures on traditional joinery at Jiangsu University every autumn, and keeps a workshop open to students.</p>
</div>
<div class="row r4">
<p class="name"><span class="dot"></span>HANA MORI</p>
<p class="role">Senior Planner / Wuxi Design Society</p>
<p class="desc">Plans cultural buildings and small museums. Industry professor, and a stubborn advocate for keeping old civic halls standing.</p>
</div>
<div class="row r5">
<p class="name"><span class="dot"></span>TAN WEI</p>
<p class="role">Creative Director / Interior China</p>
<p class="desc">Leads the Qingdao studio since 2019. Collects 1970s floor plans of seaside hotels and publishes them as a yearly zine.</p>
</div>
<div class="col mark">NORDLYS</div>
</div>`,
  },
  {
    id: "people/arch-column-lineup@v1",
    name: "左题右拱形人像列",
    group: "multi",
    brief: "左侧巨字衬线标题加日期与引文，右侧四条高低错落的拱形人像胶囊，每列带日期、姓名、身份与一句短注，适合四位讲者或团队阵容页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden">
<style>
.kicker{position:absolute;left:88px;top:92px;font-size:20px;font-weight:600;letter-spacing:.42em;text-transform:uppercase;color:var(--accent)}
.title{position:absolute;left:84px;top:146px;font-family:var(--font-display);font-size:118px;line-height:.92;letter-spacing:-.03em;font-weight:800;color:var(--accent)}
.dateline{position:absolute;left:88px;top:530px;font-size:32px;font-weight:900;letter-spacing:.04em;color:var(--text)}
.rule{position:absolute;left:88px;top:606px;width:400px;height:1px;background:var(--border)}
.quote{position:absolute;left:88px;top:648px;width:392px;margin:0;font-family:var(--font-script);font-size:30px;line-height:1.45;color:var(--muted)}
.ref{position:absolute;left:88px;top:830px;margin:0;font-size:16px;font-weight:600;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.col{position:absolute;width:296px;border:1px solid var(--border);border-radius:150px 150px 26px 26px;overflow:hidden;background:var(--surface)}
.col p{margin:0}
.copy{position:relative;z-index:2;padding:34px 26px 0}
.date{font-size:18px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:var(--muted)}
.name{font-family:var(--font-display);font-size:34px;font-weight:800;line-height:1.05;color:var(--text);margin-top:12px}
.role{font-size:14px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;color:var(--accent);margin-top:12px}
.note{font-size:15px;font-weight:300;line-height:1.6;color:var(--muted);margin-top:18px}
.col img{position:absolute;left:0;bottom:0;width:100%;height:60%}
</style>
<p class="kicker">Blessing Week / 2026</p>
<div class="title">Happy<br>Blessing<br>Day</div>
<p class="dateline">5.14, 21, 28 / 6.01</p>
<div class="rule"></div>
<p class="quote">Yet I tell you that not even Solomon in all his splendor was dressed like one of these.</p>
<p class="ref">Matthew 6:29</p>
<div class="col" style="left:624px;top:400px;height:560px">
<div class="copy"><p class="date">5.14</p><p class="name">JONG-HO YU</p><p class="role">Guest Speaker</p><p class="note">He hums the old dock hymn his grandmother taught him before he opens.</p></div>
<img data-lumen-image="1" data-lumen-cutout="half" alt="">
</div>
<div class="col" style="left:944px;top:260px;height:700px">
<div class="copy"><p class="date">5.21</p><p class="name">SEON-WOO LIM</p><p class="role">Worship Leader</p><p class="note">Twelve years on the road with a guitar and a notebook of unfinished songs.</p></div>
<img data-lumen-image="2" data-lumen-cutout="half" alt="">
</div>
<div class="col" style="left:1264px;top:330px;height:630px">
<div class="copy"><p class="date">5.28</p><p class="name">ELLIS KANG</p><p class="role">Story Editor</p><p class="note">She collects bus tickets from every city she has ever prayed in.</p></div>
<img data-lumen-image="3" data-lumen-cutout="half" alt="">
</div>
<div class="col" style="left:1584px;top:200px;height:760px">
<div class="copy"><p class="date">6.01</p><p class="name">ANDREW CHOI</p><p class="role">Senior Pastor</p><p class="note">Twenty-two years in this parish, still walking the same six blocks home.</p></div>
<img data-lumen-image="4" data-lumen-cutout="half" alt="">
</div>
</div>`,
  },
  {
    id: "people/arch-portrait-grid@v1",
    name: "十二人像拱形网格",
    group: "multi",
    brief: "四列三行的头像墙，每个头像装在一枚拱形色块里，下面压名字和一行英文身份，适合评审、嘉宾、团队名单页。",
    skeleton: `<style>
.wall{width:1920px;height:1080px;position:relative;background:var(--bg);font-family:var(--font-sans);display:flex;flex-direction:column;padding:56px 90px 48px;box-sizing:border-box}
.wall-top{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:34px}
.wall-kick{font-size:14px;font-weight:500;letter-spacing:.4em;text-transform:uppercase;color:var(--muted)}
.wall-title{font-family:var(--font-display);font-size:96px;font-weight:900;line-height:.92;letter-spacing:-.03em;text-transform:uppercase;color:var(--text);margin:12px 0 0 0}
.wall-note{font-size:14px;font-weight:400;letter-spacing:.28em;text-transform:uppercase;color:var(--muted);text-align:right;line-height:1.8;margin:0}
.wall-grid{display:flex;flex-wrap:wrap;gap:28px 40px;align-content:flex-start}
.card{width:405px;display:flex;flex-direction:column}
.card-img{width:180px;height:176px;border-radius:90px 90px 6px 6px;background:var(--surface);margin-bottom:14px}
.card-name{font-size:25px;font-weight:800;letter-spacing:-.01em;text-transform:uppercase;color:var(--text);margin:0 0 4px 0}
.card-role{font-size:12px;font-weight:400;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);margin:0}
</style>
<div class="wall">
<div class="wall-top">
<div><p class="wall-kick">Daegu Photo Biennale / Review 2026</p><p class="wall-title">The Reviewers</p></div>
<p class="wall-note">Twelve reading tables<br>Hall 3 / 9.4</p>
</div>
<div class="wall-grid">
<div class="card"><img class="card-img" data-lumen-image="1" data-lumen-cutout="head"><p class="card-name">Angel Luis Gonzalez</p><p class="card-role">Documentary Photographer, Madrid</p></div>
<div class="card"><img class="card-img" data-lumen-image="2" data-lumen-cutout="head"><p class="card-name">Erik Vroons</p><p class="card-role">Editor in Chief, Amsterdam</p></div>
<div class="card"><img class="card-img" data-lumen-image="3" data-lumen-cutout="head"><p class="card-name">Jean-Christophe Godet</p><p class="card-role">Visual Artist, Paris</p></div>
<div class="card"><img class="card-img" data-lumen-image="4" data-lumen-cutout="head"><p class="card-name">Katy Hundredmark</p><p class="card-role">Photography Curator, New York</p></div>
<div class="card"><img class="card-img" data-lumen-image="5" data-lumen-cutout="head"><p class="card-name">Kim Jimi</p><p class="card-role">Publisher, Seoul</p></div>
<div class="card"><img class="card-img" data-lumen-image="6" data-lumen-cutout="head"><p class="card-name">Veronica Shimanovskaya</p><p class="card-role">Photo Editor, Tbilisi</p></div>
<div class="card"><img class="card-img" data-lumen-image="7" data-lumen-cutout="head"><p class="card-name">Yoshihiro Ito</p><p class="card-role">Photographer, Tokyo</p></div>
<div class="card"><img class="card-img" data-lumen-image="8" data-lumen-cutout="head"><p class="card-name">Hyunggeon Kang</p><p class="card-role">Curator, Daegu</p></div>
<div class="card"><img class="card-img" data-lumen-image="9" data-lumen-cutout="head"><p class="card-name">Yoo Jeongmee</p><p class="card-role">Program Director, Seoul</p></div>
<div class="card"><img class="card-img" data-lumen-image="10" data-lumen-cutout="head"><p class="card-name">Lee Mash</p><p class="card-role">Museum Curator, Taipei</p></div>
<div class="card"><img class="card-img" data-lumen-image="11" data-lumen-cutout="head"><p class="card-name">Jungh Hoon</p><p class="card-role">Professor, Busan</p></div>
<div class="card"><img class="card-img" data-lumen-image="12" data-lumen-cutout="head"><p class="card-name">Mara Oyelaran</p><p class="card-role">Photo Editor, Lagos</p></div>
</div>
</div>`,
  },
  {
    id: "people/giant-type-cover-portrait@v1",
    name: "巨字叠排封面",
    group: "solo",
    brief: "超大字叠排标题占据左半，右侧整条半身像，圆徽章压角，适合单人封面或人物专访首页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden">
<style>
.cv1{position:absolute;inset:0;font-family:var(--font-sans);color:var(--text)}
.cv1 .kicker{position:absolute;left:112px;top:130px;font-size:20px;font-weight:400;letter-spacing:.46em;text-transform:uppercase;color:var(--muted)}
.cv1 .year{position:absolute;left:108px;top:176px;font-family:var(--font-display);font-size:92px;font-weight:400;letter-spacing:.01em;color:var(--accent)}
.cv1 .title{position:absolute;left:104px;top:300px;font-family:var(--font-display);font-size:198px;font-weight:900;line-height:.86;letter-spacing:-.035em;text-transform:uppercase;color:var(--text)}
.cv1 .rule{position:absolute;left:112px;top:826px;width:430px;height:2px;background:var(--border)}
.cv1 .note{position:absolute;left:112px;top:860px;width:520px;font-size:19px;line-height:1.7;font-weight:300;color:var(--muted)}
.cv1 .sign{position:absolute;left:112px;bottom:54px;font-family:var(--font-script);font-size:44px;color:var(--text);opacity:.88}
.cv1 .shot{position:absolute;right:0;top:0;width:700px;height:1080px;background:var(--surface);overflow:hidden}
.cv1 .shot img{width:100%;height:100%}
.cv1 .badge{position:absolute;right:64px;top:64px;width:220px;height:220px;border-radius:50%;background:var(--accent);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px}
.cv1 .badge b{font-family:var(--font-display);font-size:70px;font-weight:900;line-height:1;letter-spacing:-.02em;color:var(--bg)}
.cv1 .badge span{font-size:15px;font-weight:500;letter-spacing:.34em;text-transform:uppercase;color:var(--bg)}
</style>
<div class="cv1">
<span class="kicker">Daegu Photo Biennale / Portfolio</span>
<p class="year">2024.</p>
<p class="title">Portfolio<br>Review</p>
<div class="rule"></div>
<p class="note">Eleven reviewers from nine cities read your prints in one sitting. Bring twelve images, unframed, and one page of words.</p>
<p class="sign">Daegu, since 2004</p>
<div class="shot"><img data-lumen-image="1" data-lumen-cutout="half" alt=""></div>
<div class="badge"><b>9.4</b><span>Wed</span></div>
</div>
</div>`,
  },
  {
    id: "people/title-left-three-columns@v1",
    name: "标题左栏三列信息",
    group: "solo",
    brief: "左侧巨字标题配头肩像与短介，右侧三列并列信息，适合开放征集、投稿说明类页面。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden">
<style>
.cv3{position:absolute;inset:0;font-family:var(--font-sans);color:var(--text)}
.cv3 .kicker{position:absolute;left:112px;top:132px;font-size:19px;font-weight:500;letter-spacing:.44em;text-transform:uppercase;color:var(--accent)}
.cv3 .title{position:absolute;left:104px;top:196px;font-family:var(--font-display);font-size:168px;font-weight:900;line-height:.88;letter-spacing:-.035em;text-transform:uppercase;color:var(--text)}
.cv3 .port{position:absolute;left:112px;top:604px;width:330px;height:400px;overflow:hidden;background:var(--surface)}
.cv3 .port img{width:100%;height:100%}
.cv3 .bio{position:absolute;left:486px;top:614px;width:352px;font-size:19px;line-height:1.7;font-weight:300;color:var(--muted)}
.cv3 .bio b{display:block;font-size:24px;font-weight:700;letter-spacing:.01em;color:var(--text);margin-bottom:14px}
.cv3 .cols{position:absolute;right:112px;top:236px;width:900px;display:flex;gap:60px}
.cv3 .col{width:260px}
.cv3 .cap{font-size:14px;font-weight:700;letter-spacing:.34em;text-transform:uppercase;color:var(--accent);margin:0 0 20px}
.cv3 .lead{font-size:26px;font-weight:600;line-height:1.35;letter-spacing:-.005em;color:var(--text);margin:0 0 18px}
.cv3 .col p{font-size:19px;line-height:1.65;font-weight:300;color:var(--muted);margin:0 0 14px}
.cv3 .divider{width:100%;height:1px;background:var(--border);margin:0 0 24px}
</style>
<div class="cv3">
<span class="kicker">Information / 2024</span>
<p class="title">Open<br>Call</p>
<div class="port"><img data-lumen-image="1" data-lumen-cutout="head" alt=""></div>
<p class="bio"><b>Seol-hyun Lim</b>Assistant curator. Answers every mail within two days, from nine in the morning, from a desk on the second floor.</p>
<div class="cols">
<div class="col"><div class="divider"></div><p class="cap">Category</p><p class="lead">Portfolio Review</p><p>Two passes, one printed book, and a seat at the opening talk.</p></div>
<div class="col"><div class="divider"></div><p class="cap">Announcement</p><p class="lead">14 AUG 2024, WED</p><p>Selected names go up at daeguphoto.com after six in the evening.</p></div>
<div class="col"><div class="divider"></div><p class="cap">Contact</p><p class="lead">010.8005.5602</p><p>Daegu Photo Biennale, Bongsan Cultural Center, floor two.</p></div>
</div>
</div>
</div>`,
  },
  {
    id: "people/look-easy-portrait@v1",
    name: "左文右像压字肖像",
    group: "solo",
    brief: "左侧巨号衬线标题压住年份与栏目小字，右侧圆角图版内是半身人像加一个大号数字衬底，名字与短语靠右竖排，适合单人封面页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden">
<style>
.tick{position:absolute;top:44px;width:152px;height:20px;background:var(--brand)}
.tick-l{left:96px}
.tick-r{right:96px}
.mast{position:absolute;left:120px;top:88px;margin:0;font-family:var(--font-display);font-size:196px;line-height:.86;letter-spacing:-.035em;font-weight:900;text-transform:uppercase;color:var(--text)}
.mast span,.sub span{display:block}
.kicker{position:absolute;left:124px;top:520px;margin:0;font-size:21px;font-weight:400;letter-spacing:.44em;text-transform:uppercase;color:var(--muted)}
.sub{position:absolute;left:120px;top:596px;margin:0;font-size:58px;font-weight:300;line-height:1.02;letter-spacing:.02em;text-transform:uppercase;color:var(--text)}
.year{position:absolute;left:120px;top:768px;margin:0;font-size:108px;font-weight:900;line-height:1;letter-spacing:.18em;color:var(--text)}
.meta{position:absolute;left:124px;bottom:66px;margin:0;font-size:18px;font-weight:400;letter-spacing:.32em;text-transform:uppercase;color:var(--muted)}
.credit{position:absolute;left:48px;top:340px;writing-mode:vertical-rl;transform:rotate(180deg);font-family:var(--font-script);font-size:30px;color:var(--muted)}
.plate{position:absolute;left:740px;top:110px;width:760px;height:860px;background:var(--surface);border-radius:28px;overflow:hidden}
.num{position:absolute;right:-16px;bottom:-110px;margin:0;font-family:var(--font-display);font-size:820px;line-height:.78;font-weight:900;letter-spacing:-.06em;color:var(--accent);opacity:.92}
.shot{position:absolute;left:0;top:0;width:100%;height:100%}
.name{position:absolute;right:96px;top:136px;width:300px;margin:0;text-align:right;font-size:40px;font-weight:400;line-height:1.12;letter-spacing:.1em;text-transform:uppercase;color:var(--text)}
.role{position:absolute;right:96px;top:274px;width:300px;margin:0;text-align:right;font-size:17px;font-weight:400;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)}
.quote{position:absolute;right:96px;top:452px;width:300px;margin:0;text-align:right;font-size:19px;font-weight:400;line-height:1.6;letter-spacing:.05em;text-transform:uppercase;color:var(--text)}
.code{position:absolute;right:96px;top:742px;width:92px;height:280px;background:repeating-linear-gradient(to bottom,var(--text) 0 5px,var(--bg) 5px 12px);opacity:.8}
</style>
<div class="tick tick-l"></div>
<div class="tick tick-r"></div>
<p class="mast"><span>Look</span><span>Easy</span></p>
<p class="kicker">Asian Photography / Issue 04</p>
<p class="sub"><span>Fashion</span><span>Girl</span></p>
<p class="year">2024</p>
<p class="meta">Seoul / 12 Dec 2026</p>
<p class="credit">by Yunjadore</p>
<div class="plate">
<div class="num">4</div>
<img class="shot" data-lumen-image="1" data-lumen-cutout="half">
</div>
<p class="name">Chaewon<br>Kim</p>
<p class="role">Fashion Editor / Seoul</p>
<p class="quote">I make it look easy because I have done it ten thousand times before anyone was watching.</p>
<div class="code"></div>
</div>`,
  },
  {
    id: "people/vertical-wordmark-portrait@v1",
    name: "左文右像竖字叠",
    group: "solo",
    brief: "左侧竖排大标题加品牌信息栏，右侧整幅头肩人像，中间一列超大竖排品牌字压过人像边缘，适合封面级的时装或人物特写页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.ff{position:absolute;left:58px;top:76px;width:200px;height:680px;writing-mode:vertical-rl;text-orientation:upright;font-family:var(--font-display);font-weight:900;font-size:88px;line-height:.98;letter-spacing:.02em;color:var(--text)}
.sig{position:absolute;left:326px;top:96px;font-family:var(--font-script);font-size:38px;line-height:1;color:var(--muted)}
.cap{position:absolute;left:330px;top:214px;width:250px;font-family:var(--font-display);font-style:italic;font-size:19px;line-height:1.65;letter-spacing:.08em;color:var(--muted)}
.brand{position:absolute;left:326px;top:396px;font-family:var(--font-display);font-weight:700;font-size:80px;line-height:1;letter-spacing:.05em;color:var(--text)}
.sub{position:absolute;left:330px;top:502px;font-size:18px;font-weight:400;letter-spacing:.52em;text-transform:uppercase;color:var(--muted)}
.dist{position:absolute;left:330px;top:556px;display:flex;align-items:center;gap:16px;font-size:17px;font-weight:400;letter-spacing:.32em;color:var(--text)}
.rule{width:118px;height:1px;background:var(--text);opacity:.55}
.arrow{width:34px;height:1px;background:var(--text);position:relative;opacity:.8}
.arrow:after{content:"";position:absolute;right:0;top:-4px;width:8px;height:8px;border-top:1px solid var(--text);border-right:1px solid var(--text);transform:rotate(45deg)}
.list{position:absolute;left:330px;top:686px;width:400px}
.row{display:flex;align-items:center;gap:24px;padding:16px 0}
.dot{width:20px;height:20px;border-radius:50%;border:1.5px solid var(--text);opacity:.65;flex:none}
.row p{margin:0;flex:1;padding-bottom:12px;font-size:28px;font-weight:400;line-height:1.2;letter-spacing:.02em;color:var(--text);border-bottom:1px solid var(--border)}
.portrait{position:absolute;left:900px;top:0;width:1020px;height:1080px}
.portrait img{width:100%;height:100%}
.ghost{position:absolute;left:756px;top:60px;width:200px;height:820px;writing-mode:vertical-rl;text-orientation:upright;font-family:var(--font-display);font-weight:900;font-size:196px;line-height:.88;letter-spacing:-.03em;color:var(--text);opacity:.15}
.tag{position:absolute;right:78px;top:70px;text-align:right;font-size:44px;font-weight:300;line-height:1.26;letter-spacing:.08em;text-transform:uppercase;color:var(--text)}
.kick{position:absolute;left:330px;top:986px;font-size:16px;font-weight:400;letter-spacing:.44em;text-transform:uppercase;color:var(--muted)}
</style>
<div class="ff">FASHION FILE</div>
<div class="sig">meridian</div>
<div class="cap">Essential style notes<br>you need to know now</div>
<div class="brand">NOIR</div>
<div class="sub">Milano</div>
<div class="dist"><span>1837 MI</span><span class="rule"></span><span class="arrow"></span></div>
<div class="list">
<div class="row"><span class="dot"></span><p>LEE JUN</p></div>
<div class="row"><span class="dot"></span><p>HOUSE OF NOIR</p></div>
<div class="row"><span class="dot"></span><p>MILAN SHOWROOM</p></div>
</div>
<div class="portrait"><img data-lumen-image="1" data-lumen-cutout="head"></div>
<div class="ghost">NOIR</div>
<div class="tag">Born<br>To Be<br>Fashion</div>
<div class="kick">Asian Photography / 2026</div>
</div>`,
  },
  {
    id: "people/giant-type-layered-portrait@v1",
    name: "巨型字缠人像",
    group: "solo",
    brief: "超大半透明字母压在人物前后，配竖排姓名与机构字样，适合单人封面或偶像宣传页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);color:var(--text)">
<style>
.bgword{position:absolute;font-family:var(--font-display);font-weight:900;color:var(--accent);opacity:.16;line-height:.82;letter-spacing:-.05em;font-size:560px;text-transform:uppercase}
.kicker{position:absolute;font-size:20px;font-weight:400;letter-spacing:.42em;text-transform:uppercase;color:var(--muted)}
.vertname{position:absolute;writing-mode:vertical-rl;font-family:var(--font-display);font-weight:900;font-size:56px;letter-spacing:-.02em;text-transform:uppercase;color:var(--text)}
.vlabel{position:absolute;writing-mode:vertical-rl;font-size:22px;font-weight:300;letter-spacing:.34em;text-transform:uppercase;color:var(--accent)}
.fig{position:absolute;left:660px;top:60px;width:620px;height:960px}
.rule{position:absolute;background:var(--border)}
.dot{position:absolute;width:16px;height:16px;border-radius:50%;background:var(--accent)}
.note{position:absolute;font-size:17px;font-weight:300;line-height:1.7;color:var(--muted);letter-spacing:.02em}
.tag{position:absolute;font-family:var(--font-script);font-size:40px;color:var(--accent);opacity:.9}
</style>
<div class="bgword" style="left:150px;top:120px">A</div>
<div class="bgword" style="left:820px;top:420px;color:var(--brand);opacity:.3">K</div>
<div class="bgword" style="left:250px;top:600px">B</div>
<div class="rule" style="left:1230px;top:150px;width:1px;height:520px"></div>
<div class="dot" style="left:1223px;top:660px"></div>
<div class="rule" style="left:560px;top:700px;width:1px;height:300px"></div>
<div class="dot" style="left:553px;top:700px"></div>
<div class="kicker" style="left:150px;top:96px">BUKIT / 48 SEASON TWO</div>
<div class="kicker" style="left:150px;top:150px;font-size:16px;letter-spacing:.5em;color:var(--muted);opacity:.7">ASIAN PHOTOGRAPHY ARCHIVE</div>
<div class="tag" style="left:820px;top:74px">New Model</div>
<div class="fig"><img data-lumen-image="1" data-lumen-cutout="half" alt=""></div>
<div class="vertname" style="left:520px;top:200px">JAYAWARDANA</div>
<div class="vlabel" style="left:1350px;top:560px">First Edition</div>
<div class="note" style="left:150px;top:830px;width:330px">Twelve frames shot on a rooftop in Jakarta, three hours before the monsoon arrived.</div>
<div class="note" style="left:1430px;top:150px;width:290px;text-align:right">SEOUL / 2026<br>16 MAY</div>
</div>`,
  },
  {
    id: "people/ghost-figure-script-signature@v1",
    name: "左虚影右立像签名",
    group: "multi",
    brief: "左侧虚化半身像压底，右侧清晰立像站在立柱上，中间横贯手写体签名，顶端一行期号与寄语，适合单人纪念海报式人物页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.glow{position:absolute;left:820px;top:-280px;width:1040px;height:1040px;border-radius:50%;background:var(--accent);opacity:.10;filter:blur(80px)}
.kicker{position:absolute;top:58px;font-size:15px;font-weight:400;letter-spacing:.34em;text-transform:uppercase;color:var(--muted);line-height:1.7}
.kicker-l{left:76px}
.kicker-r{right:76px;text-align:right}
.date{position:absolute;left:50%;top:52px;transform:translateX(-50%);font-size:20px;font-weight:300;letter-spacing:.40em;text-transform:uppercase;color:var(--muted);white-space:nowrap}
.date b{font-size:36px;font-weight:900;letter-spacing:.06em;color:var(--text)}
.col{position:absolute;top:96px;width:140px;height:720px;background:var(--surface);opacity:.60}
.col1{left:700px}
.col2{left:921px}
.col3{left:1142px}
.fig-soft{position:absolute;left:-10px;bottom:-50px;width:670px;height:830px;opacity:.34;filter:blur(7px);z-index:2}
.fig-soft img{width:100%;height:100%;display:block}
.plinth{position:absolute;right:160px;top:958px;width:610px;height:56px;background:var(--surface);opacity:.85;z-index:2}
.fig-sharp{position:absolute;right:190px;top:140px;width:540px;height:820px;z-index:3}
.fig-sharp img{width:100%;height:100%;display:block}
.sig{position:absolute;left:150px;top:498px;z-index:5}
.sig-main{display:block;font-family:var(--font-script);font-size:250px;font-weight:400;line-height:.82;letter-spacing:-.02em;color:var(--text)}
.sig-sub{display:block;margin-left:300px;margin-top:-26px;font-family:var(--font-script);font-size:88px;line-height:1.1;color:var(--text);opacity:.92}
.note{position:absolute;left:120px;bottom:132px;width:470px;font-size:18px;font-weight:300;line-height:1.75;color:var(--muted);z-index:6}
.logo{position:absolute;left:50%;bottom:44px;transform:translateX(-50%);display:flex;align-items:center;gap:16px;z-index:6}
.logo-mark{width:26px;height:26px;border:2px solid var(--text);opacity:.9}
.logo-text{font-size:15px;font-weight:700;letter-spacing:.34em;text-transform:uppercase;color:var(--text)}
</style>
<div class="glow"></div>
<div class="col col1"></div>
<div class="col col2"></div>
<div class="col col3"></div>
<p class="kicker kicker-l">thank you for<br>the amazing memories</p>
<p class="date">2024 <b>25/08</b> SUN</p>
<p class="kicker kicker-r">always be successful<br>out there</p>
<div class="fig-soft"><img data-lumen-image="1" data-lumen-cutout="half"></div>
<div class="plinth"></div>
<div class="fig-sharp"><img data-lumen-image="2" data-lumen-cutout="half"></div>
<div class="sig"><span class="sig-main">Azei</span><span class="sig-sub">Shafaa Asadel</span></div>
<p class="note">Two frames of the same afternoon — one held still, one already walking away before the shutter closed.</p>
<div class="logo"><div class="logo-mark"></div><span class="logo-text">Bay Design</span></div>
</div>`,
  },
  {
    id: "people/giant-outline-cutout@v1",
    name: "巨字描边人像拼贴",
    group: "solo",
    brief: "左侧堆叠描边巨字，中间半身人像压字而出，四周散落细框标签，右下角署名——适合音乐人封面页。",
    skeleton: `<div class="ja-root" style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);color:var(--text)">
<style>
.ja-root{font-family:var(--font-sans)}
.ja-ghost{position:absolute;left:26px;top:118px;font-family:var(--font-display);font-weight:900;font-size:330px;line-height:.88;letter-spacing:-.045em;white-space:nowrap;color:transparent;-webkit-text-stroke:2px var(--accent);opacity:.42;z-index:1}
.ja-top{position:absolute;left:0;top:0;width:1920px;height:66px;box-sizing:border-box;padding:0 64px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid var(--border);font-size:15px;font-weight:400;letter-spacing:.42em;text-transform:uppercase;color:var(--muted);z-index:6}
.ja-band{position:absolute;left:0;top:700px;width:1920px;height:54px;box-sizing:border-box;padding:0 64px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--border);border-bottom:1px solid var(--border);background:var(--surface);font-size:14px;font-weight:400;letter-spacing:.5em;text-transform:uppercase;color:var(--muted);z-index:2}
.ja-figure{position:absolute;left:636px;top:38px;width:660px;height:1004px;z-index:3}
.ja-figure img{width:100%;height:100%;display:block}
.ja-tag{position:absolute;z-index:5;padding:11px 20px;border:1px solid var(--border);background:var(--surface);font-size:16px;font-weight:400;letter-spacing:.28em;text-transform:uppercase;color:var(--text)}
.ja-tag-a{left:498px;top:250px}
.ja-tag-b{left:1302px;top:306px}
.ja-tag-c{left:470px;top:706px}
.ja-tag-d{left:1246px;top:846px}
.ja-bday{position:absolute;left:64px;top:788px;z-index:5}
.ja-bday-script{font-family:var(--font-script);font-size:60px;line-height:1;margin:0;color:var(--accent)}
.ja-bday-big{font-family:var(--font-display);font-weight:300;font-size:86px;line-height:1;letter-spacing:-.02em;margin:6px 0 0 0;text-transform:uppercase}
.ja-name-kicker{position:absolute;right:74px;top:842px;z-index:5;margin:0;text-align:right;font-size:14px;font-weight:400;letter-spacing:.5em;text-transform:uppercase;color:var(--muted)}
.ja-name{position:absolute;right:70px;top:886px;z-index:5;margin:0;text-align:right;font-family:var(--font-display);font-weight:900;font-size:78px;line-height:.94;letter-spacing:-.02em;text-transform:uppercase}
.ja-side{position:absolute;right:26px;top:180px;z-index:5;margin:0;writing-mode:vertical-rl;font-size:14px;letter-spacing:.5em;text-transform:uppercase;color:var(--muted)}
</style>
<p class="ja-ghost">JAE<br>HYUS</p>
<div class="ja-top"><span>20 April 2002</span><span>bblueCile</span><span>Seoul / 2026</span></div>
<div class="ja-band"><span>Rockstar</span><span>Electric Guitar</span><span>Live Set</span><span>Archive No. 07</span></div>
<div class="ja-figure"><img data-lumen-image="1" data-lumen-cutout="half"></div>
<span class="ja-tag ja-tag-a">2002</span>
<span class="ja-tag ja-tag-b">02z Lab</span>
<span class="ja-tag ja-tag-c">20 April</span>
<span class="ja-tag ja-tag-d">Tour 2026</span>
<div class="ja-bday"><p class="ja-bday-script">April</p><p class="ja-bday-big">Birthday</p></div>
<p class="ja-name-kicker">Bass / Vocal</p>
<p class="ja-name">Park<br>Jong Seong</p>
<p class="ja-side">Portrait Series / 2026</p>
</div>`,
  },
  {
    id: "people/giant-glyph-band@v1",
    name: "巨字红带竖名",
    group: "solo",
    brief: "中央一条通高色带压着三个巨型字母，单人半身像立在字母前面，两侧竖排重复姓名，适合单人封面或人物特写页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);">
<style>.band{position:absolute;left:600px;top:0;width:720px;height:1080px;background:var(--accent);}.glyph{position:absolute;font-family:var(--font-display);font-weight:900;color:var(--bg);line-height:.8;letter-spacing:-.04em;}.g1{left:645px;top:130px;font-size:400px;}.g2{left:845px;top:400px;font-size:400px;}.g3{left:660px;top:720px;font-size:400px;z-index:3;}.vert{position:absolute;writing-mode:vertical-rl;text-transform:uppercase;font-weight:700;letter-spacing:.2em;font-size:104px;line-height:1;color:var(--accent);}.vl{left:110px;top:70px;}.vr{left:1700px;top:60px;font-weight:300;}.shot{position:absolute;left:690px;top:200px;width:560px;height:880px;z-index:2;}.box{position:absolute;left:870px;top:0;width:180px;height:172px;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:4;}.box span{color:var(--accent);font-weight:900;font-size:48px;line-height:1.05;letter-spacing:-.02em;text-transform:uppercase;}.dot{position:absolute;left:496px;width:20px;height:20px;border-radius:50%;background:var(--accent);}.chev{position:absolute;left:1360px;top:30px;color:var(--accent);font-family:var(--font-display);font-size:150px;font-weight:900;letter-spacing:-.06em;line-height:1;transform:rotate(90deg);}</style>
<div class="band"></div>
<div class="glyph g1">A</div>
<div class="glyph g2">D</div>
<img class="shot" data-lumen-image="1" data-lumen-cutout="half">
<div class="glyph g3">L</div>
<div class="box"><span>JKT</span><span>48</span></div>
<div class="chev">&laquo;&laquo;&laquo;</div>
<div class="vert vl">REVA FIDEL</div>
<div class="vert vr">REVA FIDEL</div>
<div class="dot" style="top:700px"></div>
<div class="dot" style="top:742px"></div>
<div class="dot" style="top:784px"></div>
<div class="dot" style="top:826px"></div>
</div>`,
  },
  {
    id: "people/vertical-mega-type-overlay@v1",
    name: "竖排巨字压像",
    group: "solo",
    brief: "左侧满高人物配竖排描边巨字，右侧窄幅底面上叠实心巨字与手写署名，适合单人封面式的强视觉人物页",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)"><style>.vm-left{position:absolute;left:0;top:0;width:1210px;height:1080px;background:var(--brand);overflow:hidden}.vm-left img{position:absolute;left:250px;top:56px;width:860px;height:1020px}.vm-outline{position:absolute;left:44px;top:8px;writing-mode:vertical-rl;font-family:var(--font-display);font-weight:900;font-size:246px;line-height:.86;letter-spacing:-.03em;text-transform:uppercase;color:transparent;-webkit-text-stroke:3px var(--bg)}.vm-kicker{position:absolute;left:58px;top:74px;width:180px;font-size:15px;font-weight:400;letter-spacing:.34em;line-height:2.1;text-transform:uppercase;color:var(--text)}.vm-note{position:absolute;left:58px;bottom:86px;width:200px;font-size:15px;font-weight:300;letter-spacing:.3em;line-height:2.1;text-transform:uppercase;color:var(--text)}.vm-right{position:absolute;right:0;top:0;width:710px;height:1080px;background:var(--bg)}.vm-solid{position:absolute;right:118px;top:8px;writing-mode:vertical-rl;font-family:var(--font-display);font-weight:900;font-size:246px;line-height:.86;letter-spacing:-.03em;text-transform:uppercase;color:var(--text)}.vm-by{position:absolute;right:92px;bottom:74px;font-family:var(--font-script);font-size:36px;color:var(--text);opacity:.9}.vm-rule{position:absolute;left:1108px;top:120px;width:2px;height:840px;background:var(--border);opacity:.5}</style><div class="vm-left"><img data-lumen-image="1" data-lumen-cutout="half"><div class="vm-outline">MUSE</div><div class="vm-kicker">The Future of Fashion Starts Here</div><div class="vm-note">Breaking Rules. Setting Trends.</div></div><div class="vm-right"><div class="vm-solid">MUSE</div><div class="vm-by">By Sara.</div></div><div class="vm-rule"></div></div>`,
  },
  {
    id: "people/duo-collage-name-stack@v1",
    name: "双人拼贴巨字姓名",
    group: "multi",
    brief: "两幅半身人像前后错落拼贴，左侧描边巨字姓名分层堆叠，手写字横贯画面，底部色带收口，适合人物专访或艺人海报页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.pl-bar{position:absolute;left:0;top:0;width:1920px;height:78px;display:flex;background:var(--surface);border-bottom:1px solid var(--border)}
.pl-bar p{flex:1;margin:0;padding:15px 42px;border-right:1px solid var(--border);font-size:11px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.pl-bar p:last-child{border-right:none}
.pl-bar span{display:block;margin-top:8px;font-size:18px;font-weight:900;letter-spacing:.08em;color:var(--text)}
.pl-tag{position:absolute;left:118px;top:154px;display:flex;align-items:center;gap:22px}
.pl-hatch{width:52px;height:52px;border:1px solid var(--border);background:repeating-linear-gradient(45deg,var(--text) 0 3px,transparent 3px 8px)}
.pl-date{font-size:13px;font-weight:300;letter-spacing:.32em;color:var(--muted)}
.pl-gen{padding:7px 22px;border:3px solid var(--text);font-size:21px;font-weight:900;letter-spacing:.2em;text-transform:uppercase;color:var(--text)}
.pl-arrow{font-size:46px;font-weight:300;line-height:1;color:var(--text)}
.pl-name{position:absolute;left:112px;top:240px}
.pl-name div{display:flex;align-items:baseline;gap:28px;border:5px solid var(--text);padding:4px 30px}
.pl-name .second{margin-top:16px}
.pl-name .big{font-family:var(--font-display);font-size:132px;font-weight:900;line-height:.95;letter-spacing:-.035em;text-transform:uppercase;color:var(--text)}
.pl-name .mid{font-size:34px;font-weight:300;letter-spacing:.24em;text-transform:uppercase;color:var(--text)}
.pl-bio{position:absolute;left:112px;top:690px;width:600px}
.pl-bio .kick{font-size:12px;font-weight:400;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.pl-bio .txt{margin-top:16px;font-size:16px;font-weight:300;line-height:1.7;color:var(--text)}
.pl-photo-b{position:absolute;left:1290px;top:110px;width:520px;height:700px}
.pl-photo-a{position:absolute;left:800px;top:230px;width:540px;height:750px;z-index:2}
.pl-photo-a img,.pl-photo-b img{width:100%;height:100%}
.pl-script{position:absolute;left:1336px;top:428px;width:430px;font-family:var(--font-script);font-size:92px;line-height:.9;color:var(--text);opacity:.92;z-index:6}
.pl-mark{position:absolute;left:958px;top:618px;font-family:var(--font-display);font-size:186px;font-weight:900;line-height:.9;letter-spacing:-.04em;color:var(--accent);opacity:.3;z-index:5}
.pl-list{position:absolute;left:1424px;top:824px;width:420px;display:flex;gap:56px}
.pl-list .col{flex:1}
.pl-list .hd{font-size:12px;font-weight:900;letter-spacing:.34em;text-transform:uppercase;color:var(--text)}
.pl-list p{margin:10px 0 0;font-size:13px;font-weight:300;line-height:1.6;color:var(--muted)}
.pl-list p span{display:block}
.pl-band{position:absolute;left:0;bottom:0;width:1920px;height:92px;background:var(--accent);display:flex;align-items:center;gap:38px;padding:0 64px;z-index:8}
.pl-logo{width:52px;height:52px;border:3px solid var(--bg);display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;color:var(--bg)}
.pl-band p{margin:0;flex:1;font-size:12px;font-weight:300;line-height:1.55;letter-spacing:.04em;color:var(--bg)}
.pl-code{width:180px;height:44px;background:repeating-linear-gradient(90deg,var(--bg) 0 2px,transparent 2px 5px,var(--bg) 5px 9px,transparent 9px 13px,var(--bg) 13px 14px,transparent 14px 20px)}
</style>
<div class="pl-bar">
<p>Edited by<span>DWIKI ADINATA</span></p>
<p>Photo by<span>ERICO</span></p>
<p>Artist<span>ZEE JKT48</span></p>
</div>
<div class="pl-tag"><div class="pl-hatch"></div><div class="pl-date">16.05.04</div><div class="pl-gen">Gen 7</div><div class="pl-arrow">&rarr;</div></div>
<div class="pl-name">
<div><span class="big">Azizi</span><span class="mid">Shafaa</span></div>
<div class="second"><span class="big">Asadel</span></div>
</div>
<div class="pl-bio"><div class="kick">Portrait Series / Jakarta 2026</div><div class="txt">She joined the seventh generation in 2016 and has since shot three short documentaries between Jakarta and Bandung.</div></div>
<div class="pl-photo-b"><img data-lumen-image="2" data-lumen-cutout="half" alt=""></div>
<div class="pl-photo-a"><img data-lumen-image="1" data-lumen-cutout="half" alt=""></div>
<div class="pl-script">End of the fear</div>
<div class="pl-mark">JKT48</div>
<div class="pl-list">
<div class="col"><div class="hd">JKT48</div><p><span>Sayanora Crawl</span><span>Eureka Mile Kita</span><span>Ponytail to Shu Shu</span><span>Flying High</span></p></div>
<div class="col"><div class="hd">Film</div><p><span>Aneka: 1998</span><span>Kalian Pantas Mati</span></p></div>
</div>
<div class="pl-band">
<div class="pl-logo">DC</div>
<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Quis ipsum suspendisse ultrices gravida.</p>
<div class="pl-code"></div>
</div>
</div>`,
  },
  {
    id: "people/left-copy-portrait-band@v1",
    name: "左文人像右色带",
    group: "solo",
    brief: "左侧竖排姓名与短介，中间半身人像压住画面下缘，右侧一条整高色带放竖排大字与标识，适合单人主视觉封面或人物特写海报。",
    skeleton: `<style>
.poster{width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden}
.band{position:absolute;right:0;top:0;width:340px;height:1080px;background:var(--accent)}
.band-logo{position:absolute;right:66px;top:72px;width:98px;height:98px;border:2px solid var(--bg);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;letter-spacing:.06em;color:var(--bg)}
.band-year{position:absolute;right:72px;top:190px;font-size:19px;font-weight:300;letter-spacing:.46em;color:var(--bg);opacity:.85}
.band-name{position:absolute;right:120px;top:296px;writing-mode:vertical-rl;font-size:78px;font-weight:900;letter-spacing:.26em;line-height:1;color:var(--bg)}
.band-note{position:absolute;right:198px;top:320px;writing-mode:vertical-rl;font-size:13px;font-weight:400;letter-spacing:.22em;line-height:2;text-transform:uppercase;color:var(--bg);opacity:.72}
.band-foot{position:absolute;right:82px;bottom:74px;font-size:13px;font-weight:400;letter-spacing:.36em;text-transform:uppercase;color:var(--bg);opacity:.82}
.figure{position:absolute;left:740px;top:40px;width:900px;height:1040px}
.figure img{width:100%;height:100%;display:block}
.copy{position:absolute;left:112px;top:104px;width:570px}
.kicker{font-size:14px;font-weight:500;letter-spacing:.5em;text-transform:uppercase;color:var(--muted)}
.rule{margin-top:26px;height:1px;background:var(--border)}
.first{font-family:var(--font-script);font-size:104px;line-height:.9;color:var(--accent);margin-top:38px}
.name{font-family:var(--font-display);font-size:168px;font-weight:900;letter-spacing:-.03em;line-height:.88;color:var(--text);margin-top:-14px}
.bio{font-size:17px;font-weight:300;line-height:1.7;color:var(--muted);margin-top:34px;max-width:430px}
.tags{margin-top:42px;font-size:13px;font-weight:500;letter-spacing:.42em;text-transform:uppercase;color:var(--text);opacity:.68}
.foot{position:absolute;left:112px;bottom:66px;font-size:12px;font-weight:400;letter-spacing:.36em;text-transform:uppercase;color:var(--muted)}
</style>
<div class="poster">
<div class="band"></div>
<div class="band-logo">UK48</div>
<div class="band-year">2006</div>
<div class="band-name">JKT48</div>
<div class="band-note">Eighth generation / Jakarta / since 27 april 2025</div>
<div class="band-foot">Portrait series 04</div>
<div class="figure"><img data-lumen-image="1" data-lumen-cutout="half"></div>
<div class="copy">
<div class="kicker">Asian Portrait Series / 2026</div>
<div class="rule"></div>
<div class="first">Eva</div>
<div class="name">ADEL</div>
<div class="bio">She keeps the red cap pulled low on the walk from the station, and only lifts it once the shutter is already halfway down.</div>
<div class="tags">Calm &nbsp;/&nbsp; Cat &nbsp;/&nbsp; Girl</div>
</div>
<div class="foot">Studio Dangoll / Seoul</div>
</div>`,
  },
  {
    id: "people/three-portrait-vertical-name-bars@v1",
    name: "三栏竖名金条",
    group: "multi",
    brief: "左侧三张竖长人像卡并排，名字竖排在像侧、金色说明条压底，右侧一座大奖杯做视觉重物。适合先锋榜、年度人物、三人表彰。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden">
<style>
.l1-head{position:absolute;left:90px;top:72px;display:flex;align-items:baseline;gap:56px}
.l1-dot{width:18px;height:18px;border-radius:50%;background:var(--accent);display:inline-block;align-self:center}
.l1-title{font-family:var(--font-display);font-weight:900;font-size:96px;line-height:1;letter-spacing:-.03em;color:var(--text)}
.l1-tags{position:absolute;right:90px;top:116px;display:flex;gap:110px}
.l1-tag{font-family:var(--font-sans);font-size:12px;font-weight:300;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.l1-row{position:absolute;left:90px;top:250px;display:flex;gap:48px;align-items:flex-start}
.l1-card{width:352px;display:flex;flex-direction:column}
.l1-inner{display:flex;gap:16px;align-items:flex-start}
.l1-namecol{width:66px;display:flex;flex-direction:column;align-items:center;padding-top:6px}
.l1-name{writing-mode:vertical-rl;font-family:var(--font-display);font-size:42px;font-weight:900;letter-spacing:.08em;line-height:1;color:var(--text)}
.l1-en{writing-mode:vertical-rl;font-family:var(--font-sans);font-size:11px;font-weight:300;letter-spacing:.34em;text-transform:uppercase;color:var(--muted);margin-top:16px}
.l1-photo{width:270px;height:430px;border-radius:24px;background:var(--surface);border:1px solid var(--border);overflow:hidden}
.l1-photo img{width:100%;height:100%;display:block}
.l1-cap{margin-top:22px;background:var(--accent);padding:22px 24px;box-sizing:border-box;font-family:var(--font-sans);font-size:19px;font-weight:400;line-height:1.55;color:var(--bg)}
.l1-trophy{position:absolute;right:96px;bottom:110px;width:520px;display:flex;flex-direction:column;align-items:center}
.l1-star{width:420px;height:400px;background:var(--accent);clip-path:polygon(50% 0%,61% 34%,98% 35%,68% 57%,79% 91%,50% 71%,21% 91%,32% 57%,2% 35%,39% 34%)}
.l1-base{width:230px;height:110px;background:var(--accent);opacity:.5;clip-path:polygon(18% 0,82% 0,100% 100%,0 100%)}
</style>
<div class="l1-head"><span class="l1-dot"></span><span class="l1-title">TEAM VANGUARD</span></div>
<div class="l1-tags"><span class="l1-tag">With Original Heart</span><span class="l1-tag">To The Years</span><span class="l1-tag">With Struggle</span><span class="l1-tag">To Glory</span></div>
<div class="l1-row">
<div class="l1-card"><div class="l1-inner"><div class="l1-namecol"><span class="l1-name">HANA MORI</span><span class="l1-en">Busan 2026</span></div><div class="l1-photo"><img data-lumen-image="1" data-lumen-cutout="half" alt=""></div></div><div class="l1-cap">She took the overnight ferry to file the harbor story before the tide turned at dawn.</div></div>
<div class="l1-card"><div class="l1-inner"><div class="l1-namecol"><span class="l1-name">LINA BAE</span><span class="l1-en">Seoul 2026</span></div><div class="l1-photo"><img data-lumen-image="2" data-lumen-cutout="half" alt=""></div></div><div class="l1-cap">Ten years on the rescue team, and she still counts every name twice before leaving.</div></div>
<div class="l1-card"><div class="l1-inner"><div class="l1-namecol"><span class="l1-name">SUN LING</span><span class="l1-en">Harbin 2026</span></div><div class="l1-photo"><img data-lumen-image="3" data-lumen-cutout="half" alt=""></div></div><div class="l1-cap">She rewrote the winter logistics plan in one night and cut the delivery delay in half.</div></div>
</div>
<div class="l1-trophy"><div class="l1-star"></div><div class="l1-base"></div></div>
</div>`,
  },
  {
    id: "people/hexagon-avatar-columns@v1",
    name: "三栏六边头像",
    group: "multi",
    brief: "三列等宽，每列一个六边形头像压着金色名牌，下面接职称与两行小字，列间用细线分隔。适合最佳员工、管理者群像。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden">
<style>
.l2-head{position:absolute;left:90px;top:72px;display:flex;align-items:baseline;gap:56px}
.l2-dot{width:18px;height:18px;border-radius:50%;background:var(--accent);display:inline-block;align-self:center}
.l2-title{font-family:var(--font-display);font-weight:900;font-size:96px;line-height:1;letter-spacing:-.03em;color:var(--text)}
.l2-tags{position:absolute;right:90px;top:116px;display:flex;gap:110px}
.l2-tag{font-family:var(--font-sans);font-size:12px;font-weight:300;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.l2-body{position:absolute;left:120px;right:120px;top:290px;bottom:100px;display:flex;justify-content:space-between}
.l2-rule{position:absolute;top:0;bottom:0;width:1px;background:var(--border)}
.l2-col{width:470px;display:flex;flex-direction:column;align-items:center}
.l2-hex{width:320px;height:340px;background:var(--surface);border:1px solid var(--border);clip-path:polygon(50% 0,100% 26%,100% 74%,50% 100%,0 74%,0 26%);overflow:hidden}
.l2-hex img{width:100%;height:100%;display:block}
.l2-plate{margin-top:-46px;width:320px;height:78px;border-radius:8px;background:var(--accent);color:var(--bg);display:flex;align-items:center;justify-content:center;font-family:var(--font-sans);font-size:30px;font-weight:700;letter-spacing:.06em}
.l2-role{margin-top:56px;font-family:var(--font-display);font-size:38px;font-weight:700;letter-spacing:-.01em;color:var(--text)}
.l2-desc{margin-top:24px;width:420px;text-align:center;font-family:var(--font-sans);font-size:19px;font-weight:300;line-height:1.65;color:var(--muted)}
</style>
<div class="l2-head"><span class="l2-dot"></span><span class="l2-title">PEOPLE OF THE YEAR</span></div>
<div class="l2-tags"><span class="l2-tag">With Original Heart</span><span class="l2-tag">To The Years</span><span class="l2-tag">With Struggle</span><span class="l2-tag">To Glory</span></div>
<div class="l2-body">
<div class="l2-rule" style="left:33.33%"></div>
<div class="l2-rule" style="left:66.66%"></div>
<div class="l2-col"><div class="l2-hex"><img data-lumen-image="1" data-lumen-cutout="head" alt=""></div><div class="l2-plate">LEE JUN</div><div class="l2-role">Lead Engineer</div><div class="l2-desc">Fifteen years of software architecture, most of them spent rebuilding the same payment system twice.</div></div>
<div class="l2-col"><div class="l2-hex"><img data-lumen-image="2" data-lumen-cutout="head" alt=""></div><div class="l2-plate">MIN SEO</div><div class="l2-role">Head of People</div><div class="l2-desc">She runs every hiring loop herself and keeps a paper list of the ninety offers sent last spring.</div></div>
<div class="l2-col"><div class="l2-hex"><img data-lumen-image="3" data-lumen-cutout="head" alt=""></div><div class="l2-plate">XU WAN</div><div class="l2-role">Program Director</div><div class="l2-desc">Eleven port expansions delivered on schedule, including the rainy season run in Ningbo in 2024.</div></div>
</div>
</div>`,
  },
  {
    id: "people/four-arch-portrait-band@v1",
    name: "四栏拱窗金标签",
    group: "multi",
    brief: "顶部标题加四枚通栏小字标签，下方四栏并排：拱形取景人像、压边金色部门标签、渐变文字块，适合四人并列的榜样/主创展示。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.hd{position:absolute;left:90px;top:70px;display:flex;align-items:center;gap:26px}
.hd .dot{width:24px;height:24px;border-radius:50%;background:var(--accent)}
.hd h1{margin:0;font-family:var(--font-display);font-size:104px;font-weight:900;line-height:1;letter-spacing:-.035em;color:var(--text)}
.kick{position:absolute;left:900px;right:90px;top:118px;display:flex;justify-content:space-between}
.kick span{font-size:13px;font-weight:400;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.band{position:absolute;left:0;right:0;top:690px;height:390px;background:linear-gradient(90deg,var(--brand),var(--surface));opacity:.3}
.row{position:absolute;left:90px;top:230px;display:flex;gap:40px}
.col{position:relative;width:405px;height:790px}
.arch{position:absolute;left:0;top:0;width:405px;height:430px;overflow:hidden;background:var(--surface);border:1px solid var(--border);clip-path:polygon(50% 0,100% 19%,100% 100%,0 100%,0 19%)}
.arch img{display:block;width:100%;height:100%}
.rib{position:absolute;left:-16px;top:398px;padding:16px 44px 16px 30px;background:var(--accent);clip-path:polygon(0 0,100% 0,calc(100% - 28px) 100%,0 100%)}
.rib span{font-size:26px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--bg)}
.quote{position:absolute;left:0;top:498px;width:405px;height:292px;box-sizing:border-box;padding:32px 28px;background:linear-gradient(160deg,var(--brand),var(--surface));clip-path:polygon(0 0,100% 0,100% 90%,94% 100%,0 100%)}
.quote p{margin:0;font-size:19px;line-height:1.85;font-weight:400;color:var(--text);opacity:.92}
</style>
<div class="hd"><div class="dot"></div><h1>BEST OF US</h1></div>
<div class="kick"><span>Portrait Series</span><span>Seoul / 2026</span><span>Vol. 04</span><span>Staff Picks</span></div>
<div class="band"></div>
<div class="row">
<div class="col">
<div class="arch"><img data-lumen-image="1" data-lumen-cutout="head"></div>
<div class="rib"><span>Design</span></div>
<div class="quote"><p>Redraws the same facade eleven times before the ink dries, then walks the site alone at dawn to check the light.</p></div>
</div>
<div class="col">
<div class="arch"><img data-lumen-image="2" data-lumen-cutout="head"></div>
<div class="rib"><span>Design</span></div>
<div class="quote"><p>Keeps a drawer of rejected sketches from 2019; three of them became the station canopy you still walk under.</p></div>
</div>
<div class="col">
<div class="arch"><img data-lumen-image="3" data-lumen-cutout="head"></div>
<div class="rib"><span>Sales</span></div>
<div class="quote"><p>Signs the contract on a folding table in Busan, then calls the client back to shave two lines off the invoice.</p></div>
</div>
<div class="col">
<div class="arch"><img data-lumen-image="4" data-lumen-cutout="head"></div>
<div class="rib"><span>Marketing</span></div>
<div class="quote"><p>Counts foot traffic by hand every Friday, and still argues that the poster on the stairwell beats any paid ad.</p></div>
</div>
</div>
</div>`,
  },
  {
    id: "people/six-card-diagonal-grid@v1",
    name: "双排六格斜切卡",
    group: "multi",
    brief: "标题在左上、四枚小字横排，下方两行三列：左侧白卡写姓名与短介、右下斜切色块，右侧半身人像压住卡片边缘，适合六人团队一览。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.hd{position:absolute;left:90px;top:58px;display:flex;align-items:center;gap:24px}
.hd .dot{width:22px;height:22px;border-radius:50%;background:var(--accent)}
.hd h1{margin:0;font-family:var(--font-display);font-size:96px;font-weight:900;line-height:1;letter-spacing:-.035em;color:var(--text)}
.kick{position:absolute;left:960px;right:90px;top:104px;display:flex;justify-content:space-between}
.kick span{font-size:12px;font-weight:400;letter-spacing:.36em;text-transform:uppercase;color:var(--muted)}
.grid{position:absolute;left:90px;top:250px;width:1740px}
.line{display:flex;gap:40px}
.line+.line{margin-top:34px}
.cell{position:relative;width:553px;height:372px}
.card{position:absolute;left:0;top:34px;width:400px;height:338px;box-sizing:border-box;padding:32px 28px;background:var(--surface);border:1px solid var(--border)}
.wedge{position:absolute;left:0;bottom:0;width:100%;height:140px;background:var(--brand);opacity:.85;clip-path:polygon(0 100%,0 30%,100% 100%)}
.nm{position:relative;display:flex;align-items:center;gap:14px}
.nm h3{margin:0;font-family:var(--font-display);font-size:38px;font-weight:900;line-height:1;letter-spacing:-.02em;color:var(--text)}
.tag{padding:4px 12px;font-size:12px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:var(--bg);background:var(--accent)}
.card p{position:relative;margin:22px 0 0;width:222px;font-size:17px;line-height:1.7;font-weight:400;color:var(--muted)}
.shot{position:absolute;right:0;top:0;width:290px;height:372px;overflow:hidden;background:var(--surface)}
.shot img{display:block;width:100%;height:100%}
</style>
<div class="hd"><div class="dot"></div><h1>WHO WALKS WITH US</h1></div>
<div class="kick"><span>Team / 2026</span><span>Sales Division</span><span>Seoul &amp; Busan</span><span>Vol. 07</span></div>
<div class="grid">
<div class="line">
<div class="cell">
<div class="card"><div class="wedge"></div><div class="nm"><h3>ELIAS VOSS</h3><span class="tag">Sales</span></div><p>Built the launch plan for three unknown labels before any of them had a shelf.</p></div>
<div class="shot"><img data-lumen-image="1" data-lumen-cutout="half"></div>
</div>
<div class="cell">
<div class="card"><div class="wedge"></div><div class="nm"><h3>NORA HALE</h3><span class="tag">Sales</span></div><p>Talks to shop owners in the rain; her notebook lists 214 doors and who opened them.</p></div>
<div class="shot"><img data-lumen-image="2" data-lumen-cutout="half"></div>
</div>
<div class="cell">
<div class="card"><div class="wedge"></div><div class="nm"><h3>JUN PARK</h3><span class="tag">Sales</span></div><p>Rebuilt the distribution map by hand and cut delivery time down to eleven hours.</p></div>
<div class="shot"><img data-lumen-image="3" data-lumen-cutout="half"></div>
</div>
</div>
<div class="line">
<div class="cell">
<div class="card"><div class="wedge"></div><div class="nm"><h3>MIRA SOL</h3><span class="tag">Sales</span></div><p>Started on the warehouse floor, now trains every new hire in their first week.</p></div>
<div class="shot"><img data-lumen-image="4" data-lumen-cutout="half"></div>
</div>
<div class="cell">
<div class="card"><div class="wedge"></div><div class="nm"><h3>THEO LIN</h3><span class="tag">Sales</span></div><p>Negotiates in two languages and keeps every receipt in a paper folder, never a phone.</p></div>
<div class="shot"><img data-lumen-image="5" data-lumen-cutout="half"></div>
</div>
<div class="cell">
<div class="card"><div class="wedge"></div><div class="nm"><h3>SADIE OKONKWO</h3><span class="tag">Sales</span></div><p>Spent nine years on the road and still answers the six a.m. calls from regional stores.</p></div>
<div class="shot"><img data-lumen-image="6" data-lumen-cutout="half"></div>
</div>
</div>
</div>
</div>`,
  },
  {
    id: "people/three-column-gold-band@v1",
    name: "三栏人像金带",
    group: "multi",
    brief: "大标题居左、右侧四段小字分列，下方三栏等宽半身像，每张照片底部压一条金色斜切姓名带并接一段短介，适合团队荣誉墙或三人并置介绍。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden">
<style>
.a-head{position:absolute;left:96px;top:58px;display:flex;align-items:center;gap:22px}
.a-dot{width:24px;height:24px;border-radius:50%;background:var(--accent)}
.a-title{margin:0;font-family:var(--font-display);font-size:120px;font-weight:900;line-height:.9;letter-spacing:-.035em;text-transform:uppercase;color:var(--text)}
.a-kick{position:absolute;right:96px;top:128px;display:flex;gap:60px}
.a-kick span{font-size:15px;font-weight:400;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.a-rule{position:absolute;left:96px;right:96px;top:252px;height:1px;background:var(--border)}
.a-row{position:absolute;left:96px;right:96px;top:300px;display:flex;gap:56px}
.a-col{flex:1;display:flex;flex-direction:column}
.a-photo{position:relative;height:600px;background:var(--surface);border:1px solid var(--border);overflow:hidden}
.a-photo img{width:100%;height:100%;display:block}
.a-plate{position:absolute;left:0;bottom:0;padding:22px 44px 24px 34px;background:var(--accent);clip-path:polygon(0 0,100% 0,calc(100% - 36px) 100%,0 100%)}
.a-plate p{margin:0;font-family:var(--font-display);font-size:36px;font-weight:700;letter-spacing:.01em;text-transform:uppercase;color:var(--bg)}
.a-bio{margin:50px 0 0;font-size:21px;font-weight:300;line-height:1.7;color:var(--muted);max-width:440px}
</style>
<div class="a-head"><span class="a-dot"></span><p class="a-title">Best Crew</p></div>
<div class="a-kick"><span>With Original Heart</span><span>To The Years</span><span>With Struggle</span><span>To Glory</span></div>
<div class="a-rule"></div>
<div class="a-row">
<div class="a-col">
<div class="a-photo"><img data-lumen-image="1" data-lumen-cutout="half"><div class="a-plate"><p>Hana Mori</p></div></div>
<p class="a-bio">Ten years running cross-department launches, from the first sketch to the night the lights finally come on.</p>
</div>
<div class="a-col">
<div class="a-photo"><img data-lumen-image="2" data-lumen-cutout="half"><div class="a-plate"><p>Akira Kato</p></div></div>
<p class="a-bio">Rebuilt the dock schedule in six weeks and cut the average waiting time for haulers by half.</p>
</div>
<div class="a-col">
<div class="a-photo"><img data-lumen-image="3" data-lumen-cutout="half"><div class="a-plate"><p>Sofia Lind</p></div></div>
<p class="a-bio">Runs the Seoul studio, keeps every shoot on schedule, and still answers her own phone at midnight.</p>
</div>
</div>
</div>`,
  },
  {
    id: "people/trophy-two-figures@v1",
    name: "左奖杯右双立像",
    group: "multi",
    brief: "左侧竖排大标题与金色奖杯图形，右侧两幅等高半身像并排，各自右侧挂一条竖排姓名缎带、底部一枚小部门标签，适合颁奖页或双人领导表彰。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden">
<style>
.b-glow{position:absolute;left:20px;top:430px;width:560px;height:560px;border-radius:50%;background:var(--accent);opacity:.2;filter:blur(100px)}
.b-kick{position:absolute;left:88px;top:76px;margin:0;font-size:15px;font-weight:400;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.b-title{position:absolute;left:88px;margin:0;font-family:var(--font-display);font-size:118px;font-weight:900;line-height:.86;letter-spacing:-.035em;text-transform:uppercase;color:var(--text)}
.b-t1{top:106px}
.b-t2{top:208px}
.b-note{position:absolute;left:92px;top:336px;margin:0;font-family:var(--font-script);font-size:34px;font-weight:400;color:var(--muted)}
.b-star{position:absolute;left:148px;top:440px;width:300px;height:300px;background:var(--accent);clip-path:polygon(50% 0,61% 34%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 34%)}
.b-stem{position:absolute;left:263px;top:732px;width:70px;height:150px;background:var(--accent);opacity:.9;clip-path:polygon(0 0,100% 0,72% 100%,28% 100%)}
.b-base{position:absolute;left:193px;top:874px;width:210px;height:44px;border-radius:12px;background:var(--accent)}
.b-row{position:absolute;left:660px;right:96px;top:150px;bottom:90px;display:flex;gap:80px}
.b-fig{flex:1;position:relative}
.b-frame{position:absolute;left:0;top:0;width:100%;height:100%;background:var(--surface);border:1px solid var(--border);overflow:hidden}
.b-frame img{width:100%;height:100%;display:block}
.b-tag{position:absolute;right:-28px;top:110px;margin:0;padding:28px 0;width:76px;text-align:center;background:var(--accent);writing-mode:vertical-rl;text-orientation:upright;font-family:var(--font-display);font-size:30px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--bg)}
.b-pill{position:absolute;left:36px;bottom:-26px;margin:0;padding:14px 30px;background:var(--surface);border:1px solid var(--border);font-size:15px;font-weight:400;letter-spacing:.32em;text-transform:uppercase;color:var(--text)}
</style>
<p class="b-kick">Leadership Award / Seoul 2026</p>
<p class="b-title b-t1">Leading</p>
<p class="b-title b-t2">Light</p>
<p class="b-note">est. 2014 — Seoul</p>
<div class="b-glow"></div>
<div class="b-star"></div>
<div class="b-stem"></div>
<div class="b-base"></div>
<div class="b-row">
<div class="b-fig">
<div class="b-frame"><img data-lumen-image="1" data-lumen-cutout="half"></div>
<p class="b-tag">Lilian Chen</p>
<p class="b-pill">Project Dept</p>
</div>
<div class="b-fig">
<div class="b-frame"><img data-lumen-image="2" data-lumen-cutout="half"></div>
<p class="b-tag">Nora Voss</p>
<p class="b-pill">Project Dept</p>
</div>
</div>
</div>`,
  },
  {
    id: "people/collage-sticky-solo@v1",
    name: "拼贴便签单人页",
    group: "solo",
    brief: "手账式拼贴页：超大堆叠标题压在居中的半身人像上，四周散布便签、胶带、日期章与条形码，适合社媒设计师个人海报。",
    skeleton: `<div class="page" style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)"><style>.page{font-family:var(--font-sans);color:var(--text)}.grid{position:absolute;left:0;top:0;width:1920px;height:1080px;opacity:.38;background-image:repeating-linear-gradient(0deg,var(--border) 0 1px,var(--bg) 1px 78px),repeating-linear-gradient(90deg,var(--border) 0 1px,var(--bg) 1px 78px)}.kicker{position:absolute;text-transform:uppercase;letter-spacing:.34em;font-size:19px;font-weight:500;color:var(--muted)}.kicker-top{left:470px;top:52px}.datepill{position:absolute;right:96px;top:52px;padding:14px 36px;border:2px solid var(--border);border-radius:999px;font-size:26px;font-weight:500;letter-spacing:.06em}.title{position:absolute;left:78px;top:104px;width:860px}.title p{margin:0;font-family:var(--font-display);font-weight:900;font-size:152px;line-height:.86;letter-spacing:-.035em;text-transform:uppercase}.script{position:absolute;left:66px;top:556px;font-family:var(--font-script);font-size:80px;line-height:1;color:var(--accent);transform:rotate(-6deg)}.sticky-dark{position:absolute;left:78px;top:706px;width:430px;padding:36px 34px;background:var(--text);transform:rotate(-2deg)}.sticky-dark p{margin:0;font-size:29px;line-height:1.36;font-weight:600;color:var(--bg)}.tape{position:absolute;background:var(--accent);opacity:.85}.tape-a{left:322px;top:44px;width:150px;height:36px;transform:rotate(-4deg)}.tape-b{left:96px;top:676px;width:150px;height:36px;transform:rotate(-3deg)}.note-q{position:absolute;left:1392px;top:206px;width:436px;padding:38px 34px;background:var(--surface);border:1px solid var(--border);transform:rotate(2.4deg)}.note-q p{margin:0 0 26px 0;font-size:33px;line-height:1.32;font-weight:400}.note-q p:last-child{margin-bottom:0}.note-q .hl{color:var(--accent);font-weight:700}.note-list{position:absolute;left:1408px;top:552px;width:452px;padding:34px;background:var(--accent);transform:rotate(-1.8deg)}.note-list .item{margin:0 0 22px 0;font-size:22px;font-weight:800;letter-spacing:.06em;line-height:1.2;text-transform:uppercase;color:var(--bg)}.note-list .item:last-child{margin-bottom:0}.barcode{position:absolute;left:1620px;top:930px;width:190px;height:62px;opacity:.9;background-image:repeating-linear-gradient(90deg,var(--text) 0 4px,var(--bg) 4px 9px)}.pill{position:absolute;left:78px;bottom:46px;padding:12px 30px;border:2px solid var(--accent);border-radius:999px;font-size:20px;font-weight:600;letter-spacing:.24em;text-transform:uppercase;color:var(--text)}.portrait{position:absolute;left:640px;top:250px;width:640px;height:830px}</style><div class="grid"></div><div class="tape tape-a"></div><p class="kicker kicker-top">Design that connects.</p><div class="datepill">2026 / 05 / 20</div><div class="title"><p>Social</p><p>Media</p><p>Designer</p></div><p class="script">Design with Purpose</p><div class="sticky-dark"><p>Let's create content your audience can't ignore.</p></div><div class="tape tape-b"></div><div class="note-q"><p>What can a <span class="hl">social media</span> designer do?</p><p>What value can I bring to your business?</p></div><div class="note-list"><p class="item">Content that connects</p><p class="item">Design that converts</p><p class="item">Brand that stands out</p></div><div class="barcode"></div><div class="pill">Media poster</div><img class="portrait" data-lumen-image="1" data-lumen-cutout="half"></div>`,
  },
  {
    id: "people/diagonal-band-cast@v1",
    name: "斜带五人头像",
    group: "multi",
    brief: "一条倾斜色带横贯画面，五个人像沿斜线错落排开，每人配一个描边角色标签与竖排淡色人名，适合剧组或团队全员亮相。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.v1-band{position:absolute;left:-160px;top:380px;width:2240px;height:420px;transform:rotate(-6deg);background:var(--surface);border-top:4px solid var(--accent);border-bottom:4px solid var(--accent)}
.v1-kicker{position:absolute;left:80px;top:66px;font-size:17px;font-weight:500;letter-spacing:.44em;text-transform:uppercase;color:var(--muted)}
.v1-t1{position:absolute;left:78px;top:104px;font-family:var(--font-display);font-size:132px;line-height:.92;letter-spacing:-.04em;font-weight:900;color:var(--text)}
.v1-t2{position:absolute;left:78px;top:224px;font-family:var(--font-display);font-size:132px;line-height:.92;letter-spacing:-.04em;font-weight:900;color:var(--text)}
.v1-meta{position:absolute;right:80px;top:74px;text-align:right;font-size:17px;font-weight:300;letter-spacing:.34em;text-transform:uppercase;line-height:2;color:var(--muted)}
.v1-rule{position:absolute;right:80px;top:150px;width:300px;height:1px;background:var(--border)}
.v1-ghost{position:absolute;writing-mode:vertical-rl;font-family:var(--font-display);font-size:76px;font-weight:900;letter-spacing:.06em;line-height:1;color:var(--text);opacity:.08}
.v1-fig{position:absolute;width:300px;height:400px}
.v1-fig img{width:100%;height:100%}
.v1-tag{position:absolute;width:264px;padding:12px 16px;background:var(--bg);border:1px solid var(--accent)}
.v1-tag .k{display:block;font-size:15px;font-weight:700;letter-spacing:.3em;text-transform:uppercase;color:var(--accent)}
.v1-tag .r{display:block;margin-top:8px;font-size:16px;font-weight:300;line-height:1.45;color:var(--muted)}
.v1-note{position:absolute;left:80px;bottom:54px;font-size:17px;font-weight:300;letter-spacing:.3em;text-transform:uppercase;color:var(--muted)}
</style>
<div class="v1-band"></div>
<div class="v1-kicker">RURAL SERIES / SEASON 04</div>
<div class="v1-t1">VILLAGE</div>
<div class="v1-t2">VOICES</div>
<div class="v1-meta">FIVE PORTRAITS<br>12 DEC 2026</div>
<div class="v1-rule"></div>
<div class="v1-ghost" style="left:280px;top:540px">ZHAO SI</div>
<div class="v1-ghost" style="left:640px;top:500px">LIU NENG</div>
<div class="v1-ghost" style="left:1000px;top:455px">WANG YUN</div>
<div class="v1-ghost" style="left:1360px;top:410px">SONG XIAOFENG</div>
<div class="v1-ghost" style="left:1720px;top:370px">TANG JIANJUN</div>
<div class="v1-fig" style="left:60px;top:490px"><img data-lumen-image="1" data-lumen-cutout="head"></div>
<div class="v1-fig" style="left:420px;top:450px"><img data-lumen-image="2" data-lumen-cutout="head"></div>
<div class="v1-fig" style="left:780px;top:405px"><img data-lumen-image="3" data-lumen-cutout="head"></div>
<div class="v1-fig" style="left:1140px;top:360px"><img data-lumen-image="4" data-lumen-cutout="head"></div>
<div class="v1-fig" style="left:1500px;top:320px"><img data-lumen-image="5" data-lumen-cutout="head"></div>
<div class="v1-tag" style="left:50px;top:390px"><span class="k">Plays Liu Xiaoguang</span><span class="r">Father of Zhao Yutian, father-in-law of Liu Ying</span></div>
<div class="v1-tag" style="left:410px;top:350px"><span class="k">Plays Liu Neng</span><span class="r">Father of Liu Ying, keeps the north road shop</span></div>
<div class="v1-tag" style="left:770px;top:305px"><span class="k">Plays Wang Yun</span><span class="r">Elder brother who signs every contract first</span></div>
<div class="v1-tag" style="left:1130px;top:260px"><span class="k">Plays Song Xiaofeng</span><span class="r">Younger brother of Wang Yun, drives the blue tractor</span></div>
<div class="v1-tag" style="left:1490px;top:220px"><span class="k">Plays Xie Guangkun</span><span class="r">Father of Xie Yongqiang, argues about the ditch</span></div>
<div class="v1-note">Cast sheet / five portraits / 2026</div>
</div>`,
  },
  {
    id: "people/zigzag-slab-four@v1",
    name: "折线红块四人",
    group: "multi",
    brief: "四块红色斜切色块横向并列，人像嵌在色块中，块内顶部写名字与角色，块下方补一句短介，适合四人团队或群像档案。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.v2-kicker{position:absolute;left:100px;top:44px;font-size:17px;font-weight:500;letter-spacing:.44em;text-transform:uppercase;color:var(--accent)}
.v2-title{position:absolute;left:98px;top:74px;font-family:var(--font-display);font-size:56px;font-weight:900;letter-spacing:-.02em;color:var(--text)}
.v2-rule{position:absolute;left:100px;top:156px;width:1720px;height:1px;background:var(--border)}
.v2-col{position:absolute;top:0;width:400px;height:1080px}
.v2-slab{position:absolute;left:0;width:400px;background:var(--accent)}
.v2-name{position:absolute;left:40px;font-family:var(--font-display);font-size:44px;font-weight:900;letter-spacing:-.01em;line-height:1;color:var(--bg)}
.v2-role{position:absolute;left:40px;font-size:16px;font-weight:500;letter-spacing:.3em;text-transform:uppercase;color:var(--bg);opacity:.85}
.v2-fig{position:absolute;left:40px;width:340px;height:420px}
.v2-fig img{width:100%;height:100%}
.v2-desc{position:absolute;left:0;width:400px;font-size:18px;font-weight:300;line-height:1.6;color:var(--muted)}
</style>
<div class="v2-kicker">Ensemble / series archive</div>
<div class="v2-title">The Village Cast</div>
<div class="v2-rule"></div>
<div class="v2-col" style="left:100px">
<div class="v2-slab" style="top:170px;height:560px;clip-path:polygon(0 6%,100% 0,100% 100%,0 100%)"></div>
<div class="v2-name" style="top:200px">ZHAO SI</div>
<div class="v2-role" style="top:262px">Plays Liu Xiaoguang</div>
<div class="v2-fig" style="top:300px"><img data-lumen-image="1" data-lumen-cutout="half"></div>
<div class="v2-desc" style="top:760px">Sells wooden combs at the Wednesday market and remembers every family's debts without ever writing them down.</div>
</div>
<div class="v2-col" style="left:540px">
<div class="v2-slab" style="top:240px;height:560px;clip-path:polygon(0 0,100% 6%,100% 100%,0 100%)"></div>
<div class="v2-name" style="top:270px">WANG XIAOLI</div>
<div class="v2-role" style="top:332px">Plays Liu Neng</div>
<div class="v2-fig" style="top:370px"><img data-lumen-image="2" data-lumen-cutout="half"></div>
<div class="v2-desc" style="top:830px">Keeps the only shop on the north road, counting sunflower seeds twice before he hands over the change.</div>
</div>
<div class="v2-col" style="left:980px">
<div class="v2-slab" style="top:170px;height:560px;clip-path:polygon(0 6%,100% 0,100% 100%,0 100%)"></div>
<div class="v2-name" style="top:200px">SONG XIAOFENG</div>
<div class="v2-role" style="top:262px">Plays Wang Yun</div>
<div class="v2-fig" style="top:300px"><img data-lumen-image="3" data-lumen-cutout="half"></div>
<div class="v2-desc" style="top:760px">Drives the blue tractor to the county seat at dawn and brings back news nobody else has heard yet.</div>
</div>
<div class="v2-col" style="left:1420px">
<div class="v2-slab" style="top:240px;height:560px;clip-path:polygon(0 0,100% 6%,100% 100%,0 100%)"></div>
<div class="v2-name" style="top:270px">TANG JIANJUN</div>
<div class="v2-role" style="top:332px">Plays Xie Guangkun</div>
<div class="v2-fig" style="top:370px"><img data-lumen-image="4" data-lumen-cutout="half"></div>
<div class="v2-desc" style="top:830px">Argues about the irrigation ditch every spring and quietly pays for the repairs in October.</div>
</div>
</div>`,
  },
  {
    id: "people/stair-case-exec-cards@v1",
    name: "四人阶梯卡列",
    group: "multi",
    brief: "顶部小标题配四张高低错落的人像卡，名字压在卡片底部，适合管理层或核心成员并列展示",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--accent);overflow:hidden"><style>.ex-head{position:absolute;left:140px;top:110px;display:flex;align-items:center;gap:24px}.ex-bar{width:12px;height:58px;background:var(--brand)}.ex-title{font-family:var(--font-display);font-size:58px;font-weight:800;line-height:1;letter-spacing:-.02em;text-transform:uppercase;color:var(--brand)}.ex-kick{position:absolute;right:142px;top:132px;font-size:15px;font-weight:300;letter-spacing:.4em;text-transform:uppercase;color:var(--brand);opacity:.7}.ex-ring{position:absolute;border:1px solid var(--brand);border-radius:50%;opacity:.16}.ex-card{position:absolute;width:300px;background:var(--surface);overflow:hidden}.ex-card img{width:100%;height:100%;display:block}.ex-cap{position:absolute;left:0;right:0;bottom:0;padding:20px 18px 22px;background:var(--brand)}.ex-name{font-size:27px;font-weight:900;line-height:1.02;letter-spacing:-.01em;text-transform:uppercase;color:var(--text)}.ex-role{margin-top:9px;font-size:12px;font-weight:300;line-height:1.5;letter-spacing:.1em;text-transform:uppercase;color:var(--text);opacity:.72}.ex-foot{position:absolute;left:140px;bottom:52px;font-size:13px;font-weight:300;letter-spacing:.34em;text-transform:uppercase;color:var(--bg);opacity:.55}</style><div class="ex-ring" style="width:820px;height:820px;right:-280px;top:-320px"></div><div class="ex-ring" style="width:520px;height:520px;right:-130px;top:-170px"></div><div class="ex-head"><div class="ex-bar"></div><div class="ex-title">Executive Team</div></div><div class="ex-kick">Annual Board / Seoul 2026</div><div class="ex-foot">Twelve Years On The Road</div><div class="ex-card" style="left:140px;top:340px;height:520px"><img data-lumen-image="1" data-lumen-cutout="half" alt=""><div class="ex-cap"><div class="ex-name">Don<br>Thompson</div><div class="ex-role">Ex President and Chief Executive Officer</div></div></div><div class="ex-card" style="left:586px;top:240px;height:620px"><img data-lumen-image="2" data-lumen-cutout="half" alt=""><div class="ex-cap"><div class="ex-name">Steve<br>Easterbrook</div><div class="ex-role">President and Chief Executive Officer</div></div></div><div class="ex-card" style="left:1032px;top:400px;height:460px"><img data-lumen-image="3" data-lumen-cutout="half" alt=""><div class="ex-cap"><div class="ex-name">Kevin<br>Ozan</div><div class="ex-role">Executive Vice President and Chief Financial Officer</div></div></div><div class="ex-card" style="left:1478px;top:300px;height:560px"><img data-lumen-image="4" data-lumen-cutout="half" alt=""><div class="ex-cap"><div class="ex-name">Chris<br>Stent</div><div class="ex-role">Vice President of Investor Relations</div></div></div></div>`,
  },
  {
    id: "people/hex-mosaic-left-text@v1",
    name: "左文右蜂巢群像",
    group: "multi",
    brief: "左侧竖排栏目说明文字配右侧错落蜂巢式头像群，适合学科、流派或群像式人物合集",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden"><style>.ph-left{position:absolute;left:120px;top:170px;width:540px}.ph-kick{font-size:15px;font-weight:300;letter-spacing:.42em;text-transform:uppercase;color:var(--muted)}.ph-title{margin-top:26px;font-family:var(--font-display);font-size:92px;font-weight:800;line-height:.95;letter-spacing:-.03em;text-transform:uppercase;color:var(--text)}.ph-rule{width:120px;height:3px;background:var(--accent);margin:34px 0 30px}.ph-p{margin:0 0 18px;font-size:17px;font-weight:300;line-height:1.85;color:var(--muted)}.ph-sig{margin-top:16px;font-family:var(--font-script);font-size:30px;color:var(--text)}.ph-hex{position:absolute;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%);background:var(--surface);overflow:hidden}.ph-hex img{width:100%;height:100%;display:block}</style><div class="ph-left"><div class="ph-kick">Portrait Series / 1927</div><div class="ph-title">Minds<br>That Moved</div><div class="ph-rule"></div><p class="ph-p">People who spend their lives measuring what cannot be seen: light bending past a star, a particle that exists for a billionth of a second.</p><p class="ph-p">They work at observatories, in basements, on ships; they argue over notebooks and rebuild the same apparatus eleven times before it holds.</p><p class="ph-p">Some never touch a wire, others polish one lens for forty years and call it a career well spent.</p><div class="ph-sig">Collected at the Institute, winter</div></div><div class="ph-hex" style="left:940px;top:40px;width:340px;height:392px"><img data-lumen-image="1" data-lumen-cutout="head" alt=""></div><div class="ph-hex" style="left:1600px;top:60px;width:360px;height:416px"><img data-lumen-image="2" data-lumen-cutout="head" alt=""></div><div class="ph-hex" style="left:720px;top:330px;width:400px;height:462px"><img data-lumen-image="3" data-lumen-cutout="head" alt=""></div><div class="ph-hex" style="left:1180px;top:420px;width:420px;height:485px"><img data-lumen-image="4" data-lumen-cutout="head" alt=""></div><div class="ph-hex" style="left:1760px;top:400px;width:340px;height:392px"><img data-lumen-image="5" data-lumen-cutout="head" alt=""></div><div class="ph-hex" style="left:740px;top:800px;width:320px;height:370px"><img data-lumen-image="6" data-lumen-cutout="head" alt=""></div><div class="ph-hex" style="left:1120px;top:880px;width:340px;height:392px"><img data-lumen-image="7" data-lumen-cutout="head" alt=""></div><div class="ph-hex" style="left:1560px;top:720px;width:330px;height:381px"><img data-lumen-image="8" data-lumen-cutout="head" alt=""></div></div>`,
  },
  {
    id: "people/five-column-crest-row@v1",
    name: "五人并列尖顶框",
    group: "multi",
    brief: "顶部一条巨标题压在五个人像之上，五人等宽并列于尖顶展示框内，下方各挂姓名与位置，底部通栏机构条——适合战队、主创阵容、五人小组。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden;">
<style>
.l1-head{position:absolute;left:74px;top:18px;width:1780px;font-family:var(--font-display);font-size:166px;font-weight:900;line-height:.88;letter-spacing:-.035em;text-transform:uppercase;color:var(--brand);opacity:.5;}
.l1-row{position:absolute;left:70px;top:140px;width:1780px;height:800px;display:flex;gap:46px;align-items:flex-start;}
.l1-person{flex:1;display:flex;flex-direction:column;align-items:center;}
.l1-frame{position:relative;width:100%;height:680px;background:var(--surface);clip-path:polygon(50% 0,100% 15%,100% 100%,0 100%,0 15%);overflow:hidden;}
.l1-tint{position:absolute;inset:0;background:linear-gradient(180deg,var(--brand) 0%,transparent 72%);opacity:.42;}
.l1-frame img{position:absolute;inset:0;width:100%;height:100%;object-position:bottom center;}
.l1-fade{position:absolute;left:0;right:0;bottom:0;height:240px;background:linear-gradient(180deg,transparent,var(--bg));opacity:.92;}
.l1-name{margin-top:28px;font-size:34px;font-weight:700;letter-spacing:.24em;text-transform:uppercase;color:var(--text);}
.l1-role{margin-top:10px;font-size:15px;font-weight:300;letter-spacing:.36em;text-transform:uppercase;color:var(--muted);}
.l1-bar{position:absolute;left:0;bottom:0;width:1920px;height:112px;background:var(--surface);border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:0 74px;box-sizing:border-box;}
.l1-bar p{font-size:26px;font-weight:300;letter-spacing:.42em;text-transform:uppercase;color:var(--muted);}
.l1-stripes{width:360px;height:44px;background:repeating-linear-gradient(115deg,var(--accent) 0 9px,transparent 9px 22px);opacity:.55;transform:skewX(-24deg);}
</style>
<p class="l1-head">FOR LOVE WE RISE</p>
<div class="l1-row">
<div class="l1-person">
<div class="l1-frame"><div class="l1-tint"></div><img data-lumen-image="1" data-lumen-cutout="half"><div class="l1-fade"></div></div>
<p class="l1-name">RYO KIMURA</p><p class="l1-role">Mid Lane</p>
</div>
<div class="l1-person">
<div class="l1-frame"><div class="l1-tint"></div><img data-lumen-image="2" data-lumen-cutout="half"><div class="l1-fade"></div></div>
<p class="l1-name">DANI VOSS</p><p class="l1-role">Top Lane</p>
</div>
<div class="l1-person">
<div class="l1-frame"><div class="l1-tint"></div><img data-lumen-image="3" data-lumen-cutout="half"><div class="l1-fade"></div></div>
<p class="l1-name">LEO PARK</p><p class="l1-role">Marksman</p>
</div>
<div class="l1-person">
<div class="l1-frame"><div class="l1-tint"></div><img data-lumen-image="4" data-lumen-cutout="half"><div class="l1-fade"></div></div>
<p class="l1-name">NOAH SATO</p><p class="l1-role">Jungle</p>
</div>
<div class="l1-person">
<div class="l1-frame"><div class="l1-tint"></div><img data-lumen-image="5" data-lumen-cutout="half"><div class="l1-fade"></div></div>
<p class="l1-name">KAI TANAKA</p><p class="l1-role">Support</p>
</div>
</div>
<div class="l1-bar"><p>Roster / 2026 Season</p><div class="l1-stripes"></div></div>
</div>`,
  },
  {
    id: "people/three-persona-cards@v1",
    name: "左栏说明三人卡",
    group: "multi",
    brief: "左侧窄栏放栏目名、大标题与说明，右侧三张等宽人像卡并列，卡片下半是姓名、年龄城市与需求痛点两段小字——适合用户画像、三类代表客户、人物分析。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden;">
<style>
.l2-left{position:absolute;left:0;top:0;width:540px;height:1080px;background:var(--surface);padding:96px 60px 68px;box-sizing:border-box;display:flex;flex-direction:column;}
.l2-kicker{font-size:16px;font-weight:400;letter-spacing:.42em;text-transform:uppercase;color:var(--muted);}
.l2-tl{margin-top:28px;font-family:var(--font-display);font-size:96px;font-weight:900;line-height:.9;letter-spacing:-.03em;text-transform:uppercase;color:var(--text);}
.l2-body{margin-top:36px;font-size:18px;font-weight:300;line-height:1.75;color:var(--muted);}
.l2-arrow{margin-top:auto;width:52px;height:52px;border-right:2px solid var(--accent);border-bottom:2px solid var(--accent);transform:rotate(-45deg);opacity:.9;}
.l2-note{margin-top:40px;font-size:13px;font-weight:300;line-height:1.7;letter-spacing:.05em;color:var(--muted);opacity:.72;}
.l2-cards{position:absolute;left:570px;top:90px;width:1320px;height:900px;display:flex;gap:22px;}
.l2-card{position:relative;flex:1;display:flex;flex-direction:column;background:var(--surface);border-radius:4px;overflow:hidden;}
.l2-imgwrap{position:relative;height:480px;flex:none;background:var(--border);}
.l2-imgwrap img{position:absolute;inset:0;width:100%;height:100%;object-position:bottom center;}
.l2-grad{position:absolute;left:0;right:0;bottom:0;height:170px;background:linear-gradient(180deg,transparent,var(--bg));opacity:.85;}
.l2-info{flex:1;padding:26px 30px 30px;box-sizing:border-box;background:var(--surface);}
.l2-name{font-size:46px;font-weight:900;line-height:1;letter-spacing:-.01em;text-transform:uppercase;color:var(--text);}
.l2-meta{margin-top:12px;font-size:15px;font-weight:300;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);}
.l2-rule{margin:22px 0;height:1px;background:var(--border);}
.l2-label{font-size:12px;font-weight:700;letter-spacing:.34em;text-transform:uppercase;color:var(--accent);}
.l2-txt{margin-top:8px;margin-bottom:18px;font-size:15px;font-weight:300;line-height:1.6;color:var(--muted);}
</style>
<div class="l2-left">
<p class="l2-kicker">UI / UX</p>
<p class="l2-tl">USER<br>PROFILE</p>
<p class="l2-body">Three recurring users shape every decision we make: the one who waits, the one who worries, and the one who carries the whole family.</p>
<div class="l2-arrow"></div>
<p class="l2-note">Note: the mid-career group spans ages 35 to 55 and overlaps with the two younger segments. Seoul, Berlin and Lisbon interviews, March 2026.</p>
</div>
<div class="l2-cards">
<div class="l2-card">
<div class="l2-imgwrap"><img data-lumen-image="1" data-lumen-cutout="half"><div class="l2-grad"></div></div>
<div class="l2-info">
<p class="l2-name">JUN PARK</p>
<p class="l2-meta">24 · Seoul · Product Designer</p>
<div class="l2-rule"></div>
<p class="l2-label">Needs</p>
<p class="l2-txt">Wants one clear answer before the pharmacy closes, not a list of ten options.</p>
<p class="l2-label">Pain</p>
<p class="l2-txt">Reads five sources, trusts none, and quits before buying anything.</p>
</div>
</div>
<div class="l2-card">
<div class="l2-imgwrap"><img data-lumen-image="2" data-lumen-cutout="half"><div class="l2-grad"></div></div>
<div class="l2-info">
<p class="l2-name">MIA LARSEN</p>
<p class="l2-meta">30 · Berlin · Brand Strategist</p>
<div class="l2-rule"></div>
<p class="l2-label">Needs</p>
<p class="l2-txt">Checks ingredients twice and keeps a running note of what worked last winter.</p>
<p class="l2-label">Pain</p>
<p class="l2-txt">Prices shift weekly and the dosage on the box never matches the label online.</p>
</div>
</div>
<div class="l2-card">
<div class="l2-imgwrap"><img data-lumen-image="3" data-lumen-cutout="half"><div class="l2-grad"></div></div>
<div class="l2-info">
<p class="l2-name">MARTIN REYES</p>
<p class="l2-meta">41 · Lisbon · Project Lead</p>
<div class="l2-rule"></div>
<p class="l2-label">Needs</p>
<p class="l2-txt">Buys for his parents and his daughter on the same trip, usually after nine at night.</p>
<p class="l2-label">Pain</p>
<p class="l2-txt">Has no time to compare, so he reorders the same box for years without checking.</p>
</div>
</div>
</div>
</div>`,
  },
  {
    id: "people/brand-field-left-copy-portrait@v1",
    name: "橙底左文右像浮标",
    group: "solo",
    brief: "整幅品牌色铺底，左侧姓名加履历条目与荣誉章，右侧半身像挂两枚漂浮标签，手写签名压在人像上。",
    skeleton: `<style>
.p1{font-family:var(--font-sans)}
.p1-blob{position:absolute;border-radius:50%;background:var(--bg);opacity:.09}
.p1-kick{position:absolute;left:124px;top:112px;font-size:19px;font-weight:400;letter-spacing:.42em;text-transform:uppercase;color:var(--bg);opacity:.8}
.p1-name{position:absolute;left:118px;top:186px;font-family:var(--font-display);font-size:172px;font-weight:900;line-height:.88;letter-spacing:-.04em;color:var(--bg)}
.p1-meta{position:absolute;left:124px;top:400px;display:flex;gap:46px;font-size:19px;font-weight:400;letter-spacing:.2em;text-transform:uppercase;color:var(--bg);opacity:.78}
.p1-meta span{display:flex;align-items:center;gap:14px}
.p1-dot{width:7px;height:7px;border-radius:50%;background:var(--bg)}
.p1-sec{position:absolute;left:124px;font-size:25px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:var(--bg)}
.p1-rule{position:absolute;left:126px;width:62px;height:3px;background:var(--bg);opacity:.85}
.p1-list{position:absolute;left:124px;width:800px}
.p1-list p{position:relative;margin:0 0 15px;padding-left:28px;font-size:20px;font-weight:300;line-height:1.55;color:var(--bg);opacity:.92}
.p1-list p::before{content:"";position:absolute;left:0;top:15px;width:10px;height:1px;background:var(--bg)}
.p1-awards{position:absolute;left:124px;top:794px;display:grid;grid-template-columns:repeat(2,320px);gap:20px 70px}
.p1-award{display:flex;align-items:center;gap:16px}
.p1-ring{flex:none;width:46px;height:46px;border-radius:50%;border:1px solid var(--bg);opacity:.75}
.p1-award p{margin:0;font-size:17px;font-weight:400;line-height:1.35;color:var(--bg);opacity:.88}
.p1-tag{position:absolute;padding:12px 24px;background:var(--surface);border:1px solid var(--border);color:var(--text);font-size:19px;font-weight:500;letter-spacing:.06em;z-index:3}
.p1-sign{position:absolute;left:1096px;top:748px;font-family:var(--font-script);font-size:158px;font-weight:400;line-height:1;color:var(--bg);opacity:.82;transform:rotate(-11deg);z-index:3}
.p1-portrait{position:absolute;left:1040px;top:118px;width:762px;height:934px;z-index:2}
</style>
<div class="p1" style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--brand)">
<div class="p1-blob" style="left:1400px;top:-170px;width:700px;height:700px"></div>
<div class="p1-blob" style="left:-160px;top:720px;width:520px;height:520px;opacity:.06"></div>
<div class="p1-kick">Portrait Series / 2026</div>
<div class="p1-name">LEI JUN</div>
<div class="p1-meta"><span><span class="p1-dot"></span>Born 12 Dec 1969</span><span><span class="p1-dot"></span>Wuhan, Hubei</span></div>
<img class="p1-portrait" data-lumen-image="1" data-lumen-cutout="half">
<div class="p1-tag" style="left:960px;top:252px">Founder, Chairman &amp; CEO</div>
<div class="p1-tag" style="left:1150px;top:352px">Chairman of Kingsoft</div>
<div class="p1-sign">Leijun</div>
<div class="p1-sec" style="top:492px">Career</div>
<div class="p1-rule" style="top:536px"></div>
<div class="p1-list" style="top:566px">
<p>Co-founded a handset company in a rented Beijing office in 2010.</p>
<p>Pushed hardware margins down to four percent across the whole line.</p>
<p>Took the company public and into the Fortune Global 500 by 2019.</p>
</div>
<div class="p1-sec" style="top:726px">Honours</div>
<div class="p1-rule" style="top:770px"></div>
<div class="p1-awards">
<div class="p1-award"><div class="p1-ring"></div><p>Business Leader of the Year</p></div>
<div class="p1-award"><div class="p1-ring"></div><p>Top Ten in China IT</p></div>
<div class="p1-award"><div class="p1-ring"></div><p>Ten Great Philanthropists</p></div>
<div class="p1-award"><div class="p1-ring"></div><p>Most Innovative Founder</p></div>
</div>
</div>`,
  },
  {
    id: "people/light-blocks-portrait-nameplate@v1",
    name: "白底色块右像名牌",
    group: "solo",
    brief: "浅底页面，左侧姓名配条目式经历与圆形年份奖章，右侧人像压在几何色块上，底部压一条名牌。",
    skeleton: `<style>
.p2{font-family:var(--font-sans)}
.p2-bar{position:absolute;left:110px;top:88px;width:7px;height:44px;background:var(--accent)}
.p2-head{position:absolute;left:136px;top:94px;font-size:30px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--text)}
.p2-pill{position:absolute;left:1450px;top:86px;display:flex;align-items:center;gap:16px;padding:12px 30px;border:1px solid var(--border);border-radius:28px;font-size:17px;font-weight:400;letter-spacing:.26em;text-transform:uppercase;color:var(--muted)}
.p2-pillr{width:16px;height:16px;border-radius:50%;border:2px solid var(--muted)}
.p2-name{position:absolute;left:150px;top:262px;display:flex;align-items:baseline;gap:26px}
.p2-name p{margin:0;font-family:var(--font-display);font-size:106px;font-weight:900;line-height:1;letter-spacing:-.03em;color:var(--text)}
.p2-name span{font-size:20px;font-weight:400;letter-spacing:.42em;text-transform:uppercase;color:var(--muted)}
.p2-list{position:absolute;left:154px;top:432px;width:820px}
.p2-list p{position:relative;margin:0 0 20px;padding-left:30px;font-size:21px;font-weight:300;line-height:1.6;color:var(--text);opacity:.85}
.p2-list p::before{content:"";position:absolute;left:0;top:15px;width:12px;height:2px;background:var(--accent)}
.p2-awards{position:absolute;left:154px;top:720px;display:flex;gap:80px}
.p2-award{display:flex;align-items:center;gap:20px;width:360px}
.p2-year{flex:none;width:68px;height:68px;border-radius:50%;border:1px solid var(--accent);display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:700;letter-spacing:.04em;color:var(--accent)}
.p2-award p{margin:0;font-size:19px;font-weight:400;line-height:1.45;color:var(--text);opacity:.8}
.p2-block{position:absolute;background:var(--accent)}
.p2-portrait{position:absolute;left:1076px;top:158px;width:704px;height:790px;z-index:2}
.p2-plate{position:absolute;left:1178px;top:796px;width:540px;height:130px;background:var(--accent);z-index:3;display:flex;flex-direction:column;justify-content:center;gap:6px;padding-left:42px;box-sizing:border-box}
.p2-plate p{margin:0;font-family:var(--font-display);font-size:44px;font-weight:900;line-height:1.05;letter-spacing:.02em;color:var(--bg)}
.p2-plate span{font-size:17px;font-weight:400;letter-spacing:.34em;text-transform:uppercase;color:var(--bg);opacity:.85}
</style>
<div class="p2" style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<div class="p2-bar"></div>
<div class="p2-head">The File / No.01</div>
<div class="p2-pill"><span class="p2-pillr"></span>Practice Index 2026</div>
<div class="p2-name"><p>HEYICHEN</p><span>Arbitration Counsel</span></div>
<div class="p2-list">
<p>Handled cross-border arbitration filings across eight jurisdictions.</p>
<p>Spent four years as regional executive partner in Singapore.</p>
<p>Became managing partner of a US firm practice in 2016.</p>
<p>Sat as arbitrator on eleven commercial disputes.</p>
</div>
<div class="p2-awards">
<div class="p2-award"><div class="p2-year">2009</div><p>Outstanding practitioner of the year</p></div>
<div class="p2-award"><div class="p2-year">2011</div><p>Leading arbitrator, southern region</p></div>
</div>
<div class="p2-block" style="left:1010px;top:236px;width:280px;height:520px;opacity:.12"></div>
<div class="p2-block" style="left:1352px;top:150px;width:452px;height:640px"></div>
<div class="p2-block" style="left:1704px;top:120px;width:88px;height:88px;opacity:.3"></div>
<img class="p2-portrait" data-lumen-image="1" data-lumen-cutout="half">
<div class="p2-plate"><p>HEYICHEN</p><span>Managing Partner</span></div>
</div>`,
  },
  {
    id: "people/four-tall-portrait-band@v1",
    name: "四人立像长条",
    group: "multi",
    brief: "上方居中双菱形标题，下方四张等高半身立像横向并列，底部压深色渐变叠名字、职位与短介，适合创始团队或嘉宾阵容。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.b-head{position:absolute;left:0;top:66px;width:1920px;text-align:center}
.b-titlerow{display:flex;align-items:center;justify-content:center;gap:26px}
.b-diamond{width:11px;height:11px;background:var(--accent);transform:rotate(45deg)}
.b-title{font-family:var(--font-display);font-size:76px;font-weight:900;letter-spacing:-.03em;line-height:1;color:var(--text);text-transform:uppercase}
.b-sub{font-size:13px;letter-spacing:.44em;text-transform:uppercase;color:var(--muted);margin-top:20px}
.b-row{position:absolute;left:0;top:212px;width:1920px;height:868px;display:flex}
.b-col{position:relative;flex:1 1 0;min-width:0;overflow:hidden}
.b-col img{position:absolute;left:0;top:0;width:100%;height:100%}
.b-scrim{position:absolute;left:0;bottom:0;width:100%;height:62%;background:linear-gradient(to top,var(--bg) 0%,var(--bg) 26%,transparent 100%)}
.b-info{position:absolute;left:38px;right:38px;bottom:52px}
.b-name{font-family:var(--font-display);font-size:42px;font-weight:900;letter-spacing:-.01em;line-height:1;color:var(--text);text-transform:uppercase}
.b-role{font-size:14px;letter-spacing:.26em;text-transform:uppercase;color:var(--accent);margin-top:14px}
.b-bio{font-size:15px;font-weight:300;line-height:1.75;color:var(--muted);margin-top:20px}
.b-line{position:absolute;top:212px;width:1px;height:868px;background:var(--border)}
</style>
<div class="b-head"><div class="b-titlerow"><span class="b-diamond"></span><span class="b-title">Behind the Work</span><span class="b-diamond"></span></div><div class="b-sub">Team Introduction</div></div>
<div class="b-row">
<div class="b-col"><img data-lumen-image="1" data-lumen-cutout="half"><div class="b-scrim"></div><div class="b-info"><div class="b-name">JULIAN REYES</div><div class="b-role">Founder</div><div class="b-bio">Julian has built four studios in twelve years and still lights every set himself. He keeps a notebook of each location scouting trip since 2014.</div></div></div>
<div class="b-col"><img data-lumen-image="2" data-lumen-cutout="half"><div class="b-scrim"></div><div class="b-info"><div class="b-name">MARCUS OYELARAN</div><div class="b-role">Chief Executive</div><div class="b-bio">Marcus ran the Lisbon office for six years before taking the chair. He signs off on budgets at noon and shoots personal work on Sundays.</div></div></div>
<div class="b-col"><img data-lumen-image="3" data-lumen-cutout="half"><div class="b-scrim"></div><div class="b-info"><div class="b-name">NAOMI FIELDS</div><div class="b-role">Creative Director</div><div class="b-bio">Naomi drew the first storyboard for this project on a napkin in Seoul. She has shipped over twenty campaigns and never uses stock imagery.</div></div></div>
<div class="b-col"><img data-lumen-image="4" data-lumen-cutout="half"><div class="b-scrim"></div><div class="b-info"><div class="b-name">ELIAS THORNE</div><div class="b-role">Head of Production</div><div class="b-bio">Elias schedules crews across three time zones and has never missed a delivery date. He collects vintage lenses and prints contact sheets by hand.</div></div></div>
</div>
<div class="b-line" style="left:480px"></div>
<div class="b-line" style="left:960px"></div>
<div class="b-line" style="left:1440px"></div>
</div>`,
  },
  {
    id: "people/five-circle-roster-row@v1",
    name: "五圆环列居中",
    group: "multi",
    brief: "白色页面上五个圆头像横向居中排开，中间一个放大并用圆钮箭头指认，下方跟随姓名职务与整段说明，适合五人团队或栏目成员一览。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden"><style>.l1-head{position:absolute;left:120px;top:92px;display:flex;align-items:center;gap:26px}.l1-bar{width:98px;height:40px;background:var(--brand)}.l1-div{width:3px;height:60px;background:var(--text);opacity:.55}.l1-title{font-family:var(--font-display);font-size:64px;font-weight:900;letter-spacing:-.02em;line-height:1;color:var(--text);margin:0}.l1-sub{font-size:13px;font-weight:400;letter-spacing:.34em;text-transform:uppercase;color:var(--muted);margin:12px 0 0}.l1-row{position:absolute;left:0;right:0;top:336px;display:flex;justify-content:center;align-items:center;gap:30px}.l1-p{display:flex;flex-direction:column;align-items:center;width:236px}.l1-ring{width:196px;height:196px;border-radius:50%;overflow:hidden;background:var(--surface);border:1px solid var(--border);box-sizing:border-box}.l1-ring-mid{width:286px;height:286px;border-radius:50%;overflow:hidden;background:var(--surface);border:6px solid var(--accent);box-sizing:border-box}.l1-ring img,.l1-ring-mid img{width:100%;height:100%;display:block}.l1-name{font-size:27px;font-weight:700;letter-spacing:.02em;color:var(--text);margin:24px 0 0}.l1-role{font-size:12px;font-weight:400;letter-spacing:.28em;text-transform:uppercase;color:var(--muted);margin:10px 0 0}.l1-arrow{width:54px;height:54px;border-radius:50%;background:var(--accent);color:var(--bg);font-size:26px;font-weight:700;display:flex;align-items:center;justify-content:center;flex:0 0 auto}.l1-body{position:absolute;left:50%;transform:translateX(-50%);top:790px;width:1180px;text-align:center;font-size:17px;font-weight:300;line-height:1.85;color:var(--muted);margin:0}.l1-corner{position:absolute;right:-180px;bottom:-180px;width:560px;height:560px;background:var(--brand);opacity:.12;transform:rotate(45deg)}.l1-corner-line{position:absolute;right:-120px;bottom:-120px;width:520px;height:3px;background:var(--accent);opacity:.5;transform:rotate(-45deg)}</style><div class="l1-head"><span class="l1-bar"></span><span class="l1-div"></span><span><p class="l1-title">WHO WALKS WITH US</p><p class="l1-sub">Atmospheric Project / Portrait Series 2026</p></span></div><div class="l1-row"><div class="l1-p"><div class="l1-ring"><img data-lumen-image="1" data-lumen-cutout="head" alt=""></div><p class="l1-name">HANA MORI</p><p class="l1-role">Project Director</p></div><div class="l1-p"><div class="l1-ring"><img data-lumen-image="2" data-lumen-cutout="head" alt=""></div><p class="l1-name">AKIRA KATO</p><p class="l1-role">Field Producer</p></div><span class="l1-arrow">←</span><div class="l1-p"><div class="l1-ring-mid"><img data-lumen-image="3" data-lumen-cutout="half" alt=""></div><p class="l1-name">LEE JUN</p><p class="l1-role">Chief Photographer</p></div><span class="l1-arrow">→</span><div class="l1-p"><div class="l1-ring"><img data-lumen-image="4" data-lumen-cutout="head" alt=""></div><p class="l1-name">MINA SEO</p><p class="l1-role">Sound Recordist</p></div><div class="l1-p"><div class="l1-ring"><img data-lumen-image="5" data-lumen-cutout="head" alt=""></div><p class="l1-name">TOMAS REID</p><p class="l1-role">Archive Editor</p></div></div><p class="l1-body">Five of us filed the last report at three in the morning, then walked out of the studio into the rain together.</p><div class="l1-corner"></div><div class="l1-corner-line"></div></div>`,
  },
  {
    id: "people/four-column-dark-portrait@v1",
    name: "四人并排深色",
    group: "multi",
    brief: "深色底上四张半身像横向并排顶天立地，底部叠姓名、职务与短介，上方是带菱饰的居中大标题与手写小字，适合创始团队或核心成员页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden"><style>.l2-head{position:absolute;left:0;right:0;top:76px;text-align:center}.l2-titlerow{display:flex;align-items:center;justify-content:center;gap:30px}.l2-dia{width:13px;height:13px;background:var(--accent);transform:rotate(45deg)}.l2-title{font-family:var(--font-display);font-size:76px;font-weight:900;letter-spacing:-.03em;line-height:1;color:var(--text);margin:0}.l2-script{font-family:var(--font-script);font-size:30px;font-weight:400;color:var(--muted);letter-spacing:.06em;margin:16px 0 0}.l2-rule{position:absolute;left:50%;transform:translateX(-50%);top:238px;width:1720px;height:1px;background:var(--border)}.l2-row{position:absolute;left:100px;top:286px;width:1720px;height:714px;display:flex;gap:20px}.l2-col{flex:1 1 0;position:relative;overflow:hidden;background:var(--surface)}.l2-col img{position:absolute;left:0;top:0;width:100%;height:100%}.l2-cap{position:absolute;left:0;right:0;bottom:0;padding:0 26px 30px;background:linear-gradient(to top,var(--bg),transparent 82%)}.l2-name{font-size:32px;font-weight:900;letter-spacing:.01em;color:var(--text);margin:0}.l2-role{font-size:12px;font-weight:600;letter-spacing:.32em;text-transform:uppercase;color:var(--accent);margin:10px 0 0}.l2-desc{font-size:14px;font-weight:300;line-height:1.6;color:var(--muted);margin:14px 0 0}</style><div class="l2-head"><div class="l2-titlerow"><span class="l2-dia"></span><p class="l2-title">THE ONES WHO STAYED</p><span class="l2-dia"></span></div><p class="l2-script">four hands, one long winter</p></div><div class="l2-rule"></div><div class="l2-row"><div class="l2-col"><img data-lumen-image="1" data-lumen-cutout="half" alt=""><div class="l2-cap"><p class="l2-name">MARCUS REID</p><p class="l2-role">CEO</p><p class="l2-desc">Signed the lease on the old print house and still checks the roof himself every Monday morning.</p></div></div><div class="l2-col"><img data-lumen-image="2" data-lumen-cutout="half" alt=""><div class="l2-cap"><p class="l2-name">ELENA VOSS</p><p class="l2-role">Founder</p><p class="l2-desc">Ran the Lisbon office for nine years before moving the whole archive north in a single van.</p></div></div><div class="l2-col"><img data-lumen-image="3" data-lumen-cutout="half" alt=""><div class="l2-cap"><p class="l2-name">JAE WON PARK</p><p class="l2-role">Co-Founder</p><p class="l2-desc">Draws every layout by hand first, then rebuilds it on screen late at night with the radio on.</p></div></div><div class="l2-col"><img data-lumen-image="4" data-lumen-cutout="half" alt=""><div class="l2-cap"><p class="l2-name">SOFIA LIND</p><p class="l2-role">Creative Director</p><p class="l2-desc">Shot the winter series in Oslo and keeps the contact sheets pinned above her desk to this day.</p></div></div></div></div>`,
  },
  {
    id: "people/skewed-band-portraits@v1",
    name: "斜带四人并置",
    group: "multi",
    brief: "四条斜切图带横向并列，底部压深色色块放姓名与短介，适合劳动者、群像主题封面。",
    skeleton: `<div class="lb1-page"><style>.lb1-page{width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);font-family:var(--font-sans);color:var(--text)}.lb1-band{position:absolute;top:-70px;height:1220px;width:540px;transform:skewX(-10deg);overflow:hidden;background:var(--surface)}.lb1-band img{position:absolute;left:-14%;top:-12%;width:128%;height:128%;transform:skewX(10deg)}.lb1-shade{position:absolute;left:-12%;bottom:-30px;width:124%;height:58%;background:linear-gradient(to top,var(--accent),transparent);opacity:.9}.lb1-cap{position:absolute;bottom:140px;width:360px;z-index:4}.lb1-kick{font-size:12px;font-weight:400;letter-spacing:.36em;text-transform:uppercase;opacity:.75;margin:0 0 16px}.lb1-title{font-family:var(--font-display);font-size:56px;font-weight:900;line-height:1;letter-spacing:-.02em;margin:0 0 18px}.lb1-body{font-size:15px;font-weight:300;line-height:1.6;margin:0;opacity:.85}.lb1-top{position:absolute;left:64px;top:56px;font-size:12px;letter-spacing:.44em;text-transform:uppercase;opacity:.8;z-index:5}</style><div class="lb1-band" style="left:-30px"><img data-lumen-image="1" data-lumen-cutout="half"><div class="lb1-shade"></div></div><div class="lb1-band" style="left:450px"><img data-lumen-image="2" data-lumen-cutout="half"><div class="lb1-shade"></div></div><div class="lb1-band" style="left:930px"><img data-lumen-image="3" data-lumen-cutout="half"><div class="lb1-shade"></div></div><div class="lb1-band" style="left:1410px"><img data-lumen-image="4" data-lumen-cutout="half"><div class="lb1-shade"></div></div><div class="lb1-top">ASIAN PHOTOGRAPHY / ISSUE 12</div><div class="lb1-cap" style="left:60px"><p class="lb1-kick">Marcus Reid / Shift 04</p><p class="lb1-title">SALT AND DUST</p><p class="lb1-body">Hauls the last crate ashore at three in the afternoon, boots wet, radio still crackling against his hip.</p></div><div class="lb1-cap" style="left:540px"><p class="lb1-kick">Elias Barros / Site 12</p><p class="lb1-title">THE SIX AM CREW</p><p class="lb1-body">Checks the beam alignment twice before the crane swings in over the east lot, helmet tilted back.</p></div><div class="lb1-cap" style="left:1020px"><p class="lb1-kick">Naomi Kim / Ward 3</p><p class="lb1-title">STILL ON CALL</p><p class="lb1-body">Twelve hours into the night shift she rewrites the handover notes one more time, stethoscope still warm.</p></div><div class="lb1-cap" style="left:1500px"><p class="lb1-kick">Park Ji Hoon / Road 9</p><p class="lb1-title">AFTER THE RAIN</p><p class="lb1-body">Sweeps the crossing clean before the first buses roll through the flooded street at six forty.</p></div></div>`,
  },
  {
    id: "people/hex-crew-timeline@v1",
    name: "六边头像时间轴",
    group: "multi",
    brief: "五个六边形头像横向排开，下方接一条时间轴写着时间与议题，适合会议流程与团队页。",
    skeleton: `<div class="t2-page"><style>.t2-page{width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);font-family:var(--font-sans);color:var(--text)}.t2-head{position:absolute;left:128px;top:88px}.t2-kicker{font-size:12px;letter-spacing:.44em;text-transform:uppercase;color:var(--muted);margin:0 0 24px}.t2-title{font-size:96px;font-weight:900;line-height:.94;letter-spacing:-.04em;color:var(--accent);margin:0}.t2-sub{font-size:22px;font-weight:300;line-height:1.5;color:var(--muted);margin:24px 0 0;max-width:660px}.t2-meta{position:absolute;right:128px;top:104px;display:flex;gap:14px}.t2-meta span{font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:var(--muted);border:1px solid var(--border);padding:9px 16px}.t2-people{position:absolute;left:130px;right:130px;top:296px;display:flex;justify-content:space-between}.t2-col{width:300px;text-align:center}.t2-hex{width:190px;height:216px;margin:0 auto;background:var(--accent);padding:3px;clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)}.t2-hexin{position:relative;width:100%;height:100%;overflow:hidden;background:var(--surface);clip-path:polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)}.t2-hexin img{position:absolute;left:0;top:0;width:100%;height:100%}.t2-name{font-size:30px;font-weight:800;letter-spacing:-.01em;margin:34px 0 0}.t2-role{font-size:14px;font-weight:400;letter-spacing:.16em;text-transform:uppercase;color:var(--muted);margin:12px 0 0}.t2-times{position:absolute;left:130px;right:130px;top:812px}.t2-line{position:absolute;left:150px;right:150px;top:6px;height:1px;background:var(--border)}.t2-row{position:relative;display:flex;justify-content:space-between}.t2-t{width:300px;text-align:center}.t2-dot{display:block;width:11px;height:11px;border-radius:50%;background:var(--accent);margin:0 auto}.t2-time{font-size:22px;font-weight:800;letter-spacing:.02em;color:var(--accent);margin:24px 0 0}.t2-topic{font-size:13px;font-weight:300;line-height:1.55;color:var(--muted);margin:10px 0 0;padding:0 20px}</style><div class="t2-head"><p class="t2-kicker">Annual Review / Seoul 2026</p><p class="t2-title">WHO RUNS THE DAY</p><p class="t2-sub">Five sessions, five owners, one long afternoon in the same room.</p></div><div class="t2-meta"><span>Agenda</span><span>Day 192</span></div><div class="t2-people"><div class="t2-col"><div class="t2-hex"><div class="t2-hexin"><img data-lumen-image="1" data-lumen-cutout="half"></div></div><p class="t2-name">JULIAN PARK</p><p class="t2-role">Founder &amp; CEO</p></div><div class="t2-col"><div class="t2-hex"><div class="t2-hexin"><img data-lumen-image="2" data-lumen-cutout="half"></div></div><p class="t2-name">MINA SEO</p><p class="t2-role">Head of Production</p></div><div class="t2-col"><div class="t2-hex"><div class="t2-hexin"><img data-lumen-image="3" data-lumen-cutout="half"></div></div><p class="t2-name">DAVID CHOI</p><p class="t2-role">Finance Lead</p></div><div class="t2-col"><div class="t2-hex"><div class="t2-hexin"><img data-lumen-image="4" data-lumen-cutout="half"></div></div><p class="t2-name">AYA KURODA</p><p class="t2-role">Brand Partnerships</p></div><div class="t2-col"><div class="t2-hex"><div class="t2-hexin"><img data-lumen-image="5" data-lumen-cutout="half"></div></div><p class="t2-name">LEO MARTIN</p><p class="t2-role">Operations Director</p></div></div><div class="t2-times"><div class="t2-line"></div><div class="t2-row"><div class="t2-t"><span class="t2-dot"></span><p class="t2-time">13:20</p><p class="t2-topic">Why the quarter broke, and who quietly fixed it.</p></div><div class="t2-t"><span class="t2-dot"></span><p class="t2-time">14:30</p><p class="t2-topic">Shipping the new storefront before the March freeze.</p></div><div class="t2-t"><span class="t2-dot"></span><p class="t2-time">15:30</p><p class="t2-topic">Where the money went, line by line, no slides spared.</p></div><div class="t2-t"><span class="t2-dot"></span><p class="t2-time">16:00</p><p class="t2-topic">Finding partners who still answer the phone on Sundays.</p></div><div class="t2-t"><span class="t2-dot"></span><p class="t2-time">16:50</p><p class="t2-topic">What we do with the surplus attention next year.</p></div></div></div></div>`,
  },
  {
    id: "people/cast-grid-ten@v1",
    name: "十宫格演员名录",
    group: "multi",
    brief: "两排五列方框头像，姓名叠在框上方，左侧大字栏目配小字说明；适合群像卡司、团队名录介绍。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden">
<style>
.cg{position:absolute;inset:0;display:flex;align-items:center;gap:56px;padding:0 72px;box-sizing:border-box}
.cg-head{width:320px;flex:none;display:flex;flex-direction:column;gap:26px}
.cg-kicker{font-family:var(--font-sans);font-size:14px;font-weight:300;letter-spacing:.44em;text-transform:uppercase;color:var(--muted);line-height:2}
.cg-title{font-family:var(--font-display);font-size:120px;font-weight:900;line-height:.86;letter-spacing:-.03em;text-transform:uppercase;color:var(--text)}
.cg-title span{display:block}
.cg-note{font-family:var(--font-sans);font-size:15px;font-weight:300;line-height:1.8;letter-spacing:.02em;color:var(--muted)}
.cg-grid{flex:1;display:grid;grid-template-columns:repeat(5,1fr);gap:38px 20px}
.cg-cell{display:flex;flex-direction:column;gap:12px}
.cg-name{margin:0;font-family:var(--font-display);color:var(--text);line-height:1.15}
.cg-first{display:block;font-size:19px;font-weight:400;font-style:italic;opacity:.7}
.cg-last{display:block;font-size:22px;font-weight:800;letter-spacing:.05em;text-transform:uppercase}
.cg-frame{position:relative;height:382px;background:var(--surface);overflow:hidden;outline:1px solid var(--border);outline-offset:-12px}
.cg-frame img{position:absolute;inset:0;width:100%;height:100%;display:block}
</style>
<div class="cg">
<div class="cg-head">
<div class="cg-kicker">Ensemble Cast / 2026</div>
<div class="cg-title"><span>The</span><span>Cast</span></div>
<div class="cg-note">Ten faces, one long weekend on the coast road.</div>
</div>
<div class="cg-grid">
<div class="cg-cell"><p class="cg-name"><span class="cg-first">Miles</span><span class="cg-last">Carter</span></p><div class="cg-frame"><img data-lumen-image="1" data-lumen-cutout="head"></div></div>
<div class="cg-cell"><p class="cg-name"><span class="cg-first">Nora</span><span class="cg-last">Vance</span></p><div class="cg-frame"><img data-lumen-image="2" data-lumen-cutout="head"></div></div>
<div class="cg-cell"><p class="cg-name"><span class="cg-first">Elias</span><span class="cg-last">Brandt</span></p><div class="cg-frame"><img data-lumen-image="3" data-lumen-cutout="head"></div></div>
<div class="cg-cell"><p class="cg-name"><span class="cg-first">June</span><span class="cg-last">Halloway</span></p><div class="cg-frame"><img data-lumen-image="4" data-lumen-cutout="head"></div></div>
<div class="cg-cell"><p class="cg-name"><span class="cg-first">Theo</span><span class="cg-last">Marsh</span></p><div class="cg-frame"><img data-lumen-image="5" data-lumen-cutout="head"></div></div>
<div class="cg-cell"><p class="cg-name"><span class="cg-first">Ivy</span><span class="cg-last">Sandoval</span></p><div class="cg-frame"><img data-lumen-image="6" data-lumen-cutout="head"></div></div>
<div class="cg-cell"><p class="cg-name"><span class="cg-first">Ronan</span><span class="cg-last">Pike</span></p><div class="cg-frame"><img data-lumen-image="7" data-lumen-cutout="head"></div></div>
<div class="cg-cell"><p class="cg-name"><span class="cg-first">Greta</span><span class="cg-last">Lindqvist</span></p><div class="cg-frame"><img data-lumen-image="8" data-lumen-cutout="head"></div></div>
<div class="cg-cell"><p class="cg-name"><span class="cg-first">Cole</span><span class="cg-last">Bennett</span></p><div class="cg-frame"><img data-lumen-image="9" data-lumen-cutout="head"></div></div>
<div class="cg-cell"><p class="cg-name"><span class="cg-first">Della</span><span class="cg-last">Fontaine</span></p><div class="cg-frame"><img data-lumen-image="10" data-lumen-cutout="head"></div></div>
</div>
</div>
</div>`,
  },
  {
    id: "people/title-two-figures@v1",
    name: "巨字标题双人底图",
    group: "multi",
    brief: "左侧巨字叠行标题配短标语，右侧站姿半身像，底部中央再压一个半身人像，像电影主视觉。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden">
<style>
.ka{position:absolute;inset:0}
.ka-kick{position:absolute;top:104px;font-family:var(--font-sans);font-size:15px;font-weight:300;letter-spacing:.46em;text-transform:uppercase;color:var(--muted)}
.ka-kick-l{left:140px}
.ka-kick-r{right:140px;text-align:right}
.ka-title{position:absolute;left:136px;top:176px;margin:0;font-family:var(--font-display);font-size:176px;font-weight:900;line-height:.87;letter-spacing:-.035em;text-transform:uppercase;color:var(--text);z-index:3}
.ka-title span{display:block}
.ka-rule{position:absolute;left:142px;top:544px;width:140px;height:1px;background:var(--border)}
.ka-tag{position:absolute;left:142px;top:576px;margin:0;max-width:640px;font-family:var(--font-sans);font-size:30px;font-weight:300;line-height:1.5;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);z-index:3}
.ka-note{position:absolute;left:142px;top:748px;margin:0;max-width:330px;font-family:var(--font-sans);font-size:16px;font-weight:400;line-height:1.75;color:var(--muted);z-index:3}
.ka-stand{position:absolute;right:120px;bottom:0;width:640px;height:900px;z-index:1}
.ka-seat{position:absolute;left:500px;bottom:0;width:440px;height:430px;z-index:2}
.ka-stand img,.ka-seat img{width:100%;height:100%;display:block}
</style>
<div class="ka">
<div class="ka-kick ka-kick-l">Harbour Pictures / Production Stills</div>
<div class="ka-kick ka-kick-r">Only In Theaters / 12 Dec 2026</div>
<p class="ka-title"><span>Cold</span><span>Harbour</span></p>
<div class="ka-rule"></div>
<p class="ka-tag">A body washes up every morning before the tide turns</p>
<p class="ka-note">Shot on 35mm along the Northumberland coast over eleven winter weeks.</p>
<div class="ka-stand"><img data-lumen-image="2" data-lumen-cutout="half"></div>
<div class="ka-seat"><img data-lumen-image="1" data-lumen-cutout="half"></div>
</div>
</div>`,
  },
  {
    id: "people/relation-chart-collage@v1",
    name: "左文右群像关系图",
    group: "multi",
    brief: "左侧大标题加短介，右侧六人剪影错落成关系图谱，适合多人剧集或团队关系页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden;font-family:var(--font-sans)"><style>.rc-kicker{position:absolute;left:104px;top:112px;margin:0;font-size:17px;font-weight:400;letter-spacing:.42em;text-transform:uppercase;color:var(--muted)}.rc-title{position:absolute;left:98px;top:158px;margin:0;width:560px;font-family:var(--font-display);font-size:122px;font-weight:900;line-height:.9;letter-spacing:-.03em;text-transform:uppercase;color:var(--text)}.rc-rule{position:absolute;left:102px;top:468px;width:170px;height:3px;background:var(--accent)}.rc-brief{position:absolute;left:102px;top:506px;margin:0;width:450px;font-size:20px;font-weight:300;line-height:1.65;color:var(--muted)}.rc-script{position:absolute;left:100px;top:836px;margin:0;font-family:var(--font-script);font-size:74px;color:var(--accent)}.rc-meta{position:absolute;left:104px;top:962px;margin:0;font-size:15px;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}.rc-tile{position:absolute;width:340px;height:390px}.rc-blob{position:absolute;left:-20px;top:-16px;width:380px;height:332px;background:var(--accent);opacity:.9;border-radius:46% 54% 42% 58% / 58% 44% 56% 42%}.rc-img{position:absolute;left:0;top:0;width:340px;height:300px}.rc-name{position:absolute;left:6px;bottom:46px;margin:0;font-family:var(--font-display);font-size:38px;font-weight:900;letter-spacing:-.01em;text-transform:uppercase;color:var(--text)}.rc-role{position:absolute;left:8px;bottom:20px;margin:0;font-size:15px;font-weight:400;letter-spacing:.24em;text-transform:uppercase;color:var(--muted)}.rc-chip{position:absolute;border:2px solid var(--accent);border-radius:999px;padding:9px 20px;font-size:14px;letter-spacing:.3em;text-transform:uppercase;color:var(--text);background:var(--surface)}</style><p class="rc-kicker">Relationship Chart / Season 2</p><p class="rc-title">TIES THAT BIND</p><div class="rc-rule"></div><p class="rc-brief">Six people, one unpaid debt, and a ledger nobody wants read out loud at the dinner table.</p><p class="rc-script">the long game</p><p class="rc-meta">JAKARTA / 2026</p><div class="rc-tile" style="left:700px;top:150px"><div class="rc-blob"></div><img class="rc-img" data-lumen-image="1" data-lumen-cutout="half"><p class="rc-name">ROSA VELASQUEZ</p><p class="rc-role">Landlord / Ex-Wife</p></div><div class="rc-tile" style="left:1110px;top:150px"><div class="rc-blob"></div><img class="rc-img" data-lumen-image="2" data-lumen-cutout="half"><p class="rc-name">MARCUS TAN</p><p class="rc-role">Broker</p></div><div class="rc-tile" style="left:1520px;top:150px"><div class="rc-blob"></div><img class="rc-img" data-lumen-image="3" data-lumen-cutout="half"><p class="rc-name">IRFAN HAKIM</p><p class="rc-role">Corporate Lawyer</p></div><div class="rc-tile" style="left:700px;top:570px"><div class="rc-blob"></div><img class="rc-img" data-lumen-image="4" data-lumen-cutout="half"><p class="rc-name">ARA BENNETT</p><p class="rc-role">Night-Shift Nurse</p></div><div class="rc-tile" style="left:1110px;top:570px"><div class="rc-blob"></div><img class="rc-img" data-lumen-image="5" data-lumen-cutout="half"><p class="rc-name">ELZAN RIVERA</p><p class="rc-role">Debt Collector</p></div><div class="rc-tile" style="left:1520px;top:570px"><div class="rc-blob"></div><img class="rc-img" data-lumen-image="6" data-lumen-cutout="half"><p class="rc-name">FREYA LUM</p><p class="rc-role">Rookie Reporter</p></div><div class="rc-chip" style="left:640px;top:296px;transform:rotate(-7deg)">The Boss</div><div class="rc-chip" style="left:1052px;top:470px;transform:rotate(-3deg)">Owes Him</div><div class="rc-chip" style="left:620px;top:742px;transform:rotate(6deg)">The Nephew</div></div>`,
  },
  {
    id: "people/center-hero-nameplate@v1",
    name: "居中主视觉名牌",
    group: "solo",
    brief: "人像居中放大，巨型人名横压在下缘，两侧小标签，适合单人主视觉或封面页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden;font-family:var(--font-sans)"><style>.hc-kicker{position:absolute;left:0;top:66px;margin:0;width:1920px;text-align:center;font-size:16px;font-weight:400;letter-spacing:.5em;text-transform:uppercase;color:var(--muted)}.hc-halo{position:absolute;left:610px;top:28px;width:700px;height:620px;border-radius:50%;background:var(--accent);opacity:.16}.hc-img{position:absolute;left:660px;top:34px;width:600px;height:604px}.hc-name{position:absolute;left:0;top:648px;margin:0;width:1920px;text-align:center;font-family:var(--font-display);font-size:200px;font-weight:900;line-height:.92;letter-spacing:-.04em;text-transform:uppercase;color:var(--text)}.hc-sub{position:absolute;left:0;top:872px;margin:0;width:1920px;text-align:center;font-size:18px;font-weight:400;letter-spacing:.36em;text-transform:uppercase;color:var(--muted)}.hc-bio{position:absolute;left:610px;top:924px;margin:0;width:700px;text-align:center;font-size:19px;font-weight:300;line-height:1.6;color:var(--muted)}.hc-chip{position:absolute;border:2px solid var(--accent);border-radius:999px;padding:10px 22px;font-size:14px;letter-spacing:.3em;text-transform:uppercase;color:var(--text);background:var(--surface)}</style><p class="hc-kicker">Season Two / Main Cast</p><div class="hc-halo"></div><img class="hc-img" data-lumen-image="1" data-lumen-cutout="half"><div class="hc-chip" style="left:236px;top:388px;transform:rotate(-6deg)">The Brother</div><div class="hc-chip" style="left:1428px;top:388px;transform:rotate(5deg)">The Debt</div><p class="hc-name">MARCUS</p><p class="hc-sub">Aiden Okonjo / Lead Investigator</p><p class="hc-bio">He collects what other people owe and keeps a notebook of every promise broken on this street since 2019.</p></div>`,
  },
  {
    id: "people/left-name-right-portrait@v1",
    name: "左名右像斜块",
    group: "solo",
    brief: "左侧叠排大写人名与身份小字，右侧人像压在倾斜色块上，适合人物专访或单页介绍。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden;font-family:var(--font-sans)"><style>.ss-kicker{position:absolute;left:120px;top:118px;margin:0;font-size:16px;font-weight:400;letter-spacing:.44em;text-transform:uppercase;color:var(--muted)}.ss-name{position:absolute;left:114px;top:166px;margin:0;width:760px;font-family:var(--font-display);font-size:150px;font-weight:900;line-height:.9;letter-spacing:-.035em;text-transform:uppercase;color:var(--text)}.ss-role{position:absolute;left:120px;top:474px;margin:0;font-size:19px;font-weight:400;letter-spacing:.3em;text-transform:uppercase;color:var(--accent)}.ss-brief{position:absolute;left:120px;top:532px;margin:0;width:520px;font-size:20px;font-weight:300;line-height:1.7;color:var(--muted)}.ss-chip{position:absolute;left:120px;top:734px;border:2px solid var(--border);border-radius:999px;padding:12px 24px;font-size:14px;letter-spacing:.3em;text-transform:uppercase;color:var(--text)}.ss-script{position:absolute;left:118px;top:866px;margin:0;font-family:var(--font-script);font-size:66px;color:var(--accent)}.ss-meta{position:absolute;left:122px;top:978px;margin:0;font-size:15px;letter-spacing:.32em;text-transform:uppercase;color:var(--muted)}.ss-blob{position:absolute;left:1000px;top:78px;width:800px;height:900px;background:var(--accent);opacity:.9;border-radius:46% 54% 44% 56% / 60% 40% 60% 40%;transform:rotate(-4deg)}.ss-img{position:absolute;left:1040px;top:110px;width:720px;height:840px}</style><p class="ss-kicker">Portrait Series / 2026</p><p class="ss-name">HANA MORI</p><p class="ss-role">Documentary Photographer</p><p class="ss-brief">She shoots the harbour at five in the morning, when the cranes are still warm and nobody has washed the decks yet.</p><div class="ss-chip">Docklands, 05:40</div><p class="ss-script">frame seven</p><p class="ss-meta">SEOUL / 2026</p><div class="ss-blob"></div><img class="ss-img" data-lumen-image="1" data-lumen-cutout="half"></div>`,
  },
  {
    id: "people/quad-confrontation-grid@v1",
    name: "四宫格对角对峙",
    group: "multi",
    brief: "四个人像分列四角，中央圆圈标出对立关系，适合阵营对比或分组介绍页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden;font-family:var(--font-sans)"><style>.gd-title{position:absolute;left:120px;top:62px;margin:0;font-family:var(--font-display);font-size:118px;font-weight:900;line-height:1;letter-spacing:-.03em;text-transform:uppercase;color:var(--text)}.gd-kicker{position:absolute;right:120px;top:84px;margin:0;font-size:15px;font-weight:400;letter-spacing:.4em;text-transform:uppercase;color:var(--muted)}.gd-tile{position:absolute;width:480px;height:380px}.gd-img{position:absolute;left:0;top:0;width:430px;height:300px}.gd-blob{position:absolute;left:-16px;top:-14px;width:460px;height:330px;background:var(--accent);opacity:.88;border-radius:52% 48% 44% 56% / 58% 42% 58% 42%}.gd-name{position:absolute;left:4px;bottom:44px;margin:0;font-family:var(--font-display);font-size:36px;font-weight:900;letter-spacing:-.01em;text-transform:uppercase;color:var(--text)}.gd-role{position:absolute;left:6px;bottom:16px;margin:0;font-size:14px;font-weight:400;letter-spacing:.26em;text-transform:uppercase;color:var(--muted)}.gd-node{position:absolute;display:flex;align-items:center;justify-content:center;border:3px solid var(--accent);border-radius:50%;background:var(--surface);color:var(--text);text-transform:uppercase}.gd-vs{left:885px;top:462px;width:150px;height:150px;font-size:44px;font-weight:900;letter-spacing:.08em}.gd-q{left:1148px;top:470px;width:92px;height:92px;font-size:36px;font-weight:900}</style><p class="gd-title">WHO STANDS WHERE</p><p class="gd-kicker">Cast Map / Season 2</p><div class="gd-tile" style="left:180px;top:200px"><div class="gd-blob"></div><img class="gd-img" data-lumen-image="1" data-lumen-cutout="half"><p class="gd-name">ROSA VELASQUEZ</p><p class="gd-role">Landlord / Ex-Wife</p></div><div class="gd-tile" style="left:1260px;top:200px"><div class="gd-blob"></div><img class="gd-img" data-lumen-image="2" data-lumen-cutout="half"><p class="gd-name">MARCUS TAN</p><p class="gd-role">Broker</p></div><div class="gd-tile" style="left:180px;top:620px"><div class="gd-blob"></div><img class="gd-img" data-lumen-image="3" data-lumen-cutout="half"><p class="gd-name">ARA BENNETT</p><p class="gd-role">Night-Shift Nurse</p></div><div class="gd-tile" style="left:1260px;top:620px"><div class="gd-blob"></div><img class="gd-img" data-lumen-image="4" data-lumen-cutout="half"><p class="gd-name">ELZAN RIVERA</p><p class="gd-role">Debt Collector</p></div><div class="gd-node gd-vs">VS</div><div class="gd-node gd-q">?</div></div>`,
  },
  {
    id: "people/cover-masthead-center-portrait@v1",
    name: "封面巨字中轴人像",
    group: "solo",
    brief: "杂志封面式构图，顶部超大字标压住中央半身人像，左右两栏小字对称分布，底部一行巨字收尾，适合单人大片封面页",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)"><style>.cover-mast{position:absolute;top:-18px;left:0;width:100%;text-align:center;font-family:var(--font-display);font-size:214px;line-height:.86;font-weight:400;letter-spacing:-.035em;text-transform:uppercase;color:var(--text);opacity:.96;z-index:1}.cover-hero{position:absolute;left:660px;top:0;width:600px;height:1080px;z-index:2}.cover-col{position:absolute;width:300px;z-index:3}.cover-col.left{left:66px;top:332px}.cover-col.right{right:66px;top:362px;text-align:right}.cover-lead{margin:0;font-family:var(--font-display);font-size:40px;line-height:1.05;letter-spacing:.02em;text-transform:uppercase;color:var(--text);font-weight:400}.cover-note{margin:18px 0 0;font-size:16px;line-height:1.7;letter-spacing:.2em;text-transform:uppercase;color:var(--muted);font-weight:300}.cover-rule{width:96px;height:1px;background:var(--accent);opacity:.55;margin:26px 0 22px}.cover-col.right .cover-rule{margin-left:auto}.cover-sig{margin:24px 0 0;font-family:var(--font-script);font-size:32px;line-height:1;color:var(--text);opacity:.88}.cover-credit{margin:14px 0 0;font-size:15px;letter-spacing:.32em;text-transform:uppercase;color:var(--muted);font-weight:300}.cover-title{position:absolute;left:0;bottom:26px;width:100%;text-align:center;font-family:var(--font-display);font-size:152px;line-height:.9;letter-spacing:-.025em;text-transform:uppercase;color:var(--text);font-weight:400;z-index:3}</style><div class="cover-mast">BAZAAR</div><img data-lumen-image="1" data-lumen-cutout="half" class="cover-hero"><div class="cover-col left"><p class="cover-lead">THE<br>POWER<br>OF STYLE</p><p class="cover-note">THE QUIET PICTURE OF THE PRESENCE.</p><div class="cover-rule"></div><p class="cover-sig">Hana Mori</p><p class="cover-credit">FASHION EDITOR-AT-LARGE</p></div><div class="cover-col right"><p class="cover-lead">THE<br>NEW<br>FASHION</p><div class="cover-rule"></div><p class="cover-note">THE FUTURE OF LUXURY IS HERE</p><p class="cover-credit">SEOUL / 2026</p></div><div class="cover-title">THE NEW ESSENTIALS</div></div>`,
  },
  {
    id: "people/magazine-cover-split@v1",
    name: "杂志封面巨字人像",
    group: "solo",
    brief: "杂志封面式构图：巨字标题横贯顶部，人像竖切居中，左右两栏小字信息加底部大字姓名。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden"><style>.mc{position:absolute;inset:0;font-family:var(--font-sans);color:var(--text)}.mc-kicker{position:absolute;left:72px;top:32px;margin:0;font-size:21px;font-weight:300;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}.mc-title{position:absolute;left:56px;top:62px;margin:0;font-family:var(--font-display);font-size:198px;line-height:.86;font-weight:900;letter-spacing:-.03em;text-transform:uppercase;z-index:1}.mc-sub{position:absolute;left:1004px;top:216px;margin:0;font-size:25px;font-weight:300;letter-spacing:.44em;text-transform:uppercase;color:var(--muted);z-index:1}.mc-figure{position:absolute;left:740px;top:60px;width:500px;height:1000px;z-index:2}.mc-figure img{width:100%;height:100%;display:block}.mc-left{position:absolute;left:88px;top:388px;width:410px;z-index:3}.mc-left-a{margin:0;font-family:var(--font-display);font-size:46px;line-height:1.12;font-weight:400;letter-spacing:.03em;text-transform:uppercase}.mc-left-a span{display:block}.mc-num{margin:12px 0 0;font-family:var(--font-display);font-size:150px;line-height:.84;font-weight:300;letter-spacing:-.02em}.mc-left-p{margin:22px 0 0;font-size:21px;line-height:1.7;font-weight:300;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}.mc-right{position:absolute;right:84px;top:424px;width:340px;text-align:right;z-index:3}.mc-right-a{margin:0;font-family:var(--font-display);font-size:46px;line-height:1.14;font-weight:400;letter-spacing:.03em;text-transform:uppercase}.mc-right-a span,.mc-right-b span{display:block}.mc-right-b{margin:26px 0 0;font-family:var(--font-display);font-size:46px;line-height:1.14;font-weight:400;letter-spacing:.03em;text-transform:uppercase}.mc-right-p{margin:26px 0 0;font-size:21px;line-height:1.7;font-weight:300;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}.mc-name{position:absolute;left:56px;bottom:52px;margin:0;font-family:var(--font-display);font-size:132px;line-height:.88;font-weight:900;letter-spacing:-.02em;text-transform:uppercase;z-index:3}.mc-name span{display:block}.mc-sigline{position:absolute;left:50%;bottom:114px;transform:translateX(-50%);margin:0;font-size:15px;font-weight:300;letter-spacing:.6em;text-transform:uppercase;color:var(--muted);z-index:4}.mc-sig{position:absolute;left:50%;bottom:50px;transform:translateX(-50%);margin:0;font-family:var(--font-script);font-size:52px;line-height:1;opacity:.92;z-index:4}.mc-code{position:absolute;right:84px;bottom:78px;width:250px;height:84px;display:flex;align-items:stretch;gap:5px;padding:9px;border:3px solid var(--text);border-radius:14px;z-index:4}.mc-code span{flex:1;background:var(--text);border-radius:2px}.mc-code span:nth-child(2n){flex:.4}.mc-code span:nth-child(3n){flex:.75}</style><div class="mc"><p class="mc-kicker">VOLUME 20 / ISSUE 5 / SUMMER 2024</p><p class="mc-title">FASHION</p><p class="mc-sub">EXCLUSIVE MAGAZINE</p><div class="mc-figure"><img data-lumen-image="1" data-lumen-cutout="half"></div><div class="mc-left"><p class="mc-left-a"><span>SUMMER</span><span>TRENDS</span></p><p class="mc-num">12</p><p class="mc-left-p">Shot on the rooftop at dusk, one long black gown and a borrowed gold chain, nothing retouched.</p></div><div class="mc-right"><p class="mc-right-a"><span>FASHION</span><span>CATALOGUE</span></p><p class="mc-right-b"><span>STAY</span><span>CONFIDENT</span></p><p class="mc-right-p">With makeup and natural skin, printed straight from the negative.</p></div><p class="mc-name"><span>REESE</span><span>MILLER</span></p><p class="mc-sigline">MADAME</p><p class="mc-sig">Figaro</p><div class="mc-code"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span></div></div></div>`,
  },
  {
    id: "people/magazine-cover-left-column@v1",
    name: "杂志封面左栏叠像",
    group: "solo",
    brief: "杂志封面式构图：巨大的衬线刊头压左上角，左栏竖排期号、大数字与全大写小字，右中一幅半身人像，右下巨字标题叠压在人像上。适合人物专访、品牌特刊、封面页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden;color:var(--text);font-family:var(--font-sans)">
<style>
.cc-mast{position:absolute;left:108px;top:44px;font-family:var(--font-display);font-size:184px;font-weight:900;letter-spacing:-.05em;line-height:.88}
.cc-sub{position:absolute;left:116px;top:224px;font-size:18px;font-weight:400;letter-spacing:.44em;text-transform:uppercase;color:var(--muted)}
.cc-issue{position:absolute;right:112px;top:60px;text-align:right;font-size:16px;font-weight:600;letter-spacing:.34em;text-transform:uppercase;color:var(--muted);line-height:2.1}
.cc-muse{position:absolute;right:118px;top:186px;width:420px;text-align:right;font-family:var(--font-script);font-size:54px;font-weight:400;line-height:1.15;color:var(--accent)}
.cc-musetxt{position:absolute;right:118px;top:278px;width:330px;margin:0;text-align:right;font-size:17px;font-weight:300;line-height:1.9;color:var(--muted)}
.cc-num{position:absolute;left:110px;top:348px;font-family:var(--font-display);font-size:156px;font-weight:400;line-height:.86;color:var(--accent)}
.cc-list{position:absolute;left:116px;top:524px;width:250px;font-size:23px;font-weight:600;letter-spacing:.2em;text-transform:uppercase;line-height:1.48}
.cc-rule{position:absolute;left:116px;top:700px;width:132px;height:2px;background:var(--text);opacity:.45}
.cc-tagline{position:absolute;left:116px;top:736px;margin:0;font-size:16px;font-weight:300;letter-spacing:.3em;text-transform:uppercase;color:var(--muted);line-height:2.1}
.cc-vrule{position:absolute;left:608px;top:200px;width:1px;height:700px;background:var(--border);opacity:.8}
.cc-plus{position:absolute;left:116px;bottom:56px;width:340px}
.cc-pill{display:inline-block;border:1px solid var(--border);padding:5px 13px;font-size:13px;font-weight:700;letter-spacing:.34em;text-transform:uppercase}
.cc-plustxt{margin:14px 0 0;font-size:15px;font-weight:300;letter-spacing:.28em;text-transform:uppercase;color:var(--muted);line-height:1.9}
.cc-port{position:absolute;left:660px;top:30px;width:760px;height:1000px}
.cc-head{position:absolute;right:112px;bottom:128px;text-align:right;line-height:.88}
.cc-h1{font-family:var(--font-display);font-size:118px;font-weight:400;letter-spacing:-.02em}
.cc-h2{font-family:var(--font-display);font-size:54px;font-weight:400;font-style:italic;letter-spacing:.04em;color:var(--muted)}
.cc-h3{font-family:var(--font-display);font-size:146px;font-weight:700;letter-spacing:-.035em;color:var(--accent);line-height:1.05}
.cc-note{position:absolute;right:112px;bottom:50px;width:430px;margin:0;text-align:right;font-size:17px;font-weight:300;line-height:1.8;color:var(--muted)}
</style>
<div class="cc-mast">chic!</div>
<div class="cc-sub">Fashion &amp; Attitude</div>
<div class="cc-issue">March 2026<br>Issue 36</div>
<div class="cc-muse">Be your own muse.</div>
<p class="cc-musetxt">Photographed on the rooftop at six in the morning, before the city woke up.</p>
<div class="cc-num">07</div>
<div class="cc-list">Ways to<br>Redefine<br>Your Style</div>
<div class="cc-rule"></div>
<p class="cc-tagline">New Season<br>New Energy<br>New You</p>
<div class="cc-vrule"></div>
<div class="cc-port"><img data-lumen-image="1" data-lumen-cutout="half"></div>
<div class="cc-head">
<div class="cc-h1">CLASSY</div>
<div class="cc-h2">with a</div>
<div class="cc-h3">TWIST</div>
</div>
<p class="cc-note">Elegance is not a choice you make once a season. It is the way you carry the day.</p>
<div class="cc-plus"><span class="cc-pill">Plus</span><p class="cc-plustxt">Spring Look<br>Wardrobe Essentials</p></div>
</div>`,
  },
  {
    id: "people/left-copy-right-portrait-manifesto@v1",
    name: "左文右像宣言页",
    group: "solo",
    brief: "左侧堆叠宣言式大标题、引言与信条清单，右侧半身人像撑满，适合人物主张页或封面。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)"><style>.empire{width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);font-family:var(--font-sans)}.empire-wash{position:absolute;top:-180px;right:180px;width:820px;height:820px;border-radius:50%;background:var(--accent);opacity:.06}.empire-panel{position:absolute;top:0;right:0;width:1000px;height:1080px;background:var(--surface);opacity:.5}.empire-photo{position:absolute;right:70px;bottom:0;width:840px;height:1020px}.empire-kicker{position:absolute;left:132px;top:100px;font-size:17px;font-weight:300;letter-spacing:.42em;text-transform:uppercase;color:var(--muted)}.empire-title{position:absolute;left:126px;top:166px;font-family:var(--font-display);font-size:140px;line-height:.9;font-weight:900;letter-spacing:-.035em;text-transform:uppercase;color:var(--text)}.empire-rule{position:absolute;left:132px;top:462px;width:132px;height:2px;background:var(--accent);opacity:.9}.empire-quote{position:absolute;left:132px;top:504px;width:660px;font-family:var(--font-display);font-size:34px;line-height:1.38;font-weight:400;letter-spacing:.01em;text-transform:uppercase;color:var(--text)}.empire-sign{position:absolute;left:134px;top:686px;font-family:var(--font-script);font-size:46px;color:var(--accent);opacity:.9}.empire-mark{position:absolute;left:132px;top:790px;width:16px;height:16px;background:var(--accent)}.empire-list{position:absolute;left:132px;top:826px;font-size:23px;font-weight:400;line-height:1.75;letter-spacing:.18em;text-transform:uppercase;color:var(--muted)}.empire-tag{position:absolute;left:600px;top:900px;padding:20px 30px;border:1px solid var(--accent);font-size:20px;font-weight:900;letter-spacing:.32em;text-transform:uppercase;color:var(--text)}</style><div class="empire"><div class="empire-panel"></div><div class="empire-wash"></div><img class="empire-photo" data-lumen-image="1" data-lumen-cutout="half" alt=""><p class="empire-kicker">DISICPLINE. FOCUS. CONSISTENCY</p><p class="empire-title">BUILDING<br>MY EMPIRE</p><div class="empire-rule"></div><p class="empire-quote">I'M NOT COMPETING WITH ANYONE, I'M BUILDING MY OWN EMPIRE.</p><p class="empire-sign">Hana Mori</p><div class="empire-mark"></div><p class="empire-list">STRONG MIND<br>SOFT HEART<br>AMBITION LOUDER<br>THAN EXCUSES</p><p class="empire-tag">LADY BOSS ENERGY</p></div></div>`,
  },
  {
    id: "people/giant-type-collage@v1",
    name: "巨字叠层人像拼贴",
    group: "multi",
    brief: "巨大标题字垫底，斜置头像卡、中央主视觉与两侧小人物照叠层拼贴，适合个人专题封面或人物特辑。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg)">
<style>
.pg{position:absolute;inset:0}
.frame{position:absolute;left:48px;top:44px;right:48px;bottom:44px;border:1px solid var(--border);opacity:.6;z-index:1}
.big{position:absolute;font-family:var(--font-display);font-weight:900;font-size:320px;line-height:.8;letter-spacing:-.04em;text-transform:uppercase;color:var(--text);opacity:.13;z-index:1}
.big-a{left:68px;top:-38px}
.big-b{right:56px;bottom:-88px}
.sq{position:absolute;left:622px;top:298px;width:128px;height:128px;border:1px solid var(--text);opacity:.22;z-index:1}
.sq2{position:absolute;left:660px;top:262px;width:128px;height:128px;border:1px solid var(--text);opacity:.15;z-index:1}
.card{position:absolute;left:78px;top:96px;width:520px;height:624px;background:var(--surface);border:1px solid var(--border);transform:rotate(-6deg);box-shadow:24px 28px 0 var(--border);z-index:4}
.card img{position:absolute;left:0;top:0;width:100%;height:100%}
.card-name{position:absolute;left:24px;top:136px;width:480px;font-family:var(--font-display);font-weight:900;font-size:84px;line-height:.9;letter-spacing:-.02em;text-transform:uppercase;color:var(--text);z-index:2;margin:0}
.sig{position:absolute;left:30px;bottom:22px;font-family:var(--font-script);font-size:34px;color:var(--text);opacity:.8;z-index:2;margin:0}
.main{position:absolute;left:780px;bottom:0;width:600px;height:912px;z-index:3}
.main img{width:100%;height:100%}
.fig-l{position:absolute;left:110px;bottom:0;width:370px;height:404px;z-index:2}
.fig-l img{width:100%;height:100%}
.fig-r{position:absolute;right:110px;bottom:0;width:390px;height:436px;z-index:2}
.fig-r img{width:100%;height:100%}
.meta{position:absolute;right:96px;top:118px;width:460px;text-align:right;z-index:5}
.kicker{font-size:18px;font-weight:400;letter-spacing:.42em;text-transform:uppercase;color:var(--muted);margin:0}
.nm{font-family:var(--font-display);font-weight:900;font-size:88px;line-height:.88;letter-spacing:-.03em;color:var(--text);margin:26px 0 0}
.role{font-size:20px;font-weight:300;letter-spacing:.26em;text-transform:uppercase;color:var(--muted);margin:20px 0 0}
.rule{width:130px;height:3px;background:var(--accent);margin:26px 0 0 auto}
.bio{font-size:20px;font-weight:400;line-height:1.7;color:var(--text);opacity:.72;margin:24px 0 0}
.date{font-size:16px;font-weight:300;letter-spacing:.3em;text-transform:uppercase;color:var(--muted);margin:22px 0 0}
</style>
<div class="pg">
<div class="frame"></div>
<p class="big big-a">No</p>
<p class="big big-b">One</p>
<div class="sq"></div>
<div class="sq2"></div>
<div class="fig-l"><img data-lumen-image="3" data-lumen-cutout="half"></div>
<div class="main"><img data-lumen-image="2" data-lumen-cutout="half"></div>
<div class="fig-r"><img data-lumen-image="4" data-lumen-cutout="half"></div>
<div class="card">
<img data-lumen-image="1" data-lumen-cutout="head">
<p class="card-name">Han Seol</p>
<p class="sig">studio han</p>
</div>
<div class="meta">
<p class="kicker">Portrait Series / 2026</p>
<p class="nm">Han Seol</p>
<p class="role">Documentary Photographer</p>
<div class="rule"></div>
<p class="bio">She shot the fish market at dawn for six years, then moved inland to follow the last river ferrymen before the bridges went up.</p>
<p class="date">Seoul / 12 Dec 2026</p>
</div>
</div>
</div>`,
  },
  {
    id: "people/cover-masthead-portrait@v1",
    name: "封面巨字人像居中",
    group: "solo",
    brief: "杂志封面式构图，超大刊名横贯顶部压在人像后方，人物居中站定，左右两侧分挂栏目小字与品牌标记，底部居中放大名与手写标语。适合单人封面、人物专访开篇。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);color:var(--text)">
<style>
.cover-masthead{position:absolute;top:-30px;left:0;width:100%;text-align:center;font-family:var(--font-display);font-size:300px;font-weight:700;letter-spacing:-.04em;line-height:.86;text-transform:uppercase;color:var(--text);opacity:.9;z-index:1}
.cover-kicker{position:absolute;top:216px;left:0;width:100%;text-align:center;font-family:var(--font-sans);font-size:20px;font-weight:400;letter-spacing:.44em;text-transform:uppercase;color:var(--text);z-index:3}
.cover-figure{position:absolute;left:50%;bottom:0;transform:translateX(-50%);height:1010px;z-index:2}
.cover-left{position:absolute;left:88px;top:300px;width:430px;z-index:4}
.cover-issue{font-size:34px;font-weight:900;letter-spacing:.02em;line-height:1;margin-bottom:28px}
.cover-headline{font-family:var(--font-display);font-size:62px;font-weight:300;line-height:1.12;letter-spacing:-.01em;text-transform:uppercase}
.cover-right{position:absolute;right:88px;top:330px;width:380px;text-align:right;font-size:30px;font-weight:300;line-height:1.5;z-index:4}
.cover-mark{position:absolute;right:88px;top:556px;font-size:120px;font-weight:900;letter-spacing:-.03em;line-height:1;text-transform:uppercase;z-index:4}
.cover-note{position:absolute;right:88px;top:706px;width:380px;text-align:right;font-size:28px;font-weight:300;line-height:1.4;z-index:4}
.cover-namebar{position:absolute;left:0;bottom:70px;width:100%;text-align:center;z-index:4}
.cover-name{font-family:var(--font-display);font-size:112px;font-weight:900;letter-spacing:-.02em;line-height:.9;text-transform:uppercase}
.cover-script{font-family:var(--font-script);font-size:46px;font-weight:400;line-height:1.2;margin-top:8px}
.cover-tag{margin-top:24px;font-size:26px;font-weight:300;letter-spacing:.05em;color:var(--muted)}
</style>
<p class="cover-masthead">Vantage</p>
<p class="cover-kicker">GMANSIRE / ISSUE 15</p>
<img class="cover-figure" data-lumen-image="1" data-lumen-cutout="half">
<div class="cover-left">
<p class="cover-issue">Issue 15</p>
<p class="cover-headline">The last word in men's fashion</p>
</div>
<div class="cover-right">Fashion tribes<br>Manchester united</div>
<p class="cover-mark">GM</p>
<div class="cover-note">A new star, shot at dawn on the roof of the old print works.</div>
<div class="cover-namebar">
<p class="cover-name">Arlo Vance</p>
<p class="cover-script">keep it real</p>
<p class="cover-tag">Fight against the ordinary with courage / Seoul, 2026</p>
</div>
</div>`,
  },
  {
    id: "people/editorial-cover-orbit@v1",
    name: "杂志封面式环绕",
    group: "solo",
    brief: "中央大幅半身人像，左侧巨字衬线标题与手写体副题叠加，右侧圆形徽章与竖排小字，底部细边框栏目条，适合个人封面或人物特写专题。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden">
<style>
.tl-kick{position:absolute;top:64px;font-size:15px;font-weight:500;letter-spacing:.42em;text-transform:uppercase;color:var(--muted)}
.tl-kick-l{left:100px}
.tl-kick-r{right:100px}
.tl-title{position:absolute;left:92px;top:126px;font-family:var(--font-display);font-size:164px;font-weight:400;line-height:.88;letter-spacing:-.035em;text-transform:uppercase;color:var(--text)}
.tl-script{position:absolute;left:470px;top:252px;font-family:var(--font-script);font-size:82px;font-weight:400;line-height:1;color:var(--text);opacity:.9}
.tl-muse{position:absolute;left:100px;top:426px;width:310px;font-family:var(--font-display);font-size:38px;font-weight:400;line-height:1.18;letter-spacing:.01em;text-transform:uppercase;color:var(--text)}
.tl-rule{position:absolute;left:100px;top:560px;width:56px;height:1px;background:var(--border)}
.tl-lines{position:absolute;left:100px;top:594px;font-size:18px;font-weight:300;line-height:1.95;letter-spacing:.02em;color:var(--muted)}
.tl-lines p{margin:0}
.tl-quote{position:absolute;left:100px;top:740px;width:440px;font-family:var(--font-display);font-size:30px;font-weight:400;line-height:1.42;color:var(--text)}
.tl-quote p{margin:0}
.tl-sign{position:absolute;left:100px;top:884px;font-family:var(--font-display);font-size:44px;font-weight:400;letter-spacing:.06em;color:var(--text);opacity:.85}
.tl-vert{position:absolute;writing-mode:vertical-rl;font-size:13px;font-weight:400;letter-spacing:.42em;text-transform:uppercase;color:var(--muted);opacity:.85}
.tl-vert-l{left:36px;top:596px}
.tl-vert-r{right:36px;top:596px}
.tl-port{position:absolute;left:940px;top:50px;width:700px;height:980px;overflow:hidden;background:var(--surface)}
.tl-port img{width:100%;height:100%;display:block}
.tl-badge{position:absolute;left:1700px;top:168px;width:204px;height:204px;border:1px solid var(--border);border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.tl-badge span{font-size:11px;font-weight:500;letter-spacing:.32em;line-height:2.1;text-transform:uppercase;color:var(--muted)}
.tl-estd{position:absolute;right:100px;bottom:172px;text-align:right;font-size:14px;font-weight:500;letter-spacing:.34em;line-height:2;text-transform:uppercase;color:var(--muted)}
.tl-bar{position:absolute;left:100px;right:100px;bottom:56px;height:66px;border:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;padding:0 44px}
.tl-bar span{font-size:15px;font-weight:500;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.tl-dot{width:5px;height:5px;background:var(--muted);opacity:.55;transform:rotate(45deg)}
</style>
<div class="tl-port"><img data-lumen-image="1" data-lumen-cutout="half"></div>
<div class="tl-kick tl-kick-l">FALL / 2024</div>
<div class="tl-kick tl-kick-r">LESS IS MORE</div>
<div class="tl-title">Timeless</div>
<div class="tl-script">essence</div>
<div class="tl-muse">Be your own muse.</div>
<div class="tl-rule"></div>
<div class="tl-lines"><p>Quiet mind</p><p>Soft heart</p><p>Brave soul.</p></div>
<div class="tl-quote"><p>Simplicity is the ultimate sophistication.</p></div>
<div class="tl-sign">A. Lina</div>
<div class="tl-vert tl-vert-l">Art of Simplicity</div>
<div class="tl-vert tl-vert-r">Focus on the Good</div>
<div class="tl-badge"><span>Strength</span><span>Reflecting</span><span>Beauty</span><span>Embrace</span></div>
<div class="tl-estd">ESTD<br>2024</div>
<div class="tl-bar"><span>Minimal</span><div class="tl-dot"></div><span>Refined</span><div class="tl-dot"></div><span>Timeless</span><div class="tl-dot"></div><span>You</span></div>
</div>`,
  },
  {
    id: "people/giant-masthead-center-portrait@v1",
    name: "巨字标下中像",
    group: "solo",
    brief: "顶部居中巨字标与分隔小字导航，下方正中一幅半身像压住细边框，适合杂志封面式单人页。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);color:var(--text);">
<style>
.dz-frame{position:absolute;inset:28px;border:1px solid var(--border)}
.dz-kicker{position:absolute;top:58px;left:0;right:0;text-align:center;font-size:16px;font-weight:400;letter-spacing:.52em;text-transform:uppercase;color:var(--muted)}
.dz-word{position:absolute;top:60px;left:0;right:0;text-align:center;font-family:var(--font-display);font-size:260px;font-weight:400;line-height:.92;letter-spacing:-.035em}
.dz-rule{position:absolute;top:344px;left:620px;width:680px;height:1px;background:var(--border)}
.dz-sub{position:absolute;top:364px;left:0;right:0;text-align:center;font-size:20px;font-weight:400;letter-spacing:.42em;text-transform:uppercase}
.dz-nav{position:absolute;top:410px;left:0;right:0;display:flex;justify-content:center;align-items:center;gap:52px;font-size:15px;font-weight:300;letter-spacing:.36em;text-transform:uppercase;color:var(--muted)}
.dz-nav span.sep{color:var(--border);letter-spacing:0}
.dz-portrait{position:absolute;top:428px;left:50%;transform:translateX(-50%);width:600px;height:652px}
.dz-note{position:absolute;bottom:54px;left:72px;font-size:14px;font-weight:300;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
.dz-note-r{position:absolute;bottom:54px;right:72px;font-size:14px;font-weight:300;letter-spacing:.34em;text-transform:uppercase;color:var(--muted)}
</style>
<div class="dz-frame"></div>
<div class="dz-kicker">HANA MORI / STUDIO</div>
<div class="dz-word">Deazur</div>
<div class="dz-rule"></div>
<div class="dz-sub">Visual Trends &amp; Aesthetics</div>
<div class="dz-nav"><span>Discover</span><span class="sep">|</span><span>Save</span><span class="sep">|</span><span>Create</span></div>
<img data-lumen-image="1" data-lumen-cutout="half" class="dz-portrait">
<div class="dz-note">Seoul / 2026</div>
<div class="dz-note-r">Cover No. 14</div>
</div>`,
  },
];
