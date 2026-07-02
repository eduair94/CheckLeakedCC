# checkleakedcc

Official Node.js / TypeScript SDK for **[checkleaked.cc](https://checkleaked.cc)** — data‑breach search, hash cracking, Google‑account OSINT, breach monitoring, and the full **LeakRadar** integration (email / domain / advanced / raw search, the unlocked archive, notifications, and dark‑web indexing).

Fully typed, zero‑config, with automatic retries, typed errors, and helpers for the async unlock/export task flow.

```bash
npm i checkleakedcc
```

## Requirements

- A **bot API key** — get one at **[checkleaked.cc/botLinks](https://checkleaked.cc/botLinks)**.
- **Node.js ≥ 20** (uses the native `fetch`).

Ships **dual ESM + CommonJS** with full type declarations, and has **zero runtime dependencies**.

---

## Quick start

```ts
import CheckLeakedCC from 'checkleakedcc';

const api = new CheckLeakedCC('YOUR-API-KEY');

// Classic breach search
const res = await api.experimental('john@example.com', 'email');
console.log(res.found, res.results);

// Dehashed
const dh = await api.dehashed('john@example.com', 'email');

// LeakRadar domain intelligence
const report = await api.leakradar.domain.report('example.com');

// Breach monitoring
await api.tracking.add('example.com', 'domain');
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
  timeout: 120000,        // ms, default 120000
  maxRetries: 2,          // retries on 429 / 5xx / transient network errors
  retryDelayMs: 500,      // base backoff
  baseUrl: 'https://api.checkleaked.cc/api',
  userAgent: 'my-app/1.0',
  throwOnErrorBody: true, // throw when the API replies `{ error: "..." }` on a 200 (default true)
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
| `api.ip(ip?)` | IP geolocation + ASN + WHOIS (public, free). Omit `ip` for your own. |

```ts
await api.dehashed('acme.com', 'domain', { page: 2, wildcard: true });
await api.experimental('john', 'username', { loadAll: true });
await api.leakCheck('+15551234567', 'phone');
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

## Error handling

Every failure throws a typed error you can narrow with `instanceof`:

```ts
import {
  CheckLeakedError,
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
  else if (e instanceof CheckLeakedError) console.error(e.message, (e as any).status, (e as any).body);
}
```

`429` and `5xx` responses are retried automatically (honoring `Retry-After`). CheckLeaked endpoints that reply `HTTP 200` with `{ error: "..." }` are surfaced as thrown errors by default — set `throwOnErrorBody: false` to receive the raw body instead.

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
