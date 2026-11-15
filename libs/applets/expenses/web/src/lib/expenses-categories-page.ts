import { CommonModule } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  type ExpenseCategoryColor,
  type ExpenseCategoryIcon,
  type ExpenseCategoryItem,
  EXPENSE_CATEGORY_COLOR_LABELS,
  EXPENSE_CATEGORY_COLORS,
  EXPENSE_CATEGORY_ICON_LABELS,
  EXPENSE_CATEGORY_ICONS,
} from '@all-in-one/applets/expenses/contracts';
import {
  AioButton,
  AioConfirm,
  AioDialog,
  AioDialogActions,
  AioDialogBody,
  AioEmptyState,
  AioIcon,
  AioLocale,
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
  lucideShoppingBag,
  lucideSparkles,
  lucideTag,
  lucideTrash2,
  lucideUtensils,
  lucideWallet,
} from '@ng-icons/lucide';
import { ExpensesApi } from './expenses-api';

@Component({
  selector: 'expenses-categories-page',
  imports: [
    CommonModule,
    FormsModule,
    AioButton,
    AioIcon,
    AioDialog,
    AioDialogBody,
    AioDialogActions,
    AioEmptyState,
    AioTranslate,
  ],
  providers: [
    provideIcons({
      lucideTag,
      lucidePlus,
      lucideTrash2,
      lucidePencil,
      lucideUtensils,
      lucideCar,
      lucideReceipt,
      lucideShoppingBag,
      lucideHeartPulse,
      lucideSparkles,
      lucideWallet,
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
      <!-- Header banner with Add Category action -->
      <section
        class="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/40 bg-card/40 p-4.5 backdrop-blur-sm"
      >
        <div>
          <h2 class="text-base font-semibold sm:text-lg">
            {{ 'دسته‌بندی‌های مخارج و بودجه' | aioTranslate }}
          </h2>
          <p class="mt-0.5 text-xs text-muted-foreground">
            {{
              'تعریف دسته‌ها، کلیدواژه‌های هوش مصنوعی و سقف بودجه ماهانه برای هر دسته'
                | aioTranslate
            }}
          </p>
        </div>

        <button
          aioBtn
          type="button"
          variant="default"
          class="h-10 gap-2 rounded-xl text-xs font-semibold"
          (click)="openCreate()"
        >
          <aio-icon name="lucidePlus" size="sm" />
          {{ 'افزودن دسته جدید' | aioTranslate }}
        </button>
      </section>

      <!-- Category Cards Grid -->
      @if (loading()) {
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          @for (i of [1, 2, 3, 4, 5, 6]; track i) {
            <div
              class="h-36 animate-pulse rounded-2xl border border-border/40 bg-card/30"
            ></div>
          }
        </div>
      } @else if (categories().length === 0) {
        <div
          aioEmptyState
          class="py-12"
          [title]="'دسته‌بندی‌ای یافت نشد' | aioTranslate"
          [description]="'می‌توانید دستهٔ جدیدی ایجاد کنید.' | aioTranslate"
        ></div>
      } @else {
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          @for (cat of categories(); track cat.id) {
            <div
              class="relative flex flex-col justify-between gap-3 rounded-2xl border border-border/60 bg-card/60 p-4.5 shadow-sm backdrop-blur-md transition-all hover:border-primary/30"
            >
              <div class="flex items-start justify-between gap-2">
                <div class="flex items-center gap-3">
                  <span
                    class="flex size-11 items-center justify-center rounded-xl border text-base"
                    [ngClass]="getCategoryBadgeClass(cat.color)"
                  >
                    <aio-icon [name]="cat.icon || 'lucideReceipt'" size="sm" />
                  </span>

                  <div class="flex flex-col">
                    <h3 class="text-sm font-semibold text-foreground">
                      {{ cat.name }}
                    </h3>
                    <span class="font-mono text-[11px] text-muted-foreground">
                      {{ cat.slug }}
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
                    [attr.aria-label]="'ویرایش دسته' | aioTranslate"
                  >
                    <aio-icon name="lucidePencil" size="xs" />
                  </button>
                  <button
                    aioBtn
                    variant="ghost"
                    size="icon"
                    class="size-8 text-muted-foreground hover:text-destructive"
                    (click)="deleteCategory(cat)"
                    [attr.aria-label]="'حذف دسته' | aioTranslate"
                  >
                    <aio-icon name="lucideTrash2" size="xs" />
                  </button>
                </div>
              </div>

              <!-- Monthly budget & stats -->
              <div
                class="flex flex-col gap-1.5 rounded-xl bg-muted/30 p-2.5 text-xs"
              >
                <div class="flex items-center justify-between">
                  <span class="text-muted-foreground">{{
                    'بودجه ماهانه:' | aioTranslate
                  }}</span>
                  <span class="font-mono font-medium text-foreground">
                    @if (cat.monthlyBudget) {
                      {{ locale.number(cat.monthlyBudget) }}
                      {{ 'تومان' | aioTranslate }}
                    } @else {
                      {{ 'نامحدود' | aioTranslate }}
                    }
                  </span>
                </div>
              </div>

              <!-- Keywords for AI matching -->
              @if (cat.keywords) {
                <div class="text-[11px] text-muted-foreground">
                  <span class="font-medium text-foreground/70">{{
                    'کلیدواژه‌ها:' | aioTranslate
                  }}</span>
                  <p class="truncate" [title]="cat.keywords">
                    {{ cat.keywords }}
                  </p>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- Create / Edit Dialog -->
      <aio-dialog
        [(open)]="dialogOpen"
        [title]="
          (editingCat() ? 'ویرایش دسته‌بندی' : 'افزودن دسته‌بندی جدید')
            | aioTranslate
        "
        contentClass="applet-expenses sm:max-w-md"
      >
        <ng-template aioDialogBody>
          <div class="flex flex-col gap-3 py-2 text-sm">
            <!-- Name -->
            <div class="flex flex-col gap-1">
              <span class="text-xs font-medium text-muted-foreground">
                {{ 'نام دسته' | aioTranslate }} *
              </span>
              <input
                type="text"
                [(ngModel)]="formName"
                placeholder="مثال: هدایا و خیریه"
                class="h-10 rounded-xl border border-input bg-background/50 px-3 text-sm outline-none focus:border-primary"
              />
            </div>

            <!-- Slug -->
            <div class="flex flex-col gap-1">
              <span class="text-xs font-medium text-muted-foreground">
                {{ 'شناسه انگلیسی (slug)' | aioTranslate }} *
              </span>
              <input
                type="text"
                [(ngModel)]="formSlug"
                placeholder="مثال: gifts"
                class="h-10 rounded-xl border border-input bg-background/50 px-3 text-sm font-mono outline-none focus:border-primary"
              />
            </div>

            <!-- Icon & Color Row -->
            <div class="grid grid-cols-2 gap-3">
              <!-- Icon -->
              <div class="flex flex-col gap-1">
                <span class="text-xs font-medium text-muted-foreground">
                  {{ 'آیکون' | aioTranslate }}
                </span>
                <select
                  [(ngModel)]="formIcon"
                  class="h-10 rounded-xl border border-input bg-background/50 px-2.5 text-xs outline-none focus:border-primary"
                >
                  @for (ic of availableIcons; track ic) {
                    <option [value]="ic">{{ iconLabels[ic] }}</option>
                  }
                </select>
              </div>

              <!-- Color -->
              <div class="flex flex-col gap-1">
                <span class="text-xs font-medium text-muted-foreground">
                  {{ 'رنگ' | aioTranslate }}
                </span>
                <select
                  [(ngModel)]="formColor"
                  class="h-10 rounded-xl border border-input bg-background/50 px-2.5 text-xs outline-none focus:border-primary"
                >
                  @for (col of availableColors; track col) {
                    <option [value]="col">{{ colorLabels[col] }}</option>
                  }
                </select>
              </div>
            </div>

            <!-- Monthly Budget -->
            <div class="flex flex-col gap-1">
              <span class="text-xs font-medium text-muted-foreground">
                {{ 'بودجه ماهانه (تومان، اختیاری)' | aioTranslate }}
              </span>
              <input
                type="number"
                min="0"
                [(ngModel)]="formBudget"
                placeholder="مثال: 2000000"
                class="h-10 rounded-xl border border-input bg-background/50 px-3 text-sm outline-none focus:border-primary"
              />
            </div>

            <!-- Keywords -->
            <div class="flex flex-col gap-1">
              <span class="text-xs font-medium text-muted-foreground">
                {{
                  'کلیدواژه‌های مرتبط برای هوش مصنوعی (با ویرگول)'
                    | aioTranslate
                }}
              </span>
              <input
                type="text"
                [(ngModel)]="formKeywords"
                placeholder="مثال: هدیه, تولد, کادو, نذری, خیریه"
                class="h-10 rounded-xl border border-input bg-background/50 px-3 text-xs outline-none focus:border-primary"
              />
            </div>
          </div>
        </ng-template>

        <ng-template aioDialogActions>
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
            [disabled]="
              formSaving() || !formName().trim() || !formSlug().trim()
            "
            (click)="saveCategory()"
          >
            {{ (formSaving() ? 'در حال ذخیره...' : 'ذخیره') | aioTranslate }}
          </button>
        </ng-template>
      </aio-dialog>
    </div>
  `,
})
export class ExpensesCategoriesPage implements OnInit {
  protected readonly locale = inject(AioLocale);
  private readonly api = inject(ExpensesApi);
  private readonly notifications = inject(AioNotifications);
  private readonly confirm = inject(AioConfirm);

  protected readonly categories = signal<ExpenseCategoryItem[]>([]);
  protected readonly loading = signal(false);

  // Dialog & Form
  protected readonly dialogOpen = signal(false);
  protected readonly editingCat = signal<ExpenseCategoryItem | null>(null);
  protected readonly formName = signal('');
  protected readonly formSlug = signal('');
  protected readonly formIcon = signal<ExpenseCategoryIcon>('lucideReceipt');
  protected readonly formColor = signal<ExpenseCategoryColor>('slate');
  protected readonly formBudget = signal<number | null>(null);
  protected readonly formKeywords = signal('');
  protected readonly formSaving = signal(false);

  protected readonly availableIcons = EXPENSE_CATEGORY_ICONS;
  protected readonly iconLabels = EXPENSE_CATEGORY_ICON_LABELS;
  protected readonly availableColors = EXPENSE_CATEGORY_COLORS;
  protected readonly colorLabels = EXPENSE_CATEGORY_COLOR_LABELS;

  async ngOnInit(): Promise<void> {
    await this.loadCategories();
  }

  async loadCategories(): Promise<void> {
    this.loading.set(true);
    try {
      const cats = await this.api.listCategories();
      this.categories.set(cats);
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  openCreate(): void {
    this.editingCat.set(null);
    this.formName.set('');
    this.formSlug.set('');
    this.formIcon.set('lucideReceipt');
    this.formColor.set('slate');
    this.formBudget.set(null);
    this.formKeywords.set('');
    this.dialogOpen.set(true);
  }

  openEdit(cat: ExpenseCategoryItem): void {
    this.editingCat.set(cat);
    this.formName.set(cat.name);
    this.formSlug.set(cat.slug || '');
    this.formIcon.set(cat.icon);
    this.formColor.set(cat.color);
    this.formBudget.set(cat.monthlyBudget ?? null);
    this.formKeywords.set(cat.keywords || '');
    this.dialogOpen.set(true);
  }

  async saveCategory(): Promise<void> {
    const name = this.formName().trim();
    const slug = this.formSlug().trim().toLowerCase();
    if (!name || !slug) return;

    this.formSaving.set(true);
    try {
      const editing = this.editingCat();
      if (editing) {
        await this.api.updateCategory(editing.id, {
          name,
          color: this.formColor(),
          icon: this.formIcon(),
          monthlyBudget: this.formBudget() ? Number(this.formBudget()) : null,
          keywords: this.formKeywords().trim() || undefined,
        });
        this.notifications.success('دسته‌بندی با موفقیت به‌روزرسانی شد');
      } else {
        await this.api.createCategory({
          name,
          slug,
          color: this.formColor(),
          icon: this.formIcon(),
          monthlyBudget: this.formBudget()
            ? Number(this.formBudget())
            : undefined,
          keywords: this.formKeywords().trim() || undefined,
        });
        this.notifications.success('دسته‌بندی جدید با موفقیت ایجاد شد');
      }

      this.dialogOpen.set(false);
      await this.loadCategories();
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    } finally {
      this.formSaving.set(false);
    }
  }

  async deleteCategory(cat: ExpenseCategoryItem): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'حذف این دسته‌بندی؟',
      description: `دسته‌بندی «${cat.name}» حذف خواهد شد. اگر هزینه‌ای در این دسته ثبت شده باشد، ابتدا باید دسته‌بندی آن تغییر کند.`,
      confirmText: 'حذف دسته‌بندی',
      destructive: true,
    });
    if (!ok) return;

    try {
      await this.api.deleteCategory(cat.id);
      this.notifications.success('دسته‌بندی حذف شد');
      await this.loadCategories();
    } catch (error) {
      this.notifications.error(apiErrorMessage(error));
    }
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
