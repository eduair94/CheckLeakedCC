import type { IHttpClient } from '../http';
import type {
  CrossSourceCheckInput,
  CrossSourceCheckResponse,
  LeakDetails,
  Paginated,
  UnlockByIdsInput,
} from '../types';
import { AdvancedResource } from './resources/AdvancedResource';
import { ContainerResource } from './resources/ContainerResource';
import { DarkWebResource } from './resources/DarkWebResource';
import { DomainResource } from './resources/DomainResource';
import { EmailResource } from './resources/EmailResource';
import { ListsResource } from './resources/ListsResource';
import { MonitorResource } from './resources/MonitorResource';
import { NotificationsResource } from './resources/NotificationsResource';
import { PasswordResource } from './resources/PasswordResource';
import { RawFilesResource } from './resources/RawFilesResource';
import { RawResource } from './resources/RawResource';
import { TasksResource } from './resources/TasksResource';
import { UnlockedResource } from './resources/UnlockedResource';

/**
 * `client.leakradar` — the full LeakRadar integration exposed through the
 * CheckLeaked.cc proxy. Each family of endpoints is a scoped resource:
 *
 *     const lr = client.leakradar;
 *     await lr.email.search('foo@bar.com');
 *     await lr.domain.report('example.com');
 *     await lr.darkWeb.search('acme');
 *     const t = await lr.raw.unlockAsync({ q: 'password' });
 *     await lr.tasks.pollUntilDone(t.task_id);
 */
export class LeakRadarClient {
  public readonly email: EmailResource;
  public readonly domain: DomainResource;
  public readonly advanced: AdvancedResource;
  public readonly raw: RawResource;
  public readonly container: ContainerResource;
  public readonly rawFiles: RawFilesResource;
  public readonly unlocked: UnlockedResource;
  public readonly lists: ListsResource;
  public readonly notifications: NotificationsResource;
  public readonly darkWeb: DarkWebResource;
  public readonly password: PasswordResource;
  public readonly monitor: MonitorResource;
  public readonly tasks: TasksResource;

  constructor(private readonly http: IHttpClient) {
    this.email = new EmailResource(http);
    this.domain = new DomainResource(http);
    this.advanced = new AdvancedResource(http);
    this.raw = new RawResource(http);
    this.container = new ContainerResource(http);
    this.rawFiles = new RawFilesResource(http);
    this.unlocked = new UnlockedResource(http);
    this.lists = new ListsResource(http);
    this.notifications = new NotificationsResource(http);
    this.darkWeb = new DarkWebResource(http);
    this.password = new PasswordResource(http);
    this.monitor = new MonitorResource(http);
    this.tasks = new TasksResource(http);
  }

  // -------------------------------------------------------------------------
  // Top-level endpoints that don't belong to a single resource family
  // -------------------------------------------------------------------------

  /**
   * Fan-out check across email search + domain summary (+ dark web for Plus/Pro).
   * Provide at least one of `email` or `domain`.
   */
  crossSourceCheck(input: CrossSourceCheckInput): Promise<CrossSourceCheckResponse> {
    return this.http.request<CrossSourceCheckResponse>({
      method: 'POST',
      path: '/leakradar/cross-source-check',
      body: { email: input.email, domain: input.domain },
    });
  }

  /** Your paginated LeakRadar action log. */
  searchHistory(opts: { page?: number; limit?: number } = {}): Promise<Paginated<Record<string, any>>> {
    return this.http.request<Paginated<Record<string, any>>>({
      method: 'GET',
      path: '/leakradar/search-history',
      query: { page: opts.page, limit: opts.limit },
    });
  }

  /** Your saved raw stealer-log searches (deduplicated by query), newest first. */
  rawSearchHistory(
    opts: { page?: number; limit?: number; q?: string; sort?: string; order?: 1 | -1 } = {},
  ): Promise<Paginated<Record<string, any>>> {
    return this.http.request<Paginated<Record<string, any>>>({
      method: 'GET',
      path: '/leakradar/search-history/raw',
      query: { page: opts.page, limit: opts.limit, q: opts.q, sort: opts.sort, order: opts.order },
    });
  }

  /** Delete one saved raw search (by its `hash`) or all of them (`{ all: true }`). */
  deleteRawSearchHistory(input: { hash?: string; all?: boolean }): Promise<{ success: boolean; deleted: number }> {
    return this.http.request<{ success: boolean; deleted: number }>({
      method: 'POST',
      path: '/leakradar/search-history/raw/delete',
      body: { hash: input.hash, all: input.all },
    });
  }

  /** Directly unlock specific leaks by id (charged per leak). */
  unlock(input: UnlockByIdsInput): Promise<LeakDetails[] | Record<string, any>> {
    return this.http.request<LeakDetails[] | Record<string, any>>({
      method: 'POST',
      path: '/leakradar/unlock',
      body: { leak_ids: input.leak_ids, target_list_id: input.target_list_id },
    });
  }

  /** List your scheduled export jobs. */
  exports(opts: { page?: number; page_size?: number } = {}): Promise<Paginated<Record<string, any>>> {
    return this.http.request<Paginated<Record<string, any>>>({
      method: 'GET',
      path: '/leakradar/exports',
      query: { page: opts.page, page_size: opts.page_size },
    });
  }
}
