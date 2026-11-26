/**
 * Ready-to-paste MCP client configurations for the hosted CheckLeaked MCP
 * server and for the local stdio server bundled in this package.
 */
import { DEFAULT_MCP_URL } from '../http';

export type McpClientName = 'claude-desktop' | 'claude-code' | 'cursor' | 'vscode' | 'windsurf';

export interface McpConfigOptions {
  /** `remote` = hosted https://mcp.checkleaked.cc/mcp (default); `local` = `npx -y checkleakedcc mcp`. */
  mode?: 'remote' | 'local';
  /** Hosted endpoint override. */
  url?: string;
  /** Server key in the config (default `checkleaked`). */
  serverName?: string;
}

/**
 * JSON config for one MCP client. `apiKey` goes in the Authorization header
 * (remote) or the `CHECKLEAKED_API_KEY` env var (local).
 *
 * ```ts
 * fs.writeFileSync('.cursor/mcp.json', JSON.stringify(mcpConfig('cursor', key), null, 2));
 * ```
 */
export function mcpConfig(client: McpClientName, apiKey: string, opts: McpConfigOptions = {}): Record<string, unknown> {
  const name = opts.serverName || 'checkleaked';
  const url = opts.url || DEFAULT_MCP_URL;
  const local = { command: 'npx', args: ['-y', 'checkleakedcc', 'mcp'], env: { CHECKLEAKED_API_KEY: apiKey } };
  const headers = { Authorization: `Bearer ${apiKey}` };
  if (opts.mode === 'local') {
    if (client === 'vscode') return { servers: { [name]: { type: 'stdio', ...local } } };
    return { mcpServers: { [name]: local } };
  }
  switch (client) {
    case 'vscode':
      return { servers: { [name]: { type: 'http', url, headers } } };
    case 'windsurf':
      return { mcpServers: { [name]: { serverUrl: url, headers } } };
    case 'claude-code':
      return { mcpServers: { [name]: { type: 'http', url, headers } } };
    default:
      return { mcpServers: { [name]: { url, headers } } };
  }
}

/** The `claude mcp add` command for Claude Code. */
export function claudeCodeMcpCommand(apiKey: string, opts: McpConfigOptions = {}): string {
  const name = opts.serverName || 'checkleaked';
  if (opts.mode === 'local') return `claude mcp add ${name} --env CHECKLEAKED_API_KEY=${apiKey} -- npx -y checkleakedcc mcp`;
  return `claude mcp add --transport http ${name} ${opts.url || DEFAULT_MCP_URL} --header "Authorization: Bearer ${apiKey}"`;
}
