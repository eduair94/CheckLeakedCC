#!/usr/bin/env node
/**
 * `checkleakedcc` command line.
 *
 *   npx -y checkleakedcc mcp                     MCP server over stdio (Claude Desktop, Cursor, VS Code…)
 *   npx -y checkleakedcc call <tool> ['<json>']  run any tool, print JSON
 *   npx -y checkleakedcc ask "<question>"        stream a WormGPT answer
 *   npx -y checkleakedcc investigate <subject>   WormGPT OSINT dossier (markdown)
 *   npx -y checkleakedcc tools                   list tools
 *   npx -y checkleakedcc mcp-config <client>     print an MCP client config
 *
 * The api key comes from CHECKLEAKED_API_KEY (preferred) or --api-key.
 */
import { API_KEY_ENV, CheckLeakedCC } from './CheckLeakedCC';
import { CheckLeakedApiError, CheckLeakedError } from './errors';
import { claudeCodeMcpCommand, mcpConfig, type McpClientName } from './mcp/config';
import { createCheckLeakedTools } from './mcp/tools';
import { SDK_VERSION } from './version';

const HELP = `checkleakedcc ${SDK_VERSION} — CheckLeaked.cc SDK command line

Usage:
  checkleakedcc mcp [--read-only] [--include a,b] [--exclude a,b]
      Run the MCP server over stdio. Configure your client with:
        { "command": "npx", "args": ["-y", "checkleakedcc", "mcp"],
          "env": { "${API_KEY_ENV}": "<your key>" } }
  checkleakedcc call <tool> ['<json arguments>']   Run one tool and print its JSON result
  checkleakedcc ask "<question>" [--tools] [--model <id>] [--system "<prompt>"]
                                                   Stream a WormGPT answer (--tools = agent mode)
  checkleakedcc investigate <subject> [--type email|username|domain|phone|ip|name]
                                                   WormGPT OSINT dossier (Pro), printed as markdown
  checkleakedcc tools [--json]                     List the available tools
  checkleakedcc mcp-config <claude-desktop|claude-code|cursor|vscode|windsurf> [--local]
                                                   Print a ready-to-paste MCP client config
  checkleakedcc --version | --help

Api key: set ${API_KEY_ENV} (get one at https://checkleaked.cc/botLinks), or pass --api-key <key>.
Free tools (breach registry, news, plans, k-anonymity checks) work without a key.
`;

interface Parsed {
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): Parsed {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  const valued = new Set(['api-key', 'include', 'exclude', 'model', 'system', 'type', 'base-url']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      const key = eq === -1 ? a.slice(2) : a.slice(2, eq);
      if (eq !== -1) flags[key] = a.slice(eq + 1);
      else if (valued.has(key) && i + 1 < argv.length) flags[key] = argv[++i];
      else flags[key] = true;
    } else if (a === '-h') flags.help = true;
    else if (a === '-v') flags.version = true;
    else positional.push(a);
  }
  return { positional, flags };
}

function list(v: string | boolean | undefined): string[] | undefined {
  return typeof v === 'string' ? v.split(',').map((x) => x.trim()).filter(Boolean) : undefined;
}

function client(flags: Parsed['flags']): CheckLeakedCC {
  const env = process.env;
  const apiKey = (typeof flags['api-key'] === 'string' ? flags['api-key'] : '') || env[API_KEY_ENV] || env.CHECKLEAKED_KEY || '';
  return new CheckLeakedCC({
    apiKey,
    allowMissingApiKey: true,
    baseUrl: typeof flags['base-url'] === 'string' ? flags['base-url'] : env.CHECKLEAKED_API_URL,
    siteUrl: env.CHECKLEAKED_SITE_URL,
    wormgptUrl: env.CHECKLEAKED_WORMGPT_URL,
    userAgent: `checkleakedcc-cli/${SDK_VERSION}`,
  });
}

function printError(err: unknown): void {
  if (err instanceof CheckLeakedApiError) {
    process.stderr.write(`Error: ${err.message}${err.code ? ` [${err.code}]` : ''}${err.status ? ` (HTTP ${err.status})` : ''}\n`);
  } else if (err instanceof CheckLeakedError) {
    process.stderr.write(`Error: ${err.message}\n`);
  } else {
    process.stderr.write(`Error: ${(err as Error)?.message || String(err)}\n`);
  }
}

async function main(argv: string[]): Promise<number> {
  const { positional, flags } = parseArgs(argv);
  const [cmd, ...rest] = positional;
  if (flags.version) {
    process.stdout.write(SDK_VERSION + '\n');
    return 0;
  }
  if (flags.help || !cmd || cmd === 'help') {
    process.stdout.write(HELP);
    return cmd || flags.help ? 0 : 1;
  }

  switch (cmd) {
    case 'mcp': {
      const api = client(flags);
      const log = (m: string) => process.stderr.write(`[checkleakedcc] ${m}\n`);
      if (!api.http.hasApiKey) log(`no ${API_KEY_ENV} set: only free tools will work`);
      await api.mcp.serveStdio({ readOnly: !!flags['read-only'], include: list(flags.include), exclude: list(flags.exclude), log });
      return 0;
    }
    case 'call': {
      const [tool, json] = rest;
      if (!tool) throw new CheckLeakedError('Usage: checkleakedcc call <tool> [\'<json arguments>\']');
      let args: Record<string, unknown> = {};
      if (json) {
        try {
          args = JSON.parse(json);
        } catch {
          throw new CheckLeakedError('Arguments must be a JSON object, e.g. \'{"domain":"example.com"}\'');
        }
      }
      const result = await client(flags).mcp.runTool(tool, args);
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      return 0;
    }
    case 'ask': {
      const prompt = rest.join(' ').trim();
      if (!prompt) throw new CheckLeakedError('Usage: checkleakedcc ask "<question>"');
      const api = client(flags);
      const messages = [
        ...(typeof flags.system === 'string' ? [{ role: 'system' as const, content: flags.system }] : []),
        { role: 'user' as const, content: prompt },
      ];
      for await (const ev of api.wormgpt.stream({ messages, tools_enabled: !!flags.tools, model: typeof flags.model === 'string' ? flags.model : undefined })) {
        if (ev.type === 'content') process.stdout.write(ev.delta);
        else if (ev.type === 'tool_start') process.stderr.write(`\n[tool: ${ev.tool}]\n`);
      }
      process.stdout.write('\n');
      return 0;
    }
    case 'investigate': {
      const term = rest.join(' ').trim();
      if (!term) throw new CheckLeakedError('Usage: checkleakedcc investigate <subject>');
      process.stderr.write('Investigating (this can take a few minutes)…\n');
      const res = await client(flags).ai.investigate(term, { type: typeof flags.type === 'string' ? flags.type : undefined });
      process.stdout.write(res.report.markdown + '\n');
      if (res.report.sources?.length) {
        process.stdout.write('\nSources:\n' + res.report.sources.map((s) => `- ${s.title ? `${s.title} — ` : ''}${s.url}`).join('\n') + '\n');
      }
      return 0;
    }
    case 'tools': {
      const tools = createCheckLeakedTools(client(flags));
      if (flags.json) {
        process.stdout.write(JSON.stringify(tools.map(({ name, description, inputSchema, annotations }) => ({ name, description, inputSchema, annotations })), null, 2) + '\n');
      } else {
        const width = Math.max(...tools.map((t) => t.name.length));
        for (const t of tools) {
          const tag = !t.requiresApiKey ? 'free ' : t.annotations.readOnlyHint ? 'read ' : 'spend';
          process.stdout.write(`${t.name.padEnd(width)}  ${tag}  ${t.title}\n`);
        }
        process.stdout.write(`\n${tools.length} tools. "free" = no api key needed; "spend" may use credits or change account state.\n`);
      }
      return 0;
    }
    case 'mcp-config': {
      const target = (rest[0] || 'claude-desktop') as McpClientName;
      const valid: McpClientName[] = ['claude-desktop', 'claude-code', 'cursor', 'vscode', 'windsurf'];
      if (!valid.includes(target)) throw new CheckLeakedError(`Unknown client "${target}". Use one of: ${valid.join(', ')}`);
      const key = client(flags).http.getApiKey() || 'YOUR_API_KEY';
      const mode = flags.local ? 'local' : 'remote';
      if (target === 'claude-code') process.stdout.write(claudeCodeMcpCommand(key, { mode }) + '\n');
      else process.stdout.write(JSON.stringify(mcpConfig(target, key, { mode }), null, 2) + '\n');
      return 0;
    }
    default:
      process.stderr.write(`Unknown command "${cmd}".\n\n${HELP}`);
      return 1;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    printError(err);
    process.exitCode = 1;
  },
);
