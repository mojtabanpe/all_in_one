import { Component, computed, effect, inject } from '@angular/core';
import { GrowthAnalytics } from '@all-in-one/web/shared';
import {
  AioTranslate,
  AioLocale,
  AioButton,
  AioCardDirectives,
  AioIcon,
  AioAccordionContent,
  AioAccordionDirectives,
  AioAccordionTrigger,
  provideIcons,
} from '@all-in-one/ui';
import {
  lucideCalendarCheck,
  lucideCheck,
  lucideChevronLeft,
  lucideDownload,
  lucideHeartPulse,
  lucideLanguages,
  lucideSmartphone,
} from '@ng-icons/lucide';
import { injectCustomerLinks } from '../customer-url';
import { ANDROID_RELEASE } from './android-release';

/** Store pages of the Android app (the same package as the in-app rating request, directive 161). */
export const STORE_LINKS = {
  bazaar: 'https://cafebazaar.ir/app/ir.poshtetgarm.poshtetgarm_hybrid',
  myket: 'https://myket.ir/app/ir.poshtetgarm.poshtetgarm_hybrid',
} as const;

/**
 * Landing page (directive 165): say plainly what the app does, show the real screens and one clear next
 * step. No slogans; each feature line names something the visitor can actually do.
 */
@Component({
  selector: 'public-home',
  imports: [
    AioButton,
    AioCardDirectives,
    AioIcon,
    AioAccordionContent,
    AioAccordionDirectives,
    AioAccordionTrigger,
    AioTranslate,
  ],
  providers: [
    provideIcons({
      lucideCalendarCheck,
      lucideCheck,
      lucideChevronLeft,
      lucideDownload,
      lucideHeartPulse,
      lucideLanguages,
      lucideSmartphone,
    }),
  ],
  template: `
    <div class="flex flex-col gap-12 md:gap-20">
      <section
        class="grid items-center gap-8 pt-2 md:grid-cols-[1.2fr_1fr] lg:pt-8"
        aria-labelledby="start-title"
      >
        <div class="flex flex-col gap-5">
          <h1
            id="start-title"
            class="text-3xl leading-[1.5] font-bold text-balance sm:text-4xl lg:text-5xl"
          >
            {{
              'کارهای روزانه، تمرین انگلیسی و ثبت غذا و ورزش، در یک اپ'
                | aioTranslate
            }}
          </h1>
          <p class="text-muted-foreground max-w-xl text-base leading-8">
            {{
              'کارهایت را بنویس و تیک بزن، هر روز چند لغت انگلیسی مرور کن و بنویس چه خوردی تا کالری‌اش حساب شود. رایگان است و فارسی.'
                | aioTranslate
            }}
          </p>
          <div class="flex flex-wrap items-center gap-3">
            <a
              aioBtn
              size="lg"
              class="min-h-12"
              [href]="customerLinks.signup()"
              >{{ 'شروع رایگان' | aioTranslate }}</a
            >
            <a
              aioBtn
              variant="ghost"
              class="min-h-12"
              [href]="customerLinks.login()"
              >{{ 'ورود' | aioTranslate }}</a
            >
          </div>
          <div class="flex flex-wrap items-center gap-2 text-sm">
            <span class="text-muted-foreground">{{
              'نصب از:' | aioTranslate
            }}</span>
            <a
              aioBtn
              variant="outline"
              size="sm"
              class="min-h-11"
              [href]="stores.bazaar"
              >{{ 'کافه‌بازار' | aioTranslate }}</a
            >
            <a
              aioBtn
              variant="outline"
              size="sm"
              class="min-h-11"
              [href]="stores.myket"
              >{{ 'مایکت' | aioTranslate }}</a
            >
            <a
              aioBtn
              variant="link"
              size="sm"
              class="min-h-11"
              href="#install"
              >{{ 'راه‌های دیگر' | aioTranslate }}</a
            >
          </div>
        </div>
        <img
          class="mx-auto w-full max-w-64 rounded-[2rem] border border-border shadow-xl md:max-w-72"
          width="430"
          height="900"
          fetchpriority="high"
          [src]="shot('planner')"
          [alt]="'صفحهٔ کارهای امروز در اپ' | aioTranslate"
        />
      </section>

      <section class="flex flex-col gap-6" aria-labelledby="features-title">
        <h2 id="features-title" class="aio-page-title">
          {{ 'در اپ چه کار می‌توانی بکنی' | aioTranslate }}
        </h2>
        <div class="grid gap-4 lg:grid-cols-3">
          @for (feature of features; track feature.slug) {
            <article
              aioCard
              class="min-w-0 overflow-hidden"
              [class]="feature.accent"
            >
              <img
                class="h-56 w-full border-b border-border object-cover object-top"
                width="430"
                height="900"
                loading="lazy"
                [src]="shot(feature.image)"
                [alt]="feature.alt | aioTranslate"
              />
              <div aioCardHeader>
                <h3 aioCardTitle class="flex items-center gap-2">
                  <aio-icon [name]="feature.icon" class="text-primary" />
                  {{ feature.title | aioTranslate }}
                </h3>
              </div>
              <div aioCardContent class="flex flex-col gap-3">
                <ul class="flex flex-col gap-2 text-sm leading-7">
                  @for (point of feature.points; track point) {
                    <li class="flex gap-2">
                      <aio-icon
                        name="lucideCheck"
                        size="sm"
                        class="text-primary mt-1.5 shrink-0"
                      />
                      {{ point | aioTranslate }}
                    </li>
                  }
                </ul>
                <a
                  aioBtn
                  variant="outline"
                  class="min-h-11 self-start"
                  [href]="customerLinks.signupFor(feature.goal)"
                  >{{
                    'شروع با {0}'
                      | aioTranslate: [feature.title | aioTranslate]
                  }}<aio-icon
                    name="lucideChevronLeft"
                    size="sm"
                    class="ltr:-scale-x-100"
                /></a>
              </div>
            </article>
          }
        </div>
        <p class="text-muted-foreground text-sm leading-7">
          {{
            'برنامه‌ریز، فلش‌کارت و ثبت سلامت رایگان‌اند. دستیار هوش مصنوعی یک هفته رایگان است و بعد از آن با اشتراک.'
              | aioTranslate
          }}
        </p>
      </section>

      <section
        id="install"
        class="flex scroll-mt-24 flex-col gap-4"
        aria-labelledby="install-title"
      >
        <h2 id="install-title" class="aio-page-title">
          {{ 'نصب روی گوشی' | aioTranslate }}
        </h2>
        <div class="flex flex-wrap gap-3">
          <a aioBtn size="lg" class="min-h-12" [href]="stores.bazaar">{{
            'دریافت از کافه‌بازار' | aioTranslate
          }}</a>
          <a
            aioBtn
            size="lg"
            variant="outline"
            class="min-h-12"
            [href]="stores.myket"
            >{{ 'دریافت از مایکت' | aioTranslate }}</a
          >
        </div>
        <div aioAccordion type="single" class="glass rounded-3xl px-4">
          <div aioAccordionItem>
            <aio-accordion-trigger>
              <span class="flex items-center gap-2">
                <aio-icon name="lucideDownload" size="sm" />
                {{ 'دانلود مستقیم برای اندروید' | aioTranslate }}
              </span>
            </aio-accordion-trigger>
            <aio-accordion-content>
              <div class="flex flex-col items-start gap-2 pb-2">
                <a
                  aioBtn
                  variant="outline"
                  class="min-h-11"
                  [href]="android.main"
                  download
                  >{{
                    'دانلود فایل نصب ({0})' | aioTranslate: [android.version]
                  }}</a
                >
                <p class="text-muted-foreground text-sm leading-7">
                  {{
                    'اگر گوشی پرسید، نصب از این منبع را اجازه بده.'
                      | aioTranslate
                  }}
                </p>
                <div class="flex flex-wrap gap-x-4">
                  @for (apk of android.others; track apk.url) {
                    <a
                      aioBtn
                      variant="link"
                      class="min-h-11 px-0"
                      [href]="apk.url"
                      download
                      >{{ apk.label | aioTranslate }}</a
                    >
                  }
                </div>
              </div>
            </aio-accordion-content>
          </div>
          <div aioAccordionItem>
            <aio-accordion-trigger>
              <span class="flex items-center gap-2">
                <aio-icon name="lucideSmartphone" size="sm" />
                {{ 'آیفون' | aioTranslate }}
              </span>
            </aio-accordion-trigger>
            <aio-accordion-content>
              <p class="text-muted-foreground pb-2 text-sm leading-7">
                {{
                  'اپ را در Safari باز کن، دکمهٔ اشتراک‌گذاری را بزن و «Add to Home Screen» را انتخاب کن.'
                    | aioTranslate
                }}
              </p>
            </aio-accordion-content>
          </div>
        </div>
        <p class="text-muted-foreground text-sm">
          {{ 'بدون نصب هم در مرورگر کار می‌کند.' | aioTranslate }}
          <a class="text-primary font-medium" [href]="customerLinks.signup()">{{
            'باز کردن در مرورگر' | aioTranslate
          }}</a>
        </p>
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
  protected readonly stores = STORE_LINKS;
  protected readonly android = ANDROID_RELEASE;
  private readonly lang = computed(() => (this.locale.english() ? 'en' : 'fa'));
  protected shot(image: 'planner' | 'english' | 'health'): string {
    return `/product/${image}-${this.lang()}.${image === 'english' ? 'webp' : 'jpg'}`;
  }
  protected readonly features = [
    {
      slug: '/daily-planner',
      goal: 'planner',
      image: 'planner',
      accent: 'applet-planner',
      icon: 'lucideCalendarCheck',
      title: 'برنامه‌ریز',
      alt: 'صفحهٔ کارهای امروز در اپ',
      points: [
        'کارهای امروز و فردا را بنویس و تیک بزن',
        'عادت‌های روزانه و یادآور',
        'تایمر تمرکز (پومودورو)',
      ],
    },
    {
      slug: '/daily-english',
      goal: 'english',
      image: 'english',
      accent: 'applet-english',
      icon: 'lucideLanguages',
      title: 'انگلیسی',
      alt: 'صفحهٔ مرور فلش‌کارت در اپ',
      points: [
        'فلش‌کارت با مرور فاصله‌دار؛ هر لغت را درست وقتی داری فراموشش می‌کنی می‌بینی',
        'مجموعه‌های آماده از مبتدی تا پیشرفته',
        'تمرین شنیدن و تلفظ',
      ],
    },
    {
      slug: '/health-tracking',
      goal: 'health',
      image: 'health',
      accent: 'applet-health',
      icon: 'lucideHeartPulse',
      title: 'سلامت',
      alt: 'صفحهٔ سلامت امروز در اپ',
      points: [
        'بنویس چه خوردی؛ کالری و درشت‌مغذی‌ها حساب می‌شود',
        'برنامهٔ ورزش در خانه، باشگاه یا با TRX',
        'وزن، هدف و روزه‌داری متناوب',
      ],
    },
  ] as const;
}
