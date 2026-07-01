import { BaseResource } from '../../resources/BaseResource';
import type { QueuedTask, TaskStatus, UnlockedList, UnlockedListCreateInput, UnlockedListUpdateInput } from '../../types';

/**
 * `leakradar.lists` — CRUD for the tagging lists used to group unlocked leaks,
 * plus the dedicated poller for list background tasks (e.g. clear).
 */
export class ListsResource extends BaseResource {
  /** List your lists. */
  list(withCounts = true): Promise<UnlockedList[]> {
    return this.http.request<UnlockedList[]>({ method: 'GET', path: '/leakradar/lists', query: { with_counts: withCounts } });
  }

  /** Create a new list. */
  create(input: UnlockedListCreateInput): Promise<UnlockedList> {
    return this.http.request<UnlockedList>({ method: 'POST', path: '/leakradar/lists', body: input });
  }

  /** Get a single list by id. */
  get(listId: number): Promise<UnlockedList> {
    return this.http.request<UnlockedList>({ method: 'GET', path: `/leakradar/lists/${listId}` });
  }

  /** Update a list's name/color. */
  update(listId: number, input: UnlockedListUpdateInput): Promise<UnlockedList> {
    return this.http.request<UnlockedList>({ method: 'POST', path: `/leakradar/lists/${listId}/update`, body: input });
  }

  /** Delete a list (you cannot delete your auto-provisioned personal list). */
  delete(listId: number): Promise<Record<string, any>> {
    return this.http.request<Record<string, any>>({ method: 'POST', path: `/leakradar/lists/${listId}/delete` });
  }

  /** Clear all items from a list (async — poll the returned `task_id` via {@link taskStatus}). */
  clear(listId: number): Promise<QueuedTask> {
    return this.http.request<QueuedTask>({ method: 'POST', path: `/leakradar/lists/${listId}/clear` });
  }

  /** Poll the status of a list background task (e.g. clear). */
  taskStatus(taskId: string): Promise<TaskStatus> {
    return this.http.request<TaskStatus>({ method: 'GET', path: `/leakradar/lists/tasks/${encodeURIComponent(taskId)}` });
  }
}
