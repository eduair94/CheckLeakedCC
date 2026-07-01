import { BaseResource } from '../../resources/BaseResource';
import type { PasswordRangeQuery, PasswordRangeResponse, PwnedResult } from '../../types';

/**
 * `leakradar.password` — leaked-password intelligence via k-anonymity.
 */
export class PasswordResource extends BaseResource {
  /**
   * SHA-1 hash range lookup by hex prefix (min 5 chars). Free, cached 24h.
   * Mirrors the HIBP k-anonymity model.
   */
  range(query: PasswordRangeQuery): Promise<PasswordRangeResponse> {
    return this.http.request<PasswordRangeResponse>({
      method: 'GET',
      path: '/leakradar/password-range',
      query: { prefix: query.prefix, limit: query.limit, suffix_only: query.suffix_only, refresh: query.refresh },
    });
  }

  /**
   * Check whether a password has been seen in breaches. Pass a plaintext
   * password or a precomputed 40-char SHA-1 hex. The plaintext/hash is hashed
   * and range-queried; it is never sent whole or logged.
   */
  pwned(input: string | { password?: string; sha1?: string }): Promise<PwnedResult> {
    const body = typeof input === 'string' ? { password: input } : input;
    return this.http.request<PwnedResult>({ method: 'POST', path: '/leakradar/pwned', body });
  }
}
