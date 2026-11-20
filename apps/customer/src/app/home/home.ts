import { ReferralCard } from '../billing/referral';
import { firstValueFrom } from 'rxjs';
import { DOCUMENT } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import type { EnglishStats } from '@all-in-one/applets/english-learning/contracts';
import type {
  FitnessWeek,
  MealLog,
} from '@all-in-one/applets/health/contracts';
import type { PlannerTask } from '@all-in-one/applets/planner/contracts';
import {
  resolveEnabledApplets,
  toIsoDate,
  type AppApplet,
  type OnboardingState,
} from '@all-in-one/shared/schemas';
import {
  AioTranslate,
  AioButton,
  AioCardDirectives,
  AioIcon,
  AioInput,
  AioNotifications,
  provideIcons,
  AioSkeletonRows,
  AioLocale,
  verbatim,
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
  lucideLanguages,
  lucidePlus,
  lucideSalad,
  lucideWallet,
} from '@ng-icons/lucide';

/** Today at a glance, one card per applet. */
@Component({
  selector: 'customer-home',
  imports: [
    ReferralCard,
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
      lucideLanguages,
      lucidePlus,
      lucideSalad,
      lucideWallet,
    }),
  ],
  template: `
    <div class="flex flex-col gap-6 md:gap-8">
      <header>
        <p class="aio-eyebrow">{{ todayLabel() | aioTranslate }}</p>
        <h1 class="aio-page-title">
          {{ 'سلام{0}' | aioTranslate: [name() ? '، ' + name() : ''] }}
        </h1>
      </header>
      <!-- First-week checklist: nothing while loading or on error, so returning users never see it flash. -->
      @if (firstWeek(); as steps) {
        <section aioCard aria-labelledby="first-week-heading">
          <div aioCardHeader>
            <h2 aioCardTitle id="first-week-heading">
              {{ 'هفتهٔ اول تو' | aioTranslate }}
            </h2>
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

      @if (hasApplet('planner')) {
        <section aioCard class="applet-planner" aria-labelledby="tasks-heading">
          <div
            aioCardHeader
            class="flex flex-row items-center justify-between gap-3"
          >
            <h2 id="tasks-heading" aioCardTitle class="flex items-center gap-2">
              <aio-icon name="lucideCalendarCheck" class="text-primary" />
              {{ 'کارهای امروز' | aioTranslate }}
            </h2>
            <a aioBtn variant="ghost" class="min-h-11" routerLink="/planner"
              >{{ 'همه' | aioTranslate
              }}<aio-icon
                name="lucideChevronLeft"
                class="ltr:-scale-x-100"
                size="sm"
            /></a>
          </div>
          <div aioCardContent class="flex flex-col gap-2">
            <form
              class="flex gap-2"
              (submit)="$event.preventDefault(); addTask(newTask)"
            >
              <input
                aioInput
                #newTask
                type="text"
                maxlength="200"
                autocomplete="off"
                class="min-h-11 min-w-0 flex-1"
                [attr.aria-label]="'کار تازه برای امروز' | aioTranslate"
                [attr.placeholder]="'یک کار برای امروز بنویس…' | aioTranslate"
              />
              <button
                aioBtn
                size="icon"
                type="submit"
                class="size-11 shrink-0"
                [disabled]="adding()"
                [attr.aria-label]="'افزودن' | aioTranslate"
              >
                <aio-icon name="lucidePlus" />
              </button>
            </form>
            @if (tasks.isLoading() && !tasks.hasValue()) {
              <div
                class="flex flex-col gap-2 py-2"
                role="status"
                [attr.aria-label]="'در حال دریافت برنامه امروز' | aioTranslate"
              >
                <div
                  aioSkeletonRows
                  class="contents"
                  [count]="3"
                  itemClass="h-11 rounded-xl"
                ></div>
              </div>
            } @else if (tasks.error()) {
              <div class="flex flex-wrap items-center justify-between gap-3">
                <p role="alert" class="text-sm">
                  {{ 'برنامه امروز دریافت نشد.' | aioTranslate }}
                </p>
                <button
                  aioBtn
                  variant="outline"
                  class="min-h-11"
                  (click)="tasks.reload()"
                >
                  {{ 'تلاش دوباره' | aioTranslate }}
                </button>
              </div>
            } @else if (!openTasks().length) {
              <p class="text-muted-foreground py-2 text-sm leading-7">
                {{
                  doneToday()
                    ? ('همهٔ کارهای امروز انجام شد.' | aioTranslate)
                    : ('برای امروز کاری ثبت نکرده‌ای.' | aioTranslate)
                }}
              </p>
            } @else {
              <ul class="flex flex-col">
                @for (task of openTasks().slice(0, 5); track task.id) {
                  <li class="flex min-h-11 items-center gap-1">
                    <button
                      type="button"
                      class="relative flex size-11 shrink-0 items-center justify-center rounded-full"
                      [disabled]="completing().has(task.id)"
                      [attr.aria-label]="
                        'انجام شد: {0}' | aioTranslate: [verbatim(task.title)]
                      "
                      (click)="complete(task)"
                    >
                      <span
                        class="border-input size-5 rounded-full border-2"
                      ></span>
                    </button>
                    <a
                      routerLink="/planner"
                      class="min-w-0 flex-1 py-2 text-sm leading-6 break-words"
                      >{{ task.title }}</a
                    >
                  </li>
                }
              </ul>
              @if (openTasks().length > 5) {
                <a
                  routerLink="/planner"
                  class="text-primary min-h-11 py-2 text-sm font-medium"
                  >{{
                    '{0} کار دیگر' | aioTranslate: [fa(openTasks().length - 5)]
                  }}</a
                >
              }
            }
          </div>
        </section>
      }

      @if (hasApplet('english') || hasApplet('health')) {
        <div class="grid gap-4 md:grid-cols-2">
          @if (hasApplet('english')) {
            <section
              aioCard
              class="applet-english"
              aria-labelledby="english-heading"
            >
              <div aioCardHeader>
                <h2
                  id="english-heading"
                  aioCardTitle
                  class="flex items-center gap-2"
                >
                  <aio-icon name="lucideLanguages" class="text-primary" />
                  {{ 'مرور لغت' | aioTranslate }}
                </h2>
              </div>
              <div aioCardContent class="flex flex-col gap-4">
                @if (english.isLoading() && !english.hasValue()) {
                  <div
                    aioSkeletonRows
                    [count]="1"
                    itemClass="h-14 rounded-xl"
                  ></div>
                } @else if (english.value(); as stats) {
                  <p class="text-sm leading-7">
                    @if (stats.due) {
                      {{
                        '{0} کارت منتظر مرور است.'
                          | aioTranslate: [fa(stats.due)]
                      }}
                    } @else if (stats.total) {
                      {{ 'امروز کارتی برای مرور نمانده.' | aioTranslate }}
                    } @else {
                      {{
                        'هنوز کارتی نداری؛ یک مجموعهٔ آماده بردار.'
                          | aioTranslate
                      }}
                    }
                    @if (stats.streakDays > 1) {
                      <span class="text-muted-foreground block">{{
                        '{0} روز پشت سر هم'
                          | aioTranslate: [fa(stats.streakDays)]
                      }}</span>
                    }
                  </p>
                } @else {
                  <p role="alert" class="text-sm">
                    {{ 'آمار مرور دریافت نشد.' | aioTranslate }}
                  </p>
                }
                <a
                  aioBtn
                  class="min-h-11 self-start"
                  [variant]="english.value()?.due ? 'default' : 'outline'"
                  routerLink="/english"
                  >{{
                    (english.value()?.due
                      ? 'شروع مرور'
                      : english.value()?.total === 0
                        ? 'انتخاب مجموعه'
                        : 'رفتن به زبان'
                    ) | aioTranslate
                  }}</a
                >
              </div>
            </section>
          }
          @if (hasApplet('health')) {
            <section
              aioCard
              class="applet-health"
              aria-labelledby="health-heading"
            >
              <div aioCardHeader>
                <h2
                  id="health-heading"
                  aioCardTitle
                  class="flex items-center gap-2"
                >
                  <aio-icon name="lucideSalad" class="text-primary" />
                  {{ 'تغذیه و تمرین' | aioTranslate }}
                </h2>
              </div>
              <div aioCardContent class="flex flex-col gap-4">
                @if (
                  (meals.isLoading() && !meals.hasValue()) ||
                  (week.isLoading() && !week.hasValue())
                ) {
                  <div
                    aioSkeletonRows
                    [count]="1"
                    itemClass="h-14 rounded-xl"
                  ></div>
                } @else {
                  <dl class="grid grid-cols-2 gap-3 text-sm">
                    <div class="flex flex-col gap-1">
                      <dt class="text-muted-foreground">
                        {{ 'کالری امروز' | aioTranslate }}
                      </dt>
                      <dd class="text-lg font-semibold">
                        {{ meals.error() ? '—' : fa(caloriesToday()) }}
                      </dd>
                    </div>
                    <div class="flex flex-col gap-1">
                      <dt class="text-muted-foreground">
                        {{ 'تمرین این هفته' | aioTranslate }}
                      </dt>
                      <dd class="text-lg font-semibold">
                        {{
                          week.error()
                            ? '—'
                            : ('{0} دقیقه'
                              | aioTranslate: [fa(week.value()?.minutes ?? 0)])
                        }}
                      </dd>
                    </div>
                  </dl>
                }
                <div class="flex flex-wrap gap-2">
                  <a aioBtn class="min-h-11" routerLink="/health/nutrition">{{
                    'ثبت وعده' | aioTranslate
                  }}</a>
                  <a
                    aioBtn
                    variant="outline"
                    class="min-h-11"
                    routerLink="/health/fitness"
                    >{{ 'تمرین امروز' | aioTranslate }}</a
                  >
                </div>
              </div>
            </section>
          }
        </div>
      }

      @if (hasApplet('expenses')) {
        <a
          aioBtn
          variant="outline"
          class="applet-expenses min-h-12 justify-between"
          routerLink="/expenses"
        >
          <span class="flex items-center gap-2"
            ><aio-icon name="lucideWallet" />{{
              'ثبت خرج امروز' | aioTranslate
            }}</span
          ><aio-icon
            name="lucideChevronLeft"
            class="ltr:-scale-x-100"
            size="sm"
        /></a>
      }

      @if (!enabledApplets().size) {
        <div
          class="glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4"
        >
          <p class="text-muted-foreground text-sm">
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

      <customer-referral-card />
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
  protected readonly meals = httpResource<MealLog[]>(() =>
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

  protected readonly doneToday = computed(() =>
    (this.tasks.value() ?? []).some((t) => t.done),
  );
  protected readonly caloriesToday = computed(() =>
    Math.round(
      (this.meals.value() ?? []).reduce((sum, m) => sum + (m.calories ?? 0), 0),
    ),
  );
  protected readonly verbatim = verbatim;
  protected readonly adding = signal(false);
  protected readonly completing = signal<ReadonlySet<string>>(new Set());

  protected async addTask(input: HTMLInputElement): Promise<void> {
    const title = input.value.trim();
    if (!title || this.adding()) return;
    this.adding.set(true);
    try {
      await firstValueFrom(
        this.http.post(`${this.api}/planner/tasks`, {
          title,
          date: this.today,
        }),
      );
      input.value = '';
      this.tasks.reload();
    } catch {
      this.notifications.error('ثبت نشد؛ اتصال را بررسی کن و دوباره تلاش کن.');
    } finally {
      this.adding.set(false);
    }
  }

  protected async complete(task: PlannerTask): Promise<void> {
    if (this.completing().has(task.id)) return;
    this.completing.update((ids) => new Set(ids).add(task.id));
    try {
      await firstValueFrom(
        this.http.post(`${this.api}/planner/tasks/${task.id}/complete`, {}),
      );
      this.notifications.success('کار انجام شد.');
      this.tasks.reload();
    } catch {
      this.notifications.error('ثبت نشد؛ اتصال را بررسی کن و دوباره تلاش کن.');
    } finally {
      this.completing.update((ids) => {
        const next = new Set(ids);
        next.delete(task.id);
        return next;
      });
    }
  }
}
