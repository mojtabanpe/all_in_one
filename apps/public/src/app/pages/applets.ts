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
import { injectCustomerLinks } from '../customer-url';
import { APPLETS } from './applets-data';

@Component({
  selector: 'public-applets',
  imports: [AioButton, AioCardDirectives, AioIcon, AioTranslate],
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
        <a
          aioCard
          class="hover:border-primary/40 focus-visible:ring-ring/50 transition-colors outline-none focus-visible:ring-3"
          [href]="customerLinks.signupFor(applet.goal)"
        >
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
          <div aioCardFooter>
            <span
              class="text-primary flex min-h-11 items-center gap-1 font-medium"
              >{{ 'شروع با {0}' | aioTranslate: [applet.title | aioTranslate] }}
              <aio-icon
                name="lucideChevronLeft"
                size="sm"
                class="ltr:-scale-x-100"
            /></span>
          </div>
        </a>
      }
      <a aioBtn size="lg" class="self-start" [href]="customerLinks.signup()">{{
        'ساخت حساب رایگان' | aioTranslate
      }}</a>
    </div>
  `,
})
export class Applets {
  protected readonly customerLinks = injectCustomerLinks();
  protected readonly applets = APPLETS;
}
