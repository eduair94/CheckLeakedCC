import { BaseResource } from '../../resources/BaseResource';
import type { IHttpClient } from '../../http';
import type {
  ExportJob,
  LeakDetails,
  Notification,
  NotificationInput,
  NotificationMethod,
  NotificationMethodInput,
  NotificationRunExportOptions,
  NotificationRunUnlockOptions,
  Paginated,
  TestNotificationDataType,
} from '../../types';

/** `leakradar.notifications.methods` — delivery channels (email / webhook / …). */
export class NotificationMethodsResource extends BaseResource {
  /** List your notification methods. */
  list(): Promise<NotificationMethod[]> {
    return this.http.request<NotificationMethod[]>({ method: 'GET', path: '/leakradar/notification-methods' });
  }

  /** Create a delivery channel. */
  create(input: NotificationMethodInput): Promise<NotificationMethod> {
    return this.http.request<NotificationMethod>({ method: 'POST', path: '/leakradar/notification-methods', body: input });
  }

  /** Update a delivery channel you own. */
  update(methodId: number, input: Partial<NotificationMethodInput>): Promise<NotificationMethod> {
    return this.http.request<NotificationMethod>({
      method: 'POST',
      path: `/leakradar/notification-methods/${methodId}/update`,
      body: input,
    });
  }

  /** Delete a delivery channel you own. */
  delete(methodId: number): Promise<Record<string, any>> {
    return this.http.request<Record<string, any>>({ method: 'POST', path: `/leakradar/notification-methods/${methodId}/delete` });
  }

  /** Send a test to a candidate (unsaved) method config. */
  test(input: NotificationMethodInput): Promise<Record<string, any>> {
    return this.http.request<Record<string, any>>({ method: 'POST', path: '/leakradar/notification-methods/test', body: input });
  }

  /** Send a test through an existing method using sample data of a given type. */
  testWithData(methodId: number, dataType: TestNotificationDataType = 'leak'): Promise<Record<string, any>> {
    return this.http.request<Record<string, any>>({
      method: 'POST',
      path: `/leakradar/notification-methods/${methodId}/test-with-data`,
      query: { notification_type: dataType },
    });
  }
}

/** `leakradar.notifications.runs` — executions of your monitors. */
export class NotificationRunsResource extends BaseResource {
  /** List notification runs. */
  list(opts: { page?: number; page_size?: number } = {}): Promise<Paginated<Record<string, any>>> {
    return this.http.request<Paginated<Record<string, any>>>({
      method: 'GET',
      path: '/leakradar/notification-runs',
      query: { page: opts.page, page_size: opts.page_size },
    });
  }

  /** Update the status of a run you own. */
  setStatus(runId: number, status: string): Promise<Record<string, any>> {
    return this.http.request<Record<string, any>>({
      method: 'POST',
      path: `/leakradar/notification-runs/${runId}/status`,
      body: { status },
    });
  }

  /** List the leak items produced by a run. */
  items(runId: number, opts: { page?: number; page_size?: number } = {}): Promise<Paginated<Record<string, any>>> {
    return this.http.request<Paginated<Record<string, any>>>({
      method: 'GET',
      path: `/leakradar/notification-runs/${runId}/items`,
      query: { page: opts.page, page_size: opts.page_size },
    });
  }

  /** Unlock leaks found in a run (charged per leak). */
  unlock(runId: number, opts: NotificationRunUnlockOptions = {}): Promise<LeakDetails[]> {
    return this.http.request<LeakDetails[]>({
      method: 'POST',
      path: `/leakradar/notification-runs/${runId}/unlock`,
      query: { max: opts.max, search: opts.search, is_email: opts.is_email },
    });
  }

  /** Schedule a CSV/JSON export of a run's leaks. */
  export(runId: number, opts: NotificationRunExportOptions = {}): Promise<ExportJob> {
    return this.http.request<ExportJob>({
      method: 'GET',
      path: `/leakradar/notification-runs/${runId}/export`,
      query: { search: opts.search, is_email: opts.is_email, format: opts.format || 'csv' },
    });
  }
}

/**
 * `leakradar.notifications` — monitor subscriptions. Nested resources cover the
 * delivery {@link NotificationMethodsResource | methods} and execution
 * {@link NotificationRunsResource | runs}.
 */
export class NotificationsResource extends BaseResource {
  public readonly methods: NotificationMethodsResource;
  public readonly runs: NotificationRunsResource;

  constructor(http: IHttpClient) {
    super(http);
    this.methods = new NotificationMethodsResource(http);
    this.runs = new NotificationRunsResource(http);
  }

  /** List your monitor subscriptions. */
  list(): Promise<Notification[]> {
    return this.http.request<Notification[]>({ method: 'GET', path: '/leakradar/notifications' });
  }

  /** Create a monitor. If `method_id` is set it must be a channel you own. */
  create(input: NotificationInput): Promise<Notification | Notification[]> {
    return this.http.request<Notification | Notification[]>({ method: 'POST', path: '/leakradar/notifications', body: input });
  }

  /** Update a monitor you own. */
  update(notificationId: number, input: Partial<NotificationInput>): Promise<Notification> {
    return this.http.request<Notification>({
      method: 'POST',
      path: `/leakradar/notifications/${notificationId}/update`,
      body: input,
    });
  }

  /** Delete a monitor you own. */
  delete(notificationId: number): Promise<Record<string, any>> {
    return this.http.request<Record<string, any>>({ method: 'POST', path: `/leakradar/notifications/${notificationId}/delete` });
  }

  /** Delete many monitors at once (only owned ids are removed). */
  deleteMany(ids: number[]): Promise<Record<string, any>> {
    return this.http.request<Record<string, any>>({ method: 'POST', path: '/leakradar/notifications/bulk-delete', body: { ids } });
  }

  /** Enable/disable a monitor you own. */
  setActive(notificationId: number, active: boolean): Promise<Notification> {
    return this.http.request<Notification>({
      method: 'POST',
      path: `/leakradar/notifications/${notificationId}/active`,
      body: { active },
    });
  }

  /** Counts of your owned methods and notifications. */
  stats(): Promise<{ methods: number; notifications: number; [k: string]: any }> {
    return this.http.request({ method: 'GET', path: '/leakradar/notifications/stats' });
  }
}
