/**
 * 模型回复的清洗。
 *
 * 两个坑都踩过，所以单独抽出来给识别与生成两边共用：
 *
 * 1. **模型爱在代码前面写一句前言**——「这是为您准备的封面 HTML 代码，采用
 *    1920×1080 固定画布……」。只去首尾的 Markdown 围栏是拦不住的，那句话会留在
 *    片段最前面，被当成正文渲染到页面顶上（实测 4/9 的样机中招）。
 * 2. **同一条清洗不能既处理 HTML 又处理提示词**：提示词里会出现
 *    `<img data-lumen-image="1">`，从第一个标签切会把「代码要求」整段切掉。
 *    所以两个函数分开，调用方按内容类型选。
 */

/**
 * 取 HTML。先取围栏里的内容，再从第一个标签开始切掉前言，最后剥掉 `<script>`。
 *
 * **不要拿它处理提示词**（见 `stripFences`）。
 *
 * 为什么要剥 script：**这条链路里脚本永远不会被执行**——样机走 iframe 且不开
 * `allow-scripts`，导出的自包含 HTML 更不该跑模型写出来的代码。而模型很爱在
 * 开头加一段「读取 window.innerWidth / innerHeight，把 Math.min(w/1920, h/1080)
 * 写进 --scale，并监听 resize」的适配脚本——画布缩放本来就由外层容器的
 * `transform: scale()` 负责，那段代码纯属多余。不剥的话每一张样机都会先被 lint
 * 判「HTML 不得包含 script 标签」再重试一次，实测 11 页里重试了 12 次、出样机的时间翻倍。
 */
export function stripHtmlReply(text: string): string {
  const fenced = /```(?:html)?\s*([\s\S]*?)```/i.exec(text);
  let body = fenced ? fenced[1]! : text;
  const at = body.search(/<(style|div|section|main|header|footer|figure|nav|article|svg|img)\b/i);
  if (at > 0) body = body.slice(at);
  // 只剥**成对**的 script 块。没有闭合标签的残缺 script 留着——那是真问题，该让 lint 拦
  return body.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').trim();
}

/**
 * 只去首尾的 Markdown 围栏，不切前言。**提示词用它**。
 *
 * 围栏语言标记可省可不省，模型两种都写过。
 */
export function stripFences(text: string): string {
  const fenced = /```(?:[a-z]+)?\s*([\s\S]*?)```/i.exec(text);
  const body = fenced ? fenced[1]! : text;
  return body.trim();
}

/**
 * 从模型回复里解析 JSON。
 *
 * 模型常把 JSON 包在围栏里，或在前后加一句解释，所以先剥围栏、再退化到
 * 「第一个 { 到最后一个 }」。两段都失败返回 null，由调用方决定怎么办。
 */
export function parseModelJson<T>(text: string): T | null {
  const candidate = stripFences(text);
  try {
    return JSON.parse(candidate) as T;
  } catch {
    const at = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (at >= 0 && end > at) {
      try {
        return JSON.parse(candidate.slice(at, end + 1)) as T;
      } catch {
        return null;
      }
    }
    return null;
  }
}
