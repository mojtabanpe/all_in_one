import { Component, signal } from '@angular/core';
import {
  AioTranslate,
  AioBadge,
  AioButton,
  AioCardDirectives,
  AioCheckbox,
  AioIcon,
  AioInput,
  AioInputGroupDirectives,
  AioNativeSelect,
  AioNativeSelectOption,
  AioProgressDirectives,
  AioSwitch,
  provideIcons,
  AioFormField,
  AioCardHeading,
  AioSectionHeading,
} from '@all-in-one/ui';
import { lucidePlus, lucideSearch } from '@ng-icons/lucide';

interface Swatch {
  token: string;
  label: string;
  /** Token for text drawn on the swatch. */
  on?: string;
}

/**
 * Living style guide: the palette, type scale, radii and components exactly as
 * the theme renders them. Source of the values: libs/shared/packages/ui/src/styles/theme.css.
 */
@Component({
  selector: 'admin-design-system',
  imports: [
    AioBadge,
    AioButton,
    AioCardDirectives,
    AioCheckbox,
    AioIcon,
    AioInput,
    AioInputGroupDirectives,
    AioNativeSelect,
    AioNativeSelectOption,
    AioProgressDirectives,
    AioSwitch,
    AioFormField,
    AioCardHeading,
    AioSectionHeading,
    AioTranslate,
  ],
  providers: [provideIcons({ lucidePlus, lucideSearch })],
  template: `
    <div class="flex flex-col gap-8">
      <header
        class="flex flex-col gap-1"
        aioSectionHeading
        [title]="'سیستم طراحی' | aioTranslate"
        [description]="
          'بر پایه Skeuo Next: شیشه چینی سرد، دکمه‌های گرافیتی براق، تأکید آبی‌فیروزه‌ای.'
            | aioTranslate
        "
        [level]="1"
        titleClass="text-2xl font-bold"
        descriptionClass="text-muted-foreground text-sm"
        textClass="flex flex-col gap-1"
      ></header>

      @for (group of palette; track group.title) {
        <section
          class="flex flex-col gap-3"
          [attr.aria-label]="group.title | aioTranslate"
        >
          <h2 class="text-lg font-bold">{{ group.title | aioTranslate }}</h2>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            @for (s of group.swatches; track s.token) {
              <div class="glass flex flex-col overflow-hidden rounded-xl">
                <div
                  class="flex h-20 items-end p-3 text-sm font-semibold"
                  [style.background]="'var(--' + s.token + ')'"
                  [style.color]="s.on ? 'var(--' + s.on + ')' : null"
                >
                  @if (s.on) {
                    {{ 'متن نمونه' | aioTranslate }}
                  }
                </div>
                <div class="flex flex-col gap-0.5 p-3">
                  <span class="text-sm font-semibold">{{
                    s.label | aioTranslate
                  }}</span>
                  <code dir="ltr" class="text-muted-foreground text-end text-xs"
                    >--{{ s.token }}</code
                  >
                </div>
              </div>
            }
          </div>
        </section>
      }

      <section
        class="flex flex-col gap-3"
        [attr.aria-label]="'تایپوگرافی' | aioTranslate"
      >
        <h2 class="text-lg font-bold">{{ 'تایپوگرافی' | aioTranslate }}</h2>
        <div class="glass flex flex-col gap-4 rounded-xl p-5">
          @for (t of type; track t.name) {
            <div class="flex items-baseline justify-between gap-4">
              <span [class]="t.class">{{ t.sample | aioTranslate }}</span>
              <code dir="ltr" class="text-muted-foreground shrink-0 text-xs">{{
                t.name
              }}</code>
            </div>
          }
          <p dir="ltr" lang="en" class="text-base">
            {{
              'Inter for Latin text: The quick brown fox jumps over the lazy dog.'
                | aioTranslate
            }}
          </p>
        </div>
      </section>

      <section
        class="flex flex-col gap-3"
        [attr.aria-label]="'دکمه‌ها' | aioTranslate"
      >
        <h2 class="text-lg font-bold">{{ 'دکمه‌ها' | aioTranslate }}</h2>
        <div class="glass flex flex-col gap-5 rounded-xl p-5">
          <div class="flex flex-wrap items-center gap-3">
            <button aioBtn>{{ 'اصلی' | aioTranslate }}</button>
            <button aioBtn variant="outline">
              {{ 'ثانویه' | aioTranslate }}
            </button>
            <button aioBtn variant="secondary">
              {{ 'ملایم' | aioTranslate }}
            </button>
            <button aioBtn variant="ghost">
              {{ 'بی‌قاب' | aioTranslate }}
            </button>
            <button aioBtn variant="destructive">
              {{ 'حذف' | aioTranslate }}
            </button>
            <button aioBtn disabled>{{ 'غیرفعال' | aioTranslate }}</button>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <button aioBtn size="sm">{{ 'کوچک' | aioTranslate }}</button>
            <button aioBtn>{{ 'معمولی' | aioTranslate }}</button>
            <button aioBtn size="lg">{{ 'بزرگ' | aioTranslate }}</button>
            <button
              aioBtn
              size="icon"
              [attr.aria-label]="'افزودن' | aioTranslate"
            >
              <aio-icon name="lucidePlus" />
            </button>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <button aioBtn class="applet-planner">
              {{ 'برنامه‌ریز' | aioTranslate }}
            </button>
            <button aioBtn class="applet-english">
              {{ 'انگلیسی' | aioTranslate }}
            </button>
            <button aioBtn class="applet-health">
              {{ 'سلامت' | aioTranslate }}
            </button>
            <button aioBtn class="applet-english btn-3d">
              {{ 'دکمه سه‌بعدی' | aioTranslate }}
            </button>
          </div>
        </div>
      </section>

      <section
        class="flex flex-col gap-3"
        [attr.aria-label]="'فرم‌ها' | aioTranslate"
      >
        <h2 class="text-lg font-bold">{{ 'فرم‌ها' | aioTranslate }}</h2>
        <div class="glass grid gap-5 rounded-xl p-5 sm:grid-cols-2">
          <aio-form-field [label]="'نام' | aioTranslate" controlId="ds-name">
            <input
              aioInput
              id="ds-name"
              [placeholder]="'مثلاً: رضا' | aioTranslate"
            />
          </aio-form-field>
          <aio-form-field
            [label]="'جست‌وجو' | aioTranslate"
            controlId="ds-search"
          >
            <div aioInputGroup>
              <aio-input-group-addon>
                <aio-icon name="lucideSearch" size="sm" />
              </aio-input-group-addon>
              <input
                aioInputGroupInput
                id="ds-search"
                [placeholder]="'واژه یا کار' | aioTranslate"
              />
            </div>
          </aio-form-field>
          <aio-form-field
            [label]="'انتخاب' | aioTranslate"
            controlId="ds-select"
          >
            <aio-native-select selectId="ds-select" value="b">
              <option aioNativeSelectOption value="a">
                {{ 'گزینه یک' | aioTranslate }}
              </option>
              <option aioNativeSelectOption value="b">
                {{ 'گزینه دو' | aioTranslate }}
              </option>
            </aio-native-select>
          </aio-form-field>
          <div class="flex flex-col justify-end gap-4">
            <div class="flex items-center gap-3 text-sm">
              <aio-checkbox inputId="ds-remind" [(checked)]="checked" />
              <label for="ds-remind">{{
                'یادآوری روزانه' | aioTranslate
              }}</label>
            </div>
            <div class="flex items-center gap-3 text-sm">
              <aio-switch inputId="ds-focus" [(checked)]="switched" />
              <label for="ds-focus">{{ 'حالت تمرکز' | aioTranslate }}</label>
            </div>
          </div>
        </div>
      </section>

      <section
        class="flex flex-col gap-3"
        [attr.aria-label]="'سطح‌ها' | aioTranslate"
      >
        <h2 class="text-lg font-bold">
          {{ 'سطح‌ها و وضعیت‌ها' | aioTranslate }}
        </h2>
        <div class="grid gap-4 sm:grid-cols-2">
          <section aioCard>
            <div
              aioCardHeading
              [title]="'کارت' | aioTranslate"
              [level]="3"
              [description]="'شیشه چینی با سایه نرم و لبه روشن.' | aioTranslate"
            ></div>
            <div aioCardContent class="flex flex-col gap-3">
              <div
                aioProgress
                [value]="64"
                [attr.aria-label]="'نمونه پیشرفت' | aioTranslate"
              >
                <div aioProgressIndicator></div>
              </div>
              <div class="flex flex-wrap gap-2">
                <span aioBadge>{{ 'پیش‌فرض' | aioTranslate }}</span>
                <span aioBadge variant="secondary">{{
                  'ملایم' | aioTranslate
                }}</span>
                <span aioBadge variant="outline">{{
                  'قاب‌دار' | aioTranslate
                }}</span>
                <span aioBadge class="bg-success text-success-foreground">{{
                  'موفق' | aioTranslate
                }}</span>
                <span aioBadge class="bg-warning text-warning-foreground">{{
                  'هشدار' | aioTranslate
                }}</span>
                <span aioBadge variant="destructive">{{
                  'خطا' | aioTranslate
                }}</span>
              </div>
            </div>
          </section>
          <div class="glass flex flex-col gap-3 rounded-xl p-5">
            <span class="text-sm font-semibold">{{
              'گردی گوشه‌ها' | aioTranslate
            }}</span>
            <div class="flex flex-wrap items-end gap-3">
              @for (r of radii; track r) {
                <div class="flex flex-col items-center gap-1">
                  <div class="bg-accent size-14" [class]="r"></div>
                  <code dir="ltr" class="text-muted-foreground text-xs">{{
                    r
                  }}</code>
                </div>
              }
            </div>
          </div>
        </div>
      </section>
    </div>
  `,
})
export class DesignSystem {
  protected readonly checked = signal(true);
  protected readonly switched = signal(false);

  protected readonly palette: { title: string; swatches: Swatch[] }[] = [
    {
      title: 'خنثی‌ها: چینی سرد',
      swatches: [
        { token: 'background', label: 'زمینه', on: 'foreground' },
        { token: 'card', label: 'سطح شیشه‌ای', on: 'foreground' },
        { token: 'muted', label: 'ملایم', on: 'muted-foreground' },
        { token: 'border', label: 'خط' },
        { token: 'foreground', label: 'متن', on: 'background' },
      ],
    },
    {
      title: 'برند',
      swatches: [
        { token: 'primary', label: 'گرافیت', on: 'primary-foreground' },
        {
          token: 'accent',
          label: 'آبی‌فیروزه‌ای روشن',
          on: 'accent-foreground',
        },
        { token: 'ring', label: 'حلقه فوکوس' },
      ],
    },
    {
      title: 'وضعیت‌ها',
      swatches: [
        { token: 'success', label: 'موفق', on: 'success-foreground' },
        { token: 'warning', label: 'هشدار', on: 'warning-foreground' },
        { token: 'destructive', label: 'خطا', on: 'destructive-foreground' },
        { token: 'info', label: 'اطلاع', on: 'info-foreground' },
      ],
    },
    {
      title: 'رنگ اپلت‌ها',
      swatches: [
        { token: 'planner', label: 'برنامه‌ریز', on: 'primary-foreground' },
        { token: 'english', label: 'انگلیسی', on: 'primary-foreground' },
        { token: 'health', label: 'سلامت', on: 'primary-foreground' },
        { token: 'streak', label: 'شعله', on: 'primary-foreground' },
        { token: 'gem', label: 'الماس', on: 'primary-foreground' },
      ],
    },
  ];

  protected readonly type = [
    {
      name: 'text-3xl bold',
      class: 'text-3xl font-bold',
      sample: 'عدد اصلی ۲٬۲۶۰',
    },
    {
      name: 'text-2xl bold',
      class: 'text-2xl font-bold',
      sample: 'عنوان صفحه',
    },
    { name: 'text-lg bold', class: 'text-lg font-bold', sample: 'عنوان بخش' },
    { name: 'text-base', class: 'text-base', sample: 'متن اصلی برای خواندن' },
    {
      name: 'text-sm muted',
      class: 'text-muted-foreground text-sm',
      sample: 'توضیح کوتاه',
    },
  ];

  protected readonly radii = [
    'rounded-sm',
    'rounded-md',
    'rounded-lg',
    'rounded-xl',
    'rounded-full',
  ];
}
