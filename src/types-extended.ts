/**
 * Public types for the 2.1 surface: OSINT lookups, breach registry, news and
 * site info, k-anonymity checks, webhooks, private bots, Deep Search AI and
 * WormGPT. Re-exported from `./types`.
 */

// ===========================================================================
// OSINT lookups, breach registry, news & public site info
// ===========================================================================

/** WHOIS / registration record for a domain. Shape follows the upstream WHOIS source. */
export interface WhoisResult {
  domain?: string;
  registrar?: string;
  creationDate?: string;
  expirationDate?: string;
  updatedDate?: string;
  nameServers?: string[];
  status?: string[] | string;
  [k: string]: any;
}

/** One breach in the CheckLeaked registry (HIBP-compatible field names). */
export interface BreachRecord {
  id?: string;
  Name: string;
  Title?: string;
  Domain?: string;
  BreachDate?: string;
  AddedDate?: string;
  ModifiedDate?: string;
  PwnCount?: number;
  Description?: string;
  DataClasses?: string[];
  LogoPath?: string;
  IsVerified?: boolean;
  IsSensitive?: boolean;
  [k: string]: any;
}

/** Compact registry hit returned by the name/domain autocomplete. */
export interface BreachSearchHit {
  id?: string;
  Name: string;
  Domain?: string;
  LogoPath?: string;
  [k: string]: any;
}

export type BreachSortField = 'ModifiedDate' | 'BreachDate' | 'AddedDate' | 'PwnCount' | 'Name' | 'Domain';

export interface BreachSearchOptions {
  /** Free-text filter matched against name, domain and description. */
  search?: string;
  /** 1-based page (default 1). */
  page?: number;
  /** Rows per page, max 100 (default 20). */
  itemsPerPage?: number;
  sortBy?: BreachSortField | string;
  /** Sort descending (server default true). */
  sortDesc?: boolean;
  /** Language code for translated descriptions (cache-only). */
  lang?: string;
}

export interface BreachSearchResponse {
  items: BreachRecord[];
  total: number;
  [k: string]: any;
}

/** Gender / origin / meaning insight for a personal name. */
export interface NameInsightResult {
  query: string;
  lang?: string;
  found: boolean;
  given?: Record<string, any>;
  family?: Record<string, any>;
  [k: string]: any;
}

/** One CheckLeaked daily cybersecurity briefing. */
export interface NewsPost {
  date: string;
  title?: string;
  dek?: string;
  intro?: string;
  hashtags?: string[];
  imageUrl?: string;
  [k: string]: any;
}

export interface NewsListResponse {
  items: NewsPost[];
  [k: string]: any;
}

/** One plan as listed on the pricing page. */
export interface PlanInfo {
  role: string;
  name: string;
  lookups: number;
  priceUSD: number;
  durationDays: number;
  tracking: number;
  types: string;
  cooldown?: number;
  [k: string]: any;
}

export interface ChangelogEntry {
  key: string;
  date: string;
  kind: 'added' | 'improved' | 'fixed' | string;
  area?: string;
  title: string;
  body?: string;
  reportedByUsers?: boolean;
  [k: string]: any;
}

export interface ChangelogResponse {
  items: ChangelogEntry[];
  page: number;
  limit: number;
  total: number;
}

export interface FaqEntry {
  q: string;
  a: string;
}

export interface SiteStats {
  searches: number;
  pwnCount: string | number;
  [k: string]: any;
}

// ===========================================================================
// k-anonymity checks (hashed locally, only a prefix leaves the process)
// ===========================================================================

export interface PwnedPasswordResult {
  pwned: boolean;
  /** Times the password was seen in breaches (0 when not found). */
  count: number;
  /** The 5-char SHA-1 prefix that was sent. */
  prefix: string;
}

export interface EmailBreachTeaser {
  success?: boolean;
  /** Number of breach sources (0 when none). */
  found: number | boolean;
  sources: Array<string | Record<string, any>>;
  fields: string[];
  [k: string]: any;
}

// ===========================================================================
// Tracking webhooks
// ===========================================================================

export type WebhookFormat = 'auto' | 'json' | 'slack' | 'discord' | 'teams' | 'google_chat';

export interface WebhookConfig {
  url: string;
  enabled: boolean;
  format?: Exclude<WebhookFormat, 'auto'>;
  /** Last 4 chars of the signing secret. */
  secret_hint?: string;
  fail_count?: number;
  last_status?: number | null;
  last_error?: string | null;
  last_attempt?: string | null;
  last_success?: string | null;
  [k: string]: any;
}

export interface WebhookSetInput {
  /** HTTPS destination on a public host. */
  url: string;
  enabled?: boolean;
  /** Issue a new signing secret (returned once, in this response). */
  rotate_secret?: boolean;
  /** Delivery shape; `auto` (default) detects Slack / Discord / Teams / Google Chat from the URL. */
  format?: WebhookFormat;
}

export interface WebhookSetResult {
  webhook?: WebhookConfig;
  /** Plaintext signing secret — present ONLY on create or rotate. Store it now. */
  secret?: string;
  [k: string]: any;
}

export interface WebhookTestResult {
  delivered: boolean;
  status?: number | null;
  error?: string | null;
  duration_ms?: number;
  [k: string]: any;
}

/** The JSON body of a generic (`json` format) `tracking.finding` delivery. */
export interface WebhookFindingEvent {
  event?: 'tracking.finding' | string;
  test?: boolean;
  [k: string]: any;
}

// ===========================================================================
// Private bots (bring your own Discord / Telegram token, Pro/Plus)
// ===========================================================================

export type PrivateBotPlatform = 'discord' | 'telegram';

export interface PrivateBot {
  platform: PrivateBotPlatform;
  state: 'stopped' | 'starting' | 'online' | 'error' | string;
  enabled: boolean;
  bot_username?: string | null;
  bot_id?: string | null;
  token_hint?: string | null;
  last_error?: string | null;
  last_started?: string | null;
  invite_url?: string | null;
  [k: string]: any;
}

export interface PrivateBotsList {
  bots: PrivateBot[];
  plan_ok: boolean;
  configured: boolean;
  max_per_platform: number;
  [k: string]: any;
}

export interface PrivateBotSetInput {
  platform: PrivateBotPlatform;
  /** Bot token (validated, stored encrypted, never returned). Omit to only pause/resume. */
  token?: string;
  enabled?: boolean;
}

// ===========================================================================
// Deep Search AI: structured dossier + WormGPT investigation
// ===========================================================================

/** Findings handed to the AI as grounding. Rows are the raw search results per engine. */
export interface DeepReportFindings {
  engines?: string[];
  leakcheck?: Record<string, any>[];
  hibp?: Record<string, any>[];
  experimental?: Record<string, any>[];
  dehashed?: Record<string, any>[];
  raw?: Record<string, any>[];
  rawCredentials?: Array<{
    url?: string;
    username?: string;
    password?: string;
    is_hash?: boolean;
    algorithm?: string;
    recovered?: string;
    file?: string;
  }>;
  enrichment?: {
    google?: Record<string, any>[];
    whatsapp?: Record<string, any>[];
    ip?: Record<string, any>[];
    address?: Record<string, any>[];
    osint?: Record<string, any>[];
  };
  pivots?: Array<{ term?: string; type?: string; hop?: number; via?: string; from?: string; records?: number }>;
}

export interface DeepReportInput extends DeepReportFindings {
  /** The searched subject (email, username, domain, phone…). */
  term: string;
  type?: string;
}

/** The structured dossier (same shape the web `/deepSearch` page and its PDF use). */
export interface DeepReportData {
  executive_summary?: string;
  risk?: { score?: number; level?: 'low' | 'medium' | 'high' | 'critical'; rationale?: string };
  identity?: {
    emails?: string[];
    usernames?: string[];
    names?: string[];
    phones?: string[];
    addresses?: string[];
    ip_addresses?: string[];
  };
  credentials?: Record<string, any>;
  password_analysis?: string;
  exposed_data_categories?: string[];
  breaches?: Array<{ name: string; note?: string }>;
  correlations?: string[];
  attack_scenarios?: string[];
  recommendations?: string[];
  confidence?: 'low' | 'medium' | 'high';
  [k: string]: any;
}

export interface DeepReportMeta {
  term: string;
  type?: string;
  engines?: string[];
  total_records?: number;
  pivots?: unknown[];
  generatedAt: string;
  [k: string]: any;
}

export interface DeepReportResponse {
  success: true;
  report: DeepReportData;
  meta: DeepReportMeta;
}

export interface InvestigationSource {
  title?: string;
  url: string;
  [k: string]: any;
}

export interface DeepReportPdfInput {
  report: DeepReportData;
  meta?: DeepReportMeta | Record<string, any>;
  /** Optional WormGPT investigation (markdown + sources) appended to the PDF. */
  investigation?: { markdown: string; sources?: InvestigationSource[] } | Record<string, any>;
}

export interface AiCallOptions {
  /** Request timeout override (ms). */
  timeout?: number;
  signal?: AbortSignal;
}

export interface InvestigateOptions extends AiCallOptions {
  /** Subject type hint (email, username, domain, phone, ip, name…). */
  type?: string;
  /** Findings you already hold, passed as grounding so the dossier cross-references them. */
  findings?: DeepReportFindings;
}

export interface InvestigationResponse {
  success: true;
  report: { markdown: string; sources: InvestigationSource[] };
  meta: DeepReportMeta & { provider?: string };
}

// ===========================================================================
// WormGPT (OpenAI-compatible proxy at wormgpt.checkleaked.com)
// ===========================================================================

export type WormModelId =
  | 'wormv-auto'
  | 'wormv6.2'
  | 'wormv6.1'
  | 'wormv6'
  | 'wormv5.2'
  | 'wormv5.1'
  | 'wormv5.0'
  | 'worm-coder'
  | 'wormv4.5'
  | 'wormv4.3'
  | 'wormv4.1'
  | 'wormv4.0';

export type WormContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } | string }
  | Record<string, any>;

export interface WormChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | WormContentPart[];
  /** Attach an image to this message (URL or data: URI). */
  image_url?: string;
  /** Attach a text document to this message. */
  file_content?: string;
  file_name?: string;
  [k: string]: any;
}

export interface WormChatOptions {
  /** Model id (see `wormgpt.models()`); server default `wormv5.2`. Unknown ids fall back silently. */
  model?: WormModelId | (string & {});
  /**
   * Run the agent loop: the model may call web search / fetch and the CheckLeaked
   * leak & OSINT tools (dehashed, leak_check, leakradar, ghunt, whois, dns…) itself.
   */
  tools_enabled?: boolean;
  web_search_enabled?: boolean;
  thinking_enabled?: boolean;
  /** Strip `<think>` blocks from the answer (defaults to `!thinking_enabled`). */
  strip_think?: boolean;
  memory_enabled?: boolean;
  data_consent?: boolean;
  /** Answer language hint. */
  language?: string;
  /** OpenAI-style function tools (emulated `tool_calls`). */
  tools?: Array<Record<string, any>>;
  tool_emulation?: boolean;
  /** Request timeout override (ms). Agent runs can take minutes; default 300000. */
  timeout?: number;
  signal?: AbortSignal;
  /** Any extra body fields, forwarded verbatim. */
  extra?: Record<string, unknown>;
}

export interface WormChatRequest extends WormChatOptions {
  messages: WormChatMessage[];
}

export interface WormToolResult {
  tool: string;
  arguments?: Record<string, any>;
  success: boolean;
  result?: unknown;
  error?: string | null;
}

export interface WormChatCompletion {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: { role: 'assistant'; content: string; tool_calls?: Array<Record<string, any>> };
    finish_reason: string | null;
  }>;
  usage?: Record<string, number>;
  /** Present when the agent loop ran tools. */
  tool_results?: WormToolResult[];
  [k: string]: any;
}

/** One event from `wormgpt.stream()`. */
export type WormStreamEvent =
  | { type: 'content'; delta: string }
  | { type: 'thinking'; iteration?: number; raw: Record<string, any> }
  | { type: 'tool_start'; tool: string; arguments?: Record<string, any>; raw: Record<string, any> }
  | { type: 'tool_end'; tool: string; success: boolean; result?: unknown; error?: string | null; raw: Record<string, any> }
  | { type: 'status'; raw: Record<string, any> }
  | { type: 'done'; finish_reason?: string | null };

export interface WormModel {
  id: string;
  object: 'model';
  created?: number;
  owned_by?: string;
}

export interface WormToolParameter {
  name: string;
  type: string;
  description?: string;
  required?: boolean;
  enum?: string[] | null;
}

export interface WormToolInfo {
  name: string;
  description: string;
  parameters?: WormToolParameter[];
  [k: string]: any;
}

/** Your WormGPT daily quota (role-based: Pro 250 / Plus 100, resets at 00:00 UTC). */
export interface WormUsage {
  dailyLimit?: number;
  todayUsage?: number;
  dailyRemaining?: number;
  label?: string;
  provider?: string;
  [k: string]: any;
}
