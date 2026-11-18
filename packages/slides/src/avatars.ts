import { DEFAULT_AVATAR_IMAGE } from './avatar-default-image.js';

/**
 * 内置数字人形象（PRD §5.13）。
 *
 * 第一个是**真人肖像**，也是默认形象——数字人是「讲解员」，默认给一张看得见的人脸，
 * 比一个轮廓更直接。另外两个仍是剪影：剪影当初是为了避开口型——口型驱动还没做，
 * 画了嘴却不动反而露怯，而剪影在投影和大屏上也干净。两者都留着，按调性挑。
 */

export interface AvatarPreset {
  id: string;
  name: string;
  /** 一句话说明，用在选择器里 */
  description: string;
  /**
   * 位图形象。给了就用它，没有才按下面三个颜色画剪影。
   *
   * 是 data URL 而不是静态文件路径——理由见 `avatar-default-image.ts`：
   * 导出在 worker 端渲染，那边没有 web 的静态目录，外部 URL 会变成破图。
   */
  imageSrc?: string;
  /** 底色与主体色，跟随形象而非风格包——换风格不该换掉讲解员的长相 */
  background: string;
  silhouette: string;
  accent: string;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  {
    id: 'preset-business-01',
    name: '商务男性',
    description: '白衬衫形象，适合对外宣讲与客户沟通',
    imageSrc: DEFAULT_AVATAR_IMAGE,
    background: '#E9EBEF',
    silhouette: '#3C4552',
    accent: '#6D4AFF',
  },
  {
    id: 'preset-friendly-01',
    name: '亲和女性',
    description: '柔和轮廓，适合培训与客户沟通',
    background: '#F3EBE6',
    silhouette: '#7A5B4C',
    accent: '#FF7A1A',
  },
  {
    id: 'preset-minimal-01',
    name: '简约男性',
    description: '利落轮廓，适合技术方案与架构评审',
    background: '#E6EDF0',
    silhouette: '#3A4A55',
    accent: '#14B8A6',
  },
];

export const DEFAULT_AVATAR_PRESET_ID = AVATAR_PRESETS[0]!.id;

export function findAvatarPreset(modelId: string): AvatarPreset | undefined {
  return AVATAR_PRESETS.find((p) => p.id === modelId);
}

/**
 * 把形象渲染成独立 SVG 字符串。**只对剪影形象有效**，位图形象走 `imageSrc`。
 * 输出自带 viewBox，圆形裁切交给外层容器，这里只画方图。
 */
export function avatarPresetSvg(preset: AvatarPreset): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" role="img">
<rect width="200" height="200" fill="${preset.background}"/>
<circle cx="100" cy="74" r="30" fill="${preset.silhouette}"/>
<path d="M34 190c0-36 30-64 66-64s66 28 66 64z" fill="${preset.silhouette}"/>
<path d="M100 118c14 0 26 4 36 11-8 12-21 19-36 19s-28-7-36-19c10-7 22-11 36-11z" fill="${preset.accent}" fill-opacity="0.22"/>
</svg>`;
}

/**
 * 取某个形象可直接放进 `<img src>` 的地址：有 `imageSrc` 用它，否则现画剪影。
 * 找不到形象就退回第一个预设，不抛错也不留空白。
 */
export function avatarSrcFor(modelId: string): string {
  const preset = findAvatarPreset(modelId) ?? AVATAR_PRESETS[0]!;
  return preset.imageSrc ?? `data:image/svg+xml;utf8,${encodeURIComponent(avatarPresetSvg(preset))}`;
}
