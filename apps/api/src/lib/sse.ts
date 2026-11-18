import type { Response } from 'express';

/**
 * 一条 SSE 通道：设头、发事件、收尾，并**如实反映客户端有没有断开**。
 *
 * 抽出来是因为这套样板在本仓库曾有三份拷贝（styles 的识别流与单页重识别流、
 * projects 的逐页生成流），三份都用 `res.writableEnded` 判断断连。**这个判据在
 * 三份里都是坏的**：实测客户端 abort 之后它**全程为 false**，只有 `res.destroyed`
 * 会变 true，于是循环一次都没发现过断连。
 *
 * 同一个坏判据，落在三条路由上的后果并不一样。styles 那两条流要的就是「断开即停手」，
 * 判据失灵便是把生成器一路抽到底——模型调用照跑、经 billedGateway 照记账，而每一次
 * `res.write` 都写向一个已经死掉的 socket；`recognize-doc/stream` 那一份最贵，
 * 它是三到六分钟、约二十次模型调用的全量识别。**这两条是缺陷。**
 * projects 的逐页生成流曾经要的恰恰相反（断连也要跑完），同一个坏判据在它身上歪打正着；
 * 那一版之后续跑补齐了（跳过已成功的页、失败页原地重做），那条流也改成了断开即停手——
 * 否则用户点了「停止」，服务端还在花钱，生成锁还一直占着，项目删不掉。
 *
 * 本文件落地时，那三份拷贝都换成了这里这一份，styles 那两份重复实现随之一并删掉。
 *
 * 用法固定为：
 *
 * ```ts
 * const sse = openSse(res);
 * try {
 *   for await (const evt of gen()) {
 *     if (sse.closed) break;   // 断开就停手，别再把生成器往下抽
 *     sse.send(evt.event, evt.data);
 *   }
 * } catch (err) {
 *   sse.send('error', { message: String(err) });
 * } finally {
 *   sse.end();
 * }
 * ```
 */
export interface SseChannel {
  /** 客户端已断开，或响应已经结束。抽生成器的循环每轮都要据此 break */
  readonly closed: boolean;
  /** 发一个 SSE 事件。响应已关闭时静默跳过，不抛 */
  send(event: string, data: unknown): void;
  /** 结束响应。重复调用安全，`res.end()` 只会真正执行一次 */
  end(): void;
}

/**
 * 心跳间隔。
 *
 * **长任务必须有心跳**：这条流中间可能好几分钟一个字节都不发——出一次样机实测约四分钟，
 * 而任何带空闲超时的中间层都会把这样的连接判死。实测踩过一次：补齐缺失页类型时，
 * 客户端在样机阶段收到 ECONNRESET（Node 的 undici `bodyTimeout` 默认 300 秒），
 * 整轮模型调用白跑。生产环境更紧：nginx 的 `proxy_read_timeout` 默认 60 秒。
 *
 * 取 15 秒是给 60 秒那一档留四倍余量，同时不至于把流量堆起来。
 */
const HEARTBEAT_MS = 15_000;

export function openSse(res: Response): SseChannel {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let ended = false;
  // 'close' 在客户端 abort 与正常收尾时都会触发。它与 res.destroyed 一起用：
  // 前者覆盖「对端已经走了」，后者覆盖「socket 已经销毁」——只认其中一个都会漏。
  let disconnected = false;
  res.on('close', () => { disconnected = true; });

  const isClosed = () => ended || disconnected || res.destroyed || res.writableEnded;

  // 发的是 SSE 注释行（冒号开头），规范要求客户端忽略它——本仓库的解析器
  // （`streamSse` 里的 `parseChunk`）在没有 data 行时返回 null，正好忽略掉。
  const heartbeat = setInterval(() => {
    if (isClosed()) { clearInterval(heartbeat); return; }
    try {
      res.write(': ping\n\n');
    } catch {
      // 写向已死的 socket。吞掉即可：下一轮 isClosed() 会把它收掉
    }
  }, HEARTBEAT_MS);
  // 心跳不该拖住进程退出
  heartbeat.unref?.();

  return {
    get closed() {
      return isClosed();
    },
    send(event, data) {
      if (isClosed()) return;
      try {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      } catch {
        // 写向已死的 socket 不该把整条路由带崩。吞掉即可：循环下一轮会看到 closed
      }
    },
    end() {
      if (ended) return;
      ended = true;
      clearInterval(heartbeat);
      res.end();
    },
  };
}
