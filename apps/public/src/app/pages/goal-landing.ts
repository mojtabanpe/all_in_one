import { Meta, Title } from '@angular/platform-browser';
import { NgOptimizedImage } from '@angular/common';
import { Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  AioButton,
  AioCardDirectives,
  AioLocale,
  AioTranslate,
} from '@all-in-one/ui';
import { GrowthAnalytics } from '@all-in-one/web/shared';
import { injectCustomerLinks } from '../customer-url';
import { GOAL_LANDINGS } from './goal-landing-data';

@Component({
  selector: 'public-goal-landing',
  imports: [
    RouterLink,
    NgOptimizedImage,
    AioButton,
    AioCardDirectives,
    AioTranslate,
  ],
  template: `
    <article class="flex flex-col gap-10 md:gap-14">
      <header class="grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div class="flex min-w-0 flex-col items-start gap-5">
          <h1
            class="max-w-2xl text-3xl leading-[1.55] font-bold text-balance sm:text-4xl lg:text-5xl"
          >
            {{ page().title | aioTranslate }}
          </h1>
          <p class="max-w-2xl text-lg leading-8 text-muted-foreground">
            {{ page().intro | aioTranslate }}
          </p>
          <a
            aioBtn
            size="lg"
            class="min-h-12 w-full whitespace-normal sm:w-auto"
            [href]="customerLinks.signup()"
            >{{ focus().action | aioTranslate }}</a
          >
          <p class="text-sm leading-7 text-muted-foreground">
            {{
              'حساب رایگان می‌سازی و مستقیم وارد همین بخش می‌شوی.'
                | aioTranslate
            }}
          </p>
          <a aioBtn variant="link" [href]="customerLinks.login()">{{
            'ورود به حساب' | aioTranslate
          }}</a>
        </div>
        <figure
          aioCard
          class="mx-auto w-full max-w-sm overflow-hidden p-3 sm:p-4"
        >
          <img
            [ngSrc]="image()"
            [alt]="page().imageAlt | aioTranslate"
            width="430"
            height="900"
            class="h-auto max-h-[30rem] w-full rounded-xl object-contain"
            priority
          />
        </figure>
      </header>
      @if (page().slug === 'daily-planner') {
        <a
          class="text-primary underline"
          routerLink="/weekly-plan-for-work"
          [queryParams]="customerLinks.campaign()"
          >{{
            'نمونه برنامه هفتگی برای افراد شاغل؛ جدول شنبه تا جمعه'
              | aioTranslate
          }}</a
        >
      }
      <section aioCard aria-labelledby="guide-faq-title">
        <div aioCardHeader>
          <h2 id="guide-faq-title" aioCardTitle>
            {{ 'پرسش‌های رایج دربارهٔ این مسیر' | aioTranslate }}
          </h2>
        </div>
        <dl aioCardContent class="flex flex-col gap-6">
          @for (question of page().questions; track question.title) {
            <div class="flex flex-col gap-2">
              <dt class="font-semibold leading-7">
                {{ question.title | aioTranslate }}
              </dt>
              <dd class="leading-8 text-muted-foreground">
                {{ question.body | aioTranslate }}
              </dd>
            </div>
          }
        </dl>
      </section>
      <div class="flex flex-col items-start gap-3">
        <a
          aioBtn
          size="lg"
          class="min-h-12 w-full whitespace-normal sm:w-auto"
          [href]="customerLinks.signup()"
          >{{ focus().action | aioTranslate }}</a
        >
        <p class="text-sm text-muted-foreground">
          {{ 'ثبت‌نام با شمارهٔ موبایل یا ایمیل' | aioTranslate }}
        </p>
      </div>
      <section
        class="flex flex-col items-start gap-4"
        aria-labelledby="guide-more-title"
      >
        <h2 id="guide-more-title" class="text-xl font-semibold">
          {{ 'مسیرهای دیگر را هم ببین' | aioTranslate }}
        </h2>
        <div class="flex flex-wrap gap-3">
          @for (guide of related(); track guide.slug) {
            <a
              aioBtn
              variant="outline"
              class="h-auto min-h-11 min-w-0 max-w-full whitespace-normal text-start"
              [routerLink]="'/' + guide.slug"
              [queryParams]="customerLinks.campaign()"
              >{{ guide.title | aioTranslate }}</a
            >
          }
          <a
            aioBtn
            variant="outline"
            routerLink="/applets"
            [queryParams]="customerLinks.campaign()"
            >{{ 'همهٔ امکانات برنامه' | aioTranslate }}</a
          >
        </div>
      </section>
    </article>
  `,
})
export class GoalLanding {
  protected readonly locale = inject(AioLocale);
  protected readonly customerLinks = injectCustomerLinks();
  protected readonly focus = computed(() => {
    const kind = this.page().image;
    return kind === 'english'
      ? {
          action: 'شروع رایگان انگلیسی',
        }
      : kind === 'planner'
        ? {
            action: 'شروع رایگان برنامه‌ریزی',
          }
        : {
            action: 'شروع رایگان پیگیری سلامت',
          };
  });
  private readonly route = inject(ActivatedRoute);
  private readonly data = toSignal(this.route.data, {
    initialValue: this.route.snapshot.data,
  });
  protected readonly page = computed(
    () => this.data()['guide'] as (typeof GOAL_LANDINGS)[number],
  );
  protected readonly image = computed(
    () =>
      `/product/${this.page().image}-${this.locale.english() ? 'en' : 'fa'}.${this.page().image === 'english' ? 'webp' : 'jpg'}`,
  );
  protected readonly related = computed(() =>
    GOAL_LANDINGS.filter((guide) => guide.slug !== this.page().slug),
  );
  private readonly analytics = inject(GrowthAnalytics);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);

  constructor() {
    effect(() => {
      const page = this.page();
      const title = this.locale.text(page.seoTitle);
      const description = this.locale.text(page.description);
      this.title.setTitle(title);
      this.meta.updateTag({ name: 'description', content: description });
      this.meta.updateTag({ property: 'og:title', content: title });
      this.meta.updateTag({ property: 'og:description', content: description });
      this.meta.updateTag({ name: 'twitter:title', content: title });
      this.meta.updateTag({
        name: 'twitter:description',
        content: description,
      });
    });
    effect(() => {
      if (this.analytics.ready() && this.analytics.choice() === 'granted')
        void this.analytics.track('landing_view');
    });
  }
}
