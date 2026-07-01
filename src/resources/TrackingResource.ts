import { BaseResource } from './BaseResource';
import type { IHttpClient } from '../http';
import type {
  TrackingEntry,
  TrackingHistoryItem,
  TrackingHistoryResult,
  TrackingLimit,
  TrackingNativeType,
  TrackingLeakRadarType,
} from '../types';

/**
 * Breach-monitoring ("tracking") endpoints. The account is identified by the
 * api-key, so no user id is ever passed by the caller.
 *
 * Two flavors share this shape but differ in the base path and the entry
 * `type` values they accept:
 *   - native  (`/tracking/*`)          types: `login` | `email` | `domain`
 *   - leakradar (`/tracking/leakradar/*`) types: `domain` | `raw`
 *
 * Access the right one via `client.tracking` and `client.tracking.leakradar`.
 */
export class TrackingResource<TType extends string = string> extends BaseResource {
  private readonly base: string;

  constructor(http: IHttpClient, basePath: string) {
    super(http);
    this.base = basePath.replace(/\/+$/, '');
  }

  /** Add an entry to your monitor. Fails if you hit your role's tracking limit. */
  add(entry: string, type: TType): Promise<TrackingEntry> {
    return this.http.request<TrackingEntry>({ method: 'POST', path: `${this.base}/new`, body: { entry, type } });
  }

  /** Alias for {@link add}. */
  create(entry: string, type: TType): Promise<TrackingEntry> {
    return this.add(entry, type);
  }

  /** Remove a monitored entry by its unique id (the `email_unique_id`/`unique_id` field). */
  remove(emailUniqueId: string): Promise<unknown> {
    return this.http.request<unknown>({ method: 'POST', path: `${this.base}/delete`, body: { email_unique_id: emailUniqueId } });
  }

  /** Alias for {@link remove}. */
  delete(emailUniqueId: string): Promise<unknown> {
    return this.remove(emailUniqueId);
  }

  /** Your current tracking usage: `{ limit, total }`. */
  limits(): Promise<TrackingLimit> {
    return this.http.request<TrackingLimit>({ method: 'GET', path: `${this.base}/limit` });
  }

  /** List every entry you are monitoring. */
  list(): Promise<TrackingEntry[]> {
    return this.http.request<TrackingEntry[]>({ method: 'GET', path: `${this.base}/user` });
  }

  /** Alias for {@link list}. */
  entries(): Promise<TrackingEntry[]> {
    return this.list();
  }

  /** Historical check snapshots for a given monitored entry. */
  history(entry: string, type: TType): Promise<TrackingHistoryItem[]> {
    return this.http.request<TrackingHistoryItem[]>({ method: 'POST', path: `${this.base}/history`, body: { entry, type } });
  }

  /** Fetch a single history snapshot (with the resolved leak result) by its id. */
  historyResult(id: string): Promise<TrackingHistoryResult> {
    return this.http.request<TrackingHistoryResult>({ method: 'GET', path: `${this.base}/history/${encodeURIComponent(id)}` });
  }
}

/** Native tracking resource with the `login | email | domain` type surface. */
export class NativeTrackingResource extends TrackingResource<TrackingNativeType> {
  /** LeakRadar-backed monitor (`domain | raw`). */
  public readonly leakradar: TrackingResource<TrackingLeakRadarType>;

  constructor(http: IHttpClient) {
    super(http, '/tracking');
    this.leakradar = new TrackingResource<TrackingLeakRadarType>(http, '/tracking/leakradar');
  }

  /** Only native tracking supports clearing stale/dead entries. */
  cleanEntries(): Promise<unknown> {
    return (this as any).http.request({ method: 'GET', path: '/tracking/clean_entries' });
  }
}
