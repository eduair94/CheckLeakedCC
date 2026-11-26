/**
 * Minimal MCP client for the HOSTED CheckLeaked MCP server
 * (`https://mcp.checkleaked.cc/mcp`, Streamable HTTP transport). Lets SDK
 * users list and call the hosted tools from code without an MCP library.
 */
import { CheckLeakedApiError, CheckLeakedNetworkError } from '../errors';
import type { HttpClient } from '../http';
import { readSse } from '../wormgpt/sse';
import { MCP_PROTOCOL_VERSION } from './protocol';

export interface McpToolDescriptor {
  name: string;
  title?: string;
  description?: string;
  inputSchema: Record<string, any>;
  annotations?: Record<string, any>;
  [k: string]: any;
}

export interface McpCallResult {
  content: Array<{ type: string; text?: string; [k: string]: any }>;
  structuredContent?: unknown;
  isError?: boolean;
  [k: string]: any;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number | string | null;
  result?: any;
  error?: { code: number; message: string; data?: unknown };
}

export class RemoteMcpClient {
  private sessionId: string | null = null;
  /** Separate from `sessionId`: a server may run stateless and never issue one. */
  private initialized = false;
  private protocolVersion: string = MCP_PROTOCOL_VERSION;
  private nextId = 1;
  private initializing: Promise<void> | null = null;

  /**
   * @param url       MCP endpoint (defaults to the hosted server).
   * @param timeoutMs Per-request timeout; a hung server must not block forever.
   */
  constructor(
    private readonly http: HttpClient,
    private readonly url: string = http.mcpUrl,
    private readonly timeoutMs = 120_000,
  ) {}

  /** The hosted endpoint this client talks to. */
  get endpoint(): string {
    return this.url;
  }

  /** Every tool the hosted server offers (follows pagination). Works without an api key. */
  async listTools(): Promise<McpToolDescriptor[]> {
    const tools: McpToolDescriptor[] = [];
    let cursor: string | undefined;
    do {
      const res = await this.rpc('tools/list', cursor ? { cursor } : {});
      tools.push(...((res && res.tools) || []));
      cursor = res && res.nextCursor ? String(res.nextCursor) : undefined;
    } while (cursor);
    return tools;
  }

  /** Call one hosted tool. A tool-level failure comes back with `isError: true` (not thrown). */
  callTool(name: string, args: Record<string, unknown> = {}): Promise<McpCallResult> {
    return this.rpc('tools/call', { name, arguments: args });
  }

  /** Call a tool and JSON-parse its first text block (most CheckLeaked tools answer JSON). */
  async callToolJson<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const res = await this.callTool(name, args);
    const text = (res.content || []).find((c) => c.type === 'text')?.text ?? '';
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* plain text */
    }
    if (res.isError) {
      throw new CheckLeakedApiError({ message: typeof parsed === 'string' ? parsed : `MCP tool ${name} failed`, status: 0, body: parsed, path: name });
    }
    return parsed as T;
  }

  /** Static resources the hosted server exposes (OpenAPI pointer, quickstart, webhooks guide). */
  async listResources(): Promise<Array<{ uri: string; name?: string; [k: string]: any }>> {
    const res = await this.rpc('resources/list', {});
    return (res && res.resources) || [];
  }

  async readResource(uri: string): Promise<{ contents: Array<{ uri: string; text?: string; [k: string]: any }> }> {
    return this.rpc('resources/read', { uri });
  }

  /** End the session on the server. */
  async close(): Promise<void> {
    const sid = this.sessionId;
    this.sessionId = null;
    this.initialized = false;
    if (!sid) return;
    try {
      await this.fetchWithTimeout({ method: 'DELETE', headers: this.headers(sid) });
    } catch {
      /* best effort */
    }
  }

  // -------------------------------------------------------------------------

  /** rawFetch with a timeout; the timer is cleared once the body has been consumed or the call fails. */
  private async fetchWithTimeout(init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.http.rawFetch(this.url, { ...init, signal: controller.signal });
    } finally {
      // Headers arrived (or the call failed). A slow SSE body is bounded by the
      // server; clearing here keeps the timer from killing a healthy stream.
      clearTimeout(timer);
    }
  }

  private headers(sessionId: string | null = this.sessionId): Record<string, string> {
    const h: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': this.protocolVersion,
    };
    const key = this.http.getApiKey();
    if (key) h.Authorization = `Bearer ${key}`;
    if (sessionId) h['Mcp-Session-Id'] = sessionId;
    return h;
  }

  private async ensureSession(): Promise<void> {
    if (this.initialized) return;
    if (!this.initializing) {
      this.initializing = this.initialize().finally(() => {
        this.initializing = null;
      });
    }
    return this.initializing;
  }

  private async initialize(): Promise<void> {
    const { message, sessionId } = await this.post({
      jsonrpc: '2.0',
      id: this.nextId++,
      method: 'initialize',
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'checkleakedcc-sdk', version: '2' },
      },
    }, null);
    if (message?.error) throw rpcError('initialize', message.error);
    if (message?.result?.protocolVersion) this.protocolVersion = String(message.result.protocolVersion);
    this.sessionId = sessionId;
    await this.post({ jsonrpc: '2.0', method: 'notifications/initialized' }, sessionId, true);
    this.initialized = true;
  }

  private async rpc(method: string, params: Record<string, unknown>, retried = false): Promise<any> {
    await this.ensureSession();
    const id = this.nextId++;
    const usedSession = this.sessionId;
    let out: { message: JsonRpcResponse | null; status: number };
    try {
      out = await this.post({ jsonrpc: '2.0', id, method, params }, usedSession);
    } catch (e) {
      // The server forgot the session (restart / idle sweep). The request was
      // refused before running, so starting over once is safe.
      if (!retried && usedSession && isLostSession(e)) {
        // Only reset if no concurrent call already replaced the session.
        if (this.sessionId === usedSession) {
          this.sessionId = null;
          this.initialized = false;
        }
        return this.rpc(method, params, true);
      }
      throw e;
    }
    if (!out.message) throw new CheckLeakedApiError({ message: `Empty MCP response to ${method}`, status: out.status, body: undefined, path: method });
    if (out.message.error) throw rpcError(method, out.message.error);
    return out.message.result;
  }

  private async post(
    body: Record<string, unknown>,
    sessionId: string | null,
    notification = false,
  ): Promise<{ message: JsonRpcResponse | null; sessionId: string | null; status: number }> {
    let res: Response;
    try {
      res = await this.fetchWithTimeout({ method: 'POST', headers: this.headers(sessionId), body: JSON.stringify(body) });
    } catch (e) {
      throw new CheckLeakedNetworkError((e as Error)?.message || 'MCP network error', e);
    }
    const newSession = res.headers.get('mcp-session-id') || sessionId;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let parsed: any = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        /* keep text */
      }
      const message = parsed?.error?.message || parsed?.error || `MCP request failed with status ${res.status}`;
      throw new CheckLeakedApiError({ message: String(message), status: res.status, body: parsed, path: String(body.method) });
    }
    if (notification || res.status === 202) {
      await res.body?.cancel().catch(() => undefined);
      return { message: null, sessionId: newSession, status: res.status };
    }
    const type = res.headers.get('content-type') || '';
    if (type.includes('text/event-stream') && res.body) {
      for await (const msg of readSse(res.body)) {
        let parsed: JsonRpcResponse | null;
        try {
          parsed = JSON.parse(msg.data);
        } catch {
          continue;
        }
        // Skip server notifications/requests; the answer carries our id.
        if (parsed && parsed.id === body.id && (parsed.result !== undefined || parsed.error)) {
          return { message: parsed, sessionId: newSession, status: res.status };
        }
      }
      return { message: null, sessionId: newSession, status: res.status };
    }
    const text = await res.text();
    return { message: text ? (JSON.parse(text) as JsonRpcResponse) : null, sessionId: newSession, status: res.status };
  }
}

/**
 * Did the server refuse because it no longer knows our session? Spec servers
 * answer 404; the MCP TypeScript SDK (which the hosted server runs) answers a
 * fresh, uninitialized transport with 400 + JSON-RPC -32000 "Server not initialized".
 */
function isLostSession(e: unknown): boolean {
  if (!(e instanceof CheckLeakedApiError)) return false;
  if (e.status === 404) return true;
  if (e.status !== 400) return false;
  const err = (e.body as { error?: { code?: number; message?: string } } | undefined)?.error;
  return !!err && typeof err === 'object' && (err.code === -32000 || /not initialized|session/i.test(String(err.message || '')));
}

function rpcError(method: string, err: { code: number; message: string; data?: unknown }): CheckLeakedApiError {
  return new CheckLeakedApiError({ message: `MCP ${method}: ${err.message}`, status: 0, body: err, path: method });
}
