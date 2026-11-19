import { DOCUMENT } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { TelegramStatus } from '@all-in-one/shared/schemas';
import {
  AioButton,
  AioCardDirectives,
  AioCardHeading,
  AioLocale,
  AioNotifications,
  AioTranslate,
} from '@all-in-one/ui';
import { API_BASE_URL } from '../api/api-base-url';
import { apiErrorMessage } from './auth.guards';

/**
 * Link the account to the Telegram bot (directive 168). The link is made first and then opened by the user's own
 * tap, so no browser blocks it; the status refreshes when the user comes back from Telegram. Hidden while the bot
 * is not configured on the server.
 */
@Component({
  selector: 'web-telegram-settings',
  imports: [AioButton, AioCardDirectives, AioCardHeading, AioTranslate],
  template: `
    @if (state.hasValue() && state.value().available) {
      <section aioCard id="telegram">
        <div
          aioCardHeading
          [title]="'تلگرام' | aioTranslate"
          [level]="2"
          [description]="
            'هر صبح کارهای امروز را در تلگرام بگیر و با فرستادن یک پیام کار یا وعده ثبت کن.'
              | aioTranslate
          "
        ></div>
        <div aioCardContent class="flex flex-col items-start gap-3">
          @if (state.value().linked) {
            <p class="text-sm">{{ 'به تلگرام وصل است.' | aioTranslate }}</p>
            <button
              aioBtn
              type="button"
              variant="outline"
              class="min-h-11"
              [disabled]="busy()"
              (click)="unlink()"
            >
              {{ 'قطع اتصال' | aioTranslate }}
            </button>
          } @else if (url(); as href) {
            <a
              aioBtn
              class="min-h-11"
              target="_blank"
              rel="noopener"
              [href]="href"
              >{{ 'باز کردن تلگرام و زدن Start' | aioTranslate }}</a
            >
            <p class="text-muted-foreground text-xs">
              {{ 'لینک ۱۰ دقیقه اعتبار دارد.' | aioTranslate }}
            </p>
          } @else {
            <button
              aioBtn
              type="button"
              class="min-h-11"
              [disabled]="busy()"
              (click)="link()"
            >
              {{ 'وصل به تلگرام' | aioTranslate }}
            </button>
          }
        </div>
      </section>
    }
  `,
})
export class TelegramSettings {
  private readonly api = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(AioNotifications);
  private readonly locale = inject(AioLocale);
  protected readonly state = httpResource<TelegramStatus>(
    () => `${this.api}/telegram/status`,
  );
  protected readonly busy = signal(false);
  protected readonly url = signal<string | null>(null);

  constructor() {
    // Coming back from Telegram after «Start»: show the new state (listener removed with the component, 167).
    const document = inject(DOCUMENT);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && this.url())
        this.state.reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() =>
      document.removeEventListener('visibilitychange', onVisible),
    );
  }

  protected async link() {
    this.busy.set(true);
    try {
      const { url } = await firstValueFrom(
        this.http.post<{ url: string }>(`${this.api}/telegram/link`, {
          language: this.locale.english() ? 'en' : 'fa',
        }),
      );
      this.url.set(url);
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async unlink() {
    this.busy.set(true);
    try {
      await firstValueFrom(this.http.delete(`${this.api}/telegram/link`));
      this.url.set(null);
      this.state.reload();
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
