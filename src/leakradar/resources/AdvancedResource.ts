import { BaseResource } from '../../resources/BaseResource';
import { normalizeFilters } from '../filters';
import type {
  AdvancedSearchOptions,
  AdvancedUnlockOptions,
  ExportFormat,
  ExportJob,
  LeakDetails,
  LeakSearchFilters,
  Paginated,
  QueuedTask,
} from '../../types';

/**
 * `leakradar.advanced` — full multi-field filtered leak search with exports and
 * unlock workflows. `auto_unlock` is always forced on server-side for `search`.
 */
export class AdvancedResource extends BaseResource {
  /** Advanced filtered search. Scalar filter values are auto-wrapped into arrays. */
  search(filters: LeakSearchFilters, opts: AdvancedSearchOptions = {}): Promise<Paginated<LeakDetails>> {
    return this.http.request<Paginated<LeakDetails>>({
      method: 'POST',
      path: '/leakradar/search/advanced',
      body: normalizeFilters(filters),
      query: { page: opts.page, page_size: opts.page_size },
    });
  }

  /** Synchronously unlock matches. Charged per unlocked item. */
  unlock(filters: LeakSearchFilters, opts: AdvancedUnlockOptions = {}): Promise<LeakDetails[]> {
    return this.http.request<LeakDetails[]>({
      method: 'POST',
      path: '/leakradar/search/advanced/unlock',
      body: { ...normalizeFilters(filters), max: opts.max },
    });
  }

  /** Queue an async unlock task. Poll the returned `task_id` via `leakradar.tasks`. */
  unlockAsync(filters: LeakSearchFilters, opts: AdvancedUnlockOptions = {}): Promise<QueuedTask> {
    return this.http.request<QueuedTask>({
      method: 'POST',
      path: '/leakradar/search/advanced/unlock-async',
      body: { ...normalizeFilters(filters), max: opts.max },
    });
  }

  /** Schedule a CSV/JSON export of matching rows. */
  export(filters: LeakSearchFilters, format: ExportFormat = 'csv'): Promise<ExportJob> {
    return this.http.request<ExportJob>({
      method: 'POST',
      path: '/leakradar/search/advanced/export',
      body: { ...normalizeFilters(filters), format },
    });
  }

  /** Schedule a CSV/JSON export of just the distinct URLs matching the filters. */
  exportUrls(filters: LeakSearchFilters, format: ExportFormat = 'csv'): Promise<ExportJob> {
    return this.http.request<ExportJob>({
      method: 'POST',
      path: '/leakradar/search/advanced/export-urls',
      body: { ...normalizeFilters(filters), format },
    });
  }
}
