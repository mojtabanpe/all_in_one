import type { Credential, GoogleOAuthAccessToken } from 'firebase-admin/app';

/** Renew in the background once less than this is left (Google tokens last an hour). */
export const FCM_RENEW_BEFORE_MS = 30 * 60_000;
/** How often the background renewal looks at the token. */
export const FCM_RENEW_EVERY_MS = 5 * 60_000;
/** A token request that hangs (filtered network) is abandoned after this. */
export const FCM_TOKEN_TIMEOUT_MS = 20_000;
/** Below this, a send waits for a new token instead of using the current one. */
const MIN_LEFT_MS = 60_000;

/**
 * The api server reaches Google's token endpoint only intermittently (2026-11-17). `cert()` asks Google
 * exactly when the hour-long token runs out, so a renewal that lands in an outage drops the pushes of that
 * moment. This wrapper renews early and in the background, retries every few minutes, and keeps sending
 * with the current token until it really expires.
 */
export class EarlyRenewCredential implements Credential {
  private token?: { value: string; expiresAt: number };
  private pending?: Promise<void>;
  private timer?: ReturnType<typeof setInterval>;

  constructor(
    private readonly source: Credential,
    private readonly onRenewFailed: () => void = () => undefined,
    private readonly now: () => number = Date.now,
  ) {}

  async getAccessToken(): Promise<GoogleOAuthAccessToken> {
    if (this.remaining() < MIN_LEFT_MS) {
      try {
        await this.renew();
      } catch (error) {
        if (this.remaining() <= 0) throw error;
      }
    }
    const token = this.token;
    if (!token) throw new Error('No native push token');
    return {
      access_token: token.value,
      expires_in: Math.max(1, Math.floor(this.remaining() / 1000)),
    };
  }

  /** Warm the token now and keep it renewed ahead of expiry. */
  start(): void {
    if (this.timer) return;
    const check = () => {
      if (this.remaining() < FCM_RENEW_BEFORE_MS)
        void this.renew().catch(() => this.onRenewFailed());
    };
    this.timer = setInterval(check, FCM_RENEW_EVERY_MS);
    this.timer.unref?.();
    check();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private remaining(): number {
    return this.token ? this.token.expiresAt - this.now() : 0;
  }

  /** One request at a time; a hung request gives up so the next check can try again. */
  private renew(): Promise<void> {
    this.pending ??= (async () => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const asked = this.now();
        const token = await Promise.race([
          this.source.getAccessToken(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error('Native push token request timed out')),
              FCM_TOKEN_TIMEOUT_MS,
            );
          }),
        ]);
        this.token = {
          value: token.access_token,
          expiresAt: asked + token.expires_in * 1000,
        };
      } finally {
        if (timer) clearTimeout(timer);
        this.pending = undefined;
      }
    })();
    return this.pending;
  }
}
