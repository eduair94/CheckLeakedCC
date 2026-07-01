import { CheckLeakedConfig, HttpClient, IHttpClient } from './http';
import { LeakRadarClient } from './leakradar/LeakRadarClient';
import { CoreResource } from './resources/CoreResource';
import { NativeTrackingResource } from './resources/TrackingResource';
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
  SearchResult,
  ValidResult,
} from './types';

/**
 * Official CheckLeaked.cc SDK client.
 *
 * ```ts
 * import CheckLeakedCC from 'checkleakedcc';
 *
 * const api = new CheckLeakedCC('YOUR-API-KEY');
 *
 * // classic search
 * await api.experimental('john@example.com', 'email');
 * await api.dehashed('john@example.com', 'email');
 *
 * // breach monitoring
 * await api.tracking.add('example.com', 'domain');
 *
 * // LeakRadar
 * await api.leakradar.domain.report('example.com');
 * ```
 *
 * Construct with just the key, or a config object for full control:
 * `new CheckLeakedCC({ apiKey, timeout, maxRetries, baseUrl, throwOnErrorBody })`.
 */
export class CheckLeakedCC {
  /** Underlying transport (exposed for advanced/custom requests). */
  public readonly http: IHttpClient;
  /** Core search endpoints (also surfaced directly on the client). */
  public readonly core: CoreResource;
  /** Breach monitoring — `tracking` (native) and `tracking.leakradar`. */
  public readonly tracking: NativeTrackingResource;
  /** The full LeakRadar integration. */
  public readonly leakradar: LeakRadarClient;

  constructor(config: string | CheckLeakedConfig) {
    const cfg: CheckLeakedConfig = typeof config === 'string' ? { apiKey: config } : config;
    this.http = new HttpClient(cfg);
    this.core = new CoreResource(this.http);
    this.tracking = new NativeTrackingResource(this.http);
    this.leakradar = new LeakRadarClient(this.http);
  }

  // -------------------------------------------------------------------------
  // Core search — surfaced at the top level for convenience & back-compat
  // -------------------------------------------------------------------------

  /** Validate the api-key; returns your plan. Throws `CheckLeakedAuthError` if invalid. */
  valid(): Promise<ValidResult> {
    return this.core.valid();
  }

  /** Lightweight auth smoke-test. */
  auth(): Promise<{ success: boolean; [k: string]: any }> {
    return this.core.auth();
  }

  /** LeakCheck.io breach lookup. */
  leakCheck(check: string, type: LeakCheckType = 'auto', opts?: LeakCheckOptions): Promise<SearchResult> {
    return this.core.leakCheck(check, type, opts);
  }

  /**
   * Dehashed search. The third argument accepts either a page number (legacy
   * v1 signature) or an options object.
   */
  dehashed(entry: string, type: DehashedType | string, pageOrOpts?: number | DehashedOptions): Promise<DehashedResult> {
    const opts: DehashedOptions = typeof pageOrOpts === 'number' ? { page: pageOrOpts } : pageOrOpts || {};
    return this.core.dehashed(entry, type, opts);
  }

  /** Snusbase "experimental" search. */
  experimental(entry: string, type: ExperimentalType | string, opts?: ExperimentalOptions): Promise<SearchResult> {
    return this.core.experimental(entry, type, opts);
  }

  /** Crack/reverse a password hash (pro/plus/unlock role). */
  crackHash(hash: string): Promise<CrackHashResult> {
    return this.core.crackHash(hash);
  }

  /** GHunt Google-account OSINT by email (pro/plus/unlock role). */
  ghunt(email: string): Promise<GhuntResult> {
    return this.core.ghunt(email);
  }

  /** IP geolocation + ASN + WHOIS. Omit `ip` for your own IP. */
  ip(ip?: string): Promise<IpLookupResult> {
    return this.core.ip(ip);
  }
}
