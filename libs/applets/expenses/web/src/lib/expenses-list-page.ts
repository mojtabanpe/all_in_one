import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  type ClassifyExpenseResult,
  type ExpenseCategoryColor,
  type ExpenseCategoryItem,
  type ExpenseDecisionSource,
  type ExpenseItem,
  EXPENSE_DECISION_LABELS,
  tehranIsoDate,
} from '@all-in-one/applets/expenses/contracts';
import {
  AioButton,
  AioConfirm,
  AioDateInput,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioEmptyState,
  AioIcon,
  AioInput,
  AioNativeSelect,
  AioNativeSelectOption,
  AioToggleGroup,
  AioToggleGroupItem,
  AioLocale,
  verbatim,
  AioNotifications,
  AioTranslate,
  provideIcons,
} from '@all-in-one/ui';
import { apiErrorMessage } from '@all-in-one/web/shared';
import {
  lucideCar,
  lucideCheck,
  lucideCoffee,
  lucideEdit,
  lucideFilter,
  lucideGift,
  lucideGraduationCap,
  lucideHeartPulse,
  lucideHouse,
  lucideLayers,
  lucidePencil,
  lucidePieChart,
  lucidePlane,
  lucidePlus,
  lucideReceipt,
  lucideSearch,
  lucideShoppingBag,
  lucideSparkles,
  lucideTag,
  lucideTrash2,
  lucideUtensils,
  lucideWallet,
  lucideWandSparkles,
  lucideX,
} from '@ng-icons/lucide';
import { ExpensesApi } from './expenses-api';

interface BatchExpenseDraft {
  title: string;
  amount: number;
}

@Component({
  selector: 'expenses-list-page',
  imports: [
    CommonModule,
    FormsModule,
    AioButton,
    AioIcon,
    AioDialog,
    AioDialogBody,
    AioDialogActions,
    AioDateInput,
    AioEmptyState,
    AioInput,
    AioNativeSelect,
    AioNativeSelectOption,
    AioToggleGroup,
    AioToggleGroupItem,
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
      lucidePlus,
      lucideTrash2,
      lucideEdit,
      lucidePencil,
      lucideSearch,
      lucideFilter,
      lucideLayers,
      lucideTag,
      lucideCheck,
      lucideX,
      lucidePieChart,
      lucideWandSparkles,
    }),
  ],
  template: `
    <div class="flex flex-col gap-6">
      <!-- Quick Add Card -->
      <section
        class="relative overflow-hidden rounded-2xl border border-border/60 bg-card/60 p-5 shadow-sm backdrop-blur-md transition-all sm:p-6"
      >
        <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <span
              class="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary"
            >
              <aio-icon name="lucideReceipt" size="sm" />
            </span>
            <h2 class="text-base font-semibold sm:text-lg">
              {{ 'ثبت هزینه جدید' | aioTranslate }}
            </h2>
          </div>
          <button
            aioBtn
            variant="outline"
            size="sm"
            class="h-9 gap-1.5 text-xs"
            (click)="batchOpen.set(true)"
          >
            <aio-icon name="lucideLayers" size="sm" />
            {{ 'ثبت چندتایی / دسته‌ای' | aioTranslate }}
          </button>
        </div>

        <form (ngSubmit)="submitExpense()" class="flex flex-col gap-4">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <!-- Title -->
            <div class="flex flex-col gap-1.5">
              <span class="text-xs font-medium text-muted-foreground">
                {{ 'عنوان هزینه' | aioTranslate }} *
              </span>
              <input
                type="text"
                [(ngModel)]="newTitle"
                name="title"
                required
                [attr.placeholder]="
                  'مثال: خرید سوپرمارکت، اسنپ، قبض' | aioTranslate
                "
                class="h-11 rounded-xl border border-input bg-background/50 px-3.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <!-- Amount -->
            <div class="flex flex-col gap-1.5">
              <span class="text-xs font-medium text-muted-foreground">
                {{ 'مبلغ (تومان)' | aioTranslate }} *
              </span>
              <input
                type="number"
                min="1"
                step="1"
                [(ngModel)]="newAmount"
                name="amount"
                required
                [attr.placeholder]="'مثال: 120000' | aioTranslate"
                class="h-11 rounded-xl border border-input bg-background/50 px-3.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <!-- Category selection -->
            <div class="flex flex-col gap-1.5">
              <span class="text-xs font-medium text-muted-foreground">
                {{ 'دسته‌بندی' | aioTranslate }}
              </span>
              <select
                [(ngModel)]="newCategoryId"
                name="categoryId"
                class="h-11 rounded-xl border border-input bg-background/50 px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              >
                <option value="">
                  ✨ {{ 'تشخیص خودکار با هوش مصنوعی' | aioTranslate }}
                </option>
                @for (cat of categories(); track cat.id) {
                  <option [value]="cat.id">
                    {{ cat.name }}
                  </option>
                }
              </select>
            </div>

            <!-- Date -->
            <div class="flex flex-col gap-1.5">
              <span class="text-xs font-medium text-muted-foreground">
                {{ 'تاریخ' | aioTranslate }}
              </span>
              <aio-date-input [(value)]="newDate" />
            </div>
          </div>

          <!-- Note & AI Preview Button -->
          <div class="flex flex-col gap-3 pt-1 md:flex-row md:items-center">
            <input
              aioInput
              type="text"
              [(ngModel)]="newNote"
              name="note"
              [attr.aria-label]="'یادداشت اختیاری' | aioTranslate"
              [attr.placeholder]="'یادداشت اختیاری' | aioTranslate"
              class="w-full min-w-0 md:flex-1"
            />
            <div
              class="grid grid-cols-1 gap-2 sm:grid-cols-2 md:flex md:shrink-0"
            >
              <button
                aioBtn
                type="button"
                variant="outline"
                class="h-11 min-w-0 gap-1.5"
                [disabled]="!newTitle().trim() || classifying()"
                (click)="askAiCategory()"
              >
                <aio-icon name="lucideSparkles" size="sm" />
                <span class="truncate">{{
                  (classifying() ? 'در حال بررسی...' : 'پیشنهاد هوش مصنوعی')
                    | aioTranslate
                }}</span>
              </button>
              <button
                aioBtn
                type="submit"
                class="h-11 min-w-0 gap-2 font-semibold"
                [disabled]="saving() || !newTitle().trim() || !newAmount()"
              >
                <aio-icon name="lucidePlus" size="sm" />
                {{ (saving() ? 'در حال ثبت...' : 'ثبت هزینه') | aioTranslate }}
              </button>
            </div>
          </div>

          <!-- AI Classification Preview Pill -->
          @if (aiPreview(); as preview) {
            <div
              class="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs text-primary transition-all"
            >
              <div class="flex items-center gap-2">
                <aio-icon name="lucideWandSparkles" size="sm" />
                <span class="font-medium">
                  {{ 'پیشنهاد هوش مصنوعی:' | aioTranslate }}
                  <strong>{{ preview.categoryName }}</strong>
                </span>
                <span class="text-muted-foreground"
                  >({{ decisionLabel(preview.decidedBy) }})</span
                >
              </div>
              <button
                aioBtn
                type="button"
                variant="outline"
                size="sm"
                class="h-7 text-xs"
                (click)="applyAiSuggestion(preview)"
              >
                {{ 'انتخاب این دسته' | aioTranslate }}
              </button>
            </div>
          }
        </form>
      </section>

      <!-- Filter Bar -->
      <section
        class="flex flex-col gap-3 rounded-2xl border border-border/40 bg-card/40 p-3.5 backdrop-blur-sm"
      >
        <!-- Range presets -->
        <div
          aioToggleGroup
          type="single"
          variant="outline"
          class="w-full"
          [attr.aria-label]="'بازهٔ هزینه‌ها' | aioTranslate"
          [value]="filterPreset()"
          (valueChange)="onPresetChange($event)"
        >
          @for (preset of presets; track preset.value) {
            <button
              aioToggleGroupItem
              [value]="preset.value"
              class="h-11 min-w-0 flex-1 px-2 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
            >
              {{ preset.label | aioTranslate }}
            </button>
          }
        </div>

        <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div class="min-w-0">
            <label class="sr-only" for="expense-filter-category">
              {{ 'فیلتر دسته' | aioTranslate }}
            </label>
            <aio-native-select
              selectId="expense-filter-category"
              [value]="filterCategoryId()"
              (valueChange)="onCategoryFilterChange($event)"
            >
              <option aioNativeSelectOption value="">
                {{ 'همه دسته‌ها' | aioTranslate }}
              </option>
              @for (cat of categories(); track cat.id) {
                <option aioNativeSelectOption [value]="cat.id">
                  {{ cat.name }}
                </option>
              }
            </aio-native-select>
          </div>

          <div class="relative min-w-0">
            <input
              aioInput
              type="search"
              [ngModel]="searchQuery()"
              (ngModelChange)="searchQuery.set($event); onSearchChange()"
              [attr.aria-label]="'جستجو در هزینه‌ها' | aioTranslate"
              [attr.placeholder]="'جستجو در هزینه‌ها' | aioTranslate"
              class="w-full ps-10"
            />
            <span
              class="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <aio-icon name="lucideSearch" size="sm" />
            </span>
          </div>
        </div>
      </section>

      <!-- Period Summary Stats -->
      <div
        class="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground"
      >
        <span>
          {{ 'تعداد کل:' | aioTranslate }}
          <strong class="text-foreground">{{
            locale.number(expenses().length)
          }}</strong>
          {{ 'هزینه' | aioTranslate }}
        </span>
        <span>
          {{ 'مجموع هزینه‌های نمایش‌داده‌شده:' | aioTranslate }}
          <strong class="text-sm font-semibold text-primary">
            {{ locale.number(totalAmount()) }}
          </strong>
          {{ 'تومان' | aioTranslate }}
        </span>
      </div>

      <!-- Expenses List -->
      <section class="flex flex-col gap-3">
        @if (loading()) {
          <div class="flex flex-col gap-2.5 py-6">
            @for (i of [1, 2, 3, 4]; track i) {
              <div
                class="h-16 w-full animate-pulse rounded-2xl border border-border/40 bg-card/30"
              ></div>
            }
          </div>
        } @else if (expenses().length === 0) {
          <div
            aioEmptyState
            class="py-12"
            [title]="'هیچ هزینه‌ای یافت نشد' | aioTranslate"
            [description]="
              'می‌توانید هزینه جدیدی ثبت کنید یا فیلترها را تغییر دهید.'
                | aioTranslate
            "
          ></div>
        } @else {
          <div class="grid grid-cols-1 gap-2.5">
            @for (item of expenses(); track item.id) {
              <div
                class="group relative flex flex-col gap-2.5 rounded-2xl border border-border/50 bg-card/50 p-4 shadow-sm backdrop-blur-sm transition-all hover:border-primary/30 hover:bg-card/80 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <!-- Category Icon & Details -->
                <div class="flex min-w-0 flex-1 items-center gap-3.5">
                  <span
                    class="flex size-11 shrink-0 items-center justify-center rounded-xl border text-base transition-transform group-hover:scale-105"
                    [ngClass]="getCategoryBadgeClass(item.categoryColor)"
                  >
                    <aio-icon
                      [name]="item.categoryIcon || 'lucideReceipt'"
                      size="sm"
                    />
                  </span>

                  <div class="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div class="flex min-w-0 items-center gap-2">
                      <h3 class="truncate text-sm font-medium text-foreground">
                        {{ item.title }}
                      </h3>
                      <!-- AI badge if classified by AI -->
                      @if (item.decidedBy && item.decidedBy !== 'user') {
                        <span
                          class="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary"
                          [title]="decisionLabel(item.decidedBy)"
                        >
                          <aio-icon name="lucideSparkles" size="xs" />
                          <span>{{ 'هوش مصنوعی' | aioTranslate }}</span>
                        </span>
                      }
                    </div>

                    <div
                      class="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground"
                    >
                      <span class="font-medium text-foreground/80">
                        {{ item.categoryName || ('سایر' | aioTranslate) }}
                      </span>
                      <span aria-hidden="true">،</span>
                      <span>{{ formatDate(item.date) }}</span>
                      @if (item.note) {
                        <span aria-hidden="true">،</span>
                        <span class="max-w-[180px] truncate sm:max-w-xs">
                          {{ item.note }}
                        </span>
                      }
                    </div>
                  </div>
                </div>

                <!-- Amount & Actions -->
                <div
                  class="flex items-center justify-between gap-3 border-t border-border/40 pt-2.5 sm:shrink-0 sm:justify-end sm:border-t-0 sm:pt-0"
                >
                  <div class="tabular-nums">
                    <span class="text-base font-bold text-foreground">
                      {{ locale.number(item.amount) }}
                    </span>
                    <span class="ms-1 text-xs text-muted-foreground">
                      {{ 'تومان' | aioTranslate }}
                    </span>
                  </div>

                  <div class="flex items-center gap-1">
                    <button
                      aioBtn
                      variant="ghost"
                      size="icon"
                      class="size-11 text-muted-foreground hover:text-foreground sm:size-9"
                      (click)="openEdit(item)"
                      [attr.aria-label]="'ویرایش' | aioTranslate"
                    >
                      <aio-icon name="lucidePencil" size="xs" />
                    </button>
                    <button
                      aioBtn
                      variant="ghost"
                      size="icon"
                      class="size-11 text-muted-foreground hover:text-destructive sm:size-9"
                      (click)="deleteExpense(item)"
                      [attr.aria-label]="'حذف' | aioTranslate"
                    >
                      <aio-icon name="lucideTrash2" size="xs" />
                    </button>
                  </div>
                </div>
              </div>
            }
          </div>
        }
      </section>

      <!-- Batch Add Dialog -->
      <aio-dialog
        [(open)]="batchOpen"
        [title]="'ثبت دسته‌ای مخارج' | aioTranslate"
        contentClass="applet-expenses sm:max-w-lg"
      >
        <ng-template aioDialogBody>
          <div class="flex flex-col gap-4 py-1 text-sm">
            <p class="text-xs text-muted-foreground leading-relaxed">
              {{
                'در هر سطر، عنوان هزینه و مبلغ آن را بنویسید (با دو نقطه یا فاصله). هوش مصنوعی به‌طور خودکار دستهٔ هر هزینه را تشخیص می‌دهد.'
                  | aioTranslate
              }}
            </p>
            <div
              class="rounded-xl bg-muted/40 p-2.5 text-[11px] font-mono text-muted-foreground"
            >
              {{ 'خرید میوه: 180000' | aioTranslate }}<br />
              {{ 'اسنپ رفت و برگشت: 65000' | aioTranslate }}<br />
              {{ 'قبض اینترنت: 120000' | aioTranslate }}
            </div>
            <textarea
              [(ngModel)]="batchText"
              rows="6"
              [attr.placeholder]="batchExample()"
              class="w-full rounded-xl border border-input bg-background/60 p-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            ></textarea>

            <div class="flex flex-col gap-1.5">
              <span class="text-xs font-medium text-muted-foreground">
                {{ 'تاریخ این هزینه‌ها' | aioTranslate }}
              </span>
              <aio-date-input [(value)]="batchDate" />
            </div>
          </div>
        </ng-template>

        <ng-template aioDialogActions>
          <button
            aioBtn
            type="button"
            variant="ghost"
            (click)="batchOpen.set(false)"
          >
            {{ 'انصراف' | aioTranslate }}
          </button>
          <button
            aioBtn
            type="button"
            variant="default"
            [disabled]="batchSaving() || !batchText().trim()"
            (click)="submitBatch()"
          >
            {{
              (batchSaving() ? 'در حال ثبت...' : 'ثبت دسته‌ای') | aioTranslate
            }}
          </button>
        </ng-template>
      </aio-dialog>

      <!-- Edit Dialog -->
      <aio-dialog
        [(open)]="editOpen"
        [title]="'ویرایش هزینه' | aioTranslate"
        contentClass="applet-expenses sm:max-w-md"
      >
        <ng-template aioDialogBody>
          @if (editingExpense(); as exp) {
            <div class="flex flex-col gap-3 py-2 text-sm">
              <div class="flex flex-col gap-1">
                <span class="text-xs font-medium text-muted-foreground">
                  {{ 'عنوان' | aioTranslate }}
                </span>
                <input
                  type="text"
                  [(ngModel)]="editTitle"
                  class="h-10 rounded-xl border border-input bg-background/50 px-3 text-sm outline-none focus:border-primary"
                />
              </div>

              <div class="flex flex-col gap-1">
                <span class="text-xs font-medium text-muted-foreground">
                  {{ 'مبلغ (تومان)' | aioTranslate }}
                </span>
                <input
                  type="number"
                  min="1"
                  [(ngModel)]="editAmount"
                  class="h-10 rounded-xl border border-input bg-background/50 px-3 text-sm outline-none focus:border-primary"
                />
              </div>

              <div class="flex flex-col gap-1">
                <span class="text-xs font-medium text-muted-foreground">
                  {{ 'دسته‌بندی' | aioTranslate }}
                </span>
                <select
                  [(ngModel)]="editCategoryId"
                  class="h-10 rounded-xl border border-input bg-background/50 px-2.5 text-sm outline-none focus:border-primary"
                >
                  @for (cat of categories(); track cat.id) {
                    <option [value]="cat.id">{{ cat.name }}</option>
                  }
                </select>
              </div>

              <div class="flex flex-col gap-1">
                <span class="text-xs font-medium text-muted-foreground">
                  {{ 'تاریخ' | aioTranslate }}
                </span>
                <aio-date-input [(value)]="editDate" />
              </div>

              <div class="flex flex-col gap-1">
                <span class="text-xs font-medium text-muted-foreground">
                  {{ 'یادداشت' | aioTranslate }}
                </span>
                <input
                  type="text"
                  [(ngModel)]="editNote"
                  class="h-10 rounded-xl border border-input bg-background/50 px-3 text-sm outline-none focus:border-primary"
                />
              </div>
            </div>
          }
        </ng-template>

        <ng-template aioDialogActions>
          <button
            aioBtn
            type="button"
            variant="ghost"
            (click)="editOpen.set(false)"
          >
            {{ 'انصراف' | aioTranslate }}
          </button>
          <button
            aioBtn
            type="button"
            variant="default"
            [disabled]="editSaving() || !editTitle().trim() || !editAmount()"
            (click)="submitEdit()"
          >
            {{
              (editSaving() ? 'در حال ذخیره...' : 'ذخیره تغییرات')
                | aioTranslate
            }}
          </button>
        </ng-template>
      </aio-dialog>
    </div>
  `,
})
export class ExpensesListPage implements OnInit {
  protected readonly locale = inject(AioLocale);
  private readonly api = inject(ExpensesApi);
  private readonly notifications = inject(AioNotifications);
  private readonly confirm = inject(AioConfirm);

  protected readonly categories = signal<ExpenseCategoryItem[]>([]);
  protected readonly expenses = signal<ExpenseItem[]>([]);
  protected readonly loading = signal(false);

  // Form signals
  protected readonly newTitle = signal('');
  protected readonly newAmount = signal<number | null>(null);
  protected readonly newCategoryId = signal('');
  protected readonly newDate = signal(tehranIsoDate());
  protected readonly newNote = signal('');
  protected readonly saving = signal(false);

  // AI Classification Preview
  protected readonly classifying = signal(false);
  protected readonly aiPreview = signal<ClassifyExpenseResult | null>(null);

  // Filters
  protected readonly filterPreset = signal<
    'all' | 'today' | 'last7day' | 'this_month'
  >('this_month');
  protected readonly presets = [
    { value: 'all', label: 'همه' },
    { value: 'today', label: 'امروز' },
    { value: 'last7day', label: '۷ روز اخیر' },
    { value: 'this_month', label: 'این ماه' },
  ] as const;
  protected readonly filterCategoryId = signal('');
  protected readonly searchQuery = signal('');

  // Batch dialog
  protected readonly batchOpen = signal(false);
  protected readonly batchText = signal('');
  protected readonly batchDate = signal(tehranIsoDate());
  protected readonly batchSaving = signal(false);

  // Edit dialog
  protected readonly editOpen = signal(false);
  protected readonly editingExpense = signal<ExpenseItem | null>(null);
  protected readonly editTitle = signal('');
  protected readonly editAmount = signal<number | null>(null);
  protected readonly editCategoryId = signal('');
  protected readonly editDate = signal('');
  protected readonly editNote = signal('');
  protected readonly editSaving = signal(false);

  protected readonly totalAmount = computed(() =>
    this.expenses().reduce((sum, item) => sum + item.amount, 0),
  );

  async ngOnInit(): Promise<void> {
    await this.loadCategories();
    await this.loadExpenses();
  }

  async loadCategories(): Promise<void> {
    try {
      const cats = await this.api.listCategories();
      this.categories.set(cats);
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    }
  }

  async loadExpenses(): Promise<void> {
    this.loading.set(true);
    try {
      const preset = this.filterPreset();
      const query = {
        preset: preset === 'all' ? undefined : preset,
        categoryId: this.filterCategoryId() || undefined,
        search: this.searchQuery().trim() || undefined,
      };
      const list = await this.api.list(query);
      this.expenses.set(list);
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  setPreset(preset: 'all' | 'today' | 'last7day' | 'this_month'): void {
    this.filterPreset.set(preset);
    void this.loadExpenses();
  }

  protected onPresetChange(value: unknown): void {
    const preset = this.presets.find((p) => p.value === value);
    if (preset) this.setPreset(preset.value);
  }

  protected onCategoryFilterChange(value: string): void {
    this.filterCategoryId.set(value);
    void this.loadExpenses();
  }

  onSearchChange(): void {
    void this.loadExpenses();
  }

  async askAiCategory(): Promise<void> {
    const title = this.newTitle().trim();
    if (!title) return;
    this.classifying.set(true);
    try {
      const res = await this.api.classify({
        title,
        note: this.newNote().trim() || undefined,
      });
      this.aiPreview.set(res);
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.classifying.set(false);
    }
  }

  applyAiSuggestion(res: ClassifyExpenseResult): void {
    this.newCategoryId.set(res.categoryId);
    this.notifications.success(
      this.locale.text('دسته «{0}» انتخاب شد', [verbatim(res.categoryName)]),
    );
    this.aiPreview.set(null);
  }

  async submitExpense(): Promise<void> {
    const title = this.newTitle().trim();
    const amount = Number(this.newAmount());
    if (!title || !amount || amount <= 0) return;

    this.saving.set(true);
    try {
      const item = await this.api.create({
        title,
        amount,
        categoryId: this.newCategoryId() || undefined,
        date: this.newDate() || undefined,
        note: this.newNote().trim() || undefined,
      });

      this.notifications.success(
        this.locale.text('هزینه «{0}» ({1} تومان) ثبت شد', [
          verbatim(item.title),
          this.locale.number(item.amount),
        ]),
      );
      // Reset form
      this.newTitle.set('');
      this.newAmount.set(null);
      this.newCategoryId.set('');
      this.newNote.set('');
      this.aiPreview.set(null);

      await this.loadExpenses();
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  async submitBatch(): Promise<void> {
    const raw = this.batchText().trim();
    if (!raw) return;

    // Parse lines: e.g. "میوه: 150000" or "تاکسی 50000"
    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const drafts: BatchExpenseDraft[] = [];

    for (const line of lines) {
      // Look for colon or last number
      const colonMatch = line.match(/^([^:]+):\s*([0-9\u06F0-\u06F9]+)/);
      if (colonMatch) {
        drafts.push({
          title: colonMatch[1].trim(),
          amount: parseInt(colonMatch[2], 10),
        });
        continue;
      }
      const match = line.match(/^(.*?)\s+([0-9\u06F0-\u06F9]+)$/);
      if (match) {
        drafts.push({
          title: match[1].trim(),
          amount: parseInt(match[2], 10),
        });
      }
    }

    if (drafts.length === 0) {
      this.notifications.error('فرمت سطرها صحیح نیست. مثال: «خرید نان: 15000»');
      return;
    }

    this.batchSaving.set(true);
    try {
      const created = await this.api.createBatch({
        expenses: drafts.map((d) => ({
          title: d.title,
          amount: d.amount,
          date: this.batchDate() || undefined,
        })),
      });

      this.notifications.success(
        this.locale.text('{0} هزینه با موفقیت ثبت شد', [
          this.locale.number(created.length),
        ]),
      );
      this.batchText.set('');
      this.batchOpen.set(false);
      await this.loadExpenses();
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.batchSaving.set(false);
    }
  }

  openEdit(item: ExpenseItem): void {
    this.editingExpense.set(item);
    this.editTitle.set(item.title);
    this.editAmount.set(item.amount);
    this.editCategoryId.set(item.categoryId);
    this.editDate.set(item.date);
    this.editNote.set(item.note || '');
    this.editOpen.set(true);
  }

  async submitEdit(): Promise<void> {
    const exp = this.editingExpense();
    if (!exp) return;
    const title = this.editTitle().trim();
    const amount = Number(this.editAmount());
    if (!title || !amount) return;

    this.editSaving.set(true);
    try {
      await this.api.update(exp.id, {
        title,
        amount,
        categoryId: this.editCategoryId() || undefined,
        date: this.editDate() || undefined,
        note: this.editNote().trim() || undefined,
      });

      this.notifications.success('تغییرات با موفقیت ذخیره شد');
      this.editOpen.set(false);
      await this.loadExpenses();
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.editSaving.set(false);
    }
  }

  async deleteExpense(item: ExpenseItem): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'حذف این هزینه؟',
      description: this.locale.text('«{0}» به مبلغ {1} تومان حذف خواهد شد.', [
        verbatim(item.title),
        this.locale.number(item.amount),
      ]),
      confirmText: 'حذف هزینه',
      destructive: true,
    });
    if (!ok) return;

    try {
      await this.api.delete(item.id);
      this.notifications.success('هزینه حذف شد');
      await this.loadExpenses();
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    }
  }

  formatDate(iso: string): string {
    return this.locale.date(iso, {
      day: 'numeric',
      month: 'short',
    });
  }

  decisionLabel(source: string | null | undefined): string {
    if (!source) return this.locale.text('انتخاب شده');
    return this.locale.text(
      EXPENSE_DECISION_LABELS[source as ExpenseDecisionSource] ||
        'تشخیص هوش مصنوعی',
    );
  }

  /** Two example lines for the batch box, in the app language. */
  protected batchExample(): string {
    return ['مثال:', 'شام رستوران: 350000', 'کرایه تاکسی: 40000']
      .map((line) => this.locale.text(line))
      .join('\n');
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
