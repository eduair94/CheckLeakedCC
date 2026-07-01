/**
 * Hand-rolled, intentionally-lean type definitions for the CheckLeaked.cc SDK.
 *
 * Response shapes come from real breach data whose fields vary by source, so
 * every response interface carries an index signature (`[k: string]: any`).
 * You get autocomplete for the well-known fields while still being able to read
 * anything the API returns. Request/option types are stricter to guide callers.
 */

// ---------------------------------------------------------------------------
// Shared
// ---------------------------------------------------------------------------

/** Generic paginated envelope used by most LeakRadar list endpoints. */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  [k: string]: any;
}

export type ExportFormat = 'csv' | 'json';
export type RemediationStatus = 'new' | 'in_progress' | 'fixed' | 'accepted_risk';
export type SortOrder = 'asc' | 'desc';
export type RawExportTarget = 'rows' | 'parts';

/** Reference to a queued background task (async unlock / clear). */
export interface QueuedTask {
  task_id: string;
  [k: string]: any;
}

/** Status of a background task; poll with `leakradar.tasks.status` / `.wait`. */
export interface TaskStatus {
  completed?: boolean;
  running?: boolean;
  [k: string]: any;
}

/** Scheduled export job response. */
export interface ExportJob {
  status?: string;
  message?: string;
  export_id?: string | number;
  [k: string]: any;
}

// ---------------------------------------------------------------------------
// Core — CheckLeaked native search
// ---------------------------------------------------------------------------

/** Result of the ping/validity check (`client.valid()`). */
export interface ValidResult {
  plan?: string;
  success?: boolean;
  message?: string;
  time?: string;
  [k: string]: any;
}

/** Snusbase field values accepted by `client.experimental()`. */
export type ExperimentalType = 'username' | 'email' | 'lastip' | 'password' | 'name' | 'hash' | 'domain' | 'mass' | 'crack_hash';

/** Dehashed field values accepted by `client.dehashed()`. `free` sends the raw query untouched. */
export type DehashedType =
  | 'email'
  | 'username'
  | 'password'
  | 'hashed_password'
  | 'name'
  | 'address'
  | 'phone'
  | 'ip_address'
  | 'vin'
  | 'domain'
  | 'free';

/** LeakCheck.io search types accepted by `client.leakCheck()`. */
export type LeakCheckType =
  | 'auto'
  | 'email'
  | 'username'
  | 'keyword'
  | 'domain'
  | 'phone'
  | 'hash'
  | 'password'
  | 'origin'
  | 'phash'
  | 'free';

export interface ExperimentalOptions {
  /** Enable wildcard/partial matching. */
  wildcard?: boolean;
  /** Bulk-load all truncated `moreInfo` and merge into results (pro/plus only). */
  loadAll?: boolean;
  /** Attach IP geolocation to each result's last IP. */
  enrichIps?: boolean;
}

export interface DehashedOptions {
  /** Result page (default 1). */
  page?: number;
  /** Enable wildcard matching. */
  wildcard?: boolean;
  /** Enable regex matching (wildcard takes precedence if both set). */
  regex?: boolean;
  /** Attach IP geolocation to each result's `ip_address`. */
  enrichIps?: boolean;
}

export interface LeakCheckOptions {
  /** Do not save the search to "My Searches". */
  hideEntry?: boolean;
  sendEmail?: boolean;
  sendTelegram?: boolean;
  sendDiscord?: boolean;
}

/** A leak source descriptor attached to search results. */
export interface LeakSource {
  Name?: string;
  Leak?: string;
  Domain?: string;
  BreachDate?: string;
  DataClasses?: string[];
  Sources?: string[];
  Linked?: { unkown?: boolean; dehashed?: boolean; leakCheck?: boolean; hbwPwned?: boolean; [k: string]: any };
  extra?: Record<string, any> | null;
  [k: string]: any;
}

/** One matched line in a LeakCheck / experimental result set. */
export interface SearchResultLine {
  line?: string;
  email?: string;
  username?: string;
  password?: string;
  last_breach?: string;
  sources?: LeakSource[];
  lastBreach?: LeakSource | Record<string, any>;
  [k: string]: any;
}

/** Generic breach-search response (experimental / leak_check). */
export interface SearchResult {
  success?: boolean | null;
  /** Number of breaches found. */
  found?: number;
  /** Number of breaches that included a password. */
  foundWithPass?: number;
  results?: SearchResultLine[];
  fields?: Array<Record<string, any>>;
  /** Register-row id of the saved search (leak_check). */
  id?: number;
  /** Shareable result link (experimental). */
  link?: string;
  /** Present when the search failed server-side. */
  error?: string;
  [k: string]: any;
}

/** A single Dehashed entry (fields vary widely by source database). */
export interface DehashedEntry {
  id?: string;
  email?: string;
  username?: string;
  password?: string;
  hashed_password?: string;
  name?: string;
  address?: string;
  phone?: string;
  ip_address?: string;
  url?: string;
  database_name?: string;
  obtained_from?: string;
  source?: LeakSource;
  [k: string]: any;
}

/** Dehashed search response. */
export interface DehashedResult {
  entries?: Array<{ entry: DehashedEntry; [k: string]: any }>;
  /** Total number of matched entries. */
  results?: number;
  /** Total number of result pages. */
  pages?: number;
  /** Current page. */
  page?: number;
  urlSearch?: string;
  error?: string;
  [k: string]: any;
}

/** Cracked-hash result — the reversed plaintext for a hash, when found. */
export interface CrackHashResult {
  hash?: string;
  plain?: string;
  hexplain?: string;
  algorithm?: string;
  found?: boolean;
  error?: string;
  [k: string]: any;
}

/** IP geolocation + ASN + WHOIS lookup result. */
export interface IpLookupResult {
  ip?: string;
  ipNo?: string;
  countryShort?: string;
  countryLong?: string;
  region?: string;
  city?: string;
  zipCode?: string;
  latitude?: number;
  longitude?: number;
  timeZone?: string;
  address?: Record<string, any>;
  asn?: { start_ip?: string; end_ip?: string; asn?: string; name?: string; domain?: string; [k: string]: any };
  whois?: Record<string, any>;
  [k: string]: any;
}

/** GHunt Google-account OSINT profile. */
export interface GhuntResult {
  PROFILE_CONTAINER?: {
    profile?: Record<string, any>;
    maps?: Record<string, any>;
    play_games?: any;
    calendar?: any;
    [k: string]: any;
  };
  error?: string;
  [k: string]: any;
}

// ---------------------------------------------------------------------------
// Tracking
// ---------------------------------------------------------------------------

export type TrackingNativeType = 'login' | 'email' | 'domain';
export type TrackingLeakRadarType = 'domain' | 'raw';

export interface TrackingLimit {
  limit: number;
  total: number;
  [k: string]: any;
}

export interface TrackingEntry {
  entry?: string;
  type?: string;
  /** Unique id of this entry — pass to `remove()` to stop monitoring it. */
  email_unique_id?: string;
  user_unique_id?: string;
  status?: number;
  creation_date?: string;
  modification_date?: string | null;
  last_check?: string;
  last_result_date?: string;
  /** JSON-encoded string array of recent change descriptions. */
  changes?: string;
  tsr_id?: number | string;
  [k: string]: any;
}

export interface TrackingHistoryItem {
  found?: number;
  changes?: any;
  creation_date?: string;
  [k: string]: any;
}

export interface TrackingHistoryResult {
  id?: string;
  entry?: string;
  type?: string;
  creation_date?: string;
  found?: number;
  result?: any;
  changes?: string[];
  [k: string]: any;
}

// ---------------------------------------------------------------------------
// LeakRadar — core leak DTOs
// ---------------------------------------------------------------------------

export interface LeakDetails {
  id?: string | number;
  url?: string;
  username?: string | null;
  /** Masked identifier shown while a row is still locked (e.g. `te●●●@x.com`). */
  username_masked?: string;
  password?: string | null;
  /** Numeric strength score (0..10). */
  password_strength?: number;
  unlocked?: boolean;
  is_email?: boolean;
  added_at?: string;
  status?: RemediationStatus | null;
  [k: string]: any;
}

export interface UnlockedLeakDetails extends LeakDetails {
  unlocked_at?: string;
  auto_unlocked?: boolean;
  auto_unlocked_by?: string | null;
  comment?: string | null;
  list_id?: number | null;
}

/**
 * Advanced filter body for `leakradar.advanced.*`, `unlocked.advanced` and the
 * various advanced exports. Every field is optional; repeatable fields accept a
 * single value or an array.
 */
export interface LeakSearchFilters {
  username?: string | string[];
  username_not?: string | string[];
  password?: string | string[];
  password_not?: string | string[];
  url?: string | string[];
  url_not?: string | string[];
  url_domain?: string | string[];
  url_domain_not?: string | string[];
  url_host?: string | string[];
  url_host_not?: string | string[];
  username_hash?: string | string[];
  password_hash?: string | string[];
  url_scheme?: string | string[];
  url_scheme_not?: string | string[];
  url_port?: number | number[];
  url_port_not?: number | number[];
  url_tld?: string | string[];
  url_tld_not?: string | string[];
  is_email?: boolean | null;
  email_domain?: string | string[];
  email_domain_not?: string | string[];
  email_host?: string | string[];
  email_host_not?: string | string[];
  email_tld?: string | string[];
  email_tld_not?: string | string[];
  password_strength?: 'too_weak' | 'weak' | 'medium' | 'strong';
  added_from?: string;
  added_to?: string;
  force_and?: boolean;
  [k: string]: any;
}

// Email search
export interface EmailSearchOptions {
  /** Restrict to matches where the identifier is an email (`true`), a username (`false`), or both (`null`, default). */
  is_email?: boolean | null;
  /** Free-text filter within the matched leaks. */
  search?: string | null;
  page?: number;
  /** 1..100 (clamped to 50 when auto_unlock is on). */
  page_size?: number;
  /** Auto-unlock the current page (consumes credits). Defaults ON server-side. */
  auto_unlock?: boolean;
  /** Bypass the 30-minute lookup cache. */
  refresh?: boolean;
}

export interface EmailUnlockOptions {
  is_email?: boolean | null;
  search?: string | null;
  /** Cap the number of items unlocked. */
  max?: number;
}

export interface EmailSearchResponse extends Paginated<LeakDetails> {
  total_unlocked?: number;
  blacklisted_value?: string;
  auto_unlock_points_consumed?: number;
}

export interface EmailMassResult {
  value?: string;
  exists?: boolean;
  locked?: number;
  total?: number;
  unlocked?: number;
  [k: string]: any;
}

export interface EmailMassResponse {
  results: EmailMassResult[];
  [k: string]: any;
}

// Domain
export type DomainBucket = 'employees' | 'customers' | 'third_parties';
export type DomainBucketWithAll = DomainBucket | 'all';

export interface DomainSummaryOptions {
  /** Skip the password-strength breakdown for a faster response. */
  light?: boolean;
  /** Include the `searched_by_count` field. */
  include_search_count?: boolean;
  refresh?: boolean;
}

export interface DomainListOptions {
  page?: number;
  page_size?: number;
  search?: string;
  auto_unlock?: boolean;
  refresh?: boolean;
}

export interface DomainOccurrencesOptions {
  page?: number;
  page_size?: number;
  search?: string;
  refresh?: boolean;
}

export interface DomainSummaryResponse {
  employees_compromised?: number;
  customers_compromised?: number;
  third_parties_compromised?: number;
  searched_by_count?: number;
  blacklisted_value?: string | null;
  [k: string]: any;
}

export interface DomainReport {
  domain: string;
  summary?: DomainSummaryResponse;
  employees?: Paginated<LeakDetails>;
  customers?: Paginated<LeakDetails>;
  third_parties?: Paginated<LeakDetails>;
  subdomains?: Paginated<Record<string, any>>;
  urls?: Paginated<Record<string, any>>;
  _errors?: Record<string, string>;
  [k: string]: any;
}

// Advanced
export interface AdvancedSearchOptions {
  page?: number;
  page_size?: number;
}

export interface AdvancedUnlockOptions {
  max?: number;
}

// Raw search
export interface RawSearchRequest {
  /** Full-text query. If empty, provide at least one of container_id/exts/categories/file_name. */
  q?: string | null;
  container_id?: number | null;
  exts?: string[] | null;
  exts_not?: string[] | null;
  categories?: string[] | null;
  categories_not?: string[] | null;
  file_name?: string[] | null;
  file_name_not?: string[] | null;
  force_and?: boolean | null;
  ingested_at_min?: string | null;
  ingested_at_max?: string | null;
  [k: string]: any;
}

export interface RawSearchOptions {
  page?: number;
  page_size?: number;
  cursor?: string;
  auto_unlock?: boolean;
  refresh?: boolean;
}

export interface RawSearchResponse extends Paginated<Record<string, any>> {
  has_more?: boolean;
  next_cursor?: string;
  blacklisted_value?: string;
  auto_unlock_points_consumed?: number;
}

export interface RawPartsQuery {
  container_id: number;
  entry_path: string;
  page?: number;
  page_size?: number;
  refresh?: boolean;
}

export interface RawPartQuery {
  container_id: number;
  entry_path: string;
  seq: number;
  trim_overlap?: boolean;
  overlap_chars?: number;
  auto_unlock?: boolean;
}

// Container
export interface ContainerTreeQuery {
  container_id: number;
  prefix?: string;
  page?: number;
  page_size?: number;
}

export interface ContainerFileInfoQuery {
  container_id: number;
  entry_path: string;
}

export interface ResolvePathRequest {
  container_id: number;
  entry_path?: string;
  options?: {
    prefetch_files?: boolean;
    max_subfolders?: number;
    file_page_size?: number;
    prefetch_parts?: { seq: number; limit?: number };
    [k: string]: any;
  } | null;
  [k: string]: any;
}

// Raw files
export interface RawDownloadQuery {
  sha256_original?: string;
  container_id?: number;
  entry_path?: string;
  expires_in?: number;
}

export interface RawDownloadPreviewQuery {
  sha256_original?: string;
  container_id?: number;
  entry_path?: string;
}

// Password range / pwned
export interface PasswordRangeQuery {
  /** SHA-1 hex prefix, minimum 5 chars. */
  prefix: string;
  /** Max items returned. */
  limit?: number;
  /** Return only the hash suffixes instead of full hashes. */
  suffix_only?: boolean;
  refresh?: boolean;
}

export interface PasswordRangeResponse {
  prefix?: string;
  total?: number;
  /** Matching hashes (or suffixes when `suffix_only` was requested) with observed counts. */
  hashes?: Array<{ hash?: string; suffix?: string; count?: number; [k: string]: any }>;
  [k: string]: any;
}

export interface PwnedResult {
  pwned: boolean;
  count: number;
  [k: string]: any;
}

// Cross-source
export interface CrossSourceCheckInput {
  email?: string;
  domain?: string;
}

export interface CrossSourceCheckResponse {
  email?: EmailSearchResponse | null;
  domain?: DomainSummaryResponse | null;
  dark_web?: DarkWebSearchResponse | null;
  totals?: { email?: number; domain?: number; dark_web?: number; aggregate?: number };
  [k: string]: any;
}

// Unlocked archive
export interface UnlockedListOptions {
  page?: number;
  page_size?: number;
  search?: string;
  is_email?: boolean | null;
  status?: RemediationStatus;
}

export interface UnlockedExportOptions {
  search?: string | null;
  is_email?: boolean | null;
  unlocked_at_min?: string | null;
  format?: ExportFormat;
}

export interface BulkStatusInput {
  leak_ids: Array<string | number>;
  target_status: RemediationStatus;
  search?: string | null;
  is_email?: boolean | null;
  list_id_filter?: number | null;
  list_none?: boolean | null;
  status_filter?: RemediationStatus | null;
  filters?: LeakSearchFilters | null;
}

export interface BulkAssignInput {
  leak_ids: Array<string | number>;
  target_list_id: number | null;
  search?: string | null;
  is_email?: boolean | null;
  list_id_filter?: number | null;
  list_none?: boolean | null;
  filters?: LeakSearchFilters | null;
}

// Lists
export interface UnlockedList {
  id: number;
  name: string;
  color?: string | null;
  created_at?: string;
  updated_at?: string;
  items_count?: number;
  [k: string]: any;
}

export interface UnlockedListCreateInput {
  name: string;
  color?: string | null;
}

export interface UnlockedListUpdateInput {
  name?: string | null;
  color?: string | null;
}

// Notifications
export type NotificationMethodType = 'email' | 'webhook' | 'telegram' | 'discord' | 'slack' | string;

export interface NotificationMethodInput {
  type: NotificationMethodType;
  value: string;
  [k: string]: any;
}

export interface NotificationMethod {
  id: number;
  type: string;
  value?: string;
  second_value?: string;
  headers?: any;
  extra_emails?: string[] | null;
  timestamp?: string;
  [k: string]: any;
}

export interface NotificationInput {
  type: string;
  value: string;
  method_id?: number;
  second_type?: string;
  auto_unlock?: boolean;
  max_points?: number;
  bulk?: boolean;
  [k: string]: any;
}

export interface Notification {
  id: number;
  type: string;
  value?: string;
  second_type?: string;
  method_id?: number;
  method_type?: string;
  method_value?: string;
  filters?: LeakSearchFilters | null;
  is_active?: boolean;
  auto_unlock?: boolean;
  max_points?: number;
  last_searched_at?: string;
  timestamp?: string;
  total_notifications?: number;
  total_cost?: number;
  [k: string]: any;
}

export interface NotificationRunUnlockOptions {
  max?: number;
  search?: string;
  is_email?: boolean;
}

export interface NotificationRunExportOptions {
  search?: string;
  is_email?: boolean;
  format?: ExportFormat;
}

export interface MonitorQuickAddInput {
  domain: string;
  methodType?: NotificationMethodType;
  methodValue?: string;
  autoUnlock?: boolean;
  maxPoints?: number;
}

export type TestNotificationDataType = 'leak' | 'raw' | 'dark_web';

// Dark web
export interface DarkWebSearchRequest {
  query?: string;
  sources?: string;
  date_from?: string;
  date_to?: string;
  sort_by?: 'ingested_at' | 'published_at';
  sort_order?: SortOrder;
  [k: string]: any;
}

export interface DarkWebSearchOptions {
  page?: number;
  page_size?: number;
  sources?: string;
  date_from?: string;
  date_to?: string;
  sort_by?: 'ingested_at' | 'published_at';
  sort_order?: SortOrder;
  refresh?: boolean;
}

export interface DarkWebSearchResponse extends Paginated<Record<string, any>> {}

export interface DarkWebSourcesResponse {
  sources: Array<{ name: string; count: number; [k: string]: any }>;
  [k: string]: any;
}

export interface DarkWebStatsResponse {
  total_posts?: number;
  total_sources?: number;
  latest_ingested_at?: string | null;
  oldest_published_at?: string | null;
  [k: string]: any;
}

export interface DarkWebDigest {
  domains: string[];
  groups: Array<{ source: string; count: number; posts: Record<string, any>[] }>;
  total: number;
  [k: string]: any;
}

// Unlock by ids
export interface UnlockByIdsInput {
  leak_ids: Array<string | number>;
  target_list_id?: number;
}
