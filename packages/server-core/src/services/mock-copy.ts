/**
 * 把样机上的文字改成**方向性占位**——纯函数，所以能直接测。
 *
 * ## 为什么要改
 *
 * 样机是「这套风格的这一页长什么样」的示例，而它上面的字现在是**具体内容**：
 * 「蔚蓝科技商务风」的封面样机里写着「企业年报 / ANNUAL REPORT」「以数字驱动企业增长」
 * 「汇报人：李承远」「2024.12.18」。一张样机只能配一个项目，谈不上通用；而生成中那张
 * 画布正是拿它当**通用框架**（见 `GenerationReveal`），所以文字要换成「这里主要讲解的
 * 核心内容」这类方向性占位——任何项目、任何页类型看着都成立。
 *
 * ## 只换文字，版式一个字节不动
 *
 * 改法是**文本节点级**的（`textRunsOf` / `applyTextRuns`）：标签、属性、样式都不碰，
 * 写回时还会转义。占位的长度按原文的**视觉长度**对齐（汉字算 1、拉丁与数字算 0.55），
 * 换完之后同一段的换行数就不变——「长度档位」那张表就是为了这件事，档位与占位文字
 * 自己的长度必须对得上（第一版是「9 个字的标题 → 4 个字的占位」，版式直接塌）。
 *
 * ## 判据只用文字本身的形状
 *
 * 不引浏览器量字号：脚本要在仓库根目录 `node --import tsx` 跑，`playwright` 只在
 * `apps/worker` 下。页码、日期、指标、`标签：值` 这几类靠形状就能认准，剩下的按长度分档
 * ——一个 20 字的占位放在 20 字的槽里，字号多大都撑得住。
 *
 * 调用方见 `scripts/rewrite-mock-copy.ts`（读写 `style_docs` 的那个脚本）。
 */
import { applyTextRuns, textRunsOf } from '@lumen/ir-schema';

const WIDE = /[⺀-鿿　-〿＀-￯]/;

/** 汉字算一个字宽，拉丁与数字只占约 0.55 个汉字宽——按**视觉**长度对齐，换行才不变 */
export function visualLen(text: string): number {
  let n = 0;
  for (const ch of text) n += WIDE.test(ch) ? 1 : 0.55;
  return n;
}

/** 页码是版式的骨架，不是内容：`01 / 12`、`第 1 页`、单独的一两位数，一律留着 */
const isPageNo = (t: string): boolean =>
  /^\d{1,3}\s*[/|／]\s*\d{1,3}$/.test(t) || /^第\s*\d{1,3}\s*页$/.test(t) || /^\d{1,2}$/.test(t);

const isDate = (t: string): boolean =>
  // 「2024年12月」这种只到月、后面没有日，末尾那个单位也要算进去（少写一个分支就漏）
  /^\d{4}[./\-年]\d{1,2}([./\-月]\d{1,2}日?|月|日)?$/.test(t)
  || /^\d{4}\s*[-–—~至]\s*\d{4}$/.test(t)
  || /^\d{1,2}\s*月\s*\d{1,2}?\s*日?$/.test(t);

const isNumber = (t: string): boolean =>
  /^[¥$]?[+-]?\d[\d,]*(\.\d+)?\s*(%|％|K|M|B|万|亿|个|人|倍|\+)?$/.test(t);

const isSymbols = (t: string): boolean => /^[\p{P}\p{S}\s]+$/u.test(t);

/* ------------------------------------------------------------------ *
 * 两套词表：中文一套、拉丁一套
 * ------------------------------------------------------------------ */

/**
 * 这一段是**中文语境还是拉丁语境**：只看有没有汉字。
 *
 * 上一版按「拉丁字母占比 ≥ 0.6」判：`Vol.01`（一半是字母）与 `Oak` 这类字标都被判成中文，
 * 于是**封面大标题的位置上出现了「栏目」**——风格本来是拉丁排版，塞一个巨大的中文字进去，
 * 字距、字重、气质全变了。同理 `Lumen.Press` 换出来的是「SECTION / 栏目」这种中英混排。
 */
const HAN = /[㐀-䶿一-鿿]/;

/**
 * 中文：短栏目标签。**按段序轮换**——一页上连着三四个短标签是常态（导航词、字标、刻度），
 * 全换成同一个词就会读成「标签 标签 标签」，一眼就像坏了。
 */
const HAN_TINY = ['标签', '内容', '要点', '说明', '文字'];
const HAN_TINY4 = ['占位文字', '此处说明', '本页说明', '补充说明'];
/** 中文：开头语、接续语、收尾。**列表顺序即偏好**，同样长度取靠前的那个 */
const HAN_HEADS = [
  '这里的内容', '这里讲的内容', '这里的主要内容', '这里主要讲的内容', '这里主要讲解的内容',
  '这一页主要讲解的内容', '这里主要讲解的核心内容', '这一页主要讲解的核心内容',
  '这里主要讲解的核心内容与要点', '这一页主要讲解的核心内容与要点',
];
const HAN_MIDS = ['，以及它们之间的关系', '，把要讲的意思说清楚', '，这一块放具体的说明文字'];
const HAN_ENDS = ['。', '……'];

/** 拉丁：**一个汉字都不给**。原文是拉丁排版，占位就得是拉丁的，连长度都不便混排 */
const LATIN_TINY = ['ARC', 'INK', 'DOT', 'KEY', 'MAP'];
const LATIN_SHORT = ['PAGE', 'NOTE', 'ITEM', 'TEXT', 'GRID'];
const LATIN_WORD = ['LABEL', 'BRAND', 'INDEX', 'TITLE', 'NOTES'];
const LATIN_WORD6 = ['STUDIO', 'NOTICE', 'LEGEND', 'CAPTION'];
const LATIN_HEAD = ['SECTION', 'CONTENTS', 'TEMPLATE', 'DOCUMENT'];
/** 十来二十个字母的中长串：字标下面那一行说明、眉标 */
const LATIN_MID = ['SECTION ONE', 'SECTION TWO', 'LABEL NAME', 'TITLE NAME', 'STUDIO ONE'];
const LATIN_PHRASE = ['SECTION TITLE / LABEL', 'SECTION TITLE · KICKER', 'SECTION TITLE / LABEL NAME', 'SECTION TITLE · KICKER / LABEL'];
const LATIN_TAILS = [' / LABEL', ' · KICKER', ' / SECTION', ' · INDEX', ' TITLE'];

/**
 * 长文续写用的填充句，**从长到短**依次试。每一句都自己站得住，拼起来是一串占位说明，
 * 不会拼出「。。」「。，」这种连着的收尾；最短那句是 3 个字，所以长段落的长度差最多 2 个字
 * （一整段短掉一整行，是原来那种粗档位才干得出来的事）。
 */
const HAN_FILLERS = ['这一块也是占位，讲清这一段要说明什么就行。', '这一段也照样说明。', '补充说明。', '说明。'];
const LATIN_FILLERS = [' / SECTION · LABEL NAME', ' · KICKER', ' / LABEL', ' NAME'];

/**
 * 认得出的**整词**占位：自己产的那几个，加上上一版留下的 `栏目`/`标题`/`日期`/`姓名`/`单位`
 * （上一版给拉丁字标的就是「栏目」这种中文词，重贴时要认出来才谈得上换掉）。
 */
const HAN_PLACEHOLDER_WORDS = [...HAN_TINY, ...HAN_TINY4, '栏目', '标题', '日期', '姓名', '单位', '占位', '此处'];
/** 上一版长段落那档的段首（`这里主要讲解……这一块放具体的说明文字…`） */
const V1_LONG_HEAD = '这里主要讲解……';

/** 拉丁占位里可能出现的**全部词**（从词表自己拆出来的，不用手写一遍） */
const LATIN_VOCAB = new Set(
  [...LATIN_TINY, ...LATIN_SHORT, ...LATIN_WORD, ...LATIN_WORD6, ...LATIN_HEAD, ...LATIN_MID, ...LATIN_PHRASE, ...LATIN_TAILS, ...LATIN_FILLERS]
    .flatMap((s) => s.split(/[^A-Za-z]+/)).filter(Boolean).map((w) => w.toUpperCase()),
);

/** 渲染层的数据（图表槽里那串 JSON），不是给人看的文案 */
const isData = (t: string): boolean => /^[[{<]/.test(t) || /^https?:/.test(t);

/**
 * 拉丁段是不是占位：把它拆成词，**每一个拉丁词都在词表里**，而且汉字那部分（如果有）
 * 也得是占位词，才算。
 *
 * 只看拉丁词不够——`Index · 目录`、`品牌基色 / BRAND`、`目录 / CONTENTS` 这些是样机上的
 * 真实栏目名，只因为恰好含一个词表里的词就被当成占位放过了（实测 34 段长度都偏长）。
 * 而上一版中英混排的占位 `SECTION / 栏目` 汉字部分是「栏目」，照样认得出。
 */
const isLatinPlaceholder = (t: string): boolean => {
  const words = t.split(/[^A-Za-z]+/).filter(Boolean);
  if (words.length === 0 || !words.every((w) => LATIN_VOCAB.has(w.toUpperCase()))) return false;
  const han = [...t].filter((c) => HAN.test(c)).join('');
  return han === '' || HAN_PLACEHOLDER_WORDS.includes(han);
};

/**
 * 中文段是不是占位。
 *
 * 短档那几个词要**整段就是那个词**才算：`标签`、`此处说明` 是占位，而 `文字即秩序`、
 * `此处为章节说明文字占位，用于呈现次级信息层级与行高节奏。` 是样机上的真实文案，
 * 只是开头撞上了占位词——按「开头像」判会把这些整段放过（实测漏掉 34 段，长度都偏长）。
 */
const isHanPlaceholder = (t: string): boolean =>
  HAN_PLACEHOLDER_WORDS.includes(t) || HAN_HEADS.some((h) => t.startsWith(h)) || t.startsWith(V1_LONG_HEAD);

/**
 * 这一段**已经是占位了**——再改一遍是换一个占位（比如「标签」被换成「内容」），
 * 没有任何意义，还会把长度一点点挪走。
 *
 * 「标签：值」那种带字段名的也算：字段名后的值认出来就行（`机构：单位`）。
 */
const isPlaceholder = (t: string): boolean => {
  if (/^0[\d.,]*[%KMB万亿个倍]?$/.test(t)) return true;
  if (isData(t)) return false;
  if (isHanPlaceholder(t) || isLatinPlaceholder(t)) return true;
  // 两个组：1 是字段名（含冒号），2 是值——判的是**值**，字段名是版式，不是占位
  const labelled = /^([^：:]{1,6}[：:])\s*(\S.*)$/.exec(t);
  return labelled !== null && (isHanPlaceholder(labelled[2]!) || isLatinPlaceholder(labelled[2]!));
};

/** 按段序把备选轮换顺序，让连着几个同样长的短标签拿到不同的词 */
const rotated = (arr: readonly string[], k: number): string[] => arr.map((_, i) => arr[(i + k) % arr.length]!);

/**
 * 轮换的槽位：**由原文决定**，段序掺进去做微扰。
 *
 * 只看段序不够——`Autumn` 与 `Leaves` 是同一行上的两个橙字，而段落里的序号是跳着走的
 * （实测跳过 4，段序对 4 取模正好原地打转，两个词都成了 `STUDIO`）。
 * 按原文散列，不同的词就换个备选；同样的一段文字在不同页上也拿到同一个词，读着是一套东西。
 */
const slotOf = (t: string, variant: number): number => {
  let h = 2166136261 ^ variant;
  for (const c of t) {
    h ^= c.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

/**
 * 挑占位：**取不超过目标、最长的那个**。「不超过」是硬要求——
 *
 * 占位比原文长，标题就会多折一行（红黑极简提案风的封面标题因此折成三行、压到了正文上），
 * 而短几个字只是少填一点，看不出来。同样长度取靠前的（顺序即偏好）。
 */
function pickFit(candidates: readonly string[], target: number): string {
  let best = '';
  for (const c of candidates) if (visualLen(c) <= target && visualLen(c) > visualLen(best)) best = c;
  return best;
}

function compose(heads: readonly string[], tails: readonly string[], fillers: readonly string[], target: number): string {
  const out = pickFit([...heads, ...heads.flatMap((h) => tails.map((t) => h + t))], target);
  if (out === '' || target - visualLen(out) <= 2) return out;
  // 长文：整句垫到接近目标（每一段都塞得下，绝不超过）
  let long = visualLen(out) >= 11 ? out : heads[heads.length - 1]!;
  for (const f of fillers) while (visualLen(long) + visualLen(f) <= target) long += f;
  return visualLen(long) > visualLen(out) ? long : out;
}

function hanPlaceholder(target: number, slot: number): string {
  const heads = [
    ...rotated(HAN_TINY, slot), ...rotated(HAN_TINY4, slot),
    ...HAN_HEADS, ...HAN_HEADS.flatMap((h) => HAN_ENDS.map((e) => h + e)),
    ...HAN_HEADS.flatMap((h) => HAN_MIDS.map((m) => h + m)),
    ...HAN_HEADS.flatMap((h) => HAN_MIDS.flatMap((m) => HAN_ENDS.map((e) => h + m + e))),
  ];
  return compose(heads, [], HAN_FILLERS, target);
}

function latinPlaceholder(target: number, slot: number): string {
  const heads = [
    ...rotated(LATIN_TINY, slot), ...rotated(LATIN_SHORT, slot), ...rotated(LATIN_WORD, slot),
    ...rotated(LATIN_WORD6, slot), ...rotated(LATIN_HEAD, slot),
    ...LATIN_MID, ...LATIN_PHRASE,
  ];
  return compose(heads, LATIN_TAILS, LATIN_FILLERS, target);
}

/**
 * 汉字占了多大比例的视觉宽度。**不到三成按拉丁处理**——
 * 「PAPER & LIGHT · 纸光志」这种刊头以拉丁为主，占位也该是拉丁的；
 * 而「品牌视觉系统 · 2025」汉字过半，就该是中文占位。
 */
function hanShare(t: string): number {
  const total = visualLen(t);
  if (total === 0) return 0;
  return [...t].filter((c) => HAN.test(c)).length / total;
}

/** 按语境分派：汉字够多走中文那套，否则走拉丁那套 */
function placeholderFor(t: string, variant: number): string {
  const target = visualLen(t);
  const slot = slotOf(t, variant);
  return hanShare(t) >= 0.35 ? hanPlaceholder(target, slot) : latinPlaceholder(target, slot);
}

/**
 * 这一段文字该换成什么。**返回 `null` 表示留着不动**。
 *
 * `tag` 现在没用上：判据全在文字形状上。留着这个参数是因为调用方手上就有它
 * （`TextRun.tag`），哪天要按标签细分（比如 `h1` 一律当标题）不用再改签名。
 * `variant` 是**段序**，只用来轮换那几个短的备选（见 `HAN_TINY` / `LATIN_WORD`）——
 * 同一个输入永远给同一个结果，脚本重跑两次不会得到两份不同的样机。
 */
export function placeholderCopy(text: string, _tag = '', variant = 0): string | null {
  const t = text.trim();
  if (t === '' || isSymbols(t) || isData(t) || isPlaceholder(t)) return null;
  if (isPageNo(t)) return null;
  if (isDate(t)) return '日期';
  if (isNumber(t)) return t.replace(/\d/g, '0');
  // 太短的（一个字母、一个点）多半是刻度或装饰，换了反而把轴上的字撑开
  if (visualLen(t) < 1.2) return null;

  /*
    「标签：值」只认**短**的那种。
    第一版见到冒号就按字段拆，于是「元数据驱动：指标、血缘、权限在同一张图上维护……」
    这种一句话被拆成「元数据驱动：内容」——句子里的冒号比字段多得多。
  */
  const labelled = /^([^：:]{1,6}[：:])\s*(\S.*)$/.exec(t);
  if (labelled && visualLen(t) <= 22) {
    const value = labelled[2]!;
    /*
      「姓名」「单位」只认**短**值。
      第一版见到「中心」就当机构，于是「来源：内部数据平台 · 更新时间 2024.12」整条
      被换成「来源：单位」——那一行是脚注，不是机构字段。
    */
    const shortValue = visualLen(value) <= 12 && !/[·、，,；;]/.test(value);
    if (isDate(value)) return `${labelled[1]}日期`;
    if (isNumber(value)) return `${labelled[1]}${value.replace(/\d/g, '0')}`;
    if (shortValue && /^[㐀-鿿]{2,4}$/.test(value)) return `${labelled[1]}姓名`;
    if (shortValue && /公司|集团|中心|部|院|工作室|事业部|研究所|大学|机构/.test(value)) return `${labelled[1]}单位`;
    const inner = placeholderFor(value, variant);
    return inner === '' ? null : `${labelled[1]}${inner}`;
  }

  const out = placeholderFor(t, variant);
  return out === '' ? null : out;
}

/**
 * 这一段**看起来已经是占位了**（认 `PLACEHOLDER_PREFIX` 里那批词）。
 *
 * 给「按原文重贴一遍」那种补写脚本用的：库里那一段现在是占位，说明它当初被改过，
 * 才谈得上拿原文重新贴一次；本来就是原文的段（页码、图表数据、模型自己写的占位）一律不碰。
 */
export function isPlaceholderCopy(text: string): boolean {
  return isPlaceholder(text.trim());
}

export interface MockCopyResult {  /** 换完之后的那一版 HTML */
  html: string;
  /** 一页里有多少段文字 */
  runs: number;
  /** 实际改了几段 */
  changed: number;
  /** 长度差得多的那几段，人话写出来给脚本打印 */
  risky: string[];
}

/**
 * 把一页样机里的文字全换成方向性占位。
 *
 * 「长度差得多」的判据是 `|差| > max(3, 35%)`——**绝对差 3 个字以内不算**：
 * 短串的百分比天然大（`企业年报` 4 个字换成 `标签` 2 个），而那点差别撑不动版式。
 */
export function rewriteMockCopy(mockHtml: string): MockCopyResult {
  const runs = textRunsOf(mockHtml);
  const edits: { i: number; text: string }[] = [];
  const risky: string[] = [];

  for (const run of runs) {
    const next = placeholderCopy(run.text, run.tag, run.i);
    if (next === null || next === run.text) continue;
    const before = visualLen(run.text.trim());
    const delta = Math.abs(visualLen(next) - before);
    if (delta > Math.max(3, before * 0.35)) {
      risky.push(`「${run.text.trim().slice(0, 20)}」(${Math.round(before)}) → 「${next.slice(0, 16)}」(${Math.round(visualLen(next))})`);
    }
    edits.push({ i: run.i, text: next });
  }

  return { html: applyTextRuns(mockHtml, edits), runs: runs.length, changed: edits.length, risky };
}
