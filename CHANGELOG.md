# Changelog

All notable changes to `checkleakedcc` are documented here. This project follows [Semantic Versioning](https://semver.org).

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
- Full TypeScript types derived from real API responses.
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
