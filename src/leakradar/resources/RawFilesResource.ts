import { BaseResource } from '../../resources/BaseResource';
import type { RawDownloadPreviewQuery, RawDownloadQuery } from '../../types';

/**
 * `leakradar.rawFiles` — list ingested raw files and obtain pre-signed download
 * URLs. When addressing a file by `sha256_original` you must call {@link preview}
 * first to claim access before {@link download} will succeed.
 */
export class RawFilesResource extends BaseResource {
  /** Recently ingested raw files/containers available for download. */
  list(): Promise<Record<string, any>[]> {
    return this.http.request<Record<string, any>[]>({ method: 'GET', path: '/leakradar/raw/files' });
  }

  /** Generate a pre-signed download URL (by sha256 OR container_id+entry_path). */
  download(query: RawDownloadQuery): Promise<Record<string, any>> {
    return this.http.request<Record<string, any>>({
      method: 'POST',
      path: '/leakradar/raw/download',
      body: {
        sha256_original: query.sha256_original,
        entry_path: query.entry_path,
        container_id: query.container_id,
        expires_in: query.expires_in,
      },
    });
  }

  /** Preview a raw file (claims access so a later {@link download} is authorized). */
  preview(query: RawDownloadPreviewQuery): Promise<Record<string, any>> {
    return this.http.request<Record<string, any>>({
      method: 'GET',
      path: '/leakradar/raw/download-preview',
      query: { sha256_original: query.sha256_original, container_id: query.container_id, entry_path: query.entry_path },
    });
  }
}
