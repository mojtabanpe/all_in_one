import { HttpClient, httpResource } from '@angular/common/http';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type {
  Deck,
  StarterDeck,
} from '@all-in-one/applets/english-learning/contracts';
import type {
  MealEstimate,
  MealLogInput,
  MealType,
} from '@all-in-one/applets/health/contracts';
import {
  GOAL_APP_PATHS,
  toIsoDate,
  type BillingAccessState,
  type OnboardingGoal,
  type OnboardingState,
} from '@all-in-one/shared/schemas';
import {
  AioAsyncButton,
  AioButton,
  AioCardDirectives,
  AioFormField,
  AioIcon,
  AioInput,
  AioLocale,
  AioNotifications,
  AioSkeletonLines,
  AioTranslate,
  provideIcons,
} from '@all-in-one/ui';
import { API_BASE_URL, PushSettings } from '@all-in-one/web/shared';
import {
  lucideBell,
  lucideCalendarCheck,
  lucideLanguages,
  lucidePlus,
  lucideSalad,
} from '@ng-icons/lucide';
import { firstValueFrom } from 'rxjs';
import { needsWelcome } from './welcome-gate';

const LEVEL_NAMES: Record<StarterDeck['level'], string> = {
  A1: 'مبتدی',
  A2: 'پایه',
  B1: 'متوسط',
  B2: 'بالاتر از متوسط',
  C1: 'پیشرفته',
};

/** Breakfast until 11, lunch until 16, dinner until 22, otherwise a snack. */
export function mealTypeAt(hour: number): MealType {
  if (hour >= 5 && hour < 11) return 'BREAKFAST';
  if (hour >= 11 && hour < 16) return 'LUNCH';
  if (hour >= 16 && hour < 22) return 'DINNER';
  return 'SNACK';
}

/**
 * First session of a new account: pick one goal, do its first action here, then offer reminders.
 * A focused page outside the shell, so nothing competes with the single next step.
 */
@Component({
  selector: 'customer-welcome',
  imports: [
    AioAsyncButton,
    AioButton,
    AioCardDirectives,
    AioFormField,
    AioIcon,
    AioInput,
    AioSkeletonLines,
    AioTranslate,
  ],
  providers: [
    provideIcons({
      lucideBell,
      lucideCalendarCheck,
      lucideLanguages,
      lucidePlus,
      lucideSalad,
    }),
  ],
  host: { class: 'lx-stage lx-brand block min-h-dvh' },
  template: `
    <main
      class="mx-auto flex min-h-dvh w-full max-w-xl flex-col gap-6 px-4 pt-6 pb-[calc(2rem+env(safe-area-inset-bottom))] md:px-8 md:pt-12"
    >
      <header class="flex items-center gap-2">
        <img
          src="brand-logo.png"
          alt=""
          width="36"
          height="36"
          class="size-9 rounded-xl"
        />
        <span class="text-base font-semibold" dir="ltr">Poshtetgarm</span>
      </header>

      @switch (step()) {
        @case ('loading') {
          <section aioCard>
            <div aioCardContent class="min-h-72">
              <div aioSkeletonLines></div>
              <div
                aioSkeletonLines
                class="mt-6 block"
                [lines]="goalSkeleton"
              ></div>
            </div>
          </section>
        }
        @case ('goal') {
          <section aioCard aria-labelledby="welcome-heading">
            <div aioCardHeader>
              <h1 aioCardTitle id="welcome-heading" class="text-xl">
                {{ 'از کجا شروع کنیم؟' | aioTranslate }}
              </h1>
              <p aioCardDescription>
                {{
                  'یکی را انتخاب کن تا اولین قدم را همین‌جا برداری. هر سه بخش همیشه در دسترس‌اند.'
                    | aioTranslate
                }}
              </p>
            </div>
            <div aioCardContent class="flex min-h-72 flex-col gap-3">
              @for (item of goals; track item.id) {
                <button
                  aioBtn
                  variant="outline"
                  type="button"
                  class="h-auto min-h-20 justify-start gap-3 whitespace-normal p-4 text-start"
                  [disabled]="busy()"
                  (click)="chooseGoal(item.id)"
                >
                  <aio-icon [name]="item.icon" />
                  <span class="flex flex-col gap-1">
                    <span class="font-semibold">{{
                      item.title | aioTranslate
                    }}</span>
                    <span
                      class="text-muted-foreground text-sm leading-6 font-normal"
                      >{{ item.description | aioTranslate }}</span
                    >
                  </span>
                </button>
              }
            </div>
          </section>
        }
        @case ('planner') {
          <section aioCard aria-labelledby="welcome-heading">
            <div aioCardHeader>
              <h1 aioCardTitle id="welcome-heading" class="text-xl">
                {{ 'اولین کار امروزت چیست؟' | aioTranslate }}
              </h1>
              <p aioCardDescription>
                {{
                  'یکی از این‌ها را بردار یا کار خودت را بنویس. بعداً می‌توانی عوضش کنی.'
                    | aioTranslate
                }}
              </p>
            </div>
            <div aioCardContent class="flex flex-col gap-3">
              @for (title of taskIdeas; track title) {
                <button
                  aioBtn
                  variant="outline"
                  type="button"
                  class="min-h-12 justify-start gap-2 whitespace-normal text-start"
                  [disabled]="busy()"
                  (click)="createTask(text(title))"
                >
                  <aio-icon name="lucidePlus" size="sm" />
                  {{ title | aioTranslate }}
                </button>
              }
              <form
                class="mt-2 flex flex-col gap-3"
                (submit)="$event.preventDefault(); createTask(ownTask.value)"
              >
                <aio-form-field label="کار خودم" controlId="welcome-task">
                  <input
                    aioInput
                    #ownTask
                    id="welcome-task"
                    type="text"
                    maxlength="200"
                    autocomplete="off"
                    class="min-h-11 w-full"
                    [attr.placeholder]="'مثلاً: تماس با دکتر' | aioTranslate"
                  />
                </aio-form-field>
                <button
                  aioAsyncButton
                  type="submit"
                  class="min-h-11"
                  label="ثبت برای امروز"
                  busyLabel="در حال ثبت"
                  [busy]="busy()"
                  [disabled]="busy()"
                ></button>
              </form>
            </div>
          </section>
        }
        @case ('english') {
          <section aioCard aria-labelledby="welcome-heading">
            <div aioCardHeader>
              <h1 aioCardTitle id="welcome-heading" class="text-xl">
                {{ 'با کدام مجموعه شروع کنیم؟' | aioTranslate }}
              </h1>
              <p aioCardDescription>
                {{
                  'یک مجموعهٔ آماده را بردار و همین حالا چند کارت مرور کن.'
                    | aioTranslate
                }}
              </p>
            </div>
            <div aioCardContent class="flex min-h-72 flex-col gap-3">
              @if (starters.isLoading() && !starters.hasValue()) {
                <div aioSkeletonLines [lines]="goalSkeleton"></div>
              } @else if (starters.error()) {
                <p role="alert" class="leading-7">
                  {{ 'مجموعه‌ها دریافت نشد.' | aioTranslate }}
                </p>
                <button
                  aioBtn
                  variant="outline"
                  type="button"
                  class="min-h-11"
                  (click)="starters.reload()"
                >
                  {{ 'تلاش دوباره' | aioTranslate }}
                </button>
              }
              @for (deck of starters.value() ?? []; track deck.slug) {
                <button
                  aioBtn
                  variant="outline"
                  type="button"
                  class="h-auto min-h-16 justify-start gap-3 whitespace-normal p-4 text-start"
                  [disabled]="busy()"
                  (click)="copyDeck(deck)"
                >
                  <span
                    class="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl text-xs font-bold"
                    dir="ltr"
                    lang="en"
                    >{{ deck.level }}</span
                  >
                  <span class="flex min-w-0 flex-col gap-1">
                    <!-- The deck's own English name, as the study page shows it. -->
                    <span class="font-semibold" lang="en">{{
                      deck.title
                    }}</span>
                    <span class="text-muted-foreground text-sm font-normal">{{
                      '{0}، {1} کارت'
                        | aioTranslate
                          : [
                              text(levelNames[deck.level]),
                              locale.number(deck.cardCount),
                            ]
                    }}</span>
                  </span>
                </button>
              }
            </div>
          </section>
        }
        @case ('health') {
          <section aioCard aria-labelledby="welcome-heading">
            <div aioCardHeader>
              <h1 aioCardTitle id="welcome-heading" class="text-xl">
                {{ 'آخرین وعده‌ات چه بود؟' | aioTranslate }}
              </h1>
              <p aioCardDescription>
                {{
                  (aiAccess()
                    ? 'همان‌طور که به یک دوست می‌گویی بنویس؛ کالری‌اش را برایت برآورد می‌کنیم.'
                    : 'همان‌طور که به یک دوست می‌گویی بنویس.'
                  ) | aioTranslate
                }}
              </p>
            </div>
            <div aioCardContent>
              <form
                class="flex flex-col gap-3"
                (submit)="$event.preventDefault(); logMeal(meal.value)"
              >
                <aio-form-field label="وعده" controlId="welcome-meal">
                  <input
                    aioInput
                    #meal
                    id="welcome-meal"
                    type="text"
                    maxlength="500"
                    autocomplete="off"
                    class="min-h-11 w-full"
                    [attr.placeholder]="
                      'مثلاً: یک بشقاب عدس‌پلو با ماست' | aioTranslate
                    "
                  />
                </aio-form-field>
                <button
                  aioAsyncButton
                  type="submit"
                  class="min-h-11"
                  label="ثبت وعده"
                  busyLabel="در حال ثبت"
                  [busy]="busy()"
                  [disabled]="busy()"
                ></button>
              </form>
            </div>
          </section>
        }
        @case ('reminder') {
          <section aioCard aria-labelledby="welcome-heading">
            <div aioCardHeader>
              <h1 aioCardTitle id="welcome-heading" class="text-xl">
                {{ 'قدم اول انجام شد.' | aioTranslate }}
              </h1>
              <p aioCardDescription>
                {{
                  'اعلان‌ها را روشن کن تا یادآور روزانه و گزارش هفتگی‌ات به دستت برسد. هر وقت خواستی از حساب کاربری خاموشش کن.'
                    | aioTranslate
                }}
              </p>
            </div>
            <div aioCardContent class="flex flex-col gap-3">
              <button
                aioAsyncButton
                type="button"
                class="min-h-11"
                icon="lucideBell"
                label="روشن کردن اعلان‌ها"
                busyLabel="در حال فعال‌سازی"
                [busy]="push.busy()"
                [disabled]="push.busy()"
                (click)="enableReminders()"
              ></button>
              <button
                aioBtn
                variant="ghost"
                type="button"
                class="min-h-11"
                [disabled]="push.busy()"
                (click)="finish()"
              >
                {{
                  (reminderFailed() ? 'ادامه بدون اعلان' : 'فعلاً نه')
                    | aioTranslate
                }}
              </button>
              @if (reminderFailed()) {
                <p role="alert" class="text-sm leading-7">
                  {{ push.message() | aioTranslate }}
                </p>
              }
            </div>
          </section>
        }
      }

      @if (error(); as message) {
        <p role="alert" class="text-destructive text-sm leading-7">
          {{ message | aioTranslate }}
        </p>
      }

      @if (step() !== 'loading' && step() !== 'reminder') {
        <div class="flex flex-wrap gap-2">
          @if (step() !== 'goal') {
            <button
              aioBtn
              variant="ghost"
              type="button"
              class="min-h-11"
              [disabled]="busy()"
              (click)="chosen.set(null)"
            >
              {{ 'تغییر هدف' | aioTranslate }}
            </button>
          }
          <button
            aioBtn
            variant="ghost"
            type="button"
            class="min-h-11"
            [disabled]="busy()"
            (click)="skip()"
          >
            {{ 'فعلاً بدون راهنما ادامه می‌دهم' | aioTranslate }}
          </button>
        </div>
      }
    </main>
  `,
})
export class Welcome {
  protected readonly locale = inject(AioLocale);
  protected readonly push = inject(PushSettings);
  private readonly api = inject(API_BASE_URL);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly notifications = inject(AioNotifications);
  private readonly restart =
    inject(ActivatedRoute).snapshot.queryParamMap.has('restart');

  protected readonly levelNames = LEVEL_NAMES;
  protected readonly goalSkeleton = [
    'block h-20 w-full rounded-2xl',
    'mt-3 block h-20 w-full rounded-2xl',
    'mt-3 block h-20 w-full rounded-2xl',
  ] as const;
  protected readonly goals = [
    {
      id: 'planner',
      title: 'روز منظم‌تر',
      description: 'کارهای امروزت را بنویس و یکی‌یکی تیک بزن.',
      icon: 'lucideCalendarCheck',
    },
    {
      id: 'english',
      title: 'تمرین روزانهٔ زبان',
      description: 'روزی چند دقیقه فلش‌کارت مرور کن تا لغت‌ها یادت بماند.',
      icon: 'lucideLanguages',
    },
    {
      id: 'health',
      title: 'ثبت عادت‌های سلامت',
      description: 'وعده‌ها و تمرین‌هایت را ثبت کن و روزت را ببین.',
      icon: 'lucideSalad',
    },
  ] as const;
  protected readonly taskIdeas = [
    'ده دقیقه پیاده‌روی',
    'مرتب کردن میز کار',
    'نوشتن سه کار مهم فردا',
  ] as const;

  private readonly state = httpResource<OnboardingState>(
    () => `${this.api}/onboarding`,
  );
  /** `undefined` follows the account's saved goal; `null` reopens the choice. */
  protected readonly chosen = signal<OnboardingGoal | null | undefined>(
    undefined,
  );
  private readonly goal = computed(() => {
    const chosen = this.chosen();
    if (chosen !== undefined) return chosen;
    return this.state.hasValue() ? this.state.value().goal : null;
  });
  /** Where the finished first action continues. */
  private readonly target = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly reminderFailed = signal(false);
  protected readonly step = computed(() => {
    if (this.target()) return 'reminder';
    if (this.state.isLoading() && this.chosen() === undefined) return 'loading';
    return this.goal() ?? 'goal';
  });
  protected readonly starters = httpResource<StarterDeck[]>(() =>
    this.goal() === 'english' ? `${this.api}/english/starter-decks` : undefined,
  );

  private readonly access = httpResource<BillingAccessState>(() =>
    this.goal() === 'health' ? `${this.api}/billing/access` : undefined,
  );
  /** Without AI access the estimate would only open the paywall. */
  protected readonly aiAccess = computed(
    () => this.access.hasValue() && this.access.value().tier !== 'free',
  );

  constructor() {
    // Opened by an account that no longer needs it (a bookmark, the back button).
    effect(() => {
      if (
        this.state.hasValue() &&
        !this.target() &&
        !needsWelcome({
          ...this.state.value(),
          // Reopened from the first-week card by an account that skipped the guide earlier.
          skipped: this.state.value().skipped && !this.restart,
        })
      )
        void this.router.navigateByUrl('/');
    });
  }

  /** Copy of ours that becomes the user's own task title, in the chosen language. */
  protected text(message: string): string {
    return this.locale.text(message);
  }

  private async put(goal: OnboardingGoal | null): Promise<boolean> {
    try {
      await firstValueFrom(
        this.http.put<OnboardingState>(`${this.api}/onboarding`, { goal }),
      );
      return true;
    } catch {
      this.error.set('ذخیره نشد؛ اتصال را بررسی کن و دوباره تلاش کن.');
      return false;
    }
  }

  private async run(action: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
    } catch {
      this.error.set('ثبت نشد؛ اتصال را بررسی کن و دوباره تلاش کن.');
    } finally {
      this.busy.set(false);
    }
  }

  protected chooseGoal(goal: OnboardingGoal): Promise<void> {
    return this.run(async () => {
      if (await this.put(goal)) this.chosen.set(goal);
    });
  }

  protected skip(): Promise<void> {
    return this.run(async () => {
      if (await this.put(null)) await this.router.navigateByUrl('/');
    });
  }

  /** Planner and health already get the shared first-step toast from `onboardingFeedbackInterceptor`. */
  private done(target: string, message?: string): void {
    if (message) this.notifications.success(message);
    this.target.set(target);
    if (!this.push.supported || this.push.enabled()) void this.finish();
  }

  protected createTask(raw: string): Promise<void> {
    const title = raw.trim();
    if (!title) {
      this.error.set('اول کار را بنویس.');
      return Promise.resolve();
    }
    return this.run(async () => {
      await firstValueFrom(
        this.http.post(`${this.api}/planner/tasks`, {
          title,
          date: toIsoDate(new Date()),
        }),
      );
      this.done(GOAL_APP_PATHS.planner);
    });
  }

  protected copyDeck(starter: StarterDeck): Promise<void> {
    return this.run(async () => {
      const deck = await firstValueFrom(
        this.http.post<Deck>(
          `${this.api}/english/starter-decks/${starter.slug}`,
          {},
        ),
      );
      this.done(
        `${GOAL_APP_PATHS.english}/deck/${deck.id}/study`,
        'مجموعه به کتابخانه‌ات اضافه شد.',
      );
    });
  }

  protected logMeal(raw: string): Promise<void> {
    const description = raw.trim();
    if (description.length < 2) {
      this.error.set('اول وعده را بنویس.');
      return Promise.resolve();
    }
    return this.run(async () => {
      const plain: MealLogInput = {
        date: toIsoDate(new Date()),
        mealType: mealTypeAt(new Date().getHours()),
        description,
        portions: {},
      };
      // The estimate needs AI access; the meal is still logged without it.
      const estimate = this.aiAccess()
        ? await firstValueFrom(
            this.http.post<MealEstimate>(
              `${this.api}/health/ai/estimate-meal`,
              { description },
            ),
          ).catch(() => null)
        : null;
      const save = (input: MealLogInput) =>
        firstValueFrom(this.http.post(`${this.api}/health/meals`, input));
      if (estimate)
        await save({
          ...plain,
          portions: estimate.portions,
          calories: Math.round(estimate.calories),
          proteinG: Math.round(estimate.proteinG),
          carbsG: Math.round(estimate.carbsG),
          fatG: Math.round(estimate.fatG),
        }).catch(() => save(plain));
      else await save(plain);
      this.done(GOAL_APP_PATHS.health);
    });
  }

  protected async enableReminders(): Promise<void> {
    this.reminderFailed.set(false);
    await this.push.enable();
    if (!this.push.enabled()) {
      this.reminderFailed.set(true);
      return;
    }
    // Saying yes here is the request for reminders: the first-week nudges and weekly report for everyone,
    // plus the reminder that fits the chosen goal. Each can be turned off in the account.
    const goal = this.goal();
    await Promise.all([
      firstValueFrom(
        this.http.put(`${this.api}/push/progress-settings`, {
          firstWeek: true,
          weekly: true,
          dailyTasks: goal === 'planner',
        }),
      ).catch(() => undefined),
      goal === 'english'
        ? firstValueFrom(
            this.http.put(`${this.api}/push/review-settings`, {
              enabled: true,
              time: '20:00',
            }),
          ).catch(() => undefined)
        : undefined,
    ]);
    this.notifications.success('اعلان‌ها روشن شد.');
    await this.finish();
  }

  protected async finish(): Promise<void> {
    await this.router.navigateByUrl(this.target() ?? '/');
  }
}
