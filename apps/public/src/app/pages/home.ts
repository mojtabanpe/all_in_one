import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  AioButton,
  AioCardDirectives,
  AioIcon,
  provideIcons,
} from '@all-in-one/ui';
import {
  lucideCalendarCheck,
  lucideHeartPulse,
  lucideLanguages,
} from '@ng-icons/lucide';
import { CUSTOMER_APP_URL } from '../customer-url';
import { APPLETS } from './applets-data';

@Component({
  selector: 'public-home',
  imports: [AioButton, AioCardDirectives, AioIcon, RouterLink],
  providers: [
    provideIcons({ lucideCalendarCheck, lucideHeartPulse, lucideLanguages }),
  ],
  template: `
    <div class="flex flex-col gap-10 md:gap-16">
      <section
        class="grid items-center gap-10 py-4 md:grid-cols-[1.2fr_1fr] md:py-10"
      >
        <div class="flex flex-col items-start gap-6">
          <span
            class="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 text-xs font-medium"
            ><span class="size-1.5 rounded-full bg-primary"></span>یک فضای شخصی،
            برای زندگی روزمره</span
          >
          <h1
            class="text-4xl leading-[1.55] font-bold tracking-tight md:text-5xl"
          >
            روزهای شلوغ.<br /><span class="text-primary">یک جای خلوت.</span>
          </h1>
          <p
            class="text-muted-foreground max-w-lg text-base leading-8 md:text-lg"
          >
            برنامه روزت، واژه‌ای که یاد می‌گیری و وقتی که برای خودت می‌گذاری.
            همه کنار هم، با ریتم خودت.
          </p>
          <div class="flex flex-wrap gap-3">
            <a aioBtn size="lg" [href]="customerUrl">فضای خودت را بساز</a
            ><a aioBtn size="lg" variant="outline" routerLink="/applets"
              >کشف امکانات</a
            >
          </div>
          <p class="text-muted-foreground text-xs">
            فارسی و راست‌به‌چپ، روی موبایل و کامپیوتر
          </p>
        </div>
        <div class="aio-hero flex flex-col gap-6">
          <span class="aio-hero-caption">همه در یک، در یک نگاه</span>
          <h2 class="text-2xl leading-relaxed font-bold">
            برای هر بخش از روزت،<br />یک جای درست.
          </h2>
          @for (applet of applets; track applet.title) {
            <div class="flex items-start gap-4 border-t border-white/15 pt-5">
              <span
                class="flex size-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/5"
                ><aio-icon [name]="applet.icon" size="sm"
              /></span>
              <div>
                <h3 class="font-semibold">{{ applet.title }}</h3>
                <p class="aio-hero-caption mt-1">{{ applet.summary }}</p>
              </div>
            </div>
          }
        </div>
      </section>
      <section class="flex flex-col gap-5">
        <div>
          <p class="aio-eyebrow">کمتر پراکنده، بیشتر متمرکز</p>
          <h2 class="aio-page-title">سه مسیر، یک همراه.</h2>
        </div>
        <div class="grid gap-4 md:grid-cols-3">
          @for (applet of applets; track applet.title) {
            <article aioCard>
              <div aioCardHeader>
                <span class="aio-module-icon mb-4"
                  ><aio-icon [name]="applet.icon"
                /></span>
                <h3 aioCardTitle>{{ applet.title }}</h3>
                <p aioCardDescription class="leading-7">{{ applet.summary }}</p>
              </div>
              <div aioCardFooter>
                <a aioBtn variant="link" routerLink="/applets">بیشتر بدانید</a>
              </div>
            </article>
          }
        </div>
      </section>
      <section
        class="flex flex-wrap items-center justify-between gap-6 border-t border-border py-8"
      >
        <div>
          <h2 class="text-xl font-bold">از یک قدم کوچک شروع کن.</h2>
          <p class="text-muted-foreground mt-2 text-sm">
            برنامه امروزت را بچین. بقیه‌اش به‌مرور شکل می‌گیرد.
          </p>
        </div>
        <a aioBtn size="lg" [href]="customerUrl">شروع کنید</a>
      </section>
    </div>
  `,
})
export class Home {
  protected readonly customerUrl = inject(CUSTOMER_APP_URL);
  protected readonly applets = APPLETS;
}
