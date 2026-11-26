import { CheckLeakedConfig, HttpClient } from './http';
import { LeakRadarClient } from './leakradar/LeakRadarClient';
import { McpResource } from './mcp/McpResource';
import { AiResource } from './resources/AiResource';
import { BreachesResource } from './resources/BreachesResource';
import { CoreResource } from './resources/CoreResource';
import { KanonResource } from './resources/KanonResource';
import { PrivateBotsResource } from './resources/PrivateBotsResource';
import { NewsResource, SiteResource } from './resources/SiteResource';
import { NativeTrackingResource } from './resources/TrackingResource';
import { WebhooksResource } from './resources/WebhooksResource';
import { WormGPTClient } from './wormgpt/WormGPTClient';
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
} from './types';

/** Env var read by {@link CheckLeakedCC.fromEnv} and the bundled MCP server. */
export const API_KEY_ENV = 'CHECKLEAKED_API_KEY';

/**
 * Official CheckLeaked.cc SDK client.
 *
 * ```ts
 * import CheckLeakedCC from 'checkleakedcc';
 *
 * const api = new CheckLeakedCC('YOUR-API-KEY');
 *
 * await api.experimental('john@example.com', 'email');   // breach search
 * await api.tracking.add('example.com', 'domain');       // monitoring
 * await api.leakradar.domain.report('example.com');      // LeakRadar
 * await api.wormgpt.ask('Summarize CVE-2024-3094');      // WormGPT
 * await api.ai.investigate('john@example.com');          // AI OSINT dossier
 * api.mcp.anthropicTools();                              // MCP / tool use
 * ```
 *
 * Construct with just the key, or a config object for full control:
 * `new CheckLeakedCC({ apiKey, timeout, maxRetries, baseUrl, throwOnErrorBody })`.
 */
export class CheckLeakedCC {
  /** Underlying transport (exposed for advanced/custom requests). */
  public readonly http: HttpClient;
  /** Core search endpoints (also surfaced directly on the client). */
  public readonly core: CoreResource;
  /** Breach monitoring — `tracking` (native) and `tracking.leakradar`. */
  public readonly tracking: NativeTrackingResource;
  /** The full LeakRadar integration. */
  public readonly leakradar: LeakRadarClient;
  /** Signed tracking webhook (Slack / Discord / Teams / Google Chat / JSON). */
  public readonly webhooks: WebhooksResource;
  /** Your own Discord / Telegram bot running the CheckLeaked commands (Pro / Plus). */
  public readonly privateBots: PrivateBotsResource;
  /** Public breach registry (free). */
  public readonly breaches: BreachesResource;
  /** Daily cybersecurity briefing (free). */
  public readonly news: NewsResource;
  /** Plans, FAQ, changelog, stats (free). */
  public readonly site: SiteResource;
  /** Free k-anonymity password / email checks — the secret never leaves the process. */
  public readonly kanon: KanonResource;
  /** Deep Search AI: WormGPT investigation + structured dossier + PDF (Pro). */
  public readonly ai: AiResource;
  /** WormGPT chat (OpenAI-compatible), streaming, agent tools, quota. */
  public readonly wormgpt: WormGPTClient;
  /** MCP: hosted-server client, tool catalog, local stdio server, client configs. */
  public readonly mcp: McpResource;

  constructor(config: string | CheckLeakedConfig) {
    const cfg: CheckLeakedConfig = typeof config === 'string' ? { apiKey: config } : config;
    this.http = new HttpClient(cfg);
    this.core = new CoreResource(this.http);
    this.tracking = new NativeTrackingResource(this.http);
    this.leakradar = new LeakRadarClient(this.http);
    this.webhooks = new WebhooksResource(this.http);
    this.privateBots = new PrivateBotsResource(this.http);
    this.breaches = new BreachesResource(this.http);
    this.news = new NewsResource(this.http);
    this.site = new SiteResource(this.http);
    this.kanon = new KanonResource(this.http);
    this.ai = new AiResource(this.http);
    this.wormgpt = new WormGPTClient(this.http);
    this.mcp = new McpResource(this, this.http);
  }

  /**
   * Build a client from `process.env.CHECKLEAKED_API_KEY`. With no key set,
   * returns a keyless client (free tools only) when `allowMissingApiKey` is true,
   * otherwise throws.
   */
  static fromEnv(overrides: Omit<CheckLeakedConfig, 'apiKey'> = {}): CheckLeakedCC {
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env || {};
    return new CheckLeakedCC({ ...overrides, apiKey: env[API_KEY_ENV] || env.CHECKLEAKED_KEY || '' });
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

  /** WHOIS / registration lookup for a domain. */
  whois(domain: string): Promise<WhoisResult> {
    return this.core.whois(domain);
  }

  /** Gender / origin / meaning insight for a personal name (free). */
  nameInsight(name: string, opts?: { lang?: string }): Promise<NameInsightResult> {
    return this.core.nameInsight(name, opts);
  }
}
