import { RouterLink } from '@angular/router';
import { GOAL_LANDINGS } from './goal-landing-data';
import { Component } from '@angular/core';
import {
  AioTranslate,
  AioButton,
  AioCardDirectives,
  AioIcon,
  provideIcons,
} from '@all-in-one/ui';
import {
  lucideCalendarCheck,
  lucideCircleCheck,
  lucideHeartPulse,
  lucideLanguages,
} from '@ng-icons/lucide';
import { injectCustomerLinks } from '../customer-url';
import { APPLETS } from './applets-data';

@Component({
  selector: 'public-applets',
  imports: [RouterLink, AioButton, AioCardDirectives, AioIcon, AioTranslate],
  providers: [
    provideIcons({
      lucideCalendarCheck,
      lucideCircleCheck,
      lucideHeartPulse,
      lucideLanguages,
    }),
  ],
  template: `
    <div class="flex flex-col gap-4">
      <h1 class="text-2xl font-bold">{{ 'اپلت‌ها' | aioTranslate }}</h1>
      @for (applet of applets; track applet.title) {
        <article aioCard>
          <div aioCardHeader>
            <h2 aioCardTitle class="flex items-center gap-2 text-lg">
              <aio-icon [name]="applet.icon" class="text-primary" />
              {{ applet.title | aioTranslate }}
            </h2>
            <p aioCardDescription>{{ applet.summary | aioTranslate }}</p>
          </div>
          <ul aioCardContent class="flex flex-col gap-2 text-sm">
            @for (f of applet.features; track f) {
              <li class="flex items-center gap-2">
                <aio-icon
                  name="lucideCircleCheck"
                  size="sm"
                  class="text-success"
                />{{ f | aioTranslate }}
              </li>
            }
          </ul>
        </article>
      }
      <section class="flex flex-col gap-4" aria-labelledby="start-guides-title">
        <h2 id="start-guides-title" class="text-xl font-semibold">
          {{ 'راهنمای شروع با Poshtetgarm' | aioTranslate }}
        </h2>
        <div class="flex flex-wrap gap-3">
          @for (guide of guides; track guide.slug) {
            <a
              aioBtn
              variant="outline"
              class="h-auto min-h-11 min-w-0 max-w-full whitespace-normal text-start"
              [routerLink]="'/' + guide.slug"
              [queryParams]="customerLinks.campaign()"
              >{{ guide.title | aioTranslate }}</a
            >
          }
        </div>
      </section>
      <a aioBtn size="lg" class="self-start" [href]="customerLinks.signup()">{{
        'ساخت حساب رایگان' | aioTranslate
      }}</a>
    </div>
  `,
})
export class Applets {
  protected readonly customerLinks = injectCustomerLinks();
  protected readonly applets = APPLETS;
  protected readonly guides = GOAL_LANDINGS;
}
