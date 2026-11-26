/**
 * Typed error hierarchy for the CheckLeaked.cc SDK.
 *
 *   CheckLeakedError
 *   ├── CheckLeakedNetworkError       (DNS / connect / abort / timeout)
 *   └── CheckLeakedApiError           (HTTP response received, or `{ error }` body)
 *       ├── CheckLeakedAuthError      (401 / 403 / invalid api-key)
 *       ├── CheckLeakedValidationError (400 / 422)
 *       ├── CheckLeakedRateLimitError  (429, retry_after)
 *       └── CheckLeakedServerError    (5xx)
 *
 * Every method only ever throws a `CheckLeakedError` subclass, so callers can
 * `catch (e)` then narrow with `instanceof`.
 */

export class CheckLeakedError extends Error {
  public readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'CheckLeakedError';
    this.cause = cause;
    // Restore prototype chain (TS target < ES2015 / transpiled subclassing).
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class CheckLeakedNetworkError extends CheckLeakedError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'CheckLeakedNetworkError';
  }
}

export interface ApiErrorInit {
  message: string;
  status: number;
  body: unknown;
  path?: string;
  method?: string;
  cause?: unknown;
}

export class CheckLeakedApiError extends CheckLeakedError {
  /** HTTP status code (or 0 when the error came from an `{ error }` body on a 2xx response). */
  public readonly status: number;
  /**
   * Stable machine code when the API answered one (e.g. `worm_pro_required`,
   * `report_throttled`, `rate_limited`, `connect_expired`), otherwise undefined.
   */
  public readonly code?: string;
  /** Raw response body. */
  public readonly body: unknown;
  public readonly path?: string;
  public readonly method?: string;
  constructor(opts: ApiErrorInit) {
    super(opts.message, opts.cause);
    this.name = 'CheckLeakedApiError';
    this.status = opts.status;
    this.code = errorCodeFromBody(opts.body);
    this.body = opts.body;
    this.path = opts.path;
    this.method = opts.method;
  }
}

export class CheckLeakedAuthError extends CheckLeakedApiError {
  constructor(opts: ApiErrorInit) {
    super(opts);
    this.name = 'CheckLeakedAuthError';
  }
}

export class CheckLeakedValidationError extends CheckLeakedApiError {
  /** Field-level validation details when the API returns an array of errors. */
  public readonly details?: unknown;
  constructor(opts: ApiErrorInit) {
    super(opts);
    this.name = 'CheckLeakedValidationError';
    const body = opts.body as { error?: unknown; detail?: unknown } | undefined;
    this.details = (body && (body.error ?? body.detail)) || undefined;
  }
}

export class CheckLeakedRateLimitError extends CheckLeakedApiError {
  /** Suggested wait in milliseconds (parsed from `Retry-After`). */
  public readonly retryAfterMs?: number;
  constructor(opts: ApiErrorInit & { retryAfterMs?: number }) {
    super(opts);
    this.name = 'CheckLeakedRateLimitError';
    this.retryAfterMs = opts.retryAfterMs;
  }
}

export class CheckLeakedServerError extends CheckLeakedApiError {
  constructor(opts: ApiErrorInit) {
    super(opts);
    this.name = 'CheckLeakedServerError';
  }
}

/** Map an HTTP status + body to the most specific error subclass. */
export function errorFromResponse(opts: {
  status: number;
  body: unknown;
  path?: string;
  method?: string;
  retryAfterMs?: number;
  cause?: unknown;
}): CheckLeakedApiError {
  const message = extractMessage(opts.body) || `CheckLeaked API request failed with status ${opts.status}`;
  const base: ApiErrorInit = {
    message,
    status: opts.status,
    body: opts.body,
    path: opts.path,
    method: opts.method,
    cause: opts.cause,
  };
  if (opts.status === 401 || opts.status === 403) return new CheckLeakedAuthError(base);
  if (opts.status === 400 || opts.status === 422) return new CheckLeakedValidationError(base);
  if (opts.status === 429) return new CheckLeakedRateLimitError({ ...base, retryAfterMs: opts.retryAfterMs });
  if (opts.status >= 500) return new CheckLeakedServerError(base);
  // A 2xx `{ error: "<code>" }` envelope: narrow by the machine code when there is one.
  const code = errorCodeFromBody(opts.body);
  if (code) {
    if (AUTH_CODE.test(code)) return new CheckLeakedAuthError(base);
    if (RATE_CODE.test(code)) return new CheckLeakedRateLimitError({ ...base, retryAfterMs: opts.retryAfterMs });
    if (VALIDATION_CODE.test(code)) return new CheckLeakedValidationError(base);
  }
  return new CheckLeakedApiError(base);
}

const AUTH_CODE = /(^|_)(unauthorized|forbidden|pro_required|plan_required|expired)$/;
const RATE_CODE = /(^|_)(throttled|busy|quota|rate_limited)$/;
const VALIDATION_CODE = /(^|_)(no_subject|no_findings|too_large|invalid)$/;

/**
 * The machine code of an error envelope: `{ error: "worm_pro_required" }` →
 * `worm_pro_required`. Human sentences (spaces, capitals) are not codes.
 */
export function errorCodeFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  for (const v of [b.code, b.error]) {
    if (typeof v === 'string' && /^[a-z][a-z0-9_.-]{1,63}$/.test(v)) return v;
  }
  return undefined;
}

/**
 * CheckLeaked handlers frequently return HTTP 200 with a body of the shape
 * `{ error: "..." }` (or `{ error: [...] }` for validation) instead of a
 * non-2xx status. Detect that so the transport can surface a real error.
 */
export function errorMessageFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  const err = b.error;
  if (typeof err === 'string' && err.trim()) return err;
  if (Array.isArray(err) && err.length > 0) {
    const first = err[0] as Record<string, unknown>;
    if (first && typeof first.msg === 'string') return first.msg;
    return 'Validation failed';
  }
  return undefined;
}

function extractMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as Record<string, unknown>;
  if (typeof b.message === 'string' && b.message.trim()) return b.message;
  if (typeof b.error === 'string' && b.error.trim()) return b.error;
  if (typeof b.detail === 'string' && b.detail.trim()) return b.detail;
  if (Array.isArray(b.detail) && b.detail.length > 0) {
    const first = b.detail[0] as Record<string, unknown>;
    if (first && typeof first.msg === 'string') return first.msg;
  }
  if (Array.isArray(b.error) && b.error.length > 0) {
    const first = b.error[0] as Record<string, unknown>;
    if (first && typeof first.msg === 'string') return first.msg;
  }
  return undefined;
}
