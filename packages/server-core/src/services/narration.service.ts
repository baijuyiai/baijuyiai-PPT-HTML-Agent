import { createHash } from 'node:crypto';
import { createStorage, objectKey, type StorageAdapter } from '@lumen/storage';
import { SPEECH_PROMPT, type ProviderGateway } from '@lumen/provider-gateway';
import type { PageIR } from '@lumen/ir-schema';
import { getPage, pageIR, requireProject, type ProjectRow } from './project.service.js';
import { requireRoute } from './provider.service.js';
import { narrationTone, narrationVoice } from './settings.service.js';

/**
 * 讲解音频（PRD §5.9）。
 *
 * 一页一份音频，文件名里带**内容哈希**：讲稿、音色、语气、模型任一变化，哈希就变，
 * 于是「改了设置要记得重新生成」这件事不用人记——下次取就是新的。
 * 代价是旧文件会留在盘上，所以合成成功后顺手把上一份删掉。
 *
 * 时间戳不在这里存：语音模型不回任何时间信息，而演示端本来就能从音频元素
 * 拿到真实时长，按讲稿分段的字数比例缩放即可定位光标。多存一份只会多一份会过期的数据。
 */

/** 按 mime 定扩展名。取不到时按 bin 兜底 */
export function extensionForMime(mime: string): string {
  const m = mime.toLowerCase();
  if (m.includes('wav')) return 'wav';
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
  if (m.includes('ogg') || m.includes('opus')) return 'ogg';
  if (m.includes('aac')) return 'aac';
  return 'bin';
}

/**
 * 决定音频内容的东西。任一变，缓存就得失效。
 *
 * **`provider` 不能省。** 内置 Mock 与真实 Provider 可以配同一个模型名
 * （实测就撞上过：tts 路由默认指向 Mock、模型名同为 `gpt-audio-1.5-official`），
 * 只按模型名算哈希的话，把路由切到真实 Provider 之后仍然会命中 Mock 那段静音，
 * 表现为「配好了却还是没声音」。
 *
 * **`prompt` 同样不能省。** 它是发给语音模型的朗读指令，改一个字合成结果就完全不同
 * （实测：有指令是 1956 KB 的全文朗读，没指令是 411 KB 的对话式回应）——
 * 但讲稿、音色、路由都没变，不把它算进去，改了指令却一直命中旧音频。
 */
export interface NarrationInputs {
  text: string;
  voice: string;
  tone: string;
  provider: string;
  model: string;
  prompt: string;
}

/**
 * 内容哈希。用 NUL 做分隔符——不然 ('ab','c') 与 ('a','bc') 会拼成同一个串，
 * 撞哈希后表现为「改了音色却还是旧声音」。
 */
export function narrationHash(i: NarrationInputs): string {
  return createHash('sha256')
    .update([i.text, i.voice, i.tone, i.provider, i.model, i.prompt].join('\u0000'))
    .digest('hex')
    .slice(0, 16);
}

/** 旁挂的元数据：记着当前哈希指向哪个音频文件 */
interface NarrationMeta {
  hash: string;
  key: string;
  mime: string;
  voice: string;
  tone: string;
  model: string;
}

export interface NarrationAudio {
  buffer: Buffer;
  mime: string;
}

function metaKeyOf(tenantId: string, projectId: string, pageId: string): string {
  return objectKey(tenantId, projectId, 'videos', `${pageId}-narration.json`);
}

function audioKeyOf(
  tenantId: string,
  projectId: string,
  pageId: string,
  hash: string,
  ext: string,
): string {
  return objectKey(tenantId, projectId, 'videos', `${pageId}-narration-${hash}.${ext}`);
}

/** 这一页要朗读的文本。讲稿为空时用标题兜底，避免合成一段空音频 */
export function narrationTextOf(page: PageIR): string {
  const text = page.script.text.trim();
  if (text !== '') return text;
  const title = page.title.main.trim();
  return title !== '' ? `这一页讲的是「${title}」。` : '';
}

/**
 * 当前配置下这一页的合成输入。读路径与写路径共用，保证两边算的是同一个哈希。
 *
 * 音色与语气**项目优先、null 则回落全局**：项目单独选过的用自己的，没选过的跟着
 * 后台的全局设置走。所以改一次全局，所有没覆盖过的项目一起换声——
 * 这正是「已经生成的项目也可以全局切换人声重新生成」要的行为。
 */
function inputsFor(page: PageIR, project: ProjectRow): NarrationInputs {
  // 路由决定谁来合。provider 与 model 都要进哈希，理由见 `NarrationInputs`
  const route = requireRoute('tts').primary;
  return {
    text: narrationTextOf(page),
    voice: project.narrationVoice?.trim() || narrationVoice(),
    tone: project.narrationTone ?? narrationTone(),
    provider: route.providerId,
    model: route.model,
    prompt: SPEECH_PROMPT,
  };
}

async function readMeta(storage: StorageAdapter, key: string): Promise<NarrationMeta | null> {
  try {
    return JSON.parse((await storage.get(key)).toString('utf8')) as NarrationMeta;
  } catch {
    // 没合成过，或元数据坏了——都当作没有
    return null;
  }
}

/**
 * 取这一页的讲解音频。没合成过、或输入变了，返回 null，由调用方去合成。
 *
 * 越权与不存在的页都由 `getPage` 抛错，所以这里不需要再判一次租户。
 * storage 可注入：`createStorage()` 是读环境变量的模块级单例，测试里没法重定向，
 * 与 `brand-logo.service` 的 `readObject` 同一套做法。
 */
export async function readNarration(
  pageId: string,
  tenantId: string,
  storage: StorageAdapter = createStorage(),
): Promise<NarrationAudio | null> {
  const row = getPage(pageId, tenantId);
  const page = pageIR(row);
  const inputs = inputsFor(page, requireProject(row.projectId, tenantId));
  if (inputs.text === '') return null;

  const meta = await readMeta(storage, metaKeyOf(tenantId, row.projectId, pageId));
  if (!meta || meta.hash !== narrationHash(inputs)) return null;

  try {
    return { buffer: await storage.get(meta.key), mime: meta.mime };
  } catch {
    // 元数据在、音频没了（被人清过盘）——当作没合成
    return null;
  }
}

/** 合成这一页的讲解音频并落盘 */
export async function synthesizeNarration(input: {
  pageId: string;
  tenantId: string;
  gateway: ProviderGateway;
  storage?: StorageAdapter;
}): Promise<NarrationAudio> {
  const row = getPage(input.pageId, input.tenantId);
  const page = pageIR(row);
  const inputs = inputsFor(page, requireProject(row.projectId, input.tenantId));
  if (inputs.text === '') throw new Error('这一页没有可朗读的内容');

  const result = await input.gateway.speech({
    taskType: 'tts',
    text: inputs.text,
    voice: inputs.voice,
    tone: inputs.tone,
  });

  const storage = input.storage ?? createStorage();
  const metaKey = metaKeyOf(input.tenantId, row.projectId, input.pageId);
  const key = audioKeyOf(
    input.tenantId,
    row.projectId,
    input.pageId,
    narrationHash(inputs),
    extensionForMime(result.audio.mime),
  );

  await storage.put(key, result.audio.buffer, result.audio.mime);

  // 换过音色/语气/讲稿之后旧的那份就没用了，顺手删掉，别让盘上越积越多
  const previous = await readMeta(storage, metaKey);
  if (previous && previous.key !== key) {
    try {
      await storage.delete(previous.key);
    } catch {
      // 删不掉不影响这一次的合成结果
    }
  }

  const meta: NarrationMeta = {
    hash: narrationHash(inputs),
    key,
    mime: result.audio.mime,
    voice: inputs.voice,
    tone: inputs.tone,
    model: result.model,
  };
  await storage.put(metaKey, Buffer.from(JSON.stringify(meta), 'utf8'), 'application/json');

  return { buffer: result.audio.buffer, mime: result.audio.mime };
}

/** 命中缓存就直接回，否则合成。API 路由用这个 */
export async function ensureNarration(input: {
  pageId: string;
  tenantId: string;
  gateway: ProviderGateway;
  storage?: StorageAdapter;
}): Promise<NarrationAudio> {
  const cached = await readNarration(input.pageId, input.tenantId, input.storage);
  if (cached) return cached;
  return synthesizeNarration(input);
}
