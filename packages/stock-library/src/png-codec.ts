/**
 * 落盘素材用的 PNG 编解码。**8 位 RGBA、非交错**——素材库就是这个格式，别的直接报错。
 *
 * ## 为什么不用 `@lumen/style-engine/png`
 *
 * 那个包的 `encodePng` 用的是 **stored（不压缩）deflate 块**，文件里写明了理由：
 * 那些图「只在内存里过一趟、不落盘，体积不敏感」。落盘素材正相反——实测同一张
 * 1024×1024 的抠图，那边编出 4097 KB，这边 1069 KB，差四倍。仓库里躺 12 张就是
 * 12 MB 与 3 MB 的差别。
 *
 * 所以两边各留一个是对的，**但只有这一个能用来写 assets/**。
 *
 * ## 为什么自己写而不引库
 *
 * 素材管线一共就两种操作（归一化取景、缩放），为它引一个原生依赖（sharp 之类）
 * 不划算。这里的解码要认全五种 PNG 滤波（供应商的图会用），编码只写 filter None
 * ——编码是我们自己发起的，没有兼容性要求。
 */
import { inflateSync, deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export interface RgbaImage {
  width: number;
  height: number;
  data: Buffer;
}

/** PNG 的 Paeth 预测器（RFC 2083 §6.6）。解码与编码都要用它 */
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** 解码成 RGBA 字节。只认 8 位 RGBA、非交错——素材就是这个格式，别的直接报错 */
export function decodePng(buf: Buffer): RgbaImage {
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const bitDepth = buf[24];
  const colorType = buf[25];
  const interlace = buf[28];
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`只认 8 位 RGBA 非交错 PNG，这张是 bd=${bitDepth} ct=${colorType} il=${interlace}`);
  }
  const idat: Buffer[] = [];
  let o = 8;
  while (o < buf.length) {
    const len = buf.readUInt32BE(o);
    const type = buf.toString('ascii', o + 4, o + 8);
    if (type === 'IDAT') idat.push(buf.subarray(o + 8, o + 8 + len));
    o += 12 + len;
    if (type === 'IEND') break;
  }
  const raw = inflateSync(Buffer.concat(idat));

  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const src = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp]! : 0;
      const b = prev ? prev[i]! : 0;
      const c = prev && i >= bpp ? prev[i - bpp]! : 0;
      let v = src[i]!;
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) v += paeth(a, b, c);
      cur[i] = v & 0xff;
    }
  }
  return { width, height, data: out };
}

/**
 * 编回 PNG。逐行用 **Paeth 滤波**（类型 4），`deflate` 给 9 级。
 *
 * 这两项加起来不是微调：同一张 1024×1024 的抠图，filter None + level 9 编出 1209 KB，
 * Paeth 是 753 KB（省 38%）。这些图是要提交进仓库的，值得。
 *
 * **不用「逐行自适应」**（五种滤波各试一遍取绝对值和最小的）：实测结果与全 Paeth
 * 一模一样，却要多花一倍时间——照片类内容上 Paeth 几乎总是赢。
 *
 * 预测器读的是**原始像素**（`data` 本身就是重建后的字节），不是编码中间态。
 */
export function encodePng({ width, height, data }: RgbaImage): Buffer {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const o = y * (stride + 1);
    raw[o] = 4; // filter Paeth
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? data[y * stride + i - 4]! : 0;
      const b = y > 0 ? data[(y - 1) * stride + i]! : 0;
      const c = y > 0 && i >= 4 ? data[(y - 1) * stride + i - 4]! : 0;
      raw[o + 1 + i] = (data[y * stride + i]! - paeth(a, b, c)) & 0xff;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
