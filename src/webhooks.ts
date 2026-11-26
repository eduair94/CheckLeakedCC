/**
 * Receiver-side helpers for CheckLeaked tracking webhooks.
 *
 * Every delivery carries
 *   `X-CheckLeaked-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`
 * plus `X-CheckLeaked-Event` and `X-CheckLeaked-Delivery` (uuid). Verify over
 * the RAW request bytes — re-serialized JSON will not match.
 */
import { hmacSha256Hex, timingSafeEqualStr } from './crypto';

export const WEBHOOK_SIGNATURE_HEADER = 'x-checkleaked-signature';
export const WEBHOOK_EVENT_HEADER = 'x-checkleaked-event';
export const WEBHOOK_DELIVERY_HEADER = 'x-checkleaked-delivery';

export interface VerifyWebhookOptions {
  /** Max age of the `t=` timestamp in seconds (replay window). Default 300. Pass 0 to skip. */
  toleranceSeconds?: number;
  /** Override "now" (unix seconds), for tests. */
  now?: number;
}

/** Parse `t=…,v1=…[,v1=…]`. Returns null when malformed. */
export function parseWebhookSignature(header: string | null | undefined): { timestamp: number; signatures: string[] } | null {
  if (!header || typeof header !== 'string') return null;
  let timestamp = NaN;
  const signatures: string[] = [];
  for (const part of header.split(',')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === 't') timestamp = Number(v);
    else if (k === 'v1' && /^[0-9a-f]{64}$/i.test(v)) signatures.push(v.toLowerCase());
  }
  if (!Number.isFinite(timestamp) || signatures.length === 0) return null;
  return { timestamp, signatures };
}

/**
 * Verify a webhook delivery. Resolves `true` only when one `v1` signature
 * matches HMAC-SHA256(secret, "<t>.<rawBody>") and `t` is inside the
 * tolerance window.
 *
 * ```ts
 * app.post('/hook', express.raw({ type: '*\/*' }), async (req, res) => {
 *   const ok = await verifyWebhookSignature(process.env.CL_SECRET!, req.header('x-checkleaked-signature'), req.body);
 *   if (!ok) return res.sendStatus(401);
 *   const event = JSON.parse(req.body.toString('utf8'));
 *   res.sendStatus(204);
 * });
 * ```
 */
export async function verifyWebhookSignature(
  secret: string,
  signatureHeader: string | null | undefined,
  rawBody: string | Uint8Array,
  opts: VerifyWebhookOptions = {},
): Promise<boolean> {
  if (!secret) return false;
  const parsed = parseWebhookSignature(signatureHeader);
  if (!parsed) return false;
  const tolerance = opts.toleranceSeconds ?? 300;
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  if (tolerance > 0 && Math.abs(now - parsed.timestamp) > tolerance) return false;
  const body = typeof rawBody === 'string' ? new TextEncoder().encode(rawBody) : rawBody;
  const prefix = new TextEncoder().encode(`${parsed.timestamp}.`);
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix, 0);
  signed.set(body, prefix.length);
  const expected = await hmacSha256Hex(secret, signed);
  return parsed.signatures.some((sig) => timingSafeEqualStr(sig, expected));
}

/** Build a valid signature header for a body (for tests / local replay). */
export async function signWebhookPayload(secret: string, rawBody: string, timestamp = Math.floor(Date.now() / 1000)): Promise<string> {
  return `t=${timestamp},v1=${await hmacSha256Hex(secret, `${timestamp}.${rawBody}`)}`;
}
