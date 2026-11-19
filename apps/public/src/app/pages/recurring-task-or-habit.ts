import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AioTranslate } from '@all-in-one/ui';
@Component({
  imports: [AioTranslate, RouterLink],
  template: `<article class="mx-auto grid max-w-3xl gap-5 leading-8">
    <h1 class="text-3xl font-bold">
      {{
        'فرق کار تکرارشونده و عادت؛ قبض، کلاس زبان یا پیاده‌روی؟' | aioTranslate
      }}
    </h1>
    <p>
      {{
        'اول ببین آخر هفته چه چیزی می‌خواهی بدانی. برای قبض می‌پرسی «پرداخت شد؟» برای پیاده‌روی می‌پرسی «این هفته چند روز راه رفتم؟» همین دو سؤال کمک می‌کنند جای درست هر مورد را پیدا کنی.'
          | aioTranslate
      }}
    </p>
    <h2 class="text-xl font-semibold">
      {{ 'قبض اینترنت؛ کار تکرارشونده' | aioTranslate }}
    </h2>
    <p>
      {{
        'اگر موعد پرداخت پنجم هر ماه است، «پرداخت قبض اینترنت» را برای پنجم ثبت کن و تکرار ماهانه بگذار. وقتی پرداخت شد همان نوبت را تیک بزن.'
          | aioTranslate
      }}
    </p>
    <h2 class="text-xl font-semibold">
      {{ 'کلاس زبان؛ قرار هفتگی' | aioTranslate }}
    </h2>
    <p>
      {{
        'کلاس چهارشنبه ساعت هفت یک کار هفتگی است. اگر تمرین مکالمه بین کلاس‌ها هم برایت مهم است، «ده دقیقه بلند حرف زدن» را جداگانه به‌عنوان عادت ثبت کن. آن‌وقت حضور در کلاس و روزهای تمرین را جدا می‌بینی.'
          | aioTranslate
      }}
    </p>
    <h2 class="text-xl font-semibold">
      {{ 'پیاده‌روی؛ ثبت روزهایی که انجامش دادی' | aioTranslate }}
    </h2>
    <p>
      {{
        'اگر هدفت سه روز پیاده‌روی در هفته است، برای هر روزی که واقعاً راه رفتی یک بار ثبت کن. اگر پنجشنبه با دوستی برای پیاده‌روی قرار داری، خود قرار را هم با ساعت در برنامه‌ریز بگذار.'
          | aioTranslate
      }}
    </p>
    <a routerLink="/habit-building" class="text-primary underline">{{
      'دیدن بخش ثبت عادت‌ها' | aioTranslate
    }}</a>
  </article>`,
})
export class TaskOrHabit {}
