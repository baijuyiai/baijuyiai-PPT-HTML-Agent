import { z } from 'zod';
import { CHART_KINDS } from './chart-kind.js';

/**
 * 页面类型（PRD §6 Page IR）。
 *
 * `imageText` 与 `gallery` 的区别是**谁是主角**：图文页是 1-2 张图、以文字为主；
 * 图片排版页是多张图成组铺开、以图为主。两者的版式与提示词完全不同，
 * 合成一类会让「一页放六张图」和「一页放一张配图」共用同一套规则。
 *
 * `architecture` 与 `mindMap` 是**图解页**，与 `chart` 的区别是「画什么」：
 * 图表页画的是数据（一个图表加一句结论），架构图画的是结构（分层或分区的方块加带箭头的连线），
 * 思维导图画的是层级（中心节点向外发散的分支）。三者的内容来源与提示词都不一样。
 *
 * `ui` 是**界面页**：一台 3D 设备（手机 / 笔记本 / 显示器）里嵌着一张可替换的 App 界面截图，
 * 配一段说明。它与 `imageText` / `gallery` 的区别是「图里是什么」——那两类的图是照片，
 * 配图从照片池取；界面页的图是**界面截图**，从界面池取，而且图是**贴在设备屏幕的透视四边形上**的。
 */
export const PageType = z.enum([
  'cover', 'toc', 'section', 'text', 'imageText', 'gallery', 'people', 'ui', 'chart', 'architecture', 'mindMap', 'metrics', 'end',
]);
export type PageType = z.infer<typeof PageType>;

/** 页面生成状态 */
export const PageStatus = z.enum(['pending', 'generating', 'ready', 'failed']);
export type PageStatus = z.infer<typeof PageStatus>;

/**
 * 允许的入场动效名。具体某风格可用哪些由 Style Pack 的 motionWhitelist 决定。
 *
 * 前两个是**模式**而不是具体动效，不受白名单约束（`lint.ts` 要放行）：
 * - `auto`：**逐块进场**，且进场方向按页序号轮换。默认值就是它。
 * - `stagger`：同样是逐块进场，但每页同一个方向。
 *
 * 两者的落点见 `@lumen/motion` 的 `resolveMotion`：它返回「页面这一层」与「元素这一层」
 * 两件事。逐块进场的标记与方向规则在 `html-doc.ts`（新链路，注入 iframe）与
 * `packages/slides/src/styles.css`（旧渲染器，主文档）各一份。
 */
export const MotionName = z.enum([
  'auto',
  'stagger',
  'none',
  'fade',
  'fadeUp',
  'fadeDown',
  'slideLeft',
  'slideRight',
  'scaleIn',
]);
export type MotionName = z.infer<typeof MotionName>;

/** `auto` 与 `stagger` 不是具体动效，白名单校验要跳过它们 */
export const MOTION_MODES: readonly MotionName[] = ['auto', 'stagger'];

export function isMotionMode(name: MotionName): boolean {
  return MOTION_MODES.includes(name);
}

/**
 * `motion.from` 取这个值时表示**这一页的动效是人手选的**，照它播。
 *
 * 其余情况（含默认的 `'style-pack'`）一律按页序号在白名单里轮换——
 * 这个字段在本次改动之前从来没人写过，所以「不是 manual」就等于「没人碰过」，
 * 历史上那些存着 `fadeUp` 的页面因此也能自动获得轮换，不需要改数据。
 */
export const MOTION_PINNED = 'manual';

export const MotionSpec = z.object({
  enter: MotionName.default('auto'),
  /** 动效来源。`manual` = 人手选的，照播；其余 = 没手选过，按页序号轮换 */
  from: z.string().default('style-pack'),
});
export type MotionSpec = z.infer<typeof MotionSpec>;

export const DEFAULT_MOTION: MotionSpec = { enter: 'auto', from: 'style-pack' };

/** 讲稿锚点：驱动讲解光标定位到页面内容块 */
export const Anchor = z.object({
  targetId: z.string(),
  /** 归一化坐标，0–1 */
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export type Anchor = z.infer<typeof Anchor>;

/** 讲稿分段 */
export const Segment = z.object({
  /** 起始毫秒 */
  t: z.number().int().min(0),
  text: z.string(),
  anchor: Anchor.optional(),
  cursor: z.boolean().default(true),
});
export type Segment = z.infer<typeof Segment>;

export const Script = z.object({
  cursorEnabled: z.boolean().default(false),
  text: z.string().default(''),
  segments: z.array(Segment).default([]),
  /**
   * 人工改过这份讲稿。
   * 置真后重新生成页面不会覆盖它——讲稿是逐字稿，人改过的每一个字都比机器重写的有价值。
   * 显式点「重新生成讲稿」才会清掉这个标记。
   */
  edited: z.boolean().default(false),
});
export type Script = z.infer<typeof Script>;

export const DEFAULT_SCRIPT: Script = { cursorEnabled: false, text: '', segments: [], edited: false };

/**
 * 数字人四态（PRD §5.13）。
 *
 * `pip` / `fullscreen` / `float` 是三种**展示形态**，`off` 是「本页不显示」。
 * 前三种是这一页长什么样，`off` 是这一页不要它——所以「功能库」那种列能力的页面上
 * 只摆前三种，`off` 留在项目里逐页配。
 *
 * `float` 与 `pip` 的区别不是位置而是**分量**：pip 是角落里一枚圆，让位给内容；
 * 浮框是右下角一块方窗口，讲解人是要被看清的。
 */
export const AvatarMode = z.enum(['pip', 'fullscreen', 'float', 'off']);
export type AvatarMode = z.infer<typeof AvatarMode>;

export const AvatarPosition = z.enum(['bottom-left', 'bottom-right', 'top-left', 'top-right']);
export type AvatarPosition = z.infer<typeof AvatarPosition>;

/** 数字人默认配置：默认关闭，pip 模式，左下角，直径 160，边距 24（PRD §5.13） */
export const DEFAULT_AVATAR: AvatarConfig = {
  enabled: false, mode: 'pip', position: 'bottom-left', diameter: 160,
  offset: { x: 24, y: 24 }, modelId: 'preset-business-01', portraitUrl: '',
  border: 'none', shadow: 'md', degraded: false,
};

export const AvatarConfig = z.object({
  enabled: z.boolean().default(false),
  mode: AvatarMode.default('pip'),
  position: AvatarPosition.default('bottom-left'),
  /** 直径 120–240，默认 160 */
  diameter: z.number().int().min(120).max(240).default(160),
  offset: z.object({ x: z.number().int().default(24), y: z.number().int().default(24) }).default(() => ({ x: 24, y: 24 })),
  modelId: z.string().default('preset-business-01'),
  /**
   * 上传的正面肖像地址（/files/...）。留空则用 modelId 对应的内置形象。
   * 肖像只用于本项目的口型驱动与展示，可随时删除（PRD §5.13）。
   */
  portraitUrl: z.string().default(''),
  border: z.string().default('none'),
  shadow: z.string().default('md'),
  /** 口型视频生成失败时降级为静态肖像 + 音频，并置此标记 */
  degraded: z.boolean().default(false),
});
export type AvatarConfig = z.infer<typeof AvatarConfig>;

/* ---------------- 图标 ---------------- */

/**
 * 图标名。渲染层用这套名字查一张手绘的线性 SVG 表，**不用 emoji、不引外部字体**——
 * 导出 HTML 要在任何机器上打开都一样，字体图标一旦缺字就变成方框。
 *
 * 名字按语义而非形状起（'growth' 不是 'arrow-up'），因为语义名才能让内容引擎
 * 按文本关键词自动配上图标。
 */
export const IconName = z.enum([
  'growth', 'decline', 'target', 'users', 'clock', 'shield', 'bolt', 'chart',
  'document', 'gear', 'check', 'star', 'globe', 'layers', 'lock', 'idea',
  'puzzle', 'rocket', 'money', 'calendar', 'message', 'search', 'filter',
  'grid', 'cube', 'cloud', 'database', 'key', 'map', 'flag',
  'bell', 'book', 'briefcase', 'building', 'code', 'cpu',
  'heart', 'home', 'mail', 'phone', 'pie', 'refresh',
  'tag', 'tool', 'warning', 'info', 'link', 'route',
]);
export type IconName = z.infer<typeof IconName>;

/** 关键词 → 图标。内容引擎按这个表给要点与指标自动配图标。 */
export const ICON_KEYWORDS: [IconName, string[]][] = [
  ['growth', ['增长', '提升', '上升', '提高', '扩张', '增幅', '增速']],
  ['decline', ['下降', '下滑', '降低', '减少', '收缩', '亏损', '衰减']],
  ['target', ['目标', '指标', '达成', '考核', '命中', '聚焦']],
  ['users', ['用户', '客户', '团队', '人员', '受众', '人群', '员工']],
  ['clock', ['时间', '周期', '耗时', '效率', '提速', '节奏', '时长']],
  ['shield', ['安全', '合规', '风险', '防护', '风控', '保障']],
  ['bolt', ['性能', '加速', '实时', '吞吐', '延迟', '算力']],
  ['chart', ['数据', '分析', '统计', '报表', '趋势', '占比']],
  ['document', ['文档', '报告', '方案', '规范', '材料', '交付物']],
  ['gear', ['流程', '机制', '配置', '运营', '体系', '设置']],
  ['check', ['完成', '验收', '通过', '确认', '上线', '落地']],
  ['star', ['优势', '亮点', '核心', '最佳', '领先', '标杆']],
  ['globe', ['市场', '全球', '行业', '海外', '生态', '区域']],
  ['layers', ['架构', '分层', '模块', '体系结构', '平台', '组件']],
  ['lock', ['权限', '隐私', '密钥', '加密', '授权', '隔离']],
  ['idea', ['创新', '想法', '洞察', '机会', '假设', '灵感']],
  ['puzzle', ['整合', '集成', '协同', '对接', '打通', '融合']],
  ['rocket', ['发布', '启动', '冲刺', '快速', '突破', '起飞']],
  ['money', ['成本', '收入', '营收', '价格', '预算', '毛利', '融资']],
  ['calendar', ['计划', '排期', '里程碑', '路线图', '阶段', '季度']],
  ['message', ['沟通', '反馈', '客服', '对话', '通知', '评论']],
  ['search', ['调研', '探索', '发现', '检索', '洞察']],
  ['filter', ['筛选', '分层', '优先级', '取舍', '聚焦']],
  ['grid', ['矩阵', '组合', '分类', '看板', '全景']],
  ['cube', ['产品', '能力', '功能', '模块化', '组件化']],
  ['cloud', ['云', '托管', '部署', '弹性', '线上']],
  ['database', ['存储', '数据源', '库', '沉淀', '资产']],
  ['key', ['关键', '核心能力', '解锁', '门槛']],
  ['map', ['路径', '规划', '布局', '地图', '导航']],
  ['flag', ['里程碑', '阶段目标', '标志', '节点']],
  ['warning', ['问题', '挑战', '难点', '瓶颈', '痛点', '风险点']],
  ['book', ['知识', '培训', '学习', '方法论', '教材']],
  ['briefcase', ['业务', '岗位', '项目', '客户方', '商务']],
  ['building', ['公司', '组织', '企业', '部门', '机构']],
  ['code', ['开发', '代码', '接口', '技术', '实现']],
  ['cpu', ['算法', '模型', '智能', '推理', '训练']],
  ['route', ['链路', '旅程', '流转', '动线', '闭环']],
];

/** 按文本挑一个图标；挑不出返回 undefined，让渲染层用风格包默认标记 */
export function iconForText(text: string): IconName | undefined {
  for (const [name, words] of ICON_KEYWORDS) {
    if (words.some((w) => text.includes(w))) return name;
  }
  return undefined;
}

/* ---------------- Block 判别联合 ---------------- */

export const ParagraphBlock = z.object({
  id: z.string().default(''),
  type: z.literal('paragraph'),
  text: z.string(),
});
export type ParagraphBlock = z.infer<typeof ParagraphBlock>;

export const BulletsBlock = z.object({
  id: z.string().default(''),
  type: z.literal('bullets'),
  /** 一页要点上限由风格包规则决定，schema 层硬上限 5 */
  items: z.array(z.string()).max(5),
  /**
   * 与 items 按下标对齐的图标。空串表示这条不配图标，渲染层退回风格包标记。
   *
   * 不用「数组可短于 items」的写法：那样「第 3 条有没有图标」取决于长度，
   * 一旦中间某条被删掉，后面所有图标都会错位一格。空串让下标恒定对齐。
   */
  icons: z.array(z.union([IconName, z.literal('')])).default(() => []),
});
export type BulletsBlock = z.infer<typeof BulletsBlock>;

export const MetricBlock = z.object({
  id: z.string().default(''),
  type: z.literal('metric'),
  value: z.string(),
  label: z.string(),
  trend: z.string().default(''),
  /** 原文出处，可回溯 */
  source: z.string().default(''),
  /** 主指标标记，一页一个，可一键改选 */
  primary: z.boolean().default(false),
  /** 图标名；留空则渲染层不画图标 */
  icon: IconName.optional(),
});
export type MetricBlock = z.infer<typeof MetricBlock>;

/** 图片生成参数：由风格包与 admin 配置共同决定 */
export const ImageGenParams = z.object({
  provider: z.string().default('openai-compatible'),
  model: z.string().default('gpt-image-2'),
  size: z.string().default('1536x1024'),
  quality: z.string().default('high'),
});
export type ImageGenParams = z.infer<typeof ImageGenParams>;

export const ImageBlock = z.object({
  id: z.string().default(''),
  type: z.literal('image'),
  source: z.enum(['ai', 'upload', 'stock']),
  src: z.string().default(''),
  /** AI 生成提示词。强制不含文字/Logo/可识别真人。 */
  prompt: z.string().default(''),
  genParams: ImageGenParams.default(() => ({ provider: 'openai-compatible', model: 'gpt-image-2', size: '1536x1024', quality: 'high' })),
  status: z.enum(['pending', 'ready', 'failed']).default('pending'),
  ratio: z.string().default('16:9'),
  caption: z.string().default(''),
  /** 焦点裁切位置，配合 object-fit: cover */
  focus: z.enum(['center', 'top', 'bottom', 'left', 'right']).default('center'),
  /** 降级占位图原因，非空时前端提示替换 */
  placeholderReason: z.string().default(''),
});
export type ImageBlock = z.infer<typeof ImageBlock>;

export const ChartSeries = z.object({
  name: z.string(),
  values: z.array(z.number()),
});
export type ChartSeries = z.infer<typeof ChartSeries>;

export const ChartBlock = z.object({
  id: z.string().default(''),
  type: z.literal('chart'),
  /**
   * 图表种类。**清单只写一处**（`chart-kind.ts`），`@lumen/charts` 与图表槽的校验
   * 都引同一份——两边各写一个联合类型的话，加了新图表而漏改一边，
   * 症状是「模型写出了某种图、但校验层说不认识它」，要到生成时才炸。
   *
   * 旧渲染器（`packages/slides`）只会产出原先那六种，其余种类它会渲染成空。
   * 新链路不走这里——它走页面 HTML 里的图表槽。
   */
  kind: z.enum(CHART_KINDS),
  data: z.object({
    categories: z.array(z.string()),
    series: z.array(ChartSeries),
  }),
  /** 渲染器可插拔，IR 保持中立 */
  renderer: z.enum(['echarts', 'antv']).default('echarts'),
  /** 由 IR 派生出的渲染器专属配置，非真值来源 */
  option: z.record(z.unknown()).default(() => ({})),
});
export type ChartBlock = z.infer<typeof ChartBlock>;

/**
 * 目录条目。
 * 单独成块而不是复用 bullets：目录条目是导航，不是「一页要点」，
 * 复用会被品质基线「要点 ≤5 条」卡死——一个八章的 deck 目录本来就有八条。
 */
export const TocItem = z.object({
  title: z.string(),
  /** 指向的页码，0 表示未定 */
  pageNo: z.number().int().min(0).default(0),
});
export type TocItem = z.infer<typeof TocItem>;

export const TocBlock = z.object({
  id: z.string().default(''),
  type: z.literal('toc'),
  items: z.array(TocItem),
});
export type TocBlock = z.infer<typeof TocBlock>;

export const Block = z.discriminatedUnion('type', [
  ParagraphBlock,
  BulletsBlock,
  MetricBlock,
  ImageBlock,
  ChartBlock,
  TocBlock,
]);
export type Block = z.infer<typeof Block>;

/** 构造内容块的入参类型：带 default 的字段可选，由 parse 补齐 */
export type BlockInput = z.input<typeof Block>;

/* ---------------- Page IR ---------------- */

export const PageTitle = z.object({
  eyebrow: z.string().default(''),
  main: z.string(),
  accentWords: z.array(z.string()).default([]),
  sub: z.string().default(''),
});
export type PageTitle = z.infer<typeof PageTitle>;

export const PageFooter = z.object({
  source: z.string().default(''),
  pageNo: z.number().int().min(0).default(0),
});
export type PageFooter = z.infer<typeof PageFooter>;

export const PageIR = z.object({
  pageId: z.string(),
  pageType: PageType,
  /** 形如 'imageText/left-right@v1' */
  layoutVariant: z.string(),
  title: PageTitle,
  blocks: z.array(Block).default([]),
  motion: MotionSpec.default(() => DEFAULT_MOTION),
  script: Script.default(() => DEFAULT_SCRIPT),
  avatar: AvatarConfig.default(() => DEFAULT_AVATAR),
  footer: PageFooter.default(() => ({ source: '', pageNo: 0 })),
  overrides: z.record(z.unknown()).default(() => ({})),
  status: PageStatus.default('pending'),
  /** 生成降级原因，非空表示走了回退路径 */
  degradeReason: z.string().default(''),
  /**
   * 这一页的 HTML。
   *
   * 新链路里页面就是一段 HTML：模型照着该页类型的风格提示词写出来，
   * 渲染时填进 1920×1080 的画布。旧渲染器（按 `blocks` 排版的 `@lumen/slides`）
   * 忽略这个字段——两条路并存期间，同一个页面文档两种渲染器各取所需，
   * 等旧路径删掉，`blocks` / `layoutVariant` / `motion` 一并消失，只剩它。
   */
  html: z.string().default(''),
  /**
   * 用户在「功能库」里给**这一页**挑的那份排版骨架，形如 `gallery/hero-title-stack@v1`。
   *
   * 空串 = 没挑过（这一页按风格里绑定的那份骨架生成）。
   *
   * **为什么记在页面上**：挑骨架时它只进模型提示词（`forcedLayoutBlock`），落库的
   * `layoutVariant` 在新链路里恒为空串——于是刷新之后、以及画布上那条生成动画要画
   * 「这一页将要长成的框架」时，谁都答不出这一页用的是哪份骨架。
   *
   * **不传强制骨架的生成会把它清空**（普通重生成走的是风格里绑定的那份，不是用户挑的）：
   * 留着它就是在说一件不再成立的事。
   */
  studioLayoutId: z.string().default(''),
});
export type PageIR = z.infer<typeof PageIR>;

/**
 * 构造页面的入参类型。
 * 与 PageIR 的差别是带 default 的字段在这里是可选的——调用方（测试、模板、迁移脚本）
 * 只需给出真正关心的字段，其余交给 parse 填默认值。
 */
export type PageIRInput = z.input<typeof PageIR>;

/**
 * 一页上**实际显示的文字**。`lines` 是标题之外的正文与要点，按阅读顺序。
 */
export interface PageText {
  eyebrow: string;
  main: string;
  sub: string;
  lines: string[];
}

/**
 * 这一页上**实际显示的文字**。
 *
 * 用途：换排版 / 转图文页时拿它当内容源，替掉教案那一份。两者经常对不上——
 * 实测一个项目里第 5 页的页面上写着「FDE做什么：从模糊诉求到可复用能力」加两条要点，
 * 而教案第 5 条写的是「关键数字」、要点为空。拿教案当内容源，转换后页面上原有的字
 * **会全部消失**，而那恰恰是用户要留下的东西。
 *
 * **标题单独取**（`main` / `sub` / `eyebrow`），不混进 `lines`：页面的 `title` 字段
 * 也要跟着换，不然右栏显示的是教案的标题、画布上是页面的标题，两处对不上。
 *
 * **只取看得见的字。** 图片的 `prompt`（生成用提示词）、`src`、`placeholderReason`
 * 都不算——它们不出现在成品上，注进提示词只会让模型把它们当成正文写出来。
 *
 * 图表块的 `series[].name` 与目录块的条目也不取：前者是图表数据的一部分，
 * 该跟着图表槽走；后者由整份大纲给出，不在这一页自己的文字里。
 */
export function pageTextOf(page: Pick<PageIR, 'title' | 'blocks'>): PageText {
  const lines: string[] = [];
  for (const b of page.blocks) {
    switch (b.type) {
      case 'paragraph': {
        const t = b.text.trim();
        if (t) lines.push(t);
        break;
      }
      case 'bullets':
        for (const item of b.items) {
          const t = item.trim();
          if (t) lines.push(t);
        }
        break;
      case 'metric':
        // 「值 + 标签」在数字页上是一体的，拆成两条会让模型把它们摆到两个地方
        lines.push(`${b.value} ${b.label}`.trim());
        break;
      case 'image': {
        const t = b.caption.trim();
        if (t) lines.push(t);
        break;
      }
      default:
        break;
    }
  }
  return {
    eyebrow: page.title.eyebrow.trim(),
    main: page.title.main.trim(),
    sub: page.title.sub.trim(),
    lines: lines.filter(Boolean),
  };
}
