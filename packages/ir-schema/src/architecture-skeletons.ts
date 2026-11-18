import type { ArchitectureLayout } from './architecture-layouts.js';

/**
 * 架构页的版式骨架。**这是生成文件，不要手改**。
 *
 * 由 `scripts/recognize-architecture-layouts.ts --emit` 从参考图识别出来并写入。
 * 改版式要改识别提示词再重跑，手改会在下一次生成时被覆盖。
 *
 * 每份都是**自包含**的（`<style>` + 一个根 `<div>`），不共用任何底座——
 * 所以各份之间的字号与留白是各自照参考图定的，横向摆在一起不必一致。
 *
 * 约束（只用 CSS 变量取色与三个字体角色、**不占图位**、会被换成真实内容的块标
 * `data-lumen-arch-node`）见 `architecture-layouts.ts` 顶部的说明。共 24 份。
 */
export const ARCHITECTURE_SKELETONS: ArchitectureLayout[] = [
  {
    id: "arch/core-hub-three-column@v1",
    name: "中枢三栏辐射",
    group: "radial",
    brief: "左侧能力栏、右侧原则栏，中轴自上下贯：外部系统带、核心步骤面板、状态与记忆双面板，适合画以核心能力为中心的体系总览。",
    skeleton: `<style>
.arch-root{width:1920px;height:1080px;position:relative;background:var(--bg);font-family:var(--font-sans);overflow:hidden}
.arch-root *{box-sizing:border-box;margin:0;padding:0}
.arch-title{position:absolute;left:80px;top:52px;font-family:var(--font-display);font-size:54px;font-weight:800;letter-spacing:-.02em;line-height:1.05;color:var(--text)}
.arch-sub{position:absolute;left:84px;top:124px;font-size:15px;letter-spacing:.34em;color:var(--muted)}
.arch-rail{position:absolute;top:200px;width:290px;height:780px;display:flex;flex-direction:column;gap:12px}
.arch-raill{left:80px}
.arch-railr{left:1550px}
.arch-railhd{font-family:var(--font-display);font-size:21px;font-weight:700;letter-spacing:.1em;color:var(--text);padding-bottom:12px;border-bottom:2px solid var(--accent)}
.arch-cap{flex:1;background:var(--surface);border-radius:12px;border-left:3px solid var(--accent);padding:12px 16px;display:flex;flex-direction:column;justify-content:center;gap:7px}
.arch-ico{width:10px;height:10px;border-radius:3px;background:var(--brand)}
.arch-cap b{font-size:18px;font-weight:700;color:var(--text)}
.arch-cap span{font-size:13px;line-height:1.35;color:var(--muted)}
.arch-band{position:absolute;left:410px;top:200px;width:1100px;height:96px;background:var(--surface);border:1px solid var(--border);border-radius:14px;display:flex;align-items:center;gap:28px;padding:0 28px}
.arch-bandhd{font-size:17px;font-weight:700;color:var(--text);white-space:nowrap}
.arch-banditems{display:flex;flex:1;justify-content:space-between;gap:10px}
.arch-chip{font-size:14px;color:var(--muted);border:1px solid var(--border);border-radius:999px;padding:8px 16px;white-space:nowrap}
.arch-vline{position:absolute;width:2px;background:var(--border)}
.arch-tip{position:absolute;width:12px;height:12px;border-right:2px solid var(--border);border-bottom:2px solid var(--border);transform:rotate(45deg)}
.arch-core{position:absolute;left:410px;top:340px;width:1100px;height:300px;background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:22px 28px;display:flex;flex-direction:column;gap:18px}
.arch-corehd{font-family:var(--font-display);font-size:24px;font-weight:700;letter-spacing:.06em;color:var(--text)}
.arch-steps{display:flex;flex:1;gap:14px}
.arch-step{flex:1;background:color-mix(in srgb,var(--brand) 10%,transparent);border:1px solid var(--border);border-radius:12px;padding:14px;display:flex;flex-direction:column;gap:6px}
.arch-step b{font-size:17px;font-weight:700;color:var(--text)}
.arch-step span{font-size:13px;line-height:1.4;color:var(--muted)}
.arch-panel{position:absolute;top:680px;width:530px;height:300px;background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:22px 26px;display:flex;flex-direction:column;gap:16px}
.arch-pl{left:410px}
.arch-pr{left:980px}
.arch-panelhd{font-family:var(--font-display);font-size:22px;font-weight:700;color:var(--text)}
.arch-grid4{display:flex;gap:12px}
.arch-cell{flex:1;background:color-mix(in srgb,var(--accent) 8%,transparent);border:1px solid var(--border);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:5px}
.arch-cell b{font-size:15px;font-weight:700;color:var(--text)}
.arch-cell span{font-size:12px;line-height:1.35;color:var(--muted)}
.arch-foot{margin-top:auto;display:flex;align-items:center;gap:12px;border-top:2px dashed var(--border);padding-top:14px}
.arch-node{font-size:13px;color:var(--text);background:color-mix(in srgb,var(--text) 6%,transparent);border-radius:8px;padding:8px 12px;white-space:nowrap}
.arch-flow{font-size:13px;color:var(--muted);letter-spacing:.08em}
</style>
<div class="arch-root" style="width:1920px;height:1080px;position:relative">
<div class="arch-title" data-lumen-arch-node>智能体工程全景架构</div>
<div class="arch-sub">核心能力 · 状态记忆 · 协同编排</div>
<div class="arch-rail arch-raill">
<div class="arch-railhd" data-lumen-arch-node>核心能力</div>
<div class="arch-cap" data-lumen-arch-node><div class="arch-ico"></div><b>自主决策</b><span>围绕目标自主拆解任务并选择最优行动</span></div>
<div class="arch-cap" data-lumen-arch-node><div class="arch-ico"></div><b>环境感知</b><span>理解环境、上下文与用户意图</span></div>
<div class="arch-cap" data-lumen-arch-node><div class="arch-ico"></div><b>记忆与学习</b><span>从经验中学习并持续优化表现</span></div>
<div class="arch-cap" data-lumen-arch-node><div class="arch-ico"></div><b>工具使用</b><span>调用内外部工具扩展能力边界</span></div>
<div class="arch-cap" data-lumen-arch-node><div class="arch-ico"></div><b>反思与进化</b><span>自我评估与反思，持续改进策略</span></div>
</div>
<div class="arch-rail arch-railr">
<div class="arch-railhd" data-lumen-arch-node>设计原则</div>
<div class="arch-cap" data-lumen-arch-node><div class="arch-ico"></div><b>以目标为导向</b><span>围绕目标驱动一切规划与行动</span></div>
<div class="arch-cap" data-lumen-arch-node><div class="arch-ico"></div><b>模块化可扩展</b><span>松耦合组件，支持灵活组合</span></div>
<div class="arch-cap" data-lumen-arch-node><div class="arch-ico"></div><b>安全与可信</b><span>可控制可解释，符合安全规范</span></div>
<div class="arch-cap" data-lumen-arch-node><div class="arch-ico"></div><b>可观测可迭代</b><span>全链路追踪，数据驱动优化</span></div>
<div class="arch-cap" data-lumen-arch-node><div class="arch-ico"></div><b>人机协同</b><span>人类在回路，增强协作与信任</span></div>
</div>
<div class="arch-band" data-lumen-arch-node>
<div class="arch-bandhd">用户与外部系统</div>
<div class="arch-banditems">
<span class="arch-chip">用户</span>
<span class="arch-chip">Web / App</span>
<span class="arch-chip">企业系统</span>
<span class="arch-chip">API / 第三方</span>
<span class="arch-chip">设备 / IoT</span>
</div>
</div>
<div class="arch-vline" style="left:959px;top:296px;height:44px"></div>
<div class="arch-tip" style="left:954px;top:328px"></div>
<div class="arch-core" data-lumen-arch-node>
<div class="arch-corehd">智能体核心</div>
<div class="arch-steps">
<div class="arch-step" data-lumen-arch-node><b>感知理解</b><span>输入解析</span><span>意图识别</span><span>实体抽取</span></div>
<div class="arch-step" data-lumen-arch-node><b>规划决策</b><span>目标拆解</span><span>任务规划</span><span>策略生成</span></div>
<div class="arch-step" data-lumen-arch-node><b>推理思考</b><span>逻辑推理</span><span>因果分析</span><span>决策评估</span></div>
<div class="arch-step" data-lumen-arch-node><b>行动执行</b><span>执行计划</span><span>调用工具</span><span>环境交互</span></div>
<div class="arch-step" data-lumen-arch-node><b>反思反馈</b><span>结果评估</span><span>经验总结</span><span>策略优化</span></div>
</div>
</div>
<div class="arch-vline" style="left:959px;top:640px;height:40px"></div>
<div class="arch-tip" style="left:954px;top:664px"></div>
<div class="arch-panel arch-pl" data-lumen-arch-node>
<div class="arch-panelhd">状态管理</div>
<div class="arch-grid4">
<div class="arch-cell" data-lumen-arch-node><b>状态读写</b><span>读写双通道</span></div>
<div class="arch-cell" data-lumen-arch-node><b>状态持久化</b><span>落盘与恢复</span></div>
<div class="arch-cell" data-lumen-arch-node><b>版本一致性</b><span>版本对齐</span></div>
<div class="arch-cell" data-lumen-arch-node><b>冲突解决</b><span>并发消解</span></div>
</div>
<div class="arch-foot">
<span class="arch-node">状态存储</span>
<span class="arch-flow">读写 → 持久化 → 版本校验 → 冲突消解</span>
</div>
</div>
<div class="arch-panel arch-pr" data-lumen-arch-node>
<div class="arch-panelhd">记忆系统</div>
<div class="arch-grid4">
<div class="arch-cell" data-lumen-arch-node><b>工作记忆</b><span>短期上下文</span></div>
<div class="arch-cell" data-lumen-arch-node><b>情景记忆</b><span>历史事件</span></div>
<div class="arch-cell" data-lumen-arch-node><b>语义记忆</b><span>事实知识</span></div>
<div class="arch-cell" data-lumen-arch-node><b>程序记忆</b><span>技能规则</span></div>
</div>
<div class="arch-foot">
<span class="arch-node">记忆生命周期</span>
<span class="arch-flow">捕获 → 总结 → 索引 → 检索 → 更新 → 遗忘</span>
</div>
</div>
</div>`,
  },
  {
    id: "arch/isometric-three-tier@v1",
    name: "等距三层台",
    group: "layer",
    brief: "三块椭圆平台上下叠成等距立体，每层左右挂子项标签，适合画三层平台型能力架构",
    skeleton: `<style>.p{position:absolute;border-radius:50%;background:var(--surface);box-shadow:0 40px 80px color-mix(in srgb,var(--text) 22%,transparent)}.s{position:absolute;border-radius:50%;background:var(--brand);opacity:.22}.t{position:absolute;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-weight:800;color:var(--text)}.l{position:absolute;width:230px;font-size:16px;letter-spacing:.24em;color:var(--muted);text-align:right}.c{position:absolute;width:2px;background:var(--border)}.d{position:absolute;width:10px;height:10px;border-radius:2px;background:var(--brand);opacity:.75}</style><div style="width:1920px;height:1080px;position:relative;background:var(--bg);font-family:var(--font-sans);overflow:hidden"><div data-lumen-arch-node style="position:absolute;left:96px;top:86px;font-family:var(--font-display);font-size:54px;font-weight:800;letter-spacing:-.02em;line-height:1;color:var(--text)">三层能力平台</div><div data-lumen-arch-node style="position:absolute;left:98px;top:168px;font-size:15px;letter-spacing:.32em;color:var(--muted)">能力开放 · 业务中台 · 平台底座</div><div class="s" style="left:660px;top:302px;width:600px;height:170px"></div><div class="p" style="left:660px;top:278px;width:600px;height:170px"></div><div class="t" style="left:660px;top:330px;width:600px;height:70px;font-size:40px" data-lumen-arch-node>能力开放层</div><div class="l" style="left:400px;top:347px" data-lumen-arch-node>接口网关</div><div class="l" style="left:1300px;top:347px;text-align:left" data-lumen-arch-node>开放服务</div><div class="c" style="left:959px;top:452px;height:44px"></div><div class="d" style="left:955px;top:470px"></div><div class="s" style="left:510px;top:528px;width:900px;height:230px"></div><div class="p" style="left:510px;top:500px;width:900px;height:230px"></div><div class="t" style="left:510px;top:580px;width:900px;height:80px;font-size:46px" data-lumen-arch-node>业务中台</div><div class="l" style="left:220px;top:599px" data-lumen-arch-node>用户管理</div><div class="l" style="left:1440px;top:599px;text-align:left" data-lumen-arch-node>权限校验</div><div class="c" style="left:959px;top:734px;height:26px"></div><div class="d" style="left:955px;top:742px"></div><div class="s" style="left:580px;top:790px;width:760px;height:200px"></div><div class="p" style="left:580px;top:762px;width:760px;height:200px"></div><div class="t" style="left:580px;top:824px;width:760px;height:80px;font-size:40px" data-lumen-arch-node>平台底座</div><div class="l" style="left:380px;top:846px" data-lumen-arch-node>存储服务</div><div class="l" style="left:1370px;top:846px;text-align:left" data-lumen-arch-node>监控告警</div></div>`,
  },
  {
    id: "arch/hub-six-spokes@v1",
    name: "中枢六辐条",
    group: "radial",
    brief: "中心一个圆核向外连六根辐条到外圈卫星圆，适合画中台能力辐射与协作关系",
    skeleton: `<style>.ring{position:absolute;border:2px dashed var(--border);border-radius:50%}.spk{position:absolute;width:306px;height:2px;background:var(--border);transform-origin:0 50%}.hub{position:absolute;left:810px;top:470px;width:300px;height:300px;border-radius:50%;background:color-mix(in srgb,var(--brand) 22%,var(--surface));border:2px solid var(--brand);display:flex;align-items:center;justify-content:center;text-align:center;font-family:var(--font-display);font-size:40px;font-weight:800;line-height:1.15;color:var(--text)}.sat{position:absolute;width:150px;height:150px;border-radius:50%;background:var(--surface);border:2px solid var(--border);display:flex;align-items:center;justify-content:center;text-align:center;font-size:20px;font-weight:600;letter-spacing:.05em;color:var(--text)}</style><div style="width:1920px;height:1080px;position:relative;background:var(--bg);font-family:var(--font-sans);overflow:hidden"><div data-lumen-arch-node style="position:absolute;left:96px;top:86px;font-family:var(--font-display);font-size:54px;font-weight:800;letter-spacing:-.02em;line-height:1;color:var(--text)">中枢能力辐射</div><div data-lumen-arch-node style="position:absolute;left:98px;top:168px;font-size:15px;letter-spacing:.32em;color:var(--muted)">一个中枢 · 六项能力 · 统一调度</div><div class="ring" style="left:610px;top:270px;width:700px;height:700px"></div><div class="spk" style="left:960px;top:619px;transform:rotate(-150deg)"></div><div class="spk" style="left:960px;top:619px;transform:rotate(-30deg)"></div><div class="spk" style="left:960px;top:619px;width:355px;transform:rotate(180deg)"></div><div class="spk" style="left:960px;top:619px;width:355px;transform:rotate(0deg)"></div><div class="spk" style="left:960px;top:619px;transform:rotate(150deg)"></div><div class="spk" style="left:960px;top:619px;transform:rotate(30deg)"></div><div class="hub" data-lumen-arch-node>数据中台</div><div class="sat" style="left:555px;top:355px" data-lumen-arch-node>用户中心</div><div class="sat" style="left:1215px;top:355px" data-lumen-arch-node>权限校验</div><div class="sat" style="left:455px;top:545px" data-lumen-arch-node>实时同步</div><div class="sat" style="left:1315px;top:545px" data-lumen-arch-node>批处理</div><div class="sat" style="left:555px;top:735px" data-lumen-arch-node>监控告警</div><div class="sat" style="left:1215px;top:735px" data-lumen-arch-node>配置中心</div></div>`,
  },
  {
    id: "arch/hub-three-branch-return@v1",
    name: "中枢三支回流",
    group: "flow",
    brief: "顶部主控节点居中，向下分派标签后横铺三条并行支线，底部汇流复核，适合画调度链路",
    skeleton: `<div style='width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden'><style>.a-title{position:absolute;left:120px;top:62px;font-family:var(--font-display);font-size:58px;font-weight:800;line-height:1;letter-spacing:-.01em;color:var(--text)}.a-sub{position:absolute;left:124px;top:150px;font-size:18px;letter-spacing:.3em;color:var(--muted)}.a-rule{position:absolute;left:120px;top:206px;width:1680px;height:1px;background:var(--border)}.a-main{position:absolute;left:700px;top:258px;width:520px;height:104px;border:2px solid var(--accent);border-radius:14px;background:var(--surface);padding-top:20px;box-sizing:border-box;text-align:center}.a-main b{display:block;font-family:var(--font-display);font-size:30px;font-weight:800;color:var(--text)}.a-main span{display:block;margin-top:10px;font-size:15px;letter-spacing:.22em;color:var(--muted)}.a-v{position:absolute;width:2px;background:var(--border)}.a-h{position:absolute;height:2px;background:var(--border)}.a-arrow{position:absolute;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid var(--border)}.a-tag{position:absolute;left:660px;top:422px;width:600px;height:50px;border:2px dashed var(--border);border-radius:25px;text-align:center;line-height:46px;font-size:16px;letter-spacing:.24em;color:var(--muted)}.a-card{position:absolute;top:562px;width:420px;height:250px;background:var(--surface);border:2px solid var(--border);border-radius:16px;padding:30px 32px;box-sizing:border-box}.a-k{font-size:14px;letter-spacing:.28em;color:var(--muted)}.a-n{margin-top:16px;font-family:var(--font-display);font-size:34px;font-weight:800;color:var(--text)}.a-d{margin-top:14px;font-size:17px;line-height:1.5;color:var(--muted)}.a-s{margin-top:22px;font-size:16px;font-weight:700;color:var(--text)}.a-dot{display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--accent);margin-right:10px;vertical-align:middle}.a-end{position:absolute;left:610px;top:912px;width:700px;height:104px;border:2px solid var(--accent);border-radius:14px;background:color-mix(in srgb,var(--accent) 16%,transparent);padding-top:22px;box-sizing:border-box;text-align:center}.a-end b{display:block;font-family:var(--font-display);font-size:28px;font-weight:800;color:var(--text)}.a-end span{display:block;margin-top:8px;font-size:15px;letter-spacing:.2em;color:var(--muted)}</style><div class='a-title' data-lumen-arch-node>智能体调度链路</div><div class='a-sub'>任务下发 · 并行执行 · 结果回写</div><div class='a-rule'></div><div class='a-main' data-lumen-arch-node><b>主控编排</b><span>规划 · 分配 · 校验</span></div><div class='a-v' style='left:959px;top:362px;height:60px'></div><div class='a-tag' data-lumen-arch-node>并行分派 · 最大并发 6 · 中等强度</div><div class='a-v' style='left:959px;top:472px;height:48px'></div><div class='a-h' style='left:450px;top:520px;width:1020px'></div><div class='a-v' style='left:449px;top:520px;height:31px'></div><div class='a-v' style='left:959px;top:520px;height:31px'></div><div class='a-v' style='left:1469px;top:520px;height:31px'></div><div class='a-arrow' style='left:443px;top:551px'></div><div class='a-arrow' style='left:953px;top:551px'></div><div class='a-arrow' style='left:1463px;top:551px'></div><div class='a-card' style='left:240px' data-lumen-arch-node><div class='a-k'>01 · 执行单元</div><div class='a-n'>计算引擎</div><div class='a-d'>编辑代码 · 运行测试</div><div class='a-s'><span class='a-dot'></span>运行中</div></div><div class='a-card' style='left:750px' data-lumen-arch-node><div class='a-k'>02 · 执行单元</div><div class='a-n'>检索服务</div><div class='a-d'>读取文档 · 汇总要点</div><div class='a-s'><span class='a-dot'></span>运行中</div></div><div class='a-card' style='left:1260px' data-lumen-arch-node><div class='a-k'>03 · 执行单元</div><div class='a-n'>校验服务</div><div class='a-d'>比对差异 · 拉取变更</div><div class='a-s'><span class='a-dot'></span>运行中</div></div><div class='a-v' style='left:449px;top:812px;height:49px'></div><div class='a-v' style='left:959px;top:812px;height:49px'></div><div class='a-v' style='left:1469px;top:812px;height:49px'></div><div class='a-h' style='left:450px;top:861px;width:1020px'></div><div class='a-v' style='left:959px;top:863px;height:40px'></div><div class='a-arrow' style='left:953px;top:903px'></div><div class='a-end' data-lumen-arch-node><b>主控复核 · 归档</b><span>结果回写 · 校验通过</span></div></div>`,
  },
  {
    id: "arch/rail-notes-quad-grid@v1",
    name: "左注释右四格",
    group: "matrix",
    brief: "左侧一条虚线注释轨竖排若干说明，右侧 2×2 等大模块格，适合画模块清单加旁注",
    skeleton: `<div style='width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden'><style>.b-title{position:absolute;left:120px;top:62px;font-family:var(--font-display);font-size:58px;font-weight:800;line-height:1;letter-spacing:-.01em;color:var(--text)}.b-sub{position:absolute;left:124px;top:150px;font-size:18px;letter-spacing:.3em;color:var(--muted)}.b-rule{position:absolute;left:120px;top:206px;width:1680px;height:1px;background:var(--border)}.b-rail{position:absolute;left:120px;top:258px;width:460px;height:752px;border:2px dashed var(--border);border-radius:18px;padding:36px 34px;box-sizing:border-box}.b-rail-h{font-family:var(--font-display);font-size:26px;font-weight:800;letter-spacing:.04em;color:var(--text)}.b-note{position:relative;margin-top:38px;padding-left:26px}.b-note:before{content:'';position:absolute;left:0;top:8px;width:9px;height:9px;background:var(--accent);transform:rotate(45deg)}.b-note b{display:block;font-size:19px;font-weight:700;color:var(--text)}.b-note span{display:block;margin-top:8px;font-size:15px;line-height:1.5;color:var(--muted)}.b-rail-f{position:absolute;left:34px;bottom:36px;font-size:14px;letter-spacing:.26em;color:var(--muted)}.b-card{position:absolute;width:550px;height:346px;background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:36px 38px;box-sizing:border-box}.b-k{font-size:14px;letter-spacing:.3em;color:var(--muted)}.b-n{margin-top:18px;font-family:var(--font-display);font-size:34px;font-weight:800;color:var(--text)}.b-li{position:relative;margin-top:14px;padding-left:20px;font-size:17px;line-height:1.5;color:var(--muted)}.b-li:before{content:'';position:absolute;left:0;top:12px;width:8px;height:2px;background:var(--accent)}</style><div class='b-title' data-lumen-arch-node>能力矩阵与运行注释</div><div class='b-sub'>左侧注释轨 · 右侧模块格</div><div class='b-rule'></div><div class='b-rail' data-lumen-arch-node><div class='b-rail-h'>运行注释</div><div class='b-note'><b>异常重试</b><span>同一任务最多重放三次，超限转入人工队列</span></div><div class='b-note'><b>静默运行</b><span>常规轮次不打扰主控，仅在结束时统一报备</span></div><div class='b-note'><b>触发时机</b><span>计划前、计划后与结果校验三个阶段各触发一次</span></div><div class='b-note'><b>上下文引用</b><span>只读取计划与差异集，不写入业务库</span></div><div class='b-rail-f'>注释轨 · 全文只读</div></div><div class='b-card' style='left:640px;top:258px' data-lumen-arch-node><div class='b-k'>模块 01</div><div class='b-n'>数据接入层</div><div class='b-li'>实时同步 · 变更捕获</div><div class='b-li'>批量入库 · 断点续传</div><div class='b-li'>数据源注册与探活</div></div><div class='b-card' style='left:1250px;top:258px' data-lumen-arch-node><div class='b-k'>模块 02</div><div class='b-n'>计算引擎</div><div class='b-li'>规则计算 · 流式处理</div><div class='b-li'>任务编排 · 依赖调度</div><div class='b-li'>算力弹性分配</div></div><div class='b-card' style='left:640px;top:664px' data-lumen-arch-node><div class='b-k'>模块 03</div><div class='b-n'>存储服务</div><div class='b-li'>冷热分层 · 副本管理</div><div class='b-li'>快照回滚 · 归档清理</div><div class='b-li'>读写分离与配额</div></div><div class='b-card' style='left:1250px;top:664px' data-lumen-arch-node><div class='b-k'>模块 04</div><div class='b-n'>能力开放</div><div class='b-li'>接口网关 · 权限校验</div><div class='b-li'>调用计量 · 限流熔断</div><div class='b-li'>开放文档与沙箱</div></div></div>`,
  },
  {
    id: "arch/pyramid-side-columns@v1",
    name: "锥形底座双侧栏",
    group: "layer",
    brief: "中央锥形分层塔逐层加宽，左右各一列对照卡片，适合现状与目标两栏对比加中间分层",
    skeleton: `<style>
.pyr-root{width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);font-family:var(--font-sans)}
.pyr-h1{position:absolute;left:96px;top:44px;font-family:var(--font-display);font-size:56px;font-weight:800;line-height:1;letter-spacing:-.01em;color:var(--text)}
.pyr-sub{position:absolute;left:100px;top:120px;font-size:18px;letter-spacing:.3em;color:var(--muted)}
.col-head{position:absolute;width:330px;font-family:var(--font-display);font-size:28px;font-weight:800;letter-spacing:.06em;color:var(--text);padding-bottom:14px;border-bottom:3px solid var(--accent)}
.col-card{position:absolute;width:330px;height:120px;box-sizing:border-box;background:var(--surface);border:1px solid var(--border);border-left:6px solid var(--accent);border-radius:10px;padding:20px 24px;box-shadow:0 24px 48px color-mix(in srgb,var(--text) 16%,transparent)}
.col-card-t{font-size:19px;font-weight:700;letter-spacing:.04em;color:var(--text);line-height:1.4}
.col-card-s{font-size:15px;letter-spacing:.06em;color:var(--muted);margin-top:10px;line-height:1.4}
.pyr-band{position:absolute;left:50%;transform:translateX(-50%);box-sizing:border-box;background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:0 30px 60px color-mix(in srgb,var(--text) 18%,transparent);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px}
.pyr-name{font-family:var(--font-display);font-size:28px;font-weight:800;letter-spacing:.06em;color:var(--text)}
.pyr-items{display:flex;gap:34px}
.pyr-items div{font-size:16px;letter-spacing:.12em;color:var(--muted)}
.pyr-note{position:absolute;left:50%;transform:translateX(-50%);font-size:15px;letter-spacing:.3em;color:var(--muted)}
</style>
<div class="pyr-root">
<div class="pyr-h1" data-lumen-arch-node>构建以知识为中心的数据底座</div>
<div class="pyr-sub">两侧对照 · 中央分层底座</div>
<div class="col-head" style="left:96px;top:180px" data-lumen-arch-node>传统安全</div>
<div class="col-card" style="left:96px;top:252px" data-lumen-arch-node><div class="col-card-t">全局资产难盘点</div><div class="col-card-s">云内资产无感知</div></div>
<div class="col-card" style="left:96px;top:396px" data-lumen-arch-node><div class="col-card-t">全局数据难联通</div><div class="col-card-s">云内外数据孤岛</div></div>
<div class="col-card" style="left:96px;top:540px" data-lumen-arch-node><div class="col-card-t">威胁分析难精准</div><div class="col-card-s">威胁数据源有限</div></div>
<div class="col-card" style="left:96px;top:684px" data-lumen-arch-node><div class="col-card-t">响应处置难协同</div><div class="col-card-s">安全与资源割裂</div></div>
<div class="col-card" style="left:96px;top:828px" data-lumen-arch-node><div class="col-card-t">性能瓶颈难弹性</div><div class="col-card-s">限于软硬件规格</div></div>
<div class="col-head" style="left:1494px;top:180px" data-lumen-arch-node>云原生安全</div>
<div class="col-card" style="left:1494px;top:252px" data-lumen-arch-node><div class="col-card-t">资产与安全一体化</div><div class="col-card-s">资产变动秒级感知</div></div>
<div class="col-card" style="left:1494px;top:396px" data-lumen-arch-node><div class="col-card-t">云内数据无缝对接</div><div class="col-card-s">对象存储与块存储</div></div>
<div class="col-card" style="left:1494px;top:540px" data-lumen-arch-node><div class="col-card-t">威胁分析数据源广</div><div class="col-card-s">日志与事件汇聚</div></div>
<div class="col-card" style="left:1494px;top:684px" data-lumen-arch-node><div class="col-card-t">自动协同与响应</div><div class="col-card-s">模型化预案剧本</div></div>
<div class="col-card" style="left:1494px;top:828px" data-lumen-arch-node><div class="col-card-t">安全性能弹性扩展</div><div class="col-card-s">分钟级弹性伸缩</div></div>
<div class="pyr-band" style="top:180px;width:560px;height:118px">
<div class="pyr-name" data-lumen-arch-node>数智应用层</div>
<div class="pyr-items"><div data-lumen-arch-node>智能决策</div><div data-lumen-arch-node>知识洞察</div><div data-lumen-arch-node>自助分析</div></div>
</div>
<div class="pyr-band" style="top:318px;width:660px;height:124px">
<div class="pyr-name" data-lumen-arch-node>知识服务层</div>
<div class="pyr-items"><div data-lumen-arch-node>知识抽取</div><div data-lumen-arch-node>本体建模</div><div data-lumen-arch-node>图谱检索</div></div>
</div>
<div class="pyr-band" style="top:462px;width:760px;height:132px">
<div class="pyr-name" data-lumen-arch-node>数智开发治理层</div>
<div class="pyr-items"><div data-lumen-arch-node>数据接入</div><div data-lumen-arch-node>存储层</div><div data-lumen-arch-node>处理层</div><div data-lumen-arch-node>分析服务</div></div>
</div>
<div class="pyr-band" style="top:614px;width:860px;height:132px">
<div class="pyr-name" data-lumen-arch-node>数据与算法层</div>
<div class="pyr-items"><div data-lumen-arch-node>模型训练</div><div data-lumen-arch-node>推理服务</div><div data-lumen-arch-node>特征平台</div></div>
</div>
<div class="pyr-band" style="top:766px;width:960px;height:148px">
<div class="pyr-name" data-lumen-arch-node>大模型底座</div>
<div class="pyr-items"><div data-lumen-arch-node>统一元数据</div><div data-lumen-arch-node>弹性算力</div><div data-lumen-arch-node>安全管控</div></div>
</div>
<div class="pyr-note" style="top:942px">加密管理 · 访问控制 · 数据保护</div>
</div>`,
  },
  {
    id: "arch/inverted-funnel-tiers@v1",
    name: "倒锥五层束",
    group: "layer",
    brief: "自上而下宽度递减的五层束状带，每层一句层名加一行子项，适合策略拆解与漏斗式收敛。",
    skeleton: `<style>
.l2{position:relative;width:1920px;height:1080px;background:var(--bg);overflow:hidden;font-family:var(--font-sans);color:var(--text)}
.l2 .kicker{position:absolute;left:120px;top:56px;font-size:15px;letter-spacing:.34em;color:var(--muted)}
.l2 .title{position:absolute;left:120px;top:84px;font-family:var(--font-display);font-size:56px;font-weight:800;letter-spacing:-.02em;line-height:1;color:var(--text)}
.l2 .funnel{position:absolute;left:160px;top:170px;width:1600px;height:870px;background:color-mix(in srgb,var(--accent) 11%,transparent);clip-path:polygon(0 0,100% 0,78% 100%,22% 100%)}
.l2 .band{position:absolute;height:150px;border-radius:16px;border:1px solid var(--border);background:color-mix(in srgb,var(--surface) 55%,transparent)}
.l2 .idx{position:absolute;left:22px;top:18px;font-size:13px;letter-spacing:.26em;color:var(--muted)}
.l2 .bt{position:absolute;left:0;top:24px;width:100%;text-align:center;font-family:var(--font-display);font-size:30px;font-weight:800;letter-spacing:.04em;color:var(--text)}
.l2 .row{position:absolute;left:0;top:78px;width:100%;display:flex;justify-content:center;gap:56px}
.l2 .item{font-size:17px;letter-spacing:.08em;color:var(--muted)}
.l2 .chip{height:40px;padding:0 26px;display:flex;align-items:center;border-radius:20px;font-size:17px;letter-spacing:.08em;color:var(--text);background:color-mix(in srgb,var(--accent) 22%,transparent);border:1px solid var(--accent)}
</style>
<div class="l2">
<div class="kicker" data-lumen-arch-node>逻辑框架 · 分层拆解</div>
<div class="title" data-lumen-arch-node>系统性拆解架构制定策略</div>
<div class="funnel"></div>
<div class="band" style="left:200px;top:170px;width:1520px">
<div class="idx">L1</div>
<div class="bt" data-lumen-arch-node>助力业务</div>
<div class="row"><div class="item" data-lumen-arch-node>业务提效</div><div class="item" data-lumen-arch-node>商业赋能</div><div class="item" data-lumen-arch-node>框架多元</div></div>
</div>
<div class="band" style="left:295px;top:350px;width:1330px">
<div class="idx">L2</div>
<div class="bt" data-lumen-arch-node>清爽升级</div>
<div class="row"><div class="item" data-lumen-arch-node>框架创意</div><div class="item" data-lumen-arch-node>观看体验</div><div class="item" data-lumen-arch-node>场景拓展</div><div class="item" data-lumen-arch-node>层级顺畅</div></div>
</div>
<div class="band" style="left:390px;top:530px;width:1140px">
<div class="idx">L3</div>
<div class="bt" data-lumen-arch-node>结合场景做设计</div>
<div class="row"><div class="item" data-lumen-arch-node>提数降噪</div><div class="item" data-lumen-arch-node>场景分割</div><div class="item" data-lumen-arch-node>业务合作</div><div class="item" data-lumen-arch-node>三场三态</div><div class="item" data-lumen-arch-node>用户审美</div><div class="item" data-lumen-arch-node>设计趋势</div></div>
</div>
<div class="band" style="left:480px;top:710px;width:960px">
<div class="idx">L4</div>
<div class="bt" data-lumen-arch-node>设计策略</div>
<div class="row"><div class="chip" data-lumen-arch-node>框架升级</div><div class="chip" data-lumen-arch-node>视觉降噪</div><div class="chip" data-lumen-arch-node>体验一致</div><div class="chip" data-lumen-arch-node>资源管控</div></div>
</div>
<div class="band" style="left:570px;top:890px;width:780px">
<div class="idx">L5</div>
<div class="bt" data-lumen-arch-node>问题洞察</div>
<div class="row"><div class="item" data-lumen-arch-node>框架灵活性差</div><div class="item" data-lumen-arch-node>色彩层级混乱</div><div class="item" data-lumen-arch-node>荣誉出口过多</div><div class="item" data-lumen-arch-node>交互规范不细</div></div>
</div>
</div>`,
  },
  {
    id: "arch/hub-seven-orbit@v1",
    name: "中枢七辐环",
    group: "radial",
    brief: "中心一个圆形中枢，七个节点沿虚线圈环绕分布，适合画核心能力加外围七层协作的结构",
    skeleton: `<div class='hub-root' style='width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden'><style>.hub-root{font-family:var(--font-sans);color:var(--text)}.hub-root .ttl{position:absolute;left:120px;top:58px;font-family:var(--font-display);font-size:62px;font-weight:800;letter-spacing:-.02em;line-height:1}.hub-root .sub{position:absolute;left:124px;top:144px;font-size:19px;letter-spacing:.18em;color:var(--muted)}.hub-root .rule{position:absolute;left:120px;top:190px;width:1680px;height:2px;background:var(--border)}.hub-root .ring{position:absolute;left:320px;top:300px;width:1280px;height:700px;border:2px dashed var(--border);border-radius:50%}.hub-root .hub{position:absolute;left:790px;top:480px;width:340px;height:340px;border-radius:50%;border:2px solid var(--accent);background:color-mix(in srgb,var(--accent) 12%,transparent);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 34px}.hub-root .hub-t{font-family:var(--font-display);font-size:46px;font-weight:800;line-height:1.05;letter-spacing:-.02em}.hub-root .hub-s{margin-top:16px;font-size:14px;line-height:1.7;letter-spacing:.16em;color:var(--muted)}.hub-root .card{position:absolute;width:336px;transform:translate(-50%,-50%);background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:22px 26px;box-shadow:0 26px 56px color-mix(in srgb,var(--text) 14%,transparent)}.hub-root .num{font-size:12px;font-weight:700;letter-spacing:.26em;color:var(--accent)}.hub-root .ct{font-family:var(--font-display);font-size:25px;font-weight:800;line-height:1.2;margin-top:8px}.hub-root .cb{margin-top:10px;font-size:14px;line-height:1.6;color:var(--muted)}</style><div class='ttl' data-lumen-arch-node>系统分层架构</div><div class='sub'>七个核心层次 · 层层协作 · 驱动价值输出</div><div class='rule'></div><div class='ring'></div><div class='hub' data-lumen-arch-node><div class='hub-t'>能力中枢</div><div class='hub-s'>接入 · 计算 · 服务 · 治理</div></div><div class='card' data-lumen-arch-node style='left:960px;top:300px'><div class='num'>01</div><div class='ct'>基础模型</div><div class='cb'>原始信息转换为可处理的语义与知识表示</div></div><div class='card' data-lumen-arch-node style='left:1460px;top:432px'><div class='num'>02</div><div class='ct'>提示词</div><div class='cb'>与系统交互的自然语言入口与指令集合</div></div><div class='card' data-lumen-arch-node style='left:1584px;top:728px'><div class='num'>03</div><div class='ct'>上下文</div><div class='cb'>历史对话与背景信息构成的记忆依据</div></div><div class='card' data-lumen-arch-node style='left:1238px;top:965px'><div class='num'>04</div><div class='ct'>智能体</div><div class='cb'>自主理解目标、规划步骤并调用工具执行</div></div><div class='card' data-lumen-arch-node style='left:682px;top:965px'><div class='num'>05</div><div class='ct'>安全约束</div><div class='cb'>输出可靠可控，设定边界、权限与规则</div></div><div class='card' data-lumen-arch-node style='left:336px;top:728px'><div class='num'>06</div><div class='ct'>通信协议</div><div class='cb'>与外部工具、数据源之间的标准化连接</div></div><div class='card' data-lumen-arch-node style='left:460px;top:432px'><div class='num'>07</div><div class='ct'>技能包</div><div class='cb'>可复用的能力集合与工具方法沉淀</div></div></div>`,
  },
  {
    id: "arch/seven-step-chain@v1",
    name: "七步流程链",
    group: "flow",
    brief: "七个步骤横向一字排开，步骤之间用箭头串联，适合画单向推进的链路与处理阶段",
    skeleton: `<div class='flo-root' style='width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden'><style>.flo-root{font-family:var(--font-sans);color:var(--text)}.flo-root .ttl{position:absolute;left:120px;top:58px;font-family:var(--font-display);font-size:62px;font-weight:800;letter-spacing:-.02em;line-height:1}.flo-root .sub{position:absolute;left:124px;top:144px;font-size:19px;letter-spacing:.18em;color:var(--muted)}.flo-root .rule{position:absolute;left:120px;top:190px;width:1680px;height:2px;background:var(--border)}.flo-root .box{position:absolute;left:90px;top:248px;width:1740px;height:588px;background:var(--surface);border:1px solid var(--border);border-radius:28px;display:flex;align-items:center;padding:0 56px}.flo-root .step{flex:1;display:flex;flex-direction:column;align-items:center;text-align:center;padding:0 4px}.flo-root .ic{width:96px;height:96px;border-radius:24px;border:1px solid var(--border);background:color-mix(in srgb,var(--accent) 14%,transparent);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:30px;font-weight:800;color:var(--accent)}.flo-root .st{margin-top:24px;font-size:22px;font-weight:700;line-height:1.25}.flo-root .sb{margin-top:12px;font-size:14px;line-height:1.6;color:var(--muted)}.flo-root .arw{flex:none;display:flex;align-items:center}.flo-root .arw .ln{width:18px;height:2px;background:var(--border)}.flo-root .arw .ch{width:10px;height:10px;border-top:2px solid var(--border);border-right:2px solid var(--border);transform:rotate(45deg);margin-left:-6px}.flo-root .foot-rule{position:absolute;left:120px;top:876px;width:1680px;height:0;border-top:2px dashed var(--border)}.flo-root .foot{position:absolute;left:120px;top:900px;font-size:15px;letter-spacing:.2em;color:var(--muted)}</style><div class='ttl' data-lumen-arch-node>数据流转链路</div><div class='sub'>七个环节 · 单向推进 · 端到端可编排</div><div class='rule'></div><div class='box'><div class='step' data-lumen-arch-node><div class='ic'>01</div><div class='st'>数据采集</div><div class='sb'>多源接入</div></div><div class='arw'><div class='ln'></div><div class='ch'></div></div><div class='step' data-lumen-arch-node><div class='ic'>02</div><div class='st'>指令解析</div><div class='sb'>规则校验</div></div><div class='arw'><div class='ln'></div><div class='ch'></div></div><div class='step' data-lumen-arch-node><div class='ic'>03</div><div class='st'>上下文装载</div><div class='sb'>背景补齐</div></div><div class='arw'><div class='ln'></div><div class='ch'></div></div><div class='step' data-lumen-arch-node><div class='ic'>04</div><div class='st'>任务执行</div><div class='sb'>调度编排</div></div><div class='arw'><div class='ln'></div><div class='ch'></div></div><div class='step' data-lumen-arch-node><div class='ic'>05</div><div class='st'>安全管控</div><div class='sb'>权限校验</div></div><div class='arw'><div class='ln'></div><div class='ch'></div></div><div class='step' data-lumen-arch-node><div class='ic'>06</div><div class='st'>协同连接</div><div class='sb'>接口调用</div></div><div class='arw'><div class='ln'></div><div class='ch'></div></div><div class='step' data-lumen-arch-node><div class='ic'>07</div><div class='st'>能力输出</div><div class='sb'>结果交付</div></div></div><div class='foot-rule'></div><div class='foot'>全链路异步编排 · 节点可插拔替换</div></div>`,
  },
  {
    id: "arch/five-column-matrix@v1",
    name: "五列价值矩阵",
    group: "matrix",
    brief: "五个等宽卡片横向并排，每张卡自带编号、标题与说明，适合画并列的能力域或价值主张",
    skeleton: `<div class='mat-root' style='width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden'><style>.mat-root{font-family:var(--font-sans);color:var(--text)}.mat-root .ttl{position:absolute;left:120px;top:58px;font-family:var(--font-display);font-size:62px;font-weight:800;letter-spacing:-.02em;line-height:1}.mat-root .sub{position:absolute;left:124px;top:144px;font-size:19px;letter-spacing:.18em;color:var(--muted)}.mat-root .rule{position:absolute;left:120px;top:190px;width:1680px;height:2px;background:var(--border)}.mat-root .row{position:absolute;left:120px;top:266px;width:1680px;display:flex;gap:30px}.mat-root .card{flex:1;background:var(--surface);border:1px solid var(--border);border-radius:22px;padding:36px 30px 30px;min-height:650px;display:flex;flex-direction:column;box-shadow:0 26px 56px color-mix(in srgb,var(--text) 12%,transparent)}.mat-root .ic{width:72px;height:72px;border-radius:18px;background:color-mix(in srgb,var(--accent) 14%,transparent);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:26px;font-weight:800;color:var(--accent)}.mat-root .ct{margin-top:28px;font-family:var(--font-display);font-size:28px;font-weight:800;line-height:1.15}.mat-root .cb{margin-top:16px;font-size:15px;line-height:1.75;color:var(--muted)}.mat-root .tag{margin-top:auto;padding-top:20px;border-top:2px dashed var(--border);font-size:14px;line-height:1.6;color:var(--muted)}</style><div class='ttl' data-lumen-arch-node>能力价值矩阵</div><div class='sub'>五个并列能力域 · 各自独立演进</div><div class='rule'></div><div class='row'><div class='card' data-lumen-arch-node><div class='ic'>01</div><div class='ct'>高效</div><div class='cb'>自动化处理复杂任务，缩短链路耗时，提升整体吞吐</div><div class='tag'>指标：处理时延</div></div><div class='card' data-lumen-arch-node><div class='ic'>02</div><div class='ct'>可靠</div><div class='cb'>保障运行安全与合规，降低故障影响面与风险</div><div class='tag'>指标：可用性</div></div><div class='card' data-lumen-arch-node><div class='ic'>03</div><div class='ct'>灵活</div><div class='cb'>快速适配多场景，模块可插拔、可组合、可替换</div><div class='tag'>指标：接入周期</div></div><div class='card' data-lumen-arch-node><div class='ic'>04</div><div class='ct'>智能</div><div class='cb'>持续学习与迭代优化，逐步沉淀可复用的能力</div><div class='tag'>指标：准确率</div></div><div class='card' data-lumen-arch-node><div class='ic'>05</div><div class='ct'>价值</div><div class='cb'>驱动创新决策，形成可衡量的业务与商业价值</div><div class='tag'>指标：投入产出</div></div></div></div>`,
  },
  {
    id: "arch/isometric-four-tier@v1",
    name: "等距四层台",
    group: "layer",
    brief: "四块椭圆台面自上而下逐层变宽、压叠成塔，左侧配层名与引导线，适合画分层底座结构",
    skeleton: `<style>.l1-title{position:absolute;left:100px;top:64px;font-family:var(--font-display);font-size:60px;font-weight:900;letter-spacing:-.02em;line-height:1;color:var(--text)}.l1-sub{position:absolute;left:102px;top:146px;font-size:19px;letter-spacing:.24em;color:var(--muted)}.l1-tags{position:absolute;left:560px;top:190px;width:1280px;display:flex;gap:40px}.l1-tag{flex:1;text-align:center;font-size:17px;letter-spacing:.16em;color:var(--muted);padding-bottom:12px;border-bottom:1px solid var(--border)}.l1-plate{position:absolute}.l1-wall{position:absolute;left:0;top:16px;width:100%;height:100%;border-radius:50%;background:var(--brand);opacity:.2}.l1-face{position:absolute;left:0;top:0;width:100%;height:100%;border-radius:50%;background:var(--surface);border:2px solid var(--border);box-shadow:0 40px 80px color-mix(in srgb,var(--text) 22%,transparent);display:flex;flex-direction:column;align-items:center;justify-content:center}.l1-name{font-family:var(--font-display);font-size:36px;font-weight:800;letter-spacing:.02em;color:var(--text)}.l1-sub2{font-size:15px;letter-spacing:.3em;color:var(--muted);margin-top:10px}.l1-label{position:absolute;left:120px;width:350px;display:flex;align-items:center;gap:18px}.l1-num{font-family:var(--font-display);font-size:20px;font-weight:700;letter-spacing:.1em;color:var(--accent)}.l1-lname{font-size:32px;font-weight:700;line-height:1.1;color:var(--text)}.l1-ltag{font-size:15px;letter-spacing:.2em;color:var(--muted);margin-top:8px}.l1-lead{position:absolute;height:0;border-top:1px dashed var(--border)}.l1-node{position:absolute;left:1150px;margin-left:-8px;width:16px;height:16px;background:var(--accent);opacity:.8;transform:rotate(45deg)}.l1-foot{position:absolute;left:120px;top:930px;width:340px;font-size:16px;line-height:1.6;letter-spacing:.12em;color:var(--muted)}</style><div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden"><div class="l1-title" data-lumen-arch-node>数据平台分层架构</div><div class="l1-sub">自上而下逐层收敛 · 统一接入 · 分层治理</div><div class="l1-tags"><div class="l1-tag" data-lumen-arch-node>企业服务</div><div class="l1-tag" data-lumen-arch-node>数据源</div><div class="l1-tag" data-lumen-arch-node>数据智能</div><div class="l1-tag" data-lumen-arch-node>云原生</div><div class="l1-tag" data-lumen-arch-node>集成组</div><div class="l1-tag" data-lumen-arch-node>云安全</div></div><div class="l1-label" style="top:300px"><div class="l1-num">L1</div><div><div class="l1-lname" data-lumen-arch-node>能力开放层</div><div class="l1-ltag" data-lumen-arch-node>开放接口与网关</div></div></div><div class="l1-lead" style="left:470px;top:340px;width:320px"></div><div class="l1-label" style="top:455px"><div class="l1-num">L2</div><div><div class="l1-lname" data-lumen-arch-node>计算引擎</div><div class="l1-ltag" data-lumen-arch-node>实时与离线计算</div></div></div><div class="l1-lead" style="left:470px;top:495px;width:240px"></div><div class="l1-label" style="top:620px"><div class="l1-num">L3</div><div><div class="l1-lname" data-lumen-arch-node>数据接入层</div><div class="l1-ltag" data-lumen-arch-node>采集 清洗 入库</div></div></div><div class="l1-lead" style="left:470px;top:660px;width:160px"></div><div class="l1-label" style="top:790px"><div class="l1-num">L4</div><div><div class="l1-lname" data-lumen-arch-node>存储底座</div><div class="l1-ltag" data-lumen-arch-node>统一存储与治理</div></div></div><div class="l1-lead" style="left:470px;top:830px;width:100px"></div><div class="l1-plate" style="left:550px;top:700px;width:1160px;height:260px"><div class="l1-wall"></div><div class="l1-face"><div class="l1-name" data-lumen-arch-node>存储底座</div><div class="l1-sub2">统一存储与治理</div></div></div><div class="l1-plate" style="left:630px;top:540px;width:1040px;height:240px"><div class="l1-wall"></div><div class="l1-face"><div class="l1-name" data-lumen-arch-node>数据接入层</div><div class="l1-sub2">采集 清洗 入库</div></div></div><div class="l1-plate" style="left:710px;top:390px;width:880px;height:210px"><div class="l1-wall"></div><div class="l1-face"><div class="l1-name" data-lumen-arch-node>计算引擎</div><div class="l1-sub2">实时与离线计算</div></div></div><div class="l1-plate" style="left:790px;top:250px;width:720px;height:180px"><div class="l1-wall"></div><div class="l1-face"><div class="l1-name" data-lumen-arch-node>能力开放层</div><div class="l1-sub2">开放接口与网关</div></div></div><div class="l1-node" style="top:437px"></div><div class="l1-node" style="top:607px"></div><div class="l1-node" style="top:782px"></div><div class="l1-foot">层间依赖自上而下收敛，底层为共用底座，上层只暴露能力接口。</div></div>`,
  },
  {
    id: "arch/phase-arc-flow@v1",
    name: "阶段环带流程",
    group: "flow",
    brief: "一条横向主轴贯穿全程，五个阶段各罩一圈椭圆环带，环上下挂关键动作节点，适合画从售前到售后的阶段流程。",
    skeleton: `<div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden;font-family:var(--font-sans)"><style>.ph-t{position:absolute;left:120px;top:52px;font-family:var(--font-display);font-size:68px;font-weight:800;color:var(--text);letter-spacing:-.02em}.ph-s{position:absolute;left:124px;top:146px;font-size:19px;letter-spacing:.28em;color:var(--muted)}.axis{position:absolute;left:120px;top:600px;width:1650px;height:2px;background:var(--border)}.axis-head{position:absolute;left:1766px;top:588px;width:26px;height:26px;background:var(--accent);clip-path:polygon(0 0,100% 50%,0 100%)}.ph{position:absolute;top:240px;width:320px;height:720px}.ring{position:absolute;left:-90px;top:120px;width:500px;height:480px;border:2px solid var(--border);border-radius:50%;opacity:.35}.nd{position:absolute;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;font-size:17px;color:var(--text);white-space:nowrap}.dot{width:9px;height:9px;border:2px solid var(--accent);border-radius:50%;background:var(--bg);flex:none}.idx{position:absolute;left:0;top:212px;width:320px;text-align:center;font-size:13px;letter-spacing:.34em;color:var(--accent)}.cn{position:absolute;left:0;top:242px;width:320px;text-align:center;font-family:var(--font-display);font-size:28px;font-weight:700;color:var(--text)}.en{position:absolute;left:0;top:294px;width:320px;text-align:center;font-size:16px;letter-spacing:.16em;color:var(--muted)}</style><div class="ph-t" data-lumen-arch-node>阶段流程环带分解</div><div class="ph-s" data-lumen-arch-node>全流程阶段 · 关键动作 · 交付节奏</div><div class="axis"></div><div class="axis-head"></div><div class="ph" style="left:128px"><div class="ring"></div><div class="nd" style="top:40px"><span class="dot"></span>需求调研</div><div class="nd" style="top:130px"><span class="dot"></span>可行性评估</div><div class="idx">01</div><div class="cn" data-lumen-arch-node>售前阶段</div><div class="en">PRE-SALES</div><div class="nd" style="top:420px"><span class="dot"></span>方案策略</div><div class="nd" style="top:510px"><span class="dot"></span>客户意向确认</div></div><div class="ph" style="left:464px"><div class="ring"></div><div class="nd" style="top:40px"><span class="dot"></span>需求确认</div><div class="nd" style="top:130px"><span class="dot"></span>方案设计</div><div class="idx">02</div><div class="cn" data-lumen-arch-node>方案阶段</div><div class="en">SCHEME</div><div class="nd" style="top:420px"><span class="dot"></span>技术选型</div><div class="nd" style="top:510px"><span class="dot"></span>成本核算</div></div><div class="ph" style="left:800px"><div class="ring"></div><div class="nd" style="top:40px"><span class="dot"></span>资源分配</div><div class="nd" style="top:130px"><span class="dot"></span>进度管理</div><div class="idx">03</div><div class="cn" data-lumen-arch-node>交付阶段</div><div class="en">DELIVERY</div><div class="nd" style="top:420px"><span class="dot"></span>阶段评审</div><div class="nd" style="top:510px"><span class="dot"></span>交付清单</div></div><div class="ph" style="left:1136px"><div class="ring"></div><div class="nd" style="top:40px"><span class="dot"></span>测试验证</div><div class="nd" style="top:130px"><span class="dot"></span>验收报告</div><div class="idx">04</div><div class="cn" data-lumen-arch-node>验收阶段</div><div class="en">ACCEPTANCE</div><div class="nd" style="top:420px"><span class="dot"></span>问题整改</div><div class="nd" style="top:510px"><span class="dot"></span>试点上线</div></div><div class="ph" style="left:1472px"><div class="ring"></div><div class="nd" style="top:40px"><span class="dot"></span>数据追踪</div><div class="nd" style="top:130px"><span class="dot"></span>服务回访</div><div class="idx">05</div><div class="cn" data-lumen-arch-node>售后阶段</div><div class="en">AFTER-SALES</div><div class="nd" style="top:420px"><span class="dot"></span>运维监控</div><div class="nd" style="top:510px"><span class="dot"></span>持续优化</div></div></div>`,
  },
  {
    id: "arch/tri-circle-anchors@v1",
    name: "三圆并列双锚",
    group: "matrix",
    brief: "三枚大圆横向并列成主体，左右两端各一个锚点，顶部关键词带、底部结论横幅，适合并列能力模块",
    skeleton: `<style>.l2-title{position:absolute;left:100px;top:56px;font-family:var(--font-display);font-size:50px;font-weight:800;letter-spacing:-.02em;line-height:1;color:var(--text)}.l2-sub{position:absolute;left:102px;top:126px;font-size:15px;letter-spacing:.34em;color:var(--muted)}.l2-row{position:absolute;left:425px;top:212px;width:1070px;height:48px;display:flex;align-items:center;justify-content:space-between}.l2-kw{font-size:17px;letter-spacing:.22em;color:var(--muted);padding:0 26px;border-left:1px dashed var(--border)}.l2-kw:first-child{border-left:0}.l2-circle{position:absolute;width:350px;height:350px;box-sizing:border-box;padding:0 60px;border-radius:50%;background:var(--surface);border:1px solid var(--border);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:12px;box-shadow:0 30px 60px color-mix(in srgb,var(--text) 14%,transparent)}.l2-en{font-size:12px;letter-spacing:.3em;color:var(--muted)}.l2-tt{font-family:var(--font-display);font-size:32px;font-weight:800;line-height:1.1;color:var(--text)}.l2-tx{font-size:14px;line-height:1.6;color:var(--muted)}.l2-anchor{position:absolute;width:250px}.l2-aen{font-size:15px;letter-spacing:.3em;color:var(--muted)}.l2-acn{font-family:var(--font-display);font-size:46px;font-weight:800;line-height:1.1;color:var(--text);margin-top:8px}.l2-atx{font-size:15px;line-height:1.7;color:var(--muted);margin-top:10px}.l2-dash{position:absolute;height:0;border-top:2px dashed var(--border)}.l2-tri-r{position:absolute;width:0;height:0;border-top:8px solid transparent;border-bottom:8px solid transparent;border-left:12px solid var(--border)}.l2-tri-l{position:absolute;width:0;height:0;border-top:8px solid transparent;border-bottom:8px solid transparent;border-right:12px solid var(--border)}.l2-vline{position:absolute;width:2px;background:var(--border)}.l2-vtri{position:absolute;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:11px solid var(--border)}.l2-vlab{position:absolute;width:120px;text-align:center;font-size:14px;letter-spacing:.2em;color:var(--muted)}.l2-banner{position:absolute;left:340px;top:850px;width:1240px;height:130px;border-radius:65px;border:2px solid var(--border);background:var(--surface);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:38px;font-weight:700;letter-spacing:.06em;color:var(--text)}</style><div style="width:1920px;height:1080px;position:relative;overflow:hidden;background:var(--bg);color:var(--text);font-family:var(--font-sans)"><div class="l2-title" data-lumen-arch-node>并列能力矩阵</div><div class="l2-sub">三类核心能力 · 两端锚点</div><div class="l2-row"><div class="l2-kw">稳定</div><div class="l2-kw">安全</div><div class="l2-kw">丰富</div><div class="l2-kw">灵活</div><div class="l2-kw">高效</div><div class="l2-kw">专属服务</div></div><div class="l2-circle" style="left:425px;top:380px" data-lumen-arch-node><div class="l2-en">Foundation</div><div class="l2-tt">基础能力</div><div class="l2-tx">统一入口与规范，提供稳定可靠的基础能力支撑</div></div><div class="l2-circle" style="left:785px;top:380px" data-lumen-arch-node><div class="l2-en">Growth</div><div class="l2-tt">增长引擎</div><div class="l2-tx">灵活编排与扩展，让能力持续迭代与对外开放</div></div><div class="l2-circle" style="left:1145px;top:380px" data-lumen-arch-node><div class="l2-en">Experience</div><div class="l2-tt">体验场景</div><div class="l2-tx">面向场景的触达与运营，形成完整服务闭环</div></div><div class="l2-anchor" style="left:100px;top:470px"><div class="l2-aen">Application</div><div class="l2-acn" data-lumen-arch-node>产品</div><div class="l2-atx">统一入口<br>场景承接</div></div><div class="l2-anchor" style="left:1570px;top:470px;text-align:right"><div class="l2-aen">User</div><div class="l2-acn" data-lumen-arch-node>用户</div><div class="l2-atx">全周期触达<br>持续服务</div></div><div class="l2-dash" style="left:360px;top:554px;width:56px"></div><div class="l2-tri-r" style="left:414px;top:546px"></div><div class="l2-dash" style="left:1517px;top:554px;width:55px"></div><div class="l2-tri-l" style="left:1503px;top:546px"></div><div class="l2-vline" style="left:599px;top:780px;height:56px"></div><div class="l2-vlab" style="left:540px;top:742px">接入</div><div class="l2-vtri" style="left:593px;top:838px"></div><div class="l2-vline" style="left:959px;top:780px;height:56px"></div><div class="l2-vlab" style="left:900px;top:742px">承载</div><div class="l2-vtri" style="left:953px;top:838px"></div><div class="l2-vline" style="left:1319px;top:780px;height:56px"></div><div class="l2-vlab" style="left:1260px;top:742px">触达</div><div class="l2-vtri" style="left:1313px;top:838px"></div><div class="l2-banner" data-lumen-arch-node>统一服务平台 · 持续开放能力</div></div>`,
  },
  {
    id: "arch/dual-ellipse-merge@v1",
    name: "双圆交汇中枢",
    group: "radial",
    brief: "两个大椭圆左右交叠，交叠处落一个中枢圆，横向轴线串起两侧标签、底部三组挂载说明，适合画双域融合与要素汇聚关系。",
    skeleton: `<div class="a1"><style>
.a1{width:1920px;height:1080px;position:relative;background:var(--bg);color:var(--text);font-family:var(--font-sans);overflow:hidden}
.a1-hd{position:absolute;left:90px;top:52px;font-family:var(--font-display);font-size:56px;font-weight:800;line-height:1;letter-spacing:-.02em}
.a1-sub{position:absolute;left:92px;top:128px;font-size:17px;letter-spacing:.34em;color:var(--muted)}
.a1-rule{position:absolute;left:90px;top:182px;width:1740px;height:1px;background:var(--border);opacity:.55}
.a1-axis{position:absolute;left:150px;top:640px;width:1620px;height:2px;background:var(--border);opacity:.7}
.a1-ell{position:absolute;top:405px;width:700px;height:470px;border:2px solid var(--border);border-radius:50%;opacity:.85}
.a1-ell-l{left:410px}
.a1-ell-r{left:810px}
.a1-halo{position:absolute;left:845px;top:530px;width:230px;height:230px;border-radius:50%;background:color-mix(in srgb,var(--accent) 14%,transparent)}
.a1-core{position:absolute;left:875px;top:560px;width:170px;height:170px;border-radius:50%;background:var(--surface);border:2px solid var(--accent);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:27px;font-weight:800;letter-spacing:.06em;box-shadow:0 40px 80px color-mix(in srgb,var(--text) 22%,transparent)}
.a1-tag{position:absolute;top:596px;transform:translateX(-50%);font-size:19px;letter-spacing:.08em;white-space:nowrap}
.a1-tag-dim{color:var(--muted)}
.a1-link{position:absolute;width:1px;background:var(--border)}
.a1-dot{position:absolute;width:7px;height:7px;border-radius:50%;background:var(--accent);transform:translate(-50%,-50%)}
.a1-cap{position:absolute;top:892px;transform:translateX(-50%);white-space:nowrap}
.a1-cap-t{font-size:24px;font-weight:700;font-family:var(--font-display)}
.a1-cap-s{margin-top:12px;font-size:13px;letter-spacing:.28em;color:var(--muted)}
</style>
<div class="a1-hd" data-lumen-arch-node>物理空间数字化构建</div>
<div class="a1-sub">DIGITAL CONSTRUCTION OF PHYSICAL SPACE</div>
<div class="a1-rule"></div>
<div class="a1-axis"></div>
<div class="a1-ell a1-ell-l"></div>
<div class="a1-ell a1-ell-r"></div>
<div class="a1-halo"></div>
<div class="a1-core" data-lumen-arch-node>融合</div>
<div class="a1-tag" style="left:230px" data-lumen-arch-node>特效</div>
<div class="a1-tag" style="left:380px" data-lumen-arch-node>材质</div>
<div class="a1-tag" style="left:520px" data-lumen-arch-node>蓝图</div>
<div class="a1-tag" style="left:660px" data-lumen-arch-node>逻辑</div>
<div class="a1-tag a1-tag-dim" style="left:800px" data-lumen-arch-node>渲染</div>
<div class="a1-tag" style="left:1130px" data-lumen-arch-node>数据呈现</div>
<div class="a1-tag" style="left:1300px" data-lumen-arch-node>算法转换</div>
<div class="a1-tag" style="left:1460px" data-lumen-arch-node>数据加工</div>
<div class="a1-tag a1-tag-dim" style="left:1610px" data-lumen-arch-node>数据存储</div>
<div class="a1-tag a1-tag-dim" style="left:1760px" data-lumen-arch-node>数据空间转换</div>
<div class="a1-dot" style="left:480px;top:786px"></div>
<div class="a1-link" style="left:479px;top:786px;height:96px"></div>
<div class="a1-dot" style="left:960px;top:838px"></div>
<div class="a1-link" style="left:959px;top:838px;height:44px"></div>
<div class="a1-dot" style="left:1440px;top:786px"></div>
<div class="a1-link" style="left:1439px;top:786px;height:96px"></div>
<div class="a1-cap" style="left:480px" data-lumen-arch-node>空间图形设计标准<div class="a1-cap-s">GRAPHIC DESIGN</div></div>
<div class="a1-cap" style="left:960px" data-lumen-arch-node>数字孪生空间<div class="a1-cap-s">DIGITAL TWIN SPACE</div></div>
<div class="a1-cap" style="left:1440px" data-lumen-arch-node>空间结构化数据<div class="a1-cap-s">SPATIAL DATA</div></div>
</div>`,
  },
  {
    id: "arch/concentric-capability@v1",
    name: "同心环能力盘",
    group: "radial",
    brief: "一个中心圆外罩三到四层同心环，环外一圈能力标签、环间嵌中层模块胶囊，适合画能力模型与素养体系。",
    skeleton: `<div class="a2"><style>
.a2{width:1920px;height:1080px;position:relative;background:var(--bg);color:var(--text);font-family:var(--font-sans);overflow:hidden}
.a2-hd{position:absolute;left:90px;top:52px;font-family:var(--font-display);font-size:56px;font-weight:800;line-height:1;letter-spacing:-.02em}
.a2-sub{position:absolute;left:92px;top:128px;font-size:17px;letter-spacing:.34em;color:var(--muted)}
.a2-ring{position:absolute;border-radius:50%;border:1px solid var(--border)}
.a2-ring-dash{border-style:dashed;opacity:.75}
.a2-ring-soft{opacity:.45}
.a2-glow{position:absolute;border-radius:50%;background:color-mix(in srgb,var(--brand) 12%,transparent)}
.a2-core{position:absolute;border-radius:50%;background:var(--surface);border:2px solid var(--accent);display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 40px 80px color-mix(in srgb,var(--text) 22%,transparent)}
.a2-core-t{font-family:var(--font-display);font-size:26px;font-weight:800;line-height:1.1;letter-spacing:.04em;text-align:center}
.a2-core-s{margin-top:10px;font-size:13px;letter-spacing:.2em;color:var(--muted)}
.a2-out{position:absolute;transform:translate(-50%,-50%);font-family:var(--font-display);font-size:23px;font-weight:700;letter-spacing:.1em;white-space:nowrap}
.a2-mid{position:absolute;transform:translate(-50%,-50%);font-size:19px;font-weight:600;padding:8px 20px;border-radius:999px;background:var(--surface);border:1px solid var(--border);white-space:nowrap}
.a2-tick{position:absolute;transform:translate(-50%,-50%);font-size:13px;letter-spacing:.14em;color:var(--muted);white-space:nowrap}
.a2-dot{position:absolute;width:8px;height:8px;background:var(--accent);transform:translate(-50%,-50%);opacity:.85}
</style>
<div class="a2-hd" data-lumen-arch-node>能力模型全景</div>
<div class="a2-sub">CAPABILITY MODEL LANDSCAPE</div>
<div class="a2-glow" style="left:610px;top:300px;width:700px;height:700px"></div>
<div class="a2-ring a2-ring-dash" style="left:610px;top:300px;width:700px;height:700px"></div>
<div class="a2-ring" style="left:670px;top:360px;width:580px;height:580px"></div>
<div class="a2-ring a2-ring-soft" style="left:730px;top:420px;width:460px;height:460px"></div>
<div class="a2-ring" style="left:785px;top:475px;width:350px;height:350px"></div>
<div class="a2-core" style="left:825px;top:515px;width:270px;height:270px"><div class="a2-core-t" data-lumen-arch-node>CAPABILITY<br>MODEL</div><div class="a2-core-s">设计咨询能力模型</div></div>
<div class="a2-dot" style="left:960px;top:300px"></div>
<div class="a2-dot" style="left:1207px;top:403px"></div>
<div class="a2-dot" style="left:1310px;top:650px"></div>
<div class="a2-dot" style="left:1207px;top:897px"></div>
<div class="a2-dot" style="left:960px;top:1000px"></div>
<div class="a2-dot" style="left:713px;top:897px"></div>
<div class="a2-dot" style="left:610px;top:650px"></div>
<div class="a2-dot" style="left:713px;top:403px"></div>
<div class="a2-out" style="left:960px;top:250px" data-lumen-arch-node>架构力</div>
<div class="a2-out" style="left:1328px;top:367px" data-lumen-arch-node>分析力</div>
<div class="a2-out" style="left:1480px;top:650px" data-lumen-arch-node>计算力</div>
<div class="a2-out" style="left:1328px;top:933px" data-lumen-arch-node>洞察力</div>
<div class="a2-out" style="left:960px;top:1050px" data-lumen-arch-node>掌控力</div>
<div class="a2-out" style="left:592px;top:933px" data-lumen-arch-node>协同力</div>
<div class="a2-out" style="left:440px;top:650px" data-lumen-arch-node>沟通力</div>
<div class="a2-out" style="left:592px;top:367px" data-lumen-arch-node>规划力</div>
<div class="a2-mid" style="left:748px;top:487px" data-lumen-arch-node>产品平台</div>
<div class="a2-mid" style="left:1172px;top:487px" data-lumen-arch-node>财务模型</div>
<div class="a2-mid" style="left:1172px;top:813px" data-lumen-arch-node>交付管理</div>
<div class="a2-mid" style="left:748px;top:813px" data-lumen-arch-node>战略规划</div>
<div class="a2-tick" style="left:1060px;top:516px" data-lumen-arch-node>流程制定</div>
<div class="a2-tick" style="left:1160px;top:650px" data-lumen-arch-node>行业分析</div>
<div class="a2-tick" style="left:1060px;top:784px" data-lumen-arch-node>品牌定位</div>
<div class="a2-tick" style="left:860px;top:784px" data-lumen-arch-node>风险控制</div>
<div class="a2-tick" style="left:760px;top:650px" data-lumen-arch-node>成本测算</div>
<div class="a2-tick" style="left:860px;top:516px" data-lumen-arch-node>用户研究</div>
</div>`,
  },
  {
    id: "arch/dashed-four-layer-bands@v1",
    name: "虚线四层带",
    group: "layer",
    brief: "四条虚线层带自上而下堆叠，每条带左侧挂层名标签、带内节点横向串联成流",
    skeleton: `<style>.a-title{position:absolute;left:80px;top:54px;font-family:var(--font-display);font-size:60px;font-weight:800;line-height:1;letter-spacing:-.02em;color:var(--text)}.a-sub{position:absolute;left:84px;top:134px;font-size:19px;font-weight:400;letter-spacing:.22em;color:var(--muted)}.a-band{position:absolute;left:80px;width:1760px;height:178px;border:2px dashed var(--border);border-radius:22px;background:color-mix(in srgb,var(--surface) 72%,transparent)}.a-tag{position:absolute;left:26px;top:50%;transform:translateY(-50%);width:200px;text-align:center;font-family:var(--font-display);font-size:19px;font-weight:700;letter-spacing:.14em;color:var(--accent)}.a-tag i{display:block;font-style:normal;font-size:12px;font-weight:400;letter-spacing:.3em;color:var(--muted);margin-top:8px}.a-node{position:absolute;top:50%;transform:translateY(-50%);width:260px;height:88px;border-radius:14px;border:2px solid var(--border);background:var(--surface);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:7px}.a-node .t{font-family:var(--font-display);font-size:21px;font-weight:700;letter-spacing:.02em;color:var(--text)}.a-node .s{font-size:13px;letter-spacing:.12em;color:var(--muted)}.a-node.on{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 16%,var(--surface))}.a-arrow{position:absolute;top:50%;margin-top:-1px;width:44px;height:2px;background:var(--border)}.a-arrow::after{content:"";position:absolute;right:-2px;top:-4px;width:0;height:0;border-left:9px solid var(--border);border-top:5px solid transparent;border-bottom:5px solid transparent}.a-edge{position:absolute;top:22px;width:120px;text-align:center;font-size:12px;letter-spacing:.16em;color:var(--muted)}.a-vlink{position:absolute;width:0;height:16px;border-left:2px dashed var(--border)}.a-legend{position:absolute;left:80px;top:958px;display:flex;gap:44px}.a-legend span{display:flex;align-items:center;gap:10px;font-size:15px;letter-spacing:.1em;color:var(--muted)}.a-legend b{display:block;width:16px;height:16px;border-radius:4px}</style><div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden"><div class="a-title" data-lumen-arch-node>记忆系统分层架构</div><div class="a-sub">接入 · 管理 · 存储 · 输出 的四层逻辑</div><div class="a-band" style="top:172px"><div class="a-tag" data-lumen-arch-node>接入层<i>L1 INPUT</i></div><div class="a-node" style="left:300px" data-lumen-arch-node><div class="t">用户终端</div><div class="s">请求入口</div></div><div class="a-arrow" style="left:588px"></div><div class="a-node" style="left:650px" data-lumen-arch-node><div class="t">应用服务</div><div class="s">会话路由</div></div><div class="a-arrow" style="left:938px"></div><div class="a-node" style="left:1000px" data-lumen-arch-node><div class="t">模型服务</div><div class="s">推理调用</div></div><div class="a-arrow" style="left:1288px"></div><div class="a-node" style="left:1350px" data-lumen-arch-node><div class="t">SDK 客户端</div><div class="s">上下文注入</div></div></div><div class="a-vlink" style="left:780px;top:350px"></div><div class="a-vlink" style="left:1480px;top:350px"></div><div class="a-band" style="top:366px"><div class="a-tag" data-lumen-arch-node>核心层<i>L2 CORE</i></div><div class="a-node" style="left:470px" data-lumen-arch-node><div class="t">事实抽取</div><div class="s">结构化解析</div></div><div class="a-arrow" style="left:758px"></div><div class="a-edge" style="left:720px">抽取事实</div><div class="a-node on" style="left:820px" data-lumen-arch-node><div class="t">记忆管理器</div><div class="s">写入 · 检索 · 更新</div></div><div class="a-arrow" style="left:1108px"></div><div class="a-edge" style="left:1070px">消解冲突</div><div class="a-node" style="left:1170px" data-lumen-arch-node><div class="t">冲突消解</div><div class="s">一致性合并</div></div></div><div class="a-vlink" style="left:780px;top:544px"></div><div class="a-vlink" style="left:1480px;top:544px"></div><div class="a-band" style="top:560px"><div class="a-tag" data-lumen-arch-node>存储层<i>L3 STORAGE</i></div><div class="a-node" style="left:300px" data-lumen-arch-node><div class="t">向量库</div><div class="s">语义索引</div></div><div class="a-arrow" style="left:588px"></div><div class="a-node" style="left:650px" data-lumen-arch-node><div class="t">图数据库</div><div class="s">关系网络</div></div><div class="a-arrow" style="left:938px"></div><div class="a-node" style="left:1000px" data-lumen-arch-node><div class="t">键值存储</div><div class="s">热数据缓存</div></div><div class="a-arrow" style="left:1288px"></div><div class="a-node" style="left:1350px" data-lumen-arch-node><div class="t">历史归档</div><div class="s">事件日志</div></div></div><div class="a-vlink" style="left:780px;top:738px"></div><div class="a-vlink" style="left:1480px;top:738px"></div><div class="a-band" style="top:754px"><div class="a-tag" data-lumen-arch-node>输出层<i>L4 RETRIEVAL</i></div><div class="a-node" style="left:470px" data-lumen-arch-node><div class="t">上下文构建</div><div class="s">召回拼装</div></div><div class="a-arrow" style="left:758px"></div><div class="a-node" style="left:820px" data-lumen-arch-node><div class="t">结果重排</div><div class="s">相关性打分</div></div><div class="a-arrow" style="left:1108px"></div><div class="a-node" style="left:1170px" data-lumen-arch-node><div class="t">个性化响应</div><div class="s">答案生成</div></div></div><div class="a-legend"><span><b style="background:var(--accent)"></b>调用流向</span><span><b style="background:var(--brand)"></b>记忆写入</span><span><b style="background:var(--border)"></b>记忆读取</span><span><b style="background:var(--muted)"></b>数据转换</span></div></div>`,
  },
  {
    id: "arch/three-stage-integration-flow@v1",
    name: "三段集成流",
    group: "flow",
    brief: "三列阶段虚线框横排，列内节点竖向串联，列间箭头标注调用与回写",
    skeleton: `<style>.b-title{position:absolute;left:80px;top:54px;font-family:var(--font-display);font-size:60px;font-weight:800;line-height:1;letter-spacing:-.02em;color:var(--text)}.b-sub{position:absolute;left:84px;top:134px;font-size:19px;font-weight:400;letter-spacing:.22em;color:var(--muted)}.b-col{position:absolute;top:210px;width:480px;height:700px;border:2px dashed var(--border);border-radius:20px;background:color-mix(in srgb,var(--surface) 60%,transparent)}.b-head{position:absolute;left:34px;top:28px;font-family:var(--font-display);font-size:22px;font-weight:700;letter-spacing:.14em;color:var(--accent)}.b-head i{font-style:normal;font-size:12px;font-weight:400;letter-spacing:.3em;color:var(--muted);margin-left:12px}.b-node{position:absolute;left:50px;width:380px;height:96px;border-radius:14px;border:2px solid var(--border);background:var(--surface);display:flex;flex-direction:column;justify-content:center;align-items:center;gap:7px}.b-node .t{font-family:var(--font-display);font-size:20px;font-weight:700;color:var(--text)}.b-node .s{font-size:13px;letter-spacing:.12em;color:var(--muted)}.b-vline{position:absolute;left:239px;width:0;border-left:2px dashed var(--border)}.b-harrow{position:absolute;height:2px;background:var(--border)}.b-harrow::after{content:"";position:absolute;right:-2px;top:-5px;width:0;height:0;border-left:11px solid var(--border);border-top:6px solid transparent;border-bottom:6px solid transparent}.b-hlabel{position:absolute;width:120px;text-align:center;font-size:13px;letter-spacing:.18em;color:var(--muted)}.b-hline{position:absolute;border-top:2px dashed var(--border)}.b-vdash{position:absolute;border-left:2px dashed var(--border)}.b-up{position:absolute;width:0;height:0;border-bottom:10px solid var(--border);border-left:6px solid transparent;border-right:6px solid transparent}.b-railtext{position:absolute;font-size:14px;letter-spacing:.18em;color:var(--muted);background:var(--bg);padding:6px 16px}</style><div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden"><div class="b-title" data-lumen-arch-node>集成调用流程</div><div class="b-sub">输入 · 模型与工具 · 交付 的三段链路</div><div class="b-col" style="left:110px"><div class="b-head" data-lumen-arch-node>01 输入<i>INPUT</i></div><div class="b-node" style="top:110px" data-lumen-arch-node><div class="t">用户终端</div><div class="s">多端接入</div></div><div class="b-vline" style="top:206px;height:94px"></div><div class="b-node" style="top:300px" data-lumen-arch-node><div class="t">应用服务</div><div class="s">鉴权与限流</div></div><div class="b-vline" style="top:396px;height:94px"></div><div class="b-node" style="top:490px" data-lumen-arch-node><div class="t">接入 SDK</div><div class="s">请求封装</div></div></div><div class="b-col" style="left:720px"><div class="b-head" data-lumen-arch-node>02 模型与工具<i>MODEL</i></div><div class="b-node" style="top:110px" data-lumen-arch-node><div class="t">提示构建器</div><div class="s">模板装配</div></div><div class="b-vline" style="top:206px;height:94px"></div><div class="b-node" style="top:300px" data-lumen-arch-node><div class="t">模型运行时</div><div class="s">推理调度</div></div><div class="b-vline" style="top:396px;height:94px"></div><div class="b-node" style="top:490px" data-lumen-arch-node><div class="t">工具调用</div><div class="s">外部函数</div></div></div><div class="b-col" style="left:1330px"><div class="b-head" data-lumen-arch-node>03 交付<i>DELIVERY</i></div><div class="b-node" style="top:110px" data-lumen-arch-node><div class="t">响应格式化</div><div class="s">结构输出</div></div><div class="b-vline" style="top:206px;height:94px"></div><div class="b-node" style="top:300px" data-lumen-arch-node><div class="t">可观测性</div><div class="s">链路追踪</div></div><div class="b-vline" style="top:396px;height:94px"></div><div class="b-node" style="top:490px" data-lumen-arch-node><div class="t">结果回收</div><div class="s">状态落库</div></div></div><div class="b-harrow" style="left:614px;top:367px;width:80px"></div><div class="b-hlabel" style="left:594px;top:328px">调用</div><div class="b-harrow" style="left:1224px;top:367px;width:80px"></div><div class="b-hlabel" style="left:1204px;top:328px">回写</div><div class="b-vdash" style="left:350px;top:910px;height:80px"></div><div class="b-up" style="left:344px;top:900px"></div><div class="b-vdash" style="left:1570px;top:910px;height:80px"></div><div class="b-hline" style="left:350px;top:990px;width:1220px"></div><div class="b-railtext" style="left:860px;top:966px">结果回写链路</div></div>`,
  },
  {
    id: "arch/labeled-layer-rows@v1",
    name: "标签行分层",
    group: "layer",
    brief: "左侧序号层名成列，右侧模块逐层增多、层与层之间用短箭头竖向衔接",
    skeleton: `<style>.c-title{position:absolute;left:80px;top:54px;font-family:var(--font-display);font-size:60px;font-weight:800;line-height:1;letter-spacing:-.02em;color:var(--text)}.c-sub{position:absolute;left:84px;top:134px;font-size:19px;font-weight:400;letter-spacing:.22em;color:var(--muted)}.c-row{position:absolute;left:80px;width:1760px;height:220px;border-radius:20px;border:2px solid var(--border);background:color-mix(in srgb,var(--surface) 65%,transparent)}.c-label{position:absolute;left:34px;top:50%;transform:translateY(-50%);width:250px}.c-label .idx{font-family:var(--font-display);font-size:46px;font-weight:800;line-height:1;letter-spacing:-.03em;color:var(--accent)}.c-label .nm{font-family:var(--font-display);font-size:21px;font-weight:700;letter-spacing:.06em;color:var(--text);margin-top:10px}.c-label .ds{font-size:13px;letter-spacing:.1em;color:var(--muted);margin-top:8px}.c-node{position:absolute;top:50%;transform:translateY(-50%);width:300px;height:126px;border-radius:16px;border:2px solid var(--border);background:var(--surface);display:flex;flex-direction:column;justify-content:center;align-items:center;gap:8px}.c-node .t{font-family:var(--font-display);font-size:21px;font-weight:700;color:var(--text)}.c-node .s{font-size:13px;letter-spacing:.1em;color:var(--muted);text-align:center;line-height:1.5}.c-conn{position:absolute;width:0;height:40px;border-left:2px solid var(--border)}.c-conn::after{content:"";position:absolute;left:-5px;bottom:-2px;width:0;height:0;border-top:9px solid var(--border);border-left:5px solid transparent;border-right:5px solid transparent}</style><div style="width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden"><div class="c-title" data-lumen-arch-node>系统分层架构</div><div class="c-sub">接入 · 核心 · 基础 的纵向职责划分</div><div class="c-row" style="top:180px"><div class="c-label" data-lumen-arch-node><div class="idx">01</div><div class="nm">接入层</div><div class="ds">客户端与网关</div></div><div class="c-node" style="left:400px" data-lumen-arch-node><div class="t">客户端界面</div><div class="s">多端适配 · 会话承载</div></div><div class="c-node" style="left:760px" data-lumen-arch-node><div class="t">网关服务</div><div class="s">路由转发 · 鉴权</div></div></div><div class="c-conn" style="left:549px;top:400px"></div><div class="c-conn" style="left:909px;top:400px"></div><div class="c-row" style="top:440px"><div class="c-label" data-lumen-arch-node><div class="idx">02</div><div class="nm">核心层</div><div class="ds">调度与执行</div></div><div class="c-node" style="left:400px" data-lumen-arch-node><div class="t">任务规划器</div><div class="s">步骤编排 · 依赖解析</div></div><div class="c-node" style="left:760px" data-lumen-arch-node><div class="t">模型运行时</div><div class="s">推理执行 · 并发调度</div></div><div class="c-node" style="left:1120px" data-lumen-arch-node><div class="t">策略护栏</div><div class="s">安全校验 · 内容过滤</div></div></div><div class="c-conn" style="left:549px;top:660px"></div><div class="c-conn" style="left:909px;top:660px"></div><div class="c-conn" style="left:1269px;top:660px"></div><div class="c-row" style="top:700px"><div class="c-label" data-lumen-arch-node><div class="idx">03</div><div class="nm">基础层</div><div class="ds">数据与运维</div></div><div class="c-node" style="left:400px" data-lumen-arch-node><div class="t">记忆存储</div><div class="s">长期 · 短期记忆</div></div><div class="c-node" style="left:760px" data-lumen-arch-node><div class="t">工具运行时</div><div class="s">外部调用 · 沙箱</div></div><div class="c-node" style="left:1120px" data-lumen-arch-node><div class="t">可观测性</div><div class="s">指标 · 日志 · 追踪</div></div><div class="c-node" style="left:1480px" data-lumen-arch-node><div class="t">注册中心</div><div class="s">服务发现 · 配置下发</div></div></div></div>`,
  },
  {
    id: "arch/roof-domain-framework@v1",
    name: "屋架全域经营",
    group: "frame",
    brief: "顶部三角屋顶压在横排能力指标上，中间三列方法论，底部整排产品全景列表",
    skeleton: `<style>
.a1{font-family:var(--font-sans);background:var(--bg);color:var(--text);overflow:hidden}
.a1 .ttl{position:absolute;left:80px;top:46px;font-family:var(--font-display);font-size:56px;font-weight:800;line-height:1;letter-spacing:-.02em;color:var(--text)}
.a1 .sub{position:absolute;left:84px;top:116px;font-size:18px;font-weight:400;letter-spacing:.3em;color:var(--muted)}
.a1 .rule{position:absolute;left:80px;top:152px;width:1760px;height:2px;background:var(--border)}
.a1 .roof{position:absolute;left:360px;top:176px;width:1200px;height:128px;background:color-mix(in srgb,var(--brand) 22%,var(--bg));clip-path:polygon(0 100%,50% 0,100% 100%)}
.a1 .roofT{position:absolute;left:360px;top:212px;width:1200px;text-align:center;font-family:var(--font-display);font-size:30px;font-weight:800;letter-spacing:.04em;color:var(--text)}
.a1 .roofS{position:absolute;left:360px;top:252px;width:1200px;text-align:center;font-size:16px;letter-spacing:.14em;color:var(--muted)}
.a1 .capWrap{position:absolute;left:360px;top:332px;width:1200px;height:64px;display:flex;gap:16px}
.a1 .cap{flex:1;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--brand) 16%,var(--surface));border:1px solid var(--border);border-radius:8px;font-size:18px;font-weight:600;color:var(--text)}
.a1 .cols{position:absolute;left:80px;top:424px;width:1760px;height:326px;display:flex;gap:24px}
.a1 .col{flex:1;background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:20px 22px;box-sizing:border-box;display:flex;flex-direction:column;gap:12px}
.a1 .colH{font-family:var(--font-display);font-size:22px;font-weight:700;color:var(--text)}
.a1 .colS{font-size:13px;letter-spacing:.2em;color:var(--muted);margin-top:-6px}
.a1 .chipRow{display:flex;gap:10px;flex-wrap:wrap}
.a1 .chip{background:color-mix(in srgb,var(--brand) 12%,var(--surface));border:1px solid var(--border);border-radius:6px;padding:9px 14px;font-size:15px;color:var(--text)}
.a1 .colFoot{margin-top:auto;font-size:14px;letter-spacing:.14em;color:var(--muted);border-top:2px dashed var(--border);padding-top:10px}
.a1 .pl{position:absolute;left:80px;top:790px;width:1760px;height:248px;display:flex;flex-direction:column;gap:10px}
.a1 .prow{flex:1;display:flex;align-items:stretch;gap:14px}
.a1 .plabel{width:170px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--brand) 26%,var(--surface));border-radius:8px;font-size:17px;font-weight:700;color:var(--text)}
.a1 .pitem{flex:1;display:flex;align-items:center;padding-left:20px;background:var(--surface);border:1px solid var(--border);border-radius:8px;font-size:16px;color:var(--text)}
</style>
<div class="a1" style="width:1920px;height:1080px;position:relative;overflow:hidden">
<div class="ttl" data-lumen-arch-node>全域长效经营方法论</div>
<div class="sub" data-lumen-arch-node>目标 · 能力 · 方法论 · 产品全景</div>
<div class="rule"></div>
<div class="roof"></div>
<div class="roofT" data-lumen-arch-node>全域长效经营</div>
<div class="roofS" data-lumen-arch-node>获得确定性的用户增长、生意增长与营销提效</div>
<div class="capWrap">
<div class="cap" data-lumen-arch-node>用户心智</div>
<div class="cap" data-lumen-arch-node>用户粘性</div>
<div class="cap" data-lumen-arch-node>品牌共鸣</div>
<div class="cap" data-lumen-arch-node>营销效率</div>
</div>
<div class="cols">
<div class="col">
<div class="colH" data-lumen-arch-node>人群经营</div>
<div class="colS" data-lumen-arch-node>体系化的人群深耕</div>
<div class="chipRow">
<div class="chip" data-lumen-arch-node>市场机会用户</div>
<div class="chip" data-lumen-arch-node>广告已触达用户</div>
<div class="chip" data-lumen-arch-node>广告转化用户</div>
</div>
<div class="colFoot" data-lumen-arch-node>完善的段中长期用户价值体系</div>
</div>
<div class="col">
<div class="colH" data-lumen-arch-node>货品经营</div>
<div class="colS" data-lumen-arch-node>全链路货品赋能</div>
<div class="chipRow">
<div class="chip" data-lumen-arch-node>产品定位</div>
<div class="chip" data-lumen-arch-node>产品需求</div>
<div class="chip" data-lumen-arch-node>策略规划</div>
<div class="chip" data-lumen-arch-node>上市打爆</div>
<div class="chip" data-lumen-arch-node>货品运营</div>
</div>
<div class="colFoot" data-lumen-arch-node>从需求到上市的完整闭环</div>
</div>
<div class="col">
<div class="colH" data-lumen-arch-node>场域经营</div>
<div class="colS" data-lumen-arch-node>全域协同的场域触达</div>
<div class="chipRow">
<div class="chip" data-lumen-arch-node>站内加站外</div>
<div class="chip" data-lumen-arch-node>线上加线下</div>
<div class="chip" data-lumen-arch-node>私域加公域</div>
<div class="chip" data-lumen-arch-node>付费加免费</div>
</div>
<div class="colFoot" data-lumen-arch-node>以数据能力为基础实现四层用户全触达</div>
</div>
</div>
<div class="pl">
<div class="prow"><div class="plabel" data-lumen-arch-node>全域招商</div><div class="pitem" data-lumen-arch-node>流量引入 · 旗舰计划 · 流量冲刺</div></div>
<div class="prow"><div class="plabel" data-lumen-arch-node>营销产品</div><div class="pitem" data-lumen-arch-node>一站智投 · 成长进阶 · 推荐广告 · 站外广告 · 消息广告 · 玩法升级 · 内容广告 · 创新探索</div></div>
<div class="prow"><div class="plabel" data-lumen-arch-node>营销工具</div><div class="pitem" data-lumen-arch-node>数据管理平台 · 创意中心 · 优化诊断 · 投放抓手 · 数据中心 · 营销接口 · 线索通 · 营销托管</div></div>
<div class="prow"><div class="plabel" data-lumen-arch-node>数智服务</div><div class="pitem" data-lumen-arch-node>营销方略 · 营销云 · 商家智囊 · 经营洞察 · 商机</div></div>
<div class="prow"><div class="plabel" data-lumen-arch-node>服务支持</div><div class="pitem" data-lumen-arch-node>领航计划 · 护航计划 · 启航星计划 · 京营合作伙伴</div></div>
</div>
</div>`,
  },
  {
    id: "arch/concentric-ring-hub@v1",
    name: "三环同心协作",
    group: "radial",
    brief: "中央同心三环承载核心能力，左右两栏分列角色关系与战役清单，底部一条保障带收口",
    skeleton: `<style>
.a2{font-family:var(--font-sans);background:var(--bg);color:var(--text);overflow:hidden}
.a2 .ttl{position:absolute;left:80px;top:46px;font-family:var(--font-display);font-size:56px;font-weight:800;line-height:1;letter-spacing:-.02em;color:var(--text)}
.a2 .sub{position:absolute;left:84px;top:116px;font-size:18px;letter-spacing:.3em;color:var(--muted)}
.a2 .rule{position:absolute;left:80px;top:152px;width:1760px;height:2px;background:var(--border)}
.a2 .side{position:absolute;top:206px;width:400px;height:650px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:22px;box-sizing:border-box;display:flex;flex-direction:column;gap:14px}
.a2 .left{left:80px}
.a2 .right{left:1440px}
.a2 .sideH{font-family:var(--font-display);font-size:22px;font-weight:700;color:var(--text)}
.a2 .sideS{font-size:13px;letter-spacing:.2em;color:var(--muted);margin-top:-8px}
.a2 .card{flex:1;background:color-mix(in srgb,var(--brand) 12%,var(--surface));border:1px solid var(--border);border-radius:10px;display:flex;flex-direction:column;justify-content:center;padding-left:18px;gap:6px}
.a2 .cardT{font-size:19px;font-weight:700;color:var(--text)}
.a2 .cardS{font-size:13px;letter-spacing:.14em;color:var(--muted)}
.a2 .ring{position:absolute;left:540px;top:200px;width:840px;height:660px}
.a2 .o1{position:absolute;left:140px;top:50px;width:560px;height:560px;border-radius:50%;border:2px solid var(--border);background:color-mix(in srgb,var(--brand) 8%,transparent)}
.a2 .o2{position:absolute;left:230px;top:140px;width:380px;height:380px;border-radius:50%;border:2px dashed var(--border);background:color-mix(in srgb,var(--brand) 12%,transparent)}
.a2 .o3{position:absolute;left:320px;top:230px;width:200px;height:200px;border-radius:50%;background:color-mix(in srgb,var(--brand) 40%,var(--surface));display:flex;align-items:center;justify-content:center;text-align:center;font-family:var(--font-display);font-size:20px;font-weight:800;line-height:1.25;color:var(--text);box-shadow:0 40px 80px color-mix(in srgb,var(--text) 22%,transparent)}
.a2 .tag{position:absolute;display:flex;align-items:center;justify-content:center;height:46px;background:var(--surface);border:1px solid var(--border);border-radius:6px;font-size:15px;letter-spacing:.1em;color:var(--text)}
.a2 .t1{left:310px;top:0;width:220px}
.a2 .t2{left:0;top:296px;width:150px}
.a2 .t3{left:690px;top:296px;width:150px}
.a2 .t4{left:310px;top:614px;width:220px}
.a2 .band{position:absolute;left:80px;top:886px;width:1760px;height:110px;display:flex;gap:18px}
.a2 .bi{flex:1;display:flex;align-items:center;justify-content:center;background:var(--surface);border:1px solid var(--border);border-radius:10px;font-size:18px;font-weight:600;color:var(--text)}
</style>
<div class="a2" style="width:1920px;height:1080px;position:relative;overflow:hidden">
<div class="ttl" data-lumen-arch-node>品牌私域联动策略</div>
<div class="sub" data-lumen-arch-node>角色关系 · 全渠道联动 · 微型战役</div>
<div class="rule"></div>
<div class="side left">
<div class="sideH" data-lumen-arch-node>私域用户角色关系</div>
<div class="sideS" data-lumen-arch-node>分层触达路径</div>
<div class="card"><div class="cardT" data-lumen-arch-node>品牌核心用户</div><div class="cardS" data-lumen-arch-node>深度共建</div></div>
<div class="card"><div class="cardT" data-lumen-arch-node>域主与加盟商</div><div class="cardS" data-lumen-arch-node>区域触达</div></div>
<div class="card"><div class="cardT" data-lumen-arch-node>全域会员</div><div class="cardS" data-lumen-arch-node>复购转化</div></div>
<div class="card"><div class="cardT" data-lumen-arch-node>基础会员池</div><div class="cardS" data-lumen-arch-node>持续拉新</div></div>
</div>
<div class="ring">
<div class="o1"></div>
<div class="o2"></div>
<div class="o3" data-lumen-arch-node>品牌全域私域</div>
<div class="tag t1" data-lumen-arch-node>全域经营</div>
<div class="tag t2" data-lumen-arch-node>渠道联动</div>
<div class="tag t3" data-lumen-arch-node>内容协同</div>
<div class="tag t4" data-lumen-arch-node>数据回流</div>
</div>
<div class="side right">
<div class="sideH" data-lumen-arch-node>四大微型战役</div>
<div class="sideS" data-lumen-arch-node>阶段性打法</div>
<div class="card"><div class="cardT" data-lumen-arch-node>内容战役</div><div class="cardS" data-lumen-arch-node>素材与话题共建</div></div>
<div class="card"><div class="cardT" data-lumen-arch-node>拉新战役</div><div class="cardS" data-lumen-arch-node>公域引流承接</div></div>
<div class="card"><div class="cardT" data-lumen-arch-node>转化战役</div><div class="cardS" data-lumen-arch-node>权益与活动承接</div></div>
<div class="card"><div class="cardT" data-lumen-arch-node>留存战役</div><div class="cardS" data-lumen-arch-node>会员体系运营</div></div>
</div>
<div class="band">
<div class="bi" data-lumen-arch-node>品牌组织保障</div>
<div class="bi" data-lumen-arch-node>品牌优质供给</div>
<div class="bi" data-lumen-arch-node>会员体系管理</div>
<div class="bi" data-lumen-arch-node>用户体验提升</div>
</div>
</div>`,
  },
  {
    id: "arch/roof-pillar-base@v1",
    name: "屋顶立柱底座",
    group: "frame",
    brief: "屋顶目标加四格路径横排，中段运营环节一横带，底部两根立柱撑在底座上",
    skeleton: `<style>
.a3{font-family:var(--font-sans);background:var(--bg);color:var(--text);overflow:hidden}
.a3 .ttl{position:absolute;left:80px;top:46px;font-family:var(--font-display);font-size:56px;font-weight:800;line-height:1;letter-spacing:-.02em;color:var(--text)}
.a3 .sub{position:absolute;left:84px;top:116px;font-size:18px;letter-spacing:.3em;color:var(--muted)}
.a3 .rule{position:absolute;left:80px;top:152px;width:1760px;height:2px;background:var(--border)}
.a3 .roof{position:absolute;left:610px;top:176px;width:700px;height:104px;background:color-mix(in srgb,var(--brand) 24%,var(--bg));clip-path:polygon(0 100%,50% 0,100% 100%)}
.a3 .roofT{position:absolute;left:610px;top:212px;width:700px;text-align:center;font-family:var(--font-display);font-size:28px;font-weight:800;color:var(--text)}
.a3 .note{position:absolute;left:1350px;top:180px;width:490px;height:96px;background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px 20px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;gap:8px}
.a3 .noteT{font-size:19px;font-weight:700;color:var(--text)}
.a3 .noteS{font-size:14px;letter-spacing:.1em;color:var(--muted)}
.a3 .four{position:absolute;left:500px;top:326px;width:920px;height:118px;display:flex;gap:16px}
.a3 .f{flex:1;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--brand) 16%,var(--surface));border:1px solid var(--border);border-radius:10px;font-size:19px;font-weight:700;color:var(--text)}
.a3 .ops{position:absolute;left:200px;top:498px;width:1520px;height:172px;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:22px 26px;box-sizing:border-box;display:flex;flex-direction:column;gap:16px}
.a3 .opsH{font-family:var(--font-display);font-size:22px;font-weight:700;color:var(--text)}
.a3 .opsRow{flex:1;display:flex;gap:14px}
.a3 .op{flex:1;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--brand) 10%,var(--surface));border:1px solid var(--border);border-radius:8px;font-size:16px;color:var(--text)}
.a3 .pillars{position:absolute;left:200px;top:714px;width:1520px;height:200px;display:flex;gap:24px}
.a3 .pil{flex:1;background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:22px 26px;box-sizing:border-box;display:flex;flex-direction:column;gap:14px}
.a3 .pilH{font-family:var(--font-display);font-size:24px;font-weight:800;color:var(--text)}
.a3 .pilRow{display:flex;gap:12px;flex-wrap:wrap}
.a3 .pilI{background:color-mix(in srgb,var(--brand) 12%,var(--surface));border:1px solid var(--border);border-radius:6px;padding:9px 14px;font-size:15px;color:var(--text)}
.a3 .base{position:absolute;left:200px;top:942px;width:1520px;height:64px;display:flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--brand) 28%,var(--surface));border-radius:10px;font-size:18px;font-weight:700;letter-spacing:.14em;color:var(--text)}
</style>
<div class="a3" style="width:1920px;height:1080px;position:relative;overflow:hidden">
<div class="ttl" data-lumen-arch-node>可持续发展转型框架</div>
<div class="sub" data-lumen-arch-node>目标 · 路径 · 运营 · 支撑</div>
<div class="rule"></div>
<div class="roof"></div>
<div class="roofT" data-lumen-arch-node>可持续发展目标</div>
<div class="note">
<div class="noteT" data-lumen-arch-node>可持续目标设定</div>
<div class="noteS" data-lumen-arch-node>设置可持续目标与责任分配机制</div>
</div>
<div class="four">
<div class="f" data-lumen-arch-node>产品开放</div>
<div class="f" data-lumen-arch-node>机会识别</div>
<div class="f" data-lumen-arch-node>减排分析</div>
<div class="f" data-lumen-arch-node>实现路径</div>
</div>
<div class="ops">
<div class="opsH" data-lumen-arch-node>运营管理</div>
<div class="opsRow">
<div class="op" data-lumen-arch-node>产品开发</div>
<div class="op" data-lumen-arch-node>采购管理</div>
<div class="op" data-lumen-arch-node>制作管理</div>
<div class="op" data-lumen-arch-node>库存管理</div>
<div class="op" data-lumen-arch-node>物流管理</div>
</div>
</div>
<div class="pillars">
<div class="pil">
<div class="pilH" data-lumen-arch-node>数字化技术</div>
<div class="pilRow">
<div class="pilI" data-lumen-arch-node>数据采集</div>
<div class="pilI" data-lumen-arch-node>指标核算</div>
<div class="pilI" data-lumen-arch-node>可视化看板</div>
</div>
</div>
<div class="pil">
<div class="pilH" data-lumen-arch-node>组织与人才</div>
<div class="pilRow">
<div class="pilI" data-lumen-arch-node>组织保障</div>
<div class="pilI" data-lumen-arch-node>能力培训</div>
<div class="pilI" data-lumen-arch-node>激励机制</div>
</div>
</div>
</div>
<div class="base" data-lumen-arch-node>转型治理与评估底座</div>
</div>`,
  },
  {
    id: "arch/three-column-platform@v1",
    name: "三栏智能经营",
    group: "matrix",
    brief: "三段横向并排承载场景、能力与价值，能力栏中间嵌一个平台圆核，底部一条中台底座",
    skeleton: `<style>
.a5{font-family:var(--font-sans);background:var(--bg);color:var(--text);overflow:hidden}
.a5 .ttl{position:absolute;left:80px;top:46px;font-family:var(--font-display);font-size:56px;font-weight:800;line-height:1;letter-spacing:-.02em;color:var(--text)}
.a5 .sub{position:absolute;left:84px;top:116px;font-size:18px;letter-spacing:.3em;color:var(--muted)}
.a5 .rule{position:absolute;left:80px;top:152px;width:1760px;height:2px;background:var(--border)}
.a5 .panel{position:absolute;top:212px;height:648px;background:var(--surface);border:1px solid var(--border);border-radius:14px;box-sizing:border-box}
.a5 .pleft{left:80px;width:390px;padding:24px}
.a5 .pmid{left:498px;width:930px}
.a5 .pright{left:1456px;width:384px;padding:24px}
.a5 .pH{font-family:var(--font-display);font-size:22px;font-weight:800;color:var(--text)}
.a5 .pS{font-size:13px;letter-spacing:.2em;color:var(--muted);margin-top:6px}
.a5 .stack{display:flex;flex-direction:column;gap:12px;margin-top:22px}
.a5 .card{background:color-mix(in srgb,var(--brand) 12%,var(--surface));border:1px solid var(--border);border-radius:10px;padding:14px 16px}
.a5 .cardT{font-size:18px;font-weight:700;color:var(--text)}
.a5 .cardS{font-size:13px;letter-spacing:.12em;color:var(--muted);margin-top:6px}
.a5 .sub{position:absolute;top:96px;width:340px;border:2px dashed var(--border);border-radius:12px;padding:18px;box-sizing:border-box;display:flex;flex-direction:column;gap:10px}
.a5 .sl{left:30px}
.a5 .sr{left:560px}
.a5 .subH{font-size:18px;font-weight:800;color:var(--text);letter-spacing:.05em}
.a5 .item{flex:1;display:flex;align-items:center;justify-content:space-between;background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:15px;color:var(--text)}
.a5 .dot{width:10px;height:10px;border-radius:50%;background:var(--accent)}
.a5 .core{position:absolute;left:365px;top:238px;width:200px;height:200px;border-radius:50%;background:color-mix(in srgb,var(--brand) 42%,var(--surface));display:flex;align-items:center;justify-content:center;text-align:center;font-family:var(--font-display);font-size:20px;font-weight:800;line-height:1.3;color:var(--text);box-shadow:0 40px 80px color-mix(in srgb,var(--text) 22%,transparent)}
.a5 .pMidH{position:absolute;left:30px;top:28px;font-family:var(--font-display);font-size:22px;font-weight:800;color:var(--text)}
.a5 .pMidS{position:absolute;left:30px;top:62px;font-size:13px;letter-spacing:.2em;color:var(--muted)}
.a5 .base{position:absolute;left:80px;top:896px;width:1760px;height:128px;display:flex;align-items:center;gap:20px;background:color-mix(in srgb,var(--brand) 22%,var(--surface));border-radius:14px;padding:0 32px;box-sizing:border-box}
.a5 .baseH{font-family:var(--font-display);font-size:26px;font-weight:800;color:var(--text);white-space:nowrap}
.a5 .baseI{flex:1;height:68px;display:flex;align-items:center;justify-content:center;background:var(--surface);border:1px solid var(--border);border-radius:8px;font-size:17px;font-weight:600;color:var(--text)}
</style>
<div class="a5" style="width:1920px;height:1080px;position:relative;overflow:hidden">
<div class="ttl" data-lumen-arch-node>智能经营总览</div>
<div class="sub" data-lumen-arch-node>场景 · 能力 · 价值</div>
<div class="rule"></div>
<div class="panel pleft">
<div class="pH" data-lumen-arch-node>用户与场景</div>
<div class="pS" data-lumen-arch-node>覆盖与闭环</div>
<div class="stack">
<div class="card"><div class="cardT" data-lumen-arch-node>用户覆盖</div><div class="cardS" data-lumen-arch-node>一线业务用户 · 职能用户 · 管理层用户</div></div>
<div class="card"><div class="cardT" data-lumen-arch-node>场景闭环</div><div class="cardS" data-lumen-arch-node>战术计划 · 关键指标 · 绩效考核</div></div>
</div>
</div>
<div class="panel pmid">
<div class="pMidH" data-lumen-arch-node>能力层</div>
<div class="pMidS" data-lumen-arch-node>应用与工具双轮驱动</div>
<div class="sub sl">
<div class="subH" data-lumen-arch-node>情景化应用</div>
<div class="item"><span data-lumen-arch-node>决策</span><span class="dot"></span></div>
<div class="item"><span data-lumen-arch-node>绩效</span><span class="dot"></span></div>
<div class="item"><span data-lumen-arch-node>检视</span><span class="dot"></span></div>
<div class="item"><span data-lumen-arch-node>评估</span><span class="dot"></span></div>
</div>
<div class="core" data-lumen-arch-node>智能应用平台</div>
<div class="sub sr">
<div class="subH" data-lumen-arch-node>数智化工具</div>
<div class="item"><span data-lumen-arch-node>全程数据</span><span class="dot"></span></div>
<div class="item"><span data-lumen-arch-node>分析互动</span><span class="dot"></span></div>
<div class="item"><span data-lumen-arch-node>销售所验</span><span class="dot"></span></div>
<div class="item"><span data-lumen-arch-node>各级客户</span><span class="dot"></span></div>
</div>
</div>
<div class="panel pright">
<div class="pH" data-lumen-arch-node>价值</div>
<div class="pS" data-lumen-arch-node>洞察 · 追踪 · 评估</div>
<div class="stack">
<div class="card"><div class="cardT" data-lumen-arch-node>洞察</div><div class="cardS" data-lumen-arch-node>全量业务与用户分析</div></div>
<div class="card"><div class="cardT" data-lumen-arch-node>追踪</div><div class="cardS" data-lumen-arch-node>问题追踪与考核依据</div></div>
<div class="card"><div class="cardT" data-lumen-arch-node>评估</div><div class="cardS" data-lumen-arch-node>信息实时透明可评</div></div>
</div>
</div>
<div class="base">
<div class="baseH" data-lumen-arch-node>中台能力支撑</div>
<div class="baseI" data-lumen-arch-node>数据中台</div>
<div class="baseI" data-lumen-arch-node>业务中台</div>
<div class="baseI" data-lumen-arch-node>算法服务</div>
<div class="baseI" data-lumen-arch-node>权限与安全</div>
</div>
</div>`,
  },
  {
    id: "arch/iso-five-tier@v1",
    name: "等距五层台",
    group: "layer",
    brief: "等距椭圆台一层压一层，自底向上堆叠五层，适合画平台分层与中台架构。",
    skeleton: `<style>.a1{position:absolute;box-sizing:border-box}.a1-h{left:120px;top:56px;font-family:var(--font-display);font-size:54px;font-weight:800;letter-spacing:-.02em;line-height:1;color:var(--text)}.a1-s{left:124px;top:128px;font-size:18px;letter-spacing:.3em;color:var(--muted)}.a1-iso{position:absolute;border-radius:50%}.a1-wall{background:var(--brand);opacity:.22}.a1-surf{background:var(--surface);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;gap:16px;box-shadow:0 40px 80px color-mix(in srgb,var(--text) 16%,transparent)}.a1-lbl{font-family:var(--font-display);font-size:22px;font-weight:800;letter-spacing:.12em;color:var(--text)}.a1-tag{font-family:var(--font-display);font-size:21px;font-weight:900;letter-spacing:.06em;color:var(--text);padding-right:22px;border-right:2px solid var(--border);white-space:nowrap}.a1-n{background:color-mix(in srgb,var(--accent) 14%,transparent);border:1px solid var(--border);border-radius:10px;padding:10px 18px;font-size:16px;color:var(--text);line-height:1.35;white-space:nowrap}.a1-n b{display:block;font-size:19px;font-weight:700;letter-spacing:.04em}.a1-n small{display:block;font-size:12px;letter-spacing:.1em;color:var(--muted);margin-top:6px;font-weight:400}</style><div style='width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden;font-family:var(--font-sans)'><div class='a1 a1-h' data-lumen-arch-node>智算服务平台逻辑架构</div><div class='a1 a1-s' data-lumen-arch-node>自底向上 · 基础设施到用户交互</div><div class='a1-iso a1-wall' style='left:780px;top:188px;width:360px;height:82px'></div><div class='a1-iso a1-surf' style='left:780px;top:176px;width:360px;height:82px'><div class='a1-lbl' data-lumen-arch-node>用户交互</div></div><div class='a1-iso a1-wall' style='left:510px;top:288px;width:900px;height:146px'></div><div class='a1-iso a1-surf' style='left:510px;top:276px;width:900px;height:146px'><div class='a1-tag' data-lumen-arch-node>应用接入层</div><div class='a1-n' data-lumen-arch-node>API 网关</div><div class='a1-n' data-lumen-arch-node>场景化方案</div><div class='a1-n' data-lumen-arch-node>可视化平台</div><div class='a1-n' data-lumen-arch-node>模型市场</div></div><div class='a1-iso a1-wall' style='left:380px;top:452px;width:1160px;height:164px'></div><div class='a1-iso a1-surf' style='left:380px;top:440px;width:1160px;height:164px'><div class='a1-tag' data-lumen-arch-node>AI 模型层</div><div class='a1-n' data-lumen-arch-node>预训练模型</div><div class='a1-n' data-lumen-arch-node>AutoML 工具</div><div class='a1-n' data-lumen-arch-node>模型工厂</div></div><div class='a1-iso a1-wall' style='left:270px;top:634px;width:1380px;height:172px'></div><div class='a1-iso a1-surf' style='left:270px;top:622px;width:1380px;height:172px'><div class='a1-tag' data-lumen-arch-node>计算引擎层</div><div class='a1-n' data-lumen-arch-node>分布式训练</div><div class='a1-n' data-lumen-arch-node>推理优化</div><div class='a1-n' data-lumen-arch-node>任务调度</div></div><div class='a1-iso a1-wall' style='left:140px;top:824px;width:1640px;height:194px'></div><div class='a1-iso a1-surf' style='left:140px;top:812px;width:1640px;height:194px'><div class='a1-n' data-lumen-arch-node><b>硬件支撑</b><small>GPU/TPU 集群 · 高速网络</small></div><div class='a1-n' data-lumen-arch-node><b>云原生架构</b><small>容器编排 · 弹性扩缩容</small></div><div class='a1-n' data-lumen-arch-node><b>数据湖</b><small>原始数据存储与预处理</small></div></div></div>`,
  },
  {
    id: "arch/info-house-triple@v1",
    name: "信息屋三栏",
    group: "frame",
    brief: "三角屋脊压顶、三根立柱横向并列、底部横梁收口，适合画信息屋式框架。",
    skeleton: `<style>.b1{position:absolute;box-sizing:border-box}.b1-h{left:120px;top:52px;font-family:var(--font-display);font-size:52px;font-weight:800;letter-spacing:-.02em;line-height:1;color:var(--text)}.b1-s{left:124px;top:122px;font-size:18px;letter-spacing:.3em;color:var(--muted)}.b1-roof{position:absolute;left:140px;top:170px;width:1640px;height:104px;background:color-mix(in srgb,var(--accent) 26%,var(--surface));clip-path:polygon(0 100%,5% 0,95% 0,100% 100%);display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:30px;font-weight:800;letter-spacing:.1em;color:var(--text)}.b1-col{position:absolute;top:300px;height:640px;background:var(--surface);border:1px solid var(--border);border-radius:18px;box-sizing:border-box}.b1-ch{position:absolute;left:0;right:0;top:0;height:58px;display:flex;align-items:center;justify-content:center;font-family:var(--font-display);font-size:21px;font-weight:800;letter-spacing:.12em;color:var(--text);border-bottom:1px dashed var(--border)}.b1-hub{position:absolute;border-radius:50%;background:color-mix(in srgb,var(--accent) 20%,var(--surface));border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:19px;font-weight:700;letter-spacing:.08em;color:var(--text)}.b1-chip{position:absolute;border-radius:999px;background:color-mix(in srgb,var(--brand) 16%,transparent);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:15px;color:var(--text);white-space:nowrap}.b1-li{position:absolute;height:48px;border-radius:8px;background:color-mix(in srgb,var(--text) 5%,transparent);border:1px solid var(--border);display:flex;align-items:center;padding-left:18px;font-size:16px;color:var(--text);box-sizing:border-box}.b1-card{position:absolute;left:20px;right:20px;border-radius:14px;background:color-mix(in srgb,var(--brand) 8%,transparent);border:1px solid var(--border);box-sizing:border-box}.b1-pill{position:absolute;left:18px;right:18px;top:20px;height:42px;border-radius:8px;background:color-mix(in srgb,var(--accent) 22%,var(--surface));display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;letter-spacing:.06em;color:var(--text)}.b1-mini{position:absolute;top:80px;height:48px;border-radius:8px;background:color-mix(in srgb,var(--text) 6%,transparent);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:15px;color:var(--text);white-space:nowrap}.b1-out{position:absolute;left:20px;right:20px;border-radius:14px;border:1px solid var(--border);background:color-mix(in srgb,var(--accent) 10%,transparent);box-sizing:border-box}.b1-oh{position:absolute;left:16px;right:16px;top:18px;height:40px;border-radius:8px;background:color-mix(in srgb,var(--accent) 24%,var(--surface));display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;letter-spacing:.08em;color:var(--text)}.b1-or{position:absolute;left:16px;right:16px;height:40px;border-radius:8px;background:color-mix(in srgb,var(--text) 5%,transparent);border:1px solid var(--border);display:flex;align-items:center;padding-left:16px;font-size:15px;color:var(--text);box-sizing:border-box}.b1-arr{position:absolute;top:604px;width:0;height:0;border-top:16px solid transparent;border-bottom:16px solid transparent;border-left:22px solid var(--accent)}.b1-base{position:absolute;left:140px;top:958px;width:1640px;height:74px;border-radius:14px;background:color-mix(in srgb,var(--accent) 22%,var(--surface));border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:700;letter-spacing:.14em;color:var(--text)}</style><div style='width:1920px;height:1080px;position:relative;background:var(--bg);overflow:hidden;font-family:var(--font-sans)'><div class='b1 b1-h' data-lumen-arch-node>产品研发信息屋架构</div><div class='b1 b1-s' data-lumen-arch-node>输入 · 开发 · 输出 三面一体</div><div class='b1-roof' data-lumen-arch-node>研发生产信息屋逻辑架构</div><div class='b1-col' style='left:160px;width:480px'><div class='b1-ch' data-lumen-arch-node>信息输入</div><div class='b1-hub' style='left:165px;top:96px;width:150px;height:150px' data-lumen-arch-node>需求</div><div class='b1-chip' style='left:50px;top:274px;width:118px;height:46px' data-lumen-arch-node>技术</div><div class='b1-chip' style='left:312px;top:274px;width:118px;height:46px' data-lumen-arch-node>资源</div><div class='b1-li' style='left:40px;right:40px;top:352px' data-lumen-arch-node>目标用户画像分析</div><div class='b1-li' style='left:40px;right:40px;top:412px' data-lumen-arch-node>竞品功能对比数据</div><div class='b1-li' style='left:40px;right:40px;top:472px' data-lumen-arch-node>行业趋势研究报告</div></div><div class='b1-arr' style='left:660px'></div><div class='b1-col' style='left:716px;width:488px'><div class='b1-ch' data-lumen-arch-node>智能开发</div><div class='b1-card' style='top:76px;height:156px'><div class='b1-pill' data-lumen-arch-node>研发设计</div><div class='b1-mini' style='left:16px;width:128px' data-lumen-arch-node>概念方案设计</div><div class='b1-mini' style='left:158px;width:128px' data-lumen-arch-node>结构优化建模</div><div class='b1-mini' style='left:300px;width:128px' data-lumen-arch-node>仿真测试验证</div></div><div class='b1-card' style='top:254px;height:156px'><div class='b1-pill' data-lumen-arch-node>生产管理</div><div class='b1-mini' style='left:16px;width:128px' data-lumen-arch-node>工艺流程规划</div><div class='b1-mini' style='left:158px;width:128px' data-lumen-arch-node>排产计划制定</div><div class='b1-mini' style='left:300px;width:128px' data-lumen-arch-node>质量监控体系</div></div><div class='b1-card' style='top:432px;height:156px'><div class='b1-pill' data-lumen-arch-node>产品数据整合</div><div class='b1-mini' style='left:16px;width:128px' data-lumen-arch-node>跨部门共享</div><div class='b1-mini' style='left:158px;width:128px' data-lumen-arch-node>全流程追踪</div><div class='b1-mini' style='left:300px;width:128px' data-lumen-arch-node>问题诊断分析</div></div></div><div class='b1-arr' style='left:1224px'></div><div class='b1-col' style='left:1276px;width:484px'><div class='b1-ch' data-lumen-arch-node>产品输出</div><div class='b1-out' style='top:76px;height:250px'><div class='b1-oh' data-lumen-arch-node>产品成果</div><div class='b1-or' style='top:78px' data-lumen-arch-node>合格产品交付</div><div class='b1-or' style='top:126px' data-lumen-arch-node>技术文档沉淀</div><div class='b1-or' style='top:174px' data-lumen-arch-node>专利成果产出</div></div><div class='b1-out' style='top:346px;height:250px'><div class='b1-oh' data-lumen-arch-node>反馈优化</div><div class='b1-or' style='top:78px' data-lumen-arch-node>生产问题改进建议</div><div class='b1-or' style='top:126px' data-lumen-arch-node>用户体验反馈报告</div><div class='b1-or' style='top:174px' data-lumen-arch-node>迭代升级方案</div></div></div><div class='b1-base' data-lumen-arch-node>整合输入 · 智能开发 · 输出提效</div></div>`,
  },
];
