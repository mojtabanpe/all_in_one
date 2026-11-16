import { firstValueFrom } from 'rxjs';
import { DOCUMENT } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, resource, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { EnglishStats } from '@all-in-one/applets/english-learning/contracts';
import type {
  FitnessWeek,
  MealLog,
} from '@all-in-one/applets/health/contracts';
import type { PlannerTask } from '@all-in-one/applets/planner/contracts';
import {
  GROWTH_REFERRAL_SOURCE,
  resolveEnabledApplets,
  toIsoDate,
  type AppApplet,
  type OnboardingState,
} from '@all-in-one/shared/schemas';
import {
  AioTranslate,
  AioMetric,
  AioNavigationCard,
  AioButton,
  AioCardDirectives,
  AioIcon,
  AioInput,
  AioNotifications,
  provideIcons,
  AioSkeletonRows,
  AioLocale,
} from '@all-in-one/ui';
import {
  API_BASE_URL,
  AssistantStore,
  AuthStore,
  PushSettings,
} from '@all-in-one/web/shared';
import {
  lucideCalendarCheck,
  lucideChevronLeft,
  lucideCircle,
  lucideCircleCheck,
  lucideDumbbell,
  lucideLanguages,
  lucideSalad,
  lucideWallet,
} from '@ng-icons/lucide';

/** Today at a glance, one card per applet. */
@Component({
  selector: 'customer-home',
  imports: [
    AioNavigationCard,
    AioMetric,
    AioButton,
    AioCardDirectives,
    AioIcon,
    AioInput,
    RouterLink,
    AioSkeletonRows,
    AioTranslate,
  ],
  providers: [
    provideIcons({
      lucideCalendarCheck,
      lucideChevronLeft,
      lucideCircle,
      lucideCircleCheck,
      lucideDumbbell,
      lucideLanguages,
      lucideSalad,
      lucideWallet,
    }),
  ],
  template: `
    <div class="flex flex-col gap-8 md:gap-10">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="aio-eyebrow">{{ todayLabel() | aioTranslate }}</p>
          <h1 class="aio-page-title">
            {{
              'سلام{0}. امروز از کجا شروع کنیم؟'
                | aioTranslate: [name() ? '، ' + name() : '']
            }}
          </h1>
          <p class="text-muted-foreground mt-1 text-sm">
            {{ 'فضای کوچکِ پیشرفت‌های بزرگ' | aioTranslate }}
          </p>
        </div>
        <a aioBtn variant="outline" href="/#install" class="min-h-11">
          {{ 'راهنمای نصب' | aioTranslate }}
        </a>
      </header>
      <!-- First-week checklist: nothing while loading or on error, so returning users never see it flash. -->
      @if (firstWeek(); as steps) {
        <section aioCard aria-labelledby="first-week-heading">
          <div aioCardHeader>
            <h2 aioCardTitle id="first-week-heading">
              {{ 'هفتهٔ اول تو' | aioTranslate }}
            </h2>
            <p aioCardDescription>
              {{
                'سه قدم کوچک تا Poshtetgarm واقعاً به کارت بیاید.'
                  | aioTranslate
              }}
            </p>
          </div>
          <ul aioCardContent class="flex flex-col gap-3">
            @for (step of steps; track step.id) {
              <li
                class="flex min-h-11 flex-wrap items-center justify-between gap-3"
              >
                <span class="flex items-center gap-2">
                  <aio-icon
                    [name]="step.done ? 'lucideCircleCheck' : 'lucideCircle'"
                    [class]="
                      step.done ? 'text-primary' : 'text-muted-foreground'
                    "
                  />
                  <span [class.text-muted-foreground]="step.done">{{
                    step.label | aioTranslate
                  }}</span>
                  @if (step.done) {
                    <span class="sr-only">{{ 'انجام شد' | aioTranslate }}</span>
                  }
                </span>
                @if (!step.done) {
                  <button
                    aioBtn
                    variant="outline"
                    type="button"
                    class="min-h-11"
                    [disabled]="push.busy()"
                    (click)="doStep(step.id)"
                  >
                    {{ step.action | aioTranslate }}
                  </button>
                }
              </li>
            }
          </ul>
        </section>
      }
      <section
        class="aio-hero grid items-center gap-8 md:grid-cols-[1.4fr_1fr]"
        aria-labelledby="today-heading"
      >
        <div class="flex flex-col items-start gap-4">
          <span class="aio-hero-caption">{{
            'یک روز تازه، یک فرصت تازه' | aioTranslate
          }}</span>
          <h2
            id="today-heading"
            class="text-3xl leading-[1.6] font-bold md:text-4xl"
          >
            {{ 'کمی تمرکز.' | aioTranslate }}<br />{{
              'کمی یادگیری.' | aioTranslate
            }}<br /><span class="text-[#d9f0c7]">{{
              'کمی بیشتر برای خودت.' | aioTranslate
            }}</span>
          </h2>
          <p class="aio-hero-caption hidden max-w-md sm:block">
            {{
              'لازم نیست همه‌چیز را یک‌باره انجام بدهی. قدم بعدی‌ات را انتخاب کن؛ بقیه‌اش همین‌جاست.'
                | aioTranslate
            }}
          </p>
          <a aioBtn class="aio-hero-action mt-2" routerLink="/planner"
            ><aio-icon name="lucideCalendarCheck" size="sm" />{{
              'برو به برنامه امروز' | aioTranslate
            }}<aio-icon
              name="lucideChevronLeft"
              class="ltr:-scale-x-100"
              size="sm"
          /></a>
        </div>
        <div
          class="grid grid-cols-3 gap-3 rounded-2xl border border-white/15 bg-white/5 px-4 py-4 md:flex md:flex-col md:gap-0 md:px-5 md:py-2"
        >
          @if (hasApplet('planner')) {
            <div
              class="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center md:border-b md:border-white/10 md:py-5"
              aioMetric
              [label]="'کارهای باقی‌مانده' | aioTranslate"
              [value]="tasks.error() ? '—' : fa(openTasks().length)"
              [loading]="tasks.isLoading() && !tasks.hasValue()"
              labelClass="aio-hero-stat-label"
              valueClass="min-h-9 min-w-[2ch] text-3xl tabular-nums"
            ></div>
          }
          @if (hasApplet('english')) {
            <div
              class="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center md:border-b md:border-white/10 md:py-5"
              aioMetric
              [label]="'کارت‌های آماده مرور' | aioTranslate"
              [value]="english.error() ? '—' : fa(english.value()?.due ?? 0)"
              [loading]="english.isLoading() && !english.hasValue()"
              labelClass="aio-hero-stat-label"
              valueClass="min-h-9 min-w-[2ch] text-3xl tabular-nums"
            ></div>
          }
          @if (hasApplet('health')) {
            <div
              class="flex flex-col items-start justify-between gap-2 md:flex-row md:items-center md:py-5"
              aioMetric
              [label]="'دقیقه فعالیت این هفته' | aioTranslate"
              [value]="week.error() ? '—' : fa(week.value()?.minutes ?? 0)"
              [loading]="week.isLoading() && !week.hasValue()"
              labelClass="aio-hero-stat-label"
              valueClass="min-h-9 min-w-[2ch] text-3xl tabular-nums"
            ></div>
          }
        </div>
      </section>
      <section aria-labelledby="spaces-heading" class="flex flex-col gap-4">
        <div class="flex items-end justify-between gap-3">
          <h2 id="spaces-heading" class="text-lg font-bold">
            {{ 'هر بخش از روزت، سر جای خودش.' | aioTranslate }}
          </h2>
          <span class="text-muted-foreground hidden text-xs sm:block">{{
            'انتخاب کن و ادامه بده' | aioTranslate
          }}</span>
        </div>
        @if (cards().length) {
          <div class="grid grid-cols-2 gap-3 md:gap-4 xl:grid-cols-4">
            @for (card of cards(); track card.title) {
              <a
                aioNavigationCard
                [routerLink]="card.link"
                [class]="card.accent"
                [title]="card.title"
                [icon]="card.icon"
                [description]="card.value | aioTranslate"
                [action]="card.action | aioTranslate"
                [loading]="card.loading"
              ></a>
            }
          </div>
        } @else {
          <div
            class="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4"
          >
            <p class="text-sm text-muted-foreground">
              {{
                'هیچ بخشی برای نمایش انتخاب نشده است. از حساب کاربری بخش‌های مورد نیازت را فعال کن.'
                  | aioTranslate
              }}
            </p>
            <a aioBtn variant="outline" routerLink="/account">
              {{ 'تنظیم بخش‌های برنامه' | aioTranslate }}
            </a>
          </div>
        }
      </section>
      @if (hasApplet('planner')) {
        <section aioCard aria-labelledby="next-heading">
          <div
            aioCardHeader
            class="flex flex-row items-center justify-between gap-3"
          >
            <div>
              <h2 id="next-heading" aioCardTitle>
                {{ 'قدم‌های بعدی امروز' | aioTranslate }}
              </h2>
              <p aioCardDescription>
                {{ 'فقط همین قدم بعدی را بردار.' | aioTranslate }}
              </p>
            </div>
            <a aioBtn variant="ghost" routerLink="/planner"
              >{{ 'همه کارها' | aioTranslate
              }}<aio-icon
                name="lucideChevronLeft"
                class="ltr:-scale-x-100"
                size="sm"
            /></a>
          </div>
          <div aioCardContent>
            @if (tasks.isLoading()) {
              <div
                class="flex flex-col gap-3 py-4"
                role="status"
                [attr.aria-label]="'در حال دریافت برنامه امروز' | aioTranslate"
              >
                <div
                  aioSkeletonRows
                  class="contents"
                  [count]="4"
                  itemClass="h-12 rounded-xl"
                ></div>
              </div>
            } @else if (tasks.error()) {
              <div
                class="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <p role="alert">
                  {{ 'برنامه امروز دریافت نشد.' | aioTranslate }}
                </p>
                <button aioBtn variant="outline" (click)="tasks.reload()">
                  {{ 'تلاش دوباره' | aioTranslate }}
                </button>
              </div>
            } @else if (!openTasks().length) {
              <div class="flex flex-col items-start gap-3 py-5">
                <span class="aio-module-icon"
                  ><aio-icon name="lucideCalendarCheck"
                /></span>
                <p class="font-semibold">
                  {{ 'امروز هنوز جای یک کار خوب دارد.' | aioTranslate }}
                </p>
                <p class="text-muted-foreground text-sm">
                  {{
                    'یک کار کوچک اضافه کن؛ یا از این فرصت برای استراحت استفاده کن.'
                      | aioTranslate
                  }}
                </p>
                <a aioBtn variant="outline" routerLink="/planner">{{
                  'برنامه‌ریزی امروز' | aioTranslate
                }}</a>
              </div>
            } @else {
              @for (task of openTasks().slice(0, 4); track task.id) {
                <a class="aio-task-row" routerLink="/planner"
                  ><span
                    class="size-5 shrink-0 rounded-full border border-input"
                  ></span
                  ><span class="min-w-0 flex-1 break-words text-sm">{{
                    task.title
                  }}</span
                  ><aio-icon
                    name="lucideChevronLeft"
                    size="sm"
                    class="text-muted-foreground ltr:-scale-x-100"
                /></a>
              }
            }
          </div>
        </section>
      }
      <section aioCard aria-labelledby="invite-heading">
        <div aioCardHeader>
          <h2 id="invite-heading" aioCardTitle>
            {{ 'دعوت از دوستان' | aioTranslate }}
          </h2>
          <p aioCardDescription>
            {{ 'لینک دعوتت را برای دوستانت بفرست.' | aioTranslate }}
          </p>
        </div>
        <div aioCardContent class="flex flex-col items-start gap-3">
          <input
            aioInput
            type="url"
            class="w-full min-w-0"
            dir="ltr"
            readonly
            [attr.aria-label]="'لینک دعوت' | aioTranslate"
            [value]="invite.hasValue() ? invite.value() : ''"
          />
          <button
            aioBtn
            type="button"
            variant="outline"
            class="min-h-11"
            [disabled]="!invite.hasValue()"
            (click)="copyInvite()"
          >
            {{ 'کپی لینک دعوت' | aioTranslate }}
          </button>
          @if (invite.error()) {
            <p class="text-sm text-destructive" role="alert">
              {{ 'لینک دعوت آماده نشد.' | aioTranslate }}
            </p>
          }
        </div>
      </section>
    </div>
  `,
})
export class Home {
  protected readonly locale = inject(AioLocale);

  private readonly api = inject(API_BASE_URL);
  private readonly auth = inject(AuthStore);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly notifications = inject(AioNotifications);
  protected readonly invite = resource({
    params: () => this.auth.user()?.id,
    loader: async ({ params: accountId }) => {
      const browser = this.document.defaultView;
      if (!browser?.crypto.subtle) throw new Error('Web Crypto is unavailable');
      // A stable campaign tag for sharing without exposing the account ID.
      const digest = await browser.crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode('poshtetgarm:invite:v1:' + accountId),
      );
      const inviteCode = Array.from(
        new Uint8Array(digest).slice(0, 16),
        (byte) => byte.toString(16).padStart(2, '0'),
      ).join('');
      const link = new URL('/', browser.location.origin);
      link.search = new URLSearchParams({
        utm_source: GROWTH_REFERRAL_SOURCE,
        utm_medium: 'invite',
        utm_campaign: 'personal-invite',
        utm_content: inviteCode,
      }).toString();
      return link.href;
    },
  });

  protected async copyInvite(): Promise<void> {
    if (!this.invite.hasValue()) return;
    try {
      const clipboard = this.document.defaultView?.navigator.clipboard;
      if (!clipboard) throw new Error('Clipboard is unavailable');
      await clipboard.writeText(this.invite.value());
      this.notifications.success('لینک دعوت کپی شد.');
    } catch {
      this.notifications.info('لینک را انتخاب کن و دستی کپی کن.');
    }
  }

  protected readonly onboarding = httpResource<OnboardingState>(
    () => `${this.api}/onboarding`,
  );
  protected readonly push = inject(PushSettings);
  private readonly assistant = inject(AssistantStore);
  private readonly storage = this.document.defaultView?.localStorage;
  private readonly assistantKey = computed(
    () => `aio_first_week_assistant:${this.auth.user()?.id ?? ''}`,
  );
  private readonly askedAssistant = signal(false);
  /** The three first-week steps, or null once they are done or the first week is over. */
  protected readonly firstWeek = computed(() => {
    const user = this.auth.user();
    if (!user || !this.onboarding.hasValue()) return null;
    if (Date.now() - Date.parse(user.createdAt) > 7 * 86_400_000) return null;
    const state = this.onboarding.value();
    let asked = this.askedAssistant();
    try {
      asked ||= this.storage?.getItem(this.assistantKey()) === '1';
    } catch {
      /* Private mode: the step simply stays open. */
    }
    const steps = [
      {
        id: 'first',
        label: 'اولین قدم را بردار',
        action: 'شروع',
        done: state.completed || state.established,
      },
      ...(this.push.supported
        ? [
            {
              id: 'reminders',
              label: 'یادآورها را روشن کن',
              action: 'روشن کردن',
              done: this.push.enabled(),
            } as const,
          ]
        : []),
      {
        id: 'assistant',
        label: 'یک کار را به دستیار بسپار',
        action: 'پرسیدن از دستیار',
        done: asked,
      },
    ] as const;
    return steps.every((step) => step.done) ? null : steps;
  });

  protected async doStep(id: 'first' | 'reminders' | 'assistant') {
    if (id === 'first') {
      await this.router.navigate(['/welcome'], {
        queryParams: { restart: 1 },
      });
    } else if (id === 'reminders') {
      await this.push.enable();
      if (!this.push.enabled()) {
        this.notifications.info(this.push.message());
        return;
      }
      // Fields left out keep their value (the morning digest stays as the user set it).
      await firstValueFrom(
        this.http.put(`${this.api}/push/progress-settings`, {
          firstWeek: true,
          weekly: true,
        }),
      ).catch(() => undefined);
      this.notifications.success('اعلان‌ها روشن شد.');
    } else {
      const goal = this.onboarding.hasValue()
        ? this.onboarding.value().goal
        : null;
      this.assistant.ask(
        this.locale.text(
          goal === 'english'
            ? 'امروز کدام کارت‌ها را مرور کنم؟'
            : goal === 'health'
              ? 'برای شام امشب یک پیشنهاد سالم بده.'
              : 'سه کار مهم فردا را برایم در برنامه بگذار.',
        ),
      );
      this.askedAssistant.set(true);
      try {
        this.storage?.setItem(this.assistantKey(), '1');
      } catch {
        /* Private mode: the step reopens on the next visit. */
      }
    }
  }
  private readonly today = toIsoDate(new Date());
  protected readonly todayLabel = computed(() =>
    this.locale.date(this.today, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }),
  );
  protected readonly name = computed(() => this.auth.user()?.name ?? '');

  protected readonly fa = (value: number, options?: Intl.NumberFormatOptions) =>
    this.locale.number(value, options);
  protected readonly enabledApplets = computed(() => {
    const user = this.auth.user();
    return new Set(resolveEnabledApplets(user?.enabledApplets, user?.role));
  });
  protected hasApplet(key: AppApplet): boolean {
    return this.enabledApplets().has(key);
  }
  protected readonly tasks = httpResource<PlannerTask[]>(() =>
    this.hasApplet('planner')
      ? `${this.api}/planner/tasks?preset=today`
      : undefined,
  );
  protected readonly english = httpResource<EnglishStats>(() =>
    this.hasApplet('english') ? `${this.api}/english/stats` : undefined,
  );
  private readonly meals = httpResource<MealLog[]>(() =>
    this.hasApplet('health')
      ? `${this.api}/health/meals?date=${this.today}`
      : undefined,
  );
  protected readonly week = httpResource<FitnessWeek>(() =>
    this.hasApplet('health')
      ? `${this.api}/health/workouts/week?date=${this.today}`
      : undefined,
  );

  protected readonly openTasks = computed(() =>
    (this.tasks.value() ?? []).filter((t) => !t.done),
  );

  protected readonly cards = computed(() => {
    const enabled = this.enabledApplets();
    const open = (this.tasks.value() ?? []).filter((t) => !t.done).length;
    const due = this.english.value()?.due ?? 0;
    const meals = this.meals.value() ?? [];
    const avg = meals.length
      ? Math.round(meals.reduce((s, m) => s + m.score, 0) / meals.length)
      : null;
    return [
      ...(enabled.has('planner')
        ? [
            {
              title: 'برنامه‌ریز',
              loading: this.tasks.isLoading() && !this.tasks.hasValue(),
              action: 'روزت را بچین',
              icon: 'lucideCalendarCheck',
              link: '/planner',
              value: open
                ? `${this.locale.number(open)} کار باقی مانده`
                : 'کاری باقی نمانده',
              accent: 'applet-planner',
            },
          ]
        : []),
      ...(enabled.has('english')
        ? [
            {
              title: 'یادگیری زبان',
              loading: this.english.isLoading() && !this.english.hasValue(),
              action: 'ادامه یادگیری',
              icon: 'lucideLanguages',
              link: '/english',
              value: due
                ? `${this.locale.number(due)} کارت آماده مرور`
                : 'مروری باقی نمانده',
              accent: 'applet-english',
            },
          ]
        : []),
      ...(enabled.has('health')
        ? [
            {
              title: 'تغذیه',
              loading: this.meals.isLoading() && !this.meals.hasValue(),
              action: 'ثبت وعده غذایی',
              icon: 'lucideSalad',
              link: '/health/nutrition',
              value:
                avg === null
                  ? 'وعده‌ای ثبت نشده'
                  : `میانگین امتیاز ${this.locale.number(avg)}`,
              accent: 'applet-health',
            },
            {
              title: 'حرکت و تمرین',
              loading: this.week.isLoading() && !this.week.hasValue(),
              action: 'برنامه تمرین من',
              icon: 'lucideDumbbell',
              link: '/health/fitness',
              value: `${this.locale.number(this.week.value()?.minutes ?? 0)} از ۱۵۰ دقیقه`,
              accent: 'applet-health',
            },
          ]
        : []),
      ...(this.auth.user()?.role === 'ADMIN' && enabled.has('expenses')
        ? [
            {
              title: 'مدیریت مخارج',
              loading: false,
              action: 'ثبت و گزارش مخارج',
              icon: 'lucideWallet',
              link: '/expenses',
              value: 'بخش ویژه مدیر',
              accent: 'applet-expenses',
            },
          ]
        : []),
    ];
  });
}
