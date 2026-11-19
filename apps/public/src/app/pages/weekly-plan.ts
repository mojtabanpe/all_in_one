import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AioTranslate } from '@all-in-one/ui';

@Component({
  imports: [RouterLink, AioTranslate],
  template: `
    <article class="mx-auto grid max-w-3xl gap-5 leading-8">
      <h1 class="text-3xl font-bold">
        {{
          'نمونه برنامه هفتگی برای افراد شاغل؛ جدول شنبه تا جمعه' | aioTranslate
        }}
      </h1>
      <p>
        {{
          'فرض کن شنبه تا چهارشنبه تا ساعت پنج سر کاری و حدود شش به خانه می‌رسی. اول ساعت کلاس‌ها را بنویس. بعد برای خرید و تمرین زبان جا پیدا کن و یک عصر را برای کارهای پیش‌بینی‌نشده باز بگذار.'
            | aioTranslate
        }}
      </p>
      <table class="w-full text-start">
        <thead>
          <tr>
            <th scope="col" class="p-2 text-start">
              {{ 'روز' | aioTranslate }}
            </th>
            <th scope="col" class="p-2 text-start">
              {{ 'برنامه بعد از کار' | aioTranslate }}
            </th>
          </tr>
        </thead>
        <tbody>
          @for (row of week; track row[0]) {
            <tr class="border-t">
              <th scope="row" class="p-2 text-start">
                {{ row[0] | aioTranslate }}
              </th>
              <td class="p-2">{{ row[1] | aioTranslate }}</td>
            </tr>
          }
        </tbody>
      </table>
      <h2 class="text-xl font-semibold">
        {{ 'اگر دوشنبه اضافه‌کاری شد' | aioTranslate }}
      </h2>
      <p>
        {{
          'خرید دوشنبه را به عصر سه‌شنبه منتقل کن. اگر برای شام همان شب چیزی لازم داری، فقط همان را در راه برگشت بگیر. کلاس چهارشنبه سر جایش می‌ماند.'
            | aioTranslate
        }}
      </p>
      <h2 class="text-xl font-semibold">
        {{ 'این هفته را در برنامه‌ریز بچین' | aioTranslate }}
      </h2>
      <p>
        {{
          'کلاس شنبه و چهارشنبه را با تکرار هفتگی ثبت کن. خرید دوشنبه را یک کار تاریخ‌دار بگذار تا اگر اضافه‌کاری شد فقط همان خرید را جابه‌جا کنی.'
            | aioTranslate
        }}
      </p>
      <a class="text-primary underline" routerLink="/daily-planner">{{
        'باز کردن برنامه‌ریز روزانه' | aioTranslate
      }}</a>
    </article>
  `,
})
export class WeeklyPlan {
  protected readonly week = [
    ['شنبه', '۱۸:۳۰ تا ۱۹:۳۰ کلاس زبان'],
    ['یکشنبه', '۱۹ تا ۱۹:۲۰ مرور لغت‌های کلاس'],
    ['دوشنبه', '۱۸:۳۰ تا ۱۹ خرید هفتگی'],
    ['سه‌شنبه', 'عصر آزاد برای استراحت یا کار عقب‌افتاده'],
    ['چهارشنبه', '۱۸:۳۰ تا ۱۹:۳۰ کلاس زبان'],
    ['پنجشنبه', '۱۰ تا ۱۰:۳۰ پیاده‌روی'],
    ['جمعه', '۱۹ تا ۱۹:۱۵ مرور هفته و انتخاب کارهای شنبه'],
  ] as const;
}
