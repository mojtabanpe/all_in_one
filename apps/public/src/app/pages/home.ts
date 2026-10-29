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
    <section class="flex flex-col items-start gap-5 py-10 md:py-16">
      <span class="glass rounded-full px-3 py-1 text-xs font-medium"
        >رایگان · فارسی · روی گوشی و کامپیوتر</span
      >
      <h1 class="text-4xl leading-tight font-bold md:text-5xl">
        برنامه‌ریزی، انگلیسی و سلامت؛
        <span class="text-primary">همه در یک جا</span>
      </h1>
      <p class="text-muted-foreground max-w-xl text-lg">
        کارهای روزت را بچین، هر روز چند واژه انگلیسی مرور کن و ورزش و تغذیه‌ات
        را بسنج.
      </p>
      <div class="flex flex-wrap gap-2">
        <a aioBtn size="lg" [href]="customerUrl">شروع کنید</a>
        <a aioBtn size="lg" variant="outline" routerLink="/applets"
          >آشنایی با اپلت‌ها</a
        >
      </div>
    </section>

    <section class="grid gap-3 md:grid-cols-3">
      @for (applet of applets; track applet.title) {
        <article aioCard>
          <div aioCardHeader>
            <aio-icon [name]="applet.icon" size="lg" class="text-primary" />
            <h2 aioCardTitle class="text-lg">{{ applet.title }}</h2>
            <p aioCardDescription>{{ applet.summary }}</p>
          </div>
        </article>
      }
    </section>
  `,
})
export class Home {
  protected readonly customerUrl = inject(CUSTOMER_APP_URL);
  protected readonly applets = APPLETS;
}
