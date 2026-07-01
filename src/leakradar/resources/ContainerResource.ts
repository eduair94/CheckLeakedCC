import { BaseResource } from '../../resources/BaseResource';
import type { ContainerFileInfoQuery, ContainerTreeQuery, ResolvePathRequest } from '../../types';

/**
 * `leakradar.container` — browse the file tree of an ingested container.
 */
export class ContainerResource extends BaseResource {
  /** List entries under a folder prefix. Use `prefix: ''` for the root. */
  tree(query: ContainerTreeQuery): Promise<Record<string, any>> {
    return this.http.request<Record<string, any>>({
      method: 'GET',
      path: '/leakradar/container/tree',
      query: { container_id: query.container_id, prefix: query.prefix, page: query.page, page_size: query.page_size },
    });
  }

  /** List immediate subfolders below a prefix. */
  subfolders(query: ContainerTreeQuery): Promise<Record<string, any>> {
    return this.http.request<Record<string, any>>({
      method: 'GET',
      path: '/leakradar/container/subfolders',
      query: { container_id: query.container_id, prefix: query.prefix, page: query.page, page_size: query.page_size },
    });
  }

  /** Resolve a path within a container, prefetching subfolders/files per segment. */
  resolvePath(request: ResolvePathRequest): Promise<Record<string, any>> {
    return this.http.request<Record<string, any>>({
      method: 'POST',
      path: '/leakradar/container/resolve-path',
      body: request,
    });
  }

  /** Get metadata for a specific file entry in a container. */
  fileInfo(query: ContainerFileInfoQuery): Promise<Record<string, any>> {
    return this.http.request<Record<string, any>>({
      method: 'GET',
      path: '/leakradar/container/file-info',
      query: { container_id: query.container_id, entry_path: query.entry_path },
    });
  }
}
