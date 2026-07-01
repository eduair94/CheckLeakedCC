import { BaseResource } from '../../resources/BaseResource';
import type {
  EmailMassResponse,
  EmailSearchOptions,
  EmailSearchResponse,
  EmailUnlockOptions,
  ExportFormat,
  ExportJob,
  LeakDetails,
  QueuedTask,
} from '../../types';

/**
 * `leakradar.email` — search and unlock leaks by email or username.
 */
export class EmailResource extends BaseResource {
  /** Paginated locked-leak listing for an email/username. `auto_unlock` defaults ON server-side. */
  search(email: string, opts: EmailSearchOptions = {}): Promise<EmailSearchResponse> {
    return this.http.request<EmailSearchResponse>({
      method: 'POST',
      path: '/leakradar/search/email',
      body: { email, search: opts.search, is_email: opts.is_email },
      query: { page: opts.page, page_size: opts.page_size, auto_unlock: opts.auto_unlock, refresh: opts.refresh },
    });
  }

  /** Synchronously unlock leaks for an email/username. Charged per unlocked item. */
  unlock(email: string, opts: EmailUnlockOptions = {}): Promise<LeakDetails[]> {
    return this.http.request<LeakDetails[]>({
      method: 'POST',
      path: '/leakradar/search/email/unlock',
      body: { email, search: opts.search, is_email: opts.is_email, max: opts.max },
    });
  }

  /** Queue an async unlock task. Poll the returned `task_id` via `leakradar.tasks`. */
  unlockAsync(email: string, opts: EmailUnlockOptions = {}): Promise<QueuedTask> {
    return this.http.request<QueuedTask>({
      method: 'POST',
      path: '/leakradar/search/email/unlock-async',
      body: { email, search: opts.search, is_email: opts.is_email, max: opts.max },
    });
  }

  /** Schedule a CSV/JSON export job for an email/username search. */
  export(email: string, opts: { search?: string | null; is_email?: boolean | null; format?: ExportFormat } = {}): Promise<ExportJob> {
    return this.http.request<ExportJob>({
      method: 'POST',
      path: '/leakradar/search/email/export',
      body: { email, search: opts.search, is_email: opts.is_email, format: opts.format || 'csv' },
    });
  }

  /** Bulk existence check across up to 100 emails/usernames. */
  lockedExistsBulk(emails: string[], includeCounts = false): Promise<EmailMassResponse> {
    return this.http.request<EmailMassResponse>({
      method: 'POST',
      path: '/leakradar/search/emails/locked-exists',
      body: { emails, include_counts: includeCounts },
    });
  }
}
