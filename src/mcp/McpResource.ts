import type { CheckLeakedCC } from '../CheckLeakedCC';
import type { HttpClient } from '../http';
import { claudeCodeMcpCommand, mcpConfig, type McpClientName, type McpConfigOptions } from './config';
import { RemoteMcpClient } from './remote';
import { CheckLeakedMcpServer, serveStdio, type StdioOptions } from './server';
import { createCheckLeakedTools, toAnthropicTools, toOpenAITools, type CheckLeakedTool, type CreateToolsOptions } from './tools';

/**
 * `client.mcp` — Model Context Protocol integration.
 *
 * - `remote` — call the HOSTED server (mcp.checkleaked.cc) from code.
 * - `tools()` — the SDK as an MCP tool catalog bound to this client; also
 *   available as Claude (`anthropicTools()`) / OpenAI (`openAITools()`)
 *   function-calling definitions.
 * - `serveStdio()` — run a local MCP server (what `npx checkleakedcc mcp` does).
 * - `config()` — paste-ready configs for Claude Desktop / Code, Cursor, VS Code, Windsurf.
 */
export class McpResource {
  /** Client for the hosted MCP server, authenticated with this client's key. */
  public readonly remote: RemoteMcpClient;

  constructor(
    private readonly api: CheckLeakedCC,
    private readonly http: HttpClient,
  ) {
    this.remote = new RemoteMcpClient(http);
  }

  /** The hosted MCP endpoint. */
  get url(): string {
    return this.http.mcpUrl;
  }

  /** The tool catalog bound to this client. */
  tools(opts?: CreateToolsOptions): CheckLeakedTool[] {
    return createCheckLeakedTools(this.api, opts);
  }

  /** Tool definitions for the Claude Messages API `tools` parameter. */
  anthropicTools(opts?: CreateToolsOptions) {
    return toAnthropicTools(this.tools(opts));
  }

  /** Tool definitions for OpenAI-compatible `tools` (function calling). */
  openAITools(opts?: CreateToolsOptions) {
    return toOpenAITools(this.tools(opts));
  }

  /** Run one tool by name (validates arguments first). */
  async runTool(name: string, args?: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools().find((t) => t.name === name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);
    return tool.run(args);
  }

  /** A transport-agnostic MCP server over this client's tools. */
  createServer(opts: CreateToolsOptions & { log?: (m: string) => void } = {}): CheckLeakedMcpServer {
    return new CheckLeakedMcpServer({ tools: this.tools(opts), hasApiKey: this.http.hasApiKey, log: opts.log });
  }

  /** Serve MCP over stdio until stdin closes. */
  serveStdio(opts: CreateToolsOptions & StdioOptions & { log?: (m: string) => void } = {}): Promise<void> {
    return serveStdio(this.createServer(opts), opts);
  }

  /** Paste-ready MCP config for a client app, using this client's key. */
  config(client: McpClientName, opts?: McpConfigOptions): Record<string, unknown> {
    return mcpConfig(client, this.http.getApiKey() || 'YOUR_API_KEY', { url: this.http.mcpUrl, ...opts });
  }

  /** `claude mcp add …` command for Claude Code. */
  claudeCodeCommand(opts?: McpConfigOptions): string {
    return claudeCodeMcpCommand(this.http.getApiKey() || 'YOUR_API_KEY', { url: this.http.mcpUrl, ...opts });
  }
}
