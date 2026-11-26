/** MCP protocol versions this package speaks, newest first. */
export const MCP_SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'] as const;

/** The version offered when we start a session. */
export const MCP_PROTOCOL_VERSION = MCP_SUPPORTED_PROTOCOL_VERSIONS[0];

/** Pick the version to answer an `initialize` with: the client's when we support it, else our newest. */
export function negotiateProtocolVersion(requested: unknown): string {
  return typeof requested === 'string' && (MCP_SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : MCP_PROTOCOL_VERSION;
}
