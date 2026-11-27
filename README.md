# checkleakedcc

[![npm](https://img.shields.io/npm/v/checkleakedcc)](https://www.npmjs.com/package/checkleakedcc) [![MCP Registry](https://img.shields.io/badge/MCP%20Registry-cc.checkleaked%2Fcheckleaked--mcp-blue)](https://registry.modelcontextprotocol.io/v0/servers?search=cc.checkleaked/checkleaked-mcp) [![CheckLeaked MCP connector](https://glama.ai/mcp/connectors/cc.checkleaked/checkleaked-mcp/badges/score.svg)](https://glama.ai/mcp/connectors/cc.checkleaked/checkleaked-mcp)

Official Node.js / TypeScript SDK, CLI and **MCP server** for **[checkleaked.cc](https://checkleaked.cc)**:

- **Breach search**: LeakCheck, Dehashed and Snusbase, plus the full **LeakRadar** integration (stealer logs, domain intelligence, the unlocked archive, notifications, dark web).
- **OSINT**: hash cracking, GHunt (Google accounts), WHOIS, IP lookup, name insight.
- **Monitoring**: breach tracking with **signed webhooks** (Slack / Discord / Teams / Google Chat / JSON), and private Discord / Telegram bots.
- **WormGPT**: an OpenAI-compatible chat API with streaming and agent tools, plus **one-call AI OSINT investigations**.
- **MCP**: a zero-dependency MCP server (`npx -y checkleakedcc mcp`) for Claude Desktop, Claude Code, Cursor, VS Code and Windsurf. The package also includes a client for the hosted server and tool definitions for the Claude and OpenAI APIs.
- **Free tools**: the breach registry, the daily news briefing, and k-anonymity password and email checks.

Everything is typed, with zero runtime dependencies, automatic retries and typed errors. The package ships as dual ESM + CommonJS. It is tested on **Node.js 20, 22, 24 and 26**.

```bash
npm i checkleakedcc
```

## Requirements

- A **bot API key** from **[checkleaked.cc/botLinks](https://checkleaked.cc/botLinks)**. The same key works for the API, WormGPT and MCP. The free tools need no key.
- **Node.js ≥ 20**. The SDK uses the native `fetch` and Web Crypto, so it also runs on Bun, Deno and edge runtimes.

---

## Quick start

```ts
import CheckLeakedCC from 'checkleakedcc';

const api = new CheckLeakedCC('YOUR-API-KEY'); // or CheckLeakedCC.fromEnv() → CHECKLEAKED_API_KEY

// Breach search
const res = await api.experimental('john@example.com', 'email');
const dh = await api.dehashed('john@example.com', 'email');

// LeakRadar domain intelligence
const report = await api.leakradar.domain.report('example.com');

// Monitoring + a signed Slack webhook for every new finding
await api.tracking.add('example.com', 'domain');
await api.webhooks.set({ url: 'https://hooks.slack.com/services/…' });

// WormGPT
const answer = await api.wormgpt.ask('Explain this hash format: $2y$10$…');
const dossier = await api.ai.investigate('john@example.com'); // markdown + sources (Pro)

// Free, no key needed
const { pwned, count } = await api.kanon.pwnedPassword('hunter2'); // the password never leaves the process
```

CommonJS:

```js
const CheckLeakedCC = require('checkleakedcc').default;
const api = new CheckLeakedCC('YOUR-API-KEY');
```

### Configuration

Pass a string key, or an options object for full control:

```ts
const api = new CheckLeakedCC({
  apiKey: 'YOUR-API-KEY',
  timeout: 120000,        // ms, default 120000 (per call: { timeout } on AI calls)
  maxRetries: 2,          // retries on 429 / 5xx / transient network errors
  retryDelayMs: 500,      // base backoff
  baseUrl: 'https://api.checkleaked.cc/api',
  siteUrl: 'https://checkleaked.cc/api',          // open routes (registry, news, plans)
  wormgptUrl: 'https://wormgpt.checkleaked.com',
  mcpUrl: 'https://mcp.checkleaked.cc/mcp',
  userAgent: 'my-app/1.0',
  throwOnErrorBody: true, // throw when the API replies `{ error: "..." }` on a 200 (default true)
  allowMissingApiKey: false, // true = keyless client (free tools only)
  fetch: customFetch,     // optional fetch implementation
  dispatcher: proxyAgent, // optional undici Dispatcher (e.g. ProxyAgent)
});
```

---

## Core search

| Method | Description |
| --- | --- |
| `api.valid()` | Validate the key, returns your plan. |
| `api.auth()` | Lightweight auth check → `{ success: true }`. |
| `api.experimental(entry, type, opts?)` | Snusbase breach search. `type`: `email`, `username`, `password`, `hash`, `name`, `lastip`, `domain`, `mass`. |
| `api.dehashed(entry, type, opts?)` | Dehashed search. `type`: `email`, `username`, `password`, `hashed_password`, `name`, `address`, `phone`, `ip_address`, `vin`, `domain`, or `free` (raw query). |
| `api.leakCheck(check, type?, opts?)` | LeakCheck.io lookup. `type` defaults to `auto`. |
| `api.crackHash(hash)` | Reverse a password hash → `{ hash, plain }` *(pro/plus)*. |
| `api.ghunt(email)` | Google‑account OSINT *(pro/plus)*. |
| `api.ip(ip?)` | IP geolocation + ASN + WHOIS (free). Omit `ip` for your own. |
| `api.whois(domain)` | Domain WHOIS: registrar, dates, name servers, status. |
| `api.nameInsight(name, { lang? })` | Gender, origin and meaning of a personal name (free). |

```ts
await api.dehashed('acme.com', 'domain', { page: 2, wildcard: true });
await api.experimental('john', 'username', { loadAll: true });
await api.leakCheck('+15551234567', 'phone');
await api.whois('example.com');
```

> **Back‑compat:** the v1 signatures `api.experimental(entry, type)` and `api.dehashed(entry, type, page)` still work — the third `dehashed` argument accepts either a page number or an options object.

---

## Breach monitoring (`api.tracking`)

Two monitors share one interface. The account is identified by your key — you never pass a user id.

```ts
// Native monitor — types: 'login' | 'email' | 'domain'
await api.tracking.add('john@example.com', 'email');
await api.tracking.list();
await api.tracking.limits();                 // { limit, total }
await api.tracking.history('john@example.com', 'email');
await api.tracking.historyResult(historyId);
await api.tracking.remove(emailUniqueId);
await api.tracking.cleanEntries();

// LeakRadar monitor — types: 'domain' | 'raw'
await api.tracking.leakradar.add('example.com', 'domain');
await api.tracking.leakradar.list();
await api.tracking.leakradar.history('example.com', 'domain');
```

---

## LeakRadar (`api.leakradar`)

The complete LeakRadar surface, grouped into scoped resources.

### Email

```ts
await api.leakradar.email.search('john@example.com', { page: 1, page_size: 50, auto_unlock: false });
await api.leakradar.email.unlock('john@example.com', { max: 20 });
const task = await api.leakradar.email.unlockAsync('john@example.com', { max: 50 });
await api.leakradar.email.export('john@example.com', { format: 'csv' });
await api.leakradar.email.lockedExistsBulk(['a@x.com', 'b@y.com'], true);
```

### Domain

```ts
await api.leakradar.domain.summary('example.com', { light: true });
await api.leakradar.domain.employees('example.com', { page_size: 100 });
await api.leakradar.domain.customers('example.com');
await api.leakradar.domain.subdomains('example.com');
await api.leakradar.domain.urls('example.com');
await api.leakradar.domain.report('example.com');   // summary + every bucket in one call
```

### Advanced search

Filter fields accept a single value or an array — scalars are auto‑wrapped.

```ts
await api.leakradar.advanced.search({ url_domain: 'example.com', password_strength: 'weak' }, { page_size: 100 });
await api.leakradar.advanced.unlock({ email_domain: 'example.com' }, { max: 100 });
const t = await api.leakradar.advanced.unlockAsync({ username: 'admin' }, { max: 500 });
await api.leakradar.advanced.export({ url_domain: 'example.com' }, 'csv');
await api.leakradar.advanced.exportUrls({ url_domain: 'example.com' });
```

### Raw stealer‑log search, containers & files

```ts
await api.leakradar.raw.search({ q: 'example.com' }, { page_size: 25, auto_unlock: false });
// Search + unlock + parse in one call → the actual credential / cookie lines (Pro, 1 credit)
await api.leakradar.raw.searchLines({ q: 'example.com' }, { max_hits: 20 });
await api.leakradar.rawSearchHistory({ limit: 10 });
await api.leakradar.deleteRawSearchHistory({ all: true });
await api.leakradar.raw.listParts({ container_id: 123, entry_path: 'path/file.txt' });
await api.leakradar.raw.getPart({ container_id: 123, entry_path: 'path/file.txt', seq: 0 });

await api.leakradar.container.tree({ container_id: 123, prefix: '' });
await api.leakradar.container.subfolders({ container_id: 123 });
await api.leakradar.container.fileInfo({ container_id: 123, entry_path: 'path/file.txt' });

await api.leakradar.rawFiles.list();
await api.leakradar.rawFiles.preview({ sha256_original: '…' });   // preview first to claim access
await api.leakradar.rawFiles.download({ sha256_original: '…', expires_in: 900 });
```

### The unlocked archive & lists

```ts
await api.leakradar.unlocked.list({ page: 1, page_size: 100, status: 'new' });
await api.leakradar.unlocked.setStatus(leakId, 'in_progress');
await api.leakradar.unlocked.upsertComment(leakId, 'investigating');
await api.leakradar.unlocked.setList(leakId, listId);
await api.leakradar.unlocked.bulkStatus({ leak_ids: ['a', 'b'], target_status: 'fixed' });
await api.leakradar.unlocked.export({ format: 'csv' });

await api.leakradar.lists.create({ name: 'Q3 incident', color: '#ff0000' });
await api.leakradar.lists.list();
await api.leakradar.lists.clear(listId);      // async → poll lists.taskStatus(task_id)
```

### Notifications & monitors

```ts
// Delivery channels
const method = await api.leakradar.notifications.methods.create({ type: 'email', value: 'soc@acme.com' });

// Monitors
await api.leakradar.notifications.create({ type: 'domain', value: 'acme.com', method_id: method.id });
await api.leakradar.notifications.list();
await api.leakradar.notifications.setActive(id, false);
await api.leakradar.notifications.stats();

// Runs
await api.leakradar.notifications.runs.list({ page_size: 20 });
await api.leakradar.notifications.runs.items(runId);
await api.leakradar.notifications.runs.unlock(runId, { max: 50 });
await api.leakradar.notifications.runs.export(runId, { format: 'csv' });

// One‑call setup: ensure a method + create a domain monitor
await api.leakradar.monitor.quickAdd({ domain: 'acme.com', methodType: 'email' });
```

### Dark web

```ts
await api.leakradar.darkWeb.search('acme', { page_size: 25, sort_by: 'published_at' });
await api.leakradar.darkWeb.getPost(postId);
await api.leakradar.darkWeb.sources();
await api.leakradar.darkWeb.stats();
await api.leakradar.darkWeb.digest('acme.com');   // last 7 days, or all monitored domains if omitted
```

### Passwords, cross‑source, misc

```ts
await api.leakradar.password.range({ prefix: '5BAA6' });   // k‑anonymity, free
await api.leakradar.password.pwned('hunter2');             // → { pwned, count }

await api.leakradar.crossSourceCheck({ email: 'john@example.com', domain: 'example.com' });
await api.leakradar.searchHistory({ page: 1, limit: 20 });
await api.leakradar.unlock({ leak_ids: ['id1', 'id2'] });
await api.leakradar.exports({ page: 1 });
```

### Async tasks

`unlockAsync` (email / advanced / raw) returns `{ task_id }`. Poll it:

```ts
const { task_id } = await api.leakradar.raw.unlockAsync({ q: 'example.com' }, 50);

// Server long‑poll (~25s), or client loop until done:
const done = await api.leakradar.tasks.pollUntilDone(task_id, { timeoutMs: 120000 });
```

---

## Webhooks (`api.webhooks`)

Every finding from your monitors (`api.tracking` and `api.tracking.leakradar`) is POSTed to one HTTPS endpoint per account. The SDK detects the format from the URL: Slack, Discord, Microsoft Teams and Google Chat URLs get a native message, and any other URL gets a signed JSON `tracking.finding` event.

```ts
const { secret } = await api.webhooks.set({ url: 'https://example.com/hooks/checkleaked' }); // secret: returned ONCE
await api.webhooks.get();     // { url, enabled, format, secret_hint, last_status, … } | null
await api.webhooks.test();    // { delivered, status, error, duration_ms }
await api.webhooks.set({ url: 'https://example.com/hooks/checkleaked', rotate_secret: true });
await api.webhooks.delete();
```

To verify deliveries on your server, use the raw body, not re-serialized JSON:

```ts
import express from 'express';
import { verifyWebhookSignature } from 'checkleakedcc';

app.post('/hooks/checkleaked', express.raw({ type: '*/*' }), async (req, res) => {
  const ok = await verifyWebhookSignature(process.env.CL_WEBHOOK_SECRET!, req.header('x-checkleaked-signature'), req.body);
  if (!ok) return res.sendStatus(401);
  const event = JSON.parse(req.body.toString('utf8')); // { event: 'tracking.finding', … }
  res.sendStatus(204);
});
```

Signature format: `X-CheckLeaked-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`. Signatures older than 5 minutes are rejected (set `toleranceSeconds` to change this).

## Private bots (`api.privateBots`)

On Pro or Plus, you can run the CheckLeaked commands under **your own** Discord or Telegram bot. The token is validated, stored encrypted and never returned, and the bot answers only your account.

```ts
await api.privateBots.set({ platform: 'telegram', token: '123456:ABC…' }); // → { bot: { state, bot_username, invite_url, … } }
await api.privateBots.list();                     // { bots, plan_ok, configured, max_per_platform }
await api.privateBots.setEnabled('telegram', false);
await api.privateBots.delete('telegram');
```

---

## WormGPT (`api.wormgpt`)

WormGPT is an uncensored LLM for security research, behind `wormgpt.checkleaked.com`. It authenticates with your CheckLeaked key and speaks the OpenAI chat-completions protocol. Each call uses one unit of your WormGPT daily quota (Pro 250, Plus 100, reset at 00:00 UTC). This quota is separate from search credits.

```ts
// One question → text
const text = await api.wormgpt.ask('What does this Sigma rule detect? …', { system: 'Be concise.', model: 'wormv6' });

// Full chat completion (OpenAI shape)
const res = await api.wormgpt.chat({ messages: [{ role: 'user', content: 'Hi' }] });

// Agent mode: the model runs web search / fetch and the CheckLeaked leak & OSINT tools
// (dehashed, leak_check, leakradar, ghunt, whois, dns, …) itself. `tool_results` lists what ran.
const run = await api.wormgpt.chat({ messages: [{ role: 'user', content: 'What leaked for acme.com this year?' }], tools_enabled: true });

// Streaming, with agent tool events
for await (const ev of api.wormgpt.stream({ messages, tools_enabled: true })) {
  if (ev.type === 'content') process.stdout.write(ev.delta);
  if (ev.type === 'tool_start') console.error(`\n[${ev.tool}]`);
}

await api.wormgpt.models(); // model ids (no key, no quota)
await api.wormgpt.tools();  // the agent's tool catalog (no key, no quota)
await api.wormgpt.usage();  // { dailyLimit, todayUsage, dailyRemaining }
```

> In agent mode, `chat()` streams internally and returns a single completion. A long agent run would otherwise sit silent for longer than Cloudflare's 100-second origin limit and fail with a 524.

Any OpenAI SDK works too: `new OpenAI({ baseURL: 'https://wormgpt.checkleaked.com/v1', apiKey: '<your CheckLeaked key>' })`.

When the daily quota runs out, calls throw `CheckLeakedRateLimitError`.

## AI investigations & Deep Search reports (`api.ai`)

```ts
// WormGPT OSINT dossier (Pro): the agent searches the web and runs the leak tools itself.
// It can take ~3 minutes. One call = one WormGPT quota unit. Never auto-retried.
const { report, meta } = await api.ai.investigate('john@example.com', { type: 'email' });
console.log(report.markdown, report.sources); // markdown + [{ title, url }]

// Ground it with findings you already paid for (optional):
await api.ai.investigate('john@example.com', { findings: { leakcheck: rows, dehashed: moreRows } });

// Structured risk dossier over findings you hold (no new searches are run)
const deep = await api.ai.deepReport({ term: 'john@example.com', type: 'email', leakcheck: rows });
deep.report.risk;            // { score, level, rationale }
deep.report.recommendations; // string[]

// PDF (free)
const pdf = await api.ai.deepReportPdf({ report: deep.report, meta: deep.meta, investigation: report });
fs.writeFileSync('dossier.pdf', Buffer.from(pdf));
```

Refusals throw with a stable `error.code`: `worm_pro_required`, `worm_throttled` (15 s cooldown), `worm_busy`, `worm_quota`, `report_no_findings`, and others.

---

## MCP: Model Context Protocol (`api.mcp`)

### Use CheckLeaked from Claude Desktop, Claude Code, Cursor, VS Code, Windsurf

You can connect in two ways. Both use the same key and the same tool names.

**Hosted server** (no install): `https://mcp.checkleaked.cc/mcp`, with `Authorization: Bearer <key>`.

**Local server** (this package, stdio, zero dependencies):

```json
{
  "mcpServers": {
    "checkleaked": {
      "command": "npx",
      "args": ["-y", "checkleakedcc", "mcp"],
      "env": { "CHECKLEAKED_API_KEY": "YOUR_API_KEY" }
    }
  }
}
```

Claude Code: `claude mcp add checkleaked --env CHECKLEAKED_API_KEY=YOUR_API_KEY -- npx -y checkleakedcc mcp`

To print a ready-made config, run `npx checkleakedcc mcp-config <claude-desktop|claude-code|cursor|vscode|windsurf> [--local]`. Without `--local`, it prints the hosted-server config.

The local server exposes **52 tools**, covering every SDK area: search, tracking, LeakRadar, OSINT, the registry, webhooks, private bots, WormGPT chat and AI investigations. Every tool carries MCP annotations: `readOnlyHint` marks free lookups, and `destructiveHint` marks deletes. The free tools work without a key. Flags:

- `--read-only` exposes only lookups that spend nothing.
- `--include a,b` and `--exclude a,b` choose tools by name.

### Tool use from your own agent (Claude API / OpenAI)

```ts
import Anthropic from '@anthropic-ai/sdk';

const tools = api.mcp.anthropicTools({ readOnly: true }); // or api.mcp.openAITools()
const msg = await anthropic.messages.create({ model: 'claude-opus-5-5', max_tokens: 2048, tools, messages });
for (const block of msg.content) {
  if (block.type === 'tool_use') {
    const result = await api.mcp.runTool(block.name, block.input as Record<string, unknown>); // validated, then executed
  }
}
```

### Call the hosted MCP server from code

```ts
const tools = await api.mcp.remote.listTools();                 // works without a key
const out = await api.mcp.remote.callTool('checkleaked_ping', {});
const json = await api.mcp.remote.callToolJson('checkleaked_breach_info', { name: 'Adobe' });
await api.mcp.remote.close();
```

### Embed the MCP server

```ts
import { CheckLeakedCC, CheckLeakedMcpServer, createCheckLeakedTools } from 'checkleakedcc';

const server = new CheckLeakedMcpServer({ tools: createCheckLeakedTools(CheckLeakedCC.fromEnv()) });
const reply = await server.handle(jsonRpcMessage); // transport-agnostic JSON-RPC handler
await api.mcp.serveStdio();                        // or serve stdio directly
```

---

## Free tools (no key)

```ts
const free = new CheckLeakedCC({ allowMissingApiKey: true });

await free.kanon.pwnedPassword('hunter2');   // { pwned, count, prefix } — only 5 chars of SHA-1 are sent
await free.kanon.emailBreach('a@b.com');     // { found, sources, fields } — only 24 hex of SHA-256 are sent

await free.breaches.get('Adobe', { lang: 'es' });
await free.breaches.search({ search: 'linkedin', itemsPerPage: 10, sortBy: 'PwnCount' });
await free.breaches.find('linked');          // fast autocomplete
await free.breaches.latest();
await free.breaches.reportPdf('LinkedIn');   // ArrayBuffer

await free.news.latest({ lang: 'fr' });
await free.news.list({ limit: 5 });
await free.site.plans();
await free.site.faq('api key');
await free.site.changelog({ limit: 5 });
await free.site.stats();
await free.nameInsight('María');
```

---

## CLI

```bash
export CHECKLEAKED_API_KEY=…
npx checkleakedcc tools                                   # list the 52 tools
npx checkleakedcc call checkleaked_domain_whois '{"domain":"example.com"}'
npx checkleakedcc ask "Explain Kerberoasting" --tools     # streams a WormGPT answer
npx checkleakedcc investigate john@example.com --type email
npx checkleakedcc mcp                                     # MCP server over stdio
npx checkleakedcc mcp-config cursor --local
```

---

## Error handling

Every failure throws a typed error you can narrow with `instanceof`:

```ts
import {
  CheckLeakedError,
  CheckLeakedApiError,
  CheckLeakedAuthError,
  CheckLeakedValidationError,
  CheckLeakedRateLimitError,
  CheckLeakedServerError,
  CheckLeakedNetworkError,
} from 'checkleakedcc';

try {
  await api.crackHash('…');
} catch (e) {
  if (e instanceof CheckLeakedAuthError) console.error('bad key or insufficient plan');
  else if (e instanceof CheckLeakedRateLimitError) console.error('slow down', e.retryAfterMs);
  else if (e instanceof CheckLeakedApiError) console.error(e.message, e.status, e.code, e.body);
  else if (e instanceof CheckLeakedError) console.error(e.message);
}
```

Some API errors include a stable machine code, such as `worm_pro_required`, `report_throttled` or `rate_limited`. The SDK exposes it as `error.code` and picks the error class from it:

- `*_unauthorized` and `*_pro_required` → `CheckLeakedAuthError`
- `*_throttled`, `*_busy` and `*_quota` → `CheckLeakedRateLimitError`

`429` responses are retried automatically (honoring `Retry-After` up to 60 s). Timeouts, network errors and `5xx` are retried for `GET` only (pass `retry: true` to opt a POST in), so a search that may already have spent a lookup is never sent twice. AI, WormGPT and webhook / bot writes are never retried. CheckLeaked endpoints that reply `HTTP 200` with `{ error: "..." }` are surfaced as thrown errors by default — set `throwOnErrorBody: false` to receive the raw body instead.

---

## Response types

Every method is fully typed. The public response types (e.g. `DehashedResult`, `EmailSearchResponse`, `LeakDetails`) carry index signatures so they stay forward‑compatible as the API grows. For the exhaustive, sample‑derived nested shapes (generated from live responses with quicktype), reach for the `schemas` namespace:

```ts
import { schemas, type DomainSummaryResponse } from 'checkleakedcc';

type Whois = schemas.Whois;
type Leak = schemas.UnlockedLeaksItem;
```

## Rate limits

The bot API allows **2 requests/second** per key (and per IP). Space out bulk workloads accordingly; the SDK does not throttle for you.

## License

[MIT](https://choosealicense.com/licenses/mit/)
