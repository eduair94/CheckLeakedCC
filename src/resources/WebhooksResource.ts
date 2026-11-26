import { BaseResource } from './BaseResource';
import { unwrapEnvelope } from '../envelope';
import { errorFromResponse } from '../errors';
import { verifyWebhookSignature, type VerifyWebhookOptions } from '../webhooks';
import type { WebhookConfig, WebhookSetInput, WebhookSetResult, WebhookTestResult } from '../types';

/**
 * `client.webhooks` — the account's signed tracking webhook. Every finding from
 * your monitors (`client.tracking` and `client.tracking.leakradar`) is POSTed to
 * it as a `tracking.finding` event. Slack, Discord, Microsoft Teams and Google
 * Chat webhook URLs get a native rendering; any other HTTPS URL gets signed JSON.
 */
export class WebhooksResource extends BaseResource {
  /** The configured webhook, or `null` when none. The secret is never returned here. */
  async get(): Promise<WebhookConfig | null> {
    const res = unwrapEnvelope<{ webhook?: WebhookConfig | null }>(await this.http.request({ method: 'GET', path: '/webhook' }));
    return (res && res.webhook) || null;
  }

  /**
   * Create or update the webhook. The plaintext `secret` comes back ONLY on
   * create or when `rotate_secret: true` — store it then.
   */
  async set(input: WebhookSetInput): Promise<WebhookSetResult> {
    const res = await this.http.request({
      method: 'POST',
      path: '/webhook',
      body: { url: input.url, enabled: input.enabled, rotate_secret: input.rotate_secret, format: input.format },
      retry: false,
    });
    return unwrapEnvelope<WebhookSetResult>(res);
  }

  /**
   * Send one signed test event (single attempt; 5 per minute). A delivery the
   * endpoint rejected is a RESULT (`delivered: false`, `status`, `error`), not a
   * thrown error; only "no webhook configured" and auth problems throw.
   */
  async test(): Promise<WebhookTestResult> {
    const res = await this.http.request<WebhookTestResult & { success?: unknown }>({
      method: 'POST',
      path: '/webhook/test',
      body: {},
      retry: false,
      throwOnErrorBody: false,
    });
    if (res && typeof res === 'object' && typeof res.delivered === 'boolean') return res;
    // Not a delivery outcome: an `{ error }` envelope ("No webhook configured", …).
    throw errorFromResponse({ status: 0, body: res, path: '/webhook/test', method: 'POST' });
  }

  /** Delete the webhook: stops deliveries and discards the secret. */
  async delete(): Promise<{ removed: boolean; [k: string]: any }> {
    return unwrapEnvelope(await this.http.request({ method: 'POST', path: '/webhook/delete', body: {} }));
  }

  /** Alias for {@link delete}. */
  remove(): Promise<{ removed: boolean; [k: string]: any }> {
    return this.delete();
  }

  /** Verify an incoming delivery's `X-CheckLeaked-Signature` over the raw body. */
  verifySignature(
    secret: string,
    signatureHeader: string | null | undefined,
    rawBody: string | Uint8Array,
    opts?: VerifyWebhookOptions,
  ): Promise<boolean> {
    return verifyWebhookSignature(secret, signatureHeader, rawBody, opts);
  }
}

