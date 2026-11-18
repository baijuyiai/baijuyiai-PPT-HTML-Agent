import type { MeasuredPage, StylePack } from '@lumen/ir-schema';
import type { DecodedImage } from './png.js';
import { cropForMeasure, upscaleTo, MEASURE_WIDTH } from './image-ops.js';
import {
  classifyPageType, structureFromImage, structuresFromImage, type CropBox, type PageStructure,
} from './structure.js';
import { measureGrid, placeOnGrid } from './grid.js';
import { deriveMeasuredLayout, type MeasuredLayout } from './measured-layout.js';

/**
 * 从设计稿量出每一页的版式。
 *
 * 单独抽出来是因为它有**两个入口**：像素自己切分（没接看图模型时），
 * 以及用看图模型给的裁切框切分（接了模型时）。两条路后面的量测必须完全一样，
 * 否则「界面预览用的框」与「版式用的框」会对不上——同一页被切了两遍，
 * 一遍给预览看、一遍给测量用，差一点点就够让样机与原图错位。
 */

export interface MeasureResult {
  /** 量到的每一页，含裁切框与落到网格上的横带 */
  measuredPages: MeasuredPage[];
  /** 容量画像与每页类型的几何 */
  measured: MeasuredLayout;
  /** 界面要如实说明「这张图里检出了几张」 */
  splitNote: string;
}

/**
 * @param images 已解码的原图
 * @param boxes  每张图里各页的归一化框。**不传就自己切分**；传了则用它，
 *               空数组表示这张图没检出多页、按整页处理
 */
export function measurePages(
  images: DecodedImage[],
  basePack: StylePack,
  boxes?: CropBox[][],
): MeasureResult {
  const rawStructures: PageStructure[] = [];
  const perPage: { page: PageStructure; imageIndex: number; cropBox: CropBox }[] = [];
  let splitNote = '';

  images.forEach((img, imageIndex) => {
    try {
      // 两趟：先把结构收齐，再量网格，最后才谈得上把横带落到栏上。
      // 一趟做完是不行的——网格是从所有页的横带里量出来的，落栏又得先有网格
      const given = boxes?.[imageIndex];
      const pages: { page: PageStructure; box: CropBox }[] = given && given.length > 0
        ? given.map((box) => ({ page: structureFromImage(cropForMeasure(img, box)), box }))
        : (() => {
          const set = structuresFromImage(img);
          if (set.split) splitNote = set.note;
          return set.pages.map((page, k) => ({ page, box: set.boxes[k] ?? FULL }));
        })();

      for (const { page, box } of pages) {
        rawStructures.push(page);
        perPage.push({ page, imageIndex, cropBox: box });
      }
    } catch (err) {
      // 单张图解不开不该让整次识别失败，跳过它继续——但必须留下痕迹，
      // 否则「量不到结构」在界面上表现为「什么都没发生」，排查时无从下手
      console.warn('[measure] 第', imageIndex + 1, '张图的排版结构提取失败：',
        err instanceof Error ? err.message : String(err));
    }
  });

  const grid = measureGrid(rawStructures);
  const measuredPages: MeasuredPage[] = perPage.map(({ page, imageIndex, cropBox }) => ({
    pageType: classifyPageType(page),
    imageIndex,
    // 界面上要显示「这一页对应原图里的哪一块」，所以裁切框必须一路带出去
    cropBox: roundBox(cropBox),
    ok: page.ok,
    note: page.note,
    align: page.align,
    contentBox: page.contentBox,
    // 横带先落到网格上再出门：界面据此在客户端重排，不必回服务端。
    // 只留渲染与容量反推用得上的字段；墨密度、连通块那些中间量不出接口
    bands: page.bands.map((b) => ({
      role: b.role,
      topRatio: +b.topRatio.toFixed(4),
      heightRatio: +b.heightRatio.toFixed(4),
      leftRatio: +b.leftRatio.toFixed(4),
      widthRatio: +b.widthRatio.toFixed(4),
      columns: b.columns,
      align: b.align,
      ...placeOnGrid(b, grid, page.contentBox),
    })),
  }));

  return { measuredPages, measured: deriveMeasuredLayout(measuredPages, basePack, grid), splitNote };
}

const FULL: CropBox = { x0: 0, y0: 0, x1: 1, y1: 1 };

function roundBox(b: CropBox): CropBox {
  return {
    x0: +b.x0.toFixed(4), y0: +b.y0.toFixed(4),
    x1: +b.x1.toFixed(4), y1: +b.y1.toFixed(4),
  };
}

/** 整页量测（单页输入或没切出多页时用） */
export function measureWholeImage(img: DecodedImage, basePack: StylePack): MeasureResult {
  return measurePages([img], basePack, [[FULL]]);
}

export { upscaleTo, MEASURE_WIDTH };
