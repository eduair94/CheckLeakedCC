/**
 * Zero-dependency HTTP transport for the CheckLeaked.cc SDK, built on the
 * global `fetch` (Node 20+).
 *
 * Handles:
 *   - `api-key` header injection
 *   - Query-string serialization (skips null/undefined, repeats arrays)
 *   - JSON body marshalling
 *   - Error mapping to the typed `CheckLeakedError` hierarchy
 *   - `{ error: "..." }` body detection on 2xx responses (a CheckLeaked quirk)
 *   - Retry on 429 (honoring `Retry-After`) and 5xx with exponential backoff
 *   - Per-request timeout via `AbortController`
 *   - Optional binary responses (CSV / PDF exports)
 *
 * Resource classes depend ONLY on the `IHttpClient` interface, so an alternate
 * transport can be swapped in for tests.
 */
import {
  CheckLeakedError,
  CheckLeakedNetworkError,
  CheckLeakedRateLimitError,
  errorFromResponse,
  errorMessageFromBody,
} from './errors';

/** Minimal shape of the global `fetch`, so a custom implementation can be injected. */
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface CheckLeakedConfig {
  /** Bot API key from https://checkleaked.cc/botLinks. Sent as the `api-key` header. */
  apiKey: string;
  /** Override the API base URL. Defaults to `https://api.checkleaked.cc/api`. */
  baseUrl?: string;
  /** Per-request timeout in ms. Defaults to 120000 (2 min — some searches are slow). */
  timeout?: number;
  /** Custom `User-Agent`. */
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
}

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RequestOptions<TBody = unknown> {
  method: HttpMethod;
  path: string;
  /** Query params. null/undefined skipped, arrays repeated (`?k=a&k=b`), booleans as `true`/`false`. */
  query?: Record<string, unknown>;
  body?: TBody;
  /** Defaults to `json`. Use `arraybuffer` for binary export downloads. */
  responseType?: 'json' | 'arraybuffer' | 'text';
  headers?: Record<string, string>;
  /** Set false to disable retry for this single call. */
  retry?: boolean;
}

export interface IHttpClient {
  request<TResponse>(opts: RequestOptions): Promise<TResponse>;
}

const DEFAULT_BASE_URL = 'https://api.checkleaked.cc/api';
const DEFAULT_TIMEOUT = 120_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY = 500;

export class HttpClient implements IHttpClient {
  private readonly baseUrl: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly defaultHeaders: Record<string, string>;
  private readonly throwOnErrorBody: boolean;
  private readonly fetchImpl: FetchLike;
  private readonly dispatcher?: unknown;

  constructor(cfg: CheckLeakedConfig) {
    if (!cfg.apiKey || !cfg.apiKey.trim()) {
      throw new CheckLeakedError('An api key is required. Get one at https://checkleaked.cc/botLinks');
    }
    const resolvedFetch = cfg.fetch ?? (globalThis.fetch as FetchLike | undefined);
    if (!resolvedFetch) {
      throw new CheckLeakedError('Global fetch is unavailable. Use Node 20+ or pass a `fetch` implementation.');
    }
    this.fetchImpl = resolvedFetch;
    this.dispatcher = cfg.dispatcher;
    this.baseUrl = (cfg.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.timeout = cfg.timeout ?? DEFAULT_TIMEOUT;
    this.maxRetries = cfg.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = cfg.retryDelayMs ?? DEFAULT_RETRY_DELAY;
    this.throwOnErrorBody = cfg.throwOnErrorBody !== false;
    this.defaultHeaders = {
      Accept: 'application/json',
      'api-key': cfg.apiKey,
      ...(cfg.userAgent ? { 'User-Agent': cfg.userAgent } : {}),
      ...(cfg.defaultHeaders ?? {}),
    };
  }

  async request<TResponse>(opts: RequestOptions): Promise<TResponse> {
    const url = this.baseUrl + normalizePath(opts.path) + buildQueryString(opts.query);
    const hasBody = opts.body !== undefined && opts.method !== 'GET';
    const headers: Record<string, string> = { ...this.defaultHeaders, ...(opts.headers ?? {}) };
    if (hasBody) headers['Content-Type'] = 'application/json';

    const allowRetry = opts.retry !== false;
    let attempt = 0;
    while (true) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeout);
      let res: Response;
      try {
        const init: RequestInit = {
          method: opts.method,
          headers,
          body: hasBody ? JSON.stringify(opts.body) : undefined,
          signal: controller.signal,
        };
        if (this.dispatcher) (init as Record<string, unknown>).dispatcher = this.dispatcher;
        res = await this.fetchImpl(url, init);
      } catch (raw) {
        clearTimeout(timer);
        const err = raw as Error;
        const isAbort = err?.name === 'AbortError';
        if (allowRetry && attempt < this.maxRetries) {
          await sleep(this.backoff(attempt));
          attempt++;
          continue;
        }
        throw new CheckLeakedNetworkError(isAbort ? `Request timed out after ${this.timeout}ms` : err?.message || 'Network error', err);
      } finally {
        clearTimeout(timer);
      }

      const data = await parseBody(res, opts.responseType);

      if (res.ok) {
        if (this.throwOnErrorBody && opts.responseType !== 'arraybuffer') {
          const msg = errorMessageFromBody(data);
          if (msg) throw errorFromResponse({ status: 0, body: data, path: opts.path, method: opts.method });
        }
        return data as TResponse;
      }

      const retryAfterMs = parseRetryAfter(res.headers);
      const apiErr = errorFromResponse({ status: res.status, body: data, path: opts.path, method: opts.method, retryAfterMs });
      const shouldRetry =
        allowRetry &&
        attempt < this.maxRetries &&
        (apiErr instanceof CheckLeakedRateLimitError || (res.status >= 500 && res.status < 600));
      if (shouldRetry) {
        const wait = apiErr instanceof CheckLeakedRateLimitError && apiErr.retryAfterMs ? apiErr.retryAfterMs : this.backoff(attempt);
        await sleep(wait);
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

function normalizePath(path: string): string {
  if (!path) return '';
  return path.charAt(0) === '/' ? path : '/' + path;
}

function buildQueryString(query?: Record<string, unknown>): string {
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

async function parseBody(res: Response, responseType?: RequestOptions['responseType']): Promise<unknown> {
  if (responseType === 'arraybuffer') return res.arrayBuffer();
  const text = await res.text();
  if (!text) return undefined;
  if (responseType === 'text') return text;
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
