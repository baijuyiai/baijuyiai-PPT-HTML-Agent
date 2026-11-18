/**
 * 把渲染产物整理成**可用的设备素材**：转动图拷进 `stock-library`，几何写进一份清单。
 *
 * ## 跑法
 *
 * ```
 * pnpm --filter @lumen/device-models exec tsx scripts/render.ts          # 先出图
 * pnpm --filter @lumen/device-models exec tsx scripts/prepare-devices.ts
 * ```
 *
 * ## 这个脚本**不生成版式骨架**
 *
 * 骨架由 `scripts/recognize-ui-layouts.ts` 从参考图识别出来（和图文 / 人物排版同一条路）。
 * 早先这里也顺手生成三份模板骨架，那是识别还没做时的占位；现在两份都写同一个文件，
 * 只会互相覆盖。所以这里只管素材。
 *
 * ## 清单里为什么要带包围盒
 *
 * 识别出来的骨架只知道「设备占页面上哪一块」，而渲染图是 900×1200、设备只占中间一块，
 * 四周全是透明的。塞进去的时候得按**设备实际占了多大**缩放，否则每台都会比框小一圈。
 * 包围盒在渲染那一步量、在这里原样带过来——它是像素级的，不该由这一侧猜。
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '.out');
const DEVICE_ASSETS = path.join(HERE, '..', '..', 'stock-library', 'assets', 'devices');
const MANIFEST = path.join(HERE, '..', 'assets', 'devices.json');

interface Shot {
  scene: string;
  pose: string;
  file: string;
  quad: { x: number; y: number }[] | null;
  quads: unknown;
  paper: unknown;
  screen: { w: number; h: number; r: number } | null;
  bounds: { x: number; y: number; w: number; h: number } | null;
}

const shots: Shot[] = JSON.parse(readFileSync(path.join(OUT, 'devices.json'), 'utf8'));
const boxes: Record<string, { x: number; y: number; w: number; h: number }> =
  JSON.parse(readFileSync(path.join(OUT, 'device-boxes.json'), 'utf8'));

/** 交付用的姿态：除了调模型用的 `side` 之外全要，顺序就是渲染顺序 */
const posesOf = (scene: string) => shots.filter((s) => s.scene === scene && s.pose !== 'side');

mkdirSync(DEVICE_ASSETS, { recursive: true });
mkdirSync(path.dirname(MANIFEST), { recursive: true });

const devices: Record<string, unknown> = {};
for (const scene of Object.keys(boxes)) {
  const rows = posesOf(scene);
  if (rows.length === 0) continue;
  const sprite = `${scene}-turn.webp`;
  copyFileSync(path.join(OUT, sprite), path.join(DEVICE_ASSETS, sprite));

  devices[scene] = {
    sprite: `/stock/devices/${sprite}`,
    box: boxes[scene],
    screen: rows[0]!.screen,
    /** 每个姿态的屏幕四角。首尾两帧就够——页面在它们之间按 `steps()` 走 */
    poses: rows.map((r) => ({ id: r.pose, quad: r.quad })),
  };
}

writeFileSync(MANIFEST, `${JSON.stringify({
  /** 渲染时用的画布尺寸。四角坐标都是这套坐标里的 */
  stage: { w: 900, h: 1200 },
  devices,
}, null, 2)}\n`, 'utf8');

/*
  **清掉上一轮留下的外壳图。** 场景改了名或删了（`macbook-desk` 那次），旧的转动图
  会留在 `assets/devices/` 里——它不再被任何骨架引用，但会一直躺在版本库里，
  以后谁也说不清它还有没有用。这里是唯一知道「这一轮该有哪些」的地方。
*/
const keep = new Set(Object.keys(devices).map((s) => `${s}-turn.webp`));
for (const f of readdirSync(DEVICE_ASSETS)) {
  if (f.endsWith('-turn.webp') && !keep.has(f)) {
    rmSync(path.join(DEVICE_ASSETS, f));
    console.log(`清掉过期的外壳图：${f}`);
  }
}

console.log(`外壳图 ${Object.keys(devices).length} 张 → ${path.relative(process.cwd(), DEVICE_ASSETS)}`);
console.log(`设备清单 → ${path.relative(process.cwd(), MANIFEST)}`);
