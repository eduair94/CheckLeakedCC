/**
 * Zero-dependency HTTP transport for the CheckLeaked.cc SDK, built on the
 * global `fetch` (Node 20+, Bun, Deno, edge runtimes).
 *
 * Handles:
 *   - Auth header injection (`api-key` for the CheckLeaked API, `Authorization:
 *     Bearer` for the WormGPT proxy, nothing for public routes)
 *   - Three hosts: the bot API (`api`), the open site routes (`site`) and the
 *     WormGPT proxy (`wormgpt`)
 *   - Query-string serialization (skips null/undefined, repeats arrays)
 *   - JSON body marshalling
 *   - Error mapping to the typed `CheckLeakedError` hierarchy
 *   - `{ error: "..." }` body detection on 2xx responses (a CheckLeaked quirk)
 *   - Retry on 429 (honoring `Retry-After`) and 5xx with exponential backoff
 *   - Per-request timeout (covering the body read) and caller `AbortSignal`s
 *   - Binary (CSV / PDF exports), text and streaming (SSE) responses
 *
 * Resource classes depend ONLY on the `IHttpClient` interface, so an alternate
 * transport can be swapped in for tests.
 */
import {
  CheckLeakedAuthError,
  CheckLeakedError,
  CheckLeakedNetworkError,
  CheckLeakedRateLimitError,
  errorFromResponse,
  errorMessageFromBody,
} from './errors';
import { SDK_VERSION } from './version';

/** Minimal shape of the global `fetch`, so a custom implementation can be injected. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface CheckLeakedConfig {
  /**
   * Bot API key from https://checkleaked.cc/botLinks. Sent as the `api-key`
   * header to the CheckLeaked API and as `Authorization: Bearer` to WormGPT.
   * Optional only when `allowMissingApiKey` is set (public routes only).
   */
  apiKey?: string;
  /** Override the API base URL. Defaults to `https://api.checkleaked.cc/api`. */
  baseUrl?: string;
  /** Override the open-routes base URL (breach registry, news, plans…). Defaults to `https://checkleaked.cc/api`. */
  siteUrl?: string;
  /** Override the WormGPT proxy base URL. Defaults to `https://wormgpt.checkleaked.com`. */
  wormgptUrl?: string;
  /** Override the hosted MCP endpoint. Defaults to `https://mcp.checkleaked.cc/mcp`. */
  mcpUrl?: string;
  /** Per-request timeout in ms. Defaults to 120000 (2 min — some searches are slow). */
  timeout?: number;
  /** Custom `User-Agent`. Defaults to `checkleakedcc-node/<version>`. */
  userAgent?: string;
  /** Max retry attempts for 429 / 5xx / transient network errors. Defaults to 2. */
  maxRetries?: number;
  /** Base backoff for retries in ms. Defaults to 500. */
  retryDelayMs?: number;
  /** Extra headers added to every request. */
  defaultHeaders?: Record<string, string>;
  /**
   * When true (default), a 2xx response whose body is `{ error: "..." }` is
   * turned into a thrown `CheckLeakedApiError`. Set false to receive the raw
   * body instead (legacy behavior).
   */
  throwOnErrorBody?: boolean;
  /** Inject a custom `fetch` (e.g. for a proxy agent or in tests). Defaults to global fetch. */
  fetch?: FetchLike;
  /** Optional undici `Dispatcher` (e.g. a `ProxyAgent`) passed through to fetch. */
  dispatcher?: unknown;
  /**
   * Construct without an api key. Only keyless calls (public site routes, k-anonymity
   * checks, WormGPT model list) work; every other call throws `CheckLeakedAuthError`.
   */
  allowMissingApiKey?: boolean;
}

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** Which host a request goes to. */
export type ApiBase = 'api' | 'site' | 'wormgpt';

/** How a request authenticates. */
export type AuthMode = 'api-key' | 'bearer' | 'none';

export interface RequestOptions<TBody = unknown> {
  method: HttpMethod;
  path: string;
  /** Query params. null/undefined skipped, arrays repeated (`?k=a&k=b`), booleans as `true`/`false`. */
  query?: Record<string, unknown>;
  body?: TBody;
  /**
   * Defaults to `json`. Use `arraybuffer` for binary export downloads, `text`
   * for plain text, and `stream` to receive the raw `Response` (for SSE).
   */
  responseType?: 'json' | 'arraybuffer' | 'text' | 'stream';
  headers?: Record<string, string>;
  /** Set false to disable retry for this single call. */
  retry?: boolean;
  /** Host to call. Defaults to `api`. */
  base?: ApiBase;
  /** Auth header to send. Defaults to `api-key` (or `bearer` on the `wormgpt` base). */
  auth?: AuthMode;
  /** Per-request timeout override in ms. For `stream`, only covers the wait for headers. */
  timeout?: number;
  /** Caller-supplied cancellation. */
  signal?: AbortSignal;
  /** Per-request override of the client's `throwOnErrorBody`. */
  throwOnErrorBody?: boolean;
}

export interface IHttpClient {
  request<TResponse>(opts: RequestOptions): Promise<TResponse>;
}

export const DEFAULT_BASE_URL = 'https://api.checkleaked.cc/api';
export const DEFAULT_SITE_URL = 'https://checkleaked.cc/api';
export const DEFAULT_WORMGPT_URL = 'https://wormgpt.checkleaked.com';
export const DEFAULT_MCP_URL = 'https://mcp.checkleaked.cc/mcp';
const DEFAULT_TIMEOUT = 120_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY = 500;
/** Longest `Retry-After` the client will sleep through before giving up and throwing. */
const MAX_RETRY_AFTER_MS = 60_000;

export class HttpClient implements IHttpClient {
  private readonly bases: Record<ApiBase, string>;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly defaultHeaders: Record<string, string>;
  private readonly throwOnErrorBody: boolean;
  private readonly fetchImpl: FetchLike;
  private readonly dispatcher?: unknown;
  private readonly apiKey: string;
  /** Hosted MCP endpoint (used by `RemoteMcpClient`). */
  public readonly mcpUrl: string;

  constructor(cfg: CheckLeakedConfig) {
    const key = typeof cfg.apiKey === 'string' ? cfg.apiKey.trim() : '';
    if (!key && !cfg.allowMissingApiKey) {
      throw new CheckLeakedError('An api key is required. Get one at https://checkleaked.cc/botLinks');
    }
    const resolvedFetch = cfg.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (!resolvedFetch) {
      throw new CheckLeakedError('Global fetch is unavailable. Use Node 20+ or pass a `fetch` implementation.');
    }
    this.apiKey = key;
    this.fetchImpl = resolvedFetch;
    this.dispatcher = cfg.dispatcher;
    this.bases = {
      api: trimSlash(cfg.baseUrl || DEFAULT_BASE_URL),
      site: trimSlash(cfg.siteUrl || DEFAULT_SITE_URL),
      wormgpt: trimSlash(cfg.wormgptUrl || DEFAULT_WORMGPT_URL),
    };
    this.mcpUrl = cfg.mcpUrl || DEFAULT_MCP_URL;
    this.timeout = cfg.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = cfg.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = cfg.retryDelayMs ?? DEFAULT_RETRY_DELAY;
    this.throwOnErrorBody = cfg.throwOnErrorBody !== false;
    this.defaultHeaders = {
      Accept: 'application/json',
      'User-Agent': cfg.userAgent || `checkleakedcc-node/${SDK_VERSION}`,
      ...(cfg.defaultHeaders ?? {}),
    };
  }

  /** True when the client was given an api key. */
  get hasApiKey(): boolean {
    return this.apiKey.length > 0;
  }

  /** The configured api key (used by the remote MCP client's Bearer header). */
  getApiKey(): string {
    return this.apiKey;
  }

  /** Absolute base URL for one of the hosts. */
  baseUrlFor(base: ApiBase = 'api'): string {
    return this.bases[base];
  }

  /** Raw `fetch` with the client's dispatcher/agent wiring, for protocol clients (MCP) built on top. */
  rawFetch(url: string, init: RequestInit): Promise<Response> {
    if (this.dispatcher) (init as Record<string, unknown>).dispatcher = this.dispatcher;
    return this.fetchImpl(url, init);
  }

  async request<TResponse>(opts: RequestOptions): Promise<TResponse> {
    const base = opts.base ?? 'api';
    const auth: AuthMode = opts.auth ?? (base === 'wormgpt' ? 'bearer' : 'api-key');
    if (auth !== 'none' && !this.apiKey) {
      throw new CheckLeakedAuthError({
        message: 'This call needs an api key. Get one at https://checkleaked.cc/botLinks',
        status: 0,
        body: undefined,
        path: opts.path,
        method: opts.method,
      });
    }
    const url = this.bases[base] + normalizePath(opts.path) + buildQueryString(opts.query);
    const hasBody = opts.body !== undefined && opts.method !== 'GET';
    const headers: Record<string, string> = { ...this.defaultHeaders };
    if (auth === 'api-key') headers['api-key'] = this.apiKey;
    else if (auth === 'bearer') headers.Authorization = `Bearer ${this.apiKey}`;
    if (opts.responseType === 'stream') headers.Accept = 'text/event-stream, application/json';
    Object.assign(headers, opts.headers ?? {});
    if (hasBody) headers['Content-Type'] = 'application/json';

    const timeout = opts.timeout ?? this.timeout;
    const allowRetry = opts.retry !== false;
    // A 429 was refused before any work, so it is always safe to retry. A
    // timeout, dropped connection or 5xx on a POST may already have spent a
    // lookup / unlocked a leak server-side, so those are retried only for GET
    // (or when the caller opts in with `retry: true`).
    const idempotent = opts.method === 'GET' || opts.retry === true;
    const pause = async (ms: number) => {
      try {
        await sleep(ms, opts.signal);
      } catch {
        throw new CheckLeakedNetworkError('Request aborted', opts.signal?.reason);
      }
    };
    let attempt = 0;
    while (true) {
      if (opts.signal?.aborted) throw new CheckLeakedNetworkError('Request aborted', opts.signal.reason);
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeout);
      const onCallerAbort = () => controller.abort();
      opts.signal?.addEventListener('abort', onCallerAbort, { once: true });
      const cleanup = () => {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', onCallerAbort);
      };

      let res: Response;
      let data: unknown;
      try {
        const init: RequestInit = {
          method: opts.method,
          headers,
          body: hasBody ? JSON.stringify(opts.body) : undefined,
          signal: controller.signal,
        };
        if (this.dispatcher) (init as Record<string, unknown>).dispatcher = this.dispatcher;
        res = await this.fetchImpl(url, init);
        if (opts.responseType === 'stream' && res.ok) {
          // The stream outlives this call. Drop the timer and our listener; the
          // stream reader (`readSse`) takes the caller's signal and cancels the
          // body itself, so nothing here keeps a reference to this request.
          cleanup();
          return res as unknown as TResponse;
        }
        data = await parseBody(res, opts.responseType === 'stream' ? 'json' : opts.responseType);
      } catch (raw) {
        cleanup();
        const err = raw as Error;
        const callerAborted = !!opts.signal?.aborted;
        if (!callerAborted && allowRetry && idempotent && attempt < this.maxRetries) {
          await pause(this.backoff(attempt));
          attempt++;
          continue;
        }
        const msg = callerAborted
          ? 'Request aborted'
          : timedOut
            ? `Request timed out after ${timeout}ms`
            : err?.message || 'Network error';
        throw new CheckLeakedNetworkError(msg, err);
      }
      cleanup();

      if (res.ok) {
        if ((opts.throwOnErrorBody ?? this.throwOnErrorBody) && opts.responseType !== 'arraybuffer') {
          const msg = errorMessageFromBody(data);
          if (msg) throw errorFromResponse({ status: 0, body: data, path: opts.path, method: opts.method });
        }
        return data as TResponse;
      }

      const retryAfterMs = parseRetryAfter(res.headers);
      const apiErr = errorFromResponse({ status: res.status, body: data, path: opts.path, method: opts.method, retryAfterMs });
      const isRateLimit = apiErr instanceof CheckLeakedRateLimitError;
      const shouldRetry =
        allowRetry &&
        attempt < this.maxRetries &&
        (isRateLimit || (idempotent && res.status >= 500 && res.status < 600)) &&
        !(isRateLimit && retryAfterMs !== undefined && retryAfterMs > MAX_RETRY_AFTER_MS);
      if (shouldRetry) {
        const wait = isRateLimit && retryAfterMs ? retryAfterMs : this.backoff(attempt);
        await pause(wait);
        attempt++;
        continue;
      }
      throw apiErr;
    }
  }

  private backoff(attempt: number): number {
    return this.retryDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 100);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function normalizePath(path: string): string {
  if (!path) return '';
  return path.charAt(0) === '/' ? path : '/' + path;
}

export function buildQueryString(query?: Record<string, unknown>): string {
  if (!query) return '';
  const parts: string[] = [];
  for (const k of Object.keys(query)) {
    const v = query[k];
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      for (const item of v) parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(item))}`);
    } else if (typeof v === 'boolean') {
      parts.push(`${encodeURIComponent(k)}=${v ? 'true' : 'false'}`);
    } else {
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
  }
  return parts.length ? '?' + parts.join('&') : '';
}

async function parseBody(res: Response, responseType?: 'json' | 'arraybuffer' | 'text'): Promise<unknown> {
  if (responseType === 'arraybuffer' && res.ok) return res.arrayBuffer();
  const text = await res.text();
  if (!text) return undefined;
  if (responseType === 'text' && res.ok) return text;
  // Long-running CheckLeaked routes (worm_report) keep the connection alive with
  // newline heartbeats before the JSON body; JSON.parse tolerates the whitespace.
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function parseRetryAfter(headers: Headers): number | undefined {
  const raw = headers.get('retry-after');
  if (raw === null) return undefined;
  const num = Number(raw);
  if (!Number.isNaN(num)) return Math.max(0, Math.ceil(num * 1000));
  const date = Date.parse(raw);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

/** Wait `ms`, rejecting early if `signal` aborts. */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
