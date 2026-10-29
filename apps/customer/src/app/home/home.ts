import { Component } from '@angular/core';
import { ApiStatus } from '@all-in-one/web/shared';
import {
  AioButton,
  AioCardDirectives,
  AioConfirm,
  aioToast,
} from '@all-in-one/ui';
import { inject } from '@angular/core';

@Component({
  selector: 'customer-home',
  imports: [ApiStatus, AioButton, AioCardDirectives],
  template: `
    <div class="flex flex-col gap-4">
      <section aioCard>
        <div aioCardHeader>
          <h1 aioCardTitle class="text-xl">سلام 👋</h1>
          <p aioCardDescription>
            برنامه‌ریز، یادگیری انگلیسی و سلامت؛ همه در یک جا.
          </p>
        </div>
        <div aioCardContent class="flex flex-wrap gap-2">
          <button aioBtn (click)="toast()">پیام کوتاه</button>
          <button aioBtn variant="outline" (click)="ask()">پرسش تأیید</button>
        </div>
      </section>
      <web-api-status />
    </div>
  `,
})
export class Home {
  private readonly confirm = inject(AioConfirm);

  protected toast() {
    aioToast.success('ذخیره شد');
  }

  protected async ask() {
    const ok = await this.confirm.ask({
      title: 'این مورد حذف شود؟',
      description: 'این کار برگشت‌پذیر نیست.',
      confirmText: 'حذف',
      destructive: true,
    });
    aioToast.info(ok ? 'حذف شد' : 'لغو شد');
  }
}
