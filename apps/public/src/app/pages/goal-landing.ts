import { Meta, Title } from '@angular/platform-browser';
import { DOCUMENT } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  AioButton,
  AioCardDirectives,
  AioCardHeading,
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
    AioButton,
    AioCardDirectives,
    AioCardHeading,
    AioTranslate,
  ],
  template: `
    <article class="flex flex-col gap-10 md:gap-14">
      <header class="grid items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div class="flex min-w-0 flex-col items-start gap-5">
          <p class="text-sm font-medium text-muted-foreground">
            {{ 'راهنمای شروع با Poshtetgarm' | aioTranslate }}
          </p>
          <h1 class="aio-page-title max-w-3xl">
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
            >{{ 'ساخت حساب رایگان' | aioTranslate }}</a
          >
          <a aioBtn variant="link" [href]="customerLinks.login">{{
            'ورود به حساب' | aioTranslate
          }}</a>
        </div>
        <figure aioCard class="mx-auto w-full max-w-sm overflow-hidden p-4">
          <img
            [src]="image()"
            [alt]="page().imageAlt | aioTranslate"
            width="430"
            height="900"
            class="h-[26rem] w-full rounded-xl object-contain"
            fetchpriority="high"
          />
          <figcaption
            class="mt-3 text-center text-sm leading-6 text-muted-foreground"
          >
            {{ 'تصویر واقعی برنامه با داده‌های نمونه' | aioTranslate }}
          </figcaption>
        </figure>
      </header>
      @if (page().slug === 'daily-planner') {
        <section aioCard aria-labelledby="daily-plan-template">
          <div aioCardHeader>
            <h2 id="daily-plan-template" aioCardTitle>
              {{ 'الگوی برنامهٔ امروز' | aioTranslate }}
            </h2>
            <p aioCardDescription>
              {{
                'الگو را در یادداشت‌هایت کپی کن و جاهای خالی را پر کن.'
                  | aioTranslate
              }}
            </p>
          </div>
          <div aioCardContent>
            <pre
              class="select-text whitespace-pre-wrap wrap-break-word font-sans leading-8"
              >{{ dailyPlanTemplate() }}</pre>
          </div>
          <div aioCardFooter class="flex flex-wrap gap-3">
            <button
              aioBtn
              variant="outline"
              type="button"
              class="min-h-11"
              (click)="copyDailyPlan()"
            >
              {{ 'کپی الگو' | aioTranslate }}
            </button>
            <p role="status" class="text-sm text-muted-foreground">
              {{ copyStatus() | aioTranslate }}
            </p>
          </div>
        </section>
      }
      <section aria-labelledby="guide-steps-title" class="flex flex-col gap-5">
        <h2 id="guide-steps-title" class="text-xl font-semibold">
          {{ 'برای شروع، این سه قدم را بردار' | aioTranslate }}
        </h2>
        <ol class="grid gap-4 lg:grid-cols-3">
          @for (step of page().steps; track step.title; let i = $index) {
            <li aioCard>
              <div aioCardHeader>
                <p class="mb-2 text-sm text-muted-foreground">
                  {{ 'قدم {0}' | aioTranslate: [locale.number(i + 1)] }}
                </p>
                <div
                  aioCardHeading
                  [title]="step.title | aioTranslate"
                  [description]="step.body | aioTranslate"
                  [level]="3"
                  descriptionClass="leading-7"
                ></div>
              </div>
            </li>
          }
        </ol>
      </section>
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
  private readonly document = inject(DOCUMENT);
  protected readonly copyStatus = signal('');
  protected readonly dailyPlanTemplate = computed(() =>
    [
      this.locale.text('مهم‌ترین کار امروز: …'),
      '',
      this.locale.text('دو کار کوچک:'),
      '– …',
      '– …',
      '',
      this.locale.text('اولین قدم فردا: …'),
    ].join('\n'),
  );
  protected readonly customerLinks = injectCustomerLinks();
  private readonly route = inject(ActivatedRoute);
  private readonly data = toSignal(this.route.data, {
    initialValue: this.route.snapshot.data,
  });
  protected readonly page = computed(
    () => this.data()['guide'] as (typeof GOAL_LANDINGS)[number],
  );
  protected readonly image = computed(
    () =>
      `/product/${this.page().image}-${this.locale.english() ? 'en' : 'fa'}.jpg`,
  );
  protected readonly related = computed(() =>
    GOAL_LANDINGS.filter((guide) => guide.slug !== this.page().slug),
  );
  private readonly analytics = inject(GrowthAnalytics);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);

  protected async copyDailyPlan(): Promise<void> {
    this.copyStatus.set('');
    try {
      const clipboard = this.document.defaultView?.navigator.clipboard;
      if (clipboard) {
        await clipboard.writeText(this.dailyPlanTemplate());
        this.copyStatus.set('الگو کپی شد.');
        return;
      }
    } catch {
      // The preview stays selectable when clipboard access is blocked.
    }
    this.copyStatus.set('متن الگو را انتخاب کن و دستی کپی کن.');
  }

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
