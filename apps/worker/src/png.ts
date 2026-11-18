import { deflateSync } from 'node:zlib';

/**
 * 极简 PNG 编码器（只写不读）。
 *
 * 用途：图片生成失败时的占位图。仓库规定不新增图像依赖，也不复用
 * provider-gateway 里 MockClient 的私有实现，所以这里手写 chunk 与 CRC，
 * 只借用 node:zlib 做 DEFLATE。
 */

/** PNG 文件签名（固定 8 字节） */
export const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) {
    const idx = (c ^ (buf[i] ?? 0)) & 0xff;
    c = ((CRC_TABLE[idx] ?? 0) ^ (c >>> 8)) >>> 0;
  }
  return (c ^ 0xffffffff) >>> 0;
}

/** 写一个 PNG chunk：长度(4) + 类型(4) + 数据 + CRC(4)，全部大端序 */
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/** RGB 三元组 */
export type Rgb = readonly [number, number, number];

export interface PlaceholderPngOptions {
  /** 背景色，默认品牌淡紫 */
  bg?: Rgb;
  /** 主几何色，默认品牌紫 */
  fg?: Rgb;
  /** 次几何色，默认品牌橙 */
  accent?: Rgb;
}

/**
 * 生成一张「纯色 + 简单几何」的占位 PNG。
 *
 * 画面只有底色、一条横贯色带与一个中心圆点，绝不含文字、Logo 或可识别内容，
 * 符合图片块「不得出现文字与真人」的约束。
 */
export function encodePlaceholderPng(
  width: number,
  height: number,
  options: PlaceholderPngOptions = {},
): Buffer {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const bg = options.bg ?? [0xef, 0xea, 0xfe];
  const fg = options.fg ?? [0x6d, 0x4a, 0xff];
  const accent = options.accent ?? [0xff, 0x7a, 0x1a];

  const stride = w * 3;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y += 1) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // 过滤方法 None
    const ny = h > 1 ? y / (h - 1) : 0;
    for (let x = 0; x < w; x += 1) {
      const nx = w > 1 ? x / (w - 1) : 0;
      let r: number = bg[0];
      let g: number = bg[1];
      let b: number = bg[2];
      // 中段一条横贯色带
      if (ny >= 0.42 && ny <= 0.58 && nx >= 0.12 && nx <= 0.88) {
        r = fg[0];
        g = fg[1];
        b = fg[2];
      }
      // 中心一个圆点，用强调色
      const dx = nx - 0.5;
      const dy = ny - 0.5;
      if (Math.hypot(dx, dy) <= 0.16) {
        r = accent[0];
        g = accent[1];
        b = accent[2];
      }
      const o = rowStart + 1 + x * 3;
      raw[o] = clampByte(r);
      raw[o + 1] = clampByte(g);
      raw[o + 2] = clampByte(b);
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // 位深
  ihdr[9] = 2; // 颜色类型：真彩 RGB
  ihdr[10] = 0; // 压缩方法
  ihdr[11] = 0; // 过滤方法
  ihdr[12] = 0; // 逐行扫描

  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}
