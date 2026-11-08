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
import { APPLETS } from './applets-data';
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
        class="grid items-center gap-10 py-4 lg:grid-cols-[1.2fr_1fr] lg:py-10"
      >
        <div class="flex min-w-0 flex-col items-start gap-6">
          <span
            class="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium"
            ><span class="size-1.5 rounded-full bg-primary"></span
            >{{ 'یک فضای شخصی، برای زندگی روزمره' | aioTranslate }}</span
          >
          <h1
            class="max-w-xl text-3xl leading-[1.6] font-bold text-balance sm:text-4xl lg:text-5xl"
          >
            {{ 'برنامه روزانه، زبان و سلامت؛' | aioTranslate }}<br /><span
              class="text-primary"
              >{{ 'همه در یک جا.' | aioTranslate }}</span
            >
          </h1>
          <p
            class="text-muted-foreground max-w-lg text-base leading-8 md:text-lg"
          >
            {{
              'کارها و عادت‌هایت را دنبال کن، انگلیسی مرور کن و وعده‌ها و تمرین‌هایت را ثبت کن. از همان بخشی شروع کن که امروز به آن نیاز داری.'
                | aioTranslate
            }}
          </p>
          <div
            class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap"
          >
            <a aioBtn size="lg" [href]="customerLinks.signup()">{{
              'ساخت حساب رایگان' | aioTranslate
            }}</a
            ><a
              aioBtn
              size="lg"
              variant="outline"
              routerLink="/applets"
              [queryParams]="customerLinks.campaign()"
              >{{ 'کشف امکانات' | aioTranslate }}</a
            >
          </div>
          <a aioBtn variant="link" [href]="customerLinks.login">{{
            'حساب داری؟ وارد شو' | aioTranslate
          }}</a>
          <p class="text-muted-foreground text-sm leading-6">
            {{ 'فارسی و انگلیسی، روی موبایل و کامپیوتر' | aioTranslate }}
          </p>
        </div>
        <div class="aio-hero flex min-w-0 flex-col gap-6">
          <span class="aio-hero-caption">{{
            'Poshtetgarm، در یک نگاه' | aioTranslate
          }}</span>
          <h2 class="text-2xl leading-relaxed font-bold">
            {{ 'برای هر بخش از روزت،' | aioTranslate }}<br />{{
              'یک جای درست.' | aioTranslate
            }}
          </h2>
          @for (applet of applets; track applet.title) {
            <div
              class="flex min-w-0 items-start gap-4 border-t border-white/15 pt-5"
            >
              <span
                class="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5"
                ><aio-icon [name]="applet.icon" size="sm"
              /></span>
              <div
                aioSectionHeading
                [title]="applet.title | aioTranslate"
                [description]="applet.summary | aioTranslate"
                [level]="3"
                titleClass="font-semibold"
                descriptionClass="aio-hero-caption mt-1"
                textClass="flex min-w-0 flex-col gap-1"
              ></div>
            </div>
          }
        </div>
      </section>
      <section
        class="flex flex-col gap-6"
        aria-labelledby="product-preview-title"
      >
        <div
          aioSectionHeading
          headingId="product-preview-title"
          [title]="'داخل برنامه را ببین' | aioTranslate"
          [description]="
            'تصاویر واقعی برنامه با داده‌های نمایشی؛ برای دیدن جزئیات، تصویر را باز کن.'
              | aioTranslate
          "
          titleClass="aio-page-title"
          descriptionClass="mt-2 text-sm leading-7 text-muted-foreground"
        ></div>
        <div class="grid gap-4 lg:grid-cols-3">
          @for (preview of previews; track preview.slug) {
            <figure aioCard class="min-w-0">
              <figcaption aioCardHeader>
                <h3 aioCardTitle>{{ preview.title | aioTranslate }}</h3>
                <p aioCardDescription>{{ 'نمونهٔ نمایشی' | aioTranslate }}</p>
              </figcaption>
              <div aioCardContent>
                <a
                  aioBtn
                  variant="ghost"
                  class="h-[28rem] w-full overflow-hidden p-0"
                  [href]="previewImage(preview.slug)"
                  target="_blank"
                  rel="noopener"
                  [attr.aria-label]="
                    (preview.alt | aioTranslate) +
                    ' — ' +
                    ('باز کردن تصویر در زبانهٔ جدید' | aioTranslate)
                  "
                >
                  <img
                    [src]="previewImage(preview.slug)"
                    [alt]="preview.alt | aioTranslate"
                    width="430"
                    height="900"
                    loading="lazy"
                    decoding="async"
                    class="block h-full w-auto max-w-full object-contain"
                  />
                </a>
              </div>
            </figure>
          }
        </div>
      </section>
      <section class="flex flex-col gap-5">
        <div>
          <p class="aio-eyebrow">
            {{ 'کمتر پراکنده، بیشتر متمرکز' | aioTranslate }}
          </p>
          <h2 class="aio-page-title">
            {{ 'سه مسیر، یک همراه.' | aioTranslate }}
          </h2>
        </div>
        <div class="grid gap-4 md:grid-cols-3">
          @for (applet of applets; track applet.title) {
            <article aioCard>
              <div aioCardHeader>
                <span class="aio-module-icon mb-4"
                  ><aio-icon [name]="applet.icon"
                /></span>
                <h3 aioCardTitle>{{ applet.title | aioTranslate }}</h3>
                <p aioCardDescription class="leading-7">
                  {{ applet.summary | aioTranslate }}
                </p>
              </div>
              <div aioCardFooter>
                <a
                  aioBtn
                  variant="link"
                  routerLink="/applets"
                  [queryParams]="customerLinks.campaign()"
                  >{{ 'بیشتر بدانید' | aioTranslate }}</a
                >
              </div>
            </article>
          }
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
                'دانلود برای اندروید' | aioTranslate
              }}</a>
              <p class="text-xs text-muted-foreground">
                {{ 'نسخهٔ {0}' | aioTranslate: [android.version] }}
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
  protected readonly previews = [
    {
      slug: 'planner',
      title: 'برنامه‌ریز',
      alt: 'نمای برنامه‌ریز با سه کار و اولویت‌های متفاوت',
    },
    {
      slug: 'english',
      title: 'انگلیسی',
      alt: 'نمای یادگیری انگلیسی با مجموعهٔ واژه‌ها و کارت‌های آمادهٔ مرور',
    },
    {
      slug: 'health',
      title: 'سلامت',
      alt: 'نمای سلامت با کالری و وعدهٔ غذایی ثبت‌شدهٔ نمایشی',
    },
  ] as const;
  protected previewImage(slug: string): string {
    return `/product/${slug}-${this.locale.english() ? 'en' : 'fa'}.jpg`;
  }
  private readonly analytics = inject(GrowthAnalytics);
  constructor() {
    effect(() => {
      if (this.analytics.ready() && this.analytics.choice() === 'granted')
        void this.analytics.track('landing_view');
    });
  }
  protected readonly customerLinks = injectCustomerLinks();
  protected readonly applets = APPLETS;
  protected readonly android = ANDROID_RELEASE;
  protected readonly gettingStarted = [
    {
      label: 'قدم اول',
      title: 'حسابت را بساز',
      description: 'با ایمیل و رمز عبور ثبت‌نام کن. اگر حساب داری، وارد شو.',
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
