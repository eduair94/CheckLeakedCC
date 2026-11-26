/**
 * Minimal Server-Sent Events reader over a WHATWG `ReadableStream<Uint8Array>`
 * (what `fetch` returns in Node 20+, Bun, Deno and browsers).
 */

export interface SseMessage {
  /** `event:` field; `message` when absent. */
  event: string;
  /** Joined `data:` lines. */
  data: string;
}

/** Yield one {@link SseMessage} per blank-line-terminated block. Comment lines (`:`) are skipped. */
export async function* readSse(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SseMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let event = '';
  let data: string[] = [];
  const onAbort = () => {
    reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  let drained = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      // Cancelling the reader on abort resolves the pending read as `done`;
      // that is an abort, not a clean end of stream.
      if (signal?.aborted) throw signal.reason ?? Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
      if (done) drained = true;
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.search(/\r\n|\r|\n/)) !== -1) {
        // A lone `\r` at the end of the chunk may be the first half of a CRLF
        // split across reads: wait for the next chunk before deciding.
        if (!done && buffer[nl] === '\r' && nl === buffer.length - 1) break;
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(buffer[nl] === '\r' && buffer[nl + 1] === '\n' ? nl + 2 : nl + 1);
        if (line === '') {
          if (data.length) yield { event: event || 'message', data: data.join('\n') };
          event = '';
          data = [];
          continue;
        }
        if (line.charAt(0) === ':') continue;
        const idx = line.indexOf(':');
        const field = idx === -1 ? line : line.slice(0, idx);
        let value = idx === -1 ? '' : line.slice(idx + 1);
        if (value.charAt(0) === ' ') value = value.slice(1);
        if (field === 'event') event = value;
        else if (field === 'data') data.push(value);
      }
      if (done) {
        if (buffer) {
          // A final line with no trailing newline.
          if (buffer.startsWith('data:')) data.push(buffer.slice(5).replace(/^ /, ''));
          buffer = '';
        }
        if (data.length) yield { event: event || 'message', data: data.join('\n') };
        return;
      }
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    // The consumer stopped early (break / throw): close the connection.
    if (!drained) await reader.cancel().catch(() => undefined);
    reader.releaseLock?.();
  }
}
