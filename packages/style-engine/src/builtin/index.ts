import { businessClassic } from './business-classic.js';
import { academicRigor } from './academic-rigor.js';
import { techMinimal } from './tech-minimal.js';
import { brandDesign } from './brand-design.js';
import { friendlyPremium } from './friendly-premium.js';
import { swissMinimal } from './swiss-minimal.js';
import { editorialMagazine } from './editorial-magazine.js';
import { academicReport } from './academic-report.js';
import { consultingReport } from './consulting-report.js';
import type { StylePack } from '@lumen/ir-schema';

/**
 * 内置九个风格族。前五个是 PRD §5.2 的族与人群映射，
 * 后四个是四套成熟的创作指令模板的视觉落地（见 ../directives.ts）。
 */
export const BUILTIN_STYLE_PACKS: StylePack[] = [
  businessClassic,
  academicRigor,
  techMinimal,
  brandDesign,
  friendlyPremium,
  swissMinimal,
  editorialMagazine,
  academicReport,
  consultingReport,
];

export {
  businessClassic, academicRigor, techMinimal, brandDesign, friendlyPremium,
  swissMinimal, editorialMagazine, academicReport, consultingReport,
};
export { buildPack, type FamilyProfile } from './shared.js';
