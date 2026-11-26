import { BaseResource } from './BaseResource';
import type { ChangelogResponse, FaqEntry, NewsListResponse, NewsPost, PlanInfo, SiteStats } from '../types';

/**
 * `client.news` — the daily CheckLeaked cybersecurity briefing (open route).
 */
export class NewsResource extends BaseResource {
  /** Today's briefing. `lang` returns a translated post when one exists. */
  latest(opts: { lang?: string } = {}): Promise<NewsPost> {
    return this.http.request<NewsPost>({ method: 'GET', path: '/news/latest', query: { lang: opts.lang }, base: 'site', auth: 'none' });
  }

  /** Recent briefings, newest first. */
  list(opts: { limit?: number; page?: number; lang?: string } = {}): Promise<NewsListResponse> {
    return this.http.request<NewsListResponse>({
      method: 'GET',
      path: '/news',
      query: { limit: opts.limit, page: opts.page, lang: opts.lang },
      base: 'site',
      auth: 'none',
    });
  }
}

/**
 * `client.site` — public CheckLeaked.cc information: plans and prices, FAQ,
 * changelog and headline numbers. No api key needed.
 */
export class SiteResource extends BaseResource {
  /** Plans and prices (USD): lookups per day, duration, tracking slots, search types. */
  plans(): Promise<PlanInfo[]> {
    return this.http.request<PlanInfo[]>({ method: 'GET', path: '/plans', base: 'site', auth: 'none' });
  }

  /** The FAQ. Pass `query` to keep only entries mentioning every keyword (filtered locally). */
  async faq(query?: string): Promise<FaqEntry[]> {
    const res = await this.http.request<{ items?: FaqEntry[] } | FaqEntry[]>({ method: 'GET', path: '/support/faq', base: 'site', auth: 'none' });
    const items = Array.isArray(res) ? res : (res && res.items) || [];
    const words = (query || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return items;
    return items.filter((e) => {
      const hay = `${e.q} ${e.a}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }

  /** Recent changelog entries (what is new or fixed). */
  changelog(opts: { limit?: number; page?: number } = {}): Promise<ChangelogResponse> {
    return this.http.request<ChangelogResponse>({
      method: 'GET',
      path: '/changelog',
      query: { limit: opts.limit, page: opts.page },
      base: 'site',
      auth: 'none',
    });
  }

  /** Headline numbers: searches served and indexed breach records. */
  stats(): Promise<SiteStats> {
    return this.http.request<SiteStats>({ method: 'GET', path: '/landing_info', base: 'site', auth: 'none' });
  }
}
