import { BaseResource } from './BaseResource';
import type {
  CrackHashResult,
  DehashedOptions,
  DehashedResult,
  DehashedType,
  ExperimentalOptions,
  ExperimentalType,
  GhuntResult,
  IpLookupResult,
  LeakCheckOptions,
  LeakCheckType,
  NameInsightResult,
  SearchResult,
  ValidResult,
  WhoisResult,
} from '../types';

/**
 * Core CheckLeaked.cc search endpoints (the classic bot-API surface):
 * key validation, Dehashed / Snusbase(experimental) / LeakCheck breach search,
 * hash cracking, GHunt Google-account OSINT, and IP geolocation.
 */
export class CoreResource extends BaseResource {
  /**
   * Validate the api-key. Returns the caller's plan and a Pong message.
   * Throws `CheckLeakedAuthError` if the key is rejected.
   */
  valid(): Promise<ValidResult> {
    return this.http.request<ValidResult>({ method: 'GET', path: '/valid' });
  }

  /** Lightweight auth smoke-test — resolves `{ success: true }` when the key is accepted. */
  auth(): Promise<{ success: boolean; [k: string]: any }> {
    return this.http.request({ method: 'GET', path: '/auth' });
  }

  /**
   * LeakCheck.io-backed breach lookup.
   * @param check the value to search (email, username, domain, phone, hash, …)
   * @param type  the search type (default `auto`)
   */
  leakCheck(check: string, type: LeakCheckType = 'auto', opts: LeakCheckOptions = {}): Promise<SearchResult> {
    return this.http.request<SearchResult>({
      method: 'GET',
      path: '/leak_check',
      query: {
        check,
        type,
        hideEntry: opts.hideEntry,
        sendEmail: opts.sendEmail,
        sendTelegram: opts.sendTelegram,
        sendDiscord: opts.sendDiscord,
      },
    });
  }

  /**
   * Dehashed-backed search.
   * @param entry the search term (4..50 chars)
   * @param type  the Dehashed field, or `free` to send `entry` as a raw query
   */
  dehashed(entry: string, type: DehashedType | string, opts: DehashedOptions = {}): Promise<DehashedResult> {
    return this.http.request<DehashedResult>({
      method: 'POST',
      path: '/dehashed',
      body: {
        entry,
        type,
        page: opts.page,
        wildcard: opts.wildcard,
        regex: opts.regex,
        enrichIps: opts.enrichIps,
      },
    });
  }

  /**
   * Snusbase-backed "experimental" search.
   * @param entry the search term (4..50 chars)
   * @param type  the Snusbase field to search
   */
  experimental(entry: string, type: ExperimentalType | string, opts: ExperimentalOptions = {}): Promise<SearchResult> {
    return this.http.request<SearchResult>({
      method: 'POST',
      path: '/experimental',
      body: {
        entry,
        type,
        wildcard: opts.wildcard,
        loadAll: opts.loadAll,
        enrichIps: opts.enrichIps,
      },
    });
  }

  /** Attempt to crack/reverse a password hash (requires pro/plus/unlock role). */
  crackHash(hash: string): Promise<CrackHashResult> {
    return this.http.request<CrackHashResult>({ method: 'POST', path: '/crack_hash', body: { hash } });
  }

  /** GHunt Google-account OSINT lookup by email (requires pro/plus/unlock role). */
  ghunt(email: string): Promise<GhuntResult> {
    return this.http.request<GhuntResult>({ method: 'GET', path: '/ghunt', query: { email } });
  }

  /**
   * IP geolocation + ASN + WHOIS lookup. Omit `ip` to look up the caller's own IP.
   * Note: this endpoint is public and does not consume credits.
   */
  ip(ip?: string): Promise<IpLookupResult> {
    return this.http.request<IpLookupResult>({ method: 'GET', path: '/ip', query: { ip } });
  }

  /** WHOIS / registration lookup for a domain: registrar, dates, name servers, status. */
  whois(domain: string): Promise<WhoisResult> {
    return this.http.request<WhoisResult>({ method: 'GET', path: '/domain-whois', query: { domain: domain.trim() } });
  }

  /** Gender, origin and meaning of a personal name (offline dictionary + Wikidata). Free, open route. */
  nameInsight(name: string, opts: { lang?: string } = {}): Promise<NameInsightResult> {
    return this.http.request<NameInsightResult>({
      method: 'GET',
      path: '/name/insight',
      query: { name: name.trim(), lang: opts.lang },
      base: 'site',
      auth: 'none',
    });
  }
}
