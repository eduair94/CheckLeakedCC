import { BaseResource } from '../../resources/BaseResource';
import type {
  DarkWebDigest,
  DarkWebSearchOptions,
  DarkWebSearchRequest,
  DarkWebSearchResponse,
  DarkWebSourcesResponse,
  DarkWebStatsResponse,
} from '../../types';

/**
 * `leakradar.darkWeb` — dark-web / telegram / forum post indexing.
 */
export class DarkWebResource extends BaseResource {
  /** Search dark-web posts. Pass the query and optional filters. */
  search(query: string | DarkWebSearchRequest, opts: DarkWebSearchOptions = {}): Promise<DarkWebSearchResponse> {
    const body: DarkWebSearchRequest = typeof query === 'string' ? { query } : query;
    return this.http.request<DarkWebSearchResponse>({
      method: 'POST',
      path: '/leakradar/dark-web/search',
      body,
      query: {
        page: opts.page,
        page_size: opts.page_size,
        sources: opts.sources,
        date_from: opts.date_from,
        date_to: opts.date_to,
        sort_by: opts.sort_by,
        sort_order: opts.sort_order,
        refresh: opts.refresh,
      },
    });
  }

  /** Fetch a single dark-web post by id. */
  getPost(postId: string): Promise<Record<string, any>> {
    return this.http.request<Record<string, any>>({
      method: 'GET',
      path: `/leakradar/dark-web/post/${encodeURIComponent(postId)}`,
    });
  }

  /** List available dark-web sources with post counts. */
  sources(refresh?: boolean): Promise<DarkWebSourcesResponse> {
    return this.http.request<DarkWebSourcesResponse>({ method: 'GET', path: '/leakradar/dark-web/sources', query: { refresh } });
  }

  /** Dark-web aggregate statistics. */
  stats(refresh?: boolean): Promise<DarkWebStatsResponse> {
    return this.http.request<DarkWebStatsResponse>({ method: 'GET', path: '/leakradar/dark-web/stats', query: { refresh } });
  }

  /**
   * 7-day dark-web mention digest for a single domain, or — when `domain` is
   * omitted — across every domain you monitor.
   */
  digest(domain?: string, refresh?: boolean): Promise<DarkWebDigest> {
    return this.http.request<DarkWebDigest>({
      method: 'POST',
      path: '/leakradar/dark-web/digest',
      body: { domain },
      query: { refresh },
    });
  }
}
