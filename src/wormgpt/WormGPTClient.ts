import { CheckLeakedApiError, CheckLeakedAuthError, CheckLeakedError, CheckLeakedNetworkError, CheckLeakedRateLimitError } from '../errors';
import type { IHttpClient } from '../http';
import { AiResource } from '../resources/AiResource';
import type {
  InvestigateOptions,
  InvestigationResponse,
  WormChatCompletion,
  WormChatMessage,
  WormChatOptions,
  WormChatRequest,
  WormModel,
  WormStreamEvent,
  WormToolInfo,
  WormToolResult,
  WormUsage,
} from '../types';
import { readSse } from './sse';

/** Agent runs can take minutes. */
const DEFAULT_WORM_TIMEOUT_MS = 300_000;

export interface WormAskOptions extends WormChatOptions {
  /** Optional system prompt placed before the question. */
  system?: string;
  /** Earlier turns to include before the question. */
  history?: WormChatMessage[];
}

/**
 * `client.wormgpt` — WormGPT, the uncensored security-research LLM behind
 * `wormgpt.checkleaked.com`, authenticated with your CheckLeaked bot token
 * (same key as the rest of the SDK). OpenAI-compatible.
 *
 * - `ask()` / `chat()` / `stream()` — chat completions. With `tools_enabled`
 *   the agent loop runs web search / fetch and the CheckLeaked leak & OSINT
 *   tools (dehashed, leak_check, leakradar, ghunt, whois, dns…) on its own.
 * - `investigate()` — the one-call OSINT dossier (`client.ai.investigate`).
 * - `models()`, `tools()`, `usage()`.
 *
 * Every successful call spends one unit of your WormGPT daily quota (Pro 250 /
 * Plus 100, reset 00:00 UTC). An exhausted quota throws `CheckLeakedRateLimitError`.
 *
 * Point any OpenAI SDK at it too: `baseURL: 'https://wormgpt.checkleaked.com/v1'`,
 * `apiKey: <bot token>`.
 */
export class WormGPTClient {
  private readonly ai: AiResource;

  constructor(private readonly http: IHttpClient) {
    this.ai = new AiResource(http);
  }

  /** Send one question, get the answer text. */
  async ask(prompt: string, opts: WormAskOptions = {}): Promise<string> {
    const { system, history, ...rest } = opts;
    const messages: WormChatMessage[] = [];
    if (system) messages.push({ role: 'system', content: system });
    if (history) messages.push(...history);
    messages.push({ role: 'user', content: prompt });
    const res = await this.chat({ ...rest, messages });
    return completionText(res);
  }

  /**
   * Chat completion (OpenAI shape). With `tools_enabled` the call streams under
   * the hood — a long agent run would otherwise sit silent past Cloudflare's
   * 100 s origin limit — and folds the stream back into one completion whose
   * `tool_results` lists every tool the agent ran.
   */
  async chat(request: WormChatRequest): Promise<WormChatCompletion> {
    if (request.tools_enabled) return this.collect(request);
    return this.call(() =>
      this.http.request<WormChatCompletion>({
        method: 'POST',
        path: '/v1/chat/completions',
        base: 'wormgpt',
        body: buildBody(request, { stream: false }),
        timeout: request.timeout ?? DEFAULT_WORM_TIMEOUT_MS,
        signal: request.signal,
        retry: false,
      }),
    );
  }

  /**
   * Stream a chat completion as typed events: `content` deltas, agent
   * `tool_start` / `tool_end` / `thinking` / `status` frames, then `done`.
   *
   * ```ts
   * for await (const ev of api.wormgpt.stream({ messages, tools_enabled: true })) {
   *   if (ev.type === 'content') process.stdout.write(ev.delta);
   *   if (ev.type === 'tool_start') console.error(`\n[${ev.tool}]`);
   * }
   * ```
   */
  async *stream(request: WormChatRequest & { status_events?: boolean }): AsyncGenerator<WormStreamEvent> {
    const res = await this.call(() =>
      this.http.request<Response>({
        method: 'POST',
        path: '/v1/chat/completions',
        base: 'wormgpt',
        body: buildBody(request, { stream: true, status_events: request.status_events !== false }),
        responseType: 'stream',
        timeout: request.timeout ?? DEFAULT_WORM_TIMEOUT_MS,
        signal: request.signal,
        retry: false,
      }),
    );
    if (!res.body) throw new CheckLeakedApiError({ message: 'WormGPT returned an empty stream', status: res.status, body: undefined });
    let finished = false;
    try {
      for await (const msg of readSse(res.body, request.signal)) {
        if (msg.data === '[DONE]') {
          if (!finished) yield { type: 'done' };
          return;
        }
        let payload: any;
        try {
          payload = JSON.parse(msg.data);
        } catch {
          // Non-JSON data is only meaningful on an error frame.
          if (msg.event === 'error') throw streamError(msg.data || 'WormGPT stream error', msg.data);
          continue;
        }
        if (msg.event === 'error' || (payload && payload.error && !payload.choices)) {
          throw streamError(errorText(payload?.error) || 'WormGPT stream error', payload);
        }
        if (msg.event === 'tool_status') {
          const ev = toolStatusEvent(payload);
          if (ev) yield ev;
          continue;
        }
        const choice = payload?.choices?.[0];
        const delta = choice?.delta?.content;
        if (typeof delta === 'string' && delta) yield { type: 'content', delta };
        if (choice?.finish_reason) {
          finished = true;
          yield { type: 'done', finish_reason: choice.finish_reason };
        }
      }
    } catch (e) {
      if (e instanceof CheckLeakedError) throw e;
      // An abort or a dropped connection mid-stream (DOMException / TypeError: terminated).
      const aborted = !!request.signal?.aborted;
      throw new CheckLeakedNetworkError(aborted ? 'Request aborted' : `WormGPT stream interrupted: ${(e as Error)?.message || e}`, e);
    }
    if (!finished) yield { type: 'done' };
  }

  /** WormGPT OSINT investigation of one subject (alias of `client.ai.investigate`). */
  investigate(term: string, opts?: InvestigateOptions): Promise<InvestigationResponse> {
    return this.ai.investigate(term, opts);
  }

  /** Available model ids (no auth, no quota). */
  async models(): Promise<WormModel[]> {
    const res = await this.http.request<{ data?: WormModel[] }>({ method: 'GET', path: '/v1/models', base: 'wormgpt', auth: 'none' });
    return (res && res.data) || [];
  }

  /** The agent's tool catalog — what `tools_enabled` lets the model call (no auth). */
  async tools(): Promise<WormToolInfo[]> {
    const res = await this.http.request<{ tools?: WormToolInfo[] }>({ method: 'GET', path: '/dashboard/api/tools', base: 'wormgpt', auth: 'none' });
    return (res && res.tools) || [];
  }

  /** Your WormGPT daily quota: `{ dailyLimit, todayUsage, dailyRemaining, … }`. */
  usage(): Promise<WormUsage> {
    return this.call(() => this.http.request<WormUsage>({ method: 'GET', path: '/dashboard/api/key/stats', base: 'wormgpt' }));
  }

  // -------------------------------------------------------------------------

  /** Run the stream and fold it into one completion. */
  private async collect(request: WormChatRequest): Promise<WormChatCompletion> {
    let content = '';
    let finish: string | null = 'stop';
    const toolResults: WormToolResult[] = [];
    for await (const ev of this.stream({ ...request, status_events: true })) {
      if (ev.type === 'content') content += ev.delta;
      else if (ev.type === 'tool_end') {
        toolResults.push({ tool: ev.tool, arguments: ev.raw.arguments, success: ev.success, result: ev.result, error: ev.error ?? null });
      } else if (ev.type === 'done' && ev.finish_reason) finish = ev.finish_reason;
    }
    return {
      id: `chatcmpl-${Date.now().toString(36)}`,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: request.model || 'wormgpt',
      choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: finish }],
      tool_results: toolResults,
    };
  }

  /** WormGPT answers 401 for an exhausted daily quota too; surface that as a rate-limit error. */
  private async call<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof CheckLeakedAuthError && /limit|quota/i.test(e.message)) {
        throw new CheckLeakedRateLimitError({ message: e.message, status: e.status, body: e.body, path: e.path, method: e.method });
      }
      throw e;
    }
  }
}

/** The answer text of a completion. */
export function completionText(res: WormChatCompletion): string {
  const c = res && res.choices && res.choices[0];
  return (c && c.message && typeof c.message.content === 'string' && c.message.content) || '';
}

/** Message of an error payload: a string, or an OpenAI-style `{ message }` object. */
function errorText(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string') return (err as { message: string }).message;
  return '';
}

function streamError(message: string, body: unknown): CheckLeakedApiError {
  return new CheckLeakedApiError({ message, status: 0, body, path: '/v1/chat/completions', method: 'POST' });
}

function buildBody(request: WormChatRequest, overrides: Record<string, unknown>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    messages: request.messages,
    model: request.model,
    tools_enabled: request.tools_enabled,
    web_search_enabled: request.web_search_enabled,
    thinking_enabled: request.thinking_enabled,
    strip_think: request.strip_think,
    memory_enabled: request.memory_enabled,
    data_consent: request.data_consent,
    language: request.language,
    tools: request.tools,
    tool_emulation: request.tool_emulation,
    ...(request.extra ?? {}),
    ...overrides,
  };
  for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
  return body;
}

function toolStatusEvent(p: any): WormStreamEvent | null {
  if (!p || typeof p !== 'object') return null;
  switch (p.type) {
    case 'tool_start':
      return { type: 'tool_start', tool: String(p.tool ?? ''), arguments: p.arguments, raw: p };
    case 'tool_end':
      return { type: 'tool_end', tool: String(p.tool ?? ''), success: p.success !== false, result: p.result, error: p.error ?? null, raw: p };
    case 'thinking':
      return { type: 'thinking', iteration: p.iteration, raw: p };
    case 'complete':
      return null;
    default:
      return { type: 'status', raw: p };
  }
}
