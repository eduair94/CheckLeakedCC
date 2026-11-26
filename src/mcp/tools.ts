/**
 * The CheckLeaked tool catalog: every SDK capability as a named tool with a
 * JSON-Schema input, MCP annotations and a `run()` bound to a client.
 *
 * Used by the bundled MCP server (`npx checkleakedcc mcp`) and exportable as
 * function-calling definitions for the Claude API (`toAnthropicTools`) or
 * OpenAI-compatible APIs (`toOpenAITools`). Names match the hosted server at
 * mcp.checkleaked.cc so prompts work against either.
 */
import type { CheckLeakedCC } from '../CheckLeakedCC';
import { CheckLeakedValidationError } from '../errors';

export interface JsonSchema {
  type?: string | string[];
  description?: string;
  enum?: readonly unknown[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  default?: unknown;
  [k: string]: unknown;
}

export interface ToolAnnotations {
  title: string;
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

export interface CheckLeakedTool {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema & { type: 'object'; properties: Record<string, JsonSchema> };
  annotations: ToolAnnotations;
  /** False for free public tools that work without an api key. */
  requiresApiKey: boolean;
  /** Run against the client the catalog was created for. `args` is validated first. */
  run(args?: Record<string, unknown>): Promise<unknown>;
}

export interface CreateToolsOptions {
  /** Keep only these tool names. */
  include?: string[];
  /** Drop these tool names. */
  exclude?: string[];
  /** Keep only read-only tools (no credits spent, no state changed). */
  readOnly?: boolean;
}

// ---------------------------------------------------------------------------
// Schema helpers
// ---------------------------------------------------------------------------

const s = (description: string, extra: JsonSchema = {}): JsonSchema => ({ type: 'string', description, ...extra });
const n = (description: string, extra: JsonSchema = {}): JsonSchema => ({ type: 'integer', description, ...extra });
const b = (description: string): JsonSchema => ({ type: 'boolean', description });
const e = (values: readonly string[], description: string): JsonSchema => ({ type: 'string', enum: values, description });
const strArr = (description: string): JsonSchema => ({ type: 'array', items: { type: 'string' }, description });
const lang = s('Language code (es, fr, de, …) for a translated answer', { minLength: 2, maxLength: 5 });

function input(properties: Record<string, JsonSchema> = {}, required: string[] = []) {
  return { type: 'object' as const, properties, required, additionalProperties: false };
}

const readOnly = (title: string): ToolAnnotations => ({ title, readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true });
const mutating = (title: string): ToolAnnotations => ({ title, readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true });
const destructive = (title: string): ToolAnnotations => ({ title, readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true });

type Def = Omit<CheckLeakedTool, 'run' | 'title' | 'requiresApiKey'> & {
  requiresApiKey?: boolean;
  handler: (a: Record<string, any>) => Promise<unknown>;
};

const LEAKCHECK_TYPES = ['auto', 'email', 'username', 'keyword', 'domain', 'phone', 'hash', 'password', 'origin', 'phash', 'mass', 'login', 'pass_email', 'domain_email', 'pass_login'];
const DEHASHED_TYPES = ['email', 'username', 'password', 'hashed_password', 'name', 'address', 'phone', 'ip_address', 'vin', 'domain', 'free'];
const EXPERIMENTAL_TYPES = ['email', 'username', 'password', 'hash', 'name', 'lastip', 'domain', 'mass'];

const WEBHOOK_CONTRACT =
  'Destination: HTTPS on a public host. Events: `tracking.finding`, one signed JSON POST per finding, header `X-CheckLeaked-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`. Slack / Discord / Teams / Google Chat URLs get a native rendering. Retries at 2s and 8s; auto-disabled after 20 consecutive failures.';

const PRIVATE_BOT_CONTRACT =
  'Pro/Plus only. Bring your own token (Discord Developer Portal → Bot → Reset Token, or Telegram @BotFather /newbot). Validated, stored encrypted, never returned (only `token_hint`). The bot answers only the owner. One bot per platform.';

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

function definitions(api: CheckLeakedCC): Def[] {
  const tracking = (monitor?: string) => (monitor === 'leakradar' ? api.tracking.leakradar : api.tracking);
  const monitor = e(['native', 'leakradar'], 'Which monitor: native (LeakCheck: login/email/domain, default) or leakradar (domain/raw)');
  return [
    // ── Account ──
    {
      name: 'checkleaked_verify_auth',
      description: 'Verify the API key is accepted.',
      inputSchema: input(),
      annotations: readOnly('Verify API key'),
      handler: () => api.auth(),
    },
    {
      name: 'checkleaked_ping',
      description: 'Validate the API key and show the plan it belongs to.',
      inputSchema: input(),
      annotations: readOnly('Plan & key check'),
      handler: () => api.valid(),
    },
    // ── Breach search ──
    {
      name: 'checkleaked_leak_check',
      description: `Search the LeakCheck breach database. Types: ${LEAKCHECK_TYPES.join(', ')}. Spends one lookup.`,
      inputSchema: input({ check: s('Value to search (email, username, domain, phone, hash…)', { minLength: 3 }), type: e(LEAKCHECK_TYPES, 'Search type (default auto)') }, ['check']),
      annotations: mutating('LeakCheck search'),
      handler: (a) => api.leakCheck(a.check, a.type || 'auto'),
    },
    {
      name: 'checkleaked_dehashed',
      description: 'Search the Dehashed breach database by email, username, password, IP, name, address, phone, VIN, domain or a free-text query. Spends one lookup.',
      inputSchema: input(
        {
          entry: s('Value to search', { minLength: 4, maxLength: 50 }),
          type: e(DEHASHED_TYPES, 'Field to search; `free` sends entry as a raw query'),
          page: n('Page number (default 1)', { minimum: 1 }),
          wildcard: b('Wildcard match'),
          regex: b('Regex match'),
        },
        ['entry', 'type'],
      ),
      annotations: mutating('Dehashed search'),
      handler: (a) => api.dehashed(a.entry, a.type, { page: a.page, wildcard: a.wildcard, regex: a.regex }),
    },
    {
      name: 'checkleaked_experimental',
      description: 'Search the Snusbase ("experimental") breach databases. Spends one lookup.',
      inputSchema: input(
        { entry: s('Value to search', { minLength: 4, maxLength: 50 }), type: e(EXPERIMENTAL_TYPES, 'Field to search'), wildcard: b('Wildcard match'), loadAll: b('Load every page') },
        ['entry', 'type'],
      ),
      annotations: mutating('Snusbase search'),
      handler: (a) => api.experimental(a.entry, a.type, { wildcard: a.wildcard, loadAll: a.loadAll }),
    },
    {
      name: 'checkleaked_crack_hash',
      description: 'Reverse a password hash (MD5, SHA1, SHA256, NTLM…) from breach data. Pro/Plus.',
      inputSchema: input({ hash: s('Hash to crack', { minLength: 4, maxLength: 200 }) }, ['hash']),
      annotations: mutating('Crack hash'),
      handler: (a) => api.crackHash(a.hash),
    },
    {
      name: 'checkleaked_ip_lookup',
      description: 'Geolocation, ISP, ASN and WHOIS for an IP address. Omit ip for your own. Free.',
      inputSchema: input({ ip: s('IPv4/IPv6 address') }),
      annotations: readOnly('IP lookup'),
      handler: (a) => api.ip(a.ip),
    },
    {
      name: 'checkleaked_ghunt',
      description: 'Google-account OSINT (GHunt) for a Gmail address: profile, linked services, avatar. Pro/Plus.',
      inputSchema: input({ email: s('Gmail address') }, ['email']),
      annotations: mutating('GHunt lookup'),
      handler: (a) => api.ghunt(a.email),
    },
    {
      name: 'checkleaked_domain_whois',
      description: 'WHOIS / registration lookup for a domain: registrar, creation/expiry dates, name servers, status.',
      inputSchema: input({ domain: s('Domain, e.g. example.com') }, ['domain']),
      annotations: readOnly('Domain WHOIS'),
      handler: (a) => api.whois(a.domain),
    },
    {
      name: 'checkleaked_name_insight',
      description: 'Gender, origin and meaning insight for a personal name found in a leak. Free.',
      inputSchema: input({ name: s('Given name or full name'), lang }, ['name']),
      annotations: readOnly('Name insight'),
      requiresApiKey: false,
      handler: (a) => api.nameInsight(a.name, { lang: a.lang }),
    },
    // ── k-anonymity ──
    {
      name: 'checkleaked_pwned_password',
      description: 'Has a password appeared in breaches? Hashed locally (SHA-1); only a 5-char prefix is sent. Returns { pwned, count, prefix }. Free.',
      inputSchema: input({ password: s('Password to check (never leaves this process)') }, ['password']),
      annotations: readOnly('Pwned password (k-anonymity)'),
      requiresApiKey: false,
      handler: (a) => api.kanon.pwnedPassword(a.password),
    },
    {
      name: 'checkleaked_email_breach_kanon',
      description: 'Free breach teaser for an email: sources and exposed field names, no records. Only 24 hex chars of SHA-256(email) are sent.',
      inputSchema: input({ email: s('Email address (hashed locally)') }, ['email']),
      annotations: readOnly('Email breach teaser (k-anonymity)'),
      requiresApiKey: false,
      handler: (a) => api.kanon.emailBreach(a.email),
    },
    // ── Breach registry & site ──
    {
      name: 'checkleaked_breach_info',
      description: 'Registry record for one breach by name (Title, Domain, BreachDate, PwnCount, DataClasses, Description). Free.',
      inputSchema: input({ name: s('Breach name, e.g. Adobe, LinkedIn'), lang }, ['name']),
      annotations: readOnly('Breach record'),
      requiresApiKey: false,
      handler: (a) => api.breaches.get(a.name, { lang: a.lang }),
    },
    {
      name: 'checkleaked_breaches_search',
      description: 'Search the breach registry by name/domain/description → { items, total }. Free.',
      inputSchema: input({
        search: s('Free-text filter'),
        page: n('1-based page (default 1)', { minimum: 1 }),
        itemsPerPage: n('Rows per page (default 20)', { minimum: 1, maximum: 100 }),
        sortBy: e(['ModifiedDate', 'BreachDate', 'AddedDate', 'PwnCount', 'Name', 'Domain'], 'Sort field'),
        sortDesc: b('Sort descending (default true)'),
        lang,
      }),
      annotations: readOnly('Search breach registry'),
      requiresApiKey: false,
      handler: (a) => api.breaches.search(a),
    },
    {
      name: 'checkleaked_site_latest_breach',
      description: 'The most recently added public breach. Free.',
      inputSchema: input(),
      annotations: readOnly('Latest breach'),
      requiresApiKey: false,
      handler: () => api.breaches.latest(),
    },
    {
      name: 'checkleaked_news_latest',
      description: "Today's CheckLeaked cybersecurity briefing. Free.",
      inputSchema: input({ lang }),
      annotations: readOnly('Daily briefing'),
      requiresApiKey: false,
      handler: (a) => api.news.latest({ lang: a.lang }),
    },
    {
      name: 'checkleaked_site_plans',
      description: 'CheckLeaked.cc plans and prices (USD): daily lookups, duration, tracking slots, search types. Free.',
      inputSchema: input(),
      annotations: readOnly('Plans and prices'),
      requiresApiKey: false,
      handler: () => api.site.plans(),
    },
    {
      name: 'checkleaked_site_faq',
      description: 'CheckLeaked.cc FAQ (how it works, plans, payments, API keys, privacy). Optional keywords filter. Free.',
      inputSchema: input({ query: s('Keywords (optional)', { maxLength: 200 }) }),
      annotations: readOnly('FAQ'),
      requiresApiKey: false,
      handler: (a) => api.site.faq(a.query),
    },
    {
      name: 'checkleaked_site_changelog',
      description: 'Recent CheckLeaked.cc changelog entries. Free.',
      inputSchema: input({ limit: n('How many entries (default 5)', { minimum: 1, maximum: 25 }) }),
      annotations: readOnly('Changelog'),
      requiresApiKey: false,
      handler: (a) => api.site.changelog({ limit: a.limit ?? 5 }),
    },
    {
      name: 'checkleaked_site_stats',
      description: 'Public numbers: searches served and indexed breach records. Free.',
      inputSchema: input(),
      annotations: readOnly('Site stats'),
      requiresApiKey: false,
      handler: () => api.site.stats(),
    },
    // ── Tracking ──
    {
      name: 'checkleaked_tracking_new',
      description: 'Monitor an entry for new breaches. native types: login, email, domain; leakradar types: domain, raw.',
      inputSchema: input({ entry: s('Value to monitor'), type: e(['login', 'email', 'domain', 'raw'], 'Entry type'), monitor }, ['entry', 'type']),
      annotations: mutating('Add monitored entry'),
      handler: (a) => tracking(a.monitor).add(a.entry, a.type),
    },
    {
      name: 'checkleaked_tracking_delete',
      description: 'Stop monitoring an entry, by the `email_unique_id` shown in checkleaked_tracking_entries.',
      inputSchema: input({ email_unique_id: s('The entry id (email_unique_id) from the entries list'), monitor }, ['email_unique_id']),
      annotations: destructive('Delete monitored entry'),
      handler: (a) => tracking(a.monitor).remove(a.email_unique_id),
    },
    {
      name: 'checkleaked_tracking_entries',
      description: 'List every monitored entry.',
      inputSchema: input({ monitor }),
      annotations: readOnly('List monitored entries'),
      handler: (a) => tracking(a.monitor).list(),
    },
    {
      name: 'checkleaked_tracking_limits',
      description: 'Monitoring slots: { limit, total }.',
      inputSchema: input({ monitor }),
      annotations: readOnly('Tracking limits'),
      handler: (a) => tracking(a.monitor).limits(),
    },
    {
      name: 'checkleaked_tracking_history',
      description: 'Check history for one monitored entry (pass the same entry and type it was added with).',
      inputSchema: input({ entry: s('Monitored value'), type: e(['login', 'email', 'domain', 'raw'], 'Entry type'), monitor }, ['entry', 'type']),
      annotations: readOnly('Tracking history'),
      handler: (a) => tracking(a.monitor).history(a.entry, a.type),
    },
    {
      name: 'checkleaked_tracking_result',
      description: 'The leak result behind one history snapshot (id from checkleaked_tracking_history).',
      inputSchema: input({ id: s('History snapshot id'), monitor }, ['id']),
      annotations: readOnly('Tracking result'),
      handler: (a) => tracking(a.monitor).historyResult(a.id),
    },
    {
      name: 'checkleaked_tracking_clean',
      description: 'Remove stale native tracking entries.',
      inputSchema: input(),
      annotations: destructive('Clean tracking entries'),
      handler: () => api.tracking.cleanEntries(),
    },
    // ── LeakRadar ──
    {
      name: 'checkleaked_leakradar_email_search',
      description: 'LeakRadar stealer-log search for one email.',
      inputSchema: input({ email: s('Email address'), page: n('Page', { minimum: 1 }), page_size: n('Rows per page', { minimum: 1, maximum: 100 }) }, ['email']),
      annotations: mutating('LeakRadar email search'),
      handler: (a) => api.leakradar.email.search(a.email, { page: a.page, page_size: a.page_size }),
    },
    {
      name: 'checkleaked_leakradar_domain_summary',
      description: 'LeakRadar exposure summary for a domain: employees, customers, third parties, subdomains, URLs.',
      inputSchema: input({ domain: s('Domain'), light: b('Faster, lighter summary') }, ['domain']),
      annotations: readOnly('LeakRadar domain summary'),
      handler: (a) => api.leakradar.domain.summary(a.domain, { light: a.light }),
    },
    {
      name: 'checkleaked_leakradar_domain_list',
      description: 'Leaked credentials for a domain in one bucket: employees, customers, third_parties or all.',
      inputSchema: input(
        { domain: s('Domain'), bucket: e(['employees', 'customers', 'third_parties', 'all'], 'Bucket (default employees)'), page: n('Page', { minimum: 1 }), page_size: n('Rows per page', { minimum: 1, maximum: 100 }) },
        ['domain'],
      ),
      annotations: mutating('LeakRadar domain list'),
      handler: (a) => api.leakradar.domain.list(a.domain, a.bucket || 'employees', { page: a.page, page_size: a.page_size }),
    },
    {
      name: 'checkleaked_leakradar_advanced_search',
      description: 'LeakRadar advanced search. `filters` keys: email, username, password, url, url_domain, email_domain, password_strength, … (scalar or array).',
      inputSchema: input(
        { filters: { type: 'object', description: 'Filter object, e.g. {"url_domain":"example.com"}', additionalProperties: true }, page: n('Page', { minimum: 1 }), page_size: n('Rows per page', { minimum: 1, maximum: 100 }) },
        ['filters'],
      ),
      annotations: mutating('LeakRadar advanced search'),
      handler: (a) => api.leakradar.advanced.search(a.filters, { page: a.page, page_size: a.page_size }),
    },
    {
      name: 'checkleaked_leakradar_raw_search',
      description: 'Full-text search over raw stealer-log blocks (metadata). Use raw_search_lines to get the parsed lines.',
      inputSchema: input(
        { q: s('Full-text query'), categories: strArr('Raw file categories'), file_name: strArr('Entry name wildcards'), page: n('Page', { minimum: 1 }), page_size: n('Rows per page', { minimum: 1, maximum: 100 }), cursor: s('Cursor from a previous page') },
        ['q'],
      ),
      annotations: mutating('LeakRadar raw search'),
      handler: (a) => api.leakradar.raw.search({ q: a.q, categories: a.categories, file_name: a.file_name }, { page: a.page, page_size: a.page_size, cursor: a.cursor }),
    },
    {
      name: 'checkleaked_leakradar_raw_search_lines',
      description: 'Search raw stealer logs, unlock the matched blocks and return the parsed records (credentials, cookies) in one call. Pro; 1 credit.',
      inputSchema: input(
        {
          q: s('Full-text query'),
          max_hits: n('Blocks to unlock and parse (default 100)', { minimum: 1, maximum: 100 }),
          case_sensitive: b('Case-sensitive match'),
          context_lines: n('Context lines for unknown formats', { minimum: 0, maximum: 10 }),
          categories: strArr('Raw file categories'),
          file_name: strArr('Entry name wildcards'),
          cursor: s('Cursor from a previous response'),
        },
        ['q'],
      ),
      annotations: mutating('LeakRadar raw lines'),
      handler: (a) =>
        api.leakradar.raw.searchLines(
          { q: a.q, categories: a.categories, file_name: a.file_name },
          { max_hits: a.max_hits, case_sensitive: a.case_sensitive, context_lines: a.context_lines, cursor: a.cursor },
        ),
    },
    {
      name: 'checkleaked_leakradar_raw_parts',
      description: 'List the parts of one raw file entry inside a container.',
      inputSchema: input({ container_id: n('Container id'), entry_path: s('Entry path'), page: n('Page', { minimum: 1 }), page_size: n('Rows per page', { minimum: 1, maximum: 100 }) }, ['container_id', 'entry_path']),
      annotations: readOnly('LeakRadar raw parts'),
      handler: (a) => api.leakradar.raw.listParts(a as any),
    },
    {
      name: 'checkleaked_leakradar_raw_part',
      description: 'Fetch one raw file part by sequence number.',
      inputSchema: input({ container_id: n('Container id'), entry_path: s('Entry path'), seq: n('Part sequence number', { minimum: 0 }) }, ['container_id', 'entry_path', 'seq']),
      annotations: mutating('LeakRadar raw part'),
      handler: (a) => api.leakradar.raw.getPart(a as any),
    },
    {
      name: 'checkleaked_leakradar_dark_web_search',
      description: 'Search indexed dark-web posts (forums, markets, leak sites).',
      inputSchema: input({ query: s('Search text'), page: n('Page', { minimum: 1 }), page_size: n('Rows per page', { minimum: 1, maximum: 100 }) }, ['query']),
      annotations: readOnly('Dark web search'),
      handler: (a) => api.leakradar.darkWeb.search(a.query, { page: a.page, page_size: a.page_size }),
    },
    {
      name: 'checkleaked_leakradar_cross_source',
      description: 'Fan-out check across LeakRadar email search + domain summary (+ dark web on Plus/Pro). Give email and/or domain.',
      inputSchema: input({ email: s('Email address'), domain: s('Domain') }),
      annotations: mutating('Cross-source check'),
      handler: (a) => api.leakradar.crossSourceCheck({ email: a.email, domain: a.domain }),
    },
    {
      name: 'checkleaked_leakradar_pwned',
      description: 'LeakRadar pwned-password check → { pwned, count }.',
      inputSchema: input({ password: s('Password') }, ['password']),
      annotations: readOnly('LeakRadar pwned password'),
      handler: (a) => api.leakradar.password.pwned(a.password),
    },
    {
      name: 'checkleaked_leakradar_password_range',
      description: 'k-anonymity SHA-1 range query (first 5 hex chars) against LeakRadar.',
      inputSchema: input({ prefix: s('First 5 hex chars of the SHA-1', { minLength: 5, maxLength: 5 }) }, ['prefix']),
      annotations: readOnly('LeakRadar password range'),
      handler: (a) => api.leakradar.password.range({ prefix: a.prefix }),
    },
    {
      name: 'checkleaked_leakradar_unlock',
      description: 'Unlock specific LeakRadar leaks by id (charged per leak).',
      inputSchema: input({ leak_ids: { type: 'array', items: { type: ['string', 'integer'] }, description: 'Leak ids' } }, ['leak_ids']),
      annotations: mutating('Unlock leaks'),
      handler: (a) => api.leakradar.unlock({ leak_ids: a.leak_ids }),
    },
    {
      name: 'checkleaked_leakradar_task_status',
      description: 'Status of an async LeakRadar task (unlock / export).',
      inputSchema: input({ task_id: s('Task id') }, ['task_id']),
      annotations: readOnly('Task status'),
      handler: (a) => api.leakradar.tasks.status(a.task_id),
    },
    // ── AI & WormGPT ──
    {
      name: 'checkleaked_ai_investigate',
      description:
        'WormGPT AI OSINT investigation of one subject: the agent searches the web and runs the leak/OSINT tools itself and returns a markdown dossier with sources. Pro; 1 unit of the WormGPT daily quota; can take ~3 minutes.',
      inputSchema: input({ term: s('Subject: email, username, domain, phone, IP or name'), type: s('Subject type hint (email, username, domain, phone, ip, name)') }, ['term']),
      annotations: mutating('AI investigation'),
      handler: (a) => api.ai.investigate(a.term, { type: a.type }),
    },
    {
      name: 'checkleaked_wormgpt_chat',
      description:
        'Ask WormGPT (uncensored security-research LLM). With tools_enabled it can run web search and the CheckLeaked leak/OSINT tools itself. Plus/Pro; 1 unit of the WormGPT daily quota.',
      inputSchema: input(
        {
          prompt: s('The question'),
          system: s('Optional system prompt'),
          model: s('Model id (see checkleaked_wormgpt_models), default wormv5.2'),
          tools_enabled: b('Let the agent run web search and leak/OSINT tools'),
          web_search_enabled: b('Allow web search'),
        },
        ['prompt'],
      ),
      annotations: mutating('WormGPT chat'),
      handler: async (a) => {
        const res = await api.wormgpt.chat({
          messages: [...(a.system ? [{ role: 'system' as const, content: String(a.system) }] : []), { role: 'user' as const, content: String(a.prompt) }],
          model: a.model,
          tools_enabled: a.tools_enabled,
          web_search_enabled: a.web_search_enabled,
        });
        return {
          answer: res.choices?.[0]?.message?.content ?? '',
          tools_used: (res.tool_results || []).map((t) => ({ tool: t.tool, success: t.success })),
        };
      },
    },
    {
      name: 'checkleaked_wormgpt_usage',
      description: 'Your WormGPT daily quota: dailyLimit, todayUsage, dailyRemaining.',
      inputSchema: input(),
      annotations: readOnly('WormGPT quota'),
      handler: () => api.wormgpt.usage(),
    },
    {
      name: 'checkleaked_wormgpt_models',
      description: 'WormGPT model ids. Free.',
      inputSchema: input(),
      annotations: readOnly('WormGPT models'),
      requiresApiKey: false,
      handler: () => api.wormgpt.models(),
    },
    // ── Webhooks ──
    {
      name: 'checkleaked_webhook_get',
      description: `Show the tracking webhook (url, enabled, format, secret_hint, last delivery status) or null. ${WEBHOOK_CONTRACT}`,
      inputSchema: input(),
      annotations: readOnly('Show webhook'),
      handler: () => api.webhooks.get(),
    },
    {
      name: 'checkleaked_webhook_set',
      description: `Create or update the tracking webhook. The plaintext secret is returned ONLY on create or rotate_secret. ${WEBHOOK_CONTRACT}`,
      inputSchema: input(
        {
          url: s('HTTPS destination URL', { pattern: '^https://' }),
          enabled: b('Enable deliveries'),
          rotate_secret: b('Issue a new signing secret'),
          format: e(['auto', 'json', 'slack', 'discord', 'teams', 'google_chat'], 'Delivery shape (default auto-detect)'),
        },
        ['url'],
      ),
      annotations: destructive('Set webhook'),
      handler: (a) => api.webhooks.set(a as any),
    },
    {
      name: 'checkleaked_webhook_test',
      description: 'Send one signed test event to the webhook → { delivered, status, error, duration_ms }. 5 per minute.',
      inputSchema: input(),
      annotations: mutating('Test webhook'),
      handler: () => api.webhooks.test(),
    },
    {
      name: 'checkleaked_webhook_delete',
      description: 'Delete the tracking webhook and its secret.',
      inputSchema: input(),
      annotations: destructive('Delete webhook'),
      handler: () => api.webhooks.delete(),
    },
    // ── Private bots ──
    {
      name: 'checkleaked_private_bots_get',
      description: `List your private Discord / Telegram bots (state, username, token_hint, invite_url). ${PRIVATE_BOT_CONTRACT}`,
      inputSchema: input(),
      annotations: readOnly('List private bots'),
      handler: () => api.privateBots.list(),
    },
    {
      name: 'checkleaked_private_bot_set',
      description: `Create / replace (token) or pause / resume (enabled) your private bot on one platform. ${PRIVATE_BOT_CONTRACT}`,
      inputSchema: input({ platform: e(['discord', 'telegram'], 'Platform'), token: s('Bot token', { minLength: 20 }), enabled: b('Pause (false) / resume (true)') }, ['platform']),
      annotations: destructive('Set private bot'),
      handler: (a) => api.privateBots.set(a as any),
    },
    {
      name: 'checkleaked_private_bot_delete',
      description: 'Stop and remove your private bot on one platform.',
      inputSchema: input({ platform: e(['discord', 'telegram'], 'Platform') }, ['platform']),
      annotations: destructive('Delete private bot'),
      handler: (a) => api.privateBots.delete(a.platform),
    },
  ];
}

/** Build the tool catalog bound to a client. */
export function createCheckLeakedTools(api: CheckLeakedCC, opts: CreateToolsOptions = {}): CheckLeakedTool[] {
  const include = opts.include ? new Set(opts.include) : null;
  const exclude = new Set(opts.exclude || []);
  return definitions(api)
    .filter((d) => (!include || include.has(d.name)) && !exclude.has(d.name) && (!opts.readOnly || d.annotations.readOnlyHint))
    .map((d) => ({
      name: d.name,
      title: d.annotations.title,
      description: d.description,
      inputSchema: d.inputSchema,
      annotations: d.annotations,
      requiresApiKey: d.requiresApiKey !== false,
      run: async (args: Record<string, unknown> = {}) => d.handler(validateArgs(d.name, d.inputSchema, args)),
    }));
}

/** Look up and run one tool by name. */
export async function runCheckLeakedTool(tools: CheckLeakedTool[], name: string, args?: Record<string, unknown>): Promise<unknown> {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new CheckLeakedValidationError({ message: `Unknown tool: ${name}`, status: 0, body: undefined, path: name });
  return tool.run(args);
}

/** Tool definitions in the Claude Messages API shape (`tools: [...]`). */
export function toAnthropicTools(tools: CheckLeakedTool[]): Array<{ name: string; description: string; input_schema: JsonSchema }> {
  return tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema }));
}

/** Tool definitions in the OpenAI-compatible function-calling shape. */
export function toOpenAITools(
  tools: CheckLeakedTool[],
): Array<{ type: 'function'; function: { name: string; description: string; parameters: JsonSchema } }> {
  return tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
}

/**
 * Light JSON-Schema check: required keys, primitive types (with numeric
 * strings coerced to integers), enums. Unknown keys are dropped.
 */
export function validateArgs(tool: string, schema: JsonSchema, args: unknown): Record<string, any> {
  const fail = (message: string) => new CheckLeakedValidationError({ message: `${tool}: ${message}`, status: 0, body: { error: message }, path: tool });
  if (args !== undefined && args !== null && (typeof args !== 'object' || Array.isArray(args))) throw fail('arguments must be an object');
  const input = (args || {}) as Record<string, unknown>;
  const props = schema.properties || {};
  const out: Record<string, any> = {};
  for (const key of schema.required || []) {
    if (input[key] === undefined || input[key] === null || input[key] === '') throw fail(`"${key}" is required`);
  }
  for (const [key, prop] of Object.entries(props)) {
    let v = input[key];
    if (v === undefined || v === null) continue;
    const types = Array.isArray(prop.type) ? prop.type : prop.type ? [prop.type] : [];
    if (types.includes('integer') && !types.includes('string') && typeof v === 'string' && /^-?\d+$/.test(v.trim())) v = Number(v);
    if (types.includes('boolean') && typeof v === 'string' && (v === 'true' || v === 'false')) v = v === 'true';
    if (types.length && !types.some((t) => matchesType(t, v))) throw fail(`"${key}" must be ${types.join(' or ')}`);
    if (prop.enum && !prop.enum.includes(v)) throw fail(`"${key}" must be one of ${prop.enum.join(', ')}`);
    if (typeof v === 'string') {
      if (prop.minLength !== undefined && v.length < prop.minLength) throw fail(`"${key}" is too short`);
      if (prop.maxLength !== undefined && v.length > prop.maxLength) throw fail(`"${key}" is too long`);
      if (typeof prop.pattern === 'string' && !new RegExp(prop.pattern).test(v)) throw fail(`"${key}" has an invalid format`);
    }
    if (typeof v === 'number') {
      if (prop.minimum !== undefined && v < prop.minimum) throw fail(`"${key}" must be >= ${prop.minimum}`);
      if (prop.maximum !== undefined && v > prop.maximum) throw fail(`"${key}" must be <= ${prop.maximum}`);
    }
    out[key] = v;
  }
  return out;
}

function matchesType(t: string, v: unknown): boolean {
  switch (t) {
    case 'string':
      return typeof v === 'string';
    case 'integer':
      return typeof v === 'number' && Number.isInteger(v);
    case 'number':
      return typeof v === 'number' && Number.isFinite(v);
    case 'boolean':
      return typeof v === 'boolean';
    case 'array':
      return Array.isArray(v);
    case 'object':
      return !!v && typeof v === 'object' && !Array.isArray(v);
    default:
      return true;
  }
}
