import { BaseResource } from '../../resources/BaseResource';
import type { MonitorQuickAddInput } from '../../types';

/**
 * `leakradar.monitor` — high-level monitoring helpers.
 */
export class MonitorResource extends BaseResource {
  /**
   * One-call setup: ensures a delivery method exists (reusing a matching owned
   * one or creating it), then creates a domain monitor bound to it.
   * When `methodType` is `email` and `methodValue` is omitted, your account
   * email is used.
   */
  quickAdd(input: MonitorQuickAddInput): Promise<{ method: any; notification: any; monitor_url: string; [k: string]: any }> {
    return this.http.request({
      method: 'POST',
      path: '/leakradar/monitor/quick-add',
      body: {
        domain: input.domain,
        methodType: input.methodType,
        methodValue: input.methodValue,
        autoUnlock: input.autoUnlock,
        maxPoints: input.maxPoints,
      },
    });
  }
}
