import * as fs from 'fs';
import * as path from 'path';
import { CheckLeakedCC } from '../CheckLeakedCC';
import {
  CheckLeakedApiError,
  CheckLeakedAuthError,
  CheckLeakedNetworkError,
  CheckLeakedRateLimitError,
  CheckLeakedValidationError,
  errorFromResponse,
} from '../errors';
import { unwrapEnvelope } from '../envelope';
import type { FetchLike, IHttpClient, RequestOptions } from '../http';
import { HttpClient } from '../http';
import { mcpConfig, claudeCodeMcpCommand } from '../mcp/config';
import { negotiateProtocolVersion } from '../mcp/protocol';
import { RemoteMcpClient } from '../mcp/remote';
import { CheckLeakedMcpServer } from '../mcp/server';
import { createCheckLeakedTools, toAnthropicTools, toOpenAITools, validateArgs } from '../mcp/tools';
import { AiResource } from '../resources/AiResource';
import { BreachesResource } from '../resources/BreachesResource';
import { KanonResource, emailKanonHash, matchPwnedRange, splitPwnedHash } from '../resources/KanonResource';
import { PrivateBotsResource } from '../resources/PrivateBotsResource';
import { WebhooksResource } from '../resources/WebhooksResource';
import { SDK_VERSION } from '../version';
import { parseWebhookSignature, signWebhookPayload, verifyWebhookSignature } from '../webhooks';
import { readSse } from '../wormgpt/sse';

/** Records requests; answers with a queue of canned bodies. */
class FakeHttp implements IHttpClient {
  public calls: RequestOptions[] = [];
  constructor(private readonly answers: unknown[] = []) {}
  get last(): RequestOptions {
    return this.calls[this.calls.length - 1];
  }
  async request<T>(opts: RequestOptions): Promise<T> {
    this.calls.push(opts);
    return (this.answers.length ? this.answers.shift() : {}) as T;
  }
}

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
  });
}

function sseResponse(chunks: string[], headers: Record<string, string> = {}): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { 'content-type': 'text/event-stream', ...headers } });
}

/** A fetch double that records calls and replies from a handler. */
function fakeFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn: FetchLike = async (url, init) => {
    calls.push({ url, init: init || {} });
    return handler(url, init || {});
  };
  return { fn, calls };
}

const UUID = '11111111-2222-3333-4444-555555555555';

// ---------------------------------------------------------------------------

describe('version', () => {
  test('SDK_VERSION matches package.json', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8'));
    expect(SDK_VERSION).toBe(pkg.version);
  });
});

describe('HttpClient transport', () => {
  test('api base sends api-key; site base with auth none sends nothing; wormgpt sends Bearer', async () => {
    const { fn, calls } = fakeFetch(() => jsonResponse({ ok: 1 }));
    const http = new HttpClient({ apiKey: UUID, fetch: fn });
    await http.request({ method: 'GET', path: '/valid' });
    await http.request({ method: 'GET', path: '/plans', base: 'site', auth: 'none' });
    await http.request({ method: 'GET', path: '/v1/models', base: 'wormgpt' });
    const h = calls.map((c) => c.init.headers as Record<string, string>);
    expect(calls[0].url).toBe('https://api.checkleaked.cc/api/valid');
    expect(h[0]['api-key']).toBe(UUID);
    expect(h[0].Authorization).toBeUndefined();
    expect(calls[1].url).toBe('https://checkleaked.cc/api/plans');
    expect(h[1]['api-key']).toBeUndefined();
    expect(h[1].Authorization).toBeUndefined();
    expect(calls[2].url).toBe('https://wormgpt.checkleaked.com/v1/models');
    expect(h[2].Authorization).toBe(`Bearer ${UUID}`);
    expect(h[2]['api-key']).toBeUndefined();
    expect(h[0]['User-Agent']).toBe(`checkleakedcc-node/${SDK_VERSION}`);
  });

  test('constructor still requires a key unless allowMissingApiKey', () => {
    expect(() => new HttpClient({ apiKey: '' })).toThrow(/api key is required/);
    expect(() => new HttpClient({ allowMissingApiKey: true })).not.toThrow();
  });

  test('keyless client refuses keyed calls before any network I/O', async () => {
    const { fn, calls } = fakeFetch(() => jsonResponse({}));
    const http = new HttpClient({ allowMissingApiKey: true, fetch: fn });
    await expect(http.request({ method: 'GET', path: '/valid' })).rejects.toBeInstanceOf(CheckLeakedAuthError);
    expect(calls).toHaveLength(0);
    await expect(http.request({ method: 'GET', path: '/plans', base: 'site', auth: 'none' })).resolves.toEqual({});
  });

  test('heartbeat newlines before the JSON body are tolerated', async () => {
    const { fn } = fakeFetch(() => jsonResponse('\n\n\n{"success":true,"report":{"markdown":"# x","sources":[]}}'));
    const http = new HttpClient({ apiKey: 'k', fetch: fn });
    const res = await http.request<any>({ method: 'POST', path: '/worm_report', body: { term: 'a' } });
    expect(res.report.markdown).toBe('# x');
  });

  test('per-request throwOnErrorBody=false returns the body', async () => {
    const { fn } = fakeFetch(() => jsonResponse({ delivered: false, status: 500, error: 'endpoint said 500' }));
    const http = new HttpClient({ apiKey: 'k', fetch: fn });
    await expect(http.request({ method: 'POST', path: '/x' })).rejects.toBeInstanceOf(CheckLeakedApiError);
    await expect(http.request({ method: 'POST', path: '/x', throwOnErrorBody: false })).resolves.toMatchObject({ delivered: false });
  });

  test('does not sleep through a huge Retry-After', async () => {
    const { fn, calls } = fakeFetch(() => jsonResponse({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': '3600' } }));
    const http = new HttpClient({ apiKey: 'k', fetch: fn, maxRetries: 3 });
    await expect(http.request({ method: 'GET', path: '/x' })).rejects.toBeInstanceOf(CheckLeakedRateLimitError);
    expect(calls).toHaveLength(1);
  });

  test('timeout aborts and maps to a network error', async () => {
    const fn: FetchLike = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    const http = new HttpClient({ apiKey: 'k', fetch: fn, maxRetries: 0 });
    await expect(http.request({ method: 'GET', path: '/slow', timeout: 30 })).rejects.toThrow(/timed out after 30ms/);
  });

  test('caller AbortSignal cancels without retrying', async () => {
    let n = 0;
    const fn: FetchLike = (_url, init) => {
      n++;
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
      });
    };
    const http = new HttpClient({ apiKey: 'k', fetch: fn, maxRetries: 3 });
    const ctrl = new AbortController();
    const p = http.request({ method: 'GET', path: '/slow', signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 10);
    await expect(p).rejects.toThrow(/aborted/);
    expect(n).toBe(1);
  });
});

describe('error codes', () => {
  test('2xx envelopes narrow by machine code', () => {
    expect(errorFromResponse({ status: 0, body: { error: 'worm_pro_required' } })).toBeInstanceOf(CheckLeakedAuthError);
    expect(errorFromResponse({ status: 0, body: { error: 'report_throttled' } })).toBeInstanceOf(CheckLeakedRateLimitError);
    expect(errorFromResponse({ status: 0, body: { error: 'report_no_findings' } })).toBeInstanceOf(CheckLeakedValidationError);
    const plain = errorFromResponse({ status: 0, body: { error: 'Something went wrong' } });
    expect(plain.constructor).toBe(CheckLeakedApiError);
    expect(plain.code).toBeUndefined();
    expect(errorFromResponse({ status: 0, body: { error: 'worm_busy' } }).code).toBe('worm_busy');
  });

  test('unwrapEnvelope only unwraps bSuccess envelopes', () => {
    expect(unwrapEnvelope({ success: { webhook: null }, error: null })).toEqual({ webhook: null });
    expect(unwrapEnvelope({ success: true, report: {} })).toEqual({ success: true, report: {} });
    expect(unwrapEnvelope({ plan: 'pro', success: true })).toEqual({ plan: 'pro', success: true });
  });
});

describe('new resources request mapping', () => {
  test('webhooks.get unwraps to the webhook or null', async () => {
    const http = new FakeHttp([{ success: { webhook: null }, error: null }, { success: { webhook: { url: 'https://x', enabled: true } }, error: null }]);
    const w = new WebhooksResource(http);
    await expect(w.get()).resolves.toBeNull();
    await expect(w.get()).resolves.toMatchObject({ url: 'https://x' });
    expect(http.last).toMatchObject({ method: 'GET', path: '/webhook' });
  });

  test('webhooks.set posts the body without retry; test returns delivery results', async () => {
    const http = new FakeHttp([
      { success: { webhook: { url: 'https://hooks.slack.com/x' }, secret: 's' }, error: null },
      { success: false, delivered: false, status: 404, error: 'not found' },
    ]);
    const w = new WebhooksResource(http);
    await expect(w.set({ url: 'https://hooks.slack.com/x', format: 'slack' })).resolves.toMatchObject({ secret: 's' });
    expect(http.calls[0]).toMatchObject({ method: 'POST', path: '/webhook', retry: false, body: { url: 'https://hooks.slack.com/x', format: 'slack' } });
    await expect(w.test()).resolves.toMatchObject({ delivered: false, status: 404 });
    expect(http.calls[1]).toMatchObject({ path: '/webhook/test', throwOnErrorBody: false });
  });

  test('webhooks.test throws when no webhook is configured', async () => {
    const w = new WebhooksResource(new FakeHttp([{ error: 'No webhook configured', success: null }]));
    await expect(w.test()).rejects.toThrow(/No webhook configured/);
  });

  test('privateBots list/set/delete', async () => {
    const http = new FakeHttp([
      { success: { bots: [], plan_ok: true, configured: true, max_per_platform: 1 }, error: null },
      { success: { bot: { platform: 'discord' } }, error: null },
      { success: { removed: true }, error: null },
    ]);
    const pb = new PrivateBotsResource(http);
    await expect(pb.list()).resolves.toMatchObject({ bots: [], plan_ok: true });
    await expect(pb.setEnabled('discord', false)).resolves.toMatchObject({ bot: { platform: 'discord' } });
    expect(http.calls[1].body).toEqual({ platform: 'discord', token: undefined, enabled: false });
    await expect(pb.delete('telegram')).resolves.toEqual({ removed: true });
    expect(http.calls[2]).toMatchObject({ path: '/private_bots/delete', body: { platform: 'telegram' } });
  });

  test('breaches: search POSTs filters to the site host; latest unwraps', async () => {
    const http = new FakeHttp([{ items: [], total: 0 }, { success: { Name: 'Bromcom' } }]);
    const br = new BreachesResource(http);
    await br.search({ search: 'adobe', lang: 'es' });
    expect(http.calls[0]).toMatchObject({ method: 'POST', path: '/breaches', base: 'site', auth: 'none', query: { lang: 'es' } });
    expect(http.calls[0].body).toMatchObject({ page: 1, itemsPerPage: 20, search: 'adobe' });
    await expect(br.latest()).resolves.toEqual({ Name: 'Bromcom' });
  });

  test('ai.investigate never retries and waits long enough', async () => {
    const http = new FakeHttp([{ success: true, report: { markdown: '', sources: [] }, meta: {} }]);
    await new AiResource(http).investigate('a@b.com', { type: 'email', findings: { leakcheck: [{ x: 1 }] } });
    expect(http.last).toMatchObject({ method: 'POST', path: '/worm_report', retry: false, body: { term: 'a@b.com', type: 'email', leakcheck: [{ x: 1 }] } });
    expect(http.last.timeout).toBeGreaterThanOrEqual(180000);
  });

  test('leakradar.raw.searchLines puts paging knobs on the query string, body verbatim', async () => {
    const http = new FakeHttp();
    const api = new CheckLeakedCC({ apiKey: 'k' });
    (api.leakradar.raw as any).http = http;
    await api.leakradar.raw.searchLines({ q: 'acme.com', categories: ['stealer-logs'] }, { max_hits: 5, cursor: 'c1' });
    expect(http.last).toMatchObject({ method: 'POST', path: '/leakradar/search/raw/lines', body: { q: 'acme.com', categories: ['stealer-logs'] }, query: { max_hits: 5, cursor: 'c1' } });
  });

  test('core whois / nameInsight', async () => {
    const http = new FakeHttp();
    const api = new CheckLeakedCC({ apiKey: 'k' });
    (api.core as any).http = http;
    await api.whois(' example.com ');
    expect(http.last).toMatchObject({ method: 'GET', path: '/domain-whois', query: { domain: 'example.com' } });
    await api.nameInsight('Maria', { lang: 'es' });
    expect(http.last).toMatchObject({ path: '/name/insight', base: 'site', auth: 'none', query: { name: 'Maria', lang: 'es' } });
  });
});

describe('k-anonymity', () => {
  test('password: only the 5-char prefix is sent; suffix matched locally', async () => {
    const { prefix, suffix } = await splitPwnedHash('password');
    expect(prefix).toBe('5BAA6');
    expect(suffix).toBe('1E4C9B93F3F0682250B6CF8331B7EE68FD8');
    const http = new FakeHttp([{ success: true, results: [{ suffix: suffix.toLowerCase(), count: 42 }] }]);
    const res = await new KanonResource(http).pwnedPassword('password');
    expect(res).toEqual({ pwned: true, count: 42, prefix: '5BAA6' });
    expect(http.last).toMatchObject({ method: 'GET', path: '/public/pwned/range/5BAA6', auth: 'none' });
    expect(JSON.stringify(http.calls)).not.toContain('password"');
  });

  test('email: 24 hex of sha256(lowercased trimmed)', async () => {
    const h = await emailKanonHash('  Test@Example.COM ');
    expect(h).toHaveLength(24);
    expect(h).toBe(await emailKanonHash('test@example.com'));
    expect(matchPwnedRange('nope', 'X')).toEqual({ pwned: false, count: 0 });
  });
});

describe('webhook signatures', () => {
  test('sign → verify roundtrip, tamper and replay rejected', async () => {
    const body = '{"event":"tracking.finding"}';
    const t = 1_700_000_000;
    const header = await signWebhookPayload('sekret', body, t);
    expect(parseWebhookSignature(header)?.timestamp).toBe(t);
    await expect(verifyWebhookSignature('sekret', header, body, { now: t + 10 })).resolves.toBe(true);
    await expect(verifyWebhookSignature('sekret', header, new TextEncoder().encode(body), { now: t })).resolves.toBe(true);
    await expect(verifyWebhookSignature('other', header, body, { now: t })).resolves.toBe(false);
    await expect(verifyWebhookSignature('sekret', header, body + ' ', { now: t })).resolves.toBe(false);
    await expect(verifyWebhookSignature('sekret', header, body, { now: t + 1000 })).resolves.toBe(false);
    await expect(verifyWebhookSignature('sekret', header, body, { now: t + 1000, toleranceSeconds: 0 })).resolves.toBe(true);
    await expect(verifyWebhookSignature('sekret', 'garbage', body)).resolves.toBe(false);
  });
});

describe('SSE reader', () => {
  test('handles split chunks, CRLF, comments and multi-line data', async () => {
    const res = sseResponse([': keep-alive\n\nevent: tool_st', 'atus\r\ndata: {"type":"tool_start"}\r\n\r\n', 'data: a\ndata: b\n\n', 'data: [DONE]']);
    const out = [];
    for await (const m of readSse(res.body!)) out.push(m);
    expect(out).toEqual([
      { event: 'tool_status', data: '{"type":"tool_start"}' },
      { event: 'message', data: 'a\nb' },
      { event: 'message', data: '[DONE]' },
    ]);
  });
});

describe('WormGPT client', () => {
  const frames = [
    'event: tool_status\ndata: {"type":"tool_start","tool":"web_search","arguments":{"q":"x"}}\n\n',
    'event: tool_status\ndata: {"type":"tool_end","tool":"web_search","success":true,"result":{"results":[]}}\n\n',
    ': keep-alive\n\n',
    'data: {"object":"chat.completion.chunk","choices":[{"delta":{"content":"Hel"}}]}\n\n',
    'data: {"object":"chat.completion.chunk","choices":[{"delta":{"content":"lo"}}]}\n\n',
    'data: {"object":"chat.completion.chunk","choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
    'data: [DONE]\n\n',
  ];

  test('stream yields typed events and asks for status frames', async () => {
    const { fn, calls } = fakeFetch(() => sseResponse(frames));
    const api = new CheckLeakedCC({ apiKey: UUID, fetch: fn });
    const events = [];
    for await (const ev of api.wormgpt.stream({ messages: [{ role: 'user', content: 'hi' }], tools_enabled: true })) events.push(ev.type);
    expect(events).toEqual(['tool_start', 'tool_end', 'content', 'content', 'done']);
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toMatchObject({ stream: true, status_events: true, tools_enabled: true });
    expect(calls[0].url).toBe('https://wormgpt.checkleaked.com/v1/chat/completions');
  });

  test('chat with tools_enabled folds the stream (dodges the 524 on long runs)', async () => {
    const { fn } = fakeFetch(() => sseResponse(frames));
    const api = new CheckLeakedCC({ apiKey: UUID, fetch: fn });
    const res = await api.wormgpt.chat({ messages: [{ role: 'user', content: 'hi' }], tools_enabled: true });
    expect(res.choices[0].message.content).toBe('Hello');
    expect(res.tool_results).toEqual([{ tool: 'web_search', arguments: undefined, success: true, result: { results: [] }, error: null }]);
  });

  test('plain chat is one non-streaming call; ask returns text', async () => {
    const { fn, calls } = fakeFetch(() =>
      jsonResponse({ id: 'c', object: 'chat.completion', created: 1, model: 'wormv5.2', choices: [{ index: 0, message: { role: 'assistant', content: 'yo' }, finish_reason: 'stop' }] }),
    );
    const api = new CheckLeakedCC({ apiKey: UUID, fetch: fn });
    await expect(api.wormgpt.ask('hi', { system: 'be brief', model: 'wormv6' })).resolves.toBe('yo');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body).toEqual({ messages: [{ role: 'system', content: 'be brief' }, { role: 'user', content: 'hi' }], model: 'wormv6', stream: false });
  });

  test('exhausted daily quota (401) surfaces as a rate-limit error', async () => {
    const { fn } = fakeFetch(() => jsonResponse({ error: 'Daily request limit of 250 reached for your plan' }, { status: 401 }));
    const api = new CheckLeakedCC({ apiKey: UUID, fetch: fn });
    await expect(api.wormgpt.ask('hi')).rejects.toBeInstanceOf(CheckLeakedRateLimitError);
  });

  test('an error frame mid-stream throws', async () => {
    const { fn } = fakeFetch(() => sseResponse(['event: error\ndata: {"error":"upstream failed"}\n\n']));
    const api = new CheckLeakedCC({ apiKey: UUID, fetch: fn });
    const run = async () => {
      for await (const _ of api.wormgpt.stream({ messages: [{ role: 'user', content: 'x' }] })) void _;
    };
    await expect(run()).rejects.toThrow(/upstream failed/);
  });

  test('models() is keyless', async () => {
    const { fn, calls } = fakeFetch(() => jsonResponse({ object: 'list', data: [{ id: 'wormv5.2', object: 'model' }] }));
    const api = new CheckLeakedCC({ allowMissingApiKey: true, fetch: fn });
    await expect(api.wormgpt.models()).resolves.toEqual([{ id: 'wormv5.2', object: 'model' }]);
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBeUndefined();
  });
});

describe('MCP tool catalog', () => {
  const api = new CheckLeakedCC({ allowMissingApiKey: true });
  const tools = createCheckLeakedTools(api);

  test('names are unique, prefixed, schemas are objects', () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const t of tools) {
      expect(t.name).toMatch(/^checkleaked_[a-z0-9_]+$/);
      expect(t.inputSchema.type).toBe('object');
      expect(t.description.length).toBeGreaterThan(10);
      for (const r of t.inputSchema.required || []) expect(t.inputSchema.properties[r]).toBeDefined();
    }
    expect(names).toEqual(expect.arrayContaining(['checkleaked_wormgpt_chat', 'checkleaked_ai_investigate', 'checkleaked_webhook_set', 'checkleaked_pwned_password']));
  });

  test('filters and function-calling converters', () => {
    expect(createCheckLeakedTools(api, { readOnly: true }).every((t) => t.annotations.readOnlyHint)).toBe(true);
    expect(createCheckLeakedTools(api, { include: ['checkleaked_ping'] }).map((t) => t.name)).toEqual(['checkleaked_ping']);
    expect(toAnthropicTools(tools)[0]).toHaveProperty('input_schema');
    expect(toOpenAITools(tools)[0]).toMatchObject({ type: 'function', function: { name: tools[0].name } });
  });

  test('validateArgs: required, coercion, enum, unknown keys dropped', () => {
    const schema = tools.find((t) => t.name === 'checkleaked_dehashed')!.inputSchema;
    expect(validateArgs('t', schema, { entry: 'john@x.com', type: 'email', page: '2', junk: 1 })).toEqual({ entry: 'john@x.com', type: 'email', page: 2 });
    expect(() => validateArgs('t', schema, { type: 'email' })).toThrow(/"entry" is required/);
    expect(() => validateArgs('t', schema, { entry: 'john@x.com', type: 'nope' })).toThrow(/must be one of/);
    expect(() => validateArgs('t', schema, { entry: 'abc', type: 'email' })).toThrow(/too short/);
  });

  test('tracking tools send the field names the API reads', async () => {
    const http = new FakeHttp();
    const a = new CheckLeakedCC({ apiKey: 'k' });
    (a.tracking as any).http = http;
    const t = createCheckLeakedTools(a);
    await t.find((x) => x.name === 'checkleaked_tracking_delete')!.run({ email_unique_id: 'abc' });
    expect(http.last).toMatchObject({ path: '/tracking/delete', body: { email_unique_id: 'abc' } });
    await t.find((x) => x.name === 'checkleaked_tracking_history')!.run({ entry: 'a@b.com', type: 'email' });
    expect(http.last).toMatchObject({ path: '/tracking/history', body: { entry: 'a@b.com', type: 'email' } });
  });
});

describe('MCP server (JSON-RPC)', () => {
  const api = new CheckLeakedCC({ allowMissingApiKey: true });
  const server = new CheckLeakedMcpServer({ tools: createCheckLeakedTools(api), hasApiKey: false });

  test('initialize negotiates the protocol version', async () => {
    const r: any = await server.handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } });
    expect(r.result.protocolVersion).toBe('2025-03-26');
    expect(r.result.capabilities.tools).toBeDefined();
    expect(negotiateProtocolVersion('1999-01-01')).toBe('2025-11-25');
  });

  test('notifications get no reply; unknown methods get -32601; batches work', async () => {
    await expect(server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).resolves.toBeNull();
    const r: any = await server.handle({ jsonrpc: '2.0', id: 2, method: 'bogus' });
    expect(r.error.code).toBe(-32601);
    const batch: any = await server.handle([
      { jsonrpc: '2.0', id: 3, method: 'ping' },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
    ]);
    expect(batch).toEqual([{ jsonrpc: '2.0', id: 3, result: {} }]);
  });

  test('keyed tools explain how to add a key; unknown tools are protocol errors', async () => {
    const r: any = await server.handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'checkleaked_ping', arguments: {} } });
    expect(r.result.isError).toBe(true);
    expect(r.result.content[0].text).toMatch(/CHECKLEAKED_API_KEY/);
    const u: any = await server.handle({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'nope' } });
    expect(u.error.code).toBe(-32602);
  });

  test('tools/list exposes annotations', async () => {
    const r: any = await server.handle({ jsonrpc: '2.0', id: 6, method: 'tools/list' });
    expect(r.result.tools.length).toBeGreaterThan(40);
    expect(r.result.tools[0].annotations).toHaveProperty('readOnlyHint');
  });
});

describe('Remote MCP client', () => {
  test('initializes once, sends session id, parses SSE answers, re-inits on 404', async () => {
    let sessions = 0;
    let listCalls = 0;
    const { fn, calls } = fakeFetch((_url, init) => {
      const body = init.body ? JSON.parse(String(init.body)) : {};
      if (body.method === 'initialize') {
        sessions++;
        return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { protocolVersion: '2025-06-18' } }, { headers: { 'mcp-session-id': `s${sessions}` } });
      }
      if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
      if (body.method === 'tools/list') {
        listCalls++;
        if (listCalls === 2) return jsonResponse({ jsonrpc: '2.0', error: { code: -32000, message: 'Session not found' } }, { status: 404 });
        return sseResponse([`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { tools: [{ name: 't1', inputSchema: {} }] } })}\n\n`]);
      }
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: {} });
    });
    const http = new HttpClient({ apiKey: UUID, fetch: fn });
    const mcp = new RemoteMcpClient(http);
    await expect(mcp.listTools()).resolves.toEqual([{ name: 't1', inputSchema: {} }]);
    const listReq = calls.find((c) => JSON.parse(String(c.init.body)).method === 'tools/list')!;
    const headers = listReq.init.headers as Record<string, string>;
    expect(headers['Mcp-Session-Id']).toBe('s1');
    expect(headers.Authorization).toBe(`Bearer ${UUID}`);
    expect(headers['MCP-Protocol-Version']).toBe('2025-06-18');
    await expect(mcp.listTools()).resolves.toHaveLength(1);
    expect(sessions).toBe(2);
  });
});

describe('MCP client configs', () => {
  test('remote and local shapes', () => {
    expect(mcpConfig('claude-desktop', 'K')).toEqual({ mcpServers: { checkleaked: { url: 'https://mcp.checkleaked.cc/mcp', headers: { Authorization: 'Bearer K' } } } });
    expect(mcpConfig('vscode', 'K')).toMatchObject({ servers: { checkleaked: { type: 'http' } } });
    expect(mcpConfig('cursor', 'K', { mode: 'local' })).toEqual({
      mcpServers: { checkleaked: { command: 'npx', args: ['-y', 'checkleakedcc', 'mcp'], env: { CHECKLEAKED_API_KEY: 'K' } } },
    });
    expect(claudeCodeMcpCommand('K')).toContain('--transport http');
  });
});

// ---------------------------------------------------------------------------
// Regression tests for review findings
// ---------------------------------------------------------------------------

describe('review regressions', () => {
  test('SSE: CRLF split across chunks keeps the event intact', async () => {
    const res = sseResponse(['event: tool_status\r', '\ndata: {"type":"tool_end","tool":"x","success":true}\r', '\n\r\n']);
    const out = [];
    for await (const m of readSse(res.body!)) out.push(m);
    expect(out).toEqual([{ event: 'tool_status', data: '{"type":"tool_end","tool":"x","success":true}' }]);
  });

  test('WormGPT: OpenAI-style error object and non-JSON error frames throw', async () => {
    for (const frames of [['data: {"error":{"message":"boom"}}\n\n'], ['event: error\ndata: upstream exploded\n\n']]) {
      const { fn } = fakeFetch(() => sseResponse(frames));
      const api = new CheckLeakedCC({ apiKey: UUID, fetch: fn });
      await expect(api.wormgpt.chat({ messages: [{ role: 'user', content: 'x' }], tools_enabled: true })).rejects.toBeInstanceOf(CheckLeakedApiError);
    }
  });

  test('WormGPT: abort mid-stream surfaces a CheckLeakedNetworkError', async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"a"}}]}\n\n'));
      },
    });
    const { fn } = fakeFetch(() => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } }));
    const api = new CheckLeakedCC({ apiKey: UUID, fetch: fn });
    const ctrl = new AbortController();
    const run = async () => {
      for await (const ev of api.wormgpt.stream({ messages: [{ role: 'user', content: 'x' }], signal: ctrl.signal })) {
        if (ev.type === 'content') ctrl.abort();
      }
    };
    await expect(run()).rejects.toBeInstanceOf(CheckLeakedNetworkError);
  });

  test('transport: abort during a Retry-After wait returns promptly', async () => {
    const { fn } = fakeFetch(() => jsonResponse({ error: 'rate_limited' }, { status: 429, headers: { 'retry-after': '3' } }));
    const http = new HttpClient({ apiKey: 'k', fetch: fn, maxRetries: 2 });
    const ctrl = new AbortController();
    const started = Date.now();
    const p = http.request({ method: 'GET', path: '/x', signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 20);
    await expect(p).rejects.toThrow(/aborted/);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  test('transport: network errors and 5xx retry GETs but not credit-spending POSTs', async () => {
    let n = 0;
    const failing: FetchLike = async () => {
      n++;
      throw new TypeError('fetch failed');
    };
    const http = new HttpClient({ apiKey: 'k', fetch: failing, maxRetries: 2, retryDelayMs: 1 });
    await expect(http.request({ method: 'POST', path: '/experimental', body: {} })).rejects.toBeInstanceOf(CheckLeakedNetworkError);
    expect(n).toBe(1);
    n = 0;
    await expect(http.request({ method: 'GET', path: '/valid' })).rejects.toBeInstanceOf(CheckLeakedNetworkError);
    expect(n).toBe(3);
    const { fn, calls } = fakeFetch(() => jsonResponse({ error: 'boom' }, { status: 502 }));
    const http2 = new HttpClient({ apiKey: 'k', fetch: fn, maxRetries: 2, retryDelayMs: 1 });
    await expect(http2.request({ method: 'POST', path: '/dehashed', body: {} })).rejects.toThrow();
    expect(calls).toHaveLength(1);
    await expect(http2.request({ method: 'POST', path: '/dehashed', body: {}, retry: true })).rejects.toThrow();
    expect(calls).toHaveLength(4);
  });

  test('remote MCP: a 400 "Server not initialized" for a known session re-initializes once', async () => {
    let sessions = 0;
    let calls = 0;
    const { fn } = fakeFetch((_url, init) => {
      const body = JSON.parse(String(init.body || '{}'));
      if (body.method === 'initialize') {
        sessions++;
        return jsonResponse({ jsonrpc: '2.0', id: body.id, result: {} }, { headers: { 'mcp-session-id': `s${sessions}` } });
      }
      if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
      calls++;
      if (calls === 2) return jsonResponse({ jsonrpc: '2.0', error: { code: -32000, message: 'Bad Request: Server not initialized' }, id: null }, { status: 400 });
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: '{"ok":1}' }] } });
    });
    const mcp = new RemoteMcpClient(new HttpClient({ apiKey: UUID, fetch: fn }));
    await expect(mcp.callToolJson('t')).resolves.toEqual({ ok: 1 });
    await expect(mcp.callToolJson('t')).resolves.toEqual({ ok: 1 });
    expect(sessions).toBe(2);
  });

  test('remote MCP: a stateless server (no session id) is initialized only once', async () => {
    let inits = 0;
    const { fn } = fakeFetch((_url, init) => {
      const body = JSON.parse(String(init.body || '{}'));
      if (body.method === 'initialize') inits++;
      if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { tools: [] } });
    });
    const mcp = new RemoteMcpClient(new HttpClient({ apiKey: UUID, fetch: fn }));
    await mcp.listTools();
    await mcp.listTools();
    await mcp.listTools();
    expect(inits).toBe(1);
  });

  test('remote MCP: a hosted 401 (keyless call to a key-needing tool) is a CheckLeakedAuthError', async () => {
    const { fn } = fakeFetch((_url, init) => {
      const body = JSON.parse(String(init.body || '{}'));
      if (body.method === 'initialize') return jsonResponse({ jsonrpc: '2.0', id: body.id, result: {} }, { headers: { 'mcp-session-id': 's1' } });
      if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
      return jsonResponse({ jsonrpc: '2.0', error: { code: -32001, message: 'Sign in to use this tool' }, id: body.id }, { status: 401, headers: { 'www-authenticate': 'Bearer' } });
    });
    const mcp = new RemoteMcpClient(new HttpClient({ allowMissingApiKey: true, fetch: fn }));
    await expect(mcp.callTool('checkleaked_ping')).rejects.toBeInstanceOf(CheckLeakedAuthError);
  });

  test('MCP server: empty batch is an Invalid Request', async () => {
    const server = new CheckLeakedMcpServer({ tools: [] });
    await expect(server.handle([])).resolves.toMatchObject({ error: { code: -32600 } });
  });
});
