import { effect, Injectable, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { type RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { AioLocale } from './locale';

/**
 * Route titles are written in Persian (`title: 'سلامت'`); this shows them in the app language and re-renders the
 * tab title when the language or the lazy message table changes. Provide it with
 * `{ provide: TitleStrategy, useExisting: AioTitleStrategy }`.
 */
@Injectable({ providedIn: 'root' })
export class AioTitleStrategy extends TitleStrategy {
  private readonly locale = inject(AioLocale);
  private readonly title = inject(Title);
  private readonly route = signal<string | undefined>(undefined);

  constructor() {
    super();
    effect(() => {
      const raw = this.route();
      const text = raw ? this.locale.text(raw) : 'Poshtetgarm';
      // AioLocale resets the tab to the brand name when the language changes; set ours after it.
      queueMicrotask(() => this.title.setTitle(text));
    });
  }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    this.route.set(this.buildTitle(snapshot));
  }
}
