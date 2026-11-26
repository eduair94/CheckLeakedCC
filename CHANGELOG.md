# Changelog

All notable changes to `checkleakedcc` are documented here. This project follows [Semantic Versioning](https://semver.org).

## 2.1.0

Adds the WormGPT integration, an MCP server and client, and the rest of the public API (webhooks, private bots, breach registry, news, WHOIS, name insight, k-anonymity checks, Deep Search AI). Tested on Node.js 20, 22, 24 and 26 (current). No breaking changes.

### Added

- **WormGPT** (`api.wormgpt`), using the same API key:
  - `ask` and `chat` (OpenAI-compatible) and `stream` (typed SSE events).
  - Agent mode (`tools_enabled`). The model runs web search and the CheckLeaked leak and OSINT tools itself, and `tool_results` lists each tool it ran. In this mode `chat()` streams internally, so long runs don't hit Cloudflare 524 errors.
  - `models()`, `tools()` and `usage()`.
  - An exhausted daily quota throws `CheckLeakedRateLimitError`.
- **AI** (`api.ai`):
  - `investigate()` runs a WormGPT OSINT dossier: markdown plus sources. It accepts optional findings as grounding.
  - `deepReport()` returns a structured risk dossier.
  - `deepReportPdf()` renders a dossier as a PDF.
  - These calls are never auto-retried, and their timeouts allow for 3-minute runs.
- **MCP** (`api.mcp`, plus the `checkleakedcc` bin):
  - `npx -y checkleakedcc mcp` starts a zero-dependency stdio MCP server with 52 annotated tools that cover the whole SDK. Free tools work without a key. Options: `--read-only`, `--include`, `--exclude`.
  - `api.mcp.remote` is a Streamable HTTP client for the hosted server at `mcp.checkleaked.cc`. It keeps one session, re-initializes once if the session expires, and parses both JSON and SSE replies.
  - `api.mcp.anthropicTools()`, `api.mcp.openAITools()` and `runTool()` support tool use from your own agent.
  - `CheckLeakedMcpServer` is a transport-agnostic JSON-RPC handler. `mcpConfig()` and `claudeCodeMcpCommand()` generate configs for Claude Desktop, Claude Code, Cursor, VS Code and Windsurf.
- **CLI**: `checkleakedcc tools | call <tool> '<json>' | ask "<q>" [--tools] | investigate <subject> | mcp | mcp-config <client>`.
- **Webhooks** (`api.webhooks`): `get`, `set` (with `format` and `rotate_secret`), `test` and `delete`. Receivers can check deliveries with `verifyWebhookSignature()` (HMAC-SHA256 with a replay window) and `signWebhookPayload()`.
- **Private bots** (`api.privateBots`): `list`, `set`, `setEnabled` and `delete` for your own Discord or Telegram bot.
- **Breach registry** (`api.breaches`): `get`, `search`, `find`, `latest` and `reportPdf`. **News** (`api.news`): `latest` and `list`. **Site** (`api.site`): `plans`, `faq`, `changelog` and `stats`. None of these need a key.
- **k-anonymity** (`api.kanon`): `pwnedPassword` and `emailBreach`. The hash is computed locally and only a prefix is sent.
- **Core**: `api.whois(domain)` and `api.nameInsight(name)`.
- **LeakRadar**: `raw.searchLines()` searches, unlocks and parses raw blocks in one call. Also added: `rawSearchHistory()` and `deleteRawSearchHistory()`.
- `CheckLeakedCC.fromEnv()` reads `CHECKLEAKED_API_KEY`. `allowMissingApiKey` creates a keyless client for the free tools.
- `error.code` exposes the API's machine code when there is one, and the error class follows it (for example `worm_pro_required` → `CheckLeakedAuthError`).
- Per-request `timeout`, `signal` (AbortSignal), `base`, `auth` and `throwOnErrorBody` options on `http.request()`.

### Changed

- **Retry policy is now safer.** Timeouts, dropped connections and 5xx responses are retried only for `GET` requests, or when the call passes `retry: true`. A timed-out search, crack or unlock `POST` may already have spent a lookup, so it is no longer re-sent. `429` responses are still retried for every method.
- The request timeout now also covers reading the response body.
- A caller's `AbortSignal` cancels the request without triggering retries.
- A `Retry-After` longer than 60 s is thrown to the caller instead of being waited out.
- Error bodies of binary routes (PDF/CSV) are parsed, so their messages are no longer lost.
- The default `User-Agent` is now `checkleakedcc-node/<version>`.
- Webhook and private-bot responses are unwrapped from the API's `{ success, error }` envelope.
- Hashing and HMAC use Web Crypto instead of `node:crypto`, so the SDK runs on Bun, Deno and edge runtimes too.
- `api.http` is typed as the concrete `HttpClient`.

## 2.0.0

Complete rewrite — full API coverage, typed, modern tooling.

### Added

- **Full endpoint coverage** (~85 endpoints) grouped into scoped, discoverable resources:
  - Core: `valid`, `auth`, `leakCheck`, `dehashed`, `experimental`, `crackHash`, `ghunt`, `ip`.
  - Breach monitoring: `tracking.*` (native) and `tracking.leakradar.*`.
  - **LeakRadar**: `leakradar.email` / `domain` / `advanced` / `raw` / `container` / `rawFiles` / `unlocked` / `lists` / `notifications` (+ `.methods`, `.runs`) / `darkWeb` / `password` / `monitor` / `tasks`, plus top-level `crossSourceCheck`, `searchHistory`, `unlock`, `exports`.
- **Typed error hierarchy**: `CheckLeakedError` → `Auth` / `Validation` / `RateLimit` / `Server` / `Network`.
- **Automatic retries** on 429 (honoring `Retry-After`) and 5xx, with exponential backoff.
- **Async task helpers**: `unlockAsync` → `leakradar.tasks.pollUntilDone`.
- Advanced-search filter values are auto-wrapped into arrays (the API requires lists).
- Full TypeScript types derived from real API responses; exhaustive
  sample-generated shapes (via quicktype) are also exported under the
  `schemas` namespace.
- **Dual ESM + CommonJS** build with a proper `exports` map; ships `.d.ts` + `.d.mts` and sourcemaps.

### Changed

- **Zero runtime dependencies** — the transport now uses the native `fetch` (dropped `axios`).
- `dehashed(entry, type, page)` still works; the third argument now also accepts an options object.
- Errors: a `200` response carrying `{ error: "..." }` is thrown by default (set `throwOnErrorBody: false` to opt out).
- Requires **Node.js ≥ 20**.
- License changed to **MIT**.
- Tooling upgraded to 2026 baselines: TypeScript 6, ESLint 10 + typescript-eslint (replacing deprecated TSLint), Jest 30, Prettier 3, tsup for the dual build.

### Migration from 1.x

```diff
- const CheckLeakedCC = require('checkleakedcc').default
+ import CheckLeakedCC from 'checkleakedcc'          // ESM
+ const CheckLeakedCC = require('checkleakedcc').default  // CJS still works
```

`api.experimental(entry, type)` and `api.dehashed(entry, type, page)` are unchanged. Everything else is additive.

## 1.2.1

- Initial `experimental` and `dehashed` search methods.
