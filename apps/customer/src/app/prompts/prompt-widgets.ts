import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  billingRewardRequestSchema,
  type BillingRewardCampaign,
  type BillingRewardOffer,
} from '@all-in-one/shared/schemas';
import {
  AioAsyncButton,
  AioButton,
  AioDateInput,
  AioFormField,
  AioInAppNotifications,
  AioInput,
  AioLocale,
  AioNotifications,
  AioTranslate,
} from '@all-in-one/ui';
import {
  API_BASE_URL,
  apiErrorMessage,
  AuthStore,
  PushSettings,
} from '@all-in-one/web/shared';

/** Widgets shown inside an in-app prompt sheet (in-app-prompts.ts on the api). Loaded only when a prompt arrives. */

/** Today and tomorrow as Tehran calendar days (planner and health dates are Tehran days). */
export function tehranDay(now = new Date(), offsetDays = 0): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tehran',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now.getTime() + offsetDays * 86_400_000));
}

@Component({
  selector: 'customer-push-prompt',
  imports: [AioButton, AioTranslate],
  template: `
    <div class="flex flex-col items-start gap-3">
      @if (push.enabled()) {
        <p class="text-sm" role="status">
          {{ 'یادآوری‌ها روی این دستگاه روشن است.' | aioTranslate }}
        </p>
        <button aioBtn type="button" class="min-h-11" (click)="done()">
          {{ 'تمام' | aioTranslate }}
        </button>
      } @else {
        <button
          aioBtn
          type="button"
          class="min-h-11"
          [disabled]="push.busy()"
          (click)="enable()"
        >
          {{ 'روشن‌کردن یادآوری‌ها' | aioTranslate }}
        </button>
        @if (tried()) {
          <p class="text-muted-foreground text-sm" role="status">
            {{ push.message() | aioTranslate }}
          </p>
        }
      }
    </div>
  `,
})
export class PushPrompt {
  /** A Tehran time (`20:00`): also turn on the daily card review reminder (the English first step). */
  readonly review = input('');
  protected readonly push = inject(PushSettings);
  private readonly sheet = inject(AioInAppNotifications);
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_BASE_URL);
  protected async enable(): Promise<void> {
    await this.push.enable();
    const time = this.review();
    if (this.push.enabled() && time)
      await firstValueFrom(
        this.http.put(`${this.api}/push/review-settings`, {
          enabled: true,
          time,
        }),
      ).catch(() => undefined);
  }
  /** The status line is shown only after a try, so a failure says why and the button stays for a retry. */
  protected readonly tried = computed(
    () => this.push.busy() || this.push.message() !== this.initial,
  );
  private readonly initial = this.push.message();
  protected done() {
    this.sheet.finish();
  }
}

@Component({
  selector: 'customer-email-prompt',
  imports: [AioAsyncButton, AioFormField, AioInput, AioTranslate],
  template: `
    @if (sentTo()) {
      <p
        class="bg-accent text-accent-foreground rounded-2xl p-3 text-sm"
        role="status"
      >
        {{
          'لینک تأیید به {0} فرستاده شد. ایمیلت را باز کن و روی لینک بزن.'
            | aioTranslate: [sentTo()]
        }}
      </p>
    } @else {
      <form
        class="flex flex-col gap-4"
        (submit)="$event.preventDefault(); send()"
      >
        <aio-form-field
          [label]="'ایمیل' | aioTranslate"
          controlId="prompt-email"
        >
          <input
            aioInput
            id="prompt-email"
            type="email"
            dir="ltr"
            lang="en"
            autocomplete="email"
            required
            [value]="email()"
            (input)="email.set($any($event.target).value)"
          />
        </aio-form-field>
        <button
          aioAsyncButton
          type="submit"
          class="min-h-11 self-start"
          label="فرستادن لینک تأیید"
          [busy]="busy()"
        ></button>
      </form>
    }
  `,
})
export class EmailPrompt {
  private readonly auth = inject(AuthStore);
  private readonly notifications = inject(AioNotifications);
  protected readonly email = signal('');
  protected readonly busy = signal(false);
  protected readonly sentTo = signal('');
  protected async send() {
    const email = this.email().trim();
    if (!email || this.busy()) return;
    this.busy.set(true);
    try {
      await this.auth.addEmail(email);
      this.sentTo.set(email);
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}

@Component({
  selector: 'customer-repeat-task-prompt',
  imports: [AioAsyncButton, AioFormField, AioInput, AioTranslate],
  template: `
    <form
      class="flex flex-col gap-4"
      (submit)="$event.preventDefault(); save()"
    >
      <p class="font-medium break-words" dir="auto">{{ title() }}</p>
      <aio-form-field
        [label]="'ساعت هر روز' | aioTranslate"
        controlId="prompt-repeat-time"
      >
        <input
          aioInput
          id="prompt-repeat-time"
          type="time"
          dir="ltr"
          lang="en"
          required
          [value]="time()"
          (input)="time.set($any($event.target).value)"
        />
      </aio-form-field>
      <button
        aioAsyncButton
        type="submit"
        class="min-h-11 self-start"
        label="هر روز تکرار شود"
        [busy]="busy()"
      ></button>
    </form>
  `,
})
export class RepeatTaskPrompt {
  readonly title = input('');
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_BASE_URL);
  private readonly notifications = inject(AioNotifications);
  private readonly sheet = inject(AioInAppNotifications);
  protected readonly time = signal('09:00');
  protected readonly busy = signal(false);
  protected async save() {
    const title = this.title().trim();
    if (!title || !/^([01]\d|2[0-3]):[0-5]\d$/.test(this.time()) || this.busy())
      return;
    this.busy.set(true);
    try {
      // Starts tomorrow: today's copy of the task is usually already in the list.
      await firstValueFrom(
        this.http.post(`${this.api}/planner/tasks`, {
          title,
          date: tehranDay(new Date(), 1),
          time: this.time(),
          repeatRule: 'RRULE:FREQ=DAILY',
          reminders: ['TRIGGER:PT0M'],
        }),
      );
      this.notifications.success('از فردا هر روز تکرار می‌شود', title);
      this.sheet.finish();
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}

@Component({
  selector: 'customer-weight-goal-prompt',
  imports: [AioAsyncButton, AioDateInput, AioFormField, AioInput, AioTranslate],
  template: `
    <form
      class="flex flex-col gap-4"
      (submit)="$event.preventDefault(); save()"
    >
      <div class="grid grid-cols-2 gap-3">
        <aio-form-field
          [label]="'وزن فعلی (کیلو)' | aioTranslate"
          controlId="prompt-weight-now"
        >
          <input
            aioInput
            id="prompt-weight-now"
            type="number"
            inputmode="decimal"
            min="30"
            max="300"
            step="0.1"
            dir="ltr"
            lang="en"
            required
            [value]="current()"
            (input)="current.set($any($event.target).value)"
          />
        </aio-form-field>
        <aio-form-field
          [label]="'وزن هدف (کیلو)' | aioTranslate"
          controlId="prompt-weight-target"
        >
          <input
            aioInput
            id="prompt-weight-target"
            type="number"
            inputmode="decimal"
            min="30"
            max="300"
            step="0.1"
            dir="ltr"
            lang="en"
            required
            [value]="target()"
            (input)="target.set($any($event.target).value)"
          />
        </aio-form-field>
      </div>
      <aio-form-field
        [label]="'تا تاریخ' | aioTranslate"
        controlId="prompt-weight-date"
      >
        <aio-date-input inputId="prompt-weight-date" [(value)]="date" />
      </aio-form-field>
      <button
        aioAsyncButton
        type="submit"
        class="min-h-11 self-start"
        label="ذخیرهٔ هدف"
        [busy]="busy()"
      ></button>
    </form>
  `,
})
export class WeightGoalPrompt {
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_BASE_URL);
  private readonly notifications = inject(AioNotifications);
  private readonly sheet = inject(AioInAppNotifications);
  protected readonly current = signal('');
  protected readonly target = signal('');
  protected readonly date = signal(tehranDay(new Date(), 60));
  protected readonly busy = signal(false);
  protected async save() {
    const current = Number(this.current());
    const target = Number(this.target());
    const valid = (kg: number) => Number.isFinite(kg) && kg >= 30 && kg <= 300;
    if (!valid(current) || !valid(target)) {
      this.notifications.error('وزن را بین ۳۰ تا ۳۰۰ کیلو بنویس.');
      return;
    }
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(this.date()) ||
      this.date() <= tehranDay()
    ) {
      this.notifications.error('تاریخ هدف باید بعد از امروز باشد.');
      return;
    }
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.http.post(`${this.api}/health/weight`, {
          date: tehranDay(),
          weightKg: current,
        }),
      );
      await firstValueFrom(
        this.http.put(`${this.api}/health/weight/goal`, {
          targetWeightKg: target,
          targetDate: this.date(),
        }),
      );
      this.notifications.success('هدف وزن ذخیره شد');
      this.sheet.finish();
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }
}

interface ReviewCard {
  id: string;
  deckId: string;
  front: string;
  back: string;
}

/** Five due cards right in the sheet: show the answer, then «again» or «knew it». */
@Component({
  selector: 'customer-review-cards-prompt',
  imports: [AioButton, AioTranslate],
  template: `
    @if (loading()) {
      <p class="text-muted-foreground text-sm">
        {{ 'در حال دریافت…' | aioTranslate }}
      </p>
    } @else if (card(); as c) {
      <div class="flex flex-col gap-4">
        <p class="text-muted-foreground text-xs">
          {{
            '{0} از {1}'
              | aioTranslate
                : [locale.number(index() + 1), locale.number(cards().length)]
          }}
        </p>
        <p class="text-xl font-semibold break-words" dir="auto" lang="en">
          {{ c.front }}
        </p>
        @if (shown()) {
          <p class="break-words whitespace-pre-line" dir="auto">
            {{ c.back }}
          </p>
          <div class="grid grid-cols-2 gap-3">
            <button
              aioBtn
              type="button"
              variant="outline"
              class="min-h-11"
              [disabled]="busy()"
              (click)="grade('again')"
            >
              {{ 'دوباره' | aioTranslate }}
            </button>
            <button
              aioBtn
              type="button"
              class="min-h-11"
              [disabled]="busy()"
              (click)="grade('good')"
            >
              {{ 'بلد بودم' | aioTranslate }}
            </button>
          </div>
        } @else {
          <button
            aioBtn
            type="button"
            class="min-h-11"
            (click)="shown.set(true)"
          >
            {{ 'نشان دادن جواب' | aioTranslate }}
          </button>
        }
      </div>
    } @else {
      <div class="flex flex-col items-start gap-3">
        <p role="status">
          {{
            (reviewed() ? '{0} کارت مرور شد.' : 'الان کارتی برای مرور نیست.')
              | aioTranslate: [locale.number(reviewed())]
          }}
        </p>
        <button aioBtn type="button" class="min-h-11" (click)="finish()">
          {{ 'تمام' | aioTranslate }}
        </button>
      </div>
    }
  `,
})
export class ReviewCardsPrompt {
  protected readonly locale = inject(AioLocale);
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_BASE_URL);
  private readonly notifications = inject(AioNotifications);
  private readonly sheet = inject(AioInAppNotifications);
  protected readonly cards = signal<ReviewCard[]>([]);
  protected readonly index = signal(0);
  protected readonly shown = signal(false);
  protected readonly busy = signal(false);
  protected readonly loading = signal(true);
  protected readonly reviewed = signal(0);
  protected readonly card = computed(() => this.cards()[this.index()] ?? null);

  constructor() {
    void this.load();
  }

  private async load() {
    try {
      const decks = await firstValueFrom(
        this.http.get<{ id: string; due: number }[]>(
          `${this.api}/english/decks`,
        ),
      );
      const cards: ReviewCard[] = [];
      for (const deck of decks.filter((d) => d.due > 0)) {
        if (cards.length >= 5) break;
        const due = await firstValueFrom(
          this.http.get<ReviewCard[]>(
            `${this.api}/english/cards?deckId=${deck.id}&due=true`,
          ),
        );
        cards.push(...due.slice(0, 5 - cards.length));
      }
      this.cards.set(cards);
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected async grade(rating: 'again' | 'good') {
    const card = this.card();
    if (!card || this.busy()) return;
    this.busy.set(true);
    try {
      await firstValueFrom(
        this.http.post(`${this.api}/english/cards/${card.id}/review`, {
          rating,
        }),
      );
      this.reviewed.update((n) => n + 1);
      this.shown.set(false);
      this.index.update((i) => i + 1);
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected finish() {
    this.sheet.finish();
  }
}

/** The Telegram and Instagram weeks (directive 108): open the official page, then send the username for a check. */
@Component({
  selector: 'customer-rewards-prompt',
  imports: [AioAsyncButton, AioButton, AioFormField, AioInput, AioTranslate],
  template: `
    <div class="flex flex-col gap-5">
      @for (offer of social(); track offer.campaign) {
        <section class="flex flex-col gap-3">
          <h3 class="font-semibold">
            {{ labels[offer.campaign] | aioTranslate }}
          </h3>
          @if (offer.status === 'pending') {
            <p role="status">
              {{ 'درخواست در انتظار بررسی است.' | aioTranslate }}
            </p>
          } @else if (offer.status === 'earned') {
            <p>{{ 'هدیه ثبت شد.' | aioTranslate }}</p>
          } @else {
            <a
              aioBtn
              variant="outline"
              class="min-h-11 self-start"
              [href]="offer.url"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ 'باز کردن صفحهٔ رسمی' | aioTranslate }}
            </a>
            <form
              class="flex flex-col gap-3"
              (submit)="
                $event.preventDefault(); request(offer.campaign, handle.value)
              "
            >
              <aio-form-field
                label="نام کاربری شبکهٔ اجتماعی"
                [controlId]="'prompt-offer-' + offer.campaign"
              >
                <input
                  aioInput
                  #handle
                  [id]="'prompt-offer-' + offer.campaign"
                  type="text"
                  dir="ltr"
                  autocomplete="off"
                  maxlength="31"
                  required
                />
              </aio-form-field>
              <button
                aioAsyncButton
                type="submit"
                label="عضو شدم، هدیه را بده"
                class="min-h-11 self-start"
                [busy]="requesting() === offer.campaign"
                [disabled]="requesting() !== null"
              ></button>
            </form>
          }
        </section>
      }
    </div>
  `,
})
export class RewardsPrompt {
  private readonly http = inject(HttpClient);
  private readonly api = inject(API_BASE_URL);
  private readonly notifications = inject(AioNotifications);
  protected readonly offers = signal<BillingRewardOffer[]>([]);
  protected readonly social = computed(() =>
    this.offers().filter(
      (o) =>
        o.campaign === 'TELEGRAM_JOIN' || o.campaign === 'INSTAGRAM_FOLLOW',
    ),
  );
  protected readonly requesting = signal<BillingRewardCampaign | null>(null);
  protected readonly labels = {
    TELEGRAM_JOIN: 'عضویت در تلگرام',
    INSTAGRAM_FOLLOW: 'دنبال‌کردن در اینستاگرام',
    SECOND_CONTACT: 'تأیید راه دوم ارتباط',
    REFERRAL_INVITER: 'دعوت دوست',
    REFERRAL_INVITED: 'ثبت‌نام با دعوت',
  } as const;

  constructor() {
    firstValueFrom(
      this.http.get<BillingRewardOffer[]>(`${this.api}/billing/reward-offers`),
    ).then(
      (offers) => this.offers.set(offers),
      (error) => this.notifications.error(apiErrorMessage(error)),
    );
  }

  protected async request(campaign: BillingRewardCampaign, handle: string) {
    if (this.requesting()) return;
    const input = billingRewardRequestSchema.safeParse({ campaign, handle });
    if (!input.success) {
      this.notifications.error('نام کاربری معتبر وارد کن.');
      return;
    }
    this.requesting.set(campaign);
    try {
      this.offers.set(
        await firstValueFrom(
          this.http.post<BillingRewardOffer[]>(
            `${this.api}/billing/reward-requests`,
            input.data,
          ),
        ),
      );
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.requesting.set(null);
    }
  }
}
