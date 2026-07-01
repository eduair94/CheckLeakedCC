import { BaseResource } from '../../resources/BaseResource';
import type { TaskStatus } from '../../types';

/**
 * `leakradar.tasks` — poll the background tasks produced by the async unlock
 * endpoints (`email.unlockAsync`, `advanced.unlockAsync`, `raw.unlockAsync`).
 */
export class TasksResource extends BaseResource {
  /** One-shot status poll. */
  status(taskId: string): Promise<TaskStatus> {
    return this.http.request<TaskStatus>({ method: 'GET', path: `/leakradar/tasks/${encodeURIComponent(taskId)}` });
  }

  /**
   * Server-side long-poll: blocks up to ~25s server-side and returns the task
   * status once it completes (or when the cap elapses).
   */
  wait(taskId: string): Promise<TaskStatus> {
    return this.http.request<TaskStatus>({ method: 'GET', path: `/leakradar/tasks/${encodeURIComponent(taskId)}/wait` });
  }

  /**
   * Client-side poll loop: repeatedly calls {@link wait} until the task reports
   * `completed` (or `running === false`), or the overall timeout elapses.
   */
  async pollUntilDone(taskId: string, opts: { intervalMs?: number; timeoutMs?: number } = {}): Promise<TaskStatus> {
    const interval = Math.max(250, opts.intervalMs || 1000);
    const deadline = Date.now() + (opts.timeoutMs || 5 * 60_000);
    let latest: TaskStatus | null = null;
    while (Date.now() < deadline) {
      latest = await this.wait(taskId);
      if (latest && (latest.completed || latest.running === false)) return latest;
      await new Promise((r) => setTimeout(r, interval));
    }
    if (latest) return latest;
    throw new Error(`Timed out waiting for task ${taskId}`);
  }
}
