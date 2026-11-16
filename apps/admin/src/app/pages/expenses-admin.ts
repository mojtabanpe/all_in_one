import { CommonModule } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  type AdminExpensesOverview,
  type DefaultExpenseCategoryItem,
  type ExpenseCategoryColor,
  type ExpenseCategoryIcon,
  EXPENSE_CATEGORY_COLOR_LABELS,
  EXPENSE_CATEGORY_COLORS,
  EXPENSE_CATEGORY_ICON_LABELS,
  EXPENSE_CATEGORY_ICONS,
} from '@all-in-one/applets/expenses/contracts';
import { ExpensesApi } from '@all-in-one/applets/expenses/web';
import {
  AioButton,
  AioCardDirectives,
  AioCardHeading,
  AioConfirm,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioEmptyState,
  AioIcon,
  AioInput,
  AioLocale,
  AioMetric,
  AioNotifications,
  AioTranslate,
  provideIcons,
} from '@all-in-one/ui';
import { apiErrorMessage } from '@all-in-one/web/shared';
import {
  lucideCar,
  lucideCoffee,
  lucideGift,
  lucideGraduationCap,
  lucideHeartPulse,
  lucideHouse,
  lucidePencil,
  lucidePieChart,
  lucidePlane,
  lucidePlus,
  lucideReceipt,
  lucideRefreshCw,
  lucideShoppingBag,
  lucideSparkles,
  lucideTag,
  lucideTrash2,
  lucideUsers,
  lucideUtensils,
  lucideWallet,
} from '@ng-icons/lucide';

@Component({
  selector: 'admin-expenses',
  imports: [
    CommonModule,
    FormsModule,
    AioButton,
    AioCardDirectives,
    AioCardHeading,
    AioDialog,
    AioDialogBody,
    AioDialogActions,
    AioEmptyState,
    AioIcon,
    AioInput,
    AioMetric,
    AioTranslate,
  ],
  providers: [
    provideIcons({
      lucideUsers,
      lucideWallet,
      lucideSparkles,
      lucideTag,
      lucidePlus,
      lucidePencil,
      lucideTrash2,
      lucideRefreshCw,
      lucideUtensils,
      lucideCar,
      lucideReceipt,
      lucideShoppingBag,
      lucideHeartPulse,
      lucideGraduationCap,
      lucideHouse,
      lucideGift,
      lucideCoffee,
      lucidePlane,
      lucidePieChart,
    }),
  ],
  template: `
    <div class="flex flex-col gap-6">
      <header class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-bold">
            {{ 'مدیریت مخارج و دسته‌بندی‌های پیش‌فرض' | aioTranslate }}
          </h1>
          <p class="mt-1 text-sm text-muted-foreground">
            {{
              'آمار استفادهٔ کاربران از بخش مخارج و تنظیم دسته‌بندی‌های پیش‌فرض برای کاربران جدید'
                | aioTranslate
            }}
          </p>
        </div>

        <button
          aioBtn
          type="button"
          variant="outline"
          class="h-10 gap-2"
          [disabled]="loadingOverview() || loadingCategories()"
          (click)="reloadAll()"
        >
          <aio-icon name="lucideRefreshCw" size="sm" />
          {{ 'بروزرسانی' | aioTranslate }}
        </button>
      </header>

      <!-- Overview Metrics -->
      <section class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div aioCard class="p-4">
          <div
            aioMetric
            [label]="'کاربران فعال (۷ / ۳۰ روز اخیر)' | aioTranslate"
            [value]="
              overview()
                ? locale.number(overview()!.activeUsersLast7Days) +
                  ' / ' +
                  locale.number(overview()!.activeUsersLast30Days)
                : '—'
            "
            [loading]="loadingOverview() && !overview()"
          ></div>
          <p class="mt-2 text-xs text-muted-foreground">
            {{
              'کل کاربران دارای هزینه: {0} نفر (دارای دسته: {1} نفر)'
                | aioTranslate
                  : [
                      locale.number(overview()?.totalUsersWithExpenses ?? 0),
                      locale.number(overview()?.totalUsersWithCategories ?? 0),
                    ]
            }}
          </p>
        </div>

        <div aioCard class="p-4">
          <div
            aioMetric
            [label]="'کل تراکنش‌های ثبت‌شده' | aioTranslate"
            [value]="
              overview() ? locale.number(overview()!.totalExpensesCount) : '—'
            "
            [loading]="loadingOverview() && !overview()"
          ></div>
          <p class="mt-2 text-xs text-muted-foreground">
            {{
              '۳۰ روز اخیر: {0} هزینه'
                | aioTranslate
                  : [locale.number(overview()?.expensesLast30DaysCount ?? 0)]
            }}
          </p>
        </div>

        <div aioCard class="p-4">
          <div
            aioMetric
            [label]="'مجموع کل مخارج ثبت‌شده' | aioTranslate"
            [value]="
              overview()
                ? locale.number(overview()!.totalAmount) +
                  ' ' +
                  ('تومان' | aioTranslate)
                : '—'
            "
            [loading]="loadingOverview() && !overview()"
          ></div>
          <p class="mt-2 text-xs text-muted-foreground">
            {{
              'تعداد دسته‌بندی‌های شخصی کاربران: {0}'
                | aioTranslate
                  : [locale.number(overview()?.totalCategoriesCount ?? 0)]
            }}
          </p>
        </div>

        <div aioCard class="p-4">
          <div
            aioMetric
            [label]="'دسته‌بندی خودکار هوش مصنوعی' | aioTranslate"
            [value]="
              overview()
                ? locale.number(overview()!.aiDecidedCount) +
                  ' (' +
                  locale.number(aiPercent()) +
                  '٪)'
                : '—'
            "
            [loading]="loadingOverview() && !overview()"
          ></div>
          <p class="mt-2 text-xs text-muted-foreground">
            {{
              'دسته‌بندی‌های پیش‌فرض فعال: {0} مورد'
                | aioTranslate
                  : [locale.number(overview()?.defaultCategoriesCount ?? 0)]
            }}
          </p>
        </div>
      </section>

      <!-- Default Categories Section -->
      <section aioCard>
        <div
          aioCardHeading
          [title]="'دسته‌بندی‌های پیش‌فرض' | aioTranslate"
          [level]="2"
          [description]="
            'این دسته‌بندی‌ها هنگام اولین ورود کاربر به بخش مخارج برای او کپی می‌شوند و تغییر آن‌ها روی دسته‌های شخصی کاربران فعلی اثری ندارد.'
              | aioTranslate
          "
        >
          <button
            aioBtn
            type="button"
            variant="default"
            class="h-10 gap-2"
            (click)="openCreate()"
          >
            <aio-icon name="lucidePlus" size="sm" />
            {{ 'افزودن دسته پیش‌فرض' | aioTranslate }}
          </button>
        </div>

        <div aioCardContent>
          @if (loadingCategories()) {
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              @for (i of [1, 2, 3, 4, 5, 6]; track i) {
                <div
                  class="h-32 animate-pulse rounded-2xl border border-border/40 bg-card/30"
                ></div>
              }
            </div>
          } @else if (categories().length === 0) {
            <div
              aioEmptyState
              class="py-10"
              [title]="'دسته‌بندی پیش‌فرضی وجود ندارد' | aioTranslate"
              [description]="
                'یک دستهٔ پیش‌فرض برای کاربران جدید اضافه کنید.' | aioTranslate
              "
            ></div>
          } @else {
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              @for (cat of categories(); track cat.id) {
                <div
                  class="flex flex-col justify-between gap-3 rounded-2xl border border-border/60 bg-card/60 p-4 shadow-sm"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-center gap-3">
                      <span
                        class="flex size-10 items-center justify-center rounded-xl border"
                        [ngClass]="getCategoryBadgeClass(cat.color)"
                      >
                        <aio-icon
                          [name]="cat.icon || 'lucideWallet'"
                          size="sm"
                        />
                      </span>
                      <div class="flex flex-col">
                        <h3 class="text-sm font-semibold text-foreground">
                          {{ cat.name }}
                        </h3>
                        <span
                          class="font-mono text-[11px] text-muted-foreground"
                        >
                          {{ cat.slug || '—' }} · #{{
                            locale.number(cat.sortOrder)
                          }}
                        </span>
                      </div>
                    </div>

                    <div class="flex items-center gap-1">
                      <button
                        aioBtn
                        variant="ghost"
                        size="icon"
                        class="size-8 text-muted-foreground hover:text-foreground"
                        (click)="openEdit(cat)"
                        [attr.aria-label]="'ویرایش دسته پیش‌فرض' | aioTranslate"
                      >
                        <aio-icon name="lucidePencil" size="xs" />
                      </button>
                      <button
                        aioBtn
                        variant="ghost"
                        size="icon"
                        class="size-8 text-muted-foreground hover:text-destructive"
                        (click)="deleteCategory(cat)"
                        [attr.aria-label]="'حذف دسته پیش‌فرض' | aioTranslate"
                      >
                        <aio-icon name="lucideTrash2" size="xs" />
                      </button>
                    </div>
                  </div>

                  @if (cat.keywords) {
                    <p
                      class="line-clamp-2 rounded-xl bg-muted/30 p-2 text-xs text-muted-foreground"
                    >
                      <span class="font-medium text-foreground/80">{{
                        'کلیدواژه‌ها:' | aioTranslate
                      }}</span>
                      {{ cat.keywords }}
                    </p>
                  }
                </div>
              }
            </div>
          }
        </div>
      </section>
    </div>

    <!-- Create/Edit Default Category Dialog -->
    <aio-dialog
      [open]="dialogOpen()"
      (openChange)="dialogOpen.set($event)"
      [title]="
        (editingId() ? 'ویرایش دسته پیش‌فرض' : 'افزودن دسته پیش‌فرض')
          | aioTranslate
      "
      contentClass="max-w-lg"
    >
      <ng-template aioDialogBody>
        <div class="flex flex-col gap-4">
          <label class="flex flex-col gap-1.5 text-sm">
            <span class="font-medium">{{ 'نام دسته' | aioTranslate }}</span>
            <input
              aioInput
              type="text"
              [ngModel]="formName()"
              (ngModelChange)="formName.set($event)"
              [placeholder]="'مثلاً: خوراک و رستوران' | aioTranslate"
            />
          </label>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label class="flex flex-col gap-1.5 text-sm">
              <span class="font-medium">{{
                'شناسه (Slug - اختیاری)' | aioTranslate
              }}</span>
              <input
                aioInput
                type="text"
                dir="ltr"
                [ngModel]="formSlug()"
                (ngModelChange)="formSlug.set($event)"
                placeholder="food"
              />
            </label>

            <label class="flex flex-col gap-1.5 text-sm">
              <span class="font-medium">{{
                'ترتیب نمایش' | aioTranslate
              }}</span>
              <input
                aioInput
                type="number"
                dir="ltr"
                min="0"
                max="1000"
                [ngModel]="formSortOrder()"
                (ngModelChange)="formSortOrder.set($event)"
              />
            </label>
          </div>

          <div class="flex flex-col gap-2">
            <span class="text-sm font-medium">{{ 'رنگ' | aioTranslate }}</span>
            <div class="flex flex-wrap gap-2">
              @for (c of colorOptions; track c) {
                <button
                  type="button"
                  class="flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs transition"
                  [ngClass]="
                    formColor() === c
                      ? 'border-primary bg-primary/10 font-semibold text-foreground'
                      : 'border-border/60 text-muted-foreground hover:border-border'
                  "
                  (click)="formColor.set(c)"
                >
                  <span
                    class="size-2.5 rounded-full"
                    [ngClass]="getColorDotClass(c)"
                  ></span>
                  {{ colorLabels[c] | aioTranslate }}
                </button>
              }
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <span class="text-sm font-medium">{{
              'آیکون' | aioTranslate
            }}</span>
            <div class="grid grid-cols-4 gap-2 sm:grid-cols-6">
              @for (ic of iconOptions; track ic) {
                <button
                  type="button"
                  class="flex flex-col items-center gap-1 rounded-xl border p-2 text-[11px] transition"
                  [ngClass]="
                    formIcon() === ic
                      ? 'border-primary bg-primary/10 font-semibold text-foreground'
                      : 'border-border/60 text-muted-foreground hover:border-border'
                  "
                  (click)="formIcon.set(ic)"
                >
                  <aio-icon [name]="ic" size="sm" />
                  <span class="truncate">{{
                    iconLabels[ic] | aioTranslate
                  }}</span>
                </button>
              }
            </div>
          </div>

          <label class="flex flex-col gap-1.5 text-sm">
            <span class="font-medium">{{
              'کلیدواژه‌های راهنمای هوش مصنوعی' | aioTranslate
            }}</span>
            <textarea
              aioInput
              rows="3"
              class="min-h-20 resize-y py-2"
              [ngModel]="formKeywords()"
              (ngModelChange)="formKeywords.set($event)"
              [placeholder]="
                'مثلاً: ناهار، شام، سوپرمارکت، اسنپ‌فود' | aioTranslate
              "
            ></textarea>
          </label>
        </div>
      </ng-template>

      <ng-template aioDialogActions>
        <div class="flex items-center justify-end gap-2">
          <button
            aioBtn
            type="button"
            variant="ghost"
            (click)="dialogOpen.set(false)"
          >
            {{ 'انصراف' | aioTranslate }}
          </button>
          <button
            aioBtn
            type="button"
            variant="default"
            [disabled]="saving()"
            (click)="saveCategory()"
          >
            {{ (editingId() ? 'ذخیره تغییرات' : 'ایجاد دسته') | aioTranslate }}
          </button>
        </div>
      </ng-template>
    </aio-dialog>
  `,
})
export class ExpensesAdminPage implements OnInit {
  private readonly api = inject(ExpensesApi);
  private readonly notifications = inject(AioNotifications);
  private readonly confirm = inject(AioConfirm);
  protected readonly locale = inject(AioLocale);

  protected readonly overview = signal<AdminExpensesOverview | null>(null);
  protected readonly categories = signal<DefaultExpenseCategoryItem[]>([]);
  protected readonly loadingOverview = signal(true);
  protected readonly loadingCategories = signal(true);

  protected readonly aiPercent = computed(() => {
    const ov = this.overview();
    if (!ov || !ov.totalExpensesCount) return 0;
    return Math.round((ov.aiDecidedCount / ov.totalExpensesCount) * 100);
  });

  protected readonly dialogOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly formName = signal('');
  protected readonly formSlug = signal('');
  protected readonly formColor = signal<ExpenseCategoryColor>('emerald');
  protected readonly formIcon = signal<ExpenseCategoryIcon>('lucideWallet');
  protected readonly formKeywords = signal('');
  protected readonly formSortOrder = signal(0);

  protected readonly colorOptions = EXPENSE_CATEGORY_COLORS;
  protected readonly colorLabels = EXPENSE_CATEGORY_COLOR_LABELS;
  protected readonly iconOptions = EXPENSE_CATEGORY_ICONS;
  protected readonly iconLabels = EXPENSE_CATEGORY_ICON_LABELS;

  ngOnInit() {
    void this.reloadAll();
  }

  protected async reloadAll() {
    await Promise.all([this.loadOverview(), this.loadCategories()]);
  }

  private async loadOverview() {
    this.loadingOverview.set(true);
    try {
      this.overview.set(await this.api.getAdminOverview());
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.loadingOverview.set(false);
    }
  }

  private async loadCategories() {
    this.loadingCategories.set(true);
    try {
      this.categories.set(await this.api.listDefaultCategories());
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.loadingCategories.set(false);
    }
  }

  protected openCreate() {
    this.editingId.set(null);
    this.formName.set('');
    this.formSlug.set('');
    this.formColor.set('emerald');
    this.formIcon.set('lucideWallet');
    this.formKeywords.set('');
    this.formSortOrder.set(this.categories().length);
    this.dialogOpen.set(true);
  }

  protected openEdit(cat: DefaultExpenseCategoryItem) {
    this.editingId.set(cat.id);
    this.formName.set(cat.name);
    this.formSlug.set(cat.slug ?? '');
    this.formColor.set(cat.color);
    this.formIcon.set(cat.icon);
    this.formKeywords.set(cat.keywords ?? '');
    this.formSortOrder.set(cat.sortOrder);
    this.dialogOpen.set(true);
  }

  protected async saveCategory() {
    const name = this.formName().trim();
    if (!name) {
      this.notifications.error(this.locale.text('نام دسته را وارد کنید.'));
      return;
    }
    this.saving.set(true);
    try {
      const payload = {
        name,
        slug: this.formSlug().trim() || null,
        color: this.formColor(),
        icon: this.formIcon(),
        keywords: this.formKeywords().trim(),
        sortOrder: Number(this.formSortOrder()) || 0,
      };
      const id = this.editingId();
      if (id) {
        const updated = await this.api.updateDefaultCategory(id, payload);
        this.categories.update((list) =>
          list
            .map((item) => (item.id === id ? updated : item))
            .sort((a, b) => a.sortOrder - b.sortOrder),
        );
        this.notifications.success(
          this.locale.text('دسته‌بندی پیش‌فرض بروزرسانی شد.'),
        );
      } else {
        const created = await this.api.createDefaultCategory(payload);
        this.categories.update((list) =>
          [...list, created].sort((a, b) => a.sortOrder - b.sortOrder),
        );
        this.notifications.success(
          this.locale.text('دسته‌بندی پیش‌فرض ایجاد شد.'),
        );
      }
      this.dialogOpen.set(false);
      void this.loadOverview();
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async deleteCategory(cat: DefaultExpenseCategoryItem) {
    const confirmed = await this.confirm.ask({
      title: this.locale.text('حذف دسته پیش‌فرض'),
      description: this.locale.text(
        `آیا از حذف دسته پیش‌فرض «${cat.name}» مطمئن هستید؟`,
      ),
      confirmText: this.locale.text('حذف'),
      destructive: true,
    });
    if (!confirmed) return;

    try {
      await this.api.deleteDefaultCategory(cat.id);
      this.categories.update((list) => list.filter((c) => c.id !== cat.id));
      this.notifications.success(this.locale.text('دسته پیش‌فرض حذف شد.'));
      void this.loadOverview();
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    }
  }

  protected getCategoryBadgeClass(color: string): string {
    switch (color) {
      case 'blue':
        return 'border-blue-500/30 bg-blue-500/15 text-blue-600 dark:text-blue-400';
      case 'violet':
        return 'border-violet-500/30 bg-violet-500/15 text-violet-600 dark:text-violet-400';
      case 'amber':
        return 'border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400';
      case 'rose':
        return 'border-rose-500/30 bg-rose-500/15 text-rose-600 dark:text-rose-400';
      case 'cyan':
        return 'border-cyan-500/30 bg-cyan-500/15 text-cyan-600 dark:text-cyan-400';
      case 'slate':
        return 'border-slate-500/30 bg-slate-500/15 text-slate-600 dark:text-slate-400';
      default:
        return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
    }
  }

  protected getColorDotClass(color: string): string {
    switch (color) {
      case 'blue':
        return 'bg-blue-500';
      case 'violet':
        return 'bg-violet-500';
      case 'amber':
        return 'bg-amber-500';
      case 'rose':
        return 'bg-rose-500';
      case 'cyan':
        return 'bg-cyan-500';
      case 'slate':
        return 'bg-slate-500';
      default:
        return 'bg-emerald-500';
    }
  }
}
