/**
 * 项目品牌：上传的 logo、它的矢量重绘稿、品牌名与标语。
 *
 * 放在 `ir-schema` 而不是 `server-core`，是因为**前端也要用**——`HtmlMock` 得把项目的品牌
 * 翻成装配参数，而 `server-core` 依赖 `node:sqlite`，前端引不动。
 * 所以这里的入参是结构化类型，不是 `ProjectRow`。
 */

/** 一个项目上跟品牌有关的五个字段。`ProjectRow` 满足它 */
export interface BrandFields {
  brandLogoImage: string;
  brandLogoSvg: string;
  brandLogoMode: string;
  brandName: string;
  brandTagline: string;
}

/**
 * 装配一份页面文档时用的品牌参数。
 *
 * `svg` 与 `imageSrc` 二选一：前者是重绘稿，后者是上传的原图。两个都给时 `svg` 优先。
 * 两个都没有、名字标语也都是空串时，调用方应当传 `undefined`——见 `brandOf`。
 */
export interface BrandSlot {
  svg?: string;
  imageSrc?: string;
  name: string;
  tagline: string;
}

/** 页眉槽位的属性名 */
export const BRAND_SLOT_ATTR = 'data-lumen-brand';

export const BRAND_SLOT_KINDS = ['logo', 'name', 'tagline'] as const;
export type BrandSlotKind = (typeof BRAND_SLOT_KINDS)[number];

/**
 * `brandLogoMode` 的三个取值。**这个集合只在这一处定义**——服务端写入、API 的请求 schema
 * （Task 5）、界面上的切换按钮（Task 8）都从这里取。各写一份的话，将来加第四态必然漏一处。
 *
 * 注意 `BrandFields.brandLogoMode` 声明为 `string` 而不是这个联合类型：它直接对应数据库里
 * 那一列，而库里的值是历史写入的，声明成联合类型是类型层面的谎话。
 * 与同表的 `depth` / `status` 是同一条规矩。
 */
export const BRAND_LOGO_MODES = ['', 'redraw', 'original'] as const;
export type BrandLogoMode = (typeof BRAND_LOGO_MODES)[number];

/**
 * 把项目行翻成装配参数。**永远返回一个 `BrandSlot`**，哪怕五列全空。
 *
 * 为什么**不能**在「什么都没填」时返回 `undefined`：调用方是
 * `if (opts.brand) body = fillBrandSlots(...)`，拿到 `undefined` 就**根本不会去动槽位**。
 * 于是「清空品牌」之后，那些在配着品牌时生成、片段里写着 `data-lumen-brand` 的页面，
 * 页眉上会留着 `class="brand-mark"` 这类**空壳元素**——模型的 CSS 只要给它写了尺寸或底色，
 * 用户看到的就是每页页眉多一个空方块，而不是「品牌没了」。实测过两种取值的行为：
 *
 * - `brand: undefined`            → 槽位属性与元素原样留着
 * - `brand: { name:'', tagline:'' }` → 槽位被整个移除（`slotValue` 全返回 `null`）
 *
 * 而「从没配过品牌」的项目**行为不变**：那些页面的片段里本来就没有槽位属性，
 * `fillBrandSlots` 对不含槽位的片段是逐字节原样返回。
 */
export function brandOf(project: BrandFields): BrandSlot {
  const logo =
    project.brandLogoMode === 'redraw' && project.brandLogoSvg
      ? { svg: project.brandLogoSvg }
      : project.brandLogoMode === 'original' && project.brandLogoImage
        ? { imageSrc: `/files/${project.brandLogoImage}` }
        : {};

  return { ...logo, name: project.brandName.trim(), tagline: project.brandTagline.trim() };
}

/**
 * 这个项目**到底有没有**品牌？
 *
 * 生成提示词靠它决定提不提槽位，而这件事**不能**用 `brandOf(...) !== undefined` 来判断——
 * 上面那个函数永远返回真值。也不能只看 `brandLogoMode`：只有品牌名、没有 logo 的项目
 * 同样该在页眉留出名字。
 *
 * 判据与渲染侧同一处：渲染侧要「永远拿到一个 `BrandSlot`」（这样清空品牌时能把空壳槽位
 * 整条删掉），生成侧要「有没有」这个布尔。两个问题，同一个来源。
 */
export function hasBrand(project: BrandFields): boolean {
  const b = brandOf(project);
  return Boolean(b.svg || b.imageSrc || b.name || b.tagline);
}
