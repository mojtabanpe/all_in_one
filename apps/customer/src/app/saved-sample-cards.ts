import { Component, DestroyRef, inject, signal, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { EnglishApi } from '@all-in-one/applets/english-learning/web';
import { AioButton, AioTranslate } from '@all-in-one/ui';

@Component({
  imports: [AioButton, AioTranslate],
  template: `
    <p role="status">
      {{
        (failed() ? 'دسترسی به کارت‌ها ممکن نشد.' : 'در حال باز کردن کارت‌ها…')
          | aioTranslate
      }}
    </p>
    @if (failed()) {
      <button aioBtn (click)="open()">
        {{ 'تلاش دوباره' | aioTranslate }}
      </button>
    }
  `,
})
export class SavedSampleCards implements OnInit {
  private readonly api = inject(EnglishApi);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  protected readonly failed = signal(false);
  ngOnInit() {
    void this.open();
  }
  protected async open() {
    this.failed.set(false);
    try {
      const deck = await this.api.saveDailyLifeSample();
      if (!this.destroy.destroyed)
        await this.router.navigate(['/english/deck', deck.id], {
          replaceUrl: true,
          queryParamsHandling: 'preserve',
        });
    } catch {
      this.failed.set(true);
    }
  }
}
