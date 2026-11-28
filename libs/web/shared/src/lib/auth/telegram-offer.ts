import { DOCUMENT } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  TelegramLinkEntry,
  TelegramLinkRequest,
  TelegramStatus,
} from '@all-in-one/shared/schemas';
import {
  AioButton,
  AioLocale,
  AioNotifications,
  AioTranslate,
} from '@all-in-one/ui';
import { API_BASE_URL } from '../api/api-base-url';
import { GrowthAnalytics } from '../growth-analytics';
import { apiErrorMessage } from './auth.guards';

const EVENTS = {
  review_end: {
    viewed: 'tg_offer_viewed_review_end',
    clicked: 'tg_offer_clicked_review_end',
  },
  notify_failed: {
    viewed: 'tg_offer_viewed_notify',
    clicked: 'tg_offer_clicked_notify',
  },
} as const;

/**
 * «Reminder in Telegram», offered next to device notifications. As in `TelegramSettings`, the one-time link is made
 * first and opened by the user's own tap. Nothing is shown while `available` is false (the bot is not configured).
 */
@Component({
  selector: 'web-telegram-offer',
  imports: [AioButton, AioTranslate],
  host: { class: 'block w-full empty:hidden' },
  template: `
    @if (available()) {
      @if (linked()) {
        <p class="text-muted-foreground text-sm" role="status">
          {{ 'تلگرام وصل است.' | aioTranslate }}
        </p>
      } @else {
        <div class="flex w-full flex-col gap-2">
          @if (url(); as href) {
            <a
              aioBtn
              variant="outline"
              class="min-h-11 h-auto w-full whitespace-normal py-2"
              rel="noopener"
              [attr.target]="target"
              [href]="href"
              >{{ 'باز کردن تلگرام و زدن Start' | aioTranslate }}</a
            >
            <p class="text-muted-foreground text-xs leading-5" role="status">
              {{ 'لینک ۱۰ دقیقه اعتبار دارد.' | aioTranslate }}
            </p>
          } @else {
            <button
              aioBtn
              type="button"
              variant="outline"
              class="min-h-11 h-auto w-full whitespace-normal py-2"
              [disabled]="busy()"
              (click)="link()"
            >
              {{ 'یادآور در تلگرام' | aioTranslate }}
            </button>
            <p class="text-muted-foreground text-xs leading-5">
              {{
                'وقتی کارت برای مرور داری، در تلگرام خبرت می‌کنیم.'
                  | aioTranslate
              }}
            </p>
          }
        </div>
      }
    }
  `,
})
export class TelegramOffer {
  readonly entry = input.required<TelegramLinkEntry>();
  private readonly api = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);
  private readonly notifications = inject(AioNotifications);
  private readonly locale = inject(AioLocale);
  private readonly growth = inject(GrowthAnalytics);
  private readonly document = inject(DOCUMENT);
  private readonly state = httpResource<TelegramStatus>(
    () => `${this.api}/telegram/status`,
  );
  protected readonly available = computed(
    () => this.state.hasValue() && this.state.value().available,
  );
  protected readonly linked = computed(
    () => this.state.hasValue() && this.state.value().linked,
  );
  protected readonly busy = signal(false);
  protected readonly url = signal<string | null>(null);
  /** Inside the Android shells a new window may never open; a plain navigation is handed to Telegram. */
  protected readonly target = this.inShell() ? null : '_blank';

  constructor() {
    // Counted only when the option is really on screen, once per entry point.
    effect(() => {
      if (!this.available() || this.linked()) return;
      const { viewed } = EVENTS[this.entry()];
      untracked(() => void this.growth.track(viewed));
    });
    // Coming back from Telegram after «Start»: show the new state.
    const onVisible = () => {
      if (this.document.visibilityState === 'visible' && this.url())
        this.state.reload();
    };
    this.document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() =>
      this.document.removeEventListener('visibilitychange', onVisible),
    );
  }

  private inShell(): boolean {
    const win = this.document.defaultView;
    return (
      !!win &&
      (/PoshtetgarmStore\/|PoshtetgarmApp\//.test(win.navigator.userAgent) ||
        'PoshtetgarmNativePush' in win)
    );
  }

  protected async link() {
    if (this.busy()) return;
    this.busy.set(true);
    const entry = this.entry();
    void this.growth.track(EVENTS[entry].clicked);
    try {
      const body: TelegramLinkRequest = {
        language: this.locale.english() ? 'en' : 'fa',
        entry,
      };
      const { url } = await firstValueFrom(
        this.http.post<{ url: string }>(`${this.api}/telegram/link`, body),
      );
      this.url.set(url);
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}
