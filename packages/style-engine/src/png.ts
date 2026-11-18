import { inflateSync } from 'node:zlib';

/**
 * 极简 PNG 解码器。
 *
 * 只支持 8 位色深的非隔行 PNG（color type 0/2/3/4/6）。这覆盖了从网页与设计稿截取图片的绝大多数情况，
 * 且不引入任何第三方依赖。不支持的格式抛出明确错误，由调用方决定是否改用其他方式。
 */

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA，长度 = width * height * 4 */
  data: Uint8Array;
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function isPng(buf: Uint8Array): boolean {
  if (buf.length < 8) return false;
  return PNG_SIGNATURE.every((b, i) => buf[i] === b);
}

/** 从 data URL 或裸 base64 解析出字节 */
export function bytesFromDataUrl(input: string): Uint8Array {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(input);
  if (!m) return new Uint8Array(Buffer.from(input, 'base64'));
  const isBase64 = m[2] === ';base64';
  const payload = m[3] ?? '';
  return isBase64
    ? new Uint8Array(Buffer.from(payload, 'base64'))
    : new Uint8Array(Buffer.from(decodeURIComponent(payload), 'utf8'));
}

export function decodePng(buf: Uint8Array): DecodedImage {
  if (!isPng(buf)) throw new Error('PNG_DECODE_FAILED: 不是合法的 PNG 数据');

  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  const idat: Uint8Array[] = [];

  while (offset + 8 <= buf.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(buf[offset + 4]!, buf[offset + 5]!, buf[offset + 6]!, buf[offset + 7]!);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > buf.length) break;

    if (type === 'IHDR') {
      width = view.getUint32(dataStart);
      height = view.getUint32(dataStart + 4);
      bitDepth = buf[dataStart + 8]!;
      colorType = buf[dataStart + 9]!;
      interlace = buf[dataStart + 12]!;
    } else if (type === 'PLTE') {
      palette = buf.subarray(dataStart, dataEnd);
    } else if (type === 'IDAT') {
      idat.push(buf.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4; // 跳过 CRC
  }

  if (width === 0 || height === 0) throw new Error('PNG_DECODE_FAILED: 缺少 IHDR');
  if (bitDepth !== 8) throw new Error(`PNG_DECODE_FAILED: 仅支持 8 位色深，实际 ${bitDepth} 位`);
  if (interlace !== 0) throw new Error('PNG_DECODE_FAILED: 不支持隔行 PNG');

  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 3 ? 1 : colorType === 4 ? 2 : 4;
  const raw = new Uint8Array(inflateSync(Buffer.concat(idat.map((c) => Buffer.from(c)))));

  const stride = width * channels;
  const out = new Uint8Array(width * height * 4);
  const prev = new Uint8Array(stride);
  const cur = new Uint8Array(stride);

  let pos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]!;
    cur.set(raw.subarray(pos, pos + stride));
    pos += stride;

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels]! : 0;
      const b = prev[x]!;
      const c = x >= channels ? prev[x - channels]! : 0;
      let value = cur[x]!;
      if (filter === 1) value = (value + a) & 0xff;
      else if (filter === 2) value = (value + b) & 0xff;
      else if (filter === 3) value = (value + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) value = (value + paeth(a, b, c)) & 0xff;
      cur[x] = value;
    }

    for (let x = 0; x < width; x++) {
      const si = x * channels;
      const di = (y * width + x) * 4;
      if (colorType === 3 && palette) {
        const idx = cur[si]! * 3;
        out[di] = palette[idx] ?? 0;
        out[di + 1] = palette[idx + 1] ?? 0;
        out[di + 2] = palette[idx + 2] ?? 0;
        out[di + 3] = 255;
      } else if (colorType === 0) {
        out[di] = out[di + 1] = out[di + 2] = cur[si]!;
        out[di + 3] = 255;
      } else if (colorType === 4) {
        out[di] = out[di + 1] = out[di + 2] = cur[si]!;
        out[di + 3] = cur[si + 1]!;
      } else {
        out[di] = cur[si]!;
        out[di + 1] = cur[si + 1]!;
        out[di + 2] = cur[si + 2]!;
        out[di + 3] = channels === 4 ? cur[si + 3]! : 255;
      }
    }
    prev.set(cur);
  }

  return { width, height, data: out };
}

export function decodeImage(input: string): DecodedImage {
  return decodePng(bytesFromDataUrl(input));
}

/* ---------------- 编码 ---------------- */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = (CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}

/** 写一个 PNG chunk：长度(4) + 类型(4) + 数据 + CRC(4) */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * 编码成 8 位 RGBA 的 PNG。
 *
 * 用途是把裁剪出来的一页交给看图模型——Provider 收的是 data URL，
 * 所以必须能编回 PNG。用 **stored（不压缩）deflate 块**而不是引 zlib：
 * 这个文件已经被 `server.ts` 标为服务端专用，但保持它零依赖更省心，
 * 而且这些图只在内存里过一趟、不落盘，体积不敏感。
 */
export function encodePng(img: DecodedImage): Uint8Array {
  const { width, height, data } = img;
  const stride = width * 4;

  // 每行前面加一个滤波字节 0（None），这是 PNG 的规定
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    raw.set(data.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  const ihdr = new Uint8Array(13);
  const hv = new DataView(ihdr.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  ihdr[8] = 8; // 位深
  ihdr[9] = 6; // 色彩类型：RGBA
  // 10/11/12 保持 0：压缩方式 deflate、滤波方式自适应、非隔行

  const parts = [PNG_SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', storedDeflate(raw)), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** zlib 流 + 一串 stored 块。每块最多 65535 字节，格式见 RFC 1951 §3.2.4 */
function storedDeflate(input: Uint8Array): Uint8Array {
  const MAX = 65535;
  const blocks = Math.max(1, Math.ceil(input.length / MAX));
  const out = new Uint8Array(2 + blocks * 5 + input.length + 4);
  let o = 0;
  out[o++] = 0x78; // zlib 头：deflate、32K 窗口
  out[o++] = 0x01;
  for (let b = 0; b < blocks; b += 1) {
    const start = b * MAX;
    const len = Math.min(MAX, input.length - start);
    out[o++] = b === blocks - 1 ? 1 : 0; // BFINAL + BTYPE=00（stored）
    out[o++] = len & 0xff;
    out[o++] = (len >>> 8) & 0xff;
    out[o++] = ~len & 0xff;
    out[o++] = (~len >>> 8) & 0xff;
    out.set(input.subarray(start, start + len), o);
    o += len;
  }
  // Adler-32 校验
  let a = 1;
  let b = 0;
  for (let i = 0; i < input.length; i += 1) {
    a = (a + input[i]!) % 65521;
    b = (b + a) % 65521;
  }
  const adler = ((b << 16) | a) >>> 0;
  out[o++] = (adler >>> 24) & 0xff;
  out[o++] = (adler >>> 16) & 0xff;
  out[o++] = (adler >>> 8) & 0xff;
  out[o++] = adler & 0xff;
  return out.subarray(0, o);
}

/** 编成 data URL，直接交给 Provider */
export function toDataUrl(img: DecodedImage): string {
  return `data:image/png;base64,${Buffer.from(encodePng(img)).toString('base64')}`;
}

/**
 * 这张 PNG 有没有 alpha 通道。**只看开头 26 个字节，不解码**：色彩类型在从 0 数起的
 * 第 25 个字节（8 字节签名 + 4 字节块长 + 4 字节 `IHDR` + 4 字节宽 + 4 字节高 + 1 字节位深）。
 *
 * 存在的理由是「**要了透明底却没拿到**」这件事必须当场报出来。实测踩过两次：
 * 图片模型会静默忽略 `background` 参数、返回一张没有 alpha 的图；抠图服务要是哪天
 * 回一张 RGB，也一样。用户拿到一张不透明的图却看到「已抠图」，比报错更糟。
 */
export function pngHasAlpha(buf: Buffer): boolean {
  if (buf.length < 26 || !isPng(buf)) return false;
  if (buf.toString('latin1', 12, 16) !== 'IHDR') return false;
  const colorType = buf[25]!;
  // 0（灰度）与 2（RGB）一定没有 alpha；4 / 6 有；3（调色板）可能靠 tRNS 带透明，当它有
  return colorType !== 0 && colorType !== 2;
}
