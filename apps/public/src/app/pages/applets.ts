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
  lucideChevronLeft,
  lucideCircleCheck,
  lucideHeartPulse,
  lucideLanguages,
} from '@ng-icons/lucide';
import { RouterLink } from '@angular/router';
import { injectCustomerLinks } from '../customer-url';
import { GOAL_LANDINGS } from './goal-landing-data';
import { APPLETS } from './applets-data';

@Component({
  selector: 'public-applets',
  imports: [RouterLink, AioButton, AioCardDirectives, AioIcon, AioTranslate],
  providers: [
    provideIcons({
      lucideCalendarCheck,
      lucideChevronLeft,
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
          <div aioCardFooter class="flex flex-wrap gap-4">
            @for (guide of guides; track guide.slug) {
              @if (guide.image === applet.goal) {
                <a
                  class="inline-flex min-h-11 items-center underline"
                  [routerLink]="'/' + guide.slug"
                  [queryParams]="customerLinks.campaign()"
                  >{{ guide.title | aioTranslate }}</a
                >
              }
            }
            <a
              [href]="customerLinks.signupFor(applet.goal)"
              class="text-primary flex min-h-11 items-center gap-1 font-medium"
              >{{ 'شروع با {0}' | aioTranslate: [applet.title | aioTranslate] }}
              <aio-icon
                name="lucideChevronLeft"
                size="sm"
                class="ltr:-scale-x-100"
            /></a>
          </div>
        </article>
      }
      <a aioBtn size="lg" class="self-start" [href]="customerLinks.signup()">{{
        'ساخت حساب رایگان' | aioTranslate
      }}</a>
    </div>
  `,
})
export class Applets {
  protected readonly customerLinks = injectCustomerLinks();
  protected readonly guides = GOAL_LANDINGS;
  protected readonly applets = APPLETS;
}
