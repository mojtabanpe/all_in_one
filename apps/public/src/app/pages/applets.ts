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
  imports: [AioButton, AioCardDirectives, AioIcon, AioTranslate],
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
