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
 */
import { CheckLeakedCC } from './CheckLeakedCC';

export { CheckLeakedCC };

/** @deprecated Renamed to {@link CheckLeakedCC}. Kept for v1 back-compat. */
export const LeakCheckCC = CheckLeakedCC;

// Transport + config
export { HttpClient } from './http';
export type { CheckLeakedConfig, HttpMethod, IHttpClient, RequestOptions } from './http';

// Error hierarchy
export {
  CheckLeakedApiError,
  CheckLeakedAuthError,
  CheckLeakedError,
  CheckLeakedNetworkError,
  CheckLeakedRateLimitError,
  CheckLeakedServerError,
  CheckLeakedValidationError,
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
