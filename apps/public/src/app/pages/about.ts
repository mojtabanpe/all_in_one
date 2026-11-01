import { Component } from '@angular/core';
import { AioCardDirectives, AioCardHeading } from '@all-in-one/ui';

@Component({
  selector: 'public-about',
  imports: [AioCardDirectives, AioCardHeading],
  template: `
    <section aioCard class="max-w-2xl">
      <div
        aioCardHeading
        title="درباره «Poshtetgarm»"
        [level]="1"
        titleClass="text-2xl"
      ></div>
      <div aioCardContent class="flex flex-col gap-3 leading-8">
        <p>
          «Poshtetgarm» چند ابزار کوچک و مستقل را کنار هم می‌گذارد تا زندگی
          روزمره ساده‌تر شود: برنامه‌ریز، یادگیری انگلیسی و سلامت.
        </p>
        <p>
          پیشنهادهای تغذیه و ورزش عمومی هستند و جای نظر پزشک یا متخصص تغذیه را
          نمی‌گیرند؛ اگر بیماری یا شرایط خاصی دارید، پیش از شروع رژیم یا برنامه
          ورزشی مشورت کنید.
        </p>
      </div>
    </section>
  `,
})
export class About {}
