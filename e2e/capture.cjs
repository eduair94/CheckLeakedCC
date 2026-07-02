/* eslint-disable */
// Capture full, untruncated JSON samples for quicktype. Multiple varied inputs
// per type let quicktype infer correct optionality. Spaced for the 2 req/s cap.
//   KEY=... node e2e/capture.cjs
const fs = require('fs');
const path = require('path');
const { CheckLeakedCC } = require('../dist/index.js');

const KEY = process.env.KEY || process.argv[2];
if (!KEY) { console.error('KEY required'); process.exit(1); }

const api = new CheckLeakedCC({ apiKey: KEY, timeout: 120000, throwOnErrorBody: false });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dir = path.join(__dirname, 'samples');
fs.mkdirSync(dir, { recursive: true });

// [typeName, fn] — several entries with the same typeName are merged by quicktype.
const jobs = [
  ['Valid', () => api.valid()],
  ['IpLookup', () => api.ip('1.1.1.1')],
  ['IpLookup', () => api.ip('8.8.8.8')],
  ['PasswordRange', () => api.leakradar.password.range({ prefix: '5BAA6', limit: 5 })],
  ['PasswordRange', () => api.leakradar.password.range({ prefix: 'ABCDE', limit: 5 })],
  ['Pwned', () => api.leakradar.password.pwned('password')],
  ['Pwned', () => api.leakradar.password.pwned('hunter2')],
  ['DarkWebSources', () => api.leakradar.darkWeb.sources()],
  ['DarkWebStats', () => api.leakradar.darkWeb.stats()],
  ['SearchHistory', () => api.leakradar.searchHistory({ page: 1, limit: 5 })],
  ['ExportsList', () => api.leakradar.exports({ page: 1, page_size: 5 })],
  ['NotificationList', () => api.leakradar.notifications.list()],
  ['NotificationMethodList', () => api.leakradar.notifications.methods.list()],
  ['NotificationStats', () => api.leakradar.notifications.stats()],
  ['NotificationRuns', () => api.leakradar.notifications.runs.list({ page: 1, page_size: 5 })],
  ['UnlockedListList', () => api.leakradar.lists.list()],
  ['UnlockedLeaks', () => api.leakradar.unlocked.list({ page: 1, page_size: 5 })],
  ['TrackingEntries', () => api.tracking.list()],
  ['TrackingLimit', () => api.tracking.limits()],
  ['TrackingLeakRadarEntries', () => api.tracking.leakradar.list()],
  ['DehashedResult', () => api.dehashed('test1234@mail.com', 'email')],
  ['DehashedResult', () => api.dehashed('example.com', 'domain')],
  ['LeakCheckResult', () => api.leakCheck('test1234@mail.com', 'email')],
  ['EmailSearchResponse', () => api.leakradar.email.search('test@example.com', { auto_unlock: false, page_size: 5 })],
  ['DomainSummary', () => api.leakradar.domain.summary('example.com')],
  ['DomainSummary', () => api.leakradar.domain.summary('checkleaked.cc')],
  ['DomainReport', () => api.leakradar.domain.report('checkleaked.cc')],
  ['AdvancedSearch', () => api.leakradar.advanced.search({ password: ['test'] }, { page_size: 5 })],
  ['RawSearch', () => api.leakradar.raw.search({ q: 'example.com' }, { auto_unlock: false, page_size: 5 })],
  ['DarkWebSearch', () => api.leakradar.darkWeb.search('gmail', { page_size: 5 })],
  ['CrackHash', () => api.crackHash('5f4dcc3b5aa765d61d8327deb882cf99')],
  ['Ghunt', () => api.ghunt('test1234@gmail.com')],
  ['Experimental', () => api.experimental('test1234@mail.com', 'email')],
];

const counters = {};
(async () => {
  for (const [name, fn] of jobs) {
    counters[name] = (counters[name] || 0) + 1;
    const i = counters[name];
    try {
      const res = await fn();
      const isErr = res && typeof res === 'object' && typeof res.error === 'string' && res.error;
      const suffix = isErr ? `${i}.ERROR` : `${i}`;
      fs.writeFileSync(path.join(dir, `${name}-${suffix}.json`), JSON.stringify(res, null, 2));
      console.log(`${name}-${suffix}  ${isErr ? '(error: ' + res.error + ')' : 'ok'}`);
    } catch (e) {
      console.log(`${name}-${i}  THREW: ${e.message}`);
    }
    await sleep(800);
  }
  console.log('\nSamples written to', dir);
})();
