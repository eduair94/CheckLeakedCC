import { BaseResource } from './BaseResource';
import type { BreachRecord, BreachSearchHit, BreachSearchOptions, BreachSearchResponse } from '../types';

/**
 * `client.breaches` — the public breach registry (HIBP-compatible records,
 * metadata only, never anyone's data). Open routes: free, no credits.
 */
export class BreachesResource extends BaseResource {
  /** One breach by its registry name (e.g. `Adobe`, `LinkedIn`). `lang` translates the description. */
  get(name: string, opts: { lang?: string } = {}): Promise<BreachRecord> {
    return this.http.request<BreachRecord>({
      method: 'GET',
      path: `/breaches/${encodeURIComponent(name.trim())}`,
      query: { lang: opts.lang },
      base: 'site',
      auth: 'none',
    });
  }

  /** Paginated registry search over name, domain and description → `{ items, total }`. */
  search(opts: BreachSearchOptions = {}): Promise<BreachSearchResponse> {
    // The handler reads filters from the POST body (a GET dumps the whole
    // registry) and treats a missing page/itemsPerPage as "everything".
    return this.http.request<BreachSearchResponse>({
      method: 'POST',
      path: '/breaches',
      body: {
        page: opts.page ?? 1,
        itemsPerPage: opts.itemsPerPage ?? 20,
        search: opts.search,
        sortBy: opts.sortBy,
        sortDesc: opts.sortDesc,
      },
      query: { lang: opts.lang },
      base: 'site',
      auth: 'none',
    });
  }

  /** Fast name/domain autocomplete → compact hits (`Name`, `Domain`, `LogoPath`). */
  find(query: string): Promise<BreachSearchHit[]> {
    return this.http.request<BreachSearchHit[]>({
      method: 'GET',
      path: '/breaches/list_search',
      query: { search: query },
      base: 'site',
      auth: 'none',
    });
  }

  /** The most recently added breach. */
  async latest(): Promise<BreachRecord> {
    const res = await this.http.request<{ success?: BreachRecord } | BreachRecord>({
      method: 'GET',
      path: '/hibp/latest-breach',
      base: 'site',
      auth: 'none',
    });
    const wrapped = res as { success?: unknown };
    return (wrapped && typeof wrapped.success === 'object' && wrapped.success ? wrapped.success : res) as BreachRecord;
  }

  /** A printable PDF report for one breach (binary). */
  reportPdf(name: string): Promise<ArrayBuffer> {
    return this.http.request<ArrayBuffer>({
      method: 'GET',
      path: `/breaches/${encodeURIComponent(name.trim())}/report.pdf`,
      responseType: 'arraybuffer',
      base: 'site',
      auth: 'none',
    });
  }
}
