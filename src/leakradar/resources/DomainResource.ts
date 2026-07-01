import { BaseResource } from '../../resources/BaseResource';
import type {
  DomainBucket,
  DomainBucketWithAll,
  DomainListOptions,
  DomainOccurrencesOptions,
  DomainReport,
  DomainSummaryOptions,
  DomainSummaryResponse,
  LeakDetails,
  Paginated,
} from '../../types';

/**
 * `leakradar.domain` — domain-centric breach intelligence.
 */
export class DomainResource extends BaseResource {
  /** Breach summary for a domain (compromised employees / customers / third parties). */
  summary(domain: string, opts: DomainSummaryOptions = {}): Promise<DomainSummaryResponse> {
    return this.http.request<DomainSummaryResponse>({
      method: 'GET',
      path: '/leakradar/domain/summary',
      query: { domain, light: opts.light, include_search_count: opts.include_search_count, refresh: opts.refresh },
    });
  }

  /** Paginated leak listing for a bucket (`employees` | `customers` | `third_parties` | `all`). */
  list(domain: string, bucket: DomainBucketWithAll = 'employees', opts: DomainListOptions = {}): Promise<Paginated<LeakDetails>> {
    return this.http.request<Paginated<LeakDetails>>({
      method: 'GET',
      path: `/leakradar/domain/${encodeURIComponent(domain)}/${bucket}`,
      query: {
        page: opts.page,
        page_size: opts.page_size,
        search: opts.search,
        auto_unlock: opts.auto_unlock,
        refresh: opts.refresh,
      },
    });
  }

  /** Convenience: `employees` bucket. */
  employees(domain: string, opts?: DomainListOptions): Promise<Paginated<LeakDetails>> {
    return this.list(domain, 'employees', opts);
  }
  /** Convenience: `customers` bucket. */
  customers(domain: string, opts?: DomainListOptions): Promise<Paginated<LeakDetails>> {
    return this.list(domain, 'customers', opts);
  }
  /** Convenience: `third_parties` bucket. */
  thirdParties(domain: string, opts?: DomainListOptions): Promise<Paginated<LeakDetails>> {
    return this.list(domain, 'third_parties', opts);
  }
  /** Convenience: `all` buckets combined. */
  all(domain: string, opts?: DomainListOptions): Promise<Paginated<LeakDetails>> {
    return this.list(domain, 'all', opts);
  }

  /** Paginated list of compromised subdomains with occurrence counts. */
  subdomains(domain: string, opts: DomainOccurrencesOptions = {}): Promise<Paginated<Record<string, any>>> {
    return this.http.request<Paginated<Record<string, any>>>({
      method: 'GET',
      path: `/leakradar/domain/${encodeURIComponent(domain)}/subdomains`,
      query: { page: opts.page, page_size: opts.page_size, search: opts.search, refresh: opts.refresh },
    });
  }

  /** Paginated list of compromised URLs with occurrence counts. */
  urls(domain: string, opts: DomainOccurrencesOptions = {}): Promise<Paginated<Record<string, any>>> {
    return this.http.request<Paginated<Record<string, any>>>({
      method: 'GET',
      path: `/leakradar/domain/${encodeURIComponent(domain)}/urls`,
      query: { page: opts.page, page_size: opts.page_size, search: opts.search, refresh: opts.refresh },
    });
  }

  /**
   * Composite domain audit in one call: summary + first page of each bucket +
   * first page of subdomains and urls. Sub-calls fail independently (`_errors`).
   */
  report(domain: string, refresh?: boolean): Promise<DomainReport> {
    return this.http.request<DomainReport>({
      method: 'GET',
      path: '/leakradar/domain/report',
      query: { domain, refresh },
    });
  }

  /** Alias for {@link list} constrained to the three single buckets. */
  bucket(domain: string, bucket: DomainBucket, opts?: DomainListOptions): Promise<Paginated<LeakDetails>> {
    return this.list(domain, bucket, opts);
  }
}
