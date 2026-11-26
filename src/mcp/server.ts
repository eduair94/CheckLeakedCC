/**
 * A zero-dependency MCP server over the CheckLeaked tool catalog.
 *
 * `CheckLeakedMcpServer.handle()` is a pure JSON-RPC 2.0 message handler (no
 * I/O), so it can sit behind any transport. `serveStdio()` wires it to
 * stdin/stdout with newline-delimited JSON — the MCP stdio transport — which
 * is what `npx checkleakedcc mcp` runs.
 */
import { CheckLeakedApiError, CheckLeakedError } from '../errors';
import { SDK_VERSION } from '../version';
import { negotiateProtocolVersion } from './protocol';
import type { CheckLeakedTool } from './tools';

/** Longest tool answer passed back to the model, in characters. */
const MAX_TOOL_OUTPUT_CHARS = 250_000;

export interface McpServerOptions {
  tools: CheckLeakedTool[];
  /** Whether the client has an api key (keyless tools still work without one). */
  hasApiKey?: boolean;
  name?: string;
  version?: string;
  /** Diagnostic sink (stderr in stdio mode). Never receives secrets. */
  log?: (message: string) => void;
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: any;
}

type JsonRpcReply = { jsonrpc: '2.0'; id: string | number | null; result?: unknown; error?: { code: number; message: string; data?: unknown } };

const INSTRUCTIONS =
  'CheckLeaked.cc: data-breach search (LeakCheck, Dehashed, Snusbase, LeakRadar stealer logs), hash cracking, GHunt, WHOIS, ' +
  'breach monitoring with signed webhooks, a public breach registry, free k-anonymity password/email checks, and WormGPT ' +
  '(AI chat + one-call OSINT investigation). Search tools spend plan lookups/credits; prefer the free k-anonymity and registry ' +
  'tools when they answer the question. Only search people and assets you are authorized to investigate.';

export class CheckLeakedMcpServer {
  private readonly tools: Map<string, CheckLeakedTool>;
  private readonly name: string;
  private readonly version: string;
  private readonly hasApiKey: boolean;
  private readonly log: (message: string) => void;

  constructor(opts: McpServerOptions) {
    this.tools = new Map(opts.tools.map((t) => [t.name, t]));
    this.name = opts.name || 'checkleakedcc';
    this.version = opts.version || SDK_VERSION;
    this.hasApiKey = opts.hasApiKey !== false;
    this.log = opts.log || (() => undefined);
  }

  /**
   * Handle one parsed JSON-RPC message (or a batch). Resolves the reply, or
   * `null` for notifications.
   */
  async handle(message: unknown): Promise<JsonRpcReply | JsonRpcReply[] | null> {
    if (Array.isArray(message)) {
      if (message.length === 0) return errorReply(null, -32600, 'Invalid Request');
      const replies = (await Promise.all(message.map((m) => this.handleOne(m)))).filter((r): r is JsonRpcReply => r !== null);
      return replies.length ? replies : null;
    }
    return this.handleOne(message);
  }

  private async handleOne(raw: unknown): Promise<JsonRpcReply | null> {
    if (!raw || typeof raw !== 'object') return errorReply(null, -32600, 'Invalid Request');
    const msg = raw as JsonRpcRequest;
    const isNotification = msg.id === undefined || msg.id === null;
    if (typeof msg.method !== 'string') {
      // A response to a request we never sent, or garbage.
      return isNotification ? null : errorReply(msg.id ?? null, -32600, 'Invalid Request');
    }
    const id = msg.id ?? null;
    try {
      const result = await this.dispatch(msg.method, msg.params || {});
      if (isNotification) return null;
      if (result === METHOD_NOT_FOUND) return errorReply(id, -32601, `Method not found: ${msg.method}`);
      return { jsonrpc: '2.0', id, result };
    } catch (err) {
      if (isNotification) return null;
      if (err instanceof RpcError) return errorReply(id, err.code, err.message);
      this.log(`internal error in ${msg.method}: ${(err as Error)?.message}`);
      return errorReply(id, -32603, 'Internal error');
    }
  }

  private async dispatch(method: string, params: any): Promise<unknown> {
    switch (method) {
      case 'initialize':
        return {
          protocolVersion: negotiateProtocolVersion(params.protocolVersion),
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: this.name, title: 'CheckLeaked', version: this.version },
          instructions: this.hasApiKey
            ? INSTRUCTIONS
            : INSTRUCTIONS + ' No API key is configured: only the free tools work. Set CHECKLEAKED_API_KEY (from https://checkleaked.cc/botLinks).',
        };
      case 'notifications/initialized':
      case 'notifications/cancelled':
      case 'notifications/roots/list_changed':
        return undefined;
      case 'ping':
        return {};
      case 'logging/setLevel':
        return {};
      case 'tools/list':
        return { tools: [...this.tools.values()].map(describe) };
      case 'tools/call':
        return this.callTool(params);
      case 'resources/list':
        return { resources: [] };
      case 'resources/templates/list':
        return { resourceTemplates: [] };
      case 'prompts/list':
        return { prompts: [] };
      default:
        return METHOD_NOT_FOUND;
    }
  }

  private async callTool(params: any): Promise<unknown> {
    const name = params && typeof params.name === 'string' ? params.name : '';
    const tool = this.tools.get(name);
    if (!tool) throw new RpcError(-32602, `Unknown tool: ${name}`);
    if (tool.requiresApiKey && !this.hasApiKey) {
      return textResult(
        'This tool needs a CheckLeaked API key. Set CHECKLEAKED_API_KEY in the MCP server config (get a key at https://checkleaked.cc/botLinks), then restart the server.',
        true,
      );
    }
    const started = Date.now();
    try {
      const data = await tool.run(params.arguments || {});
      this.log(`${name} ok ${Date.now() - started}ms`);
      return textResult(stringify(data), false);
    } catch (err) {
      this.log(`${name} failed ${Date.now() - started}ms: ${(err as Error)?.name}`);
      return textResult(describeError(err), true);
    }
  }
}

const METHOD_NOT_FOUND = Symbol('method-not-found');

class RpcError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

function describe(t: CheckLeakedTool) {
  return { name: t.name, title: t.title, description: t.description, inputSchema: t.inputSchema, annotations: t.annotations };
}

function errorReply(id: string | number | null, code: number, message: string): JsonRpcReply {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

function textResult(text: string, isError: boolean) {
  return { content: [{ type: 'text', text }], isError };
}

function stringify(data: unknown): string {
  const text = typeof data === 'string' ? data : JSON.stringify(data ?? null, null, 2);
  if (text.length <= MAX_TOOL_OUTPUT_CHARS) return text;
  return text.slice(0, MAX_TOOL_OUTPUT_CHARS) + `\n… [truncated ${text.length - MAX_TOOL_OUTPUT_CHARS} characters; narrow the query or page through results]`;
}

function describeError(err: unknown): string {
  if (err instanceof CheckLeakedApiError) {
    return JSON.stringify({ error: err.message, code: err.code, status: err.status || undefined, type: err.name }, null, 2);
  }
  if (err instanceof CheckLeakedError) return JSON.stringify({ error: err.message, type: err.name }, null, 2);
  return JSON.stringify({ error: (err as Error)?.message || String(err) }, null, 2);
}

export interface StdioOptions {
  input?: NodeJS.ReadableStream;
  output?: NodeJS.WritableStream;
}

/**
 * Serve MCP over stdio (newline-delimited JSON-RPC). Resolves when stdin ends.
 * Only protocol messages go to stdout; diagnostics go to the server's `log`.
 */
export function serveStdio(server: CheckLeakedMcpServer, opts: StdioOptions = {}): Promise<void> {
  const input: NodeJS.ReadableStream = opts.input ?? process.stdin;
  const output: NodeJS.WritableStream = opts.output ?? process.stdout;
  const write = (reply: unknown) => {
    output.write(JSON.stringify(reply) + '\n');
  };
  return new Promise((resolve) => {
    let buffer = '';
    const pending = new Set<Promise<void>>();
    const onLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        write(errorReply(null, -32700, 'Parse error'));
        return;
      }
      const p = server
        .handle(parsed)
        .then((reply) => {
          if (reply) write(reply);
        })
        .catch(() => undefined)
        .finally(() => pending.delete(p));
      pending.add(p);
    };
    if (typeof (input as { setEncoding?: (e: string) => void }).setEncoding === 'function') {
      (input as { setEncoding: (e: string) => void }).setEncoding('utf8');
    }
    input.on('data', (chunk: string | Buffer) => {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        onLine(line);
      }
    });
    input.on('end', () => {
      if (buffer.trim()) onLine(buffer);
      Promise.allSettled([...pending]).then(() => resolve());
    });
  });
}
