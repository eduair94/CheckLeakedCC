/**
 * checkleakedcc — official Node.js / TypeScript SDK for https://checkleaked.cc
 *
 *     import CheckLeakedCC from 'checkleakedcc';
 *     const api = new CheckLeakedCC('YOUR-API-KEY');
 *
 * CommonJS:
 *
 *     const CheckLeakedCC = require('checkleakedcc').default;
 *     const api = new CheckLeakedCC('YOUR-API-KEY');
 *
 * MCP server for Claude Desktop / Cursor / VS Code: .
 */
import { CheckLeakedCC } from './CheckLeakedCC';

export { CheckLeakedCC };
export { API_KEY_ENV } from './CheckLeakedCC';
export { SDK_VERSION } from './version';

/** @deprecated Renamed to {@link CheckLeakedCC}. Kept for v1 back-compat. */
export const LeakCheckCC = CheckLeakedCC;

// Transport + config
export { DEFAULT_BASE_URL, DEFAULT_MCP_URL, DEFAULT_SITE_URL, DEFAULT_WORMGPT_URL, HttpClient } from './http';
export type { ApiBase, AuthMode, CheckLeakedConfig, FetchLike, HttpMethod, IHttpClient, RequestOptions } from './http';

// Error hierarchy
export {
  CheckLeakedApiError,
  CheckLeakedAuthError,
  CheckLeakedError,
  CheckLeakedNetworkError,
  CheckLeakedRateLimitError,
  CheckLeakedServerError,
  CheckLeakedValidationError,
  errorCodeFromBody,
} from './errors';

// Resources (exported so advanced users can compose their own client)
export { BaseResource } from './resources/BaseResource';
export { CoreResource } from './resources/CoreResource';
export { NativeTrackingResource, TrackingResource } from './resources/TrackingResource';
export { LeakRadarClient } from './leakradar/LeakRadarClient';
export { AdvancedResource } from './leakradar/resources/AdvancedResource';
export { ContainerResource } from './leakradar/resources/ContainerResource';
export { DarkWebResource } from './leakradar/resources/DarkWebResource';
export { DomainResource } from './leakradar/resources/DomainResource';
export { EmailResource } from './leakradar/resources/EmailResource';
export { ListsResource } from './leakradar/resources/ListsResource';
export { MonitorResource } from './leakradar/resources/MonitorResource';
export {
  NotificationMethodsResource,
  NotificationRunsResource,
  NotificationsResource,
} from './leakradar/resources/NotificationsResource';
export { PasswordResource } from './leakradar/resources/PasswordResource';
export { RawFilesResource } from './leakradar/resources/RawFilesResource';
export { RawResource } from './leakradar/resources/RawResource';
export { TasksResource } from './leakradar/resources/TasksResource';
export { UnlockedResource } from './leakradar/resources/UnlockedResource';
export { AiResource } from './resources/AiResource';
export { BreachesResource } from './resources/BreachesResource';
export { KanonResource, emailKanonHash, matchPwnedRange, splitPwnedHash } from './resources/KanonResource';
export { PrivateBotsResource } from './resources/PrivateBotsResource';
export { NewsResource, SiteResource } from './resources/SiteResource';
export { WebhooksResource } from './resources/WebhooksResource';

// Webhook receiver helpers
export {
  WEBHOOK_DELIVERY_HEADER,
  WEBHOOK_EVENT_HEADER,
  WEBHOOK_SIGNATURE_HEADER,
  parseWebhookSignature,
  signWebhookPayload,
  verifyWebhookSignature,
} from './webhooks';
export type { VerifyWebhookOptions } from './webhooks';

// WormGPT
export { WormGPTClient, completionText } from './wormgpt/WormGPTClient';
export type { WormAskOptions } from './wormgpt/WormGPTClient';
export { readSse } from './wormgpt/sse';
export type { SseMessage } from './wormgpt/sse';

// MCP
export { McpResource } from './mcp/McpResource';
export { RemoteMcpClient } from './mcp/remote';
export type { McpCallResult, McpToolDescriptor } from './mcp/remote';
export { CheckLeakedMcpServer, serveStdio } from './mcp/server';
export type { McpServerOptions, StdioOptions } from './mcp/server';
export { createCheckLeakedTools, runCheckLeakedTool, toAnthropicTools, toOpenAITools, validateArgs } from './mcp/tools';
export type { CheckLeakedTool, CreateToolsOptions, JsonSchema, ToolAnnotations } from './mcp/tools';
export { claudeCodeMcpCommand, mcpConfig } from './mcp/config';
export type { McpClientName, McpConfigOptions } from './mcp/config';
export { MCP_PROTOCOL_VERSION, MCP_SUPPORTED_PROTOCOL_VERSIONS } from './mcp/protocol';

// All public types
export * from './types';

/**
 * Exhaustive, sample-derived response shapes generated from live API responses
 * with quicktype. Power users can reach for the precise nested structures:
 *
 *     import { schemas } from 'checkleakedcc';
 *     type Whois = schemas.Whois;
 */
export * as schemas from './schemas';

export default CheckLeakedCC;
