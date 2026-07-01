import { BaseResource } from '../../resources/BaseResource';
import type {
  ExportJob,
  QueuedTask,
  RawExportTarget,
  RawPartQuery,
  RawPartsQuery,
  RawSearchOptions,
  RawSearchRequest,
  RawSearchResponse,
} from '../../types';

/**
 * `leakradar.raw` — full-text search over raw stealer-log blocks, plus the
 * companion endpoints to inspect individual parts and schedule exports/unlocks.
 */
export class RawResource extends BaseResource {
  /** Search raw blocks. When `auto_unlock` is on the server orchestrates an unlock+refetch. */
  search(request: RawSearchRequest, opts: RawSearchOptions = {}): Promise<RawSearchResponse> {
    return this.http.request<RawSearchResponse>({
      method: 'POST',
      path: '/leakradar/search/raw',
      body: request,
      query: {
        page: opts.page,
        page_size: opts.page_size,
        cursor: opts.cursor,
        auto_unlock: opts.auto_unlock,
        refresh: opts.refresh,
      },
    });
  }

  /** List the parts (chunks) of a specific raw file entry within a container. */
  listParts(query: RawPartsQuery): Promise<Record<string, any>> {
    return this.http.request<Record<string, any>>({
      method: 'GET',
      path: '/leakradar/search/raw/parts',
      query: {
        container_id: query.container_id,
        entry_path: query.entry_path,
        page: query.page,
        page_size: query.page_size,
        refresh: query.refresh,
      },
    });
  }

  /** Fetch a single raw file part by sequence number. */
  getPart(query: RawPartQuery): Promise<Record<string, any>> {
    return this.http.request<Record<string, any>>({
      method: 'GET',
      path: '/leakradar/search/raw/part',
      query: {
        container_id: query.container_id,
        entry_path: query.entry_path,
        seq: query.seq,
        trim_overlap: query.trim_overlap,
        overlap_chars: query.overlap_chars,
        auto_unlock: query.auto_unlock,
      },
    });
  }

  /** Schedule an export of raw search results (`rows` or `parts`). */
  export(request: RawSearchRequest, target: RawExportTarget = 'rows'): Promise<ExportJob> {
    return this.http.request<ExportJob>({
      method: 'POST',
      path: '/leakradar/search/raw/export',
      body: { ...request, target },
    });
  }

  /** Queue an async unlock task for raw matches. Poll the `task_id` via `leakradar.tasks`. */
  unlockAsync(request: RawSearchRequest, max?: number): Promise<QueuedTask> {
    return this.http.request<QueuedTask>({
      method: 'POST',
      path: '/leakradar/search/raw/unlock-async',
      body: { ...request, max },
    });
  }
}
