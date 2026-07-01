/* eslint-disable */
// Live E2E probe: exercises endpoints with a real bot key, captures response
// shapes, and dumps them to e2e/out.json. Spaced to respect the 2 req/sec limit.
const fs = require('fs');
const path = require('path');
const { CheckLeakedCC } = require('../dist/index.js');

const KEY = process.env.KEY || process.argv[2];
if (!KEY) {
  console.error('Usage: node e2e/probe.cjs <API_KEY>  (or KEY env)');
  process.exit(1);
}

const api = new CheckLeakedCC({ apiKey: KEY, timeout: 120000, throwOnErrorBody: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GAP = 800;

/** Produce a compact type sketch of a value (1-2 levels deep). */
function sketch(v, depth = 0) {
  if (v === null) return 'null';
  if (Array.isArray(v)) {
    if (v.length === 0) return 'any[]';
    return sketch(v[0], depth + 1) + '[]';
  }
  const t = typeof v;
  if (t !== 'object') return t;
  if (depth >= 2) return 'object';
  const out = {};
  for (const k of Object.keys(v).slice(0, 40)) out[k] = sketch(v[k], depth + 1);
  return out;
}

const results = {};
async function probe(name, fn) {
  try {
    const res = await fn();
    results[name] = { ok: true, shape: sketch(res), sample: truncate(res) };
    console.log(`\n## ${name}\n` + JSON.stringify(results[name].shape, null, 2));
  } catch (e) {
    results[name] = { ok: false, error: String((e && e.message) || e), name: e && e.name };
    console.log(`\n## ${name} -> ERROR: ${results[name].error}`);
  }
  await sleep(GAP);
}

function truncate(v) {
  const s = JSON.stringify(v);
  if (!s) return v;
  if (s.length <= 4000) return v;
  try {
    return JSON.parse(s.slice(0, 4000));
  } catch {
    return s.slice(0, 4000);
  }
}

(async () => {
  // --- free / read-only first ---
  await probe('valid', () => api.valid());
  await probe('auth', () => api.auth());
  await probe('ip', () => api.ip('1.1.1.1'));
  await probe('leakradar.password.range', () => api.leakradar.password.range({ prefix: '5BAA6', limit: 5 }));
  await probe('leakradar.password.pwned', () => api.leakradar.password.pwned('password'));
  await probe('leakradar.darkWeb.sources', () => api.leakradar.darkWeb.sources());
  await probe('leakradar.darkWeb.stats', () => api.leakradar.darkWeb.stats());
  await probe('leakradar.searchHistory', () => api.leakradar.searchHistory({ page: 1, limit: 5 }));
  await probe('leakradar.exports', () => api.leakradar.exports({ page: 1, page_size: 5 }));
  await probe('leakradar.notifications.list', () => api.leakradar.notifications.list());
  await probe('leakradar.notifications.methods.list', () => api.leakradar.notifications.methods.list());
  await probe('leakradar.notifications.stats', () => api.leakradar.notifications.stats());
  await probe('leakradar.notifications.runs.list', () => api.leakradar.notifications.runs.list({ page: 1, page_size: 5 }));
  await probe('leakradar.lists.list', () => api.leakradar.lists.list());
  await probe('leakradar.unlocked.list', () => api.leakradar.unlocked.list({ page: 1, page_size: 5 }));
  await probe('tracking.limits', () => api.tracking.limits());
  await probe('tracking.list', () => api.tracking.list());
  await probe('tracking.leakradar.limits', () => api.tracking.leakradar.limits());
  await probe('tracking.leakradar.list', () => api.tracking.leakradar.list());

  // --- credit-consuming search shape discovery (single benign probes) ---
  await probe('leakradar.email.search', () => api.leakradar.email.search('test@example.com', { auto_unlock: false, page_size: 5 }));
  await probe('leakradar.domain.summary', () => api.leakradar.domain.summary('example.com', { light: true }));
  await probe('leakradar.advanced.search', () => api.leakradar.advanced.search({ password: 'test' }, { page_size: 3 }));
  await probe('leakradar.raw.search', () => api.leakradar.raw.search({ q: 'example.com' }, { auto_unlock: false, page_size: 3 }));
  await probe('leakradar.darkWeb.search', () => api.leakradar.darkWeb.search('example', { page_size: 3 }));
  await probe('experimental', () => api.experimental('test1234@mail.com', 'email'));
  await probe('dehashed', () => api.dehashed('test1234@mail.com', 'email'));
  await probe('leakCheck', () => api.leakCheck('test1234@mail.com', 'email'));
  await probe('crackHash', () => api.crackHash('5f4dcc3b5aa765d61d8327deb882cf99'));
  await probe('ghunt', () => api.ghunt('test1234@gmail.com'));

  const outPath = path.join(__dirname, 'out.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\n\nWrote ${outPath}`);
})();
