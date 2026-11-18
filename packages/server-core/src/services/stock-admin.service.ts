import { readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { STOCK_ASSETS_DIR } from '@lumen/stock-library/node';
import type { StockPhoto } from '@lumen/stock-library';

/**
 * 素材库的管理操作：进回收站、恢复、彻底删除。
 *
 * ## 为什么是改文件而不是改数据库
 *
 * 素材清单 `manifest.json` 与图片文件本来就是仓库里的东西，构建时被打进包里。
 * 用户要的语义是「这张图以后别再用了」，那删的就是源头——把清单与文件一起改掉，
 * 下次构建自然少了它。放进数据库反而会出现「清单说没有了、文件还在」两套真相。
 *
 * ## 回收站 = 清单里的 `deletedAt`
 *
 * 进回收站只打标记，**文件留着**：已经用在项目里的页面照常显示，只是配图池与图片库
 * 都把它排掉了。彻底删除才真删文件、从清单移除——那一步对已用到的页面不可逆，
 * 所以路由层要先问一句。
 *
 * ## 谁把它读进内存
 *
 * api 与 worker 启动时（以及每次改完之后）各自读一遍清单，交给
 * `setStockPhotos()`。浏览器端启动时从 `/stock/manifest.json` 拉一次即可——
 * 那份是静态托管的真实文件，天然反映刚做的修改。
 */

const MANIFEST = join(STOCK_ASSETS_DIR, 'manifest.json');

/**
 * 写回时的键序。与 `scripts/stock-add.mjs` 的 `KEY_ORDER` 一致——
 * 不按这个顺序写，每删一张整份清单的 diff 都会翻天。
 */
const KEY_ORDER = ['file', 'kind', 'author', 'source', 'license', 'tone', 'transparent', 'palette', 'tags'];

function orderedEntry(entry: StockPhoto): Record<string, unknown> {
  const src = entry as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of KEY_ORDER) if (src[k] !== undefined) out[k] = src[k];
  // 其余字段（比如 deletedAt）按字母序跟在后头
  for (const k of Object.keys(src).sort()) if (!(k in out)) out[k] = src[k];
  return out;
}

async function readManifest(): Promise<StockPhoto[]> {
  return JSON.parse(await readFile(MANIFEST, 'utf8')) as StockPhoto[];
}

async function writeManifest(list: StockPhoto[]): Promise<void> {
  await writeFile(MANIFEST, `${JSON.stringify(list.map(orderedEntry), null, 2)}\n`, 'utf8');
}

/**
 * 把「读—改—写」整段排成队。
 *
 * **不加这个，连删两张就会挂。** 两个请求同时进来，各自读到同一份清单、各自改、
 * 各自写——Windows 上并发写同一个文件直接 EBUSY，接口回 500，而界面上是
 * 「提示说删掉了、图还在」。串行化之后第二张排队等第一张写完再读，改的就是新那份。
 */
let writeChain: Promise<unknown> = Promise.resolve();

function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = writeChain.then(fn, fn);
  // 链条本身不能被某一次失败掐断，否则后面的操作全部跟着 reject
  writeChain = next.catch(() => undefined);
  return next;
}

/** 进回收站。已经在里面的重复调用不报错，方便界面上的幂等按钮 */
export function trashStockPhoto(file: string): Promise<StockPhoto> {
  return serialize(async () => {
    const list = await readManifest();
    const hit = list.find((p) => p.file === file);
    if (!hit) throw new Error('这张素材不在图库里');
    if (hit.deletedAt === undefined) {
      hit.deletedAt = Date.now();
      await writeManifest(list);
    }
    return hit;
  });
}

/** 从回收站恢复 */
export function restoreStockPhoto(file: string): Promise<StockPhoto> {
  return serialize(async () => {
    const list = await readManifest();
    const hit = list.find((p) => p.file === file);
    if (!hit) throw new Error('这张素材不在图库里');
    if (hit.deletedAt !== undefined) {
      delete hit.deletedAt;
      await writeManifest(list);
    }
    return hit;
  });
}

/**
 * 彻底删除：先删文件，再从清单移除。
 *
 * 顺序不能反——清单先删掉的话，文件删失败就变成「清单里没有、盘上还留着一份」，
 * 而没有任何入口能再找到它。文件本来就不在（被人手清过）也当作删成功。
 */
export function purgeStockPhoto(file: string): Promise<void> {
  return serialize(async () => {
    const list = await readManifest();
    const hit = list.find((p) => p.file === file);
    if (!hit) throw new Error('这张素材不在图库里');
    try {
      await unlink(join(STOCK_ASSETS_DIR, hit.file));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
    await writeManifest(list.filter((p) => p.file !== file));
  });
}

/**
 * 一次彻底删掉一批。
 *
 * **不是把 `purgeStockPhoto` 循环调一遍。** 那个函数每调一次就读一遍、写一遍整份清单，
 * 清空回收站时删五十张就是五十次全量重写——慢，而且每次都是一次整文件替换，
 * Windows 上最容易在这里抖。
 *
 * 读一次、删一批、写一次。语义与单张那条逐条对齐：文件本来就不在（被人手清过）
 * 也算删成功；清单里根本没有的名字单独回出来，让界面能如实说「有几张没找到」。
 */
export function purgeStockPhotos(files: string[]): Promise<{ purged: string[]; missing: string[] }> {
  return serialize(async () => {
    const list = await readManifest();
    const wanted = new Set(files);
    const hit = list.filter((p) => wanted.has(p.file));

    for (const p of hit) {
      try {
        await unlink(join(STOCK_ASSETS_DIR, p.file));
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      }
    }

    const purged = new Set(hit.map((p) => p.file));
    // 一张都没命中就别写盘：白写一次会让清单的 mtime 变动，白白触发下游重读
    if (hit.length > 0) await writeManifest(list.filter((p) => !purged.has(p.file)));
    return { purged: [...purged], missing: files.filter((f) => !purged.has(f)) };
  });
}

/** 当前完整清单（含回收站里的）。启动时读来塞进运行时缓存 */
export async function readStockManifest(): Promise<StockPhoto[]> {
  return readManifest();
}
