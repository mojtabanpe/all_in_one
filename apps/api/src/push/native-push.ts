import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { EarlyRenewCredential } from './fcm-credential';

/** Server credentials never enter the WebView or the native application. */
export class NativePush {
  private app?: App;
  private credential?: EarlyRenewCredential;
  private readonly logger = new Logger(NativePush.name);
  private failing = false;
  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return !!this.config.get<string>('FCM_SERVICE_ACCOUNT_JSON');
  }

  /** Keep a Google access token ready ahead of the sends (the server's route to Google drops at times). */
  start(): void {
    if (!this.enabled) return;
    try {
      this.ready().start();
    } catch {
      this.logger.error('Native push credentials could not be read');
    }
  }

  stop(): void {
    this.credential?.stop();
  }

  private ready(): EarlyRenewCredential {
    if (!this.credential) {
      const account = JSON.parse(
        this.config.getOrThrow<string>('FCM_SERVICE_ACCOUNT_JSON'),
      );
      this.credential = new EarlyRenewCredential(cert(account), () => {
        // Once per outage, never with provider text.
        if (!this.failing)
          this.logger.warn(
            'Native push token renewal failed; keeping the current token',
          );
        this.failing = true;
      });
    }
    return this.credential;
  }

  async send(token: string, title: string, url: string, tag: string) {
    if (!this.enabled) throw new Error('Native push is not configured');
    if (!this.app) {
      const credential = this.ready();
      this.app =
        getApps().find((app) => app.name === 'poshtetgarm-push') ??
        initializeApp({ credential }, 'poshtetgarm-push');
    }
    await getMessaging(this.app).send({
      token,
      notification: { title, body: 'Poshtetgarm' },
      data: { url, tag },
      android: {
        priority: 'high',
        ttl: 300000,
        notification: {
          channelId: 'reminders',
          icon: 'ic_stat_notification',
          tag,
        },
      },
      apns: {
        headers: {
          'apns-expiration': String(Math.floor(Date.now() / 1000) + 300),
        },
        payload: { aps: { sound: 'default' } },
      },
    });
    // A delivered message means the token works again; the next outage is logged once more.
    this.failing = false;
  }
}
