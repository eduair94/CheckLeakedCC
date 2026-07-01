import { BaseResource } from '../../resources/BaseResource';
import { normalizeFilters } from '../filters';
import type {
  BulkAssignInput,
  BulkStatusInput,
  ExportFormat,
  ExportJob,
  LeakSearchFilters,
  Paginated,
  QueuedTask,
  RemediationStatus,
  UnlockedExportOptions,
  UnlockedLeakDetails,
  UnlockedListOptions,
} from '../../types';

/**
 * `leakradar.unlocked` — your archive of already-unlocked leaks: browse, export,
 * triage (status / comment / list assignment), and bulk operations.
 */
export class UnlockedResource extends BaseResource {
  /** List your unlocked leaks. */
  list(opts: UnlockedListOptions = {}): Promise<Paginated<UnlockedLeakDetails>> {
    return this.http.request<Paginated<UnlockedLeakDetails>>({
      method: 'GET',
      path: '/leakradar/unlocked',
      query: {
        page: opts.page,
        page_size: opts.page_size,
        search: opts.search,
        is_email: opts.is_email,
        status: opts.status,
      },
    });
  }

  /** Advanced query over your unlocked leaks (LeakSearchFilters-style fields + pagination). */
  advanced(query: LeakSearchFilters & { page?: number; page_size?: number; search?: string; status?: RemediationStatus } = {}): Promise<Paginated<UnlockedLeakDetails>> {
    return this.http.request<Paginated<UnlockedLeakDetails>>({
      method: 'GET',
      path: '/leakradar/unlocked/advanced',
      query: query as Record<string, any>,
    });
  }

  /** Schedule a CSV/JSON export of your unlocked leaks. */
  export(opts: UnlockedExportOptions = {}): Promise<ExportJob> {
    return this.http.request<ExportJob>({
      method: 'POST',
      path: '/leakradar/unlocked/export',
      body: {
        search: opts.search,
        is_email: opts.is_email,
        unlocked_at_min: opts.unlocked_at_min,
        format: opts.format || 'csv',
      },
    });
  }

  /** Schedule an export of your unlocked leaks filtered by advanced criteria. */
  advancedExport(filters: LeakSearchFilters, opts: { format?: ExportFormat; unlocked_at_min?: string } = {}): Promise<ExportJob> {
    return this.http.request<ExportJob>({
      method: 'POST',
      path: '/leakradar/unlocked/advanced/export',
      body: normalizeFilters(filters),
      query: { format: opts.format || 'csv', unlocked_at_min: opts.unlocked_at_min },
    });
  }

  /** Assign a single unlocked leak to a list, or pass `null` to remove it from its list. */
  setList(leakId: string, listId: number | null): Promise<Record<string, any>> {
    return this.http.request<Record<string, any>>({
      method: 'POST',
      path: `/leakradar/unlocked/${encodeURIComponent(leakId)}/list`,
      body: { list_id: listId },
    });
  }

  /** Set the remediation status of a single unlocked leak. */
  setStatus(leakId: string, status: RemediationStatus): Promise<Record<string, any>> {
    return this.http.request<Record<string, any>>({
      method: 'POST',
      path: `/leakradar/unlocked/${encodeURIComponent(leakId)}/status`,
      body: { status },
    });
  }

  /** Create or update the comment on a single unlocked leak. */
  upsertComment(leakId: string, comment: string): Promise<Record<string, any>> {
    return this.http.request<Record<string, any>>({
      method: 'POST',
      path: `/leakradar/unlocked/${encodeURIComponent(leakId)}/comment`,
      body: { comment },
    });
  }

  /** Delete the comment on a single unlocked leak. */
  deleteComment(leakId: string): Promise<Record<string, any>> {
    return this.http.request<Record<string, any>>({
      method: 'POST',
      path: `/leakradar/unlocked/${encodeURIComponent(leakId)}/comment/delete`,
    });
  }

  /** Bulk-update remediation status across many owned leaks. */
  bulkStatus(input: BulkStatusInput): Promise<Record<string, any>> {
    return this.http.request<Record<string, any>>({ method: 'POST', path: '/leakradar/unlocked/bulk-status', body: input });
  }

  /** Bulk-assign many owned leaks to a list (or `null` to clear). May return a task. */
  bulkAssign(input: BulkAssignInput): Promise<QueuedTask | Record<string, any>> {
    return this.http.request<QueuedTask | Record<string, any>>({ method: 'POST', path: '/leakradar/unlocked/bulk-assign', body: input });
  }
}
