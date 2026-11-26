/**
 * Several CheckLeaked controllers answer `{ success: <payload>, error: null }`
 * (`bSuccess`). Return the payload; anything else passes through untouched.
 */
export function unwrapEnvelope<T>(res: unknown): T {
  if (res && typeof res === 'object' && !Array.isArray(res)) {
    const r = res as Record<string, unknown>;
    const keys = Object.keys(r);
    const onlyEnvelopeKeys = keys.every((k) => k === 'success' || k === 'error' || k === 'status_code');
    if (onlyEnvelopeKeys && 'success' in r && r.error == null && r.success !== null && typeof r.success === 'object') {
      return r.success as T;
    }
  }
  return res as T;
}
