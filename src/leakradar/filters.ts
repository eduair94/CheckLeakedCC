import type { LeakSearchFilters } from '../types';

/**
 * Repeatable LeakSearchFilters fields that the API requires to be arrays. The
 * SDK accepts a single value for ergonomics and wraps it here so callers don't
 * hit "Input should be a valid list" errors.
 */
const ARRAY_FIELDS: Array<keyof LeakSearchFilters> = [
  'username',
  'username_not',
  'password',
  'password_not',
  'url',
  'url_not',
  'url_domain',
  'url_domain_not',
  'url_host',
  'url_host_not',
  'username_hash',
  'password_hash',
  'url_scheme',
  'url_scheme_not',
  'url_port',
  'url_port_not',
  'url_tld',
  'url_tld_not',
  'email_domain',
  'email_domain_not',
  'email_host',
  'email_host_not',
  'email_tld',
  'email_tld_not',
];

/** Wrap scalar values of repeatable filter fields into single-element arrays. */
export function normalizeFilters(filters: LeakSearchFilters): LeakSearchFilters {
  const out: LeakSearchFilters = { ...filters };
  for (const key of ARRAY_FIELDS) {
    const v = (out as Record<string, any>)[key];
    if (v !== undefined && v !== null && !Array.isArray(v)) {
      (out as Record<string, any>)[key] = [v];
    }
  }
  return out;
}
