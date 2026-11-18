/**
 * 生成一批**物件**透明素材（大厦、动车、飞机、机器人…），落进 `assets/`。
 *
 * ## 两步，不是一个模型调用
 *
 * 1. 图片模型出一张**纯色底的物件图**（主体完整、居中、背景干净）
 * 2. koukoutu 抠成透明底
 *
 * **为什么不直接让模型出透明底**：现在配的图片模型（`gpt-image-2.5-sunburst`）
 * 会静默忽略 `background` 参数、把「透明」画成棋盘格——实测过。会出真 alpha 的
 * 官方变体已经不在供应商的模型列表里了。
 *
 * ## 跑法（仓库根目录）
 *
 * ```
 * node --import tsx scripts/generate-objects.ts
 * node --import tsx scripts/generate-objects.ts --only 大厦,飞机
 * ```
 *
 * 前置：管理后台「全局设置 → 抠图服务」里填好 koukoutu 的 API Key。
 *
 * **产物要人工过一遍再提交**：抠得干不干净、主体有没有缺角，眼睛看得出来而脚本看不出来。
 * 跑完记得 `pnpm stock:add` 把新图收进清单，再补上 author / source / license。
 *
 * **放仓库根而不是 `packages/stock-library/scripts/`**：这个脚本要 import
 * server-core 的东西，而 stock-library 并不依赖它（反过来 server-core 依赖
 * stock-library），加依赖会成环。根目录的 `scripts/` 两边都够得着。
 *
 * **import 走相对路径而不是 `@lumen/server-core`**：根 package.json 里没有这些
 * 工作区包，裸包名解析不到（`ERR_MODULE_NOT_FOUND`）。根目录下所有脚本都是这么写的，
 * 见 `seed.mjs` / `providers.mjs`。
 */
import { writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cutoutImage } from '../packages/server-core/src/services/cutout.service.ts';
import { billedGateway } from '../packages/server-core/src/services/billed-gateway.ts';
import { get } from '../packages/server-core/src/db/client.ts';
import { decodePng, encodePng } from '../packages/stock-library/src/png-codec.ts';
import { fitLongSide } from './lib/fit-long-side.ts';

const ASSETS = path.resolve(fileURLToPath(new URL('../packages/stock-library/assets', import.meta.url)));

/**
 * 落盘前的长边上限。
 *
 * koukoutu 回的是 **2048×2048**，一张 1.6–2.9 MB。12 张就是 ~25 MB——而素材库现有的
 * 12 MB 里，59 张人物抠图每张才 80 KB。2048 是用不上的：导出是 1920×1080 @1x
 * （`export-pptx.tsx` 的 `deviceScaleFactor: 1`），物件当装饰件顶多占大半画布。
 *
 * 实测：原图 2048×2048 是 2920 KB，缩到 1024 重编后 960 KB 上下（`object-tower.png`）。
 * 1024 的长边留了一倍余量。
 */
const MAX_LONG_SIDE = 1024;

/**
 * 把长边缩到 `max` 以内，短边按比例走。实现在 `./lib/fit-long-side.ts`，
 * 与人物那条链路共用——两份实现漂了的话，一边干净一边有黑边，
 * 而这种事在缩略图上根本看不出来。
 */

/**
 * 要生成的物件。
 *
 * 提示词里那几句约束不是可选的：
 * - **纯白背景、不投射阴影**：抠底靠的是「背景颜色一致」，背景上有渐变或投影就抠不干净
 * - **主体完整入画、不贴边**：贴边的主体抠出来会被切掉一角
 * - **不要文字与 logo**：`lintMockHtml` 之外，图里带字放进版面上会很脏
 */
const OBJECTS: { slug: string; name: string; prompt: string }[] = [
  { slug: 'tower', name: '大厦', prompt: '一栋现代高层办公大楼，正面略侧视，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'bullet-train', name: '动车', prompt: '一列中国高铁动车组的车头，四分之三侧视，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'airplane', name: '飞机', prompt: '一架民航客机，四分之三侧视、起落架收起，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'robot', name: '机器人', prompt: '一个白色人形机器人，正面站立，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'rocket', name: '火箭', prompt: '一枚白色运载火箭竖立，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'satellite', name: '卫星', prompt: '一颗带太阳能帆板的卫星，四分之三侧视，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'drone', name: '无人机', prompt: '一台四轴航拍无人机，四分之三俯视，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'bridge', name: '大桥', prompt: '一座斜拉桥的完整结构侧视图，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'lighthouse', name: '灯塔', prompt: '一座白色灯塔，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'container', name: '集装箱', prompt: '一只红色货运集装箱，四分之三侧视，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'gears', name: '齿轮', prompt: '一组咬合的金属齿轮，正面视角，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'bulb', name: '灯泡', prompt: '一只发光的白炽灯泡，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },

  /* ---- 第二批：自然、动物、卡通与小物件 ----
   * 前 12 个偏「基建/科技」，作装饰件时风格单一。这批补的是柔和、生活化、
   * 有人味的元素，让封面、章节页、结尾页有别的可选。 */
  { slug: 'dry-leaf', name: '枯树叶', prompt: '一片秋天的枯黄落叶，叶脉清晰，斜放，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'maple-leaf', name: '枫叶', prompt: '一片红色枫叶，平铺展开，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'leaf', name: '绿叶', prompt: '一片鲜嫩的绿色阔叶，叶脉清晰，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'dandelion', name: '蒲公英', prompt: '一株完整的蒲公英绒球，茎叶齐全，竖起，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'branch', name: '树枝', prompt: '一根带几片叶子的细树枝，横放，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },

  { slug: 'butterfly', name: '蝴蝶', prompt: '一只色彩鲜艳的蝴蝶，双翅完全展开、呈飞翔姿态俯视，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'hummingbird', name: '蜂鸟', prompt: '一只悬停飞行中的蜂鸟，侧视，翅膀展开，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'birds', name: '飞鸟群', prompt: '三到五只小飞鸟，呈人字形飞行队形，侧上方视角，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'goldfish', name: '金鱼', prompt: '一条橙红色金鱼，侧视、尾鳍舒展游动姿态，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },

  { slug: 'mascot', name: '卡通吉祥物', prompt: '一个原创的卡通吉祥物角色，圆润可爱、双臂张开、正面站立微笑，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；3D 渲染风格，色彩明亮干净' },
  { slug: 'cartoon-figure', name: '卡通人物', prompt: '一个扁平插画风格的卡通人物，正面站立、一只手指向前方，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；简洁矢量插画风格，色块干净' },
  { slug: 'character-3d', name: '3D 小人', prompt: '一个 3D 渲染的简约小人偶，举起一只手打招呼，正面站立，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；柔和的 3D 渲染风格，材质干净' },

  { slug: 'coffee-cup', name: '咖啡杯', prompt: '一只白色陶瓷咖啡杯连杯碟，四分之三侧视，杯口有热气，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'book', name: '书本', prompt: '一本摊开的精装书，四分之三俯视，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'magnifier', name: '放大镜', prompt: '一把金属框放大镜，手柄朝下斜放，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'key', name: '钥匙', prompt: '一把复古铜钥匙，斜放，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'trophy', name: '奖杯', prompt: '一座金色奖杯，正面略侧视，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'paper-plane', name: '纸飞机', prompt: '一架白色折纸飞机，斜向上呈飞行姿态，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'clock', name: '时钟', prompt: '一只圆形挂钟，正面视角，指针清晰，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'globe', name: '地球仪', prompt: '一个带金属支架的地球仪，四分之三侧视，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },

  /* ---- 第三批：仰视建筑、机器人、几何体 ----
   * 前两批的楼都是平视，放在封面和章节页上气势不够；这批补仰视角度，
   * 再加一批几何体与科技符号，给「未来感 / 增长 / 结构」这类主题用。 */
  { slug: 'skyscraper-low-angle', name: '仰视摩天楼', prompt: '从地面向上仰拍的一栋摩天大楼，强烈的透视汇聚感，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'tower-glass', name: '玻璃写字楼', prompt: '一栋玻璃幕墙写字楼，低角度仰拍，玻璃反射天空，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'building-night', name: '夜景高楼', prompt: '一栋单体的摩天大楼，仰视角度，楼体窗灯亮起，四周留出大片空白、主体只占画面中部，完整入画、居中；纯白背景，不投射阴影；无文字无 logo；写实摄影风格' },
  { slug: 'skyscraper-fog', name: '云雾高楼', prompt: '一栋穿过云层的超高层建筑，仰视，顶部隐入云中，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },

  { slug: 'robot-cute', name: '可爱机器人', prompt: '一个圆润可爱的白色小机器人，正面站立、双手举起，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；3D 渲染风格，干净明亮' },
  { slug: 'robot-arm', name: '机械臂', prompt: '一台工业机械臂，四分之三侧视、关节清晰，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'robot-dog', name: '机器狗', prompt: '一只四足机器狗，侧面站立，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },

  { slug: 'cube', name: '发光立方体', prompt: '一个半透明的发光立方体，边缘透出蓝色光线，四分之三俯视，完整入画、居中、四周留白；深色背景也能看清；不投射阴影；无文字无 logo；3D 渲染风格' },
  { slug: 'cube-stack', name: '堆叠立方体', prompt: '一组堆叠成阶梯状的立方体，由低到高排列，四分之三俯视，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；3D 渲染风格，材质干净' },
  { slug: 'cube-wireframe', name: '线框立方体', prompt: '一个发光的线框立方体，结构线条清晰，四分之三俯视，完整入画、居中、四周留白；深色背景也能看清；不投射阴影；无文字无 logo；3D 渲染风格' },

  { slug: 'sphere', name: '金属球体', prompt: '一个光滑的金属球体，表面反射柔光，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；3D 渲染风格，材质干净' },
  { slug: 'torus', name: '环形几何体', prompt: '一个光滑的圆环形立体几何体，四分之三俯视，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；3D 渲染风格，材质干净' },
  { slug: 'pyramid', name: '金字塔', prompt: '一座阶梯状的金字塔，四分之三侧视，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；3D 渲染风格，材质干净' },
  { slug: 'helix', name: '螺旋结构', prompt: '一条向上的双螺旋结构，线条流畅，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；3D 渲染风格，材质干净' },

  { slug: 'chip', name: '芯片', prompt: '一枚方形的芯片，引脚清晰，俯视略带角度，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'network', name: '网络节点', prompt: '一个球形的网络节点结构，由发光节点与连线组成，完整入画、居中、四周留白；深色背景也能看清；不投射阴影；无文字无 logo；3D 渲染风格' },
  { slug: 'dna', name: 'DNA 双螺旋', prompt: '一段 DNA 双螺旋结构，螺旋清晰，竖直，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；3D 渲染风格，材质干净' },

  { slug: 'telescope', name: '望远镜', prompt: '一架细长的光学望远镜，斜向上指向天空，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'compass', name: '指南针', prompt: '一只复古黄铜指南针，正面略俯视，指针清晰，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
  { slug: 'hourglass', name: '沙漏', prompt: '一只木质框架玻璃沙漏，沙子正在下落，完整入画、居中、四周留白；纯白背景，不投射阴影；无文字无 logo；写实摄影风格，光线均匀' },
];

const only = (() => {
  const i = process.argv.indexOf('--only');
  if (i < 0) return null;
  return new Set((process.argv[i + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean));
})();

const targets = only ? OBJECTS.filter((o) => only.has(o.name)) : OBJECTS;
if (targets.length === 0) {
  console.error('--only 没匹配到任何物件。可选的：', OBJECTS.map((o) => o.name).join('、'));
  process.exit(1);
}

/** 图片任务走谁的名下：取库里的管理员。生成要计费，得有个真实租户 */
const admin = get<{ userId: string; tenantId: string }>(
  "SELECT userId, tenantId FROM users WHERE role = 'admin' ORDER BY createdAt ASC LIMIT 1",
);
if (!admin) throw new Error('库里没有管理员账号，先跑 pnpm seed');

const gateway = billedGateway(admin.tenantId, admin.userId);

let ok = 0;
let failed = 0;

for (const obj of targets) {
  const out = path.join(ASSETS, `object-${obj.slug}.png`);
  if (existsSync(out)) {
    console.log(`跳过「${obj.name}」：${path.basename(out)} 已经在了（要重做先删掉它）`);
    continue;
  }

  process.stdout.write(`「${obj.name}」生成中…`);
  try {
    // 1:1 加纯色底：物件是竖是横都不至于被裁
    const gen = await gateway.image({
      taskType: 'image',
      prompt: obj.prompt,
      size: '1536x1024',
      ratio: '1:1',
      quality: 'high',
      n: 1,
    });
    const first = gen.images[0];
    if (!first) throw new Error('图片模型没有返回任何图片');

    process.stdout.write(' 抠底中…');
    const cut = await cutoutImage({
      buffer: first.buffer,
      mime: first.mime,
      filename: `object-${obj.slug}.png`,
    });

    const shrunk = fitLongSide(decodePng(cut.buffer), MAX_LONG_SIDE);
    const png = encodePng(shrunk);
    writeFileSync(out, png);
    ok += 1;
    console.log(` 好了 → ${path.basename(out)}（${shrunk.width}×${shrunk.height}，${(png.length / 1024).toFixed(0)} KB）`);
  } catch (e) {
    failed += 1;
    console.log(` 失败：${e instanceof Error ? e.message : String(e)}`);
  }
}

console.log(`\n成功 ${ok}，失败 ${failed}。`);
if (ok > 0) {
  console.log([
    '',
    '接下来：',
    '  1. 打开 assets/ 目视过一遍——抠得干不干净、主体有没有缺角，脚本看不出来',
    '  2. pnpm stock:add          把新图收进清单（自动算色板与明暗）',
    '  3. 给新条目补上 author / source / license，并把 kind 改成 object',
  ].join('\n'));
}
process.exit(failed > 0 ? 1 : 0);
