import { z } from 'zod';

import { fontLabelOf } from './font-choices.js';

/**
 * 风格规范：一套风格里**跨页应当统一**的那些系统性细节。
 *
 * ## 为什么要有这一层
 *
 * 识别时是**逐页**写提示词的，每一页各写各的：实测同一套「蔚蓝科技商务风」里，
 * 文字页的标题是 44px/800 用 `--brand`、数字页是 46px/800 用 `--text`，
 * 装饰条一个在标题下方 96×6、一个在标题上方 72×6，品牌角标一边是 34×34 圆角方块、
 * 封面一边是 8×56 竖条。单独看每一页都成立，一张一张翻过去就散了。
 *
 * 这一层把那些细节提炼成一份**全篇共用的规范**，用在三处：
 * 界面上当「风格介绍」给用户看、改写各页提示词时当依据、生成新页面时注入。
 *
 * ## 两条设计约束
 *
 * 1. **颜色只写语义名**（`brand` / `accent` / …），不写色值。色值已经由
 *    `StyleDoc.palette` 单点管住，规范里再写一遍色值就有了第二个真值。
 * 2. **只管系统性细节，不管这一页画什么**。标题层级、角标形态、页脚、边距、
 *    圆角、装饰语言是「一套风格」的骨架；插图、卡片形式、内容组织是每页自己的事，
 *    统一到那一层会把每页都改成同一个样子。
 */

/**
 * 规范里的颜色一律指向调色板的语义名。
 *
 * **`border` 也在内**：它是调色板里真实存在的一个色，而「分隔线用 --border」是模型
 * 最自然的选择——实测提炼时它两次想给 `border` 却撞在枚举上，白重发一轮才改用 muted。
 * 枚举的职责是「限定在调色板里选」，不是「只准用其中四个」。
 * `bg` / `surface` 不收：那是底与面的颜色，不会出现在标题、标识或装饰条上。
 */
export const SpecColorRole = z.enum(['brand', 'accent', 'text', 'muted', 'border']);
export type SpecColorRole = z.infer<typeof SpecColorRole>;

/** 页眉品牌标识的形态 */
export const SpecHeaderKind = z.enum(['bar', 'block', 'wordmark', 'none']);
export type SpecHeaderKind = z.infer<typeof SpecHeaderKind>;

/** 标题强调条相对标题的位置 */
export const SpecRulePosition = z.enum(['above', 'below', 'none']);
export type SpecRulePosition = z.infer<typeof SpecRulePosition>;

/**
 * 页眉品牌标识、页码这类**角标**在页面里靠哪边。
 *
 * 与 `title.align` 分开写：标题居中不等于页码也居中，实测两者常常一个居中一个靠右。
 */
export const SpecAlign = z.enum(['left', 'center', 'right']);
export type SpecAlign = z.infer<typeof SpecAlign>;

/**
 * 页码的写法。
 *
 * 这是「一套风格」辨识度的一部分——`01 / 24` 和 `第 1 页` 是两种气质。
 * 原先规范里只有一个 `showPageNo` 布尔值，页码写成长什么样全靠模型每页即兴，
 * 于是同一套风格里出现过 `3`、`03`、`3 / 12` 三种。
 */
export const SpecPageNoFormat = z.enum(['plain', 'padded', 'of-total', 'chinese']);
export type SpecPageNoFormat = z.infer<typeof SpecPageNoFormat>;

/**
 * 字体角色。
 *
 * 规范里存的是 `font-choices.ts` 里的 **id**，不是字体栈——理由写在那个文件的开头。
 * 四个角色对应四类内容：
 *
 * - `display` 大标题、封面主标题
 * - `body` 正文、说明文字
 * - `script` 手写体，用在签名、引言、装饰小字
 * - `numeric` 数字，用在指标值、大号序号、页码
 */
export const SpecFontRole = z.enum(['display', 'body', 'script', 'numeric']);
export type SpecFontRole = z.infer<typeof SpecFontRole>;

export const SPEC_FONT_ROLES: SpecFontRole[] = ['display', 'body', 'script', 'numeric'];

const FONT_ROLE_LABEL: Record<SpecFontRole, string> = {
  display: '大标题',
  body: '正文',
  script: '手写体',
  numeric: '数字',
};

/** 字体角色的显示名。界面上那一栏与提示词里用的是同一份措辞 */
export function fontRoleLabel(role: SpecFontRole): string {
  return FONT_ROLE_LABEL[role];
}

/**
 * 这套风格里用到的**视觉效果**。
 *
 * 这些是风格的辨识度所在：同样是深色底、同样字号，毛玻璃卡片和实心卡片看着
 * 完全是两套东西；同样是强调色，加了外发光和没加差着一个档次。
 *
 * 它们原先在规范里没有位置——识别时写在每页的「视觉与排版要求」里（或者压根没写），
 * 提炼规范时被丢掉，改写时各页各写各的，于是「这套风格会发光」这件事在统一之后就没了。
 * 生成新页面时也注入不到，产出的页只剩一个普通版式。
 */
export const SpecEffectKind = z.enum(['gradient', 'glass', 'glow', 'neon']);
export type SpecEffectKind = z.infer<typeof SpecEffectKind>;

export const SpecEffect = z.object({
  kind: SpecEffectKind,
  /**
   * 用在哪儿、怎么做出来，一句话说清。
   * 要具体到能照着写：「卡片底用 135° 的 brand→accent 线性渐变」，
   * 不是「用了渐变」——后者等于没说。
   */
  note: z.string(),
});
export type SpecEffect = z.infer<typeof SpecEffect>;

/**
 * 一档字级：字号 / 字重 / 颜色。副标题、正文、数字三档共用这个形状。
 *
 * 标题单独写（它多一条强调条），其余三档都是这三项。
 */
const TypeLevel = z.object({
  sizePx: z.number().int().min(10).max(200),
  weight: z.number().int().min(300).max(900),
  color: SpecColorRole,
});

/**
 * 四个字体角色各自用哪套字体。
 *
 * 值是 `font-choices.ts` 里的 id。**空串表示「这套风格没指定」**——按 `StyleDoc`
 * 原有的字体栈走。留这个第三态是因为存量规范里没有这一段：给个默认值会把所有老风格
 * 悄悄换掉字体，而它们本来各有各的栈。
 */
const FontRoles = z.object({
  display: z.string().default(''),
  body: z.string().default(''),
  script: z.string().default(''),
  numeric: z.string().default(''),
});

export const StyleSpec = z.object({
  /** 这套风格的视觉主张，一两句。给「风格介绍」那一栏用 */
  intro: z.string().default(''),

  /** 页标题。全篇一个字号、一个字重、一个颜色、一个对齐 */
  title: z.object({
    sizePx: z.number().int().min(16).max(200),
    weight: z.number().int().min(300).max(900),
    color: SpecColorRole,
    align: z.enum(['left', 'center']),
    /** 标题的强调条。`none` 表示这套风格不用它 */
    rule: z.object({
      position: SpecRulePosition,
      widthPx: z.number().int().min(0).max(600),
      heightPx: z.number().int().min(0).max(24),
      color: SpecColorRole,
    }),
  }),

  /**
   * 副标题。比标题小、比正文大的一档，用在标题下方那句说明。
   *
   * 与 `title` 分开是因为这两档在实测里经常不按比例——有的风格标题 96px 副标题只有
   * 15px（靠巨大的落差做气质），有的 48px / 28px。写成一个缩放比例反而失真。
   */
  subtitle: TypeLevel.default(() => ({ sizePx: 28, weight: 500, color: 'muted' } as const)),

  /** 正文。`lineHeight` 单独给，正文的行高与字号一样是风格的辨识度 */
  body: TypeLevel.extend({ lineHeight: z.number().min(1).max(3) })
    .default(() => ({ sizePx: 16, weight: 400, color: 'text', lineHeight: 1.8 } as const)),

  /** 数字：指标值、大号序号。**不含页码**，页码在 `footer` 里 */
  numeric: TypeLevel.default(() => ({ sizePx: 64, weight: 700, color: 'brand' } as const)),

  fonts: FontRoles.default(() => ({ display: '', body: '', script: '', numeric: '' })),

  /** 页眉的品牌标识（角标）。形态、尺寸、位置全篇统一，`kind: 'none'` 表示不用页眉 */
  header: z.object({
    kind: SpecHeaderKind,
    sizePx: z.number().int().min(0).max(200),
    color: SpecColorRole,
    heightPx: z.number().int().min(0).max(300),
    /** 品牌标识靠页眉的哪边 */
    position: SpecAlign.default('left'),
    /** 页眉字（「目录 / CONTENTS」那类）的字号。0 表示这套风格不写页眉字 */
    textSizePx: z.number().int().min(0).max(60).default(0),
    textColor: SpecColorRole.default('muted'),
    textTransform: z.enum(['none', 'uppercase']).default('none'),
  }),

  footer: z.object({
    heightPx: z.number().int().min(0).max(300),
    showPageNo: z.boolean(),
    /** 页码靠页脚的哪边 */
    pageNoPosition: SpecAlign.default('right'),
    /** 页码的写法。见 `SpecPageNoFormat` */
    pageNoFormat: SpecPageNoFormat.default('plain'),
    /**
     * 页码字号。**0 表示不适用**——`showPageNo: false` 时模型会（合理地）给 0，
     * 卡一个下限只会让它白重发一轮（实测踩过）。与 `header.textSizePx` 同一个口径。
     */
    pageNoSizePx: z.number().int().min(0).max(60).default(13),
    pageNoColor: SpecColorRole.default('muted'),
  }),

  /** 左右安全边距。全篇统一，不然页与页之间内容宽度会跳 */
  marginPx: z.number().int().min(0).max(400),

  radius: z.object({
    card: z.number().int().min(0).max(64),
    inner: z.number().int().min(0).max(64),
  }),

  /** 允许出现的装饰语言，写成人话（「1px 细线」「圆角方块」…）。空数组表示不限 */
  decoration: z.array(z.string()).default(() => []),

  /**
   * 用到的视觉效果。空数组表示这套风格没有明显的效果语言（就是纯色块排版）。
   *
   * **它是清单不是白名单**：`decoration` 管的是「别加没出现过的」，这条管的是
   * 「这几个必须有」。两件事，别混。
   */
  effects: z.array(SpecEffect).default(() => []),
});
export type StyleSpec = z.infer<typeof StyleSpec>;

/**
 * 一处仍与规范对不上的地方。
 *
 * 契约放在这里而不是服务端：它是**两端共用的**——服务端产出、界面逐条列出来。
 * 只在服务端声明的话，界面那边只能靠强转，而强转会把字段名写错藏起来。
 */
export interface SpecDeviation {
  pageType: string;
  /** 对不上的是哪一项，如 `title.sizePx` / `header.kind` */
  field: string;
  expected: string;
  found: string;
}

const HEADER_KIND_LABEL: Record<SpecHeaderKind, string> = {
  bar: '一条竖条',
  block: '一枚圆角方块',
  wordmark: '只有一行文字，不加图形',
  none: '不用页眉',
};

const RULE_POSITION_LABEL: Record<SpecRulePosition, string> = {
  above: '标题上方',
  below: '标题下方',
  none: '不用强调条',
};

const EFFECT_LABEL: Record<SpecEffectKind, string> = {
  gradient: '渐变',
  glass: '毛玻璃',
  glow: '发光',
  neon: '霓虹',
};

const ALIGN_LABEL: Record<SpecAlign, string> = {
  left: '靠左',
  center: '居中',
  right: '靠右',
};

const PAGE_NO_FORMAT_LABEL: Record<SpecPageNoFormat, string> = {
  plain: '1',
  padded: '01',
  'of-total': '1 / 12',
  chinese: '第 1 页',
};

/** 页码写法的显示名。界面上那一栏与提示词里用的是同一份措辞 */
export function pageNoFormatLabel(format: SpecPageNoFormat): string {
  return PAGE_NO_FORMAT_LABEL[format];
}

/** 效果的显示名。界面上那一栏与提示词里用的是同一份措辞 */
export function effectLabel(kind: SpecEffectKind): string {
  return EFFECT_LABEL[kind];
}

/** 颜色语义名 → 提示词里该写的写法 */
function colorText(role: SpecColorRole): string {
  return `var(--${role})`;
}

/**
 * 把规范渲染成一段可以直接塞进提示词的文字。
 *
 * 与 `paletteBlock` / `fontBlock` 同一路数：**能明写的就明写**。
 * 只让模型「照着已有的页保持一致」是不够的——它看不到「已有的」是什么，
 * 实测同一套风格里各页各写各的配色就是这么来的。
 *
 * 只输出规范，不带任何「请遵守」之外的发挥空间：这段是要被模型**照抄进提示词**的，
 * 写得越像要求、越不容易被它当成建议。
 */
export function specBlock(spec: StyleSpec): string {
  const lines = [
    '这套风格的视觉规范，每一页都必须遵守（下面每一条都是全篇统一的，不要按页发挥）：',
    `- 页标题：${spec.title.sizePx}px / 字重 ${spec.title.weight} / 颜色 ${colorText(spec.title.color)} / ${spec.title.align === 'center' ? '居中' : '左对齐'}`
      + `；${RULE_POSITION_LABEL[spec.title.rule.position]}`
      + (spec.title.rule.position === 'none'
        ? ''
        : `一条 ${spec.title.rule.widthPx}×${spec.title.rule.heightPx}px 的 ${colorText(spec.title.rule.color)} 短横线`),
    `- 副标题：${spec.subtitle.sizePx}px / 字重 ${spec.subtitle.weight} / 颜色 ${colorText(spec.subtitle.color)}`,
    `- 正文：${spec.body.sizePx}px / 字重 ${spec.body.weight} / 颜色 ${colorText(spec.body.color)} / 行高 ${spec.body.lineHeight}`,
    `- 数字（指标值、大号序号）：${spec.numeric.sizePx}px / 字重 ${spec.numeric.weight} / 颜色 ${colorText(spec.numeric.color)}`,
  ];

  const fontParts = SPEC_FONT_ROLES
    .filter((role) => spec.fonts[role])
    .map((role) => `${fontRoleLabel(role)}用 ${fontLabelOf(spec.fonts[role])}`);
  if (fontParts.length > 0) {
    lines.push(
      `- 字体：${fontParts.join('；')}`,
      '  （写 CSS 时这几个角色一律用 `var(--font-*)` 变量，不要写字面字体名）',
    );
  }

  lines.push(
    `- 页眉品牌标识：${HEADER_KIND_LABEL[spec.header.kind]}`
      + (spec.header.kind === 'none'
        ? ''
        : `，尺寸 ${spec.header.sizePx}px、颜色 ${colorText(spec.header.color)}、${ALIGN_LABEL[spec.header.position]}`)
      + (spec.header.heightPx > 0 ? `；页眉高 ${spec.header.heightPx}px` : ''),
  );
  if (spec.header.kind !== 'none' && spec.header.textSizePx > 0) {
    lines.push(
      `- 页眉字（如「目录 / CONTENTS」）：${spec.header.textSizePx}px / 颜色 ${colorText(spec.header.textColor)}`
        + (spec.header.textTransform === 'uppercase' ? ' / **全大写**' : ''),
    );
  }

  lines.push(
    `- 页脚：高 ${spec.footer.heightPx}px`
      + (spec.footer.showPageNo
        ? `；页码${ALIGN_LABEL[spec.footer.pageNoPosition]}，写成「${PAGE_NO_FORMAT_LABEL[spec.footer.pageNoFormat]}」这个样式`
          + (spec.footer.pageNoSizePx > 0
            ? `（${spec.footer.pageNoSizePx}px / 颜色 ${colorText(spec.footer.pageNoColor)}）`
            : '')
        : '，不写页码'),
    `- 左右安全边距：${spec.marginPx}px`,
    `- 圆角：卡片 ${spec.radius.card}px、内层 ${spec.radius.inner}px`,
  );

  if (spec.decoration.length > 0) {
    lines.push(`- 整页只允许出现这些装饰：${spec.decoration.join('、')}`);
  }
  if (spec.effects.length > 0) {
    lines.push(
      '- 视觉效果：这套风格的辨识度就在这些效果上，**该用到的页必须做出来**，',
      '  不要图省事简化成纯色块（下面每一条都要在对应的元素上落实）：',
      ...spec.effects.map((e) => `  · ${EFFECT_LABEL[e.kind]}：${e.note}`),
    );
  }
  return lines.join('\n');
}

/**
 * 规范逐条拆成「名 / 值」，给界面上的「风格介绍」那一栏列。
 *
 * 与 `specBlock` 共用同一份措辞：界面上看到的和发给模型的必须是同一条，
 * 各写一套的话用户照着界面判断「统一了吗」，而模型看到的是另一套。
 */
export function specLines(spec: StyleSpec): { label: string; value: string }[] {
  const out = [
    { label: '页标题', value: `${spec.title.sizePx}px / 字重 ${spec.title.weight} / 颜色 ${colorText(spec.title.color)} / ${spec.title.align === 'center' ? '居中' : '左对齐'}` },
  ];
  if (spec.title.rule.position !== 'none') {
    out.push({
      label: '标题强调条',
      value: `${RULE_POSITION_LABEL[spec.title.rule.position]}，${spec.title.rule.widthPx}×${spec.title.rule.heightPx}px ${colorText(spec.title.rule.color)}`,
    });
  }
  out.push({ label: '副标题', value: `${spec.subtitle.sizePx}px / 字重 ${spec.subtitle.weight} / ${colorText(spec.subtitle.color)}` });
  out.push({ label: '正文', value: `${spec.body.sizePx}px / 字重 ${spec.body.weight} / ${colorText(spec.body.color)} / 行高 ${spec.body.lineHeight}` });
  out.push({ label: '数字', value: `${spec.numeric.sizePx}px / 字重 ${spec.numeric.weight} / ${colorText(spec.numeric.color)}` });

  const fontParts = SPEC_FONT_ROLES
    .filter((role) => spec.fonts[role])
    .map((role) => `${fontRoleLabel(role)}：${fontLabelOf(spec.fonts[role])}`);
  if (fontParts.length > 0) {
    out.push({ label: '字体', value: fontParts.join('；') });
  }

  if (spec.header.kind !== 'none') {
    out.push({
      label: '页眉品牌标识',
      value: `${HEADER_KIND_LABEL[spec.header.kind]}，${spec.header.sizePx}px ${colorText(spec.header.color)}，${ALIGN_LABEL[spec.header.position]}${spec.header.heightPx > 0 ? `，页眉高 ${spec.header.heightPx}px` : ''}`,
    });
  }
  if (spec.header.kind !== 'none' && spec.header.textSizePx > 0) {
    out.push({
      label: '页眉字',
      value: `${spec.header.textSizePx}px / ${colorText(spec.header.textColor)}${spec.header.textTransform === 'uppercase' ? ' / 全大写' : ''}`,
    });
  }

  out.push({
    label: '页脚',
    value: `高 ${spec.footer.heightPx}px`
      + (spec.footer.showPageNo
        ? `，页码${ALIGN_LABEL[spec.footer.pageNoPosition]}、写成「${PAGE_NO_FORMAT_LABEL[spec.footer.pageNoFormat]}」`
          + (spec.footer.pageNoSizePx > 0 ? `，${spec.footer.pageNoSizePx}px / ${colorText(spec.footer.pageNoColor)}` : '')
        : '，不写页码'),
  });
  out.push({ label: '安全边距', value: `左右各 ${spec.marginPx}px` });
  out.push({ label: '圆角', value: `卡片 ${spec.radius.card}px、内层 ${spec.radius.inner}px` });
  if (spec.decoration.length > 0) {
    out.push({ label: '允许的装饰', value: spec.decoration.join('、') });
  }
  if (spec.effects.length > 0) {
    out.push({
      label: '视觉效果',
      value: spec.effects.map((e) => `${EFFECT_LABEL[e.kind]}——${e.note}`).join('；'),
    });
  }
  return out;
}
