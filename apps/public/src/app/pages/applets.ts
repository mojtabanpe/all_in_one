import { Component, inject } from '@angular/core';
import {
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
import { CUSTOMER_APP_URL } from '../customer-url';
import { APPLETS } from './applets-data';

@Component({
  selector: 'public-applets',
  imports: [AioButton, AioCardDirectives, AioIcon],
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
      <h1 class="text-2xl font-bold">اپلت‌ها</h1>
      @for (applet of applets; track applet.title) {
        <article aioCard>
          <div aioCardHeader>
            <h2 aioCardTitle class="flex items-center gap-2 text-lg">
              <aio-icon [name]="applet.icon" class="text-primary" />
              {{ applet.title }}
            </h2>
            <p aioCardDescription>{{ applet.summary }}</p>
          </div>
          <ul aioCardContent class="flex flex-col gap-2 text-sm">
            @for (f of applet.features; track f) {
              <li class="flex items-center gap-2">
                <aio-icon
                  name="lucideCircleCheck"
                  size="sm"
                  class="text-success"
                />{{ f }}
              </li>
            }
          </ul>
        </article>
      }
      <a aioBtn size="lg" class="self-start" [href]="customerUrl">شروع کنید</a>
    </div>
  `,
})
export class Applets {
  protected readonly customerUrl = inject(CUSTOMER_APP_URL);
  protected readonly applets = APPLETS;
}
