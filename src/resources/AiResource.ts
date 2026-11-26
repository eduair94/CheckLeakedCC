import { BaseResource } from './BaseResource';
import type {
  AiCallOptions,
  DeepReportInput,
  DeepReportPdfInput,
  DeepReportResponse,
  InvestigateOptions,
  InvestigationResponse,
} from '../types';

/** An investigation can run ~3 minutes server-side; wait a little past that. */
const INVESTIGATE_TIMEOUT_MS = 200_000;
/** The structured dossier usually answers in well under a minute. */
const DEEP_REPORT_TIMEOUT_MS = 150_000;

/**
 * `client.ai` — CheckLeaked's Deep Search AI (Pro plan).
 *
 * - {@link investigate}: the **WormGPT AI investigation**. The agent searches the
 *   web and runs the leak / OSINT tools itself (authenticated as you) and returns
 *   a markdown dossier with sources. One call = one unit of your WormGPT daily
 *   quota (separate from search credits).
 * - {@link deepReport}: a structured risk dossier reasoned over findings you
 *   already hold (no new searches are run).
 * - {@link deepReportPdf}: typeset a dossier as a PDF (free).
 *
 * Failures throw with a stable `error.code` (`worm_pro_required`,
 * `worm_throttled`, `worm_busy`, `worm_quota`, `report_no_findings`, …). These
 * calls are never retried automatically: a retry could spend a second unit.
 */
export class AiResource extends BaseResource {
  /**
   * WormGPT AI investigation of one subject → `{ report: { markdown, sources }, meta }`.
   * Pass `findings` you already paid for to ground the dossier (optional).
   */
  investigate(term: string, opts: InvestigateOptions = {}): Promise<InvestigationResponse> {
    return this.http.request<InvestigationResponse>({
      method: 'POST',
      path: '/worm_report',
      body: { ...(opts.findings ?? {}), term, type: opts.type },
      timeout: opts.timeout ?? INVESTIGATE_TIMEOUT_MS,
      signal: opts.signal,
      retry: false,
    });
  }

  /** Structured risk dossier over findings you already hold (`term` + engine rows). */
  deepReport(input: DeepReportInput, opts: AiCallOptions = {}): Promise<DeepReportResponse> {
    return this.http.request<DeepReportResponse>({
      method: 'POST',
      path: '/deep_report',
      body: input,
      timeout: opts.timeout ?? DEEP_REPORT_TIMEOUT_MS,
      signal: opts.signal,
      retry: false,
    });
  }

  /** Render a dossier (and optionally an investigation) as a PDF → binary. */
  deepReportPdf(input: DeepReportPdfInput, opts: AiCallOptions = {}): Promise<ArrayBuffer> {
    return this.http.request<ArrayBuffer>({
      method: 'POST',
      path: '/deep_report/pdf',
      body: { report: input.report, meta: input.meta, investigation: input.investigation },
      responseType: 'arraybuffer',
      timeout: opts.timeout,
      signal: opts.signal,
    });
  }
}
