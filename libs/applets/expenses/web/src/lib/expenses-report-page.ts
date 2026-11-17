import { CommonModule } from '@angular/common';
import {
  Component,
  computed,
  inject,
  OnInit,
  Signal,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  type ExpenseCategoryColor,
  type ExpenseReport,
  type ExpenseReportPreset,
} from '@all-in-one/applets/expenses/contracts';
import {
  AioButton,
  AioChartImports,
  type AioChartOptions,
  aioChartTooltip,
  AioEmptyState,
  AioIcon,
  AioLocale,
  AioNotifications,
  AioProgressDirectives,
  AioTranslate,
  provideIcons,
} from '@all-in-one/ui';
import { apiErrorMessage } from '@all-in-one/web/shared';
import { defineChart, dot, lineY } from '@tanstack/charts';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { scalePoint } from '@tanstack/charts/scales/point';
import {
  lucideAlertTriangle,
  lucideArrowDownRight,
  lucideArrowUpRight,
  lucideCalendar,
  lucideCar,
  lucideCoffee,
  lucideGift,
  lucideGraduationCap,
  lucideHeartPulse,
  lucideHouse,
  lucidePieChart,
  lucidePlane,
  lucideReceipt,
  lucideShoppingBag,
  lucideSparkles,
  lucideTrendingUp,
  lucideUtensils,
  lucideWallet,
} from '@ng-icons/lucide';
import { ExpensesApi } from './expenses-api';

interface DailyChartRow {
  date: string;
  label: string;
  total: number;
}

@Component({
  selector: 'expenses-report-page',
  imports: [
    CommonModule,
    FormsModule,
    AioButton,
    AioIcon,
    AioProgressDirectives,
    AioChartImports,
    AioEmptyState,
    AioTranslate,
  ],
  providers: [
    provideIcons({
      lucideReceipt,
      lucideUtensils,
      lucideCar,
      lucideShoppingBag,
      lucideHeartPulse,
      lucideSparkles,
      lucideWallet,
      lucideGraduationCap,
      lucideHouse,
      lucideGift,
      lucideCoffee,
      lucidePlane,
      lucideTrendingUp,
      lucidePieChart,
      lucideCalendar,
      lucideAlertTriangle,
      lucideArrowUpRight,
      lucideArrowDownRight,
    }),
  ],
  template: `
    <div class="flex flex-col gap-6">
      <!-- Period selector -->
      <section
        class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/40 bg-card/40 p-3.5 backdrop-blur-sm"
      >
        <div class="flex items-center gap-2">
          <span
            class="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary"
          >
            <aio-icon name="lucideCalendar" size="xs" />
          </span>
          <span class="text-xs font-medium text-muted-foreground">
            {{ 'بازه زمانی گزارش:' | aioTranslate }}
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          <button
            aioBtn
            type="button"
            [variant]="preset() === 'today' ? 'default' : 'ghost'"
            size="sm"
            class="h-8 rounded-lg text-xs"
            (click)="setPreset('today')"
          >
            {{ 'امروز' | aioTranslate }}
          </button>
          <button
            aioBtn
            type="button"
            [variant]="preset() === 'last7day' ? 'default' : 'ghost'"
            size="sm"
            class="h-8 rounded-lg text-xs"
            (click)="setPreset('last7day')"
          >
            {{ '۷ روز گذشته' | aioTranslate }}
          </button>
          <button
            aioBtn
            type="button"
            [variant]="preset() === 'this_month' ? 'default' : 'ghost'"
            size="sm"
            class="h-8 rounded-lg text-xs"
            (click)="setPreset('this_month')"
          >
            {{ 'این ماه' | aioTranslate }}
          </button>
          <button
            aioBtn
            type="button"
            [variant]="preset() === 'last30day' ? 'default' : 'ghost'"
            size="sm"
            class="h-8 rounded-lg text-xs"
            (click)="setPreset('last30day')"
          >
            {{ '۳۰ روز گذشته' | aioTranslate }}
          </button>
          <button
            aioBtn
            type="button"
            [variant]="preset() === 'last90day' ? 'default' : 'ghost'"
            size="sm"
            class="h-8 rounded-lg text-xs"
            (click)="setPreset('last90day')"
          >
            {{ '۹۰ روز گذشته' | aioTranslate }}
          </button>
        </div>
      </section>

      @if (loading()) {
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          @for (i of [1, 2, 3, 4]; track i) {
            <div
              class="h-24 animate-pulse rounded-2xl border border-border/40 bg-card/30"
            ></div>
          }
        </div>
      } @else if (report(); as rep) {
        <!-- Key Metrics Cards -->
        <section class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <!-- Total Spend -->
          <div
            class="relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-4.5 shadow-sm backdrop-blur-md"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-muted-foreground">
                {{ 'کل مخارج دوره' | aioTranslate }}
              </span>
              <span
                class="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary"
              >
                <aio-icon name="lucideReceipt" size="xs" />
              </span>
            </div>
            <div class="mt-2.5 flex items-baseline gap-1.5">
              <span class="text-2xl font-bold tracking-tight text-foreground">
                {{ locale.number(rep.totalAmount) }}
              </span>
              <span class="text-xs text-muted-foreground">{{
                'تومان' | aioTranslate
              }}</span>
            </div>
            <p class="mt-1 text-[11px] text-muted-foreground">
              {{ locale.number(rep.transactionCount) }}
              {{ 'تراکنش ثبت‌شده' | aioTranslate }}
            </p>
          </div>

          <!-- Daily Average -->
          <div
            class="relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-4.5 shadow-sm backdrop-blur-md"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-muted-foreground">
                {{ 'میانگین مخارج روزانه' | aioTranslate }}
              </span>
              <span
                class="flex size-7 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500"
              >
                <aio-icon name="lucideTrendingUp" size="xs" />
              </span>
            </div>
            <div class="mt-2.5 flex items-baseline gap-1.5">
              <span class="text-2xl font-bold tracking-tight text-foreground">
                {{ locale.number(rep.dailyAverage) }}
              </span>
              <span class="text-xs text-muted-foreground">{{
                'تومان' | aioTranslate
              }}</span>
            </div>
            <p class="mt-1 text-[11px] text-muted-foreground">
              {{
                'در بازهٔ {0} روزه'
                  | aioTranslate: [locale.number(rep.daysCount)]
              }}
            </p>
          </div>

          <!-- Today's Spend -->
          <div
            class="relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-4.5 shadow-sm backdrop-blur-md"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-muted-foreground">
                {{ 'مخارج امروز' | aioTranslate }}
              </span>
              <span
                class="flex size-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500"
              >
                <aio-icon name="lucideCalendar" size="xs" />
              </span>
            </div>
            <div class="mt-2.5 flex items-baseline gap-1.5">
              <span class="text-2xl font-bold tracking-tight text-foreground">
                {{ locale.number(rep.todayAmount) }}
              </span>
              <span class="text-xs text-muted-foreground">{{
                'تومان' | aioTranslate
              }}</span>
            </div>
            <p class="mt-1 text-[11px] text-muted-foreground">
              {{ 'امروز تهران' | aioTranslate }}
            </p>
          </div>

          <!-- Top Category -->
          <div
            class="relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-4.5 shadow-sm backdrop-blur-md"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-medium text-muted-foreground">
                {{ 'بیشترین سهم هزینه' | aioTranslate }}
              </span>
              <span
                class="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary"
              >
                <aio-icon name="lucidePieChart" size="xs" />
              </span>
            </div>
            <div class="mt-2.5 flex items-baseline gap-1.5">
              <span
                class="truncate text-xl font-bold tracking-tight text-foreground"
              >
                {{ rep.topCategory?.name || '---' }}
              </span>
            </div>
            <p class="mt-1 truncate text-[11px] text-muted-foreground">
              @if (rep.topCategory) {
                {{ locale.number(rep.topCategory.percentage) }}٪
                {{ 'از کل مخارج' | aioTranslate }}
              } @else {
                {{ 'بدون هزینه' | aioTranslate }}
              }
            </p>
          </div>
        </section>

        <!-- Daily Spending Chart -->
        @if (dailyChart(); as chartOpts) {
          <section
            class="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm backdrop-blur-md sm:p-6"
          >
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold sm:text-base">
                {{ 'روند مخارج روزانه' | aioTranslate }}
              </h2>
              <span class="text-xs text-muted-foreground">
                {{ 'نمودار تغییرات روز به روز' | aioTranslate }}
              </span>
            </div>

            <div class="relative w-full overflow-hidden pt-2">
              <tanstack-chart aioChart [options]="chartOpts" />
            </div>
          </section>
        }

        <!-- Category Breakdown & Top Expenses Grid -->
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <!-- Category Breakdown List with Budget Tracking -->
          <section
            class="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm backdrop-blur-md sm:p-6"
          >
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold sm:text-base">
                {{ 'سهم دسته‌بندی‌ها و بودجه' | aioTranslate }}
              </h2>
              <span class="text-xs text-muted-foreground">
                {{ locale.number(rep.byCategory.length) }}
                {{ 'دسته' | aioTranslate }}
              </span>
            </div>

            @if (rep.byCategory.length === 0) {
              <div
                aioEmptyState
                class="py-6"
                [title]="'داده‌ای وجود ندارد' | aioTranslate"
                [description]="
                  'هیچ هزینه‌ای در این بازه ثبت نشده است.' | aioTranslate
                "
              ></div>
            } @else {
              <div class="flex flex-col gap-4">
                @for (cat of rep.byCategory; track cat.categoryId) {
                  <div
                    class="flex flex-col gap-1.5 rounded-xl border border-border/30 bg-muted/20 p-3"
                  >
                    <div class="flex items-center justify-between">
                      <div class="flex items-center gap-2">
                        <span
                          class="flex size-7 items-center justify-center rounded-lg border text-xs"
                          [ngClass]="getCategoryBadgeClass(cat.color)"
                        >
                          <aio-icon
                            [name]="cat.icon || 'lucideReceipt'"
                            size="xs"
                          />
                        </span>
                        <span class="text-xs font-medium text-foreground">
                          {{ cat.name }}
                        </span>
                      </div>

                      <div class="flex items-center gap-2 text-xs">
                        <span class="font-mono font-semibold">
                          {{ locale.number(cat.amount) }}
                        </span>
                        <span class="text-muted-foreground">{{
                          'تومان' | aioTranslate
                        }}</span>
                        <span
                          class="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {{ locale.number(cat.percentage) }}٪
                        </span>
                      </div>
                    </div>

                    <!-- Progress bar -->
                    <div
                      aioProgress
                      [value]="cat.percentage"
                      class="h-1.5 w-full bg-muted/60"
                    >
                      <div
                        aioProgressIndicator
                        class="rounded-full bg-primary"
                      ></div>
                    </div>

                    <!-- Budget Warning / Indicator if category has monthly budget -->
                    @if (cat.monthlyBudget) {
                      <div
                        class="flex items-center justify-between text-[11px]"
                      >
                        <span class="text-muted-foreground">
                          {{ 'بودجه ماهانه:' | aioTranslate }}
                          {{ locale.number(cat.monthlyBudget) }}
                          {{ 'تومان' | aioTranslate }}
                        </span>

                        @if (
                          cat.budgetUsedPercent !== undefined &&
                          cat.budgetUsedPercent !== null
                        ) {
                          <span
                            class="inline-flex items-center gap-1 font-medium"
                            [class.text-destructive]="
                              cat.budgetUsedPercent > 100
                            "
                            [class.text-muted-foreground]="
                              cat.budgetUsedPercent <= 100
                            "
                          >
                            @if (cat.budgetUsedPercent > 100) {
                              <aio-icon name="lucideAlertTriangle" size="xs" />
                              <span
                                >{{ 'بیشتر از بودجه!' | aioTranslate }} ({{
                                  locale.number(cat.budgetUsedPercent)
                                }}٪)</span
                              >
                            } @else {
                              <span
                                >{{ locale.number(cat.budgetUsedPercent) }}٪
                                {{ 'از بودجه' | aioTranslate }}</span
                              >
                            }
                          </span>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </section>

          <!-- Top Expenses List -->
          <section
            class="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm backdrop-blur-md sm:p-6"
          >
            <div class="flex items-center justify-between">
              <h2 class="text-sm font-semibold sm:text-base">
                {{ 'بزرگ‌ترین مخارج این بازه' | aioTranslate }}
              </h2>
              <span class="text-xs text-muted-foreground">
                {{ '۵ هزینه عمده' | aioTranslate }}
              </span>
            </div>

            @if (rep.biggestExpenses.length === 0) {
              <div
                aioEmptyState
                class="py-6"
                [title]="'داده‌ای وجود ندارد' | aioTranslate"
                [description]="'هیچ هزینه‌ای ثبت نشده است.' | aioTranslate"
              ></div>
            } @else {
              <div class="flex flex-col gap-2.5">
                @for (
                  item of rep.biggestExpenses;
                  track item.id;
                  let idx = $index
                ) {
                  <div
                    class="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-card/40 p-3"
                  >
                    <div class="flex min-w-0 items-center gap-3">
                      <span
                        class="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-xs font-bold text-muted-foreground"
                      >
                        {{ locale.number(idx + 1) }}
                      </span>
                      <div class="flex min-w-0 flex-col">
                        <span
                          class="truncate text-xs font-medium text-foreground"
                        >
                          {{ item.title }}
                        </span>
                        <span class="text-[11px] text-muted-foreground">
                          {{ item.categoryName || ('سایر' | aioTranslate) }} •
                          {{ formatDate(item.date) }}
                        </span>
                      </div>
                    </div>

                    <div class="shrink-0 text-left font-mono">
                      <span class="text-xs font-bold text-foreground">
                        {{ locale.number(item.amount) }}
                      </span>
                      <span class="mr-1 text-[10px] text-muted-foreground">
                        {{ 'تومان' | aioTranslate }}
                      </span>
                    </div>
                  </div>
                }
              </div>
            }
          </section>
        </div>
      }
    </div>
  `,
})
export class ExpensesReportPage implements OnInit {
  protected readonly locale = inject(AioLocale);
  private readonly api = inject(ExpensesApi);
  private readonly notifications = inject(AioNotifications);

  protected readonly preset = signal<ExpenseReportPreset>('this_month');
  protected readonly report = signal<ExpenseReport | null>(null);
  protected readonly loading = signal(false);

  protected readonly dailyChart: Signal<AioChartOptions<
    DailyChartRow,
    string,
    number
  > | null> = computed(() => {
    const rep = this.report();
    if (!rep || rep.dailySeries.length === 0) return null;

    const rows: DailyChartRow[] = rep.dailySeries.map((d) => ({
      date: d.date,
      label: this.locale.date(d.date, { day: 'numeric', month: 'short' }),
      total: d.amount,
    }));

    const maxVal = Math.max(...rows.map((r) => r.total), 1000);

    return {
      ariaLabel: this.locale.text('روند مخارج روزانه'),
      definition: defineChart({
        marks: [
          lineY(rows, { x: 'label', y: 'total' }),
          dot(rows, { x: 'label', y: 'total' }),
        ],
        scales: {
          x: { scale: () => scalePoint<string>().padding(0.4) },
          y: {
            scale: scaleLinear().domain([0, maxVal * 1.15]),
            grid: true,
          },
        },
        tooltip: aioChartTooltip<DailyChartRow, string, number>(),
      }),
      height: 220,
    };
  });

  async ngOnInit(): Promise<void> {
    await this.loadReport();
  }

  setPreset(p: ExpenseReportPreset): void {
    this.preset.set(p);
    void this.loadReport();
  }

  async loadReport(): Promise<void> {
    this.loading.set(true);
    try {
      const data = await this.api.getReport({ preset: this.preset() });
      this.report.set(data);
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  formatDate(iso: string): string {
    return this.locale.date(iso, {
      day: 'numeric',
      month: 'short',
    });
  }

  getCategoryBadgeClass(color?: string | null): string {
    switch (color as ExpenseCategoryColor | undefined) {
      case 'emerald':
        return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
      case 'cyan':
        return 'bg-cyan-500/10 text-cyan-600 border-cyan-500/20';
      case 'blue':
        return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
      case 'amber':
        return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
      case 'rose':
        return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
      case 'violet':
        return 'bg-purple-500/10 text-purple-600 border-purple-500/20';
      case 'slate':
      default:
        return 'bg-slate-500/10 text-slate-600 border-slate-500/20';
    }
  }
}
