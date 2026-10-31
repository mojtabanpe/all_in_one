import type { ConfigService } from '@nestjs/config';
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

/** Server credentials never enter the WebView or the native application. */
export class NativePush {
  private app?: App;
  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return !!this.config.get<string>('FCM_SERVICE_ACCOUNT_JSON');
  }

  async send(token: string, title: string, url: string, tag: string) {
    if (!this.enabled) throw new Error('Native push is not configured');
    if (!this.app) {
      const account = JSON.parse(
        this.config.getOrThrow<string>('FCM_SERVICE_ACCOUNT_JSON'),
      );
      this.app =
        getApps().find((app) => app.name === 'poshtetgarm-push') ??
        initializeApp({ credential: cert(account) }, 'poshtetgarm-push');
    }
    await getMessaging(this.app).send({
      token,
      notification: { title, body: 'پشتت گرم' },
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
  }
}
