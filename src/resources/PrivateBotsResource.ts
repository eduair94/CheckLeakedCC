import { BaseResource } from './BaseResource';
import { unwrapEnvelope } from '../envelope';
import type { PrivateBot, PrivateBotPlatform, PrivateBotSetInput, PrivateBotsList } from '../types';

/**
 * `client.privateBots` — run the CheckLeaked command set under your OWN
 * Discord / Telegram bot (Pro / Plus). The token is validated, stored encrypted
 * (AES-256-GCM) and never returned; the bot answers only your linked account.
 */
export class PrivateBotsResource extends BaseResource {
  /** Your private bots per platform, plus `plan_ok`, `configured` and `max_per_platform`. */
  async list(): Promise<PrivateBotsList> {
    return unwrapEnvelope<PrivateBotsList>(await this.http.request({ method: 'GET', path: '/private_bots' }));
  }

  /**
   * Create / replace a bot (pass `token`) or pause / resume it (pass only
   * `enabled`). Returns the bot with its state, username and invite URL.
   */
  async set(input: PrivateBotSetInput): Promise<{ bot: PrivateBot; [k: string]: any }> {
    return unwrapEnvelope(await this.http.request({
      method: 'POST',
      path: '/private_bots',
      body: { platform: input.platform, token: input.token, enabled: input.enabled },
      retry: false,
    }));
  }

  /** Pause (`false`) or resume (`true`) a bot without touching its token. */
  setEnabled(platform: PrivateBotPlatform, enabled: boolean): Promise<{ bot: PrivateBot; [k: string]: any }> {
    return this.set({ platform, enabled });
  }

  /** Stop the bot on one platform and discard its token. */
  async delete(platform: PrivateBotPlatform): Promise<{ removed: boolean; [k: string]: any }> {
    return unwrapEnvelope(await this.http.request({ method: 'POST', path: '/private_bots/delete', body: { platform } }));
  }

  /** Alias for {@link delete}. */
  remove(platform: PrivateBotPlatform): Promise<{ removed: boolean; [k: string]: any }> {
    return this.delete(platform);
  }
}
