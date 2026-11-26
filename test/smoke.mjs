// Live smoke test against the production API using ONLY read-only / free calls.
//   CHECKLEAKED_API_KEY=... node test/smoke.mjs
// Without a key, only the keyless checks run. Never spends search credits.
import CheckLeakedCC, { CheckLeakedApiError, CheckLeakedAuthError, verifyWebhookSignature, signWebhookPayload } from '../dist/index.mjs';

const key = process.env.CHECKLEAKED_API_KEY || '';
const api = new CheckLeakedCC({ apiKey: key, allowMissingApiKey: true });
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function check(name, fn, { needsKey = false, expectError } = {}) {
  if (needsKey && !key) return results.push({ name, status: 'skip' });
  const t = Date.now();
  try {
    const out = await fn();
    if (expectError) return results.push({ name, status: 'FAIL', detail: 'expected an error, got success' });
    results.push({ name, status: 'ok', ms: Date.now() - t, detail: summarize(out) });
  } catch (e) {
    if (expectError && expectError(e)) return results.push({ name, status: 'ok', ms: Date.now() - t, detail: `expected ${e.name}${e.code ? ` [${e.code}]` : ''}` });
    results.push({ name, status: 'FAIL', ms: Date.now() - t, detail: `${e.name}: ${e.message}${e.code ? ` [${e.code}]` : ''}` });
  }
  await sleep(600); // the bot API allows 2 req/s
}

function summarize(v) {
  if (Array.isArray(v)) return `array(${v.length})`;
  if (v && typeof v === 'object') return `{${Object.keys(v).slice(0, 6).join(',')}}`;
  return String(v).slice(0, 60);
}

console.log(`node ${process.version} — key ${key ? 'set' : 'not set'}`);

// Keyless
await check('kanon.pwnedPassword', async () => {
  const r = await api.kanon.pwnedPassword('password123');
  if (!r.pwned || r.prefix !== 'CBFDA') throw new Error('unexpected ' + JSON.stringify(r));
  return r;
});
await check('kanon.emailBreach', () => api.kanon.emailBreach('test@example.com'));
await check('breaches.get', () => api.breaches.get('Adobe'));
await check('breaches.search', async () => {
  const r = await api.breaches.search({ search: 'adobe', itemsPerPage: 2 });
  if (!Array.isArray(r.items)) throw new Error('no items');
  return r;
});
await check('breaches.find', () => api.breaches.find('linked'));
await check('breaches.latest', async () => {
  const r = await api.breaches.latest();
  if (!r.Name) throw new Error('no Name');
  return r;
});
await check('news.latest', () => api.news.latest());
await check('news.list', () => api.news.list({ limit: 1 }));
await check('site.plans', () => api.site.plans());
await check('site.faq', () => api.site.faq('api key'));
await check('site.changelog', () => api.site.changelog({ limit: 2 }));
await check('site.stats', () => api.site.stats());
await check('nameInsight', () => api.nameInsight('Maria'));
await check('wormgpt.models', async () => {
  const r = await api.wormgpt.models();
  if (!r.length) throw new Error('no models');
  return r;
});
await check('wormgpt.tools', () => api.wormgpt.tools());
await check('mcp.remote.listTools (hosted, keyless)', async () => {
  const r = await api.mcp.remote.listTools();
  if (r.length < 10) throw new Error('only ' + r.length + ' tools');
  return r;
});
await check('webhook signature roundtrip', async () => {
  const body = '{"event":"tracking.finding","test":true}';
  const header = await signWebhookPayload('s3cret', body);
  if (!(await verifyWebhookSignature('s3cret', header, body))) throw new Error('valid signature rejected');
  if (await verifyWebhookSignature('wrong', header, body)) throw new Error('bad secret accepted');
  return { ok: true };
});
await check('keyless client refuses keyed call locally', () => new CheckLeakedCC({ allowMissingApiKey: true }).valid(), { expectError: (e) => e instanceof CheckLeakedAuthError && e.status === 0 });

// Keyed, read-only
await check('valid', () => api.valid(), { needsKey: true });
await check('auth', () => api.auth(), { needsKey: true });
await check('ip', () => api.ip('8.8.8.8'), { needsKey: true });
await check('whois', () => api.whois('example.com'), { needsKey: true });
await check('tracking.limits', () => api.tracking.limits(), { needsKey: true });
await check('tracking.list', () => api.tracking.list(), { needsKey: true });
await check('tracking.leakradar.limits', () => api.tracking.leakradar.limits(), { needsKey: true });
await check('webhooks.get (unwrapped)', async () => {
  const r = await api.webhooks.get();
  if (r !== null && typeof r.url !== 'string') throw new Error('envelope not unwrapped: ' + JSON.stringify(r));
  return r ?? 'null (none configured)';
}, { needsKey: true });
await check('webhooks.test without webhook → typed error', async () => {
  const current = await api.webhooks.get();
  if (current) return 'skipped: a webhook exists';
  return api.webhooks.test();
}, { needsKey: true, expectError: (e) => e instanceof CheckLeakedApiError && /webhook/i.test(e.message) });
await check('privateBots.list (unwrapped)', async () => {
  const r = await api.privateBots.list();
  if (!Array.isArray(r.bots)) throw new Error('envelope not unwrapped: ' + JSON.stringify(r));
  return r;
}, { needsKey: true });
await check('leakradar.searchHistory', () => api.leakradar.searchHistory({ limit: 1 }), { needsKey: true });
await check('leakradar.rawSearchHistory', () => api.leakradar.rawSearchHistory({ limit: 1 }), { needsKey: true });
await check('leakradar.darkWeb.sources', () => api.leakradar.darkWeb.sources(), { needsKey: true });
await check('ai.deepReport (no findings → validation code)', () => api.ai.deepReport({ term: 'smoke@example.com', type: 'email' }), {
  needsKey: true,
  expectError: (e) => e instanceof CheckLeakedApiError && /^report_/.test(e.code || ''),
});
await check('mcp.remote.callTool checkleaked_verify_auth', async () => {
  const r = await api.mcp.remote.callTool('checkleaked_verify_auth', {});
  if (r.isError) throw new Error(r.content?.[0]?.text);
  return r;
}, { needsKey: true });
await check('mcp local tool: checkleaked_ping', () => api.mcp.runTool('checkleaked_ping'), { needsKey: true });
await api.mcp.remote.close();

const width = Math.max(...results.map((r) => r.name.length));
for (const r of results) console.log(`${r.status.padEnd(4)}  ${r.name.padEnd(width)}  ${r.ms != null ? `${r.ms}ms`.padStart(7) : ''}  ${r.detail || ''}`);
const failed = results.filter((r) => r.status === 'FAIL');
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length ? `, ${failed.length} FAILED` : ''}`);
process.exitCode = failed.length ? 1 : 0;
