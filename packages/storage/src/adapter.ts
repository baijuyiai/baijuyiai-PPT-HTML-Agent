/**
 * 对象存储适配器契约。
 *
 * 产物按租户分区，路径形如 `/{tenantId}/{projectId}/...`，由 objectKey 负责拼装。
 *
 * 接入 S3 兼容存储（AWS S3 / MinIO / 阿里云 OSS 等）需实现同一 StorageAdapter
 * 接口，并自行保证 key 净化与访问控制；本包只内置本地文件系统实现，不提供
 * 未经真实端点验证的云端实现。
 */

/** 产物分区种类 */
export type ObjectKind = 'images' | 'exports' | 'videos' | 'uploads' | 'thumbs';

const KINDS: readonly ObjectKind[] = ['images', 'exports', 'videos', 'uploads', 'thumbs'];

export interface StorageAdapter {
  /** 写入并返回可访问 URL */
  put(key: string, data: Buffer, contentType: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  /** 返回该 key 的公开访问 URL（不校验存在性） */
  url(key: string): string;
  exists(key: string): Promise<boolean>;
}

/** 单个路径段允许出现的字符，其余一律替换为下划线 */
const UNSAFE_SEGMENT_CHARS = /[^A-Za-z0-9._-]/g;

/**
 * 净化单个路径段：只保留 [A-Za-z0-9._-]，其余字符替换为下划线。
 * 净化后为空（含路径穿越片段）一律拒绝，避免拼出空目录或 `..`。
 */
function sanitizeSegment(segment: string): string {
  const cleaned = segment.replace(UNSAFE_SEGMENT_CHARS, '_');
  if (cleaned.length === 0) {
    throw new Error(`非法路径段：净化后为空（原始值 ${JSON.stringify(segment)}）`);
  }
  if (cleaned.includes('..')) {
    throw new Error(`非法路径段：含路径穿越片段（原始值 ${JSON.stringify(segment)}）`);
  }
  return cleaned;
}

/**
 * 拼装对象 key：`{tenantId}/{projectId}/{kind}/{name}`。
 * 四个路径段都会做净化，任一为空即抛错。
 */
export function objectKey(
  tenantId: string,
  projectId: string,
  kind: ObjectKind,
  name: string,
): string {
  if (!KINDS.includes(kind)) {
    throw new Error(`未知产物分区：${String(kind)}`);
  }
  return [
    sanitizeSegment(tenantId),
    sanitizeSegment(projectId),
    kind,
    sanitizeSegment(name),
  ].join('/');
}

/**
 * 校验 key 安全，防路径穿越。这是所有落盘操作的前置守卫。
 * 拒绝：空 key、含 `..`、以 `/` 开头、含反斜杠、含空字节、含冒号。
 */
export function assertSafeKey(key: string): void {
  if (key.length === 0) {
    throw new Error('非法 key：为空');
  }
  if (key.includes('\0')) {
    throw new Error(`非法 key：含空字节（${JSON.stringify(key)}）`);
  }
  if (key.includes('..')) {
    throw new Error(`非法 key：含 ".." 路径穿越（${JSON.stringify(key)}）`);
  }
  if (key.startsWith('/')) {
    throw new Error(`非法 key：不得以 "/" 开头（${JSON.stringify(key)}）`);
  }
  if (key.includes('\\')) {
    throw new Error(`非法 key：含反斜杠（${JSON.stringify(key)}）`);
  }
  if (key.includes(':')) {
    throw new Error(`非法 key：含冒号（${JSON.stringify(key)}）`);
  }
}

/**
 * 按文件名猜 MIME。认不出回 `null`，由调用方决定兜底成什么。
 *
 * 为什么放在存储这一层：对象存储里躺的就是按扩展名命名的一堆文件，而**取出字节之后
 * 往往还要把 MIME 交给下游**（喂给抠图服务、拼 data URL）。原先这段映射在三个地方
 * 各抄了一份，改一处漏一处不会报错，只会让某条链路拿到错的类型。
 *
 * 只列本仓真的会落盘的图片类型：`/uploads` 只收这四种，素材库是 jpg 与 png。
 */
const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
};

export function mimeOfName(name: string): string | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return MIME_BY_EXT[ext] ?? null;
}
