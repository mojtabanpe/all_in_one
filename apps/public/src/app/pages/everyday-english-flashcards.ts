import { Component } from '@angular/core';
import { DAILY_LIFE_SAMPLE } from '@all-in-one/applets/english-learning/contracts';
import { injectCustomerLinks } from '../customer-url';
import { AioTranslate, AioCardDirectives, AioButton } from '@all-in-one/ui';
@Component({
  imports: [AioTranslate, AioCardDirectives, AioButton],
  template: `<article class="mx-auto grid max-w-3xl gap-5 leading-8">
    <h1 class="text-3xl font-bold">
      {{
        'مرور لغات انگلیسی با فلش‌کارت؛ پنج کارت برای یک صبح معمولی'
          | aioTranslate
      }}
    </h1>
    <p>
      {{
        'فرض کن می‌خواهی صبحت را به انگلیسی تعریف کنی. روی هر کارت فقط کلمه را ببین، یک جمله درباره خودت بگو، بعد کارت را باز کن و جمله‌ات را با مثال مقایسه کن.'
          | aioTranslate
      }}
    </p>
    @for (card of cards; track card.term) {
      <details aioCard class="p-4">
        <summary class="min-h-11 cursor-pointer font-semibold">
          <bdi lang="en">{{ card.term }}</bdi>
        </summary>
        <div dir="ltr" lang="en" class="grid gap-2 text-start">
          <p>{{ card.definition }}</p>
          <p>{{ card.example }}</p>
        </div>
      </details>
    }
    <h2 class="text-xl font-semibold">
      {{ 'یک دور بدون نگاه کردن' | aioTranslate }}
    </h2>
    <p>
      {{
        'کارت‌ها را ببند. چطور می‌گویی «ساعت هفت بیدار می‌شوم»؟ حالا بگو بعد از کار چه حسی داری. اگر واژه یادت آمد ولی جمله سخت بود، مثال همان کارت را بخوان و فقط ساعت یا فاعل جمله را عوض کن.'
          | aioTranslate
      }}
    </p>
    <p>
      {{
        'با دکمه زیر همین پنج کارت در مجموعه شخصی‌ات ذخیره می‌شوند. اگر قبلاً ذخیره‌شان کرده‌ای، همان مجموعه با سابقه مرور خودت باز می‌شود.'
          | aioTranslate
      }}
    </p>
    <a aioBtn class="justify-self-start" [href]="links.saveSample()">{{
      'ذخیره و مرور همین ۵ کارت' | aioTranslate
    }}</a>
  </article>`,
})
export class EnglishSample {
  protected readonly cards = DAILY_LIFE_SAMPLE;
  protected readonly links = injectCustomerLinks();
}
