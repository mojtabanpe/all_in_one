import { Component, effect, inject } from '@angular/core';
import { GrowthAnalytics } from '@all-in-one/web/shared';
import { RouterLink } from '@angular/router';
import {
  AioTranslate,
  AioLocale,
  AioButton,
  AioCardDirectives,
  AioIcon,
  provideIcons,
  AioSectionHeading,
} from '@all-in-one/ui';
import {
  lucideCalendarCheck,
  lucideDownload,
  lucideHeartPulse,
  lucideLanguages,
  lucideSmartphone,
} from '@ng-icons/lucide';
import { injectCustomerLinks } from '../customer-url';
import { ANDROID_RELEASE } from './android-release';

@Component({
  selector: 'public-home',
  imports: [
    AioButton,
    AioCardDirectives,
    AioIcon,
    RouterLink,
    AioSectionHeading,
    AioTranslate,
  ],
  providers: [
    provideIcons({
      lucideCalendarCheck,
      lucideDownload,
      lucideHeartPulse,
      lucideLanguages,
      lucideSmartphone,
    }),
  ],
  template: `
    <div class="flex flex-col gap-10 md:gap-16">
      <section
        class="flex flex-col gap-7 py-3 sm:gap-9 lg:py-8"
        aria-labelledby="start-title"
      >
        <div class="flex max-w-3xl flex-col gap-4">
          <h1
            id="start-title"
            class="text-3xl leading-[1.55] font-bold text-balance sm:text-4xl lg:text-5xl"
          >
            {{ 'امروز از کجا شروع می‌کنی؟' | aioTranslate }}
          </h1>
          <p
            class="max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg"
          >
            {{
              'انگلیسی تمرین کن، به روزت نظم بده یا سلامتت را دنبال کن. یک مسیر انتخاب کن؛ با همان حساب، بقیه هم در دسترس‌اند.'
                | aioTranslate
            }}
          </p>
        </div>
        <div class="grid gap-4 lg:grid-cols-3">
          @for (path of startingPaths; track path.slug) {
            <a
              aioBtn
              variant="outline"
              class="h-auto min-w-0 justify-start gap-4 rounded-2xl p-5 text-start whitespace-normal lg:flex-col lg:items-start lg:gap-5 lg:p-6"
              [routerLink]="path.slug"
              [queryParams]="customerLinks.campaign()"
            >
              <aio-icon [name]="path.icon" class="shrink-0" />
              <div class="flex min-w-0 flex-col gap-2">
                <h2 class="text-lg font-semibold">
                  {{ path.title | aioTranslate }}
                </h2>
                <p class="text-sm leading-7 font-normal text-muted-foreground">
                  {{ path.description | aioTranslate }}
                </p>
                <span class="text-sm font-semibold">{{
                  path.action | aioTranslate
                }}</span>
              </div>
            </a>
          }
        </div>
        <div class="flex flex-wrap items-center justify-between gap-2">
          <p class="text-sm leading-7 text-muted-foreground">
            {{
              'برای شروع، نصب اپ لازم نیست؛ در مرورگر هم کار می‌کند.'
                | aioTranslate
            }}
          </p>
          <a
            aioBtn
            variant="link"
            class="min-h-11"
            [href]="customerLinks.login()"
            >{{ 'حساب داری؟ وارد شو' | aioTranslate }}</a
          >
        </div>
      </section>
      <section aioCard>
        <div aioCardHeader>
          <h2 aioCardTitle>{{ 'شروع رایگان، انتخاب با تو' | aioTranslate }}</h2>
          <p aioCardDescription class="leading-7">
            {{
              'برنامه‌ریز، فلش‌کارت و ثبت سلامت رایگان می‌مانند. هوش مصنوعی هفت روز آزمایشی است؛ ادامهٔ آن با اشتراک یا هفته‌های هدیه است.'
                | aioTranslate
            }}
          </p>
        </div>
      </section>
      <section
        class="flex flex-col gap-6"
        aria-labelledby="getting-started-title"
      >
        <div
          aioSectionHeading
          headingId="getting-started-title"
          [title]="'چطور شروع کنم؟' | aioTranslate"
          [description]="
            'لازم نیست همه‌چیز را یک‌باره تغییر بدهی. فقط یک کار کوچک را شروع کن.'
              | aioTranslate
          "
          titleClass="aio-page-title"
          descriptionClass="mt-2 max-w-xl text-sm leading-7 text-muted-foreground"
        ></div>
        <ol class="grid list-none gap-4 p-0 lg:grid-cols-3">
          @for (step of gettingStarted; track step.title) {
            <li aioCard class="min-w-0">
              <div aioCardHeader>
                <p class="mb-2 text-sm font-medium text-primary">
                  {{ step.label | aioTranslate }}
                </p>
                <h3 aioCardTitle>{{ step.title | aioTranslate }}</h3>
                <p aioCardDescription class="leading-7">
                  {{ step.description | aioTranslate }}
                </p>
              </div>
            </li>
          }
        </ol>
      </section>
      <section
        id="install"
        class="flex scroll-mt-24 flex-col gap-6"
        aria-labelledby="install-title"
      >
        <div
          aioSectionHeading
          headingId="install-title"
          [title]="'اپ را روی گوشی نصب کن' | aioTranslate"
          [description]="
            'همان حساب و همان داده‌ها؛ روی گوشی سریع‌تر باز می‌شود و یادآورها را هم می‌گیری.'
              | aioTranslate
          "
          titleClass="aio-page-title"
          descriptionClass="mt-2 max-w-xl text-sm leading-7 text-muted-foreground"
        ></div>
        <div class="grid gap-4 md:grid-cols-2">
          <article aioCard class="min-w-0">
            <div aioCardHeader>
              <h3 aioCardTitle class="flex items-center gap-2">
                <aio-icon name="lucideDownload" class="text-primary" />
                {{ 'اندروید' | aioTranslate }}
              </h3>
              <p aioCardDescription class="leading-7">
                {{
                  'فایل نصب را دانلود و باز کن. اگر گوشی پرسید، نصب از این منبع را اجازه بده.'
                    | aioTranslate
                }}
              </p>
            </div>
            <div aioCardContent class="flex flex-col items-start gap-3">
              <a aioBtn size="lg" [href]="android.main" download>{{
                'دانلود مستقیم اندروید' | aioTranslate
              }}</a>
              <p class="text-xs text-muted-foreground">
                {{ 'نسخهٔ {0}' | aioTranslate: [android.version] }}
              </p>
              <p class="text-sm leading-7 text-muted-foreground">
                {{
                  'اگر نسخهٔ مستقیم ۱.۰.۳ را داری، ابتدا آن را حذف کن، نسخهٔ جدید را نصب کن و دوباره وارد همان حساب شو.'
                    | aioTranslate
                }}
              </p>
              <div class="flex flex-wrap gap-x-4">
                @for (apk of android.others; track apk.url) {
                  <a
                    aioBtn
                    variant="link"
                    class="px-0"
                    [href]="apk.url"
                    download
                    >{{ apk.label | aioTranslate }}</a
                  >
                }
              </div>
            </div>
          </article>
          <article aioCard class="min-w-0">
            <div aioCardHeader>
              <h3 aioCardTitle class="flex items-center gap-2">
                <aio-icon name="lucideSmartphone" class="text-primary" />
                {{ 'آیفون و بقیهٔ گوشی‌ها' | aioTranslate }}
              </h3>
              <p aioCardDescription class="leading-7">
                {{
                  'اپ را در Safari باز کن، دکمهٔ اشتراک‌گذاری را بزن و «Add to Home Screen» را انتخاب کن. در Chrome اندروید هم گزینهٔ «نصب برنامه» هست.'
                    | aioTranslate
                }}
              </p>
            </div>
            <div aioCardContent>
              <a
                aioBtn
                size="lg"
                variant="outline"
                [href]="customerLinks.signup()"
                >{{ 'باز کردن اپ' | aioTranslate }}</a
              >
            </div>
          </article>
        </div>
      </section>
      <section
        class="flex flex-wrap items-center justify-between gap-6 border-t border-border py-8"
      >
        <div
          aioSectionHeading
          [title]="'از یک قدم کوچک شروع کن.' | aioTranslate"
          [description]="
            'برنامه امروزت را بچین. بقیه‌اش به‌مرور شکل می‌گیرد.' | aioTranslate
          "
          [level]="2"
          titleClass="text-xl font-bold"
          descriptionClass="text-muted-foreground mt-2 text-sm"
          textClass="flex flex-col gap-1"
        ></div>
        <a aioBtn size="lg" [href]="customerLinks.signup()">{{
          'ساخت حساب رایگان' | aioTranslate
        }}</a>
      </section>
    </div>
  `,
})
export class Home {
  protected readonly locale = inject(AioLocale);
  private readonly analytics = inject(GrowthAnalytics);
  constructor() {
    effect(() => {
      if (this.analytics.ready() && this.analytics.choice() === 'granted')
        void this.analytics.track('landing_view');
    });
  }
  protected readonly customerLinks = injectCustomerLinks();
  protected readonly startingPaths = [
    {
      slug: '/daily-english',
      icon: 'lucideLanguages',
      title: 'انگلیسی، هر روز کمی',
      description: 'فلش‌کارت، مرور فاصله‌دار و متن‌خوانی برای روال شخصی تو.',
      action: 'دیدن مسیر انگلیسی',
    },
    {
      slug: '/daily-planner',
      icon: 'lucideCalendarCheck',
      title: 'یک روز منظم‌تر',
      description: 'کارهای امروز، عادت‌ها و زمان تمرکز در یک فضای ساده.',
      action: 'دیدن مسیر برنامه‌ریزی',
    },
    {
      slug: '/health-tracking',
      icon: 'lucideHeartPulse',
      title: 'سلامت، قدم‌به‌قدم',
      description: 'وعده‌ها، تمرین‌ها و روند روزانه‌ات را یک جا دنبال کن.',
      action: 'دیدن مسیر سلامت',
    },
  ];
  protected readonly android = ANDROID_RELEASE;
  protected readonly gettingStarted = [
    {
      label: 'قدم اول',
      title: 'حسابت را بساز',
      description:
        'با شمارهٔ موبایل یا ایمیل حسابت را بساز. اگر حساب داری، وارد شو.',
    },
    {
      label: 'قدم دوم',
      title: 'از نیاز امروزت شروع کن',
      description:
        'برنامه‌ریز، انگلیسی یا سلامت را باز کن؛ می‌توانی بعداً سراغ بخش‌های دیگر بروی.',
    },
    {
      label: 'قدم سوم',
      title: 'اولین قدمت را ثبت کن',
      description:
        'یک کار بساز، چند کارت مرور کن یا یک وعده غذایی ثبت کن. همین یک قدم برای شروع کافی است.',
    },
  ] as const;
}
