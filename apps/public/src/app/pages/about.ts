import { Component } from '@angular/core';
import { AioCardDirectives } from '@all-in-one/ui';

@Component({
  selector: 'public-about',
  imports: [AioCardDirectives],
  template: `
    <section aioCard class="max-w-2xl">
      <div aioCardHeader>
        <h1 aioCardTitle class="text-2xl">درباره «همه در یک»</h1>
      </div>
      <div aioCardContent class="flex flex-col gap-3 leading-8">
        <p>
          «همه در یک» چند ابزار کوچک و مستقل را کنار هم می‌گذارد تا زندگی روزمره
          ساده‌تر شود: برنامه‌ریز، یادگیری انگلیسی و سلامت.
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
